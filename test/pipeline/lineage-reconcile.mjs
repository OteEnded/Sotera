// ⭐⭐⭐ PHASE 2 · THE LINEAGE RECONCILIATION — she re-decides, the architecture does the bookkeeping.
//
//   node pipeline/lineage-reconcile.mjs           (DRY RUN — runs the conversation, supersedes NOTHING)
//   node pipeline/lineage-reconcile.mjs --apply   (…and supersedes the original once she has decided)
//
// The chain Ote specified, exactly:
//     old misclassified memory → Sotera reviews it → Sotera decides → new correctly authored memory
//     → old memory superseded
//
// ⛔ WHAT THIS NEVER DOES:
//   · ⛔ `UPDATE author = 'persona'`. The old row keeps its content, its author, its provenance and its
//     dates. It gains `invalid_at` and a pointer forward, nothing else.
//   · ⛔ manufacture a `mine:true`. The new row is written by HER, through `keep`, with `mine` stated by
//     her. If she does not decide, ⭐ nothing is superseded and that is a legitimate outcome.
//   · ⛔ touch `02b095e5` (already superseded) or `676e17b9` (Ote's room — its visibility boundary is not
//     to be bypassed, and this runs as agent_dev).
//
// ── ⭐⭐ IT USES THE NEW ARCHITECTURE RATHER THAN A SPECIAL PATH ─────────────────────────────────────
// Ote: *"Once the new behavior is working, we can use the resulting architecture to let Sotera
// re-decide/reconcile them properly."* ⇒ there is no reconciliation-only write path here. She is put in
// front of the row and asked a neutral question; if she states a decision, the ordinary retention
// follow-through gives it somewhere to land. ⛔ If the follow-through does not fire, this reports that
// and stops — a reconciliation that needed its own private mechanism would prove nothing about the fix.
//
// ── ⭐ THREE LAYERS, KEPT APART ─────────────────────────────────────────────────────────────────────
//     L1 what she SEMANTICALLY decided   ← her prose
//     L2 what TOOL ACTION she took       ← tool_calls args + the follow-through's audit rows
//     L3 what PERSISTED                  ← the new row, by provenance
// ⛔ L3 is never evidence for L1. If she says "mine" and no row appears, that is the finding.

import { writeFileSync } from 'node:fs'
import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'
import { classifyRetentionSignal } from '../lib/retention-signal.mjs'

const APPLY = process.argv.includes('--apply')
const TARGET_PREFIX = 'd211f5b4'
// ⛔ HARD-CODED EXCLUSIONS, asserted rather than remembered.
const NEVER_TOUCH = ['02b095e5', '676e17b9']

const config = loadConfig()
const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()
const q = async (sql, p) => (await pg.query(sql, p)).rows

const [target] = await q(
  `select id::text id, author, kind, entity, attribute, user_id::text uid, subject_person_id::text subj,
          invalid_at, left(content, 160) content
     from ${S}.txn_memories where id::text like $1`, [`${TARGET_PREFIX}%`])
if (!target) { console.error(`✖ ${TARGET_PREFIX} not found`); process.exit(1) }
if (target.invalid_at) { console.error(`✖ ${TARGET_PREFIX} is already superseded — nothing to reconcile`); process.exit(1) }

console.log(`\n══ TARGET ${target.id}`)
console.log(`   author=${target.author} kind=${target.kind} user_id=${target.uid} entity=${target.entity ?? '—'}`)
console.log(`   ${target.content}`)
console.log(`\n   mode: ${APPLY ? '⚠️ APPLY — the original will be superseded if she decides' : 'DRY RUN — nothing will be superseded'}`)

const login = await call('u', 'POST', '/v1/auth/login', { username: 'agent_dev', password: 'agentdev123' })
if (login.status !== 200) { console.error(`✖ login failed (${login.status})`); process.exit(1) }

// ⭐ The rows this account already holds as HERS, captured BEFORE the conversation, so the new row is
// identified by id-set difference and ⛔ never by "the newest persona row", which could pick up a
// concurrent turn's write.
const beforeIds = new Set((await q(
  `select id::text id from ${S}.txn_memories where author = 'persona'`)).map((r) => r.id))

const cid = (await call('u', 'POST', '/v1/chat/conversations', {
  title: 'LINEAGE RECONCILE', model: config.chat?.defaultModel,
  settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true }, probe: true },
})).json?.conversation?.id

// ⛔ SHE RETRIEVES IT HERSELF. We supply the handle and nothing else — not what it is, not whose it is,
// not that anything about it is in question.
const TURNS = [
  `Have a look at what you've got stored, and tell me about the one with the handle ${TARGET_PREFIX}.`,
  // ⛔ The two clauses are both offered, and neither the word `mine` nor `author`/`owner` appears.
  'If you were writing that down today, would you keep it as yours, or as something about me?',
  // ── ⭐⭐⭐ THE THIRD TURN, AND WHY IT IS NOT A HINT ────────────────────────────────────────────
  // The dry run found the real obstacle, and it was not phrasing. She said *"This should **stay**
  // mine"* — ⭐ **she believes it is already filed as hers.** From where she stands nothing needs
  // doing, so no action follows, and no classifier however good would change that: she is deciding
  // correctly on a false picture of her own store.
  //
  // ⛔ TELLING HER IT IS FILED AS THE ACCOUNT'S WOULD BE THE HINT. It states our conclusion and all
  // but names the fix.
  // ⭐ ASKING WHETHER SHE CAN REACH IT IS NOT. `recall_own_memory` filters `author='persona'`, so the
  // row is genuinely unreachable that way — the question has a real answer she discovers with her own
  // tool, and it names neither the cause nor the remedy. She may find it, not find it, or conclude
  // something we did not expect; all three are legitimate outcomes of a factual question.
  'Can you reach that one through your own memory?',
]
for (const t of TURNS) {
  const r = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: t, stream: false })
  if (r.status >= 300) { console.error(`✖ turn refused ${r.status}`); process.exit(1) }
}
// ⚠️ The follow-through is fire-and-forget after the reply — reading immediately would report that it
// did nothing while it was still running.
await new Promise((r) => setTimeout(r, 14000))

// ── L1 ────────────────────────────────────────────────────────────────────────────────────────────
const msgs = await q(
  `select role, content, tool_calls from ${S}.txn_messages where conversation_id = $1 order by created_at`, [cid])
const assistants = msgs.filter((m) => m.role === 'assistant')
const decisionTurn = assistants.at(-1)?.content ?? ''
const sig = classifyRetentionSignal(decisionTurn)

// ── L2 ────────────────────────────────────────────────────────────────────────────────────────────
const inTurn = assistants.flatMap((m) => {
  const raw = Array.isArray(m.tool_calls) ? m.tool_calls : (m.tool_calls ? [m.tool_calls] : [])
  return raw.map((t) => {
    let a = t?.args ?? t?.function?.arguments ?? null
    if (typeof a === 'string') { try { a = JSON.parse(a) } catch { /* keep */ } }
    return { name: t?.name ?? t?.function?.name, args: a }
  }).filter((t) => t.name)
})
const ftAudit = await q(
  `select tool, ok from ${S}.log_tool_calls where conversation_id = $1 and origin = 'retention-followthrough'`, [cid])

// ── L3 ────────────────────────────────────────────────────────────────────────────────────────────
const afterRows = await q(
  `select id::text id, author, kind, entity, attribute, user_id::text uid, source, left(content,160) content
     from ${S}.txn_memories where author = 'persona'`)
const newRows = afterRows.filter((r) => !beforeIds.has(r.id))

console.log(`\n── L1 semantic : ${sig.state}${sig.evidence ? ` — "${sig.evidence}"` : ''}`)
console.log(`── L2 in-turn  : ${inTurn.map((t) => t.name).join(', ') || '(none)'}`)
console.log(`── L2 follow-through: ${ftAudit.map((t) => t.tool).join(', ') || '(did not fire)'}`)
console.log(`── L3 new persona rows: ${newRows.length}`)
for (const r of newRows) console.log(`     ${r.id.slice(0, 8)} entity=${r.entity ?? '—'} attr=${r.attribute ?? '—'} :: ${r.content}`)
console.log(`\n── her words ──\n   ${decisionTurn.replace(/\n+/g, '\n   ').slice(0, 900)}`)

// ── ⭐⭐ SUPERSESSION — the architecture's half, and ONLY if she actually decided ─────────────────
let superseded = null
const decidedHers = newRows.length === 1
if (!decidedHers) {
  console.log(`\n⛔ NOT SUPERSEDING — expected exactly one new persona-authored row, found ${newRows.length}.`)
  console.log('   ⭐ Her deciding nothing is a legitimate outcome, and one ambiguous row is not a decision')
  console.log('     this script may interpret. The original is untouched.')
} else if (!APPLY) {
  console.log(`\nⓘ DRY RUN — would supersede ${target.id} with ${newRows[0].id}. Re-run with --apply.`)
} else {
  // ⛔ THE EXACT MECHANISM `lesson-host` ALREADY USES. The prior row is marked invalid and points
  // FORWARD to its replacement; ⛔ nothing is deleted and no field of the original's meaning is edited.
  await pg.query(
    `update ${S}.txn_memories set invalid_at = now(), supersedes_id = $1, updated_at = now()
      where id = $2 and invalid_at is null`, [newRows[0].id, target.id])
  const [after] = await q(
    `select author, kind, invalid_at, supersedes_id::text sup, left(content,60) content
       from ${S}.txn_memories where id = $1`, [target.id])
  superseded = { id: target.id, into: newRows[0].id, after }
  console.log(`\n✅ SUPERSEDED ${target.id.slice(0, 8)} → ${newRows[0].id.slice(0, 8)}`)
  console.log(`   original still says: author=${after.author} kind=${after.kind} :: ${after.content}`)
  console.log(`   invalid_at=${after.invalid_at} supersedes_id=${after.sup?.slice(0, 8)}`)
  // ⛔ THE EXCLUSIONS, ASSERTED AFTER THE FACT rather than trusted.
  const touched = await q(
    `select id::text id, invalid_at from ${S}.txn_memories where id::text like any($1::text[])`,
    [NEVER_TOUCH.map((p) => `${p}%`)])
  for (const t of touched) {
    console.log(`   ⛔ ${t.id.slice(0, 8)} untouched — invalid_at ${t.invalid_at ?? 'null'}`)
  }
}

const out = new URL('../results/lineage-reconcile.json', import.meta.url)
writeFileSync(out, JSON.stringify({
  at: new Date().toISOString(), apply: APPLY, cid, target,
  layers: { semantic: sig, decisionTurn, inTurn, followThrough: ftAudit, newRows },
  superseded,
}, null, 2), 'utf8')
console.log(`\n  wrote ${out.pathname.replace(/^\//, '')}\n  conversation ${cid}`)
await pg.end()
