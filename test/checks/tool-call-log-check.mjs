// TOOL-CALL AUDIT — who called which tool, how, and did it work.
//
//   node checks/tool-call-log-check.mjs
//
// Ote asked whether tool calls are logged with the account that made them. They were not: the EventBus
// emitted every call with its `caller` attached and the only subscriber wrote a debug line and threw the
// attribution away. This check drives a REAL chat turn and then asks the DATABASE what it kept — the same
// discipline as owner-check, which reads no code and instead makes the store answer.
//
// ⭐ It asserts two things that are easy to get backwards:
//   1. the row carries the ACCOUNT — the whole point;
//   2. the row carries NO ARGUMENT VALUE — a tool argument is content, and this table must not become a
//      second copy of it under a different retention policy.

import { makeChecker, makeClient, TEST_USER, devPg, devSchema, asAgent } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'

const { check, done } = makeChecker()
const ok = (c, l, d = '') => check(l, c, d)
const config = loadConfig()
const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()

// ── S · the table is shaped so it CANNOT hold an argument value ───────────────────────────────────
const cols = (await pg.query(
  `select column_name from information_schema.columns where table_schema=$1 and table_name='log_tool_calls'`, [S])).rows.map((r) => r.column_name)
ok(cols.length > 0, 'S · log_tool_calls exists', cols.join(', '))
for (const banned of ['args', 'arguments', 'payload', 'value', 'result', 'response', 'content']) {
  ok(!cols.includes(banned), `S · ⭐ no \`${banned}\` column — the audit records the SHAPE of a call, never its content`)
}
for (const needed of ['tool', 'origin', 'user_id', 'username', 'is_root', 'conversation_id', 'ok', 'duration_ms', 'arg_keys', 'arg_bytes']) {
  ok(cols.includes(needed), `S · records \`${needed}\``)
}
// No FKs: deleting a user or a conversation must not delete the evidence of what they did.
const fks = (await pg.query(
  `select count(*)::int n from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname=$1 and t.relname='log_tool_calls' and c.contype='f'`, [S])).rows[0].n
ok(fks === 0, 'S · ⭐ no foreign keys — an audit row outlives the account and the conversation it describes')

// ── R · a real turn, driven over HTTP, and then ask the database ──────────────────────────────────
const who = await asAgent(call)
const [agent] = (await pg.query(`select id::text from ${S}.mst_users where username=$1`, [TEST_USER.username])).rows
const since = new Date()

const convo = await call(who, 'POST', '/v1/chat/conversations', {
  title: 'CHECK tool-call audit',
  model: config.chat?.defaultModel,
  settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: false } },
})
const cid = convo.json?.conversation?.id
ok(Boolean(cid), 'R · conversation created', cid)

// A prompt that all but forces one specific, parameterless, read-only tool. `recall_own_memory` is ideal:
// it takes NO arguments, so it also proves an empty arg_keys array is recorded as a fact rather than null.
if (cid) {
  await call(who, 'POST', `/v1/chat/conversations/${cid}/messages`,
    { content: 'what have you stored about your own practice with me? use your own-memory tool.', stream: false })
}

// The audit write is fire-and-forget, so poll rather than sleeping a guessed interval.
let rows = []
for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 1000))
  rows = (await pg.query(
    `select * from ${S}.log_tool_calls where created_at >= $1 order by created_at`, [since])).rows
  if (rows.length) break
}

ok(rows.length > 0, 'R · ⭐ the turn produced at least one audit row', `${rows.length} row(s): ${rows.map((r) => r.tool).join(', ')}`)

if (rows.length) {
  const mine = rows.filter((r) => r.user_id === agent?.id)
  ok(mine.length > 0, 'R · ⭐⭐ the row names the ACCOUNT that made the call — the thing that was missing',
    `${mine.length}/${rows.length} attributed to agent_dev`)
  ok(mine.every((r) => r.username === TEST_USER.username),
    'R · …and carries the username as a snapshot, so a deleted account degrades the row instead of orphaning it')
  ok(mine.every((r) => r.is_root === false),
    'R · ⭐ `is_root` is FALSE for a non-root account — read from the user, never inferred from a null id')
  ok(mine.every((r) => r.origin === 'chat'),
    'R · ⭐ `origin` says HOW it was called', [...new Set(mine.map((r) => r.origin))].join(', '))
  ok(mine.every((r) => r.conversation_id === cid),
    'R · …and which conversation it happened in')
  ok(mine.every((r) => typeof r.duration_ms === 'number'), 'R · …and how long it took')
  ok(mine.every((r) => Array.isArray(r.arg_keys)),
    'R · ⭐ arg_keys is an array on every row — a parameterless tool records [], which is itself the fact',
    JSON.stringify(mine.map((r) => `${r.tool}:[${(r.arg_keys || []).join('|')}]`)))

  // ⭐ THE PRIVACY ASSERTION, and it is checked against the ROW rather than against the schema: a value
  // could still arrive inside a key name if a caller ever passed a dynamic object.
  const flat = JSON.stringify(rows)
  for (const leak of ['practice', 'own-memory tool', 'what have you stored']) {
    ok(!flat.includes(leak), `R · ⭐ no fragment of what was SAID appears in the audit ("${leak}")`)
  }
}

// ── C · the subscriber is wired, and the old behaviour is gone ────────────────────────────────────
const { readFileSync } = await import('node:fs')
const runtimeSrc = readFileSync(new URL('../../Backend/app/components/runtime.js', import.meta.url), 'utf8')
ok(/toolAudit\?\.\(e\)/.test(runtimeSrc), 'C · the tool.executed subscriber now feeds the audit sink')
ok(/isRoot: request\.user\?\.isRoot === true/.test(runtimeSrc),
  'C · ⭐ the caller records isRoot from the USER — the nine-instance defect is not repeated here')

if (cid) await call(who, 'DELETE', `/v1/chat/conversations/${cid}`)
// ⚠️ The audit rows are deliberately NOT cleaned up: they are the evidence, they survive the
// conversation by design, and deleting them here would be testing the opposite of the guarantee.
const survived = (await pg.query(
  `select count(*)::int n from ${S}.log_tool_calls where conversation_id = $1`, [cid])).rows[0].n
ok(survived > 0, 'C · ⭐ the audit rows SURVIVE deletion of the conversation they describe', `${survived} row(s)`)

await pg.end()
done()
