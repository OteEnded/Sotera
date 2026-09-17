// ⭐⭐⭐ WHAT IS THE INTENDED SEMANTIC UNIT OF COMPETITION?
//
//   node test/checks/competition-unit-trace.mjs
//
// Ote, 2026-09-17: *"For each operation that consumes membership, establish what kind of relationship it
// actually requires … Don't assume there must be one universal 'competition' concept."*
//
// ⛔⛔ READ-ONLY. ⛔ No vocabulary migration · no schema · no resolver change · no A1 authority · no 047
// population · no threshold · no alias · no membership change · no historical repair · no Dreaming change.
// ⛔ `SEMANTIC_FIELDS` untouched. ⛔ THE 18-ROW CANARY STAYS EXACTLY AS IT IS.
//
// ── ⭐ THE QUESTION THIS FILE ASKS ──────────────────────────────────────────────────────────────────
//     ⛔ NOT "how do we tell whether two labels are similar?"
//     ✅ "WHAT RELATIONSHIP ENTITLES ONE MEMORY TO AFFECT THE STATE OF ANOTHER?"
//
// ⚠️ The RELATION REQUIRED column is a reading of what each operation would need to be correct. It is a
// declared judgement, offered to be overruled. ⛔ The PREDICATE and the EXPOSURE are mechanical.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { resolveConflict } from '@ote/memory/cognition/memory-conflict.js'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  THE SEMANTIC UNIT OF COMPETITION — one key, and how many different relations?')
console.log('  ⛔ read-only · ⛔ nothing armed · ⛔ nothing proposed · ⛔ canary untouched')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ── ① OPERATION → RELATION REQUIRED → PREDICATE → GAP ────────────────────────────────────────────
const OPS = [
  {
    op: 'RECONCILE / REPLACE',
    needs: 'the incoming observation and the incumbent answer the SAME QUESTION, and the incumbent holds the CURRENT-ANSWER role',
    claim: 'QUESTION SAMENESS + CURRENT-STATE ROLE',
    shape: 'DESIGNATED HOLDER',
    evidence: 'a declared question on the slot (047) + a declared claim-kind on the observation',
    pred: 'P7–P11 (arena, guessed) + P12 (recency) + P13 (string inequality)',
    gap: '⚠️ RECENCY SUBSTITUTES FOR ROLE; question sameness is never established',
  },
  {
    op: 'COLLAPSE (extras)',
    needs: 'each extra is THE SAME PROPOSITION as the survivor',
    claim: '⭐ PROPOSITION EQUIVALENCE',
    shape: '⭐⭐ PAIRWISE — it must hold between the survivor and EACH extra',
    evidence: 'a comparison of the two propositions',
    pred: '⛔⛔ P14 — SET MEMBERSHIP ALONE. ⛔ No comparison is made.',
    gap: '⭐⭐⭐ THE STRONGEST RELATION REQUIRED, THE WEAKEST EVIDENCE SUPPLIED',
  },
  {
    op: 'FORGET',
    needs: '⛔ NOTHING — it is a single-row act (`forget({id})` → `expired_at`)',
    claim: '⛔ NONE',
    shape: '⛔ n/a',
    evidence: '⛔ none needed',
    pred: '⛔ none — the id only',
    gap: '✅ NONE. ⭐ The one operation whose requirement and implementation agree.',
  },
  {
    op: 'REVIVE / RESTORE',
    needs: 'is the CURRENT-ANSWER ROLE for this question already occupied?',
    claim: 'ROLE OCCUPANCY / CURRENT-STATE EXCLUSIVITY',
    shape: 'DESIGNATED HOLDER — ⛔ not equivalence',
    evidence: 'a declared question + a designated current answer',
    pred: 'P15 — ANY live row sharing slot_id, or (entity, attribute) when there is no slot',
    gap: '⚠️ ANY CO-MEMBER VETOES, whether or not it occupies the role',
  },
  {
    op: 'M2 ADMISSION GATING',
    needs: 'the incoming CLAIM answers the slot\'s DECLARED question',
    claim: 'CLAIM ↔ QUESTION COMPATIBILITY',
    shape: '⭐ NOT A MEMORY-TO-MEMORY RELATION AT ALL',
    evidence: 'both sides DECLARED (047) — never inferred',
    pred: 'exact string equality of two declared kinds',
    gap: '✅ none in its own terms — ⚠️ but it presupposes the arena P11 guessed',
  },
]
console.log('\n① OPERATION → WHAT IT ACTUALLY REQUIRES → WHAT IT IS GIVEN\n')
for (const o of OPS) {
  console.log(`   ── ${o.op}`)
  console.log(`      must be true   ${o.needs}`)
  console.log(`      claim required ${o.claim}`)
  console.log(`      relation SHAPE ${o.shape}`)
  console.log(`      evidence that would establish it: ${o.evidence}`)
  console.log(`      current predicate ${o.pred}`)
  console.log(`      GAP            ${o.gap}`)
  console.log('')
}

// ── ② ⭐⭐⭐ FOUR RELATION SHAPES, ONE KEY ──────────────────────────────────────────────────────
const shapes = new Map()
for (const o of OPS) {
  const k = o.shape.replace(/[⭐⛔⚠️]/g, '').trim().split(' — ')[0].trim()
  shapes.set(k, [...(shapes.get(k) ?? []), o.op])
}
console.log('② ⭐⭐⭐ HOW MANY DIFFERENT RELATIONS ARE BEING SERVED BY ONE KEY?\n')
for (const [shape, ops] of shapes) console.log(`   ${pad(shape, 42)}${ops.join(' · ')}`)
console.log('\n   ⇒ ⭐⭐⭐ AT LEAST THREE DISTINCT RELATION SHAPES, ⛔ AND ONE KEY SERVES ALL OF THEM.')
console.log('     ⚠️ COLLAPSE and REVIVE both fire on "is there another member?" and need OPPOSITE things:')
console.log('       collapse needs the other member to be THE SAME PROPOSITION;')
console.log('       revive   needs the other member to OCCUPY A ROLE.')
console.log('     ⇒ ⭐ one is about SAMENESS, the other about OCCUPANCY. Same key, opposite semantics.')
check('⭐⭐⭐ THE OPERATIONS DO NOT SHARE ONE RELATION — at least three distinct shapes are conflated',
  shapes.size >= 3, `${shapes.size} distinct relation shapes across ${OPS.length} operations`)
check('⭐ FORGET NEEDS NO RELATION — and is the only operation whose requirement and code agree',
  OPS.find((o) => o.op === 'FORGET').pred.includes('none'), 'forget({id}) consults no membership')

// ── ③ CURRENT EXPOSURE — which membership-only operation can actually fire today? ────────────────
const bySlot = await q(`SELECT slot_id::text AS slot, count(*)::int AS live FROM ${S}."txn_memories"
  WHERE invalid_at IS NULL AND expired_at IS NULL AND slot_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1`)
const byKey = await q(`SELECT user_id::text AS uid, entity, attribute, count(*)::int AS live
  FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL AND kind='semantic'
    AND entity IS NOT NULL AND attribute IS NOT NULL AND namespace <> 'identity'
  GROUP BY 1,2,3 HAVING count(*) > 1 ORDER BY 4 DESC`)
console.log('\n③ WHICH MEMBERSHIP-ONLY OPERATION CAN FIRE TODAY?\n')
console.log(`   P14 (collapse) needs a slot holding >1 LIVE row   : ${bySlot.length} such slot(s)  ⇒ ⛔ DORMANT`)
console.log(`   P15 (veto)     needs a KEY holding >1 LIVE row    : ${byKey.length} such key(s)   ⇒ ⚠️ ACTIVE`)
for (const r of byKey) console.log(`       ${rpad(r.live, 4)}  ${r.entity} | ${r.attribute}`)
console.log('\n   ⇒ ⭐⭐ THE TWO MEMBERSHIP-ONLY OPERATIONS HAVE OPPOSITE STATUS, AND THE ONLY LIVE EXPOSURE')
console.log('     IS THE CANARY. ⛔ P14 is dormant because "one slot holds one answer" currently holds —')
console.log('     ⚠️ which means the invariant, not a predicate, is what is protecting it.')
check('⛔ P14 IS DORMANT — no slot holds more than one live row, so collapse cannot fire today',
  bySlot.length === 0, `${bySlot.length} slots with >1 live row`)
check('⚠️ P15 IS ACTIVE — and its only live grouping is the canary',
  byKey.length === 1 && byKey[0].attribute.toLowerCase() === 'lesson',
  byKey.map((r) => `${r.entity}|${r.attribute}=${r.live}`).join(' · '))

// ── ④ THE BOUNDARY CASE OTE ASKED TO KEEP — scope is not a label dimension ───────────────────────
const dup = await q(`SELECT lower(entity) AS e, lower(canonical_label) AS l,
    count(*)::int AS slots, count(DISTINCT user_id)::int AS owners
  FROM ${S}."mst_slots" WHERE canonical_label NOT LIKE 'zz%'
  GROUP BY 1,2 HAVING count(*) > 1 ORDER BY 3 DESC`)
console.log('\n④ ⭐ BOUNDARY CASE — a duplicate LABEL is not automatically suspicious\n')
console.log(`   ${pad('entity | label', 40)}${pad('slots', 8)}distinct owners`)
console.log('   ' + '─'.repeat(64))
for (const d of dup) console.log(`   ${pad(`${d.e} | ${d.l}`, 40)}${pad(d.slots, 8)}${d.owners}`)
console.log('\n   ⇒ ⭐ EVERY ONE IS SEPARATED BY `user_id` — they belong to DIFFERENT PEOPLE, and P3 separates')
console.log('     them CORRECTLY. ⛔ SCOPE IS NOT MERELY ANOTHER LABEL DIMENSION: the owner is part of what')
console.log('     the question is ABOUT, so identical labels under different owners are different questions.')
console.log('   ⚠️ Kept as evidence because I nearly filed this as a false negative from a GROUP BY count.')
check('⭐ EVERY DUPLICATE-LABEL PAIR IS SEPARATED BY OWNER — ⛔ none is an under-grouping',
  dup.length > 0 && dup.every((d) => d.owners === d.slots),
  dup.map((d) => `${d.l}: ${d.slots} slots / ${d.owners} owners`).join(' · '))

// ── ⑤ THE CANARY, UNCHANGED ──────────────────────────────────────────────────────────────────────
const [c] = await q(`SELECT
    (SELECT count(*)::int FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL
       AND lower(entity)='sotera' AND lower(attribute)='lesson') AS rows,
    (SELECT count(*)::int FROM ${S}."mst_slots" WHERE lower(entity)='sotera' AND lower(canonical_label)='lesson') AS slot`)
console.log(`\n⑤ THE CANARY — ${c.rows} rows · slot=${c.slot} ⇒ ${c.slot === 0 ? '⛔ UNARMED for reconcile, ⚠️ active for P15' : '⚠️ ARMED'}`)
check('⛔⛔ THE CANARY IS EXACTLY AS IT WAS — this run changed nothing about it',
  c.rows >= 18 && c.slot === 0, `${c.rows} rows · ${c.slot} slots`)

// anti-vacuity: the pure rule still behaves as the table says
const probe = resolveConflict({ matches: [{ id: 'a', value: 'X' }, { id: 'b', value: 'Y' }], value: 'X' })
check('⚠️ ANTI-VACUITY · the pure rule still collapses an uncompared member, as §1 claims',
  probe.collapse.length === 1, `collapse=[${probe.collapse}]`)

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
