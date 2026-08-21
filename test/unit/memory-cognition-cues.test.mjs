// CUE FORMATION — build item 3a. Pure, so the four failing phrasings can be tested with no model at all.
//
// ⭐ THE FIXTURES ARE THE REAL QUESTIONS. These four produced 4, 5, 6 and 8 tool calls and two incompatible
// beliefs about her own access on 2026-08-21. If cue formation is not identical across all four, the
// variance never had a chance to collapse.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formCues, hasCue, populationsFor } from '../../Backend/app/components/memory-cognition-cues.js'

const KNOWN = ['Hermes', 'Kavi', 'Mina', 'Ote', 'Claude']

// ── ⭐⭐⭐ THE VARIANCE TEST, MOVED UPSTREAM ────────────────────────────────────────────────────────
const VARIANTS = [
  'Have you talked with Hermes lately?',
  "How's Hermes doing?",
  'What have you and Hermes been talking about?',
  'Do you know what Hermes has been up to?',
]

test('⭐⭐⭐ all four failing phrasings form the SAME person cue', () => {
  for (const v of VARIANTS) {
    const c = formCues(v, { knownNames: KNOWN })
    assert.deepEqual(c.persons, ['Hermes'], `"${v}" must resolve Hermes`)
    assert.equal(hasCue(c), true)
  }
})

test('⭐⭐ …and warrant the SAME populations — the orchestration no longer varies with wording', () => {
  const sets = VARIANTS.map((v) => populationsFor(formCues(v, { knownNames: KNOWN })).sort().join(','))
  assert.equal(new Set(sets).size, 1, `four phrasings produced ${new Set(sets).size} different plans: ${JSON.stringify(sets)}`)
  const one = populationsFor(formCues(VARIANTS[0], { knownNames: KNOWN }))
  for (const p of ['working-set', 'semantic', 'own-history']) {
    assert.ok(one.includes(p), `${p} must always be activated for a person question`)
  }
})

// ── NAME RESOLUTION ────────────────────────────────────────────────────────────────────────────────
test('⛔ a capitalised word that resolves to nobody is a topic, not a person', () => {
  const c = formCues('How is Barcelona treating you?', { knownNames: KNOWN })
  assert.deepEqual(c.persons, [], 'we do not invent people')
  assert.ok(c.topics.includes('barcelona'))
})

test('⛔ the sentence opener is not a name — this is why the stop-list exists', () => {
  // "Have", "How", "Do", "What" all arrive capitalised at the start of the four real variants.
  for (const v of VARIANTS) {
    const c = formCues(v, { knownNames: KNOWN })
    for (const bad of ['have', 'how', 'do', 'what']) {
      assert.ok(!c.persons.map((p) => p.toLowerCase()).includes(bad), `"${bad}" must never become a person`)
      assert.ok(!c.topics.includes(bad), `"${bad}" must not survive as a topic either`)
    }
  }
})

test('a name resolves in any case, and does not match inside a longer word', () => {
  assert.deepEqual(formCues('what did hermes say', { knownNames: KNOWN }).persons, ['Hermes'])
  assert.deepEqual(formCues('HERMES!', { knownNames: KNOWN }).persons, ['Hermes'])
  assert.deepEqual(formCues('I met Kavita yesterday', { knownNames: KNOWN }).persons, [],
    '"Kavi" must not match inside "Kavita"')
})

test('several known people in one question all resolve', () => {
  const c = formCues('Do Kavi and Mina know each other?', { knownNames: KNOWN })
  assert.deepEqual(c.persons.sort(), ['Kavi', 'Mina'])
})

test('⛔ an empty knownNames list resolves nobody — resolution is against people she has, not a guess', () => {
  assert.deepEqual(formCues("How's Hermes doing?", { knownNames: [] }).persons, [])
  assert.deepEqual(formCues("How's Hermes doing?").persons, [])
})

// ── RECENCY ────────────────────────────────────────────────────────────────────────────────────────
test('recency is read from ordinary words, and stays a hint', () => {
  assert.equal(formCues('Have you talked with Hermes lately?', { knownNames: KNOWN }).recency, 'recent')
  assert.equal(formCues('What did you two talk about yesterday?', { knownNames: KNOWN }).recency, 'yesterday')
  assert.equal(formCues('Have you ever met Hermes?', { knownNames: KNOWN }).recency, 'any')
  assert.equal(formCues("How's Hermes doing?", { knownNames: KNOWN }).recency, null, 'no time word, no hint')
})

// ── ⭐ THE TECHNICAL EXEMPTION ─────────────────────────────────────────────────────────────────────
test('⭐⭐ "how does your memory work?" is flagged technical — the machinery may come out for that one', () => {
  for (const q of [
    'How does your memory work?',
    'how do you remember things?',
    'Explain your memory architecture',
    'How does that work?',
  ]) {
    assert.equal(formCues(q, { knownNames: KNOWN }).technical, true, `"${q}" should be technical`)
  }
})

test('⛔ …and an ordinary question about a person is NOT technical', () => {
  for (const v of VARIANTS) {
    assert.equal(formCues(v, { knownNames: KNOWN }).technical, false,
      `"${v}" must not license architecture talk`)
  }
})

test('a technical question still activates her lessons — it is about her too', () => {
  const pops = populationsFor(formCues('How does your memory work?', { knownNames: KNOWN }))
  assert.ok(pops.includes('lessons'))
})

// ── ⭐⭐ THE TWO SILENCES ──────────────────────────────────────────────────────────────────────────
test('⭐⭐ nothing resolved ⇒ no cue ⇒ nothing is claimed', () => {
  // Ote: a turn where we did not look must not say "I found nothing" — that would be a lie about a search
  // that never happened.
  for (const v of ['ok', 'thanks!', 'yes', '', '   ', 'hi']) {
    const c = formCues(v, { knownNames: KNOWN })
    assert.equal(hasCue(c), false, `"${v}" should form no cue`)
    assert.deepEqual(populationsFor(c), [], 'no cue means no activation at all')
  }
})

test('a real question always forms a cue, even with no known names', () => {
  const c = formCues('what did we decide about the deployment order?', { knownNames: [] })
  assert.equal(hasCue(c), true)
  assert.ok(c.topics.length > 0)
})

// ── ⛔ NO INTENT TAXONOMY ESCAPES ──────────────────────────────────────────────────────────────────
test('⛔ the cue object exposes no question-type label — cues are handles on the world, not categories', () => {
  const c = formCues("How's Hermes doing?", { knownNames: KNOWN })
  assert.deepEqual(Object.keys(c).sort(), ['persons', 'raw', 'recency', 'technical', 'topics'])
  assert.equal('intent' in c, false, 'the moment this has an intent field we have built a classifier')
  assert.equal('questionType' in c, false)
})

test('odd input does not throw', () => {
  for (const v of [null, undefined, 0, {}, []]) {
    assert.doesNotThrow(() => formCues(v, { knownNames: KNOWN }))
  }
})
