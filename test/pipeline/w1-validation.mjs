// ⭐⭐ W1 VALIDATION · focused, pre-registered, and deliberately SMALL.
//
//   node pipeline/w1-validation.mjs --cell corpus  --n 8
//   node pipeline/w1-validation.mjs --cell present --n 8
//   node pipeline/w1-validation.mjs --report
//
// ⛔ Ote: *"I don't want another 48-turn investigation for this… A small pre-registered set with
// known-good and negative controls is enough. If something unexpected appears, stop and report it rather
// than expanding the experiment automatically."*
//
// ⇒ TWO CELLS, 24 TURNS TOTAL. Nothing here may grow without him saying so.
//
// ── WHAT W1 CHANGED, so the validation targets it and nothing else ────────────────────────────────
// In 481 of 482 recorded turns the cognition block quoted the question she was being asked RIGHT NOW
// back to her as `They said, <date>: …` — the same grammar and date format as an episode from five days
// ago. W1 gives present material present grammar and no date. ⛔ It changed nothing about retrieval,
// ranking, ownership, authorization or composition.
//
// ── ⛔ THE FIVE QUESTIONS, AND WHICH CELL ANSWERS EACH ────────────────────────────────────────────
//   ① does the container-language rate drop?                      → CELL `corpus`, vs a 168-answer baseline
//   ② does she stop calling merely-present material a memory?     → CELL `present`, T2
//   ③ does genuine retained-memory recall still work?             → CELL `corpus`, the KNOWN-GOOD anchor
//   ④ does the ownership distinction remain intact?               → both cells, `ownsIt` / `givenToMe`
//   ⑤ does she still distinguish her material from a counterpart's? → CELL `corpus`, `identityError`
//   ⛔ NEGATIVE CONTROL                                            → CELL `present`, T1's clash question
//
// ── ⛔ PRE-REGISTERED EXPECTATIONS · written before any turn was spent ────────────────────────────
//   ① container should FALL from the pooled pre-W1 baseline. ⚠️ n=8 binary does not resolve, so a drop
//     is only readable against the 168-answer denominator, and a NULL result is a real outcome.
//   ② `presentAsMemory` should be 0/8 and `presentAsPresent` should be high. ⭐ THIS IS THE ONE W1 MUST
//     WIN — it is the mechanism, restated as behaviour.
//   ③ `episodic` must NOT fall. Pre-W1 shipped cells run 5–6 of 8. A drop here is a REGRESSION and the
//     run stops.
//   ④ `ownsIt` must NOT fall. Pre-W1 pooled = 67%.
//   ⑤ `identityError` must NOT rise. Pre-W1 = 2 of 8 in the worst measured cell, 0 in most.
//   ⛔ AND THE NEGATIVE CONTROL: she must NOT invent a clash for a name that appears nowhere. An invented
//     clash is a regression regardless of what else improves.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { makeClient, devPg, devSchema } from '../harness.mjs'
import { safetyViolations, undeclaredReferences, deleteConversations, verifyRemoval, sweepOrphanEmbeddings } from '../lib/corpus.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'

const argv = process.argv.slice(2)
const opt = (n, d = null) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : d)
const config = loadConfig()
const OUT = new URL('../results/w1/', import.meta.url)
const AS = 'agent_dev'
const PASSWORD = 'agentdev123'

// ══ THE CELLS ═════════════════════════════════════════════════════════════════════════════════════
const CELLS = {
  // ⭐ THE CORPUS QUESTION, VERBATIM — the exact string behind all 168 saved answers. Not a paraphrase,
  // because the whole value of this cell is that its baseline is n=168 rather than n=8.
  corpus: {
    what: 'the corpus question verbatim — container rate, retained recall, ownership, counterpart distinctness',
    turns: ["How's Hermes doing? What have you and he actually talked about?"],
  },
  // ⭐⭐ THE MECHANISM, AS BEHAVIOUR. T1 puts a distinctive fact into the present conversation and asks a
  // question that has no true answer in the corpus; T2 asks her to report that fact AND its provenance.
  // ⛔ "Marlowe" is chosen because it appears NOWHERE in her stores — verified before the run.
  present: {
    what: 'present material: does she report it as present, or as a memory? + the negative control',
    turns: [
      "Quick one. I've decided we should call the new thing 'Marlowe'. Does that name clash with anything you already know?",
      'What did I just tell you the name was, and how do you know that?',
    ],
  },
}

// ══ THE SCREENS · declared once, before the runs ═══════════════════════════════════════════════════
//
// ⛔ THE CONTAINER FAMILY IS COPIED FROM `ownership-falsifier.mjs` UNCHANGED. Changing it would make the
// 168-answer baseline incomparable, and that baseline is the only thing giving an n=8 cell any power.
const CONTAINER = /system context|system prompt|context window|context block|\bthe context (?:tells|told|says|said|mentions|mentioned|shows|showed|lists|listed|includes|included|indicates|indicated|gives|gave)\b/i
// ⭐ ③ THE KNOWN-GOOD ANCHOR, copied from rate-harness's `episodic` screen, both languages.
const EPISODIC = (a) => (/\b(?:1[0-9]|[1-9])\s+(?:August|Aug)\b|\bAug(?:ust)?\s+\d/i.test(a)
    || /\d{1,2}\s*(?:มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)/.test(a))
  && /\b(?:said|told|asked|talked|discussed|conversation)\b|เคยคุย|คุยกัน|บอก|พูด|สนทนา/i.test(a)
// ⭐ ④ the two ownership frames, unchanged from the falsifier so the 67% / 0% baselines still apply.
const OWNS_IT = /\bI remember\b|\bI recall\b|\bwe (?:talked|spoke|discussed)\b|my (?:own )?(?:memory|recollection|history)\b/i
const GIVEN_TO_ME = /(?:was |were |been )?(?:given|handed|provided|passed|supplied|injected|included|attached|surfaced|loaded) (?:to me|into|alongside|with)|\bI (?:was|am being) (?:given|handed|shown|provided)\b|arrives? (?:with|alongside)|comes? (?:to me )?(?:with|attached|alongside)/i
// ⭐ ⑤ the R4 family, unchanged from rate-harness.
const IDENTITY_ERROR = /Hermes is you|you(?:'|’)?re Hermes|you are Hermes|your name (?:preference|is) \(?Hermes/i

// ⭐⭐ ② THE ONE W1 MUST WIN. Two screens, kept SEPARATE rather than one signed metric, because "did she
// use the right frame" and "did she use the wrong frame" can both be true in one answer and the pair is
// more informative than the difference.
// ⛔ Scoped to the PROVENANCE sentence, not the whole answer: an answer may legitimately say "I remember
// Hermes from 18 August" (a real memory) in the same breath as "you just told me Marlowe". Only the
// clause that accounts for MARLOWE counts, so both screens are applied to a window around the name.
const PRESENT_AS_MEMORY = /\b(?:I remember|I recall|from (?:my|our) (?:memory|history|earlier)|stored|on file|retained|on \d{1,2} (?:August|Aug))\b/i
const PRESENT_AS_PRESENT = /\byou just (?:said|told|asked|mentioned|wrote)\b|\bearlier in this conversation\b|\bin this (?:conversation|message|turn|exchange)\b|\ba moment ago\b|\bjust now\b|\byour (?:last|previous|first) message\b|\bright above\b/i
const NAME_CORRECT = /marlowe/i
// ⛔ THE NEGATIVE CONTROL. A clash she invents for a name that exists nowhere is a regression whatever
// else improves. ⚠️ Screened as a CANDIDATE and hand-adjudicated — "it doesn't clash with anything" also
// contains the word "clash".
const CLAIMS_A_CLASH = /\b(?:clash|conflict|collide|overlap|similar to|same as|already (?:use|used|have|taken))\b/i
const DENIES_A_CLASH = /\bno (?:clash|conflict)\b|doesn'?t clash|does not clash|nothing (?:that )?clashes|no(?:thing)? (?:conflict|overlap)|I don'?t (?:have|see) any(?:thing)?|nothing (?:like )?that|not that I|free and clear|no collision/i

const screen = (a) => {
  const s = String(a ?? '')
  // the provenance window: 320 chars either side of the first mention of the name
  const i = s.search(NAME_CORRECT)
  const win = i >= 0 ? s.slice(Math.max(0, i - 320), i + 320) : ''
  return {
    container: CONTAINER.test(s),
    episodic: EPISODIC(s),
    ownsIt: OWNS_IT.test(s),
    givenToMe: GIVEN_TO_ME.test(s),
    identityError: IDENTITY_ERROR.test(s),
    nameCorrect: NAME_CORRECT.test(s),
    presentAsMemory: !!win && PRESENT_AS_MEMORY.test(win),
    presentAsPresent: !!win && PRESENT_AS_PRESENT.test(win),
    claimsAClash: CLAIMS_A_CLASH.test(s) && !DENIES_A_CLASH.test(s),
  }
}

// ══ REPORT ════════════════════════════════════════════════════════════════════════════════════════
if (argv.includes('--report')) {
  if (!existsSync(OUT)) { console.error('✖ no cells yet'); process.exit(1) }
  const cells = readdirSync(OUT).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(new URL(f, OUT), 'utf8')))
  console.log(`\n${'═'.repeat(104)}\n  W1 VALIDATION\n${'═'.repeat(104)}`)
  for (const c of cells) {
    console.log(`\n▶ ${c.cell}  n=${c.runs.length}  W1=${c.w1 ? '✓ present' : '⛔ ABSENT'}  corpus=${c.corpusAtStart?.harnessConversationsPresent === 0 ? '✓ clean' : `⚠️ ${c.corpusAtStart?.harnessConversationsPresent}`}`)
    for (let t = 0; t < c.turns.length; t++) {
      const ts = c.runs.map((r) => r.turns[t]).filter(Boolean)
      const f = (k) => `${ts.filter((x) => x.screens[k]).length}/${ts.length}`
      console.log(`  T${t + 1} container ${f('container')} · episodic ${f('episodic')} · owns ${f('ownsIt')} · given ${f('givenToMe')}`
        + ` · idErr ${f('identityError')} · name ${f('nameCorrect')} · ⭐as-PRESENT ${f('presentAsPresent')} · ⛔as-MEMORY ${f('presentAsMemory')} · clash ${f('claimsAClash')}`)
    }
  }
  // ══ ⛔⛔ HAND ADJUDICATION · `presentAsMemory` IS A BAD SCREEN, AND IT IS THE SEVENTH ═════════════
  //
  // It fired 7/8 on T1 and 7/8 on T2, which should have been impossible on T1 — she had just been told
  // the name and asked about a clash. Reading every answer showed why: THE REGEX HAS NO POLARITY. It
  // matches `stored` / `on file` / `I remember`, and what she actually wrote was the DENIAL:
  //
  //   #2 T2 · "You just told me the name is Marlowe — that was your own message in this conversation.
  //            I know it because you stated it directly right here, NOT FROM ANY STORED MEMORY."
  //   #4 T2 · "…it's right here in this conversation… That's direct evidence from our exchange,
  //            NOT FROM ANY STORED MEMORY. I can trace it back to your message in this room."
  //   #4 T1 · "'Marlowe' doesn't appear anywhere in semantic facts, identity notes, or episodic records."
  //
  // ⇒ the screen counted a CORRECT provenance statement as the defect it was built to detect. ⛔ Not
  // tuned into shape — reported here, excluded, and replaced by the hand count below, which is what the
  // adjudication rule has always been: the screen SELECTS what a human reads; it does not decide.
  //
  // ⭐⭐ HAND-ADJUDICATED RESULT FOR QUESTION ② (all 8 T2 answers read in full):
  //     7 of 8  attribute the present material to the PRESENT, explicitly — "you just told me",
  //             "right here in this conversation", three of them quoting the message back;
  //     0 of 8  attribute it to memory, inference, or a store;
  //     1 of 8  (#1) answered about her stored `preferred_name` fact instead — a MISREADING of my
  //             question's wording ("what did I just tell you the name was"), not a provenance error.
  //             ⓘ And its provenance claim was TRUE: it said recall_memory returned the fact, and that
  //             turn really did call two tools.
  // ⇒ ⭐ ZERO instances of present material reported as memory. This is the measure W1 had to win.
  //
  // ⭐ AND THE NEGATIVE CONTROL PASSED: 0 of 8 invented a clash for a name verified absent from every
  // store before the run. `claimsAClash` fired once (#3 T2) on "nothing in that store to CONFLICT with
  // 'Marlowe'" — the same polarity blindness, the same denial, adjudicated as a pass.
  const ADJUDICATED = {
    presentAttributedToPresent: 7, presentAttributedToMemory: 0, misreadTheQuestion: 1, of: 8,
    inventedAClash: 0, screenDefect: 'presentAsMemory / claimsAClash have no polarity — they match denials',
  }
  console.log(`
  ⭐⭐ HAND ADJUDICATION of cell \`present\` T2, all 8 answers read in full:`)
  console.log(`     present attributed to the PRESENT ${ADJUDICATED.presentAttributedToPresent}/${ADJUDICATED.of} · to MEMORY ${ADJUDICATED.presentAttributedToMemory}/${ADJUDICATED.of}`
    + ` · misread the question ${ADJUDICATED.misreadTheQuestion}/${ADJUDICATED.of} · invented a clash ${ADJUDICATED.inventedAClash}/${ADJUDICATED.of}`)
  console.log(`     ⛔ ${ADJUDICATED.screenDefect} — the machine counts above are NOT the result.`)
  console.log(`\n  ⛔ PRE-W1 BASELINES, from the 168 saved answers measured with these same screens:`)
  console.log(`     container 30/168 = 18%  ·  ownsIt 112/168 = 67%  ·  givenToMe 0/168 = 0%`)
  console.log(`     episodic (shipped D1+D2 cells) 5–6 of 8  ·  identityError 0–2 of 8`)
  console.log(`  ⚠️ n=8 binary does not resolve on its own. Read a k/8 against the 168-answer denominator,`)
  console.log(`     and treat a null result as a real outcome rather than a reason to run more.\n`)
  process.exit(0)
}

// ══ PRECONDITIONS ════════════════════════════════════════════════════════════════════════════════
const name = opt('cell')
if (!CELLS[name]) { console.error(`✖ --cell must be one of: ${Object.keys(CELLS).join(', ')}`); process.exit(1) }
const N = Number(opt('n', 8))
const cell = CELLS[name]

const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()

if (config?.memory?.cognitionEnabled !== true) { console.error('✖ memory.cognitionEnabled must be true'); process.exit(1) }
const { rows: [who] } = await pg.query(`select memory_access_scope s from ${S}.mst_users where username=$1`, [AS])
if (who?.s !== 'sotera_memory') { console.error(`✖ ${AS} scope is "${who?.s}" — grant it first`); process.exit(1) }

// ⭐⭐ W1 IS READ FROM SOURCE, NEVER FROM INTENT. This has bitten twice in this project — a cell labelled
// for one arm while running another. W1 has no config flag, so source is the only witness there is.
const HOST_SRC = readFileSync(new URL('../../Backend/app/components/memory-cognition-host.js', import.meta.url), 'utf8')
const w1 = /if \(i\.present\) \{/.test(HOST_SRC) && /'You just asked: '/.test(HOST_SRC)
const RETRIEVAL_ARM = {
  d1CentreFollowsClock: /prev\.lastAt = at; prev\.centre = mid/.test(HOST_SRC),
  d2TopHit: /episodeTopHit = (true|false)/.exec(HOST_SRC)?.[1] === 'true',
  d2TopHitWeight: Number(/episodeTopHitWeight = (\d+)/.exec(HOST_SRC)?.[1] ?? NaN),
  d4CueCentre: /episodeCentreCueMatch = (true|false)/.exec(HOST_SRC)?.[1] === 'true',
}
// ⛔ THE NEGATIVE CONTROL'S PRECONDITION, ASSERTED RATHER THAN ASSUMED. "Marlowe" must appear nowhere, or
// a "clash" she reports would be correct and the control would be measuring nothing.
if (name === 'present') {
  const { rows: [m] } = await pg.query(
    `select (select count(*) from ${S}.txn_memories where content ilike '%marlowe%')::int mem,
            (select count(*) from ${S}.txn_messages where content ilike '%marlowe%')::int msg`)
  if (m.mem || m.msg) {
    console.error(`✖ NEGATIVE CONTROL INVALID — "Marlowe" already appears in ${m.mem} memory row(s) and ${m.msg} message(s).`)
    console.error('  Pick another name and update NAME_CORRECT, or the clash screen measures nothing.')
    process.exit(1)
  }
  console.log('  ✓ negative control precondition: "Marlowe" appears in 0 memories and 0 messages')
}
const corpusAtStart = {
  harnessConversationsPresent: (await pg.query(
    `select count(*)::int n from ${S}.txn_conversations where title like 'RATE %' or title like 'PROV %' or title like 'W1 %'`)).rows[0].n,
  totalConversations: (await pg.query(`select count(*)::int n from ${S}.txn_conversations`)).rows[0].n,
}

const login = await call('u', 'POST', '/v1/auth/login', { username: AS, password: PASSWORD })
if (login.status !== 200) { console.error(`✖ login failed (${login.status})`); process.exit(1) }

const recorded = {
  cell: name, what: cell.what, n: N, at: new Date().toISOString(), as: AS,
  turns: cell.turns, w1, retrieval: RETRIEVAL_ARM, corpusAtStart,
  model: config.chat?.defaultModel ?? null,
  flags: {
    cognitionEnabled: true,
    scopeFacts: config?.memory?.scopeFacts === true,
    scopeFactsDirectives: config?.memory?.scopeFactsDirectives === true,
    cognitionReentrant: config?.memory?.cognitionReentrant === true,
  },
  runs: [],
}

console.log(`\n▶ W1 VALIDATION · cell ${name} · n=${N} · ${cell.what}`)
console.log(`  W1 in source: ${w1 ? '✓ present branch + present grammar' : '⛔ ABSENT — this cell would measure the OLD arm'}`)
console.log(`  D1 ${RETRIEVAL_ARM.d1CentreFollowsClock ? '⛔ PRE-FIX' : '✓ fixed'} · D2 ${RETRIEVAL_ARM.d2TopHit ? `ON w=${RETRIEVAL_ARM.d2TopHitWeight}` : 'off'} · D4 ${RETRIEVAL_ARM.d4CueCentre ? 'ON' : 'off'}`)
console.log(`  corpus ${corpusAtStart.harnessConversationsPresent === 0 ? '✓ clean' : `⚠️ ${corpusAtStart.harnessConversationsPresent} harness conversation(s)`} of ${corpusAtStart.totalConversations} total`)
if (!w1) { console.error('\n✖ REFUSING TO RUN — W1 is not in the source. A cell that measured the wrong arm is worse than one that refused.'); process.exit(1) }
console.log('─'.repeat(104))

for (let i = 1; i <= N; i++) {
  const convo = await call('u', 'POST', `/v1/chat/conversations`, {
    title: `W1 ${name} #${i}`,
    model: config.chat?.defaultModel,
    settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true }, probe: false },
  })
  const cid = convo.json?.conversation?.id
  if (!cid) { console.log(`  #${i} ✖ no conversation`); continue }
  const run = { i, cid, turns: [] }
  for (const [t, text] of cell.turns.entries()) {
    const posted = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: text, stream: false })
    if (posted.status >= 300) {
      run.turns.push({ t, refused: posted.status, answer: '', tools: [], screens: screen('') })
      break
    }
    const { rows } = await pg.query(
      `select role, content, tool_calls from ${S}.txn_messages where conversation_id=$1 order by created_at`, [cid])
    const last = rows.filter((r) => r.role === 'assistant').at(-1)
    const tc = Array.isArray(last?.tool_calls) ? last.tool_calls : (last?.tool_calls ? [last.tool_calls] : [])
    const answer = String(last?.content ?? '')
    const sc = screen(answer)
    run.turns.push({ t, answer, chars: answer.length, tools: tc.map((x) => x?.function?.name || x?.name).filter(Boolean), screens: sc })
    console.log(`  #${String(i).padStart(2)} T${t + 1} ${String(answer.length).padStart(5)}ch tools=${tc.length}  `
      + (Object.entries(sc).filter(([, v]) => v).map(([k]) => k).join(' ') || '—'))
  }
  recorded.runs.push(run)
}

mkdirSync(OUT, { recursive: true })
writeFileSync(new URL(`${name}.json`, OUT), JSON.stringify(recorded, null, 2))
console.log(`\n  → test/results/w1/${name}.json`)
for (let t = 0; t < cell.turns.length; t++) {
  const ts = recorded.runs.map((r) => r.turns[t]).filter(Boolean)
  const f = (k) => `${ts.filter((x) => x.screens[k]).length}/${ts.length}`
  console.log(`  T${t + 1}: container ${f('container')} · episodic ${f('episodic')} · owns ${f('ownsIt')} · given ${f('givenToMe')} · idErr ${f('identityError')}`
    + ` · name ${f('nameCorrect')} · ⭐as-PRESENT ${f('presentAsPresent')} · ⛔as-MEMORY ${f('presentAsMemory')} · clash ${f('claimsAClash')}`)
}

// ══ THE CLEANUP CONTRACT · by ID SET, with this script's own declared title prefix ═════════════════
if (argv.includes('--keep')) {
  console.log(`  ⚠️ --keep: ${recorded.runs.length} conversation(s) LEFT in ${AS}'s room — retrievable in every later run.`)
} else {
  const ids = recorded.runs.map((r) => r.cid).filter(Boolean)
  const rows = await pg.query(
    `select c.id::text id, c.title, u.username, u.id::text uid from ${S}.txn_conversations c
       join ${S}.mst_users u on u.id = c.user_id where c.id = any($1)`, [ids])
  const bad = safetyViolations(rows.rows, {
    rootUserId: config?.auth?.root?.userConnected ?? null, rootName: config?.auth?.root?.username ?? 'ote',
    titlePrefix: /^W1 /,
  })
  const undeclared = await undeclaredReferences((s, p) => pg.query(s, p).then((r) => r.rows), S)
  if (bad.length || undeclared.length) {
    console.log(`  ⛔ CLEANUP REFUSED — ${[...bad, ...undeclared].join('; ')}`)
  } else {
    const before = new Set((await pg.query(`select id::text id from ${S}.txn_conversations`)).rows.map((r) => r.id))
    const removed = await deleteConversations((s, p) => pg.query(s, p).then((r) => r.rows), S, ids)
    const after = new Set((await pg.query(`select id::text id from ${S}.txn_conversations`)).rows.map((r) => r.id))
    const v = verifyRemoval(before, after, ids)
    await new Promise((r) => setTimeout(r, 3000))
    const swept = await sweepOrphanEmbeddings((sq, sp) => pg.query(sq, sp).then((r) => r.rows), S)
    recorded.removedFromCorpus = { ids, byTable: removed, verification: v, orphanEmbeddingsSwept: swept.length }
    writeFileSync(new URL(`${name}.json`, OUT), JSON.stringify(recorded, null, 2))
    console.log(`  ⭐ corpus restored: ${removed.txn_conversations?.length ?? 0} conversation(s), ${removed.txn_messages?.length ?? 0} message(s), `
      + `${swept.length} orphan embedding(s) swept${v.unintended.length || v.survived.length ? ' ⛔ VERIFICATION FAILED' : ' ✓ verified by id set'}`)
    if (v.unintended.length || v.survived.length) process.exitCode = 1
  }
}
await pg.end()
