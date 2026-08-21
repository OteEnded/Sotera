// OWNERSHIP RESOLUTION — derived, never stored, and never from the storage location.
//
// ⭐⭐⭐ THE ACCEPTANCE CRITERIA OTE PUT IN FRONT OF THIS STEP, tested one by one:
//   · ownership is DERIVED, not stored;
//   · `author`, `role`, lessons/practices/intentions and episode participation stay PROVENANCE signals —
//     ⛔ do not collapse ownership into `author='persona'`;
//   · the counterpart-content-through-her-own-utterances problem stays EXPLICITLY DEFERRED.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  OWNER, ownerOf, isSoteraOwned, requiresAuthorization, ownerOfExchange, mayCarryCounterpartContent,
} from '../../Backend/app/components/memory-ownership.js'

// ── ⭐ THE RULE, PER SOURCE TYPE ───────────────────────────────────────────────────────────────────
test('her utterances are hers; the person\'s are the account\'s', () => {
  assert.equal(ownerOf({ kind: 'message', role: 'assistant' }), OWNER.sotera)
  assert.equal(ownerOf({ kind: 'message', role: 'user' }), OWNER.account)
})

test('a memory she authored is hers; one the extraction lane wrote is the account\'s', () => {
  assert.equal(ownerOf({ kind: 'memory', author: 'persona' }), OWNER.sotera)
  assert.equal(ownerOf({ kind: 'memory', author: 'account' }), OWNER.account)
})

test('lessons, practices, intentions and reflections are always hers — they are about her own conduct', () => {
  for (const kind of ['lesson', 'practice', 'intention', 'reflection']) {
    assert.equal(ownerOf({ kind }), OWNER.sotera, `${kind} must be hers`)
  }
})

test('⭐⭐ an episode she PARTICIPATED in is hers to recall', () => {
  assert.equal(ownerOf({ kind: 'episode', participated: true }), OWNER.sotera)
  assert.equal(ownerOf({ kind: 'episode', participated: false }), OWNER.unknown)
})

// ── ⛔ FAIL CLOSED, EVERYWHERE ─────────────────────────────────────────────────────────────────────
test('⛔ anything unrecognised is `unknown`, and `unknown` is never hers', () => {
  for (const src of [
    null, undefined, {}, 'message', 42,
    { kind: 'message', role: 'system' },
    { kind: 'message' },
    { kind: 'memory', author: 'sotera' },   // a plausible typo that must not grant
    { kind: 'memory' },
    { kind: 'episode' },                    // participation not stated is not participation
    { kind: 'something-new' },
  ]) {
    assert.equal(isSoteraOwned(src), false, `${JSON.stringify(src)} must not be hers`)
    assert.equal(requiresAuthorization(src), true, `${JSON.stringify(src)} must require authorization`)
  }
})

// ── ⭐⭐⭐ THE LOAD-BEARING ONE: OWNERSHIP CANNOT SEE STORAGE ──────────────────────────────────────
test('⛔⛔ the room / user_id / conversation owner cannot change the answer', () => {
  // The mechanical statement of "storage boundaries must not become cognitive boundaries". Passing every
  // storage-shaped field we have must be inert.
  const base = { kind: 'message', role: 'assistant' }
  const noisy = {
    ...base,
    user_id: 'someone-else', room: 'hermes', roomUserId: 'x', conversation_id: 'c1',
    conversationOwner: 'kavi', isRoot: false, memoryAccessScope: 'none',
  }
  assert.equal(ownerOf(noisy), OWNER.sotera, 'her own sentence is hers in ANY room')
  assert.equal(ownerOf({ kind: 'message', role: 'user', room: 'ote' }), OWNER.account,
    'and the person\'s sentence is theirs in any room too')
})

test('⛔ the source file never mentions a room, user_id or session', () => {
  // Crude and correct: the failure would be one line, and every behavioural test would still pass while
  // ownership quietly became storage again.
  const src = readFileSync(new URL('../../Backend/app/components/memory-ownership.js', import.meta.url), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  for (const forbidden of ['user_id', 'roomUserId', 'conversation_id', 'isRoot', 'memoryAccessScope', 'access_sotera_memory']) {
    assert.ok(!new RegExp(forbidden).test(code),
      `memory-ownership.js references \`${forbidden}\` — ownership must not consult storage or authorization`)
  }
})

// ── ⛔ `author='persona'` IS NOT THE WHOLE ANSWER ──────────────────────────────────────────────────
test('⛔⛔ ownership is NOT collapsed into author — her utterances have no author at all', () => {
  // The proof Ote asked for, as a test: if ownership were `author==='persona'`, her utterances would be
  // ownerless, because `txn_messages` has no `author` column. They have `role`.
  const utterance = { kind: 'message', role: 'assistant' } // no `author` field anywhere
  assert.equal(isSoteraOwned(utterance), true,
    'her utterance is hers WITHOUT an author field — so author cannot be the ownership rule')
  // And an account-authored memory can be ABOUT her while belonging to the person.
  assert.equal(ownerOf({ kind: 'memory', author: 'account', subject: 'sotera' }), OWNER.account,
    'being about her does not make it hers — aboutness is an index, not an entitlement')
})

// ── ⭐⭐ THE ASYMMETRY INSIDE ONE CONVERSATION ─────────────────────────────────────────────────────
test('one conversation, two owners — this is the asymmetry change A already implements', () => {
  assert.equal(ownerOfExchange({ who: 'me' }), OWNER.sotera)
  assert.equal(ownerOfExchange({ who: 'you' }), OWNER.sotera, 'the window renders her as "you"')
  assert.equal(ownerOfExchange({ who: 'Hermes' }), OWNER.account)
  assert.equal(requiresAuthorization({ kind: 'message', role: 'assistant' }), false,
    '⛔ her half must not enter the authorization path AT ALL')
  assert.equal(requiresAuthorization({ kind: 'message', role: 'user' }), true)
})

// ── ⚠️ THE DEFERRED HAZARD, KEPT DEFERRED ─────────────────────────────────────────────────────────
test('⚠️⚠️ the counterpart-through-her-own-words hazard is DECLARED, not solved', () => {
  // Ote: "Do not accidentally conclude that reading Sotera's own utterances gives her unrestricted access
  // to everything the counterpart said." This function exists so the limitation is discoverable from code.
  assert.equal(mayCarryCounterpartContent({ kind: 'message', role: 'assistant' }), true,
    'her own utterance ALWAYS may carry his words — the hazard always applies')
  assert.equal(mayCarryCounterpartContent({ kind: 'episode', participated: true }), true)
  // ⛔ It is not a mitigation and must never start behaving like one: it does not inspect content.
  assert.equal(mayCarryCounterpartContent({ kind: 'message', role: 'assistant', said: 'nothing quoted here' }), true,
    'it does not look at the text — a content-inspecting version would be a mitigation, and none is designed')
  assert.equal(mayCarryCounterpartContent({ kind: 'memory', author: 'persona' }), false,
    'a memory she wrote is not a conversation turn — the hazard is about utterances and episodes')
})
