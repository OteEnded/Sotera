// ⭐⭐⭐ CORRECTION CANDIDATES — which stored memory could a person possibly be correcting?
//
// PURE. No store, no model, no config. It turns a turn's retrieval trace into a bounded candidate set.
//
// ── ⭐⭐ THE ONE DESIGN DECISION, AND WHY IT IS NOT SIMILARITY ─────────────────────────────────────
// *"Rome is not a project name"* and *"user's current goal: build Rome in one day"* share **one token**.
// Embedding-nearest would either miss the pair entirely or drag in ten unrelated rows — and ⛔ a memory
// system whose beliefs can be invalidated by a cosine score is a memory system that can be argued out of
// things. So the candidate set is not computed from meaning at all. It is computed from PRESENCE:
//
//     ⭐ THE CORRECTED MEMORY WAS IN HER CONTEXT WHEN THE CORRECTION WAS MADE.
//
// That is not a heuristic about this case, it is what a correction IS: a person can only correct
// something they were shown. The Rome transcript has exactly that shape — she states the belief, and Ote
// corrects it in the next turn. ⛔ A memory that was never in the room cannot be what he was correcting,
// and no amount of textual similarity should be able to promote it into the set.
//
// ⇒ the trace is the candidate set. Bounded, recorded, evidence-backed, and it fails EMPTY rather than
// wide: a turn with no trace yields no candidates, which is the safe direction.
//
// ── ⛔ WHAT THIS MODULE REFUSES TO DO ─────────────────────────────────────────────────────────────
// ⛔ It does not decide that a correction happened. Classifying *"Rome is not a project name"* (a
//    correction) apart from *"Rome wasn't built in a day"* (a quotation of the same shape) from the
//    prose alone is the assertion-gate problem again — and that was already solved once by requiring
//    STRUCTURE rather than a pattern in the text. Here the structure is: **she asserted the belief, and
//    the person disagreed.** Whoever supplies that structure supplies it; this module will not guess it.
// ⛔ It does not rank, score, or pick a winner. It hands back everything that was present, with why.
// ⛔ It does not write. `markContradicted` on the store does that, and only when told to.

import { traceFor, hasTrace } from './memory-retrieval-trace.js'

/** Why a row is a candidate. ⭐ Recorded per candidate so a reader never has to re-derive it. */
export const GROUND = Object.freeze({
  inContext: 'in-context',     // it was retrieved into the turn being corrected
  named: 'named',              // she or the person referred to it explicitly (id / attribute / phrase)
})

/**
 * candidatesFromTrace — the memories that were in front of her during a turn.
 *
 * @param {string|null} turnKey  the turn's user-message id
 * @returns {{observed:boolean, candidates:Array<{id,kind,excerpt,ground,via}>}}
 *
 * ⚠️ `observed` IS NOT `candidates.length > 0`. "Nothing was retrieved this turn" and "we have no record
 * of this turn" are different facts, and a caller that cannot tell them apart will read an unobserved
 * turn as a turn where she was shown nothing. That exact ambiguity hid a 4-in-5 fact drop for a week.
 */
export function candidatesFromTrace(turnKey) {
  const observed = hasTrace(turnKey)
  const candidates = traceFor(turnKey).map((i) => ({
    id: i.id, kind: i.kind, excerpt: i.excerpt, via: i.via, ground: GROUND.inContext,
  }))
  return { observed, candidates }
}

/**
 * candidatesNamed — memories the speaker pointed at directly, by id.
 *
 * ⭐ SECOND IN PRECEDENCE AND STRONGER WHEN PRESENT. If someone names a row, presence is irrelevant —
 * they have told you which one they mean. Kept separate from the trace so a reader can always see which
 * of the two grounds put a candidate in the set.
 */
export function candidatesNamed(ids = [], lookup = () => null) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))].map((id) => {
    const row = lookup(id)
    return {
      id,
      kind: row?.kind ?? null,
      excerpt: String(row?.content ?? '').replace(/\s+/g, ' ').slice(0, 160),
      via: null,
      ground: GROUND.named,
    }
  })
}

/**
 * mergeCandidates — union by id, with `named` winning the ground when a row arrives both ways.
 * PURE. Order is stable: named first, then in-context, because that is the precedence order.
 */
export function mergeCandidates(named = [], inContext = []) {
  const out = new Map()
  for (const c of named) out.set(c.id, c)
  for (const c of inContext) if (!out.has(c.id)) out.set(c.id, c)
  return [...out.values()]
}

/**
 * ⭐⭐⭐ THE GATE. A contradiction may be recorded only when the target was actually in front of the
 * person, or was named by them.
 *
 * ⛔ It returns a REASON on refusal rather than a bare false, because "we could not tell" and "it was
 * not there" are different answers and the caller may want to say which.
 */
export function mayRecordContradiction({ memoryId, turnKey, namedIds = [] } = {}) {
  if (!memoryId) return { ok: false, reason: 'no memory named' }
  if (namedIds.map(String).includes(String(memoryId))) return { ok: true, ground: GROUND.named }
  if (!hasTrace(turnKey)) {
    // ⛔ FAILS CLOSED, AND SAYS SO. An unobserved turn is not permission — it is the absence of evidence,
    // and treating it as permission would let any turn invalidate any belief.
    return { ok: false, reason: 'no retrieval trace for this turn — cannot show it was in her context' }
  }
  const present = traceFor(turnKey).some((i) => i.id === String(memoryId))
  return present
    ? { ok: true, ground: GROUND.inContext }
    : { ok: false, reason: 'that memory was not in her context during this turn' }
}
