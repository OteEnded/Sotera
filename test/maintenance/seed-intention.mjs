// SEED / CLOSE ONE INTENTION for an account, through the REAL writer.
//
//   node maintenance/seed-intention.mjs agent_dev "what I am trying to do" "why" [reviewInDays]
//   node maintenance/seed-intention.mjs agent_dev --close abandoned "how it ended"
//   node maintenance/seed-intention.mjs agent_dev --show
//   node maintenance/seed-intention.mjs agent_dev --age 40      (backdate: make it stale, for D11)
//
// ⭐ WHY IT GOES THROUGH buildIntention AND NOT AN INSERT. The D9 experiment needs an intention that
// already exists when a fresh conversation opens — as if set in an earlier session. Writing it with raw
// SQL would test a row I hand-made rather than the thing the system actually produces, and it would also
// be an off-lane write, which this store does not permit anywhere else.
//
// ⛔ REFUSES protected accounts. `kavi`/`kavi_alt` are observation accounts holding real data; the whole
// reason this file names them is that a cleanup predicate matching production data has already cost this
// project two incidents in one day.
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildIntention } from '../../Backend/app/components/intention-host.js'

const PROTECTED = new Set(['kavi', 'kavi_alt', 'ote', 'hermes', 'hermes_alias'])

const [username, a1, a2, a3] = process.argv.slice(2)
if (!username) {
  console.error('usage: node maintenance/seed-intention.mjs <username> <intent> [why] [reviewInDays]')
  process.exit(1)
}
if (PROTECTED.has(username) && a1 !== '--show') {
  console.error(`✖ ${username} is a protected account — refusing to write. Use agent_dev.`)
  process.exit(1)
}

const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const seq = db.txn_memories.sequelize
const [user] = await seq.query('SELECT id::text FROM persona_sotera.mst_users WHERE username = :u',
  { replacements: { u: username }, type: seq.QueryTypes.SELECT })
if (!user) { console.error(`✖ no such account: ${username}`); process.exit(1) }

const svc = buildIntention({ db, config, log: null }, { userId: user.id })

let result
if (a1 === '--show') {
  result = await svc.recall()
} else if (a1 === '--close') {
  result = await svc.close({ as: a2 || 'completed', outcome: a3 || null })
} else if (a1 === '--age') {
  // Backdate for the D11 probe. Raw SQL on purpose: no tool may fabricate a past date, and it must not
  // become possible for one to.
  const days = Number(a2 ?? 40)
  await seq.query(
    `UPDATE persona_sotera.txn_intentions
        SET created_at = now() - (:d * INTERVAL '1 day'),
            updated_at = now() - (:d * INTERVAL '1 day'),
            next_review_at = now() - INTERVAL '3 days'
      WHERE state = 'open' AND person_id = (SELECT person_id FROM persona_sotera.mst_users WHERE id = :uid)`,
    { replacements: { d: days, uid: user.id } },
  )
  result = await svc.recall()
} else {
  result = await svc.set({ intent: a1, why: a2 || null, reviewInDays: a3 ? Number(a3) : null })
}

console.log(JSON.stringify(result, null, 1))
await seq.close().catch(() => {})
