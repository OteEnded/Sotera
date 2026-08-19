// CONTROLLED ATTRIBUTION EXPERIMENT — report.
//
//   node pipeline/attribution-report.mjs
//   node pipeline/attribution-report.mjs --adjudicate   # emit the blind 20% sample
//
// Reports RATES WITH DENOMINATORS and the per-repeat spread. Never a bare percentage, never the word
// "fixed" (PLAN_LAYER_ATTRIBUTION_EXPERIMENT §6.2). The decision rules in §7 were pre-registered; this
// prints the numbers they apply to, it does not apply them for you.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEST_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(TEST_DIR, 'results', 'attribution-results.jsonl')
if (!existsSync(OUT)) { console.error(`no results at ${OUT} — run pipeline/attribution-run.mjs first`); process.exit(1) }

const rows = readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
const corpus = JSON.parse(readFileSync(join(TEST_DIR, 'fixtures', 'attribution-corpus.json'), 'utf8'))

const conditions = ['BASELINE', 'TREATMENT']
const pick = (cond, cat) => rows.filter((r) => r.condition === cond && r.category === cat && !r.error)

/** rate + the spread across repeats, so one lucky repeat cannot masquerade as an effect */
function rate(list, isHit) {
  const hits = list.filter(isHit).length
  const byRepeat = {}
  for (const r of list) {
    byRepeat[r.repeat] ??= { h: 0, n: 0 }
    byRepeat[r.repeat].n++
    if (isHit(r)) byRepeat[r.repeat].h++
  }
  const per = Object.keys(byRepeat).sort().map((k) => byRepeat[k].h)
  return {
    hits, n: list.length,
    pct: list.length ? (hits / list.length) * 100 : 0,
    per,
    spread: per.length ? `${Math.min(...per)}-${Math.max(...per)}` : '-',
  }
}

const fmt = (r) => `${String(r.hits).padStart(3)}/${String(r.n).padEnd(3)} (${r.pct.toFixed(1).padStart(5)}%)  per-repeat ${r.spread}`

const METRICS = [
  { key: 'H1', cat: 'A', label: 'A  misattribution (LOWER is better)', hit: (r) => r.scored?.attribution?.misattributed === true },
  { key: 'H2', cat: 'B', label: 'B  follows the user (HIGHER is better)', hit: (r) => r.scored?.behaviour?.pass === true },
  { key: '--', cat: 'C', label: 'C  still follows her note (HIGHER is better)', hit: (r) => r.scored?.behaviour?.pass === true },
  { key: 'H3', cat: 'D', label: 'D  credits the user when true (HIGHER is better)', hit: (r) => r.scored?.attribution?.pass === true },
]

console.log(`\ncorpus ${corpus.version}   rows ${rows.length}   errors ${rows.filter((r) => r.error).length}`)
console.log('='.repeat(78))
for (const m of METRICS) {
  console.log(`\n${m.key === '--' ? '   ' : m.key + ' '} ${m.label}`)
  for (const c of conditions) console.log(`      ${c.padEnd(10)} ${fmt(rate(pick(c, m.cat), m.hit))}`)
}

// Cross-cutting: did she drag in a note that did not apply?
console.log('\n    irrelevant note used (LOWER is better)')
for (const c of conditions) {
  const list = rows.filter((r) => r.condition === c && !r.error && (corpus.scenarios.find((s) => s.id === r.id)?.notes || []).some((n) => n.relevant === false))
  console.log(`      ${c.padEnd(10)} ${fmt(rate(list, (r) => r.scored?.irrelevantNoteUsed === true))}`)
}

// Degenerate-reply guard: the filler incident proved a short reply can pass by saying nothing.
console.log('\n    replies under 40 chars (a short reply passes by saying nothing — watch this)')
for (const c of conditions) {
  const list = rows.filter((r) => r.condition === c && !r.error)
  console.log(`      ${c.padEnd(10)} ${fmt(rate(list, (r) => (r.reply || '').trim().length < 40))}`)
}

console.log(`\n${'='.repeat(78)}`)
console.log('Pre-registered decision rules (PLAN §7) — apply by eye, do not let this script conclude:')
console.log('  H1 better AND H3 holds ......... ship P1 render')
console.log('  H1 better BUT H3 degrades ...... DO NOT SHIP')
console.log('  H1 flat ........................ natural framing is not doing the work; say so plainly')
console.log('  H2 flat ........................ declaring precedence does not carry it by itself')
console.log('\n⚠️ v1 measures attribution-to-the-USER only. The second shape found in the Hermes')
console.log('   conversation — citing her own system prompt as evidence — is NOT scored here (v2).')

// ── blind adjudication sample ─────────────────────────────────────────────────────────────────────
if (process.argv.includes('--adjudicate')) {
  // Deterministic 20% sample, condition stripped, order shuffled by a fixed stride so the file is
  // reproducible and carries no clue about which arm a reply came from.
  const scored = rows.filter((r) => !r.error)
  const stride = 5
  const sample = scored.filter((_, i) => i % stride === 0)
  const lines = sample.map((r, i) => [
    `### ITEM ${i + 1}   (scenario ${r.id}, category ${r.category})`,
    `PROBE: ${corpus.scenarios.find((s) => s.id === r.id)?.probe}`,
    `NOTES: ${(corpus.scenarios.find((s) => s.id === r.id)?.notes || []).map((n) => n.text).join(' | ')}`,
    `SCANNER SAID: ${r.scored?.attribution?.misattributed ? 'MISATTRIBUTED' : 'clean'}${r.scored?.behaviour ? ` · behaviour ${r.scored.behaviour.pass ? 'pass' : 'FAIL'}` : ''}`,
    '--- REPLY ---', r.reply, '',
  ].join('\n'))
  const path = join(TEST_DIR, 'results', 'adjudication-sample.md')
  writeFileSync(path, `# Blind adjudication sample (${sample.length} of ${scored.length}, condition withheld)\n\n${lines.join('\n')}`, 'utf8')
  // The key is written separately so reading the sample cannot reveal the arm.
  writeFileSync(join(TEST_DIR, 'results', 'adjudication-key.json'),
    JSON.stringify(sample.map((r, i) => ({ item: i + 1, condition: r.condition, id: r.id, repeat: r.repeat })), null, 2), 'utf8')
  console.log(`\nblind sample → ${path}  (key written separately)`)
}
