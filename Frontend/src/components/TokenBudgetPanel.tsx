import { useCallback, useEffect, useState } from 'react'
import { fmtDay, fmtTokens, getMyBudget, type TokenBudget } from '../lib/limitsApi'

// The user's own token budget — today's spend vs the daily cap, plus the active
// boosts (feedback rewards / manual grants) and when each expires. Rendered at the
// top of the Options modal's Usage section.

const TIER_LABEL: Record<number, string> = { 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' }

const MAX_BOOSTS_SHOWN = 3

export default function TokenBudgetPanel() {
  const [budget, setBudget] = useState<TokenBudget | null>(null)
  const [showAllBoosts, setShowAllBoosts] = useState(false)

  const load = useCallback(() => getMyBudget().then(setBudget).catch(() => { /* panel is best-effort */ }), [])
  useEffect(() => { void load() }, [load])

  if (!budget) return null
  if (!budget.limited) {
    return (
      <div className="rounded-lg border border-line bg-panel-strong px-3 py-2 text-[13px]" data-ui="budget-panel">
        <span className="font-semibold">Token budget:</span> <span className="adm-dim">no limits apply to your account.</span>
      </div>
    )
  }

  const capped = (budget.effectiveDaily ?? 0) > 0
  const used = budget.usedToday ?? 0
  const cap = budget.effectiveDaily ?? 0
  const pct = capped ? Math.min(100, Math.round((used / cap) * 100)) : 0
  const barColor = budget.overDaily ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className="rounded-lg border border-line bg-panel-strong px-3 py-2.5 flex flex-col gap-1.5" data-ui="budget-panel">
      <div className="flex items-center gap-2 flex-wrap text-[13px]">
        <span className="font-semibold">Today's token budget</span>
        {capped ? (
          <span className="adm-dim" data-ui="budget-usage">
            {fmtTokens(used)} of {fmtTokens(cap)} used
            {(budget.boostPerDay ?? 0) > 0 && <> · base {fmtTokens(budget.baseDaily ?? 0)} + boosts {fmtTokens(budget.boostPerDay ?? 0)}</>}
          </span>
        ) : (
          <span className="adm-dim">{fmtTokens(used)} used — no daily cap</span>
        )}
        <button className="gw-btn adm-btn-sm ml-auto" title="Refresh" onClick={() => void load()}>↻</button>
      </div>
      {capped && (
        <div className="h-2 rounded-full bg-[var(--code-bg)] overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {budget.overDaily && (
        <div className="text-[12px] text-rose-700">Daily limit reached — it resets at midnight. Resolved feedback earns boost rewards that raise it.</div>
      )}
      {(budget.monthlyCap ?? 0) > 0 && (
        <div className="adm-dim text-[12px]">
          Month: {fmtTokens(budget.usedMonth ?? 0)} of {fmtTokens(budget.monthlyCap ?? 0)}
          {budget.overMonthly && <span className="text-rose-700"> — monthly limit reached</span>}
        </div>
      )}
      {(budget.boosts?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1" data-ui="budget-boosts">
          {(showAllBoosts ? budget.boosts! : budget.boosts!.slice(0, MAX_BOOSTS_SHOWN)).map((b) => (
            <div key={b.id} className="flex items-center gap-2 text-[12px]">
              <span className="rounded-full border border-amber-200 bg-amber-100 text-amber-800 px-2 py-px font-medium">
                🎁 {b.source === 'feedback' ? `${TIER_LABEL[b.tier ?? 0] ?? 'Reward'}` : 'Boost'} +{fmtTokens(b.tokensPerDay)}/day
              </span>
              <span className="adm-dim">until {fmtDay(b.expiresAt)}</span>
            </div>
          ))}
          {budget.boosts!.length > MAX_BOOSTS_SHOWN && (
            <button
              className="self-start text-[12px] text-accent hover:underline"
              data-ui="budget-boosts-toggle"
              onClick={() => setShowAllBoosts((v) => !v)}
            >
              {showAllBoosts ? 'Show less' : `Show ${budget.boosts!.length - MAX_BOOSTS_SHOWN} more`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
