// Persona Memory v2 — host wiring for fact extraction. Builds the injected `llm(prompt) → text`
// over the platform chat gateway (so extraction is metered + provider-agnostic like any other
// internal LLM call — title/summary use the same `chat()`), and a one-shot `captureFacts` that
// runs the full extract→reconcile pipeline for one turn. Meant to be called FIRE-AND-FORGET off the
// hot path — it never blocks or breaks a reply.

import { chat } from '../chat-runtime/index.js'
import { getSetting } from '../settings/index.js'
import { extractFacts } from './memory-extract.js'
import { buildMemoryPipeline } from './memory-pipeline-host.js'
import { OBSERVATION_TYPE } from './memory-observation.js'
import { bump } from './memory-capture-telemetry.js'

const DEFAULT_EXTRACT_MODEL = 'ollama/gemma4:e4b'

export function extractModel(config) {
  try { return getSetting(config, 'memory.extractModel') || DEFAULT_EXTRACT_MODEL } catch { return DEFAULT_EXTRACT_MODEL }
}
export function extractEnabled(config) {
  try { return getSetting(config, 'memory.extractEnabled') !== false } catch { return true }
}
function auxNumCtx(config) {
  try { const v = getSetting(config, 'memory.auxNumCtx'); return Number.isInteger(v) && v > 0 ? v : 8192 } catch { return 8192 }
}

function splitModelId(full) {
  const i = full.indexOf('/')
  return i === -1 ? { provider: 'ollama', model: full } : { provider: full.slice(0, i), model: full.slice(i + 1) }
}

/**
 * PLACEMENT — the same measured lever as memory.embeddingDevice and memory.resolverDevice, and it matters MORE
 * here now that fallback capture makes this call fire on ordinary turns rather than only tool-less ones.
 *
 * Measured on 2x16GB with the 26.5GB chat model resident: any aux model placed on the GPU does not fit, so
 * Ollama evicts the chat model and the user's NEXT TURN pays ~29s to reload it. Extraction is fire-and-forget
 * off the hot path, so its own latency is invisible while that stall is not — which makes CPU the correct
 * default for exactly the same reason it is correct for the embedder.
 */
function auxDevice(config) {
  try { return getSetting(config, 'memory.extractDevice') === 'gpu' ? 'gpu' : 'cpu' } catch { return 'cpu' }
}
function auxKeepAlive(config) {
  try { const v = getSetting(config, 'memory.extractKeepAlive'); return typeof v === 'string' && v ? v : '30m' } catch { return '30m' }
}

/**
 * TEMPERATURE 0 — MEASURED, and the effect here is larger than it was for the adjudicator.
 *
 * Extraction is STRUCTURED PERCEPTION: its output becomes the ATTRIBUTE, and the attribute IS the slot key.
 * Sampled, the same sentence produced different keys AND — far worse — different DECISIONS. Measured on
 * gemma4:e4b, 5 runs per sentence:
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
 */
function makeFactLlm(fastify, { userId = null } = {}) {
  const { provider, model } = splitModelId(extractModel(fastify.config))
  const options = { stream: false, reasoning: { enabled: false }, max_tokens: 400, numCtx: auxNumCtx(fastify.config), keepAlive: auxKeepAlive(fastify.config), temperature: 0 }
  if (auxDevice(fastify.config) === 'cpu') options.numGpu = 0 // 0 VRAM — never evict the chat model
  return async (prompt) => {
    const res = await chat({
      serverConfig: fastify.config,
      request: { provider, model, messages: [{ role: 'user', content: prompt }], options, userId },
    })
    return res?.message?.content || ''
  }
}

/**
 * factInterpreter — the auto-extractor as an INTERPRETATION-stage interpreter (Memory V3 Phase 2): raw
 * turn → typed Observations. It only PERCEIVES; the pipeline resolves and persists. Facts arrive as the
 * `fact` type (untyped durable fact — this extractor doesn't discriminate preference/biography yet).
 */
function factInterpreter(fastify, { userId = null, source = null } = {}) {
  return async (text) => {
    const facts = await extractFacts({
      llm: makeFactLlm(fastify, { userId }),
      text,
      // A turn gated as a pasted document is COUNTED, not silent. "Extraction found nothing" and
      // "extraction was never asked" look identical from the outside otherwise, and that ambiguity is
      // how the extractor's 4-in-5 silent fact-drop stayed invisible once already.
      onSkip: ({ reason, quotedChars }) => {
        bump('gated_quoted')
        fastify.log?.debug?.({ reason, quotedChars }, 'memory.extract: turn gated as quoted material — no facts taken from a pasted document')
      },
    })
    return facts.map((f) => ({ ...f, owner: f.entity, type: OBSERVATION_TYPE.fact, source }))
  }
}

/**
 * Distill one turn into atomic facts and reconcile them (update-not-append), THROUGH the Observation
 * pipeline (Interpretation → Normalization → commit). Fire-and-forget: returns a summary but is safe to
 * ignore; swallows all errors. No-op when extraction is disabled.
 */
export async function captureFacts(fastify, { userId = null, persona, sourceMessageId = null } = {}, text, { source = null } = {}) {
  if (!extractEnabled(fastify.config) || !text || !String(text).trim()) return { skipped: true }
  try {
    // serializeCommits: this is the AUTOMATIC writer. It shares the store's single serial write lane with the
    // model's own tool writes, so the one-writer invariant holds structurally rather than by luck. (The
    // extraction LLM call stays off the lane — only the commit is serialized.)
    const { pipeline } = buildMemoryPipeline(fastify, { userId, persona, sourceMessageId, serializeCommits: true })
    const { observations, results } = await pipeline.observe(text, [factInterpreter(fastify, { userId, source })])
    if (!observations) return { facts: 0 }
    return { facts: observations, actions: results.map((r) => r.result?.action).filter(Boolean) }
  } catch {
    return { error: true }
  }
}
