// ⭐⭐⭐ THE BIND RULES — PURE. No store, no IO, no config, no model.
//
// BIND is the hazardous half of the declaration work. DECLARE creates vocabulary that does nothing;
// **BIND makes a definition OPERATIVE for real material** — and a slot was minted get-or-create from a
// label a component that "must never fail a write" never interpreted. So every rule here is about making
// the act impossible to perform silently or by accident.
//
// ── ⭐⭐ THE DISCRIMINATOR, AND IT WAS ALREADY BUILT FOR SOMETHING ELSE ─────────────────────────────
// `UNRESOLVED · UNKNOWN · NONE-EXISTS · bounded · not-examined` are all EXPLICIT NON-CLAIMS, and the same
// rule that separates ESTABLISH from CORRECT on the origin axis separates the two bind acts here:
//
//     FILLING a non-claim      = first-bind     (`question_id IS NULL` is an explicit non-claim)
//     CONTRADICTING a claim    = rebind
//
// ⭐ The three-valued epistemic vocabulary, locked for honesty, turns out to be the act boundary.
//
// ── ⭐ INTENT IS A COMPARE-AND-SET GUARD, ⛔ NEVER AN AUTHORITY ────────────────────────────────────
// The act is DERIVED from (current, requested) — a derivable fact must not also be writable. But derived
// alone allows SILENT ACT-DRIFT: a caller intends a first bind, someone else binds the slot in between,
// and the same request is now a rebind. So the caller DECLARES an intent and a mismatch REFUSES, naming
// both. ⛔ The intent grants nothing; it makes drift loud.
//
// ── ⛔⛔ AND THE OCCASION RULE IS THE WHOLE POINT OF PROPOSE/CONFIRM ───────────────────────────────
// *Neither the DECLARE nor the BIND that makes a question operative may share the occasion that consumes
// it.* If Sotera may declare, and Dreaming is Sotera, nothing else stops Dreaming from declaring and
// binding the question it needs in order to commit — in one pass. Withholding the capability is an
// OFFER-layer restriction, and this project measured what that is worth: a withheld tool was called four
// times across three days. ⇒ enforcement is here and at admission, ⛔ never at the offer.

/** ⭐ The two bind acts, and there is no third. ⛔ "Retract" is a rebind to a different question. */
export const BIND_ACT = Object.freeze({ firstBind: 'first-bind', rebind: 'rebind' })

/** ⭐ Refusal classes. Each names WHICH field or rule refused — a refusal that cannot be acted on is noise. */
export const BIND_REFUSAL = Object.freeze({
  noSlot: 'no-slot',
  noQuestion: 'no-question',
  noReason: 'no-reason',
  noOccasion: 'no-occasion',
  intentMismatch: 'intent-mismatch',
  expectedMissing: 'expected-current-missing',
  expectedMismatch: 'expected-current-mismatch',
  sameOccasion: 'same-occasion',
  noProposal: 'no-proposal',
})

const isId = (v) => typeof v === 'string' && v.trim().length > 0
const norm = (v) => (isId(v) ? v.trim() : null)

/**
 * ⭐⭐ DERIVE THE ACT from (current, requested). ⛔ Never supplied by a caller.
 *
 * @returns {'first-bind'|'rebind'|'no-op'}
 */
export function deriveBindAct({ currentQuestionId = null, requestedQuestionId = null } = {}) {
  const cur = norm(currentQuestionId)
  const req = norm(requestedQuestionId)
  // ⭐ An identical re-bind CONVERGES and writes no audit row — a change and a non-change must never
  // share a shape. The datastore guarantees convergence; the consumer does not have to.
  if (cur && req && cur === req) return 'no-op'
  return cur ? BIND_ACT.rebind : BIND_ACT.firstBind
}

/**
 * ⭐⭐⭐ VALIDATE A BIND REQUEST — the whole precondition set, in one place, all-or-nothing.
 *
 * ⛔ A PARTIAL ACT IS REFUSED WHOLE, naming the offending field. Per-fact semantics must never become
 * partial or best-effort mutation: a half-applied act is the composition-order failure family, and
 * "best-effort" would hide which half landed.
 *
 * @returns {{ok:true, act:'first-bind'|'rebind'|'no-op'} | {ok:false, refusal:string, why:string}}
 */
export function checkBindRequest({
  slotId = null,
  currentQuestionId = null,
  requestedQuestionId = null,
  declaredIntent = null,
  expectedQuestionId = null,
  reason = null,
  occasion = null,
} = {}) {
  if (!isId(slotId)) return { ok: false, refusal: BIND_REFUSAL.noSlot, why: 'a bind names one slot' }
  if (!isId(requestedQuestionId)) {
    return { ok: false, refusal: BIND_REFUSAL.noQuestion, why: 'a bind names the question definition it points the slot at' }
  }
  // ⭐ Required. An unreasoned interpretation of somebody else's phrasing is anonymous in effect even
  // when the actor is recorded.
  if (!isId(reason)) {
    return { ok: false, refusal: BIND_REFUSAL.noReason, why: 'a bind must say WHY — an interpretation of a label nobody examined may not be anonymous in effect' }
  }
  // ⛔ System-derived. A caller that could name its own occasion could bypass the self-authorisation rule.
  if (!isId(occasion)) {
    return { ok: false, refusal: BIND_REFUSAL.noOccasion, why: 'a bind must carry the occasion it was performed in — the self-authorisation rule compares it' }
  }

  const act = deriveBindAct({ currentQuestionId, requestedQuestionId })
  if (act === 'no-op') return { ok: true, act }

  // ⭐ The CAS guard. ⛔ It confers nothing; it makes act-drift loud instead of silent.
  if (declaredIntent !== act) {
    return {
      ok: false,
      refusal: BIND_REFUSAL.intentMismatch,
      why: `the caller declared \`${declaredIntent ?? 'nothing'}\` and the state derives \`${act}\` — `
        + 'the slot moved between the read and the write, or the intent was wrong. ⛔ Authority is checked '
        + 'against the DERIVED act, never the declared one',
    }
  }

  if (act === BIND_ACT.rebind) {
    // ⭐⭐ THE WHOLE origin state being contradicted, ⛔ not merely the field being changed — a concurrent
    // edit elsewhere must not pass unnoticed while the targeted field happens to match.
    if (!isId(expectedQuestionId)) {
      return { ok: false, refusal: BIND_REFUSAL.expectedMissing, why: 'a rebind must state the binding it contradicts' }
    }
    if (norm(expectedQuestionId) !== norm(currentQuestionId)) {
      return {
        ok: false,
        refusal: BIND_REFUSAL.expectedMismatch,
        why: `the rebind expected \`${expectedQuestionId}\` and the slot holds \`${currentQuestionId ?? 'nothing'}\` — `
          + 'it would have contradicted a different claim than intended',
      }
    }
  }

  return { ok: true, act }
}

/**
 * ⭐⭐⭐ THE OCCASION RULE — a CONFIRM may not share its PROPOSAL's occasion.
 *
 * ⚠️ This cannot be a CHECK constraint: comparing two rows is not something a CHECK may do. So it lives
 * here, at the one write seam, and is proved by RP-D7 rather than assumed.
 *
 * ⭐ It is `person-service`'s later-turn rule, and the ONLY one of its three mechanisms that survives:
 * the TTL dissolved because freshness comes from expected-current (a compare-and-set), not a clock, and
 * "a re-proposal must not reset the clock" dissolved because there is no clock.
 */
export function checkConfirmOccasion({ proposalOccasion = null, confirmOccasion = null } = {}) {
  if (!isId(proposalOccasion)) return { ok: false, refusal: BIND_REFUSAL.noProposal, why: 'the proposal carries no occasion' }
  if (!isId(confirmOccasion)) return { ok: false, refusal: BIND_REFUSAL.noOccasion, why: 'the confirmation carries no occasion' }
  if (norm(proposalOccasion) === norm(confirmOccasion)) {
    return {
      ok: false,
      refusal: BIND_REFUSAL.sameOccasion,
      why: 'a binding may not be proposed and confirmed in the same occasion — that is one act wearing two, '
        + 'and the separation is the only evidence that a judgement about somebody else\'s phrasing was deliberate',
    }
  }
  return { ok: true }
}

/**
 * ⭐⭐⭐ THE SELF-AUTHORISATION RULE, at the CONSUMER side.
 *
 * *Neither the DECLARE nor the BIND that makes a question operative may share the occasion that consumes
 * it.* ⭐ Enforced here — one gate — rather than per declaring caller: enforcing N times is forgetting once.
 *
 * ⚠️ A CONSUMER WITH NO OCCASION CANNOT PROVE NON-COLLISION ⇒ DEFER. Failing closed, like every other
 * unknown in this gate: "I could not establish that this is a different occasion" must never become
 * "this is a different occasion".
 *
 * @returns {{ok:true} | {ok:false, refusal:string, why:string}}
 */
export function checkConsumingOccasion({
  consumingOccasion = null,
  declaredInOccasion = null,
  boundInOccasion = null,
} = {}) {
  if (!isId(consumingOccasion)) {
    return {
      ok: false,
      refusal: BIND_REFUSAL.noOccasion,
      why: 'the consumer carries no occasion, so it cannot establish that the question was not declared or '
        + 'bound by this very act — ⛔ and an unprovable non-collision defers',
    }
  }
  const c = norm(consumingOccasion)
  if (norm(declaredInOccasion) === c) {
    return {
      ok: false,
      refusal: BIND_REFUSAL.sameOccasion,
      why: 'the question was DECLARED in this same occasion — an act may not author the permission it is now using',
    }
  }
  if (norm(boundInOccasion) === c) {
    return {
      ok: false,
      refusal: BIND_REFUSAL.sameOccasion,
      why: 'the slot was BOUND to this question in this same occasion — a definition declared long ago and '
        + 'bound mid-pass is the same self-authorisation, one step over',
    }
  }
  return { ok: true }
}

/** ⛔ Exported so a check can assert the INTENT, not merely the branching. */
export const BIND_IS_THE_OPERATIVE_ACT =
  'DECLARE creates vocabulary and makes nothing operative; BIND makes one definition govern one slot, and '
  + 'is therefore the act that can do harm. A slot was minted get-or-create from a label that a component '
  + 'whose contract is "slot bookkeeping must never be able to fail a write" never interpreted, so binding '
  + 'one is a judgement about material nobody examined. That is why the act is proposed and confirmed in '
  + 'DIFFERENT occasions, carries a required reason, is audited durably, and refuses whole rather than in '
  + 'part. The act itself is derived from whether the slot currently claims a question; the caller\'s '
  + 'declared intent is a compare-and-set guard that grants nothing.'
