// ⭐⭐ THE MODALITY PRIMITIVES — pure, so they are tested purely.
//
//   node --test unit/memory-modality.test.mjs
//
// Every assertion corresponds to a decision Ote made on 2026-08-26 or to a failure this project has
// already paid for. ⛔ None of them is a style preference.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MODALITY, MODALITY_VALUES, isModality, normalizeModality,
  isLiteral, isNonLiteral, mayOccupySlot, slotViolation,
} from '../../Backend/app/components/memory-modality.js'

test('the vocabulary is exactly five, flat — ⛔ no act/term split', () => {
  // Ote: *"Don't over-engineer act+term yet unless the current design genuinely needs it."*
  assert.equal(MODALITY_VALUES.length, 5)
  assert.deepEqual([...MODALITY_VALUES].sort(),
    ['aspirational', 'asserted', 'figurative', 'hypothetical', 'reported'])
})

test('⚠️⚠️ an unknown modality is NULL — and NULL is not `asserted`', () => {
  // ⛔ THE ONE PLACE THE PROVENANCE PRECEDENT DOES NOT TRANSFER. `normalizeProvenance` defaults to the
  // weakest class; here BOTH defaults are wrong. `asserted` rebuilds the Rome bug silently on every row;
  // anything else makes a claim about 92 rows nobody has examined.
  assert.equal(normalizeModality(undefined), null)
  assert.equal(normalizeModality(null), null)
  assert.equal(normalizeModality('literal'), null)     // a plausible synonym is still not a class
  assert.equal(normalizeModality('ASSERTED'), null)    // and case is not coerced
  assert.notEqual(normalizeModality('anything'), MODALITY.asserted)
  assert.equal(isModality('asserted'), true)
  assert.equal(isModality('metaphor'), false)
})

test('literal / non-literal / unrecorded are THREE states, not two', () => {
  assert.equal(isLiteral(MODALITY.asserted), true)
  assert.equal(isNonLiteral(MODALITY.asserted), false)
  for (const m of ['aspirational', 'figurative', 'reported', 'hypothetical']) {
    assert.equal(isLiteral(m), false, m)
    assert.equal(isNonLiteral(m), true, m)
  }
  // ⭐ Unrecorded is NEITHER. Reading it as literal reintroduces the bug; reading it as non-literal
  // would refuse every writer that exists today, which is an outage rather than a protection.
  assert.equal(isLiteral(null), false)
  assert.equal(isNonLiteral(null), false)
  assert.equal(mayOccupySlot(null), true)
})

test('⭐⭐⭐ THE ROME ROW: a non-literal statement may not occupy a fact slot', () => {
  // The row as it exists today, verbatim from the store.
  const rome = {
    entity: 'user', attribute: 'current goal', value: 'build Rome in one day',
    content: "user's current goal: build Rome in one day",
  }
  // As written — no modality recorded — it is permitted, because refusing it would refuse everything.
  assert.equal(slotViolation({ ...rome, modality: null }), null)
  // ⭐ The moment a producer says how it was meant, the slot closes.
  for (const m of ['figurative', 'aspirational', 'reported', 'hypothetical']) {
    const why = slotViolation({ ...rome, modality: m })
    assert.ok(why, `${m} must be refused in a slot`)
    assert.match(why, /may not occupy a fact slot/)
  }
  // ⛔ And `asserted` is unaffected — a literal statement in a slot is the ordinary, correct case.
  assert.equal(slotViolation({ ...rome, modality: 'asserted' }), null)
})

test('⭐ figurative material is still RETAINABLE — as prose', () => {
  // Ote: *"figurative material should still be retainable, but it must not be flattened into
  // entity / attribute / value as though it were a literal fact."*
  // ⇒ *"you are my rome"* stored as prose passes; the SAME modality in a slot does not.
  const prose = { entity: null, attribute: null, value: null, content: 'Ote calls me his Rome.', modality: 'figurative' }
  assert.equal(slotViolation(prose), null)
  assert.ok(slotViolation({ ...prose, attribute: 'is' }))
})

test('ANY of entity/attribute/value is enough to count as slotted', () => {
  // ⛔ A partial slot is still a slot: `attribute` alone names a claim, and a later reconcile can fill
  // the rest in. Requiring all three would leave the door open by one third.
  for (const k of ['entity', 'attribute', 'value']) {
    const row = { modality: 'figurative', content: 'x', [k]: 'something' }
    assert.ok(slotViolation(row), `${k} alone must trip the gate`)
  }
  assert.equal(slotViolation({ modality: 'figurative', content: 'x' }), null)
})

test('the predicate is total and never throws', () => {
  assert.equal(slotViolation(null), null)
  assert.equal(slotViolation(undefined), null)
  assert.equal(slotViolation({}), null)
})
