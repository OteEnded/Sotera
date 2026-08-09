import openaiRoutes from './openai.route.js'
import anthropicRoutes from './anthropic.route.js'
import { getSetting } from '../../settings/index.js'

export default async function (fastify) {
  // You can add api-level permissions/middleware here in the future
  // fastify.addHook('onRequest', async (request, reply) => {
  //   // Check API access permissions, authentication, etc.
  // })


  fastify.get('/health', async () => {
    return {
      ok: true,
      service: 'Sotera API',
      timestamp: new Date().toISOString()
    }
  })

  // Public deployment metadata (no secrets). `apiBaseUrl` lets a deployment advertise the
  // public host clients should call (config api.publicBaseUrl) when it differs from the origin
  // the console is browsed at (e.g. behind a proxy/domain). Empty/unset = clients use the origin.
  fastify.get('/meta', async () => {
    const publicBaseUrl = fastify.config?.api?.publicBaseUrl
    return {
      ok: true,
      apiBaseUrl: typeof publicBaseUrl === 'string' && publicBaseUrl.trim() ? publicBaseUrl.trim().replace(/\/+$/, '') : null,
      // the register form shows the live requirement (root-configurable setting)
      passwordMinLength: getSetting(fastify.config, 'security.passwordMinLength'),
    }
  })

  // ---- API standards — one prefix per wire format (like OpenRouter's /api/<standard>/...) ----
  // OpenAI-compatible (the platform's primary standard; /v1 stays as the legacy alias):
  await fastify.register(openaiRoutes, { prefix: '/openai/v1' })
  // Anthropic Messages API (Claude Code: ANTHROPIC_BASE_URL=http://host:8201/api/anthropic):
  await fastify.register(anthropicRoutes, { prefix: '/anthropic/v1' })
}
