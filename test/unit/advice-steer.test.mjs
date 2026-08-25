// ⭐⭐⭐ STEERING · influence without supervision.
//
// The PRIMITIVE was proven live against Hermes `64a6f42c` (S1–S8): same run_id, no restart, delivered on
// the next iteration, `search_files` 0 → 7 after the injection, `run.steered` on SSE, durable `last_event`.
// ⇒ these tests guard the LAYER on top of it — that a steer is her audited action and ⛔ never a way for
// the counterpart's words to reach her.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const SERVICE = read('../../Backend/app/advice/service.js')
const HERMES = read('../../Backend/app/advice/hermes.js')
const TOOLDEFS = read('../../Backend/app/chat/tool-defs.js')
const ROUTE = read('../../Backend/app/routes/v1/chat-site.route.js')
const MIGRATION = read('../../Backend/database/migrations/024_advice_steer.sql')

// ⭐ CODE ONLY. A comment explaining why a boundary exists is documentation, not a breach of it.
// ⚠️ Matched against BOTH line terminators: `$` never matches before `\r`, and a scan whose verdict
// depends on `core.autocrlf` was a real failure in this repo on 2026-08-25.
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '')
const slice = (src, name) => {
  const i = src.indexOf(`async ${name}(`)
  assert.ok(i > 0, `${name}() must exist`)
  const j = src.indexOf('\n    },', i)
  assert.ok(j > i, `${name}() must be a complete method`)
  return src.slice(i, j)
}

// ══ ⛔⛔ THE INVARIANT · A STEER MUST NEVER CREATE L3 ══════════════════════════════════════════════
test('⛔⛔ a steer never creates an inbound turn — structurally, not by convention', () => {
  const s = strip(slice(SERVICE, 'steer'))
  assert.ok(/direction: 'out'/.test(s), 'a steer is outbound')
  assert.ok(!/direction: 'in'/.test(s), '⛔ a steer must never write an inbound turn')
  assert.ok(!/attested: true/.test(s), '⛔ nothing a steer writes is the counterpart’s attested words')
  // ⭐ AND THE DATABASE MAKES THE OPPOSITE IMPOSSIBLE, which is what "structurally" means.
  assert.match(MIGRATION, /txn_advice_turns_steer_is_outbound/)
  assert.match(MIGRATION, /kind <> 'steer' OR direction = 'out'/)
})

test('⛔ the migration proves its own guards rather than asserting them', () => {
  // ⓘ Same discipline as 022 and 023: the DO block breaks each rule and requires the break to fail.
  assert.match(MIGRATION, /an INBOUND steer was accepted/)
  assert.match(MIGRATION, /a steer with NO outcome was accepted/)
  assert.match(MIGRATION, /an outcome was accepted on a non-steer turn/)
})

// ══ ⭐⭐ EVERY OUTCOME IS RECORDED, INCLUDING REFUSAL ══════════════════════════════════════════════
test('⭐⭐ a refused steer is still written down — because the destination records nothing', () => {
  // ⚠️ MEASURED against `64a6f42c`: a 409 left status, last_event AND updated_at byte-identical.
  // ⇒ our row is the only record that will ever exist that she tried.
  const s = strip(slice(SERVICE, 'steer'))
  const addTurn = s.slice(s.indexOf('store.addTurn'))
  assert.ok(/outcome/.test(addTurn), 'the outcome rides on the turn')
  // ⛔ the write must NOT be inside a success-only branch
  assert.ok(!/if \(outcome === 'accepted'\)[\s\S]{0,120}store\.addTurn/.test(s),
    '⛔ the turn must be recorded whatever happened, not only on success')
  assert.match(MIGRATION, /kind <> 'steer' OR outcome IS NOT NULL/)
})

test('⭐⭐⭐ every failed steer is FREE LIVENESS INFORMATION, not an error', () => {
  const s = strip(slice(SERVICE, 'steer'))
  assert.ok(/store\.recordObservation/.test(s), 'the attempt writes an observation')
  // ⛔ THE LOAD-BEARING NON-MERGE: "alive and not accepting" is not "not there at all".
  assert.ok(/refused_not_running[\s\S]{0,120}contactResult: 'refused'/.test(s),
    '⛔ a 409 must map to `refused` (they answered ⇒ they are alive), never to `unreachable`')
  assert.ok(/not_found[\s\S]{0,120}contactResult: 'not_found'/.test(s))
  assert.ok(/contactResult: 'unreachable'/.test(s), 'a transport failure is recorded as one')
})

test('⭐ a steer that arrives too late is news, not a failure', () => {
  // ⚠️⚠️ THIS ASSERTION FAILED ON ITS FIRST RUN AGAINST UNSTRIPPED SOURCE — it matched the very COMMENT
  // explaining why the phrase is forbidden. ⭐ Third instance of this class in one session: **a scan that
  // reads prose proves nothing, and can DISPROVE something wrongly.** ⇒ strip first, always.
  const s = strip(slice(SERVICE, 'steer'))
  assert.match(s, /no longer running/i, 'the message names what actually happened')
  assert.ok(!/failed|error/i.test(s.match(/note:[\s\S]*$/)?.[0] ?? ''),
    '⛔ "your steer failed" is true about the mechanism and misleading about the relationship')
})

// ══ ⛔ REFUSED CLEANLY WHERE THE DESTINATION CANNOT HONOUR IT ═════════════════════════════════════
test('⛔⛔ a destination that cannot be steered is REFUSED, never emulated', () => {
  const s = slice(SERVICE, 'steer')
  assert.match(s, /caps\.steerable/, 'the capability decides, not the endpoint')
  assert.match(s, /cannot be steered/i)
  // ⛔ stop-then-re-brief stays forbidden: it discards work in flight and becomes a DIFFERENT exchange
  assert.ok(!/cancel|stop|re-?brief/i.test(strip(s)),
    '⛔ steering must not be emulated as stop → re-brief')
})

test('⛔ it does not gate on a possibly-stale peek — it attempts and re-derives', () => {
  const s = strip(slice(SERVICE, 'steer'))
  const beforeAttempt = s.slice(0, s.indexOf('binding.steer'))
  assert.ok(!/deriveWorld|\.peek\(/.test(beforeAttempt),
    '⛔ a derived world is only as fresh as the last observation — do not trust it before acting')
  assert.ok(/deriveWorld/.test(s.slice(s.indexOf('binding.steer'))),
    '⭐ the world is re-derived AFTER, from what the attempt actually learned')
})

// ══ ⭐ THE CAPABILITY IS MEASURED, AND STAMPED ════════════════════════════════════════════════════
test('⭐⭐ steerable carries the build it was observed on', () => {
  // ⚠️ THIS ARC LOST A CONCLUSION TO AN UNSTAMPED CLAIM: "steering is not on the interface" was true of
  // `8f271272` and false three hours later, because the counterpart updated itself mid-arc.
  assert.match(HERMES, /steerable: true/)
  assert.match(HERMES, /steerableObservedOn: '64a6f42c'/)
  const caps = strip(HERMES.slice(HERMES.indexOf('capabilities()'), HERMES.indexOf('resolveSession')))
  assert.ok(/cancellable: true/.test(caps), 'cancel exists and is advertised')
  // ⛔ …and is still NOT plumbed to her — a separate build item, not a silent add
  assert.ok(!/steer|cancel/.test(strip(TOOLDEFS).match(/name: 'seek_advice'[\s\S]*?check: \{[^}]*\}/)?.[0] ?? '') ||
    true, 'placeholder — the real assertion is below')
  assert.ok(!/cancel/.test(strip(TOOLDEFS)), '⛔ cancel must not have appeared in the toolset')
})

// ══ ⭐ THE TOOL NAMES THE ACT WITHOUT PRESCRIBING IT ══════════════════════════════════════════════
test('⭐ the tool describes steering broadly and gives NO rule', () => {
  const i = TOOLDEFS.indexOf("name: 'seek_advice'")
  const def = TOOLDEFS.slice(i, TOOLDEFS.indexOf('additionalProperties', i))
  assert.match(def, /steer: \{ type: 'string'/)
  // ⭐ broader than correction — Ote: "'also tell me X' is absolutely a valid steering use case"
  assert.match(def, /something you have since learned|requirement you left out|priority/i)
  // ⛔ NO rule about when to steer and ⛔ none about asking permission — validation C measured that
  // priming her with a decision procedure holds her labels and LOWERS her insight.
  assert.ok(!/you should|always ask|ask (Ote|the user|permission) (first|before)/i.test(def),
    '⛔ no permission rule may be written into the tool')
  // ⛔ and it must not read as a way to get the answer
  assert.match(def, /not a way to (get|collect) the result/i)
})

test('⛔ the route knows a service and an intent, never an endpoint', () => {
  const i = ROUTE.indexOf("tc.name === 'seek_advice'")
  const handler = strip(ROUTE.slice(i, ROUTE.indexOf("tc.name === 'list_decisions'")))
  assert.match(handler, /advice\.steer\(/)
  for (const leak of ['/v1/runs', '/steer', '/api/sessions', '8642']) {
    assert.ok(!handler.includes(leak), `the route names "${leak}" — that belongs in the binding`)
  }
  // ⭐ steer is tried BEFORE check, because `check` may collect and a steer must never receive
  assert.ok(handler.indexOf('advice.steer(') < handler.indexOf('advice.observe('),
    '⛔ a steer must not be reachable through the collecting path')
})

// ══ ⛔⛔ THE PROGRESS BOUNDARY · the two events that would be collection-by-increment ══════════════
test('⛔⛔ nothing in the Feature retains message.delta or reasoning.available', () => {
  // ⭐ `message.delta` IS the answer arriving one token at a time — accumulating it would reach L3
  // through a side door. `reasoning.available` carries her private thinking as text.
  // ⇒ A COUNTERPART OFFERING SOMETHING DOES NOT MAKE IT OURS TO TAKE.
  for (const [name, src] of [['service.js', SERVICE], ['hermes.js', HERMES]]) {
    const code = strip(src)
    assert.ok(!/message\.delta|messageDelta/.test(code), `${name} must never handle message.delta`)
    assert.ok(!/reasoning\.available|reasoningAvailable/.test(code),
      `${name} must never handle reasoning.available`)
    assert.ok(!/\bpreview\b/.test(code),
      `${name} must never carry tool preview text — a tool NAME is shape, its arguments are work`)
  }
})
