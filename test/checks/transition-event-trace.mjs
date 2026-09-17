// ⭐⭐⭐ TRANSITIONS AS EVENTS — what has actually occurred, and what is being compressed into one field?
//
//   node test/checks/transition-event-trace.mjs
//
// Ote, 2026-09-17: *"When a transition happens, what event has actually occurred, and which parts of that
// event are currently being compressed into the same row fields?"*
//
// ⛔⛔ READ-ONLY. ⛔ No fixes · no vocabulary · no schema · no resolver change · no 047 population · no
// Dreaming · no threshold · no alias · no membership change · no historical repair · no `invalid_at`
// reinterpretation. ⛔ `SEMANTIC_FIELDS` untouched. ⛔ A-D4 open. ⛔ THE CANARY STAYS EXACTLY AS IT IS.
//
// ── ⚠️ THE FOUR DIMENSIONS ARE ANALYTICAL, ⛔ NOT PROPOSED SCHEMA ──────────────────────────────────
// Ote: *"Don't create vocabulary for those categories yet. They're analytical dimensions for the
// investigation, not proposed schema."*
//     PROPOSITION   what the memory asserts about the world
//     OBSERVATION   the record that someone noticed it
//     ROLE          whether this row is the current answer
//     STORAGE       where it sits and whether it is retained
//
// ── ⚠️ AND THE CORRECTION OTE MADE, CARRIED HERE ───────────────────────────────────────────────────
// ⛔ DO NOT say "`invalid_at` means REPLACED" — too broad, and it would repeat the very error this arc
// exists to avoid: collapsing several different transitions into one meaning because they share a column.
// ✅ "EVERY CURRENT WRITER OF `invalid_at` IS MAKING A NON-WORLD-TRUTH CLAIM ABOUT THE MEMORY'S OR
//    OBSERVATION'S STATUS, ROLE, OR HISTORY."
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const flat = (t) => t.replace(/\s+/g, ' ')
const SVC = flat(readFileSync(new URL('../../../../PortableComponents/Packages/Memory/cognition/memory-v2-service.js', import.meta.url), 'utf8'))
const LESSON = flat(readFileSync(new URL('../../Backend/app/components/lesson-host.js', import.meta.url), 'utf8'))

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  TRANSITIONS AS EVENTS — what occurred, and what is compressed into one field')
console.log('  ⛔ read-only · ⛔ no vocabulary · ⛔ nothing reinterpreted · ⛔ canary untouched')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ── ① THE SIX `invalid_at` WRITERS, TRACED INDIVIDUALLY ──────────────────────────────────────────
// dims = [PROPOSITION, OBSERVATION, ROLE, STORAGE] — '·' = untouched, '✎' = changed, '?' = asserted but unverified
const T = [
  {
    n: 'W1 · SUPERSEDE', trigger: 'reconcileFact · resolveConflict → UPDATE',
    pre: 'primary LIVE', fields: 'OLD: invalid_at  ·  NEW row: supersedes_id at insert', post: 'old dead · new live',
    says: '"the new row supersedes the current belief (history kept via supersedes_id + invalid_at)"',
    notEstablished: 'that the old proposition is false · that old and new answer the SAME QUESTION · that the old was "current" by anything but RECENCY',
    dims: ['·', '·', '✎', '·'],
  },
  {
    n: 'W2 · COLLAPSE', trigger: 'resolveConflict → DUPLICATE, or the extras of an UPDATE',
    pre: 'extras LIVE', fields: 'invalid_at only', post: 'extras dead',
    says: '"duplicate of the live belief" · "converge the slot to ONE live row"',
    notEstablished: '⛔⛔ THAT THEY ARE DUPLICATES — ⛔ no comparison is made (P14)',
    dims: ['?', '·', '✎', '·'],
  },
  {
    n: 'W3 · IDENTITY RENAME', trigger: 'setIdentity with a new value',
    pre: 'inSlot rows LIVE', fields: 'invalid_at on the old · supersedes_id on the new', post: 'exactly one live name',
    says: '"so exactly one live row remains … `forget` cannot restore the previous name"',
    notEstablished: 'that the old name was WRONG — ⭐ the call site calls it "what she used to call me"',
    dims: ['·', '✎', '✎', '·'],
  },
  {
    n: 'W4 · CONSOLIDATION', trigger: 'a card evolves',
    pre: 'prior card LIVE · members LIVE', fields: '⭐ TWO FIELDS, TWO TARGETS: prior card → invalid_at · MEMBERS → expired_at + tier:cold',
    post: 'new card live · prior archived · members cold',
    says: '"soft-archive the evidence members so the card now represents …"',
    notEstablished: 'that the members are false or disbelieved — ⭐ they were ABSORBED, not doubted',
    dims: ['·', '✎', '✎', '✎'],
  },
  {
    n: 'W5 · LESSON REVISE', trigger: "revise({priorId, relation}) — ⭐ ONLY when relation === 'supersedes'",
    pre: 'prior lesson LIVE', fields: '⚠️ BOTH ON THE PRIOR ROW: invalid_at AND supersedes_id → the NEW id (forward)',
    post: 'prior archived',
    says: '"ONLY `supersedes` archives the prior. The other three keep it live ON PURPOSE"',
    notEstablished: 'anything about the world — ⭐ it is a change in HER OWN UNDERSTANDING',
    dims: ['·', '✎', '✎', '·'],
  },
  {
    n: 'W6 · RESTORE-WHILE-BLOCKED', trigger: 'restore({id}) when another row holds the slot',
    pre: 'row EXPIRED · invalid_at possibly NULL', fields: '⭐ THREE AT ONCE: expired_at → null · invalid_at → NOW · tier → cold',
    post: 'un-archived but NOT live',
    says: '⭐ "the row comes back as SUPERSEDED rather than live — which is the truthful state"',
    notEstablished: 'anything about the proposition — ⛔ nothing about the world changed at that instant',
    dims: ['·', '·', '✎', '✎'],
  },
]
console.log('\n① THE SIX `invalid_at` WRITERS — traced as EVENTS\n')
for (const t of T) {
  console.log(`   ── ${t.n}`)
  console.log(`      trigger        ${t.trigger}`)
  console.log(`      pre-state      ${t.pre}`)
  console.log(`      fields changed ${t.fields}`)
  console.log(`      post-state     ${t.post}`)
  console.log(`      call site SAYS ${t.says}`)
  console.log(`      ⛔ DOES NOT establish  ${t.notEstablished}`)
  console.log(`      dimensions     PROPOSITION ${t.dims[0]}   OBSERVATION ${t.dims[1]}   ROLE ${t.dims[2]}   STORAGE ${t.dims[3]}`)
  console.log('')
}
const roleAll = T.every((t) => t.dims[2] === '✎')
const propNone = T.every((t) => t.dims[0] !== '✎')
console.log('   ⇒ ⭐⭐⭐ ROLE CHANGES IN ALL SIX. ⛔ THE PROPOSITION CHANGES IN NONE.')
console.log('     ⚠️ W2 is the only one that ASSERTS something propositional ("duplicate") — and verifies nothing.')
console.log('   ⇒ ⭐ AND THEY ARE NOT ONE EVENT: W4 also moves STORAGE, W3/W4/W5 also write OBSERVATION HISTORY,')
console.log('     and W6 moves STORAGE and ROLE IN OPPOSITE DIRECTIONS IN A SINGLE PATCH —')
console.log('     un-archiving the row (storage: restored) while marking it invalid (role: denied).')
check('⭐⭐⭐ ALL SIX CHANGE ROLE; ⛔ NONE CHANGES THE PROPOSITION',
  roleAll && propNone, `role changed in ${T.filter((t) => t.dims[2] === '✎').length}/6 · proposition in 0/6`)
check('⭐⭐ THEY ARE NOT ONE EVENT — the dimension signatures differ across the six writers',
  new Set(T.map((t) => t.dims.join(''))).size > 1,
  `${new Set(T.map((t) => t.dims.join(''))).size} distinct dimension signatures across 6 writers`)

// ── ② ⭐⭐⭐ THE PROOF: `invalid_at` IS REVERSIBLE, BY AN EVENT ON A DIFFERENT ROW ────────────────
const unSupersede = SVC.includes("await store.update([prior.id], { invalid_at: null, tier: 'warm' })")
const unblocked = SVC.includes("{ expired_at: null, invalid_at: null, tier: 'warm' }")
console.log('② ⭐⭐⭐ THE CLEANEST PROOF THAT `invalid_at` TRACKS ROLE, NOT TRUTH\n')
console.log('   reviveSuperseded:  store.update([prior.id], { invalid_at: null, tier: \'warm\' })')
console.log('     ⇒ fired when THE ROW THAT DISPLACED IT IS FORGOTTEN.\n')
console.log('   ⇒ ⭐⭐⭐ A TRUTH CLAIM ABOUT A PROPOSITION CANNOT BE UNDONE BY DELETING A DIFFERENT ROW.')
console.log('     ⭐ A ROLE VACANCY CAN. ⇒ the field\'s own REVERSIBILITY — and the trigger that reverses it —')
console.log('     settle what it tracks, ⛔ without needing to read a single docstring.')
check('⭐⭐⭐ `invalid_at` IS CLEARED WHEN ANOTHER ROW IS FORGOTTEN — reversibility proves it is a ROLE marker',
  unSupersede && unblocked, 'both clearing sites present: un-supersede, and unblocked restore')

// ── ③ THE OTHER FIELDS — briefly, ⛔ not another census ──────────────────────────────────────────
const [dir] = await q(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE t.created_at > n.created_at)::int AS forward
  FROM ${S}."txn_memories" n JOIN ${S}."txn_memories" t ON t.id = n.supersedes_id`)
const [f] = await q(`SELECT count(*) FILTER (WHERE expired_at IS NOT NULL)::int AS exp,
    count(*) FILTER (WHERE contradicted_at IS NOT NULL)::int AS con FROM ${S}."txn_memories"`)
const lessonForward = LESSON.includes('SET invalid_at = now(), supersedes_id = :newId')
console.log('\n③ THE OTHER FIELDS — ⛔ counts already known, so only the EVENT shape is stated\n')
console.log(`   ${pad('field', 18)}${pad('the event it records', 50)}dimension`)
console.log('   ' + '─'.repeat(96))
console.log(`   ${pad('supersedes_id', 18)}${pad('"a row stands in a replacement line with another"', 50)}OBSERVATION HISTORY`)
console.log(`   ${pad('', 18)}${pad('⚠️ two conventions: fact=backward · lesson=FORWARD', 50)}⛔ LATENT (0 forward rows)`)
console.log(`   ${pad('expired_at', 18)}${pad('forget = "we stopped believing" · consolidation = ABSORBED', 50)}⚠️ INTENT vs STORAGE`)
console.log(`   ${pad('valid_at', 18)}${pad('set at commit — ⛔ carries no world time', 50)}STORAGE`)
console.log(`   ${pad('contradicted_at', 18)}${pad('⭐ "someone said this is wrong" — the ONLY one', 50)}⭐ PROPOSITION`)
console.log(`   ${pad('tier', 18)}${pad('hot/warm/cold — honest about itself', 50)}STORAGE`)
console.log(`\n   corpus: ${dir.forward} forward supersedes_id links of ${dir.total} · expired_at ${f.exp} · contradicted_at ${f.con}`)
check('⚠️ THE supersedes_id DIRECTION COLLISION IS LATENT — shipped in code, ⛔ absent from the corpus',
  lessonForward && dir.forward === 0, `lesson forward-write present in source · ${dir.forward} forward rows`)
check('⭐ contradicted_at IS THE ONLY PROPOSITION-DIMENSION FIELD, and it is barely used',
  f.con > 0 && f.con < 10, `${f.con} rows carry it`)

// ── ④ WHAT IS BEING COMPRESSED ───────────────────────────────────────────────────────────────────
console.log('\n④ ⭐⭐⭐ WHAT IS COMPRESSED INTO ONE FIELD\n')
console.log('   `invalid_at` currently carries, indistinguishably:')
console.log('     · a replacement of the current answer            (W1)')
console.log('     · an ASSERTED-but-unverified redundancy          (W2)')
console.log('     · a rename, kept deliberately as history         (W3)')
console.log('     · an earlier version of a summary                (W4)')
console.log('     · a change in her own understanding              (W5)')
console.log('     · ⭐ a REFUSAL to return a row to the live role   (W6)')
console.log('\n   ⇒ ⚠️ SIX EVENTS, ONE FIELD, AND NO WAY TO TELL THEM APART AFTER THE FACT — which is the same')
console.log('     shape as the nine-transition finding, now traced to its WRITERS rather than its READERS.')
console.log('   ⛔ NO VOCABULARY IS PROPOSED FOR THESE. They are listed as EVENTS, ⛔ not named as relations.')

// ── ⑤ THE ANCHOR AND THE CANARY ──────────────────────────────────────────────────────────────────
const mira = await q(`SELECT left(o.value, 48) AS old_value, left(n.value, 48) AS new_value
  FROM ${S}."txn_memories" n JOIN ${S}."txn_memories" o ON o.id = n.supersedes_id
  JOIN ${S}."mst_slots" s ON s.id = n.slot_id WHERE s.canonical_label = 'youngest sister'`)
const [c] = await q(`SELECT
    (SELECT count(*)::int FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL
       AND lower(entity)='sotera' AND lower(attribute)='lesson') AS rows,
    (SELECT count(*)::int FROM ${S}."mst_slots" WHERE lower(entity)='sotera' AND lower(canonical_label)='lesson') AS slot`)
console.log('\n⑤ THE ANCHOR — ⭐ non-current without becoming false\n')
for (const m of mira) console.log(`   "${flat(m.old_value)}" → "${flat(m.new_value)}"`)
console.log('   ⇒ ⭐ the cleanest concrete counterexample to treating replacement as world-truth invalidation.')
console.log(`\n   THE CANARY — ${c.rows} rows · slot=${c.slot}`)
check('⭐ THE MIRA ANCHOR IS INTACT — the transition is still readable in the corpus',
  mira.length === 1, `${mira.length} transition on \`youngest sister\``)
check('⛔⛔ THE CANARY IS UNTOUCHED', c.rows >= 18 && c.slot === 0, `${c.rows} rows · ${c.slot} slots`)

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
