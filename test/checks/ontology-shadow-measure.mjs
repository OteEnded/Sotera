// ⭐⭐⭐ A1 · THE SHADOW MEASUREMENT — what the ontology actually says about the live corpus.
//
//   node test/checks/ontology-shadow-measure.mjs
//
// Ote, 2026-09-16: *"I want to see what the ontology actually says about the corpus before we decide what
// broader→new-slot behavior means."* ⇒ this is a REPORT first and a check second.
//
// ⛔⛔ READ-ONLY. It writes NOTHING — no row, no slot, no alias, no fixture, no ledger entry. It does not call a
// model. It runs the SHIPPED pure functions over the SHIPPED corpus and prints what they disagree about.
// ⇒ the armed `location` collision, the two real hypernym aliases and both fixtures are untouched by
// construction, not by cleanup.
//
// ⛔ NOTHING HERE GRANTS AUTHORITY. A1 is shadow-only and is structurally blocked on A-D4.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { attributeSimilarity } from '@ote/memory/cognition/memory-extract.js'
import { attributeShapeOf } from '@ote/memory/cognition/memory-normalize.js'
import { RELATION, relationOf, mayBind } from '@ote/memory/cognition/memory-ontology.js'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows

const LEX = 0.7 // the shipped lexical floor — quoted, ⛔ not changed
const pad = (s, n) => String(s).padEnd(n)
const bar = (n, max, w = 28) => '█'.repeat(Math.max(0, Math.round((n / Math.max(1, max)) * w)))

console.log('\n════════════════════════════════════════════════════════════════════════════')
console.log('  A1 · ONTOLOGY SHADOW MEASUREMENT — ⛔ read-only, no authority, no writes')
console.log('════════════════════════════════════════════════════════════════════════════')

// ── ① THE NAMED CASES — the ones Ote asked for by name ─────────────────────────────────────────────
console.log('\n① THE NAMED CASES — containment (shipped) vs ontology (shadow)\n')
console.log(`   ${pad('incoming', 34)}${pad('candidate slot', 34)}${pad('contain', 9)}${pad('binds?', 8)}ontology`)
console.log('   ' + '─'.repeat(100))
const NAMED = [
  // ⭐ THE RFC's OWN §5 WORKED EXAMPLE — the four-way tie at 1.0000
  ['programming_language', 'preferred programming language', 'RFC §5 tie'],
  ['programming_language', 'current programming language', 'RFC §5 tie'],
  ['programming_language', 'favorite programming language', 'RFC §5 tie'],
  ['programming_language', 'programming language', 'RFC §5 tie'],
  // ⭐ the shelter incident
  ['schedule', 'work schedule', 'the shelter merge'],
  // ⭐ the case the RFC's docstring calls an ABBREVIATION
  ['favorite language', 'favorite programming language', 'the "abbreviation" case'],
  // the two REAL hypernym aliases already in the store
  ['preference', 'communication preference', 'real hypernym #1 (08-24)'],
  ['volunteer_schedule_and_location', 'work schedule', 'the cascade (via alias)'],
  // the armed collision
  ['location', 'volunteer_schedule_and_location', 'ARMED collision'],
  ['location', 'location', 'ARMED collision (the right slot)'],
]
const named = []
for (const [inc, cand, note] of NAMED) {
  const sim = attributeSimilarity(cand, inc)
  const rel = relationOf(inc, cand)
  named.push({ inc, cand, sim, rel: rel.relation, note })
  const binds = sim >= LEX ? 'MERGE' : '—'
  const flag = sim >= LEX && !mayBind(rel.relation) ? '  ⛔ BOUND BUT NOT `same`' : ''
  console.log(`   ${pad(inc, 34)}${pad(cand, 34)}${pad(sim.toFixed(4), 9)}${pad(binds, 8)}${pad(rel.relation.toUpperCase(), 10)}${flag}`)
}
console.log(`\n   ⓘ note: ${NAMED.map(([, , n]) => n).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}`)

// ── ② THE RFC FOUR-WAY TIE, called out ─────────────────────────────────────────────────────────────
const tie = named.filter((r) => r.note === 'RFC §5 tie')
const tieMerges = tie.filter((r) => r.sim >= LEX).length
const tieSame = tie.filter((r) => r.rel === RELATION.same).length
console.log('\n② THE RFC §5 FOUR-WAY TIE')
console.log(`   containment: ${tieMerges} of ${tie.length} would MERGE (all at ${tie[0].sim.toFixed(4)})  ⇒ resolved by last_write order`)
console.log(`   ontology:    ${tieSame} of ${tie.length} say \`same\` · ${tie.filter((r) => r.rel === RELATION.broader).length} say \`broader\``)
check('② · ⭐⭐⭐ the ontology BREAKS the RFC §5 four-way tie — at most ONE `same`', tieSame <= 1,
  `${tieSame} same, vs ${tieMerges}/4 merging under containment`)

// ── ③ THE WHOLE CORPUS — every cross-slot phrase pair of the same owner ────────────────────────────
const slots = await q(`SELECT id::text AS id, user_id::text AS uid, entity, canonical_label,
                              COALESCE(aliases,'[]'::jsonb) AS aliases FROM ${S}."mst_slots"`)
const phrasesOf = (s) => [s.canonical_label, ...(s.aliases || []).map((a) => a?.phrase).filter(Boolean)]
const counts = Object.fromEntries(Object.values(RELATION).map((r) => [r, 0]))
const overbound = []   // containment MERGES but the ontology says it is not `same`
const rescued = []     // containment does NOT merge but the ontology says `same`
let pairs = 0
for (const a of slots) {
  for (const b of slots) {
    if (a.id === b.id) continue
    if (a.uid !== b.uid || String(a.entity).toLowerCase() !== String(b.entity).toLowerCase()) continue
    for (const pa of phrasesOf(a)) {
      for (const pb of phrasesOf(b)) {
        pairs++
        const sim = attributeSimilarity(pb, pa)
        const rel = relationOf(pa, pb).relation
        counts[rel]++
        if (sim >= LEX && !mayBind(rel)) overbound.push({ pa, pb, sim, rel, a: a.canonical_label, b: b.canonical_label })
        if (sim < LEX && rel === RELATION.same) rescued.push({ pa, pb, sim, a: a.canonical_label, b: b.canonical_label })
      }
    }
  }
}

console.log(`\n③ THE LIVE CORPUS — ${slots.length} slots · ${pairs.toLocaleString()} cross-slot phrase pairs\n`)
const max = Math.max(...Object.values(counts))
for (const r of [RELATION.same, RELATION.broader, RELATION.narrower, RELATION.sibling, RELATION.different, RELATION.unknown]) {
  console.log(`   ${pad(r, 11)}${pad(counts[r].toLocaleString(), 9)}${bar(counts[r], max)}`)
}
console.log('\n   ⛔ `unknown` is reported SEPARATELY and is NOT folded into `different` — a classifier that became')
console.log('      more UNCERTAIN is a materially different outcome from one that correctly decided "these differ".')

// ── ④ THE DISAGREEMENTS — the number this whole exercise exists to produce ─────────────────────────
console.log(`\n④ ⭐⭐⭐ WHERE THE SHIPPED RESOLVER AND THE ONTOLOGY DISAGREE`)
console.log(`\n   OVER-BINDING — containment would MERGE, structure says it is NOT \`same\`: ${overbound.length}`)
const byRel = {}
for (const o of overbound) byRel[o.rel] = (byRel[o.rel] ?? 0) + 1
for (const [r, n] of Object.entries(byRel).sort((x, y) => y[1] - x[1])) console.log(`      ${pad(r, 11)}${n}`)
const realOver = overbound.filter((o) => !/^zz/i.test(o.pa) && !/^zz/i.test(o.pb))
console.log(`\n   of those, NOT test fixtures: ${realOver.length}`)
for (const o of realOver.slice(0, 12)) {
  console.log(`      ${o.sim.toFixed(4)}  "${o.pa}" → slot "${o.b}"   ⇒ ${o.rel.toUpperCase()}`)
}
console.log(`\n   UNDER-BINDING — containment MISSES, structure says \`same\`: ${rescued.length}`)
for (const r of rescued.filter((x) => !/^zz/i.test(x.pa) && !/^zz/i.test(x.pb)).slice(0, 8)) {
  console.log(`      ${r.sim.toFixed(4)}  "${r.pa}" vs slot "${r.b}"`)
}

// ── ⑤ WHAT THE SHAPE COULD NOT READ — the honest denominator for `unknown` ─────────────────────────
const allPhrases = [...new Set(slots.flatMap(phrasesOf))]
const unread = allPhrases.map((p) => ({ p, s: attributeShapeOf(p) })).filter((x) => !x.s.analysed)
const whyCounts = {}
for (const u of unread) whyCounts[u.s.why] = (whyCounts[u.s.why] ?? 0) + 1
console.log(`\n⑤ PHRASES THE SHAPE COULD NOT READ: ${unread.length} of ${allPhrases.length} distinct`)
for (const [w, n] of Object.entries(whyCounts).sort((a, b) => b[1] - a[1])) console.log(`      ${pad(w, 22)}${n}`)
for (const u of unread.filter((x) => !/^zz/i.test(x.p)).slice(0, 8)) console.log(`      ⓘ "${u.p}"  (${u.s.why})`)

// ── ⑥ INVARIANTS — the few things that must hold regardless of what the numbers say ────────────────
console.log('\n⑥ INVARIANTS\n')
check('⑥a · ⭐⭐⭐ the shelter merge is named BROADER — the case containment scored 1.0000',
  relationOf('schedule', 'work schedule').relation === RELATION.broader)
check('⑥b · ⭐ both REAL hypernym aliases in the store are refused by the ontology',
  !mayBind(relationOf('schedule', 'work schedule').relation)
  && !mayBind(relationOf('preference', 'communication preference').relation),
  'schedule→work schedule · preference→communication preference')
check('⑥c · ⛔ `unknown` never binds, and is never reported as `different`',
  !mayBind(RELATION.unknown) && RELATION.unknown !== RELATION.different)
check('⑥d · ⚠️ ANTI-VACUITY · the corpus actually produced pairs to classify', pairs > 100, `${pairs} pairs`)
check('⑥e · ⚠️ ANTI-VACUITY · the armed `location` collision is STILL ARMED (⛔ this run changed nothing)',
  attributeSimilarity('volunteer_schedule_and_location', 'location') === 1
  && slots.some((s) => (s.aliases || []).some((a) => a?.phrase === 'volunteer_schedule_and_location')),
  'containment still 1.0000 and the alias is still in the store')

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, ledger entry or setting was touched by this run.\n')
done()
