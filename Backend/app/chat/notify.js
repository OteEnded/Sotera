// In-process per-user push channel for the chat page's event stream (GET /v1/chat/events).
//
// PROACTIVE content (scheduled runs, digests) lands while the page is open — without a
// push, the new conversation only appears after a manual refresh (Ote-reported). This is
// deliberately tiny: single-node process, so no cross-process bus; events are HINTS
// ("conversations changed") and the client re-fetches through the normal APIs — the
// stream never carries content, so it can never leak more than "something of yours moved".

const subs = new Map() // userKey -> Set<fn(payload)>
const keyOf = (userId) => userId ?? 'root' // root's rows use user_id null everywhere

/** How many streams this user currently holds — the route caps concurrent connections. */
export function chatSubscriberCount(userId) {
  return subs.get(keyOf(userId))?.size ?? 0
}

/** Register a listener for one user's events. Returns the unsubscribe fn. */
export function subscribeChatEvents(userId, fn) {
  const key = keyOf(userId)
  if (!subs.has(key)) subs.set(key, new Set())
  subs.get(key).add(fn)
  return () => {
    const set = subs.get(key)
    if (set) {
      set.delete(fn)
      if (set.size === 0) subs.delete(key)
    }
  }
}

/** Push an event to every open stream of one user. Never throws. */
export function notifyChatEvent(userId, payload) {
  const set = subs.get(keyOf(userId))
  if (!set) return
  for (const fn of set) {
    try { fn(payload) } catch { /* one dead listener never blocks the rest */ }
  }
}
