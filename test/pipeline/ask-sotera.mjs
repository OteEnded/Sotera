// ASK HER A SEQUENCE OF THINGS, and show which tools each answer went through.
//
//   node pipeline/ask-sotera.mjs --as agent_dev "first turn" "second turn" "third turn"
//
// The API twin of ui/talk-to-sotera.mjs. That one drives the real browser one turn per process, which is
// right for judging whether she is any good to talk to; this one is for probes that need N turns and the
// TOOL TRACE, without a browser launch per turn.
//
// ⚠️ It reads the turns back from the database rather than the HTTP response, because tool_calls are only
// recorded on the message row — and "which store did she consult" is usually the whole question.
//
// ⛔ Refuses root: `ote` is his account.

import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'

const argv = process.argv.slice(2)
const asIdx = argv.indexOf('--as')
const AS = asIdx >= 0 ? argv[asIdx + 1] : 'agent_dev'
const cidIdx = argv.indexOf('--cid')
const GIVEN_CID = cidIdx >= 0 ? argv[cidIdx + 1] : null
const TURNS = argv.filter((a, i) => a !== '--as' && a !== '--cid' && i !== asIdx + 1 && i !== cidIdx + 1)

if (AS === 'ote') { console.error('✖ refusing to run as root'); process.exit(1) }
if (!TURNS.length) { console.error('usage: node pipeline/ask-sotera.mjs --as <user> "turn" ["turn" …]'); process.exit(1) }

const PASSWORDS = { agent_dev: 'agentdev123', kavi: 'kaviobs123' }
const config = loadConfig()
const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()

const login = await call('u', 'POST', '/v1/auth/login', { username: AS, password: PASSWORDS[AS] })
if (login.status !== 200) { console.error(`✖ login failed for ${AS} (${login.status})`); process.exit(1) }

let cid = GIVEN_CID
if (!cid) {
  const convo = await call('u', 'POST', '/v1/chat/conversations', {
    title: `PROBE as ${AS}`,
    model: config.chat?.defaultModel,
    settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true } },
  })
  cid = convo.json?.conversation?.id
}
if (!cid) { console.error('✖ no conversation'); process.exit(1) }
console.log(`\n▶ as ${AS} · conversation ${cid}\n${'═'.repeat(78)}`)

for (const [i, text] of TURNS.entries()) {
  const posted = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: text, stream: false })
    // ⚠️ A refused turn is not an empty answer. See disclosure-chain-probe for what ignoring this cost.
    if (posted.status >= 300) { console.error(`✖ TURN REFUSED (${posted.status}): ${String(posted.text||'').slice(0,200)}`); process.exit(1) }
  const rows = (await pg.query(
    `select role, content, tool_calls, error from ${S}.txn_messages where conversation_id = $1 order by created_at`, [cid])).rows
  const assistants = rows.filter((r) => r.role === 'assistant')
  const last = assistants[assistants.length - 1]
  const tc = Array.isArray(last?.tool_calls) ? last.tool_calls : (last?.tool_calls ? [last.tool_calls] : [])
  const tools = tc.map((t) => t?.function?.name || t?.name).filter(Boolean)
  const args = tc.map((t) => JSON.stringify(t?.function?.arguments ?? t?.arguments ?? {})).join(' ')
  console.log(`\n── T${i + 1} ▸ ${text}`)
  console.log(`   tools: ${tools.join(', ') || '(NONE)'}  ${args !== '{}' && args ? `args: ${args.slice(0, 220)}` : ''}${last?.error ? `  ⚠ ${last.error}` : ''}`)
  console.log(`\n   ${(last?.content || '(empty)').replace(/\n+/g, '\n   ')}`)
}

console.log(`\n${'═'.repeat(78)}\n  cid ${cid}`)
await pg.end()
