import { embeddings as gatewayEmbeddings, parseModelRef, GatewayError } from '../../chat-runtime/index.js'
import { requireScopes } from '../../auth/index.js'
import { checkTokenBudget } from '../../usage/limits.js'

// OpenAI-compatible embeddings.
//   POST /v1/embeddings  (also mounted under /api/openai/v1)
//   body: { model: "<provider>/<model>", input: string | string[] }
// Requires the `embeddings` scope. Anthropic-kind providers have no embeddings
// endpoint -> clean 400. BYOK: the key owner's own providers apply.
// `input` is deliberately untyped here: Fastify's Ajv coerces scalars into arrays, which
// makes a string match BOTH branches of a oneOf(string|array) and reject valid requests.
// The chat-runtime validates the shape itself (non-empty string or array of strings).
const embeddingsRequestSchema = {
  type: 'object',
  required: ['model', 'input'],
  properties: {
    model: { type: 'string', minLength: 1 },
    input: {},
  },
  additionalProperties: true, // OpenAI clients send encoding_format etc. — tolerated, ignored
}

/**
 * ⛔ OFF BY DEFAULT SINCE 2026-08-08 — Ote's call while closing OLS: *"just disable embedding model for
 * ols … i mean disable so user can use it right, but persona (chat-site) use it directly so, it bypass
 * and still use embed."*
 *
 * ⚠️ THIS DISABLES THE PUBLIC ROUTE ONLY, AND THAT DISTINCTION IS LOAD-BEARING. Memory does NOT come
 * through here — `components/memory-embed.js` imports `embeddings` from `chat-runtime` DIRECTLY, so
 * recall, hybrid search and the dedup gate are untouched by this flag. Anyone tempted to "finish the job"
 * by disabling the embedder itself would silently break every one of those.
 *
 * WHY IT WAS WORTH TURNING OFF RATHER THAN FIXING: the OpenAI embeddings API has a `dimensions`
 * parameter, and this route accepted it and IGNORED it — a client asking for 1024-dim vectors got the
 * model's native size with no error. Honouring it is easy (memory already MRL-truncates internally), but a
 * provider about to run unattended should not carry a standard parameter it silently disregards, and the
 * traffic did not justify the surface: measured over the whole of `log_usage`, 762 rows named
 * `endpoint='embeddings'` — 559 were the INTERNAL embedder (no user, no key), 200 a cache-check stub, and
 * exactly ONE was a real external call, via a key named `test`.
 *
 * Set `api.embeddingsEnabled: true` to bring it back; nothing else changes when you do.
 */
const embeddingsEnabled = (config) => config?.api?.embeddingsEnabled === true

export default async function embeddingsRoutes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/embeddings',
    schema: { body: embeddingsRequestSchema },
    preHandler: requireScopes(['embeddings']),
    handler: async (request, reply) => {
      // 404, not 403: to an OpenAI client this endpoint does not exist here, which is the honest answer
      // and the one their SDKs already handle. A 403 would read as "your key is wrong" and send someone
      // hunting through scopes for a permission that is not the problem.
      if (!embeddingsEnabled(fastify.config)) {
        return reply.code(404).send({
          error: {
            message: 'This deployment does not serve /v1/embeddings. Set api.embeddingsEnabled to enable it.',
            type: 'invalid_request_error',
            code: 'endpoint_disabled',
          },
        })
      }
      const body = request.body
      const startedAt = Date.now()

      // Token budget gate — embeddings meter into the same per-user budget.
      const limitHit = await checkTokenBudget(fastify, request.apiKey?.userId ?? null, request.log)
      if (limitHit) return reply.code(429).send({ error: { code: limitHit.code, message: limitHit.message, budget: limitHit.budget } })

      try {
        const { provider, model } = parseModelRef(body)
        const result = await gatewayEmbeddings({
          serverConfig: fastify.config,
          db: fastify.db, // enables the platform exact-match cache (embeddings.cacheEnabled)
          request: { provider, model, input: body.input, userId: request.apiKey?.userId ?? null },
        })

        // usage log (best-effort; inputs are NOT stored — embeddings often carry bulk private text)
        try {
          const count = Array.isArray(body.input) ? body.input.length : 1
          await fastify.db?.log_usage?.create({
            // key owner stamped too — attribution/budget must survive key deletion
            user_id: request.apiKey?.userId ?? null,
            api_key_id: request.apiKey?.apiKeyId ?? null,
            provider, model: body.model, endpoint: 'embeddings',
            prompt_tokens: result.promptTokens,
            completion_tokens: null,
            latency_ms: Date.now() - startedAt,
            request_body: JSON.stringify({ inputs: `[${count} input(s), text not stored]` }),
            response_body: JSON.stringify({ vectors: result.embeddings.length, dimensions: result.embeddings[0]?.length ?? 0, cached: result.cachedCount || undefined }),
          })
        } catch { /* logging must never break the API */ }

        return reply.send({
          object: 'list',
          data: result.embeddings.map((embedding, index) => ({ object: 'embedding', index, embedding })),
          model: body.model,
          usage: {
            prompt_tokens: result.promptTokens ?? 0,
            total_tokens: result.promptTokens ?? 0,
          },
        })
      } catch (error) {
        if (error instanceof GatewayError) {
          return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } })
        }
        request.log?.error?.(error)
        return reply.code(502).send({ error: { code: 'provider_error', message: error?.message || 'Embeddings request failed' } })
      }
    },
  })
}
