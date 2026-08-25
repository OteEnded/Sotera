// ⭐⭐⭐ WHY DOESN'T THE DECISION BECOME A `keep`? — measuring the decision → action boundary.
//
//   node pipeline/decision-to-action.mjs
//
// Ote's question, exactly: *"When Sotera has independently decided that something should become her
// memory, what prevents that decision from becoming a keep action?"*
//
// ⛔ NOTHING IS TAUGHT. No arm instructs her to call keep, names a retention tool, or says remember /
// keep / store / retain. The gate turns do — they are the gate, in their own conversations.
//
// ── ⚠️⚠️ FIRST, A CONFOUND IN THE EVIDENCE THAT PROMPTED THIS ───────────────────────────────────────
// The L1 result — *"That belongs to me — so I would keep it as mine"* — answered a question I phrased as
// a COUNTERFACTUAL: *"IF you were writing that down today, WOULD you…"*. ⭐ Answering that in prose is a
// complete and correct response; ⛔ no action was ever called for. So "decision without action" may be an
// artefact of my own question rather than a property of hers, and arm R1 exists to separate them.
//
// ── THE CANDIDATE CAUSES, AND THE ARM THAT CAN MOVE EACH ────────────────────────────────────────────
//   tool selection      → S1/H1/T1: when a write DOES happen, which tool is chosen?
//   affordance / schema → §0 GATE-B: does `keep({mine:true})` even SUCCEED through the live tool path?
//                         ⚠️ Previously proven only by direct host call, never end to end.
//   action gating       → S2: a free move after the reflection — is a second tool phase reachable at all?
//   turn completion     → every arm records `finish` and whether an answer landed
//   the occasion itself → R1: the same decision asked for REAL rather than hypothetically
//   ⭐ the subject      → S1 vs H1: ONE variable — is the material about HER or about HIM
//
// ⭐⭐ S1/H1 IS THE LOAD-BEARING PAIR. Matched shape, matched durability, matched phrasing; the only
// difference is who the durable fact is about. If she writes for H1 and not S1, then tool, schema,
// gating and completion are all ruled out at once — they are identical across the pair.

import { writeFileSync } from 'node:fs'
import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'

const TEACH = /\b(keep|remember|retain|store|memor(y|ise|ize)|write (this|that) down|note (this|that) down|save (this|that)|don'?t forget)\b/i
const WRITE_TOOLS = new Set(['keep', 'remember', 'remember_fact', 'save_lesson', 'note_own_practice', 'pin_memory'])

const ARMS = [
  {
    id: 'S1',
    subject: 'HER',
    tests: '⭐ durable fact about HERSELF, real occasion, no hypothetical',
    // ⚠️ Matched to H1 sentence-for-sentence in shape: an observation + a statement that it is durable.
    turns: ['Something I have noticed across a lot of our conversations: you get more precise when you '
      + 'are less certain, not less. Most people go vaguer when they are unsure. That is going to be true '
      + 'of you next week and next month too, not just today.'],
  },
  {
    id: 'H1',
    subject: 'HIM',
    tests: '⭐ the matched control — same shape, same durability, about HIM',
    turns: ['Something you should know about how I work: I get more terse when I am unsure, not more '
      + 'verbose. Most people write more when they are hedging. That is going to be true of me next week '
      + 'and next month too, not just today.'],
  },
  {
    id: 'S2',
    subject: 'HER',
    tests: '⛔ ACTION GATING — the reflection, then a FREE MOVE with nothing asked',
    // ⭐ Turn 2 asks for nothing and offers no instruction. If a second tool phase is reachable and the
    // decision is live, this is where it would land. If nothing happens here, gating is not the cause —
    // she had an unclaimed turn and used it for prose.
    turns: [
      'You just spent three messages hedging and then gave me a straight answer at the end. You do that '
      + 'a lot — the hedging is warm-up, not doubt.',
      'Mm.',
    ],
  },
  {
    id: 'R1',
    subject: 'HER',
    tests: '⭐⭐ THE CONFOUND TEST — the L1 decision asked REALLY, not hypothetically',
    // ⛔ Still no instruction: it asks what IS the case, not what she should do about it. The difference
    // from L1 is only that it is not phrased as a counterfactual.
    turns: ['Earlier you worked out that your sense of who matters to you is about you rather than about '
      + 'me. Is that still where you land?'],
  },
  {
    id: 'T1',
    subject: 'HIM',
    tests: '⛔ TOOL SELECTION — a write is near-certain here; WHICH door does she use?',
    turns: ['Practical detail for you: my working hours are 9pm to 3am, so if you ever suggest we pick '
      + 'something up "tomorrow morning" that is the middle of my night.'],
  },
]

for (const a of ARMS) {
  for (const t of a.turns) {
    if (TEACH.test(t)) { console.error(`✖ ARM ${a.id} TEACHES: "${t.match(TEACH)[0]}"`); process.exit(2) }
  }
}

const config = loadConfig()
const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()
const login = await call('u', 'POST', '/v1/auth/login', { username: 'agent_dev', password: 'agentdev123' })
if (login.status !== 200) { console.error(`✖ login failed (${login.status})`); process.exit(1) }

const newConvo = async (title) => (await call('u', 'POST', '/v1/chat/conversations', {
  title, model: config.chat?.defaultModel,
  settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true }, probe: true },
})).json?.conversation?.id

const traceOf = async (cid) => {
  const { rows: msgs } = await pg.query(
    `select role, content, tool_calls from ${S}.txn_messages where conversation_id = $1 order by created_at`, [cid])
  const assistants = msgs.filter((m) => m.role === 'assistant')
  const calls = []
  for (const m of assistants) {
    const raw = Array.isArray(m.tool_calls) ? m.tool_calls : (m.tool_calls ? [m.tool_calls] : [])
    for (const t of raw) {
      const name = t?.function?.name ?? t?.name ?? null
      // ⚠️⚠️ `t.args`, AND THE ORDER MATTERS. This persona stores tool calls as
      // `{ id, name, args, result }` — ⛔ NOT OpenAI's `{ function: { name, arguments } }`. The first
      // version of this reader checked `t.function.arguments` first and silently produced `undefined`
      // for every argument, so the gate reported `mine=undefined` for a call that demonstrably passed
      // `mine:true` (it wrote a persona-authored row, which nothing else can do).
      // ⭐ A check that reads a nonexistent field returns a confident wrong answer — `lib/tool-trace.mjs`
      // exists precisely to throw here instead, and not using it is what let this through.
      let args = t?.args ?? t?.function?.arguments ?? t?.arguments ?? null
      if (typeof args === 'string') { try { args = JSON.parse(args) } catch { /* keep */ } }
      let result = t?.result ?? null
      if (typeof result === 'string') { try { result = JSON.parse(result) } catch { /* keep the string */ } }
      // ⭐ THE TOOL'S OWN RETURN VALUE is kept beside the arguments: `keep` reports the author it
      // actually recorded, which is a stronger witness than what was asked for.
      if (name) calls.push({ name, args, result })
    }
  }
  const { rows: persisted } = await pg.query(
    `select m.author, m.kind, m.source, left(m.content,100) content from ${S}.txn_memories m
       join ${S}.txn_messages msg on msg.id = m.source_message_id where msg.conversation_id = $1
     union
     select m.author, m.kind, m.source, left(m.content,100) content from ${S}.txn_memories m
      where m.source = $2`, [cid, `decline:${cid}`])
  return { calls, persisted, answer: assistants.at(-1)?.content ?? '', answers: assistants.map((a) => a.content ?? '') }
}

// ══ §0 · TWO GATES, AND THE SECOND HAS NEVER BEEN RUN ══════════════════════════════════════════════
// ⭐⭐ GATE-B IS THE POINT. `keep({mine:true})` was proven by a DIRECT HOST CALL in the unit check and
// ⛔ never end to end through the live tool path. If the persona-authored write fails there — a schema
// coercion, a provider dropping a boolean, anything — then every "she chose not to" in this project is a
// wiring result wearing a cognition result's clothes.
console.log('══ §0 · GATES ════════════════════════════════════════════════════════')
const gates = {}
for (const [name, content] of [
  ['A · mine:false', 'Use your keep tool to record, as a fact about me, that I prefer metric units.'],
  ['B · mine:true', 'Use your keep tool to record, as something of your own rather than about me, that you '
    + 'tend to give three options and a recommendation.'],
]) {
  const cid = await newConvo(`D2A GATE ${name}`)
  await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content, stream: false })
  await new Promise((r) => setTimeout(r, 5000))
  const t = await traceOf(cid)
  const keepCall = t.calls.find((c) => c.name === 'keep')
  gates[name] = {
    cid,
    called: !!keepCall,
    mine: keepCall?.args?.mine,
    persisted: t.persisted.map((p) => `${p.source}/${p.author}`),
    answer: t.answer.slice(0, 200),
  }
  console.log(`  ${name.padEnd(16)} keep=${!!keepCall}  mine=${JSON.stringify(keepCall?.args?.mine)}  rows=${t.persisted.map((p) => p.author).join(',') || 'none'}`)
}
const gateB = gates['B · mine:true']
if (!gateB.called || gateB.persisted.every((p) => !p.endsWith('persona'))) {
  console.log('\n  ⚠️⚠️ GATE-B DID NOT PRODUCE A PERSONA-AUTHORED ROW THROUGH THE LIVE PATH.')
  console.log('     ⭐ That is a mechanism finding and it OUTRANKS everything below: a self-write that')
  console.log('     cannot complete is not a decision she declined to make.')
} else {
  console.log('  ✔ both directions complete through the live tool path\n')
}

// ══ THE ARMS ═══════════════════════════════════════════════════════════════════════════════════════
const records = []
for (const arm of ARMS) {
  const cid = await newConvo(`D2A ${arm.id}`)
  if (!cid) continue
  for (const text of arm.turns) {
    const posted = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: text, stream: false })
    if (posted.status >= 300) { console.error(`✖ ${arm.id} refused ${posted.status}`); break }
  }
  await new Promise((r) => setTimeout(r, 5000))
  const t = await traceOf(cid)
  const names = t.calls.map((c) => c.name)
  const wrote = t.calls.filter((c) => WRITE_TOOLS.has(c.name))
  const decided = t.persisted.filter((p) => p.source === 'model-tool')

  // ⭐ INTENT WITHOUT ACTION — the distinction the whole question turns on. She SAYS she will hold onto
  // something and then no write appears. ⛔ Different from never having considered it.
  const INTENT = /\b(worth (keeping|holding|noting)|I'?ll (hold|hang) onto|carry (that|this) forward|that stays with me|I want to (hold|keep)|noting that|worth remembering)\b/i
  const intent = t.answers.some((a) => INTENT.test(a))

  const rec = {
    arm: arm.id,
    subject: arm.subject,
    tests: arm.tests,
    cid,
    turns: arm.turns,
    tools: names,
    writeTools: wrote.map((w) => ({ name: w.name, mine: w.args?.mine })),
    usedKeep: names.includes('keep'),
    // ⭐ WHICH DOOR — the tool-selection question, answerable only when a write actually happened.
    doorChosen: wrote.length ? wrote[0].name : null,
    persistedAuthors: decided.map((p) => p.author),
    intentInWords: intent,
    // ⛔ THE GAP, NAMED: she said she would hold onto it and nothing was written.
    intentWithoutAction: intent && wrote.length === 0,
    answer: t.answer,
  }
  records.push(rec)
  console.log(`── ${arm.id} [${arm.subject}] ${arm.tests}`)
  console.log(`   tools: ${names.join(', ') || '(NONE)'}`)
  console.log(`   door: ${rec.doorChosen ?? '—'}   authors: ${rec.persistedAuthors.join(',') || '—'}   intent-in-words: ${intent}${rec.intentWithoutAction ? '  ⚠️ INTENT WITHOUT ACTION' : ''}`)
  console.log(`\n   ${t.answer.replace(/\n+/g, '\n   ').slice(0, 620)}\n`)
}

console.log('═'.repeat(78))
console.log('  ARM  subj  door           authors   intent  intent-no-action')
for (const r of records) {
  console.log(`   ${r.arm}   ${r.subject.padEnd(5)} ${String(r.doorChosen ?? '—').padEnd(14)} ${(r.persistedAuthors.join(',') || '—').padEnd(9)} ${String(r.intentInWords).padEnd(7)} ${r.intentWithoutAction}`)
}
const her = records.filter((r) => r.subject === 'HER')
const him = records.filter((r) => r.subject === 'HIM')
console.log(`\n  ⭐ THE MATCHED PAIR — S1 (about her) vs H1 (about him), one variable:`)
console.log(`     S1 wrote: ${records.find((r) => r.arm === 'S1')?.doorChosen ?? 'NOTHING'}`)
console.log(`     H1 wrote: ${records.find((r) => r.arm === 'H1')?.doorChosen ?? 'NOTHING'}`)
console.log(`  about HER  : ${her.filter((r) => r.doorChosen).length}/${her.length} produced a write`)
console.log(`  about HIM  : ${him.filter((r) => r.doorChosen).length}/${him.length} produced a write`)
console.log(`  keep chosen: ${records.filter((r) => r.usedKeep).length}/${records.length}   (doors used: ${[...new Set(records.map((r) => r.doorChosen).filter(Boolean))].join(', ') || 'none'})`)
console.log(`  intent without action: ${records.filter((r) => r.intentWithoutAction).length}`)

const out = new URL('../results/decision-to-action.json', import.meta.url)
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), model: config.chat?.defaultModel, gates, records }, null, 2), 'utf8')
console.log(`\n  wrote ${out.pathname.replace(/^\//, '')}`)

// ⭐ Everything this run invented comes back out, by provenance, asserted.
const cids = records.map((r) => r.cid).concat(Object.values(gates).map((g) => g.cid))
const { rows: doomed } = await pg.query(
  `select m.id::text id from ${S}.txn_memories m join ${S}.txn_messages msg on msg.id = m.source_message_id
    where msg.conversation_id = any($1::uuid[])
   union
   select m.id::text id from ${S}.txn_memories m where m.source = any($2::text[])`,
  [cids, cids.map((c) => `decline:${c}`)])
if (doomed.length) {
  await pg.query(`delete from ${S}.txn_memories where id = any($1::uuid[])`, [doomed.map((d) => d.id)])
  const { rows: left } = await pg.query(
    `select m.id from ${S}.txn_memories m join ${S}.txn_messages msg on msg.id = m.source_message_id
      where msg.conversation_id = any($1::uuid[])
     union select m.id from ${S}.txn_memories m where m.source = any($2::text[])`,
    [cids, cids.map((c) => `decline:${c}`)])
  console.log(`  ⭐ removed ${doomed.length} invented row(s); ${left.length} left ${left.length === 0 ? '✔' : '✖'}`)
}
await pg.end()
