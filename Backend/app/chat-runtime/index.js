// Chat runtime — orchestrates a chat/completion request through the resolved
// provider adapter and normalizes the result. Streaming maps the adapter's
// normalized events to the gateway's SSE wire-event taxonomy.
//
// Responsibilities: authenticate (upstream, via route preHandler), validate
// provider/model, load adapter, route request, normalize response.
// NOT responsible for: memory, tool execution, continuity, agent logic.

import crypto from 'node:crypto'
import { resolveProvider, GatewayError, listConfiguredProviders, effectiveProviders } from '../adapters/index.js'
import { isModelBlocked } from '../adapters/blocklist.js'
import { getSetting } from '../settings/index.js'
import { effectiveNumCtx } from './ollama-ctx.js'
import { noteLocalUse } from '../components/local-usage.js'

// Ollama-kind providers get an explicit context window on every request — without it the
// server default rules (measured 32k here) and overflow is SILENT truncation. The value is
// root's providers.ollamaNumCtxLimit (0 = no limit → each model's own maximum), capped at
// the model's MEASURED VRAM-fit optimum when the providers.ollamaAutoCtx lever is on (see
// ollama-ctx.js); the adapter clamps to each model's trained max.
// Exported for tests: it is a pure transformation that decides VRAM placement and context size for every
// Ollama request on every surface, which is worth pinning directly rather than through a live provider.
export function withProviderOptions(options, providerConfig, provider, serverConfig, model) {
  const kind = providerConfig.kind || provider
  if (kind === 'ollama') {
    // A CPU-PINNED OLLAMA PROVIDER (`"forceCpu": true` on the provider entry, e.g. an "ollama-cpu" pointing
    // at the same host). num_gpu:0 means zero VRAM, so talking to a small model cannot evict the resident
    // chat model — the placement belongs to the PROVIDER, which is why this reads a provider field rather
    // than a model-name convention. An explicit caller numGpu still wins: the memory aux hosts choose their
    // own placement from memory.*Device and must not be second-guessed here.
    if (providerConfig.forceCpu === true && !Number.isInteger(options?.numGpu)) {
      options = { ...options, numGpu: 0 }
    }
    let numCtx = effectiveNumCtx(serverConfig, providerConfig.host, model)
    // `numCtxCap` on the provider entry. On CPU the KV cache costs RAM *and* prefill time, so inheriting a
    // model's full window is ruinous: MEASURED at 262144 ctx → 16.05GB resident and 257s to first token,
    // against 6.47GB at 8192. A cap belongs with the provider that needs it, not hard-coded in a route.
    if (Number.isInteger(providerConfig.numCtxCap) && providerConfig.numCtxCap > 0) {
      numCtx = Number.isInteger(numCtx) && numCtx > 0 ? Math.min(numCtx, providerConfig.numCtxCap) : providerConfig.numCtxCap
    }
    // An explicit caller numCtx (e.g. the memory aux LLMs bounding their own small inputs) is a
    // FURTHER cap — it can only LOWER the lever's safe optimum, never raise it (min), so a caller
    // can shrink VRAM without risking a spill past the calibrated window.
    if (Number.isInteger(options?.numCtx) && options.numCtx > 0) {
      numCtx = Number.isInteger(numCtx) && numCtx > 0 ? Math.min(numCtx, options.numCtx) : options.numCtx
    }
    if (!Number.isInteger(numCtx) || numCtx <= 0) return options
    return { ...options, numCtx }
  }
  // Anthropic prompt caching: mark breakpoints only for CONVERSATIONS (options.cacheConversation,
  // set by the chat site — the next turn extends the prefix, so cached reads pay off) and only
  // while root's providers.anthropicCacheControl lever is on. One-shot API calls stay unmarked.
  if (kind === 'anthropic' && options?.cacheConversation
    && getSetting(serverConfig, 'providers.anthropicCacheControl') === true) {
    return { ...options, cacheControl: true }
  }
  return options
}

export { GatewayError }

// Root's blocklist applies to EVERY surface this runtime serves (chat site, OpenAI,
// Anthropic, embeddings) — a blocked model is refused here, not just hidden by UIs.
function assertNotBlocked(provider, model) {
  if (isModelBlocked(provider, model)) {
    throw new GatewayError('model_blocked', `Model '${provider}/${model}' has been blocked by the administrator`, 403)
  }
}

// Parse an OpenAI-style `model` field into { provider, model }.
// Convention: "<provider>/<model>" split on the FIRST slash, so model names
// that themselves contain slashes (e.g. "deepseek-ai/DeepSeek-V3.2") survive.
// An explicit `provider` field on the body overrides (used by internal callers).
export function parseModelRef(body) {
  if (body?.provider) {
    return { provider: body.provider, model: body.model }
  }
  const m = typeof body?.model === 'string' ? body.model : ''
  const i = m.indexOf('/')
  if (i <= 0) {
    throw new GatewayError(
      'model_unqualified',
      'model must be "<provider>/<model>" (e.g. "ollama/gemma4:26b"). Call GET /v1/models for valid ids, or pass an explicit "provider" field.',
      400
    )
  }
  return { provider: m.slice(0, i), model: m.slice(i + 1) }
}

// Aggregate models across all enabled+supported providers into one flat list,
// each id namespaced as "<provider>/<model>". Runs providers in parallel and
// tolerates per-provider failures (bad key / offline) by collecting them in
// `errors` rather than failing the whole call.
// A provider entry's optional `models` allowlist (config-sourced providers can carry arbitrary fields).
function providerAllowList(serverConfig, name) {
  const cfg = effectiveProviders(serverConfig)[name]
  return Array.isArray(cfg?.models) && cfg.models.length ? cfg.models.map((m) => String(m).trim()) : null
}

export async function listAllModels({ serverConfig, userId = null }) {
  const providers = listConfiguredProviders(serverConfig, { includeDisabled: false, userId })
    .filter((p) => p.supported)

  const settled = await Promise.all(
    providers.map(async (p) => {
      try {
        const models = await listModels({ serverConfig, provider: p.name, userId })
        // `models` on the provider entry = an ALLOWLIST: expose only these. Without it a CPU-pinned
        // provider would mirror the host's whole catalogue, including a 24GB chat model that on CPU is a
        // footgun rather than an option. Absent = offer everything, which is what every normal provider does.
        const allow = Array.isArray(providerAllowList(serverConfig, p.name)) ? new Set(providerAllowList(serverConfig, p.name)) : null
        const offered = models
          .filter((m) => !isModelBlocked(p.name, m.id)) // root-blocked models are not offered anywhere
          .filter((m) => !allow || allow.has(m.id))
          .map((m) => ({ id: `${p.name}/${m.id}`, ownedBy: p.name, raw: m.id, byok: p.byok || undefined }))
        return { provider: p.name, models: offered }
      } catch (e) {
        return { provider: p.name, error: e?.message || String(e) }
      }
    })
  )

  const models = []
  const errors = []
  for (const r of settled) {
    if (r.models) models.push(...r.models)
    else errors.push({ provider: r.provider, message: r.error })
  }
  return { models, errors }
}

// OpenAI-style content-parts arrays -> canonical { content: string, images: [dataURL] }.
// Callers (OpenAI SDKs, raw curl) send multimodal messages as
//   content: [{type:'text',text}, {type:'image_url',image_url:{url:'data:image/…'}}]
// while the adapters consume a plain-string content + a message-level `images` array
// (the same canonical shape the chat site persists). Without this, an array content
// would reach the ollama adapter raw and break the request.
const DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+;base64,/i

export function normalizeMessages(messages) {
  return (messages || []).map((m) => {
    if (!m || !Array.isArray(m.content)) return m
    const texts = []
    const images = Array.isArray(m.images) ? [...m.images] : []
    for (const part of m.content) {
      const type = part?.type
      if (type === 'text' && typeof part.text === 'string') {
        texts.push(part.text)
      } else if (type === 'image_url' || type === 'image') {
        const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url || part.url
        if (typeof url === 'string' && DATA_IMAGE_RE.test(url)) {
          images.push(url)
        } else if (typeof url === 'string' && /^https?:/i.test(url)) {
          throw new GatewayError(
            'image_url_remote_unsupported',
            'Remote image URLs are not fetched by this gateway — send the image as a base64 data URL (data:image/…;base64,…)',
            400
          )
        } else {
          throw new GatewayError('image_url_invalid', 'image_url must be a base64 data URL (data:image/…;base64,…)', 400)
        }
      } else if (type) {
        texts.push(`[${type} omitted — not supported by this gateway]`)
      }
    }
    const out = { ...m, content: texts.join('\n') }
    if (images.length) out.images = images
    return out
  })
}

function normalizeToolCall(call) {
  if (!call || typeof call !== 'object') return call
  const fn = call.function || {}
  let args = fn.arguments !== undefined ? fn.arguments : call.arguments
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch {
      // Leave as the raw string if the provider sent non-JSON arguments.
    }
  }
  return {
    id: call.id,
    name: fn.name || call.name,
    arguments: args ?? {},
  }
}

export async function chat({ serverConfig, request }) {
  const { provider, model, messages, tools, options, userId } = request
  if (!model) {
    throw new GatewayError('model_required', 'Request must specify a model', 400)
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new GatewayError('messages_required', 'Request must include a non-empty messages array', 400)
  }
  assertNotBlocked(provider, model)

  const { adapter, providerConfig } = resolveProvider(serverConfig, provider, userId)
  // attribution for the local monitor — record that WE asked for this model (ollama-kind only), and
  // WHICH chat it was for when there is one (side-calls like title generation legitimately have none)
  if ((providerConfig.kind || provider) === 'ollama') noteLocalUse(model, 'chat', userId, request.conversationId ?? null)

  const result = await adapter.chat({
    ...providerConfig,
    model,
    messages: normalizeMessages(messages),
    tools,
    options: withProviderOptions(options, providerConfig, provider, serverConfig, model),
  })

  return {
    message: result.message,
    usage: result.usage,
    model,
    provider,
  }
}

export async function* streamChat({ serverConfig, request }) {
  const { provider, model, messages, tools, options, userId } = request
  if (!model) {
    throw new GatewayError('model_required', 'Request must specify a model', 400)
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new GatewayError('messages_required', 'Request must include a non-empty messages array', 400)
  }
  assertNotBlocked(provider, model)

  const { adapter, providerConfig } = resolveProvider(serverConfig, provider, userId)
  if ((providerConfig.kind || provider) === 'ollama') noteLocalUse(model, 'stream', userId, request.conversationId ?? null)

  yield { event: 'status', data: { phase: 'provider_request', provider, model } }

  let sawFirstChunk = false
  for await (const evt of adapter.stream({
    ...providerConfig,
    model,
    messages: normalizeMessages(messages),
    tools,
    options: withProviderOptions(options, providerConfig, provider, serverConfig, model),
  })) {
    if (!sawFirstChunk && (evt.type === 'text' || evt.type === 'reasoning' || evt.type === 'tool_call')) {
      yield { event: 'status', data: { phase: 'provider_response', provider, model } }
      sawFirstChunk = true
    }

    switch (evt.type) {
      case 'text':
        yield { event: 'token', data: { text: evt.text } }
        break
      case 'reasoning':
        yield { event: 'reasoning', data: { text: evt.text } }
        break
      case 'answer_superseded':
        // a thinking model abandoned its answer-so-far and restarted (provider reclassified the
        // draft into reasoning) — tell the route to drop that run from the visible answer
        yield { event: 'answer_superseded', data: { text: evt.text } }
        break
      case 'tool_call':
        yield { event: 'tool_call', data: normalizeToolCall(evt.call) }
        break
      case 'done':
        yield {
          event: 'done',
          data: {
            usage: evt.usage,
            model,
            provider,
            finalMessage: evt.finalMessage,
            finishReason: evt.finishReason ?? null, // 'length'/'max_tokens' = output cap hit
          },
        }
        break
      case 'error':
        yield {
          event: 'error',
          data: { code: evt.code, message: evt.message, retryable: false },
        }
        break
      default:
        // Unknown event type — skip silently to stay forward-compatible.
        break
    }
  }
}

export async function listModels({ serverConfig, provider, userId = null }) {
  const { adapter, providerConfig } = resolveProvider(serverConfig, provider, userId)
  return adapter.listModels({ ...providerConfig })
}

// Embeddings — OpenAI-shaped input (string or array of strings), normalized result.
// Platform exact-match cache (pass `db`): same endpoint+model+text = same vector
// (embeddings are deterministic), so repeats are answered from the DB with NO provider
// call — the one caching layer that works regardless of provider support.
export async function embeddings({ serverConfig, db = null, request }) {
  const { provider, model, input, userId, numCtx = null, keepAlive = null, numGpu = null } = request
  if (!model) throw new GatewayError('model_required', 'Request must specify a model', 400)
  const inputs = Array.isArray(input) ? input : [input]
  if (!inputs.length || inputs.some((s) => typeof s !== 'string' || !s.length)) {
    throw new GatewayError('input_required', 'input must be a non-empty string or array of non-empty strings', 400)
  }
  assertNotBlocked(provider, model)

  const { adapter, providerConfig, kind } = resolveProvider(serverConfig, provider, userId)
  if (typeof adapter.embed !== 'function') {
    throw new GatewayError('embeddings_unsupported', `Provider kind '${kind}' does not support embeddings`, 400)
  }

  // cache key includes the effective endpoint — the same model NAME behind a different
  // BYOK endpoint is a different model as far as vectors are concerned
  const cacheOn = Boolean(db?.txn_embedding_cache) && getSetting(serverConfig, 'embeddings.cacheEnabled') === true
  const endpoint = providerConfig.baseURL || providerConfig.apiUrl || providerConfig.host || kind
  const keyOf = (text) => crypto.createHash('sha256').update(`${endpoint}|${model}|${text}`).digest('hex')
  const hashes = cacheOn ? inputs.map(keyOf) : null
  const hits = new Map()
  if (cacheOn) {
    try {
      const rows = await db.txn_embedding_cache.findAll({ where: { hash: [...new Set(hashes)] } })
      for (const r of rows) hits.set(r.hash, r.vector)
    } catch { /* cache lookup failure = plain provider call */ }
  }
  const missIdx = inputs.map((_, i) => i).filter((i) => !cacheOn || !hits.has(hashes[i]))

  let fresh = { embeddings: [], promptTokens: null }
  if (missIdx.length) {
    // Attribution is recorded HERE, not before the cache lookup: on a full cache hit nothing reaches
    // Ollama, and claiming we touched a model we never called would make the monitor describe intent
    // rather than fact — which is the one thing it exists to get right.
    if (kind === 'ollama') noteLocalUse(model, 'embed', userId)
    fresh = await adapter.embed({ ...providerConfig, model, input: missIdx.map((i) => inputs[i]), numCtx, keepAlive, numGpu })
  }
  const out = new Array(inputs.length)
  missIdx.forEach((inputI, j) => { out[inputI] = fresh.embeddings[j] })
  if (cacheOn) {
    for (let i = 0; i < inputs.length; i++) if (out[i] === undefined) out[i] = hits.get(hashes[i])
    // persist fresh vectors + touch reused rows — fire-and-forget, never blocks the reply
    try {
      const seen = new Set()
      const newRows = missIdx
        .filter((i) => out[i] && !seen.has(hashes[i]) && seen.add(hashes[i]))
        .map((i) => ({ hash: hashes[i], provider, model, vector: out[i], last_used_at: new Date() }))
      if (newRows.length) db.txn_embedding_cache.bulkCreate(newRows, { ignoreDuplicates: true }).catch(() => {})
      const hitHashes = [...hits.keys()]
      if (hitHashes.length) db.txn_embedding_cache.update({ last_used_at: new Date() }, { where: { hash: hitHashes } }).catch(() => {})
    } catch { /* best-effort */ }
  }

  return {
    embeddings: out,
    // full cache hit = the provider was never called = zero new tokens
    promptTokens: missIdx.length ? (fresh.promptTokens ?? null) : 0,
    cachedCount: inputs.length - missIdx.length,
    model,
    provider,
  }
}
