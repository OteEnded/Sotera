import { useEffect, useRef } from 'react'
import Account from '../Account'
import MemoryPanel from './MemoryPanel'
import ChatPrefsPanel from './ChatPrefsPanel'
import AppearancePanel from './AppearancePanel'
import SoundPanel from './SoundPanel'
import SchedulesPanel from './SchedulesPanel'
import UsageStatsPanel from '../../components/UsageStatsPanel'
import TokenBudgetPanel from '../../components/TokenBudgetPanel'
import FeedbackForm from '../../components/FeedbackForm'
import { useAuth } from '../../lib/auth'
import type { ChatPrefs } from '../../lib/chatApi'
import { dismissOnBackdrop } from '../../lib/overlay'

// Claude-style settings modal for the CHAT site (members/power users don't live in
// the console). Routed via the URL hash — #options/<section> — so it survives
// refresh and can be deep-linked. Add new sections to SECTIONS as they appear.
type Section = { key: string; label: string; icon: string }
const BASE_SECTIONS: Section[] = [
  { key: 'account', label: 'Account', icon: '👤' },
  { key: 'appearance', label: 'Appearance', icon: '🎨' }, // theme — everyone, synced across devices
  { key: 'sound', label: 'Sound', icon: '🔊' }, // per-emitter volumes — everyone; sound is not a power-user feature
  { key: 'memory', label: 'Memory', icon: '🧠' },
  { key: 'usage', label: 'Usage', icon: '📊' },
  { key: 'feedback', label: 'Feedback', icon: '📣' }, // everyone can send feedback
]
// The Chat + Schedules sections only make sense for users who can pick models/options —
// which includes root (its prefs persist in the settings table since it has no users row).
const CHAT_SECTION: Section = { key: 'chat', label: 'Chat', icon: '💬' }
const SCHEDULES_SECTION: Section = { key: 'schedules', label: 'Schedules', icon: '⏰' }

export default function OptionsModal({
  section,
  onSelect,
  onClose,
  onPrefsChange,
  feedbackOrigin,
}: {
  section: string
  onSelect: (s: string) => void
  onClose: () => void
  onPrefsChange?: (p: ChatPrefs) => void
  feedbackOrigin?: string // "where am I" the Feedback section auto-fills — same for both doors in
}) {
  const { logout, can } = useAuth()
  // On a phone the section rail becomes a horizontal SCROLL strip, so the section you are actually
  // in can sit off-screen — opening #options/schedules showed "Account · Appearance · Sound" and no
  // hint of where you were. Pull the active item into view whenever it changes (nearest, so it does
  // not jump the strip around when the item is already visible).
  const navRef = useRef<HTMLElement>(null)
  const showChat = can('select_model')
  // Schedules shows for EVERY tier — whether a tier may schedule is root's server-side
  // chat.scheduleRoles lever now (the panel says so when locked), not a client capability.
  const SECTIONS = showChat ? [...BASE_SECTIONS, CHAT_SECTION, SCHEDULES_SECTION] : [...BASE_SECTIONS, SCHEDULES_SECTION]
  const active = SECTIONS.some((s) => s.key === section) ? section : 'account'
  const activeLabel = SECTIONS.find((s) => s.key === active)?.label ?? 'Options'

  useEffect(() => {
    // rAF, because on first open the strip has not been laid out yet and scrollIntoView against a
    // zero-scroll container is a no-op (measured: Memory stayed off-strip without this).
    const raf = requestAnimationFrame(() => {
      const el = navRef.current?.querySelector('[data-active="true"]')
      // inline:'center' rather than 'nearest' — 'nearest' considers a partly-visible item done, which
      // left the active section sitting under the edge fade. block:'nearest' keeps DESKTOP safe: there
      // the rail is a vertical column, and centring vertically would jump it for no reason.
      el?.scrollIntoView({ block: 'nearest', inline: 'center' })
    })
    return () => cancelAnimationFrame(raf)
  }, [active])

  const signOut = () => {
    // drop the #options hash first so the login page (and the next sign-in) starts clean
    history.replaceState(null, '', window.location.pathname + window.location.search)
    void logout()
  }

  // section-nav rows: the semantic classes stay as hooks; active/danger variants carry
  // their own colors so the utilities never conflict on one element
  const ITEM = 'chat-options-item flex cursor-pointer items-center gap-[9px] rounded-[9px] border-0 bg-transparent px-2.5 py-2 text-left text-[13px] font-semibold transition-colors'

  return (
    <div className="chat-options-overlay fixed inset-0 z-[70] grid place-items-center bg-[var(--overlay)] p-5" {...dismissOnBackdrop(onClose)}>
      <div className="chat-options-modal flex h-[min(660px,90vh)] w-[min(920px,96vw)] overflow-hidden rounded-2xl border border-line bg-panel-strong shadow-[0_18px_48px_rgba(31,36,48,0.25)]" data-ui="options-modal" onClick={(e) => e.stopPropagation()}>
        <aside ref={navRef} className="chat-options-nav flex w-[190px] flex-none flex-col gap-0.5 border-r border-line bg-[var(--panel)] px-2.5 py-3.5">
          <div className="chat-options-brand px-2.5 pb-2.5 pt-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-accent">Options</div>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              data-active={s.key === active}
              className={s.key === active ? `${ITEM} active bg-accent-soft text-accent` : `${ITEM} text-ink hover:bg-[var(--wash)]`}
              onClick={() => onSelect(s.key)}
            >
              <span className="chat-options-ic w-[18px] text-center">{s.icon}</span> {s.label}
            </button>
          ))}
          <div className="chat-options-spacer flex-1" />
          <button className={`${ITEM} danger text-[var(--danger)] hover:bg-[var(--danger-soft)]`} onClick={signOut}>
            <span className="chat-options-ic w-[18px] text-center">⏻</span> Sign out
          </button>
        </aside>
        <section className="chat-options-body flex min-w-0 flex-1 flex-col">
          <div className="chat-options-head flex flex-none items-center justify-between border-b border-line px-[18px] pb-2.5 pt-3.5">
            <h3 className="text-[17px]">{activeLabel}</h3>
            <button className="gw-btn adm-btn-sm" onClick={onClose} aria-label="Close options">✕</button>
          </div>
          <div className="chat-options-content flex-1 overflow-y-auto px-[18px] py-4">
            {active === 'account' && <Account embedded />}
            {active === 'appearance' && <AppearancePanel />}
            {active === 'sound' && <SoundPanel onChange={onPrefsChange} />}
            {active === 'memory' && <MemoryPanel />}
            {active === 'usage' && (
              <div className="flex flex-col gap-2">
                <TokenBudgetPanel />
                <p className="adm-dim m-0 text-[13px]">Your usage — chat turns + calls on your API keys. Tokens in = prompt, out = completion.</p>
                <UsageStatsPanel endpoint="/v1/me/usage/stats" />
              </div>
            )}
            {active === 'chat' && showChat && <ChatPrefsPanel onChange={onPrefsChange} />}
            {active === 'schedules' && <SchedulesPanel />}
            {active === 'feedback' && <FeedbackForm origin={feedbackOrigin} />}
          </div>
        </section>
      </div>
    </div>
  )
}
