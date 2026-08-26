// ⭐⭐⭐ IS MODALITY ONE AXIS OR THREE? — the measurement, not the model.
//
//   node pipeline/axes-matrix.mjs
//   node pipeline/axes-matrix.mjs --rome     (…and the four live Rome rows, READ-ONLY)
//
// Ote, 2026-08-26: *"The key question isn't 'what sixth enum should we add?'. It's: are we discovering
// that modality is itself multidimensional, and that relationship/designation is a different semantic
// object from ordinary memory facts? If the measurements support that, stop there and report it. Don't
// implement the new model yet."*
//
// ── ⭐⭐ THE TEST, AND IT IS THE ONE THAT SETTLED THE OTHER AXES ──────────────────────────────────
//     **Two axes are distinct iff they can DISAGREE.**
// That is exactly how `author ≠ subject ≠ owner ≠ scope` was established, and how `confidence` was shown
// to be a lookup rather than a judgement. ⇒ this harness asks the three questions in three BLIND calls
// and then looks for CROSSINGS: sentences that share one axis value and differ on another.
// ⛔ **No crossings would mean the axes are synonyms**, and that outcome stays available and reportable.
//
// ── ⛔ WHAT THIS DOES NOT DO ─────────────────────────────────────────────────────────────────────
// ⛔ No schema, no column, no enum is proposed or written. ⛔ Nothing is persisted. ⛔ The production
// modality gate stays inert, the Rome rows are untouched, and lexical retrieval stays disabled.

import { writeFileSync, readFileSync } from 'node:fs'
import { devPg, devSchema, ollamaHost } from '../harness.mjs'
import { probeAxes, crossings, ACT, TERM, TARGET } from '../lib/axes-probe.mjs'

const ROME = process.argv.includes('--rome')
const cfg = JSON.parse(readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))
const MODEL = String(cfg?.memory?.extractModel || 'ollama/qwen3.5:9b').replace(/^ollama\//, '')
const HOST = ollamaHost()

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
          stream: false, think: false,
          options: { temperature: 0, num_predict: 220, num_gpu: 0 },
        }),
        signal: AbortSignal.timeout(300_000),
      })
      if (!res.ok) throw new Error(`ollama ${res.status}`)
      return (await res.json())?.message?.content ?? ''
    } catch (e) {
      lastErr = e; llmFailures++
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
  throw lastErr
}

// ── THE CORPUS ───────────────────────────────────────────────────────────────────────────────────
// The nine Ote named, plus controls chosen to give the cross-tabulation ROOM. ⭐ The controls matter:
// without a **designation carried by a LITERAL term**, `term` and `target` could not disagree even if
// they are genuinely independent, and the measurement would report a false negative.
const CORPUS = [
  { id: 'S1', text: 'I want to build Rome in one day.' },
  { id: 'S2', text: "Rome wasn't built in a day." },
  { id: 'S3', text: 'You are my Rome.' },
  { id: 'S4', text: "We'll call the whole effort Rome." },
  { id: 'S5', text: 'Claude will be kinda your uncle.' },
  { id: 'S6', text: 'Hermes is like an aunt to me.' },
  { id: 'S7', text: 'My inbox is a warzone.' },
  { id: 'S8', text: 'Call me Ote.' },
  { id: 'S9', text: 'Rome is my project.' },

  // ⭐ CONTROLS — designation and relationship carried by LITERAL terms, so B and C have somewhere to
  // disagree; and an ordinary property, so `describe` is not always the same target.
  { id: 'K1', text: 'My manager is called Priya.', control: true },
  { id: 'K2', text: 'The deploy script is named rollout.sh.', control: true },
  { id: 'K3', text: 'Priya reviews everything I merge.', control: true },
  { id: 'K4', text: 'I work out of Bangkok.', control: true },
  { id: 'K5', text: 'Think of me as your editor, not your boss.', control: true },
]

const out = { at: new Date().toISOString(), model: MODEL, rows: [], rome: [] }
console.log('\n══ THREE AXES, THREE BLIND CALLS PER SENTENCE ═══════════════════════')
console.log(`   ${MODEL} · temperature 0 · think off · num_gpu 0`)
console.log('   ⛔ nothing persisted · production gate inert · Rome untouched · lexical arm off\n')
console.log('   id   ACT          TERM                 TARGET         sentence')
console.log('   ' + '─'.repeat(94))

for (const c of CORPUS) {
  const r = await probeAxes({ llm, text: c.text })
  const row = { id: c.id, control: !!c.control, text: c.text, ...r }
  out.rows.push(row)
  const termCell = `${r.termUse ?? '?'}${r.term ? `(${r.term})` : ''}`
  console.log(`   ${String(c.id).padEnd(4)} ${String(r.act ?? '?').padEnd(12)} ${termCell.padEnd(20)} ${String(r.target ?? '?').padEnd(14)} "${c.text}"`)
  console.log(`        learned: ${r.learned || '—'}`)
}

// ── ⭐⭐⭐ THE SEPARABILITY TEST ──────────────────────────────────────────────────────────────────
console.log('\n══ CROSSINGS — where two axes DISAGREE ══════════════════════════════')
console.log('   ⭐ A crossing is one axis value under which another axis takes MORE THAN ONE value.')
console.log('   ⛔ Zero crossings in both directions ⇒ the two are SYNONYMS on this corpus.\n')
const PAIRS = [['act', 'target'], ['target', 'act'], ['act', 'termUse'], ['termUse', 'act'], ['termUse', 'target'], ['target', 'termUse']]
out.crossings = {}
for (const [x, y] of PAIRS) {
  const cr = crossings(out.rows, x, y)
  out.crossings[`${x}->${y}`] = cr
  const label = `${x} → ${y}`.padEnd(22)
  if (!cr.length) { console.log(`   ${label} ⛔ NONE — ${y} is a function of ${x} on this corpus`); continue }
  console.log(`   ${label} ⭐ ${cr.length} crossing(s):`)
  for (const c of cr) console.log(`        ${x}=${c.x} splits into  ${c.values.map((v) => `${v.y}[${v.ids.join(',')}]`).join('  ')}`)
}

// ── ⭐⭐ THE OteRM BOUNDARY, MADE CONCRETE ───────────────────────────────────────────────────────
// Ote: *"a designation/relationship should not be forced into the ordinary entity / attribute / value
// fact model just because that is the only structured door available today."*
// ⇒ for every sentence whose TARGET is not `property`, show what today's only structured door would
// have to store, and what that costs. ⛔ This is a projection of the CURRENT model, not a proposal.
console.log('\n══ WHAT TODAY\'S ONLY STRUCTURED DOOR WOULD DO WITH THESE ═══════════')
const notProperty = out.rows.filter((r) => r.target && r.target !== TARGET.property && r.target !== TARGET.nothing)
for (const r of notProperty) {
  console.log(`   ${r.id} [${r.target}] "${r.text}"`)
  console.log(`        learned      : ${r.learned}`)
  console.log(`        forced into  : entity=<someone> · attribute=<?> · value=<?>   ⛔ the fact model has no ${r.target}`)
}
out.notProperty = notProperty.map((r) => ({ id: r.id, target: r.target, learned: r.learned }))

// ── ⭐ THE LIVE ROME ROWS, READ-ONLY ─────────────────────────────────────────────────────────────
if (ROME) {
  console.log('\n══ THE LIVE ROWS — and the occasion problem, carried forward ════════')
  const pg = devPg(); await pg.connect()
  const S = devSchema()
  const rows = (await pg.query(
    `select left(m.id::text,8) id, m.entity, m.attribute, m.evidence,
            (select msg.content from ${S}.txn_messages msg where msg.id = m.source_message_id) src
       from ${S}.txn_memories m where m.content ~* '\\mrome\\M' order by m.created_at`)).rows
  for (const row of rows) {
    if (!row.src) { console.log(`   ${row.id} ⛔ no source message\n`); continue }
    const r = await probeAxes({ llm, text: row.src })
    out.rome.push({ id: row.id, src: row.src, ...r })
    console.log(`   ${row.id}  "${String(row.src).replace(/\s+/g, ' ').slice(0, 78)}"`)
    console.log(`        ACT=${r.act ?? '?'}  TERM=${r.termUse ?? '?'}(${r.term})  TARGET=${r.target ?? '?'}`)
    console.log(`        learned: ${r.learned || '—'}`)
    // ⚠️⚠️ THE FINDING OTE ASKED TO KEEP ATTACHED. `02b095e5` is anchored to "wanna remember?" — the
    // OCCASION — so all three axes are being asked about the wrong text. A derivation, not an occasion,
    // is what a synthesis row would have to be classified from.
    const isOccasionOnly = /^\s*(wanna remember|you want to do look up|remember)\??\s*$/i.test(String(row.src).trim())
    if (isOccasionOnly) {
      console.log('        ⚠️⚠️ THIS IS THE OCCASION, NOT THE MATERIAL — all three axes are answering about')
      console.log('             the turn where she was TOLD to remember. ⇒ a synthesis row cannot be')
      console.log('             classified from `source_message_id`; it needs `evidence.derivedFrom`.')
    }
    console.log('')
  }
  await pg.end()
}

out.summary = {
  sentences: CORPUS.length,
  distinctActs: [...new Set(out.rows.map((r) => r.act).filter(Boolean))],
  distinctTerms: [...new Set(out.rows.map((r) => r.termUse).filter(Boolean))],
  distinctTargets: [...new Set(out.rows.map((r) => r.target).filter(Boolean))],
  crossingCounts: Object.fromEntries(Object.entries(out.crossings).map(([k, v]) => [k, v.length])),
  llmFailures,
  unresolved: out.rows.filter((r) => !r.act || !r.termUse || !r.target).map((r) => r.id),
}
console.log('\n══ SUMMARY ══════════════════════════════════════════════════════════')
console.log(`   acts used    : ${out.summary.distinctActs.join(' ')}`)
console.log(`   term uses    : ${out.summary.distinctTerms.join(' ')}`)
console.log(`   targets used : ${out.summary.distinctTargets.join(' ')}`)
console.log(`   crossings    : ${Object.entries(out.summary.crossingCounts).map(([k, n]) => `${k}=${n}`).join('  ')}`)
console.log(`   ⚠️ llm retries: ${llmFailures}   unresolved cells: ${out.summary.unresolved.join(' ') || 'none'}`)
void ACT; void TERM

const file = new URL('../results/axes-matrix.json', import.meta.url)
writeFileSync(file, JSON.stringify(out, null, 2), 'utf8')
console.log(`\n  wrote ${file.pathname.replace(/^\//, '')}`)
