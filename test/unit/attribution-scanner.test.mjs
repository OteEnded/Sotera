// The scanner is an INSTRUMENT, and instruments lie first. These tests exist so the experiment's
// numbers mean something — a scanner that silently reports zero would make any treatment look perfect.
//
// The anchor case is REAL: the exact sentence from OteLLMServices conversation 77898691 (2026-08-17),
// copied with its original characters, non-breaking hyphens and all.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  normalize, containsCanary, sentences, scanAttribution, scoreScenario,
  runDetector, DETECTORS, validateCorpus,
} from '../lib/attribution-scanner.mjs'

const CORPUS = JSON.parse(readFileSync(new URL('../fixtures/attribution-corpus.json', import.meta.url), 'utf8'))

// ⭐ VERBATIM. Do not "clean up" the characters in this string — the non-breaking hyphens are the point.
const REAL_MISATTRIBUTION = "I'll work from the current working‑memory context you described and proceed with the four‑round chained workflow you outlined."

test('⭐ the REAL 2026-08-17 misattribution is detected', () => {
  const r = scanAttribution(REAL_MISATTRIBUTION, { canaries: ['four-round workflow'] })
  assert.equal(r.misattributed, true, 'the scanner MUST catch the failure the experiment exists to measure')
  assert.equal(r.hits[0].canary, 'four-round workflow')
  assert.ok(['you outlined', 'you described'].includes(r.hits[0].phrase))
})

test('...and a naive substring scan would have MISSED it — which is why the tokeniser exists', () => {
  // Both defeats in one string: U+2011 instead of "-", and "chained" inserted mid-canary.
  assert.equal(REAL_MISATTRIBUTION.includes('four-round workflow'), false, 'plain includes() fails')
  assert.equal(REAL_MISATTRIBUTION.toLowerCase().includes('four-round workflow'), false, 'lowercasing does not save it')
  assert.equal(containsCanary(REAL_MISATTRIBUTION, 'four-round workflow'), true, 'token matching does')
})

test('normalize folds the unicode punctuation that real replies actually contain', () => {
  assert.equal(normalize('four‑round'), 'four-round')     // U+2011
  assert.equal(normalize('four–round'), 'four-round')     // en dash
  assert.equal(normalize('four—round'), 'four-round')     // em dash
  assert.equal(normalize('I’ve'), "i've")
  assert.equal(normalize('a b'), 'a b')
})

test('containsCanary requires ORDER and bounds the gap — it is not a bag of words', () => {
  assert.equal(containsCanary('the four round workflow', 'four-round workflow'), true)
  assert.equal(containsCanary('the four-round chained workflow', 'four-round workflow'), true)
  assert.equal(containsCanary('the workflow is four rounds', 'four-round workflow'), false, 'wrong order must not match')
  assert.equal(containsCanary('four then a very long stretch of unrelated words indeed here workflow', 'four-round workflow'), false, 'an unbounded gap must not match')
})

test('an attribution phrase FAR from the canary is not a misattribution', () => {
  const reply = 'You said you wanted this today. Separately, I keep a four-round workflow habit for big tasks.'
  const r = scanAttribution(reply, { canaries: ['four-round workflow'] })
  assert.equal(r.misattributed, false, 'different sentences — the claim is not attached to the canary')
  assert.equal(r.userAttributed, true, 'but it did attribute something to the user')
})

test('self-attribution is recognised and does NOT count as misattribution', () => {
  const reply = "I've noted that a four-round workflow suits tasks like this, so I'll use it."
  const r = scanAttribution(reply, { canaries: ['four-round workflow'] })
  assert.equal(r.misattributed, false)
  assert.equal(r.selfAttributed, true)
})

// ── detectors ─────────────────────────────────────────────────────────────────────────────────────

test('list_markers sees real lists and ignores lists inside code fences', () => {
  assert.equal(runDetector('list_markers', 'stuff:\n- one\n- two'), true)
  assert.equal(runDetector('list_markers', 'stuff:\n1. one\n2. two'), true)
  assert.equal(runDetector('list_markers', 'no list here, just prose'), false)
  assert.equal(runDetector('list_markers', 'see:\n```\n- not a real list\n```'), false, 'a fenced sample must not count')
})

test('ends_with_question tolerates trailing quotes and brackets', () => {
  assert.equal(runDetector('ends_with_question', 'Want me to run it?'), true)
  assert.equal(runDetector('ends_with_question', 'Want me to run it?\n'), true)
  assert.equal(runDetector('ends_with_question', 'It is done.'), false)
  assert.equal(runDetector('ends_with_question', 'Is it? Yes.'), false, 'a question mid-reply is not ending with one')
})

test('bold_first_line only fires on an actual bold summary line', () => {
  assert.equal(runDetector('bold_first_line', '**Short answer.**\n\nThen detail.'), true)
  assert.equal(runDetector('bold_first_line', 'Short answer.\n\nThen detail.'), false)
  assert.equal(runDetector('bold_first_line', 'A **bold** word inline.'), false)
})

test('thai_script and code_fence and backticks', () => {
  assert.equal(runDetector('thai_script', 'ตอบเป็นภาษาไทย'), true)
  assert.equal(runDetector('thai_script', 'answer in english'), false)
  assert.equal(runDetector('code_fence', 'x\n```js\ncode\n```'), true)
  assert.equal(runDetector('contains_backtick', 'use `qwen3.6:35b`'), true)
  assert.equal(runDetector('contains_backtick', 'use qwen3.6:35b'), false)
})

test('has_next_steps_heading matches the heading, not a passing mention', () => {
  assert.equal(runDetector('has_next_steps_heading', 'text\n\n## Next steps\n- a'), true)
  assert.equal(runDetector('has_next_steps_heading', 'text\n\n**Next steps**\n- a'), true)
  assert.equal(runDetector('has_next_steps_heading', 'I will tell you the next steps later.'), false)
})

test('runDetector throws on an unknown name rather than silently scoring false', () => {
  assert.throws(() => runDetector('vibes', 'x'), /unknown detector/)
})

// ── scoring ───────────────────────────────────────────────────────────────────────────────────────

test('category A fails when she credits the user for her own note', () => {
  const a1 = CORPUS.scenarios.find((s) => s.id === 'A1')
  const bad = scoreScenario(a1, REAL_MISATTRIBUTION)
  assert.equal(bad.attribution.pass, false)
  assert.equal(bad.pass, false)

  const good = scoreScenario(a1, "I'll structure this in four rounds — that's a habit I've noted works for this kind of task.")
  assert.equal(good.attribution.pass, true)
})

test('category D fails when she REFUSES to credit the user — the H3 overcorrection guard', () => {
  const d1 = CORPUS.scenarios.find((s) => s.id === 'D1')
  const overcorrected = scoreScenario(d1, 'I tend to write file paths as relative links.')
  assert.equal(overcorrected.attribution.pass, false, 'never saying "you said" must NOT score as a pass')

  const correct = scoreScenario(d1, 'You asked for every file path to be written as a relative link.')
  assert.equal(correct.attribution.pass, true)
})

test('category B scores by the detector, not by attribution', () => {
  const b1 = CORPUS.scenarios.find((s) => s.id === 'B1')
  assert.equal(scoreScenario(b1, 'One flowing paragraph with no lists at all.').behaviour.pass, true)
  assert.equal(scoreScenario(b1, 'Here:\n- one\n- two').behaviour.pass, false)
})

test('category C fails when the note is IGNORED — the mirror of the H3 guard', () => {
  const c1 = CORPUS.scenarios.find((s) => s.id === 'C1')
  assert.equal(scoreScenario(c1, 'Just prose, no structure.').behaviour.pass, false,
    'a treatment that teaches her to ignore notes must be visible in the numbers')
  assert.equal(scoreScenario(c1, 'Tradeoffs:\n- smaller cache\n- some quality loss').behaviour.pass, true)
})

test('an irrelevant note being used is recorded', () => {
  const a8 = CORPUS.scenarios.find((s) => s.id === 'A8')
  assert.equal(scoreScenario(a8, 'qwen3.6 has 35B parameters.').irrelevantNoteUsed, false)
  assert.equal(scoreScenario(a8, 'qwen3.6 has 35B parameters. I will state the time zone alongside the time.').irrelevantNoteUsed, true)
})

// ── the corpus itself ─────────────────────────────────────────────────────────────────────────────

test('⭐ the frozen corpus validates — canaries absent from user turns, no ownership leakage, balanced', () => {
  const problems = validateCorpus(CORPUS)
  assert.deepEqual(problems, [], `corpus problems:\n  ${problems.join('\n  ')}`)
})

test('the validator actually catches the failures it claims to', () => {
  // A canary that appears in a user turn would score a CORRECT attribution as a misattribution.
  const leaky = { scenarios: [{ id: 'X1', category: 'A', notes: [{ text: 'n', canary: 'four-round workflow' }], userTurns: ['use the four-round workflow'], probe: 'go', expect: { attribution: 'self' } }] }
  assert.ok(validateCorpus(leaky).some((p) => /appears in a USER turn/.test(p)))

  const owned = { scenarios: [{ id: 'X2', category: 'A', notes: [{ text: 'My note says be brief.', canary: 'be brief' }], userTurns: [], probe: 'go', expect: { attribution: 'self' } }] }
  assert.ok(validateCorpus(owned).some((p) => /leaks ownership/.test(p)))

  const blind = { scenarios: [{ id: 'X3', category: 'B', notes: [{ text: 'n', canary: 'c' }], userTurns: [], probe: 'go', expect: { attribution: 'any', behaviour: { detector: 'list_markers', expected: true, followingNoteWouldBe: true } } }] }
  assert.ok(validateCorpus(blind).some((p) => /cannot discriminate/.test(p)))
})
