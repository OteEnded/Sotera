import { Op } from 'sequelize'
import { requireLogin } from '../../auth/index.js'
import { makeLimiter } from '../../auth/rate-limit.js'

// Feedback submits: cap per account per hour (every submit counts). Bounds spam / DB bloat —
// each row can carry up to 3 screenshots (~3MB each) and rows are unbounded otherwise. Root exempt.
const feedbackLimiter = makeLimiter({ maxAttempts: 20, windowMs: 60 * 60 * 1000 })

// Self-service feedback: any logged-in user can submit; it lands in the `feedback`
// table for admins/root to triage (GET/PATCH/DELETE /v1/admin/feedback). Owner-bound
// (user_id = the caller), length-capped. Root has no DB row → stored with user_id NULL.

const CATEGORIES = ['bug', 'idea', 'question', 'praise', 'other']
// Attached screenshots are data URLs, converted to WebP client-side (JPEG fallback on
// browsers that can't encode WebP). Same accepted set as chat images; up to 3.
const IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/
const MAX_FEEDBACK_IMAGES = 3

export default async function meFeedbackRoutes(fastify) {
  fastify.addHook('preHandler', requireLogin())

  // The caller's OWN submissions + current status (submitted → pending → resolved), the
  // team's reply, and whether the resolution earned a reward. Deliberately NO tier/amounts
  // here — the submitter sees THAT they were rewarded, not the size (the actual boost shows
  // in their budget panel anyway). Reply text rides inline; reply images load lazily below.
  fastify.get('/me/feedback', async (request) => {
    const rows = await fastify.db.txn_feedback.findAll({
      // a cancelled item is withdrawn — gone from the submitter's view (admins still see it)
      where: { user_id: request.user.id ?? null, status: { [Op.ne]: 'cancelled' } },
      order: [['rolling_id', 'DESC']],
      limit: 50,
    })
    const grants = rows.length ? await fastify.db.txn_token_grants.findAll({ where: { feedback_id: { [Op.in]: rows.map((r) => r.id) } }, attributes: ['feedback_id'] }) : []
    const rewarded = new Set(grants.map((g) => g.feedback_id))
    return {
      feedback: rows.map((r) => ({
        id: r.id, category: r.category, message: r.message,
        status: r.status, createdAt: r.created_at, takenAt: r.taken_at, handledAt: r.handled_at,
        imageCount: Array.isArray(r.images) ? r.images.length : 0,
        reply: r.reply || null,
        repliedAt: r.replied_at,
        replyImageCount: Array.isArray(r.reply_images) ? r.reply_images.length : 0,
        rewarded: rewarded.has(r.id),
      })),
    }
  })

  // Screenshots for one OWN feedback item — the caller's originals + the team's reply
  // images, fetched lazily (data URLs would bloat the list payload). Owner-bound.
  fastify.get('/me/feedback/:id/images', async (request, reply) => {
    const row = await fastify.db.txn_feedback.findOne({
      where: { id: request.params.id, user_id: request.user.id ?? null, status: { [Op.ne]: 'cancelled' } },
      attributes: ['id', 'images', 'reply_images'],
    })
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'Feedback not found' } })
    return reply.send({
      images: Array.isArray(row.images) ? row.images : [],
      replyImages: Array.isArray(row.reply_images) ? row.reply_images : [],
    })
  })

  // Withdraw an OWN submission. Only while the case is still open (submitted/pending) —
  // a closed item (resolved/rejected) is history. Cancelled items disappear from the
  // submitter's list but stay visible to admins (status=cancelled), so triage keeps context.
  fastify.post('/me/feedback/:id/cancel', async (request, reply) => {
    const row = await fastify.db.txn_feedback.findOne({
      where: { id: request.params.id, user_id: request.user.id ?? null },
    })
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'Feedback not found' } })
    if (row.status !== 'submitted' && row.status !== 'pending') {
      return reply.code(409).send({ error: { code: 'not_cancellable', message: `This feedback is already ${row.status} and can no longer be cancelled` } })
    }
    await row.update({ status: 'cancelled' })
    return { ok: true, status: 'cancelled' }
  })

  fastify.post('/me/feedback', {
    schema: {
      body: {
        type: 'object',
        required: ['message'],
        properties: {
          category: { type: 'string', enum: CATEGORIES },
          message: { type: 'string', minLength: 1, maxLength: 4000 },
          context: { type: 'string', maxLength: 300 },
          images: { type: 'array', items: { type: 'string', maxLength: 3_000_000 }, maxItems: MAX_FEEDBACK_IMAGES },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const message = (request.body.message || '').trim()
    if (!message) return reply.code(400).send({ error: { code: 'empty_feedback', message: 'Feedback message is required' } })
    // rate limit valid submits (root exempt) — bounds looped spam / storage abuse
    if (!request.user.isRoot) {
      const key = `feedback:${request.user.id}`
      const limited = feedbackLimiter.check(key)
      if (limited.limited) {
        return reply.code(429).send({ error: { code: 'too_many_feedback', message: `You've sent a lot of feedback recently — please try again in ~${Math.ceil(limited.retryAfterSeconds / 60)} min.`, retryAfterSeconds: limited.retryAfterSeconds } })
      }
      feedbackLimiter.recordFailure(key)
    }
    const images = (request.body.images || []).filter((u) => typeof u === 'string' && IMAGE_RE.test(u)).slice(0, MAX_FEEDBACK_IMAGES)
    const row = await fastify.db.txn_feedback.create({
      user_id: request.user.id ?? null, // root has no DB row
      category: request.body.category || 'other',
      message,
      context: (request.body.context || '').slice(0, 300) || null,
      images: images.length ? images : null,
      status: 'submitted',
    })
    return reply.code(201).send({ ok: true, id: row.id })
  })
}
