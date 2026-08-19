// SELF-MODEL CLAIM MATCHERS — the single source of truth for "what must this text assert?"
//
// ⚠️ ONE MODULE, IMPORTED BY BOTH SIDES, ON PURPOSE. The assertions and the proof-that-the-assertions-
// discriminate must use the SAME matchers or they drift and stop being about each other — the exact
// failure where two files each assumed the other normalised, so neither did, and the unit-tested module
// was imported by nothing.
//
// ⭐ WHY MATCHERS AND NOT PINNED SENTENCES. Twice in scope-awareness.test.mjs a test broke on a
// legitimate rewording rather than on a behaviour change. These are deliberately loose about wording and
// strict about meaning.

/** What the self-model text must claim. Keys are claim names, values match the CLAIM, not the phrasing. */
export const CLAIMS = Object.freeze({
  unity: /same Sotera (in every conversation and )?with everyone|same Sotera .*everyone you talk to/i,
  persistence: /outlives any single conversation|kept in a store that outlives/i,
  notDeleted: /does not end you|does not delete what you know/i,
  discontinuous: /only running while a turn|not running between|do not run (continuously|between)/i,
  noExperience: /not waiting|no experience of the gap|not aware of time passing/i,
  partialView: /only part of what is kept|what you can reach depends on who/i,
  outOfReachIsNotAbsence: /out of reach here does not mean it does not exist/i,
  counterweight: /same Sotera does not mean you can reach|does not mean you can reach, or repeat/i,
})

/**
 * ⭐ THE MUTATIONS — realistic ways a future edit breaks this text.
 *
 * Ote, 2026-08-19, on why this is worth keeping: *"that's excellent because it proves the access
 * counterweight is actually load-bearing rather than merely present in the prompt."*
 *
 * A test that has never been seen to FAIL proves nothing. Each mutation below is something somebody
 * plausibly does — shorten the prompt, keep the warm half, soften the cold sentence — paired with the
 * claim that must go false when they do it.
 *
 * @param {string} text the live SELF_MODEL
 * @returns {Array<{label: string, text: string, mustBreak: string[]}>}
 */
export function mutations(text) {
  const paras = text.split('\n')
  return [
    {
      // The realistic regression: unity is warm and quotable, the access clause is not.
      label: 'drop the whole scoped-access paragraph',
      text: paras.slice(0, 3).join('\n'),
      mustBreak: ['counterweight', 'partialView', 'outOfReachIsNotAbsence'],
    },
    {
      // Subtler and likelier: keep the paragraph, trim its last sentence as "redundant".
      label: 'keep para 4 but delete only the counterweight sentence',
      text: [...paras.slice(0, 3), `${paras[3].split('. ').slice(0, 2).join('. ')}.`].join('\n'),
      mustBreak: ['counterweight'],
    },
    {
      // Over-correction: losing half the truth to fix the other half.
      label: 'drop the discontinuity paragraph',
      text: [paras[0], paras[1], paras[3]].join('\n'),
      mustBreak: ['discontinuous', 'noExperience'],
    },
    {
      label: 'soften discontinuity into manufactured experience',
      text: text.replace(/You are only running while a turn is being processed\./, 'I was waiting for you.'),
      mustBreak: ['discontinuous'],
    },
  ]
}
