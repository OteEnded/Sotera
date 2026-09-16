// ⭐⭐⭐ WHAT SEMANTIC RELATIONSHIP HOLDS BETWEEN TWO OBSERVATIONS OF THE SAME PROPERTY?
//
//   node test/checks/replacement-relation-census.mjs
//
// Ote, 2026-09-17: *"For each observed replacement… Can the existing stored evidence establish that reason,
// or are we inferring beyond the record? Please keep 'the record cannot establish this' as a valid result."*
//
// ⛔⛔ READ-ONLY INVESTIGATION. ⛔ No resolver change · no threshold · no slot binding · no alias · no
// historical row · ⛔ A-D4 untouched · A1 still shadow. ⛔ Nothing is proposed and nothing is "fixed".
//
// ── ⚠️ THE `?` IS LOAD-BEARING ──────────────────────────────────────────────────────────────────────
//
// Ote supplied a CANDIDATE taxonomy and marked half of it with a question mark: *"Don't turn the lesson
// vocabulary into the answer simply because it exists."* ⇒ the names below are PROVISIONAL. `lesson-host`
// already ships `supersedes | refines | coexists_with | qualifies`; that is PRECEDENT, ⛔ not a ruling for
// facts, and this instrument deliberately does NOT adopt those names.
//
// ── ⭐⭐ THE QUESTION THIS INSTRUMENT ACTUALLY ANSWERS ───────────────────────────────────────────────
//
// ⛔ It does NOT try to classify automatically — that would be inventing the semantics under investigation.
// It asks a MECHANICAL question that has a checkable answer:
//
//     ⭐ FOR EACH REPLACEMENT, IS THERE ANYTHING IN THE RECORD THAT COULD DISTINGUISH THE CLASSES —
//        or was every classification produced by a human reading the two values?
//
// That separates "the substrate is lossy" from "the substrate is UNCLASSIFIED", and those need different
// answers.
import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)
const flat = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

// ⭐ PROVISIONAL CLASSES — ⚠️ every `?` is Ote's and is preserved deliberately.
const REL = Object.freeze({
  restate: 'RE-STATEMENT      same proposition, different wording',
  refine: 'REFINEMENT?       additional or more precise information',
  state: 'STATE CHANGE?     genuinely different answer to the same property',
  repair: 'CORRECTION        the previous observation was erroneous',
  coexist: 'COEXISTENCE?      both observations remain true',
  qualify: 'QUALIFICATION?    same proposition, contextual qualification changed',
  wrong: 'WRONG SLOT        different conceptual property — ⛔ not a relation at all',
  mixed: 'MIXED             several propositions in one value, each doing something different',
})

// ⭐⭐ THE PER-TRANSITION ANALYSIS. ⚠️ `rel`, `oldRole` and `why` are MY judgements, DECLARED here and
// PINNED to the values they were made from (`from`/`to` = first 46 chars). ⛔ `establishedBy` is NOT a
// judgement — it names the column that carries the answer, or says the record is silent.
const ANALYSIS = [
  { slot: 'core_commitments', from: 'rests on small steady things rather than syste', to: 'a garden he tends, showing up for a kid as an a',
    rel: 'restate', fate: 'clean', oldRole: 'NONE — the new value carries the same three commitments',
    why: 'same propositions, reordered and reworded; nothing added or dropped.' },
  { slot: 'communication preference', from: 'prefers direct correction over comfort — would', to: 'sharp edge over comfort',
    rel: 'restate', fate: 'better', oldRole: '⚠️ STILL THE BETTER RECORD — the archived value is strictly more informative',
    why: 'LOSSY re-statement. ⛔ The richer value was archived by a terser one ⇒ "later" demoted "better".' },
  { slot: 'communication preference', from: 'sharp edge over comfort', to: 'friction over agreement',
    rel: 'restate', contested: true, fate: 'unknown', oldRole: '⚠️ UNDETERMINED — depends on whether these are one disposition or two',
    why: '⚠️ CONTESTED. Charitably one disposition; strictly, comfort ≠ agreement. ⛔ THE RECORD CANNOT SETTLE IT — and Ote ruled that recording the uncertainty is the correct result.' },
  { slot: 'soteras_family_lineage_and_key_relationships', from: 'Ote (Creator/Dad): My father; we will build \'R', to: 'Ote (Dad/Creator): My father; we will build \'R',
    rel: 'mixed', fate: 'undefinable', oldRole: '⛔ UNANSWERABLE AS ONE VALUE — one proposition restated, one refined, one CHANGED',
    why: 'Ote: word order. Hermes: added detail. Claude: Builder/BROTHER → UNCLE/Builder ⇒ a changed relation. ⭐ ONE SLOT HOLDS ONE ANSWER — the coordination label made the relation undefinable.' },
  { slot: 'timezone', from: 'User\'s timezone is Bangkok (Asia/Bangkok).', to: 'Bangkok',
    rel: 'restate', fate: 'better', oldRole: '⚠️ STILL THE BETTER RECORD — it carries the IANA zone the new value dropped',
    why: 'LOSSY re-statement. ⛔ The old row is marked invalid IN THE WORLD and remains TRUE.' },
  { slot: 'current goal', from: 'build Rome in one day', to: 'Building Sotera — what Ote calls \'building Rom',
    rel: 'repair', fate: 'false_', oldRole: '⭐ KEEP AS ERRONEOUS — useful precisely as the misreading that was corrected',
    why: 'ROME = SOTERA. An extraction error repaired by `operator`, who ALSO set `contradicted_at` — ⭐ the only transition where the reason is IN the record, and a human put it there.' },
  { slot: 'youngest sister', from: 'Mira, training to be a paramedic in Chiang Mai', to: 'Mira, works as a paramedic in Bangkok (finishe',
    rel: 'state', fate: 'past', oldRole: '⭐ KEEP AS TRUE-BUT-PAST — "she was training" is still a true statement about the past',
    why: 'The one genuine world change. ⚠️ And the old observation was never FALSE — it stopped being CURRENT.' },
  { slot: 'work schedule', from: 'up past 2am', to: 'Saturdays',
    rel: 'wrong', fate: 'misrouted', oldRole: '⭐ KEEP AND RE-HOME — a working habit is a different question from a day',
    why: '⛔ Not a relation between two observations of one property — a routing failure.' },
  { slot: 'work schedule', from: 'Saturdays', to: 'The user volunteers at an animal shelter on Hu',
    rel: 'wrong', fate: 'misrouted', oldRole: '⭐ KEEP AND RE-HOME — volunteering is not a work schedule',
    why: '⛔ The A-investigation defect, reached through the `schedule` alias.' },
]

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  REPLACEMENT RELATION · what relation holds between two observations of one property?')
console.log('  ⛔ read-only investigation · ⛔ nothing proposed · ⛔ A-D4 untouched')
console.log('════════════════════════════════════════════════════════════════════════════════════')

const trans = await q(`
  SELECT s.canonical_label AS label, o.value AS old_value, n.value AS new_value,
         n.writer, n.act_kind, n.reach_kind, n.modality,
         n.question_id_at_admission, o.contradicted_at,
         (nm.id IS NOT NULL) AS new_src_reachable, (om.id IS NOT NULL) AS old_src_reachable
  FROM ${S}."txn_memories" n
  JOIN ${S}."txn_memories" o ON o.id = n.supersedes_id
  JOIN ${S}."mst_slots"    s ON s.id = n.slot_id
  LEFT JOIN ${S}."txn_messages" nm ON nm.id = n.source_message_id
  LEFT JOIN ${S}."txn_messages" om ON om.id = o.source_message_id
  WHERE n.supersedes_id IS NOT NULL
    AND s.canonical_label NOT LIKE 'zz%' AND s.canonical_label <> 'build tag for this cycle'
  ORDER BY n.created_at ASC`)

const rows = ANALYSIS.map((a) => ({
  ...a,
  t: trans.find((r) => r.label === a.slot
    && flat(r.old_value).startsWith(a.from) && flat(r.new_value).startsWith(a.to)),
}))

// ── ① PER TRANSITION — Ote's question list ─────────────────────────────────────────────────────────
console.log('\n① EACH REPLACEMENT, AGAINST OTE\'S QUESTION LIST')
console.log('   ⚠️ relation + role are HUMAN judgements. ⭐ "established by" is MECHANICAL — it names the')
console.log('   column carrying the answer, or reports the record silent.\n')
let establishable = 0
let evidenceReachable = 0
for (const [i, r] of rows.entries()) {
  // ⭐ WHAT IN THE RECORD COULD DISTINGUISH THE CLASSES? Only fields that speak to the RELATION count.
  // ⛔ `writer` / `act_kind` / `reach_kind` describe HOW THE WRITE HAPPENED, ⛔ never what the new value
  // means relative to the old — a re-statement and a world change from the same writer are identical here.
  const carriers = []
  if (r.t?.contradicted_at) carriers.push('contradicted_at (old row marked erroneous)')
  if (r.t?.question_id_at_admission) carriers.push('question_id_at_admission (the question it answered)')
  if (r.t?.modality && r.t.modality !== 'asserted') carriers.push(`modality=${r.t.modality}`)
  const can = carriers.length > 0
  if (can) establishable++
  const reach = r.t?.new_src_reachable && r.t?.old_src_reachable
  if (reach) evidenceReachable++
  console.log(`   ${rpad(`${i + 1}.`, 4)} ${REL[r.rel].split(/\s{2,}/)[0]}${r.contested ? '   ⚠️ CONTESTED' : ''}   ${r.slot}`)
  console.log(`        old   ${flat(r.t?.old_value).slice(0, 86)}`)
  console.log(`        new   ${flat(r.t?.new_value).slice(0, 86)}`)
  console.log(`        ⇒ ${r.why}`)
  console.log(`        OLD OBSERVATION'S ROLE: ${r.oldRole}`)
  console.log(`        RECORD: ${can ? `✅ CAN establish — ${carriers.join(' · ')}` : '⛔ CANNOT establish — nothing on either row describes the relation'}`)
  console.log(`        EVIDENCE: ${reach ? '✅ both source turns still reachable' : '⛔ a source turn is missing'}`)
  console.log('')
}

// ── ② ⭐⭐⭐ THE AGGREGATE — lossy, or merely unclassified? ─────────────────────────────────────────
console.log('② ⭐⭐⭐ IS THE SUBSTRATE LOSSY, OR MERELY UNCLASSIFIED?\n')
console.log(`   relation IS established by the record        ${rpad(establishable, 3)} of ${rows.length}`)
console.log(`   relation is NOT established by the record    ${rpad(rows.length - establishable, 3)} of ${rows.length}`)
console.log(`   ⭐ BOTH source turns still reachable          ${rpad(evidenceReachable, 3)} of ${rows.length}`)
console.log('\n   ⇒ ⭐⭐⭐ THE RELATION WAS NEVER RECORDED — ⛔ BUT THE EVIDENCE IS NOT LOST.')
console.log('     Every classification in §1 was produced by a human reading two values and their source')
console.log('     turns. ⛔ Nothing stored on a superseding row says what it means relative to what it')
console.log('     replaced: `supersedes_id` names WHICH row, never IN WHAT SENSE.')
console.log('     ⚠️ `writer` / `act_kind` / `reach_kind` are present on all of them and cannot help — they')
console.log('     describe HOW THE WRITE HAPPENED. The same writer produced a re-statement AND a world change.')
console.log('   ⇒ ⭐ THE SUBSTRATE IS UNCLASSIFIED, ⛔ NOT LOSSY. That is a materially different problem,')
console.log('     and it is the more tractable one.')

// ── ③ WHAT BECOMES OF THE OLD OBSERVATION — the axis the evidence actually demands ─────────────────
// ⚠️ INTERPRETATION. ⛔ NOT a proposed vocabulary — grouping by what the evidence says should HAPPEN to
// the displaced row, which is a different axis from how the NEW value differs.
console.log('\n③ ⚠️ WHAT SHOULD BECOME OF THE DISPLACED OBSERVATION? (interpretation — ⛔ not a proposal)\n')
// ⚠️ KEYED PER TRANSITION, ⛔ NOT PER SLOT — and the first version got this wrong in exactly the way
// §0-B ⑰ warns about. Grouping by `slot` folded the TWO `communication preference` transitions together,
// which silently gave the CONTESTED one the fate of its sibling. A label is not an identity, and here a
// slot is not a transition. ⇒ each ANALYSIS entry declares its own `fate`.
const FATE_NOTES = {
  clean: ['SUPERSEDED, NOTHING LOST', 'the new value says everything the old did'],
  better: ['⚠️ ARCHIVED BUT STILL THE BETTER RECORD', 'the new value lost information the old had'],
  past: ['⭐ TRUE-BUT-PAST', 'never false — it stopped being CURRENT'],
  false_: ['⭐ FALSE / ERRONEOUS', 'never true; useful as the misreading that was corrected'],
  misrouted: ['⛔ MIS-ROUTED', 'not a relation at all — it answers a different question'],
  undefinable: ['⛔ UNDEFINABLE AS ONE VALUE', 'several propositions, several fates'],
  unknown: ['⚠️ UNDETERMINED — the record cannot say', '⛔ a valid result, ⛔ never resolved by guessing'],
}
for (const [key, [fate, note]] of Object.entries(FATE_NOTES)) {
  const n = rows.filter((r) => r.fate === key).length
  console.log(`   ${pad(fate, 42)}${rpad(n, 3)}   ${note}`)
}
const unfated = rows.filter((r) => !FATE_NOTES[r.fate])
check('⛔ every transition carries a DECLARED fate — none defaulted',
  unfated.length === 0, unfated.map((r) => r.slot).join(', ') || `all ${rows.length} declared`)

// ⭐⭐ THE RED-PROOF FOR DEFECT #13, pinned at Ote's request: "the corrected instrument should remain
// transition-keyed and should assert that no fate was inherited from another transition."
// ⛔ A generic "every fate is declared" check would still pass if someone re-grouped BY SLOT, because the
// fates would merely be copied. ⇒ this asserts the case that CANNOT survive slot-grouping: the two
// `communication preference` transitions must hold DIFFERENT fates. If that ever collapses to one, the
// instrument has silently reverted to keying on the label.
const commPref = rows.filter((r) => r.slot === 'communication preference')
check('⭐⭐ NO FATE IS INHERITED FROM ANOTHER TRANSITION — the two `communication preference` events differ',
  commPref.length === 2 && commPref[0].fate !== commPref[1].fate,
  `${commPref.length} transitions · fates: ${commPref.map((r) => r.fate).join(' vs ')}`)
check('⭐ each fate is read from the transition\'s OWN declaration — ⛔ never from a slot-level lookup',
  rows.every((r) => Object.prototype.hasOwnProperty.call(
    ANALYSIS.find((a) => a.from === r.from && a.to === r.to) ?? {}, 'fate')),
  `${rows.length} transitions, each pinned by its own (from,to)`)
console.log('\n   ⇒ ⭐⭐ AT LEAST THREE DISTINCT FATES ARE REQUIRED by nine events — still-true-and-better,')
console.log('     true-but-past, and false. ⛔ ONE `invalid_at` EXPRESSES ALL THREE IDENTICALLY.')
console.log('   ⚠️ And note the axis: these group by WHAT BECOMES OF THE OLD ROW, ⛔ not by how the NEW value')
console.log('     differs — which is the axis `lesson-host`\'s vocabulary uses. ⭐ They are not the same axis,')
console.log('     which is why the lesson names must NOT be adopted by default.')

// ── ④ THE QUESTION LAYER — already declared (047), and essentially unpopulated ─────────────────────
const [qs] = await q(`SELECT count(*)::int AS n FROM ${S}."mst_slot_questions"`)
const [sl] = await q(`SELECT count(*)::int AS all_slots, count(question_id)::int AS with_q FROM ${S}."mst_slots"`)
const [me] = await q(`SELECT count(*)::int AS n, count(question_id_at_admission)::int AS pinned FROM ${S}."txn_memories"`)
console.log('\n④ ⭐⭐⭐ THE QUESTION LAYER — migration 047 already separates SLOT from QUESTION\n')
console.log('   > 047: *"Kind is the QUESTION a slot asks, ⛔ not the datatype of its value."*')
console.log('   >      mst_slot_questions   a SUBJECT-FREE definition — "what does a valid answer look like?"')
console.log('   >      mst_slots.question_id a ROOM-SCOPED instance   — "this room\'s slot asks that question"')
console.log('   > ⛔ *"DECLARED by something that actually knows it, never inferred from values, never guessed')
console.log('   >   by a classifier, and never backfilled."*\n')
console.log(`   questions declared                  ${rpad(qs.n, 4)}`)
console.log(`   slots carrying a question_id        ${rpad(sl.with_q, 4)}  of ${sl.all_slots}`)
console.log(`   memories pinned to a question       ${rpad(me.pinned, 4)}  of ${me.n}`)
console.log('\n   ⇒ ⭐⭐⭐ THE THIRD MODEL IS ALREADY DECLARED AND LOCKED — AND IS EMPTY.')
console.log('     ⚠️ AND THE CONSEQUENCE FOR A-D4: it asks the resolver to decide BY SIMILARITY whether two')
console.log('     labels name the same conceptual property. ⛔ M2-10/M2-11 already ruled that what question a')
console.log('     slot asks may ONLY be DECLARED — never inferred from values, never guessed by a classifier.')
console.log('     ⛔ THIS IS NOT A RULING ON A-D4. It is a collision between two live decisions, and it is Ote\'s.')

// ── ⑤ INVARIANTS ──────────────────────────────────────────────────────────────────────────────────
console.log('\n⑤ INVARIANTS\n')
check('⚠️ ANTI-VACUITY · every declared analysis is pinned to a live transition',
  rows.every((r) => r.t), rows.filter((r) => !r.t).map((r) => r.slot).join(', ') || `all ${rows.length} matched`)
check('⛔ the analysis covers EVERY transition — none quietly skipped',
  rows.length === trans.length, `${rows.length} analysed · ${trans.length} in the corpus`)
check('⭐⭐⭐ THE RECORD CANNOT ESTABLISH THE RELATION for all but the operator repair',
  establishable === 1, `${establishable} of ${rows.length} establishable from the record`)
check('⭐⭐ THE EVIDENCE IS NOT LOST — both source turns reachable for every transition',
  evidenceReachable === rows.length, `${evidenceReachable} of ${rows.length}`)
check('⭐ THE QUESTION LAYER EXISTS AND IS EMPTY — ⛔ so it cannot be what decides sameness today',
  qs.n <= 1 && sl.with_q <= 1, `${qs.n} questions · ${sl.with_q}/${sl.all_slots} slots carry one`)
check('⛔ "the record cannot establish this" is REPORTED, ⛔ never silently resolved',
  rows.some((r) => r.contested), 'the contested transition is preserved as contested')
check('⛔ EVIDENCE PRESERVED — the shelter and Mira chains both still present',
  trans.some((t) => t.label === 'work schedule') && trans.some((t) => t.label === 'youngest sister'))

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, setting or threshold was touched.\n')
done()
