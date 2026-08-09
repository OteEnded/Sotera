import { useState, type ReactNode } from 'react'
import { ui } from '../pages/admin/ui'
import { dismissOnBackdrop } from '../lib/overlay'

// Shared confirmation modal for destructive actions (replaces scattered window.confirm).
// `typeToConfirm` gates the button behind typing an exact string (for the truly
// irreversible ones, e.g. deleting a user).
export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  typeToConfirm,
  busyLabel = 'Working…',
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string // override when "Cancel" is ambiguous (e.g. cancelling a thing: Keep it / Withdraw)
  typeToConfirm?: string
  busyLabel?: string
  danger?: boolean // false = positive confirmation (primary button, not red)
  onConfirm: () => void | Promise<void>
  onClose: () => void
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const blocked = Boolean(typeToConfirm) && typed !== typeToConfirm

  const confirm = async () => {
    setBusy(true); setErr('')
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className={ui.modalOverlay} {...dismissOnBackdrop(onClose)}>
      <div className={ui.modalCard} style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className={ui.modalHead}>
          <h3 className={ui.modalTitle}>{title}</h3>
          <button className="gw-btn adm-btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="text-[14px] leading-relaxed">{message}</div>
        {typeToConfirm && (
          <label className={`${ui.field} mt-3`}>
            <span className={ui.fieldLabel}>Type <b>{typeToConfirm}</b> to confirm</span>
            <input className="gw-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
        )}
        {err && <div className="gw-meta gw-error mt-2">{err}</div>}
        <div className={ui.modalActions}>
          <button className="gw-btn" onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button className={danger ? 'gw-btn adm-btn-danger' : 'gw-btn gw-btn-primary'} disabled={busy || blocked} onClick={() => void confirm()}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
