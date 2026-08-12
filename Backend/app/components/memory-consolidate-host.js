// Persona Memory v2 — host wiring for Phase-3 consolidation (Knowledge Cards). Builds the injected
// `llm(prompt) → text` over the platform chat gateway (metered/provider-agnostic like extract), and
// runs the DCPM pass per (persona, user) scope. Off the hot path — driven by the daily cron
// (gated by memory.consolidateEnabled) or a manual admin trigger. Never throws into its caller.

import { chat } from '../chat-runtime/index.js'
import { getSetting } from '../settings/index.js'
import { buildMemoryPipeline } from './memory-pipeline-host.js'
import { runDream } from '@ote/memory/cognition/memory-dream.js'

const DEFAULT_CONSOLIDATE_MODEL = 'ollama/gemma4:e4b'

export function consolidateModel(config) {
  try { return getSetting(config, 'memory.consolidateModel') || DEFAULT_CONSOLIDATE_MODEL } catch { return DEFAULT_CONSOLIDATE_MODEL }
}
export function consolidateEnabled(config) {
  try { return getSetting(config, 'memory.consolidateEnabled') === true } catch { return false }
}
export function consolidateMinSize(config) {
  try { const v = getSetting(config, 'memory.consolidateMinSize'); return Number.isInteger(v) ? v : 4 } catch { return 4 }
}
function auxNumCtx(config) {
  try { const v = getSetting(config, 'memory.auxNumCtx'); return Number.isInteger(v) && v > 0 ? v : 8192 } catch { return 8192 }
}
export function consolidateThreshold(config) {
  try { const v = getSetting(config, 'memory.consolidateThreshold'); return typeof v === 'number' && v > 0 ? v : 0.55 } catch { return 0.55 }
}

function splitModelId(full) {
  const i = full.indexOf('/')
  return i === -1 ? { provider: 'ollama', model: full } : { provider: full.slice(0, i), model: full.slice(i + 1) }
}

/**
 * PLACEMENT (added 2026-08-03) — consolidation was the ONLY aux path with no device lever, and the only one
 * still landing on the GPU. Every sibling (embed / extract / resolve / reflect) runs at num_gpu:0 for the
 * same measured reason: on this box a GPU-placed aux model does not fit beside the chat model, so Ollama
 * evicts the chat model and the user's NEXT turn pays ~29s to reload it. Consolidation is a nightly/manual
 * batch entirely off the user's critical path, so its own latency is invisible while that stall is not.
 * Harmless in practice until now only because memory.consolidateEnabled defaults to false — but the manual
 * admin trigger runs regardless of the gate, which is exactly how an "inert" path bites.
 */
function makeConsolidateLlm(fastify, { userId = null } = {}) {
  const { provider, model } = splitModelId(consolidateModel(fastify.config))
  const options = { stream: false, reasoning: { enabled: false }, max_tokens: 500, numCtx: auxNumCtx(fastify.config) }
  let device = 'cpu'
  try { device = getSetting(fastify.config, 'memory.consolidateDevice') === 'gpu' ? 'gpu' : 'cpu' } catch { device = 'cpu' }
  if (device === 'cpu') options.numGpu = 0 // 0 VRAM — never evict the chat model
  return async (prompt) => {
    const res = await chat({
      serverConfig: fastify.config,
      request: { provider, model, messages: [{ role: 'user', content: prompt }], options, userId },
    })
    return res?.message?.content || ''
  }
}

/**
 * Run consolidation ("Dreaming") for ONE (persona, user) scope. The observer perceives — retrieve, cluster,
 * induce — and PROPOSES a CardObservation per topic; the OBSERVATION PIPELINE resolves and persists it
 * (RFC §14). Dreaming no longer writes to the store directly, so there is exactly one write path.
 */
export async function consolidateScope(fastify, { persona = null, userId = null, minSize, dryRun = false } = {}) {
  const { mem, pipeline } = buildMemoryPipeline(fastify, { userId, persona })
  return runDream({
    mem,
    llm: makeConsolidateLlm(fastify, { userId }),
    ingest: pipeline.ingest,
    minSize: minSize ?? consolidateMinSize(fastify.config),
    threshold: consolidateThreshold(fastify.config),
    dryRun,
    log: fastify.log ?? null,
  })
}

/**
 * Enumerate every (persona, user) scope with enough live episodics and consolidate each. Bounded by
 * `maxScopes` (a nightly-pass safety cap — logs if it truncates). Aggregates a summary; a failing
 * scope is logged and skipped, never aborts the batch.
 * @returns {{skipped?:boolean, scopes:number, cards:number, archived:number, truncated?:number}}
 */
export async function consolidateAll(fastify, { minSize, maxScopes = 25, dryRun = false, force = false } = {}) {
  if (!force && !consolidateEnabled(fastify.config)) return { skipped: true, reason: 'disabled' }
  const { txn_memories } = fastify.db || {}
  if (!txn_memories) return { skipped: true, reason: 'no-db' }
  const min = minSize ?? consolidateMinSize(fastify.config)
  const { tableName, schema } = txn_memories.getTableName()
  const table = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`
  const rows = await txn_memories.sequelize.query(
    `SELECT persona, user_id FROM ${table} WHERE kind='episodic' AND invalid_at IS NULL AND expired_at IS NULL ` +
    `GROUP BY persona, user_id HAVING count(*) >= :min`,
    { replacements: { min }, type: 'SELECT' },
  )
  const truncated = Math.max(0, rows.length - maxScopes)
  const scopes = rows.slice(0, maxScopes)
  let cards = 0
  let archived = 0
  const details = []
  for (const s of scopes) {
    try {
      const r = await consolidateScope(fastify, { persona: s.persona ?? null, userId: s.user_id ?? null, minSize: min, dryRun })
      cards += r.cards?.length || 0
      archived += (r.cards || []).reduce((n, c) => n + (c.archived || 0), 0)
      if (r.cards?.length) details.push({ persona: s.persona ?? null, userId: s.user_id ?? null, cards: r.cards.length })
    } catch (e) {
      fastify.log?.warn?.({ err: e?.message, persona: s.persona, userId: s.user_id }, '[memory-consolidate] scope failed')
    }
  }
  return { scopes: scopes.length, cards, archived, dryRun, ...(truncated ? { truncated } : {}), details }
}
