// ⭐⭐⭐ THE THREE LAYERS OF "COMPLETION", CAPTURED AT ONE INSTANT AND NEVER COLLAPSED.
//
//   node pipeline/advice-layers.mjs <exchange-id-prefix>
//
// Ote, 2026-08-25: *"distinguish Hermes completing from Sotera becoming aware that Hermes completed…
// Don't collapse those into one 'completion delivery' result."*
//
//     L1  Hermes completes          → THE BINDING CAN KNOW      (their interface says terminal)
//     L2  Hermes completes          → THE EXCHANGE CHANGES      (her row leaves `pending`)
//     L3  Hermes completes          → SOTERA RECEIVES/ACTS      (an inbound turn she can quote)
//
// ⛔ Each is a different question with a different owner, and a system can pass L1 and fail L2 and L3
// forever — which is exactly what the frozen S4 dead letter demonstrates.
//
// ⛔⛔ PEEK ONLY. This NEVER calls service.observe(), which COMMITS: it writes the inbound turn and closes
// the exchange (DESIGN_SOTERA_SEEK_ADVICE §17). An instrument that collects is an instrument that has
// performed the very act it was measuring.
import { readFileSync } from 'node:fs'
import pg from 'pg'

const want = (process.argv[2] || '').toLowerCase()
const cfg = JSON.parse(readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))
const c = cfg.database.connection, S = c.schemas.project
const cl = new pg.Client({ host: c.host, port: c.port, user: c.username, password: c.password, database: c.database })
await cl.connect()

const { rows } = await cl.query(
  `SELECT id::text, destination, mode, state, remote_work_id, opened_at, closed_at, close_reason, turn_count
     FROM "${S}".txn_advice_exchanges ORDER BY rolling_id DESC LIMIT 20`)
const targets = want ? rows.filter((r) => r.id.toLowerCase().startsWith(want)) : rows
if (!targets.length) { console.log('no matching exchange'); await cl.end(); process.exit(1) }

console.log(`snapshot at ${new Date().toISOString()}`)
for (const r of targets) {
  const d = cfg.advice?.destinations?.[r.destination]
  let theirs = null
  if (r.remote_work_id && d) {
    try {
      const res = await fetch(`${d.baseUrl}/v1/runs/${encodeURIComponent(r.remote_work_id)}`,
        { headers: { authorization: `Bearer ${d.key}` } })
      theirs = await res.json().catch(() => null)
    } catch (e) { theirs = { status: `unreachable: ${e.message}` } }
  }
  const turns = (await cl.query(
    `SELECT direction, attested, length(content) AS len, latency_ms
       FROM "${S}".txn_advice_turns WHERE exchange_id = $1 ORDER BY created_at`, [r.id])).rows
  const inbound = turns.filter((t) => t.direction === 'in')

  const L1 = theirs ? String(theirs.status ?? '?') : '(no detached work)'
  const L1done = ['completed', 'failed', 'stopped', 'cancelled', 'error'].includes(L1)
  const L2done = r.state !== 'pending' && r.state !== 'running'
  const L3done = inbound.length > 0

  console.log(`\n══ ${r.id.slice(0, 8)}  ${r.destination}  ${r.mode}`)
  console.log(`  L1 their side      : ${L1}${theirs?.last_event ? `  (${theirs.last_event})` : ''}   ${L1done ? '✅ terminal' : '⏳ not terminal'}`)
  console.log(`  L2 her exchange    : state=${r.state}  closed_at=${r.closed_at ? 'set' : 'null'}  ${L2done ? '✅ moved' : '⛔ unchanged'}`)
  console.log(`  L3 she received    : ${inbound.length} inbound turn(s)${inbound.length ? ` (${inbound.map((t) => `${t.len} chars, attested=${t.attested}`).join('; ')})` : ''}   ${L3done ? '✅ has it' : '⛔ has nothing'}`)
  // ⭐ THE GAP, NAMED. A system can sit here indefinitely and nothing in it is "an error".
  if (L1done && !L2done) console.log('  ⚠️  L1→L2 GAP      : their side is terminal and her record has not moved. Nothing crosses on its own.')
  if (L2done && !L3done) console.log('  ⚠️  L2→L3 GAP      : the exchange closed with no inbound turn — closed, and she received nothing.')
  if (L1done && L3done) console.log('  ✅ full chain      : terminal, moved, and content she can quote.')
}
await cl.end()
