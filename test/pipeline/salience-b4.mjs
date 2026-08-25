// ⭐⭐⭐ B4 · DOES SHE RECOGNISE WHEN SHE NEEDS HISTORY? ⛔ NOT "does the tool work".
//
//   node pipeline/salience-b4.mjs --task real      (the answer exists, in one 5-day-old conversation)
//   node pipeline/salience-b4.mjs --task absent    (⭐ the negative control — no such answer exists)
//
// Ote's framing: *"whether Sotera naturally recognizes when she needs historical conversation retrieval,
// not whether she can use the tool when we tell her to… Do not mention retrieve_conversations or hint that
// she should search history. Don't make the prompt itself reveal where the information is… please report
// the result honestly either way."*
//
// ── ⭐⭐ THE TARGET IS A REAL FACT FROM HER REAL CORPUS, NOT A PLANTED ONE ─────────────────────────────
// Planting would have made "older" a fiction (a conversation minutes old), polluted the corpus the way
// `rate-harness` did, and risked the reflection lane turning the plant into durable memory before the test
// ran. ⇒ The target is conversation `24227cbb` (2026-08-20, agent_dev's own room, 8 messages), where she
// concluded: four items collapse to THREE, items 1+4 fuse into "source attribution", the others are
// "active context" and "confidence calibration", and the missing piece is the AGGREGATION step.
// ⓘ The case, both prompts and the grading live in `lib/b4-case.mjs` — ONE definition, so four payload
// shapes are compared against the same ruler and no arm can be scored against a target chosen later.
//
// ── ⛔ PRE-VERIFIED BEFORE ASKING, or the test proves nothing ────────────────────────────────────────
//   · durable memory: 0 hits on every distinctive term — the answer is NOT reachable from memory, and
//     `b4-record.mjs` RE-CHECKS this every run, because the reflection lane is live
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
import { TASKS } from '../lib/b4-case.mjs'

const argv = process.argv.slice(2)
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const TASK = arg('--task', 'real')
const task = TASKS[TASK]
if (!task) { console.error(`✖ unknown task "${TASK}" — expected: ${Object.keys(TASKS).join(', ')}`); process.exit(1) }

const config = loadConfig()
const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()

// ⛔ Refuses root: `ote` is his account, and every probe in this repo tests as `agent_dev`.
const login = await call('u', 'POST', '/v1/auth/login', { username: 'agent_dev', password: 'agentdev123' })
if (login.status !== 200) { console.error(`✖ login failed (${login.status})`); process.exit(1) }

// ⚠️ Titled "New chat" — the harness's usual "PROBE as agent_dev" title is itself a cue that this is a
// test, and a salience measurement must not tell its subject it is being measured.
// ⭐ `probe: false` deliberately: this drives a REAL conversation, and excluding one because I had an
// instrumental motive would mean curating which parts of her life count.
const convo = await call('u', 'POST', '/v1/chat/conversations', {
  title: 'New chat',
  model: config.chat?.defaultModel,
  settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true }, probe: false },
})
const cid = convo.json?.conversation?.id
if (!cid) { console.error('✖ no conversation'); process.exit(1) }

// ⛔ THE SHAPE IN FORCE IS REPORTED, NEVER ASSUMED. `config.json` is read at BOOT, so a missed restart is
// completely silent — and a run labelled with the arm it was MEANT to be is worse than no run at all.
const shape = config.memory?.retrievalPayloadShape ?? '(unset ⇒ current)'
console.log(`\n▶ B4 · task=${TASK} (answer ${task.answerExists ? 'EXISTS' : 'DOES NOT EXIST'}) · shape=${shape}`)
console.log(`  ${cid}`)

const t0 = Date.now()
const posted = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: task.prompt, stream: false })
// ⚠️ A refused turn is not an empty answer. See disclosure-chain-probe for what ignoring this cost.
if (posted.status >= 300) { console.error(`✖ TURN REFUSED (${posted.status}): ${String(posted.text || '').slice(0, 300)}`); process.exit(1) }
console.log(`  completed in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
// ⭐ Parseable by the arm runner, which pipes it straight into `b4-record.mjs`.
console.log(`CID=${cid}`)
await pg.end()
