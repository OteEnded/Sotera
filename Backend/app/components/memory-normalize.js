// Persona Memory V3 — the NORMALIZATION stage (RFC_MEMORY_SLOT_RESOLVER §5). Phase 2.
//
// The boundary that DEFINES this stage (Ote, binding):
//
//     Normalization may CANONICALIZE observations, but it must never CLASSIFY them.
//
// It makes an observation structurally consistent and offers a canonical CANDIDATE for the attribute —
// it does NOT decide which slot the observation belongs to. Concretely:
//
//   "I'm mainly coding in Rust these days."
//     INTERPRETATION → { type: preference, intent: assert }          ← understands language
//     NORMALIZATION  → { attributeCandidate: 'programming_language',  ← says WHAT, in canonical language
//                        value: 'Rust' }
//     RESOLUTION     → slot: preferred_programming_language           ← ontology call: the RESOLVER's job
//
// So Normalization says "this observation appears to concern programming language". Choosing between
// preferred_ / current_ / favorite_ is an ONTOLOGY decision it must not know. Responsibilities:
//   • Normalization produces canonical CANDIDATES  (non-binding)
//   • Resolver owns canonical IDENTITY             (sole classifier)
// `attributeCandidate` is therefore advisory: a resolver MAY use it as a hint and MAY override it.
//
// SIZING (v1, deliberate): thin. Whitespace hygiene + a candidate attribute + basic value tidying. It
// must not change what today's reconcile matches on, so it stays behaviour-neutral until a resolver
// actually consumes the candidate. Its other real job — value normalization (dates→ISO, units, casing)
// — has had no home until now; it grows HERE rather than leaking into extractors or persistence.
// PURE, never throws.

const collapse = (s) => String(s).replace(/\s+/g, ' ').trim()

/**
 * canonicalAttribute — the NON-BINDING canonical candidate for an attribute phrase. Lowercased,
 * punctuation dropped, spaces → underscores ("Favorite Programming Language!" → favorite_programming_language).
 * Deliberately NOT a slot id and NOT authoritative: it is a hint for the Resolver, nothing more.
 */
export function canonicalAttribute(attribute) {
  return collapse(String(attribute ?? '').toLowerCase())
    .replace(/[^\p{L}\p{N}\s_-]+/gu, '')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * normalizeValue — structural tidying of a claim's value. v1 is intentionally conservative: collapse
 * whitespace and strip wrapping quotes. (Dates→ISO, units, and number canonicalization land here when
 * they earn it — this is the seam, not the finished job.) Non-strings pass through untouched.
 */
export function normalizeValue(value) {
  if (typeof value !== 'string') return value
  const s = collapse(value)
  // strip a single pair of wrapping quotes the extractor sometimes leaves ("Rust" → Rust)
  const unquoted = s.replace(/^["'“”‘’](.*)["'“”‘’]$/u, '$1').trim()
  return unquoted || s
}

/**
 * normalizeObservation — the stage. Returns a NEW observation with structural hygiene applied plus
 * `attributeCandidate` (advisory). Does not classify, does not touch `type`/`intent`/`owner` semantics
 * (owner canonicalization is Owner Resolution's job — a different field, a different stage).
 * @param {object} obs a constructed observation (see memory-observation.js)
 */
export function normalizeObservation(obs) {
  if (!obs || typeof obs !== 'object') return obs
  // POLYMORPHIC (§14.1): an EPISODIC observation is prose — there is no attribute to canonicalize, so the
  // stage only tidies the content. Offering an attributeCandidate here would be inventing a slot, which is
  // both classification AND fabrication.
  if (obs.type === 'episodic' || obs.type === 'card') {
    return { ...obs, content: typeof obs.content === 'string' ? collapse(obs.content) : obs.content, ...(obs.topic ? { topic: collapse(obs.topic) } : {}) }
  }
  const attribute = collapse(obs.attribute ?? '')
  return {
    ...obs,
    attribute, // AS STATED, tidied — still the phrase the observer used
    value: normalizeValue(obs.value),
    attributeCandidate: canonicalAttribute(attribute), // advisory hint for the Resolver (never binding)
  }
}
