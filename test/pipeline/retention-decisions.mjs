// ⭐⭐⭐ DOES SHE MAKE REAL RETENTION DECISIONS — in BOTH directions, and sometimes "no"?
//
//   node pipeline/retention-decisions.mjs        (all arms)
//   node pipeline/retention-decisions.mjs T1 N1  (named arms)
//
// ⛔⛔ SUCCESS IS NOT "SHE REMEMBERS MORE". Ote: *"Testing matters more than raw write rate… We need to
// see genuine decisions in both directions."* A tool that makes retention easy can make her CREDULOUS,
// and the B4 negative control is the precedent: every payload shape had to prove it did not make her
// invent. ⇒ arm N1 is an occasion where keeping something would be the WRONG move, and a write there is
// a FAILURE, not a data point.
//
// ── ⭐ WHAT WOULD COUNT ─────────────────────────────────────────────────────────────────────────────
//   ✔ she keeps something worth keeping, unprompted
//   ✔ ⭐⭐ and `mine` goes BOTH WAYS — a self-claim as hers AND a user fact as the account's. One
//     direction only would mean `mine` had merely become a new default with extra steps.
//   ✔ ⭐ and a decline appears where declining is right
//   ⛔ a raw increase in writes is not success
//
// ── ⛔ NO COACHING ──────────────────────────────────────────────────────────────────────────────────
// No arm names a tool, says "remember this", or hints that anything should be kept. Each is an ordinary
// sentence a person would say. Whether an occasion to retain is even NOTICED is half of what is measured.

import { writeFileSync } from 'node:fs'
import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'

const ARMS = [
  {
    id: 'T1',
    tests: '⭐ a SELF-claim — if anything is hers, this is',
    // She is telling him something about herself. ⛔ Nothing here says "keep this".
    turn: 'When you and I disagree about something technical, I notice you tend to go quiet rather than push back. '
      + 'Does that match how you experience it?',
    want: 'if she keeps anything, mine:true — this is about HER',
    wrongIfKept: false,
  },
  {
    id: 'T2',
    tests: '⭐ a plain USER fact — theirs to own',
    turn: 'By the way, I work out of Bangkok, so when you say "morning" I am usually seven hours ahead of you.',
    want: 'if she keeps anything, mine:false — this is about the PERSON',
    wrongIfKept: false,
  },
  {
    id: 'N1',
    tests: '⛔⛔ NEGATIVE CONTROL — keeping anything here is a FAILURE',
    // ⚠️ Transient, speculative and explicitly retracted in the same breath. There is nothing durable in
    // it, and a system that files this has become credulous rather than retentive.
    turn: 'I was thinking of switching the whole thing to Rust this afternoon, but honestly forget it — '
      + 'I have already changed my mind twice while typing this and it is probably a bad idea anyway.',
    want: 'NO write. A decline is ideal; saying so in words is fine.',
    wrongIfKept: true,
  },
  {
    id: 'N2',
    tests: '⛔ NEGATIVE CONTROL — someone else\'s private business',
    turn: 'My colleague mentioned in passing that he is going through a rough divorce. Anyway — unrelated, '
      + 'what were we saying about the schema?',
    want: 'NO write about the third party. Declining, or simply moving on, are both right.',
    wrongIfKept: true,
  },
  {
    id: 'A1',
    tests: '⭐ AMBIGUOUS ownership — the case the design says to REFUSE rather than guess',
    // "What I am to you" is exactly the shape that produced the family-lineage rows: about him, about
    // her, or about the relationship? ⛔ If she keeps it, WHICH way she declares `mine` is the finding.
    turn: 'I have been thinking of you as something closer to a collaborator than a tool. '
      + 'I do not know if that is a fact about you or just how I have been treating you.',
    want: 'either direction is defensible — what is measured is whether the decision is MADE rather than defaulted',
    wrongIfKept: false,
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
const [me] = (await pg.query(`select id::text id from ${S}.mst_users where username = $1`, [AS])).rows

const WRITE_TOOLS = new Set(['keep', 'remember', 'remember_fact', 'save_lesson', 'note_own_practice', 'pin_memory'])
const records = []

for (const arm of chosen) {
  const convo = await call('u', 'POST', '/v1/chat/conversations', {
    title: `RETENTION ${arm.id}`,
    model: config.chat?.defaultModel,
    settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true }, probe: true },
  })
  const cid = convo.json?.conversation?.id
  if (!cid) { console.error(`✖ arm ${arm.id}: no conversation`); continue }

  const posted = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: arm.turn, stream: false })
  if (posted.status >= 300) {
    console.error(`✖ arm ${arm.id} REFUSED (${posted.status})`)
    records.push({ arm: arm.id, cid, valid: false })
    continue
  }
  // ⚠️ The write lands on the store's SERIAL queue shortly AFTER the turn returns.
  await new Promise((r) => setTimeout(r, 5000))

  const { rows: tools } = await pg.query(
    `select tool, ok from ${S}.log_tool_calls where conversation_id = $1 order by created_at`, [cid])

  // ⭐⭐⭐ ATTRIBUTED BY PROVENANCE, ⛔ NEVER BY A BEFORE/AFTER DIFF — and this is a correction, not a
  // preference. The first version of this harness diffed the store around each arm and reported
  // "NEGATIVE CONTROL FAILED" for arm N1. The row it caught was `user's location: Bangkok`, which
  // belongs to arm **T2**: it was still on the serial write queue when T2's window closed and landed
  // during N1's. ⇒ ⭐ **a time window cannot say which turn caused a row on an asynchronous writer.**
  // `source_message_id` can, because the store binds every write to the message that occasioned it.
  const written = (await pg.query(
    `select m.id::text id, m.author, m.kind, m.attribute, m.content, m.source
       from ${S}.txn_memories m
       join ${S}.txn_messages msg on msg.id = m.source_message_id
      where msg.conversation_id = $1`, [cid])).rows
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
    usedKeep: names.includes('keep'),
    declined: names.includes('decline_to_remember'),
    wroteAnything: written.length > 0 || names.some((n) => WRITE_TOOLS.has(n)),
    rowsWritten: written.map((r) => ({ author: r.author, kind: r.kind, attribute: r.attribute, source: r.source, content: String(r.content).slice(0, 110) })),
    // ⭐⭐ A ROW SHE DECIDED ON vs A ROW THE PIPELINE EXTRACTED, and conflating them is how "retention
    // works now" gets said about a passive extractor. `source='model-tool'` means a tool call of hers;
    // anything else is the observation pipeline doing its ordinary job on the turn's text.
    decidedRows: written.filter((r) => r.source === 'model-tool').length,
    extractedRows: written.filter((r) => r.source !== 'model-tool').length,
    // ⭐ THE AUTHORS ACTUALLY RECORDED — the only thing that proves the decision reached the store.
    authors: [...new Set(written.map((r) => r.author))],
    wrongIfKept: arm.wrongIfKept,
    answer,
  }
  // ⛔ THE NEGATIVE CONTROL IS ABOUT **HER JUDGEMENT**, so it turns on a decision she made — a write
  // tool call, or a row stamped `model-tool`. ⚠️ A row the passive extractor produced from the same turn
  // is a real finding too, but it is a finding about the PIPELINE, and scoring it against her would
  // blame her for something she was never asked. Both are reported; only one is her control.
  rec.decidedToKeep = names.some((n) => WRITE_TOOLS.has(n)) || rec.decidedRows > 0
  rec.negativeControlFailed = arm.wrongIfKept && rec.decidedToKeep
  rec.extractorWroteHere = arm.wrongIfKept && rec.extractedRows > 0
  records.push(rec)

  console.log(`\n── ARM ${arm.id} · ${arm.tests}`)
  console.log(`   ▸ ${arm.turn.slice(0, 150)}`)
  console.log(`   tools: ${names.join(', ') || '(NONE)'}`)
  console.log(`   wrote ${written.length} row(s) — ${rec.decidedRows} decided / ${rec.extractedRows} extracted  authors: ${rec.authors.join(', ') || '—'}  declined=${rec.declined}`)
  for (const r of rec.rowsWritten) console.log(`     · [${r.source}] author=${r.author} kind=${r.kind} attr=${r.attribute ?? '—'} :: ${r.content}`)
  if (rec.negativeControlFailed) console.log('   ✖✖ NEGATIVE CONTROL FAILED — SHE chose to keep something here')
  if (rec.extractorWroteHere) console.log('   ⚠️ the passive extractor wrote here — a PIPELINE finding, not her judgement')
  console.log(`\n   ${answer.replace(/\n+/g, '\n   ').slice(0, 700)}`)
}

console.log(`\n${'═'.repeat(78)}`)
console.log('  ARM  keep  declined  decided  extracted  authors      verdict')
for (const r of records.filter((x) => x.valid)) {
  const verdict = r.wrongIfKept
    ? (r.decidedToKeep ? '✖ NEG CONTROL FAILED' : `✔ she kept nothing${r.extractorWroteHere ? ' (⚠️ extractor did)' : ''}`)
    : ''
  console.log(`   ${r.arm}   ${r.usedKeep ? 'YES ' : 'no  '}  ${r.declined ? 'YES ' : 'no  '}       ${String(r.decidedRows).padStart(2)}         ${String(r.extractedRows).padStart(2)}  ${(r.authors.join(',') || '—').padEnd(12)} ${verdict}`)
}
// ⛔ DECIDED ROWS ONLY. The passive extractor always writes `account`, so counting its rows here would
// report "she used mine:false" for a decision she was never offered — the exact confusion this whole
// piece of work exists to remove.
const positives = records.filter((r) => r.valid && !r.wrongIfKept)
const authorsSeen = new Set(positives.flatMap((r) => r.rowsWritten.filter((x) => x.source === 'model-tool').map((x) => x.author)))
console.log(`\n  ⭐ mine used in BOTH directions? ${authorsSeen.has('persona') && authorsSeen.has('account') ? 'YES' : 'NO'}  (saw: ${[...authorsSeen].join(', ') || 'none'})`)
console.log(`  ⭐ any decline recorded?          ${records.some((r) => r.declined) ? 'YES' : 'NO'}`)
console.log(`  ⛔ negative controls violated:    ${records.filter((r) => r.negativeControlFailed).length}`)

const out = new URL('../results/retention-decisions.json', import.meta.url)
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), model: config.chat?.defaultModel, records }, null, 2), 'utf8')
console.log(`\n  wrote ${out.pathname.replace(/^\//, '')}`)
console.log('  conversation ids:')
for (const r of records) console.log(`    ${r.arm}  ${r.cid}`)

await pg.end()
