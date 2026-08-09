// LOCAL MONITOR — what is resident on this box, and whose it is.
//
// Ote's ask: report the models running locally, flag which ones the PLATFORM asked for, and be able to
// manage them. Attribution is the part nothing else can give: Ollama knows what is LOADED, only we know
// what we REQUESTED, so a resident model with no platform record belongs to something else.
//
// BOTH METERS side by side, because every residency mistake this session came from watching one and not
// the other — a CPU-placed model reads 0 VRAM while holding its full size in system RAM.
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPost } from '../../lib/api'
import RefreshButton from '../../components/RefreshButton'
import ConfirmModal from '../../components/ConfirmModal'
import { ui, cell } from './ui'
import { dismissOnBackdrop } from '../../lib/overlay'
import VoiceLocalPanel from './VoiceLocalPanel'

// Which chat a user was running on this model. `title` is null and `gone` true when the conversation has
// since been deleted — the ledger is per-process and outlives a DELETE, so this is a normal state.
type LocalConversation = { id: string; requests: number; ageSec: number; title: string | null; gone: boolean; lastMessageAt: string | null }
type LocalUser = { id: string | null; name: string | null; deleted: boolean; requests: number; ageSec: number; conversations?: LocalConversation[] }

type LocalModel = {
  name: string
  sizeGB: number; vramGB: number; ramGB: number
  placement: 'gpu' | 'cpu'
  contextLength: number | null
  parameterSize: string | null
  quantization: string | null
  expiresInSec: number | null
  stale: boolean
  roles: string[]
  platform: {
    lastAt: string
    ageSec: number
    requests: number
    kinds: string[]
    // `name` is null when the account no longer exists — the server refuses to pass an id off as a name,
    // so the UI is the one that has to say "deleted user". `agedOut` counts entries hidden because they
    // fall outside the model's own keep_alive window.
    users?: LocalUser[]
    agedOut?: number
    keepAliveSec?: number
  } | null
  unattributed: boolean
}
type Snapshot = {
  host: string
  reachable: boolean
  error?: string | null
  version: string | null
  models: LocalModel[]
  recentlyUsed: { model: string; ageSec: number; requests: number; kinds: string[] }[]
  totals: { loaded: number; onGpuGB: number; onCpuGB: number; unattributed: number; stale: number }
  memory: { ramTotalGB: number; ramUsedGB: number; ramFreeGB: number; ramUsedPct: number }
  gpus: { name: string; totalGB: number; usedGB: number; freeGB: number; utilPct: number | null; powerW: number | null; powerLimitW: number | null; tempC: number | null }[] | null
  cpu: { cores: number; utilPct: number | null; powerW: number | null; powerNote?: string }
  vram: { usedGB: number; ollamaGB: number; otherGB: number } | null
  hosts: { provider: string; host: string; forceCpu: boolean }[]
  ledgerAgeSec: number
  pollSeconds?: number
  at: string
}

// "Active" is a claim about NOW, so it needs a window: a user who last called two minutes ago is active on
// a model that answers in tens of seconds; one from an hour ago is history. 120s covers a slow CPU turn.
const ACTIVE_WINDOW_SEC = 120

// `busy` holds the model name being released; this sentinel marks the whole-fleet action so one
// spinner state serves both without a second flag. Plain ASCII on purpose: a stray control byte
// here once made git treat this whole .tsx as BINARY (diff unreviewable) while still compiling fine.
const RELEASE_ALL = '__release_all__'

const dur = (n: number | null) =>
  n == null ? '—' : n < 0 ? `${Math.abs(n) < 90 ? `${Math.abs(n)}s` : `${Math.round(Math.abs(n) / 60)}m`} ago`
    : n < 90 ? `${n}s` : `${Math.round(n / 60)}m`

function Stat({ label, value, sub, tone = 'plain', hint }: {
  label: string; value: string; sub?: string; tone?: 'plain' | 'ok' | 'warn' | 'danger'; hint?: string
}) {
  const toneClass = tone === 'ok' ? 'text-[var(--ok)]' : tone === 'warn' ? 'text-[var(--warn)]'
    : tone === 'danger' ? 'text-danger' : ''
  return (
    <div className="flex flex-col gap-0.5 min-w-[124px]" title={hint}>
      <span className="text-[10px] uppercase tracking-[0.05em] text-muted">{label}</span>
      <span className={`text-[15px] font-semibold tabular-nums ${toneClass}`}>{value}</span>
      {sub && <span className="text-[11px] text-muted">{sub}</span>}
    </div>
  )
}

function Chip({ children, tone = 'plain', title }: {
  children: React.ReactNode; tone?: 'plain' | 'ok' | 'warn' | 'accent'; title?: string
}) {
  const cls = tone === 'ok' ? 'border-[var(--ok-edge)] bg-[var(--ok-soft)] text-[var(--ok)]'
    : tone === 'warn' ? 'border-[var(--warn-edge)] bg-[var(--warn-soft)] text-[var(--warn)]'
      : tone === 'accent' ? 'border-[var(--edge)] bg-[var(--accent-soft)] text-[var(--accent-deep)]'
        : 'border-line text-muted'
  return <span title={title} className={`rounded-full border px-2 py-px text-[11px] font-medium whitespace-nowrap ${cls}`}>{children}</span>
}

export default function LocalPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<LocalModel | null>(null)
  const [confirmAll, setConfirmAll] = useState(false) // "Release all" — its own confirm, not a loop of the per-model one
  // Which user chip is expanded, keyed "<model>:<userId>" so the same person on two models expands
  // independently. Null = none. Deliberately NOT cleared by the auto-refresh: a panel that collapsed
  // every 10 seconds while you were reading it would be unusable.
  const [who, setWho] = useState<string | null>(null)
  // Resolved from the LIVE snapshot rather than captured at click time, so the open modal keeps up with
  // the 10s auto-refresh instead of showing a frozen copy. If the entry ages out while it is open the
  // lookup yields nothing and the modal closes itself — which is correct, not a bug to paper over.
  const whoDetail = (() => {
    if (!who || !snap) return null
    for (const m of snap.models) {
      for (const u of m.platform?.users || []) {
        if (`${m.name}:${u.id ?? 'root'}` === who) return { model: m.name, user: u }
      }
    }
    return null
  })()
  const [auto, setAuto] = useState(true)
  // Bumped by the page's ↻ so the Voice panel re-fetches with the snapshot. One control, one page:
  // a refresh that updated the Ollama card but left the VRAM figures above it frozen was worse than
  // no refresh, because both are read together to answer "what is on the card right now".
  const [refreshTick, setRefreshTick] = useState(0)
  const liveRef = useRef(true)

  const load = useCallback(async () => {
    try {
      const s = (await apiGet('/v1/admin/local')) as Snapshot
      if (liveRef.current) { setSnap(s); setErr(null) }
    } catch (e) {
      if (liveRef.current) setErr((e as Error)?.message || 'Could not read the local runtime')
    }
  }, [])

  useEffect(() => { liveRef.current = true; void load(); return () => { liveRef.current = false } }, [load])

  const refreshAll = useCallback(async () => { setRefreshTick((n) => n + 1); await load() }, [load])
  useEffect(() => {
    if (!auto) return
    // The SERVER states the cadence (it knows the GPU read behind this is a cached subprocess); 10s
    // fallback if an older build does not send one.
    const ms = Math.max(5, snap?.pollSeconds ?? 10) * 1000
    // DON'T POLL A TAB NOBODY IS LOOKING AT. This page exists partly because background work was quietly
    // eating the box; a forgotten tab refreshing every 10s forever would be the same sin in a nicer shirt.
    // Refresh once on becoming visible again so what you see is current, not however stale the pause left it.
    const tick = () => { if (!document.hidden) void load() }
    const t = setInterval(tick, ms)
    const onVis = () => { if (!document.hidden) void load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [auto, load, snap?.pollSeconds])

  // ALWAYS confirm (Ote: "make it alway show comfirmation modal before action"), through the app's own
  // ConfirmModal rather than window.confirm — the latter was both off-pattern for this console and, being
  // a browser dialog, easy to dismiss on muscle memory. Releasing looks harmless because the model reloads
  // on demand, but it frees several GB and stalls the next request behind a cold load, so it deserves a
  // deliberate click every time, not only when someone happens to be mid-turn.
  const unload = async (name: string) => {
    setBusy(name)
    try {
      const r = (await apiPost('/v1/admin/local/unload', { model: name })) as { snapshot: Snapshot }
      if (liveRef.current && r.snapshot) setSnap(r.snapshot)
    } catch (e) {
      setErr((e as Error)?.message || 'Unload failed')
    } finally { setBusy(null) }
  }

  // Release EVERYTHING. The server confirms against /api/ps before answering, so `stuck` is a measured
  // fact, not a guess — surface it, because a batch where one runner is wedged must not read as a clean
  // sweep (that is the whole reason this page exists).
  const releaseAll = async () => {
    setBusy(RELEASE_ALL)
    try {
      const r = (await apiPost('/v1/admin/local/release-all', {})) as
        { asked: string[]; released: string[]; stuck: string[]; snapshot: Snapshot }
      if (liveRef.current && r.snapshot) setSnap(r.snapshot)
      if (r.stuck?.length) {
        setErr(`Released ${r.released.length}/${r.asked.length}. Still resident: ${r.stuck.join(', ')} — `
          + 'those runners ignored the unload (wedged); only restarting Ollama frees their memory.')
      } else {
        setErr(null)
      }
    } catch (e) {
      setErr((e as Error)?.message || 'Release all failed')
    } finally { setBusy(null) }
  }

  const mem = snap?.memory
  const ramTone = (mem?.ramUsedPct ?? 0) >= 90 ? 'danger' : (mem?.ramUsedPct ?? 0) >= 80 ? 'warn' : 'plain'

  return (
    <div className={ui.page}>
      {/* THE LIVE CONTROLS BELONG TO THE PAGE, NOT TO ONE CARD (Ote: "i think this one should be moved?").
          They sat in the Ollama card header — below the Voice panel — so they read as belonging to nothing,
          and worse, they only ever governed the Ollama snapshot: unticking left /admin/local/voice polling
          on its own 15s timer (measured: 2 requests in the 32s after the box was cleared). On the one page
          whose whole point is "nothing should quietly work in the background", the off switch has to be the
          off switch. Hoisted here, it gates both panels and ↻ refreshes both. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className={ui.h2}>Local runtime</h2>
        <div className="flex items-center gap-3" data-ui="local-live">
          {/* `gw-check` is a WRAPPER class and goes on the LABEL. On the input it left the global
              `input { width: 100% }` in force, which blew the box out and squeezed the text into three
              stacked fragments ("auto-" / "refresh" / "(10s)"). Same trap already documented in
              chat/SoundPanel.tsx — this was the last instance of it. */}
          <label
            className="gw-check text-[12px] text-muted whitespace-nowrap"
            title="Governs every poll on this page — the runtime snapshot and the Voice panel above it. The Voice sidecar keeps its own slower cadence; nothing polls while this is off or the tab is hidden."
          >
            <input type="checkbox" className="m-0 w-auto flex-none" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            auto-refresh{snap?.pollSeconds ? ` (${snap.pollSeconds}s)` : ''}
          </label>
          <RefreshButton onRefresh={refreshAll} />
        </div>
      </div>
      <p>
        Models resident on this machine right now, and whether <strong>this platform</strong> is what loaded
        them. Ollama reports what is loaded; only we know what we asked for. Attribution is kept in memory,
        so it resets on restart — <em>unattributed</em> means we have no record, not that something else
        owns it.
      </p>

      {err && <p className="text-danger">{err}</p>}

      {/* The speech sidecar is resident on this box and competes for the same VRAM as the models below —
          it starved them once. It belongs here, where you already look when asking what is eating the card. */}
      <VoiceLocalPanel auto={auto} refreshTick={refreshTick} />

      {snap && (
        <>
          <div className="mt-3 rounded-[10px] border border-line bg-panel-strong p-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Chip tone={snap.reachable ? 'ok' : 'warn'}>{snap.reachable ? 'Ollama online' : 'unreachable'}</Chip>
              <span className="text-[12px] text-muted">
                {snap.host}{snap.version ? ` · v${snap.version}` : ''}
                {snap.hosts?.length > 1 && ` · serving ${snap.hosts.map((h) => h.provider).join(' + ')}`}
              </span>
            </div>
            {!snap.reachable && snap.error && <p className="text-danger mt-2">{snap.error}</p>}

            {/* BOTH METERS. VRAM alone hides a CPU-placed model completely.
                Laid out as two GROUPS — host meters, then the GPUs — because the longer `used / total`
                subs pushed the row over and orphaned GPU 1 onto a line of its own. Grouped, the cards
                wrap together and stay comparable side by side, which is the only way to read them. */}
            <div className="mt-3 flex flex-wrap items-start gap-x-7 gap-y-4 border-t border-line pt-3">
              {/* USED / TOTAL, not "free" (Ote). Every meter on this row now reads the same way, so the
                  numbers can be compared at a glance instead of one saying how much is gone and the next
                  how much is left. Free stays, as the secondary. */}
              <Stat
                label="System RAM" value={`${mem!.ramUsedGB} / ${mem!.ramTotalGB} GB`} tone={ramTone}
                sub={`${mem!.ramUsedPct}% used · ${mem!.ramFreeGB} GB free`}
                hint="Binary GB (GiB) — the same unit as the GPU tiles and Task Manager, so a model's size and a card's capacity are directly comparable."
              />
              <Stat label="Models in RAM" value={`${snap.totals.onCpuGB} GB`} sub="CPU-placed" tone={snap.totals.onCpuGB > 14 ? 'warn' : 'plain'} />
              <Stat
                label="Models in VRAM" value={`${snap.totals.onGpuGB} GB`}
                // The colour must point at the thing being flagged. Toning the VALUE made "0 GB" orange,
                // which reads as "zero is a problem" when the finding is the OTHER 1.3GB — so the value
                // stays plain and the note carries the mark.
                // 1.5GB floor, not 0.3: a Windows desktop with a browser open sits around 0.9GB on the
                // display card, so the old threshold warned on a perfectly idle box every time. A warning
                // that is always on is one you stop reading — and this one needs to still mean something
                // the day a 12GB orphaned runner is squatting on the card (which is what it caught).
                sub={snap.vram && snap.vram.otherGB > 1.5 ? `⚠ +${snap.vram.otherGB} GB not Ollama` : 'GPU-placed'}
                hint={snap.vram
                  ? `The driver reports ${snap.vram.usedGB} GB in use across all GPUs; Ollama accounts for ${snap.vram.ollamaGB} GB. The rest is something else on the card.`
                  : undefined}
              />
              <Stat
                label="CPU" value={snap.cpu.utilPct == null ? '—' : `${snap.cpu.utilPct}%`}
                tone={(snap.cpu.utilPct ?? 0) >= 85 ? 'warn' : 'plain'}
                sub={snap.cpu.powerW == null ? `${snap.cpu.cores} cores · no power sensor` : `${snap.cpu.cores} cores · ${snap.cpu.powerW} W`}
                hint={snap.cpu.utilPct == null
                  ? 'Utilisation needs two samples — it appears on the next refresh.'
                  : snap.cpu.powerNote}
              />
              {/* The GPU cluster: its own flex row so the cards move together when space runs out, with a
                  rule + total so two cards read as one pool — which is how VRAM actually gets spent. */}
              {snap.gpus?.length ? (
                <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-l border-line pl-6">
                  {snap.gpus.length > 1 && (
                    <Stat
                      label="GPU total"
                      value={`${+snap.gpus.reduce((n, g) => n + g.usedGB, 0).toFixed(1)} / ${+snap.gpus.reduce((n, g) => n + g.totalGB, 0).toFixed(1)} GB`}
                      tone={snap.gpus.reduce((n, g) => n + g.usedGB, 0) / Math.max(1, snap.gpus.reduce((n, g) => n + g.totalGB, 0)) >= 0.9 ? 'warn' : 'plain'}
                      sub={`${snap.gpus.length} cards · ${+snap.gpus.reduce((n, g) => n + g.freeGB, 0).toFixed(1)} GB free`}
                      hint="Not one pool: a model's layers and their KV cache must sit on the SAME card, so a 27GB model can fail to place across 2×16GB even though the total looks sufficient."
                    />
                  )}
                  {snap.gpus.map((g, i) => (
                <Stat
                  key={i}
                  label={`GPU ${i}`}
                  value={`${g.usedGB} / ${g.totalGB} GB`}
                  // Tone follows MEMORY pressure, not utilisation: a card at 100% util with room to
                  // spare is working, whereas a full card is the thing that evicts a model.
                  tone={g.usedGB / (g.totalGB || 1) >= 0.9 ? 'warn' : 'plain'}
                  sub={[
                    g.name.replace('NVIDIA GeForce ', ''),
                    g.utilPct == null ? null : `${g.utilPct}% util`,
                    `${g.freeGB} GB free`,
                    g.powerW == null ? null : `${g.powerW}${g.powerLimitW ? `/${g.powerLimitW}` : ''} W`,
                    g.tempC == null ? null : `${g.tempC}°C`,
                  ].filter(Boolean).join(' · ')}
                />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex items-baseline justify-between gap-3 flex-wrap">
            <strong>Loaded now ({snap.totals.loaded})</strong>
            <span className="flex items-baseline gap-3 text-[11px] text-muted">
              {snap.totals.unattributed > 0 && <>{snap.totals.unattributed} unattributed · </>}
              attribution covers the last {dur(snap.ledgerAgeSec)} (since this server started)
              {/* only offered when there IS something resident — a button that provably does nothing
                  still teaches people it might, and this one carries a scary modal */}
              {snap.models.length > 0 && (
                <button
                  className="gw-btn adm-btn-sm adm-btn-danger"
                  disabled={busy === RELEASE_ALL}
                  title="Ask Ollama to unload every resident model"
                  onClick={() => setConfirmAll(true)}
                >{busy === RELEASE_ALL ? 'releasing…' : `Release all (${snap.models.length})`}</button>
              )}
            </span>
          </div>

          {snap.models.length === 0
            ? <p className="text-muted mt-2">Nothing resident — every model has unloaded.</p>
            : (
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <colgroup><col style={{ width: '34%' }} /><col style={{ width: '14%' }} /><col style={{ width: '22%' }} /><col style={{ width: '16%' }} /><col style={{ width: '14%' }} /></colgroup>
                  <thead>
                    <tr>
                      <th className={ui.th}>Model</th><th className={ui.th}>Placement</th>
                      <th className={ui.th}>Loaded by / who</th><th className={ui.th}>Expiry</th><th className={ui.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.models.map((m, i) => {
                      const last = i === snap.models.length - 1
                      return (
                        <tr key={m.name}>
                          <td className={cell(last)}>
                            <div className="font-semibold">{m.name}</div>
                            <div className="text-[11px] text-muted">
                              {[m.parameterSize, m.quantization, m.contextLength ? `ctx ${m.contextLength.toLocaleString()}` : null].filter(Boolean).join(' · ')}
                            </div>
                            {m.roles.length > 0 && <div className="text-[11px] text-muted">role: {m.roles.join(', ')}</div>}
                          </td>
                          <td className={cell(last)}>
                            <Chip tone={m.placement === 'cpu' ? 'warn' : 'accent'}>{m.placement.toUpperCase()}</Chip>
                            <div className="text-[11px] text-muted mt-1">{m.sizeGB} GB {m.placement === 'cpu' ? 'RAM' : 'VRAM'}</div>
                          </td>
                          <td className={cell(last)}>
                            {/* ATTRIBUTION — the reason this page exists */}
                            {m.platform ? (
                              <>
                                <Chip tone="ok">this platform</Chip>
                                <div className="text-[11px] text-muted mt-1">{m.platform.kinds.join('/')} · {dur(m.platform.ageSec)} ago · {m.platform.requests}×</div>
                                {/* WHO. Sorted freshest-first by the server; anyone inside the ACTIVE window is
                                    called out, the rest are listed as recent so the column never implies
                                    someone is on it when they finished ten minutes ago. */}
                                {m.platform.users?.length ? (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {m.platform.users.map((u) => {
                                      const key = `${m.name}:${u.id ?? 'root'}`
                                      // A deleted account has no name to show. The old fallback printed
                                      // id.slice(0,8), which reads as an identifier the viewer ought to
                                      // recognise — Ote reasonably took a column of them for conversation
                                      // ids. Say what it is instead.
                                      const label = u.name ?? 'deleted user'
                                      return (
                                        <button
                                          key={key}
                                          type="button"
                                          className="tap-chip cursor-pointer border-0 bg-transparent p-0"
                                          onClick={() => setWho(who === key ? null : key)}
                                          title={`${u.requests} request${u.requests === 1 ? '' : 's'} · last ${dur(u.ageSec)} ago${u.conversations?.length ? ` · ${u.conversations.length} chat${u.conversations.length === 1 ? '' : 's'} — click for detail` : ''}`}
                                        >
                                          <Chip tone={u.deleted ? 'plain' : u.ageSec <= ACTIVE_WINDOW_SEC ? 'accent' : 'plain'}>
                                            {u.ageSec <= ACTIVE_WINDOW_SEC && !u.deleted ? '● ' : ''}{label}
                                            {u.conversations?.length ? ` · ${u.conversations.length}` : ''}
                                          </Chip>
                                        </button>
                                      )
                                    })}
                                  </div>
                                ) : null}
                                {/* Say what was hidden. A list that silently shrinks looks identical to one
                                    with nothing to show, which is the defect this page exists to expose. */}
                                {m.platform.agedOut ? (
                                  <div className="mt-1 text-[11px] text-muted">
                                    {m.platform.agedOut} older {m.platform.agedOut === 1 ? 'entry' : 'entries'} hidden — outside this model&apos;s {dur(m.platform.keepAliveSec ?? 300)} keep-alive
                                  </div>
                                ) : null}
                                {/* the click-through opens a MODAL — see `who` below. Inline expansion
                                    pushed the table around every time you looked at something (Ote: "i take
                                    too much space sometime"), which is the wrong trade for a read-only
                                    detail view on a page you are scanning. */}
                              </>
                            ) : (
                              <>
                                {/* "No record" is NOT "someone else's". The ledger is per-process, so a young
                                    ledger means we may simply have missed the load — say that, and keep the
                                    warning tone for when the server has been up long enough to be surprised. */}
                                <Chip
                                  tone={snap.ledgerAgeSec < 900 ? 'plain' : 'warn'}
                                  title={snap.ledgerAgeSec < 900
                                    ? `No request from this server, which started only ${dur(snap.ledgerAgeSec)} ago — most likely it was already loaded before the restart. It will attribute as soon as anything calls it.`
                                    : `This server has been up ${dur(snap.ledgerAgeSec)} and has never requested this model — another client is the likely owner.`}
                                >unattributed</Chip>
                                <div className="text-[11px] text-muted mt-1">
                                  {snap.ledgerAgeSec < 900 ? 'loaded before this server started?' : 'no request from us'}
                                </div>
                              </>
                            )}
                          </td>
                          <td className={cell(last)}>
                            {m.stale
                              ? <Chip tone="warn" title="Past its own keep_alive expiry and STILL loaded — the signature of a wedged runner. If Release does not clear it, only restarting Ollama will.">⚠ stale {dur(m.expiresInSec)}</Chip>
                              : <span className="text-[12px] text-muted">{dur(m.expiresInSec)}</span>}
                          </td>
                          <td className={`${cell(last)} text-right`}>
                            <button
                              className="adm-btn-sm" disabled={busy === m.name}
                              onClick={() => setConfirming(m)}
                              title="Ask Ollama to release this model (keep_alive: 0). Non-destructive — it reloads on the next request."
                            >
                              {busy === m.name ? 'releasing…' : 'Release'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

          {snap.totals.stale > 0 && (
            <p className="text-danger mt-2">
              ⚠ {snap.totals.stale} model(s) past their own expiry and still resident. If Release does not
              clear them the runner is wedged, and only restarting Ollama will free that memory.
            </p>
          )}

          {snap.recentlyUsed.length > 0 && (
            <>
              <div className="mt-5"><strong>Used by the platform, since unloaded</strong></div>
              <p className="text-[12px] text-muted">The next call to these pays a cold load.</p>
              <div className="text-[12px] text-muted">
                {snap.recentlyUsed.map((u) => `${u.model} (${dur(u.ageSec)} ago)`).join(' · ')}
              </div>
            </>
          )}
        </>
      )}

      {/* WHO detail — a modal, not an inline panel, so opening it never reflows the table underneath.
          Read-only, so it deliberately does NOT use ConfirmModal (that one is built around an action and
          would put a confirm button on a view with nothing to confirm). */}
      {whoDetail && (
        <div className={ui.modalOverlay} {...dismissOnBackdrop(() => setWho(null))}>
          <div className={ui.modalCard} style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className={ui.modalHead}>
              <h3 className={ui.modalTitle}>{whoDetail.user.name ?? 'deleted user'}</h3>
              <button className="gw-btn adm-btn-sm" onClick={() => setWho(null)}>✕</button>
            </div>
            <div className="text-[13px] leading-relaxed">
              <p className="text-muted">
                on <strong className="text-ink">{whoDetail.model}</strong> · {whoDetail.user.requests} request
                {whoDetail.user.requests === 1 ? '' : 's'} · last {dur(whoDetail.user.ageSec)} ago
              </p>
              {whoDetail.user.deleted && (
                <p className="mt-1 text-muted">
                  This account no longer exists. The attribution ledger is per-process and outlives a delete,
                  so the requests are real even though the user is gone.
                </p>
              )}
              {whoDetail.user.conversations?.length ? (
                <table className="mt-2.5 w-full border-collapse text-[12.5px]">
                  <tbody>
                    {whoDetail.user.conversations.map((c) => (
                      <tr key={c.id} className="adm-who-row">
                        <td className="py-1 pr-2">
                          <span className={c.gone ? 'italic text-muted' : 'text-ink'}>
                            {c.gone ? 'deleted chat' : (c.title || 'untitled chat')}
                          </span>
                          {c.lastMessageAt && (
                            <div className="text-[11px] text-muted">last message {new Date(c.lastMessageAt).toLocaleString()}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-1 text-right align-top text-[12px] tabular-nums text-muted">
                          {c.requests}× · {dur(c.ageSec)} ago
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                // Real and common, so it gets words rather than an empty box: title generation, the memory
                // extractor and embeddings are all local traffic with no conversation behind them.
                <p className="mt-2 text-muted">
                  No conversation — side-calls only (title generation, memory, embeddings).
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmAll && snap && (
        <ConfirmModal
          title={`Release all ${snap.models.length} resident model${snap.models.length === 1 ? '' : 's'}?`}
          confirmLabel={`Release all ${snap.models.length}`}
          busyLabel="Releasing…"
          danger // heavier than a single release: it frees memory out from under EVERY user at once
          onClose={() => setConfirmAll(false)}
          onConfirm={releaseAll}
          message={(() => {
            const models = snap.models
            const gpuGB = models.filter((m) => m.placement === 'gpu').reduce((n, m) => n + m.sizeGB, 0)
            const cpuGB = models.filter((m) => m.placement === 'cpu').reduce((n, m) => n + m.sizeGB, 0)
            // one row per DISTINCT active person, not per model — the same user on three models is one
            // interruption, and listing them three times overstates the blast radius
            const activeBy = new Map<string, number>()
            for (const m of models) {
              for (const u of m.platform?.users || []) {
                if (u.ageSec <= ACTIVE_WINDOW_SEC) activeBy.set(u.name ?? 'deleted user', (activeBy.get(u.name ?? 'deleted user') || 0) + 1)
              }
            }
            const roles = [...new Set(models.flatMap((m) => m.roles))]
            const stale = models.filter((m) => m.stale)
            return (
              <div className="flex flex-col gap-2.5">
                <p className="m-0">
                  Asks Ollama to unload <strong>every model resident on this machine</strong>, freeing{' '}
                  <strong>
                    {gpuGB > 0 && `${gpuGB.toFixed(1)} GB VRAM`}
                    {gpuGB > 0 && cpuGB > 0 && ' + '}
                    {cpuGB > 0 && `${cpuGB.toFixed(1)} GB system RAM`}
                  </strong>.
                </p>

                {/* WHAT WILL BE AFFECTED — the list Ote asked for, from the live snapshot */}
                <div className="rounded-lg border border-[var(--warn-edge)] bg-[var(--warn-soft)] px-3 py-2">
                  <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--warn)]">This affects</div>
                  <ul className="m-0 mt-1.5 flex list-disc flex-col gap-1 pl-4 text-[12.5px]">
                    {models.map((m) => (
                      <li key={m.name}>
                        <code className={ui.codeChip}>{m.name}</code>{' '}
                        <span className="text-muted">
                          {m.sizeGB} GB {m.placement === 'cpu' ? 'RAM' : 'VRAM'}
                          {m.roles.length > 0 && ` · ${m.roles.join(', ')}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <ul className="m-0 mt-2 flex list-disc flex-col gap-1 pl-4 text-[12.5px]">
                    <li><strong>The next call to each pays a cold load</strong> — seconds to a minute per model.</li>
                    {activeBy.size > 0 && (
                      <li className="font-semibold text-[var(--danger)]">
                        In active use right now by {[...activeBy.keys()].join(', ')} — a reply in flight will stall.
                      </li>
                    )}
                    {roles.length > 0 && (
                      <li>
                        Platform roles on these models ({roles.join(', ')}) reload on demand — background work
                        (scheduled runs, the vision relay, memory/embedding jobs) pays that cold load too.
                      </li>
                    )}
                    <li className="text-muted">
                      Ollama itself keeps running — this is <code className={ui.codeChip}>keep_alive: 0</code>,
                      the documented unload, not a restart. Nothing is deleted and every model reloads on demand.
                    </li>
                    {/* both live on this page now, so say which one this button does NOT touch */}
                    <li className="text-muted">
                      The <strong>Voice</strong> sidecar is <strong>not</strong> included — it holds its own GPU
                      memory and has its own <em>Release GPU</em> above.
                    </li>
                  </ul>
                </div>

                {stale.length > 0 && (
                  <p className="m-0 text-[12.5px] text-muted">
                    {stale.length} model(s) are already past their own expiry and still resident. If they survive
                    this, those runners are wedged and only restarting Ollama frees them — you will be told which.
                  </p>
                )}
              </div>
            )
          })()}
        />
      )}

      {confirming && (
        <ConfirmModal
          title={`Release ${confirming.name}?`}
          confirmLabel="Release"
          busyLabel="Releasing…"
          danger={false} // recoverable: Ollama reloads it on the next request
          onClose={() => setConfirming(null)}
          onConfirm={() => unload(confirming.name)}
          message={(() => {
            const active = (confirming.platform?.users || []).filter((u) => u.ageSec <= ACTIVE_WINDOW_SEC)
            return (
              <>
                <p>
                  Frees <strong>{confirming.sizeGB} GB</strong> of{' '}
                  {confirming.placement === 'cpu' ? 'system RAM' : 'VRAM'} now. Ollama reloads the model on
                  the next request, so nothing is lost — but that request waits for a cold load.
                </p>
                {active.length > 0 && (
                  <p className="text-[var(--warn)]">
                    {/* `name` is null for a deleted account — join() would silently render that as an
                        empty slot, i.e. "In active use by , Ote". Name it instead. */}
                    ⚠ In active use by {active.map((u) => u.name ?? 'deleted user').join(', ')} — a reply in flight will stall.
                  </p>
                )}
                {confirming.stale && (
                  <p className="text-muted">
                    This model is past its own expiry and still resident. If Release does not clear it the
                    runner is wedged, and only restarting Ollama will free the memory.
                  </p>
                )}
              </>
            )
          })()}
        />
      )}
    </div>
  )
}
