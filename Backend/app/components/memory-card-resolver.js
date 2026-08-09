// Persona Memory V3 — the CARD RESOLVER (RFC_MEMORY_SLOT_RESOLVER §14). A router sibling for consolidated
// topic summaries proposed by Dreaming / Reflection.
//
// Its question is neither "which slot?" (Slot Resolver) nor "have we got this experience?" (Episodic
// Resolver) but:
//
//     "which existing card is this a NEW VERSION of?"
//
// …answered by the members' centroid against the live cards (`mem.findPriorCard`), which is AUTHORITATIVE.
// The Dreaming observer also peeks at the prior card, but only to give the LLM the existing summary as
// context for merging — that is reading, not deciding. If the two ever disagree, the resolver wins.
//
// Conflict vocabulary: SUPERSEDE when a prior card exists (the new version replaces it, history kept via
// the supersedes chain) else NEW. Persistence (`mem.commitCard`) also soft-archives the evidence members,
// because the card now represents them in recall.
//
// `mem` is injected at construction, like every other resolver. This resolver is what turns Dreaming from
// a direct writer into an OBSERVER — the last non-pipeline write path in the system.

/**
 * createCardResolver
 * @param {object} mem  a memory service exposing commitCard()
 * @param {{log?:object|null}} [opts]
 */
export function createCardResolver(mem, { log = null } = {}) {
  async function commit(obs) {
    const res = await mem.commitCard({
      topic: obs.topic,
      summary: obs.content,
      memberIds: obs.memberIds || [],
      namespace: obs.namespace ?? null,
    })
    log?.info?.(
      { card: res.id, topic: res.topic, evolved: res.evolved, archived: res.archived },
      res.evolved ? 'memory.card: EVOLVED an existing card (superseded)' : 'memory.card: minted a new card',
    )
    return { ok: true, action: res.evolved ? 'supersede' : 'add', id: res.id, topic: res.topic, archived: res.archived, evolved: res.evolved, evidence: res.evidence }
  }
  return { commit }
}
