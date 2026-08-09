// Capability PROBES + the capability STORE.
//
// Probes run one real request per capability against a model and record
// confirmed/failed in the model_capabilities table — "we tested it, so we KNOW
// what can do what" (vs declared metadata or name guesses).
//
// capsForModel() is the runtime lookup the chat pipeline uses (e.g. the vision
// relay): tested results override provider-declared, which override name-inference.

import zlib from 'node:zlib'
import { adapters, effectiveProviders } from './index.js'
import { capsOf, inferCapsFromName } from './model-caps.js'
import { effectiveNumCtx } from '../chat-runtime/ollama-ctx.js'

// ---- tiny built-in test image (64x64 solid red PNG, no deps) -----------------
let cachedRedSquare = null
export function redSquareDataUrl() {
  if (cachedRedSquare) return cachedRedSquare
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc32 = (b) => {
    let c = 0xFFFFFFFF
    for (const x of b) c = crcTable[(c ^ x) & 0xFF] ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
  }
  const chunk = (type, data) => {
    const t = Buffer.from(type)
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
    return Buffer.concat([len, t, data, crc])
  }
  const W = 64, H = 64
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2 // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(W * 3)])
  for (let i = 1; i < row.length; i += 3) { row[i] = 224; row[i + 1] = 16; row[i + 2] = 16 }
  const raw = Buffer.concat(Array.from({ length: H }, () => row))
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
  cachedRedSquare = 'data:image/png;base64,' + png.toString('base64')
  return cachedRedSquare
}

// ---- capability classes ---------------------------------------------------------
// Specialist (non-chat) classes — a model in one of these can't hold a conversation.
export const SPECIALIST_CAPS = ['embeddings', 'reranker', 'media-gen', 'speech']
// The options the chat pipeline strips when a model VERIFIABLY lacks them
// (probe-failed or authoritatively declared absent — never on a mere name guess).
export const GATEABLE_CAPS = ['thinking', 'tools']

// ---- probes -------------------------------------------------------------------
const PROBE_OPTS = { stream: false, reasoning: { enabled: true }, max_tokens: 1024 }
const clipDetail = (s) => String(s ?? '').replace(/\s+/g, ' ').slice(0, 300)

const PROBES = {
  chat: async (call) => {
    const r = await call({ messages: [{ role: 'user', content: 'Reply with exactly: OK' }] })
    const text = r.message?.content?.trim()
    return { pass: Boolean(text), detail: clipDetail(text || '(empty reply)') }
  },
  vision: async (call) => {
    const r = await call({ messages: [{ role: 'user', content: 'What color is this image? Answer with one lowercase word only.', images: [redSquareDataUrl()] }] })
    const text = r.message?.content?.trim() || ''
    return { pass: /red/i.test(text), detail: clipDetail(text || '(empty reply)') }
  },
  tools: async (call) => {
    const r = await call({
      messages: [{ role: 'user', content: 'What time is it right now? You MUST call the get_current_time tool to find out.' }],
      tools: [{ type: 'function', function: { name: 'get_current_time', description: 'Returns the current time', parameters: { type: 'object', properties: {} } } }],
    })
    const called = Array.isArray(r.message?.tool_calls) && r.message.tool_calls.length > 0
    return { pass: called, detail: called ? `called ${r.message.tool_calls[0]?.function?.name}` : clipDetail(r.message?.content || '(no tool call)') }
  },
  thinking: async (call) => {
    const r = await call({ messages: [{ role: 'user', content: 'What is 17 * 23? Think it through step by step.' }] })
    const reasoned = Boolean(r.message?.reasoning_content?.trim())
    return { pass: reasoned, detail: reasoned ? `reasoned ${r.message.reasoning_content.length} chars` : 'no reasoning stream surfaced' }
  },
  // embeddings uses the provider's embed endpoint, not chat — env carries the adapter
  embeddings: async (_call, env) => {
    if (typeof env.adapter.embed !== 'function') return { pass: false, detail: 'provider kind has no embeddings endpoint' }
    const r = await env.adapter.embed({ ...env.cfg, model: env.model, input: 'capability probe: embed this sentence.' })
    const vec = r?.embeddings?.[0]
    const pass = Array.isArray(vec) && vec.length >= 8 && vec.every((x) => typeof x === 'number')
    return { pass, detail: pass ? `vector[${vec.length}]` : 'no embedding vector returned' }
  },
}
export const PROBEABLE = Object.keys(PROBES)
// The core conversational probes — the default set for chat-class models.
export const CORE_PROBES = ['chat', 'vision', 'tools', 'thinking']

// Which probes make sense for a model: embeddings-class models get the embeddings
// probe PLUS chat (to confirm/deny it can converse — turns the name guess into a
// verdict either way); other specialists have nothing probeable; chat models get
// the core four. Declared metadata beats name inference (e.g. Ollama's bge-m3
// declares 'embedding' but its name says nothing).
export async function defaultProbeSet(config, provider, model) {
  const declared = (await declaredCapsCached(config, provider)).get(model) || null
  const caps = declared || inferCapsFromName(model)
  if (caps.includes('embeddings')) return ['embeddings', 'chat']
  if (caps.some((c) => SPECIALIST_CAPS.includes(c))) return null // nothing meaningful to probe
  return CORE_PROBES
}

// Run capability probes against one model; upserts results into mst_model_capabilities.
// `caps` selects which probes run (default: the four core chat probes).
// onProgress(capability) fires before each probe (batch verify streams it to the UI);
// probeTimeoutMs bounds a single probe so one hung provider can't stall a batch;
// shouldStop() is polled between probes so an aborted batch stops mid-model (already-
// run capabilities keep their fresh rows; the rest keep their previous state).
/**
 * Turn one capability probe into the row we are willing to STORE — retrying once before recording a
 * failure.
 *
 * WHY THE RETRY (2026-08-03): a probe row is not a note, it OVERRIDES the provider's declared
 * capabilities everywhere (chat picker, vision relay, chat gate), so one flaky attempt silently
 * re-routes the platform. Measured that day: `gemma4:e4b` recorded `thinking = failed` ("no reasoning
 * stream surfaced") while the identical call, repeated, reasoned for 2047 chars — a false negative
 * that would have marked a working model non-thinking until someone re-probed by hand. Model
 * loads/evictions make one-shot verdicts genuinely flaky on a busy box.
 *
 * Asymmetric ON PURPOSE: a `confirmed` is never retried (the capability demonstrably worked once —
 * that is proof, and re-testing it could only introduce a false negative), so only negatives pay the
 * extra request. The stored detail always says which attempt spoke, because "failed" and "failed
 * twice" are different amounts of evidence and the console shows this text to a human.
 *
 * @param {() => Promise<{pass:boolean, detail:string}>} attempt runs the probe once
 * @param {{retry?:boolean}} [opts] retry:false records the first outcome as-is (used when aborting)
 * @returns {Promise<{status:'confirmed'|'failed', detail:string}>}
 */
export async function settleProbe(attempt, { retry = true } = {}) {
  const once = async () => {
    try {
      const r = await attempt()
      return { pass: Boolean(r?.pass), detail: clipDetail(r?.detail) }
    } catch (e) {
      return { pass: false, detail: clipDetail(e?.message || 'probe error'), threw: true }
    }
  }
  const first = await once()
  if (first.pass) return { status: 'confirmed', detail: first.detail }
  if (!retry) return { status: 'failed', detail: first.detail }
  const second = await once()
  if (second.pass) return { status: 'confirmed', detail: clipDetail(`${second.detail} (passed on retry — first attempt: ${first.detail})`) }
  return { status: 'failed', detail: clipDetail(`${second.detail} (twice)`) }
}

export async function probeModel({ db, config, provider, model, caps = null, onProgress = null, probeTimeoutMs = 0, shouldStop = null }) {
  const cfg = effectiveProviders(config)[provider]
  const adapter = adapters[cfg?.kind || provider]
  if (!cfg || !adapter) throw new Error(`Provider '${provider}' not found or unsupported`)
  // Ollama probes ride the SAME effective num_ctx as chat requests. Without it the probe
  // runs at the server default, which RELOADS the model at a different window — evicting
  // the instance chats use, then chats reload it back (the straggler-probe thrash the suite
  // documented). Same window = same warm instance; a leftover probe after an aborted batch
  // is then one short request on a warm model, not a multi-minute reload.
  const probeOpts = { ...PROBE_OPTS }
  if ((cfg.kind || provider) === 'ollama') {
    const numCtx = effectiveNumCtx(config, cfg.host, model)
    if (Number.isInteger(numCtx) && numCtx > 0) probeOpts.numCtx = numCtx
  }
  const call = (req) => adapter.chat({ ...cfg, name: provider, model, options: probeOpts, ...req })
  const probeEnv = { adapter, cfg: { ...cfg, name: provider }, model }
  const toRun = Array.isArray(caps) && caps.length ? caps.filter((c) => PROBEABLE.includes(c)) : CORE_PROBES

  const results = []
  for (const capability of toRun) {
    if (shouldStop?.()) break
    onProgress?.(capability)
    const attempt = () => {
      const run = PROBES[capability](call, probeEnv)
      return probeTimeoutMs > 0
        ? Promise.race([
            run,
            new Promise((_, rej) => setTimeout(() => rej(new Error(`probe timeout after ${Math.round(probeTimeoutMs / 1000)}s`)), probeTimeoutMs).unref?.()),
          ])
        : run
    }
    const { status, detail } = await settleProbe(attempt, { retry: !shouldStop?.() })
    const [row, created] = await db.mst_model_capabilities.findOrCreate({
      where: { provider, model, capability },
      defaults: { provider, model, capability, status, source: 'probe', detail, tested_at: new Date() },
    })
    if (!created) await row.update({ status, source: 'probe', detail, tested_at: new Date() })
    results.push({ capability, status, detail })
  }
  return results
}

// Tested rows for every model of one provider: { [modelId]: { [cap]: {status, detail, testedAt} } }
export async function testedCapsForProvider(db, provider) {
  const rows = await db.mst_model_capabilities.findAll({ where: { provider } })
  const out = {}
  for (const r of rows) {
    out[r.model] = out[r.model] || {}
    out[r.model][r.capability] = { status: r.status, detail: r.detail, testedAt: r.tested_at }
  }
  return out
}

// ---- runtime lookup (used per chat turn — cheap) -------------------------------
// Precedence: probe-tested > provider-declared (cached) > name-inferred.
const declaredCache = new Map() // provider -> { at, byModel: Map }
const DECLARED_TTL_MS = 60_000

async function declaredCapsCached(config, provider) {
  const hit = declaredCache.get(provider)
  if (hit && Date.now() - hit.at < DECLARED_TTL_MS) return hit.byModel
  const byModel = new Map()
  try {
    const cfg = effectiveProviders(config)[provider]
    const adapter = adapters[cfg?.kind || provider]
    if (typeof adapter?.listModelsDetailed === 'function') {
      for (const m of await adapter.listModelsDetailed({ ...cfg, name: provider })) {
        const r = capsOf(m)
        if (!r.inferred) byModel.set(m.id, r.caps)
      }
    }
  } catch { /* declared lookup is best-effort */ }
  declaredCache.set(provider, { at: Date.now(), byModel })
  return byModel
}

// Pure merge of the three trust tiers for ONE model.
//   declared: caps list from provider metadata (null when the provider gave none)
//   inferredList: name-guess caps (always available)
//   tested: { capability: 'confirmed'|'failed' } probe rows
// -> caps: the merged capability list (probe > declared > inferred)
//    unsupported: GATEABLE caps with a STRONG negative (probe-failed, or declared
//      metadata present that omits them) — the send path strips these. A name guess
//      alone never lands here, so unprobed models are never nerfed.
//    chatCapable: false only on a strong signal (probe-failed chat, declared non-chat)
//      or a specialist name class (a guaranteed-useless provider 400 otherwise).
//    known: any authoritative signal exists (declared metadata or probe rows).
export function mergeCapVerdict(declared, inferredList, tested = {}) {
  const caps = new Set(declared || inferredList)
  const unsupported = new Set()
  if (declared) for (const c of GATEABLE_CAPS) if (!declared.includes(c)) unsupported.add(c)
  for (const [cap, status] of Object.entries(tested)) {
    if (status === 'confirmed') { caps.add(cap); unsupported.delete(cap) }
    else if (status === 'failed') { caps.delete(cap); unsupported.add(cap) }
  }
  return {
    caps: [...caps],
    unsupported: [...unsupported].filter((c) => GATEABLE_CAPS.includes(c)),
    chatCapable: caps.has('chat'),
    known: Boolean(declared) || Object.keys(tested).length > 0,
  }
}

// Full trust-tiered verdict for one model (async: hits declared cache + probe rows).
export async function capsVerdictForModel({ db, config }, provider, model) {
  const declared = (await declaredCapsCached(config, provider)).get(model) || null
  const tested = {}
  try {
    for (const r of await db.mst_model_capabilities.findAll({ where: { provider, model } })) tested[r.capability] = r.status
  } catch { /* table missing/unreachable — declared/inferred only */ }
  return mergeCapVerdict(declared, inferCapsFromName(model), tested)
}

export async function capsForModel(fastify, provider, model) {
  return (await capsVerdictForModel(fastify, provider, model)).caps
}
