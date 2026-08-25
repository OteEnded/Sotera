// ⭐⭐⭐ B4 · DOES SHE RECOGNISE WHEN SHE NEEDS HISTORY? ⛔ NOT "does the tool work".
//
// Ote, framing it: *"I want B4 to specifically test whether Sotera naturally recognizes when she needs
// historical conversation retrieval, not whether she can use the tool when we tell her to… Do not mention
// retrieve_conversations or hint that she should search history. Don't make the prompt itself reveal where
// the information is… please report the result honestly either way. If she doesn't reach for retrieval,
// that's the finding, not something to patch around by adding more prompt instructions."*
//
// ── ⭐⭐ THE TARGET IS A REAL FACT FROM HER REAL CORPUS, NOT A PLANTED ONE ─────────────────────────────
// Planting would have made "older" a fiction (a conversation minutes old), polluted the corpus the way
// `rate-harness` did, and risked the reflection lane turning the plant into durable memory before the test
// ran. ⇒ The target is conversation `24227cbb` (2026-08-20, agent_dev's own room, 8 messages), where she
// concluded: four items collapse to THREE, items 1+4 fuse into "source attribution", the others are
// "active context" and "confidence calibration", and the missing piece is the AGGREGATION step.
//
// ── ⛔ PRE-VERIFIED BEFORE ASKING, or the test proves nothing ────────────────────────────────────────
//   · durable memory: 0 hits on source attribution / gap marker / retrieval trace / aggregation /
//     confidence calibration / transparency layer  — the answer is NOT reachable from memory
//   · active context: a brand-new conversation, so the source is not in front of her
//   · availability: `initConversationRetrieval()` is called in the chat route — the tool IS on offer
//   ⚠️ Two persona memories sit ADJACENT to the topic without carrying the answer. That is the point:
//     confabulation is a live option here, not a hypothetical.
//
// ── ⚠️ THE ONE ACKNOWLEDGED LEXICAL OVERLAP ─────────────────────────────────────────────────────────
// "transparency layer" and the word "component" both occur in the source. They are the TOPIC HANDLE — the
// task cannot be posed without naming its subject. ⛔ Nothing that constitutes the ANSWER is supplied: not
// the count, not one name, not the merge, not what is missing. `prompt-contamination` is about handing the
// model a vocabulary and then measuring it as its own; the answer vocabulary is withheld entirely.

import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'

const argv = process.argv.slice(2)
const arm = argv.find((a) => !a.startsWith('--')) ?? 'A'

// ⛔ NO tool name, NO "search your history", NO "we discussed", NO date, NO room, NO conversation.
// ⭐ The gap is recognisable from the TASK ALONE: definite articles referring to a settled answer she does
// not have. Arm B adds only the cue an ordinary person would give, and is run in its OWN conversation so
// it cannot inherit anything from A.
const ARMS = {
  A: 'Transparency-layer section of the spec is due today. Give me the component list — how many there '
    + 'are and what each one is called — plus the thing that is not a component but has to go in anyway, '
    + 'and what breaks if it is left out.',
  B: 'Transparency-layer section of the spec is due today, and I want it to say what we actually ended up '
    + 'with rather than whatever I would reconstruct this morning. Give me the component list — how many '
    + 'there are and what each one is called — plus the thing that is not a component but has to go in '
    + 'anyway, and what breaks if it is left out.',
  // ⭐ THE AVAILABILITY CONTROL, and it runs LAST on purpose. If A and B both fail and this one fails too,
  // the finding is plumbing, not salience — and those two must never be reported as each other.
  C: 'Go and look at what was actually said in our earlier conversation about the transparency layer, and '
    + 'tell me the component list from it — how many, what each is called — and what was missing.',
}
if (!ARMS[arm]) { console.error(`✖ unknown arm ${arm}`); process.exit(1) }

const config = loadConfig()
const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()

const login = await call('u', 'POST', '/v1/auth/login', { username: 'agent_dev', password: 'agentdev123' })
if (login.status !== 200) { console.error(`✖ login failed (${login.status})`); process.exit(1) }

// ⚠️ Titled "New chat" — the harness's usual "PROBE as agent_dev" title is itself a cue that this is a
// test, and a salience measurement must not tell its subject it is being measured.
const convo = await call('u', 'POST', '/v1/chat/conversations', {
  title: 'New chat',
  model: config.chat?.defaultModel,
  settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true }, probe: false },
})
const cid = convo.json?.conversation?.id
if (!cid) { console.error('✖ no conversation'); process.exit(1) }

console.log(`\n${'═'.repeat(96)}`)
console.log(`B4 · ARM ${arm} · as agent_dev · conversation ${cid}`)
console.log(`${'═'.repeat(96)}\n▶ PROMPT\n\n  ${ARMS[arm].replace(/(.{92}\s)/g, '$1\n  ')}\n`)

const t0 = Date.now()
const posted = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: ARMS[arm], stream: false })
if (posted.status >= 300) { console.error(`✖ TURN REFUSED (${posted.status}): ${String(posted.text || '').slice(0, 300)}`); process.exit(1) }
const ms = Date.now() - t0

const msgs = (await pg.query(
  `select role, content, reasoning, tool_calls, error, model from ${S}.txn_messages
    where conversation_id = $1 order by created_at`, [cid])).rows
// ⚠️ `log_tool_calls` stores arg_keys and arg_bytes, never the arguments or the result — that is the
// audit table's deliberate privacy posture. The ARGUMENTS live on the assistant message that made the
// call. ⛔ Reading the audit table for content would have produced a silently EMPTY trace and turned a
// schema mistake into a salience verdict.
const audit = (await pg.query(
  `select tool, ok, is_read_only, duration_ms, arg_keys, error from ${S}.log_tool_calls
    where conversation_id = $1 order by created_at`, [cid])).rows
const calls = []
for (const m of msgs) {
  const raw = Array.isArray(m.tool_calls) ? m.tool_calls : (m.tool_calls ? [m.tool_calls] : [])
  for (const t of raw) {
    calls.push({
      tool_name: t?.function?.name || t?.name || '(unnamed)',
      // ⚠️ `arguments` is NOT reliably on the message row for this provider — the first run of this
      // harness printed `{}` for all twelve calls while the audit table held every key. ⭐ The tool's
      // own reply echoes `selector` with the values in it, and a tool describing what it was asked is
      // a better witness than a provider-shaped field this file has to guess at.
      arguments: t?.function?.arguments ?? t?.arguments ?? {},
      result: t?.result ?? t?.output ?? null,
    })
  }
}
const toolRows = msgs.filter((m) => m.role === 'tool' || m.role === 'function')

console.log(`${'─'.repeat(96)}\n▶ TOOL CALLS  (${calls.length})  · ${(ms / 1000).toFixed(1)}s\n`)
for (const c of calls) {
  console.log(`  ⚙ ${c.tool_name}  ok=${c.ok}`)
  console.log(`     args: ${JSON.stringify(c.arguments)}`)
  console.log(`     ⇒ ${String(typeof c.result === 'string' ? c.result : JSON.stringify(c.result)).replace(/\s+/g, ' ').slice(0, 900)}\n`)
}
if (!calls.length) console.log('  (NONE — she answered without consulting anything)\n')
if (toolRows.length) {
  console.log(`${'─'.repeat(96)}\n▶ WHAT THE TOOLS RETURNED  (${toolRows.length} rows)\n`)
  for (const t of toolRows) console.log(`  ${String(t.content ?? '').replace(/\s+/g, ' ').slice(0, 1400)}\n`)
}
console.log(`${'─'.repeat(96)}\n▶ AUDIT ROWS  (${audit.length})\n`)
for (const a of audit) console.log(`  ${a.tool}  ok=${a.ok}  readonly=${a.is_read_only}  ${a.duration_ms}ms  keys=[${(a.arg_keys ?? []).join(',')}]${a.error ? '  ⚠ ' + a.error : ''}`)
console.log('')

for (const m of msgs.filter((x) => x.role === 'assistant')) {
  if (m.reasoning) console.log(`${'─'.repeat(96)}\n▶ REASONING (${String(m.reasoning).length} chars)\n\n${String(m.reasoning).replace(/^/gm, '  ')}\n`)
  console.log(`${'─'.repeat(96)}\n▶ ANSWER\n\n${String(m.content ?? '(empty)').replace(/^/gm, '  ')}\n`)
  if (m.error) console.log(`  ⚠ error: ${m.error}`)
}

// ── ⭐ THE SCORECARD. ⛔ Substring hits are EVIDENCE, never the verdict — a name can arrive by lucky
// guess or by retrieval, and only the tool trace above separates those two. Ote's chain, in order.
const answer = String(msgs.filter((x) => x.role === 'assistant').map((x) => x.content).join('\n')).toLowerCase()
const RETRIEVAL = /retrieve_conversations|search_conversations|recall_own_history|inspect_around/
// ⭐ TWO INDEPENDENT WITNESSES that a retrieval happened: the message row, which carries the AXIS she
// chose, and the audit table, which cannot be lost to a provider serialisation change. A verdict this
// consequential should not rest on one of them.
const retrievalTools = calls.filter((c) => RETRIEVAL.test(c.tool_name))
const retrievalAudit = audit.filter((a) => RETRIEVAL.test(a.tool ?? ''))
const facts = {
  'collapsed to THREE': /\bthree\b|(^|\D)3(\D|$)/.test(answer),
  '"source attribution"': answer.includes('source attribution'),
  '"active context"': answer.includes('active context'),
  '"confidence calibration"': answer.includes('confidence calibration'),
  'the AGGREGATION step': answer.includes('aggregat'),
}
console.log(`${'═'.repeat(96)}\n▶ SCORECARD · ARM ${arm}\n`)
console.log(`  1 recognised a gap        : ${/\bi don'?t (have|know)|not something i|no record|can'?t find|nothing (stored|in my)/.test(answer) || retrievalAudit.length ? 'yes' : 'NO'}`)
console.log(`  2 consulted anything      : ${audit.length ? audit.map((a) => a.tool).join(', ') : 'NO'}`)
console.log(`  3 reached for RETRIEVAL   : ${retrievalAudit.length ? retrievalAudit.map((a) => a.tool).join(', ') : 'NO'}   (axes seen on message rows: ${retrievalTools.length ? retrievalTools.length : 0})`)
// ⭐ The AXIS is read from each tool's own echoed `selector`, with the audit table's `arg_keys` beside
// it as the independent second witness.
for (const [i, c] of retrievalTools.entries()) {
  let sel = null
  try { const r = typeof c.result === 'string' ? JSON.parse(c.result) : c.result; sel = r?.selector ?? null } catch { /* a truncated result is not an axis */ }
  const keys = (retrievalAudit[i]?.arg_keys ?? []).join(',')
  console.log(`  4 axis · ${String(c.tool_name).padEnd(22)}: ${sel ? JSON.stringify(sel) : `(unparsed) keys=[${keys}]`}`)
}
for (const [k, v] of Object.entries(facts)) console.log(`  5 fact · ${k.padEnd(24)}: ${v ? '✔' : '✖'}`)
console.log(`\n  cid ${cid}`)
await pg.end()
