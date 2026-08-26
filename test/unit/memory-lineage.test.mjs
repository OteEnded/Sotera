// ⭐⭐ THE LINEAGE AND CONTRADICTION PRIMITIVES — pure, so they are tested purely.
//
//   node --test unit/memory-lineage.test.mjs
//
// ⭐ WHAT EACH GROUP IS ACTUALLY DEFENDING, so a future reader can tell a real regression from a
// cosmetic one: every assertion below corresponds to a failure that has already happened on this
// project at least once, and most of them to one that happened this week.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MECHANISM, mechanismOf, occasionOf, isExtraction,
  BASIS, derivedFrom, withDerivedFrom, derivedFromOf, lineageRestatesTheOccasion, LINEAGE_KEY,
} from '../../Backend/app/components/memory-lineage.js'
import {
  noteRetrieved, traceFor, hasTrace, tracedMemoryIds, clearTrace, traceStats,
} from '../../Backend/app/components/memory-retrieval-trace.js'
import {
  candidatesFromTrace, candidatesNamed, mergeCandidates, mayRecordContradiction, GROUND,
} from '../../Backend/app/components/memory-contradiction.js'

// ── MECHANISM ─────────────────────────────────────────────────────────────────────────────────────
test('mechanismOf recognises every writer the live store actually contains', () => {
  // These seven tags are the complete set measured across all 92 rows on 2026-08-26. If a new writer
  // appears, `unknown` is what the live check catches — this asserts the known ones stay known.
  assert.equal(mechanismOf('conversation:53f055d0-b582-4346-89bb-ce1a3e1090de'), MECHANISM.extraction)
  assert.equal(mechanismOf('doc:Reference/docs/X.md@90e0c9af0'), MECHANISM.document)
  assert.equal(mechanismOf('episode:abc@41'), MECHANISM.episode)
  assert.equal(mechanismOf('lesson:30ccb213-a215-4078-93ec-497874c1e05e'), MECHANISM.lesson)
  assert.equal(mechanismOf('decline:7b259ce8-ddee-4e14-ae80-3db5c7e5b3fe'), MECHANISM.decline)
  assert.equal(mechanismOf('model-tool'), MECHANISM.modelTool)
  assert.equal(mechanismOf('consolidation'), MECHANISM.consolidation)
})

test('an unrecorded source and an unrecognised one are DIFFERENT answers', () => {
  // ⛔ Collapsing these is the shape of half this project's bugs: "nobody said" and "we do not
  // understand what was said" are not the same fact, and one of them is a defect.
  assert.equal(mechanismOf(null), MECHANISM.unrecorded)
  assert.equal(mechanismOf(''), MECHANISM.unrecorded)
  assert.equal(mechanismOf('   '), MECHANISM.unrecorded)
  assert.equal(mechanismOf('something-nobody-taught-this-module'), MECHANISM.unknown)
  assert.notEqual(MECHANISM.unrecorded, MECHANISM.unknown)
})

test('the occasion half of `source` is readable without being confused for the mechanism', () => {
  assert.equal(occasionOf('conversation:53f055d0'), '53f055d0')
  assert.equal(occasionOf('doc:a/b.md@sha'), 'a/b.md@sha')
  assert.equal(occasionOf('model-tool'), null)   // carries no occasion — and null says so
  assert.equal(occasionOf(null), null)
  assert.equal(isExtraction('conversation:x'), true)
  assert.equal(isExtraction('model-tool'), false)
})

// ── ⛔ MECHANISM IS NOT MODALITY — the assertion Ote asked for in words ────────────────────────────
test('the Rome row is correctly classified by every axis this module has, and is still wrong', () => {
  // ⭐⭐⭐ THE ACCEPTANCE CASE. `7d383ce3` — "user's current goal: build Rome in one day" — came from a
  // turn in which Ote said those exact words, as a PROVERB. Mechanism and provenance both answer TRUE.
  // Nothing here catches it, and this test exists to make that limitation explicit rather than assumed:
  // if someone later wires modality off `mechanismOf`, this is the test that should stop them.
  const source = 'conversation:53f055d0-b582-4346-89bb-ce1a3e1090de'
  assert.equal(mechanismOf(source), MECHANISM.extraction)  // ✅ true
  assert.equal(isExtraction(source), true)                 // ✅ true
  // ⛔ and there is no modality here to consult, by design — Ote's decision A is unmade.
  assert.equal(typeof MECHANISM.figurative, 'undefined')
  assert.equal(typeof BASIS.figurative, 'undefined')
})

// ── DERIVATION ────────────────────────────────────────────────────────────────────────────────────
test('a lineage that names nothing is null, not an empty envelope', () => {
  // ⚠️ "It rests on nothing" and "nobody recorded what it rests on" must not look alike. The persisted
  // difference between `null` and `{basis:'in-context'}` is the difference between those two claims.
  assert.equal(derivedFrom({ basis: BASIS.inContext, memoryIds: [] }), null)
  assert.equal(derivedFrom({ basis: BASIS.memories, memoryIds: [] }), null)
  assert.equal(derivedFrom({ basis: BASIS.messages, messageIds: [] }), null)
  assert.equal(derivedFrom({ basis: BASIS.document, document: {} }), null)
  assert.equal(derivedFrom({ basis: 'invented' }), null)
  assert.equal(derivedFrom({}), null)
})

test('derivedFrom de-duplicates and stringifies ids, and keeps only what it was given', () => {
  const l = derivedFrom({ basis: BASIS.inContext, memoryIds: ['b', 'a', 'b', null, undefined], via: 'x' })
  assert.deepEqual(l, { basis: 'in-context', memoryIds: ['b', 'a'], via: 'x' })
  assert.equal('messageIds' in l, false)  // absent, not an empty array
})

test('withDerivedFrom is ADDITIVE — the four payloads already in that column survive', () => {
  // ⚠️ MEASURED: `evidence` holds document-ingest fields (34 rows), lesson structure (3), decline
  // reasons (1) and card membership, with NO discriminator. `evidence = {derivedFrom}` would destroy
  // whichever one it landed on, silently, because the row still writes.
  const doc = { kind: 'project-decision', path: 'docs/X.md', commit: 'abc', quote: 'a phrase' }
  const l = derivedFrom({ basis: BASIS.inContext, memoryIds: ['m1'] })
  const merged = withDerivedFrom(doc, l)
  assert.equal(merged.path, 'docs/X.md')
  assert.equal(merged.quote, 'a phrase')
  assert.deepEqual(merged[LINEAGE_KEY], l)
  // and a null lineage must not create the key or disturb the payload
  assert.deepEqual(withDerivedFrom(doc, null), doc)
  assert.equal(withDerivedFrom(null, null), null)
})

test('derivedFromOf refuses to read back a lineage it did not write', () => {
  assert.equal(derivedFromOf(null), null)
  assert.equal(derivedFromOf({ quote: 'x' }), null)
  assert.equal(derivedFromOf({ derivedFrom: { basis: 'not-a-basis' } }), null)
  assert.equal(derivedFromOf({ derivedFrom: 'a string' }), null)
  const l = derivedFrom({ basis: BASIS.messages, messageIds: ['m'] })
  assert.deepEqual(derivedFromOf({ derivedFrom: l }), l)
})

test('a lineage that only restates the occasion is DETECTABLE', () => {
  // ⭐ This is the collapse the axis exists to prevent: `source_message_id` answering both "when was
  // this written" and "what does it rest on". A row whose whole lineage is its own occasion has
  // recorded one answer twice and the other not at all.
  const smid = '11111111-1111-1111-1111-111111111111'
  const collapsed = { source_message_id: smid, evidence: { derivedFrom: derivedFrom({ basis: BASIS.messages, messageIds: [smid] }) } }
  assert.equal(lineageRestatesTheOccasion(collapsed), true)
  const honest = { source_message_id: smid, evidence: { derivedFrom: derivedFrom({ basis: BASIS.inContext, memoryIds: ['other'] }) } }
  assert.equal(lineageRestatesTheOccasion(honest), false)
  assert.equal(lineageRestatesTheOccasion({ source_message_id: smid, evidence: null }), false)
})

// ── THE RETRIEVAL TRACE ───────────────────────────────────────────────────────────────────────────
test('the trace is additive by id across both retrieval paths in one turn', () => {
  // ⚠️ A turn retrieves TWICE — passively before the reply, then again if she calls recall_memory. The
  // union is what was in front of her; a second call that replaced the first would shrink the evidence.
  const turn = 'turn-additive'
  clearTrace(turn)
  noteRetrieved(turn, [{ id: 'a', content: 'one' }, { id: 'b', content: 'two' }], { via: 'passive-recall' })
  noteRetrieved(turn, [{ id: 'b', content: 'two' }, { id: 'c', content: 'three' }], { via: 'recall_memory' })
  assert.deepEqual(tracedMemoryIds(turn).sort(), ['a', 'b', 'c'])
  // first writer wins the `via`, so the earliest sighting is what is recorded
  assert.equal(traceFor(turn).find((i) => i.id === 'b').via, 'passive-recall')
  clearTrace(turn)
})

test('"nothing retrieved" and "turn never observed" are distinguishable', () => {
  const turn = 'turn-empty'
  clearTrace(turn)
  assert.equal(hasTrace(turn), false)
  assert.deepEqual(traceFor(turn), [])
  noteRetrieved(turn, [{ id: 'x', content: 'c' }])
  assert.equal(hasTrace(turn), true)
  clearTrace(turn)
})

test('a null turn key records nothing rather than inventing a bucket', () => {
  // ⛔ A synthetic key would let one turn's retrieval become evidence about another turn's write —
  // precisely the error a time-window diff already made on this project with an asynchronous writer.
  const before = traceStats().turns
  assert.equal(noteRetrieved(null, [{ id: 'a' }]), 0)
  assert.equal(noteRetrieved(undefined, [{ id: 'a' }]), 0)
  assert.equal(traceStats().turns, before)
})

test('the trace keeps only a bounded excerpt, never the memory', () => {
  const turn = 'turn-excerpt'
  clearTrace(turn)
  noteRetrieved(turn, [{ id: 'a', content: 'x'.repeat(1000) }])
  assert.equal(traceFor(turn)[0].excerpt.length, 160)
  clearTrace(turn)
})

// ── CORRECTION CANDIDATES ─────────────────────────────────────────────────────────────────────────
test('candidates come from PRESENCE, and an unobserved turn fails CLOSED', () => {
  // ⛔ THE DESIGN DECISION: not similarity. "Rome is not a project name" and "user's current goal:
  // build Rome in one day" share one token; a cosine gate would either miss it or invalidate ten
  // unrelated beliefs. A memory that was never in the room cannot be what the person was correcting.
  const turn = 'turn-candidates'
  clearTrace(turn)
  assert.deepEqual(candidatesFromTrace(turn), { observed: false, candidates: [] })
  assert.equal(mayRecordContradiction({ memoryId: 'm1', turnKey: turn }).ok, false)

  noteRetrieved(turn, [{ id: 'm1', kind: 'semantic', content: 'a belief' }], { via: 'passive-recall' })
  const seen = candidatesFromTrace(turn)
  assert.equal(seen.observed, true)
  assert.equal(seen.candidates[0].ground, GROUND.inContext)
  assert.equal(mayRecordContradiction({ memoryId: 'm1', turnKey: turn }).ok, true)
  // ⛔ and a memory that was NOT shown stays out, however plausible it looks
  const no = mayRecordContradiction({ memoryId: 'm2', turnKey: turn })
  assert.equal(no.ok, false)
  assert.match(no.reason, /not in her context/)
  clearTrace(turn)
})

test('being NAMED outranks presence and needs no trace at all', () => {
  const turn = 'turn-named'
  clearTrace(turn)
  const r = mayRecordContradiction({ memoryId: 'm9', turnKey: turn, namedIds: ['m9'] })
  assert.equal(r.ok, true)
  assert.equal(r.ground, GROUND.named)
})

test('merged candidates keep NAMED as the ground when a row arrives both ways', () => {
  const named = candidatesNamed(['m1'], () => ({ kind: 'semantic', content: 'a belief' }))
  const inCtx = [{ id: 'm1', kind: 'semantic', excerpt: 'a belief', ground: GROUND.inContext }]
  const merged = mergeCandidates(named, inCtx)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].ground, GROUND.named)
})
