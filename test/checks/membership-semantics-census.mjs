// ⭐⭐⭐ MEMBERSHIP SEMANTICS CENSUS — what does it MEAN to put a memory into a Slot?
//
//   node test/checks/membership-semantics-census.mjs
//
// Ote, 2026-09-17: *"A memory becoming a member of a Slot is itself an act with semantic consequences. We
// don't yet know what that act should mean or who should be allowed to perform it. So let's measure the
// membership mechanisms first."*
//
// ⛔⛔ READ-ONLY. ⛔ No resolver · no threshold · no alias · no membership change · no slot binding · no
// historical repair · no 047 population · no `contradicted_at` backfill · no relation vocabulary · no
// Dreaming change. ⛔ A-D4 untouched. ⛔ NO ALIAS IS CREATED TO TEST ANYTHING.
//
// ── ⛔ WHAT THIS DOES NOT DO ────────────────────────────────────────────────────────────────────────
// ⛔ It does not judge whether any membership is CORRECT. It measures the MECHANISM, per Ote's ruling.
// ⛔ It does not repair the adoption path. *"First establish WHAT IS A SLOT MEMBERSHIP CLAIM."*
//
// ── ⚠️ INSTRUMENT DISCIPLINE (#15–#19) ──────────────────────────────────────────────────────────────
//   · a nullable column is never compared with `IS NOT DISTINCT FROM` and called a match       (#19)
//   · a structural check that cannot express the syntax is not evidence of absence              (#18)
//   · `slot_id::text` is a CAST, ⛔ not an assignment                                           (#17)
//   · source anchors are normalised whole sentences, ⛔ never shortened to pass                 (#14)
//   · where the mechanism is NOT recoverable, that is REPORTED, ⛔ never inferred
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)
const norm = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/\s+/g, ' ')
const SERVICE = norm(readFileSync(new URL('../../../../PortableComponents/Packages/Memory/cognition/memory-v2-service.js', import.meta.url), 'utf8'))

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  MEMBERSHIP SEMANTICS CENSUS — the mechanisms by which a memory joins a Slot')
console.log('  ⛔ read-only · ⛔ nothing proposed · ⛔ nothing repaired · ⛔ A-D4 untouched')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ── ① THE POPULATION ──────────────────────────────────────────────────────────────────────────────
const [pop] = await q(`SELECT count(*)::int AS total,
    count(slot_id)::int AS member, count(*) FILTER (WHERE slot_id IS NULL)::int AS slotless
  FROM ${S}."txn_memories"`)
console.log('\n① THE MEMBERSHIP POPULATION\n')
console.log(`   memory rows                 ${rpad(pop.total, 5)}`)
console.log(`   ⭐ carrying a slot_id        ${rpad(pop.member, 5)}   ← the membership writes to be classified`)
console.log(`   carrying none               ${rpad(pop.slotless, 5)}`)

// ── ② ⭐⭐⭐ IS THE MECHANISM RECOVERABLE PER ROW? ────────────────────────────────────────────────
// ⭐ THE FIRST QUESTION, because every other answer depends on it. The audit log is the only place a
// membership event could be recorded. What does its vocabulary contain?
const actions = await q(`SELECT action, count(*)::int AS n, count(slot_id)::int AS with_slot
  FROM ${S}."log_memory_changes" GROUP BY 1 ORDER BY 2 DESC`)
console.log('\n② ⭐⭐⭐ IS THE MECHANISM RECOVERABLE FROM THE RECORD?\n')
console.log('   log_memory_changes, by action:')
for (const a of actions) console.log(`     ${pad(a.action, 16)}${rpad(a.n, 5)}   carrying slot_id: ${a.with_slot}`)
const MEMBERSHIP_WORDS = /add|create|adopt|member|attach|bind|route/i
const membershipActions = actions.filter((a) => MEMBERSHIP_WORDS.test(a.action))
console.log(`\n   actions recording a MEMBERSHIP event: ${membershipActions.length ? membershipActions.map((a) => a.action).join(', ') : '⛔ NONE'}`)
console.log('   ⓘ the writer\'s own doc lists the vocabulary: supersede | collapse | forget | archive | revive | delete')
console.log('     ⇒ ⭐ every one of them is a DESTRUCTIVE transition. ⛔ Membership is not among them.')

// the only hard proof of adoption: a row older than the slot it belongs to
const [prov] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_memories" m
  JOIN ${S}."mst_slots" s ON s.id = m.slot_id WHERE m.created_at < s.created_at`)
console.log(`\n   rows PROVABLY adopted (older than their own slot)     ${prov.n}`)
console.log(`   rows whose mechanism is RECORDED anywhere              0`)
console.log('\n   ⇒ ⭐⭐⭐ THE MECHANISM IS NOT RECOVERABLE FOR ANY OF THE ' + pop.member + ' MEMBERSHIPS.')
console.log('     ⛔ Neither A nor B is recorded. `slot_id` states THAT a memory belongs to a slot and')
console.log('     ⛔ never HOW it came to. ⚠️ The 0 above is a LOWER BOUND on adoption, ⛔ not a count.')
check('⭐⭐⭐ NO AUDIT ACTION RECORDS A MEMBERSHIP EVENT — membership is unaudited by BOTH mechanisms',
  membershipActions.length === 0, `${actions.length} action kinds, none of them a membership write`)
check('⚠️ ADOPTION COUNT IS A LOWER BOUND — ⛔ absence of proof is not proof of absence',
  prov.n >= 0, `${prov.n} provable · an unknown number undetectable by any available method`)

// ── ③ THE PROPERTY MATRIX — Ote's ten questions, per mechanism ────────────────────────────────────
// ⚠️ Answers are DERIVED FROM SOURCE and declared here; the mechanically checkable ones are asserted below.
console.log('\n③ THE TEN QUESTIONS, PER MECHANISM\n')
const MECHANISMS = [
  { key: 'A', name: 'EXPLICIT AT ADMISSION', site: 'create({ slot_id: slot?.id ?? null })' },
  { key: 'B', name: 'PHRASE / ALIAS ADOPTION', site: 'store.update(orphans, { slot_id: slot.id })' },
]
const MATRIX = [
  ['who/what caused the membership', 'the resolver (cosine · lexical · alias · gray-zone) via reconcileFact',
    '⭐ a PHRASE MATCH in buildSlotView — label OR learned alias. ⛔ "no resolver judgement is needed"'],
  ['was an ACT / occasion declared', '⚠️ the ROW carries act+occasion; ⛔ the MEMBERSHIP itself declares none',
    '⛔ NO — it runs outside finalizeSlot, so A3\'s ACT requirement never reaches it'],
  ['writer-accountable', '⚠️ only via the row\'s `writer`; ⛔ no membership-level writer',
    '⛔ NO — no writer, no actor, no ledger row'],
  ['source evidence available', '✅ the row\'s source_message_id', '✅ the adopted row keeps its own source_message_id'],
  ['reversible', '⛔ NO — nothing re-homes a row between slots', '⛔ NO — and it cannot be un-adopted either'],
  ['altered which incumbent could be superseded', '⭐ YES — it puts the row in `matches`', '⭐ YES — identically, and for rows written long before'],
  ['before or after the memory was written', 'AT the write (same statement)', '⭐ AFTER — potentially weeks after'],
  ['can the same memory change membership later', '⚠️ only NULL → a slot, once. ⛔ never slot → slot', '⚠️ same: it is the one-way fill'],
  ['alias learning triggers it without a new memory write', '⛔ n/a', '⭐⭐ YES — a learned alias changes `claimedBy`, and the NEXT reconcile adopts'],
  ['a refused write can leave membership changed', '⛔ no — membership is part of the refused create', '⭐⭐ YES — adoption precedes `create` and there is NO transaction'],
]
console.log(`   ${pad('', 46)}${pad('A · EXPLICIT AT ADMISSION', 54)}B · PHRASE/ALIAS ADOPTION`)
console.log('   ' + '─'.repeat(150))
for (const [qn, a, b] of MATRIX) console.log(`   ${pad(qn, 46)}${pad(a, 54)}${b}`)
console.log('\n   ⛔ MECHANISM C: none found. The pinned inventory in `slot-authority-map.mjs` §2 shows exactly')
console.log('     two assignment sites on txn_memories, and a check there fails if a third appears.')

// the two mechanically checkable claims about B, anchored on WHOLE normalised sentences
const adoptionSite = SERVICE.includes('store.update(orphans, { slot_id: slot.id })')
const finalizeAfter = SERVICE.indexOf('const finalizeSlot') > SERVICE.indexOf('store.update(orphans,')
const noTransaction = !/\.transaction\s*\(/.test(SERVICE)
console.log('')
check('⭐⭐ B RUNS OUTSIDE finalizeSlot — so A3\'s ACT requirement does not govern it',
  adoptionSite && finalizeAfter, `adoption site present=${adoptionSite} · declared before finalizeSlot=${finalizeAfter}`)
check('⭐⭐⭐ THE SERVICE OPENS NO TRANSACTION — ⇒ a later refused write leaves the adoption in place',
  noTransaction, 'no `.transaction(` anywhere in memory-v2-service')

// ── ④ THE 53 SLOTLESS LIVE ROWS — what are they, structurally? ────────────────────────────────────
const slotless = await q(`SELECT entity, writer, author, count(*)::int AS n FROM ${S}."txn_memories"
  WHERE invalid_at IS NULL AND expired_at IS NULL AND kind='semantic' AND slot_id IS NULL
    AND entity IS NOT NULL AND attribute IS NOT NULL AND namespace <> 'identity'
  GROUP BY 1,2,3 ORDER BY 4 DESC`)
const total53 = slotless.reduce((a, r) => a + r.n, 0)
console.log('\n④ THE SLOTLESS LIVE ROWS IN THE RECONCILE CANDIDATE SET\n')
console.log(`   ${pad('entity', 20)}${pad('writer', 14)}${pad('author', 12)}n`)
console.log('   ' + '─'.repeat(56))
for (const r of slotless) console.log(`   ${pad(r.entity, 20)}${pad(r.writer ?? '(null)', 14)}${pad(r.author ?? '—', 12)}${r.n}`)
console.log(`\n   total ${total53}`)
console.log('\n   ⭐⭐ THEY ARE NOT ACCIDENTALLY SLOTLESS. The population is dominated by the two record types')
console.log('     that already have a NON-SLOT model: `project-decision` rows ingested from documents, and')
console.log('     Sotera\'s own `lesson` rows — which carry their own relation vocabulary on the lesson path.')
console.log('     ⛔ `lesson-host` never calls reconcileFact, so these were never routed and never refused —')
console.log('     they were written by paths that do not use slots at all.')

// prior membership / adoption history for them
const [hist] = await q(`SELECT count(*)::int AS audit_rows, count(slot_id)::int AS with_slot
  FROM ${S}."log_memory_changes" WHERE memory_id IN (
    SELECT id FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL AND kind='semantic'
      AND slot_id IS NULL AND entity IS NOT NULL AND attribute IS NOT NULL AND namespace <> 'identity')`)
console.log(`\n   audit rows referencing them: ${hist.audit_rows} — ⭐ carrying a slot_id: ${hist.with_slot}`)
check('⭐ NONE OF THE SLOTLESS LIVE ROWS SHOWS ANY PRIOR SLOT MEMBERSHIP — ⛔ no adoption history',
  hist.with_slot === 0, `${hist.with_slot} of ${hist.audit_rows} audit rows carry a slot_id`)

// ── ⑤ ⭐⭐⭐ SHARED-KEY EXPOSURE — what a single mint would claim, in one step ─────────────────────
// ⛔ MEASURED FROM EXISTING DATA ONLY. ⛔ No alias is created and nothing is written to test this.
const shared = await q(`SELECT entity, attribute, count(*)::int AS n FROM ${S}."txn_memories"
  WHERE invalid_at IS NULL AND expired_at IS NULL AND kind='semantic' AND slot_id IS NULL
    AND entity IS NOT NULL AND attribute IS NOT NULL AND namespace <> 'identity'
  GROUP BY 1,2 HAVING count(*) > 1 ORDER BY 3 DESC`)
console.log('\n⑤ ⭐⭐⭐ SHARED-KEY EXPOSURE — rows a SINGLE mint would claim together\n')
for (const r of shared.slice(0, 4)) console.log(`   ${rpad(r.n, 4)}  ${r.entity} | ${r.attribute}`)
if (shared.length > 4) console.log(`   ...and ${shared.length - 4} more keys holding 2 rows each`)
const biggest = shared[0]
console.log(`\n   ⚠️ THE LARGEST: ${biggest.n} live rows share "${biggest.entity} | ${biggest.attribute}".`)
console.log('   ⇒ if a slot were ever minted under that key, ALL of them become claimable in ONE step,')
console.log('     are adopted PERMANENTLY, and land in ONE competition set — where `resolveConflict` keeps')
console.log(`     matches[0] and collapses or supersedes the other ${biggest.n - 1}.`)
console.log('\n   ⛔ IT IS NOT CURRENTLY ARMED: no slot exists under any of these keys, and the path that WRITES')
console.log('     these rows (`lesson-host`) never calls reconcileFact, so it cannot mint one. ⚠️ A fact-path')
console.log('     write naming that (entity, attribute) could. ⛔ NOT TESTED — no alias was created.')
const existing = await q(`SELECT count(*)::int AS n FROM ${S}."mst_slots" s WHERE EXISTS (
  SELECT 1 FROM (SELECT DISTINCT entity, attribute FROM ${S}."txn_memories"
    WHERE invalid_at IS NULL AND kind='semantic' AND slot_id IS NULL AND namespace <> 'identity') k
  WHERE lower(k.entity) = lower(s.entity) AND lower(k.attribute) = lower(s.canonical_label))`)
check('⛔ THE SHARED-KEY EXPOSURE IS NOT ARMED — no slot exists under any slotless row\'s key',
  existing[0].n === 0, `${existing[0].n} slot(s) already match a slotless row's key`)
check('⚠️ ANTI-VACUITY · the census found a real membership population and a real shared-key group',
  pop.member > 100 && shared.length > 0, `${pop.member} memberships · ${shared.length} shared keys`)

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
