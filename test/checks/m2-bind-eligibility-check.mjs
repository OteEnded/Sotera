// ⭐⭐⭐ BIND ELIGIBILITY IS **OBSERVED**, NOT REMEMBERED — and the detector can actually SEE.
//
//   node test/checks/m2-bind-eligibility-check.mjs
//
// Ote, 2026-09-04: *"Eligibility should be observed continuously rather than remembered."* ⇒ the rule now
// rides the boot + daily cron pass beside the memory-integrity lint, for the reason that lint exists:
// *"we shouldn't have to discover violations accidentally while investigating something else."*
//
// ── ⚠️⚠️ THE FAILURE THIS CHECK IS SHAPED AGAINST ─────────────────────────────────────────────────
// The detector's healthy output is **an empty list**, and an empty list is exactly what a BLIND detector
// returns. ⛔ *"No slot became eligible"* and *"the query cannot see an eligible slot"* look identical in
// a log. ⇒ ⭐⭐⭐ **PART C BUILDS A GENUINELY ELIGIBLE SLOT AND REQUIRES THE DETECTOR TO FIND IT.** Without
// that, every quiet night this thing produces is worthless.
//
// ⛔ Writes only to agent_dev, only `zz_` addresses, and removes every row it makes.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import {
  bindEligibility, eligibilitySummaryLine, CAPABLE_SOURCE, ADJUDICATED,
} from '../../Backend/app/components/memory-bind-eligibility-host.js'

const { check, done } = makeChecker('m2-bind-eligibility')
loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows

const t = Date.now()
const OKLABEL = `zz_elig_capable_${t}`      // superseded ONLY by capable writers ⇒ must be FOUND
const BADLABEL = `zz_elig_extractor_${t}`   // superseded by the extractor        ⇒ must be EXCLUDED
const made = []

const mkSlot = async (userId, label) => {
  const [r] = await q(
    `INSERT INTO ${S}."mst_slots" (id, persona, user_id, entity, namespace, canonical_label, write_count, created_at, updated_at)
     VALUES (gen_random_uuid(), NULL, $1::uuid, 'user', 'default', $2, 0, now(), now()) RETURNING id::text`,
    [userId, label])
  made.push(r.id); return r.id
}
/** ⭐ A row placed directly, so the fixture's WRITE HISTORY is exactly what the rule reads. */
const mkRow = async (userId, slotId, label, source, supersedes) => {
  const [r] = await q(
    `INSERT INTO ${S}."txn_memories"
       (id, user_id, kind, namespace, entity, attribute, value, content, importance, source,
        supersedes_id, slot_id, valid_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'semantic', 'default', 'user', $2, 'v', 'zz_elig', 5, $3,
             $4::uuid, $5::uuid, now(), now(), now()) RETURNING id::text`,
    [userId, label, source, supersedes, slotId])
  return r.id
}

try {
  const [me] = await q(`SELECT id::text AS id FROM ${S}."mst_users" WHERE username = 'agent_dev'`)
  if (!me) throw new Error('agent_dev not found — ⛔ this check must never run as root')

  // ══ A · THE RULE ITSELF, asserted against the DECLARED predicate ════════════════════════════════
  check('A1 · ⭐ capable writers are exactly: an operator act, and the model tool',
    CAPABLE_SOURCE(null) === true && CAPABLE_SOURCE('model-tool') === true)
  check('A2 · ⛔ the auto-extractor, migrations and doc ingest are NOT capable — and an UNKNOWN writer '
    + 'fails CLOSED, because a writer nobody has classified is a writer nobody has checked',
  CAPABLE_SOURCE('conversation:abc') === false && CAPABLE_SOURCE('reconcile:rome-2026-09-02') === false
  && CAPABLE_SOURCE('doc:whatever') === false && CAPABLE_SOURCE('some-future-writer') === false)

  // ══ B · THE LIVE CORPUS TODAY — the state Ote ratified ══════════════════════════════════════════
  const before = await bindEligibility(db)
  check('B1 · the rule runs against the live corpus', before.ok === true, eligibilitySummaryLine(before))
  check('B2 · ⭐ the canary is the ONLY bound slot', before.bound === 1, `bound=${before.bound}`)
  check('B3 · ⭐⭐ nothing is newly eligible — the two real-data slots are held apart with their rulings, '
    + '⛔ so a settled question is not re-asked nightly',
  before.eligible.length === 0 && before.adjudicated.length === Object.keys(ADJUDICATED).length,
  `newly-eligible=${before.eligible.length} already-ruled-on=${before.adjudicated.length}`)
  check('B4 · ⛔ …and `timezone` is EXCLUDED by the extractor, ⛔ not merely un-ruled-on',
    before.excluded.some((e) => e.label === 'timezone' && e.blockers.some((b) => b.startsWith('conversation:'))),
    JSON.stringify(before.excluded.map((e) => e.label)))

  // ══ C · ⭐⭐⭐ THE POSITIVE CONTROL — CAN IT SEE ONE? ════════════════════════════════════════════
  // ⛔ Without this every quiet night is indistinguishable from a broken query.
  const okSlot = await mkSlot(me.id, OKLABEL)
  const first = await mkRow(me.id, okSlot, OKLABEL, 'model-tool', null)
  await mkRow(me.id, okSlot, OKLABEL, 'model-tool', first)
  const withOne = await bindEligibility(db)
  check('C1 · ⭐⭐⭐ A NEWLY ELIGIBLE SLOT IS DETECTED — the detector is not blind, so its silence means '
    + 'something', withOne.eligible.some((e) => e.label === OKLABEL),
  `eligible=${JSON.stringify(withOne.eligible.map((e) => e.label))}`)
  check('C1b · ⭐ …and it appears in the SUMMARY LINE the cron pass logs, ⛔ not only in the object',
    eligibilitySummaryLine(withOne).includes(OKLABEL), eligibilitySummaryLine(withOne))
  check('C1c · ⛔ the line carries ADDRESSES and counts only — ⛔ no value, no room, no content',
    !eligibilitySummaryLine(withOne).includes('agent_dev') && !eligibilitySummaryLine(withOne).includes("'v'"))

  // ⭐ …and ONE extractor supersede is enough to exclude the very same slot.
  const badSlot = await mkSlot(me.id, BADLABEL)
  const bFirst = await mkRow(me.id, badSlot, BADLABEL, 'model-tool', null)
  await mkRow(me.id, badSlot, BADLABEL, `conversation:zz_${t}`, bFirst)
  const withBoth = await bindEligibility(db)
  check('C2 · ⭐⭐ ONE extractor supersede EXCLUDES a slot whose other writer is capable — ⛔ the rule is '
    + '"every writer", not "some writer"',
  withBoth.excluded.some((e) => e.label === BADLABEL)
  && !withBoth.eligible.some((e) => e.label === BADLABEL),
  `excluded=${JSON.stringify(withBoth.excluded.filter((e) => e.label.startsWith('zz_elig')).map((e) => e.label))}`)

  // ⭐ A slot that has NEVER been superseded is not a candidate at all — ⛔ not "eligible", not "excluded".
  const quiet = await mkSlot(me.id, `zz_elig_quiet_${t}`)
  await mkRow(me.id, quiet, `zz_elig_quiet_${t}`, 'model-tool', null)
  const withQuiet = await bindEligibility(db)
  const named = [...withQuiet.eligible, ...withQuiet.excluded, ...withQuiet.adjudicated].map((e) => e.label)
  check('C3 · ⛔ a NEVER-SUPERSEDED slot is not listed in ANY bucket — only an UPDATE is governed, so '
    + 'binding one would be governance with nothing to govern',
  !named.includes(`zz_elig_quiet_${t}`), `listed=${JSON.stringify(named.filter((n) => n.startsWith('zz_elig')))}`)
} catch (e) {
  check('the eligibility check ran to completion', false, e?.message ?? String(e))
} finally {
  try {
    await pg.query(`DELETE FROM ${S}."txn_memories" WHERE attribute LIKE 'zz_elig_%'`)
    await pg.query(`DELETE FROM ${S}."mst_slots" WHERE canonical_label LIKE 'zz_elig_%'`)
  } catch (e) { check('teardown ran', false, e?.message) }
  const after = await bindEligibility(db)
  const [res] = await q(
    `SELECT (SELECT count(*)::int FROM ${S}."txn_memories" WHERE attribute LIKE 'zz_elig_%') AS m,
            (SELECT count(*)::int FROM ${S}."mst_slots" WHERE canonical_label LIKE 'zz_elig_%') AS s`)
  check('⭐ teardown ASSERTED — and the eligibility picture is back exactly where it started',
    res.m === 0 && res.s === 0 && after.ok && after.eligible.length === 0 && after.bound === 1,
    `memories=${res.m} slots=${res.s} · ${eligibilitySummaryLine(after)}`)
  await pg.end()
  await db.txn_memories.sequelize.close()
  done()
}
