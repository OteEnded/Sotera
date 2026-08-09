import { type ReactNode } from 'react'
import { ui } from './ui'
import { type UserOpt } from './UserCombo'
import { dismissOnBackdrop } from '../../lib/overlay'

// Full user row from /v1/admin/users — enough for the detail card.
export type UserInfo = UserOpt & { email?: string | null; displayName?: string | null; isActive?: boolean; roles?: string[] }

// User detail card, opened by clicking a username in the admin tables (Usage's User
// column, API Keys' Owner column). 'root' (the config superuser) has no DB profile.
export default function UserDetailModal({ username, users, onClose }: {
  username: string; users: UserInfo[]; onClose: () => void
}) {
  const u = users.find((x) => x.username === username) || null
  const isRoot = username === 'root' && !u
  const line = (k: string, v: ReactNode) => (
    <div className="flex justify-between gap-4 border-b border-line/60 py-1 text-[13px]"><span className="text-muted">{k}</span><span className="text-right break-all">{v}</span></div>
  )
  return (
    <div className={ui.modalOverlay} {...dismissOnBackdrop(onClose)}>
      <div className={ui.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={ui.modalHead}>
          <h3 className={ui.modalTitle}>User — {username}</h3>
          <button className="gw-btn adm-btn-sm" onClick={onClose}>✕</button>
        </div>
        {isRoot ? (
          <div>
            {line('Username', 'root (config superuser)')}
            {line('Profile', 'No database profile — identity lives in Backend/config.json (auth.root)')}
            {line('Roles', 'root (passes every permission check)')}
          </div>
        ) : u ? (
          <div>
            {line('Username', u.username)}
            {line('Display name', u.displayName || '—')}
            {line('Email', u.email || '— (no account recovery)')}
            {line('Roles', (u.roles || []).join(', ') || '—')}
            {line('Active', u.isActive === false ? 'disabled' : '✓')}
            {line('User id', u.id)}
          </div>
        ) : (
          <p className="adm-dim">No matching user found — the account may have been deleted or renamed since this was logged.</p>
        )}
        <div className={ui.modalActions}>
          <button className="gw-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
