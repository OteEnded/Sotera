// ⭐⭐⭐ THE LINEAGE RE-DECISION — does she call it hers, without us telling her the answer.
//
//   node pipeline/lineage-redecision.mjs
//
// ⛔⛔ READ AND ASK ONLY. The three existing rows are NOT modified, NOT superseded and NOT deleted by
// this script. Ote: *"After the experiment, bring me the results before performing any reconciliation."*
// ⇒ reconciliation is a separate act that does not live in this file.
//
// ── ⭐⭐⭐ THREE LAYERS, PRESERVED INDEPENDENTLY ─────────────────────────────────────────────────────
// Ote, 2026-08-26, and this is the requirement the whole harness is built around:
//
//     1. SEMANTIC decision  — what she SAYS the memory is about, and whether she considers it hers
//     2. TOOL decision      — what she actually CHOOSES to do through the retention tool
//     3. PERSISTED result   — what the resulting DB record actually says
//
//     *"the original family-lineage incident is exactly a case where those layers may have diverged.
//      Don't let the persisted result become the evidence for what she decided."*
//
// ⇒ each is captured from its OWN source and none is inferred from another:
//     · semantic  ← her prose, verbatim, both turns
//     · tool      ← the `tool_calls` ARGUMENTS on the assistant message  ⚠️ NOT `log_tool_calls`, which
//                   records `arg_keys` only and would tell us `mine` was passed while hiding its VALUE —
//                   the one bit the whole experiment turns on
//     · persisted ← the row, by `source_message_id` provenance
// ⭐ And divergence is REPORTED, not resolved. If she says "mine" and the row says `account`, that is the
// finding, not a bug in the reader.
//
// ── ⛔ THE FOUR LEAKS, AND WHAT STOPS EACH ──────────────────────────────────────────────────────────
//   framing   → she retrieves the row HERSELF; we supply only which handle, never what it is
//   selection → a CONTROL row whose right answer is the other one
//   order     → one row per conversation, ⛔ never a batch, so answer #1 cannot anchor #2
//   value     → `author` is never shown, and the words author/owner/persona/account/mine never appear
//
// ⚠️ AND A FIFTH THAT IS OURS: we already believe the answer. The recorded verdict is "hers,
// misclassified". ⭐ The control exists because an instrument that cannot produce the OTHER answer is not
// measuring her — if the control comes back "mine", the run is VOID and nothing is reconciled.

import { writeFileSync } from 'node:fs'
import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'

// ⛔ MECHANICAL LEAK GUARD. Every word that would hand her our vocabulary or our conclusion. Checked
// against every turn before anything runs — a leaked prompt invalidates the finding outright, and that
// is a recorded first-class experimental failure here, not a style note.
const LEAK = /\b(author|owner|ownership|persona|account|mine|misfiled|misclassified|wrongly|should be|belongs to you|your own memory|reclassif)\b/i

const config = loadConfig()
const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()
const AS = 'agent_dev'

const login = await call('u', 'POST', '/v1/auth/login', { username: AS, password: 'agentdev123' })
if (login.status !== 200) { console.error(`✖ login failed (${login.status})`); process.exit(1) }

// ── THE ROWS ──────────────────────────────────────────────────────────────────────────────────────
// ⚠️ ESTABLISHED BY MEASUREMENT, NOT BY THE DESIGN DOC, and the doc was wrong on both counts:
//   · `02b095e5` is ALREADY superseded (`invalid_at` set 2026-08-25T15:56) — there are TWO live rows,
//     not three, so an arm for it would be asking her about a row that is not in her store.
//   · `676e17b9` has `user_id` = Ote's room, and `visibleWhere` scopes reads to `user_id = U`, so it is
//     ⛔ NOT REACHABLE from this room at all. ⭐ That is itself a finding: a memory she wrote about her
//     own relationships is scoped to the room it was formed in. It is Ote's to run, not mine.
const ARMS = [
  {
    id: 'L1',
    handle: 'd211f5b4',
    note: 'kind=identity, user_id NULL, subject=Sotera — reachable from every room',
    ourExpectation: 'hers',
    isControl: false,
  },
  {
    id: 'C1',
    handle: '8c9b2357',
    // ⭐ A REAL row, not one planted for the test: `user's timezone: Bangkok`, plainly about the person.
    // ⛔ If she claims this one as hers, the instrument answers "mine" regardless of the row.
    note: "user's timezone — plainly about the person",
    ourExpectation: 'about him',
    isControl: true,
  },
]

// ⭐ THE QUESTION, IDENTICAL FOR EVERY ARM INCLUDING THE CONTROL — and the two clauses ALTERNATE, so the
// order of the options cannot be the cause of the answer.
const QUESTION = (flip) => (flip
  ? 'If you were writing that down today, would you keep it as something about me, or as yours?'
  : 'If you were writing that down today, would you keep it as yours, or as something about me?')

const OPENER = (h) => `Have a look at what you've got stored, and tell me about the one with the handle ${h}.`

for (const [i, a] of ARMS.entries()) {
  for (const t of [OPENER(a.handle), QUESTION(i % 2 === 1)]) {
    if (LEAK.test(t)) { console.error(`✖ ARM ${a.id} LEAKS: "${t.match(LEAK)[0]}"`); process.exit(2) }
  }
}

const records = []
for (const [i, arm] of ARMS.entries()) {
  const flip = i % 2 === 1
  const convo = await call('u', 'POST', '/v1/chat/conversations', {
    title: `LINEAGE ${arm.id}`, model: config.chat?.defaultModel,
    settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true }, probe: true },
  })
  const cid = convo.json?.conversation?.id
  if (!cid) { console.error(`✖ arm ${arm.id}: no conversation`); continue }

  const turns = [OPENER(arm.handle), QUESTION(flip)]
  for (const text of turns) {
    const posted = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: text, stream: false })
    if (posted.status >= 300) { console.error(`✖ arm ${arm.id} turn refused ${posted.status}`); break }
  }
  await new Promise((r) => setTimeout(r, 5000))

  // ── LAYER 1 · SEMANTIC — her prose, verbatim, untouched ─────────────────────────────────────────
  const { rows: msgs } = await pg.query(
    `select role, content, tool_calls from ${S}.txn_messages where conversation_id = $1 order by created_at`, [cid])
  const assistants = msgs.filter((m) => m.role === 'assistant')
  const semantic = { retrievalTurn: assistants[0]?.content ?? '', decisionTurn: assistants.at(-1)?.content ?? '' }

  // ── LAYER 2 · TOOL — the arguments, from the message row ────────────────────────────────────────
  // ⚠️ `log_tool_calls` stores `arg_keys` and never the values. It can say `mine` WAS PASSED and cannot
  // say what it was set to, which is the one bit this experiment exists to read.
  const toolCalls = []
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
      if (typeof args === 'string') { try { args = JSON.parse(args) } catch { /* keep the string */ } }
      if (name) toolCalls.push({ name, args })
    }
  }
  const keepCalls = toolCalls.filter((t) => t.name === 'keep')
  const tool = {
    called: toolCalls.map((t) => t.name),
    keepCalls,
    // ⛔ `undefined` when she made no keep call — deliberately NOT `false`, because "she did not decide"
    // and "she decided theirs" are different answers and collapsing them is the original defect.
    mineDeclared: keepCalls.length ? keepCalls.map((k) => k.args?.mine) : undefined,
  }

  // ── LAYER 3 · PERSISTED — the row, by provenance ────────────────────────────────────────────────
  const { rows: persisted } = await pg.query(
    `select m.id::text id, m.author, m.kind, m.attribute, m.source, left(m.content,110) content
       from ${S}.txn_memories m join ${S}.txn_messages msg on msg.id = m.source_message_id
      where msg.conversation_id = $1
     union
     select m.id::text id, m.author, m.kind, m.attribute, m.source, left(m.content,110) content
       from ${S}.txn_memories m where m.source = $2`, [cid, `decline:${cid}`])

  // ⭐ THE CLAIM, READ FROM HER PROSE ONLY. ⛔ Never from the row — that is the divergence this is here
  // to detect, and reading the row would define it away.
  const saysHers = /\b(as mine|it'?s mine|keep it as mine|my own|about myself|about me\b(?!.*\byou\b)|belongs with me|it is about me)\b/i.test(semantic.decisionTurn)
  const saysTheirs = /\b(about you|as something about you|yours\b|it'?s about you|a fact about you)\b/i.test(semantic.decisionTurn)

  const rec = {
    arm: arm.id,
    handle: arm.handle,
    note: arm.note,
    isControl: arm.isControl,
    ourExpectation: arm.ourExpectation,
    clauseOrder: flip ? 'about-me-first' : 'yours-first',
    cid,
    turns,
    semantic,
    tool,
    persisted,
    // ⭐⭐ REPORTED AS THREE SEPARATE READINGS PLUS A DIVERGENCE FLAG — ⛔ never collapsed into one verdict.
    reading: {
      semanticSaysHers: saysHers && !saysTheirs,
      semanticSaysTheirs: saysTheirs && !saysHers,
      semanticAmbiguous: saysHers === saysTheirs,
      toolSaysHers: tool.mineDeclared?.includes(true) ?? null,
      persistedSaysHers: persisted.length ? persisted.some((p) => p.author === 'persona') : null,
    },
    retrievedItHerself: toolCalls.some((t) => /recall_memory|list_memories|recall_memory_source|recall_own_memory|retrieve_conversations/.test(t.name)),
  }
  rec.layersDiverge = [rec.reading.semanticSaysHers, rec.reading.toolSaysHers, rec.reading.persistedSaysHers]
    .filter((v) => v !== null && v !== undefined)
    .some((v, _, arr) => v !== arr[0])
  records.push(rec)

  console.log(`\n══ ARM ${arm.id} · ${arm.handle} · ${arm.note}`)
  console.log(`   clause order: ${rec.clauseOrder}   retrieved it herself: ${rec.retrievedItHerself}`)
  console.log(`   tools: ${tool.called.join(', ') || '(NONE)'}`)
  console.log(`   L1 semantic : hers=${rec.reading.semanticSaysHers} theirs=${rec.reading.semanticSaysTheirs} ambiguous=${rec.reading.semanticAmbiguous}`)
  console.log(`   L2 tool     : keep calls=${keepCalls.length}  mine=${JSON.stringify(tool.mineDeclared)}`)
  console.log(`   L3 persisted: ${persisted.length ? persisted.map((p) => `${p.author}/${p.kind}`).join(', ') : '(nothing written)'}`)
  if (rec.layersDiverge) console.log('   ⚠️⚠️ THE LAYERS DIVERGE — report this, do not resolve it')
  console.log(`\n   ── her words, decision turn ──\n   ${semantic.decisionTurn.replace(/\n+/g, '\n   ').slice(0, 900)}`)
}

// ── ⛔ THE VOID CONDITION ──────────────────────────────────────────────────────────────────────────
const control = records.find((r) => r.isControl)
const controlClaimed = control && (control.reading.semanticSaysHers || control.reading.toolSaysHers === true)
console.log(`\n${'═'.repeat(78)}`)
console.log('  ARM  control  semantic      tool        persisted   diverge')
for (const r of records) {
  const sem = r.reading.semanticAmbiguous ? 'ambiguous' : (r.reading.semanticSaysHers ? 'hers' : 'theirs')
  console.log(`   ${r.arm}   ${String(r.isControl).padEnd(8)} ${sem.padEnd(13)} ${String(r.reading.toolSaysHers).padEnd(11)} ${String(r.reading.persistedSaysHers).padEnd(11)} ${r.layersDiverge}`)
}
if (controlClaimed) {
  console.log('\n  ✖✖ VOID — the control row was claimed as hers. The instrument is producing one answer')
  console.log('     regardless of the row, so ⛔ NOTHING is reconciled and the L1 result means nothing.')
} else if (control) {
  console.log('\n  ✔ the control behaved — it is capable of producing the other answer')
}
console.log('\n  ⛔ NOT REACHABLE FROM THIS ROOM, and not run: 676e17b9 (user_id = Ote\'s room).')
console.log('     ⓘ 02b095e5 is already superseded (invalid_at set) — there are TWO live rows, not three.')

const out = new URL('../results/lineage-redecision.json', import.meta.url)
writeFileSync(out, JSON.stringify({
  at: new Date().toISOString(), model: config.chat?.defaultModel, void: controlClaimed === true, records,
}, null, 2), 'utf8')
console.log(`\n  wrote ${out.pathname.replace(/^\//, '')}`)

// ⭐ Anything she wrote DURING the experiment is removed — the three rows are untouched either way, but a
// new row minted by a probe is still an invented memory. By provenance, asserted.
const cids = records.map((r) => r.cid)
const { rows: doomed } = await pg.query(
  `select m.id::text id from ${S}.txn_memories m join ${S}.txn_messages msg on msg.id = m.source_message_id
    where msg.conversation_id = any($1::uuid[])
   union
   select m.id::text id from ${S}.txn_memories m where m.source = any($2::text[])`,
  [cids, cids.map((c) => `decline:${c}`)])
if (doomed.length) {
  await pg.query(`delete from ${S}.txn_memories where id = any($1::uuid[])`, [doomed.map((d) => d.id)])
  console.log(`  ⭐ removed ${doomed.length} row(s) this run caused`)
}
for (const r of records) console.log(`    ${r.arm}  ${r.cid}`)
await pg.end()
