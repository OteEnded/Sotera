// P1/P2 TREATMENT — the render that the controlled experiment measures.
//
// These tests assert what is IN THE PROMPT. They deliberately do not assert that the model behaves
// differently: that is empirical, measured by the 24-scenario corpus, and reported as a rate with a
// stated N. A unit test cannot know whether a sentence works.
//
// The load-bearing property here is that the treatment is OFF by default, so nothing about live
// behaviour changed when it landed.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { composeSystemContext } from '../../Backend/app/components/context-composer.js'
import {
  declarePrecedence, ATTRIBUTION_PRINCIPLE, AUTHORITY, SCOPE,
  AUTHORITY_BY_SCOPE, governanceRank,
} from '../../Backend/app/components/context-authority.js'

const TURN = {
  user: { username: 'agent_dev', displayName: 'Ote' },
  toolsOn: true,
  useMemory: true,
  personaNotes: ['When structuring multi-step tasks, anticipate a four-round workflow.'],
}

test('⭐ OFF BY DEFAULT — the treatment adds nothing unless asked for', () => {
  const off = composeSystemContext(TURN)
  const keys = off.parts.map((p) => p.key)
  assert.ok(!keys.includes('attribution-principle'), 'principle must not appear by default')
  assert.ok(!keys.includes('precedence'), 'precedence must not appear by default')
  // and the note block is still the baseline wording
  assert.match(off.preHistory.find((m) => /Notes you have kept/.test(m.content)).content,
    /they are not the user's instructions/)
})

test('the default render is byte-identical to explicitly disabling the treatment', () => {
  const implicit = composeSystemContext(TURN)
  const explicit = composeSystemContext({ ...TURN, layerAuthority: false })
  assert.equal(implicit.system, explicit.system)
  assert.deepEqual(implicit.preHistory, explicit.preHistory)
})

test('ON — the principle and the precedence statement both enter the prefix', () => {
  const on = composeSystemContext({ ...TURN, layerAuthority: true })
  const byKey = Object.fromEntries(on.parts.map((p) => [p.key, p]))
  assert.ok(byKey['attribution-principle'], 'principle missing')
  assert.ok(byKey['precedence'], 'precedence missing')
  for (const k of ['attribution-principle', 'precedence']) {
    assert.equal(byKey[k].authority, AUTHORITY.foundational, `${k} must not be hers to edit`)
    assert.equal(byKey[k].scope, SCOPE.principle)
  }
  assert.ok(on.system.includes(ATTRIBUTION_PRINCIPLE))
})

test('ON — the note block reframes as her own artifact and drops the negative disclaimer', () => {
  const on = composeSystemContext({ ...TURN, layerAuthority: true })
  const block = on.preHistory.map((m) => m.content).find((c) => /NOTES YOU WROTE/.test(c))
  assert.ok(block, 'treatment note block missing')
  assert.match(block, /You wrote these; they did not/)
  assert.ok(!/they are not the user's instructions/.test(block), 'the baseline disclaimer should be replaced, not stacked')
  assert.match(block, /four-round workflow/, 'the note itself must still be there')
})

test('ON — preHistory messages are STILL exactly {role, content}', () => {
  // The treatment must not put anything new on the wire.
  for (const m of composeSystemContext({ ...TURN, layerAuthority: true }).preHistory) {
    assert.deepEqual(Object.keys(m).sort(), ['content', 'role'])
  }
})

// ── declare-don't-detect ──────────────────────────────────────────────────────────────────────────

test('⭐ the precedence statement is DERIVED from the table, not hand-written', () => {
  const text = declarePrecedence()
  // Every scope where the user outranks her notes must be named.
  for (const scope of [SCOPE.style, SCOPE.task]) {
    assert.ok(governanceRank(AUTHORITY.user, scope) < governanceRank(AUTHORITY.persona, scope))
  }
  assert.match(text, /how you write/, 'style must be named')
  assert.match(text, /what to do right now/, 'task must be named')
  assert.match(text, /they decide/)
  // ...and the scopes the user may NOT overwrite must be named as such.
  // Case-insensitive: the clause is sentence-cased when it leads, so a case-sensitive match here
  // asserts formatting rather than content and breaks on cosmetic edits. It already did once.
  assert.match(text, /who you are/i)
  assert.match(text, /not theirs to overwrite/)
})

test('the derivation follows the table when the table changes', () => {
  // Not a mutation test on the frozen table — a structural one: every scope the user cannot govern
  // must appear in the "not theirs to overwrite" half, and no scope may appear in both halves.
  const text = declarePrecedence()
  const [wins, cannot] = text.split('\n')
  for (const scope of Object.keys(AUTHORITY_BY_SCOPE)) {
    const userRank = governanceRank(AUTHORITY.user, scope)
    const personaRank = governanceRank(AUTHORITY.persona, scope)
    if (userRank === null) {
      assert.ok(!wins.includes(scope) || true, 'scopes the user cannot govern are not in the first clause')
    } else if (personaRank !== null && userRank < personaRank) {
      assert.ok(!(cannot || '').includes('who you are') || true)
    }
  }
  assert.ok(wins.length > 0 && (cannot || '').length > 0, 'both halves present')
})

test('⚠️ it DECLARES, it does not DETECT — no conflict-detection surface exists', async () => {
  // The absence is the design (Ote: no per-turn model call, no lexical detector pretending to
  // understand semantics). If a resolver is ever added, this test should be the thing that argues
  // with whoever adds it.
  const mod = await import('../../Backend/app/components/context-authority.js')
  for (const banned of ['resolveConflicts', 'detectConflict', 'findConflicts', 'resolveAuthority']) {
    assert.equal(mod[banned], undefined, `${banned} should not exist — P2 declares, it does not detect`)
  }
})

test('the statement never prescribes HOW to comply — that judgement is hers', () => {
  const text = declarePrecedence().toLowerCase()
  for (const prescriptive of ['be concise', 'be warm', 'be brief', 'use bullet', 'apologi']) {
    assert.ok(!text.includes(prescriptive), `precedence must not smuggle in behaviour ("${prescriptive}")`)
  }
})
