import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { prepareImage } from '../../lib/image'
import RefreshButton from '../../components/RefreshButton'
import { ui } from './ui'
import { dismissOnBackdrop } from '../../lib/overlay'

type Provider = { name: string; kind: string; enabled: boolean; endpoint: string; source: string }
type Model = {
  id: string; label: string; capabilities: string[]; inferred: boolean
  tested: Record<string, string> | null // capability -> confirmed|failed (probe results)
  testedAt: string | null
  contextLength: number | null; family: string | null; parameterSize: string | null; quantization: string | null
  effectiveContext?: number | null // the window we actually request (Ollama num_ctx, capped/clamped)
  optimizedContext?: number | null // measured VRAM-fit maximum (null = not calibrated)
  appliedContext?: number | null // the RECOMMENDED cap = optimum × providers.ollamaCtxOptimalPct
  manualContext?: number | null // root's hand-set cap for this model (null = follow the recommendation)
  calibratedAt?: string | null
  ctxFitsFull?: boolean | null // true = the full trained window fits in VRAM
  goodFor: string
  blocked?: boolean // root's blocklist — hidden from every picker/API, refused at the runtime
}
type Section = { loading: boolean; error: string; models: Model[] | null; autoCtx?: boolean; autoCtxPct?: number | null }
type ModelBlock = { id: string; provider: string; model: string; reason: string | null; createdAt: string }

// capability badge palette — declared caps solid, name-inferred ones get a dashed border
const CAP_STYLE: Record<string, string> = {
  chat: 'bg-[var(--code-bg)] text-ink/80 border-line',
  vision: 'bg-sky-100 text-sky-700 border-sky-200',
  thinking: 'bg-violet-100 text-violet-700 border-violet-200',
  tools: 'bg-amber-100 text-amber-800 border-amber-200',
  embeddings: 'bg-teal-100 text-teal-700 border-teal-200',
  code: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ocr: 'bg-rose-100 text-rose-700 border-rose-200',
  audio: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  translation: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'media-gen': 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  reranker: 'bg-slate-200 text-slate-700 border-slate-300',
  speech: 'bg-indigo-100 text-indigo-700 border-indigo-200',
}
const MAX_ROWS = 150 // openrouter-sized lists — render a slice, ask for a narrower filter

// "Nk"/"NM" only for exact binary multiples; anything else prints in full. Ollama honours any integer
// num_ctx precisely (measured: 100,001 in → 100,001 reported), so root may set a value like 100,000 —
// and `Math.round(n / 1024)` would render that as "98k", a number nobody chose. Every value in play
// today is 1024-aligned by construction, so this is a no-op now and honest the moment it is not.
const fmtCtx = (n: number | null) =>
  n == null ? '—'
    : n % 1_048_576 === 0 ? `${n / 1_048_576}M`
      : n % 1024 === 0 ? `${n / 1024}k`
        : n.toLocaleString()

export default function ModelsPage() {
  const { can } = useAuth()
  const isRoot = can('system_config')
  const [providers, setProviders] = useState<Provider[]>([])
  const [sections, setSections] = useState<Record<string, Section>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')
  // Manual per-model context cap editor (root). A modal rather than an inline expand — an inline editor
  // reflows the whole table, and Ote asked for modals over expands for exactly that reason.
  const [ctxEdit, setCtxEdit] = useState<{ provider: string; model: Model; value: string; busy?: boolean; err?: string } | null>(null)
  const [blocks, setBlocks] = useState<ModelBlock[]>([]) // root's blocklist (badge + Unblock id)
  const [loadingAll, setLoadingAll] = useState(false)

  // per-model test modal
  const [testing, setTesting] = useState<{ provider: string; model: Model } | null>(null)
  const [tPrompt, setTPrompt] = useState('Reply with exactly: OK')
  const [tSending, setTSending] = useState(false)
  const [tResult, setTResult] = useState<{ reply: string; reasoning?: string | null; latencyMs: number; usage?: { promptTokens?: number | null; completionTokens?: number | null } | null } | null>(null)
  const [tErr, setTErr] = useState('')
  const [tImage, setTImage] = useState<string | null>(null) // one attached image (vision testing)
  const tFileRef = useRef<HTMLInputElement | null>(null)
  const [verifying, setVerifying] = useState<Record<string, boolean>>({}) // 'provider/model' -> probing?

  // reloads the provider list + clears any expanded model sections (they lazy-load on click)
  const loadProviders = useCallback(async () => {
    try {
      const r = await apiGet('/v1/admin/providers')
      setProviders(r.providers)
      setSections({})
      apiGet('/v1/admin/models/blocks')
        .then((b) => setBlocks(b.blocks || []))
        .catch(() => setBlocks([])) // list is admin-visible; badge-only elsewhere
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])
  useEffect(() => { void loadProviders() }, [loadProviders])

  // enabled providers first — the disabled tail is rarely what you came for
  const sortedProviders = useMemo(
    () => [...providers].sort((a, b) => Number(b.enabled) - Number(a.enabled)),
    [providers],
  )

  const loadSection = (name: string) => {
    setSections((s) => ({ ...s, [name]: { loading: true, error: '', models: null } }))
    return apiGet(`/v1/admin/models?provider=${encodeURIComponent(name)}`)
      .then((r) => setSections((s) => ({ ...s, [name]: { loading: false, error: '', models: r.models, autoCtx: r.autoCtx, autoCtxPct: r.autoCtxPct } })))
      .catch((err) => setSections((s) => ({ ...s, [name]: { loading: false, error: err instanceof Error ? err.message : String(err), models: null } })))
  }

  const toggle = (name: string) => {
    const next = !open[name]
    setOpen((o) => ({ ...o, [name]: next }))
    if (next && !sections[name]) void loadSection(name)
  }

  // fetch every ENABLED provider's models in parallel (disabled ones usually can't list)
  const loadAll = async () => {
    setLoadingAll(true)
    try {
      await Promise.all(providers.filter((p) => p.enabled).map((p) => loadSection(p.name)))
    } finally {
      setLoadingAll(false)
    }
  }

  const blockOf = (provider: string, modelId: string) =>
    blocks.find((b) => b.provider === provider && b.model === modelId)
  const blockModel = async (provider: string, modelId: string) => {
    setError('')
    try {
      await apiPost('/v1/admin/models/blocks', { provider, model: modelId })
      setBlocks((await apiGet('/v1/admin/models/blocks')).blocks || [])
      void loadSection(provider)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  const unblockModel = async (provider: string, modelId: string) => {
    const b = blockOf(provider, modelId)
    if (!b) return
    setError('')
    try {
      await apiDelete(`/v1/admin/models/blocks/${b.id}`)
      setBlocks((prev) => prev.filter((x) => x.id !== b.id))
      void loadSection(provider)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const openTest = (provider: string, model: Model) => {
    setTesting({ provider, model })
    setTPrompt('Reply with exactly: OK'); setTResult(null); setTErr(''); setTSending(false); setTImage(null)
  }
  const runTest = async () => {
    if (!testing) return
    setTSending(true); setTErr(''); setTResult(null)
    try {
      setTResult(await apiPost(`/v1/admin/providers/${testing.provider}/test`, {
        model: testing.model.id,
        prompt: tPrompt.trim() || undefined,
        ...(tImage ? { images: [tImage] } : {}),
      }))
    } catch (err) {
      setTErr(err instanceof Error ? err.message : String(err))
    } finally {
      setTSending(false)
    }
  }

  const verify = async (provider: string, model: Model) => {
    const key = `${provider}/${model.id}`
    setVerifying((v) => ({ ...v, [key]: true }))
    setError('')
    try {
      await apiPost('/v1/admin/models/verify', { provider, model: model.id })
      loadSection(provider) // reload with the probe results merged in
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setVerifying((v) => ({ ...v, [key]: false }))
    }
  }

  // ---- Ollama context calibration (one at a time server-side; poll while running) ----
  // Measures the largest num_ctx that still fits fully in VRAM — the cap the
  // auto-optimize lever (System → Chat defaults) enforces on every request.
  const [calib, setCalib] = useState<{ provider: string; running: boolean; line: string } | null>(null)
  const calibTimer = useRef<number | null>(null)
  useEffect(() => () => { if (calibTimer.current) window.clearTimeout(calibTimer.current) }, [])

  const pollCalibration = async (provider: string) => {
    try {
      const s = await apiGet('/v1/admin/models/calibrate-ctx')
      if (s.running) {
        setCalib({ provider, running: true, line: `${s.total > 1 ? `${s.index + 1}/${s.total} ` : ''}${s.model} — ${s.phase || 'running…'}` })
        calibTimer.current = window.setTimeout(() => void pollCalibration(provider), 2500)
      } else {
        const one = (r: { model?: string; error?: string; ctx?: number; fitsFull?: boolean }) =>
          r.error ? `${r.model} ✗ ${r.error}` : `${r.model} → ${fmtCtx(r.ctx ?? null)}${r.fitsFull ? ' (full window fits)' : ''}`
        setCalib({
          provider, running: false,
          line: s.total > 1 && Array.isArray(s.results)
            ? s.results.map(one).join(' · ')
            : s.error
              ? `${s.model} — failed: ${s.error}`
              : s.result
                ? `${s.model} — optimum ${fmtCtx(s.result.ctx)}${s.result.fitsFull ? ' (full trained window fits in VRAM)' : ''} · ${s.result.vramGB} GB VRAM · ${s.result.loads} load(s)`
                : `${s.model} — done`,
        })
        void loadSection(provider) // pull the fresh optimizedContext/effectiveContext in
      }
    } catch (err) {
      setCalib((c) => (c ? { ...c, running: false, line: err instanceof Error ? err.message : String(err) } : null))
    }
  }

  // Save (or clear, with ctx=null) root's manual cap for one model, then reload the section so the Ctx
  // column shows the newly RESOLVED window rather than what we hoped it would be.
  const saveManualCtx = async (ctx: number | null) => {
    if (!ctxEdit) return
    setCtxEdit({ ...ctxEdit, busy: true, err: '' })
    try {
      await apiPut('/v1/admin/models/ctx-manual', { provider: ctxEdit.provider, model: ctxEdit.model.id, ctx })
      await loadSection(ctxEdit.provider)
      setCtxEdit(null)
    } catch (err) {
      setCtxEdit((c) => (c ? { ...c, busy: false, err: err instanceof Error ? err.message : String(err) } : null))
    }
  }

  const calibrate = async (provider: string, model?: Model) => {
    setError('')
    try {
      await apiPost('/v1/admin/models/calibrate-ctx', model ? { provider, model: model.id } : { provider, all: true })
      setCalib({ provider, running: true, line: `${model ? model.id : 'every chat model'} — starting…` })
      void pollCalibration(provider)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // ---- batch verify: probe every chat model of a provider, streaming progress ----
  const [batch, setBatch] = useState<Record<string, { running: boolean; line: string }>>({})
  const batchCtrls = useRef<Record<string, AbortController>>({})
  const setBatchLine = (provider: string, running: boolean, line: string) =>
    setBatch((b) => ({ ...b, [provider]: { running, line } }))

  const verifyAll = async (provider: string) => {
    const ctrl = new AbortController()
    batchCtrls.current[provider] = ctrl
    setBatchLine(provider, true, 'starting…')
    try {
      const res = await fetch('/v1/admin/models/verify-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error?.message || `HTTP ${res.status}`)
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx); buf = buf.slice(idx + 2)
          const type = block.split('\n').find((l) => l.startsWith('event: '))?.slice(7).trim()
          const dataRaw = block.split('\n').find((l) => l.startsWith('data: '))?.slice(6)
          if (!type || !dataRaw) continue
          // Every field the capability-probe stream can carry, across all five event types. Optional because
          // which ones are present depends on `type`; `n` renders a possibly-absent index as 1-based without
          // printing "NaN" when the server omits it.
          let data: {
            total?: number; index?: number; model?: string; capability?: string
            message?: string; aborted?: boolean; skipped?: unknown[]
          }
          try { data = JSON.parse(dataRaw) } catch { continue }
          const n = typeof data.index === 'number' ? data.index + 1 : '?'
          if (type === 'start') setBatchLine(provider, true, `0/${data.total} — starting${data.skipped?.length ? ` (${data.skipped.length} specialist model(s) skipped)` : ''}`)
          else if (type === 'probe') setBatchLine(provider, true, `${n}/${data.total} ${data.model} — probing ${data.capability}…`)
          else if (type === 'model_done') setBatchLine(provider, true, `${n}/${data.total} ${data.model} — done`)
          else if (type === 'model_error') setBatchLine(provider, true, `${n}/${data.total} ${data.model} — failed: ${data.message}`)
          else if (type === 'done') setBatchLine(provider, false, data.aborted ? 'stopped' : `finished — ${data.total} model(s) probed${data.skipped?.length ? `, ${data.skipped.length} specialist skipped` : ''}`)
        }
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError'
      setBatchLine(provider, false, aborted ? 'stopped' : (err instanceof Error ? err.message : String(err)))
    } finally {
      delete batchCtrls.current[provider]
      setBatch((b) => ({ ...b, [provider]: { running: false, line: b[provider]?.line || 'finished' } }))
      loadSection(provider) // pull in the fresh ✓ badges
    }
  }

  const q = filter.trim().toLowerCase()

  return (
    <div className={`${ui.page} flex flex-col gap-4`}>
      <div>
        <div className="flex items-center gap-2">
          <h2 className={`${ui.h2} !mb-0`}>Models</h2>
          <RefreshButton className="ml-auto" onRefresh={loadProviders} />
        </div>
        <p className="adm-dim">Every model each provider can serve, with capabilities and what it's good for. Solid badges are <strong>declared by the provider</strong> (Ollama, OpenRouter-style metadata); dashed ones are <strong>inferred from the model name</strong> — most vendors' lists carry no metadata. Test runs one real prompt through the gateway.</p>
      </div>

      <div className="flex items-center gap-2">
        <input className="gw-input max-w-[420px] flex-1" placeholder="filter models across providers… (e.g. vision, gemma, embed)" value={filter} onChange={(e) => setFilter(e.target.value)} spellCheck={false} autoComplete="off" />
        <button
          className="gw-btn adm-btn-sm"
          title="Fetch the model list of every ENABLED provider (disabled ones usually can't list)"
          disabled={loadingAll || providers.length === 0}
          onClick={() => void loadAll()}
        >{loadingAll ? 'Loading…' : 'Load all'}</button>
      </div>
      {error && <div className="gw-meta gw-error">{error}</div>}

      {sortedProviders.map((p) => {
        const sec = sections[p.name]
        const models = sec?.models || []
        const matches = q ? models.filter((m) => m.id.toLowerCase().includes(q) || m.capabilities.some((c) => c.includes(q))) : models
        const shown = matches.slice(0, MAX_ROWS)
        return (
          <section key={p.name} className="gw-card !py-3">
            <button className="tap-row flex items-center gap-2 w-full text-left" onClick={() => toggle(p.name)}>
              <span className="text-[13px] font-semibold">{open[p.name] ? '▾' : '▸'} {p.name}</span>
              <span className="adm-dim text-[12px]">{p.kind}{p.enabled ? '' : ' · disabled'}</span>
              <span className="adm-dim text-[12px] ml-auto">
                {sec?.loading ? 'loading…' : sec?.models ? `${matches.length}${q ? ` of ${models.length}` : ''} models` : 'click to load'}
              </span>
            </button>

            {open[p.name] && (
              <div className="mt-2">
                {sec?.models && (
                  <div className="flex items-center gap-2 mb-2">
                    {batch[p.name]?.running ? (
                      <button className="gw-btn adm-btn-sm adm-btn-danger" onClick={() => batchCtrls.current[p.name]?.abort()}>Stop</button>
                    ) : (
                      <button
                        className="gw-btn adm-btn-sm"
                        title="Probe every chat model of this provider (chat/vision/tools/thinking — sequential, can take a while on local models)"
                        onClick={() => void verifyAll(p.name)}
                      >Verify all</button>
                    )}
                    {isRoot && p.kind === 'ollama' && (
                      <button
                        className="gw-btn adm-btn-sm"
                        data-ui="calibrate-all"
                        title="Measure every chat model's context optimum (sequential, one model at a time — a few minutes total). Re-run after a hardware change: new VRAM = new optima."
                        disabled={Boolean(calib?.running)}
                        onClick={() => void calibrate(p.name)}
                      >📐 Calibrate all ctx</button>
                    )}
                    {batch[p.name]?.line && <span className={`text-[12px] ${batch[p.name].running ? 'text-ink/70' : 'adm-dim'}`}>{batch[p.name].line}</span>}
                    {calib?.provider === p.name && calib.line && (
                      <span className={`text-[12px] ${calib.running ? 'text-ink/70' : 'adm-dim'}`} data-ui="calib-line">📐 {calib.line}</span>
                    )}
                  </div>
                )}
                {sec?.error && <div className="gw-meta gw-error">Couldn't list models: {sec.error}</div>}
                {sec?.models && matches.length === 0 && <div className="adm-dim py-2">No models{q ? ' match the filter' : ''}.</div>}
                {shown.length > 0 && (
                  <table className="w-full table-fixed border-collapse text-[13px]">
                    <colgroup>
                      <col />{/* model + goodFor — flexible */}
                      <col style={{ width: 236 }} />{/* capabilities */}
                      <col style={{ width: 84 }} />{/* context */}
                      <col style={{ width: 110 }} />{/* size */}
                      <col style={{ width: 235 }} />{/* test + verify + calibrate + block */}
                    </colgroup>
                    <thead><tr>
                      <th className={ui.th}>Model</th><th className={ui.th}>Capabilities</th><th className={ui.th}>Ctx</th><th className={ui.th}>Size</th><th className={ui.th}></th>
                    </tr></thead>
                    <tbody>
                      {shown.map((m, i) => {
                        const last = i === shown.length - 1
                        const border = last ? '' : ui.tdBorder
                        const chatless = !m.capabilities.includes('chat')
                        // A blocked model reads as "parked": dim its INFO cells, but keep the
                        // ACTIONS crisp. CSS opacity on the <tr> composites the whole row and
                        // force-dims the Unblock button — a blocked row's own escape hatch —
                        // and a child can't undo a parent's opacity. So dim per info-cell and
                        // leave the actions column at full strength.
                        const dimInfo = m.blocked ? 'opacity-60' : ''
                        return (
                          <tr key={m.id}>
                            <td className={`${ui.td} ${border} ${dimInfo}`}>
                              <div className="truncate" title={m.id}>
                                {m.id}
                                {m.blocked && (
                                  <span className="ml-1.5 inline-block rounded-full border border-red-300 bg-red-100 px-1.5 py-px text-[10px] font-semibold text-red-700 align-middle"
                                    title={`Blocked${blockOf(p.name, m.id)?.reason ? ` — ${blockOf(p.name, m.id)?.reason}` : ''} — hidden from every picker and refused by the gateway`}>blocked</span>
                                )}
                              </div>
                              <div className="adm-dim text-[11px] truncate" title={m.goodFor}>{m.goodFor}</div>
                            </td>
                            <td className={`${ui.td} ${border} ${dimInfo}`}>
                              <div className="flex flex-wrap gap-1" title={
                                m.tested
                                  ? `Probe-tested ${m.testedAt ? new Date(m.testedAt).toLocaleString() : ''}: ${Object.entries(m.tested).map(([c, s]) => `${c} ${s}`).join(', ')}`
                                  : m.inferred ? 'Inferred from the model name — the provider declares no metadata' : 'Declared by the provider'
                              }>
                                {m.capabilities.map((c) => {
                                  const proven = m.tested?.[c] === 'confirmed'
                                  return (
                                    <span key={c} className={`inline-block rounded-full border px-1.5 py-px text-[10px] font-medium ${CAP_STYLE[c] || 'bg-[var(--code-bg)] border-line'} ${!proven && m.inferred ? 'border-dashed opacity-80' : ''}`}>
                                      {c}{proven ? ' ✓' : m.inferred ? '?' : ''}
                                    </span>
                                  )
                                })}
                              </div>
                            </td>
                            <td className={`${ui.td} ${border} adm-dim ${dimInfo}`}
                              title={m.effectiveContext
                                ? `Running at ${m.effectiveContext.toLocaleString()} tokens (providers.ollamaNumCtxLimit, clamped to the model's trained max${m.contextLength ? ` of ${m.contextLength.toLocaleString()}` : ''}) — beyond that the provider truncates silently${m.optimizedContext != null
                                  ? `\nCalibrated${m.calibratedAt ? ` ${new Date(m.calibratedAt).toLocaleString()}` : ''}: largest window that fits fully in VRAM = ${m.optimizedContext.toLocaleString()}${m.ctxFitsFull ? ' (the full trained window fits)' : ''}${sec?.autoCtx
                                    ? ` — auto-optimize caps requests at ${sec?.autoCtxPct != null && sec.autoCtxPct < 100 && m.appliedContext != null && m.appliedContext !== m.optimizedContext ? `${sec.autoCtxPct}% of that = ${m.appliedContext.toLocaleString()}` : 'that'}`
                                    : ' — auto-optimize is OFF, cap not applied'}`
                                  : ''}`
                                : (m.contextLength ? `${m.contextLength.toLocaleString()} tokens (trained)` : undefined)}>
                              {(() => {
                                const body = m.effectiveContext
                                  ? <span><b className="text-ink">{fmtCtx(m.effectiveContext)}</b>{m.contextLength ? <span> / {fmtCtx(m.contextLength)}</span> : null}{m.optimizedContext != null && <span className={sec?.autoCtx ? '' : 'opacity-40'}>⚡</span>}{m.manualContext != null && <span title="Manual cap set by root — overrides the calibrated recommendation"> ✎</span>}</span>
                                  : <span>{fmtCtx(m.contextLength)}</span>
                                // Root sets a per-model cap by clicking the value. Ollama-kind only —
                                // remote providers manage their own windows and have nothing to cap.
                                return (isRoot && p.kind === 'ollama' && !chatless)
                                  ? (
                                    <button
                                      type="button"
                                      data-ui="ctx-manual-open"
                                      className="cursor-pointer border-0 bg-transparent p-0 text-left underline decoration-dotted underline-offset-2 hover:text-ink"
                                      title="Set a manual context cap for this model"
                                      onClick={() => setCtxEdit({ provider: p.name, model: m, value: m.manualContext != null ? String(m.manualContext) : '' })}
                                    >{body}</button>
                                  )
                                  : body
                              })()}
                            </td>
                            <td className={`${ui.td} ${border} adm-dim ${dimInfo}`}>
                              <span className="truncate block" title={[m.family, m.parameterSize, m.quantization].filter(Boolean).join(' · ') || undefined}>
                                {[m.family, m.parameterSize].filter(Boolean).join(' · ') || '—'}
                              </span>
                            </td>
                            <td className={`${ui.td} ${border}`}>
                              {/* right-aligned so Block/Unblock share a clean right edge across
                                  every row (Unblock is wider than Block — left-aligned it made
                                  the column ragged) and Test/Verify/Ctx stay column-aligned. */}
                              <div className="flex gap-1 justify-end items-center">
                                {/* chat prompt Test only for chat models; Verify also covers
                                    embeddings-class models (embeddings + chat probes) */}
                                {chatless && !m.capabilities.includes('embeddings')
                                  ? <span className="adm-dim self-center" title="Not a chat model — no probe applies">n/a</span>
                                  : (
                                    <>
                                      {!chatless && <button className="gw-btn adm-btn-sm" onClick={() => openTest(p.name, m)}>Test</button>}
                                      <button
                                        className="gw-btn adm-btn-sm"
                                        title={m.capabilities.includes('embeddings')
                                          ? 'Run capability probes (embeddings + chat) — verifies this is a working embedder and whether it can chat'
                                          : 'Run capability probes (chat/vision/tools/thinking) — one real request each; results override guesses'}
                                        disabled={Boolean(verifying[`${p.name}/${m.id}`])}
                                        onClick={() => void verify(p.name, m)}
                                      >{verifying[`${p.name}/${m.id}`] ? '…' : 'Verify'}</button>
                                      {isRoot && p.kind === 'ollama' && !chatless && (
                                        <button
                                          className="gw-btn adm-btn-sm"
                                          data-ui="calibrate-ctx"
                                          title="Calibrate the context optimum: measure the largest num_ctx that still fits fully in VRAM (loads the model a few times, ~1–5 min; briefly evicts other loaded models). The auto-optimize lever (System → Chat defaults) caps requests at the result."
                                          disabled={Boolean(calib?.running)}
                                          onClick={() => void calibrate(p.name, m)}
                                        >{calib?.running ? '…' : '📐 Ctx'}</button>
                                      )}
                                    </>
                                  )}
                                {isRoot && (m.blocked
                                  ? <button className="gw-btn adm-btn-sm min-w-[68px] text-center" title="Remove from the blocklist — the model becomes available again" onClick={() => void unblockModel(p.name, m.id)}>Unblock</button>
                                  : <button className="gw-btn adm-btn-sm adm-btn-danger min-w-[68px] text-center" title="Block this model platform-wide: hidden from every picker/API list and refused by the gateway (root)" onClick={() => void blockModel(p.name, m.id)}>Block</button>)}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
                {matches.length > MAX_ROWS && <div className="adm-dim text-[12px] mt-1.5">Showing {MAX_ROWS} of {matches.length} — narrow the filter to see the rest.</div>}
              </div>
            )}
          </section>
        )
      })}

      {/* Manual per-model context cap (root). Shows the RECOMMENDED value next to the input so the
          number is a decision, not a guess — Ote: "display recommand/caled number as i set so i can
          decide the right number i wanted". Going above the optimum is allowed and warned about. */}
      {ctxEdit && (() => {
        const m = ctxEdit.model
        const rec = m.appliedContext ?? null
        const opt = m.optimizedContext ?? null
        const trained = m.contextLength ?? null
        const typed = ctxEdit.value.trim() === '' ? null : Math.floor(Number(ctxEdit.value))
        const bad = typed != null && (!Number.isFinite(typed) || typed < 1024 || (trained != null && typed > trained))
        const over = typed != null && !bad && opt != null && typed > opt
        const row = (label: string, val: number | null, note?: string) => (
          <div className="flex items-baseline justify-between gap-4 py-0.5">
            <span className="adm-dim text-[12px]">{label}</span>
            <span className="text-[13px] tabular-nums">{val == null ? '—' : val.toLocaleString()}{note ? <span className="adm-dim"> {note}</span> : null}</span>
          </div>
        )
        return (
          <div className={ui.modalOverlay} {...dismissOnBackdrop(() => setCtxEdit(null))}>
            <div className={ui.modalCard} style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()} data-ui="ctx-manual-modal">
              <div className={ui.modalHead}>
                <h3 className={ui.modalTitle}>Context window — {m.id}</h3>
                <button className="gw-btn adm-btn-sm" onClick={() => setCtxEdit(null)}>✕</button>
              </div>
              <div className="rounded-[8px] border border-line bg-[var(--code-bg)] px-3 py-2">
                {row('Trained maximum', trained, '(the model’s own ceiling)')}
                {row('Measured optimum', opt, m.ctxFitsFull ? '(full window fits in VRAM)' : '(largest that fits with no spill)')}
                {row('Recommended', rec, opt != null && rec != null && rec !== opt ? `(${sections[ctxEdit.provider]?.autoCtxPct ?? 90}% of the optimum)` : undefined)}
                {row('Running now', m.effectiveContext ?? null)}
              </div>
              <label className={ui.field}>
                <span className={ui.fieldLabel}>Manual cap for this model (blank = use the recommendation)</span>
                <input
                  className="gw-input" inputMode="numeric" placeholder={rec != null ? `${rec} (recommended)` : 'tokens'}
                  value={ctxEdit.value} data-ui="ctx-manual-input"
                  onChange={(e) => setCtxEdit({ ...ctxEdit, value: e.target.value.replace(/[^\d]/g, ''), err: '' })}
                />
              </label>
              {bad && <div className="text-[12px] text-[var(--danger)]">Enter a value between 1,024 and the trained maximum{trained ? ` (${trained.toLocaleString()})` : ''}.</div>}
              {over && (
                <div className="rounded-[8px] border border-[var(--warn-edge)] bg-[var(--warn-soft)] px-2.5 py-2 text-[12px] text-[var(--warn)]">
                  ⚠ Above the measured optimum ({opt!.toLocaleString()}). The KV cache will spill to system RAM and generation gets markedly slower — deliberate is fine, accidental is not.
                </div>
              )}
              {ctxEdit.err && <div className="text-[12px] text-[var(--danger)]">{ctxEdit.err}</div>}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="gw-btn gw-btn-primary" data-ui="ctx-manual-save"
                  disabled={ctxEdit.busy || bad || typed == null}
                  onClick={() => void saveManualCtx(typed)}
                >{ctxEdit.busy ? 'Saving…' : 'Set cap'}</button>
                {rec != null && (
                  <button className="gw-btn adm-btn-sm" disabled={ctxEdit.busy} onClick={() => setCtxEdit({ ...ctxEdit, value: String(rec) })}>Use recommended</button>
                )}
                {m.manualContext != null && (
                  <button className="gw-btn adm-btn-sm" data-ui="ctx-manual-clear" disabled={ctxEdit.busy} onClick={() => void saveManualCtx(null)}>Clear override</button>
                )}
              </div>
              <p className="adm-dim text-[12px]">
                A manual cap replaces the calibrated recommendation for this model. It is still bounded by the
                platform limit (System → <b>providers.ollamaNumCtxLimit</b>) and the trained maximum, and each
                chat can choose a <i>smaller</i> window in its ⚙ settings — never a larger one.
              </p>
            </div>
          </div>
        )
      })()}

      {testing && (
        <div className={ui.modalOverlay} {...dismissOnBackdrop(() => setTesting(null))}>
          <div className={ui.modalCard} style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className={ui.modalHead}>
              <h3 className={ui.modalTitle}>Test — {testing.provider}/{testing.model.id}</h3>
              <button className="gw-btn adm-btn-sm" onClick={() => setTesting(null)}>✕</button>
            </div>
            <div className="flex flex-wrap gap-1">
              {testing.model.capabilities.map((c) => (
                <span key={c} className={`inline-block rounded-full border px-1.5 py-px text-[10px] font-medium ${CAP_STYLE[c] || 'bg-[var(--code-bg)] border-line'}`}>{c}</span>
              ))}
              <span className="adm-dim text-[12px] ml-1">{testing.model.goodFor}</span>
            </div>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Test prompt</span>
              <textarea className="gw-input" rows={2} value={tPrompt} onChange={(e) => setTPrompt(e.target.value)} />
            </label>
            <div className="flex items-center gap-2">
              <button className="gw-btn gw-btn-primary" disabled={tSending} onClick={runTest}>{tSending ? 'Testing…' : 'Send test prompt'}</button>
              <input ref={tFileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) { try { setTImage((await prepareImage(f)).url) } catch { setTErr('Could not read image') } }
                if (tFileRef.current) tFileRef.current.value = ''
              }} />
              {tImage ? (
                <span className="relative inline-block">
                  <img src={tImage} alt="test attachment" className="h-10 w-10 object-cover rounded-md border border-line" />
                  <button className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full border border-line bg-panel-strong text-[10px] leading-none" title="Remove image" onClick={() => setTImage(null)}>×</button>
                </span>
              ) : (
                <button className="gw-btn adm-btn-sm" title={testing.model.capabilities.includes('vision') ? 'Attach an image (this model declares vision)' : 'Attach an image — note: this model may not support vision'} onClick={() => tFileRef.current?.click()}>🖼 image</button>
              )}
            </div>
            {tErr && <div className="gw-meta gw-error">{tErr}</div>}
            {tResult && (
              <div className={ui.minted}>
                <div className="gw-block-title">reply — {tResult.latencyMs >= 1000 ? `${tResult.latencyMs}ms (${(tResult.latencyMs / 1000).toFixed(1)}s)` : `${tResult.latencyMs}ms`}{tResult.usage?.completionTokens != null ? ` · ${tResult.usage.promptTokens ?? '?'} in / ${tResult.usage.completionTokens} out tokens` : ''}</div>
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
      )}
    </div>
  )
}
