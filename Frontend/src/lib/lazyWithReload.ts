import { lazy, type ComponentType } from 'react'

// Guards shared with the index.html boot watchdog. TWO separate keys, on purpose, so
// the two recovery paths never interfere or stack into a reload loop:
//   CHUNK_GUARD — a route chunk failed to import (this module owns it)
//   BOOT_GUARD  — the app never mounted at all: main bundle failed / silent hang
//                 (the index.html watchdog owns it)
export const CHUNK_GUARD = 'ote:chunk-reloaded'
export const BOOT_GUARD = 'ote:boot-reloaded'

// Route-level code splitting emits hashed chunk filenames. After a redeploy a tab
// holding the OLD index.html asks for chunk hashes that no longer exist — the dynamic
// import rejects and the route renders blank (the "blank until refresh" report).
//
// On failure, reload the page ONCE (guarded) so the browser fetches fresh index.html +
// current chunks; clear the guard on a SUCCESSFUL load so a later, unrelated failure
// gets a fresh budget. If it still fails after that reload, rethrow so RootErrorBoundary
// shows a manual Reload fallback — never a blank page, never an infinite loop.
//
// No in-page retry: the browser caches a failed module by URL, so a second import()
// just re-returns the same rejection without a network request — only a full reload
// gets fresh module state.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors React.lazy's own signature
export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await factory()
      try { sessionStorage.removeItem(CHUNK_GUARD) } catch { /* storage blocked */ }
      return mod
    } catch (err) {
      try {
        if (sessionStorage.getItem(CHUNK_GUARD) !== '1') {
          sessionStorage.setItem(CHUNK_GUARD, '1')
          window.location.reload()
          return await new Promise<never>(() => {}) // hold render until the reload takes over
        }
      } catch { /* sessionStorage blocked — fall through to the boundary */ }
      throw err // already reloaded once → RootErrorBoundary shows the manual fallback
    }
  })
}
