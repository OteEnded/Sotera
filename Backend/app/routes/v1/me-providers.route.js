import { requireLogin } from '../../auth/index.js'
import { requireCapability } from '../../auth/permissions.js'
import { adapters, effectiveProviders, userProvidersFor } from '../../adapters/index.js'
import { rebuildProviderRegistry } from '../../adapters/registry.js'
import { encryptRawKey } from '../../auth/key-vault.js'

// BYOK — self-service provider rows (owner_user_id = the logged-in user).
//
// A user's row with the SAME name as a platform provider overrides it FOR THEM
// (their key serves their calls); a NEW name adds a provider only they can reach.
// Resolution happens per request via the registry's per-user overlay; nothing a
// user configures here is visible to anyone else (root sees an oversight list on
// the admin Providers page). Gated on select_model — members are locked to the
// platform default model, so BYOK would be meaningless for them. Root manages the
// GLOBAL rows on the Providers page instead (owner NULL), not here.

const NAME_PATTERN = '^[a-z0-9][a-z0-9_-]*$'

export default async function meProvidersRoutes(fastify) {
  fastify.addHook('preHandler', requireLogin())
  fastify.addHook('preHandler', requireCapability('select_model'))
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.user.isRoot) {
      return reply.code(400).send({ error: { code: 'root_uses_global', message: 'Root configures platform providers on the Providers page — BYOK rows are for DB users.' } })
    }
  })

  const rebuild = () => rebuildProviderRegistry({ db: fastify.db, config: fastify.config })
  const ownWhere = (request, name) => ({ owner_user_id: request.user.id, ...(name ? { name } : {}) })

  const serialize = (fastify, request, row) => ({
    name: row.name,
    kind: row.kind,
    endpoint: row.endpoint,
    apiKeySet: Boolean(row.api_key_encrypted),
    apiKeyTail: null, // BYOK keys stay write-only; the overlay never surfaces them
    enabled: row.enabled,
    // Same name as a platform provider -> this row overrides it for the owner
    overridesGlobal: Boolean(effectiveProviders(fastify.config)[row.name]),
  })

  fastify.get('/me/providers', async (request) => {
    const rows = await fastify.db.mst_providers.findAll({ where: ownWhere(request), order: [['rolling_id', 'ASC']] })
    return { providers: rows.map((r) => serialize(fastify, request, r)) }
  })

  fastify.post('/me/providers', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'kind', 'endpoint'],
        properties: {
          name: { type: 'string', pattern: NAME_PATTERN, maxLength: 40 },
          kind: { type: 'string', minLength: 1 },
          endpoint: { type: 'string', minLength: 1 },
          apiKey: { type: 'string' },
          enabled: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { name, kind, endpoint, apiKey, enabled } = request.body
    if (!adapters[kind]) {
      return reply.code(400).send({ error: { code: 'kind_unsupported', message: `Provider kind '${kind}' is not supported (${Object.keys(adapters).join(', ')})` } })
    }
    const existing = await fastify.db.mst_providers.findOne({ where: ownWhere(request, name) })
    if (existing) {
      return reply.code(409).send({ error: { code: 'provider_exists', message: `You already have a provider named '${name}'` } })
    }
    const row = await fastify.db.mst_providers.create({
      name,
      kind,
      endpoint,
      api_key_encrypted: apiKey ? encryptRawKey(fastify.config, apiKey) : null,
      enabled: enabled !== false,
      owner_user_id: request.user.id,
    })
    await rebuild()
    return reply.code(201).send({ provider: serialize(fastify, request, row) })
  })

  fastify.patch('/me/providers/:name', {
    schema: {
      body: {
        type: 'object',
        properties: {
          kind: { type: 'string', minLength: 1 },
          endpoint: { type: 'string', minLength: 1 },
          apiKey: { type: ['string', 'null'] }, // undefined = keep, ''/null = clear, string = replace
          enabled: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const row = await fastify.db.mst_providers.findOne({ where: ownWhere(request, request.params.name) })
    if (!row) return reply.code(404).send({ error: { code: 'provider_not_found', message: 'You have no provider by that name' } })
    const { kind, endpoint, apiKey, enabled } = request.body
    if (kind !== undefined && !adapters[kind]) {
      return reply.code(400).send({ error: { code: 'kind_unsupported', message: `Provider kind '${kind}' is not supported (${Object.keys(adapters).join(', ')})` } })
    }
    const patch = {}
    if (kind !== undefined) patch.kind = kind
    if (endpoint !== undefined) patch.endpoint = endpoint
    if (apiKey !== undefined) patch.api_key_encrypted = apiKey ? encryptRawKey(fastify.config, apiKey) : null
    if (enabled !== undefined) patch.enabled = enabled
    if (Object.keys(patch).length) await row.update(patch)
    await rebuild()
    const fresh = await fastify.db.mst_providers.findOne({ where: ownWhere(request, request.params.name) })
    return reply.send({ provider: serialize(fastify, request, fresh) })
  })

  fastify.delete('/me/providers/:name', async (request, reply) => {
    const row = await fastify.db.mst_providers.findOne({ where: ownWhere(request, request.params.name) })
    if (!row) return reply.code(404).send({ error: { code: 'provider_not_found', message: 'You have no provider by that name' } })
    await row.destroy()
    await rebuild()
    return reply.send({ ok: true, name: request.params.name, deleted: true })
  })

  // ---- test surface for the user's OWN providers (mirrors root's provider test) ----
  // Works on disabled rows too — that's exactly when you verify them. The row's cfg
  // comes from the registry overlay (decrypted key in memory only).
  const ownTestable = async (request) => {
    const row = await fastify.db.mst_providers.findOne({ where: ownWhere(request, request.params.name) })
    if (!row) return null
    const cfg = userProvidersFor(fastify.config, request.user.id)[row.name]
    const adapter = adapters[row.kind]
    if (!cfg || !adapter) return null
    return { row, adapter, providerConfig: { ...cfg, name: row.name } }
  }

  fastify.get('/me/providers/:name/health', async (request, reply) => {
    const t = await ownTestable(request)
    if (!t) return reply.code(404).send({ error: { code: 'provider_not_found', message: 'You have no provider by that name' } })
    if (typeof t.adapter.healthCheck !== 'function') return reply.send({ health: { status: 'unknown', detail: 'adapter has no health check' } })
    try {
      return reply.send({ health: await t.adapter.healthCheck(t.providerConfig) })
    } catch (e) {
      return reply.send({ health: { status: 'offline', detail: e?.message || 'unreachable' } })
    }
  })

  fastify.get('/me/providers/:name/models', async (request, reply) => {
    const t = await ownTestable(request)
    if (!t) return reply.code(404).send({ error: { code: 'provider_not_found', message: 'You have no provider by that name' } })
    try {
      return reply.send({ models: await t.adapter.listModels(t.providerConfig) })
    } catch (e) {
      return reply.code(502).send({ error: { code: 'models_failed', message: e?.message || 'Failed to list models' } })
    }
  })

  fastify.post('/me/providers/:name/test', {
    schema: {
      body: {
        type: 'object',
        required: ['model'],
        properties: {
          model: { type: 'string', minLength: 1 },
          prompt: { type: 'string', maxLength: 2000 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const t = await ownTestable(request)
    if (!t) return reply.code(404).send({ error: { code: 'provider_not_found', message: 'You have no provider by that name' } })
    const prompt = request.body.prompt?.trim() || 'Reply with exactly: OK'
    const startedAt = Date.now()
    try {
      // reasoning ON so thinking models don't return an empty-looking reply
      const result = await t.adapter.chat({
        ...t.providerConfig,
        model: request.body.model,
        messages: [{ role: 'user', content: prompt }],
        options: { stream: false, reasoning: { enabled: true }, max_tokens: 1024 },
      })
      const latencyMs = Date.now() - startedAt
      try {
        await fastify.db.log_usage.create({
          user_id: request.user.id,
          provider: request.params.name,
          model: `${request.params.name}/${request.body.model}`,
          endpoint: 'provider.test',
          prompt_tokens: result.usage?.promptTokens ?? null,
          completion_tokens: result.usage?.completionTokens ?? null,
          latency_ms: latencyMs,
          request_body: JSON.stringify({ prompt, byok: true }),
          response_body: JSON.stringify({ text: result.message?.content ?? '' }),
        })
      } catch { /* logging must never break the test */ }
      return reply.send({
        reply: result.message?.content ?? '',
        reasoning: result.message?.reasoning_content || null,
        usage: result.usage ?? null,
        latencyMs,
      })
    } catch (e) {
      return reply.code(502).send({ error: { code: 'test_failed', message: e?.message || 'Test failed' }, latencyMs: Date.now() - startedAt })
    }
  })
}
