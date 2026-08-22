// `access_sotera_memory` — the account-level capability from migration 021.
//
// ⭐⭐⭐ THE ONE THING THESE TESTS EXIST TO PIN, because getting it backwards would be worse than not having
// the capability at all. Ote, 2026-08-21:
//
//   *"Sotera's own access to Sotera memory is not an account-level permission. Sotera is the owner of that
//    memory, so when Sotera is operating, she should intrinsically be able to access her own memory. The
//    account-level capability exists for other accounts accessing Sotera's memory."*
//
//   *"Don't make memory_access_scope the mechanism that lets Sotera remember herself. That would
//    accidentally make her own autobiography dependent on whichever account happens to be talking to her."*
//
// ⇒ `hermes = none` must NOT fracture her when Hermes is talking to her. The capability answers *"may this
// ACCOUNT be given her memory?"* and nothing else.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { can, capabilitiesFor } from '../../Backend/app/auth/permissions.js'

const acct = (scope, extra = {}) => ({ id: 'u1', username: 'someone', roles: ['member'], isRoot: false, memoryAccessScope: scope, ...extra })

test('⭐ a granted account may be given her memory', () => {
  assert.equal(can(acct('sotera_memory'), 'access_sotera_memory'), true)
})

test('⛔ an ungranted account may not', () => {
  assert.equal(can(acct('none'), 'access_sotera_memory'), false)
})

test('⭐ root holds it — root is the granting authority and the system owner', () => {
  assert.equal(can({ isRoot: true, roles: ['root'] }, 'access_sotera_memory'), true)
})

test('⛔⛔ FAILS CLOSED: a user object with NO scope field is not granted', () => {
  // An older session, an API caller shaped by a different allowlist, a mock in a test. `!== "none"` would
  // have made every one of those a grant — this project's most-repeated defect wearing a boolean.
  assert.equal(can({ id: 'x', roles: ['member'], isRoot: false }, 'access_sotera_memory'), false)
  assert.equal(can({ id: 'x', memoryAccessScope: undefined }, 'access_sotera_memory'), false)
  assert.equal(can({ id: 'x', memoryAccessScope: null }, 'access_sotera_memory'), false)
  assert.equal(can({ id: 'x', memoryAccessScope: '' }, 'access_sotera_memory'), false)
})

test('⛔ an unknown scope value is not a grant either', () => {
  for (const v of ['global', 'all', 'cross_room', 'sotera', 'SOTERA_MEMORY', true, 1]) {
    assert.equal(can(acct(v), 'access_sotera_memory'), false, `${JSON.stringify(v)} must not grant`)
  }
})

test('⛔ no ROLE grants it — this is per-account, which is the whole point', () => {
  // Before 021 the only way to hold broad reach was to BE root. A tier must not smuggle it back in.
  for (const role of ['admin', 'developer', 'power', 'member']) {
    assert.equal(can({ id: 'x', roles: [role], isRoot: false }, 'access_sotera_memory'), false,
      `role ${role} must not confer memory access — a role here is a TIER, not a grant`)
  }
})

test('⛔ no other capability moved', () => {
  // Adding a capability must not widen the existing ones. `power` gets select_model and nothing new.
  const power = { id: 'x', roles: ['power'], isRoot: false, memoryAccessScope: 'none' }
  assert.equal(can(power, 'select_model'), true)
  assert.equal(can(power, 'console'), false)
  assert.equal(can(power, 'manage_users'), false)
  assert.equal(can(power, 'access_sotera_memory'), false)
})

test('the capability appears in the reported set, so a UI can show it', () => {
  const caps = capabilitiesFor(acct('sotera_memory'))
  assert.equal(caps.access_sotera_memory, true)
  assert.equal(capabilitiesFor(acct('none')).access_sotera_memory, false)
})

test('⛔ an absent user is never granted anything', () => {
  assert.equal(can(null, 'access_sotera_memory'), false)
  assert.equal(can(undefined, 'access_sotera_memory'), false)
})

// ── ⭐⭐⭐ THE STRUCTURAL ASSERTION: THE COGNITION LAYER MUST NEVER CONSULT THIS ────────────────────
//
// ⛔ If this capability ever appears in a retrieval, ranking or fusion decision, the model has been
// inverted and her own autobiography has become dependent on whoever is talking to her. A source scan is
// crude and it is exactly the right crudeness here: the mistake would be a single line, and no behavioural
// test would catch it because the account granting it would look fine.
test('⛔⛔ no cognition-layer file reads the capability or the column', () => {
  const files = [
    'memory-cognition-host.js', 'memory-cognition-cues.js', 'memory-cognition-axes.js',
    'memory-cognition-projection.js', 'memory-cognition-vocabulary.js',
  ]
    // ⚠️ CODE ONLY — a cognition file QUOTES Ote's constraint in a comment, and penalising a file for
    // citing the rule it obeys is backwards. The constraint is about CODE.
    const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')
  for (const f of files) {
    const src = code(readFileSync(new URL(`../../Backend/app/components/${f}`, import.meta.url), 'utf8'))
    assert.ok(!/access_sotera_memory/.test(src),
      `${f} references the capability — cognition must never ask whether she is allowed to remember`)
    assert.ok(!/memory_access_scope|memoryAccessScope/.test(src),
      `${f} references the column — enforcement belongs in auth/permissions.js, not in cognition`)
  }
})

test('⭐ and the capability is documented as an ACCOUNT question at its definition site', () => {
  // Cheap, and it protects the one sentence that keeps the two edges apart. A future reader who sees only
  // the predicate could reasonably assume it gates her own recall; the comment is what prevents that.
  const src = readFileSync(new URL('../../Backend/app/auth/permissions.js', import.meta.url), 'utf8')
  assert.match(src, /NOT "MAY SOTERA REMEMBER"/i)
  assert.match(src, /COGNITION LAYER MUST NEVER CONSULT THIS/i)
})
