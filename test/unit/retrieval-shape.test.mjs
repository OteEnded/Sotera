// ⭐⭐⭐ THE PAYLOAD SHAPES ARE A CONTROLLED COMPARISON, SO THE CONTROL ARM MUST BE PROVABLY UNCHANGED.
//
// ⓘ B4 left one question open: when `about:` matches 292 of 298 conversations, what should come back?
// Three candidate shapes now exist behind one config key. ⛔ `current` is the default and ships unchanged —
// if that is not true, the recorded baseline is not a baseline and every arm is measured against nothing.
//
// ⛔ AND NO SHAPE MAY BE CHOSEN BECAUSE IT MADE ONE BENCHMARK PASS. Ote: *"We want the retrieval
// interface to make good reasoning natural, not merely make this one benchmark pass."*

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHAPES, shapeOf } from '../../Backend/app/components/conversation-retrieval.js'

const SRC = readFileSync(new URL('../../Backend/app/components/conversation-retrieval.js', import.meta.url), 'utf8')
// ⛔ Comments stripped: every assertion below is about the CODE, and this repo's most repeated defect is a
// scan that matched its own explanatory prose.
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '')

test('⭐⭐⭐ the DEFAULT is `current` — absent config, empty config, and a typo all agree', () => {
  assert.equal(shapeOf(undefined), SHAPES.current)
  assert.equal(shapeOf({}), SHAPES.current)
  assert.equal(shapeOf({ memory: {} }), SHAPES.current)
  // ⛔ A typo must not invent a fourth shape and silently run an unmeasured arm in production.
  assert.equal(shapeOf({ memory: { retrievalPayloadShape: 'windows_first' } }), SHAPES.current)
  assert.equal(shapeOf({ memory: { retrievalPayloadShape: 'bounded-inventory' } }), SHAPES.boundedInventory)
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
