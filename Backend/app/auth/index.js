// Authentication + authorization.
//
// Two independent mechanisms:
//   1. API key (service-to-service): Authorization: Bearer sk_<name>_<random>
//      → sha256 → DB lookup in api_keys (active + unexpired) → scopes/owner.
//      Guards inference endpoints. Attach via requireScopes([...]).
//   2. Session cookie (human users): @fastify/secure-session.
//      Guards the admin surface + /v1/me. Attach via requireLogin() / requireRole('admin').
//
// API keys are first-class (no Consumer layer): a key carries its own name/description/scopes/owner.
// On API-key success:  request.apiKey = { apiKeyId, name, userId, scopes }
// On session success:   request.user   = { id, username, roles: [...] }

import crypto from 'node:crypto'
import { can } from './permissions.js'
import { rootUserIdFrom, rootDisplayName, isRootConnectedUser } from './root-identity.js'

// Scopes an API key can carry. NOTE: there is deliberately no 'admin' scope — API
// keys grant INFERENCE access only; the admin surface is session + capability gated,
// never reachable by a bearer token. (A former 'admin' scope was a no-op — nothing
// ever checked it — so it was removed to avoid implying an access tier that doesn't exist.)
export const KNOWN_SCOPES = [
  'providers.read',
  'models.read',
  'chat',
  'streaming',
  'embeddings',
]

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

// Constant-time string compare (for the root secret, which is a plaintext config
// value — not a bcrypt hash — so `===` would leak length/prefix via timing). Hash
// both sides to fixed-length digests first so timingSafeEqual gets equal lengths.
export function safeEqual(a, b) {
  const da = crypto.createHash('sha256').update(String(a ?? '')).digest()
  const db = crypto.createHash('sha256').update(String(b ?? '')).digest()
  return crypto.timingSafeEqual(da, db)
}

function extractBearerToken(request) {
  const header = request.headers?.authorization
  if (!header || typeof header !== 'string') return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1].trim() : null
}

// --- API key resolution (DB-backed) -----------------------------------------

export async function resolveApiKey(db, token, config = null) {
  if (!token || !db?.mst_api_keys) return null

  const row = await db.mst_api_keys.findOne({
    where: { key_hash: sha256(token), is_active: true }, // paranoid: soft-deleted keys are excluded
    include: [{ association: 'scopes' }, { association: 'owner', include: [{ association: 'roles' }] }],
  })
  if (!row) return null
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null

  // Owner standing gate: a key is only as valid as the account behind it. A DB-owned
  // key stops authenticating the moment its owner is deactivated, soft/hard-deleted, or
  // demoted below a key-capable tier (own_keys = developer/admin/root — "dev or upper").
  // Without this, a demoted/disabled user's key would keep working until the key row
  // itself was touched.
  //
  // ⚠️ ROOT IS EXEMPT, AND IT USED TO BE EXEMPT BY ACCIDENT OF SHAPE. Historically root keys carried
  // `owner_user_id = null` and the `!== null` test alone let them through. That stopped being true on
  // 2026-08-06: root gained a user row, so the mint path started stamping root's id onto its keys, and
  // every root key minted after that date began failing with `invalid_key`. The gate rebuilt the owner as
  // `{ isRoot: false, roles: […] }` from the row, root's row carries NO roles, so `can(…, 'own_keys')` was
  // false. Found 2026-08-08 by finally running apikey-owner-standing-check, which had been red for two days.
  //
  // ⚠️ NULL IS NO LONGER THE ONLY ROOT MARKER — ask the identity resolver instead of reading the shape.
  // Ote chose this over reverting the mint to null (2026-08-08): root's keys stay ATTRIBUTABLE to root's
  // row, which is what the row was added for, AND still skip a gate that cannot meaningfully apply — root
  // cannot be demoted or deactivated. `config` is optional so a caller without it degrades to the old
  // null-only behaviour rather than throwing.
  const ownerIsRoot = row.owner_user_id === null
    || (config ? isRootConnectedUser(config, row.owner_user_id) : false)
  if (!ownerIsRoot) {
    const owner = row.owner // null if the owner is soft-deleted (paranoid include) or gone
    if (!owner || owner.is_active === false) return null
    const ownerAsUser = { isRoot: false, roles: (owner.roles || []).map((r) => r.name) }
    if (!can(ownerAsUser, 'own_keys')) return null
  }

  // Best-effort last-used stamp; never block the request on it.
  db.mst_api_keys.update({ last_used_at: new Date() }, { where: { id: row.id } }).catch(() => {})

  return {
    apiKeyId: row.id,
    name: row.name,
    userId: row.owner?.id ?? row.owner_user_id ?? null,
    scopes: (row.scopes || []).map((s) => s.scope),
  }
}

export function requireScopes(requiredScopes = []) {
  const required = Array.isArray(requiredScopes) ? requiredScopes : [requiredScopes]

  return async function apiKeyPreHandler(request, reply) {
    const token = extractBearerToken(request)
    if (!token) {
      return reply.code(401).send({
        error: {
          code: 'missing_authorization',
          message: 'Missing Authorization header. Expected: Authorization: Bearer sk_<name>_<random>',
        },
      })
    }

    const apiKey = await resolveApiKey(request.server.db, token, request.server.config)
    if (!apiKey) {
      return reply.code(401).send({
        error: { code: 'invalid_key', message: 'API key is not recognized, inactive, or expired' },
      })
    }

    for (const scope of required) {
      if (!apiKey.scopes.includes(scope)) {
        return reply.code(403).send({
          error: {
            code: 'scope_required',
            message: `Required scope '${scope}' is not granted to API key '${apiKey.name}'`,
          },
        })
      }
    }

    request.apiKey = apiKey
  }
}

// --- Internal (in-process) auth ------------------------------------------------
// For the platform calling ITSELF via fastify.inject() — e.g. a scheduled skill-turn
// running a real chat turn AS its owner. The secret is 256 random bits minted at boot
// and held only in process memory: it never crosses the network, is never persisted,
// and rotates every restart. internalCallHeaders() is the only way to obtain it.

const INTERNAL_SECRET = crypto.randomBytes(32).toString('hex')

/** Headers that authenticate an in-process inject() as `userId` ('root' for the root user). */
export function internalCallHeaders(userId) {
  return { 'x-ote-internal': INTERNAL_SECRET, 'x-ote-internal-user': userId == null ? 'root' : String(userId) }
}

// PHASE 2 OF THE ROOT USER-RECORD REFACTOR — the ONE place a root user object is minted.
//
// Root's authority has never come from a DB row; it comes from `isRoot`, which is unchanged. What the
// id changes is SCOPE: `ownWhere` reads `req.user.id ?? null`, so this single value decides whether
// root's 353 backfilled rows are visible or invisible. That is why all three call sites now come
// through here instead of each writing `{ id: null, … }` — three copies of one decision is exactly how
// the vision-relay default and the normaliser drifted.
//
// ⚠️ FAILS OPEN, ALWAYS. If config names no row, or names a malformed one, `rootUserIdFrom` returns
// null and root logs in exactly as it did before phase 2. Never a throw, never a refusal: locking the
// owner out of his own superuser over a typo in a config file would be a far worse failure than the
// stale scope it would be protecting against. The boot reconciler is what makes the mismatch loud.
function rootUser(fastify, username) {
  return {
    id: rootUserIdFrom(fastify?.config), // null until config connects a row — same behaviour as before
    username: username || 'root',
    email: null,
    // The NAME lives on root's user row, not in config — see withRootName below, which fills it in.
    // Kept null here so this function stays synchronous and DB-free: it is the shape of a root user,
    // and nothing about authenticating as root may depend on a query.
    displayName: null,
    roles: ['root'],
    isRoot: true,
  }
}

/**
 * Fill in root's display name from its user row. Every async path that mints a root user goes through
 * here, so there is ONE place that knows where the name comes from.
 *
 * ⚠️ IT USED TO COME FROM `auth.root.displayName`, AND THAT WAS A SECOND COPY OF SOMETHING THE DATABASE
 * ALREADY HELD. Ote, 2026-08-07: *"didnt root have connected user record? why wont we save to that user
 * record on db?"* — root's row already carried `display_name`, so a rename written to the file left the
 * row stale, and `/v1/admin/users` (which reads the row) showed the old name. One value, one store.
 *
 * ⚠️ NEVER GATES LOGIN. `rootDisplayName` swallows its own errors and returns null, so if the database
 * is unreachable root still signs in — with no display name, which is cosmetic — and can go fix it.
 */
async function withRootName(fastify, user) {
  return { ...user, displayName: await rootDisplayName(fastify, user.id) }
}

async function loadInternalUser(request) {
  const secret = request.headers?.['x-ote-internal']
  if (!secret || !safeEqual(secret, INTERNAL_SECRET)) return null
  const uid = String(request.headers?.['x-ote-internal-user'] || '')
  if (uid === 'root') {
    return withRootName(request.server, rootUser(request.server, 'root'))
  }
  const user = await request.server.db.mst_users.findByPk(uid, { include: [{ association: 'roles' }] })
  if (!user || !user.is_active) return null
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    roles: (user.roles || []).map((r) => r.name),
    isRoot: false,
  }
}

// --- Session (human) auth ----------------------------------------------------

async function loadSessionUser(request) {
  const session = request.session
  if (!session) return null

  // Root session: config-defined superuser, now optionally BACKED BY a user row (phase 2).
  if (session.get?.('isRoot')) {
    return withRootName(request.server, rootUser(request.server, session.get('username') || 'root'))
  }

  const userId = session.get?.('userId')
  if (!userId) return null
  const user = await request.server.db.mst_users.findByPk(userId, {
    include: [{ association: 'roles' }],
  })
  if (!user || !user.is_active) return null
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    roles: (user.roles || []).map((r) => r.name),
    isRoot: false,
  }
}

export function requireLogin() {
  return async function loginPreHandler(request, reply) {
    const user = (await loadInternalUser(request)) || (await loadSessionUser(request))
    if (!user) {
      try { request.session?.delete?.() } catch { /* ignore */ }
      return reply.code(401).send({ error: { code: 'not_authenticated', message: 'Login required' } })
    }
    request.user = user
  }
}

export function requireRole(role) {
  return async function rolePreHandler(request, reply) {
    const user = request.user || (await loadSessionUser(request))
    if (!user) {
      return reply.code(401).send({ error: { code: 'not_authenticated', message: 'Login required' } })
    }
    request.user = user
    if (user.isRoot) return // root is a superuser — passes every role check
    if (!user.roles.includes(role)) {
      return reply.code(403).send({
        error: { code: 'role_required', message: `Role '${role}' required` },
      })
    }
  }
}
