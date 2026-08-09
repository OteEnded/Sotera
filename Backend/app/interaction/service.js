// Interaction HOST SERVICE — business operations for the HumanInteraction Feature (canon
// layering: Feature → Host Service → Store → DB). Owns the interaction lifecycle: create →
// pending (the HELD TURN — Ote's D1) → answered/skipped/timeout → resume, plus validation,
// the EventBus emission, and the frontend push. Delegates ALL persistence to the Store.
//
// THE PAUSE MECHANIC (D1, held turn): the agent loop awaits `ask()` like any slow tool —
// the SSE response stream stays open, and an in-process waiter (promise + timer) resolves
// when the answer route fires or the timeout lever expires. The pause itself is
// CONVERSATIONAL STATE (tool_use → tool_result); durable cross-restart resume is the
// documented v2 (FEATURE_HUMANINTERACTION_RFC Part B1-b).
//
// Normalization/formatting are LOCAL copies of @ote/human-interaction's pure fns
// (the backend imports NO component package — same rule as todo's reconcile).

import { runtime } from '../components/runtime.js'
import { notifyChatEvent } from '../chat/notify.js'
import { getSetting } from '../settings/index.js'
import { createInteractionStore } from './store.js'

const MAX_QUESTIONS = 4
const MAX_OPTIONS = 4

/** Normalize the model's ask_user spec (pure — the portable Feature ships the twin copy). */
export function normalizeQuestions(incoming) {
  const list = Array.isArray(incoming) ? incoming : []
  const questions = []
  for (const raw of list) {
    if (questions.length >= MAX_QUESTIONS) break
    const question = String(raw?.question ?? '').trim().slice(0, 500)
    if (!question) continue
    const header = String(raw?.header ?? '').trim().slice(0, 24) || 'Question'
    let options = Array.isArray(raw?.options)
      ? raw.options
        .map((o) => ({
          label: String(o?.label ?? '').trim().slice(0, 80),
          description: o?.description != null ? String(o.description).trim().slice(0, 200) : null,
        }))
        .filter((o) => o.label)
        .slice(0, MAX_OPTIONS)
      : []
    const seen = new Set()
    options = options.filter((o) => (seen.has(o.label) ? false : (seen.add(o.label), true)))
    // 0–1 options = a free-text question, and this is DELIBERATE (see interaction-normalize.test.mjs):
    // a lone option is not a choice, and rendering a single "Yes" button with no way to decline would be a
    // leading, quietly coercive card. I briefly "fixed" this to keep a single option — the existing test
    // caught it, correctly. When a model sends one option for a yes/no it is the MODEL that
    // under-specified (measured live: `options:[{label:'Yes'}]`, and the user got a bare text box); the
    // repair belongs in the guidance that asks for both, not in silently rendering half a choice.
    const hasChoices = options.length >= 2
    questions.push({
      question,
      header,
      options: hasChoices ? options : [],
      multiSelect: hasChoices && raw?.multiSelect === true,
      allowCustom: raw?.allowCustom !== false,
    })
  }
  if (!questions.length) return { error: 'ask_user needs at least one question with text' }
  return { questions }
}

/** Format the human's response into the plain text the model reads (pure, twin copy). */
export function formatAnswers(questions, response, status = 'answered') {
  // NOT ANSWERING IS NOT PERMISSION. These two lines used to end with a blanket "proceed with your best
  // judgment — pick the most sensible option yourself", which is right for a preference ("which premise?")
  // and badly wrong for a permission ("shall I rename your account?"). Measured live 2026-07-31: Ote hit
  // Skip on a rename confirmation, the model read this text, replied "is clear enough! Let me apply that
  // change" and tried to rename anyway — then, refused by the consent gate, asked again, so he had to skip
  // TWICE. The carve-out has to live here, because this string is the only thing the model sees.
  const NO_ANSWER_TAIL = ' If you were asking PERMISSION to do something, treat this as "no": do not do it,'
    + ' say plainly that you have left it unchanged, and do not ask again this turn.'
    + ' Otherwise use your best judgment on what to write, pick the most sensible option yourself, and note the assumption in your reply.'
  if (status === 'timeout') {
    return `The user did not answer in time — you have NO answer from them.${NO_ANSWER_TAIL}`
  }
  if (status === 'skipped') {
    return `The user chose to skip — they declined to answer, which is not agreement.${NO_ANSWER_TAIL}`
  }
  if (response?.freeText != null && String(response.freeText).trim()) {
    return `Instead of selecting options, the user replied in free text: "${String(response.freeText).trim()}"`
  }
  const answers = Array.isArray(response?.answers) ? response.answers : []
  const lines = questions.map((q, i) => {
    const a = answers[i] || {}
    const parts = []
    if (Array.isArray(a.selected) && a.selected.length) parts.push(a.selected.join(', '))
    if (a.custom != null && String(a.custom).trim()) parts.push(`"${String(a.custom).trim()}"`)
    return `${q.header}: ${q.question} → ${parts.length ? parts.join(' + ') : '(no answer)'}`
  })
  return `The user answered:\n${lines.join('\n')}`
}

// ── the in-process waiters (D1: the held turns) ─────────────────────────────
// interactionId → { resolve(status), timer, conversationId }. One waiter per pending
// interaction; the answer/skip routes resolve it, the timer expires it. Server restart
// mid-wait = the row stays 'pending' but the turn is gone — boot sweeps those to
// 'cancelled' so renderers never show a zombie card.
const waiters = new Map()

const settleWaiter = (interactionId, status) => {
  const w = waiters.get(interactionId)
  if (!w) return false
  waiters.delete(interactionId)
  clearTimeout(w.timer)
  w.resolve(status)
  return true
}

/** Does this conversation have a LIVE held turn waiting on a human right now? */
export const hasLiveWaiter = (conversationId) => {
  for (const w of waiters.values()) if (w.conversationId === conversationId) return true
  return false
}

// Protocol emission — bus (renderers/diagnostics) + the owner's open pages (SSE), both
// best-effort: the interaction must never die on its own announcements.
function emitProtocol(event, payload, userId, pushType, pushExtra = {}) {
  try { runtime.events?.emit?.(event, payload) } catch { /* bus is diagnostics */ }
  notifyChatEvent(userId ?? null, { type: pushType, ...pushExtra })
}

/**
 * THE ask operation (the ask_user tool funnels here): normalize → persist a pending
 * session → broadcast the protocol → HOLD until answered/skipped/timeout → return the
 * plain-text result the model reads. Resolves, never rejects — a tool error is a result.
 */
export async function askInteraction(fastify, user, conversationId, spec) {
  const store = createInteractionStore(fastify.db)
  const norm = normalizeQuestions(spec?.questions)
  if (norm.error) return { error: norm.error }

  const timeoutS = getSetting(fastify.config, 'chat.interactionTimeoutSeconds') || 300
  const session = await store.create({
    conversationId,
    userId: user?.id ?? null,
    questions: norm.questions,
    expiresAt: new Date(Date.now() + timeoutS * 1000),
  })

  emitProtocol('interaction.created', { conversationId, interactionId: session.id, questions: norm.questions.length },
    user?.id, 'interaction-created', { conversationId, interactionId: session.id })
  // the ATTENTION half of the protocol (Ote's rule: the user must not miss a waiting
  // question) — frontends answer this with whatever they support: notification, title
  // flash, vibration, sound. Distinct from `created` (state) on purpose.
  emitProtocol('interaction.waiting', { conversationId, interactionId: session.id },
    user?.id, 'interaction-waiting', { conversationId, interactionId: session.id })

  // ── the pause (held turn) ──
  const status = await new Promise((resolve) => {
    const timer = setTimeout(async () => {
      waiters.delete(session.id)
      // claim guards the race where an answer lands the same instant the timer fires
      if (await store.claim(session.id, { status: 'timeout' })) {
        emitProtocol('interaction.timeout', { conversationId, interactionId: session.id },
          user?.id, 'interaction-completed', { conversationId, interactionId: session.id, outcome: 'timeout' })
        resolve('timeout')
      } else {
        resolve('answered') // someone claimed it as we expired — their result stands
      }
    }, timeoutS * 1000)
    timer.unref?.() // never hold the process open for a question nobody will answer
    waiters.set(session.id, { resolve, timer, conversationId })
  })

  const resolved = await store.findById(session.id)
  return {
    result: formatAnswers(norm.questions, resolved?.response, status === 'timeout' ? 'timeout' : resolved?.status || status),
    interactionId: session.id,
    status: resolved?.status || status,
  }
}

/** The pending interaction for a conversation (the read route — renderers re-fetch on push). */
export async function getPendingInteraction(fastify, conversationId) {
  const pending = await createInteractionStore(fastify.db).findPending(conversationId)
  // a pending ROW without a live waiter is a zombie (server restarted mid-hold) — report
  // nothing so no renderer draws a card that can never resolve
  if (pending && !waiters.has(pending.id)) return { interaction: null }
  return { interaction: pending }
}

/**
 * Resolve a pending interaction with the human's response — THE one answer path (the
 * answer route, the skip route, and the free-text-resolves flow all land here).
 * body: { answers?: [{selected, custom}], freeText?: string, skip?: boolean }
 * First answer wins (atomic claim); losers get a 409-shaped error.
 */
export async function answerInteraction(fastify, user, conversationId, interactionId, body = {}) {
  const store = createInteractionStore(fastify.db)
  const session = await store.findById(interactionId)
  if (!session || session.conversationId !== conversationId) {
    return { error: { status: 404, code: 'not_found', message: 'No such interaction in this conversation.' } }
  }
  if (session.status !== 'pending') {
    return { error: { status: 409, code: 'already_resolved', message: 'This question was already answered.' } }
  }

  const skip = body.skip === true
  const freeText = body.freeText != null && String(body.freeText).trim() ? String(body.freeText).trim().slice(0, 4000) : null
  let response = null
  if (!skip) {
    if (freeText) {
      response = { freeText }
    } else {
      // validate selections against the stored questions (labels must exist; single-select
      // takes one) — normalize rather than reject where a fix is obvious
      const answers = Array.isArray(body.answers) ? body.answers : []
      response = {
        answers: session.questions.map((q, i) => {
          const a = answers[i] || {}
          const labels = new Set((q.options || []).map((o) => o.label))
          let selected = Array.isArray(a.selected) ? a.selected.filter((s) => labels.has(s)) : []
          if (!q.multiSelect && selected.length > 1) selected = selected.slice(0, 1)
          const custom = q.allowCustom && a.custom != null && String(a.custom).trim()
            ? String(a.custom).trim().slice(0, 2000) : null
          return { selected, custom }
        }),
      }
      const empty = response.answers.every((a) => !a.selected.length && !a.custom)
      if (empty) return { error: { status: 400, code: 'empty_answer', message: 'Pick an option, type an answer, or skip.' } }
    }
  }

  const status = skip ? 'skipped' : 'answered'
  if (!(await store.claim(interactionId, { status, response }))) {
    return { error: { status: 409, code: 'already_resolved', message: 'This question was already answered.' } }
  }
  settleWaiter(interactionId, status) // wake the held turn (absent after a restart — row still resolves)
  emitProtocol('interaction.completed', { conversationId, interactionId, outcome: status },
    session.userId, 'interaction-completed', { conversationId, interactionId, outcome: status })
  return { ok: true, status }
}

/** Boot sweep: rows stuck 'pending' from a previous process (restart mid-hold) → cancelled. */
export async function sweepZombieInteractions(fastify) {
  try {
    const [n] = await fastify.db.txn_interaction_sessions.update(
      { status: 'cancelled' },
      { where: { status: 'pending' } },
    )
    if (n) fastify.log?.info?.(`[interaction] cancelled ${n} orphaned pending interaction${n === 1 ? '' : 's'} from a previous run`)
  } catch (e) {
    fastify.log?.warn?.(`[interaction] zombie sweep failed: ${e.message}`)
  }
}

/**
 * Per-request service the ask_user tool binds to (requireService(ctx,'interaction')).
 * Late-bound via registerHostService — same pattern as `todo`/`schedules`. The headless
 * gate lives here AND at tool-definition time (belt + suspenders): a run with no human
 * gets an honest nudge to decide alone, never a hang.
 */
export function createInteractionService({ fastify, user, conversationId, interactive }) {
  return {
    async ask(spec = {}) {
      if (!interactive) {
        return { error: 'no human is available in this run — decide with your best judgment and note the assumption in your reply' }
      }
      if (!conversationId) {
        return { error: 'ask_user needs a conversation — there is nowhere to show the question' }
      }
      const out = await askInteraction(fastify, user, conversationId, spec)
      if (out.error) return { error: out.error }
      return out.result
    },
  }
}
