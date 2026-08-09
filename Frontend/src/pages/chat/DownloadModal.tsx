import { useState } from 'react'
import { ui } from '../admin/ui'
import { dismissOnBackdrop } from '../../lib/overlay'

export type ExportFormat = 'md' | 'json' | 'html'
export type ExportBlob = { content: string; mime: string; ext: string }

const FORMATS: { key: ExportFormat; label: string; hint: string }[] = [
  { key: 'md', label: 'Markdown', hint: 'readable text — reasoning + tool traces inline' },
  { key: 'json', label: 'JSON', hint: 'full structured data — messages, tools, metrics' },
  { key: 'html', label: 'HTML', hint: 'styled page like the chat — opens in any browser' },
]

// Strip anything that isn't safe in a filename; the extension is added from the format.
const cleanName = (raw: string) =>
  raw.replace(/\.[a-z0-9]+$/i, '').replace(/[^\w -]+/g, '_').replace(/^[\s_]+|[\s_]+$/g, '').slice(0, 80) || 'chat'

// The File System Access API (Chromium) lets the user pick a folder + filename.
const canPickLocation = typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function'

export default function DownloadModal({
  defaultName,
  build,
  onClose,
}: {
  defaultName: string
  build: (format: ExportFormat, opts?: { embedImages?: boolean }) => Promise<ExportBlob> | ExportBlob
  onClose: () => void
}) {
  const [format, setFormat] = useState<ExportFormat>('md')
  const [name, setName] = useState(defaultName)
  const [embedImages, setEmbedImages] = useState(true) // HTML only
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // ext === the format key for all three formats — no need to build() just to show it
  // (building HTML renders markdown, which is too heavy to run on every keystroke).
  const finalName = () => `${cleanName(name)}.${format}`
  const buildOpts = () => ({ embedImages })

  // Quick download → straight to the browser's default download folder (blob + anchor).
  const quickDownload = async () => {
    setBusy(true); setErr('')
    try {
      const { content, mime, ext } = await build(format, buildOpts())
      const url = URL.createObjectURL(new Blob([content], { type: mime }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${cleanName(name)}.${ext}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  // Download… → File System Access picker (choose folder + name), falls back to quick.
  const pickAndDownload = async () => {
    if (!canPickLocation) return quickDownload()
    setBusy(true); setErr('')
    try {
      const { content, mime, ext } = await build(format, buildOpts())
      const picker = (window as unknown as {
        showSaveFilePicker: (o: unknown) => Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }>
      }).showSaveFilePicker
      const handle = await picker({
        suggestedName: `${cleanName(name)}.${ext}`,
        types: [{ description: format.toUpperCase(), accept: { [mime]: [`.${ext}`] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(new Blob([content], { type: mime }))
      await writable.close()
      onClose()
    } catch (e) {
      // user cancelled the picker — not an error
      if ((e as { name?: string })?.name === 'AbortError') { setBusy(false); return }
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className={ui.modalOverlay} {...dismissOnBackdrop(onClose)}>
      <div className={ui.modalCard} style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className={ui.modalHead}>
          <h3 className={ui.modalTitle}>Download conversation</h3>
          <button className="gw-btn adm-btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className={ui.field}>
          <span className={ui.fieldLabel}>Format</span>
          <div className="flex flex-col gap-1.5">
            {FORMATS.map((f) => (
              <label key={f.key} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${format === f.key ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/40'}`}>
                <input type="radio" name="dl-format" className="w-4 h-4 shrink-0 accent-accent" checked={format === f.key} onChange={() => setFormat(f.key)} />
                <span className="flex flex-col min-w-0">
                  <span className="text-[13px] font-semibold">{f.label} <span className="adm-dim font-normal">.{f.key}</span></span>
                  <span className="adm-dim text-[12px]">{f.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {format === 'html' && (
          <div className={ui.field}>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 shrink-0 accent-accent" checked={embedImages} onChange={(e) => setEmbedImages(e.target.checked)} />
              <span className="text-[13px]">Embed attached images
                <span className="adm-dim font-normal"> — self-contained file, larger</span>
              </span>
            </label>
            <span className="adm-dim text-[11px] leading-snug">
              {embedImages
                ? 'Images are stored inside the .html so it shows them anywhere. '
                : 'Images become a short "(image attachment)" note — smallest file. '}
              For a pixel-perfect capture, use your browser’s <b>Save Page As…</b> or a page-capture extension.
            </span>
          </div>
        )}

        <label className={ui.field}>
          <span className={ui.fieldLabel}>Filename</span>
          <div className="flex items-center gap-2">
            <input className="gw-input flex-1" value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} autoComplete="off" />
            <span className="adm-dim text-[13px] whitespace-nowrap">.{format}</span>
          </div>
          <span className="adm-dim text-[11px]">Saves as <b>{finalName()}</b></span>
        </label>

        {err && <div className="gw-meta gw-error">{err}</div>}

        <div className={ui.modalActions}>
          <button className="gw-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="gw-btn" onClick={quickDownload} disabled={busy} title="Save straight to your browser's download folder">Quick download</button>
          {canPickLocation && (
            <button className="gw-btn gw-btn-primary" onClick={() => void pickAndDownload()} disabled={busy} title="Choose where to save">
              {busy ? 'Saving…' : 'Download…'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
