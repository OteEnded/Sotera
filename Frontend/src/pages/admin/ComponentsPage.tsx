import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { apiDelete, apiGet, apiPost } from '../../lib/api'
import ConfirmModal from '../../components/ConfirmModal'
import RefreshButton from '../../components/RefreshButton'
import { cell, ui } from './ui'
import { dismissOnBackdrop } from '../../lib/overlay'

type DepFlag = { id: string; ok: boolean }
type ServiceFlag = { name: string; ok: boolean }
type ComponentProject = {
  id: string; name: string | null; version: string | null; type: string | null
  sdk: string | null; source: string | null; trust: 'first-party' | 'remote'
  permissions: string[]; integrity: string | null; components: string[]
  status: 'installed' | 'staged'; dirName?: string; installedAt?: string | null
  // completeness (installed projects only)
  contains?: { id: string; kind: string | null }[]
  services?: ServiceFlag[]
  requiresComponents?: DepFlag[]
  optionalComponents?: DepFlag[]
  complete?: boolean
}

type FeatureProtocol = {
  id: string; name: string; emits: string[]; snapshot: unknown
}

// Small status chip for the completeness card — theme tokens only (both themes).
const CHIP_TONE = {
  ok: 'border-[var(--ok-edge)] bg-[var(--ok-soft)] text-[var(--ok)]',
  bad: 'border-[var(--danger-edge)] bg-[var(--danger-soft)] text-[var(--danger)]',
  warn: 'border-[var(--warn-edge)] bg-[var(--warn-soft)] text-[var(--warn)]',
  mute: 'border-line text-muted',
} as const
function Chip({ tone, title, children }: { tone: keyof typeof CHIP_TONE; title?: string; children: ReactNode }) {
  return <span title={title} className={`inline-block rounded-full border px-1.5 py-px text-[10px] font-bold ${CHIP_TONE[tone]}`}>{children}</span>
}
function DepRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5">
      <span className="w-[74px] shrink-0 text-[11px] uppercase tracking-[0.04em] text-muted">{label}</span>
      <span className="flex flex-wrap gap-1">{children}</span>
    </div>
  )
}
// Does a project have anything to show in the completeness view?
const hasDeps = (p: ComponentProject) =>
  p.status === 'installed' && ((p.services?.length ?? 0) + (p.requiresComponents?.length ?? 0) + (p.optionalComponents?.length ?? 0)) > 0

// A Package is a DISTRIBUTION unit that bundles components, then vanishes at runtime — it is NOT
// a runtime component. Leaf components declare one of the 5 runtime KINDS as their passport `type`;
// a Package declares its SHAPE instead (today the only shape is 'capability'). So: type ∈ the 5
// runtime kinds ⇒ a leaf; anything else ⇒ a Package. This keeps the KIND column from reading
// "CAPABILITY" as if it were a peer of TOOL/SKILL when it's really a different layer (a bundle).
const RUNTIME_KINDS = new Set(['tool', 'feature', 'skill', 'memory', 'bodypart'])
const isPackage = (p: ComponentProject) => !!p.type && !RUNTIME_KINDS.has(p.type)

// Root-only inventory of the persona's component projects (the SDK's capability bricks) +
// staged remote installs. Deliberately read-mostly: components are CODE — installing from a
// URL stages it into the ComponentStore (download + sha256 verify + hardened unpack), and
// ADDING it to the persona stays a hand edit of persona.json. The permissions column is the
// point of manifest v2: root SEES what each project may touch before it ever runs.
export default function ComponentsPage() {
  const [items, setItems] = useState<ComponentProject[]>([])
  const [features, setFeatures] = useState<FeatureProtocol[]>([])
  const [storeDir, setStoreDir] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<ComponentProject | null>(null)

  const [installing, setInstalling] = useState(false)
  const [iUrl, setIUrl] = useState('')
  const [iHash, setIHash] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await apiGet('/v1/admin/components')
      setItems(res.components || [])
      setFeatures(res.features || [])
      setStoreDir(res.storeDir || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => { load() }, [load])

  const submitInstall = async () => {
    setError(''); setNotice(''); setBusy(true)
    try {
      const res = await apiPost('/v1/admin/components/install', { url: iUrl.trim(), integrity: iHash.trim() })
      setNotice(`${res.project.id}@${res.project.version} staged — ${res.project.note}`)
      setInstalling(false); setIUrl(''); setIHash('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!removing?.dirName) return
    setError('')
    try {
      await apiDelete(`/v1/admin/components/staged/${encodeURIComponent(removing.dirName)}`)
      setRemoving(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className={`${ui.page} components-page`}>
      <h2 className={ui.h2}>Components</h2>
      <p className="text-muted text-[13px] mt-0 mb-3">
        The persona's capability bricks (tools, memory, features, skills — <code className={ui.codeChip}>@ote/components-sdk</code> projects)
        and their <b>declared permissions</b>, enforced at runtime. <b>Install from URL</b> stages a remote project into the
        ComponentStore — download, <code className={ui.codeChip}>sha256</code> verify, hardened unpack — but running it still takes a
        deliberate <code className={ui.codeChip}>persona.json</code> edit (+ restart). Local (first-party) projects live in the
        PortableComponents monorepo, not here.
      </p>

      {error && <div className="text-danger text-[13px] mb-2 components-error">{error}</div>}
      {notice && <div className="text-[13px] mb-2 text-[var(--ok)] components-notice">{notice}</div>}

      <div className={ui.formRow}>
        <button className="gw-btn components-install" disabled={busy} onClick={() => setInstalling(true)}>Install from URL</button>
        <RefreshButton onRefresh={load} />
        {storeDir && <span className="adm-dim text-[12px] ml-auto" title="Where staged/remote component projects are installed">store: {storeDir}</span>}
      </div>

      <div className={ui.tableWrap}>
        <table className={`${ui.table} components-table`}>
          <colgroup>
            <col className="w-[190px]" /><col className="w-[76px]" /><col className="w-[60px]" /><col /><col className="w-[180px]" /><col className="w-[78px]" /><col className="w-[110px]" />
          </colgroup>
          <thead>
            <tr>
              <th className={ui.th}>Project</th>
              <th className={ui.th}>Kind</th>
              <th className={ui.th}>Version</th>
              <th className={ui.th}>Components</th>
              <th className={ui.th}>Permissions</th>
              <th className={ui.th}>Status</th>
              <th className={ui.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={7} className={ui.empty}>No components — the persona installs none (unexpected; check the server log).</td></tr>
            )}
            {items.map((p, i) => {
              const last = i === items.length - 1
              return (
                <tr key={`${p.id}@${p.version}·${p.status}`} className="components-row">
                  <td className={cell(last, true)} title={`${p.id}\nsource: ${p.source || '(inline)'}${p.integrity ? `\n${p.integrity}` : ''}\nsdk ${p.sdk || '?'}`}>
                    <strong>{p.name || p.id}</strong>
                    <span className={`ml-1.5 align-middle text-[10px] uppercase tracking-[0.04em] rounded-full px-1.5 py-px border ${p.trust === 'remote' ? 'border-[var(--warn-edge)] bg-[var(--warn-soft)] text-[var(--warn)]' : 'border-line text-muted'}`}
                      title={p.trust === 'remote' ? 'Remote source — strict permission enforcement (undeclared access is denied)' : 'First-party (local monorepo) — strict enforcement too; only services:* stays first-party-only'}>
                      {p.trust === 'remote' ? 'remote' : 'local'}
                    </span>
                  </td>
                  <td className={cell(last)} title={isPackage(p)
                    ? `Package — a distribution unit (shape "${p.type}"). It bundles the components listed at right, installs them, then disappears at runtime (never itself a runtime component).`
                    : "The component kind from the project's passport (component.json type)."}>
                    {isPackage(p)
                      ? (
                          <span className="components-kind inline-flex flex-col items-start gap-0.5 leading-tight">
                            <span className="inline-block rounded-full border border-[var(--think-edge)] bg-[var(--think-soft)] px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--think)]">Package</span>
                            <span className="pl-0.5 text-[10px] uppercase tracking-[0.04em] text-muted">{p.type}</span>
                          </span>
                        )
                      : <span className="components-kind inline-block rounded-full border border-line bg-panel px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.04em] text-muted">{p.type || '?'}</span>}
                  </td>
                  <td className={cell(last)}>{p.version || '—'}</td>
                  <td className={cell(last, true)} title={p.components.join(', ')}>{p.components.join(', ') || '—'}</td>
                  <td className={cell(last, true)} title={p.permissions.join(', ')}>
                    {p.permissions.length
                      ? p.permissions.map((s) => (
                          <span key={s} className="mr-1 inline-block rounded-full border border-[var(--think-edge)] bg-[var(--think-soft)] px-1.5 py-px text-[10px] font-bold text-[var(--think)]">{s}</span>
                        ))
                      : <span className="text-muted text-[12px]" title="Touches nothing beyond its own inputs (plus its required services, listed per component)">none</span>}
                  </td>
                  <td className={cell(last)}>{p.status}</td>
                  <td className={cell(last)}>
                    {p.status === 'staged'
                      ? <button className="gw-btn adm-btn-sm adm-btn-danger" onClick={() => setRemoving(p)}>Delete</button>
                      : <span className="text-muted text-[12px]">persona.json</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {items.some(hasDeps) && (
        <div className="components-completeness mt-5">
          <h3 className="m-0 mb-1 text-[15px] font-bold">Capability completeness</h3>
          <p className="text-muted text-[13px] mt-0 mb-2">
            What each capability is wired to: the <b>service contracts</b> its components consume, and its component
            <b> dependencies</b> — <span title="required — a missing one aborts the install">requires</span> (hard) and
            <span title="optional enhancement — the capability still works without it"> optional</span> (soft). All resolved at boot;
            a red mark, or a missing optional, is the thing to act on.
          </p>
          <div className="flex flex-col gap-2">
            {items.filter(hasDeps).map((p) => {
              const optMissing = (p.optionalComponents ?? []).some((d) => !d.ok)
              const pill: { tone: 'ok' | 'warn' | 'bad'; text: string } =
                p.complete === false ? { tone: 'bad', text: '✗ incomplete' }
                  : optMissing ? { tone: 'warn', text: '⚠ optional missing' }
                    : { tone: 'ok', text: '✓ complete' }
              return (
                <div key={p.id} className="components-cap rounded-[10px] border border-line bg-panel-strong px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <strong className="text-[13px]">{p.name || p.id}</strong>
                    <span className="components-kind inline-block rounded-full border border-line bg-panel px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.04em] text-muted">{p.type || '?'}</span>
                    <Chip tone={pill.tone}>{pill.text}</Chip>
                  </div>
                  {(p.contains?.length ?? 0) > 0 && (
                    <DepRow label="Components">
                      {p.contains!.map((c) => <Chip key={c.id} tone="mute" title={c.kind || undefined}>{c.id}{c.kind ? ` · ${c.kind}` : ''}</Chip>)}
                    </DepRow>
                  )}
                  {(p.services?.length ?? 0) > 0 && (
                    <DepRow label="Services">
                      {p.services!.map((s) => <Chip key={s.name} tone={s.ok ? 'ok' : 'bad'} title={s.ok ? 'provided by the host or another component' : 'NOT provided — this would fail at runtime'}>{s.name} {s.ok ? '✓' : '✗'}</Chip>)}
                    </DepRow>
                  )}
                  {(p.requiresComponents?.length ?? 0) > 0 && (
                    <DepRow label="Requires">
                      {p.requiresComponents!.map((d) => <Chip key={d.id} tone={d.ok ? 'ok' : 'bad'} title={d.ok ? 'installed' : 'MISSING — install the package that provides this component'}>{d.id} {d.ok ? '✓' : '✗'}</Chip>)}
                    </DepRow>
                  )}
                  {(p.optionalComponents?.length ?? 0) > 0 && (
                    <DepRow label="Optional">
                      {p.optionalComponents!.map((d) => <Chip key={d.id} tone={d.ok ? 'ok' : 'warn'} title={d.ok ? 'installed' : 'not installed — an optional enhancement is unavailable'}>{d.id} {d.ok ? '✓' : '— missing'}</Chip>)}
                    </DepRow>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {features.length > 0 && (
        <div className="components-features mt-5">
          <h3 className="m-0 mb-1 text-[15px] font-bold">Feature protocols</h3>
          <p className="text-muted text-[13px] mt-0 mb-2">
            A Feature is the <b>interaction layer</b>: it owns interaction state and exposes a protocol —
            a declared <b>event vocabulary</b> (<code className={ui.codeChip}>emits</code>) plus a live <b>state snapshot</b> —
            that any frontend renders. This card is one such renderer.
          </p>
          <div className="flex flex-col gap-2">
            {features.map((f) => (
              <div key={f.id} className="components-feature rounded-[10px] border border-line bg-panel-strong px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <strong className="text-[13px]">{f.name}</strong>
                  <span className="text-[12px] text-muted">{f.id}</span>
                  <span className="ml-2 flex flex-wrap gap-1">
                    {f.emits.length
                      ? f.emits.map((e) => (
                          <span key={e} className="inline-block rounded-full border border-[var(--info-edge)] bg-[var(--info-soft)] px-1.5 py-px text-[10px] font-bold text-[var(--info)]">{e}</span>
                        ))
                      : <span className="text-muted text-[12px]" title="No declared outbound events">no declared events</span>}
                  </span>
                </div>
                {f.snapshot != null && (
                  <pre className="mt-1.5 mb-0 max-h-44 overflow-auto rounded-[7px] border border-line bg-panel px-2 py-1.5 text-[11px] leading-[1.5]">{JSON.stringify(f.snapshot, null, 2)}</pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {installing && (
        <div className={ui.modalOverlay} {...dismissOnBackdrop(() => setInstalling(false))}>
          <div className={`${ui.modalCard} components-install-modal`} onClick={(e) => e.stopPropagation()}>
            <div className={ui.modalHead}>
              <h3 className={ui.modalTitle}>Install component from URL</h3>
              <button className="gw-btn adm-btn-sm" onClick={() => setInstalling(false)}>Close</button>
            </div>
            <p className="adm-dim m-0 text-[13px]">
              A zip of a component project (<code className={ui.codeChip}>component.json</code> + entry module). The
              <b> sha256 is required</b> — remote code is never installed on faith. Staging downloads, verifies and unpacks
              it into the store; to actually run it, add a <code className={ui.codeChip}>url:</code> entry to persona.json.
            </p>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Archive URL</span>
              <input className="gw-input" value={iUrl} onChange={(e) => setIUrl(e.target.value)} placeholder="https://…/my-component.zip" autoComplete="off" spellCheck={false} />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Expected sha256 (hex, 64 chars)</span>
              <input className="gw-input font-mono text-[13px]" value={iHash} onChange={(e) => setIHash(e.target.value)} placeholder="e.g. 9f2c…c41a" autoComplete="off" spellCheck={false} />
            </label>
            <div className={ui.modalActions}>
              <button className="gw-btn" disabled={busy} onClick={() => setInstalling(false)}>Cancel</button>
              <button className="gw-btn gw-btn-primary components-install-go" disabled={busy || !/^https?:\/\/.{4,}/.test(iUrl.trim()) || !/^(sha256[-=:])?[0-9a-fA-F]{64}$/.test(iHash.trim())}
                onClick={() => void submitInstall()}>{busy ? 'Installing…' : 'Verify + stage'}</button>
            </div>
          </div>
        </div>
      )}

      {removing && (
        <ConfirmModal
          title="Delete staged component"
          message={`Remove "${removing.id}@${removing.version}" from the ComponentStore? (It is not referenced by the persona.)`}
          confirmLabel="Delete"
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  )
}
