// ⭐⭐⭐ F4 — score the blind judgments against the sealed key. ⛔ Run ONLY after the judging is submitted.
//
//   node test/pipeline/reflection-gen4-f4-score.mjs
//
// Reads the sealed mapping (test/results/reflection-gen4-ab-key.json), the submitted judgments
// (test/results/reflection-gen4-blind-answers.json) and the run record (reflection-gen4-ab.json).
// Prints the mapping, scores the submission arm-by-arm, and — the part that matters — separates the pairs where BOTH
// sides retained content from the pairs where one side retained NOTHING, because only the former measure retention QUALITY.
import { readFileSync } from 'node:fs'

const KEY = JSON.parse(readFileSync(new URL('../results/reflection-gen4-ab-key.json', import.meta.url), 'utf8'))
const J = JSON.parse(readFileSync(new URL('../results/reflection-gen4-blind-answers.json', import.meta.url), 'utf8'))
const R = JSON.parse(readFileSync(new URL('../results/reflection-gen4-ab.json', import.meta.url), 'utf8'))
const ARM = { A: 'Gen 3 (live)', B: 'Gen 4 (citation instrument)' }
const byIndex = new Map(R.pairs.map((p) => [String(p.index), p]))
const rowsOf = (p, arm) => (p[arm]?.harvest?.rows ?? []).length

const rows = []
for (let n = 1; n <= 20; n++) {
  const k = KEY.pairs[String(n)]                       // { X: 'A'|'B', Y: 'A'|'B' }
  const p = byIndex.get(String(n))
  const a = J.answers[String(n)]
  const chosenArm = a['rater-1'] === 'Neither' ? null : k[a['rater-1']]
  rows.push({
    pair: n,
    X: `${k.X} = ${ARM[k.X]}`, Y: `${k.Y} = ${ARM[k.Y]}`,
    choice: a['rater-1'], chosenArm, agreed: a['rater-1'] === a['rater-2'],
    retainedX: rowsOf(p, k.X), retainedY: rowsOf(p, k.Y),
    headToHead: rowsOf(p, k.X) > 0 && rowsOf(p, k.Y) > 0,
  })
}

console.log('══ THE SEALED MAPPING, OPENED ══')
for (const r of rows) console.log(`  pair ${String(r.pair).padStart(2)}  X = ${r.X.padEnd(30)}  Y = ${r.Y}`)

const contested = rows.filter((r) => r.choice !== 'Neither')
const neither = rows.filter((r) => r.choice === 'Neither')
const h2h = rows.filter((r) => r.headToHead)
const forArm = (arm, set = contested) => set.filter((r) => r.chosenArm === arm).length

console.log('\n══ THE SUBMISSION, SCORED ══')
console.log(`  Neither (no preference)     ${neither.length} of 20  — pairs ${neither.map((r) => r.pair).join(', ')}`)
console.log(`  preferred Gen 3 (arm A)     ${forArm('A')}  — pairs ${contested.filter((r) => r.chosenArm === 'A').map((r) => r.pair).join(', ') || '—'}`)
console.log(`  preferred Gen 4 (arm B)     ${forArm('B')}  — pairs ${contested.filter((r) => r.chosenArm === 'B').map((r) => r.pair).join(', ') || '—'}`)
console.log(`  F4 ("the blind pairing prefers Gen 3") ⇒ ${forArm('A') > forArm('B') ? '⛔ TRIPPED' : 'NOT tripped'}`)

console.log('\n══ WHAT EACH CONTESTED PAIR ACTUALLY COMPARED ══')
for (const r of contested) {
  console.log(`  pair ${String(r.pair).padStart(2)}  chose ${r.choice} = ${ARM[r.chosenArm]}  ·  retained X:${r.retainedX} Y:${r.retainedY}  ·  ${r.headToHead ? '⭐ HEAD-TO-HEAD (both retained)' : 'retained-vs-nothing'}`)
}
const h2hContested = contested.filter((r) => r.headToHead)
console.log(`\n  head-to-head pairs among the contested: ${h2hContested.length} (pairs ${h2hContested.map((r) => r.pair).join(', ') || '—'})`)
console.log(`  of those, preferred Gen 3: ${forArm('A', h2hContested)} · preferred Gen 4: ${forArm('B', h2hContested)}`)
console.log(`  ⇒ on QUALITY alone the evidence is ${h2hContested.length} pair(s) — ${h2hContested.length < 3 ? 'too thin to rank the instruments' : 'reportable'}`)

console.log('\n══ SUPPORTING RATER ══')
console.log(`  rater-2 agreed with the submission on ${rows.filter((r) => r.agreed).length} of 20 pairs (disagreements: ${rows.filter((r) => !r.agreed).map((r) => r.pair).join(', ') || 'none'})`)

// ⭐ the confound, computed rather than asserted: how often did the PREFERRED side simply retain more?
const preferredRetainedMore = contested.filter((r) => (r.choice === 'X' ? r.retainedX > r.retainedY : r.retainedY > r.retainedX)).length
console.log(`\n══ THE CONFOUND, MEASURED ══`)
console.log(`  contested pairs where the preferred side retained MORE rows: ${preferredRetainedMore} of ${contested.length}`)
console.log(`  contested pairs where the losing side retained NOTHING:      ${contested.filter((r) => !r.headToHead).length} of ${contested.length}`)
