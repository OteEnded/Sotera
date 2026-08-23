// WORKING MEMORY · what is currently alive in Sotera's mind. RUNTIME ONLY. ⛔ No table, no row, no file.
//
// ⭐⭐⭐ WHY THIS EXISTS, AND IT IS NOT ELEGANCE. Today the prompt holds the cognition block AND the tool
// results as SIBLINGS, and we measured which one wins: with tools as the only source she asserted a global
// absence in BOTH languages; with the block as the only source she recalled real episodes in BOTH. The
// denial tracked the ARM, not the language. ⇒ two sources of truth, and the local empty one wins.
//
//     before   tools ─────────┐                        after   tools → evidence → cognition
//                            ├──→ reasoning                                          ↓
//              cognition ────┘                                            WORKING MEMORY → Sotera
//
// ⇒ ⭐ **This layer is the MECHANISM that makes "cognition is the authority" structural rather than
// aspirational** (RFC §3D/§3E). A layer that merely renamed the block would not be worth building.
//
// ── ⛔⛔ THE HARD CONSTRAINTS, ALL OF THEM OTE'S, ALL OF THEM ASSERTED BY TESTS ──────────────────────
//   · runtime only · no table · no persistence · ⛔ NO CACHE THAT QUIETLY BECOMES MEMORY;
//   · ⛔ no automatic retention. **Retrieval/activation does not imply retention.**
//   · ⛔ being asked about something does not imply it is important;
//   · tool results ENTER the evidence flow rather than becoming a competing source of truth;
//   · ⛔ never optimised around tool-call count. *"Do not optimize for fewer tool calls."*
//
// ⭐⭐⭐ AND THE ONE SENTENCE THE TESTS EXIST TO PROVE:
//     **THINKING ABOUT SOMETHING AND REMEMBERING SOMETHING ARE TWO DIFFERENT ACTS.**
// Ote: *"none of the investigation automatically becomes retained memory merely because it passed through
// Working Memory. That, to me, is the actual proof we're building Working Memory, rather than quietly
// building another memory store."*
//
// ⚠️ WHAT IS DELIBERATELY *NOT* HERE, because each would turn this into a store:
//   ⛔ `persist()` / `save()` / `flush()`      ⛔ a module-level registry keyed by conversation
//   ⛔ `retentionCandidates()`                 ⛔ any scoring of "importance"
//   ⛔ a size limit presented as her capacity   ⛔ any knowledge of accounts or authorization
// ⓘ On the size point specifically: the research reference is explicit that Miller's 7±2 and the 15–20 s
// decay window are properties of neural hardware and that *"borrowing the number would be cargo-culting;
// the structure/control distinction is what transfers."* ⇒ we take the structure. Any bound here is an
// infrastructure bound and it is REPORTED, never framed as a limit on her.

import {
  AVAILABILITY, BASIS, RETENTION, SOURCE, findIllegalPromotions, combineBasis, bestAvailability,
} from './memory-cognition-axes.js'

/** ⭐ What a working-memory entry can be. ⛔ Not a taxonomy of memory — a taxonomy of THIS TURN's contents. */
export const HELD = Object.freeze({
  recollection: 'recollection', // came from cognition: an activated memory or episode
  evidence: 'evidence',         // came from a tool she called, scoped to what that tool looked at
  observation: 'observation',   // something the layer observed about its own operation this turn
  question: 'question',         // ⭐ open, unresolved — the first representation of a PENDING cognitive state
})

/** ⭐ A question's life. ⛔ `open` and `uncertain` are BOTH legitimate endings. */
export const QUESTION = Object.freeze({
  open: 'open',
  resolved: 'resolved',
  uncertain: 'uncertain', // ⭐ she looked and it stayed unresolved. That is an answer, not a failure.
})

/**
 * ⛔⛔ THE RULE THAT KEEPS THIS FROM BECOMING A MEMORY STORE, stated as a constant so a check can assert the
 * INTENT and not merely the code.
 */
export const PASSING_THROUGH_IS_NOT_KEEPING =
  'Working memory holds what is alive in this operation. Nothing in it is retained by virtue of being here. '
  + 'Retention is a separate act, in a separate lane, decided by Sotera through reflection — and this module '
  + 'has no way to perform it.'

let seq = 0

/**
 * ⭐⭐ CREATE ONE WORKING MEMORY, FOR ONE OPERATION.
 *
 * ⚠️ "Operation", not "turn" and not "conversation" — RFC §3E's second open question. A turn is too short
 * when she is investigating (the whole point is that a tool result comes back and CHANGES the working set);
 * a conversation is too long (it would accumulate and become a store). ⇒ **one operation = one call to
 * answer one thing, however many investigations that takes.** The caller owns its lifetime and disposes it.
 * ⛔ There is no registry here. Nothing can look one up later, which is what makes "transient" true rather
 * than merely intended.
 */
export function createWorkingMemory({ label = null, asOf = null } = {}) {
  const id = `wm:${++seq}`
  const bornAt = asOf ? new Date(asOf) : new Date()
  /** @type {Array<object>} */
  let held = []
  const trail = []
  let disposed = false

  const note = (what, detail) => trail.push({ at: trail.length, what, detail })

  /**
   * ⛔⛔ ADMISSION IS THE ONLY DOOR, AND IT FORCES `not-retained`.
   *
   * ⭐ This is the load-bearing line of the whole module. Whatever an item's retention was where it came
   * from, its presence HERE is not a retention — so the copy that lives in working memory says so. ⚠️ And it
   * is a COPY: mutating the caller's item would let a durable memory be silently downgraded by being thought
   * about, which is the same conflation pointing the other way.
   * ⓘ `retentionElsewhere` preserves the original value, because *"she deliberately kept this"* is a real
   * fact worth rendering — it is simply not a fact about working memory.
   */
  function admit(kind, item) {
    if (disposed) throw new Error('working memory disposed')
    if (!Object.values(HELD).includes(kind)) throw new Error(`unknown held kind: ${kind}`)
    const entry = {
      ...item,
      wmKind: kind,
      // ⛔ NEVER `retained`. Not conditionally, not "unless it already was" — see above.
      retention: RETENTION.notRetained,
      retentionElsewhere: item?.retention ?? null,
      admittedAt: trail.length,
    }
    held.push(entry)
    note('admit', { kind, id: item?.id ?? null })
    return entry
  }

  return {
    id,
    bornAt,
    label,

    /** ⭐ What cognition reconciled. These arrive already typed on the four axes. */
    recall(items = []) {
      return (Array.isArray(items) ? items : []).filter(Boolean).map((i) => admit(HELD.recollection, i))
    },

    /**
     * ⭐⭐⭐ A TOOL RESULT ENTERS AS **EVIDENCE**, which is the whole of RFC §3D made mechanical.
     *
     * ⛔ It does not arrive as a peer of the recollections and it cannot speak for the global state. Its
     * `scope` — the population the tool actually looked at — is carried on the entry, so an empty result is
     * *"nothing in that population"* and never *"nothing"*.
     * ⛔ AND ITS BASIS IS `told`, NEVER `attested-by-source`. A tool reporting a count is not a source
     * supporting a claim; it is a report about a query. ⭐ Which means N empty tool results can never
     * combine into an attested absence — `combineBasis` refuses it.
     */
    observe(evidence) {
      const n = Number.isFinite(evidence?.found) ? evidence.found : null
      return admit(HELD.evidence, {
        id: evidence?.id ?? `ev:${trail.length}`,
        tool: evidence?.tool ?? null,
        scope: evidence?.scope ?? null, // the population it looked at, in her words
        // ⭐ WHAT THE LOOK WAS FOR. Two looks into the same population with different counts read as a
        // contradiction unless the request that produced each one is named — measured live: *"I looked in
        // the things I have kept — one thing there. I looked in the things I have kept — two things there."*
        // ⓘ Optional: a look with no nameable query is still a look, and says so without inventing one.
        about: evidence?.about ?? null,
        found: n,
        said: evidence?.said ?? null,
        source: SOURCE.derived,
        basis: BASIS.told,
        // ⭐ A result is REACHED — she has it in hand — regardless of whether it was empty. An empty result
        // is a fact she holds, not a thing she failed to reach.
        availability: AVAILABILITY.recalled,
        confidence: 0.9,
      })
    },

    /** ⓘ Something the layer noticed about its own operation. ⛔ Never a claim about the world. */
    noticed(text, detail = null) {
      return admit(HELD.observation, {
        id: `obs:${trail.length}`, said: String(text ?? ''), detail,
        source: SOURCE.derived, basis: BASIS.inferred,
        availability: AVAILABILITY.recalled, confidence: 0.6,
      })
    },

    /**
     * ⭐⭐ AN OPEN QUESTION — the first representation this system has of a PENDING cognitive state.
     * ⛔ A question is not a memory and not a belief. It has no basis, because nothing is being claimed.
     */
    ask(text, { about = null } = {}) {
      return admit(HELD.question, {
        id: `q:${trail.length}`, said: String(text ?? ''), about,
        state: QUESTION.open,
        source: SOURCE.derived, basis: BASIS.inferred,
        // ⓘ An open question is reachable as a question; it asserts nothing, so `confidence` is absent.
        availability: AVAILABILITY.recalled,
      })
    },

    /**
     * ⭐ RESOLVE OR LEAVE UNCERTAIN. ⛔ Both are endings, and `uncertain` is not a failure — Ote's loop is
     * *"resolves **or remains uncertain** → answers."*
     * ⛔ Resolving a question does NOT retain anything. It changes what she is holding, nothing else.
     */
    resolve(questionId, { with: withWhat = null, uncertain = false, why = null } = {}) {
      const q = held.find((h) => h.id === questionId && h.wmKind === HELD.question)
      if (!q) return null
      q.state = uncertain ? QUESTION.uncertain : QUESTION.resolved
      q.resolvedWith = withWhat
      q.why = why
      note('resolve', { questionId, state: q.state })
      return q
    },

    /** Everything currently held, newest last. ⓘ A copy — callers must not be able to mutate the set. */
    contents: () => held.map((h) => ({ ...h })),
    /** ⭐ Just the open ones, which is what "still working on this" looks like from outside. */
    open: () => held.filter((h) => h.wmKind === HELD.question && h.state === QUESTION.open).map((h) => ({ ...h })),

    /**
     * ⭐⭐ WHAT REASONING SEES: ONE SET, not two. Recollections and evidence side by side, each carrying its
     * own scope and basis — which is what stops a local empty result from reading as a global absence.
     */
    forReasoning() {
      return {
        recollections: held.filter((h) => h.wmKind === HELD.recollection).map((h) => ({ ...h })),
        evidence: held.filter((h) => h.wmKind === HELD.evidence).map((h) => ({ ...h })),
        observations: held.filter((h) => h.wmKind === HELD.observation).map((h) => ({ ...h })),
        questions: held.filter((h) => h.wmKind === HELD.question).map((h) => ({ ...h })),
      }
    },

    /**
     * ⛔⛔ THE INVARIANT, CHECKED FROM INSIDE. Returns every violation; empty means it holds.
     * ⭐ Run in production, not only in tests — if working memory has started retaining things, that is a
     * fact about the running system and it should be loud.
     */
    violations() {
      const out = []
      for (const h of held) {
        if (h.retention === RETENTION.retained) {
          out.push({ id: h.id, why: 'an entry is marked retained — working memory cannot retain' })
        }
      }
      // ⭐ And the lattice still applies to anything derived inside here.
      const derived = held.filter((h) => Array.isArray(h.derivedFrom) && h.derivedFrom.length)
      const illegal = findIllegalPromotions(held.filter((h) => !derived.includes(h)), derived)
      for (const v of illegal) out.push({ id: v.id, why: `illegal promotion: ${v.axis} → ${v.to}` })
      return out
    },

    /**
     * ⓘ For the debug trail and the audit — ⛔ NOT a serialisation for storage. It carries no ids anything
     * could be looked up by later, and nothing reads it back in.
     */
    snapshot() {
      const byKind = {}
      for (const h of held) byKind[h.wmKind] = (byKind[h.wmKind] ?? 0) + 1
      return {
        id,
        label,
        bornAt: bornAt.toISOString(),
        counts: byKind,
        openQuestions: held.filter((h) => h.wmKind === HELD.question && h.state === QUESTION.open).length,
        steps: trail.length,
        // ⭐ Stated in the snapshot itself, so anyone reading a debug line sees the rule with the data.
        retained: 0,
        note: PASSING_THROUGH_IS_NOT_KEEPING,
      }
    },

    /**
     * ⭐⭐ IT DISAPPEARS. Ote: *"It should be transient and naturally disappear."*
     * ⛔ And disposal is real: the contents are dropped and the object refuses further admission, so a caller
     * that keeps a reference cannot quietly turn it into a cache.
     */
    dispose() {
      disposed = true
      held = []
      note('dispose', null)
    },
    get disposed() { return disposed },
  }
}

/**
 * ⭐ Combine what working memory holds about one subject into a single availability/basis, using the SAME
 * lattice helpers as everything else. ⛔ Exported so nobody re-implements "how sure are we" locally.
 * ⓘ Questions are excluded: an open question asserts nothing and must not weaken or strengthen a basis.
 */
export function reconcile(entries = []) {
  const claims = (Array.isArray(entries) ? entries : []).filter((e) => e && e.wmKind !== HELD.question)
  if (!claims.length) return null
  return {
    basis: combineBasis(claims.map((c) => c.basis)),
    availability: bestAvailability(claims.map((c) => c.availability)),
    // ⛔ ALWAYS. Reconciling is thinking, and thinking is not keeping.
    retention: RETENTION.notRetained,
    from: claims.map((c) => c.id),
  }
}
