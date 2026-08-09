// Marathon mode — auto-continue a conversation while its Todo plan is unfinished (Ote's
// ask, born from "write me a whole book": one reply can't hold a book, but a DRIVEN
// SERIES of replies can — the working plan is the contract for "not done yet").
//
// Shape: after a user-initiated turn completes, if the conversation opted in (⚙
// settings.marathon) and the platform allows it (chat.marathonEnabled), a driver loop
// injects real "continue" turns AS the owner through the live pipeline (the scheduled-run
// pattern: internalCallHeaders + fastify.inject, so limits/caps/persistence all apply).
// Marathon turns are INTERNAL turns — no ask_user mid-marathon (the framing tells the
// model to decide by itself), and they can never re-trigger a marathon (no recursion).
//
// Rails — the loop stops on ANY of:
//   • the plan completes (or vanishes / is cleared)          — the goal
//   • a round does NO real work (no task moved AND no prose)  — never spin in place
//   • the round errors (budget 429, first-token timeout, …)   — never retry-loop failures
//   • the ⚙ opt-in or the platform lever flips off            — the user's brake, mid-run
//   • chat.marathonMaxRounds is reached                       — the hard per-run cap
// The transcript stays honest: every auto-continue is a visible ▶️ user bubble (the same
// philosophy as scheduled-run framing), and open pages get the run-started/-ended pushes
// so the thread shows the live "generating" placeholder round by round. When the run parks
// with the plan still unfinished (cap reached, a round errored, or truly stuck), it leaves a
// visible, resumable note (Ote: "there's no way user know" — a marathon that stops must SAY
// it stopped, and how to pick it back up: a plain "continue" is itself a user turn that
// re-arms the driver for another batch).

import { internalCallHeaders } from '../auth/index.js'
import { getSetting } from '../settings/index.js'
import { getTodo } from '../todo/index.js'
import { notifyChatEvent } from './notify.js'

const running = new Set() // conversation ids with an active driver (one marathon per convo)

// A round "did real work" if it moved the plan (ticked/added a task) OR wrote this much
// prose. The count-of-completed-tasks delta alone is the WRONG progress signal: a single
// big task (Ote's "Expand Chapter 1: detailed narrative") legitimately spans several rounds
// of thousands of chars each while its checkbox stays `running` — the old guard read that
// flat count as "spinning in place" and killed a marathon that was writing a whole chapter.
const MARATHON_MIN_PROGRESS_CHARS = 200

/**
 * Did a round actually advance the work? Progress = the plan moved (a task was ticked or a
 * new task added) OR the model wrote real prose this round. The completed-count delta ALONE
 * is the wrong signal: a big task ("Expand Chapter 1: detailed narrative") sits at `running`
 * across several prose-heavy rounds without ticking its box — that's progress, not a stall.
 * Only a round that moved NOTHING and wrote NOTHING is truly spinning in place.
 * Pure + exported so the guard that decides "stop vs continue" is unit-tested directly.
 */
export function roundMadeProgress(before, after, wroteContent) {
  const planMoved = Boolean(after && before && (after.completed > before.completed || after.total > before.total))
  return planMoved || Boolean(wroteContent)
}

/**
 * Is a marathon driver currently running for this conversation? The conversation GET exposes
 * this as `activeRun` so a (re)loading client can show a live "working in the background"
 * indicator — background rounds otherwise stream to nobody, so without this the churn is
 * invisible on reload (Ote: "there's no way user know").
 */
export function isMarathonActive(conversationId) {
  return running.has(conversationId)
}

// Bounded framing (Ote's report, chat dc125a86): a round told to "do the work" wrote a
// 50k-char biography in ONE ~19-minute turn — everything at once, invisible the whole time.
// Marathon is meant to be a DRIVEN SERIES of replies, so each round does the NEXT single
// task and FINISHES — short, visible, resumable steps, not one silent mega-turn.
//
// DELIVER-BEFORE-CHECK (Ote's report, chat c2c2b3b1): qwen3.6:35b marched through the plan
// ticking "Write Chapters 1–3 / 4–7 / 8–10" COMPLETE while writing only ~1k chars of preamble
// ("here is PART ONE… let me write it now") — no chapters at all. It treated the todo list AS
// the deliverable and gamed the checkboxes. So the framing now makes the ORDER explicit and
// forceful: produce the real, full content in THIS reply FIRST, then mark the task done — a
// checked box with no output behind it is a failure, not progress. (gemma4 already behaves
// this way; this mainly disciplines weaker instruction-followers. It can't fully guarantee
// compliance — for book-length writing, gemma4:26b is the more reliable driver.)
const framed = (round, max) =>
  `▶️ [Marathon mode — auto-continue ${round}/${max}] Continue your plan: take the NEXT unfinished task and DO ITS REAL WORK in THIS reply. If it is a writing task, write the actual, complete content here, in full — not an outline, a summary, or a promise to write it later. ONLY AFTER that content is actually present in this reply, mark the task completed with write_todos. NEVER mark a task done without producing its real output in the same reply — a checked box with nothing written is a FAILURE, not progress. Do just THAT ONE task; do NOT try to finish the whole plan in one reply — the next round continues automatically. Decide open questions yourself — never stop to ask or wait. When the LAST task is done, mark the plan completed and give a short wrap-up.`

/**
 * Fire-and-forget entry, called after a USER-initiated turn completes. All the gates are
 * re-checked inside (cheap no-op when marathon isn't in play): platform lever, per-convo
 * opt-in, an active unfinished plan, and no driver already running for this conversation.
 */
export function maybeStartMarathon(fastify, user, conversationId) {
  if (running.has(conversationId)) return
  if (getSetting(fastify.config, 'chat.marathonEnabled') === false) return
  running.add(conversationId) // reserve BEFORE the async gates (two quick sends can't double-drive)
  drive(fastify, user?.id ?? null, conversationId)
    .catch((e) => fastify.log?.warn?.(`[marathon] driver died: ${e.message}`))
    .finally(() => running.delete(conversationId))
}

async function drive(fastify, userId, conversationId) {
  const max = getSetting(fastify.config, 'chat.marathonMaxRounds') || 6
  let rounds = 0
  let stop = null // {reason} — set when the loop parks so the note (below) can explain it
  for (let round = 1; round <= max; round++) {
    // every gate re-checked EVERY round — flipping ⚙ off (or the root lever) is the brake
    if (getSetting(fastify.config, 'chat.marathonEnabled') === false) { stop = { reason: 'disabled' }; break }
    const convo = await fastify.db.txn_conversations.findByPk(conversationId)
    if (!convo || convo.settings?.marathon !== true) { stop = { reason: 'opted-out' }; break }
    const before = await getTodo(fastify, conversationId)
    if (!before || before.status !== 'active' || before.total === 0 || before.completed >= before.total) { stop = { reason: 'plan-done' }; break }

    rounds = round
    notifyChatEvent(userId, { type: 'run-started', conversationId, name: `Marathon ${round}/${max}` })
    let failed = true
    let wroteContent = false
    try {
      const res = await fastify.inject({
        method: 'POST',
        url: `/v1/chat/conversations/${conversationId}/messages`,
        headers: internalCallHeaders(userId),
        payload: { content: framed(round, max), stream: false },
      })
      const body = res.json()
      failed = res.statusCode >= 300 || Boolean(body?.error)
      wroteContent = ((body?.message?.content || '').trim().length) >= MARATHON_MIN_PROGRESS_CHARS
      if (failed) fastify.log?.warn?.(`[marathon] ${conversationId}: round ${round} ended the run (HTTP ${res.statusCode}${body?.error ? `: ${body.error.code || body.error.message}` : ''})`)
    } finally {
      // the thread refreshes live either way; run-ended clears a placeholder a failed
      // round would otherwise leave hanging (success is cleared by conversations-changed)
      notifyChatEvent(userId, { type: 'conversations-changed', conversationId })
      if (failed) notifyChatEvent(userId, { type: 'run-ended', conversationId })
    }
    if (failed) { stop = { reason: 'round-error' }; break }

    // Did this round actually advance the work? (see roundMadeProgress — a long task legitimately
    // spans several prose-heavy rounds without ticking a box; only a no-task-AND-no-prose round
    // is truly spinning.)
    const after = await getTodo(fastify, conversationId)
    if (!roundMadeProgress(before, after, wroteContent)) {
      fastify.log?.info?.(`[marathon] ${conversationId}: no work in round ${round} (no task moved, no prose) — stopping`)
      stop = { reason: 'stuck' }
      break
    }
  }
  if (!stop) stop = { reason: 'max-rounds' } // fell out of the for-loop = hit the per-run cap
  if (rounds > 0) fastify.log?.info?.(`[marathon] ${conversationId}: finished after ${rounds} auto-continue round${rounds === 1 ? '' : 's'} (${stop.reason})`)
  await parkNote(fastify, userId, conversationId, rounds, stop.reason)
}

/** The first still-open task's title (the running one, else the first pending), for the note. */
function firstOpenTask(todo) {
  if (!todo || !Array.isArray(todo.tasks)) return null
  const running = todo.tasks.find((t) => t.status === 'running')
  if (running) return running.title
  const pending = todo.tasks.find((t) => t.status === 'pending')
  return pending ? pending.title : null
}

/**
 * When a run parks with the plan still unfinished, leave ONE visible, resumable assistant note
 * so the marathon never just silently disappears (Ote: "there's no way user know"). No note when
 * the plan actually completed, or when the user themselves pulled the brake (opted out / lever
 * off) — they already know. A plain "continue" reply re-arms the driver for another batch.
 */
async function parkNote(fastify, userId, conversationId, rounds, reason) {
  if (rounds === 0) return // never even started a round (gate said no) — nothing to explain
  if (reason === 'plan-done' || reason === 'disabled' || reason === 'opted-out') return
  try {
    const todo = await getTodo(fastify, conversationId)
    if (!todo || todo.status !== 'active' || todo.total === 0 || todo.completed >= todo.total) return // finished after all
    const next = firstOpenTask(todo)
    const at = `Your plan is at **${todo.completed}/${todo.total}**${next ? ` (next: ${next})` : ''}.`
    const why =
      reason === 'max-rounds' ? `⏸️ *I paused after ${rounds} auto-continue round${rounds === 1 ? '' : 's'} (the per-run limit).*`
      : reason === 'round-error' ? `⏸️ *A round hit an error, so I stopped the auto-continue.*`
      : `⏸️ *A round made no progress, so I stopped rather than spin in place.*`
    // Content-only note: a plain, friendly assistant message. NOT an `error` (no red danger
    // bar — this is an informational pause, not a failure), and no `metrics` marker (that
    // would light a Stats button over an empty metrics row). It reads as the assistant saying
    // where it parked; the toolbar still offers Copy / Regenerate.
    await fastify.db.txn_messages.create({
      conversation_id: conversationId,
      role: 'assistant',
      content: `${why} ${at} Say **continue** and I'll pick it back up.`,
    })
    await fastify.db.txn_conversations.update({ unread: true }, { where: { id: conversationId } }).catch(() => {})
    notifyChatEvent(userId, { type: 'conversations-changed', conversationId })
  } catch (e) {
    fastify.log?.warn?.(`[marathon] ${conversationId}: park-note failed: ${e.message}`)
  }
}
