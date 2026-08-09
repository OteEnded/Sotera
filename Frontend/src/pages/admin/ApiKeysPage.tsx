import { useCallback, useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api'
import { copyToClipboard } from '../../lib/clipboard'
import { useAuth } from '../../lib/auth'
import ConfirmModal from '../../components/ConfirmModal'
import RefreshButton from '../../components/RefreshButton'
import Req from '../../components/Req'
import { cell, ui } from './ui'
import UserCombo from './UserCombo'
import UserDetailModal, { type UserInfo } from './UserDetailModal'
import ClearableSelect from '../../components/ClearableSelect'
import { dismissOnBackdrop } from '../../lib/overlay'

type ApiKey = {
  id: string; kind: string; canReveal: boolean; name: string; description: string; keyPrefix: string
  owner: { id: string; username: string } | null
  scopes: string[]; isActive: boolean; expiresAt: string | null; lastUsedAt: string | null; createdAt: string
}

// System keys (kind !== 'standard', today only 'chat') are auto-managed by the platform —
// shown in the list for visibility but read-only: no edit/disable/delete.
const isSystem = (k: ApiKey) => k.kind !== 'standard'
// Expiry is enforced independently of isActive at the auth layer (auth/index.js) — a key can
// show ✓ Active and still be dead. Worth flagging since the two facts otherwise look consistent.
const isExpired = (k: ApiKey) => Boolean(k.expiresAt) && new Date(k.expiresAt as string) < new Date()

type Draft = { name: string; description: string; scopes: string[]; expiresAt: string }

// ISO <-> <input type="datetime-local"> (local time) helpers.
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)
// Compact table timestamp (no seconds) — the full value is shown via the cell's title tooltip.
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

export default function ApiKeysPage() {
  const { can } = useAuth()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [allScopes, setAllScopes] = useState<string[]>([])
  const [users, setUsers] = useState<UserInfo[]>([])
  const [fOwner, setFOwner] = useState('') // '' = everyone, 'root', or a user id
  const [fRole, setFRole] = useState('') // '' = any, 'root', or a role name
  const [userView, setUserView] = useState<string | null>(null) // owner username clicked in the table
  const [descOpen, setDescOpen] = useState<Record<string, boolean>>({}) // per-key: description expanded?

  // The just-minted raw key auto-hides after a countdown (root-configurable, config.json
  // console.keyRevealSeconds). Once hidden, copying again goes through the credential
  // re-check like any other copy.
  const [revealSecs, setRevealSecs] = useState(60)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [secsDraft, setSecsDraft] = useState('')
  const [error, setError] = useState('')
  const [mintedKey, setMintedKey] = useState('')
  const [busy, setBusy] = useState(false)

  // create form
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scopes, setScopes] = useState<string[]>(['chat', 'streaming'])
  const [expiresAt, setExpiresAt] = useState('')

  // edit modal
  const [editing, setEditing] = useState<ApiKey | null>(null)
  const [draft, setDraft] = useState<Draft>({ name: '', description: '', scopes: [], expiresAt: '' })

  // reveal audit trail (its own tab; paginated + filterable, loads on tab select)
  type RevealAudit = { id: string; apiKeyId: string | null; keyName: string | null; keyPrefix: string | null; actor: string; actorUserId: string | null; outcome: string; ip: string | null; at: string }
  const AUDIT_PAGE_SIZE = 50
  const [audit, setAudit] = useState<RevealAudit[]>([])
  const [auditQ, setAuditQ] = useState('')
  const [auditOutcome, setAuditOutcome] = useState('')
  const [auditPage, setAuditPage] = useState(1)
  const [auditTotal, setAuditTotal] = useState(0)
  const loadAudit = (page = 1, q = auditQ, outcome = auditOutcome) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(AUDIT_PAGE_SIZE) })
    if (q.trim()) params.set('q', q.trim())
    if (outcome) params.set('outcome', outcome)
    apiGet(`/v1/admin/apikeys/reveals?${params.toString()}`)
      .then((r) => { setAudit(r.reveals || []); setAuditTotal(r.total ?? 0); setAuditPage(r.page ?? page) })
      .catch(() => {})
  }
  const auditPages = Math.max(1, Math.ceil(auditTotal / AUDIT_PAGE_SIZE))

  // reveal/copy modal — any copy AFTER the mint response requires a credential re-check
  const [revealing, setRevealing] = useState<ApiKey | null>(null)
  const [revUser, setRevUser] = useState('')
  const [revPass, setRevPass] = useState('')
  const [revealedKey, setRevealedKey] = useState('')
  const [revError, setRevError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const params = new URLSearchParams()
      if (fOwner) params.set('owner', fOwner)
      if (fRole) params.set('role', fRole)
      const q = params.toString() ? `?${params.toString()}` : ''
      const [k, s] = await Promise.all([apiGet(`/v1/admin/apikeys${q}`), apiGet('/v1/admin/scopes')])
      setKeys(k.apiKeys)
      setAllScopes(s.scopes)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [fOwner, fRole])

  useEffect(() => { load() }, [load])
  useEffect(() => { apiGet('/v1/admin/users').then((r) => setUsers(r.users)).catch(() => {}) }, [])
  useEffect(() => {
    apiGet('/v1/admin/settings')
      .then((r) => {
        const v = r.settings?.['console.keyRevealSeconds']?.value ?? 60
        setRevealSecs(v); setSecsDraft(String(v))
      })
      .catch(() => {})
  }, [])

  // countdown: starts when a key is minted, hides the box at 0
  useEffect(() => {
    if (!mintedKey) { setCountdown(null); return }
    setCountdown(revealSecs)
    const t = setInterval(() => setCountdown((c) => (c == null ? null : c - 1)), 1000)
    return () => clearInterval(t)
  }, [mintedKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (countdown !== null && countdown <= 0) { setMintedKey(''); setCountdown(null) }
  }, [countdown])

  const fmtCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const saveRevealSecs = async () => {
    const n = Math.floor(Number(secsDraft))
    if (!Number.isFinite(n) || n < 5 || n > 3600) { setError('Countdown must be 5–3600 seconds'); return }
    setError('')
    try {
      const r = await apiPatch('/v1/admin/settings', { 'console.keyRevealSeconds': n })
      const v = r.settings?.['console.keyRevealSeconds']?.value ?? n
      setRevealSecs(v); setSecsDraft(String(v))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const toggle = (list: string[], s: string) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s])

  const mint = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setMintedKey(''); setBusy(true)
    try {
      const res = await apiPost('/v1/admin/apikeys', {
        name: name.trim(),
        description: description.trim(),
        scopes,
        expiresAt: fromLocalInput(expiresAt),
      })
      setMintedKey(res.rawKey)
      setName(''); setDescription(''); setExpiresAt(''); setScopes(['chat', 'streaming'])
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const openEdit = (k: ApiKey) => {
    setMintedKey('')
    setEditing(k)
    setDraft({ name: k.name, description: k.description || '', scopes: [...k.scopes], expiresAt: toLocalInput(k.expiresAt) })
  }
  const closeEdit = () => setEditing(null)

  const openReveal = (k: ApiKey) => {
    setMintedKey('')
    setRevealing(k)
    setRevUser(''); setRevPass(''); setRevealedKey(''); setRevError(''); setCopied(false)
  }
  const closeReveal = () => setRevealing(null)

  const confirmReveal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!revealing) return
    setRevError(''); setBusy(true)
    try {
      const res = await apiPost(`/v1/admin/apikeys/${revealing.id}/reveal`, { username: revUser.trim(), password: revPass })
      setRevealedKey(res.rawKey)
      setRevPass('')
    } catch (err) {
      setRevError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const copyText = async (text: string) => {
    // works over plain HTTP too (execCommand fallback); the key is on screen regardless
    if (await copyToClipboard(text)) { setCopied(true); setTimeout(() => setCopied(false), 1500) }
  }

  const saveEdit = async () => {
    if (!editing) return
    setError(''); setBusy(true)
    try {
      await apiPatch(`/v1/admin/apikeys/${editing.id}`, {
        name: draft.name.trim() || undefined,
        description: draft.description,
        scopes: draft.scopes,
        expiresAt: fromLocalInput(draft.expiresAt),
      })
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const setActive = async (k: ApiKey, isActive: boolean) => {
    setError('')
    try { await apiPatch(`/v1/admin/apikeys/${k.id}`, { isActive }); await load() }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }
  const [deleting, setDeleting] = useState<ApiKey | null>(null)

  // system chat key controls (root): disable = per-user CHAT KILL SWITCH (turns are
  // refused, never auto-re-enabled); renew = rotate secret + fresh TTL + re-enable
  const [chatOff, setChatOff] = useState<ApiKey | null>(null)
  const renewChatKey = async (k: ApiKey) => {
    setError('')
    try { await apiPost(`/v1/admin/apikeys/${k.id}/renew`, {}); await load() }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }

  // soft-deleted keys (root's Deleted tab): restore or hard-delete for good
  const isRoot = can('system_config')
  const [keysTab, setKeysTab] = useState<'keys' | 'audit' | 'deleted'>('keys')
  type DeletedKey = { id: string; name: string; kind: string; keyPrefix: string; owner: { id: string; username: string; deleted: boolean } | null; deletedAt: string; createdAt: string }
  const [deletedKeys, setDeletedKeys] = useState<DeletedKey[]>([])
  const [hardDeleting, setHardDeleting] = useState<DeletedKey | null>(null)
  const loadDeleted = useCallback(() => {
    apiGet('/v1/admin/apikeys/deleted').then((r) => setDeletedKeys(r.apiKeys || [])).catch(() => {})
  }, [])
  useEffect(() => { if (isRoot) loadDeleted() }, [isRoot, loadDeleted])

  return (
    <div className={ui.page}>
      <h2 className={ui.h2}>API Keys</h2>
      <p className="adm-dim">Service-to-service credentials for apps that call the gateway (Sotera, personas, agents). The raw key is shown at creation and stays copyable afterwards — but every later copy asks you to re-enter your credentials. Keys marked <span className={ui.badgeChat}>system · chat</span> are auto-managed (one per user, attributes their chat-site usage, renews on chat open); root can <b>Disable</b> one (chat kill switch — the user's turns are refused) or <b>Renew</b> it (new secret + fresh expiry).</p>

      <div className="flex items-center gap-1.5 mb-4" data-ui="keys-tabs">
        <button className={`gw-btn adm-btn-sm ${keysTab === 'keys' ? 'gw-btn-primary' : ''}`} onClick={() => setKeysTab('keys')}>Keys</button>
        <button className={`gw-btn adm-btn-sm ${keysTab === 'audit' ? 'gw-btn-primary' : ''}`} onClick={() => { setKeysTab('audit'); loadAudit() }}>Reveal audit</button>
        {isRoot && <button className={`gw-btn adm-btn-sm ${keysTab === 'deleted' ? 'gw-btn-primary' : ''}`} onClick={() => setKeysTab('deleted')}>🗑 Deleted{deletedKeys.length ? ` · ${deletedKeys.length}` : ''}</button>}
        <RefreshButton className="ml-auto" onRefresh={() => keysTab === 'audit' ? loadAudit(auditPage) : keysTab === 'deleted' ? loadDeleted() : load()} />
      </div>

      {keysTab === 'deleted' && isRoot && (
        <section className="gw-card" data-ui="deleted-keys">
          <div className="gw-card-title">Soft-deleted API keys</div>
          <p className="adm-dim">Deleting a key is a <b>soft delete</b> — it stops authenticating immediately but stays recoverable here. <b>Restore</b> brings it back (blocked while its owner is deleted — restore the user instead); <b>Hard delete</b> removes it for good. Keys of soft-deleted users appear here too.</p>
          <div className={ui.tableWrap}>
            <table className={ui.table} data-ui="deleted-keys-table">
              <colgroup>
                <col />{/* Name — flexible */}
                <col style={{ width: 120 }} />{/* Prefix */}
                <col style={{ width: 140 }} />{/* Owner */}
                <col style={{ width: 150 }} />{/* Deleted at */}
                <col style={{ width: 200 }} />{/* Actions */}
              </colgroup>
              <thead><tr>
                <th className={ui.th}>Name</th><th className={ui.th}>Prefix</th><th className={ui.th}>Owner</th><th className={ui.th}>Deleted</th><th className={ui.th}></th>
              </tr></thead>
              <tbody>
                {deletedKeys.map((k, i) => {
                  const last = i === deletedKeys.length - 1
                  return (
                    <tr key={k.id}>
                      <td className={`${cell(last)} ${ui.cellDim}`}>{k.kind === 'chat' ? <span className={ui.badgeChat}>💬 {k.name}</span> : k.name}</td>
                      <td className={`${cell(last, true)} adm-dim`}><code className={ui.codeChip}>{k.keyPrefix}…</code></td>
                      <td className={`${cell(last, true)} ${ui.cellDim}`}>{k.owner ? <>{k.owner.username}{k.owner.deleted && <span className="text-red-700" title="The owner is soft-deleted too"> (deleted)</span>}</> : 'root'}</td>
                      <td className={`${cell(last, true)} adm-dim`} title={k.deletedAt}>{fmt(k.deletedAt)}</td>
                      <td className={cell(last)}>
                        <div className={ui.actions}>
                          <button
                            className="gw-btn adm-btn-sm"
                            disabled={Boolean(k.owner?.deleted)}
                            title={k.owner?.deleted ? 'Owner is deleted — restore the user instead (their keys come back too)' : 'Bring this key back'}
                            onClick={async () => {
                              try { await apiPost(`/v1/admin/apikeys/${k.id}/restore`, {}); loadDeleted(); await load() }
                              catch (err) { setError(err instanceof Error ? err.message : String(err)) }
                            }}
                          >Restore</button>
                          <button className="gw-btn adm-btn-sm adm-btn-danger" onClick={() => setHardDeleting(k)}>Hard delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {deletedKeys.length === 0 && <tr><td colSpan={5} className={ui.empty}>No soft-deleted keys 🎉</td></tr>}
              </tbody>
            </table>
          </div>
          {error && <div className="gw-meta gw-error">{error}</div>}
        </section>
      )}

      {keysTab === 'keys' && (
      <>
      <section className="gw-card">
        <div className="gw-card-title">Create key</div>
        <form className={ui.formCol} onSubmit={mint}>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Name<Req /></span>
            <input className="gw-input" placeholder="e.g. sotera-prod" value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} required autoComplete="off" />
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Description (optional)</span>
            <input className="gw-input" value={description} onChange={(e) => setDescription(e.target.value)} autoComplete="off" />
          </label>
          <div className={ui.field}>
            <span className={ui.fieldLabel}>Scopes</span>
            <div className={ui.scopes}>
              {allScopes.map((s) => (
                <label key={s} className="gw-check">
                  <input type="checkbox" checked={scopes.includes(s)} onChange={() => setScopes((p) => toggle(p, s))} />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <div className={ui.field}>
            <span className={ui.fieldLabel}>Expires (optional)</span>
            <input className="gw-input max-w-[260px]" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div><button className="gw-btn gw-btn-primary" disabled={busy || !name.trim()}>Create</button></div>
        </form>
        {error && !editing && <div className="gw-meta gw-error">{error}</div>}
        {mintedKey && (
          <div className={ui.minted}>
            <div className="flex items-center gap-2">
              <div className="gw-block-title">new key — copy it now (later copies ask for your credentials)</div>
              {countdown !== null && (
                <span className={`${ui.badgeChat} ${countdown <= 10 ? '!bg-red-100 !text-red-700 !border-red-200' : ''}`} title="Auto-hides when the countdown ends">
                  hides in {fmtCountdown(countdown)}
                </span>
              )}
              <button type="button" className="gw-btn adm-btn-sm ml-auto" onClick={() => copyText(mintedKey)}>{copied ? 'Copied ✓' : 'Copy'}</button>
            </div>
            <code className={ui.mintedKey}>{mintedKey}</code>
          </div>
        )}
        {can('system_config') && (
          <div className="flex items-center gap-2 mt-3">
            <span className={ui.fieldLabel}>New-key reveal auto-hides after</span>
            <input className="gw-input !w-[80px]" type="number" min={5} max={3600} value={secsDraft} onChange={(e) => setSecsDraft(e.target.value)} />
            <span className={ui.fieldLabel}>seconds (root setting, saved to config)</span>
            {Number(secsDraft) !== revealSecs && <button type="button" className="gw-btn adm-btn-sm" onClick={saveRevealSecs}>Save</button>}
          </div>
        )}
      </section>

      <div className="flex items-center gap-2 mt-4">
        <span className={ui.fieldLabel}>Owner</span>
        <div className="w-[220px]">
          <UserCombo users={users} value={fOwner} onChange={setFOwner} />
        </div>
        <span className={`${ui.fieldLabel} ml-2`}>Owner role</span>
        <ClearableSelect className="gw-input !w-auto min-w-[140px]" value={fRole} onChange={setFRole}>
          <option value="">(any)</option>
          <option value="root">root</option>
          {[...new Set(users.flatMap((u) => u.roles || []))].sort().map((r) => <option key={r} value={r}>{r}</option>)}
        </ClearableSelect>
        <span className="adm-dim ml-auto">{keys.length} key{keys.length === 1 ? '' : 's'}</span>
      </div>

      <div className={ui.tableWrap}>
        <table className={ui.table} data-ui="keys-table">
          <colgroup>
            {/* Fixed-layout: compact columns get px widths sized to their content; Name + Scopes
                flex to share the remainder of the 1040px page column. */}
            <col />{/* Name — flexible */}
            <col style={{ width: 70 }} />{/* Owner */}
            <col style={{ width: 120 }} />{/* Prefix */}
            <col />{/* Scopes — flexible */}
            <col style={{ width: 70 }} />{/* Active */}
            <col style={{ width: 145 }} />{/* Expires */}
            <col style={{ width: 145 }} />{/* Last used */}
            <col style={{ width: 268 }} />{/* Actions — 4 buttons on one line */}
          </colgroup>
          <thead><tr>
            <th className={ui.th}>Name</th><th className={ui.th}>Owner</th><th className={ui.th}>Prefix</th><th className={ui.th}>Scopes</th>
            <th className={ui.th}>Active</th><th className={ui.th}>Expires</th><th className={ui.th}>Last used</th><th className={ui.th}></th>
          </tr></thead>
          <tbody>
            {keys.map((k, i) => {
              const last = i === keys.length - 1
              const system = isSystem(k)
              const dim = k.isActive ? '' : ui.cellDim // dim info cells only — buttons stay actionable
              return (
                <tr key={k.id} className={system ? ui.rowSystem : ''}>
                  <td className={`${cell(last)} ${dim} overflow-hidden`}>
                    {k.name}
                    {/* own line + bounded width — a narrow Name column (this table has 7 other
                        columns) can't fit "chat-nupidstigger" + the badge on one line; as an
                        inline-block the badge would otherwise overflow onto the Owner column */}
                    {system && <span className={`${ui.badgeChat} !block w-fit max-w-full truncate mt-1`}>system · {k.kind}</span>}
                    {/* long descriptions collapse to one … line — click toggles the full text (hover also tooltips it) */}
                    {k.description ? (
                      <div
                        className={`adm-dim cursor-pointer ${descOpen[k.id] ? 'whitespace-normal break-words' : 'truncate'}`}
                        title={descOpen[k.id] ? 'Click to collapse' : `${k.description}\n\n(click to expand)`}
                        onClick={() => setDescOpen((p) => ({ ...p, [k.id]: !p[k.id] }))}
                      >{k.description}</div>
                    ) : null}
                  </td>
                  <td className={`${cell(last, true)} adm-dim ${dim}`}>
                    <button
                      className="underline decoration-dotted underline-offset-2 hover:text-ink"
                      title={`View user ${k.owner?.username || 'root'}`}
                      onClick={() => setUserView(k.owner?.username || 'root')}
                    >{k.owner?.username || 'root'}</button>
                  </td>
                  <td className={`${cell(last, true)} ${dim}`}><code className={ui.codeChip}>{k.keyPrefix}…</code></td>
                  <td className={`${cell(last)} adm-dim ${dim}`}>{k.scopes.join(', ') || '—'}</td>
                  {/* ⚠ A DISABLED CHAT KEY IS NOT A DORMANT CREDENTIAL — IT LOCKS A PERSON OUT OF CHAT.
                      For an ordinary key "disabled" means "this secret stops working". For kind='chat' it
                      means chat-site.route.js answers 403 chat_disabled on that user's send / regenerate /
                      edit-rerun / steer / suggest-title, i.e. they can still READ their history and cannot
                      generate. The page blurb says so, but the blurb is not what you read while scanning a
                      table of keys deciding which to switch off — so the row says it too. Ote asked for
                      this after the kill switch turned out to be real and unlabelled. */}
                  <td className={`${cell(last, true)} ${dim}`}>
                    {k.isActive ? '✓' : (
                      <span
                        className={k.kind === 'chat' ? 'text-red-600 dark:text-red-400 whitespace-nowrap' : undefined}
                        title={k.kind === 'chat'
                          ? `${k.owner?.username || 'root'} cannot use the chat site while this is off — sending, regenerating and editing are refused (403 chat_disabled). Reading existing conversations still works. Re-enable, or Renew for a new secret + fresh expiry.`
                          : 'This key no longer authenticates.'}
                      >{k.kind === 'chat' ? 'disabled · chat blocked' : 'disabled'}</span>
                    )}
                  </td>
                  <td className={`${cell(last)} adm-dim ${dim} overflow-hidden`} title={k.expiresAt || undefined}>
                    <div className="whitespace-nowrap overflow-hidden text-ellipsis">{fmt(k.expiresAt)}</div>
                    {/* own line, same reason as the system badge above — the date text alone already
                        fills this column, so anything appended inline just gets truncated away */}
                    {isExpired(k) && <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--danger)]" title="Past its expiry — this key no longer authenticates, regardless of Active">⚠ expired</span>}
                  </td>
                  <td className={`${cell(last, true)} adm-dim ${dim}`} title={k.lastUsedAt || undefined}>{fmt(k.lastUsedAt)}</td>
                  {/* NOTE: the flex box must be a DIV INSIDE the td — flex ON a td breaks it out of table layout. */}
                  <td className={cell(last)}>
                    {system ? (
                      isRoot ? (
                        <div className={ui.actions}>
                          {/* this Disable stays DANGER-toned, not warn like the others: it is the chat
                              kill switch — it refuses the user's turns outright and never re-enables
                              itself, which is a genuinely heavier action than disabling a standard key */}
                          {k.isActive
                            ? <button className="gw-btn adm-btn-sm adm-btn-danger" title="Chat kill switch — this user's chat turns are refused until you Enable or Renew" onClick={() => setChatOff(k)}>Disable</button>
                            : <button className="gw-btn adm-btn-sm adm-btn-ok" title="Re-enable this user's chat" onClick={() => void setActive(k, true)}>Enable</button>}
                          <button className="gw-btn adm-btn-sm" title="Rotate the secret + fresh 7-day expiry + re-enable" onClick={() => void renewChatKey(k)}>Renew</button>
                        </div>
                      ) : (
                        <span className="adm-dim" title="Auto-managed by the platform (renews when the user opens the chat site); root can disable or renew it">read-only</span>
                      )
                    ) : (
                      <div className={ui.actions}>
                        {k.canReveal
                          ? <button className="gw-btn adm-btn-sm" title="Reveal and copy the full key (asks for your credentials)" onClick={() => openReveal(k)}>Copy</button>
                          : <button className="gw-btn adm-btn-sm opacity-40 cursor-not-allowed" disabled title="Not recoverable — minted before re-copy support">Copy</button>}
                        <button className="gw-btn adm-btn-sm" onClick={() => openEdit(k)}>Edit</button>
                        <button className={`gw-btn adm-btn-sm ${k.isActive ? 'adm-btn-warn' : 'adm-btn-ok'}`} onClick={() => setActive(k, !k.isActive)}>{k.isActive ? 'Disable' : 'Enable'}</button>
                        <button className="gw-btn adm-btn-sm adm-btn-danger" onClick={() => setDeleting(k)}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {keys.length === 0 && <tr><td colSpan={8} className={ui.empty}>No API keys</td></tr>}
          </tbody>
        </table>
      </div>
      </>
      )}

      {keysTab === 'audit' && (
      <section className="gw-card" data-ui="reveal-audit">
        <div className="gw-card-title">Reveal audit</div>
        <p className="adm-dim">Every re-copy attempt: who, when, which key, outcome.</p>
        <form
          className="flex flex-wrap items-center gap-2 mb-3"
          onSubmit={(e) => { e.preventDefault(); loadAudit(1) }}
        >
          <input
            className="gw-input max-w-[280px]"
            placeholder="🔍 key name, actor or IP…"
            value={auditQ}
            onChange={(e) => setAuditQ(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <ClearableSelect className="gw-input w-44" value={auditOutcome} onChange={setAuditOutcome}>
            <option value="">(any outcome)</option>
            <option value="revealed">revealed</option>
            <option value="reauth_failed">reauth failed</option>
            <option value="rate_limited">rate limited</option>
            <option value="not_recoverable">not recoverable</option>
            <option value="system_key">system key</option>
          </ClearableSelect>
          <button className="gw-btn adm-btn-sm gw-btn-primary" type="submit">Apply</button>
          {(auditQ || auditOutcome) && (
            <button className="gw-btn adm-btn-sm" type="button" onClick={() => { setAuditQ(''); setAuditOutcome(''); loadAudit(1, '', '') }}>Clear</button>
          )}
          <span className="adm-dim text-[12px] ml-auto">{auditTotal} attempt{auditTotal === 1 ? '' : 's'} match</span>
        </form>
        {audit.length === 0
          ? <div className="adm-dim">No reveal attempts match.</div>
          : (
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <colgroup>
                  <col style={{ width: 140 }} />{/* when */}
                  <col />{/* key */}
                  <col style={{ width: 110 }} />{/* by */}
                  <col style={{ width: 120 }} />{/* outcome */}
                  <col style={{ width: 110 }} />{/* ip */}
                </colgroup>
                <thead><tr>
                  <th className={ui.th}>When</th><th className={ui.th}>Key</th><th className={ui.th}>By</th><th className={ui.th}>Outcome</th><th className={ui.th}>IP</th>
                </tr></thead>
                <tbody>
                  {audit.map((r, i) => {
                    const last = i === audit.length - 1
                    const good = r.outcome === 'revealed'
                    return (
                      <tr key={r.id}>
                        <td className={`${cell(last, true)} adm-dim`} title={r.at}>{fmt(r.at)}</td>
                        <td className={cell(last, true)} title={r.apiKeyId || undefined}>{r.keyName || '(deleted key)'}{r.keyPrefix ? <span className="adm-dim"> · {r.keyPrefix}…</span> : null}</td>
                        <td className={cell(last, true)}>{r.actor}{r.actorUserId ? '' : ' (root)'}</td>
                        <td className={cell(last, true)}>
                          <span className={good ? 'text-emerald-700' : 'text-red-700'}>{good ? '✓ revealed' : r.outcome.replace(/_/g, ' ')}</span>
                        </td>
                        <td className={`${cell(last)} adm-dim`}>{r.ip || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        <div className="flex items-center gap-3 mt-3">
          <span className="adm-dim">Page {auditPage} of {auditPages} · {auditTotal} total</span>
          <div className="flex gap-2 ml-auto">
            <button className="gw-btn adm-btn-sm" disabled={auditPage <= 1} onClick={() => loadAudit(auditPage - 1)}>← Prev</button>
            <button className="gw-btn adm-btn-sm" disabled={auditPage >= auditPages} onClick={() => loadAudit(auditPage + 1)}>Next →</button>
          </div>
        </div>
      </section>
      )}

      {chatOff && (
        <ConfirmModal
          title="Disable chat access"
          message={
            <span>
              Disable the system chat key of <b>{chatOff.owner?.username || 'root'}</b>? Their chat <b>turns will be
              refused</b> (“chat access disabled”) until you <b>Enable</b> or <b>Renew</b> the key — it never re-enables
              itself. Browsing existing conversations keeps working.
            </span>
          }
          confirmLabel="Disable chat"
          onConfirm={async () => { await apiPatch(`/v1/admin/apikeys/${chatOff.id}`, { isActive: false }); await load() }}
          onClose={() => setChatOff(null)}
        />
      )}

      {deleting && (
        <ConfirmModal
          title={`Delete API key '${deleting.name}'`}
          message={
            <span>
              Delete <b>{deleting.name}</b> (<code className={ui.codeChip}>{deleting.keyPrefix}…</code>)?
              Anything still calling the gateway with it stops working immediately (soft delete — root can
              restore it from the <b>Deleted</b> tab). Usage history is kept. To pause it instead, use <b>Disable</b>.
            </span>
          }
          confirmLabel="Delete key"
          onConfirm={async () => { await apiDelete(`/v1/admin/apikeys/${deleting.id}`); await load(); if (isRoot) loadDeleted() }}
          onClose={() => setDeleting(null)}
        />
      )}

      {hardDeleting && (
        <ConfirmModal
          title={`HARD delete key '${hardDeleting.name}'`}
          message={
            <span>
              Permanently delete <b>{hardDeleting.name}</b> (<code className={ui.codeChip}>{hardDeleting.keyPrefix}…</code>)
              and its scopes? Usage history is kept. <b>This cannot be undone.</b>
            </span>
          }
          confirmLabel="Hard delete"
          onConfirm={async () => { await apiDelete(`/v1/admin/apikeys/${hardDeleting.id}?hard=1`); loadDeleted() }}
          onClose={() => setHardDeleting(null)}
        />
      )}

      {userView && <UserDetailModal username={userView} users={users} onClose={() => setUserView(null)} />}

      {revealing && (
        <div className={ui.modalOverlay} {...dismissOnBackdrop(closeReveal)}>
          <div className={ui.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={ui.modalHead}>
              <h3 className={ui.modalTitle}>Copy API key</h3>
              <button className="gw-btn adm-btn-sm" onClick={closeReveal}>✕</button>
            </div>

            {!revealedKey ? (
              <form className={ui.formCol} onSubmit={confirmReveal}>
                <p className="adm-dim">
                  You're about to reveal the full secret of <strong>{revealing.name}</strong>{' '}
                  (<code className={ui.codeChip}>{revealing.keyPrefix}…</code>). To confirm it's you,
                  re-enter your login credentials.
                </p>
                <label className={ui.field}>
                  <span className={ui.fieldLabel}>Username or email<Req /></span>
                  <input className="gw-input" value={revUser} onChange={(e) => setRevUser(e.target.value)} autoComplete="username" spellCheck={false} required />
                </label>
                <label className={ui.field}>
                  <span className={ui.fieldLabel}>Password<Req /></span>
                  <input className="gw-input" type="password" value={revPass} onChange={(e) => setRevPass(e.target.value)} autoComplete="current-password" required />
                </label>
                {revError && <div className="gw-meta gw-error">{revError}</div>}
                <div className={ui.modalActions}>
                  <button type="button" className="gw-btn" onClick={closeReveal}>Cancel</button>
                  <button className="gw-btn gw-btn-primary" disabled={busy || !revUser.trim() || !revPass}>Confirm &amp; reveal</button>
                </div>
              </form>
            ) : (
              <div>
                <div className={ui.minted}>
                  <div className="flex items-center gap-2">
                    <div className="gw-block-title">{revealing.name}</div>
                    <button type="button" className="gw-btn adm-btn-sm ml-auto" onClick={() => copyText(revealedKey)}>{copied ? 'Copied ✓' : 'Copy'}</button>
                  </div>
                  <code className={ui.mintedKey}>{revealedKey}</code>
                </div>
                <div className={ui.modalActions}>
                  <button className="gw-btn" onClick={closeReveal}>Close</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <div className={ui.modalOverlay} {...dismissOnBackdrop(closeEdit)}>
          <div className={ui.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={ui.modalHead}>
              <h3 className={ui.modalTitle}>Edit API key</h3>
              <button className="gw-btn adm-btn-sm" onClick={closeEdit}>✕</button>
            </div>
            <p className="adm-dim">Prefix <code className={ui.codeChip}>{editing.keyPrefix}…</code> · owner {editing.owner?.username || 'root'}. The secret itself can't be shown or changed.</p>

            <label className={ui.field}>
              <span className={ui.fieldLabel}>Name<Req /></span>
              <input className="gw-input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} spellCheck={false} autoComplete="off" />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Description</span>
              <input className="gw-input" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} autoComplete="off" />
            </label>
            <div className={ui.field}>
              <span className={ui.fieldLabel}>Scopes</span>
              <div className={ui.scopes}>
                {allScopes.map((s) => (
                  <label key={s} className="gw-check">
                    <input type="checkbox" checked={draft.scopes.includes(s)} onChange={() => setDraft((d) => ({ ...d, scopes: toggle(d.scopes, s) }))} />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            <div className={ui.field}>
              <span className={ui.fieldLabel}>Expires</span>
              <div className={ui.formRow}>
                <input className="gw-input max-w-[260px]" type="datetime-local" value={draft.expiresAt} onChange={(e) => setDraft((d) => ({ ...d, expiresAt: e.target.value }))} />
                {draft.expiresAt && <button type="button" className="gw-btn adm-btn-sm" onClick={() => setDraft((d) => ({ ...d, expiresAt: '' }))}>Clear</button>}
              </div>
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
