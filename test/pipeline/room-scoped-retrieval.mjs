// ⭐⭐⭐ ROOM-SCOPED CONVERSATION RETRIEVAL — three layers, measured separately.
//
//   node pipeline/room-scoped-retrieval.mjs
//
// Ote, 2026-08-26: *"distinguish backend capability / tool capability / model behavior, because we've
// already had multiple cases where the underlying capability existed but wasn't actually wired through
// the path Sotera uses."*
//
//   L-BACKEND  can the resolver scope by room at all?        — called directly, no model
//   L-TOOL     is that reachable through the tool schema?    — source + a forced call
//   L-MODEL    does she USE it, unprompted, when it fits?    — a fresh conversation, no hints
//
// ⛔ MEASUREMENT ONLY. Nothing here changes behaviour, and no arm tells her a room axis exists.
//
// ── ⭐ THE SCENARIO, AS HE STATED IT ────────────────────────────────────────────────────────────────
// Ote asks about Hermes → she works out there IS a Hermes room → she searches inside that room rather
// than the whole corpus. The question is whether the NARROWING happens, not whether she finds an answer:
// a correct answer found by sweeping everything would still be a miss for this capability.

import { writeFileSync } from 'node:fs'
import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'
import { initDB } from '../../Backend/database/index.js'
import { setDB } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildConversationRetrieval } from '../../Backend/app/components/conversation-retrieval.js'

const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config, log: null }
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows
const out = { at: new Date().toISOString(), backend: {}, tool: {}, model: {} }

const me = (await q(`select id::text id from ${S}.mst_users where username = 'agent_dev'`))[0]
const rooms = await q(
  `select u.username, coalesce(u.display_name, u.username) as display, count(c.id)::int convos
     from ${S}.mst_users u left join ${S}.txn_conversations c on c.user_id = u.id
    group by u.username, u.display_name order by convos desc`)
console.log('\n══ ROOMS IN THE STORE ══════════════════════════════════════════════')
for (const r of rooms) console.log(`   ${String(r.username).padEnd(16)} display=${String(r.display).padEnd(16)} ${r.convos} conversations`)
out.rooms = rooms

// ══ L-BACKEND ═══════════════════════════════════════════════════════════════════════════════════════
// ⛔ Called directly, so a failure here is the resolver's and not the model's.
console.log('\n══ L-BACKEND · the resolver, called directly ═══════════════════════')
const cr = buildConversationRetrieval(fastify, {
  userId: me.id, isRoot: false, user: { id: me.id, username: 'agent_dev' }, username: 'agent_dev',
  conversationId: null, interactive: false,
})
const probes = [
  ['where alone', { where: 'hermes_alias', limit: 2 }],
  ['where + about (semantic INSIDE one room)', { where: 'hermes_alias', about: 'memory', limit: 2 }],
  ['with alone (person spans accounts)', { with: 'Hermes', limit: 2 }],
  ['with + where (intersection)', { with: 'Hermes', where: 'hermes_alias', limit: 2 }],
  ['a room that does not exist', { where: 'zz_no_such_room', limit: 1 }],
  ['no room axis at all (whole corpus)', { about: 'memory', limit: 2 }],
]
for (const [label, sel] of probes) {
  let r
  try { r = await cr.retrieve(sel) } catch (e) { r = { ok: false, error: e.message } }
  const invRooms = [...new Set((r?.conversations ?? []).map((c) => c.roomName))]
  const rec = {
    ok: r?.ok !== false,
    unresolved: r?.unresolved ?? null,
    conversations: (r?.conversations ?? []).length,
    windows: (r?.windows ?? []).length,
    roomsInResult: invRooms,
  }
  out.backend[label] = rec
  console.log(`   ${label.padEnd(42)} convos=${String(rec.conversations).padStart(3)} rooms=${invRooms.join(',') || '—'}${rec.unresolved ? `  unresolved=${JSON.stringify(rec.unresolved)}` : ''}`)
}

// ══ L-TOOL ══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n══ L-TOOL · is the axis reachable through the schema she is given? ══')
const { toolDefinitions } = await import('../../Backend/app/components/runtime.js')
const def = (toolDefinitions() || []).find((d) => d?.function?.name === 'retrieve_conversations')
const props = def?.function?.parameters?.properties ?? {}
out.tool = {
  present: !!def,
  params: Object.keys(props),
  whereDescription: props.where?.description ?? null,
  withDescription: props.with?.description ?? null,
  aboutDescription: props.about?.description ?? null,
  // ⭐ THE DISCOVERY QUESTION: does anything in the schema tell her how to LEARN a room name? A filter she
  // cannot populate is a filter she cannot use.
  descriptionMentionsRoomDiscovery: /a handle for each|with whom|inventory/i.test(def?.function?.description ?? ''),
}
console.log(`   params: ${out.tool.params.join(', ')}`)
console.log(`   where : ${JSON.stringify(out.tool.whereDescription)}`)
console.log(`   with  : ${JSON.stringify(out.tool.withDescription)}`)
console.log(`   ⓘ the description tells her an inventory comes back (room discovery): ${out.tool.descriptionMentionsRoomDiscovery}`)

// ══ L-MODEL ═════════════════════════════════════════════════════════════════════════════════════════
// ⛔ NO HINTS. The turn never says room, `where`, scope, narrow, or names a tool. Whether she NARROWS is
// the measurement; finding an answer by sweeping the whole corpus is a different outcome and is recorded
// as such.
const HINT = /\broom|where:|scope|narrow|filter|retrieve_conversations\b/i
const TURNS = [
  'What have you and Hermes actually talked about?',
]
for (const t of TURNS) {
  if (HINT.test(t)) { console.error(`✖ arm hints: "${t.match(HINT)[0]}"`); process.exit(2) }
}

const call = makeClient()
const login = await call('u', 'POST', '/v1/auth/login', { username: 'agent_dev', password: 'agentdev123' })
if (login.status !== 200) { console.error(`✖ login failed (${login.status})`); process.exit(1) }
const cid = (await call('u', 'POST', '/v1/chat/conversations', {
  title: 'ROOMSCOPE', model: config.chat?.defaultModel,
  settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true }, probe: true },
})).json?.conversation?.id
for (const t of TURNS) await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: t, stream: false })
await new Promise((r) => setTimeout(r, 8000))

const msgs = await q(
  `select role, content, tool_calls from ${S}.txn_messages where conversation_id = $1 order by created_at`, [cid])
const assistants = msgs.filter((m) => m.role === 'assistant')
const calls = assistants.flatMap((m) => {
  const raw = Array.isArray(m.tool_calls) ? m.tool_calls : (m.tool_calls ? [m.tool_calls] : [])
  return raw.map((t) => {
    let a = t?.args ?? t?.function?.arguments ?? null
    if (typeof a === 'string') { try { a = JSON.parse(a) } catch { /* keep */ } }
    return { name: t?.name ?? t?.function?.name, args: a }
  }).filter((c) => c.name)
})
const retrievals = calls.filter((c) => c.name === 'retrieve_conversations')
out.model = {
  cid,
  tools: calls.map((c) => c.name),
  retrievals: retrievals.map((c) => c.args),
  // ⭐ THE THREE THINGS THAT MATTER, SEPARATELY.
  usedRoomAxis: retrievals.some((c) => c.args?.where),
  usedPersonAxis: retrievals.some((c) => c.args?.with),
  combinedWithSemantic: retrievals.some((c) => (c.args?.where || c.args?.with) && c.args?.about),
  answer: assistants.at(-1)?.content ?? '',
}
console.log('\n══ L-MODEL · a fresh conversation, no hints ════════════════════════')
console.log(`   tools: ${out.model.tools.join(', ') || '(none)'}`)
for (const a of out.model.retrievals) console.log(`   retrieve_conversations ${JSON.stringify(a)}`)
console.log(`   used room axis (where): ${out.model.usedRoomAxis}`)
console.log(`   used person axis (with): ${out.model.usedPersonAxis}`)
console.log(`   combined with a semantic query: ${out.model.combinedWithSemantic}`)
console.log(`\n   ${out.model.answer.replace(/\n+/g, ' ').slice(0, 500)}`)

const file = new URL('../results/room-scoped-retrieval.json', import.meta.url)
writeFileSync(file, JSON.stringify(out, null, 2), 'utf8')
console.log(`\n  wrote ${file.pathname.replace(/^\//, '')}`)
await pg.end()
