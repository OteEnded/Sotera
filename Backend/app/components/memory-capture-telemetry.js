// Persona Memory — CAPTURE TELEMETRY. Its own namespace beside `memory.resolver.*`, because it answers a
// different question: the resolver's metrics ask *"was ambiguity resolved well?"*, these ask *"did knowledge
// get IN at all?"*
//
// WHY THIS EXISTS: capture sparsity was explained wrongly for weeks. It was recorded as a known limitation
// ("the model declines to call remember_fact") and the real cause turned out to be measurable and different —
// the extractor silently discarded facts on 4 of 5 runs at default temperature. The reason that could hide is
// that NOTHING COUNTED IT: `captureFacts`' return value was dropped at the call site, so "attempted and got
// nothing" and "never attempted" were indistinguishable, and a plumbing failure wore a cognition mask.
//
//   A SILENT ZERO IS NOT EVIDENCE OF ABSENCE  (architecture principle #14)
//
// So the split below is deliberate: every counter separates ATTEMPT from OUTCOME.
//   eligible_turns    memory was on, the model HELD write tools, and the text was long enough to distil
//   model_wrote       the model chose to call a memory write tool → it is the turn's sole writer
//   fallback_ran      the model wrote nothing, so the safety net ran instead
//   fallback_facts    facts the fallback actually committed (its yield, not its attempts)
//   fallback_zero     the fallback ran and produced NOTHING — the failure mode that used to be invisible
//   extract_errors    the extraction call itself threw
//   auto_ran          the plain automatic path (model had NO write tools at all — not a fallback)
//   gated_quoted      the ASSERTION GATE refused the turn: it was a pasted document, not a self-claim, so
//                     no extraction was attempted. Counted for the same reason as everything else here —
//                     a turn we deliberately declined must not read as a turn that yielded nothing.
// Derived: model_write_rate (cooperation) · fallback_share · fallback_yield_rate (does the net catch anything?)
//
// PROCESS-LOCAL, like the resolver counters — cheap and resettable. `startedAt` ships with every snapshot so a
// reader can never mistake a RESTART for an improvement, which is exactly the trap a bare counter sets.

const COUNTERS = [
  'eligible_turns', 'model_wrote', 'fallback_ran', 'fallback_facts', 'fallback_zero', 'extract_errors', 'auto_ran',
  'auto_facts', 'auto_zero',
  'gated_quoted',
]

const zero = () => Object.fromEntries(COUNTERS.map((k) => [k, 0]))
let counters = zero()
let startedAt = new Date().toISOString()

/** Bump one counter. Unknown names are ignored rather than throwing — telemetry must never break a write. */
export function bump(name, by = 1) {
  if (Object.hasOwn(counters, name)) counters[name] += by
}

/**
 * Record how one memory-eligible turn resolved. Called once per turn, at the END (the fallback decision is
 * only knowable after the tool rounds finish).
 * @param {{ modelWrote:boolean, fallbackRan:boolean }} outcome
 */
export function recordTurn({ modelWrote = false, fallbackRan = false } = {}) {
  bump('eligible_turns')
  if (modelWrote) bump('model_wrote')
  if (fallbackRan) bump('fallback_ran')
}

/**
 * Record what a capture attempt YIELDED. Separate from recordTurn on purpose: the attempt is synchronous with
 * the turn, the yield arrives later (capture is fire-and-forget), and conflating them is what hid the problem.
 * @param {{ facts:number, error?:boolean, viaFallback?:boolean }} result
 */
export function recordCapture({ facts = 0, error = false, viaFallback = false } = {}) {
  if (error) { bump('extract_errors'); return }
  if (viaFallback) {
    if (facts > 0) bump('fallback_facts', facts)
    else bump('fallback_zero')
    return
  }
  // The AUTO path's yield — previously dropped ("counted by recordAuto"), which counted only the ATTEMPT.
  // That asymmetry cost a live investigation (2026-08-03): a real turn extracted one fact where the same
  // sentence extracts two offline, and there was NOTHING to say whether the second fact was never
  // extracted, failed to parse, or died in commit — the exact silent-zero blindness this file exists to
  // prevent, still present on the path that runs most often.
  if (facts > 0) bump('auto_facts', facts)
  else bump('auto_zero')
}

/** The plain automatic path: the model had no memory write tools at all, so this is not a "fallback". */
export function recordAuto() { bump('auto_ran') }

const rate = (n, d) => (d > 0 ? Number((n / d).toFixed(4)) : 0)

/** Snapshot + derived rates. `startedAt` is part of the contract: counters are meaningless without their window. */
export function snapshot() {
  const c = { ...counters }
  return {
    ...c,
    startedAt,
    // COOPERATION — how often does the model elect to write when it CAN? The number that was a guess across
    // three soaks. A low rate is not a defect: steering is soft by design (never forced).
    model_write_rate: rate(c.model_wrote, c.eligible_turns),
    fallback_share: rate(c.fallback_ran, c.eligible_turns),
    // Did the safety net actually catch anything? fallback_zero counts barren runs directly, so this is the
    // honest complement rather than an inference. (fallback_facts is a SUM of facts, not a run count, so it
    // cannot be used as a numerator here — hence comparing runs against barren runs.)
    fallback_barren_rate: rate(c.fallback_zero, c.fallback_ran),
    facts_per_fallback: c.fallback_ran > 0 ? Number((c.fallback_facts / c.fallback_ran).toFixed(2)) : 0,
  }
}

/** Start a fresh measurement window (e.g. before a soak). Resets the window stamp too. */
export function reset() { counters = zero(); startedAt = new Date().toISOString() }
