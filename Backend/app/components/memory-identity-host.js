// Persona Memory V3 — identity capture host (RFC_MEMORY_SLOT_RESOLVER §5/§7).
//
// Phase 3: this is now just an ENTRY POINT. Identity travels the SAME Observation pipeline as everything
// else — the only difference is that the Resolver Router hands an `identity`-typed observation to the
// Identity Resolver instead of the semantic slot path:
//
//   text → interpretIdentity (INTERPRETATION) → Normalization → Router → IdentityResolver → slot
//
// That is the payoff of the pipeline: no parallel write path, no special-case plumbing. The adoption
// policy (adopt / noop / defer) lives in the Identity Resolver, the recognition in interpretIdentity.
//
// Fire-and-forget, off the hot path — never blocks or breaks a reply. Identity owns its own slot
// (reconcileFact excludes IDENTITY_NAMESPACE), so it runs independently of the generic one-writer rule:
// no race with the model's memory writes. The runtime owns identity — deterministic truth in services.

import { interpretIdentity } from './memory-identity.js'
import { buildMemoryPipeline } from './memory-pipeline-host.js'
import { OBSERVATION_TYPE } from './memory-observation.js'
import { getSetting } from '../settings/index.js'

export function identityEnabled(config) {
  try { return getSetting(config, 'memory.identityEnabled') !== false } catch { return true }
}

/**
 * identityInterpreter — recognition as an INTERPRETATION-stage interpreter: raw turn → a typed identity
 * Observation (or nothing). It only PERCEIVES; the pipeline resolves and persists.
 */
export function identityInterpreter({ source = null } = {}) {
  return (text) => {
    const o = interpretIdentity(text)
    if (!o) return null
    return { ...o, type: OBSERVATION_TYPE.identity, source, context: { matched: o.matched } }
  }
}

/**
 * captureIdentity — interpret one user turn and let the pipeline adopt/defer identity. Fire-and-forget:
 * returns a small summary but is safe to ignore; swallows all errors. Skips when identity capture is
 * disabled or there is no user to scope to (root/anonymous — their name is config/username-driven).
 *
 * @returns {Promise<{skipped?:true, identity?:boolean, action?:string, value?:string, from?:string, to?:string, error?:true}>}
 */
export async function captureIdentity(fastify, { userId = null, persona, sourceMessageId = null } = {}, text, { source = null } = {}) {
  if (!identityEnabled(fastify.config) || !userId || !text || !String(text).trim()) return { skipped: true }
  try {
    const { pipeline } = buildMemoryPipeline(fastify, { userId, persona, sourceMessageId })
    const { results } = await pipeline.observe(text, [identityInterpreter({ source })])
    const r = results[0]
    if (!r) return { identity: false } // nothing name-like in this turn
    if (!r.ok) return { error: true }
    const { ok: _ok, ...outcome } = r.result || {} // the resolver's verdict: action + value/from/to
    return { identity: true, ...outcome }
  } catch (e) {
    try { fastify.log?.warn?.({ err: e?.message }, 'memory.identity: capture failed (best-effort)') } catch { /* no logger */ }
    return { error: true }
  }
}
