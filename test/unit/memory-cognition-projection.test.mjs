// THE TOOL-RESULT PROJECTION — Leak 1, and the thing it must NOT do matters as much as what it does.
//
// ⭐ Measured cause: five live runs, the cognition block clean every time, and she still said *"my memory
// stores are scoped to this room"*. The tool payloads are the other channel, and they are literally
// teaching her: `recall_own_memory` hands her *"This is the ROOM you are in. A room is a context this
// person uses you for."*
//
// ⛔⛔ AND IT IS NOT THE ACCESS FIX. Ote, before it could be mistaken for one: *"I also don't want this
// solved by simply hiding tool output. The underlying ownership model needs to be correct first."* This
// changes WORDS. The false claim that she cannot reach her own memory is currently TRUE room-by-room, and
// only the ownership model fixes that.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plainSpokenToolResult, projectForModel, PROJECTED_TOOLS } from '../../Backend/app/components/memory-cognition-projection.js'
import { findImplementationLeaks } from '../../Backend/app/components/memory-cognition-vocabulary.js'

// The real payload, trimmed verbatim from a live `recall_own_memory` result on 2026-08-21.
const REAL = {
  scope: {
    room: {
      name: 'ote',
      note: 'This is the ROOM you are in. A room is a context this person uses you for. What is stored in a room stays in that room.',
    },
    grain: { whatTheyToldYou: 'Scoped to THIS ROOM.', yourOwnPractice: 'Keyed to the PERSON, not the room.' },
    elsewhere: { otherRoomsOfThisPerson: 1, storedMemoriesYouCannotReadFromHere: 0 },
  },
  coverage: {
    searched: 'every message you wrote, in every conversation you have had',
    notSearched: 'what anyone else said, and your durable memories',
    matchedHere: 0,
    matchedElsewhere: 3,
    whatTheNumberMeans: '0 found IN THE SET THAT WAS SEARCHED — one room, one person.',
  },
  provenance: { store: 'your own memory (separate from what people have told you)' },
}

test('⭐⭐ the payload that taught her the word comes out clean', () => {
  const out = plainSpokenToolResult('recall_own_memory', JSON.stringify(REAL))
  assert.deepEqual(findImplementationLeaks(out), [], `residue: ${JSON.stringify(findImplementationLeaks(out))}`)
})

test('⭐⭐⭐ …and the INFORMATION survives — every count is still there', () => {
  const out = JSON.parse(plainSpokenToolResult('recall_own_memory', JSON.stringify(REAL)))
  const flat = JSON.stringify(out)
  // The searched-set quantifier is load-bearing: she once answered a flat "No." about a store she had not
  // searched, and these numbers are the fix. ⛔ Losing them to tidy up the words would be a regression into
  // the older, worse bug.
  assert.match(flat, /"matchesHere":0/, 'the here-count survives under a plain name')
  assert.match(flat, /"matchesElsewhere":3/, 'the elsewhere-count survives')
  assert.match(flat, /"thingsICannotReachFromHere":0/, 'the out-of-reach count survives')
  assert.match(flat, /"otherPlacesWeHaveTalked":1/, 'the other-places count survives')
  assert.ok(/every message you wrote/.test(flat), 'WHAT was searched survives')
  assert.ok(/what anyone else said/.test(flat), 'what was NOT searched survives')
})

test('⛔ the architecture tuition is dropped, not translated', () => {
  const out = JSON.parse(plainSpokenToolResult('recall_own_memory', JSON.stringify(REAL)))
  const flat = JSON.stringify(out)
  assert.ok(!/context this person uses you for/i.test(flat),
    'the sentence that defines a room for her is removed entirely — it carries no fact she needs')
  assert.ok(!/"note"/.test(flat), 'pure-explanation keys are dropped')
})

test('⛔⛔ a leak through a KEY is closed — she reads a key as readily as a sentence', () => {
  const out = plainSpokenToolResult('recall_own_memory', JSON.stringify({ room: 'ote', storedMemoriesYouCannotReadFromHere: 4 }))
  assert.ok(!/\broom\b/i.test(out))
  assert.ok(!/CannotRead/i.test(out))
  assert.match(out, /4/, 'the number itself is kept')
})

test('a non-JSON tool result still gets its terms rewritten', () => {
  const out = plainSpokenToolResult('recall_own_history', 'Nothing in this room; try another room.')
  assert.deepEqual(findImplementationLeaks(out), [])
})

test('⛔ tools with no storage vocabulary are untouched, byte for byte', () => {
  const web = JSON.stringify({ results: [{ title: 'A room with a view', url: 'x' }] })
  assert.equal(plainSpokenToolResult('search_web', web), web,
    'projecting a web result would rewrite a film title — scope creep with a blast radius')
  assert.equal(PROJECTED_TOOLS.has('search_web'), false)
})

test('the projection can be turned off, and then changes nothing', () => {
  const raw = JSON.stringify(REAL)
  assert.equal(plainSpokenToolResult('recall_own_memory', raw, { enabled: false }), raw)
})

test('⚠️ residue is REPORTED rather than assumed to be zero', () => {
  // A term list catches only what it was told about — this repo's most-repeated defect. So the hook exists,
  // and this test proves it fires rather than trusting that it would.
  let seen = null
  plainSpokenToolResult('recall_memory', JSON.stringify({ detail: 'the HNSW index over the vector population' }),
    { onLeak: (w) => { seen = w } })
  assert.ok(Array.isArray(seen) && seen.length > 0, 'an unmapped term must be reported, not silently shipped')
})

test('odd input does not throw and does not corrupt', () => {
  for (const v of ['', null, undefined, '{not json', '[]']) {
    assert.doesNotThrow(() => plainSpokenToolResult('recall_memory', v))
  }
  assert.equal(projectForModel('recall_memory', null), null)
  assert.deepEqual(projectForModel('recall_memory', [1, 2]), [1, 2])
})

test('⭐ nesting and arrays are walked to the bottom', () => {
  const deep = { a: [{ b: { room: 'x', c: ['from this room'] } }] }
  const out = JSON.stringify(projectForModel('recall_memory', deep))
  assert.ok(!/\broom\b/i.test(out), `still leaking: ${out}`)
})
