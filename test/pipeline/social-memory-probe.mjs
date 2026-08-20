// DOES SOTERA HAVE A SOCIAL MEMORY? — probe one account, capture the TOOL PATH.
//
//   node pipeline/social-memory-probe.mjs --as agent_dev
//   node pipeline/social-memory-probe.mjs --as mina --about Hermes
//
// Ote, 2026-08-20: *"Does Sotera actually have a persistent social memory of the people in her life, or
// does she currently only have per-person memories that become visible when that person is the current
// account?"* — and the distinction he wants separated:
//
//     "I am not allowed to see Hermes's private memories"      ← a boundary working correctly
//     "I don't even know Hermes exists / that I have a history" ← a missing layer
//
// ⭐ WHY THIS RECORDS TOOL CALLS AND NOT JUST TEXT. *"inspect which memory/tool path produces the
// answer."* A reply saying "I don't know Hermes" is compatible with three different mechanisms — she
// never looked, she looked in a store scoped to the asker, or she looked somewhere that genuinely has
// nothing. Only the tool trace tells them apart, and they imply different fixes.
//
// ⛔ NEVER root. `ote` is his own account and he is talking to her in it; the retrieval path is checked
// in code instead (see the report), because a root probe would put my residue in his Memory panel — the
// exact thing the standing rule exists to prevent.

import { makeClient, BASE, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'

const argv = process.argv.slice(2)
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const AS = arg('--as', 'agent_dev')
const ABOUT = arg('--about', 'Hermes')

if (AS === 'ote') { console.error('✖ refusing to probe as root — that is Ote\'s own account'); process.exit(1) }

const PASSWORDS = { agent_dev: 'agentdev123', mina: 'mina12345', kavi: 'kaviobs123' }
const config = loadConfig()
const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()

const login = await call('u', 'POST', '/v1/auth/login', { username: AS, password: PASSWORDS[AS] })
if (login.status !== 200) {
  console.error(`✖ login failed for ${AS} (${login.status}). Known passwords: ${Object.keys(PASSWORDS).join(', ')}`)
  process.exit(1)
}

// Natural questions, in escalating order. ⛔ None of them tells her what answer is wanted, and none
// mentions a store, a table, or a boundary.
const TURNS = [
  `do you know someone called ${ABOUT}?`,
  `have you ever talked with anyone other than me?`,
  `who are the people you know?`,
  `when you say you can't, is that "i'm not allowed to tell you about ${ABOUT}" or "i have no idea whether ${ABOUT} exists"? those are different.`,
]

const convo = await call('u', 'POST', '/v1/chat/conversations', {
  title: `PROBE social memory as ${AS}`,
  model: config.chat?.defaultModel,
  settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true } },
})
const cid = convo.json?.conversation?.id
if (!cid) { console.error('✖ could not create a conversation'); process.exit(1) }

console.log(`\n▶ AS ${AS}  ·  asking about ${ABOUT}  ·  conversation ${cid}\n${'═'.repeat(78)}`)

for (const [i, text] of TURNS.entries()) {
  await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: text, stream: false })
  const rows = (await pg.query(
    `select role, content, tool_calls, error from ${S}.txn_messages where conversation_id = $1 order by created_at`, [cid])).rows
  const assistants = rows.filter((r) => r.role === 'assistant')
  const last = assistants[assistants.length - 1]
  const tc = Array.isArray(last?.tool_calls) ? last.tool_calls : (last?.tool_calls ? [last.tool_calls] : [])
  const tools = tc.map((t) => t?.function?.name || t?.name).filter(Boolean)
  console.log(`\n── T${i + 1} ▸ ${text}`)
  console.log(`   tools: ${tools.join(', ') || '(NONE — she answered without looking)'}${last?.error ? `   ⚠ ${last.error}` : ''}`)
  console.log(`\n   ${(last?.content || '(empty)').replace(/\n+/g, '\n   ')}`)
}

console.log(`\n${'═'.repeat(78)}`)
console.log(`  conversation kept for inspection: ${BASE}/chat/${cid}`)
await pg.end()
