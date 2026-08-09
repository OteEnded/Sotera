import { useEffect, useState } from 'react'
import { getChatPrefs, saveChatPrefs } from '../../lib/chatApi'
import { applyThemePref, getThemePref, type ThemePref } from '../../lib/theme'

// Appearance — the theme preference (Discord-like): explicit Light/Dark, or Sync with
// device (follows the OS live). Applies INSTANTLY (with the switch animation) and saves
// to the user's prefs, so it follows them across devices; localStorage mirrors it so the
// next page load paints right before the network answers.

const CHOICES: { key: ThemePref; label: string; hint: string; swatch: 'light' | 'dark' | 'split' }[] = [
  { key: 'light', label: 'Light', hint: 'Warm cream, always', swatch: 'light' },
  { key: 'dark', label: 'Dark', hint: 'Candle-lit, always', swatch: 'dark' },
  { key: 'system', label: 'Sync with device', hint: 'Follows your OS setting — live', swatch: 'split' },
]

// mini theme previews use the REAL palette values so the cards are honest in both themes
const SWATCH = {
  light: { bg: '#f3efe7', panel: '#fffaf0', ink: '#1f2430', accent: '#bf5b31' },
  dark: { bg: '#171310', panel: '#241e18', ink: '#ece5d8', accent: '#d97e4f' },
}

function Swatch({ kind }: { kind: 'light' | 'dark' | 'split' }) {
  const half = (p: typeof SWATCH.light, clip?: string) => (
    <div className="absolute inset-0" style={{ background: p.bg, clipPath: clip }}>
      <div className="absolute left-1.5 top-1.5 right-1.5 h-2.5 rounded-[4px]" style={{ background: p.panel, border: `1px solid ${p.ink}22` }} />
      <div className="absolute left-1.5 top-[22px] h-1.5 w-8 rounded-full" style={{ background: p.ink, opacity: 0.75 }} />
      <div className="absolute left-1.5 bottom-1.5 h-1.5 w-5 rounded-full" style={{ background: p.accent }} />
    </div>
  )
  return (
    <div className="relative h-14 w-full overflow-hidden rounded-[8px] border border-line">
      {kind !== 'dark' && half(SWATCH.light)}
      {kind !== 'light' && half(SWATCH.dark, kind === 'split' ? 'polygon(50% 0, 100% 0, 100% 100%, 50% 100%)' : undefined)}
    </div>
  )
}

export default function AppearancePanel() {
  const [pref, setPref] = useState<ThemePref>(getThemePref())
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // trust the server copy over the local mirror when the panel opens
  useEffect(() => {
    getChatPrefs().then(({ prefs }) => { if (prefs.theme) setPref(prefs.theme) }).catch(() => {})
  }, [])

  const pick = async (next: ThemePref) => {
    setError(''); setSaved(false)
    setPref(next)
    applyThemePref(next, { animate: true }) // instant — never wait for the network
    try {
      await saveChatPrefs({ theme: next })
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="appearance-panel flex flex-col gap-3">
      <p className="adm-dim m-0 text-[13px]">
        Your theme follows your account across devices. <b>Sync with device</b> tracks your OS
        setting live — flip your system theme and the site follows.
      </p>
      {error && <div className="text-danger text-[13px]">{error}</div>}
      <div className="grid gap-2.5 sm:grid-cols-3">
        {CHOICES.map((c) => (
          <button
            key={c.key}
            className={`appearance-choice flex flex-col gap-2 rounded-[12px] border p-2.5 text-left transition-colors ${
              pref === c.key
                ? 'border-accent bg-accent-soft'
                : 'border-line bg-panel hover:border-[var(--edge)]'
            }`}
            data-theme-choice={c.key}
            onClick={() => void pick(c.key)}
          >
            <Swatch kind={c.swatch} />
            <span className="flex items-center gap-1.5 text-[13px] font-bold">
              {pref === c.key && <span className="text-accent">●</span>}
              {c.label}
            </span>
            <span className="text-[12px] text-muted">{c.hint}</span>
          </button>
        ))}
      </div>
      {saved && <p className="adm-dim m-0 text-[12px]">Saved — synced to your account.</p>}
    </div>
  )
}
