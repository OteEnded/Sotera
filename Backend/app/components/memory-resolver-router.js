// Persona Memory V3 — the RESOLVER ROUTER (RFC_MEMORY_SLOT_RESOLVER §8). Phase 3.
//
// Ote's architectural point: the Identity Resolver must not be special FOREVER. All resolvers sit behind
// one contract and a router picks the implementation by observation type, so:
//
//     THE PIPELINE NEVER CHANGES. ONLY THE RESOLVER MAP GROWS.
//
//     route(observation.type):
//        identity                 → IdentityResolver   (reserved identity namespace, confirm policy)
//        preference | biography   → default            (semantic slots — the cosine→llm→ontology line)
//        relationship | …         → (future siblings, added to the map — nothing else changes)
//        default                  → the semantic resolver
//
// Day-one map is deliberately just { identity, default } — a sibling appears only when a type earns one.
// This reconciles "identity is first-class" with "resolvers are siblings": identity's INTERFACE is a
// sibling; its implementation and domain are special.
//
// HONEST SCOPE (Phase 3): the handlers behind this router still perform resolution + conflict +
// persistence FUSED (that is what today's reconcileFact / identity slot write do). What is frozen here is
// the ROUTER's contract — one entry point, keyed on type. Phase 4 splits the ConflictResolver out of the
// handlers, Phase 5 extracts the classification-only Slot Resolver. Neither touches this file.
//
// PURE: no db, no embedder — handlers are injected at construction.

export const DEFAULT_RESOLVER = 'default'

/**
 * createResolverRouter
 * @param {object} deps
 * @param {Record<string, (obs:object)=>Promise<any>>} deps.handlers  observation type → handler; must
 *        include `default`. Keys are OBSERVATION_TYPE values (plus 'default').
 * @param {object|null} [deps.log]
 * @returns {{ commit:(obs:object)=>Promise<any>, route:(obs:object)=>string|null, handlerNames:()=>string[] }}
 */
export function createResolverRouter({ handlers = {}, log = null } = {}) {
  if (typeof handlers[DEFAULT_RESOLVER] !== 'function') {
    throw new Error(`createResolverRouter requires a "${DEFAULT_RESOLVER}" handler`)
  }

  /** PURE: which handler WOULD take this observation (exposed so routing is testable on its own). */
  function route(obs) {
    const t = obs?.type
    return t && typeof handlers[t] === 'function' ? t : DEFAULT_RESOLVER
  }

  /** The pipeline's commit seam: dispatch one observation to its resolver. */
  async function commit(obs) {
    const name = route(obs)
    log?.debug?.({ type: obs?.type, resolver: name, attribute: obs?.attribute }, 'memory.router: dispatch')
    return handlers[name](obs)
  }

  return { commit, route, handlerNames: () => Object.keys(handlers) }
}
