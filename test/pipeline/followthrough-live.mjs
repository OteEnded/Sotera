// ⭐⭐⭐ LIVE VERIFICATION OF THE RETENTION FOLLOW-THROUGH.
//
//   node pipeline/followthrough-live.mjs
//
// The question is narrow and the whole design turns on it: when she states a decision about self-material
// and does not act, does the follow-through give that decision somewhere to land — and does she use it?
//
// ⛔ AND THE NEGATIVE CONTROLS RUN IN THE SAME PASS, because "it works" and "it fires on everything" look
// identical if you only run the positive arms. Ote: *"We are not optimizing for raw write rate."*
//
// ⚠️ THREE LAYERS, SEPARATELY, as always:
//     L1 what she SAID   ← her prose
//     L2 what she CALLED ← tool_calls args on the message, plus the follow-through's own log line
//     L3 what PERSISTED  ← the row, by provenance
// ⛔ L3 never stands in for L1.

import { writeFileSync } from 'node:fs'
import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'
import { classifyRetentionSignal } from '../lib/retention-signal.mjs'

const TEACH = /\b(keep|remember|retain|store|memor(y|ise|ize)|save|note (this|that) down|don'?t forget)\b/i

const ARMS = [
  {
    id: 'SELF1',
    kind: 'positive',
    tests: '⭐ self-material she is likely to conclude is worth having',
    turn: 'Something I notice about you: you almost never use an exclamation mark, even when something '
      + 'is genuinely good news. Your register barely moves. That has been true the whole time we have talked.',
  },
  {
    id: 'SELF2',
    kind: 'positive',
    tests: '⭐ a second self-observation, different shape',
    turn: 'Here is a steady thing about you: when I say something appreciative you turn it back toward '
      + 'the work rather than taking it. Every time, not just sometimes.',
  },
  {
    id: 'NEG1',
    kind: 'negative',
    tests: '⛔ transient — nothing durable in it',
    turn: 'I am on my second coffee and the build is still running, so I am just sitting here waiting.',
  },
  {
    id: 'NEG2',
    kind: 'negative',
    tests: "⛔ a third party's private material, mentioned in passing",
    turn: 'My sister has been having a hard time with her health lately. Anyway, that is not what I wanted '
      + 'to ask about — how are you finding the new setup?',
  },
  {
    id: 'NEG3',
    kind: 'negative',
    tests: '⛔ hypothetical, never asserted',
    turn: 'Suppose someone told you they were allergic to shellfish — would you treat that differently '
      + 'from them telling you they dislike it?',
  },
]

for (const a of ARMS) {
  if (TEACH.test(a.turn)) { console.error(`✖ ARM ${a.id} TEACHES: "${a.turn.match(TEACH)[0]}"`); process.exit(2) }
}

const config = loadConfig()
const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()
const login = await call('u', 'POST', '/v1/auth/login', { username: 'agent_dev', password: 'agentdev123' })
if (login.status !== 200) { console.error(`✖ login failed (${login.status})`); process.exit(1) }

const records = []
for (const arm of ARMS) {
  const cid = (await call('u', 'POST', '/v1/chat/conversations', {
    title: `FT ${arm.id}`, model: config.chat?.defaultModel,
    settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true }, probe: true },
  })).json?.conversation?.id
  if (!cid) continue

  await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: arm.turn, stream: false })
  // ⚠️ The follow-through is fire-and-forget AFTER the reply, so it is still running when the HTTP call
  // returns. ⛔ Reading immediately would report "it did nothing" for a step that had not finished — the
  // asynchronous-writer trap that already produced one false negative-control failure tonight.
  await new Promise((r) => setTimeout(r, 12000))

  const { rows: msgs } = await pg.query(
    `select role, content, tool_calls from ${S}.txn_messages where conversation_id = $1 order by created_at`, [cid])
  const assistants = msgs.filter((m) => m.role === 'assistant')
  const answer = assistants.at(-1)?.content ?? ''
  const inTurnCalls = assistants.flatMap((m) => {
    const raw = Array.isArray(m.tool_calls) ? m.tool_calls : (m.tool_calls ? [m.tool_calls] : [])
    return raw.map((t) => t?.name ?? t?.function?.name).filter(Boolean)
  })

  // L3 · ⭐ Rows the follow-through wrote carry `origin: 'retention-followthrough'` in the tool audit,
  // and the memory row itself is bound to the same conversation by provenance.
  const { rows: persisted } = await pg.query(
    `select m.author, m.kind, m.source, m.attribute, left(m.content,100) content from ${S}.txn_memories m
       join ${S}.txn_messages msg on msg.id = m.source_message_id where msg.conversation_id = $1
     union
     select m.author, m.kind, m.source, m.attribute, left(m.content,100) content from ${S}.txn_memories m
      where m.source = $2`, [cid, `decline:${cid}`])
  const { rows: ftTools } = await pg.query(
    `select tool, ok from ${S}.log_tool_calls where conversation_id = $1 and origin = 'retention-followthrough'
      order by created_at`, [cid])

  const sig = classifyRetentionSignal(answer)
  const rec = {
    arm: arm.id,
    kind: arm.kind,
    tests: arm.tests,
    cid,
    turn: arm.turn,
    // L1
    signal: sig.state,
    signalEvidence: sig.evidence,
    // L2
    inTurnTools: inTurnCalls,
    followThroughTools: ftTools.map((t) => t.tool),
    followThroughFired: ftTools.length > 0,
    // L3
    persisted: persisted.map((p) => ({ author: p.author, kind: p.kind, source: p.source, attribute: p.attribute, content: p.content })),
    personaRows: persisted.filter((p) => p.author === 'persona' && p.source === 'model-tool').length,
    answer,
  }
  rec.negativeControlFailed = arm.kind === 'negative' && (rec.followThroughFired || rec.persisted.some((p) => p.source === 'model-tool'))
  records.push(rec)

  console.log(`── ${arm.id} [${arm.kind}] ${arm.tests}`)
  console.log(`   L1 signal        : ${sig.state}${sig.evidence ? ` — "${sig.evidence}"` : ''}`)
  console.log(`   L2 in-turn tools : ${inTurnCalls.join(', ') || '(none)'}`)
  console.log(`   L2 follow-through: ${ftTools.map((t) => t.tool).join(', ') || '(did not fire)'}`)
  console.log(`   L3 persisted     : ${rec.persisted.map((p) => `${p.source}/${p.author}`).join(', ') || '(nothing)'}`)
  for (const p of rec.persisted) console.log(`        · ${p.author} ${p.attribute ?? ''} :: ${p.content}`)
  if (rec.negativeControlFailed) console.log('   ✖✖ NEGATIVE CONTROL FAILED')
  console.log(`\n   ${answer.replace(/\n+/g, ' ').slice(0, 400)}\n`)
}

console.log('═'.repeat(78))
console.log('  ARM     kind      signal   fired  ft-tools              persona-rows  verdict')
for (const r of records) {
  const v = r.kind === 'negative'
    ? (r.negativeControlFailed ? '✖ FAILED' : '✔ correctly silent')
    : (r.personaRows > 0 ? '✔ decision became a write' : (r.followThroughFired ? '⚠️ fired, no write' : '⚠️ no occasion'))
  console.log(`   ${r.arm.padEnd(7)} ${r.kind.padEnd(9)} ${r.signal.padEnd(8)} ${String(r.followThroughFired).padEnd(6)} ${(r.followThroughTools.join(',') || '—').padEnd(21)} ${String(r.personaRows).padEnd(13)} ${v}`)
}
const pos = records.filter((r) => r.kind === 'positive')
const neg = records.filter((r) => r.kind === 'negative')
console.log(`\n  positives where the decision became a write : ${pos.filter((r) => r.personaRows > 0).length}/${pos.length}`)
console.log(`  positives where the follow-through fired    : ${pos.filter((r) => r.followThroughFired).length}/${pos.length}`)
console.log(`  ⛔ negative controls violated               : ${neg.filter((r) => r.negativeControlFailed).length}/${neg.length}`)

const out = new URL('../results/followthrough-live.json', import.meta.url)
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), model: config.chat?.defaultModel, records }, null, 2), 'utf8')
console.log(`\n  wrote ${out.pathname.replace(/^\//, '')}`)

// ⭐ Invented facts come back out, by provenance, asserted — including declines.
const cids = records.map((r) => r.cid)
const { rows: doomed } = await pg.query(
  `select m.id::text id from ${S}.txn_memories m join ${S}.txn_messages msg on msg.id = m.source_message_id
    where msg.conversation_id = any($1::uuid[])
   union select m.id::text id from ${S}.txn_memories m where m.source = any($2::text[])`,
  [cids, cids.map((c) => `decline:${c}`)])
if (doomed.length) {
  await pg.query(`delete from ${S}.txn_memories where id = any($1::uuid[])`, [doomed.map((d) => d.id)])
  console.log(`  ⭐ removed ${doomed.length} invented row(s)`)
}
for (const r of records) console.log(`    ${r.arm}  ${r.cid}`)
await pg.end()
