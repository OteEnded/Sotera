// Persona Memory — the AUX LLM builder. One `llm(prompt) → text` over the platform chat gateway, for
// the small off-the-hot-path calls memory makes about a turn (fact extraction, identity interpretation).
//
// It exists because those two calls must be IDENTICAL in every respect except which model and how many
// tokens: same placement, same keep-alive, same window, same temperature. When extraction's copy of
// that reasoning was the only copy, a second consumer had to either import from the extraction host or
// re-derive 40 lines of measured argument — and a re-derivation drifts. There are exactly two consumers
// today and no hypothetical third; this is the shared half of what they both already do.
//
// The four OTHER aux paths (embed · resolver · consolidate · reflect) deliberately do NOT use this:
// embedding is not a chat call at all, the resolver answers in 8 tokens, and consolidate/reflect produce
// prose under their own device settings. Same shape is not the same guarantee.

import { chat } from '../chat-runtime/index.js'
import { getSetting } from '../settings/index.js'

export const DEFAULT_EXTRACT_MODEL = 'ollama/gemma4:e4b'

export function extractModel(config) {
  try { return getSetting(config, 'memory.extractModel') || DEFAULT_EXTRACT_MODEL } catch { return DEFAULT_EXTRACT_MODEL }
}
function auxNumCtx(config) {
  try { const v = getSetting(config, 'memory.auxNumCtx'); return Number.isInteger(v) && v > 0 ? v : 8192 } catch { return 8192 }
}

/**
 * PLACEMENT — the same measured lever as memory.embeddingDevice and memory.resolverDevice, and it matters MORE
 * here now that fallback capture makes this call fire on ordinary turns rather than only tool-less ones.
 *
 * Measured on 2x16GB with the 26.5GB chat model resident: any aux model placed on the GPU does not fit, so
 * Ollama evicts the chat model and the user's NEXT TURN pays ~29s to reload it. These calls are
 * fire-and-forget off the hot path, so their own latency is invisible while that stall is not — which
 * makes CPU the correct default for exactly the same reason it is correct for the embedder.
 */
function auxDevice(config) {
  try { return getSetting(config, 'memory.extractDevice') === 'gpu' ? 'gpu' : 'cpu' } catch { return 'cpu' }
}
function auxKeepAlive(config) {
  try { const v = getSetting(config, 'memory.extractKeepAlive'); return typeof v === 'string' && v ? v : '30m' } catch { return '30m' }
}

export function splitModelId(full) {
  const i = full.indexOf('/')
  return i === -1 ? { provider: 'ollama', model: full } : { provider: full.slice(0, i), model: full.slice(i + 1) }
}

/**
 * makeAuxLlm — build the injected `llm(prompt) → text` for one memory aux call.
 *
 * TEMPERATURE 0 — MEASURED, and the effect is larger than it was for the adjudicator.
 *
 * These calls are STRUCTURED PERCEPTION: extraction's output becomes the ATTRIBUTE, and the attribute IS the
 * slot key; identity's output becomes a name the user is addressed by. Sampled, the same sentence produced
 * different keys AND — far worse — different DECISIONS. Measured on gemma4:e4b, 5 runs per sentence:
 *   "I drink a flat white every morning before work"  →  default temp: 4/5 runs extracted NOTHING, 1/5 captured
 *                                                     →  temperature 0: 5/5 captured
 *   "I usually go to bed around 1am"                  →  default temp: "around 1am" / "around 1 am" (2 values)
 *                                                     →  temperature 0: 1 value
 * So a large share of what was recorded as "capture sparsity — the model declined to call remember_fact" was
 * actually the EXTRACTOR silently dropping the fact, and it was invisible because zero extracted facts is
 * indistinguishable from a turn containing nothing worth keeping.
 *
 * This is the same principle as the resolver's, applied where it bites hardest: be DETERMINISTIC wherever the
 * output becomes an IDENTITY or a decision to persist. (Prose-producing aux calls — card induction, reflection
 * notes — are deliberately NOT changed here: their output is text to read, not a key to match on. Whether they
 * suffer the same silent-omission problem is untested.)
 *
 * @param {object} fastify
 * @param {{modelId?:string, maxTokens?:number, userId?:string|null}} opts
 *   `modelId` defaults to memory.extractModel READ LIVE — never a config-default chain, which cannot see a
 *   DB override (that is how the distiller once ran gemma while extraction ran qwen).
 */
export function makeAuxLlm(fastify, { modelId = null, maxTokens = 400, userId = null } = {}) {
  const { provider, model } = splitModelId(modelId || extractModel(fastify.config))
  const options = {
    stream: false,
    reasoning: { enabled: false },
    max_tokens: maxTokens,
    numCtx: auxNumCtx(fastify.config),
    keepAlive: auxKeepAlive(fastify.config),
    temperature: 0,
  }
  if (auxDevice(fastify.config) === 'cpu') options.numGpu = 0 // 0 VRAM — never evict the chat model
  return async (prompt) => {
    const res = await chat({
      serverConfig: fastify.config,
      request: { provider, model, messages: [{ role: 'user', content: prompt }], options, userId },
    })
    return res?.message?.content || ''
  }
}
