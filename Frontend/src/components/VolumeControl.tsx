// The inline volume control that sits NEXT TO a thing making noise.
//
// Ote: *"add volumn slider for each where it emit sound"* — so this is deliberately one shared component
// rather than a slider hand-rolled per emitter. A second copy would drift from the first, and "each place
// that emits sound" is a list that only grows.
//
// Shape: a speaker button that mutes on click (volume 0 IS mute — see soundPrefs), and opens a small
// popover with the slider. The button alone is enough for the common case; the slider is one click away.
import { useEffect, useRef, useState } from 'react'
import {
  getLevel, gainOf, isMuted, onSoundChange, previewChannel, setLevel, toggleMute,
  type SoundChannel,
} from '../lib/soundPrefs'

// Three glyphs so the CURRENT level is readable without opening anything.
function icon(level: number) {
  if (level <= 0) return '🔇'
  if (level < 40) return '🔈'
  return '🔊'
}

export default function VolumeControl({
  channel,
  label,
  title,
  preview = true,
  className = '',
}: {
  channel: SoundChannel
  label: string          // what this channel is, for the tooltip and a11y
  title?: string         // overrides the composed tooltip
  preview?: boolean      // play a blip while dragging (off for channels that are already audible)
  className?: string
}) {
  const [level, setLevelState] = useState(() => getLevel(channel))
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement | null>(null)

  // Levels are global (and synced across devices) — mirror them here rather than owning them.
  useEffect(() => onSoundChange(() => setLevelState(getLevel(channel))), [channel])

  // Close on outside click / Escape. Without this the popover survives a click on the page
  // behind it, which reads as a stuck UI.
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  const muted = isMuted(channel)
  const tip = title ?? (muted ? `${label} — muted. Click to unmute` : `${label} — ${level}%. Click to mute, ▾ for the slider`)

  return (
    <div ref={wrap} className={`relative flex flex-none items-center ${className}`} data-ui={`volume-${channel}`}>
      <button
        type="button"
        className="cursor-pointer rounded-md border-0 bg-transparent px-1 py-0.5 text-[14px] leading-none text-muted transition-colors hover:text-ink"
        onClick={() => toggleMute(channel)}
        title={tip}
        aria-label={muted ? `Unmute: ${label}` : `Mute: ${label}`}
        data-ui={`volume-${channel}-mute`}
      >{icon(level)}</button>
      <button
        type="button"
        className="flex cursor-pointer items-center rounded-md border-0 bg-transparent px-0.5 py-0.5 leading-none text-muted transition-colors hover:text-ink"
        onClick={() => setOpen((o) => !o)}
        title={`Volume for: ${label}`}
        aria-label={`Volume slider for ${label}`}
        aria-expanded={open}
        data-ui={`volume-${channel}-toggle`}
      >
        {/* An inline SVG, not a "▾" glyph — at this size the text caret rendered as a dark blob
            in the shipped font. currentColor keeps it on the theme token in both themes. */}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
          <path d="M1 2.5 L4 5.5 L7 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-[60] mt-1 flex w-[214px] flex-col gap-1.5 rounded-[10px] border border-line bg-panel-strong p-2.5 shadow-[0_8px_24px_var(--shadow)]"
          data-ui={`volume-${channel}-popover`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Volume</span>
            <span className="font-mono text-[11px] font-bold tabular-nums text-ink">{level}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={level}
            // --pct paints the filled part explicitly, so 0 is genuinely EMPTY. accent-color
            // could not do this: it colours the thumb too, leaving an accent blob at 0 that
            // reads as "a little bit of volume" (Ote: "mute/valumn 0 is not completely 0").
            style={{ ['--pct' as string]: `${level}%` }}
            className={`vol-range w-full${muted ? ' is-muted' : ''}`}
            onChange={(e) => setLevel(channel, Number(e.target.value))}
            // Preview on release, not on every tick — a blip per pixel of drag is unbearable.
            onMouseUp={() => { if (preview) previewChannel(channel) }}
            onKeyUp={() => { if (preview) previewChannel(channel) }}
            aria-label={`${label} volume`}
            data-ui={`volume-${channel}-slider`}
          />
          <p className="m-0 text-[11px] leading-snug text-muted">
            {muted ? 'Muted — this sound will not play.' : `Plays at ${Math.round(gainOf(channel) * 100)}% of full.`}
            {' '}Saved to your account. Change every sound in <b>Options → Sound</b>.
          </p>
        </div>
      )}
    </div>
  )
}
