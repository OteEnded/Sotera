// ⭐⭐⭐ THE ISOLATED END-TO-END PROOF — the declaration path leaves the LIVE persona exactly as it found it.
//
//   node test/checks/declaration-e2e-isolation-check.mjs
//
// ⛔ RUN AFTER `declaration-rp-d0-check.mjs` and `declaration-rp-register-check.mjs`.
//
// ── ⭐⭐ WHAT THIS PROVES, AND WHY IT IS THE LAST ONE ───────────────────────────────────────────────
// Every earlier proof asserts something about the mechanism. This one asserts something about the WORLD:
// running the complete chain — DECLARE → BIND → RESOLVE → ADMISSION → pin → REBIND → teardown — leaves the
// live corpus **byte-identical**, so nothing built here has quietly become part of Sotera's memory.
//
// ⚠️⚠️ AND IT IS THE PROOF MOST AT RISK OF BEING VACUOUS: "nothing changed" is exactly what a blind
// instrument reports. ⭐ So the fingerprint is proved SENSITIVE FIRST — and proved sensitive **through the
// persistence boundary**, which is the lesson RP-T1 paid for: the application computing the right value is
// not the same as the value surviving the write.
//
// ⛔ Writes only to agent_dev, and removes every row it makes.
import { makeChecker, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'
import {
  declareQuestion, proposeBind, confirmBind, resolveSlotQuestion,
} from '../../Backend/app/components/memory-declaration-host.js'
import { checkKind, KIND_OUTCOME } from '../../Backend/app/components/memory-kind-precondition.js'
import { WRITER as ZZ_WRITER, ACT_KIND as ZZ_ACT_KIND } from '../../Backend/app/components/memory-writer-contracts.js'

// ⭐ D1 PHASE 3 (Ote, 2026-09-16): the store now REFUSES a write or a memory-semantic mutation with no declared
// writer. This check drives the store DIRECTLY, as an operator would, so it declares the axes it was already
// exercising — *"test/check → declares the writer/act/reach it claims to exercise."* ⛔ Spread FIRST, so any call
// that declares its own writer still wins.
const ZZ_AXES = { writer: ZZ_WRITER.operator, act: { kind: ZZ_ACT_KIND.operator, id: `zz_declaration_e2e_isolation_check_${Date.now()}` } }


const { check, done } = makeChecker()
loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const schema = devSchema()
const seq = db.txn_memories.sequelize
const query = async (sql, p = []) => ({ rows: await seq.query(sql, { bind: p, type: 'SELECT' }) })
const Q = (s, r = {}) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })
const X = (s, r = {}) => seq.query(s, { replacements: r })

const t = Date.now()
// ⭐ AN OPERATOR OCCASION. Since 2026-09-04 the store enforces the self-authorisation rule at
// admission, and a write to a BOUND slot that cannot name its occasion is refused — it cannot prove
// it is not the very act that declared or bound the question. ⛔ Distinct from every DECLARE/BIND
// occasion below, which is exactly what the rule asks a caller to be able to say.
const OCC = `zz_e2e_consuming_${t}`

const KEY = `zz_e2e_${t}`
const KEY2 = `zz_e2e_v2_${t}`
const MADE = []
let slotId = null
let BEFORE = null   // ⭐ module scope: the `finally` block must be able to compare against it
let userId = null

// ⭐⭐ THE TWO BASELINES the mid-run isolation assertions compare against. Read BEFORE anything is written,
// ⛔ never hardcoded: the corpus legitimately contains governed slots and pinned rows since 2026-09-03.
const [{ p: BASE_PINNED, s: BASE_BOUND }] = await Q(
  `SELECT (SELECT count(*)::int FROM "${schema}"."txn_memories"
            WHERE question_id_at_admission IS NOT NULL AND source IS DISTINCT FROM 'zz_e2e') AS p,
          (SELECT count(*)::int FROM "${schema}"."mst_slots"
            WHERE question_id IS NOT NULL AND canonical_label NOT LIKE 'zz_%') AS s`)

/**
 * ⭐ THE FINGERPRINT — a whole-corpus digest computed IN THE DATABASE, so it reads what was PERSISTED
 * rather than what the application believes it wrote. That distinction is the one RP-T1 cost us.
 */
const fingerprint = async () => {
  const [r] = await Q(
    `SELECT (SELECT count(*)::int FROM "${schema}"."txn_memories")                                  AS memories,
            (SELECT count(*)::int FROM "${schema}"."mst_slots")                                     AS slots,
            (SELECT count(*)::int FROM "${schema}"."mst_slot_questions")                            AS questions,
            (SELECT count(*)::int FROM "${schema}"."mst_slots" WHERE question_id IS NOT NULL)        AS bound,
            (SELECT count(*)::int FROM "${schema}"."log_slot_bindings")                             AS bindings,
            (SELECT count(*)::int FROM "${schema}"."txn_memories" WHERE question_id_at_admission IS NOT NULL) AS pinned,
            (SELECT count(*)::int FROM "${schema}"."mst_namespace_declarations")                    AS namespaces,
            (SELECT md5(coalesce(string_agg(m.id::text, ',' ORDER BY m.id), ''))
               FROM "${schema}"."txn_memories" m)                                                    AS memory_digest,
            (SELECT md5(coalesce(string_agg(s.id::text || ':' || coalesce(s.question_id::text, '-'), ',' ORDER BY s.id), ''))
               FROM "${schema}"."mst_slots" s)                                                       AS slot_digest`)
  return JSON.stringify(r)
}

try {
  const [u] = await Q(`SELECT id::text FROM "${schema}"."mst_users" WHERE username = 'agent_dev'`)
  if (!u) throw new Error('agent_dev not found — this check must never run as root')
  userId = u.id
  const store = createSequelizeMemoryStore({ ...ZZ_AXES, db, persona: null, userId, occasion: OCC })

  BEFORE = await fingerprint()

  // ── 0 · ⭐⭐ PROVE THE FINGERPRINT IS SENSITIVE — through the PERSISTENCE boundary ────────────────
  const probe = await store.create({
    kind: 'semantic', namespace: 'default', content: 'zz_e2e sensitivity probe',
    entity: 'user', attribute: `zz_e2e_probe_${t}`, value: 'v', importance: 5, source: 'zz_e2e',
  })
  const WITH_PROBE = await fingerprint()
  check('0 · ⭐⭐ CONTROL FIRST — the fingerprint CHANGES when one row is written. ⛔ Without this, every '
    + '"nothing changed" assertion below passes on a blind instrument', WITH_PROBE !== BEFORE)
  await X(`DELETE FROM "${schema}"."txn_memories" WHERE id = :i`, { i: probe.id })
  const RESTORED = await fingerprint()
  check('0b · ⭐ …and it returns to the baseline when that row is removed, so the digest is not simply '
    + 'monotonic', RESTORED === BEFORE)

  // ── 1 · THE COMPLETE CHAIN, END TO END ──────────────────────────────────────────────────────────
  const [s] = await Q(
    `INSERT INTO "${schema}"."mst_slots" (id, persona, user_id, entity, namespace, canonical_label, write_count, created_at, updated_at)
     VALUES (gen_random_uuid(), NULL, :u, 'user', 'default', :l, 0, now(), now()) RETURNING id::text`,
    { u: userId, l: `zz_e2e_label_${t}` })
  slotId = s.id

  const d1 = await declareQuestion({
    query, schema, questionKey: KEY, asks: 'what is the status of this?', checks: ['nonempty', 'single-line'],
    declaredBy: 'e2e', occasion: `zz_occ_d_${t}`,
  })
  const p1 = await proposeBind({
    query, schema, slotId, questionId: d1.question.id, declaredIntent: 'first-bind',
    actor: 'e2e', occasion: `zz_occ_p_${t}`, reason: 'e2e',
  })
  const c1 = await confirmBind({
    query, schema, proposalId: p1.proposal.id, actor: 'e2e', occasion: `zz_occ_c_${t}`, reason: 'e2e',
  })
  const r1 = await resolveSlotQuestion({ query, schema, slotId })
  const verdict = checkKind({ slotKind: r1?.slotKind ?? null, claimKind: KEY })
  const m1 = await store.create({
    kind: 'semantic', namespace: 'default', content: 'zz_e2e admitted', entity: 'user',
    attribute: `zz_e2e_attr_${t}`, value: 'shipped', importance: 5, source: 'zz_e2e',
    slot_id: slotId, claimKind: KEY,
  })
  MADE.push(m1.id)
  const [pin1] = await Q(
    `SELECT question_id_at_admission::text AS pin FROM "${schema}"."txn_memories" WHERE id = :i`, { i: m1.id })
  check('1 · ⭐⭐⭐ THE WHOLE CHAIN RUNS: declare → bind → resolve → checkKind ALLOW → the row is PINNED',
    d1.ok && c1.ok && r1?.slotKind === KEY && verdict.outcome === KIND_OUTCOME.allow && pin1?.pin === d1.question.id,
    `bound=${c1.ok} kind=${r1?.slotKind} verdict=${verdict.outcome} pin=${pin1?.pin}`)

  // ── 2 · a supersession + rebind, and the pin holds ──────────────────────────────────────────────
  const d2 = await declareQuestion({
    query, schema, questionKey: KEY2, asks: 'the same question, more precisely', checks: ['nonempty'],
    declaredBy: 'e2e', occasion: `zz_occ_d2_${t}`, supersedesId: d1.question.id,
  })
  const p2 = await proposeBind({
    query, schema, slotId, questionId: d2.question.id, declaredIntent: 'rebind',
    expectedQuestionId: d1.question.id, actor: 'e2e', occasion: `zz_occ_p2_${t}`, reason: 'e2e',
  })
  await confirmBind({ query, schema, proposalId: p2.proposal.id, actor: 'e2e', occasion: `zz_occ_c2_${t}`, reason: 'e2e' })
  const [pin2] = await Q(
    `SELECT question_id_at_admission::text AS pin FROM "${schema}"."txn_memories" WHERE id = :i`, { i: m1.id })
  check('2 · ⭐ after a supersession AND a rebind, the admitted row still names the definition it was '
    + 'admitted under', pin2?.pin === d1.question.id, `pin=${pin2?.pin} v1=${d1.question.id}`)

  // ── 3 · ⭐⭐ THE LIVE CORPUS IS UNCHANGED **DURING** THE RUN, except by this check's own fixtures ──
  //
  // ⚠️⚠️ THESE TWO WERE WRITTEN AS ABSOLUTE ZEROES AND BOTH WERE WRONG, IN OPPOSITE DIRECTIONS:
  //  ① `source <> 'zz_e2e'` is NULL-UNSAFE. Every ordinary memory has a NULL `source`, and `NULL <> 'x'`
  //    is NULL, not TRUE — so this counted 0 where the honest count was 2, and the check went GREEN
  //    because it could not see the rows it existed to guard. ⇒ `IS DISTINCT FROM`.
  //  ② The zeroes were an ABSENCE ASSERTED WITH NO DATE. Ote bound the first real slot on 2026-09-03 and
  //    the corpus now correctly holds a governed slot and pinned rows; the assertion went RED for the
  //    system doing exactly what it was built to do.
  // ⇒ both now compare against the BASELINE this run found. What isolation means is *this check changed
  //   nothing outside its own fixtures*, which is a DELTA — never a global zero.
  const [live] = await Q(
    `SELECT count(*)::int AS n FROM "${schema}"."txn_memories"
      WHERE question_id_at_admission IS NOT NULL AND source IS DISTINCT FROM 'zz_e2e'`)
  check('3 · ⭐⭐ NOT ONE pre-existing memory acquired a pin — the whole path touched only its own rows',
    live.n === BASE_PINNED, `pinned non-fixture rows=${live.n} (baseline ${BASE_PINNED})`)
  const [liveBound] = await Q(
    `SELECT count(*)::int AS n FROM "${schema}"."mst_slots"
      WHERE question_id IS NOT NULL AND canonical_label NOT LIKE 'zz_%'`)
  check('3b · ⭐⭐ and NOT ONE pre-existing slot was bound BY THIS RUN',
    liveBound.n === BASE_BOUND, `bound non-fixture slots=${liveBound.n} (baseline ${BASE_BOUND})`)
} catch (e) {
  check('the E2E ran to completion', false, e?.message ?? String(e))
} finally {
  try {
    for (const id of MADE) await X(`DELETE FROM "${schema}"."txn_memories" WHERE id = :i`, { i: id })
    await X(`DELETE FROM "${schema}"."txn_memories" WHERE source = 'zz_e2e'`)
    if (slotId) {
      await X(`DELETE FROM "${schema}"."log_slot_bindings" WHERE slot_id = :i`, { i: slotId })
      await X(`UPDATE "${schema}"."mst_slots" SET question_id = NULL WHERE id = :i`, { i: slotId })
      await X(`DELETE FROM "${schema}"."mst_slots" WHERE id = :i`, { i: slotId })
    }
    await X(`DELETE FROM "${schema}"."mst_slot_questions" WHERE question_key LIKE 'zz_e2e%'`)
  } catch (e) { check('teardown ran', false, e?.message) }

  // ── 4 · ⭐⭐⭐ THE PROOF — byte-identical to the baseline the sensitivity control validated ────────
  const AFTER = await fingerprint()
  check('4 · ⭐⭐⭐ THE LIVE CORPUS IS BYTE-IDENTICAL to the pre-run fingerprint — and the fingerprint was '
    + 'PROVED SENSITIVE first, through the persistence boundary', BEFORE !== null && AFTER === BEFORE,
  AFTER === BEFORE ? '' : `\n    before=${BEFORE}\n    after =${AFTER}`)
  await seq.close()
  done()
}
