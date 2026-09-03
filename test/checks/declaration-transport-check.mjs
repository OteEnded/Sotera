// ⭐⭐⭐ THE TRANSPORT POSITIVE CONTROL — does `claimKind` SURVIVE EVERY BOUNDARY?
//
//   node test/checks/declaration-transport-check.mjs
//
// ── ⚠️⚠️ WHY THIS CHECK EXISTS, AND WHY IT ASSERTS AT EACH BOUNDARY RATHER THAN AT THE END ─────────
// This project has now lost a field to a closed field list ELEVEN times, TWICE in the last day:
//   · Sequelize dropped `question_id_at_admission` because the model did not declare it — no error, and
//     the assertions expecting NULL were passing;
//   · `reconcileFact`'s destructure would have dropped `claimKind` in exactly the same silence.
//
// ⭐⭐ So an end-to-end assertion is not enough. If only the endpoint is checked, a failure does not say
// WHICH boundary ate the value — and a pass does not establish that each one carried it, only that the
// composition happened to work. ⇒ every boundary is asserted separately:
//
//     caller → reconcileFact (destructure) → store.create (row) → the ORM/INSERT → the enforcement seam
//
// ⛔ And per Ote: no green is accepted where the expected value is merely NULL. The POSITIVE path runs
// first; the absent-kind case is a control that follows it.
//
// ⛔ Writes only to agent_dev, and removes every row it makes.
import { makeChecker, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'
import { createSlotStore } from '../../Backend/app/components/memory-slot-store-host.js'
import { createMemoryV2Service } from '@ote/memory/cognition/memory-v2-service.js'
import { declareQuestion, proposeBind, confirmBind } from '../../Backend/app/components/memory-declaration-host.js'

const { check, done } = makeChecker()
loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const schema = devSchema()
const seq = db.txn_memories.sequelize
const query = async (sql, p = []) => ({ rows: await seq.query(sql, { bind: p, type: 'SELECT' }) })
const Q = (s, r = {}) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })
const X = (s, r = {}) => seq.query(s, { replacements: r })

const t = Date.now()
const KEY = `zz_tx_${t}`
const ATTR = `zz_tx_attr_${t}`
const MADE = []
let userId = null
let slotId = null

// ⭐⭐ THE BASELINE, ⛔ NOT ZERO. Ote bound the first real slot on 2026-09-03, so `log_slot_bindings` is
// now legitimately non-empty forever — there is no UNBIND. A teardown that asserts the TABLE IS EMPTY is
// asserting an absence with no date, and it went red the moment the system did the thing it was built for.
// ⇒ residue means *what THIS check left behind*, which is a DELTA against the state it found.
const [{ b: BASE_BINDINGS }] = await Q(`SELECT count(*)::int AS b FROM "${schema}"."log_slot_bindings"`)

try {
  const [u] = await Q(`SELECT id::text FROM "${schema}"."mst_users" WHERE username = 'agent_dev'`)
  if (!u) throw new Error('agent_dev not found — this check must never run as root')
  userId = u.id

  const realStore = createSequelizeMemoryStore({ db, persona: null, userId })
  // ⭐ BOUNDARY SPY — wraps the real store and records the row `reconcileFact` handed it. It DELEGATES,
  // so what is asserted below is the row that genuinely went on to be written, ⛔ not a stub's echo.
  const seen = []
  const store = new Proxy(realStore, {
    get: (target, prop) => (prop !== 'create' ? Reflect.get(target, prop)
      : async (row) => { seen.push(row); const r = await target.create(row); MADE.push(r.id); return r }),
  })
  const slotStore = createSlotStore({ db, persona: null, userId })
  const mem = createMemoryV2Service({ store, slotStore, persona: null, userId })

  // ── 1 · THE POSITIVE PATH FIRST — a caller supplies a kind ──────────────────────────────────────
  const w1 = await mem.reconcileFact({ entity: 'user', attribute: ATTR, value: 'first', claimKind: KEY })
  check('1 · reconcileFact accepted the write', w1?.ok === true, JSON.stringify(w1?.action ?? w1))
  slotId = seen[0]?.slot_id ?? null

  // ⭐⭐ BOUNDARY A — the destructure. Had `claimKind` not been in the signature it would be gone here.
  check('1a · ⭐⭐ BOUNDARY A — `claimKind` SURVIVED reconcileFact\'s field list and reached store.create',
    seen[0]?.claimKind === KEY, `row.claimKind=${seen[0]?.claimKind}`)
  check('1b · ⭐ …and the write really did resolve a SLOT, so there is something to govern',
    !!slotId, `slot_id=${slotId}`)

  // ⭐⭐ BOUNDARY B — the ORM/INSERT. The pin is only written when the gate ALLOWed, so its presence
  // proves the kind crossed the store's strip, the gate, the model declaration and the INSERT itself.
  // ⚠️ At this point the slot is UNBOUND, so ALLOW is impossible and the pin must be NULL — that is
  // correct, and it is why the real boundary proof comes after the bind, at step 3.
  const [row1] = await Q(
    `SELECT question_id_at_admission::text AS pin FROM "${schema}"."txn_memories" WHERE id = :i`, { i: w1.id })
  check('1c · an UNGOVERNED slot yields no pin — the kind travelled, and there was nothing to admit under',
    row1?.pin === null, `pin=${row1?.pin}`)

  // ── 2 · DECLARE + BIND, so the slot becomes governed ────────────────────────────────────────────
  const d = await declareQuestion({
    query, schema, questionKey: KEY, asks: 'what is the status?', checks: ['nonempty'],
    declaredBy: 'transport', occasion: `zz_occ_d_${t}`,
  })
  const p = await proposeBind({
    query, schema, slotId, questionId: d.question.id, declaredIntent: 'first-bind',
    actor: 'transport', occasion: `zz_occ_p_${t}`, reason: 'transport control',
  })
  const c = await confirmBind({
    query, schema, proposalId: p.proposal.id, actor: 'transport', occasion: `zz_occ_c_${t}`, reason: 'transport control',
  })
  check('2 · the slot is now GOVERNED', c.ok === true, c.why ?? '')

  // ── 3 · ⭐⭐⭐ THE FULL PATH — a governed UPDATE, through the real writer, ALLOWed and SUPERSEDING ──
  const w2 = await mem.reconcileFact({ entity: 'user', attribute: ATTR, value: 'second', claimKind: KEY })
  check('3 · ⭐⭐⭐ a GOVERNED UPDATE through reconcileFact is ALLOWED', w2?.ok === true, JSON.stringify(w2?.action))
  const [row2] = await Q(
    `SELECT question_id_at_admission::text AS pin, supersedes_id::text AS sup
       FROM "${schema}"."txn_memories" WHERE id = :i`, { i: w2.id })
  check('3a · ⭐⭐⭐ THE POSITIVE CONTROL — the kind survived EVERY boundary and the row is PINNED to the '
    + 'declared question. ⛔ Not a green built on an expected NULL',
  row2?.pin === d.question.id, `pin=${row2?.pin} expected=${d.question.id}`)
  check('3b · ⭐⭐ …and it really was a REPLACEMENT — the supersedes pointer is set',
    !!row2?.sup, `supersedes=${row2?.sup}`)
  const [prior] = await Q(
    `SELECT (invalid_at IS NOT NULL) AS retired FROM "${schema}"."txn_memories" WHERE id = :i`, { i: w1.id })
  check('3c · ⭐ …and the previous belief was retired, so exactly one live row remains',
    prior?.retired === true)

  // ── 4 · THE CONTROL THAT FOLLOWS, ⛔ never leads — the same call with NO kind is REFUSED ─────────
  let refused = null
  try { await mem.reconcileFact({ entity: 'user', attribute: ATTR, value: 'third' }) }
  catch (e) { refused = e }
  check('4 · ⭐⭐ the SAME writer with NO claimKind is REFUSED on the now-governed slot — an absent kind '
    + 'is not permission', refused?.code === 'REPLACEMENT_REFUSED', refused?.message ?? 'NOT refused')
  check('4a · ⭐ absent stays ABSENT — the package added no default and invented no fallback',
    Object.hasOwn(seen.at(-1) ?? {}, 'claimKind') === false,
    `keys included claimKind: ${Object.hasOwn(seen.at(-1) ?? {}, 'claimKind')}`)
  const [after] = await Q(
    `SELECT count(*)::int AS n FROM "${schema}"."txn_memories"
      WHERE slot_id = :s AND invalid_at IS NULL AND expired_at IS NULL`, { s: slotId })
  check('4b · ⭐⭐ the refusal left the world as it found it — still exactly ONE live row',
    after.n === 1, `live=${after.n}`)
} catch (e) {
  check('the transport check ran to completion', false, e?.message ?? String(e))
} finally {
  try {
    for (const id of MADE) await X(`DELETE FROM "${schema}"."txn_memories" WHERE id = :i`, { i: id })
    await X(`DELETE FROM "${schema}"."txn_memories" WHERE attribute = :a`, { a: ATTR })
    if (slotId) {
      await X(`DELETE FROM "${schema}"."log_slot_bindings" WHERE slot_id = :i`, { i: slotId })
      await X(`UPDATE "${schema}"."mst_slots" SET question_id = NULL WHERE id = :i`, { i: slotId })
      await X(`DELETE FROM "${schema}"."mst_slots" WHERE id = :i`, { i: slotId })
    }
    await X(`DELETE FROM "${schema}"."mst_slot_questions" WHERE question_key LIKE 'zz_tx_%'`)
  } catch (e) { check('teardown ran', false, e?.message) }
  const [res] = await Q(
    `SELECT (SELECT count(*)::int FROM "${schema}"."mst_slot_questions" WHERE question_key LIKE 'zz_%') AS q,
            (SELECT count(*)::int FROM "${schema}"."txn_memories" WHERE attribute = :a) AS m,
            (SELECT count(*)::int FROM "${schema}"."mst_slots" WHERE canonical_label = :a) AS s,
            (SELECT count(*)::int FROM "${schema}"."log_slot_bindings") AS b`, { a: ATTR })
  check('⭐ teardown ASSERTED, not trusted — and against the BASELINE, ⛔ not against zero',
    res.q === 0 && res.m === 0 && res.s === 0 && res.b === BASE_BINDINGS,
    `questions=${res.q} memories=${res.m} slots=${res.s} bindings=${res.b} (baseline ${BASE_BINDINGS})`)
  await seq.close()
  done()
}
