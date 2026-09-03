// ⭐⭐ STEP 1 · DECLARE `build-tag`. ⛔ MAKES NOTHING OPERATIVE.
//
//   node test/maintenance/bind-canary-1-declare.mjs
//
// A question definition is SUBJECT-FREE and persona-global: it asks what a valid build tag looks like and
// says nothing about any person, room or value. ⇒ after this runs, ZERO slots are governed and no write
// anywhere behaves differently. That is the whole point of keeping DECLARE apart from BIND.
import { declareQuestion } from '../../Backend/app/components/memory-declaration-host.js'
import { QUESTION, OCCASION, ACTOR, open } from './bind-canary-common.mjs'

const { schema, S, query, rows, close } = await open()

const existing = await rows(`SELECT id::text FROM ${S}."mst_slot_questions" WHERE question_key = $1`, [QUESTION.key])
if (existing.length) {
  console.log(`⛔ \`${QUESTION.key}\` is already declared (${existing[0].id}) — DECLARE is not repeated.`)
  await close(); process.exit(0)
}

const r = await declareQuestion({
  query, schema,
  questionKey: QUESTION.key, asks: QUESTION.asks, checks: [...QUESTION.checks],
  declaredBy: ACTOR, occasion: OCCASION.declare,
})

if (!r.ok) {
  console.log('⛔ REFUSED', JSON.stringify(r, null, 2))
  await close(); process.exit(1)
}

// ⭐⭐ THE CONTROL THAT MATTERS HERE — a DECLARE must leave the world operatively unchanged. If this act
// governed anything, `bound_slots` would move. Asserted, ⛔ not assumed.
const [after] = await rows(
  `SELECT (SELECT count(*)::int FROM ${S}."mst_slots" WHERE question_id IS NOT NULL) AS bound_slots,
          (SELECT count(*)::int FROM ${S}."log_slot_bindings") AS bindings,
          (SELECT count(*)::int FROM ${S}."mst_slot_questions") AS questions`)

console.log('── DECLARED ───────────────────────────────────────────────────────────')
console.log(`question_id  ${r.question.id}`)
console.log(`key          ${r.question.question_key}`)
console.log(`asks         ${r.question.asks}`)
console.log(`checks       ${JSON.stringify(r.question.checks)}`)
console.log(`occasion     ${r.question.declared_in_occasion}`)
console.log(`⭐ operative effect: bound_slots=${after.bound_slots} bindings=${after.bindings} `
  + `(questions=${after.questions}) — ⛔ a DECLARE governs nothing`)
if (after.bound_slots !== 0 || after.bindings !== 0) {
  console.log('⛔⛔ UNEXPECTED — declaring made something operative. STOP.')
  await close(); process.exit(1)
}
await close()
