// MEMORY COGNITION · CUE FORMATION. Build item 3a, and PURE — no stores, no model, no IO.
//
// ⭐⭐ WHY CUES AND NOT "UNDERSTAND THE QUESTION". Ote's sketch had `question → understand what is being
// asked → activation`. The measurement argues against that middle stage: the failure being fixed IS an
// inference failure (she inferred which population held the answer and whether a boundary applied, and got
// it wrong), so adding an intent-classification inference in front of it would put a second guess where a
// first guess already broke.
//
// Associative memory is CUED, not queried. From *"How's Hermes doing?"* what the layer needs is
// `{ person: Hermes, relation: self↔Hermes, recency: recent }` — not a label for what kind of question it
// is. Cues are mostly deterministic: names that resolve against people she already has records for, plus
// the turn's own text as the fallback semantic query.
//
// ⛔ NO LLM CALL HERE, in v1. It doubles latency, adds a contamination surface, and would need its own
// evaluation before being trusted with what activates. ⓘ If it is ever added, it is a new stage with its own
// generation counter, not a quiet upgrade to this one.
//
// ⛔ AND NO INTENT VOCABULARY LEAVES THIS FILE. A cue is a handle on the world (a person, a topic, a time),
// never a category of question. The moment this returns `{ intent: 'ask-about-person' }` we have built a
// classifier and taught her its taxonomy.

/**
 * ⭐ WORDS THAT ARE NOT NAMES, and this list is the difference between "activate for Hermes" and
 * "activate for Have". Capitalisation is the cheapest name signal in English and it fires on every
 * sentence-initial word, so the opener has to be excluded explicitly.
 * ⓘ Deliberately short and boring. It is a stop-list for *sentence starts and pronouns*, not an attempt at
 * NER — real resolution happens against the people she actually has records for (`knownNames`).
 */
const NOT_A_NAME = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'so', 'do', 'does', 'did', 'is', 'are', 'was', 'were', 'be',
  'have', 'has', 'had', 'how', 'what', 'when', 'where', 'who', 'whom', 'why', 'which', 'can', 'could',
  'will', 'would', 'should', 'shall', 'may', 'might', 'must', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these',
  'those', 'there', 'here', 'not', 'no', 'yes', 'ok', 'okay', 'just', 'now', 'then', 'about', 'with',
  'from', 'for', 'to', 'in', 'on', 'at', 'by', 'of', 'as', 'up', 'out', 'any', 'anything', 'something',
  'nothing', 'lately', 'recently', 'again', 'still', 'also', 'even', 'like', 'been', 'being', 'get', 'got',
  'know', 'think', 'tell', 'say', 'said', 'talk', 'talked', 'talking', 'ask', 'asked', 'go', 'going',
  'let', 'lets', 'please', 'thanks', 'thank', 'hi', 'hey', 'hello',
])

/**
 * ⭐ RECENCY, in the words people actually use. ⛔ Not a parsed date range — a hint the activation stage may
 * use to prefer or to bound, never a filter that can silently exclude the answer.
 */
const RECENCY = [
  [/\b(right now|currently|at the moment)\b/i, 'now'],
  [/\b(today|this morning|this afternoon|tonight)\b/i, 'today'],
  [/\b(lately|recently|these days|nowadays|last few days)\b/i, 'recent'],
  [/\b(yesterday)\b/i, 'yesterday'],
  [/\b(last week|past week)\b/i, 'week'],
  [/\b(ever|at all|any ?time|before|previously|in the past)\b/i, 'any'],
]

/**
 * ⭐⭐ ASKING HER TO EXPLAIN HERSELF IS A DIFFERENT QUESTION, and it is the one place the machinery is
 * allowed out. Ote: *"If I ask 'Have you talked to Hermes?', answer me about Hermes. If I ask 'How does your
 * memory work?', then explain rooms, scopes, authorization, etc."*
 *
 * ⇒ this flag is what the vocabulary boundary consults for its exemption. ⛔ It does NOT change what is
 * retrieved: she still gets her memory, she is simply also allowed to describe the mechanism.
 */
const TECHNICAL = [
  /\bhow (do|does) (your|the) (memory|recall|retrieval|storage)\b/i,
  /\bhow (do|does) you (remember|recall|store|forget)\b/i,
  /\bhow (does|do) (this|that|it) work\b/i,
  /\b(explain|describe) (your|the) (memory|architecture|system|retrieval)\b/i,
  /\b(room|rooms|scope|authorization|disclosure|permission)s?\b.*\bwork\b/i,
]

/**
 * ⭐ FORM THE CUES FOR ONE TURN. PURE.
 *
 * @param {string} text the person's message, as written
 * @param {{ knownNames?: string[] }} [ctx] display names / usernames she has records for. ⭐ This is what
 *        makes name resolution real rather than a capitalisation heuristic: a token only becomes a `person`
 *        cue if she has someone by that name. Everything else stays a `topic`.
 * @returns {{ persons: string[], topics: string[], recency: string|null, technical: boolean, raw: string }}
 */
export function formCues(text, { knownNames = [] } = {}) {
  const raw = String(text ?? '').trim()
  const empty = { persons: [], topics: [], recency: null, technical: false, raw }
  if (!raw) return empty

  const known = new Map()
  for (const n of knownNames) {
    const k = String(n ?? '').trim()
    if (k) known.set(k.toLowerCase(), k)
  }

  // ── PERSONS · resolved against people she actually knows about ────────────────────────────────────
  // ⭐ Two passes, because a name can arrive in any case: an exact known-name match anywhere in the text,
  // then capitalised tokens that ALSO resolve. ⛔ A capitalised token that resolves to nobody is a topic.
  const persons = []
  const lower = raw.toLowerCase()
  for (const [k, original] of known) {
    // word-ish boundary so "Kavi" does not match inside "Kavita"
    if (new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i').test(lower)) {
      if (!persons.includes(original)) persons.push(original)
    }
  }

  // ── TOPICS · the meaningful words, for the fallback semantic query ────────────────────────────────
  // ⛔ NOT a keyword extractor pretending to be smart. It drops stop-words and the names already resolved,
  // and hands the rest on. The retrieval stage does the real work with the raw text.
  const topics = []
  for (const tok of raw.split(/[^A-Za-z0-9'’-]+/)) {
    const t = tok.trim()
    if (t.length < 3) continue
    const l = t.toLowerCase()
    if (NOT_A_NAME.has(l)) continue
    if (persons.some((p) => p.toLowerCase() === l)) continue
    if (!topics.includes(l)) topics.push(l)
  }

  let recency = null
  for (const [re, label] of RECENCY) { if (re.test(raw)) { recency = label; break } }

  return { persons, topics, recency, technical: TECHNICAL.some((re) => re.test(raw)), raw }
}

/**
 * ⭐⭐ DID ANYTHING RESOLVE? This is the gate on always-on activation, and it decides between two very
 * different silences.
 *
 * Ote: *"If the cognition layer actually searches the relevant populations and finds nothing, give her the
 * result of the search, not an architectural explanation."* ⇒ a turn where a cue DID resolve and the search
 * came back empty must inject the absence as a fact. A turn where nothing resolved injects nothing at all
 * and claims nothing — because we did not look, and saying "I found nothing" would be a lie about a search
 * that never happened.
 */
export const hasCue = (cues) => Boolean(cues && (cues.persons.length > 0 || cues.topics.length > 0))

/**
 * ⭐ Which populations these cues warrant activating. Generous on purpose: ⛔ a cheap extra retrieval is
 * always preferable to her inferring a population's absence, which is the entire failure being fixed.
 *
 * ⓘ Returns names of POPULATIONS, not tool names. The activation stage maps them to retrievers; nothing
 * here knows what a tool is called.
 */
export function populationsFor(cues) {
  if (!hasCue(cues)) return []
  const p = new Set(['working-set', 'semantic', 'own-history'])
  if (cues.persons.length) { p.add('practices'); p.add('intentions') }
  // ⭐ A question about how SHE works is a question about her lessons, not only about the mechanism.
  if (cues.technical || /\b(learn|learned|lesson|mistake|habit|practice)\b/i.test(cues.raw)) p.add('lessons')
  return [...p]
}
