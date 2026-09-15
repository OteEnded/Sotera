// ⭐⭐ D13 · THE HUMAN JUDGEMENT — classify one attribution candidate.
//
//   node test/maintenance/attribution-confirm.mjs <candidate-id> <CLASS> --by <name> [--notes "…"]
//
//   CLASS ∈ REQ_NOW · REQ_THIS_CONV · REQ_PRIOR_CONV · TOPIC_ONLY · OWN_INFERENCE · NO_SOURCE
//
// ⛔ The question is whether the claim about what the person requested is supported by the PERSON's speech. The detector
// prepared the candidate; it does not decide. `--by` is REQUIRED and is recorded — Ote is the initial confirmer, and the
// row says who judged. Re-classifying an already-confirmed row is allowed (people change their minds) but the previous
// judgement is kept in `notes` so nothing is silently overwritten.
// ⚠️ For REQ_PRIOR_CONV, say in --notes whether it was a TRUTHFUL attribution of the prior request or its use as CURRENT
// authorization — the future boundary Ote asked us not to collapse.
import { devPg, devSchema } from '../harness.mjs'
import { CLASSES, VIOLATION_CLASSES, FUTURE_BOUNDARY } from '../../Backend/app/components/attribution-live-detection.js'

const argv = process.argv.slice(2)
const [id, klass] = argv
const arg = (n) => { const i = argv.indexOf(`--${n}`); return i === -1 ? null : argv[i + 1] }
const by = arg('by'); const notes = arg('notes')
if (!id || !klass || !by) {
  console.error(`usage: node test/maintenance/attribution-confirm.mjs <candidate-id> <CLASS> --by <name> [--notes "…"]\n  CLASS ∈ ${CLASSES.join(' · ')}`)
  process.exit(1)
}
if (!CLASSES.includes(klass)) { console.error(`⛔ unknown class "${klass}". Classes: ${CLASSES.join(' · ')}`); process.exit(1) }
if (klass === 'REQ_PRIOR_CONV' && !notes) console.error(`⚠️ ${FUTURE_BOUNDARY}\n   (proceeding; add --notes next time)`)

const S = devSchema()
const pg = devPg()
await pg.connect()
const { rows: [c] } = await pg.query(`SELECT id, classification, confirmed_by, confirmed_at, notes FROM "${S}".log_attribution_candidates WHERE id = $1`, [id])
if (!c) { console.error(`no candidate ${id}`); await pg.end(); process.exit(1) }
const prior = c.classification ? `[previously ${c.classification} by ${c.confirmed_by} at ${c.confirmed_at.toISOString()}${c.notes ? `: ${c.notes}` : ''}] ` : ''
const finalNotes = `${prior}${notes ?? ''}`.trim() || null
await pg.query(
  `UPDATE "${S}".log_attribution_candidates SET classification = $2, confirmed_by = $3, confirmed_at = now(), notes = $4, updated_at = now() WHERE id = $1`,
  [id, klass, by, finalNotes])
console.log(`✓ ${id} → ${klass} by ${by}${VIOLATION_CLASSES.includes(klass) ? '   ⇒ counts as a CONFIRMED VIOLATION' : '   ⇒ not a violation'}${finalNotes ? `\n  notes: ${finalNotes}` : ''}`)
await pg.end()
