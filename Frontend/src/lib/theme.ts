// Theme manager — one source of truth for light/dark.
//
// The PREFERENCE is three-valued (Discord-like): 'light' | 'dark' | 'system' (follow the
// device). It lives in the user's chat prefs (DB — syncs across devices) and is mirrored
// into localStorage so the NEXT page load paints correctly before any network round-trip
// (index.html reads the mirror pre-stylesheet; its no-data default is DARK on purpose —
// never flashbang someone in a dark room while their real preference loads).

export type ThemePref = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'ote:theme'
const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null
let currentPref: ThemePref = readStored() ?? 'dark'
let mediaHooked = false

function readStored(): ThemePref | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : null
  } catch {
    return null
  }
}

export function resolvedTheme(pref: ThemePref = currentPref): 'light' | 'dark' {
  if (pref === 'system') return media?.matches ? 'light' : 'dark'
  return pref
}

function paint(theme: 'light' | 'dark', animate: boolean) {
  const el = document.documentElement
  if (el.dataset.theme === theme) return
  if (animate) {
    el.classList.add('theme-anim')
    window.setTimeout(() => el.classList.remove('theme-anim'), 450)
  }
  el.dataset.theme = theme
  // keep the mobile browser chrome in the same family
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171310' : '#f3efe7')
}

/**
 * Apply a preference: resolve it, paint the document (optionally with the switch
 * animation), cache it for the next boot, and — for 'system' — follow live device
 * changes for the rest of the session.
 */
export function applyThemePref(pref: ThemePref, { animate = false } = {}) {
  currentPref = pref
  try { localStorage.setItem(STORAGE_KEY, pref) } catch { /* storage blocked */ }
  paint(resolvedTheme(pref), animate)
  if (!mediaHooked && media) {
    mediaHooked = true
    media.addEventListener?.('change', () => {
      if (currentPref === 'system') paint(resolvedTheme('system'), true)
    })
  }
}

export function getThemePref(): ThemePref {
  return currentPref
}
