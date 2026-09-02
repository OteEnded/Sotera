// ⭐⭐⭐ THE KIND PRECONDITION — M2-5. A MEMORY-LAYER gate that binds EVERY writer.
//
// PURE. No stores, no IO, no config, no model.
//
// ── ⭐⭐ THE RULING (Ote, 2026-09-01) ────────────────────────────────────────────────────────────
// *"Make kind compatibility a memory-layer precondition, applying to **every writer**.
//  Unknown/mismatched kind → **DEFER**, ⛔ never an accidental UPDATE."*
//
// ⛔⛔ SO THIS IS NOT DREAMING'S CHECK. Dreaming merely becomes subject to it, like everything else that
// writes. ⭐ That direction is the whole point: the defect it closes was produced by writers that
// existed long before Dreaming, and a gate that only fired for the newest writer would leave the
// original defect exactly where it was.
//
// ── ⚠️⚠️ THE MEASURED DEFECT (M2.d) ─────────────────────────────────────────────────────────────
// A Dreaming **quantity** addressed to `user/preferred_name` (value `Cogito`) produced
// **`UPDATE, supersedes`** — because `resolveConflict` compares `value` by STRING EQUALITY and has
// **no notion of claim KIND at all**. ⇒ a number silently replaced somebody's name.
//
// ── ⭐⭐⭐ THE IDEA THAT MAKES IT WELL-DEFINED ──────────────────────────────────────────────────
//
//     A slot's (entity, attribute) is a QUESTION.  Its KIND is what a valid ANSWER looks like.
//     ⇒ UPDATE is legitimate ONLY when the incoming claim ANSWERS THE SAME QUESTION.
//
// ⭐ And it is a PRECONDITION, ⛔ not a new CONFLICT value: the conflict stage already assumes the two
// claims address the same slot. This runs BEFORE it and decides whether that assumption holds.
// ⛔ Which is why this module imports nothing from the conflict stage and must never call it.
//
// ── ⛔ WHY `DEFER` AND NOT `IGNORE` ─────────────────────────────────────────────────────────────
// `IGNORE` is the memory layer's word for *"perceived and not worth believing"* — a JUDGEMENT. An
// unknown kind is not a judgement about the claim; it is an admission that the question was never
// declared. ⭐ Those have different remedies (declare the question vs. decide about the claim), so they
// must not share a value.

/** ⭐ The precondition's verdicts. ⛔ `ALLOW` only ever means *the assumption the conflict stage makes
 *  is true* — it is ⛔ NOT approval of the claim, which is a later stage's business entirely. */
export const KIND_OUTCOME = Object.freeze({ allow: 'ALLOW', defer: 'DEFER' })

/**
 * ⭐⭐ May a claim of `claimKind` be resolved against a slot of `slotKind`?
 *
 * @param {{slotKind: string|null, claimKind: string|null}} o
 * @returns {{outcome: 'ALLOW'|'DEFER', why: string}}
 */
export function checkKind({ slotKind = null, claimKind = null } = {}) {
  const slot = typeof slotKind === 'string' && slotKind.trim() ? slotKind.trim() : null
  const claim = typeof claimKind === 'string' && claimKind.trim() ? claimKind.trim() : null

  // ⛔⛔ UNKNOWN ⇒ DEFER, AND THIS ARM IS THE EXPENSIVE ONE. ⓘ Measured 2026-09-03: only 55 of 125 live
  // rows carry a `slot_id` at all, so under this ruling most writes DEFER until the question behind the
  // slot is DECLARED. ⭐ That cost is the ruling working, ⛔ not a reason to soften it: the alternative
  // is guessing what question a slot asks, and guessing is what produced the defect.
  if (!slot) {
    return {
      outcome: KIND_OUTCOME.defer,
      why: 'the slot declares no kind — what a valid answer looks like is unknown, and an unknown '
        + 'question cannot authorize replacing its answer',
    }
  }
  if (!claim) {
    return {
      outcome: KIND_OUTCOME.defer,
      why: 'the incoming claim declares no kind — ⛔ it may not be assumed to answer the slot\'s question',
    }
  }
  // ⭐ EXACT MATCH ONLY. ⛔ No coercion, no compatibility table, no "close enough": every one of those is
  // an inference about what the question means, and M2-10 forbids inferring a kind.
  if (slot !== claim) {
    return {
      outcome: KIND_OUTCOME.defer,
      why: `the slot asks for \`${slot}\` and the claim offers \`${claim}\` — a different kind of answer `
        + 'is a different question, and replacing one with the other is the `Cogito` defect',
    }
  }
  return { outcome: KIND_OUTCOME.allow, why: `the claim answers the same question the slot asks (\`${slot}\`)` }
}

/**
 * ⭐ The gate as a caller would use it: DEFER short-circuits, and the reason travels with it.
 * ⛔ It returns a decision, never a mutation, and it never reaches the store.
 */
export function kindPreconditionFor(claim = {}, slot = {}) {
  return checkKind({ slotKind: slot?.kind ?? null, claimKind: claim?.kind ?? null })
}

/** ⛔ Exported so a check can assert the INTENT, not merely the branching. */
export const KIND_IS_A_PRECONDITION_ON_EVERY_WRITER =
  'A slot address is a question and its kind is what a valid answer looks like, so an update is only '
  + 'legitimate when the incoming claim answers the same question. This binds every writer rather than '
  + 'any one of them, because the defect it closes was produced before the newest writer existed: a '
  + 'quantity addressed to a name slot became an UPDATE, since the conflict stage compares values by '
  + 'string equality and has no notion of kind. An unknown or mismatched kind defers rather than being '
  + 'ignored, because deferring says the question was never declared while ignoring would be a judgement '
  + 'about the claim, and those have different remedies.'
