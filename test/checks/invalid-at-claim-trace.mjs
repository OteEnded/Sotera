// ⭐⭐⭐ DECISION ④ · WHAT CLAIM IS A WRITER MAKING WHEN IT SETS `invalid_at`?
//
//   node test/checks/invalid-at-claim-trace.mjs
//
// Ote, 2026-09-17: *"Is there actually a common semantic claim across those six writers? If not, say so."*
//
// ⛔⛔ READ-ONLY. ⛔ No implementation · no schema · no historical repair · no canary activation ·
// 047 untouched · A1 shadow. ⛔ AND ⛔ NO JUMP TO "`invalid_at` SHOULD BE X".
//
// ── ⚠️ THE THREE RULINGS ARE LOCKED AND BIND THIS PASS ─────────────────────────────────────────────
//   ① ⏸ unresolved by design — its findings are CONSTRAINTS. "Replacement" is ⛔ not a natural category.
//   ② ✅ RULED — membership is NOT one semantic relation; each consumer must establish what it needs.
//   ③ ✅ RULED **BROAD** — observation→question must follow 047's DECLARED-ONLY authority.
//        ⇒ ⭐ a storage/routing key CANNOT manufacture semantic question identity.
//        ⚠️ AND "not declared" must remain DISTINGUISHABLE from "incorrectly inferred".
// ⇒ ⭐ QUESTION is therefore a FIRST-CLASS DIMENSION in this pass — it was not in the earlier ones.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)
// ⚠️ DEFECT #22 — #14 RECURRING IN A NEW FILE. Collapsing whitespace is NOT enough: a comment that wraps
// mid-sentence leaves its `//` (or ` * `) marker INSIDE the phrase, so a whole-sentence anchor cannot match
// a sentence that is plainly there. ⛔ The wrong fix is to shorten the anchor — that makes it vacuous.
// ⇒ strip line-leading comment markers FIRST, then collapse. ⭐ The anchor stays a whole sentence.
const flat = (t) => t.replace(/^[ \t]*(?:\/\/|\*)[ \t]?/gm, ' ').replace(/\s+/g, ' ')
const SVC = flat(readFileSync(new URL('../../../../PortableComponents/Packages/Memory/cognition/memory-v2-service.js', import.meta.url), 'utf8'))
const LESSON = flat(readFileSync(new URL('../../Backend/app/components/lesson-host.js', import.meta.url), 'utf8'))

// dims: PROPOSITION · OBSERVATION · QUESTION · ROLE · STORAGE
// '·' no claim · '✎' changed · '?' ASSERTED BUT NOT ESTABLISHED · '+' one was added
const W = [
  {
    id: 'W1', n: 'SUPERSEDE', knows: 'both values · the arm · the confidence · the matched phrase',
    asserts: '"a newer answer replaced this one"',
    dims: { prop: '·', obs: '+', question: '?', role: '✎', storage: '·' },
    notEstablished: 'that the old is false · ⭐ THAT BOTH ANSWER THE SAME QUESTION (③: may not be inferred)',
    reversible: '✅ YES — `reviveSuperseded` clears it when the DISPLACING row is forgotten. ONE link, deliberately.',
    describing: 'THE ROW\'S ROLE — ⛔ not the memory, ⛔ not its storage',
  },
  {
    id: 'W2', n: 'COLLAPSE', knows: 'both values — ⛔ and reads neither',
    asserts: '"redundant with the live row"',
    dims: { prop: '?', obs: '·', question: '?', role: '✎', storage: '·' },
    notEstablished: '⛔⛔ THAT THEY ARE REDUNDANT — no comparison is made (P14) · ⭐ and that they share a question',
    reversible: '⛔⛔ NO — ⭐ DELIBERATELY: *"`plan.collapse` duplicates are deliberately NOT revived — they were removed for being REDUNDANT, not for being WRONG."*',
    describing: 'THE ROW\'S ROLE — under an ⛔ unverified redundancy claim',
  },
  {
    id: 'W3', n: 'IDENTITY RENAME', knows: 'the old name and the new one',
    asserts: '"this is what she used to call me"',
    dims: { prop: '·', obs: '✎', question: '·', role: '✎', storage: '·' },
    notEstablished: 'that the old name was WRONG — ⭐ the call site frames it as HISTORY',
    reversible: '✅ YES — the new row carries `supersedes_id: prior?.id`; ⭐ restoring the previous name was the POINT of the fix',
    describing: 'THE OBSERVATION\'S PLACE IN A HISTORY, and the role',
  },
  {
    id: 'W4', n: 'CONSOLIDATION', knows: 'the prior card, the members, the new summary',
    asserts: '"this card has a newer version"',
    dims: { prop: '·', obs: '✎', question: '·', role: '✎', storage: '✎' },
    notEstablished: 'that the members are false — ⭐ they were ABSORBED (`expired_at` + cold), ⛔ not doubted',
    reversible: '✅ YES — the new card carries `supersedes_id: prior?.id`',
    describing: 'A VERSION LINEAGE — ⚠️ and it moves STORAGE for a DIFFERENT set of rows in the same act',
  },
  {
    id: 'W5', n: 'LESSON REVISE', knows: '⭐ THE RELATION, because SHE DECLARED IT (1 of 4)',
    asserts: '"this is an earlier understanding"',
    dims: { prop: '·', obs: '✎', question: '·', role: '✎', storage: '·' },
    notEstablished: 'anything about the world — ⭐ and ⛔ NO question claim at all: `lesson-host` never enters the slot layer',
    reversible: '⛔ NOT BY THE STANDARD PATH — ⚠️ the pointer is on the PRIOR row pointing FORWARD, so forgetting the new lesson finds no `supersedes_id` to follow. ⛔ LATENT (0 rows).',
    describing: 'A CHANGE OF MIND — ⭐ the only writer whose relation was CHOSEN by an actor',
  },
  {
    id: 'W6', n: 'RESTORE-WHILE-BLOCKED', knows: '⭐ THE HOLDER\'S IDENTITY — `findLiveInSlot` returns rows so it can name it',
    asserts: '"something else holds this arena"',
    dims: { prop: '·', obs: '·', question: '·', role: '✎', storage: '✎' },
    notEstablished: 'anything about the proposition — ⛔ nothing about the world changed at that instant',
    reversible: '✅ YES — ⭐ explicitly: *"keeps it eligible for the ordinary un-supersede path later if the holder is itself removed."*',
    describing: '⭐⭐ ARENA OCCUPANCY — and it moves STORAGE and ROLE IN OPPOSITE DIRECTIONS IN ONE PATCH',
  },
]

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  DECISION ④ · what claim does a writer make when it sets `invalid_at`?')
console.log('  ⛔ read-only · ⛔ no answer proposed · ⛔ ①②③ locked · ⛔ canary untouched')
console.log('════════════════════════════════════════════════════════════════════════════════════')

console.log('\n① THE SIX WRITERS — five dimensions each\n')
for (const w of W) {
  console.log(`   ── ${w.id} · ${w.n}`)
  console.log(`      knows              ${w.knows}`)
  console.log(`      asserts            ${w.asserts}`)
  console.log(`      dimensions         PROPOSITION ${w.dims.prop}   OBSERVATION ${w.dims.obs}   QUESTION ${w.dims.question}   ROLE ${w.dims.role}   STORAGE ${w.dims.storage}`)
  console.log(`      ⛔ does NOT establish  ${w.notEstablished}`)
  console.log(`      reversible?        ${w.reversible}`)
  console.log(`      it describes       ${w.describing}`)
  console.log('')
}
console.log('   legend  · no claim   ✎ changed   ? ASSERTED BUT NOT ESTABLISHED   + one was added')

// ── ② IS THERE A COMMON CLAIM? — the dimension test ─────────────────────────────────────────────
const sigs = new Set(W.map((w) => `${w.dims.prop}${w.dims.obs}${w.dims.question}${w.dims.role}${w.dims.storage}`))
const roleAll = W.every((w) => w.dims.role === '✎')
const propNone = W.every((w) => w.dims.prop !== '✎')
console.log('\n② IS THERE A COMMON SEMANTIC CLAIM ACROSS THE SIX?\n')
console.log(`   distinct dimension signatures : ${sigs.size} of ${W.length}`)
console.log(`   ROLE changed in all six?       ${roleAll ? 'YES' : 'no'}`)
console.log(`   PROPOSITION changed in any?    ${propNone ? '⛔ NO — not one' : 'yes'}`)
console.log('\n   ⇒ ⭐ THE ONLY THING ALL SIX SHARE IS: **THE ROW CEASES TO HOLD A ROLE.**')
console.log('     ⛔ AND THAT IS NOT A SEMANTIC CLAIM ABOUT THE MEMORY — it is a statement about the')
console.log('     SYSTEM\'S OWN ARRANGEMENT. ⚠️ Everything the six DISAGREE about is the semantics.')
check('⭐⭐ ROLE CHANGES IN ALL SIX; ⛔ THE PROPOSITION IN NONE', roleAll && propNone,
  `${sigs.size} distinct signatures across ${W.length} writers`)
check('⭐⭐⭐ THE SIX DO NOT SHARE ONE CLAIM — their dimension signatures differ',
  sigs.size > 1, `${sigs.size} distinct signatures`)

// ── ③ ⭐⭐⭐ THE PROOF: THE SYSTEM'S OWN REVERSAL RULES ALREADY SEPARATE THEM ────────────────────
const notRevived = SVC.includes('`plan.collapse` duplicates are deliberately NOT revived — they were removed for being redundant, not for being wrong.')
const cardSupersedes = SVC.includes('supersedes_id: prior?.id ?? null, evidence,')
const lessonForward = LESSON.includes('SET invalid_at = now(), supersedes_id = :newId')
const stillEligible = SVC.includes('keeps it eligible for the ordinary un-supersede path later if the holder is itself removed')
const rev = W.filter((w) => w.reversible.startsWith('✅')).length
console.log('\n③ ⭐⭐⭐ THE DECISIVE PROOF — THE REVERSAL RULES ALREADY DISTINGUISH THEM\n')
console.log(`   reversible by the ordinary un-supersede path : ${rev} of ${W.length}   (W1 W3 W4 W6)`)
console.log('   ⛔ NOT reversible — and for TWO DIFFERENT REASONS:')
console.log('     W2 COLLAPSE  ⭐ DELIBERATE. The source states the distinction in its own words:')
console.log('                  *"they were removed for being REDUNDANT, not for being WRONG."*')
console.log('     W5 LESSON    ⚠️ ACCIDENTAL AND LATENT — the forward-pointing `supersedes_id` means the')
console.log('                  revival path has nothing to follow. ⛔ 0 rows; a mechanism, not an event.')
console.log('\n   ⇒ ⭐⭐⭐ THE SAME FIELD IS **DELIBERATELY REVERSIBLE** FOR SOME WRITERS AND **DELIBERATELY')
console.log('     IRREVERSIBLE** FOR ANOTHER — ⭐ AND THE SOURCE NAMES WHY: *redundant* ≠ *wrong*.')
console.log('   ⇒ ⚠️ SO THE SYSTEM **ALREADY TREATS THESE AS DIFFERENT CLAIMS.** It simply STORES THEM')
console.log('     IDENTICALLY. ⭐ The distinction lives in the REVERSAL RULE, ⛔ not in the field.')
check('⭐⭐⭐ COLLAPSE IS DELIBERATELY IRREVERSIBLE, AND THE SOURCE NAMES THE DISTINCTION',
  notRevived, '"removed for being redundant, not for being wrong"')
check('⭐ FOUR WRITERS ARE REVERSIBLE BY THE SAME PATH — ⛔ so reversibility is not uniform either',
  rev === 4 && cardSupersedes && stillEligible, `${rev} reversible · card carries supersedes_id · restore stays eligible`)
check('⚠️ W5\'s IRREVERSIBILITY IS LATENT — the forward pointer exists in code, ⛔ 0 rows in the corpus',
  lessonForward, 'lesson-host sets supersedes_id on the PRIOR row')

// ── ④ ⭐⭐ WHAT ③ ADDS: TWO WRITERS MAKE AN UNDECLARED QUESTION CLAIM ───────────────────────────
const asserted = W.filter((w) => w.dims.question === '?')
const noQuestion = W.filter((w) => w.dims.question === '·')
console.log('\n④ ⭐⭐ UNDER ③ (BROAD) — WHICH WRITERS MAKE A QUESTION CLAIM?\n')
console.log(`   ⚠️ ASSERT a question relation WITHOUT DECLARING IT : ${asserted.map((w) => w.id).join(' ')}   (${asserted.length})`)
console.log(`   ⛔ make NO question claim at all                    : ${noQuestion.map((w) => w.id).join(' ')}   (${noQuestion.length})`)
console.log('\n   ⇒ ⭐⭐⭐ ③ RULED THAT observation→question MUST BE DECLARED. ⇒ W1 AND W2 SET `invalid_at`')
console.log('     ON THE STRENGTH OF A QUESTION RELATION THAT ③ SAYS MAY NOT BE INFERRED.')
console.log('   ⚠️ AND THE OTHER FOUR MAKE NO QUESTION CLAIM AT ALL — W5 does not even enter the slot layer.')
console.log('   ⇒ ⛔ SO `invalid_at` IS NOT EVEN UNIFORM ABOUT WHETHER A QUESTION IS INVOLVED.')
check('⭐⭐ ONLY TWO OF SIX MAKE A QUESTION CLAIM — and both make it UNDECLARED',
  asserted.length === 2 && noQuestion.length === 4,
  `${asserted.length} asserted-undeclared · ${noQuestion.length} none`)

// ── ⑤ THE MIRA TENSION, RESTATED PRECISELY ──────────────────────────────────────────────────────
const mira = await q(`SELECT left(o.value, 50) AS old_value, left(n.value, 50) AS new_value, o.invalid_at
  FROM ${S}."txn_memories" n JOIN ${S}."txn_memories" o ON o.id = n.supersedes_id
  JOIN ${S}."mst_slots" s ON s.id = n.slot_id WHERE s.canonical_label = 'youngest sister'`)
console.log('\n⑤ THE TENSION, RESTATED\n')
for (const m of mira) {
  console.log(`   "${flat(m.old_value)}"  →  "${flat(m.new_value)}"`)
  console.log(`   the displaced row carries invalid_at = ${m.invalid_at ? 'SET' : 'null'}`)
}
console.log('\n   ⭐ "TRUE, BUT NO LONGER CURRENT" (W1) and "REDUNDANT, NOT WRONG" (W2) and "SOMETHING ELSE')
console.log('     HOLDS THE ARENA" (W6) ARE THREE DIFFERENT STATEMENTS — ⛔ AND THEY ARE STORED IDENTICALLY.')
console.log('   ⇒ ⭐⭐⭐ THE ANSWER TO OTE\'S QUESTION: **THERE IS NO COMMON SEMANTIC CLAIM.**')
console.log('     The only shared content is *"this row no longer holds a role"* — ⛔ which is a fact about')
console.log('     THE SYSTEM\'S ARRANGEMENT, ⛔ not a claim about the memory.')
console.log('   ⛔ NO POSITIVE DEFINITION IS PROPOSED. ⛔ Nothing is reinterpreted.')

// ── ⑥ FIXTURES ──────────────────────────────────────────────────────────────────────────────────
const [fx] = await q(`SELECT
    (SELECT count(*)::int FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL
       AND lower(entity)='sotera' AND lower(attribute)='lesson') AS canary,
    (SELECT count(*)::int FROM ${S}."mst_slots" WHERE lower(entity)='sotera' AND lower(canonical_label)='lesson') AS canary_slot,
    (SELECT count(*)::int FROM ${S}."mst_slot_questions") AS questions`)
console.log(`\n⑥ FIXTURES — canary ${fx.canary} rows / slot=${fx.canary_slot} · declared questions ${fx.questions}`)
check('⛔⛔ CANARY UNTOUCHED AND 047 UNTOUCHED',
  fx.canary >= 18 && fx.canary_slot === 0 && fx.questions === 1,
  `canary ${fx.canary}/${fx.canary_slot} · questions ${fx.questions}`)
check('⚠️ ANTI-VACUITY · the Mira transition is still readable', mira.length === 1)

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
