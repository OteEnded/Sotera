// ⭐⭐⭐ THE ADMISSION GATE — may two durable observations COMPETE for one current-holder disposition? PURE.
//
// No store, no IO, no config, no model. Inputs in, verdict out — so it is checkable by inspection, which is
// ⑧-A's standard for a warrant.
//
// ── ⭐⭐⭐ WHAT THIS EXISTS TO REPAIR (A-D4) ──────────────────────────────────────────────────────────
//
//     similarity → grouping → competition → exclusivity
//                           ↑
//                 ⛔ nothing authorized this transition
//
// A-D4 established that GROUPING and COMPETITION ADMISSION were conflated: the same mechanism that decided
// *"these are alike"* also decided *"these are mutually exclusive."* ⭐ Grouping claims nothing and may be
// wrong; ⛔ competition claims exclusivity and may not.
//
//     Ote, locking the principle: *"Grouping remains allowed to be wrong… A CANDIDATE PAIR IS NOT A
//     COMPETING PAIR UNTIL AN INDEPENDENT WARRANT ADMITS IT. That means the matcher can remain exactly as
//     it is."*
//
// ── ⭐⭐⭐ A — ACCEPT (Ote, 2026-09-17) ───────────────────────────────────────────────────────────────
//
//     *"An undeclared question does not prevent memory formation; it prevents mutually exclusive
//      competition."*
//
// ⇒ a DEFER writes the row and leaves every incumbent live. ⛔ It never holds, discards or refuses the
// observation.
//
// ── ⭐ THE WARRANT IS TWO-SIDED, AND BOTH SIDES ARE DECLARED (D-2) ──────────────────────────────────
//     INCOMING   `claimKind` — declared by the writer that knows        (M2-11: absent stays ABSENT)
//     INCUMBENT  its OWN `question_id_at_admission`, resolved to a key  (048's pin)
//
// ⛔⛔ AND THE PROHIBITION THAT KEEPS THIS FROM GOING VACUOUS — read this before changing a caller:
// THE INCOMING'S QUESTION MAY NEVER BE DERIVED FROM THE INCUMBENT'S PIN, NOR FROM THE RESOLVED SLOT.
// Either would make the two sides the SAME FACT, `incoming === incumbent` would be trivially true, and the
// gate would ALWAYS ADMIT — a 100%-passing gate that proves nothing. ⭐ That is why this function takes two
// separately-sourced arguments and derives neither from the other.
//
// ⛔ AND NEVER FROM THE SLOT'S CURRENT BINDING. 048: a later lookup follows the slot to whatever it points
// at NOW, which is the misreading the pin exists to prevent. The pin is the ROW'S OWN answer.
//
// ── ⭐⭐ ABSTAIN ≠ DEFER — locked by ruling, and the asymmetry is the whole point ────────────────────
//     ABSTAIN  a POSITIVE FINDING — BOTH sides established, and they are DIFFERENT questions.
//              remedy: ⛔ NONE. They were never candidates for one another.
//     DEFER    an ABSENCE — EITHER side is not established.
//              remedy: ⭐ DECLARE THE QUESTION for the missing side.
// ⚠️ They may share a runtime consequence (no competition) and must NEVER share a state: the remedies
// differ, and a refusal that names the wrong remedy is worse than one that names none.
//
// ⓘ THEREFORE ABSTAIN IS UNREACHABLE UNTIL PINS EXIST, and that is the gate being honest rather than a
// defect: the system may not claim *"these two are unrelated"* on a corpus where it cannot establish that
// they are. ⭐ The pin propagates forward, so the state becomes reachable naturally — ⛔ never by backfill.

/** ⭐ The four outcomes, and there is no fifth. ⛔ `NOT-IN-SCOPE` is not a kind of DEFER. */
export const ADMISSION = Object.freeze({
  notInScope: 'NOT-IN-SCOPE',
  admit: 'ADMIT',
  abstain: 'ABSTAIN',
  defer: 'DEFER',
})

/** ⭐ Which warrant form decided it. Today only the Q-route reaches this module; the STANDING route lives
 *  in the Identity Resolver and is deliberately NOT re-plumbed through here (D-3: keep it narrow). */
export const ADMISSION_ROUTE = Object.freeze({ question: 'q-route', standing: 'standing' })

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * ⭐⭐ May this incoming observation COMPETE with this one incumbent?
 *
 * ⚠️ PER-PAIR, because A-D4 established exclusivity is a claim about a PAIR. Three rows under one label
 * carrying three different questions yield THREE verdicts, ⛔ not one arena.
 *
 * @param {object} o
 * @param {boolean} o.exclusivityBearing  is there an incumbent this write could displace at all?
 * @param {string|null} o.incomingQuestionKey   ⭐ from the INCOMING's `claimKind`. ⛔ never from a row.
 * @param {string|null} o.incumbentQuestionKey  ⭐ from the INCUMBENT's OWN pin. ⛔ never from the slot.
 * @returns {{outcome: string, why: string}}
 */
export function admitPair({
  exclusivityBearing = false, incomingQuestionKey = null, incumbentQuestionKey = null,
} = {}) {
  // ⭐ Nothing would be displaced ⇒ the gate has no business here. ⛔ NOT a DEFER: the remedy is NOTHING.
  if (!exclusivityBearing) {
    return {
      outcome: ADMISSION.notInScope,
      why: 'this write displaces nothing — competition admission does not apply to it',
    }
  }
  const incoming = str(incomingQuestionKey)
  const incumbent = str(incumbentQuestionKey)

  // ⭐⭐ EITHER SIDE MISSING ⇒ DEFER. ⛔ And the two halves say DIFFERENT things, because the remedy differs:
  // one writer must declare, and a reader needs to know WHICH.
  if (!incoming && !incumbent) {
    return {
      outcome: ADMISSION.defer,
      why: 'neither the incoming claim nor the incumbent has a declared question — ⛔ nothing establishes '
        + 'that they answer the same one, so they may not compete. Declare the question for both.',
    }
  }
  if (!incoming) {
    return {
      outcome: ADMISSION.defer,
      why: 'the incoming claim declares no question — ⛔ it may not be assumed to answer the one the '
        + 'incumbent answers. Declare the question the claim answers.',
    }
  }
  if (!incumbent) {
    return {
      outcome: ADMISSION.defer,
      why: `the incoming claim answers \`${incoming}\` and the incumbent was admitted under no declared `
        + 'question — ⛔ its side is not established, and the slot may not stand in for it.',
    }
  }

  // ⭐ EXACT MATCH ONLY. ⛔ No coercion, no compatibility table, no "close enough": every one of those is an
  // inference about what the question means, and M2-10 forbids inferring a kind.
  if (incoming !== incumbent) {
    return {
      outcome: ADMISSION.abstain,
      why: `the incoming claim answers \`${incoming}\` and the incumbent answers \`${incumbent}\` — `
        + '⭐ two different questions, so they were never candidates for one another and neither displaces '
        + 'the other. ⛔ There is no remedy; this is the correct outcome.',
    }
  }
  return {
    outcome: ADMISSION.admit,
    why: `both were established as answering \`${incoming}\` — they compete for one current answer to it`,
  }
}

/**
 * ⭐⭐⭐ Apply `admitPair` across a candidate set and return THE ADMITTED SUBSET.
 *
 * ⭐ This return value is the entire repair. `reconcileFact`'s `matches` used to be the whole grouped
 * bucket; it becomes this. Every row the reconcile path can invalidate comes from `matches`
 * (`plan.supersedes ∈ matches`, `plan.collapse ⊆ matches`), so narrowing it here makes an un-admitted
 * invalidation STRUCTURALLY IMPOSSIBLE — ⛔ no second guard is needed anywhere downstream.
 *
 * ⛔ `candidates` ORDER IS PRESERVED — `reconcileFact` relies on newest-first so `matches[0]` is the
 * current belief.
 *
 * @param {object} o
 * @param {Array<{id:string}>} o.candidates      the GROUPED rows, newest-first. ⭐ Grouping may be wrong.
 * @param {string|null} o.incomingQuestionKey    ⛔ from `claimKind` ONLY — see the prohibition above.
 * @param {Map<string,string|null>} [o.incumbentKeyById]  row id → its OWN admitting question key.
 * @param {boolean} [o.inScope]                  ⛔ false for families this contract does not govern
 *                                               (the identity namespace; consolidation's constructed-from
 *                                               lineage). Ruled NOT-IN-SCOPE, ⛔ not deferred.
 * @returns {{admitted: Array, verdicts: Array<{incumbentId:string, outcome:string, why:string,
 *            incomingQuestionKey:string|null, incumbentQuestionKey:string|null}>}}
 */
export function admitCandidates({
  candidates = [], incomingQuestionKey = null, incumbentKeyById = null, inScope = true,
} = {}) {
  const rows = Array.isArray(candidates) ? candidates.filter(Boolean) : []
  // ⭐ No incumbent, or a family this contract does not govern ⇒ NOT-IN-SCOPE for every pair, and ⛔ nothing
  // is recorded: a gate that did not apply has no verdict to account for.
  // ⭐ `summary` is returned HERE TOO, and that is load-bearing: `evaluated: 0` is what tells a caller
  // *"nothing comparable was found"* as opposed to *"some were found and declined"*. ⛔ Omitting it
  // would make a genuine NEW indistinguishable from a DEFER again — the very defect this closes.
  if (!inScope || !rows.length) return { admitted: [], verdicts: [], summary: summariseAdmission([]) }

  const verdicts = []
  const admitted = []
  for (const row of rows) {
    const v = admitPair({
      exclusivityBearing: true,
      incomingQuestionKey,
      // ⭐ the row's OWN pin, resolved by the host. `undefined` and `null` both mean NOT ESTABLISHED —
      // ⛔ they never mean "use the slot's question".
      incumbentQuestionKey: incumbentKeyById?.get(row.id) ?? null,
    })
    verdicts.push({
      incumbentId: row.id,
      outcome: v.outcome,
      why: v.why,
      incomingQuestionKey: str(incomingQuestionKey),
      incumbentQuestionKey: incumbentKeyById?.get(row.id) ?? null,
    })
    if (v.outcome === ADMISSION.admit) admitted.push(row)
  }
  return { admitted, verdicts, summary: summariseAdmission(verdicts) }
}

/**
 * ⭐⭐⭐ THE RECEIPT SUMMARY — what happened to THIS WRITE, ⛔ not which pairs were evaluated.
 *
 * ── ⛔⛔ NO INCUMBENT IDS. RULED BY OTE, 2026-09-17 ──────────────────────────────────────────────────
 *     *"receipt = what happened to this write · ledger = which pairs were evaluated and why"*
 * ⇒ the per-pair detail lives in `log_memory_admissions` and ONLY there. Putting ids here would make the
 * receipt a second, thinner copy of the ledger — two accounting layers that can disagree.
 *
 * ── ⭐ WHY `evaluated` IS THE LOAD-BEARING FIELD ───────────────────────────────────────────────────
 * Before this existed, a DEFER and a genuinely NEW write were BYTE-IDENTICAL to the caller: both returned
 * `action: 'add'` with no `supersedes`. ⭐ `evaluated: 0` means *nothing comparable was found*;
 * `evaluated: 3, deferred: 3` means *three were found and competition was declined*. ⛔ That difference is
 * the entire point of this object.
 *
 * ⚠️ AND THERE IS DELIBERATELY NO SINGLE `outcome` FIELD. One write can legitimately produce SEVERAL
 * verdicts — Control B proves an ADMIT and a DEFER in the same write — so naming one would be the
 * collapse this arc has refused at every layer.
 *
 * ⛔ THIS IS DEVELOPER/OPERATOR ACCOUNTABILITY. It never reaches the model: `forModel` is a constructed
 * allowlist carrying `ok`/`state`/`id` only, and Ote ruled the model is told *what happened*, never a
 * remedy it does not possess — *"declare the question"* is unactionable at 1 declared question.
 */
export function summariseAdmission(verdicts = []) {
  const list = Array.isArray(verdicts) ? verdicts : []
  const count = (o) => list.filter((v) => v?.outcome === o).length
  const deferred = count(ADMISSION.defer)
  return {
    evaluated: list.length,
    admitted: count(ADMISSION.admit),
    deferred,
    abstained: count(ADMISSION.abstain),
    // ⭐ THE REMEDY, carried verbatim from the first deferred verdict — a refusal a reader cannot act on
    // is noise. ⛔ null when nothing was deferred, so its presence MEANS something.
    why: deferred ? (list.find((v) => v?.outcome === ADMISSION.defer)?.why ?? null) : null,
  }
}
