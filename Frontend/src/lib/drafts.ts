// Per-conversation composer drafts — the message a user has typed but not sent.
//
// The composer is a SINGLE input box reused across conversations, so its text must be
// scoped per conversation, otherwise a draft typed in one chat bleeds into the next.
// Drafts live in localStorage (a small map keyed by conversation id) so they survive
// switching chats, visiting the Console, AND a page reload — you don't lose a half-typed
// thought. The "new chat" composer (no conversation yet) uses the NEW_DRAFT_KEY bucket.

const STORAGE_KEY = 'ote:chatDrafts'
export const NEW_DRAFT_KEY = '__new__' // the not-yet-created "new chat" composer

type DraftMap = Record<string, string>
let cache: DraftMap | null = null

function load(): DraftMap {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    cache = raw ? (JSON.parse(raw) as DraftMap) : {}
  } catch {
    cache = {}
  }
  return cache
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache ?? {})) } catch { /* quota/private mode — drafts stay in memory */ }
}

export function getDraft(key: string): string {
  return load()[key] || ''
}

// Write-through: empty text removes the entry (also how a sent/deleted draft is cleared).
export function setDraft(key: string, text: string) {
  const d = load()
  if (text) d[key] = text
  else delete d[key]
  persist()
}
