// Schedules HOST SERVICE — business operations for the Schedules Feature (canon layering:
// Feature → Host Service → Store → DB). Owns validation, the action performers, the executor
// bookkeeping (status/duration/failure-counting/auto-disable), the runtime-trigger sync, the
// EventBus/push side-effects and the model-facing service — delegates ALL persistence to the
// Store. The SDK's TriggerService owns the clocks (Trigger → Task → Executor) and
// @ote/scheduler's tools are the model's hands; THIS is the operations layer they funnel through.
//
// Persistence contract: the Store returns PLAIN job records (snake_case columns). Every read
// site here (jobView, syncJobTrigger, the performers) reads those column names directly, so a
// plain record is a drop-in for the old Sequelize instance; only writes route through store.*.

import crypto from 'node:crypto'
import { runtime, listSkills, buildToolContext, runTool } from '../components/runtime.js'
import { internalCallHeaders } from '../auth/index.js'
import { ownerIdOf } from '../auth/owner.js'
import { isRootConnectedUser } from '../auth/root-identity.js'
import { loadRootPrefs } from '../routes/v1/me-prefs.route.js'
import { getSetting } from '../settings/index.js'
import { notifyChatEvent } from '../chat/notify.js'
import { clearTodo } from '../todo/index.js'
import { isValidTz, defaultTriggerTz } from './tz-default.js'
import { parseEvery, parseCron, cronNext } from '@ote/components-sdk'
import { createTriggerJobsStore } from './store.js'

export const ACTION_TYPES = ['skill-turn', 'tool', 'http'] // polymorphic envelope — additive
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']
const MAX_CONSECUTIVE_FAILURES = 3
const RUN_HISTORY_KEEP = 20
export const jobTriggerId = (id) => `job:${id}`

// Destination sentinel: "create this schedule's own chat and reuse it" (Ote's idea).
// Resolved at WRITE time into a real conversation — named after the schedule and seeded
// with a note explaining what lands there — so the stored action always holds a plain id
// and the executor needs no special case.
export const DEDICATED_DESTINATION = '@dedicated'

/**
 * WHO may schedule: root always; users when one of their role tiers is in root's
 * chat.scheduleRoles lever (default admin/developer/power — the old select_model set).
 */
export function userMaySchedule(config, user) {
  if (user?.isRoot === true) return true
  const allowed = getSetting(config, 'chat.scheduleRoles') || []
  return Array.isArray(user?.roles) && user.roles.some((r) => allowed.includes(r))
}

// Webhook triggers carry a server-minted secret token (the fire URL IS the credential).
// Client-supplied token fields are ignored; a PATCH that stays webhook keeps its token
// (the URL survives edits), switching type away and back mints a fresh one.
export const mintWebhookTrigger = (existing) => ({
  type: 'webhook',
  token: existing?.type === 'webhook' && existing.token ? existing.token : crypto.randomBytes(24).toString('hex'),
})

/**
 * Validate a job's trigger + action against the platform rules. Returns
 * { error: { code, message } } or { ok: true }. `opts.isRoot` gates root-only actions.
 */
export function validateJobSpec(config, { trigger, action }, opts = {}) {
  const minMs = (getSetting(config, 'chat.scheduleMinIntervalMinutes') || 5) * 60_000
  const bad = (message) => ({ error: { code: 'invalid_schedule', message } })

  if (!trigger || typeof trigger !== 'object') return bad('trigger is required')
  if (trigger.type === 'interval') {
    let ms
    try { ms = parseEvery(trigger.every) } catch (e) { return bad(e.message) }
    if (ms < minMs) return bad(`interval too tight — the platform floor is ${minMs / 60_000} minutes between fires`)
  } else if (trigger.type === 'cron') {
    const tz = trigger.tz || 'UTC'
    if (!isValidTz(tz)) return bad(`invalid timezone "${trigger.tz}" — use an IANA zone id like "Asia/Bangkok"`)
    let cron
    try { cron = parseCron(trigger.expr) } catch (e) { return bad(e.message) }
    const n1 = cronNext(cron, tz, Date.now())
    const n2 = n1 != null ? cronNext(cron, tz, n1) : null
    if (n1 == null) return bad('this cron expression never fires (impossible date?)')
    if (n2 != null && n2 - n1 < minMs) return bad(`cron fires too often — the platform floor is ${minMs / 60_000} minutes between fires`)
  } else if (trigger.type === 'at') {
    const t = Date.parse(trigger.at)
    if (!Number.isFinite(t)) return bad(`invalid trigger.at "${trigger.at}" — use an ISO datetime`)
    // allowPastAt: an EDIT that doesn't touch the trigger revalidates the merged spec —
    // a spent one-shot must survive a rename/action tweak (it was valid when created)
    if (t <= Date.now() && opts.allowPastAt !== true) return bad('trigger.at is in the past — one-shot schedules must point at a future time')
  } else if (trigger.type === 'webhook') {
    // external fire — no clock to validate; the ROUTE mints (and owns) the secret token,
    // and the hook endpoint re-checks the interval floor per fire
  } else {
    return bad('trigger.type must be one of interval/cron/at/webhook')
  }

  if (!action || !ACTION_TYPES.includes(action.type)) return bad(`action.type must be one of ${ACTION_TYPES.join('/')}`)
  if (action.type === 'skill-turn') {
    // skillId is NULLABLE: null = a plain instruction turn through the same pipeline
    if (action.skillId != null && (typeof action.skillId !== 'string' || !listSkills(config).some((s) => s.id === action.skillId))) {
      return bad(`unknown skill "${action.skillId}" — pick an installed skill, or none for a plain instruction turn`)
    }
    if (typeof action.prompt !== 'string' || !action.prompt.trim() || action.prompt.length > 4000) {
      return bad('action.prompt is required (1–4000 characters)')
    }
    if (typeof action.model !== 'string' || !/^[a-z0-9][a-z0-9_-]*\/.+$/i.test(action.model)) {
      return bad('action.model must be "<provider>/<model>"')
    }
    // optional per-run tool constraint — NARROWS what the turn may call, never widens
    if (action.tools != null) {
      const installed = new Set(runtime.listTools().map((t) => t.manifest.id))
      if (!Array.isArray(action.tools) || action.tools.length === 0 || action.tools.length > 16
        || new Set(action.tools).size !== action.tools.length
        || action.tools.some((t) => typeof t !== 'string' || !installed.has(t))) {
        return bad('action.tools must be 1–16 distinct installed tool ids (omit for all tools)')
      }
    }
    if (action.conversationId != null && typeof action.conversationId !== 'string') {
      return bad('action.conversationId must be a conversation id or null (null = a new conversation per run)')
    }
  } else if (action.type === 'tool') {
    if (typeof action.toolId !== 'string' || !runtime.listTools().some((t) => t.manifest.id === action.toolId)) {
      return bad(`unknown tool "${action.toolId}" — pick an installed tool`)
    }
    if (action.args != null && (typeof action.args !== 'object' || Array.isArray(action.args))) {
      return bad('action.args must be an object (the tool arguments)')
    }
    let argChars = 0
    try { argChars = JSON.stringify(action.args ?? {}).length } catch { return bad('action.args must be JSON-serializable') }
    if (argChars > 4000) return bad('action.args too large (4000 JSON characters max)')
  } else if (action.type === 'http') {
    if (opts.isRoot !== true) return bad('http actions are root-only — they make outbound requests from the server itself')
    if (typeof action.url !== 'string' || !/^https?:\/\//i.test(action.url) || action.url.length > 2000) {
      return bad('action.url must be an http(s) URL (2000 chars max)')
    }
    if (action.method != null && !HTTP_METHODS.includes(action.method)) {
      return bad(`action.method must be one of ${HTTP_METHODS.join('/')}`)
    }
    if (action.headers != null) {
      const entries = typeof action.headers === 'object' && !Array.isArray(action.headers) ? Object.entries(action.headers) : null
      if (!entries || entries.length > 16 || entries.some(([, v]) => typeof v !== 'string' || v.length > 1000)) {
        return bad('action.headers must be an object of up to 16 string values (1000 chars each)')
      }
    }
    if (action.body != null && (typeof action.body !== 'string' || action.body.length > 16000)) {
      return bad('action.body must be a string (16000 chars max)')
    }
  }
  return { ok: true }
}

// ── Action performers ─────────────────────────────────────────────────────
// Each receives the PLAIN job record (row) + fastify; they only READ the record.

/** The skill-turn performer: a real chat turn AS the owner, through the live pipeline. */
async function runSkillTurn(fastify, row) {
  const action = row.action
  const headers = internalCallHeaders(row.user_id)
  let conversationId = action.conversationId
  if (!conversationId) {
    const res = await fastify.inject({
      method: 'POST',
      url: '/v1/chat/conversations',
      headers,
      payload: {
        // ⏰ marks schedule-born chats apart from hand-started ones in the sidebar (Ote's
        // ask) — deterministic naming, no auto-title model call, so runs stay predictable
        title: `⏰ ${row.name} — ${new Date().toISOString().slice(0, 10)}`,
        model: action.model,
        settings: { toolsEnabled: true, stream: false },
      },
    })
    const body = res.json()
    if (res.statusCode >= 300 || !body?.conversation?.id) {
      throw new Error(`could not create the run conversation (HTTP ${res.statusCode}: ${body?.error?.message || 'unknown'})`)
    }
    conversationId = body.conversation.id
  }
  // The framing prefix is what makes a scheduled REMINDER deliver itself instead of
  // confusing the model (measured failure: "Remind yourself to X" ran as a fresh request
  // and the model started scheduling ANOTHER reminder). It rides visibly in the run's
  // user bubble on purpose — the transcript stays honest about what fired and why.
  const framed = `[Scheduled run "${row.name}" — this previously-scheduled instruction is due NOW. `
    + 'Carry it out and deliver the outcome to the user directly; a reminder instruction means you deliver '
    + 'the reminder message itself. Do not create any new schedule unless the instruction explicitly says to.]'
    + `\n\n${action.prompt}`
  const res = await fastify.inject({
    method: 'POST',
    url: `/v1/chat/conversations/${conversationId}/messages`,
    headers,
    payload: {
      content: framed,
      stream: false,
      ...(action.skillId ? { skillOnce: action.skillId } : {}), // null skill = plain instruction turn
      ...(Array.isArray(action.tools) && action.tools.length ? { allowedTools: action.tools } : {}),
    },
  })
  const body = res.json()
  if (res.statusCode >= 300 || body?.error) {
    throw new Error(`turn failed (HTTP ${res.statusCode}: ${body?.error?.message || 'unknown'})`)
  }
  // A scheduled run is a one-shot task, not the user's ongoing plan — but the model often uses
  // write_todos to track its OWN steps mid-turn (e.g. the daily digest: "search news / check
  // memories / synthesize"). Those are scratch: the model tends to leave the last step "running"
  // and never clear it, so the plan lingers on the home chat's todo rail indefinitely and surfaces
  // when the owner later asks "todo?". The rail is fine DURING the run (live progress); we clear it
  // once the run has delivered. Best-effort — never fail the run over todo cleanup.
  try { await clearTodo(fastify, { id: row.user_id }, conversationId) } catch { /* todo cleanup is best-effort */ }
  return { conversationId, messageId: body?.message?.id ?? null, skill: body?.skill?.id ?? null }
}

/** The tool performer: one component tool, run AS the owner (their memory scope, their zone). */
async function runToolAction(fastify, row) {
  const { toolId, args } = row.action
  // Owner timezone rides in from a FOREIGN subsystem (Users prefs / root prefs), so this read
  // stays in the service rather than the schedules Store, which owns only the schedule's rows.
  let timezone = null
  try {
    timezone = row.user_id
      ? (await fastify.db.mst_users.findByPk(row.user_id, { attributes: ['id', 'chat_prefs'] }))?.chat_prefs?.timezone ?? null
      : (await loadRootPrefs(fastify.db))?.timezone ?? null
  } catch { /* time must never break a run */ }
  // ⚠️ WAS `isRoot: row.user_id == null` — root-ness inferred from the SHAPE of the owner column, the
  // defect this codebase has now hit at eight separate sites. It failed in BOTH directions at once:
  // root owns its schedules by id today, so root's own runs lost root's capabilities; and any row that
  // ended up unowned would have run AS ROOT. The second direction is the one that matters — it turns a
  // missing owner into a privilege grant. Root-ness is a question for root-identity.js, never for a
  // column's nullness, and the owner is now required rather than defaulted.
  const ctx = buildToolContext(fastify, {
    user: {
      id: ownerIdOf({ id: row.user_id }, 'a scheduled tool run'),
      isRoot: isRootConnectedUser(fastify.config, row.user_id),
      capabilities: [],
    },
  }, { timezone })
  const result = await runTool(toolId, args || {}, ctx)
  // runTool reports failures as { error } instead of throwing — surface them as run failures
  if (result && typeof result === 'object' && result.error) {
    throw new Error(`tool ${toolId}: ${String(result.error).slice(0, 500)}`)
  }
  return { summary: `tool ${toolId} ok` }
}

/** The http performer (root-only at validation): one outbound request, timed + capped. */
async function runHttpAction(_fastify, row) {
  const a = row.action
  const method = a.method ?? 'GET'
  const res = await fetch(a.url, {
    method,
    headers: a.headers ?? undefined,
    body: method === 'GET' || method === 'HEAD' ? undefined : a.body ?? undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const preview = (await res.text()).slice(0, 500)
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${a.url.slice(0, 120)}: ${preview.slice(0, 200)}`)
  return { summary: `http ${res.status}`, status: res.status }
}

export const PERFORMERS = { 'skill-turn': runSkillTurn, tool: runToolAction, http: runHttpAction }

// Run HISTORY: one row per fire (ok or error), pruned so a busy job keeps only its recent
// tail. Best-effort — a history-write hiccup never fails the run. The job row's last_* stays
// the quick view; this is the trend view. Persistence lives in the Store; this is the policy.
async function recordRun(store, log, jobId, { startedAt, status, durationMs, summary = null, error = null }) {
  try {
    await store.createRun({ jobId, startedAt, status, durationMs, summary, error })
    await store.pruneRuns(jobId, RUN_HISTORY_KEEP)
  } catch (e) {
    log?.warn?.(`[schedules] run history write failed: ${e.message}`)
  }
}

/** (Re-)register one job's trigger in the runtime (unregisters first; disabled rows just unregister). */
export function syncJobTrigger(fastify, row) {
  const store = createTriggerJobsStore(fastify.db)
  const id = jobTriggerId(row.id)
  if (runtime.triggers.get(id)) runtime.triggers.unregister(id)
  if (!row.enabled) {
    store.update(row.id, { next_run_at: null }).catch(() => {})
    row.next_run_at = null // mirror in the plain record for an immediate jobView() fallback
    return null
  }
  const view = runtime.triggers.register({
    id,
    name: row.name,
    trigger: row.trigger,
    action: { ...row.action, type: row.action?.type ?? 'skill-turn' },
    catchUp: row.catch_up === true,
    lastRunAt: row.last_run_at ? new Date(row.last_run_at).getTime() : null,
    meta: { jobId: row.id, userId: row.user_id },
  })
  const nextRunAt = view.nextRunAt ? new Date(view.nextRunAt) : null
  store.update(row.id, { next_run_at: nextRunAt }).catch(() => {})
  row.next_run_at = nextRunAt // mirror in the plain record (jobView prefers the live trigger)
  return view
}

/** Live view of a row for API responses (merges the runtime trigger's clock). */
export function jobView(row) {
  const t = runtime.triggers.get(jobTriggerId(row.id))
  return {
    id: row.id,
    name: row.name,
    trigger: row.trigger,
    // webhook jobs are fired from outside: hand the owner their fire URL (path only —
    // the frontend prefixes its own origin). The token lives in the trigger itself.
    hookPath: row.trigger?.type === 'webhook' && row.trigger.token ? `/v1/hooks/${row.id}/${row.trigger.token}` : null,
    action: row.action,
    enabled: row.enabled,
    catchUp: row.catch_up,
    lastRunAt: row.last_run_at,
    lastStatus: row.last_status,
    lastError: row.last_error,
    lastDurationMs: row.last_duration_ms,
    consecutiveFailures: row.consecutive_failures,
    disabledReason: row.disabled_reason ?? null, // 'manual' | 'consecutive-failures' | 'boot-error' | 'target-deleted' (null while enabled)
    nextRunAt: t?.nextRunAt ? new Date(t.nextRunAt).toISOString() : (row.next_run_at ? new Date(row.next_run_at).toISOString() : null),
    running: t?.running === true,
    createdAt: row.created_at,
  }
}

async function resolveDedicatedDestination(fastify, user, action, name) {
  const store = createTriggerJobsStore(fastify.db)
  // composition (the ⏰ marker + the standing-instruction seed) is the service's call;
  // the Store just persists the conversation + seed message and hands back the new id.
  action.conversationId = await store.createSeededConversation({
    userId: ownerIdOf(user, 'a schedule conversation'),
    title: `⏰ ${name}`, // the schedule-chat marker, same as per-run conversations
    model: action.model,
    seedRole: 'assistant',
    seedContent: `This chat is the home of the schedule **“${name}”** — every run lands here, so its history stays in one place.\n\nStanding instruction: ${action.prompt}`,
    seedProvider: String(action.model).split('/')[0] || null,
  })
}

/**
 * Create a scheduled job for a user — THE one creation path (the API route and the
 * create_schedule tool both call it, so the rails can never diverge). Returns
 * { schedule } or { error: { status, code, message } }.
 * @param {*} fastify
 * @param {{ id?: string|null, isRoot?: boolean, roles?: string[] }} user  the OWNER
 * @param {{ name: string, trigger: object, action: object, catchUp?: boolean }} body
 */
export async function createJob(fastify, user, body) {
  const store = createTriggerJobsStore(fastify.db)
  const err = (status, code, message) => ({ error: { status, code, message } })
  if ((getSetting(fastify.config, 'chat.maxSchedulesPerUser') || 0) <= 0) {
    return err(403, 'schedules_disabled', 'Scheduling is disabled on this platform.')
  }
  if (!userMaySchedule(fastify.config, user)) {
    return err(403, 'schedules_locked', 'Your role tier is not allowed to create schedules.')
  }
  const max = getSetting(fastify.config, 'chat.maxSchedulesPerUser')
  const count = await store.count(user?.id)
  if (count >= max) {
    return err(400, 'schedule_cap', `You already have ${count} schedules — the platform cap is ${max}.`)
  }
  if (typeof body?.name !== 'string' || !body.name.trim() || body.name.length > 80) {
    return err(400, 'invalid_schedule', 'name is required (1–80 characters)')
  }
  // Default action type is skill-turn — callers may omit it; normalize BEFORE validating.
  const action = { ...body.action, type: body.action?.type ?? 'skill-turn' }
  if (action.type === 'skill-turn') {
    action.skillId = action.skillId ?? null
    action.conversationId = action.conversationId ?? null
  }
  const trigger = body.trigger?.type === 'webhook' ? mintWebhookTrigger(null) : body.trigger
  const spec = validateJobSpec(fastify.config, { trigger, action }, { isRoot: user?.isRoot === true })
  if (spec.error) return err(400, spec.error.code, spec.error.message)
  if (action.type === 'skill-turn' && action.conversationId === DEDICATED_DESTINATION) {
    await resolveDedicatedDestination(fastify, user, action, body.name.trim())
  } else if (action.type === 'skill-turn' && action.conversationId != null) {
    if (!(await store.ownsConversation(action.conversationId, user?.id))) {
      return err(400, 'conversation_not_found', 'No such conversation of yours — pick one you own, or null for a new conversation per run.')
    }
  }
  const row = await store.create({
    // `store.create` passes fields straight through to Sequelize, so the refusal has to happen here —
    // a schedule with no owner would run on a timer forever with nobody able to see or stop it.
    user_id: ownerIdOf(user, 'a schedule'),
    name: body.name.trim(),
    trigger,
    action,
    enabled: true,
    catch_up: body.catchUp === true,
  })
  syncJobTrigger(fastify, row)
  return { schedule: jobView(row) }
}

/**
 * Update a scheduled job — THE one edit path (the PATCH route and the update_schedule
 * tool both call it). Same shape as createJob: { schedule } | { error: { status, code, message } }.
 * Semantics: re-enabling resets the failure counter; a manual disable records its reason;
 * an edit that doesn't TOUCH the trigger tolerates a spent one-shot (allowPastAt).
 */
export async function updateJob(fastify, user, id, b = {}) {
  const store = createTriggerJobsStore(fastify.db)
  const err = (status, code, message) => ({ error: { status, code, message } })
  if (!userMaySchedule(fastify.config, user)) {
    return err(403, 'schedules_locked', 'Your role tier is not allowed to create schedules.')
  }
  if ((getSetting(fastify.config, 'chat.maxSchedulesPerUser') || 0) <= 0) {
    return err(403, 'schedules_disabled', 'Scheduling is disabled on this platform.')
  }
  const row = await store.findOwned(id, user?.id)
  if (!row) return err(404, 'not_found', 'No such schedule.')
  if (b.name !== undefined && (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 80)) {
    return err(400, 'invalid_schedule', 'name must be 1–80 characters')
  }
  const nextTrigger = b.trigger !== undefined
    ? (b.trigger?.type === 'webhook' ? mintWebhookTrigger(row.trigger) : b.trigger)
    : row.trigger
  const nextAction = b.action ? { ...b.action, type: b.action.type ?? 'skill-turn' } : row.action
  if (b.trigger !== undefined || b.action !== undefined) {
    const spec = validateJobSpec(fastify.config, { trigger: nextTrigger, action: nextAction }, {
      isRoot: user?.isRoot === true,
      allowPastAt: b.trigger === undefined, // untouched trigger — a spent one-shot may be renamed/retargeted
    })
    if (spec.error) return err(400, spec.error.code, spec.error.message)
    if (nextAction.type === 'skill-turn' && nextAction.conversationId === DEDICATED_DESTINATION) {
      // picking "dedicated" on an EDIT mints a fresh home chat for the schedule
      await resolveDedicatedDestination(fastify, user, nextAction, (b.name ?? row.name).trim())
    } else if (nextAction.type === 'skill-turn' && nextAction.conversationId != null) {
      if (!(await store.ownsConversation(nextAction.conversationId, user?.id))) {
        return err(400, 'conversation_not_found', 'No such conversation of yours — pick one you own, or null for a new conversation per run.')
      }
    }
  }
  // Re-enabling refuses if the schedule's destination chat was deleted (Ote): a schedule must
  // never re-arm pointing at a gone conversation. The caller must first pick a NEW destination
  // (pass action.conversationId — an owned chat, 'new' for a fresh chat per run, or the
  // '@dedicated' sentinel). A same-call new destination is already resolved/validated above,
  // so this only bites a plain enable whose stored target is missing.
  if (b.enabled === true) {
    const t = nextAction
    if ((t?.type ?? 'skill-turn') === 'skill-turn'
      && t.conversationId != null && t.conversationId !== DEDICATED_DESTINATION
      && !(await store.ownsConversation(t.conversationId, user?.id))) {
      return err(400, 'target_missing', 'The chat this schedule ran in was deleted — pick a new destination (an existing chat, a fresh chat per run, or a dedicated chat) before re-enabling.')
    }
  }
  const patch = {
    ...(b.name !== undefined ? { name: b.name.trim() } : {}),
    trigger: nextTrigger,
    action: nextAction,
    ...(b.catchUp !== undefined ? { catch_up: b.catchUp === true } : {}),
    // disabled_reason narrates WHY it's off: 'manual' here; the executor writes
    // 'consecutive-failures', boot writes 'boot-error'; enabling clears it
    ...(b.enabled !== undefined ? { enabled: b.enabled === true, disabled_reason: b.enabled === true ? null : 'manual' } : {}),
    // re-enabling is a fresh start: the failure counter resets so one bad spell
    // (provider down overnight) doesn't permanently poison the job
    ...(b.enabled === true ? { consecutive_failures: 0, last_error: null } : {}),
  }
  await store.update(id, patch)
  Object.assign(row, patch) // mirror the write into the plain record for sync + view below
  syncJobTrigger(fastify, row)
  return { schedule: jobView(row) }
}

/**
 * Renew a webhook job's fire URL — mints a FRESH token; the old URL dies immediately
 * (the leaked-URL remedy). Everything else about the job is untouched.
 */
export async function rotateHook(fastify, user, id) {
  const store = createTriggerJobsStore(fastify.db)
  const row = await store.findOwned(id, user?.id)
  if (!row) return { error: { status: 404, code: 'not_found', message: 'No such schedule.' } }
  if (row.trigger?.type !== 'webhook') {
    return { error: { status: 400, code: 'not_webhook', message: 'Only webhook schedules have a fire URL to renew.' } }
  }
  const trigger = mintWebhookTrigger(null) // null = never reuse the old token
  await store.update(id, { trigger })
  Object.assign(row, { trigger })
  syncJobTrigger(fastify, row)
  return { schedule: jobView(row) }
}

/**
 * Schedules (owned by the user) whose skill-turn destination IS this conversation — i.e. runs
 * land in this exact chat (a picked chat or a '@dedicated' home chat, resolved to its id).
 * Used to warn before deleting a chat, and to deactivate them when it IS deleted.
 */
export async function schedulesTargeting(fastify, conversationId, userId) {
  const store = createTriggerJobsStore(fastify.db)
  const rows = await store.findAllOwned(userId)
  return rows
    .filter((r) => (r.action?.type ?? 'skill-turn') === 'skill-turn' && r.action?.conversationId === conversationId)
    .map((r) => ({ id: r.id, name: r.name, enabled: r.enabled }))
}

/**
 * A conversation is being deleted — deactivate every ENABLED schedule that runs into it
 * (disable + unregister, reason 'target-deleted') so nothing fires into a void. Re-enabling
 * is then gated by updateJob until the owner picks a new destination. Returns [{id,name}].
 */
export async function deactivateSchedulesForConversation(fastify, conversationId, userId) {
  const store = createTriggerJobsStore(fastify.db)
  const targeting = await schedulesTargeting(fastify, conversationId, userId)
  const disabled = []
  for (const t of targeting) {
    if (!t.enabled) continue // already off; the re-enable guard still protects it
    try { runtime.triggers.unregister(jobTriggerId(t.id)) } catch { /* not registered */ }
    await store.update(t.id, { enabled: false, disabled_reason: 'target-deleted', next_run_at: null }).catch(() => {})
    disabled.push({ id: t.id, name: t.name })
  }
  return disabled
}

/** Delete a scheduled job (owner-scoped; the live trigger unregisters). { ok } | { error }. */
export async function deleteJob(fastify, user, id) {
  const store = createTriggerJobsStore(fastify.db)
  const row = await store.findOwned(id, user?.id)
  if (!row) return { error: { status: 404, code: 'not_found', message: 'No such schedule.' } }
  runtime.triggers.unregister(jobTriggerId(row.id))
  const name = row.name
  await store.destroy(row.id)
  return { ok: true, id, name }
}

/**
 * Host implementation of the `schedules` service that @ote/scheduler's tools consume
 * (the create/list/update/delete_schedule tools — the "/scheduler" skill's hands). Bound
 * to ONE user per request; every mutation rides the exact same createJob/updateJob/
 * deleteJob paths as the API routes, so the model gets the same tiers/caps/floors as the
 * panel. Tool results are the truth the model reports back — errors return as text.
 */
export function createScheduleService({ fastify, user, currentModel = null, currentConversationId = null, currentTz = null }) {
  const store = createTriggerJobsStore(fastify.db)
  return {
    async create(spec = {}) {
      const action = {
        type: 'skill-turn',
        skillId: spec.skillId ?? null,
        prompt: spec.prompt,
        model: spec.model || currentModel || getSetting(fastify.config, 'chat.defaultModel'),
        // Default destination = the conversation the user ASKED in (Ote's call) — the
        // reminder lands where it was requested; 'new' = a fresh conversation per run.
        conversationId: spec.conversationId === 'new' ? null : (spec.conversationId ?? currentConversationId ?? null),
        ...(Array.isArray(spec.tools) && spec.tools.length ? { tools: spec.tools } : {}),
      }
      const out = await createJob(fastify, user, {
        // a cron trigger the model sent without tz means the USER's wall clock, not UTC
        name: spec.name, trigger: defaultTriggerTz(spec.trigger, currentTz), action, catchUp: spec.catchUp === true,
      })
      if (out.error) return { error: out.error.message }
      const s = out.schedule
      return {
        created: true,
        id: s.id,
        name: s.name,
        trigger: s.trigger,
        nextRunAt: s.nextRunAt, // UTC ISO — present it to the user in THEIR zone
        destination: s.action.conversationId ? (s.action.conversationId === currentConversationId ? 'this conversation' : 'an existing conversation') : 'a new conversation per run',
        ...(s.hookPath ? { firePath: s.hookPath, note: 'webhook schedule — POST this path on the site origin to fire it' } : {}),
      }
    },
    async update(spec = {}) {
      if (!spec.id) return { error: 'id is required — find it with list_schedules' }
      const row = await store.findOwned(spec.id, user?.id)
      if (!row) return { error: 'no such schedule of yours — call list_schedules to see ids' }
      const b = {}
      if (spec.name !== undefined) b.name = spec.name
      // no tz on a replacement cron = "same zone, new time" — inherit before user-tz fallback
      if (spec.trigger !== undefined) b.trigger = defaultTriggerTz(spec.trigger, currentTz, row.trigger)
      if (spec.catchUp !== undefined) b.catchUp = spec.catchUp === true
      if (spec.enabled !== undefined) b.enabled = spec.enabled === true
      // flat instruction-field edits merge over the existing action (skill-turn rows only —
      // tool/http jobs are panel territory)
      if (spec.prompt !== undefined || spec.skillId !== undefined || spec.model !== undefined
        || spec.tools !== undefined || spec.conversationId !== undefined) {
        if ((row.action?.type ?? 'skill-turn') !== 'skill-turn') {
          return { error: 'only instruction schedules can be edited here — tool/http jobs are edited in Options → Schedules' }
        }
        b.action = {
          ...row.action,
          ...(spec.prompt !== undefined ? { prompt: spec.prompt } : {}),
          ...(spec.skillId !== undefined ? { skillId: spec.skillId } : {}),
          ...(spec.model !== undefined ? { model: spec.model } : {}),
          ...(spec.tools !== undefined ? { tools: spec.tools } : {}),
          ...(spec.conversationId !== undefined ? { conversationId: spec.conversationId === 'new' ? null : spec.conversationId } : {}),
        }
      }
      const out = await updateJob(fastify, user, spec.id, b)
      if (out.error) return { error: out.error.message }
      const s = out.schedule
      return { updated: true, id: s.id, name: s.name, trigger: s.trigger, nextRunAt: s.nextRunAt, enabled: s.enabled }
    },
    async remove(id) {
      if (!id) return { error: 'id is required — find it with list_schedules' }
      const out = await deleteJob(fastify, user, id)
      if (out.error) return { error: out.error.message === 'No such schedule.' ? 'no such schedule of yours — call list_schedules to see ids' : out.error.message }
      return { deleted: true, id: out.id, name: out.name }
    },
    async list() {
      const rows = await store.findAllOwned(user?.id)
      return {
        schedules: rows.map((r) => {
          const v = jobView(r)
          return { id: v.id, name: v.name, trigger: v.trigger, enabled: v.enabled, nextRunAt: v.nextRunAt, lastStatus: v.lastStatus }
        }),
        canSchedule: userMaySchedule(fastify.config, user),
      }
    },
  }
}

/**
 * The action executor — shared row bookkeeping around every performer: live "run-started"
 * push, status/duration/failure-count writes, auto-disable after MAX_CONSECUTIVE_FAILURES,
 * run-history append, unread marker + "conversations-changed" push. Returned as a closure
 * over (fastify, perform) so the wiring layer can register one per action type.
 */
export const jobExecutor = (fastify, perform) => async (_action, view) => {
  const store = createTriggerJobsStore(fastify.db)
  const jobId = view.meta?.jobId
  const row = jobId ? await store.findById(jobId) : null
  if (!row || !row.enabled) throw new Error('scheduled job is missing or disabled')
  const t0 = Date.now()
  // When the run targets a KNOWN conversation (this/dedicated destination), tell the
  // owner's open pages it started NOW — a watched thread then shows a live "generating"
  // placeholder instead of a silent gap until the whole turn lands at once. (Per-run-new
  // conversations have no id yet; their sidebar pop-in at completion already covers them.)
  const liveDest = row.action?.type === 'skill-turn' && typeof row.action.conversationId === 'string'
    ? row.action.conversationId : null
  if (liveDest) notifyChatEvent(row.user_id, { type: 'run-started', conversationId: liveDest, name: row.name })
  try {
    const out = await perform(fastify, row)
    const next = runtime.triggers.get(view.id)?.nextRunAt
    await store.update(row.id, {
      last_run_at: new Date(t0),
      last_status: 'ok',
      last_error: null,
      last_duration_ms: Date.now() - t0,
      consecutive_failures: 0,
      next_run_at: next ? new Date(next) : null,
    })
    await recordRun(store, fastify.log, row.id, {
      startedAt: t0, status: 'ok', durationMs: Date.now() - t0,
      summary: out?.conversationId ? `conversation ${out.conversationId}` : out?.summary ?? null,
    })
    if (out?.conversationId) {
      // proactive content nobody has seen — light the sidebar marker; opening clears it
      await store.markConversationUnread(out.conversationId).catch(() => {})
      // ...and tell the owner's OPEN pages right now (no manual refresh needed)
      notifyChatEvent(row.user_id, { type: 'conversations-changed', conversationId: out.conversationId })
    }
    fastify.log?.info?.(`[schedules] "${row.name}" ran ok (${Date.now() - t0}ms)${out?.conversationId ? ` → conversation ${out.conversationId}` : ''}`)
    return out
  } catch (e) {
    const fails = (row.consecutive_failures || 0) + 1
    const disable = fails >= MAX_CONSECUTIVE_FAILURES
    const next = disable ? null : runtime.triggers.get(view.id)?.nextRunAt
    await store.update(row.id, {
      last_run_at: new Date(t0),
      last_status: 'error',
      last_error: String(e?.message || e).slice(0, 2000),
      last_duration_ms: Date.now() - t0,
      consecutive_failures: fails,
      ...(disable ? { enabled: false, disabled_reason: 'consecutive-failures' } : {}),
      next_run_at: next ? new Date(next) : null,
    })
    await recordRun(store, fastify.log, row.id, { startedAt: t0, status: 'error', durationMs: Date.now() - t0, error: e?.message || e })
    if (disable) {
      runtime.triggers.setEnabled(view.id, false)
      fastify.log?.warn?.(`[schedules] "${row.name}" auto-disabled after ${fails} consecutive failures: ${e?.message}`)
    }
    // clear the live placeholder — a failed run emits no conversations-changed, so without
    // this the watched thread's "generating" indicator would hang forever
    if (liveDest) notifyChatEvent(row.user_id, { type: 'run-ended', conversationId: liveDest })
    throw e
  }
}
