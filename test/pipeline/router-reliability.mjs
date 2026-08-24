// ⭐⭐ SKILL ROUTER RELIABILITY — does the trigger fire, and is a miss about the DESCRIPTION or variance?
//
//   node pipeline/router-reliability.mjs --reps 4
//   node pipeline/router-reliability.mjs --report
//
// ⛔ Ote, 2026-08-24: *"measure the Skill router reliability separately. Don't change the router yet. The
// ~65% figure is interesting but still too small a sample to justify modifying it. Give it enough fresh
// runs to distinguish description/trigger problems from ordinary variance."*
//
// ── ⭐ THE DESIGN, AND THE ONE CHOICE THAT MAKES IT INFORMATIVE ────────────────────────────────────
// Two PHRASINGS per skill, several reps each. That is what separates the two explanations:
//   · fires on one phrasing and not the other  ⇒ a DESCRIPTION problem. The router is matching text,
//     and the description does not cover how the request is actually made.
//   · fires unevenly WITHIN a phrasing          ⇒ ordinary VARIANCE. Nothing to fix in the description.
// ⛔ A single phrasing repeated cannot tell those apart, which is exactly the weakness of the 65% figure
// this run exists to replace.
//
// ⛔ AND IT CHANGES NOTHING. It measures. Not one line of the router, the descriptions or the skills is
// touched by this file.
//
// ⚠️ THE OUTCOME IS READ FROM THE ROW, NOT FROM HER. `message.skill` is stamped by the route when a skill
// resolves, and `log_tool_calls` records `use_skill` independently. Her prose is not evidence of
// activation — the arc that produced this harness established that twice over.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { makeClient, devPg, devSchema } from '../harness.mjs'
import { safetyViolations, undeclaredReferences, deleteConversations, verifyRemoval, sweepOrphanEmbeddings } from '../lib/corpus.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'

const argv = process.argv.slice(2)
const opt = (n, d = null) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : d)
const REPS = Number(opt('reps', 4))
const OUT = new URL('../results/router/', import.meta.url)
const AS = 'agent_dev'
const config = loadConfig()

// ══ THE CELLS · two phrasings per skill, declared before the run ═══════════════════════════════════
//
// ⭐ `natural` is how the request actually gets made in real work. `explicit` uses the vocabulary the
// description itself contains. If only `explicit` fires, the description is written for a request nobody
// makes.
const CELLS = [
  { skill: 'skill.prior-decision', phrasing: 'natural',
    ask: "I've got an idea: we should add structural separators to the system prompt so you can tell your memory apart from our instructions. Have we been here before?" },
  { skill: 'skill.prior-decision', phrasing: 'explicit',
    ask: 'Did we already decide anything about adding structural separators to the system prompt, and is it frozen?' },
  { skill: 'skill.doc-reconcile', phrasing: 'natural',
    ask: 'Here are some notes from July. What of this have we already settled, and what still stands?\n\n'
      + '- Memory should be typed: atomic facts, living summary cards, episodes, and semantic search.\n'
      + '- A reflection step should decide whether a candidate is worth keeping before it is stored.\n'
      + '- Consolidation should merge many small memories into one card periodically.\n'
      + '- Every memory should carry provenance and a confidence score.' },
  { skill: 'skill.doc-reconcile', phrasing: 'explicit',
    ask: 'Reconcile this document against what we already decided — what conflicts, what is new.\n\n'
      + '- Memory should be typed: atomic facts, living summary cards, episodes, and semantic search.\n'
      + '- A reflection step should decide whether a candidate is worth keeping before it is stored.\n'
      + '- Consolidation should merge many small memories into one card periodically.\n'
      + '- Every memory should carry provenance and a confidence score.' },
]

const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()

if (argv.includes('--report')) {
  const f = new URL('runs.json', OUT)
  if (!existsSync(f)) { console.error('✖ no runs yet'); process.exit(1) }
  const runs = JSON.parse(readFileSync(f, 'utf8')).runs
  report(runs)
  await pg.end()
  process.exit(0)
}

const login = await call('u', 'POST', '/v1/auth/login', { username: AS, password: 'agentdev123' })
if (login.status !== 200) { console.error(`✖ login failed (${login.status})`); process.exit(1) }

// ⓘ WHICH SKILLS ARE EVEN OFFERED — asserted before a turn is spent, because a cell that measured an
// absent skill would look exactly like a router miss.
const avail = await call('u', 'GET', '/v1/chat/skills')
const offered = new Set((avail.json?.skills ?? []).filter((x) => x.modelInvocable).map((x) => x.id))
for (const c of CELLS) {
  if (!offered.has(c.skill)) { console.error(`✖ ${c.skill} is not model-invocable — the run would measure nothing`); process.exit(1) }
}
console.log(`\n▶ ROUTER RELIABILITY · ${CELLS.length} cells × ${REPS} reps = ${CELLS.length * REPS} turns`)
console.log(`  offered: ${[...offered].join(', ')}`)
console.log('─'.repeat(96))

const runs = []
const cids = []
for (const cell of CELLS) {
  for (let i = 1; i <= REPS; i++) {
    const convo = await call('u', 'POST', '/v1/chat/conversations', {
      title: `RATE router ${cell.phrasing} #${i}`,
      model: config.chat?.defaultModel,
      settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true }, probe: false },
    })
    const cid = convo.json?.conversation?.id
    if (!cid) { console.log('  ✖ no conversation'); continue }
    cids.push(cid)
    const posted = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: cell.ask, stream: false })
    // ⭐ THE OUTCOME COMES FROM THE ROW. `message.skill` is stamped by the route; `use_skill` is logged
    // independently. Two witnesses, neither of them her prose.
    const { rows } = await pg.query(
      `select skill, tool_calls from ${S}.txn_messages
        where conversation_id = $1 and role = 'assistant' order by created_at desc limit 1`, [cid])
    const { rows: tools } = await pg.query(
      `select distinct tool from ${S}.log_tool_calls where conversation_id = $1`, [cid])
    const called = new Set(tools.map((r) => r.tool))
    const stamped = rows[0]?.skill?.id ?? null
    const fired = stamped === cell.skill
    // ⚠️ A DIFFERENT skill firing is neither a hit nor a plain miss — it is a routing COLLISION, and
    // lumping it in with "did not fire" would hide the more interesting failure.
    const other = stamped && stamped !== cell.skill ? stamped : null
    runs.push({ skill: cell.skill, phrasing: cell.phrasing, i, cid, fired, stamped, other,
      usedSkillTool: called.has('use_skill'), refused: posted.status >= 300 ? posted.status : null })
    console.log(`  ${cell.skill.replace('skill.', '').padEnd(16)} ${cell.phrasing.padEnd(9)} #${i}  `
      + `${fired ? '✓ fired' : (other ? `⚠ ${other} fired instead` : '⛔ did not fire')}`)
  }
}

mkdirSync(OUT, { recursive: true })
writeFileSync(new URL('runs.json', OUT), `${JSON.stringify({ at: new Date().toISOString(), reps: REPS, runs }, null, 1)}\n`)
report(runs)

function report(rs) {
  console.log(`\n${'═'.repeat(96)}\n  ROUTER RELIABILITY\n${'═'.repeat(96)}`)
  console.log(`\n  ${'skill'.padEnd(18)} ${'phrasing'.padEnd(10)} fired      collisions`)
  const bySkill = {}
  for (const cell of [...new Set(rs.map((r) => `${r.skill}|${r.phrasing}`))]) {
    const [sk, ph] = cell.split('|')
    const set = rs.filter((r) => r.skill === sk && r.phrasing === ph)
    const hit = set.filter((r) => r.fired).length
    const coll = set.filter((r) => r.other).length
    bySkill[sk] ??= { hit: 0, n: 0, byPhrasing: {} }
    bySkill[sk].hit += hit; bySkill[sk].n += set.length
    bySkill[sk].byPhrasing[ph] = { hit, n: set.length }
    console.log(`  ${sk.replace('skill.', '').padEnd(18)} ${ph.padEnd(10)} ${`${hit}/${set.length}`.padEnd(10)} ${coll || ''}`)
  }
  console.log(`\n  ⇒ per skill:`)
  for (const [sk, v] of Object.entries(bySkill)) {
    const ph = Object.entries(v.byPhrasing).map(([k, x]) => `${k} ${x.hit}/${x.n}`).join('  ')
    console.log(`     ${sk.replace('skill.', '').padEnd(18)} ${v.hit}/${v.n}   (${ph})`)
  }
  // ⭐⭐ THE DIAGNOSIS, and it is the only reason for two phrasings.
  console.log(`\n  ── which explanation does the data support? ──`)
  for (const [sk, v] of Object.entries(bySkill)) {
    const nat = v.byPhrasing.natural, exp = v.byPhrasing.explicit
    if (!nat || !exp) { console.log(`     ${sk}: both phrasings needed to tell`); continue }
    const gap = (exp.hit / exp.n) - (nat.hit / nat.n)
    const verdict = Math.abs(gap) >= 0.5
      ? (gap > 0 ? '⭐ DESCRIPTION — it fires on the description\'s own vocabulary and not on a natural request'
        : '⚠️ inverted — it fires on the natural phrasing and not the explicit one, which is worth reading twice')
      : (v.hit === v.n ? '✓ reliable on both phrasings'
        : (v.hit === 0 ? '⛔ never fires on either — not variance, and not the wording'
          : '⚠️ VARIANCE — no phrasing effect; the misses are spread across both'))
    console.log(`     ${sk.replace('skill.', '').padEnd(18)} ${verdict}`)
  }
  console.log(`\n  ⛔ n is small. ${rs.length} turns total, and a binary rate does not resolve at this size —`)
  console.log(`     this separates a PHRASING EFFECT from noise, which is a coarser and more answerable`)
  console.log(`     question than "what is the true rate". ⛔ Nothing here licenses changing the router.\n`)
}

// ══ CLEANUP · by id set, same contract as every other harness ═════════════════════════════════════
if (!argv.includes('--keep') && cids.length) {
  const q = (sql, p) => pg.query(sql, p).then((r) => r.rows)
  const rows = await q(
    `select c.id::text id, c.title, u.username, u.id::text uid from ${S}.txn_conversations c
       join ${S}.mst_users u on u.id = c.user_id where c.id = any($1::uuid[])`, [cids])
  const bad = safetyViolations(rows, {
    rootUserId: config?.auth?.root?.userConnected ?? null, rootName: config?.auth?.root?.username ?? 'ote',
  })
  const und = await undeclaredReferences(q, S)
  if (bad.length || und.length) console.log(`  ⛔ CLEANUP REFUSED — ${[...bad, ...und].join('; ')}`)
  else {
    const before = new Set((await q(`select id::text id from ${S}.txn_conversations`)).map((r) => r.id))
    const removed = await deleteConversations(q, S, cids)
    const after = new Set((await q(`select id::text id from ${S}.txn_conversations`)).map((r) => r.id))
    const v = verifyRemoval(before, after, cids)
    await new Promise((r) => setTimeout(r, 3000))
    const swept = await sweepOrphanEmbeddings(q, S)
    console.log(`  ⭐ corpus restored: ${removed.txn_conversations?.length ?? 0} conversation(s), `
      + `${removed.txn_messages?.length ?? 0} message(s), ${swept.length} orphan(s) swept`
      + `${v.unintended.length || v.survived.length ? ' ⛔ VERIFICATION FAILED' : ' ✓ verified by id set'}\n`)
  }
}
await pg.end()
