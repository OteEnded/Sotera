import { requireLogin } from '../../auth/index.js'
import { ownerIdOf } from '../../auth/owner.js'
import { tokenBudgetFor } from '../../usage/limits.js'

// Self-service token budget: how much of today's limit is used, the active boosts
// (feedback rewards / manual grants) and when each expires. Owner-bound — root and
// exempted users get { limited: false }. The chat Options modal renders this, and the
// composer shows it when a send is refused with 429 token_limit_exceeded.
export default async function meLimitsRoutes(fastify) {
  fastify.get('/me/limits', { preHandler: requireLogin() }, async (request) => {
    return tokenBudgetFor(fastify, ownerIdOf(request.user, 'your token budget'))
  })
}
