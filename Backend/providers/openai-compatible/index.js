import OpenAI from 'openai'
import { extractReasoningDelta, normalizeMessage } from '../_shared.js'

function resolveBaseURL(config) {
  const raw = config?.baseURL || config?.apiUrl
  if (!raw) {
    throw new Error('Missing baseURL for openai-compatible provider in Backend/config.json')
  }
  return raw.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '')
}

function ensureKey(config) {
  if (!config?.apiKey) {
    throw new Error(
      `Missing apiKey for openai-compatible provider '${config?.name ?? '?'}'. Set it under providers.<name>.apiKey in Backend/config.json.`
    )
  }
}

function createClient(config) {
  ensureKey(config)
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: resolveBaseURL(config),
    defaultHeaders: config.headers || {},
  })
}

// Translate canonical agent messages -> OpenAI wire shape (tool calls + tool results).
// Plain user/system/assistant messages pass through unchanged.
function toProviderMessages(messages) {
  return (messages || []).map((m) => {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      return {
        role: 'assistant',
        content: m.content || '',
        tool_calls: m.tool_calls.map((tc, i) => ({
          id: tc.id || `call_${i}`,
          type: 'function',
          function: { name: tc.name, arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments ?? {}) },
        })),
      }
    }
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }
    }
    if (Array.isArray(m.images) && m.images.length) {
      // canonical images are data URLs -> OpenAI content-parts (data URLs are accepted)
      return {
        role: m.role,
        content: [
          ...(m.content ? [{ type: 'text', text: m.content }] : []),
          ...m.images.map((u) => ({ type: 'image_url', image_url: { url: u } })),
        ],
      }
    }
    return m
  })
}

// Attach OpenAI sampling params to the request when provided.
function applySampling(request, options = {}) {
  if (options.temperature != null) request.temperature = options.temperature
  if (options.top_p != null) request.top_p = options.top_p
  if (options.max_tokens != null) request.max_tokens = options.max_tokens
  if (options.seed != null) request.seed = options.seed
  return request
}

// Thinking control across OpenAI-compatible providers (best effort — vendors differ):
//   enabled  -> reasoning:{enabled:true} (+ reasoning_effort if a level is given)
//   disabled -> chat_template_kwargs.enable_thinking:false (Qwen/SiliconFlow convention)
function applyReasoning(request, options = {}) {
  const r = options.reasoning
  const enabled = Boolean(r?.enabled)
  if (enabled) {
    request.reasoning = { enabled: true }
    if (r.effort) request.reasoning_effort = r.effort
  } else {
    request.chat_template_kwargs = { ...(request.chat_template_kwargs || {}), enable_thinking: false }
  }
  return request
}

export async function listModels(config) {
  ensureKey(config)
  const baseURL = resolveBaseURL(config)
  const response = await fetch(`${baseURL}/models`, {
    headers: { Authorization: `Bearer ${config.apiKey}`, ...(config.headers || {}) },
  })
  if (!response.ok) {
    throw new Error(`Failed to list provider models (${response.status})`)
  }
  const json = await response.json()
  const items = json.data || json.models || []
  return items.map((m) => ({
    id: m.id || m.name || m.model,
    label: m.id || m.name || m.model,
    ownedBy: m.owned_by || null,
    family: null,
    parameterSize: null,
    // Rich metadata pass-through — OpenRouter-style lists carry these; most vendors don't.
    contextLength: m.context_length ?? null,
    description: m.description || null,
    inputModalities: m.architecture?.input_modalities ?? null,
    supportedParameters: m.supported_parameters ?? null,
  }))
}

export async function chat({ model, messages, tools, options = {}, ...providerConfig }) {
  const client = createClient(providerConfig)
  const reasoningEnabled = Boolean(options.reasoning?.enabled)

  const request = { model, messages: toProviderMessages(messages) }
  if (Array.isArray(tools) && tools.length > 0) request.tools = tools
  applySampling(request, options)
  applyReasoning(request, options)

  const response = await client.chat.completions.create(request)
  if (!response.choices || !response.choices[0]) {
    throw new Error('Invalid response from provider (no choices[0])')
  }

  return {
    message: normalizeMessage(response.choices[0].message, { reasoningEnabled }),
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? null,
      completionTokens: response.usage?.completion_tokens ?? null,
      // provider-side prompt caching: OpenAI reports prompt_tokens_details.cached_tokens,
      // DeepSeek reports prompt_cache_hit_tokens — both mean "input billed at a discount"
      cachedTokens: response.usage?.prompt_tokens_details?.cached_tokens
        ?? response.usage?.prompt_cache_hit_tokens ?? null,
    },
  }
}

export async function* stream({ model, messages, tools, options = {}, ...providerConfig }) {
  let client
  try {
    client = createClient(providerConfig)
  } catch (error) {
    yield { type: 'error', code: 'provider_misconfigured', message: error?.message || String(error) }
    return
  }

  const reasoningEnabled = Boolean(options.reasoning?.enabled)

  const request = { model, messages: toProviderMessages(messages), stream: true }
  if (Array.isArray(tools) && tools.length > 0) request.tools = tools
  applySampling(request, options)
  applyReasoning(request, options)

  // NO teardown finally is needed here, and that is deliberate rather than an omission: the
  // OpenAI SDK's own stream iterator ends with `finally { if (!done) controller.abort() }`
  // (core/streaming.js), so breaking out of the for-await below aborts the upstream request for
  // us. That is the contract the ollama adapter has to implement by hand — ollama-js omits it,
  // and the omission wedged a local runner hard enough to need a service restart. If you ever
  // swap this SDK out, re-check that the replacement aborts on early break.
  let openaiStream
  try {
    openaiStream = await client.chat.completions.create(request)
  } catch (error) {
    yield {
      type: 'error',
      code: 'provider_request_failed',
      message: error?.message || String(error),
    }
    return
  }

  const aggregatedContent = []
  const toolCallsByIndex = new Map()
  let reasoningBuf = ''
  let usage = { promptTokens: null, completionTokens: null }
  let finishReason = null // last non-null choice.finish_reason ('length' = output cap hit)

  try {
    for await (const chunk of openaiStream) {
      const choice = chunk?.choices?.[0]
      if (choice?.finish_reason) finishReason = choice.finish_reason
      const delta = choice?.delta

      if (delta) {
        if (typeof delta.content === 'string' && delta.content.length > 0) {
          aggregatedContent.push(delta.content)
          yield { type: 'text', text: delta.content }
        }

        if (reasoningEnabled) {
          const reasoningDelta = extractReasoningDelta(delta)
          if (reasoningDelta) {
            yield { type: 'reasoning', text: reasoningDelta }
            reasoningBuf += reasoningDelta
          }
        }

        if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
          for (const part of delta.tool_calls) {
            const idx = part.index ?? 0
            const existing =
              toolCallsByIndex.get(idx) ||
              { id: undefined, type: 'function', function: { name: '', arguments: '' } }
            if (part.id) existing.id = part.id
            if (part.type) existing.type = part.type
            if (part.function?.name) existing.function.name += part.function.name
            if (part.function?.arguments) existing.function.arguments += part.function.arguments
            toolCallsByIndex.set(idx, existing)
          }
        }
      }

      if (chunk?.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens ?? null,
          completionTokens: chunk.usage.completion_tokens ?? null,
          cachedTokens: chunk.usage.prompt_tokens_details?.cached_tokens
            ?? chunk.usage.prompt_cache_hit_tokens ?? null,
        }
      }
    }
  } catch (error) {
    yield {
      type: 'error',
      code: 'provider_stream_failed',
      message: error?.message || String(error),
    }
    return
  }

  const toolCalls = Array.from(toolCallsByIndex.entries())
    .sort(([a], [b]) => a - b)
    .map(([, call]) => call)

  for (const call of toolCalls) {
    yield { type: 'tool_call', call }
  }

  const finalMessage = normalizeMessage(
    {
      role: 'assistant',
      content: aggregatedContent.join(''),
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
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
    const response = await fetch(`${baseURL}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}`, ...(config.headers || {}) },
      signal: AbortSignal.timeout(4000),
    })
    return { status: response.ok ? 'online' : 'degraded', detail: `HTTP ${response.status}` }
  } catch (error) {
    return { status: 'offline', detail: error?.message || String(error) }
  }
}

// Embeddings via the standard /embeddings endpoint.
// -> { embeddings: [[...]], promptTokens }
export async function embed({ model, input, ...providerConfig } = {}) {
  const client = createClient(providerConfig)
  const inputs = Array.isArray(input) ? input : [input]
  const res = await client.embeddings.create({ model, input: inputs })
  const sorted = (res?.data || []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  return {
    embeddings: sorted.map((d) => d.embedding),
    promptTokens: res?.usage?.prompt_tokens ?? null,
  }
}
