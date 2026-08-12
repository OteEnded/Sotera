// Persona Memory — EPISODE DISTILLER, host wiring. Binds the pure component (memory-distill.js) to
// settings, the platform chat gateway, and the OBSERVATION PIPELINE (episodic prose → EpisodicResolver's
// dedup-by-similarity → mem.remember). The distiller never writes the store itself — it is just another
// observer, like Dreaming and Reflection (RFC §4/§14: one write path).
//
// TRIGGERS: the nightly cron (gated by memory.episodeDistillEnabled, default OFF) and a root-only manual
// trigger (POST /admin/memories/distill — the "try it before you enable the schedule" path, like
// consolidate/reflect). Runs BEFORE consolidation in the tick so tonight's episodes can feed tonight's
// Cards. Off the hot path; makes LLM calls → daily tick only, never the boot pass.
//
// IDEMPOTENT the store's way: each episode's `source` carries a per-conversation watermark
// (`episode:<convoId>:<lastRollingId>`); a re-run finds the watermark and skips already-covered messages.
// Dead episodes (archived/decayed) keep their watermark — fading a memory must not resurrect its event.

import { chat } from '../chat-runtime/index.js'
import { getSetting } from '../settings/index.js'
import { buildMemoryPipeline } from './memory-pipeline-host.js'
import { resolveProfile } from './profile-service.js'
import { Op } from 'sequelize'
import {
  shapeTranscript, buildEpisodePrompt, classifyEpisodeReply, episodeSource, episodeWatermarks,
} from '@ote/memory/cognition/memory-distill.js'

const DAY = 864e5
const DEFAULT_DISTILL_MODEL = 'ollama/gemma4:e4b'

export function distillEnabled(config) {
  try { return getSetting(config, 'memory.episodeDistillEnabled') === true } catch { return false }
}
/** Empty distillModel = follow extractModel — resolved HERE (getSetting sees DB overrides; a
 *  fromConfig-chain in the settings def does not, which is exactly how the distiller silently ran a
 *  DIFFERENT model than extraction on day one). */
export function distillModel(config) {
  try {
    return getSetting(config, 'memory.distillModel')
      || getSetting(config, 'memory.extractModel')
      || DEFAULT_DISTILL_MODEL
  } catch { return DEFAULT_DISTILL_MODEL }
}
function distillMinMessages(config) {
  try { const v = getSetting(config, 'memory.distillMinMessages'); return Number.isInteger(v) && v >= 1 ? v : 4 } catch { return 4 }
}
function auxNumCtx(config) {
  try { const v = getSetting(config, 'memory.auxNumCtx'); return Number.isInteger(v) && v > 0 ? v : 8192 } catch { return 8192 }
}
function splitModelId(full) {
  const i = full.indexOf('/')
  return i === -1 ? { provider: 'ollama', model: full } : { provider: full.slice(0, i), model: full.slice(i + 1) }
}

/** temperature 0 + numGpu 0 for the same measured reasons as every aux sibling: 0 suppresses
 *  confabulation (an invented episode is a false event memory — worse than a missed one), and a
 *  GPU-placed aux model evicts the chat model (~29s reload on the user's next turn). max_tokens 160 —
 *  an episode is 1-2 sentences; anything needing more is the 'overlong' failure, not a longer budget. */
function makeDistillLlm(fastify, { userId = null } = {}) {
  const { provider, model } = splitModelId(distillModel(fastify.config))
  return async (prompt) => {
    const res = await chat({
      serverConfig: fastify.config,
      request: { provider, model, messages: [{ role: 'user', content: prompt }], options: {
        stream: false, reasoning: { enabled: false }, max_tokens: 160, numCtx: auxNumCtx(fastify.config),
        temperature: 0, numGpu: 0, keepAlive: '5m',
      }, userId },
    })
    return res?.message?.content || ''
  }
}

/**
 * Distill every conversation that saw new messages within the lookback window into episode memories.
 * Bounded by `maxConvos` (logs if it truncates). A failing conversation is logged and skipped, never
 * aborts the batch. `dryRun` distills but writes nothing (the seed/inspect path).
 * @returns {{skipped?:boolean, reason?:string, scanned:number, distilled:number, nothingNotable:number,
 *            thin:number, empty:number, overlong:number, errors:number, truncated?:number, episodes:Array}}
 */
export async function distillAll(fastify, { maxConvos = 25, lookbackDays = 2, dryRun = false, force = false } = {}) {
  if (!force && !distillEnabled(fastify.config)) return { skipped: true, reason: 'disabled' }
  const db = fastify.db || {}
  if (!db.txn_conversations || !db.txn_messages || !db.txn_memories) return { skipped: true, reason: 'no-db' }
  const minMsgs = distillMinMessages(fastify.config)

  // Watermarks from ALL episode rows — deliberately no live-filter: an archived episode's messages are
  // still covered. `source` is indexed by nothing, but episode rows are few (one per conversation-day).
  const markRows = await db.txn_memories.findAll({
    where: { source: { [Op.like]: 'episode:%' } }, attributes: ['source'], raw: true,
  })
  const marks = episodeWatermarks(markRows)

  const cutoff = new Date(Date.now() - lookbackDays * DAY)
  const convos = await db.txn_conversations.findAll({
    where: { incognito: false, updated_at: { [Op.gte]: cutoff } },
    order: [['updated_at', 'DESC']], raw: true,
  })
  const truncated = Math.max(0, convos.length - maxConvos)
  const batch = convos.slice(0, maxConvos)
  const users = new Map((await db.mst_users.findAll({ attributes: ['id', 'username', 'display_name'], raw: true })).map((u) => [u.id, u]))

  const tally = { scanned: batch.length, distilled: 0, nothingNotable: 0, thin: 0, empty: 0, overlong: 0, errors: 0 }
  const episodes = []
  const declined = []
  const pipelines = new Map() // one pipeline (and resolved name) per conversation owner, reused across the batch
  const names = new Map()

  /** Who this human is to the persona — the PROFILE SERVICE's canonical answer (account name ▸
   *  remembered preferred_name ▸ none), then username, then the neutral fallback. Without it the
   *  OWNER's own chats distill as "the user and I", which is exactly the wrong persona to be
   *  nameless in.
   *  ⚠️ HISTORICAL: root conversations used to carry `user_id NULL` (config login, no row), so this
   *  synthesized `{ id:null, isRoot:true }` to route resolveProfile at `auth.root.displayName`. Root
   *  has owned a row since 2026-08-06 and its name moved onto that row on 2026-08-07, so root now
   *  resolves like any other user and the synthesized-root path only matters for rows backfilled
   *  before that. */
  async function resolveWho(userId) {
    if (names.has(userId)) return names.get(userId)
    const row = userId != null ? users.get(userId) : null
    let who = null
    try {
      const user = userId == null
        ? { id: null, isRoot: true }
        : { id: userId, username: row?.username, displayName: row?.display_name ?? null }
      const profile = await resolveProfile(fastify, user)
      who = profile?.preferredName || null
    } catch { /* profile read is best-effort — username/fallback still stands */ }
    who = who || row?.username || 'the user'
    names.set(userId, who)
    return who
  }

  for (const c of batch) {
    try {
      const watermark = marks.get(c.id) || 0
      const fresh = await db.txn_messages.findAll({
        where: { conversation_id: c.id, rolling_id: { [Op.gt]: watermark } },
        order: [['rolling_id', 'ASC']], raw: true,
      })
      if (fresh.length < minMsgs) { tally.thin++; continue }
      const who = await resolveWho(c.user_id)
      const llm = makeDistillLlm(fastify, { userId: c.user_id ?? null })
      const raw = await llm(buildEpisodePrompt({ who, transcript: shapeTranscript(fresh) }))
      const cls = classifyEpisodeReply(raw)
      if (cls.verdict !== 'episode') {
        tally[cls.verdict === 'nothing-notable' ? 'nothingNotable' : cls.verdict]++
        // telemetry, not just a count: WHICH conversations were declined is what tunes the escape
        // hatch (the v5 prompt over-fired on real discussions and only this list showed it)
        declined.push({ conversationId: c.id, title: String(c.title || '').slice(0, 60), who, verdict: cls.verdict })
        continue
      }
      const last = fresh[fresh.length - 1]
      if (!dryRun) {
        if (!pipelines.has(c.user_id)) pipelines.set(c.user_id, buildMemoryPipeline(fastify, { userId: c.user_id ?? null }))
        const { pipeline } = pipelines.get(c.user_id)
        // importance 3 = within the nightly decay rule's reach (decayImportanceMax default 3): an event
        // that is never recalled MAY fade after 30 idle days — that is what episodic means. Cards
        // consolidate clusters long before that when enabled.
        await pipeline.ingest({
          type: 'episodic', content: cls.content, kind: 'episodic', importance: 3,
          source: episodeSource(c.id, last.rolling_id), sourceMessageId: last.id ?? null,
        })
      }
      tally.distilled++
      episodes.push({ conversationId: c.id, title: String(c.title || '').slice(0, 60), who, episode: cls.content, newMessages: fresh.length, dryRun })
    } catch (e) {
      tally.errors++
      fastify.log?.warn?.({ err: e?.message, conversationId: c.id }, '[memory-distill] conversation failed')
    }
  }
  return { ...tally, dryRun, ...(truncated ? { truncated } : {}), episodes, declined }
}
