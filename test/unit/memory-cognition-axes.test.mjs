// THE EPISTEMIC LATTICE — build item 1 of the Memory Cognition Layer, tested before the layer exists.
//
// ⭐⭐⭐ WHY THIS TEST IS WRITTEN FIRST. The cognition layer's own worst failure mode is the one it could
// introduce: always-on activation trading a false *"I can't"* for a false *"I do"* — claiming memories she
// does not have. That is strictly worse than the bug being fixed. So the guard is written before the
// activation code, not after, and it is pure: no stores, no model, no IO, nothing to mock.
//
// ⭐ THE INVARIANT, in Ote's words: *"retrieval can improve availability and confidence, but it cannot
// magically upgrade the basis. A hundred clues don't become an attested source just because they agree."*

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SOURCE, BASIS, AVAILABILITY, RETENTION, WARRANT,
  isRemembered, isPromotion, warrantFor, findIllegalPromotions, combineBasis, corroborate,
} from '../../Backend/app/components/memory-cognition-axes.js'

// ── ⭐⭐ THE UMBRELLA. Ote's decision 5, and the thing that stops the artificial sentence. ───────────
test('`remembered` is availability, not retention — the storage mechanism does not dictate her language', () => {
  // Reached from her own episodic history, never deliberately kept. She may still say "I remember".
  const fromHistory = {
    source: SOURCE.ownUtterance, basis: BASIS.attestedBySource,
    availability: AVAILABILITY.recalled, retention: RETENTION.notRetained,
  }
  assert.equal(isRemembered(fromHistory), true,
    'something recalled from her own history IS remembered, even though it was never retained')

  // ⛔ And the inverse: deliberately retained but not reachable here is NOT "remembered" right now.
  const retainedButUnreachable = {
    source: SOURCE.storedLesson, basis: BASIS.inferred,
    availability: AVAILABILITY.knownUnreachable, retention: RETENTION.retained,
  }
  assert.equal(isRemembered(retainedButUnreachable), false,
    'retention is not availability — she cannot claim to remember what she cannot reach')
})

test('an empty search is not an absence — `absent-in-searched-set` is never `remembered`', () => {
  assert.equal(isRemembered({ availability: AVAILABILITY.absentInSearchedSet }), false)
  assert.equal(isRemembered({}), false, 'a missing axis is not a claim')
  assert.equal(isRemembered(null), false)
})

// ── ⛔⛔ THE HERMES RULE. This is the specific move that has to be structurally unavailable. ─────────
test('⭐ N agreeing inferences produce `synthesized` — never `attested-by-source`', () => {
  assert.equal(combineBasis([BASIS.inferred, BASIS.inferred, BASIS.inferred]), BASIS.synthesized,
    'three converging inferences are a synthesis, not a confirmation')
  assert.equal(combineBasis([BASIS.inferred, BASIS.told]), BASIS.synthesized)
  assert.equal(combineBasis([BASIS.attestedBySource, BASIS.inferred]), BASIS.synthesized,
    'one attested input does not attest the whole combination')
})

test('…but attestation is INHERITED when every input has it — it is not manufactured', () => {
  assert.equal(combineBasis([BASIS.attestedBySource, BASIS.attestedBySource]), BASIS.attestedBySource)
})

test('combining ONE thing is not synthesis', () => {
  assert.equal(combineBasis([BASIS.inferred]), BASIS.inferred)
  assert.equal(combineBasis([BASIS.attestedBySource]), BASIS.attestedBySource)
  assert.equal(combineBasis([]), BASIS.inferred, 'no inputs cannot yield a stronger claim than inference')
})

// ── THE LATTICE ITSELF ─────────────────────────────────────────────────────────────────────────────
test('reaching the top of an axis is a promotion and names the warrant it needs', () => {
  assert.equal(isPromotion('basis', BASIS.inferred, BASIS.attestedBySource), true)
  assert.equal(warrantFor('basis', BASIS.inferred, BASIS.attestedBySource), WARRANT.accessibleSource)
  assert.equal(warrantFor('availability', AVAILABILITY.knownUnreachable, AVAILABILITY.recalled), WARRANT.accessResolution)
  assert.equal(warrantFor('retention', RETENTION.notRetained, RETENTION.retained), WARRANT.deliberateRetention)
})

test('⭐ DEMOTIONS ARE ALWAYS FREE — revision is honesty, not a privilege', () => {
  // She looked at the thing she called attested and it did not say what she thought.
  assert.equal(isPromotion('basis', BASIS.attestedBySource, BASIS.inferred), false)
  assert.equal(isPromotion('availability', AVAILABILITY.recalled, AVAILABILITY.knownUnreachable), false)
  assert.equal(isPromotion('retention', RETENTION.retained, RETENTION.given), false)
})

test('an unchanged value is not a promotion', () => {
  for (const [axis, v] of [['basis', BASIS.synthesized], ['availability', AVAILABILITY.recalled], ['retention', RETENTION.given]]) {
    assert.equal(isPromotion(axis, v, v), false)
  }
})

// ── ⭐⭐⭐ THE CHECK THE LAYER IS BUILT AROUND ──────────────────────────────────────────────────────
test('fusion that upgrades a basis without a warrant is caught', () => {
  const inputs = [{ id: 'a', basis: BASIS.inferred, availability: AVAILABILITY.recalled, retention: RETENTION.notRetained }]
  const outputs = [{ id: 'a', basis: BASIS.attestedBySource, availability: AVAILABILITY.recalled, retention: RETENTION.notRetained }]
  const v = findIllegalPromotions(inputs, outputs)
  assert.equal(v.length, 1)
  assert.equal(v[0].axis, 'basis')
  assert.equal(v[0].needed, WARRANT.accessibleSource)
})

test('…and is allowed when the warrant is actually recorded', () => {
  const inputs = [{ id: 'a', basis: BASIS.inferred, availability: AVAILABILITY.recalled, retention: RETENTION.notRetained }]
  const outputs = [{ id: 'a', basis: BASIS.attestedBySource, availability: AVAILABILITY.recalled, retention: RETENTION.notRetained, warrants: [WARRANT.accessibleSource] }]
  assert.deepEqual(findIllegalPromotions(inputs, outputs), [])
})

test('⭐⭐ deeper retrieval may open availability — and STILL may not touch the basis', () => {
  const inputs = [{ id: 'x', basis: BASIS.inferred, availability: AVAILABILITY.knownUnreachable, retention: RETENTION.notRetained }]
  // She looked harder and got access. Availability moves, with its warrant. Basis must not.
  const legal = [{ id: 'x', basis: BASIS.inferred, availability: AVAILABILITY.recalled, retention: RETENTION.notRetained, warrants: [WARRANT.accessResolution] }]
  assert.deepEqual(findIllegalPromotions(inputs, legal), [],
    'reading the source is allowed to make it reachable')

  // ⛔ The same access resolution does NOT license an attestation.
  const illegal = [{ id: 'x', basis: BASIS.attestedBySource, availability: AVAILABILITY.recalled, retention: RETENTION.notRetained, warrants: [WARRANT.accessResolution] }]
  const v = findIllegalPromotions(inputs, illegal)
  assert.equal(v.length, 1)
  assert.equal(v[0].axis, 'basis', 'an access warrant is not an attestation warrant')
})

test('⛔ the layer can never mint `retained` — only she can', () => {
  const inputs = [{ id: 'm', basis: BASIS.inferred, availability: AVAILABILITY.recalled, retention: RETENTION.notRetained }]
  const outputs = [{ id: 'm', basis: BASIS.inferred, availability: AVAILABILITY.recalled, retention: RETENTION.retained }]
  const v = findIllegalPromotions(inputs, outputs)
  assert.equal(v.length, 1)
  assert.equal(v[0].needed, WARRANT.deliberateRetention)
})

test('⭐ a DERIVED item cannot claim more than its parents gave it', () => {
  const inputs = [
    { id: 'p1', basis: BASIS.inferred, availability: AVAILABILITY.recalled, retention: RETENTION.notRetained },
    { id: 'p2', basis: BASIS.inferred, availability: AVAILABILITY.recalled, retention: RETENTION.notRetained },
  ]
  const bad = [{ id: 'd1', derivedFrom: ['p1', 'p2'], basis: BASIS.attestedBySource, availability: AVAILABILITY.recalled, retention: RETENTION.notRetained }]
  const v = findIllegalPromotions(inputs, bad)
  assert.equal(v.length, 1)
  assert.equal(v[0].axis, 'basis')

  const good = [{ id: 'd1', derivedFrom: ['p1', 'p2'], basis: BASIS.synthesized, availability: AVAILABILITY.recalled, retention: RETENTION.notRetained }]
  assert.deepEqual(findIllegalPromotions(inputs, good), [])
})

test('⛔ …and a derived item cannot be BORN retained', () => {
  const inputs = [{ id: 'p', basis: BASIS.inferred, availability: AVAILABILITY.recalled, retention: RETENTION.notRetained }]
  const out = [{ id: 'new', derivedFrom: ['p'], basis: BASIS.inferred, availability: AVAILABILITY.recalled, retention: RETENTION.retained }]
  const v = findIllegalPromotions(inputs, out)
  assert.ok(v.some((x) => x.axis === 'retention'), 'a freshly derived item claiming retention is a violation')
})

test('a pass that changes nothing is trivially legal — the check does not fire on identity', () => {
  const items = [
    { id: '1', basis: BASIS.attestedBySource, availability: AVAILABILITY.recalled, retention: RETENTION.given },
    { id: '2', basis: BASIS.synthesized, availability: AVAILABILITY.knownUnreachable, retention: RETENTION.notRetained },
  ]
  assert.deepEqual(findIllegalPromotions(items, items.map((i) => ({ ...i }))), [])
})

// ── CONFIDENCE ─────────────────────────────────────────────────────────────────────────────────────
test('⭐ corroboration raises confidence and never reaches certainty', () => {
  const one = corroborate(0.5, 1)
  const three = corroborate(0.5, 3)
  const many = corroborate(0.5, 100)
  assert.equal(one, 0.5, 'a single source is not corroborated')
  assert.ok(three > one, 'agreement is worth something')
  assert.ok(many < 1, 'agreement alone never reaches certainty')
  assert.ok(many <= 0.95)
})

test('confidence is clamped and survives nonsense input', () => {
  assert.ok(corroborate(undefined, undefined) >= 0 && corroborate(undefined, undefined) <= 1)
  assert.ok(corroborate(5, 2) <= 0.95)
  assert.ok(corroborate(-3, 2) >= 0)
})

// ── ⛔ THE VOCABULARY BOUNDARY, asserted at the source of the words ────────────────────────────────
test('⛔⛔ the axis values are INTERNAL — none of them is a phrase she should ever say', () => {
  // Ote: "that's an internal cognition state, not language I want exposed to Sotera."
  // This test does not police the payload (that is the cognition-vocabulary check); it pins the intent at
  // the definition site, so a future edit cannot quietly turn a value into user-facing prose.
  const all = [...Object.values(SOURCE), ...Object.values(BASIS), ...Object.values(AVAILABILITY), ...Object.values(RETENTION)]
  for (const v of all) {
    assert.match(v, /^[a-z-]+$/, `${v} must stay a machine token — lowercase and hyphens only, never a sentence`)
    assert.ok(v.length <= 24, `${v} is long enough to read like prose`)
  }
})
