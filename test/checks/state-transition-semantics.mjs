// ⭐⭐⭐ WHEN THE SYSTEM CHANGES A ROW'S STATE, WHAT FACT IS IT ACTUALLY CLAIMING?
//
//   node test/checks/state-transition-semantics.mjs
//
// Ote, 2026-09-17: *"What does SUPERSEDED actually mean? INVALID? EXPIRED? … Are these states describing
// the truth of the proposition, the history of an observation, the current role of a row, or merely
// storage lifecycle?"*
//
// ⛔⛔ READ-ONLY. ⛔ No fixes · no new vocabulary · no schema · no resolver change · no 047 population ·
// no Dreaming · no threshold · no alias · no membership change · no historical repair.
// ⛔ `SEMANTIC_FIELDS` untouched. ⛔ THE CANARY STAYS EXACTLY AS IT IS.
//
// ── ⛔ THE TRAP THIS FILE MUST NOT FALL INTO ────────────────────────────────────────────────────────
// Ote: *"I don't want this investigation to accidentally turn implementation states into semantic
// relations."* ⇒ ⭐ below, a STATE is described by WHO SETS IT and WHAT THEY MEANT. ⛔ No relation is
// named, no vocabulary is proposed, and the nine-transition corpus is re-read WITHOUT being re-classified.
//
// ── THE WORDING, CORRECTED BY OTE AND ADOPTED ───────────────────────────────────────────────────────
// ⛔ NOT "membership is an authorization boundary for state transitions."
// ✅ "IN THE CURRENT IMPLEMENTATION, membership is an INPUT that authorizes or vetoes certain state
//    transitions." ⇒ keeps the observation separate from whether membership SHOULD have that authority.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)
const flat = (t) => t.replace(/\s+/g, ' ')
const SVC = flat(readFileSync(new URL('../../../../PortableComponents/Packages/Memory/cognition/memory-v2-service.js', import.meta.url), 'utf8'))
const STORE = flat(readFileSync(new URL('../../Backend/app/components/memory-store-sequelize-host.js', import.meta.url), 'utf8'))

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  STATE-TRANSITION SEMANTICS — what does each state actually claim?')
console.log('  ⛔ read-only · ⛔ no vocabulary proposed · ⛔ nothing reclassified · ⛔ canary untouched')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ── ① WHO SETS `invalid_at`, AND WHAT DID THEY MEAN BY IT? ───────────────────────────────────────
// ⚠️ "what the writer meant" is read from the call site's own words. ⛔ No relation is invented.
const WRITERS = [
  ['supersede', 'reconcileFact · stale[0]', 'a newer answer replaced this', 'CURRENT ROLE'],
  ['collapse / duplicate', 'reconcileFact · plan.collapse', '⚠️ "redundant with the live row" — ⛔ never verified', 'CURRENT ROLE, asserted as TRUTH'],
  ['identity rename', 'setIdentity · inSlot', '"what she used to call me"', 'OBSERVATION HISTORY'],
  ['consolidation', 'card evolve · prior', 'an earlier version of this card', 'OBSERVATION HISTORY'],
  ['lesson revise', "lesson-host · relation='supersedes'", 'an earlier understanding', 'OBSERVATION HISTORY'],
  ['⭐ restore-while-blocked', 'restore · patch', '⭐ "something else holds the slot"', '⭐⭐ CURRENT ROLE, explicitly'],
]
console.log('\n① `invalid_at` — DECLARED as "superseded/expired IN THE WORLD (null = still valid)"\n')
console.log(`   ${pad('set by', 26)}${pad('site', 32)}${pad('what the call site says it means', 46)}category`)
console.log('   ' + '─'.repeat(146))
for (const [w, site, meant, cat] of WRITERS) console.log(`   ${pad(w, 26)}${pad(site, 32)}${pad(meant, 46)}${cat}`)

// ⭐ THE DECISIVE ONE, anchored on the whole normalised expression rather than a fragment.
const restoreBlocked = SVC.includes('{ expired_at: null, invalid_at: row.invalid_at ?? new Date(now()), tier: \'cold\' }')
console.log('\n   ⭐⭐⭐ THE DECISIVE WRITER — `restore`, when the slot is already held:')
console.log("     patch = blockedBy ? { expired_at: null, invalid_at: row.invalid_at ?? new Date(now()), tier: 'cold' }")
console.log('   ⇒ a row FORGOTTEN WHILE LIVE has `invalid_at` NULL. Restoring it into an occupied slot sets')
console.log('     `invalid_at` TO THE RESTORE TIMESTAMP. ⛔ Nothing about the world changed at that moment.')
console.log('   ⇒ ⭐⭐⭐ IN THAT PATH `invalid_at` LITERALLY RECORDS *"the moment we decided not to make it live"*.')
check('⭐⭐⭐ `restore` SETS `invalid_at` TO NOW ON A BLOCKED ROW — a ROLE claim, ⛔ not a world claim',
  restoreBlocked, 'the blocked-restore patch is present in memory-v2-service')

// ── ② ⭐⭐ THE DESIGN ALREADY SEPARATES "WRONG" FROM "REPLACED" ──────────────────────────────────
const twoThings = STORE.includes('It does NOT set `invalid_at`. "Somebody said this is wrong" and "this was replaced" are two')
console.log('\n② ⭐⭐ THE DESIGN ALREADY KNOWS THE DISTINCTION — and puts `invalid_at` on one side of it\n')
console.log('   markContradicted: "⛔ It does NOT set `invalid_at`. \'Somebody said this is wrong\' and')
console.log('                      \'this was replaced\' are two [different things]."')
const [cc] = await q(`SELECT count(*)::int AS n,
    count(*) FILTER (WHERE contradicted_at IS NOT NULL)::int AS contradicted,
    count(*) FILTER (WHERE contradicted_at IS NOT NULL AND invalid_at IS NOT NULL)::int AS both
  FROM ${S}."txn_memories"`)
console.log(`\n   rows carrying contradicted_at : ${cc.contradicted} of ${cc.n}   (also invalid: ${cc.both})`)
console.log('\n   ⇒ ⭐ THE SYSTEM HAS A FIELD FOR "THIS PROPOSITION IS DISPUTED" AND KEEPS IT SEPARATE.')
console.log('     ⇒ ⛔ `invalid_at` MEANS **REPLACED**. It is the model docstring — "expired IN THE WORLD" —')
console.log('     that overreaches, ⛔ not the writers. Every one of the six is making a ROLE or HISTORY')
console.log('     claim; ⛔ not one of them is claiming the proposition became false.')
check('⭐⭐ THE "WRONG vs REPLACED" SEPARATION IS DECLARED IN THE SOURCE',
  twoThings, 'markContradicted explicitly refuses to set invalid_at')

// ── ③ `supersedes_id` — TWO INCOMPATIBLE CONVENTIONS IN SHIPPED CODE ─────────────────────────────
const [dir] = await q(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE t.created_at < n.created_at)::int AS backward,
    count(*) FILTER (WHERE t.created_at > n.created_at)::int AS forward
  FROM ${S}."txn_memories" n JOIN ${S}."txn_memories" t ON t.id = n.supersedes_id`)
console.log('\n③ `supersedes_id` — DECLARED as "this row revises that one"\n')
console.log('   FACT path    create({ supersedes_id: plan.supersedes })        ⇒ the NEW row points BACK')
console.log('   LESSON path  UPDATE … SET supersedes_id = :newId WHERE id = :priorId')
console.log('                                                                  ⇒ ⚠️ the PRIOR row points FORWARD')
console.log(`\n   in the corpus: ${dir.backward} backward · ${dir.forward} forward · ${dir.total} total`)
console.log('\n   ⇒ ⭐⭐ ONE COLUMN, TWO INCOMPATIBLE READINGS: "the row I replaced" and "the row that replaced me".')
console.log(`   ⛔ AND THE COLLISION IS **LATENT, NOT MANIFEST** — ${dir.forward} forward links exist, so the`)
console.log('     lesson `revise` path has never run with that relation. ⚠️ Reported as latent, ⛔ not as a defect.')
check('⭐⭐ `supersedes_id` HAS TWO CONVENTIONS — and only the backward one has ever been exercised',
  dir.backward === dir.total && dir.forward === 0, `${dir.backward} backward · ${dir.forward} forward`)

// ── ④ `expired_at` — TWO MEANINGS ────────────────────────────────────────────────────────────────
const [ex] = await q(`SELECT count(*) FILTER (WHERE expired_at IS NOT NULL)::int AS n FROM ${S}."txn_memories"`)
console.log('\n④ `expired_at` — DECLARED as "when the SYSTEM stopped believing it"\n')
console.log(`   ${pad('set by', 26)}${pad('what it means there', 52)}category`)
console.log('   ' + '─'.repeat(104))
console.log(`   ${pad('forget', 26)}${pad('a deliberate archive — "we stopped believing this"', 52)}INTENT + STORAGE`)
console.log(`   ${pad('consolidation members', 26)}${pad('"soft-archive the evidence" — absorbed into a card', 52)}⚠️ ABSORPTION, not disbelief`)
console.log(`\n   rows carrying expired_at: ${ex.n}`)
console.log('   ⇒ ⚠️ TWO DIFFERENT ACTS SHARE ONE COLUMN: a person deleting a belief, and a summariser')
console.log('     absorbing evidence into a card. ⛔ Only the first matches the declared meaning.')

// ── ⑤ THE NINE TRANSITIONS, RE-READ — ⛔ NOT RE-CLASSIFIED ───────────────────────────────────────
// ⚠️ NO relation vocabulary is applied here. The question is narrower and purely factual:
//    for each transition, what did the STATE CHANGE claim, and is that claim true of the proposition?
const nine = await q(`SELECT s.canonical_label AS label, left(o.value, 52) AS old_value, left(n.value, 52) AS new_value
  FROM ${S}."txn_memories" n JOIN ${S}."txn_memories" o ON o.id = n.supersedes_id
  JOIN ${S}."mst_slots" s ON s.id = n.slot_id
  WHERE n.supersedes_id IS NOT NULL AND s.canonical_label NOT LIKE 'zz%'
    AND s.canonical_label <> 'build tag for this cycle' ORDER BY n.created_at`)
console.log('\n⑤ THE NINE TRANSITIONS — what the STATE CHANGE claimed\n')
console.log('   Every one set `invalid_at` on the displaced row. By the model docstring that reads:')
console.log('     ⇒ "this proposition expired IN THE WORLD."\n')
console.log('   ⚠️ The clearest counter-example, and it is the ONE genuine world change in the corpus:')
const mira = nine.find((r) => r.label === 'youngest sister')
if (mira) {
  console.log(`     "${flat(mira.old_value)}"`)
  console.log(`        → "${flat(mira.new_value)}"`)
  console.log('     ⇒ ⭐ the displaced row was NEVER FALSE. Mira DID train as a paramedic in Chiang Mai.')
  console.log('       It stopped being the CURRENT answer. ⛔ `invalid_at` claims the stronger thing.')
}
console.log('\n   ⇒ ⭐⭐⭐ THE STATE CHANGE IS A CLAIM ABOUT **THE MEMORY SYSTEM\'S ARRANGEMENT** —')
console.log('     which row currently holds a role — ⛔ NOT a claim about the world. The docstring says otherwise.')
console.log('   ⛔ NOTHING IS RE-CLASSIFIED HERE. The nine keep the fates already recorded, and ⛔ no relation')
console.log('     vocabulary is introduced.')
check('⚠️ ANTI-VACUITY · the nine transitions are still present and readable',
  nine.length === 9 && !!mira, `${nine.length} transitions · Mira present=${!!mira}`)

// ── ⑥ `valid_at` AND `tier` — the two that are honest about themselves ───────────────────────────
const [vt] = await q(`SELECT count(*) FILTER (WHERE valid_at IS NOT NULL)::int AS has,
    count(*) FILTER (WHERE valid_at IS NOT NULL AND abs(extract(epoch FROM (valid_at - created_at))) < 2)::int AS at_commit
  FROM ${S}."txn_memories"`)
console.log('\n⑥ THE REMAINING STATES\n')
console.log(`   valid_at   declared "when true in the world" — measured: ${vt.at_commit} of ${vt.has} within 2s of created_at`)
console.log('              ⇒ ⛔ STORAGE LIFECYCLE (commit time) wearing a world-time name')
console.log('   tier       hot/warm/cold — ⭐ HONESTLY storage lifecycle, and D1 classifies it as such')
console.log('   contradicted_at  ⭐ the ONE state that claims something about the PROPOSITION — and it is')
console.log(`              used on ${cc.contradicted} of ${cc.n} rows`)
check('⭐ `valid_at` IS COMMIT TIME — ⛔ it carries no world-validity information',
  vt.at_commit > vt.has * 0.8, `${vt.at_commit}/${vt.has} within 2s of created_at`)

// ── ⑦ THE CANARY, UNTOUCHED ──────────────────────────────────────────────────────────────────────
const [c] = await q(`SELECT
    (SELECT count(*)::int FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL
       AND lower(entity)='sotera' AND lower(attribute)='lesson') AS rows,
    (SELECT count(*)::int FROM ${S}."mst_slots" WHERE lower(entity)='sotera' AND lower(canonical_label)='lesson') AS slot`)
console.log(`\n⑦ THE CANARY — ${c.rows} rows · slot=${c.slot}`)
check('⛔⛔ BOTH PIECES OF CANARY EVIDENCE SURVIVE — membership≠proposition AND value≠proposition',
  c.rows >= 18 && c.slot === 0, `${c.rows} rows · ${c.slot} slots`)

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
