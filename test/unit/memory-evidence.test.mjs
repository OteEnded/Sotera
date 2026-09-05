// ⭐⭐⭐ THE PURE HALF OF THE PROVENANCE AXES — contracts, act keys, span verification, said derivation.
//
//   node --test test/unit/memory-evidence.test.mjs
//
// Written BEFORE the implementation (Phase 3). Pins the semantics the four axes rest on, with no db:
//   · an act key is unique per ACT and byte-identical to today for turn/operator occasions
//   · a writer contract is data; an unknown writer is `unknown`, never a crash and never a coincidence
//   · `said` derives from account-holder turn dates: one day ⇒ that day; several ⇒ WITHHELD; none ⇒ null
//   · span verification is normalised containment — the same standard that earns `quoted`
//   · the reference-kind vocabulary is closed and is NOT called "basis"; the one-way belief ceiling holds
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACT_KIND, REACH_KIND, REFERENCE_KIND, WRITER, COINCIDENCE, VERIFICATION, BELIEF_CEILING,
  contractFor, actKey, actKeyOf, normalizeAct, normalizeReach, consumingOccasionFor,
} from '../../Backend/app/components/memory-writer-contracts.js'
import { spanAppears, speakerOf, saidFrom, provenanceView } from '../../Backend/app/components/memory-evidence.js'

test('vocabularies are closed and named for what they are — ⛔ no `basis` in the reference vocabulary', () => {
  assert.deepEqual(Object.values(ACT_KIND).sort(), ['dreaming', 'ingest', 'job', 'operator', 'record', 'request', 'revisit', 'turn'])
  assert.deepEqual(Object.values(REACH_KIND).sort(), ['document', 'none', 'range', 'turn'])
  assert.deepEqual(Object.values(REFERENCE_KIND).sort(), ['document', 'memory', 'record', 'turn'])
  assert.ok(!('basis' in REFERENCE_KIND) && !Object.values(REFERENCE_KIND).includes('basis'))
  assert.equal(COINCIDENCE.occasionTurnIsEvidence, 'occasion-turn-is-evidence')
  assert.deepEqual(Object.values(VERIFICATION).sort(), ['declared-coincidence', 'failed', 'operator-attested', 'span-verified', 'writer-cited'])
})

test('writer contracts: exactly two writers declare the coincidence; pass writers are marked; unknown is inert', () => {
  const declaring = Object.values(WRITER).filter((w) => contractFor(w).coincidence === COINCIDENCE.occasionTurnIsEvidence).sort()
  assert.deepEqual(declaring, ['extractor', 'identity'], 'F8: chat tools do NOT declare the coincidence')
  assert.equal(contractFor(WRITER.chatTool).verify, 'span-in-occasion-turn')
  assert.equal(contractFor(WRITER.reflection).pass, true)
  assert.equal(contractFor(WRITER.reflection).actKind, ACT_KIND.revisit)
  assert.equal(contractFor(WRITER.distiller).pass, true)
  assert.equal(contractFor(WRITER.distiller).enabled, false)
  const u = contractFor('some-new-writer-nobody-registered')
  assert.equal(u.writer, WRITER.unknown)
  assert.equal(u.coincidence, null)
  assert.equal(u.pass, false)
})

test('act keys: turn and operator are byte-identical to today; pass acts are namespaced; two acts never share a key', () => {
  const msg = '11111111-1111-4111-8111-111111111111'
  assert.equal(actKey({ kind: ACT_KIND.turn, id: msg }), msg)
  assert.equal(actKey({ kind: ACT_KIND.operator, id: 'reconcile:rome-2026-09-02' }), 'reconcile:rome-2026-09-02')
  const a = actKey({ kind: ACT_KIND.revisit, id: 'aaaa' })
  const b = actKey({ kind: ACT_KIND.revisit, id: 'bbbb' })
  assert.equal(a, 'revisit:aaaa')
  assert.notEqual(a, b, 'O-2: two passes, two keys')
  assert.notEqual(a, actKey({ kind: ACT_KIND.turn, id: 'aaaa' }), 'a pass never collides with a turn of the same id')
  assert.equal(actKey(null), null)
  assert.equal(actKeyOf({ act_kind: 'revisit', act_id: 'x' }), 'revisit:x')
  assert.equal(actKeyOf({ act_kind: null, act_id: null }), null)
})

test('normalizeAct / normalizeReach refuse malformed shapes rather than guessing', () => {
  assert.throws(() => normalizeAct({ kind: 'turn' }), /id/)
  assert.throws(() => normalizeAct({ kind: 'pass', id: 'x' }), /kind/)
  assert.deepEqual(normalizeAct(null), null)
  assert.throws(() => normalizeReach({ kind: 'range', conversationId: 'c', from: 5, to: 3 }), /from/)
  assert.throws(() => normalizeReach({ kind: 'turn' }), /messageId/)
  assert.deepEqual(normalizeReach({ kind: 'none' }), { kind: 'none' })
  assert.deepEqual(normalizeReach(null), null)
})

test('consumingOccasionFor: the act key wins; then the RATIFIED legacy order — row-level turn before the construction label; nothing ⇒ null (M2 refuses)', () => {
  const msg = '22222222-2222-4222-8222-222222222222'
  assert.equal(consumingOccasionFor({ act: { kind: 'revisit', id: 'p1' }, occasionLabel: null, legacyMessageId: msg }), 'revisit:p1')
  assert.equal(consumingOccasionFor({ act: null, occasionLabel: 'canary-x', legacyMessageId: msg }), msg, 'a row-level turn is never overridden by a label (the store\'s standing rule)')
  assert.equal(consumingOccasionFor({ act: null, occasionLabel: 'canary-x', legacyMessageId: null }), 'canary-x', 'the label is the fallback for a write with no row-level turn')
  assert.equal(consumingOccasionFor({ act: null, occasionLabel: null, legacyMessageId: msg }), msg)
  assert.equal(consumingOccasionFor({}), null)
})

test('spanAppears: normalised containment — the standard that earns `quoted`', () => {
  assert.equal(spanAppears('I play the KALIMBA and ocarina.', 'kalimba'), true)
  assert.equal(spanAppears('my   name is  Mina', 'name is mina'), true)
  assert.equal(spanAppears('nothing here', 'kalimba'), false)
  assert.equal(spanAppears('short', 'sho'), false, 'a 3-char span is not evidence of anything')
  assert.equal(spanAppears(null, 'kalimba'), false)
  assert.equal(spanAppears('kalimba', ''), false)
})

test('speakerOf: the turn\'s role, nothing else', () => {
  assert.equal(speakerOf('user'), 'account-holder')
  assert.equal(speakerOf('assistant'), 'persona')
  assert.equal(speakerOf('system'), null)
  assert.equal(speakerOf(undefined), null)
})

test('saidFrom: one day ⇒ that day; several days ⇒ WITHHELD (null); none ⇒ null — dates only', () => {
  assert.equal(saidFrom(['2026-08-26']), '2026-08-26')
  assert.equal(saidFrom(['2026-08-26', '2026-08-26']), '2026-08-26')
  assert.equal(saidFrom(['2026-08-25', '2026-08-26']), null, 'T-4: a span is not a date')
  assert.equal(saidFrom([]), null)
  assert.equal(saidFrom([null, '2026-08-26']), '2026-08-26', 'an undated reference does not veto a dated one')
  assert.equal(saidFrom(['2026-08-26T10:00:00Z']), null, 'a timestamp is rejected, not truncated')
})

test('provenanceView: zero references is representable and is NOT established; a failed citation does not establish', () => {
  assert.deepEqual(provenanceView([]), { established: false, references: [] })
  const failed = [{ ref_kind: 'turn', target: 'm1', established: false, verification: { how: 'failed', reason: 'span not in turn' } }]
  assert.equal(provenanceView(failed).established, false)
  assert.equal(provenanceView(failed).references.length, 1, 'I10: the failed citation remains visible')
  const ok = [{ ref_kind: 'turn', target: 'm1', established: true, verification: { how: 'declared-coincidence' } }]
  assert.equal(provenanceView(ok).established, true)
})

test('F9 · the one-way ceiling: a memory reference can never lift a belief above `inferred`', () => {
  assert.equal(BELIEF_CEILING.memory, 'inferred')
  assert.equal(BELIEF_CEILING.record, 'inferred')
  assert.equal(BELIEF_CEILING.turn, 'attested-by-source')
  assert.ok(!Object.values(BELIEF_CEILING).includes('in-context'), 'a reference kind is not a belief basis')
})
