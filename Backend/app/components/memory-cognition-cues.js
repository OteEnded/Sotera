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
 * ── ✅✅ RATIFIED 2026-08-23 — Ote chose **safe silence** over activating without a usable cue:
 * *"I don't want to remove the lexical floor just to make activation appear more complete. If we don't have
 * enough signal to establish what the user is talking about, I'd rather Sotera not activate and not invent
 * an aboutness claim."* ⇒ ⛔ **option B (activate with no lexical floor and drop the aboutness claim) is
 * REFUSED, not pending.** A future edit that opens the gate by weakening the floor reverses a ruling.
 *
 * ── ⭐⭐ AND THEN THE OTHER HALF WAS SOLVED WITHOUT TOUCHING THE FLOOR AT ALL (Step B, below).
 * His second requirement — *"Sotera should not have a separate English memory brain"* — is met by giving
 * these runs REAL WORDS via `Intl.Segmenter`, not by lowering anything. ⇒ a segmentless run is now
 * **segmented into content words that go through the SAME floor as English**, and `cues.unsegmented` still
 * reports the run so the observability is kept. ⓘ The two rulings were never in conflict: *the floor stays;
 * cue formation gets fixed.*
 * ⛔ Still refuted, do not re-propose: character n-grams (FPR 96% at n=3) and a cosine floor (the true and
 * false distributions overlap) — see `ANALYSIS_SOTERA_MULTILINGUAL_CUES`.
 */
const SEGMENTLESS = /[฀-๿຀-໿ក-៿က-႟぀-ヿ㐀-䶿一-鿿豈-﫿]/u

// ══ ⭐⭐⭐ STEP B · SEGMENTATION, AND IT NEEDED NO DEPENDENCY AT ALL ═════════════════════════════════
//
// ⭐⭐ `Intl.Segmenter` IS BUILT INTO NODE, with full ICU. Ote asked to check the workspace before adding a
// package (option B3); the answer turned out better than any option in the plan — ICU's own dictionary-based
// word segmentation ships with the runtime:
//     th → ["เรา","คุย","เรื่อง","อะไร","กัน","บ้าง","เมื่อ","วาน","นี้"]
//     ja → ["記憶","は","どう","機能","し","ます","か"]     zh → ["你","还","记得","我们","的","谈话","吗"]
// ⇒ deterministic, no model, no threshold, no npm package, and no lexicon of ours to maintain.
//
// ── ⚠️⚠️ AND THE MEASUREMENT THAT LICENSED SHIPPING IT, because segmentation alone is not obviously safe ──
// Segmented words include function words, so the relevance floor downstream could match on ที่ / ไม่ / ได้ —
// which is how the refuted n-gram approach failed (FPR 96%). Measured on her 167 Thai messages, with the
// stop-list below:
//        Thai, segmented + stop-listed:            TPR 99%   FPR 92%
// ⛔ That does not separate. **But the CONTROL is the point:**
//        ENGLISH, the EXISTING production floor:   TPR 97%   FPR 81%   (370 pairs)
// ⇒ ⭐⭐⭐ **THE FLOOR NEVER SEPARATED IN ENGLISH EITHER.** 81% and 92% are the same regime, so segmentation
// brings Thai to **PARITY** rather than weakening anything — which is exactly *"Sotera should not have a
// separate English memory brain"*, and it honours *"keep the activation floor intact"*, because the floor is
// untouched and was already this weak.
// ⚠️ ⓘ TWO CAVEATS, RECORDED RATHER THAN BURIED. (1) Her Thai corpus is nearly single-topic — memory,
// identity, friendship — so many "negative" pairs are genuinely related and 92% overstates the badness.
// (2) The floor is PRECISE when a PERSON was named (an exact, script-independent name match); the 81/92%
// figures are for TOPIC-ONLY turns. ⇒ the weak-floor finding is real, language-independent, and a SEPARATE
// problem. ⛔ Not fixed here.

/** ⓘ Script → ICU locale. ⛔ Only scripts with no inter-word spaces need this. */
const SEGMENT_LOCALES = [
  [/[฀-๿]/u, 'th'],
  [/[຀-໿]/u, 'lo'],
  [/[ក-៿]/u, 'km'],
  [/[က-႟]/u, 'my'],
  [/[぀-ヿ]/u, 'ja'],
  [/[㐀-䶿一-鿿豈-﫿]/u, 'zh'],
]

/**
 * ⛔ FUNCTION WORDS AND PARTICLES — the Thai counterpart of `NOT_A_NAME`, and it is not guesswork:
 * ⭐ **the experiment that FAILED produced this list.** The n-gram calibration reported the most frequent
 * shared n-grams in unrelated pairs and they were exactly these — ที่ · ไม่ · ได้ · ว่า · เป็น · หรือ ·
 * ความ · เรื่อง. Measured, then stop-listed.
 * ⚠️ Japanese and Chinese get only the most obvious particles, because we have **no corpus** for them here.
 * ⓘ Said plainly so nobody reads this list as equally well-founded across scripts.
 */
const SEGMENTLESS_STOP = new Set([
  // Thai — measured
  'ที่', 'ไม่', 'ได้', 'ว่า', 'แบบ', 'ฉัน', 'เป็น', 'หรือ', 'เรื่อง', 'ความ', 'เพื่อ', 'นี้', 'นั้น', 'กัน',
  'บ้าง', 'แล้ว', 'อะไร', 'เมื่อ', 'ก็', 'จะ', 'มี', 'การ', 'ของ', 'ให้', 'แต่', 'และ', 'กับ', 'ใน', 'เขา',
  'คุณ', 'ผม', 'มัน', 'อยู่', 'ไป', 'มา', 'คือ', 'ถ้า', 'จาก', 'โดย', 'ยัง', 'ต้อง', 'เลย', 'นะ', 'ครับ',
  'ค่ะ', 'ทำ', 'ทั้ง', 'อย่าง', 'พอ', 'ตัว', 'เอง', 'ด้วย', 'เช่น', 'เพราะ', 'ซึ่ง', 'มาก', 'กว่า', 'แค่',
  'ทุก', 'บาง', 'อีก', 'ไว้', 'ไง', 'ไหม', 'ไหน', 'แก', 'เรา', 'ไม่ใช่', 'จริงๆ', 'เหมือน',
  // ⓘ Added after observing them come out of real turns: interrogatives, and COMPOUND FRAGMENTS that
  // ICU leaves behind (เกี่ยว from เกี่ยวกับ, วาน from เมื่อวาน). ⚠️ The list grows as fragments are seen;
  // it is not claimed complete, and the parity argument above does not depend on it being so.
  'อย่างไร', 'ยังไง', 'เกี่ยว', 'วาน', 'เท',
  // Japanese / Chinese — particles only, and ⚠️ UNMEASURED
  'は', 'が', 'を', 'に', 'で', 'と', 'も', 'の', 'から', 'まで', 'です', 'ます', 'した', 'する', 'ある', 'いる',
  '的', '了', '是', '在', '和', '我', '你', '他', '她', '们', '吗', '呢', '吧', '这', '那', '有', '就', '不',
])

/** ⓘ Segmenters are expensive to construct; one per locale, built lazily, ⛔ and never a hard requirement. */
const segmenters = new Map()
function segmenterFor(locale) {
  if (segmenters.has(locale)) return segmenters.get(locale)
  let s = null
  // ⛔ FAILS SOFT TO TODAY'S BEHAVIOUR. A runtime without `Intl.Segmenter`, or without full ICU, produces no
  // cues for a segmentless turn — which is the SAFE SILENCE Ote ratified. ⭐ The degradation is the
  // previously-ratified behaviour, which is exactly what makes it safe rather than merely tolerable.
  try {
    if (typeof Intl?.Segmenter === 'function') s = new Intl.Segmenter(locale, { granularity: 'word' })
  } catch { s = null }
  segmenters.set(locale, s)
  return s
}

/** ⭐ Is word segmentation available at all? Exported so a check can assert the fallback is the safe one. */
export const canSegment = () => {
  try {
    return typeof Intl?.Segmenter === 'function'
      && [...new Intl.Segmenter('th', { granularity: 'word' }).segment('เราคุยกัน')].some((p) => p.isWordLike)
  } catch { return false }
}

/**
 * ⭐⭐ Content words out of a run of segmentless script. Returns `[]` when segmentation is unavailable.
 * ⚠️ Minimum length 2, not 3: Thai content words are commonly 2–4 characters and a single character is
 * almost always a particle. ⓘ English stays at 3 — the thresholds are per-script because the scripts are,
 * and using one number for both was part of the original defect.
 * ⚠️ ICU splits some compounds (ความทรงจำ → ความ / ทรง / จำ). The fragments are short and mostly
 * stop-listed; recorded because it is a real limit of dictionary segmentation, not a bug to chase.
 */
function segmentWords(run) {
  const hit = SEGMENT_LOCALES.find(([re]) => re.test(run))
  if (!hit) return []
  const seg = segmenterFor(hit[1])
  if (!seg) return []
  const out = []
  try {
    for (const part of seg.segment(run)) {
      if (!part.isWordLike) continue
      const w = part.segment.trim()
      if (w.length < 2 || SEGMENTLESS_STOP.has(w)) continue
      if (!out.includes(w)) out.push(w)
    }
  } catch { return [] }
  return out
}

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
  const empty = { persons: [], topics: [], recency: null, technical: false, derivedTopics: [], unsegmented: [], scripts: [], raw }
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
  const derivedTopics = []
  const unsegmented = []
  for (const tok of raw.split(/[^\p{L}\p{M}\p{N}'’-]+/u)) {
    const t = tok.trim()
    if (t.length < 3) continue
    const l = t.toLowerCase()
    // ⛔ A RUN OF SEGMENTLESS SCRIPT IS NOT A TOPIC — see `SEGMENTLESS`. It is reported so the decision is
    // visible and testable, and it does NOT open the gate, because a clause-as-topic guarantees a false
    // absence rather than a recollection.
    // ⭐⭐ STEP B · A SEGMENTLESS RUN IS NOW SEGMENTED INTO REAL WORDS instead of being reported and
    // dropped. ⓘ `unsegmented` still records the run, so the observability the previous decision added is
    // kept — it now means *"this needed segmenting"* rather than *"this was abandoned"*.
    if (SEGMENTLESS.test(t)) {
      if (!unsegmented.includes(t)) unsegmented.push(t)
      for (const w of segmentWords(t)) {
        if (persons.some((pp) => pp.toLowerCase() === w.toLowerCase())) continue
        if (!topics.includes(w)) topics.push(w)
        // ⭐⭐⭐ AND WE RECORD THAT WE MANUFACTURED IT. ⚠️ Measured the moment segmentation shipped:
        // ICU splits ความทรงจำ ("memory") into ความ / ทรง / จำ, and the block rendered
        //     *"I went looking for what I have about ทรง and came up with nothing."*
        // ⛔ A FALSE ABSENCE WHOSE SUBJECT IS A FRAGMENT WE INVENTED. Ote's ruling is exactly about this:
        // *"If we don't have enough signal to establish what the user is talking about, I'd rather Sotera
        // not activate and not invent an aboutness claim."*
        // ⇒ ⭐ THE DISCRIMINATOR IS PROVENANCE, NOT LENGTH: a token the PERSON TYPED ("Zephyrine") may
        // honestly carry an absence — *"I went looking for Zephyrine and came up with nothing"* is true and
        // useful. A token WE produced by splitting may not. ⛔ Not a tuned threshold; a fact about where the
        // cue came from. See `mayClaimAboutness`.
        if (!derivedTopics.includes(w)) derivedTopics.push(w)
      }
      continue
    }
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
  // ⓘ Did segmentation actually run for this turn? ⛔ Observability only; nothing branches on it.
  if (unsegmented.length) scripts.push(canSegment() ? 'segmented' : 'segmenter-unavailable')

  return {
    persons, topics, derivedTopics, recency, technical: TECHNICAL.some((re) => re.test(raw)),
    unsegmented, scripts, raw,
  }
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

/**
 * ⭐⭐⭐ MAY THIS TURN'S CUES CARRY AN **ABOUTNESS CLAIM**?
 *
 * ⓘ Two silences, refined. The original pair was *"nothing resolved ⇒ claim nothing"* vs *"a cue resolved
 * and the search was empty ⇒ report the absence as a fact"*. Segmentation added a third case the pair did
 * not anticipate: **a cue resolved, but WE manufactured it** by splitting a compound. An absence reported
 * about `ทรง` is not a fact about her memory, it is a fact about our tokeniser.
 *
 * ⇒ ⭐ An aboutness claim needs a cue the PERSON produced: a resolved person, or a topic they actually
 * typed. ⛔ Derived-only cues may still ACTIVATE and retrieve — they are good query material for the dense
 * arm, which works on the raw text anyway — they simply may not be named as the subject of an absence.
 */
export function mayClaimAboutness(cues) {
  if (!cues) return false
  if (cues.persons?.length) return true
  const derived = new Set(cues.derivedTopics ?? [])
  return (cues.topics ?? []).some((t) => !derived.has(t))
}
