import { useSyncExternalStore } from 'react'
import FeedbackForm from './FeedbackForm'
import { closeFeedbackModal, isFeedbackModalOpen, subscribeFeedbackModal } from '../lib/feedbackApi'
import { dismissOnBackdrop } from '../lib/overlay'

// Standalone feedback modal for surfaces that don't own the chat site's
// #options/feedback hash (i.e. the console). Mounted once by ConsoleLayout; any 📣
// button opens it via openFeedbackFrom(origin) — the origin auto-fills in the form.
export default function FeedbackModalHost() {
  const open = useSyncExternalStore(subscribeFeedbackModal, isFeedbackModalOpen)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[var(--overlay)] p-5" {...dismissOnBackdrop(closeFeedbackModal)}>
      <div
        className="max-h-[85vh] w-[min(560px,94vw)] overflow-y-auto rounded-2xl border border-line bg-panel-strong p-5 shadow-modal"
        data-ui="feedback-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="m-0 text-[17px]">📣 Send feedback</h3>
          <button className="gw-btn adm-btn-sm" onClick={closeFeedbackModal} aria-label="Close feedback">✕</button>
        </div>
        <FeedbackForm />
      </div>
    </div>
  )
}
