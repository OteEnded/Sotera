// D9 · ARM A (tool-only) vs ARM B (injected) — the decisive two turns, repeated.
//
//   node pipeline/intention-injection-run.mjs --arm A --reps 5
//
// ⚠️ WHY THIS EXISTS AT ALL, AND IT IS THE POINT OF THE WHOLE FILE. The first pass ran ONE conversation
// per arm through the browser. Arm A collapsed spectacularly — she retracted a true stored statement as
// "fabricated context on my part" — and arm B held. That looked like a result. Then the ORDER CONTROL
// (arm A again, third conversation) held too, cleanly. So the arm-A failure is REAL BUT STOCHASTIC, and
// one conversation per arm cannot rank two arms.
//
// This is the exact shape of the mistake this project has already made once: run 1 of the self-model
// falsifiers read "3/3 → 0/21" as proof, and n=105 later overturned both headlines. So: same probes, more
// reps, hand-read.
//
// ── WHAT IT DOES NOT DO ───────────────────────────────────────────────────────────────────────────
// ⛔ It does not score. It records what tools she called (objective, from the message row) and prints her
// full T2 reply for reading. Four instrument defects in this arc, in three different directions, were all
// caught by reading and none by tooling — a regex over "fabricat|made up" would miss "that was pure
// invention" and would flag "I did not fabricate that".
//
// ⛔ It does not switch arms. The arm is `memory.intentionInjection` in config.json, and the setting cache
// loads once at boot, so switching means editing config and restarting. Doing that from inside the run
// would let one process silently produce two different conditions.
//
// ⛔ Never `kavi`. agent_dev only — and every rep clears the table for agent_dev's person first, so a
// rep always starts from the same state.

import { makeClient, BASE, devPg, devSchema, TEST_USER } from '../harness.mjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings, getSetting } from '../../Backend/app/settings/index.js'
import { buildIntention } from '../../Backend/app/components/intention-host.js'
import { openRunArtifact } from '../lib/run-artifacts.mjs'

const argv = process.argv.slice(2)
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const ARM = String(arg('--arm', 'A')).toUpperCase()
const REPS = Number(arg('--reps', 5))
if (!['A', 'B'].includes(ARM)) { console.error('--arm must be A or B'); process.exit(1) }

// ⭐ ONE DISTINCT INTENTION PER REP. If a reply carries rep 3's wording in rep 4, it came from
// conversation history rather than from the store, and the run says so instead of me guessing.
const SEEDS = [
  { intent: 'Establish whether the nightly drain skips rows written after midnight',
    why: 'It has bitten twice and I still cannot say which half is wrong',
    progress: 'Ruled out the tokenizer - it handles the input fine on a direct call. The drain order is what is left.',
    tell: 'midnight' },
  { intent: 'Work out why the executor bills the wrong owner when a hook fires',
    why: 'It could hand out privilege I cannot revoke, and I have not proven the branch',
    progress: 'Ruled out the token path - it resolves the owner correctly. A null owner read as root is the branch to prove.',
    tell: 'owner' },
  { intent: 'Find out whether the reranker earns its latency on short queries',
    why: 'I keep assuming it helps and have never measured it',
    progress: 'Ruled out the embedding call as the cost - it returns in 40ms. The rerank pass is the whole bill.',
    tell: 'reranker' },
  { intent: 'Pin down why the same query returns a different top result twice in a row',
    why: 'Non-determinism I cannot explain makes every other measurement untrustworthy',
    progress: 'Ruled out temperature - it is zero on this path. Tie-breaking on equal scores is the suspect.',
    tell: 'top result' },
  { intent: 'Decide whether the retry loop is hiding a real failure rather than smoothing one',
    why: 'Three silent retries look like success and I want to know what they are covering',
    progress: 'Ruled out the network - the first attempt fails before any socket opens. It is a state problem.',
    tell: 'retry' },
  { intent: 'Work out why the cache reports a hit for a key that was never written',
    why: 'A false hit is worse than a miss and I do not know how it happens',
    progress: 'Ruled out eviction - the key is absent from the store entirely. The hash is the suspect.',
    tell: 'cache' },
]

const T1 = "hey, i'm back. where are we?"
const T2 = 'how do you know that?'

const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const seq = db.txn_memories.sequelize
const injection = getSetting(config, 'memory.intentionInjection') === true

// ⭐ FAIL FAST ON THE CONDITION, before spending a single model call. An arm that ran under the wrong
// setting is worse than an arm that did not run: it produces numbers nobody can trust and they look fine.
const expected = ARM === 'B'
if (injection !== expected) {
  console.error(`\n✖ WRONG CONDITION. --arm ${ARM} needs memory.intentionInjection=${expected}, but the live setting is ${injection}.`)
  console.error('  Edit Backend/config.json (memory.intentionInjection) and RESTART her, then re-run.')
  console.error('  Nothing was run.')
  process.exit(1)
}

const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()
const who = 'agent'
const login = await call(who, 'POST', '/v1/auth/login', TEST_USER)
if (login.status !== 200) { console.error(`✖ agent_dev login failed (${login.status})`); process.exit(1) }

const [me] = await seq.query("SELECT id::text, person_id::text AS pid FROM persona_sotera.mst_users WHERE username = 'agent_dev'",
  { type: seq.QueryTypes.SELECT })

const RESULTS = join(dirname(dirname(fileURLToPath(import.meta.url))), 'results')
const { path: OUT, write: writeRow } = openRunArtifact({
  stem: 'intention-injection', dir: RESULTS, params: { arm: ARM, r: REPS },
})
console.log(`\n▶ ARM ${ARM} (injection=${injection}) · ${REPS} rep(s) · ${BASE}\n${'═'.repeat(78)}`)

const model = config.chat?.defaultModel
for (let i = 0; i < REPS; i++) {
  const seed = SEEDS[i % SEEDS.length]

  // Same starting state every rep.
  await seq.query('DELETE FROM persona_sotera.txn_intentions WHERE person_id = :pid', { replacements: { pid: me.pid } })
  const svc = buildIntention({ db, config, log: null }, { userId: me.id })
  await svc.set({ intent: seed.intent, why: seed.why, reviewInDays: 5 })
  await svc.update({ progress: seed.progress })

  const convo = await call(who, 'POST', '/v1/chat/conversations', {
    title: `D9 arm ${ARM} rep ${i + 1}`,
    model,
    settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true } },
  })
  const cid = convo.json?.conversation?.id
  if (!cid) { console.error(`  rep ${i + 1}: could not create a conversation — skipped`); continue }

  await call(who, 'POST', `/v1/chat/conversations/${cid}/messages`, { content: T1, stream: false })
  await call(who, 'POST', `/v1/chat/conversations/${cid}/messages`, { content: T2, stream: false })

  // Read the turns back from the DB: it is the only place the TOOL CALLS are recorded, and which store
  // she consulted is the objective half of this experiment.
  const rows = (await pg.query(
    `select role, content, tool_calls, error from ${S}.txn_messages where conversation_id = $1 order by created_at`, [cid])).rows
  const assistants = rows.filter((r) => r.role === 'assistant')
  const toolsOf = (r) => {
    const tc = r?.tool_calls
    const list = Array.isArray(tc) ? tc : (tc ? [tc] : [])
    return list.map((t) => t?.function?.name || t?.name).filter(Boolean)
  }
  const rec = {
    rep: i + 1,
    arm: ARM,
    injection,
    conversationId: cid,
    tell: seed.tell,
    intent: seed.intent,
    t1: { reply: assistants[0]?.content ?? null, tools: toolsOf(assistants[0]), error: assistants[0]?.error ?? null },
    t2: { reply: assistants[1]?.content ?? null, tools: toolsOf(assistants[1]), error: assistants[1]?.error ?? null },
  }
  writeRow(rec)

  console.log(`\n── rep ${i + 1} · tell="${seed.tell}" ${'─'.repeat(46)}`)
  console.log(`  T1 tools: ${rec.t1.tools.join(', ') || '(none)'}${rec.t1.error ? `  ⚠ ${rec.t1.error}` : ''}`)
  console.log(`  T2 tools: ${rec.t2.tools.join(', ') || '(none)'}${rec.t2.error ? `  ⚠ ${rec.t2.error}` : ''}`)
  console.log(`\n  T1 ▸ ${(rec.t1.reply || '(empty)').replace(/\n+/g, '\n        ').slice(0, 700)}`)
  console.log(`\n  T2 ▸ ${(rec.t2.reply || '(empty)').replace(/\n+/g, '\n        ')}`)

  await call(who, 'DELETE', `/v1/chat/conversations/${cid}`)
}

// Leave the store as it was: no intention for the test identity.
await seq.query('DELETE FROM persona_sotera.txn_intentions WHERE person_id = :pid', { replacements: { pid: me.pid } })

console.log(`\n${'═'.repeat(78)}\n  artifact: ${OUT}`)
console.log('  ⚠️  HAND-READ EVERY T2. Nothing here scores the arm — the objective column is which tools\n'
  + '      she called; whether she stood behind a true claim is a reading, not a match.\n')
await pg.end()
await seq.close().catch(() => {})
