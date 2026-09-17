// ⭐⭐⭐ DECISION ① · FINAL PASS — nine instances where an INCUMBENT'S STATUS CHANGED
//
//   node test/checks/incumbent-status-change-trace.mjs
//
// Ote, 2026-09-17: *"Don't analyze the nine as 'replacement events'. Analyze them as nine instances where
// the competition machinery changed the status of an incumbent."*
//
// ⛔⛔ READ-ONLY, ⛔ AND NOT A DESIGN. ⛔ No event model · no replacement model · no vocabulary · no schema ·
// no `invalid_at` reinterpretation · no historical repair · no canary activation · 047 untouched ·
// A1 shadow · A-D4 open · B-D1 open · B-D3 untouched · `SEMANTIC_FIELDS` untouched · ②–⑦ frozen.
//
// ── ⚠️ THE FRAMING IS DELIBERATELY NOT "REPLACEMENT" ────────────────────────────────────────────────
// The previous pass established that at most 1 of 9 is a replacement in any ordinary sense. ⇒ ⭐ the word
// is not used below as a category. Each case is described as: THE INCUMBENT'S STATUS CHANGED — and the
// question is WHAT SEMANTIC OCCURRENCE, IF ANY, CAUSED IT.
//
// ── THE GUARDRAIL ──────────────────────────────────────────────────────────────────────────────────
//     ⭐ "The old observation became non-current without becoming false."
import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)

// CAUSAL LOCUS — ⚠️ a declared reading. ⛔ Not a vocabulary; these are the levels Ote named.
const LOCUS = {
  prop: 'PROPOSITION-LEVEL',
  obs: 'OBSERVATION-LEVEL',
  question: 'QUESTION IDENTITY',
  arena: '⭐ ARENA MEMBERSHIP',
  external: 'EXTERNAL JUDGEMENT',
  undet: '⚠️ UNDETERMINED',
}

const C = [
  { n: 1, k: 'core_commitments', from: 'rests on small steady things',
    sameQ: 'YES', propChanged: 'NO — the same three commitments', obsChanged: 'a SECOND observation now exists',
    role: 'YES', storage: 'YES',
    unpreserved: 'that the two propositions are THE SAME — ⛔ only their INEQUALITY AS STRINGS was computed',
    locus: [LOCUS.obs], why: 'a new observation of an unchanged proposition' },
  { n: 2, k: 'communication preference', from: 'prefers direct correction over comfort',
    sameQ: 'YES', propChanged: 'NO', obsChanged: 'a second, SHORTER observation',
    role: 'YES', storage: 'YES',
    unpreserved: '⚠️ that the incoming is STRICTLY LESS INFORMATIVE than the incumbent',
    locus: [LOCUS.obs], why: 'a new observation of an unchanged proposition' },
  { n: 3, k: 'communication preference', from: 'sharp edge over comfort',
    sameQ: '⚠️ CONTESTED', propChanged: '⚠️ UNDETERMINED — comfort ≠ agreement, but may be one disposition',
    obsChanged: 'a second observation', role: 'YES', storage: 'YES',
    unpreserved: '⭐ THE UNCERTAINTY ITSELF — the row state asserts a settled outcome where the record settles nothing',
    locus: [LOCUS.undet], why: '⛔ the record cannot say, and this is preserved as contested' },
  { n: 4, k: 'soteras_family_lineage_and_key_relationships', from: 'Ote (Creator/Dad)',
    sameQ: '⛔ NO — the label COORDINATES three questions',
    propChanged: '⭐ ONE OF THREE DID: Claude, Builder/BROTHER → UNCLE/Builder. Ote restated, Hermes elaborated.',
    obsChanged: 'a second observation of all three', role: 'YES', storage: 'YES',
    unpreserved: '⭐⭐ THAT ONLY ONE SUB-PROPOSITION CHANGED — ⛔ the record has no granularity below the value',
    locus: [LOCUS.prop, LOCUS.question],
    why: '⭐⭐⭐ THE GRANULARITY OF THE CHANGE (one sub-proposition) ≠ THE GRANULARITY OF THE MECHANISM (the whole value). And the three shared one arena because ONE LABEL NAMED THEM ⇒ question identity is implicated too.' },
  { n: 5, k: 'timezone', from: "User's timezone is Bangkok",
    sameQ: 'YES', propChanged: 'NO — Bangkok, both times', obsChanged: 'a second observation, better SHAPED and less COMPLETE',
    role: 'YES', storage: 'YES',
    unpreserved: 'that the ANSWER IS IDENTICAL and only the FORM changed',
    locus: [LOCUS.obs], why: 'a new observation of an unchanged proposition' },
  { n: 6, k: 'current goal', from: 'build Rome in one day',
    sameQ: 'YES', propChanged: '⭐ THE INCUMBENT WAS NEVER TRUE — it was a misreading of its source',
    obsChanged: 'the earlier OBSERVATION was judged faulty', role: 'YES', storage: 'YES',
    unpreserved: '⭐ NOTHING — this is the ONLY case whose reason IS in the record (`contradicted_at` + `contradicted_by_message_id`)',
    locus: [LOCUS.obs, LOCUS.external],
    why: '⭐⭐⭐ ⛔ THE COMPETITION MACHINERY DID NOT DO THIS. `writer=operator`, `act_id=reconcile:rome-2026-09-02`, and ⛔ NO supersede audit row. A human judged an observation faulty.' },
  { n: 7, k: 'youngest sister', from: 'Mira, training to be a paramedic',
    sameQ: 'YES', propChanged: '⭐ THE WORLD CHANGED — and the incumbent REMAINS TRUE OF THE PAST',
    obsChanged: 'a second observation of a changed world', role: 'YES', storage: 'YES',
    unpreserved: '⭐⭐ THAT THE INCUMBENT IS STILL TRUE — ⛔ no state can say "true, but no longer current"',
    locus: [LOCUS.prop], why: '⭐ THE ONLY CASE CAUSED BY PROPOSITION-LEVEL SEMANTICS' },
  { n: 8, k: 'work schedule', from: 'up past 2am',
    sameQ: '⛔ NO — a working HABIT vs a DAY', propChanged: '⛔ NEITHER CHANGED', obsChanged: '⛔ NEITHER CHANGED',
    role: 'YES', storage: 'YES',
    unpreserved: 'that the incoming answers A DIFFERENT QUESTION — and the matched phrase ("schedule") that hinted at it',
    locus: [LOCUS.arena],
    why: '⭐⭐⭐ NOTHING AT THE PROPOSITION OR OBSERVATION LEVEL CAUSED THIS. Both rows are valid, unchanged observations. The ONLY thing that happened is that THE INCOMING WAS PLACED IN THIS ARENA, via the `schedule` alias.' },
  { n: 9, k: 'work schedule', from: 'Saturdays',
    sameQ: '⛔ NO — VOLUNTEERING vs a work schedule', propChanged: '⛔ NEITHER CHANGED', obsChanged: '⛔ NEITHER CHANGED',
    role: 'YES', storage: 'YES',
    unpreserved: 'that the incoming answers a question THAT HAS NO SLOT — and the matched phrase that hinted at it',
    locus: [LOCUS.arena],
    why: '⭐⭐⭐ ARENA MEMBERSHIP ALONE, via the `volunteer_schedule_and_location` alias.' },
]

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  DECISION ① · FINAL PASS — nine changes of INCUMBENT STATUS')
console.log('  ⛔ "replacement" is NOT used as a category · ⛔ no model designed · ⛔ nothing changed')
console.log('════════════════════════════════════════════════════════════════════════════════════')

const T = await q(`SELECT s.canonical_label AS label, o.id::text AS old_id, o.value AS old_value,
    n.value AS new_value, n.writer AS new_writer, n.act_kind, n.act_id
  FROM ${S}."txn_memories" n JOIN ${S}."txn_memories" o ON o.id = n.supersedes_id
  JOIN ${S}."mst_slots" s ON s.id = n.slot_id
  WHERE n.supersedes_id IS NOT NULL AND s.canonical_label NOT LIKE 'zz%'
    AND s.canonical_label <> 'build tag for this cycle' ORDER BY n.created_at`)
const rows = C.map((c) => ({ ...c, t: T.find((r) => r.label === c.k && String(r.old_value).startsWith(c.from)) }))

console.log('\n① THE NINE — ⛔ nine questions each, and nothing else\n')
for (const r of rows) {
  console.log(`   ── ${r.n}. ${r.k}`)
  console.log(`      incumbent proposition  ${String(r.t?.old_value).replace(/\s+/g, ' ').slice(0, 92)}`)
  console.log(`      incoming proposition   ${String(r.t?.new_value).replace(/\s+/g, ' ').slice(0, 92)}`)
  console.log(`      same question?         ${r.sameQ}`)
  console.log(`      did a proposition change?  ${r.propChanged}`)
  console.log(`      did the observation change? ${r.obsChanged}`)
  console.log(`      current role changed?  ${r.role}        storage changed? ${r.storage}`)
  console.log(`      ⛔ NOT PRESERVED       ${r.unpreserved}`)
  console.log(`      CAUSAL LOCUS           ${r.locus.join(' + ')}`)
  console.log(`                             ${r.why}`)
  console.log('')
}

// ── ② THE CAUSAL SORT ────────────────────────────────────────────────────────────────────────────
const byLocus = new Map()
for (const r of rows) {
  const key = r.locus.join(' + ')
  byLocus.set(key, [...(byLocus.get(key) ?? []), r.n])
}
console.log('② ⭐⭐⭐ WHAT ACTUALLY CAUSED THE INCUMBENT TO LOSE ITS STATUS\n')
for (const [locus, ns] of [...byLocus].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`   ${rpad(ns.length, 3)}  ${pad(locus, 46)}#${ns.join(' #')}`)
}
const propOnly = rows.filter((r) => r.locus.length === 1 && r.locus[0] === LOCUS.prop).length
const arenaOnly = rows.filter((r) => r.locus.length === 1 && r.locus[0] === LOCUS.arena).length
const obsOnly = rows.filter((r) => r.locus.length === 1 && r.locus[0] === LOCUS.obs).length
console.log(`\n   ⇒ ⭐⭐⭐ PROPOSITION-LEVEL SEMANTICS CAUSED **${propOnly} OF 9**.`)
console.log(`     ⭐ ARENA MEMBERSHIP ALONE caused ${arenaOnly}. A NEW OBSERVATION OF AN UNCHANGED PROPOSITION caused ${obsOnly}.`)
console.log('   ⇒ ⚠️ THE COMPETITION MACHINERY FIRES PREDOMINANTLY ON EVENTS THAT ARE NOT ABOUT WHAT IS TRUE.')
check('⭐⭐⭐ PROPOSITION-LEVEL SEMANTICS CAUSED EXACTLY ONE OF THE NINE',
  propOnly === 1, `${propOnly} proposition-only · ${arenaOnly} arena-only · ${obsOnly} observation-only`)
check('⭐⭐ TWO CASES WERE CAUSED BY ARENA MEMBERSHIP ALONE — ⛔ neither row changed in any way',
  arenaOnly === 2 && rows.filter((r) => r.locus[0] === LOCUS.arena).every((r) => r.propChanged.includes('NEITHER')),
  `#${rows.filter((r) => r.locus[0] === LOCUS.arena).map((r) => r.n).join(' #')}`)

// ── ③ ⛔ ONE OF THE NINE WAS NOT THE COMPETITION MACHINERY ───────────────────────────────────────
const six = rows.find((r) => r.n === 6)
const [audit6] = await q(`SELECT count(*)::int AS n FROM ${S}."log_memory_changes"
  WHERE memory_id = $1 AND action = 'supersede'`, [six.t?.old_id])
const seven = rows.find((r) => r.n === 7)
const [audit7] = await q(`SELECT count(*)::int AS n FROM ${S}."log_memory_changes"
  WHERE memory_id = $1 AND action = 'supersede'`, [seven.t?.old_id])
console.log('\n③ ⭐⭐⭐ ⛔ ONE OF THE NINE WAS NOT THE COMPETITION MACHINERY\n')
console.log(`   #6 current goal  writer=${six.t?.new_writer} · act=${six.t?.act_kind} · act_id=${six.t?.act_id}`)
console.log(`                    supersede audit rows: ${audit6.n}`)
console.log(`   #7 Mira          supersede audit rows: ${audit7.n}  ("lexical 1.000 · …" — the machinery)`)
console.log('\n   ⇒ ⭐ #6 WAS A NAMED HUMAN ACT, ⛔ not a machinery transition. ⇒ the framing "nine instances')
console.log('     where the competition machinery changed an incumbent\'s status" is true of **EIGHT**.')
console.log('   ⇒ ⭐⭐⭐ AND THE PATTERN: THE ONLY CASE THAT PRESERVED ITS SEMANTIC FACT IS THE ONLY ONE THE')
console.log('     MACHINERY DID NOT PERFORM. ⛔ Stated as an observation about these nine, ⛔ not as a law.')
check('⭐⭐⭐ #6 CARRIES NO SUPERSEDE AUDIT AND A NAMED OPERATOR ACT — the machinery did not do it',
  audit6.n === 0 && six.t?.act_kind === 'operator' && audit7.n > 0,
  `#6 audits=${audit6.n} act=${six.t?.act_kind} · #7 audits=${audit7.n}`)

// ── ④ #4 AND #8/#9 — WHERE EXACTLY THE SEMANTIC CHANGE OCCURRED ─────────────────────────────────
console.log('\n④ THE THREE OTE ASKED TO BE PRECISE ABOUT\n')
console.log('   #4  ⭐ THE CHANGE IS REAL AND IT IS **INSIDE** THE VALUE. One of three sub-propositions changed')
console.log('       (Claude: Builder/BROTHER → UNCLE/Builder). ⇒ THE GRANULARITY OF THE CHANGE IS THE')
console.log('       SUB-PROPOSITION; THE GRANULARITY OF THE MECHANISM IS THE WHOLE VALUE. ⛔ They do not match,')
console.log('       and the record has no level below the value at which to say so.')
console.log('       ⚠️ AND QUESTION IDENTITY IS IMPLICATED: the three share one arena only because ONE LABEL')
console.log('       NAMED THEM. ⇒ the coordination is upstream of the granularity mismatch.')
console.log('\n   #8/#9 ⭐⭐⭐ **NO SEMANTIC CHANGE OCCURRED AT ALL.** Both propositions were true before and')
console.log('       remain true. Neither observation changed. ⛔ The ONLY thing that happened is that the')
console.log('       incoming was PLACED IN THIS ARENA — via the `schedule` and')
console.log('       `volunteer_schedule_and_location` aliases. ⇒ ⭐ THE ARENA ASSIGNMENT IS CAUSALLY UPSTREAM')
console.log('       OF EVERYTHING THE ROWS LATER REPORT, and the row state describes a change that never happened.')

// ── ⑤ THE GUARDRAIL AND THE CANARY ──────────────────────────────────────────────────────────────
const [c] = await q(`SELECT
    (SELECT count(*)::int FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL
       AND lower(entity)='sotera' AND lower(attribute)='lesson') AS rows,
    (SELECT count(*)::int FROM ${S}."mst_slots" WHERE lower(entity)='sotera' AND lower(canonical_label)='lesson') AS slot`)
console.log('\n⑤ THE GUARDRAIL\n')
console.log('   ⭐ "The old observation became non-current without becoming false."')
console.log('   ⇒ #7: proposition unchanged and STILL TRUE · role changed. ⛔ Nothing above contradicts it.')
console.log(`\n   canary: ${c.rows} rows · slot=${c.slot}`)
check('⭐ THE GUARDRAIL HOLDS — #7 is proposition-level and the incumbent remains true',
  seven.locus.length === 1 && seven.locus[0] === LOCUS.prop && seven.propChanged.includes('REMAINS TRUE'))
check('⛔⛔ THE CANARY IS UNTOUCHED', c.rows >= 18 && c.slot === 0, `${c.rows} rows · ${c.slot} slots`)
check('⚠️ ANTI-VACUITY · all nine analyses are pinned to live transitions',
  rows.every((r) => r.t), `${rows.filter((r) => r.t).length}/9`)

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
