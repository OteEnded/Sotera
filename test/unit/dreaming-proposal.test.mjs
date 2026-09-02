// ⭐⭐ UNIT · what Dreaming proposes — an ORDINARY SLOT CLAIM. (M2-7)
//
//   node --test unit/dreaming-proposal.test.mjs
//
// ⚠️⚠️ THIS FILE USED TO TEST A CLOSED GRAMMAR that no longer exists. It exercised five bespoke forms,
// typed slots, an existential-only quantifier and a deterministic renderer — the design that guaranteed
// *"the model never produces a sentence."* ⭐ **M2-7 retired that grammar on 2026-09-01**, and the code
// was removed on 2026-09-03.
//
// ⛔ THE OLD TESTS ARE NOT KEPT COMMENTED-OUT. A test for a deleted API is not evidence of anything; it
// is a second, stale description of a design nobody can run. ⭐ What IS kept is the reason, above, and
// the pointer below — so a reader who comes here looking for the forms learns where they went.
//
// ⇒ ⭐ THE SEMANTIC RED-PROOFS FOR THE RETIREMENT LIVE IN `test/checks/dreaming-m2-7-check.mjs`, which
// asserts both halves: that the old vocabulary is gone AND that what replaced it works. ⓘ Ote required
// that separately: *"a deliberate implementation change against an already-locked semantic ruling…
// should have its own red-proof."*
//
// ⭐ What remains HERE is ordinary unit coverage of the pure functions — the cheap, fast layer.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateClaim, mayPublish, valueOfClaim, T0_FIELDS,
} from '../../Backend/app/components/dreaming-proposal.js'

const CLAIM = Object.freeze({
  entity: 'user',
  attribute: 'review-style',
  value: 'asks for the numbers before the opinion',
  kind: 'habit',
  cites: [{ root: 'r1', span: 'numbers first' }],
})

test('a well-formed ordinary claim validates', () => {
  const v = validateClaim(CLAIM)
  assert.equal(v.ok, true, v.why)
  assert.equal(v.attribute, 'review-style')
})

test('every required field is required', () => {
  for (const bad of [
    { ...CLAIM, entity: undefined },
    { ...CLAIM, attribute: undefined },
    { ...CLAIM, value: '' },
    { ...CLAIM, kind: undefined },
    { ...CLAIM, cites: [] },
  ]) assert.equal(validateClaim(bad).ok, false)
})

// ⚠️ A slot address is a POINTER INTO THE EXISTING STORE, and 33% of live attributes contain a space.
// An identifier-shaped rule refused a third of them — measured by the 12b run, fixed, and pinned here.
test('a real live slot address validates, spaces and all', () => {
  for (const real of ['communication preference', 'account identity', 'Thai name spelling']) {
    assert.equal(validateClaim({ ...CLAIM, attribute: real }).ok, true, real)
  }
})

test('but an address is still one line, and not blank', () => {
  assert.equal(validateClaim({ ...CLAIM, attribute: ' leading' }).ok, false)
  assert.equal(validateClaim({ ...CLAIM, attribute: 'two\nlines' }).ok, false)
})

// ⛔⛔ M2-7 MADE MECHANICAL: the retired vocabulary cannot return through a caller.
test('a `dreaming:`-prefixed address is refused on either side', () => {
  assert.equal(validateClaim({ ...CLAIM, attribute: 'dreaming:recurrence' }).ok, false)
  assert.equal(validateClaim({ ...CLAIM, entity: 'dreaming:sotera' }).ok, false)
})

// ⛔ The warrant is a SEPARATE object — a value that argues for itself fuses a claim and a receipt,
// and the two have different lifetimes.
test('a value that states its own evidence is refused', () => {
  assert.equal(validateClaim({ ...CLAIM, value: 'she does this, verified across 3 independent roots' }).ok, false)
  // ⭐ …but it is not a keyword ban: an ordinary value that happens to contain a number is fine.
  assert.equal(validateClaim({ ...CLAIM, value: 'prefers 3-space indentation' }).ok, true)
})

test('publication fails closed — room yes, persona_global no', () => {
  assert.equal(mayPublish(CLAIM, { destination: 'room' }).ok, true)
  assert.equal(mayPublish(CLAIM, { destination: 'persona_global' }).ok, false)
})

test('the value is the value — nothing is rendered from a template', () => {
  assert.equal(valueOfClaim(CLAIM), CLAIM.value)
  assert.equal(valueOfClaim({ ...CLAIM, value: '' }), null)
})

test('the structural allowlist still excludes every free-text column', () => {
  for (const banned of ['text', 'reason', 'failure', 'content', 'value']) {
    assert.equal(T0_FIELDS.includes(banned), false, `${banned} must not be readable`)
  }
})
