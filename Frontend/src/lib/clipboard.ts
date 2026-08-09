// Clipboard copy that survives a NON-secure context (plain HTTP).
//
// navigator.clipboard exists ONLY in a secure context — HTTPS, or localhost/
// 127.0.0.1. A beta tester reaching the box over http://<lan-ip>:8201 has
// navigator.clipboard === undefined, so writeText() throws and every copy button
// showed "Could not copy to clipboard". This is CONTEXT-dependent, not OS-dependent:
// it fails in every browser over plain HTTP and works for the dev on localhost —
// which is exactly the reported pattern (Mac/Linux first, then some Windows too).
//
// Strategy: use the async Clipboard API when the context is secure, otherwise fall
// back to the legacy execCommand('copy') via an off-screen textarea, which works
// over HTTP. Must be called from within a user gesture (all our callers are click
// handlers). Returns true on success so callers can show ✓ or an error.

export async function copyToClipboard(text: string): Promise<boolean> {
  // Preferred path — async Clipboard API (secure contexts only).
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // permission denied / transient — fall through to the legacy path
    }
  }
  return legacyCopy(text)
}

// Off-screen textarea + document.execCommand('copy'). Deprecated but still the only
// clipboard write available over plain HTTP in current browsers.
function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '') // don't pop the mobile keyboard
    ta.style.position = 'fixed' // fixed + off-screen = no scroll jump on focus
    ta.style.top = '-9999px'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    const prevSelection = document.getSelection()?.rangeCount ? document.getSelection()!.getRangeAt(0) : null
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, text.length) // iOS/Safari needs an explicit range
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    // restore whatever the user had selected before we hijacked it
    if (prevSelection) {
      const sel = document.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(prevSelection)
    }
    return ok
  } catch {
    return false
  }
}
