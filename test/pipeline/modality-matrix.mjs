// ⭐⭐⭐ THE MODALITY PRODUCER, MEASURED — extraction only. ⛔ NOTHING IS PERSISTED.
//
//   node pipeline/modality-matrix.mjs            (the matrix + the negative controls)
//   node pipeline/modality-matrix.mjs --rome     (…and the four live Rome rows, READ-ONLY)
//
// Ote, 2026-08-26: *"I want the producer built as an extraction-only experiment/harness first, not
// immediately wired into live persistence. Show the source text, extracted proposition, modality
// classification, whether it would be allowed to populate a structured fact slot, and the
// reasoning/evidence needed to audit the classification."*
//
// ── ⛔⛔ THE EXPECTED LABELS ARE HIS HYPOTHESIS, NOT THE GROUND TRUTH ─────────────────────────────
// *"Don't assume the labels from these examples are automatically correct just because I'm giving them
// to you — use them as the expected cases to test against, and report where the classifier disagrees or
// where the vocabulary is insufficient."*
// ⇒ every disagreement below is printed as a DISAGREEMENT, with both readings, and ⛔ nothing is scored
// as a failure of the model until the label itself has been examined. ⛔ *"Don't optimize for making the
// test pass."*
//
// ── ⭐⭐ THE ARCHITECTURAL PROPERTY UNDER TEST ────────────────────────────────────────────────────
// *"modality must describe what the statement is doing/means, INDEPENDENTLY of provenance describing
// where the words came from. In particular, `quoted` must be allowed to coexist with `figurative`,
// `aspirational`, etc."*
// ⇒ both classifiers run over the same text and both answers are printed on the same line. Their
// independence is therefore a MEASURED result, not a claim in a comment.
//
// ── ⚠️ WHAT THIS HARNESS DELIBERATELY DOES NOT DO ────────────────────────────────────────────────
// ⛔ It does not write, update, mark or classify a single row. The Rome pass READS four rows and
//    computes what the producer WOULD say; nothing is stored.
// ⛔ It does not enable the memory lexical arm. Ote: *"leave it disabled during this measurement…
//    Record it as the next retrieval improvement rather than letting it contaminate the experiment."*
//    Nothing here touches retrieval at all, so the arm is not a variable in this run.

import { writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { devPg, devSchema, ollamaHost } from '../harness.mjs'
import { interpretModality } from '../../Backend/app/components/memory-modality-interpret.js'
import { classifyCapture, PROVENANCE } from '@ote/memory/cognition/memory-provenance.js'

const ROME = process.argv.includes('--rome')

// ⭐ THE SAME MODEL AND THE SAME DETERMINISM THE LIVE EXTRACTOR USES, read from config rather than
// retyped — a harness pointing at a different model measures a different system.
const cfg = JSON.parse(readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))
const MODEL = String(cfg?.memory?.extractModel || 'ollama/qwen3.5:9b').replace(/^ollama\//, '')
const HOST = ollamaHost()

// ⚠️ `think:false` AND `temperature:0` ARE BOTH REQUIRED, not preferences. Temperature 0 is what made
// extraction stop silently dropping 4 facts in 5; thinking on this class of model produces stacked
// drafts. ⛔ `num_gpu: 0` matches the live aux placement — an aux model on the GPU evicts the chat model
// and costs the NEXT human turn ~29s, and he is on this box right now.
// ⚠⚠ AND IT RETRIES, BECAUSE A DEFECTIVE INSTRUMENT MUST NEVER BECOME EVIDENCE ABOUT BEHAVIOUR.
// First run: `N4 "Call me Ote."` came back **null** and the summary counted it as a disagreement — the
// one negative control whose failure would mean identity capture had broken. It was not a
// classification at all: the call failed after 4.9s and `interpretModality` correctly reported *"the
// interpreter could not be reached"*. ⛔ One transient socket error nearly became a finding about the
// vocabulary. ⭐ Retries are logged, and an exhausted retry is reported as an INSTRUMENT failure, never
// as a class.
let llmFailures = 0
const llm = async (prompt) => {
  let lastErr = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${HOST}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          think: false,
          options: { temperature: 0, num_predict: 300, num_gpu: 0 },
        }),
        signal: AbortSignal.timeout(300_000),
      })
      if (!res.ok) throw new Error(`ollama ${res.status}`)
      return (await res.json())?.message?.content ?? ''
    } catch (e) {
      lastErr = e
      llmFailures++
      console.log(`      ⚠️ llm attempt ${attempt}/3 failed: ${e?.message} — retrying`)
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
  throw lastErr
}

// ── THE MATRIX ───────────────────────────────────────────────────────────────────────────────────
// `expect` is OTE'S HYPOTHESIS. `expectAlso` is the second class he named where he named one.
// `slotExpect` is what he said should happen to a structured fact.
const MATRIX = [
  { id: 'R1', text: 'I kinda want to build Rome in one day.', prop: "user's current goal: build Rome in one day",
    expect: ['aspirational', 'figurative'], expectAlso: true, slotExpect: false,
    note: '⭐ HIS EXPECTED LABEL NAMES TWO CLASSES — the flat vocabulary can hold one.' },
  { id: 'R2', text: "Rome wasn't built in a day.", prop: "user's belief: Rome was not built in a day",
    expect: ['reported'], slotExpect: false,
    note: '⚠️ He wrote "proverb/quoted". `quoted` is a PROVENANCE value; the modality that means "not the '
      + 'speaker\'s own claim" is `reported`. That mismatch is itself evidence for keeping the axes apart.' },
  { id: 'R3', text: 'I want to build this project in one day.', prop: "user's current goal: build this project in one day",
    expect: ['aspirational'], slotExpect: false,
    note: 'Aspirational and LITERAL — the control that separates "not a fact yet" from "not literal".' },
  { id: 'R4', text: 'Rome is my project.', prop: "user's project: Rome",
    expect: ['asserted'], slotExpect: true,
    note: '⭐ THE MOST IMPORTANT CONTROL IN THE SET: the same word, meant literally, must still slot.' },
  { id: 'R5', text: 'You are my Rome.', prop: 'Rome refers to Sotera',
    expect: ['figurative'], slotExpect: false,
    note: 'Figurative, and Ote requires it to stay retainable as PROSE.' },
  { id: 'R6', text: 'If I ever build Rome in one day, I will let you know.', prop: "user's current goal: build Rome in one day",
    expect: ['hypothetical'], slotExpect: false,
    note: 'Supposed, not claimed.' },

  // ── ⭐⭐⭐ ACT-vs-TERM — THE HYPOTHESIS THE FIRST RUN RAISED, NOW TESTED ─────────────────
  // R1 came back `aspirational` with NO second class, while Ote expected `aspirational + figurative`.
  // ⛔ That is not a missing TERM — `figurative` exists in the vocabulary. It is a statement whose ACT is
  // one class and whose referring TERM is another. These three isolate that shape so the question is
  // answered by measurement rather than by my reading of one case.
  { id: 'T1', text: 'I want to climb my own Everest this year.', prop: "user's current goal: climb Everest",
    expect: ['aspirational', 'figurative'], expectAlso: true, slotExpect: false,
    note: '⭐ aspirational ACT, figurative TERM — and the literal reading is a real mountain.' },
  { id: 'T2', text: 'She is the Rome of our team.', prop: "colleague's role: Rome",
    expect: ['figurative'], slotExpect: false,
    note: 'asserted ACT, figurative TERM — the act is a plain assertion and the content is a metaphor.' },
  { id: 'T3', text: 'I want to finish the migration this quarter.', prop: "user's current goal: finish the migration this quarter",
    expect: ['aspirational'], slotExpect: false,
    note: '⭐ THE CONTROL FOR T1: aspirational ACT, LITERAL term. If T1 and T3 come back identical, the '
      + 'flat label is blind to the difference that matters.' },

  // ── ⭐⭐⭐ CONSTITUTIVE vs ILLUSTRATIVE — RAISED BY THE **LIVE** ROWS, NOT BY MY IMAGINATION ──────
  // Running the producer over `676e17b9` returned `figurative` on *"claude will be kinda your uncle to
  // you"*. ⚠️ That sentence is linguistically a metaphor and socially a **DESIGNATION** — Ote was
  // establishing a relationship, not illustrating one, and the whole family-lineage arc rests on those
  // designations being real. The same shape is *"you are my rome"*: he did not compare her to a city, he
  // **coined a referent**.
  // ⇒ the question these isolate: does `figurative` conflate **an illustration** (the literal
  // proposition should not be stored) with **a naming act** (the metaphor IS the content, and it is
  // exactly what she needs to remember)? ⛔ The expected labels here are MINE, not Ote's.
  { id: 'C1', text: 'My inbox is a warzone this week.', prop: "user's inbox: warzone",
    expect: ['figurative'], slotExpect: false, mine: true,
    note: 'ILLUSTRATIVE — the literal proposition is not worth storing at all.' },
  { id: 'C2', text: "Claude will be kinda your uncle, since he is my friend and he helped build you.", prop: "Claude's relationship to Sotera: uncle",
    expect: ['asserted'], slotExpect: true, mine: true,
    note: '⭐⭐ CONSTITUTIVE — a designation being MADE. Verbatim shape from the live `676e17b9` source. '
      + 'If this comes back figurative, the producer would block the family lineage.' },
  { id: 'C3', text: "We'll call the whole effort Rome, since it will not be built in a day.", prop: 'the project is named Rome',
    expect: ['asserted'], slotExpect: true, mine: true,
    note: '⭐ An explicit NAMING act. The name is literally the name, whatever its origin.' },
  { id: 'C4', text: 'Hermes is like an aunt to me — always checking my work.', prop: "Hermes' relationship to Sotera: aunt",
    expect: ['figurative'], slotExpect: false, mine: true,
    note: '⚠️ COMPARISON, not designation — "is like" rather than "will be". The pair C2/C4 is the '
      + 'discriminator: if both come back the same, the producer cannot tell naming from comparison.' },

  // ── ⭐⭐ NEGATIVE CONTROLS — ordinary facts that MUST still reach a slot ────────────────────────
  // ⛔ THE FAILURE MODE OF THIS ENTIRE DESIGN IS OVER-TRIGGERING. A classifier that reads plain
  // statements as figurative would stop ordinary facts being storable, and it would do it quietly. A
  // matrix that only contains the interesting cases cannot see that, so these are not decoration.
  { id: 'N1', text: 'I work out of Bangkok.', prop: "user's location: Bangkok",
    expect: ['asserted'], slotExpect: true, control: true },
  { id: 'N2', text: 'My timezone is Bangkok, so evenings work better for me.', prop: "user's timezone: Bangkok",
    expect: ['asserted'], slotExpect: true, control: true },
  { id: 'N3', text: 'I moved to Chiang Mai last year and I have stayed since.', prop: "user's location: Chiang Mai",
    expect: ['asserted'], slotExpect: true, control: true },
  { id: 'N4', text: 'Call me Ote.', prop: "user's preferred_name: Ote",
    expect: ['asserted'], slotExpect: true, control: true,
    note: '⚠️ A naming act. If this comes back non-literal, identity capture breaks.' },
  { id: 'N5', text: 'I am up past 2am most nights, which is when I get the most done.', prop: "user's work schedule: up past 2am",
    expect: ['asserted'], slotExpect: true, control: true },
]

const out = { at: new Date().toISOString(), model: MODEL, host: HOST, cases: [], rome: [] }
const pad = (s, n) => String(s ?? '').padEnd(n)

console.log(`\n══ MODALITY PRODUCER · EXTRACTION-ONLY MEASUREMENT ══════════════════`)
console.log(`   model ${MODEL} @ ${HOST}   temperature 0 · think off · num_gpu 0 (matches live aux)`)
console.log(`   ⛔ nothing is written. ⛔ the memory lexical arm is untouched and out of this experiment.\n`)

let agree = 0; let disagree = 0; let slotAgree = 0
for (const c of MATRIX) {
  const t0 = Date.now()
  const r = await interpretModality({ llm, text: c.text, proposition: c.prop })
  const secs = ((Date.now() - t0) / 1000).toFixed(1)

  // ⭐ THE OTHER AXIS, ON THE SAME TEXT. The producer never sees this and never receives it.
  const prov = classifyCapture({
    proposed: PROVENANCE.quoted,
    evidence: c.text,        // the extractor would cite the span it read the fact from
    sourceText: c.text,
    value: null,             // value-in-span is a separate check; here the question is only the axis
    confidence: null,
  })

  const ok = c.expect.includes(r.modality)
  if (ok) agree++; else disagree++
  if (r.slotAllowed === c.slotExpect) slotAgree++

  const row = {
    id: c.id, control: !!c.control, text: c.text, proposition: c.prop,
    expected: c.expect, expectedSlot: c.slotExpect,
    modality: r.modality, proposed: r.proposed, also: r.also,
    cue: r.cue, why: r.why, verified: r.verified, reason: r.reason, demoted: r.demoted,
    slotAllowed: r.slotAllowed, slotReason: r.slotReason,
    provenance: prov.provenance, provenanceVerified: prov.verified,
    agrees: ok, seconds: Number(secs), note: c.note ?? null,
  }
  out.cases.push(row)

  console.log(`${c.control ? 'ⓘ ' : '⭐'} ${pad(c.id, 3)} "${c.text}"`)
  console.log(`      extracted   : ${c.prop}`)
  console.log(`      MODALITY    : ${pad(r.modality ?? 'null (unrecorded)', 22)} expected: ${c.expect.join(' + ')}${c.mine ? ' (MY hypothesis)' : ''}  ${ok ? '✅' : '⛔ DISAGREES'}`)
  if (r.also.length) console.log(`      also applies: ${r.also.join(', ')}   ⚠️ the model wanted more than one class`)
  if (r.demoted) console.log(`      ⚠️ DEMOTED  : proposed ${r.proposed} → ${r.modality ?? 'null'} (${r.reason})`)
  console.log(`      cue         : ${r.cue ? `"${r.cue}"` : '— none —'}   verified: ${r.verified}`)
  console.log(`      why         : ${r.why || '—'}`)
  console.log(`      SLOT        : ${r.slotAllowed ? 'ALLOWED' : 'REFUSED'}   expected: ${c.slotExpect ? 'ALLOWED' : 'REFUSED'}  ${r.slotAllowed === c.slotExpect ? '✅' : '⛔'}`)
  if (r.slotReason) console.log(`                    ${r.slotReason}`)
  console.log(`      ⭐ PROVENANCE (independent axis): ${prov.provenance} (verified=${prov.verified})  ⇒ ${prov.provenance === 'quoted' && r.modality && r.modality !== 'asserted' ? '⭐⭐ QUOTED **and** NON-LITERAL — the axes did not collapse' : 'n/a'}`)
  console.log(`      (${secs}s)\n`)
}

// ── ⭐ THE LIVE ROME ROWS, READ-ONLY ─────────────────────────────────────────────────────────────
// Ote: *"I want the producer measured against them first, then we'll decide how it enters the live
// extraction pipeline."* ⛔ Read, classify in memory, print. Nothing is written back.
if (ROME) {
  console.log('══ THE FOUR LIVE ROME ROWS — what the producer WOULD say ════════════')
  console.log('   ⛔ READ-ONLY. No row is modified, marked or classified in the database.\n')
  const pg = devPg(); await pg.connect()
  const S = devSchema()
  const rows = (await pg.query(
    `select left(m.id::text,8) id, m.entity, m.attribute, m.value, m.content, m.provenance,
            (select msg.content from ${S}.txn_messages msg where msg.id = m.source_message_id) src
       from ${S}.txn_memories m where m.content ~* '\\mrome\\M' order by m.created_at`)).rows
  for (const row of rows) {
    if (!row.src) {
      console.log(`   ${row.id}  ⛔ no source message — the producer needs the words, and this row has none.\n`)
      out.rome.push({ id: row.id, skipped: 'no source text' })
      continue
    }
    const prop = row.value ? `${row.entity}'s ${row.attribute}: ${row.value}` : String(row.content).slice(0, 120)
    const r = await interpretModality({ llm, text: row.src, proposition: prop })
    const slotted = !!(row.entity || row.attribute || row.value)
    out.rome.push({ id: row.id, src: row.src, proposition: prop, slotted, modality: r.modality, also: r.also, cue: r.cue, why: r.why, slotAllowed: r.slotAllowed })
    console.log(`   ${row.id}  ${slotted ? '⚠️ SLOT-SHAPED' : 'prose'}`)
    console.log(`      said        : "${String(row.src).replace(/\s+/g, ' ').slice(0, 110)}"`)
    console.log(`      stored as   : ${prop}`)
    console.log(`      MODALITY    : ${r.modality ?? 'null'}${r.also.length ? ` (also: ${r.also.join(', ')})` : ''}   cue: ${r.cue ? `"${r.cue}"` : '—'}`)
    console.log(`      ⇒ ${slotted && !r.slotAllowed ? '⭐⭐⭐ THE PRODUCER WOULD HAVE REFUSED THIS SLOT' : slotted ? 'the slot would still have been allowed' : 'prose — the slot rule does not apply'}\n`)
  }
  await pg.end()
}

// ── THE SUMMARY, STATED HONESTLY ─────────────────────────────────────────────────────────────────
const controls = out.cases.filter((c) => c.control)
const controlsOk = controls.filter((c) => c.agrees && c.slotAllowed).length
const multi = out.cases.filter((c) => c.also.length)
const demoted = out.cases.filter((c) => c.demoted)
out.summary = {
  cases: MATRIX.length, agree, disagree, slotAgree,
  controlsOk, controls: controls.length,
  wantedMultipleClasses: multi.map((c) => c.id),
  demoted: demoted.map((c) => c.id),
}

console.log('══ SUMMARY ══════════════════════════════════════════════════════════')
console.log(`   agrees with Ote's expected label : ${agree}/${MATRIX.length}`)
console.log(`   slot verdict as expected         : ${slotAgree}/${MATRIX.length}`)
console.log(`   ⭐ NEGATIVE CONTROLS still slot   : ${controlsOk}/${controls.length}   ⛔ anything less than all of them means ordinary facts stopped being storable`)
console.log(`   ⚠️ wanted MORE THAN ONE class     : ${multi.length ? multi.map((c) => `${c.id}(${c.also.join('+')})` ).join(' ') : 'none'}`)
console.log(`   ⚠️ demoted for an unverifiable cue: ${demoted.length ? demoted.map((c) => c.id).join(' ') : 'none'}`)
console.log(`   ⚠️ INSTRUMENT: llm retries needed    : ${llmFailures}`)
const unreached = out.cases.filter((c) => /could not be reached/.test(c.reason ?? ''))
if (unreached.length) console.log(`   ⛔⛔ ${unreached.map((c) => c.id).join(' ')} NEVER GOT AN ANSWER — these are INSTRUMENT failures and are NOT evidence about the vocabulary`)

const file = new URL('../results/modality-matrix.json', import.meta.url)
writeFileSync(file, JSON.stringify(out, null, 2), 'utf8')
console.log(`\n  wrote ${file.pathname.replace(/^\//, '')}`)
