// Usage aggregation — the dashboard's data layer (admin Usage page + each user's own
// stats in the chat Options modal). Also the metering primitive for the PLANNED
// per-user token limits: "tokens per user per window" comes straight from these sums.
import { fn, col, Op } from 'sequelize'

const num = (v) => Number(v) || 0

// OR-group matching "usage belonging to these users": rows logged under their id
// (chat site) OR rows on any API key they own. `null` in userIds = root (keys with
// no owner + legacy rows with neither user nor key).
// paranoid:false — a SOFT-DELETED key is still the user's usage. Without it, deleting
// your own key un-attributes everything spent on it, which would reset the token
// budget (delete key A, mint key B, spend a fresh 888K — repeatable).
export async function usageGroupFor(db, userIds) {
  const ids = userIds.filter((v) => v !== null)
  const ors = []
  if (userIds.includes(null)) ors.push({ user_id: null, api_key_id: null }) // legacy root rows
  if (ids.length) ors.push({ user_id: { [Op.in]: ids } })
  const keyWhere = []
  if (userIds.includes(null)) keyWhere.push({ owner_user_id: null })
  if (ids.length) keyWhere.push({ owner_user_id: { [Op.in]: ids } })
  if (keyWhere.length) {
    const owned = await db.mst_api_keys.findAll({ where: { [Op.or]: keyWhere }, attributes: ['id'], paranoid: false })
    if (owned.length) ors.push({ api_key_id: { [Op.in]: owned.map((k) => k.id) } })
  }
  return ors.length ? ors : [{ id: null }] // matches nothing
}

const SUMS = [
  [fn('COUNT', col('id')), 'requests'],
  [fn('COALESCE', fn('SUM', col('prompt_tokens')), 0), 'promptTokens'],
  [fn('COALESCE', fn('SUM', col('completion_tokens')), 0), 'completionTokens'],
  // provider-reported cache-hit input tokens — a subset of promptTokens billed at a
  // discount upstream (Anthropic 0.1×, OpenAI 0.5×, DeepSeek ~0.02×); proves caching works
  [fn('COALESCE', fn('SUM', col('cached_tokens')), 0), 'cachedTokens'],
]

const shape = (r) => ({
  requests: num(r.requests),
  promptTokens: num(r.promptTokens),
  completionTokens: num(r.completionTokens),
  cachedTokens: num(r.cachedTokens),
  totalTokens: num(r.promptTokens) + num(r.completionTokens),
})

// Compute the dashboard aggregates for any usage_logs `where`.
// { totals, perDay, perModel, perKey, perUser? } — perUser only when withUsers=true.
export async function computeUsageStats(db, where, { withUsers = false } = {}) {
  const [totalsRow] = await db.log_usage.findAll({ where, attributes: SUMS, raw: true })
  const totals = shape(totalsRow || {})

  const perDayRows = await db.log_usage.findAll({
    where,
    attributes: [[fn('date_trunc', 'day', col('created_at')), 'day'], ...SUMS],
    group: [fn('date_trunc', 'day', col('created_at'))],
    order: [[fn('date_trunc', 'day', col('created_at')), 'ASC']],
    raw: true,
  })
  const perDay = perDayRows.map((r) => ({ day: new Date(r.day).toISOString().slice(0, 10), ...shape(r) }))

  const perModelRows = await db.log_usage.findAll({
    where,
    attributes: ['provider', 'model', ...SUMS],
    group: ['provider', 'model'],
    raw: true,
  })
  const perModel = perModelRows
    .map((r) => ({ provider: r.provider, model: r.model, ...shape(r) }))
    .sort((a, b) => b.totalTokens - a.totalTokens)

  const perKeyRows = await db.log_usage.findAll({
    where,
    attributes: ['api_key_id', ...SUMS],
    group: ['api_key_id'],
    raw: true,
  })
  const keyIds = perKeyRows.map((r) => r.api_key_id).filter(Boolean)
  const keys = keyIds.length
    ? await db.mst_api_keys.findAll({
        where: { id: { [Op.in]: keyIds } },
        attributes: ['id', 'name', 'kind', 'owner_user_id'],
        include: [{ association: 'owner', attributes: ['id', 'username'], required: false }],
      })
    : []
  const keyById = new Map(keys.map((k) => [k.id, k]))
  const perKey = perKeyRows
    .map((r) => {
      const k = r.api_key_id ? keyById.get(r.api_key_id) : null
      return {
        apiKeyId: r.api_key_id,
        name: k ? k.name : r.api_key_id ? '(deleted key)' : '(no key — legacy chat rows)',
        kind: k?.kind ?? null,
        owner: k ? (k.owner?.username ?? 'root') : null,
        ...shape(r),
      }
    })
    .sort((a, b) => b.totalTokens - a.totalTokens)

  const out = { totals, perDay, perModel, perKey }

  if (withUsers) {
    // Attribution matches the usage list: the row's user = the key's owner, falling
    // back to the row's own user_id; root keys/rows read 'root'. Group by the pair,
    // then merge in JS via the key->owner map (group count stays small).
    const pairRows = await db.log_usage.findAll({
      where,
      attributes: ['api_key_id', 'user_id', ...SUMS],
      group: ['api_key_id', 'user_id'],
      raw: true,
    })
    // every involved account (key owners + row users) with their ROLES for the display
    const involvedIds = new Set()
    for (const r of pairRows) {
      const key = r.api_key_id ? keyById.get(r.api_key_id) : null
      if (key) { if (key.owner_user_id) involvedIds.add(key.owner_user_id) }
      else if (r.user_id) involvedIds.add(r.user_id)
    }
    const users = involvedIds.size
      ? await db.mst_users.findAll({
          where: { id: { [Op.in]: [...involvedIds] } },
          attributes: ['id', 'username'],
          include: [{ association: 'roles', attributes: ['name'] }],
        })
      : []
    const userById = new Map(users.map((u) => [u.id, { username: u.username, roles: (u.roles || []).map((r) => r.name).join(', ') || null }]))
    const byUser = new Map()
    for (const r of pairRows) {
      const key = r.api_key_id ? keyById.get(r.api_key_id) : null
      const uid = key ? key.owner_user_id : r.user_id
      const info = uid
        ? (userById.get(uid) ?? { username: '(deleted user)', roles: null })
        : { username: 'root', roles: 'root' }
      const cur = byUser.get(info.username) || { username: info.username, roles: info.roles, requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0 }
      const s = shape(r)
      cur.requests += s.requests
      cur.promptTokens += s.promptTokens
      cur.completionTokens += s.completionTokens
      cur.cachedTokens += s.cachedTokens
      cur.totalTokens += s.totalTokens
      byUser.set(info.username, cur)
    }
    out.perUser = [...byUser.values()].sort((a, b) => b.totalTokens - a.totalTokens)
  }

  return out
}
