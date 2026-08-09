// Anthropic-standard provider adapter (client side).
//
// Speaks the Anthropic Messages API to any backend that serves it — Anthropic itself,
// or multi-standard vendors' /anthropic routes (e.g. https://api.xiaomimimo.com/anthropic).
// Configure with `kind: "anthropic"`, `baseURL` (WITHOUT /v1 — we append /v1/messages,
// the same convention Anthropic SDKs use) and `apiKey` (sent as x-api-key).
//
// Mirrors the adapter contract of openai-compatible/index.js:
//   listModels(config) / chat({...}) -> { message, usage } / stream({...}) yields
//   { type: 'text' | 'reasoning' | 'tool_call' | 'error' | 'done' } / healthCheck(config).

import { normalizeMessage } from '../_shared.js'

const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MAX_TOKENS = 4096 // Anthropic requires max_tokens; used when the caller sets none

function resolveBaseURL(config) {
  const raw = config?.baseURL || config?.apiUrl
  if (!raw) {
    throw new Error(`Missing baseURL for anthropic provider '${config?.name ?? '?'}'`)
  }
  return raw.replace(/\/v1(\/messages)?\/?$/, '').replace(/\/+$/, '')
}

function headers(config) {
  if (!config?.apiKey) {
    throw new Error(`Missing apiKey for anthropic provider '${config?.name ?? '?'}'`)
  }
  return {
    'x-api-key': config.apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'Content-Type': 'application/json',
    ...(config.headers || {}),
  }
}

// ---- canonical internal -> Anthropic request --------------------------------

// system messages -> top-level `system`; tool turns -> tool_use / tool_result blocks.
// Consecutive tool results merge into ONE user message (Anthropic alternating-turn rule).
function toAnthropicMessages(messages) {
  let system = ''
  const out = []
  for (const m of messages || []) {
    if (m.role === 'system') {
      system += (system ? '\n\n' : '') + (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
      continue
    }
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const blocks = []
      if (m.content) blocks.push({ type: 'text', text: m.content })
      for (const [i, tc] of m.tool_calls.entries()) {
        let input = tc.arguments
        if (typeof input === 'string') { try { input = JSON.parse(input) } catch { input = {} } }
        blocks.push({ type: 'tool_use', id: tc.id || `call_${i}`, name: tc.name, input: input ?? {} })
      }
      out.push({ role: 'assistant', content: blocks })
      continue
    }
    if (m.role === 'tool') {
      const block = {
        type: 'tool_result',
        tool_use_id: m.tool_call_id,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }
      const prev = out[out.length - 1]
      if (prev && prev.role === 'user' && Array.isArray(prev.content) && prev.content.every((b) => b.type === 'tool_result')) {
        prev.content.push(block) // merge consecutive tool results into one user turn
      } else {
        out.push({ role: 'user', content: [block] })
      }
      continue
    }
    if (Array.isArray(m.images) && m.images.length) {
      // canonical images are data URLs -> Anthropic base64 image blocks
      const blocks = m.images.map((u) => {
        const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(String(u))
        return match
          ? { type: 'image', source: { type: 'base64', media_type: match[1].toLowerCase(), data: match[2] } }
          : null
      }).filter(Boolean)
      if (m.content) blocks.push({ type: 'text', text: m.content })
      out.push({ role: m.role, content: blocks })
      continue
    }
    out.push({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })
  }
  return { system: system || undefined, messages: out }
}

// OpenAI-shaped tools -> Anthropic tools.
function toAnthropicTools(tools) {
  if (!Array.isArray(tools) || !tools.length) return undefined
  return tools.map((t) => ({
    name: t.function?.name ?? t.name,
    description: t.function?.description ?? t.description ?? '',
    input_schema: t.function?.parameters ?? t.input_schema ?? { type: 'object', properties: {} },
  }))
}

function buildRequest({ model, messages, tools, options = {} }) {
  const { system, messages: msgs } = toAnthropicMessages(messages)
  const request = {
    model,
    max_tokens: options.max_tokens ?? DEFAULT_MAX_TOKENS,
    messages: msgs,
  }
  if (system) request.system = system
  const anthropicTools = toAnthropicTools(tools)
  if (anthropicTools) request.tools = anthropicTools
  if (options.temperature != null) request.temperature = options.temperature
  if (options.top_p != null) request.top_p = options.top_p
  // Reasoning OFF is explicit; ON keeps the vendor's default thinking behavior
  // (real Anthropic budgets vary by model — we don't guess budget_tokens).
  if (options.reasoning && options.reasoning.enabled === false) {
    request.thinking = { type: 'disabled' }
  }
  // Prompt caching (options.cacheControl — set by the chat runtime for CONVERSATIONS,
  // where the next turn extends this exact prefix): two breakpoints, the standard chat
  // pattern. The system block (a breakpoint covers everything before it: tools → system)
  // and the last message — so the following turn reads the whole history at 0.1× input
  // price instead of full price. Writes cost 1.25×, which is why one-shot calls (no
  // cacheControl) are never marked.
  if (options.cacheControl) {
    if (request.system) {
      request.system = [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }]
    }
    const last = request.messages[request.messages.length - 1]
    if (last) {
      if (typeof last.content === 'string') last.content = [{ type: 'text', text: last.content }]
      const lastBlock = Array.isArray(last.content) && last.content.length ? last.content[last.content.length - 1] : null
      if (lastBlock) lastBlock.cache_control = { type: 'ephemeral' }
    }
  }
  return request
}

// ---- Anthropic response -> canonical message --------------------------------

function fromAnthropicMessage(msg, { reasoningEnabled }) {
  let content = ''
  let reasoning = ''
  const toolCalls = []
  for (const block of msg?.content || []) {
    if (block.type === 'text') content += block.text || ''
    else if (block.type === 'thinking') reasoning += block.thinking || ''
    else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
      })
    }
  }
  return normalizeMessage(
    {
      role: 'assistant',
      content,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      ...(reasoning ? { reasoning_content: reasoning } : {}),
    },
    { reasoningEnabled }
  )
}

// ---- adapter surface ----------------------------------------------------------

export async function listModels(config) {
  const baseURL = resolveBaseURL(config)
  const response = await fetch(`${baseURL}/v1/models`, { headers: headers(config) })
  if (response.status === 404) {
    // Many vendor /anthropic routes only implement /v1/messages — not an outage.
    throw new Error('This Anthropic route has no /v1/models endpoint — enter the model id manually')
  }
  if (!response.ok) {
    throw new Error(`Failed to list provider models (${response.status})`)
  }
  const json = await response.json()
  const items = json.data || json.models || []
  return items.map((m) => ({
    id: m.id || m.name || m.model,
    label: m.display_name || m.id || m.name || m.model,
    ownedBy: null,
    family: null,
    parameterSize: null,
  }))
}

export async function chat({ model, messages, tools, options = {}, ...providerConfig }) {
  const baseURL = resolveBaseURL(providerConfig)
  const reasoningEnabled = Boolean(options.reasoning?.enabled)
  const response = await fetch(`${baseURL}/v1/messages`, {
    method: 'POST',
    headers: headers(providerConfig),
    body: JSON.stringify(buildRequest({ model, messages, tools, options })),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Anthropic provider error ${response.status}: ${text.slice(0, 300)}`)
  }
  const json = await response.json()
  return {
    message: fromAnthropicMessage(json, { reasoningEnabled }),
    usage: {
      promptTokens: json.usage?.input_tokens ?? null,
      completionTokens: json.usage?.output_tokens ?? null,
      // provider-side prompt caching: reads billed at 0.1×, writes at 1.25×
      cachedTokens: json.usage?.cache_read_input_tokens ?? null,
      cacheWriteTokens: json.usage?.cache_creation_input_tokens ?? null,
    },
  }
}

export async function* stream({ model, messages, tools, options = {}, ...providerConfig }) {
  let baseURL, hdrs
  try {
    baseURL = resolveBaseURL(providerConfig)
    hdrs = headers(providerConfig)
  } catch (error) {
    yield { type: 'error', code: 'provider_misconfigured', message: error?.message || String(error) }
    return
  }
  const reasoningEnabled = Boolean(options.reasoning?.enabled)

  // An EXPLICIT abort handle for teardown. Iterating `response.body` and returning early does
  // cancel the stream per spec, but this adapter's contract is too important to leave implicit:
  // an abandoned stream that keeps its request open bills tokens nobody reads (and on a local
  // runner wedges it outright — see the ollama adapter's teardown comment). The finally below
  // is the guarantee; this controller is what makes it possible.
  const abort = new AbortController()
  let response
  try {
    response = await fetch(`${baseURL}/v1/messages`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({ ...buildRequest({ model, messages, tools, options }), stream: true }),
      signal: abort.signal,
    })
  } catch (error) {
    yield { type: 'error', code: 'provider_request_failed', message: error?.message || String(error) }
    return
  }
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '')
    yield { type: 'error', code: 'provider_request_failed', message: `HTTP ${response.status}: ${text.slice(0, 300)}` }
    return
  }

  // Accumulators mirroring the openai-compatible adapter's final shape.
  const aggregatedContent = []
  let reasoningBuf = ''
  const toolBlocks = new Map() // content-block index -> { id, name, json }
  let usage = { promptTokens: null, completionTokens: null }
  let finishReason = null // delta.stop_reason ('max_tokens' = output cap hit)

  // Minimal SSE parse: split on blank lines, take `data:` payloads (named events carry
  // their type inside the JSON as .type, so the `event:` line itself can be ignored).
  const decoder = new TextDecoder()
  let buf = ''
  let streamEnded = false // ran to its natural end — nothing left to abort
  try {
    for await (const chunk of response.body) {
      buf += decoder.decode(chunk, { stream: true })
      let sep
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const rawEvent = buf.slice(0, sep)
        buf = buf.slice(sep + 2)
        const dataLine = rawEvent.split('\n').find((l) => l.startsWith('data:'))
        if (!dataLine) continue
        let evt
        try { evt = JSON.parse(dataLine.slice(5).trim()) } catch { continue }

        switch (evt.type) {
          case 'message_start':
            usage.promptTokens = evt.message?.usage?.input_tokens ?? usage.promptTokens
            usage.cachedTokens = evt.message?.usage?.cache_read_input_tokens ?? usage.cachedTokens ?? null
            usage.cacheWriteTokens = evt.message?.usage?.cache_creation_input_tokens ?? usage.cacheWriteTokens ?? null
            break
          case 'content_block_start':
            if (evt.content_block?.type === 'tool_use') {
              toolBlocks.set(evt.index, { id: evt.content_block.id, name: evt.content_block.name, json: '' })
            }
            break
          case 'content_block_delta': {
            const d = evt.delta
            if (d?.type === 'text_delta' && d.text) {
              aggregatedContent.push(d.text)
              yield { type: 'text', text: d.text }
            } else if (d?.type === 'thinking_delta' && d.thinking) {
              reasoningBuf += d.thinking
              if (reasoningEnabled) yield { type: 'reasoning', text: d.thinking }
            } else if (d?.type === 'input_json_delta' && d.partial_json) {
              const tb = toolBlocks.get(evt.index)
              if (tb) tb.json += d.partial_json
            }
            break
          }
          case 'message_delta':
            usage.completionTokens = evt.usage?.output_tokens ?? usage.completionTokens
            if (evt.delta?.stop_reason) finishReason = evt.delta.stop_reason
            break
          case 'error':
            yield { type: 'error', code: evt.error?.type || 'provider_error', message: evt.error?.message || 'provider error' }
            break
          default:
            break // ping, content_block_stop, message_stop
        }
      }
    }
    streamEnded = true
  } catch (error) {
    yield { type: 'error', code: 'provider_stream_failed', message: error?.message || String(error) }
    return
  } finally {
    // Abandoned early (watchdog / Stop / steer) → cancel the request instead of paying for
    // output nobody will read.
    if (!streamEnded) { try { abort.abort() } catch { /* teardown is best-effort */ } }
  }

  const toolCalls = Array.from(toolBlocks.entries())
    .sort(([a], [b]) => a - b)
    .map(([, tb]) => ({ id: tb.id, type: 'function', function: { name: tb.name, arguments: tb.json || '{}' } }))
  for (const call of toolCalls) {
    yield { type: 'tool_call', call }
  }

  const finalMessage = normalizeMessage(
    {
      role: 'assistant',
      content: aggregatedContent.join(''),
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      ...(reasoningBuf ? { reasoning_content: reasoningBuf } : {}),
    },
    { reasoningEnabled }
  )
  yield { type: 'done', usage, finalMessage, finishReason }
}

export async function healthCheck(config = {}) {
  try {
    const baseURL = resolveBaseURL(config)
    if (!config.apiKey) return { status: 'unconfigured', detail: 'missing apiKey' }
    const response = await fetch(`${baseURL}/v1/models`, {
      headers: headers(config),
      signal: AbortSignal.timeout(4000),
    })
    if (response.ok) return { status: 'online', detail: `HTTP ${response.status}` }
    // 404 = the route answers but has no models endpoint (common on vendor /anthropic
    // routes that only serve /v1/messages) — reachable, not degraded.
    if (response.status === 404) return { status: 'online', detail: 'reachable (no /v1/models on this route)' }
    if (response.status === 401 || response.status === 403) return { status: 'degraded', detail: `auth rejected (HTTP ${response.status})` }
    return { status: 'degraded', detail: `HTTP ${response.status}` }
  } catch (error) {
    return { status: 'offline', detail: error?.message || String(error) }
  }
}
