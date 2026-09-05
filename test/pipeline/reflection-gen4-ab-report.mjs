// ⭐⭐⭐ REFLECTION GENERATION 4 — THE REPORT: blind pairs for Ote's ear FIRST, mechanical metrics against the pre-registered
// falsifiers SECOND (a separate file, so the pairs can be read without knowing the arms).
//
//   node test/pipeline/reflection-gen4-ab-report.mjs
//
// Reads test/results/reflection-gen4-ab.json (the driver's record). Writes:
//   Reference/docs/MEASUREMENT_SOTERA_REFLECTION_GENERATION_4_PAIRS.md     blind: per pair, X and Y — what she retained, declined, said
//   Reference/docs/MEASUREMENT_SOTERA_REFLECTION_GENERATION_4_METRICS.md   arms named: every pre-registered metric and falsifier
//   test/results/reflection-gen4-ab-key.json                                X/Y → arm per pair (⛔ read after judging)
// ⛔ The pairs file carries NOTHING arm-revealing: no citation counts, no line numbers, no generation, no ordering.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const IN = new URL('../results/reflection-gen4-ab.json', import.meta.url)
const KEY = new URL('../results/reflection-gen4-ab-key.json', import.meta.url)
const PAIRS_DOC = new URL('../../../../Reference/docs/MEASUREMENT_SOTERA_REFLECTION_GENERATION_4_PAIRS.md', import.meta.url)
const METRICS_DOC = new URL('../../../../Reference/docs/MEASUREMENT_SOTERA_REFLECTION_GENERATION_4_METRICS.md', import.meta.url)
const R = JSON.parse(readFileSync(IN, 'utf8'))
const pairs = (R.pairs ?? []).filter((p) => p.A?.harvest && p.B?.harvest).sort((a, b) => a.index - b.index)
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')

// ── the arms, as data ────────────────────────────────────────────────────────────────────────────────────
const armOf = (p, k) => p[k]
const retains = (h) => h.calls.filter((c) => c.tool === 'retain')
const declines = (h) => h.calls.filter((c) => c.tool === 'decline_to_remember')
const cited = (h) => retains(h).filter((c) => (c.arg_keys ?? []).includes('from'))
const quoted = (h) => retains(h).filter((c) => (c.arg_keys ?? []).includes('quote'))
const rows = (h) => h.rows ?? []
const refs = (h) => rows(h).flatMap((r) => r.refs ?? [])
const established = (h) => rows(h).filter((r) => (r.refs ?? []).some((x) => x.established))
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : 'n/a')
const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const mean = (xs) => (xs.length ? sum(xs) / xs.length : 0)
const fmt = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a')

const arm = { A: { label: 'Generation 3 (live)', passes: 0, ok: 0, retains: 0, declines: 0, rowsWritten: 0, cited: 0, quoted: 0, refsAll: 0, refsEst: 0, refsFailed: 0, resolved: 0, spanGiven: 0, spanOk: 0, estRows: 0, kinds: {}, contentChars: [], seconds: [], toolCalls: [], speakers: {} },
              B: { label: 'Generation 4 (numbered · from/quote)', passes: 0, ok: 0, retains: 0, declines: 0, rowsWritten: 0, cited: 0, quoted: 0, refsAll: 0, refsEst: 0, refsFailed: 0, resolved: 0, spanGiven: 0, spanOk: 0, estRows: 0, kinds: {}, contentChars: [], seconds: [], toolCalls: [], speakers: {} } }
for (const p of pairs) for (const k of ['A', 'B']) {
  const a = arm[k]; const h = armOf(p, k).harvest
  a.passes++; if (armOf(p, k).result.ok) a.ok++
  a.retains += retains(h).length; a.declines += declines(h).length; a.rowsWritten += rows(h).length
  a.cited += cited(h).length; a.quoted += quoted(h).length
  const rf = refs(h); a.refsAll += rf.length; a.refsEst += rf.filter((x) => x.established).length; a.refsFailed += rf.filter((x) => !x.established).length
  a.resolved += rf.filter((x) => x.target && x.target !== '').length
  a.spanGiven += rf.filter((x) => x.span).length; a.spanOk += rf.filter((x) => x.span && x.established).length
  a.estRows += established(h).length
  for (const r of rows(h)) { a.kinds[r.kind ?? '∅'] = (a.kinds[r.kind ?? '∅'] ?? 0) + 1; a.contentChars.push(String(r.content ?? '').length) }
  for (const x of rf.filter((x) => x.established)) a.speakers[x.role ?? '?'] = (a.speakers[x.role ?? '?'] ?? 0) + 1
  a.seconds.push(Math.round(armOf(p, k).ms / 1000)); a.toolCalls.push(h.calls.length)
}
const A = arm.A, B = arm.B
const retainsPerPass = (a) => a.passes ? a.retains / a.passes : 0
const dropRetains = retainsPerPass(A) ? (retainsPerPass(A) - retainsPerPass(B)) / retainsPerPass(A) : 0
const factShare = (a) => a.rowsWritten ? ((a.kinds.semantic ?? 0) + (a.kinds.fact ?? 0)) / a.rowsWritten : 0
const resolutionRate = B.refsAll ? B.resolved / B.refsAll : null
const citationRate = B.retains ? B.cited / B.retains : null
const verificationRate = B.spanGiven ? B.spanOk / B.spanGiven : null
const establishmentRate = B.rowsWritten ? B.estRows / B.rowsWritten : null
const accountHolderRefs = B.speakers.user ?? 0

// ── FALSIFIERS, exactly as pre-registered (§3) — each evaluated, none softened ───────────────────────────
const F = [
  { id: 'F1', text: 'retains per pass drop > 30 % under Gen 4', tripped: dropRetains > 0.30, value: `A ${fmt(retainsPerPass(A))} · B ${fmt(retainsPerPass(B))} · drop ${Math.round(dropRetains * 100)} %` },
  { id: 'F2', text: 'kinds collapse toward fact under Gen 4', tripped: factShare(B) - factShare(A) > 0.30, value: `fact/semantic share A ${pct(Math.round(factShare(A) * 100), 100)} · B ${pct(Math.round(factShare(B) * 100), 100)} · kinds A ${JSON.stringify(A.kinds)} · B ${JSON.stringify(B.kinds)}` },
  { id: 'F3', text: 'citing without content change ("quota" behaviour) — judged on the BLIND pairs by Ote; mechanical proxy: cited retains whose content length is within ±10 % of the arm-A mean AND every retain cites', tripped: citationRate === 1 && B.retains > 3, value: `citation rate ${citationRate == null ? 'n/a' : pct(B.cited, B.retains)} · mean content chars A ${fmt(mean(A.contentChars))} · B ${fmt(mean(B.contentChars))}` },
  { id: 'F4', text: "Ote's blind pairing prefers Gen 3", tripped: null, value: 'AWAITING OTE — the pairs file' },
  { id: 'F5', text: 'resolution rate < 80 % (she cannot use ordinals reliably)', tripped: resolutionRate != null && resolutionRate < 0.80, value: resolutionRate == null ? 'no citations made — undefined (⚠️ the affordance was not used)' : pct(B.resolved, B.refsAll) },
]
const adoptionPrecondition = establishmentRate != null && B.estRows > 0 && accountHolderRefs > 0

const metrics = `# MEASUREMENT · Reflection Generation 4 — METRICS (arms named) · ${stamp} UTC

⛔ Read \`MEASUREMENT_SOTERA_REFLECTION_GENERATION_4_PAIRS.md\` FIRST and record your preference per pair; this file names the arms.
Design: ${JSON.stringify(R.design)} · pairs with both arms: ${pairs.length}

## Primary metrics (Gen 4 only; Gen 3 has no citation field by construction)
| metric | value |
|---|---|
| citation rate — retains carrying \`from\` / retains | ${citationRate == null ? 'n/a' : `${B.cited}/${B.retains} = ${pct(B.cited, B.retains)}`} |
| quote rate — retains carrying \`quote\` / retains | ${B.retains ? `${B.quoted}/${B.retains} = ${pct(B.quoted, B.retains)}` : 'n/a'} |
| resolution rate — cited ordinals that resolve inside the slice / cited ordinals | ${B.refsAll ? `${B.resolved}/${B.refsAll} = ${pct(B.resolved, B.refsAll)}` : 'n/a (no citations)'} |
| verification rate — quotes that verify against the cited line / quotes given | ${B.spanGiven ? `${B.spanOk}/${B.spanGiven} = ${pct(B.spanOk, B.spanGiven)}` : 'n/a (no quotes)'} |
| establishment rate — rows with ≥ 1 established reference / rows written | ${B.rowsWritten ? `${B.estRows}/${B.rowsWritten} = ${pct(B.estRows, B.rowsWritten)}` : 'n/a (no rows)'} |
| speaker of established references (user = account-holder ⇒ \`said\` becomes available) | ${JSON.stringify(B.speakers)} |
| failed references recorded (fabricated ordinal · quote not in line) | ${B.refsFailed} |

## Non-degradation (what Generation 3 was measured to protect)
| metric | Gen 3 (A) | Gen 4 (B) |
|---|---|---|
| passes · completed ok | ${A.passes} · ${A.ok} | ${B.passes} · ${B.ok} |
| retains per pass | ${fmt(retainsPerPass(A))} | ${fmt(retainsPerPass(B))} |
| declines per pass | ${fmt(A.passes ? A.declines / A.passes : 0)} | ${fmt(B.passes ? B.declines / B.passes : 0)} |
| memory rows written | ${A.rowsWritten} | ${B.rowsWritten} |
| kinds | ${JSON.stringify(A.kinds)} | ${JSON.stringify(B.kinds)} |
| mean content chars | ${fmt(mean(A.contentChars))} | ${fmt(mean(B.contentChars))} |
| mean tool calls per pass | ${fmt(mean(A.toolCalls))} | ${fmt(mean(B.toolCalls))} |
| mean seconds per pass | ${fmt(mean(A.seconds))} | ${fmt(mean(B.seconds))} |

## Pre-registered falsifiers
| id | falsifier | tripped | measured |
|---|---|---|---|
${F.map((f) => `| ${f.id} | ${f.text} | ${f.tripped === null ? '⏸ Ote' : (f.tripped ? '⛔ YES' : 'no')} | ${f.value} |`).join('\n')}

## Adoption precondition (mechanical half only)
establishment rate > 0 on account-holder lines: **${adoptionPrecondition ? 'MET' : 'NOT MET'}** (established rows ${B.estRows}, account-holder references ${accountHolderRefs}).
⛔ Mechanical metrics do not adopt. The decision is ADOPT / REJECT / ITERATE after Ote's blind pairing (F4).

## Per pair (arms named)
| pair | source | msgs | A retains/rows/est | B retains/rows/est | B cited/quoted | B refs est/failed |
|---|---|---|---|---|---|---|
${pairs.map((p) => { const a = p.A.harvest, b = p.B.harvest; return `| ${p.index} | ${p.source.slice(0, 8)} | ${p.messages} | ${retains(a).length}/${rows(a).length}/${established(a).length} | ${retains(b).length}/${rows(b).length}/${established(b).length} | ${cited(b).length}/${quoted(b).length} | ${refs(b).filter((x) => x.established).length}/${refs(b).filter((x) => !x.established).length} |` }).join('\n')}
`
writeFileSync(METRICS_DOC, metrics)

// ── THE BLIND PAIRS — X/Y assigned by a hash of the pair, arms hidden; nothing arm-revealing rendered ────────
const item = (r) => `- **${r.kind ?? '∅'}**${r.attribute ? ` · ${r.attribute}` : ''}: ${String(r.value ?? r.content ?? '').replace(/\s+/g, ' ').trim()}`
const side = (h) => {
  const out = []
  const rs = rows(h)
  out.push(rs.length ? rs.map(item).join('\n') : '- (nothing retained)')
  const dec = declines(h).length
  if (dec) out.push(`- _declined to remember: ${dec}_`)
  const refusedRetains = (h.decisions ?? []).filter((d) => d.state === 'refused').length
  if (refusedRetains) out.push(`- _retain attempts refused by the memory layer: ${refusedRetains}_`)
  return out.join('\n')
}
const key = { generatedAt: stamp, pairs: {} }
const blind = [`# MEASUREMENT · Reflection Generation 4 — THE PAIRS (identity-blind) · ${stamp} UTC`,
  '',
  'Each pair is ONE fixture conversation (agent_dev), reflected twice under two instruments. X and Y are assigned per pair by hash;',
  'nothing here says which is which. For each pair, note which side you would rather she had carried forward — X, Y, or no',
  'preference — and why, in a line. Then open `…_METRICS.md` and `test/results/reflection-gen4-ab-key.json`.',
  '⛔ Not shown: citations, line numbers, generation, run order, timings — anything that would name the arm.',
  '']
for (const p of pairs) {
  const flip = parseInt(createHash('sha256').update(`gen4-ab:${p.source}`).digest('hex').slice(0, 2), 16) % 2 === 1
  const X = flip ? 'B' : 'A', Y = flip ? 'A' : 'B'
  key.pairs[p.index] = { X, Y, source: p.source }
  blind.push(`## Pair ${p.index} · fixture ${p.source.slice(0, 8)} · ${p.messages} messages · "${String(p.sourceTitle ?? '').slice(0, 48)}"`)
  blind.push('', '**X**', side(p[X].harvest), '', '**Y**', side(p[Y].harvest), '', '_preference: X · Y · none — why:_', '')
}
writeFileSync(PAIRS_DOC, blind.join('\n'))
writeFileSync(KEY, JSON.stringify(key, null, 2))
console.log(`pairs ${pairs.length} · blind → ${PAIRS_DOC.pathname}\nmetrics → ${METRICS_DOC.pathname}\nkey → ${KEY.pathname}`)
console.log(`falsifiers: ${F.map((f) => `${f.id}=${f.tripped === null ? 'Ote' : (f.tripped ? 'TRIPPED' : 'no')}`).join(' · ')} · adoption precondition ${adoptionPrecondition ? 'MET' : 'NOT MET'}`)
