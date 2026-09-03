// ⭐⭐⭐ STEP 3 · CONFIRM — the ONE-WAY DOOR. This is the act that makes the slot GOVERNED.
//
//   node test/maintenance/bind-canary-3-confirm.mjs
//
// ⚠️⚠️ After this, the slot can be REPOINTED but ⛔ never returned to unbound: there is no UNBIND act, by
// design — unbinding would be *contradicting a claim with a non-claim*, which the vocabulary deliberately
// has no word for. Ote acknowledged this explicitly on 2026-09-03 before approving the slot.
//
// ⭐ It runs the SAME-OCCASION negative control FIRST, on the real proposal. That control writes nothing
// (the occasion rule is checked before the compare-and-set statement), and it proves on live material that
// the separation is enforced rather than merely intended.
import { confirmBind, resolveSlotQuestion } from '../../Backend/app/components/memory-declaration-host.js'
import { QUESTION, OCCASION, ACTOR, open } from './bind-canary-common.mjs'

const REASON = 'Confirmed in a later occasion than the proposal, per route B-ii. Ote approved the slot, the '
  + 'question and the one-way-door consequence on 2026-09-03.'

const { schema, S, query, rows, slot, close } = await open()

const [p] = await rows(
  `SELECT b.id::text, b.occasion, b.after_question_id::text, b.derived_act
     FROM ${S}."log_slot_bindings" b
    WHERE b.slot_id = $1::uuid AND b.action = 'propose'
      AND NOT EXISTS (SELECT 1 FROM ${S}."log_slot_bindings" c WHERE c.proposal_id = b.id)
    ORDER BY b.created_at DESC LIMIT 1`, [slot.id])
if (!p) { console.log('⛔ no unconfirmed proposal for this slot — run step 2 first'); await close(); process.exit(1) }

// ── ⛔ NEGATIVE CONTROL, ON THE REAL PROPOSAL — the same occasion must be REFUSED ─────────────────
const same = await confirmBind({
  query, schema, proposalId: p.id, actor: ACTOR, occasion: p.occasion, reason: 'negative control',
})
console.log(`⛔ same-occasion control: ok=${same.ok} refusal=${same.refusal}`)
if (same.ok !== false || same.refusal !== 'same-occasion') {
  console.log('⛔⛔ THE OCCASION RULE DID NOT FIRE ON LIVE MATERIAL. STOP.'); await close(); process.exit(1)
}
const [mid] = await rows(
  `SELECT (SELECT question_id::text FROM ${S}."mst_slots" WHERE id = $1::uuid) AS bound,
          (SELECT count(*)::int FROM ${S}."log_slot_bindings") AS bindings`, [slot.id])
console.log(`   …and it wrote nothing: bound=${mid.bound ?? 'NULL'} binding_rows=${mid.bindings}`)
if (mid.bound !== null || mid.bindings !== 1) {
  console.log('⛔⛔ THE REFUSED CONFIRM LEFT A TRACE. STOP.'); await close(); process.exit(1)
}

// ── ⭐⭐⭐ THE REAL ACT ────────────────────────────────────────────────────────────────────────────
const r = await confirmBind({
  query, schema, proposalId: p.id, actor: ACTOR, occasion: OCCASION.confirm, reason: REASON,
})
if (!r.ok) { console.log('⛔ REFUSED', JSON.stringify(r, null, 2)); await close(); process.exit(1) }

const resolved = await resolveSlotQuestion({ query, schema, slotId: slot.id })
const [after] = await rows(
  `SELECT (SELECT count(*)::int FROM ${S}."mst_slots" WHERE question_id IS NOT NULL) AS bound_slots,
          (SELECT count(*)::int FROM ${S}."log_slot_bindings") AS bindings`)

console.log('── BOUND ──────────────────────────────────────────────────────────────')
console.log(`binding_id   ${r.binding.id}`)
console.log(`act          ${r.act}`)
console.log(`slot         ${r.binding.slot_id}  →  question ${r.binding.after_question_id}`)
console.log('── RESOLVE (what the gate will now see) ───────────────────────────────')
console.log(`slotKind     ${resolved.slotKind}`)
console.log(`checks       ${JSON.stringify(resolved.checks)}`)
console.log(`namespace    ${resolved.namespace} declared=${resolved.namespaceDeclared} slot_governed=${resolved.slotGoverned}`)
console.log(`declared in  ${resolved.declaredInOccasion}`)
console.log(`bound in     ${resolved.boundInOccasion}`)
console.log(`⭐ corpus-wide: bound_slots=${after.bound_slots} of 82 · binding rows=${after.bindings}`)
if (resolved.slotKind !== QUESTION.key || resolved.slotGoverned !== true || after.bound_slots !== 1) {
  console.log('⛔⛔ THE SLOT IS NOT GOVERNED AS EXPECTED. STOP.'); await close(); process.exit(1)
}
await close()
