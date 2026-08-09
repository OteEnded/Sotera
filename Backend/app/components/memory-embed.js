// Persona Memory v2 — embedding helper. Binds the memory store to the platform's embedding gateway
// (which already provides the exact-match vector cache), so memory reuses one embedding path.
// The model is `memory.embeddingModel` (default ollama/qwen3-embedding:latest); it MUST stay stable
// — changing it changes the vector space and silently invalidates existing memory embeddings.

import { embeddings } from '../chat-runtime/index.js'
import { getSetting } from '../settings/index.js'

const DEFAULT_EMBED_MODEL = 'ollama/qwen3-embedding:4b'
const DEFAULT_EMBED_DIMS = 2048

export function memoryEmbeddingModel(config) {
  try {
    return getSetting(config, 'memory.embeddingModel') || DEFAULT_EMBED_MODEL
  } catch {
    return DEFAULT_EMBED_MODEL
  }
}

export function memoryEmbeddingDims(config) {
  try {
    const d = getSetting(config, 'memory.embeddingDims')
    return Number.isInteger(d) && d > 0 ? d : DEFAULT_EMBED_DIMS
  } catch {
    return DEFAULT_EMBED_DIMS
  }
}

// num_ctx cap + keep_alive for the embed model — keeps VRAM small (so it coexists with the chat
// model instead of evicting it) and the embedder resident (no per-op reload). See settings.
function memoryEmbeddingNumCtx(config) {
  try { const v = getSetting(config, 'memory.embeddingNumCtx'); return Number.isInteger(v) && v > 0 ? v : 2048 } catch { return 2048 }
}
function memoryEmbeddingKeepAlive(config) {
  try { return getSetting(config, 'memory.embeddingKeepAlive') || '30m' } catch { return '30m' }
}
// 'cpu' → num_gpu 0 (0 VRAM, embedder runs on CPU; frees the whole GPU for the chat model's
// context). 'gpu' → null (default offload, resident on GPU). See memory.embeddingDevice.
function memoryEmbeddingNumGpu(config) {
  try { return getSetting(config, 'memory.embeddingDevice') === 'gpu' ? null : 0 } catch { return 0 }
}

// "provider/model" → { provider, model } (model may itself contain a ':tag').
function splitModelId(full) {
  const i = full.indexOf('/')
  return i === -1 ? { provider: 'ollama', model: full } : { provider: full.slice(0, i), model: full.slice(i + 1) }
}

// Matryoshka truncation: qwen3-embedding is MRL-trained, so its first N dims are a valid (slightly
// lower-fidelity) embedding. Slice to `dims` + L2-renormalize — keeps memory vectors at a
// pgvector-friendly size instead of the model's native 2560/4096.
function truncate(vec, dims) {
  if (!Array.isArray(vec) || !dims || vec.length <= dims) return vec
  const head = vec.slice(0, dims)
  let n = 0
  for (const x of head) n += x * x
  n = Math.sqrt(n)
  return n > 0 ? head.map((x) => x / n) : head
}

/**
 * Build an `embed(text) → { vector, model }` bound to the host gateway + config, for one user.
 * The vector is MRL-truncated to `memory.embeddingDims`. `model` records "<id>@<dims>" so a future
 * migration can detect vectors made with a different model/dim. Returns { vector: null } on blank.
 */
export function makeEmbedder(fastify, { userId = null, numCtx: numCtxOverride = null } = {}) {
  const full = memoryEmbeddingModel(fastify.config)
  const dims = memoryEmbeddingDims(fastify.config)
  // ONE KNOB, TWO WORKLOADS — measured 2026-08-03. `memory.embeddingNumCtx` (2048) is sized for MEMORY
  // content, where it is 26x oversized: the longest memory on record is 312 chars (~78 tokens). But the
  // same embedder also embeds whole MESSAGES for Conversation Search, and there the same 2048 truncates:
  // of 645 embed-eligible messages, 21 were clipped, the longest being 87,400 chars (~21,850 tokens) —
  // 10x over the window. Truncation is SILENT, so the dense arm was quietly matching on the first ~8k
  // chars of the longest messages while nothing anywhere reported a problem.
  // Callers that embed long text pass their own cap (see memory.messageEmbeddingNumCtx).
  const numCtx = Number.isInteger(numCtxOverride) && numCtxOverride > 0
    ? numCtxOverride
    : memoryEmbeddingNumCtx(fastify.config)
  const keepAlive = memoryEmbeddingKeepAlive(fastify.config)
  const numGpu = memoryEmbeddingNumGpu(fastify.config)
  const { provider, model } = splitModelId(full)
  const tag = `${full}@${dims}`
  return async function embed(text) {
    if (!text || !String(text).trim()) return { vector: null, model: tag }
    const res = await embeddings({
      serverConfig: fastify.config,
      db: fastify.db,
      request: { provider, model, input: String(text), userId, numCtx, keepAlive, numGpu },
    })
    const raw = res?.embeddings?.[0] ?? null
    return { vector: raw ? truncate(raw, dims) : null, model: tag }
  }
}
