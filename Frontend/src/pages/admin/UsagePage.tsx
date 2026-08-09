import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPatch, apiPost } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { cell, ui } from './ui'
import UserCombo from './UserCombo'
import ClearableSelect from '../../components/ClearableSelect'
import UserDetailModal, { type UserInfo } from './UserDetailModal'
import UsageStatsPanel from '../../components/UsageStatsPanel'
import RefreshButton from '../../components/RefreshButton'
import { dismissOnBackdrop } from '../../lib/overlay'

type UsageRow = {
  id: string; userId: string | null; apiKeyId: string | null; apiKeyName: string | null
  apiKeyKind: string | null // 'chat' = the user's system chat-site key
  userName: string | null // key owner's username, falling back to the row's own user ('root' for superuser keys)
  provider: string | null; model: string | null; endpoint: string | null
  promptTokens: number | null; completionTokens: number | null; ttftMs: number | null; latencyMs: number | null; createdAt: string
  requestBody?: string | null; responseBody?: string | null
}

// Bodies are stored as JSON strings — pretty-print when parseable, show raw otherwise.
const pretty = (s: string | null | undefined) => {
  if (!s) return null
  try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s }
}
type ApiKeyOpt = { id: string; name: string; kind: string }
type ProviderOpt = { name: string }

const PAGE_SIZE = 50
const ENDPOINTS = ['chat', 'chat.completions', 'anthropic.messages', 'embeddings', 'provider.test']

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
const toIso = (local: string) => (local ? new Date(local).toISOString() : '')
const tokPerSec = (r: UsageRow) =>
  r.completionTokens != null && r.latencyMs ? (r.completionTokens / (r.latencyMs / 1000)) : null

// Human-readable duration alongside raw ms: 742ms · 9305ms (9.3s) · 138116ms (2m 18s)
const fmtDur = (ms: number | null | undefined) => {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${ms}ms (${(ms / 1000).toFixed(1)}s)`
  return `${ms}ms (${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s)`
}

type ColdFile = { name: string; bytes: number; modifiedAt: string }

export default function UsagePage() {
  const { can } = useAuth()
  const [rows, setRows] = useState<UsageRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statsKey, setStatsKey] = useState(0) // bump to remount UsageStatsPanel = force a stats refetch
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<UsageRow | null>(null)

  // retention & cold storage (root-only card)
  const [retDays, setRetDays] = useState('0')
  const [coldOn, setColdOn] = useState(true)
  const [coldDir, setColdDir] = useState('./cold-storage/usage')
  const [coldFiles, setColdFiles] = useState<ColdFile[]>([])
  const [coldDirAbs, setColdDirAbs] = useState('')
  const [retMsg, setRetMsg] = useState('')
  const [retBusy, setRetBusy] = useState(false)

  const loadRetention = useCallback(() => {
    apiGet('/v1/admin/settings').then((r) => {
      const s = r.settings || {}
      setRetDays(String(s['usage.retentionDays']?.value ?? 0))
      setColdOn(Boolean(s['usage.coldStorage.enabled']?.value ?? true))
      setColdDir(String(s['usage.coldStorage.directory']?.value ?? './cold-storage/usage'))
    }).catch(() => {})
    apiGet('/v1/admin/usage/cold').then((r) => { setColdFiles(r.files || []); setColdDirAbs(r.directory || '') }).catch(() => {})
  }, [])
  useEffect(() => { if (can('system_config')) loadRetention() }, [can, loadRetention])

  const saveRetention = async () => {
    const n = Math.floor(Number(retDays))
    if (!Number.isFinite(n) || n < 0 || n > 3650) { setRetMsg('Retention must be 0–3650 days (0 = keep forever)'); return }
    setRetMsg('')
    try {
      await apiPatch('/v1/admin/settings', {
        'usage.retentionDays': n,
        'usage.coldStorage.enabled': coldOn,
        'usage.coldStorage.directory': coldDir.trim() || './cold-storage/usage',
      })
      setRetMsg('Saved — the daily cleanup applies these; or use Run now.')
    } catch (err) {
      setRetMsg(err instanceof Error ? err.message : String(err))
    }
  }

  const runRetentionNow = async () => {
    setRetBusy(true); setRetMsg('')
    try {
      const r = await apiPost('/v1/admin/usage/retention/run', {})
      const res = r.result || {}
      if (res.skipped) setRetMsg(`Nothing to do — ${res.reason}`)
      else if (res.error) setRetMsg(`Failed: ${res.error}`)
      else setRetMsg(`Done: ${res.deleted} row(s) pruned${res.coldStorage ? `, ${res.dumped} dumped to cold storage` : ' (cold storage off — deleted outright)'}${res.files?.length ? ` → ${res.files.join(', ')}` : ''}`)
      loadRetention()
      load(1)
    } catch (err) {
      setRetMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setRetBusy(false)
    }
  }

  // filter options + state
  const [keys, setKeys] = useState<ApiKeyOpt[]>([])
  const [providers, setProviders] = useState<ProviderOpt[]>([])
  const [users, setUsers] = useState<UserInfo[]>([])
  const [fUser, setFUser] = useState('') // '' = everyone, 'root', or a user id
  const [fRole, setFRole] = useState('') // '' = any, 'root', or a role name
  const [userView, setUserView] = useState<string | null>(null) // username clicked in the User column
  const [fKey, setFKey] = useState('')
  const [fProvider, setFProvider] = useState('')
  const [fModel, setFModel] = useState('')
  const [fEndpoint, setFEndpoint] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')

  useEffect(() => {
    apiGet('/v1/admin/apikeys').then((r) => setKeys(r.apiKeys)).catch(() => {})
    apiGet('/v1/admin/providers').then((r) => setProviders(r.providers)).catch(() => {})
    apiGet('/v1/admin/users').then((r) => setUsers(r.users)).catch(() => {})
  }, [])

  // the same filter set feeds the list AND the dashboard (stats accepts identical params)
  const buildFilterParams = useCallback(() => {
    const f: Record<string, string> = {}
    if (fUser) f.userId = fUser
    if (fRole) f.role = fRole
    if (fKey) f.apiKeyId = fKey
    if (fProvider) f.provider = fProvider
    if (fModel.trim()) f.model = fModel.trim()
    if (fEndpoint) f.endpoint = fEndpoint
    if (fFrom) f.from = toIso(fFrom)
    if (fTo) f.to = toIso(fTo)
    return f
  }, [fUser, fRole, fKey, fProvider, fModel, fEndpoint, fFrom, fTo])
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({})

  const load = useCallback(async (p = 1) => {
    setError('')
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) })
      for (const [k, v] of Object.entries(buildFilterParams())) params.set(k, v)
      const res = await apiGet(`/v1/admin/usage?${params.toString()}`)
      setRows(res.usage)
      setTotal(res.total)
      setPage(res.page)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [buildFilterParams])

  useEffect(() => { load(1) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilters = () => { setAppliedFilters(buildFilterParams()); void load(1) }
  const clear = () => { setFUser(''); setFRole(''); setFKey(''); setFProvider(''); setFModel(''); setFEndpoint(''); setFFrom(''); setFTo('') }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const [usageTab, setUsageTab] = useState<'dashboard' | 'list'>('dashboard')

  return (
    <div className={`${ui.page} flex flex-col gap-5`}>
      <div>
        <h2 className={ui.h2}>Usage</h2>
        <p className="adm-dim">Per-call token + latency log across the chat site and the API surfaces (OpenAI + Anthropic). Every call carries its API key — chat-site turns ride the user's <span className={ui.badgeChat}>💬 system chat key</span>. Tokens in = prompt, tokens out = completion.</p>
      </div>

      <section className="gw-card">
        <div className="gw-card-title">Filters</div>
        <form className="grid gap-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); applyFilters() }}>
          <div className={ui.field}>
            <span className={ui.fieldLabel}>User</span>
            <UserCombo users={users} value={fUser} onChange={setFUser} />
          </div>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Role (user's role)</span>
            <ClearableSelect className="gw-input" value={fRole} onChange={setFRole}>
              <option value="">(any)</option>
              <option value="root">root</option>
              {[...new Set(users.flatMap((u) => u.roles || []))].sort().map((r) => <option key={r} value={r}>{r}</option>)}
            </ClearableSelect>
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>API key</span>
            <ClearableSelect className="gw-input" value={fKey} onChange={setFKey}>
              <option value="">(any)</option>
              {keys.map((k) => <option key={k.id} value={k.id}>{k.kind === 'chat' ? `💬 ${k.name} (system · chat)` : k.name}</option>)}
            </ClearableSelect>
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Provider</span>
            <ClearableSelect className="gw-input" value={fProvider} onChange={setFProvider}>
              <option value="">(any)</option>
              {providers.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </ClearableSelect>
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Endpoint</span>
            <ClearableSelect className="gw-input" value={fEndpoint} onChange={setFEndpoint}>
              <option value="">(any)</option>
              {ENDPOINTS.map((ep) => <option key={ep} value={ep}>{ep}</option>)}
            </ClearableSelect>
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Model (contains)</span>
            <input className="gw-input" value={fModel} onChange={(e) => setFModel(e.target.value)} placeholder="e.g. gemma4" spellCheck={false} autoComplete="off" />
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>From</span>
            <input className="gw-input" type="datetime-local" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>To</span>
            <input className="gw-input" type="datetime-local" value={fTo} onChange={(e) => setFTo(e.target.value)} />
          </label>
          <div className="flex items-center gap-2 md:col-span-3">
            <button className="gw-btn gw-btn-primary">Apply</button>
            <button type="button" className="gw-btn" onClick={clear}>Clear</button>
            <span className="adm-dim ml-auto">{total} request{total === 1 ? '' : 's'} match</span>
          </div>
        </form>
        {error && <div className="gw-meta gw-error">{error}</div>}
      </section>

      <div className="flex items-center gap-1.5" data-ui="usage-tabs">
        <button className={`gw-btn adm-btn-sm ${usageTab === 'dashboard' ? 'gw-btn-primary' : ''}`} onClick={() => setUsageTab('dashboard')}>Dashboard</button>
        <button className={`gw-btn adm-btn-sm ${usageTab === 'list' ? 'gw-btn-primary' : ''}`} onClick={() => setUsageTab('list')}>Requests · {total}</button>
        <RefreshButton className="ml-auto" onRefresh={async () => { setStatsKey((k) => k + 1); await load(page) }} />
      </div>

      {usageTab === 'dashboard' && (
        <section className="gw-card" data-ui="usage-dashboard">
          <div className="gw-card-title">Dashboard</div>
          <UsageStatsPanel key={statsKey} endpoint="/v1/admin/usage/stats" showUsers filters={appliedFilters} />
        </section>
      )}

      {usageTab === 'list' && (
      <div>
        <div className={ui.tableWrap}>
          <table className={ui.table} data-ui="usage-table">
            <colgroup>
              <col style={{ width: 120 }} />{/* API key (chat rows wear the system badge) */}
              <col style={{ width: 100 }} />{/* User (key owner) */}
              <col style={{ width: 105 }} />{/* Provider */}
              <col />{/* Model — flexible */}
              <col style={{ width: 65 }} />{/* In */}
              <col style={{ width: 65 }} />{/* Out */}
              <col style={{ width: 70 }} />{/* tok/s */}
              <col style={{ width: 85 }} />{/* Latency */}
              <col style={{ width: 140 }} />{/* When */}
              <col style={{ width: 80 }} />{/* Details */}
            </colgroup>
            <thead><tr>
              <th className={ui.th}>API key</th><th className={ui.th}>User</th><th className={ui.th}>Provider</th><th className={ui.th}>Model</th>
              <th className={ui.th}>In</th><th className={ui.th}>Out</th><th className={ui.th}>tok/s</th>
              <th className={ui.th}>Latency</th><th className={ui.th}>When</th><th className={ui.th}></th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const last = i === rows.length - 1
                const tps = tokPerSec(r)
                return (
                  <tr key={r.id}>
                    <td className={`${cell(last, true)} adm-dim`} title={r.apiKeyKind === 'chat' ? `System chat key — ${r.apiKeyName}` : r.apiKeyId || undefined}>
                      {r.apiKeyKind === 'chat'
                        ? <span className={ui.badgeChat}>💬 {r.apiKeyName}</span>
                        : (r.apiKeyName || (r.apiKeyId ? r.apiKeyId.slice(0, 8) : '—'))}
                    </td>
                    <td className={`${cell(last, true)} adm-dim`}>
                      {r.userName
                        ? <button className="underline decoration-dotted underline-offset-2 hover:text-ink" title={`View user ${r.userName}`} onClick={() => setUserView(r.userName)}>{r.userName}</button>
                        : '—'}
                    </td>
                    <td className={cell(last, true)} title={r.provider || undefined}>{r.provider || '—'}</td>
                    <td className={cell(last, true)} title={r.model || undefined}>{r.model || '—'}</td>
                    <td className={cell(last, true)}>{r.promptTokens ?? '—'}</td>
                    <td className={cell(last, true)}>{r.completionTokens ?? '—'}</td>
                    <td className={cell(last, true)}>{tps != null ? tps.toFixed(1) : '—'}</td>
                    <td className={cell(last, true)}>{r.latencyMs != null ? `${r.latencyMs}ms` : '—'}</td>
                    <td className={`${cell(last, true)} adm-dim`} title={r.createdAt || undefined}>{fmt(r.createdAt)}</td>
                    <td className={cell(last)}>
                      <button
                        className="gw-btn adm-btn-sm"
                        onClick={() => {
                          setDetail(r) // show metrics immediately…
                          apiGet(`/v1/admin/usage/${r.id}`).then((res) => setDetail(res.usage)).catch(() => {}) // …then hydrate bodies
                        }}
                      >Details</button>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && <tr><td colSpan={10} className={ui.empty}>No usage matches</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <span className="adm-dim">Page {page} of {pages} · {total} total</span>
          <div className="flex gap-2 ml-auto">
            <button className="gw-btn adm-btn-sm" disabled={page <= 1} onClick={() => load(page - 1)}>← Prev</button>
            <button className="gw-btn adm-btn-sm" disabled={page >= pages} onClick={() => load(page + 1)}>Next →</button>
          </div>
        </div>
      </div>
      )}

      {can('system_config') && (
        <section className="gw-card" data-ui="retention-card">
          <div className="gw-card-title">Retention & cold storage</div>
          <p className="adm-dim">Usage rows older than the retention window are pruned by a daily job (04:10). With cold storage on, pruned rows are first appended to gzipped NDJSON files (one per month) — nothing is lost, just moved off the hot table.</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className={ui.field} style={{ maxWidth: 190 }}>
              <span className={ui.fieldLabel}>Keep rows for (days)</span>
              <input className="gw-input" autoComplete="off" value={retDays} onChange={(e) => setRetDays(e.target.value)} placeholder="0 = keep forever" />
            </label>
            <label className="gw-check mb-1.5" style={{ whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={coldOn} onChange={(e) => setColdOn(e.target.checked)} />
              <span>Dump pruned rows to cold storage</span>
            </label>
            <label className={ui.field} style={{ minWidth: 240, flex: 1 }}>
              <span className={ui.fieldLabel}>Cold storage directory (relative to Backend/)</span>
              <input className="gw-input" autoComplete="off" value={coldDir} onChange={(e) => setColdDir(e.target.value)} />
            </label>
            <div className="flex gap-2 mb-0.5">
              <button className="gw-btn gw-btn-primary" onClick={saveRetention}>Save</button>
              <button className="gw-btn" disabled={retBusy} onClick={runRetentionNow}>{retBusy ? 'Running…' : 'Run now'}</button>
            </div>
          </div>
          {retMsg && <div className="gw-meta mt-2">{retMsg}</div>}
          <div className="mt-3">
            <div className={ui.fieldLabel}>Cold storage dumps {coldDirAbs ? <span className="adm-dim font-normal">— {coldDirAbs}</span> : null}</div>
            {coldFiles.length === 0
              ? <div className="adm-dim">No dumps yet.</div>
              : (
                <ul className="text-[13px] leading-relaxed">
                  {coldFiles.map((f) => (
                    <li key={f.name} className="flex gap-3">
                      <code>{f.name}</code>
                      <span className="adm-dim">{(f.bytes / 1024).toFixed(1)} KB · {fmt(f.modifiedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            <div className="adm-dim mt-1">Query dumps from the workspace: <code>node DevTools/maintenance/usage-cold-query.mjs</code> (stats) · <code>--rows --from 2026-01-01 --provider ollama</code> (filtered rows) · <code>--list</code>. Files are standard gzip — <code>zcat</code>/<code>gunzip</code> + any NDJSON tool works too.</div>
          </div>
        </section>
      )}

      {userView && <UserDetailModal username={userView} users={users} onClose={() => setUserView(null)} />}

      {detail && (
        <div className={ui.modalOverlay} {...dismissOnBackdrop(() => setDetail(null))}>
          <div className={ui.modalCard} style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className={ui.modalHead}>
              <h3 className={ui.modalTitle}>Request metrics</h3>
              <button className="gw-btn adm-btn-sm" onClick={() => setDetail(null)}>✕</button>
            </div>
            {(() => {
              const tps = tokPerSec(detail)
              const totalTok = detail.promptTokens != null && detail.completionTokens != null ? detail.promptTokens + detail.completionTokens : null
              const line = (k: string, v: string) => (
                <div className="flex justify-between gap-4 border-b border-line/60 py-1 text-[13px]"><span className="text-muted">{k}</span><span className="text-right break-all">{v}</span></div>
              )
              return (
                <div>
                  {line('When', new Date(detail.createdAt).toLocaleString())}
                  {line('API key', detail.apiKeyName
                    ? `${detail.apiKeyKind === 'chat' ? '💬 ' : ''}${detail.apiKeyName}${detail.apiKeyKind === 'chat' ? ' — system chat key' : ''} (${detail.apiKeyId?.slice(0, 8)}…)`
                    : detail.apiKeyId || '—')}
                  {line('User', detail.userName || '—')}
                  {line('Provider', detail.provider || '—')}
                  {line('Model', detail.model || '—')}
                  {line('Endpoint', detail.endpoint || '—')}
                  {line('Tokens in (prompt)', String(detail.promptTokens ?? '—'))}
                  {line('Tokens out (completion)', String(detail.completionTokens ?? '—'))}
                  {line('Tokens total', String(totalTok ?? '—'))}
                  {line('Output speed', tps != null ? `${tps.toFixed(2)} tok/s` : '—')}
                  {line('Time to first token', fmtDur(detail.ttftMs))}
                  {line('Total latency', fmtDur(detail.latencyMs))}
                  {line('Log id', detail.id)}

                  <div className={`${ui.fieldLabel} mt-3`}>Prompt (request context)</div>
                  <pre className="bg-surface border border-line rounded-lg p-2 text-[11px] leading-relaxed max-h-56 overflow-auto whitespace-pre-wrap break-all">{pretty(detail.requestBody) ?? '(not captured for this request)'}</pre>
                  <div className={`${ui.fieldLabel} mt-3`}>Response</div>
                  <pre className="bg-surface border border-line rounded-lg p-2 text-[11px] leading-relaxed max-h-56 overflow-auto whitespace-pre-wrap break-all">{pretty(detail.responseBody) ?? '(not captured for this request)'}</pre>
                </div>
              )
            })()}
            <div className={ui.modalActions}>
              <button className="gw-btn" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
