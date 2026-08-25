// ⭐⭐⭐ ONE DRAIN AT A TIME, AND THE REVISIT HOOK IS AN OPPORTUNITY RATHER THAN A DEPENDENCY.
//
// Ote's diagram, 2026-08-25 — three triggers, one guarded path:
//
//   new messages ──────────────► 5-minute live drain ──┐
//   revisit round completes ───► post-revisit hook ────┼──► drainPendingEmbeddings ──► txn_message_embeddings
//   04:10 daily ───────────────► catch-up ─────────────┘        (one-at-a-time guard)
//
// ⛔ The 5-minute job stays the PRIMARY freshness mechanism. Ote: *"Do not add the 30-minute scheduler;
// 5 minutes is already better and the current index is effectively real-time."*
//
// Each test below is one of the five proofs he asked for, in his order.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  drainPendingEmbeddings, _resetDrainGuardForTest, _drainInFlightForTest,
} from '../../Backend/app/components/conversation-search.js'

const HOST = readFileSync(new URL('../../Backend/app/components/reflection-lifecycle-host.js', import.meta.url), 'utf8')
// ⛔ Comments stripped — this repo's most repeated defect is a scan that matched its own prose.
const hostCode = HOST.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '')
const CRON = readFileSync(new URL('../../Backend/app/plugins/cron.js', import.meta.url), 'utf8')
const cronCode = CRON.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '')

const fastify = { config: { memory: { embedMessagesEnabled: true } }, db: { txn_messages: {} } }
const defer = () => { let r; const p = new Promise((res) => { r = res }); return { p, resolve: r } }

// ══ 1 · ⭐⭐⭐ CONCURRENT TRIGGERS CANNOT RUN TWO DRAINS ═════════════════════════════════════════════
test('⭐⭐⭐ two concurrent triggers produce exactly ONE drain', async () => {
  _resetDrainGuardForTest()
  const gate = defer()
  let started = 0
  const embedBatch = async () => { started++; await gate.p; return { embedded: 0, scanned: 0 } }

  const first = drainPendingEmbeddings(fastify, { embedBatch })
  // ⛔ The second caller must be REFUSED while the first is still inside a batch.
  const second = await drainPendingEmbeddings(fastify, { embedBatch })
  assert.equal(second.skipped, true)
  assert.equal(second.reason, 'in-flight')
  assert.equal(started, 1, 'the second trigger never entered a batch')

  gate.resolve()
  const a = await first
  assert.equal(a.skipped, undefined, 'the first drain ran normally')
  assert.equal(_drainInFlightForTest(), false, 'the guard is released afterwards')
})

test('⛔ a skipped caller does NOT queue — the running drain covers the same shared set', async () => {
  // ⭐ Every batch re-queries for unembedded rows, so anything the skipped caller would have indexed is
  // picked up by the drain already in progress. Queueing would re-walk rows that are already gone.
  _resetDrainGuardForTest()
  const gate = defer()
  const embedBatch = async () => { await gate.p; return { embedded: 0, scanned: 0 } }
  const running = drainPendingEmbeddings(fastify, { embedBatch })
  const skipped = await drainPendingEmbeddings(fastify, { embedBatch })
  assert.deepEqual(
    { embedded: skipped.embedded, scanned: skipped.scanned, batches: skipped.batches, drained: skipped.drained },
    { embedded: 0, scanned: 0, batches: 0, drained: false },
    'the refusal is a no-op, not a partial run')
  gate.resolve(); await running
})

test('⛔ a throw inside a batch releases the guard — a stranded flag would disable every later drain', async () => {
  _resetDrainGuardForTest()
  await assert.rejects(drainPendingEmbeddings(fastify, {
    embedBatch: async () => { throw new Error('embedder down') },
  }), /embedder down/)
  assert.equal(_drainInFlightForTest(), false)
  // …and the next drain still works.
  const after = await drainPendingEmbeddings(fastify, { embedBatch: async () => ({ embedded: 2, scanned: 2 }) })
  assert.equal(after.embedded, 2)
})

// ══ 2 · ⭐⭐ THE REVISIT HOOK CALLS THE SAME DRAIN ═══════════════════════════════════════════════════
test('⭐⭐ a completed revisit round enters the SAME drain, not a second pipeline', () => {
  assert.match(hostCode, /import \{ drainPendingEmbeddings \} from '\.\/conversation-search\.js'/,
    'the revisit lane imports the shared drain')
  assert.match(hostCode, /drainPendingEmbeddings\(fastify\)/, 'and calls it after the round')
  // ⛔ No second indexing path. Ote: *"Do not build a second indexing pipeline."*
  assert.ok(!/embedPendingMessages|txn_message_embeddings/.test(hostCode),
    '⛔ the revisit lane must never touch the embedding store directly')
})

test('⭐ the hook sits AFTER the round is decided, so it cannot change the outcome', () => {
  const call = hostCode.indexOf('drainPendingEmbeddings(fastify)')
  const ret = hostCode.indexOf('return { ...tally, details }')
  assert.ok(call > 0 && ret > 0, 'both anchors found — ⛔ a vacuous slice is not a pass')
  assert.ok(call < ret, 'the drain is kicked off before the return')
  // ⛔ The tally is already built; the drain may not touch it.
  const between = hostCode.slice(call, ret)
  assert.ok(!/tally\./.test(between), '⛔ the drain must not mutate the round tally')
})

// ══ 3 · ⭐ AN EMPTY QUEUE COSTS ONE QUERY AND NO EMBEDDER ═══════════════════════════════════════════
test('⭐ nothing pending ⇒ one batch, zero embedded, and the embedder is never woken', async () => {
  _resetDrainGuardForTest()
  let calls = 0
  const r = await drainPendingEmbeddings(fastify, {
    // The real `embedPendingMessages` builds an embedder object but only INVOKES it per candidate row,
    // so an empty candidate set never reaches the model. This mirrors that: scanned 0 ⇒ no work.
    embedBatch: async () => { calls++; return { embedded: 0, scanned: 0 } },
  })
  assert.equal(calls, 1, 'exactly one candidate query')
  assert.deepEqual({ embedded: r.embedded, drained: r.drained }, { embedded: 0, drained: true })
})

// ══ 4 · ⭐⭐⭐ EMBEDDING FAILURE MUST NOT FAIL THE REVISIT ═══════════════════════════════════════════
test('⭐⭐⭐ the revisit hook is fire-and-forget with a catch — an embedder outage cannot fail a round', () => {
  const call = hostCode.indexOf('drainPendingEmbeddings(fastify)')
  const tail = hostCode.slice(call, call + 600)
  // ⛔ NOT awaited: awaiting would let a slow or unavailable embedder stall a round that is already done.
  assert.ok(!/await\s+drainPendingEmbeddings/.test(hostCode), '⛔ the revisit must never WAIT on embedding')
  // ⭐ …and every rejection is absorbed, so a throw cannot escape into the round's own error path and be
  // recorded as `failed` — which would make a correctly-completed revisit look broken.
  assert.match(tail, /\.catch\(/, 'the rejection is absorbed')
  assert.ok(!/preempted/.test(tail), '⛔ an embedding failure is not a preemption either')
})

// ══ 5 · ⛔ THE EXISTING TRIGGERS ARE UNCHANGED ══════════════════════════════════════════════════════
test('⛔ the 5-minute live drain and the daily catch-up are untouched', () => {
  // ⭐ 5 minutes stays the PRIMARY mechanism. Ote refused a 30-minute job precisely because it would be a
  // six-fold freshness regression against what already ships.
  assert.match(cronCode, /embedIntervalMinutes/, 'the interval is still configurable')
  assert.match(cronCode, /\?\s*v\s*:\s*5/, 'and still defaults to 5 minutes')
  assert.match(cronCode, /cronManager\.createJob\('message-embed-fresh'/, 'the 5-minute job still exists')
  assert.match(cronCode, /cronManager\.createJob\('usage-retention'/, 'the daily catch-up still exists')
  // ⛔ And there is no new scheduler. Three triggers, not four.
  const jobs = [...cronCode.matchAll(/createJob\('([^']+)'/g)].map((m) => m[1])
  assert.ok(!jobs.some((j) => /30|thirty/.test(j)), '⛔ no 30-minute embedding job was added')
  assert.equal((cronCode.match(/drainPendingEmbeddings\(fastify\)/g) ?? []).length, 2,
    'exactly two cron call sites: the 5-minute job and the daily pass')
})

test('⛔ disabled still fails closed, and `force` bypasses the SETTING but never the guard', async () => {
  _resetDrainGuardForTest()
  const off = { config: { memory: { embedMessagesEnabled: false } }, db: { txn_messages: {} } }
  const r = await drainPendingEmbeddings(off, { embedBatch: async () => ({ embedded: 9, scanned: 9 }) })
  assert.deepEqual({ skipped: r.skipped, reason: r.reason, embedded: r.embedded }, { skipped: true, reason: 'disabled', embedded: 0 })
  // ⭐ A disabled call returns BEFORE taking the guard, so it can never block a real drain.
  assert.equal(_drainInFlightForTest(), false)

  // ⛔ `force` is about the setting, not about concurrency.
  const gate = defer()
  const running = drainPendingEmbeddings(fastify, { embedBatch: async () => { await gate.p; return { embedded: 0, scanned: 0 } } })
  const forced = await drainPendingEmbeddings(off, { force: true, embedBatch: async () => ({ embedded: 1, scanned: 1 }) })
  assert.equal(forced.reason, 'in-flight', '⛔ force must not bypass the one-at-a-time guard')
  gate.resolve(); await running
})
