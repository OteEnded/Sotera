// ⭐⭐⭐ THE READ-SIDE ADMISSION PROJECTION — what did the system RECORD about these memories? PURE.
//
// No store, no IO, no model. Facts in, facts out — the same standard `memory-admission-gate.js` holds,
// and for the same reason: a projection that can be read by inspection cannot quietly acquire a policy.
//
// ── ⭐⭐⭐ WHAT THIS IS, IN ONE SENTENCE ─────────────────────────────────────────────────────────────
//
//     It answers ONE question: *"what admission facts has the system actually recorded concerning these
//     memories?"* — ⛔ and nothing more.
//
// ⭐ The verdict is a FACT ABOUT THE SYSTEM'S OWN ADMISSION DECISION. ⛔ It is NOT a new fact about the
// world, and ⛔ NOT a universal semantic relationship between the two observations. (Ote, 2026-09-17.)
//
// ── ⛔⛔ THE SECOND RULING, AND IT IS THE ONE THIS FILE EXISTS TO ENFORCE ───────────────────────────
//
//     *"A read consumer may know that an admission verdict exists, but the verdict alone does not
//      authorize the consumer to turn that information into a new semantic claim about how the two
//      memories should be presented together."*
//
// ⇒ ⛔⛔ THERE IS DELIBERATELY NO FUNCTION HERE THAT ANSWERS *"are these compatible?"*, *"do these
// conflict?"*, *"should these be shown together?"* or *"which is current?"*. Those are not omissions to
// be filled in later by a convenience helper — ⭐ their ABSENCE IS THE CONTRACT. The forbidden mappings,
// written out so a future reader cannot reintroduce them by accident:
//
//     ⛔ ADMIT   → "compatible" · "present together" · "merge" · "both current" · "both true"
//     ⛔ ABSTAIN → "contradictory" · "unrelated"
//     ⛔ DEFER   → "conflict" · "unresolved conflict" · "hide one" · "present as alternatives"
//                  · "unrelated" · "either is false"
//
// ⭐ The ONLY legitimate mapping is the identity: preserve the admission vocabulary and its meaning.
//
// ── ⭐⭐ FOUR STATES, AND ⛔ THEY MAY NEVER BE COLLAPSED ─────────────────────────────────────────────
//
//     NO-RECORDED-VERDICT  ⭐ no such evaluation is on record. ⛔⛔ THIS IS NOT A DEFER.
//     ADMIT                both sides established under the SAME declared question ⇒ admitted to compete
//     ABSTAIN              both sides established, and DIFFERENT ⇒ never candidates for one another
//     DEFER                the required question relationship COULD NOT BE ESTABLISHED ⇒ coexistence
//
// ⚠️⛔ `NO-RECORDED-VERDICT ≠ DEFER` IS THE LOAD-BEARING DISTINCTION OF THIS FILE. A DEFER means an
// evaluation HAPPENED and failed to establish the warrant; an absent row means NO SUCH EVALUATION IS
// RECORDED. Collapsing them would manufacture an act that never occurred — the same shape 053's CHECK
// constraint already refuses one layer down.
//
// ⓘ And `ABSTAIN ≠ DEFER` remains locked from the write side: ABSTAIN is a POSITIVE FINDING, DEFER is an
// ABSENCE. They may share a runtime consequence and must never share a state.
//
// ── ⭐⭐ THE ACT IS DIRECTIONAL, AND THIS FILE PRESERVES THAT ───────────────────────────────────────
// The ledger records `incoming_id → incumbent_id`: a NEW observation was evaluated against an INCUMBENT.
// ⛔ That is not symmetric, and the fact that both columns are indexed does not make the EVENT undirected.
// ⇒ every lookup here takes the two ids IN ORDER, and `A→B` is a different question from `B→A`.

/** ⭐ The four read-side states, and there is no fifth. ⛔ `NO-RECORDED-VERDICT` is not a kind of DEFER. */
export const READ_ADMISSION = Object.freeze({
  none: 'NO-RECORDED-VERDICT',
  admit: 'ADMIT',
  abstain: 'ABSTAIN',
  defer: 'DEFER',
})

const KNOWN = new Set([READ_ADMISSION.admit, READ_ADMISSION.abstain, READ_ADMISSION.defer])
const key = (incomingId, incumbentId) => `${incomingId ?? '∅'}>${incumbentId ?? '∅'}`

/**
 * ⭐ Index recorded facts for directional lookup. ⛔ Never merges `A→B` with `B→A`.
 *
 * ⚠️ MOST-RECENT-WINS PER ORDERED PAIR, and it is a real decision rather than a default: the same pair
 * can legitimately be evaluated on several occasions (a re-statement re-enters the same slot), and the
 * ledger keeps every one. ⭐ The projection answers *"what is on record for this ordered pair"* with the
 * LATEST recorded evaluation, and `occurrences` says how many there were — so a caller can see that the
 * pair has a history without this file inventing a rule about which one "counts".
 *
 * @param {Array<{incomingId:string|null, incumbentId:string|null, outcome:string, recordedAt?:Date}>} facts
 * @returns {Map<string, object>} ordered-pair key → the latest fact, carrying `occurrences`
 */
export function indexAdmissionFacts(facts = []) {
  const out = new Map()
  for (const f of Array.isArray(facts) ? facts : []) {
    if (!f || !KNOWN.has(f.outcome)) continue // ⛔ an unknown outcome is dropped, never coerced
    const k = key(f.incomingId, f.incumbentId)
    const prior = out.get(k)
    const newer = !prior || (f.recordedAt ?? 0) >= (prior.recordedAt ?? 0)
    out.set(k, newer
      ? { ...f, occurrences: (prior?.occurrences ?? 0) + 1 }
      : { ...prior, occurrences: prior.occurrences + 1 })
  }
  return out
}

/**
 * ⭐⭐ What did the system record about THIS ordered pair? ⛔ Returns a state, never an interpretation.
 *
 * @param {Map<string, object>} index   from `indexAdmissionFacts`
 * @param {string} incomingId  ⭐ the observation that ARRIVED
 * @param {string} incumbentId ⭐ the observation it was evaluated AGAINST
 * @returns {{outcome:string, recorded:boolean, fact:object|null}}
 */
export function verdictBetween(index, incomingId, incumbentId) {
  const fact = index?.get?.(key(incomingId, incumbentId)) ?? null
  // ⛔⛔ ABSENCE IS ITS OWN ANSWER. It is NOT a DEFER, and it is NOT "unknown whether they compete" —
  // it is *"no such evaluation is on record"*, which is a different and weaker statement than either.
  if (!fact) return { outcome: READ_ADMISSION.none, recorded: false, fact: null }
  return { outcome: fact.outcome, recorded: true, fact }
}

/**
 * ⭐⭐⭐ THE PROJECTION — the admission facts recorded among a given set of memories.
 *
 * ⛔ PAIRWISE, NEVER PER-ROW. One memory can participate in several evaluated pairs with different
 * outcomes, so a row-level `admission: 'DEFER'` field would be a lie the moment a second pair existed.
 * Ote ruled this explicitly, and the shape below is the enforcement: every entry names BOTH ids.
 *
 * ⛔ AND IT NEVER REPORTS A PAIR AS "NO-RECORDED-VERDICT". That state is the answer to a QUESTION ABOUT A
 * SPECIFIC PAIR (`verdictBetween`), ⛔ not a row in a list — enumerating every unevaluated combination
 * would assert that each one was a candidate pair, which is precisely the grouping⇒relation inference
 * the read path does not make.
 *
 * @param {Array<object>} facts  recorded facts, already scoped by the store
 * @param {Array<string>} ids    the memories under consideration
 * @returns {{recorded:Array, evaluatedPairs:number, byOutcome:object, memoriesWithFacts:number}}
 */
export function projectAdmissionFacts(facts = [], ids = []) {
  const inSet = new Set((ids || []).filter(Boolean).map(String))
  // ⭐ BOTH SIDES IN THE SET. A pair whose counterpart is not under consideration is a fact about a
  // memory the caller did not ask about — ⛔ reporting it would hand out an id the caller has no read for.
  const recorded = (Array.isArray(facts) ? facts : []).filter(
    (f) => f && KNOWN.has(f.outcome) && inSet.has(String(f.incomingId)) && inSet.has(String(f.incumbentId)),
  )
  const byOutcome = { [READ_ADMISSION.admit]: 0, [READ_ADMISSION.abstain]: 0, [READ_ADMISSION.defer]: 0 }
  const touched = new Set()
  for (const f of recorded) {
    byOutcome[f.outcome] += 1
    touched.add(String(f.incomingId)); touched.add(String(f.incumbentId))
  }
  return {
    recorded,
    evaluatedPairs: recorded.length,
    byOutcome,
    memoriesWithFacts: touched.size,
  }
}
