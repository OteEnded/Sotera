import { useCallback, useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api'
import ConfirmModal from '../../components/ConfirmModal'
import ModelCombo from '../../components/ModelCombo'
import RefreshButton from '../../components/RefreshButton'
import Req from '../../components/Req'
import { cell, ui } from './ui'
import { dismissOnBackdrop } from '../../lib/overlay'

type Provider = {
  name: string; kind: string; type: string; supported: boolean; enabled: boolean
  endpoint: string; apiKeySet: boolean; apiKeyTail: string | null
  source: string // 'config' = platform default (file) · 'override' = DB row over a default · 'db' = DB-only
}

const KINDS = ['openai-compatible', 'anthropic', 'ollama']
const endpointLabel = (k: string) => (k === 'ollama' ? 'Host' : k === 'anthropic' ? 'Base URL (without /v1)' : 'Base URL')
const endpointPlaceholder = (k: string) =>
  k === 'ollama' ? 'http://127.0.0.1:11434'
  : k === 'anthropic' ? 'https://api.anthropic.com (or a vendor /anthropic route)'
  : 'https://api.example.com/v1'

type ByokRow = { name: string; kind: string; endpoint: string; enabled: boolean; owner: string; apiKeySet: boolean }

// Root-only editor for config.json's `providers` section. Changes apply to the running
// gateway immediately and are persisted to Backend/config.json by the server.
export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [byok, setByok] = useState<ByokRow[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // create form
  const [name, setName] = useState('')
  const [kind, setKind] = useState('openai-compatible')
  const [endpoint, setEndpoint] = useState('')
  const [apiKey, setApiKey] = useState('')

  // edit modal
  const [editing, setEditing] = useState<Provider | null>(null)
  const [dKind, setDKind] = useState('')
  const [dEndpoint, setDEndpoint] = useState('')
  const [dApiKey, setDApiKey] = useState('')
  const [dClearKey, setDClearKey] = useState(false)

  // test modal: health + model list load on open; then pick a model and fire a prompt
  const [testing, setTesting] = useState<Provider | null>(null)
  const [tHealth, setTHealth] = useState<{ status: string; detail?: string } | null>(null)
  const [tModels, setTModels] = useState<{ id: string }[]>([])
  const [tModelsErr, setTModelsErr] = useState('')
  const [tModel, setTModel] = useState('')
  const [tPrompt, setTPrompt] = useState('Reply with exactly: OK')
  const [tSending, setTSending] = useState(false)
  const [tResult, setTResult] = useState<{ reply: string; reasoning?: string | null; latencyMs: number; usage?: { promptTokens?: number | null; completionTokens?: number | null } | null } | null>(null)
  const [tErr, setTErr] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await apiGet('/v1/admin/providers')
      setProviders(res.providers)
      setByok(res.byok || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => { load() }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      await apiPost('/v1/admin/providers', {
        name: name.trim(), kind, endpoint: endpoint.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      })
      setName(''); setEndpoint(''); setApiKey(''); setKind('openai-compatible')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const openEdit = (p: Provider) => {
    setEditing(p)
    setDKind(p.kind); setDEndpoint(p.endpoint); setDApiKey(''); setDClearKey(false)
  }

  const saveEdit = async () => {
    if (!editing) return
    setError(''); setBusy(true)
    try {
      const body: Record<string, unknown> = { kind: dKind, endpoint: dEndpoint.trim() }
      if (dClearKey) body.apiKey = ''
      else if (dApiKey.trim()) body.apiKey = dApiKey.trim()
      await apiPatch(`/v1/admin/providers/${editing.name}`, body)
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const openTest = (p: Provider) => {
    setTesting(p)
    setTHealth(null); setTModels([]); setTModelsErr(''); setTModel('')
    setTPrompt('Reply with exactly: OK'); setTResult(null); setTErr(''); setTSending(false)
    apiGet(`/v1/admin/providers/${p.name}/health`).then(setTHealth).catch(() => setTHealth({ status: 'unknown', detail: 'health check failed' }))
    apiGet(`/v1/admin/providers/${p.name}/models`)
      .then((r) => { setTModels(r.models || []); if (r.models?.[0]) setTModel(r.models[0].id) })
      .catch((err) => setTModelsErr(err instanceof Error ? err.message : String(err)))
  }

  const runTest = async () => {
    if (!testing || !tModel) return
    setTSending(true); setTErr(''); setTResult(null)
    try {
      const r = await apiPost(`/v1/admin/providers/${testing.name}/test`, { model: tModel, prompt: tPrompt.trim() || undefined })
      setTResult(r)
    } catch (err) {
      setTErr(err instanceof Error ? err.message : String(err))
    } finally {
      setTSending(false)
    }
  }

  const setEnabled = async (p: Provider, enabled: boolean) => {
    setError('')
    try { await apiPatch(`/v1/admin/providers/${p.name}`, { enabled }); await load() }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }

  const [removing, setRemoving] = useState<Provider | null>(null)

  return (
    <div className={ui.page}>
      <div className="flex items-center gap-2">
        <h2 className={`${ui.h2} !mb-0`}>Providers</h2>
        <RefreshButton className="ml-auto" onRefresh={load} />
      </div>
      <p className="adm-dim">The model backends the gateway can reach (root-only). <code className={ui.codeChip}>Backend/config.json</code> holds the platform <strong>defaults</strong>; anything you add or change here is stored in the <strong>database</strong> (keys encrypted) and overrides the default of the same name — deleting an override reverts to the default. Applies to the running gateway immediately. API keys are write-only — never shown back.</p>

      <section className="gw-card">
        <div className="gw-card-title">Add provider</div>
        {/* autoComplete=off everywhere + new-password on the key: the password-type key field
            makes browsers treat this as a login form and autofill username/password into it */}
        <form className={ui.formCol} onSubmit={create} autoComplete="off">
          <div className="grid gap-2 md:grid-cols-2">
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Name (id used in model refs, e.g. <code className={ui.codeChip}>myprov/model</code>)<Req /></span>
              <input className="gw-input" placeholder="e.g. groq" value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} required pattern="[a-z0-9][a-z0-9_-]*" title="lowercase letters, digits, - and _" autoComplete="off" />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Kind</span>
              <select className="gw-input" value={kind} onChange={(e) => setKind(e.target.value)}>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
          </div>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>{endpointLabel(kind)}<Req /></span>
            <input className="gw-input" placeholder={endpointPlaceholder(kind)} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} spellCheck={false} required autoComplete="off" />
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>API key (optional)</span>
            <input className="gw-input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="new-password" />
          </label>
          <div><button className="gw-btn gw-btn-primary" disabled={busy || !name.trim() || !endpoint.trim()}>Add</button></div>
        </form>
        {error && !editing && <div className="gw-meta gw-error">{error}</div>}
      </section>

      <div className={ui.tableWrap}>
        <table className={ui.table} data-ui="providers-table">
          <colgroup>
            <col style={{ width: 130 }} />{/* Name */}
            <col style={{ width: 165 }} />{/* Kind */}
            <col />{/* Endpoint — flexible */}
            <col style={{ width: 90 }} />{/* Key */}
            <col style={{ width: 70 }} />{/* Active */}
            <col style={{ width: 285 }} />{/* Actions — Test/Edit/Disable/Delete on one line */}
          </colgroup>
          <thead><tr>
            <th className={ui.th}>Name</th><th className={ui.th}>Kind</th><th className={ui.th}>Endpoint</th>
            <th className={ui.th}>Key</th><th className={ui.th}>Active</th><th className={ui.th}></th>
          </tr></thead>
          <tbody>
            {providers.map((p, i) => {
              const last = i === providers.length - 1
              const dim = p.enabled ? '' : ui.cellDim // dim info cells only — buttons stay actionable
              return (
                <tr key={p.name}>
                  <td className={`${cell(last, true)} ${dim}`}>
                    {p.name}
                    <div className="adm-dim text-[11px]" title={
                      p.source === 'config' ? 'Platform default from Backend/config.json'
                      : p.source === 'override' ? 'Database settings overriding the config default — delete to revert'
                      : 'Configured in the database'
                    }>{p.source === 'config' ? 'default' : p.source === 'override' ? 'custom (over default)' : 'custom'}</div>
                  </td>
                  <td className={`${cell(last, true)} adm-dim ${dim}`} title={`${p.kind} · ${p.type}`}>{p.kind}{p.supported ? '' : ' ✗ unsupported'}</td>
                  <td className={`${cell(last, true)} adm-dim ${dim}`} title={p.endpoint}>{p.endpoint || '—'}</td>
                  <td className={`${cell(last, true)} ${dim}`}>{p.apiKeySet ? <code className={ui.codeChip}>…{p.apiKeyTail}</code> : '—'}</td>
                  <td className={`${cell(last, true)} ${dim}`}>{p.enabled ? '✓' : 'disabled'}</td>
                  <td className={cell(last)}>
                    <div className={ui.actions}>
                      <button className="gw-btn adm-btn-sm" title="Health check, list models, try a prompt" onClick={() => openTest(p)}>Test</button>
                      <button className="gw-btn adm-btn-sm" onClick={() => openEdit(p)}>Edit</button>
                      <button className={`gw-btn adm-btn-sm ${p.enabled ? 'adm-btn-warn' : 'adm-btn-ok'}`} onClick={() => setEnabled(p, !p.enabled)}>{p.enabled ? 'Disable' : 'Enable'}</button>
                      {p.source !== 'config' && (
                        <button className="gw-btn adm-btn-sm adm-btn-danger" title={p.source === 'override' ? 'Remove the custom settings and revert to the config default' : 'Delete this provider'} onClick={() => setRemoving(p)}>
                          {p.source === 'override' ? 'Revert' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {providers.length === 0 && <tr><td colSpan={6} className={ui.empty}>No providers</td></tr>}
          </tbody>
        </table>
      </div>

      {removing && (
        <ConfirmModal
          title={removing.source === 'override' ? `Revert '${removing.name}' to the config default` : `Delete provider '${removing.name}'`}
          message={removing.source === 'override'
            ? <span>Remove the custom settings for <b>{removing.name}</b> (including any stored API key) and fall back to the <code className={ui.codeChip}>config.json</code> default?</span>
            : <span>Delete provider <b>{removing.name}</b>? Its stored API key is removed and any model reference <code className={ui.codeChip}>{removing.name}/…</code> stops resolving. To pause it instead, use <b>Disable</b>.</span>}
          confirmLabel={removing.source === 'override' ? 'Revert' : 'Delete provider'}
          onConfirm={async () => { await apiDelete(`/v1/admin/providers/${removing.name}`); await load() }}
          onClose={() => setRemoving(null)}
        />
      )}

      {byok.length > 0 && (
        <section className="gw-card mt-5" data-ui="byok-oversight">
          <div className="gw-card-title">User BYOK providers (read-only)</div>
          <p className="adm-dim">Providers users brought themselves (Account → My model providers). Each exists only for its owner; a name matching a platform provider overrides it for that user's calls. Users manage these — disable the user to cut access.</p>
          <div className="flex flex-col gap-1.5">
            {byok.map((b) => (
              <div key={`${b.owner}/${b.name}`} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className={ui.badgeChat}>{b.owner}</span>
                <b>{b.name}</b>
                <span className="adm-dim">· {b.kind} · {b.endpoint}{b.apiKeySet ? ' · key set' : ''}{b.enabled ? '' : ' · disabled'}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {testing && (() => {
        const dot = tHealth == null ? 'bg-gray-300 animate-pulse'
          : tHealth.status === 'online' ? 'bg-emerald-500'
          : tHealth.status === 'degraded' ? 'bg-amber-500'
          : tHealth.status === 'unconfigured' ? 'bg-amber-500'
          : 'bg-red-500'
        const fmtMs = (ms: number) => (ms >= 1000 ? `${ms}ms (${(ms / 1000).toFixed(1)}s)` : `${ms}ms`)
        return (
          <div className={ui.modalOverlay} {...dismissOnBackdrop(() => setTesting(null))}>
            <div className={ui.modalCard} style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
              <div className={ui.modalHead}>
                <h3 className={ui.modalTitle}>Test provider — {testing.name}</h3>
                <button className="gw-btn adm-btn-sm" onClick={() => setTesting(null)}>✕</button>
              </div>

              {/* 1 · reachability */}
              <div className="flex items-center gap-2 text-[13px]">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${dot}`} />
                {tHealth == null
                  ? <span className="adm-dim">checking…</span>
                  : <span>{tHealth.status}{tHealth.detail ? <span className="adm-dim"> · {tHealth.detail}</span> : null}</span>}
                <span className="adm-dim ml-auto">{testing.endpoint}</span>
              </div>

              {/* 2 · pick a model */}
              <div className={ui.field}>
                <span className={ui.fieldLabel}>
                  Model {tModels.length ? <span className="adm-dim">({tModels.length} available)</span> : null}
                </span>
                {tModels.length > 0 ? (
                  <ModelCombo
                    items={tModels.map((m) => m.id)}
                    value={tModel}
                    onChange={setTModel}
                    showFullValue
                  />
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {/* no list (still loading, or this route has no /v1/models) — type the id */}
                    <input className="gw-input" placeholder="type a model id (e.g. mimo-v2.5)" value={tModel} onChange={(e) => setTModel(e.target.value)} spellCheck={false} autoComplete="off" />
                    {tModelsErr && <div className="adm-dim text-[12px]">{tModelsErr}</div>}
                  </div>
                )}
              </div>

              {/* 3 · prompt */}
              <label className={ui.field}>
                <span className={ui.fieldLabel}>Test prompt</span>
                <textarea className="gw-input" rows={2} value={tPrompt} onChange={(e) => setTPrompt(e.target.value)} />
              </label>
              <div>
                <button className="gw-btn gw-btn-primary" disabled={tSending || !tModel} onClick={runTest}>
                  {tSending ? 'Testing…' : 'Send test prompt'}
                </button>
              </div>

              {/* 4 · result */}
              {tErr && <div className="gw-meta gw-error">{tErr}</div>}
              {tResult && (
                <div className={ui.minted}>
                  <div className="gw-block-title">reply — {fmtMs(tResult.latencyMs)}{tResult.usage?.completionTokens != null ? ` · ${tResult.usage.promptTokens ?? '?'} in / ${tResult.usage.completionTokens} out tokens` : ''}</div>
                  <pre className="mt-1.5 whitespace-pre-wrap break-words text-[13px] bg-surface px-2.5 py-2 rounded-md border border-line max-h-48 overflow-auto">{tResult.reply || '(empty reply)'}</pre>
                  {tResult.reasoning && (
                    <details className="mt-1.5">
                      <summary className="adm-dim text-[12px] cursor-pointer">model thinking (hidden by default)</summary>
                      <pre className="mt-1 whitespace-pre-wrap break-words text-[12px] adm-dim max-h-32 overflow-auto">{tResult.reasoning}</pre>
                    </details>
                  )}
                </div>
              )}

              <div className={ui.modalActions}>
                <button className="gw-btn" onClick={() => setTesting(null)}>Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      {editing && (
        <div className={ui.modalOverlay} {...dismissOnBackdrop(() => setEditing(null))}>
          <div className={ui.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={ui.modalHead}>
              <h3 className={ui.modalTitle}>Edit provider — {editing.name}</h3>
              <button className="gw-btn adm-btn-sm" onClick={() => setEditing(null)}>✕</button>
            </div>

            <label className={ui.field}>
              <span className={ui.fieldLabel}>Kind</span>
              <select className="gw-input" value={dKind} onChange={(e) => setDKind(e.target.value)}>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>{endpointLabel(dKind)}<Req /></span>
              <input className="gw-input" placeholder={endpointPlaceholder(dKind)} value={dEndpoint} onChange={(e) => setDEndpoint(e.target.value)} spellCheck={false} autoComplete="off" />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>API key — {editing.apiKeySet ? <>currently set (<code className={ui.codeChip}>…{editing.apiKeyTail}</code>)</> : 'not set'}. Leave blank to keep.</span>
              <input className="gw-input" type="password" value={dApiKey} onChange={(e) => setDApiKey(e.target.value)} autoComplete="new-password" disabled={dClearKey} placeholder={dClearKey ? '(will be cleared)' : 'new key…'} />
            </label>
            {editing.apiKeySet && (
              <label className="gw-check">
                <input type="checkbox" checked={dClearKey} onChange={(e) => setDClearKey(e.target.checked)} />
                clear the stored key
              </label>
            )}

            {error && <div className="gw-meta gw-error">{error}</div>}
            <div className={ui.modalActions}>
              <button className="gw-btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="gw-btn gw-btn-primary" disabled={busy || !dEndpoint.trim()} onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
