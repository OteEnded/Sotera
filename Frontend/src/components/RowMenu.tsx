import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { attachOutsideDismiss } from '../lib/overlay'

// Overflow ("⋯") menu for a table row's secondary actions. Keeps the primary action
// visible next to it and folds the rest in here, so a row with 6 buttons stops eating
// the width the DATA columns need.
//
// ⚠️ WHY FIXED POSITIONING, not absolute: `ui.table` carries `overflow-hidden` (it is what
// clips the table's rounded corners). An absolutely-positioned panel inside a row is
// therefore CLIPPED by the table box — the menu would open and be invisible. Fixed
// positioning takes it out of that clipping context entirely; the trade-off is that a
// fixed panel does NOT travel with the page, so scroll/resize closes it (see below).

export type RowMenuItem = {
  label: string
  onSelect: () => void
  title?: string
  danger?: boolean
  /** Skip rendering entirely — lets callers write capability gates inline. */
  hidden?: boolean
}

const MENU_W = 200
const EST_ITEM_H = 34 // enough to decide flip-up before the panel is measured

export default function RowMenu({ items, label = 'More actions', dataUi }: {
  items: RowMenuItem[]
  label?: string
  dataUi?: string
}) {
  const shown = items.filter((i) => !i.hidden)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Anchor to the button, then keep the panel inside the viewport: flip above when there
  // isn't room below, and clamp horizontally so a right-edge row doesn't push it off-screen.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const h = panelRef.current?.offsetHeight ?? shown.length * EST_ITEM_H + 10
    const below = window.innerHeight - r.bottom
    const top = below < h + 8 && r.top > below ? Math.max(8, r.top - h - 4) : r.bottom + 4
    const left = Math.min(Math.max(8, r.right - MENU_W), window.innerWidth - MENU_W - 8)
    setPos({ top, left })
  }, [open, shown.length])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btnRef.current?.focus() }
    }
    // A FIXED panel can't follow the row, so scrolling would leave it stranded beside
    // unrelated content — close instead of trying to chase the anchor.
    const onScroll = () => setOpen(false)
    // Outside dismissal must START and END outside (lib/overlay) — pressing outside and
    // dragging into the menu used to dismiss it on mousedown alone.
    const detachOutside = attachOutsideDismiss(
      (t) => Boolean(panelRef.current?.contains(t) || btnRef.current?.contains(t)),
      () => setOpen(false),
    )
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true) // capture: catches scrollable ancestors too
    window.addEventListener('resize', onScroll)
    return () => {
      detachOutside()
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  if (!shown.length) return null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="gw-btn adm-btn-sm"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((o) => !o)}
      >⋯</button>
      {open && pos && (
        <div
          ref={panelRef}
          role="menu"
          data-ui={dataUi}
          className="fixed z-[80] flex flex-col gap-0.5 rounded-[10px] border border-line bg-panel-strong p-1 shadow-modal"
          style={{ top: pos.top, left: pos.left, width: MENU_W }}
        >
          {shown.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              title={it.title}
              className={`rounded-[7px] border-0 bg-transparent px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                it.danger
                  ? 'text-[var(--danger)] hover:bg-[var(--danger-soft)]'
                  : 'text-ink hover:bg-[var(--wash)]'
              }`}
              onClick={() => { setOpen(false); it.onSelect() }}
            >{it.label}</button>
          ))}
        </div>
      )}
    </>
  )
}
