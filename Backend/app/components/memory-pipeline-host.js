// Persona Memory V3 — host wiring for the Observation pipeline (Phase 2). Binds the pure pipeline to a
// real per-(persona,user) memory service and supplies the `commit` seam.
//
// COMMIT is the pipeline's tail: OWNER RESOLUTION → RESOLUTION → CONFLICT → PERSISTENCE. Phase 2 named
// the seam; PHASE 3 fills it with a RESOLVER ROUTER that dispatches on observation.type —
//   identity → IdentityResolver (reserved namespace + confirm policy) · default → the semantic slot path
// — so every observer (extractor, identity, later vision/Reflection) travels ONE pipeline and only the
// resolver map differs. Owner/conflict/persistence are still fused inside the handlers; Phase 4 splits
// the ConflictResolver out and Phase 5 extracts the classification-only Slot Resolver, both WITHOUT
// touching the pipeline or its callers.

import { createObservationPipeline } from './memory-pipeline.js'
import { createResolverRouter, DEFAULT_RESOLVER } from './memory-resolver-router.js'
import { createIdentityResolver } from './memory-identity-resolver.js'
import { createEpisodicResolver } from './memory-episodic-resolver.js'
import { createCardResolver } from './memory-card-resolver.js'
import { OBSERVATION_TYPE } from './memory-observation.js'
import { buildMemoryV2 } from './memory-v2-host.js'

/**
 * commitToMemory — the fused Owner→Resolution→Conflict→Persistence tail (today: reconcileFact).
 * Maps the observation's vocabulary onto the store's, and deliberately OMITS null-valued optionals so
 * the service's own defaults still apply (e.g. capture-time confidence for a fact) — passing null would
 * override them, which would be a silent behaviour change.
 */
export function commitToMemory(mem, obs) {
  const args = { entity: obs.owner || undefined, attribute: obs.attribute, value: obs.value }
  if (obs.importance != null) args.importance = obs.importance
  if (obs.confidence != null) args.confidence = obs.confidence
  if (obs.source != null) args.source = obs.source
  if (obs.namespace != null) args.namespace = obs.namespace
  return mem.reconcileFact(args)
}

/**
 * buildMemoryPipeline — a pipeline bound to this caller's memory scope, with the Resolver Router as its
 * commit seam. The router map is the ONLY thing that grows as new observation types earn a resolver.
 *
 * `serializeCommits` closes the last hole in the ONE-WRITER invariant. Model-tool writes ride the store's
 * SERIAL queue, but the automatic path (captureFacts) used to call the pipeline directly — so the two were
 * only *incidentally* exclusive, and any future overlap would have re-created the 2026-07-24 race. With this
 * flag each COMMIT is enqueued onto the same single lane.
 *
 * It serializes the COMMIT, deliberately not the whole ingest: interpretation includes an extraction LLM
 * call, and holding the write lane across that would stall every other write for seconds. And it must stay
 * OPT-IN — the tool path already enqueues the entire ingest, so enqueueing again inside an enqueued function
 * would make that function wait on its own queue slot: a deadlock, not a slowdown.
 * @returns {{ mem: object, pipeline: { ingest:Function, observe:Function }, router: object }}
 */
export function buildMemoryPipeline(fastify, { userId = null, persona, sourceMessageId = null, self = null, serializeCommits = false } = {}) {
  const log = fastify?.log ?? null
  const mem = buildMemoryV2(fastify, { userId, persona, sourceMessageId, self })
  const identity = createIdentityResolver(mem, { log })
  const episodic = createEpisodicResolver(mem, { log })
  const card = createCardResolver(mem, { log })
  const router = createResolverRouter({
    handlers: {
      [OBSERVATION_TYPE.identity]: (obs) => identity.commit(obs),
      // prose experiences (stories, notes, dream summaries) — dedup-by-similarity, never supersede
      [OBSERVATION_TYPE.episodic]: (obs) => episodic.commit(obs),
      // consolidated topic summaries from Dreaming/Reflection — supersede the prior card, archive evidence
      [OBSERVATION_TYPE.card]: (obs) => card.commit(obs),
      // semantic slots (preference / biography / relationship / untyped `fact`) — today's reconcile
      [DEFAULT_RESOLVER]: (obs) => commitToMemory(mem, obs),
    },
    log,
  })
  const commit = serializeCommits
    ? (obs) => mem.enqueue('pipeline.commit', () => router.commit(obs))
    : router.commit
  const pipeline = createObservationPipeline({ commit, log })
  return { mem, pipeline, router }
}

/**
 * buildMemoryToolService — the `memory.v2` host service the MODEL's memory tools bind to (Phase 5.5).
 *
 * It is the ordinary memory service with ONE change: `reconcileFactAsync` (behind the remember_fact tool)
 * now travels the OBSERVATION PIPELINE instead of calling the store directly. That closes the last
 * non-pipeline writer, which is what makes the rule true in practice:
 *
 *     IDENTITY IS ROUTED BY SEMANTICS, NOT BY ORIGIN.
 *
 * Before this, the model saying remember_fact("name", "Ripley") minted a GENERIC slot while a
 * conversational "I'm Ripley" landed in the identity namespace — one concept, two rows, differing only by
 * who observed it. Now Interpretation types the claim and both converge on the IdentityResolver.
 *
 * The tool contract is UNCHANGED (the portable @ote/memory component keeps calling reconcileFactAsync),
 * and the write stays fire-and-forget on the store's SERIAL queue — validation is still synchronous so a
 * bad tool call returns a retryable error to the model.
 */
export function buildMemoryToolService(fastify, { userId = null, persona, sourceMessageId = null, self = null } = {}) {
  const { mem, pipeline } = buildMemoryPipeline(fastify, { userId, persona, sourceMessageId, self })
  return {
    ...mem,
    rememberAsync(opts = {}) {
      if (!opts.content || !String(opts.content).trim()) throw new Error('content is required')
      mem.enqueue('pipeline.remember', () => pipeline.ingest({ ...opts, type: OBSERVATION_TYPE.episodic, source: opts.source ?? 'model-tool' }))
      return { ok: true, queued: true }
    },
    reconcileFactAsync(opts = {}) {
      const { entity, attribute, value } = opts
      if (!entity || !attribute || value == null || !String(value).trim()) throw new Error('entity, attribute, value are required')
      mem.enqueue('pipeline.reconcileFact', () => pipeline.ingest({ ...opts, owner: entity, type: OBSERVATION_TYPE.fact, source: opts.source ?? 'model-tool' }))
      return { ok: true, queued: true }
    },
  }
}
