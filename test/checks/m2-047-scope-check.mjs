// ⭐⭐⭐ WHAT DOES 047 / M2-10 / M2-11 ACTUALLY GOVERN?
//
//   node test/checks/m2-047-scope-check.mjs
//
// Ote, 2026-09-17: *"Determine from the source whether that prohibition applies to: A. answer validity
// only · B. slot/question identity / slot sameness · C. both. ⛔ Do not choose whichever interpretation
// makes A-D4 easier. If the original decision is genuinely ambiguous, report it as ambiguous."*
//
// ⛔⛔ READ-ONLY. Writes nothing, calls no model, changes no behaviour. ⛔ No resolver change, no
// threshold, no binding, no alias, no historical row, no 047 population, no backfill. ⛔ A-D4 untouched.
//
// ── ⭐ WHAT THIS INSTRUMENT IS FOR ──────────────────────────────────────────────────────────────────
// The SCOPE VERDICT is a reading of the source and lives in the doc. ⛔ This file does not argue it.
// It pins the CHECKABLE claims that reading rests on, so the argument cannot quietly drift from the code:
// if any of these stops being true, the verdict must be re-derived rather than re-quoted.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'
import { governsReplacement, REPLACEMENT_SCOPE, REPLACEMENT } from '../../Backend/app/components/memory-replacement-gate.js'
import { checkKind, KIND_OUTCOME } from '../../Backend/app/components/memory-kind-precondition.js'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  047 / M2-10 / M2-11 SCOPE — the checkable claims behind the reading')
console.log('  ⛔ read-only · ⛔ nothing proposed · ⛔ A-D4 untouched')
console.log('════════════════════════════════════════════════════════════════════════════════════\n')

// ── ① THE GATE'S OWN BEHAVIOUR — exercised, ⛔ not read off a comment ──────────────────────────────
// ⭐ Driving the PURE functions directly is the only honest way to say what they govern: a docstring can
// be aspirational, a return value cannot.
console.log('① WHAT THE PURE GATE ACTUALLY DOES (exercised, not quoted)\n')
const notUpdate = governsReplacement({ isUpdate: false, slotGoverned: true, slotKind: 'k', claimKind: 'k' })
const ungoverned = governsReplacement({ isUpdate: true, slotGoverned: false, slotKind: 'k', claimKind: 'k' })
const match = governsReplacement({ isUpdate: true, slotGoverned: true, slotKind: 'k', claimKind: 'k' })
const mismatch = governsReplacement({ isUpdate: true, slotGoverned: true, slotKind: 'k', claimKind: 'other' })
for (const [name, r] of [['NEW/NOOP/DUPLICATE (isUpdate=false)', notUpdate], ['ungoverned namespace', ungoverned],
  ['governed · claimKind MATCHES', match], ['governed · claimKind DIFFERS', mismatch]]) {
  console.log(`   ${name.padEnd(38)}scope=${String(r.scope).padEnd(13)}outcome=${r.outcome ?? '(null)'}`)
}
check('⭐ THE GATE IS SCOPED TO REPLACEMENT ONLY — a non-UPDATE is NOT-IN-SCOPE, ⛔ not DEFER',
  notUpdate.scope === REPLACEMENT_SCOPE.notInScope && notUpdate.outcome === null)
check('⭐ AN UNGOVERNED SLOT IS NOT-IN-SCOPE — ⛔ "not governed yet" is never "unknown and suspect"',
  ungoverned.scope === REPLACEMENT_SCOPE.notInScope && ungoverned.outcome === null)
check('⭐ GOVERNED + DECLARED KINDS MATCHING ⇒ ALLOW · MISMATCH ⇒ REFUSE',
  match.outcome === REPLACEMENT.allow && mismatch.outcome === REPLACEMENT.refuse)

// ⭐⭐ THE IDENTITY HALF — what relation does `checkKind` actually compare?
const bothDeclared = checkKind({ slotKind: 'preferred-name', claimKind: 'preferred-name' })
const noSlotKind = checkKind({ slotKind: null, claimKind: 'preferred-name' })
const noClaimKind = checkKind({ slotKind: 'preferred-name', claimKind: null })
const nearMiss = checkKind({ slotKind: 'preferred-name', claimKind: 'preferred name' })
console.log('')
check('⭐⭐ `checkKind` COMPARES TWO **DECLARED** KINDS — ⛔ neither side may be inferred',
  bothDeclared.outcome === KIND_OUTCOME.allow
  && noSlotKind.outcome === KIND_OUTCOME.defer && noClaimKind.outcome === KIND_OUTCOME.defer,
  `both=${bothDeclared.outcome} · noSlot=${noSlotKind.outcome} · noClaim=${noClaimKind.outcome}`)
check('⭐⭐⭐ EXACT MATCH ONLY — ⛔ a near-miss DEFERS, so no similarity can satisfy this gate',
  nearMiss.outcome === KIND_OUTCOME.defer,
  `"preferred-name" vs "preferred name" ⇒ ${nearMiss.outcome}`)

// ── ② THE SOURCE'S OWN SPLIT — the sentence the verdict turns on ──────────────────────────────────
// ⛔ A source scan, and it is anchored on a DECLARED phrase rather than a count — §0-B's rule about
// vacuous anchors. If this sentence is ever reworded, the check fails and the reading is re-derived.
// ⚠️ NORMALISE THE COMMENT BEFORE MATCHING. The first version scanned the raw file and FAILED on a
// sentence that is plainly there: the docstring wraps mid-phrase, so the file literally contains
// `*is this\n * a valid answer?*` — a ` * ` comment marker sitting inside the phrase. ⛔ Weakening the
// anchor to a shorter fragment would have been the wrong fix (§0-B: a vacuous anchor). ⇒ strip the
// leading comment markers and collapse whitespace, then match the WHOLE sentence.
const decl = src('Backend/app/components/memory-declaration-host.js')
  .replace(/^[ \t]*\*[ \t]?/gm, ' ')
  .replace(/\s+/g, ' ')
console.log('\n② THE SOURCE KEEPS TWO THINGS APART, AND SAYS SO\n')
console.log('   resolveSlotQuestion: "RETURNS TWO THINGS AND KEEPS THEM APART: the question IDENTITY')
console.log('   (`slotKind`, consumed by `checkKind` — *is this the same question?*) and the declared')
console.log('   CHECKS (consumed by `evaluate` — *is this a valid answer?*)."')
check('⭐⭐⭐ THE IDENTITY/VALIDITY SPLIT IS DECLARED IN THE SOURCE — ⛔ so the scope is not A-only',
  decl.includes('is this the same question?') && decl.includes('is this a valid answer?'),
  'both phrases present in memory-declaration-host.js')

// ── ③ ⭐⭐⭐ DO THE RESOLVER AND THE QUESTION LAYER EVER MEET? ─────────────────────────────────────
// ⭐ THE STRUCTURAL FACT THE WHOLE A-D4 QUESTION TURNS ON. If the resolver never sees the question layer,
// then 047 cannot be governing the routing decision A-D4 is about — whatever its prose implies.
const RESOLVER_FILES = [
  '../PortableComponents/Packages/Memory/cognition/memory-slot-resolver.js',
  '../PortableComponents/Packages/Memory/cognition/memory-ontology.js',
  '../PortableComponents/Packages/Memory/cognition/memory-normalize.js',
]
const QUESTION_TOKENS = ['question_id', 'questionId', 'slotKind', 'claimKind', 'question_key']
const hits = []
for (const f of RESOLVER_FILES) {
  let text = ''
  try { text = readFileSync(new URL(f, import.meta.url), 'utf8') } catch { continue }
  for (const t of QUESTION_TOKENS) if (text.includes(t)) hits.push(`${f.split('/').pop()}:${t}`)
}
console.log('\n③ ⭐⭐⭐ DOES THE RESOLVER EVER SEE THE QUESTION LAYER?\n')
console.log(`   resolver/ontology/normalize files scanned : ${RESOLVER_FILES.length}`)
console.log(`   references to the question layer          : ${hits.length ? hits.join(' · ') : 'NONE'}`)
check('⭐⭐⭐ THE RESOLVER AND THE QUESTION LAYER NEVER MEET — routing is decided without either kind',
  hits.length === 0, hits.join(' · ') || 'no question-layer token in any resolver file')

// ── ④ THE EMPIRICAL STATE — has any of this ever run on a real memory? ────────────────────────────
const [qn] = await q(`SELECT count(*)::int AS n FROM ${S}."mst_slot_questions"`)
const [sn] = await q(`SELECT count(*)::int AS all_slots, count(question_id)::int AS bound FROM ${S}."mst_slots"`)
const pinned = await q(`SELECT COALESCE(s.canonical_label,'(no slot)') AS label, count(*)::int AS n
  FROM ${S}."txn_memories" m LEFT JOIN ${S}."mst_slots" s ON s.id = m.slot_id
  WHERE m.question_id_at_admission IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`)
const HARNESS = 'build tag for this cycle'
const realPinned = pinned.filter((r) => r.label !== HARNESS).reduce((a, r) => a + r.n, 0)
console.log('\n④ HAS THE MACHINERY EVER RUN ON A REAL MEMORY?\n')
console.log(`   questions declared                  ${String(qn.n).padStart(4)}`)
console.log(`   slots bound to a question           ${String(sn.bound).padStart(4)}  of ${sn.all_slots}`)
for (const r of pinned) console.log(`   rows pinned · ${String(r.label).padEnd(26)}${String(r.n).padStart(4)}`)
console.log(`   ⭐ rows pinned on a NON-harness slot ${String(realPinned).padStart(4)}`)
check('⭐⭐ THE ADMISSION PIN HAS NEVER BEEN APPLIED TO A REAL MEMORY — only the harness canary carries it',
  realPinned === 0, `${realPinned} non-harness rows pinned`)
check('⛔ THE QUESTION LAYER IS EFFECTIVELY EMPTY — ⛔ so no behavioural precedent exists either way',
  qn.n <= 1 && sn.bound <= 1, `${qn.n} question(s) · ${sn.bound}/${sn.all_slots} slot(s) bound`)

// ── ⑤ ⚠️ THE ASYMMETRY — the gate is downstream of the routing A-D4 is about ──────────────────────
// ⚠️ OBSERVATION, ⛔ NOT A RULING. `checkKind` compares the claim's kind against THE SLOT THE RESOLVER
// ALREADY CHOSE. ⇒ a MIS-ROUTED observation carrying a matching declared kind passes the gate.
const misrouted = governsReplacement({ isUpdate: true, slotGoverned: true, slotKind: 'work-schedule', claimKind: 'work-schedule' })
console.log('\n⑤ ⚠️ THE GATE ASSUMES THE ROUTING WAS CORRECT (observation, ⛔ not a ruling)\n')
console.log('   An observation about VOLUNTEERING, routed into the `work schedule` slot by the `schedule`')
console.log(`   alias, and declaring claimKind='work-schedule', is gated as: ${misrouted.outcome}`)
console.log('   ⇒ ⭐ 047 governs whether A CLAIM MAY REPLACE A SLOT\'S ANSWER. ⛔ It never asks whether the')
console.log('     observation belonged in that slot — which is exactly the decision A-D4 is about.')
check('⚠️ a MATCHING declared kind ALLOWS the replacement regardless of whether routing was correct',
  misrouted.outcome === REPLACEMENT.allow,
  'the gate is downstream of, and conditional on, the routing decision')

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
