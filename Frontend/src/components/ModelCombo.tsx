import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { attachOutsideDismiss } from '../lib/overlay'

// Searchable model picker (combobox) — the shared replacement for every <select> of
// models. Keeps the provider GROUPING of the old dropdowns: ids are grouped by their
// "<provider>/" prefix with a non-selectable header per group; typing filters across
// all groups; ArrowUp/Down + Enter picks; × clears (when clearable).
//
// `items` are full model ids ("provider/model"; bare ids group under 'other').
// `emptyLabel` adds a "(…)" first option that maps to '' (e.g. "use the conversation's
// model"). `actionMode` is for pickers that TRIGGER something instead of holding a
// value (retry-with): the control always shows the placeholder and resets after a pick.

type Group = { provider: string; label: string; ids: string[] }

const shortId = (id: string) => (id.includes('/') ? id.slice(id.indexOf('/') + 1) : id)

export default function ModelCombo({
  items,
  value,
  onChange,
  placeholder = 'pick a model…',
  emptyLabel,
  pinnedOptions = [],
  byokProviders,
  clearable = true,
  actionMode = false,
  disabled = false,
  showFullValue = false,
  className = '',
  onOpen,
  unavailable,
  annotations,
  labels,
  searchPlaceholder = 'type to search models…',
  noMatchLabel = 'No model matches',
  wide = false,
}: {
  items: string[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  emptyLabel?: string
  // extra special options rendered ABOVE the model groups, pickable like emptyLabel (each
  // holds a sentinel value, e.g. '@chat' = "use the conversation's own model"). Not real
  // models — kept out of the provider groups; matched by their label when searching.
  pinnedOptions?: { value: string; label: string }[]
  byokProviders?: Set<string>
  clearable?: boolean
  actionMode?: boolean
  disabled?: boolean
  showFullValue?: boolean // closed control shows the full id (console) vs short name (chat)
  className?: string
  onOpen?: () => void // fires when the list opens — hosts refresh their items here (throttled by lib/modelRefresh)
  unavailable?: { label: string; ids: string[]; hint?: string } // trailing NON-selectable group (e.g. non-chat specialists) — visible so users see WHY they can't pick them
  annotations?: Record<string, string> // id → dim right-aligned note on its row (e.g. "128k ctx")
  labels?: Record<string, string> // id → display label (non-model uses: destination combo shows conversation TITLES over opaque ids; search matches both)
  searchPlaceholder?: string // open-state hint — non-model uses say what they search
  noMatchLabel?: string
  wide?: boolean // let the open list grow past the input width (long labels, e.g. destinations) — keep OFF near the viewport's right edge
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [dropUp, setDropUp] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null) // the ▼ toggle hands focus back to the input

  // notify the host on open-transition only (ref so an inline callback prop
  // doesn't refire the effect on every parent render while the list is open)
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen
  useEffect(() => { if (open) onOpenRef.current?.() }, [open])

  const q = query.trim().toLowerCase()
  // pinned options carry their own display labels; merge them with `labels` (the labels prop
  // wins) so closed-state text + rows + search all resolve a sentinel value to its label.
  const allLabels = useMemo(
    () => ({ ...Object.fromEntries(pinnedOptions.map((o) => [o.value, o.label])), ...(labels || {}) }),
    [pinnedOptions, labels],
  )
  const pinnedSet = useMemo(() => new Set(pinnedOptions.map((o) => o.value)), [pinnedOptions])
  const groups: Group[] = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const id of items) {
      if (q && !id.toLowerCase().includes(q) && !allLabels[id]?.toLowerCase().includes(q)) continue
      const provider = id.includes('/') ? id.slice(0, id.indexOf('/')) : 'other'
      if (!map.has(provider)) map.set(provider, [])
      map.get(provider)!.push(id)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([provider, ids]) => ({
        provider,
        label: byokProviders?.has(provider) ? `${provider} · yours (BYOK)` : provider,
        ids,
      }))
  }, [items, q, byokProviders, allLabels])

  const visiblePinned = useMemo(
    () => pinnedOptions.filter((o) => !q || o.label.toLowerCase().includes(q)),
    [pinnedOptions, q],
  )

  // flat pick list for keyboard nav (empty option, then pinned specials, then the groups);
  // unavailable ids are NOT pickable, so they never enter the flat list
  const flat: string[] = useMemo(() => {
    const out: string[] = []
    if (emptyLabel !== undefined && (!q || emptyLabel.toLowerCase().includes(q))) out.push('')
    for (const o of visiblePinned) out.push(o.value)
    for (const g of groups) out.push(...g.ids)
    return out
  }, [groups, emptyLabel, q, visiblePinned])

  const unavailIds = useMemo(
    () => (unavailable?.ids ?? []).filter((id) => !q || id.toLowerCase().includes(q)),
    [unavailable, q],
  )

  // Outside dismissal must START and END outside (lib/overlay) — on plain mousedown, pressing
  // outside and dragging into the list closed it mid-gesture. Option picks are unaffected: they
  // live inside boxRef, so they never count as "outside" either way.
  useEffect(() => attachOutsideDismiss(
    (t) => Boolean(boxRef.current?.contains(t)),
    () => setOpen(false),
  ), [])

  // flip the list above the input when the viewport below can't fit it (max-h-72 = 288px);
  // layout effect so the very first paint is already on the right side (no flicker)
  useLayoutEffect(() => {
    if (!open) return
    const r = boxRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    setDropUp(below < 300 && r.top > below)
  }, [open])

  // keep the active row in view while arrowing
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const pick = (id: string) => {
    onChange(id)
    setQuery('')
    setOpen(false)
  }

  const closedText = actionMode
    ? ''
    : value
      ? (allLabels[value] ?? (showFullValue ? value : shortId(value)))
      : (emptyLabel ?? '')

  // TWO different things a × can clear here, and conflating them is what made the chat's model picker look
  // like it was missing the affordance (Ote spotted it). It sets clearable={false} ON PURPOSE — a conversation
  // always has a model, so there is no valid empty state to clear TO. But the box is also a SEARCH field, and
  // while you are typing there was no way to clear the QUERY except select-all-delete.
  //   typing (open + query)  → × clears the SEARCH TEXT   (available even when clearable={false})
  //   otherwise              → × clears the VALUE          (only when clearable)
  // One at a time, same position, so the affordance is always present without ever inventing an invalid state.
  const showQueryClear = open && query !== '' && !disabled
  const showValueClear = clearable && !actionMode && value !== '' && !disabled && !showQueryClear
  const showClear = showQueryClear || showValueClear

  // item rows indent (pl-5) only when group headers actually render — a bare-id list
  // (single 'other' group, headers skipped) must keep every row at the same level
  const grouped = !(groups.length === 1 && groups[0]?.provider === 'other')
  const row = (id: string, flatIdx: number) => (
    <div
      key={id || '(empty)'}
      data-active={flatIdx === active}
      className={`flex items-center justify-between gap-3 px-3 py-1.5 text-[13px] cursor-pointer ${flatIdx === active ? 'bg-[var(--code-bg)]' : ''} ${id === value && !actionMode ? 'font-semibold' : ''} ${id && grouped && !pinnedSet.has(id) ? 'pl-5' : ''}`}
      onMouseDown={(e) => { e.preventDefault(); pick(id) }}
      onMouseEnter={() => setActive(flatIdx)}
    >
      <span className="min-w-0 truncate">{id ? (allLabels[id] ?? shortId(id)) : emptyLabel}</span>
      {id && annotations?.[id] && <span className="shrink-0 text-[11px] text-muted">{annotations[id]}</span>}
    </div>
  )

  let flatIdx = -1
  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        className={`gw-input w-full ${showClear ? 'pr-12' : 'pr-7'}`}
        value={open ? query : closedText}
        placeholder={open ? searchPlaceholder : (closedText || placeholder)}
        disabled={disabled}
        onFocus={() => { if (disabled) return; setOpen(true); setQuery(''); setActive(0) }}
        // REOPEN ON CLICK — the bug Ote hit: picking a model closes the list but leaves the input FOCUSED, and
        // the list only opened `onFocus`. Focus never left, so clicking the box again fired no focus event and
        // nothing happened; you had to click away and back to change your mind. A closed combo must reopen on
        // click, full stop. (Click while ALREADY open is left alone, so you can still place the caret in your
        // query instead of having the list snap shut under you.)
        onMouseDown={() => { if (disabled || open) return; setOpen(true); setQuery(''); setActive(0) }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, flat.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); if (open && flat[active] !== undefined) pick(flat[active]) }
          // ESCAPE = CANCEL, and it must leave NO residue. It already left the value alone (only pick() commits),
          // but a typed query used to survive in state, so the next open briefly showed a stale filter. Clearing
          // it here makes "escape reverts to the previous selection" true of what you SEE, not just of the value.
          else if (e.key === 'Escape' && open) { e.stopPropagation(); setQuery(''); setActive(0); setOpen(false); (e.target as HTMLInputElement).blur() }
        }}
        spellCheck={false}
        autoComplete="off"
      />
      {showClear && (
        <button
          type="button"
          title={showQueryClear ? 'Clear search' : 'Clear'}
          aria-label={showQueryClear ? 'Clear search' : 'Clear selection'}
          className="gw-clearable-btn absolute right-6 top-1/2 -translate-y-1/2 flex items-center justify-center px-1 text-muted hover:text-ink text-[15px] leading-none"
          onMouseDown={(e) => {
            e.preventDefault(); e.stopPropagation()
            // Clearing the SEARCH keeps the list open and the selection intact — you are refining a query, not
            // discarding your choice. Clearing the VALUE closes the list, which is the end of an interaction.
            if (showQueryClear) { setQuery(''); setActive(0); return }
            onChange(''); setQuery(''); setOpen(false)
          }}
        >×</button>
      )}
      {/* The arrow was pointer-events-none — the one element that LOOKS like an expander did nothing, which is
          half of why a closed-but-focused combo felt stuck. It is a real toggle now: open it, or close it if it
          is already open. Kept out of the tab order (tabIndex -1) because the input is the focusable control and
          the keyboard already has ArrowDown/Escape; a second tab stop here would only add a dead step. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        title={open ? 'Close' : 'Show options'}
        className="gw-clearable-btn absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center px-1.5 py-1 text-muted hover:text-ink text-[10px] leading-none disabled:opacity-40"
        disabled={disabled}
        onMouseDown={(e) => {
          e.preventDefault() // don't steal focus from the input
          if (disabled) return
          if (open) { setOpen(false); return }
          setQuery(''); setActive(0); setOpen(true)
          inputRef.current?.focus()
        }}
      >▼</button>
      {open && (
        <div ref={listRef} className={`absolute ${wide ? 'left-0 w-max min-w-full max-w-[min(420px,88vw)]' : 'left-0 right-0'} ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'} z-30 max-h-72 overflow-auto bg-panel-strong border border-line rounded-lg shadow-modal py-1`}>
          {emptyLabel !== undefined && (!q || emptyLabel.toLowerCase().includes(q)) && (flatIdx++, row('', flatIdx))}
          {visiblePinned.map((o) => (flatIdx++, row(o.value, flatIdx)))}
          {groups.map((g) => (
            <div key={g.provider}>
              {/* bare-id lists (single 'other' group) skip the header — nothing to group by */}
              {!(groups.length === 1 && g.provider === 'other') && (
                <div className="px-3 pt-2 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-muted select-none">{g.label}</div>
              )}
              {g.ids.map((id) => (flatIdx++, row(id, flatIdx)))}
            </div>
          ))}
          {unavailIds.length > 0 && (
            <div data-combo-unavailable>
              <div className="px-3 pt-2 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-muted select-none">{unavailable!.label}</div>
              {unavailIds.map((id) => (
                <div
                  key={id}
                  className="px-3 py-1.5 pl-5 text-[13px] text-muted opacity-60 cursor-not-allowed select-none"
                  title={unavailable!.hint || 'Not selectable here'}
                  onMouseDown={(e) => e.preventDefault()} // dead row — never picks, never closes
                >
                  {id}
                </div>
              ))}
            </div>
          )}
          {flat.length === 0 && unavailIds.length === 0 && <div className="px-3 py-1.5 text-[13px] adm-dim">{noMatchLabel}</div>}
        </div>
      )}
    </div>
  )
}
