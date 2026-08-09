import { apiDelete, apiGet, apiPost, apiPut } from './api'

// Token budgets: every user spends prompt+completion tokens against a daily cap
// (base default or per-user override) widened by active boosts — feedback rewards and
// manual grants, each lasting one month. GET /v1/me/limits is the self-service view;
// the /v1/admin/users/:id/limits family is the console management surface.

export type TokenBoost = {
  id: string
  tokensPerDay: number
  tier: 1 | 2 | 3 | null
  source: 'feedback' | 'manual'
  startsAt: string
  expiresAt: string
  note?: string | null
  feedbackId?: string | null
  active?: boolean
}

export type TokenBudget = {
  limited: boolean // false = not metered (root, exempt user, or limits disabled)
  unlimited?: boolean
  baseDaily?: number // 0 = uncapped
  boostPerDay?: number
  effectiveDaily?: number // 0 = uncapped
  monthlyCap?: number // 0 = uncapped
  usedToday?: number
  usedMonth?: number
  remainingToday?: number | null
  remainingMonth?: number | null
  overDaily?: boolean
  overMonthly?: boolean
  allowed?: boolean
  resetsAt?: string
  boosts?: TokenBoost[]
}

export type LimitsOverride = {
  dailyTokens: number | null // null = platform default; 0 = uncapped
  monthlyTokens: number | null
  unlimited: boolean
  note: string | null
}

export const getMyBudget = (): Promise<TokenBudget> => apiGet('/v1/me/limits')

export const getUserLimits = (userId: string): Promise<{ budget: TokenBudget; override: LimitsOverride | null; grants: TokenBoost[] }> =>
  apiGet(`/v1/admin/users/${userId}/limits`)

export const putUserLimits = (userId: string, body: Partial<LimitsOverride>): Promise<{ ok: boolean; override: LimitsOverride; budget: TokenBudget }> =>
  apiPut(`/v1/admin/users/${userId}/limits`, body)

export const grantUserBoost = (userId: string, body: { tokensPerDay: number; note?: string }): Promise<{ ok: boolean; grant: TokenBoost }> =>
  apiPost(`/v1/admin/users/${userId}/grants`, body)

export const revokeGrant = (grantId: string): Promise<{ ok: boolean }> => apiDelete(`/v1/admin/grants/${grantId}`)

// "888000" -> "888K", "1388000" -> "1.4M" — matches the backend's block-message format.
export const fmtTokens = (n: number): string => {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
