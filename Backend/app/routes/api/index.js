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

  // Future: Add other API routes here
  // await fastify.register(otherRoutes, { prefix: '/other' })
}
