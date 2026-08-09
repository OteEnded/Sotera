import { useCallback, useEffect, useRef, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import ConfirmModal from '../../components/ConfirmModal'
import RefreshButton from '../../components/RefreshButton'
import Req from '../../components/Req'
import RowMenu from '../../components/RowMenu'
import UserLimitsModal from './UserLimitsModal'
import { cell, ui } from './ui'
import { dismissOnBackdrop } from '../../lib/overlay'

// systemNote = the ADMIN-ONLY operational note (see mst_users.model.js). It arrives on the
// manage_users-gated admin routes only; never render it on a self-service surface.
type User = { id: string; username: string; email: string | null; displayName: string | null; isActive: boolean; roles: string[]; createdAt: string; systemNote: string | null }
type Change = { id: string; field: string; oldValue: string | null; newValue: string | null; changedBy: string; changedAt: string }
type ResetRequest = { id: string; identifier: string; claimedUsername: string | null; userId: string | null; username: string | null; email: string | null; status: string; handledBy: string | null; handledAt: string | null; ip: string | null; at: string }
type RoleRequest = { id: string; userId: string; username: string | null; email: string | null; requestedRole: string; note: string | null; status: string; handledBy: string | null; handledAt: string | null; ip: string | null; at: string }
type Tab = 'users' | 'resets' | 'devreqs' | 'deleted'
type DeletedUser = { id: string; username: string; email: string | null; displayName: string | null; roles: string[]; deletedAt: string; createdAt: string }

const ROLE_OPTIONS = ['admin', 'developer', 'power', 'member']

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

export default function UsersPage() {
  const { user: me, can } = useAuth()
  const isRoot = can('system_config')
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<User | null>(null)
  const [loginAsUser, setLoginAsUser] = useState<User | null>(null) // root "Log in as" confirmation

  // create form
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('member')

  // edit modal
  const [editing, setEditing] = useState<User | null>(null)
  const [draft, setDraft] = useState({ username: '', email: '', displayName: '', role: 'member', password: '', systemNote: '' })
  const [changes, setChanges] = useState<Change[]>([])

  // pending password-reset requests (manual flow: reset in Edit, contact via email, mark handled)
  const [resets, setResets] = useState<ResetRequest[]>([])
  const loadResets = useCallback(() => {
    apiGet('/v1/admin/reset-requests').then((r) => setResets(r.requests || [])).catch(() => {})
  }, [])

  // pending developer-access requests (grant the role in Edit, then mark handled)
  const [roleReqs, setRoleReqs] = useState<RoleRequest[]>([])
  const loadRoleReqs = useCallback(() => {
    apiGet('/v1/admin/role-requests').then((r) => setRoleReqs(r.requests || [])).catch(() => {})
  }, [])

  // root can inspect a user's saved memory (read-only). Persona Memory v2 = what the assistant recalls.
  type MemView = {
    username: string
    memories: { id: string; content: string; isEnabled: boolean; createdAt?: string }[]
    assistant: { id: string; kind: string; content: string; importance?: number | null; pinned?: boolean; entity?: string | null; attribute?: string | null }[]
  }
  const [memView, setMemView] = useState<MemView | null>(null)
  const openMemory = (u: User) => {
    apiGet(`/v1/admin/users/${u.id}/memory`).then(setMemView).catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  // per-user token limits (budget + override + boost grants)
  const [limitsFor, setLimitsFor] = useState<User | null>(null)

  // soft-deleted users (root's Deleted tab): restore or hard-delete for good
  const [deletedUsers, setDeletedUsers] = useState<DeletedUser[]>([])
  const [hardDeleting, setHardDeleting] = useState<DeletedUser | null>(null)
  const loadDeleted = useCallback(() => {
    apiGet('/v1/admin/users/deleted').then((r) => setDeletedUsers(r.users || [])).catch(() => {})
  }, [])

  // SERVER-side pagination + filter — the backend never ships the full user list to
  // this table (?q + ?page/pageSize); pickers elsewhere still use the no-page contract.
  const USERS_PAGE_SIZE = 50
  const [userQ, setUserQ] = useState('')
  const userQRef = useRef(userQ) // load() reads the live filter without re-creating itself
  userQRef.current = userQ
  const [userPage, setUserPage] = useState(1)
  const [userTotal, setUserTotal] = useState(0)
  const load = useCallback(async (p = 1, q?: string) => {
    setError('')
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(USERS_PAGE_SIZE) })
      const effQ = q !== undefined ? q : userQRef.current
      if (effQ.trim()) params.set('q', effQ.trim())
      const res = await apiGet(`/v1/admin/users?${params.toString()}`)
      setUsers(res.users)
      setUserTotal(res.total ?? res.users.length)
      setUserPage(res.page ?? p)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => { loadResets(); loadRoleReqs(); if (isRoot) loadDeleted() }, [loadResets, loadRoleReqs, loadDeleted, isRoot])
  // soft refresh: re-fetch the ACTIVE tab's data from the server (no browser reload)
  const refreshActive = useCallback(async () => {
    if (tab === 'resets') loadResets()
    else if (tab === 'devreqs') loadRoleReqs()
    else if (tab === 'deleted') loadDeleted()
    else await load(userPage)
  }, [tab, loadResets, loadRoleReqs, loadDeleted, load, userPage])
  // server-side filter: debounce the search box into a fresh page-1 load ('' on mount = initial load)
  useEffect(() => {
    const t = setTimeout(() => { void load(1, userQ) }, userQ ? 300 : 0)
    return () => clearTimeout(t)
  }, [userQ, load])

  // request tabs jump into Edit via a single-user fetch (the table is server-paginated,
  // so the matched user may not be on the loaded page)
  const openEditById = async (id: string) => {
    try {
      const r = await apiGet(`/v1/admin/users/${id}`)
      await openEdit(r.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const markHandled = async (r: ResetRequest) => {
    try { await apiPost(`/v1/admin/reset-requests/${r.id}/handled`, {}); loadResets() }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }

  const markRoleHandled = async (r: RoleRequest) => {
    try { await apiPost(`/v1/admin/role-requests/${r.id}/handled`, {}); loadRoleReqs() }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      await apiPost('/v1/admin/users', {
        username: username.trim(),
        password,
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        roles: [role],
      })
      setUsername(''); setPassword(''); setEmail(''); setDisplayName(''); setRole('member')
      await load(userPage)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const openEdit = async (u: User) => {
    setEditing(u)
    setDraft({ username: u.username, email: u.email || '', displayName: u.displayName || '', role: u.roles[0] || 'member', password: '', systemNote: u.systemNote || '' })
    setChanges([])
    try {
      const res = await apiGet(`/v1/admin/users/${u.id}/changes`)
      setChanges(res.changes)
    } catch { /* history is best-effort */ }
  }
  const closeEdit = () => setEditing(null)

  const saveEdit = async () => {
    if (!editing) return
    setError(''); setBusy(true)
    try {
      const body: Record<string, unknown> = {
        username: draft.username.trim() || undefined,
        email: draft.email.trim() || null,
        displayName: draft.displayName.trim() || null,
        roles: [draft.role],
        systemNote: draft.systemNote.trim() || null,
      }
      if (draft.password) body.password = draft.password
      await apiPatch(`/v1/admin/users/${editing.id}`, body)
      setEditing(null)
      await load(userPage)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (u: User) => {
    setError('')
    try { await apiPatch(`/v1/admin/users/${u.id}`, { isActive: !u.isActive }); await load(userPage) }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }

  const userPages = Math.max(1, Math.ceil(userTotal / USERS_PAGE_SIZE))

  const pendingResets = resets.filter((r) => r.status === 'pending')
  const handledResets = resets.filter((r) => r.status !== 'pending')
  const pendingRoleReqs = roleReqs.filter((r) => r.status === 'pending')
  const handledRoleReqs = roleReqs.filter((r) => r.status !== 'pending')

  const tabBtn = (k: Tab, label: string, pending: number) => (
    <button
      className={`gw-btn adm-btn-sm ${tab === k ? 'gw-btn-primary' : ''}`}
      onClick={() => setTab(k)}
    >
      {label}{pending > 0 && <span className={tab === k ? '' : 'text-red-700 font-bold'}> · {pending}</span>}
    </button>
  )

  return (
    <div className={`${ui.page} flex flex-col gap-5`}>
      <div>
        <h2 className={ui.h2}>Users</h2>
        <p className="adm-dim">Console accounts. Roles gate capabilities; root lives in <code className={ui.codeChip}>config.json</code>, not here. Users may log in with username <i>or</i> email. Admin identity changes bypass the 48h username cooldown (all changes are logged — see a user's Edit dialog).</p>
        <div className="flex items-center gap-1.5 mt-2" data-ui="users-tabs">
          {tabBtn('users', 'Users', 0)}
          {tabBtn('resets', 'Password resets', pendingResets.length)}
          {tabBtn('devreqs', 'Developer requests', pendingRoleReqs.length)}
          {isRoot && tabBtn('deleted', `🗑 Deleted${deletedUsers.length ? ` · ${deletedUsers.length}` : ''}`, 0)}
          <RefreshButton onRefresh={refreshActive} className="ml-auto" />
        </div>
      </div>

      {tab === 'resets' && (
        <section className="gw-card" data-ui="reset-requests">
          <div className="gw-card-title">Password reset requests</div>
          <p className="adm-dim">Filed from the login page (email first; the claimed username is a verification signal — ✓ matches the account, ✗ doesn't). Flow: open the user's <b>Edit</b> dialog, set a new password, contact them via the account email, then mark the request handled. Pending first; handled cases stay listed below (latest 50 overall).</p>
          <div className={ui.tableWrap}>
            <table className={ui.table} data-ui="resets-table">
              <colgroup>
                <col />{/* Email — flexible */}
                <col style={{ width: 130 }} />{/* Account */}
                <col style={{ width: 160 }} />{/* Claimed username */}
                <col style={{ width: 130 }} />{/* Filed */}
                <col style={{ width: 195 }} />{/* Status */}
                <col style={{ width: 175 }} />{/* Actions */}
              </colgroup>
              <thead><tr>
                <th className={ui.th}>Email</th><th className={ui.th}>Account</th><th className={ui.th}>Claimed username</th>
                <th className={ui.th}>Filed</th><th className={ui.th}>Status</th><th className={ui.th}></th>
              </tr></thead>
              <tbody>
                {[...pendingResets, ...handledResets].map((r, i, all) => {
                  const last = i === all.length - 1
                  const pending = r.status === 'pending'
                  const dim = pending ? '' : ui.cellDim
                  return (
                    <tr key={r.id}>
                      <td className={`${cell(last, true)} ${dim}`} title={r.ip ? `from ${r.ip}` : undefined}>{r.identifier}</td>
                      <td className={`${cell(last, true)} ${dim}`}>
                        {r.userId
                          ? <span title={r.email ? `contact: ${r.email}` : '⚠ no email on the account'}>{r.username}</span>
                          : <span className={pending ? 'text-red-700' : ''}>no match</span>}
                      </td>
                      <td className={`${cell(last, true)} ${dim}`}>
                        {r.claimedUsername
                          ? (r.userId && r.claimedUsername === r.username
                            ? <span className={pending ? 'text-green-700' : ''} title="Matches the account">“{r.claimedUsername}” ✓</span>
                            : <span className={pending ? 'text-red-700' : ''} title="Does NOT match — verify carefully">“{r.claimedUsername}” ✗</span>)
                          : <span className="italic">—</span>}
                      </td>
                      <td className={`${cell(last, true)} adm-dim`} title={r.at}>{fmt(r.at)}</td>
                      <td className={cell(last, true)}>
                        {pending
                          ? <b className="text-red-700">pending</b>
                          : <span className="text-green-800">✓ {r.handledBy || 'handled'}{r.handledAt ? ` · ${fmt(r.handledAt)}` : ''}</span>}
                      </td>
                      <td className={cell(last)}>
                        <div className={ui.actions}>
                          {r.userId && <button className="gw-btn adm-btn-sm" onClick={() => void openEditById(r.userId!)}>Edit user</button>}
                          {pending && <button className="gw-btn adm-btn-sm" onClick={() => void markHandled(r)}>Handled</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {resets.length === 0 && <tr><td colSpan={6} className={ui.empty}>No reset requests yet</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'devreqs' && (
        <section className="gw-card" data-ui="role-requests">
          <div className="gw-card-title">Developer-access requests</div>
          <p className="adm-dim">Filed from the Account page. Flow: open the user's <b>Edit</b> dialog, set the role to <b>developer</b> (if approved), contact them via the account email, then mark the request handled. Pending first; handled cases stay listed below (latest 50 overall).</p>
          <div className={ui.tableWrap}>
            <table className={ui.table} data-ui="devreqs-table">
              <colgroup>
                <col style={{ width: 140 }} />{/* User */}
                <col style={{ width: 90 }} />{/* Wants */}
                <col />{/* Note — flexible */}
                <col style={{ width: 130 }} />{/* Filed */}
                <col style={{ width: 195 }} />{/* Status */}
                <col style={{ width: 175 }} />{/* Actions */}
              </colgroup>
              <thead><tr>
                <th className={ui.th}>User</th><th className={ui.th}>Wants</th><th className={ui.th}>Note</th>
                <th className={ui.th}>Filed</th><th className={ui.th}>Status</th><th className={ui.th}></th>
              </tr></thead>
              <tbody>
                {[...pendingRoleReqs, ...handledRoleReqs].map((r, i, all) => {
                  const last = i === all.length - 1
                  const pending = r.status === 'pending'
                  const dim = pending ? '' : ui.cellDim
                  return (
                    <tr key={r.id}>
                      <td className={`${cell(last, true)} ${dim}`} title={[r.email ? `contact: ${r.email}` : '⚠ no email on the account', r.ip ? `from ${r.ip}` : null].filter(Boolean).join(' · ')}>
                        {r.username || r.userId}
                      </td>
                      <td className={`${cell(last, true)} ${dim}`}>{r.requestedRole}</td>
                      <td className={`${cell(last, true)} ${dim} italic`} title={r.note || undefined}>{r.note || '—'}</td>
                      <td className={`${cell(last, true)} adm-dim`} title={r.at}>{fmt(r.at)}</td>
                      <td className={cell(last, true)}>
                        {pending
                          ? <b className="text-red-700">pending</b>
                          : <span className="text-green-800">✓ {r.handledBy || 'handled'}{r.handledAt ? ` · ${fmt(r.handledAt)}` : ''}</span>}
                      </td>
                      <td className={cell(last)}>
                        <div className={ui.actions}>
                          {r.userId && <button className="gw-btn adm-btn-sm" onClick={() => void openEditById(r.userId)}>Edit user</button>}
                          {pending && <button className="gw-btn adm-btn-sm" onClick={() => void markRoleHandled(r)}>Handled</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {roleReqs.length === 0 && <tr><td colSpan={6} className={ui.empty}>No developer requests yet</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'deleted' && isRoot && (
        <section className="gw-card" data-ui="deleted-users">
          <div className="gw-card-title">Soft-deleted users</div>
          <p className="adm-dim">Deleting a user is a <b>soft delete</b>: they can't sign in and their API keys stop working, but everything they own stays intact. From here you can <b>Restore</b> them (keys come back too) or <b>Hard delete</b> — the irreversible cascade that removes their conversations, memories, keys and BYOK providers. Their username/email stay reserved until hard-deleted.</p>
          <div className={ui.tableWrap}>
            <table className={ui.table} data-ui="deleted-users-table">
              <colgroup>
                <col />{/* Username — flexible */}
                <col style={{ width: 115 }} />{/* Roles */}
                <col style={{ width: 150 }} />{/* Deleted at */}
                <col style={{ width: 135 }} />{/* Created */}
                <col style={{ width: 200 }} />{/* Actions */}
              </colgroup>
              <thead><tr>
                <th className={ui.th}>Username</th><th className={ui.th}>Roles</th><th className={ui.th}>Deleted</th><th className={ui.th}>Created</th><th className={ui.th}></th>
              </tr></thead>
              <tbody>
                {deletedUsers.map((u, i) => {
                  const last = i === deletedUsers.length - 1
                  return (
                    <tr key={u.id}>
                      <td className={`${cell(last)} ${ui.cellDim}`}>{u.username}{u.email ? <div className="adm-dim">{u.email}</div> : null}</td>
                      <td className={`${cell(last, true)} ${ui.cellDim}`}>{u.roles.join(', ') || '—'}</td>
                      <td className={`${cell(last, true)} adm-dim`} title={u.deletedAt}>{fmt(u.deletedAt)}</td>
                      <td className={`${cell(last, true)} adm-dim`} title={u.createdAt}>{fmt(u.createdAt)}</td>
                      <td className={cell(last)}>
                        <div className={ui.actions}>
                          <button
                            className="gw-btn adm-btn-sm"
                            onClick={async () => { await apiPost(`/v1/admin/users/${u.id}/restore`, {}); loadDeleted(); await load(userPage) }}
                          >Restore</button>
                          <button className="gw-btn adm-btn-sm adm-btn-danger" onClick={() => setHardDeleting(u)}>Hard delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {deletedUsers.length === 0 && <tr><td colSpan={5} className={ui.empty}>No soft-deleted users 🎉</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'users' && (
      <>
      <section className="gw-card">
        <div className="gw-card-title">Create user</div>
        {/* NOTE: a legacy global `input, select { width:100% }` rule makes bare row layouts stack —
            so this form is an explicit 2-column grid (inputs happily fill their cells). */}
        {/* autoComplete off/new-password: this creates OTHER users — the browser must never
            autofill the admin's own credentials here */}
        <form className="grid gap-3 md:grid-cols-2" onSubmit={create} autoComplete="off">
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Username<Req /></span>
            <input className="gw-input" value={username} onChange={(e) => setUsername(e.target.value)} spellCheck={false} autoComplete="off" />
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Password<Req /></span>
            <input className="gw-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Email (optional, unique — used for account recovery)</span>
            <input className="gw-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Display name (optional)</span>
            <input className="gw-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="off" />
          </label>
          <div className="flex items-center gap-3 md:col-span-2">
            <label className="flex items-center gap-2 text-xs text-muted">
              Role
              <select className="gw-input w-44" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <button className="gw-btn gw-btn-primary ml-auto" disabled={busy || !username.trim() || !password}>Create</button>
          </div>
        </form>
        {error && !editing && <div className="gw-meta gw-error">{error}</div>}
      </section>

      <div className="flex items-center gap-2 mb-2">
        <input
          className="gw-input max-w-[320px]"
          placeholder="🔍 filter by username, email or display name…"
          value={userQ}
          onChange={(e) => setUserQ(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <span className="adm-dim text-[12px]">{userTotal} user{userTotal === 1 ? '' : 's'}{userQ.trim() ? ' match' : ''}</span>
      </div>

      <div className={ui.tableWrap}>
        <table className={ui.table} data-ui="users-table">
          <colgroup>
            <col />{/* Username — flexible */}
            <col />{/* Display name — flexible */}
            <col style={{ width: 115 }} />{/* Roles */}
            <col style={{ width: 60 }} />{/* Active */}
            {/* 135px ellipsed "05/07/2026, 20:35" to "05/07/2026, 20:…" — the timestamp is the whole point of the
                column, so give it the room the one-row nav freed up. */}
            <col style={{ width: 152 }} />{/* Created */}
            {/* Actions used to be up to SIX buttons wide (435px for root) and starved the data
                columns. Now it is the primary action + a ⋯ overflow menu, so one fixed width
                serves every role and the ~325px goes back to Username/Display name. */}
            <col style={{ width: 110 }} />{/* Actions: Edit · ⋯ */}
          </colgroup>
          <thead><tr>
            <th className={ui.th}>Username</th><th className={ui.th}>Display name</th><th className={ui.th}>Roles</th><th className={ui.th}>Active</th><th className={ui.th}>Created</th><th className={ui.th}></th>
          </tr></thead>
          <tbody>
            {users.map((u, i) => {
              const last = i === users.length - 1
              const dim = u.isActive ? '' : ui.cellDim // dim info cells only — buttons stay actionable
              return (
                <tr key={u.id}>
                  <td className={`${cell(last)} ${dim}`}>
                    {u.username}
                    {/* 📝 = this account carries an admin note. Hover shows it; Edit changes it.
                        Deliberately a marker, not the text — the note can be 5000 chars. */}
                    {u.systemNote && (
                      <span
                        className="ml-1 cursor-help align-middle text-[11px]"
                        title={`Admin note (staff-only):\n\n${u.systemNote}`}
                      >📝</span>
                    )}
                    {u.email ? <div className="adm-dim">{u.email}</div> : null}
                  </td>
                  <td className={`${cell(last)} ${dim}`}>{u.displayName || '—'}</td>
                  <td className={`${cell(last, true)} ${dim}`}>{u.roles.join(', ') || '—'}</td>
                  <td className={`${cell(last, true)} ${dim}`}>{u.isActive ? '✓' : 'disabled'}</td>
                  <td className={`${cell(last, true)} adm-dim ${dim}`} title={u.createdAt || undefined}>{fmt(u.createdAt)}</td>
                  <td className={cell(last)}>
                    <div className={ui.actions}>
                      <button className="gw-btn adm-btn-sm" onClick={() => openEdit(u)}>Edit</button>
                      <RowMenu
                        dataUi={`user-menu-${u.username}`}
                        label={`More actions for ${u.username}`}
                        items={[
                          { label: '⛽ Token limits', title: 'Budget, overrides, boost grants', onSelect: () => setLimitsFor(u) },
                          { label: '🧠 View memory', title: "View this user's saved memory (root)", hidden: !isRoot, onSelect: () => openMemory(u) },
                          { label: '🔑 Log in as', title: 'Sign out of root and sign in as this user', hidden: !(me?.isRoot && u.isActive), onSelect: () => setLoginAsUser(u) },
                          { label: u.isActive ? '🚫 Disable' : '✓ Enable', onSelect: () => void toggleActive(u) },
                          // no self-delete — the row for the signed-in admin omits it entirely
                          { label: '🗑 Delete', danger: true, hidden: String(u.id) === String(me?.id ?? ''), onSelect: () => setDeleting(u) },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
            {users.length === 0 && <tr><td colSpan={6} className={ui.empty}>{userQ ? 'No users match the filter' : 'No users'}</td></tr>}
          </tbody>
        </table>
      </div>
      {userPages > 1 && (
        <div className="flex items-center gap-3 mt-3">
          <span className="adm-dim">Page {userPage} of {userPages} · {userTotal} total</span>
          <div className="flex gap-2 ml-auto">
            <button className="gw-btn adm-btn-sm" disabled={userPage <= 1} onClick={() => void load(userPage - 1)}>← Prev</button>
            <button className="gw-btn adm-btn-sm" disabled={userPage >= userPages} onClick={() => void load(userPage + 1)}>Next →</button>
          </div>
        </div>
      )}
      </>
      )}

      {deleting && (
        <ConfirmModal
          title={`Delete user '${deleting.username}'`}
          message={
            <span>
              This is a <b>soft delete</b>: <b>{deleting.username}</b> can no longer sign in and their API
              keys stop working, but their data stays intact. Root can restore them — or delete them for
              good — from the Users page's <b>Deleted</b> tab. The username/email stay reserved meanwhile.
            </span>
          }
          confirmLabel="Delete user"
          onConfirm={async () => { await apiDelete(`/v1/admin/users/${deleting.id}`); await load(userPage); if (isRoot) loadDeleted() }}
          onClose={() => setDeleting(null)}
        />
      )}

      {loginAsUser && (
        <ConfirmModal
          title={`Log in as '${loginAsUser.username}'`}
          danger={false}
          message={
            <span>
              You will be signed out from <b>root</b> and signed in as user: <b>{loginAsUser.username}</b>.
              To come back, sign out and log in as root again.
            </span>
          }
          confirmLabel={`Log in as ${loginAsUser.username}`}
          busyLabel="Switching…"
          onConfirm={async () => {
            await apiPost(`/v1/admin/users/${loginAsUser.id}/login-as`, {})
            // full reload so the auth context bootstraps cleanly as the new user
            window.location.assign('/chat')
          }}
          onClose={() => setLoginAsUser(null)}
        />
      )}

      {limitsFor && <UserLimitsModal userId={limitsFor.id} username={limitsFor.username} onClose={() => setLimitsFor(null)} />}

      {memView && (
        <div className={ui.modalOverlay} {...dismissOnBackdrop(() => setMemView(null))}>
          <div className={ui.modalCard} style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()} data-ui="memory-view-modal">
            <div className={ui.modalHead}>
              <h3 className={ui.modalTitle}>🧠 Memory — {memView.username} <span className="adm-dim text-[12px] font-normal">(read-only, root)</span></h3>
              <button className="gw-btn adm-btn-sm" onClick={() => setMemView(null)}>✕</button>
            </div>

            <div className={`${ui.fieldLabel} font-bold`}>Notes — user-curated, injected into every chat ({memView.memories.length})</div>
            {memView.memories.length === 0 ? <p className="adm-dim m-0">None.</p> : (
              <div className="flex flex-col gap-1.5">
                {memView.memories.map((m) => (
                  <div key={m.id} className={`border border-line rounded-lg px-3 py-2 text-[13px] ${m.isEnabled ? '' : 'opacity-60'}`}>
                    {m.content}
                    {!m.isEnabled && <span className="adm-dim"> · disabled</span>}
                  </div>
                ))}
              </div>
            )}

            <div className={`${ui.fieldLabel} font-bold mt-2`}>Assistant memory — Persona Memory v2, what the assistant recalls ({memView.assistant.length})</div>
            {memView.assistant.length === 0 ? <p className="adm-dim m-0">None.</p> : (
              <div className="flex flex-col gap-1.5">
                {memView.assistant.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 border border-line rounded-lg px-3 py-1.5 text-[12.5px]">
                    <span className="whitespace-nowrap rounded-full border border-line px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.04em] text-muted"
                      title={m.entity && m.attribute ? `${m.entity} · ${m.attribute}` : m.kind}>{m.kind}</span>
                    <span className="min-w-0 flex-1 break-words">{m.content}{m.pinned ? ' 📌' : ''}</span>
                  </div>
                ))}
              </div>
            )}

            <div className={ui.modalActions}>
              <button className="gw-btn" onClick={() => setMemView(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {hardDeleting && (
        <ConfirmModal
          title={`HARD delete '${hardDeleting.username}'`}
          message={
            <span>
              This permanently deletes <b>{hardDeleting.username}</b> and everything they own: conversations,
              memories, API keys, and personal (BYOK) providers. Usage history and the key-reveal audit
              trail are kept. <b>This cannot be undone.</b>
            </span>
          }
          confirmLabel="Hard delete"
          typeToConfirm={hardDeleting.username}
          onConfirm={async () => { await apiDelete(`/v1/admin/users/${hardDeleting.id}?hard=1`); loadDeleted() }}
          onClose={() => setHardDeleting(null)}
        />
      )}

      {editing && (
        <div className={ui.modalOverlay} {...dismissOnBackdrop(closeEdit)}>
          <div className={ui.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={ui.modalHead}>
              <h3 className={ui.modalTitle}>Edit user</h3>
              <button className="gw-btn adm-btn-sm" onClick={closeEdit}>✕</button>
            </div>

            <label className={ui.field}>
              <span className={ui.fieldLabel}>Username (unique; admin changes bypass the 48h cooldown)<Req /></span>
              <input className="gw-input" value={draft.username} onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))} spellCheck={false} autoComplete="off" />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Email (optional, unique — used for account recovery)</span>
              <input className="gw-input" type="email" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} autoComplete="off" />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Display name (optional, shown across the platform)</span>
              <input className="gw-input" value={draft.displayName} onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))} autoComplete="off" />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Role</span>
              <select className="gw-input" value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Reset password (leave blank to keep current)</span>
              <input className="gw-input" type="password" placeholder="new password" value={draft.password} onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))} autoComplete="new-password" />
            </label>

            <label className={ui.field} data-ui="system-note-field">
              <span className={ui.fieldLabel}>
                📝 Admin note — <b>staff-only; {editing.username} can never see this</b>. For tracking
                an account ("recheck for abuse", "asked about billing"). Changes are logged below.
              </span>
              {/* gw-textarea, NOT gw-input: only the former sets font-family:inherit, and a
                  textarea otherwise falls back to the browser's monospace default. !mb-0
                  cancels its built-in margin inside this flex field (same as Skills/Feedback). */}
              <textarea
                className="gw-textarea !mb-0"
                rows={3}
                placeholder="e.g. recheck for abuse — spike in API calls on 2026-08-01"
                maxLength={5000}
                value={draft.systemNote}
                onChange={(e) => setDraft((d) => ({ ...d, systemNote: e.target.value }))}
                spellCheck={false}
              />
            </label>

            <div className={ui.field}>
              <span className={ui.fieldLabel}>Change history — identity + limits (admin-only)</span>
              {changes.length === 0 ? (
                <div className="adm-dim">No identity changes recorded.</div>
              ) : (
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto text-[12px]">
                  {changes.map((c) => (
                    <div key={c.id} className="flex flex-wrap gap-x-2 border-b border-line/60 pb-1">
                      <span className="text-muted">{fmt(c.changedAt)}</span>
                      <b>{c.field}</b>
                      <span>{c.oldValue ?? '∅'} → {c.newValue ?? '∅'}</span>
                      <span className="text-muted">by {c.changedBy}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <div className="gw-meta gw-error">{error}</div>}
            <div className={ui.modalActions}>
              <button className="gw-btn" onClick={closeEdit}>Cancel</button>
              <button className="gw-btn gw-btn-primary" disabled={busy} onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
