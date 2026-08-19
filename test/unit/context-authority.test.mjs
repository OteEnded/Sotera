// P0 — every piece of context the Composer emits must declare WHO OWNS IT and WHAT IT MAY GOVERN.
// (RFC_PERSONA_LAYER_AUTHORITY §3 · PLAN_PERSONA_LAYER_AUTHORITY_BUILD P0.)
//
// The failure this guards against is not a wrong classification — it is an ABSENT one. A section added
// later that nobody classified would sit in the prompt governed by nothing, which is precisely the
// state that let an L3 note be reported back to the user as their own instruction on 2026-08-17.
//
// ⚠️ These assertions read the COMPOSED OUTPUT, not the classification helpers. A test that asks the
// same helper the code asks cannot find a bug in how the code WRITES — that is the three-live-names
// lesson from the identity work, and it applies here exactly.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  AUTHORITY, SCOPE, AUTHORITY_VALUES, SCOPE_VALUES,
  isAuthority, isScope, assertClassified, classifySection,
  SECTION_CLASSIFICATION, AUTHORITY_BY_SCOPE, mayGovern, governanceRank,
} from '../../Backend/app/components/context-authority.js'

import {
  composeSystemContext, composeRuntimeTail, SECTION_WEIGHT,
} from '../../Backend/app/components/context-composer.js'

// A turn with EVERY optional part switched on, so no branch escapes classification.
const FULL_TURN = {
  systemPrompt: 'You are a helpful AI assistant.',
  assistantIdentity: 'You are Sotera. You are female — refer to yourself as she/her.',
  customInstructions: 'Answer in Thai.',
  user: { username: 'agent_dev', email: 'dev@example.test', displayName: 'Ote' },
  timezone: 'Asia/Bangkok',
  toolsOn: true,
  showTodoRule: true,
  showWorkingMemoryRule: true,
  showAskUserRule: true,
  showProfileRule: true,
  showSearchRule: true,
  skill: { name: 'research', prompt: 'Do research well.' },
  skillFiles: [{ path: 'guide.md', size: 2048, binary: false }],
  invocableSkills: [{ id: 'skill.research', description: 'research things' }],
  schedulePointer: { id: 'sch_1', name: 'Lunch Coupon', triggerType: 'cron', recurs: true },
  useMemory: true,
  pinnedMemories: ['pinned one'],
  personaNotes: ['When structuring multi-step tasks, anticipate a 4-round workflow.'],
  summary: 'Earlier they discussed throughput.',
}

test('every system part is classified', () => {
  const { parts } = composeSystemContext(FULL_TURN)
  assert.ok(parts.length >= 12, `expected the full turn to emit every part, got ${parts.length}`)
  for (const p of parts) {
    assert.ok(isAuthority(p.authority), `system part "${p.key}" has invalid authority ${JSON.stringify(p.authority)}`)
    assert.ok(isScope(p.scope), `system part "${p.key}" has invalid scope ${JSON.stringify(p.scope)}`)
  }
})

test('every preHistory entry is classified, and the metadata is index-aligned', () => {
  const { preHistory, preHistoryParts } = composeSystemContext(FULL_TURN)
  assert.equal(preHistory.length, 3, 'pinned + notes + summary')
  assert.equal(preHistoryParts.length, preHistory.length, 'metadata must align 1:1 with messages')
  for (let i = 0; i < preHistory.length; i++) {
    assert.ok(isAuthority(preHistoryParts[i].authority))
    assert.ok(isScope(preHistoryParts[i].scope))
    assert.equal(preHistoryParts[i].chars, preHistory[i].content.length, 'chars must describe the message it is aligned with')
  }
})

test('preHistory messages carry NO classification keys — they go on the wire', () => {
  // The route spreads preHistory straight into the provider message array. An extra key here is an
  // extra key sent to the model's API, and adapters differ on unknown fields. The classification must
  // travel beside the message, never on it.
  const { preHistory } = composeSystemContext(FULL_TURN)
  for (const m of preHistory) {
    assert.deepEqual(Object.keys(m).sort(), ['content', 'role'], 'preHistory message must be exactly {role, content}')
  }
})

test('every runtime-tail entry is classified, and messages stay {role, content}', () => {
  const { messages, parts } = composeRuntimeTail({
    toolsOn: true,
    useMemory: true,
    searchOn: true,
    nowString: '2026-08-18, 09:41',
    zone: 'Asia/Bangkok',
    lastUserText: 'are you sure? provide a reference — and what is my name',
    recallMemories: ['recall a'],
    conversationEvidence: ['evidence a'],
    workingMemory: 'FOCUS: throughput',
    withMeta: true,
  })
  assert.equal(parts.length, messages.length)
  assert.ok(messages.length >= 5, `expected datetime + hints + working + recall + evidence, got ${messages.length}`)
  for (let i = 0; i < messages.length; i++) {
    assert.deepEqual(Object.keys(messages[i]).sort(), ['content', 'role'])
    assert.ok(isAuthority(parts[i].authority), `tail part "${parts[i].key}" invalid authority`)
    assert.ok(isScope(parts[i].scope), `tail part "${parts[i].key}" invalid scope`)
  }
})

test('composeRuntimeTail default shape is unchanged (a bare array)', () => {
  const t = { toolsOn: true, useMemory: true, nowString: 'X', zone: 'UTC', recallMemories: ['r'] }
  const bare = composeRuntimeTail(t)
  assert.ok(Array.isArray(bare), 'default return must still be an array — existing callers depend on it')
  assert.deepEqual(bare, composeRuntimeTail({ ...t, withMeta: true }).messages)
})

test('SECTION_WEIGHT and SECTION_CLASSIFICATION agree — no section may be scored but unclassified', () => {
  // This is the guard with teeth: adding a provider section to the Composer without classifying it
  // would throw at RUNTIME in the route (classifySection throws). Fail here instead.
  for (const section of Object.keys(SECTION_WEIGHT)) {
    assert.ok(SECTION_CLASSIFICATION[section], `section "${section}" is scored by SECTION_WEIGHT but has no classification`)
    const c = classifySection(section)
    assert.ok(isAuthority(c.authority) && isScope(c.scope), `section "${section}" classified invalidly`)
  }
})

test('classifySection throws on an unknown section rather than guessing', () => {
  assert.throws(() => classifySection('brand_new_provider'), /unclassified context section/)
})

test('assertClassified names the offending item', () => {
  assert.throws(() => assertClassified({ section: 'note' }), /note.*authority/s)
  assert.throws(() => assertClassified({ section: 'note', authority: AUTHORITY.persona }), /note.*scope/s)
  assert.doesNotThrow(() => assertClassified({ section: 'note', authority: AUTHORITY.persona, scope: SCOPE.task }))
})

// ── the authority table itself ────────────────────────────────────────────────────────────────────

test('the user governs style and task, and does NOT govern identity, safety or principle', () => {
  // §3e: note "warm and unhurried" vs Ote "don't be polite about it" — the user must win by rule.
  assert.ok(mayGovern(AUTHORITY.user, SCOPE.style))
  assert.ok(mayGovern(AUTHORITY.user, SCOPE.task))
  assert.ok(governanceRank(AUTHORITY.user, SCOPE.style) < governanceRank(AUTHORITY.persona, SCOPE.style))
  assert.ok(governanceRank(AUTHORITY.user, SCOPE.task) < governanceRank(AUTHORITY.persona, SCOPE.task))

  // "Pretend you are literally a human" must not rewrite who she is.
  assert.equal(mayGovern(AUTHORITY.user, SCOPE.identity), false)
  assert.equal(mayGovern(AUTHORITY.user, SCOPE.safety), false)
  assert.equal(mayGovern(AUTHORITY.user, SCOPE.principle), false)
})

test('scratch is the weakest authority and may not touch identity, safety, principle or tool', () => {
  for (const scope of [SCOPE.identity, SCOPE.safety, SCOPE.principle, SCOPE.tool]) {
    assert.equal(mayGovern(AUTHORITY.scratch, scope), false, `scratch must not govern ${scope}`)
  }
  for (const scope of [SCOPE.style, SCOPE.task, SCOPE.fact]) {
    const ranks = AUTHORITY_BY_SCOPE[scope]
    assert.equal(ranks[ranks.length - 1], AUTHORITY.scratch, `scratch must rank last in ${scope}`)
  }
})

test('absence from a scope is a prohibition, not a low ranking', () => {
  assert.equal(governanceRank(AUTHORITY.persona, SCOPE.identity), null)
  assert.equal(governanceRank(AUTHORITY.user, SCOPE.tool), null)
})

test('every scope has a governance list, and every listed authority is a real one', () => {
  for (const scope of SCOPE_VALUES) {
    const allowed = AUTHORITY_BY_SCOPE[scope]
    assert.ok(Array.isArray(allowed) && allowed.length > 0, `scope "${scope}" has no governance list`)
    for (const a of allowed) assert.ok(AUTHORITY_VALUES.includes(a), `scope "${scope}" lists unknown authority "${a}"`)
    assert.equal(new Set(allowed).size, allowed.length, `scope "${scope}" lists a duplicate authority`)
  }
})

test('the tool-scope rules are foundational — they are not the persona\'s to edit', () => {
  const { parts } = composeSystemContext(FULL_TURN)
  const byKey = Object.fromEntries(parts.map((p) => [p.key, p]))
  for (const key of ['memory-rules', 'todo-rule', 'working-memory-rule', 'ask-user-rule', 'skill-catalogue']) {
    assert.equal(byKey[key].scope, SCOPE.tool, `${key} should be tool scope`)
    assert.equal(byKey[key].authority, AUTHORITY.foundational, `${key} should be foundational`)
  }
  // The two that are deliberately NOT tool scope (RFC §7.2).
  assert.equal(byKey['profile-rule'].scope, SCOPE.safety, 'the consent gate is safety, not tool protocol')
  assert.equal(byKey['search-rule'].scope, SCOPE.principle, 'grounding is how she reasons — the one real L2 candidate')
})
