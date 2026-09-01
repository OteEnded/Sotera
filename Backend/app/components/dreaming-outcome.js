// ⭐⭐⭐ DREAMING OUTCOMES — what a Dreaming act CONCLUDED, which is not what the run DID.
//
// PURE. No stores, no IO, no config.
//
// ── ⭐⭐ THE DEFECT THIS FILE EXISTS TO NOT REPEAT ─────────────────────────────────────────────────
// `log_conversation_revisits.outcome` is the record-of-act layer that already exists, and it answers a
// DIFFERENT QUESTION: `completed` (77) / `failed` (1) are EXECUTION states — "did the run finish?" —
// and they say nothing about what the act concluded. ⓘ Measured 2026-08-29: **72 of the 77 `completed`
// acts wrote nothing**, so 93.5% of every act ever recorded collapses into one undifferentiated value.
// ⚠️ And its `reason` column carries the CONSTANT `'reflection'` on all 77 rows — a lane label in a
// field named for a justification.
//
// ⇒ ⭐⭐⭐ EXECUTION AND CONCLUSION MUST NEVER SHARE A FIELD. This module owns the CONCLUSION only.
//
// ── ⛔ THE FIVE OUTCOMES ARE IRREDUCIBLE ──────────────────────────────────────────────────────────
// Collapsing any two repeats the "retired" defect one layer up: a later reader could not tell "we were
// not allowed to look" from "we looked and decided not to", and those have OPPOSITE remedies.
//
//   6a  exists but NOT ADMISSIBLE      the boundary refuses it   → remedy: a POLICY act
//   6b  admissible but INSUFFICIENT    not enough to commit      → remedy: MORE EVIDENCE, later
//   6c  sufficient but NOT WORTH IT    a judgement               → remedy: NOTHING; evidence won't overturn it
//   6d  genuinely NOTHING DURABLE      the null case             → —
//   6e  INSTRUMENT: cannot establish what was examined           → remedy: a working instrument
//
// ⭐⭐ The load-bearing pair is 6a vs 6b — they look identical in any output that reports only a
// conclusion, and 6a is the one that can be SILENTLY WRONG: a boundary misconfiguration is
// indistinguishable from a genuine evidential gap.
// ⛔ And 6c must never be laundered into 6b: "not worth it" dressed as "not enough yet" invites the
// system to re-examine a settled question forever.
//
// ── ⚠️⚠️ ONE GAP, SURFACED BY BUILDING THIS AND ⛔ NOT PAPERED OVER ───────────────────────────────
// The contract says an act "concludes in exactly one of 6a–6e" — and a SUCCESSFUL COMMITMENT is not
// among them. The five were derived as the INSUFFICIENCY outcomes. So either a sixth outcome exists,
// or "committed" is orthogonal to this set. ⛔ NOT DECIDED HERE, and it does not need to be:
// ⭐ **M1 cannot commit**, so for M1 the set is complete and every act lands in it.
// ⚠️ M2 must settle it before it writes anything.

/** ⭐ The five, as an ordered, frozen vocabulary. ⛔ No withdraw verb exists — O-1 forbids withdrawal. */
export const OUTCOME = Object.freeze({
  notAdmissible: '6a',
  insufficient: '6b',
  notWorthCommitting: '6c',
  nothingDurable: '6d',
  instrument: '6e',
})

export const OUTCOMES = Object.freeze(Object.values(OUTCOME))

/** ⭐ What each one MEANS, and what would change it. Exported so a reader never has to infer a remedy. */
export const OUTCOME_MEANING = Object.freeze({
  '6a': { means: 'material exists and the boundary refuses it', remedy: 'a policy act — change the boundary' },
  '6b': { means: 'admissible, and not enough to commit', remedy: 'more evidence, later' },
  '6c': { means: 'enough to support a claim, and the claim is not worth being a standing commitment', remedy: 'nothing — it is a judgement' },
  '6d': { means: 'nothing in the admissible material rises to a claim', remedy: '—' },
  '6e': { means: 'the act cannot establish what it examined', remedy: 'a working instrument' },
})

export const COMPLETENESS = Object.freeze({ exhaustive: 'exhaustive', bounded: 'bounded', unknown: 'unknown' })

/**
 * ⭐ `exhaustive` iff N ≥ M · else `bounded(N of M)` · N unavailable ⇒ `unknown`.
 *
 * ⛔ NO GUC, PLANNER CHOICE, `ef_search`, `iterative_scan`, INDEX OR POOL SIZE IS LOCKED BY THIS. The
 * contract requires REPORTING N; the mechanism that produces it is an implementation choice. ⚠️ Which is
 * exactly why `N` unavailable must degrade to `unknown` rather than being guessed: a retrieval arm that
 * cannot say how much it reached has not reached "all of it".
 *
 * @param {{M: number, N: number|null|undefined}} counts
 */
export function completeness({ M, N } = {}) {
  if (!Number.isInteger(M) || M < 0) return { kind: COMPLETENESS.unknown, why: 'M is not a count' }
  if (!Number.isInteger(N) || N < 0) return { kind: COMPLETENESS.unknown, why: 'N was not reported' }
  return N >= M
    ? { kind: COMPLETENESS.exhaustive, why: `N ${N} >= M ${M}` }
    : { kind: COMPLETENESS.bounded, why: `bounded(${N} of ${M})` }
}

/**
 * ⭐⭐ Conclude ONE act. Returns exactly one outcome, with the counts that produced it.
 *
 * ⛔⛔ THE ORDER IS THE CONTRACT, NOT A STYLE CHOICE:
 *   ① N unreported or N < M  ⇒ **6e**, and ⛔ NOTHING ELSE MAY BE CONCLUDED. Both 6b and 6d assert an
 *     ABSENCE, and absence is unclaimable from an incomplete look.
 *   ② withheld > 0           ⇒ **6a**. Checked BEFORE the null case, because "I was not allowed to see
 *     some of it" outranks "I found nothing in what I could see".
 *   ③ M === 0                ⇒ **6d** — and only reachable when withheld is 0, so it means what it says.
 *   ④ a judgement was made   ⇒ **6c** (the caller's verdict; ⛔ counts cannot produce it)
 *   ⑤ otherwise              ⇒ **6b**
 *
 * @param {object} o
 * @param {number} o.M          the eligible population (a VIEW fact) — admitted + withheld
 * @param {number|null} o.N     what the instrument reached (a DRI fact); null ⇒ unreported
 * @param {number} o.withheld   how many of M the boundary refused
 * @param {boolean} [o.judgedNotWorthCommitting]  the caller's 6c verdict
 */
export function concludeFrom({ M, N, withheld = 0, judgedNotWorthCommitting = false } = {}) {
  const comp = completeness({ M, N })
  const at = (outcome, why) => ({ outcome, why, completeness: comp.kind, M, N: N ?? null, withheld })

  // ① ⛔ An incomplete look may not conclude an absence.
  if (comp.kind !== COMPLETENESS.exhaustive) {
    return at(OUTCOME.instrument, `cannot establish what was examined — ${comp.why}`)
  }
  // ② ⭐ "Not allowed to look" outranks "found nothing".
  if (withheld > 0) {
    return at(OUTCOME.notAdmissible, `${withheld} of ${M} withheld by the boundary`)
  }
  // ③ The genuine null case — reachable only with nothing withheld.
  if (M === 0) return at(OUTCOME.nothingDurable, 'the eligible population is empty and nothing was withheld')
  // ④ ⛔ A judgement, never derivable from counts.
  if (judgedNotWorthCommitting) {
    return at(OUTCOME.notWorthCommitting, 'the claim would be supported and is not worth a standing commitment')
  }
  // ⑤
  return at(OUTCOME.insufficient, `${M} admissible, and nothing in it supports a standing commitment`)
}

/**
 * ⛔ THE GUARD, STATED AS A PREDICATE SO A TEST CAN ASSERT IT: may this outcome be concluded at this
 * completeness? 6b and 6d assert an absence; ⛔ neither survives a non-exhaustive look.
 */
export function mayConclude(outcome, completenessKind) {
  if (!OUTCOMES.includes(outcome)) return { ok: false, why: `unknown outcome ${outcome}` }
  const assertsAbsence = outcome === OUTCOME.insufficient || outcome === OUTCOME.nothingDurable
  if (assertsAbsence && completenessKind !== COMPLETENESS.exhaustive) {
    return { ok: false, why: `${outcome} asserts an absence, which an ${completenessKind} look cannot establish` }
  }
  return { ok: true, why: '' }
}

/** ⛔ Exported so a check can assert the INTENT, not merely the branching. */
export const AN_OUTCOME_IS_A_CONCLUSION =
  'These five say what a Dreaming act CONCLUDED. They are not execution states: whether the run finished '
  + 'is a separate fact in a separate field, because the ledger that already exists conflated the two and '
  + '93.5% of its acts collapsed into one value. 6e is not a weaker 6b -- "I looked and it was not enough" '
  + 'and "I cannot establish what I looked at" have different remedies, and only one of them is about the '
  + 'evidence.'
