// ⭐⭐⭐ RP-D0 — THE MANDATORY POSITIVE CONTROL. Run this FIRST; nothing else counts until it passes.
//
//   node test/checks/declaration-rp-d0-check.mjs
//
// ── ⛔⛔ WHY THIS PROOF EXISTS AT ALL ────────────────────────────────────────────────────────────────
// ⓘ Measured 2026-09-03: **0 questions declared, 0 slots bound, and `checkKind` DEFERs on all 82 slots.**
// ⇒ EVERY assertion of the form *"an undeclared slot defers"* passes on a system where the declaration
// path does nothing whatsoever. And there was a concrete way for that to be true while everything looked
// finished: `kindPreconditionFor` reads `slot?.kind`, `mst_slots` has no `kind` column, and nothing in the
// repo read `question_id` — three missing pieces, not one.
//
// ⇒ ⭐⭐⭐ **THIS PROVES `ALLOW` IS REACHABLE.** Ote: *"A 100% DEFER suite is not evidence that the gate
// works. The positive control must first prove that ALLOW is reachable."*
//
// ── ⭐ CREATE → PROVE → TEAR DOWN ───────────────────────────────────────────────────────────────────
// Every artefact is `zz_` prefixed and removed at the end, and the check ASSERTS the teardown rather than
// trusting it: `zz_` residue is a tracked invariant of this store.
import { devPg, devSchema, makeChecker } from '../harness.mjs'
import {
  declareQuestion, proposeBind, confirmBind, resolveSlotQuestion, isDeclaredQuestionKey, currentBinding,
} from '../../Backend/app/components/memory-declaration-host.js'
import { checkKind, KIND_OUTCOME } from '../../Backend/app/components/memory-kind-precondition.js'
import { checkConsumingOccasion } from '../../Backend/app/components/memory-bind-rules.js'

const { check, done } = makeChecker()
const c = devPg(); await c.connect()
const schema = devSchema()
const query = (sql, params = []) => c.query(sql, params)

// Three DIFFERENT occasions. The rule under test is that they must not be the same one.
const OCC_DECLARE = `zz_occ_declare_${Date.now()}`
const OCC_PROPOSE = `zz_occ_propose_${Date.now()}`
const OCC_CONFIRM = `zz_occ_confirm_${Date.now()}`
const QKEY = `zz_rpd0_status_${Date.now()}`
const LABEL = `zz_rpd0_label_${Date.now()}`

let slotId = null
let questionId = null
let proposalId = null

try {
  // ── 0 · a throwaway slot in the test account's room, in the `default` namespace ──────────────────
  const { rows: u } = await query(`SELECT id::text FROM "${schema}"."mst_users" WHERE username = 'agent_dev'`)
  if (!u[0]) throw new Error('agent_dev not found — RP-D0 must never run as root')
  const { rows: s } = await query(
    `INSERT INTO "${schema}"."mst_slots" (id, persona, user_id, entity, namespace, canonical_label, write_count, created_at, updated_at)
     VALUES (gen_random_uuid(), NULL, $1::uuid, 'user', 'default', $2, 0, now(), now()) RETURNING id::text`,
    [u[0].id, LABEL])
  slotId = s[0].id

  // ── 1 · ⭐ THE INSTRUMENT CAN SEE **DEFER** — the negative half, established BEFORE the positive one
  const before = await resolveSlotQuestion({ query, schema, slotId })
  check('1 · an unbound slot resolves to NO kind', before?.slotKind === null, `slotKind=${before?.slotKind}`)
  check('1b · …and the namespace IS declared and slot-governed (048 transcribed `default`)',
    before?.namespaceDeclared === true && before?.slotGoverned === true,
    `declared=${before?.namespaceDeclared} governed=${before?.slotGoverned}`)
  const deferred = checkKind({ slotKind: before?.slotKind ?? null, claimKind: 'anything' })
  check('1c · ⭐ the gate DEFERS on it — the instrument can observe a refusal',
    deferred.outcome === KIND_OUTCOME.defer, deferred.why)

  // ── 2 · DECLARE ─────────────────────────────────────────────────────────────────────────────────
  const decl = await declareQuestion({
    query, schema, questionKey: QKEY,
    asks: 'what is the current status of this decision?',
    checks: ['nonempty', 'single-line'],
    declaredBy: 'rp-d0', occasion: OCC_DECLARE,
  })
  check('2 · DECLARE creates a subject-free definition', decl.ok === true, decl.why ?? '')
  questionId = decl.ok ? decl.question.id : null
  check('2b · …and it records the occasion it was declared in',
    decl.ok && decl.question.declared_in_occasion === OCC_DECLARE)

  // ⭐ DECLARE made NOTHING operative — the slot is untouched.
  const stillUnbound = await resolveSlotQuestion({ query, schema, slotId })
  check('2c · ⭐⭐ DECLARE alone makes NOTHING operative — the slot still resolves to no kind',
    stillUnbound?.slotKind === null)

  // ── 3 · an unregistered check is refused AT DECLARATION (RP-D4) ─────────────────────────────────
  const bad = await declareQuestion({
    query, schema, questionKey: `${QKEY}_bad`, asks: 'x', checks: ['nonempty', 'zz_not_a_check'],
    declaredBy: 'rp-d0', occasion: OCC_DECLARE,
  })
  check('3 · RP-D4 · a definition naming an UNREGISTERED check is refused at declaration',
    bad.ok === false && Array.isArray(bad.unknown) && bad.unknown.includes('zz_not_a_check'), bad.why ?? '')
  const proto = await declareQuestion({
    query, schema, questionKey: `${QKEY}_proto`, asks: 'x', checks: ['toString'],
    declaredBy: 'rp-d0', occasion: OCC_DECLARE,
  })
  check('3b · RP-D6 · …and so is a prototype member masquerading as a check', proto.ok === false, proto.why ?? '')

  // ── 4 · PROPOSE — ⛔ no effect on the slot ───────────────────────────────────────────────────────
  const prop = await proposeBind({
    query, schema, slotId, questionId, declaredIntent: 'first-bind',
    actor: 'rp-d0', occasion: OCC_PROPOSE, reason: 'RP-D0 positive control',
  })
  check('4 · PROPOSE is accepted and derives `first-bind`', prop.ok === true && prop.act === 'first-bind', prop.why ?? '')
  proposalId = prop.ok ? prop.proposal.id : null
  const afterPropose = await currentBinding({ query, schema, slotId })
  check('4b · ⭐⭐ a PROPOSAL changes NOTHING — the slot is still unbound',
    afterPropose?.question_id === null, `question_id=${afterPropose?.question_id}`)

  // ── 5 · ⭐⭐⭐ THE OCCASION RULE — confirming in the proposal's own occasion is REFUSED ───────────
  const sameOcc = await confirmBind({
    query, schema, proposalId, actor: 'rp-d0', occasion: OCC_PROPOSE, reason: 'same occasion',
  })
  check('5 · ⭐⭐ a CONFIRM in the PROPOSAL\'s own occasion is REFUSED',
    sameOcc.ok === false && sameOcc.refusal === 'same-occasion', sameOcc.why ?? '')
  const stillUnbound2 = await currentBinding({ query, schema, slotId })
  check('5b · …and the slot is still unbound after the refusal', stillUnbound2?.question_id === null)

  // ── 6 · CONFIRM in a later occasion ─────────────────────────────────────────────────────────────
  const conf = await confirmBind({
    query, schema, proposalId, actor: 'rp-d0', occasion: OCC_CONFIRM, reason: 'RP-D0 positive control',
  })
  check('6 · CONFIRM in a DIFFERENT occasion succeeds', conf.ok === true, conf.why ?? '')

  // ── 7 · ⭐⭐⭐ RP-D0 ITSELF — RESOLVE → checkKind → **ALLOW** ────────────────────────────────────
  const resolved = await resolveSlotQuestion({ query, schema, slotId })
  check('7 · RESOLVE returns the question KEY as slotKind', resolved?.slotKind === QKEY, `slotKind=${resolved?.slotKind}`)
  check('7b · ⭐ …and the declared CHECKS alongside it, kept apart from the identity',
    Array.isArray(resolved?.checks) && resolved.checks.join(',') === 'nonempty,single-line',
    JSON.stringify(resolved?.checks))
  const allow = checkKind({ slotKind: resolved?.slotKind ?? null, claimKind: QKEY })
  check('7c · ⭐⭐⭐ RP-D0 — DECLARE → BIND → RESOLVE → checkKind returns **ALLOW**',
    allow.outcome === KIND_OUTCOME.allow, allow.why)

  // ── 8 · and the gate still REFUSES what it should ───────────────────────────────────────────────
  const mismatch = checkKind({ slotKind: resolved?.slotKind ?? null, claimKind: 'zz_some_other_question' })
  check('8 · a claim answering a DIFFERENT question still DEFERs', mismatch.outcome === KIND_OUTCOME.defer, mismatch.why)
  const declaredKind = await isDeclaredQuestionKey({ query, schema, claimKind: QKEY })
  const inventedKind = await isDeclaredQuestionKey({ query, schema, claimKind: 'zz_some_other_question' })
  check('8b · ⭐ claim-kind vocabulary validation distinguishes a real question from an invented one',
    declaredKind === true && inventedKind === false, `declared=${declaredKind} invented=${inventedKind}`)

  // ── 9 · ⭐⭐⭐ SELF-AUTHORISATION — the consumer side, both directions ───────────────────────────
  const selfAuthDeclare = checkConsumingOccasion({
    consumingOccasion: OCC_DECLARE,
    declaredInOccasion: resolved?.declaredInOccasion, boundInOccasion: resolved?.boundInOccasion,
  })
  check('9 · ⛔ consuming in the occasion the question was DECLARED in is refused',
    selfAuthDeclare.ok === false, selfAuthDeclare.why ?? '')
  const selfAuthBind = checkConsumingOccasion({
    consumingOccasion: OCC_CONFIRM,
    declaredInOccasion: resolved?.declaredInOccasion, boundInOccasion: resolved?.boundInOccasion,
  })
  check('9b · ⛔⛔ …and so is consuming in the occasion it was BOUND in — the hole a DECLARE-only rule left',
    selfAuthBind.ok === false, selfAuthBind.why ?? '')
  const laterOk = checkConsumingOccasion({
    consumingOccasion: 'zz_occ_a_later_pass',
    declaredInOccasion: resolved?.declaredInOccasion, boundInOccasion: resolved?.boundInOccasion,
  })
  check('9c · ⭐ CONTROL — a LATER occasion may consume it, so the rule is not simply refusing everything',
    laterOk.ok === true)
  const noOcc = checkConsumingOccasion({
    consumingOccasion: null,
    declaredInOccasion: resolved?.declaredInOccasion, boundInOccasion: resolved?.boundInOccasion,
  })
  check('9d · a consumer with NO occasion cannot prove non-collision ⇒ DEFERs', noOcc.ok === false, noOcc.why ?? '')

  // ── 10 · exactly one audit row per real act, and none for the refusal ───────────────────────────
  const { rows: log } = await query(
    `SELECT action, derived_act, occasion FROM "${schema}"."log_slot_bindings"
      WHERE slot_id = $1::uuid ORDER BY created_at`, [slotId])
  check('10 · ⭐ TWO durable rows for one bind — propose then confirm, and that IS the evidence',
    log.length === 2 && log[0].action === 'propose' && log[1].action === 'confirm',
    log.map((r) => `${r.action}@${r.occasion}`).join(' → '))
  check('10b · ⛔ the REFUSED confirm wrote no audit row — a non-event is not a change',
    log.filter((r) => r.action === 'confirm').length === 1)
} catch (e) {
  check('RP-D0 ran to completion', false, e?.message ?? String(e))
} finally {
  // ── TEARDOWN, and ASSERT it ────────────────────────────────────────────────────────────────────
  try {
    if (slotId) await query(`DELETE FROM "${schema}"."log_slot_bindings" WHERE slot_id = $1::uuid`, [slotId])
    if (slotId) await query(`DELETE FROM "${schema}"."mst_slots" WHERE id = $1::uuid`, [slotId])
    await query(`DELETE FROM "${schema}"."mst_slot_questions" WHERE question_key LIKE 'zz_rpd0_%'`)
  } catch (e) { check('teardown ran', false, e?.message) }

  const { rows: residue } = await query(
    `SELECT (SELECT count(*)::int FROM "${schema}"."mst_slot_questions" WHERE question_key LIKE 'zz_%') AS q,
            (SELECT count(*)::int FROM "${schema}"."mst_slots" WHERE canonical_label LIKE 'zz_rpd0_%') AS s,
            (SELECT count(*)::int FROM "${schema}"."log_slot_bindings") AS b`)
  check('11 · ⭐ teardown ASSERTED, not trusted — no zz_ declaration or slot residue, binding log empty',
    residue[0].q === 0 && residue[0].s === 0 && residue[0].b === 0,
    `questions=${residue[0].q} slots=${residue[0].s} bindings=${residue[0].b}`)

  await c.end()
  done()
}
