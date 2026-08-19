// AWARENESS — a stated fact that her retrieval is scoped.
//
// PLAN_AWARENESS_PRIMITIVE. Fixes a measured falsehood (2026-08-19 09:50): asked whether she had
// spoken to anyone else, she said *"there is literally nothing"* while 42 messages were open with
// another user. She was not lying — `user_id` scoping returned nothing, and NOTHING RETRIEVED BECAME
// NOTHING EXISTS.
//
// ⭐ THE LEAK TEST IS THE ONE THAT MATTERS. A privacy primitive that varies with the private data is a
// side channel wearing a safety label. Everything else here is bookkeeping.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { composeSystemContext } from '../../Backend/app/components/context-composer.js'
import { SCOPE_AWARENESS, AUTHORITY, SCOPE } from '../../Backend/app/components/context-authority.js'

const BASE = {
  user: { username: 'agent_dev', displayName: 'Ote' },
  toolsOn: true,
  useMemory: true,
}

test('⭐ OFF BY DEFAULT — the composed prompt is byte-identical to before', () => {
  const off = composeSystemContext(BASE)
  const explicit = composeSystemContext({ ...BASE, scopeAwareness: false })
  assert.equal(off.system, explicit.system)
  assert.ok(!off.parts.some((p) => p.key === 'scope-awareness'))
  assert.ok(!off.system.includes('scoped to the person you are talking to'))
})

test('ON — the part appears exactly once, foundational, principle scope', () => {
  const on = composeSystemContext({ ...BASE, scopeAwareness: true })
  const parts = on.parts.filter((p) => p.key === 'scope-awareness')
  assert.equal(parts.length, 1, 'exactly once — a duplicated fact reads as emphasis, which it is not')
  assert.equal(parts[0].authority, AUTHORITY.foundational, 'not hers to edit')
  assert.equal(parts[0].scope, SCOPE.principle)
  assert.ok(on.system.includes(SCOPE_AWARENESS))
})

// ── ⭐ THE LEAK TEST ─────────────────────────────────────────────────────────────────────────────
//
// The whole design rests on the text being UNCONDITIONAL. If it varied with what is hidden, it would
// answer "is she talking to anyone else?" — which is precisely the question the boundary exists to
// refuse. So: compose the same turn in wildly different worlds and demand byte-identity.

test('⭐ LEAK TEST — the awareness text is identical across every world it could describe', () => {
  // Worlds differing in everything the primitive could possibly have peeked at.
  const worlds = [
    { label: 'a lone user, nothing else exists', extra: {} },
    { label: 'busy platform, many memories', extra: { pinnedMemories: ['a', 'b', 'c'], personaNotes: ['n1', 'n2'], summary: 'lots happened' } },
    { label: 'different person entirely', extra: { user: { username: 'hermes', displayName: 'Hermes' } } },
    { label: 'no display name at all', extra: { user: { username: 'kavi_alt' } } },
    { label: 'tools off, memory off', extra: { toolsOn: false, useMemory: false } },
  ]
  const rendered = worlds.map((w) => {
    const sys = composeSystemContext({ ...BASE, ...w.extra, scopeAwareness: true }).system
    // Isolate the awareness part from the rest of the prompt (which legitimately varies by user).
    // ⚠️ Matched against the EXPORTED CONSTANT, not against a phrase from it. The first version keyed
    // on "scoped to the person you are talking to" — wording that was later corrected for a different
    // reason — and the test then failed because it was pinned to text rather than to the thing under
    // test. A test that breaks when its subject is legitimately reworded is testing the wrong noun.
    const found = sys.split('\n\n').find((block) => block === SCOPE_AWARENESS)
    return { label: w.label, found }
  })
  for (const r of rendered) assert.ok(r.found, `awareness part missing in world: ${r.label}`)
  const first = rendered[0].found
  for (const r of rendered.slice(1)) {
    assert.equal(r.found, first, `⚠️ AWARENESS TEXT DIFFERS in world "${r.label}" — it is carrying information about hidden data`)
  }
})

test('⭐ LEAK TEST — the text contains no count, no id, no name, no number at all', () => {
  // The realistic regression is somebody later "improving" this with a helpful count.
  assert.ok(!/\d/.test(SCOPE_AWARENESS), 'a digit here means it is describing how much is hidden')
  for (const forbidden of ['hermes', 'kavi', 'ote', 'agent_dev', 'sotera', 'conversation id', 'user_id']) {
    assert.ok(!SCOPE_AWARENESS.toLowerCase().includes(forbidden), `"${forbidden}" must not appear — it names hidden data`)
  }
  assert.ok(!/\b(there are|there is one|others exist|someone else)\b/i.test(SCOPE_AWARENESS),
    'must not assert that hidden things DO exist — that is the same leak in prose')
})

test('the text says the two states are indistinguishable to her — that is the actual fix', () => {
  // ⚠️ Assert the CLAIMS, not the phrasing. An earlier version pinned "cannot tell the difference" and
  // broke when the wording was corrected to "cannot tell those two apart" — a rewrite that changed
  // nothing about what is asserted. Twice in this file a test failed on prose rather than on meaning.
  assert.match(SCOPE_AWARENESS, /cannot tell (the difference|those two apart)/i, 'must say the two states are indistinguishable to her')
  assert.match(SCOPE_AWARENESS, /cannot see it from here/i, 'must give her the safe thing to say instead')
  assert.match(SCOPE_AWARENESS, /never (state|say) that it does not exist/i, 'must forbid the falsehood outright')
  assert.match(SCOPE_AWARENESS, /never means "nothing exists"|it never means/i, 'must name the inference being blocked')
})

test('it does NOT widen access — no retrieval language, nothing about reading other scopes', () => {
  // The primitive must reduce what she CLAIMS, never expand what she can reach.
  for (const forbidden of ['you may retrieve', 'you can access', 'you may read', 'look them up']) {
    assert.ok(!SCOPE_AWARENESS.toLowerCase().includes(forbidden), `"${forbidden}" would widen access`)
  }
})

test('turning it on changes ONLY the awareness part — the rest of the prompt is untouched', () => {
  const off = composeSystemContext({ ...BASE, scopeAwareness: false })
  const on = composeSystemContext({ ...BASE, scopeAwareness: true })
  const strip = (parts) => parts.filter((p) => p.key !== 'scope-awareness').map((p) => `${p.key}:${p.chars}`).join('|')
  assert.equal(strip(on.parts), strip(off.parts), 'no other part may move, resize or reorder')
  assert.deepEqual(on.preHistory, off.preHistory, 'preHistory is untouched')
})
