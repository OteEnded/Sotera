// Persona Memory v2 — fact extraction + reconcile logic (RFC_PERSONA_MEMORY §3 Mem0; the
// "update-not-append / reflection" idea from RESEARCH_CHATGPT_MEMORY). Turns a raw conversation
// turn into durable ATOMIC FACTS {entity, attribute, value, importance} and decides ADD/UPDATE/NOOP
// against what's already known. The LLM call is INJECTED (`llm`) so parsing + reconcile are pure
// and unit-testable, and so the host controls which model/how it's metered. Off the hot path.

export const norm = (v) => (v == null ? '' : String(v)).trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ')

// Attribute-phrase matching (Phase 2c fuzzy reconcile). The extraction LLM phrases the same slot
// many ways turn-to-turn ("favorite language" / "favorite programming language" / "fav. coding
// language"); exact-key reconcile piled those up as duplicate facts. These pure helpers collapse
// phrasing variants to ONE slot lexically (no embeddings, off the hot path anyway).
const ATTR_STOP = new Set(['the', 'a', 'an', 'of', 'my', 'your', 'their', 'his', 'her', 'its', 'user', 'users', 's', 'is', 'are'])
const stem = (t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t) // crude singularize (projects→project)
const attrTokens = (s) => norm(s).split(' ').map(stem).filter((t) => t && !ATTR_STOP.has(t))

/**
 * Lexical similarity of two attribute phrases in [0,1]. MAX of token-set containment (a short
 * phrase fully inside a longer one — "favorite language" ⊂ "favorite programming language" → 1)
 * and Jaccard overlap (the general case). Exact normalized equality → 1. Stopwords/plurals folded.
 */
export function attributeSimilarity(a, b) {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ta = new Set(attrTokens(a))
  const tb = new Set(attrTokens(b))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  if (inter === 0) return 0
  const jaccard = inter / (ta.size + tb.size - inter)
  const containment = inter / Math.min(ta.size, tb.size)
  return Math.max(jaccard, containment)
}

/**
 * Find the existing fact row that occupies the SAME slot as an incoming {entity, attribute}.
 * Entity must match exactly (normalized) — "user"/"User" collapse, but "Sotera" stays distinct;
 * attribute is fuzzy (attributeSimilarity ≥ threshold). `existing` should be pre-sorted newest-first
 * so ties resolve to the most recent. PURE. → {match: row|null, similarity}.
 */
export function bestSlotMatch(existing, { entity, attribute, threshold = 0.7 } = {}) {
  const ne = norm(entity)
  let best = null
  let bestSim = 0
  for (const r of existing || []) {
    if (!r || norm(r.entity) !== ne) continue
    const sim = attributeSimilarity(r.attribute, attribute)
    if (sim > bestSim) { bestSim = sim; best = r }
  }
  return { match: bestSim >= threshold ? best : null, similarity: bestSim }
}

/**
 * ALL existing rows occupying the same slot as {entity, attribute} (entity exact-normalized,
 * attribute fuzzy ≥ threshold). Input order is preserved, so pass newest-first and rows[0] is the
 * most recent. PURE. Used by reconcile to CONVERGE a slot to a single live row — collapsing any
 * duplicates that slipped in (e.g. from an earlier double-writer) on the next write.
 */
export function slotMatches(existing, { entity, attribute, threshold = 0.7 } = {}) {
  const ne = norm(entity)
  return (existing || []).filter((r) => r && norm(r.entity) === ne && attributeSimilarity(r.attribute, attribute) >= threshold)
}

/** True if two entity names are the same slot subject (normalized). Exported so the service's
 *  SEMANTIC slot match can gate by entity exactly like the lexical slotMatches does. */
export function sameEntity(a, b) {
  return norm(a) === norm(b)
}

// ── ASSERTION GATE (2026-08-03) ───────────────────────────────────────────────────────────────────
//
// QUOTING IS NOT ASSERTING. The extractor's prompt asks for "facts about the USER", and the model
// obliged from text the user had merely PASTED. On 2026-08-01 Ote pasted a `get_service_overview` JSON
// dump asking for help formatting it, and four platform fields became biography:
//     provider.currentModel        → "user's preferred model provider"
//     provider.defaultModel        → "user's default model provider"
//     provider.configuredProviders → "user's configured providers"
//     limits.maxToolCalls          → "user's max tool calls limit"
// A PR approval payload in the same conversation contributed "user's email: kanokporn@…", which was
// someone else's address entirely. One of these then displaced a true belief through slot reconcile.
//
// TWO LAYERS, because a prompt alone will not hold. This is the deterministic one: it decides what text
// the extractor is even SHOWN, which is not model steering — the soft hint in the prompt is. A pasted
// document cannot become a self-fact if the extractor never sees it.
//
// Deliberately conservative: it removes clearly-quoted REGIONS (fences, blockquotes, structured blobs)
// and keeps everything else. The user's own sentences around a paste survive, so "here's my config,
// remember that my endpoint is X" still captures X from the prose.

const FENCE = /```[\s\S]*?(?:```|$)/g          // fenced code/data, including an unterminated trailing fence
const INLINE_CODE = /`[^`\n]+`/g
const BLOCKQUOTE = /^[ \t]*>.*$/gm
// A structured-data blob: a {...} or [...] region at least ~60 chars long that is dense in the
// punctuation of serialized data. Length + density together, because a short "{a:1}" in a sentence is
// speech about data, while a 900-char brace soup is a document.
const BLOB = /[{[][\s\S]{60,}[}\]]/g
const STRUCTURED_DENSITY = 0.06 // share of chars that are {}[]":, — measured JSON sits far above this

const isStructured = (s) => {
  if (!s) return false
  const marks = (s.match(/[{}[\]":,]/g) || []).length
  return marks / s.length >= STRUCTURED_DENSITY
}

// ── TRANSCRIBED LINES ──────────────────────────────────────────────────────────────────────────────
// Fences and JSON blobs were not enough, and Cogito named the gap precisely (2026-08-03): a pasted
// nginx config, a resume as `Age: 42` lines, a log excerpt, a forwarded email header block. None carry a
// fence, and only one has braces — the first implementation stripped ZERO regions from all four, tested.
//
// What they share is not a format, it is a POSTURE: the lines were transcribed from somewhere, not
// composed in the message. Prose has sentences; transcribed material has records. So the test is per
// LINE, and a region counts only as a RUN — because one colon in a sentence is punctuation, while four
// consecutive `key: value` lines is a document someone pasted.
const NON_PROSE_LINE = [
  /^\s*[\w.\-/[\]]{1,48}\s*[:=]\s*\S/,        // Age: 42 · From: a@b.com · defaultModel=gemma
  /^\s*[\w.\-/]+\s+[^\s].*;\s*$/,             // config directive: `listen 80;` · `proxy_pass http://…;`
  /^\s*[\w.\-/ ]{1,48}\{\s*$/,                // block opener: `server {` · `location / {`
  /^\s*[{}[\]()]+[;,]?\s*$/,                  // a lone brace/bracket on its own line
  /^\s*\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/,     // log timestamp
  /^\s*(?:[A-Z_]{3,}|\d{3})\s+\S/,            // ERROR … / WARN … / 404 …
]

const isNonProse = (line) => {
  const t = line.trim()
  if (!t) return null // blank: neither — it separates blocks rather than joining them
  // A line that reads as a whole sentence is prose even when it contains a colon — "I told him: I use
  // Rust". Word count is the cheapest separator that holds up across the phrasings we actually see.
  if (/^[A-Z]?[^:=]{0,80}[.!?]\s*$/.test(t) && t.split(/\s+/).length >= 6) return false
  return NON_PROSE_LINE.some((re) => re.test(t))
}

// A pasted block is judged as a BLOCK, not as a run of consecutive lines. Strict runs were the first
// attempt and they broke on one interleaved line: "Lives in Canada" between `Age: 42` and
// `Skills: …` split a resume into two 2-line runs, and `location / {` split an nginx config the same
// way — both fell under the threshold and survived intact. Density over a block is robust to that,
// because the odd prose-shaped line inside a paste no longer rescues the whole paste.
const MIN_BLOCK_LINES = 3      // two records is a coincidence; three is a document
const BLOCK_NON_PROSE_RATIO = 0.6

/**
 * Blank whole blocks (blank-line-separated) that are mostly records rather than sentences.
 * Returns [text, blocksRemoved].
 *
 * The WHOLE block goes, including any prose lines inside it: a sentence sitting among pasted records is
 * almost always part of the paste ("Subject: Q3 planning" beside "I'm based in Berlin" — that Berlin
 * line is the sender speaking, not the user). Keeping such lines is the leak this is meant to stop.
 */
function stripTranscribedBlocks(src) {
  const lines = src.split('\n')
  const out = [...lines]
  let removed = 0
  let i = 0
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue }
    let j = i
    while (j < lines.length && lines[j].trim()) j++ // [i, j) is one blank-line-delimited block
    const block = lines.slice(i, j)
    const nonProse = block.filter((l) => isNonProse(l) === true).length
    if (block.length >= MIN_BLOCK_LINES && nonProse / block.length >= BLOCK_NON_PROSE_RATIO) {
      for (let k = i; k < j; k++) out[k] = ''
      removed++
    }
    i = j
  }
  return [out.join('\n'), removed]
}

/**
 * Split a turn into what the user ASSERTED and what they merely QUOTED. PURE.
 *
 * @returns {{asserted:string, quotedChars:number, quotedRatio:number, strippedRegions:number}}
 *   `asserted` is the prose with quoted regions removed; the ratios let a caller decide that a message
 *   is SO dominated by pasted material that even its prose is probably about the document, not the self.
 */
export function splitAssertedFromQuoted(text) {
  const src = String(text ?? '')
  if (!src) return { asserted: '', quotedChars: 0, quotedRatio: 0, strippedRegions: 0 }
  let regions = 0
  const cut = (s, re, guard = null) => s.replace(re, (m) => {
    if (guard && !guard(m)) return m
    regions++
    return ' '
  })
  let out = src
  out = cut(out, FENCE)
  out = cut(out, BLOCKQUOTE)
  out = cut(out, BLOB, isStructured)
  // Block detection AFTER the region strippers, so it only judges what they left behind.
  const [stripped, blocks] = stripTranscribedBlocks(out)
  out = stripped
  regions += blocks
  out = cut(out, INLINE_CODE)
  const asserted = out.replace(/\s+/g, ' ').trim()
  const quotedChars = Math.max(0, src.replace(/\s+/g, ' ').trim().length - asserted.length)
  return {
    asserted,
    quotedChars,
    quotedRatio: src.length ? quotedChars / src.replace(/\s+/g, ' ').trim().length : 0,
    strippedRegions: regions,
  }
}

/** Minimum surviving prose before extraction is worth running — mirrors the route's own >= 12 char
 *  capture gate, so "a paste with a one-word request attached" is treated like any other thin turn. */
export const MIN_ASSERTED_CHARS = 12

/**
 * Should this turn be extracted from at all, and if so from what text? PURE.
 * Returns `{ extract: false, reason }` for a turn that is essentially a document.
 */
export function assertionGate(text) {
  const split = splitAssertedFromQuoted(text)
  if (split.strippedRegions === 0) return { extract: true, text: String(text ?? ''), ...split }
  if (split.asserted.length < MIN_ASSERTED_CHARS) {
    return { extract: false, reason: 'the turn is a pasted document with no substantive prose of its own', ...split }
  }
  return { extract: true, text: split.asserted, ...split }
}

const EXTRACT_PROMPT = (text) =>
  `Extract DURABLE facts about the USER from the message below — stable preferences, identity, ` +
  `projects, relationships, goals, environment. NOT questions, chit-chat, transient state, or things ` +
  `about anyone but the user.\n\n` +
  // The soft half of the assertion gate. The deterministic half already removed obvious pasted regions;
  // this covers what survives — a quoted line, a described config, a third party's details in prose.
  // Phrased as a distinction to apply rather than a prohibition to obey, per Ote's steering rule.
  `SAY IT ONLY IF THEY SAID IT ABOUT THEMSELVES. Text a person pastes, quotes, or asks you to process ` +
  `is material they are HANDLING, not a claim about who they are — a config dump, a log, an email, ` +
  `sample data, someone else's record. Values inside such material describe the SYSTEM or PERSON it ` +
  `came from, so they are almost never facts about the user, however personal the field name looks.\n` +
  `  "my timezone is Bangkok"                       → user's timezone: Bangkok\n` +
  `  "format this: {\\"defaultModel\\":\\"gemma\\"}"        → [] (a value in their data, not their preference)\n` +
  `  "what does CreatorEmail: a@b.com mean here?"   → [] (an address in a record they are reading)\n` +
  `  "here's my config — I always run on port 8201" → user's port: 8201 (asserted in their own words)\n` +
  // REPORTED SPEECH — added 2026-08-03 after the extraction suite caught gemma4:e4b writing
  // "user's preferred theme: dark mode" from "Sarah told me she prefers dark mode". Same error class
  // that destroyed the `role` fact: another person's data recorded as biography. The assertion gate
  // cannot reach this one — there is no block, no fence, no punctuation tell, only grammar — so the
  // prompt is the only layer that can. ⚠️ The example below is DELIBERATELY NOT the corpus sentence:
  // teaching the model the exact held-out case would convert the test from generalisation to recall.
  `  "Marco said he runs everything on Arch"        → [] about the user (it is Marco's, not theirs)\n` +
  `  "she/he/they + a preference"                   → someone ELSE is the subject — never attribute it to the user\n\n` +
  `Return ONLY a JSON array (no prose) of objects: {"entity","attribute","value","importance"}.\n` +
  `- entity: usually "user" (or a named person/project the fact is about)\n` +
  `- attribute: the property, short (e.g. "favorite programming language", "timezone", "current project")\n` +
  `- value: the fact, concise\n` +
  `- importance: 1 (mundane) to 10 (defining)\n` +
  `Return [] if there is no durable fact — [] is the right answer far more often than not. Extract at most 5.\n\nMessage:\n${text}`

/** Pure: pull the first JSON array out of an LLM reply and normalize to validated fact objects. */
export function parseFacts(raw) {
  try {
    const m = String(raw ?? '').match(/\[[\s\S]*\]/)
    if (!m) return []
    const arr = JSON.parse(m[0])
    if (!Array.isArray(arr)) return []
    return arr
      .filter((f) => f && f.entity && f.attribute && f.value != null && String(f.value).trim())
      .map((f) => ({
        entity: String(f.entity).trim().slice(0, 80),
        attribute: String(f.attribute).trim().slice(0, 80),
        value: String(f.value).trim().slice(0, 400),
        importance: Number.isFinite(f.importance) ? Math.max(1, Math.min(10, Math.round(f.importance))) : null,
      }))
      .slice(0, 5)
  } catch {
    return []
  }
}

/**
 * Extract durable facts from one turn. `llm(prompt) → text` is injected. Never throws → [].
 *
 * The ASSERTION GATE runs first and can skip the LLM call entirely for a turn that is just a pasted
 * document — which is both the correctness fix and, incidentally, free: no aux inference on a paste.
 * `onSkip` lets the host record that a turn was gated rather than merely uninteresting, so "extraction
 * found nothing" and "extraction was never asked" stay distinguishable in telemetry.
 */
export async function extractFacts({ llm, text, onSkip = null }) {
  if (typeof llm !== 'function' || !text || !String(text).trim()) return []
  const gate = assertionGate(text)
  if (!gate.extract) {
    onSkip?.({ reason: gate.reason, quotedChars: gate.quotedChars, quotedRatio: gate.quotedRatio })
    return []
  }
  try {
    return parseFacts(await llm(EXTRACT_PROMPT(gate.text)))
  } catch {
    return []
  }
}

/**
 * Pure reconcile decision for one atomic fact (update-not-append). Given the current live fact for
 * a (entity, attribute) key (or null) and the incoming value → ADD (new), NOOP (same value, just
 * reinforce), or UPDATE (value changed → supersede the old, invalidate it).
 * @returns {{action:'add'|'noop'|'update'}}
 */
export function reconcilePlan(existing, newValue) {
  if (!existing) return { action: 'add' }
  return norm(existing.value) === norm(newValue) ? { action: 'noop' } : { action: 'update' }
}
