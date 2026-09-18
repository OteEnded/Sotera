import { Fragment, useCallback, useEffect, useState } from 'react'
import { apiGet } from '../../lib/api'
import RefreshButton from '../../components/RefreshButton'
import { ui } from './ui'

// DREAM RUNS — read how she dreams.
//
// Ote, 2026-09-18: "add interface for root's console/memories to see log, so i can also read how sotera
// run dreaming/reflaction" · "Keep run observability separate from memory."
//
// ⛔⛔ THIS PANEL SHOWS WHAT THE DREAMING SUBSYSTEM *DID*, NEVER WHAT SOTERA *KNOWS*. Every source behind
// it is a `log_*` table; nothing here is read by recall, cognition or the composer. The one memory it
// shows is the memory a run *produced* — the outcome of an act, reached from the act, ⛔ not a memory read.
//
// ── TWO HONESTY RULES THIS PANEL OBEYS ────────────────────────────────────────────────────────────────
// 1. A RUN THAT KEPT NOTHING IS NOT A FAILURE. "retention and non-retention are both actions" — so
//    `completed · kept nothing` is rendered as a normal outcome, never as a warning colour.
// 2. AN INEXACT JOIN SAYS SO. `log_retention_decisions.revisit_id` is NOT populated on the live path, so
//    the decisions and tool calls under a run are matched by conversation + time window. The API returns
//    `decisionsExact`, and when it is false this panel says "matched by time" rather than implying a
//    foreign key. ⛔ A UI that hides the difference is worse than one that shows no link at all.

type RunMemory = {
  id: string; importance: number | null; author: string | null; writer: string | null; kind: string | null
  entity: string | null; attribute: string | null; live: boolean; accessCount: number | null
  lastAccess: string | null; excerpt: string
}
/**
 * ⭐⭐ THE RUNTIME (migration 054). ⛔ `termination` NEVER TRAVELS WITHOUT `terminationSource`.
 * `length`/`stop` are OUR arithmetic — `chat()` discards the provider's `done_reason` — so a badge that
 * printed the word alone would be showing a derived value in the costume of a provider fact.
 */
type Runtime = {
  numCtx: number | null; maxTokens: number | null
  promptTokens: number | null; completionTokens: number | null
  completionTokensTotal: number | null; rounds: number | null
  termination: string | null; terminationSource: 'derived' | 'provider' | 'loop' | null
  hitCeiling: boolean | null
}
type Run = {
  runtime?: Runtime
  id: string; rollingId: number; conversationId: string | null; trigger: string | null
  conversationTitle?: string | null; roomUsername?: string | null; roomDisplay?: string | null
  conversationArchived?: boolean
  requestedAt: string | null; startedAt: string | null; completedAt: string | null; durationMs: number | null
  outcome: string | null; reason: string | null; failure: string | null; blockedByDisclosure: boolean | null
  model: string | null; promptGeneration: number | null; toolGeneration: number | null
  dispatchGeneration: number | null; codeMtime: string | null
  fromRollingId: number | null; upToRollingId: number | null; messagesConsidered: number | null
  toolsUsed: string[]; toolsRefused: string[]; textChars: number; wroteMemoryId: string | null
  memory: RunMemory | null
}
type Decision = {
  id: string; at: string; state: string | null; why: string | null; kind: string | null; mine: boolean | null
  about: string | null; attribute: string | null; distinction: string | null
  memoryId: string | null; store: string | null; source: string | null; linkedByForeignKey: boolean
  // ⭐ HOW THIS ROW WAS FOUND. 'revisit_id' and 'act' are CORRELATED; 'time-window' is a guess.
  via?: 'revisit_id' | 'act' | 'time-window'
}
type ToolCall = {
  id: string; at: string; tool: string; ok: boolean | null; durationMs: number | null
  argKeys: string[]; argBytes: number | null; error: string | null
  via?: 'revisit_id' | 'time-window'
}
type Detail = {
  run: Run & { text: string | null }
  decisions: Decision[]; toolCalls: ToolCall[]
  memory: (RunMemory & { content: string; scope: string | null; embedded: boolean; createdAt: string }) | null
  decisionsExact: boolean; toolCallsExact?: boolean; note: string
}

const when = (s: string | null) => { if (!s) return '—'; try { return new Date(s).toLocaleString() } catch { return s } }
const clock = (s: string | null) => { if (!s) return '—'; try { return new Date(s).toLocaleTimeString() } catch { return s } }
const secs = (ms: number | null) => (ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`)

function Chip({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'ok' | 'warn' | 'accent' | 'danger' }) {
  const cls = tone === 'ok' ? 'border-[var(--ok-edge)] bg-[var(--ok-soft)] text-[var(--ok)]'
    : tone === 'warn' ? 'border-[var(--warn-edge)] bg-[var(--warn-soft)] text-[var(--warn)]'
      : tone === 'danger' ? 'border-line bg-panel text-danger'
        : tone === 'accent' ? 'border-[var(--edge)] bg-[var(--accent-soft)] text-[var(--accent-deep)]'
          : 'border-line text-muted'
  return <span className={`rounded-full border px-2 py-px text-[11px] font-medium whitespace-nowrap ${cls}`}>{children}</span>
}

/** One label/value pair. Quiet label, readable value — the Health panel's idiom. */
function Stat({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-[92px]" title={title}>
      <span className="text-[10px] uppercase tracking-[0.05em] text-muted">{label}</span>
      <span className="text-[13px] font-semibold tabular-nums">{value}</span>
    </div>
  )
}

/**
 * ⭐ THE OUTCOME LINE — and it is deliberately NOT a traffic light.
 * `completed · kept nothing` is an ordinary, correct result; colouring it amber would teach the reader
 * that a quiet dream is a broken one.
 */
function outcomeOf(r: Run): { label: string; tone: 'plain' | 'ok' | 'warn' | 'danger' } {
  if (r.failure) return { label: `failed: ${r.failure}`, tone: 'danger' }
  if (r.outcome && r.outcome !== 'completed') return { label: r.outcome, tone: 'warn' }
  if (r.wroteMemoryId) return { label: 'kept something', tone: 'ok' }
  return { label: 'kept nothing', tone: 'plain' }
}

/**
 * ⭐⭐ THE RUN DETAIL, RENDERED **INLINE UNDER ITS OWN ROW**.
 *
 * ⚠⚠ IT USED TO RENDER BELOW THE WHOLE TABLE, AND THAT WAS A REAL BUG, REPORTED BY OTE: *"what's this
 * button do? i clicked and it did nothing"*. With 40 runs listed, clicking the FIRST row opened a panel
 * roughly forty rows further down — off-screen, so the chevron looked dead.
 * ⭐ A ▸ ON A ROW PROMISES THE ROW EXPANDS. Anything else is the affordance lying about where the
 * answer will appear.
 */
function RunDetail({ detail, detailErr }: { detail: Detail | null; detailErr: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-panel p-3 flex flex-col gap-3">
      <div className="rounded-[10px] border border-line bg-panel p-3 flex flex-col gap-3">
        {detailErr && <div className="text-danger text-[13px]">{detailErr}</div>}
        {!detail && !detailErr && <div className="text-muted text-[13px]">Loading run…</div>}
        {detail && (
          <>
            {/* ⭐⭐ SOURCE FIRST. Ote: *"which room this from, which converstaion this from"* — before any
                statistic, say WHAT SHE READ. The rolling range is the exact slice, so a reader can go and
                look at the same messages she did. */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-[0.05em] text-muted">Source</span>
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Chip tone="plain">room: {detail.run.roomDisplay || detail.run.roomUsername || 'unknown'}</Chip>
                <span className="font-semibold">{detail.run.conversationTitle ?? 'untitled'}</span>
                {detail.run.conversationArchived && <Chip tone="warn">archived</Chip>}
                <span className="text-muted text-[11px] tabular-nums">
                  messages {detail.run.fromRollingId ?? '?'}–{detail.run.upToRollingId ?? '?'}
                </span>
                <code className="text-[11px] text-muted">{detail.run.conversationId ?? '—'}</code>
              </div>
            </div>

            {/* ── the run's own identity: what ran, on what, with which instrument ── */}
            <div className="flex flex-wrap gap-4">
              <Stat label="model" value={<span className="font-normal">{detail.run.model ?? '—'}</span>} />
              <Stat label="prompt gen" value={detail.run.promptGeneration ?? '—'} title="bumped whenever the prompt text changes" />
              <Stat label="tool gen" value={detail.run.toolGeneration ?? '—'} />
              <Stat label="messages" value={detail.run.messagesConsidered ?? '—'} title={`rolling ${detail.run.fromRollingId ?? '?'}–${detail.run.upToRollingId ?? '?'}`} />
              <Stat label="duration" value={secs(detail.run.durationMs)} />
              <Stat label="started" value={<span className="font-normal">{clock(detail.run.startedAt)}</span>} />
            </div>

            {/* ⭐⭐ 054 · THE RUNTIME. *"How much output does she actually use? How often does she hit the
                output ceiling?"* — answerable here instead of by replaying the run.
                ⚠️ Rows before 054 carry none of this and say so, rather than rendering a row of dashes that
                looks like zero. */}
            {detail.run.runtime && detail.run.runtime.numCtx != null ? (
              <div className="flex flex-wrap gap-4">
                <Stat label="input"
                  value={<span className="tabular-nums">{detail.run.runtime.promptTokens ?? '—'}<span className="text-muted font-normal"> / {detail.run.runtime.numCtx}</span></span>}
                  title="final round's prompt against the REQUESTED num_ctx — the adapter clamps to the model's trained max, so this is what we asked for, not what the runner opened" />
                <Stat label="output"
                  value={<span className="tabular-nums">{detail.run.runtime.completionTokens ?? '—'}<span className="text-muted font-normal"> / {detail.run.runtime.maxTokens}</span></span>}
                  title="final round's completion against reflectionMaxTokens" />
                <Stat label="output total"
                  value={<span className="tabular-nums">{detail.run.runtime.completionTokensTotal ?? '—'}</span>}
                  title="summed across every round — the cost question, which differs from the ceiling question as soon as she calls a tool" />
                <Stat label="rounds" value={detail.run.runtime.rounds ?? '—'} />
                {/* ⭐⭐⭐ THE PAIR, RENDERED AS A PAIR. */}
                <Stat label="ended"
                  value={detail.run.runtime.termination ? (
                    <span className="flex items-center gap-1.5">
                      <Chip tone={detail.run.runtime.hitCeiling ? 'warn' : 'plain'}>{detail.run.runtime.termination}</Chip>
                      <span className="text-[11px] text-muted font-normal">
                        {detail.run.runtime.terminationSource === 'derived' ? 'our arithmetic'
                          : detail.run.runtime.terminationSource === 'loop' ? 'our round cap'
                            : detail.run.runtime.terminationSource === 'provider' ? 'the provider said so' : ''}
                      </span>
                    </span>
                  ) : '—'}
                  title="length/stop are DERIVED from completion_tokens vs max_tokens — chat() discards the provider's own done_reason" />
              </div>
            ) : (
              <div className="text-[11px] text-muted italic">
                No runtime measurements — this run predates migration 054, which is a fact about the record
                rather than about the run.
              </div>
            )}

            {/* ── the lifecycle, in order ── */}
            <div className="flex flex-col gap-1.5">
              <div className="text-[11px] uppercase tracking-[0.05em] text-muted">What happened</div>
              {detail.toolCalls.length === 0 && detail.decisions.length === 0 && (
                <div className="text-[13px] text-muted">
                  She read it and reached for nothing. That is a complete answer, not a failure.
                </div>
              )}
              {detail.toolCalls.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="text-muted tabular-nums">{clock(c.at)}</span>
                  <Chip tone={c.ok ? 'ok' : 'danger'}>{c.tool}</Chip>
                  <span className="text-muted">{c.argKeys.join(', ') || 'no arguments'}</span>
                  <span className="text-muted tabular-nums">{secs(c.durationMs)}</span>
                  {c.error && <span className="text-danger">{c.error}</span>}
                  {c.via === 'time-window' && <span className="text-[11px] text-muted italic">matched by time</span>}
                </div>
              ))}
              {detail.decisions.map((d) => (
                <div key={d.id} className="flex flex-wrap items-start gap-2 text-[12px]">
                  <span className="text-muted tabular-nums">{clock(d.at)}</span>
                  <Chip tone={d.state === 'persisted' ? 'ok' : d.state === 'refused' ? 'warn' : 'plain'}>{d.state ?? 'decision'}</Chip>
                  {d.kind && <span className="text-muted">{d.kind}{d.mine === false ? ' · about them' : d.mine === true ? ' · hers' : ''}</span>}
                  {d.why && <span className="text-muted flex-1 min-w-[220px]">{d.why}</span>}
                  {d.via === 'time-window' && <span className="text-[11px] text-muted italic">matched by time</span>}
                </div>
              ))}
              {/* ⚠️⭐ THE JOIN SAYS SO **PER ROW** NOW. Since 054 most rows are correlated by a stored id,
                  so a blanket "matched by time" banner would slander the exact rows it was written to
                  qualify — and would say nothing about WHICH step was the guess. */}
              {[...detail.toolCalls, ...detail.decisions].some((x) => x.via === 'time-window') && (
                <div className="text-[11px] text-muted italic">
                  The steps marked <span className="not-italic">matched by time</span> were logged before
                  their run id existed — a step from an overlapping run could appear among those.
                </div>
              )}
            </div>

            {/* ── what she actually wrote, if anything ── */}
            {detail.memory && (
              <div className="flex flex-col gap-1">
                <div className="text-[11px] uppercase tracking-[0.05em] text-muted">What she kept</div>
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <Chip tone="ok">importance {detail.memory.importance ?? '—'}</Chip>
                  <Chip tone="plain">{detail.memory.author ?? '—'}</Chip>
                  <Chip tone="plain">{detail.memory.kind ?? '—'}</Chip>
                  {detail.memory.live ? <Chip tone="ok">live</Chip> : <Chip tone="warn">archived</Chip>}
                  <span className="text-muted">recalled {detail.memory.accessCount ?? 0}×</span>
                </div>
                <div className="text-[13px] whitespace-pre-wrap">{detail.memory.content}</div>
              </div>
            )}

            {/* ── her reflection, in her own words ── */}
            <details>
              <summary className="text-[11px] uppercase tracking-[0.05em] text-muted cursor-pointer">
                What she thought ({detail.run.textChars ?? 0} chars)
              </summary>
              <div className="mt-1.5 text-[13px] whitespace-pre-wrap text-muted max-h-[360px] overflow-y-auto">
                {detail.run.text || '—'}
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  )
}


export default function DreamRunsPanel() {
  const [open, setOpen] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])
  const [trigger, setTrigger] = useState('')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailErr, setDetailErr] = useState('')

  const load = useCallback(async () => {
    try {
      const qs = trigger ? `?trigger=${encodeURIComponent(trigger)}` : ''
      const r = (await apiGet(`/v1/admin/memories/dreams${qs}`)) as { runs: Run[] }
      setRuns(r.runs ?? []); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [trigger])

  useEffect(() => { if (open) void load() }, [open, load])

  const openRun = useCallback(async (id: string) => {
    if (selected === id) { setSelected(null); setDetail(null); return }
    setSelected(id); setDetail(null); setDetailErr('')
    try { setDetail((await apiGet(`/v1/admin/memories/dreams/${id}`)) as Detail) }
    catch (e) { setDetailErr(e instanceof Error ? e.message : String(e)) }
  }, [selected])

  const kept = runs.filter((r) => r.wroteMemoryId).length
  const cron = runs.filter((r) => r.trigger === 'cron').length

  return (
    <section className="dream-runs mb-4 rounded-xl border border-line bg-panel-strong overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 border-b border-line">
        <button className="gw-btn adm-btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? '▾' : '▸'}</button>
        <h3 className="m-0 text-[15px]">Dreaming</h3>
        <span className="text-[13px] text-muted">how she reflects, run by run</span>
        <span className="flex-1" />
        {open && <Chip tone="plain">{runs.length} shown</Chip>}
        {open && <Chip tone={kept ? 'ok' : 'plain'}>{kept} kept something</Chip>}
        {open && <Chip tone="plain">{cron} unprompted</Chip>}
        {open && <RefreshButton onRefresh={load} />}
      </header>

      {open && (
        <div className="px-3.5 py-3 flex flex-col gap-3">
          <p className="text-muted text-[12px] m-0">
            A <b>dream</b> is one reflection pass: she re-reads a quiet conversation and decides whether
            anything is worth carrying forward. <b>Kept nothing is a real outcome</b> — not every
            conversation leaves something behind. This is the run log, not her memory: nothing here is
            anything she can recall.
          </p>

          <div className={ui.formRow}>
            <div className={ui.field}>
              <label className={ui.fieldLabel} htmlFor="dream-trigger">Trigger</label>
              <select id="dream-trigger" className="gw-input" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                <option value="">all</option>
                <option value="cron">cron (unprompted)</option>
                <option value="manual">manual</option>
                <option value="check">check</option>
                <option value="legacy">legacy</option>
              </select>
            </div>
          </div>

          {error && <div className="text-danger text-[13px]">Dream runs unavailable: {error}</div>}

          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <colgroup>
                <col style={{ width: '17%' }} /><col style={{ width: '10%' }} /><col style={{ width: '9%' }} />
                <col style={{ width: '8%' }} /><col style={{ width: '17%' }} /><col style={{ width: '39%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className={ui.th}>When</th>
                  <th className={ui.th}>Trigger</th>
                  <th className={ui.th}>Read</th>
                  <th className={ui.th}>Took</th>
                  {/* ⭐ 054 · *"How much output does she actually use? How often does she hit the output
                      ceiling?"* — population questions, so they belong in the SCAN, not behind a click. */}
                  <th className={ui.th} title="final round's completion tokens against reflectionMaxTokens">Output</th>
                  <th className={ui.th}>Outcome</th>
                  <th className={ui.th}>What she kept</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 && (
                  <tr><td className={ui.empty} colSpan={7}>No dream runs yet.</td></tr>
                )}
                {runs.map((r, i) => {
                  const border = i === runs.length - 1 ? '' : ui.tdBorder
                  const o = outcomeOf(r)
                  const isOpen = selected === r.id
                  return (
                    <Fragment key={r.id}>
                    <tr className={isOpen ? 'bg-[var(--code-bg)]' : undefined}>
                      <td className={`${ui.td} ${border}`}>
                        <button className="gw-btn adm-btn-sm mr-1.5" onClick={() => void openRun(r.id)} aria-expanded={isOpen}>{isOpen ? '▾' : '▸'}</button>
                        <span className="text-[12px] text-muted">{when(r.completedAt ?? r.requestedAt)}</span>
                        {/* ⭐ WHAT SHE READ, NAMED. A run identified only by a timestamp cannot be traced
                            back to its conversation without a second query by hand. */}
                        <div className="text-[11px] text-muted truncate pl-[30px]"
                          title={`${r.conversationTitle ?? 'untitled'} · ${r.conversationId ?? ''}`}>
                          {r.roomUsername ? <span className="opacity-70">{r.roomUsername} · </span> : null}
                          {r.conversationTitle ?? 'untitled'}
                        </div>
                      </td>
                      <td className={`${ui.td} ${border}`}>
                        <Chip tone={r.trigger === 'cron' ? 'accent' : 'plain'}>{r.trigger ?? '—'}</Chip>
                      </td>
                      <td className={`${ui.td} ${border} tabular-nums text-[12px]`} title={`rolling ${r.fromRollingId ?? '?'}–${r.upToRollingId ?? '?'}`}>
                        {r.messagesConsidered ?? '—'} msg
                      </td>
                      <td className={`${ui.td} ${border} tabular-nums text-[12px]`}>{secs(r.durationMs)}</td>
                      <td className={`${ui.td} ${border} tabular-nums text-[12px]`}
                        title={r.runtime?.maxTokens
                          ? `${r.runtime.completionTokens ?? '?'} of ${r.runtime.maxTokens} on the final round`
                            + ` · ${r.runtime.completionTokensTotal ?? '?'} across ${r.runtime.rounds ?? '?'} round(s)`
                            + ` · ended ${r.runtime.termination ?? 'unrecorded'} (${r.runtime.terminationSource ?? 'no source'})`
                          : 'not recorded — this run predates migration 054'}>
                        {r.runtime?.completionTokens != null ? (
                          <span className={r.runtime.hitCeiling ? 'text-[var(--warn)]' : undefined}>
                            {r.runtime.completionTokens}
                            <span className="text-muted">/{r.runtime.maxTokens ?? '?'}</span>
                            {/* ⚠️ The ceiling is the one value worth a mark: it means her answer was CUT OFF. */}
                            {r.runtime.hitCeiling ? ' ⚠' : ''}
                          </span>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className={`${ui.td} ${border}`}><Chip tone={o.tone}>{o.label}</Chip></td>
                      <td className={`${ui.td} ${ui.tdClip} ${border} text-[12px]`} title={r.memory?.excerpt ?? ''}>
                        {r.memory
                          ? <span><Chip tone="ok">imp {r.memory.importance ?? '—'}</Chip> <span className="text-muted">{r.memory.excerpt}</span></span>
                          : <span className="text-muted">—</span>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td className={`${ui.td} ${border} p-0`} colSpan={7}>
                          <div className="px-3 pb-3">
                            <RunDetail detail={detail} detailErr={detailErr} />
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

        </div>
      )}
    </section>
  )
}
