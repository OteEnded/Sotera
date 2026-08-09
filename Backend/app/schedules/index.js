// Scheduled jobs — the platform half of Milestone ② (proactive personas), assembled per the
// canon layering law: Feature → Host Service → Store → DB.
//   • Feature       the SDK's TriggerService (clocks: Trigger → Task → Executor) +
//                   @ote/scheduler's tools (the model's create/list/update/delete hands)
//   • Host Service  ./service.js  — validation, performers, executor bookkeeping, CRUD, push
//   • Store         ./store.js    — raw TriggerJobs/TriggerJobRuns + dedicated-chat rows
// This index is just WIRING + the public entry: it re-exports the operations the routes call
// and, at boot, registers the host service, the action executors, and loads surviving jobs.
//
// The platform action types (owned by the service): `skill-turn` (a REAL chat turn run AS the
// owner via fastify.inject + the boot-minted internal secret — same pipeline as a typed turn),
// `tool` (one component tool run AS the owner), `http` (one outbound request, ROOT-ONLY).
// Triggers: interval/cron/at (clocks) + `webhook` (external — POST /v1/hooks/… with a
// server-minted per-job token). Rails: fires bill the OWNER; 3 consecutive failures
// auto-disable; a minimum interval floor is enforced at validation + re-checked on webhook fires.

import { runtime, registerHostService } from '../components/runtime.js'
import { createTriggerJobsStore } from './store.js'
import {
  createScheduleService, PERFORMERS, jobExecutor, syncJobTrigger,
} from './service.js'

// Public surface (routes import from here) — the operations live in the service; this re-exports.
export {
  ACTION_TYPES, mintWebhookTrigger, DEDICATED_DESTINATION, jobTriggerId,
  userMaySchedule, validateJobSpec, syncJobTrigger, jobView,
  createJob, updateJob, rotateHook, deleteJob, createScheduleService,
  schedulesTargeting, deactivateSchedulesForConversation,
} from './service.js'

let initialized = false
let tickTimer = null

/**
 * Boot wiring (idempotent): register the action executors (each performer shares the same
 * row bookkeeping — status, duration, failure counting, auto-disable), load enabled jobs
 * into the TriggerService, and start the 30-second host tick (which also drives component
 * triggers like the heartbeat — one pulse for everything).
 */
export async function initSchedules(fastify) {
  if (initialized) return
  initialized = true

  // the `schedules` service behind create/list/update/delete_schedule — per request, bound
  // to the CALLER (their tier gate, their cap, their jobs); default model = the turn's own,
  // default destination = the conversation the user is asking in
  registerHostService('schedules', ({ fastify: f, user, extras }) =>
    createScheduleService({ fastify: f, user, currentModel: extras?.model ?? null, currentConversationId: extras?.conversationId ?? null, currentTz: extras?.timezone ?? null }))

  // one executor per action type — the same bookkeeping closure around each performer
  for (const [type, perform] of Object.entries(PERFORMERS)) {
    runtime.triggers.registerExecutor(type, jobExecutor(fastify, perform))
  }

  // Load what survived the restart. A row that no longer registers (e.g. its skill was
  // deleted and validation now fails at the SDK layer) is disabled with the reason recorded.
  const store = createTriggerJobsStore(fastify.db)
  const rows = await store.findAllEnabled()
  let loaded = 0
  for (const row of rows) {
    try {
      syncJobTrigger(fastify, row)
      loaded += 1
    } catch (e) {
      fastify.log?.warn?.(`[schedules] could not register "${row.name}" at boot: ${e.message} — disabled`)
      await store.update(row.id, { enabled: false, disabled_reason: 'boot-error', last_status: 'error', last_error: `boot: ${String(e.message).slice(0, 500)}` }).catch(() => {})
    }
  }
  if (rows.length) fastify.log?.info?.(`[schedules] registered ${loaded}/${rows.length} scheduled jobs`)

  fastify.addHook('onReady', async () => {
    tickTimer = setInterval(() => {
      try { runtime.triggers.tick() } catch (e) { fastify.log?.error?.(`[schedules] tick failed: ${e.message}`) }
    }, 30_000)
    tickTimer.unref?.()
  })
  fastify.addHook('onClose', async () => {
    if (tickTimer) clearInterval(tickTimer)
    tickTimer = null
  })
}
