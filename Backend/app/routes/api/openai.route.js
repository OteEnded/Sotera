// OpenAI-standard API surface (registered under /api/openai/v1).
//
// The platform's PRIMARY standard — the same OpenAI-compatible gateway that has always lived at
// /v1 (which stays for backward compatibility with Sotera + internal callers). This prefix gives
// OpenAI-SDK clients an explicit, standard-scoped base URL, mirroring how multi-standard
// providers (OpenRouter etc.) expose /api/<standard>/... paths.
//   POST /api/openai/v1/chat/completions   (same handler as /v1/chat/completions)
//   GET  /api/openai/v1/models             (strict OpenAI list format)

import chatRoutes from '../v1/chat.route.js'
import embeddingsRoutes from '../v1/embeddings.route.js'
import { listAllModels } from '../../chat-runtime/index.js'
import { requireScopes } from '../../auth/index.js'

export default async function openaiRoutes(fastify) {
  // Reuse the exact OpenAI-compatible plugins (register /chat/completions + /embeddings).
  await fastify.register(chatRoutes)
  await fastify.register(embeddingsRoutes)

  fastify.get('/models', { preHandler: requireScopes(['models.read']) }, async (request, reply) => {
    const { models } = await listAllModels({ serverConfig: fastify.config, userId: request.apiKey?.userId ?? null })
    return reply.send({
      object: 'list',
      data: models.map((m) => ({ id: m.id, object: 'model', created: 0, owned_by: m.ownedBy })),
    })
  })
}
