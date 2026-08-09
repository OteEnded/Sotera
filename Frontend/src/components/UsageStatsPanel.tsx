import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
import { ui } from '../pages/admin/ui'

// Usage dashboard panel — totals, per-day activity, and token breakdowns per model /
// API key (/ user on the admin page). Reused by the admin Usage page (endpoint
// /v1/admin/usage/stats, withUsers) and each user's own view in the chat Options
// modal (/v1/me/usage/stats). Groundwork for per-user token limits: the same sums
// will meter quota windows.
type Agg = { requests: number; promptTokens: number; completionTokens: number; cachedTokens?: number; totalTokens: number }
type Stats = {
  totals: Agg
  perDay: ({ day: string } & Agg)[]
  perModel: ({ provider: string; model: string } & Agg)[]
  perKey: ({ apiKeyId: string | null; name: string; kind: string | null; owner: string | null } & Agg)[]
  perUser?: ({ username: string; roles: string | null } & Agg)[]
}

const RANGES = [
  { key: '7', label: '7d' },
  { key: '30', label: '30d' },
  { key: '90', label: '90d' },
  { key: 'all', label: 'All time' },
] as const
type RangeKey = typeof RANGES[number]['key']

// compact numbers: 1234 -> 1.2k, 4500000 -> 4.5M
const compact = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n)

export default function UsageStatsPanel({
  endpoint,
  showUsers = false,
  filters,
}: {
  endpoint: string
  showUsers?: boolean
  // extra query params (the page's applied filters) — the stats endpoint accepts the
  // same filters as the usage list. When the filters carry their own from/to, the
  // panel's quick-range chips step aside.
  filters?: Record<string, string>
}) {
  const [range, setRange] = useState<RangeKey>('30')
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const filtersKey = JSON.stringify(filters ?? {})
  const filterHasWindow = Boolean(filters?.from || filters?.to)

  const load = useCallback(async (r: RangeKey) => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      for (const [k, v] of Object.entries(JSON.parse(filtersKey) as Record<string, string>)) {
        if (v) params.set(k, v)
      }
      if (!params.has('from') && !params.has('to') && r !== 'all') {
        params.set('from', new Date(Date.now() - Number(r) * 86400000).toISOString())
      }
      const qs = params.toString()
      setStats(await apiGet(`${endpoint}${qs ? `?${qs}` : ''}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [endpoint, filtersKey])
  useEffect(() => { void load(range) }, [load, range])

  const maxDay = Math.max(1, ...(stats?.perDay ?? []).map((d) => d.totalTokens))
  const breakdownTable = (title: string, rows: ({ label: string; sub?: string } & Agg)[]) => (
    <div className="min-w-0 flex-1 basis-[280px]">
      <div className={`${ui.fieldLabel} mb-1 font-bold`}>{title}</div>
      {rows.length === 0 ? <p className="adm-dim text-[12px] m-0">No data in this window.</p> : (
        <div className="border border-line rounded-lg overflow-hidden">
          {rows.slice(0, 8).map((r, i) => (
            <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 text-[12.5px] ${i > 0 ? 'border-t border-line/60' : ''}`}>
              <span className="min-w-0 flex-1 truncate" title={r.label}>{r.label}{r.sub && <span className="adm-dim"> · {r.sub}</span>}</span>
              <span className="adm-dim whitespace-nowrap">{compact(r.requests)} req</span>
              <b className="whitespace-nowrap" title={`${r.promptTokens.toLocaleString()} in + ${r.completionTokens.toLocaleString()} out`}>{compact(r.totalTokens)} tok</b>
            </div>
          ))}
          {rows.length > 8 && <div className="adm-dim text-[11px] px-2.5 py-1 border-t border-line/60">+ {rows.length - 8} more</div>}
        </div>
      )}
    </div>
  )

  return (
    <div data-ui="usage-stats" className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {filterHasWindow ? (
          <span className="adm-dim text-[12px]">Date window comes from the filters above.</span>
        ) : (
          RANGES.map((r) => (
            <button
              key={r.key}
              className={`gw-btn adm-btn-sm ${range === r.key ? 'gw-btn-primary' : ''}`}
              onClick={() => setRange(r.key)}
            >{r.label}</button>
          ))
        )}
        {loading && <span className="adm-dim text-[12px]">Loading…</span>}
        {error && <span className="gw-meta gw-error">{error}</span>}
      </div>

      {stats && (
        <>
          {/* headline numbers */}
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Requests', value: stats.totals.requests },
              { label: 'Prompt tokens', value: stats.totals.promptTokens },
              { label: 'Completion tokens', value: stats.totals.completionTokens },
              { label: 'Total tokens', value: stats.totals.totalTokens },
              // provider-reported cache hits (subset of prompt tokens billed at a discount) — only shown once any exist
              ...((stats.totals.cachedTokens ?? 0) > 0 ? [{ label: 'Cached (prompt)', value: stats.totals.cachedTokens as number }] : []),
            ].map((c) => (
              <div key={c.label} className="flex-1 basis-[130px] border border-line rounded-xl px-3 py-2.5 bg-[var(--lift)]">
                <div className="adm-dim text-[11px] uppercase tracking-wider">{c.label}</div>
                <div className="text-[22px] font-extrabold leading-tight" title={c.value.toLocaleString()}>{compact(c.value)}</div>
              </div>
            ))}
          </div>

          {/* activity strip (tokens per day) — each bar labeled with its day; labels thin
              out to every Nth bar when the window gets dense (tooltips stay exact) */}
          {stats.perDay.length > 1 && (() => {
            const labelStep = Math.ceil(stats.perDay.length / 20)
            return (
              <div>
                <div className={`${ui.fieldLabel} mb-1 font-bold`}>Tokens per day</div>
                <div className="flex gap-[2px] border border-line rounded-lg p-1.5 bg-[var(--lift)]">
                  {stats.perDay.map((d, i) => (
                    <div
                      key={d.day}
                      className="flex-1 min-w-[6px] flex flex-col items-center gap-0.5"
                      title={`${d.day} — ${d.totalTokens.toLocaleString()} tokens · ${d.requests} request${d.requests === 1 ? '' : 's'}`}
                    >
                      <div className="w-full h-[56px] flex items-end">
                        <div
                          className="w-full rounded-sm"
                          style={{ height: `${Math.max(5, Math.round((d.totalTokens / maxDay) * 100))}%`, background: 'var(--accent)', opacity: 0.8 }}
                        />
                      </div>
                      <span className="h-[11px] text-[9px] adm-dim leading-none whitespace-nowrap overflow-visible">
                        {i % labelStep === 0 ? d.day.slice(5) : ' '}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* breakdowns */}
          <div className="flex flex-wrap gap-4">
            {/* the stored model ref usually already carries the provider prefix */}
            {breakdownTable('By model', stats.perModel.map((m) => ({ label: m.model?.includes('/') ? m.model : `${m.provider}/${m.model}`, ...m })))}
            {breakdownTable('By API key', stats.perKey.map((k) => ({
              label: k.name, sub: [k.kind === 'chat' ? '💬 chat' : null, k.owner].filter(Boolean).join(' · ') || undefined, ...k,
            })))}
            {showUsers && stats.perUser && breakdownTable('By user', stats.perUser.map((u) => ({ label: u.username, sub: u.roles ?? undefined, ...u })))}
          </div>
        </>
      )}
    </div>
  )
}
