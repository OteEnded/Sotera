// ⭐ MEASUREMENT for the async-refusal derivation. ⛔ READ-ONLY.
//
//   node test/maintenance/measure-keep-latency.mjs
//
// ⚠️ THE QUESTION: if `keep()` awaited the write it enqueues, HOW LONG WOULD THE MODEL'S TURN WAIT?
// Ote: *"measure caller requirements before changing it."* A recommendation to await is worthless without
// the number, because `keep` sits on a USER-FACING turn while `retain` does not.
//
// It reads `log_tool_calls`, which already carries `durationMs` per call — ⭐ REAL measured turns, ⛔ not
// a synthetic probe. Three things are asked of it:
//   ① what does `keep` cost TODAY (returning immediately)?
//   ② what does a turn ALREADY tolerate from other tools — the budget that exists in practice?
//   ③ what does `retain` cost, given it ALREADY awaits the same lane with a 20 s bound?
import { devPg, devSchema } from '../harness.mjs'

const S = `"${devSchema()}"`
const c = devPg(); await c.connect()
const q = async (sql, a = []) => (await c.query(sql, a)).rows

const cols = await q(
  `SELECT column_name FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = 'log_tool_calls' ORDER BY ordinal_position`,
  [devSchema()])
if (!cols.length) { console.log('⛔ log_tool_calls does not exist in this schema'); await c.end(); process.exit(1) }
console.log(`log_tool_calls columns: ${cols.map((r) => r.column_name).join(', ')}\n`)

const dur = cols.some((r) => r.column_name === 'duration_ms') ? 'duration_ms'
  : (cols.some((r) => r.column_name === 'durationms') ? 'durationms' : null)
if (!dur) { console.log('⛔ no duration column found'); await c.end(); process.exit(1) }

console.log('── ① · every tool, by measured duration (n ≥ 3) ───────────────────────')
console.table(await q(
  `SELECT tool, count(*)::int AS n,
          min(${dur})::int AS min_ms,
          percentile_disc(0.5) WITHIN GROUP (ORDER BY ${dur})::int AS p50_ms,
          percentile_disc(0.95) WITHIN GROUP (ORDER BY ${dur})::int AS p95_ms,
          max(${dur})::int AS max_ms
     FROM ${S}."log_tool_calls" WHERE ${dur} IS NOT NULL
    GROUP BY tool HAVING count(*) >= 3 ORDER BY p95_ms DESC`))

console.log('── ② · the two retention doors specifically ───────────────────────────')
console.table(await q(
  `SELECT tool, count(*)::int AS n, min(${dur})::int AS min_ms,
          percentile_disc(0.5) WITHIN GROUP (ORDER BY ${dur})::int AS p50_ms,
          max(${dur})::int AS max_ms, max(created_at) AS last_seen
     FROM ${S}."log_tool_calls" WHERE tool IN ('keep', 'retain', 'remember_fact', 'remember')
      AND ${dur} IS NOT NULL GROUP BY tool ORDER BY tool`))

console.log('── ③ · what a turn ALREADY tolerates — the slowest single calls seen ──')
console.table(await q(
  `SELECT tool, ${dur}::int AS ms, created_at FROM ${S}."log_tool_calls"
    WHERE ${dur} IS NOT NULL ORDER BY ${dur} DESC LIMIT 10`))

await c.end()
