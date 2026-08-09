// Persona Memory V3 — host wiring for the RESOLVER CHAIN (RFC §15). Reads the settings, builds
// cosine → gray-zone, and hands the store one object satisfying the ordinary `Resolver` contract.
//
// SETTINGS (Ote's calls — configurable, never hardcoded):
//   memory.resolverModel            SEPARATE from memory.extractModel. Extraction PARSES observations; the
//                                   resolver ADJUDICATES ambiguity. Different responsibilities that may
//                                   diverge, so they get their own knobs — defaulting to the same value today.
//   memory.resolver.grayZoneMode    'off' (default) | 'shadow' | 'on'
//   memory.resolver.grayZone.min    band floor    (default 0.70)
//   memory.resolver.grayZone.max    band ceiling  (default 0.85)
//   memory.resolver.tieThreshold    near-tie epsilon (default 0.02)
// Today's measurements are DEFAULTS, not constants: they must evolve with the embedder and the model.

import { chat } from '../chat-runtime/index.js'
import { getSetting } from '../settings/index.js'
import { createCosineSlotResolver, SLOT_SEM_THRESHOLD } from './memory-slot-resolver.js'
import { createGrayZoneResolver, GRAY_ZONE_MODE } from './memory-grayzone-resolver.js'
import { extractModel } from './memory-extract-host.js'

const DEFAULTS = { min: 0.70, max: 0.85, tie: 0.02 }

// CONFIG READS FAIL FAST (Ote's rule, learned the hard way here): `getSetting` THROWS on an UNDECLARED key,
// and a blanket try/catch around it makes a wiring mistake indistinguishable from an intentional default —
// which is exactly how these four settings shipped unreachable. So we do NOT swallow that error. The
// declared defaults live in SETTING_DEFS (one source of truth); the only thing handled here is a value the
// validator would have rejected, which cannot normally happen.
//   • missing/undeclared key → THROW (a programming error, and it should be loud)
//   • declared optional value → explicit default, from SETTING_DEFS

/** The resolver's aux model. Its SETTING_DEFS default already chains to memory.extractModel. */
export function resolverModel(config) {
  return getSetting(config, 'memory.resolverModel') || extractModel(config)
}
/**
 * RESIDENCY (Ote's call: "infrastructure optimization first, architecture second") — measured, not assumed.
 *
 * On a 2x16GB box with a 26.5GB chat model resident, a GPU adjudication is fast (~391ms warm) but its 5.6GB
 * DOES NOT FIT, so Ollama evicts the chat model and the user's NEXT TURN pays ~29s to reload it. On CPU the
 * same adjudicator answers in ~0.7-3s at 0 VRAM and the chat model is never touched. Adjudication is
 * fire-and-forget on a serial background queue, so its own latency is NOT on the user's turn while the
 * eviction it causes IS — which makes CPU the correct default. keep_alive then avoids re-paying the ~12s
 * cold load for a burst of gray-zone cases, and is only safe to hold BECAUSE the model sits in RAM.
 * Same lever, same reasoning, same defaults as memory.embeddingDevice/embeddingKeepAlive.
 */
export function resolverDevice(config) {
  return getSetting(config, 'memory.resolverDevice') === 'gpu' ? 'gpu' : 'cpu'
}
export function resolverKeepAlive(config) {
  const v = getSetting(config, 'memory.resolverKeepAlive')
  return typeof v === 'string' && v ? v : '30m'
}
export function grayZoneMode(config) {
  const v = getSetting(config, 'memory.resolver.grayZoneMode')
  return Object.values(GRAY_ZONE_MODE).includes(v) ? v : GRAY_ZONE_MODE.off
}
export function grayZoneBand(config) {
  const num = (key, dflt) => {
    const v = getSetting(config, key)
    return typeof v === 'number' && v > 0 && v <= 1 ? v : dflt
  }
  const min = num('memory.resolver.grayZone.min', DEFAULTS.min)
  const max = num('memory.resolver.grayZone.max', DEFAULTS.max)
  return { min: Math.min(min, max), max: Math.max(min, max), tie: num('memory.resolver.tieThreshold', DEFAULTS.tie) }
}

/**
 * The cosine arm's SELF-RESOLVE threshold — how much of the gray band the cheap arm keeps for itself.
 *
 * This was `SLOT_SEM_THRESHOLD = 0.8`, a hardcoded constant surrounded by settings, which is precisely why
 * it never came up while the band was being tuned. It is the most consequential number in the chain: the
 * gray-zone resolver only runs when cosine FAILED to resolve, so everything at or above this value is
 * decided by cosine alone and the qualified adjudicator never sees it. Three real bad merges on root's
 * memory (0.82 / 0.84 / 0.84) all sat above 0.80 — the LLM was on, paid for, and never asked.
 */
export function slotSemThreshold(config) {
  const v = getSetting(config, 'memory.resolver.slotSemThreshold')
  return typeof v === 'number' && v > 0 && v <= 1 ? v : SLOT_SEM_THRESHOLD
}

function splitModelId(full) {
  const i = full.indexOf('/')
  return i === -1 ? { provider: 'ollama', model: full } : { provider: full.slice(0, i), model: full.slice(i + 1) }
}

/**
 * The aux LLM for adjudication. The answer is one word, but the budget is NOT 8 tokens: measured on a
 * ground-truthed corpus, a model that opens with a short preamble got TRUNCATED before reaching its verdict
 * (gpt-oss:20b produced 12/12 unparseable answers at max_tokens 8). 32 is still tiny and removes that whole
 * failure mode; a model that still cannot answer in one word is simply unsuitable, which the `llm_errors`/
 * unparsed counters make visible rather than silent.
 *
 * TEMPERATURE 0 IS LOAD-BEARING, not a micro-optimisation. Adjudication is a BINARY CLASSIFICATION, and this
 * call previously set no temperature at all — inheriting the model's sampling default. Measured on the
 * ground-truthed corpus (test/experiments/resolver-model-experiment.mjs), that made the verdict UNREPEATABLE:
 * qwen3.5:9b scored 11/12 with zero false merges on one pass and 10/12 with a FALSE MERGE on the next, same
 * prompt, same pair. At temperature 0 every model tested became stable (0 flips over 3 repeats) and two of
 * them reached 12/12. That matters most in 'on' mode, where a SAME verdict does not merely decide one write —
 * it PROMOTES A PERMANENT LEARNED ALIAS, so a sampled coin-flip would be recorded as durable knowledge.
 * `options` passes through `chat()` untouched, so this is provider-agnostic.
 */
function makeResolverLlm(fastify, { userId = null } = {}) {
  const { provider, model } = splitModelId(resolverModel(fastify.config))
  const options = { stream: false, reasoning: { enabled: false }, max_tokens: 32, numCtx: 2048, temperature: 0, keepAlive: resolverKeepAlive(fastify.config) }
  if (resolverDevice(fastify.config) === 'cpu') options.numGpu = 0 // 0 VRAM — never evict the chat model
  return async (prompt) => {
    const res = await chat({
      serverConfig: fastify.config,
      request: { provider, model, messages: [{ role: 'user', content: prompt }], options, userId },
    })
    return res?.message?.content || ''
  }
}

/**
 * buildSlotResolver — the chain the store should use. When the gray zone is 'off' this is exactly the cosine
 * resolver (zero added cost, zero behaviour change), which is why 'off' is the default.
 * @param {(text:string)=>Promise<{vector:number[]|null}>|null} embed
 * @param {(slots:object[], ctx:object)=>Promise<Map<string,number[]>>} loadIndex the §8a private-index port
 */
export function buildSlotResolver(fastify, { embed = null, loadIndex = null, userId = null } = {}) {
  // No host (a lightweight harness) → the chain has no gateway to call and no settings to read, so the
  // cheap resolver at its compiled-in default is the only honest answer. A genuine capability check, NOT
  // a swallowed config error.
  if (!fastify?.config) return createCosineSlotResolver({ embed, loadIndex })
  const threshold = slotSemThreshold(fastify.config)
  const cosine = createCosineSlotResolver({ embed, loadIndex, threshold })
  const mode = grayZoneMode(fastify.config)
  if (mode === GRAY_ZONE_MODE.off) return cosine
  const { min, max, tie } = grayZoneBand(fastify.config)
  // ⚠️ NO UNJUDGED DEAD ZONE. These two settings are independent but must not be set independently:
  // cosine self-resolves at >= `threshold`, and the adjudicator is only consulted within [min, max].
  // If `max` were left below `threshold`, scores in between would be resolved by NEITHER — cosine
  // declines them and the gray zone never sees them — so they would be silently treated as brand-new
  // concepts. That is a FALSE SPLIT manufactured purely by configuration, and it is invisible: a split
  // just looks like a fact that never converged. Clamping is the correct read of intent, since the
  // ceiling exists to mark where machine confidence becomes sufficient, which IS the threshold.
  //
  // Cogito's framing (2026-08-03) is the clearer statement of the whole arrangement, and this is what
  // the numbers now say: automatic YES at >= 0.85, automatic NO below 0.70, judgement in between —
  // the gray zone is not "low confidence", it is "machine confidence is insufficient".
  const ceiling = Math.max(max, threshold)
  if (ceiling !== max) {
    fastify.log?.warn?.(
      { grayZoneMax: max, slotSemThreshold: threshold, using: ceiling },
      'memory.resolver: grayZone.max sits below slotSemThreshold — raising it, or scores between them would be judged by nothing and silently split',
    )
  }
  return createGrayZoneResolver({
    base: cosine,
    llm: makeResolverLlm(fastify, { userId }),
    mode, min, max: ceiling, tie,
    log: fastify.log ?? null,
    events: fastify.events ?? null,
  })
}
