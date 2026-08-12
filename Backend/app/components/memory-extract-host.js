// Persona Memory v2 — host wiring for fact extraction. Builds the injected `llm(prompt) → text`
// over the platform chat gateway (so extraction is metered + provider-agnostic like any other
// internal LLM call — title/summary use the same `chat()`), and a one-shot `captureFacts` that
// runs the full extract→reconcile pipeline for one turn. Meant to be called FIRE-AND-FORGET off the
// hot path — it never blocks or breaks a reply.
//
// The LLM construction itself (placement · keep-alive · window · temperature 0, all measured) moved to
// memory-aux-llm-host.js on 2026-08-12, when identity interpretation became a second consumer needing
// byte-identical behaviour with a different model and token budget.

import { getSetting } from '../settings/index.js'
import { extractFacts } from '@ote/memory/cognition/memory-extract.js'
import { buildMemoryPipeline } from './memory-pipeline-host.js'
import { OBSERVATION_TYPE } from '@ote/memory/cognition/memory-observation.js'
import { bump } from '@ote/memory/cognition/memory-capture-telemetry.js'
import { makeAuxLlm, extractModel } from './memory-aux-llm-host.js'

export { extractModel }

export function extractEnabled(config) {
  try { return getSetting(config, 'memory.extractEnabled') !== false } catch { return true }
}

const makeFactLlm = (fastify, { userId = null } = {}) => makeAuxLlm(fastify, { maxTokens: 400, userId })

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
