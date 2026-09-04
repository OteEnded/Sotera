// ⭐⭐⭐ THE ROLLBACK, EXERCISED — the namespace kill switch, both directions, on the real canary.
//
//   node test/checks/m2-rollback-check.mjs
//
// Ote, 2026-09-04: *"Rollback: yes, ratified as the namespace kill switch. But before any second bind,
// exercise it on the canary."* ⇒ **A ROLLBACK NOBODY HAS RUN IS A HOPE.**
//
// ── ⭐⭐ WHY THIS IS THE RIGHT MECHANISM, AND WHY IT HAD TO BE PROVED RATHER THAN ARGUED ────────────
// There is no UNBIND — a bound slot is repointable, never removable. So the one-way door of BIND is made
// safe by something else entirely: `mst_namespace_declarations.slot_governed = false` makes EVERY bound
// slot NOT-IN-SCOPE in one statement, with ⛔ no code change and ⛔ no schema change. ⭐ Binds, history
// and existing pins all survive; they simply stop being operative.
//
// ── ⚠️ WHAT THIS CHECK DOES TO THE LIVE CORPUS, STATED PLAINLY ────────────────────────────────────
// It flips the REAL `default` namespace off and on again, for roughly a second. During that window every
// governed slot is ungoverned — ⓘ which today means EXACTLY ONE slot, the disposable canary, and the
// fallback is the legacy reconciliation that ran for the preceding three weeks.
// ⛔⛔ THE RESTORE IS IN `finally` AND IS ASSERTED, ⛔ never assumed: a kill switch that can be left on by
// a crashing test is not a safety mechanism.
//
// ⛔ It writes only to agent_dev's canary slot — the disposable build-tag instrumentation Ote approved.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'
import { createSlotStore } from '../../Backend/app/components/memory-slot-store-host.js'
import { createMemoryV2Service } from '@ote/memory/cognition/memory-v2-service.js'

const { check, done } = makeChecker('m2-rollback')
loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows

const CANARY = 'build tag for this cycle'
const KEY = 'build-tag'
const t = Date.now()
let flipped = false

/** ⭐ An operator writer that names its occasion — the canary's established shape. */
const writer = (userId, occasion) => {
  const store = createSequelizeMemoryStore({ db, persona: null, userId, occasion })
  const slotStore = createSlotStore({ db, persona: null, userId })
  return createMemoryV2Service({ store, slotStore, persona: null, userId })
}
const setGoverned = async (v) => pg.query(
  `UPDATE ${S}."mst_namespace_declarations" SET slot_governed = $1 WHERE namespace_key = 'default'`, [v])
const state = async (slotId) => {
  const rows = await q(
    `SELECT id::text, value, (invalid_at IS NULL AND expired_at IS NULL) AS live,
            question_id_at_admission::text AS pin, supersedes_id::text AS sup
       FROM ${S}."txn_memories" WHERE slot_id = $1::uuid ORDER BY created_at`, [slotId])
  const [meta] = await q(
    `SELECT s.question_id::text AS qid, qq.question_key,
            (SELECT count(*)::int FROM ${S}."log_slot_bindings" WHERE slot_id = s.id) AS bindings
       FROM ${S}."mst_slots" s LEFT JOIN ${S}."mst_slot_questions" qq ON qq.id = s.question_id
      WHERE s.id = $1::uuid`, [slotId])
  return { rows, live: rows.filter((r) => r.live), pinned: rows.filter((r) => r.pin).length, ...meta }
}

try {
  const [me] = await q(`SELECT id::text AS id FROM ${S}."mst_users" WHERE username = 'agent_dev'`)
  if (!me) throw new Error('agent_dev not found — ⛔ this check must never run as root')
  const [slot] = await q(
    `SELECT id::text FROM ${S}."mst_slots" WHERE canonical_label = $1 AND user_id = $2::uuid`, [CANARY, me.id])
  if (!slot) throw new Error('the canary slot is missing — ⛔ stop')
  const slotId = slot.id

  // ══ ① BEFORE — the canary IS governed, and an unkinded UPDATE is REFUSED ════════════════════════
  const S0 = await state(slotId)
  check('① precondition — the canary is BOUND, with one live row and its history intact',
    S0.question_key === KEY && S0.live.length === 1 && S0.rows.length >= 4,
    `asks=${S0.question_key} rows=${S0.rows.length} live=${S0.live.length} pinned=${S0.pinned}`)
  const w0 = writer(me.id, `zz_rb_pre_${t}`)
  let refusedWhileGoverned = null
  try {
    await w0.reconcileFact({ entity: 'user', attribute: CANARY, value: `zz_rb_governed_probe_${t}` })
  } catch (e) { refusedWhileGoverned = e }
  check('②* ⭐⭐⭐ GOVERNED — an UPDATE with no claim kind is REFUSED. ⛔ Without this the rollback below '
    + 'would prove nothing: "it worked after" needs "it was blocked before"',
  refusedWhileGoverned?.code === 'REPLACEMENT_REFUSED',
  refusedWhileGoverned ? `${refusedWhileGoverned.code}` : 'NOT REFUSED')

  // ══ ③ THE KILL SWITCH ═══════════════════════════════════════════════════════════════════════════
  await setGoverned(false); flipped = true
  const [ns] = await q(
    `SELECT slot_governed FROM ${S}."mst_namespace_declarations" WHERE namespace_key = 'default'`)
  check('③ the kill switch is thrown — one statement, no code change, no schema change',
    ns.slot_governed === false, `slot_governed=${ns.slot_governed}`)

  // ══ ④ THE SAME WRITE IS NOW NOT-IN-SCOPE, AND LEGACY RECONCILIATION RESUMES ══════════════════════
  const w1 = writer(me.id, `zz_rb_off_${t}`)
  const off = await w1.reconcileFact({ entity: 'user', attribute: CANARY, value: `CANARY-ROLLBACK-${t % 1000000}` })
  check('④ ⭐⭐⭐ THE IDENTICAL WRITE NOW SUCCEEDS — the gate is NOT-IN-SCOPE and legacy reconciliation is '
    + 'the authority again', off?.ok === true && off?.action === 'update',
  JSON.stringify({ ok: off?.ok, action: off?.action }))
  const Soff = await state(slotId)
  check('④a · ⭐⭐ legacy reconciliation behaved EXACTLY as it always did — it superseded, and exactly one '
    + 'row is live', Soff.live.length === 1 && Soff.live[0].sup === S0.live[0].id,
  `live=${Soff.live.length} supersedes=${Soff.live[0]?.sup?.slice(0, 8)} prior=${S0.live[0].id.slice(0, 8)}`)
  check('④b · ⛔ …and the ungoverned write earned NO pin, because no kind gate was applied to it',
    Soff.live[0].pin === null, `pin=${Soff.live[0].pin}`)

  // ══ ⑤ BINDING, HISTORY AND EXISTING PINS ARE UNTOUCHED ══════════════════════════════════════════
  check('⑤ ⭐⭐⭐ THE BIND SURVIVED THE ROLLBACK — the slot still asks the same question, and the binding '
    + 'audit is unchanged',
  Soff.question_key === KEY && Soff.qid === S0.qid && Soff.bindings === S0.bindings,
  `asks=${Soff.question_key} bindings=${Soff.bindings} (was ${S0.bindings})`)
  check('⑤a · ⭐⭐ …and EVERY EXISTING PIN REMAINS. ⛔ Rolling back must not rewrite history: a pin records '
    + 'what WAS admitted, and that fact did not stop being true',
  Soff.pinned === S0.pinned && Soff.pinned > 0, `pinned now=${Soff.pinned} before=${S0.pinned}`)
  const kept = S0.rows.every((r) => Soff.rows.some((n) => n.id === r.id && n.value === r.value && n.pin === r.pin))
  check('⑤b · ⭐ …and no prior row changed at all — same ids, same values, same pins',
    kept, `prior rows preserved: ${kept}`)

  // ══ ⑥ RESTORE ═══════════════════════════════════════════════════════════════════════════════════
  await setGoverned(true); flipped = false
  const [ns2] = await q(
    `SELECT slot_governed FROM ${S}."mst_namespace_declarations" WHERE namespace_key = 'default'`)
  check('⑥ the switch is restored', ns2.slot_governed === true, `slot_governed=${ns2.slot_governed}`)

  // ══ ⑦ GOVERNANCE RETURNS — both halves, so "restored" is not a claim about a flag ════════════════
  const w2 = writer(me.id, `zz_rb_on_${t}`)
  let refusedAgain = null
  try {
    await w2.reconcileFact({ entity: 'user', attribute: CANARY, value: `zz_rb_should_never_land_${t}` })
  } catch (e) { refusedAgain = e }
  check('⑦ ⭐⭐⭐ GOVERNANCE RETURNED — the unkinded UPDATE is REFUSED once more',
    refusedAgain?.code === 'REPLACEMENT_REFUSED', refusedAgain ? refusedAgain.code : 'NOT REFUSED')
  const w3 = writer(me.id, `zz_rb_on_allow_${t}`)
  const back = await w3.reconcileFact({
    entity: 'user', attribute: CANARY, value: `CANARY-RESTORED-${t % 1000000}`, claimKind: KEY,
  })
  const Son = await state(slotId)
  check('⑦a · ⭐⭐⭐ …and a PROPERLY KINDED update is ALLOWED and PINNED again — ⛔ "refuses everything" is '
    + 'not the same as "governance returned"',
  back?.ok === true && Son.live.length === 1 && Son.live[0].pin !== null,
  `ok=${back?.ok} live=${Son.live.length} pin=${Son.live[0]?.pin?.slice(0, 8)}`)
  const [leak] = await q(
    `SELECT count(*)::int AS n FROM ${S}."txn_memories" WHERE value LIKE 'zz_rb_%'`)
  check('⑦b · ⛔ not one refused probe was written, in either direction', leak.n === 0, `rows=${leak.n}`)
} catch (e) {
  check('the rollback check ran to completion', false, e?.message ?? String(e))
} finally {
  // ⛔⛔ THE SWITCH MUST NEVER BE LEFT OFF BY A CRASHING TEST.
  try { if (flipped) await setGoverned(true) } catch (e) { check('emergency restore', false, e?.message) }
  const [final] = await q(
    `SELECT (SELECT slot_governed FROM ${S}."mst_namespace_declarations" WHERE namespace_key = 'default') AS governed,
            (SELECT count(*)::int FROM ${S}."mst_slots" WHERE question_id IS NOT NULL) AS bound,
            (SELECT count(*)::int FROM ${S}."txn_memories" m JOIN ${S}."mst_slots" s ON s.id = m.slot_id
              WHERE s.canonical_label = $1 AND m.invalid_at IS NULL AND m.expired_at IS NULL) AS canary_live`,
    [CANARY])
  check('⭐⭐ FINAL STATE ASSERTED — the namespace is governed again, the canary is still the ONLY bound '
    + 'slot, and it holds exactly one live row',
  final.governed === true && final.bound === 1 && final.canary_live === 1,
  `slot_governed=${final.governed} bound_slots=${final.bound} canary_live=${final.canary_live}`)
  await pg.end()
  await db.txn_memories.sequelize.close()
  done()
}
