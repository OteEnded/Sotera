// MARKDOWN → SPEAKABLE PROSE. The step between "what the model wrote" and "what the voice says".
//
// Ote, 2026-08-04: *"how it speak? did it pour raw data from model result to tts? or did we resolve it
// before send to tts"* — half-resolved was the honest answer, and this closes the other half.
//
// ── What was ALREADY resolved (structurally, not by cleaning) ─────────────────────────────────────────
// The route speaks `messages.content`, which is the CANONICAL ANSWER only. Reasoning lives in its own
// column, streaming drafts and tool narration live in `segments`, tool calls in `tool_calls`. So thinking
// and tool chatter can never leak into speech — that follows from the four-role output taxonomy rather
// than from any filtering here, which is why it is safe.
//
// ── What was NOT resolved, until this file ────────────────────────────────────────────────────────────
// The canonical answer is MARKDOWN. A TTS engine has no idea what markdown is: `**really**` becomes
// asterisk noise or a mispronounced word, a fenced code block becomes a minute of punctuation read
// aloud, a pipe table becomes gibberish, and a URL becomes letter soup. None of that is speech.
//
// ── Decisions worth keeping ───────────────────────────────────────────────────────────────────────────
// * **Code blocks and tables are OMITTED, not read.** Reading `const x = {a: 1}` aloud produces nothing a
//   human wants; the eye is the right organ for code. The caller is TOLD what was dropped so the UI can
//   say so — silently skipping content would be worse than reading it badly.
// * **A link reads as its TEXT, never its URL.** "https://github.com/OteEnded/..." spoken character by
//   character is the single worst thing a TTS can be handed.
// * **Structure becomes PAUSES.** A heading or list item gets a sentence stop, because that is how the
//   engine is told to breathe — the only prosody control available through plain text.
// * **Emoji are dropped.** Engines either name them ("fire emoji") or emit an artifact; neither is what
//   the writer meant, and one emoji per bullet would dominate the audio.
// * **Thai-safe.** Every rule here operates on ASCII punctuation and markers. Thai has no inter-word
//   spaces, so nothing may split or join on whitespace assumptions — and nothing here does.
//
// Pure and SYNCHRONOUS so it is unit-testable without a server, a sidecar, or a GPU.
//
// ⚠ ONE DEPENDENCY, ADDED 2026-08-06 (maths phase 2): ./math-speech.js, which turns LaTeX into words. It is
// pure JS (KaTeX + speech-rule-engine — no Python, no CUDA, no network), it warms itself at import, and its
// only entry point is synchronous and returns null on any failure. So this file is still a pure function of
// its input and still runs in a bare `node --test`; what it is no longer is dependency-FREE, and saying so
// while importing something would be the first sentence of the next debugging session.

import { speakMath } from './math-speech.js'

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu

// WHAT A DROPPED BLOCK SAYS INSTEAD OF NOTHING. One short sentence per kind per language — spoken aloud, so it
// has to sound like a person mentioning something in passing, not like an error code being read out.
// ⚠ `math` IS NOW A FALLBACK, NOT THE NORMAL PATH. Since phase 2 a formula is READ ALOUD (see math-speech.js);
// this sentence is what a formula gets when it cannot be read honestly — a parse error, an over-long
// expansion, Thai (no SRE locale), or an engine that has not warmed. `tables` and `codeBlocks` are still the
// only answer for their kinds, because there is no honest way to speak a code block.
// ⚠ "IN THE MESSAGE" IS LOAD-BEARING — Ote's wording, 2026-08-05, and he was right to change mine. My first
// version said "Here, a table." which a listener can hear as "a table is coming up next", and then it never
// arrives. His phrasing says where the thing IS: on the screen, for the eye. The sentence has to answer
// "so what do I do about it?", because the one thing the listener cannot do is look at what was skipped
// unless someone tells them it is there.
const SPOKEN_GAP = {
  en: { tables: 'Here, a table in the message.', codeBlocks: 'Here, a code block in the message.', math: 'Here, a formula in the message.' },
  th: { tables: 'ตรงนี้มีตารางในข้อความ', codeBlocks: 'ตรงนี้มีโค้ดในข้อความ', math: 'ตรงนี้มีสูตรในข้อความ' },
}
/** The sentence for a dropped block of `kind`, in the language of the surrounding text. */
const gapFor = (lang, kind) => `\n${SPOKEN_GAP[lang]?.[kind] ?? SPOKEN_GAP.en[kind]}\n`

// ── WHICH LANGUAGE IS THIS, AND WHY THE RULE IS "ANY THAI AT ALL" ─────────────────────────────────────
// Derived FROM THE TEXT, never from a label: round 1 of the bake-off read a whole sweep as CER 2.414 because
// the hint came from a metadata field instead of the content (real figure 0.041).
//
// ⚠ THE THRESHOLD IS OTE'S EAR, MEASURED FIRST. The `language` argument demonstrably changes OmniVoice's
// rendering — pure Thai shifts 15.2 Hz against a 1.6 Hz render spread (9.5x), mixed text 4.3x on duration,
// pure English only 1.6x, i.e. inside the noise. Then he listened and said: *"th should go thai, eng can do
// wirh th and en"*. Those two facts together collapse what looked like a threshold problem:
//     Thai text  -> needs th     English text -> either works     MIXED -> th is safe for both halves
// So ANY Thai wins, and there is no dominance percentage to tune and no prompt-language tiebreaker to build.
//
// The previous rule required Thai to reach 15% of the Latin count, which left one real hole: a single Thai word
// inside a long English sentence (2 chars against 200) fell to `en` — the one case that reads badly, and the
// case a threshold can never get right because it is about presence, not proportion.
export function languageOf(text) {
  for (const ch of String(text || '')) {
    if (ch >= '฀' && ch <= '๿') return 'th'
  }
  return 'en'
}

// ── NUMBERS AND SYMBOLS ───────────────────────────────────────────────────────────────────────────────
// Ote, after listening: *"number not so good for thai for both en and th"* — so Thai numerals are misread
// whichever hint is used, which means the hint cannot fix it and the text must. Separately MEASURED: the engine
// drops '$' entirely, in both languages ("$0 per render" came back as "zero per render" while a spelled control
// came back as "$0"). Silently dropping a currency symbol changes what a sentence MEANS, so it is the one
// expansion that is not a matter of taste.
//
// ⚠ Thai number words carry two irregularities that a digit-by-digit reading gets wrong, and they are the whole
// reason this is a function rather than a lookup: a trailing 1 in any number above ten is เอ็ด, not หนึ่ง
// (11 = สิบเอ็ด), and 2 in the tens place is ยี่, not สอง (20 = ยี่สิบ).
const TH_DIGIT = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const TH_PLACE = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

/** A whole number (as a digit string) in Thai words. Handles ล้าน by recursion, so it has no upper bound. */
function thaiInt(digits) {
  const s = String(digits).replace(/^0+(?=\d)/, '')
  if (s === '' || /\D/.test(s)) return s
  if (s === '0') return TH_DIGIT[0]
  if (s.length > 6) {
    const head = s.slice(0, s.length - 6)
    const tail = s.slice(-6)
    const rest = /^0{6}$/.test(tail) ? '' : thaiInt(tail)
    return `${thaiInt(head)}ล้าน${rest}`
  }
  let out = ''
  const n = s.length
  for (let i = 0; i < n; i++) {
    const d = Number(s[i])
    const place = n - 1 - i           // 0 = units, 1 = tens, …
    if (d === 0) continue
    if (place === 0 && d === 1 && n > 1) out += 'เอ็ด'        // …สิบเอ็ด, never …สิบหนึ่ง
    else if (place === 1 && d === 2) out += 'ยี่สิบ'          // ยี่สิบ, never สองสิบ
    else if (place === 1 && d === 1) out += 'สิบ'             // สิบ, never หนึ่งสิบ
    else out += TH_DIGIT[d] + TH_PLACE[place]
  }
  return out
}

/** Digits after a decimal point are read individually, in both languages ("81.7" -> …จุดเจ็ด). */
const thaiDecimals = (frac) => [...String(frac)].map((d) => TH_DIGIT[Number(d)] ?? d).join('')

// Units the engine says badly or not at all. Thai gets words; English keeps the abbreviation EXCEPT where the
// symbol is dropped outright. Deliberately short: every entry here is one Ote can hear and argue with, and a
// long speculative table is how a normaliser starts mispronouncing things nobody complained about.
const TH_UNITS = [
  [/%/g, ' เปอร์เซ็นต์'],
  [/\bMB\b/g, ' เมกะไบต์'], [/\bGB\b/g, ' กิกะไบต์'], [/\bKB\b/gi, ' กิโลไบต์'], [/\bTB\b/g, ' เทราไบต์'],
  [/\bkHz\b/g, ' กิโลเฮิรตซ์'], [/\bHz\b/g, ' เฮิรตซ์'], [/\bms\b/g, ' มิลลิวินาที'],
  [/°C/g, ' องศาเซลเซียส'], [/°F/g, ' องศาฟาเรนไฮต์'],
]

/**
 * Expand numbers and the symbols attached to them, for the language this text will be SPOKEN in.
 * Exported so it can be tested and heard on its own; called by toSpeakable, which knows the language.
 */
export function expandNumbers(input, language = 'en') {
  let s = String(input ?? '')
  // Currency FIRST, while the digits are still digits. '$' is dropped by the engine in both languages, so this
  // one is a correctness fix rather than a preference. Thai puts the unit after the amount, as it is spoken.
  if (language === 'th') {
    s = s.replace(/\$\s?([\d,]+(?:\.\d+)?)/g, (_m, n) => `${n} ดอลลาร์`)
    s = s.replace(/฿\s?([\d,]+(?:\.\d+)?)/g, (_m, n) => `${n} บาท`)
  } else {
    s = s.replace(/\$\s?([\d,]+(?:\.\d+)?)/g, (_m, n) => `${n} dollars`)
    s = s.replace(/฿\s?([\d,]+(?:\.\d+)?)/g, (_m, n) => `${n} baht`)
  }
  if (language !== 'th') return s        // English digits are read correctly as-is (his ear, and measured)

  for (const [re, word] of TH_UNITS) s = s.replace(re, word)
  // Thousands separators go before the digits are read, or "1,024" becomes two numbers.
  s = s.replace(/(\d),(\d{3})\b/g, '$1$2').replace(/(\d),(\d{3})\b/g, '$1$2')
  s = s.replace(/(\d+)\.(\d+)/g, (_m, a, b) => `${thaiInt(a)}จุด${thaiDecimals(b)}`)
  s = s.replace(/\d+/g, (m) => thaiInt(m))
  return s
}

/** End a fragment so the engine pauses: structure has no sound unless it becomes punctuation. */
function stop(line) {
  const t = line.trim()
  if (!t) return ''
  return /[.!?;:,…。！？ฯ]$/.test(t) ? t : `${t}.`
}

/**
 * Turn a markdown answer into something worth hearing.
 * Returns { text, omitted: { codeBlocks, tables, images }, hadMarkdown }.
 */
export function toSpeakable(input, { language } = {}) {
  const omitted = { codeBlocks: 0, tables: 0, images: 0, math: 0 }
  let s = String(input ?? '').replace(/\r\n?/g, '\n')
  const before = s
  // Detected from the RAW text, and by the SAME function that picks the sidecar's `language` hint — so the way
  // numbers are expanded and the way the engine is told to read them can never disagree.
  const lang = language || languageOf(s)

  // 1. FENCED CODE first — before any inline rule can chew on its contents. Counted, then removed.
  //    Ote, 2026-08-05: *"Code blocks do same style as table"* — so a dropped block now says where it is
  //    instead of leaving silence. Same reasoning as the table: the listener is not looking at the screen,
  //    which is the whole point of speaking the reply. INLINE code is untouched — `speechRate` is a word.
  s = s.replace(/```[\s\S]*?(?:```|$)/g, () => { omitted.codeBlocks += 1; return gapFor(lang, 'codeBlocks') })
  s = s.replace(/~~~[\s\S]*?(?:~~~|$)/g, () => { omitted.codeBlocks += 1; return gapFor(lang, 'codeBlocks') })

  // 1b. INDENTED CODE BLOCKS (4 spaces or a tab). Measured 2026-08-04: these sailed straight through and
  //     were READ ALOUD — "const x = 1. run(x)." — because only FENCED blocks were handled. Models emit
  //     both, and the indented form is the one nobody remembers to strip.
  s = s.replace(/(?:^(?: {4}|\t)[^\n]*\n?){2,}/gm, () => { omitted.codeBlocks += 1; return gapFor(lang, 'codeBlocks') })

  // 1c. MATH. `$O(n^2)$` and `$$E = mc^2$$` were read literally, dollar signs and carets included. There
  //     is no honest way to speak notation aloud, so it is dropped and COUNTED like code — same reasoning:
  //     the eye is the right organ for a formula.
  //     ⚠ PHASE 2 (2026-08-06): A FORMULA IS NOW READ, NOT POINTED AT — when it can be read honestly.
  //     `speakMath` returns the actual words via KaTeX→MathML→speech-rule-engine (ClearSpeak, settled by
  //     Ote's ear), or null. null keeps the phase-1 signpost, so a parse error, an over-long expansion or an
  //     engine that has not finished warming all degrade to exactly the behaviour that shipped before.
  //
  //     ⚠ THAI KEEPS THE SIGNPOST. SRE has no Thai locale, and English words dropped into a Thai sentence
  //     read worse than a Thai sentence saying where to look. Ote, asked directly: *"that ok"*.
  //
  //     ⚠ `omitted.math` IS ONLY INCREMENTED WHEN THE FORMULA IS ACTUALLY DROPPED. It drives the UI's
  //     "1 formula was skipped — read it on screen", which becomes a LIE the moment the formula was in fact
  //     spoken. Counting the attempt rather than the omission is how a status line starts describing the
  //     code's intentions instead of the audio.
  //
  //     The old split — display announced, inline silent — was never about display vs inline; it was that a
  //     SENTENCE cannot be injected into another sentence ("It costs Here, a formula in the message.
  //     total."). WORDS can. So inline maths is now spoken inline, which is what the phase-1 note said phase
  //     2 would supply, and it keeps the signpost only when the words are unavailable.
  const spokenMath = (tex, display) => (lang === 'th' ? null : speakMath(tex, { display }))
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_m, tex) => {
    const said = spokenMath(tex, true)
    if (said) return `\n${said}.\n`
    omitted.math += 1
    return gapFor(lang, 'math')
  })
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_m, tex) => {
    const said = spokenMath(tex, true)
    if (said) return `\n${said}.\n`
    omitted.math += 1
    return gapFor(lang, 'math')
  })
  //     ⚠ INLINE `$…$` MUST LOOK LIKE NOTATION, not just sit between two dollar signs. The naive version
  //     turned "It costs $5 and $7 total." into "It costs 7 total." — it read the span between two PRICES
  //     as a formula. Money is far commoner than LaTeX in a chat reply, so the content must contain an
  //     actual notation character (\ ^ _ { }) to qualify. Missing an exotic `$x = y$` costs one odd
  //     reading; eating a price silently changes what the sentence says.
  s = s.replace(/\$([^$\n]{1,200})\$/g, (m, inner) => {
    if (!/[\\^_{}]/.test(inner)) return m
    const said = spokenMath(inner, false)
    if (said) return ` ${said} `        // inline: WORDS, mid-sentence, where a signpost could never go
    omitted.math += 1
    return ' '
  })

  // 1d. HTML. Models emit it inside markdown and it was read TAG AND ALL ("Line one less-than b r
  //     greater-than Line two"). <br> and closing block tags become line breaks because that is what they
  //     MEAN; every other tag is unwrapped, keeping its text — <details>/<summary> content is prose
  //     somebody wrote and deserves reading. script/style are dropped whole, contents included.
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/(p|div|li|tr|h[1-6]|details|summary|blockquote)>/gi, '\n')
  s = s.replace(/<\/?[a-zA-Z][^>\n]{0,120}>/g, '')

  // 2. Images before links — `![alt](url)` also matches the link pattern, so order decides.
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, () => { omitted.images += 1; return '' })

  // 3. Links read as their TEXT. Reference-style links lose the label the same way.
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  s = s.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
  s = s.replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')       // link definitions are not prose
  s = s.replace(/\[\^[^\]]+\]/g, '')                     // footnote references

  // 4. TABLES: a pipe grid read aloud is noise. Detect a block of 2+ pipe lines and drop it whole —
  //    dropping half a table (say, keeping the header) would be worse than dropping all of it.
  //
  //    ⚠ BUT A DROPPED BLOCK NOW LEAVES A WORD BEHIND, NOT A HOLE. Ote, 2026-08-05: *"for table skip, can you
  //    insert 'table on the message' or something like this that make sense, so it not just skipped"*. He is
  //    right, and the reason is that a listener cannot see the gap: silence where a table was is
  //    indistinguishable from the reply simply moving on, so the audio quietly misrepresents the answer as
  //    having fewer parts than it has. The `x-audio-omitted` header already told the SCREEN what was dropped —
  //    but someone listening is not looking at the screen, which is the whole point of speaking it.
  //    Kept to one short sentence: it must not compete with the content, and a full sentence means the piece
  //    splitter treats it as a unit instead of cutting through it.
  //    ⚠ `(?:\n|$)` ON THE LAST LINE, NOT `\n`. The rule required EVERY row to end in a newline, so a table
  //    that is the last thing in a message — no trailing newline — had its FINAL ROW fall outside the block
  //    and get read aloud as bare content: "| 3 | 4 |" came back as "3 4." Found by the placeholder's own
  //    test, not by listening, and it was there before the placeholder was. The fenced-code rule two dozen
  //    lines up already guards this with `(?:```|$)`; the table rule was the one that did not. Every rep
  //    still consumes at least the `|` it matches on, so the alternation cannot spin.
  s = s.replace(/(?:^[^\n]*\|[^\n]*(?:\n|$)){2,}/gm, (block) => {
    if (!/\|/.test(block)) return block
    omitted.tables += 1
    return gapFor(lang, 'tables')
  })

  // 4b. ONE MENTION PER RUN. Blocks cluster — a fenced example followed by its output, three tables in a row —
  //     and announcing each one turns "look at the message" into a stutter ("Here, a code block in the message.
  //     Here, a code block in the message. Here, a…"). Adjacent mentions of the SAME kind collapse to one;
  //     mentions separated by actual prose stay separate, because those are two different things to look at.
  //     Different kinds never merge: a table and a code block are not interchangeable to someone looking.
  for (const kind of ['codeBlocks', 'tables', 'math']) {
    const sentence = SPOKEN_GAP[lang]?.[kind] ?? SPOKEN_GAP.en[kind]
    const escaped = sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    s = s.replace(new RegExp(`(?:${escaped}\\s*){2,}`, 'g'), `${sentence}\n`)
  }

  // 4c. ⚠ A REPLY THAT IS *ONLY* BLOCKS STAYS SILENT. The mentions describe where something sits IN a message;
  //     with no message around them they are the whole message, and "Here, a code block in the message." is a
  //     worse answer than saying nothing — there is no "here" to orient to.
  //     It also keeps the two cutters agreeing, which is the load-bearing reason. The LIVE path filters chunks
  //     with `hasProse()` on the RAW markdown before anything reaches this function, so a code-only chunk never
  //     arrives. If this function announced one anyway, the 🔊 button would speak a sentence that answer-with-
  //     speak stays silent for — the same two-paths-disagree bug that made nobody normalise at all.
  //     Guarded by three existing tests that predate the placeholder; they were right and stay unchanged.
  {
    let bare = s
    for (const kind of ['codeBlocks', 'tables', 'math']) {
      for (const l of Object.keys(SPOKEN_GAP)) bare = bare.split(SPOKEN_GAP[l][kind]).join(' ')
    }
    // Anything left that a voice could actually say? Letters, digits or Thai — not punctuation or space.
    if (!/[\p{L}\p{N}]/u.test(bare)) s = ''
  }

  // 5. Inline code KEEPS its contents (it is usually a name — `useMemory`, `--force`), minus the ticks.
  //    ⚠ THIS MUST RUN BEFORE THE URL RULE. With the order reversed, a URL inside inline code —
  //    `http://127.0.0.1:8310` — had its CLOSING backtick eaten by the URL match, which orphaned the
  //    opening one; the next inline-code pair then matched across the gap and left a stray backtick in
  //    the middle of a sentence. Fixing the order is the real fix; the tighter class below is the belt.
  //
  //    ⚠ EXCEPT WHEN IT IS A FORMULA. Ote's own reply was spoken as
  //        "cost_per_1M_tokens = ($/hr) / (tokens/sec × 3600) × 1,000,000"
  //    read out verbatim — underscores, slashes and all. That is notation, and this is the commonest way
  //    notation reaches the audio here, far commoner than LaTeX `$…$`: models write formulas in backticks.
  //
  //    THE RULE HAS TO BE CONSERVATIVE, because the failure mode is asymmetric. Losing a formula costs one
  //    signpost; eating an identifier changes what the sentence SAYS — `speechRate`, `num_ctx`, `--vram-floor`
  //    and `q8_0` all have to survive, and Ote's standing note is that `speechRate` must stay a word.
  //    So BOTH must hold: a SPACED equals (` = `), AND at least one arithmetic operator. Measured against the
  //    real vocabulary of this codebase:
  //      formula   `C = (H / A) + E` · `cost_per_1M_tokens = ($/hr) / (tokens/sec × 3600)` · `E = mc^2`
  //      NOT       `speechRate` · `num_ctx` · `--vram-floor` · `q8_0` · `qwen3.5:9b` · `1.15`
  //      NOT       `OLLAMA_KV_CACHE_TYPE=q8_0`  (unspaced `=`, so it is a setting, not an equation)
  //      NOT       `x = 1`                       (spaced `=` but no operator — reads fine as words)
  //    Anything that qualifies becomes the same signpost a DISPLAY formula gets, because to a listener it is
  //    the same thing: something on screen worth looking at. Everything else keeps its contents, as before.
  const INLINE_FORMULA = /^(?=.*\s=\s)(?=.*[+\-*/×÷^%])[\s\S]{8,}$/
  s = s.replace(/`([^`]+)`/g, (_m, inner) => {
    if (!INLINE_FORMULA.test(inner)) return inner
    omitted.math += 1
    return gapFor(lang, 'math')
  })

  // 6. Bare URLs and long paths → a word, not a spelling bee. The class stops at markdown/quote
  //    punctuation so a trailing ) ] ` " or ' stays with the prose it belongs to.
  //    A URL may legally contain a comma or full stop, but a TRAILING one is virtually always the
  //    sentence's punctuation, and swallowing it would remove the pause the listener needs. So the match
  //    keeps whatever trailing punctuation it consumed and hands it back.
  const asLink = (m) => `a link${(m.match(/[.,;:!?]+$/) || [''])[0]}`
  s = s.replace(/\bhttps?:\/\/[^\s`)\]<>"']+/gi, asLink)
  s = s.replace(/\bwww\.[^\s`)\]<>"']+/gi, asLink)

  // 6b. HORIZONTAL RULES, BEFORE EMPHASIS — the ordering is the whole fix.
  //     This used to live down in step 8 with the other block structure, and the dash form (`---`) worked
  //     because nothing else claims dashes. The other two did not: the single-asterisk italic rule below
  //     matched `***` as `*` + `*` + `*` and rewrote it to a lone `*`, and `___` went the same way through the
  //     underscore rule — so an asterisk or underscore rule reached the audio as one stray character, and by
  //     the time step 8 looked for a rule there was nothing rule-shaped left to find. Measured 2026-08-05:
  //     `***` -> `"*"`, `___` -> `"_"`.
  //     Same principle the fenced-code rule states at the top of this function: a rule that needs a whole
  //     BLOCK to recognise it must run before any inline rule can chew on its contents. Structure first,
  //     emphasis second — inline rules are the ones that cannot tell a marker from a delimiter.
  s = s.replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, '\n')

  // 7. Emphasis markers. Underscore emphasis only when it wraps a word, so snake_case names survive.
  s = s.replace(/(\*\*\*|___)(\S(?:[\s\S]*?\S)?)\1/g, '$2')
  s = s.replace(/(\*\*|__)(\S(?:[\s\S]*?\S)?)\1/g, '$2')
  s = s.replace(/~~(\S(?:[\s\S]*?\S)?)~~/g, '$1')
  s = s.replace(/(^|[\s(])\*(\S(?:[^*\n]*?\S)?)\*(?=[\s).,!?;:]|$)/g, '$1$2')
  s = s.replace(/(^|[\s(])_(\S(?:[^_\n]*?\S)?)_(?=[\s).,!?;:]|$)/g, '$1$2')

  // 7b. Task-list markers. `- [ ] todo` had its checkbox READ as "bracket bracket": the list marker was
  //     stripped but the box was not, so it survived into the audio.
  s = s.replace(/^\s*\[([ xX])\]\s+/gm, '')
  s = s.replace(/(^|\s)\[([ xX])\](?=\s)/g, '$1')

  // 7c. ASCII arrows read as punctuation noise ("0.45 dash greater-than 0.92"). "to" is what they mean in
  //     prose, and it is what a person would say out loud.
  s = s.replace(/\s(?:-{1,2}>|=>|→)\s/g, ' to ')
  s = s.replace(/\s(?:<-{1,2}|←)\s/g, ' from ')

  // 8. Block structure → sentences. Each becomes its own line so step 10 can punctuate it.
  s = s.replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, (_m, t) => `\n${stop(t)}\n`)   // headings
  s = s.replace(/^\s*>\s?/gm, '')                                          // blockquote markers
  // (horizontal rules are handled in 6b, ABOVE the emphasis rules — see the note there for why they cannot
  //  live here: two of the three forms were destroyed by inline emphasis before reaching this line)
  s = s.replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')                          // list markers

  // 8b. NUMBERS AND CURRENCY, now that the markdown is gone. Deliberately here and not earlier: expanding
  //     digits before code fences and tables are removed would spend work on text nobody hears, and would put
  //     Thai number words inside a block we are about to drop.
  s = expandNumbers(s, lang)

  // 9. Leftovers that are punctuation to the eye and noise to the ear.
  s = s.replace(EMOJI, '')
  s = s.replace(/[|]+/g, ' ')
  s = s.replace(/[ \t]{2,}/g, ' ')

  // 10. One fragment per line, joined with sentence stops so the engine breathes.
  //     ⚠ A stop is only added when there is something to SEPARATE. With a single fragment there is
  //     nothing to punctuate, and adding a '.' would be inventing punctuation the author never wrote —
  //     which matters most for Thai, where sentences legitimately end without any terminal mark
  //     (a lone "…ครับ" must stay "…ครับ", not become "…ครับ.").
  const parts = s.split('\n').map((l) => l.trim()).filter(Boolean)
  s = parts.length > 1 ? parts.map((l) => stop(l)).filter(Boolean).join(' ') : (parts[0] ?? '')
  s = s.replace(/\s+([.,!?;:])/g, '$1').replace(/([.!?])\.+/g, '$1').replace(/\s{2,}/g, ' ').trim()

  return { text: s, omitted, hadMarkdown: s !== before.trim() }
}

/** A short human sentence naming what was dropped, or '' when nothing was. For the UI to show. */
export function omissionNote({ codeBlocks = 0, tables = 0, images = 0, math = 0 } = {}) {
  const bits = []
  if (codeBlocks) bits.push(`${codeBlocks} code block${codeBlocks > 1 ? 's' : ''}`)
  if (tables) bits.push(`${tables} table${tables > 1 ? 's' : ''}`)
  if (images) bits.push(`${images} image${images > 1 ? 's' : ''}`)
  if (math) bits.push(`${math} formula${math > 1 ? 's' : ''}`)
  if (!bits.length) return ''
  return `${bits.join(' and ')} ${bits.length === 1 && !/s$/.test(bits[0]) ? 'was' : 'were'} skipped — read them on screen.`
}

// ── CHUNKING FOR CHUNK-AND-PLAY ───────────────────────────────────────────────────────────────────────
// Ote, 2026-08-04: *"ok, do that 'A · Chunk-and-play' first, i want to see improvement"*.
//
// WHY: a whole reply is rendered before a single sample plays, so a 1645-character answer means ~46s of
// silence. Split it into sentences, render one at a time, and start playing #1 while #2 renders. OmniVoice
// runs at RTF ~0.45 — roughly twice as fast as playback — so the player never catches up with the renderer.
// First sound goes from ~46s to ~2s WITHOUT the engine changing at all.
//
// Boundaries are chosen at SENTENCE ends, which matters twice over: a chunk that ends mid-clause sounds
// broken, and the small seam between two clips lands where a speaker would have paused anyway — so the
// joins are inaudible rather than merely tolerable.
//
// ⚠ THAI HAS NO INTER-WORD SPACES, so the usual "split on whitespace" fallback would cut mid-syllable.
// Thai sentences instead end on polite particles (ครับ / ค่ะ / คะ / นะ) or the ฯ mark, which are the real
// boundaries — and when none is within reach the split is length-based rather than space-based.
//
// Each chunk is cached on its OWN hash, so editing one sentence re-renders one sentence, and a re-press
// replays every chunk for free.

const TARGET = 220   // aim: ~15s of speech at ~14 chars/s — long enough to sound natural, short enough
const MAX = 480      // hard ceiling: a run-on sentence must not become a 40s chunk that defeats the point
const MIN = 40       // shorter than this is merged forwards; a 3-word clip is a stutter, not a sentence

// A boundary is punctuation followed by a space/end, OR a Thai politeness particle, OR the Thai ฯ.
//
// ⚠⚠ A COLON IS NOT A BOUNDARY — IT IS A CONTINUATION. Nobody stops at a colon; it promises what follows.
// This used to be `[;:](?=\s)`, and on Ote's four-round Thai research reply EIGHT OF TWELVE pieces ended on a
// colon, so every label was severed from the thing it introduced and delivered as two separate clips with a
// render boundary and a prosody reset between them:
//     piece 2 ends "… Round สอง:"        piece 3 opens "ลึกใน LangGraph — architecture …"
//     piece 7 ends "Human-in-the-Loop (HITL):"  piece 8 opens "Pause & approve …"
//     piece 10 ends "Emerging Players:"   piece 11 opens "AgentScope (Alibaba …"
// That is the SAME complaint he opened with — *"i dont hear it read these — Round 1: / Round 2: …"* — arriving
// by a second mechanism. The first was markdown glued at round boundaries; this one is the cutter volunteering
// the worst possible place to breathe. Every word was spoken both times; the structure was not.
//
// A semicolon STAYS: it ends a clause you can genuinely pause after. Only the colon is dropped, and nothing
// else needs to change — a passage with no sentence end in reach already falls through to the space cut and
// then the length cut, so a colon-only run still gets divided, just not AT the colon.
//
// ⚠ MIRRORED. Frontend/src/lib/speechStream.ts carries the same regex for the live streamer, and
// test/unit/speech-mirror.test.mjs runs both cutters over the same inputs and fails if they ever disagree.
// Change one, change the other, in the same commit.
const EN_END = /[.!?…](?=\s|$)|;(?=\s)/g
const TH_END = /(?:ครับ|ค่ะ|คะ|นะคะ|นะครับ|ฯ)/g

/**
 * Every candidate cut point, ascending, as offsets AFTER the boundary token.
 * Exported because the LIVE streamer needs the same rules on raw text (see stream-speech.js).
 */
export function boundaries(s) {
  const out = new Set()
  for (const re of [EN_END, TH_END]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(s)) !== null) {
      out.add(m.index + m[0].length)
      if (m.index === re.lastIndex) re.lastIndex += 1   // zero-width guard
    }
  }
  return [...out].sort((a, b) => a - b)
}

// ── WHERE A LIVE STREAM MAY BE CUT ────────────────────────────────────────────────────────────────────
// ⚠ THIS EXISTS BECAUSE OF A REAL FAILURE. Ote, 2026-08-04, on answer-with-speak: *"there's speaking going
// after the message end and it sound random"*. Two causes, and this half is the interesting one.
//
// Every rule in toSpeakable that removes a BLOCK needs the block WHOLE to recognise it: the table rule
// wants 2+ consecutive pipe lines, the fence rule wants both markers, indented code wants 2+ lines. The
// live streamer cut the raw stream at SENTENCE ends — and a table row ends in '?' as happily as a sentence
// does. So a table got split across pieces, each piece was normalised alone, neither half looked like a
// table any more, and the cells were read out as prose. Table cells spoken in column order is exactly what
// "random" sounds like.
//
// The fix is not a better table regex. It is that A CUT MAY NEVER LAND INSIDE A BLOCK, and a block that is
// still growing is not final text at all. That is a property of the CUT POINTS, so it belongs here beside
// the boundaries they are chosen from — not in the streamer, which now just asks.

const FENCE_MARK = /^\s{0,3}(```|~~~|\$\$)/
const INDENT_CODE = /^(?: {4}|\t)\S/

/**
 * The spans of `input` that are BLOCKS — regions toSpeakable can only handle in one piece.
 * Each is { start, end, kind, closed }. `closed: false` means a later delta could still extend it, so
 * nothing from its start onward is final yet.
 */
export function blockSpans(input) {
  const s = String(input ?? '')
  const spans = []
  const lines = []
  let at = 0
  for (const text of s.split('\n')) {
    lines.push({ text, start: at, end: Math.min(at + text.length + 1, s.length) })
    at += text.length + 1
  }
  const last = lines.length - 1
  // A following line proves the run ended — but a trailing '' (the buffer just ends in \n) proves nothing,
  // and neither does an unterminated line that has not yet shown its hand. Prose that already contains a
  // non-pipe character HAS: a table cannot resume after it.
  const endsRun = (j, isPipe) => {
    const n = lines[j + 1]
    if (!n) return false
    if (j + 1 < last) return true
    return isPipe ? Boolean(n.text.trim()) && !n.text.includes('|') : Boolean(n.text.trim())
  }
  let i = 0
  while (i < lines.length) {
    const L = lines[i]
    const fence = L.text.match(FENCE_MARK)
    if (fence) {
      // A one-line ```code``` or $$x$$ is already whole — toSpeakable handles it, so it is not a span.
      const rest = L.text.trim().slice(fence[1].length)
      if (rest.includes(fence[1])) { i += 1; continue }
      let j = i + 1
      while (j < lines.length && !lines[j].text.includes(fence[1])) j += 1
      const closed = j < lines.length
      spans.push({ start: L.start, end: closed ? lines[j].end : s.length, kind: 'fence', closed })
      i = closed ? j + 1 : lines.length
      continue
    }
    if (L.text.includes('|') || INDENT_CODE.test(L.text)) {
      const isPipe = L.text.includes('|')
      const same = (t) => (isPipe ? t.includes('|') : INDENT_CODE.test(t))
      let j = i
      while (j + 1 < lines.length && same(lines[j + 1].text)) j += 1
      spans.push({ start: L.start, end: lines[j].end, kind: isPipe ? 'table' : 'code', closed: endsRun(j, isPipe) })
      i = j + 1
      continue
    }
    i += 1
  }
  return spans
}

/**
 * Cut points a LIVE streamer may use, given the raw text it holds so far.
 *
 *   cuts      — sentence boundaries that are not inside a block, plus the end of each finished block
 *   blockEnds — just the block ends, so a block wider than the size window can still be taken WHOLE
 *   safeEnd   — nothing at or after this offset is final; an unclosed block starts here (or s.length)
 *   spans     — the blocks themselves, so a caller can measure SPEAKABLE length (see proseLen)
 */
export function speakCuts(input) {
  const s = String(input ?? '')
  const spans = blockSpans(s)
  const open = spans.find((b) => !b.closed)
  const safeEnd = open ? open.start : s.length
  const inside = (c) => spans.some((b) => c > b.start && c < b.end)
  const ends = spans.filter((b) => b.closed && b.end <= safeEnd).map((b) => b.end)
  const cuts = boundaries(s).filter((c) => c > 0 && c <= safeEnd && !inside(c)).concat(ends)
  return { cuts: [...new Set(cuts)].sort((a, b) => a - b), blockEnds: ends.sort((a, b) => a - b), safeEnd, spans }
}

/**
 * Characters up to `upTo` that will actually be SPOKEN — raw length minus the blocks inside it.
 *
 * ⚠ MEASURED, 2026-08-04. Ote: *"sometime it have a wait on those cut off text or something, it silence for a
 * bit on those table, i dont know why."* Because chunk sizes were counted in RAW characters while the buffer
 * that hides render latency is made of AUDIO SECONDS. One piece carried 317 characters and bought 1.91s of
 * speech — the rest was a table, which is dropped — and the next piece needed 7.4s to render. The player ran
 * dry, right at the table. Sizing the window by speakable length instead keeps every piece worth about the
 * same amount of audio, which is what the renderer is racing against.
 */
export function proseLen(spans, upTo) {
  let n = upTo
  for (const b of spans || []) {
    if (b.start >= upTo) break
    n -= Math.min(b.end, upTo) - b.start
  }
  return Math.max(0, n)
}

/** Is there anything in this raw text to say, once the blocks are taken out? Cheap pre-flight for a piece. */
export function hasProse(input) {
  const s = String(input ?? '')
  const spans = blockSpans(s)
  let out = ''
  let at = 0
  for (const b of spans) { out += s.slice(at, b.start); at = Math.max(at, b.end) }
  out += s.slice(at)
  return /[\p{L}\p{N}]/u.test(out.replace(/[#*_>`~|\-=+[\]().,:;!?'"\/\\]/g, ''))
}

/**
 * Split speakable prose into chunks for progressive playback.
 * Returns an array of non-empty strings whose concatenation is the input (modulo trimmed seams).
 */
export function chunkForSpeech(input, { target = TARGET, max, firstTarget } = {}) {
  // RAMPED SIZES: small first chunk, doubling to the target. Ote measured ~20s on a cold press and named
  // the cause himself — *"oh, might be becus it cold."* The first chunk is where the model load ALSO lands,
  // so it is the worst possible place to spend 600 characters. Ramping gets first sound early without
  // paying for it in prosody resets across the whole reply: only the opening is finely cut, and by the
  // third chunk the size is full, so the long middle of a reply flows as it would have anyway.
  // The ceiling is DERIVED from the target unless given. With a fixed MAX, raising the target did nothing
  // once it passed the ceiling — the cut window stayed 480 chars wide and every chunk came back the old
  // size, so the setting would have looked broken rather than ignored.
  max = max ?? Math.max(Math.round(target * 1.6), target + 80)
  // Default opening: a third of the target, floored at 150 so it is still a sentence or two rather than a
  // fragment, and never larger than the target itself (a small target must not be ramped UP).
  const first = Math.min(target, Math.max(150, firstTarget ?? Math.round(target / 3)))
  const targetAt = (i) => Math.min(target, first * Math.pow(2, i))
  const s = String(input ?? '').trim()
  if (!s) return []
  if (s.length <= first) return [s]

  const cuts = boundaries(s)
  const chunks = []
  let start = 0
  while (start < s.length) {
    const target = targetAt(chunks.length)   // ramps: first, first*2, … up to the configured target
    const remaining = s.length - start
    // Stop splitting once the tail is about one chunk long. ⚠ This compares against TARGET, not MAX:
    // using `remaining <= max` made 480 the real threshold, so a 392-character reply came back as ONE
    // chunk and the whole point (first sound early) was silently lost. The 1.3 slack avoids trading a
    // clean single tail for a chunk plus a runt.
    if (remaining <= target * 1.3) { chunks.push(s.slice(start).trim()); break }
    // Prefer the LAST boundary at or before target; accept one past target up to max rather than
    // splitting mid-sentence, because a natural seam is worth more than a tidy length.
    const within = cuts.filter((c) => c > start + MIN && c <= start + max)
    let cut = within.filter((c) => c <= start + target).pop() ?? within[0]
    if (cut == null) {
      // No sentence end in reach. Fall back to a space (English) — and if there is none, cut on length,
      // which is the Thai case and is why this cannot assume whitespace exists.
      const slice = s.slice(start, start + target)
      const sp = slice.lastIndexOf(' ')
      cut = start + (sp > MIN ? sp : target)
    }
    const piece = s.slice(start, cut).trim()
    if (piece) chunks.push(piece)
    start = cut
  }
  // Merge a runt tail into its predecessor: a trailing "Yes." as its own request is all overhead.
  if (chunks.length > 1 && chunks[chunks.length - 1].length < MIN) {
    const tail = chunks.pop()
    chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${tail}`.trim()
  }
  return chunks.filter(Boolean)
}
