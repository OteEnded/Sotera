// ⭐⭐⭐ RP-T1 — THE TEMPORAL PROOF. Historical admission vs current binding.
//
//   node test/checks/declaration-rp-t1-check.mjs
//
//   DECLARE A → BIND slot→A → admit M → DECLARE B → BIND slot→B
//        ⇒ M is STILL interpreted under A          ⇒ a NEW admission uses B
//
// ── ⭐⭐ WHY IT IS BEHAVIOURAL AND NOT A SCHEMA ASSERTION ───────────────────────────────────────────
// M2-10 stops a superseded question from RE-VALIDATING an existing row. ⛔ It does not stop one from being
// MISREAD: a reader following `memory → slot → question_id` after a repoint lands on the CURRENT
// definition, not the one the row was admitted under. ⇒ the pin is only worth having if the value it
// preserves actually DIFFERS from what the slot now says — so this check builds that competing reader and
// proves they disagree.
//
// ⚠️ THREE POSITIVE CONTROLS, or the whole thing is green-but-uninstrumented:
//   ① the REBIND actually changed the current binding    — else "M still uses A" passes because nothing moved
//   ② the admission actually happened (the pin is non-null) — else there is nothing pinned to test
//   ③ a reader that FOLLOWS THE SLOT reports B            — else "it used the pinned value" is
//                                                            indistinguishable from "both paths agree"
//
// ⛔ Writes only to agent_dev, and removes every row it makes.
import { makeChecker, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'
import {
  declareQuestion, proposeBind, confirmBind, currentBinding,
} from '../../Backend/app/components/memory-declaration-host.js'

const { check, done } = makeChecker()
loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const schema = devSchema()
const seq = db.txn_memories.sequelize
const query = async (sql, params = []) => ({ rows: await seq.query(sql, { bind: params, type: 'SELECT' }) })
const Q = (s, r) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })

const stamp = Date.now()
const A_KEY = `zz_rpt1_question_a_${stamp}`
const B_KEY = `zz_rpt1_question_b_${stamp}`
const LABEL = `zz_rpt1_label_${stamp}`
let slotId = null
let qA = null
let qB = null
const MADE = []

/** ⭐ One full bind: propose in one occasion, confirm in another. The separation is the discipline. */
async function bind(questionId, intent, expected, tag) {
  const p = await proposeBind({
    query, schema, slotId, questionId, declaredIntent: intent, expectedQuestionId: expected,
    actor: 'rp-t1', occasion: `zz_occ_propose_${tag}_${stamp}`, reason: 'RP-T1 temporal proof',
  })
  if (!p.ok) return p
  return confirmBind({
    query, schema, proposalId: p.proposal.id,
    actor: 'rp-t1', occasion: `zz_occ_confirm_${tag}_${stamp}`, reason: 'RP-T1 temporal proof',
  })
}

try {
  const [u] = await Q(`SELECT id::text FROM "${schema}"."mst_users" WHERE username = 'agent_dev'`, {})
  if (!u) throw new Error('agent_dev not found — RP-T1 must never run as root')
  const [s] = await Q(
    `INSERT INTO "${schema}"."mst_slots" (id, persona, user_id, entity, namespace, canonical_label, write_count, created_at, updated_at)
     VALUES (gen_random_uuid(), NULL, :uid, 'user', 'default', :label, 0, now(), now()) RETURNING id::text`,
    { uid: u.id, label: LABEL })
  slotId = s.id

  const store = createSequelizeMemoryStore({ db, persona: null, userId: u.id })
  const admit = async (claimKind, marker) => {
    const r = await store.create({
      kind: 'semantic', namespace: 'default', content: `zz_rpt1 ${marker}`,
      entity: 'user', attribute: `zz_rpt1_attr_${stamp}`, value: marker,
      importance: 5, source: 'zz_rpt1', slot_id: slotId, claimKind,
    })
    MADE.push(r.id)
    const [row] = await Q(
      `SELECT question_id_at_admission::text AS pinned FROM "${schema}"."txn_memories" WHERE id = :id`,
      { id: r.id })
    return { id: r.id, pinned: row?.pinned ?? null }
  }

  // ── 1 · DECLARE A and BIND ──────────────────────────────────────────────────────────────────────
  const dA = await declareQuestion({
    query, schema, questionKey: A_KEY, asks: 'question A', checks: ['nonempty'],
    declaredBy: 'rp-t1', occasion: `zz_occ_declare_a_${stamp}`,
  })
  qA = dA.ok ? dA.question.id : null
  check('1 · DECLARE A', dA.ok === true, dA.why ?? '')
  const bA = await bind(qA, 'first-bind', null, 'a')
  check('1b · BIND slot → A', bA.ok === true && bA.act === 'first-bind', bA.why ?? '')

  // ── 2 · ⭐ CONTROL ② — an admission actually happened, so there is something pinned to test ──────
  const m1 = await admit(A_KEY, 'admitted-under-A')
  check('2 · ⭐ CONTROL — the admission really happened: M is pinned to A, ⛔ not NULL',
    m1.pinned === qA, `pinned=${m1.pinned} A=${qA}`)

  // ── 3 · a claim that answers a DIFFERENT question is NOT pinned ────────────────────────────────
  const mOther = await admit('zz_rpt1_some_other_question', 'mismatched-kind')
  check('3 · ⭐ a claim answering another question is admitted with NO pin — the gate ALLOWs nothing here',
    mOther.pinned === null, `pinned=${mOther.pinned}`)

  // ── 4 · DECLARE B and REBIND ───────────────────────────────────────────────────────────────────
  const dB = await declareQuestion({
    query, schema, questionKey: B_KEY, asks: 'question B', checks: ['nonempty'],
    declaredBy: 'rp-t1', occasion: `zz_occ_declare_b_${stamp}`,
  })
  qB = dB.ok ? dB.question.id : null
  check('4 · DECLARE B', dB.ok === true, dB.why ?? '')
  const bB = await bind(qB, 'rebind', qA, 'b')
  check('4b · REBIND slot → B (a rebind must name the claim it contradicts)',
    bB.ok === true && bB.act === 'rebind', bB.why ?? '')

  // ── 5 · ⭐ CONTROL ① — the rebind ACTUALLY moved the binding ────────────────────────────────────
  const nowBound = await currentBinding({ query, schema, slotId })
  check('5 · ⭐ CONTROL — the rebind actually changed the current binding',
    nowBound?.question_id === qB && qB !== qA, `now=${nowBound?.question_id} B=${qB}`)

  // ── 6 · ⭐⭐⭐ THE PROOF — M still reports A ─────────────────────────────────────────────────────
  const [pinnedNow] = await Q(
    `SELECT question_id_at_admission::text AS pinned FROM "${schema}"."txn_memories" WHERE id = :id`,
    { id: m1.id })
  check('6 · ⭐⭐⭐ RP-T1 — M is STILL interpreted under A after the slot was rebound to B',
    pinnedNow?.pinned === qA, `pinned=${pinnedNow?.pinned} A=${qA} B=${qB}`)

  // ── 7 · ⭐⭐ CONTROL ③ — the competing reader VISIBLY DIFFERS ───────────────────────────────────
  const [viaSlot] = await Q(
    `SELECT q.question_key AS via_slot
       FROM "${schema}"."txn_memories" m
       JOIN "${schema}"."mst_slots" s ON s.id = m.slot_id
       LEFT JOIN "${schema}"."mst_slot_questions" q ON q.id = s.question_id
      WHERE m.id = :id`, { id: m1.id })
  const [viaPin] = await Q(
    `SELECT q.question_key AS via_pin
       FROM "${schema}"."txn_memories" m
       LEFT JOIN "${schema}"."mst_slot_questions" q ON q.id = m.question_id_at_admission
      WHERE m.id = :id`, { id: m1.id })
  check('7 · ⭐⭐⭐ CONTROL — a reader FOLLOWING THE SLOT reports B while the pinned reader reports A, '
    + 'so "it used the pinned value" is not indistinguishable from "both paths agree"',
    viaSlot?.via_slot === B_KEY && viaPin?.via_pin === A_KEY,
    `viaSlot=${viaSlot?.via_slot} viaPin=${viaPin?.via_pin}`)

  // ── 8 · a NEW admission uses B ─────────────────────────────────────────────────────────────────
  const m2 = await admit(B_KEY, 'admitted-under-B')
  check('8 · ⭐⭐ a NEW admission on that slot uses B', m2.pinned === qB, `pinned=${m2.pinned} B=${qB}`)
  const m3 = await admit(A_KEY, 'stale-kind-after-rebind')
  check('8b · …and a claim still answering A is no longer admitted under it',
    m3.pinned === null, `pinned=${m3.pinned}`)

  // ── 9 · the binding log tells the whole story ──────────────────────────────────────────────────
  const log = await Q(
    `SELECT action, derived_act FROM "${schema}"."log_slot_bindings" WHERE slot_id = :id ORDER BY created_at`,
    { id: slotId })
  check('9 · ⭐ four durable rows — propose+confirm for the first bind, propose+confirm for the rebind',
    log.length === 4 && log[1].derived_act === 'first-bind' && log[3].derived_act === 'rebind',
    log.map((r) => `${r.action}/${r.derived_act}`).join(' → '))
} catch (e) {
  check('RP-T1 ran to completion', false, e?.message ?? String(e))
} finally {
  try {
    for (const id of MADE) await seq.query(`DELETE FROM "${schema}"."txn_memories" WHERE id = :id`, { replacements: { id } })
    if (slotId) {
      await seq.query(`DELETE FROM "${schema}"."log_slot_bindings" WHERE slot_id = :id`, { replacements: { id: slotId } })
      await seq.query(`UPDATE "${schema}"."mst_slots" SET question_id = NULL WHERE id = :id`, { replacements: { id: slotId } })
      await seq.query(`DELETE FROM "${schema}"."mst_slots" WHERE id = :id`, { replacements: { id: slotId } })
    }
    await seq.query(`DELETE FROM "${schema}"."mst_slot_questions" WHERE question_key LIKE 'zz_rpt1_%'`)
  } catch (e) { check('teardown ran', false, e?.message) }

  const [residue] = await Q(
    `SELECT (SELECT count(*)::int FROM "${schema}"."mst_slot_questions" WHERE question_key LIKE 'zz_%') AS q,
            (SELECT count(*)::int FROM "${schema}"."mst_slots" WHERE canonical_label LIKE 'zz_rpt1_%') AS s,
            (SELECT count(*)::int FROM "${schema}"."txn_memories" WHERE source = 'zz_rpt1') AS m,
            (SELECT count(*)::int FROM "${schema}"."log_slot_bindings") AS b`, {})
  check('10 · ⭐ teardown ASSERTED, not trusted', residue.q === 0 && residue.s === 0 && residue.m === 0 && residue.b === 0,
    `questions=${residue.q} slots=${residue.s} memories=${residue.m} bindings=${residue.b}`)
  await seq.close()
  done()
}
