import { listModels, listAllModels, GatewayError } from '../../chat-runtime/index.js'
import { ownerIdOf } from '../../auth/owner.js'
import { listConfiguredProviders } from '../../adapters/index.js'
import { requireScopes } from '../../auth/index.js'

export default async function providersRoutes(fastify) {
  // --- OpenAI-compatible aggregated model list ---
  // GET /v1/models  -> { object:"list", data:[{id:"<provider>/<model>", object:"model", ...}] }
  // This is what OpenAI clients call to discover models.
  fastify.route({
    method: 'GET',
    url: '/models',
    preHandler: requireScopes(['models.read']),
    handler: async (request, reply) => {
      const { models, errors } = await listAllModels({ serverConfig: fastify.config, userId: ownerIdOf(request.apiKey, 'this API-key request') })
      const created = Math.floor(Date.now() / 1000)
      const body = {
        object: 'list',
        data: models.map((m) => ({
          id: m.id,
          object: 'model',
          created,
          owned_by: m.ownedBy,
        })),
      }
      // Non-standard but useful: surface providers that failed to list (bad key / offline).
      if (errors.length) body.errors = errors
      return reply.send(body)
    },
  })

  // --- provider registry (admin/console view) ---
  fastify.route({
    method: 'GET',
    url: '/providers',
    preHandler: requireScopes(['providers.read']),
    handler: async (request, reply) => {
      return reply.send({ providers: listConfiguredProviders(fastify.config, { userId: ownerIdOf(request.apiKey, 'this API-key request') }) })
    },
  })

  // --- per-provider model list (raw model ids, no namespacing) ---
  fastify.route({
    method: 'GET',
    url: '/providers/:name/models',
    schema: {
      params: {
        type: 'object',
        properties: { name: { type: 'string', minLength: 1 } },
        required: ['name'],
      },
    },
    preHandler: requireScopes(['models.read']),
    handler: async (request, reply) => {
      try {
        const models = await listModels({ serverConfig: fastify.config, provider: request.params.name, userId: ownerIdOf(request.apiKey, 'this API-key request') })
        return reply.send({ provider: request.params.name, models })
      } catch (error) {
        if (error instanceof GatewayError) {
          return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } })
        }
        request.log?.error?.(error)
        return reply.code(502).send({
          error: { code: 'provider_unreachable', message: error?.message || 'Failed to reach provider' },
        })
      }
    },
  })
}
