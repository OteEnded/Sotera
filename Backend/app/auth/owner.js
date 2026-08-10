// WHO OWNS THIS ROW — the one place that turns a request into an owner id, or refuses.
//
// ── THE BUG THIS EXISTS TO END ───────────────────────────────────────────────────────────────────
// OteLLMServices' most-repeated defect, found at SIX separate sites: "is this root?" was answered by
// looking at the SHAPE of a value — `owner_user_id IS NULL`. Root was a config login with no users row,
// so null meant root, so every write path spelled it `user?.id ?? null` and every read path filtered on
// `user_id: userId ?? null`. It worked, for exactly as long as the shape held.
//
// Then root gained a users row (2026-08-06) and the shape moved. Measured consequences: `?owner=root`
// returned 0 rows, root's API keys went dead, root was silently METERED at 888K tokens/day, and two
// separate tests surfaced a STRANGER'S key. Nothing threw. A rule living in a data shape disappears
// when the shape moves, and it takes every copy of itself with it.
//
// ── WHY SOTERA CAN BE STRICT WHERE OteLLMServices COULD NOT ──────────────────────────────────────
// OteLLMServices had to stay permissive: 118 conversations, 966 messages and 91 memories were already
// written with a NULL owner, and tightening would have made them invisible rather than fixed.
//
// Sotera has none. Verified 2026-08-10 across all 21 owner-bearing columns in her schema: ZERO
// NULL-owned rows, and `auth.root.userConnected` names a real row. So in her, a null owner is never a
// legitimate state — it is a bug, and the only question is whether it fails loudly or silently.
//
// ── THE SPLIT: AUTHENTICATION FAILS OPEN, PERSISTENCE FAILS CLOSED ───────────────────────────────
// ⚠️ This module must NEVER gate login. Root's sign-in is deliberately DB-free so the owner can get in
// and repair a broken database — locking him out of his own superuser over a bad config line would be
// far worse than the thing it protects against. `rootUser()` therefore still mints `id: null` and fails
// open, exactly as before.
//
// What changes is WRITING. A request that cannot name its owner may still read, may still reach the
// config screens, may still fix itself — but it may not create a row nobody can ever attribute, delete
// or clean up. That row is not a smaller problem than an error; it is a permanent one.
//
// ── WHEN NULL IS REAL, SAY SO OUT LOUD ───────────────────────────────────────────────────────────
// Two places in Sotera legitimately store a null, and both use `ownerIdOrNull` so the intent is on the
// page instead of being inferred from a `??`:
//   • txn_password_reset_requests.user_id — a reset requested for an email with NO account. The row must
//     exist either way or the endpoint leaks which addresses are registered.
//   • txn_memories.user_id where kind='identity' — persona-global facts about HER, owned by no user.
//     (Distinct from namespace='identity', which is a USER's identity slot and is always owned.)

/**
 * Raised when a request reaches a write path without a resolvable owner. Carries `statusCode` so
 * Fastify's default error handler answers 503 rather than a bare 500: this is a server misconfiguration
 * the operator can fix (connect root to a user row), not a malformed request.
 */
export class OwnerUnresolvedError extends Error {
  constructor(what) {
    super(`Cannot resolve an owner for ${what}. Root has no connected user row — set auth.root.userConnected to a real mst_users id, then retry.`)
    this.name = 'OwnerUnresolvedError'
    this.code = 'owner_unresolved'
    this.statusCode = 503
  }
}

/**
 * The owner id for a request, or a refusal. Use this at EVERY site that persists or filters by an
 * owner — the point is that the answer comes from one function, so it cannot drift the way six copies
 * of `?? null` did.
 *
 * @param {{id?: string|null}|null|undefined} user  request.user, or request.apiKey ({userId}) mapped in
 * @param {string} what  what is being written, for the error message ("a conversation", "an API key")
 * @returns {string} a non-empty owner id
 * @throws {OwnerUnresolvedError}
 */
export function ownerIdOf(user, what = 'this row') {
  const id = user?.id ?? user?.userId ?? null
  if (typeof id === 'string' && id.trim()) return id
  throw new OwnerUnresolvedError(what)
}

/**
 * The owner id, or null WHEN NULL IS A REAL VALUE — see the two cases named above. Behaviourally this
 * is just `user?.id ?? null`; the reason it exists is that a reader can tell a deliberate null from a
 * forgotten one without going and reading the schema. Never reach for it to silence `ownerIdOf`.
 */
export function ownerIdOrNull(user) {
  const id = user?.id ?? user?.userId ?? null
  return typeof id === 'string' && id.trim() ? id : null
}

/**
 * A Sequelize `where` fragment scoping a query to one owner. Same refusal as `ownerIdOf`: a request
 * that cannot name its owner must not quietly run `WHERE user_id IS NULL` and read whatever happens to
 * live there. That query is how a test once surfaced a stranger's API key.
 */
export function ownedBy(user, what = 'these rows') {
  return { user_id: ownerIdOf(user, what) }
}
