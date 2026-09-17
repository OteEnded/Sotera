// ⭐⭐⭐ WHAT MAKES TWO MEMORIES LEGITIMATE COMPETITORS FOR REPLACEMENT?
//
//   node test/checks/competition-membership-census.mjs
//
// Ote, 2026-09-17: *"Trace resolveConflict and the construction of `matches` and establish the exact
// predicates that make two memories compete. For each predicate, identify whether it represents identity,
// question compatibility, proposition equivalence, current-state exclusivity, storage grouping, or merely
// implementation convenience."*
//
// ⛔⛔ READ-ONLY. ⛔ No resolver · no threshold · no alias · no membership change · no slot binding · no
// historical repair · no 047 population · no `contradicted_at` backfill · no relation vocabulary · no
// Dreaming change · no change to the lesson system. ⛔ A-D4 untouched.
// ⛔ THE `sotera | lesson` COLLISION STAYS UNARMED — no alias, no slot, no row movement, no declaration.
//
// ── ⭐ THE WORDING THIS FILE USES, per Ote's ruling ─────────────────────────────────────────────────
// ⛔ NOT "Slot membership is semantic."
// ✅ "Slot membership is classified as placement/index state, but it currently controls replacement
//    competition." ⇒ D1's classification is internally consistent; the TENSION is that placement state
//    controls a semantic consequence.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { resolveConflict, CONFLICT } from '@ote/memory/cognition/memory-conflict.js'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  COMPETITION MEMBERSHIP — the exact predicates that make two memories compete')
console.log('  ⛔ read-only · ⛔ nothing armed · ⛔ nothing repaired · ⛔ A-D4 untouched')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ── ① THE PREDICATE CHAIN ─────────────────────────────────────────────────────────────────────────
// ⚠️ The CLASSIFICATION column is a judgement, declared here. The PREDICATE and its SITE are mechanical.
const PREDICATES = [
  ['P1', "kind = 'semantic'", 'store.findOwnLive', 'STORAGE GROUPING', 'admits the candidate pool at all'],
  ['P2', 'invalid_at IS NULL AND expired_at IS NULL', 'store LIVE const', '⭐ CURRENT-STATE EXCLUSIVITY', 'only live rows may compete'],
  ['P3', 'persona + user_id scope', 'store', 'IDENTITY (of the owner)', 'scopes the corpus'],
  ['P4', 'entity && attribute are present', 'reconcileFact filter', 'IMPLEMENTATION CONVENIENCE', 'a row without them cannot be keyed'],
  ['P5', "namespace <> 'identity'", 'reconcileFact filter', 'STORAGE GROUPING (lane)', 'the Identity lane never competes here'],
  ['P6', 'resolveOwner(entity)', 'canonLive', 'IDENTITY', 'folds owner aliases together'],
  ['P7', 'row.slot_id', 'buildSlotView ①', '⚠️ STORAGE GROUPING (D1 calls it placement)', '⭐ explicit membership'],
  ['P8', 'norm(entity)|norm(attribute) == slot label', 'claimedBy', '⛔ LABEL equivalence, ⛔ NOT proposition', 'claims a slotless row'],
  ['P9', 'norm(entity)|norm(alias.phrase)', 'claimedBy', 'LEARNED equivalence (A3-governed)', 'claims via a taught phrase'],
  ['P10', 'ephemeral key entity|norm(attribute)', 'buildSlotView ③', 'IMPLEMENTATION CONVENIENCE', 'a synthetic group, no real slot'],
  ['P11', 'resolution.slotId', 'resolver', 'IDENTITY CLAIM BY SIMILARITY', '⭐ selects WHICH set is the arena'],
  ['P12', 'matches[0]  (newest-first)', 'resolveConflict', '⚠️ RECENCY — ⛔ not semantics at all', '⭐ decides WHO gets the value test'],
  ['P13', 'norm(primary.value) === norm(value)', 'reconcilePlan', '⭐ PROPOSITION EQUIVALENCE', 'noop/duplicate vs update'],
  ['P14', 'matches.slice(1) → extras', 'resolveConflict', '⛔⛔ NONE — MEMBERSHIP ALONE', '⭐⭐⭐ collapsed UNCONDITIONALLY'],
]
console.log('\n① THE PREDICATE CHAIN — what each one contributes\n')
console.log(`   ${pad('', 5)}${pad('predicate', 42)}${pad('site', 22)}${pad('what it represents', 42)}effect`)
console.log('   ' + '─'.repeat(150))
for (const [id, p, site, cls, eff] of PREDICATES) {
  console.log(`   ${pad(id, 5)}${pad(p, 42)}${pad(site, 22)}${pad(cls, 42)}${eff}`)
}
console.log('\n   ⛔ `content` DOES NOT APPEAR. It is never read by the conflict path — ⇒ ⭐ WHAT A MEMORY')
console.log('     ACTUALLY SAYS PLAYS NO PART IN DECIDING WHETHER IT IS REPLACED, unless it is in `value`.')

// ── ② ⭐⭐⭐ P14 — THE PREDICATE THAT IS NOT A PREDICATE ──────────────────────────────────────────
// ⭐ PURE DEMONSTRATION. `resolveConflict` has no store and no IO; the plan is computed and DISCARDED.
console.log('\n② ⭐⭐⭐ NON-PRIMARY MEMBERS ARE COLLAPSED WITHOUT EVER BEING COMPARED\n')
console.log('   resolveConflict, both branches:')
console.log('     noop   → plan(DUPLICATE, { target: primary.id, reinforce: true, collapse: extras })')
console.log('     update → plan(UPDATE,    { target: primary.id, supersedes: primary.id, collapse: extras })')
console.log('   ⇒ ⭐ `collapse: extras` is in BOTH. Only `matches[0]` is ever value-tested.\n')

// three DISTINCT propositions; the incoming value equals only the first
const synthetic = [{ id: 'aaaaaaaa', value: 'X' }, { id: 'bbbbbbbb', value: 'Y' }, { id: 'cccccccc', value: 'Z' }]
const noopPlan = resolveConflict({ matches: synthetic, value: 'X' })
const updPlan = resolveConflict({ matches: synthetic, value: 'W' })
console.log(`   matches = [X, Y, Z]  (three DIFFERENT propositions)`)
console.log(`     incoming "X" → action=${noopPlan.action} · collapse=[${noopPlan.collapse.map((i) => i.slice(0, 2)).join(',')}]  ⚠️ Y and Z invalidated, never compared`)
console.log(`     incoming "W" → action=${updPlan.action} · supersedes=${String(updPlan.supersedes).slice(0, 2)} · collapse=[${updPlan.collapse.map((i) => i.slice(0, 2)).join(',')}]`)
console.log('\n   ⇒ ⭐⭐⭐ COMPETITION MEMBERSHIP ALONE IS SUFFICIENT FOR INVALIDATION.')
console.log('     Proposition equivalence (P13) is evaluated EXACTLY ONCE, against the NEWEST row.')
console.log('     ⚠️ The source calls the others *"duplicates that slipped in — a race, or an older')
console.log('     double-writer"*. ⇒ ⭐ EXTRAS ARE ASSUMED TO BE DUPLICATES BY CONSTRUCTION, and')
console.log('     membership is what makes a row an extra. ⛔ Membership does not establish duplication.')
check('⭐⭐⭐ EXTRAS COLLAPSE IN BOTH BRANCHES — distinct propositions are invalidated uncompared',
  noopPlan.collapse.length === 2 && updPlan.collapse.length === 2
  && noopPlan.action === CONFLICT.DUPLICATE && updPlan.action === CONFLICT.UPDATE,
  `noop-branch collapse=${noopPlan.collapse.length} · update-branch collapse=${updPlan.collapse.length}`)
check('⭐⭐ ONLY matches[0] IS VALUE-TESTED — P12 is RECENCY, and it decides who gets P13',
  resolveConflict({ matches: [{ id: 'q', value: 'W' }, { id: 'r', value: 'X' }], value: 'X' }).action === CONFLICT.UPDATE,
  'a row whose value EQUALS the incoming one is superseded because it is not newest')

// ── ③ THE EXPOSURE IN THE LIVE CORPUS ────────────────────────────────────────────────────────────
const [ex] = await q(`SELECT count(*)::int AS candidates,
    count(*) FILTER (WHERE value IS NULL OR btrim(value)='')::int AS empty_value,
    count(*) FILTER (WHERE (value IS NULL OR btrim(value)='') AND content IS NOT NULL AND btrim(content)<>'')::int AS empty_but_content
  FROM ${S}."txn_memories"
  WHERE invalid_at IS NULL AND expired_at IS NULL AND kind='semantic'
    AND entity IS NOT NULL AND attribute IS NOT NULL AND namespace <> 'identity'`)
console.log('\n③ THE EXPOSURE IN THE LIVE CORPUS\n')
console.log(`   live reconcile candidates                      ${rpad(ex.candidates, 5)}`)
console.log(`   with an EMPTY \`value\`                          ${rpad(ex.empty_value, 5)}`)
console.log(`   ⭐ …whose \`content\` IS populated                ${rpad(ex.empty_but_content, 5)}   invisible to P13`)
console.log('\n   ⇒ ⚠️ for those rows P13 compares \'\' against \'\' — so two DIFFERENT propositions read as the')
console.log('     SAME ANSWER, and the rest of their group is collapsed by P14 without being read at all.')
check('⚠️ EVERY EMPTY-VALUE CANDIDATE CARRIES CONTENT — ⛔ none is genuinely blank',
  ex.empty_value === ex.empty_but_content && ex.empty_value > 0,
  `${ex.empty_but_content} of ${ex.empty_value} empty-value rows have content`)

// ── ④ THE CANARY — preserved, ⛔ and still unarmed ────────────────────────────────────────────────
const lessons = await q(`SELECT id::text, content, value FROM ${S}."txn_memories"
  WHERE invalid_at IS NULL AND expired_at IS NULL AND slot_id IS NULL
    AND lower(entity)='sotera' AND lower(attribute)='lesson'`)
const [slotForKey] = await q(`SELECT count(*)::int AS n FROM ${S}."mst_slots"
  WHERE lower(entity)='sotera' AND lower(canonical_label)='lesson'`)
const [aliasForKey] = await q(`SELECT count(*)::int AS n FROM ${S}."mst_slots" s
  WHERE lower(s.entity)='sotera' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(s.aliases,'[]'::jsonb)) a
    WHERE lower(a->>'phrase') = 'lesson')`)
const distinct = new Set(lessons.map((l) => String(l.content).trim().toLowerCase())).size
console.log('\n④ THE 18-LESSON CANARY — ⛔ preserved, unarmed, untested\n')
console.log(`   live rows under \`sotera | lesson\`   ${rpad(lessons.length, 4)}`)
console.log(`   distinct \`content\` among them       ${rpad(distinct, 4)}   ⭐ distinct propositions`)
console.log(`   rows with an empty \`value\`          ${rpad(lessons.filter((l) => l.value == null || !String(l.value).trim()).length, 4)}   ⚠️ what P13 would read`)
console.log(`   a slot exists under that key?       ${slotForKey.n === 0 ? '⛔ NO — UNARMED' : `⚠️ YES (${slotForKey.n})`}`)
console.log(`   an alias "lesson" on a sotera slot? ${aliasForKey.n === 0 ? '⛔ NO — UNARMED' : `⚠️ YES (${aliasForKey.n})`}`)
check('⭐⭐ THE CANARY IS INTACT — the rows still exist and are still distinct propositions',
  lessons.length >= 18 && distinct === lessons.length, `${lessons.length} rows · ${distinct} distinct content`)
check('⛔⛔ THE CANARY IS STILL UNARMED — no slot and no alias under that key, and this run made none',
  slotForKey.n === 0 && aliasForKey.n === 0, `slots=${slotForKey.n} · aliases=${aliasForKey.n}`)

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
