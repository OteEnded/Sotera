// Webhook fires — the PUBLIC (unauthenticated) surface of webhook-triggered jobs.
//
// POST /v1/hooks/:id/:token fires one webhook job. The URL is the credential: the token is
// server-minted per job (24 random bytes, lives inside the job's trigger), compared in
// constant time, and every failure mode is a uniform 404 so outsiders can't probe which job
// ids exist. Rails: the schedules feature lever gates it, the platform's minimum-interval
// floor is re-checked per fire (an external caller can't spam past it), and the overlap
// guard drops a fire while the previous run is still going.

import crypto from 'node:crypto'
import { getSetting } from '../../settings/index.js'
import { runtime } from '../../components/runtime.js'
import { jobTriggerId } from '../../schedules/index.js'
import { makeLimiter } from '../../auth/rate-limit.js'

// Per-IP throttle for the PUBLIC fire endpoint — an unauthenticated DB lookup per hit is
// a cheap amplification surface. The interval floor already bounds a VALID caller to one
// fire / few minutes, so a per-minute burst cap only ever catches abuse, never real use.
const fireLimiter = makeLimiter({ maxAttempts: 30, windowMs: 60_000, lockoutMs: 60_000 })

const safeEqual = (a, b) => {
  const A = Buffer.from(String(a))
  const B = Buffer.from(String(b))
  return A.length === B.length && crypto.timingSafeEqual(A, B)
}

export default async function hooksRoutes(fastify) {
  fastify.post('/hooks/:id/:token', async (request, reply) => {
    const notFound = () => reply.code(404).send({ error: { code: 'not_found', message: 'No such hook.' } })
    // per-IP burst throttle (record every hit; 30/min then a 1-min cooldown)
    const ip = request.ip || request.socket?.remoteAddress || 'unknown'
    const lim = fireLimiter.check(ip)
    if (lim.limited) return reply.code(429).send({ error: { code: 'rate_limited', message: 'Too many hook requests — slow down.' } })
    fireLimiter.recordFailure(ip)
    if ((getSetting(fastify.config, 'chat.maxSchedulesPerUser') || 0) <= 0) return notFound()

    let row = null
    try { row = await fastify.db.mst_trigger_jobs.findByPk(request.params.id) } catch { /* junk id — 404 below */ }
    if (!row || row.trigger?.type !== 'webhook' || !row.trigger.token) return notFound()
    if (!safeEqual(request.params.token, row.trigger.token)) return notFound()
    if (!row.enabled) return notFound() // a disabled hook is indistinguishable from a missing one

    const minMs = (getSetting(fastify.config, 'chat.scheduleMinIntervalMinutes') || 5) * 60_000
    const last = row.last_run_at ? new Date(row.last_run_at).getTime() : 0
    if (Date.now() - last < minMs) {
      return reply.code(429).send({ error: { code: 'too_soon', message: 'This hook fired too recently — respect the platform interval floor.' } })
    }

    const fired = runtime.triggers.fireNow(jobTriggerId(row.id))
    if (!fired) return reply.code(409).send({ error: { code: 'already_running', message: 'The previous run is still going.' } })
    return reply.code(202).send({ accepted: true }) // fire-and-forget: results land on the job row
  })

  // Browsers GET — Ote pasted a fire URL into the address bar and got a bare "Route not
  // found", which reads as "webhooks are broken". Answer GET with a STATIC explainer:
  // no lookups, no validation, identical for any id/token, so it leaks nothing about
  // which hooks exist (the uniform-404 posture stays intact) and can never fire a run.
  fastify.get('/hooks/:id/:token', async (_request, reply) => {
    return reply.code(405).send({
      ok: false,
      hint: 'This is a schedule fire URL — it answers to POST only (a browser GET never fires anything). Try: curl -X POST <this url>',
    })
  })
}
