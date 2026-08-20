import bcrypt from 'bcryptjs'
import { Op } from 'sequelize'
import { rootUserIdFrom, rootDisplayName, isRootConnectedUser } from '../../auth/root-identity.js'
import { requireLogin, safeEqual } from '../../auth/index.js'
import { checkPasswordStrength } from '../../auth/password-policy.js'
import { capabilitiesFor } from '../../auth/permissions.js'
import { logUserChange, usernameCooldownRemaining } from '../../auth/user-changes.js'
import { loginLimiter, loginIpLimiter, makeLimiter } from '../../auth/rate-limit.js'
import { getSetting } from '../../settings/index.js'
import { computeUsageStats, usageGroupFor } from '../../usage/stats.js'

// Forgot-password requests: 5 per IP per hour (every request counts — there is no
// "success" that clears it). The response is always generic (no account enumeration).
const resetRequestLimiter = makeLimiter({ maxAttempts: 5, windowMs: 60 * 60 * 1000 })

// Self-service registration: 10 attempts per IP per hour (every attempt counts,
// success or not — stops both account farming and username/email enumeration).
const registerLimiter = makeLimiter({ maxAttempts: 10, windowMs: 60 * 60 * 1000 })

// Public registration is stricter than admin-created accounts: no '@' (the login
// identifier field matches username OR email, so an '@' username could shadow
// someone else's email), sane charset, and a minimum password length.
const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// `username` doubles as the identifier field: it matches a username OR an email.
const loginSchema = {
  type: 'object',
  required: ['username', 'password'],
  properties: {
    username: { type: 'string', minLength: 1 },
    password: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
}

function sessionUserOf(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    roles: (user.roles || []).map((r) => r.name),
    isRoot: false,
  }
}

export default async function authRoutes(fastify) {
  fastify.post('/auth/login', { schema: { body: loginSchema } }, async (request, reply) => {
    const { username, password } = request.body

    // Failure rate limiting: per-identifier (stop guessing one account) + per-IP (stop
    // spraying many accounts). Only failures count; success clears the identifier bucket.
    // Limits come from the root-editable security settings (config.json = defaults).
    const windowMs = getSetting(fastify.config, 'security.rateWindowMinutes') * 60_000
    const idOpts = { maxAttempts: getSetting(fastify.config, 'security.loginMaxAttempts'), windowMs }
    const ipOpts = { maxAttempts: getSetting(fastify.config, 'security.loginIpMaxAttempts'), windowMs }
    const idKey = `login:${request.ip}:${username.toLowerCase()}`
    const ipKey = `login:${request.ip}`
    const limited = [loginLimiter.check(idKey, idOpts), loginIpLimiter.check(ipKey, ipOpts)].find((r) => r.limited)
    if (limited) {
      return reply.code(429).send({
        error: { code: 'too_many_attempts', message: `Too many failed login attempts — try again in ~${Math.ceil(limited.retryAfterSeconds / 60)} min`, retryAfterSeconds: limited.retryAfterSeconds },
      })
    }
    const authFailed = () => {
      loginLimiter.recordFailure(idKey, idOpts)
      loginIpLimiter.recordFailure(ipKey, ipOpts)
      return reply.code(401).send({ error: { code: 'invalid_credentials', message: 'Invalid username or password' } })
    }

    // 1) Root: config-defined system owner (checked before the DB).
    const root = fastify.config?.auth?.root
    if (root?.username && root?.password && safeEqual(username, root.username) && safeEqual(password, root.password)) {
      loginLimiter.clear(idKey)
      request.session.set('isRoot', true)
      request.session.set('username', root.username)
      // phase 2: root carries its connected row id when config names one, else null exactly as before.
      // Same resolver as app/auth/index.js — the login response and every later request must agree.
      const rootId = rootUserIdFrom(fastify.config)
      // The name comes from root's ROW, not config — best-effort, so a database that is down still
      // lets root log in (with no display name, which is cosmetic) to go and repair it.
      const rootUser = {
        id: rootId, username: root.username, email: null,
        displayName: await rootDisplayName(fastify, rootId),
        roles: ['root'], isRoot: true,
      }
      return reply.send({ user: { ...rootUser, capabilities: capabilitiesFor(rootUser) } })
    }

    // 2) DB user — the identifier matches username OR email.
    const user = await fastify.db.mst_users.findOne({
      where: { [Op.or]: [{ username }, { email: username }] },
      include: [{ association: 'roles' }],
    })
    if (!user || !user.is_active) return authFailed()

    // ── ⭐⭐ R1 · ROOT'S CONNECTED ROW MAY NEVER AUTHENTICATE THROUGH THIS PATH ────────────────────
    // Root logs in at step 1, from config, and ONLY from config. This closes the DB door on root's row
    // regardless of what its `password_hash` happens to contain.
    //
    // ⚠️ WHY IT IS NOT ENOUGH THAT THE HASH IS A SENTINEL. `root-identity-bootstrap.js` writes a
    // deliberate non-bcrypt string (`x-root-authenticates-from-config-not-this-row`) so `bcrypt.compare`
    // can never match — and that comment names this exact threat. But a sentinel is a VALUE, not an
    // invariant. Measured 2026-08-20: `PATCH /v1/admin/users/:id {password}` overwrites it, root's row
    // holds NO role so the peer-admin guard cannot fire on it, and `isRootConnectedUser` guarded DELETE
    // but not PATCH. A non-root admin could therefore mint a session holding ROOT'S ROW ID.
    //
    // ⭐ AND THE STAKES ROSE ON 2026-08-20. Privilege is gated by the FLAG (`isRootActor`), but the ROOM
    // is gated by the ID — every room-scoped read keys on `user_id`. Under the ratified memory model root
    // becomes the authority over Sotera's own memory space, so a session holding root's id without root's
    // flag is a much larger problem than it was when it only meant "root's four memories".
    //
    // ⇒ One line, one place, and it does not care about the hash. ⚠️ It CANNOT lock root out: config is
    // step 1, checked before the database, precisely so the owner can sign in to repair a broken DB.
    // This removes a door root has never used.
    if (isRootConnectedUser(fastify.config, user.id)) {
      request.log?.warn?.(`[auth] refused DB login for root's connected row (${user.username}) — root authenticates from config only`)
      return authFailed()
    }

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return authFailed()

    loginLimiter.clear(idKey)
    request.session.set('isRoot', false)
    request.session.set('userId', user.id)
    const sessionUser = sessionUserOf(user)
    return reply.send({ user: { ...sessionUser, capabilities: capabilitiesFor(sessionUser) } })
  })

  // ---- self-service registration ------------------------------------------------
  // PUBLIC (root-toggleable via auth.registrationEnabled). New accounts start as
  // 'member'; the free member->power upgrade + the developer-access request are
  // self-service endpoints below. Registers AND signs in (session set) in one step.
  fastify.post('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1, maxLength: 100 },
          // optional but used for account recovery — same stance as everywhere else
          // on the platform (admin create, profile); without one the manual password
          // reset has no contact channel
          email: { type: 'string', maxLength: 255 },
          password: { type: 'string', minLength: 1, maxLength: 200 },
          displayName: { type: 'string', maxLength: 100 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    if (!getSetting(fastify.config, 'auth.registrationEnabled')) {
      return reply.code(403).send({ error: { code: 'registration_disabled', message: 'Self-service registration is currently disabled — contact the administrator for an account.' } })
    }
    const limitKey = `register:${request.ip}`
    const limited = registerLimiter.check(limitKey)
    if (limited.limited) {
      return reply.code(429).send({ error: { code: 'too_many_attempts', message: `Too many registration attempts — try again in ~${Math.ceil(limited.retryAfterSeconds / 60)} min`, retryAfterSeconds: limited.retryAfterSeconds } })
    }
    registerLimiter.recordFailure(limitKey) // every attempt counts

    const username = request.body.username.trim()
    const email = request.body.email?.trim() || null // optional; '' = none
    const password = request.body.password
    if (!USERNAME_RE.test(username)) {
      return reply.code(400).send({ error: { code: 'invalid_username', message: 'Username must be 3–32 characters: letters, digits, dot, dash or underscore (starting with a letter or digit).' } })
    }
    if (email && !EMAIL_RE.test(email)) {
      return reply.code(400).send({ error: { code: 'invalid_email', message: 'Enter a valid email address (or leave it blank) — it is how the administrator reaches you for account recovery.' } })
    }
    const pwCheck = checkPasswordStrength(password, { minLength: getSetting(fastify.config, 'security.passwordMinLength'), username, email })
    if (pwCheck.error) {
      return reply.code(400).send({ error: { code: 'weak_password', message: pwCheck.error } })
    }
    // The config-defined root username is reserved (login checks it before the DB).
    if (fastify.config?.auth?.root?.username && username.toLowerCase() === fastify.config.auth.root.username.toLowerCase()) {
      return reply.code(409).send({ error: { code: 'username_taken', message: `Username '${username}' is already taken` } })
    }
    // paranoid:false — soft-deleted accounts still reserve their username/email
    const taken = await fastify.db.mst_users.findOne({ where: { username }, paranoid: false })
    if (taken) return reply.code(409).send({ error: { code: 'username_taken', message: `Username '${username}' is already taken` } })
    if (email) {
      const emailTaken = await fastify.db.mst_users.findOne({ where: { email }, paranoid: false })
      if (emailTaken) return reply.code(409).send({ error: { code: 'email_taken', message: 'That email is already in use' } })
    }

    const user = await fastify.db.mst_users.create({
      username,
      email,
      display_name: request.body.displayName?.trim() || null,
      password_hash: await bcrypt.hash(password, 10),
      is_active: true,
    })
    const memberRole = await fastify.db.mst_roles.findOne({ where: { name: 'member' } })
    if (memberRole) {
      await fastify.db.mst_user_roles.findOrCreate({
        where: { user_id: user.id, role_id: memberRole.id },
        defaults: { user_id: user.id, role_id: memberRole.id },
      })
    }

    // Audit trail: self-registrations show up in the user's change history.
    await logUserChange(fastify.db, {
      userId: user.id, field: 'account', oldValue: null,
      newValue: `self-registered as member (ip ${request.ip || 'unknown'})`,
      actor: { id: user.id, username: user.username },
    })

    request.session.set('isRoot', false)
    request.session.set('userId', user.id)
    const sessionUser = { id: user.id, username: user.username, email: user.email, displayName: user.display_name, roles: ['member'], isRoot: false }
    return reply.code(201).send({ user: { ...sessionUser, capabilities: capabilitiesFor(sessionUser) } })
  })

  fastify.post('/auth/logout', async (request, reply) => {
    try { request.session.delete() } catch { /* ignore */ }
    return reply.send({ ok: true })
  })

  // ---- forgot password (manual flow for now) ------------------------------------
  // PUBLIC. Flow: the requester gives their EMAIL (step 1) + optionally the username
  // they claim (step 2 — recommended; admins compare it against the matched account
  // as a verification signal). The request lands on the admin queue (Users page):
  // an admin resets the password there and contacts the requester via the account's
  // email out-of-band. A full self-service email flow is a later phase. Response is
  // ALWAYS the same generic text — the endpoint never reveals whether an account exists.
  fastify.post('/auth/reset-request', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', minLength: 3, maxLength: 255 },
          username: { type: 'string', maxLength: 100 }, // claimed, optional
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const generic = { ok: true, message: 'Your password reset request has been recorded — please wait for email confirmation/contact from the administrator.' }

    const email = request.body.email.trim()
    // format check only (a typo helps nobody); says nothing about whether the account exists
    if (!EMAIL_RE.test(email)) {
      return reply.code(400).send({ error: { code: 'invalid_email', message: 'Enter a valid email address.' } })
    }

    const limitKey = `pwreset:${request.ip}`
    if (resetRequestLimiter.check(limitKey).limited) return reply.send(generic) // silently drop — still generic
    resetRequestLimiter.recordFailure(limitKey)

    try {
      const user = await fastify.db.mst_users.findOne({ where: { email } })
      // one PENDING row per email — repeat requests don't flood the admin list
      const existing = await fastify.db.txn_password_reset_requests.findOne({ where: { identifier: email, status: 'pending' } })
      if (!existing) {
        await fastify.db.txn_password_reset_requests.create({
          identifier: email,
          claimed_username: request.body.username?.trim() || null,
          user_id: user?.id ?? null,
          username_snapshot: user?.username ?? null,
          email_snapshot: user?.email ?? null,
          ip: request.ip || null,
        })
      }
    } catch (e) {
      request.log?.error?.(e) // never leak errors to the requester
    }
    return reply.send(generic)
  })

  // Session cookie is sliding (maxAge refreshes as the cookie is re-set).
  // Touch the session so a still-valid login extends its lifetime.
  fastify.post('/auth/refresh', { preHandler: requireLogin() }, async (request, reply) => {
    request.session.set('userId', request.user.id)
    return reply.send({ ok: true, user: request.user })
  })

  fastify.get('/me', { preHandler: requireLogin() }, async (request, reply) => {
    return reply.send({ user: { ...request.user, capabilities: capabilitiesFor(request.user) } })
  })

  // Change your own password (DB users only — root's password lives in config).
  fastify.post('/auth/change-password', {
    preHandler: requireLogin(),
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', minLength: 1 },
          newPassword: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    if (request.user.isRoot) {
      return reply.code(400).send({
        error: { code: 'root_password_in_config', message: "Root's password is set in Backend/config.json (auth.root), not here." },
      })
    }
    const user = await fastify.db.mst_users.findByPk(request.user.id)
    if (!user) return reply.code(404).send({ error: { code: 'user_not_found', message: 'User not found' } })

    const ok = await bcrypt.compare(request.body.currentPassword, user.password_hash)
    if (!ok) {
      return reply.code(403).send({ error: { code: 'wrong_password', message: 'Current password is incorrect' } })
    }
    // same policy as registration (root-configurable minimum + weak-password checks)
    const pwCheck = checkPasswordStrength(request.body.newPassword, {
      minLength: getSetting(fastify.config, 'security.passwordMinLength'), username: user.username, email: user.email,
    })
    if (pwCheck.error) {
      return reply.code(400).send({ error: { code: 'weak_password', message: pwCheck.error } })
    }
    await user.update({ password_hash: await bcrypt.hash(request.body.newPassword, 10) })
    return reply.send({ ok: true })
  })

  // ---- Self-service role tier ---------------------------------------------------
  // First-phase promo: members upgrade themselves to power for FREE (root-toggleable
  // via auth.selfUpgradeEnabled). Developer access is never self-service — users file
  // a request below and an admin grants the role manually on the Users page.
  fastify.post('/me/upgrade-to-power', { preHandler: requireLogin() }, async (request, reply) => {
    if (request.user.isRoot) {
      return reply.code(400).send({ error: { code: 'root_has_all', message: 'Root already has every capability.' } })
    }
    if (!getSetting(fastify.config, 'auth.selfUpgradeEnabled')) {
      return reply.code(403).send({ error: { code: 'upgrade_disabled', message: 'The free power upgrade is not available right now.' } })
    }
    const user = await fastify.db.mst_users.findByPk(request.user.id, { include: [{ association: 'roles' }] })
    if (!user) return reply.code(404).send({ error: { code: 'user_not_found', message: 'User not found' } })
    const roleNames = (user.roles || []).map((r) => r.name)
    if (!roleNames.includes('member') || roleNames.some((r) => ['power', 'developer', 'admin'].includes(r))) {
      return reply.code(400).send({ error: { code: 'not_eligible', message: 'The free upgrade is for member accounts only.' } })
    }
    const powerRole = await fastify.db.mst_roles.findOne({ where: { name: 'power' } })
    if (!powerRole) return reply.code(500).send({ error: { code: 'role_missing', message: "Role 'power' is not seeded" } })
    const memberRole = (user.roles || []).find((r) => r.name === 'member')
    await fastify.db.mst_user_roles.destroy({ where: { user_id: user.id, role_id: memberRole.id } })
    await fastify.db.mst_user_roles.findOrCreate({
      where: { user_id: user.id, role_id: powerRole.id },
      defaults: { user_id: user.id, role_id: powerRole.id },
    })
    // Audit trail: the free self-upgrade is a role change like any other.
    await logUserChange(fastify.db, {
      userId: user.id, field: 'roles',
      oldValue: roleNames.sort().join(', '),
      newValue: roleNames.filter((r) => r !== 'member').concat('power').sort().join(', '),
      actor: request.user,
    })
    const fresh = await fastify.db.mst_users.findByPk(user.id, { include: [{ association: 'roles' }] })
    const sessionUser = sessionUserOf(fresh)
    return reply.send({ user: { ...sessionUser, capabilities: capabilitiesFor(sessionUser) } })
  })

  // My developer-access request (pending one, if any) — the Account page shows status.
  fastify.get('/me/role-request', { preHandler: requireLogin() }, async (request, reply) => {
    if (request.user.isRoot) return reply.send({ request: null })
    const row = await fastify.db.txn_role_upgrade_requests.findOne({
      where: { user_id: request.user.id, status: 'pending' },
      order: [['rolling_id', 'DESC']],
    })
    return reply.send({
      request: row ? { id: row.id, requestedRole: row.requested_role, note: row.note, status: row.status, at: row.created_at } : null,
    })
  })

  // File a developer-access request. One pending request per user; an admin reviews
  // it on the Users page, grants the role in the Edit dialog, and marks it handled.
  fastify.post('/me/role-request', {
    preHandler: requireLogin(),
    schema: {
      body: {
        type: 'object',
        properties: { note: { type: 'string', maxLength: 2000 } },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    if (request.user.isRoot) {
      return reply.code(400).send({ error: { code: 'root_has_all', message: 'Root already has every capability.' } })
    }
    const roles = request.user.roles || []
    if (roles.includes('developer') || roles.includes('admin')) {
      return reply.code(400).send({ error: { code: 'already_developer', message: 'Your account already has developer access.' } })
    }
    const existing = await fastify.db.txn_role_upgrade_requests.findOne({
      where: { user_id: request.user.id, status: 'pending' },
    })
    if (existing) {
      return reply.send({ request: { id: existing.id, requestedRole: existing.requested_role, note: existing.note, status: existing.status, at: existing.created_at }, alreadyPending: true })
    }
    const row = await fastify.db.txn_role_upgrade_requests.create({
      user_id: request.user.id,
      username_snapshot: request.user.username,
      email_snapshot: request.user.email ?? null,
      requested_role: 'developer',
      note: request.body?.note?.trim() || null,
      ip: request.ip || null,
    })
    return reply.code(201).send({ request: { id: row.id, requestedRole: row.requested_role, note: row.note, status: row.status, at: row.created_at } })
  })

  // ---- My usage stats (dashboard in the chat Options modal) --------------------
  // Same aggregates as the admin dashboard, scoped to the CURRENT user (their chat
  // rows + rows on API keys they own; root = system scope). ?from/?to narrow the
  // window. Also the metering primitive for the planned per-user token limits.
  fastify.get('/me/usage/stats', { preHandler: requireLogin() }, async (request) => {
    const q = request.query || {}
    const where = { [Op.or]: await usageGroupFor(fastify.db, [request.user.isRoot ? null : request.user.id]) }
    if (q.from || q.to) {
      where.created_at = {}
      if (q.from && !Number.isNaN(Date.parse(q.from))) where.created_at[Op.gte] = new Date(q.from)
      if (q.to && !Number.isNaN(Date.parse(q.to))) where.created_at[Op.lte] = new Date(q.to)
    }
    return computeUsageStats(fastify.db, where)
  })

  // ---- Self-service profile: username / email / display name -------------------
  // Username: unique; self-changes limited to once per 48h (from the change log) — users with
  // manage_users (admin) bypass the cooldown; root has no DB profile. Email: nullable but unique;
  // used for future account recovery. Display name: nullable, not unique.
  fastify.patch('/me', {
    preHandler: requireLogin(),
    schema: {
      body: {
        type: 'object',
        properties: {
          username: { type: 'string', minLength: 1, maxLength: 100 },
          email: { type: ['string', 'null'], maxLength: 255 },
          displayName: { type: ['string', 'null'], maxLength: 100 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    // ── ROOT: display name only, written to config.json ────────────────────────────────────────────
    // Ote, 2026-08-07: *"why root cant chage his displayname? this is one thing he can do right?"* — and
    // he is right: root was the ONE account with no owner-facing way to rename itself, while its name
    // was already being used by the chat persona. It stays in config.json rather than moving to the DB
    // because root is the bootstrap account: its identity must be readable when the database is down.
    //
    // ⚠️ USERNAME AND EMAIL STAY REFUSED, and not out of caution alone. `username` is root's LOGIN
    // credential in that file, so changing it here would be a credential write — exactly what the
    // config-writer's gate exists to refuse. `email` has no meaning for root: account recovery goes
    // through the file, not a mailbox. Refusing them by name beats a silent no-op.
    if (request.user.isRoot) {
      const b0 = request.body || {}
      if (b0.username !== undefined || b0.email !== undefined) {
        return reply.code(400).send({ error: { code: 'root_profile_in_config', message: "Root's username and email live in Backend/config.json (auth.root) and are not editable here. Display name is." } })
      }
      if (b0.displayName === undefined) return reply.send({ ok: true, user: request.user })
      // ⚠️ ROOT'S NAME IS A ROW, NOT A CONFIG KEY — Ote, 2026-08-07: *"no need to save displayname to
      // config, it should came from db"*. It used to be written to `auth.root.displayName`, which was a
      // SECOND copy of something root's row already held: a rename updated the file and left the row
      // stale, and `/v1/admin/users` (which reads the row) showed the old name. Measured before the fix.
      // Now there is one store, and root saves through exactly the same column as every other account.
      if (!request.user.id) {
        return reply.code(409).send({ error: { code: 'root_row_not_connected', message: 'Root has no connected user row yet (auth.root.userConnected), so there is nowhere to store a display name.' } })
      }
      const rootRow = await fastify.db.mst_users.findByPk(request.user.id)
      if (!rootRow) return reply.code(404).send({ error: { code: 'user_not_found', message: "Root's connected user row is missing" } })
      const nextRootName = typeof b0.displayName === 'string' && b0.displayName.trim() ? b0.displayName.trim() : null
      if (nextRootName !== rootRow.display_name) {
        const oldRootName = rootRow.display_name
        await rootRow.update({ display_name: nextRootName })
        await logUserChange(fastify.db, {
          userId: request.user.id, field: 'display_name',
          oldValue: oldRootName, newValue: nextRootName, actor: request.user,
        })
      }
      return reply.send({ ok: true, user: { ...request.user, displayName: nextRootName } })
    }
    const user = await fastify.db.mst_users.findByPk(request.user.id, { include: [{ association: 'roles' }] })
    if (!user) return reply.code(404).send({ error: { code: 'user_not_found', message: 'User not found' } })

    const b = request.body || {}
    const actor = request.user
    const isAdmin = Boolean(capabilitiesFor(request.user)?.manage_users)

    // username
    if (typeof b.username === 'string' && b.username.trim() && b.username.trim() !== user.username) {
      const next = b.username.trim()
      if (!isAdmin) {
        const remaining = await usernameCooldownRemaining(fastify.db, user.id)
        if (remaining > 0) {
          const hours = Math.ceil(remaining / 3600000)
          return reply.code(429).send({ error: { code: 'username_cooldown', message: `Username was changed recently — you can change it again in ~${hours}h.` } })
        }
      }
      const taken = await fastify.db.mst_users.findOne({ where: { username: next }, paranoid: false }) // soft-deleted names stay reserved
      if (taken) return reply.code(409).send({ error: { code: 'username_taken', message: `Username '${next}' is already taken` } })
      const old = user.username
      await user.update({ username: next })
      await logUserChange(fastify.db, { userId: user.id, field: 'username', oldValue: old, newValue: next, actor })
    }

    // email ('' clears it; unique when set)
    if (b.email !== undefined) {
      const next = typeof b.email === 'string' && b.email.trim() ? b.email.trim() : null
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

    // display name ('' clears it; not unique)
    if (b.displayName !== undefined) {
      const next = typeof b.displayName === 'string' && b.displayName.trim() ? b.displayName.trim() : null
      if (next !== user.display_name) {
        const old = user.display_name
        await user.update({ display_name: next })
        await logUserChange(fastify.db, { userId: user.id, field: 'display_name', oldValue: old, newValue: next, actor })
      }
    }

    const fresh = await fastify.db.mst_users.findByPk(user.id, { include: [{ association: 'roles' }] })
    const sessionUser = sessionUserOf(fresh)
    return reply.send({ user: { ...sessionUser, capabilities: capabilitiesFor(sessionUser) } })
  })
}
