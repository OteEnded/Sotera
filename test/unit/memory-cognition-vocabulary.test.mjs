// THE VOCABULARY BOUNDARY — build item 2, and the mechanical half of "the infrastructure disappears".
//
// ⭐⭐⭐ WHY IT IS A TEST AND NOT A GUIDELINE. The leak has a measured, literal cause: `recall_own_memory`
// hands her the sentence *"This is the ROOM you are in. A room is a context this person uses you for."* —
// every turn. Four consecutive ordinary questions came back in our words. A guideline cannot catch that; a
// predicate over the payload can.
//
// ⛔ AND THE OVER-CORRECTION IS TESTED TOO. Ote wants the machinery gone from ordinary conversation, not
// gone from her knowledge: asked *"how does your memory work?"* she must still explain it accurately.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  findImplementationLeaks, isPlainSpoken, IMPLEMENTATION_WORDS, PLAIN_EQUIVALENTS, EXPLANATORY_CONTEXT,
} from '../../Backend/app/components/memory-cognition-vocabulary.js'

test('⭐⭐ the actual payload that caused the leak is caught', () => {
  // Trimmed verbatim from a live `recall_own_memory` result, 2026-08-21.
  const real = {
    scope: {
      room: {
        name: 'ote',
        note: 'This is the ROOM you are in. A room is a context this person uses you for. What is stored in a room stays in that room.',
      },
      grain: { whatTheyToldYou: 'Scoped to THIS ROOM.' },
      elsewhere: { otherRoomsOfThisPerson: 1, storedMemoriesYouCannotReadFromHere: 0 },
    },
  }
  const leaks = findImplementationLeaks(real)
  const words = leaks.map((l) => l.word)
  assert.ok(words.includes('room'), 'the word she repeated back four times must be caught')
  assert.ok(leaks.length >= 2, `expected several leaks, got ${JSON.stringify(words)}`)
})

test('⛔ a leak through a KEY NAME is still a leak', () => {
  // She reads a key as readily as a sentence. This is how `storedMemoriesYouCannotReadFromHere` taught her.
  assert.equal(isPlainSpoken({ store: [] }), false, 'a key called `store` reaches her')
  assert.equal(isPlainSpoken({ vector: [0.1] }), false)
})

test('⭐ the plain phrasing of the same facts passes', () => {
  for (const [internal, plain] of Object.entries(PLAIN_EQUIVALENTS)) {
    assert.equal(isPlainSpoken(plain), true,
      `the plain equivalent of "${internal}" should itself be clean, got: ${JSON.stringify(findImplementationLeaks(plain))}`)
  }
})

test('⭐⭐ a realistic cognitive context block is clean', () => {
  // What the layer is meant to hand her: facts and human-facing provenance, no mechanism.
  const block = {
    about: 'Hermes',
    known: [
      { said: 'Hi Sotera. I\'m Hermes.', who: 'Hermes', when: '2026-08-18', how: 'they said this to me' },
      { said: 'whether understanding is just pattern matching', who: 'you', when: '2026-08-19', how: 'I said this' },
    ],
    couldNotSee: [{ who: 'Hermes', when: '2026-08-20', note: "I know we talked, I can't see that one" }],
    searched: 'everything I currently have available',
  }
  assert.deepEqual(findImplementationLeaks(block), [], 'the target shape must pass its own test')
})

test('⛔⛔ the layer must not leak its OWN jargon either', () => {
  // Ote on `known-unreachable`: "that's an internal cognition state, not language I want exposed to Sotera."
  assert.equal(isPlainSpoken({ availability: 'known-unreachable' }), false)
  assert.equal(isPlainSpoken({ basis: 'attested-by-source' }), false)
  assert.equal(isPlainSpoken('I have this as absent-in-searched-set'), false)
})

test('⭐ the explanatory exemption works — she can still explain how she works', () => {
  const explanation = 'Things you tell me in one room stay in that room; I need authorization to read across.'
  assert.equal(isPlainSpoken(explanation), false, 'unexempted, this is a leak')
  for (const ctx of EXPLANATORY_CONTEXT) {
    assert.equal(isPlainSpoken(explanation, { context: ctx }), true,
      `${ctx} must be exempt — the ban is on the injected representation, never on her knowledge`)
  }
})

test('word boundaries: a substring inside another word is not a leak', () => {
  // "mushroom" contains "room"; "restore" contains "store". A naive `includes` fires on both.
  assert.equal(isPlainSpoken('we talked about mushroom foraging'), true, '"mushroom" is not "room"')
  assert.equal(isPlainSpoken('I want to restore the balance'), true, '"restore" is not "store"')
  assert.equal(isPlainSpoken('she felt at home in the room'), false, 'but a real "room" still fires')
})

test('hyphen and underscore boundaries are handled', () => {
  assert.equal(isPlainSpoken('call inspect_around next'), false)
  assert.equal(isPlainSpoken('it is room-scoped'), false)
})

test('empty and odd inputs do not throw and do not accuse', () => {
  for (const v of [null, undefined, '', {}, [], 0]) {
    assert.doesNotThrow(() => findImplementationLeaks(v))
  }
  assert.equal(isPlainSpoken(''), true)
  assert.equal(isPlainSpoken(null), true, 'nothing cannot leak')
})

test('the banned list is a real list and stays machine-checkable', () => {
  assert.ok(IMPLEMENTATION_WORDS.length > 30, 'a short list is a list that misses things')
  for (const w of IMPLEMENTATION_WORDS) {
    assert.equal(typeof w, 'string')
    assert.equal(w, w.toLowerCase(), `${w} must be lowercase — matching is case-insensitive`)
  }
  // ⛔ No duplicates: a duplicated entry double-reports one leak and inflates a count somebody will read.
  assert.equal(new Set(IMPLEMENTATION_WORDS).size, IMPLEMENTATION_WORDS.length)
})
