import { default as defaultOllama, Ollama } from 'ollama'
import { createDraftReclassifier, normalizeMessage } from '../_shared.js'

function getClient(host) {
  if (!host || host === 'http://127.0.0.1:11434') {
    return defaultOllama
  }
  return new Ollama({ host })
}

function isOllamaToolCallParseError(error) {
  const message = error instanceof Error ? error.message : String(error || '')
  return /error parsing tool call/i.test(message) || /unexpected end of json input/i.test(message)
}

// Translate canonical agent messages -> Ollama wire shape (tool calls + tool results).
// Ollama expects assistant.tool_calls[].function.arguments as an OBJECT, and tool
// results as { role:'tool', content, tool_name }.
function toProviderMessages(messages) {
  return (messages || []).map((m) => {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      return {
        role: 'assistant',
        content: m.content || '',
        tool_calls: m.tool_calls.map((tc) => {
          let args = tc.arguments
          if (typeof args === 'string') { try { args = JSON.parse(args) } catch { args = {} } }
          return { function: { name: tc.name, arguments: args ?? {} } }
        }),
      }
    }
    if (m.role === 'tool') {
      return { role: 'tool', content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content), tool_name: m.name }
    }
    if (Array.isArray(m.images) && m.images.length) {
      // canonical images are data URLs; Ollama wants raw base64 (no data: prefix).
      // ⚠️ Safety net: Ollama's vision (llama.cpp/stb_image) CANNOT decode WebP/AVIF — such an image
      // is silently dropped and the model "sees nothing". We can't transcode here without a decoder
      // dep (sharp / ffmpeg), so drop the undecodable one(s) and tell the model why, so it asks the
      // user to re-attach (JPEG/PNG) instead of confidently answering "no image". (The chat frontend
      // already encodes JPEG; this defends non-browser API clients that send WebP.)
      const DECODABLE = /^data:image\/(jpe?g|png|gif|bmp)\b/i
      const usable = m.images.filter((u) => DECODABLE.test(String(u)))
      const dropped = m.images.length - usable.length
      const note = dropped
        ? `\n\n[System note: ${dropped} attached image(s) are in a format this local vision model cannot read (e.g. WebP/AVIF) and were skipped. Tell the user to re-attach as JPEG or PNG.]`
        : ''
      return {
        ...m,
        content: (typeof m.content === 'string' ? m.content : '') + note,
        images: usable.map((u) => String(u).replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '')),
      }
    }
    return m
  })
}

// Map normalized options -> Ollama's `options` object (and attach if non-empty).
function applySampling(request, options = {}) {
  const o = {}
  if (options.temperature != null) o.temperature = options.temperature
  if (options.top_p != null) o.top_p = options.top_p
  if (options.max_tokens != null) o.num_predict = options.max_tokens
  if (options.seed != null) o.seed = options.seed
  // Explicit context window — without it the SERVER default rules (measured 32k locally)
  // and overflow is silent truncation. Callers pass numCtx already clamped via clampNumCtx.
  if (Number.isInteger(options.numCtx) && options.numCtx > 0) o.num_ctx = options.numCtx
  // num_gpu 0 = run on CPU at ZERO VRAM. Already used on the embed path (memory.embeddingDevice);
  // AUX chat callers need it too, because on a full GPU an aux model does not merely cost its own
  // latency — it EVICTS the resident chat model, and the user's next turn pays the reload.
  if (Number.isInteger(options.numGpu) && options.numGpu >= 0) o.num_gpu = options.numGpu
  if (Object.keys(o).length) request.options = o
  return request
}

// keep_alive is a TOP-LEVEL Ollama field, not a sampling option — how long the model stays loaded
// after this call. Opt-in: absent unless a caller asks, so the shared chat path is unaffected.
function applyResidency(request, options = {}) {
  if (options.keepAlive != null && options.keepAlive !== '') request.keep_alive = options.keepAlive
  return request
}

// Trained context length per model (from /api/show), cached per host+model — asking for a
// num_ctx beyond it just wastes KV memory, so requests clamp to the model's real ceiling.
const trainedCtxCache = new Map()
export async function trainedContextLength(host, model) {
  const base = (host || 'http://127.0.0.1:11434').replace(/\/+$/, '')
  const key = `${base}|${model}`
  if (trainedCtxCache.has(key)) return trainedCtxCache.get(key)
  let ctx = null
  try {
    const r = await fetch(`${base}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(5000),
    })
    if (r.ok) {
      const show = await r.json()
      const ctxKey = Object.keys(show.model_info || {}).find((k) => k.endsWith('.context_length'))
      ctx = ctxKey ? show.model_info[ctxKey] : null
    }
  } catch { /* unknown — pass the requested value through */ }
  trainedCtxCache.set(key, ctx)
  return ctx
}

// Sync peek at the trained-max cache (for the chat-site token-budget guard, which can't
// await). null until the first request/list for that model fills the cache.
export function peekTrainedContextLength(host, model) {
  const base = (host || 'http://127.0.0.1:11434').replace(/\/+$/, '')
  return trainedCtxCache.get(`${base}|${model}`) ?? null
}

// "No limit" sentinel from app/chat-runtime/ollama-ctx.js — a numCtx this large means
// "the model's maximum": clamp to the trained max, or drop num_ctx entirely when the
// trained max is unknown (never ask Ollama to allocate a million-token KV cache blind).
const NO_LIMIT = 1_048_576

async function clampNumCtx(host, model, options = {}) {
  if (!Number.isInteger(options.numCtx) || options.numCtx <= 0) return options
  const trained = await trainedContextLength(host, model)
  if (trained && trained < options.numCtx) return { ...options, numCtx: trained }
  if (!trained && options.numCtx >= NO_LIMIT) {
    const { numCtx, ...rest } = options
    return rest
  }
  return options
}

// Ollama controls thinking via the top-level `think` field:
//   think:false           -> suppress thinking entirely
//   think:true            -> think (default behaviour of thinking models)
//   think:"low|medium|high"-> effort level (supported by gpt-oss; ignored/erroring elsewhere)
function applyThink(request, options = {}) {
  const r = options.reasoning
  if (!r) return request
  if (r.enabled === false) request.think = false
  else if (r.effort) request.think = r.effort
  else if (r.enabled === true) request.think = true
  return request
}

// A `think:"<effort>"` level can be rejected by models that only accept a boolean.
// Detect that so callers can retry with think:true.
function isThinkLevelError(error) {
  const m = error instanceof Error ? error.message : String(error || '')
  return /think/i.test(m) && /(invalid|unsupported|bool|level|does not support)/i.test(m)
}

// Any think-field rejection (non-thinking model sent think:true — "X does not support
// thinking" — or a thinking-locked model sent think:false). Retrying WITHOUT the think
// field is always safe: Ollama then uses the model's own default. Without this, the
// chat default (thinking on) bricks every non-thinking model, and a capability probe
// (which forces reasoning on) records chat/vision/tools as failed with the SAME
// thinking error — poisoning the capability index.
function isThinkRejectedError(error) {
  const m = error instanceof Error ? error.message : String(error || '')
  return /think/i.test(m)
}

// Shared retry ladder for chat()/stream(): think-level -> think:true -> no think field.
async function callWithThinkFallback(client, request, { model, messages, stream }) {
  try {
    return await client.chat(request)
  } catch (error) {
    if (typeof request.think === 'string' && isThinkLevelError(error)) {
      request.think = true // model doesn't support effort levels — fall back to plain thinking
      try {
        return await client.chat(request)
      } catch (e2) {
        if (!isThinkRejectedError(e2)) throw e2
        delete request.think // …and doesn't support thinking at all — go neutral
        return client.chat(request)
      }
    }
    if ('think' in request && isThinkRejectedError(error)) {
      delete request.think // model rejects the requested think mode — use its default
      return client.chat(request)
    }
    if (request.tools && isOllamaToolCallParseError(error)) {
      return client.chat({ model, messages, stream })
    }
    throw error
  }
}

export async function listModels({ host } = {}) {
  const base = (host || 'http://127.0.0.1:11434').replace(/\/+$/, '')
  const response = await fetch(`${base}/api/tags`)
  if (!response.ok) {
    throw new Error(`Failed to list Ollama models (${response.status})`)
  }
  const json = await response.json()
  return (json.models || []).map((m) => ({
    id: m.model || m.name,
    label: m.name || m.model,
    family: m.details?.family || null,
    parameterSize: m.details?.parameter_size || null,
    sizeBytes: m.size || null,
    modifiedAt: m.modified_at || null,
  }))
}

// Rich listing for the console's Models page: /api/tags for the roster, then /api/show
// per model for AUTHORITATIVE capabilities (["completion","vision","tools","thinking",
// "embedding"] on current Ollama) + context length. Local + parallel, so it stays fast.
export async function listModelsDetailed({ host } = {}) {
  const base = (host || 'http://127.0.0.1:11434').replace(/\/+$/, '')
  const models = await listModels({ host })
  return Promise.all(models.map(async (m) => {
    try {
      const r = await fetch(`${base}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m.id }),
      })
      if (!r.ok) return m
      const show = await r.json()
      const ctxKey = Object.keys(show.model_info || {}).find((k) => k.endsWith('.context_length'))
      return {
        ...m,
        capabilities: show.capabilities || null, // provider-declared, not guessed
        contextLength: ctxKey ? show.model_info[ctxKey] : null,
        quantization: show.details?.quantization_level || null,
      }
    } catch {
      return m
    }
  }))
}

export async function chat({ host, model, messages, tools, options = {} } = {}) {
  const client = getClient(host)
  const reasoningEnabled = Boolean(options.reasoning?.enabled)
  const request = { model, messages: toProviderMessages(messages), stream: false }
  if (Array.isArray(tools) && tools.length > 0) request.tools = tools
  applySampling(request, await clampNumCtx(host, model, options))
  applyThink(request, options)
  applyResidency(request, options)

  const response = await callWithThinkFallback(client, request, { model, messages, stream: false })

  return {
    message: normalizeMessage(response.message, { reasoningEnabled }),
    usage: {
      promptTokens: response.prompt_eval_count ?? null,
      completionTokens: response.eval_count ?? null,
      // Prefill wall-clock: the honest prefix-cache signal — a big prompt with ~0ms
      // prefill means the runner reused its KV cache (prompt_eval_count reports the
      // FULL prompt size even on a 100% cache hit, so the count can't tell).
      promptEvalMs: response.prompt_eval_duration != null ? Math.round(response.prompt_eval_duration / 1e6) : null,
    },
  }
}

export async function* stream({ host, model, messages, tools, options = {} } = {}) {
  const client = getClient(host)
  const reasoningEnabled = Boolean(options.reasoning?.enabled)
  const request = { model, messages: toProviderMessages(messages), stream: true }
  if (Array.isArray(tools) && tools.length > 0) request.tools = tools
  applySampling(request, await clampNumCtx(host, model, options))
  applyThink(request, options)
  applyResidency(request, options)

  let iter
  try {
    iter = await callWithThinkFallback(client, request, { model, messages, stream: true })
  } catch (error) {
    yield {
      type: 'error',
      code: 'provider_request_failed',
      message: error?.message || String(error),
    }
    return
  }

  const seenToolCallIds = new Set()
  const toolCalls = []
  // Thinking models (qwen3.x, …) interleave think→answer→think→answer within one response and
  // restart their answer mid-stream; the reclassifier folds abandoned drafts into reasoning and
  // emits `answer_superseded` so only the FINAL run becomes the assistant's answer. See _shared.js.
  const reclass = createDraftReclassifier({ reasoningEnabled })
  let usage = { promptTokens: null, completionTokens: null }
  let finishReason = null // chunk.done_reason ('length' = num_predict/output cap hit)
  // Did the provider stream run to its natural end? If NOT, the HTTP request is still live and
  // MUST be aborted in the finally below — see the comment there. This is the single most
  // important invariant in this adapter.
  let streamEnded = false

  try {
    for await (const chunk of iter) {
      const msg = chunk?.message
      if (msg) {
        // content + thinking deltas → normalized text/reasoning/answer_superseded events
        for (const ev of reclass.push(msg)) yield ev

        if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
          for (const call of msg.tool_calls) {
            const id = call.id || `idx_${toolCalls.length}`
            if (!seenToolCallIds.has(id)) {
              seenToolCallIds.add(id)
              const normalized = { ...call, id }
              toolCalls.push(normalized)
              yield { type: 'tool_call', call: normalized }
            }
          }
        }
      }

      if (chunk?.done) {
        if (chunk.done_reason) finishReason = chunk.done_reason
        usage = {
          promptTokens: chunk.prompt_eval_count ?? null,
          completionTokens: chunk.eval_count ?? null,
          promptEvalMs: chunk.prompt_eval_duration != null ? Math.round(chunk.prompt_eval_duration / 1e6) : null,
        }
      }
    }
    streamEnded = true
  } catch (error) {
    yield {
      type: 'error',
      code: 'provider_stream_failed',
      message: error?.message || String(error),
    }
    return
  } finally {
    // TEARING THIS STREAM DOWN MUST ABORT THE UPSTREAM REQUEST. Nothing else in the chain does it:
    // ollama-js's parseJSON is a bare async generator over `response.body.getReader()` with NO
    // finally, so returning the iterator (our first-token watchdog firing, a user's Stop, or a
    // steer cutting the round) neither cancels the reader nor aborts the AbortController that
    // ollama-js wired into the fetch. The request therefore stays OPEN: ollama keeps generating
    // into a body nobody reads, the socket's send buffer fills, and the runner BLOCKS ON WRITE —
    // holding its VRAM, ignoring keep_alive expiry (it still has an "active" request), and
    // refusing to unload. Every abandoned stream leaked one of these, so they accumulated until
    // the runner served nothing at all: Ote's "many time this happened".
    // MEASURED 2026-07-31 on the wedged instance: qwen3.6:35b pinned at 25GB VRAM with ~0 CPU,
    // 7 minutes past its own keep_alive expiry, `keep_alive: 0` accepted (done_reason "unload")
    // and ignored, a 3-token request unanswered for 45s, and NO other model loadable — only an
    // Ollama restart cleared it.
    // The OpenAI SDK gets this right (`finally { if (!done) controller.abort() }` in
    // core/streaming.js) and is why openai-compatible never had this bug; this is that same
    // contract, applied by hand because ollama-js omits it.
    if (!streamEnded) { try { iter.abort?.() } catch { /* teardown is best-effort */ } }
  }

  const { content, reasoning } = reclass.result() // content = final run only; reasoning = thinking + folded drafts
  const finalMessage = normalizeMessage(
    {
      role: 'assistant',
      content,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      ...(reasoning ? { reasoning_content: reasoning } : {}),
    },
    { reasoningEnabled }
  )

  yield { type: 'done', usage, finalMessage, finishReason }
}

export async function healthCheck({ host } = {}) {
  const base = (host || 'http://127.0.0.1:11434').replace(/\/+$/, '')
  try {
    const response = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return { status: response.ok ? 'online' : 'degraded', detail: `HTTP ${response.status}` }
  } catch (error) {
    return { status: 'offline', detail: error?.message || String(error) }
  }
}

// Embeddings via /api/embed (works for dedicated embedding models AND, with lower
// quality, generative models — Ollama mean-pools their hidden states).
// `numCtx` caps the loaded context window — memory inputs are short, and the embed model's
// DEFAULT window is huge (qwen3-embedding:4b loads at ~10GB VRAM vs ~3GB at num_ctx 512), which
// otherwise evicts the chat model → reload thrash. `keepAlive` keeps the small embedder resident
// so it doesn't reload (5-7s) on every recall/capture. `numGpu` = layers offloaded to the GPU;
// 0 forces pure CPU (0 VRAM → the whole GPU stays free for the chat model's context; the small
// embedder runs on CPU in ~1-2s). -> { embeddings: [[...]], promptTokens }
export async function embed({ host, model, input, numCtx = null, keepAlive = null, numGpu = null } = {}) {
  const client = getClient(host)
  const inputs = Array.isArray(input) ? input : [input]
  const req = { model, input: inputs }
  const options = {}
  if (Number.isInteger(numCtx) && numCtx > 0) options.num_ctx = numCtx
  if (Number.isInteger(numGpu) && numGpu >= 0) options.num_gpu = numGpu
  if (Object.keys(options).length) req.options = options
  if (keepAlive != null) req.keep_alive = keepAlive
  const res = await client.embed(req)
  return {
    embeddings: res?.embeddings || [],
    promptTokens: res?.prompt_eval_count ?? null,
  }
}
