// Schedules STORE — raw persistence for the Schedules Feature (canon layering: Feature →
// Host Service → Store → DB). Owns ONLY the rows: TriggerJobs (the jobs), TriggerJobRuns
// (per-fire history), and the dedicated-destination Conversation/Message seed. No trigger
// registration, no executor bookkeeping, no events — that's the Host Service above it.
//
// Returns PLAIN data (row.get({ plain:true }), keyed by the snake_case columns) so the
// service reads jobs as plain records and NEVER holds a live Sequelize instance. Every read
// site in the service (jobView, syncJobTrigger, the performers) already reads those column
// names off the row, so plain records are drop-in; only the WRITE paths route through here.

//
// ⚠️ EVERY OWNER-SCOPED METHOD HERE REFUSES A MISSING OWNER — it does not fall back to
// `user_id IS NULL`. That fallback is not a safe default: it silently re-scopes the query to whatever
// unowned rows happen to exist, so a caller that lost track of its user reads (or writes) the wrong
// pile instead of failing. The store is the last layer that can still tell, so it tells.
import { ownerIdOf } from '../auth/owner.js'

const plain = (row) => (row ? row.get({ plain: true }) : null)

/** The owner scope for a store query, or a refusal. `userId` here is already an id, not a user object. */
const scope = (userId, what) => ({ user_id: ownerIdOf({ id: userId }, what) })

export function createTriggerJobsStore(db) {
  return {
    // ── TriggerJobs (the jobs) ─────────────────────────────────────────────
    async count(userId) {
      return db.mst_trigger_jobs.count({ where: scope(userId, 'schedules') })
    },

    async create(fields) {
      return plain(await db.mst_trigger_jobs.create(fields))
    },

    // owner-scoped fetch (the API/tool paths — a user only ever sees their own)
    async findOwned(id, userId) {
      return plain(await db.mst_trigger_jobs.findOne({ where: { id, ...scope(userId, 'this schedule') } }))
    },

    // by-id fetch, ignoring owner (the executor — the trigger already vouches for ownership)
    async findById(id) {
      return plain(await db.mst_trigger_jobs.findByPk(id))
    },

    async findAllOwned(userId) {
      const rows = await db.mst_trigger_jobs.findAll({ where: scope(userId, 'schedules'), order: [['created_at', 'ASC']] })
      return rows.map((r) => r.get({ plain: true }))
    },

    async findAllEnabled() {
      const rows = await db.mst_trigger_jobs.findAll({ where: { enabled: true } })
      return rows.map((r) => r.get({ plain: true }))
    },

    // static update — always issues SQL + auto-bumps updated_at (unlike an instance .update,
    // which no-ops when no tracked field changed). Patch keys are the snake_case columns.
    async update(id, patch) {
      await db.mst_trigger_jobs.update(patch, { where: { id } })
    },

    async destroy(id) {
      await db.mst_trigger_jobs.destroy({ where: { id } })
    },

    // ── TriggerJobRuns (per-fire history) ──────────────────────────────────
    async createRun({ jobId, startedAt, status, durationMs, summary = null, error = null }) {
      await db.log_trigger_job_runs.create({
        job_id: jobId,
        started_at: new Date(startedAt),
        status,
        duration_ms: durationMs,
        summary,
        error: error ? String(error).slice(0, 2000) : null,
      })
    },

    // keep only the recent tail for a job (called right after createRun)
    async pruneRuns(jobId, keep) {
      const stale = await db.log_trigger_job_runs.findAll({
        where: { job_id: jobId },
        order: [['started_at', 'DESC'], ['rolling_id', 'DESC']],
        offset: keep,
        attributes: ['id'],
      })
      if (stale.length) await db.log_trigger_job_runs.destroy({ where: { id: stale.map((r) => r.id) } })
    },

    // ── schedule-owned Conversations/Messages ──────────────────────────────
    // The '@dedicated' destination's home chat: a real conversation seeded with one assistant
    // message. Composition (title, seed text, provider) is the service's call; THIS just
    // persists the rows and hands back the new conversation id.
    async createSeededConversation({ userId, title, model, seedRole, seedContent, seedProvider }) {
      const convo = await db.txn_conversations.create({ user_id: ownerIdOf({ id: userId }, 'a schedule conversation'), title, model })
      await db.txn_messages.create({
        conversation_id: convo.id,
        role: seedRole,
        content: seedContent,
        provider: seedProvider,
        model,
      })
      return convo.id
    },

    // does this user own this conversation? (the "append to an existing chat" destination
    // check — a user may only point a schedule at a conversation of their own).
    async ownsConversation(conversationId, userId) {
      const convo = await db.txn_conversations.findOne({ where: { id: conversationId, ...scope(userId, 'this conversation') }, attributes: ['id'] })
      return convo != null
    },

    // light the sidebar's unread marker on a conversation a run just wrote to (best-effort).
    async markConversationUnread(conversationId) {
      await db.txn_conversations.update({ unread: true }, { where: { id: conversationId } })
    },
  }
}
