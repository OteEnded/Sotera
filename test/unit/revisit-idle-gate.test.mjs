// ⭐⭐⭐ THE IDLE GATE · *is this a safe MOMENT to think?* ⛔ never *is this conversation eligible?*
//
// Ote's ratified order: `anyActive() → cooldown → tick-time config → deriveRevisitState()`, and the split
// is the contract: *"deriveRevisitState() remains the sole authority for whether a conversation is
// eligible. The idle gate only decides whether this is a safe time to execute."*

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  evaluateIdleGate, readGateConfig, checkIdleGate, gateSummaryLine, GATE, DEFAULT_COOLDOWN_MS,
} from '../../Backend/app/components/revisit-idle-gate.js'
import { createSteerRegistry } from '../../Backend/app/chat/steer-registry.js'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const GATE_SRC = read('../../Backend/app/components/revisit-idle-gate.js')
const HOST_SRC = read('../../Backend/app/components/reflection-lifecycle-host.js')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

// ══ 1 · ⭐⭐ THE HARD INTERLOCK ═══════════════════════════════════════════════════════════════════
test('⭐⭐ a turn in flight blocks the tick, whoever it belongs to', () => {
  const v = evaluateIdleGate({ anyActive: true, msSinceLastActivity: 99e9 })
  assert.equal(v.run, false)
  assert.equal(v.reason, GATE.busy)
})

test('⭐ the interlock is GLOBAL, not per-conversation', () => {
  // ⭐ The question a background pass asks is "is Sotera occupied", never "is THIS chat occupied" —
  // starting a 35B revisit while she is mid-turn with anyone is the interruption we are preventing.
  const reg = createSteerRegistry()
  assert.equal(reg.anyActive(), false)
  reg.begin('conversation-A')
  assert.equal(reg.anyActive(), true)
  assert.equal(reg.isActive('conversation-B'), false, 'B is idle…')
  assert.equal(reg.anyActive(), true, '…but SHE is not')
  reg.end('conversation-A')
  assert.equal(reg.anyActive(), false)
})

test('⭐ ref-counting survives two generations on one conversation', () => {
  const reg = createSteerRegistry()
  reg.begin('c'); reg.begin('c')
  reg.end('c')
  assert.equal(reg.anyActive(), true, 'one generation finishing must not strand the other')
  reg.end('c')
  assert.equal(reg.anyActive(), false)
})

// ══ 2 · ⭐⭐ THE COOL-DOWN · a proxy, and honest about it ═════════════════════════════════════════
test('⭐⭐ a turn that ended too recently still blocks — reading is interaction we cannot see', () => {
  const v = evaluateIdleGate({ anyActive: false, msSinceLastActivity: 60_000, coolDownMs: 5 * 60_000 })
  assert.equal(v.run, false)
  assert.equal(v.reason, GATE.coolingDown)
  assert.equal(v.waitMs, 4 * 60_000, 'and it says how long is left rather than just "no"')
})

test('⭐ once the cool-down elapses the gate opens', () => {
  const v = evaluateIdleGate({ anyActive: false, msSinceLastActivity: 5 * 60_000, coolDownMs: 5 * 60_000 })
  assert.equal(v.run, true)
  assert.equal(v.reason, GATE.ok)
})

test('⭐⭐ activity RESETS the clock — reset-on-activity, ⛔ not poll-and-check', () => {
  // ⭐ Both edges stamp it: a long generation must not look increasingly idle while it is the busiest
  // thing the process is doing. ⓘ `now` is injected so this needs no sleeping.
  const reg = createSteerRegistry()
  const t0 = 1_000_000
  reg._setLastActivityForTest(t0)
  assert.equal(reg.msSinceLastActivity(t0 + 60_000), 60_000)
  reg.begin('c')                                   // ← a turn STARTS
  assert.ok(reg.msSinceLastActivity() < 1_000, 'beginning a turn reset the clock')
  reg._setLastActivityForTest(t0)
  reg.end('c')                                     // ← a turn ENDS
  assert.ok(reg.msSinceLastActivity() < 1_000, 'ending a turn reset it too')
})

test('⭐⭐ a fresh process is NOT infinitely idle — the baseline is process start', () => {
  // ⚠️ Reporting "never seen a turn" as infinite idleness would fire a background pass the instant Sotera
  // comes up — exactly when someone whose turn died in the restart is most likely to be typing again.
  const reg = createSteerRegistry()
  assert.ok(reg.msSinceLastActivity() < 1_000, 'uptime is the honest answer, not Infinity')
  const v = evaluateIdleGate({ anyActive: false, msSinceLastActivity: reg.msSinceLastActivity() })
  assert.equal(v.run, false, 'so the cool-down applies after a restart too')
})

// ══ 3 · ⛔⛔ FAIL CLOSED ══════════════════════════════════════════════════════════════════════════
test('⛔⛔ an unreadable config SKIPS the tick — and outranks every other input', () => {
  // Ote: *"Config failure should fail closed and skip the tick."*
  // ⭐ Checked FIRST, before `enforced`: an unreadable config makes every other value one we invented,
  // including the switch that could turn the gate off.
  const v = evaluateIdleGate({ configReadable: false, enforced: false, anyActive: false, msSinceLastActivity: 99e9 })
  assert.equal(v.run, false)
  assert.equal(v.reason, GATE.configUnreadable)
})

test('⛔ a missing registry is not an idle Sotera — and it says SO', () => {
  // ⚠⚠ THIS ASSERTION USED TO EXPECT `configUnreadable`, AND THAT SHARED NAME COST 28 HOURS.
  // The branch fired on every tick while the log blamed the config, which was fine — the real cause
  // was `fastify.steerReg` decorated inside the encapsulated chat route and read from the root cron
  // plugin. ⭐ Same closed branch, different cause, and now a different reason code.
  const v = checkIdleGate({ config: { memory: {} } }, null)
  assert.equal(v.run, false)
  assert.equal(v.reason, GATE.registryAbsent, 'a wiring problem must not be reported as a config problem')
  assert.notEqual(GATE.registryAbsent, GATE.configUnreadable, '⛔ two causes, two names')
})

test('⭐ a registry that is present but wrong-shaped is also registry-absent', () => {
  // ⛔ `typeof registry.anyActive !== 'function'` is the same failure wearing an object.
  const v = checkIdleGate({ config: { memory: {} } }, { anyActive: 'not a function' })
  assert.equal(v.run, false)
  assert.equal(v.reason, GATE.registryAbsent)
})

// ══ 4 · ⚠️⚠️ THE FLAG MEANS "ENFORCED", NOT "THE WORKER IS ON" ══════════════════════════════════
test('⚠️⚠️ switching the gate OFF makes the caller PROCEED — a removed restriction cannot mean stop', () => {
  // ⚠️ THE BUG THIS ENCODES, CAUGHT BEFORE IT SHIPPED: the first draft defaulted the flag to false and
  // treated false as "do not run". Wiring THAT into the live reflection pass would have switched a
  // running background lane off as a side effect of adding a safety feature.
  const v = evaluateIdleGate({ enforced: false, anyActive: true, msSinceLastActivity: 0 })
  assert.equal(v.run, true)
  assert.equal(v.reason, GATE.notEnforced)
})

test('⭐⭐ an un-configured deployment is ENFORCED — `!== false`, ⛔ never `=== true`', () => {
  // ⛔ `=== true` would leave every config that predates this feature silently unprotected: this
  // codebase's most-repeated defect, in the direction that looks like it works.
  assert.equal(readGateConfig({ config: { memory: {} } }).enforced, true)
  assert.equal(readGateConfig({ config: {} }).enforced, true)
  assert.equal(readGateConfig({}).enforced, true)
  assert.equal(readGateConfig({ config: { memory: { revisitIdleGateEnabled: false } } }).enforced, false,
    'and an explicit false is the opt-out')
  assert.match(strip(GATE_SRC), /revisitIdleGateEnabled !== false/)
})

test('⭐ the cool-down is configurable, and a nonsense value falls back rather than disabling the gate', () => {
  assert.equal(readGateConfig({ config: { memory: { revisitCooldownMinutes: 2 } } }).coolDownMs, 120_000)
  for (const bad of [0, -5, 'soon', null, undefined, NaN]) {
    assert.equal(readGateConfig({ config: { memory: { revisitCooldownMinutes: bad } } }).coolDownMs,
      DEFAULT_COOLDOWN_MS, `${JSON.stringify(bad)} must fall back, ⛔ never mean "no cool-down"`)
  }
})

// ══ 5 · ⭐⭐⭐ THE GATE IS NOT AN ELIGIBILITY RULE ════════════════════════════════════════════════
test('⛔⛔ the gate reads NO conversation, cursor or watermark', () => {
  // ⭐ If this file ever needs one of those, eligibility has leaked into execution and the second copy of
  // the rule has already been written. `deriveRevisitState()` is the sole authority for eligibility.
  const code = strip(GATE_SRC)
  for (const leak of ['conversation_id', 'up_to_rolling_id', 'txn_', 'cursor', 'deriveRevisitState', 'sequelize']) {
    assert.ok(!code.includes(leak), `⛔ the gate must not reference \`${leak}\``)
  }
})

test('⭐⭐⭐ the gate sits ABOVE the loop, not inside it', () => {
  // ⛔ Per-conversation, it would become a second eligibility rule — a pass must never say "this
  // conversation is ineligible" when it means "Sotera is busy right now".
  const code = strip(HOST_SRC)
  const i = code.indexOf('checkIdleGate(')
  assert.ok(i > 0, 'the pass consults the gate')
  // ⚠️ RENAMED 2026-08-25 (`convos` → `queue`) when the backlog lane was added — and the guard on the
  // next line is why that was a two-minute fix: it turned a scan whose target had MOVED into a loud
  // failure instead of a silent pass. ⛔ Never relax it to make an anchor optional.
  const loopAt = code.indexOf('for (const c of queue)')
  assert.ok(loopAt > 0, 'the per-conversation loop was found — a vacuous slice is not a pass')
  assert.ok(i < loopAt, '⛔ the gate is evaluated BEFORE the loop over conversations')
  // ⭐ …and eligibility still happens INSIDE, untouched.
  // ⚠️ Searched FROM the loop, not from the start of the file: a bare `indexOf` finds
  // `reflectOnConversation`'s own DEFINITION, which sits above the loop, so the first version of this
  // assertion failed against perfectly correct code. A position test needs the right origin.
  assert.ok(code.indexOf('reflectOnConversation(', loopAt) > loopAt,
    'the per-conversation eligibility call is inside the loop, below the gate')
})

test('⭐ every refusal names WHICH refusal — a bare false is undiagnosable', () => {
  const reasons = new Set([
    evaluateIdleGate({ configReadable: false }).reason,
    evaluateIdleGate({ enforced: false }).reason,
    evaluateIdleGate({ anyActive: true }).reason,
    evaluateIdleGate({ msSinceLastActivity: 0 }).reason,
    evaluateIdleGate({ msSinceLastActivity: 99e9 }).reason,
  ])
  assert.equal(reasons.size, 5, 'five distinct verdicts, so "nothing ran" is always diagnosable')
  // ⭐ and the pass reports the reason rather than swallowing it
  assert.match(strip(HOST_SRC), /reason: `gate-\$\{gate\.reason\}`/)
})

test('⭐ the summary line distinguishes busy from cooling down', () => {
  assert.match(gateSummaryLine({ run: false, reason: GATE.busy, activeCount: 2 }), /busy \(2 interactive/)
  assert.match(gateSummaryLine({ run: false, reason: GATE.coolingDown, waitMs: 90_000 }), /cooling down, 90s/)
  assert.equal(gateSummaryLine({ run: true }), 'gate: open')
})

// ══ 6 · ⭐ ONE REGISTRY, TWO CONCERNS, AND THE STEER HALF STILL WORKS ════════════════════════════
test('⭐⭐ adding the activity concern did not disturb steering', () => {
  const reg = createSteerRegistry()
  assert.deepEqual(reg.add('c', 'hi', 3), { error: 'not_generating' })
  reg.begin('c')
  assert.deepEqual(reg.add('c', 'first', 2), { ok: true })
  assert.equal(reg.hasPending('c'), true)
  assert.deepEqual(reg.add('c', 'second', 2), { ok: true })
  assert.deepEqual(reg.add('c', 'third', 2), { error: 'too_many_steers' }, 'the cap still holds')
  assert.deepEqual(reg.take('c'), ['first', 'second'])
  assert.equal(reg.hasPending('c'), false)
  reg.end('c')
  assert.deepEqual(reg.add('c', 'after', 3), { error: 'not_generating' })
})

test('⭐⭐⭐ ONE registry, created at ROOT where every scope can reach it', () => {
  // ⚠️⚠️ THIS ASSERTION USED TO PIN `fastify.decorate('steerReg', steerReg)` IN THE ROUTE, AND IT PASSED
  // THE ENTIRE TIME THE LANE WAS DEAD. The decoration was really there — and the route is
  // `export default async function chatSiteRoutes(fastify)`, i.e. ENCAPSULATED, so it landed on a CHILD
  // scope that the root cron plugin could never see. ⭐ The test asserted the LINE and not the PROPERTY,
  // so it went green about a wire that reached nothing for 28 hours.
  // ⇒ it now asserts what actually has to be true: the registry is created in a ROOT (`fp`) plugin,
  // registered BEFORE the cron that reads it, and the route CONSUMES rather than creates it.
  const plugin = strip(read('../../Backend/app/plugins/steer-registry.js'))
  assert.match(plugin, /createSteerRegistry\(\)/, 'the plugin creates the registry')
  assert.match(plugin, /fastify\.decorate\('steerReg'/, '…and decorates it')
  assert.match(plugin, /^import fp from 'fastify-plugin'/m,
    '⛔ it MUST be fp-wrapped — an encapsulated plugin decorates a child and no sibling can see it')

  const server = strip(read('../../Backend/server.js'))
  const iSteer = server.indexOf('register(steerRegistryPlugin)')
  const iCron = server.indexOf('register(cronPlugin)')
  assert.ok(iSteer > -1 && iCron > -1, 'both plugins are registered')
  assert.ok(iSteer < iCron,
    '⛔ the registry must register BEFORE the cron — the idle gate reads it on the first tick')

  const route = strip(read('../../Backend/app/routes/v1/chat-site.route.js'))
  assert.equal((route.match(/createSteerRegistry\(\)/g) ?? []).length, 0,
    '⛔ the route no longer creates one — two registries would drift about whether a turn is running')
  assert.match(route, /const steerReg = fastify\.steerReg/, 'the route CONSUMES the shared registry')
  assert.ok(!/createActivityRegistry|activityRegistry/.test(route),
    '⛔ no second activity registry: Ote chose one source of truth')
})

// ══ 7 · ⭐⭐⭐ PREEMPTION · user interaction has ABSOLUTE priority ═════════════════════════════════
test('⭐⭐⭐ the epoch cannot be un-rung — a turn that came AND went is still detected', () => {
  // ⚠️⚠️ THE BUG A BOOLEAN WOULD HAVE HAD: a flag set by `begin` and cleared by `end` would be raised and
  // lowered inside one long revisit round, and the revisit would never learn it had been preempted.
  // A monotonic counter survives the round trip.
  const reg = createSteerRegistry()
  const captured = reg.interactiveEpoch()
  reg.begin('c')
  reg.end('c')
  assert.equal(reg.anyActive(), false, 'the turn is over…')
  assert.notEqual(reg.interactiveEpoch(), captured, '…but it still happened, and passive work must know')
})

test('⭐ either signal counts: a turn running now, or one that has been and gone', () => {
  const reg = createSteerRegistry()
  const captured = reg.interactiveEpoch()
  const preempted = () => reg.interactiveEpoch() !== captured || reg.anyActive() === true
  assert.equal(preempted(), false, 'quiet')
  reg.begin('c')
  assert.equal(preempted(), true, 'running')
  reg.end('c')
  assert.equal(preempted(), true, 'ended, and still preempted')
})

test('⭐⭐⭐ preemption is a CLEAN STOP that leaves the cursor where it was', async () => {
  // Ote's own example: *"if the last completed watermark is 100 and a revisit gets interrupted while
  // working on 101+, the next revisit should resume from 101 rather than silently treating that material
  // as reviewed."*
  const { deriveRevisitState, REVISIT } = await import('../../Backend/app/components/revisit-lifecycle.js')
  const at = (h) => `2026-08-25T0${h}:00:00Z`
  const d = deriveRevisitState({
    attempts: [
      { outcome: 'completed', up_to_rolling_id: 100, requested_at: at(1) },
      { outcome: 'preempted', up_to_rolling_id: 145, requested_at: at(2) },
    ],
    topRollingId: 145,
  })
  assert.equal(d.state, REVISIT.preempted)
  assert.equal(d.cursor, 100, '⛔ preemption moves no cursor — attempted is not reviewed')
  assert.equal(d.reviewFrom, 101, 'and the next pass resumes exactly where it was interrupted')
  assert.equal(d.needsRevisit, true, 'the conversation goes straight back in the queue')
  assert.equal(d.consecutiveFailures, 0, '⛔⛔ preemption is NOT a failure — a yielding lane is healthy')
})

test('⛔ a preempted row carries no failure diagnosis, because nothing went wrong', () => {
  const host = strip(HOST_SRC)
  assert.match(host, /const terminal = preempted \? 'preempted' : 'failed'/)
  assert.match(host, /const why = preempted \? null : String\(failure/)
  // ⛔ …and the enum knows it, structurally
  const mig = read('../../Backend/database/migrations/027_revisit_preempted.sql')
  assert.match(mig, /outcome IN \('completed', 'failed', 'blocked', 'preempted'\)/)
  for (const guard of [
    'a preempted attempt advanced the cursor',
    'a preempted watermark could not be retried',
    'an unknown outcome was accepted',
    'a FAILED revisit with no diagnosis was accepted',
  ]) assert.ok(mig.includes(guard), `027 must prove: ${guard}`)
})

test('⭐⭐ the revisit yields at BOTH round boundaries, and before spending the first', () => {
  const host = strip(HOST_SRC)
  const loop = host.slice(host.indexOf('while (rounds <= maxRounds)'))
  assert.equal((loop.match(/if \(preemptedNow\(\)\) return yieldToUser\(\)/g) ?? []).length, 2,
    'before the round is spent, and again the moment it returns')
  // ⚠️ AND THE HONEST LIMIT IS WRITTEN DOWN: `chat()` takes no abort signal, so a provider call already
  // in flight cannot be cancelled — preemption is sharp at round boundaries and no sharper.
  assert.match(HOST_SRC, /accepts \*\*no abort\s*\n\s*\/\/ signal\*\*|no abort signal/i,
    'the limit must be stated, not implied')
})
