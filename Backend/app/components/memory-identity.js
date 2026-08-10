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

// ── LIVE FAILURE, 2026-08-10: FOUR invented names in one night of ordinary use ───────────────────
// Ote opened his first conversations with Sotera and this module filed three different fragments of
// his own prose as his name — at rising confidence, into the highest-importance slot there is:
//
//   "hi, this is your starting point of being something"  -> "Your Starting"  0.8   (twice)
//   "im i phasing it right?"                              -> "I Phasing"      0.9
//   ""But if I'm being your daughter…" no need to "if""    -> "Being Your"     0.9
//
// ⚠️ THE DIAGNOSIS WE WROTE FIRST WAS WRONG, and the way it was wrong is the lesson. It was blamed on
// the LLM extractor "treating preferred_name as a slot that must be filled", on the evidence that two
// very different models (gemma4:e4b, qwen3.5:9b) produced BYTE-IDENTICAL output. Two models agreeing to
// the byte does not mean the prompt decided it — it means NO MODEL WAS INVOLVED. It was this file: pure,
// deterministic regex. The strongest-looking evidence pointed at the answer and was read backwards.
//
// Three independent holes let it through, and each is closed below:
//   1. NON_NAME enumerated ~90 non-names and contained NOT ONE PRONOUN — no i/my/your/you/we/being. A
//      deny-list fails OPEN: everything nobody thought of is a name. Now every token is checked, not
//      just the first, and the pronoun/determiner family is closed as its own set.
//   2. Every pattern carried `strict: true|false`, thoughtfully set — and `interpretIdentity` READ IT
//      NOWHERE. A dead flag that reads as a guard is worse than no flag: it makes the fuzzy "I'm X"
//      family LOOK constrained. Now strict means something (see needsCapitalEvidence).
//   3. "Being Your" came out of Ote QUOTING HER OWN SENTENCE BACK AT HER, inside quote marks. Quoting is
//      not asserting — the memory assertion gate exists for exactly this and never runs on this path,
//      because identity capture is a separate entry point. Now the span check lives here too.
//
// The tell that all three were the same failure: he never stated a name in ANY of those conversations.
// There was no true value to find. And his profile already carried "Ote", which is what she calls him —
// so a regex on a typo was overwriting known-good identity with nothing.

// Pronouns, possessives and determiners. NEVER a self-name in these patterns — "I'm <pronoun> …" is
// always a sentence continuing, never an introduction. Checked on EVERY token of a capture, so a
// two-token grab cannot smuggle one in beside a plausible word ("Being Your", "Your Starting").
const PRONOUN_OR_DETERMINER = new Set([
  'i', 'me', 'my', 'mine', 'myself', 'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself',
  'we', 'us', 'our', 'ours', 'ourselves', 'they', 'them', 'their', 'theirs', 'themselves',
  'this', 'that', 'these', 'those', 'there', 'here',
  'what', 'when', 'where', 'why', 'how', 'whose', 'whom',
  'a', 'an', 'the', 'some', 'any', 'every', 'each', 'both', 'either', 'neither',
  // copulas/auxiliaries a two-token capture can swallow ("I'm being your…", "I'm gonna be X")
  'be', 'being', 'been', 'am', 'is', 'are', 'was', 'were', 'do', 'does', 'did',
  'have', 'has', 'had', 'will', 'would', 'can', 'could', 'should', 'must', 'may', 'might',
])

// Quoted spans in a turn. QUOTING IS NOT ASSERTING: text a person reads back — hers, a document's,
// someone else's — is not a claim about themselves. Single quotes are deliberately NOT paired here;
// apostrophes ("I'm", "it's", "O'Brien") make them unusable as delimiters.
function quotedSpans(s) {
  const spans = []
  let open = -1
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    // a straight " is both opener and closer, so test the open state first
    if (open === -1) { if (c === '"' || c === '“' || c === '«') open = i }
    else if (c === '"' || c === '”' || c === '»') { spans.push([open, i]); open = -1 }
  }
  return spans // an unterminated opener is ignored — half a quote is not evidence
}

// STRICT patterns need CAPITAL EVIDENCE. The explicit forms ("call me X", "my name is X") state intent
// outright, so "call me ote" is honoured exactly as typed. The fuzzy family ("I'm X", "hi, this is X")
// carries no intent of its own — it needs the writer to have marked the word as a name. Every positive
// case in the existing unit suite already reads this way ("I'm Claude", "I'm Wren", "hi this is Ote"),
// which is what makes this the right cut rather than a new rule bolted on.
//
// ⚠️ CASELESS SCRIPTS MUST NOT BE PENALISED. Thai, Chinese, Japanese, Arabic have no capitals, and Ote
// writes Thai. The test is "the first character is not a LOWERCASE form", which is vacuously true where
// case does not exist — so a Thai name passes and only a lowercase Latin word is rejected.
function hasCapitalEvidence(rawValue) {
  const first = String(rawValue).trim().replace(/^[^\p{L}]+/u, '').split(/\s+/)[0] || ''
  if (!first) return false
  return first[0] === first[0].toUpperCase()
}

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

// A captured value is a plausible name? length + non-name guard, applied to EVERY form including the
// explicit ones, so "call me back later" → "back" is rejected too. Precision over recall: better to miss
// a name than to store a non-name — a missed name costs one turn ("call me X" always works), a stored
// non-name is injected into every future turn and shown to the user as a fact about themselves.
function isPlausibleName(value) {
  if (!value) return false
  if (value.length < 2 || value.length > 40) return false
  if (/\d/.test(value)) return false // names in these patterns don't contain digits
  const tokens = value.split(/\s+/).map((t) => t.toLowerCase())
  // NON_NAME on the FIRST token only: it lists words that cannot OPEN a name but can legitimately sit
  // inside one. PRONOUN_OR_DETERMINER on EVERY token: a pronoun anywhere means we grabbed a sentence.
  if (NON_NAME.has(tokens[0])) return false
  if (tokens.some((t) => PRONOUN_OR_DETERMINER.has(t))) return false
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
  const quoted = quotedSpans(s)
  for (const p of PATTERNS) {
    const m = p.re.exec(s)
    if (!m) continue
    // QUOTED ≠ ASSERTED. Ote reading her own line back — «"But if I'm being your daughter…"» — became
    // his name one second later. A match inside quote marks is somebody else's sentence.
    if (quoted.some(([a, b]) => m.index > a && m.index < b)) continue
    // STRICT: the fuzzy "I'm X" / "this is X" family states no naming intent, so the writer must have
    // marked the word as a name. Without this, "im building rome" stores "Building Rome" at 0.9.
    if (p.strict && !hasCapitalEvidence(m[1])) continue
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
