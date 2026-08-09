import exampleItemRoutes from './template-item.route.js'

export default async function (fastify) {
  // You can add api-level permissions/middleware here in the future
  // fastify.addHook('onRequest', async (request, reply) => {
  //   // Check API access permissions, authentication, etc.
  // })


  fastify.get('/health', async () => {
    return {
      ok: true,
      service: 'FullStack Template API',
      timestamp: new Date().toISOString()
    }
  })

  fastify.get('/template/meta', async () => {
    const dbEnabled = fastify.config?.database?.enabled !== false

    return {
      ok: true,
      data: {
        name: 'FullStack Template',
        frontend: 'React + Vite',
        backend: 'Fastify + Sequelize',
        databaseEnabled: dbEnabled,
        notes: [
          'Use this workspace as a starting point for a new full-stack project.',
          'Replace the example item feature with your own domain models and routes.',
          'When database.enabled is false, API routes still boot but DB-backed features return setup guidance.',
        ],
      },
    }
  })

  await fastify.register(exampleItemRoutes, { prefix: '/template-items' })

  // Future: Add other API routes here
  // await fastify.register(otherRoutes, { prefix: '/other' })
}
