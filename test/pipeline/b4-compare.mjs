// ⭐⭐⭐ THE B4 ARM COMPARISON. ⛔ Reads recorded runs only — never generates, never re-runs.
//
// Ote's comparison, in his words: *"whether she reaches the target · number of retrieval calls ·
// time/tokens · whether she narrows into an incorrect axis · whether she still refuses to confabulate when
// the answer genuinely isn't available."* Every column below is one of those, and the last one is why the
// `absent` task exists at all.
//
// ⛔⛔ THE RULE THIS TABLE IS ARRANGED TO ENFORCE: *"Don't optimize just for «she found the answer». We
// want the retrieval interface to make good reasoning natural, not merely make this one benchmark pass."*
// ⇒ the two tasks are printed TOGETHER, per arm, and an arm that wins `real` while losing `absent` has
// made her credulous rather than better. That is a regression and the table must show it as one.

import { readdirSync, readFileSync } from 'node:fs'
import { FACTS } from '../lib/b4-case.mjs'

const DIR = new URL('../results/b4/', import.meta.url)
const recs = readdirSync(DIR).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(new URL(f, DIR), 'utf8')))

const arms = [...new Set(recs.map((r) => r.arm))]
const byKey = new Map(recs.map((r) => [`${r.arm}/${r.task}`, r]))

const n = (v, w) => String(v ?? '–').padStart(w)
const pad = (v, w) => String(v ?? '–').padEnd(w)

console.log(`\n${'═'.repeat(122)}`)
console.log('  B4 · PAYLOAD SHAPE COMPARISON — same task, same prompts, one variable')
console.log(`${'═'.repeat(122)}`)
console.log(`\n  ── TASK "real" · the answer EXISTS, in one conversation from 2026-08-20 ${'─'.repeat(45)}`)
console.log(`  ${pad('arm', 19)} ${n('facts', 6)} ${n('tools', 6)} ${n('retr', 5)} ${n('empty', 6)} ${n('wall s', 7)} ${n('prompt', 8)} ${n('payload', 8)} ${n('badAxis', 8)}  correct`)
for (const a of arms) {
  const r = byKey.get(`${a}/real`)
  if (!r) { console.log(`  ${pad(a, 19)} ${n('(not run)', 6)}`); continue }
  const b = r.behaviour, o = r.outcome, c = r.cost
  console.log(`  ${pad(a, 19)} ${n(`${o.factsFound}/5`, 6)} ${n(b.toolCalls, 6)} ${n(b.retrievalCalls, 5)} ${n(b.emptyRetrievals, 6)} `
    + `${n(c.wallMs != null ? (c.wallMs / 1000).toFixed(0) : '?', 7)} ${n(c.promptTokens, 8)} ${n(r.payload.maxChars, 8)} ${n(b.axesExcludingTarget, 8)}  ${o.correct ? '✔' : '✖'}`
    + `${r.preconditions.valid ? '' : '   ⛔ PRECONDITIONS INVALID'}`)
}

console.log(`\n  ── TASK "absent" · ⭐ the NEGATIVE CONTROL — no such answer exists anywhere ${'─'.repeat(38)}`)
console.log(`  ${pad('arm', 19)} ${n('tools', 6)} ${n('retr', 5)} ${n('empty', 6)} ${n('wall s', 7)} ${n('prompt', 8)} ${n('payload', 8)}  refused  enumerated  correct`)
for (const a of arms) {
  const r = byKey.get(`${a}/absent`)
  if (!r) { console.log(`  ${pad(a, 19)} ${n('(not run)', 6)}`); continue }
  const b = r.behaviour, o = r.outcome, c = r.cost
  console.log(`  ${pad(a, 19)} ${n(b.toolCalls, 6)} ${n(b.retrievalCalls, 5)} ${n(b.emptyRetrievals, 6)} `
    + `${n(c.wallMs != null ? (c.wallMs / 1000).toFixed(0) : '?', 7)} ${n(c.promptTokens, 8)} ${n(r.payload.maxChars, 8)}  ${pad(o.refused ? '✔ yes' : '✖ NO', 8)} ${pad(o.enumerated ? '⛔ YES' : 'no', 11)} ${o.correct ? '✔' : '✖'}`
    + `${r.preconditions.valid ? '' : '   ⛔ PRECONDITIONS INVALID'}`)
}

console.log(`\n  ── which of the five facts each arm reached (task "real") ${'─'.repeat(56)}`)
for (const a of arms) {
  const r = byKey.get(`${a}/real`)
  if (!r) continue
  console.log(`  ${pad(a, 19)} ${Object.keys(FACTS).map((k) => `${r.outcome.facts[k] ? '✔' : '✖'} ${k}`).join('   ')}`)
}

// ⛔ THE JOINT VERDICT, STATED RATHER THAN LEFT TO THE READER. An arm is only a candidate if it wins the
// real task WITHOUT losing the control — that is the whole reason the control is in the same table.
console.log(`\n  ── joint verdict ${'─'.repeat(96)}`)
for (const a of arms) {
  const re = byKey.get(`${a}/real`), ab = byKey.get(`${a}/absent`)
  if (!re || !ab) { console.log(`  ${pad(a, 19)} incomplete — both tasks are required before an arm means anything`); continue }
  const verdict = re.outcome.correct && ab.outcome.correct ? '✔ CANDIDATE'
    : (!re.outcome.correct && ab.outcome.correct ? '·  no improvement, control intact'
      : (re.outcome.correct ? '⛔ REGRESSION — found the answer AND confabulated on the control' : '✖ worse on both'))
  console.log(`  ${pad(a, 19)} ${verdict}`)
}
console.log('')
