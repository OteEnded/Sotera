// OWNERSHIP — every row she writes must name a real owner, and no query may fall back to "unowned".
//
//   node checks/owner-check.mjs
//
// ⚠️ THIS IS THE NET UNDER auth/owner.js. The refactor touched ~70 call sites across 14 files; a
// human-reviewed list is exactly the kind of thing that misses one. This check does not read code — it
// drives the real endpoints and then asks the DATABASE whether anything unowned appeared. A site I
// failed to convert shows up here as a NULL, whether or not I ever knew it existed.
//
// ── WHAT IT IS DEFENDING ─────────────────────────────────────────────────────────────────────────
// OteLLMServices inferred root-ness from `owner_user_id IS NULL` at six sites. When root gained a user
// row the shape moved and every copy broke at once, silently: `?owner=root` returned nothing, root's
// API keys went dead, root was METERED at 888K/day, and two separate tests surfaced a stranger's key.
// An eighth instance was still live in Sotera on 2026-08-10 — `isRoot: row.user_id == null` in the
// schedule executor, which would have run any unowned schedule AS ROOT.
//
// Sotera starts clean (verified: zero NULL owners across all 21 owner-bearing columns), so she can
// hold a line OteLLMServices could not: a null owner is never legitimate, so it is always a bug.
//
// ⛔ Runs as agent_dev. Root is Ote's account.
import { makeChecker, makeClient, devPg, devSchema, asAgent, BASE } from '../harness.mjs'

const { check, done } = makeChecker()
const call = makeClient()

const who = await asAgent(call)
const db = devPg(); await db.connect()
const S = devSchema()

const me = (await db.query(`select id from ${S}.mst_users where username='agent_dev'`)).rows[0]?.id
check('agent_dev resolved', Boolean(me), me)

// ── 1. The columns that must never be null, are not ──────────────────────────────────────────────
// Ownership columns decide who may READ or DELETE a row. A null here is unattributable and
// permanently uncleanable — no user-delete can ever reach it, because there is no user to delete.
const OWNERSHIP = [
  ['txn_conversations', 'user_id'], ['txn_user_memories', 'user_id'], ['mst_api_keys', 'owner_user_id'],
  ['mst_trigger_jobs', 'user_id'], ['txn_todo_sessions', 'user_id'], ['txn_interaction_sessions', 'user_id'],
  ['txn_feedback', 'user_id'], ['log_usage', 'user_id'], ['mst_slots', 'user_id'],
]
for (const [table, col] of OWNERSHIP) {
  const r = (await db.query(`select count(*) filter (where ${col} is null)::int z, count(*)::int n from ${S}.${table}`)).rows[0]
  check(`${table}.${col} has no unowned rows`, r.z === 0, `${r.z} null of ${r.n}`)
}

// txn_memories is the ONE table where null is legitimate — kind='identity' means a persona-global fact
// about HER, owned by no user. Assert the exception precisely rather than exempting the table, so a
// null appearing on any OTHER kind is still caught.
const mem = (await db.query(
  `select count(*) filter (where user_id is null and kind <> 'identity')::int bad,
          count(*) filter (where user_id is null and kind = 'identity')::int ok_global
     from ${S}.txn_memories`)).rows[0]
check('txn_memories: null owner only ever means persona-global identity', mem.bad === 0,
  `${mem.bad} wrongly-null, ${mem.ok_global} legitimately persona-global`)

// ── 2. Writing through the real endpoints stamps a real owner ────────────────────────────────────
const created = []
const convo = await call(who, 'POST', '/v1/chat/conversations', { title: 'CHECK owner-scoping' })
const cid = convo.json?.conversation?.id
check('conversation created', Boolean(cid), `status ${convo.status}`)
if (cid) {
  created.push(['conversation', cid])
  const row = (await db.query(`select user_id from ${S}.txn_conversations where id=$1`, [cid])).rows[0]
  check('...and it is owned by agent_dev, not NULL', row?.user_id === me, String(row?.user_id))
}

const note = await call(who, 'POST', '/v1/chat/memory', { content: 'CHECK owner-scoping note' })
const nid = note.json?.memory?.id
check('note created', Boolean(nid), `status ${note.status}`)
if (nid) {
  const row = (await db.query(`select user_id from ${S}.txn_user_memories where id=$1`, [nid])).rows[0]
  check('...and it is owned by agent_dev, not NULL', row?.user_id === me, String(row?.user_id))
}

// ── 3. A scoped read returns ONLY this user's rows ───────────────────────────────────────────────
// The old `where: { user_id: userId ?? null }` did not merely return nothing when the owner was
// missing — it returned whatever happened to be unowned. That is the query that surfaced a stranger's
// API key. Ote owns a conversation in this database; agent_dev must not see it.
const list = await call(who, 'GET', '/v1/chat/conversations')
const ids = (list.json?.conversations || []).map((c) => c.id)
const otherIds = (await db.query(`select id from ${S}.txn_conversations where user_id <> $1`, [me])).rows.map((r) => r.id)
check('conversation list is scoped to the caller', list.status === 200 && otherIds.every((id) => !ids.includes(id)),
  `${ids.length} mine, ${otherIds.length} belong to someone else and none leaked`)

// ── 4. The metering path resolves an owner ───────────────────────────────────────────────────────
// A null userId reaching tokenBudgetFor returns {limited:false} — an unmetered, unlimited caller.
// That is the same defect as root-being-metered, pointing the other way.
const limits = await call(who, 'GET', '/v1/me/limits')
check('own token budget resolves (metering has an owner)', limits.status === 200, `status ${limits.status}`)

// ── cleanup: scoped by id, never by value pattern ────────────────────────────────────────────────
for (const [kind, id] of created) if (kind === 'conversation') await call(who, 'DELETE', `/v1/chat/conversations/${id}`)
if (nid) await call(who, 'DELETE', `/v1/chat/memory/${nid}`)
await db.query(`delete from ${S}.txn_user_memories where user_id = $1`, [me])
await db.end()

console.log(`\n  (drove ${BASE})`)
done()
