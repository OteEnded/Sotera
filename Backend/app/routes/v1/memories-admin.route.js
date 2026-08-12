// Memory inspector routes (root/system_config) — see and manage what the persona remembers
// (Persona Memory v2, the `memories` table). Read-mostly + a few safe actions: pin/unpin, forget
// (soft), delete (hard). This is the "make memory visible/trustworthy" surface (RFC_PERSONA_MEMORY).
//
// GET    /admin/memories?kind=&scope=&limit=   list (scope: live | archived | all; default live)
// POST   /admin/memories/:id/pin  { pinned }   pin / unpin
// POST   /admin/memories/:id/forget            soft-forget (expired_at + tier=cold)
// DELETE /admin/memories/:id                   hard delete (admin cleanup)

import { Op } from 'sequelize'
import { requireLogin } from '../../auth/index.js'
import { requireCapability } from '../../auth/permissions.js'
import { consolidateAll } from '../../components/memory-consolidate-host.js'
import { distillAll } from '../../components/memory-distill-host.js'
import { reflectAll } from '../../components/reflection-host.js'
import { snapshot as resolverSnapshot, reset as resolverReset } from '@ote/memory/cognition/memory-resolver-telemetry.js'
import { snapshot as captureSnapshot, reset as captureReset } from '@ote/memory/cognition/memory-capture-telemetry.js'
import { grayZoneMode, grayZoneBand, resolverModel, resolverDevice, resolverKeepAlive } from '../../components/memory-resolver-host.js'
import { extractModel, extractEnabled } from '../../components/memory-extract-host.js'
import { buildMemoryV2 } from '../../components/memory-v2-host.js'
import { logMemoryChange, snapshot } from '../../audit/memory-log.js'
import { getSetting } from '../../settings/index.js'

/** Audit label for an admin acting on someone else's memory — 'root' or 'admin:<username>', so the trail
 *  distinguishes an operator's intervention from the owner's own edit or a background job. */
const actorFor = (request) => (request.user?.isRoot ? 'root' : `admin:${request.user?.username ?? 'unknown'}`)

const KINDS = ['episodic', 'semantic', 'identity', 'card', 'note']

// Row view — everything the inspector needs, but the raw embedding replaced by its dimension
// (the vectors are large + not human-useful).
const view = (r) => ({
  id: r.id,
  kind: r.kind,
  content: r.content,
  entity: r.entity,
  attribute: r.attribute,
  value: r.value,
  importance: r.importance,
  confidence: r.confidence ?? null,
  accessCount: r.access_count,
  pinned: r.pinned,
  tier: r.tier,
  persona: r.persona,
  userId: r.user_id,
  source: r.source,
  sourceMessageId: r.source_message_id,
  embeddingDim: Array.isArray(r.embedding) ? r.embedding.length : 0,
  embeddingModel: r.embedding_model,
  supersedesId: r.supersedes_id,
  validAt: r.valid_at,
  invalidAt: r.invalid_at,
  expiredAt: r.expired_at,
  createdAt: r.created_at,
  lastAccess: r.last_access,
})

export default async function memoriesAdminRoutes(fastify) {
  fastify.addHook('preHandler', requireLogin())
  const systemConfig = requireCapability('system_config')
  const Memories = () => fastify.db.txn_memories

  fastify.get('/admin/memories', { preHandler: systemConfig }, async (request) => {
    const { kind, scope = 'live', limit, userId } = request.query || {}
    const where = {}
    if (KINDS.includes(kind)) where.kind = kind
    if (userId === 'root') where.user_id = null // memory is per-user; make WHOSE explicit + filterable
    else if (userId) where.user_id = userId
    if (scope === 'live') { where.invalid_at = null; where.expired_at = null }
    else if (scope === 'archived') { where[Op.or] = [{ invalid_at: { [Op.ne]: null } }, { expired_at: { [Op.ne]: null } }] }
    // scope === 'all' → no temporal filter
    const cap = Math.min(Math.max(Number(limit) || 200, 1), 1000)
    const rows = await Memories().findAll({ where, order: [['rolling_id', 'DESC']], limit: cap, raw: true })
    // resolve owner ids → usernames so the inspector shows WHOSE each memory is (they're per-user;
    // root's chats are user_id null). Cheap map over the (small) user table.
    const users = await fastify.db.mst_users.findAll({ attributes: ['id', 'username'], raw: true })
    const nameOf = (id) => (id == null ? 'root' : (users.find((u) => u.id === id)?.username || id.slice(0, 8)))
    const all = await Memories().findAll({ attributes: ['kind', 'user_id', 'invalid_at', 'expired_at', 'pinned'], raw: true })
    const live = all.filter((r) => !r.invalid_at && !r.expired_at)
    // owners present (for the user filter) — live counts per owner
    const owners = [...new Set(all.map((r) => (r.user_id == null ? 'root' : r.user_id)))]
      .map((key) => ({ key, name: nameOf(key === 'root' ? null : key), live: live.filter((r) => (r.user_id == null ? 'root' : r.user_id) === key).length }))
      .sort((a, b) => b.live - a.live)
    const summary = {
      total: all.length,
      live: live.length,
      archived: all.length - live.length,
      pinned: all.filter((r) => r.pinned).length,
      byKind: KINDS.reduce((o, k) => ({ ...o, [k]: live.filter((r) => r.kind === k).length }), {}),
    }
    return { memories: rows.map((r) => ({ ...view(r), username: nameOf(r.user_id) })), summary, owners, shown: rows.length }
  })

  fastify.post('/admin/memories/:id/pin', { preHandler: systemConfig }, async (request, reply) => {
    const pinned = request.body?.pinned !== false
    const [n] = await Memories().update({ pinned }, { where: { id: request.params.id } })
    if (!n) return reply.code(404).send({ error: 'not found' })
    return { ok: true, pinned }
  })

  // Forget goes THROUGH THE SERVICE, not straight to an UPDATE. Two behaviours only live there and both
  // matter here: un-supersede (deleting a fact that displaced another gives the displaced one back) and
  // the memory audit entry. An admin action that quietly skipped them would be the one deletion path with
  // no record — which is the exact hole this round exists to close.
  fastify.post('/admin/memories/:id/forget', { preHandler: systemConfig }, async (request, reply) => {
    const row = await Memories().findOne({ where: { id: request.params.id }, raw: true })
    if (!row) return reply.code(404).send({ error: 'not found' })
    const mem = buildMemoryV2(fastify, { userId: row.user_id ?? null, persona: row.persona ?? null, actor: actorFor(request) })
    const res = await mem.forget({ id: request.params.id })
    return { ok: true, forgotten: res.forgotten, restored: res.restored ?? null }
  })

  // RESTORE — the inverse of forget, and the capability whose absence made the inspector a one-way door:
  // an archived memory could be viewed and then only left alone or destroyed. Un-archives always; returns
  // the belief to LIVE only when its slot is free, and says so plainly when it is not (`nowLive: false`)
  // rather than reporting a recovery that did not happen.
  fastify.post('/admin/memories/:id/restore', { preHandler: systemConfig }, async (request, reply) => {
    const row = await Memories().findOne({ where: { id: request.params.id }, raw: true })
    if (!row) return reply.code(404).send({ error: 'not found' })
    const mem = buildMemoryV2(fastify, { userId: row.user_id ?? null, persona: row.persona ?? null, actor: actorFor(request) })
    return mem.restore({ id: request.params.id })
  })

  // HARD delete — the one irreversible action on this surface. Audited BEFORE the row goes, with a full
  // snapshot: after this returns, the audit entry is the only remaining copy of what was destroyed.
  fastify.delete('/admin/memories/:id', { preHandler: systemConfig }, async (request, reply) => {
    const row = await Memories().findOne({ where: { id: request.params.id }, raw: true })
    if (!row) return reply.code(404).send({ error: 'not found' })
    await logMemoryChange(fastify.db, {
      memoryId: row.id, action: 'delete', userId: row.user_id ?? null, persona: row.persona ?? null,
      slotId: row.slot_id ?? null, actor: actorFor(request),
      reason: 'hard delete from the admin inspector — irreversible; this entry is the only surviving copy',
      before: snapshot(row), source: row.source ?? null, log: fastify.log,
    })
    const n = await Memories().destroy({ where: { id: request.params.id } })
    if (!n) return reply.code(404).send({ error: 'not found' })
    return { ok: true, deleted: true }
  })

  // The memory audit trail — how a belief stopped being believed. Filterable by the memory itself, the
  // slot (a concept's whole trajectory), or the owner.
  fastify.get('/admin/memory-log', { preHandler: systemConfig }, async (request) => {
    const { memoryId, slotId, userId, action, limit } = request.query || {}
    const where = {}
    if (memoryId) where.memory_id = memoryId
    if (slotId) where.slot_id = slotId
    if (action) where.action = action
    if (userId === 'root') where.user_id = null
    else if (userId) where.user_id = userId
    const cap = Math.min(Math.max(Number(limit) || 100, 1), 500)
    const rows = await fastify.db.log_memory_changes.findAll({
      where, order: [['rolling_id', 'DESC']], limit: cap, raw: true,
    })
    return { entries: rows, shown: rows.length }
  })

  // Manually trigger the EPISODE DISTILLER across recent conversations — the "seed + inspect before
  // you enable the nightly schedule" path. force=true bypasses memory.episodeDistillEnabled.
  // ?dryRun=true distills but writes nothing (returns the episodes for eyeballing); ?lookbackDays and
  // ?maxConvos widen the window for the first seed over a backlog. Makes LLM calls — root-only.
  fastify.post('/admin/memories/distill', { preHandler: systemConfig }, async (request) => {
    const dryRun = request.query?.dryRun === 'true' || request.body?.dryRun === true
    const lookbackDays = Number(request.query?.lookbackDays || request.body?.lookbackDays) || undefined
    const maxConvos = Number(request.query?.maxConvos || request.body?.maxConvos) || undefined
    const result = await distillAll(fastify, { force: true, dryRun, lookbackDays, maxConvos })
    return { ok: true, ...result }
  })

  // Manually trigger Phase-3 consolidation (Knowledge Cards) across all scopes — the "try it before
  // you enable the nightly schedule" path. force=true bypasses the memory.consolidateEnabled gate so
  // this works even while the schedule is off. ?dryRun=true plans without writing; ?minSize overrides.
  // Makes LLM calls (loads the consolidate model) — deliberate, root-only.
  fastify.post('/admin/memories/consolidate', { preHandler: systemConfig }, async (request) => {
    const dryRun = request.query?.dryRun === 'true' || request.body?.dryRun === true
    const minSize = Number(request.query?.minSize || request.body?.minSize) || undefined
    const result = await consolidateAll(fastify, { force: true, dryRun, minSize })
    return { ok: true, ...result }
  })

  // Manually trigger REFLECTION (L3 Persona Notes, R2) across all scopes — the "try it before you
  // enable the nightly schedule" path. force=true bypasses memory.reflectMode. ?dryRun=true distils
  // without writing (returns the proposed notes). Makes LLM calls (loads memory.reflectModel), root-only.
  fastify.post('/admin/memories/reflect', { preHandler: systemConfig }, async (request) => {
    const dryRun = request.query?.dryRun === 'true' || request.body?.dryRun === true
    const result = await reflectAll(fastify, { force: true, dryRun })
    return { ok: true, ...result }
  })

  // RESOLVER TELEMETRY (Memory V3, RFC §15.3) — how the slot-resolution STRATEGY is performing. These are
  // architectural metrics, not merely operational: they are what makes "did the gray zone earn its cost?"
  // answerable. Process-local counters (not persisted), so they describe THIS server process since boot or
  // since the last reset. Read this before flipping memory.resolver.grayZoneMode from 'shadow' to 'on'.
  //   hit_rate / alias_share  — how often resolution succeeds, and how much of that is the CHEAP alias path
  //   gray_zone_rate          — how often a miss landed in the ambiguous band (the LLM's addressable share)
  //   llm_agree_rate          — of those, how often the LLM said "same property" (would have bridged a split)
  //   shadow_would_have_resolved — concept splits shadow mode would have prevented
  fastify.get('/admin/memories/resolver-telemetry', { preHandler: systemConfig }, async () => ({
    ok: true,
    mode: grayZoneMode(fastify.config),
    band: grayZoneBand(fastify.config),
    model: resolverModel(fastify.config),
    counters: resolverSnapshot(),
  }))

  // Start a fresh measurement window (e.g. before a soak).
  fastify.post('/admin/memories/resolver-telemetry/reset', { preHandler: systemConfig }, async () => {
    resolverReset()
    captureReset()
    return { ok: true, reset: true, counters: resolverSnapshot(), capture: captureSnapshot() }
  })

  /**
   * MEMORY HEALTH — one call that answers "is the memory system healthy?" at a glance (Ote's ask).
   *
   * ⚠️ THE SHAPE IS THE POINT: `window` (process-local, resets on restart) is kept STRICTLY SEPARATE from
   * `durable` (read from the database, survives everything). A panel that blurred the two would recreate the
   * exact trap this project already fell into — counters at zero after a reboot read as "ambiguity eliminated"
   * rather than "we restarted". `window.startedAt`/`uptimeMinutes` ship so the reader always knows the span.
   *
   * The durable half is what makes multi-week questions answerable with ZERO snapshots: `slots.aliases` records
   * {phrase, by, confidence, at} per learned alias, so promotion history is reconstructable after any restart.
   */
  fastify.get('/admin/memories/health', { preHandler: systemConfig }, async () => {
    const cfg = fastify.config
    const resolver = resolverSnapshot()
    const capture = captureSnapshot()
    const startedAt = capture.startedAt

    // ── DURABLE: slots + every learned alias with its provenance and timestamp ────────────────────────
    const slots = await fastify.db.mst_slots.findAll({ raw: true }).catch(() => [])
    const aliases = slots.flatMap((s) => (s.aliases || []).map((a) => ({ ...a, slot: s.canonical_label, slotId: s.id })))
    const byProvenance = aliases.reduce((m, a) => { const k = a?.by || 'unknown'; m[k] = (m[k] || 0) + 1; return m }, {})
    // Recent promotions, newest first — the spot-audit surface. A wrong promotion is the failure that matters
    // most in 'on' mode (it corrupts a slot AND writes a permanent alias), so it must be eyeball-able.
    const recentPromotions = aliases
      .filter((a) => a?.at)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, 12)
      .map((a) => ({ phrase: a.phrase, slot: a.slot, by: a.by, confidence: a.confidence ?? null, at: a.at }))

    const [factCount, cardCount, noteCount, identityCount] = await Promise.all([
      fastify.db.txn_memories.count({ where: { kind: 'semantic', invalid_at: null, expired_at: null } }).catch(() => 0),
      fastify.db.txn_memories.count({ where: { kind: 'card', invalid_at: null, expired_at: null } }).catch(() => 0),
      fastify.db.txn_memories.count({ where: { kind: 'note', invalid_at: null, expired_at: null } }).catch(() => 0),
      fastify.db.txn_memories.count({ where: { namespace: 'identity', invalid_at: null, expired_at: null } }).catch(() => 0),
    ])

    // BLANK REPLIES are durable: the flag rides in the message row's `metrics` JSON. Counted over a rolling
    // window because an all-time total says nothing about whether it is happening NOW.
    //
    // MECHANISM VERIFIED (2026-07-30), because a metric that always reports 0 is worse than a missing one: a
    // control count against a key known to exist in the data (`metrics.ttftMs`) returns 470, so this nested
    // JSON path really does match. A first attempt to "prove" it broken used `metrics.finishReason` — which is
    // simply NOT a metrics key, so the 0 was the control's fault, not the query's. Verify the control too.
    // `.catch(() => null)` keeps a genuine failure DISTINGUISHABLE from a real zero (null = not measurable).
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    const blankReplies = await fastify.db.txn_messages.count({
      where: { created_at: { [Op.gte]: since }, metrics: { blankReply: { [Op.ne]: null } } },
    }).catch(() => null)

    return {
      ok: true,
      // ── CONFIG: what the subsystem is actually configured to be right now ──────────────────────────
      config: {
        grayZoneMode: grayZoneMode(cfg),
        band: grayZoneBand(cfg),
        resolverModel: resolverModel(cfg),
        resolverDevice: resolverDevice(cfg),
        resolverKeepAlive: resolverKeepAlive(cfg),
        resolverTemperature: 0, // pinned in makeResolverLlm — a classifier must be deterministic, not a setting
        extractModel: extractModel(cfg),
        extractEnabled: extractEnabled(cfg),
        extractTemperature: 0, // pinned for the same reason: its output IS the slot key
        reflectMode: getSetting(cfg, 'memory.reflectMode'),
        embeddingModel: getSetting(cfg, 'memory.embeddingModel'),
        embeddingDevice: getSetting(cfg, 'memory.embeddingDevice'),
      },
      // ── WINDOW: process-local. MEANINGLESS without its span — hence startedAt/uptime. ──────────────
      window: {
        startedAt,
        uptimeMinutes: Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000)),
        resolver,
        capture,
      },
      // ── DURABLE: from the database. Survives restarts; this is the multi-week evidence. ────────────
      durable: {
        slots: slots.length,
        aliases: aliases.length,
        promotedAliases: byProvenance['gray-zone'] || 0,
        aliasesByProvenance: byProvenance,
        recentPromotions,
        liveFacts: factCount,
        liveCards: cardCount,
        liveNotes: noteCount,
        liveIdentity: identityCount,
        blankRepliesLast7d: blankReplies,
      },
    }
  })
}
