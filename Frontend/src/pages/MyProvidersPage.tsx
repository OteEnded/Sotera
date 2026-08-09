import { useCallback, useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api'
import ConfirmModal from '../components/ConfirmModal'
import ModelCombo from '../components/ModelCombo'
import RefreshButton from '../components/RefreshButton'
import Req from '../components/Req'
import { ui } from './admin/ui'
import { dismissOnBackdrop } from '../lib/overlay'

// BYOK — the user's own model providers (moved out of Account to its own page).
// Rows exist only for this user: same name as a platform provider = personal
// override (their key serves their calls), new name = personal provider.
// Root manages the GLOBAL providers on the Providers page instead (this page's
// endpoints 400 for root, and the nav hides it).

type MyProvider = {
  name: string; kind: string; endpoint: string
  apiKeySet: boolean; enabled: boolean; overridesGlobal: boolean
}

const KINDS = ['openai-compatible', 'anthropic', 'ollama']
const endpointHint = (kind: string) =>
  kind === 'ollama' ? 'http://127.0.0.1:11434' : kind === 'anthropic' ? 'https://…/anthropic (no /v1)' : 'https://…/v1'

export default function MyProvidersPage() {
  const [myProviders, setMyProviders] = useState<MyProvider[]>([])
  const [bpName, setBpName] = useState('')
  const [bpKind, setBpKind] = useState('openai-compatible')
  const [bpEndpoint, setBpEndpoint] = useState('')
  const [bpKey, setBpKey] = useState('')
  const [bpMsg, setBpMsg] = useState('')
  const [bpErr, setBpErr] = useState('')
  const [bpBusy, setBpBusy] = useState(false)
  const [bpEdit, setBpEdit] = useState<MyProvider | null>(null)
  const [beEndpoint, setBeEndpoint] = useState('')
  const [beKey, setBeKey] = useState('')
  const [beClearKey, setBeClearKey] = useState(false)
  const [bpRemoving, setBpRemoving] = useState<MyProvider | null>(null)

  // test modal: health + model pick + one prompt through the user's own key
  const [bpTesting, setBpTesting] = useState<MyProvider | null>(null)
  const [btHealth, setBtHealth] = useState<{ status: string; detail?: string } | null>(null)
  const [btModels, setBtModels] = useState<string[]>([])
  const [btModelsErr, setBtModelsErr] = useState('')
  const [btModel, setBtModel] = useState('')
  const [btPrompt, setBtPrompt] = useState('Reply with exactly: OK')
  const [btSending, setBtSending] = useState(false)
  const [btResult, setBtResult] = useState<{ reply: string; reasoning?: string | null; latencyMs: number } | null>(null)
  const [btErr, setBtErr] = useState('')

  const loadMyProviders = useCallback(() => {
    apiGet('/v1/me/providers').then((r) => setMyProviders(r.providers || [])).catch((e) => setBpErr(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => { loadMyProviders() }, [loadMyProviders])

  const addMyProvider = async (e: React.FormEvent) => {
    e.preventDefault()
    setBpMsg(''); setBpErr(''); setBpBusy(true)
    try {
      await apiPost('/v1/me/providers', {
        name: bpName.trim().toLowerCase(),
        kind: bpKind,
        endpoint: bpEndpoint.trim(),
        ...(bpKey ? { apiKey: bpKey } : {}),
      })
      setBpName(''); setBpEndpoint(''); setBpKey('')
      setBpMsg('Added — its models are now in your chat model picker.')
      loadMyProviders()
    } catch (e2) {
      setBpErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBpBusy(false)
    }
  }

  const saveMyProvider = async () => {
    if (!bpEdit) return
    setBpErr(''); setBpBusy(true)
    try {
      await apiPatch(`/v1/me/providers/${bpEdit.name}`, {
        ...(beEndpoint.trim() && beEndpoint.trim() !== bpEdit.endpoint ? { endpoint: beEndpoint.trim() } : {}),
        ...(beClearKey ? { apiKey: '' } : (beKey ? { apiKey: beKey } : {})),
      })
      setBpEdit(null); setBeKey(''); setBeClearKey(false)
      loadMyProviders()
    } catch (e2) {
      setBpErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBpBusy(false)
    }
  }

  const toggleMyProvider = async (p: MyProvider) => {
    setBpErr('')
    try { await apiPatch(`/v1/me/providers/${p.name}`, { enabled: !p.enabled }); loadMyProviders() }
    catch (e2) { setBpErr(e2 instanceof Error ? e2.message : String(e2)) }
  }

  const openBpTest = (p: MyProvider) => {
    setBpTesting(p); setBtHealth(null); setBtModels([]); setBtModelsErr(''); setBtModel(''); setBtPrompt('Reply with exactly: OK'); setBtResult(null); setBtErr(''); setBtSending(false)
    apiGet(`/v1/me/providers/${p.name}/health`).then((r) => setBtHealth(r.health)).catch(() => setBtHealth({ status: 'offline' }))
    apiGet(`/v1/me/providers/${p.name}/models`)
      .then((r) => {
        const ids = (r.models || []).map((m: { id: string }) => m.id)
        setBtModels(ids)
        if (ids[0]) setBtModel(ids[0])
      })
      .catch((e) => setBtModelsErr(e instanceof Error ? e.message : String(e)))
  }
  const runBpTest = async () => {
    if (!bpTesting || !btModel.trim()) return
    setBtSending(true); setBtErr(''); setBtResult(null)
    try {
      setBtResult(await apiPost(`/v1/me/providers/${bpTesting.name}/test`, { model: btModel.trim(), prompt: btPrompt.trim() || undefined }))
    } catch (e) {
      setBtErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBtSending(false)
    }
  }

  return (
    <div className={`${ui.page} flex flex-col gap-5`}>
      <div>
        <div className="flex items-center gap-2">
          <h2 className={`${ui.h2} !mb-0`}>My Providers — BYOK</h2>
          <RefreshButton className="ml-auto" onRefresh={loadMyProviders} />
        </div>
        <p className="adm-dim">
          <b>BYOK — bring your own key</b>: providers you add here exist only for <b>you</b> — their models appear in your chat
          model picker and your calls use <b>your</b> key. Using the same name as a platform provider
          (e.g. <code className={ui.codeChip}>openrouter</code>) routes your calls through your key instead of the platform's.
          Keys are stored encrypted and never shown again.
        </p>
      </div>

      <section className="gw-card" data-ui="byok-card">
        <div className="gw-card-title">Your providers</div>
        {myProviders.length === 0 && <div className="adm-dim mb-3">None yet — add one below.</div>}
        {myProviders.length > 0 && (
          <div className="flex flex-col gap-2 mb-3">
            {myProviders.map((p) => (
              <div key={p.name} className="flex flex-wrap items-center gap-2 border border-line rounded-lg px-3 py-2">
                <span className={!p.enabled ? 'opacity-50' : ''}>
                  <b>{p.name}</b> <span className="adm-dim">· {p.kind} · {p.endpoint}</span>
                  {p.apiKeySet && <span className="adm-dim"> · key set</span>}
                </span>
                {p.overridesGlobal && <span className={ui.badgeChat} title="Same name as a platform provider — your calls use YOUR configuration">overrides platform</span>}
                {!p.enabled && <span className="adm-dim">(disabled)</span>}
                <span className="flex gap-2 ml-auto">
                  <button className="gw-btn adm-btn-sm" title="Health check, list models, try a prompt through YOUR key" onClick={() => openBpTest(p)}>Test</button>
                  <button className="gw-btn adm-btn-sm" onClick={() => { setBpEdit(p); setBeEndpoint(p.endpoint); setBeKey(''); setBeClearKey(false) }}>Edit</button>
                  <button className={`gw-btn adm-btn-sm ${p.enabled ? 'adm-btn-warn' : 'adm-btn-ok'}`} onClick={() => toggleMyProvider(p)}>{p.enabled ? 'Disable' : 'Enable'}</button>
                  <button className="gw-btn adm-btn-sm adm-btn-danger" onClick={() => setBpRemoving(p)}>Remove</button>
                </span>
              </div>
            ))}
          </div>
        )}

        <form className="flex flex-wrap items-end gap-3" onSubmit={addMyProvider}>
          <label className={ui.field} style={{ maxWidth: 160 }}>
            <span className={ui.fieldLabel}>Name<Req /></span>
            <input className="gw-input" value={bpName} onChange={(e) => setBpName(e.target.value)} autoComplete="off" spellCheck={false} placeholder="e.g. openrouter" />
          </label>
          <label className={ui.field} style={{ maxWidth: 190 }}>
            <span className={ui.fieldLabel}>Kind</span>
            <select className="gw-input" value={bpKind} onChange={(e) => setBpKind(e.target.value)}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label className={ui.field} style={{ minWidth: 220, flex: 1 }}>
            <span className={ui.fieldLabel}>Endpoint<Req /></span>
            <input className="gw-input" value={bpEndpoint} onChange={(e) => setBpEndpoint(e.target.value)} autoComplete="off" spellCheck={false} placeholder={endpointHint(bpKind)} />
          </label>
          <label className={ui.field} style={{ minWidth: 180, flex: 1 }}>
            <span className={ui.fieldLabel}>API key (optional)</span>
            <input className="gw-input" type="password" value={bpKey} onChange={(e) => setBpKey(e.target.value)} autoComplete="new-password" placeholder="sk-…" />
          </label>
          <button className="gw-btn gw-btn-primary mb-0.5" disabled={bpBusy || !bpName.trim() || !bpEndpoint.trim()}>Add provider</button>
        </form>
        {bpMsg && <div className="gw-meta gw-ok mt-2">{bpMsg}</div>}
        {bpErr && <div className="gw-meta gw-error mt-2">{bpErr}</div>}
      </section>

      {bpTesting && (
        <div className={ui.modalOverlay} {...dismissOnBackdrop(() => setBpTesting(null))}>
          <div className={ui.modalCard} style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className={ui.modalHead}>
              <h3 className={ui.modalTitle}>Test — {bpTesting.name} <span className="adm-dim text-[12px] font-normal">(your key)</span></h3>
              <button className="gw-btn adm-btn-sm" onClick={() => setBpTesting(null)}>✕</button>
            </div>
            <div className="flex items-center gap-2 text-[13px]">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${btHealth == null ? 'bg-gray-300 animate-pulse' : btHealth.status === 'online' ? 'bg-emerald-500' : btHealth.status === 'degraded' || btHealth.status === 'unconfigured' ? 'bg-amber-500' : 'bg-red-500'}`} />
              <span>{btHealth ? `${btHealth.status}${btHealth.detail ? ` · ${btHealth.detail}` : ''}` : 'checking reachability…'}</span>
            </div>
            <div className={ui.field}>
              <span className={ui.fieldLabel}>Model</span>
              {btModels.length > 0 ? (
                <ModelCombo items={btModels} value={btModel} onChange={setBtModel} showFullValue />
              ) : (
                <>
                  <input className="gw-input" value={btModel} onChange={(e) => setBtModel(e.target.value)} placeholder="model id (this endpoint doesn't list models)" autoComplete="off" spellCheck={false} />
                  {btModelsErr && <span className="adm-dim text-[12px]">Couldn't list models: {btModelsErr}</span>}
                </>
              )}
            </div>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Test prompt</span>
              <textarea className="gw-input" rows={2} value={btPrompt} onChange={(e) => setBtPrompt(e.target.value)} />
            </label>
            <div>
              <button className="gw-btn gw-btn-primary" disabled={btSending || !btModel.trim()} onClick={() => void runBpTest()}>{btSending ? 'Testing…' : 'Send test prompt'}</button>
            </div>
            {btErr && <div className="gw-meta gw-error">{btErr}</div>}
            {btResult && (
              <div className={ui.minted}>
                <div className="gw-block-title">reply — {btResult.latencyMs >= 1000 ? `${(btResult.latencyMs / 1000).toFixed(1)}s` : `${btResult.latencyMs}ms`}</div>
                <pre className="mt-1.5 whitespace-pre-wrap break-words text-[13px] bg-surface px-2.5 py-2 rounded-md border border-line max-h-48 overflow-auto">{btResult.reply || '(empty reply)'}</pre>
                {btResult.reasoning && (
                  <details className="mt-1.5">
                    <summary className="adm-dim text-[12px] cursor-pointer">model thinking</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words text-[12px] adm-dim max-h-32 overflow-auto">{btResult.reasoning}</pre>
                  </details>
                )}
              </div>
            )}
            <div className={ui.modalActions}>
              <button className="gw-btn" onClick={() => setBpTesting(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {bpEdit && (
        <div className={ui.modalOverlay} {...dismissOnBackdrop(() => setBpEdit(null))}>
          <div className={ui.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={ui.modalHead}>
              <h3 className={ui.modalTitle}>Edit '{bpEdit.name}'</h3>
              <button className="gw-btn adm-btn-sm" onClick={() => setBpEdit(null)}>✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <label className={ui.field}>
                <span className={ui.fieldLabel}>Endpoint<Req /></span>
                <input className="gw-input" value={beEndpoint} onChange={(e) => setBeEndpoint(e.target.value)} autoComplete="off" spellCheck={false} placeholder={endpointHint(bpEdit.kind)} />
              </label>
              <label className={ui.field}>
                <span className={ui.fieldLabel}>API key — leave blank to keep the stored one</span>
                <input className="gw-input" type="password" value={beKey} onChange={(e) => setBeKey(e.target.value)} autoComplete="new-password" disabled={beClearKey} placeholder={bpEdit.apiKeySet ? '(unchanged)' : 'sk-…'} />
              </label>
              <label className="gw-check">
                <input type="checkbox" checked={beClearKey} onChange={(e) => setBeClearKey(e.target.checked)} />
                <span>Clear the stored key</span>
              </label>
            </div>
            <div className={ui.modalActions}>
              <button className="gw-btn" onClick={() => setBpEdit(null)}>Cancel</button>
              <button className="gw-btn gw-btn-primary" disabled={bpBusy} onClick={saveMyProvider}>Save</button>
            </div>
          </div>
        </div>
      )}

      {bpRemoving && (
        <ConfirmModal
          title={`Remove your provider '${bpRemoving.name}'`}
          message={
            <span>
              Remove <b>{bpRemoving.name}</b>? Its stored key is deleted and its models leave your chat picker.
              {bpRemoving.overridesGlobal ? <> Your calls fall back to the platform's own configuration.</> : null}
            </span>
          }
          confirmLabel="Remove"
          onConfirm={async () => { await apiDelete(`/v1/me/providers/${bpRemoving.name}`); loadMyProviders() }}
          onClose={() => setBpRemoving(null)}
        />
      )}
    </div>
  )
}
