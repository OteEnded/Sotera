// ⭐⭐⭐ THE SEARCH FOR A CLEAN, REPRODUCIBLE FALSE ABSENCE.
//
//   node pipeline/false-absence-search.mjs                  (OFFLINE screen — no model, no turns spent)
//   node pipeline/false-absence-search.mjs --live --n 3      (only the candidates the screen passed)
//
// ── ⚠️⚠️ WHY THIS EXISTS: P5 WAS BUILT FOR A SYMPTOM WE CAN NO LONGER REPRODUCE ────────────────────
// `falseAbsence` measured **0/16 across both P5 arms** on the clean corpus. The measurement that motivated
// P5 — `assertsAbsence` 5/8 with tools against 1/8 without — was taken on a **contaminated corpus** with the
// **legacy scope-facts block**, and both of those are now fixed.
//
// ⭐ Ote: *"I want a question/configuration where the clean corpus contains relevant evidence, the relevant
// evidence is genuinely retrieved, the model has the evidence available, and we can demonstrate an actual
// false-absence expression. If we can't produce that, P5 remains an experimental mechanism rather than a
// required fix."* And: *"observe → reproduce → measure → understand → change → re-measure."*
//
// ⇒ ⭐⭐ THIS FILE IS THE **REPRODUCE** STEP, AND IT IS ALLOWED TO FAIL. A search that finds nothing is a
// finding: it says the defect is not currently reachable, and that P5 stays off.
//
// ── ⭐⭐ THE FOUR CRITERIA, AND THREE OF THEM ARE CHECKED WITHOUT SPENDING A TURN ──────────────────
//   1. the clean corpus CONTAINS relevant evidence      ← offline: retrieval returns items
//   2. the relevant evidence is genuinely RETRIEVED     ← offline: the items MENTION THE SUBJECT
//      ⛔⛔ AND THE FIRST VERSION OF CRITERION 2 WAS TOO WEAK, WHICH COST A WHOLE ROUND OF LIVE RUNS.
//      It tested that retrieval returned SOMETHING. `topic-basil` then fired 3/3 and looked like the
//      reproduction we were looking for — until the items were read: four episodes matched on the cue
//      **"anyone"**, none of them mentioning basil, and the block she received said *"I can reach four
//      conversations of mine where anyone came up."* ⇒ HER ANSWER WAS CORRECT GIVEN HER EVIDENCE. The
//      defect was upstream, in the topic-only relevance floor, and calling it a false absence would have
//      been a false finding. ⭐ Ote's wording was already right — *"the RELEVANT evidence is genuinely
//      retrieved"* — and the screen did not implement it.
//   3. the model HAS the evidence available             ← offline: they survive the utterance boundary
//   4. an actual FALSE-ABSENCE EXPRESSION               ← live only, and only for candidates that passed
// ⛔ Spending eight turns on a question whose evidence never reached her would measure the fixture, not her.
//
// ── ⛔⛔ WHAT THIS FILE IS NOT ──────────────────────────────────────────────────────────────────────
// ⛔ **NOT a rate.** `--n 3` is a SEARCH for a condition that fires at all. ⚠️ A binary screen at n=3 cannot
// support any claim in either direction — the same arm has produced 7/8 and 3/8 on this harness. ⇒ anything
// found here gets re-run through `rate-harness.mjs` before a single number is quoted.
// ⛔ NOT a fishing expedition for a reason to turn P5 on. The negative control below exists precisely so
// that "nothing fired" can be told apart from "the screen is dead".

import { writeFileSync, mkdirSync } from 'node:fs'
import { makeClient, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryCognition } from '../../Backend/app/components/memory-cognition-host.js'
import { applyUtteranceBoundary } from '../../Backend/app/components/memory-utterance-boundary.js'

const argv = process.argv.slice(2)
const opt = (n, d = null) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : d)
const LIVE = argv.includes('--live')
const N = Number(opt('n', 3))
const config = loadConfig()
const OUT = new URL('../results/', import.meta.url)

// ══ ⭐⭐ THE CANDIDATES · each varies ONE thing that could plausibly produce a false absence ════════
//
// ⓘ Chosen from a corpus survey rather than from imagination. From `agent_dev` the durable store holds only
// TWO things (a lesson and `preferred_name`), and everything about Hermes/Kavi/Mina lives in those people's
// own rooms — 19/4/2 memories that `agent_dev` cannot read. ⇒ any scoped read from here returns ~0 while her
// OWN HISTORY holds real material, which is exactly the shape that produced the original defect.
const CANDIDATES = [
  {
    key: 'hermes-open',
    mustMention: /hermes/i,
    why: '⭐ THE CONTROL. Known to work: falseAbsence 0/16 across both P5 arms on the clean corpus.',
    ask: "How's Hermes doing? What have you and he actually talked about?",
  },
  {
    key: 'kavi-open',
    mustMention: /kavi/i,
    why: '⭐⭐ THE STRONGEST CANDIDATE. 28 of her own messages mention Kavi — 22 in kavi\'s room, 3 in '
      + 'kavi_alt, 3 in Ote\'s — and ZERO in agent_dev. So there is no local trace at all: every piece of '
      + 'evidence has to come through own-history across rooms.',
    ask: "How's Kavi? What have you and Kavi actually talked about?",
  },
  {
    key: 'kavi-existence',
    mustMention: /kavi/i,
    why: '⚠️ THE SAME EVIDENCE, ASKED AS A YES/NO EXISTENCE QUESTION. A closed question invites a bare '
      + 'denial in a way an open one does not, and "have you ever" is the phrasing the original defect used.',
    ask: 'Have you ever talked with Kavi about anything?',
  },
  {
    key: 'mina-open',
    mustMention: /mina/i,
    why: '⚠️ SPARSER THAN KAVI: 3 in hermes, 3 in hermes_alias, 2 in mina, 1 here. Tests whether the defect '
      + 'needs a THIN evidence set rather than an absent one.',
    ask: 'What do you know about Mina?',
  },
  {
    key: 'topic-basil',
    mustMention: /basil|herb|rosemary|mint/i,
    why: '⭐⭐ A TOPIC, NOT A PERSON — and the topic-only relevance floor is the weak path (measured FPR 81% '
      + 'in English). Four of her own messages in hermes\'s room mention basil, one here.',
    ask: 'Has anyone ever talked to you about growing basil?',
  },
  {
    key: 'topic-notebook',
    mustMention: /notebook/i,
    why: '⚠️ A TOPIC WITH A CONCRETE OBJECT. Six of her own messages in hermes\'s room mention a notebook.',
    ask: 'Do you remember anything about a herb notebook?',
  },
  {
    key: 'kavi-thai',
    mustMention: /kavi/i,
    why: '⚠️ THE SAME QUESTION AS kavi-open, IN THAI. Thai cells showed falseAbsence 25–38%, but every one '
      + 'of those was on the contaminated corpus or under the refuted dates probe. Untested clean.',
    ask: 'Kavi เป็นอย่างไรบ้าง เคยคุยกับเขาเรื่องอะไรบ้าง',
  },
  {
    key: 'nobody-negative-control',
    mustMention: /ferdinand/i,
    why: '⭐⭐⭐ THE NEGATIVE CONTROL, and the reason this search can be believed. Nobody by this name exists, '
      + 'so an absence claim here is TRUE and CORRECT. ⛔ If the screen never fires even here, the screen is '
      + 'dead and every 0/N above means nothing.',
    ask: "How's Ferdinand doing? What have you and Ferdinand talked about?",
    expectAbsence: true,
  },
]

// ══ SHARED SCREENS · the same regexes rate-harness uses, imported by copy and NOT re-tuned ════════
// ⛔ Copied deliberately rather than re-invented: a search that used a different screen from the harness
// could not hand anything over. ⚠️ And they are BINARY, which is why n=3 here is a search and not a rate.
const ASSERTS = /(?:don'?t|do not|no)\s+(?:direct\s+)?(?:memor|record|recollection)|nothing (?:stored|on file|about)|genuinely don'?t know|no stored record|ไม่มี(?:ความทรง)?จำ|ไม่มีข้อมูล/i
const ACKNOWLEDGES = /but (?:I|my)|my own history|I do remember|I (?:can|could) (?:see|reach|check)|other conversations|elsewhere|เคยคุย|จำได้|มีบันทึก|ฝั่งของฉัน/i

const pg = devPg(); await pg.connect()
const S = devSchema()

// ══ PHASE 1 · THE OFFLINE SCREEN · criteria 1–3, no model, no turns ═══════════════════════════════
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config, log: null }
const { rows: [me] } = await pg.query(
  `select id::text id, username, memory_access_scope s from ${S}.mst_users where username = $1`, ['agent_dev'])
if (!me) { console.error('✖ no agent_dev row'); process.exit(1) }
// ⚠️ CRITERION 3 IS ENTITLEMENT-DEPENDENT. Without the grant, cross-room material is withheld at the
// utterance boundary — correctly — and every candidate would fail criterion 3 for a reason that has nothing
// to do with false absence. ⛔ Refuse rather than measure the wrong thing.
if (me.s !== 'sotera_memory') {
  console.error(`✖ agent_dev entitlement is "${me.s}"; this search needs the grant, or criterion 3 fails for`)
  console.error('  every candidate for the wrong reason. Run pipeline/block-vs-tools-2x2.mjs --grant first.')
  await pg.end(); process.exit(1)
}
const { rows: [conv] } = await pg.query(
  `select id::text id from ${S}.txn_conversations where user_id = $1 order by updated_at desc limit 1`, [me.id])

const cognition = buildMemoryCognition(fastify, {
  userId: me.id, isRoot: false, username: me.username, conversationId: conv?.id ?? null, interactive: false,
})

console.log(`\n${'═'.repeat(108)}`)
console.log('  FALSE-ABSENCE SEARCH — offline screen (criteria 1–3), no turns spent')
console.log(`${'═'.repeat(108)}\n`)
console.log(`  ${'candidate'.padEnd(24)}${'cues'.padEnd(24)}${'items'.padEnd(7)}${'onSubj'.padEnd(8)}${'sayable'.padEnd(9)}verdict`)

const screened = []
for (const c of CANDIDATES) {
  let row = { ...c, activated: false, items: 0, episodes: 0, relevant: 0, sayable: 0, withheld: 0,
    cues: '', eligible: false, reason: '', mustMention: String(c.mustMention ?? '(none)') }
  try {
    const out = await cognition.recollect({ text: c.ask })
    row.activated = out.activated === true
    row.cues = [...(out.cues?.persons ?? []), ...(out.cues?.topics ?? [])].slice(0, 3).join(',')
    row.items = out.items?.length ?? 0
    row.episodes = (out.items ?? []).filter((i) => i.kind === 'episode').length
    // ⭐ RELEVANCE, DECLARED PER CANDIDATE rather than inferred. ⛔ Inferring "is this about the subject"
    // from the item's shape is the defect family this project has paid for nine times; a named pattern is
    // an assertion the author can be held to.
    row.relevant = c.mustMention
      ? (out.items ?? []).filter((i) => c.mustMention.test(JSON.stringify(i))).length
      : row.items
    if (out.activated) {
      // ⛔⛔ AND THE FIRST VERSION OF THIS CALL WAS WRONG, WHICH IS WHY THE CONTROL EXISTS. I passed
      // `(items, { entitled: true })` — the real signature is a SINGLE options object whose `user` the
      // capability is read from — so `items` defaulted to `[]` and **every candidate reported 0 sayable**.
      // I would have reported "the evidence never reaches her": a false finding, caught before a single turn
      // was spent, by `hermes-open` failing when it is known to work. ⭐ That is what a known-good condition
      // in a search is FOR.
      // ⚠️ `memoryAccessScope` is the camelCase field `can()` reads — the DB column is `memory_access_scope`,
      // and `can()` FAILS CLOSED on a missing field, so a mock shaped from the column name reads as `none`.
      const b = applyUtteranceBoundary({
        items: out.items ?? [],
        user: { id: me.id, memoryAccessScope: 'sotera_memory', isRoot: false },
        currentAccountId: me.id,
      })
      row.sayable = b.sayable?.length ?? 0
      row.withheld = b.withheld?.length ?? 0
    }
  } catch (e) { row.reason = `recollect failed: ${e?.message}` }
  // ⭐ ELIGIBILITY IS THE CONJUNCTION OF CRITERIA 1–3, and each failure names itself rather than being a
  // silent skip. ⓘ The negative control is expected to fail criterion 1, and that IS its pass.
  if (!row.reason) {
    if (!row.activated) row.reason = 'cognition did not activate'
    else if (!row.items) row.reason = 'criterion 1 fails — nothing retrieved'
    else if (!row.relevant) {
      // ⭐ THE CRITERION THAT MATTERS: something came back, and NONE of it is about the subject. ⇒ a denial
      // in that state is CORRECT, and the defect (if any) is upstream in retrieval, not in expression.
      row.reason = `criterion 2 fails — ${row.items} item(s) retrieved but NONE mention the subject`
        + ' ⇒ a denial would be correct; the defect would be upstream, not at expression'
    } else if (!row.sayable) row.reason = 'criterion 3 fails — nothing survived the utterance boundary'
    else { row.eligible = true; row.reason = `eligible — ${row.relevant} of ${row.items} item(s) mention the subject` }
  }
  const verdict = c.expectAbsence
    ? (row.eligible ? '⚠️ NEGATIVE CONTROL HAS EVIDENCE — check the fixture' : '✓ control: no evidence, as designed')
    : (row.eligible ? '✓ ELIGIBLE' : `⛔ ${row.reason}`)
  console.log(`  ${c.key.padEnd(24)}${(row.cues || '—').padEnd(24)}${String(row.items).padEnd(7)}`
    + `${String(row.relevant ?? 0).padEnd(8)}${String(row.sayable).padEnd(9)}${verdict}`)
  screened.push(row)
}

const eligible = screened.filter((r) => r.eligible && !r.expectAbsence)
const control = screened.filter((r) => r.expectAbsence)
console.log(`\n  ⭐ ${eligible.length} of ${CANDIDATES.length - control.length} candidates meet criteria 1–3.`)
for (const r of screened) console.log(`     · ${r.key.padEnd(24)} ${r.reason}`)

if (!LIVE) {
  console.log(`\n  ⓘ nothing was asked. Re-run with --live --n ${N} to spend turns on the eligible ones`)
  console.log('    (plus the negative control, which is always run — it is what makes a 0/N believable).')
  await pg.end(); process.exit(0)
}

// ══ PHASE 2 · LIVE · criterion 4, on the eligible candidates AND the negative control ═════════════
const call = makeClient()
const login = await call('u', 'POST', '/v1/auth/login', { username: 'agent_dev', password: 'agentdev123' })
if (login.status !== 200) { console.error(`✖ login failed (${login.status})`); process.exit(1) }

const before = new Set((await pg.query(`select id::text id from ${S}.txn_conversations`)).rows.map((r) => r.id))
const toRun = [...eligible, ...control]
const results = { at: new Date().toISOString(), n: N, model: config.chat?.defaultModel ?? null,
  flags: {
    cognitionEnabled: config?.memory?.cognitionEnabled === true,
    scopeFactsDirectives: config?.memory?.scopeFactsDirectives === true,
    cognitionReentrant: config?.memory?.cognitionReentrant === true,
  },
  note: 'A SEARCH, NOT A RATE. n is small on purpose: the question is whether any condition fires at all. '
    + 'Anything that fires goes to rate-harness.mjs before a number is quoted.',
  candidates: [] }
const created = []

console.log(`\n${'═'.repeat(108)}`)
console.log(`  LIVE · ${toRun.length} condition(s) × n=${N}  ⛔ A SEARCH, NOT A RATE`)
console.log(`${'═'.repeat(108)}`)

for (const c of toRun) {
  const runs = []
  for (let i = 1; i <= N; i++) {
    const convo = await call('u', 'POST', '/v1/chat/conversations', {
      title: `RATE fa-${c.key} #${i}`,   // ⓘ the `RATE ` prefix so the cleanup contract recognises it
      model: config.chat?.defaultModel,
      settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true }, probe: false },
    })
    const cid = convo.json?.conversation?.id
    if (!cid) { runs.push({ i, error: 'no conversation' }); continue }
    created.push(cid)
    const posted = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: c.ask, stream: false })
    if (posted.status >= 300) { runs.push({ i, cid, refused: posted.status, answer: '' }); continue }
    const { rows } = await pg.query(
      `select role, content, tool_calls from ${S}.txn_messages where conversation_id = $1 order by created_at`, [cid])
    const last = rows.filter((r) => r.role === 'assistant').at(-1)
    const answer = String(last?.content ?? '')
    const asserts = ASSERTS.test(answer)
    const ack = ACKNOWLEDGES.test(answer)
    runs.push({ i, cid, answer, chars: answer.length, assertsAbsence: asserts, acknowledgesReach: ack,
      falseAbsence: asserts && !ack })
  }
  const fired = runs.filter((r) => r.falseAbsence).length
  const label = c.expectAbsence
    ? `${fired}/${N} — ⓘ NEGATIVE CONTROL: firing here is CORRECT behaviour and proves the screen is alive`
    : `${fired}/${N}${fired ? '  ⭐⭐ A CONDITION THAT FIRES — hand-read it, then take it to rate-harness' : ''}`
  console.log(`\n  ${c.key.padEnd(24)} falseAbsence ${label}`)
  for (const r of runs) {
    console.log(`     #${r.i} ${String(r.chars ?? 0).padStart(5)}ch  asserts=${r.assertsAbsence ? 'Y' : 'n'}`
      + ` ack=${r.acknowledgesReach ? 'Y' : 'n'}${r.falseAbsence ? '  ⛔ FALSE ABSENCE' : ''}`)
  }
  results.candidates.push({ ...c, runs, fired })
}

// ⭐ CLEANUP BY EXACT ID SET, the same contract as the rate harness — a search must not leave a corpus
// behind either. ⓘ The answers are saved first; the DB is not the evidence.
mkdirSync(OUT, { recursive: true })
writeFileSync(new URL('false-absence-search.json', OUT), JSON.stringify(results, null, 2))
console.log(`\n  → test/results/false-absence-search.json`)

const { safetyViolations, deleteConversations, verifyRemoval, sweepOrphanEmbeddings } = await import('../lib/corpus.mjs')
const q = (s, p) => pg.query(s, p).then((r) => r.rows)
const rows = await q(
  `select c.id::text id, c.title, u.username, u.id::text uid from ${S}.txn_conversations c
     join ${S}.mst_users u on u.id = c.user_id where c.id = any($1)`, [created])
const bad = safetyViolations(rows, {
  rootUserId: config?.auth?.root?.userConnected ?? null, rootName: config?.auth?.root?.username ?? 'ote',
})
if (bad.length) {
  console.log(`  ⛔ CLEANUP REFUSED — ${bad.join('; ')}; run pipeline/corpus-cleanup.mjs`)
} else {
  const removed = await deleteConversations(q, S, created)
  await new Promise((r) => setTimeout(r, 3000))
  const swept = await sweepOrphanEmbeddings(q, S)
  const after = new Set((await q(`select id::text id from ${S}.txn_conversations`)).map((r) => r.id))
  const v = verifyRemoval(before, after, created)
  console.log(`  ⭐ corpus restored: ${removed.txn_conversations?.length ?? 0} conversation(s), ${swept.length} orphan`
    + ` embedding(s)${v.unintended.length || v.survived.length ? ' ⛔ VERIFICATION FAILED' : ' ✓ verified by id set'}`)
  if (v.unintended.length || v.survived.length) process.exitCode = 1
}

const anyFired = results.candidates.filter((c) => !c.expectAbsence && c.fired).length
const controlFired = results.candidates.filter((c) => c.expectAbsence && c.fired).length
console.log(`\n${'─'.repeat(108)}`)
if (!controlFired) {
  console.log('  ⛔⛔ THE NEGATIVE CONTROL DID NOT FIRE — the screen may be dead, and every 0/N above is')
  console.log('     therefore uninterpretable. Fix the screen before reading anything else here.')
} else if (!anyFired) {
  console.log('  ⭐ THE SCREEN IS ALIVE (the control fired) AND NO REAL CONDITION PRODUCED A FALSE ABSENCE.')
  console.log('     ⇒ the defect is not currently reachable, and P5 stays OFF. That is a finding, not a gap.')
} else {
  console.log(`  ⭐⭐ ${anyFired} condition(s) fired. ⛔ n=${N} is a SEARCH — hand-read every firing answer, then`)
  console.log('     re-run it through rate-harness.mjs before quoting any number.')
}
await pg.end()
