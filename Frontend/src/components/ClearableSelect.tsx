import { type ReactNode } from 'react'

// Native <select> with the platform's little × clear button (Ote's UX rule: every
// dropdown holding a CLEARABLE value shows × when one is picked — same affordance as
// ModelCombo/UserCombo). Use ONLY where '' is a real state ("(any)" filter, "no skill",
// "auto") — required enums (a provider's kind, a user's role) have nothing to clear to.
// The × sits left of the browser's own dropdown arrow; padding widens while it shows.
export default function ClearableSelect({
  value,
  onChange,
  className = '',
  wrapClassName = '',
  disabled = false,
  clearTitle = 'Clear',
  children,
}: {
  value: string
  onChange: (v: string) => void
  className?: string // classes for the <select> itself (gw-input, widths, data hooks…)
  wrapClassName?: string // sizing for the wrapper (defaults to content width in flex rows)
  disabled?: boolean
  clearTitle?: string
  children: ReactNode
}) {
  const showClear = value !== '' && !disabled
  return (
    <span className={`relative inline-flex ${wrapClassName}`}>
      <select
        className={`${className} ${showClear ? '!pr-10' : ''} min-w-0 flex-1`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      {/* gw-clearable-btn is the hook the coarse-pointer block uses to give this a real tap target —
          it measured 15px tall in the mobile audit, well under any thumb. */}
      {showClear && (
        <button
          type="button"
          title={clearTitle}
          className="gw-clearable-btn absolute right-6 top-1/2 -translate-y-1/2 flex items-center justify-center px-1 text-[15px] leading-none text-muted hover:text-ink"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onChange('') }}
        >×</button>
      )}
    </span>
  )
}
