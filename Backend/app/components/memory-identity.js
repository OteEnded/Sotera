// Persona Memory V3 — IDENTITY INTERPRETATION (RFC_MEMORY_SLOT_RESOLVER §4/§5/§7). Phase 1.
//
// The deepest gap the soak found: "I'm Claude" never became structured knowledge, so the persona kept
// addressing the user by their username. Every stage "behaved correctly" and the system still failed —
// an identity-pipeline gap, not a memory bug. This module is the first stage of the fix: turn a raw
// user turn into a TYPED identity Observation (or null). Pure + deterministic + unit-testable.
//
// Why deterministic patterns (not the generic LLM extractor): the generic extractor is probabilistic
// and de-prioritises identity — it is exactly what drops "I'm Claude". A focused, high-PRECISION
// detector GUARANTEES capture of clear self-naming, and moves this deterministic truth into a service
// (the governing principle). An LLM-assisted interpreter is a natural v2 (the gray-zone evolution).
//
// This module intentionally folds three RFC stages that are trivial while identity is a single fixed
// slot: INTERPRETATION (is this identity? what intent?), NORMALIZATION (extract + proper-case the
// value — canonicalize, never classify), and a trivial RESOLUTION (→ the reserved `preferred_name`
// slot). When those stages become first-class (Phase 2/3) this logic migrates outward unchanged.

// Reserved identity namespace + canonical attributes (distinct from the persona-global `kind:'identity'`,
// which is a DIFFERENT axis — facts about the persona shared across users). User identity lives as
// per-user semantic rows in this namespace so the Profile can project it. Phase 1 uses preferred_name.
export const IDENTITY_NAMESPACE = 'identity'
export const IDENTITY_ATTR = { preferredName: 'preferred_name', pronouns: 'pronouns', title: 'title' }

// ── Identity is routed by SEMANTICS, not by ORIGIN (Ote 2026-07-30, Phase 5.5) ───────────────────
// An identity claim is an identity claim no matter who perceived it — chat extraction, the model's
// remember_fact tool, Reflection, an import, a migration, a future API. Before Phase 5.5 the tool's
// "preferred_name" landed as a GENERIC slot (default namespace) while conversational "I'm Ripley" landed
// in the identity namespace: two live rows for one concept, purely because of who observed it. That
// violated our own rule. This vocabulary is what lets Interpretation type ANY producer's claim, so every
// writer converges on the IdentityResolver — removing that whole class of bug permanently.
const normAttr = (v) => (v == null ? '' : String(v)).trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ')

// alias phrase → canonical identity attribute. Deliberately TIGHT: only the address-name family, so a
// third party's "name" (a pet, a project) is never mistaken for the account holder's identity, and
// surname/legal-name style attributes stay ordinary facts until they earn their own identity slot.
const IDENTITY_ATTRIBUTE_ALIASES = new Map([
  ...['name', 'my name', 'preferred name', 'nickname', 'nick name', 'display name', 'what to call me',
    'what i go by', 'goes by', 'go by', 'called', 'first name', 'given name', 'preferred name to use',
  ].map((a) => [a, IDENTITY_ATTR.preferredName]),
  ...['pronouns', 'preferred pronouns', 'my pronouns'].map((a) => [a, IDENTITY_ATTR.pronouns]),
  ...['title', 'honorific'].map((a) => [a, IDENTITY_ATTR.title]),
])

/**
 * identityAttributeOf — is this attribute phrase semantically an IDENTITY attribute? Returns the
 * canonical identity attribute (preferred_name | pronouns | title) or null. PURE.
 * Canonicalizing here is what collapses "name"/"nickname"/"what to call me" onto ONE identity slot.
 */
export function identityAttributeOf(attribute) {
  const n = normAttr(attribute)
  if (!n) return null
  return IDENTITY_ATTRIBUTE_ALIASES.get(n) ?? null
}

// INTENT (RFC §7 adoption policy):
//   'assert'        = Identity DISCOVERY  — "I'm Claude" / "my name is John". The system LEARNED who
//                     they are. Adopt into an EMPTY slot silently.
//   'prefer-address'= Identity PREFERENCE — "call me Claude" / "use X from now on". Changes HOW we
//                     address them. A CHANGE to an occupied slot is the ASK_CONFIRM case (later phase).
// Phase 1 stores into an empty slot for both; a change to an occupied slot is DEFERRED (never silently
// overwritten) until the ConflictResolver's ASK is wired.

// Values that "I'm X" / "this is X" commonly capture but are NOT names — reject to keep precision high.
// (The explicit forms — "my name is", "call me", "go by", "address me as" — relax this, intent is clear.)
const NON_NAME = new Set([
  'a', 'an', 'the', 'not', 'just', 'so', 'still', 'also', 'here', 'back', 'out', 'up', 'down', 'home', 'in',
  'on', 'at', 'good', 'fine', 'great', 'well', 'ok', 'okay', 'alright', 'sure', 'sorry', 'afraid', 'glad',
  'happy', 'sad', 'tired', 'busy', 'hungry', 'ready', 'done', 'lost', 'stuck', 'confused', 'curious', 'new',
  'going', 'gonna', 'trying', 'thinking', 'wondering', 'looking', 'feeling', 'doing', 'working', 'kidding',
  'joking', 'serious', 'about', 'actually', 'really', 'kinda', 'sort', 'gonna', 'from', 'with', 'right',
  'wrong', 'yeah', 'yes', 'no', 'hi', 'hey', 'hello',
  'and', 'or', 'but', 'then', 'who', 'that', 'which', 'because', 'when', 'while', 'here', 'too',
  // trailing connectives/adverbs that a two-token capture would otherwise swallow. Found live: the natural
  // phrasing "I'm Wren by the way" stored the name as "Wren By".
  'by', 'though', 'anyway', 'anyways', 'again', 'now', 'today', 'tonight', 'tomorrow', 'obviously',
  'incidentally', 'apparently', 'basically', 'honestly', 'personally', 'currently', 'usually', 'always',
])

// A name token: starts with a letter, then letters/apostrophes/hyphens. (Unicode letters allowed.)
const NAME_TOKEN = "\\p{L}[\\p{L}'’.\\-]*"
// up to two tokens ("John", "John Smith") — cap at 2 to avoid swallowing a trailing clause.
const NAME_CAPTURE = `(${NAME_TOKEN}(?:\\s+${NAME_TOKEN})?)`

// Ordered so the most explicit (highest-precision, highest-confidence) patterns win first.
const PATTERNS = [
  { re: new RegExp(`\\byou can (?:just )?call me\\s+${NAME_CAPTURE}`, 'iu'), intent: 'prefer-address', confidence: 0.99, strict: false },
  { re: new RegExp(`\\b(?:please |just )?call me\\s+${NAME_CAPTURE}`, 'iu'), intent: 'prefer-address', confidence: 0.99, strict: false },
  { re: new RegExp(`\\baddress me as\\s+${NAME_CAPTURE}`, 'iu'), intent: 'prefer-address', confidence: 0.99, strict: false },
  { re: new RegExp(`\\bi (?:usually |normally |often )?go by\\s+${NAME_CAPTURE}`, 'iu'), intent: 'prefer-address', confidence: 0.95, strict: false },
  { re: new RegExp(`\\bmy name(?:'s| is)\\s+${NAME_CAPTURE}`, 'iu'), intent: 'assert', confidence: 0.99, strict: false },
  { re: new RegExp(`\\bi'?m\\s+${NAME_CAPTURE}`, 'iu'), intent: 'assert', confidence: 0.9, strict: true },
  { re: new RegExp(`\\bi am\\s+${NAME_CAPTURE}`, 'iu'), intent: 'assert', confidence: 0.9, strict: true },
  { re: new RegExp(`^(?:hi|hey|hello)[,!.\\s]+this is\\s+${NAME_CAPTURE}`, 'iu'), intent: 'assert', confidence: 0.8, strict: true },
]

// NORMALIZATION of the captured value: trim trailing junk, drop a trailing non-name token (so
// "I'm John and ..." keeps "John"), proper-case an all-lowercase token ("claude" → "Claude") while
// preserving deliberate internal caps ("McCoy"). Returns '' if nothing name-like survives.
function normalizeName(raw) {
  if (!raw) return ''
  const rawTokens = String(raw).trim().split(/\s+/)
  // STOP AT A SENTENCE BOUNDARY. "I'm Tomas. finally getting around to this" must yield "Tomas", not
  // "Tomas Finally" — a name cannot span a full stop. (Found live: exactly that sentence stored the
  // preferred name as "Tomas Finally".) The terminating token is kept, then stripped of its punctuation.
  const kept = []
  for (const t of rawTokens) {
    kept.push(t)
    if (/[.!?,;:—–]$/u.test(t)) break
  }
  // strip leading/trailing non-letters from each token ("Claude." → "Claude", "John," → "John") while
  // preserving INTERNAL apostrophes/hyphens ("O'Brien", "Anne-Marie").
  let tokens = kept
    .map((t) => t.replace(/^[^\p{L}]+/u, '').replace(/[^\p{L}]+$/u, ''))
    .filter(Boolean)
  // drop trailing connective / non-name tokens ("John and" → "John")
  while (tokens.length && NON_NAME.has(tokens[tokens.length - 1].toLowerCase())) tokens.pop()
  tokens = tokens.slice(0, 2) // at most two name tokens
  const properCase = (t) => (t === t.toLowerCase() ? t.charAt(0).toUpperCase() + t.slice(1) : t)
  return tokens.map(properCase).join(' ').trim()
}

// A captured value is a plausible name? length + non-name guard. The NON_NAME first-token check is
// ALWAYS applied (not just for the fuzzy "I'm X" family) so even explicit forms reject "call me back
// later" → "back". Precision over recall: better to miss a name than to store a non-name.
function isPlausibleName(value) {
  if (!value) return false
  if (value.length < 2 || value.length > 40) return false
  if (/\d/.test(value)) return false // names in these patterns don't contain digits
  const first = value.split(/\s+/)[0].toLowerCase()
  if (NON_NAME.has(first)) return false
  return true
}

// Normalize an identity VALUE for equality comparison (case/spacing-insensitive).
const normVal = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * identityPlan — the Identity Resolver's adoption DECISION (RFC §7), separated from persistence so it
 * is pure + unit-testable. Given the current slot value (or null) and a new identity observation:
 *   no current value        → 'adopt'  (DISCOVERY / empty slot → store silently)
 *   same value (normalized) → 'noop'   (already known — reinforce)
 *   different value         → 'defer'  (a CHANGE to how we address the user → the ASK_CONFIRM case;
 *                                       never silently overwritten. ASK lands in a later phase.)
 * @param {string|null} currentValue
 * @param {{value:string}} obs
 * @returns {{action:'adopt'|'noop'|'defer', value:string|null, from?:string}}
 */
export function identityPlan(currentValue, obs) {
  const value = obs?.value ?? null
  if (!currentValue) return { action: 'adopt', value }
  if (normVal(currentValue) === normVal(value)) return { action: 'noop', value }
  return { action: 'defer', value, from: currentValue }
}

/**
 * interpretIdentity — the identity INTERPRETATION stage. Given one raw user turn, return a typed
 * identity Observation or null. PURE, deterministic, never throws.
 *
 * @param {string} text  the user's message
 * @returns {{ type:'identity', attribute:string, value:string, intent:'assert'|'prefer-address',
 *             confidence:number, matched:string } | null}
 */
export function interpretIdentity(text) {
  if (!text || typeof text !== 'string') return null
  const s = text.trim()
  if (!s || s.length > 2000) return null // very long turns are unlikely to be a clean self-intro
  for (const p of PATTERNS) {
    const m = p.re.exec(s)
    if (!m) continue
    const value = normalizeName(m[1])
    if (!isPlausibleName(value)) continue
    return {
      type: 'identity',
      attribute: IDENTITY_ATTR.preferredName,
      value,
      intent: p.intent,
      confidence: p.confidence,
      matched: m[0].trim(),
    }
  }
  return null
}
