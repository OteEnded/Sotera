import { useEffect, useRef, useState } from 'react'
import { attachOutsideDismiss } from '../../lib/overlay'

export type UserOpt = { id: string; username: string }
type Opt = { value: string; label: string }

// Searchable user picker (combobox) for admin filters: click/focus opens the list,
// typing narrows it, click or Enter picks. Options: (everyone) + root + every user.
// Value contract matches the backend filters: '' = everyone, 'root', or a user id.
export default function UserCombo({ users, value, onChange, everyoneLabel = '(everyone)' }: {
  users: UserOpt[]; value: string; onChange: (v: string) => void; everyoneLabel?: string
}) {
  const opts: Opt[] = [
    { value: '', label: everyoneLabel },
    { value: 'root', label: 'root' },
    ...users.map((u) => ({ value: u.id, label: u.username })),
  ]
  const selected = opts.find((o) => o.value === value)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null) // the ▼ toggle hands focus back to the input

  const q = query.trim().toLowerCase()
  const filtered = q ? opts.filter((o) => o.label.toLowerCase().includes(q)) : opts

  // Outside dismissal must START and END outside (lib/overlay) — on plain mousedown, pressing
  // outside and dragging into the list closed it mid-gesture. Option clicks still use
  // onMouseDown; they sit inside boxRef, so they never count as "outside" either way.
  useEffect(() => attachOutsideDismiss(
    (t) => Boolean(boxRef.current?.contains(t)),
    () => setOpen(false),
  ), [])

  const pick = (o: Opt) => { onChange(o.value); setQuery(''); setOpen(false) }

  return (
    <div ref={boxRef} className="relative">
      <input
        className={`gw-input ${value ? 'pr-12' : 'pr-7'}`}
        value={open ? query : (selected?.label ?? everyoneLabel)}
        placeholder={selected?.label ?? everyoneLabel}
        ref={inputRef}
        onFocus={() => { setOpen(true); setQuery(''); setActive(0) }}
        // Same reopen fix as ModelCombo: picking closes the list but leaves the input focused, so without this a
        // second click fired no focus event and appeared dead until you clicked away and back.
        onMouseDown={() => { if (open) return; setOpen(true); setQuery(''); setActive(0) }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); if (open && filtered[active]) pick(filtered[active]) }
          // Escape cancels and leaves no residue — a surviving query made the next open show a stale filter.
          else if (e.key === 'Escape') { setQuery(''); setActive(0); setOpen(false) }
        }}
        spellCheck={false}
        autoComplete="off"
      />
      {value !== '' && (
        <button
          type="button"
          title="Clear"
          className="gw-clearable-btn absolute right-6 top-1/2 -translate-y-1/2 flex items-center justify-center px-1 text-muted hover:text-ink text-[15px] leading-none"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onChange(''); setQuery(''); setOpen(false) }}
        >×</button>
      )}
      {/* A real toggle, not decoration — the arrow is the one thing that looks like an expander. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        title={open ? 'Close' : 'Show options'}
        className="gw-clearable-btn absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center px-1.5 py-1 text-muted hover:text-ink text-[10px] leading-none"
        onMouseDown={(e) => {
          e.preventDefault() // keep focus on the input
          if (open) { setOpen(false); return }
          setQuery(''); setActive(0); setOpen(true)
          inputRef.current?.focus()
        }}
      >▼</button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-56 overflow-auto bg-panel-strong border border-line rounded-lg shadow-modal py-1">
          {filtered.map((o, i) => (
            <div
              key={o.value || 'everyone'}
              className={`px-3 py-1.5 text-[13px] cursor-pointer ${i === active ? 'bg-[var(--code-bg)]' : ''} ${o.value === value ? 'font-semibold' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(o) }}
              onMouseEnter={() => setActive(i)}
            >
              {o.label}{o.value === 'root' ? <span className="adm-dim"> · superuser</span> : null}
            </div>
          ))}
          {filtered.length === 0 && <div className="px-3 py-1.5 text-[13px] adm-dim">No match</div>}
        </div>
      )}
    </div>
  )
}
