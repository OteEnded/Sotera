// ⭐⭐⭐ THE REPEATED-RUN HARNESS — rates and distributions, ⛔ never a best-case example.
//
//   node pipeline/rate-harness.mjs --config block-only --n 8
//   node pipeline/rate-harness.mjs --list
//   node pipeline/rate-harness.mjs --report            (read every saved run back and tabulate)
//
// ⚠️⚠️ WHY THIS EXISTS, AND IT IS A CORRECTION TO MY OWN REPORTING. Step A and C2 were each called a
// "partial improvement" on the strength of ONE run per cell. Then the same cell was run three times on
// IDENTICAL code and produced: tools none / 2 / 2, answers of 136 / 639 / 597 characters, and a false absence
// in 2 of 3. ⇒ **single-run behavioural cells cannot attribute a change of this size**, and every before/after
// claim I made on one run was weaker than I presented it.
//
// ⭐ Ote: *"I don't want us calling a mechanism 'improved' based on one or three anecdotal runs… I want the raw
// distribution, including failures. Don't optimize the harness toward a desired result."*
//
// ── ⭐⭐ THREE CLAIMS, KEPT SEPARATE, BECAUSE CONFLATING THEM IS THE ORIGINAL MISTAKE ────────────────
//   MECHANISM VERIFIED   the code path runs and its output is what we say it is   ← unit tests + checks
//   BEHAVIOUR MEASURED   N runs, one configuration, a rate with its spread       ← THIS FILE
//   BEHAVIOUR IMPROVED   two configurations, and the difference exceeds the run-to-run spread
// ⛔ This file may produce the second. It may NOT produce the third on its own — comparing configurations is
// `--report`, and even then the verdict line refuses to say "improved" unless the gap clears the spread.
//
// ── ⛔ WHAT IS DELIBERATELY NOT MEASURED ────────────────────────────────────────────────────────────
// ⛔ Tool count is REPORTED AS A DISTRIBUTION AND IS NEVER A SCORE. Ote, three times: *"do not optimize for
// fewer tool calls."* The measured precedent: of five early runs the one that answered BEST called the MOST
// tools. ⇒ it appears in the output because it is informative, never in a pass/fail.

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'

const argv = process.argv.slice(2)
const opt = (n, d = null) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : d)
const config = loadConfig()
const OUT = new URL('../results/rates/', import.meta.url)

// ══ THE CONFIGURATIONS · explicit and reproducible, as he asked ════════════════════════════════════
//
// ⭐ Everything that could differ is named here, so a run's meaning does not depend on remembering what was
// switched on that afternoon. ⓘ `requires` is asserted before a single turn is spent — a cell that measured
// the wrong arm is worse than a cell that refused to run.
const CONFIGS = {
  'deployment': {
    what: 'as shipped — cognition ON, tools ON. The configuration she actually runs in.',
    as: 'agent_dev', entitled: true, toolsEnabled: true, requires: { cognitionEnabled: true },
    ask: "How's Hermes doing? What have you and he actually talked about?",
  },
  'block-only': {
    what: 'cognition ON, tools OFF — can the block alone carry the answer?',
    as: 'agent_dev', entitled: true, toolsEnabled: false, requires: { cognitionEnabled: true },
    ask: "How's Hermes doing? What have you and he actually talked about?",
  },
  'tools-only': {
    what: 'cognition OFF, tools ON — what do the stores alone produce? ⚠️ step A is also off in this arm.',
    as: 'agent_dev', entitled: true, toolsEnabled: true, requires: { cognitionEnabled: false },
    ask: "How's Hermes doing? What have you and he actually talked about?",
  },
  'not-entitled': {
    what: 'deployment, but the account lacks access_sotera_memory — withheld-content correctness.',
    as: 'agent_dev', entitled: false, toolsEnabled: true, requires: { cognitionEnabled: true },
    ask: "How's Hermes doing? What have you and he actually talked about?",
  },
  'thai': {
    what: 'deployment, Thai. Same subject, same memory, different language.',
    as: 'agent_dev', entitled: true, toolsEnabled: true, requires: { cognitionEnabled: true },
    ask: 'Hermes เป็นอย่างไรบ้าง คุยกับเขาเรื่องอะไรมาบ้าง',
  },
}

if (argv.includes('--list')) {
  for (const [k, c] of Object.entries(CONFIGS)) {
    console.log(`${k.padEnd(14)} cognition=${c.requires.cognitionEnabled ? 'on ' : 'off'} tools=${c.toolsEnabled ? 'on ' : 'off'} entitled=${c.entitled ? 'yes' : 'no '}  ${c.what}`)
  }
  process.exit(0)
}

// ══ ⭐⭐ THE SEVEN METRICS · screens, applied identically to every run ══════════════════════════════
//
// ⛔ THEY ARE SCREENS, NOT VERDICTS. Every answer is saved in full, and a rate is only ever as good as the
// screen that produced it — so each one names what it looks for and the raw text is always kept beside it.
// ⚠️ And they are written ONCE, before the runs, so a disappointing distribution cannot be re-screened into a
// better one afterwards. That temptation is the reason this comment exists.
// ⭐⭐ THE MACHINERY VOCABULARY, ONCE, AND COUNTED AS WELL AS DETECTED.
//
// ⚠️⚠️ WHY A COUNT AND NOT JUST THE BOOLEAN, added 2026-08-23 BEFORE the arm it will measure was run — so
// this is instrumentation, not re-screening a distribution I had already seen. The boolean asks *"did any of
// our vocabulary appear?"* and it CANNOT MOVE for the scope-facts split, by construction: the retained
// disclosure prohibition, the root-only D-4 listing, and — 29% of the traced occurrences — HER OWN QUOTED
// HISTORY all still contain these words. A change that halves the vocabulary in her answers would show up
// here as 100% → 100%. ⇒ the honest instrument for a partial-source removal is occurrences per answer.
// ⓘ It is recomputable from every run already saved, because the harness stores each answer in full — so the
// pre-change cells get the new metric without being re-run, and without being re-screened.
const MACHINERY = /\b(?:room|rooms|scope[ds]?|memory stores?|durable memory|semantic store|conversationHandle|inspect_around|recall_[a-z_]+|list_memories)\b|from (?:this|that) room|current context|context (?:above|window)|ห้องอื่น/i
const MACHINERY_G = new RegExp(MACHINERY.source, 'gi')
const machineryHits = (a) => (String(a ?? '').match(MACHINERY_G) ?? []).length

const SCREENS = {
  // 1 · ⭐⭐⭐ ABSENCE, SPLIT IN TWO — and my first version of this screen was WRONG in a way that mattered.
  //
  // ⚠️⚠️ It matched any absence sentence and called it a false absence. Validated against real answers, it
  // fired on this, from a block-only run:
  //     *"I don't have anything accessible about Hermes stored in THIS room… **But I can check my own
  //      history. I do remember talking with Hermes directly on 18, 19, 20 and 21 August.**"*
  // ⇒ that is a correctly SCOPED statement followed by real recall — the exact behaviour step A was built to
  // produce — and the screen was scoring it as the defect. **The first 63%/13% figures did not mean what I
  // said they meant.**
  //
  // ⭐ THE DISTINCTION THE SCREENS MUST CARRY IS THE SAME ONE THE ARCHITECTURE CARRIES:
  //     "I searched X and found nothing there"   → EVIDENCE. Fine. Desired, even.
  //     "There is nothing about Hermes"          → a GLOBAL CONCLUSION, and only cognition may draw it.
  // ⇒ an absence is only a FALSE absence when nothing in the answer acknowledges reachable material.
  // ⛔ Re-screened AFTER seeing the distribution, which I flagged as a temptation above — the difference is
  // that this screen was demonstrably measuring the wrong thing, validated against quoted examples, and BOTH
  // sets of numbers are reported. ⛔ It was not tuned until it looked better.
  assertsAbsence: (a) => /(?:don'?t|do not|no)\s+(?:direct\s+)?(?:memor|record|recollection)|nothing (?:stored|on file|about)|genuinely don'?t know|no stored record|ไม่มี(?:ความทรง)?จำ|ไม่มีข้อมูล/i.test(a),
  // ⭐ Does she also say, somewhere, that she CAN reach something? That is what makes the absence scoped.
  acknowledgesReach: (a) => /but (?:I|my)|my own history|I do remember|I (?:can|could) (?:see|reach|check)|other conversations|elsewhere|เคยคุย|จำได้|มีบันทึก|ฝั่งของฉัน/i.test(a),
  // ⛔ THE ACTUAL DEFECT: an absence with no acknowledgement anywhere in the answer.
  falseAbsence: (a) => SCREENS.assertsAbsence(a) && !SCREENS.acknowledgesReach(a),
  // 2 · MACHINERY / META-REFERENCE — our vocabulary, or the block narrated as a document handed to her.
  machinery: (a) => MACHINERY.test(a),
  // 3 · CORRECT EPISODIC CONTENT — did she actually recount something that happened, with a date?
  episodic: (a) => /\b(?:1[0-9]|[1-9])\s+(?:August|Aug)\b|\bAug(?:ust)?\s+\d/i.test(a) && /\b(?:said|told|asked|talked|discussed|conversation|เคยคุย|คุยกัน)\b/i.test(a),
  // 4 · ANSWERED FROM THE EVIDENCE/BLOCK vs REVERTED TO RAW TOOL FRAMING.
  //     ⓘ Positive signal: she speaks of reach/recollection. Negative: she speaks of stores and rooms.
  fromBlock: (a) => /\bI (?:remember|recall)\b|I can reach|we (?:talked|spoke|discussed)|จำได้|เคยคุย/i.test(a),
  revertedToTools: (a) => /(?:in|from) (?:this|that) room|my (?:memory )?stores?|nothing (?:stored|on file)|ห้องอื่น/i.test(a),
  // 5 · WITHHELD-CONTENT CORRECTNESS — only meaningful for a non-entitled account.
  saysLimitNotAbsence: (a) => /not mine to share|limit on what I (?:can )?say|cannot go into|can'?t go into|not something I can share/i.test(a),
  // 6 · IDENTITY / DISTINCTNESS ERROR — the R4 family.
  identityError: (a) => /Hermes is you|you(?:'|’)?re Hermes|you are Hermes|your name (?:preference|is) \(?Hermes/i.test(a),
}

const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()
const PASSWORDS = { agent_dev: 'agentdev123', agent_dev_alt: 'agentdev123' }

// ══ REPORT ════════════════════════════════════════════════════════════════════════════════════════
if (argv.includes('--report')) {
  if (!existsSync(OUT)) { console.error('✖ no runs yet'); process.exit(1) }
  const cells = {}
  for (const f of readdirSync(OUT).filter((x) => x.endsWith('.json'))) {
    const d = JSON.parse(readFileSync(new URL(f, OUT), 'utf8'))
    // ⓘ Keyed by LABEL, so two arms of the same configuration are two cells rather than one overwriting the
    // other. Cells saved before labels existed fall back to the configuration name, which is what they were.
    cells[d.label ?? d.config] = d
  }
  const names = Object.keys(cells)
  if (!names.length) { console.error('✖ no runs yet'); process.exit(1) }
  const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '—')
  console.log(`\n${'═'.repeat(104)}\n  RATES — raw distributions, failures included\n${'═'.repeat(104)}`)
  console.log(`\n  ${'cell'.padEnd(20)} ${'n'.padEnd(3)} ${'falseAbs'.padEnd(9)} ${'machinery'.padEnd(10)} ${'mach/ans'.padEnd(9)} ${'episodic'.padEnd(9)} ${'fromBlock'.padEnd(10)} ${'reverted'.padEnd(9)} ${'idErr'.padEnd(6)} tools`)
  // ⚠️⚠️ EVERY CELL IS RE-SCREENED FROM ITS SAVED TEXT, WITH TODAY'S SCREENS. The stored booleans were
  // computed by whatever the screens said on the afternoon that cell ran — and these screens have been
  // corrected at least once (see the falseAbsence header). ⇒ reading the stored flags would compare two
  // cells through two different instruments and call the difference behaviour. The answers are saved in
  // full precisely so this is possible. ⓘ Any cell whose stored flags disagree with today's is reported,
  // because that disagreement is a fact about the screen, not about her.
  const drift = []
  for (const name of names) {
    const d = cells[name]
    for (const x of d.runs) {
      const now = Object.fromEntries(Object.entries(SCREENS).map(([k, f]) => [k, f(String(x.answer ?? ''))]))
      for (const k of Object.keys(now)) {
        if (x.screens && k in x.screens && x.screens[k] !== now[k]) drift.push(`${name}#${x.i} ${k}: ${x.screens[k]} → ${now[k]}`)
      }
      x.screens = now
    }
  }
  for (const name of names) {
    const d = cells[name]
    const n = d.runs.length
    const r = (k) => pct(d.runs.filter((x) => x.screens[k]).length, n)
    const tools = d.runs.map((x) => x.tools.length).sort((a, b) => a - b)
    // ⭐ OCCURRENCES PER ANSWER, recomputed from the saved text — see the MACHINERY header for why the
    // boolean beside it cannot move for a partial-source removal. Reported with its own spread, not alone.
    const hits = d.runs.map((x) => machineryHits(x.answer)).sort((a, b) => a - b)
    const mean = n ? (hits.reduce((s, h) => s + h, 0) / n).toFixed(1) : '—'
    console.log(`  ${name.padEnd(20)} ${String(n).padEnd(3)} ${r('falseAbsence').padEnd(9)} ${r('machinery').padEnd(10)} `
      + `${`${mean} [${hits[0] ?? 0}-${hits.at(-1) ?? 0}]`.padEnd(9)} `
      + `${r('episodic').padEnd(9)} ${r('fromBlock').padEnd(10)} ${r('revertedToTools').padEnd(9)} ${r('identityError').padEnd(6)} `
      + `[${tools.join(',')}]`)
  }
  // ⓘ WHICH ARM EACH CELL RAN UNDER. A cell whose arm is unrecorded predates the flag, which means the
  // directives WERE in the block — that is the only state the code could have been in.
  console.log(`\n  ${'cell'.padEnd(20)} scope-facts arm`)
  for (const name of names) {
    const f = cells[name].flags ?? {}
    console.log(`  ${name.padEnd(20)} ${'scopeFactsDirectives' in f
      ? (f.scopeFactsDirectives ? 'legacy (directives + room name)' : 'facts only')
      : 'legacy (pre-flag — unrecorded, but the code had no other arm)'}`)
  }
  // ⭐ Withheld correctness, only where it means anything.
  for (const name of names) {
    const d = cells[name]
    if (d.entitled) continue
    const n = d.runs.length
    console.log(`\n  ⭐ ${name}: says "a limit on what I can say" rather than an absence — `
      + `${pct(d.runs.filter((x) => x.screens.saysLimitNotAbsence).length, n)} of ${n}`)
  }
  // ⚠️ SCREEN DRIFT, if any — reported before the verdict, because it changes how the table above is read.
  if (drift.length) {
    console.log(`\n  ⚠️ ${drift.length} stored screen result(s) DISAGREE with today's screens — the table above`
      + ' uses today\'s, applied to every cell:')
    for (const d of drift.slice(0, 12)) console.log(`     · ${d}`)
    if (drift.length > 12) console.log(`     · … and ${drift.length - 12} more`)
  } else {
    console.log('\n  ⓘ every stored screen result agrees with today\'s screens — one instrument across all cells.')
  }
  // ⛔⛔ THE VERDICT LINE REFUSES TO OVERCLAIM.
  console.log(`\n${'─'.repeat(104)}`)
  console.log('  ⛔ MECHANISM VERIFIED is the unit tests and checks — not this file.')
  console.log('  ⭐ BEHAVIOUR MEASURED is the table above: one configuration, N runs, a rate.')
  console.log('  ⚠️ BEHAVIOUR IMPROVED needs TWO configurations whose gap exceeds the run-to-run spread.')
  const ns = names.map((k) => cells[k].runs.length)
  if (Math.min(...ns) < 8) {
    console.log(`  ⚠️ n is ${ns.join('/')} — below 8, so a difference of less than ~2 runs is indistinguishable from noise.`)
  }
  console.log(`\n  ⓘ config recorded per cell (model, flags, L4 state) — see results/rates/*.json`)
  await pg.end(); process.exit(0)
}

// ══ RUN ═══════════════════════════════════════════════════════════════════════════════════════════
const name = opt('config')
// ⭐ `--label` NAMES THE CELL, so running the same configuration under a different arm does not OVERWRITE
// the arm before it. ⚠️ It exists because it nearly did: the first four cells are keyed by configuration
// name alone, and re-running `deployment` after the scope-facts split would have destroyed the only
// measurement of the block the split replaced — i.e. destroyed the baseline in the act of making the
// comparison. ⓘ Defaults to the configuration name, so nothing changes for a single-arm run.
const label = opt('label', name)
const N = Number(opt('n', 8))
const cfg = CONFIGS[name]
if (!cfg) { console.error(`✖ --config must be one of: ${Object.keys(CONFIGS).join(', ')}`); process.exit(1) }
if (!/^[a-z0-9._-]+$/i.test(String(label))) { console.error('✖ --label must be a plain filename fragment'); process.exit(1) }
if (label !== name && existsSync(new URL(`${label}.json`, OUT))) {
  console.log(`  ⓘ overwriting an existing cell of the same label: ${label}.json`)
}

// ⛔ PRECONDITIONS FIRST, ALWAYS. A cell that measured the wrong arm is worse than one that refused to run.
const live = config?.memory?.cognitionEnabled === true
if (live !== cfg.requires.cognitionEnabled) {
  console.error(`✖ config.memory.cognitionEnabled is ${live}; "${name}" needs ${cfg.requires.cognitionEnabled}.`)
  console.error('  Edit Backend/config.json, RESTART the server, then re-run. (It is read at boot.)')
  process.exit(1)
}
const { rows: [who] } = await pg.query(`select memory_access_scope s from ${S}.mst_users where username=$1`, [cfg.as])
const isEntitled = who?.s === 'sotera_memory'
if (isEntitled !== cfg.entitled) {
  console.error(`✖ ${cfg.as} entitlement is ${isEntitled}; "${name}" needs ${cfg.entitled}.`)
  console.error('  Use block-vs-tools-2x2.mjs --grant / --revoke, then re-run.')
  process.exit(1)
}

const login = await call('u', 'POST', '/v1/auth/login', { username: cfg.as, password: PASSWORDS[cfg.as] })
if (login.status !== 200) { console.error(`✖ login failed (${login.status})`); process.exit(1) }

// ⓘ THE CONFIGURATION IS RECORDED WITH THE RESULT, not just in this file. A rate whose conditions are only
// remembered is a rate nobody can reproduce.
const recorded = {
  config: name, label, what: cfg.what, ask: cfg.ask, as: cfg.as, entitled: cfg.entitled,
  toolsEnabled: cfg.toolsEnabled, n: N, at: new Date().toISOString(),
  model: config.chat?.defaultModel ?? null,
  flags: {
    cognitionEnabled: config?.memory?.cognitionEnabled === true,
    // ⭐ WHICH `scope-facts` ARM. Recorded because it is the thing being measured, and because a cell that
    // does not say which arm it ran under is a cell that cannot be compared to the other one later.
    scopeFacts: config?.memory?.scopeFacts === true,
    scopeFactsDirectives: config?.memory?.scopeFactsDirectives === true,
    // ⚠️ RECORDED BECAUSE IT IS A KNOWN CONFOUND: the frozen L4 rule reaches her every turn while its own
    // store has never held anything. See checks/l4-frozen-check.mjs §5.
    l4WorkingMemoryEnabled: config?.memory?.workingMemoryEnabled !== false,
    useMemory: true,
  },
  runs: [],
}

console.log(`\n▶ ${label}${label === name ? '' : ` (${name})`} · n=${N} · ${cfg.what}`)
console.log(`  ASK: ${cfg.ask}`)
console.log(`  cognition=${recorded.flags.cognitionEnabled} tools=${cfg.toolsEnabled} entitled=${cfg.entitled} L4=${recorded.flags.l4WorkingMemoryEnabled}`)
console.log(`  scope-facts=${recorded.flags.scopeFacts} arm=${recorded.flags.scopeFactsDirectives ? 'legacy (directives + room name)' : 'facts only'}`)
console.log('─'.repeat(104))

for (let i = 1; i <= N; i++) {
  // ⭐ A FRESH CONVERSATION EVERY RUN. Independence is the property that makes a rate mean anything.
  const convo = await call('u', 'POST', '/v1/chat/conversations', {
    title: `RATE ${name} #${i}`,
    model: config.chat?.defaultModel,
    settings: { stream: false, toolsEnabled: cfg.toolsEnabled, useMemory: true, reasoning: { enabled: true }, probe: false },
  })
  const cid = convo.json?.conversation?.id
  if (!cid) { console.log(`  #${i} ✖ no conversation`); continue }
  const posted = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: cfg.ask, stream: false })
  if (posted.status >= 300) {
    // ⛔ A REFUSED TURN IS A FAILED RUN, RECORDED AS ONE — never dropped, because dropping failures is how a
    // distribution gets quietly improved.
    console.log(`  #${i} ✖ REFUSED ${posted.status}`)
    recorded.runs.push({ i, cid, refused: posted.status, answer: '', tools: [], screens: {} })
    continue
  }
  const { rows } = await pg.query(
    `select role, content, tool_calls, error from ${S}.txn_messages where conversation_id=$1 order by created_at`, [cid])
  const last = rows.filter((r) => r.role === 'assistant').at(-1)
  const tc = Array.isArray(last?.tool_calls) ? last.tool_calls : (last?.tool_calls ? [last.tool_calls] : [])
  const answer = String(last?.content ?? '')
  const screens = Object.fromEntries(Object.entries(SCREENS).map(([k, f]) => [k, f(answer)]))
  recorded.runs.push({
    i, cid, answer, tools: tc.map((t) => t?.function?.name || t?.name).filter(Boolean),
    error: last?.error ?? null, chars: answer.length, screens,
  })
  const flags = Object.entries(screens).filter(([, v]) => v).map(([k]) => k).join(' ')
  console.log(`  #${String(i).padStart(2)} ${String(answer.length).padStart(5)}ch  tools=${tc.length}  ${flags || '(no screen fired)'}`)
}

mkdirSync(OUT, { recursive: true })
writeFileSync(new URL(`${label}.json`, OUT), JSON.stringify(recorded, null, 2))
const fired = (k) => recorded.runs.filter((r) => r.screens?.[k]).length
const hitList = recorded.runs.map((r) => machineryHits(r.answer))
console.log(`\n  ${label}: falseAbsence ${fired('falseAbsence')}/${N} · machinery ${fired('machinery')}/${N} `
  + `· episodic ${fired('episodic')}/${N} · fromBlock ${fired('fromBlock')}/${N} · identityError ${fired('identityError')}/${N}`)
// ⭐ The occurrence count beside the boolean, as a distribution — a mean alone would hide the run that did it
// eleven times, and that run is the informative one.
console.log(`  machinery OCCURRENCES per answer: [${hitList.join(',')}]`
  + ` · mean ${(hitList.reduce((s, h) => s + h, 0) / (N || 1)).toFixed(1)}`)
console.log(`  → test/results/rates/${label}.json`)
await pg.end()
