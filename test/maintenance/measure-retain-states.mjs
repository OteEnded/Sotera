// ⭐⭐ THE DECISIVE MEASUREMENT for the async-refusal derivation. ⛔ READ-ONLY.
//
//   node test/maintenance/measure-retain-states.mjs
//
// `retain()` ALREADY awaits the same shared serial write lane that `keep()` discards, bounded at 20 s,
// and records an honest state per decision. ⇒ its recorded states are the empirical answer to *"is
// awaiting the receipt affordable on this lane?"*
//
// ⚠️⚠️ AND THE FIRST THING TO ESTABLISH IS WHETHER THE PRECEDENT IS EXERCISED AT ALL. `record()` swallows
// its own insert failure by design (*"observability must never be load-bearing"*), so an EMPTY decisions
// table has three possible causes and they are not the same finding:
//   ① the inserts never ran      ② they ran and failed silently      ③ they ran and the rows were removed
// ⭐ The SEQUENCE separates them: a sequence that has advanced proves rows were once inserted.
import { devPg, devSchema } from '../harness.mjs'

const S = `"${devSchema()}"`
const c = devPg(); await c.connect()
const q = async (sql, a = []) => (await c.query(sql, a)).rows
const one = async (label, sql, a = []) => { const r = await q(sql, a); console.log(`${label}: ${JSON.stringify(r[0])}`) }

console.log('── ⚠️ IS THE PRECEDENT EXERCISED? ─────────────────────────────────────')
await one('log_retention_decisions rows', `SELECT count(*)::int AS n FROM ${S}."log_retention_decisions"`)
await one('…its rolling_id SEQUENCE (advanced ⇒ rows WERE inserted at some point)',
  `SELECT last_value::int AS last_value, is_called FROM ${S}."log_retention_decisions_rolling_id_seq"`)
await one('log_tool_calls: retain', `SELECT count(*)::int AS n, min(created_at) AS first, max(created_at) AS last
                                       FROM ${S}."log_tool_calls" WHERE tool = 'retain'`)
await one('log_tool_calls: keep', `SELECT count(*)::int AS n, min(created_at) AS first, max(created_at) AS last
                                     FROM ${S}."log_tool_calls" WHERE tool = 'keep'`)

console.log('\n── ⭐ where the retain/keep calls came from ────────────────────────────')
console.table(await q(
  `SELECT tool, origin, ok, count(*)::int AS n FROM ${S}."log_tool_calls"
    WHERE tool IN ('retain','keep') GROUP BY tool, origin, ok ORDER BY tool, n DESC`))

const rows = await q(`SELECT state, count(*)::int AS n FROM ${S}."log_retention_decisions" GROUP BY state ORDER BY n DESC`)
console.log('\n── recorded retention states ──────────────────────────────────────────')
if (!rows.length) console.log('  (no rows)')
else console.table(rows)

await c.end()
