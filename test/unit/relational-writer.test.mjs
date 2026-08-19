// SUBJECT-SIDE WRITER — the contract, tested without a model and without the database.
//
// ⭐ The two that matter: it FAILS CLOSED on anything unexpected, and it CANNOT PERSIST.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseLabels, persistRelationalRecords, __internals } from '../../Backend/app/components/relational-writer.js'
import { STANCE_LABEL_KEYS } from '../../Backend/app/components/relational-taxonomy.js'

// ⭐ THE LEASE IS THE LANE, NOT A TOKEN. A token can be forged or passed to the wrong call; a lane
// obtained from buildMemoryV2({userId: subject}) cannot — holding it IS proof of operating in that scope.
test('⭐ NO LANE, NO WRITE — persistence without a real lease is refused', async () => {
  for (const [label, lease] of [
    ['no lease at all', undefined],
    ['null', null],
    ['a forged string token', 'lease-please'],
    ['an object pretending', { subjectPersonId: 'x' }],
    ['a lane that is not callable', { enqueue: 'nope', subjectPersonId: 'x' }],
  ]) {
    await assert.rejects(() => persistRelationalRecords({ db: {}, records: [], lease }), /requires a write lease/, label)
  }
})

test('⭐ SUBJECT-BOUND — a record about anyone but the lease subject fails the WHOLE batch', async () => {
  const lane = (_l, fn) => fn()
  const lease = { enqueue: lane, subjectUserId: 'u1', subjectPersonId: 'person-A' }
  const mine = { subjectPersonId: 'person-A', tier: 'stance', label: STANCE_LABEL_KEYS[0], conversationCount: 3, windowStart: '2026-08-18', windowEnd: '2026-08-19' }
  const theirs = { ...mine, subjectPersonId: 'person-B' }
  await assert.rejects(
    () => persistRelationalRecords({ db: {}, records: [mine, theirs], lease }),
    /different person than the lease/,
    'silently dropping the wrong-subject half would let a caller "mostly" write across scopes and never learn',
  )
})

test('the commit re-validates rather than trusting its caller', async () => {
  const lease = { enqueue: (_l, fn) => fn(), subjectUserId: 'u1', subjectPersonId: 'person-A' }
  const bad = { subjectPersonId: 'person-A', tier: 'stance', label: 'we-get-along', conversationCount: 3, windowStart: '2026-08-18', windowEnd: '2026-08-19' }
  await assert.rejects(() => persistRelationalRecords({ db: {}, records: [bad], lease }), /invalid record at commit/)
})

test('an empty batch is a no-op that never reaches the lane', async () => {
  let touched = false
  const lease = { enqueue: () => { touched = true }, subjectUserId: 'u1', subjectPersonId: 'person-A' }
  const r = await persistRelationalRecords({ db: { txn_memories: {} }, records: [], lease })
  assert.deepEqual(r, { written: 0, skipped: 0 })
  assert.equal(touched, false, 'no reason to occupy the shared lane with nothing to write')
})

test('⭐ FAILS CLOSED — anything unexpected yields NO labels, never a partial result', () => {
  const good = STANCE_LABEL_KEYS[0]
  for (const [label, reply] of [
    ['prose instead of JSON', 'I think Sotera was quite thorough here.'],
    ['no array at all', 'null'],
    ['broken JSON', '["i-keep-answers-short"'],
    ['empty', ''],
    ['undefined', undefined],
    ['an invented label', `["${good}", "we-get-along"]`],
    ['a smuggled sentence', `["${good}", "he said the deploy broke"]`],
  ]) {
    assert.deepEqual(parseLabels(reply), [], `should yield nothing: ${label}`)
  }
})

test('⭐ ONE fabricated label discards the WHOLE reply, not just that item', () => {
  // A model that invented one item is not a trustworthy source for the others. Keeping the "good half"
  // is how a fabrication becomes durable knowledge with a plausible neighbour vouching for it.
  const reply = JSON.stringify([STANCE_LABEL_KEYS[0], STANCE_LABEL_KEYS[1], 'i-am-a-nice-person'])
  assert.deepEqual(parseLabels(reply), [])
})

test('SHAPE leniency is deliberate — the VOCABULARY is the guarantee, not the JSON', () => {
  // ⚠️ I first asserted that `{"labels":[…]}` must yield nothing, and the test failed. The test was
  // wrong. Extracting a valid label list from an off-shape reply carries NO more information than a
  // bare array would: every element is still checked against the closed set, and one unknown item
  // discards the whole reply. Being strict about JSON shape would lose good data without adding any
  // safety — the privacy property lives in the vocabulary, not the punctuation.
  const a = STANCE_LABEL_KEYS[0]
  assert.deepEqual(parseLabels(`{"labels": ["${a}"]}`), [a])
  // …and the vocabulary gate still holds inside that lenient path:
  assert.deepEqual(parseLabels(`{"labels": ["${a}", "we-get-along"]}`), [])
})

test('accepts a clean reply, dedupes, and preserves only known labels', () => {
  const a = STANCE_LABEL_KEYS[0], b = STANCE_LABEL_KEYS[1]
  assert.deepEqual(parseLabels(JSON.stringify([a, b, a])).sort(), [a, b].sort())
  assert.deepEqual(parseLabels('[]'), [])
  assert.deepEqual(parseLabels(`prose before ["${a}"] and after`), [a], 'a fenced or chatty reply still parses')
})

test('the prompt asks ONLY about Sotera, and never for free text', () => {
  const p = __internals.buildPrompt('user: hi\nassistant: hello')
  assert.match(p, /how SOTERA HERSELF worked/i)
  assert.match(p, /ONLY a JSON array/i)
  assert.match(p, /Never describe the person, what they said/i)
  assert.ok(!/summar(y|ise|ize)/i.test(p), 'it must never ask for a summary — that is free text with a friendly name')
  for (const k of STANCE_LABEL_KEYS) assert.ok(p.includes(k), `the closed vocabulary is given in full: ${k}`)
})
