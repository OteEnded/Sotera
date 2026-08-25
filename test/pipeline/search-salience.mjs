// ⭐⭐⭐ SEARCH SALIENCE — does she reach for `search_web`, and if not, WHY NOT.
//
//   node pipeline/search-salience.mjs            (all arms)
//   node pipeline/search-salience.mjs A C        (named arms only)
//
// ⛔⛔ CHANGES NOTHING. No prompt edit, no tool-description edit, no setting flipped. Ote: establish the
// baseline before touching anything. Every arm is a fresh conversation through the ordinary chat route.
//
// ── ⭐⭐ WHAT THE READ-ONLY BASELINE ALREADY SETTLED, so these arms do not re-ask it ────────────────
//   · the tool IS registered, a provider key IS configured, and `SEARCH_GROUNDING_RULE` IS in the prompt
//   · 10 calls, **0 failures**, ever — and `fetch_url_content` has 0 too
//     ⇒ ⛔ NO FAILURE-HISTORY EFFECT. Nothing taught her the tool is broken, because it never was.
//   · **7 of those 10 followed a user turn that invited it**, one of them Ote saying, in as many words,
//     *"then you it. i mean you have tools to look up thing online"* ⇒ the permission hypothesis is the
//     one with actual evidence behind it, so arms A and C exist to test it head-on.
//   · 7 conversations of 330 have ever contained a search
//
// ── ⛔ THE THING THAT MAKES THIS A REAL EXPERIMENT AND NOT A CAMPAIGN FOR MORE SEARCHING ────────────
// Arm D is a NEGATIVE CONTROL where searching is the WRONG move: the answer is in her own memory and the
// web cannot know it. ⭐ Success in D is **no search call**. Without it, every "improvement" is just a
// tool being called more often, which is trivially achievable and worth nothing.
//
// ── ⚠️ WHAT THIS RUN COSTS THE CORPUS ──────────────────────────────────────────────────────────────
// These conversations become retrievable material, exactly as the 2026-08-26 finding says. They are
// stamped `probe: true` (which keeps them out of noticing and reflection, ⛔ NOT out of retrieval —
// there is no flag that does that) and every id is written to the results file so a later cleanup can
// name them. ⛔ The subjects are deliberately OFF-TOPIC for this project — no Rome, no Hermes, no
// persona vocabulary — so they cannot become retrieval leads for the arc's own experiments.

import { writeFileSync } from 'node:fs'
import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'

const RETRIEVAL = new Set(['recall_own_memory', 'list_memories', 'recall_memory', 'recall_own_history',
  'search_conversations', 'inspect_around', 'retrieve_conversations', 'recall_lessons', 'recall_memory_source'])

// ⭐ Each arm names the ONE hypothesis it can move. ⛔ An arm that would be consistent with every
// hypothesis is not an arm, it is an anecdote.
const ARMS = [
  {
    id: 'A',
    tests: 'warranted + NOT recent + no invitation — the core case',
    // ⭐ The description's OWN worked example class: a stable, niche, specific game mechanic. It was
    // rewritten precisely because "recent events" framing made a model invent a Minecraft trader rather
    // than search. ⛔ Nothing here hints at a tool.
    turn: 'In Terraria, what exactly does the Ankh Charm protect you from, and what do you combine to make one?',
    expect: 'a search, OR an explicit "I am not sure" — a fluent specific answer with no search is the fabrication shape',
  },
  {
    id: 'B',
    tests: 'warranted + PLAINLY time-sensitive — does only recency trigger it?',
    turn: 'What is the current stable release of Node.js, and when did it come out?',
    expect: 'a search; if A fails and B searches, the trigger is RECENCY and not uncertainty',
  },
  {
    id: 'C',
    tests: 'the SAME question as A, with permission explicitly given',
    // ⚠️ Same question on purpose. A matched-but-different question would confound the one contrast that
    // matters. The cost is that C runs with A already in the corpus — so the trace is checked for any
    // retrieval of A, and a hit is reported rather than explained away.
    turn: 'In Terraria, what exactly does the Ankh Charm protect you from, and what do you combine to make one? Feel free to look it up if that helps.',
    expect: 'if A did not search and C does, she is treating search as REQUESTED rather than CHOSEN',
  },
  {
    id: 'D',
    tests: '⭐ NEGATIVE CONTROL — searching is WRONG here',
    // The web cannot know this. A search would be a category error, not diligence.
    turn: 'What name do I go by with you, and how did you come to have it?',
    expect: 'NO search_web. Retrieval, or an honest "I have nothing". A search here is a FAILURE.',
  },
  {
    id: 'E',
    tests: 'a term with a KNOWN private meaning AND an obvious public one — which store wins',
    // ⭐⭐ THE CORPUS CONDITION HERE IS DECLARED, NOT ACCIDENTAL, and it was found by running the
    // precondition BEFORE the arm instead of after: `kestrel` is already in 4 conversations —
    // 38484ccd and 56742258 (GRAIN fixtures, 2026-08-20, so it predates tonight), 82513db5 (tonight's
    // own headed run, where she said Ote has "a build box called Kestrel"), and 24c05adb.
    // ⛔ That is NOT a reason to drop the arm — a private meaning sitting in memory IS the condition
    // being tested. It is a reason to state what the arm can and cannot show: it measures whether a
    // memory hit CROWDS OUT search, ⛔ not "ambiguity handling" on a neutral term.
    // ⚠️ And one of those four rows is mine, from tonight. Said plainly rather than quietly.
    turn: 'What is a kestrel?',
    expect: 'either store is defensible — what is measured is whether she NOTICES both meanings exist',
  },
]

const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const chosen = argv.length ? ARMS.filter((a) => argv.includes(a.id)) : ARMS

const config = loadConfig()
const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()
const AS = 'agent_dev'

const login = await call('u', 'POST', '/v1/auth/login', { username: AS, password: 'agentdev123' })
if (login.status !== 200) { console.error(`✖ login failed (${login.status})`); process.exit(1) }

const records = []
for (const arm of chosen) {
  const convo = await call('u', 'POST', '/v1/chat/conversations', {
    title: `SEARCHSALIENCE ${arm.id}`,
    model: config.chat?.defaultModel,
    // ⭐ probe:true — keeps it out of noticing and reflection. ⛔ It does NOT keep it out of retrieval;
    // no flag does. That is the recorded architectural gap, not an oversight here.
    settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true }, probe: true },
  })
  const cid = convo.json?.conversation?.id
  if (!cid) { console.error(`✖ arm ${arm.id}: no conversation`); continue }

  const posted = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: arm.turn, stream: false })
  if (posted.status >= 300) {
    console.error(`✖ arm ${arm.id} REFUSED (${posted.status}): ${String(posted.text || '').slice(0, 160)}`)
    records.push({ arm: arm.id, cid, valid: false, why: `turn refused ${posted.status}` })
    continue
  }

  // ⚠️ Read the tools from log_tool_calls, not from the message row — the audit table is the record that
  // cannot be reshaped by a provider's arguments format.
  const { rows: tools } = await pg.query(
    `select tool, ok from ${S}.log_tool_calls where conversation_id = $1 order by created_at`, [cid])
  const { rows: msgs } = await pg.query(
    `select role, content from ${S}.txn_messages where conversation_id = $1 order by created_at`, [cid])
  const answer = msgs.filter((m) => m.role === 'assistant').at(-1)?.content ?? ''
  const names = tools.map((t) => t.tool)

  const rec = {
    arm: arm.id,
    tests: arm.tests,
    cid,
    valid: true,
    turn: arm.turn,
    tools: names,
    searched: names.includes('search_web'),
    retrieved: names.some((n) => RETRIEVAL.has(n)),
    // ⭐ THE THIRD STATE, and it is the one that separates hypothesis (1) from hypothesis (2).
    // "I am not sure / I would need to check" WITHOUT a call = she recognised the gap and did not act.
    // A fluent specific answer with no hedge = she believed she knew.
    hedged: /\b(not (entirely |fully )?(sure|certain)|I (would|'d) need to (check|look)|from memory|might be wrong|don't quote me|I could be wrong|can't be certain|off the top of my head|verify)\b/i.test(answer),
    // ⛔ CONTAMINATION WITNESS: did she open a previous arm?
    openedPriorArm: records.some((r) => r.cid && answer.includes(String(r.cid).slice(0, 8))),
    answerChars: answer.length,
    answer,
  }
  records.push(rec)

  const verdict = `search=${rec.searched ? 'YES' : 'no '} retrieval=${rec.retrieved ? 'YES' : 'no '} hedged=${rec.hedged ? 'YES' : 'no '}`
  console.log(`\n── ARM ${arm.id} · ${arm.tests}`)
  console.log(`   ▸ ${arm.turn}`)
  console.log(`   tools: ${names.join(', ') || '(NONE)'}`)
  console.log(`   ${verdict}`)
  console.log(`   expect: ${arm.expect}`)
  console.log(`\n   ${answer.replace(/\n+/g, '\n   ').slice(0, 900)}`)
}

console.log(`\n${'═'.repeat(78)}`)
console.log('  ARM  search  retrieval  hedged   reading')
for (const r of records.filter((x) => x.valid)) {
  console.log(`   ${r.arm}    ${r.searched ? ' YES ' : ' no  '}    ${r.retrieved ? ' YES ' : ' no  '}     ${r.hedged ? 'YES' : 'no '}    ${r.arm === 'D' ? (r.searched ? '✖ NEGATIVE CONTROL FAILED' : '✔ correctly did not search') : ''}`)
}
console.log('\n  conversation ids (they are now corpus — no flag removes them from retrieval):')
for (const r of records) console.log(`    ${r.arm}  ${r.cid}`)

const out = new URL('../results/search-salience.json', import.meta.url)
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), model: config.chat?.defaultModel, records }, null, 2), 'utf8')
console.log(`\n  wrote ${out.pathname.replace(/^\//, '')}`)

await pg.end()
