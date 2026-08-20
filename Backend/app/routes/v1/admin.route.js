import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Op } from 'sequelize'
import bcrypt from 'bcryptjs'
import { requireLogin, sha256, safeEqual, KNOWN_SCOPES } from '../../auth/index.js'
import { renewChatApiKey } from '../../auth/chat-key.js'
import { checkPasswordStrength } from '../../auth/password-policy.js'
import { requireCapability, can, capabilitiesFor } from '../../auth/permissions.js'
import { adapters, effectiveProviders, providerMeta } from '../../adapters/index.js'
import { rebuildProviderRegistry } from '../../adapters/registry.js'
import { rebuildModelBlocklist, isModelBlocked } from '../../adapters/blocklist.js'
import { capsOf, goodForOf } from '../../adapters/model-caps.js'
import { probeModel, testedCapsForProvider, defaultProbeSet, PROBEABLE, SPECIALIST_CAPS } from '../../adapters/capabilities.js'
import { localSnapshot, unloadLocalModel, releaseAllLocalModels } from '../../components/local-monitor.js'
import { logUserChange } from '../../auth/user-changes.js'
import { logConfigChange, logSettingChanges } from '../../audit/config-log.js'
import { encryptRawKey, decryptRawKey } from '../../auth/key-vault.js'
import { revealLimiter, resetAllLimits, listBuckets, clearBucket } from '../../auth/rate-limit.js'
import { isRootConnectedUser, rootUserIdFrom } from '../../auth/root-identity.js'
// OWNERSHIP vs ATTRIBUTION — two different columns and two different failure modes.
//   ownerIdOf     → columns that decide who may READ or DELETE a row (owner_user_id, user_id). An
//                   unresolvable owner must REFUSE: an unattributable row can never be cleaned up.
//   ownerIdOrNull → columns that only record WHO DID IT (actor_user_id, granted_by, taken_by…). These
//                   carry a username alongside, so null degrades the record instead of orphaning it —
//                   and losing the audit row entirely would be worse than losing one id on it.
import { ownerIdOf, ownerIdOrNull } from '../../auth/owner.js'
import { allSettings, setSetting, resetSetting, getSetting } from '../../settings/index.js'
import { calKey, startCalibration, calibrationStatus, appliedOptimum } from '../../chat-runtime/ollama-ctx.js'
import { historyFor, CTX_HISTORY_MAX } from '../../chat-runtime/ctx-history.js'
import { runUsageRetention, listColdFiles } from '../../usage/retention.js'
import { computeUsageStats, usageGroupFor } from '../../usage/stats.js'
import { tokenBudgetFor, grantTokens } from '../../usage/limits.js'
import { notifyChatEvent } from '../../chat/notify.js'
import { buildMemoryV2 } from '../../components/memory-v2-host.js'
import { runtime } from '../../components/runtime.js'
import { jobTriggerId } from '../../schedules/index.js'
import { ROOT_PREFS_KEY } from './me-prefs.route.js'

// Console management routes. All require login; each route then requires a
// specific capability:
//   users        -> manage_users  (root, admin)
//   apikeys      -> manage_users  (root, admin)   [API keys are first-class; no Consumer layer]
//   usage        -> manage_users  (root, admin)
//   providers    -> system_config (root only)
//   scopes       -> manage_users  (root, admin)
//   admin-account management (grant admin role, edit/delete an admin) -> root only

function generateRawKey(keyName) {
  const slug = String(keyName || 'key').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'key'
  const random = crypto.randomBytes(24).toString('hex')
  return `sk_${slug}_${random}`
}

export default async function adminRoutes(fastify) {
  fastify.addHook('preHandler', requireLogin())

  const manageUsers = requireCapability('manage_users')
  const systemConfig = requireCapability('system_config')

  // ---- Users ----------------------------------------------------------------
  // ?q=<contains> filters username/email/display name. ?page&pageSize opt into
  // pagination (adds total/page/pageSize); WITHOUT ?page the full list returns as
  // before — combos/pickers across the console rely on that.
  fastify.get('/admin/users', { preHandler: manageUsers }, async (request) => {
    const q = request.query || {}
    const where = {}
    if (q.q && String(q.q).trim()) {
      const like = `%${String(q.q).trim().replace(/[%_\\]/g, '\\$&')}%`
      where[Op.or] = [
        { username: { [Op.iLike]: like } },
        { email: { [Op.iLike]: like } },
        { display_name: { [Op.iLike]: like } },
      ]
    }
    const paged = q.page !== undefined
    const pageSize = Math.min(Math.max(Number(q.pageSize) || 50, 1), 200)
    const page = Math.max(Number(q.page) || 1, 1)
    const { rows, count } = await fastify.db.mst_users.findAndCountAll({
      where,
      include: [{ association: 'roles' }],
      order: [['rolling_id', 'ASC']],
      distinct: true, // roles join must not inflate the count
      ...(paged ? { limit: pageSize, offset: (page - 1) * pageSize } : {}),
    })
    return {
      // systemNote is ADMIN-ONLY (this route is manage_users-gated) — the table shows a
      // marker on annotated rows. It must never appear on a self-service surface; see the
      // column comment in mst_users.model.js.
      users: rows.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        displayName: u.display_name,
        isActive: u.is_active,
        roles: (u.roles || []).map((r) => r.name),
        createdAt: u.created_at,
        systemNote: u.system_note,
      })),
      total: count,
      ...(paged ? { page, pageSize } : {}),
    }
  })

  // Single user — the request tabs' Edit-user shortcut fetches by id so the users
  // table can stay server-paginated (no full-list dependency).
  fastify.get('/admin/users/:id', { preHandler: manageUsers }, async (request, reply) => {
    const u = await fastify.db.mst_users.findByPk(request.params.id, { include: [{ association: 'roles' }] })
    if (!u) return reply.code(404).send({ error: { code: 'user_not_found', message: 'User not found' } })
    return reply.send({
      user: {
        id: u.id, username: u.username, email: u.email, displayName: u.display_name,
        isActive: u.is_active, roles: (u.roles || []).map((r) => r.name), createdAt: u.created_at,
        systemNote: u.system_note, // admin-only (manage_users) — never on a self-service route
      },
    })
  })

  fastify.post('/admin/users', {
    preHandler: manageUsers,
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 1 },
          email: { type: 'string' },
          displayName: { type: 'string' },
          roles: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { username, password, email, displayName, roles } = request.body
    // Only root may mint admins — a non-root admin can't create peers (limits the blast
    // radius if an admin account is ever compromised).
    if (Array.isArray(roles) && roles.includes('admin') && !request.user.isRoot) {
      return reply.code(403).send({ error: { code: 'root_only', message: 'Only root can grant the admin role' } })
    }
    // paranoid:false — soft-deleted accounts still reserve their username/email
    const existing = await fastify.db.mst_users.findOne({ where: { username }, paranoid: false })
    if (existing) {
      return reply.code(409).send({ error: { code: 'user_exists', message: `User '${username}' already exists${existing.deleted_at ? ' (soft-deleted — root can hard-delete to free the name)' : ''}` } })
    }
    if (email && email.trim()) {
      const emailTaken = await fastify.db.mst_users.findOne({ where: { email: email.trim() }, paranoid: false })
      if (emailTaken) return reply.code(409).send({ error: { code: 'email_taken', message: 'That email is already in use' } })
    }
    // Admin-set passwords obey the same strength policy as self-service (this is how
    // an admin account ended up with the password "admin").
    const pwCheck = checkPasswordStrength(password, {
      minLength: getSetting(fastify.config, 'security.passwordMinLength'), username, email,
    })
    if (pwCheck.error) return reply.code(400).send({ error: { code: 'weak_password', message: pwCheck.error } })
    const password_hash = await bcrypt.hash(password, 10)
    const user = await fastify.db.mst_users.create({
      username,
      email: email?.trim() || null,
      display_name: displayName?.trim() || null,
      password_hash,
      is_active: true,
    })

    const roleNames = Array.isArray(roles) && roles.length ? roles : ['member']
    for (const name of roleNames) {
      const role = await fastify.db.mst_roles.findOne({ where: { name } })
      if (role) {
        await fastify.db.mst_user_roles.findOrCreate({
          where: { user_id: user.id, role_id: role.id },
          defaults: { user_id: user.id, role_id: role.id },
        })
      }
    }
    return reply.code(201).send({ user: { id: user.id, username: user.username, email: user.email, roles: roleNames } })
  })

  // Update a user: identity (username/email/displayName — admin changes bypass the 48h cooldown
  // but are still logged), roles, active state, optional password reset.
  fastify.patch('/admin/users/:id', {
    preHandler: manageUsers,
    schema: {
      // ids are UUIDs (post-refactor) — an integer type here would reject every edit
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1 } } },
      body: {
        type: 'object',
        properties: {
          username: { type: 'string', minLength: 1, maxLength: 100 },
          email: { type: ['string', 'null'], maxLength: 255 },
          displayName: { type: ['string', 'null'], maxLength: 100 },
          roles: { type: 'array', items: { type: 'string' } },
          isActive: { type: 'boolean' },
          password: { type: 'string', minLength: 1 },
          // admin-only operational note ('' or null clears it)
          systemNote: { type: ['string', 'null'], maxLength: 5000 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const user = await fastify.db.mst_users.findByPk(request.params.id, { include: [{ association: 'roles' }] })
    if (!user) return reply.code(404).send({ error: { code: 'user_not_found', message: 'User not found' } })

    const { username, email, displayName, roles, isActive, password, systemNote } = request.body
    const actor = request.user
    // Peer-admin protection: only root may modify an account that HOLDS admin, or
    // GRANT/keep the admin role. A non-root admin can't reset an admin's password,
    // deactivate a peer, or escalate anyone to admin.
    const targetIsAdmin = (user.roles || []).some((r) => r.name === 'admin')
    const wantsAdmin = Array.isArray(roles) && roles.includes('admin')
    if ((targetIsAdmin || wantsAdmin) && !actor.isRoot) {
      return reply.code(403).send({ error: { code: 'root_only', message: 'Only root can modify admin accounts or grant the admin role' } })
    }

    // ── ⭐ R2 · ROOT'S OWN CONNECTED ROW IS NOT AN ORDINARY ACCOUNT ────────────────────────────────
    // The DELETE handler below has said so since 2026-08-06 (*"undeletable — by anyone, including root"*).
    // This half was missing, and the asymmetry was measured on 2026-08-20: `isRootConnectedUser` guarded
    // DELETE and not PATCH, root's row holds NO role so the peer-admin guard above cannot fire on it, and
    // a non-root admin resetting a roleless account's password returned **200**.
    //
    // ⚠️ WHAT THAT BOUGHT AN ATTACKER, precisely: not root's PRIVILEGES — those are gated by the
    // authenticated `isRoot` flag, which `isRootActor()` refuses to infer from an id — but root's ROOM,
    // because every room-scoped read keys on `user_id`. Set a password on this row, log in with it, and
    // the session holds root's id with `isRoot: false`.
    //
    // ⇒ R1 in `auth.route.js` already closes the login door, so this is defence in depth rather than the
    // fix. It is here because the identity fields on THIS row are load-bearing for attribution across the
    // whole store, and an admin has no legitimate reason to edit them: root's credentials live in
    // config.json, and disconnecting root from a row is done by removing the config key — reversibly.
    //
    // ⛔ ROOT IS REFUSED TOO, exactly as with DELETE. A password set here would authenticate nothing (R1),
    // so allowing it would only create a credential that looks live and is not.
    if (isRootConnectedUser(fastify.config, user.id)
        && (password !== undefined || username !== undefined || roles !== undefined || isActive !== undefined)) {
      return reply.code(409).send({ error: {
        code: 'root_connected_user',
        message: "This is root's connected user record (auth.root.userConnected in config.json). Root authenticates from config, not from this row, so a password here would authenticate nothing — and its username, roles and active state are load-bearing for attribution. Change root's credentials in config.json; to disconnect root from a user row, remove the config key.",
      } })
    }

    if (typeof username === 'string' && username.trim() && username.trim() !== user.username) {
      const next = username.trim()
      const taken = await fastify.db.mst_users.findOne({ where: { username: next }, paranoid: false }) // soft-deleted names stay reserved
      if (taken) return reply.code(409).send({ error: { code: 'username_taken', message: `Username '${next}' is already taken` } })
      const old = user.username
      await user.update({ username: next })
      await logUserChange(fastify.db, { userId: user.id, field: 'username', oldValue: old, newValue: next, actor })
    }
    if (email !== undefined) {
      const next = typeof email === 'string' && email.trim() ? email.trim() : null
      if (next !== user.email) {
        if (next) {
          const taken = await fastify.db.mst_users.findOne({ where: { email: next }, paranoid: false }) // soft-deleted emails stay reserved
          if (taken && taken.id !== user.id) return reply.code(409).send({ error: { code: 'email_taken', message: 'That email is already in use' } })
        }
        const old = user.email
        await user.update({ email: next })
        await logUserChange(fastify.db, { userId: user.id, field: 'email', oldValue: old, newValue: next, actor })
      }
    }
    if (displayName !== undefined) {
      const next = typeof displayName === 'string' && displayName.trim() ? displayName.trim() : null
      if (next !== user.display_name) {
        const old = user.display_name
        await user.update({ display_name: next })
        await logUserChange(fastify.db, { userId: user.id, field: 'display_name', oldValue: old, newValue: next, actor })
      }
    }
    // Admin-only note. Audited like every other field so "who wrote this and when" is
    // answerable — the change log is itself manage_users-gated (/admin/users/:id/changes),
    // so recording the text does not widen who can read it. Previews are truncated because
    // the note allows 5000 chars and the history list would otherwise be unreadable.
    if (systemNote !== undefined) {
      const next = typeof systemNote === 'string' && systemNote.trim() ? systemNote.trim() : null
      if (next !== user.system_note) {
        const preview = (v) => (v == null ? null : v.length > 120 ? `${v.slice(0, 120)}…` : v)
        const old = user.system_note
        await user.update({ system_note: next })
        await logUserChange(fastify.db, { userId: user.id, field: 'system_note', oldValue: preview(old), newValue: preview(next), actor })
      }
    }

    if (typeof isActive === 'boolean') await user.update({ is_active: isActive })
    if (password) {
      const pwCheck = checkPasswordStrength(password, {
        minLength: getSetting(fastify.config, 'security.passwordMinLength'),
        username: username?.trim() || user.username,
        email: (email !== undefined ? (email?.trim() || null) : user.email) || undefined,
      })
      if (pwCheck.error) return reply.code(400).send({ error: { code: 'weak_password', message: pwCheck.error } })
      await user.update({ password_hash: await bcrypt.hash(password, 10) })
    }
    if (Array.isArray(roles)) {
      const oldRoles = (user.roles || []).map((r) => r.name).sort().join(', ')
      await fastify.db.mst_user_roles.destroy({ where: { user_id: user.id } })
      const applied = []
      for (const name of roles) {
        const role = await fastify.db.mst_roles.findOne({ where: { name } })
        if (role) {
          await fastify.db.mst_user_roles.create({ user_id: user.id, role_id: role.id })
          applied.push(name)
        }
      }
      const newRoles = applied.sort().join(', ')
      if (newRoles !== oldRoles) {
        await logUserChange(fastify.db, { userId: user.id, field: 'roles', oldValue: oldRoles || null, newValue: newRoles || null, actor })
      }
    }
    const fresh = await fastify.db.mst_users.findByPk(user.id, { include: [{ association: 'roles' }] })
    return reply.send({
      user: {
        id: fresh.id, username: fresh.username, email: fresh.email, displayName: fresh.display_name,
        isActive: fresh.is_active, roles: (fresh.roles || []).map((r) => r.name),
        systemNote: fresh.system_note, // admin-only (manage_users)
      },
    })
  })

  // Delete a user. DEFAULT = SOFT delete: the user row + their API keys get a
  // deleted_at stamp — they can't log in, their keys stop authenticating, but ALL
  // their data stays intact and root can restore everything from the Users page's
  // Deleted tab. The username/email stay reserved until hard-deleted.
  // ?hard=1 (ROOT only, also works on already-soft-deleted rows) = the irreversible
  // cascade: conversations/messages, memories, API keys, BYOK providers, change logs;
  // audit-grade records stay (usage_logs, key_reveal_logs — loose refs by design).
  fastify.delete('/admin/users/:id', { preHandler: manageUsers }, async (request, reply) => {
    const hard = String(request.query?.hard || '') === '1'
    if (hard && !can(request.user, 'system_config')) {
      return reply.code(403).send({ error: { code: 'root_only', message: 'Hard delete is root-only — regular delete is a recoverable soft delete' } })
    }
    const user = await fastify.db.mst_users.findByPk(request.params.id, { paranoid: false, include: [{ association: 'roles' }] })
    if (!user || (!hard && user.deleted_at)) {
      return reply.code(404).send({ error: { code: 'user_not_found', message: 'User not found' } })
    }
    if (!request.user.isRoot && request.user.id === user.id) {
      return reply.code(400).send({ error: { code: 'cannot_delete_self', message: 'You cannot delete your own account' } })
    }
    // Peer-admin protection: only root may delete an account that holds admin.
    if ((user.roles || []).some((r) => r.name === 'admin') && !request.user.isRoot) {
      return reply.code(403).send({ error: { code: 'root_only', message: 'Only root can delete admin accounts' } })
    }
    // ⚠️ ROOT'S OWN CONNECTED ROW IS UNDELETABLE — BY ANYONE, INCLUDING ROOT.
    // Deleting it does two irreversible things at once: it orphans everything scoped to that id (root's
    // conversations, memories, slots, keys), and it leaves `auth.root.userConnected` in config.json
    // pointing at nothing — so the platform silently falls back to the old `user_id IS NULL` scope and
    // root's whole history goes invisible. There is no legitimate reason to delete it: to disconnect
    // root from a user row you remove the config key, which is reversible and leaves the data intact.
    if (isRootConnectedUser(fastify.config, user.id)) {
      return reply.code(409).send({ error: {
        code: 'root_connected_user',
        message: "This is root's connected user record (auth.root.userConnected in config.json). Deleting it would orphan root's data. Remove the config key first if you really mean to disconnect it.",
      } })
    }
    const uid = user.id
    const username = user.username

    if (!hard) {
      await fastify.db.mst_api_keys.destroy({ where: { owner_user_id: uid } }) // soft — restorable together
      await user.destroy() // soft
      request.log?.info?.(`[users] '${username}' (${uid}) SOFT-deleted by ${request.user.username}`)
      return reply.send({ ok: true, id: uid, deleted: true, soft: true })
    }

    const convoIds = (await fastify.db.txn_conversations.findAll({ where: { user_id: uid }, attributes: ['id'], raw: true })).map((c) => c.id)
    if (convoIds.length) await fastify.db.txn_messages.destroy({ where: { conversation_id: convoIds } })
    await fastify.db.txn_conversations.destroy({ where: { user_id: uid } })
    await fastify.db.txn_user_memories.destroy({ where: { user_id: uid } }) // curated Notes
    await fastify.db.txn_memories.destroy({ where: { user_id: uid } }) // Persona Memory v2 (was v1 kv/facts, retired)
    // ⚠ THIS LINE WAS MISSING, AND IT IS WHY ORPHANS EXISTED. Slots are the vocabulary induced FROM this
    // user's own facts, so they describe nobody once the account is gone — but nothing cascades them and
    // nobody remembered this list. Measured 2026-08-06: 9 orphaned mst_slots rows pointing at users that
    // had already been hard-deleted. The buckets in auth/user-data-scope.js + its drift test are the real
    // fix; this line is the bug it caught.
    await fastify.db.mst_slots.destroy({ where: { user_id: uid } })
    const keyIds = (await fastify.db.mst_api_keys.findAll({ where: { owner_user_id: uid }, attributes: ['id'], raw: true, paranoid: false })).map((k) => k.id)
    if (keyIds.length) await fastify.db.mst_api_key_scopes.destroy({ where: { api_key_id: keyIds } })
    await fastify.db.mst_api_keys.destroy({ where: { owner_user_id: uid }, force: true })
    const byokCount = await fastify.db.mst_providers.destroy({ where: { owner_user_id: uid } })
    // scheduled jobs: unregister the LIVE triggers first, then drop the rows (run history
    // cascades via FK). Without this, hard-deleting a user left GHOST schedules firing as
    // a non-existent owner forever (measured: 5 orphans, 3 still enabled — Ote's pg tidy).
    const jobIds = (await fastify.db.mst_trigger_jobs.findAll({ where: { user_id: uid }, attributes: ['id'], raw: true })).map((j) => j.id)
    for (const jid of jobIds) { try { runtime.triggers.unregister(jobTriggerId(jid)) } catch { /* not registered */ } }
    if (jobIds.length) await fastify.db.mst_trigger_jobs.destroy({ where: { user_id: uid } })
    await fastify.db.txn_password_reset_requests.destroy({ where: { user_id: uid } })
    await fastify.db.log_user_changes.destroy({ where: { user_id: uid } })
    await fastify.db.txn_role_upgrade_requests.destroy({ where: { user_id: uid } })
    await fastify.db.txn_token_grants.destroy({ where: { user_id: uid } })
    await fastify.db.mst_user_limits.destroy({ where: { user_id: uid } })
    await fastify.db.mst_user_roles.destroy({ where: { user_id: uid } })
    await user.destroy({ force: true })
    if (byokCount) await rebuildProviderRegistry({ db: fastify.db, config: fastify.config }) // drop their overlay

    request.log?.info?.(`[users] '${username}' (${uid}) HARD-deleted by ${request.user.username} — ${convoIds.length} conversation(s), ${keyIds.length} key(s), ${byokCount} BYOK provider(s), ${jobIds.length} schedule(s)`)
    return reply.send({ ok: true, id: uid, deleted: true, hard: true })
  })

  // ---- Root "Log in as": switch this session to another user --------------------
  // ROOT ONLY. Replaces root's session with the target user's — root is signed OUT and
  // signed in AS the user (one-way; to return, sign out and log back in as root). Powerful,
  // so it's isRoot-gated (not just manage_users) and audited on the target's change history.
  fastify.post('/admin/users/:id/login-as', { preHandler: manageUsers }, async (request, reply) => {
    if (!request.user.isRoot) {
      return reply.code(403).send({ error: { code: 'root_only', message: 'Only root can log in as another user' } })
    }
    const user = await fastify.db.mst_users.findByPk(request.params.id, { include: [{ association: 'roles' }] })
    if (!user) return reply.code(404).send({ error: { code: 'user_not_found', message: 'User not found' } })
    if (!user.is_active) {
      return reply.code(400).send({ error: { code: 'user_inactive', message: 'Cannot log in as a disabled account — enable it first' } })
    }

    // Audit BEFORE flipping the session (request.user is still root here). Impersonation
    // shows up in the target's Edit → change history, alongside a server-log warning.
    try {
      await logUserChange(fastify.db, {
        userId: user.id, field: 'account', oldValue: null,
        newValue: `root '${request.user.username}' logged in AS this user (ip ${request.ip || 'unknown'})`,
        actor: request.user,
      })
    } catch (e) { request.log?.error?.(e) }
    request.log?.warn?.(`[users] root '${request.user.username}' logged in AS '${user.username}' (${user.id})`)

    // Flip the session to the target user (mirrors the DB-user login path).
    request.session.set('isRoot', false)
    request.session.set('userId', user.id)

    const sessionUser = {
      id: user.id, username: user.username, email: user.email,
      displayName: user.display_name, roles: (user.roles || []).map((r) => r.name), isRoot: false,
    }
    return reply.send({ user: { ...sessionUser, capabilities: capabilitiesFor(sessionUser) } })
  })

  // ---- Root can inspect a user's saved memory (read-only) -----------------------
  // Notes (user-curated, injected into every chat) + the Persona Memory v2 the assistant recalls
  // for this user (episodic/semantic + persona-global identity). v2 replaces the retired v1 kv/facts
  // (MemoryManager). enumerate (list) — unranked, no embedding call. Soft-deleted users too.
  // The full inspector with pin/forget/delete lives at /console/memories; this is the quick view.
  fastify.get('/admin/users/:id/memory', { preHandler: systemConfig }, async (request, reply) => {
    const user = await fastify.db.mst_users.findByPk(request.params.id, { paranoid: false })
    if (!user) return reply.code(404).send({ error: { code: 'user_not_found', message: 'User not found' } })
    const notes = await fastify.db.txn_user_memories.findAll({ where: { user_id: user.id }, order: [['rolling_id', 'ASC']] })
    const assistant = await buildMemoryV2(fastify, { userId: user.id }).list({ limit: 500 })
    return reply.send({
      username: user.username,
      memories: notes.map((m) => ({ id: m.id, content: m.content, isEnabled: m.is_enabled, createdAt: m.created_at })),
      assistant: assistant.memories, // v2 rows: {id, kind, content, importance, pinned, entity, attribute, source}
    })
  })

  // ---- Soft-deleted users (root's Deleted tab): explore / restore ---------------
  fastify.get('/admin/users/deleted', { preHandler: systemConfig }, async () => {
    const rows = await fastify.db.mst_users.findAll({
      where: { deleted_at: { [Op.ne]: null } },
      include: [{ association: 'roles' }],
      order: [['deleted_at', 'DESC']],
      paranoid: false,
    })
    return {
      users: rows.map((u) => ({
        id: u.id, username: u.username, email: u.email, displayName: u.display_name,
        roles: (u.roles || []).map((r) => r.name), deletedAt: u.deleted_at, createdAt: u.created_at,
      })),
    }
  })
  fastify.post('/admin/users/:id/restore', { preHandler: systemConfig }, async (request, reply) => {
    const user = await fastify.db.mst_users.findByPk(request.params.id, { paranoid: false })
    if (!user || !user.deleted_at) return reply.code(404).send({ error: { code: 'not_found', message: 'No soft-deleted user with that id' } })
    await user.restore()
    await fastify.db.mst_api_keys.restore({ where: { owner_user_id: user.id } }) // their keys come back too
    request.log?.info?.(`[users] '${user.username}' restored by ${request.user.username}`)
    return reply.send({ ok: true, id: user.id, restored: true })
  })

  // ---- Password reset requests (manual flow) ----------------------------------
  // Users file these from the login page; an admin resets the password in the user's
  // Edit dialog, contacts them via the account email, then marks the request handled.
  fastify.get('/admin/reset-requests', { preHandler: manageUsers }, async () => {
    const rows = await fastify.db.txn_password_reset_requests.findAll({ order: [['rolling_id', 'DESC']], limit: 50 })
    return {
      requests: rows.map((r) => ({
        id: r.id,
        identifier: r.identifier,
        claimedUsername: r.claimed_username,
        userId: r.user_id,
        username: r.username_snapshot,
        email: r.email_snapshot,
        status: r.status,
        handledBy: r.handled_by,
        handledAt: r.status === 'handled' ? r.updated_at : null,
        ip: r.ip,
        at: r.created_at,
      })),
    }
  })
  fastify.post('/admin/reset-requests/:id/handled', { preHandler: manageUsers }, async (request, reply) => {
    const row = await fastify.db.txn_password_reset_requests.findByPk(request.params.id)
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'Request not found' } })
    await row.update({ status: 'handled', handled_by: request.user.username })
    return reply.send({ ok: true, id: row.id, status: 'handled' })
  })

  // ---- Developer-access requests (manual grant) --------------------------------
  // Users file these from their Account page; an admin grants the role in the user's
  // Edit dialog (or declines out-of-band), then marks the request handled.
  fastify.get('/admin/role-requests', { preHandler: manageUsers }, async () => {
    const rows = await fastify.db.txn_role_upgrade_requests.findAll({ order: [['rolling_id', 'DESC']], limit: 50 })
    return {
      requests: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        username: r.username_snapshot,
        email: r.email_snapshot,
        requestedRole: r.requested_role,
        note: r.note,
        status: r.status,
        handledBy: r.handled_by,
        handledAt: r.status === 'handled' ? r.updated_at : null,
        ip: r.ip,
        at: r.created_at,
      })),
    }
  })
  fastify.post('/admin/role-requests/:id/handled', { preHandler: manageUsers }, async (request, reply) => {
    const row = await fastify.db.txn_role_upgrade_requests.findByPk(request.params.id)
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'Request not found' } })
    await row.update({ status: 'handled', handled_by: request.user.username })
    return reply.send({ ok: true, id: row.id, status: 'handled' })
  })

  // Identity change history for one user (admin/root-only; users never see this).
  fastify.get('/admin/users/:id/changes', { preHandler: manageUsers }, async (request, reply) => {
    const rows = await fastify.db.log_user_changes.findAll({
      where: { user_id: request.params.id },
      order: [['rolling_id', 'DESC']],
      limit: 100,
    })
    return reply.send({
      changes: rows.map((r) => ({
        id: r.id,
        field: r.field,
        oldValue: r.old_value,
        newValue: r.new_value,
        changedBy: r.changed_by,
        changedAt: r.created_at,
      })),
    })
  })

  // ---- API Keys (first-class: name + description + scopes + owner; no Consumer) --------------
  const serializeKey = (k) => ({
    id: k.id,
    kind: k.kind || 'standard', // 'chat' = system key (auto-managed, read-only here)
    canReveal: Boolean(k.key_encrypted), // re-copyable after a credential re-check
    name: k.name,
    description: k.description,
    keyPrefix: k.key_prefix,
    owner: k.owner ? { id: k.owner.id, username: k.owner.username } : null,
    scopes: (k.scopes || []).map((s) => s.scope),
    isActive: k.is_active,
    expiresAt: k.expires_at,
    lastUsedAt: k.last_used_at,
    createdAt: k.created_at,
  })

  // User ids holding a role name (used by the ?role filters on keys + usage).
  const userIdsWithRole = async (role) => {
    const rows = await fastify.db.mst_users.findAll({
      attributes: ['id'],
      include: [{ association: 'roles', where: { name: role }, required: true, attributes: [] }],
    })
    return rows.map((u) => u.id)
  }

  // ⚠ ROOT IS TWO OWNER VALUES, NOT ONE — AND THIS IS THE THIRD TIME THAT COST US.
  //
  // `root` as a filter value used to mean exactly `owner_user_id IS NULL`, because root was a config
  // login with no users row. Root gained one on 2026-08-06 (`auth.root.userConnected`), so new rows are
  // written against a real id while every pre-08-06 row still carries NULL. A filter that names only one
  // of those shapes answers with HALF root's data and reports success — `?owner=root` returned an empty
  // list here once the superseded chat key was hidden, and `usage?userId=root` still returns only the
  // pre-08-06 rows. Same defect class as `resolveApiKey` (81c6cd5) and `ensureChatApiKey`: a rule that
  // lived in a DATA SHAPE stopped being true when the shape moved.
  //
  // So `root` means BOTH values, everywhere, from one function.
  const rootOwnerValues = () => {
    const id = rootUserIdFrom(fastify.config)
    return id ? [null, id] : [null]
  }

  // ?owner=<userId|root> filters to one owner; ?role=<roleName|root> filters by the
  // owner's role. Both compose (AND): owner values are narrowed to the intersection.
  fastify.get('/admin/apikeys', { preHandler: manageUsers }, async (request) => {
    const q = request.query || {}
    // allowed owner values: undefined = everyone; array may contain null (= root's legacy shape)
    let allowed
    if (q.role === 'root') allowed = rootOwnerValues()
    else if (q.role) allowed = await userIdsWithRole(q.role)
    if (q.owner) {
      const want = q.owner === 'root' ? rootOwnerValues() : [q.owner]
      allowed = allowed === undefined ? want : allowed.filter((v) => want.includes(v))
    }

    const where = {}
    if (allowed !== undefined) {
      const ids = allowed.filter((v) => v !== null)
      const ors = []
      if (allowed.includes(null)) ors.push({ owner_user_id: null })
      if (ids.length) ors.push({ owner_user_id: { [Op.in]: ids } })
      if (!ors.length) return { apiKeys: [] } // filter matches nobody
      where[Op.or] = ors
    }
    const keys = await fastify.db.mst_api_keys.findAll({
      where,
      include: [{ association: 'owner' }, { association: 'scopes' }],
      order: [['rolling_id', 'ASC']],
    })

    // ⚠ ROOT'S SUPERSEDED CHAT KEY IS HIDDEN HERE, AND THE REASON IS A CONTROL THAT LIED.
    //
    // Root's system chat key was keyed on `owner_user_id = NULL` (root had no users row). Root gained one
    // on 2026-08-06, so ensureChatApiKey began resolving a real id and minted a SECOND row. Measured from
    // log_usage: the legacy row carries 1,083 turns and stops dead on 2026-08-06; the id-owned row picks up
    // from there. Both are named `chat-w`, so the console showed two identical-looking keys — and the
    // per-user CHAT KILL SWITCH (chat-site.route.js `requireChatEnabled`) reads the id-owned one. Disable
    // the legacy row and the toggle reports success and refuses nothing.
    //
    // The legacy row is NOT deleted: 1,083 log_usage rows point at it, and that attribution history is the
    // only reason those turns are accounted to anyone. It is retired from the LIST instead, which is the
    // surface where the lie was told. Historical usage still resolves it by id.
    //
    // ⚠ Guarded to the exact case — root, kind='chat', and ONLY when the id-owned row actually exists.
    // A NULL-owned chat key with no successor is still root's real key and must stay visible.
    const rootId = rootUserIdFrom(fastify.config)
    const supersededRootChat = rootId && keys.some((k) => k.kind === 'chat' && String(k.owner_user_id || '').toLowerCase() === rootId)
      ? keys.filter((k) => k.kind === 'chat' && k.owner_user_id === null).map((k) => k.id)
      : []
    const visible = supersededRootChat.length ? keys.filter((k) => !supersededRootChat.includes(k.id)) : keys
    return { apiKeys: visible.map(serializeKey) }
  })

  // Mint a new key. The RAW key is returned EXACTLY ONCE here — only its hash is stored.
  fastify.post('/admin/apikeys', {
    preHandler: manageUsers,
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          scopes: { type: 'array', items: { type: 'string' } },
          expiresAt: { type: ['string', 'null'] },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { name, description, scopes, expiresAt } = request.body
    const requestedScopes = Array.isArray(scopes) ? [...new Set(scopes.filter((s) => KNOWN_SCOPES.includes(s)))] : []
    const rawKey = generateRawKey(name)
    const lastUnderscore = rawKey.lastIndexOf('_')
    const apiKey = await fastify.db.mst_api_keys.create({
      // ⚠️ THIS COMMENT USED TO SAY "null = root (config superuser)" AND IT WAS LOAD-BEARING AND FALSE.
      // Root has had a user row since 2026-08-06; minting a NULL-owned key made root's own keys
      // invisible to `?owner=root` and surfaced a stranger's key to two separate tests.
      owner_user_id: ownerIdOf(request.user, 'an API key'),
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
      rawKey, // shown once; never retrievable again
      notice: 'Copy this key now — it is shown only once and only its hash is stored.',
    })
  })

  // Configure an existing key: rename, re-describe, enable/disable, set/clear expiry, replace scopes.
  // Everything except the secret itself is editable here (the raw key is never recoverable).
  fastify.patch('/admin/apikeys/:id', {
    preHandler: manageUsers,
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          isActive: { type: 'boolean' },
          expiresAt: { type: ['string', 'null'] }, // ISO string to set, null to clear
          scopes: { type: 'array', items: { type: 'string' } }, // full replacement set
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const key = await fastify.db.mst_api_keys.findByPk(request.params.id)
    if (!key) return reply.code(404).send({ error: { code: 'key_not_found', message: 'API key not found' } })
    if (key.kind !== 'standard') {
      // Root exception — the CHAT KILL SWITCH: isActive (and nothing else) may be
      // toggled on a system chat key. A disabled chat key blocks the user's chat
      // turns and is never silently re-enabled; recovery = enable or /renew.
      const bodyKeys = Object.keys(request.body || {})
      const onlySwitch = bodyKeys.length === 1 && typeof request.body.isActive === 'boolean'
      if (!(onlySwitch && can(request.user, 'system_config'))) {
        return reply.code(400).send({ error: { code: 'system_key_readonly', message: 'System keys (chat) are auto-managed — root may only disable/enable them or force a renew' } })
      }
      await key.update({ is_active: request.body.isActive })
      const freshChat = await fastify.db.mst_api_keys.findByPk(key.id, { include: [{ association: 'owner' }, { association: 'scopes' }] })
      return reply.send({ apiKey: serializeKey(freshChat) })
    }

    const { name, description, isActive, expiresAt, scopes } = request.body
    const patch = {}
    if (typeof name === 'string') patch.name = name
    if (typeof description === 'string') patch.description = description
    if (typeof isActive === 'boolean') patch.is_active = isActive
    if (expiresAt !== undefined) patch.expires_at = expiresAt || null // '' / null both clear it
    if (Object.keys(patch).length) await key.update(patch)

    if (Array.isArray(scopes)) {
      const requested = [...new Set(scopes.filter((s) => KNOWN_SCOPES.includes(s)))]
      await fastify.db.mst_api_key_scopes.destroy({ where: { api_key_id: key.id } })
      for (const scope of requested) {
        await fastify.db.mst_api_key_scopes.create({ api_key_id: key.id, scope })
      }
    }

    const fresh = await fastify.db.mst_api_keys.findByPk(key.id, {
      include: [{ association: 'owner' }, { association: 'scopes' }],
    })
    return reply.send({ apiKey: serializeKey(fresh) })
  })

  fastify.post('/admin/apikeys/:id/revoke', { preHandler: manageUsers }, async (request, reply) => {
    const key = await fastify.db.mst_api_keys.findByPk(request.params.id)
    if (!key) return reply.code(404).send({ error: { code: 'key_not_found', message: 'API key not found' } })
    if (key.kind !== 'standard') {
      return reply.code(400).send({ error: { code: 'system_key_readonly', message: 'System keys (chat) are managed automatically and cannot be revoked' } })
    }
    await key.update({ is_active: false })
    return reply.send({ ok: true, id: key.id, isActive: false })
  })

  // Force-renew a SYSTEM CHAT key (root): rotate the secret + fresh TTL + re-enable —
  // the recovery half of the chat kill switch (also invalidates the old hash).
  fastify.post('/admin/apikeys/:id/renew', { preHandler: systemConfig }, async (request, reply) => {
    const key = await fastify.db.mst_api_keys.findByPk(request.params.id)
    if (!key) return reply.code(404).send({ error: { code: 'key_not_found', message: 'API key not found' } })
    if (key.kind === 'standard') {
      return reply.code(400).send({ error: { code: 'not_system_key', message: 'Only system chat keys renew — standard keys are minted once, not rotated' } })
    }
    await renewChatApiKey(key)
    const fresh = await fastify.db.mst_api_keys.findByPk(key.id, { include: [{ association: 'owner' }, { association: 'scopes' }] })
    return reply.send({ apiKey: serializeKey(fresh) })
  })

  // DEFAULT = SOFT delete (key stops authenticating, root can restore); ?hard=1
  // (root only) removes the key + its scopes for good.
  fastify.delete('/admin/apikeys/:id', { preHandler: manageUsers }, async (request, reply) => {
    const hard = String(request.query?.hard || '') === '1'
    if (hard && !can(request.user, 'system_config')) {
      return reply.code(403).send({ error: { code: 'root_only', message: 'Hard delete is root-only — regular delete is a recoverable soft delete' } })
    }
    const key = await fastify.db.mst_api_keys.findByPk(request.params.id, { paranoid: false })
    if (!key || (!hard && key.deleted_at)) {
      return reply.code(404).send({ error: { code: 'key_not_found', message: 'API key not found' } })
    }
    if (key.kind !== 'standard') {
      return reply.code(400).send({ error: { code: 'system_key_readonly', message: 'System keys (chat) are managed automatically and cannot be deleted' } })
    }
    // Audit the credential's death BEFORE the row goes away — a hard delete leaves nothing to look at
    // afterwards, and "which key stopped working, and who killed it?" is exactly the question that took
    // two days to answer for the sotera key (see checks/anthropic-check.mjs).
    const keySnapshot = { name: key.name, kind: key.kind, keyPrefix: key.key_prefix, ownerUserId: key.owner_user_id }
    if (hard) {
      await fastify.db.mst_api_key_scopes.destroy({ where: { api_key_id: key.id } })
      await key.destroy({ force: true })
      await logConfigChange(fastify.db, {
        area: 'api_key', action: 'delete', target: key.id, before: keySnapshot, after: null,
        actor: request.user, note: 'hard delete — row removed', log: request.log,
      })
      return reply.send({ ok: true, id: request.params.id, deleted: true, hard: true })
    }
    await key.destroy() // soft — scopes stay for a clean restore
    await logConfigChange(fastify.db, {
      area: 'api_key', action: 'delete', target: key.id, before: keySnapshot, after: null,
      actor: request.user, note: 'soft delete — recoverable, but hidden from every lookup', log: request.log,
    })
    return reply.send({ ok: true, id: request.params.id, deleted: true, soft: true })
  })

  // ---- Soft-deleted keys (root's Deleted tab): explore / restore -----------------
  fastify.get('/admin/apikeys/deleted', { preHandler: systemConfig }, async () => {
    const rows = await fastify.db.mst_api_keys.findAll({
      where: { deleted_at: { [Op.ne]: null } },
      include: [{ association: 'owner', attributes: ['id', 'username', 'deleted_at'], required: false, paranoid: false }],
      order: [['deleted_at', 'DESC']],
      paranoid: false,
    })
    return {
      apiKeys: rows.map((k) => ({
        id: k.id, name: k.name, kind: k.kind, keyPrefix: k.key_prefix,
        owner: k.owner ? { id: k.owner.id, username: k.owner.username, deleted: Boolean(k.owner.deleted_at) } : null,
        deletedAt: k.deleted_at, createdAt: k.created_at,
      })),
    }
  })
  fastify.post('/admin/apikeys/:id/restore', { preHandler: systemConfig }, async (request, reply) => {
    const key = await fastify.db.mst_api_keys.findByPk(request.params.id, { paranoid: false })
    if (!key || !key.deleted_at) return reply.code(404).send({ error: { code: 'not_found', message: 'No soft-deleted key with that id' } })
    if (key.owner_user_id) {
      const owner = await fastify.db.mst_users.findByPk(key.owner_user_id) // paranoid: excludes soft-deleted owners
      if (!owner) return reply.code(400).send({ error: { code: 'owner_deleted', message: 'The key owner is deleted — restore the user first (that restores their keys too)' } })
    }
    await key.restore()
    await logConfigChange(fastify.db, {
      area: 'api_key', action: 'restore', target: key.id,
      before: null, after: { name: key.name, kind: key.kind, keyPrefix: key.key_prefix },
      actor: request.user, log: request.log,
    })
    return reply.send({ ok: true, id: key.id, restored: true })
  })

  // Reveal a key's raw value AGAIN (any copy after the mint response). Policy: always
  // copyable for convenience, but every re-copy requires the logged-in user to re-enter
  // their OWN credentials (root re-enters the config root credentials). The credentials
  // must belong to the CURRENT session identity — knowing someone else's password doesn't
  // unlock a reveal on this session.
  fastify.post('/admin/apikeys/:id/reveal', {
    preHandler: manageUsers,
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1 }, // username OR email, same as login
          password: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body

    // Audit trail: EVERY reveal attempt lands in key_reveal_logs (who/when/which
    // key/outcome/ip) — viewable on the API Keys page by root + admin.
    const audit = async (outcome, key = null) => {
      try {
        await fastify.db.log_key_reveals.create({
          api_key_id: key?.id ?? request.params.id ?? null,
          key_name: key?.name ?? null,
          key_prefix: key?.key_prefix ?? null,
          // ⚠️ WAS `request.user.isRoot ? null : request.user.id` — it THREW AWAY root's id on purpose,
          // back when root had none. Root now has a row, so that line anonymised the audit trail of the
          // one account most able to reveal a secret. Record the id we actually have.
          actor_user_id: ownerIdOrNull(request.user),
          actor_username: request.user.username,
          outcome,
          ip: request.ip || null,
        })
      } catch { /* auditing must never break the endpoint */ }
    }
    const keyRow = await fastify.db.mst_api_keys.findByPk(request.params.id)

    // Failure rate limit per session identity + IP (on top of the 500ms drag); limits
    // come from the root-editable security settings.
    const revealOpts = {
      maxAttempts: getSetting(fastify.config, 'security.revealMaxAttempts'),
      windowMs: getSetting(fastify.config, 'security.rateWindowMinutes') * 60_000,
    }
    const limitKey = `reveal:${request.ip}:${request.user.isRoot ? 'root' : request.user.id}`
    const limited = revealLimiter.check(limitKey, revealOpts)
    if (limited.limited) {
      await audit('rate_limited', keyRow)
      return reply.code(429).send({
        error: { code: 'too_many_attempts', message: `Too many failed attempts — try again in ~${Math.ceil(limited.retryAfterSeconds / 60)} min`, retryAfterSeconds: limited.retryAfterSeconds },
      })
    }
    const fail = async (code = 403) => {
      revealLimiter.recordFailure(limitKey, revealOpts)
      await audit('reauth_failed', keyRow)
      await new Promise((r) => setTimeout(r, 500)) // blunt brute-force drag
      return reply.code(code).send({ error: { code: 'reauth_failed', message: 'Credentials do not match the logged-in account' } })
    }

    // ---- re-auth against the SESSION identity ----
    if (request.user.isRoot) {
      const root = fastify.config?.auth?.root
      if (!root?.username || !safeEqual(username, root.username) || !safeEqual(password, root.password)) return fail()
    } else {
      const me = await fastify.db.mst_users.findByPk(request.user.id)
      if (!me || !me.is_active) return fail()
      const idMatches = username === me.username || (me.email && username === me.email)
      const pwMatches = idMatches && (await bcrypt.compare(password, me.password_hash))
      if (!pwMatches) return fail()
    }
    revealLimiter.clear(limitKey)

    const key = keyRow
    if (!key) return reply.code(404).send({ error: { code: 'key_not_found', message: 'API key not found' } })
    // Least privilege: a non-root actor may reveal only keys they OWN. Root (superuser)
    // may reveal any — but a regular admin can't lift another user's or root's secret
    // (revealing is re-copy for the key's holder, not a management action over peers).
    if (!request.user.isRoot && key.owner_user_id !== request.user.id) {
      await audit('reauth_failed', key)
      return reply.code(403).send({ error: { code: 'not_owner', message: 'You can only copy keys you own' } })
    }
    if (key.kind !== 'standard') {
      await audit('system_key', key)
      return reply.code(400).send({ error: { code: 'system_key_secret', message: 'System keys have no retrievable secret — they exist only to attribute usage' } })
    }

    const rawKey = decryptRawKey(fastify.config, key.key_encrypted)
    // Integrity guard: what we decrypt must be the key auth actually accepts.
    if (!rawKey || sha256(rawKey) !== key.key_hash) {
      await audit('not_recoverable', key)
      return reply.code(409).send({
        error: { code: 'not_recoverable', message: 'This key\'s raw value is not stored (minted before re-copy support, or the encryption secret changed). Mint a new key.' },
      })
    }

    await audit('revealed', key)
    request.log?.info?.(`[apikeys] key '${key.name}' (${key.id}) revealed to ${request.user.username}`)
    return reply.send({ rawKey })
  })

  // Reveal audit trail (root + admin): latest attempts, newest first. Snapshotted
  // key name/prefix keep the trail readable after a key is deleted.
  // Paginated + filterable: ?page&pageSize (legacy ?limit still works when no page
  // given), ?outcome=<choice>, ?q=<contains> across key name / actor / ip.
  fastify.get('/admin/apikeys/reveals', { preHandler: manageUsers }, async (request) => {
    const q = request.query || {}
    const where = {}
    if (q.outcome) where.outcome = q.outcome
    if (q.q && String(q.q).trim()) {
      const like = `%${String(q.q).trim().replace(/[%_\\]/g, '\\$&')}%`
      where[Op.or] = [
        { key_name: { [Op.iLike]: like } },
        { actor_username: { [Op.iLike]: like } },
        { ip: { [Op.iLike]: like } },
      ]
    }
    const pageSize = Math.min(Math.max(Number(q.pageSize) || Number(q.limit) || 50, 1), 500)
    const page = Math.max(Number(q.page) || 1, 1)
    const { rows, count } = await fastify.db.log_key_reveals.findAndCountAll({
      where,
      order: [['rolling_id', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })
    return {
      reveals: rows.map((r) => ({
        id: r.id,
        apiKeyId: r.api_key_id,
        keyName: r.key_name,
        keyPrefix: r.key_prefix,
        actor: r.actor_username,
        actorUserId: r.actor_user_id, // null = config root
        outcome: r.outcome,
        ip: r.ip,
        at: r.created_at,
      })),
      total: count,
      page,
      pageSize,
    }
  })

  // ---- Runtime settings ---------------------------------------------------------
  // Two layers: config.json = platform defaults, `settings` DB rows override
  // (app/settings/index.js owns the known keys + validation). Values are readable by
  // anyone who can manage users (the console needs e.g. keyRevealSeconds for the
  // countdown); writes are ROOT only. PATCH body is a flat { "<key>": value } map;
  // value null removes the override (falls back to the config default).
  fastify.get('/admin/settings', { preHandler: manageUsers }, async () => ({
    settings: allSettings(fastify.config),
  }))
  fastify.patch('/admin/settings', {
    preHandler: systemConfig,
    schema: { body: { type: 'object', additionalProperties: true } },
  }, async (request, reply) => {
    const before = getSetting(fastify.config, 'chat.defaultModel')
    // AUDIT: capture each key's value BEFORE the write, so the trail records a real before→after pair.
    // These are platform-wide switches — providers.ollamaNumCtxLimit caps EVERY user's context window —
    // and until now they could be changed and changed back with no record that it ever happened.
    const audited = []
    // getSetting THROWS on an unknown key, and validation happens inside setSetting below — so reading
    // the previous value unguarded turned a rejected key from a clean 400 into a 500. Auditing must never
    // change the response an invalid request gets.
    const prevOf = (k) => { try { return getSetting(fastify.config, k) } catch { return undefined } }
    for (const [key, value] of Object.entries(request.body || {})) {
      const prev = prevOf(key)
      const result = value === null
        ? await resetSetting(fastify.db, key)
        : await setSetting(fastify.db, key, value, fastify.config) // config → a value == default drops the override
      if (result.error) {
        return reply.code(400).send({ error: { code: 'invalid_setting', message: result.error } })
      }
      const next = prevOf(key)
      // Only record a real move. A PATCH that re-sends an unchanged value is noise, and noise in an audit
      // log trains the reader to skim it.
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        audited.push({ key, before: prev, after: next, cleared: value === null })
      }
    }
    if (audited.length) {
      await logSettingChanges(fastify.db, { changes: audited, actor: request.user, log: request.log })
    }
    // Root changed the PLATFORM default model → every user's personal default is replaced
    // by it (their pref is cleared, so they fall back to the new platform value).
    if ('chat.defaultModel' in (request.body || {}) && getSetting(fastify.config, 'chat.defaultModel') !== before) {
      try {
        const users = await fastify.db.mst_users.findAll({ attributes: ['id', 'chat_prefs'], paranoid: false })
        let cleared = 0
        for (const u of users) {
          if (u.chat_prefs && typeof u.chat_prefs === 'object' && u.chat_prefs.defaultModel) {
            await u.update({ chat_prefs: { ...u.chat_prefs, defaultModel: null } })
            cleared++
          }
        }
        // root's own prefs (settings-table row) follow the same rule
        const rootRow = await fastify.db.mst_settings.findOne({ where: { key: ROOT_PREFS_KEY } })
        if (rootRow?.value?.defaultModel) {
          await rootRow.update({ value: { ...rootRow.value, defaultModel: null } })
          cleared++
        }
        if (cleared) request.log?.info?.(`[settings] platform default model changed — cleared ${cleared} personal default(s)`)
      } catch (e) {
        request.log?.warn?.(e, 'failed to clear personal default models after a platform default change')
      }
    }
    return reply.send({ settings: allSettings(fastify.config) })
  })

  // ---- Configuration audit trail (root; the answer to "who changed this, and when?") -------------
  // Root-only rather than admin-visible: the rows describe platform-wide control changes and name the
  // admin who made each one, so this doubles as a record of admin activity.
  fastify.get('/admin/config-log', {
    preHandler: systemConfig,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          area: { type: 'string', maxLength: 32 },
          target: { type: 'string', maxLength: 200 },
          limit: { type: 'integer', minimum: 1, maximum: 500 },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const where = {}
    if (request.query?.area) where.area = request.query.area
    if (request.query?.target) where.target = request.query.target
    const rows = await fastify.db.log_config_changes.findAll({
      where,
      // Newest first: an audit read almost always starts with "what changed recently?"
      order: [['rolling_id', 'DESC']],
      limit: request.query?.limit ?? 100,
      include: [{ association: 'actorUser', attributes: ['id', 'username'], required: false, paranoid: false }],
    })
    return {
      entries: rows.map((r) => ({
        id: r.id,
        area: r.area,
        action: r.action,
        target: r.target,
        before: r.before,
        after: r.after,
        // The stored label wins: it was resolved at write time and still reads correctly after the
        // account is renamed or deleted. The joined username is a convenience, not the source of truth.
        actor: r.actor,
        actorUser: r.actorUser ? { id: r.actorUser.id, username: r.actorUser.username } : null,
        note: r.note,
        at: r.created_at,
      })),
    }
  })

  // ---- Known Claude model ids (root; System → Claude API tab) -------------------
  // What ids exist to map FROM. Source chain, most authoritative first:
  //   1. enabled anthropic-KIND providers exposing /v1/models (the Anthropic standard)
  //   2. any other enabled provider whose model list carries claude ids
  //   3. OpenRouter's PUBLIC catalog (keyless; lists Anthropic's lineup as anthropic/claude-*)
  //   4. a built-in list (may lag behind Anthropic's releases — the UI says so)
  // Results cache for 5 minutes; ?fresh=1 (the ↻ button) re-queries.
  const BUILTIN_CLAUDE_IDS = [
    'claude-fable-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-5',
    'claude-haiku-4-5-20251001', 'claude-opus-4-1', 'claude-sonnet-4-5', 'claude-3-5-haiku-20241022',
  ]
  // "anthropic/claude-sonnet-4.5:beta" -> "claude-sonnet-4-5" (Anthropic-style id)
  const toClaudeId = (raw) => {
    let s = String(raw || '')
    if (s.includes('/')) s = s.slice(s.lastIndexOf('/') + 1)
    return s.split(':')[0].replaceAll('.', '-')
  }
  let claudeCatalogCache = { at: 0, value: null }
  fastify.get('/admin/anthropic-catalog', { preHandler: systemConfig }, async (request) => {
    if (!request.query?.fresh && claudeCatalogCache.value && Date.now() - claudeCatalogCache.at < 5 * 60_000) {
      return claudeCatalogCache.value
    }
    const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])
    const remember = (value) => { claudeCatalogCache = { at: Date.now(), value }; return value }
    const providers = Object.entries(effectiveProviders(fastify.config)).filter(([, cfg]) => cfg?.enabled !== false)

    // 1+2: configured providers — anthropic-kind first, then the rest
    const ordered = [...providers.filter(([, c]) => c.kind === 'anthropic'), ...providers.filter(([, c]) => c.kind !== 'anthropic')]
    for (const [name, cfg] of ordered) {
      const adapter = adapters[cfg.kind]
      if (!adapter?.listModels) continue
      try {
        const models = await timeout(adapter.listModels(cfg), 4000)
        const ids = [...new Set((models || []).map((m) => toClaudeId(m.id)).filter((id) => id.startsWith('claude')))]
        if (ids.length) return remember({ models: ids.slice(0, 24), source: 'live', provider: name })
      } catch { /* this provider can't list — keep walking the chain */ }
    }

    // 3: OpenRouter's public catalog (no key required)
    try {
      const res = await timeout(fetch('https://openrouter.ai/api/v1/models'), 5000)
      if (res.ok) {
        const json = await res.json()
        const ids = [...new Set(
          (json.data || [])
            .filter((m) => String(m.id || '').startsWith('anthropic/'))
            .sort((a, b) => (b.created || 0) - (a.created || 0)) // newest releases first
            .map((m) => toClaudeId(m.id))
            .filter((id) => id.startsWith('claude'))
        )].slice(0, 24)
        if (ids.length) return remember({ models: ids, source: 'web', provider: 'openrouter.ai' })
      }
    } catch { /* offline / blocked — fall through to the builtin list */ }

    return remember({ models: BUILTIN_CLAUDE_IDS, source: 'builtin', provider: null })
  })

  // Root escape hatch for the login/reveal failure rate limits: clears ALL lockouts
  // (e.g. a user locked themselves out and can't wait out the window).
  fastify.post('/admin/security/rate-limits/reset', { preHandler: systemConfig }, async (request) => {
    resetAllLimits()
    // Wiping every failure counter also wipes every ACTIVE LOCKOUT — a brute-force attempt in progress
    // gets a clean slate. Harmless when it is root unsticking themselves, worth a record either way,
    // and nothing else anywhere would show it happened.
    await logConfigChange(fastify.db, {
      area: 'security', action: 'reset', target: 'rate-limits',
      before: null, after: null, note: 'all rate-limit buckets and lockouts cleared',
      actor: request.user, log: request.log,
    })
    return { ok: true }
  })

  // ---- Active lockouts & failure counters (root; System → Security) -------------
  // Every in-memory bucket with recorded failures: locked ones and those still
  // counting. Root can clear a single bucket instead of resetting everything.
  const parseBucketKey = (key) => {
    const parts = key.split(':')
    switch (parts[0]) {
      case 'login': return parts.length >= 3
        ? { kind: 'login (account)', target: parts.slice(2).join(':'), ip: parts[1] }
        : { kind: 'login (IP)', target: parts[1], ip: parts[1] }
      case 'reveal': return { kind: 'key reveal', target: parts.slice(2).join(':') || parts[1], ip: parts[1] }
      case 'register': return { kind: 'registration', target: parts[1], ip: parts[1] }
      case 'pwreset': return { kind: 'password reset', target: parts[1], ip: parts[1] }
      default: return { kind: parts[0], target: parts.slice(1).join(':'), ip: null }
    }
  }
  fastify.get('/admin/security/lockouts', { preHandler: systemConfig }, async () => {
    return {
      lockouts: listBuckets()
        .map((b) => ({ ...b, ...parseBucketKey(b.key) }))
        .sort((a, b) => Number(b.locked) - Number(a.locked) || b.count - a.count),
    }
  })
  fastify.post('/admin/security/lockouts/clear', {
    preHandler: systemConfig,
    schema: { body: { type: 'object', required: ['key'], properties: { key: { type: 'string', minLength: 1, maxLength: 300 } }, additionalProperties: false } },
  }, async (request, reply) => {
    const cleared = clearBucket(request.body.key)
    if (!cleared) return reply.code(404).send({ error: { code: 'not_found', message: 'No such lockout/counter (it may have expired already)' } })
    // The bucket key names the account or IP being unlocked, so this doubles as "who was let back in".
    await logConfigChange(fastify.db, {
      area: 'security', action: 'clear', target: request.body.key,
      before: null, after: null, note: 'lockout/failure counter cleared',
      actor: request.user, log: request.log,
    })
    return reply.send({ ok: true, key: request.body.key, cleared: true })
  })

  // ---- Providers (system config — ROOT ONLY) --------------------------------
  // Two layers: config.json `providers` = the platform DEFAULTS (root's file, not
  // touched by the console). The `providers` DB TABLE holds runtime configuration:
  // a row overrides the config default of the same name, or adds a new provider.
  // API keys live encrypted (key-vault) in the DB; responses only carry a set flag
  // + last-4 tail. Rows have owner_user_id (NULL = global) as future-BYOK groundwork.
  // Every mutation rebuilds the in-memory effective registry — live immediately.
  const serializeProvider = (name) => {
    const cfg = effectiveProviders(fastify.config)[name] || {}
    const kind = cfg.kind || name
    return {
      name,
      kind,
      type: kind === 'ollama' ? 'local' : 'remote',
      supported: Boolean(adapters[kind]),
      enabled: cfg.enabled !== false,
      endpoint: cfg.host || cfg.baseURL || '',
      apiKeySet: Boolean(cfg.apiKey),
      apiKeyTail: cfg.apiKey ? String(cfg.apiKey).slice(-4) : null,
      source: providerMeta(fastify.config)[name]?.source || 'config', // config | override | db
    }
  }
  const rebuild = () => rebuildProviderRegistry({ db: fastify.db, config: fastify.config })
  // Which providers other settings/config point at (guards DELETE). Chat defaults are
  // runtime settings (DB override > config default) — read the EFFECTIVE values.
  const referencedProviders = () => {
    const refs = new Map() // provider -> where
    const note = (model, where) => {
      const p = typeof model === 'string' && model.includes('/') ? model.split('/')[0] : null
      if (p) refs.set(p, [...(refs.get(p) || []), where])
    }
    note(getSetting(fastify.config, 'chat.defaultModel'), 'chat default model')
    note(getSetting(fastify.config, 'chat.summaryModel'), 'chat summary model')
    note(getSetting(fastify.config, 'chat.titleModel'), 'chat title model')
    note(getSetting(fastify.config, 'chat.visionRelayModel'), 'chat vision-relay model')
    note(getSetting(fastify.config, 'api.anthropic.defaultModel'), 'api.anthropic.defaultModel')
    for (const [pat, m] of Object.entries(getSetting(fastify.config, 'api.anthropic.modelMap') || {})) note(m, `api.anthropic.modelMap['${pat}']`)
    return refs
  }

  // Readable by root + admin (the Models page and the Usage provider filter need the
  // list), but non-root gets a REDACTED view: name/kind/enabled only — endpoints, key
  // tails, sources, and the BYOK oversight list are root-level configuration detail.
  fastify.get('/admin/providers', { preHandler: manageUsers }, async (request) => {
    const names = Object.keys(effectiveProviders(fastify.config))
    if (!request.user.isRoot) {
      return {
        providers: names.map((name) => {
          const p = serializeProvider(name)
          return { name: p.name, kind: p.kind, type: p.type, supported: p.supported, enabled: p.enabled }
        }),
      }
    }
    // Oversight: BYOK rows (user-owned) are listed read-only — users manage their own
    // on the Account page; root's controls here touch only the GLOBAL layer.
    const byokRows = await fastify.db.mst_providers.findAll({
      where: { owner_user_id: { [Op.ne]: null } },
      include: [{ association: 'owner', attributes: ['id', 'username'], required: false }],
      order: [['rolling_id', 'ASC']],
    })
    return {
      providers: names.map(serializeProvider),
      byok: byokRows.map((r) => ({
        name: r.name,
        kind: r.kind,
        endpoint: r.endpoint,
        enabled: r.enabled,
        owner: r.owner?.username ?? r.owner_user_id,
        apiKeySet: Boolean(r.api_key_encrypted),
      })),
    }
  })

  fastify.post('/admin/providers', {
    preHandler: systemConfig,
    schema: {
      body: {
        type: 'object',
        required: ['name', 'kind', 'endpoint'],
        properties: {
          name: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$', maxLength: 40 },
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
    if (effectiveProviders(fastify.config)[name]) {
      return reply.code(409).send({ error: { code: 'provider_exists', message: `Provider '${name}' already exists` } })
    }
    await fastify.db.mst_providers.create({
      name,
      kind,
      endpoint,
      api_key_encrypted: apiKey ? encryptRawKey(fastify.config, apiKey) : null,
      enabled: enabled !== false,
      owner_user_id: null, // platform-global (BYOK rows will carry a user id later)
    })
    await rebuild()
    // `keyConfigured` deliberately does NOT contain "apiKey"/"secret": the audit writer scrubs any
    // secret-NAMED field, so a field called apiKey came out as "[redacted]" even when it was null —
    // which reads as "a credential exists" when none does, and loses the set-vs-cleared fact entirely.
    // The value here is a boolean and never sensitive; the real key is not passed at all.
    await logConfigChange(fastify.db, {
      area: 'provider', action: 'create', target: name,
      before: null, after: { kind, endpoint, enabled: enabled !== false, keyConfigured: Boolean(apiKey) },
      actor: request.user, log: request.log,
    })
    return reply.code(201).send({ provider: serializeProvider(name) })
  })

  fastify.patch('/admin/providers/:name', {
    preHandler: systemConfig,
    schema: {
      body: {
        type: 'object',
        properties: {
          kind: { type: 'string', minLength: 1 },
          endpoint: { type: 'string', minLength: 1 },
          apiKey: { type: ['string', 'null'] }, // undefined = keep, '' or null = clear, string = replace
          enabled: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const name = request.params.name
    const effective = effectiveProviders(fastify.config)[name]
    if (!effective) return reply.code(404).send({ error: { code: 'provider_not_found', message: 'Provider not found' } })

    const { kind, endpoint, apiKey, enabled } = request.body
    if (kind !== undefined && !adapters[kind]) {
      return reply.code(400).send({ error: { code: 'kind_unsupported', message: `Provider kind '${kind}' is not supported (${Object.keys(adapters).join(', ')})` } })
    }

    // Editing a config default seeds a DB OVERRIDE row from the effective values —
    // the config.json file itself stays untouched (it remains the default).
    let row = await fastify.db.mst_providers.findOne({ where: { name, owner_user_id: null } })
    if (!row) {
      row = await fastify.db.mst_providers.create({
        name,
        kind: effective.kind || name,
        endpoint: effective.host || effective.baseURL || '',
        api_key_encrypted: effective.apiKey ? encryptRawKey(fastify.config, effective.apiKey) : null,
        enabled: effective.enabled !== false,
        owner_user_id: null,
      })
    }

    // Snapshot BEFORE the update — an endpoint or enabled flag that moved silently is the whole reason
    // this trail exists. Key material is reduced to a boolean, never carried.
    const was = { kind: row.kind, endpoint: row.endpoint, enabled: row.enabled, keyConfigured: Boolean(row.api_key_encrypted) }

    const patch = {}
    if (kind !== undefined) patch.kind = kind
    if (endpoint !== undefined) patch.endpoint = endpoint
    if (apiKey !== undefined) patch.api_key_encrypted = apiKey ? encryptRawKey(fastify.config, apiKey) : null
    if (enabled !== undefined) patch.enabled = enabled
    if (Object.keys(patch).length) await row.update(patch)
    await rebuild()
    if (Object.keys(patch).length) {
      await logConfigChange(fastify.db, {
        area: 'provider', action: 'update', target: name,
        before: was,
        after: { kind: row.kind, endpoint: row.endpoint, enabled: row.enabled, keyConfigured: Boolean(row.api_key_encrypted) },
        actor: request.user, log: request.log,
      })
    }
    return reply.send({ provider: serializeProvider(name) })
  })

  fastify.delete('/admin/providers/:name', { preHandler: systemConfig }, async (request, reply) => {
    const name = request.params.name
    const effective = effectiveProviders(fastify.config)[name]
    if (!effective) return reply.code(404).send({ error: { code: 'provider_not_found', message: 'Provider not found' } })

    const row = await fastify.db.mst_providers.findOne({ where: { name, owner_user_id: null } })
    const hasConfigDefault = Boolean(fastify.config?.providers?.[name])
    if (!row) {
      // config-only defaults can't be deleted from the console — that's the file's job
      return reply.code(400).send({ error: { code: 'config_default', message: `'${name}' is a platform default from Backend/config.json — disable it here, or remove it from the file. Console deletes only remove database-configured providers.` } })
    }
    if (!hasConfigDefault) {
      // full removal — make sure nothing points at it
      const refs = referencedProviders().get(name)
      if (refs) {
        return reply.code(400).send({ error: { code: 'provider_referenced', message: `Provider '${name}' is referenced by ${refs.join(', ')} — repoint those first (or disable the provider instead)` } })
      }
    }
    const was = { kind: row.kind, endpoint: row.endpoint, enabled: row.enabled, keyConfigured: Boolean(row.api_key_encrypted) }
    await row.destroy()
    await rebuild()
    await logConfigChange(fastify.db, {
      area: 'provider', action: 'delete', target: name, before: was, after: null,
      // "deleted" and "reverted to the config default" are very different outcomes for a later reader —
      // in the second case the provider still exists, just from the file again.
      note: hasConfigDefault ? 'DB override removed — reverted to the Backend/config.json default' : 'removed entirely',
      actor: request.user, log: request.log,
    })
    // if a config default existed underneath, the provider reverts to it
    return reply.send({ ok: true, name, deleted: !hasConfigDefault, reverted: hasConfigDefault })
  })

  // ---- Provider testing (root + admin): health + model list + one-shot prompt --
  // Read/diagnostic surfaces are manage_users so admins can work the Models page;
  // provider CRUD above stays root-only. Resolves the provider directly from the
  // effective map, bypassing the enabled check — DISABLED providers must be
  // testable (that's when you verify them).
  const testableProvider = (name) => {
    const cfg = effectiveProviders(fastify.config)[name]
    if (!cfg) return null
    const kind = cfg.kind || name
    const adapter = adapters[kind]
    if (!adapter) return null
    return { adapter, providerConfig: { ...cfg, name } }
  }

  fastify.get('/admin/providers/:name/health', { preHandler: manageUsers }, async (request, reply) => {
    const t = testableProvider(request.params.name)
    if (!t) return reply.code(404).send({ error: { code: 'provider_not_found', message: 'Provider not found (or kind unsupported)' } })
    if (typeof t.adapter.healthCheck !== 'function') return reply.send({ status: 'unknown', detail: 'adapter has no health check' })
    return reply.send(await t.adapter.healthCheck(t.providerConfig))
  })

  fastify.get('/admin/providers/:name/models', { preHandler: manageUsers }, async (request, reply) => {
    const t = testableProvider(request.params.name)
    if (!t) return reply.code(404).send({ error: { code: 'provider_not_found', message: 'Provider not found (or kind unsupported)' } })
    try {
      return reply.send({ models: await t.adapter.listModels(t.providerConfig) })
    } catch (e) {
      return reply.code(502).send({ error: { code: 'models_failed', message: e?.message || 'Failed to list models' } })
    }
  })

  fastify.post('/admin/providers/:name/test', {
    preHandler: manageUsers,
    schema: {
      body: {
        type: 'object',
        required: ['model'],
        properties: {
          model: { type: 'string', minLength: 1 },
          prompt: { type: 'string', maxLength: 2000 },
          images: { type: 'array', items: { type: 'string', maxLength: 3_000_000 }, maxItems: 2 }, // data URLs — vision testing
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const t = testableProvider(request.params.name)
    if (!t) return reply.code(404).send({ error: { code: 'provider_not_found', message: 'Provider not found (or kind unsupported)' } })
    const prompt = request.body.prompt?.trim() || 'Reply with exactly: OK'
    const images = (request.body.images || []).filter((u) => /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u))
    const startedAt = Date.now()
    try {
      // reasoning ON so thinking models don't return an empty-looking reply
      const userMsg = { role: 'user', content: prompt }
      if (images.length) userMsg.images = images
      const result = await t.adapter.chat({
        ...t.providerConfig,
        model: request.body.model,
        messages: [userMsg],
        options: { stream: false, reasoning: { enabled: true }, max_tokens: 1024 },
      })
      const latencyMs = Date.now() - startedAt
      try {
        await fastify.db.log_usage.create({
          user_id: ownerIdOf(request.user, 'a usage row'),
          provider: request.params.name,
          model: `${request.params.name}/${request.body.model}`,
          endpoint: 'provider.test',
          prompt_tokens: result.usage?.promptTokens ?? null,
          completion_tokens: result.usage?.completionTokens ?? null,
          latency_ms: latencyMs,
          request_body: JSON.stringify({ prompt, images: images.length ? `[${images.length} image(s)]` : undefined }),
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

  // ---- Models catalog (root + admin) --------------------------------------------
  // One provider per call (the page loads sections lazily). Capability logic is
  // shared with the chat model picker — see app/adapters/model-caps.js.
  fastify.get('/admin/models', { preHandler: manageUsers }, async (request, reply) => {
    const name = request.query?.provider
    const t = testableProvider(name)
    if (!t) return reply.code(404).send({ error: { code: 'provider_not_found', message: 'Provider not found (or kind unsupported)' } })
    let models
    try {
      models = typeof t.adapter.listModelsDetailed === 'function'
        ? await t.adapter.listModelsDetailed(t.providerConfig)
        : await t.adapter.listModels(t.providerConfig)
    } catch (e) {
      return reply.code(502).send({ error: { code: 'models_failed', message: e?.message || 'Failed to list models' } })
    }
    const tested = await testedCapsForProvider(fastify.db, name) // probe results override everything
    // Ollama: the window we actually request — root's LIMIT (0 = none: each model runs at
    // its own maximum), the auto-optimize cap, and the trained max, whichever binds first —
    // shown next to the trained length so "trained 256k / running 100k" is visible at a
    // glance. Remote providers manage their own windows (null here).
    const isOllamaKind = (t.providerConfig.kind || name) === 'ollama'
    const platformNumCtx = isOllamaKind ? (getSetting(fastify.config, 'providers.ollamaNumCtxLimit') || 0) : 0
    // Auto-optimize: when the lever is on, each model's request window is additionally
    // capped at its MEASURED VRAM-fit optimum (providers.ollamaCtxOptimized, filled by
    // the Calibrate action below). Uncalibrated models keep the plain root value.
    const autoCtx = isOllamaKind && getSetting(fastify.config, 'providers.ollamaAutoCtx') === true
    const autoCtxPct = isOllamaKind ? getSetting(fastify.config, 'providers.ollamaCtxOptimalPct') : null
    const ctxCal = isOllamaKind ? (getSetting(fastify.config, 'providers.ollamaCtxOptimized') || {}) : {}
    const ctxManual = isOllamaKind ? (getSetting(fastify.config, 'providers.ollamaCtxManual') || {}) : {}
    const provHost = t.providerConfig.host
    return reply.send({
      provider: name,
      autoCtx,
      autoCtxPct,
      models: models.map((m) => {
        const { caps: baseCaps, inferred } = capsOf(m)
        const caps = new Set(baseCaps)
        const t = tested[m.id] || null
        if (t) {
          for (const [cap, r] of Object.entries(t)) {
            if (r.status === 'confirmed') caps.add(cap)
            else caps.delete(cap)
          }
        }
        const cal = isOllamaKind ? ctxCal[calKey(provHost, m.id)] : null
        const optimized = cal && Number.isInteger(cal.ctx) ? cal.ctx : null
        const applied = appliedOptimum(fastify.config, cal) // optimum × pct (fitsFull stays unscaled)
        // Root's manual per-model cap REPLACES the measured one when set (see providers.ollamaCtxManual).
        const manual = isOllamaKind ? (ctxManual[calKey(provHost, m.id)] ?? null) : null
        const limit = platformNumCtx > 0 ? platformNumCtx : Infinity // 0 = no limit
        const chosen = manual ?? (autoCtx && applied ? applied : null)
        const requested = chosen ? Math.min(limit, chosen) : limit
        const effective = isOllamaKind ? Math.min(requested, m.contextLength || requested) : Infinity
        return {
          id: m.id,
          label: m.label || m.id,
          capabilities: [...caps],
          inferred, // true = guessed from the name, not declared by the provider
          tested: t ? Object.fromEntries(Object.entries(t).map(([c, r]) => [c, r.status])) : null,
          testedAt: t ? Object.values(t).reduce((max, r) => (r.testedAt > max ? r.testedAt : max), '') || null : null,
          contextLength: m.contextLength ?? null,
          effectiveContext: Number.isFinite(effective) ? effective : null,
          optimizedContext: optimized, // measured VRAM-fit maximum (null = not calibrated)
          appliedContext: applied, // optimum × providers.ollamaCtxOptimalPct (the RECOMMENDED value)
          manualContext: manual, // root's hand-set cap for this model (null = follow the recommendation)
          calibratedAt: cal?.measuredAt ?? null,
          ctxFitsFull: cal?.fitsFull ?? null, // true = the full trained window fits in VRAM
          family: m.family ?? null,
          parameterSize: m.parameterSize ?? null,
          quantization: m.quantization ?? null,
          goodFor: goodForOf([...caps], m.id, m.parameterSize, m.description),
          blocked: isModelBlocked(name, m.id) || undefined, // root's blocklist (badge + Unblock)
        }
      }),
    })
  })

  // ---- Ollama context calibration (one at a time; the console POSTs then polls) --------
  // Measures the largest num_ctx that still fits fully in VRAM (the auto-optimize cap).
  // Loads the model a handful of times and evicts other loaded models first for a clean
  // budget — expect brief chat latency while a run is in flight.
  fastify.post('/admin/models/calibrate-ctx', {
    preHandler: systemConfig, // writes the providers.ollamaCtxOptimized setting
    schema: {
      body: {
        type: 'object',
        required: ['provider'],
        properties: {
          provider: { type: 'string', minLength: 1 },
          model: { type: 'string', minLength: 1 },
          all: { type: 'boolean' }, // every chat model, sequentially — the hardware-change refresh
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const t = testableProvider(request.body.provider)
    if (!t) return reply.code(404).send({ error: { code: 'provider_not_found', message: 'Provider not found (or kind unsupported)' } })
    if ((t.providerConfig.kind || request.body.provider) !== 'ollama') {
      return reply.code(400).send({ error: { code: 'not_ollama', message: 'Context calibration only applies to Ollama-kind providers' } })
    }
    let models
    if (request.body.all) {
      try {
        const detailed = await t.adapter.listModelsDetailed(t.providerConfig)
        // ":cloud" models run on Ollama's remote hardware — no local VRAM to calibrate
        models = detailed.filter((m) => capsOf(m).caps.includes('chat') && !/:cloud$/.test(m.id)).map((m) => m.id)
      } catch (e) {
        return reply.code(502).send({ error: { code: 'models_failed', message: e?.message || 'Failed to list models' } })
      }
      if (!models.length) return reply.code(400).send({ error: { code: 'no_chat_models', message: 'No chat models to calibrate' } })
    } else if (request.body.model) {
      models = [request.body.model]
    } else {
      return reply.code(400).send({ error: { code: 'model_required', message: 'Pass a model, or all:true' } })
    }
    const r = startCalibration({
      provider: request.body.provider,
      providerConfig: t.providerConfig,
      models,
      config: fastify.config,
      db: fastify.db,
      log: fastify.log,
    })
    if (r.error) return reply.code(409).send({ error: { code: r.error, message: 'A calibration is already running — wait for it to finish' } })
    return reply.send({ started: true, status: calibrationStatus() })
  })

  // ---- Root's MANUAL per-model context cap -------------------------------------------------------
  // Calibration measures what FITS; this sets what root WANTS. Different questions, so a manual value
  // overrides the measured one rather than being min'd with it — root may deliberately go above the
  // optimum (accepting spill for a model used on long documents) or well below it. `ctx: null` clears
  // the override and returns the model to its recommended value.
  fastify.put('/admin/models/ctx-manual', {
    preHandler: systemConfig,
    schema: {
      body: {
        type: 'object',
        required: ['provider', 'model'],
        properties: {
          provider: { type: 'string', minLength: 1, maxLength: 40 },
          model: { type: 'string', minLength: 1, maxLength: 300 },
          ctx: { type: ['integer', 'null'], minimum: 1024, maximum: 1048576 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { provider, model, ctx } = request.body
    const t = testableProvider(provider)
    if (!t) return reply.code(404).send({ error: { code: 'provider_not_found', message: 'Provider not found (or kind unsupported)' } })
    if ((t.providerConfig.kind || provider) !== 'ollama') {
      return reply.code(400).send({ error: { code: 'not_ollama', message: 'A manual context cap only applies to Ollama-kind providers' } })
    }
    const key = calKey(t.providerConfig.host, model)
    const map = { ...(getSetting(fastify.config, 'providers.ollamaCtxManual') || {}) }
    const before = map[key] ?? null
    if (ctx == null) delete map[key]
    else map[key] = ctx
    const res = await setSetting(fastify.db, 'providers.ollamaCtxManual', map, fastify.config)
    if (res?.error) return reply.code(400).send({ error: { code: 'invalid_setting', message: res.error } })

    // Audited like any other platform-config change — this one silently changes how much context every
    // chat on that model gets, which is exactly the class of change that was invisible before.
    await logConfigChange(fastify.db, {
      area: 'model_ctx', action: ctx == null ? 'clear' : 'set', target: `${provider}/${model}`,
      before: { manualCtx: before }, after: { manualCtx: ctx ?? null },
      actor: request.user, log: request.log,
    })

    const cal = (getSetting(fastify.config, 'providers.ollamaCtxOptimized') || {})[key] || null
    return reply.send({
      ok: true,
      model,
      manualContext: ctx ?? null,
      // Echo what the manual value is being weighed against, so a client never has to re-derive it.
      recommendedContext: appliedOptimum(fastify.config, cal),
      optimizedContext: cal && Number.isInteger(cal.ctx) ? cal.ctx : null,
      trainedContext: cal?.trained ?? null,
    })
  })

  fastify.get('/admin/models/calibrate-ctx', { preHandler: manageUsers }, async () => calibrationStatus())

  // The append-only calibration HISTORY. The live optima are one value per model, overwritten on every
  // run — so without this, measuring destroys the evidence needed to explain a change. Newest first.
  // `?model=` filters to one key; `?limit=` caps the rows.
  fastify.get('/admin/models/calibrate-ctx/history', { preHandler: manageUsers }, async (request) => {
    const all = getSetting(fastify.config, 'providers.ollamaCtxHistory') || []
    const key = typeof request.query?.model === 'string' && request.query.model ? request.query.model : null
    const limit = Math.min(300, Math.max(1, parseInt(request.query?.limit, 10) || 100))
    return {
      entries: historyFor(all, key, limit),
      total: all.length,
      max: CTX_HISTORY_MAX,
      // Say plainly what the log CANNOT tell you. These two settings changed the same model's optimum by
      // 67% in one evening, and Ollama exposes neither over its API — a reader comparing two entries
      // needs to know that difference is unrecorded rather than absent.
      note: 'kvCacheType / flashAttention are read by ollama serve from process env and are not exposed by its API, so they are recorded as null (configNotExposed). Two entries can differ for reasons this log cannot see.',
    }
  })

  // ---- LOCAL MONITOR (Ote's ask) — what is resident on this box, and whose it is ----
  // Ollama's /api/ps says WHAT is loaded; only the platform knows WHAT IT ASKED FOR, so the two are joined
  // here to flag models nothing of ours requested (another client, or a leftover runner). Reports BOTH
  // memory meters on purpose: a CPU-placed model reads 0 VRAM while holding its full size in system RAM,
  // and watching only VRAM is how three separate residency mistakes happened in one day.
  // system_config, matching Providers/System — this exposes host memory and can unload models.
  fastify.get('/admin/local', { preHandler: requireCapability('system_config') }, async (request, reply) => {
    try {
      return reply.send(await localSnapshot(fastify.config, fastify.db))
    } catch (e) {
      return reply.code(502).send({ error: { code: 'local_unavailable', message: e?.message || 'Could not read the local runtime' } })
    }
  })

  // Ask Ollama to release a model. NON-DESTRUCTIVE: keep_alive:0 frees the runner and the model reloads on
  // the next request — it is the documented API call, not a process kill (Ollama itself stays Ote's).
  fastify.post('/admin/local/unload', {
    preHandler: requireCapability('system_config'),
    schema: { body: { type: 'object', required: ['model'], properties: { model: { type: 'string', minLength: 1, maxLength: 200 } }, additionalProperties: false } },
  }, async (request, reply) => {
    try {
      const out = await unloadLocalModel(fastify.config, request.body.model)
      request.log?.info?.(`[local] unload requested for ${request.body.model} by ${request.user?.username ?? 'root'}`)
      // Re-read so the caller sees REALITY rather than our request: a wedged runner answers the unload
      // 200/"unload" and then stays exactly where it was (measured 2026-07-31).
      // SETTLE FIRST. Ollama accepts the unload and tears the runner down a beat later, so reading
      // immediately returned a snapshot that still listed the model — the row lingered until the next poll
      // and it looked like the button had done nothing. A re-read taken too early is no more truthful than
      // reporting the request, which is the exact failure this re-read exists to avoid.
      await new Promise((r) => setTimeout(r, 700))
      return reply.send({ ...out, snapshot: await localSnapshot(fastify.config, fastify.db) })
    } catch (e) {
      return reply.code(502).send({ error: { code: 'unload_failed', message: e?.message || 'Unload request failed' } })
    }
  })

  // Release EVERY resident model at once (Ote 2026-08-04). Same non-destructive verb as the single-model
  // route — keep_alive:0 per model, Ollama itself is never touched — but it reports per-model
  // released/stuck, because a batch where one runner is wedged must not read as a clean sweep.
  fastify.post('/admin/local/release-all', { preHandler: requireCapability('system_config') }, async (request, reply) => {
    try {
      const out = await releaseAllLocalModels(fastify.config)
      request.log?.warn?.(
        { asked: out.asked, released: out.released, stuck: out.stuck, by: request.user?.username ?? 'root' },
        '[local] RELEASE ALL — every resident model asked to unload',
      )
      // Audited: this frees memory out from under whatever is mid-flight, so "who did that, and when"
      // has to be answerable afterwards from something other than a log line.
      await logConfigChange(fastify.db, {
        area: 'local', action: 'release-all', target: 'ollama',
        before: { resident: out.asked }, after: { released: out.released, stuck: out.stuck },
        actor: request.user, log: request.log,
      })
      return reply.send({ ...out, snapshot: await localSnapshot(fastify.config, fastify.db) })
    } catch (e) {
      return reply.code(502).send({ error: { code: 'release_all_failed', message: e?.message || 'Release-all request failed' } })
    }
  })

  // ---- THE VOICE, on the Local page (Ote: "add thoese voice model to console/local so i can check what
  // up, and manages?"). Deliberately part of the LOCAL monitor rather than its own page: the sidecar is
  // one more thing resident on this box competing for the same VRAM as the chat models, and it was
  // starving them before the floor existed — so it belongs beside them, not in a separate tab.
  fastify.get('/admin/local/voice', { preHandler: requireCapability('system_config') }, async (request, reply) => {
    const { voiceService } = await import('../../voice/index.js')
    return reply.send(await voiceService({ config: fastify.config }).status())
  })

  // Release the sidecar's GPU memory. NON-DESTRUCTIVE and deliberately the same verb as the Ollama
  // Release button next to it: the engine reloads on the next press (2.73s measured).
  fastify.post('/admin/local/voice/unload', { preHandler: requireCapability('system_config') }, async (request, reply) => {
    const { voiceService, VoiceError } = await import('../../voice/index.js')
    const svc = voiceService({ config: fastify.config })
    try {
      const out = await svc.unload()
      request.log?.info?.(`[voice] sidecar unload requested by ${request.user?.username ?? 'root'}`)
      return reply.send({ ...out, status: await svc.status() })
    } catch (e) {
      const status = e instanceof VoiceError ? e.status : 502
      return reply.code(status).send({ error: { code: e?.code || 'unload_failed', message: e?.message || 'Unload failed' } })
    }
  })

  // Delete every cached clip. Safe by construction — a spoken reply is a DERIVED rendering, so this costs
  // re-render time and nothing else; the text remains the record either way.
  // WHAT IS IN THE PILE. Ote: *"make it show how much it build up. list of cache it pile up"* — the clips
  // newest-played first, with totals grouped by voice and engine, because that is what says where the megabytes
  // went. `limit` caps the rows; the response reports how many it left out rather than silently truncating.
  fastify.get('/admin/local/voice/clips', { preHandler: requireCapability('system_config') }, async (request, reply) => {
    const { voiceService } = await import('../../voice/index.js')
    const limit = Math.min(1000, Math.max(1, Number(request.query?.limit) || 200))
    return reply.send(await voiceService({ config: fastify.config }).clips({ limit }))
  })

  // Evict now: TTL first, then the size cap, least-recently-played first. `force` skips the once-a-minute
  // throttle that the automatic post-render sweep uses. Both limits come from settings, never constants.
  fastify.post('/admin/local/voice/sweep', { preHandler: requireCapability('system_config') }, async (request, reply) => {
    const { voiceService } = await import('../../voice/index.js')
    const svc = voiceService({ config: fastify.config })
    const out = await svc.sweepCache({ force: true })
    request.log?.info?.({ ...out }, `[voice] clip cache swept by ${request.user?.username ?? 'root'}`)
    return reply.send({ ...out, status: await svc.status() })
  })

  fastify.post('/admin/local/voice/clear-cache', { preHandler: requireCapability('system_config') }, async (request, reply) => {
    const { voiceService } = await import('../../voice/index.js')
    const svc = voiceService({ config: fastify.config })
    const out = await svc.clearCache()
    request.log?.info?.({ ...out }, `[voice] clip cache cleared by ${request.user?.username ?? 'root'}`)
    return reply.send({ ...out, status: await svc.status() })
  })

  // Run capability probes against one model — each is ONE real request; results land
  // in model_capabilities and override declared/inferred capabilities everywhere
  // (catalog, chat picker, vision relay, chat capability gate). The probe set defaults
  // per model class: chat models get chat/vision/tools/thinking; embeddings-class models
  // get embeddings + chat (confirming/denying both directions); an explicit `caps` array
  // overrides. Other specialists (media-gen/speech/reranker) have nothing probeable.
  fastify.post('/admin/models/verify', {
    preHandler: manageUsers,
    schema: {
      body: {
        type: 'object',
        required: ['provider', 'model'],
        properties: {
          provider: { type: 'string', minLength: 1 },
          model: { type: 'string', minLength: 1 },
          caps: { type: 'array', items: { type: 'string', enum: PROBEABLE }, minItems: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    try {
      const caps = request.body.caps || await defaultProbeSet(fastify.config, request.body.provider, request.body.model)
      if (!caps) {
        return reply.code(400).send({ error: { code: 'not_probeable', message: 'No meaningful probe exists for this model class (media-gen/speech/reranker)' } })
      }
      const results = await probeModel({ db: fastify.db, config: fastify.config, provider: request.body.provider, model: request.body.model, caps })
      return reply.send({ provider: request.body.provider, model: request.body.model, results })
    } catch (e) {
      return reply.code(502).send({ error: { code: 'verify_failed', message: e?.message || 'Verification failed' } })
    }
  })

  // Batch verify: probe EVERY model of one provider, streaming progress as SSE
  // (probes run sequentially — each loads a model; parallel would thrash).
  // Chat-class models get the four core probes; embeddings-class models get the
  // embeddings probe + chat (so "can't chat" becomes a VERDICT, not a name guess —
  // that verdict drives the chat capability gate). Other specialists (reranker/
  // media-gen/speech) are skipped: nothing probeable. One run per provider at a time.
  const verifyAllRunning = new Set()
  fastify.post('/admin/models/verify-all', {
    preHandler: manageUsers,
    schema: {
      body: {
        type: 'object',
        required: ['provider'],
        properties: { provider: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const provider = request.body.provider
    const t = testableProvider(provider)
    if (!t) return reply.code(404).send({ error: { code: 'provider_not_found', message: 'Provider not found (or kind unsupported)' } })
    if (verifyAllRunning.has(provider)) {
      return reply.code(409).send({ error: { code: 'verify_running', message: `A batch verify is already running for '${provider}'` } })
    }

    let models
    try {
      models = typeof t.adapter.listModelsDetailed === 'function'
        ? await t.adapter.listModelsDetailed(t.providerConfig)
        : await t.adapter.listModels(t.providerConfig)
    } catch (e) {
      return reply.code(502).send({ error: { code: 'models_failed', message: e?.message || 'Failed to list models' } })
    }

    const targets = [] // { id, caps: probe set (null = core four) }
    const skipped = []
    for (const m of models) {
      const { caps } = capsOf(m)
      if (caps.includes('embeddings')) targets.push({ id: m.id, caps: ['embeddings', 'chat'] })
      else if (caps.some((c) => SPECIALIST_CAPS.includes(c))) skipped.push(m.id)
      else targets.push({ id: m.id, caps: null })
    }

    verifyAllRunning.add(provider)
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    const send = (type, data) => {
      if (reply.raw.writableEnded || reply.raw.destroyed) return false
      reply.raw.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
      if (typeof reply.raw.flush === 'function') reply.raw.flush()
      return true
    }
    let clientGone = false
    request.raw.on('close', () => { clientGone = true })

    try {
      send('start', { provider, total: targets.length, skipped })
      for (let i = 0; i < targets.length; i++) {
        if (clientGone) break // stop probing when nobody is watching
        const { id: model, caps } = targets[i]
        send('model_start', { index: i, total: targets.length, model })
        try {
          const results = await probeModel({
            db: fastify.db, config: fastify.config, provider, model, caps,
            onProgress: (capability) => send('probe', { index: i, total: targets.length, model, capability }),
            probeTimeoutMs: 300_000, // a hung probe fails after 5 min instead of stalling the batch
            shouldStop: () => clientGone, // abort takes effect between probes, not just between models
          })
          send('model_done', { index: i, total: targets.length, model, results })
        } catch (e) {
          send('model_error', { index: i, total: targets.length, model, message: e?.message || 'probe error' })
        }
      }
      send('done', { provider, total: targets.length, skipped, aborted: clientGone })
    } finally {
      verifyAllRunning.delete(provider)
      if (!reply.raw.writableEnded && !reply.raw.destroyed) reply.raw.end()
    }
    return reply
  })

  // ---- Model blocklist (root) ---------------------------------------------------
  // A blocked provider/model disappears from every model list (chat picker, /v1/models,
  // API surfaces) and the chat runtime REFUSES it with model_blocked on all surfaces —
  // enforcement lives in chat-runtime via the in-memory snapshot (adapters/blocklist.js).
  // Reading the list is admin-visible (the Models page shows "blocked" badges); mutating
  // it is system_config = root only.
  fastify.get('/admin/models/blocks', { preHandler: manageUsers }, async () => {
    const rows = await fastify.db.mst_model_blocks.findAll({ order: [['rolling_id', 'ASC']] })
    return { blocks: rows.map((r) => ({ id: r.id, provider: r.provider, model: r.model, reason: r.reason, createdAt: r.created_at })) }
  })

  fastify.post('/admin/models/blocks', {
    preHandler: systemConfig,
    schema: {
      body: {
        type: 'object',
        required: ['provider', 'model'],
        properties: {
          provider: { type: 'string', minLength: 1, maxLength: 40 },
          model: { type: 'string', minLength: 1, maxLength: 300 },
          reason: { type: 'string', maxLength: 2000 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { provider, model, reason } = request.body
    const [row, created] = await fastify.db.mst_model_blocks.findOrCreate({
      where: { provider: provider.trim().toLowerCase(), model: model.trim() },
      defaults: { provider, model, reason: reason || null, blocked_by: ownerIdOrNull(request.user) },
    })
    if (!created && reason !== undefined) await row.update({ reason: reason || null })
    await rebuildModelBlocklist(fastify.db)
    // A block hides the model from EVERY model list and refuses it on every surface, so "why did this
    // model disappear for everyone?" needs an answer that outlives the console session.
    await logConfigChange(fastify.db, {
      area: 'model_block', action: created ? 'create' : 'update', target: `${row.provider}/${row.model}`,
      before: created ? null : { reason: row.reason }, after: { reason: row.reason },
      actor: request.user, log: request.log,
    })
    return reply.code(created ? 201 : 200).send({ block: { id: row.id, provider: row.provider, model: row.model, reason: row.reason, createdAt: row.created_at } })
  })

  fastify.delete('/admin/models/blocks/:id', { preHandler: systemConfig }, async (request, reply) => {
    const row = await fastify.db.mst_model_blocks.findOne({ where: { id: request.params.id } })
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'Block not found' } })
    const was = { provider: row.provider, model: row.model, reason: row.reason }
    await row.destroy()
    await rebuildModelBlocklist(fastify.db)
    await logConfigChange(fastify.db, {
      area: 'model_block', action: 'delete', target: `${was.provider}/${was.model}`,
      before: was, after: null, actor: request.user, log: request.log,
    })
    return { ok: true }
  })

  // ---- User feedback (submitted via /v1/me/feedback) — admin triage ----------------
  // Lifecycle: submitted (queued) → pending (an admin TOOK the case) → resolved (closed,
  // optionally with a reply + result screenshots + a token-boost reward).
  fastify.get('/admin/feedback', { preHandler: manageUsers }, async (request) => {
    const where = {}
    if (['submitted', 'pending', 'resolved', 'cancelled', 'rejected'].includes(request.query?.status)) where.status = request.query.status
    else if (request.query?.open === '1') where.status = { [Op.in]: ['submitted', 'pending'] }
    const rows = await fastify.db.txn_feedback.findAll({ where, order: [['rolling_id', 'DESC']], limit: 500 })
    // resolve submitter + case-taker display (loose — feedback survives user deletion)
    const ids = [...new Set(rows.flatMap((r) => [r.user_id, r.taken_by]).filter(Boolean))]
    const users = ids.length ? await fastify.db.mst_users.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'username', 'display_name'] }) : []
    const byId = new Map(users.map((u) => [u.id, u]))
    // reward grants attached to these items (one per feedback, max)
    const grants = rows.length ? await fastify.db.txn_token_grants.findAll({ where: { feedback_id: { [Op.in]: rows.map((r) => r.id) } } }) : []
    const rewardByFb = new Map(grants.map((g) => [g.feedback_id, g]))
    const submitted = await fastify.db.txn_feedback.count({ where: { status: 'submitted' } })
    const pending = await fastify.db.txn_feedback.count({ where: { status: 'pending' } })
    return {
      feedback: rows.map((r) => {
        const g = rewardByFb.get(r.id)
        return {
          id: r.id, category: r.category, message: r.message, context: r.context,
          status: r.status, createdAt: r.created_at, takenAt: r.taken_at, handledAt: r.handled_at,
          takenBy: r.taken_by ? (byId.get(r.taken_by)?.username || '(deleted)') : (r.status !== 'submitted' ? 'root' : null),
          imageCount: Array.isArray(r.images) ? r.images.length : 0, // full images fetched lazily (see :id/images)
          reply: r.reply || null,
          repliedAt: r.replied_at,
          replyImageCount: Array.isArray(r.reply_images) ? r.reply_images.length : 0,
          user: r.user_id ? { username: byId.get(r.user_id)?.username || '(deleted)', displayName: byId.get(r.user_id)?.display_name || null } : { username: 'root', displayName: null },
          reward: g ? { tier: g.tier, tokensPerDay: Number(g.tokens_per_day), expiresAt: g.expires_at } : null,
        }
      }),
      counts: { submitted, pending, open: submitted + pending },
    }
  })

  // Attached screenshots for one feedback item (the submitter's + the team's reply images)
  // — fetched lazily (data URLs would bloat the 500-row list). Root/admin triage view.
  fastify.get('/admin/feedback/:id/images', { preHandler: manageUsers }, async (request, reply) => {
    const row = await fastify.db.txn_feedback.findOne({ where: { id: request.params.id }, attributes: ['id', 'images', 'reply_images'] })
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'Feedback not found' } })
    return reply.send({
      images: Array.isArray(row.images) ? row.images : [],
      replyImages: Array.isArray(row.reply_images) ? row.reply_images : [],
    })
  })

  // Status moves + the submitter-facing response. `pending` = the caller TAKES the case
  // (stamped taken_by/taken_at); `resolved`/`rejected` close it (rejected = a polite
  // decline the submitter still sees — pair it with a thank-you reply). A reply (text +
  // up to 3 result screenshots, shown in the submitter's Options → Feedback) may ride any
  // move; sending a new one replaces the old (not a thread). Rewards only on RESOLVED
  // (tier 1/2/3 = +limits.rewardTier{N}Tokens per day for one month, one per feedback;
  // reopening does NOT revoke a given grant — revoke via the user's Limits panel).
  // `cancelled` is deliberately NOT settable here: withdrawing is the submitter's move.
  fastify.patch('/admin/feedback/:id', {
    preHandler: manageUsers,
    schema: {
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['submitted', 'pending', 'resolved', 'rejected'] },
          rewardTier: { type: 'integer', enum: [1, 2, 3] },
          reply: { type: 'string', maxLength: 4000 },
          replyImages: { type: 'array', items: { type: 'string', maxLength: 3_000_000 }, maxItems: 3 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const row = await fastify.db.txn_feedback.findOne({ where: { id: request.params.id } })
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'Feedback not found' } })
    const status = request.body.status
    const resolved = status === 'resolved'
    const closing = resolved || status === 'rejected'
    const tier = request.body.rewardTier

    let reward = null
    if (tier) {
      if (!resolved) {
        return reply.code(400).send({ error: { code: 'reward_requires_resolved', message: 'A reward can only be given while resolving (status=resolved)' } })
      }
      if (!row.user_id) {
        return reply.code(400).send({ error: { code: 'no_reward_target', message: 'This feedback has no user account to credit (root submissions cannot be rewarded)' } })
      }
      // Same authz invariants as manual grants: no self-dealing by default (an admin must
      // not resolve their OWN feedback with a boost — unless root turned on
      // limits.allowSelfReward for small teams where the admins ARE the testers), and
      // inflating a PEER admin's budget stays root-only regardless. The submitter must
      // also still exist — feedback survives a hard delete, but rewarding it would
      // strand an orphan grant.
      const selfCase = !request.user.isRoot && request.user.id === row.user_id
      if (selfCase && getSetting(fastify.config, 'limits.allowSelfReward') !== true) {
        return reply.code(403).send({ error: { code: 'cannot_reward_self', message: 'You cannot reward your own feedback — ask another admin or root (or root can allow this in System → Token limits)' } })
      }
      const submitter = await fastify.db.mst_users.findByPk(row.user_id, { include: [{ association: 'roles' }], paranoid: false })
      if (!submitter) {
        return reply.code(400).send({ error: { code: 'no_reward_target', message: 'The submitter account no longer exists' } })
      }
      // selfCase passed the gate above — their own admin role must not re-block it here;
      // rewarding a DIFFERENT admin's feedback remains root-only.
      if ((submitter.roles || []).some((r) => r.name === 'admin') && !request.user.isRoot && !selfCase) {
        return reply.code(403).send({ error: { code: 'root_only', message: 'Only root can reward feedback from admin accounts' } })
      }
      const existing = await fastify.db.txn_token_grants.findOne({ where: { feedback_id: row.id } })
      if (existing) {
        return reply.code(409).send({ error: { code: 'already_rewarded', message: 'This feedback has already been rewarded' } })
      }
      const tokensPerDay = getSetting(fastify.config, `limits.rewardTier${tier}Tokens`)
      let grant
      try {
        grant = await grantTokens(fastify.db, {
          userId: row.user_id, tokensPerDay, tier, source: 'feedback',
          feedbackId: row.id, note: `Feedback reward (tier ${tier})`, grantedBy: ownerIdOrNull(request.user),
        })
      } catch (e) {
        // partial unique index on feedback_id: a concurrent resolve won the race
        if (e?.name === 'SequelizeUniqueConstraintError' || e?.original?.code === '23505') {
          return reply.code(409).send({ error: { code: 'already_rewarded', message: 'This feedback has already been rewarded' } })
        }
        throw e
      }
      reward = { id: grant.id, tier, tokensPerDay: Number(grant.tokens_per_day), expiresAt: grant.expires_at }
      // audit trail on the SUBMITTER's account: who rewarded what, for which feedback
      try {
        await logUserChange(fastify.db, {
          userId: row.user_id, field: 'limits', oldValue: null,
          newValue: `rewarded +${Number(grant.tokens_per_day)}/day feedback tier-${tier} boost until ${new Date(grant.expires_at).toISOString().slice(0, 10)} (feedback ${row.id})`,
          actor: request.user,
        })
      } catch { /* auditing must never break the endpoint */ }
      request.log?.info?.(`[limits] feedback ${row.id} rewarded tier ${tier} (+${tokensPerDay}/day) to user ${row.user_id} by ${request.user.username}`)
    }

    const patch = { status }
    if (status === 'pending') {
      // taking the case (re-taking reassigns; taken_by null = root took it)
      patch.taken_by = ownerIdOrNull(request.user)
      patch.taken_at = new Date()
    } else if (closing) {
      patch.handled_by = ownerIdOrNull(request.user)
      patch.handled_at = new Date()
    } else {
      // back to the queue (reopen/release) — case ownership + resolution stamps clear
      patch.taken_by = null
      patch.taken_at = null
      patch.handled_by = null
      patch.handled_at = null
    }
    // The submitter-facing reply: non-empty sets/replaces it; explicit '' clears it.
    // replyImages (when provided) replace the set — same accepted formats as submissions.
    if (typeof request.body.reply === 'string') {
      const text = request.body.reply.trim()
      patch.reply = text || null
      patch.replied_by = text ? ownerIdOrNull(request.user) : null
      patch.replied_at = text ? new Date() : null
    }
    if (Array.isArray(request.body.replyImages)) {
      const IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/
      const imgs = request.body.replyImages.filter((u) => typeof u === 'string' && IMAGE_RE.test(u)).slice(0, 3)
      patch.reply_images = imgs.length ? imgs : null
    }
    await row.update(patch)
    // Realtime nudge to the SUBMITTER's open pages (same SSE channel as scheduled runs):
    // a reward lands a 🎁 toast the moment it's given, and the Feedback panel refreshes
    // live (status → resolved, the team reply, the 🎁 badge) instead of waiting for a
    // manual ↻. Hint-only — the client re-fetches /me/feedback + /me/budget for the details.
    if (row.user_id) {
      const replied = typeof request.body.reply === 'string' && Boolean(request.body.reply.trim())
      notifyChatEvent(row.user_id, { type: 'feedback-updated', status: row.status, rewarded: Boolean(reward), replied })
    }
    return { ok: true, status: row.status, reward: reward || undefined }
  })

  fastify.delete('/admin/feedback/:id', { preHandler: manageUsers }, async (request, reply) => {
    const row = await fastify.db.txn_feedback.findOne({ where: { id: request.params.id } })
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'Feedback not found' } })
    await row.destroy()
    return { ok: true }
  })

  // ---- Per-user token limits + boost grants -----------------------------------------
  // A user's budget = base daily cap (override ?? limits.defaultDailyTokens) + active
  // boost grants (feedback rewards / manual top-ups, each lasting one month). Reads are
  // manage_users; WRITES touching an account that holds admin are root-only — the same
  // peer-admin rule as user edits (an admin must not throttle or inflate a peer).
  const limitsWriteGuard = async (request, reply, targetUserId) => {
    // paranoid:false — limits of a SOFT-deleted user stay manageable (their grants
    // would otherwise be unrevocable until restore, and they revive with the account)
    const user = await fastify.db.mst_users.findByPk(targetUserId, { include: [{ association: 'roles' }], paranoid: false })
    if (!user) {
      reply.code(404).send({ error: { code: 'user_not_found', message: 'User not found' } })
      return null
    }
    if ((user.roles || []).some((r) => r.name === 'admin') && !request.user.isRoot) {
      reply.code(403).send({ error: { code: 'root_only', message: 'Only root can change limits for admin accounts' } })
      return null
    }
    return user
  }

  const shapeGrant = (g, now = Date.now()) => ({
    id: g.id,
    tokensPerDay: Number(g.tokens_per_day),
    tier: g.tier,
    source: g.source,
    feedbackId: g.feedback_id,
    note: g.note,
    startsAt: g.starts_at,
    expiresAt: g.expires_at,
    active: new Date(g.starts_at).getTime() <= now && now < new Date(g.expires_at).getTime(),
  })

  const shapeOverride = (row) => row ? {
    dailyTokens: row.daily_tokens != null ? Number(row.daily_tokens) : null,
    monthlyTokens: row.monthly_tokens != null ? Number(row.monthly_tokens) : null,
    unlimited: row.unlimited,
    note: row.note,
  } : null

  // Audit strings for the user_change_logs 'limits' trail (shown in the Edit-user
  // history) — compact old->new so every limit decision is reconstructible later.
  const describeOverride = (row) => row
    ? `daily=${row.daily_tokens ?? 'default'} monthly=${row.monthly_tokens ?? 'default'} unlimited=${row.unlimited ? 'yes' : 'no'}${row.note ? ` note="${row.note}"` : ''}`
    : '(platform default)'
  const describeGrant = (g) => `+${Number(g.tokens_per_day)}/day ${g.source}${g.tier ? ` tier-${g.tier}` : ''} boost until ${new Date(g.expires_at).toISOString().slice(0, 10)}${g.note ? ` note="${g.note}"` : ''}`
  const auditLimits = async (userId, oldValue, newValue, actor) => {
    try { await logUserChange(fastify.db, { userId, field: 'limits', oldValue, newValue, actor }) }
    catch { /* auditing must never break the endpoint */ }
  }

  fastify.get('/admin/users/:id/limits', { preHandler: manageUsers }, async (request, reply) => {
    const user = await fastify.db.mst_users.findByPk(request.params.id)
    if (!user) return reply.code(404).send({ error: { code: 'user_not_found', message: 'User not found' } })
    const [budget, override, grants] = await Promise.all([
      tokenBudgetFor(fastify, user.id),
      fastify.db.mst_user_limits.findOne({ where: { user_id: user.id } }),
      fastify.db.txn_token_grants.findAll({ where: { user_id: user.id }, order: [['rolling_id', 'DESC']], limit: 50 }),
    ])
    return { budget, override: shapeOverride(override), grants: grants.map((g) => shapeGrant(g)) }
  })

  fastify.put('/admin/users/:id/limits', {
    preHandler: manageUsers,
    schema: {
      body: {
        type: 'object',
        properties: {
          dailyTokens: { type: ['integer', 'null'], minimum: 0, maximum: 1_000_000_000_000 },
          monthlyTokens: { type: ['integer', 'null'], minimum: 0, maximum: 1_000_000_000_000 },
          unlimited: { type: 'boolean' },
          note: { type: ['string', 'null'], maxLength: 300 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const user = await limitsWriteGuard(request, reply, request.params.id)
    if (!user) return reply
    const [row, created] = await fastify.db.mst_user_limits.findOrCreate({ where: { user_id: user.id }, defaults: { user_id: user.id } })
    const before = created ? '(platform default)' : describeOverride(row)
    const patch = { updated_by: ownerIdOrNull(request.user) }
    if ('dailyTokens' in request.body) patch.daily_tokens = request.body.dailyTokens
    if ('monthlyTokens' in request.body) patch.monthly_tokens = request.body.monthlyTokens
    if ('unlimited' in request.body) patch.unlimited = request.body.unlimited
    if ('note' in request.body) patch.note = request.body.note || null
    await row.update(patch)
    await auditLimits(user.id, before, describeOverride(row), request.user)
    request.log?.info?.(`[limits] override for '${user.username}' set by ${request.user.username}: ${JSON.stringify(request.body)}`)
    return { ok: true, override: shapeOverride(row), budget: await tokenBudgetFor(fastify, user.id) }
  })

  // Manual boost grant ("and else"): +tokensPerDay for one month, stacking like rewards.
  fastify.post('/admin/users/:id/grants', {
    preHandler: manageUsers,
    schema: {
      body: {
        type: 'object',
        required: ['tokensPerDay'],
        properties: {
          tokensPerDay: { type: 'integer', minimum: 1, maximum: 1_000_000_000_000 },
          note: { type: 'string', maxLength: 300 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const user = await limitsWriteGuard(request, reply, request.params.id)
    if (!user) return reply
    const grant = await grantTokens(fastify.db, {
      userId: user.id, tokensPerDay: request.body.tokensPerDay, source: 'manual',
      note: request.body.note || null, grantedBy: ownerIdOrNull(request.user),
    })
    await auditLimits(user.id, null, `granted ${describeGrant(grant)}`, request.user)
    request.log?.info?.(`[limits] manual grant +${request.body.tokensPerDay}/day for '${user.username}' by ${request.user.username}`)
    return reply.code(201).send({ ok: true, grant: shapeGrant(grant) })
  })

  // Revoke a boost (mistaken reward / manual top-up). Same peer-admin write rule.
  fastify.delete('/admin/grants/:id', { preHandler: manageUsers }, async (request, reply) => {
    const row = await fastify.db.txn_token_grants.findOne({ where: { id: request.params.id } })
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'Grant not found' } })
    const user = await limitsWriteGuard(request, reply, row.user_id)
    if (!user) return reply
    await row.destroy()
    await auditLimits(user.id, describeGrant(row), 'boost revoked', request.user)
    request.log?.info?.(`[limits] grant ${row.id} (+${Number(row.tokens_per_day)}/day) for '${user.username}' revoked by ${request.user.username}`)
    return { ok: true }
  })

  // ---- Usage (filtered + backend-paginated) -----------------------------------
  // Query params: page (1-based), pageSize (<=200), apiKeyId, provider, model (substring),
  // endpoint, from, to (ISO datetimes). Pagination happens in SQL so the response stays small
  // no matter how large the log grows. `limit` is honored as a legacy alias for pageSize.
  // Shared filter builder for the usage LIST and the usage STATS dashboard.
  //   ?userId=<uuid|root>: a user's usage = rows logged under their id (chat site) OR rows on
  //   any API key they own. 'root' additionally claims legacy rows with no user and no key.
  //   ?role=<roleName|root>: same shape, but for EVERY user holding that role.
  //   Both filters may be set — they AND together (each contributes one OR-group).
  const buildUsageWhere = async (q) => {
    const where = {}
    if (q.apiKeyId) where.api_key_id = q.apiKeyId
    if (q.provider) where.provider = q.provider
    if (q.endpoint) where.endpoint = q.endpoint
    if (q.model) where.model = { [Op.iLike]: `%${q.model}%` }
    if (q.from || q.to) {
      where.created_at = {}
      if (q.from && !Number.isNaN(Date.parse(q.from))) where.created_at[Op.gte] = new Date(q.from)
      if (q.to && !Number.isNaN(Date.parse(q.to))) where.created_at[Op.lte] = new Date(q.to)
    }
    const orGroups = []
    // `root` = both owner shapes (see rootOwnerValues above) — NULL for pre-2026-08-06 rows and
    // root's connected user id for everything since. Naming one silently halves the answer.
    if (q.userId) orGroups.push(await usageGroupFor(fastify.db, q.userId === 'root' ? rootOwnerValues() : [q.userId]))
    if (q.role) orGroups.push(await usageGroupFor(fastify.db, q.role === 'root' ? rootOwnerValues() : await userIdsWithRole(q.role)))
    if (orGroups.length === 1) where[Op.or] = orGroups[0]
    else if (orGroups.length > 1) where[Op.and] = orGroups.map((g) => ({ [Op.or]: g }))
    return where
  }

  // Dashboard aggregates — same filters as the list (tokens per model/key/user/day).
  fastify.get('/admin/usage/stats', { preHandler: manageUsers }, async (request) => {
    const where = await buildUsageWhere(request.query || {})
    return computeUsageStats(fastify.db, where, { withUsers: true })
  })

  fastify.get('/admin/usage', { preHandler: manageUsers }, async (request) => {
    const q = request.query || {}
    const pageSize = Math.min(Math.max(Number(q.pageSize) || Number(q.limit) || 50, 1), 200)
    const page = Math.max(Number(q.page) || 1, 1)

    const where = await buildUsageWhere(q)

    const keyInclude = {
      association: 'apiKey',
      attributes: ['id', 'name', 'kind'],
      required: false,
      include: [{ association: 'owner', attributes: ['id', 'username'], required: false }],
    }
    // The row's user = the key's owner, falling back to the row's own user_id (chat rows
    // logged before key attribution existed). Root API keys read 'root'.
    const userInclude = { association: 'user', attributes: ['id', 'username'], required: false }
    const userNameOf = (r) => (r.apiKey ? (r.apiKey.owner?.username ?? 'root') : (r.user?.username ?? null))
    const { rows, count } = await fastify.db.log_usage.findAndCountAll({
      where,
      order: [['rolling_id', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      include: [keyInclude, userInclude],
    })
    return {
      usage: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        apiKeyId: r.api_key_id,
        apiKeyName: r.apiKey?.name ?? null,
        apiKeyKind: r.apiKey?.kind ?? null, // 'chat' rows get the system badge in the UI
        userName: userNameOf(r),
        provider: r.provider,
        model: r.model,
        endpoint: r.endpoint,
        promptTokens: r.prompt_tokens,
        completionTokens: r.completion_tokens,
        ttftMs: r.ttft_ms,
        latencyMs: r.latency_ms,
        createdAt: r.created_at,
      })),
      total: count,
      page,
      pageSize,
    }
  })

  // One usage row WITH the captured prompt/response bodies (kept out of the list to keep
  // paginated responses small — content loads only when a row's Details is opened).
  fastify.get('/admin/usage/:id', { preHandler: manageUsers }, async (request, reply) => {
    const r = await fastify.db.log_usage.findByPk(request.params.id, {
      include: [
        {
          association: 'apiKey', attributes: ['id', 'name', 'kind'], required: false,
          include: [{ association: 'owner', attributes: ['id', 'username'], required: false }],
        },
        { association: 'user', attributes: ['id', 'username'], required: false },
      ],
    })
    if (!r) return reply.code(404).send({ error: { code: 'not_found', message: 'Usage row not found' } })
    return reply.send({
      usage: {
        id: r.id,
        userId: r.user_id,
        apiKeyId: r.api_key_id,
        apiKeyName: r.apiKey?.name ?? null,
        apiKeyKind: r.apiKey?.kind ?? null,
        userName: r.apiKey ? (r.apiKey.owner?.username ?? 'root') : (r.user?.username ?? null),
        provider: r.provider,
        model: r.model,
        endpoint: r.endpoint,
        promptTokens: r.prompt_tokens,
        completionTokens: r.completion_tokens,
        ttftMs: r.ttft_ms,
        latencyMs: r.latency_ms,
        requestBody: r.request_body,
        responseBody: r.response_body,
        createdAt: r.created_at,
      },
    })
  })

  // ---- Usage retention / cold storage (ROOT only) ----------------------------
  // Settings live in /admin/settings (usage.retentionDays + usage.coldStorage.*).
  // The daily cron runs the pass automatically; this runs it on demand.
  fastify.post('/admin/usage/retention/run', { preHandler: systemConfig }, async (request) => {
    const result = await runUsageRetention({ db: fastify.db, config: fastify.config })
    // A retention pass PRUNES usage rows into cold storage. Recording the counts is the only way to
    // later tell "usage fell off a cliff" apart from "someone ran retention that afternoon".
    await logConfigChange(fastify.db, {
      area: 'retention', action: 'run', target: 'usage',
      before: null, after: result ?? null, note: 'manual usage-retention pass',
      actor: request.user, log: request.log,
    })
    return { result }
  })

  // Existing cold storage dump files (gzipped NDJSON, one per pruned month) — the
  // console shows these with a pointer to DevTools/maintenance/usage-cold-query.mjs for querying.
  fastify.get('/admin/usage/cold', { preHandler: systemConfig }, async () => {
    return listColdFiles(fastify.config)
  })

  // ---- Server log files (ROOT only) -------------------------------------------
  // Each boot creates fresh message_/requests_/queries_ files — they pile up with
  // nothing reaping them. Root can list and delete them from the System page.
  const LOG_NAME_RE = /^[\w.:-]+\.log$/ // whitelist; also path.basename guard below
  const logDirOf = () =>
    path.resolve(process.cwd(), fastify.config?.logging?.message?.log_directory || './logs')
  const logKindOf = (name) =>
    name.startsWith('message_') ? 'message' : name.startsWith('requests_') ? 'requests' : name.startsWith('queries_') ? 'queries' : 'other'

  fastify.get('/admin/logs', { preHandler: systemConfig }, async () => {
    const dir = logDirOf()
    let names = []
    try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.log')) } catch { /* no dir yet */ }
    const files = names.map((name) => {
      const st = fs.statSync(path.join(dir, name))
      return { name, kind: logKindOf(name), bytes: st.size, modifiedAt: st.mtime.toISOString() }
    }).sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1))
    return { directory: dir, files, totalBytes: files.reduce((s, f) => s + f.bytes, 0) }
  })

  // Read one log file: tail by default (files can be big), optional full download.
  fastify.get('/admin/logs/:name/content', { preHandler: systemConfig }, async (request, reply) => {
    const name = request.params.name
    if (!LOG_NAME_RE.test(name) || path.basename(name) !== name) {
      return reply.code(400).send({ error: { code: 'bad_name', message: 'Not a log file name' } })
    }
    const file = path.join(logDirOf(), name)
    if (!fs.existsSync(file)) return reply.code(404).send({ error: { code: 'not_found', message: 'Log file not found' } })

    if (request.query?.download) {
      reply.header('Content-Type', 'text/plain; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="${name}"`)
      return reply.send(fs.createReadStream(file))
    }

    const size = fs.statSync(file).size
    const tailBytes = Math.min(Math.max(Number(request.query?.tailKb) || 256, 16), 5120) * 1024
    const start = Math.max(0, size - tailBytes)
    const fd = fs.openSync(file, 'r')
    try {
      const buf = Buffer.alloc(size - start)
      fs.readSync(fd, buf, 0, buf.length, start)
      let content = buf.toString('utf8')
      if (start > 0) content = content.slice(content.indexOf('\n') + 1) // drop the cut first line
      return reply.send({ name, bytes: size, truncated: start > 0, content })
    } finally {
      fs.closeSync(fd)
    }
  })

  // Search across ALL log files (case-insensitive substring), newest files first.
  fastify.get('/admin/logs/search', { preHandler: systemConfig }, async (request, reply) => {
    const q = String(request.query?.q || '').trim()
    if (q.length < 2) return reply.code(400).send({ error: { code: 'query_too_short', message: 'Search needs at least 2 characters' } })
    const needle = q.toLowerCase()
    const MAX_MATCHES = 300
    const MAX_FILE_BYTES = 20 * 1024 * 1024 // skip pathological files

    const dir = logDirOf()
    let names = []
    try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.log')) } catch { /* no dir */ }
    const byNewest = names
      .map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs, size: fs.statSync(path.join(dir, name)).size }))
      .sort((a, b) => b.mtime - a.mtime)

    const matches = []
    let scanned = 0
    let skipped = 0
    for (const f of byNewest) {
      if (matches.length >= MAX_MATCHES) break
      if (f.size > MAX_FILE_BYTES) { skipped++; continue }
      scanned++
      const lines = fs.readFileSync(path.join(dir, f.name), 'utf8').split('\n')
      for (let i = 0; i < lines.length && matches.length < MAX_MATCHES; i++) {
        if (lines[i].toLowerCase().includes(needle)) {
          matches.push({ file: f.name, line: i + 1, text: lines[i].trim().slice(0, 400) })
        }
      }
    }
    return { q, matches, scannedFiles: scanned, skippedFiles: skipped, capped: matches.length >= MAX_MATCHES }
  })

  fastify.delete('/admin/logs/:name', { preHandler: systemConfig }, async (request, reply) => {
    const name = request.params.name
    if (!LOG_NAME_RE.test(name) || path.basename(name) !== name) {
      return reply.code(400).send({ error: { code: 'bad_name', message: 'Not a log file name' } })
    }
    const file = path.join(logDirOf(), name)
    if (!fs.existsSync(file)) return reply.code(404).send({ error: { code: 'not_found', message: 'Log file not found' } })
    try {
      fs.unlinkSync(file)
      return reply.send({ ok: true, name, deleted: true })
    } catch (e) {
      // the current boot's files may be locked on Windows
      return reply.code(409).send({ error: { code: 'file_in_use', message: `Could not delete '${name}' — it is likely the active log file (${e.code || e.message})` } })
    }
  })

  fastify.post('/admin/logs/clear', {
    preHandler: systemConfig,
    schema: {
      body: {
        type: 'object',
        properties: { olderThanDays: { type: 'integer', minimum: 0, maximum: 3650 } },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const dir = logDirOf()
    const cutoff = Date.now() - (request.body?.olderThanDays ?? 0) * 86400000
    let names = []
    try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.log')) } catch { /* no dir */ }
    let deleted = 0
    const skipped = []
    for (const name of names) {
      const file = path.join(dir, name)
      try {
        if (fs.statSync(file).mtimeMs >= cutoff) { skipped.push(name); continue } // newer than cutoff
        fs.unlinkSync(file)
        deleted++
      } catch { skipped.push(name) } // active/locked files stay
    }
    return { ok: true, deleted, skipped: skipped.length }
  })

  // ---- Scope vocabulary (for UI dropdowns) ----------------------------------
  // manage_users like the rest of /admin/*: only the admin API Keys page consumes it.
  // (Developers get their self-grantable scope list from GET /v1/me/apikeys instead.)
  fastify.get('/admin/scopes', { preHandler: manageUsers }, async () => {
    return { scopes: KNOWN_SCOPES }
  })
}
