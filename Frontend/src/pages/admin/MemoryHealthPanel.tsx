import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../lib/api'
import RefreshButton from '../../components/RefreshButton'
import { ui } from './ui'

// MEMORY HEALTH — "is the memory system healthy?" at a glance.
//
// TWO RULES THIS PANEL EXISTS TO OBEY (both learned the hard way, see Reference architecture principle #14):
//
// 1. WINDOW ≠ DURABLE. The resolver/capture counters are PROCESS-LOCAL and reset on every restart, while slots
//    and learned aliases live in the database. Blurring them would make a reboot read as an improvement —
//    counters at zero look exactly like "ambiguity eliminated". So they are separate blocks, and the window
//    block always states its own span (uptime + startedAt).
// 2. NO DATA IS NOT HEALTH. With zero eligible turns the verdict says "no data yet", never a green light. A
//    silent zero is not evidence of absence.

type Band = { min: number; max: number; tie: number }
type Config = {
  grayZoneMode: string; band: Band; resolverModel: string; resolverDevice: string; resolverKeepAlive: string
  resolverTemperature: number; extractModel: string; extractEnabled: boolean; extractTemperature: number
  reflectMode: string; embeddingModel: string; embeddingDevice: string
}
type Resolver = {
  total_resolutions: number; cosine_hits: number; alias_hits: number; lexical_hits: number; misses: number
  gray_zone_hits: number; llm_calls: number; llm_errors: number; accepted_same: number; accepted_different: number
  cache_promotions: number; promoted_alias_reuse: number
  hit_rate: number; alias_share: number; gray_zone_rate: number; same_verdict_rate: number
  promotion_reuse_rate: number; avg_latency_ms: number; avg_llm_ms: number; llm_share_of_latency: number
}
type Capture = {
  eligible_turns: number; model_wrote: number; fallback_ran: number; fallback_facts: number
  fallback_zero: number; extract_errors: number; auto_ran: number
  model_write_rate: number; fallback_share: number; fallback_barren_rate: number; facts_per_fallback: number
}
type Promotion = { phrase: string; slot: string; by: string; confidence: number | null; at: string }
type Durable = {
  slots: number; aliases: number; promotedAliases: number; aliasesByProvenance: Record<string, number>
  recentPromotions: Promotion[]; liveFacts: number; liveCards: number; liveNotes: number; liveIdentity: number
  blankRepliesLast7d: number | null
}
type Health = {
  config: Config
  window: { startedAt: string; uptimeMinutes: number; resolver: Resolver; capture: Capture }
  durable: Durable
}

const pct = (n: number) => `${Math.round(n * 100)}%`
const when = (s: string) => { try { return new Date(s).toLocaleString() } catch { return s } }
const uptime = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`)

/** One label/value pair. `tone` colours only the VALUE — the label stays quiet. */
function Stat({ label, value, tone = 'plain', hint }: { label: string; value: string | number; tone?: 'plain' | 'ok' | 'warn' | 'danger' | 'accent'; hint?: string }) {
  const toneClass = tone === 'ok' ? 'text-[var(--ok)]' : tone === 'warn' ? 'text-[var(--warn)]'
    : tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-[var(--accent)]' : ''
  return (
    <div className="flex flex-col gap-0.5 min-w-[104px]" title={hint}>
      <span className="text-[10px] uppercase tracking-[0.05em] text-muted">{label}</span>
      <span className={`text-[15px] font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  )
}

function Chip({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'ok' | 'warn' | 'accent' }) {
  const cls = tone === 'ok' ? 'border-[var(--ok-edge)] bg-[var(--ok-soft)] text-[var(--ok)]'
    : tone === 'warn' ? 'border-[var(--warn-edge)] bg-[var(--warn-soft)] text-[var(--warn)]'
      // `--edge` is the themed accent-tinted border (light + dark). NOT `--accent-edge`, which is undefined —
      // referencing it makes border-color invalid, so the border silently falls back to currentColor.
      : tone === 'accent' ? 'border-[var(--edge)] bg-[var(--accent-soft)] text-[var(--accent-deep)]'
        : 'border-line text-muted'
  return <span className={`rounded-full border px-2 py-px text-[11px] font-medium whitespace-nowrap ${cls}`}>{children}</span>
}

/** Concerns are DERIVED and always shown with their reason — never a bare traffic light. */
function verdict(h: Health): { label: string; tone: 'ok' | 'warn' | 'danger' | 'plain'; reasons: string[] } {
  const { resolver, capture } = h.window
  const reasons: string[] = []
  if (resolver.llm_errors > 0) reasons.push(`${resolver.llm_errors} adjudicator call(s) failed`)
  if (capture.extract_errors > 0) reasons.push(`${capture.extract_errors} extraction error(s)`)
  if (capture.fallback_ran >= 3 && capture.fallback_barren_rate >= 0.5) reasons.push(`fallback captured nothing on ${pct(capture.fallback_barren_rate)} of runs`)
  if (h.durable.blankRepliesLast7d && h.durable.blankRepliesLast7d > 0) reasons.push(`${h.durable.blankRepliesLast7d} blank repl(ies) in 7d`)
  if (h.config.grayZoneMode === 'off') reasons.push('gray zone is OFF — ambiguity is never adjudicated')
  if (h.config.grayZoneMode === 'shadow') reasons.push('gray zone is SHADOW — it adjudicates but never learns, so promotions stay at 0')
  if (!h.config.extractEnabled) reasons.push('fact extraction is disabled')

  // An empty WINDOW is not the same as an empty SYSTEM. Saying "no data yet" while the durable block shows
  // learned aliases would imply memory has never worked — the mirror image of letting a restart read as an
  // improvement. So the two cases get different labels.
  const windowIdle = resolver.total_resolutions === 0 && capture.eligible_turns === 0
  const everRan = h.durable.aliases > 0 || h.durable.slots > 0 || h.durable.liveFacts > 0
  if (windowIdle) {
    return everRan
      ? { label: 'Idle since restart', tone: 'plain', reasons: [`No memory activity in this process yet (up ${uptime(h.window.uptimeMinutes)}). The durable block below is unaffected — it is the history.`, ...reasons] }
      : { label: 'No data yet', tone: 'plain', reasons: ['Nothing has exercised memory and nothing is stored — an empty window is not a clean bill of health.', ...reasons] }
  }
  if (reasons.some((r) => /failed|error/.test(r))) return { label: 'Needs attention', tone: 'danger', reasons }
  if (reasons.length) return { label: 'Working, with notes', tone: 'warn', reasons }
  return { label: 'Healthy', tone: 'ok', reasons: [] }
}

export default function MemoryHealthPanel() {
  const [h, setH] = useState<Health | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(false)

  // Same rule as MemoriesPage: no setState before the first await, so an effect can never trigger a
  // cascading re-render. Clearing a stale error happens on success, with the data.
  const load = useCallback(async () => {
    try { setH(await apiGet('/v1/admin/memories/health')); setError('') }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }, [])
  useEffect(() => { load() }, [load])

  const resetWindow = async () => {
    setBusy(true)
    try { await apiPost('/v1/admin/memories/resolver-telemetry/reset', {}); await load() }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setBusy(false) }
  }

  if (error) return <div className="text-danger text-[13px] mb-3 mem-health-error">Memory health unavailable: {error}</div>
  if (!h) return <div className="text-muted text-[13px] mb-3">Loading memory health…</div>

  const { config, window: w, durable } = h
  const v = verdict(h)
  const vTone = v.tone === 'ok' ? 'text-[var(--ok)]' : v.tone === 'warn' ? 'text-[var(--warn)]' : v.tone === 'danger' ? 'text-danger' : 'text-muted'

  return (
    <section className="mem-health mb-4 rounded-xl border border-line bg-panel-strong overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 border-b border-line">
        <button className="gw-btn adm-btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? '▾' : '▸'}</button>
        <h3 className="m-0 text-[15px]">Health</h3>
        <span className={`text-[13px] font-semibold ${vTone}`}>{v.label}</span>
        <span className="flex-1" />
        <Chip tone={config.grayZoneMode === 'on' ? 'ok' : 'warn'}>gray zone: {config.grayZoneMode}</Chip>
        <RefreshButton onRefresh={load} />
      </header>

      {open && (
        <div className="px-3.5 py-3 flex flex-col gap-4">
          {v.reasons.length > 0 && (
            <ul className="m-0 pl-4 flex flex-col gap-0.5 text-[12px] text-muted">
              {v.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}

          {/* CONFIG — what the subsystem is configured to be right now. */}
          <div>
            <div className={ui.groupHead}>Configuration</div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <Chip tone="accent">resolver: {config.resolverModel}</Chip>
              <Chip>{config.resolverDevice} · keep_alive {config.resolverKeepAlive} · temp {config.resolverTemperature}</Chip>
              <Chip>band {config.band.min}–{config.band.max}</Chip>
              <Chip tone={config.extractEnabled ? 'plain' : 'warn'}>extract: {config.extractModel} · temp {config.extractTemperature}{config.extractEnabled ? '' : ' · DISABLED'}</Chip>
              <Chip>embed: {config.embeddingModel} · {config.embeddingDevice}</Chip>
              <Chip tone={config.reflectMode === 'on' ? 'ok' : 'plain'}>reflect: {config.reflectMode}</Chip>
            </div>
            <p className="text-[11px] text-muted mt-1.5 mb-0">
              Aux models run on <b>cpu</b> deliberately: measured on this box, a GPU-placed aux model does not fit
              beside the chat model, so Ollama evicts it and the next user turn pays the reload. Temperature 0 is
              pinned, not configurable — these outputs become slot identities, and a sampled classifier writes
              permanent aliases from coin flips.
            </p>
          </div>

          {/* DURABLE — survives restarts. Deliberately BEFORE the window block, because it is the trustworthy half. */}
          <div>
            <div className={ui.groupHead}>Durable — from the database, survives restarts</div>
            <div className="flex flex-wrap gap-x-6 gap-y-2.5 mt-2">
              <Stat label="Slots" value={durable.slots} hint="Long-lived concept identities" />
              <Stat label="Learned aliases" value={durable.aliases} tone={durable.aliases > 0 ? 'accent' : 'plain'} hint="Phrasings the resolver has learned map to a slot" />
              <Stat label="Promoted by gray zone" value={durable.promotedAliases} tone={durable.promotedAliases > 0 ? 'ok' : 'plain'} hint="Aliases bought with an adjudication — each one makes future writes free" />
              <Stat label="Live facts" value={durable.liveFacts} />
              <Stat label="Cards" value={durable.liveCards} />
              <Stat label="Notes" value={durable.liveNotes} />
              <Stat label="Identity" value={durable.liveIdentity} />
              <Stat
                label="Blank replies 7d"
                value={durable.blankRepliesLast7d === null ? 'n/a' : durable.blankRepliesLast7d}
                tone={durable.blankRepliesLast7d ? 'warn' : 'plain'}
                hint={durable.blankRepliesLast7d === null ? 'Not measurable on this database' : 'Clean finishes that produced no content'}
              />
            </div>
          </div>

          {/* WINDOW — process-local. Its span is stated so a restart can never read as an improvement. */}
          <div>
            <div className={ui.groupHead}>
              Since restart — process-local counters · {uptime(w.uptimeMinutes)} · started {when(w.startedAt)}
            </div>
            <p className="text-[11px] text-muted mt-1 mb-2">
              These reset when the server restarts. A drop to zero means a restart, not an improvement — the
              durable block above is what answers multi-week questions.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2.5">
              <Stat label="Resolutions" value={w.resolver.total_resolutions} />
              <Stat label="Hit rate" value={pct(w.resolver.hit_rate)} hint="Resolved to an existing slot" />
              <Stat label="Alias share" value={pct(w.resolver.alias_share)} tone={w.resolver.alias_share > 0 ? 'ok' : 'plain'} hint="Share resolved by the CHEAP learned-alias path" />
              <Stat label="Gray zone rate" value={pct(w.resolver.gray_zone_rate)} hint="Misses landing in the ambiguous band" />
              <Stat label="Adjudications" value={w.resolver.llm_calls} hint="Aux LLM calls actually made" />
              <Stat label="Adjudicator errors" value={w.resolver.llm_errors} tone={w.resolver.llm_errors ? 'danger' : 'plain'} />
              <Stat label="Promotion reuse" value={pct(w.resolver.promotion_reuse_rate)} tone={w.resolver.promotion_reuse_rate > 0 ? 'ok' : 'plain'} hint="Does a learned alias actually get reused? The compounding metric." />
              <Stat label="Avg adjudication" value={`${w.resolver.avg_latency_ms}ms`} hint={`aux inference ${w.resolver.avg_llm_ms}ms of it`} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2.5 mt-3 pt-3 border-t border-line">
              <Stat label="Memory turns" value={w.capture.eligible_turns} hint="Turns where memory was on and the model held write tools" />
              {/* Deliberately UNTONED: colouring this green would imply higher-is-better, but steering is soft
                  by design and there is no target rate. The tooltip carries the meaning instead. */}
              <Stat label="Model wrote" value={pct(w.capture.model_write_rate)} hint="How often the model chose to save when it could. Low is NOT a defect — steering is soft by design; the fallback covers the rest." />
              <Stat label="Fallback ran" value={w.capture.fallback_ran} hint="The model wrote nothing, so the safety net ran" />
              <Stat label="Fallback barren" value={pct(w.capture.fallback_barren_rate)} tone={w.capture.fallback_ran >= 3 && w.capture.fallback_barren_rate >= 0.5 ? 'warn' : 'plain'} hint="Fallback ran and captured NOTHING — the failure that used to be invisible" />
              <Stat label="Facts / fallback" value={w.capture.facts_per_fallback} />
              <Stat label="Extract errors" value={w.capture.extract_errors} tone={w.capture.extract_errors ? 'danger' : 'plain'} />
              <Stat label="Auto path" value={w.capture.auto_ran} hint="Model had no write tools at all (not a fallback)" />
            </div>
            <div className="mt-2.5">
              <button className="gw-btn adm-btn-sm" onClick={resetWindow} disabled={busy} title="Start a fresh measurement window (e.g. before a soak). Durable data is untouched.">
                {busy ? 'Resetting…' : 'Reset window'}
              </button>
            </div>
          </div>

          {/* RECENT PROMOTIONS — the spot-audit surface. In 'on' mode a wrong verdict writes a PERMANENT alias,
              so the mitigation is auditability, not perfection: every promotion is visible with its confidence. */}
          <div>
            <div className={ui.groupHead}>Recent alias promotions — spot-audit these</div>
            <p className="text-[11px] text-muted mt-1 mb-0">
              In <b>on</b> mode a SAME verdict both merges the concept and records a permanent alias. A wrong one
              corrupts a slot, so the safeguard is that every promotion is visible with its provenance and score.
            </p>
            {durable.recentPromotions.length === 0 ? (
              <p className="text-[12px] text-muted mt-2 mb-0">No aliases learned yet.</p>
            ) : (
              <div className={ui.tableWrap}>
                <table className={`${ui.table} mem-health-promotions`}>
                  <colgroup><col /><col /><col className="w-[104px]" /><col className="w-[92px]" /><col className="w-[152px]" /></colgroup>
                  <thead>
                    <tr>
                      <th className={ui.th}>Learned phrase</th><th className={ui.th}>Slot</th>
                      <th className={ui.th}>By</th><th className={ui.th}>Confidence</th><th className={ui.th}>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {durable.recentPromotions.map((p, i) => {
                      const last = i === durable.recentPromotions.length - 1
                      const border = last ? '' : ui.tdBorder
                      return (
                        <tr key={`${p.slot}-${p.phrase}-${p.at}`}>
                          <td className={`${ui.td} ${ui.tdClip} ${border}`} title={p.phrase}>{p.phrase}</td>
                          <td className={`${ui.td} ${ui.tdClip} ${border}`} title={p.slot}>{p.slot}</td>
                          <td className={`${ui.td} ${border}`}>
                            <Chip tone={p.by === 'gray-zone' ? 'accent' : 'plain'}>{p.by}</Chip>
                          </td>
                          <td className={`${ui.td} ${border} tabular-nums`}>{p.confidence === null ? '—' : p.confidence.toFixed(4)}</td>
                          <td className={`${ui.td} ${border} text-muted text-[12px]`}>{when(p.at)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
