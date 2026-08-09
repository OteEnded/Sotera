import { useCallback, useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api'
import { copyToClipboard } from '../lib/clipboard'
import ConfirmModal from '../components/ConfirmModal'
import RefreshButton from '../components/RefreshButton'
import Req from '../components/Req'
import { cell, ui } from './admin/ui'
import { dismissOnBackdrop } from '../lib/overlay'

// Self-service API keys — the developer tier's surface. Keys minted here belong to
// the logged-in user, authenticate against /v1 + /api/* with the chosen scopes, and
// are the same rows admins oversee on the admin API Keys page. The raw key shows
// once at mint; re-copying later requires re-entering the account password (every
// attempt lands in the reveal audit). The system chat key appears read-only.

type MyKey = {
  id: string; kind: string; canReveal: boolean
  name: string; description: string; keyPrefix: string
  scopes: string[]; isActive: boolean
  expiresAt: string | null; lastUsedAt: string | null; createdAt: string
}

const fmtWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

export default function MyKeysPage() {
  const [keys, setKeys] = useState<MyKey[]>([])
  const [allowedScopes, setAllowedScopes] = useState<string[]>(['models.read', 'chat', 'streaming', 'embeddings'])
  const [err, setErr] = useState('')

  // ---- create form + minted-once box ----
  const [cName, setCName] = useState('')
  const [cScopes, setCScopes] = useState<string[]>(['chat', 'streaming'])
  const [cBusy, setCBusy] = useState(false)
  const [minted, setMinted] = useState<{ name: string; rawKey: string; notice: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // ---- edit modal ----
  const [editing, setEditing] = useState<MyKey | null>(null)
  const [eName, setEName] = useState('')
  const [eDesc, setEDesc] = useState('')
  const [eScopes, setEScopes] = useState<string[]>([])
  const [eExpires, setEExpires] = useState('') // yyyy-mm-dd or ''
  const [eBusy, setEBusy] = useState(false)

  // ---- delete + reveal (password re-check) ----
  const [removing, setRemoving] = useState<MyKey | null>(null)
  const [revealing, setRevealing] = useState<MyKey | null>(null)
  const [revealPw, setRevealPw] = useState('')
  const [revealErr, setRevealErr] = useState('')
  const [revealBusy, setRevealBusy] = useState(false)
  const [revealed, setRevealed] = useState('')

  const load = useCallback(() => {
    apiGet('/v1/me/apikeys')
      .then((r) => { setKeys(r.apiKeys || []); if (Array.isArray(r.allowedScopes)) setAllowedScopes(r.allowedScopes) })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => { load() }, [load])

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(''); setMinted(null); setCopied(false); setCBusy(true)
    try {
      const r = await apiPost('/v1/me/apikeys', { name: cName.trim(), scopes: cScopes })
      setMinted({ name: r.apiKey.name, rawKey: r.rawKey, notice: r.notice })
      setCName('')
      load()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setCBusy(false)
    }
  }

  const openEdit = (k: MyKey) => {
    setEditing(k); setEName(k.name); setEDesc(k.description || '')
    setEScopes(k.scopes); setEExpires(k.expiresAt ? k.expiresAt.slice(0, 10) : '')
  }
  const saveEdit = async () => {
    if (!editing) return
    setErr(''); setEBusy(true)
    try {
      await apiPatch(`/v1/me/apikeys/${editing.id}`, {
        name: eName.trim() || editing.name,
        description: eDesc,
        scopes: eScopes,
        expiresAt: eExpires ? new Date(`${eExpires}T23:59:59`).toISOString() : null,
      })
      setEditing(null)
      load()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setEBusy(false)
    }
  }

  const toggleActive = async (k: MyKey) => {
    setErr('')
    try { await apiPatch(`/v1/me/apikeys/${k.id}`, { isActive: !k.isActive }); load() }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)) }
  }

  const doDelete = async () => {
    if (!removing) return
    await apiDelete(`/v1/me/apikeys/${removing.id}`) // ConfirmModal surfaces a throw
    load()
  }

  const openReveal = (k: MyKey) => { setRevealing(k); setRevealPw(''); setRevealErr(''); setRevealed(''); setRevealBusy(false) }
  const doReveal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!revealing) return
    setRevealErr(''); setRevealBusy(true)
    try {
      const r = await apiPost(`/v1/me/apikeys/${revealing.id}/reveal`, { password: revealPw })
      setRevealed(r.rawKey)
      await copyToClipboard(r.rawKey) // best-effort auto-copy; the key is shown regardless
    } catch (e2) {
      setRevealErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setRevealBusy(false)
    }
  }

  const scopeChecks = (value: string[], onToggle: (s: string) => void) => (
    <div className={ui.scopes}>
      {allowedScopes.map((s) => (
        <label key={s} className="gw-check" style={{ whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={value.includes(s)} onChange={() => onToggle(s)} />
          <span>{s}</span>
        </label>
      ))}
    </div>
  )

  const status = (k: MyKey) => {
    const expired = k.expiresAt && new Date(k.expiresAt) < new Date()
    if (expired) return <b className="text-[var(--danger)]">expired</b>
    return k.isActive ? <span className="text-emerald-700 font-semibold">active</span> : <span className="adm-dim">disabled</span>
  }

  return (
    <div className={ui.page}>
      <div className="flex items-center gap-2">
        <h2 className={`${ui.h2} !mb-0`}>My API Keys</h2>
        <RefreshButton className="ml-auto" onRefresh={load} />
      </div>
      <p className="adm-dim">
        Keys for calling the API surfaces (<code className={ui.codeChip}>/v1</code>, <code className={ui.codeChip}>/api/openai/v1</code>, <code className={ui.codeChip}>/api/anthropic/v1</code>) as you —
        see <b>API Docs</b> for how to use them. The key value shows <b>once</b> at mint; Copy later re-asks your password. Your usage with them is on <b>My Usage</b>.
      </p>
      {err && <div className="gw-meta gw-error">{err}</div>}

      <section className="gw-card" data-ui="mykeys-card">
        <div className="gw-card-title">Your keys</div>
        <div className={ui.tableWrap}>
          <table className={ui.table} data-ui="mykeys-table">
            <colgroup>
              <col />{/* name */}
              <col style={{ width: 150 }} />{/* prefix */}
              <col style={{ width: 190 }} />{/* scopes */}
              <col style={{ width: 82 }} />{/* status */}
              <col style={{ width: 120 }} />{/* last used */}
              <col style={{ width: 278 }} />{/* actions */}
            </colgroup>
            <thead><tr>
              <th className={ui.th}>Name</th><th className={ui.th}>Key</th><th className={ui.th}>Scopes</th>
              <th className={ui.th}>Status</th><th className={ui.th}>Last used</th><th className={ui.th}></th>
            </tr></thead>
            <tbody>
              {keys.map((k, i) => {
                const last = i === keys.length - 1
                const system = k.kind !== 'standard'
                return (
                  <tr key={k.id} className={system ? ui.rowSystem : ''}>
                    <td className={cell(last, true)} title={k.description || k.name}>
                      {k.name}
                      {system && <span className={`${ui.badgeChat} ml-1.5`}>system · chat</span>}
                    </td>
                    <td className={cell(last, true)}><code className={ui.codeChip}>{k.keyPrefix}…</code></td>
                    <td className={cell(last, true)} title={k.scopes.join(', ')}>{k.scopes.join(', ') || '—'}</td>
                    <td className={cell(last, true)}>{status(k)}</td>
                    <td className={`${cell(last, true)} adm-dim`}>{fmtWhen(k.lastUsedAt)}</td>
                    <td className={cell(last)}>
                      {system ? (
                        <span className="adm-dim" title="Auto-managed — attributes your chat usage; it has no retrievable secret">auto-managed</span>
                      ) : (
                        <div className={ui.actions}>
                          <button className="gw-btn adm-btn-sm" disabled={!k.canReveal}
                            title={k.canReveal ? 'Copy the key (re-enter your password)' : 'This key\'s raw value is not stored — mint a new one'}
                            onClick={() => openReveal(k)}>Copy</button>
                          <button className="gw-btn adm-btn-sm" onClick={() => openEdit(k)}>Edit</button>
                          <button className={`gw-btn adm-btn-sm ${k.isActive ? 'adm-btn-warn' : 'adm-btn-ok'}`} onClick={() => void toggleActive(k)}>{k.isActive ? 'Disable' : 'Enable'}</button>
                          <button className="gw-btn adm-btn-sm adm-btn-danger" onClick={() => setRemoving(k)}>Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {keys.length === 0 && <tr><td colSpan={6} className={ui.empty}>No keys yet — mint one below.</td></tr>}
            </tbody>
          </table>
        </div>

        <form className="flex flex-wrap items-end gap-3 mt-4" onSubmit={(e) => void createKey(e)}>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Name<Req /></span>
            <input className="gw-input !w-[220px]" placeholder="e.g. my-bot" value={cName}
              onChange={(e) => setCName(e.target.value)} required autoComplete="off" />
          </label>
          <div className={ui.field}>
            <span className={ui.fieldLabel}>Scopes</span>
            {scopeChecks(cScopes, (s) => setCScopes((v) => toggleIn(v, s)))}
          </div>
          <button className="gw-btn gw-btn-primary" disabled={cBusy || !cName.trim()}>Mint key</button>
        </form>

        {minted && (
          <div className={ui.minted} data-ui="mykeys-minted">
            <b>{minted.name}</b> — {minted.notice}
            <code className={ui.mintedKey}>{minted.rawKey}</code>
            <div className="flex gap-2 mt-2">
              <button className="gw-btn adm-btn-sm" onClick={() => { void copyToClipboard(minted.rawKey).then(setCopied) }}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
              <button className="gw-btn adm-btn-sm" onClick={() => setMinted(null)}>Dismiss</button>
            </div>
          </div>
        )}
      </section>

      {/* ---- edit modal ---- */}
      {editing && (
        <div className={ui.modalOverlay} {...dismissOnBackdrop(() => setEditing(null))}>
          <div className={ui.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={ui.modalHead}>
              <h3 className={ui.modalTitle}>Edit key</h3>
              <button className="gw-btn adm-btn-sm" onClick={() => setEditing(null)}>✕</button>
            </div>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Name<Req /></span>
              <input className="gw-input" value={eName} onChange={(e) => setEName(e.target.value)} autoComplete="off" />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Description</span>
              <input className="gw-input" value={eDesc} onChange={(e) => setEDesc(e.target.value)} autoComplete="off" />
            </label>
            <div className={ui.field}>
              <span className={ui.fieldLabel}>Scopes</span>
              {scopeChecks(eScopes, (s) => setEScopes((v) => toggleIn(v, s)))}
            </div>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Expires (end of day — leave empty for no expiry)</span>
              <input className="gw-input !w-[180px]" type="date" value={eExpires} onChange={(e) => setEExpires(e.target.value)} />
            </label>
            <div className={ui.modalActions}>
              <button className="gw-btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="gw-btn gw-btn-primary" disabled={eBusy || !eName.trim()} onClick={() => void saveEdit()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- reveal (password re-check) modal ---- */}
      {revealing && (
        <div className={ui.modalOverlay} {...dismissOnBackdrop(() => setRevealing(null))}>
          <div className={ui.modalCard} onClick={(e) => e.stopPropagation()} data-ui="mykeys-reveal-modal">
            <div className={ui.modalHead}>
              <h3 className={ui.modalTitle}>Copy “{revealing.name}”</h3>
              <button className="gw-btn adm-btn-sm" onClick={() => setRevealing(null)}>✕</button>
            </div>
            {revealed ? (
              <>
                <p className="adm-dim m-0">Copied to your clipboard — it is also shown here:</p>
                <code className={ui.mintedKey}>{revealed}</code>
                <div className={ui.modalActions}>
                  <button className="gw-btn gw-btn-primary" onClick={() => setRevealing(null)}>Done</button>
                </div>
              </>
            ) : (
              <form onSubmit={(e) => void doReveal(e)} className="flex flex-col gap-3">
                <p className="adm-dim m-0">Re-enter your password to copy this key. Every attempt is logged.</p>
                <label className={ui.field}>
                  <span className={ui.fieldLabel}>Password<Req /></span>
                  <input className="gw-input" type="password" value={revealPw} onChange={(e) => setRevealPw(e.target.value)}
                    autoComplete="current-password" autoFocus required />
                </label>
                {revealErr && <div className="gw-meta gw-error">{revealErr}</div>}
                <div className={ui.modalActions}>
                  <button type="button" className="gw-btn" onClick={() => setRevealing(null)}>Cancel</button>
                  <button type="submit" className="gw-btn gw-btn-primary" disabled={revealBusy || !revealPw}>Reveal & copy</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {removing && (
        <ConfirmModal
          title="Delete API key"
          message={`Delete “${removing.name}” (${removing.keyPrefix}…)? Calls using it will stop working immediately.`}
          confirmLabel="Delete key"
          onConfirm={doDelete}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  )
}
