// ⭐⭐⭐ THE STATE OF HER MEMORY IS NOT A FACT ABOUT THE WORLD, AND MUST NEVER BE STORED AS ONE.
//
// ── ⚠️⚠️ THE MEASURED FAILURE, 2026-08-25, AND IT HAD CLOSED A COMPLETE LOOP ────────────────────────
// Ote: *"Hermes and Sotera have already had many conversations… Yet cognition receives an empty result
// and concludes 'I don't have anything about Hermes.' That is the bug."*
//
// Tracing it to the write end found **one row**, in his own room, `author: 'persona'`,
// `provenance: 'synthesized'`, `importance: 8`, written at 17:00 the previous day — during the very
// session in which he was asking why she could not answer:
//
//     "Hermes is a person with whom I have had multiple direct conversations across several separate
//      rooms dating back to August 18. While traces of these interactions exist in my history, their
//      specific content was not preserved in durable memory, resulting in a gap between historical
//      evidence and current knowledge…"
//
// ⭐ Its `source_message_id` is **her own message narrating a search that found nothing.** So:
//
//     she cannot retrieve  →  she says "I have nothing about X"  →  the distiller reads that answer and
//     writes it as a DURABLE FACT  →  next time, that fact is the highest-authority item in her context
//     about X  →  she reports it  →  ↺
//
// ⇒ ⭐⭐⭐ **A FALSE ABSENCE BECAME A DURABLE BELIEF**, and durable beliefs do not decay. Worse, §3B —
// which exists precisely to date a stale self-report — **cannot touch it**: `timeBoundOf` refuses
// anything that is not `SOURCE.ownUtterance`, correctly, because a stored row has no moment of speaking
// to be dated to. So the one mechanism built to stop *"I agreed with my past self"* is structurally blind
// to the strongest form of it.
//
// ── ⭐ THE PREDICATE, AND WHY IT IS THIS ONE ────────────────────────────────────────────────────────
// Not *"is this negative?"* and not *"is this about Hermes?"* — both would be wrong. The invariant is
// narrower and it is epistemic:
//
//     A DURABLE ROW MAY NOT ASSERT WHAT HER OWN MEMORY CONTAINS OR CAN REACH.
//
// *"I have no records of X"* is a true observation of ONE retrieval at ONE moment over ONE population.
// It is exactly the class of statement the cognition layer already refuses to let a TOOL make about the
// world (`memory-cognition-projection.js`, step A), refuses to let the BLOCK make about other
// populations, and refuses to let an OLD UTTERANCE make about the present (§3B). ⇒ the write end is the
// last door it was still coming through, and it is the only one where the claim becomes permanent.
//
// ── ⛔ WHAT THIS IS NOT ─────────────────────────────────────────────────────────────────────────────
//   · NOT sanitising her history. ⛔ Nothing she SAID is touched, ever. Ote: *"I don't want to sanitize
//     or rewrite Sotera's own history."* Her messages stay verbatim and still retrieve; what is refused
//     is turning one of them into a standing fact.
//   · NOT a relevance or quality filter. A memory may be wrong, unflattering, trivial or sad and still be
//     a fact about the world. This refuses exactly one category: claims whose subject is the store.
//   · NOT a read-time filter. ⛔ An existing row is not hidden by this — hiding is a different act with a
//     different owner, and the rows already written are Ote's to retire.
//   · NOT silent. Every refusal is returned with its reason and counted, because a gate nobody can see is
//     indistinguishable from an extractor that found nothing — a confusion this project has already paid
//     for once.
//
// ⚠️ AND IT IS A PATTERN LIST, WHICH FAILS OPEN — this repo's most-repeated defect, so the direction of
// failure is stated rather than assumed. A MISS stores a row we would rather not have: today's status
// quo, no regression. A FALSE POSITIVE refuses one durable fact that was phrased as a memory report,
// which is recoverable the moment it is said again in ordinary words. ⇒ mild in both directions, unlike
// a filter that could delete something. ⛔ It is deliberately anchored on a FIRST-PERSON subject plus a
// MEMORY noun, so *"Ote has no record of the invoice"* and *"the server keeps no logs"* are untouched.

/**
 * ⭐ Each pattern says WHY it exists, so nobody has to guess later whether it is safe to delete.
 * ⓘ English only, and that is a known gap rather than an oversight — the same one §3B records. A Thai
 * self-state claim is a MISS, which is the mild direction.
 */
export const SELF_STATE_PATTERNS = Object.freeze([
  {
    re: /\b(?:not|never)\s+(?:been\s+)?(?:preserved|stored|retained|recorded|saved|kept)\s+(?:in|to|as)\s+(?:\w+\s+){0,2}?(?:durable\s+)?memor(?:y|ies)\b/i,
    why: 'THE MEASURED ROW: "their specific content was not preserved in durable memory"',
  },
  {
    re: /\b(?:my|her)\s+(?:own\s+)?(?:durable\s+|semantic\s+|episodic\s+|stored\s+)?memor(?:y|ies)\s+(?:do(?:es)?\s+not|don'?t|doesn'?t|never)\s+(?:have|contain|include|hold|show)\b/i,
    why: 'the same claim in the first person: "my memory does not have anything about Hermes"',
  },
  {
    re: /\bI\s+(?:have|had)\s+no\s+(?:\w+\s+){0,3}?(?:memor(?:y|ies)|records?|recollection|traces?|notes?)\s+(?:of|about|for|on)\b/i,
    why: 'measured five times in her own answers: "I have no records of someone named Hermes"',
  },
  {
    re: /\b(?:nothing|none)\s+(?:\w+\s+){0,2}?(?:is\s+)?(?:stored|recorded|saved|kept|on\s+file)\s+(?:about|for|on|regarding)\b/i,
    why: 'the absence report as a noun phrase: "nothing stored about Hermes"',
  },
  {
    re: /\bno\s+(?:durable\s+|stored\s+|semantic\s+|episodic\s+)?(?:memor(?:y|ies)|records?|entries|rows?)\s+(?:exist|were\s+found|was\s+found|remain)\b/i,
    why: 'the passive form a distiller produces from a search narration',
  },
  {
    re: /\bgap\s+between\s+(?:\w+\s+){0,3}?(?:historical\s+evidence|history)\s+and\s+(?:\w+\s+){0,3}?(?:current\s+)?knowledge\b/i,
    why: 'THE MEASURED ROW again, in its abstracted half — the sentence a summariser writes about a failed lookup',
  },
  {
    re: /\b(?:searches?|lookups?|queries)\s+(?:came\s+back|returned|turned\s+up)\s+(?:empty|nothing|no\s+results?)\b/i,
    why: 'measured verbatim: "Two searches (recall and full list) came back empty"',
  },
])

/**
 * ⭐⭐ IS THIS CONTENT A CLAIM ABOUT THE STATE OF HER OWN MEMORY?
 *
 * ⛔ PURE. Takes text, returns `{ claim: boolean, why: string|null }` — never mutates, never logs, never
 * decides what to do about it. The caller owns the consequence, which is what keeps this testable and
 * keeps the store from acquiring a policy.
 *
 * @param {string} text
 * @returns {{ claim: boolean, why: string|null }}
 */
export function isSelfStateClaim(text) {
  const s = String(text ?? '')
  if (!s.trim()) return { claim: false, why: null }
  for (const p of SELF_STATE_PATTERNS) if (p.re.test(s)) return { claim: true, why: p.why }
  return { claim: false, why: null }
}

/**
 * ⭐⭐⭐ MAY THIS ROW BE WRITTEN? The one question the write lane asks.
 *
 * ⚠️⚠️ SCOPED TO `kind: 'semantic'` AND ITS RELATIVES, AND THE EXCLUSIONS ARE THE DESIGN:
 *   · `identity` — never text of this shape, and refusing one would be a much worse failure;
 *   · `episodic` — ⭐ AN EPISODE IS A RECORD OF SOMETHING THAT HAPPENED. *"I looked and found nothing"*
 *     genuinely happened, and an episode is dated by construction, so it cannot become a timeless fact.
 *     ⛔ Refusing it would be sanitising her history, which is exactly what Ote ruled out.
 *   · a `lesson` / `practice` — *"treat a probabilistic guess about memory state as retrieved, not
 *     verified"* is a lesson ABOUT the failure, and it is one of the most valuable rows in the store.
 * ⇒ what is refused is precisely the shape that becomes **a standing fact about a person or a topic**.
 *
 * @param {{kind?: string, attribute?: string, content?: string}} row
 * @returns {{ ok: boolean, reason: string|null, why: string|null }}
 */
export function admissible(row = {}) {
  const kind = String(row?.kind ?? '')
  const attribute = String(row?.attribute ?? '')
  if (kind && kind !== 'semantic' && kind !== 'fact') return { ok: true, reason: null, why: null }
  if (attribute === 'lesson' || attribute === 'practice' || attribute === 'declined') {
    return { ok: true, reason: null, why: null }
  }
  const hit = isSelfStateClaim(row?.content)
  return hit.claim
    ? { ok: false, reason: 'self-state-claim', why: hit.why }
    : { ok: true, reason: null, why: null }
}
