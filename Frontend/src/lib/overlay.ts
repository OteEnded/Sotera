// Backdrop dismissal that doesn't fire on a DRAG across the modal edge.
//
// THE BUG THIS REPLACES (Ote, 2026-08-03). Every overlay used `onClick={onClose}` on the
// backdrop with `stopPropagation` on the card. But a `click` event fires on the nearest
// COMMON ANCESTOR of the mousedown and mouseup targets — and for any press/release pair that
// straddles the card edge, that ancestor is the backdrop. So the modal closed, with no
// warning, in two everyday cases:
//   • miss the card, hold, drag in, release inside  → click lands on the backdrop → closed
//   • select text inside, drift a few px past the edge, release → same → closed, edits lost
// `stopPropagation` on the card cannot help: the click was never dispatched on the card.
//
// THE RULE (Ote's ask): dismiss only when the gesture STARTS and ENDS on the backdrop.
//
// Not a hook on purpose — these overlays are rendered inside conditionals
// (`{editing && <div {...dismissOnBackdrop(close)}>}`), where a hook call would be
// conditional and violate the rules of hooks. State lives module-level instead, keyed by the
// backdrop ELEMENT, which is safe because a pointer gesture is globally singular: only one
// press can be in flight at a time, and nested modals compare different elements.
let armed: EventTarget | null = null

/**
 * Spread onto a modal backdrop: `<div className={ui.modalOverlay} {...dismissOnBackdrop(onClose)}>`.
 * Replaces `onClick={onClose}` — do not use both, or the old behaviour comes back.
 *
 * `e.target === e.currentTarget` is what distinguishes the backdrop from its contents, so the
 * card no longer needs `stopPropagation` for dismissal to behave (existing ones are harmless).
 */
/**
 * The same rule for popups that have NO backdrop element and instead listen on the document
 * (comboboxes, row menus). Call from an effect while the popup is open; returns the cleanup.
 *
 * These previously closed on `mousedown` outside, which dismisses the moment you press — so
 * pressing outside and dragging into the panel closed it too, and a right-click outside
 * dismissed it. `isInside` should return true for the panel AND its trigger, so clicking the
 * trigger toggles instead of being handled twice.
 */
export function attachOutsideDismiss(isInside: (target: Node) => boolean, onClose: () => void) {
  let downOutside = false
  const onDown = (e: PointerEvent) => {
    downOutside = e.button === 0 && !isInside(e.target as Node)
  }
  const onUp = (e: PointerEvent) => {
    const dismiss = downOutside && e.button === 0 && !isInside(e.target as Node)
    downOutside = false // a release anywhere ends the gesture
    if (dismiss) onClose()
  }
  document.addEventListener('pointerdown', onDown)
  document.addEventListener('pointerup', onUp)
  return () => {
    document.removeEventListener('pointerdown', onDown)
    document.removeEventListener('pointerup', onUp)
  }
}

export function dismissOnBackdrop(onClose: () => void) {
  return {
    onPointerDown: (e: React.PointerEvent) => {
      // Only a press on the backdrop ITSELF arms dismissal. Also ignore secondary buttons:
      // a right-click / context-menu press should never close a dialog.
      armed = e.target === e.currentTarget && e.button === 0 ? e.currentTarget : null
    },
    onPointerUp: (e: React.PointerEvent) => {
      const dismiss = armed === e.currentTarget && e.target === e.currentTarget && e.button === 0
      armed = null // always disarm — a release anywhere ends the gesture
      if (dismiss) onClose()
    },
  }
}
