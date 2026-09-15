// ⭐⭐⭐ D1 PHASE 3 · THE CALLER MATRIX — every construction that can reach the memory store, and what it declares.
//
//   node test/maintenance/writer-caller-matrix.mjs            the matrix
//   node test/maintenance/writer-caller-matrix.mjs --undeclared   only the sites that declare no writer
//   node test/maintenance/writer-caller-matrix.mjs --json      machine-readable
//
// Ote, 2026-09-16: *"Perform the complete caller enumeration… Every caller must be classified as: legitimate live writer
// → supplies writer + required act/reach; legitimate disabled feature → explicitly ruled/contracted; test/check →
// declares the writer/act/reach it claims to exercise. There must be no accidental fourth category: writer omitted →
// silently accepted."*
//
// ⛔⛔ WHY A SCRIPT AND NOT A LIST IN A DOCUMENT. A hand-written enumeration is correct on the day it is written and
// silently wrong afterwards — which is the `allowlist-drops-what-it-was-not-told` family, recorded eighteen times here,
// and is exactly how the M2 canary check leaked undeclared rows for eleven days while a document said the callers were
// enumerated. This re-derives the matrix from source on every run, so a NEW call site appears by itself.
//
// ── WHAT IT SCANS ──────────────────────────────────────────────────────────────────────────────────────────────────
// Every construction that can reach a write path, plus the raw-SQL escape hatch that bypasses all of them:
//   createSequelizeMemoryStore · createMemoryV2Service · buildMemoryV2 · buildMemoryPipeline · buildRetention ·
//   buildMemoryToolService · INSERT INTO … txn_memories
// For each it reads the BALANCED argument text and reports whether `writer`, `act` and `reach` are declared there.
//
// ⚠️ WHAT IT CANNOT DECIDE, STATED PLAINLY: whether a given site ever WRITES. A read-only construction (list/forget) has
// no need of a writer, and under the Phase-3 rule it would still be refused only if it tried to write. So an
// "undeclared" row here is a QUESTION — "does this site write?" — ⛔ not a verdict. The human column is the answer.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('../../', import.meta.url)))
const argv = process.argv.slice(2)
const has = (f) => argv.includes(`--${f}`)

const ROOTS = ['Backend/app', 'Backend/lib', 'test/checks', 'test/maintenance', 'test/pipeline', 'test/lib', 'test/unit', 'test/repro']
const CONSTRUCTORS = [
  'createSequelizeMemoryStore', 'createMemoryV2Service', 'buildMemoryV2',
  'buildMemoryPipeline', 'buildRetention', 'buildMemoryToolService',
]

function walk(dir, out = []) {
  let entries = []
  try { entries = readdirSync(dir) } catch { return out }
  for (const e of entries) {
    if (e === 'node_modules' || e.startsWith('.')) continue
    const p = join(dir, e)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(js|mjs)$/.test(e)) out.push(p)
  }
  return out
}

// ⚠️ NAMED ONCE, HERE. These were written inline and a shell-side edit turned every `\b` into a literal BACKSPACE
// character — the regexes still compiled, still ran, and silently matched NOTHING, so the matrix reported four correctly
// wired production sites as undeclared. A pattern that cannot match is indistinguishable from a caller that does not
// declare, which is the whole `source-scan-anchor-can-go-vacuous` family. The anchor test below is the guard.
// ⚠️⚠️ A PROPERTY CAN BE DECLARED THREE WAYS, and two of them have already fooled this scan:
//   `writer: WRITER.lesson`   explicit
//   `{ userId, writer, act }` ES6 SHORTHAND — `retention-host.js` threads its axes exactly like this, and a `writer:`
//                             regex called it undeclared, which would have put the whole retention path on the
//                             "breaks under Phase 3" list when it is correctly wired
//   `{ ...axes }`             SPREAD — handled separately as the `?` state, because the name is not visible here at all
// ⛔ `(?<![\w.])` keeps `sourceWriter` and `o.writer` out; the trailing class is what makes shorthand visible.
const RX = {
  writer: /(?<![\w.])writer\s*(?::|,|\}|$)/,
  act: /(?<![\w.])act\s*(?::|,|\}|$)/,
  reach: /(?<![\w.])reach\s*(?::|,|\}|$)/,
  spread: /\.\.\./,
}
// ⛔ ANCHOR: prove the patterns match what they are for, before trusting a single count. A scan that matches nothing
// and a codebase that declares nothing produce the identical report — `source-scan-anchor-can-go-vacuous`.
const MUST = [
  ['writer', 'writer: WRITER.lesson'], ['writer', '{ userId, writer, act, reach }'], ['writer', 'sourceMessageId, self, author, scope, occasion, writer, act, reach }'],
  ['act', 'act: { kind }'], ['act', '{ writer, act, reach }'], ['reach', 'reach: { kind }'], ['reach', '{ act, reach }'], ['spread', '{ ...axes }'],
]
for (const [k, sample] of MUST) {
  if (!RX[k].test(sample)) { console.error(`⛔ the ${k} pattern misses a real declaration (${sample}) — the matrix would under-report wiring`); process.exit(2) }
}
const MUST_NOT = [['writer', 'userId: x'], ['writer', 'sourceWriter: x'], ['writer', 'o.writer'], ['act', 'contact: x'], ['reach', 'outreach: x'], ['act', 'redactId, x']]
for (const [k, sample] of MUST_NOT) {
  if (RX[k].test(sample)) { console.error(`⛔ the ${k} pattern over-matches (${sample}) — counts would be inflated`); process.exit(2) }
}

/** The balanced argument text of a call starting at `open` (the index of its `(`). Caps at 4 KB. */
function argsAt(src, open) {
  let depth = 0
  for (let i = open; i < Math.min(src.length, open + 4096); i++) {
    const c = src[i]
    if (c === '(') depth++
    else if (c === ')') { depth--; if (depth === 0) return src.slice(open + 1, i) }
  }
  return src.slice(open + 1, open + 4096)
}

const files = ROOTS.flatMap((r) => walk(join(ROOT, r)))
const rows = []
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const lineOf = (idx) => src.slice(0, idx).split('\n').length
  // ⛔ skip the definitions themselves and comment lines — a `function buildRetention(` is not a caller
  for (const fn of CONSTRUCTORS) {
    const re = new RegExp(`\\b${fn}\\s*\\(`, 'g')
    for (const m of src.matchAll(re)) {
      const lineStart = src.lastIndexOf('\n', m.index) + 1
      const lineText = src.slice(lineStart, src.indexOf('\n', m.index))
      if (/^\s*(\/\/|\*|\/\*)/.test(lineText)) continue
      if (/\b(export\s+)?(async\s+)?function\s+$/.test(src.slice(Math.max(0, m.index - 30), m.index))) continue
      const args = argsAt(src, m.index + m[0].length - 1)
      // ⚠️ A SPREAD IS NOT AN ABSENCE. `buildMemoryPipeline(fastify, { userId, ...axes })` declares its writer inside
      // `axes`, and a regex for `writer:` in the argument text reports it as undeclared — a FALSE NEGATIVE that would
      // have put two correctly-wired sites on the "breaks under Phase 3" list. Three states, not two.
      rows.push({
        file: rel, line: lineOf(m.index), site: fn,
        writer: RX.writer.test(args), indirect: !RX.writer.test(args) && RX.spread.test(args),
        act: RX.act.test(args), reach: RX.reach.test(args), spread: RX.spread.test(args),
      })
    }
  }
  // the raw-SQL escape hatch — bypasses every constructor above, and every gate in the store
  // ⛔ Phase 3 CANNOT catch these: they never reach the store, so a mandatory-writer rule in the store is silent here.
  // The lint is the only guard on this category, which is why it is reported separately.
  for (const m of src.matchAll(/INSERT\s+INTO[^;]{0,200}?txn_memories/gi)) {
    const ls = src.lastIndexOf('\n', m.index) + 1
    if (/^\s*(\/\/|\*|\/\*)/.test(src.slice(ls, src.indexOf('\n', m.index)))) continue   // a comment naming it is not a caller
    const seg = src.slice(m.index, m.index + 600)
    rows.push({
      file: rel, line: lineOf(m.index), site: 'RAW INSERT txn_memories',
      writer: /\bwriter\b/.test(seg), act: /\bact_kind\b/.test(seg), reach: /\breach_kind\b/.test(seg), spread: false,
    })
  }
}

const area = (f) => (f.startsWith('Backend/') ? 'production' : f.startsWith('test/checks') ? 'check'
  : f.startsWith('test/maintenance') ? 'maintenance' : f.startsWith('test/unit') ? 'unit' : 'pipeline')
for (const r of rows) r.area = area(r.file)
rows.sort((a, b) => a.area.localeCompare(b.area) || a.file.localeCompare(b.file) || a.line - b.line)

if (has('json')) { console.log(JSON.stringify(rows, null, 1)); process.exit(0) }

const shown = has('undeclared') ? rows.filter((r) => !r.writer && !r.indirect) : rows
console.log(`\n══ WRITER CALLER MATRIX · ${rows.length} construction sites across ${new Set(rows.map((r) => r.file)).size} files ══`)
console.log('  W = declares writer:   ? = declares it through a SPREAD (read the site)   · = declares none')
console.log(`⛔ "·" is a QUESTION (does this site write?), ⛔ not a verdict. A read-only construction needs no writer.\n`)
let lastArea = null
for (const r of shown) {
  if (r.area !== lastArea) { console.log(`\n── ${r.area.toUpperCase()} ──`); lastArea = r.area }
  const flags = `${r.writer ? 'W' : r.indirect ? '?' : '·'}${r.act ? 'A' : '·'}${r.reach ? 'R' : '·'}`
  console.log(`  ${flags.padEnd(6)} ${`${r.file}:${r.line}`.padEnd(52)} ${r.site}`)
}
const by = (f) => rows.filter(f).length
console.log(`\n── TALLY ──`)
for (const a of ['production', 'check', 'maintenance', 'pipeline', 'unit']) {
  const n = by((r) => r.area === a); if (!n) continue
  console.log(`  ${a.padEnd(12)} ${String(n).padStart(3)} sites · ${String(by((r) => r.area === a && r.writer)).padStart(3)} declare · ${String(by((r) => r.area === a && r.indirect)).padStart(3)} spread · ${String(by((r) => r.area === a && !r.writer && !r.indirect)).padStart(3)} none`)
}
console.log(`  ${'RAW SQL'.padEnd(12)} ${String(by((r) => r.site.startsWith('RAW'))).padStart(3)} sites — these bypass every store gate`)
console.log(`\n  TOTAL ${rows.length} · declaring ${by((r) => r.writer)} · via spread ${by((r) => r.indirect)} · declaring none ${by((r) => !r.writer && !r.indirect)}`)
