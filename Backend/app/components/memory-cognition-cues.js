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
 *
 * ⚠️ THAI IS LISTED BESIDE ENGLISH BECAUSE HE WRITES THAI — 167 of her messages carry Thai script. A
 * per-language pattern list is a weak instrument (measured elsewhere in this project at 1-of-9 languages for
 * name detection), but ⓘ the failure direction here is mild: a missed recency hint changes a PREFERENCE, and
 * `recency` has never been allowed to exclude anything.
 */
const RECENCY = [
  [/\b(right now|currently|at the moment)\b/i, 'now'],
  [/(ตอนนี้|เดี๋ยวนี้|ขณะนี้)/, 'now'],
  [/\b(today|this morning|this afternoon|tonight)\b/i, 'today'],
  [/(วันนี้|เมื่อเช้า|คืนนี้)/, 'today'],
  [/\b(lately|recently|these days|nowadays|last few days)\b/i, 'recent'],
  [/(ล่าสุด|เพิ่ง|ช่วงนี้|หลังๆ|หลัง ๆ|ระยะนี้)/, 'recent'],
  [/\b(yesterday)\b/i, 'yesterday'],
  [/(เมื่อวาน|วานนี้)/, 'yesterday'],
  [/\b(last week|past week)\b/i, 'week'],
  [/(สัปดาห์ที่แล้ว|อาทิตย์ที่แล้ว)/, 'week'],
  [/\b(ever|at all|any ?time|before|previously|in the past)\b/i, 'any'],
  [/(เคย|ก่อนหน้านี้|ที่ผ่านมา)/, 'any'],
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
  // ── ⭐⭐ THAI · HE ASKS HER THIS IN THAI, AND UNTIL NOW THE ANSWER WAS WORSE FOR IT ───────────────
  // ⚠️ AND THE CONSEQUENCE OF MISSING IT IS NOT "a slightly worse answer" — `technical` is what exempts the
  // block from the vocabulary guard, so a Thai technical question whose block legitimately mentions the
  // mechanism gets the WHOLE BLOCK WITHHELD (`activated: false`). She loses her memory rather than her
  // manners. ⓘ The miss direction is still the safe one, which is why a pattern list is tolerable here.
  /ความ(ทรง)?จำ[^]{0,24}(ทำงาน|ยังไง|อย่างไร)/,
  /(ทำงาน|จัดเก็บ|เก็บ)[^]{0,16}ความ(ทรง)?จำ/,
  /(จำ|ลืม)[^]{0,20}(ได้ยังไง|ได้อย่างไร|ทำงานยังไง)/,
  /(อธิบาย|เล่า)[^]{0,20}(ความ(ทรง)?จำ|ระบบ|สถาปัตยกรรม)/,
]

/**
 * ⚠️⚠️ SCRIPTS WITH NO INTER-WORD SPACES — Thai, Lao, Khmer, Myanmar, Japanese, Chinese.
 *
 * ⭐⭐ THIS EXISTS SO THE GATE'S BEHAVIOUR ON THEM IS A **NAMED DECISION** RATHER THAN AN ACCIDENT OF A
 * CHARACTER CLASS. Splitting a Thai clause on non-word characters yields ONE token — the whole clause — and
 * a whole clause is not a topic: nothing in the record contains it as a substring, so the relevance floor
 * downstream would drop every candidate and the turn would render as *"I went looking … and came up with
 * nothing"*. ⛔ THAT IS A FALSE ABSENCE, and it is strictly worse than the silence of not activating, because
 * a silence claims nothing while a false absence claims a search that could not have succeeded.
 *
 * ⇒ ⓘ These runs are reported on `cues.unsegmented` and deliberately DO NOT become topics. See
 * `hasCue` for the decision and `ANALYSIS_SOTERA_MULTILINGUAL_CUES` for the two measurements that rule out
 * the obvious alternatives (character n-grams and a cosine floor both fail to separate on her own data).
 */
const SEGMENTLESS = /[฀-๿຀-໿ក-៿က-႟぀-ヿ㐀-䶿一-鿿豈-﫿]/u

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
  const empty = { persons: [], topics: [], recency: null, technical: false, unsegmented: [], scripts: [], raw }
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
  //
  // ⚠️⚠️ AND THE SPLIT USED TO BE AN **ASCII ALLOWLIST**, `[^A-Za-z0-9'’-]+`, WHICH IS A WHOLE-LANGUAGE
  // OUTAGE AND NOT A THAI PROBLEM. Every letter outside ASCII was treated as a SEPARATOR, so:
  //     Russian «Что ты помнишь»  → 0 tokens        Greek, Hebrew, Arabic, Hindi → 0 tokens
  //     Spanish "¿Qué recuerdas?" → "Qu" + "recuerdas"  (a word silently cut in half at the é)
  //     Thai    "ความทรงจำ…"      → 0 tokens
  // ⇒ `hasCue` was false, so the layer never ran, and the same class of bug is already recorded in this
  // project as *the ASCII-tokenizer whole-language outage*. ⭐ `\p{L}\p{M}\p{N}` is the fix: `\p{M}` matters
  // as much as `\p{L}`, because Thai tone marks, Devanagari matras and Arabic diacritics are combining marks
  // and dropping them cuts words apart from the inside.
  const topics = []
  const unsegmented = []
  for (const tok of raw.split(/[^\p{L}\p{M}\p{N}'’-]+/u)) {
    const t = tok.trim()
    if (t.length < 3) continue
    const l = t.toLowerCase()
    // ⛔ A RUN OF SEGMENTLESS SCRIPT IS NOT A TOPIC — see `SEGMENTLESS`. It is reported so the decision is
    // visible and testable, and it does NOT open the gate, because a clause-as-topic guarantees a false
    // absence rather than a recollection.
    if (SEGMENTLESS.test(t)) { if (!unsegmented.includes(t)) unsegmented.push(t); continue }
    if (NOT_A_NAME.has(l)) continue
    if (persons.some((p) => p.toLowerCase() === l)) continue
    if (!topics.includes(l)) topics.push(l)
  }

  let recency = null
  for (const [re, label] of RECENCY) { if (re.test(raw)) { recency = label; break } }

  // ⓘ OBSERVABILITY, NOT BEHAVIOUR. Which writing systems the turn used, so a check can assert that a Thai
  // turn was SEEN as Thai rather than seen as empty. ⛔ Nothing branches on this beyond `hasCue`.
  const scripts = []
  if (/[\p{Script=Latin}]/u.test(raw)) scripts.push('latin')
  if (/[฀-๿]/u.test(raw)) scripts.push('thai')
  if (SEGMENTLESS.test(raw)) scripts.push('segmentless')
  if (/[\p{L}]/u.test(raw) && !/[\p{Script=Latin}]/u.test(raw) && !SEGMENTLESS.test(raw)) scripts.push('other-alphabetic')

  return { persons, topics, recency, technical: TECHNICAL.some((re) => re.test(raw)), unsegmented, scripts, raw }
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
