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
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import {
  plainSpokenToolResult, projectForModel, PROJECTED_TOOLS, scopeSentence, queryOf,
} from '../../Backend/app/components/memory-cognition-projection.js'
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

// ══ ⭐⭐⭐ STEP A · A TOOL RESULT STATES ITS OWN SCOPE ══════════════════════════════════════════════
//
// RFC §3D, ratified: *"Retrieval is evidence. Cognition is interpretation."* A tool's emptiness is a true
// fact about ONE query over ONE population; the inference *"therefore I don't remember Hermes"* belongs to
// cognition, which holds the other populations.
//
// ⭐⭐ THE MEASUREMENT (the 2×2, 2026-08-23): with tools as the only source she asserted a global absence in
// BOTH languages; with the block as the only source she recalled real episodes in BOTH. The denial tracked
// the ARM, not the language. ⇒ what the payload lacked was **the scope of its own answer**.

const EMPTY = { count: 0, memories: [], reach: { otherRoomsOfThisPerson: 2, storedMemoriesYouCannotReadFromHere: 7 } }

test('⭐⭐⭐ an EMPTY result says what it looked through, and binds the finding to it', () => {
  const out = JSON.parse(plainSpokenToolResult('recall_memory', JSON.stringify(EMPTY), { args: { query: 'Hermes' } }))
  assert.equal(out.thisLook, 'I looked through the things I have kept for Hermes and found nothing there.')
  // ⭐⭐ "there" IS THE MECHANISM, and it is grammatical rather than rhetorical: "found nothing" can be read
  // as "nothing anywhere", "found nothing there" cannot. If a future edit drops the word, the fix is gone.
  assert.match(out.thisLook, /there\.$/)
})

test('⛔⛔ …and it never says an unqualified "nothing" — that is the whole defect', () => {
  const out = JSON.parse(plainSpokenToolResult('recall_memory', JSON.stringify(EMPTY), { args: { query: 'Hermes' } }))
  assert.ok(!/found nothing\.|nothing at all|no memories\b/i.test(out.thisLook))
})

test('⭐ a NON-EMPTY result is scoped too — the opposite error is also possible', () => {
  // ⚠️ Three local hits read as "everything I have" is the same defect pointing the other way.
  const three = { count: 3, matches: [{ content: 'a' }, { content: 'b' }, { content: 'c' }] }
  const out = JSON.parse(plainSpokenToolResult('recall_memory', JSON.stringify(three), { args: { query: 'Hermes' } }))
  assert.match(out.thisLook, /found three things there\.$/)
})

test('⛔⛔ NOTHING IS DROPPED — the sentence is PREPENDED, never substituted', () => {
  const out = JSON.parse(plainSpokenToolResult('recall_memory', JSON.stringify(EMPTY), { args: { query: 'Hermes' } }))
  assert.equal(out.count, 0)
  assert.deepEqual(out.memories, [])
  // ⭐ And the searched-set quantifier survives under its plain name — it is load-bearing, because she once
  // answered a flat "No." about a store she had not searched.
  assert.equal(out.reach.thingsICannotReachFromHere, 7)
  assert.equal(out.reach.otherPlacesWeHaveTalked, 2)
})

test('⭐ the sentence is the FIRST key, because key order is reading order', () => {
  const out = plainSpokenToolResult('recall_memory', JSON.stringify(EMPTY), { args: { query: 'Hermes' } })
  assert.ok(out.startsWith('{"thisLook":'), `count:0 must not be read before the frame it lands in: ${out.slice(0, 40)}`)
})

test('⛔⛔ AN UNRECOGNISED SHAPE GETS NO SENTENCE — fail to silence, never to a guess', () => {
  // ⭐ Same discipline as `ownerOf` returning `unknown`: a scope we cannot establish honestly is one we must
  // not describe. A guessed population would be worse than none, because it would be believed.
  assert.equal(scopeSentence('recall_memory', { weird: true }), null)
  assert.equal(scopeSentence('recall_memory', null), null)
  assert.equal(scopeSentence('recall_memory', 'a string'), null)
  const out = JSON.parse(plainSpokenToolResult('recall_memory', JSON.stringify({ weird: true })))
  assert.ok(!('thisLook' in out))
})

test('⛔ a tool whose population we cannot name plainly gets no sentence', () => {
  // `inspect_around` reads around ONE moment; "the population it searched" is not a thing a person says.
  assert.equal(scopeSentence('inspect_around', { count: 0 }), null)
  assert.equal(scopeSentence('request_room_access', { count: 0 }), null)
})

test('⭐ `count` is trusted over array length, because a read can be PAGED', () => {
  // ⚠️ `list` caps at 1000; a length taken from a truncated page would say "three things" about 3000.
  const paged = { count: 3000, memories: [{ content: 'a' }, { content: 'b' }, { content: 'c' }] }
  assert.match(scopeSentence('list_memories', paged), /found 3000 things there\.$/)
})

test('⛔ the sentence carries NO machinery vocabulary', () => {
  for (const tool of ['recall_memory', 'recall_own_history', 'list_memories', 'recall_lessons', 'recall_intention']) {
    const said = scopeSentence(tool, { count: 0 }, { query: 'Hermes' })
    assert.deepEqual(findImplementationLeaks(said), [], `${tool}: ${said}`)
  }
})

test('⛔⛔ and it makes NO claim about what exists elsewhere — that is cognition\'s job', () => {
  const said = scopeSentence('recall_memory', { count: 0 }, { query: 'Hermes' })
  assert.ok(!/elsewhere|other|may be|might be|somewhere/i.test(said),
    'the tool does not know what is outside its population, so it must not gesture at it')
})

test('⭐ queryOf takes the QUERY and nothing else', () => {
  assert.equal(queryOf({ query: 'Hermes' }), 'Hermes')
  assert.equal(queryOf('{"q":"Hermes"}'), 'Hermes')
  // ⛔ Never an id, a limit, a handle or a flag — this string is read by her.
  assert.equal(queryOf({ limit: 5, conversationHandle: 'a9ce4653', messageId: 'x', includeArchived: true }), null)
  assert.equal(queryOf(null), null)
  assert.equal(queryOf('not json'), null)
  assert.equal(queryOf({ query: '   ' }), null)
  assert.equal(queryOf({ query: 'x'.repeat(200) }).length, 80, 'and it is bounded')
})

test('⛔ disabled leaves the payload untouched, sentence included', () => {
  const raw = JSON.stringify(EMPTY)
  assert.equal(plainSpokenToolResult('recall_memory', raw, { enabled: false }), raw)
})

test('⛔ STEP A DID NOT SUPPRESS, RANK OR COUNT ANYTHING', () => {
  // Ote, twice: "do not optimize for fewer tool calls." ⛔ Nothing here may look at how often she called.
  const src = readFileSync(new URL('../../Backend/app/components/memory-cognition-projection.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')
  assert.ok(!/callCount|tooManyCalls|budget|throttle|suppress|skipTool/i.test(src))
  // ⛔ And it must not consult authorization or the cognition state — it projects ONE result, blindly.
  assert.ok(!/access_sotera_memory|memoryAccessScope|isRoot|recollect|currentState/.test(src))
})
