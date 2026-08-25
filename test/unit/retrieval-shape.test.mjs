// ⭐⭐⭐ THE PAYLOAD SHAPES ARE A CONTROLLED COMPARISON, SO THE CONTROL ARM MUST BE PROVABLY UNCHANGED.
//
// ⓘ B4 left one question open: when `about:` matches 292 of 298 conversations, what should come back?
// ⭐ ANSWERED AND SHIPPED 2026-08-25 — `windows-first` is the default. It removes nothing: same payload,
// same full inventory, same coverage wording; the evidence simply comes before the inventory, which moved
// the answer from 83% depth to 37%. ⛔ The losing arms stay SELECTABLE, because `current` is what the
// frozen baseline in `test/results/b4/` was measured under and an unreproducible baseline is not one.
//
// ⛔ AND NO SHAPE MAY BE CHOSEN BECAUSE IT MADE ONE BENCHMARK PASS. Ote: *"We want the retrieval
// interface to make good reasoning natural, not merely make this one benchmark pass."*

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHAPES, shapeOf, DEFAULT_SHAPE } from '../../Backend/app/components/conversation-retrieval.js'

const SRC = readFileSync(new URL('../../Backend/app/components/conversation-retrieval.js', import.meta.url), 'utf8')
// ⛔ Comments stripped: every assertion below is about the CODE, and this repo's most repeated defect is a
// scan that matched its own explanatory prose.
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '')

test('⭐⭐⭐ the SHIPPED DEFAULT is `windows-first` — absent config, empty config, and a typo all agree', () => {
  // ⭐ Ote's ruling, 2026-08-25, after the comparison: *"ship windows-first as the default … Keep the full
  // information and simply put the actual evidence/windows before the inventory."*
  assert.equal(DEFAULT_SHAPE, SHAPES.windowsFirst)
  assert.equal(shapeOf(undefined), SHAPES.windowsFirst)
  assert.equal(shapeOf({}), SHAPES.windowsFirst)
  assert.equal(shapeOf({ memory: {} }), SHAPES.windowsFirst)
  // ⛔ A typo must not invent a fifth shape and silently run an unmeasured arm in production.
  assert.equal(shapeOf({ memory: { retrievalPayloadShape: 'windows_first' } }), SHAPES.windowsFirst)
  assert.equal(shapeOf({ memory: { retrievalPayloadShape: 'bounded-inventory' } }), SHAPES.boundedInventory)
})

test('⭐ every measured arm stays SELECTABLE, so the frozen benchmark can be reproduced', () => {
  // ⛔ The losing shapes are the experiment's apparatus, not dead code. `current` in particular must
  // remain reachable or the baseline in test/results/b4/ can never be re-run against.
  for (const v of Object.values(SHAPES)) assert.equal(shapeOf({ memory: { retrievalPayloadShape: v } }), v)
})

test('⛔ shipping the default changed the SELECTION only — the payload branches are untouched', () => {
  // Ote: *"don't change the payload beyond the tested windows-first behavior. I want this commit to mean
  // exactly: same information → evidence first → inventory afterward, not «we also changed the coverage
  // semantics / sampling / retrieval logic»."*
  // ⇒ the windows-first branch must still be the same pure reordering that was measured, and the
  // inventory it carries must still be the FULL one.
  assert.match(code, /shape === SHAPES\.windowsFirst\s*\r?\n?\s*\? \{ windows, conversations: inventory_, alsoMatched: undefined \}/,
    'the measured branch, unchanged')
  assert.match(code, /const inventory_ = shape === SHAPES\.boundedInventory/,
    '⛔ only bounded-inventory narrows the inventory — windows-first still carries all of it')
  assert.match(code, /notSampled: notSampledText/, 'coverage still reports the same count')
  assert.match(code, /narrow it with about:, between: or where:, or ask again/,
    '⛔ the coverage WORDING is unchanged — plain-coverage was not shipped alongside')
})

test('⛔ exactly ONE arm is allowed to touch the B1 inventory contract', () => {
  // The inventory is returned to EVERY asker because cross-room `inspect_around` needs a handle, and the
  // account with automatic authorization was once the only one that could not obtain one. ⇒ a shape that
  // quietly narrowed it would reintroduce exactly that, so the narrowing is pinned to one named shape.
  assert.match(code, /shape === SHAPES\.boundedInventory[\s\S]{0,40}fullInventory\.filter/,
    'only bounded-inventory filters the inventory')
  assert.ok(!/shape === SHAPES\.windowsFirst[\s\S]{0,200}fullInventory\.filter/.test(code),
    '⛔ windows-first must MOVE the inventory, never shrink it')
})

test('⭐ windows-first is a pure reordering — both keys present, neither rebuilt', () => {
  const m = code.match(/shape === SHAPES\.windowsFirst[\s\S]{0,220}/)
  assert.ok(m, 'the windows-first branch is still here (⛔ this assertion may not go vacuous)')
  assert.match(m[0], /\{ windows, conversations: inventory_/, 'same two keys, opposite order')
})

test('⛔ plain-coverage keeps the NUMBER and drops the imperative', () => {
  // ⚠️ SCOPED TO ONE BRANCH ON PURPOSE. The first version of this took a 400-character window from
  // `shape === SHAPES.plainCoverage`, which spans BOTH arms of the ternary — so it read `current`'s
  // imperative and failed while the code was right. ⭐ A window that straddles the thing it is
  // distinguishing cannot distinguish it.
  const plain = code.match(/\? `\$\{rows\.length - windows\.length\} other conversations[^`]*`/)
  assert.ok(plain, 'the plain-coverage wording is still here (⛔ this assertion may not go vacuous)')
  assert.match(plain[0], /rows\.length - windows\.length/, 'the same count is still reported')
  // ⛔ It must not tell her she has everything — that would be false, and suppressing a legitimate second
  // look is a worse defect than provoking one.
  assert.ok(!/that is all|nothing else|you have everything/i.test(plain[0]), 'no false completeness claim')
  assert.ok(!/narrow it with|ask again/.test(plain[0]), 'no instruction to keep searching')
  // ⭐ …and the imperative still exists, as what `current` says. Deleting it outright would silently
  // convert the control arm into a fourth treatment.
  assert.match(code, /narrow it with about:, between: or where:, or ask again/, '`current` is unchanged')
})

test('⚠️ the aggregate carries counts and identity only — never content', () => {
  const m = code.match(/const alsoMatched = byPerson\.size[\s\S]{0,420}/)
  assert.ok(m, 'the aggregate branch is still here')
  for (const forbidden of ['said', 'excerpt', 'content', 'turns']) {
    assert.ok(!new RegExp(`\\b${forbidden}\\b`).test(m[0]),
      `⛔ the inventory rule is counts and identity only — "${forbidden}" would break it`)
  }
  assert.match(m[0], /conversations:|withWhom:/, 'and it does report how many, with whom')
})
