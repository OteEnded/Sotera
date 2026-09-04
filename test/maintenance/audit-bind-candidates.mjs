// ⭐⭐ THE BIND-CANDIDATE AUDIT — the human-readable face of `memory-bind-eligibility-host`.
//
//   node test/maintenance/audit-bind-candidates.mjs
//
// ⛔ READ-ONLY. Binds nothing, changes nothing.
//
// ⚠️⚠️ THE RULE IS NOT IMPLEMENTED HERE. It lives in `Backend/app/components/memory-bind-eligibility-host.js`
// and the CRON pass calls the same function on every boot + daily tick, so eligibility is OBSERVED rather
// than remembered (Ote, 2026-09-04). ⛔ A second copy of the rule would be a second rule, and the one
// nobody reruns is the one that goes stale — this file only RENDERS.
//
// ── ⭐ THE RATIFIED CONTAINMENT RULE ───────────────────────────────────────────────────────────────
//     A slot may be bound only if EVERY writer that has ever superseded a row in it can declare a claim
//     kind AND name an occasion.
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { devPg, devSchema } from '../harness.mjs'
import { bindEligibility, eligibilitySummaryLine, ADJUDICATED } from '../../Backend/app/components/memory-bind-eligibility-host.js'

loadConfig()
const db = await initDB(); setDB(db)
db.txn_memories.sequelize.options.logging = false
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const room = async (id) => {
  const [r] = (await pg.query(
    `SELECT coalesce(u.username, '(no room)') AS room FROM ${S}."mst_slots" s
       LEFT JOIN ${S}."mst_users" u ON u.id = s.user_id WHERE s.id = $1::uuid`, [id])).rows
  return r?.room ?? '?'
}

const r = await bindEligibility(db)
console.log(`══ M2 BIND ELIGIBILITY ══\n${eligibilitySummaryLine(r)}\n`)

const section = async (title, list, extra = () => '') => {
  console.log(`── ${title} (${list.length})`)
  for (const e of list) {
    console.log(`   ${e.entity} / ${e.label}`)
    console.log(`      room=${await room(e.id)}  slot=${e.id.slice(0, 8)}  supersedes=${e.supersedes}`)
    console.log(`      superseding writers: ${JSON.stringify(e.writers)}`)
    const x = extra(e); if (x) console.log(`      ${x}`)
  }
  if (!list.length) console.log('   (none)')
  console.log('')
}

await section('⭐⭐ NEWLY ELIGIBLE — nobody has ruled on these yet', r.eligible,
  () => '⏸ ⛔ eligibility grants NOTHING. A bind is a separate, deliberate, approved act.')
await section('ⓘ ELIGIBLE BUT ALREADY RULED ON', r.adjudicated, (e) => `⛔ ${e.ruling}`)
await section('⛔ EXCLUDED by the containment rule', r.excluded,
  (e) => `⛔ blocked by: ${JSON.stringify(e.blockers)}`)

console.log(`ⓘ bound slots: ${r.bound}`)
console.log(`ⓘ slots that have NEVER been superseded are not listed at all — only an UPDATE is governed,`)
console.log(`  so binding one would be governance with nothing to govern.`)
console.log(`ⓘ adjudicated set is declared in the host, with a date and a reason per entry:`)
for (const [k, v] of Object.entries(ADJUDICATED)) console.log(`  · ${k} — ${v}`)
await pg.end(); await db.txn_memories.sequelize.close()
