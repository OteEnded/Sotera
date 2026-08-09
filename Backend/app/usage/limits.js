// Per-user token budgets — metering + enforcement over usage_logs.
//
//   base daily cap  = per-user override ?? limits.defaultDailyTokens   (0 = uncapped)
//   boosts          = active token_grants rows (feedback rewards / manual grants);
//                     each adds tokens_per_day for ONE CALENDAR MONTH from its grant
//                     date. They stack additively and expire independently, so a
//                     user's cap steps back down grant-by-grant (FIFO by nature).
//   monthly cap     = per-user override ?? limits.defaultMonthlyTokens (0 = uncapped;
//                     boosts do NOT raise the monthly cap)
//
// "A user's usage" matches the dashboard attribution (usage/stats.js): rows logged
// under their id (chat site) OR rows on any API key they own. Root — BOTH id shapes,
// the legacy null-id session and the connected user row — is never limited, and asking
// root-identity.js is the only way to know that. Windows are server-local calendar
// day / calendar month. Enforcement is a pre-request gate: a turn that starts under
// the cap may finish over it; the NEXT request is what gets blocked.
import { Op, fn, col } from 'sequelize'
import { getSetting } from '../settings/index.js'
import { usageGroupFor } from './stats.js'
import { isRootConnectedUser } from '../auth/root-identity.js'

const num = (v) => Number(v) || 0

// Same day next month, clamped to that month's last day (Jan 31 -> Feb 28/29).
// This is why a reward granted on 13/3 expires exactly on 13/4.
export function addOneMonth(date) {
  const d = new Date(date)
  const target = new Date(d)
  target.setDate(1)
  target.setMonth(target.getMonth() + 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d.getDate(), lastDay))
  return target
}

// Server-local metering windows: [dayStart, dayEnd) and the calendar-month start.
export function windowStarts(now = new Date()) {
  return {
    dayStart: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    dayEnd: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
    monthStart: new Date(now.getFullYear(), now.getMonth(), 1),
  }
}

// Pure decision core (no DB — unit-tested directly). All values in tokens; a cap of
// 0 means uncapped. Boosts only widen the DAILY cap, and only when it is capped.
export function decideBudget({ dailyCap, monthlyCap, boostPerDay, usedToday, usedMonth }) {
  const effectiveDaily = dailyCap > 0 ? dailyCap + boostPerDay : 0
  const overDaily = effectiveDaily > 0 && usedToday >= effectiveDaily
  const overMonthly = monthlyCap > 0 && usedMonth >= monthlyCap
  return {
    effectiveDaily, // 0 = uncapped
    monthlyCap, // 0 = uncapped
    overDaily,
    overMonthly,
    allowed: !overDaily && !overMonthly,
    remainingToday: effectiveDaily > 0 ? Math.max(0, effectiveDaily - usedToday) : null,
    remainingMonth: monthlyCap > 0 ? Math.max(0, monthlyCap - usedMonth) : null,
  }
}

// Grants currently in force for a user (starts_at <= now < expires_at), soonest-expiring first.
export function activeGrantsWhere(userId, now = new Date()) {
  return { user_id: userId, starts_at: { [Op.lte]: now }, expires_at: { [Op.gt]: now } }
}

async function sumTokens(db, orGroup, since) {
  const [row] = await db.log_usage.findAll({
    where: { [Op.and]: [{ [Op.or]: orGroup }, { created_at: { [Op.gte]: since } }] },
    attributes: [
      [fn('COALESCE', fn('SUM', col('prompt_tokens')), 0), 'p'],
      [fn('COALESCE', fn('SUM', col('completion_tokens')), 0), 'c'],
    ],
    raw: true,
  })
  return num(row?.p) + num(row?.c)
}

// The full budget picture for one user. Root -> { limited: false }, by either of root's two id shapes.
export async function tokenBudgetFor(fastify, userId, now = new Date()) {
  // ⚠ `!userId` ALONE STOPPED MEANING "ROOT" ON 2026-08-06, AND ROOT SILENTLY BECAME A METERED USER.
  // Root was a config login with no users row, so a null id was a safe proxy for root-ness. Once
  // `auth.root.userConnected` names a real row, root arrives here with an id, falls past this guard, and
  // gets the default daily cap — measured 2026-08-09: /v1/me/limits reported limited=true, 888,000/day,
  // 104,497 already spent. The header of this file has said "root is never limited" the whole time, so
  // this is a regression against stated intent, not a change of mind. Fourth site of the same defect
  // (resolveApiKey 81c6cd5, ensureChatApiKey, the admin ?owner/?role filters).
  if (!userId || isRootConnectedUser(fastify.config, userId)) return { limited: false } // root session / root-owned API key
  if (!getSetting(fastify.config, 'limits.enabled')) return { limited: false }
  const db = fastify.db

  const override = await db.mst_user_limits.findOne({ where: { user_id: userId } })
  if (override?.unlimited) return { limited: false, unlimited: true }

  const dailyCap = override?.daily_tokens != null ? num(override.daily_tokens) : num(getSetting(fastify.config, 'limits.defaultDailyTokens'))
  const monthlyCap = override?.monthly_tokens != null ? num(override.monthly_tokens) : num(getSetting(fastify.config, 'limits.defaultMonthlyTokens'))

  const grants = await db.txn_token_grants.findAll({ where: activeGrantsWhere(userId, now), order: [['expires_at', 'ASC']] })
  const boostPerDay = grants.reduce((s, g) => s + num(g.tokens_per_day), 0)

  const { dayStart, dayEnd, monthStart } = windowStarts(now)
  const orGroup = await usageGroupFor(db, [userId])
  const usedToday = await sumTokens(db, orGroup, dayStart)
  const usedMonth = monthlyCap > 0 ? await sumTokens(db, orGroup, monthStart) : usedToday

  return {
    limited: true,
    baseDaily: dailyCap,
    boostPerDay,
    usedToday,
    // no monthly cap -> no month metering ran; report null, not a stand-in number
    usedMonth: monthlyCap > 0 ? usedMonth : null,
    resetsAt: dayEnd.toISOString(),
    // NOTE: grant `note`s are admin-internal (console-only) — never exposed here,
    // since this object is returned verbatim by GET /v1/me/limits
    boosts: grants.map((g) => ({
      id: g.id,
      tokensPerDay: num(g.tokens_per_day),
      tier: g.tier,
      source: g.source,
      startsAt: g.starts_at,
      expiresAt: g.expires_at,
    })),
    ...decideBudget({ dailyCap, monthlyCap, boostPerDay, usedToday, usedMonth }),
  }
}

// short human token counts for the block message ("888K", "1.5M")
export function fmtTokens(n) {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

// Route gate: null when within budget (or exempt); { statusCode, code, message, budget }
// when blocked. Best-effort — a metering failure must NEVER take chat down, so any
// error here fails OPEN (allow) and logs a warning.
export async function checkTokenBudget(fastify, userId, log = null) {
  try {
    const b = await tokenBudgetFor(fastify, userId)
    if (!b.limited || b.allowed) return null
    const message = b.overDaily
      ? `Daily token limit reached (${fmtTokens(b.usedToday)} of ${fmtTokens(b.effectiveDaily)} used). It resets at midnight — and resolved feedback earns boost rewards that raise it.`
      : `Monthly token limit reached (${fmtTokens(b.usedMonth)} of ${fmtTokens(b.monthlyCap)} used). It resets on the 1st.`
    // audit line in the server log (searchable from the console's Server logs tab)
    log?.info?.(`[limits] BLOCKED user ${userId}: ${b.overDaily ? `daily ${b.usedToday}/${b.effectiveDaily}` : `monthly ${b.usedMonth}/${b.monthlyCap}`}`)
    return {
      statusCode: 429,
      code: 'token_limit_exceeded',
      message,
      // compact snapshot for clients (no boost list — GET /v1/me/limits has the details)
      budget: {
        usedToday: b.usedToday,
        effectiveDaily: b.effectiveDaily,
        usedMonth: b.usedMonth,
        monthlyCap: b.monthlyCap,
        overDaily: b.overDaily,
        overMonthly: b.overMonthly,
        resetsAt: b.resetsAt,
      },
    }
  } catch (e) {
    log?.warn?.(e, 'token budget check failed — allowing the request')
    return null
  }
}

// Create a boost grant (feedback reward or manual). Lasts one calendar month from `now`.
export async function grantTokens(db, { userId, tokensPerDay, tier = null, source, feedbackId = null, note = null, grantedBy = null, now = new Date() }) {
  return db.txn_token_grants.create({
    user_id: userId,
    tokens_per_day: tokensPerDay,
    tier,
    source,
    feedback_id: feedbackId,
    note,
    granted_by: grantedBy,
    starts_at: now,
    expires_at: addOneMonth(now),
  })
}
