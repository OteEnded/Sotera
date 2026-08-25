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
console.log(`  ${pad('arm', 19)} ${n('tools', 6)} ${n('retr', 5)} ${n('empty', 6)} ${n('wall s', 7)} ${n('prompt', 8)} ${n('payload', 8)}  invented?  refusal-words  correct`)
for (const a of arms) {
  const r = byKey.get(`${a}/absent`)
  if (!r) { console.log(`  ${pad(a, 19)} ${n('(not run)', 6)}`); continue }
  const b = r.behaviour, o = r.outcome, c = r.cost
  console.log(`  ${pad(a, 19)} ${n(b.toolCalls, 6)} ${n(b.retrievalCalls, 5)} ${n(b.emptyRetrievals, 6)} `
    + `${n(c.wallMs != null ? (c.wallMs / 1000).toFixed(0) : '?', 7)} ${n(c.promptTokens, 8)} ${n(r.payload.maxChars, 8)}  ${pad(o.assertedTiers ? '⛔ YES' : 'no', 9)} ${pad(o.refusedAdvisory ? 'yes' : 'not detected', 13)} ${o.correct ? '✔' : '✖'}`
    + `${r.preconditions.valid ? '' : '   ⛔ PRECONDITIONS INVALID'}`)
}

console.log(`\n  ── which of the five facts each arm reached (task "real") ${'─'.repeat(56)}`)
for (const a of arms) {
  const r = byKey.get(`${a}/real`)
  if (!r) continue
  console.log(`  ${pad(a, 19)} ${Object.keys(FACTS).map((k) => `${r.outcome.facts[k] ? '✔' : '✖'} ${k}`).join('   ')}`)
}

// ── ⭐⭐⭐ THE VARIANCE PROBE · ⛔ REPORTED PER RUN, NEVER AVERAGED ─────────────────────────────────
//
// Ote: *"preserve the clean-control results even if they disagree. Variance itself is a B4 finding, not
// something to average away."* ⇒ every replicate is printed on its own line with its own cid, and the
// spread is described rather than reduced to a mean. ⛔ A mean of {0/5, 4/5, 0/5} is 1.3/5, which is a
// number no run produced and a behaviour she never exhibited.
const controls = recs.filter((r) => /^control-/.test(r.arm) && r.task === 'real').sort((a, b) => a.arm.localeCompare(b.arm))
if (controls.length) {
  console.log(`\n  ── ⭐ VARIANCE PROBE · the UNCHANGED configuration, run ${controls.length}× on the same corpus ${'─'.repeat(24)}`)
  for (const r of controls) {
    console.log(`  ${pad(r.arm, 19)} ${n(`${r.outcome.factsFound}/5`, 6)} ${r.outcome.correct ? '✔' : '✖'}  tools=${n(r.behaviour.toolCalls, 3)} retr=${n(r.behaviour.retrievalCalls, 3)}`
      + `  badAxis=${n(r.behaviour.axesExcludingTarget, 2)}  ${n((r.cost.wallMs / 1000).toFixed(0), 4)}s  ${r.cid.slice(0, 8)}`
      + `${r.preconditions.valid ? '' : '  ⛔ INVALID'}`)
  }
  const scores = controls.map((r) => r.outcome.factsFound)
  const lo = Math.min(...scores), hi = Math.max(...scores)
  const allValid = controls.every((r) => r.preconditions.valid)
  // ⛔ N is stated with the spread, always: a range over three runs is not a confidence interval and must
  // never be quoted as one. It says only whether these particular runs agreed.
  console.log(`\n  facts across ${controls.length} clean runs: ${scores.join(', ')} of 5`
    + `   ${lo === hi ? '⇒ CONSISTENT' : `⇒ ⚠️ THEY SCATTER (${lo}–${hi})`}`
    + `${allValid ? '' : '   ⛔ at least one run had invalid preconditions'}`)
  if (lo !== hi) {
    console.log('  ⛔ n=1 per arm cannot separate a payload-shape effect from this. The comparison needs replicates.')
  } else if (controls.length >= 3) {
    console.log('  ⭐ the unchanged configuration is reproducible, so a single run per arm is interpretable.')
  }
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
