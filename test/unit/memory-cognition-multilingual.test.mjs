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
import {
  formCues, hasCue, populationsFor, canSegment, mayClaimAboutness,
} from '../../Backend/app/components/memory-cognition-cues.js'

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

test('⭐⭐⭐ STEP B · a segmentless turn now activates, on REAL WORDS from `Intl.Segmenter`', () => {
  // ⭐⭐ IT NEEDED NO DEPENDENCY. Ote asked to check the workspace first (option B3); ICU's own
  // dictionary-based word segmentation ships with Node, so there is no package, no lexicon of ours, no
  // threshold and no model.
  const th = cue('เราคุยเรื่องอะไรกันบ้างเมื่อวานนี้')
  assert.equal(hasCue(th), true, 'a Thai-only turn must activate')
  assert.ok(th.topics.length > 0 && th.topics.every((t) => /[฀-๿]/.test(t)),
    `real Thai words, not a clause: ${JSON.stringify(th.topics)}`)
  // ⛔ AND NOT THE WHOLE CLAUSE AS ONE "TOPIC" — that was the false-absence machine.
  assert.ok(!th.topics.some((t) => t.length > 12), `a clause leaked in as a topic: ${JSON.stringify(th.topics)}`)
  for (const [lang, q] of SEGMENTLESS_CASES) {
    const c = cue(q)
    assert.equal(hasCue(c), true, `${lang}: must activate`)
    assert.ok(c.scripts.includes('segmented'), `${lang}: segmentation must have run`)
    assert.ok(c.unsegmented.length > 0, `${lang}: the run is still REPORTED — observability was kept`)
  }
})

test('⛔⛔ …and the RELEVANCE FLOOR WAS NOT WEAKENED — that is the ruling this respects', () => {
  // ⭐ Ote ratified safe silence over activating without a usable cue, and refused option B (drop the
  // floor). ⇒ the gate opens because cue formation now produces REAL WORDS, not because anything was
  // lowered: Thai topics go through the SAME `terms` → `hay.includes(t)` path as English topics.
  assert.ok(SRC_RAW.includes('REFUSED, not pending'), 'the refusal of option B must still stand in writing')
  // ⛔ Nothing in cue formation may score, threshold or rank — the refuted alternatives all did.
  assert.ok(!/minSim|threshold|score|ngram|nGram|cosine/i.test(SRC), 'no threshold may have crept in')
})

test('⛔ AND THE FALLBACK IS THE RATIFIED SILENCE, not a crash and not a guess', () => {
  // ⚠️ A runtime without `Intl.Segmenter` or without full ICU must degrade to the PREVIOUS behaviour —
  // no cues for a segmentless turn — which is exactly the safe silence Ote chose. ⭐ The degradation being
  // the previously-ratified behaviour is what makes it safe rather than merely tolerable.
  assert.equal(typeof canSegment, 'function')
  assert.equal(canSegment(), true, 'this runtime has it; the guard below is what protects one that does not')
  assert.ok(/catch \{ s = null \}|catch \{ return \[\] \}/.test(SRC),
    'construction and segmentation must both be wrapped — a missing segmenter is not an exception path')
  assert.ok(SRC.includes("'segmenter-unavailable'"), 'and the unavailable case must be OBSERVABLE, not silent')
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

// ══ ⭐⭐⭐ THE THIRD SILENCE · A CUE WE MANUFACTURED MAY NOT CARRY AN ABOUTNESS CLAIM ════════════════
//
// ⚠️⚠️ MEASURED THE MOMENT SEGMENTATION SHIPPED. ICU splits ความทรงจำ ("memory") into ความ / ทรง / จำ, so a
// Thai turn about memory produced topics `["ทรง","จำ","ทำงาน"]`, the floor dropped all 8 candidates, and the
// block rendered:
//     "I went looking for what I have about ทรง and came up with nothing."
// ⛔ A FALSE ABSENCE WHOSE SUBJECT IS A FRAGMENT OF OUR OWN MAKING — which is precisely what Ote's ruling
// forbids: *"I'd rather Sotera not activate and not invent an aboutness claim."*
//
// ⭐ THE DISCRIMINATOR IS PROVENANCE, NOT LENGTH. A token the PERSON typed can honestly carry an absence;
// one we produced by splitting cannot. ⛔ Not a tuned threshold — a fact about where the cue came from.

test('⭐⭐⭐ a segmented cue is recorded as DERIVED, and a typed one is not', () => {
  const th = cue('ความทรงจำของคุณทำงานยังไง')
  assert.ok(th.derivedTopics.length > 0, 'segmented words must be marked as ours')
  assert.deepEqual([...th.topics].sort(), [...th.derivedTopics].sort(),
    'every topic in this turn was manufactured by splitting')
  const en = cue('What do you remember about Hermes?')
  assert.deepEqual(en.derivedTopics, [], 'nothing the person typed is derived')
})

test('⭐⭐⭐ …so a derived-only cue set may NOT claim aboutness', () => {
  assert.equal(mayClaimAboutness(cue('ความทรงจำของคุณทำงานยังไง')), false)
  assert.equal(mayClaimAboutness(cue('คุณจำอะไรเกี่ยวกับผมได้บ้าง')), false)
})

test('⛔⛔ …but a TYPED cue still carries its absence honestly — this is the narrow part', () => {
  // ⚠️ *"I went looking for Zephyrine and came up with nothing"* is TRUE and USEFUL, and
  // `memory-cognition-check` §5 asserts it. A blanket "empty ⇒ say nothing" rule would have broken it.
  assert.equal(mayClaimAboutness(cue('What has Zephyrine been up to?')), true)
  assert.equal(mayClaimAboutness(cue("How's Hermes doing?")), true, 'a person cue always may')
  // ⭐ And a MIXED turn may, because the Latin half is the person's own word.
  assert.equal(mayClaimAboutness(cue('ช่วยเล่าเรื่อง pattern matching หน่อย')), true)
})

test('⛔ nothing and nonsense do not claim aboutness either', () => {
  assert.equal(mayClaimAboutness(cue('ok thanks')), false)
  assert.equal(mayClaimAboutness(null), false)
  assert.equal(mayClaimAboutness({}), false)
})

test('⭐ a Thai turn with a SUBSTANTIVE word still activates and may claim it', () => {
  // ⓘ Not everything Thai is a fragment: มิตรภาพ (friendship) and เพื่อน (friend) are whole words, and they
  // are still DERIVED, so this turn activates and retrieves but does not get to name a subject on its own.
  const c = cue('คุยกับเพื่อนเรื่องมิตรภาพและความทรงจำ')
  assert.equal(hasCue(c), true)
  assert.ok(c.topics.includes('มิตรภาพ') && c.topics.includes('เพื่อน'))
  assert.equal(mayClaimAboutness(c), false, 'derived is derived, however good the word')
})

test('⛔ the ABOUT phrase prefers a typed cue over a manufactured one', () => {
  // ⚠️ Measured in English too, and parked at Ote's instruction: *"talking about remember"*. The renderer
  // must reach for a derived fragment only as a last resort.
  const HOST = readFileSync(new URL('../../Backend/app/components/memory-cognition-host.js', import.meta.url), 'utf8')
  const fn = HOST.slice(HOST.indexOf('const about0 = (cues)'), HOST.indexOf('const MONTHS'))
  assert.ok(/derivedTopics/.test(fn), 'about0 must know which cues it made up')
  assert.ok(/find\(\(t\) => !derived\.has\(t\)\)/.test(fn), 'and prefer the ones it did not')
})
