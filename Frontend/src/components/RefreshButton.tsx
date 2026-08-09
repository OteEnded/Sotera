import { useState } from 'react'

// Soft refresh — re-fetch a page/list's data from the server without a full browser
// reload. Drop it next to a list heading and wire onRefresh to the page's load fn.
// The ↻ spins briefly (even on an instant fetch) so the click registers visually.
export default function RefreshButton({
  onRefresh,
  title = 'Refresh from server',
  label,
  className = '',
}: {
  onRefresh: () => void | Promise<void>
  title?: string
  label?: string // optional text beside the icon (e.g. "Refresh")
  className?: string
}) {
  const [spinning, setSpinning] = useState(false)
  const run = async () => {
    if (spinning) return
    setSpinning(true)
    const started = Date.now()
    try {
      await onRefresh()
    } finally {
      // keep the spin visible ~450ms minimum so a cached/instant load still reads as an action
      const rest = Math.max(0, 450 - (Date.now() - started))
      setTimeout(() => setSpinning(false), rest)
    }
  }
  return (
    <button
      type="button"
      className={`gw-btn adm-btn-sm inline-flex items-center gap-1.5 ${className}`}
      title={title}
      aria-label={title}
      aria-busy={spinning}
      disabled={spinning}
      onClick={() => void run()}
    >
      <span className={spinning ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
      {label && <span>{label}</span>}
    </button>
  )
}
