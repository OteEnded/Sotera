// ⭐⭐⭐ THE REVISIT LIFECYCLE — pure. Store evidence, derive the world, and let only an ACT end it.
//
// Ote, 2026-08-25: *"Use the revisit record as the authoritative event, and derive last_successful_revisit
// / last_reviewed_message / needs_revisit from it. A cached last_revisit_at on the conversation header
// could still be useful for efficient scheduling, but it should be a projection/cache, not the audit
// record."* And the requirement everything below serves: *"a failed revisit must leave a record. «Never
// tried» and «tried but failed» must never collapse into the same database state."*
//
// ── ⭐⭐ THIS IS THE SECOND USE OF A RULE, NOT A SECOND COPY OF ONE ──────────────────────────────────
// `app/advice/lifecycle.js` was rebuilt around exactly this shape three days ago, after one exchange
// whose counterpart went `running → waiting_for_approval → connection refused → 404` while a flat
// `pending` never moved once. ⇒ **a stored status becomes a lie by ageing**, and the repair is never to
// add values to the enum — it is to record WHEN WE LAST HEARD AND FROM WHAT, and compute the rest.
// ⛔ Same discipline here: there is no status column on `txn_conversations`, and there must not be one.
//
// ⛔⛔ PURE. No database, no clock of its own, no IO. Everything it needs is passed in, which is what
// makes "one year of silence still means started" testable without waiting a year.

/** The world a conversation is in, derived from its attempts. ⛔ Never stored. */
export const REVISIT = Object.freeze({
  // ⭐ NOT A ROW. 016's row-exists-vs-no-row property, carried forward: "she was never asked" and "she
  // was asked and kept nothing" are opposite facts and must not need a vocabulary to tell apart.
  neverAttempted: 'never_attempted',
  requested: 'requested', //  claimed, the turn has not begun
  started: 'started',     //  the turn began and we have not heard since
  completed: 'completed', //  she was asked and answered ⛔ NOT "she found something"
  failed: 'failed',       //  the machinery broke — `failure` says how
  blocked: 'blocked',     //  a boundary refused her: found, not authorized
  // ⭐⭐⭐ A CLEAN STOP, NOT A BREAKAGE. Ote: *"user preemption is an intentional control-flow outcome,
  // not a failure."* ⛔ It must never be folded into `failed`: that would make a healthy lane that is
  // correctly yielding to a person look broken, and would corrupt `consecutiveFailures`, which exists to
  // find a conversation that genuinely cannot be revisited.
  preempted: 'preempted',
})

/** ⭐ The outcomes a row may terminate with. Mirrors migration 025's CHECK exactly. */
export const OUTCOME = Object.freeze({ completed: 'completed', failed: 'failed', blocked: 'blocked', preempted: 'preempted' })

const at = (v) => (v == null ? null : (v instanceof Date ? v : new Date(v)))
const ms = (v) => { const d = at(v); return d && !Number.isNaN(d.getTime()) ? d.getTime() : null }

/** The state of ONE attempt, from its own timestamps. ⛔ No clock: silence is never a conclusion. */
export function attemptState(row) {
  if (!row) return REVISIT.neverAttempted
  if (row.outcome === OUTCOME.completed) return REVISIT.completed
  if (row.outcome === OUTCOME.failed) return REVISIT.failed
  if (row.outcome === OUTCOME.blocked) return REVISIT.blocked
  if (row.outcome === OUTCOME.preempted) return REVISIT.preempted
  // ⛔⛔ AN IN-FLIGHT ATTEMPT STAYS IN FLIGHT, however old it is. Tested at a minute and at a year: still
  // `started`. Deriving "it must have died by now" would be inventing an event nobody observed — the
  // exact defect `pending` had, where four different worlds shared one silence.
  return row.startedAt || row.started_at ? REVISIT.started : REVISIT.requested
}

/**
 * ⭐⭐⭐ THE CONVERSATION'S WORLD, DERIVED FROM ITS ATTEMPTS AND WHERE ITS MESSAGES END.
 *
 * @param {object}   o
 * @param {object[]} o.attempts        rows for ONE conversation, any order
 * @param {number}   o.topRollingId    the conversation's newest message id (0/null if it has none)
 * @returns {{
 *   state: string, cursor: number|null, hasUnreviewed: boolean, reviewFrom: number|null,
 *   inFlight: object|null, lastAttempt: object|null, attempts: number,
 *   consecutiveFailures: number, needsRevisit: boolean
 * }}
 */
export function deriveRevisitState({ attempts = [], topRollingId = null } = {}) {
  const rows = [...(attempts ?? [])].sort(
    (a, b) => (ms(a.requested_at ?? a.requestedAt) ?? 0) - (ms(b.requested_at ?? b.requestedAt) ?? 0),
  )
  const top = Number(topRollingId) || 0

  // ── ⭐⭐⭐ THE CURSOR ADVANCES ON COMPLETION, NEVER ON ATTEMPT ────────────────────────────────────
  // ⚠️⚠️ THE TRAP THIS AVOIDS IS SUBTLE AND PERMANENT. `lastWatermark()` used to read
  // `max(up_to_rolling_id)` over ALL rows. The moment failures started being recorded, a single failed
  // attempt at watermark X would make the cursor X — and the conversation would never be revisited
  // again. ⇒ **the fix that makes failure visible would have silently stalled the whole lane.**
  // ⭐ The cursor means "how far I have actually REVIEWED", never "how far I have tried".
  const completed = rows.filter((r) => r.outcome === OUTCOME.completed)
  const cursor = completed.length
    ? Math.max(...completed.map((r) => Number(r.up_to_rolling_id ?? r.upTo ?? 0) || 0))
    : null

  const inFlight = rows.find((r) => r.outcome == null) ?? null
  const lastAttempt = rows.length ? rows[rows.length - 1] : null

  // ⭐ CONSECUTIVE, counted backwards from the newest — a conversation that failed twice and then
  // succeeded is not a failing conversation, and a count of all-time failures would say it was.
  let consecutiveFailures = 0
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].outcome === OUTCOME.failed) consecutiveFailures += 1
    else if (rows[i].outcome != null) break
  }

  const hasUnreviewed = top > 0 && (cursor == null || top > cursor)
  return {
    state: attemptState(lastAttempt),
    cursor,
    hasUnreviewed,
    // ⭐ HIS INCREMENTAL MODEL, LITERALLY: reviewed through 120, so review 121–145. `null` cursor means
    // the conversation has never been reviewed, so the range starts at its beginning.
    reviewFrom: hasUnreviewed ? (cursor == null ? null : cursor + 1) : null,
    inFlight,
    lastAttempt,
    attempts: rows.length,
    consecutiveFailures,
    // ⛔ AN IN-FLIGHT ATTEMPT SUPPRESSES A NEW ONE — the database enforces that too (025's in-flight
    // partial unique index), and agreeing with it here means the scheduler does not waste a turn
    // discovering it. Two copies of an eligibility rule is how they stop agreeing; this one DEFERS.
    needsRevisit: hasUnreviewed && !inFlight,
  }
}

/**
 * ⭐⭐ ATTEMPTS THAT WERE OPENED AND NEVER FINISHED — the input to a SWEEP, which is an ACT.
 *
 * ⚠️⚠️ WHY THIS EXISTS AT ALL, AND IT IS A CONSEQUENCE THE SCHEMA CREATES. 025's in-flight unique index
 * allows one open attempt per stretch. If a process dies mid-turn, that row stays `outcome IS NULL`
 * forever — and it permanently blocks its own watermark from ever being claimed again. A conversation
 * would go quiet in the ledger and nobody would be able to say why.
 *
 * ⇒ ⭐ THE RESOLUTION KEEPS BOTH RULES INTACT: derivation still never invents an ending (`attemptState`
 * returns `started` at one minute and at one year alike), and the ending is supplied by an explicit ACT
 * that writes its own evidence — `outcome='failed'` with a `failure` naming the sweep. **Deriving death
 * from silence and recording a sweep that happened are different things**, and only the second leaves
 * something a human can audit.
 * ⛔ This function decides nothing. It selects candidates; the caller performs the act.
 *
 * @param {object[]} attempts
 * @param {{ now: number|Date, staleAfterMs: number }} o
 */
export function stalledAttempts(attempts = [], { now, staleAfterMs } = {}) {
  const t = ms(now)
  if (t == null || !(staleAfterMs > 0)) return []
  return (attempts ?? []).filter((r) => {
    if (r.outcome != null) return false
    const opened = ms(r.requested_at ?? r.requestedAt)
    return opened != null && (t - opened) >= staleAfterMs
  })
}

/**
 * ⭐ A ONE-LINE READING OF THE WORLD, for a log or an operator. ⛔ Never for her — this is machinery
 * vocabulary, and the cognition layer has its own rule about that.
 */
export function revisitSummaryLine(d) {
  if (!d) return 'no derivation'
  const bits = [`state=${d.state}`, `cursor=${d.cursor ?? 'none'}`, `attempts=${d.attempts}`]
  if (d.hasUnreviewed) bits.push(`unreviewed from ${d.reviewFrom ?? 'the beginning'}`)
  if (d.consecutiveFailures) bits.push(`⚠ ${d.consecutiveFailures} consecutive failure(s)`)
  if (d.inFlight) bits.push('⏳ one attempt still open')
  return bits.join(' · ')
}
