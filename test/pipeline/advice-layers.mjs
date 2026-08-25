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
    `SELECT direction, attested, length(content) AS len, latency_ms, created_at
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

  // ⭐⭐⭐ WHEN EACH LAYER MOVED — Ote: *"include the timestamps so we can distinguish
  // Hermes completed at T / binding knew at T? / exchange changed at T? / Sotera received at T?"*
  const iso = (t) => (t ? new Date(t).toISOString().replace('T', ' ').slice(0, 19) : null)
  const theirT = theirs?.updated_at ? iso(theirs.updated_at * 1000) : null
  console.log('  ── when')
  console.log(`     opened_at        : ${iso(r.opened_at)}`)
  console.log(`     L1 their terminal: ${L1done ? theirT : '— (not terminal)'}`)
  // ⚠️⚠️ AND THIS ONE IS THE POINT. The binding has no clock of its own for L1, because it never
  // learns anything until something ASKS. Any "binding knew at T" is the time an INSTRUMENT polled, never a
  // time the product noticed — so it is labelled as mine and never presented as a system event.
  console.log(`     binding noticed  : ${L1done ? 'only when polled — ⛔ the product never asks on its own' : '—'}`)
  // ⚠️ AN OBSERVABILITY GAP, RECORDED: txn_advice_exchanges has opened_at and closed_at and NO updated_at,
  // so a state move that is not terminal (pending→running) leaves NO timestamp at all. L2 is only datable
  // when it CLOSES.
  console.log(`     L2 exchange moved: ${r.closed_at ? iso(r.closed_at) : (L2done ? '(moved, but no timestamp — no updated_at column)' : '— (unchanged)')}`)
  console.log(`     L3 she received  : ${inbound.length ? inbound.map((t) => iso(t.created_at)).join(', ') : '— (nothing)'}`)
}
await cl.end()
