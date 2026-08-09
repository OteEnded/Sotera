// Persona Memory V3 — the OBSERVATION PIPELINE (RFC_MEMORY_SLOT_RESOLVER §2). Phase 2: the skeleton.
//
//   raw input (chat turn · document · vision · sensor · REFLECTION output)
//      │
//      ▼ INTERPRETATION   what does this MEAN?  → typed Observation(s) + intent        [observe()]
//      ▼ NORMALIZATION    what does it SAY in canonical language? (never classifies)   [memory-normalize]
//      ▼ OWNER RESOLUTION who is this about? → canonical owner                         [SHIPPED 79aa860]
//      ▼ RESOLUTION       which slot/identity? (router by observation.type)            ┐
//      ▼ CONFLICT         how does it relate to what we know? → a PLAN                 │ `commit`
//      ▼ PERSISTENCE      execute the plan                                             ┘
//
// This module owns ONLY the sequence — it is a responsibility map, not a middleware framework. The last
// three stages are still FUSED inside today's reconcile, so they are reached through ONE injected
// `commit(observation)` seam. That seam is the point: Phase 3 replaces it with a Resolver Router, Phase 4
// splits the ConflictResolver out, Phase 5 extracts the Slot Resolver — each ADDITIVE, none of them
// rewriting this file. Establishing the shape now is what makes those later steps small.
//
// Deps are injected at construction (RFC: timeless interface — no per-call plumbing). PURE orchestration:
// no db, no embedder, no LLM here.

import { makeObservation } from './memory-observation.js'
import { normalizeObservation } from './memory-normalize.js'

/**
 * createObservationPipeline
 * @param {object}   deps
 * @param {(obs:object)=>Promise<any>} deps.commit  OWNER → RESOLUTION → CONFLICT → PERSISTENCE (fused today)
 * @param {(obs:object)=>object} [deps.normalize]   the Normalization stage (override for tests)
 * @param {object|null} [deps.log]                  fastify-style logger (optional)
 */
export function createObservationPipeline({ commit, normalize = normalizeObservation, log = null } = {}) {
  if (typeof commit !== 'function') throw new Error('createObservationPipeline requires a commit(observation) function')

  /**
   * ingest — run ONE observation through the pipeline. A malformed observation is DROPPED here (never
   * throws): perception is probabilistic, so the pipeline's mouth is the right place to reject.
   * @returns {Promise<{ok:boolean, dropped?:true, stage?:string, observation?:object, result?:any, error?:string}>}
   */
  async function ingest(raw) {
    const obs = makeObservation(raw)
    if (!obs) {
      log?.debug?.({ raw }, 'memory.pipeline: observation dropped (no attribute/value)')
      return { ok: false, dropped: true, stage: 'interpretation' }
    }
    const normalized = normalize(obs)
    try {
      const result = await commit(normalized)
      return { ok: result?.ok !== false, stage: 'commit', observation: normalized, result }
    } catch (e) {
      log?.warn?.({ err: e?.message, attribute: normalized.attribute }, 'memory.pipeline: commit failed')
      return { ok: false, stage: 'commit', observation: normalized, error: e?.message || 'commit failed' }
    }
  }

  /**
   * observe — the INTERPRETATION entry: hand raw input to interpreters, each of which returns an
   * observation, an array of them, or null/nothing. Every produced observation then flows through
   * ingest(). This is how ANY observer (extractor, identity, vision, Reflection) joins the pipeline:
   * it just interprets; it never writes.
   *
   * Interpreters run in order and may be async. One throwing interpreter never stops the others.
   * @param {string} text
   * @param {Array<(text:string)=>any>} interpreters
   */
  async function observe(text, interpreters = []) {
    const out = []
    for (const interpret of interpreters) {
      if (typeof interpret !== 'function') continue
      let produced
      try { produced = await interpret(text) } catch (e) {
        log?.warn?.({ err: e?.message }, 'memory.pipeline: interpreter failed (skipped)')
        continue
      }
      for (const o of [].concat(produced ?? [])) {
        if (o) out.push(await ingest(o))
      }
    }
    return { observations: out.length, results: out }
  }

  return { ingest, observe }
}
