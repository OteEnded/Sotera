// User identity change-log helpers.
//
// Every change to username / email / display_name is recorded in user_change_logs. The log is
// admin/root-visible only; users never see it. The latest 'username' row also drives the 48h
// self-change cooldown (admin/root changes are exempt but still logged).

import { ownerIdOrNull } from './owner.js'

export const USERNAME_COOLDOWN_MS = 48 * 60 * 60 * 1000

/**
 * Record one identity-field change.
 * @param {object} db      models bag
 * @param {object} p
 * @param {string} p.userId            whose identity changed
 * @param {'username'|'email'|'display_name'} p.field
 * @param {string|null} p.oldValue
 * @param {string|null} p.newValue
 * @param {object} p.actor             request.user of whoever made the change
 */
export async function logUserChange(db, { userId, field, oldValue, newValue, actor }) {
  const isSelf = actor?.id != null && actor.id === userId
  const changed_by = actor?.isRoot ? 'root' : isSelf ? 'self' : `admin:${actor?.username ?? 'unknown'}`
  await db.log_user_changes.create({
    user_id: userId,
    field,
    old_value: oldValue ?? null,
    new_value: newValue ?? null,
    // ⚠️ WAS "// null = root (no DB row)" — root has a row now, so null no longer identifies anybody.
    // Attribution, not ownership: `changed_by` above still names the actor, so a null degrades the
    // record rather than orphaning it. See auth/owner.js.
    changed_by_user_id: ownerIdOrNull(actor),
    changed_by,
  })
}

/** ms remaining before the user may self-change their username again (0 = allowed now). */
export async function usernameCooldownRemaining(db, userId) {
  const last = await db.log_user_changes.findOne({
    where: { user_id: userId, field: 'username' },
    order: [['rolling_id', 'DESC']],
  })
  if (!last) return 0
  const elapsed = Date.now() - new Date(last.created_at).getTime()
  return Math.max(0, USERNAME_COOLDOWN_MS - elapsed)
}
