import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { requireLogin, sha256, KNOWN_SCOPES } from '../../auth/index.js'
import { requireCapability } from '../../auth/permissions.js'
import { encryptRawKey, decryptRawKey } from '../../auth/key-vault.js'
import { revealLimiter } from '../../auth/rate-limit.js'
import { getSetting } from '../../settings/index.js'

// Self-service API keys (owner = the logged-in user) — the developer tier's surface.
// Same storage/behavior as admin-minted keys: hash auth, encrypted raw for re-copy
// behind a credential re-check (audited in key_reveal_logs), scope rows, soft delete.
// Differences from the admin surface: the 'admin' scope can never be self-granted,
// the system chat key stays read-only, and everything is bound to owner_user_id —
// nobody else's keys are visible or addressable here. Root is redirected to the
// admin page (root keys have owner NULL, which this surface can't express).

const SELF_SCOPES = KNOWN_SCOPES.filter((s) => s !== 'admin')

function generateRawKey(keyName) {
  const slug = String(keyName || 'key').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'key'
  const random = crypto.randomBytes(24).toString('hex')
  return `sk_${slug}_${random}`
}

export default async function meKeysRoutes(fastify) {
  fastify.addHook('preHandler', requireLogin())
  fastify.addHook('preHandler', requireCapability('own_keys'))
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.user.isRoot) {
      return reply.code(400).send({ error: { code: 'root_uses_admin', message: 'Root manages keys on the API Keys admin page — this surface is for DB users.' } })
    }
  })

  const serializeKey = (k) => ({
    id: k.id,
    kind: k.kind || 'standard', // 'chat' = system key (auto-managed, read-only)
    canReveal: Boolean(k.key_encrypted),
    name: k.name,
    description: k.description,
    keyPrefix: k.key_prefix,
    scopes: (k.scopes || []).map((s) => s.scope),
    isActive: k.is_active,
    expiresAt: k.expires_at,
    lastUsedAt: k.last_used_at,
    createdAt: k.created_at,
  })

  const ownKey = (request, id) =>
    fastify.db.mst_api_keys.findOne({ where: { id, owner_user_id: request.user.id }, include: [{ association: 'scopes' }] })

  fastify.get('/me/apikeys', async (request) => {
    const keys = await fastify.db.mst_api_keys.findAll({
      where: { owner_user_id: request.user.id },
      include: [{ association: 'scopes' }],
      order: [['rolling_id', 'ASC']],
    })
    return { apiKeys: keys.map(serializeKey), allowedScopes: SELF_SCOPES }
  })

  // Mint. The RAW key is returned EXACTLY ONCE — only its hash authenticates.
  fastify.post('/me/apikeys', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80 },
          description: { type: 'string', maxLength: 500 },
          scopes: { type: 'array', items: { type: 'string' } },
          expiresAt: { type: ['string', 'null'] },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { name, description, scopes, expiresAt } = request.body
    const requestedScopes = Array.isArray(scopes) ? [...new Set(scopes.filter((s) => SELF_SCOPES.includes(s)))] : []
    const rawKey = generateRawKey(name)
    const lastUnderscore = rawKey.lastIndexOf('_')
    const apiKey = await fastify.db.mst_api_keys.create({
      owner_user_id: request.user.id,
      key_hash: sha256(rawKey),
      key_encrypted: encryptRawKey(fastify.config, rawKey), // re-copyable behind a credential re-check
      key_prefix: rawKey.slice(0, lastUnderscore + 1),
      name,
      description: description || '',
      is_active: true,
      expires_at: expiresAt || null,
    })
    for (const scope of requestedScopes) {
      await fastify.db.mst_api_key_scopes.findOrCreate({
        where: { api_key_id: apiKey.id, scope },
        defaults: { api_key_id: apiKey.id, scope },
      })
    }
    return reply.code(201).send({
      apiKey: { id: apiKey.id, name: apiKey.name, keyPrefix: apiKey.key_prefix, scopes: requestedScopes },
      rawKey, // shown once; re-copyable later only via the credential re-check
      notice: 'Copy this key now — re-copying later requires re-entering your password.',
    })
  })

  // Configure an own key: rename, re-describe, enable/disable, expiry, replace scopes.
  fastify.patch('/me/apikeys/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80 },
          description: { type: 'string', maxLength: 500 },
          isActive: { type: 'boolean' },
          expiresAt: { type: ['string', 'null'] },
          scopes: { type: 'array', items: { type: 'string' } }, // full replacement set
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const key = await ownKey(request, request.params.id)
    if (!key) return reply.code(404).send({ error: { code: 'key_not_found', message: 'You have no API key with that id' } })
    if ((key.kind || 'standard') !== 'standard') {
      return reply.code(400).send({ error: { code: 'system_key_readonly', message: 'Your system chat key is auto-managed — it cannot be edited' } })
    }
    const { name, description, isActive, expiresAt, scopes } = request.body
    const patch = {}
    if (name !== undefined) patch.name = name
    if (description !== undefined) patch.description = description
    if (isActive !== undefined) patch.is_active = isActive
    if (expiresAt !== undefined) patch.expires_at = expiresAt
    if (Object.keys(patch).length) await key.update(patch)
    if (Array.isArray(scopes)) {
      const wanted = [...new Set(scopes.filter((s) => SELF_SCOPES.includes(s)))]
      await fastify.db.mst_api_key_scopes.destroy({ where: { api_key_id: key.id } })
      for (const scope of wanted) {
        await fastify.db.mst_api_key_scopes.create({ api_key_id: key.id, scope })
      }
    }
    const fresh = await ownKey(request, key.id)
    return reply.send({ apiKey: serializeKey(fresh) })
  })

  // Soft delete (paranoid) — same semantics as the admin surface's default delete.
  fastify.delete('/me/apikeys/:id', async (request, reply) => {
    const key = await ownKey(request, request.params.id)
    if (!key) return reply.code(404).send({ error: { code: 'key_not_found', message: 'You have no API key with that id' } })
    if ((key.kind || 'standard') !== 'standard') {
      return reply.code(400).send({ error: { code: 'system_key_readonly', message: 'Your system chat key is auto-managed — it cannot be deleted' } })
    }
    await key.destroy()
    return reply.send({ ok: true, id: key.id, deleted: true, soft: true })
  })

  // Re-copy an own key: re-enter YOUR password (username is implicitly the session).
  // Same limiter buckets + key_reveal_logs audit trail as the admin reveal.
  fastify.post('/me/apikeys/:id/reveal', {
    schema: {
      body: {
        type: 'object',
        required: ['password'],
        properties: { password: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const key = await ownKey(request, request.params.id)
    if (!key) return reply.code(404).send({ error: { code: 'key_not_found', message: 'You have no API key with that id' } })

    const audit = async (outcome) => {
      try {
        await fastify.db.log_key_reveals.create({
          api_key_id: key.id,
          key_name: key.name,
          key_prefix: key.key_prefix,
          actor_user_id: request.user.id,
          actor_username: request.user.username,
          outcome,
          ip: request.ip || null,
        })
      } catch { /* auditing must never break the endpoint */ }
    }

    const revealOpts = {
      maxAttempts: getSetting(fastify.config, 'security.revealMaxAttempts'),
      windowMs: getSetting(fastify.config, 'security.rateWindowMinutes') * 60_000,
    }
    const limitKey = `reveal:${request.ip}:${request.user.id}`
    const limited = revealLimiter.check(limitKey, revealOpts)
    if (limited.limited) {
      await audit('rate_limited')
      return reply.code(429).send({
        error: { code: 'too_many_attempts', message: `Too many failed attempts — try again in ~${Math.ceil(limited.retryAfterSeconds / 60)} min`, retryAfterSeconds: limited.retryAfterSeconds },
      })
    }

    const me = await fastify.db.mst_users.findByPk(request.user.id)
    const pwMatches = me && me.is_active && (await bcrypt.compare(request.body.password, me.password_hash))
    if (!pwMatches) {
      revealLimiter.recordFailure(limitKey, revealOpts)
      await audit('reauth_failed')
      await new Promise((r) => setTimeout(r, 500)) // blunt brute-force drag
      return reply.code(403).send({ error: { code: 'reauth_failed', message: 'Password does not match your account' } })
    }
    revealLimiter.clear(limitKey)

    if ((key.kind || 'standard') !== 'standard') {
      await audit('system_key')
      return reply.code(400).send({ error: { code: 'system_key_secret', message: 'System keys have no retrievable secret — they exist only to attribute usage' } })
    }
    const rawKey = decryptRawKey(fastify.config, key.key_encrypted)
    if (!rawKey || sha256(rawKey) !== key.key_hash) {
      await audit('not_recoverable')
      return reply.code(409).send({
        error: { code: 'not_recoverable', message: 'This key\'s raw value is not stored (minted before re-copy support, or the encryption secret changed). Mint a new key.' },
      })
    }

    await audit('revealed')
    request.log?.info?.(`[apikeys] key '${key.name}' (${key.id}) revealed to its owner ${request.user.username}`)
    return reply.send({ rawKey })
  })
}
