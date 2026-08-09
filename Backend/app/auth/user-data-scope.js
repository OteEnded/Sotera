// EVERY TABLE THAT POINTS AT A USER, AND WHAT A HARD DELETE DOES TO IT.
//
// ⚠ WHY THIS FILE EXISTS. The hard-delete path in admin.route.js enumerates tables BY HAND. That is a list
// somebody has to remember to update every time a feature adds a user-scoped table — and it drifted:
// `mst_slots` was never added, so hard-deleting a user left its induced slot vocabulary behind. Measured
// 2026-08-06: **9 orphaned rows in mst_slots** pointing at users that no longer exist, plus 2 in
// log_memory_changes (those are audit, and keeping them is correct — see KEPT).
//
// A comment saying "remember to add your table here" is not a mechanism. This is: every user-scoped table
// must appear in exactly ONE bucket below, and `test/unit/user-data-scope.test.mjs` reads the model files
// and FAILS if a table carries a user column and is not classified. Adding a table forces the question
// "what happens to this when its owner is deleted?" to be answered once, in writing, instead of being
// answered by accident years later.
//
// ── WHY NOT JUST ADD FOREIGN KEYS WITH ON DELETE CASCADE? ─────────────────────────────────────────────
// Because that is a DIFFERENT decision, and a deliberate one is already in place: every user-owning
// association in database/models/index.js is declared `constraints: false` ON PURPOSE — `mst_api_keys` is
// the single exception, which is why it is the only real FK on a user column in the database. Reversing
// that is an architecture call about delete semantics (a plain FK would make a user delete FAIL rather than
// cascade), not a cleanup, so it stays Ote's. This file closes the drift hole without touching it.

/**
 * DELETED with the user, by the hard-delete path itself.
 * These are the user's own content and working data: with the account gone they describe nobody.
 * Several need ordering or side effects (unregister live triggers, drop api-key scopes before the keys,
 * rebuild the provider registry), so the route keeps its bespoke sequence — this list is the CONTRACT the
 * route is checked against, not a loop that replaces it.
 */
export const DELETED_WITH_USER = {
  txn_conversations: 'chats they started (messages cascade from a real FK)',
  txn_memories: 'what the persona learned about them',
  txn_user_memories: 'notes they curated',
  mst_slots: 'slot vocabulary induced FROM their own facts — meaningless without them. ⚠ THE ONE THAT WAS MISSING (9 orphans)',
  mst_api_keys: 'their keys (scopes dropped first)',
  mst_providers: 'their BYOK providers (registry rebuilt after)',
  mst_trigger_jobs: 'their schedules — ⚠ live triggers unregistered FIRST, or ghosts keep firing for a user that no longer exists',
  mst_user_limits: 'per-user limits',
  mst_user_roles: 'their role grants',
  txn_password_reset_requests: 'in-flight reset requests',
  txn_role_upgrade_requests: 'in-flight upgrade requests',
  txn_token_grants: 'quota granted TO this account — it buys nothing once there is no account to spend it',
  log_user_changes: 'their own change history — part of the account, not the platform record',
}

/**
 * REMOVED AUTOMATICALLY by a real ON DELETE CASCADE, so the route must NOT list them.
 * Listing them anyway would be harmless today and wrong the day the cascade changes — two mechanisms for
 * one outcome is how the hand-list drifted in the first place.
 */
export const CASCADED_BY_FK = {
  txn_messages: 'FK to txn_conversations',
  txn_interaction_sessions: 'FK to txn_conversations',
  txn_todo_sessions: 'FK to txn_conversations (tasks cascade from the session)',
  mst_api_key_scopes: 'FK to mst_api_keys',
  log_trigger_job_runs: 'FK to mst_trigger_jobs',
}

/**
 * KEPT ON PURPOSE. A dangling user id here is not a defect — it is what an audit trail IS.
 * ⚠ Deleting these would let an account erase the record of what it did, which is the opposite of the point.
 * They are why "orphan" must never be treated as a synonym for "garbage" in this schema.
 */
export const KEPT_AFTER_DELETE = {
  log_config_changes: 'who changed config — the platform record, not the user\'s',
  log_key_reveals: 'who revealed which key: a security trail that must outlive the account',
  log_memory_changes: 'audit of memory writes; survives so the history stays readable',
  log_usage: 'usage/accounting history — deleting it would rewrite what the platform actually served',
  txn_feedback: 'feedback about the PRODUCT. It stops being theirs the moment it is submitted',
}

/** Every user-scoped table, with the bucket it belongs to. Used by the drift test. */
export function classifyUserScopedTable(table) {
  if (table in DELETED_WITH_USER) return 'deleted'
  if (table in CASCADED_BY_FK) return 'cascaded'
  if (table in KEPT_AFTER_DELETE) return 'kept'
  return null
}
