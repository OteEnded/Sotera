// ⭐⭐⭐ THE IDLE GATE — *is this a safe MOMENT to think?* ⛔ Never *is this conversation worth revisiting?*
//
// Ote, 2026-08-25, ratifying the split:
//
//     anyActive() → cooldown → tick-time config → deriveRevisitState()
//
//     *"deriveRevisitState() remains the sole authority for whether a conversation is eligible. The idle
//      gate only decides whether this is a safe time to execute."*
//
// ── ⛔⛔ TWO QUESTIONS THAT MUST NEVER MERGE ─────────────────────────────────────────────────────────
//     ELIGIBILITY  which conversations have unreviewed material?   → `revisit-lifecycle.js` ONLY
//     EXECUTION    may anything run at all right now?              → THIS FILE ONLY
// ⭐ Keeping them apart is what makes *"nothing ran"* diagnosable: `blocked-busy` and `nothing-eligible`
// are different sentences, and a single merged predicate could only ever say "no". This project has
// already paid for the merged version of this mistake — `pending` meaning four worlds, and a `state`
// column that could not record what varied.
// ⛔ NOTHING HERE MAY READ A CONVERSATION, A CURSOR OR A WATERMARK. If this file ever needs one of those,
// eligibility has leaked into execution and the second copy of the rule has already been written.
//
// ── ⚠️⚠️ ACTIVE INTERACTION ≠ GENERATION IN FLIGHT ─────────────────────────────────────────────────
// Ote: *"Someone reading/interacting with a conversation should still count toward the cooldown /
// interlock."* We cannot observe reading — no server event fires while a person reads a reply. ⇒ the gate
// is TWO components and the second is honest about being a proxy:
//     INTERLOCK  `anyActive()`             — a turn is literally running. Exact.
//     COOL-DOWN  `msSinceLastActivity()`   — a stand-in for the interaction we cannot see. A PROXY.
// ⛔ It must never be described as detecting reading. The asymmetry is what justifies it: waiting a few
// extra minutes costs nothing, and interrupting a live conversation costs the thing the whole capability
// exists to protect.
//
// ── ⭐⭐ RESET-ON-ACTIVITY, NOT POLL-AND-CHECK ──────────────────────────────────────────────────────
// The clock is stamped by `begin`/`end` in the steer registry — the same two calls that already bracket
// every turn on every exit path. ⇒ activity RESETS the timer; the gate only ever reads it.
// ⓘ Shape borrowed from the one place Hermes waits for a human (`_flush_text_batch`, a cancel-and-restart
// debounce): a poll can race with an arriving turn, a reset cannot.
//
// ⚠️ ONE KNOWN GAP IN THE INTERLOCK, STATED RATHER THAN DISCOVERED LATER. The route also keeps
// `activeGens` (a per-user counter for the concurrency limit) and its `runGenerating` wrapper brackets a
// turn slightly EARLIER than `steerReg.begin` does — so for a few milliseconds of setup a turn is
// starting and `anyActive()` still says false. ⛔ Not closed by reading both: two counters of one
// lifecycle is the drift this design exists to avoid, and `activeGens` answers a different question
// (may this USER start another generation). ⭐ It is closed by the COOL-DOWN instead — whichever way that
// race lands, the turn stamps the clock when it begins and again when it ends, so the next tick is
// blocked regardless. The proxy covers the interlock's edge; that is a reason to keep both parts.
//
// ── ⭐ FAIL CLOSED, AND THAT IS THE OPPOSITE OF THIS CODEBASE'S USUAL BUG ───────────────────────────
// Ote: *"Config failure should fail closed and skip the tick."* Hermes writes the same rule up as a bug
// report of its own (#49638): *"a stale boot-captured value silently ignoring that change is the bug"*,
// and their loader returns `(False, …)` on a read error so *"a transient read error must never re-enable
// a feature the user turned off."*
// ⚠️ Note which direction that is. The recorded defect class here is an allowlist that DROPS what it was
// not told about; this is the mirror — a gate that ADMITS what it could not check. Both are "the missing
// case took the permissive branch", and for a background worker that spends a 35B generation the
// permissive branch is the expensive one.

// ── ⚠️⚠️ WHAT THE FLAG MEANS, BECAUSE THE OBVIOUS SPELLING WOULD HAVE SILENTLY STOPPED A LIVE LANE ──
// `revisitIdleGateEnabled` answers *"is the gate ENFORCED?"* — ⛔ NOT *"is the background work enabled?"*
// Those are different switches with different owners: whether the lane runs at all is
// `memory.reflectionEnabled`, and it is already on.
// ⚠️ The first version of this file defaulted `enabled` to false, and wiring THAT into the live reflection
// pass would have turned a running background lane off as a side effect of adding a safety feature —
// caught before it shipped. ⇒ absent config means **ENFORCED**, which is the protective direction, and
// `revisitIdleGateEnabled: false` is the explicit opt-out for someone who wants the old behaviour back.
// ⛔ AND "ABSENT" IS NOT "UNREADABLE": absent is a deployment that never configured this and gets the safe
// default; unreadable is a deployment we could not ask, and that skips the tick.

/** Why a tick did or did not run. ⭐ Every "no" says WHICH no — a bare false is undiagnosable. */
export const GATE = Object.freeze({
  ok: 'ok',
  notEnforced: 'not-enforced',           // ⭐ the gate is switched off ⇒ the caller PROCEEDS
  configUnreadable: 'config-unreadable', // ⛔ fail CLOSED — the CONFIG could not be read
  // ⭐⭐⭐ ITS OWN VALUE SINCE 2026-08-26, BECAUSE SHARING ONE COST 28 HOURS OF A DEAD LANE.
  // Both branches fail closed and that was right — but they have DIFFERENT CAUSES and different
  // fixes, and the log said `config-unreadable` while the config was perfectly readable. The
  // investigation went to the config, found nothing wrong, and the actual cause (a registry the
  // caller could not see across a plugin scope) stayed invisible.
  // ⛔ A reason code that answers two questions is undiagnosable exactly when you need it — the same
  // overload this project has now fixed in `user_id`, `author`, `source_message_id`, `confidence`
  // and `incognito`, here in an ERROR PATH where it is hardest to notice.
  registryAbsent: 'registry-absent',     // ⛔ fail CLOSED — we cannot tell whether she is BUSY
  busy: 'busy',                          // a turn is in flight right now
  coolingDown: 'cooling-down',           // a turn ended too recently to be sure she is free
})

/** Default cool-down: long enough to cover reading a reply and typing the next thing. */
export const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000

/**
 * ⭐⭐ PURE. Takes facts, returns a verdict. No clock of its own, no config read, no registry — which is
 * what lets a check drive "she has been idle for six minutes" without waiting six minutes.
 *
 * @param {object} o
 * @param {boolean} o.enforced           is the GATE switched on (⛔ not "is the worker enabled")
 * @param {boolean} o.configReadable     false ⇒ we could not read it at all
 * @param {boolean} o.anyActive          is any interactive turn running
 * @param {number}  o.msSinceLastActivity
 * @param {number}  o.coolDownMs
 * @returns {{ run: boolean, reason: string, waitMs: number }}
 */
export function evaluateIdleGate({
  enforced = true,
  configReadable = true,
  anyActive = false,
  msSinceLastActivity = 0,
  coolDownMs = DEFAULT_COOLDOWN_MS,
} = {}) {
  // ⛔ ORDER MATTERS AND IT IS NOT ARBITRARY: the unreadable case is checked FIRST, before anything else,
  // because an unreadable config makes every other value one we invented rather than one we read —
  // including `enforced`, so "we could not read it" must not be able to turn the gate off.
  if (!configReadable) return { run: false, reason: GATE.configUnreadable, waitMs: 0 }
  // ⭐ SWITCHED OFF ⇒ RUN. The gate is a restriction; removing the restriction cannot mean "stop".
  if (!enforced) return { run: true, reason: GATE.notEnforced, waitMs: 0 }
  if (anyActive) return { run: false, reason: GATE.busy, waitMs: 0 }
  const cool = Number(coolDownMs) > 0 ? Number(coolDownMs) : DEFAULT_COOLDOWN_MS
  if (msSinceLastActivity < cool) {
    return { run: false, reason: GATE.coolingDown, waitMs: cool - msSinceLastActivity }
  }
  return { run: true, reason: GATE.ok, waitMs: 0 }
}

/**
 * ⭐ THE IMPURE HALF: read the deployment's answer AT TICK TIME.
 *
 * ⚠️⚠️ TICK TIME, NOT BOOT TIME, AND THIS IS THE WHOLE POINT. `config.json` is read once at boot by
 * `loadConfig()` — so before this, pausing a misbehaving background pass required a RESTART, which is
 * exactly the moment you least want to need one. Reading `fastify.config` on every tick means the stop
 * switch takes effect on the next tick.
 * ⓘ It reads the live object the process holds; a deployment that rewrites `config.json` still needs the
 * reload path, and that is a separate concern from this function fetching the value fresh each tick
 * rather than capturing it once in a closure.
 * ⛔ ANY throw is `configReadable: false` ⇒ the tick is skipped. Never a default of `true`.
 */
export function readGateConfig(fastify) {
  try {
    const mem = fastify?.config?.memory
    // ⭐ `!== false`, NOT `=== true`. A deployment that never configured this gets the gate ENFORCED; only
    // an explicit `false` turns it off. ⛔ `=== true` would make every un-migrated config silently
    // unprotected — this codebase's most-repeated defect, in the direction that looks like it works.
    const enforced = mem?.revisitIdleGateEnabled !== false
    const mins = Number(mem?.revisitCooldownMinutes)
    const coolDownMs = Number.isFinite(mins) && mins > 0 ? mins * 60_000 : DEFAULT_COOLDOWN_MS
    return { configReadable: true, enforced, coolDownMs }
  } catch {
    // ⛔ FAIL CLOSED. Ote: *"Config failure should fail closed and skip the tick."*
    return { configReadable: false, enforced: true, coolDownMs: DEFAULT_COOLDOWN_MS }
  }
}

/**
 * ⭐ The whole gate, for a caller that has a fastify and a registry.
 * ⛔ Returns a VERDICT, never runs anything — the caller owns the consequence, which is what keeps this
 * testable and keeps the scheduler from acquiring a policy.
 */
export function checkIdleGate(fastify, registry, { now = Date.now() } = {}) {
  const cfg = readGateConfig(fastify)
  // ⛔ A MISSING REGISTRY IS NOT AN IDLE SOTERA. Without it we cannot tell whether she is busy, and
  // "cannot tell" takes the closed branch for the same reason an unreadable config does.
  // ⚠️⚠️ BUT IT REPORTS A DIFFERENT REASON, AND THAT DISTINCTION IS THE WHOLE POINT. This branch fired
  // on every tick for 28 hours while the log blamed the config — `fastify.steerReg` was decorated
  // inside the ENCAPSULATED chat route and read from the ROOT cron plugin, so a child's decoration
  // was invisible to a sibling. ⭐ Same closed branch, different cause, and now a different name.
  if (!registry || typeof registry.anyActive !== 'function') {
    return { run: false, reason: GATE.registryAbsent, waitMs: 0, activeCount: null }
  }
  const verdict = evaluateIdleGate({
    ...cfg,
    anyActive: registry.anyActive(),
    msSinceLastActivity: registry.msSinceLastActivity(now),
  })
  return { ...verdict, activeCount: registry.activeCount?.() ?? null }
}

/** ⭐ One line for a log, and it names WHICH no. ⛔ Operator vocabulary — never shown to her. */
export function gateSummaryLine(v) {
  if (!v) return 'no verdict'
  if (v.run) return 'gate: open'
  if (v.reason === GATE.coolingDown) return `gate: cooling down, ${Math.ceil(v.waitMs / 1000)}s to go`
  if (v.reason === GATE.busy) return `gate: busy (${v.activeCount ?? '?'} interactive turn(s) in flight)`
  return `gate: ${v.reason}`
}
