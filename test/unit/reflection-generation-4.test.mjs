// ⭐ REFLECTION GENERATION 4 — the citation instrument's PURE half, red-proofed before the code exists.
// `PLAN_SOTERA_REFLECTION_GENERATION_4_CITATION.md` §2 (U1 · U2) plus the two pure mappings the lane and `retain` share.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REFLECTION_GENERATION, generationSpec, transcriptLine, shapeReflectionTranscript,
  citationResolver, citationRefs, withCitationFields,
} from '../../Backend/app/components/reflection-lifecycle.js'

const slice = [
  { id: '11111111-1111-4111-8111-111111111111', role: 'user', content: 'I water the astrophytum on Sundays.', rolling_id: 10 },
  { id: '22222222-2222-4222-8222-222222222222', role: 'assistant', content: 'Sundays it is.', rolling_id: 11 },
  { id: '33333333-3333-4333-8333-333333333333', role: 'user', content: 'And   I drink   genmaicha.', rolling_id: 12 },
]

// ⚠️ PRODUCTION MOVED 3 → 7 on 2026-09-18 (the retention-ownership clause). ⭐ GEN 7'S TRANSPORT IS
// IDENTICAL TO GEN 3 — unnumbered, no citation fields — so everything this test says about 3 vs 4 is
// unchanged; only which generation is LIVE moved. ⓘ Gen 3 is now the HISTORICAL control.
test('G · the live generation is 7, and the spec table knows exactly what 3, 4 and 7 change', () => {
  assert.equal(REFLECTION_GENERATION, 7)
  // ⭐ 7 carries the ownership clause and NOTHING else — same transport as the gen-3 control, so one
  // variable moves and a retention-rate difference is attributable to the clause alone.
  assert.deepEqual(generationSpec(7), { numbered: false, citations: false })
  assert.deepEqual(generationSpec(7), generationSpec(3))
  assert.deepEqual(generationSpec(3), { numbered: false, citations: false })
  assert.deepEqual(generationSpec(4), { numbered: true, citations: true })
  // 5 and 6 decompose 4 — each moves exactly ONE of its two halves
  assert.deepEqual(generationSpec(5), { numbered: true, citations: false })
  assert.deepEqual(generationSpec(6), { numbered: false, citations: true })
  assert.notDeepEqual(generationSpec(5), generationSpec(6))
  assert.throws(() => generationSpec(8), /generation/)   // ⚠️ was 7 until 7 was declared
  assert.throws(() => generationSpec('4'), /generation/)
})

test('U2 · numbered lines are `[n] role: text`, contiguous from 1, and NOTHING else about a line changes', () => {
  const plain = shapeReflectionTranscript(slice)
  const numbered = shapeReflectionTranscript(slice, { numbered: true })
  assert.equal(plain.transcript, slice.map((m) => transcriptLine(m)).join('\n'), 'unnumbered is byte-identical to today')
  const lines = numbered.transcript.split('\n')
  assert.equal(lines.length, 3)
  lines.forEach((l, i) => assert.equal(l, `[${i + 1}] ${transcriptLine(slice[i])}`))
  assert.equal(numbered.considered, plain.considered)
  assert.equal(numbered.elided, plain.elided)
  assert.equal(transcriptLine(slice[2]), 'user: And I drink genmaicha.', 'whitespace folding unchanged')
})

test('U1 · ordinals 1..k resolve to the slice ids in order; 0, k+1, non-integers and junk resolve to null', () => {
  const r = citationResolver(slice)
  assert.equal(r.size, 3)
  assert.equal(r.turnFor(1), slice[0].id)
  assert.equal(r.turnFor(3), slice[2].id)
  for (const bad of [0, 4, -1, 1.5, '2', null, undefined, NaN, {}]) assert.equal(r.turnFor(bad), null, `ordinal ${String(bad)}`)
  assert.equal(citationResolver([]).turnFor(1), null)
})

test('M · citationRefs maps ordinals to turn references; an unresolvable ordinal becomes a DECLARED FAILURE, never a dropped one', () => {
  const r = citationResolver(slice)
  assert.deepEqual(citationRefs({ from: [1, 3], quote: null }, r), [
    { kind: 'turn', target: slice[0].id, span: null },
    { kind: 'turn', target: slice[2].id, span: null },
  ])
  assert.deepEqual(citationRefs({ from: [2], quote: 'Sundays it is.' }, r), [{ kind: 'turn', target: slice[1].id, span: 'Sundays it is.' }])
  const out = citationRefs({ from: [7], quote: 'x' }, r)
  assert.equal(out.length, 1)
  assert.equal(out[0].kind, 'turn')
  assert.equal(out[0].how, 'failed')
  assert.match(out[0].reason, /ordinal 7/)
  assert.equal(out[0].target, null)
  assert.deepEqual(citationRefs({ from: null }, r), [])
  assert.deepEqual(citationRefs({ from: 'not-an-array' }, r), [])
  assert.deepEqual(citationRefs({}, null), [], 'no resolver ⇒ no references, no throw')
})

test('T · withCitationFields extends ONLY retain, ONLY with `from` and `quote`, and leaves the input untouched', () => {
  const defs = [
    { type: 'function', function: { name: 'retain', description: 'Carry something forward.', parameters: { type: 'object', properties: { content: { type: 'string' }, kind: { type: 'string' } }, required: ['content', 'kind'], additionalProperties: false } } },
    { type: 'function', function: { name: 'decline_to_remember', description: 'd', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  ]
  const before = JSON.stringify(defs)
  const out = withCitationFields(defs)
  assert.equal(JSON.stringify(defs), before, 'input not mutated')
  const retain = out.find((d) => d.function.name === 'retain').function
  assert.deepEqual(Object.keys(retain.parameters.properties).sort(), ['content', 'from', 'kind', 'quote'])
  assert.equal(retain.parameters.properties.from.type, 'array')
  assert.equal(retain.parameters.properties.from.items.type, 'integer')
  assert.equal(retain.parameters.properties.quote.type, 'string')
  assert.deepEqual(retain.parameters.required, ['content', 'kind'], 'nothing new is required')
  assert.ok(retain.description.startsWith('Carry something forward.'), 'the existing sentence stands first')
  assert.ok(retain.description.length > 'Carry something forward.'.length, 'one sentence added')
  assert.doesNotMatch(retain.description, /must|always|every/i, '⛔ no instruction to cite')
  assert.deepEqual(out.find((d) => d.function.name === 'decline_to_remember'), defs[1])
})
