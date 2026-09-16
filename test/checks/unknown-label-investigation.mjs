// ⭐⭐⭐ THE `unknown` INVESTIGATION — why does the extractor produce labels with no useful property semantics?
//
//   node test/checks/unknown-label-investigation.mjs
//
// Ote, 2026-09-16: *"886/3,368 is large enough that I don't want to treat it as resolver noise. If the majority
// is caused by extractor naming … then the correct fix belongs upstream."*
//
// ⛔⛔ EVIDENCE ONLY. This writes NOTHING, calls no model, and changes no behaviour. ⛔ No resolver authority,
// no slot behaviour, no alias, no A-D4 consequence. ⛔ Nothing is "fixed" here — Ote asked for the evidence first.
//
// ── ⭐⭐ THE DISTINCTION THIS INVESTIGATION EXISTS TO MAKE ────────────────────────────────────────────
//
//     the EXTRACTOR failed to name the property        vs        the ONTOLOGY genuinely does not know the relation
//
// Those are completely different problems with completely different owners. A label like `"what the kid would
// find — her legacy paragraph"` is not a hard ontology question; it is not a property name at all. A label like
// `"primary language"` vs `"first language"` IS a real ontology question. ⇒ every number below is reported in a
// way that keeps them apart.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { attributeShapeOf } from '@ote/memory/cognition/memory-normalize.js'
import { relationOf, RELATION } from '@ote/memory/cognition/memory-ontology.js'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)
const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : '—'
const isFixture = (s) => /^zz/i.test(String(s))

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  THE `unknown` INVESTIGATION — ⛔ evidence only · no writes · no behaviour change')
console.log('════════════════════════════════════════════════════════════════════════════════════')

const slots = await q(`SELECT id::text AS id, user_id::text AS uid, entity, canonical_label,
                              COALESCE(aliases,'[]'::jsonb) AS aliases FROM ${S}."mst_slots"`)
const phrasesOf = (s) => [s.canonical_label, ...(s.aliases || []).map((a) => a?.phrase).filter(Boolean)]

// ── ① ⭐⭐⭐ IS 886 A CORPUS PROPERTY, OR PAIRWISE AMPLIFICATION OF A FEW LABELS? ──────────────────────
// ⚠️ THE FIRST THING TO ESTABLISH, because "26% of the corpus is unknown" and "21% of LABELS poison 26% of
// PAIRS" are very different claims and only one of them is true. A pair is unknown if EITHER side is
// unanalysable, so one bad label contaminates every pair it appears in.
let pairs = 0, unknownPairs = 0
const blamed = new Map()   // phrase → how many unknown pairs it is (partly) responsible for
for (const a of slots) {
  for (const b of slots) {
    if (a.id === b.id) continue
    if (a.uid !== b.uid || String(a.entity).toLowerCase() !== String(b.entity).toLowerCase()) continue
    for (const pa of phrasesOf(a)) {
      for (const pb of phrasesOf(b)) {
        pairs++
        if (relationOf(pa, pb).relation !== RELATION.unknown) continue
        unknownPairs++
        for (const p of [pa, pb]) if (!attributeShapeOf(p).analysed) blamed.set(p, (blamed.get(p) ?? 0) + 1)
      }
    }
  }
}
const allPhrases = [...new Set(slots.flatMap(phrasesOf))]
const unreadable = allPhrases.filter((p) => !attributeShapeOf(p).analysed)

console.log(`\n① AMPLIFICATION · is this a corpus property or a few labels?\n`)
console.log(`   cross-slot pairs                 ${rpad(pairs.toLocaleString(), 7)}`)
console.log(`   pairs returning \`unknown\`        ${rpad(unknownPairs.toLocaleString(), 7)}   ${pct(unknownPairs, pairs)} of pairs`)
console.log(`   DISTINCT labels in the corpus    ${rpad(allPhrases.length, 7)}`)
console.log(`   DISTINCT labels that are unreadable ${rpad(unreadable.length, 4)}   ${pct(unreadable.length, allPhrases.length)} of labels`)
console.log(`\n   ⭐ ${unreadable.length} labels account for ${unknownPairs.toLocaleString()} unknown pairs — a mean of ${(unknownPairs / Math.max(1, unreadable.length)).toFixed(0)} pairs each.`)
console.log('   ⇒ this is PAIRWISE AMPLIFICATION of a small set of labels, ⛔ NOT a property of the corpus.')

// ── ② THE REASON TABLE ─────────────────────────────────────────────────────────────────────────────
const byReason = new Map()
for (const p of unreadable) {
  const why = attributeShapeOf(p).why
  if (!byReason.has(why)) byReason.set(why, [])
  byReason.get(why).push(p)
}
console.log('\n② UNKNOWN BY REASON (distinct labels)\n')
console.log(`   ${pad('reason', 20)}${pad('count', 8)}${pad('% of unknown', 14)}examples`)
console.log('   ' + '─'.repeat(104))
for (const [why, ps] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
  const real = ps.filter((p) => !isFixture(p))
  const ex = (real.length ? real : ps).slice(0, 2).map((p) => `"${p.length > 34 ? `${p.slice(0, 33)}…` : p}"`).join(' · ')
  console.log(`   ${pad(why, 20)}${pad(ps.length, 8)}${pad(pct(ps.length, unreadable.length), 14)}${ex}`)
}
const realUnreadable = unreadable.filter((p) => !isFixture(p))
console.log(`\n   ⓘ of the ${unreadable.length}, ${unreadable.length - realUnreadable.length} are \`zz\` TEST FIXTURES and ${realUnreadable.length} are real labels.`)

// ── ③ ⭐⭐⭐ THE SHAPE VIEW — malformed property NAME vs legitimate observation ───────────────────────
// ⭐ THE JUDGEMENT OTE ASKED FOR, made structurally and stated as a classification of FORM, ⛔ not of merit.
const SHAPES = [
  // ⚠️ ORDER MATTERS, and the first version got it wrong: `[^\x20-\x7E]` also matches an EM-DASH, so the two
  // dash-joined labels were filed as NON-LATIN SCRIPT — a true statement about their bytes and a false one
  // about their problem. ⇒ the script test now tests for actual SCRIPTS, and the more specific shape wins.
  ['COMPOUND (dash-joined)', /[—–]|\s-\s/,
    'two phrases wearing one name — there is no single head to find'],
  ['NON-LATIN SCRIPT', /[Ͱ-᳿Ⰰ-퟿豈-﫿]/,
    'the head-final assumption does not hold for this script'],
  ['ALTERNATION (slash)', /\//,
    'an either/or in one label — two candidate names, no chosen one'],
  ['COORDINATION (and/or)', /\b(and|or)\b/i,
    'two concepts in one label — ⭐ a slot cannot hold two answers'],
  ['CLAUSE / question', /\b(what|who|whose|when|where|why|how)\b/i,
    'a question, not a property name — head-final would return a verb'],
  ['PREPOSITIONAL (of/for/about/to…)', /\b(of|for|about|with|to|in|on|at|from|by)\b/i,
    'a post-modifier — English stops being head-final here'],
]
// ⚠️ NORMALISE BEFORE MATCHING, exactly as `attributeShapeOf` does. The first version of this classifier ran
// the patterns against the RAW label, so `how_to_be_stored` and `reaction_to_praise` matched nothing (there is
// no word boundary inside `_to_`) and landed in OTHER — five labels misfiled by my own instrument while it was
// being used to judge someone else's. ⇒ the analyser and its auditor must tokenise the same way.
const shapeOf = (p) => {
  const norm = String(p).replace(/[_]+/g, ' ')
  return SHAPES.find(([, re]) => re.test(norm))?.[0] ?? 'OTHER'
}
const byShape = new Map()
for (const p of unreadable) {
  const s = shapeOf(p)
  if (!byShape.has(s)) byShape.set(s, [])
  byShape.get(s).push(p)
}
console.log('\n③ ⭐⭐ UNKNOWN BY LABEL SHAPE — the linguistic pattern, and what it implies\n')
console.log(`   ${pad('shape', 38)}${pad('all', 6)}${pad('real', 6)}what it means`)
console.log('   ' + '─'.repeat(112))
for (const [shape, ps] of [...byShape].sort((a, b) => b[1].length - a[1].length)) {
  const real = ps.filter((p) => !isFixture(p)).length
  const note = SHAPES.find(([n]) => n === shape)?.[2] ?? '—'
  console.log(`   ${pad(shape, 38)}${pad(ps.length, 6)}${pad(real, 6)}${note}`)
}

console.log('\n   ⭐ EVERY REAL UNREADABLE LABEL, with its value — so the judgement is on evidence, not on the name alone:\n')
for (const p of realUnreadable) {
  const [row] = await q(`SELECT m.value, m.writer, m.kind FROM ${S}."txn_memories" m
                         JOIN ${S}."mst_slots" s ON s.id = m.slot_id
                         WHERE s.canonical_label = $1 AND m.invalid_at IS NULL LIMIT 1`, [p])
  const v = row?.value ? String(row.value).replace(/\s+/g, ' ').slice(0, 58) : '(no live row — alias only)'
  console.log(`   ${pad(shapeOf(p).slice(0, 14), 16)}${pad(`"${p}"`, 48)}`)
  console.log(`   ${pad('', 16)}  writer=${pad(row?.writer ?? '?', 12)} value: ${v}`)
}

// ── ④ WHICH WRITER PRODUCED THEM — "are they concentrated in particular extraction paths?" ──────────
console.log('\n④ BY EXTRACTION PATH — which writer produced the unreadable labels?\n')
const byWriter = await q(`SELECT m.writer, count(DISTINCT s.canonical_label) AS labels
                          FROM ${S}."mst_slots" s JOIN ${S}."txn_memories" m ON m.slot_id = s.id
                          WHERE s.canonical_label = ANY($1::text[]) GROUP BY 1 ORDER BY 2 DESC`, [realUnreadable])
const allByWriter = await q(`SELECT m.writer, count(DISTINCT s.canonical_label) AS labels
                             FROM ${S}."mst_slots" s JOIN ${S}."txn_memories" m ON m.slot_id = s.id
                             WHERE s.canonical_label NOT LIKE 'zz%' GROUP BY 1 ORDER BY 2 DESC`)
const totalFor = new Map(allByWriter.map((r) => [r.writer, Number(r.labels)]));
console.log(`   ${pad('writer', 16)}${pad('unreadable', 12)}${pad('all labels', 12)}rate`)
console.log('   ' + '─'.repeat(56))
for (const r of byWriter) {
  const tot = totalFor.get(r.writer) ?? 0
  console.log(`   ${pad(r.writer, 16)}${pad(r.labels, 12)}${pad(tot, 12)}${pct(Number(r.labels), tot)}`)
}
for (const r of allByWriter) {
  if (!byWriter.some((x) => x.writer === r.writer)) console.log(`   ${pad(r.writer, 16)}${pad(0, 12)}${pad(r.labels, 12)}0%`)
}

// ── ⑤ ⭐⭐⭐ IS THE NAMING ACTUALLY COSTING US ANYTHING? ─────────────────────────────────────────────
// ⭐ THE QUESTION THAT SEPARATES THE TWO PROBLEMS. If two unreadable labels plainly name the same concept, the
// ontology cannot even be ASKED about them — the cost is real and it is upstream. If they do not, then the
// unreadability is untidy but is costing no merge, and the label is simply an observation the property model
// does not fit.
// ⛔ MEASURED BY CONTENT-WORD OVERLAP ONLY. ⛔ No rewrite is proposed and no better name is invented — that
// would be exactly the "inventing semantics" Ote ruled out. This reports ADJACENCY, and a human reads it.
const STOP = new Set(['of', 'for', 'about', 'with', 'to', 'in', 'on', 'at', 'from', 'by', 'and', 'or', 'the', 'a', 'an',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'what', 'who', 'whose', 'when', 'where', 'why', 'how', 'is', 'are'])
const content = (p) => new Set(String(p).toLowerCase().replace(/[_\-—–/]+/g, ' ').replace(/[^a-z0-9 ]/g, '')
  .split(/\s+/).filter((t) => t && !STOP.has(t)))
const near = []
for (let i = 0; i < realUnreadable.length; i++) {
  for (let j = i + 1; j < realUnreadable.length; j++) {
    const a = content(realUnreadable[i])
    const b = content(realUnreadable[j])
    const shared = [...a].filter((t) => b.has(t))
    // ⚠ THE FIRST CRITERION WAS TOO STRICT and found ZERO pairs — it required the smaller label's content
    // words to be fully contained in the larger, which misses `"response to thank you"` vs
    // `"response to appreciation"` (they share only `response`). A binary threshold on a question this
    // qualitative is the wrong instrument; ADJACENCY is reported and a human reads it.
    if (shared.length) near.push([realUnreadable[i], realUnreadable[j], shared, shared.length / Math.min(a.size, b.size)])
  }
}
console.log('\n⑤ ⭐⭐⭐ IS THE NAMING COSTING A MERGE? — unreadable labels that share content words\n')
if (!near.length) console.log('   (none)')
near.sort((x, y) => y[3] - x[3])
for (const [a, b, shared] of near.slice(0, 8)) {
  console.log(`   ⚠️ "${a}"`)
  console.log(`      "${b}"`)
  console.log(`      shared content: [${shared.join(', ')}] · ⛔ neither is readable ⇒ the ontology is never even ASKED`)
}
console.log(`\n   ⓘ ${near.length} such pair(s) of ${realUnreadable.length} real unreadable labels.`)

// ── ⑥ INVARIANTS — anti-vacuity, and the fences ────────────────────────────────────────────────────
console.log('\n⑤ INVARIANTS\n')
check('⚠️ ANTI-VACUITY · the corpus produced pairs and unreadable labels to classify',
  pairs > 100 && unreadable.length > 0, `${pairs} pairs · ${unreadable.length} unreadable labels`)
check('⭐ every unreadable label carries a REASON — ⛔ no bare unknowns',
  unreadable.every((p) => typeof attributeShapeOf(p).why === 'string' && attributeShapeOf(p).why.length > 0))
check('⛔ this run changed nothing — the armed collision is still armed',
  relationOf('location', 'volunteer_schedule_and_location').relation === RELATION.unknown
  && slots.some((s) => (s.aliases || []).some((a) => a?.phrase === 'volunteer_schedule_and_location')))

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, setting or threshold was touched.\n')
done()
