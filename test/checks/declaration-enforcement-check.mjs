// ⭐⭐⭐ THE ENFORCEMENT SEAM — governed and ungoverned paths, both proved.
//
//   node test/checks/declaration-enforcement-check.mjs
//
// ⛔ RUN AFTER `declaration-rp-d0-check.mjs`. Until ALLOW is demonstrated reachable, a refusal proves
// nothing.
//
// ── ⭐⭐⭐ THE FOUR DEMONSTRATIONS OTE REQUIRED ─────────────────────────────────────────────────────
//     ungoverned                        → legacy behaviour UNCHANGED
//     governed + matching kind          → UPDATE allowed
//     governed + unknown/mismatched     → UPDATE refused
//     DUPLICATE                         → collapse regardless of M2
//
// ── ⚠️⚠️ AND THE ONE THAT MATTERS MOST ────────────────────────────────────────────────────────────
// *"Don't let the implementation accidentally turn 'not in scope' into DEFER."* Those are different
// states with different remedies — nothing-to-do vs declare-and-bind — so the pure gate is asserted to
// return NOT-IN-SCOPE with a NULL outcome, never a refusal value, on every ungoverned route separately.
//
// ⛔ Writes only to agent_dev, and removes every row it makes.
import { makeChecker, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'
import {
  declareQuestion, proposeBind, confirmBind,
} from '../../Backend/app/components/memory-declaration-host.js'
import {
  governsReplacement, REPLACEMENT, REPLACEMENT_SCOPE,
} from '../../Backend/app/components/memory-replacement-gate.js'

const { check, done } = makeChecker()
loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const schema = devSchema()
const seq = db.txn_memories.sequelize
const query = async (sql, p = []) => ({ rows: await seq.query(sql, { bind: p, type: 'SELECT' }) })
const Q = (s, r = {}) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })
const X = (s, r = {}) => seq.query(s, { replacements: r })

const t = Date.now()
const KEY = `zz_enf_${t}`
const MADE = []
const SLOTS = []
let userId = null

// ══ PART A · THE PURE GATE — every ungoverned ROUTE, asserted SEPARATELY ═══════════════════════════
// ⭐ Two routes to one guard are two tests: `!isUpdate`, an undeclared namespace and an unbound slot are
// three different ways to be out of scope, and each must produce NOT-IN-SCOPE with a NULL outcome.
for (const [label, args] of [
  ['a NEW/NOOP/DUPLICATE write (not an update)', { isUpdate: false, slotGoverned: true, slotKind: KEY, claimKind: 'x' }],
  ['an UNDECLARED namespace', { isUpdate: true, slotGoverned: null, slotKind: KEY, claimKind: KEY }],
  ['a namespace declared NOT slot-governed', { isUpdate: true, slotGoverned: false, slotKind: KEY, claimKind: KEY }],
  ['an UNBOUND slot (no declared question)', { isUpdate: true, slotGoverned: true, slotKind: null, claimKind: KEY }],
]) {
  const g = governsReplacement(args)
  check(`A · NOT IN SCOPE, ⛔ not DEFER — ${label}`,
    g.scope === REPLACEMENT_SCOPE.notInScope && g.outcome === null,
    `scope=${g.scope} outcome=${g.outcome}`)
}
const gAllow = governsReplacement({ isUpdate: true, slotGoverned: true, slotKind: KEY, claimKind: KEY })
check('A · ⭐ CONTROL — governed + matching kind is GOVERNED/ALLOW, so the NOT-IN-SCOPE results above are '
  + 'not simply what this function always returns',
gAllow.scope === REPLACEMENT_SCOPE.governed && gAllow.outcome === REPLACEMENT.allow, gAllow.why)
for (const [label, claimKind] of [['no claim kind', null], ['a MISMATCHED claim kind', 'zz_other_question']]) {
  const g = governsReplacement({ isUpdate: true, slotGoverned: true, slotKind: KEY, claimKind })
  check(`A · governed + ${label} ⇒ GOVERNED/REFUSE`,
    g.scope === REPLACEMENT_SCOPE.governed && g.outcome === REPLACEMENT.refuse, g.why)
}

try {
  const [u] = await Q(`SELECT id::text FROM "${schema}"."mst_users" WHERE username = 'agent_dev'`)
  if (!u) throw new Error('agent_dev not found — this check must never run as root')
  userId = u.id
  const store = createSequelizeMemoryStore({ db, persona: null, userId })
  const mkSlot = async (label) => {
    const [r] = await Q(
      `INSERT INTO "${schema}"."mst_slots" (id, persona, user_id, entity, namespace, canonical_label, write_count, created_at, updated_at)
       VALUES (gen_random_uuid(), NULL, :u, 'user', 'default', :l, 0, now(), now()) RETURNING id::text`,
      { u: userId, l: label })
    SLOTS.push(r.id); return r.id
  }
  const write = async (slotId, extra = {}) => {
    const r = await store.create({
      kind: 'semantic', namespace: 'default', content: `zz_enf ${JSON.stringify(extra.value ?? 'v')}`,
      entity: 'user', attribute: `zz_enf_attr_${t}`, value: 'v',
      importance: 5, source: 'zz_enf', slot_id: slotId, ...extra,
    })
    MADE.push(r.id); return r
  }
  const isLive = async (id) => {
    const [r] = await Q(
      `SELECT (invalid_at IS NULL AND expired_at IS NULL) AS live FROM "${schema}"."txn_memories" WHERE id = :i`,
      { i: id })
    return r?.live === true
  }

  // ══ PART B · UNGOVERNED — LEGACY BEHAVIOUR UNCHANGED ════════════════════════════════════════════
  const slotU = await mkSlot(`zz_enf_ungov_${t}`)
  const u1 = await write(slotU, { value: 'first' })
  const u2 = await write(slotU, { value: 'second', supersedes_id: u1.id })
  check('B · ⭐⭐ UNGOVERNED slot: a superseding write is ACCEPTED — legacy reconciliation is untouched',
    !!u2?.id)
  const [u2row] = await Q(
    `SELECT supersedes_id::text AS sup, question_id_at_admission::text AS pin
       FROM "${schema}"."txn_memories" WHERE id = :i`, { i: u2.id })
  check('B1 · …the supersedes pointer is intact, so it really was a replacement',
    u2row?.sup === u1.id, `sup=${u2row?.sup}`)
  check('B2 · …and it carries NO pin, because an ungoverned slot has no question to be admitted under',
    u2row?.pin === null)

  // ══ PART C · GOVERNED ═══════════════════════════════════════════════════════════════════════════
  const slotG = await mkSlot(`zz_enf_gov_${t}`)
  const d = await declareQuestion({
    query, schema, questionKey: KEY, asks: 'what is the status?', checks: ['nonempty'],
    declaredBy: 'enf', occasion: `zz_occ_d_${t}`,
  })
  const p = await proposeBind({
    query, schema, slotId: slotG, questionId: d.question.id, declaredIntent: 'first-bind',
    actor: 'enf', occasion: `zz_occ_p_${t}`, reason: 'enforcement proof',
  })
  await confirmBind({ query, schema, proposalId: p.proposal.id, actor: 'enf', occasion: `zz_occ_c_${t}`, reason: 'enforcement proof' })

  const g1 = await write(slotG, { value: 'first', claimKind: KEY })
  check('C · ⭐ CONTROL — on a GOVERNED slot a NEW write (not an update) is accepted and PINNED. ⛔ Without '
    + 'this, every refusal below could be a broken write path', !!g1?.id)
  const [g1row] = await Q(
    `SELECT question_id_at_admission::text AS pin FROM "${schema}"."txn_memories" WHERE id = :i`, { i: g1.id })
  check('C1 · …and it is pinned to the declared question', g1row?.pin === d.question.id, `pin=${g1row?.pin}`)

  // ── governed + MATCHING kind ⇒ UPDATE ALLOWED ──────────────────────────────────────────────────
  const g2 = await write(slotG, { value: 'second', claimKind: KEY, supersedes_id: g1.id })
  check('C2 · ⭐⭐ GOVERNED + MATCHING kind ⇒ the UPDATE is ALLOWED', !!g2?.id)

  // ── governed + MISMATCHED kind ⇒ REFUSED ───────────────────────────────────────────────────────
  let refusedMismatch = null
  try { await write(slotG, { value: 'third', claimKind: 'zz_other_question', supersedes_id: g2.id }) }
  catch (e) { refusedMismatch = e }
  check('C3 · ⭐⭐⭐ GOVERNED + MISMATCHED kind ⇒ the UPDATE is REFUSED, loudly',
    refusedMismatch?.code === 'REPLACEMENT_REFUSED', refusedMismatch?.message ?? 'NOT refused')
  check('C3b · …and the refusal exposes the slot\'s question and the claim\'s kind as diagnostic context',
    refusedMismatch?.slotKind === KEY && refusedMismatch?.claimKind === 'zz_other_question',
    `slotKind=${refusedMismatch?.slotKind} claimKind=${refusedMismatch?.claimKind}`)

  // ── governed + NO claim kind ⇒ REFUSED ─────────────────────────────────────────────────────────
  let refusedNoKind = null
  try { await write(slotG, { value: 'fourth', supersedes_id: g2.id }) }
  catch (e) { refusedNoKind = e }
  check('C4 · ⭐⭐ GOVERNED + NO claim kind ⇒ the UPDATE is REFUSED — an absent kind is not permission',
    refusedNoKind?.code === 'REPLACEMENT_REFUSED', refusedNoKind?.message ?? 'NOT refused')

  // ══ PART D · ⭐⭐⭐ A REFUSAL LEAVES THE WORLD AS IT FOUND IT ═════════════════════════════════════
  check('D · ⭐⭐⭐ after TWO refusals the previous belief is STILL LIVE — the exactly-one-live-row '
    + 'invariant survives a refusal', await isLive(g2.id))
  const [liveCount] = await Q(
    `SELECT count(*)::int AS n FROM "${schema}"."txn_memories"
      WHERE slot_id = :s AND invalid_at IS NULL AND expired_at IS NULL`, { s: slotG })
  check('D1 · ⭐ …and the refused rows were never written at all', liveCount.n === 2,
    `live rows in the governed slot = ${liveCount.n} (the NEW one and its accepted UPDATE)`)

  // ══ PART E · ⭐⭐⭐ COLLAPSE IS NEVER GATED ══════════════════════════════════════════════════════
  // ⭐ The collapse path is `store.update(ids, {invalid_at})` — it never calls `create`, so the gate is
  // not on that code path at all. Proved behaviourally on a GOVERNED slot, which is where a gate that
  // wrongly governed convergence would bite.
  await store.update([g1.id], { invalid_at: new Date() })
  check('E · ⭐⭐⭐ a COLLAPSE on a GOVERNED slot succeeds regardless of M2 — convergence is never gated',
    !(await isLive(g1.id)))
  const [afterCollapse] = await Q(
    `SELECT count(*)::int AS n FROM "${schema}"."txn_memories"
      WHERE slot_id = :s AND invalid_at IS NULL AND expired_at IS NULL`, { s: slotG })
  check('E1 · ⭐ …leaving exactly ONE live row in the slot — the legacy invariant, intact',
    afterCollapse.n === 1, `live=${afterCollapse.n}`)
} catch (e) {
  check('the enforcement check ran to completion', false, e?.message ?? String(e))
} finally {
  try {
    for (const id of MADE) await X(`DELETE FROM "${schema}"."txn_memories" WHERE id = :i`, { i: id })
    await X(`DELETE FROM "${schema}"."txn_memories" WHERE source = 'zz_enf'`)
    for (const id of SLOTS) {
      await X(`DELETE FROM "${schema}"."log_slot_bindings" WHERE slot_id = :i`, { i: id })
      await X(`UPDATE "${schema}"."mst_slots" SET question_id = NULL WHERE id = :i`, { i: id })
      await X(`DELETE FROM "${schema}"."mst_slots" WHERE id = :i`, { i: id })
    }
    await X(`DELETE FROM "${schema}"."mst_slot_questions" WHERE question_key LIKE 'zz_enf%'`)
  } catch (e) { check('teardown ran', false, e?.message) }
  const [res] = await Q(
    `SELECT (SELECT count(*)::int FROM "${schema}"."mst_slot_questions" WHERE question_key LIKE 'zz_%') AS q,
            (SELECT count(*)::int FROM "${schema}"."txn_memories" WHERE source = 'zz_enf') AS m,
            (SELECT count(*)::int FROM "${schema}"."log_slot_bindings") AS b`)
  check('⭐ teardown ASSERTED, not trusted', res.q === 0 && res.m === 0 && res.b === 0,
    `questions=${res.q} memories=${res.m} bindings=${res.b}`)
  await seq.close()
  done()
}
