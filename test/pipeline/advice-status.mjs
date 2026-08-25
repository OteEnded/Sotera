// WHAT IS SOTERA'S OUTSTANDING WORK DOING RIGHT NOW?
//
//   node pipeline/advice-status.mjs            all open exchanges
//   node pipeline/advice-status.mjs --all      including closed ones
//
// ⭐⭐⭐ THIS IS THE **BINDING** SIDE, AND THAT IS THE WHOLE POINT. Ote: *"an out-of-band watcher knowing
// Hermes finished is not enough. Something has to cross the boundary if Sotera is supposed to react."*
// ⇒ everything this prints is available to US. ⛔ NONE of it reaches her unless she calls seek_advice
// herself with `check`. Reading it here changes nothing on her side, which is exactly what makes it a
// safe observation instrument during a live experiment.
//
// ⛔ READ-ONLY. No writes, no Sotera turn, no state change.
import { readFileSync } from 'node:fs'
import pg from 'pg'

const cfg = JSON.parse(readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))
const c = cfg.database.connection
const S = c.schemas.project
const cl = new pg.Client({ host: c.host, port: c.port, user: c.username, password: c.password, database: c.database })
await cl.connect()

const all = process.argv.includes('--all')
const { rows } = await cl.query(
  `SELECT id::text, destination, mode, state, remote_work_id, opened_at, closed_at, close_reason,
          turn_count, LEFT(brief, 90) AS brief
     FROM "${S}".txn_advice_exchanges
    ${all ? '' : "WHERE closed_at IS NULL"}
    ORDER BY rolling_id DESC LIMIT 20`)

if (!rows.length) { console.log('no exchanges'); await cl.end(); process.exit(0) }

for (const r of rows) {
  const mins = Math.round((Date.now() - new Date(r.opened_at).getTime()) / 60000)
  console.log(`\n${r.id.slice(0, 8)}  ${r.destination}  ${r.mode}`)
  console.log(`  sotera's record : state=${r.state}  turns=${r.turn_count}  opened ${mins} min ago` +
    (r.closed_at ? `  closed(${r.close_reason})` : '  ⏳ never closed'))
  if (r.brief) console.log(`  brief           : ${String(r.brief).replace(/\s+/g, ' ')}…`)
  if (!r.remote_work_id) { console.log('  (converse — no detached work)'); continue }

  // ⭐ THE COUNTERPART'S OWN VIEW, asked through its interface. ⛔ Never its internals.
  const d = cfg.advice?.destinations?.[r.destination]
  if (!d) { console.log('  destination not configured here'); continue }
  try {
    const res = await fetch(`${d.baseUrl}/v1/runs/${encodeURIComponent(r.remote_work_id)}`,
      { headers: { authorization: `Bearer ${d.key}` } })
    const j = await res.json().catch(() => null)
    const idle = j?.updated_at ? Math.round(Date.now() / 1000 - j.updated_at) : null
    console.log(`  their side      : status=${j?.status ?? `http_${res.status}`}` +
      (j?.last_event ? `  last_event=${j.last_event}` : '') +
      (idle !== null ? `  idle=${idle}s` : ''))
    // ⚠️ THE LINE THAT MATTERS DURING THIS EXPERIMENT.
    if (j?.status && j.status !== 'running' && j.status !== 'queued' && r.state === 'pending') {
      console.log('  ⚠️  DIVERGED       : their side is terminal, HER record still says pending.')
      console.log('     ⇒ the binding can know. Sotera does not. Nothing crosses that boundary today.')
    }
  } catch (e) { console.log(`  their side      : unreachable (${e.message})`) }
}
await cl.end()
