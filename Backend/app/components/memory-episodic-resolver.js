// Persona Memory V3 — the EPISODIC RESOLVER (RFC_MEMORY_SLOT_RESOLVER §14.1). A router sibling for prose.
//
// An EpisodicObservation is a lived experience, not a slot-shaped claim: a story, a note, a dream summary.
// So "resolution" asks a different question than the Slot Resolver's *which slot?* —
//
//     "have we already got this experience?"
//
// …and the answer is dedup-by-similarity, which `remember()` already implements (DEDUP_THRESHOLD = 0.95:
// a near-identical restatement REINFORCES the existing memory instead of adding a twin, because repetition
// is itself a signal). Its conflict vocabulary is therefore just NOOP/reinforce vs NEW — no supersede,
// because an experience doesn't get overwritten by a later one; it accumulates.
//
// Existing behaviour is reached, not reimplemented: this resolver delegates to `mem.remember()`. What it
// BUYS is the architectural invariant — every source of knowledge (user, tools, imports, reflection,
// dreaming) enters as an Observation and follows exactly ONE path to become committed knowledge.
//
// `mem` is injected at construction (timeless interface), like every other resolver.

/**
 * createEpisodicResolver
 * @param {object} mem  a memory service exposing remember()
 * @param {{log?:object|null}} [opts]
 */
export function createEpisodicResolver(mem, { log = null } = {}) {
  async function commit(obs) {
    const res = await mem.remember({
      content: obs.content,
      // `kind` is the caller's PERSISTENCE hint, passed through untouched ('semantic' prose | 'episodic'
      // event | 'identity' = persona-GLOBAL, a different scope axis). Omitted when absent so the store's
      // own default applies — forcing a kind here would silently re-tier every prose memory.
      ...(obs.kind ? { kind: obs.kind } : {}),
      // prose carries no slot; entity/attribute stay null so it can never be mistaken for a fact row
      // (the slot reconcile already filters on entity && attribute).
      importance: obs.importance ?? null,
      ...(obs.confidence != null ? { confidence: obs.confidence } : {}),
      source: obs.source ?? null,
      namespace: obs.namespace ?? 'default',
      ...(obs.sourceMessageId != null ? { sourceMessageId: obs.sourceMessageId } : {}),
    })
    if (res?.deduped) {
      log?.debug?.({ id: res.id, similarity: res.similarity }, 'memory.episodic: already known — reinforced')
      return { ok: true, action: 'noop', id: res.id, similarity: res.similarity }
    }
    return { ok: true, action: 'add', id: res?.id ?? null }
  }
  return { commit }
}
