// Anthropic-standard API surface (registered under /api/anthropic/v1).
//
// Speaks the Anthropic Messages API so Anthropic SDK clients — notably Claude Code via
// ANTHROPIC_BASE_URL=http://host:8201/api/anthropic — can use this platform as their provider.
//   POST /api/anthropic/v1/messages                (stream + non-stream)
//   POST /api/anthropic/v1/messages/count_tokens
//   GET  /api/anthropic/v1/models                  (claude-* aliases first, then platform ids)
//
// Auth: Anthropic clients send `x-api-key: <key>` (ANTHROPIC_API_KEY) or
// `Authorization: Bearer <key>` (ANTHROPIC_AUTH_TOKEN) — both resolve to platform API keys.
// Errors use the Anthropic envelope { type:'error', error:{ type, message } }.

import { chat as gatewayChat, streamChat as gatewayStreamChat, listAllModels, parseModelRef, GatewayError } from '../../chat-runtime/index.js'
import { resolveApiKey } from '../../auth/index.js'
import { ownerIdOf } from '../../auth/owner.js'
import { getSetting } from '../../settings/index.js'
import { checkTokenBudget } from '../../usage/limits.js'
import {
  anthropicError,
  estimateTokens,
  resolveAnthropicModel,
  toInternalRequest,
  toAnthropicMessage,
  AnthropicStreamWriter,
  ANTHROPIC_SSE_HEADERS,
} from '../../api-standards/anthropic.js'

function extractKey(request) {
  const xKey = request.headers['x-api-key']
  if (xKey && typeof xKey === 'string') return xKey.trim()
  const header = request.headers.authorization
  const match = typeof header === 'string' ? /^Bearer\s+(.+)$/i.exec(header) : null
  return match ? match[1].trim() : null
}

// Anthropic-flavored auth preHandler: x-api-key OR Bearer -> platform api_keys + scope check.
function requireScopesAnthropic(required) {
  return async function anthropicAuth(request, reply) {
    const token = extractKey(request)
    if (!token) {
      return reply.code(401).send(anthropicError('authentication_error', 'Missing API key. Send x-api-key: <key> or Authorization: Bearer <key>.'))
    }
    const apiKey = await resolveApiKey(request.server.db, token, request.server.config)
    if (!apiKey) {
      return reply.code(401).send(anthropicError('authentication_error', 'invalid x-api-key'))
    }
    for (const scope of required) {
      if (!apiKey.scopes.includes(scope)) {
        return reply.code(403).send(anthropicError('permission_error', `API key '${apiKey.name}' lacks the '${scope}' scope`))
      }
    }
    request.apiKey = apiKey
  }
}

// Settings-table overlay for this surface: root edits the claude routing from the
// console (System → API); config.json api.anthropic stays the file default underneath.
function effectiveConfig(fastify) {
  const base = fastify.config || {}
  return {
    ...base,
    api: {
      ...(base.api || {}),
      anthropic: {
        ...(base.api?.anthropic || {}),
        modelMap: getSetting(base, 'api.anthropic.modelMap'),
        defaultModel: getSetting(base, 'api.anthropic.defaultModel') || null, // '' -> chat default
        advertisedModels: getSetting(base, 'api.anthropic.advertisedModels'),
      },
    },
  }
}

export default async function anthropicRoutes(fastify) {
  // ---- POST /messages -------------------------------------------------------
  fastify.route({
    method: 'POST',
    url: '/messages',
    schema: {
      body: {
        type: 'object',
        required: ['model', 'messages'],
        properties: {
          model: { type: 'string', minLength: 1 },
          messages: { type: 'array' },
        },
        additionalProperties: true, // the Anthropic SDK sends many optional fields
      },
    },
    preHandler: async (request, reply) => {
      const wantsStream = Boolean(request.body?.stream)
      return requireScopesAnthropic(wantsStream ? ['chat', 'streaming'] : ['chat'])(request, reply)
    },
    handler: async (request, reply) => {
      const serverConfig = fastify.config
      const body = request.body
      const wantsStream = Boolean(body.stream)
      const requestedModel = body.model

      // Token budget gate — Anthropic clients (Claude Code) meter into the same per-user budget.
      const limitHit = await checkTokenBudget(fastify, ownerIdOf(request.apiKey, 'this API-key request'), request.log)
      if (limitHit) return reply.code(429).send(anthropicError('rate_limit_error', limitHit.message))

      const { modelId, mapped } = resolveAnthropicModel(effectiveConfig(fastify), requestedModel)
      if (!modelId) {
        return reply.code(400).send(anthropicError('invalid_request_error',
          `No model mapping for '${requestedModel}'. Configure the map on the console System → API tab (or api.anthropic in Backend/config.json), or request "<provider>/<model>".`))
      }
      if (mapped) request.log?.debug?.(`[anthropic] model '${requestedModel}' -> '${modelId}'`)

      const startedAt = Date.now()
      let firstTokenAt = null
      // Best-effort usage log, keyed to the calling API key (logs the RESOLVED platform model).
      const clip = (s, n = 20000) => (s && s.length > n ? s.slice(0, n) + '…[truncated]' : s)
      const logUsage = async (provider, usage, response) => {
        try {
          await fastify.db?.log_usage?.create({
            // key owner stamped too — attribution/budget must survive key deletion
            user_id: ownerIdOf(request.apiKey, 'this API-key request'),
            api_key_id: request.apiKey?.apiKeyId ?? null,
            provider, model: modelId, endpoint: 'anthropic.messages',
            prompt_tokens: usage?.promptTokens ?? null,
            completion_tokens: usage?.completionTokens ?? null,
            ttft_ms: firstTokenAt ? firstTokenAt - startedAt : null,
            latency_ms: Date.now() - startedAt,
            request_body: clip(JSON.stringify({ requestedModel, system: body.system, messages: body.messages, tools: (body.tools || []).map((t) => t?.name) })),
            response_body: response ? clip(JSON.stringify(response)) : null,
          })
        } catch { /* logging must never break the API */ }
      }

      try {
        const { provider, model } = parseModelRef({ model: modelId })
        const internal = toInternalRequest(body)
        // BYOK: the key owner's own provider rows apply to their API calls too
        const gwReq = { provider, model, messages: internal.messages, tools: internal.tools, options: internal.options, userId: ownerIdOf(request.apiKey, 'this API-key request') }

        if (!wantsStream) {
          const result = await gatewayChat({ serverConfig, request: gwReq })
          await logUsage(provider, result.usage, { text: result.message?.content ?? '', toolCalls: result.message?.tool_calls })
          return reply.send(toAnthropicMessage({ requestedModel, message: result.message, usage: result.usage }))
        }

        // --- streaming: Anthropic named SSE events ---
        reply.raw.writeHead(200, ANTHROPIC_SSE_HEADERS)
        const writer = new AnthropicStreamWriter(reply.raw, {
          requestedModel,
          inputTokens: estimateTokens({ system: body.system, messages: body.messages, tools: body.tools }),
        })
        writer.start()

        let usage = null
        let toolIdx = 0
        let streamedText = ''
        const streamedToolCalls = []
        for await (const evt of gatewayStreamChat({ serverConfig, request: gwReq })) {
          if (reply.raw.writableEnded || reply.raw.destroyed) break
          switch (evt.event) {
            case 'token': if (!firstTokenAt) firstTokenAt = Date.now(); streamedText += evt.data.text; writer.text(evt.data.text); break
            case 'reasoning': if (!firstTokenAt) firstTokenAt = Date.now(); writer.thinking(evt.data.text); break
            case 'tool_call': streamedToolCalls.push({ name: evt.data?.name, args: evt.data?.arguments }); writer.toolUse(evt.data, toolIdx++); break
            case 'done': usage = evt.data?.usage || null; break
            case 'error': writer.error(evt.data?.code, evt.data?.message); break
            default: break // status etc. — not part of the Anthropic protocol
          }
        }
        writer.finish(usage)
        await logUsage(provider, usage, { text: streamedText, toolCalls: streamedToolCalls.length ? streamedToolCalls : undefined })
        return reply
      } catch (error) {
        if (error instanceof GatewayError) {
          if (!wantsStream && !reply.sent) {
            return reply.code(error.statusCode).send(anthropicError(
              error.statusCode === 400 ? 'invalid_request_error' : 'api_error', error.message))
          }
          if (wantsStream && !reply.raw.headersSent) {
            return reply.code(error.statusCode).send(anthropicError(
              error.statusCode === 400 ? 'invalid_request_error' : 'api_error', error.message))
          }
        }
        request.log?.error?.(error)
        if (!reply.sent && !reply.raw.headersSent) {
          return reply.code(500).send(anthropicError('api_error', error?.message || 'Internal error'))
        }
        if (!reply.raw.writableEnded) reply.raw.end()
        return reply
      }
    },
  })

  // ---- POST /messages/count_tokens -------------------------------------------
  // Rough estimate (chars/4) — enough for the SDK's context-window bookkeeping.
  fastify.post('/messages/count_tokens', { preHandler: requireScopesAnthropic(['chat']) }, async (request, reply) => {
    const b = request.body || {}
    return reply.send({ input_tokens: estimateTokens({ system: b.system, messages: b.messages, tools: b.tools }) })
  })

  // ---- GET /models ------------------------------------------------------------
  // Anthropic models-list shape: claude-facing ALIASES first (Anthropic clients — the
  // Claude desktop app's gateway discovery in particular — only treat claude-* ids as
  // usable), then the platform's aggregated "<provider>/<model>" ids. Aliases come from
  // config `api.anthropic.advertisedModels`, else the exact (non-wildcard) modelMap keys,
  // else a representative built-in set whenever a wildcard mapping / defaultModel would
  // resolve them anyway. display_name shows where each alias actually routes.
  fastify.get('/models', { preHandler: requireScopesAnthropic(['chat']) }, async (request, reply) => {
    const eff = effectiveConfig(fastify)
    const cfg = eff.api.anthropic
    const { models } = await listAllModels({ serverConfig: fastify.config, userId: ownerIdOf(request.apiKey, 'this API-key request') })

    let aliases = Array.isArray(cfg.advertisedModels) ? cfg.advertisedModels.filter((x) => typeof x === 'string' && x) : []
    if (!aliases.length) aliases = Object.keys(cfg.modelMap || {}).filter((k) => !k.endsWith('*'))
    if (!aliases.length && (Object.keys(cfg.modelMap || {}).length || cfg.defaultModel)) {
      aliases = ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']
    }

    const data = [
      ...aliases.map((id) => {
        const { modelId } = resolveAnthropicModel(eff, id)
        return { type: 'model', id, display_name: modelId ? `${id} → ${modelId}` : id, created_at: '2025-01-01T00:00:00Z' }
      }),
      ...models.map((m) => ({ type: 'model', id: m.id, display_name: m.id, created_at: '2025-01-01T00:00:00Z' })),
    ]
    return reply.send({ data, has_more: false, first_id: data[0]?.id ?? null, last_id: data[data.length - 1]?.id ?? null })
  })
}
