// THE EXCHANGE LIFECYCLE · store evidence, DERIVE the world, and let only an ACT end it.
//
// ⭐⭐⭐ THE MEASUREMENT THAT DEFINES THIS FILE. One exchange, never touched, over ninety minutes:
//
//     during the run     their interface said `running`, then `waiting_for_approval`
//     process died       `connection refused`
//     process restarted  `404 run_not_found`
//     her exchange said  `pending` · `pending` · `pending`
//
// ⇒ **THE COUNTERPART'S WORLD CHANGED THREE TIMES AND THE EXCHANGE NEVER MOVED ONCE.** ⛔ A flat status
// cannot be repaired by adding values to it — what it is missing is not a value, it is **when we last
// heard, and from what**. ⚠️ And a stored status BECOMES A LIE BY AGEING.
//
// ── ⭐ THE SHAPE, RATIFIED 2026-08-25 ────────────────────────────────────────────────────────────────
//   FACTS      what they last said and WHEN · what our last attempt returned and WHEN · what arrived
//   THE WORLD  ⭐ DERIVED HERE, at read time. ⛔ never stored — a stored derivation is stale on write
//   THE ENDING an ACT: collected · abandoned · refused. ⛔ no clock closes an exchange
//
// ⭐ Same rule this arc applies at every layer: retrieval is free and utterance is governed · the binding
// may look and only she receives · the store guarantees convergence, not the caller.
// ⇒ **OBSERVATION IS FREE; ENDING IS AN ACT.**
//
// ── ⛔⛔ WHAT THIS FILE REFUSES TO DO ────────────────────────────────────────────────────────────────
// ⛔ INFER DEATH FROM SILENCE. Silence is the ONE thing all four failure worlds have in common —
// unreachable, swept, blocked-and-ignored and still-thinking-slowly are indistinguishable from absence
// alone. ⓘ A 68-minute run sat apparently idle for six-minute stretches while working perfectly.
// ⇒ there is no timeout here, no `dead`, and `staleness` is REPORTED as a number, never acted on.
// ⛔ WRITE ANYTHING. Pure. It is handed rows and returns a description.
// ⛔ TOUCH L3. Whether she has RECEIVED anything is an input; nothing here delivers.

/**
 * ⭐ THE FOUR WORLDS `pending` WAS COLLAPSING, plus the two endings that are hers.
 * ⓘ All four were observed in a single session on 2026-08-25 — this is not a taxonomy from a whiteboard.
 */
export const WORLD = Object.freeze({
  /** genuinely busy → **wait**. The only one where doing nothing is correct. */
  working: 'working',
  /** blocked on someone who must **answer** — ⛔ not collect, and ⛔ not wait. */
  waitingForInput: 'waiting-for-input',
  /** terminal on their side, nothing received → **collect**. ⭐ Only Sotera can end this one. */
  finishedUncollected: 'finished-uncollected',
  /** ⭐ she has it. The only world established by HER act rather than by their report. */
  collected: 'collected',
  /** ⚠️ we could not reach them at all — **possibly transient**, e.g. a restart in progress. */
  counterpartUnreachable: 'counterpart-unreachable',
  /** ⛔ they are up and do not know this work — **permanent**. Swept, restarted, or never dispatched. */
  counterpartForgot: 'counterpart-forgot',
  /** ⭐ she declared it over. ⛔ Never a timeout. */
  abandoned: 'abandoned',
  /** they told us it failed / was cancelled / was refused. */
  ended: 'ended',
  /** ⛔ nothing has ever been heard and nothing asked. ⚠️ NOT "working" — we do not know that. */
  unobserved: 'unobserved',
})

/** Terminal so far as the COUNTERPART is concerned. ⓘ `awaiting_input` is deliberately absent. */
const THEIR_TERMINAL = new Set(['completed', 'failed', 'cancelled', 'refused'])
/** Endings established by an ACT on our side. */
const OUR_TERMINAL = new Set(['collected', 'abandoned'])

/**
 * ⭐⭐⭐ DERIVE THE WORLD. PURE.
 *
 * @param {object} o
 * @param {{state?:string, closedAt?:*}} o.exchange           the row as stored
 * @param {{contactResult?:string, heardState?:string, heardLastEvent?:string, observedAt?:*}|null} o.latest
 *        the most recent observation, or null if we have never asked
 * @param {number} [o.inboundTurns]  how many inbound turns exist — ⭐ the L3 input, a COUNT not content
 * @param {number} [o.now]           injected for testability. ⛔ never `Date.now()` inside, so a test
 *                                   cannot pass by accident on a fast machine
 * @returns {{world:string, actionable:string, stale:boolean|null, sinceHeardMs:number|null,
 *            heardState:string|null, recoverable:boolean|null, why:string}}
 */
export function deriveWorld({ exchange = null, latest = null, inboundTurns = 0, now = null } = {}) {
  const t = Number.isFinite(now) ? now : Date.now()
  const state = String(exchange?.state ?? '')

  // ── ⭐ ENDINGS WE ESTABLISHED COME FIRST, because they are OURS and cannot be contradicted by a
  // counterpart that has since forgotten the work. ⓘ `collected` outranks everything: once she has it,
  // what their process is doing is no longer the question.
  if (inboundTurns > 0 || state === 'collected') {
    return out(WORLD.collected, 'nothing — she has it', latest, t,
      'an inbound turn exists, so receipt has happened')
  }
  if (state === 'abandoned') {
    return out(WORLD.abandoned, 'nothing — she ended it', latest, t,
      'she declared it over; ⛔ never a timeout')
  }

  // ── ⭐ THEIR ENDINGS, as recorded on the exchange by an act that collected or closed it.
  if (THEIR_TERMINAL.has(state) && state !== 'completed') {
    return out(WORLD.ended, 'nothing — the destination ended it', latest, t, `recorded state: ${state}`)
  }

  // ── ⛔ NEVER ASKED. ⚠️ This is NOT "working": we have no evidence either way, and calling it working
  // would be the same false confidence as calling silence death.
  if (!latest) {
    return out(WORLD.unobserved, 'ask', null, t,
      'nothing has been heard and nothing asked — ⛔ absence of observation is not observation of absence')
  }

  switch (latest.contactResult) {
    case 'unreachable':
      // ⚠️ POSSIBLY TRANSIENT. A gateway restarting looks exactly like this for a few seconds.
      return out(WORLD.counterpartUnreachable, 'ask again later, or abandon', latest, t,
        'the destination could not be reached at all — ⚠️ may be transient', { recoverable: null })

    case 'not_found':
      // ⛔ PERMANENT, AND THE DISAMBIGUATING FACT IS OURS. `not_found` alone is meaningless — swept after
      // TTL, restarted-and-forgot, and wrong-id-never-dispatched all return the identical 404. It becomes
      // information only beside whether we EVER heard a state for this work.
      return out(WORLD.counterpartForgot,
        latest.heardStateEver ? 'abandon — ⚠️ the result existed and is gone' : 'abandon',
        latest, t,
        latest.heardStateEver
          ? 'they are up and no longer know this work, and we HAD heard a state for it ⇒ ⛔ a result we lost'
          : 'they are up and do not know this work; we never heard a state ⇒ swept, or never dispatched',
        { recoverable: false })

    case 'refused':
    case 'error':
      return out(WORLD.counterpartUnreachable, 'ask again later, or abandon', latest, t,
        `the attempt itself failed: ${latest.contactResult}`, { recoverable: null })

    case 'heard':
    default: break
  }

  const heard = String(latest.heardState ?? '')
  if (heard === 'awaiting_input') {
    // ⭐ NEEDS AN ANSWER, NOT A COLLECTION — and ⛔ NOT patience. Conflating this with "working" is what
    // let a run sit blocked on a question nobody was listening for.
    return out(WORLD.waitingForInput, 'answer them', latest, t,
      'they paused to ask us something')
  }
  if (heard === 'completed') {
    return out(WORLD.finishedUncollected, 'collect', latest, t,
      '⭐ they are done and nothing has been received — ⛔ only she can end this')
  }
  if (THEIR_TERMINAL.has(heard)) {
    return out(WORLD.ended, 'nothing — the destination ended it', latest, t, `they reported: ${heard}`)
  }
  return out(WORLD.working, 'wait', latest, t, `they reported: ${heard || 'a state we do not model'}`)
}

/**
 * ⭐ STALENESS IS REPORTED, NEVER ACTED ON. `staleFor` exists so a human or Sotera can SEE that the last
 * thing we heard is ninety minutes old. ⛔ Nothing in this file turns that number into a conclusion.
 */
function out(world, actionable, latest, now, why, extra = {}) {
  const at = latest?.observedAt ? new Date(latest.observedAt).getTime() : null
  const sinceHeardMs = at != null && Number.isFinite(at) ? Math.max(0, now - at) : null
  return {
    world,
    actionable,
    heardState: latest?.heardState ?? null,
    heardLastEvent: latest?.heardLastEvent ?? null,
    sinceHeardMs,
    // ⚠️ A REPORTED NUMBER, NOT A VERDICT. ⛔ There is deliberately no threshold constant in this file.
    stale: sinceHeardMs == null ? null : sinceHeardMs,
    recoverable: extra.recoverable ?? null,
    why,
  }
}

/**
 * ⭐⭐ THE CAPABILITY CONTRACT, STAMPED. ⚠️ Every line is *as of a build*, because this arc watched the
 * counterpart's interface change underneath it: a conclusion recorded against `8f271272` ("steering is not
 * on the interface") was false three hours later against `64a6f42c`.
 * ⛔ Never assert a counterpart capability without the build it was observed on.
 */
export const HERMES_OBSERVED = Object.freeze({
  build: '64a6f42c',
  observedAt: '2026-08-25',
  apiServerMtime: '2026-08-25T10:18',

  // ⭐ MEASURED LIVE, not read from source: see test/results/PREREG_STEER_INTERFACE.md
  steer: Object.freeze({
    exposed: true,                    // POST /v1/runs/{id}/steer
    preservesRunId: true,             // S1 — same run_id throughout
    interrupts: false,                // S2 — status stayed `running` across the steer
    deliveredNextIteration: true,     // S3
    changesSubsequentWork: true,      // ⭐⭐ S4 — search_files: 0 before the steer, 7 after
    emitsEvent: 'best-effort',        // S5 — `run.steered`, ⛔ dropped silently when no stream exists
    durableLastEvent: true,           // S6 — `last_event=run.steered` on GET /runs/{id}, unconditional
    // ⛔⛔ A REFUSAL LEAVES NO TRACE AT ALL. Measured: 409 `run_not_accepting_steer` left status,
    // last_event AND `updated_at` byte-identical. ⇒ if we want a refused steer to be auditable, WE must
    // record it — the destination keeps no memory of having said no.
    refusalLeavesTrace: false,
    // ⚠️ Source says the guard is `status != "running"`, which covers `waiting_for_approval`. MEASURED
    // only against `cancelled`. ⛔ The awaiting-approval case specifically is UNRUN, not confirmed.
    refusedWhenNotRunning: 'measured on cancelled; awaiting_input inferred from source, NOT measured',
  }),

  // ⭐ The two channels are complementary and neither is sufficient alone.
  events: Object.freeze({
    subscribeAtDispatch: true,        // S8 — measured: http 200, 3s after dispatch, 824 events to terminal
    reconnect: false,                 // ⛔ the queue is DESTROYED on disconnect, not released
    singleSubscriber: true,           // ⚠️ the desktop UI went blind on this run while the binding watched
    sweptIfUnsubscribedSec: 300,      // _RUN_STREAM_TTL
    carriesApprovalPayload: true,     // ⭐ the ONLY carrier — status can never show what is being asked
    volume: '~824 events in 24 min, mostly message.delta',
  }),
  status: Object.freeze({
    carriesOutput: true,              // ⭐ GET /v1/runs/{id} returns `output` on completion
    survivesSubscriberLoss: true,
    retainedAfterTerminalSec: 3600,   // _RUN_STATUS_TTL — ⚠️ a HARD DEADLINE on any recovery watcher
    survivesProcessRestart: false,    // ⛔ in-memory only
  }),

  // ⭐ Exists in the binding and is ADVERTISED, and ⛔ is NOT exposed to Sotera. Kept as a separate build
  // item at Ote's instruction rather than silently added: she can currently start work she cannot stop.
  cancellable: true,
  cancelExposedToSotera: false,
})
