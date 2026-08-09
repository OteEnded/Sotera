import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { prepareImage, type PreparedImage } from '../../lib/image'
import { copyToClipboard } from '../../lib/clipboard'
import { openFeedbackFrom, notifyFeedbackChanged } from '../../lib/feedbackApi'
import { fmtDay, fmtTokens, getMyBudget, type TokenBudget } from '../../lib/limitsApi'
import { streams as genStreams, getGenIds, setGenIds, subscribeGenIds, notifyEntry, subscribeEntry } from '../../lib/genStreams'
import { getDraft, setDraft, NEW_DRAFT_KEY } from '../../lib/drafts'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { answerBlockJoin } from '../../lib/answerBlock'
import { useAuth } from '../../lib/auth'
import {
  DEFAULT_SETTINGS,
  type ChatMessage,
  type ChatMetrics,
  type ChatModelsResponse,
  type ChatPrefs,
  type ChatSettings,
  type ChatSkill,
  type Conversation,
  type ImageMeta,
  type OutgoingFile,
  type ReasoningEffort,
  type StreamEvent,
  type ContextUsage,
  type ToolActivity,
  type TodoSnapshot,
  type PendingInteraction,
  getPendingInteraction,
  answerConversationInteraction,
  getConversationTodo,
  clearConversationTodo,
  createConversation,
  deleteConversation,
  getScheduleTargets,
  editMessage,
  getChatModels,
  getChatPrefs,
  getConversation,
  listChatSkills,
  listConversations,
  omittedShort,
  regenerate,
  saveChatPrefs,
  sendMessage,
  // (speakMessage / the server's ?chunk=N planner is no longer used by this UI — both speak paths now plan
  //  their pieces client-side so they carry source offsets. The endpoint stays: it is a public API surface.)
  speakText,
  type SpokenPiece,
  steerConversation,
  suggestTitle,
  updateConversation,
  warmSpeech,
} from '../../lib/chatApi'
import { CHAT_MODELS_KEY, markModelsFetched, modelsNeedRefresh } from '../../lib/modelRefresh'
import { startJingle, stopJingle } from '../../lib/interactionJingle'
import { useMediaQuery, PHONE_QUERY } from '../../lib/useMediaQuery'
import { rememberConversation } from '../../lib/lastConversation'
import { clearSpoken, paintSpoken } from '../../lib/speechHighlight'
import VolumeControl from '../../components/VolumeControl'
import {
  applyPlaybackRate, gainOf, hydrateSoundPrefs, hydrateSpeechRate, isMuted as isChannelMuted, onSoundChange,
  toggleMute,
} from '../../lib/soundPrefs'
import { createSpeechStreamer, type SpeechPiece, type SpeechStreamer } from '../../lib/speechStream'
import { dismissOnBackdrop } from '../../lib/overlay'
import RefreshButton from '../../components/RefreshButton'
import OptionsModal from './OptionsModal'
import DownloadModal, { type ExportBlob, type ExportFormat } from './DownloadModal'
import ConfirmModal from '../../components/ConfirmModal'
import ClearableSelect from '../../components/ClearableSelect'
import ImageLightbox from '../../components/ImageLightbox'
import ModelCombo from '../../components/ModelCombo'

// Fenced code blocks get a hover copy button (the per-reply Copy grabs the whole
// message; this grabs just the one block).
function PreWithCopy(props: React.HTMLAttributes<HTMLPreElement>) {
  const ref = useRef<HTMLPreElement | null>(null)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (await copyToClipboard(ref.current?.innerText ?? '')) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }
  }
  return (
    <div className="chat-code-wrap">
      <button type="button" className="chat-code-copy" title="Copy code" onClick={() => void copy()}>{copied ? '✓ copied' : '⧉ copy'}</button>
      <pre ref={ref} {...props} />
    </div>
  )
}

// Links in model output open in a NEW tab — a same-tab navigation would replace the whole
// OteLLMServices app (losing the conversation). rel="noopener noreferrer" for safety.
function LinkNewTab({ href, title, children }: { href?: string; title?: string; children?: React.ReactNode }) {
  return <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>
}

// SOURCE OFFSETS ON THE RENDERED BLOCKS — the hinge the spoken-sentence highlight turns on.
// react-markdown hands every component its mdast node, which carries the exact character offsets the block
// came from. Stamping them costs two attributes and lets `speechHighlight.ts` answer "where on screen is
// character 1,240 of this reply?" without parsing anything twice. See that file for why it is needed.
// ⚠ HEADINGS ARE STAMPED TOO, because a heading IS spoken — toSpeakable turns it into a sentence so the engine
// breathes there. Ote, from a real reply: *"it did highlishgt header text for me"* — with only p/li/blockquote
// stamped, a piece spanning a heading lit the prose either side of it and skipped the heading in the middle,
// which reads as the highlight covering the wrong thing. Cover what is spoken, or the highlight lies.
type SrcNode = { position?: { start?: { offset?: number }; end?: { offset?: number } } }
const srcBlock = (Tag: 'p' | 'li' | 'blockquote' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') =>
  function SrcBlock({ node, children, ...rest }: { node?: SrcNode; children?: React.ReactNode }) {
    return (
      <Tag {...rest} data-src-start={node?.position?.start?.offset} data-src-end={node?.position?.end?.offset}>
        {children}
      </Tag>
    )
  }

// ── MATHS, AND THE ONE OPTION THAT MAKES IT SAFE HERE ─────────────────────────────────────────────────
// Ote: *"the ui currntly not render math as good, it just simple md now, you we improve on this?"* — so
// remark-math + rehype-katex, rendered locally (no CDN; the fonts ship as bundled assets).
//
// ⚠⚠ `singleDollarTextMath: false` IS LOAD-BEARING, NOT A PREFERENCE. remark-math's default treats `$…$` as
// inline maths, and THIS platform's replies are wall-to-wall dollar amounts. Measured before wiring it up:
//
//   "It costs $5 and $7 total."                          -> inlineMath "5 and "
//   "$0.15/1M input, DeepSeek V3.2 at $0.11/1M."         -> inlineMath "0.15/1M input, DeepSeek V3.2 at "
//   "Budget tier — $0.15–$0.25/M tokens"                 -> inlineMath "0.15–"
//   a pricing TABLE                                      -> two cells swallowed
//
// An entire clause disappears into a formula, on screen, in a pricing table. The speech normaliser learned the
// identical lesson (its naive `$…$` rule turned "It costs $5 and $7 total." into "It costs 7 total.") and
// guards against it by requiring a notation character; the renderer has no such guard, so the option is the
// guard. Display maths `$$…$$` is unaffected and still renders.
// ⚠ Known gap, measured: remark-math v6 does NOT recognise `\[…\]`, so that form renders as text here even
// though the SPEECH path announces it. Models write `$$…$$` far more often; revisit if that changes.
// ⚠ KaTeX LIVES IN ITS OWN CHUNK — see MathMarkdown.tsx. Bundling it in cost every reply 82 kB gzipped so the
// occasional formula could render (chat bundle 329 -> 604 kB). Loaded on demand instead, gated by the test below.
const MathMarkdown = lazy(() => import('./MathMarkdown'))

/**
 * Is there DISPLAY maths in this reply — i.e. is the KaTeX chunk worth fetching?
 *
 * ⚠ THIS MUST AGREE WITH `singleDollarTextMath: false` IN MathMarkdown.tsx, and that is the whole subtlety.
 * Only `$$…$$` and `\[…\]` render as maths, so only those may trigger the load. Testing for a single `$` would
 * fetch the chunk for every pricing answer this platform gives ("$0.15/1M") and render nothing — paying the
 * cost precisely where there is no benefit.
 * ⚠ And `\[…\]` is included deliberately even though remark-math v6 does NOT recognise it: if that support ever
 * lands, the gate must not be the reason it silently fails to appear. A false positive here costs one chunk
 * fetch; a false negative costs a formula that never typesets.
 */
const hasDisplayMath = (s: string) => /\$\$[\s\S]*?\$\$/.test(s) || /\\\[[\s\S]*?\\\]/.test(s)

/**
 * Where each TEXT segment starts inside the reply's `content`, by segment index.
 *
 * ⚠ DERIVED BY LOCATING EACH SEGMENT IN `content`, NOT BY SUMMING SEGMENT LENGTHS — and that is the whole
 * point. Summing worked only while `content` was the segments concatenated with nothing between them, which
 * is exactly the bug fixed on 2026-08-06: rounds are now joined with a blank line, so a sum is short by the
 * separator for every preceding segment and every highlight after the first lands 2, 4, 6… characters early.
 * Hardcoding the separator width here would put a second copy of that rule in a second file — the same
 * two-places-must-agree shape that produced the original bug. Searching for the text has no copy to drift:
 * it is correct for old glued messages AND new separated ones, whatever the server joined them with.
 *
 * The cursor only ever moves forward, so a segment whose text repeats earlier in the reply still resolves to
 * its own occurrence. If a segment cannot be found at all — `pushText` scrubs and trims, so the stored text is
 * not always a literal substring — it falls back to the running estimate rather than throwing the highlight
 * away, because a slightly misplaced highlight beats none.
 */
function segmentSrcOffsets(segments: Array<{ type: string; text?: string }> | undefined, content: string): number[] {
  const out: number[] = []
  let cursor = 0
  let estimate = 0
  for (const s of segments || []) {
    if (s.type !== 'text') { out.push(estimate); continue }
    const t = String(s.text || '')
    const at = t ? content.indexOf(t, cursor) : -1
    if (at >= 0) {
      out.push(at)
      cursor = at + t.length
      estimate = cursor
    } else {
      out.push(estimate)
      estimate += t.length
    }
  }
  return out
}

// Render assistant markdown (GFM: tables, code fences, lists, links).
// `srcBase` is this segment's offset inside the whole reply (a reply with tool calls renders as several text
// segments, each re-rendered from its own string, so the offsets above are local to it). `live` marks the
// reply currently being read aloud, so the highlighter never lights up an older message — and `spoken` does
// the same job for a STORED reply the 🔊 button is reading, which has no live bubble to mark.
function Markdown({ text, srcBase = 0, live = false, spoken = false }: { text: string; srcBase?: number; live?: boolean; spoken?: boolean }) {
  // ⚠ ONE `components` MAP FOR BOTH PATHS. The maths path is a separate lazy chunk, and if it carried its own
  // copy of this map the two would drift on link handling, copy buttons, heading anchors — and, worst, on the
  // `data-src-start` blocks the speech HIGHLIGHT matches against. A reply with a formula would then highlight
  // differently from one without.
  const components = {
    pre: PreWithCopy, a: LinkNewTab,
    p: srcBlock('p'), li: srcBlock('li'), blockquote: srcBlock('blockquote'),
    h1: srcBlock('h1'), h2: srcBlock('h2'), h3: srcBlock('h3'),
    h4: srcBlock('h4'), h5: srcBlock('h5'), h6: srcBlock('h6'),
  }
  return (
    <div className="chat-md" data-src-base={srcBase} {...(live ? { 'data-live-answer': '1' } : {})} {...(spoken ? { 'data-speaking-answer': '1' } : {})}>
      {hasDisplayMath(text)
        // Suspense fallback = the SAME markdown without the maths plugins, not a spinner. The reply is already
        // readable; showing a placeholder would blank text the user is mid-sentence through, and the chunk
        // arrives in a frame or two on a LAN. The formula appears as source for that instant, then typesets.
        ? (
          <Suspense fallback={<ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown>}>
            <MathMarkdown text={text} components={components} />
          </Suspense>
        )
        : <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown>}
    </div>
  )
}

// ---- long-reply handling (Ote: a marathon round produced a 50k-char wall in one bubble) ----
// Over this size a reply renders COLLAPSED (a screenful + a fade + "show full"), with a
// per-message table of contents when it has enough headings, so a big output is scannable
// instead of an endless scroll.
const LONG_REPLY_CHARS = 4500

// Live "the model is working" phrases for the pending indicator. They escalate with how long the
// CURRENT stall has run — a cold model load can be many seconds before the first token — and rotate
// within a tier so the wait feels alive rather than frozen. Ote's brief: lively + a little self-aware.
const WAIT_TIERS: { after: number; lines: string[] }[] = [
  { after: 0, lines: ['Waiting for the model…', 'Poking the model…', 'Here we go…'] },
  { after: 5, lines: ['Waking the model up…', 'Waking up — give me a minute…', 'Loading weights into VRAM…', 'Warming up the GPU…', 'Stretching a few neurons…'] },
  { after: 14, lines: ['Still warming up — give it a minute…', 'Big model, big yawn… almost there.', 'Spinning up the cores…', "It's a chunky one, hang tight…"] },
  { after: 30, lines: ["Someone tell Ote there's something wrong with my AI…", 'This is taking a while… blame the big model.', 'Still here — the GPU is doing its best.', 'Any second now… probably.'] },
]
// Pick a phrase for the current stall: the highest tier whose threshold is reached. RANDOM within the
// tier (not a fixed sequence), but re-rolled only when the ~4s slot (or tier) changes — so it feels
// lively/unpredictable yet holds steady for a few seconds instead of flickering on every 1s re-render.
// Avoids an immediate repeat of the current line. Module-level pick cache (one chat view; harmless if shared).
let _waitPick = { key: '', line: '' }
function waitPhrase(stallSec: number): string {
  let tierIdx = 0
  for (let i = 0; i < WAIT_TIERS.length; i++) if (stallSec >= WAIT_TIERS[i].after) tierIdx = i
  const tier = WAIT_TIERS[tierIdx]
  const key = `${tierIdx}:${Math.floor(stallSec / 4)}`
  if (_waitPick.key !== key) {
    let line = tier.lines[Math.floor(Math.random() * tier.lines.length)]
    for (let guard = 0; line === _waitPick.line && tier.lines.length > 1 && guard < 6; guard++) {
      line = tier.lines[Math.floor(Math.random() * tier.lines.length)]
    }
    _waitPick = { key, line }
  }
  return _waitPick.line
}
const slugify = (s: string) => (s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'section')

/** Markdown headings (# / ## / ###) in document order, fence-aware (never picks up `#` lines
 *  inside code blocks), with de-duplicated slugs so a per-message id is stable + unique. */
function headingsOf(text: string): { level: number; title: string; slug: string }[] {
  const out: { level: number; title: string; slug: string }[] = []
  const seen = new Map<string, number>()
  let inFence = false
  for (const raw of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) { inFence = !inFence; continue }
    if (inFence) continue
    const m = /^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/.exec(raw)
    if (!m) continue
    const title = m[2].replace(/[*_`]/g, '').trim()
    if (!title) continue
    let slug = slugify(title)
    const n = (seen.get(slug) ?? 0) + 1; seen.set(slug, n)
    if (n > 1) slug = `${slug}-${n}`
    out.push({ level: m[1].length, title, slug })
  }
  return out
}

function LongReply({ text, markdown, idx, expanded, onToggle, srcBase = 0, live = false, spoken = false }: {
  text: string; markdown: boolean; idx: number; expanded: boolean; onToggle: () => void
  srcBase?: number; live?: boolean; spoken?: boolean
}) {
  const heads = useMemo(() => headingsOf(text), [text])
  // TOC shows top structure only (# / ##) — pulling in every ### sub-heading just rebuilds a
  // wall for a long, deeply-nested doc. All heads still get anchor ids for future use.
  const tocHeads = useMemo(() => heads.filter((h) => h.level <= 2), [heads])
  const idFor = (slug: string) => `mdh-${idx}-${slug}`
  // Anchored headings (markdown mode): the k-th rendered heading gets the k-th parsed slug's
  // id — same document order + fence-aware parse, so TOC links line up. Counter resets each render.
  const counter = { k: 0 }
  // The anchor id AND the source offsets: a long reply's headings need both, or the spoken-sentence highlight
  // skips over every heading in exactly the replies that have the most of them.
  const anchor = (Tag: 'h1' | 'h2' | 'h3') => (p: { children?: ReactNode; node?: SrcNode }) => {
    const h = heads[counter.k++]
    return (
      <Tag id={h ? idFor(h.slug) : undefined}
        data-src-start={p.node?.position?.start?.offset} data-src-end={p.node?.position?.end?.offset}>
        {p.children}
      </Tag>
    )
  }
  // The source offsets travel here too: a long reply switches to THIS renderer the moment it finishes, and
  // with speech trailing ~13x behind the text, the voice is still reading when that swap happens. Without
  // them the highlight would die mid-sentence for exactly the longest replies.
  // Same lazy-maths split as Markdown(): the KaTeX chunk is fetched only for a reply that actually has display
  // maths in it. This renderer keeps its own `anchor()` heads for the table of contents, which is the one
  // legitimate difference between the two component maps.
  const longComponents = {
    pre: PreWithCopy, a: LinkNewTab,
    h1: anchor('h1'), h2: anchor('h2'), h3: anchor('h3'),
    h4: srcBlock('h4'), h5: srcBlock('h5'), h6: srcBlock('h6'),
    p: srcBlock('p'), li: srcBlock('li'), blockquote: srcBlock('blockquote'),
  }
  const body = markdown
    ? (
      <div className="chat-md" data-src-base={srcBase} {...(live ? { 'data-live-answer': '1' } : {})} {...(spoken ? { 'data-speaking-answer': '1' } : {})}>
        {hasDisplayMath(text)
          ? (
            <Suspense fallback={<ReactMarkdown remarkPlugins={[remarkGfm]} components={longComponents}>{text}</ReactMarkdown>}>
              <MathMarkdown text={text} components={longComponents} />
            </Suspense>
          )
          : <ReactMarkdown remarkPlugins={[remarkGfm]} components={longComponents}>{text}</ReactMarkdown>}
      </div>
    )
    : text
  const mins = Math.max(1, Math.round(text.length / 5 / 200)) // ~5 chars/word, ~200 wpm
  const jump = (slug: string) => document.getElementById(idFor(slug))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  // ↑ Top: after reading a long expanded reply you're at the bottom; jump back to its head. The
  // container carries scroll-mt so it clears the sticky todo rail / jump-header overlays (Ote's ask).
  const topRef = useRef<HTMLDivElement | null>(null)
  const toTop = () => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  if (!expanded) {
    return (
      <div className="chat-longreply">
        <div className="relative max-h-[22rem] overflow-hidden">
          {body}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[var(--panel-strong)]" />
        </div>
        <button className={`${TOOLBAR_BTN} mt-2`} onClick={onToggle} title="Expand the full reply">
          ▾ Show full reply · {Math.round(text.length / 1000)}k chars · ~{mins} min read
        </button>
      </div>
    )
  }
  return (
    <div ref={topRef} className="chat-longreply scroll-mt-24">
      {markdown && tocHeads.length >= 3 && (
        <nav className="chat-toc mb-2.5 max-h-72 overflow-auto rounded-[10px] border border-line bg-panel px-3 py-2 text-[13px]" aria-label="Contents">
          <div className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted">Contents</div>
          <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
            {tocHeads.map((h, k) => (
              <li key={k} style={{ paddingLeft: `${(h.level - 1) * 12}px` }}>
                <button className="chat-toc-link bg-transparent p-0 text-left text-accent-deep hover:underline" onClick={() => jump(h.slug)}>{h.title}</button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {body}
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={TOOLBAR_BTN} onClick={toTop} title="Jump to the top of this reply">↑ Top</button>
        <button className={TOOLBAR_BTN} onClick={onToggle} title="Collapse this reply">▴ Collapse</button>
      </div>
    </div>
  )
}

// Update the last assistant message in the list (the in-flight one).
function patchLastAssistant(list: ChatMessage[], fn: (m: ChatMessage) => ChatMessage): ChatMessage[] {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].role === 'assistant') {
      const next = list.slice()
      next[i] = fn(list[i])
      return next
    }
  }
  return list
}

function shortModel(id: string | null | undefined): string {
  if (!id) return '—'
  const slash = id.indexOf('/')
  return slash === -1 ? id : id.slice(slash + 1)
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—'
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

// "Which one?" for skill-family tool calls — the call name alone hides the interesting
// part (use_skill → WHICH skill; read_skill_file → which file). Args may arrive as a
// raw JSON string on some providers, so parse defensively.
function toolCallDetail(name: string, args: unknown): string | null {
  let a = args
  if (typeof a === 'string') { try { a = JSON.parse(a) } catch { return null } }
  if (!a || typeof a !== 'object') return null
  const rec = a as Record<string, unknown>
  if (name === 'use_skill' && typeof rec.skill === 'string' && rec.skill) return rec.skill
  if (name === 'read_skill_file' && typeof rec.path === 'string' && rec.path) return rec.path
  return null
}

// Tally the reply's tool trace for the stats line: "🔧 6 tool calls (3 tools)", with the
// per-tool breakdown in the tooltip. Computed from the persisted trace at render time,
// so old replies get it too. The distinct count only appears when it differs — "3 tool
// calls (3 tools)" would say nothing.
function toolTally(tools: ToolActivity[] | undefined): { text: string; title: string } | null {
  if (!tools || tools.length === 0) return null
  const byName = new Map<string, number>()
  for (const t of tools) byName.set(t.name, (byName.get(t.name) || 0) + 1)
  const n = tools.length
  const d = byName.size
  const text = `🔧 ${n} tool call${n === 1 ? '' : 's'}${d < n ? ` (${d} tool${d === 1 ? '' : 's'})` : ''}`
  const title = [...byName.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
    .join('\n')
  return { text, title }
}

// Tooltip for an attached image: "photo.png — PNG 3.2MB, stored as WEBP".
// Old messages (pre-conversion era) have no meta -> plain preview hint.
function imgTitle(url: string, meta?: ImageMeta): string {
  if (!meta || (!meta.name && !meta.orig)) return 'Click to preview'
  const stored = /^data:image\/([a-z]+)/i.exec(url)?.[1]?.toUpperCase()
  const size = meta.bytes == null ? ''
    : meta.bytes >= 1048576 ? ` ${(meta.bytes / 1048576).toFixed(1)}MB`
    : ` ${Math.max(1, Math.round(meta.bytes / 1024))}KB`
  const converted = stored && stored !== (meta.orig || '').toUpperCase() ? `, stored as ${stored}` : ''
  return `${meta.name || 'image'} — ${(meta.orig || '?').toUpperCase()}${size}${converted}`
}

// The Todo rail — the state-driven Feature's chat-site renderer (renderer #1). It renders
// the protocol snapshot as a live checklist and owns ZERO Todo logic: the model plans via
// write_todos, the host persists + pushes, this just draws ✓ / ▶ / □. Sticky at the top of
// the thread so the plan stays visible while scrolling (Ote: persistent while the session
// exists). Collapsible; hidden when there's no active plan.
const TODO_MARK: Record<string, string> = { completed: '✓', running: '▶', skipped: '⊘', failed: '✕', cancelled: '·', pending: '' }
// WHAT THE EYE SAW (Ote's ask, 2026-08-03). When the chat's model cannot see, a vision model reads
// the image and only its DESCRIPTION reaches the answer — so the description, not the picture, is
// what the reply is actually built from. Until now that text was invisible: it lived on the message
// row and nowhere on screen, which is precisely how a blind describer (gemma4:e4b) went unnoticed
// for a day while it confabulated. This block makes the substitution inspectable.
//
// Collapsed by default: it is provenance, not content — there when you doubt the answer, out of the
// way when you don't. Named with the model, because "a vision model said" is the claim, and after
// this week the WHICH is the interesting part.
function VisionDescriptions({ items, count }: { items: { text: string; model: string | null; at: string | null }[]; count: number }) {
  const [open, setOpen] = useState(false)
  const real = items.filter((d) => d && d.text)
  if (!real.length) return null
  const models = [...new Set(real.map((d) => d.model).filter(Boolean) as string[])]
  const label = real.length > 1 ? `${real.length} images read` : 'Image read'
  return (
    <div className="chat-vision-desc flex w-full flex-col rounded-[10px] border border-line bg-panel-strong" data-ui="vision-descriptions">
      <button
        type="button"
        className="flex min-w-0 cursor-pointer items-center gap-2 border-0 bg-transparent px-2.5 py-1.5 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Your model cannot see images — this is the description it was given instead"
      >
        <span className="text-[12px]" aria-hidden>👀</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
          {label} by <b className="text-ink">{models.length ? models.map(shortModel).join(', ') : 'a vision model'}</b>
          {count > real.length ? ` · ${count - real.length} not described` : ''}
        </span>
        <span className="text-[10px] text-muted" aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-line px-2.5 py-2">
          {items.map((d, i) => (d && d.text ? (
            <div key={i} className="flex flex-col gap-0.5">
              {items.length > 1 && <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Image {i + 1}</span>}
              <p className="m-0 whitespace-pre-wrap break-words text-[12px] leading-[1.5] text-ink">{d.text}</p>
            </div>
          ) : null))}
          <p className="m-0 text-[10px] leading-[1.4] text-muted">
            This text — not the picture — is what the answering model received.
          </p>
        </div>
      )}
    </div>
  )
}

function TodoRail({ todo, onClear }: { todo: TodoSnapshot; onClear?: () => void }) {
  const [open, setOpen] = useState(true)
  if (!todo || todo.tasks.length === 0 || todo.status === 'cancelled') return null
  const allDone = todo.completed >= todo.total
  return (
    <div className="chat-todo sticky top-0 z-10 mx-auto flex w-full max-w-[860px] flex-col rounded-[12px] border border-line bg-panel-strong shadow-[0_2px_10px_var(--shadow)]">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span className="text-[13px]" aria-hidden>{allDone ? '✓' : '📋'}</span>
          <strong className="min-w-0 flex-1 truncate text-[13px] text-ink">{todo.title || 'Working plan'}</strong>
          <span className="chat-todo-count font-mono text-[11px] font-bold text-muted tabular-nums">{todo.completed}/{todo.total}</span>
          <span className="text-[10px] text-muted" aria-hidden>{open ? '▾' : '▸'}</span>
        </button>
        {onClear && (
          <button
            type="button"
            className="chat-todo-clear flex-none cursor-pointer rounded-md border-0 bg-transparent px-1 py-0.5 text-[13px] leading-none text-muted transition-colors hover:text-danger"
            onClick={onClear}
            title="Clear this plan"
            aria-label="Clear this plan"
            data-ui="todo-clear"
          >✕</button>
        )}
      </div>
      {open && (
        <ul className="flex flex-col gap-0.5 border-t border-line px-3.5 py-2.5">
          {todo.tasks.map((t) => (
            <li key={t.id} className={`chat-todo-task chat-todo-${t.status} flex items-start gap-2 text-[13px] leading-[1.5] ${t.status === 'completed' || t.status === 'skipped' ? 'text-muted line-through' : t.status === 'running' ? 'font-semibold text-ink' : 'text-ink'}`}>
              <span className={`chat-todo-mark mt-px w-3.5 flex-none text-center text-[12px] ${t.status === 'completed' ? 'text-[var(--ok)]' : t.status === 'running' ? 'text-accent' : t.status === 'failed' ? 'text-danger' : 'text-muted'}`} aria-hidden>
                {TODO_MARK[t.status] || '□'}
              </span>
              <span className="min-w-0 flex-1">{t.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// The HumanInteraction Feature's inline renderer (the frontend adapter for the
// Interaction Protocol): the model asked a structured question and THIS TURN IS HELD
// until the user answers/skips (one assistant turn — the card is part of the turn, not a
// reply to it). The frontend owns NO interaction logic: it renders the pending snapshot,
// posts the answer, and lets the protocol events drive state.
function InteractionCard({ ask, onAnswer, onSkip }: {
  ask: NonNullable<PendingInteraction>
  onAnswer: (answers: { selected?: string[]; custom?: string }[]) => void
  onSkip: () => void
}) {
  const [sel, setSel] = useState<Record<number, string[]>>({})
  const [custom, setCustom] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  // Live countdown to the question's expiry (chat.interactionTimeoutSeconds, root-tunable).
  // The server timer is authoritative — this just tells the user how long they have; at 0
  // the interaction-completed push removes the card.
  const [secsLeft, setSecsLeft] = useState<number | null>(() =>
    ask.expiresAt ? Math.max(0, Math.round((new Date(ask.expiresAt).getTime() - Date.now()) / 1000)) : null)
  useEffect(() => {
    if (!ask.expiresAt) return
    const t = setInterval(() => {
      setSecsLeft(Math.max(0, Math.round((new Date(ask.expiresAt as string).getTime() - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(t)
  }, [ask.expiresAt])
  const clock = secsLeft != null ? `${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, '0')}` : null
  const pick = (qi: number, label: string, multi: boolean) => {
    setSel((prev) => {
      const cur = prev[qi] || []
      if (multi) return { ...prev, [qi]: cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label] }
      return { ...prev, [qi]: cur.includes(label) ? [] : [label] }
    })
  }
  const answered = (i: number) => (sel[i]?.length || custom[i]?.trim()) ? true : false
  const canSubmit = ask.questions.some((_q, i) => answered(i))
  const submit = () => {
    if (!canSubmit || busy) return
    setBusy(true)
    onAnswer(ask.questions.map((_q, i) => ({
      ...(sel[i]?.length ? { selected: sel[i] } : {}),
      ...(custom[i]?.trim() ? { custom: custom[i].trim() } : {}),
    })))
  }
  return (
    <div className="chat-msg chat-msg-assistant mx-auto flex w-full max-w-[860px] flex-col gap-2" data-ui="ask-card">
      <div className="flex flex-col gap-3 rounded-[12px] border border-[var(--think-edge)] bg-panel-strong p-3.5 shadow-[0_2px_10px_var(--shadow)]">
        <div className="flex items-center gap-2">
          <span className="text-[14px]" aria-hidden>❓</span>
          <strong className="min-w-0 flex-1 text-[13px] text-ink">The assistant needs your input — this reply is paused until you answer</strong>
          {clock && (
            <span
              className={`flex-none font-mono text-[12px] font-bold tabular-nums ${secsLeft != null && secsLeft <= 30 ? 'text-danger' : 'text-muted'}`}
              title="Time left before the assistant continues without an answer (root-tunable in Console → System)"
              data-ui="ask-countdown"
            >⏳ {clock}</span>
          )}
          {/* The slider lives right here, next to the thing making the noise (Ote: "add volumn
              slider for each where it emit sound"). Muting is a click; the level is one more. */}
          <VolumeControl channel="askUser" label="Waiting music" preview={false} />
        </div>
        {ask.questions.map((q, qi) => (
          <div key={qi} className="flex flex-col gap-1.5" data-ui="ask-question">
            <div className="flex items-baseline gap-2">
              <span className="rounded-full border border-line px-2 py-px text-[10px] font-bold uppercase tracking-[0.05em] text-muted">{q.header}</span>
              <span className="text-[13px] font-semibold text-ink">{q.question}</span>
            </div>
            {q.options.length > 0 && (
              <div className="flex flex-col gap-1" role={q.multiSelect ? 'group' : 'radiogroup'}>
                {q.options.map((o) => {
                  const on = (sel[qi] || []).includes(o.label)
                  return (
                    <button
                      key={o.label}
                      type="button"
                      role={q.multiSelect ? 'checkbox' : 'radio'}
                      aria-checked={on}
                      className={`flex cursor-pointer items-start gap-2 rounded-[10px] border px-2.5 py-1.5 text-left transition-colors ${on ? 'border-accent' : 'border-line hover:border-[var(--think-edge)]'}`}
                      onClick={() => pick(qi, o.label, q.multiSelect)}
                      data-ui="ask-option"
                    >
                      <span className={`mt-px w-4 flex-none text-center text-[13px] ${on ? 'text-accent' : 'text-muted'}`} aria-hidden>
                        {q.multiSelect ? (on ? '☑' : '☐') : (on ? '◉' : '○')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[13px] ${on ? 'font-semibold text-ink' : 'text-ink'}`}>{o.label}</span>
                        {o.description && <span className="block text-[12px] leading-[1.4] text-muted">{o.description}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {(q.allowCustom || q.options.length === 0) && (
              <input
                className="gw-input rounded-[10px] border border-line bg-transparent px-2.5 py-1.5 text-[13px] text-ink"
                placeholder={q.options.length ? 'Other — type your own answer…' : 'Type your answer…'}
                value={custom[qi] ?? ''}
                onChange={(e) => setCustom((prev) => ({ ...prev, [qi]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) submit() }}
                maxLength={2000}
                data-ui="ask-custom"
              />
            )}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <button type="button" className="gw-btn gw-btn-primary adm-btn-sm" onClick={submit} disabled={!canSubmit || busy} data-ui="ask-submit">Answer</button>
          <button type="button" className="gw-btn adm-btn-sm" onClick={() => { if (!busy) { setBusy(true); onSkip() } }} disabled={busy} data-ui="ask-skip">Skip</button>
          <span className="text-[11px] text-muted">…or just type your answer in the message box below</span>
        </div>
      </div>
    </div>
  )
}

// Compact metrics line shown under a completed assistant message. Leads with the model
// that generated THIS reply — users switch models mid-conversation, so the header's
// picker says what's next, not what produced a given message.
function MetricsRow({ m, model, tools, messageId, showId }: { m: ChatMetrics; model?: string | null; tools?: ToolActivity[]; messageId?: string; showId?: boolean }) {
  const parts: string[] = []
  // lead with WHEN the reply landed (local time) — lets a user check timing, e.g. that a
  // scheduled run fired when expected; older replies (no generatedAt stored) just omit it
  if (m.generatedAt != null) parts.push(`🕐 ${new Date(m.generatedAt).toLocaleString()}`)
  if (model) parts.push(model)
  if (m.tokensPerSec != null) parts.push(`${m.tokensPerSec} tok/s`)
  if (m.completionTokens != null) parts.push(`${m.completionTokens} out`)
  if (m.promptTokens != null) parts.push(`${m.promptTokens} in`)
  // prefill = prompt evaluation time (local models); a big prompt at ~0s means the
  // runner reused its KV prefix cache instead of re-reading the whole history
  if (m.promptEvalMs != null) {
    const reused = (m.promptTokens ?? 0) > 2000 && m.promptEvalMs < 500
    parts.push(`prefill ${fmtMs(m.promptEvalMs)}${reused ? ' ⚡' : ''}`)
  }
  if (m.cachedTokens != null && m.cachedTokens > 0) parts.push(`${m.cachedTokens} cached`)
  if (m.ttftMs != null) parts.push(`${fmtMs(m.ttftMs)} to first`)
  if (m.latencyMs != null) parts.push(`${fmtMs(m.latencyMs)} total`)
  const tally = toolTally(tools)
  if (parts.length === 0 && !tally && !m.contextOverflow && !m.outputCapped && !(showId && messageId)) return null
  const anyBefore = parts.length || tally || m.contextOverflow || m.outputCapped
  return (
    <div className={METRICS_LINE}>
      {parts.join('  ·  ')}
      {tally && (
        <span title={tally.title}>{parts.length ? '  ·  ' : ''}{tally.text}</span>
      )}
      {m.contextOverflow && (
        <span className="text-[var(--warn)]" title="The prompt was bigger than the model's context window — the provider truncated the oldest content before answering.">
          {parts.length || tally ? '  ·  ' : ''}⚠ context overflow (~{Math.round(m.contextOverflow.estimate / 1000)}k &gt; {Math.round(m.contextOverflow.window / 1000)}k window)
        </span>
      )}
      {m.outputCapped && (
        <span className="text-[var(--warn)]" title="The model hit its output-token limit and spent the whole budget thinking, so the answer came back empty. Raise max tokens in ⚙, or lower the thinking effort.">
          {parts.length || tally || m.contextOverflow ? '  ·  ' : ''}⚠ output limit reached{m.outputCapped.completionTokens ? ` (~${m.outputCapped.completionTokens} tok)` : ''}
        </span>
      )}
      {showId && messageId && (
        // Debug affordance — visible only to root / admins / developers (see isDebugUser). Plain,
        // selectable text (NOT click-to-copy — a stray click shouldn't hijack the clipboard).
        <span className="select-text opacity-60" title="Message ID (debug)">{anyBefore ? '  ·  ' : ''}id {messageId}</span>
      )}
    </div>
  )
}

// True when any gear-panel setting differs from the defaults — drives the little
// "customized" dot on the ⚙ button. Per-message view prefs (markdown/showStats)
// are deliberately ignored; they live on the reply toolbars.
// rename-form icon buttons (✦ / ✓ / ✕) — shared utility set
const RENAME_BTN = 'flex h-[26px] w-[26px] flex-none cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[13px] leading-none text-muted transition hover:bg-[var(--wash)] hover:text-accent disabled:cursor-default disabled:opacity-50'
// per-conversation ⋯ dropdown rows
const MENU_ITEM = 'flex cursor-pointer items-center gap-[9px] rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[13px] font-semibold text-ink transition-colors hover:bg-[var(--wash)]'
// header rename-form icon buttons (✦ / ✓ / ✕) — roomier than the sidebar's (color added per button)
const HDR_RENAME_BTN = 'flex h-[30px] w-[30px] flex-none cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-sm leading-none transition-colors hover:bg-[var(--wash)] hover:text-accent disabled:cursor-default disabled:opacity-50'
// reply/edit toolbar pill buttons (Copy / Plain / Stats / Regenerate / Edit / Save)
const TOOLBAR_BTN = 'cursor-pointer rounded-full border border-line bg-[var(--panel)] px-2.5 py-[3px] text-[11px] font-bold text-muted transition-colors hover:border-accent hover:text-ink'
const MSG_TOOLBAR = 'mt-1 flex flex-wrap gap-1.5'
// message text block + the role-specific bubble around it (user mint / assistant panel)
const MSG_BODY = 'max-w-full whitespace-pre-wrap break-words text-[15px] leading-[1.6] text-ink'
const MSG_BODY_USER = 'max-w-[80%] rounded-[16px_16px_4px_16px] border border-[var(--mint-edge)] bg-mint px-3.5 py-3'
const MSG_BODY_ASSISTANT = 'w-full rounded-[4px_16px_16px_16px] border border-line bg-panel-strong px-3.5 py-3'
const METRICS_LINE = 'chat-metrics font-mono text-[11px] tracking-[0.01em] text-muted'
// attached-document pill (composer strip + inside message bubbles) and its ×
const FILE_CHIP = 'chat-file-chip inline-flex items-center gap-1.5 rounded-full border border-line bg-[var(--code-bg)] px-3 py-1.5 text-[12px] text-ink'
const FILE_CHIP_X = 'cursor-pointer border-0 bg-transparent p-0 pl-0.5 text-[13px] leading-none text-muted hover:text-ink'
// ⚙ settings-popover building blocks
const SET_TOGGLE = 'chat-set-toggle inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-bold text-ink'
const SET_FIELD = 'chat-set-field flex flex-col items-stretch gap-[3px]'
const SET_HINT = 'chat-set-hint not-italic font-medium text-muted opacity-[.85]'
const SET_INSTRUCTIONS = 'chat-set-instructions flex w-full flex-col gap-1'

function settingsDiffer(s: ChatSettings, d: ChatSettings = DEFAULT_SETTINGS): boolean {
  return s.reasoning.enabled !== d.reasoning.enabled
    || (s.reasoning.effort ?? null) !== (d.reasoning.effort ?? null)
    || s.stream !== d.stream
    || s.useMemory !== d.useMemory
    || s.toolsEnabled !== d.toolsEnabled
    || (s.customInstructions ?? '').trim() !== (d.customInstructions ?? '').trim()
    || (s.marathon === true) !== (d.marathon === true)
    || (s.visionRelayModel ?? null) !== (d.visionRelayModel ?? null)
    || (s.skill ?? null) !== (d.skill ?? null)
    || (s.temperature ?? null) !== (d.temperature ?? null)
    || (s.top_p ?? null) !== (d.top_p ?? null)
    || (s.max_tokens ?? null) !== (d.max_tokens ?? null)
    || (s.numCtx ?? null) !== (d.numCtx ?? null)
    || (s.seed ?? null) !== (d.seed ?? null)
}

// Generation settings (shown to select_model users) — a popover anchored to the ⚙ gear,
// so it overlays the thread instead of pushing it down. Per-message Markdown/Stats
// toggles live on each assistant reply (see the message toolbar), not here.
function SettingsPanel({ settings, onChange, onClose, disabled, visionModels, visionRelayDefault, onModelsOpen, unsupported, skills, defaults = DEFAULT_SETTINGS, marathonAllowed = true, ctxCap = null }: {
  settings: ChatSettings
  onChange: (s: ChatSettings) => void
  onClose: () => void
  disabled?: boolean
  marathonAllowed?: boolean // root lever chat.marathonEnabled — the toggle hides when off
  visionModels?: string[] // vision-capable model ids, for the relay picker
  visionRelayDefault?: string | null // what "(platform default)" resolves to — named so it isn't a guess
  onModelsOpen?: () => void // host's throttled model-list refresh, fired when the relay picker opens
  unsupported?: string[] // caps the SELECTED model verifiably lacks — those toggles show off+locked (the stored preference is untouched, so it comes back on a capable model)
  skills?: ChatSkill[] // installed Skills (persona + imported Agent Skills) for the binding picker
  defaults?: ChatSettings // the PLATFORM defaults (root's chat.defaultOptions) — Reset target + "customized" comparison
  ctxCap?: number | null // root's resolved context cap for the SELECTED model — the ceiling for the per-chat window
}) {
  const setReasoning = (patch: Partial<ChatSettings['reasoning']>) =>
    onChange({ ...settings, reasoning: { ...settings.reasoning, ...patch } })
  const setNum = (key: 'temperature' | 'top_p' | 'max_tokens' | 'seed' | 'numCtx', raw: string) => {
    const v = raw.trim() === '' ? null : Number(raw)
    onChange({ ...settings, [key]: (v == null || Number.isNaN(v)) ? null : v })
  }
  const numVal = (v: number | null) => (v == null ? '' : String(v))
  // capability gate (display-off, not destructive): the checkbox SHOWS unchecked +
  // locked, but settings.* is never overwritten — switch back to a capable model and
  // the preference is still there. The backend strips these at send regardless.
  const noThink = Boolean(unsupported?.includes('thinking'))
  const noTools = Boolean(unsupported?.includes('tools'))

  return (
    <div className="chat-settings-pop absolute right-0 top-[calc(100%+8px)] z-[45] flex w-[min(430px,calc(100vw-24px))] cursor-default flex-col gap-3 rounded-[14px] border border-line bg-panel-strong px-4 pb-4 pt-3.5 text-left shadow-[0_18px_44px_rgba(70,34,12,0.2)]" role="dialog" aria-label="Model settings">
      <div className="chat-set-head flex items-center justify-between gap-2">
        <b className="text-[14px] font-extrabold text-ink">Model settings</b>
        <span className="chat-set-head-actions inline-flex items-center gap-1.5">
          <button className="gw-btn adm-btn-sm" disabled={disabled || !settingsDiffer(settings, defaults)}
            onClick={() => onChange(defaults)}>Reset</button>
          <button className="chat-set-close flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-[13px] leading-none text-muted transition-colors hover:bg-[var(--wash)] hover:text-accent" onClick={onClose} title="Close" aria-label="Close settings">✕</button>
        </span>
      </div>

      <div className="chat-set-group flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className={SET_TOGGLE} title={noThink ? 'This model was verified as unable to reason — Thinking is off for it (your preference is kept for other models)' : undefined}>
          <input className="m-0 w-auto" type="checkbox" checked={settings.reasoning.enabled && !noThink} disabled={disabled || noThink}
            onChange={(e) => setReasoning({ enabled: e.target.checked })} />
          Thinking{noThink && <em className={SET_HINT}> — not supported by this model</em>}
        </label>
        <ClearableSelect className="gw-input chat-set-effort w-auto !min-w-[120px] !px-2 !py-1.5 !text-[13px]"
          value={settings.reasoning.effort ?? ''}
          disabled={disabled || noThink || !settings.reasoning.enabled}
          onChange={(v) => setReasoning({ effort: (v || null) as ReasoningEffort })}
          clearTitle="Back to auto">
          <option value="">effort: auto</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </ClearableSelect>
      </div>
      <div className="chat-set-group flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className={SET_TOGGLE}>
          <input className="m-0 w-auto" type="checkbox" checked={settings.stream} disabled={disabled}
            onChange={(e) => onChange({ ...settings, stream: e.target.checked })} />
          Stream
        </label>
        <label className={SET_TOGGLE}>
          <input className="m-0 w-auto" type="checkbox" checked={settings.useMemory} disabled={disabled}
            onChange={(e) => onChange({ ...settings, useMemory: e.target.checked })} />
          Use memory
        </label>
        <label className={SET_TOGGLE} title={noTools ? 'This model was verified as unable to call tools — Tools are off for it (your preference is kept for other models)' : undefined}>
          <input className="m-0 w-auto" type="checkbox" checked={settings.toolsEnabled && !noTools} disabled={disabled || noTools}
            onChange={(e) => onChange({ ...settings, toolsEnabled: e.target.checked })} />
          Tools{noTools && <em className={SET_HINT}> — not supported by this model</em>}
        </label>
        {marathonAllowed && (
          <label className={SET_TOGGLE} title="After a reply that leaves the working plan unfinished, the assistant automatically continues — round after round — until the plan completes, stops progressing, or the cap is hit. Untick to stop a running marathon. Needs Tools (the plan lives in write_todos).">
            <input className="m-0 w-auto" type="checkbox" checked={settings.marathon === true && settings.toolsEnabled && !noTools} disabled={disabled || noTools || !settings.toolsEnabled} data-ui="marathon-toggle"
              onChange={(e) => onChange({ ...settings, marathon: e.target.checked })} />
            Marathon <em className={SET_HINT}>▶ auto-continue the plan</em>
          </label>
        )}
      </div>

      <div className="chat-set-section flex flex-col gap-1.5">
        <span className="chat-set-label text-[11px] font-extrabold uppercase tracking-[0.06em] text-accent-deep">Sampling</span>
        <div className="chat-set-grid grid grid-cols-2 gap-x-3.5 gap-y-2">
          <label className={SET_FIELD}>
            <span className="text-[12px] font-bold text-muted">Temp</span>
            <input className="w-full px-2 py-1.5 text-[13px]" type="number" step="0.1" min="0" max="2" placeholder="auto"
              value={numVal(settings.temperature)} disabled={disabled}
              onChange={(e) => setNum('temperature', e.target.value)} />
          </label>
          <label className={SET_FIELD}>
            <span className="text-[12px] font-bold text-muted">Top P</span>
            <input className="w-full px-2 py-1.5 text-[13px]" type="number" step="0.05" min="0" max="1" placeholder="auto"
              value={numVal(settings.top_p)} disabled={disabled}
              onChange={(e) => setNum('top_p', e.target.value)} />
          </label>
          <label className={SET_FIELD}>
            <span className="text-[12px] font-bold text-muted">Max tokens</span>
            <input className="w-full px-2 py-1.5 text-[13px]" type="number" step="1" min="1" placeholder="auto"
              value={numVal(settings.max_tokens)} disabled={disabled}
              onChange={(e) => setNum('max_tokens', e.target.value)} />
          </label>
          <label className={SET_FIELD}>
            <span className="text-[12px] font-bold text-muted">Seed</span>
            <input className="w-full px-2 py-1.5 text-[13px]" type="number" step="1" placeholder="random"
              value={numVal(settings.seed)} disabled={disabled}
              onChange={(e) => setNum('seed', e.target.value)} />
          </label>
        </div>
        {/* Per-chat context window. The ceiling is root's resolved cap for the selected model
            (`ctxCap` = the same number the header badge shows), and the server independently clamps to
            it — this control is a convenience, never the enforcement.
            A SLIDER when the cap is known (Ote asked for one on the chat side; root keeps a numeric
            input on the Models page, where an exact figure is the point). Falls back to the number
            input when there is no cap to bound a track with — a remote provider, or the model list not
            back yet. */}
        {(() => {
          const STEP = 1024
          const min = ctxCap != null ? Math.min(4096, ctxCap) : 4096
          // Slider max is the cap ROUNDED DOWN to a step, so the far right is always reachable by
          // dragging; the cap itself (e.g. 88,064) may not sit on a step boundary.
          const max = ctxCap != null ? Math.max(min, Math.floor(ctxCap / STEP) * STEP) : 0
          const atFull = settings.numCtx == null
          // Full = the right end. Storing null rather than the number means the chat keeps tracking the
          // cap if root later raises it, instead of pinning to today's figure.
          const value = atFull ? max : Math.min(Math.max(settings.numCtx!, min), max)
          const pct = ctxCap ? Math.round((value / ctxCap) * 100) : 0

          if (ctxCap == null || max <= min) {
            return (
              <label className="mt-1.5 flex flex-col gap-1">
                <span className="text-[12px] font-bold text-muted">
                  Context window <em className={SET_HINT}>{ctxCap != null ? `fixed at ${ctxCap.toLocaleString()} for this model` : 'blank = the model’s full window'}</em>
                </span>
                <input
                  className="gw-input w-full !px-2 !py-1.5 !text-[13px]" type="number" step={STEP} min={1024}
                  max={ctxCap ?? undefined} data-ui="chat-numctx"
                  placeholder={ctxCap ? `${ctxCap.toLocaleString()} (full)` : 'full'}
                  value={numVal(settings.numCtx ?? null)} disabled={disabled || (ctxCap != null && max <= min)}
                  onChange={(e) => setNum('numCtx', e.target.value)} />
              </label>
            )
          }
          return (
            <div className="mt-1.5 flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-bold text-muted">Context window</span>
                <span className="text-[12px] tabular-nums" data-ui="chat-numctx-value">
                  {atFull
                    ? <b className="text-ink">full · {ctxCap.toLocaleString()}</b>
                    : <><b className="text-ink">{value.toLocaleString()}</b> <span className="text-muted">of {ctxCap.toLocaleString()} · {pct}%</span></>}
                </span>
              </div>
              <input
                className="chat-ctx-range" type="range" data-ui="chat-numctx"
                min={min} max={max} step={STEP} value={value} disabled={disabled}
                aria-label="Context window for this chat"
                // fraction of the TRACK (min..max), not of the cap — the track starts at `min`, so
                // using the cap fraction would leave the fill out of step with the thumb.
                style={{ '--ctx-fill': `${max > min ? Math.round(((value - min) / (max - min)) * 100) : 100}%` } as React.CSSProperties}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  // At the far right, store null (= follow the cap) rather than the literal maximum.
                  onChange({ ...settings, numCtx: v >= max ? null : v })
                }} />
              {/* text-[11px] explicitly: SET_HINT sets weight/colour but NOT size, and the sibling
                  labels get theirs from a text-[12px] parent span. This row is a bare div, so without
                  it the hint inherited the panel's base size and rendered noticeably larger than every
                  other hint in the panel. */}
              <div className="flex items-center justify-between text-[11px]">
                {/* Pair the exact figure with its k form, because the header badge shows the 1024-based
                    "86k" and the exact figure is 88,064 — side by side they read as different numbers
                    until seen together. The k form is dropped when the cap is not 1024-aligned, since
                    there is no clean k to show and the exact number is already right there. */}
                <em className={SET_HINT}>max {ctxCap.toLocaleString()}{ctxCap % 1024 === 0 ? ` (${ctxCap / 1024}k)` : ''}</em>
                {!atFull && (
                  <button type="button" className="underline decoration-dotted underline-offset-2 text-muted hover:text-ink"
                    data-ui="chat-numctx-full" disabled={disabled}
                    onClick={() => onChange({ ...settings, numCtx: null })}>use full</button>
                )}
              </div>
            </div>
          )
        })()}
      </div>

      {(skills?.length ?? 0) > 0 && (
        <label className={SET_INSTRUCTIONS} title="Run this conversation as a Skill: its instructions frame every turn, tools are constrained to what it allows, and it may pin its own model.">
          <span className="text-[12px] font-bold text-muted">Skill <em className={SET_HINT}>an expertise pack the replies run "as"</em></span>
          <ClearableSelect className="gw-input chat-set-skill w-full !px-2 !py-1.5 !text-[13px]" wrapClassName="w-full"
            value={settings.skill ?? ''} disabled={disabled}
            onChange={(v) => onChange({ ...settings, skill: v || null })}
            clearTitle="Unbind the skill">
            <option value="">(no skill)</option>
            {settings.skill && !skills!.some((s) => s.id === settings.skill) && (
              <option value={settings.skill}>{settings.skill} (not installed)</option>
            )}
            {skills!.map((s) => (
              <option key={s.id} value={s.id} title={s.description}>
                {s.name}{s.files ? ` · ${s.files} bundled file${s.files === 1 ? '' : 's'}` : ''}
              </option>
            ))}
          </ClearableSelect>
        </label>
      )}

      <label className={SET_INSTRUCTIONS}>
        <span className="text-[12px] font-bold text-muted">Custom instructions</span>
        <textarea className="gw-textarea !mb-0" rows={2} placeholder="e.g. Always answer in British English and prefer bullet points."
          value={settings.customInstructions} disabled={disabled}
          onChange={(e) => onChange({ ...settings, customInstructions: e.target.value })} />
      </label>

      <div className={SET_INSTRUCTIONS} title="When the conversation model can't see images, this vision model describes them and the description is fed into the prompt instead.">
        <span className="text-[12px] font-bold text-muted">Vision relay <em className={SET_HINT}>describes images for non-vision models</em></span>
        <ModelCombo
          items={visionModels || []}
          value={settings.visionRelayModel ?? ''}
          onChange={(id) => onChange({ ...settings, visionRelayModel: id || null })}
          onOpen={onModelsOpen}
          // NAME the default rather than leaving "(platform default)" to be guessed (Ote's ask).
          // It matters more here than for most settings: this model is the platform's EYE, and its
          // description is cached on the message row and replayed forever.
          emptyLabel={visionRelayDefault ? `(platform default · ${shortModel(visionRelayDefault)})` : '(platform default)'}
          showFullValue
          disabled={disabled}
        />
        {visionRelayDefault && !settings.visionRelayModel && (
          <span className="text-[11px] text-muted">
            Using <b>{shortModel(visionRelayDefault)}</b> — root sets this platform-wide (<code>chat.visionRelayModel</code>).
          </span>
        )}
      </div>
    </div>
  )
}

export default function ChatApp() {
  const { user, can, refresh: refreshAuth } = useAuth()
  // Phone-only CONTENT choices (not layout — CSS owns that). Used for the composer placeholder,
  // whose keyboard hint wrapped the input to three lines at 390px.
  const isPhone = useMediaQuery(PHONE_QUERY)
  const canSelect = can('select_model')
  // Debug affordances (e.g. the message-id in the stats line) show ONLY for privileged users —
  // root, admins (manage_users), and developers — so ordinary users aren't overwhelmed by internals.
  const isDebugUser = !!(user?.isRoot || can('manage_users') || user?.roles?.includes('developer'))
  const canConsole = can('console')
  // Context meter: everyone sees the headline number; only context_detail may OPEN the breakdown.
  // The server enforces this too — it simply does not send `categories`/`parts` otherwise — so this
  // flag governs affordance (is the meter a button?), never secrecy.
  const canContextDetail = can('context_detail')
  const [ctxUsage, setCtxUsage] = useState<ContextUsage | null>(null)
  const [ctxOpen, setCtxOpen] = useState(false)

  // Options modal (account/profile settings for chat-only users too) — routed via the
  // URL hash, Claude style: /chat#options/<section>. Survives refresh + deep-links.
  const [optionsSection, setOptionsSection] = useState<string | null>(null)
  useEffect(() => {
    const applyHash = () => {
      const m = window.location.hash.match(/^#options(?:\/([\w-]*))?$/)
      setOptionsSection(m ? (m[1] || 'account') : null)
    }
    applyHash() // deep-link / refresh
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])
  const openOptions = () => { window.location.hash = '#options/account' }
  const closeOptions = () => {
    history.replaceState(null, '', window.location.pathname + window.location.search)
    setOptionsSection(null)
  }

  // Each conversation is a route (/chat/:conversationId) — the URL is the source of
  // truth, so refresh/back/forward land on the right chat (ChatGPT-style).
  const navigate = useNavigate()
  const { conversationId } = useParams()
  // Remember the room so the console's "← Chat" returns here instead of opening a new chat. Written on
  // every route change INCLUDING the undefined case, so starting a new chat clears the pointer rather than
  // sending the next return into a conversation the user has already left.
  useEffect(() => { rememberConversation(conversationId ?? null) }, [conversationId])
  const skipUrlLoad = useRef(false) // set before self-initiated navigations that already updated state
  // Live mirror of the route id: the initial models load reads this to decide whether to
  // apply the DEFAULT model. On a conversation route the conversation owns the selector, so
  // the (slower) models fetch must never clobber it with the default — the bug where the
  // header showed the default after refresh while the sidebar showed the real model.
  const conversationIdRef = useRef(conversationId)
  conversationIdRef.current = conversationId

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeIdRef = useRef<string | null>(null) // live mirror for async stream handlers
  activeIdRef.current = activeId
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // conversationId -> schedule name for runs GENERATING right now (server push: run-started
  // → run-ended/conversations-changed). Lets a watched thread show a live "generating"
  // placeholder during the run instead of a silent gap until the whole turn lands at once.
  const [scheduledRuns, setScheduledRuns] = useState<Map<string, string>>(new Map())
  const [todo, setTodo] = useState<TodoSnapshot>(null) // the open conversation's working plan (Todo Feature)
  // HumanInteraction: the open conversation's pending question (the turn is HELD until it
  // resolves) + a badge set for OTHER conversations waiting on an answer. Ref mirror so
  // the send handler (stable deps) can consume typed text as the answer (D2).
  const [pendingAsk, setPendingAsk] = useState<PendingInteraction>(null)
  const pendingAskRef = useRef<PendingInteraction>(null)
  pendingAskRef.current = pendingAsk
  const [askBadges, setAskBadges] = useState<Set<string>>(new Set())
  const [modelsInfo, setModelsInfo] = useState<ChatModelsResponse | null>(null)
  const modelsInfoRef = useRef<ChatModelsResponse | null>(null)
  modelsInfoRef.current = modelsInfo
  const [selectedModel, setSelectedModel] = useState<string>('')
  // Installed Skills for the ⚙ binding picker (persona code skills + imported Agent Skills).
  // One fetch per visit is enough — imports are a root/console action, not a chat-session one.
  // skillBindingOn/slashOn = root levers: they hide the ⚙ picker / the composer "/" trigger.
  const [chatSkills, setChatSkills] = useState<ChatSkill[]>([])
  const [skillBindingOn, setSkillBindingOn] = useState(true)
  const [slashOn, setSlashOn] = useState(true)
  // Which /skill row the keyboard is on. The popover used to be mouse-only, so a keyboard user had to reach for
  // the trackpad mid-sentence (Ote: "/ command should nav with arrow up/down and use tab to select").
  const [slashActive, setSlashActive] = useState(0)
  useEffect(() => {
    if (!canSelect) return
    listChatSkills().then((r) => {
      setChatSkills(r.skills || [])
      setSkillBindingOn(r.binding !== false)
      setSlashOn(r.slashCommands !== false)
    }).catch(() => { /* picker just stays hidden */ })
  }, [canSelect])
  // Per-user chat prefs (new-chat model/options behavior + last-used snapshot). Ref mirror
  // so the seeding/capture callbacks (stable deps) read the live value.
  const [chatPrefs, setChatPrefs] = useState<ChatPrefs | null>(null)
  const chatPrefsRef = useRef<ChatPrefs | null>(null)
  chatPrefsRef.current = chatPrefs
  // composer text is a PER-CONVERSATION draft (localStorage-backed) — switching chats
  // swaps the draft instead of carrying it. Seed from the conversation the URL points at.
  const [input, setInput] = useState(() => getDraft(conversationId ?? NEW_DRAFT_KEY))
  const [attachments, setAttachments] = useState<PreparedImage[]>([]) // WebP-converted images (+ origin meta) for the next send
  const [steerPending, setSteerPending] = useState(0) // steers submitted but not yet echoed back on the stream
  const [docAttachments, setDocAttachments] = useState<OutgoingFile[]>([]) // documents for the next send
  const [preview, setPreview] = useState<string | null>(null) // lightbox image
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // In-flight generations, keyed by conversation id. Each is BOUND to its own conversation:
  // its stream events update ITS entry (never whatever chat is currently on screen), and the
  // composer only locks for the chat that is actually generating. The registry lives in a
  // MODULE singleton (lib/genStreams) so background replies survive navigating away from the
  // chat app entirely (e.g. to the Console) and re-attach on return; useSyncExternalStore
  // keeps this component rendering in step with it.
  const genIds = useSyncExternalStore(subscribeGenIds, getGenIds)
  const genIdsRef = useRef<string[]>([])
  genIdsRef.current = genIds
  // Effective background mode. The user's pref is authoritative the INSTANT they change
  // it in Options (on/off) — modelsInfo.backgroundGeneration (the server-computed
  // effective value) only decides the 'default' case. Without this, changing the pref
  // mid-session left a stale value here and leaving a chat wrongly cancelled the reply.
  const backgroundGenRef = useRef(false)
  backgroundGenRef.current = chatPrefs?.backgroundGeneration === 'on'
    ? true
    : chatPrefs?.backgroundGeneration === 'off'
      ? false
      : modelsInfo?.backgroundGeneration === true
  // "sending" = the chat currently BEING VIEWED is generating. Drives the Stop button,
  // Enter suppression, and locking the model/settings for THIS chat — never other chats.
  const sending = activeId != null && genIds.includes(activeId)
  // Concurrency cap (root setting): with N other replies already generating, further
  // sends are blocked — the button shows why. The server enforces the same limit (429).
  const genLimit = modelsInfo?.backgroundMaxConcurrent ?? 2
  const atGenLimit = !sending && genIds.length >= genLimit
  // Steering (root setting): while THIS chat generates, a message the in-flight reply
  // folds in at its next step (Enter/primary button becomes "Steer"; Stop still cancels).
  const steerEnabled = modelsInfo?.steerEnabled === true

  // ---- token budget niceties: a 🎁 toast when a NEW boost appears (feedback reward
  // landed) and a slim warning above the composer when today's budget runs low ----
  const [budget, setBudget] = useState<TokenBudget | null>(null)
  const [rewardToast, setRewardToast] = useState<string | null>(null)
  const lastBudgetFetch = useRef(0)
  const refreshBudget = useCallback(async (force = false) => {
    if (!force && Date.now() - lastBudgetFetch.current < 30_000) return // throttled (post-turn refreshes)
    lastBudgetFetch.current = Date.now()
    try {
      const b = await getMyBudget()
      setBudget(b)
      const boosts = b.boosts || []
      if (boosts.length) {
        let seen: string[] = []
        try { seen = JSON.parse(localStorage.getItem('ote:seenBoosts') || '[]') } catch { /* fresh */ }
        const fresh = boosts.find((x) => !seen.includes(x.id))
        if (fresh) {
          setRewardToast(fresh.source === 'feedback'
            ? `🎁 Your feedback earned a reward: +${fmtTokens(fresh.tokensPerDay)} tokens/day until ${fmtDay(fresh.expiresAt)} — thank you!`
            : `🎁 You received a token boost: +${fmtTokens(fresh.tokensPerDay)}/day until ${fmtDay(fresh.expiresAt)}.`)
        }
        try { localStorage.setItem('ote:seenBoosts', JSON.stringify(boosts.map((x) => x.id))) } catch { /* storage blocked */ }
      }
    } catch { /* budget display is best-effort */ }
  }, [])
  useEffect(() => { void refreshBudget(true) }, [refreshBudget])
  useEffect(() => {
    if (!rewardToast) return
    const t = setTimeout(() => setRewardToast(null), 12_000)
    return () => clearTimeout(t)
  }, [rewardToast])
  const budgetPct = budget?.limited && (budget.effectiveDaily ?? 0) > 0
    ? Math.min(100, Math.round(((budget.usedToday ?? 0) / (budget.effectiveDaily || 1)) * 100))
    : 0
  const [error, setError] = useState<string | null>(null)
  const [loadingConvo, setLoadingConvo] = useState(false)
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  // Context-overflow warning for THIS turn. Deliberately NOT statusNote: that channel is the model's
  // transient progress narration ("Thinking…", "Continuing the tool chain…"), it renders in the progress
  // slot, it is styled as progress, and every note(null) wipes it. Routing a warning through it put the
  // warning where the progress phase belongs (Ote, 2026-08-02) and — worse — made it disappear the moment
  // the first token arrived, i.e. exactly when "this reply may be cut off" starts to matter.
  const [ctxWarn, setCtxWarn] = useState<string | null>(null)
  const [, forceWaitTick] = useState(0) // 1s heartbeat so the pending "working…" phrase animates/escalates while a turn stalls
  const lastEventAtRef = useRef(0)      // when the last stream event landed — the live stall = now − this
  // While a reply is generating, re-render once a second so the pending phrase can rotate/escalate
  // even during a silent stall (a cold model load emits no events until the first token).
  useEffect(() => {
    if (!sending) return
    const id = window.setInterval(() => forceWaitTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [sending])

  // Escape closes the ⚙ settings popover (ModelCombo stops propagation when its own
  // list is open, so the innermost layer closes first).
  useEffect(() => {
    if (!showSettings) return
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setShowSettings(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showSettings])

  const threadEndRef = useRef<HTMLDivElement | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

  // ---- terminal-style "follow mode" scrolling ----
  // The thread auto-scrolls with new content ONLY while the user is parked at the
  // bottom. Scroll up and it stops (free reading); scroll back down (or hit the
  // jump button) and it follows again. `atBottom` drives both the follow decision
  // (via the ref, read inside the stream/render effect without re-subscribing) and
  // the visibility of the floating scroll-to-latest button.
  const FOLLOW_THRESHOLD_PX = 120
  const [atBottom, setAtBottom] = useState(true)
  const atBottomRef = useRef(true)
  const isNearBottom = () => {
    const el = threadRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD_PX
  }
  const onThreadScroll = () => {
    // Appending content never fires 'scroll' (scrollTop is unchanged), so this only
    // runs on a real user scroll or our own programmatic jump — exactly when we want
    // to re-evaluate whether the user is still following the tail.
    const near = isNearBottom()
    atBottomRef.current = near
    setAtBottom((prev) => (prev === near ? prev : near))
  }
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = threadRef.current
    if (!el) return
    atBottomRef.current = true
    setAtBottom(true)
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  // Auto-grow the composer with its content (ChatGPT-style): min = one row,
  // max = 200px (matches the CSS cap), then it scrolls internally.
  useEffect(() => {
    const el = composerRef.current
    if (!el) return
    el.style.height = 'auto' // shrink back when lines are deleted
    const max = 200
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  }, [input])

  // ---- conversation list: search (debounced) + active/archived view ----
  const [convoSearch, setConvoSearch] = useState('')
  const [convoView, setConvoView] = useState<'active' | 'archived'>('active')
  // Re-fetch the conversation list for the current search + view (soft refresh: picks up
  // renames/new chats from other tabs/devices without a browser reload).
  const reloadConversations = useCallback(() =>
    listConversations(convoSearch, convoView === 'archived')
      .then((r) => setConversations(r.conversations))
      .catch(() => { /* keep the current list on a failed fetch */ }),
    [convoSearch, convoView])
  useEffect(() => {
    const t = setTimeout(() => { void reloadConversations() }, convoSearch ? 300 : 0)
    return () => clearTimeout(t)
  }, [convoSearch, convoView, reloadConversations])

  // ---- server push: PROACTIVE content (scheduled runs, digests) lands while the page
  // is open — refresh the sidebar live instead of waiting for a manual reload (Ote's
  // report: a run's new chat only appeared after refresh). One EventSource for the app's
  // lifetime (the browser auto-reconnects); the LATEST reload fn rides a ref so typing
  // in the search box doesn't churn the connection.
  const reloadConversationsRef = useRef(reloadConversations)
  reloadConversationsRef.current = reloadConversations
  // Same ref trick as above, for the same reason: the EventSource is created ONCE for the app's
  // lifetime, so a handler closing over `refreshAuth` directly would keep calling the first render's copy.
  const refreshAuthRef = useRef(refreshAuth)
  refreshAuthRef.current = refreshAuth
  useEffect(() => {
    const es = new EventSource('/v1/chat/events')
    es.onmessage = (m) => {
      let evt: { type?: string; conversationId?: string; name?: string; rewarded?: boolean; status?: string; interactionId?: string; outcome?: string; displayName?: string } = {}
      try { evt = JSON.parse(m.data) } catch { return }
      const cid = evt.conversationId
      // the HumanInteraction protocol: a question is pending (hint-only push — fetch the
      // payload) / resolved. The ACTIVE conversation renders the card; others get a ❓ badge.
      if (evt.type === 'interaction-created') {
        if (cid && cid === activeIdRef.current) {
          getPendingInteraction(cid).then((r) => { if (activeIdRef.current === cid && r.interaction) setPendingAsk(r.interaction) }).catch(() => {})
        } else if (cid) {
          setAskBadges((prev) => { const n = new Set(prev); n.add(cid); return n })
        }
        return
      }
      if (evt.type === 'interaction-waiting') return // attention is driven by the pendingAsk effect below
      if (evt.type === 'interaction-completed') {
        if (cid) setAskBadges((prev) => { if (!prev.has(cid)) return prev; const n = new Set(prev); n.delete(cid); return n })
        setPendingAsk((prev) => (prev && prev.id === evt.interactionId ? null : prev))
        return
      }
      // the Todo Feature protocol: the working plan changed — refetch the rail snapshot
      // for the open conversation (the frontend owns NO todo logic, just renders it)
      if (evt.type === 'todo-changed') {
        if (cid && cid === activeIdRef.current) {
          getConversationTodo(cid).then((r) => { if (activeIdRef.current === cid) setTodo(r.todo) }).catch(() => {})
        }
        return
      }
      // the model renamed the account (set_display_name landed). Refresh the auth profile so the
      // sidebar identity updates LIVE — it used to stay stale until a reload, so the reply said
      // "Done, I'll call you Kestrel" while the corner still showed the old name. Refetching /me is
      // the right move rather than patching the name in locally: the server is the authority on the
      // reconciled profile, and this way roles/flags stay consistent too.
      if (evt.type === 'profile-changed') {
        void refreshAuthRef.current()
        return
      }
      // the team replied/resolved/rewarded the user's feedback — surface it live: a reward
      // refreshes the budget (which pops the existing 🎁 toast), and the Feedback panel (if
      // open) reloads its list. No manual ↻; works even while the user is just chatting.
      if (evt.type === 'feedback-updated') {
        notifyFeedbackChanged()
        if (evt.rewarded) void refreshBudget(true)
        return
      }
      // a scheduled run BEGAN generating into a known conversation — mark it live
      if (evt.type === 'run-started') {
        if (cid) setScheduledRuns((prev) => { const n = new Map(prev); n.set(cid, evt.name || 'Scheduled run'); return n })
        return
      }
      // a run finished with no deliverable (error / nothing to say) — drop its marker
      if (evt.type === 'run-ended') {
        if (cid) setScheduledRuns((prev) => { if (!prev.has(cid)) return prev; const n = new Map(prev); n.delete(cid); return n })
        return
      }
      if (evt.type !== 'conversations-changed') return
      // the run that landed here is done — clear its live marker (the refetch below shows the reply)
      if (cid) setScheduledRuns((prev) => { if (!prev.has(cid)) return prev; const n = new Map(prev); n.delete(cid); return n })
      void reloadConversationsRef.current()
      // the run landed in the OPEN conversation — pull the new messages in quietly,
      // unless a local reply is mid-flight (never clobber a streaming view)
      if (cid && cid === activeIdRef.current && !genStreams.get(cid)) {
        getConversation(cid).then((r) => {
          if (activeIdRef.current !== cid) return
          setMessages((prev) => (prev.some((msg) => msg.pending) ? prev : r.messages))
          setTodo(r.todo ?? null)
          // a scheduled run just generated INTO this chat, so its fill changed — keep the meter honest
          if (r.contextUsage) setCtxUsage(r.contextUsage)
        }).catch(() => { /* the sidebar refresh already happened — good enough */ })
      }
    }
    return () => es.close()
    // MOUNT-ONCE ON PURPOSE: this opens an EventSource. Listing `refreshBudget` (or anything else recreated
    // per render) would tear down and re-subscribe the SSE channel on every render, dropping live events
    // mid-stream. The handler reads current values through refs — that is what makes the empty dep list
    // correct rather than lazy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- HumanInteraction: opening a conversation picks up its pending question (reload /
  // switch-back land on a live card, not a silent hold) ----
  useEffect(() => {
    setPendingAsk(null)
    if (!activeId) return
    let dead = false
    getPendingInteraction(activeId)
      .then((r) => { if (!dead && activeIdRef.current === activeId) setPendingAsk(r.interaction) })
      .catch(() => { /* no card — the model may not be asking anything */ })
    return () => { dead = true }
  }, [activeId])

  // The ATTENTION half of the protocol (interaction.waiting → notify the user, Ote's rule:
  // users must not miss a waiting question). This frontend answers with: the waiting
  // jingle (its parody personality — mute toggle wins), a title-bar flash, a browser
  // notification when already permitted, and a vibration nudge where supported.
  useEffect(() => {
    if (!pendingAsk) return
    startJingle()
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('❓ The assistant needs your input', { body: pendingAsk.questions[0]?.question || 'A question is waiting for you.' }) } catch { /* notification is best-effort */ }
    try { navigator.vibrate?.(200) } catch { /* not supported */ }
    const baseTitle = document.title
    let flip = false
    const flash = window.setInterval(() => { document.title = flip ? baseTitle : '❓ Waiting for your answer…'; flip = !flip }, 1200)
    // Raised off 0 while the question is still open → resume the loop. (Lowering to 0 stops it
    // from inside the jingle itself, which owns the audio graph.)
    const offVol = onSoundChange(() => { if (!isChannelMuted('askUser')) startJingle() })
    return () => { offVol(); stopJingle(); clearInterval(flash); document.title = baseTitle }
  }, [pendingAsk?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve the pending question (card submit / skip / typed free text). First answer wins
  // server-side; a 409 just means another page got there — drop the card either way.
  const answerAsk = useCallback(async (payload: { answers?: { selected?: string[]; custom?: string }[]; freeText?: string; skip?: boolean }) => {
    const ask = pendingAskRef.current
    const cid = activeIdRef.current
    if (!ask || !cid || ask.conversationId !== cid) return
    setPendingAsk(null) // optimistic — the held turn resumes immediately on the server
    // The stall clock has been running for the WHOLE time the question sat unanswered (however many
    // minutes the user took), so without this the resumed turn would render its very first wait phrase
    // from the top tier — "Someone tell Ote there's something wrong with my AI…" — when nothing is wrong
    // and the model has only just been handed the answer. The wait we now care about starts here.
    lastEventAtRef.current = Date.now()
    try { await answerConversationInteraction(cid, ask.id, payload) } catch { /* already resolved elsewhere */ }
  }, [])

  // ---- models this user may use: loaded up front, re-fetched (throttled) whenever a
  // picker opens so new providers/models appear without a page reload ----
  const loadModels = useCallback((initial = false) => {
    markModelsFetched(CHAT_MODELS_KEY)
    getChatModels()
      .then((r) => {
        setModelsInfo(r)
        // Only seed the default for a NEW chat (no conversation route). When a conversation
        // is open, openConversation() sets its model and must win regardless of fetch order.
        if (initial && !conversationIdRef.current) setSelectedModel(r.defaultModel || r.models[0]?.id || '')
      })
      .catch((e) => { if (initial) setError(e?.message || 'Failed to load models') })
  }, [])
  useEffect(() => { loadModels(true) }, [loadModels])
  const refreshModelsOnOpen = useCallback(() => {
    if (modelsNeedRefresh(CHAT_MODELS_KEY)) loadModels()
  }, [loadModels])

  // ---- per-user chat prefs: new-chat model/options behavior + last-used snapshot ----
  // Load once; on failure fall back to the ships-defaults so seeding still works.
  // Timezone auto-sync: the browser knows where the user IS (IANA zone) — persist it
  // whenever it differs from the stored pref, so the server formats times and the
  // get_current_time tool answers in the user's zone, never the server's. Travel just works.
  useEffect(() => {
    getChatPrefs()
      .then((r) => {
        setChatPrefs(r.prefs)
        // Adopt the account's sound levels — the local mirror may be from another device, and a
        // jingle can fire before this lands (which is exactly why the mirror exists).
        hydrateSoundPrefs(r.prefs.sound)
        hydrateSpeechRate(r.prefs.speechRate)
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (browserTz && r.prefs.timezone !== browserTz) {
          void saveChatPrefs({ timezone: browserTz }).then((u) => setChatPrefs(u.prefs)).catch(() => { /* next visit retries */ })
        }
      })
      .catch(() => setChatPrefs({ newChatModel: 'default', newChatOptions: 'last', backgroundGeneration: 'default', defaultModel: null, timezone: null, theme: 'system', sound: {}, autoSpeak: false, speechRate: 1, lastModel: null, lastSettings: null }))
  }, [])
  // Seed a NEW chat's model + ⚙ options from the prefs (or platform defaults). Reads live
  // refs so effects/handlers with stable deps stay correct. Model 'last' only applies if the
  // remembered model is still in the user's list; options 'last' only if a snapshot exists.
  const applyNewChatSeed = useCallback(() => {
    const p = chatPrefsRef.current
    const mi = modelsInfoRef.current
    const def = mi?.defaultModel || mi?.models?.[0]?.id || ''
    const known = (id: string) => Boolean(mi?.models?.some((m) => m.id === id))
    setSelectedModel(p?.newChatModel === 'last' && p.lastModel && known(p.lastModel) ? p.lastModel : def)
    setSettings(p?.newChatOptions === 'last' && p.lastSettings ? p.lastSettings : (mi?.defaultSettings ?? DEFAULT_SETTINGS))
  }, [])
  // One-time initial seed: once models + prefs are both ready on a NEW-chat route, apply the
  // seed. On a conversation route openConversation() owns it — skip. prefsReady then gates capture.
  const didInitialSeed = useRef(false)
  const prefsReady = useRef(false)
  useEffect(() => {
    if (didInitialSeed.current) return
    if (conversationId) { didInitialSeed.current = true; prefsReady.current = true; return }
    if (modelsInfo && chatPrefs) { applyNewChatSeed(); didInitialSeed.current = true; prefsReady.current = true }
  }, [modelsInfo, chatPrefs, conversationId, applyNewChatSeed])
  // Capture the working model + options as the "last used" snapshot (debounced) so a refresh
  // and the next new chat can carry them. select_model users only; root has no DB row to store on.
  useEffect(() => {
    if (!prefsReady.current || !canSelect || user?.isRoot) return
    const t = setTimeout(() => {
      void saveChatPrefs({ lastModel: selectedModel || null, lastSettings: settings })
        .then((r) => setChatPrefs(r.prefs))
        .catch(() => { /* best-effort */ })
    }, 800)
    return () => clearTimeout(t)
  }, [selectedModel, settings, canSelect, user])

  // ---- auto-scroll the thread on new content — only while following the tail ----
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom('auto')
  }, [messages, scrollToBottom])

  // Opening / switching a conversation snaps to the latest and re-arms follow mode.
  useEffect(() => {
    atBottomRef.current = true
    setAtBottom(true)
    // after the messages for this conversation render, pin to the bottom
    requestAnimationFrame(() => scrollToBottom('auto'))
  }, [activeId, scrollToBottom])

  // BYOK providers get their picker groups labeled as the user's own (ModelCombo groups by prefix)
  const byokProviders = useMemo(() => {
    const s = new Set<string>()
    for (const m of modelsInfo?.models ?? []) {
      if (m.byok) s.add(m.id.includes('/') ? m.id.slice(0, m.id.indexOf('/')) : 'other')
    }
    return s
  }, [modelsInfo])

  // Capability split: verified non-chat specialists (embeddings/reranker/…) are shown in
  // a locked "not for chat" group instead of offered — picking one only buys a provider 400.
  const chatModelIds = useMemo(
    () => (modelsInfo?.models ?? []).filter((m) => !m.notChat).map((m) => m.id),
    [modelsInfo],
  )
  const nonChatGroup = useMemo(() => {
    const ids = (modelsInfo?.models ?? []).filter((m) => m.notChat).map((m) => m.id)
    return ids.length
      ? { label: 'not for chat', ids, hint: 'Specialist model (embeddings / reranker / …) — it can’t hold a conversation' }
      : undefined
  }, [modelsInfo])
  // ⚙ toggles the selected model verifiably can't honor (thinking/tools) show off+locked
  const selectedUnsupported = useMemo(
    () => modelsInfo?.models.find((m) => m.id === selectedModel)?.unsupported,
    [modelsInfo, selectedModel],
  )
  // per-row picker note: the context window a chat with that model actually gets
  const ctxAnnotations = useMemo(() => {
    const out: Record<string, string> = {}
    for (const m of modelsInfo?.models ?? []) {
      if ((m.effectiveContext ?? 0) > 0) out[m.id] = `${Math.round(m.effectiveContext! / 1024)}k ctx`
    }
    return out
  }, [modelsInfo])
  // A CPU-pinned provider's models get a "-cpu" display suffix. The picker strips the provider prefix for
  // display, so without this a CPU entry and its GPU twin are the SAME text in the closed control — and
  // the difference between them is a 12s reply and a 4-minute one. The id is untouched: the suffix is a
  // label, not a model name, so nothing downstream has to know about it.
  const modelLabels = useMemo(() => {
    const out: Record<string, string> = {}
    for (const m of modelsInfo?.models ?? []) {
      if (m.cpu) out[m.id] = `${m.id.slice(m.id.indexOf('/') + 1)}-cpu`
    }
    return out
  }, [modelsInfo])

  // ---- DB draft fold: after a typing pause the draft is PATCHed onto the conversation
  // row, so it survives logout/login and follows the user to other devices (localStorage
  // stays the instant same-device layer; the send path consumes the server copy).
  const draftFoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftFoldLast = useRef<{ id: string; text: string } | null>(null)
  const scheduleDraftFold = useCallback((id: string, text: string) => {
    draftFoldLast.current = { id, text }
    if (draftFoldTimer.current) clearTimeout(draftFoldTimer.current)
    draftFoldTimer.current = setTimeout(() => {
      draftFoldTimer.current = null
      const p = draftFoldLast.current
      draftFoldLast.current = null
      if (p) void updateConversation(p.id, { draft: p.text }).catch(() => { /* fold is best-effort */ })
    }, 1200)
  }, [])
  // leaving the chat (switch / new chat / unmount): fold what's pending NOW, not in 1.2s
  const flushDraftFold = useCallback(() => {
    if (draftFoldTimer.current) { clearTimeout(draftFoldTimer.current); draftFoldTimer.current = null }
    const p = draftFoldLast.current
    draftFoldLast.current = null
    if (p) void updateConversation(p.id, { draft: p.text }).catch(() => { /* best-effort */ })
  }, [])
  // the send/steer consumed the composer — a stale pending fold must not resurrect it
  const dropPendingDraftFold = useCallback(() => {
    if (draftFoldTimer.current) { clearTimeout(draftFoldTimer.current); draftFoldTimer.current = null }
    draftFoldLast.current = null
  }, [])
  useEffect(() => flushDraftFold, [flushDraftFold]) // unmount (e.g. Console nav) folds too

  const openConversation = useCallback(async (id: string) => {
    flushDraftFold() // the previous chat's in-flight draft folds before we switch
    setActiveId(id)
    setInput(getDraft(id)) // swap in this conversation's unsent draft
    setError(null)
    // The context meter describes THIS conversation's last prompt, so it clears on switch — showing one
    // chat's usage under another's composer would be a wrong number, which is worse than none. It is
    // re-hydrated below from the conversation's own last measurement, so reopening a chat shows how full
    // it is straight away rather than staying blank until the next reply (Ote caught this).
    setCtxUsage(null)
    setCtxOpen(false)
    setLoadingConvo(true)
    try {
      const r = await getConversation(id)
      // opening clears the scheduled-run marker server-side — mirror it locally
      setConversations((prev) => prev.map((c) => (c.id === id && c.unread ? { ...c, unread: undefined } : c)))
      // if this conversation is still generating (background mode), re-attach its live
      // in-flight reply so it keeps streaming into view; the DB doesn't have it yet
      const entry = genStreams.get(id)
      setMessages(entry ? [...r.messages, entry.msg] : r.messages)
      setTodo(r.todo ?? null) // the working plan for this conversation (Todo rail)
      setCtxUsage(r.contextUsage ?? null) // last measured fill for THIS chat — absent until it has replied once
      // a marathon auto-continue is mid-flight for this convo (background rounds stream to
      // nobody) — seed the live "working" marker so a RELOAD still shows it (the SSE
      // run-started only reaches pages that were already open); run-ended clears it
      setScheduledRuns((prev) => {
        const n = new Map(prev)
        if (r.activeRun) n.set(id, 'Marathon — auto-continue'); else if (!genStreams.get(id)) n.delete(id)
        return n
      })
      if (r.conversation.model) setSelectedModel(r.conversation.model)
      setSettings(r.conversation.settings || DEFAULT_SETTINGS)
      // a draft folded on another device (or before logout) restores the composer — the
      // LOCAL draft wins when both exist (it's the box the user is typing in right now)
      const serverDraft = r.conversation.draft || ''
      if (serverDraft && !getDraft(id) && activeIdRef.current === id) {
        setInput(serverDraft)
        setDraft(id, serverDraft)
      }
    } catch (e) {
      setError((e as Error)?.message || 'Failed to load conversation')
      navigate('/chat', { replace: true }) // stale/foreign URL — back to a fresh chat
    } finally {
      setLoadingConvo(false)
    }
  }, [navigate, flushDraftFold])

  const startNewChat = useCallback(() => {
    flushDraftFold() // the chat we're leaving folds its in-flight draft first
    setActiveId(null)
    setMessages([])
    setTodo(null)
    setError(null)
    setCtxUsage(null) // same reason as openConversation: never show the previous chat's usage here
    setCtxOpen(false)
    setInput(getDraft(NEW_DRAFT_KEY)) // the new-chat composer keeps its own draft
    applyNewChatSeed() // model + ⚙ options per the user's new-chat prefs
  }, [applyNewChatSeed, flushDraftFold])

  // URL -> state: load the conversation the route points at (initial load, refresh,
  // back/forward, sidebar navigations). Self-initiated navigations that already
  // updated state (lazy create on first send) set skipUrlLoad to avoid a reload.
  useEffect(() => {
    if (skipUrlLoad.current) { skipUrlLoad.current = false; return }
    // Leaving a chat that's still generating: CANCEL mode aborts it (the backend saves the
    // partial, so it reopens complete with Regenerate). BACKGROUND mode leaves it running,
    // so it keeps going and re-attaches when you come back. Root picks the mode.
    const leaving = activeIdRef.current
    if (!backgroundGenRef.current && leaving && genIdsRef.current.includes(leaving)) {
      genStreams.get(leaving)?.ctrl.abort()
    }
    if (conversationId && conversationId !== activeId) void openConversation(conversationId)
    else if (!conversationId && activeId != null) startNewChat()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the URL drives this
  }, [conversationId])

  // NOTE deliberately NO unmount abort: the registry is a module singleton, so background
  // generations keep streaming while the user visits the Console (or any other page) and
  // re-attach when the chat app remounts. In CANCEL mode a survivor from before the
  // navigation should NOT keep running unseen — reconcile once, but only AFTER prefs +
  // models have loaded (at mount backgroundGenRef still reads false and would wrongly
  // kill legit background streams).
  const reconciledRef = useRef(false)
  useEffect(() => {
    if (reconciledRef.current || !chatPrefs || !modelsInfo) return
    reconciledRef.current = true
    if (backgroundGenRef.current) return
    for (const [id, entry] of genStreams) {
      if (id !== conversationIdRef.current) entry.ctrl.abort()
    }
  }, [chatPrefs, modelsInfo])

  // Mirror live entry updates into the view — THIS instance's subscription, so streams
  // started by a previous ChatApp instance (before a Console round-trip) render too.
  useEffect(() => subscribeEntry((id) => {
    if (id !== activeIdRef.current) return
    const entry = genStreams.get(id)
    if (entry) setMessages((prev) => patchLastAssistant(prev, () => entry.msg))
  }), [])

  // The /skill popover, derived ONCE so the rendered list and the keyboard handler can never disagree about
  // which row is highlighted — computing the filter in two places is how an arrow key ends up selecting a
  // different item than the one shown.
  const slashMatches = useMemo(
    () => (!canSelect || !slashOn || !/^\/[a-z0-9.-]*$/.test(input)
      ? []
      : chatSkills.filter((s) => s.id.replace(/^skill\./, '').startsWith(input.slice(1).toLowerCase())).slice(0, 6)),
    [canSelect, slashOn, input, chatSkills],
  )
  const slashOpen = slashMatches.length > 0
  const pickSlash = useCallback((s: ChatSkill) => {
    setInput(`/${s.id.replace(/^skill\./, '')} `)
    setSlashActive(0)
    composerRef.current?.focus()
  }, [])
  // keep the highlight in range as the filter narrows
  useEffect(() => { setSlashActive((a) => (a >= slashMatches.length ? 0 : a)) }, [slashMatches.length])

  const onModelChange = useCallback(async (model: string) => {
    setSelectedModel(model)
    // For an existing conversation, persist the change (members can't reach here — no <select>).
    if (activeId != null) {
      try {
        await updateConversation(activeId, { model })
        setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, model } : c)))
      } catch (e) {
        setError((e as Error)?.message || 'Failed to change model')
      }
    }
  }, [activeId])

  // Update generation settings; persist to the conversation if one is active.
  const updateSettings = useCallback(async (next: ChatSettings) => {
    setSettings(next)
    if (activeId != null) {
      try {
        await updateConversation(activeId, { settings: next })
      } catch (e) {
        setError((e as Error)?.message || 'Failed to save settings')
      }
    }
  }, [activeId])

  // conversation delete goes through the shared confirmation modal
  const [deletingConvo, setDeletingConvo] = useState<Conversation | null>(null)
  // schedules that run INTO the chat about to be deleted — the modal warns they'll go inactive
  const [deleteSchedWarn, setDeleteSchedWarn] = useState<{ count: number; names: string[] } | null>(null)
  useEffect(() => {
    if (!deletingConvo) { setDeleteSchedWarn(null); return }
    let alive = true
    getScheduleTargets(deletingConvo.id)
      .then((r) => { if (alive) setDeleteSchedWarn(r.activeCount > 0 ? { count: r.activeCount, names: r.schedules.filter((s) => s.enabled).map((s) => s.name) } : null) })
      .catch(() => { if (alive) setDeleteSchedWarn(null) })
    return () => { alive = false }
  }, [deletingConvo])
  const onDelete = useCallback(async (id: string) => {
    await deleteConversation(id)
    setConversations((prev) => prev.filter((c) => c.id !== id))
    setDraft(id, '') // drop the deleted conversation's orphaned draft
    if (activeId === id) navigate('/chat') // URL effect resets the state
  }, [activeId, navigate])

  // inline rename (legacy port): saving is EXPLICIT — Enter or ✓ commits; Esc, ✕ or
  // clicking anywhere else cancels (Ote: no accidental saves on blur). ✦ asks the LLM
  // to suggest a name. Two editors share the state: the HEADER editor (roomy — used
  // for the open chat) and the small sidebar row form (for chats that aren't open).
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renamingHeader, setRenamingHeader] = useState(false)
  const [renameInput, setRenameInput] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const startRename = useCallback((c: Conversation) => {
    setRenameInput(c.title || '')
    if (c.id === activeId) setRenamingHeader(true) // open chat -> the big header editor
    else setRenamingId(c.id)
  }, [activeId])
  const cancelRename = useCallback(() => { setRenamingId(null); setRenamingHeader(false); setRenameInput('') }, [])
  const commitRename = useCallback(async (id: string, rawTitle: string) => {
    setRenamingId(null)
    setRenamingHeader(false)
    setRenameInput('')
    const title = rawTitle.trim()
    if (!title) return // empty = keep the old name
    try {
      await updateConversation(id, { title })
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
    } catch (e) {
      setError((e as Error)?.message || 'Failed to rename conversation')
    }
  }, [])
  const suggestName = useCallback(async (id: string) => {
    setSuggesting(true)
    try {
      const r = await suggestTitle(id)
      if (r.suggestedTitle) setRenameInput(r.suggestedTitle)
    } catch (e) {
      setError((e as Error)?.message || 'Failed to suggest a name')
    } finally {
      setSuggesting(false)
    }
  }, [])

  // per-row ⋯ menu (ChatGPT-style) — one hover button; actions live in a dropdown
  const [convoMenu, setConvoMenu] = useState<{ c: Conversation; x: number; y: number } | null>(null)
  const openConvoMenu = useCallback((e: React.MouseEvent, c: Conversation) => {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    // anchor under the button, clamped to the viewport (menu ~170x140)
    setConvoMenu({ c, x: Math.max(8, Math.min(r.right - 170, window.innerWidth - 178)), y: Math.min(r.bottom + 4, window.innerHeight - 150) })
  }, [])

  // archive / restore — drops the row from the current view (active or archived)
  const onArchive = useCallback(async (id: string, archived: boolean) => {
    try {
      await updateConversation(id, { archived })
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id) navigate('/chat') // URL effect resets the state
    } catch (e) {
      setError((e as Error)?.message || 'Failed to archive conversation')
    }
  }, [activeId, navigate])

  // Drive a streaming generator into the in-flight assistant message. The factory
  // receives an AbortSignal so Stop can cancel it.
  // ── ANSWER WITH SPEAK (Ote's POC) ──────────────────────────────────────────────────────────────────
  // A live queue fed while the model is still writing. Pieces are FETCHED as soon as they exist (so the
  // GPU is never idle) but PLAYED strictly in order — text arrives ~13x faster than speech consumes it, so
  // the queue is always ahead and the ear never waits.
  // Non-null while a turn should be spoken aloud: it holds the conversation id. Set at send time from the
  // pref + mute state, so flipping the pref mid-reply cannot half-apply.
  const speakLiveRef = useRef<string | null>(null)
  // ── HOW DEEP TO FETCH AHEAD, AND WHY IT IS NOT "ALL OF THEM" ────────────────────────────────────────
  // Ote: *"sometime it have a wait on those cut off text or something, it silence for a bit on those table"*.
  // The first version fired every piece the moment it was cut. Measured result: three pieces requested at
  // once came back 0, 2, 1 — pieces do NOT arrive at the sidecar in the order they were sent, and playback is
  // strictly ordered, so the player sat waiting for a piece the GPU had decided to render last. 10s of silence
  // with piece 2 already sitting in memory.
  //
  // Ordering the sidecar's own queue (it now serves first-come-first-served) cannot fix that, because the race
  // happens before arrival. So the CLIENT issues in order, with ONE piece of lookahead: enough that the GPU is
  // never idle while the current clip plays (a render is ~0.5x its audio), and few enough that a later piece
  // can never overtake an earlier one. Depth 1 would idle the GPU through every clip; depth N reintroduces the
  // race this comment exists because of.
  const FETCH_AHEAD = 2
  /** A fetched piece plus the audio element already loaded for it — see the seam note in enqueueLive. */
  type Ready = SpokenPiece & { el?: HTMLAudioElement }
  type SpeechJob = {
    piece: SpeechPiece
    ready: Promise<Ready | null>
    start: () => void          // issue the request (called by the pump, in order)
    issued: boolean
  }
  const liveRef = useRef<{
    session: number; chain: Promise<void>; urls: string[]; streamer: SpeechStreamer | null
    jobs: SpeechJob[]; outstanding: number
    // ⚠ WHICH ELEMENT IS ACTUALLY SOUNDING. Each piece now owns its own preloaded <audio>, so Stop can no
    // longer just pause the one shared element — it has to pause THIS one. Missing this would have left Stop
    // clearing the indicator while the voice kept talking, which is worse than no Stop at all.
    playing: HTMLAudioElement | null
    // ⚠ WHAT HANGS UP ON THE RENDERS STILL IN FLIGHT. Pieces are fetched ahead of playback, so Stop lands while
    // several are mid-render on the GPU. Bumping `session` only makes this code IGNORE the results — the
    // requests continue and the sidecar renders all of them anyway (Ote saw "1 rendering" on the Voice card
    // after stopping). One controller per session: abort it and every outstanding piece is cancelled at once.
    ctrl: AbortController | null
  }>({ session: 0, chain: Promise.resolve(), urls: [], streamer: null, jobs: [], outstanding: 0, playing: null, ctrl: null })
  // VISIBLE STATE. Ote: *"can you add any indicator for user to know that speal is working/going"* — and he
  // is right that it needs one: with auto-speak on, the only feedback was audio, so "nothing happened" and
  // "it is still rendering" were indistinguishable. `queued` counts pieces not yet finished playing.
  // `skipped` sums what the voice could not read across the whole reply (tables, code, formulas). Without
  // it a table-heavy answer goes quiet for ten seconds and looks broken — and "broken" was the right guess
  // until today, when those blocks were being read out as noise instead of skipped.
  // `linger` keeps the pill up for a few seconds after the last piece, but ONLY when something was skipped.
  // ⚠ Found by the drive, not by reading: the skipped pieces are 204s that resolve the instant the audio
  // before them ends, so queued hit 0 in the same React batch that set `skipped` — the explanation rendered
  // for about 100ms and vanished. An explanation nobody can read is not an explanation.
  const [liveSpeech, setLiveSpeech] = useState<{ queued: number; speaking: boolean; skipped: Record<string, number>; linger: boolean }>(
    { queued: 0, speaking: false, skipped: {}, linger: false })
  const lingerTimer = useRef<number | null>(null)

  const stopLiveSpeech = useCallback(() => {
    const L = liveRef.current
    // ⚠ STOP HAS TO MEAN "STOP SPEAKING THIS REPLY", NOT "CLEAR WHAT IS QUEUED RIGHT NOW".
    // Ote, 2026-08-05: *"the queue not dismiss when i click stop"*. Everything below cleared state, but
    // `speakLiveRef` — the flag that says "feed the streamer" — stayed set. So while the model was STILL
    // WRITING, the very next token event re-created the streamer this function had just nulled and enqueued
    // again, and the pill came straight back with a fresh count. Bumping `L.session` cannot help: new
    // enqueues capture the NEW session number, so they look perfectly live.
    // Clearing it here is safe for the send path too — handleSend calls stopLiveSpeech() and then sets this
    // ref for the new turn, in that order.
    speakLiveRef.current = null
    clearSpoken()
    if (lingerTimer.current) { window.clearTimeout(lingerTimer.current); lingerTimer.current = null }
    if (pauseTimer.current) { window.clearTimeout(pauseTimer.current); pauseTimer.current = null }
    setLiveSpeech({ queued: 0, speaking: false, skipped: {}, linger: false })
    L.session += 1
    // ⚠ HANG UP ON THE GPU, don't just stop listening. Everything else here clears LOCAL state; this is the only
    // line that tells the server (and through it the sidecar) that nobody wants these renders any more. Without
    // it, Stop left up to three pieces rendering to completion for audio that would never be played.
    if (L.ctrl) { L.ctrl.abort(); L.ctrl = null }
    L.streamer = null
    L.chain = Promise.resolve()
    L.jobs = []
    L.outstanding = 0
    const live = L.playing
    if (live) { live.onended = null; live.onerror = null; live.pause(); live.src = '' }
    L.playing = null
    for (const u of L.urls) URL.revokeObjectURL(u)
    L.urls = []
    // the shared element belongs to the per-message 🔊 button; silence it too so Stop stops everything
    const el = audioRef.current
    if (el) { el.onended = null; el.onerror = null; el.pause(); el.src = '' }
  }, [])

  // ⚠ THE SPEED AND VOLUME SLIDERS HAVE TO MOVE WHAT IS PLAYING RIGHT NOW, or they cannot be judged by ear —
  // and by ear is the only way a pace is chosen. The 🔊 button path already re-applies its level live
  // (unsubVolRef below); the live "answer with speak" path set volume once at play() and never again, so
  // dragging a slider mid-reply did nothing until the next piece. One subscription covers both settings for
  // the piece in the air, and both are re-applied at play() time for the pieces that follow.
  useEffect(() => onSoundChange(() => {
    // ⚠ THE MUTE STATE HAS TO BE REACTIVE, not read imperatively at click time. The 🔊 button is the ONLY
    // always-visible place a muted channel can be un-muted from (see the dead end described on speakReply),
    // so its label must change the moment the level does — including from another device.
    setSpeechMuted(isChannelMuted('speech'))
    const playing = liveRef.current.playing
    if (!playing) return
    playing.volume = gainOf('speech')
    applyPlaybackRate(playing)
  }), [])

  // ⚠ A PAUSE IN THE ANSWER IS A FLUSH POINT. Ote, watching a tool-using reply read itself aloud:
  // *"while the tools call and thinking start going, the result abrove stop speaking. and continue again after
  // thinking done and start streaming anotehr result… it not event done speaking previouse result and it stop
  // and wait for result."*
  //
  // The streamer only emits once it holds enough speakable text. When `token` events stop — the model has gone
  // off to call a tool or think — the TAIL of what it already said sits in the buffer below the target, nothing
  // new is queued, and the audio simply runs out. It resumes only when the next text segment pushes the buffer
  // back over the target, which is the "hang" he heard.
  //
  // A debounce rather than a flush on tool_call/reasoning events, deliberately: qwen3.6 interleaves thinking
  // with the answer, sometimes in short bursts, and flushing on every reasoning delta would chop the reply into
  // fragments — making the style drift he is ALREADY unhappy about worse. A pause long enough to be a real stop
  // (1.8s) cannot be confused with the gaps inside normal generation, even on a slow 35B.
  const PAUSE_FLUSH_MS = 1800
  const pauseTimer = useRef<number | null>(null)

  /** Issue the next requests, in order, up to the lookahead depth. */
  const pumpLive = useCallback((session: number) => {
    const L = liveRef.current
    while (L.session === session && L.outstanding < FETCH_AHEAD) {
      const job = L.jobs.find((j) => !j.issued)
      if (!job) break
      job.issued = true
      L.outstanding += 1
      job.start()
    }
  }, [])

  /** Queue one piece: fetched in order (see FETCH_AHEAD), played in order. */
  const enqueueLive = useCallback((cid: string, piece: SpeechPiece) => {
    const L = liveRef.current
    const session = L.session
    const text = piece.text
    let fire: () => void = () => {}
    const pending = new Promise<Ready | null>((resolve) => {
      fire = () => {
        // One controller for the whole session, created on the first piece and torn down by stopLiveSpeech.
        if (!L.ctrl) L.ctrl = new AbortController()
        speakText(cid, text, L.ctrl.signal)
          // An abort arrives here as a rejection; it is a normal outcome of Stop, not a failure to report.
          .catch(() => null)
          .then((r) => {
            if (L.session === session) L.outstanding = Math.max(0, L.outstanding - 1)
            // DECODE AHEAD OF THE SEAM: build the element now, while the previous piece is still playing, so its
            // own turn is a play() on something already loaded. Every join used to pay a load+decode first.
            let ready: Ready | null = r
            if (r?.blob && L.session === session) {
              const el = new Audio()
              const url = URL.createObjectURL(r.blob)
              L.urls.push(url)
              el.preload = 'auto'
              el.src = url
              // Ote's pace preference, pitch preserved. Set here AND again at play() time: this element was
              // built one piece ahead, so the slider may have moved between decode and its turn.
              applyPlaybackRate(el)
              el.load()
              ready = { ...r, el }
            }
            resolve(ready)
            pumpLive(session)          // a slot freed: issue the next one, still in order
          })
      }
    })
    L.jobs.push({ piece, ready: pending, start: () => fire(), issued: false })
    pumpLive(session)
    setLiveSpeech((s) => ({ ...s, queued: s.queued + 1 }))
    const finish = () => setLiveSpeech((s) => {
      const queued = Math.max(0, s.queued - 1)
      // Last piece done and something was dropped: hold the pill open long enough to be read, then clear it.
      if (queued === 0 && Object.keys(s.skipped).length && !lingerTimer.current) {
        lingerTimer.current = window.setTimeout(() => {
          lingerTimer.current = null
          setLiveSpeech((t) => (t.queued > 0 || t.speaking ? t : { queued: 0, speaking: false, skipped: {}, linger: false }))
        }, 6000)
        return { ...s, queued, speaking: false, linger: true }
      }
      return { ...s, queued, speaking: queued > 0 ? s.speaking : false }
    })
    L.chain = L.chain.then(async () => {
      if (L.session !== session) { finish(); return }
      const got = await pending
      if (L.session === session) L.jobs = L.jobs.filter((j) => j.piece !== piece)
      // A piece the server had nothing to say for (204: it was only a table) is a SILENCE, not a failure —
      // report what was dropped and move on to the next piece.
      if (got?.omitted && Object.keys(got.omitted).length) {
        const add: Record<string, number> = got.omitted
        setLiveSpeech((s) => {
          const skipped = { ...s.skipped }
          for (const [k, n] of Object.entries(add)) skipped[k] = (skipped[k] || 0) + n
          return { ...s, skipped }
        })
      }
      if (!got?.blob || L.session !== session || isChannelMuted('speech')) { finish(); return }
      // ⚠ THE SEAM. Ote, after listening to a whole reply: *"both still have noticable cut"*. Part of that cut is
      // ours, not the engine's: this used to swap `src` on ONE shared <audio> element at the moment the piece's
      // turn came, so every join paid a fresh load+decode before a sample came out. The 🔊 button path preloads
      // per chunk and sounds cleaner for exactly this reason.
      //
      // So the element is created and told to load as soon as the audio ARRIVES — while the previous piece is
      // still playing — and its turn only calls play() on something already decoded and ready.
      const el = got.el ?? new Audio()
      if (!got.el) { el.src = URL.createObjectURL(got.blob); L.urls.push(el.src) }
      el.volume = gainOf('speech')
      applyPlaybackRate(el)
      // ⚠ HIGHLIGHT ON PLAY, NOT ON QUEUE. Pieces are FETCHED ahead and played in order, so the piece being
      // rendered is usually one ahead of the piece being heard — lighting up at fetch time would point at text
      // nobody is listening to yet. Ote: *"hightlist chuck that the tts speaking on"*, literally.
      // Painted just BEFORE play() rather than after: play() resolves a few milliseconds later, and the drive
      // caught the gap — one sample with the pill already saying "Speaking" and nothing lit yet.
      paintSpoken(piece)
      L.playing = el
      try { await el.play() } catch { clearSpoken(); finish(); return }
      setLiveSpeech((s) => ({ ...s, speaking: true }))
      await new Promise<void>((resolve) => {
        const done = () => { el.onended = null; el.onerror = null; resolve() }
        el.onended = done
        el.onerror = done
      })
      // The next piece repaints; the last one has to clean up after itself or the highlight outlives the audio.
      if (L.session === session) clearSpoken()
      finish()
    }).catch(() => { finish() /* one bad piece must not break the chain */ })
  }, [])

  const consumeStream = useCallback(async (
    makeGen: (signal: AbortSignal) => AsyncGenerator<StreamEvent>,
    convId: string,
  ) => {
    const ctrl = new AbortController()
    // A refusal the CALLER can recover from, rather than a red bar the user has to read and
    // re-act on themselves (currently only `already_generating` — see the error branch below).
    let refusal: string | null = null
    // The live assistant reply for THIS conversation. Every event updates entry.msg first;
    // it only mirrors into the on-screen thread while this conversation is the one being
    // viewed — so peeking at another chat mid-generation can't corrupt it (and returning
    // to a still-generating chat re-attaches this same live message).
    const entry = { ctrl, msg: { role: 'assistant', content: '', reasoning: null, pending: true, tools: [], segments: [] } as ChatMessage }
    genStreams.set(convId, entry)
    setGenIds((prev) => (prev.includes(convId) ? prev : [...prev, convId]))
    const viewing = () => convId === activeIdRef.current
    const update = (fn: (m: ChatMessage) => ChatMessage) => {
      entry.msg = fn(entry.msg)
      // mirror via the store's entry subscription — the CURRENTLY MOUNTED ChatApp
      // instance renders it (this closure's own setMessages dies with a remount)
      notifyEntry(convId)
    }
    const note = (n: string | null) => { if (viewing()) setStatusNote(n) }
    // A user-initiated turn always jumps to the latest + re-arms follow (only for the
    // chat being viewed), so you see your message + the reply begin even if scrolled up.
    if (viewing()) {
      setStatusNote(null)
      // A new turn gets a fresh headroom verdict — the previous turn's warning must not linger and
      // describe a window that no longer applies (a model swap changes it entirely).
      setCtxWarn(null)
      atBottomRef.current = true
      setAtBottom(true)
      requestAnimationFrame(() => scrollToBottom('smooth'))
    }
    lastEventAtRef.current = Date.now() // turn starts now — the pre-first-token wait is measured from here
    try {
      for await (const evt of makeGen(ctrl.signal)) {
        lastEventAtRef.current = Date.now() // an event landed — reset the stall clock
        if (evt.type === 'token') {
          note(null)
          // ANSWER WITH SPEAK: feed the live streamer the canonical answer deltas ONLY. Reasoning is a
          // different event and tool chatter is a different segment, so neither can leak into the audio.
          if (speakLiveRef.current && evt.text) {
            const L = liveRef.current
            if (!L.streamer) L.streamer = createSpeechStreamer({ target: 600, firstTarget: 70 })
            for (const piece of L.streamer.push(evt.text)) enqueueLive(speakLiveRef.current, piece)
            // Arm the pause flush: if the answer text stops for a tool call or a think, speak the tail that is
            // still being held instead of leaving the listener in silence until the next segment arrives.
            if (pauseTimer.current) window.clearTimeout(pauseTimer.current)
            pauseTimer.current = window.setTimeout(() => {
              pauseTimer.current = null
              const cid = speakLiveRef.current
              if (!cid || !L.streamer) return
              for (const piece of L.streamer.flush()) enqueueLive(cid, piece)
            }, PAUSE_FLUSH_MS)
          }
          // content accumulates for copy/export AND for speech; segments weave text between tool blocks
          update((m) => {
            const segs = (m.segments || []).slice()
            const last = segs[segs.length - 1]
            // ⚠ A NEW TEXT SEGMENT MEANS A NEW ROUND — something (a tool call, a think) came between, so this
            // is the start of a new markdown block and `content` needs the blank line the server inserts.
            // Without it the client's copy stayed welded (`findings**Good`, `****`) while the server's was
            // clean, and the 🔊 button speaks the CLIENT's copy — so the heading fix only took effect after a
            // reload. It also desynced the clip cache: piece text is the cache key, so the two copies cut into
            // different pieces and a replay after reload re-rendered every one as a different take.
            // See lib/answerBlock.ts; the parity test is test/unit/answer-block-join.test.mjs.
            const startsNewBlock = last?.type !== 'text'
            if (!startsNewBlock) segs[segs.length - 1] = { type: 'text', text: last.text + evt.text }
            else segs.push({ type: 'text', text: evt.text })
            const join = startsNewBlock ? answerBlockJoin(m.content) : ''
            return { ...m, content: m.content + join + evt.text, segments: segs }
          })
        } else if (evt.type === 'reasoning') {
          note(null)
          // keep the flat reasoning (non-interleaved replies + export) AND weave it into the
          // ordered segments so a tool-using reply shows think→tool→think→answer in real order
          update((m) => {
            const segs = (m.segments || []).slice()
            const last = segs[segs.length - 1]
            if (last?.type === 'reasoning') segs[segs.length - 1] = { type: 'reasoning', text: last.text + evt.text }
            else segs.push({ type: 'reasoning', text: evt.text })
            return { ...m, reasoning: (m.reasoning || '') + evt.text, segments: segs }
          })
        } else if (evt.type === 'answer_superseded') {
          // ⚠ The model RETRACTED its answer mid-stream. Anything already voiced cannot be recalled, but
          // nothing more from that draft may be spoken — so the queue is abandoned and the streamer reset.
          // This is the honest limit of speaking eagerly, and it is why drafts are a named hazard.
          if (speakLiveRef.current) { stopLiveSpeech(); liveRef.current.streamer = null }
          // a thinking model restarted its answer mid-stream: the run so far is discarded output.
          // Drop it from the live bubble (content + trailing text segment) and stash it as a
          // `draft` segment — preserved for inspection, but not shown as the answer. reasoning is
          // untouched (drafts aren't thinking). On reload the server sends the same clean split.
          update((m) => {
            const draft = evt.text || ''
            const content = draft && m.content.endsWith(draft) ? m.content.slice(0, -draft.length) : m.content
            const segs = (m.segments || []).slice()
            for (let k = segs.length - 1; k >= 0; k--) {
              if (segs[k].type === 'text') {
                const t = segs[k] as { type: 'text'; text: string }
                if (draft && t.text.endsWith(draft)) {
                  const rest = t.text.slice(0, t.text.length - draft.length)
                  if (rest) segs[k] = { type: 'text', text: rest }
                  else segs.splice(k, 1)
                }
                break
              }
            }
            if (draft) segs.push({ type: 'draft', text: draft })
            return { ...m, content, segments: segs }
          })
        } else if (evt.type === 'interaction') {
          // runtime-generated narration ("🔎 Searching…") — a LIVE-only status shown WHILE the work
          // runs (via the transient note line), then cleared on the tool result / next content. It is
          // NOT a persisted segment: once the tool row lands, the narration is redundant (Ote 2026-07-29).
          note(`${evt.icon ? evt.icon + ' ' : ''}${evt.text}`)
        } else if (evt.type === 'vision') {
          // The relay described one image. This is EVIDENCE, not narration: it lands on the USER
          // message that carried the image (not the assistant reply), because that is where it is
          // stored server-side and where it must reappear after a reload.
          const { messageId, index, description, model } = evt
          setMessages((prev) => prev.map((m) => {
            if (m.id !== messageId) return m
            const next = (m.imageDescriptions || []).slice()
            next[index] = { text: description, model: model ?? null, at: null }
            for (let k = 0; k < next.length; k++) if (!next[k]) next[k] = { text: '', model: null, at: null } // keep it index-aligned if events arrive out of order
            return { ...m, imageDescriptions: next }
          }))
        } else if (evt.type === 'status') {
          if (evt.phase === 'summarizing') note('Summarizing earlier messages…')
          else if (evt.phase === 'agent_continue') note('Continuing the tool chain…')
          else if (evt.phase === 'steer_interrupt') note('Reacting to your message…')
          else if (evt.phase === 'skill') note(`Operating as the "${evt.name || evt.skill}" skill…`)
          else if (evt.phase === 'skill_missing') note('The bound skill is not installed — replying normally…')
          // Two DIFFERENT failures, and they need different words: the prompt not fitting (oldest content
          // gets dropped) vs the prompt fitting with no room left to answer in (the reply stops
          // mid-sentence, silently). Ote hit the second one and nothing told him.
          // Context usage — emitted EVERY turn, not only when something is wrong. Deliberately does
          // not call note(): it is standing state for the meter, not a transient status line.
          else if (evt.phase === 'context_usage') {
            setCtxUsage({
              window: evt.window ?? null,
              used: evt.used ?? 0,
              free: evt.free ?? null,
              usedPct: evt.usedPct ?? null,
              detail: !!evt.detail,
              categories: evt.categories,
              parts: evt.parts,
            })
          }
          else if (evt.phase === 'context_overflow') {
            // Standing state for the turn, not a progress line — see the ctxWarn declaration.
            if (viewing()) {
              setCtxWarn(evt.tooBig
                ? `The conversation (~${Math.round((evt.estimate || 0) / 1000)}k tokens) exceeds this model's ${Math.round((evt.window || 0) / 1000)}k context window — the oldest content may be ignored.`
                : `Only ~${evt.headroom} tokens left of this model's ${Math.round((evt.window || 0) / 1000)}k window — the reply may be cut off. Turn tools off, or use a model with a bigger window.`)
            }
          }
        } else if (evt.type === 'tool_call') {
          note(null)
          update((m) => ({
            ...m,
            tools: [...(m.tools || []), { id: evt.id, name: evt.name, args: evt.arguments }],
            segments: [...(m.segments || []), { type: 'tool', id: evt.id, name: evt.name, args: evt.arguments }],
          }))
        } else if (evt.type === 'tool_result') {
          note(null) // the tool finished — clear its live "Searching…/Reading…" narration
          update((m) => {
            const tools = (m.tools || []).slice()
            // attach result to the matching call (by id, else the last un-resolved with same name)
            let idx = evt.id ? tools.findIndex((t) => t.id === evt.id) : -1
            if (idx === -1) idx = tools.map((t) => t.name).lastIndexOf(evt.name)
            if (idx >= 0) tools[idx] = { ...tools[idx], result: evt.result }
            const segments = (m.segments || []).slice()
            let sIdx = evt.id ? segments.findIndex((s) => s.type === 'tool' && s.id === evt.id) : -1
            if (sIdx === -1) sIdx = segments.map((s) => (s.type === 'tool' ? s.name : '')).lastIndexOf(evt.name)
            if (sIdx >= 0 && segments[sIdx].type === 'tool') segments[sIdx] = { ...(segments[sIdx] as { type: 'tool'; id?: string; name: string; args?: unknown }), result: evt.result }
            return { ...m, tools, segments }
          })
        } else if (evt.type === 'steered') {
          // a steer landed in the running turn — weave it inline on the rail (👤 marker),
          // where the server injected it, and clear the pending "steering…" note
          note(null)
          setSteerPending((n) => Math.max(0, n - 1))
          update((m) => ({ ...m, segments: [...(m.segments || []), { type: 'steer', text: evt.text }] }))
        } else if (evt.type === 'error') {
          // The server refused because this conversation is already generating (it is the
          // authority — our `sending` flag is per-tab and a reload/second tab loses it). Don't
          // show a red bar: hand it back so the caller can fold the text into the running reply
          // as a steer, which is what the user meant by typing while a reply streamed.
          if (evt.code === 'already_generating') refusal = evt.code
          else update((m) => ({ ...m, error: evt.message || evt.code || 'error' }))
        } else if (evt.type === 'done') {
          // the model rides on `done` so the fresh reply's stats can name its generator
          // (mid-conversation model switches: each reply reports its own); same for the
          // skill it ran as — the 🧩 chip shows live, no reload needed
          update((m) => ({ ...m, pending: false, id: evt.messageId, metrics: evt.metrics, model: evt.model ?? m.model, skill: evt.skill ?? m.skill }))
          setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, title: evt.title } : c)))
          void refreshBudget() // throttled — keeps the low-budget warning honest as tokens burn
        }
      }
    } catch (e) {
      // an intentional stop (Stop button / cancel-on-leave) is NOT an error — the backend
      // saved the partial; leave it clean so the chat reopens with Regenerate, not a red bar
      if (!ctrl.signal.aborted) update((m) => ({ ...m, error: (e as Error)?.message || 'stream failed' }))
    } finally {
      // ANSWER WITH SPEAK: the stream is over, so drain whatever the streamer is still holding. Without
      // this, the tail of a reply — anything that never reached the target size — would simply never be
      // spoken, and a short answer would be silent entirely.
      if (pauseTimer.current) { window.clearTimeout(pauseTimer.current); pauseTimer.current = null }
      if (speakLiveRef.current) {
        const L = liveRef.current
        const cid = speakLiveRef.current
        if (L.streamer) for (const piece of L.streamer.flush()) enqueueLive(cid, piece)
        L.streamer = null
        speakLiveRef.current = null
      }
      update((m) => ({ ...m, pending: false }))
      genStreams.delete(convId)
      setGenIds((prev) => prev.filter((id) => id !== convId))
      note(null)
      if (viewing()) setSteerPending(0) // generation ended — any un-echoed steer won't land now
    }
    return refusal
  }, [scrollToBottom, refreshBudget, enqueueLive, stopLiveSpeech])

  const TEXT_EXT = /\.(txt|md|markdown|csv|json|xml|ya?ml|html?|log|js|ts|tsx|jsx|py|java|c|cpp|cs|go|rs|sh|sql)$/i
  const DOC_EXT = /\.(pdf|docx|xlsx|xls|ods)$/i
  // image detection by MIME *or* extension — HEIC and friends often arrive with an EMPTY
  // file.type, which used to dump them into the document branch with a nonsense
  // "supported: pdf, docx…" error instead of a clear image-format message
  const IMG_EXT = /\.(png|jpe?g|webp|gif|bmp|avif|svg|heic|heif|tiff?)$/i
  const isImageFile = (f: File) => f.type.startsWith('image/') || IMG_EXT.test(f.name)
  const onPickFiles = useCallback(async (files: FileList | File[] | null) => {
    if (!files || !files.length) return
    setError(null)
    try {
      const list = [...files]
      // images -> thumbnails (resized + re-encoded to WebP client-side, original
      // format remembered as metadata; clear error if undecodable)
      const imgs = list.filter(isImageFile).slice(0, 4 - attachments.length)
      const prepped = await Promise.all(imgs.map((f) => prepareImage(f)))
      if (prepped.length) setAttachments((prev) => [...prev, ...prepped].slice(0, 4))
      // documents -> text read here (plain) or shipped as data URL (pdf/office, extracted server-side)
      const docs: OutgoingFile[] = []
      for (const f of list.filter((f) => !isImageFile(f)).slice(0, 4 - docAttachments.length)) {
        if (f.size > 10 * 1024 * 1024) throw new Error(`'${f.name}' is over 10MB`)
        if (TEXT_EXT.test(f.name) || f.type.startsWith('text/')) {
          docs.push({ name: f.name, text: await f.text() })
        } else if (DOC_EXT.test(f.name)) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader()
            r.onload = () => resolve(String(r.result))
            r.onerror = () => reject(new Error(`Could not read '${f.name}'`))
            r.readAsDataURL(f)
          })
          docs.push({ name: f.name, dataUrl })
        } else {
          throw new Error(`'${f.name}' — unsupported type (images, pdf, docx, xlsx/xls/ods/csv, and text files)`)
        }
      }
      if (docs.length) setDocAttachments((prev) => [...prev, ...docs].slice(0, 4))
    } catch (e) {
      setError((e as Error)?.message || 'Could not read file')
    }
    if (fileInputRef.current) fileInputRef.current.value = '' // re-picking the same file must retrigger
  }, [attachments.length, docAttachments.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Drag & drop anywhere on the chat + paste an image from the clipboard — both land
  // in the same attachment pipeline as the 📎 button (images AND documents).
  const [dragOver, setDragOver] = useState(false)
  useEffect(() => {
    let depth = 0 // dragenter/dragleave fire per nested element — count to avoid flicker
    const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types?.includes('Files'))
    // These handlers are on WINDOW so drop/paste works anywhere on the chat. But an
    // overlay (Options/feedback modal) or another input (feedback box, rename, search,
    // download filename) sits on top of the chat and must own its OWN paste/drop —
    // otherwise the image lands in the chat composer too. Bail when the event belongs there.
    const notForChat = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      if (!el?.closest) return false
      if (el.closest('.chat-options-overlay, .chat-lightbox')) return true // inside a modal over the chat
      const field = el.closest('input, textarea, [contenteditable="true"]')
      return Boolean(field) && field !== composerRef.current // a different field owns it
    }
    const onDragEnter = (e: DragEvent) => { if (!hasFiles(e) || notForChat(e.target)) return; e.preventDefault(); depth++; setDragOver(true) }
    const onDragOver = (e: DragEvent) => { if (!hasFiles(e) || notForChat(e.target)) return; e.preventDefault() }
    const onDragLeave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (depth === 0) setDragOver(false) }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e) || notForChat(e.target)) return
      e.preventDefault()
      depth = 0
      setDragOver(false)
      void onPickFiles([...(e.dataTransfer?.files || [])]) // images AND documents — it sorts them out
    }
    const onPaste = (e: ClipboardEvent) => {
      if (notForChat(e.target)) return // pasting into the feedback box / another field — not the chat
      const files = [...(e.clipboardData?.items || [])]
        .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
        .map((i) => i.getAsFile())
        .filter((f): f is File => Boolean(f))
      if (files.length) { e.preventDefault(); void onPickFiles(files) }
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('paste', onPaste)
    }
  }, [onPickFiles])

  // HumanInteraction (D2, Cowork parity): while a question is pending in THIS chat, the
  // typed message IS the answer — no special UI to learn. Consumes the composer text and
  // resolves the held question; returns true when it did (callers then stop). Wired into
  // ALL the composer's exits: handleSend, submitSteer, and the Enter key (the turn that
  // asked is still `sending`, so Enter would otherwise steer or fall through to drafting).
  const submitTypedAnswer = useCallback(async () => {
    const ask = pendingAskRef.current
    const cid = activeIdRef.current
    if (!ask || !cid || ask.conversationId !== cid || !input.trim()) return false
    const freeText = input.trim()
    setInput('')
    setDraft(cid, '')
    setPendingAsk(null) // optimistic — the resume is immediate server-side
    lastEventAtRef.current = Date.now() // same reason as answerAsk: don't inherit the human's think-time as a stall
    try { await answerConversationInteraction(cid, ask.id, { freeText }) } catch { /* already resolved elsewhere */ }
    return true
  }, [input])

  const handleSend = useCallback(async () => {
    if (await submitTypedAnswer()) return // a pending question consumed the text (D2)
    // /skill-name invocation: a leading slash token matching an installed skill binds it for
    // THIS send only (the ⚙ conversation binding is untouched). No match = plain text.
    const text = input.trim() // no longer rewritten: the /skill token stays in the message (see below)
    let skillOnce: string | undefined
    const slash = /^\/([a-z0-9.-]+)\s+([\s\S]+)$/.exec(text)
    if (slash && canSelect && slashOn) {
      const tok = slash[1].toLowerCase()
      const hit = chatSkills.find((s) => s.id === tok || s.id === `skill.${tok}` || s.name.toLowerCase() === tok)
      // KEEP THE INVOCATION IN THE MESSAGE (Ote's ask: "shouldnt the /research also go as the message? so it
      // have clue that user call for skill. as claude also have this"). It used to be stripped —
      // `text = slash[2]` — so the transcript lost any trace that a skill was asked for, and the model never
      // saw that the user had explicitly requested research rather than chat. Both readers benefit: the
      // transcript shows what was typed, and the model gets the intent in the user's own words.
      if (hit) skillOnce = hit.id
    }
    const images = attachments.map((a) => a.url)
    const imagesMeta: ImageMeta[] = attachments.map((a) => ({ orig: a.orig, name: a.name, bytes: a.bytes }))
    const files = docAttachments
    if ((!text && !images.length && !files.length) || sending) return
    if (genIdsRef.current.length >= (modelsInfoRef.current?.backgroundMaxConcurrent ?? 2)) return // at the concurrency cap — button shows why
    setError(null)
    setInput('')
    setDraft(activeId ?? NEW_DRAFT_KEY, '') // the draft was just sent — clear its bucket
    dropPendingDraftFold() // the send consumes the server draft too — nothing stale may refold
    setAttachments([])
    setDocAttachments([])

    // create the conversation lazily on first send
    let convId = activeId
    if (convId == null) {
      try {
        // always send settings (backend filters: members get only view fields)
        const body = canSelect && selectedModel ? { model: selectedModel, settings } : { settings }
        const { conversation } = await createConversation(body)
        convId = conversation.id
        setActiveId(conversation.id)
        activeIdRef.current = conversation.id // sync now so the stream mirrors into this fresh chat
        setConversations((prev) => [conversation, ...prev])
        // reflect the new chat in the URL without re-loading it (we're about to stream)
        skipUrlLoad.current = true
        navigate(`/chat/${conversation.id}`, { replace: true })
      } catch (e) {
        setError((e as Error)?.message || 'Failed to start conversation')
        return
      }
    }

    setMessages((prev) => [
      ...prev,
      {
        role: 'user', content: text,
        images: images.length ? images : undefined,
        imagesMeta: images.length ? imagesMeta : undefined,
        files: files.length ? files.map((f) => ({ name: f.name })) : undefined,
      },
      { role: 'assistant', content: '', pending: true },
    ])
    const id = convId
    // bump this conversation to the TOP of the sidebar — its last activity is now. Mirrors the
    // server's updated_at bump on reply so the list reorders LIVE (not only after a reload); a
    // brand-new chat was already prepended above, so this is a no-op when it's already first.
    setConversations((prev) => {
      const i = prev.findIndex((c) => c.id === id)
      if (i <= 0) return prev
      return [{ ...prev[i], updatedAt: new Date().toISOString() }, ...prev.slice(0, i), ...prev.slice(i + 1)]
    })
    // Arm auto-speak for THIS turn from the pref + mute state, so flipping either mid-reply cannot
    // half-apply. A new turn also interrupts whatever the last one was still saying.
    //
    // ⚠ SENDING MUST CLEAR *BOTH* SPEECH QUEUES, and only stopLiveSpeech() was called here. Ote, 2026-08-06:
    // *"where user start new promtp while old one still on queue. old queue should be clear, so new message dont
    // have to wait for old quere to go until the new mesasge start to speak"*.
    // There are two INDEPENDENT queues and they had different stops:
    //   • answer-with-speak — liveRef, cleared by stopLiveSpeech()
    //   • the per-message 🔊 button — its own session counter, controller and play loop in speakReply()
    // stopLiveSpeech() pauses the shared <audio> element, so the CURRENT clip went quiet and it looked handled —
    // but it never bumped speakSessionRef or aborted speakCtrlRef, so `live()` inside speakReply stayed true and
    // that loop carried on fetching and playing the NEXT pieces. The new turn's speech then queued behind the
    // abandoned one, on the same GPU, which is exactly what he watched ("8 pieces queued" during a new reply).
    // Silencing the element is not stopping the queue; the queue is the loop.
    //
    // Deliberately fixed HERE and not inside stopLiveSpeech: the other caller is the answer_superseded path,
    // where a manual press may be reading a DIFFERENT, older message that has nothing to do with the retracted
    // draft. Sending is the one moment we know the listener has moved on from everything.
    stopLiveSpeech()
    stopSpeaking()
    speakLiveRef.current = (chatPrefsRef.current?.autoSpeak && !isChannelMuted('speech') && settings.stream) ? id : null
    // PRE-WARM (Ote): load the voice model while the chat model is still thinking, so the 3.6-7s load is not
    // paid on the first spoken piece — the one piece anybody is actually waiting for. Not awaited, ever.
    if (speakLiveRef.current) warmSpeech()
    const refused = await consumeStream((sig) => sendMessage(id, text, sig, settings.stream, images, files, imagesMeta, skillOnce), id)
    if (refused === 'already_generating') {
      // This tab thought the chat was idle; the server knows a reply is still streaming (another
      // tab, or this one after a reload — `sending` is per-tab state). The server refuses BEFORE
      // persisting anything, so nothing was written: drop the optimistic pair and give the text
      // back rather than leaving a phantom exchange on screen.
      // Deliberately NOT auto-steered: a steer echoes on the stream that is running, which this
      // tab is not watching, so the text would vanish into an invisible reply. When the tab DOES
      // know a reply is streaming, Enter already steers (see the composer key handler) — that is
      // the path for "fold this in", and it shows the user what happened.
      setMessages((prev) => {
        const n = prev.length
        const mine = n >= 2 && prev[n - 1]?.role === 'assistant' && !prev[n - 1]?.id && !prev[n - 1]?.content
          && prev[n - 2]?.role === 'user' && prev[n - 2]?.content === text
        return mine ? prev.slice(0, n - 2) : prev
      })
      setInput(text)
      setDraft(id, text)
      setError('This chat is still replying — it may be open in another tab. Wait for it to finish, or press Stop there.')
      return
    }
    // `submitTypedAnswer` was missing here while the neighbouring submitSteer (which calls it for the same
    // reason) does list it — an inconsistency, not a decision. It is a stable useCallback declared above, so
    // listing it is free and keeps handleSend from closing over a stale HumanInteraction answer handler.
  }, [input, attachments, docAttachments, sending, activeId, canSelect, selectedModel, settings, consumeStream, navigate, dropPendingDraftFold, chatSkills, slashOn, submitTypedAnswer, stopLiveSpeech])

  const handleStop = useCallback(() => {
    const id = activeIdRef.current
    if (id) genStreams.get(id)?.ctrl.abort()
  }, [])

  // Steer the in-flight reply with the composer text. Optimistically clears the box and
  // shows a "steering…" note; the steer renders inline once the server echoes `steered`
  // on the open stream. On error the draft is restored.
  const submitSteer = useCallback(async () => {
    if (await submitTypedAnswer()) return // a pending question consumed the text (D2), not a steer
    const text = input.trim()
    const id = activeIdRef.current
    if (!text || !id) return
    setError(null)
    setInput('')
    setDraft(id, '')
    dropPendingDraftFold() // the steer consumed the text — a stale fold must not resurrect it
    setSteerPending((n) => n + 1)
    try {
      await steerConversation(id, text)
      // the steer went through — clear any earlier-folded server copy of this text
      void updateConversation(id, { draft: '' }).catch(() => { /* best-effort */ })
    } catch (e) {
      setSteerPending((n) => Math.max(0, n - 1))
      setInput(text); setDraft(id, text) // don't lose the draft
      setError((e as Error)?.message || 'Could not steer the reply')
    }
  }, [input, dropPendingDraftFold, submitTypedAnswer])

  // per-message view toggle (markdown default on, stats default hidden)
  const toggleMsgView = useCallback((i: number, field: 'viewMarkdown' | 'viewStats') => {
    setMessages((prev) => prev.map((m, idx) =>
      idx === i ? { ...m, [field]: !(m[field] ?? (field === 'viewMarkdown')) } : m))
  }, [])

  // Long-reply expand is PER SEGMENT (seg = the segment index, or -1 for a plain body): a reply
  // can carry several long segments, and expanding one must not expand the others (Ote's report,
  // chat c2c2b3b1 — one "Show full reply" click expanded every block at once).
  const toggleExpanded = useCallback((i: number, seg: number) => {
    setMessages((prev) => prev.map((m, idx) => {
      if (idx !== i) return m
      const cur = m.viewExpanded ?? []
      return { ...m, viewExpanded: cur.includes(seg) ? cur.filter((x) => x !== seg) : [...cur, seg] }
    }))
  }, [])

  // model=undefined re-runs on the same model; a model id retries on THAT model
  // (the conversation switches to it — server-enforced select_model).
  const handleRegenerate = useCallback(async (model?: string) => {
    if (sending || activeId == null) return
    setError(null)
    if (model) {
      setSelectedModel(model)
      setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, model } : c)))
    }
    // drop the trailing assistant reply(ies) and add a fresh pending one
    setMessages((prev) => {
      const next = prev.slice()
      while (next.length && next[next.length - 1].role === 'assistant') next.pop()
      next.push({ role: 'assistant', content: '', pending: true })
      return next
    })
    await consumeStream((sig) => regenerate(activeId, sig, settings.stream, model), activeId)
  }, [sending, activeId, settings, consumeStream])

  // per-message copy-to-clipboard with brief ✓ feedback
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const copyMessage = useCallback(async (i: number, text: string) => {
    if (await copyToClipboard(text)) {
      setCopiedIdx(i)
      setTimeout(() => setCopiedIdx((cur) => (cur === i ? null : cur)), 1500)
    } else {
      setError('Could not copy to clipboard')
    }
  }, [])

  // THE VOICE (MM Arc / Audio phase POC) — synthesize one reply and play it.
  //
  // Playback uses a single <audio> element held in a ref rather than one per message: only one thing
  // can be speaking at a time, and pressing 🔊 on a second reply should REPLACE the first, not talk
  // over it. Object URLs are revoked when superseded so a long session cannot leak blobs.
  const [speaking, setSpeaking] = useState<{ id: string | null }>({ id: null })
  // Mirrors the `speech` channel's mute state so the 🔊 button can SAY it is muted and offer the way back.
  const [speechMuted, setSpeechMuted] = useState(() => isChannelMuted('speech'))
  // Elapsed seconds while synthesizing. A long reply can take 30s+ on a busy card, and a static
  // '🔊 …' is indistinguishable from a hang — the number is the difference between waiting and
  // wondering whether to press it again (which would queue a second render).
  const [speakSecs, setSpeakSecs] = useState(0)
  // ⚠ THE 25 SECONDS OF SILENCE THAT READ AS "BROKEN". The sidecar unloads after 15 minutes idle, so the first
  // press after a break pays a model load — measured 24.9s from cold disk. Ote pressed 🔊, heard nothing for 27
  // seconds, and reported *"there nothing speaking as i tested"*; the clip arrived fine, just long after he had
  // given up. His call on the fix: *"no need [to pre-warm], 'loading the voice' button state, is ok"* — so the
  // BUTTON says what is happening instead of the app pre-loading a 3.5GB model speculatively on a 2x16GB box.
  // True only until the FIRST piece is ready; after that the fetcher runs ahead of playback.
  const [speakLoading, setSpeakLoading] = useState(false)
  const unsubVolRef = useRef<(() => void) | null>(null) // live volume subscription for the playing clip
  // Bumping this invalidates an in-flight chunk session, so a second press cannot play over the first.
  const speakSessionRef = useRef(0)
  const stopSpeaking = useCallback((opts: { keepSession?: boolean } = {}) => {
    if (!opts.keepSession) speakSessionRef.current += 1
    const el = audioRef.current
    if (el) { el.onended = null; el.onerror = null; el.pause(); el.src = '' }
    if (unsubVolRef.current) { unsubVolRef.current(); unsubVolRef.current = null }
    setSpeaking({ id: null })
    setSpeakSecs(0)
    // ⚠ CLEAR THE LOADING FLAG HERE TOO, not only in speakReply's finally. Stop can land while the first piece
    // is still rendering, and `speakLoading` left true meant the NEXT press showed "⏳ Loading the voice" from
    // the previous attempt before it had loaded anything. Found by the UI drive: after a Stop the button read
    // "⏳ Loading the voice · 0s", and the check waved it through because its assertion was only !/Stop/ — a
    // label that is wrong in a NEW way still satisfies "not Stop". Every piece of state a press sets, the stop
    // has to unset.
    setSpeakLoading(false)
    // ⚠ AND HANG UP ON THE RENDERS ALREADY IN FLIGHT — the 🔊 path fetches up to three pieces ahead, so Stop
    // lands with renders occupying the GPU. `live()` going false only stops this code from USING them.
    if (speakCtrlRef.current) { speakCtrlRef.current.abort(); speakCtrlRef.current = null }
  }, [])
  const speakCtrlRef = useRef<AbortController | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  // CHUNK-AND-PLAY (Ote: "do that 'A · Chunk-and-play' first, i want to see improvement").
  //
  // A long reply used to render whole before a single sample played — ~46s of silence for a 1645-character
  // answer. Now the server splits it at sentence boundaries and this fetches piece 0, starts it, and keeps
  // fetching AHEAD of playback. OmniVoice renders about twice as fast as speech, so the queue stays full
  // and first sound lands in ~3s. The seams sit where a speaker would pause anyway, so they are inaudible.
  //
  // The whole thing is one cancellable session: pressing 🔊 on another message, or muting, abandons the
  // in-flight fetches instead of letting a stale queue play over the new one.
  // `content` is the reply's RAW markdown, passed in by the button rather than looked up from state: the pieces
  // are cut from it and their offsets are what the highlight matches against, so it must be the same string the
  // message is rendered from — and a ref lookup here would be one more thing that can go stale.
  const speakReply = useCallback(async (messageId: string, content: string) => {
    const cid = activeIdRef.current
    if (!cid) return
    // ⚠ MUTED IS NOT A REFUSAL HERE, AND THAT IS A UX FIX, NOT A LOOSENED RULE.
    //
    // Ote, on the inline speaker icon that appears while a reply is being read: *"when click it mute, and when
    // mute it stop, and cannot play again since stop, and user have to open option and unmute it. is this
    // realluy a good ux?"* — no, and it was two faults compounding:
    //   1. that icon is a one-click, ACCOUNT-WIDE, cross-device setting change, sitting in a transient
    //      per-message toolbar directly beside a Stop button that already does the harmless version; and
    //   2. muting stops playback, which unmounts the very control that would have undone it (it renders only
    //      while `speaking.id === m.id`). The affordance to recover deleted itself, and all that was left was
    //      a red error pointing at a settings page.
    //
    // So the 🔊 button — present on EVERY assistant reply, and never conditional on playback — becomes the way
    // back. It reads "🔇 Unmute & speak" while muted, which DECLARES the side effect before the click rather
    // than hiding it, and one press restores the last audible level and plays.
    //
    // The "muting skips the work" promise in Options → Sound still holds: auto-speak stays gated on the mute
    // (see speakLiveRef), so nothing is rendered automatically. Only an explicit press on a button that says
    // what it will do can override it — which is exactly what a person pressing "Speak" is asking for.
    if (isChannelMuted('speech')) toggleMute('speech')
    speakSessionRef.current += 1
    const session = speakSessionRef.current
    stopSpeaking({ keepSession: true })
    setSpeaking({ id: messageId })
    setSpeakSecs(0)
    setSpeakLoading(true)
    // AFTER the stopSpeaking() above, which aborts the PREVIOUS press's controller. Creating it earlier would
    // hand this session's controller to that abort and cancel the renders we are about to start.
    const ctrl = new AbortController()
    speakCtrlRef.current = ctrl
    const tick = window.setInterval(() => setSpeakSecs((n) => n + 1), 1000)
    const urls: string[] = []
    const live = () => speakSessionRef.current === session

    try {
      // ⚠ THE PIECES ARE PLANNED HERE, ON THE CLIENT — and that is what makes the highlight possible.
      //
      // Ote: *"i want to add text reading for 🔊button too. so i can see which part it reading, like the answer
      // with speak did"*. The reason it worked for answer-with-speak and not here was never the highlighter: the
      // two paths differed in WHERE THEY SPLIT.
      //   * answer-with-speak splits the RAW markdown on the client, so every piece carries {text, start, end} —
      //     source offsets, which is exactly what paintSpoken needs to find the words on screen.
      //   * this button asked the SERVER for chunk N, and the server splits NORMALISED text. Normalisation is
      //     not length-preserving (emoji dropped, links rewritten, tables removed), so the offsets are gone and
      //     the client only ever received opaque blobs.
      // So it now uses the SAME streamer as the live path. One splitter for both paths, which also retires a
      // standing drift risk: two cutters that must agree is the shape that produced the "nobody normalised"
      // bug. `firstTarget: 70` comes along with it — Ote: *"make it start abit faster is ok, but no need to
      // adjuxt it too much"* — and 70 is not a new guess, it is what the live path has been using.
      // ⚠ Deliberate difference from the old server path: chat.speechMaxChars no longer clips a very long
      // reply, because that cap lives in the server's plan(). This matches the live path, which never clipped.
      const streamer = createSpeechStreamer({ target: 600, firstTarget: 70 })
      const raw = String(content || '')
      const pieces = [...streamer.push(raw), ...streamer.flush()]
      if (!pieces.length) { setError('That message has nothing to read aloud.'); return }
      const total = pieces.length

      // Queue of ready blobs; the player pulls from it and the fetcher pushes ahead of it.
      let nextEl: HTMLAudioElement | null = null
      const ready: (Blob | null)[] = new Array(total).fill(null)
      const skipped: Record<string, number> = {}
      let fetching = 0
      const fetchNext = () => {
        if (!live() || fetching >= total) return
        const i = fetching++
        void speakText(cid, pieces[i].text, ctrl.signal)
          .then((r) => {
            if (!live()) return
            for (const [k, n] of Object.entries(r.omitted || {})) skipped[k] = (skipped[k] || 0) + n
            // ⚠ A 204 IS A SILENCE, NOT A FAILURE — a piece that was only a table has nothing to say. An empty
            // blob keeps the piece in sequence so the NEXT one still plays; dropping the slot would desync the
            // pieces from their offsets and the highlight would point at the wrong sentence.
            ready[i] = r.blob ?? new Blob([], { type: 'audio/wav' })
            fetchNext()
          })
          // One bad piece must not kill the rest: mark it and carry on, so a hiccup costs a sentence
          // rather than the whole reply.
          .catch(() => { if (live()) { ready[i] = new Blob([], { type: 'audio/wav' }); fetchNext() } })
      }
      // READ-AHEAD OF TWO, Ote's call 2026-08-06 after seeing what Stop wastes. Every piece in flight when Stop
      // lands is GPU time spent on audio nobody will hear — the client and server now hang up, but the frame
      // already inside the sidecar runs to completion, so the exposure is (pieces started) × (one frame).
      // Three-ahead bought a little more resilience against a slow render overtaking playback; two is enough
      // for that (OmniVoice renders at roughly twice playback speed) and cuts the worst-case waste by a third.
      fetchNext()   // piece 0 — the one the loading state is waiting on
      fetchNext()   // one ahead: enough buffer, without queueing the reply at once

      // GAPLESS-ISH PLAYBACK. Reusing ONE element and reassigning .src forces a load between every chunk,
      // which adds a browser-side gap on top of the engine's padding — together that is what Ote heard as
      // "it split by section". Each chunk now gets its OWN element, preloaded while the previous one is
      // still playing, so starting it is immediate. (The engine's ~220ms edge padding is trimmed in the
      // sidecar; this removes the other half.)
      const elFor = (blob: Blob) => {
        const url = URL.createObjectURL(blob)
        urls.push(url)
        const a = new Audio()
        a.preload = 'auto'
        a.src = url
        a.volume = gainOf('speech')
        applyPlaybackRate(a)
        a.load()
        return a
      }
      if (unsubVolRef.current) unsubVolRef.current()
      unsubVolRef.current = onSoundChange(() => {
        const a = audioRef.current
        if (a) { a.volume = gainOf('speech'); applyPlaybackRate(a) }
        if (isChannelMuted('speech')) { speakSessionRef.current += 1; stopSpeaking() }
      })

      for (let i = 0; i < total; i++) {
        // Wait for this piece. It is normally already here — the fetcher runs ahead — but a slow render
        // or a cold model can overtake playback, and waiting is correct where dropping would not be.
        while (live() && !ready[i]) await new Promise((r) => setTimeout(r, 120))
        if (!live()) return
        // The wait is over for the piece the user is actually waiting on, so the button stops saying "loading".
        // Cleared even for an empty/failed first piece: the load is what it was reporting, and that is done.
        if (i === 0) setSpeakLoading(false)
        const blob = ready[i]
        if (!blob || blob.size === 0) continue   // a failed piece: skip its sentence, keep the reply
        const el = nextEl ?? elFor(blob)
        nextEl = null
        audioRef.current = el
        // ⚠ HIGHLIGHT ON PLAY, NOT ON FETCH — the same rule the live path learned. Pieces are fetched ahead of
        // playback, so the piece being RENDERED is usually one or two ahead of the piece being HEARD; lighting
        // up at fetch time would point at text nobody is listening to yet. Painted just BEFORE play() because
        // play() resolves a few milliseconds later, and the live drive caught that gap as a frame with the
        // status already showing and nothing lit.
        paintSpoken(pieces[i])
        try {
          await el.play()
        } catch {
          clearSpoken()
          setError('The audio was generated but the browser would not play it — check tab audio permissions.')
          return
        }
        // Build and preload the FOLLOWING element while this one plays — that is what removes the load gap.
        if (i + 1 < total && ready[i + 1]) nextEl = elFor(ready[i + 1] as Blob)
        await new Promise<void>((resolve) => {
          const done = () => { el.onended = null; el.onerror = null; resolve() }
          el.onended = done
          el.onerror = done
        })
        // The next piece repaints; the last one has to clean up after itself or the highlight outlives the audio.
        if (live()) clearSpoken()
        if (!live()) return
        fetchNext()   // one finished playing, so pull one more forward
      }
      // ⚠ ONLY REPORT WHAT THE EAR WAS NOT TOLD. Tables and code blocks now SAY they are there ("Here, a table
      // in the message."), so repeating that on screen is noise. Images and formulas are still dropped in
      // silence, so those are the ones worth a line.
      const silent = Object.entries(skipped).filter(([k, n]) => n > 0 && k !== 'tables' && k !== 'codeBlocks')
      if (silent.length && live()) {
        setError(`Not read aloud: ${silent.map(([k, n]) => `${n} ${k === 'math' ? (n === 1 ? 'formula' : 'formulas') : k === 'images' ? (n === 1 ? 'image' : 'images') : k}`).join(', ')}.`)
      }
    } catch (e) {
      if (live()) setError(e instanceof Error ? e.message : 'Speech synthesis failed')
    } finally {
      clearInterval(tick)
      for (const u of urls) URL.revokeObjectURL(u)
      clearSpoken()   // never leave a sentence lit after the audio has stopped, on ANY exit path
      if (speakSessionRef.current === session) {
        setSpeaking({ id: null })
        setSpeakSecs(0)
        setSpeakLoading(false)
      }
    }
  }, [stopSpeaking])

  useEffect(() => () => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    if (unsubVolRef.current) unsubVolRef.current()
  }, [])

  const onComposerKey = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // /skill popover keyboard first — it owns the arrows and Tab only while it is open, so nothing else in the
    // composer changes behaviour. Tab SELECTS (Ote's ask); Enter selects too, because with a highlighted row on
    // screen Enter meaning "send /res as literal text" would be a trap. Escape dismisses without touching text.
    if (slashOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashActive((a) => (a + 1) % slashMatches.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashActive((a) => (a - 1 + slashMatches.length) % slashMatches.length); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        const hit = slashMatches[slashActive]
        if (hit) { e.preventDefault(); pickSlash(hit); return }
      }
      if (e.key === 'Escape') { e.preventDefault(); setSlashActive(0); setInput(''); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // a question is pending in THIS chat: Enter answers it with the typed text (D2) —
      // BEFORE the sending gate, because the turn that asked is still generating
      if (pendingAsk && pendingAsk.conversationId === activeIdRef.current && input.trim()) {
        e.preventDefault()
        void submitTypedAnswer()
        return
      }
      // while THIS chat is generating: if steering is on, Enter STEERS the in-flight reply;
      // otherwise let the user keep drafting (Enter falls through to a newline, sends when
      // the reply ends). Same drafting fall-through when the concurrency cap is reached.
      if (sending) {
        if (steerEnabled && input.trim()) { e.preventDefault(); void submitSteer() }
        return
      }
      if (atGenLimit) return
      e.preventDefault()
      void handleSend()
    }
  }, [handleSend, submitSteer, submitTypedAnswer, sending, atGenLimit, steerEnabled, input, pendingAsk,
    slashOpen, slashMatches, slashActive, pickSlash])

  const activeTitle = activeId != null
    ? (conversations.find((c) => c.id === activeId)?.title ?? 'Chat')
    : 'New chat'

  // One human-friendly "where am I" for feedback — the conversation NAME + model, never a
  // raw /chat/<uuid>. Both doors into the Feedback panel (the 📣 button and Options →
  // Feedback nav) read this same string so they can't disagree the way they used to.
  const feedbackOrigin = ['Chat', activeTitle, (canSelect ? selectedModel : modelsInfo?.defaultModel) || '']
    .filter(Boolean).join(' · ')

  // ---- edit a user message and re-run from that point ----
  const [editingMsg, setEditingMsg] = useState<{ index: number; id: string; draft: string } | null>(null)
  // freshly-sent turns have no id client-side — hydrate from the server before editing
  const startEdit = useCallback(async (i: number) => {
    if (activeId == null) return
    let msgs = messages
    if (!msgs[i]?.id) {
      try {
        const r = await getConversation(activeId)
        msgs = r.messages
        setMessages(r.messages)
      } catch { return }
    }
    const m = msgs[i]
    if (m?.id && m.role === 'user') setEditingMsg({ index: i, id: m.id, draft: m.content })
  }, [messages, activeId])
  const submitEdit = useCallback(async () => {
    if (!editingMsg || sending || activeId == null) return
    const { index, id, draft } = editingMsg
    const content = draft.trim()
    if (!content) return
    setEditingMsg(null)
    setError(null)
    setMessages((prev) => {
      const next = prev.slice(0, index + 1).map((m, i) => (i === index ? { ...m, content } : m))
      next.push({ role: 'assistant', content: '', pending: true })
      return next
    })
    await consumeStream((sig) => editMessage(activeId, id, content, sig, settings.stream), activeId)
  }, [editingMsg, sending, activeId, settings, consumeStream])

  // ---- export the open conversation (client-side; includes the persisted tool trace) ----
  const [showDownload, setShowDownload] = useState(false)
  // default filename: ols_chat_<YYYYMMDD-HHmmss> - <chat title>
  const exportName = (() => {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
    const name = (activeTitle || 'chat').replace(/[^\w -]+/g, '_').replace(/^[\s_]+|[\s_]+$/g, '').slice(0, 60) || 'chat'
    return `ols_chat_${ts} - ${name}`
  })()

  // Build the export payload for a given format — used by the download modal.
  // opts.embedImages (HTML only): inline the attached images as data URIs so the page
  // is fully self-contained and shows them exactly as in the chat. Turned off => a small
  // text-only page (just a "(N image attachment)" note). We embed data URIs rather than
  // produce MHTML because data-URI HTML opens in EVERY browser (MHTML doesn't render in
  // Firefox/Safari) and the images are already data URLs in our model.
  const buildExport = useCallback(async (format: ExportFormat, opts?: { embedImages?: boolean }): Promise<ExportBlob> => {
    const model = (canSelect ? selectedModel : modelsInfo?.defaultModel) || ''
    if (format === 'json') {
      return {
        content: JSON.stringify({ title: activeTitle, model, exportedAt: new Date().toISOString(), messages }, null, 2),
        mime: 'application/json', ext: 'json',
      }
    }
    if (format === 'html') {
      const embedImages = opts?.embedImages ?? true
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      // Render assistant markdown through the SAME pipeline as the live chat (ReactMarkdown
      // + remark-gfm), so headings/lists/tables/code render as formatted HTML instead of
      // raw markdown source — that was the "looks off vs the chat" gap. react-dom/server is
      // ~60KB gz, so load it lazily here (only on HTML export) instead of in the chat bundle.
      const { renderToStaticMarkup } = await import('react-dom/server')
      const md = (text: string) =>
        renderToStaticMarkup(<div className="chat-md"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: LinkNewTab }}>{text}</ReactMarkdown></div>)
      const toolHtml = (t: { name: string; args?: unknown; result?: string }) => {
        const detail = toolCallDetail(t.name, t.args)
        return `<details class="tool"><summary>🔧 ${esc(t.name)}${detail ? ` — ${esc(detail)}` : ''}</summary>${
          t.args !== undefined ? `<pre>args: ${esc(JSON.stringify(t.args))}</pre>` : ''
        }${t.result ? `<pre>${esc(String(t.result))}</pre>` : ''}</details>`
      }
      const imgHtml = (u: string, meta?: ImageMeta) =>
        /^data:image\//i.test(u) ? `<img src="${u}" alt="attached image" title="${esc(imgTitle(u, meta))}" />` : ''

      const parts: string[] = []
      for (const m of messages) {
        const who = m.role === 'user' ? 'You' : 'Assistant'
        const interleaved = m.role === 'assistant' && (m.segments?.some((s) => s.type === 'tool' || s.type === 'steer') ?? false)
        const hasReasoningSegments = m.segments?.some((s) => s.type === 'reasoning') ?? false
        const blocks: string[] = []
        // reasoning box — mirror the chat: suppress the top box only when the weave carries it
        if (m.reasoning && !(interleaved && hasReasoningSegments))
          blocks.push(`<details class="reason"><summary>💭 Reasoning</summary><pre>${esc(m.reasoning)}</pre></details>`)
        // flat tool trace (non-interleaved replies)
        if (!interleaved) for (const t of m.tools || []) blocks.push(toolHtml(t))
        // document attachments -> chips (extracted text isn't re-embedded; matches the chat)
        for (const f of m.files || []) blocks.push(`<div class="file-chip">📄 ${esc(f.name)}${f.note ? ` · ${esc(f.note)}` : ''}</div>`)
        // image attachments
        if (m.images?.length) {
          if (embedImages) {
            const imgs = m.images.map((u, ii) => imgHtml(u, m.imagesMeta?.[ii])).filter(Boolean).join('')
            if (imgs) blocks.push(`<div class="imgs">${imgs}</div>`)
          } else {
            blocks.push(`<p class="note">(${m.images.length} image attachment${m.images.length === 1 ? '' : 's'})</p>`)
          }
        }
        // body — interleaved weave (text/tool/reasoning in order) or a single bubble
        if (interleaved) {
          const weave = m.segments!.map((s) => {
            if (s.type === 'tool') return toolHtml(s)
            if (s.type === 'reasoning') return `<details class="reason"><summary>💭 Thought</summary><pre>${esc(s.text)}</pre></details>`
            if (s.type === 'steer') return `<div class="steer">👤 ${esc(s.text)}</div>`
            if (s.type === 'interaction') return '' // live-only narration — not part of the saved transcript/export
            if (s.type === 'draft') return '' // discarded output — preserved in data, not rendered as the answer
            return `<div class="body">${md(s.text || '')}</div>`
          })
          blocks.push(`<div class="weave">${weave.join('\n')}</div>`)
        } else {
          blocks.push(m.role === 'assistant'
            ? `<div class="body">${md(m.content || '')}</div>`
            : `<div class="body"><div class="usertext">${esc(m.content || '')}</div></div>`)
        }
        parts.push(`<section class="msg ${m.role}"><div class="role">${who}</div>${blocks.join('\n')}</section>`)
      }
      const content = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(activeTitle)}</title>
<style>
  :root{--bg:#f3efe7;--ink:#1f2430;--muted:#5f6676;--line:#d7cfbf;--panel-strong:#fffaf0;--accent-deep:#7d3115;--mint:#d9eadf}
  *{box-sizing:border-box}
  body{font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;max-width:900px;margin:0 auto;padding:32px 20px 64px;color:var(--ink);background:var(--bg)}
  h1.title{font-size:22px;margin:0 0 4px}
  .meta{color:var(--muted);font-size:13px;margin-bottom:24px}
  .msg{display:flex;flex-direction:column;gap:6px;margin:16px 0;max-width:100%}
  .msg.user{align-items:flex-end}.msg.assistant{align-items:flex-start}
  .role{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
  .body{line-height:1.6;font-size:15px;max-width:100%}
  .msg.user .body{max-width:80%;background:var(--mint);border:1px solid rgba(54,80,70,.18);border-radius:16px 16px 4px 16px;padding:12px 14px}
  .msg.assistant .body{width:100%;background:var(--panel-strong);border:1px solid var(--line);border-radius:4px 16px 16px 16px;padding:12px 14px}
  .usertext{white-space:pre-wrap;word-break:break-word}
  .imgs{display:flex;gap:6px;flex-wrap:wrap}
  .msg.user .imgs{justify-content:flex-end}
  .imgs img{max-width:220px;max-height:180px;border-radius:12px;border:1px solid var(--line);display:block}
  .note{color:var(--muted);font-size:13px;font-style:italic;margin:2px 0}
  .file-chip{display:inline-block;font-size:12px;color:var(--muted);background:rgba(0,0,0,.04);border:1px solid var(--line);border-radius:8px;padding:3px 8px}
  .weave{display:flex;flex-direction:column;gap:8px;width:100%;border-left:2px solid var(--line);padding-left:14px}
  .steer{align-self:flex-start;max-width:80%;background:var(--mint);border:1px solid rgba(54,80,70,.18);border-radius:12px;padding:8px 12px;font-size:14px}
  details.reason{background:#f3f0fa;border:1px solid #d6cde8;border-radius:10px;padding:8px 12px;width:100%}
  details.reason summary{cursor:pointer;font-size:12px;font-weight:700;color:#5b4b86}
  details.tool{background:#eef6f1;border:1px solid #c4d8c9;border-radius:10px;padding:6px 10px;width:100%}
  details.tool summary{cursor:pointer;font-size:12px;font-weight:700;color:#2d6a4f}
  details pre{margin:8px 0 0}
  pre{background:#2b2b30;color:#f5f3ee;border-radius:10px;padding:12px 14px;overflow-x:auto;margin:0;white-space:pre-wrap;word-break:break-word;font-size:13px}
  .chat-md{white-space:normal;line-height:1.6;font-size:15px}
  .chat-md>*:first-child{margin-top:0}.chat-md>*:last-child{margin-bottom:0}
  .chat-md p{margin:0 0 10px}
  /* the chat runs under Tailwind Preflight (list markers stripped, heading weight
     inherited); replicate that here so the export matches the chat exactly */
  .chat-md ul{list-style:none;margin:0 0 10px;padding-left:22px}
  /* ⚠ AN ORDERED LIST KEEPS ITS NUMBERS. list-style:none was applied to ul AND ol together, so "1. 2. 3."
     vanished from the rendered view while the Plain/Markdown view still showed them — Ote spotted the pair.
     Hiding a BULLET is a style choice: the glyph is decoration and the indent already says "list". Hiding a
     NUMBER deletes content: the numeral is the only thing carrying sequence, and a reader cannot recover
     "step 3 of 4" from indentation. Slightly more padding so a two-digit marker still fits inside it.
     (⚠ this stylesheet is a JS TEMPLATE LITERAL — a backtick in a comment here ends the string and the file
     fails to compile with a bare "',' expected". No backticks in this block.) */
  .chat-md ol{list-style:decimal;margin:0 0 10px;padding-left:26px}
  .chat-md li{margin:2px 0}.chat-md li>p{margin:0}
  .chat-md h1,.chat-md h2,.chat-md h3,.chat-md h4{font-weight:inherit;margin:14px 0 8px;line-height:1.3}
  .chat-md h1{font-size:1.4em}.chat-md h2{font-size:1.25em}.chat-md h3{font-size:1.1em}
  .chat-md a{color:var(--accent-deep);text-decoration:underline}
  .chat-md code{background:rgba(0,0,0,.06);padding:1px 5px;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em}
  .chat-md pre{background:#2b2b30;color:#f5f3ee;border-radius:10px;padding:12px 14px;overflow-x:auto;margin:0 0 10px}
  .chat-md pre code{background:none;padding:0;color:inherit;font-size:.85em}
  .chat-md blockquote{border-left:3px solid var(--line);margin:0 0 10px;padding:2px 0 2px 12px;color:var(--muted)}
  .chat-md table{border-collapse:collapse;margin:0 0 10px;display:block;overflow-x:auto}
  .chat-md th,.chat-md td{border:1px solid var(--line);padding:6px 10px;text-align:left}
  .chat-md th{background:rgba(0,0,0,.04)}
  .chat-md hr{border:none;border-top:1px solid var(--line);margin:12px 0}
</style></head>
<body>
<h1 class="title">${esc(activeTitle)}</h1>
<div class="meta">Model: ${esc(model)} · exported ${esc(new Date().toLocaleString())}</div>
${parts.join('\n')}
</body></html>`
      return { content, mime: 'text/html', ext: 'html' }
    }
    // markdown (default)
    const lines: string[] = [`# ${activeTitle}`, '', `*Model: ${model} · exported ${new Date().toLocaleString()}*`, '']
    for (const m of messages) {
      lines.push(`## ${m.role === 'user' ? 'You' : 'Assistant'}`, '')
      if (m.reasoning) lines.push('<details><summary>Reasoning</summary>', '', m.reasoning, '', '</details>', '')
      for (const t of m.tools || []) {
        lines.push(`**🔧 ${t.name}**`, '', '```json', JSON.stringify(t.args ?? {}, null, 2), '```', '', '```', String(t.result ?? ''), '```', '')
      }
      if (m.images?.length) lines.push(`*(${m.images.length} image attachment${m.images.length === 1 ? '' : 's'})*`, '')
      for (const f of m.files || []) lines.push(`*(file: ${f.name})*`, '')
      lines.push(m.content || '', '')
    }
    return { content: lines.join('\n'), mime: 'text/markdown', ext: 'md' }
  }, [activeTitle, canSelect, selectedModel, modelsInfo, messages])

  // ---- mobile sidebar drawer ----
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // The live "working…" line for the active reply's pending step. Precedence: a specific runtime
  // status (searching / summarizing / …) wins; else "Thinking…" while reasoning streams (with a token
  // gauge); else a rotating, escalating wait phrase driven by how long the current stall has run. The
  // shimmer (.chat-working) is the Claude-style animation.
  const workingIndicator = (reasoning: string, content: string) => {
    // A HELD TURN IS NOT A STALL. While an ask_user question is pending, the reply is deliberately paused
    // waiting for the HUMAN — no events arrive because none should. The wait phrases below are all about a
    // slow MODEL, so they were not just noise but wrong: Ote watched "Still warming up — give it a minute…"
    // sit under a card that already read "this reply is paused until you answer", for ~5 minutes, until he
    // gave up and hit Skip. Left alone another 15s it would have escalated to "Someone tell Ote there's
    // something wrong with my AI…" while the only thing missing was his click.
    // The card states the situation authoritatively; a second, contradicting line can only mislead.
    if (pendingAsk && pendingAsk.conversationId === activeIdRef.current) return null
    // A specific runtime status (may carry an emoji: 🔎/🧠/…) — emoji-safe breathe (animate-pulse), NOT
    // the text-clip shimmer (background-clip:text would blank the emoji).
    if (statusNote) return <span data-ui="live-note" className="animate-pulse text-[14px] italic text-muted motion-reduce:animate-none">{statusNote}</span>
    let label: string
    if (reasoning && !content) {
      const tok = Math.round(reasoning.length / 4)
      label = tok >= 1000 ? `Thinking… · ${(tok / 1000).toFixed(1)}k tokens` : (tok ? `Thinking… · ${tok} tokens` : 'Thinking…')
    } else {
      label = waitPhrase(Math.max(0, (Date.now() - (lastEventAtRef.current || Date.now())) / 1000))
    }
    // Claude-style shimmer: a bright --ink band sweeps across --muted text (bg-clip-text). Reduced-motion
    // falls back to static muted (no gradient, no sweep). Tokens only — theme-aware.
    return (
      <span className="animate-shimmer bg-[linear-gradient(100deg,var(--muted)_30%,var(--ink)_50%,var(--muted)_70%)] bg-[length:220%_100%] bg-clip-text text-[14px] italic text-transparent motion-reduce:animate-none motion-reduce:bg-none motion-reduce:text-muted">
        {label}
      </span>
    )
  }

  return (
    <div className="chat-root">
      {/* ----- sidebar (slide-over drawer on small screens) ----- */}
      {/* mobile drawer scrim. The <aside> is a SIBLING, not a child, so a straddling gesture
          already resolved to their shared parent and never fired this — converted anyway so every
          scrim/backdrop in the app follows one rule (and gains the right-click guard). */}
      {sidebarOpen && <div className="chat-sidebar-overlay" {...dismissOnBackdrop(() => setSidebarOpen(false))} />}
      <aside className={sidebarOpen ? 'chat-sidebar open' : 'chat-sidebar'}>
        <div className="chat-brand px-1.5 pt-1">
          <p className="hero-kicker">OteLLMServices</p>
          <strong className="block text-lg mt-0.5">Chat</strong>
        </div>

        <button
          className="chat-new-btn rounded-[10px] border border-accent bg-accent px-3 py-2.5 font-bold text-[#fff8f0] transition-colors hover:border-accent-deep hover:bg-accent-deep"
          onClick={() => { if (conversationId) navigate('/chat'); else startNewChat(); setSidebarOpen(false) }}
        >+ New chat</button>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div className="chat-convo-search" style={{ flex: 1, minWidth: 0, margin: 0 }}>
            <input
              value={convoSearch}
              onChange={(e) => setConvoSearch(e.target.value)}
              placeholder="🔍 search chats + messages…"
              autoComplete="off"
              spellCheck={false}
            />
            {convoSearch && <button title="Clear search" onClick={() => setConvoSearch('')}>×</button>}
          </div>
          <RefreshButton onRefresh={reloadConversations} title="Refresh chat list" />
        </div>

        {/* Active/Archived segmented control — the selected side grows 3:1 */}
        <div className="chat-convo-tabs mt-1.5 mb-0.5 flex gap-1" role="tablist" aria-label="Conversation view">
          {(['active', 'archived'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={convoView === v}
              className={`min-w-0 flex-1 basis-0 cursor-pointer truncate rounded-lg border px-2 py-1.5 text-xs font-bold transition-all duration-200 ${
                convoView === v
                  ? 'active grow-[3] border-[var(--edge)] bg-accent-soft text-accent'
                  : 'border-line bg-transparent text-muted hover:border-[var(--edge)] hover:text-ink'
              }`}
              onClick={() => setConvoView(v)}
            >{v === 'active' ? 'Active' : 'Archived'}</button>
          ))}
        </div>

        <nav className="chat-convo-list flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5" aria-label="Conversations">
          {conversations.length === 0 && (
            <p className="chat-empty-hint px-1.5 py-2 text-[13px] text-muted">
              {convoSearch ? 'Nothing matches.' : convoView === 'archived' ? 'No archived chats.' : 'No conversations yet.'}
            </p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-stretch rounded-[10px] border ${
                c.id === activeId
                  ? 'chat-convo active border-[var(--edge)] bg-accent-soft'
                  : 'chat-convo border-transparent hover:border-[var(--wash)] hover:bg-[var(--panel)]'
              }`}
            >
              {renamingId === c.id ? (
                <form
                  className="chat-convo-rename flex min-w-0 flex-1 items-center gap-0.5 px-1.5 py-[5px]"
                  onSubmit={(e) => { e.preventDefault(); void commitRename(c.id, renameInput) }}
                >
                  <input
                    className="min-w-0 flex-1 rounded-[7px] border border-[var(--edge)] bg-surface px-2 py-[5px] text-[13px] font-semibold text-ink focus:border-accent focus:outline-none"
                    value={renameInput}
                    autoFocus
                    maxLength={120}
                    placeholder="Chat name…"
                    spellCheck={false}
                    onChange={(e) => setRenameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') cancelRename() }}
                    onBlur={cancelRename}
                  />
                  <button
                    type="button"
                    className={RENAME_BTN}
                    title="Suggest a name from the conversation"
                    aria-label="Suggest a name from the conversation"
                    disabled={suggesting}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void suggestName(c.id)}
                  >{suggesting ? '…' : '✦'}</button>
                  <button type="submit" className={`${RENAME_BTN} font-bold !text-accent`} title="Save name" aria-label="Save name" onMouseDown={(e) => e.preventDefault()}>✓</button>
                  <button
                    type="button"
                    className={RENAME_BTN}
                    title="Cancel"
                    aria-label="Cancel rename"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={cancelRename}
                  >✕</button>
                </form>
              ) : (
                <>
                  <button
                    className="chat-convo-open flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 border-0 bg-transparent px-2.5 py-[9px] text-left"
                    onClick={() => { navigate(`/chat/${c.id}`); setSidebarOpen(false) }}
                    title={c.title}
                  >
                    <span className="chat-convo-title truncate text-[13px] font-bold text-ink">
                      {(genIds.includes(c.id) || scheduledRuns.has(c.id)) && <span className="chat-convo-running" title={scheduledRuns.has(c.id) ? 'A scheduled run is generating a reply here' : 'A reply is generating in this chat'} aria-label="generating" />}
                      {askBadges.has(c.id) && <span className="flex-none text-[11px]" title="The assistant is waiting for your answer here" aria-label="question pending" data-ui="ask-badge">❓</span>}
                      {c.unread && !genIds.includes(c.id) && (
                        <span className="chat-convo-unread mr-1 inline-block h-2 w-2 rounded-full bg-accent align-middle" title="A scheduled run landed here — unread" aria-label="unread scheduled run" />
                      )}
                      {c.title || 'Untitled'}
                    </span>
                    <span className="chat-convo-model text-[11px] text-muted">{shortModel(c.model)}</span>
                  </button>
                  <button
                    className={`chat-convo-act flex w-[34px] cursor-pointer items-center justify-center rounded-r-[10px] border-0 bg-transparent text-[17px] font-bold leading-none transition group-hover:opacity-100 ${
                      convoMenu?.c.id === c.id ? 'open bg-[var(--wash)] text-accent opacity-100' : 'text-muted opacity-0 hover:bg-[var(--wash)] hover:text-accent'
                    }`}
                    onClick={(e) => openConvoMenu(e, c)}
                    title="Conversation options"
                    aria-label="Conversation options"
                    aria-haspopup="menu"
                  >⋯</button>
                </>
              )}
            </div>
          ))}
        </nav>

        <div className="chat-sidebar-foot flex flex-col gap-2 border-t border-line pt-2.5">
          <span className="adm-dim" title={user?.displayName ? `@${user?.username}` : undefined}>
            {user?.displayName || user?.username} · {user?.isRoot ? 'root' : (user?.roles.join(', ') || 'no roles')}
          </span>
          <div className="chat-foot-actions flex gap-1.5">
            {canConsole && <Link className="gw-btn adm-btn-sm chat-foot-btn flex-1 justify-center text-center" to="/console">Console →</Link>}
            <button
              className="gw-btn adm-btn-sm chat-foot-btn chat-foot-feedback"
              onClick={() => openFeedbackFrom(feedbackOrigin)}
              title="Send feedback to the team"
            >📣 Feedback</button>
          </div>
          <button className="chat-foot-primary" onClick={openOptions}>⚙ Options</button>
        </div>
      </aside>

      {/* ----- main ----- */}
      <section className="chat-main flex min-h-0 min-w-0 flex-col">
        <header className="chat-header flex flex-none items-center justify-between gap-3 border-b border-line bg-[var(--panel)] px-5 py-3 max-[720px]:gap-2 max-[720px]:px-3">
          <button className="chat-menu-btn mr-2 hidden cursor-pointer rounded-lg border border-line bg-[var(--panel)] px-2.5 py-1 text-base max-[720px]:inline-block" onClick={() => setSidebarOpen(true)} title="Conversations" aria-label="Open conversations">☰</button>
          {renamingHeader && activeId != null ? (
            <form
              className="chat-header-rename flex min-w-0 max-w-[560px] flex-1 items-center gap-1"
              onSubmit={(e) => { e.preventDefault(); void commitRename(activeId, renameInput) }}
            >
              <input
                className="min-w-0 flex-1 rounded-[9px] border-[var(--edge)] bg-surface px-3 py-[7px] text-[15px] font-bold text-ink focus:border-accent"
                value={renameInput}
                autoFocus
                maxLength={120}
                placeholder="Chat name…"
                spellCheck={false}
                onChange={(e) => setRenameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') cancelRename() }}
                onBlur={cancelRename}
              />
              <button
                type="button"
                className={`${HDR_RENAME_BTN} text-muted`}
                title="Suggest a name from the conversation"
                aria-label="Suggest a name from the conversation"
                disabled={suggesting}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void suggestName(activeId)}
              >{suggesting ? '…' : '✦'}</button>
              <button type="submit" className={`${HDR_RENAME_BTN} font-bold text-accent`} title="Save name" aria-label="Save name" onMouseDown={(e) => e.preventDefault()}>✓</button>
              <button type="button" className={`${HDR_RENAME_BTN} text-muted`} title="Cancel" aria-label="Cancel rename" onMouseDown={(e) => e.preventDefault()} onClick={cancelRename}>✕</button>
            </form>
          ) : (
            <div className="chat-header-title group/title flex min-w-0 items-center gap-1.5 text-base font-bold" title={activeTitle}>
              <span className="chat-header-title-text min-w-0 truncate">{activeTitle}</span>
              {activeId != null && (
                <button
                  className={`chat-title-edit ${RENAME_BTN} opacity-[.55] group-hover/title:opacity-100`}
                  onClick={() => { setRenameInput(activeTitle); setRenamingHeader(true) }}
                  title="Rename conversation"
                  aria-label="Rename conversation"
                >✎</button>
              )}
            </div>
          )}
          <div className="chat-model-pick flex flex-none items-center gap-2 max-[720px]:gap-1">
            {(() => {
              const cur = modelsInfo?.models.find((m) => m.id === (canSelect ? selectedModel : modelsInfo?.defaultModel))
              if (!cur?.capabilities?.length) return null
              const COLOR: Record<string, string> = {
                vision: 'chat-cap-vision border-[var(--info-edge)] bg-[var(--info-soft)] text-[var(--info)]',
                thinking: 'chat-cap-thinking border-[var(--think-edge)] bg-[var(--think-soft)] text-[var(--think)]',
                tools: 'chat-cap-tools border-[var(--warn-edge)] bg-[var(--warn-soft)] text-[var(--warn)]',
                embeddings: 'chat-cap-embed border-[var(--ok-edge)] bg-[var(--ok-soft)] text-[var(--ok)]',
                code: 'chat-cap-code border-[var(--ok-edge)] bg-[var(--ok-soft)] text-[var(--ok)]',
              }
              return (
                <span className="chat-model-caps mr-2.5 inline-flex items-center gap-1 max-[860px]:hidden" title={cur.inferred ? 'Capabilities inferred from the model name' : 'Capabilities declared by the provider'}>
                  {cur.capabilities.filter((c) => c !== 'chat').map((c) => (
                    <span key={c} className={`chat-cap-tag inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-[0.02em] ${COLOR[c] || 'border-line bg-[var(--code-bg)] text-ink'}`}>{c}{cur.inferred ? '?' : ''}</span>
                  ))}
                  {(cur.effectiveContext ?? 0) > 0 && (() => {
                    // The badge showed root's CAP even when the chat had narrowed its own window, so the
                    // ⚙ slider could read 16,384 while the header still said 86k. Show what this chat
                    // actually runs at, with the cap in parentheses when they differ.
                    const cap = cur.effectiveContext!
                    const chat = settings.numCtx != null ? Math.min(settings.numCtx, cap) : cap
                    // "Nk" ONLY when the value is an exact multiple of 1024, otherwise the exact number.
                    // Ollama honours any integer num_ctx precisely (measured: 100,001 in → 100,001
                    // reported), so root can set 100,000 — and a rounding badge would then print "98k",
                    // which is not the number anyone typed. Every value in play today is 1024-aligned by
                    // construction, so this changes nothing now and stays honest if that ever stops.
                    const k = (n: number) => (n % 1024 === 0 ? `${n / 1024}k` : n.toLocaleString())
                    return (
                      <span className="chat-cap-ctx inline-block rounded-full border border-line bg-[var(--code-bg)] px-2 py-0.5 text-[10px] font-bold tracking-[0.02em] text-ink"
                        // Spell the exact numbers out. "86k" for 88,064 looks wrong next to the ⚙ panel's
                        // exact figure until you know the k is 1024 — which is the convention model
                        // windows are quoted in (131,072 IS "128k"), so the tooltip says so rather than
                        // the badge switching to a decimal k that would print 131,072 as "131k".
                        title={`${chat === cap
                          ? `This chat runs at the full ${cap.toLocaleString()} tokens root allows for this model.`
                          : `This chat is limited to ${chat.toLocaleString()} tokens (⚙ Context window); root's cap for this model is ${cap.toLocaleString()}.`}\n\n"${k(chat)}" = ${chat.toLocaleString()} ÷ 1024 — k here means 1024 tokens, as model windows are conventionally quoted (131,072 = 128k).`}>
                        {chat === cap ? `${k(cap)} ctx` : `${k(chat)} (${k(cap)}) ctx`}
                      </span>
                    )
                  })()}
                </span>
              )
            })()}
            {canSelect ? (
              <ModelCombo
                className="w-64 max-[720px]:w-40"
                items={chatModelIds}
                unavailable={nonChatGroup}
                value={selectedModel}
                onChange={(id) => { if (id) void onModelChange(id) }}
                onOpen={refreshModelsOnOpen}
                byokProviders={byokProviders}
                annotations={ctxAnnotations}
                labels={modelLabels}
                clearable={false} // a conversation always has a model
                disabled={sending}
                placeholder={modelsInfo ? 'pick a model…' : 'Loading models…'}
              />
            ) : (
              <span className="chat-locked-model rounded-full bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent-deep" title="Your role uses a fixed model">
                {shortModel(modelsInfo?.defaultModel)}
              </span>
            )}
            {canSelect && (
              <span className="chat-gear-wrap relative inline-flex">
                <button
                  className={showSettings ? 'gw-btn chat-gear active' : 'gw-btn chat-gear'}
                  onClick={() => setShowSettings((s) => !s)}
                  title="Model settings"
                  aria-label="Model settings"
                >
                  ⚙
                  {settingsDiffer(settings, modelsInfo?.defaultSettings ?? DEFAULT_SETTINGS) && <i className="chat-gear-dot absolute right-1 top-1 h-[7px] w-[7px] rounded-full bg-accent shadow-[0_0_0_2px_var(--panel-strong)]" title="Settings customized" />}
                </button>
                {showSettings && (
                  <>
                    <div className="chat-pop-backdrop fixed inset-0 z-[44] bg-transparent" {...dismissOnBackdrop(() => setShowSettings(false))} />
                    <SettingsPanel settings={settings} onChange={updateSettings} disabled={sending}
                      onClose={() => setShowSettings(false)}
                      onModelsOpen={refreshModelsOnOpen}
                      defaults={modelsInfo?.defaultSettings ?? DEFAULT_SETTINGS}
                      unsupported={selectedUnsupported}
                      skills={skillBindingOn ? chatSkills : []}
                      marathonAllowed={modelsInfo?.marathonEnabled !== false}
                      // The same number the header badge shows: root's resolved cap for the selected
                      // model. Absent for remote providers (they manage their own windows), which
                      // correctly leaves the field uncapped and the hint generic.
                      ctxCap={modelsInfo?.models.find((m) => m.id === (canSelect ? selectedModel : modelsInfo?.defaultModel))?.effectiveContext ?? null}
                      visionModels={modelsInfo?.models.filter((m) => m.capabilities?.includes('vision') && !m.notChat).map((m) => m.id)}
                      visionRelayDefault={modelsInfo?.visionRelayDefault ?? null} />
                  </>
                )}
              </span>
            )}
            {activeId != null && messages.length > 0 && (
              <span className="chat-export ml-1.5 inline-flex gap-1.5">
                <button className="gw-btn adm-btn-sm" title="Download this conversation" onClick={() => setShowDownload(true)}>⬇<span className="max-[720px]:hidden"> Download</span></button>
              </span>
            )}
          </div>
        </header>

        <div className="chat-thread-wrap relative flex min-h-0 flex-1 flex-col">
        <div className="chat-thread flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-6" ref={threadRef} onScroll={onThreadScroll}>
          <TodoRail
            todo={todo}
            onClear={() => {
              const id = activeIdRef.current
              if (!id) return
              setTodo(null) // optimistic — the rail drops now; the server push confirms other tabs
              void clearConversationTodo(id).catch(() => { void getConversationTodo(id).then((r) => setTodo(r.todo)).catch(() => {}) })
            }}
          />
          {/* D4 rail half: a question waits below and the user scrolled away — keep it
              findable (sticky, under the todo rail) with a jump to the card */}
          {activeId && pendingAsk && pendingAsk.conversationId === activeId && !atBottom && (
            <button
              type="button"
              className="sticky top-0 z-10 mx-auto flex w-full max-w-[860px] cursor-pointer items-center gap-2 rounded-[12px] border border-[var(--think-edge)] bg-panel-strong px-3.5 py-2 text-left text-[13px] text-ink shadow-[0_2px_10px_var(--shadow)]"
              onClick={() => scrollToBottom('smooth')}
              data-ui="ask-jump"
            >
              <span aria-hidden>❓</span>
              <span className="min-w-0 flex-1 truncate"><b>Waiting for your answer</b> — the reply is paused on a question</span>
              <span className="text-[11px] text-muted">view ↓</span>
            </button>
          )}
          {loadingConvo && <div className="adm-dim chat-center py-10 text-center">Loading…</div>}
          {!loadingConvo && messages.length === 0 && (
            <div className="chat-welcome m-auto max-w-[460px] text-center">
              <h2 className="mb-2 text-[24px]">Start a new conversation</h2>
              <p className="adm-dim">
                Model: <code className="rounded bg-[var(--code-bg)] px-1.5 py-px text-[12px]">{selectedModel || modelsInfo?.defaultModel || '—'}</code>
                {!canSelect && ' (fixed for your role)'}
              </p>
            </div>
          )}

          {messages.map((m, i) => {
            const isLast = i === messages.length - 1
            // interleaved rendering when the reply carries a text/tool/steer weave (legacy-style)
            const interleaved = m.role === 'assistant' && (m.segments?.some((s) => s.type === 'tool' || s.type === 'steer') ?? false)
            // newer replies weave thinking INTO the segments; older ones kept it as one blob
            // up top — only suppress the top Reasoning box when the weave actually carries it
            const hasReasoningSegments = m.segments?.some((s) => s.type === 'reasoning') ?? false
            const toolBlock = (t: { id?: string; name: string; args?: unknown; result?: string }, key: React.Key) => {
              const detail = toolCallDetail(t.name, t.args)
              return (
                <details key={key} className="chat-tool rounded-[10px] border border-[var(--ok-edge)] bg-[var(--ok-soft)] px-2.5 py-1.5">
                  <summary className="cursor-pointer text-[12px] font-bold text-[var(--ok)]">🔧 {t.name}{detail && <span className="font-semibold opacity-75"> — {detail}</span>}{t.result ? '' : ' …'}</summary>
                  {t.args !== undefined && <pre className="gw-pre !mt-1.5">args: {JSON.stringify(t.args)}</pre>}
                  {t.result && <pre className="gw-pre !mt-1.5">{t.result}</pre>}
                </details>
              )
            }
            // one step on the timeline rail: a marker (💭 / 🔧 / ✓) + its content. When the
            // body is collapsible (a <details>), the marker itself toggles it — clicking the
            // rail node does the same as clicking the block's arrow/summary.
            const railStep = (marker: string, cls: string, key: React.Key, body: React.ReactNode, collapsible = false) => (
              <div key={key} className={`chat-step ${cls}`}>
                {collapsible ? (
                  <button
                    type="button"
                    className="chat-step-marker"
                    title="Collapse / expand"
                    aria-label="Collapse or expand this step"
                    onClick={(e) => {
                      const d = e.currentTarget.closest('.chat-step')?.querySelector('details')
                      if (d) d.open = !d.open
                    }}
                  >{marker}</button>
                ) : (
                  <span className="chat-step-marker" aria-hidden>{marker}</span>
                )}
                <div className="chat-step-body">{body}</div>
              </div>
            )
            return (
              <div key={m.id ?? `i${i}`} className={`chat-msg chat-msg-${m.role} group/msg mx-auto flex w-full max-w-[860px] flex-col gap-1 ${m.role === 'user' ? 'items-end text-left' : 'items-start'}`}>
                <div className="chat-msg-role text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted">{m.role === 'user' ? 'You' : 'Assistant'}</div>
                {/* WHAT THE EYE SAW — first thing in the ASSISTANT's turn, above Reasoning (Ote's placement,
                    2026-08-03). It belongs here, not under the user's image: looking at the picture is work
                    the assistant DID, and the turn then reads in the order it happened — looked, thought,
                    answered. Sourced from the preceding user message (that is where the images and their
                    descriptions live) and shown only on the reply that immediately follows them, so a later
                    turn in the same chat does not re-announce an image it never re-read. */}
                {m.role === 'assistant' && (() => {
                  const prev = messages[i - 1]
                  if (!prev || prev.role !== 'user' || !prev.images?.length || !prev.imageDescriptions?.length) return null
                  return <VisionDescriptions items={prev.imageDescriptions} count={prev.images.length} />
                })()}
                {m.reasoning && !(interleaved && hasReasoningSegments) && (
                  <details className="chat-reasoning w-full rounded-[10px] border border-[var(--think-edge)] bg-[var(--think-soft)] px-3 py-2">
                    <summary className="cursor-pointer text-[12px] font-bold text-[var(--think)]">💭 Reasoning</summary>
                    <pre className="gw-pre !mt-2">{m.reasoning}</pre>
                  </details>
                )}
                {!interleaved && m.tools && m.tools.length > 0 && (
                  <div className="chat-tools flex w-full flex-col gap-1.5">
                    {m.tools.map((t, ti) => toolBlock(t, ti))}
                  </div>
                )}
                {m.files && m.files.length > 0 && (
                  <div className="chat-msg-files mb-1.5 flex flex-wrap gap-1.5">
                    {m.files.map((f, fi) => (
                      <span key={fi} className={FILE_CHIP} title={`${f.name}${f.note ? ` — ${f.note}` : ''}${f.chars ? ` · ${f.chars.toLocaleString()} chars extracted` : ''}`}>
                        📄 {f.name.length > 28 ? `${f.name.slice(0, 25)}…` : f.name}{f.note ? <em className="not-italic text-[11px] text-muted"> · {f.note}</em> : null}
                      </span>
                    ))}
                  </div>
                )}
                {m.images && m.images.length > 0 && (
                  <div className="chat-msg-images mb-1.5 flex flex-wrap gap-1.5">
                    {m.images.map((u, ii) => (
                      <img key={ii} className="block max-h-[180px] max-w-[220px] cursor-zoom-in rounded-xl border border-line" src={u} alt={`image ${ii + 1}`} title={imgTitle(u, m.imagesMeta?.[ii])} onClick={() => setPreview(u)} />
                    ))}
                  </div>
                )}
                {editingMsg?.index === i && m.role === 'user' ? (
                  <div className="chat-msg-edit flex flex-col gap-1.5">
                    <textarea
                      className="gw-textarea"
                      rows={Math.min(8, Math.max(2, editingMsg.draft.split('\n').length))}
                      value={editingMsg.draft}
                      autoFocus
                      onChange={(e) => setEditingMsg((cur) => (cur ? { ...cur, draft: e.target.value } : cur))}
                    />
                    <div className={`chat-msg-toolbar ${MSG_TOOLBAR}`}>
                      <button className={TOOLBAR_BTN} onClick={() => void submitEdit()} disabled={!editingMsg.draft.trim()}>✓ Save &amp; re-run</button>
                      <button className={TOOLBAR_BTN} onClick={() => setEditingMsg(null)}>Cancel</button>
                      <span className="adm-dim text-[11px] self-center">everything after this message is re-generated</span>
                    </div>
                  </div>
                ) : interleaved ? (
                  <div className="chat-weave">
                    {(() => {
                      // the final text segment is the answer — flush against the rail, not a "step"
                      const lastTextIdx = m.segments!.map((s) => s.type).lastIndexOf('text')
                      // Computed ONCE per reply, not per segment: locating each segment inside `content` is a
                      // forward scan, and doing it inside the map would make it quadratic on a long reply.
                      const srcOffsets = segmentSrcOffsets(m.segments, String(m.content || ''))
                      // Is the 🔊 button reading THIS stored reply right now? That is what lets the highlighter
                      // find a container: `data-live-answer` only ever marks the live bubble.
                      const isSpoken = speaking.id === m.id
                      return m.segments!.map((s, si) => {
                        if (s.type === 'tool') {
                          return railStep('🔧', 'chat-step-tool', `s${si}`, toolBlock(s, `t${si}`), true)
                        }
                        if (s.type === 'reasoning') {
                          return railStep('💭', 'chat-step-think', `s${si}`, (
                            <details className="chat-think rounded-[10px] border border-[var(--think-edge)] bg-[var(--think-soft)] px-2.5 py-1.5">
                              <summary className="cursor-pointer text-[12px] font-bold text-[var(--think)]">Thought</summary>
                              <pre className="gw-pre !mt-1.5 whitespace-pre-wrap break-words">{s.text}</pre>
                            </details>
                          ), true)
                        }
                        if (s.type === 'steer') {
                          // the user's mid-reply nudge, inline where it was folded in
                          return railStep('👤', 'chat-step-steer', `s${si}`, (
                            <div className="chat-steer-bubble whitespace-pre-wrap break-words rounded-xl border border-[var(--mint-edge)] bg-mint px-3 py-2 text-[14px] leading-[1.5]">{s.text}</div>
                          ))
                        }
                        // interaction narration is LIVE-only (a transient status while the tool runs) —
                        // never rendered as a persisted transcript step, incl. older stored convos that
                        // still carry it as a segment (Ote 2026-07-29).
                        if (s.type === 'interaction') return null
                        if (s.type === 'draft') return null // discarded output — preserved in data, not shown as the answer
                        // text: the last one is the answer — ✓ when done, a spinner while it
                        // still streams; earlier text segments are inline notes
                        const isAnswer = si === lastTextIdx
                        const running = isAnswer && m.pending && !m.error
                        return railStep(running ? '' : isAnswer ? '✓' : '·', `${isAnswer ? 'chat-step-answer' : 'chat-step-text'}${running ? ' chat-step-running' : ''}`, `s${si}`, (
                          <div className={`chat-msg-body ${MSG_BODY} ${MSG_BODY_ASSISTANT}`}>
                            {(() => {
                              // This segment's offset inside the whole reply: the spoken pieces are cut from
                              // `content`, so the highlight needs to know where each rendered segment starts in
                              // it. ⚠ Looked up, NOT summed — see segmentSrcOffsets for why a sum is now wrong.
                              const srcBase = srcOffsets[si] ?? 0
                              return !m.pending && s.text.length > LONG_REPLY_CHARS
                                ? <LongReply text={s.text} markdown={m.viewMarkdown ?? true} idx={i * 1000 + si} expanded={(m.viewExpanded ?? []).includes(si)} onToggle={() => toggleExpanded(i, si)} srcBase={srcBase} live={isLast} spoken={isSpoken} />
                                : ((m.viewMarkdown ?? true) ? <Markdown text={s.text} srcBase={srcBase} live={isLast} spoken={isSpoken} /> : s.text)
                            })()}
                          </div>
                        ))
                      })
                    })()}
                    {/* While a turn is HELD for an ask_user answer the indicator is intentionally null (see
                        workingIndicator), so this rail step would render an EMPTY bubble — visible in the
                        held-turn screenshot as a blank rounded box under the tool rail. Drop the step
                        entirely instead: the ask card below already says the reply is paused. */}
                    {m.pending && !m.error && m.segments![m.segments!.length - 1]?.type !== 'text'
                      && !(isLast && pendingAsk && pendingAsk.conversationId === activeId) && (
                      railStep('', 'chat-step-answer chat-step-running', 'pending', (
                        <div className={`chat-msg-body ${MSG_BODY} ${MSG_BODY_ASSISTANT}`}>
                          {isLast ? workingIndicator(m.reasoning || '', m.content) : <span className="chat-cursor">▍</span>}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className={`chat-msg-body ${MSG_BODY} ${m.role === 'user' ? MSG_BODY_USER : MSG_BODY_ASSISTANT}`}>
                    {m.content
                      ? (m.role === 'assistant' && !m.pending && m.content.length > LONG_REPLY_CHARS
                          // ⚠ `spoken` BELONGS ON EVERY RENDER PATH, NOT JUST THE SEGMENTED ONE. It was wired
                          // only into the interleaved branch above, and the drive caught it: `containers=0`,
                          // because a plain (non-segmented) reply renders here. The highlight still LIT in that
                          // run — but only because the reply happened to be the LAST message, so `live` marked
                          // it. Pressing 🔊 on any older reply would have found no container and lit nothing.
                          // A green highlight check that passes for the wrong reason is the trap; the container
                          // assertion is what separated them.
                          ? <LongReply text={m.content} markdown={m.viewMarkdown ?? true} idx={i * 1000} expanded={(m.viewExpanded ?? []).includes(-1)} onToggle={() => toggleExpanded(i, -1)} live={isLast && m.role === 'assistant'} spoken={speaking.id === m.id} />
                          : (m.role === 'assistant' && (m.viewMarkdown ?? true) ? <Markdown text={m.content} live={isLast} spoken={speaking.id === m.id} /> : m.content))
                      : (m.pending && !m.error
                          ? (isLast
                              ? workingIndicator(m.reasoning || '', m.content)
                              : <span className="chat-cursor">▍</span>)
                          // completed but empty (e.g. an embedding/non-chat model returned nothing) —
                          // make it clear it's a blank reply, not still loading. The error bar (if any)
                          // shows the reason; the toolbar below offers Regenerate / retry-with.
                          // If the model hit its output cap while thinking, say THAT (it's not a hang).
                          : (m.role === 'assistant' && !m.error
                              ? (m.metrics?.outputCapped
                                  ? <span className="adm-dim">(the model used its whole output limit{m.metrics.outputCapped.hadReasoning ? ' thinking' : ''} and left no answer — raise max tokens in ⚙, or lower the thinking effort, then regenerate)</span>
                                  : <span className="adm-dim">(no response — the model returned nothing)</span>)
                              : null))}
                  </div>
                )}
                {m.role === 'user' && !sending && activeId != null && editingMsg?.index !== i && (
                  <div className={`chat-msg-toolbar chat-msg-toolbar-user ${MSG_TOOLBAR} justify-end opacity-0 transition-opacity group-hover/msg:opacity-100`}>
                    <button className={TOOLBAR_BTN} onClick={() => void startEdit(i)} title="Edit this message and re-run the conversation from here">✎ Edit</button>
                  </div>
                )}
                {/* Context-headroom warning for this turn. A sibling of the error bar, NOT part of the
                    message body: it used to ride the statusNote channel, which put it in the model's
                    progress slot (where "Thinking…" belongs), dressed it as transient progress, and wiped
                    it as soon as the first token landed — losing the warning at the exact moment the reply
                    it warns about starts being written. Standing state, warn palette, stays put. */}
                {isLast && m.role === 'assistant' && ctxWarn && (
                  <div className="chat-msg-ctxwarn rounded-[10px] border border-[var(--warn-edge)] bg-[var(--warn-soft)] px-3 py-2 text-[13px] text-[var(--warn)]">⚠ {ctxWarn}</div>
                )}
                {m.error && <div className="chat-msg-error rounded-[10px] border border-[var(--danger-edge)] bg-[var(--danger-soft)] px-3 py-2 text-[13px] text-[var(--danger)]">⚠ {m.error}</div>}
                {/* Toolbar for a COMPLETED assistant reply — including a blank/errored one, so
                    the user can still Regenerate / retry-with-model / see what went wrong.
                    Copy & Plain only when there's text; Stats when there are metrics or an error.
                    `m.metrics` is in the gate so a CUT/timed-out/empty reply (0 chars, no error,
                    but real stats like ttft) still shows its toolbar even when it isn't the last
                    message — Ote's report: stats vanished on a cut mid-history reply. */}
                {m.role === 'assistant' && !m.pending && (m.content || m.error || m.metrics || isLast) && (
                  <div className={`chat-msg-toolbar ${MSG_TOOLBAR}`}>
                    {m.skill && (
                      <span className="chat-skill-chip inline-flex items-center gap-1 rounded-full border border-[var(--edge)] bg-[var(--wash)] px-2.5 py-[3px] text-[11px] font-bold text-accent-deep" title={`This reply ran as the "${m.skill.name}" skill`}>
                        🧩 {m.skill.name}
                      </span>
                    )}
                    {/* ANSWERED BY A DIFFERENT MODEL than the picker currently shows. Ote lost an hour to this:
                        a new chat inherits the last-used model (root.chatPrefs newChatModel:"last"), so three
                        replies came from gemma4:26b while he had qwen3.6:35b selected — and the model was only
                        discoverable by expanding Stats, which nobody does mid-conversation. Shown ONLY on a
                        mismatch, so it is silent in the normal case and impossible to miss in the case that
                        matters. */}
                    {m.model && selectedModel && m.model !== selectedModel && (
                      <span
                        className="chat-msg-othermodel inline-flex items-center gap-1 rounded-full border border-[var(--warn-edge)] bg-[var(--warn-soft)] px-2.5 py-[3px] text-[11px] font-bold text-[var(--warn)]"
                        title={`This reply was generated by ${m.model}, not the ${selectedModel} shown in the picker. A new chat starts on your last-used model; changing the picker applies from the NEXT message.`}
                      >
                        ⚠ {shortModel(m.model)}
                      </span>
                    )}
                    {/* THE VOICE (Voice v1). Speaks the canonical ANSWER — not the reasoning, not the
                        tool chatter. User-triggered per reply, never automatic. Renders on THIS machine
                        through the local sidecar, so nothing leaves the box. The control does not exist
                        unless root pointed the platform at a sidecar. While a reply is being read, the
                        `speech` volume control appears BESIDE it — Ote: "add volumn slider for each
                        where it emit sound" — rather than on all N messages at once, which would be
                        noise. So the slider is exactly where the sound is coming from, when it is. */}
                    {m.content && m.id && modelsInfo?.speechEnabled && (
                      <button
                        className={TOOLBAR_BTN}
                        onClick={() => (speaking.id === m.id ? stopSpeaking() : void speakReply(m.id!, String(m.content || '')))}
                        title={speaking.id === m.id
                          ? 'Stop — abandons the remaining pieces. Anything already rendered stays cached.'
                          : speechMuted
                            ? 'Reading aloud is muted. This restores the volume you had and reads this reply.'
                            : 'Speak this reply aloud'}
                        data-ui="msg-speak"
                      >
                        {speaking.id === m.id
                          // ⚠ NAME THE WAIT. A cold sidecar takes ~25s to load its model, and "🔊 Speak" sitting
                          // there unchanged for 25 seconds is indistinguishable from a broken button — which is
                          // exactly how Ote read it. Stop is still what the button DOES while loading (the press
                          // is already cancellable), so only the label changes.
                          ? (speakLoading ? `⏳ Loading the voice · ${speakSecs}s` : `⏹ Stop · ${speakSecs}s`)
                          : speechMuted ? '🔇 Unmute & speak' : '🔊 Speak'}
                      </button>
                    )}
                    {speaking.id === m.id && (
                      // ⚠ NAME WHAT THE MUTE COSTS. This icon is one click from silencing every reply on every
                      // device, and it sits next to a Stop button — so the tooltip has to say which one it is.
                      // The composed default ("Click to mute") described the mechanism, not the consequence.
                      <VolumeControl
                        channel="speech"
                        label="Reading aloud"
                        preview={false}
                        title="Reading aloud — drag ▾ for the volume. Clicking the speaker MUTES every reply (not just this one) and stops this reading; the 🔊 button will offer to undo it."
                      />
                    )}
                    {m.content && (
                      <button className={TOOLBAR_BTN} onClick={() => void copyMessage(i, m.content)} title="Copy reply text">
                        {copiedIdx === i ? '✓ Copied' : '⧉ Copy'}
                      </button>
                    )}
                    {m.content && (
                      <button className={TOOLBAR_BTN} onClick={() => toggleMsgView(i, 'viewMarkdown')} title="Toggle Markdown / plain text">
                        {(m.viewMarkdown ?? true) ? 'Plain' : 'Markdown'}
                      </button>
                    )}
                    {(m.metrics || m.error) && (
                      <button className={TOOLBAR_BTN} onClick={() => toggleMsgView(i, 'viewStats')} title={m.error ? 'Show the error / response stats' : 'Toggle response stats'}>
                        {(m.viewStats ?? false) ? 'Hide stats' : 'Stats'}
                      </button>
                    )}
                    {isLast && !sending && activeId != null && (
                      <button className={TOOLBAR_BTN} onClick={() => void handleRegenerate()} title="Regenerate reply">↻ Regenerate</button>
                    )}
                    {isLast && !sending && activeId != null && canSelect && (
                      <span title="Retry this reply with a different model (the chat switches to it)">
                        <ModelCombo
                          className="w-44 chat-retry-combo"
                          items={chatModelIds.filter((id) => id !== (selectedModel || modelsInfo?.defaultModel))}
                          value=""
                          onChange={(id) => { if (id) void handleRegenerate(id) }}
                          onOpen={refreshModelsOnOpen}
                          byokProviders={byokProviders}
                          actionMode
                          placeholder="↻ retry with…"
                        />
                      </span>
                    )}
                  </div>
                )}
                {m.role === 'assistant' && (m.viewStats ?? false) && (m.metrics || m.error) && (
                  <div className="chat-msg-stats">
                    {m.metrics && <MetricsRow m={m.metrics} model={m.model} tools={m.tools} messageId={m.id} showId={isDebugUser} />}
                    {m.error && <div className={METRICS_LINE}>error: {m.error}</div>}
                  </div>
                )}
              </div>
            )
          })}
          {/* a scheduled run is generating into THIS conversation right now — show it live
              (server push) so the thread doesn't sit silent until the whole turn lands at
              once; the run-ended/conversations-changed push clears it (and swaps in the reply) */}
          {activeId && scheduledRuns.has(activeId) && !genStreams.get(activeId) && (() => {
            const runName = scheduledRuns.get(activeId) || ''
            const isMarathon = /marathon/i.test(runName)
            return (
              <div className="chat-msg chat-msg-assistant mx-auto flex w-full max-w-[860px] flex-col items-start gap-1" data-ui="scheduled-run-live">
                <div className="chat-msg-role text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted">Assistant</div>
                <div className="flex items-center gap-2.5 rounded-[10px] border border-[var(--think-edge)] bg-[var(--think-soft)] px-3 py-2 text-[13px] text-[var(--think)]">
                  <span className="chat-scroll-dots" aria-hidden="true"><i /><i /><i /></span>
                  {isMarathon
                    ? (() => {
                        // Name the task in flight + plan progress (from the live rail), and set
                        // the expectation that a round's WRITING lands when the round finishes —
                        // marathon rounds run server-side (non-streamed), so the rail's checkboxes
                        // tick live but the reply text only appears at round-end (Ote's report:
                        // "it checked out that task, but there's no output showing … todo updated").
                        const cur = todo?.tasks?.find((t) => t.status === 'running') || todo?.tasks?.find((t) => t.status === 'pending')
                        const prog = todo?.total ? `${todo.completed}/${todo.total} done` : ''
                        return (
                          <span>
                            ▶️ <b>Marathon mode</b>{cur ? <> — working on <b>{cur.title}</b></> : ' is working through your plan'}{prog ? ` · ${prog}` : ''}…{' '}
                            <span className="opacity-70">this step’s reply appears here when the round finishes.</span>
                          </span>
                        )
                      })()
                    : <span>⏰ Scheduled run <b>“{runName}”</b> is generating a reply…</span>}
                </div>
              </div>
            )
          })()}
          {/* HumanInteraction: the model asked and THIS turn is held — the card is part of
              the SAME assistant turn (Assistant → wait → Assistant continues), rendered at
              the pause point. Typed text in the composer answers it too (D2). */}
          {activeId && pendingAsk && pendingAsk.conversationId === activeId && (
            <InteractionCard
              ask={pendingAsk}
              onAnswer={(answers) => void answerAsk({ answers })}
              onSkip={() => void answerAsk({ skip: true })}
            />
          )}
          <div ref={threadEndRef} />
        </div>
          {/* ANSWER-WITH-SPEAK indicator (Ote's ask). With auto-speak on, audio was the ONLY feedback, so
              "nothing happened" and "still rendering" looked identical. This distinguishes them: a pulsing
              🔊 while a piece is actually playing, a spinner-ish label while pieces are still rendering, the
              queue depth so a long reply is visibly progressing, and a Stop that is always reachable. */}
          {(liveSpeech.queued > 0 || liveSpeech.speaking || liveSpeech.linger) && (
            <div
              className="pointer-events-auto absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-panel-strong px-3 py-1.5 text-[12px] shadow-[0_4px_14px_var(--shadow)]"
              data-ui="live-speech"
            >
              <span className={liveSpeech.speaking ? 'animate-pulse' : ''} aria-hidden>🔊</span>
              <span className="font-semibold text-ink">
                {liveSpeech.speaking ? 'Speaking' : liveSpeech.queued > 0 ? 'Preparing speech' : 'Finished reading'}
              </span>
              {liveSpeech.queued > 1 && (
                <span className="tabular-nums text-muted" data-ui="live-speech-queue">
                  {liveSpeech.queued} pieces queued
                </span>
              )}
              {/* Why the voice went quiet for a stretch: a table or a code block has no reading. Same
                  omission counts the 🔊 button reports, summed over the pieces of this reply. */}
              {omittedShort(liveSpeech.skipped) && (
                <span className="whitespace-nowrap text-muted" data-ui="live-speech-skipped">
                  {omittedShort(liveSpeech.skipped)}
                </span>
              )}
              <button
                type="button"
                className="cursor-pointer rounded-md border-0 bg-transparent px-1 py-0.5 text-[12px] font-semibold text-[var(--danger)] hover:underline"
                onClick={stopLiveSpeech}
                data-ui="live-speech-stop"
              >Stop</button>
            </div>
          )}
          {/* Follow-mode jump button: shows only when scrolled up. While the model is
              generating it animates (dots) to signal live output below; otherwise a ↓. */}
          {!atBottom && messages.length > 0 && (
            <button
              type="button"
              className={`chat-scroll-down${sending ? ' generating' : ''}`}
              onClick={() => scrollToBottom('smooth')}
              title={sending ? 'Generating below — jump to latest' : 'Jump to latest'}
              aria-label={sending ? 'Generating below — jump to latest' : 'Jump to latest'}
            >
              {sending ? (
                <span className="chat-scroll-dots" aria-hidden="true"><i /><i /><i /></span>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14" /><path d="m19 12-7 7-7-7" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Dismissible (Ote's ask). Some of what lands here is a NOTICE rather than a failure — "only the
            first part was spoken", "a table was skipped" — and a banner you cannot close turns a note into
            a nag that sits over the composer until the next action happens to clear it. */}
        {error && (
          <div className="chat-error-bar mx-5 flex items-start gap-2 rounded-[10px] border border-[var(--danger-edge)] bg-[var(--danger-soft)] px-3 py-2 text-[13px] text-[var(--danger)]" data-ui="error-bar">
            <span className="min-w-0 flex-1">{error}</span>
            <button
              type="button"
              className="-mr-1 -mt-0.5 flex-none cursor-pointer rounded-md border-0 bg-transparent px-1.5 py-0.5 text-[14px] leading-none text-[var(--danger)] opacity-70 transition-opacity hover:opacity-100"
              onClick={() => setError('')}
              title="Dismiss"
              aria-label="Dismiss this message"
              data-ui="error-dismiss"
            >✕</button>
          </div>
        )}

        {(attachments.length > 0 || docAttachments.length > 0) && (
          <div className="chat-attach-row flex-none border-t border-line bg-[var(--panel)] px-5 py-3">
            <div className="chat-attach-inner mx-auto flex w-full max-w-[820px] flex-wrap items-center gap-3.5">
              {attachments.map((a, i) => (
                <div key={i} className="chat-attach-thumb relative">
                  <img className="block h-14 w-14 cursor-pointer rounded-[10px] border border-line object-cover" src={a.url} alt={`attachment ${i + 1}`} title={imgTitle(a.url, a)} onClick={() => setPreview(a.url)} />
                  <button className="absolute -right-1.5 -top-1.5 h-[18px] w-[18px] cursor-pointer rounded-full border border-line bg-panel-strong p-0 text-[11px] leading-none text-ink" title="Remove image" onClick={() => setAttachments((prev) => prev.filter((_, x) => x !== i))}>×</button>
                </div>
              ))}
              {docAttachments.map((f, i) => (
                <span key={`d${i}`} className={FILE_CHIP} title={f.name}>
                  📄 {f.name.length > 28 ? `${f.name.slice(0, 25)}…` : f.name}
                  <button className={FILE_CHIP_X} title="Remove file" onClick={() => setDocAttachments((prev) => prev.filter((_, x) => x !== i))}>×</button>
                </span>
              ))}
              {(() => {
                const cur = modelsInfo?.models.find((m) => m.id === (canSelect ? selectedModel : modelsInfo?.defaultModel))
                const blind = cur?.capabilities && !cur.capabilities.includes('vision')
                // Name the relay even when it is the platform default — "default relay" told the user
                // nothing about which model is about to read their image. Pick the fallback BEFORE
                // calling shortModel, whose null case is '—' (which would render a bare dash).
                const relayId = settings.visionRelayModel || modelsInfo?.visionRelayDefault
                const relayName = relayId ? shortModel(relayId) : 'the default relay'
                return blind
                  ? <span className="chat-attach-hint chat-attach-warn rounded-full border border-[var(--warn-edge)] bg-[var(--warn-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--warn)]">⚠ {shortModel(cur.id)} can't see images — a vision model ({relayName}) will describe them first</span>
                  : <span className="chat-attach-hint text-[11px] text-muted">sent with your next message</span>
              })()}
            </div>
          </div>
        )}

        {/* `relative` so the context-usage popup can anchor to the WHOLE composer block and open
            clear of it — anchored to the meter itself it opened 8px up and covered the input. */}
        {/* `relative` so the context-usage popup can anchor to the whole composer block. The bottom
            padding is back to its original 18px: the meter now sits inside the composer ROW, so it needs
            no lane of its own — the whole point of moving it there. */}
        <div className="chat-composer relative flex flex-none flex-col gap-2 border-t border-line bg-[var(--panel)] px-5 pb-[18px] pt-3">
          {budget?.limited && budgetPct >= 90 && (
            <div className="chat-budget-warn mx-auto max-w-[900px] rounded-lg border border-[var(--warn-edge)] bg-[var(--warn-soft)] px-3 py-1.5 text-center text-[12.5px] text-[var(--warn)]" data-ui="budget-warn">
              ⚠ {budgetPct}% of today's tokens used{budget.remainingToday != null ? ` — ${fmtTokens(budget.remainingToday)} left` : ''}. Resets at midnight.
            </div>
          )}
          {sending && steerEnabled && (
            <div className="chat-steer-hint self-center rounded-full border border-[var(--mint-edge)] bg-[color-mix(in_srgb,var(--mint)_55%,var(--panel-strong))] px-3 py-[3px] text-[12px] leading-[1.4] text-muted" data-ui="steer-hint">
              {steerPending > 0
                ? <>↳ steering…</>
                : <><b>Enter</b> to steer this reply · <b>Stop</b> to cancel</>}
            </div>
          )}
          <div className="chat-composer-inner relative mx-auto flex w-full max-w-[820px] items-end gap-2">
            {/* /skill suggestions: typing "/…" (before the first space) offers installed skills;
                picking one completes "/name " — the send then binds it for that message only */}
            {slashOpen && (
              <div className="chat-slash-pop absolute bottom-[calc(100%+8px)] left-0 z-[45] flex w-[min(460px,100%)] flex-col gap-0.5 rounded-[12px] border border-line bg-panel-strong p-1.5 shadow-[0_12px_32px_rgba(70,34,12,0.18)]">
                <span className="flex items-center justify-between px-2 pb-1 text-[11px] font-bold uppercase tracking-[0.05em] text-muted">
                  Run this message as a skill
                  <span className="font-medium normal-case tracking-normal">↑↓ then Tab</span>
                </span>
                {slashMatches.map((s, i) => (
                  <button key={s.id} type="button"
                    data-active={i === slashActive}
                    className={`chat-slash-item flex cursor-pointer flex-col items-start gap-0 rounded-lg border-0 px-2 py-1.5 text-left transition-colors ${i === slashActive ? 'bg-[var(--wash)]' : 'bg-transparent'} hover:bg-[var(--wash)]`}
                    onMouseEnter={() => setSlashActive(i)}
                    onClick={() => pickSlash(s)}>
                    <span className="text-[13px] font-bold text-ink">/{s.id.replace(/^skill\./, '')}</span>
                    <span className="max-w-full truncate text-[12px] text-muted">{s.description}</span>
                  </button>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.docx,.xlsx,.xls,.ods,.csv,.txt,.md,.json,.xml,.yaml,.yml,.html,.log,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.cs,.go,.rs,.sh,.sql"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => void onPickFiles(e.target.files)}
            />
            <button
              className="gw-btn chat-attach-btn"
              title="Attach files — images, PDF, Word, Excel/CSV, text & code (up to 4 each); drag & drop or paste works too"
              aria-label="Attach files"
              disabled={attachments.length >= 4 && docAttachments.length >= 4}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l8.57-8.57a4 4 0 0 1 5.66 5.66l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <textarea
              ref={composerRef}
              className="chat-input max-h-[200px] flex-1 resize-none rounded-[14px] border-line bg-surface px-3.5 py-3 text-[15px]"
              /* The keyboard hint is dropped on phones: it wrapped the placeholder to three lines
                 inside the input, and a touch keyboard has no Shift+Enter to hint at. */
              placeholder={sending
                ? (isPhone ? 'Draft your next message…' : 'Draft your next message while the reply finishes…')
                : (isPhone ? 'Send a message…' : 'Send a message…  (Enter to send, Shift+Enter for newline)')}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setDraft(activeIdRef.current ?? NEW_DRAFT_KEY, e.target.value)
                if (activeIdRef.current) scheduleDraftFold(activeIdRef.current, e.target.value) // DB fold after the pause
              }}
              onKeyDown={onComposerKey}
              rows={1}
              /* stays enabled while generating so the user can draft ahead (send is still
                 gated: the button is Stop, and Enter doesn't submit until the reply ends) */
            />
            {sending ? (
              steerEnabled ? (
                // steering on: primary action STEERS the in-flight reply; Stop stays available
                <div className="chat-send-group flex gap-1.5 self-end">
                  <button
                    className="gw-btn gw-btn-primary chat-send chat-steer"
                    onClick={() => void submitSteer()}
                    disabled={!input.trim()}
                    title="Send this to the reply that's generating — it pauses right away, keeps what it wrote, and reacts to your message (Stop still cancels outright)"
                  >
                    ↳ Steer
                  </button>
                  <button className="gw-btn chat-stop chat-stop-sm" onClick={handleStop} title="Stop generating">■</button>
                </div>
              ) : (
                <button className="gw-btn chat-send chat-stop" onClick={handleStop} title="Stop generating">
                  ■ Stop
                </button>
              )
            ) : atGenLimit ? (
              <button
                className="gw-btn chat-send chat-send-limited"
                disabled
                title={`You already have ${genIds.length} repl${genIds.length === 1 ? 'y' : 'ies'} generating (limit ${genLimit}) — wait for one to finish, or stop it, before sending here.`}
              >
                ⏳ {genIds.length}/{genLimit}
              </button>
            ) : (
              <button
                className="gw-btn gw-btn-primary chat-send"
                onClick={() => void handleSend()}
                disabled={!input.trim() && attachments.length === 0 && docAttachments.length === 0}
              >
                Send
              </button>
            )}

          {/* Context meter — how much of the model's window this conversation is spending. Everyone sees
              the number; only context_detail can open the breakdown (the server withholds the categories
              entirely otherwise, so this is affordance, not concealment).
              Context meter — INSIDE the composer row, to the right of Send/Stop.
              Third placement, and the previous two are why: as a flex child of the composer column it was
              its own row (~34px of chat area, "it widen the container"); pinned to the pane edge it sat
              orphaned far right of the button ("this case is weird"); given its own lane below, it still
              read as a new line. Sitting in the row itself costs NO vertical space at all and puts it
              exactly where Ote pointed. `self-end` keeps it on the button's baseline while the textarea
              grows upward. */}
          {ctxUsage && ctxUsage.window != null && (
            <div className="chat-ctx-meter flex shrink-0 self-end pb-[7px]" data-ui="ctx-meter">
              {(() => {
                const pct = ctxUsage.usedPct ?? 0
                // Three bands, and they must match the guard's semantics: "full" is not the danger
                // point — "no room left to answer in" is. Amber starts well before 100%.
                const tone = pct >= 90 ? 'var(--danger, #c2410c)' : pct >= 75 ? 'var(--warn)' : 'var(--muted)'
                // EXACT counts, not fmtTokens: that formatter is for daily budgets, where "5K" is the
                // right resolution. Here it rendered 5,201 as "5K" and 1,576 as "2K" — the breakdown
                // exists to compare categories, and rounding destroys the comparison it is for.
                const label = `${ctxUsage.used.toLocaleString()} / ${ctxUsage.window!.toLocaleString()} (${pct}%)`
                const basis = ctxUsage.projected
                  ? 'projected for this chat (refines after the next reply)'
                  : 'measured on the last reply'
                const title = canContextDetail
                  ? `Context used: ${label} — ${basis}. Click for the breakdown.`
                  : `Context used: ${label} — ${basis}`
                // Circular gauge (Ote's ask). A ring reads as a single proportion at a glance and stays
                // legible at 15px, where a 54px track was cramped next to the text. Geometry: r=6 gives
                // circumference 2πr ≈ 37.7 — the arc is drawn by dashing that at pct, rotated -90° so it
                // starts at 12 o'clock. Clamped to 100 so an overflowing turn shows a FULL ring rather
                // than wrapping past the start and reading as nearly-empty.
                const R = 6
                const CIRC = 2 * Math.PI * R
                // A floor on the arc: at 3.4% the true arc is ~1.3px, which renders as a speck on the
                // track ring and reads as a rendering artifact rather than a gauge. 8% of the
                // circumference is the smallest that still looks deliberate. Only ever ADDS length at the
                // bottom of the range, so it cannot make a full window look emptier than it is.
                const arc = Math.max(CIRC * 0.08, (Math.min(100, Math.max(0, pct)) / 100) * CIRC)
                return (
                  <button
                    type="button"
                    className="chat-ctx-btn flex items-center gap-1.5 rounded-full border border-line bg-transparent py-1 pl-1.5 pr-2.5 text-[11px] font-semibold tabular-nums transition-colors hover:bg-[var(--wash)] disabled:cursor-default disabled:hover:bg-transparent"
                    style={{ color: tone }}
                    disabled={!canContextDetail}
                    aria-expanded={canContextDetail ? ctxOpen : undefined}
                    onClick={() => canContextDetail && setCtxOpen((v) => !v)}
                    title={title}
                  >
                    <svg className="chat-ctx-ring shrink-0" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="8" cy="8" r={R} fill="none" stroke="var(--code-bg)" strokeWidth="2.5" />
                      <circle
                        cx="8" cy="8" r={R} fill="none" stroke={tone} strokeWidth="2.5" strokeLinecap="round"
                        strokeDasharray={`${arc} ${CIRC}`} transform="rotate(-90 8 8)"
                      />
                    </svg>
                    <span>{pct}%</span>
                    <span className="font-medium text-muted">context</span>
                    {canContextDetail && <span className="text-muted" aria-hidden="true">{ctxOpen ? '▾' : '▸'}</span>}
                  </button>
                )
              })()}

              {ctxOpen && canContextDetail && (
                <>
                  <div className="fixed inset-0 z-[59]" {...dismissOnBackdrop(() => setCtxOpen(false))} />
                  {/* anchored to .chat-composer (bottom-full), so it opens clear of the input rather
                      than 8px above the meter — which put it on top of the composer and the steer hint */}
                  <div className="chat-ctx-pop absolute bottom-full right-5 z-[60] mb-2 w-[min(400px,92vw)] rounded-[12px] border border-line bg-panel-strong p-3 shadow-[0_12px_32px_rgba(31,36,48,0.22)]" role="dialog" aria-label="Context usage">
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-muted">Context usage</span>
                      <button type="button" className="cursor-pointer border-0 bg-transparent text-[15px] leading-none text-muted" onClick={() => setCtxOpen(false)} aria-label="Close">×</button>
                    </div>
                    <div className="mb-2 text-[12.5px] text-ink tabular-nums">
                      {ctxUsage.used.toLocaleString()} / {ctxUsage.window!.toLocaleString()} tokens
                      <span className="text-muted"> ({ctxUsage.usedPct}%)</span>
                    </div>

                    {/* Stacked proportion bar. Segments sit on the track in the SAME fixed order as the
                        rows below, each in its slot colour, with a 2px surface gap between fills so
                        adjacent hues never touch (that gap is what keeps them separable for a
                        colour-blind reader, and it is why the palette validates on the adjacent
                        pairlist). A sub-1% category still gets a visible sliver via the min-width —
                        a segment rendered as 0px would silently drop a row the table still lists. */}
                    <div className="chat-ctx-bar mb-3 flex h-[7px] w-full gap-[2px] overflow-hidden rounded-full bg-[var(--code-bg)]" aria-hidden="true">
                      {(ctxUsage.categories || []).map((c, i) => (
                        <span
                          key={c.key}
                          className="h-full first:rounded-l-full"
                          style={{
                            width: `${Math.max(0.6, ((c.tokens / ctxUsage.window!) * 100))}%`,
                            background: `var(--series-${(i % 8) + 1})`,
                          }}
                        />
                      ))}
                    </div>

                    <table className="w-full border-collapse text-[12px]">
                      <tbody>
                        {(ctxUsage.categories || []).map((c, i) => (
                          <tr key={c.key} className="chat-ctx-row">
                            <td className="py-[3px] pr-2 text-muted">
                              {/* the swatch IS the legend — it ties each row to its segment, so identity
                                  never rests on colour alone (three light slots sit under 3:1 contrast) */}
                              <span className="mr-1.5 inline-block h-[9px] w-[9px] shrink-0 rounded-[2px] align-[-1px]" style={{ background: `var(--series-${(i % 8) + 1})` }} />
                              {c.label}
                            </td>
                            <td className="py-[3px] pr-2 text-right tabular-nums text-ink">{c.tokens.toLocaleString()}</td>
                            <td className="w-[46px] py-[3px] text-right tabular-nums text-muted">{c.pct != null ? `${c.pct}%` : '—'}</td>
                          </tr>
                        ))}
                        <tr className="chat-ctx-row chat-ctx-free border-t border-line">
                          <td className="py-[3px] pr-2 pt-1.5 text-muted">Free space</td>
                          <td className="py-[3px] pr-2 pt-1.5 text-right tabular-nums text-ink">{ctxUsage.free != null ? ctxUsage.free.toLocaleString() : '—'}</td>
                          <td className="py-[3px] pt-1.5 text-right tabular-nums text-muted">
                            {ctxUsage.usedPct != null ? `${Math.round((100 - ctxUsage.usedPct) * 10) / 10}%` : '—'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    {/* Never let an estimate pass as a measurement: chars/4 plus a flat per-image cost
                        is not the provider's tokenizer, and a number that looks authoritative while
                        being ~15% off is worse than one that says what it is. */}
                    <p className="mt-2.5 text-[11px] leading-[1.45] text-muted">
                      Estimated (≈ chars ÷ 4, images counted flat) — not the model&apos;s own tokenizer.{' '}
                      {ctxUsage.projected
                        ? 'Projected from the prompt this chat would send; it leaves out per-turn recall, so it reads slightly low. Replaced by the real figure after the next reply.'
                        : 'Measured from the prompt actually sent on the last reply.'}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
          </div>
        </div>
      </section>

      {convoMenu && (
        <>
          <div className="chat-convo-menu-backdrop fixed inset-0 z-[60]" {...dismissOnBackdrop(() => setConvoMenu(null))} />
          <div
            className="chat-convo-menu fixed z-[61] flex min-w-[170px] flex-col gap-px rounded-xl border border-line bg-panel-strong p-[5px] shadow-[0_12px_32px_rgba(31,36,48,0.18)]"
            role="menu"
            style={{ left: convoMenu.x, top: convoMenu.y }}
          >
            <button role="menuitem" className={MENU_ITEM} onClick={() => { startRename(convoMenu.c); setConvoMenu(null) }}>
              <span className="w-[18px] text-center text-sm">✎</span> Rename
            </button>
            {convoView === 'archived' ? (
              <button role="menuitem" className={MENU_ITEM} onClick={() => { void onArchive(convoMenu.c.id, false); setConvoMenu(null) }}>
                <span className="w-[18px] text-center text-sm">↩</span> Restore
              </button>
            ) : (
              <button role="menuitem" className={MENU_ITEM} onClick={() => { void onArchive(convoMenu.c.id, true); setConvoMenu(null) }}>
                <span className="w-[18px] text-center text-sm">📁</span> Archive
              </button>
            )}
            <button role="menuitem" className={`${MENU_ITEM} danger !text-[var(--danger)] hover:!bg-[var(--danger-soft)]`} onClick={() => { setDeletingConvo(convoMenu.c); setConvoMenu(null) }}>
              <span className="w-[18px] text-center text-sm">🗑</span> Delete
            </button>
          </div>
        </>
      )}

      {optionsSection && (
        <OptionsModal
          section={optionsSection}
          onSelect={(s) => { window.location.hash = `#options/${s}` }}
          onClose={closeOptions}
          onPrefsChange={(p) => { setChatPrefs(p); loadModels() /* re-derive effective bg + default model */ }}
          feedbackOrigin={feedbackOrigin}
        />
      )}

      {showDownload && (
        <DownloadModal defaultName={exportName} build={buildExport} onClose={() => setShowDownload(false)} />
      )}

      {deletingConvo && (
        <ConfirmModal
          title="Delete conversation"
          message={<span>
            Delete <b>{deletingConvo.title || 'this conversation'}</b> and all its messages? This cannot be undone.
            {deleteSchedWarn && (
              <span className="mt-2.5 block rounded-[8px] border border-[var(--warn-edge)] bg-[var(--warn-soft)] px-2.5 py-2 text-[13px] text-[var(--warn)]">
                ⏰ {deleteSchedWarn.count} schedule{deleteSchedWarn.count === 1 ? '' : 's'} run{deleteSchedWarn.count === 1 ? 's' : ''} in this chat
                {deleteSchedWarn.names.length ? <> (<b>{deleteSchedWarn.names.join(', ')}</b>)</> : null}. Deleting it turns {deleteSchedWarn.count === 1 ? 'it' : 'them'} <b>inactive</b> — to run again {deleteSchedWarn.count === 1 ? 'it' : 'they'}'ll need a new destination chat.
              </span>
            )}
          </span>}
          onConfirm={async () => { await onDelete(deletingConvo.id) }}
          onClose={() => setDeletingConvo(null)}
        />
      )}

      {dragOver && (
        <div className="chat-drop-overlay pointer-events-none fixed inset-0 z-[55] grid place-items-center bg-[var(--panel)] backdrop-blur-[3px]">
          <div className="chat-drop-box flex flex-col items-center gap-2.5 rounded-[22px] border-2 border-dashed border-accent bg-[var(--panel-strong)] px-[72px] py-11 text-[17px] font-bold text-accent-deep shadow-[0_20px_45px_var(--shadow)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l8.57-8.57a4 4 0 0 1 5.66 5.66l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <div>Drop files to attach</div>
          </div>
        </div>
      )}

      <ImageLightbox src={preview} onClose={() => setPreview(null)} />

      {rewardToast && (
        <div className="chat-toast fixed bottom-24 right-[18px] z-[60] flex max-w-[380px] items-center gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] bg-surface px-3.5 py-3 text-[13.5px] text-ink shadow-[0_8px_28px_rgba(60,35,20,0.18)]" role="status" data-ui="reward-toast">
          <span>{rewardToast}</span>
          <button className="cursor-pointer border-0 bg-transparent p-0.5 text-[13px] leading-none text-muted hover:text-ink" onClick={() => setRewardToast(null)} title="Dismiss" aria-label="Dismiss">✕</button>
        </div>
      )}
    </div>
  )
}
