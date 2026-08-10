import { chat as gatewayChat, streamChat as gatewayStreamChat, parseModelRef, GatewayError } from '../../chat-runtime/index.js'
import { toChatCompletion, makeStreamFormatter, sseData, SSE_DONE, OPENAI_SSE_HEADERS } from '../../chat-runtime/openai.js'
import { requireScopes } from '../../auth/index.js'
import { ownerIdOf } from '../../auth/owner.js'
import { checkTokenBudget } from '../../usage/limits.js'

// OpenAI-compatible chat completions.
//   POST /v1/chat/completions
//   body: { model: "<provider>/<model>", messages, stream?, temperature?, max_tokens?, tools?, ... }
//   (an explicit "provider" field is also accepted for internal callers)
//
// Schema is permissive: OpenAI clients send many optional fields. We only
// require model + messages and let everything else through.
const chatRequestSchema = {
  type: 'object',
  required: ['model', 'messages'],
  properties: {
    model: { type: 'string', minLength: 1 },
    messages: { type: 'array', minItems: 1 },
  },
  additionalProperties: true,
}

// Map an OpenAI request body to our normalized gateway options.
function buildOptions(body) {
  const o = { stream: Boolean(body.stream) }
  if (body.temperature != null) o.temperature = body.temperature
  if (body.top_p != null) o.top_p = body.top_p
  const maxTok = body.max_tokens ?? body.max_completion_tokens
  if (maxTok != null) o.max_tokens = maxTok
  if (body.seed != null) o.seed = body.seed
  if (body.reasoning) o.reasoning = body.reasoning // our extension; passthrough
  return o
}

export default async function chatRoutes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/chat/completions',
    schema: { body: chatRequestSchema },
    preHandler: async (request, reply) => {
      const wantsStream = Boolean(request.body?.stream)
      return requireScopes(wantsStream ? ['chat', 'streaming'] : ['chat'])(request, reply)
    },
    handler: async (request, reply) => {
      const serverConfig = fastify.config
      const body = request.body
      const wantsStream = Boolean(body.stream)
      const modelId = body.model // echoed back verbatim in responses
      const startedAt = Date.now()
      let firstTokenAt = null

      // Token budget gate — the key owner's per-user limit covers their API keys too.
      const limitHit = await checkTokenBudget(fastify, ownerIdOf(request.apiKey, 'this API-key request'), request.log)
      if (limitHit) return reply.code(429).send({ error: { code: limitHit.code, message: limitHit.message, budget: limitHit.budget } })

      // Best-effort usage log, keyed to the calling API key — never blocks the response.
      const clip = (s, n = 20000) => (s && s.length > n ? s.slice(0, n) + '…[truncated]' : s)
      // Image payloads (base64 data URLs, content-parts or message.images) would blow the
      // clip on their own — log a placeholder instead, same as the chat site does.
      const stripImages = (messages) => (messages || []).map((m) => {
        let out = m
        if (Array.isArray(m?.content)) {
          out = { ...out, content: m.content.map((p) => (p?.type === 'image_url' || p?.type === 'image') ? { type: p.type, image_url: '[image]' } : p) }
        }
        if (Array.isArray(m?.images) && m.images.length) {
          out = { ...out, images: `[${m.images.length} image(s)]` }
        }
        return out
      })
      const logUsage = async (provider, usage, response) => {
        try {
          await fastify.db?.log_usage?.create({
            // key owner stamped too: attribution (and the token budget) must survive
            // the key being deleted later — display still prefers the key's owner
            user_id: ownerIdOf(request.apiKey, 'this API-key request'),
            api_key_id: request.apiKey?.apiKeyId ?? null,
            provider, model: modelId, endpoint: 'chat.completions',
            prompt_tokens: usage?.promptTokens ?? null,
            completion_tokens: usage?.completionTokens ?? null,
            ttft_ms: firstTokenAt ? firstTokenAt - startedAt : null,
            latency_ms: Date.now() - startedAt,
            request_body: clip(JSON.stringify({ messages: stripImages(body.messages), tools: body.tools })),
            response_body: response ? clip(JSON.stringify(response)) : null,
          })
        } catch { /* logging must never break the API */ }
      }

      try {
        const { provider, model } = parseModelRef(body)
        const gwReq = {
          provider,
          model,
          messages: body.messages,
          tools: body.tools,
          options: buildOptions(body),
          // BYOK: the key owner's own provider rows apply to their API calls too
          userId: ownerIdOf(request.apiKey, 'this API-key request'),
        }

        if (!wantsStream) {
          const result = await gatewayChat({ serverConfig, request: gwReq })
          await logUsage(provider, result.usage, { text: result.message?.content ?? '', toolCalls: result.message?.tool_calls })
          return reply.send(toChatCompletion({ modelId, message: result.message, usage: result.usage }))
        }

        // --- streaming: OpenAI chat.completion.chunk + [DONE] ---
        reply.raw.writeHead(200, OPENAI_SSE_HEADERS)
        const fmt = makeStreamFormatter(modelId)
        const write = (obj) => {
          reply.raw.write(sseData(obj))
          if (typeof reply.raw.flush === 'function') reply.raw.flush()
        }

        let roleSent = false
        let toolIdx = 0
        let finishReason = 'stop'
        let usage = null
        let streamedText = ''
        const streamedToolCalls = []

        const sendRoleOnce = () => {
          if (!roleSent) { write(fmt.role()); roleSent = true }
        }

        for await (const evt of gatewayStreamChat({ serverConfig, request: gwReq })) {
          if (reply.raw.writableEnded || reply.raw.destroyed) break
          switch (evt.event) {
            case 'status':
              break // not part of OpenAI's format — drop
            case 'token':
              if (!firstTokenAt) firstTokenAt = Date.now()
              streamedText += evt.data.text
              sendRoleOnce()
              write(fmt.content(evt.data.text))
              break
            case 'reasoning':
              if (!firstTokenAt) firstTokenAt = Date.now()
              sendRoleOnce()
              write(fmt.reasoning(evt.data.text))
              break
            case 'tool_call':
              sendRoleOnce()
              finishReason = 'tool_calls'
              streamedToolCalls.push({ name: evt.data?.name, args: evt.data?.arguments })
              write(fmt.toolCall(evt.data, toolIdx++))
              break
            case 'done':
              usage = evt.data?.usage || null
              break
            case 'error':
              // surface mid-stream errors as an OpenAI-style error payload, then close
              write({ error: { message: evt.data?.message, code: evt.data?.code } })
              break
            default:
              break
          }
        }

        if (!reply.raw.writableEnded && !reply.raw.destroyed) {
          sendRoleOnce()
          write(fmt.final(finishReason, usage))
          reply.raw.write(SSE_DONE)
          reply.raw.end()
        }
        await logUsage(gwReq.provider, usage, { text: streamedText, toolCalls: streamedToolCalls.length ? streamedToolCalls : undefined })
        return reply
      } catch (error) {
        if (error instanceof GatewayError) {
          if (!reply.sent && !wantsStream) {
            return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } })
          }
          if (!reply.sent && wantsStream) {
            try { reply.raw.writeHead(200, OPENAI_SSE_HEADERS) } catch { /* headers may be sent */ }
            reply.raw.write(sseData({ error: { code: error.code, message: error.message } }))
            reply.raw.write(SSE_DONE)
            reply.raw.end()
            return reply
          }
        }
        request.log?.error?.(error)
        if (!reply.sent) {
          return reply.code(500).send({ error: { code: 'internal_error', message: error?.message || 'Internal error' } })
        }
      }
    },
  })
}
