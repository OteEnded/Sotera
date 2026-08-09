import { useEffect } from 'react'
import { openDataUrl } from '../lib/image'
import { dismissOnBackdrop } from '../lib/overlay'

// Full-screen image preview (the chat's lightbox, shared). Click the backdrop or press
// Escape to close; "open in new tab" is the escape hatch. Renders nothing when src is null.
// Reuses the .chat-lightbox styles so every preview across the app looks identical.
export default function ImageLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, onClose])

  if (!src) return null
  return (
    <div className="chat-lightbox" {...dismissOnBackdrop(onClose)}>
      <img src={src} alt="preview" onClick={(e) => e.stopPropagation()} />
      <button className="chat-lightbox-close" title="Close (Esc)" onClick={onClose}>×</button>
      <button className="chat-lightbox-open" onClick={(e) => { e.stopPropagation(); openDataUrl(src) }}>open in new tab ↗</button>
    </div>
  )
}
