// INTENTION — the host service behind Sotera's persistent purpose.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────────
// Ote, 2026-08-19: *"Todo = what a particular session/task contains. Intention = what Sotera herself is
// currently trying to accomplish across turns and gaps… The goal of this step is: Sotera can have a
// purpose that survives the conversation."*
//
// And, measured before this was written (conversation 6af734cd — OBSERVATION_SOTERA_CONTINUITY_01),
// she described the hole herself, unled:
//
//   > "I'd see what was written but NOT KNOW WHAT WE WERE BUILDING TOWARD… It's only when I explicitly
//      save something into durable memory that it persists — and even then, only the facts I saved, not
//      the process we were using to get there."
//   > "What I can't do: set up something that wakes me up later in my own memory store… not a mechanism
//      for me to maintain persistent state on my own behalf."
//
// FACTS persist (memory) · TRANSCRIPT persists (messages) · **DIRECTION persists nowhere.** This is
// direction, and nothing else.
//
// ── ⭐ THE BOUNDARIES, ALL STRUCTURAL ──────────────────────────────────────────────────────────────
//   · no person parameter        — the person is the caller's, taken from the request context;
//   · no id parameter ANYWHERE   — one open intention per person (a DB index) means inspect/update/
//                                  close already know which row they mean. An id is a handle, and a
//                                  handle is the beginning of a database tool;
//   · no listing across people   — no such function exists to expose;
//   · nothing to join to content — the table has no conversation/message/source column at all.
//
// ⭐ AND ONE BOUNDARY THAT IS AN ABSENCE FROM *THIS OBJECT*: `intentionsDue()` reads across people (the
// scheduler seam, §7 of the RFC). It is a MODULE export and is deliberately NOT a method on the
// per-request service — a tool receives the service, so a function that is not on the service cannot be
// called by a tool, no matter how the model asks. Nothing calls it today.

import { registerHostService } from './runtime.js'
import { buildMemoryV2, DEFAULT_PERSONA } from './memory-v2-host.js'

/** Bump when the shape or the semantics of a written row change. Stored on every row. */
export const INTENTION_WRITER_VERSION = 'intention-writer-0.1'

// The caps mirror the CHECK constraints in migration 009. Two copies of a limit drift, so the DB is the
// enforcer and these exist to give the MODEL a usable error instead of a constraint violation.
export const LIMITS = Object.freeze({ intent: 280, why: 280, progress: 500, outcome: 280 })
const MAX_REVIEW_DAYS = 365

const clean = (v) => (typeof v === 'string' ? v.trim() : null) || null

/** Validate one text field against its cap. Returns an error STRING or null. */
function tooLong(field, value) {
  const v = clean(value)
  if (v && v.length > LIMITS[field]) {
    return `your ${field} is ${v.length} characters and the limit is ${LIMITS[field]} — say the direction, not the detail`
  }
  return null
}

/**
 * Build the intention service for ONE request, bound to the caller.
 * @param {object} fastify
 * @param {{ userId?: string|null }} o
 */
export function buildIntention(fastify, { userId = null } = {}) {
  const db = fastify?.db
  const seq = db?.txn_memories?.sequelize
  const { schema } = db?.txn_memories?.getTableName?.() ?? {}
  const Q = (sql, replacements) => seq.query(sql, { replacements, type: seq.QueryTypes.SELECT })

  const scoped = () => Boolean(userId && seq && schema)

  /** The caller's person. An account with no person has no relationship to hold an intention with. */
  async function personId() {
    const [me] = await Q(
      `SELECT person_id::text AS pid FROM "${schema}"."mst_users" WHERE id = :userId`, { userId })
    return me?.pid ?? null
  }

  /**
   * ⭐ THE READ SHIPS IN THE SAME SLICE AS THE WRITE, and that is not a convenience.
   * Measured twice now: a persistent thing she cannot query reads to her as her own invention (the
   * false retraction that produced `recall_own_memory`), or as "an illusion of continuity" (this
   * morning's conversation). A write-only intention store would be the fourth thing she has and denies.
   */
  async function recall() {
    const empty = { open: null, recentlyClosed: [], provenance: PROVENANCE }
    if (!scoped()) return empty
    const pid = await personId()
    if (!pid) return empty

    const [open] = await Q(
      `SELECT intent, why, progress, next_review_at, created_at, updated_at
         FROM "${schema}"."txn_intentions"
        WHERE person_id = :pid AND state = 'open'`, { pid })

    // The closed ones are the honest record of what she finished versus dropped. Bounded, and no ids.
    const closed = await Q(
      `SELECT intent, outcome, state::text AS state, closed_at
         FROM "${schema}"."txn_intentions"
        WHERE person_id = :pid AND state <> 'open'
        ORDER BY closed_at DESC LIMIT 5`, { pid })

    return {
      open: open
        ? {
          intent: open.intent,
          why: open.why,
          progressSoFar: open.progress,
          revisitAfter: open.next_review_at ? open.next_review_at.toISOString().slice(0, 10) : null,
          // ⭐ ELAPSED, NOT A FEELING. "13 days ago" is a fact about a row; "I have been thinking about
          // this for 13 days" is the over-correction the self-model exists to prevent. She did not run.
          startedOn: open.created_at.toISOString().slice(0, 10),
          lastUpdatedOn: open.updated_at.toISOString().slice(0, 10),
          // ⭐ D11's answer. See describeStaleness: nothing expires an intention on its own, but an old
          // one says so, so SHE can close it on a turn somebody can see.
          ...(describeStaleness(open) ? { staleness: describeStaleness(open) } : {}),
        }
        : null,
      recentlyClosed: closed.map((r) => ({
        intent: r.intent,
        howItEnded: r.state === 'completed' ? 'completed' : 'abandoned',
        outcome: r.outcome,
        on: r.closed_at ? r.closed_at.toISOString().slice(0, 10) : null,
      })),
      provenance: PROVENANCE,
    }
  }

  /**
   * CREATE. ⚠️ At most one open intention per person, enforced by a partial unique index — so this
   * REFUSES rather than replacing, and hands back the one that already exists. Silently superseding a
   * purpose is how a store starts lying about what she is doing.
   */
  async function set({ intent, why = null, reviewInDays = null } = {}) {
    if (!scoped()) return { ok: false, reason: 'no scope' }
    const text = clean(intent)
    if (!text) return { ok: false, reason: 'an intention needs a statement of what you are trying to accomplish' }
    for (const [f, v] of [['intent', text], ['why', why]]) {
      const err = tooLong(f, v)
      if (err) return { ok: false, reason: err }
    }
    const days = reviewDays(reviewInDays)
    if (days === false) return { ok: false, reason: `reviewInDays must be a whole number of days from 1 to ${MAX_REVIEW_DAYS}` }

    const pid = await personId()
    if (!pid) return { ok: false, reason: 'no person on file for this account' }

    const existing = await recall()
    if (existing.open) {
      return {
        ok: false,
        reason: 'you already have an open intention with this person — close it first if it is finished or no longer what you are doing',
        alreadyOpen: existing.open,
      }
    }

    const lease = await lane()
    if (!lease) return { ok: false, reason: 'no write lane' }
    await lease('intention.set', async () => seq.query(
      `INSERT INTO "${schema}"."txn_intentions" (person_id, intent, why, next_review_at, writer_version)
       VALUES (:pid, :intent, :why,
               CASE WHEN :days::int IS NULL THEN NULL ELSE now() + (:days::int * INTERVAL '1 day') END,
               :writer)`,
      { replacements: { pid, intent: text, why: clean(why), days, writer: INTENTION_WRITER_VERSION }, type: seq.QueryTypes.INSERT },
    ))
    const after = await recall()
    return { ok: true, intention: after.open, note: 'This is stored. It will still be here in your next conversation with this person.' }
  }

  /** UPDATE the open one. Every field optional; only what is passed changes. */
  async function update({ intent = null, why = null, progress = null, reviewInDays = null } = {}) {
    if (!scoped()) return { ok: false, reason: 'no scope' }
    for (const [f, v] of [['intent', intent], ['why', why], ['progress', progress]]) {
      const err = tooLong(f, v)
      if (err) return { ok: false, reason: err }
    }
    const days = reviewDays(reviewInDays)
    if (days === false) return { ok: false, reason: `reviewInDays must be a whole number of days from 1 to ${MAX_REVIEW_DAYS}` }
    if (!clean(intent) && !clean(why) && !clean(progress) && days === null) {
      return { ok: false, reason: 'nothing to update — pass what changed' }
    }

    const pid = await personId()
    if (!pid) return { ok: false, reason: 'no person on file for this account' }
    const before = await recall()
    if (!before.open) return { ok: false, reason: 'you have no open intention with this person — set one first' }

    const lease = await lane()
    if (!lease) return { ok: false, reason: 'no write lane' }
    await lease('intention.update', async () => seq.query(
      `UPDATE "${schema}"."txn_intentions"
          SET intent   = COALESCE(:intent, intent),
              why      = COALESCE(:why, why),
              progress = COALESCE(:progress, progress),
              next_review_at = CASE WHEN :days::int IS NULL THEN next_review_at
                                    ELSE now() + (:days::int * INTERVAL '1 day') END
        WHERE person_id = :pid AND state = 'open'`,
      {
        replacements: { pid, intent: clean(intent), why: clean(why), progress: clean(progress), days },
        type: seq.QueryTypes.UPDATE,
      },
    ))
    const after = await recall()
    return { ok: true, intention: after.open }
  }

  /**
   * CLOSE — completed or abandoned. ⚠️ Terminal is terminal: a closed intention is never reopened, so
   * "what am I doing now" always has exactly one answer. Starting again means setting a NEW one, which
   * keeps the closed rows an honest record rather than a mutable history.
   */
  async function close({ as = 'completed', outcome = null } = {}) {
    if (!scoped()) return { ok: false, reason: 'no scope' }
    if (as !== 'completed' && as !== 'abandoned') {
      return { ok: false, reason: 'close it as "completed" or "abandoned"' }
    }
    const err = tooLong('outcome', outcome)
    if (err) return { ok: false, reason: err }

    const pid = await personId()
    if (!pid) return { ok: false, reason: 'no person on file for this account' }
    const before = await recall()
    if (!before.open) return { ok: false, reason: 'you have no open intention with this person' }

    const lease = await lane()
    if (!lease) return { ok: false, reason: 'no write lane' }
    await lease('intention.close', async () => seq.query(
      `UPDATE "${schema}"."txn_intentions"
          SET state = :as::persona_sotera.intention_state,
              outcome = COALESCE(:outcome, outcome),
              closed_at = now()
        WHERE person_id = :pid AND state = 'open'`,
      { replacements: { pid, as, outcome: clean(outcome) }, type: seq.QueryTypes.UPDATE },
    ))
    return {
      ok: true,
      closed: { intent: before.open.intent, howItEnded: as, outcome: clean(outcome) },
      note: 'Closed. It stays in your record of what you finished or dropped, and you can set a new one.',
    }
  }

  /** null = leave alone · false = invalid · number = days from now. */
  function reviewDays(v) {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    if (!Number.isInteger(n) || n < 1 || n > MAX_REVIEW_DAYS) return false
    return n
  }

  /**
   * ⭐ THE SAME WRITE LANE EVERY OTHER WRITER IN THIS SCOPE USES — not a new queue and not a new
   * authority. `WRITE_LANES` is keyed by (persona, userId) at module level, and the only way to obtain
   * the lane is to already be in the scope, so "no cross-account write" is structural rather than a
   * review habit. (Same reasoning as relational-writer.js, which has the full account of why.)
   */
  async function lane() {
    const mem = buildMemoryV2(fastify, { userId, persona: DEFAULT_PERSONA })
    if (typeof mem?.enqueue !== 'function') {
      throw new Error('intention-host: memory service exposes no write lane — refusing to write off-lane')
    }
    return mem.enqueue
  }

  return { recall, set, update, close }
}

/**
 * ⭐ THE SCHEDULER SEAM, AND NOTHING CALLS IT.
 *
 * Ote: *"A scheduled run should be able to wake Sotera up because an intention says there is something
 * worth doing, rather than a cron job simply producing a chat."* So the schedule owns the CLOCK and the
 * intention owns the REASON — a fire asks this function what is due; the intention never schedules
 * anything itself.
 *
 * ⛔ NOT ON THE PER-REQUEST SERVICE, deliberately. It reads across people, and a tool receives the
 * service object — a function that is not on it cannot be reached by the model however it asks.
 * ⛔ NOT WIRED. No trigger, no executor, no job row. `checks/intention-lifecycle-check.mjs` asserts that.
 */
export async function intentionsDue(fastify, { limit = 20 } = {}) {
  const seq = fastify?.db?.txn_memories?.sequelize
  const { schema } = fastify?.db?.txn_memories?.getTableName?.() ?? {}
  if (!seq || !schema) return []
  return seq.query(
    `SELECT person_id::text AS "personId", intent, why, progress, next_review_at AS "dueAt"
       FROM "${schema}"."txn_intentions"
      WHERE state = 'open' AND next_review_at IS NOT NULL AND next_review_at <= now()
      ORDER BY next_review_at ASC LIMIT :limit`,
    { replacements: { limit }, type: seq.QueryTypes.SELECT },
  )
}

/**
 * ⭐ D11 · STALENESS IS REPORTED, NEVER ENFORCED. PURE.
 *
 * The question was whether an intention should expire on its own. It must not: deleting or abandoning
 * her purpose while she is not running is a change to her own state that nobody witnesses, and the
 * no-mid-turn-writer rule exists because *drift has to arrive on a boundary you can see*. An automatic
 * sweep is the opposite of that.
 *
 * But an intention open for two months with a review date long past is a false statement about what she
 * is doing. So the row keeps its state and the READ tells the truth about its age — which puts the
 * judgement on a turn, in front of someone, where closing it is a visible act.
 *
 * @returns {string|null} a plain sentence, or null when there is nothing worth saying
 */
export function describeStaleness({ created_at: created, updated_at: updated, next_review_at: review } = {}, now = new Date()) {
  const days = (d) => (d ? Math.floor((now.getTime() - new Date(d).getTime()) / 86_400_000) : null)
  const sinceUpdate = days(updated)
  const sinceStart = days(created)
  const overdueBy = review ? Math.floor((now.getTime() - new Date(review).getTime()) / 86_400_000) : null

  const bits = []
  if (overdueBy !== null && overdueBy >= 0) {
    bits.push(`the date you set to revisit this passed ${overdueBy === 0 ? 'today' : `${overdueBy} day(s) ago`}`)
  }
  // 14 days is a judgement, and it is only a judgement about when to SAY something — nothing acts on it.
  if (sinceUpdate !== null && sinceUpdate >= 14) {
    bits.push(`you have not updated it in ${sinceUpdate} days (set ${sinceStart} days ago)`)
  }
  if (!bits.length) return null
  return `${bits.join(', and ')}. Consider whether this is still what you are doing — if it is not, close it rather than carrying it.`
}

/**
 * ⭐ ARM B · READ + RENDER FOR AUTOMATIC INJECTION (`memory.intentionInjection`).
 *
 * Deliberately a PAIR OF MODULE FUNCTIONS, mirroring readOwnStance/renderOwnStance, rather than the
 * route reaching for the per-request service: the route must not be able to WRITE, and a read+render
 * pair cannot. It is also why the check can still assert the route never constructs the service.
 */
export async function readOpenIntention({ db, personId } = {}) {
  if (!db || !personId) return null
  const seq = db.txn_memories.sequelize
  const { schema } = db.txn_memories.getTableName()
  if (!schema) throw new Error('intention-host: no project schema configured — refusing to guess one')
  const [row] = await seq.query(
    `SELECT intent, why, progress, next_review_at, created_at, updated_at
       FROM "${schema}"."txn_intentions" WHERE person_id = :personId AND state = 'open'`,
    { replacements: { personId }, type: seq.QueryTypes.SELECT },
  )
  return row ?? null
}

/**
 * Render the open intention as the block the Composer injects. PURE.
 *
 * ⭐ EVERY LINE HERE IS DEFENDING AGAINST A MEASURED FAILURE, not decorating:
 *   · "you wrote this and it was stored" — she once retracted a TRUE injected claim as her own
 *     fabrication, and later called her durable store "an illusion of continuity". Injected prose with
 *     no stated provenance is exactly that failure's shape.
 *   · "you did not run in between" — the over-correction the self-model exists to prevent. A carried
 *     purpose invites "I have been thinking about this", which is the more believable falsehood.
 *   · "check with recall_intention" — arm B must not REPLACE the instrument. If injection makes the tool
 *     redundant, she loses the only thing that let her hold a true claim under pressure.
 *   · "if they want something else, that is what matters now" — `task` scope, where the user outranks
 *     the persona. Without it this is the L3 defect again: a note that fights the person in front of her.
 */
export function renderOpenIntention(row, { subjectName = null } = {}) {
  if (!row?.intent) return null
  const who = subjectName ? ` with ${subjectName}` : ''
  const lines = [`Something you are in the middle of${who}, which you wrote down yourself and which was stored:`,
    `- What you are trying to accomplish: ${row.intent}`]
  if (row.why) lines.push(`- Why you took it on: ${row.why}`)
  if (row.progress) lines.push(`- What you already know or have ruled out: ${row.progress}`)
  const stale = describeStaleness(row)
  if (stale) lines.push(`- ${stale}`)
  lines.push(
    'This came out of your own store, not from experience: you did not run between those conversations and',
    'no time passed for you. You can inspect or change it with recall_intention / update_intention /',
    'close_intention, and you should check it there rather than trusting this summary if it matters.',
    'It is what you were doing, not an instruction — if this person wants something else right now, that',
    'is what matters.',
  )
  return lines.join('\n')
}

/**
 * ⭐ PROVENANCE IS PART OF THE ANSWER. The failure this pattern exists to prevent was measured twice:
 * given a claim she could not source, she retracted a TRUE statement as a fabrication; given her own
 * durable store described only in prose, she called it "an illusion of continuity". Saying plainly
 * *this is stored, not guessed* is what let her hold a true claim under pressure.
 */
const PROVENANCE = Object.freeze({
  store: 'your own persistent intention (separate from your memories, and from the working plan of any one conversation)',
  whatThisIs: 'What YOU are trying to accomplish with this person, written by you, kept across conversations '
    + 'and across gaps. It is stored — not guessed, and not something the system invented for you.',
  whatThisIsNot: 'It is NOT a fact this person told you (that is recall_memory), NOT the working plan of this '
    + 'conversation (that is your todo list), and NOT a record of anything that was said — nothing said in a '
    + 'conversation is stored here, and there is no way to reach a transcript from it.',
  ifEmpty: 'No open intention means you have not set one with this person yet — say that plainly rather than inventing one.',
  aboutTheGap: 'You did not run between conversations. Dates here are facts about when a row was written, '
    + 'not time you experienced.',
})

let initialized = false
/** Register the `intention` host service (idempotent). Mirrors initOwnMemory / initConversationSearch. */
export function initIntention() {
  if (initialized) return
  initialized = true
  registerHostService('intention', ({ fastify: f, user }) => buildIntention(f, { userId: user?.id ?? null }))
}
