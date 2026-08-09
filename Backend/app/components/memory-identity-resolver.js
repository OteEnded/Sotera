// Persona Memory V3 — the IDENTITY RESOLVER (RFC_MEMORY_SLOT_RESOLVER §7). Phase 3.
//
// A sibling behind the same router contract as the semantic resolver, but with its OWN domain (the
// reserved identity namespace) and its own POLICY — because identity asks different questions than a
// preference does: does this redefine who the user is? does it change how we address them? should we
// confirm first?
//
// ADOPTION POLICY (Ote's ruling — discovery vs preference):
//   empty slot        → adopt   — the system simply LEARNED who the user is; store silently.
//   same value        → noop    — already known (the store is idempotent; no duplicate row).
//   different value   → defer   — a CHANGE to how we address someone. Never silently overwritten; this
//                                 is the ASK_CONFIRM case, which becomes a real held-turn confirmation
//                                 when the ConflictResolver's ASK lands (Phase 4).
// The decision itself is the pure `identityPlan`; this module is the persistence side of it.
//
// `mem` is injected at construction (timeless interface). Fused for now: it resolves the slot AND writes.
// Phase 4 hands the plan to a ConflictResolver instead of deciding inline here.

import { identityPlan } from './memory-identity.js'

/**
 * createIdentityResolver
 * @param {object} mem  a memory service exposing get/setIdentity (memory-v2-service)
 * @param {{log?:object|null}} [opts]
 * @returns {{ commit:(obs:object)=>Promise<{ok:true, action:'adopted'|'noop'|'deferred', value?:string, from?:string, to?:string}> }}
 */
export function createIdentityResolver(mem, { log = null } = {}) {
  async function commit(obs) {
    const current = await mem.getIdentity({ attribute: obs.attribute })
    const plan = identityPlan(current?.value ?? null, obs)

    if (plan.action === 'noop') return { ok: true, action: 'noop', value: obs.value }

    if (plan.action === 'defer') {
      log?.info?.({ from: plan.from, to: obs.value, intent: obs.intent }, 'memory.identity: change deferred (ASK not yet wired) — address left unchanged')
      return { ok: true, action: 'deferred', from: plan.from, to: obs.value }
    }

    await mem.setIdentity({ attribute: obs.attribute, value: obs.value, confidence: obs.confidence, source: obs.source })
    log?.info?.({ attribute: obs.attribute, value: obs.value, intent: obs.intent, confidence: obs.confidence }, 'memory.identity: adopted (empty slot)')
    return { ok: true, action: 'adopted', value: obs.value }
  }
  return { commit }
}
