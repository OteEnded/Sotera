// A DECISION IS NOT A MEMORY — and the row must stay exactly where it is while ceasing to be a memory.
//
// ⭐⭐⭐ THE MEASURED DEFECT, 2026-08-23. Reflection #111: she read the conversation, gave three specific
// reasons, and wrote *"I'll decline to retain this. Done. Nothing from that exchange needs to be carried
// forward into memory."* — and a `txn_memories` row was written. The WRITER was honest (`entity='sotera'`,
// `attribute='declined'`, `author='persona'`, reason in `evidence`, conversation in `source`). Two CONSUMERS
// were not: the reflection reader counted it as *"retained something: 1"* (true score: **0 of 47**), and
// `list_memories` returned it live — so **she read it back to Ote as one of four things she has stored.**
//
// ⭐⭐ Ote: *"YES, keep it durable, but it is NOT a memory… I don't want to delete the row simply because it
// isn't a retained memory. That would sacrifice exactly the auditability I want. **Please fix the
// consumers/semantics, rather than changing the underlying representation just to make the count look
// right.**"*
//
// ⇒ So these tests police BOTH directions: a decision must not be returned as a memory, and it must not stop
// being auditable. ⚠️ A filter that removed the row would satisfy the first and destroy the second, which is
// the mistake he named in advance.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  isDeclineRecord, isRetainedMemory, partitionMemoryRead, describeDecision,
  DECLINE_ENTITY, DECLINE_ATTRIBUTE, A_DECISION_IS_NOT_A_MEMORY,
} from '../../Backend/app/components/memory-decision-record.js'

// The real row, verbatim from the database on 2026-08-23.
const REAL_DECLINE = {
  id: 'e46284e0-5da6-48d5-8f97-25226639358c',
  kind: 'semantic',
  entity: 'sotera',
  attribute: 'declined',
  value: null,
  author: 'persona',
  importance: 2,
  namespace: 'default',
  content: 'Casual conversation testing my understanding of cross-room memory access boundaries',
  source: 'decline:983df403-0000-0000-0000-000000000000',
  evidence: { declineKind: 'not_worth_keeping', meaning: 'I do not think this is worth remembering' },
  created_at: '2026-08-21T07:40:00.211Z',
}
const REAL_MEMORY = {
  id: 'e177b0c3-6712-4163-b827-b6ea05cc2fdc',
  kind: 'semantic',
  entity: 'user',
  attribute: 'interaction_preference',
  author: 'account',
  content: "user's interaction_preference: wants me to be myself and speak my mind naturally",
}

test('⭐⭐⭐ the REAL declined row is recognised as a decision, not a memory', () => {
  assert.equal(isDeclineRecord(REAL_DECLINE), true)
  assert.equal(isRetainedMemory(REAL_DECLINE), false)
})

test('⭐ an ordinary memory is not mistaken for a decision', () => {
  assert.equal(isDeclineRecord(REAL_MEMORY), false)
  assert.equal(isRetainedMemory(REAL_MEMORY), true)
})

test('⛔⛔ the predicate reads TWO EXPLICIT FIELDS and infers nothing', () => {
  // ⚠️ A heuristic here would eventually misclassify a real memory as a decision, which is a far worse
  // failure than the one being fixed. ⇒ no inference from author, importance, kind or the content text.
  assert.equal(isDeclineRecord({ ...REAL_MEMORY, author: 'persona' }), false, 'author is not the signal')
  assert.equal(isDeclineRecord({ ...REAL_MEMORY, importance: 2 }), false, 'importance is not the signal')
  assert.equal(isDeclineRecord({ ...REAL_MEMORY, content: 'I declined to remember this' }), false,
    'the CONTENT saying "declined" is not the signal — she is allowed to write that sentence')
  // ⭐ Both fields are required; either alone is an ordinary row.
  assert.equal(isDeclineRecord({ entity: DECLINE_ENTITY }), false)
  assert.equal(isDeclineRecord({ attribute: DECLINE_ATTRIBUTE }), false)
})

test('⛔ odd input is not a decision', () => {
  for (const v of [null, undefined, 'declined', 0, [], {}]) assert.equal(isDeclineRecord(v), false)
  assert.equal(isRetainedMemory(null), false, 'nothing is not a memory either')
})

test('⭐⭐⭐ a memory read is SPLIT, and the split is REPORTED rather than silent', () => {
  // ⛔ A filter nobody can see is how "I covered everything" gets said about a filtered set — this project
  // has paid for that twice. The caller gets both halves AND a count.
  const { memories, decisions, declined } = partitionMemoryRead([REAL_MEMORY, REAL_DECLINE, REAL_MEMORY])
  assert.equal(memories.length, 2)
  assert.equal(decisions.length, 1)
  assert.equal(declined, 1)
  assert.deepEqual(partitionMemoryRead([]), { memories: [], decisions: [], declined: 0 })
  assert.equal(partitionMemoryRead(null).declined, 0)
})

test('⭐⭐ AND IT STAYS AUDITABLE — that is the half a delete would have destroyed', () => {
  const d = describeDecision(REAL_DECLINE)
  assert.equal(d.decision, 'declined')
  assert.equal(d.by, 'persona', 'attributable to her')
  assert.ok(d.at, 'timestamped')
  assert.ok(d.from.startsWith('decline:'), 'provenanced to the conversation')
  assert.equal(d.reason, 'I do not think this is worth remembering', 'and the reason survives')
  assert.ok(d.about.includes('cross-room memory access'), 'and WHAT she declined is still readable')
})

test('⛔ describeDecision refuses to describe a memory — it cannot be used as a general reader', () => {
  assert.equal(describeDecision(REAL_MEMORY), null)
  assert.equal(describeDecision(null), null)
})

test('a string evidence blob still yields a reason; an unparseable one is a missing reason, not a throw', () => {
  assert.equal(describeDecision({ ...REAL_DECLINE, evidence: JSON.stringify(REAL_DECLINE.evidence) }).reason,
    'I do not think this is worth remembering')
  assert.equal(describeDecision({ ...REAL_DECLINE, evidence: '{not json' }).reason, null)
  assert.equal(describeDecision({ ...REAL_DECLINE, evidence: null }).reason, null)
})

test('⛔⛔ the module changes NO representation — no delete, no update, no migration', () => {
  const SRC = readFileSync(new URL('../../Backend/app/components/memory-decision-record.js', import.meta.url), 'utf8')
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')
  assert.ok(!/DELETE|UPDATE|INSERT|expired_at|invalid_at|sequelize|db\./i.test(code),
    'this fixes CONSUMERS; the row is untouched, which is the whole of Ote\'s ruling')
  assert.ok(A_DECISION_IS_NOT_A_MEMORY.includes('durable and auditable'))
  assert.ok(A_DECISION_IS_NOT_A_MEMORY.includes('counts toward nothing'))
})

// ══ ⛔⛔ AND THE CONSUMERS ARE ASSERTED AT THE SOURCE ══════════════════════════════════════════════
// ⚠️ Because the defect was never in the writer — it was in three readers, and a fourth reader added later
// would reintroduce it silently. These assertions are how a new consumer gets caught.
const strip = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')

test('⭐ consumer · the memory TOOL SERVICE filters decisions out of every read', () => {
  const src = strip('../../Backend/app/components/memory-pipeline-host.js')
  assert.ok(/withoutDecisions\(await mem\.search/.test(src), 'search')
  assert.ok(/withoutDecisions\(await mem\.list\(/.test(src), 'list — the one that reached her')
  assert.ok(/withoutDecisions\(await mem\.listArchived/.test(src), 'listArchived')
  // ⭐ …and it reports the withholding rather than silently shrinking a list.
  assert.ok(/withheldDecisions/.test(src))
  // ⛔ …and corrects the count beside the list, so no reader sees a count that disagrees with its own array.
  assert.ok(/next\.count = Math\.max\(0, out\.count - declined\)/.test(src))
})

test('⭐ consumer · COGNITION does not recall a decision as a memory', () => {
  const src = strip('../../Backend/app/components/memory-cognition-host.js')
  assert.ok(/hits\.filter\(\(m\) => !isDeclineRecord\(m\)\)/.test(src),
    'the semantic arm must drop decisions before typing them as recollections')
})

test('⭐ consumer · the REFLECTION READER counts a decline as its own outcome', () => {
  const src = readFileSync(new URL('../../test/maintenance/reflections-read.mjs', import.meta.url), 'utf8')
  assert.ok(/declined_record/.test(src), 'a decline must be counted separately')
  assert.ok(/AND NOT \(dm\.entity = 'sotera' AND dm\.attribute = 'declined'\)/.test(src),
    'and must NOT count toward "retained something"')
  // ⚠️⚠️ NO BACKTICK MAY APPEAR IN THAT SQL. It sits inside a JS template literal, and a backtick terminates
  // it — which has happened FOUR times in this repo, the fourth being me writing this very comment block.
  const sql = src.slice(src.indexOf('A DECISION IS NOT A RETENTION'), src.indexOf('declined_record,'))
  assert.ok(!sql.includes('`'), 'a backtick in this SQL comment would break the file')
})
