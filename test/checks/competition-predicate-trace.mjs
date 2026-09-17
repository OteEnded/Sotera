// ⭐⭐⭐ WHAT EXACT PREDICATE MAKES TWO MEMORIES COMPETITORS? — the full mechanical trace
//
//   node test/checks/competition-predicate-trace.mjs
//
// Ote, 2026-09-17: *"Trace every path that causes a memory to enter `matches` … Can two genuinely different
// propositions satisfy the predicate? Can two propositions that should compete fail to satisfy it? Once
// membership exists, exactly what operations become possible solely because of that membership?"*
//
// ⛔⛔ READ-ONLY. ⛔ No resolver · threshold · alias · membership · binding · historical repair · 047
// population · `contradicted_at` backfill · relation vocabulary · Dreaming · lesson-system change.
// ⛔ `SEMANTIC_FIELDS` untouched. ⛔ A-D4 untouched. ⛔ THE CANARY STAYS UNARMED.
//
// ── ⚠️ THE STANDING WARNING FOR THIS FILE ───────────────────────────────────────────────────────────
// Ote: *"Don't assume that because the current implementation calls something a 'duplicate', it has
// established duplication. That's exactly the question we're investigating."*
// ⇒ ⭐ the word `duplicate` appears below ONLY as the name of a code branch, ⛔ never as a finding.
//
// ── THE THREE LAYERS, KEPT APART ────────────────────────────────────────────────────────────────────
//     QUESTION              what question/slot is declared            (047 — declared on 1 of 112)
//     PROPOSITION           what the memory actually says             (`content`, and sometimes `value`)
//     COMPETITION MEMBERSHIP what the system treats as competing       (the predicates below)
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { resolveConflict, CONFLICT } from '@ote/memory/cognition/memory-conflict.js'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  COMPETITION PREDICATES — what claim does each one make, and can it be wrong?')
console.log('  ⛔ read-only · ⛔ nothing armed · ⛔ nothing repaired · ⛔ no fix proposed')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ── ① THE PREDICATE TABLE ─────────────────────────────────────────────────────────────────────────
// ⚠️ `claims` and `epistemic` are DECLARED JUDGEMENTS. The predicate, its site and its effect are mechanical.
const P = [
  { id: 'P2', pred: 'invalid_at IS NULL AND expired_at IS NULL', by: 'the store', claims: 'CURRENT-STATE PROPERTY', epi: 'EXPLICIT' },
  { id: 'P3', pred: 'persona + user_id scope', by: 'the store', claims: 'IDENTITY (owner)', epi: 'EXPLICIT' },
  { id: 'P6', pred: 'resolveOwner(entity)', by: 'owner resolution', claims: 'IDENTITY (owner)', epi: 'DERIVED' },
  { id: 'P7', pred: 'row.slot_id', by: 'a prior write or adoption', claims: '⚠️ STORAGE GROUP (D1: placement)', epi: 'EXPLICIT (but see P9)' },
  { id: 'P8', pred: 'norm(entity)|norm(attribute) == slot label', by: 'buildSlotView', claims: '⛔ LABEL equality, ⛔ NOT proposition', epi: 'DERIVED' },
  { id: 'P9', pred: 'norm(entity)|norm(alias.phrase)', by: 'a learned alias (A3)', claims: 'LEARNED equivalence', epi: '⭐ LEARNED' },
  { id: 'P11', pred: 'resolution.slotId', by: 'the resolver', claims: 'SAME CONCEPT', epi: '⚠️ GUESSED (cosine/lexical)' },
  { id: 'P12', pred: 'matches[0] — newest first', by: 'row ordering', claims: '⛔ NOTHING — recency', epi: 'DERIVED' },
  { id: 'P13', pred: 'norm(primary.value) === norm(value)', by: 'reconcilePlan', claims: '⭐ PROPOSITION EQUIVALENCE', epi: 'EXPLICIT (string)' },
  { id: 'P14', pred: 'membership, and nothing else', by: 'resolveConflict', claims: '⛔⛔ NOTHING', epi: '⛔ ASSUMED' },
  { id: 'P15', pred: 'findLiveInSlot fallback {entity, attribute}', by: 'forget / revive', claims: '⛔ LABEL equality, ⛔ no slot needed', epi: 'DERIVED' },
]
console.log('\n① THE PREDICATES — what each CLAIMS, and how that claim was arrived at\n')
console.log(`   ${pad('', 6)}${pad('predicate', 44)}${pad('established by', 26)}${pad('claims', 36)}how`)
console.log('   ' + '─'.repeat(148))
for (const p of P) console.log(`   ${pad(p.id, 6)}${pad(p.pred, 44)}${pad(p.by, 26)}${pad(p.claims, 36)}${p.epi}`)
console.log('\n   ⭐ ONLY P13 CLAIMS ANYTHING ABOUT WHAT A MEMORY SAYS — and it is a STRING comparison on `value`.')
console.log('   ⛔ `content` appears in NO predicate. P11 is a GUESS; P14 claims nothing at all.')

// ── ② ⭐⭐⭐ P15 — A SECOND MEMBERSHIP PREDICATE, AND IT NEEDS NO SLOT ────────────────────────────
// forget/revive key: `row.slot_id ? {slotId} : {entity, attribute}` — the SAME dual key as buildSlotView.
// ⇒ a row with NO slot is still a co-member for revival purposes, keyed by phrase alone.
const scope = await q(`SELECT persona, user_id::text AS uid, count(*)::int AS n
  FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL
    AND lower(entity)='sotera' AND lower(attribute)='lesson' GROUP BY 1,2 ORDER BY 3 DESC`)
const biggest = scope[0]
console.log('\n② ⭐⭐⭐ P15 — MEMBERSHIP WITHOUT A SLOT (forget / revive)\n')
console.log('   reviveSuperseded:  if (findLiveInSlot(slotKey).length > 0) return null      ⇒ ⭐ A VETO')
console.log('   restore:           holder = findLiveInSlot(slotKey).find(r => r.id !== row.id)')
console.log('                      → the restored row returns SUPERSEDED, ⛔ not live')
console.log('   slotKey =          row.slot_id ? { slotId } : { entity, attribute }         ⇒ ⭐ NO SLOT NEEDED\n')
console.log('   the lesson rows, grouped by the findLiveInSlot scope (persona, user_id):')
for (const r of scope) console.log(`     persona=${r.persona ?? 'null'}  uid=${String(r.uid).slice(0, 8)}  n=${r.n}`)
console.log(`\n   ⇒ ⭐⭐⭐ ${biggest.n} LESSONS ALREADY SHARE ONE findLiveInSlot KEY — TODAY, WITH NO SLOT IN EXISTENCE.`)
console.log('     ⚠️ So the canary is UNARMED for the reconcile path and ALREADY LIVE for forget/revive:')
console.log(`     forgetting one lesson and restoring it would find ${biggest.n - 1} "holders" and return it SUPERSEDED.`)
console.log('   ⛔ P15 DESTROYS NOTHING — it WITHHOLDS RESTORATION. That is a veto, ⛔ not an invalidation,')
console.log('     and the distinction is kept because overstating it would be the same error as calling')
console.log('     an uncompared row a duplicate.')
check('⭐⭐⭐ P15 IS A MEMBERSHIP PREDICATE THAT REQUIRES NO SLOT — and it already groups the lessons',
  biggest.n > 1, `${biggest.n} live lesson rows share one (persona, user_id, entity, attribute) key`)

// ── ③ CAN THE PREDICATE BE WRONG? — both directions ──────────────────────────────────────────────
console.log('\n③ CAN TWO DIFFERENT PROPOSITIONS SATISFY IT? — ⭐ YES, DEMONSTRATED\n')
const lessons = await q(`SELECT id::text, content FROM ${S}."txn_memories"
  WHERE invalid_at IS NULL AND expired_at IS NULL AND lower(entity)='sotera' AND lower(attribute)='lesson'`)
const distinct = new Set(lessons.map((l) => String(l.content).trim().toLowerCase())).size
console.log(`   the canary: ${lessons.length} rows · ${distinct} distinct propositions · ONE membership key`)
console.log('   the shipped defect: "up past 2am" and "Saturdays" competed inside `work schedule`')
check('⭐⭐⭐ FALSE POSITIVE CONFIRMED — distinct propositions satisfy the membership predicate',
  lessons.length > 1 && distinct === lessons.length, `${lessons.length} rows · ${distinct} distinct`)

// the FALSE NEGATIVE direction — ⚠️ and the honest result is that none was found
const spread = await q(`SELECT entity, attribute, count(DISTINCT slot_id)::int AS slots
  FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL AND kind='semantic' AND slot_id IS NOT NULL
  GROUP BY user_id, entity, attribute HAVING count(DISTINCT slot_id) > 1`)
const sameValue = await q(`WITH live AS (
    SELECT id::text, user_id::text AS uid, slot_id::text AS slot, attribute,
           btrim(lower(regexp_replace(coalesce(value,''), '\\s+', ' ', 'g'))) AS nv
    FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL AND kind='semantic' AND slot_id IS NOT NULL)
  SELECT l1.nv, l1.attribute AS a1, l2.attribute AS a2 FROM live l1
  JOIN live l2 ON l1.uid IS NOT DISTINCT FROM l2.uid AND l1.nv = l2.nv AND l1.slot < l2.slot WHERE l1.nv <> ''`)
console.log('\n   CAN TWO PROPOSITIONS THAT SHOULD COMPETE FAIL TO SATISFY IT?\n')
console.log(`     same (user, entity, attribute) split across slots : ${spread.length}`)
console.log(`     identical normalized value in different slots     : ${sameValue.length}`)
for (const r of sameValue) console.log(`       "${r.nv}"  →  ${r.a1}  vs  ${r.a2}`)
console.log('\n   ⛔ NO FALSE NEGATIVE ESTABLISHED. ⚠️ And the one identical-value pair is NOT one:')
console.log('     `location = Bangkok` and `timezone = Bangkok` are DIFFERENT QUESTIONS with the SAME ANSWER')
console.log('     STRING, and they are correctly in different slots.')
console.log('   ⇒ ⭐⭐ THAT IS THE MIRROR OF THE CANARY, and it indicts P13 rather than membership:')
console.log('     the canary shows ONE MEMBERSHIP ≠ ONE PROPOSITION;')
console.log('     Bangkok shows ONE VALUE ≠ ONE PROPOSITION.')
console.log('   ⇒ ⛔ P13 IS ONLY A PROPOSITION TEST *CONDITIONAL ON MEMBERSHIP BEING RIGHT*. Where membership')
console.log('     is wrong it compares answers to DIFFERENT QUESTIONS — which is exactly what `work schedule` did.')
check('⚠️ NO FALSE NEGATIVE FOUND — ⛔ reported as not-established, ⛔ never as "none exists"',
  spread.length === 0, `${spread.length} split groups · the instrument tests structural proxies only`)
check('⭐⭐ ONE VALUE ≠ ONE PROPOSITION — identical values sit correctly in different slots',
  sameValue.length >= 1, sameValue.map((r) => `${r.a1}/${r.a2}="${r.nv}"`).join(' · '))

// ── ④ WHAT MEMBERSHIP ALONE UNLOCKS ──────────────────────────────────────────────────────────────
const only = resolveConflict({ matches: [{ id: 'a', value: 'X' }, { id: 'b', value: 'Y' }], value: 'X' })
console.log('\n④ OPERATIONS UNLOCKED **SOLELY** BY MEMBERSHIP\n')
console.log(`   ${pad('operation', 40)}${pad('needs', 40)}destructive?`)
console.log('   ' + '─'.repeat(96))
console.log(`   ${pad('⭐ collapse as an extra (P14)', 40)}${pad('MEMBERSHIP ALONE', 40)}⛔ YES — invalidated`)
console.log(`   ${pad('⭐ veto a revival (P15)', 40)}${pad('MEMBERSHIP ALONE — ⛔ no slot needed', 40)}⚠️ withholds, ⛔ not destroys`)
console.log(`   ${pad('force a restore back to superseded', 40)}${pad('MEMBERSHIP ALONE', 40)}⚠️ withholds`)
console.log(`   ${pad('supersession as primary', 40)}${pad('membership + newest + value differs', 40)}⛔ YES`)
console.log(`   ${pad('be reinforced / value-tested', 40)}${pad('membership + newest', 40)}no`)
console.log(`   ${pad('M2 kind gating + admission pin', 40)}${pad('membership + a declared question', 40)}no`)
console.log('\n   ⇒ ⭐⭐⭐ TWO OPERATIONS REQUIRE MEMBERSHIP AND NOTHING ELSE, AND BOTH ACT ON A ROW WHOSE')
console.log('     CONTENT WAS NEVER READ. ⚠️ One invalidates it; one refuses to let it come back.')
check('⭐⭐⭐ MEMBERSHIP ALONE INVALIDATES — a non-primary member is collapsed with no test applied',
  only.collapse.length === 1 && only.collapse[0] === 'b' && only.action === CONFLICT.DUPLICATE,
  `action=${only.action} · collapse=[${only.collapse}] — "Y" was never compared to anything`)

// ── ⑤ THE CANARY — still unarmed for reconcile ───────────────────────────────────────────────────
const [armed] = await q(`SELECT
    (SELECT count(*)::int FROM ${S}."mst_slots" WHERE lower(entity)='sotera' AND lower(canonical_label)='lesson') AS slot,
    (SELECT count(*)::int FROM ${S}."mst_slots" s WHERE lower(s.entity)='sotera'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(s.aliases,'[]'::jsonb)) a WHERE lower(a->>'phrase')='lesson')) AS alias`)
console.log('\n⑤ THE CANARY\n')
console.log(`   reconcile path : ${armed.slot === 0 && armed.alias === 0 ? '⛔ UNARMED — no slot, no alias' : '⚠️ ARMED'}`)
console.log(`   forget/revive  : ⚠️ ALREADY GROUPED by P15 — ⛔ and that needs no slot`)
check('⛔⛔ THE CANARY IS STILL UNARMED FOR RECONCILE — and this run armed nothing',
  armed.slot === 0 && armed.alias === 0, `slots=${armed.slot} · aliases=${armed.alias}`)

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
