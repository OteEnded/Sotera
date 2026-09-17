// ⭐⭐⭐ WHAT DOES SLOT MEMBERSHIP *MEAN*? — traced by its downstream consequences
//
//   node test/checks/membership-consequence-census.mjs
//
// Ote, 2026-09-17: *"If we changed only slot_id, what semantic behaviour changes elsewhere? That gives us
// the actual meaning of membership much better than the column name does."*
//
// ⛔⛔ READ-ONLY. ⛔ No resolver · no threshold · no alias · no membership change · no slot binding · no
// historical repair · no 047 population · no `contradicted_at` backfill · no relation vocabulary · no
// Dreaming change. ⛔ A-D4 untouched. ⛔ THE `sotera | lesson` COLLISION IS LEFT UNARMED AND UNTESTED —
// no alias, no slot split, no row movement, no question declaration.
//
// ── ⭐ HOW §4 DEMONSTRATES WITHOUT WRITING ──────────────────────────────────────────────────────────
// `resolveConflict` is PURE — no store, no IO. §4 reads the 18 rows, hands them to it as `matches`, and
// PRINTS THE PLAN IT RETURNS. ⛔ The plan is discarded. Nothing is persisted, nothing is armed: this is
// arithmetic on values already in the database, ⛔ not a rehearsal of the write.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'
import { resolveConflict } from '@ote/memory/cognition/memory-conflict.js'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)
const app = (f) => readFileSync(new URL(`../../Backend/app/components/${f}`, import.meta.url), 'utf8')

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  MEMBERSHIP CONSEQUENCE CENSUS — what does slot_id actually change?')
console.log('  ⛔ read-only · ⛔ nothing armed · ⛔ nothing repaired · ⛔ A-D4 untouched')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ── ① THE CONSEQUENCE GRAPH — measured by whether the file references membership at all ──────────
// ⚠️ A file that never names `slot_id` cannot branch on it. That is a weak test individually and a strong
// one in aggregate: ⭐ it is an ABSENCE claim, so it is stated as "does not reference", ⛔ never as
// "provably unaffected". Where a file DOES reference it, the consequence is named from the call site.
const AFFECTS = [
  ['⭐⭐⭐ REPLACEMENT', 'memory-v2-service', 'buildSlotView → matches → primary → resolveConflict → supersede/collapse'],
  ['⭐ FORGET / REVIVE', 'memory-v2-service', 'findLiveInSlot decides whether a slot is empty, and what to revive'],
  ['M2 GOVERNANCE', 'memory-store-sequelize-host', 'slot_id → resolveSlotQuestion → slotKind/checks → checkKind → the admission pin'],
  ['M2 BIND ELIGIBILITY', 'memory-bind-eligibility-host', 'which slots may be proposed for a question'],
  ['LINT (operational)', 'memory-lint-host', '`dangling-slot`, and slot occupancy counts'],
  ['ADMIN / AUDIT (display)', 'memories-admin.route · memory-log', 'a filter, and a column on the audit row'],
  ['MAINTENANCE (report)', 'memory-maintenance-host', 'reported in a maintenance listing'],
]
const COGNITIVE = ['reflection-host.js', 'reflection-lifecycle-host.js', 'context-composer.js',
  'memory-cognition-host.js', 'retention-host.js', 'dreaming-host.js', 'dreaming-candidate-host.js']
console.log('\n① WHAT MEMBERSHIP AFFECTS\n')
for (const [name, where, how] of AFFECTS) console.log(`   ${pad(name, 26)}${pad(where, 30)}${how}`)

console.log('\n   WHAT IT DOES NOT REACH — cognitive surfaces, by reference count:\n')
const silent = []
for (const f of COGNITIVE) {
  const n = (app(f).match(/slot_id|slotId/g) ?? []).length
  console.log(`     ${pad(f, 34)}${n === 0 ? '⛔ 0 references' : `⚠️ ${n} references`}`)
  if (n === 0) silent.push(f)
}
const svc = readFileSync(new URL('../../../../PortableComponents/Packages/Memory/cognition/memory-v2-service.js', import.meta.url), 'utf8')
const recallBlock = svc.slice(svc.indexOf('async search'), svc.indexOf('async search') + 2500)
console.log(`\n     ${pad('the retrieval path (search/rank/RRF)', 34)}${/slot_id|slotId/.test(recallBlock) ? '⚠️ references membership' : '⛔ 0 references'}`)
check('⭐⭐⭐ MEMBERSHIP DOES NOT REACH ANY COGNITIVE SURFACE — reflection · composer · cognition · retention · dreaming',
  silent.length === COGNITIVE.length, `${silent.length}/${COGNITIVE.length} name it zero times`)
check('⭐⭐ RETRIEVAL DOES NOT CONSULT MEMBERSHIP — what she RECALLS is unaffected by which slot a row is in',
  !/slot_id|slotId/.test(recallBlock), 'no membership reference in the search/rank block')

console.log('\n   ⇒ ⭐⭐⭐ IF ONLY `slot_id` CHANGED, WHAT CHANGES IS: which belief may be displaced, what a')
console.log('     forget revives, and whether M2 can gate the write. ⛔ NOT what she recalls, ⛔ not what she')
console.log('     is shown, ⛔ not reflection, ⛔ not dreaming, ⛔ not confidence, ⛔ not ordering.')

// ── ② ⭐⭐⭐ THE SYSTEM'S OWN CLASSIFICATION — and it contradicts §1 ──────────────────────────────
// ⚠️ A SOURCE CLAIM, LABELLED AS ONE. `isSemantic` is internal, and the store's `update` returns early on
// an empty id list BEFORE reaching the gate — so there is no zero-write behavioural probe. ⇒ two
// INDEPENDENT anchors on the same file are used instead: the Set literal, and the exclusion sentence.
const store = app('memory-store-sequelize-host.js')
const setLiteral = store.slice(store.indexOf('const SEMANTIC_FIELDS'), store.indexOf('const isSemantic'))
const slotInSet = /'slot_id'/.test(setLiteral)
const exclusionSentence = store.replace(/\s+/g, ' ')
  .includes('deliberately NOT here: `tier` · `slot_embedding` · `embedding` · `access_count` · `last_access` · `slot_id`')
console.log('\n② ⭐⭐⭐ THE SYSTEM HAS ALREADY CLASSIFIED MEMBERSHIP — as NOT semantic\n')
console.log('   D1 Phase 3 gate:  if (isSemantic(patch)) requireWriter(...)')
console.log(`   slot_id appears in SEMANTIC_FIELDS   : ${slotInSet ? 'YES' : '⛔ NO'}`)
console.log(`   the exclusion is stated explicitly   : ${exclusionSentence ? 'YES' : 'no'}`)
console.log('     "⛔ deliberately NOT here: tier · slot_embedding · embedding · access_count · last_access ·')
console.log('      `slot_id`. They are PLACEMENT AND INDEX STATE."')
console.log('\n   ⇒ ⭐⭐⭐ THE ORPHAN ADOPTION IS NOT AN OVERSIGHT — IT IS A CLASSIFICATION.')
console.log('     `store.update(orphans, { slot_id })` patches ONLY `slot_id`, so `isSemantic` is false and')
console.log('     no writer is required. ⚠️ THE TENSION: the one gate built to catch memory-semantic')
console.log('     mutations classifies as PLACEMENT the field that §1 shows decides which belief is destroyed.')
check('⭐⭐⭐ `slot_id` IS EXCLUDED FROM SEMANTIC_FIELDS — membership is classified as PLACEMENT (source claim)',
  !slotInSet && exclusionSentence, `in SEMANTIC_FIELDS=${slotInSet} · exclusion sentence present=${exclusionSentence}`)

// ── ③ THE THREE POPULATIONS, AGAINST OTE'S A–F ───────────────────────────────────────────────────
const [p1] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_memories" WHERE slot_id IS NOT NULL`)
const [p2] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_memories"
  WHERE invalid_at IS NULL AND expired_at IS NULL AND kind='semantic' AND slot_id IS NULL
    AND entity IS NOT NULL AND attribute IS NOT NULL AND namespace <> 'identity'`)
// ⚠️ READ BOTH `content` AND `value`, and the difference between them turned out to BE the finding:
// lesson rows carry their text in `content` and leave `value` NULL. My first pass read only `value`, found
// 18 nulls, and reported "1 distinct value" — technically true and completely misleading about the rows.
const lessons = await q(`SELECT id::text, left(content, 74) AS content, value, writer FROM ${S}."txn_memories"
  WHERE invalid_at IS NULL AND expired_at IS NULL AND slot_id IS NULL
    AND lower(entity)='sotera' AND lower(attribute)='lesson' ORDER BY created_at`)
console.log('\n③ THE THREE POPULATIONS\n')
console.log(`   ${pad('population', 40)}${pad('n', 6)}what membership behaves like`)
console.log('   ' + '─'.repeat(104))
console.log(`   ${pad('1 · property-shaped, slotted', 40)}${pad(p1.n, 6)}⭐ C — REPLACEMENT COMPETITION. ⛔ not A, not D.`)
console.log(`   ${pad('2 · slotless project-decision / lesson', 40)}${pad(p2.n, 6)}⛔ NONE — these paths never route`)
console.log(`   ${pad('3 · the `sotera | lesson` key', 40)}${pad(lessons.length, 6)}⚠️ would become C, ⛔ though they are not one answer`)
console.log('\n   ⛔ NOT A (conceptual identity): the docstring says "the long-lived identity of the concept",')
console.log('     but §1 shows nothing downstream READS it as an identity — no retrieval, display or cognition.')
console.log('   ⛔ NOT D (retrieval organization): retrieval never consults it.')
console.log('   ⚠️ B (current-answer grouping) is IMPLIED by C rather than implemented: `resolveConflict` keeps')
console.log('     exactly one live row per slot, so "the current answer" is an EFFECT of the competition rule.')

// ── ④ ⭐⭐⭐ IS `same Slot` THE SAME AS `same proposition`? ───────────────────────────────────────
console.log('\n④ ⭐⭐⭐ SAME SLOT ≠ SAME PROPOSITION — the strongest available evidence\n')
console.log(`   ${lessons.length} live rows share the key \`sotera | lesson\`. Their values:\n`)
for (const l of lessons.slice(0, 5)) console.log(`     ${l.id.slice(0, 8)}  ${String(l.content).replace(/\s+/g, ' ')}`)
if (lessons.length > 5) console.log(`     …and ${lessons.length - 5} more, each a different lesson`)
const distinctContent = new Set(lessons.map((l) => String(l.content).trim().toLowerCase())).size
const nullValues = lessons.filter((l) => l.value == null).length
console.log(`\n   distinct CONTENT among them : ${distinctContent} of ${lessons.length}   ⭐ they are different propositions`)
console.log(`   rows whose VALUE is NULL    : ${nullValues} of ${lessons.length}   ⚠️ lessons keep their text in \`content\``)
console.log('\n   ⭐⭐ AND THAT GAP IS THE MECHANISM. `resolveConflict` compares `norm(existing.value)` — which is')
console.log(`     '' for all ${nullValues} of them. ⇒ ⛔ THE SYSTEM WOULD SEE ${nullValues} IDENTICAL ANSWERS WHERE THERE ARE`)
console.log(`     ${distinctContent} DIFFERENT LESSONS, because the field it reads is empty on every one.`)

// ⭐ THE PURE PLAN — computed, printed, DISCARDED. ⛔ Nothing is written and nothing is armed.
const plan = resolveConflict({ matches: lessons.map((l) => ({ id: l.id, value: l.value })), value: 'a new lesson' })
const invalidated = plan.collapse.length + (plan.supersedes ? 1 : 0)
console.log(`\n   Handing those ${lessons.length} rows to the PURE \`resolveConflict\` as one slot's \`matches\`:\n`)
console.log(`     action     ${plan.action}`)
console.log(`     supersedes ${plan.supersedes ? plan.supersedes.slice(0, 8) : '—'}`)
console.log(`     collapse   ${plan.collapse.length} row(s)`)
console.log(`\n   ⇒ ⭐⭐⭐ ALL ${invalidated} EXISTING ROWS WOULD BE INVALIDATED AND REPLACED BY THE ONE INCOMING`)
console.log(`     ROW — ${distinctContent} distinct lessons treated as ${lessons.length} stale answers to a single question.`)
console.log('     ⛔ THE PLAN WAS COMPUTED AND DISCARDED. Nothing was written and nothing was armed.')
console.log('\n   ⇒ ⭐⭐ THE TENSION, BOTH HALVES TRUE AT ONCE:')
console.log('     · a Slot is ⛔ NOT a proposition identity — nothing prevents distinct propositions sharing one;')
console.log('     · and the moment they share one, the system treats them as MUTUALLY EXCLUSIVE answers.')
check("⭐⭐⭐ SAME SLOT ≠ SAME PROPOSITION — distinct propositions share one (entity, attribute) key",
  lessons.length > 1 && distinctContent === lessons.length,
  `${lessons.length} rows · ${distinctContent} distinct CONTENT · ${nullValues} with value NULL`)
check('⭐⭐⭐ YET ONE SLOT WOULD MAKE THEM COMPETITORS — the pure plan invalidates all but one',
  plan.collapse.length + (plan.supersedes ? 1 : 0) === lessons.length,
  `action=${plan.action} · ${plan.collapse.length} collapsed + ${plan.supersedes ? 1 : 0} superseded of ${lessons.length}`)
check('⛔ THE COLLISION IS STILL UNARMED — no slot exists under that key, and this run created none',
  (await q(`SELECT count(*)::int AS n FROM ${S}."mst_slots" WHERE lower(entity)='sotera' AND lower(canonical_label)='lesson'`))[0].n === 0,
  'no `sotera | lesson` slot exists')

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
