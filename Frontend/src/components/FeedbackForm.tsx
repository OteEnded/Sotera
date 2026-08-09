import { useCallback, useEffect, useRef, useState } from 'react'
import { cancelMyFeedback, FEEDBACK_CATEGORIES, getMyFeedbackImages, listMyFeedback, submitFeedback, subscribeFeedbackChanged, takeFeedbackOrigin, type FeedbackCategory, type FeedbackStatus, type MyFeedback } from '../lib/feedbackApi'
import { prepareImage, type PreparedImage } from '../lib/image'
import ConfirmModal from './ConfirmModal'
import ImageLightbox from './ImageLightbox'

const MAX_FEEDBACK_IMAGES = 3

// The feedback form + the user's own submissions with LIVE status. Rendered in the
// Options modal's Feedback section. The host (ChatApp) passes `origin` — a human-friendly
// "where am I" (conversation name + model) computed from live state — so BOTH doors into
// this panel (the 📣 button AND Options → Feedback nav) show the same source instead of one
// showing the model and the other a raw /chat/<uuid> path. Opening the section (or ↻) refetches, so users watch the team
// move their items submitted → in progress → resolved, read the reply (+ result
// screenshots), and see the 🎁 badge when a resolution earned them a reward.
const CAT_LABEL: Record<string, string> = Object.fromEntries(FEEDBACK_CATEGORIES.map((c) => [c.value, c.label]))

const STATUS_CHIP: Record<FeedbackStatus, { label: string; cls: string }> = {
  submitted: { label: 'submitted', cls: 'bg-[var(--code-bg)] text-ink/70 border-line' },
  pending: { label: '👀 in progress', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  resolved: { label: '✓ resolved', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejected: { label: 'not planned — thank you', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  cancelled: { label: 'cancelled', cls: 'bg-[var(--code-bg)] text-ink/50 border-line' }, // never listed (server hides it); kept for type-completeness
}

export default function FeedbackForm({ origin }: { origin?: string }) {
  const [category, setCategory] = useState<FeedbackCategory>('idea')
  const [message, setMessage] = useState('')
  // `origin` (passed by the host from live state) wins; the stashed value (cross-surface
  // 📣 buttons via openFeedbackFrom) and the raw pathname are fallbacks. Always consume the
  // stash even when origin wins, so a chat-side origin never lingers into the console modal.
  const [context] = useState(() => { const stashed = takeFeedbackOrigin(); return origin || stashed || window.location.pathname })
  const [images, setImages] = useState<PreparedImage[]>([]) // WebP-converted screenshots
  const [busy, setBusy] = useState(false)
  const [justSent, setJustSent] = useState(false)
  const [err, setErr] = useState('')
  const [mine, setMine] = useState<MyFeedback[]>([])
  const [preview, setPreview] = useState<string | null>(null) // lightbox
  // lazily-loaded screenshots per feedback id — one fetch fills BOTH sides (the
  // submitter's own attachments and the team's reply images come from the same endpoint)
  const [ownShots, setOwnShots] = useState<Record<string, string[]>>({})
  const [openShots, setOpenShots] = useState<Record<string, boolean>>({}) // own-attachments toggle
  const [replyShots, setReplyShots] = useState<Record<string, string[]>>({})
  const [cancelling, setCancelling] = useState<MyFeedback | null>(null)
  // drag-over affordance: dragenter/dragleave fire for every CHILD crossed, so a depth
  // counter keeps the overlay steady until the pointer actually leaves the form
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const loadShots = (id: string) => getMyFeedbackImages(id)
    .then((r) => {
      setOwnShots((s) => ({ ...s, [id]: r.images || [] }))
      setReplyShots((s) => ({ ...s, [id]: r.replyImages || [] }))
    })
    .catch(() => { /* thumbnails are best-effort */ })

  const loadMine = useCallback(() => listMyFeedback()
    .then((r) => setMine(r.feedback || []))
    .catch(() => { /* list is best-effort; the form still works */ }), [])
  useEffect(() => { void loadMine() }, [loadMine])
  // live: when the team replies/resolves/rewards, refresh this list the moment it lands
  // (ChatApp relays the SSE `feedback-updated` push) — no manual ↻ needed.
  useEffect(() => subscribeFeedbackChanged(() => { void loadMine() }), [loadMine])

  // Attach screenshots — resized + re-encoded to WebP client-side (DB space), same as the
  // chat composer. From the 📎 button, drag-&-drop onto the form, or paste from clipboard.
  const addFiles = useCallback(async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return
    setErr('')
    try {
      const room = MAX_FEEDBACK_IMAGES - images.length
      const prepped = await Promise.all(imgs.slice(0, Math.max(0, room)).map((f) => prepareImage(f)))
      if (prepped.length) setImages((prev) => [...prev, ...prepped].slice(0, MAX_FEEDBACK_IMAGES))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read image')
    }
  }, [images.length])

  const send = async () => {
    const msg = message.trim()
    if (!msg) return
    setBusy(true); setErr('')
    try {
      await submitFeedback({ category, message: msg, context: context || undefined, images: images.length ? images.map((a) => a.url) : undefined })
      setMessage('')
      setImages([])
      setJustSent(true)
      setTimeout(() => setJustSent(false), 3000)
      await loadMine() // the new item (and any status changes) appear in the list below
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="relative flex flex-col gap-4"
      data-ui="feedback-form"
      onDragEnter={(e) => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth.current += 1; setDragOver(true) } }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragOver(false) }}
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault() }}
      onDrop={(e) => {
        dragDepth.current = 0; setDragOver(false)
        if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); void addFiles([...e.dataTransfer.files]) }
      }}
    >
      {/* the invitation a user asked for: dragging a file over the form now SHOWS where it lands */}
      {dragOver && (
        <div data-ui="feedback-drop-overlay" className="pointer-events-none absolute inset-[-8px] z-10 grid place-items-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/70">
          <span className="rounded-full bg-panel-strong border border-line px-4 py-2 text-[13px] font-bold text-accent-deep shadow-modal">📎 Drop your screenshot here</span>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <p className="adm-dim m-0 text-[13px]">Found a bug, have an idea, or a question? Tell us — it goes straight to the team. Attach a screenshot if it helps.</p>

        <label className="flex flex-col gap-1 text-[13px]">
          <span className="adm-dim">Type</span>
          <select className="gw-input max-w-[240px]" value={category} onChange={(e) => setCategory(e.target.value as FeedbackCategory)}>
            {FEEDBACK_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[13px]">
          <span className="adm-dim">Your feedback</span>
          <textarea
            className="gw-textarea"
            rows={4}
            placeholder="What happened / what would help? Steps to reproduce a bug are gold. (You can paste or drop a screenshot here.)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onPaste={(e) => {
              const files = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile()).filter((f): f is File => Boolean(f))
              if (files.length) { e.preventDefault(); void addFiles(files) }
            }}
            maxLength={4000}
          />
        </label>

        {/* attached screenshots (WebP) — thumbnails with remove; click to preview */}
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addFiles([...(e.target.files || [])]); if (fileRef.current) fileRef.current.value = '' }} />
        <div className="flex items-center gap-2 flex-wrap" data-ui="feedback-images">
          {images.map((img, i) => (
            <div key={i} className="relative">
              <img src={img.url} alt={`screenshot ${i + 1}`} title="Click to preview" onClick={() => setPreview(img.url)} className="h-14 w-14 rounded-lg border border-line object-cover cursor-zoom-in" />
              <button type="button" title="Remove" onClick={() => setImages((prev) => prev.filter((_, x) => x !== i))}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full border border-line bg-panel-strong text-[11px] leading-none">×</button>
            </div>
          ))}
          {images.length < MAX_FEEDBACK_IMAGES && (
            <>
              <button type="button" className="gw-btn adm-btn-sm" onClick={() => fileRef.current?.click()} title="Attach a screenshot (converted to WebP)">📎 Attach image</button>
              {/* always-visible affordance — the placeholder alone was too easy to miss (user feedback) */}
              <span className="adm-dim text-[12px]">or drag &amp; drop / paste a screenshot anywhere on this form</span>
            </>
          )}
        </div>

        {context && <div className="adm-dim text-[12px]">Sending from <code>{context}</code></div>}
        {err && <div className="gw-meta gw-error">{err}</div>}

        <div className="flex items-center gap-3">
          <button className="gw-btn gw-btn-primary" disabled={busy || !message.trim()} onClick={() => void send()}>
            {busy ? 'Sending…' : 'Send feedback'}
          </button>
          {justSent && <span className="text-[13px] text-emerald-700">✓ Sent — thanks!</span>}
        </div>
      </div>

      {mine.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold">Your feedback</span>
            <span className="adm-dim text-[12px]">{mine.length}</span>
            <button className="gw-btn adm-btn-sm ml-auto" title="Refresh status" onClick={() => void loadMine()}>↻</button>
          </div>
          <div className="flex flex-col gap-2">
            {mine.map((f) => (
              <div key={f.id} data-ui="feedback-item" className="rounded-lg border border-line bg-panel-strong px-3 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px]">{CAT_LABEL[f.category] || f.category}</span>
                  <span className="adm-dim text-[11px]">{new Date(f.createdAt).toLocaleDateString()}</span>
                  {(f.imageCount ?? 0) > 0 && (
                    <button type="button" data-ui="feedback-own-shots"
                      className="adm-dim border-0 bg-transparent p-0 text-[11px] cursor-pointer underline decoration-dotted underline-offset-2 hover:text-ink"
                      title={`${f.imageCount} screenshot(s) attached — click to ${openShots[f.id] ? 'hide' : 'view'}`}
                      onClick={() => { setOpenShots((s) => ({ ...s, [f.id]: !s[f.id] })); if (!ownShots[f.id]) void loadShots(f.id) }}>
                      📎 {f.imageCount}
                    </button>
                  )}
                  {f.rewarded && (
                    <span data-ui="feedback-rewarded" className="rounded-full border border-amber-200 bg-amber-100 text-amber-800 px-2 py-px text-[11px] font-medium" title="This feedback earned you a reward — thank you! (Your boost shows under Options → Usage.)">
                      🎁 rewarded
                    </span>
                  )}
                  <span className={`ml-auto rounded-full border px-2 py-px text-[11px] font-medium ${(STATUS_CHIP[f.status] || STATUS_CHIP.submitted).cls}`} data-ui="feedback-status">
                    {(STATUS_CHIP[f.status] || STATUS_CHIP.submitted).label}
                  </span>
                  {(f.status === 'submitted' || f.status === 'pending') && (
                    <button type="button" className="gw-btn adm-btn-sm" title="Cancel this feedback (withdraw it)" data-ui="feedback-cancel"
                      onClick={() => setCancelling(f)}>✕</button>
                  )}
                </div>
                <div className="mt-1 text-[13px] whitespace-pre-wrap break-words line-clamp-3">{f.message}</div>
                {/* the submitter's own attachments (lazy — behind the 📎 toggle above) */}
                {openShots[f.id] && (ownShots[f.id]?.length ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2" data-ui="feedback-own-images">
                    {ownShots[f.id].map((u, i) => (
                      <img key={i} src={u} alt={`attachment ${i + 1}`} title="Click to preview" onClick={() => setPreview(u)}
                        className="max-h-32 rounded-lg border border-line cursor-zoom-in" />
                    ))}
                  </div>
                )}
                {/* the team's reply — the "your feedback did something" moment */}
                {f.reply && (
                  <div data-ui="feedback-reply" className="mt-2 rounded-lg border border-accent/25 bg-accent-soft/40 px-2.5 py-2">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-accent-deep">
                      💬 Team reply
                      {f.repliedAt && <span className="adm-dim font-normal">{new Date(f.repliedAt).toLocaleDateString()}</span>}
                    </div>
                    <div className="mt-1 text-[13px] whitespace-pre-wrap break-words">{f.reply}</div>
                    {(f.replyImageCount ?? 0) > 0 && (
                      replyShots[f.id]
                        ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {replyShots[f.id].map((u, i) => (
                              <img key={i} src={u} alt={`result ${i + 1}`} title="Click to preview" onClick={() => setPreview(u)}
                                className="max-h-32 rounded-lg border border-line cursor-zoom-in" />
                            ))}
                          </div>
                        )
                        : (
                          <button type="button" className="gw-btn adm-btn-sm mt-2" onClick={() => void loadShots(f.id)}>
                            🖼 View {f.replyImageCount} result image{f.replyImageCount === 1 ? '' : 's'}
                          </button>
                        )
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {cancelling && (
        // stacking-context lift: this form lives inside the Options modal (z-70) or the
        // console feedback modal (z-80) — without it the z-50 confirm renders BEHIND them
        <div className="relative z-[90]">
          <ConfirmModal
            title="Withdraw feedback?"
            message="It will disappear from your list (the team keeps a record)."
            confirmLabel="Withdraw feedback"
            cancelLabel="Keep it"
            onConfirm={async () => { await cancelMyFeedback(cancelling.id); await loadMine() }}
            onClose={() => setCancelling(null)}
          />
        </div>
      )}

      <ImageLightbox src={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
