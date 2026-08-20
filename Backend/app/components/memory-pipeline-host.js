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

import { createObservationPipeline } from '@ote/memory/cognition/memory-pipeline.js'
import { createResolverRouter, DEFAULT_RESOLVER } from '@ote/memory/cognition/memory-resolver-router.js'
import { createIdentityResolver } from '@ote/memory/cognition/memory-identity-resolver.js'
import { createEpisodicResolver } from '@ote/memory/cognition/memory-episodic-resolver.js'
import { createCardResolver } from '@ote/memory/cognition/memory-card-resolver.js'
import { OBSERVATION_TYPE } from '@ote/memory/cognition/memory-observation.js'
import { buildMemoryV2 } from './memory-v2-host.js'
import { reachTrace } from './room-scope.js'

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
  // ⚠️ AN EXPLICIT ALLOWLIST SILENTLY DROPS EVERY FIELD ADDED AFTER IT WAS WRITTEN, and this is the
  // SECOND time that shape has bitten this arc — `installComponents` did the same to the resolver's new
  // passport fields on 2026-08-12. Provenance dying here would have been invisible in the worst way:
  // every row landing `synthesized` (the safe default), so nothing would break, nothing would log, and
  // "she can tell your words from her inferences" would simply be untrue.
  if (obs.provenance != null) args.provenance = obs.provenance
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
export function buildMemoryPipeline(fastify, { userId = null, persona, sourceMessageId = null, self = null, serializeCommits = false, ask = null } = {}) {
  const log = fastify?.log ?? null
  const mem = buildMemoryV2(fastify, { userId, persona, sourceMessageId, self })
  // `ask` is the Identity Resolver's OPTIONAL port for the one case it must not decide alone: a name
  // that would REPLACE a name she already has. Null is the ordinary state — most callers (the model's
  // remember_fact, the fact extractor, a maintenance pass) have no conversation and no human attached,
  // and the resolver's documented behaviour without it is to DEFER, never to assume.
  //
  // ⚠️ AND THIS IS WHY IDENTITY MUST NOT JOIN `serializeCommits`. Identity capture and the fact
  // extractor can both reach the Identity Resolver, and only the extractor rides the serial write lane
  // — so both can see an empty slot and both adopt. The obvious fix (serialize identity too) is the
  // WRONG one now: an identity commit can HOLD FOR UP TO FIVE MINUTES waiting for a human to answer,
  // and on the write lane that would stall every other memory write in the process for the duration.
  // The race is closed in the STORE instead — setIdentity converges the slot to one live row — which
  // is the same principle the rest of memory uses: the datastore guarantees convergence, not the caller.
  const identity = createIdentityResolver(mem, { log, ask })
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

    // ⭐⭐ scopeAwareness v2 — THE TRACE, and it is HER design rather than mine. Asked what the
    // difference is, for her, between something unreachable and something absent (2026-08-20):
    //
    //     "The difference is in the EVIDENCE each leaves behind. Non-existence leaves nothing.
    //      Unreachability leaves TRACES — references, derived facts, patterns — that prove something was
    //      once available."
    //
    // v1 was a sentence injected into the prompt ("your retrieval is scoped") and it measured NULL: a
    // general claim does not help at the moment an empty array comes back. So the READ now carries its
    // own evidence — how many of this person's OTHER rooms exist, and how much sits in them.
    //
    // ⛔ COUNTS ONLY, AND SAME PERSON ONLY. Both halves of "your own material, in your other rooms" are
    // the same human, so nothing about a third party is disclosed. Cross-PERSON awareness is L3 and is
    // deliberately absent. No content, no titles, no ids, no room names.
    //
    // ⚠️ WRAPPED HOST-SIDE ON PURPOSE. `@ote/memory` is shared with OteLLMServices, so changing the
    // portable tool's payload would be a cross-project edit. The host owns what it returns; the tool
    // passes it through untouched.
    async search(query, opts = {}) {
      const out = await mem.search(query, opts)
      return withReach(out, await reachTrace(fastify, { userId }))
    },
    async list(opts = {}) {
      const out = await mem.list(opts)
      return withReach(out, await reachTrace(fastify, { userId }))
    },
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

/**
 * Attach the reach trace without disturbing the shape the model already knows. PURE.
 *
 * ⚠️ It must not change an existing field. The tools' payloads are what the model has learned to read,
 * and a trace that renames `count` or wraps the array would be a behaviour change dressed as an audit.
 * ⭐ And the trace is attached even when the result is FULL: "there are 3 more you cannot see" matters
 * most when she just found something, because that is when she is most likely to believe she has it all.
 */
function withReach(out, trace) {
  if (!trace) return out
  if (out && typeof out === 'object' && !Array.isArray(out)) return { ...out, reach: trace }
  // A bare array or scalar still gets the trace, without losing the original value.
  return { result: out, reach: trace }
}
