import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPatch, apiDelete } from '../../lib/api'
import RefreshButton from '../../components/RefreshButton'
import ConfirmModal from '../../components/ConfirmModal'
import { fmtTokens } from '../../lib/limitsApi'
import { getFeedbackImages, type FeedbackStatus } from '../../lib/feedbackApi'
import { prepareImage, type PreparedImage } from '../../lib/image'
import ImageLightbox from '../../components/ImageLightbox'
import { ui } from './ui'

type Item = {
  id: string
  category: string
  message: string
  context: string | null
  status: FeedbackStatus
  createdAt: string
  takenAt: string | null
  handledAt: string | null
  takenBy: string | null
  imageCount?: number
  reply: string | null
  repliedAt: string | null
  replyImageCount?: number
  user: { username: string; displayName: string | null }
  reward: { tier: 1 | 2 | 3 | null; tokensPerDay: number; expiresAt: string } | null
}

const CAT_STYLE: Record<string, string> = {
  bug: 'bg-rose-100 text-rose-700 border-rose-200',
  idea: 'bg-amber-100 text-amber-800 border-amber-200',
  question: 'bg-sky-100 text-sky-700 border-sky-200',
  praise: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  other: 'bg-[var(--code-bg)] text-ink/80 border-line',
}

const STATUS_STYLE: Record<FeedbackStatus, string> = {
  submitted: 'bg-amber-100 text-amber-800 border-amber-200',
  pending: 'bg-sky-100 text-sky-700 border-sky-200',
  resolved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-[var(--code-bg)] text-ink/50 border-line',
}

const MAX_REPLY_IMAGES = 3
// Open = submitted+pending (the work queue); the rest are exact-status views.
const FILTERS = ['open', 'submitted', 'pending', 'resolved', 'rejected', 'cancelled', 'all'] as const
type Filter = typeof FILTERS[number]

// Admin triage for user feedback. The lifecycle: submitted → pending (Take case) →
// resolved / rejected — the closing move can carry a reply + result screenshots the
// submitter sees in their Options → Feedback, and (resolve only) a one-month token-boost
// reward. Cancelled items (withdrawn by the submitter) stay visible here for context.
export default function FeedbackPage() {
  const [items, setItems] = useState<Item[]>([])
  const [openCount, setOpenCount] = useState(0)
  const [filter, setFilter] = useState<Filter>('open')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<Item | null>(null)
  const [shots, setShots] = useState<Record<string, { images: string[]; replyImages: string[] }>>({}) // lazily-loaded screenshots per item
  const [preview, setPreview] = useState<string | null>(null) // lightbox

  // close composer (Resolve… / Reject…): reply text + result images + optional reward tier
  const [closing, setClosing] = useState<{ id: string; mode: 'resolved' | 'rejected' } | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyImgs, setReplyImgs] = useState<PreparedImage[]>([])
  const [tier, setTier] = useState<0 | 1 | 2 | 3>(0)
  const [busy, setBusy] = useState(false)

  const query = filter === 'open' ? '?open=1' : filter === 'all' ? '' : `?status=${filter}`
  const load = useCallback(() => apiGet(`/v1/admin/feedback${query}`)
    .then((r) => { setItems(r.feedback || []); setOpenCount(r.counts?.open ?? 0) })
    .catch((e) => setError(e instanceof Error ? e.message : String(e))), [query])
  useEffect(() => { void load() }, [load])

  const patch = async (it: Item, body: Record<string, unknown>) => {
    setError('')
    try { await apiPatch(`/v1/admin/feedback/${it.id}`, body); await load() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const openComposer = (it: Item, mode: 'resolved' | 'rejected') => {
    setClosing({ id: it.id, mode })
    setReplyText(it.reply || '') // prefill: sending again replaces the reply
    setReplyImgs([])
    setTier(0)
  }

  const submitClose = async (it: Item) => {
    if (!closing) return
    setBusy(true); setError('')
    try {
      await apiPatch(`/v1/admin/feedback/${it.id}`, {
        status: closing.mode,
        ...(replyText.trim() || it.reply ? { reply: replyText.trim() } : {}), // '' clears a previous reply
        ...(replyImgs.length ? { replyImages: replyImgs.map((a) => a.url) } : {}),
        ...(closing.mode === 'resolved' && tier ? { rewardTier: tier } : {}),
      })
      setClosing(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const addReplyImages = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return
    try {
      const room = MAX_REPLY_IMAGES - replyImgs.length
      const prepped = await Promise.all(imgs.slice(0, Math.max(0, room)).map((f) => prepareImage(f)))
      if (prepped.length) setReplyImgs((prev) => [...prev, ...prepped].slice(0, MAX_REPLY_IMAGES))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read image')
    }
  }

  // lazily pull the attached screenshots for one item (they're kept out of the list payload)
  const viewImages = async (id: string) => {
    if (shots[id]) { setShots((s) => { const n = { ...s }; delete n[id]; return n }); return } // toggle closed
    try { const r = await getFeedbackImages(id); setShots((s) => ({ ...s, [id]: { images: r.images || [], replyImages: r.replyImages || [] } })) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className={`${ui.page} flex flex-col gap-4`}>
      <div>
        <div className="flex items-center gap-2">
          <h2 className={`${ui.h2} !mb-0`}>Feedback</h2>
          {openCount > 0 && <span className="rounded-full bg-accent/15 text-accent border border-accent/30 px-2 py-px text-[12px] font-semibold">{openCount} open</span>}
          <RefreshButton className="ml-auto" onRefresh={load} />
        </div>
        <p className="adm-dim"><b>Take case</b> marks an item pending (the submitter sees it's being worked on). <b>Resolve</b> or <b>Reject</b> closes it — both can carry a reply + result screenshots the submitter sees; resolving with a <b>🎁 reward</b> grants a one-month token boost (tier 1 minor / 2 / 3 big; amounts in System → Token limits).</p>
      </div>

      <div className="flex gap-1 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f} className={f === filter ? 'gw-btn adm-btn-sm gw-btn-primary' : 'gw-btn adm-btn-sm'} onClick={() => setFilter(f)}>
            {f === 'open' ? 'Open' : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {error && <div className="gw-meta gw-error">{error}</div>}

      {items.length === 0 ? (
        <div className="adm-dim py-6 text-center">No {filter === 'all' ? '' : `${filter} `}feedback.</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((it) => {
            const closed = it.status === 'resolved' || it.status === 'rejected'
            return (
            <div key={it.id} className={`gw-card !py-3 ${closed || it.status === 'cancelled' ? 'opacity-70' : ''}`}>
              <div className="flex items-center gap-2 flex-wrap">
                {/* status LEADS the row — it's the first thing triage scans for */}
                <span className={`inline-block rounded-full border px-2 py-px text-[11px] font-semibold ${STATUS_STYLE[it.status]}`} data-ui="fb-status">{it.status}</span>
                <span className={`inline-block rounded-full border px-1.5 py-px text-[11px] font-medium ${CAT_STYLE[it.category] || CAT_STYLE.other}`}>{it.category}</span>
                <span className="text-[13px] font-semibold">{it.user.displayName || it.user.username}</span>
                <span className="adm-dim text-[12px]">{new Date(it.createdAt).toLocaleString()}</span>
                {it.status === 'pending' && it.takenBy && <span className="adm-dim text-[12px]" title={it.takenAt ? `taken ${new Date(it.takenAt).toLocaleString()}` : undefined}>· {it.takenBy}'s case</span>}
                {it.reward && (
                  <span className="rounded-full border border-amber-200 bg-amber-100 text-amber-800 px-2 py-px text-[11px] font-medium" data-ui="reward-chip"
                    title={`Rewarded: +${fmtTokens(it.reward.tokensPerDay)} tokens/day until ${new Date(it.reward.expiresAt).toLocaleDateString()}`}>
                    🎁 T{it.reward.tier ?? '?'} +{fmtTokens(it.reward.tokensPerDay)}/day
                  </span>
                )}
                <span className="ml-auto flex gap-1 flex-wrap">
                  {it.status === 'submitted' && (
                    <button className="gw-btn adm-btn-sm" data-ui="fb-take" title="Take this case — the submitter sees it move to 'in progress'"
                      onClick={() => void patch(it, { status: 'pending' })}>✋ Take case</button>
                  )}
                  {(it.status === 'submitted' || it.status === 'pending') && (
                    <>
                      <button className="gw-btn adm-btn-sm" data-ui="fb-resolve" onClick={() => openComposer(it, 'resolved')}>✓ Resolve…</button>
                      <button className="gw-btn adm-btn-sm" data-ui="fb-reject" title="Decline politely — the submitter sees the status and your reply"
                        onClick={() => openComposer(it, 'rejected')}>Reject…</button>
                    </>
                  )}
                  {it.status === 'pending' && (
                    <button className="gw-btn adm-btn-sm" title="Release the case back to the queue" onClick={() => void patch(it, { status: 'submitted' })}>↩ Release</button>
                  )}
                  {closed && (
                    <button className="gw-btn adm-btn-sm" onClick={() => void patch(it, { status: 'submitted' })}>↩ Reopen</button>
                  )}
                  <button className="gw-btn adm-btn-sm adm-btn-danger" onClick={() => setDeleting(it)}>Delete</button>
                </span>
              </div>

              <div className="mt-1.5 text-[14px] whitespace-pre-wrap break-words">{it.message}</div>

              {/* the current submitter-facing reply (replaced when a new one is sent) */}
              {it.reply && closing?.id !== it.id && (
                <div className="mt-2 rounded-lg border border-accent/25 bg-accent-soft/40 px-2.5 py-1.5 text-[13px]" data-ui="fb-reply-view">
                  <span className="font-semibold text-accent-deep">💬 Reply to submitter</span>
                  {it.repliedAt && <span className="adm-dim text-[11px] ml-2">{new Date(it.repliedAt).toLocaleString()}</span>}
                  {(it.replyImageCount ?? 0) > 0 && <span className="adm-dim text-[11px] ml-2">🖼 {it.replyImageCount}</span>}
                  <div className="mt-0.5 whitespace-pre-wrap break-words">{it.reply}</div>
                </div>
              )}

              {/* Resolve…/Reject… composer */}
              {closing?.id === it.id && (
                <div className={`mt-2 flex flex-col gap-2 rounded-lg border px-2.5 py-2 ${closing.mode === 'resolved' ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`} data-ui="fb-composer">
                  <span className="text-[12px] font-semibold">{closing.mode === 'resolved' ? '✓ Resolve with a reply' : 'Reject with a thank-you note'}</span>
                  <textarea className="gw-textarea !mb-0" rows={3}
                    placeholder={closing.mode === 'resolved' ? 'What was done about it? (the submitter reads this — attach or paste result screenshots)' : 'Thanks + why this won\'t be picked up (the submitter reads this)'}
                    value={replyText} onChange={(e) => setReplyText(e.target.value)} maxLength={4000}
                    onPaste={(e) => {
                      // paste-to-attach, same as the user form: an image on the clipboard
                      // becomes a result screenshot instead of garbage text
                      const files = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile()).filter((f): f is File => Boolean(f))
                      if (files.length) { e.preventDefault(); void addReplyImages(files) }
                    }} />
                  <div className="flex items-center gap-2 flex-wrap">
                    {replyImgs.map((img, i) => (
                      <div key={i} className="relative">
                        <img src={img.url} alt={`result ${i + 1}`} onClick={() => setPreview(img.url)} className="h-12 w-12 rounded-lg border border-line object-cover cursor-zoom-in" />
                        <button type="button" title="Remove" onClick={() => setReplyImgs((prev) => prev.filter((_, x) => x !== i))}
                          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full border border-line bg-panel-strong text-[11px] leading-none">×</button>
                      </div>
                    ))}
                    {replyImgs.length < MAX_REPLY_IMAGES && (
                      <label className="gw-btn adm-btn-sm cursor-pointer">
                        📎 Attach result image
                        <input type="file" accept="image/*" multiple className="hidden"
                          onChange={(e) => { void addReplyImages([...(e.target.files || [])]); e.target.value = '' }} />
                      </label>
                    )}
                  </div>
                  {closing.mode === 'resolved' && !it.reward && (
                    <div className="flex items-center gap-2 flex-wrap" data-ui="reward-picker">
                      <span className="text-[12px] font-semibold text-amber-800">🎁 Reward:</span>
                      {([0, 1, 2, 3] as const).map((t) => (
                        <button key={t} className={tier === t ? 'gw-btn adm-btn-sm gw-btn-primary' : 'gw-btn adm-btn-sm'} onClick={() => setTier(t)}>
                          {t === 0 ? 'none' : t === 1 ? 'Tier 1 · minor' : t === 3 ? 'Tier 3 · big' : 'Tier 2'}
                        </button>
                      ))}
                      <span className="adm-dim text-[11px]">a boost lasts one month, stacks on their daily limit</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button className={closing.mode === 'resolved' ? 'gw-btn adm-btn-sm gw-btn-primary' : 'gw-btn adm-btn-sm adm-btn-danger'} disabled={busy}
                      data-ui="fb-close-submit" onClick={() => void submitClose(it)}>
                      {busy ? 'Saving…' : closing.mode === 'resolved' ? (tier ? `✓ Resolve + reward T${tier}` : '✓ Resolve') : 'Reject'}
                    </button>
                    <button className="gw-btn adm-btn-sm" disabled={busy} onClick={() => setClosing(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {(it.imageCount ?? 0) > 0 && (
                <div className="mt-2" data-ui="feedback-shots">
                  <button className="gw-btn adm-btn-sm" onClick={() => void viewImages(it.id)}>
                    🖼 {shots[it.id] ? 'Hide' : 'View'} {it.imageCount} screenshot{it.imageCount === 1 ? '' : 's'}
                  </button>
                  {shots[it.id] && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {shots[it.id].images.map((u, i) => (
                        <img key={i} src={u} alt={`screenshot ${i + 1}`} title="Click to preview"
                          onClick={() => setPreview(u)}
                          className="max-h-40 rounded-lg border border-line cursor-zoom-in" />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {it.context && <div className="adm-dim text-[12px] mt-1.5">from <code>{it.context}</code></div>}
            </div>
            )
          })}
        </div>
      )}

      {deleting && (
        <ConfirmModal
          title="Delete feedback"
          message="Permanently delete this feedback entry?"
          onConfirm={async () => { await apiDelete(`/v1/admin/feedback/${deleting.id}`); await load() }}
          onClose={() => setDeleting(null)}
        />
      )}

      <ImageLightbox src={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
