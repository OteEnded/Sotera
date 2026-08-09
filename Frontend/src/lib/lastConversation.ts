// WHERE THE USER WAS, so "← Chat" returns them there instead of to a blank composer.
//
// ⚠ THE BUG THIS FIXES, and it is a one-click path everybody takes. The console's "← Chat" button linked to
// bare `/chat`, and bare `/chat` deliberately means NEW CHAT (ChatApp uses it as the new-chat action). So:
// open a conversation → check the Local panel → press "← Chat" → blank composer → type → you have silently
// started a SECOND conversation instead of continuing the first.
//
// Found by hermes_agent's review harness, which fragmented one conversation into 53 auto-titled chats
// before noticing. Her driver typed into bare `/chat` every run; the human version of the same mistake is
// the console round-trip, and nothing tells you it happened — the reply arrives normally, in the wrong room.
// Everything downstream then splits too: history, the rolling summary, and any memory captured after it.
//
// ⚠ THE FIX IS NOT TO CHANGE WHAT `/chat` MEANS. Auto-opening the newest conversation there would break the
// one affordance that is working. Only the RETURN link is wrong, so only the return link changes.
//
// localStorage, not a store or the URL: it must survive a full page load (the console is a different route
// tree) and it is a UI convenience, never a source of truth — a missing or stale value simply falls back to
// a new chat, which is the behaviour we have today.

const KEY = 'ols.lastConversationId'

/** Remember the conversation the user is in. Called by ChatApp whenever the route carries an id. */
export function rememberConversation(id: string | null | undefined): void {
  try {
    if (id) window.localStorage.setItem(KEY, id)
    else window.localStorage.removeItem(KEY)
  } catch { /* private mode / quota — the fallback is a new chat, which is fine */ }
}

/** Where "← Chat" should go: the last room if we know one, otherwise a new chat. */
export function chatHref(): string {
  try {
    const id = window.localStorage.getItem(KEY)
    // Shape-check before putting it in a URL: a corrupted value must not become a 404 route.
    if (id && /^[0-9a-f-]{36}$/i.test(id)) return `/chat/${id}`
  } catch { /* fall through */ }
  return '/chat'
}
