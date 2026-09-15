// ⭐⭐⭐ THE THREE-ARM REPORT — split Generation 4's measured effect into the half that caused it.
//
//   node test/pipeline/reflection-gen-arms-report.mjs
//
// Reads test/results/reflection-gen-arms.json (this run) and reflection-gen4-ab.json (the prior 2-arm run, so Gen 4 —
// which moved BOTH halves — sits in the same table as its two decompositions). Writes
// Reference/docs/MEASUREMENT_SOTERA_REFLECTION_ARMS.md.
// ⛔ It judges nothing. The pre-registered reading of arm C is printed as given, before the numbers.
import { readFileSync, writeFileSync } from 'node:fs'

const R = JSON.parse(readFileSync(new URL('../results/reflection-gen-arms.json', import.meta.url), 'utf8'))
const PRIOR = JSON.parse(readFileSync(new URL('../results/reflection-gen4-ab.json', import.meta.url), 'utf8'))
const OUT = new URL('../../../../Reference/docs/MEASUREMENT_SOTERA_REFLECTION_ARMS.md', import.meta.url)
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')

const blank = () => ({ passes: 0, ok: 0, retains: 0, citing: 0, quoting: 0, declines: 0, rows: 0, refs: 0, refsEst: 0, refsFailed: 0,
  resolved: 0, spanGiven: 0, spanOk: 0, estRows: 0, kinds: {}, chars: [], calls: [], secs: [], speakers: {} })
const tally = (acc, h, ok, ms) => {
  acc.passes++; if (ok) acc.ok++
  const ret = h.calls.filter((c) => c.tool === 'retain')
  acc.retains += ret.length
  acc.citing += ret.filter((c) => (c.arg_keys ?? []).includes('from')).length
  acc.quoting += ret.filter((c) => (c.arg_keys ?? []).includes('quote')).length
  acc.declines += h.calls.filter((c) => c.tool === 'decline_to_remember').length
  acc.rows += (h.rows ?? []).length
  const rf = (h.rows ?? []).flatMap((r) => r.refs ?? [])
  acc.refs += rf.length; acc.refsEst += rf.filter((x) => x.established).length; acc.refsFailed += rf.filter((x) => !x.established).length
  acc.resolved += rf.filter((x) => x.target && x.target !== '').length
  acc.spanGiven += rf.filter((x) => x.span).length; acc.spanOk += rf.filter((x) => x.span && x.established).length
  acc.estRows += (h.rows ?? []).filter((r) => (r.refs ?? []).some((x) => x.established)).length
  for (const r of h.rows ?? []) { acc.kinds[r.kind ?? '∅'] = (acc.kinds[r.kind ?? '∅'] ?? 0) + 1; acc.chars.push(String(r.content ?? '').length) }
  for (const x of rf.filter((x) => x.established)) acc.speakers[x.role ?? '?'] = (acc.speakers[x.role ?? '?'] ?? 0) + 1
  acc.calls.push(h.calls.length); acc.secs.push(Math.round(ms / 1000))
}

const arms = { 3: blank(), N: blank(), C: blank() }
for (const r of R.runs ?? []) if (arms[r.arm]) tally(arms[r.arm], r.harvest, r.result?.ok, r.ms)
// the prior run's Gen-4 arm (B), so "both halves" sits beside its parts
const G4 = blank()
for (const p of PRIOR.pairs ?? []) if (p.B?.harvest) tally(G4, p.B.harvest, p.B.result?.ok, p.B.ms)

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const f = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a')
const per = (a, n) => (a.passes ? f(n / a.passes) : 'n/a')
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : 'n/a')
const col = (a) => [per(a, a.retains), per(a, a.rows), per(a, a.declines), f(mean(a.chars)), JSON.stringify(a.kinds), f(mean(a.calls)), f(mean(a.secs))]

const citationOffered = (k) => k === 'C' || k === 'G4'
const cRate = (a) => (a.retains ? `${a.citing}/${a.retains} = ${pct(a.citing, a.retains)}` : 'no retains')
const zeroInC = arms.C.retains > 0 && arms.C.citing === 0

const doc = `# MEASUREMENT · Reflection — the three-arm decomposition of Generation 4 · ${stamp} UTC

Ratified by Ote 2026-09-15 (\`GATE_SOTERA_PROVENANCE_NEXT_DECISIONS.md\` §4②). Generation 4 changed two things at once, so
its measured effect could only be seen as a sum. These arms move one half each, over the **same frozen corpus** (the source
ids read from the first experiment's own record).

| arm | instrument |
|---|---|
| **3** | generation 3 — plain transcript, retain unchanged (the live control) |
| **N** | generation 5 — **numbered** transcript, retain unchanged |
| **C** | generation 6 — plain transcript, retain **with \`from\`/\`quote\`** |
| *4* | *generation 4 — both halves, from the prior run, for reference* |

## ⭐ The pre-registered reading of arm C, fixed before the run

> *"If C again produces zero citations, treat that as evidence of a salience/mechanism problem rather than an invitation to
> keep improving the citation field."* — Ote, 2026-09-15

**Arm C citation rate: ${cRate(arms.C)}** ⇒ ${zeroInC ? '**ZERO. The pre-registered reading applies: this is a salience/mechanism finding.**' : arms.C.citing > 0 ? '**non-zero — the affordance CAN reach her without the numbering.**' : 'no retains were made in arm C, so the rate is undefined — ⚠️ not the same as zero.'}

## The decomposition

| metric | arm 3 (control) | arm N (numbered) | arm C (affordance) | gen 4 (both) |
|---|---|---|---|---|
| passes · completed | ${arms[3].passes} · ${arms[3].ok} | ${arms.N.passes} · ${arms.N.ok} | ${arms.C.passes} · ${arms.C.ok} | ${G4.passes} · ${G4.ok} |
| **retains per pass** | ${col(arms[3])[0]} | ${col(arms.N)[0]} | ${col(arms.C)[0]} | ${col(G4)[0]} |
| rows written per pass | ${col(arms[3])[1]} | ${col(arms.N)[1]} | ${col(arms.C)[1]} | ${col(G4)[1]} |
| declines per pass | ${col(arms[3])[2]} | ${col(arms.N)[2]} | ${col(arms.C)[2]} | ${col(G4)[2]} |
| **mean content chars** | ${col(arms[3])[3]} | ${col(arms.N)[3]} | ${col(arms.C)[3]} | ${col(G4)[3]} |
| kinds | ${col(arms[3])[4]} | ${col(arms.N)[4]} | ${col(arms.C)[4]} | ${col(G4)[4]} |
| mean tool calls | ${col(arms[3])[5]} | ${col(arms.N)[5]} | ${col(arms.C)[5]} | ${col(G4)[5]} |
| mean seconds | ${col(arms[3])[6]} | ${col(arms.N)[6]} | ${col(arms.C)[6]} | ${col(G4)[6]} |

## The citation instrument (only arms C and 4 offer it)

| metric | arm C | gen 4 |
|---|---|---|
| citation rate — retains carrying \`from\` | ${cRate(arms.C)} | ${cRate(G4)} |
| quote rate — retains carrying \`quote\` | ${arms.C.retains ? pct(arms.C.quoting, arms.C.retains) : 'n/a'} | ${G4.retains ? pct(G4.quoting, G4.retains) : 'n/a'} |
| references written | ${arms.C.refs} (established ${arms.C.refsEst} · failed ${arms.C.refsFailed}) | ${G4.refs} (established ${G4.refsEst} · failed ${G4.refsFailed}) |
| resolution rate — ordinals that resolve | ${arms.C.refs ? pct(arms.C.resolved, arms.C.refs) : 'undefined — no citations'} | ${G4.refs ? pct(G4.resolved, G4.refs) : 'undefined — no citations'} |
| verification rate — quotes that verify | ${arms.C.spanGiven ? pct(arms.C.spanOk, arms.C.spanGiven) : 'undefined — no quotes'} | ${G4.spanGiven ? pct(G4.spanOk, G4.spanGiven) : 'undefined — no quotes'} |
| establishment rate — rows with ≥1 established ref | ${arms.C.rows ? pct(arms.C.estRows, arms.C.rows) : 'n/a'} | ${G4.rows ? pct(G4.estRows, G4.rows) : 'n/a'} |
| speaker of established refs | ${JSON.stringify(arms.C.speakers)} | ${JSON.stringify(G4.speakers)} |

## Per source (retains · rows · citing)

| source | arm 3 | arm N | arm C |
|---|---|---|---|
${[...new Set((R.runs ?? []).map((r) => r.source))].map((s) => {
  const cell = (a) => { const r = (R.runs ?? []).find((x) => x.source === s && x.arm === a); if (!r) return '—'
    const ret = r.harvest.calls.filter((c) => c.tool === 'retain'); return `${ret.length} · ${r.harvest.rows.length} · ${ret.filter((c) => (c.arg_keys ?? []).includes('from')).length}` }
  return `| ${s.slice(0, 8)} | ${cell('3')} | ${cell('N')} | ${cell('C')} |`
}).join('\n')}

⛔ Nothing here is a verdict. Production remains on Generation 3; the clones and every pass are preserved.
`
writeFileSync(OUT, doc)
console.log(`three-arm report → ${OUT.pathname}`)
console.log(`retains/pass  control ${per(arms[3], arms[3].retains)} · N ${per(arms.N, arms.N.retains)} · C ${per(arms.C, arms.C.retains)} · gen4 ${per(G4, G4.retains)}`)
console.log(`mean chars    control ${f(mean(arms[3].chars))} · N ${f(mean(arms.N.chars))} · C ${f(mean(arms.C.chars))} · gen4 ${f(mean(G4.chars))}`)
console.log(`arm C citations: ${cRate(arms.C)}${zeroInC ? '  ⇒ PRE-REGISTERED READING: salience/mechanism, ⛔ not a wording problem' : ''}`)
