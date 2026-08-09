import { useCallback, useEffect, useState } from 'react'
import ConfirmModal from '../../components/ConfirmModal'
import { fmtTokens, getUserLimits, grantUserBoost, putUserLimits, revokeGrant, type LimitsOverride, type TokenBoost, type TokenBudget } from '../../lib/limitsApi'
import { ui } from './ui'
import { dismissOnBackdrop } from '../../lib/overlay'

// Per-user token limits (console Users page → ⛽ Limits). Shows the live budget
// (today's spend vs the effective cap), the per-user override (daily/monthly/unlimited),
// and every boost grant with revoke. Writes on admin accounts are root-only server-side.

const fmtWhen = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' })

export default function UserLimitsModal({ userId, username, onClose }: { userId: string; username: string; onClose: () => void }) {
  const [budget, setBudget] = useState<TokenBudget | null>(null)
  const [grants, setGrants] = useState<TokenBoost[]>([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  // override draft ('' = platform default)
  const [daily, setDaily] = useState('')
  const [monthly, setMonthly] = useState('')
  const [unlimited, setUnlimited] = useState(false)
  const [note, setNote] = useState('')

  // manual grant draft
  const [grantTokens, setGrantTokens] = useState('')
  const [grantNote, setGrantNote] = useState('')
  const [revoking, setRevoking] = useState<TokenBoost | null>(null)

  const load = useCallback(() => getUserLimits(userId)
    .then((r) => {
      setBudget(r.budget)
      setGrants(r.grants || [])
      const o: LimitsOverride | null = r.override
      setDaily(o?.dailyTokens != null ? String(o.dailyTokens) : '')
      setMonthly(o?.monthlyTokens != null ? String(o.monthlyTokens) : '')
      setUnlimited(Boolean(o?.unlimited))
      setNote(o?.note || '')
    })
    .catch((e) => setError(e instanceof Error ? e.message : String(e))), [userId])
  useEffect(() => { void load() }, [load])

  const saveOverride = async () => {
    setError(''); setMsg(''); setBusy(true)
    try {
      const toInt = (s: string) => {
        if (!s.trim()) return null
        const n = Math.floor(Number(s))
        if (!Number.isFinite(n) || n < 0) throw new Error('Limits must be 0 (uncapped) or a positive token count')
        return n
      }
      await putUserLimits(userId, { dailyTokens: toInt(daily), monthlyTokens: toInt(monthly), unlimited, note: note.trim() || null })
      setMsg('Saved — applies to their next request.')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const addGrant = async () => {
    setError(''); setMsg(''); setBusy(true)
    try {
      const n = Math.floor(Number(grantTokens))
      if (!Number.isFinite(n) || n < 1) throw new Error('Grant must be a positive token count per day')
      await grantUserBoost(userId, { tokensPerDay: n, ...(grantNote.trim() ? { note: grantNote.trim() } : {}) })
      setGrantTokens(''); setGrantNote('')
      setMsg('Boost granted — active for one month from now.')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const capped = (budget?.effectiveDaily ?? 0) > 0
  const pct = budget?.limited && capped ? Math.min(100, Math.round(((budget.usedToday ?? 0) / (budget.effectiveDaily || 1)) * 100)) : 0

  return (
    <div className={ui.modalOverlay} {...dismissOnBackdrop(onClose)}>
      <div className={ui.modalCard} style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()} data-ui="limits-modal">
        <div className={ui.modalHead}>
          <h3 className={ui.modalTitle}>⛽ Token limits — {username}</h3>
          <button className="gw-btn adm-btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* live budget */}
        {budget && (
          <div className="rounded-lg border border-line bg-panel-strong px-3 py-2.5 flex flex-col gap-1.5" data-ui="limits-budget">
            {!budget.limited ? (
              <div className="text-[13px]"><b>Not metered</b> <span className="adm-dim">— {budget.unlimited ? 'this account is exempt (unlimited)' : 'limits are disabled platform-wide or this account is root'}.</span></div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap text-[13px]">
                  <b>Today</b>
                  {capped ? (
                    <span className="adm-dim">
                      {fmtTokens(budget.usedToday ?? 0)} of {fmtTokens(budget.effectiveDaily ?? 0)}
                      {' '}(base {fmtTokens(budget.baseDaily ?? 0)}{(budget.boostPerDay ?? 0) > 0 ? ` + boosts ${fmtTokens(budget.boostPerDay ?? 0)}` : ''})
                    </span>
                  ) : <span className="adm-dim">{fmtTokens(budget.usedToday ?? 0)} used — no daily cap</span>}
                  {budget.overDaily && <b className="text-rose-700">over limit</b>}
                </div>
                {capped && (
                  <div className="h-2 rounded-full bg-[var(--code-bg)] overflow-hidden">
                    <div className={`h-full rounded-full ${budget.overDaily ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
                {(budget.monthlyCap ?? 0) > 0 && (
                  <div className="adm-dim text-[12px]">Month: {fmtTokens(budget.usedMonth ?? 0)} of {fmtTokens(budget.monthlyCap ?? 0)}{budget.overMonthly && <b className="text-rose-700"> — over</b>}</div>
                )}
              </>
            )}
          </div>
        )}

        {/* override */}
        <div className={`${ui.fieldLabel} font-bold mt-1`}>Override — blank = platform default, 0 = uncapped</div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Tokens per day</span>
            <input className="gw-input" value={daily} onChange={(e) => setDaily(e.target.value)} placeholder="(platform default)" autoComplete="off" inputMode="numeric" />
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Tokens per month</span>
            <input className="gw-input" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="(platform default)" autoComplete="off" inputMode="numeric" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="gw-check" style={{ whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
            <span>Unlimited (never metered)</span>
          </label>
          <input className="gw-input flex-1 min-w-[160px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (why)" maxLength={300} autoComplete="off" />
          <button className="gw-btn gw-btn-primary" disabled={busy} onClick={() => void saveOverride()}>Save</button>
        </div>

        {/* manual boost */}
        <div className={`${ui.fieldLabel} font-bold mt-2`}>Grant a boost — +N tokens/day for one month (stacks)</div>
        <div className="flex flex-wrap items-center gap-2" data-ui="grant-form">
          <input className="gw-input !w-40" value={grantTokens} onChange={(e) => setGrantTokens(e.target.value)} placeholder="tokens / day" autoComplete="off" inputMode="numeric" />
          <input className="gw-input flex-1 min-w-[160px]" value={grantNote} onChange={(e) => setGrantNote(e.target.value)} placeholder="note (optional)" maxLength={300} autoComplete="off" />
          <button className="gw-btn" disabled={busy || !grantTokens.trim()} onClick={() => void addGrant()}>+ Grant</button>
        </div>

        {/* grants list */}
        <div className={`${ui.fieldLabel} font-bold mt-2`}>Boosts ({grants.length})</div>
        {grants.length === 0 ? (
          <div className="adm-dim text-[13px]">None yet — feedback rewards and manual grants land here.</div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto" data-ui="grants-list">
            {grants.map((g) => (
              <div key={g.id} className={`flex items-center gap-2 flex-wrap rounded-lg border border-line px-3 py-1.5 text-[12.5px] ${g.active ? '' : 'opacity-55'}`}>
                <span className="rounded-full border border-amber-200 bg-amber-100 text-amber-800 px-2 py-px text-[11px] font-medium">
                  🎁 {g.source === 'feedback' ? `Tier ${g.tier ?? '?'}` : 'Manual'} +{fmtTokens(g.tokensPerDay)}/day
                </span>
                <span className="adm-dim">{fmtWhen(g.startsAt)} → {fmtWhen(g.expiresAt)}</span>
                {!g.active && <span className="adm-dim">expired</span>}
                {g.note && <span className="adm-dim italic truncate max-w-[180px]" title={g.note}>{g.note}</span>}
                <button className="gw-btn adm-btn-sm adm-btn-danger ml-auto" onClick={() => setRevoking(g)}>Revoke</button>
              </div>
            ))}
          </div>
        )}

        {error && <div className="gw-meta gw-error">{error}</div>}
        {msg && <span className="gw-meta">{msg}</span>}
        <div className={ui.modalActions}>
          <button className="gw-btn" onClick={onClose}>Close</button>
        </div>

        {revoking && (
          <ConfirmModal
            title="Revoke boost"
            message={`Remove the +${fmtTokens(revoking.tokensPerDay)}/day boost for ${username}? Their limit drops immediately.`}
            confirmLabel="Revoke"
            onConfirm={async () => { await revokeGrant(revoking.id); await load() }}
            onClose={() => setRevoking(null)}
          />
        )}
      </div>
    </div>
  )
}
