// Console UI — shared Tailwind utility-class strings (utility-first; single source so the
// admin pages stay visually consistent). Shared cross-app primitives (gw-btn, gw-input,
// gw-check, adm-dim, adm-btn-sm) remain CSS components in index.css because the chat app
// uses them too; everything page-layout-ish here is Tailwind.

export const ui = {
  // page scaffold
  page: 'w-full max-w-[1040px] mx-auto pb-12',
  h2: 'mt-1 mb-1.5 text-[22px]',

  // forms
  formRow: 'flex flex-wrap items-center gap-2',
  formCol: 'flex flex-col items-stretch gap-2',
  field: 'flex flex-col gap-1',
  fieldLabel: 'text-xs text-muted',
  scopes: 'flex flex-wrap gap-3.5 mt-1',
  // section header inside a settings card grid — spans both columns, divider above
  // (suppressed when it's the first child so the card doesn't open with a rule)
  groupHead: 'md:col-span-2 mt-1.5 pt-3 border-t border-line text-[11px] tracking-[0.05em] uppercase text-muted font-semibold first:mt-0 first:pt-0 first:border-t-0',

  // table (fixed layout — pair with an explicit <colgroup>)
  //
  // ⚠️ ON A PHONE THESE MUST SCROLL, NOT CLIP. Measured 2026-08-04 at 390px: the API Keys table is
  // 819px wide, so 52% of it was simply unreachable — no sideways page scroll (so the audit's
  // overflow check passed) and no way to swipe to it either. `min-w` keeps the columns legible
  // instead of letting `w-full` crush eight columns into 390px, and `tableWrap` below is what
  // actually scrolls. A CSS-only alternative (display:block on the table) was tried and rejected:
  // it scrolls, but it drops `table-layout: fixed`, which ballooned the same table to 1,545px with
  // a 668px first column.
  table: 'w-full table-fixed border-collapse mt-4 bg-panel-strong border border-line rounded-[10px] overflow-hidden text-[13px] max-[720px]:min-w-[680px]',

  /** Wrap every `ui.table` in this. Scrolls only where it must — desktop is untouched. */
  tableWrap: 'max-[720px]:overflow-x-auto max-[720px]:overscroll-x-contain',
  th: 'text-left py-[9px] px-3 border-b border-line bg-[var(--code-bg)] text-[11px] tracking-[0.04em] uppercase text-muted font-semibold whitespace-nowrap align-middle',
  td: 'text-left py-[9px] px-3 align-middle',
  tdBorder: 'border-b border-line', // omit on the last row
  tdClip: 'whitespace-nowrap overflow-hidden text-ellipsis', // compact one-line cells
  empty: 'text-center text-muted py-[22px]',
  // Dim the INFO cells of a disabled row — never the whole <tr>: row-level opacity
  // would gray out the action buttons too, which must stay clearly actionable.
  cellDim: 'opacity-50',
  rowDisabled: 'opacity-50', // deprecated for rows with actions — use cellDim per info cell
  rowSystem: 'bg-[var(--think-soft)]', // system rows (e.g. chat keys) — subtly set apart
  actions: 'flex flex-nowrap gap-1.5',
  codeChip: 'bg-[var(--code-bg)] px-[5px] py-px rounded text-xs',
  // system/chat key badge — used wherever a kind='chat' key appears (keys list, usage).
  // Reuses the --think (purple) token family, same as reasoning-block chips elsewhere —
  // theme-aware, unlike the old hardcoded violet-* Tailwind utilities that only looked
  // right in light mode.
  badgeChat: 'inline-block align-middle rounded-full bg-[var(--think-soft)] text-[var(--think)] border border-[var(--think-edge)] px-2 py-px text-[11px] font-medium whitespace-nowrap',

  // edit modal (mirrors the chat memory modal look)
  modalOverlay: 'fixed inset-0 z-50 p-5 bg-[var(--overlay)] grid place-items-center',
  modalCard: 'w-full max-w-[560px] max-h-[85vh] overflow-y-auto bg-panel-strong border border-line rounded-2xl p-5 shadow-modal flex flex-col gap-3',
  modalHead: 'flex items-center justify-between',
  modalTitle: 'm-0 text-lg',
  modalActions: 'flex gap-2 justify-end mt-1',

  // "key minted" success box
  minted: 'mt-3 bg-[var(--ok-soft)] border border-[var(--ok-edge)] rounded-lg px-3 py-2.5',
  mintedKey: 'block mt-1.5 break-all text-[13px] bg-surface px-2.5 py-2 rounded-md border border-line',
}

/** td classes: base + optional compact-clip + bottom border except on the last row. */
export const cell = (isLastRow: boolean, clip = false) =>
  `${ui.td} ${clip ? ui.tdClip : ''} ${isLastRow ? '' : ui.tdBorder}`
