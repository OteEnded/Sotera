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
import { partitionMemoryRead } from './memory-decision-record.js'
import { OBSERVATION_TYPE } from '@ote/memory/cognition/memory-observation.js'
import { buildMemoryV2, buildMemoryStoreFor } from './memory-v2-host.js'
import { reachTrace } from './room-scope.js'
import { noteRetrieved } from './memory-retrieval-trace.js'

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
export function buildMemoryPipeline(fastify, { userId = null, persona, sourceMessageId = null, self = null, serializeCommits = false, ask = null, author = 'account' } = {}) {
  const log = fastify?.log ?? null
  // `author` rides through untouched — see buildMemoryV2: authorship follows the OCCASION, so the caller
  // that knows what occasion this is declares it, and everything below stays unaware.
  const mem = buildMemoryV2(fastify, { userId, persona, sourceMessageId, self, author })
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
/**
 * ⭐⭐ REMOVE RECORDED DECISIONS FROM A MEMORY READ, and say how many were removed.
 *
 * ⛔ THE ROW IS NOT TOUCHED. It stays durable, attributable and auditable — that is Ote's whole point:
 * *"I don't want to delete the row simply because it isn't a retained memory. That would sacrifice exactly
 * the auditability I want."* This only stops a DECISION being returned as a MEMORY.
 * ⓘ Shape-preserving: whichever array the read used, the count beside it is corrected to match, so no
 * downstream reader can see a count that disagrees with the list it describes.
 */
/**
 * ⭐⭐⭐ SAY THAT SOMETHING WAS WITHHELD AS CORRECTED — B2's visible half.
 *
 * ⛔ A FILTER NOBODY CAN SEE IS HOW *"I COVERED EVERYTHING"* GETS SAID ABOUT A FILTERED SET, and this
 * project has paid for that twice: two tool calls over one room became *"Nothing about Hermes has EVER
 * been stored"*, and three listed rows became *"exactly those 3 items"* in her whole database.
 * `withheldDecisions` already reports the decline split; corrections get the same discipline.
 *
 * ⭐⭐ AND IT IS A COUNT, NEVER THE CONTENT. That is precisely Ote's constraint — *"I don't want us
 * relying on Sotera correctly interpreting a prose marker"* — satisfied structurally: the repudiated
 * claim is not in her context at all, and a separate integer tells her there is something to ask about.
 * She reaches it deliberately, through `recall_corrections`, or not at all.
 *
 * ⚠️ ZERO IS OMITTED, not reported as `0`. A field that appears on every read stops being read; one that
 * appears only when it means something is a signal.
 */
async function withCorrectionsWithheld(out, store) {
  if (!out || typeof out !== 'object' || Array.isArray(out)) return out
  try {
    const n = await store.countContradicted()
    return n > 0 ? { ...out, withheldCorrections: n } : out
  } catch {
    // ⛔ Best-effort: a failed count must never cost a memory read. Absent means "not measured", which
    // is honest — it does not mean zero, and no caller may read it as zero.
    return out
  }
}

function withoutDecisions(out) {
  if (!out || typeof out !== 'object') return out
  for (const key of ['memories', 'matches', 'items', 'results']) {
    if (!Array.isArray(out[key])) continue
    const { memories, declined } = partitionMemoryRead(out[key])
    if (!declined) return out
    const next = { ...out, [key]: memories, withheldDecisions: declined }
    if (typeof out.count === 'number') next.count = Math.max(0, out.count - declined)
    return next
  }
  return out
}

// ── ⭐⭐⭐ THE WRITE LANE, MADE OBSERVABLE ──────────────────────────────────────────
//
// ⚠⚠ THE MEASURED HAZARD, 2026-08-26. `keep()` returned `{ok:true, queued:true}`, the row never landed
// for **60 seconds**, and **nothing was logged**. The cause turned out to be my own load — 59 CPU-placed
// aux calls had starved the embedder — but Ote's point stands and is the reason this exists:
//
//     *"`ok:true, queued:true` followed by no row for 60 seconds with no logging makes **writer is
//      broken** indistinguishable from **writer is healthy but starved**. We need that distinction
//      before we trust any retention-rate measurement."*
//
// ⭐ So the lane now says when a job STARTS, when it FINISHES, and how long it took. Those three facts
// separate the two cases completely:
//   · enqueued, never started        ⇒ STARVED (something ahead of it, or the embedder is not answering)
//   · started, threw                  ⇒ BROKEN
//   · started, finished, no row       ⇒ REFUSED or DEDUPED — and both of those already say so
//
// ⛔ IT CHANGES NO BEHAVIOUR. Same queue, same fire-and-forget, same swallow — the job is wrapped, not
// rerouted. And it is HOST-side: the lane itself lives in `@ote/memory`, shared with the frozen OLS
// platform, so instrumenting it there would be a cross-project edit for a Sotera measurement.
let writeSeq = 0
const PENDING = new Map() // seq → { label, at }

/** ⭐ What the lane is doing right now. Counts and ages only — ⛔ never content. */
export function writeLaneStats(now = Date.now()) {
  const ages = [...PENDING.values()].map((p) => now - p.at)
  return {
    pending: PENDING.size,
    oldestMs: ages.length ? Math.max(...ages) : 0,
    labels: [...PENDING.values()].map((p) => p.label),
  }
}

/** Wrap one enqueued job so its lifecycle is visible. PURE of behaviour; only observation is added. */
function traced(label, fn, log) {
  const seq = ++writeSeq
  return async () => {
    const started = Date.now()
    PENDING.set(seq, { label, at: started })
    log?.debug?.({ label, seq, pending: PENDING.size }, '[memory.lane] start')
    try {
      const r = await fn()
      const ms = Date.now() - started
      // ⭐ A SLOW WRITE IS REPORTED AT `warn`, because the failure mode this exists for is a write that
      // is technically fine and arrives after everyone has stopped looking.
      const line = { label, seq, ms, pending: PENDING.size - 1 }
      if (ms > 10_000) log?.warn?.(line, '[memory.lane] finished LATE — a measurement taken before this landed would have read as a missing write')
      else log?.debug?.(line, '[memory.lane] done')
      return r
    } catch (e) {
      // ⛔ LOUD, AND DISTINGUISHABLE FROM STARVATION: this one STARTED. The lane's own catch will still
      // swallow it — that is its contract — but it can no longer do so silently.
      log?.warn?.({ label, seq, ms: Date.now() - started, err: e?.message, code: e?.code },
        '[memory.lane] job THREW — the writer ran and failed (this is BROKEN, not starved)')
      throw e
    } finally {
      PENDING.delete(seq)
    }
  }
}

export function buildMemoryToolService(fastify, { userId = null, persona, sourceMessageId = null, self = null, author = 'account' } = {}) {
  const { mem, pipeline } = buildMemoryPipeline(fastify, { userId, persona, sourceMessageId, self, author })
  // ⭐ A read-only store bound to the same scope, for the withheld-corrections count. ⛔ Not the service's
  // store handed out — see `buildMemoryStoreFor`: a consumer that wants a query and no beliefs asks for a
  // store, and everyone else keeps getting a service.
  const readStore = buildMemoryStoreFor(fastify, { userId, persona })
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
    // ⭐⭐ AND THE QUANTIFIER (`coverage`), added 2026-08-20 after the failure was measured in HIS OWN
    // conversation: two tool calls over ONE room became *"Nothing about Hermes has EVER been stored in my
    // memory system"*, and three listed rows became *"exactly those 3 items"* in her whole database.
    // Ote: *"an empty scoped result is being narrated as a global absence… this is data, not another
    // persona instruction."* `matched` is passed in so the trace can state the EXTENT of the set the
    // number describes — see `readCoverage`, which counts nothing outside the search.
    // ⭐⭐⭐ A DECISION IS NOT A MEMORY (2026-08-23). Reflection #111 declined explicitly — *"I'll decline to
    // retain this"* — and `list_memories` returned the resulting record LIVE, so she read it back to Ote as
    // one of four things she has stored. ⭐ Ote: *"keep it durable, but it is NOT a memory… fix the
    // consumers/semantics, rather than changing the underlying representation."*
    // ⇒ filtered HERE, at the host wrapper, for the same reason the reach trace lives here: `@ote/memory` is
    // shared with OteLLMServices and the host owns what the host returns.
    // ⛔ AND THE SPLIT IS REPORTED, never silent — `withheldDecisions` says how many, because a filter nobody
    // can see is how "I covered everything" gets said about a filtered set.
    // ⭐⭐ AND THE READ IS RECORDED — see memory-retrieval-trace.js. What she was SHOWN is the only
    // honest candidate set for "what was this person correcting?", and the only honest answer to "what
    // could this synthesis have rested on?". Both questions were unanswerable because nothing kept the
    // ids: the route's passive recall mapped them to `.content` one line after retrieving them.
    // ⛔ Recording only, in-process, never durable, and it grants no read it did not already have.
    async search(query, opts = {}) {
      const out = await withCorrectionsWithheld(withoutDecisions(await mem.search(query, opts)), readStore)
      noteRetrieved(sourceMessageId, out?.memories ?? out?.matches ?? [], { via: 'recall_memory' })
      return withReach(out, await reachTrace(fastify, { userId, matched: countOf(out) }))
    },
    async list(opts = {}) {
      const out = await withCorrectionsWithheld(withoutDecisions(await mem.list(opts)), readStore)
      return withReach(out, await reachTrace(fastify, { userId, matched: countOf(out) }))
    },
    // ⚠️ `listArchived` WAS NOT WRAPPED BEFORE, AND IT IS ONE OF THE TWO CALLS THAT PRODUCED THE FALSE
    // UNIVERSAL. She called list_memories + list_archived_memories, got nothing from either, and
    // concluded nothing had ever been stored — so the read that fed half that conclusion was the one
    // read carrying no trace at all.
    async listArchived(opts = {}) {
      const out = withoutDecisions(await mem.listArchived(opts))
      return withReach(out, await reachTrace(fastify, { userId, matched: countOf(out), }))
    },
    rememberAsync(opts = {}) {
      if (!opts.content || !String(opts.content).trim()) throw new Error('content is required')
      mem.enqueue('pipeline.remember', traced('remember', () => pipeline.ingest({ ...opts, type: OBSERVATION_TYPE.episodic, source: opts.source ?? 'model-tool' }), fastify?.log))
      return { ok: true, queued: true }
    },
    reconcileFactAsync(opts = {}) {
      const { entity, attribute, value } = opts
      if (!entity || !attribute || value == null || !String(value).trim()) throw new Error('entity, attribute, value are required')
      mem.enqueue('pipeline.reconcileFact', traced('reconcileFact', () => pipeline.ingest({ ...opts, owner: entity, type: OBSERVATION_TYPE.fact, source: opts.source ?? 'model-tool' }), fastify?.log))
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
/**
 * How many rows a memory read returned, whatever shape it used. PURE.
 *
 * ⚠️ Every read here already reports its own `count` (`{count, memories}` / `{count, matches}`), so this
 * TRUSTS that field rather than measuring the truncated page — `list` caps at 1000 and `search` at its own
 * limit, and a coverage number taken from `memories.length` would silently say "3" about a room holding
 * 3000. The fallbacks exist only for a bare array or a shape that predates `count`.
 */
function countOf(out) {
  if (out == null) return 0
  if (typeof out.count === 'number') return out.count
  if (Array.isArray(out)) return out.length
  for (const k of ['memories', 'matches', 'results', 'rows']) if (Array.isArray(out[k])) return out[k].length
  return 0
}

function withReach(out, trace) {
  if (!trace) return out
  if (out && typeof out === 'object' && !Array.isArray(out)) return { ...out, reach: trace }
  // A bare array or scalar still gets the trace, without losing the original value.
  return { result: out, reach: trace }
}
