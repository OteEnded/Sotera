// Persona Memory V3 — identity capture host (RFC_MEMORY_SLOT_RESOLVER §5/§7 · RFC_MEMORY_AS_COMPONENT §3).
//
// Phase 3 made this an ENTRY POINT. Identity travels the SAME Observation pipeline as everything else —
// the only difference is that the Resolver Router hands an `identity`-typed observation to the Identity
// Resolver instead of the semantic slot path:
//
//   text → INTERPRETATION → Normalization → Router → IdentityResolver → slot
//
// That is the payoff of the pipeline: no parallel write path, no special-case plumbing. The adoption
// policy (adopt / noop / defer) lives in the Identity Resolver; only the recognition lives here.
//
// ── STEP 4 (2026-08-12): INTERPRETATION IS NOW A MODEL, WITH THE PATTERNS UNDERNEATH ────────────────
//
// MEASURED 2026-08-10 across nine languages, the regex captured in ONE — English. Thai, Japanese,
// Chinese, Korean, Spanish, French and German all returned nothing, and Ote writes Thai. So the order
// inverted: `interpretIdentityLlm` reads the turn first, and `interpretIdentity` (the English patterns)
// is the FLOOR beneath it — used when the model is off, unavailable, or silent.
//
// ⚠️ THE FLOOR IS NOT DECORATION AND MUST NOT BE REMOVED HERE. RFC step 5 deletes it, and only after
// step 4 is proven in Thai against a live model — otherwise the window between "regex gone" and "model
// works" is exactly the regression Ote lived through. `identity-multilingual-check.mjs` is that proof.
//
// Fire-and-forget, off the hot path — never blocks or breaks a reply. Identity owns its own slot
// (reconcileFact excludes IDENTITY_NAMESPACE), so it runs independently of the generic one-writer rule:
// no race with the model's memory writes. The runtime owns identity — deterministic truth in services.

import { interpretIdentity } from '@ote/memory/cognition/memory-identity.js'
import { interpretIdentityLlm } from '@ote/memory/cognition/memory-identity-llm.js'
import { buildMemoryPipeline } from './memory-pipeline-host.js'
import { OBSERVATION_TYPE } from '@ote/memory/cognition/memory-observation.js'
import { makeAuxLlm, extractModel } from './memory-aux-llm-host.js'
import { getSetting } from '../settings/index.js'

export function identityEnabled(config) {
  try { return getSetting(config, 'memory.identityEnabled') !== false } catch { return true }
}
export function identityLlmEnabled(config) {
  try { return getSetting(config, 'memory.identityLlm') !== false } catch { return true }
}

/**
 * Which model interprets the naming act. Empty setting = FOLLOW memory.extractModel, resolved HERE at
 * read time rather than as a config-default chain — a chain reads config.json and cannot see a DB
 * override, which is how the episode distiller once ran gemma while extraction ran qwen.
 */
export function identityModel(config) {
  try { return getSetting(config, 'memory.identityModel') || extractModel(config) } catch { return extractModel(config) }
}

/**
 * identityInterpreter — recognition as an INTERPRETATION-stage interpreter: raw turn → a typed identity
 * Observation (or nothing). It only PERCEIVES; the pipeline resolves and persists.
 *
 * Two interpreters, one seam. The model runs first because it is the one that speaks more than English;
 * the patterns run only when it produced nothing, which covers the model being disabled, unreachable,
 * mid-load, or simply unsure. Both emit the same observation shape, so nothing downstream knows or
 * cares which one spoke — `via` records it for telemetry, not for behaviour.
 */
export function identityInterpreter(fastify, { source = null, userId = null, requireCue = true, llm: injected } = {}) {
  // The SWITCH is authoritative and the injection only replaces HOW the model is reached — so passing an
  // `llm` cannot turn identity interpretation back on behind memory.identityLlm=false. (`injected` is a
  // seam, not a back door: ESM exports are read-only live bindings, so a test cannot substitute `chat()`
  // by mocking the module, and a seam that only exists in tests would not be the code path that ships.)
  const useLlm = fastify && identityLlmEnabled(fastify.config)
  const llm = !useLlm
    ? null
    : (injected !== undefined
      ? injected
      // 200 tokens: the reply is one small JSON object. Extraction's 400 buys nothing here and a smaller
      // budget is a smaller stall if this ever lands on a busy aux model.
      : makeAuxLlm(fastify, { modelId: identityModel(fastify.config), maxTokens: 200, userId }))

  return async (text) => {
    let o = null
    if (llm) {
      o = await interpretIdentityLlm({
        llm,
        text,
        requireCue,
        // A turn NOT interpreted is logged with WHY. "no cue" (never asked), "no act" (asked, the model
        // said no) and "llm-failed" (asked, nothing came back) are three different facts about the same
        // silence, and only the third is a problem — which is invisible if they all log as nothing.
        onSkip: ({ reason, detail }) => fastify.log?.debug?.({ reason, detail }, 'memory.identity: turn not interpreted'),
      })
    }
    // THE FLOOR. English patterns, high precision, no model needed. Deleted by RFC step 5 — not before.
    if (!o) {
      o = interpretIdentity(text)
      if (o) o.via = 'regex'
    }
    if (!o) return null
    return { ...o, type: OBSERVATION_TYPE.identity, source, context: { matched: o.matched, via: o.via } }
  }
}

/**
 * captureIdentity — interpret one user turn and let the pipeline adopt/defer identity. Fire-and-forget:
 * returns a small summary but is safe to ignore; swallows all errors. Skips when identity capture is
 * disabled or there is no user to scope to (root/anonymous — their name is config/username-driven).
 *
 * @param {{requireCue?:boolean}} [opts.requireCue]  false = interpret even with no naming cue in the
 *   turn. For the ASK's held turn (step 5): when SHE asked "what should I call you?", the answer is an
 *   answer — "โอต" alone carries no cue and would otherwise never be read.
 * @returns {Promise<{skipped?:true, identity?:boolean, action?:string, value?:string, from?:string, to?:string, error?:true}>}
 */
export async function captureIdentity(fastify, { userId = null, persona, sourceMessageId = null } = {}, text, { source = null, requireCue = true } = {}) {
  if (!identityEnabled(fastify.config) || !userId || !text || !String(text).trim()) return { skipped: true }
  try {
    const { pipeline } = buildMemoryPipeline(fastify, { userId, persona, sourceMessageId })
    const { results } = await pipeline.observe(text, [identityInterpreter(fastify, { source, userId, requireCue })])
    const r = results[0]
    if (!r) return { identity: false } // nothing name-like in this turn
    if (!r.ok) return { error: true }
    const { ok: _ok, ...outcome } = r.result || {} // the resolver's verdict: action + value/from/to
    return { identity: true, ...outcome, via: r.observation?.context?.via ?? null }
  } catch (e) {
    try { fastify.log?.warn?.({ err: e?.message }, 'memory.identity: capture failed (best-effort)') } catch { /* no logger */ }
    return { error: true }
  }
}
