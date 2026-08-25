// ⭐⭐⭐ THE EXCHANGE LIFECYCLE · four worlds `pending` was collapsing, all four observed in one session.
//
// ⚠️ Every case below is a REAL state this arc hit on 2026-08-25, not an invented one:
//   working                  the C: run, genuinely busy for 68 minutes
//   waiting-for-input        approval.request, with nobody listening
//   finished-uncollected     terminal on their side, her record never moved
//   counterpart-gone         the gateway process died holding a live run
//
// ⛔ AND THE ONE THING THE MODEL MUST NEVER DO: infer death from silence. Silence is what all four failure
// worlds have in common.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { deriveWorld, WORLD, HERMES_OBSERVED } from '../../Backend/app/advice/lifecycle.js'

const NOW = Date.parse('2026-08-25T12:00:00Z')
const ago = (min) => new Date(NOW - min * 60000).toISOString()
const heard = (state, min = 1, extra = {}) => ({
  contactResult: 'heard', heardState: state, observedAt: ago(min), ...extra,
})
const open = { state: 'pending' }

// ══ THE FOUR WORLDS ═══════════════════════════════════════════════════════════════════════════════
test('⭐ working — genuinely busy, and the correct response is to wait', () => {
  const r = deriveWorld({ exchange: open, latest: heard('running'), now: NOW })
  assert.equal(r.world, WORLD.working)
  assert.equal(r.actionable, 'wait')
})

test('⭐⭐ waiting-for-input needs an ANSWER — ⛔ not a collection and ⛔ not patience', () => {
  const r = deriveWorld({ exchange: open, latest: heard('awaiting_input', 40), now: NOW })
  assert.equal(r.world, WORLD.waitingForInput)
  assert.equal(r.actionable, 'answer them')
  // ⛔ THE MEASURED FAILURE: a run sat blocked 40 minutes because this read as "still working".
  assert.notEqual(r.actionable, 'wait')
})

test('⭐⭐⭐ finished-uncollected — terminal on their side, and ONLY she can end it', () => {
  const r = deriveWorld({ exchange: open, latest: heard('completed', 90), inboundTurns: 0, now: NOW })
  assert.equal(r.world, WORLD.finishedUncollected)
  assert.equal(r.actionable, 'collect')
  assert.equal(r.received ?? 0, 0)
})

test('⭐ counterpart-gone splits in two, and merging them would get one wrong', () => {
  // ⚠️ "not there at all" may be TRANSIENT — a gateway restarting looks exactly like this.
  const un = deriveWorld({ exchange: open, latest: { contactResult: 'unreachable', observedAt: ago(1) }, now: NOW })
  assert.equal(un.world, WORLD.counterpartUnreachable)
  assert.equal(un.recoverable, null, 'unreachable is UNKNOWN, not known-dead')

  // ⛔ "up but has forgotten this work" is PERMANENT.
  const gone = deriveWorld({ exchange: open, latest: { contactResult: 'not_found', observedAt: ago(1) }, now: NOW })
  assert.equal(gone.world, WORLD.counterpartForgot)
  assert.equal(gone.recoverable, false)
  assert.notEqual(un.world, gone.world)
})

test('⭐⭐ a 404 is meaningless alone — the disambiguating fact is OURS', () => {
  // ⓘ swept-after-TTL, restarted-and-forgot, and wrong-id-never-dispatched all return the identical 404.
  // What separates "a result we lost" from "there was never anything there" is whether WE ever heard a
  // state for this work.
  const lost = deriveWorld({
    exchange: open, latest: { contactResult: 'not_found', observedAt: ago(1), heardStateEver: true }, now: NOW })
  const never = deriveWorld({
    exchange: open, latest: { contactResult: 'not_found', observedAt: ago(1), heardStateEver: false }, now: NOW })
  assert.match(lost.why, /result we lost/i)
  assert.match(never.why, /never dispatched|swept/i)
  assert.notEqual(lost.why, never.why)
})

// ══ ⛔⛔ THE REFUSALS ══════════════════════════════════════════════════════════════════════════════
test('⛔⛔ SILENCE IS NEVER A CONCLUSION — no elapsed time produces death', () => {
  for (const minutes of [1, 60, 60 * 24, 60 * 24 * 365]) {
    const r = deriveWorld({ exchange: open, latest: heard('running', minutes), now: NOW })
    assert.equal(r.world, WORLD.working, `${minutes} minutes of silence must not change the world`)
    assert.ok(r.stale > 0, 'staleness is REPORTED')
  }
  // ⭐ And the file contains no threshold to compare elapsed time against.
  //
  // ⚠️⚠️ THIS ASSERTION WAS WRONG ON ITS FIRST WRITING, and the fix belongs in the TEST, not the code. It
  // scanned for the WORD `timeout` and fired on a STRING LITERAL — `'she declared it over; ⛔ never a
  // timeout'` — prose asserting the very property under test. ⭐ A source scan that reads prose proves
  // nothing; this one DISPROVED something wrongly. ⇒ it now looks for a timeout being **used**.
  const SRC = readFileSync(new URL('../../Backend/app/advice/lifecycle.js', import.meta.url), 'utf8')
  const code = SRC
    .replace(/\/\/[^\r\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'[^'\n]*'/g, "''")      // ⭐ strings are MESSAGES, not machinery
    .replace(/`[^`]*`/g, '``')
  assert.ok(!/setTimeout|setInterval/.test(code), '⛔ no clock may run inside the derivation')
  // ⛔ the load-bearing one: elapsed time must never be COMPARED against anything
  assert.ok(!/(sinceHeardMs|stale|elapsed|age)\s*[<>]=?/i.test(code),
    '⛔ comparing elapsed time to a threshold is death-by-clock wearing a number')
  assert.ok(!/[<>]=?\s*\d{3,}/.test(code), '⛔ no numeric time threshold in the derivation')
})

test('⛔ never asked is NOT "working" — absence of observation is not observation of absence', () => {
  const r = deriveWorld({ exchange: open, latest: null, now: NOW })
  assert.equal(r.world, WORLD.unobserved)
  assert.notEqual(r.world, WORLD.working)
  assert.equal(r.actionable, 'ask')
  assert.equal(r.sinceHeardMs, null)
})

test('⭐⭐ receipt outranks everything — once she has it, their process is not the question', () => {
  // ⓘ Even if the counterpart has since forgotten the work entirely.
  const r = deriveWorld({
    exchange: open, latest: { contactResult: 'not_found', observedAt: ago(1) }, inboundTurns: 1, now: NOW })
  assert.equal(r.world, WORLD.collected)
})

test('⭐ abandoned is a stored ACT and cannot be produced by any observation', () => {
  const r = deriveWorld({ exchange: { state: 'abandoned' }, latest: heard('running'), now: NOW })
  assert.equal(r.world, WORLD.abandoned)
  // ⛔ and nothing in the derivation can ever RETURN it from evidence alone
  const fromEvidence = [
    deriveWorld({ exchange: open, latest: { contactResult: 'unreachable', observedAt: ago(600) }, now: NOW }),
    deriveWorld({ exchange: open, latest: { contactResult: 'not_found', observedAt: ago(600) }, now: NOW }),
    deriveWorld({ exchange: open, latest: heard('running', 6000), now: NOW }),
  ]
  for (const f of fromEvidence) assert.notEqual(f.world, WORLD.abandoned)
})

test('⛔ PURE — same inputs, same output, and no clock of its own', () => {
  const args = { exchange: open, latest: heard('running', 5), now: NOW }
  assert.deepEqual(deriveWorld(args), deriveWorld(args))
  // ⓘ `now` is injected precisely so a test cannot pass by accident on a fast machine.
  const later = deriveWorld({ ...args, now: NOW + 3600_000 })
  assert.equal(later.world, WORLD.working)
  assert.ok(later.sinceHeardMs > deriveWorld(args).sinceHeardMs)
})

// ══ ⭐ THE CAPABILITY CONTRACT IS STAMPED ═════════════════════════════════════════════════════════
test('⭐⭐ every counterpart capability carries the build it was observed against', () => {
  // ⚠️ THIS ARC LOST A CONCLUSION TO AN UNSTAMPED CLAIM: "steering is not on the interface" was true of
  // 8f271272 and false three hours later against 64a6f42c, because the counterpart updated itself.
  assert.equal(HERMES_OBSERVED.build, '64a6f42c')
  assert.ok(HERMES_OBSERVED.observedAt)
  assert.equal(HERMES_OBSERVED.steer.exposed, true)
  assert.equal(HERMES_OBSERVED.steer.interrupts, false)
  assert.equal(HERMES_OBSERVED.steer.changesSubsequentWork, true)
  // ⛔ the refusal leaves NO trace — measured: status, last_event AND updated_at byte-identical
  assert.equal(HERMES_OBSERVED.steer.refusalLeavesTrace, false)
  // ⚠️ and the awaiting-approval case is recorded as INFERRED, never as measured
  assert.match(HERMES_OBSERVED.steer.refusedWhenNotRunning, /NOT measured/)
  // ⭐ the two channels, with their measured TTLs
  assert.equal(HERMES_OBSERVED.events.reconnect, false)
  assert.equal(HERMES_OBSERVED.events.singleSubscriber, true)
  assert.equal(HERMES_OBSERVED.events.sweptIfUnsubscribedSec, 300)
  assert.equal(HERMES_OBSERVED.status.retainedAfterTerminalSec, 3600)
  assert.equal(HERMES_OBSERVED.status.survivesProcessRestart, false)
  // ⭐ cancel exists and is deliberately NOT exposed to her — a separate build item, not a silent add
  assert.equal(HERMES_OBSERVED.cancellable, true)
  assert.equal(HERMES_OBSERVED.cancelExposedToSotera, false)
})

// ══ ⛔ THE SPLIT IS ENFORCED IN SOURCE, not just intended ═════════════════════════════════════════
test('⛔⛔ peek is literally read-only, and probe never collects', () => {
  const SVC = readFileSync(new URL('../../Backend/app/advice/service.js', import.meta.url), 'utf8')
  const slice = (name) => {
    const i = SVC.indexOf(`async ${name}(`)
    assert.ok(i > 0, `${name}() must exist`)
    return SVC.slice(i, SVC.indexOf('\n    },', i))
  }
  const peek = slice('peek').replace(/\/\/[^\r\n]*/g, '')
  // ⭐ no network, and no write of any kind
  assert.ok(!/binding|fetch\(|resolveDestination/.test(peek), 'peek must not touch the network')
  assert.ok(!/store\.(patch|addTurn|abandon|recordObservation)/.test(peek), 'peek must not write')

  const probe = slice('probe').replace(/\/\/[^\r\n]*/g, '')
  // ⛔ probe records observations and NOTHING else — no turn, no close, no state patch
  assert.ok(/store\.recordObservation/.test(probe), 'probe records what it heard')
  assert.ok(!/store\.addTurn/.test(probe), '⛔ probe must never create an inbound turn')
  assert.ok(!/store\.patch/.test(probe), '⛔ probe must never move the exchange state')
  assert.ok(!/closedAt/.test(probe), '⛔ probe must never close an exchange')
  // ⭐ and the output it may have been handed is dropped on the floor
  assert.ok(!/o\.text|o\?\.text/.test(probe), '⛔ probe must not carry the counterpart’s words')
})

test('⛔ the observation log has no column that could hold content', () => {
  const SQL = readFileSync(
    new URL('../../Backend/database/migrations/023_advice_lifecycle.sql', import.meta.url), 'utf8')
  const table = SQL.slice(SQL.indexOf('CREATE TABLE IF NOT EXISTS persona_sotera.log_advice_observations'),
    SQL.indexOf('CREATE INDEX'))
  const cols = [...table.matchAll(/^\s{4}([a-z_]+)\s+(uuid|text|timestamptz|integer|bigserial)/gm)].map((m) => m[1])
  assert.ok(cols.length >= 8, `expected the column list, got ${cols.join(',')}`)
  for (const c of cols) {
    assert.ok(!/content|body|output|text_|message|said|reply/.test(c),
      `⛔ "${c}" could hold a counterpart's words — an observation that carries content is a collection`)
  }
  // ⭐ and the honesty guard is present: a state may only be recorded when one was actually heard
  assert.match(SQL, /heard_state_honesty/)
})
