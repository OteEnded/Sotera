// ⭐ THE BLIND HUMAN EVALUATION (F4) — an Ote-facing test built from the 20 recorded pairs, nothing generated, nothing rewritten.
//
//   node test/pipeline/reflection-gen4-blind-test.mjs
//
// Reads test/results/reflection-gen4-ab.json (the run record) and test/results/reflection-gen4-ab-key.json (X/Y per pair, made
// once by hash). Writes Reference/docs/BLIND_TEST_SOTERA_REFLECTION_GENERATION_4.md. ⛔ The document carries ONLY: pair number,
// X, Y, the retained memories verbatim (kind and slot label as she gave them), "Nothing retained" where a side wrote nothing.
// ⛔ Not written: generation, arm letter, run order, timestamps, citations/ordinals, fixture ids or titles, message counts,
// refusal/decline counts, timings — anything that could name the arm or the source. The mapping stays in the key file only.
import { readFileSync, writeFileSync } from 'node:fs'

const R = JSON.parse(readFileSync(new URL('../results/reflection-gen4-ab.json', import.meta.url), 'utf8'))
const KEY = JSON.parse(readFileSync(new URL('../results/reflection-gen4-ab-key.json', import.meta.url), 'utf8'))
const OUT = new URL('../../../../Reference/docs/BLIND_TEST_SOTERA_REFLECTION_GENERATION_4.md', import.meta.url)
const pairs = (R.pairs ?? []).filter((p) => p.A?.harvest && p.B?.harvest).sort((a, b) => a.index - b.index)

// the memory exactly as stored: kind · slot label (if she gave one) · content — no whitespace folding, no truncation
const item = (r) => {
  const label = r.attribute ? ` · ${String(r.attribute).trim()}` : ''
  const text = String(r.value ?? r.content ?? '').trim()
  return `- **${r.kind ?? 'memory'}**${label}: ${text}`
}
const side = (h) => ((h.rows ?? []).length ? h.rows.map(item).join('\n') : '- Nothing retained')

const doc = [
  '# Blind evaluation · Reflection Generation 4 — the 20 pairs',
  '',
  '**The question, for every pair:**',
  '',
  '> If these were the memories Sotera is proposing to carry forward from this conversation, which would you rather she keep: **X**, **Y**, or **neither**?',
  '',
  '**Instructions.** Each pair is one fixture conversation, reflected twice under two instruments. X and Y were assigned per pair',
  'by a hash, and nothing in this document says which is which. Judge only what is on the page — the memories as she wrote them.',
  'Answer X, Y or Neither for every pair; a short reason is optional but useful. "Neither" means you would rather she kept nothing',
  'from that conversation than either side. Where both sides say *Nothing retained*, Neither is a legitimate answer too.',
  '',
  '**Response template** (copy, fill in):',
  '',
  '```',
  ...pairs.map((p) => `${p.index}. X | Y | Neither — reason`),
  '```',
  '',
  '---',
  '',
]
for (const p of pairs) {
  const k = KEY.pairs[String(p.index)]
  if (!k) throw new Error(`no key entry for pair ${p.index}`)
  doc.push(`## Pair ${p.index}`, '', '**X**', '', side(p[k.X].harvest), '', '**Y**', '', side(p[k.Y].harvest), '', '---', '')
}
const text = doc.join('\n')
// ⛔ a tripwire, not a promise: fail loudly if anything arm-naming slipped into the PAIRS (the title names the experiment, not an arm)
const body = text.slice(text.indexOf('\n---\n'))
for (const bad of [/\bgen(eration)? ?[34]\b/i, /\barm [AB]\b/, /\[\d+\]/, /\bfrom:/, /\bquote\b/i, /[0-9a-f]{8}-[0-9a-f]{4}/, /\b20\d\d-\d\d-\d\d\b/, /zz_gen4/, /PROBE/, /fixture [0-9a-f]/]) {
  if (bad.test(body)) throw new Error(`blind test would reveal something: ${bad}`)
}
writeFileSync(OUT, text)
console.log(`blind test: ${pairs.length} pairs → ${OUT.pathname}`)
console.log(`mapping stays in test/results/reflection-gen4-ab-key.json (not written into the document)`)
