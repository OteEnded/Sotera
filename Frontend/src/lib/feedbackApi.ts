import { apiGet, apiPost } from './api'

export type FeedbackCategory = 'bug' | 'idea' | 'question' | 'praise' | 'other'

// submitted = queued · pending = the team took the case · resolved = closed ·
// cancelled = withdrawn by the submitter (hidden from their list) · rejected = declined
export type FeedbackStatus = 'submitted' | 'pending' | 'resolved' | 'cancelled' | 'rejected'

export type MyFeedback = {
  id: string
  category: FeedbackCategory
  message: string
  status: FeedbackStatus
  createdAt: string
  takenAt: string | null
  handledAt: string | null
  imageCount?: number // attached screenshots (data lives server-side)
  reply?: string | null // the team's response (shown to the submitter)
  repliedAt?: string | null
  replyImageCount?: number // result screenshots on the reply (fetched lazily)
  rewarded?: boolean // resolving this earned a token boost (amounts deliberately not shown here)
}
export const listMyFeedback = (): Promise<{ feedback: MyFeedback[] }> => apiGet('/v1/me/feedback')

// Withdraw an own submission (only while still open — submitted/pending). It disappears
// from the submitter's list; admins keep seeing it as status=cancelled.
export const cancelMyFeedback = (id: string): Promise<{ ok: boolean }> => apiPost(`/v1/me/feedback/${id}/cancel`)

// Screenshots for one OWN feedback item: the submitter's originals + the team's reply images.
export const getMyFeedbackImages = (id: string): Promise<{ images: string[]; replyImages: string[] }> =>
  apiGet(`/v1/me/feedback/${id}/images`)

// Attached screenshots for one feedback item (root/admin triage — fetched on demand).
export const getFeedbackImages = (id: string): Promise<{ images: string[]; replyImages: string[] }> =>
  apiGet(`/v1/admin/feedback/${id}/images`)

export const FEEDBACK_CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'bug', label: '🐞 Bug' },
  { value: 'idea', label: '💡 Idea / request' },
  { value: 'question', label: '❓ Question' },
  { value: 'praise', label: '💚 Praise' },
  { value: 'other', label: '💬 Other' },
]

export const submitFeedback = (body: { category: FeedbackCategory; message: string; context?: string; images?: string[] }) =>
  apiPost('/v1/me/feedback', body)

// "Give feedback" buttons ANYWHERE call openFeedbackFrom: it stashes WHERE the user
// clicked from (the form auto-fills it as context) and opens the right surface —
// on the chat site the Options modal's Feedback section (#options/feedback hash,
// handled by ChatApp); everywhere else (console pages) a standalone feedback modal
// (FeedbackModalHost, mounted by ConsoleLayout) since nothing there owns that hash.
const ORIGIN_KEY = 'feedback:origin'
export function openFeedbackFrom(origin: string) {
  try { sessionStorage.setItem(ORIGIN_KEY, origin) } catch { /* storage blocked */ }
  if (window.location.pathname.startsWith('/chat')) {
    window.location.hash = '#options/feedback'
  } else {
    openFeedbackModal()
  }
}

// ---- standalone feedback modal (console + any non-chat surface) ----
let modalOpen = false
const modalListeners = new Set<() => void>()
export const isFeedbackModalOpen = () => modalOpen
export const subscribeFeedbackModal = (fn: () => void) => {
  modalListeners.add(fn)
  return () => { modalListeners.delete(fn) }
}
export const openFeedbackModal = () => { modalOpen = true; for (const fn of modalListeners) fn() }
export const closeFeedbackModal = () => { modalOpen = false; for (const fn of modalListeners) fn() }
// ---- live feedback changes (SSE) ----
// The server pushes `feedback-updated` when the team replies/resolves/rewards a submission;
// ChatApp (which owns the one EventSource) relays it here so the open Feedback panel refreshes
// its list the moment it happens — no manual ↻. Same tiny pub/sub shape as the modal above.
const feedbackChangeListeners = new Set<() => void>()
export const subscribeFeedbackChanged = (fn: () => void) => {
  feedbackChangeListeners.add(fn)
  return () => { feedbackChangeListeners.delete(fn) }
}
export const notifyFeedbackChanged = () => { for (const fn of feedbackChangeListeners) fn() }

// Read + clear the stashed origin (the form consumes it once on open).
export function takeFeedbackOrigin(): string | null {
  try {
    const v = sessionStorage.getItem(ORIGIN_KEY)
    if (v) sessionStorage.removeItem(ORIGIN_KEY)
    return v
  } catch { return null }
}
