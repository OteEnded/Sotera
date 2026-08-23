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
  machinery: (a) => /\b(?:room|rooms|scope[ds]?|memory stores?|durable memory|semantic store|conversationHandle|inspect_around|recall_[a-z_]+|list_memories)\b|from (?:this|that) room|current context|context (?:above|window)|ห้องอื่น/i.test(a),
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
    cells[d.config] = d
  }
  const names = Object.keys(cells)
  if (!names.length) { console.error('✖ no runs yet'); process.exit(1) }
  const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '—')
  console.log(`\n${'═'.repeat(104)}\n  RATES — raw distributions, failures included\n${'═'.repeat(104)}`)
  console.log(`\n  ${'config'.padEnd(14)} ${'n'.padEnd(3)} ${'falseAbs'.padEnd(9)} ${'machinery'.padEnd(10)} ${'episodic'.padEnd(9)} ${'fromBlock'.padEnd(10)} ${'reverted'.padEnd(9)} ${'idErr'.padEnd(6)} tools`)
  for (const name of names) {
    const d = cells[name]
    const n = d.runs.length
    const r = (k) => pct(d.runs.filter((x) => x.screens[k]).length, n)
    const tools = d.runs.map((x) => x.tools.length).sort((a, b) => a - b)
    console.log(`  ${name.padEnd(14)} ${String(n).padEnd(3)} ${r('falseAbsence').padEnd(9)} ${r('machinery').padEnd(10)} `
      + `${r('episodic').padEnd(9)} ${r('fromBlock').padEnd(10)} ${r('revertedToTools').padEnd(9)} ${r('identityError').padEnd(6)} `
      + `[${tools.join(',')}]`)
  }
  // ⭐ Withheld correctness, only where it means anything.
  for (const name of names) {
    const d = cells[name]
    if (d.entitled) continue
    const n = d.runs.length
    console.log(`\n  ⭐ ${name}: says "a limit on what I can say" rather than an absence — `
      + `${pct(d.runs.filter((x) => x.screens.saysLimitNotAbsence).length, n)} of ${n}`)
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
const N = Number(opt('n', 8))
const cfg = CONFIGS[name]
if (!cfg) { console.error(`✖ --config must be one of: ${Object.keys(CONFIGS).join(', ')}`); process.exit(1) }

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
  config: name, what: cfg.what, ask: cfg.ask, as: cfg.as, entitled: cfg.entitled,
  toolsEnabled: cfg.toolsEnabled, n: N, at: new Date().toISOString(),
  model: config.chat?.defaultModel ?? null,
  flags: {
    cognitionEnabled: config?.memory?.cognitionEnabled === true,
    // ⚠️ RECORDED BECAUSE IT IS A KNOWN CONFOUND: the frozen L4 rule reaches her every turn while its own
    // store has never held anything. See checks/l4-frozen-check.mjs §5.
    l4WorkingMemoryEnabled: config?.memory?.workingMemoryEnabled !== false,
    useMemory: true,
  },
  runs: [],
}

console.log(`\n▶ ${name} · n=${N} · ${cfg.what}`)
console.log(`  ASK: ${cfg.ask}`)
console.log(`  cognition=${recorded.flags.cognitionEnabled} tools=${cfg.toolsEnabled} entitled=${cfg.entitled} L4=${recorded.flags.l4WorkingMemoryEnabled}`)
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
writeFileSync(new URL(`${name}.json`, OUT), JSON.stringify(recorded, null, 2))
const fired = (k) => recorded.runs.filter((r) => r.screens?.[k]).length
console.log(`\n  ${name}: falseAbsence ${fired('falseAbsence')}/${N} · machinery ${fired('machinery')}/${N} `
  + `· episodic ${fired('episodic')}/${N} · fromBlock ${fired('fromBlock')}/${N} · identityError ${fired('identityError')}/${N}`)
console.log(`  → test/results/rates/${name}.json`)
await pg.end()
