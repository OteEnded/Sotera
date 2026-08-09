// Persona Memory V3 — DREAMING (offline consolidation) as an OBSERVER (RFC §14). The last write path to
// come inside the pipeline.
//
// Dreaming was never missing capability — ~70% already shipped as `consolidate()`: cluster live episodics,
// have an LLM induce one Knowledge Card per topic, supersede the prior card, archive the members. What was
// wrong was ARCHITECTURAL:
//
//     before:  Dream → Memories.create()            ← a non-pipeline writer
//     now:     Dream → Observation → Pipeline       ← the LLM proposes; the pipeline decides
//
// So this module PERCEIVES only: it retrieves, clusters, asks the LLM to summarise, and emits a
// CardObservation per topic. It never writes. Resolution (which card does this supersede?) belongs to the
// CardResolver and persistence to `commitCard`. That yields the invariant this whole RFC was built toward:
//
//     Every source of knowledge — user, tools, imports, reflection, or dreaming — enters the system as an
//     Observation and follows exactly ONE path to become committed knowledge.
//
// LOOP SAFETY (§14.2): every emitted observation is stamped `source: 'dreaming'` so an observer never
// re-consumes its own output, and the store is idempotent. `commitCard` also soft-expires the members it
// summarised, so the same episodics cannot re-cluster on the next pass.
//
// PURE-ish orchestration: `mem`, `llm` and `ingest` are all injected, so this runs identically from a
// nightly schedule, an admin trigger, or an eval harness — and a dry run simply doesn't ingest.

import { buildCardPrompt, parseCard } from './memory-consolidate.js'

/**
 * runDream — one consolidation pass over a single (persona, user) scope.
 *
 * @param {object}   deps
 * @param {object}   deps.mem                memory service (episodeClusters, findPriorCard)
 * @param {(p:string)=>Promise<string>} deps.llm  the induction model
 * @param {(obs:object)=>Promise<any>} [deps.ingest]  the pipeline's ingest — REQUIRED unless dryRun
 * @param {number}   [deps.minSize]          minimum episodics to form a topic
 * @param {number}   [deps.threshold]        clustering similarity floor
 * @param {number}   [deps.maxCards]         cap per pass
 * @param {boolean}  [deps.dryRun]           perceive + propose, ingest NOTHING
 * @param {object|null} [deps.log]
 * @returns {Promise<{ok:true, clusters:number, cards:object[]}>}
 */
export async function runDream({ mem, llm, ingest = null, minSize = 4, threshold = 0.55, maxCards = 5, dryRun = false, log = null } = {}) {
  if (typeof llm !== 'function') throw new Error('runDream requires an llm(prompt)→text function')
  if (!dryRun && typeof ingest !== 'function') throw new Error('runDream requires an ingest(observation) function (or dryRun)')

  const clusters = await mem.episodeClusters({ minSize, threshold, maxCards })
  const cards = []

  for (const members of clusters) {
    const memberIds = members.map((m) => m.id)
    // READ the existing card for this topic — context so the LLM can MERGE rather than restate. This is
    // reading knowledge, not deciding: the CardResolver re-resolves it authoritatively at commit time.
    const prior = await mem.findPriorCard(memberIds)
    let card = null
    try { card = parseCard(await llm(buildCardPrompt(members, { existingCard: prior?.content || null }))) } catch { card = null }
    if (!card) { log?.debug?.({ members: memberIds.length }, 'memory.dream: induction produced no usable card — skipped'); continue }

    if (dryRun) {
      cards.push({ topic: card.topic, summary: card.summary, members: members.length, evolves: prior?.id ?? null, dryRun: true })
      continue
    }

    // PROPOSE. Everything after this point is the pipeline's decision, not ours.
    const r = await ingest({
      type: 'card',
      topic: card.topic,
      summary: card.summary,
      memberIds,
      namespace: members[0]?.namespace ?? null,
      source: 'dreaming', // loop guard: an observer never re-consumes its own output
      context: { evolves: prior?.id ?? null, clusterSize: members.length },
    })
    if (r?.ok) cards.push({ id: r.result?.id ?? null, topic: card.topic, summary: card.summary, archived: r.result?.archived ?? members.length, evolved: !!r.result?.evolved, evidence: r.result?.evidence ?? null })
    else log?.warn?.({ topic: card.topic, error: r?.error }, 'memory.dream: card observation was not committed')
  }

  return { ok: true, clusters: clusters.length, cards }
}
