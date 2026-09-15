// ⭐ D12 · THE EVIDENCE LIFECYCLE — prune the bulky frozen copies of REVIEWED candidates.
//
//   node test/maintenance/attribution-evidence-prune.mjs --dry     how many rows are due, write nothing
//   node test/maintenance/attribution-evidence-prune.mjs           prune them
//
// Policy (migration 050 header, `attribution.evidenceRetentionDays`, default 90): `surrounding` and `composed` are set to
// NULL and `evidence_pruned_at` stamped once a candidate has been confirmed for longer than the retention period. The
// spans, the `sources` pre-work and the judgement stay. ⛔ Unreviewed rows are never pruned. ⛔ No row is deleted.
// ⛔ Not scheduled automatically: the frozen copies are evidence, and Ote runs the lifecycle deliberately.
import { readFileSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'

const dry = process.argv.includes('--dry')
const cfg = JSON.parse(readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))
const days = Number.isInteger(cfg?.attribution?.evidenceRetentionDays) ? cfg.attribution.evidenceRetentionDays : 90
const S = devSchema()
const pg = devPg()
await pg.connect()
const where = `confirmed_at IS NOT NULL AND confirmed_at < now() - ($1 || ' days')::interval AND evidence_pruned_at IS NULL AND (surrounding IS NOT NULL OR composed IS NOT NULL)`
const { rows: [{ n }] } = await pg.query(`SELECT count(*)::int AS n FROM "${S}".log_attribution_candidates WHERE ${where}`, [String(days)])
const { rows: [{ unreviewed }] } = await pg.query(`SELECT count(*)::int AS unreviewed FROM "${S}".log_attribution_candidates WHERE classification IS NULL`)
console.log(`retention ${days} days · due for pruning: ${n} · unreviewed (never pruned): ${unreviewed}`)
if (!dry && n) {
  const r = await pg.query(`UPDATE "${S}".log_attribution_candidates SET surrounding = NULL, composed = NULL, evidence_pruned_at = now(), updated_at = now() WHERE ${where}`, [String(days)])
  console.log(`✓ pruned ${r.rowCount} row(s) — spans, sources and judgements kept`)
} else if (dry) console.log('(dry run — nothing written)')
await pg.end()
