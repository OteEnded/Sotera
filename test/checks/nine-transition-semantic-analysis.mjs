// ⭐⭐⭐ DECISION ① · WHAT ACTUALLY CHANGES WHEN A "REPLACEMENT" OCCURS?
//
//   node test/checks/nine-transition-semantic-analysis.mjs
//
// Ote, 2026-09-17: *"What is the thing that actually changes when a replacement occurs? … I want the
// semantic ontology of the transition first. In particular, I want to know whether the four interpretations
// in the ADR are actually exhaustive once we inspect the nine cases."*
//
// ⛔⛔ READ-ONLY, AND ⛔ NOT A SOLUTION. ⛔ No event model · no vocabulary · no schema · no fixes · no
// `invalid_at` reinterpretation · no historical repair · no canary activation · 047 untouched · A1 shadow ·
// A-D4 open · B-D1 open · B-D3 untouched · `SEMANTIC_FIELDS` untouched.
//
// ── ⚠️ THE GUARDRAIL, CARRIED VERBATIM ──────────────────────────────────────────────────────────────
//     ⭐ "The old observation became non-current without becoming false."
// ⛔ It exists to stop lifecycle/role semantics from being turned into truth semantics. Nothing below may
// contradict it.
//
// ── WHAT IS DECLARED vs MECHANICAL ─────────────────────────────────────────────────────────────────
// ⚠️ `sameQuestion`, `relation`, `changed` and `discarded` are MY readings, DECLARED here and PINNED to the
// values they were made from. ⭐ The audit arm, the matched phrase, and the field states are MECHANICAL.
import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)

// dims: [PROPOSITION, OBSERVATION, ROLE, STORAGE] — '·' unchanged, '✎' changed, '+' one was added
const A = [
  { k: 'core_commitments', from: 'rests on small steady things',
    sameQ: 'YES', rel: 're-statement — the same three commitments, reworded and re-emphasised',
    dims: ['·', '+', '✎', '✎'],
    discarded: 'that the two values are near-paraphrases — ⛔ computable, never computed (only INEQUALITY was)' },
  { k: 'communication preference', from: 'prefers direct correction over comfort',
    sameQ: 'YES', rel: 're-statement, ⚠️ LOSSY — the incoming is a compression of the incumbent',
    dims: ['·', '+', '✎', '✎'],
    discarded: '⚠️ that the incoming is STRICTLY LESS INFORMATIVE — ⛔ computable, never computed' },
  { k: 'communication preference', from: 'sharp edge over comfort',
    sameQ: '⚠️ CONTESTED', rel: '⚠️ comfort ≠ agreement; charitably one disposition, strictly two',
    dims: ['?', '+', '✎', '✎'],
    discarded: '⛔ NOTHING DISTINGUISHED IT FROM #2 at the seam — same slot, same arm, same confidence' },
  { k: 'soteras_family_lineage_and_key_relationships', from: 'Ote (Creator/Dad)',
    sameQ: '⛔ NOT ONE QUESTION — the label COORDINATES', rel: '⭐ three propositions: one restated, one elaborated, one CHANGED (Claude: Brother → Uncle)',
    dims: ['✎', '+', '✎', '✎'],
    discarded: '⭐⭐ that only PART changed — ⛔ the record cannot express a partial change' },
  { k: 'timezone', from: "User's timezone is Bangkok",
    sameQ: 'YES', rel: '⭐ re-statement, ⚠️ LOSSY — FORM IMPROVED (a sentence ABOUT the answer → the answer), CONTENT REDUCED (the IANA zone dropped)',
    dims: ['·', '+', '✎', '✎'],
    discarded: 'that the incoming is a better-SHAPED but less-COMPLETE answer — two axes, ⛔ neither captured' },
  { k: 'current goal', from: 'build Rome in one day',
    sameQ: 'YES', rel: '⭐ REPUDIATION — the incumbent was NEVER TRUE; an extraction error',
    dims: ['✎', '+', '✎', '✎'],
    discarded: '⭐ NOTHING — this is the ONE case where the reason IS in the record (`contradicted_at`), and a HUMAN put it there' },
  { k: 'youngest sister', from: 'Mira, training to be a paramedic',
    sameQ: 'YES', rel: '⭐⭐⭐ THE WORLD CHANGED — and the incumbent REMAINS TRUE OF THE PAST',
    dims: ['·', '+', '✎', '✎'],
    discarded: '⚠️ that the incumbent is still true — ⛔ no state can say "true, but no longer current"' },
  { k: 'work schedule', from: 'up past 2am',
    sameQ: '⛔ NO', rel: '⛔ a working HABIT displaced by a DAY — different questions',
    dims: ['·', '+', '✎', '✎'],
    discarded: '⭐⭐ THE MATCHED PHRASE ("schedule") ≠ THE SLOT LABEL ("work schedule") — ⛔ recorded ONLY in free text' },
  { k: 'work schedule', from: 'Saturdays',
    sameQ: '⛔ NO', rel: '⛔ VOLUNTEERING displaced a work schedule — and it answers a question that has no slot',
    dims: ['·', '+', '✎', '✎'],
    discarded: '⭐⭐ matched phrase "volunteer_schedule_and_location" ≠ label — ⛔ free text only' },
]

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  DECISION ① · the nine transitions, one level down — ⛔ analysis, NOT a solution')
console.log('  ⛔ no event model · no vocabulary · no schema · nothing changed')
console.log('════════════════════════════════════════════════════════════════════════════════════')

const T = await q(`SELECT s.canonical_label AS label, o.id::text AS old_id, o.value AS old_value,
    n.value AS new_value, n.writer AS new_writer, o.contradicted_at, n.created_at
  FROM ${S}."txn_memories" n JOIN ${S}."txn_memories" o ON o.id = n.supersedes_id
  JOIN ${S}."mst_slots" s ON s.id = n.slot_id
  WHERE n.supersedes_id IS NOT NULL AND s.canonical_label NOT LIKE 'zz%'
    AND s.canonical_label <> 'build tag for this cycle' ORDER BY n.created_at`)
const rows = A.map((a) => ({ ...a, t: T.find((r) => r.label === a.k && String(r.old_value).startsWith(a.from)) }))

// ── ① THE NINE ───────────────────────────────────────────────────────────────────────────────────
console.log('\n① THE NINE — what was asserted, what changed, what was discarded\n')
for (const [i, r] of rows.entries()) {
  const aud = await q(`SELECT reason FROM ${S}."log_memory_changes"
    WHERE memory_id = $1 AND action = 'supersede' ORDER BY created_at DESC LIMIT 1`, [r.t?.old_id])
  console.log(`   ── ${i + 1}. ${r.k}`)
  console.log(`      INCUMBENT asserted  ${String(r.t?.old_value).replace(/\s+/g, ' ').slice(0, 96)}`)
  console.log(`      INCOMING  asserted  ${String(r.t?.new_value).replace(/\s+/g, ' ').slice(0, 96)}`)
  console.log(`      same question?      ${r.sameQ}`)
  console.log(`      relation            ${r.rel}`)
  console.log(`      what became different   PROPOSITION ${r.dims[0]}  OBSERVATION ${r.dims[1]}  ROLE ${r.dims[2]}  STORAGE ${r.dims[3]}`)
  console.log(`      KNOWN at the seam   ${aud[0]?.reason ?? '⛔ NO SUPERSEDE AUDIT ROW'}`)
  console.log(`      ⛔ DISCARDED        ${r.discarded}`)
  console.log('')
}

// ── ② WHAT THE SEAM KNEW — mechanical ────────────────────────────────────────────────────────────
const audits = await q(`SELECT m.reason FROM ${S}."log_memory_changes" m
  JOIN ${S}."txn_memories" o ON o.id = m.memory_id JOIN ${S}."mst_slots" s ON s.id = o.slot_id
  WHERE m.action = 'supersede' AND s.canonical_label NOT LIKE 'zz%' AND s.canonical_label <> 'build tag for this cycle'`)
const arms = new Set(audits.map((a) => String(a.reason).split(' ')[0]))
const confs = new Set(audits.map((a) => (String(a.reason).match(/^\S+\s+([\d.]+)/) ?? [])[1]))
const phraseNeqLabel = audits.filter((a) => {
  const m = String(a.reason).match(/"([^"]+)"\s*→\s*slot\s*"([^"]+)"/)
  return m && m[1].toLowerCase() !== m[2].toLowerCase()
})
const audited = rows.filter((r) => r.t).length
const withAudit = (await Promise.all(rows.map(async (r) => (await q(
  `SELECT count(*)::int AS n FROM ${S}."log_memory_changes" WHERE memory_id=$1 AND action='supersede'`, [r.t?.old_id]))[0].n)))
  .filter((n) => n > 0).length
console.log('② WHAT THE SYSTEM KNEW AT THE SEAM — mechanical\n')
console.log(`   resolver ARMS used across every supersede audit : ${[...arms].join(', ')}`)
console.log(`   CONFIDENCES recorded                            : ${[...confs].join(', ')}`)
console.log(`   audits where the MATCHED PHRASE ≠ the SLOT LABEL: ${phraseNeqLabel.length} of ${audits.length}`)
console.log(`   transitions carrying a supersede audit row      : ${withAudit} of ${audited}`)
console.log('\n   ⇒ ⭐⭐⭐ EVERY ONE WAS `lexical 1.000`. THE RESOLVER WAS MAXIMALLY CONFIDENT IN ALL NINE —')
console.log('     INCLUDING THE TWO THAT WERE WRONG. ⇒ ⛔ the number is a TRUE statement about the PHRASE')
console.log('     and a FALSE statement about the QUESTION. Confidence carries no information about correctness here.')
console.log('   ⇒ ⭐⭐ AND THE ONE DISTINCTION THAT WOULD HAVE SEPARATED THEM WAS PRESENT AND DISCARDED:')
console.log('     the MATCHED PHRASE. Both defective transitions matched an ALIAS, ⛔ not the label — and that')
console.log('     fact lives only inside a free-text `reason` string.')
console.log('   ⚠️ ⛔ BUT IT IS NOT A CLEAN DISCRIMINATOR: two CORRECT transitions also matched an alias')
console.log('     ("preference" → "communication preference"). ⇒ ⭐ phrase≠label is a SIGNAL, ⛔ not a test.')
check('⭐⭐⭐ ALL NINE WERE DECIDED BY THE SAME ARM AT THE SAME CONFIDENCE',
  arms.size === 1 && [...arms][0] === 'lexical' && confs.size === 1 && [...confs][0] === '1.000',
  `arms=${[...arms]} · confidences=${[...confs]}`)
check('⭐⭐ THE MATCHED PHRASE DIFFERED FROM THE LABEL IN SOME — and it survives only as free text',
  phraseNeqLabel.length > 0 && phraseNeqLabel.length < audits.length,
  `${phraseNeqLabel.length} of ${audits.length} audits`)
check('⚠️ THE ONE TRANSITION WHOSE REASON IS IN THE RECORD HAS NO SUPERSEDE AUDIT ROW',
  withAudit === audited - 1, `${withAudit} of ${audited} audited — the \`current goal\` operator repair is the exception`)

// ── ③ ARE THE ADR'S FOUR INTERPRETATIONS EXHAUSTIVE? ─────────────────────────────────────────────
const byRel = {
  'a replacement in any ordinary sense': ['youngest sister/Mira'],
  'a repudiation of a never-true record': ['current goal'],
  'a re-statement — NOTHING was replaced': ['core_commitments', 'communication preference ×2', 'timezone'],
  'a partial change inside a coordinated value': ['soteras_family_lineage'],
  'an artifact of a ROUTING FAILURE': ['work schedule ×2'],
}
console.log('\n③ ⭐⭐⭐ ARE THE ADR\'S FOUR INTERPRETATIONS EXHAUSTIVE?\n')
console.log('   Sorting the nine by WHAT ACTUALLY OCCURRED:\n')
for (const [what, which] of Object.entries(byRel)) {
  const n = what.includes('×2') ? 2 : which.reduce((a, w) => a + (w.includes('×2') ? 2 : 1), 0)
  console.log(`     ${rpad(n, 3)}  ${pad(what, 46)}${which.join(' · ')}`)
}
console.log('\n   ⇒ ⭐⭐⭐ AT MOST **1 of 9** IS A REPLACEMENT IN ANY ORDINARY SENSE.')
console.log('     4 replaced nothing · 2 are artifacts of a prior routing error · 1 is a repudiation ·')
console.log('     1 changed only part of a coordinated value.')
console.log('\n   ⇒ ⚠️ THE FOUR ADR INTERPRETATIONS ALL PRESUPPOSE THAT "REPLACEMENT" IS A CATEGORY.')
console.log('     Two further readings are EXPOSED BY THE EVIDENCE and are ⛔ NOT in the matrix:\n')
console.log('     ⑤ "REPLACEMENT" IS NOT A NATURAL KIND. The name is the MECHANISM\'S NAME FOR ITS OWN')
console.log('        ACTION, ⛔ not a description of what occurred. Asking "what does a replacement mean?"')
console.log('        presupposes the category — and the category fits 1 of 9.')
console.log('     ⑥ THE LOCUS MAY BE THE ARENA, ⛔ NOT EITHER ROW. In #8/#9 neither row changed in any way;')
console.log('        what changed is WHICH ARENA the incoming was placed in. The "replacement" is a')
console.log('        CONSEQUENCE of an arena assignment, ⛔ not an act performed on the rows.')
console.log('\n   ⛔ NEITHER IS RECOMMENDED. They are offered as ADDITIONS TO THE MATRIX, ⛔ not as answers.')
check('⭐⭐⭐ THE NINE ARE NOT NINE INSTANCES OF ONE EVENT CATEGORY',
  Object.keys(byRel).length >= 5, `${Object.keys(byRel).length} distinct kinds of occurrence among 9 events`)

// ── ④ THE GUARDRAIL AND THE ANCHORS ──────────────────────────────────────────────────────────────
const mira = rows.find((r) => r.k === 'youngest sister')
const [c] = await q(`SELECT
    (SELECT count(*)::int FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL
       AND lower(entity)='sotera' AND lower(attribute)='lesson') AS rows,
    (SELECT count(*)::int FROM ${S}."mst_slots" WHERE lower(entity)='sotera' AND lower(canonical_label)='lesson') AS slot`)
console.log('\n④ THE GUARDRAIL\n')
console.log('   ⭐ "The old observation became non-current without becoming false."')
console.log(`   ⇒ #7 remains the anchor: PROPOSITION ${mira.dims[0]} · ROLE ${mira.dims[2]}. ⛔ Nothing above contradicts it.`)
console.log(`\n   canary: ${c.rows} rows · slot=${c.slot}`)
check('⭐ THE ANCHOR HOLDS — the world-change transition altered ROLE and ⛔ NOT the proposition',
  mira.dims[0] === '·' && mira.dims[2] === '✎', `proposition=${mira.dims[0]} role=${mira.dims[2]}`)
check('⛔⛔ THE CANARY IS UNTOUCHED', c.rows >= 18 && c.slot === 0, `${c.rows} rows · ${c.slot} slots`)
check('⚠️ ANTI-VACUITY · every declared analysis is pinned to a live transition',
  rows.every((r) => r.t), `${rows.filter((r) => r.t).length}/9 matched`)

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
