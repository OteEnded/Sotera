// ⭐⭐⭐ THE B4 ARM COMPARISON. ⛔ Reads recorded runs only — never generates, never re-runs.
//
// Ote's frame, once correctness stopped discriminating: *"efficiency + axis quality, with correctness as a
// floor … The main thing I'm interested in is whether the alternative payload shapes make her reason over
// the retrieved material more directly, rather than dumping a huge inventory in front of the actual
// evidence and encouraging unnecessary searching."*
//
// ── ⛔ WHAT THIS TABLE REFUSES TO DO ────────────────────────────────────────────────────────────────
//   · it never prints a mean without the raw values beside it — *"show the raw per-run results rather than
//     only an aggregate"*, and a mean of {0,5,5,5} is 3.75, a score no run produced
//   · it never calls max−min a "spread" — over n=3 that number only grows with N and is not a dispersion
//   · it prints correctness FIRST and as a FLOOR: *"If correctness drops below 5/5 for any arm, that is
//     immediately important regardless of efficiency gains"*
//   · it never ranks a shape that lost the negative control, however efficient it was

import { readdirSync, readFileSync } from 'node:fs'
import { FACTS } from '../lib/b4-case.mjs'

const DIR = new URL('../results/b4/', import.meta.url)
const recs = readdirSync(DIR).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(new URL(f, DIR), 'utf8')))

// ⭐ `bounded-inventory-2` → shape `bounded-inventory`, replicate 2. `baseline` and `control-N` keep their
// own identity: the baseline is frozen evidence and the controls ARE the `current` arm.
const shapeOf = (arm) => (/^control-\d+$/.test(arm) ? 'current' : arm.replace(/-\d+$/, ''))
const ORDER = ['baseline', 'current', 'bounded-inventory', 'windows-first', 'plain-coverage']
const shapes = [...new Set(recs.map((r) => shapeOf(r.arm)))]
  .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99))

const n = (v, w) => String(v ?? '–').padStart(w)
const pad = (v, w) => String(v ?? '–').padEnd(w)
const runsOf = (shape, task) => recs.filter((r) => shapeOf(r.arm) === shape && r.task === task)
  .sort((a, b) => a.arm.localeCompare(b.arm))
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[(s.length - 1) >> 1] : null }

console.log(`\n${'═'.repeat(118)}`)
console.log('  B4 · PAYLOAD SHAPE COMPARISON — identical task, prompts, corpus, grader and harness conditions')
console.log(`${'═'.repeat(118)}`)

// ══ 1 · ⛔ THE FLOOR, CHECKED BEFORE ANY EFFICIENCY NUMBER IS SHOWN ════════════════════════════════
console.log(`\n  ── ⛔ CORRECTNESS FLOOR ${'─'.repeat(90)}`)
console.log(`  ${pad('shape', 20)} ${pad('real (facts per run)', 26)} ${pad('absent (invented?)', 24)} floor`)
const floorOK = new Map()
for (const s of shapes) {
  const real = runsOf(s, 'real')
  const abs = runsOf(s, 'absent')
  const realStr = real.length ? real.map((r) => `${r.outcome.factsFound}/5${r.behaviour.exercisedShape === true ? '' : '⚠'}`).join(' ') : '–'
  const absStr = abs.length ? abs.map((r) => (r.outcome.assertedTiers ? '⛔INVENTED' : 'no')).join(' ') : '–'
  // ⭐⭐⭐ A RUN THAT NEVER CALLED `retrieve_conversations` DID NOT PRODUCE THE PAYLOAD UNDER TEST, so it
  // cannot count for or against a shape. ⛔ It is still shown — it is a real observation about salience,
  // and hiding it would be curating the result — but the floor is judged on the runs that exercised it.
  // ⚠️ `bounded-inventory` replicate 1 is exactly this: 0/5 from `recall_memory` + `search_conversations`
  // alone, ending in *"those conversations are in a place I cannot reach from here"*.
  const realX = real.filter((r) => r.behaviour.exercisedShape === true)
  const skipped = real.length - realX.length
  const ok = realX.length > 0 && realX.every((r) => r.outcome.correct) && abs.length > 0 && abs.every((r) => r.outcome.correct)
  floorOK.set(s, ok)
  const invalid = [...real, ...abs].filter((r) => !r.preconditions?.valid).length
  console.log(`  ${pad(s, 20)} ${pad(realStr, 26)} ${pad(absStr, 24)} ${ok ? '✔ holds' : '⛔ BROKEN'}`
    + `${invalid ? `   ⛔ ${invalid} run(s) with INVALID preconditions` : ''}`
    + `${skipped ? `   ⚠ ${skipped} run(s) never called retrieve_conversations — shape not exercised, excluded from the floor` : ''}`)
}

// ══ 2 · ⭐⭐ THE EFFICIENCY / AXIS METRICS · RAW PER RUN ════════════════════════════════════════════
// ⭐ These are Ote's list verbatim: tool calls, retrieval calls, badAxis, wall clock, prompt size. The
// question they answer together is whether a shape ends the searching sooner, not whether it wins once.
const COLS = [
  ['tools', (r) => r.behaviour.toolCalls],
  ['retrieval', (r) => r.behaviour.retrievalCalls],
  ['badAxis', (r) => r.behaviour.axesExcludingTarget],
  ['empty', (r) => r.behaviour.emptyRetrievals],
  ['wall s', (r) => Math.round(r.cost.wallMs / 1000)],
  ['prompt tok', (r) => r.cost.promptTokens],
  ['payload ch', (r) => r.payload.maxChars],
]
for (const task of ['real', 'absent']) {
  console.log(`\n  ── ⭐ TASK "${task}" · ${task === 'real' ? 'the answer EXISTS in one conversation from 2026-08-20' : 'NEGATIVE CONTROL — no such answer exists'} ${'─'.repeat(task === 'real' ? 27 : 34)}`)
  console.log(`  ${pad('shape', 20)} ${COLS.map(([h]) => n(h, 12)).join(' ')}`)
  for (const s of shapes) {
    const rs = runsOf(s, task)
    if (!rs.length) { console.log(`  ${pad(s, 20)} ${n('(not run)', 12)}`); continue }
    // ⛔ RAW VALUES, one cell per run, and the median beneath them — never a mean standing alone.
    console.log(`  ${pad(s, 20)} ${COLS.map(([, f]) => n(rs.map(f).join(','), 12)).join(' ')}`)
    if (rs.length > 1) console.log(`  ${pad(`  └ median (n=${rs.length})`, 20)} ${COLS.map(([, f]) => n(med(rs.map(f)), 12)).join(' ')}`)
  }
}

// ══ 3 · ⭐⭐⭐ THE QUESTION OTE ACTUALLY ASKED ══════════════════════════════════════════════════════
// *"whether one shape consistently reduces the unnecessary retrieval loop"* — consistently, so the test is
// per-run domination against the control's own range, ⛔ not a difference of medians.
const ctrl = runsOf('current', 'real').filter((r) => r.behaviour.exercisedShape === true)
if (ctrl.length) {
  console.log(`\n  ── ⭐⭐⭐ DOES ANY SHAPE *CONSISTENTLY* SHORTEN THE LOOP? ${'─'.repeat(59)}`)
  const cTools = ctrl.map((r) => r.behaviour.toolCalls)
  const cRetr = ctrl.map((r) => r.behaviour.retrievalCalls)
  console.log(`  control (current), n=${ctrl.length}: tools ${cTools.join(',')} · retrieval ${cRetr.join(',')}`)
  for (const s of shapes) {
    if (s === 'current' || s === 'baseline') continue
    const rs = runsOf(s, 'real').filter((r) => r.behaviour.exercisedShape === true)
    if (rs.length < 2) { console.log(`  ${pad(s, 20)} too few runs that EXERCISED the shape to say "consistently"`); continue }
    const tools = rs.map((r) => r.behaviour.toolCalls)
    const retr = rs.map((r) => r.behaviour.retrievalCalls)
    // ⭐ "Consistently better" = EVERY run beats EVERY control run. A weaker test would let one lucky run
    // carry a shape, which is the thing n=3 was bought to prevent.
    const allBelowT = Math.max(...tools) < Math.min(...cTools)
    const allBelowR = Math.max(...retr) < Math.min(...cRetr)
    const overlapT = !allBelowT && Math.min(...tools) <= Math.max(...cTools)
    const verdict = !floorOK.get(s) ? '⛔ FLOOR BROKEN — not a candidate at any efficiency'
      : (allBelowT && allBelowR ? '✔✔ every run beat every control run, on both counts'
        : (allBelowT || allBelowR ? `✔ separated on ${allBelowT ? 'tool calls' : 'retrieval calls'} only`
          : (overlapT ? '·  overlaps the control range — no consistent effect at n=3' : '✖ worse')))
    console.log(`  ${pad(s, 20)} tools ${pad(tools.join(','), 10)} retrieval ${pad(retr.join(','), 10)} ${verdict}`)
  }
}

console.log(`\n  ── which facts each run reached (task "real") ${'─'.repeat(68)}`)
for (const s of shapes) {
  for (const r of runsOf(s, 'real')) {
    console.log(`  ${pad(r.arm, 20)} ${Object.keys(FACTS).map((k) => `${r.outcome.facts[k] ? '✔' : '✖'}`).join(' ')}  ${Object.keys(FACTS).map((k) => k.split(' ').pop()).join('/')}`)
  }
}
console.log('')
