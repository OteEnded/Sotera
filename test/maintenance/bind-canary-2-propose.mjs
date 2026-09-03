// ⭐⭐ STEP 2 · PROPOSE the bind — route B-ii, first half. ⛔ NO EFFECT ON `mst_slots`.
//
//   node test/maintenance/bind-canary-2-propose.mjs
//
// ⭐ Route B-ii exists because standing is not evidence: all 82 slots were minted get-or-create from
// labels nobody interpreted, so binding one is a judgement about unexamined material. The proposal is a
// DURABLE row rather than in-memory state — a deliberate act must be visible afterwards.
//
// ⛔ This changes NOTHING operative. The slot stays unbound until step 3 confirms, in a DIFFERENT occasion.
import { proposeBind, currentBinding } from '../../Backend/app/components/memory-declaration-host.js'
import { QUESTION, OCCASION, ACTOR, open } from './bind-canary-common.mjs'

const REASON = 'Ote approved this slot 2026-09-03 as the first governed slot: it is disposable build-tag '
  + 'instrumentation, it asserts nothing about any person, and its address is well-formed (entity=user is '
  + 'the subject, the label is the property). The question `build-tag` describes its answer shape truly.'

const { schema, S, query, rows, slot, close } = await open()

const [q] = await rows(`SELECT id::text FROM ${S}."mst_slot_questions" WHERE question_key = $1`, [QUESTION.key])
if (!q) { console.log('⛔ run step 1 first — `build-tag` is not declared'); await close(); process.exit(1) }

const before = await currentBinding({ query, schema, slotId: slot.id })
console.log(`slot ${slot.id} currently asks: ${before?.question_key ?? 'NOTHING (unbound)'}`)

const r = await proposeBind({
  query, schema, slotId: slot.id, questionId: q.id,
  // ⭐ The intent is a compare-and-set guard, ⛔ never an authority: the act is DERIVED, and a mismatch
  // refuses. If someone bound this slot since the BEFORE snapshot, this refuses loudly instead of drifting.
  declaredIntent: 'first-bind',
  actor: ACTOR, occasion: OCCASION.propose, reason: REASON,
})

if (!r.ok) { console.log('⛔ REFUSED', JSON.stringify(r, null, 2)); await close(); process.exit(1) }

const [after] = await rows(
  `SELECT (SELECT question_id::text FROM ${S}."mst_slots" WHERE id = $1::uuid) AS slot_question,
          (SELECT count(*)::int FROM ${S}."log_slot_bindings" WHERE action = 'propose') AS proposals,
          (SELECT count(*)::int FROM ${S}."log_slot_bindings" WHERE action = 'confirm') AS confirms`,
  [slot.id])

console.log('── PROPOSED ───────────────────────────────────────────────────────────')
console.log(`proposal_id  ${r.proposal.id}`)
console.log(`derived act  ${r.act}                (⭐ derived from state, ⛔ not taken from the caller)`)
console.log(`occasion     ${r.proposal.occasion}`)
console.log(`⭐ operative effect: mst_slots.question_id = ${after.slot_question ?? 'NULL'} — ⛔ still unbound`)
console.log(`   proposals=${after.proposals} confirms=${after.confirms}`)
if (after.slot_question !== null) {
  console.log('⛔⛔ UNEXPECTED — a PROPOSE bound the slot. STOP.'); await close(); process.exit(1)
}
await close()
