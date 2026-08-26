// ⭐⭐⭐ THE TERM AXIS, CORRECTED — every notable term, on the ACTUAL source text.
//
//   node pipeline/term-plural.mjs
//
// Ote, 2026-08-26: *"The actual Rome sentence being classified as literal while the sanitized version
// classified as figurative is important. Don't paper over that discrepancy. The producer has to classify
// the actual source text… That sentence may legitimately require multiple semantic annotations, and
// that's exactly what the three-axis model should expose rather than forcing one answer."*
//
// ── ⭐⭐ THE DIAGNOSIS THIS TESTS ──────────────────────────────────────────────────────────────────
// The first term probe asked for **"the most notable NOUN or NAME"** — singular. On the clean sentence
// *"I want to build Rome in one day."* the only candidate is *Rome*, and it answered **figurative**. On
// the real turn — *"yeah, i kinda want to build rome in one day so. but my body is degrading as i push"* —
// there are at least four candidates (*rome · one day · body · i*), and asking for ONE forced it to pick,
// and it answered **literal**.
//
// ⇒ ⭐ THE HYPOTHESIS: the discrepancy is **the singular question**, not the messy text. A sentence can
// carry several terms with different uses, and demanding one answer discards the rest — which is the
// same cardinality failure as the flat modality enum, one level down.
// ⛔ IF THAT IS WRONG the plural question will still return `rome: literal` on the real turn, and the
// finding becomes "the model cannot see this metaphor in situ", which is a different and worse problem.
// Both outcomes are reportable and neither is optimised for.

import { writeFileSync, readFileSync } from 'node:fs'
import { devPg, devSchema, ollamaHost } from '../harness.mjs'

const cfg = JSON.parse(readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))
const MODEL = String(cfg?.memory?.extractModel || 'ollama/qwen3.5:9b').replace(/^ollama\//, '')
const HOST = ollamaHost()

let retries = 0
const llm = async (prompt) => {
  let last = null
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(`${HOST}/api/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL, messages: [{ role: 'user', content: prompt }], stream: false, think: false,
          options: { temperature: 0, num_predict: 320, num_gpu: 0 },
        }),
        signal: AbortSignal.timeout(300_000),
      })
      if (!res.ok) throw new Error(`ollama ${res.status}`)
      return (await res.json())?.message?.content ?? ''
    } catch (e) { last = e; retries++; await new Promise((r) => setTimeout(r, 1500 * i)) }
  }
  throw last
}

// ⛔ PLURAL, and no example mentions Rome, a city, an uncle, an aunt, a mountain or a warzone.
const plural = (text) =>
  'List EVERY notable noun or name in this sentence, and say how each one is being used.\n\n'
  + `SENTENCE:\n${text}\n\n`
  + 'For each: literal (it means what it ordinarily means) · figurative (it stands in for something '
  + 'else) · coined (it is being introduced as a name right here).\n'
  + 'Include ALL of them. A sentence often mixes uses, and that is the normal case, not an edge case.\n'
  + 'Return ONLY JSON: {"terms":[{"term":"","use":"","why":""}]}\n\n'
  + 'Examples:\n'
  + '  "the cache is warm but my patience is a thin thread today"\n'
  + '      -> {"terms":[{"term":"cache","use":"literal","why":"an actual cache"},'
  + '{"term":"patience","use":"literal","why":"the ordinary sense"},'
  + '{"term":"thin thread","use":"figurative","why":"stands in for nearly exhausted"}]}\n'
  + '  "let us name the sprint Osprey and get the invoice out on Tuesday"\n'
  + '      -> {"terms":[{"term":"Osprey","use":"coined","why":"the name is assigned here"},'
  + '{"term":"sprint","use":"literal","why":"an actual sprint"},'
  + '{"term":"invoice","use":"literal","why":"an actual invoice"}]}\n'

const firstJson = (raw) => {
  const m = String(raw ?? '').match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

// ⭐ THE PAIRS THAT MATTER: the clean reconstruction and the ACTUAL message, side by side. Anything else
// would be measuring a different sentence and calling it the same one.
const pg = devPg(); await pg.connect()
const S = devSchema()
const [live] = (await pg.query(
  `select msg.content src from ${S}.txn_memories m
     join ${S}.txn_messages msg on msg.id = m.source_message_id
    where m.id::text like '7d383ce3%'`)).rows
const [uncle] = (await pg.query(
  `select msg.content src from ${S}.txn_memories m
     join ${S}.txn_messages msg on msg.id = m.source_message_id
    where m.id::text like '676e17b9%'`)).rows
await pg.end()

const CASES = [
  { id: 'CLEAN', text: 'I want to build Rome in one day.', note: 'the sanitized reconstruction — what the first probe was given' },
  { id: 'ACTUAL', text: String(live?.src ?? ''), note: '⭐ THE REAL MESSAGE behind `7d383ce3`' },
  { id: 'UNCLE', text: String(uncle?.src ?? ''), note: 'the real message behind `676e17b9`' },
]

const out = { at: new Date().toISOString(), model: MODEL, cases: [] }
console.log('\n══ THE TERM AXIS, ASKED IN THE PLURAL, ON THE REAL TEXT ═════════════')
console.log(`   ${MODEL} · temperature 0 · think off · num_gpu 0   ⛔ nothing persisted\n`)

for (const c of CASES) {
  if (!c.text) { console.log(`   ${c.id}: ⛔ no source text found — skipped\n`); continue }
  const parsed = firstJson(await llm(plural(c.text)))
  const terms = Array.isArray(parsed?.terms) ? parsed.terms : []
  out.cases.push({ id: c.id, text: c.text, terms })
  console.log(`   ⭐ ${c.id} — ${c.note}`)
  console.log(`      "${c.text.replace(/\s+/g, ' ').slice(0, 120)}"`)
  for (const t of terms) console.log(`        ${String(t.use ?? '?').padEnd(11)} ${String(t.term ?? '').padEnd(22)} ${String(t.why ?? '').slice(0, 62)}`)
  const nonLiteral = terms.filter((t) => t.use && t.use !== 'literal')
  console.log(`      ⇒ ${terms.length} term(s), ${nonLiteral.length} non-literal${nonLiteral.length ? `: ${nonLiteral.map((t) => `${t.term}(${t.use})`).join(', ')}` : ''}`)
  console.log('')
}

// ── ⭐⭐⭐ THE VERDICT ON THE DISCREPANCY ─────────────────────────────────────────────────────────
const clean = out.cases.find((c) => c.id === 'CLEAN')
const actual = out.cases.find((c) => c.id === 'ACTUAL')
const romeIn = (c) => (c?.terms ?? []).find((t) => /rome/i.test(String(t.term ?? '')))
const cRome = romeIn(clean); const aRome = romeIn(actual)
console.log('══ DID THE PLURAL QUESTION CLOSE THE GAP? ═══════════════════════════')
console.log(`   CLEAN  → rome: ${cRome ? cRome.use : '⛔ not listed'}`)
console.log(`   ACTUAL → rome: ${aRome ? aRome.use : '⛔ not listed'}`)
if (aRome && cRome && aRome.use === cRome.use) {
  console.log('   ✅ THE SINGULAR QUESTION WAS THE DEFECT — asked in the plural, the real text and the')
  console.log('      reconstruction now AGREE. ⇒ the term axis must be multi-valued; forcing one answer')
  console.log('      per sentence discarded the metaphor whenever a messier sentence had competition.')
} else if (aRome) {
  console.log('   ⛔ THE GAP SURVIVES. The plural question still reads the real text differently, so this')
  console.log('      is NOT a cardinality artifact — the model cannot see this metaphor in situ, which is')
  console.log('      a harder problem and must not be reported as solved.')
} else {
  console.log('   ⚠️ INCONCLUSIVE — `rome` was not listed at all on the real text. Nothing can be')
  console.log('      concluded about the metaphor from a run that did not consider the word.')
}
out.verdict = { clean: cRome?.use ?? null, actual: aRome?.use ?? null, retries }
console.log(`\n   ⚠️ llm retries: ${retries}`)

const file = new URL('../results/term-plural.json', import.meta.url)
writeFileSync(file, JSON.stringify(out, null, 2), 'utf8')
console.log(`  wrote ${file.pathname.replace(/^\//, '')}`)
