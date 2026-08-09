import { Component, type ErrorInfo, type ReactNode } from 'react'
import { BOOT_GUARD, CHUNK_GUARD } from '../lib/lazyWithReload'

// Last line of defense against a blank screen: catches any render-time crash —
// including a lazy route chunk that still failed to import after the one-shot
// auto-reload — and shows a labelled fallback with a Reload button instead of an
// empty page. (Chunk failures normally auto-recover in lazyWithReload before they
// ever reach here; this handles the "even a reload didn't help" tail + real bugs.)

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('RootErrorBoundary caught:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: 380, padding: 24, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>This page didn’t finish loading</div>
          <div className="adm-dim" style={{ fontSize: 13 }}>
            A network hiccup or an app update can cause this. Reloading usually fixes it.
          </div>
          <div>
            <button
              className="gw-btn gw-btn-primary"
              onClick={() => {
                // clear both one-shot guards so the manual reload gets a fresh budget
                try { sessionStorage.removeItem(BOOT_GUARD); sessionStorage.removeItem(CHUNK_GUARD) } catch { /* storage blocked */ }
                window.location.reload()
              }}
            >Reload</button>
          </div>
        </div>
      </div>
    )
  }
}
