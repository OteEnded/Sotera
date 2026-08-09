import authRoutes from './auth.route.js'
import chatRoutes from './chat.route.js'
import providersRoutes from './providers.route.js'
import adminRoutes from './admin.route.js'
import skillsAdminRoutes from './skills-admin.route.js'
import componentsAdminRoutes from './components-admin.route.js'
import memoriesAdminRoutes from './memories-admin.route.js'
import schedulesRoutes from './schedules.route.js'
import hooksRoutes from './hooks.route.js'
import chatSiteRoutes from './chat-site.route.js'
import meKeysRoutes from './me-keys.route.js'
import mePrefsRoutes from './me-prefs.route.js'
import meFeedbackRoutes from './me-feedback.route.js'
import meLimitsRoutes from './me-limits.route.js'
import embeddingsRoutes from './embeddings.route.js'

export default async function v1Routes(fastify) {
  // Each register() is its own encapsulated context, so per-plugin preHandler
  // hooks (admin role-gating, chat-site login) don't leak onto the others.
  await fastify.register(authRoutes)
  await fastify.register(chatRoutes)
  await fastify.register(providersRoutes)
  await fastify.register(adminRoutes)
  await fastify.register(skillsAdminRoutes)
  await fastify.register(componentsAdminRoutes)
  await fastify.register(memoriesAdminRoutes)
  await fastify.register(schedulesRoutes)
  await fastify.register(hooksRoutes) // PUBLIC webhook fires — no login hook on purpose
  await fastify.register(chatSiteRoutes)
  await fastify.register(meKeysRoutes)
  await fastify.register(mePrefsRoutes)
  await fastify.register(meFeedbackRoutes)
  await fastify.register(meLimitsRoutes)
  await fastify.register(embeddingsRoutes)
}
