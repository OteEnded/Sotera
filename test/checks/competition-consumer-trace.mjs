// ⭐⭐⭐ DECISION ② · WHAT MAKES TWO OBSERVATIONS LEGITIMATE COMPETITORS?
//
//   node test/checks/competition-consumer-trace.mjs
//
// Ote, 2026-09-17: *"Is membership merely an index used after semantic identity has already been
// established, or is membership itself making a semantic claim? Don't assume either answer."*
//
// ⛔⛔ READ-ONLY. ⛔ No implementation · no vocabulary · no schema · no A1 authority · no 047 change ·
// no canary activation · no repair of the two armed collisions · no threshold · no similarity work.
// ⛔ ① REMAINS SEMANTICALLY UNRESOLVED BY DESIGN. ⛔ ③–⑦ frozen.
//
// ── ⭐ THE TWO DISTINCTIONS THAT MUST SURVIVE THIS PASS ─────────────────────────────────────────────
//     same membership ≠ same proposition      (the 18-row canary)
//     same proposition ≠ same retrieval object (retrieval never consults slot_id)
//
// ── ⚠️ CARRIED FORWARD FROM ① AS CONSTRAINTS, ⛔ NOT AS CONCLUSIONS ────────────────────────────────
//   · "replacement" is ⛔ NOT established as a natural semantic category
//   · proposition-level change caused 1 of 9; ⭐ ARENA ASSIGNMENT ALONE caused 2, with NO semantic change
//   · `lexical 1.000` is confidence IN THE MATCHING MECHANISM, ⛔ not that two observations answer the
//     same question — ⭐ established EVIDENCE, ⛔ not a proposed fix
import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  DECISION ② · the competition consumers — one key, how many loads?')
console.log('  ⛔ read-only · ⛔ no implementation · ⛔ no vocabulary · ⛔ canary untouched')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ── ① THE FIVE CONSUMERS ─────────────────────────────────────────────────────────────────────────
// ⚠️ `asserts`, `needs`, `about`, `proxy`, `ifWrong` are DECLARED readings. The evidence/discard columns
// are traced from the shipped call sites.
const CONSUMERS = [
  {
    n: 'REPLACE / current holder', shape: 'DESIGNATED HOLDER',
    asserts: '"the incumbent and the incoming answer the SAME QUESTION, and the incumbent currently holds the answer"',
    about: 'QUESTION IDENTITY + ROLE OCCUPANCY',
    has: 'a lexical / alias / cosine match on a PHRASE, plus row ordering',
    proxy: '⚠️ RECENCY stands in for "holds the role"; ⚠️ PHRASE MATCH stands in for "same question"',
    atSeam: 'the arm, the confidence, the MATCHED PHRASE, and both full values',
    discarded: 'all of it except the outcome — the arm and phrase survive only in a free-text `reason`',
    ifWrong: '⛔ A TRUE OBSERVATION IS INVALIDATED BY AN UNRELATED ONE — demonstrated twice (#8, #9)',
    ifMissing: '✅ SAFE — `matches` is empty ⇒ NEW. ⭐ The one consumer that can ABSTAIN.',
  },
  {
    n: 'REVIVE / restore', shape: 'DESIGNATED HOLDER',
    asserts: '"this arena already has a live holder"',
    about: 'ROLE OCCUPANCY — ⛔ not equivalence',
    has: 'slot_id, or ⭐ the (entity, attribute) FALLBACK when there is none',
    proxy: '⚠️ ANY co-member stands in for "the holder of the role"',
    atSeam: 'the identity of the holder — ⭐ `findLiveInSlot` returns ROWS precisely so it can NAME it',
    discarded: '⚠️ the holder id IS kept (`relatedId` on the revive audit) — ⭐ the one place a co-member is named',
    ifWrong: '⚠️ A RESTORATION IS REFUSED, or a row returns SUPERSEDED rather than live. ⛔ Withholds, ⛔ does not destroy.',
    ifMissing: '⛔ CANNOT BE MISSING — the phrase fallback always yields an arena. ⛔ NO ABSTENTION EXISTS.',
  },
  {
    n: 'COLLAPSE (extras)', shape: '⭐⭐ PAIRWISE',
    asserts: '"each extra is THE SAME PROPOSITION as the survivor"',
    about: 'PROPOSITION EQUIVALENCE',
    has: '⛔⛔ NOTHING. Membership, and not being `matches[0]`.',
    proxy: '⛔ THE WHOLE RELATION IS A PROXY — set membership stands in for pairwise equivalence',
    atSeam: 'both values are in hand and ⛔ never compared',
    discarded: '⛔ the extras\' values are never read at all',
    ifWrong: '⛔⛔ DISTINCT PROPOSITIONS ARE INVALIDATED UNCOMPARED — the canary would collapse 17 of 18',
    ifMissing: '✅ SAFE — no extras ⇒ nothing collapses',
  },
  {
    n: 'M2 ADMISSION GATING', shape: 'CLAIM ↔ QUESTION',
    asserts: '⭐ NOTHING about the other rows — it scopes to a slot and then asks a SEPARATELY DECLARED question',
    about: 'QUESTION IDENTITY — ⛔ and it is DECLARED on both sides, never inferred',
    has: '⭐ REAL EVIDENCE: `slotKind` from a bind act, `claimKind` from the writer, EXACT match',
    proxy: '⛔ NONE — ⭐ the only consumer that supplies its own evidence',
    atSeam: 'the declared kinds, the checks, the occasions',
    discarded: '⭐ the ALLOW earns `question_id_at_admission` — ⭐ the one consumer that PERSISTS its reason',
    ifWrong: '⚠️ the pin is wrong — ⛔ but it REFUSES NO WRITE, so nothing is destroyed',
    ifMissing: '✅ SAFE — NOT-IN-SCOPE, ⛔ deliberately not DEFER',
  },
  {
    n: '⛔ FORGET (kept separate)', shape: '⛔ NONE',
    asserts: '⛔ nothing — `forget({id})` is a single-row act',
    about: '⛔ n/a',
    has: '⛔ n/a', proxy: '⛔ n/a', atSeam: 'the id', discarded: '⛔ n/a',
    ifWrong: '⛔ n/a — ⚠️ membership enters only through its CONSEQUENCE, `reviveSuperseded`',
    ifMissing: '⛔ n/a',
  },
]

console.log('\n① THE FIVE CONSUMERS — ⛔ traced separately, ⛔ not assumed to share a relation\n')
for (const c of CONSUMERS) {
  console.log(`   ── ${c.n}    [${c.shape}]`)
  console.log(`      membership ASSERTS   ${c.asserts}`)
  console.log(`      the relation is about ${c.about}`)
  console.log(`      evidence it HAS      ${c.has}`)
  console.log(`      evidence that is a PROXY  ${c.proxy}`)
  console.log(`      known at the seam    ${c.atSeam}`)
  console.log(`      discarded after      ${c.discarded}`)
  console.log(`      if membership is WRONG   ${c.ifWrong}`)
  console.log(`      if membership is MISSING ${c.ifMissing}`)
  console.log('')
}

// ── ② ⭐⭐⭐ THE ANSWER TO OTE'S QUESTION ─────────────────────────────────────────────────────────
console.log('② ⭐⭐⭐ INDEX, OR SEMANTIC CLAIM?\n')
console.log('   Ordered by the STRENGTH each consumer requires of the SAME key:\n')
const LOAD = [
  ['M2 ADMISSION', 'nothing — it SCOPES, then asks its own declared question', '⭐ used as an INDEX'],
  ['REVIVE', '"this arena has a holder"', 'a ROLE claim'],
  ['REPLACE', '"these answer the same question"', 'a QUESTION-IDENTITY claim'],
  ['COLLAPSE', '"these are the same proposition"', '⭐ a PROPOSITION claim'],
]
console.log(`   ${pad('consumer', 18)}${pad('what it needs the key to mean', 56)}read as`)
console.log('   ' + '─'.repeat(100))
for (const [c, needs, read] of LOAD) console.log(`   ${pad(c, 18)}${pad(needs, 56)}${read}`)
console.log('\n   ⇒ ⭐⭐⭐ THE EVIDENCE SUPPLIED BY MEMBERSHIP IS **CONSTANT**. THE SEMANTIC WEIGHT PLACED ON IT')
console.log('     **VARIES BY CONSUMER** — and it increases down that list while the evidence does not change.')
console.log('\n   ⇒ ⭐⭐ SO THE ANSWER IS NEITHER, UNIFORMLY:')
console.log('     · membership behaves as an **INDEX** exactly where the consumer supplies its OWN evidence (M2);')
console.log('     · membership behaves as a **CLAIM** exactly where the consumer supplies NONE (collapse).')
console.log('   ⇒ ⛔ THAT IS NOT A PROPERTY OF MEMBERSHIP. IT IS A PROPERTY OF EACH CONSUMER.')
console.log('\n   ⇒ ⭐⭐⭐ "COMPETITION MEMBERSHIP" IS **NOT ONE SEMANTIC CONCEPT**. It is ONE OPERATIONAL KEY')
console.log('     BEARING FOUR DIFFERENT LOADS — and only one consumer pays for what it takes.')

// ── ③ THE ABSTENTION ASYMMETRY — mechanical ──────────────────────────────────────────────────────
console.log('\n③ ⭐⭐ CAN MEMBERSHIP BE WITHHELD? — three different answers\n')
console.log('   the INCOMING observation   ✅ YES — `memory-slot-resolver` returns `{ slotId: null }` on a miss')
console.log('                              ⇒ `matches` empty ⇒ NEW ⇒ ⭐ no competition. AN ABSTENTION EXISTS.')
console.log('   an EXISTING live row       ⛔ NO — `buildSlotView` synthesises an EPHEMERAL arena keyed')
console.log('                              `entity|attribute` for every slotless row. ⇒ ⭐ EVERY LIVE ROW IS')
console.log('                              ALWAYS IN SOME ARENA, whether one was ever established or not.')
console.log('   REVIVE / restore           ⛔ NO — the (entity, attribute) fallback always yields an arena.')
console.log('\n   ⇒ ⭐⭐⭐ THE SYSTEM MAY DECLINE TO PLACE AN **INCOMING** OBSERVATION, BUT NEVER DECLINES TO')
console.log('     PLACE AN **EXISTING** ONE. ⇒ every live row is permanently a potential competitor, in an')
console.log('     arena keyed by its own attribute string — ⛔ including rows no resolver ever examined.')

// corpus: how many live rows sit in an arena nobody established?
const [eph] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_memories"
  WHERE invalid_at IS NULL AND expired_at IS NULL AND kind='semantic' AND slot_id IS NULL
    AND entity IS NOT NULL AND attribute IS NOT NULL AND namespace <> 'identity'`)
const [tot] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_memories"
  WHERE invalid_at IS NULL AND expired_at IS NULL AND kind='semantic'
    AND entity IS NOT NULL AND attribute IS NOT NULL AND namespace <> 'identity'`)
console.log(`\n   live candidates in an EPHEMERAL arena (no slot ever established): ${eph.n} of ${tot.n}`)
check('⭐⭐ THE ABSTENTION IS ASYMMETRIC — the incoming may be unplaced, an existing row never is',
  eph.n > 0, `${eph.n} of ${tot.n} live candidates sit in an arena nobody established`)

// ── ④ DO ANY TWO CONSUMERS SHARE A RELATION? ─────────────────────────────────────────────────────
const shapes = new Map()
for (const c of CONSUMERS) shapes.set(c.shape, [...(shapes.get(c.shape) ?? []), c.n])
console.log('\n④ DO ANY TWO CONSUMERS REQUIRE THE SAME RELATION?\n')
for (const [s, ns] of shapes) console.log(`   ${pad(s, 24)}${ns.join(' · ')}`)
console.log('\n   ⚠️ REPLACE and REVIVE share a SHAPE but ⛔ NOT a relation: replace needs "the same question",')
console.log('     revive needs "the role is occupied". ⇒ ⭐ same shape, different claim.')
console.log('   ⇒ ⭐⭐ NO TWO CONSUMERS REQUIRE THE SAME RELATION. ⛔ Four consumers, four relations, one key.')
check('⭐⭐⭐ NO TWO CONSUMERS REQUIRE THE SAME RELATION',
  new Set(CONSUMERS.map((c) => c.about)).size === CONSUMERS.length,
  `${new Set(CONSUMERS.map((c) => c.about)).size} distinct relations across ${CONSUMERS.length} consumers`)
check('⭐ ONLY ONE CONSUMER SUPPLIES ITS OWN EVIDENCE — M2, and it is the only one that persists its reason',
  CONSUMERS.filter((c) => c.proxy.includes('NONE')).length === 1,
  CONSUMERS.filter((c) => c.proxy.includes('NONE')).map((c) => c.n).join(', '))

// ── ⑤ THE TWO DISTINCTIONS, AND THE FIXTURES ────────────────────────────────────────────────────
const [c5] = await q(`SELECT
    (SELECT count(*)::int FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL
       AND lower(entity)='sotera' AND lower(attribute)='lesson') AS canary,
    (SELECT count(*)::int FROM ${S}."mst_slots" WHERE lower(entity)='sotera' AND lower(canonical_label)='lesson') AS canary_slot,
    (SELECT count(*)::int FROM ${S}."mst_slots" s WHERE s.canonical_label='work schedule'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(s.aliases,'[]'::jsonb)) a
                   WHERE a->>'phrase' IN ('schedule','volunteer_schedule_and_location'))) AS armed`)
console.log('\n⑤ THE DISTINCTIONS AND THE FIXTURES\n')
console.log(`   same membership ≠ same proposition   ⭐ the canary: ${c5.canary} rows, slot=${c5.canary_slot}`)
console.log('   same proposition ≠ same retrieval object   ⭐ retrieval never consults slot_id')
console.log(`   the two armed collisions             ${c5.armed > 0 ? '⚠️ STILL ARMED (as intended)' : '⛔ MISSING'}`)
check('⛔⛔ THE CANARY IS UNTOUCHED', c5.canary >= 18 && c5.canary_slot === 0, `${c5.canary} rows · ${c5.canary_slot} slots`)
check('⛔⛔ THE TWO ARMED COLLISIONS ARE STILL ARMED — ⛔ observational fixtures, not repaired',
  c5.armed > 0, `work-schedule slot still carries the collision aliases`)

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
