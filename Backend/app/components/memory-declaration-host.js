// ⭐⭐⭐ THE DECLARATION PATH — DECLARE · PROPOSE · CONFIRM · RESOLVE.
//
//   DECLARE → question definition → BIND → slot.question_id → RESOLVE → slotKind + checks → checkKind
//
// ⭐ THREE ACTS, KEPT SEPARATE ON PURPOSE, and the separation is the gate rather than ergonomics:
//   DECLARE  creates SUBJECT-FREE vocabulary and ⛔ makes NOTHING operative.
//   BIND     makes one definition govern one slot — ⭐ the only act here that changes what may happen next.
//   RESOLVE  retrieves; ⛔ it makes no semantic judgement of any kind.
//
// ⛔⛔ AND THERE IS DELIBERATELY NO `declareAndBind()`. One call that creates a permission AND applies it
// IS the self-authorisation shape this whole path exists to prevent.
//
// ⚠️ `query` is a pg-style `(sql, params) => {rows}`. Every write below is a SINGLE STATEMENT, so no
// caller transaction is required — see `confirmBind` for why that is a correctness property and not a
// convenience.
import { checkBindRequest, checkConfirmOccasion, BIND_REFUSAL } from './memory-bind-rules.js'
import { validateDefinition, registeredCheckIds } from './memory-question-checks.js'

const S = (schema) => `"${schema}"`
const need = (v, what) => { if (typeof v !== 'string' || !v.trim()) throw new TypeError(`${what} is required`) }

/**
 * ⭐⭐ DECLARE a subject-free question definition.
 *
 * ⛔ It asserts NOTHING about any person, room or value — which is exactly why Sotera has standing over
 * it: this is her own conceptual vocabulary, ⛔ not a claim about anyone.
 *
 * ⚠️ `occasion` is SYSTEM-DERIVED and NEVER caller-supplied in production: a caller that could name its
 * own occasion could declare a question inside the very pass that consumes it and the self-authorisation
 * rule would be void. The parameter exists because the *host* is the thing that knows the occasion.
 */
export async function declareQuestion({
  query, schema, questionKey, asks, checks = [], declaredBy, occasion, supersedesId = null,
} = {}) {
  if (typeof query !== 'function') throw new TypeError('declareQuestion requires a query(sql, params)')
  need(schema, 'schema'); need(questionKey, 'questionKey'); need(asks, 'asks')
  need(declaredBy, 'declaredBy'); need(occasion, 'occasion')

  // ⭐ HARDENING ② — validated at DECLARATION time. A definition naming a check that does not exist is
  // refused when it is declared, ⛔ not discovered at evaluation on some future row: a definition that
  // cannot be evaluated is not a stricter definition, it is an unusable one.
  const v = validateDefinition({ checks })
  if (!v.ok) {
    return { ok: false, refusal: 'invalid-definition', why: v.why, unknown: v.unknown, registered: registeredCheckIds() }
  }

  const { rows } = await query(
    `INSERT INTO ${S(schema)}."mst_slot_questions"
            (question_key, asks, checks, declared_by, declared_in_occasion, supersedes_id)
     VALUES ($1, $2, $3::text[], $4, $5, $6::uuid)
     RETURNING id::text, question_key, asks, checks, declared_in_occasion`,
    [questionKey.trim(), asks.trim(), checks, declaredBy, occasion, supersedesId])
  return { ok: true, question: rows[0] }
}

/**
 * ⭐ The slot's current binding — the input every bind decision derives from.
 */
export async function currentBinding({ query, schema, slotId } = {}) {
  const { rows } = await query(
    `SELECT s.id::text AS slot_id, s.question_id::text AS question_id, q.question_key,
            q.declared_in_occasion
       FROM ${S(schema)}."mst_slots" s
       LEFT JOIN ${S(schema)}."mst_slot_questions" q ON q.id = s.question_id
      WHERE s.id = $1::uuid`, [slotId])
  return rows[0] ?? null
}

/**
 * ⭐⭐ PROPOSE a binding. ⛔ NO EFFECT on `mst_slots` — that is the point.
 *
 * ⭐ The proposal is DURABLE rather than in-memory. `person-service` keeps an in-memory pending map
 * because ITS proposal is ephemeral conversational state; a binding is a deliberate act that must be
 * VISIBLE, so its pending state is a row anyone can read afterwards.
 */
export async function proposeBind({
  query, schema, slotId, questionId, declaredIntent, expectedQuestionId = null, actor, occasion, reason,
} = {}) {
  if (typeof query !== 'function') throw new TypeError('proposeBind requires a query(sql, params)')
  need(schema, 'schema'); need(actor, 'actor')

  const cur = await currentBinding({ query, schema, slotId })
  if (!cur) return { ok: false, refusal: BIND_REFUSAL.noSlot, why: 'no such slot' }

  const check = checkBindRequest({
    slotId, currentQuestionId: cur.question_id, requestedQuestionId: questionId,
    declaredIntent, expectedQuestionId, reason, occasion,
  })
  if (!check.ok) return check
  // ⭐ An identical re-bind converges and writes NOTHING — a change and a non-change must not share a shape.
  if (check.act === 'no-op') return { ok: true, act: 'no-op', proposal: null, why: 'the slot already asks this question' }

  const { rows } = await query(
    `INSERT INTO ${S(schema)}."log_slot_bindings"
            (slot_id, action, derived_act, declared_intent, actor, occasion, reason,
             before_question_id, before_question_key, after_question_id, expected_question_id)
     VALUES ($1::uuid, 'propose', $2, $3, $4, $5, $6, $7::uuid, $8, $9::uuid, $10::uuid)
     RETURNING id::text, derived_act, occasion`,
    [slotId, check.act, declaredIntent, actor, occasion, reason,
      cur.question_id, cur.question_key ?? null, questionId, expectedQuestionId])
  return { ok: true, act: check.act, proposal: rows[0] }
}

/**
 * ⭐⭐⭐ CONFIRM a proposed binding — the ONLY act that changes `mst_slots.question_id`.
 *
 * ⚠️⚠️ TWO GUARANTEES, AND BOTH ARE STRUCTURAL RATHER THAN HOPEFUL:
 *
 *  ① THE OCCASION RULE — a confirm may not share its proposal's occasion. ⛔ Not expressible as a CHECK
 *    (it compares two rows), so it is enforced here, at the one write seam, and proved by RP-D7.
 *
 *  ② ⭐⭐ THE COMPARE-AND-SET IS A `WHERE` CLAUSE, AND THE AUDIT ROW DEPENDS ON IT. The UPDATE is the CTE
 *    and the INSERT selects FROM it, so if the slot moved since the proposal the UPDATE matches nothing,
 *    the INSERT inserts nothing, and the statement reports zero rows. ⇒ **exactly one audit row for a
 *    real change and exactly zero for a non-event**, in ONE statement — so a lost update is impossible
 *    without needing a caller transaction, and an audit row can never describe a change that did not
 *    happen.
 */
export async function confirmBind({ query, schema, proposalId, actor, occasion, reason } = {}) {
  if (typeof query !== 'function') throw new TypeError('confirmBind requires a query(sql, params)')
  need(schema, 'schema'); need(proposalId, 'proposalId'); need(actor, 'actor')
  need(occasion, 'occasion'); need(reason, 'reason')

  const { rows: pr } = await query(
    `SELECT id::text, slot_id::text, derived_act, declared_intent, occasion,
            after_question_id::text, expected_question_id::text, action
       FROM ${S(schema)}."log_slot_bindings" WHERE id = $1::uuid`, [proposalId])
  const proposal = pr[0]
  if (!proposal) return { ok: false, refusal: BIND_REFUSAL.noProposal, why: 'no such proposal' }
  if (proposal.action !== 'propose') {
    return { ok: false, refusal: BIND_REFUSAL.noProposal, why: 'that row is not a proposal' }
  }

  const occ = checkConfirmOccasion({ proposalOccasion: proposal.occasion, confirmOccasion: occasion })
  if (!occ.ok) return occ

  // ⭐ Already confirmed? A second confirmation of one proposal is not a second act.
  const { rows: done } = await query(
    `SELECT id::text FROM ${S(schema)}."log_slot_bindings" WHERE proposal_id = $1::uuid LIMIT 1`, [proposalId])
  if (done[0]) return { ok: false, refusal: 'already-confirmed', why: 'that proposal has already been confirmed' }

  const { rows } = await query(
    `WITH upd AS (
        UPDATE ${S(schema)}."mst_slots"
           SET question_id = $2::uuid, updated_at = now()
         WHERE id = $1::uuid
           AND question_id IS NOT DISTINCT FROM $3::uuid
        RETURNING id
     )
     INSERT INTO ${S(schema)}."log_slot_bindings"
            (slot_id, action, derived_act, declared_intent, actor, occasion, reason,
             before_question_id, after_question_id, after_question_key, expected_question_id, proposal_id)
     SELECT upd.id, 'confirm', $4, $5, $6, $7, $8, $3::uuid, $2::uuid,
            (SELECT question_key FROM ${S(schema)}."mst_slot_questions" WHERE id = $2::uuid),
            $3::uuid, $9::uuid
       FROM upd
     RETURNING id::text, slot_id::text, after_question_id::text`,
    [proposal.slot_id, proposal.after_question_id, proposal.expected_question_id,
      proposal.derived_act, proposal.declared_intent, actor, occasion, reason, proposalId])

  if (!rows[0]) {
    return {
      ok: false,
      refusal: BIND_REFUSAL.expectedMismatch,
      why: 'the slot no longer holds the binding this proposal contradicted — ⛔ nothing was changed and '
        + 'no audit row was written, because an audit row must never describe a change that did not happen',
    }
  }
  return { ok: true, act: proposal.derived_act, binding: rows[0] }
}

/**
 * ⭐⭐⭐ RESOLVE — question_id → what the evaluator needs. ⛔ IT MAKES NO SEMANTIC JUDGEMENT.
 *
 * ⭐ Authoritative = EXACTLY the row the slot points at. ⛔ It does NOT follow `supersedes_id`: a slot
 * bound to a superseded definition still asks THAT question, and following the chain would silently
 * re-interpret every future write to it. ⇒ **supersession alone changes nothing operative; only a rebind
 * makes a new definition live.**
 *
 * ⭐ NAMESPACE-BLIND. Namespace governs the address space and enters through slot IDENTITY; it does not
 * govern the meaning of a question.
 *
 * ⭐⭐ RETURNS TWO THINGS AND KEEPS THEM APART: the question IDENTITY (`slotKind`, consumed by
 * `checkKind` — *is this the same question?*) and the declared CHECKS (consumed by `evaluate` — *is this
 * a valid answer?*). ⛔ A resolve that returned only one would make the other silently unenforceable.
 */
export async function resolveSlotQuestion({ query, schema, slotId } = {}) {
  if (typeof query !== 'function') throw new TypeError('resolveSlotQuestion requires a query(sql, params)')
  need(schema, 'schema'); need(slotId, 'slotId')

  const { rows } = await query(
    `SELECT s.namespace,
            q.id::text          AS question_id,
            q.question_key,
            q.checks,
            q.declared_in_occasion,
            (SELECT b.occasion FROM ${S(schema)}."log_slot_bindings" b
              WHERE b.slot_id = s.id AND b.action = 'confirm'
              ORDER BY b.created_at DESC LIMIT 1) AS bound_in_occasion,
            n.slot_governed,
            (n.namespace_key IS NOT NULL) AS namespace_declared
       FROM ${S(schema)}."mst_slots" s
       LEFT JOIN ${S(schema)}."mst_slot_questions" q ON q.id = s.question_id
       LEFT JOIN ${S(schema)}."mst_namespace_declarations" n ON n.namespace_key = s.namespace
      WHERE s.id = $1::uuid`, [slotId])
  const r = rows[0]
  if (!r) return null
  return {
    namespace: r.namespace,
    // ⭐ UNDECLARED ⇒ slot_governed UNKNOWN ⇒ the gate DEFERS. Undeclared does not mean safe; it means
    // not governed yet — and reads and writers stay permissive, because flipping those would be an outage.
    namespaceDeclared: r.namespace_declared === true,
    slotGoverned: r.namespace_declared === true ? r.slot_governed === true : null,
    questionId: r.question_id ?? null,
    // ⭐ `slotKind` is the question KEY, not the id: `checkKind` compares it against a claim's kind, and
    // a claim declares its kind BY NAME.
    slotKind: r.question_key ?? null,
    checks: Array.isArray(r.checks) ? r.checks : [],
    declaredInOccasion: r.declared_in_occasion ?? null,
    boundInOccasion: r.bound_in_occasion ?? null,
  }
}

/**
 * ⭐ CLAIM-KIND VOCABULARY VALIDATION — ⛔ DIAGNOSIS, NOT SAFETY.
 *
 * ⚠️ The system is already safe without this: `slotKind` IS a declared `question_key`, so a claim kind
 * that MATCHES is necessarily a declared key by construction, and an invented one can only ever DEFER.
 * ⇒ what this adds is the ability to tell *"two real questions disagree"* (⇒ rebind) from *"the model
 * invented a kind"* (⇒ the proposal is nonsense) — two unrelated remedies that otherwise share a message.
 *
 * ⭐ It lives HERE and not in `checkKind` because `checkKind` is PURE and this needs a lookup. ⓘ And its
 * near-term value is the whole value: 100% of slots DEFER until a question is declared and bound, so for
 * now the refusal messages ARE the gate's output.
 */
export async function isDeclaredQuestionKey({ query, schema, claimKind } = {}) {
  if (typeof claimKind !== 'string' || !claimKind.trim()) return false
  const { rows } = await query(
    `SELECT 1 FROM ${S(schema)}."mst_slot_questions" WHERE question_key = $1 LIMIT 1`, [claimKind.trim()])
  return !!rows[0]
}

/** ⛔ Exported so a check can assert the INTENT, not merely the branching. */
export const DECLARE_MAKES_NOTHING_OPERATIVE =
  'A question definition is subject-free and persona-global: declaring one asserts nothing about any '
  + 'person, room or value, and changes no behaviour anywhere. Only BIND makes a definition govern a '
  + 'slot, and only a confirmed bind at that. There is deliberately no combined operation, because one '
  + 'call that creates a permission and applies it is the self-authorisation shape the occasion rule '
  + 'exists to prevent.'
