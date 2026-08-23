// CUE FORMATION IN THE LANGUAGES SHE ACTUALLY CONVERSES IN.
//
// ⭐⭐⭐ THE BUG WAS NOT "ENGLISH-ONLY". IT WAS **ASCII-ONLY**, and that is a much larger and much more
// embarrassing fact. The topic split was `[^A-Za-z0-9'’-]+` — an ALLOWLIST of ASCII letters — so every
// letter outside ASCII was treated as a word SEPARATOR. Measured on 2026-08-23 across twelve languages:
//
//   ZERO tokens ⇒ the gate never opened   Russian · Greek · Hindi · Arabic · Hebrew · Korean · Thai · Japanese
//   SILENTLY CUT AT THE DIACRITIC          German "weißt"→"wei", "über"→"ber", "Straßenmusik"→"Stra"+"enmusik"
//                                          Spanish "conversación"→"conversaci"
//                                          Vietnamese "Bạn còn nhớ cuộc trò chuyện" → one fragment, "chuy"
//
// ⚠️ AND THIS IS A REPEAT. The same class of defect is already recorded in this project as *the
// ASCII-tokenizer whole-language outage*, and separately as *an explicit list silently drops everything it
// was not told about*. A character-class allowlist is an allowlist.
//
// ⭐ Ote: *"The cognition layer being English-only is unacceptable for Sotera. The activation mechanism needs
// to understand the languages she actually converses in, without introducing an unnecessary LLM
// classification pass if we can avoid it."* ⇒ `\p{L}\p{M}\p{N}` needs no model, no lexicon and no threshold.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formCues, hasCue, populationsFor } from '../../Backend/app/components/memory-cognition-cues.js'

const NAMES = ['Ote', 'Hermes', 'Kavi', 'Sotera', 'Mina']
const cue = (t) => formCues(t, { knownNames: NAMES })

// ── ⭐⭐⭐ THE OUTAGE, CLOSED ───────────────────────────────────────────────────────────────────────
// Each entry is a real question in that language plus one word that MUST survive tokenisation intact.
const LANGUAGES = [
  ['Spanish', '¿Qué recuerdas de la conversación?', 'conversación'],
  ['German', 'Was weißt du über Straßenmusik?', 'straßenmusik'],
  ['Vietnamese', 'Bạn còn nhớ cuộc trò chuyện không?', 'chuyện'],
  ['Russian', 'Что ты помнишь о нашем разговоре?', 'помнишь'],
  ['Greek', 'Τι θυμάσαι για τη συζήτηση;', 'συζήτηση'],
  ['Hindi', 'तुम्हें बातचीत के बारे में क्या याद है?', 'बातचीत'],
  ['Arabic', 'ماذا تتذكر عن محادثتنا؟', 'تتذكر'],
  ['Hebrew', 'מה אתה זוכר מהשיחה שלנו?', 'זוכר'],
  ['Korean', '우리 대화에서 무엇을 기억하나요?', '기억하나요'],
]

test('⭐⭐⭐ every space-delimited language forms cues and opens the gate', () => {
  for (const [lang, question] of LANGUAGES) {
    const c = cue(question)
    assert.ok(c.topics.length > 0, `${lang}: no topics formed — the gate would never open`)
    assert.equal(hasCue(c), true, `${lang}: gate closed`)
  }
})

test('⛔⛔ …and no word is cut in half at a diacritic — `\\p{M}` is as load-bearing as `\\p{L}`', () => {
  // ⚠️ THIS IS THE HALF THAT A NAIVE FIX MISSES. Combining marks (Thai tone marks, Devanagari matras, Arabic
  // diacritics, Hebrew niqqud) are `\p{M}`, not `\p{L}`. Omitting them does not blank a language out — it
  // shreds words from the inside, which is far harder to notice than silence.
  for (const [lang, question, mustSurvive] of LANGUAGES) {
    const c = cue(question)
    assert.ok(c.topics.includes(mustSurvive.toLowerCase()),
      `${lang}: "${mustSurvive}" did not survive intact — got [${c.topics.join(',')}]`)
  }
})

test('⛔ ENGLISH IS UNCHANGED — the fix must not move the behaviour it was not about', () => {
  // The four measured variants from 2026-08-21, asserted to form exactly what they formed before.
  for (const q of [
    'Have you talked with Hermes lately?',
    "How's Hermes doing?",
    'What have you and Hermes been talking about?',
    'Do you know what Hermes has been up to?',
  ]) {
    const c = cue(q)
    assert.deepEqual(c.persons, ['Hermes'], q)
    assert.equal(hasCue(c), true)
    assert.deepEqual(c.unsegmented, [], 'and nothing about English is "unsegmented"')
  }
  const tech = cue('How does your memory work?')
  assert.equal(tech.technical, true)
  assert.deepEqual(tech.topics, ['memory', 'work'])
})

// ── ⚠️⚠️ SCRIPTS WITH NO INTER-WORD SPACES · A NAMED DECISION, NOT AN ACCIDENT ─────────────────────
const SEGMENTLESS_CASES = [
  ['Thai', 'เราคุยเรื่องอะไรกันบ้างเมื่อวานนี้'],
  ['Japanese', '記憶はどう機能しますか'],
  ['Chinese', '你还记得我们的谈话吗'],
]

test('⭐⭐ a segmentless-script turn is SEEN as that script, not seen as empty', () => {
  for (const [lang, q] of SEGMENTLESS_CASES) {
    const c = cue(q)
    assert.ok(c.scripts.includes('segmentless'), `${lang}: the turn must be recognised as segmentless`)
    assert.ok(c.unsegmented.length > 0, `${lang}: the unsplittable run must be REPORTED`)
  }
  assert.ok(cue('เราคุยเรื่องอะไร').scripts.includes('thai'))
})

test('⛔⛔ …and it does NOT open the gate, because a clause-as-topic guarantees a FALSE ABSENCE', () => {
  // ⭐ THE REASONING, WHICH IS THE POINT OF THIS TEST. A whole Thai clause as a "topic" matches nothing in
  // the record as a substring, so the relevance floor downstream drops every candidate and the turn renders
  // as *"I went looking … and came up with nothing"*. ⛔ A false absence is strictly worse than silence: a
  // silence claims nothing, while a false absence claims a search that could not have succeeded.
  // ⓘ Two alternatives were MEASURED on her own 167 Thai messages and both fail to separate — character
  // n-grams (FPR 86% at n=5, 96% at n=3) and a cosine floor (already refuted in self-history-host.js, where
  // Thai .450 sits below takraw .521). ⇒ this stays a reported gap, not a guessed threshold.
  for (const [lang, q] of SEGMENTLESS_CASES) {
    assert.equal(hasCue(cue(q)), false, `${lang}: must not activate without a resolvable cue`)
  }
})

test('⭐⭐ but a segmentless turn that NAMES someone works end to end — that is 34% of her Thai', () => {
  const c = cue('Hermes เป็นอย่างไรบ้าง')
  assert.deepEqual(c.persons, ['Hermes'])
  assert.equal(hasCue(c), true, 'a person cue is script-independent and does all the work')
  assert.ok(c.scripts.includes('thai') && c.scripts.includes('latin'))
  // ⭐ And the floor downstream uses the NAME, which is comparable in any script.
  assert.deepEqual(c.topics, [], 'no Thai clause leaked in as a topic')
})

// ── ⭐ THE TWO THAI PATTERN LISTS ──────────────────────────────────────────────────────────────────
test('⭐⭐ she can be asked in Thai how her memory works', () => {
  for (const q of [
    'ความทรงจำของคุณทำงานยังไง',
    'ความจำของคุณทำงานอย่างไร',
    'อธิบายความทรงจำของคุณหน่อย',
  ]) {
    assert.equal(cue(q).technical, true, `not flagged technical: ${q}`)
  }
  // ⚠️ WHY THIS MATTERS MORE THAN IT LOOKS: `technical` is what exempts the block from the vocabulary guard,
  // so missing it means the whole block is WITHHELD rather than merely worded badly.
  assert.equal(cue('เฮอร์เมสเป็นอย่างไร').technical, false, 'an ordinary Thai question is not technical')
})

test('⭐ Thai recency words are read, and stay a hint', () => {
  assert.equal(cue('เราคุยอะไรกันเมื่อวานนี้').recency, 'yesterday')
  assert.equal(cue('ล่าสุดคุยกับ Hermes เรื่องอะไร').recency, 'recent')
  assert.equal(cue('ตอนนี้คุณรู้อะไรบ้าง').recency, 'now')
  // ⛔ A recency hint alone never opens the gate — it is a preference, not a handle on anything.
  assert.equal(hasCue(cue('เมื่อวานนี้')), false)
})

// ── ⛔ AND THE FILE'S ORIGINAL PROMISES STILL HOLD ─────────────────────────────────────────────────
const SRC_RAW = readFileSync(new URL('../../Backend/app/components/memory-cognition-cues.js', import.meta.url), 'utf8')
const SRC = SRC_RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')

test('⛔⛔ the multilingual fix introduced NO model call and NO intent classifier', () => {
  // Ote: "without introducing an unnecessary LLM classification pass if we can avoid it."
  assert.ok(!/fetch|ollama|generate|embed|await |async /.test(SRC),
    'cue formation must stay pure and synchronous — a model here is a second guess in front of a first one')
  const c = cue('ความทรงจำของคุณทำงานยังไง')
  assert.ok(!('intent' in c), 'a cue is a handle on the world, never a category of question')
  assert.ok(!('language' in c), 'and not a language label either — `scripts` is observability, not a branch')
})

test('populations are warranted the same way regardless of script', () => {
  const en = populationsFor(cue('How does your memory work?'))
  const th = populationsFor(cue('ความทรงจำของคุณทำงานยังไง Hermes'))
  assert.ok(en.includes('lessons'), 'a technical question reaches her lessons')
  assert.ok(th.includes('lessons'), 'and it does so in Thai too')
})

test('odd and mixed input does not throw', () => {
  for (const v of [null, undefined, '', '   ', '¿?', 'ๆ', '記', 123]) {
    assert.doesNotThrow(() => formCues(v, { knownNames: NAMES }))
  }
  const c = formCues('  ', { knownNames: NAMES })
  assert.deepEqual(c.unsegmented, [])
  assert.deepEqual(c.scripts, [])
})
