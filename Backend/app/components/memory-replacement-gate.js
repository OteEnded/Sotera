// ⭐⭐⭐ THE REPLACEMENT GATE — M2 as the REPLACEMENT AUTHORITY for governed slots. PURE.
//
// No store, no IO, no config, no model. It answers ONE question and returns THREE states.
//
// ── ⭐⭐⭐ *NOT IN SCOPE* AND *DEFER* ARE DIFFERENT STATES WITH DIFFERENT REMEDIES ──────────────────
// Ote, ratifying this contract: *"don't let the implementation accidentally turn 'not in scope' into
// DEFER."* So this module never returns a single boolean:
//
//     NOT-IN-SCOPE   the gate does not apply here at all      ⇒ remedy: NOTHING. Legacy runs unchanged
//     ALLOW          governed, and the claim answers the slot's question
//     REFUSE         governed, and it does not                ⇒ remedy: declare/rebind, or fix the claim
//
// ⛔ Collapsing the first into the second is the failure this arc has paid for repeatedly: *"I could not
// establish X"* becoming *"X is established"*, one axis over. An ungoverned slot is **not governed yet**,
// ⛔ not unknown-and-therefore-suspect.
//
// ── ⭐⭐ WHAT IT GOVERNS, AND WHY THE OTHER THREE OUTCOMES CANNOT REACH IT ─────────────────────────
// `resolveConflict` has FOUR outcomes and only ONE is a value replacement:
//
//     NEW        write, nothing invalidated              ⛔ out of scope
//     NOOP       no row written at all                   ⛔ out of scope
//     DUPLICATE  reinforce + COLLAPSE the extras         ⛔ NEVER GATED
//     UPDATE     new row supersedes + collapse extras    ⭐ GOVERNED
//
// ⭐⭐⭐ AND *"COLLAPSE IS NEVER GATED"* IS GUARANTEED BY PLACEMENT, ⛔ NOT BY A CONDITIONAL: the caller
// applies this at the store's `create`, and the NOOP/DUPLICATE branch of `reconcileFact` **returns before
// `create` is ever called**. The gate is not on that code path, so it cannot suppress convergence.
//
// ⚠️ ONE HONEST NUANCE, STATED RATHER THAN GLOSSED. Inside an UPDATE the superseded row and any duplicate
// extras are invalidated together, AFTER the create. So a refusal also forgoes that write's opportunistic
// heal. ⭐ It creates NO duplicate — the prior state is left exactly as it was — and the alternative would
// be a refusal that mutates, which is the partial-act failure this project refuses everywhere else.
// ⇒ a refusal leaves the world as it found it. That is the correct trade, and it is a trade.

/** ⭐ Three states, and there is no fourth. ⛔ `NOT_IN_SCOPE` is not a kind of DEFER. */
export const REPLACEMENT_SCOPE = Object.freeze({ notInScope: 'NOT-IN-SCOPE', governed: 'GOVERNED' })
export const REPLACEMENT = Object.freeze({ allow: 'ALLOW', refuse: 'REFUSE' })

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * ⭐⭐ May this write REPLACE the claim currently in the slot?
 *
 * @param {object} o
 * @param {boolean} o.isUpdate      ⭐ is this write superseding an existing row? (`supersedes_id` present)
 * @param {boolean|null} o.slotGoverned  the NAMESPACE's `slot_governed`; ⛔ null when undeclared
 * @param {string|null} o.slotKind  the slot's declared question key, or null when unbound
 * @param {string|null} o.claimKind what question the incoming claim says it answers
 * @returns {{scope: string, outcome: string|null, why: string}}
 */
export function governsReplacement({
  isUpdate = false, slotGoverned = null, slotKind = null, claimKind = null,
} = {}) {
  // ⭐ NEW · NOOP · DUPLICATE — nothing is being replaced. ⛔ Not a DEFER; the gate has no business here.
  if (!isUpdate) {
    return {
      scope: REPLACEMENT_SCOPE.notInScope, outcome: null,
      why: 'this write replaces nothing — the replacement authority does not apply to it',
    }
  }
  // ⭐ An UNDECLARED namespace is not governed YET. Undeclared does not mean unsafe.
  if (slotGoverned !== true) {
    return {
      scope: REPLACEMENT_SCOPE.notInScope, outcome: null,
      why: 'the slot\'s namespace is not declared slot-governed — legacy reconciliation is the authority here',
    }
  }
  // ⭐⭐ A slot with no declared question is UNGOVERNED, ⛔ not "governed with an unknown question".
  // This is the branch Ote singled out: the remedy for it is *declare and bind*, and the remedy for a
  // REFUSE is *fix the claim* — so they must never share a state.
  const slot = str(slotKind)
  if (!slot) {
    return {
      scope: REPLACEMENT_SCOPE.notInScope, outcome: null,
      why: 'no question has been declared and bound for this slot — it is not governed yet, and legacy '
        + 'reconciliation is unchanged for it',
    }
  }

  // ── from here the slot IS governed, and M2 is the authority ────────────────────────────────────
  const claim = str(claimKind)
  if (!claim) {
    return {
      scope: REPLACEMENT_SCOPE.governed, outcome: REPLACEMENT.refuse,
      why: `the slot asks \`${slot}\` and the incoming claim declares no kind — ⛔ a claim may not be `
        + 'assumed to answer the question it is replacing the answer to',
    }
  }
  if (claim !== slot) {
    return {
      scope: REPLACEMENT_SCOPE.governed, outcome: REPLACEMENT.refuse,
      why: `the slot asks \`${slot}\` and the claim answers \`${claim}\` — a different question, and `
        + 'replacing one answer with the answer to another is the `Cogito` defect',
    }
  }
  return {
    scope: REPLACEMENT_SCOPE.governed, outcome: REPLACEMENT.allow,
    why: `the claim answers the same question the slot asks (\`${slot}\`)`,
  }
}

/** ⛔ Exported so a check can assert the INTENT, not merely the branching. */
export const M2_IS_THE_REPLACEMENT_AUTHORITY =
  'For a governed slot, M2 decides whether an UPDATE may replace the current claim — it is not an extra '
  + 'safety check layered over legacy reconciliation. An "additional gate" would be vacuous by '
  + 'construction: falling through to legacy on DEFER means the gate fires only where a slot is both '
  + 'governed and mismatched, and never protects an ungoverned slot, which is every slot in the corpus. '
  + 'Governance is opted into one slot at a time by a deliberate bind, which is what makes an authority '
  + 'safe rather than sweeping. A refusal leaves the previous belief live and the world unchanged, so the '
  + 'exactly-one-live-row invariant survives a refusal as well as an acceptance.'
