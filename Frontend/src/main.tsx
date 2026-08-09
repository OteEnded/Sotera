import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initAppConfig } from './config'
import RootErrorBoundary from './components/RootErrorBoundary'

// Load runtime config, but NEVER let it block the mount. This used to be a bare
// top-level `await initAppConfig()`; a stalled /config.json hung it forever and the
// page stayed a blank gradient until a manual refresh. initAppConfig now self-times-out
// and falls back to defaults, and we guard here too — the app always renders.
try {
  await initAppConfig()
} catch {
  /* defaults already applied inside initAppConfig */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
