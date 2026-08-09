// ROOT'S DB IDENTITY — the one place that answers "does root have a user row, and which one?"
//
// PHASE 1 OF THE ROOT USER-RECORD REFACTOR (Ote, 2026-08-06). Additive on purpose: nothing in the auth
// path calls this yet. Root still logs in as `{ id: null, isRoot: true }` exactly as before, and every
// existing row stays where it is. This module exists so that when phase 2 wires it, the answer comes from
// ONE function instead of being re-derived at the three places that mint a root user object
// (auth/index.js loadInternalUser, auth/index.js loadSessionUser, routes/v1/auth.route.js login).
// Three copies of one decision is how the vision-relay default and the normaliser both drifted.
//
// ── WHY ROOT NEEDS A ROW AT ALL ────────────────────────────────────────────────────────────────────
// Root is a config login with no `mst_users` row, so `ownWhere` resolves it to `user_id IS NULL`. Two
// consequences, both measured on 2026-08-06:
//   1. `user_id IS NULL` means TWO different things — "persona-global identity memory" (by design) and
//      "root wrote this" (by accident). Zero identity rows exist today, so the collision is latent, but
//      it is structural and it merges two concepts the moment both populate.
//   2. Root's data is unattributable and permanently uncleanable: 118 conversations, 966 messages,
//      91 memories, 18 slots. No user-delete can ever reach them because there is no user to delete.
//
// ── THE CLIFF, STATED HERE SO PHASE 2 CANNOT FORGET IT ─────────────────────────────────────────────
// ⚠️ The moment root's id stops being null, every one of those rows STOPS MATCHING `ownWhere`. They are
// not lost, they simply become invisible — the same failure as the 6 orphaned memories we deleted, but
// at 1000× the scale. Wiring the identity and backfilling the rows is therefore ONE atomic step, never
// two deploys. Phase 3 owns that migration; phase 2 must not ship without it.
//
// ⚠️ AND IT MUST FAIL OPEN. If `userConnected` names a row that is missing, inactive, or malformed, root
// falls back to `id: null` and the platform LOGS it loudly. Failing closed would lock the owner out of
// his own superuser over a typo in a config file; failing silently is the defect class we keep fixing.
// Never lock root out.

/** Is this a plausible v4-shaped UUID? Cheap shape check — existence is a DB question, not a string one. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The user-row id root is connected to, or null when root is still a pure config login.
 * String-shape only — it does NOT prove the row exists. Callers that need existence must look it up
 * (and, per the fail-open rule above, treat a miss as "root has no row" rather than as an error).
 * @param {object|null|undefined} config  fastify.config
 * @returns {string|null}
 */
export function rootUserIdFrom(config) {
  const raw = config?.auth?.root?.userConnected
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  return UUID_RE.test(v) ? v.toLowerCase() : null
}

/**
 * Root's display name, read from ROOT'S OWN USER ROW. Async and best-effort.
 *
 * ⚠️ IT CAME FROM `auth.root.displayName` UNTIL 2026-08-07, AND THAT WAS THE WRONG STORE.
 * Ote: *"no need to save displayname to config, it should came from db"* — after spotting that root's
 * row ALREADY carried `display_name`, so the config key was a second copy of a value the database
 * already held. A rename through the console updated the file and left the row stale; measured, the
 * two diverged on the first save and `/v1/admin/users` showed the old one. Two stores holding one
 * value is what canonical-vs-derived forbids, and the row is the store every other user already uses.
 *
 * ⚠️ FAILS OPEN, AND THAT IS THE WHOLE REASON THIS IS SAFE TO PUT IN THE AUTH PATH. Root's login has
 * always been deliberately DB-free so the owner can sign in to fix a broken database. A display name
 * is COSMETIC — if the query fails, root signs in exactly as before and the console shows `@username`.
 * Nothing here may throw, and nothing here may gate authentication.
 */
export async function rootDisplayName(fastify, id) {
  if (!id) return null
  try {
    const row = await fastify?.db?.mst_users?.findByPk(id, { attributes: ['display_name'] })
    const n = row?.display_name
    return typeof n === 'string' && n.trim() ? n.trim() : null
  } catch {
    return null // the database is exactly what root may be signing in to repair
  }
}

/**
 * Is `userConnected` present but unusable? Distinguishes "not configured" (fine, phase-1 default) from
 * "configured wrong" (a typo that must be surfaced, not swallowed). Returns null when there is nothing
 * to complain about, else a human-readable reason.
 * @returns {string|null}
 */
export function rootUserIdProblem(config) {
  const raw = config?.auth?.root?.userConnected
  if (raw == null || raw === '') return null // simply not configured yet
  if (typeof raw !== 'string') return `auth.root.userConnected must be a string, got ${typeof raw}`
  if (!UUID_RE.test(raw.trim())) return `auth.root.userConnected is not a UUID: "${String(raw).slice(0, 40)}"`
  return null
}

/**
 * Does this user id belong to root's connected row? Used by the guard that refuses to delete it —
 * removing that row would orphan root's data AND leave config pointing at nothing.
 */
export function isRootConnectedUser(config, userId) {
  const id = rootUserIdFrom(config)
  return !!id && !!userId && String(userId).toLowerCase() === id
}
