// THE VOICE, on the Local page (Ote: *"can you also add thoese voice model to console/local so i can
// check what up, and manages?"*).
//
// WHY IT LIVES HERE and not on its own page: the speech sidecar is one more thing resident on this box
// competing for the same VRAM as the chat models — and it starved them once, crashing Ollama's
// llama-server, before the VRAM floor existed. So it belongs beside them, where you are already looking
// when you ask "what is eating this card", not in a separate tab you would have to think to open.
//
// Two management actions, both non-destructive and both matching the Release verb already on this page:
//   • Release — hand the GPU back now; the engine reloads on the next press (2.73s measured)
//   • Clear cache — delete every rendered clip; safe by construction, because a spoken reply is a DERIVED
//     rendering of the text and the text remains the record
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPost } from '../../lib/api'
import ConfirmModal from '../../components/ConfirmModal'

type VoiceStatus = {
  enabled: boolean
  sidecarUrl: string | null
  voice: string | null
  sampleRate: number | null
  maxChars: number | null
  cache: { files: number; bytes: number; dir: string } | null
  cacheLimits?: { maxMB: number; ttlDays: number; maxBytes: number; ttlMs: number }
  reachable: boolean
  error: string | null
  sidecar: {
    engine?: string
    loaded?: boolean
    load_s?: number | null
    output_sample_rate?: number
    voice_how?: string
    served?: number
    queue_depth?: number
    idle_unload_s?: number
    deterministic?: boolean
    vram_floor_mib?: number
    vram_free_mib?: number | null
    vram_load_mib?: number | null
    gpu?: {
      cuda?: boolean; index?: number; requested?: string; device?: string
      allocated_mib?: number; reserved_mib?: number
    }
  } | null
  voices: Record<string, unknown> | null
}

const mib = (b: number) => `${(b / 1048576).toFixed(1)} MB`

// "NVIDIA GeForce RTX 5060 Ti" → "RTX 5060 Ti". The vendor words are the same on both cards in this box, so
// they cost a line of width to say nothing; the model and the INDEX are what distinguish them.
const shortGpu = (name?: string) => (name || '').replace(/^NVIDIA\s+(GeForce\s+)?/i, '') || null

// WHAT IS IN THE PILE (Ote: *"make it show how much it build up. list of cache it pile up"*). A list of hashes
// answers nothing; what answers the question is where the megabytes went — grouped by voice — and which clips
// are next out of the door, which is why the rows are ordered by LAST PLAYED.
type Clip = {
  hash: string; bytes: number; lastPlayed: string; createdAt: string | null
  seconds: number | null; chars: number | null; voice: string | null; engine: string | null; text: string | null
}
type ClipList = {
  files: number; bytes: number; truncated: number; oldestPlayed: string | null
  limits: { maxMB: number; ttlDays: number }
  byVoice: Record<string, { files: number; bytes: number }>
  byEngine: Record<string, { files: number; bytes: number }>
  clips: Clip[]
}

/** "3 days ago" — the eviction question is about age, and an ISO string makes the reader do the arithmetic. */
function ago(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return '—'
  const m = Math.round(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

function Chip({ children, tone = 'plain', title }: {
  children: React.ReactNode; tone?: 'plain' | 'ok' | 'warn' | 'danger'; title?: string
}) {
  const cls = tone === 'ok' ? 'border-[var(--ok-edge)] bg-[var(--ok-soft)] text-[var(--ok)]'
    : tone === 'warn' ? 'border-[var(--warn-edge)] bg-[var(--warn-soft)] text-[var(--warn)]'
      : tone === 'danger' ? 'border-[var(--danger-edge)] bg-[var(--danger-soft)] text-[var(--danger)]'
        : 'border-line text-muted'
  return <span title={title} className={`rounded-full border px-2 py-px text-[11px] font-medium whitespace-nowrap ${cls}`}>{children}</span>
}

function Stat({ label, value, sub, hint }: { label: string; value: React.ReactNode; sub?: string; hint?: string }) {
  return (
    <div className="flex min-w-[124px] flex-col gap-0.5" title={hint}>
      <span className="text-[11px] uppercase tracking-[0.05em] text-muted">{label}</span>
      <span className="text-[15px] font-semibold tabular-nums">{value}</span>
      {sub && <span className="text-[11px] text-muted">{sub}</span>}
    </div>
  )
}

// `auto` / `refreshTick` come from the page's one live control (LocalPage header). This panel used to poll
// on a private 15s timer that no switch could reach, so "auto-refresh: off" still left it talking to the
// sidecar — on the page that exists to catch exactly that kind of background work.
export default function VoiceLocalPanel({ auto = true, refreshTick = 0 }: { auto?: boolean; refreshTick?: number }) {
  const [st, setSt] = useState<VoiceStatus | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'release' | 'clear' | null>(null)
  const [clips, setClips] = useState<ClipList | null>(null)
  const [showClips, setShowClips] = useState(false)
  const [sweptNote, setSweptNote] = useState<string | null>(null)
  const live = useRef(true)

  const load = useCallback(async () => {
    try {
      const s = (await apiGet('/v1/admin/local/voice')) as VoiceStatus
      if (live.current) { setSt(s); setErr(null) }
    } catch (e) {
      if (live.current) setErr((e as Error)?.message || 'Could not read the Voice')
    }
  }, [])

  // One first read regardless of `auto` — an off switch means "stop polling", not "show me nothing".
  useEffect(() => { live.current = true; void load(); return () => { live.current = false } }, [load])

  // The page's ↻ refreshes this panel too (tick 0 is the mount, already covered above).
  useEffect(() => { if (refreshTick > 0) void load() }, [refreshTick, load])

  useEffect(() => {
    if (!auto) return
    // 15s, not the snapshot's 10s: this reads the sidecar over HTTP and its numbers move slowly.
    // Same discipline as the rest of this page: never poll a tab nobody is looking at.
    const t = setInterval(() => { if (!document.hidden) void load() }, 15000)
    const onVis = () => { if (!document.hidden) void load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [auto, load])

  // The listing is only fetched when it is opened — it stats every clip on disk, which is not something to do
  // on a 15-second timer for a panel nobody has expanded.
  const loadClips = useCallback(async () => {
    try {
      const c = (await apiGet('/v1/admin/local/voice/clips?limit=200')) as ClipList
      if (live.current) { setClips(c); setErr(null) }
    } catch (e) {
      if (live.current) setErr((e as Error)?.message || 'Could not read the clip list')
    }
  }, [])

  const act = async (what: 'release' | 'clear' | 'sweep') => {
    setBusy(what)
    try {
      const path = what === 'release' ? '/v1/admin/local/voice/unload'
        : what === 'sweep' ? '/v1/admin/local/voice/sweep'
          : '/v1/admin/local/voice/clear-cache'
      const r = (await apiPost(path, {})) as { status?: VoiceStatus; files?: number; bytes?: number; ttl?: number; cap?: number; skipped?: string }
      if (live.current && r.status) setSt(r.status)
      if (what === 'sweep' && live.current) {
        // Say what it actually did. "Swept" with no numbers leaves you wondering whether anything happened —
        // and with both limits at 0 the honest answer is that nothing was even eligible.
        setErr(r.skipped
          ? `Nothing swept (${r.skipped === 'no limits set' ? 'no cap and no TTL are set' : r.skipped}).`
          : null)
        if (!r.skipped) setSweptNote(`Removed ${r.files ?? 0} clip(s) — ${r.ttl ?? 0} past the TTL, ${r.cap ?? 0} over the cap, ${mib(r.bytes ?? 0)} reclaimed.`)
        if (showClips) await loadClips()
      }
      if (what === 'clear' && live.current) { setClips(null); setSweptNote(null) }
    } catch (e) {
      setErr((e as Error)?.message || 'Action failed')
    } finally { setBusy(null); setConfirm(null) }
  }

  const sc = st?.sidecar
  const loaded = Boolean(sc?.loaded)

  // WHAT THE VOICE IS HOLDING, AND WHERE — Ote: *"you may add how much speak module take vram, and which gpu
  // it on here for me abit"*.
  //
  // `reserved_mib` and not the load delta, deliberately. reserved is the engine's own allocator pool: nothing
  // Ollama does can move it, and it is correct in BOTH states — 3,128 MiB loaded, 770 MiB after a Release.
  // The load delta reads 3,130 on a fresh process but only 2,356 on a reload (the release left 770 behind),
  // so headlining it would report the same engine at two different sizes depending on its history.
  const heldMib = sc?.gpu?.reserved_mib ?? null
  const gpuName = shortGpu(sc?.gpu?.device)
  const gpuWhere = sc?.gpu?.index != null ? `GPU ${sc.gpu.index}${gpuName ? ` · ${gpuName}` : ''}` : (sc?.gpu?.requested ?? null)

  return (
    <div className="mt-3 rounded-[10px] border border-line bg-panel-strong p-3.5" data-ui="voice-local">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 text-[15px] font-bold">🔊 Voice (speech synthesis)</h3>
        {!st ? <Chip>reading…</Chip>
          : !st.enabled ? <Chip title="chat.speechSidecarUrl is empty, so the 🔊 control never appears in chat.">off — no sidecar configured</Chip>
            : !st.reachable ? <Chip tone="danger" title={st.error || ''}>sidecar unreachable</Chip>
              : <>
                <Chip tone="ok">{sc?.engine ?? 'sidecar up'}</Chip>
                {loaded
                  ? <Chip tone="warn" title="The engine is resident and holding VRAM. Release hands most of it back; it reloads on the next press.">model loaded</Chip>
                  // ⚠ NOT "idle, GPU free" any more — that was measurably false. With the model released the
                  // sidecar still holds ~770 MiB on its card (18 MiB of live tensors pin the segments around
                  // them, and empty_cache can only return segments with nothing live in them). On a card this
                  // panel exists to keep clear for the chat models, three quarters of a gigabyte is not "free".
                  : (heldMib ?? 0) >= 1
                    ? <Chip title="The model is unloaded, but the sidecar process still holds this much until it restarts. Loads again on the next press (~2.5s).">idle · {Math.round(heldMib as number)} MiB still held</Chip>
                    : <Chip title="No VRAM held right now — it loads on the next press (~2.5s after an idle unload).">idle, GPU free</Chip>}
                {(sc?.queue_depth ?? 0) > 0 && <Chip tone="warn">{sc?.queue_depth} rendering</Chip>}
              </>}
      </div>

      {err && <p className="mt-2 text-danger">{err}</p>}

      {st && !st.enabled && (
        <p className="mt-2 text-muted">
          Set <code>chat.speechSidecarUrl</code> in <strong>System</strong> to switch the Voice on. Start a
          sidecar first — the engine runs as its own process because each one is Python + CUDA with a
          conflicting dependency tree:
          <br />
          <code>VoiceModels/engines/omnivoice/.venv/Scripts/python.exe sidecar/serve.py --engine omnivoice --port 8310 --device cuda:1 --idle-unload 300</code>
        </p>
      )}

      {st?.enabled && (
        <>
          <div className="mt-3 flex flex-wrap gap-5">
            <Stat label="engine" value={sc?.engine ?? '—'}
              // Trim at a WORD boundary and drop trailing punctuation: a hard slice left "…attribute
              // string —" hanging on a dash, which reads as truncated text rather than a summary.
              sub={st.reachable ? `${(sc?.voice_how ?? '').slice(0, 42).replace(/[\s—,-]+$/, '')}…` : 'not answering'}
              hint={sc?.voice_how} />
            <Stat label="voice" value={<span className="text-[13px] font-medium">{st.voice || '(sidecar default)'}</span>}
              hint="chat.speechVoice. The SHAPE is engine-specific: OmniVoice takes a validated attribute string, Qwen/VoxCPM2 a speaker name." />
            <Stat label="output" value={`${st.sampleRate ?? '?'} Hz`} sub={`cap ${st.maxChars ?? '?'} chars`}
              hint="24 kHz halves storage against 48 kHz with no measurable quality cost — the band a 24 kHz file cannot carry holds 0.00024% of the energy (measured)." />
            <Stat label="clips rendered" value={sc?.served ?? '—'} sub="since the sidecar started" />
            <Stat label="clip cache" value={st.cache ? `${st.cache.files}` : '—'}
              sub={st.cache
                ? `${mib(st.cache.bytes)}${st.cacheLimits?.maxMB ? ` of ${st.cacheLimits.maxMB} MB` : ' — no cap'}`
                : ''}
              hint={`${st.cache?.dir ?? ''}${st.cacheLimits?.ttlDays
                ? ` · deleted after ${st.cacheLimits.ttlDays} days without being played`
                : ' · no TTL: clips are kept until the cap evicts them'}`} />
            {/* Same unit as VRAM free and directly beside it, on purpose: the two are measured on the SAME
                card by the same process, so held + free is a sentence you can read straight off the row. */}
            <Stat label="VRAM used" value={heldMib != null ? `${Math.round(heldMib)} MiB` : '—'}
              sub={gpuWhere ?? (sc?.gpu?.cuda === false ? 'CPU — no CUDA' : '')}
              hint={heldMib == null ? 'The sidecar did not report a GPU.'
                : `What the engine's own allocator holds on ${sc?.gpu?.requested ?? 'its card'} right now`
                + `${sc?.gpu?.allocated_mib != null ? ` — ${Math.round(sc.gpu.allocated_mib)} MiB of it live tensors, the rest cached blocks kept for reuse` : ''}.`
                + ` Measured: 3,128 MiB loaded, 770 MiB once released (a Release cannot return everything).`} />
            <Stat label="VRAM free" value={sc?.vram_free_mib != null ? `${sc.vram_free_mib} MiB` : '—'}
              sub={sc?.vram_floor_mib ? `floor ${sc.vram_floor_mib} MiB` : ''}
              hint="Free on the SAME card, as the sidecar's own driver sees it (~744 MiB lower than nvidia-smi reports — a constant WDDM accounting offset, erring on the safe side). The sidecar REFUSES to load if that would leave less than the floor: it holding VRAM once crashed Ollama's llama-server, so it now steps aside instead of squeezing the card." />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="gw-btn adm-btn-sm" disabled={!st.reachable || !loaded || busy !== null}
              onClick={() => setConfirm('release')}
              title={loaded ? 'Hand the GPU back now. The engine reloads on the next press.' : 'Nothing loaded — no VRAM to release.'}
              data-ui="voice-release">{busy === 'release' ? 'Releasing…' : 'Release GPU'}</button>
            <button className="gw-btn adm-btn-sm" disabled={!st.cache?.files || busy !== null}
              onClick={() => setConfirm('clear')}
              title={st.cache?.files ? 'Delete every rendered clip. They re-render on demand.' : 'The cache is already empty.'}
              data-ui="voice-clear">{busy === 'clear' ? 'Clearing…' : 'Clear clip cache'}</button>
            <button className="gw-btn adm-btn-sm" disabled={busy !== null}
              onClick={() => act('sweep')}
              title="Evict now: past the TTL first, then the least recently played until it fits the cap. Both limits are settings (chat.speechCacheMaxMB / chat.speechCacheTtlDays)."
              data-ui="voice-sweep">{busy === 'sweep' ? 'Sweeping…' : 'Sweep now'}</button>
            <button className="gw-btn adm-btn-sm" disabled={busy !== null}
              onClick={() => { const next = !showClips; setShowClips(next); if (next) void loadClips() }}
              data-ui="voice-clips-toggle">{showClips ? 'Hide clips' : `Show clips${st.cache?.files ? ` (${st.cache.files})` : ''}`}</button>
            <span className="text-[12px] text-muted">
              {st.sidecarUrl} · {sc?.idle_unload_s ? `auto-releases after ${sc.idle_unload_s}s idle` : 'stays resident'}
              {sc?.deterministic === false && ' · no seed, so a clip is cached once and replayed forever'}
            </span>
          </div>

          {sweptNote && <p className="mt-2 text-[12px] text-muted" data-ui="voice-swept">{sweptNote}</p>}

          {showClips && (
            <div className="mt-3 rounded-[8px] border border-line p-2.5" data-ui="voice-clips">
              {!clips ? <p className="m-0 text-muted">reading the pile…</p> : (
                <>
                  <p className="m-0 text-[12px] text-muted">
                    <strong className="text-ink">{clips.files}</strong> clips · <strong className="text-ink">{mib(clips.bytes)}</strong>
                    {clips.limits.maxMB ? ` of ${clips.limits.maxMB} MB` : ' (no cap)'}
                    {clips.limits.ttlDays ? ` · unplayed for ${clips.limits.ttlDays}d are deleted` : ' · no TTL'}
                    {clips.oldestPlayed && ` · least recently played ${ago(clips.oldestPlayed)}`}
                  </p>
                  {/* WHERE THE MEGABYTES WENT. Grouped by voice, because a voice change re-renders everything:
                      seeing 40 MB under a voice nobody uses any more is the actionable version of "81.7 MB". */}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                    {Object.entries(clips.byVoice).sort((a, b) => b[1].bytes - a[1].bytes).map(([v, n]) => (
                      <span key={v} className="text-muted">
                        <span className="text-ink">{mib(n.bytes)}</span> · {n.files} · {v}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 max-h-[280px] overflow-auto">
                    <table className="w-full border-collapse text-[12px]">
                      <thead>
                        <tr className="text-left text-muted">
                          <th className="border-b border-line py-1 pr-2 font-medium">last played</th>
                          <th className="border-b border-line py-1 pr-2 font-medium">size</th>
                          <th className="border-b border-line py-1 pr-2 font-medium">length</th>
                          <th className="border-b border-line py-1 font-medium">says</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clips.clips.map((c) => (
                          <tr key={c.hash}>
                            <td className="border-b border-line py-1 pr-2 tabular-nums whitespace-nowrap text-muted" title={c.lastPlayed}>{ago(c.lastPlayed)}</td>
                            <td className="border-b border-line py-1 pr-2 tabular-nums whitespace-nowrap">{mib(c.bytes)}</td>
                            <td className="border-b border-line py-1 pr-2 tabular-nums whitespace-nowrap text-muted">{c.seconds != null ? `${c.seconds.toFixed(1)}s` : '—'}</td>
                            {/* Clips rendered before the preview existed say so rather than looking empty. */}
                            <td className="border-b border-line py-1 text-muted">{c.text ?? <em>(recorded before previews)</em>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {clips.truncated > 0 && (
                    <p className="mt-1.5 mb-0 text-[12px] text-muted">…and {clips.truncated} more not shown.</p>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {confirm === 'release' && (
        <ConfirmModal
          title="Release the Voice's GPU memory?"
          confirmLabel="Release"
          busyLabel="Releasing…"
          danger={false}
          onClose={() => setConfirm(null)}
          onConfirm={() => act('release')}
          message={
            <>
              {/* ⚠ It used to say "Frees roughly 3.1 GB" — the engine's full resident size, which is not what
                  a Release gives back. Measured on OmniVoice/cuda:1: 3,128 MiB held, 2,358 MiB returned,
                  770 MiB retained until the sidecar process itself restarts. Now stated from the LIVE figure
                  rather than a constant, so it cannot drift away from the engine it describes again. */}
              <p>
                {heldMib != null
                  ? <>Hands back most of the <strong>{Math.round(heldMib)} MiB</strong> the engine is holding
                    {gpuWhere ? <> on <strong>{gpuWhere}</strong></> : null}.</>
                  : <>Hands the engine's GPU memory back immediately.</>}
              </p>
              <p className="text-muted">
                Not all of it: about 770 MiB stays until the sidecar process restarts, because the allocator
                can only return blocks with nothing live in them. Measured, not estimated.
              </p>
              <p className="text-muted">
                Recoverable: the engine reloads on the next 🔊 press, which costs about 2.5 seconds. Already
                rendered clips keep playing either way — they come from disk, not the GPU.
              </p>
            </>
          }
        />
      )}

      {confirm === 'clear' && (
        <ConfirmModal
          title={`Delete ${st?.cache?.files ?? 0} cached clips?`}
          confirmLabel="Clear cache"
          busyLabel="Clearing…"
          danger={false}
          onClose={() => setConfirm(null)}
          onConfirm={() => act('clear')}
          message={
            <>
              <p>Reclaims {st?.cache ? mib(st.cache.bytes) : '—'} from <code>{st?.cache?.dir}</code>.</p>
              <p className="text-muted">
                Safe: a spoken reply is a <em>derived rendering</em> — the text stays the record, so this
                costs re-render time and nothing else.
              </p>
              <p className="text-muted">
                One thing to know: none of these engines exposes a seed, so a re-render is a <em>different
                take</em>. A previously-spoken reply will come back in a slightly different reading of the
                same words.
              </p>
            </>
          }
        />
      )}
    </div>
  )
}
