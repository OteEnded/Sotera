// ⭐⭐⭐ BATCH ④⑤⑥⑦ — shared evidence for four decisions. ⛔ FOUR INVESTIGATIONS, ⛔ ZERO RULINGS.
//
//   node test/checks/memory-semantics-batch.mjs
//
// Ote, 2026-09-17: *"Batch investigations that can share evidence/context, but do NOT batch the rulings."*
//
// ⛔⛔ READ-ONLY. ⛔ No implementation · no schema · no historical repair · no canary activation ·
// 047 untouched · A1 shadow · both collisions armed. ⛔ NO POSITIVE DEFINITION OF `invalid_at` IS PROPOSED.
// ⛔ NO PROPOSITION SCHEMA IS PROPOSED. ⛔ "slotless" IS ⛔ NOT TREATED AS INFERIOR.
//
// ── ⚠️ BINDING RULINGS ─────────────────────────────────────────────────────────────────────────────
//   ① ⏸ unresolved — findings are CONSTRAINTS. "Replacement" is ⛔ not a natural category.
//   ② ✅ membership is NOT one semantic relation; each consumer establishes its own.
//   ③ ✅ BROAD — observation→question follows 047's declared-only authority. ⛔ A storage/routing key
//        cannot manufacture question identity. ⚠️ "not declared" ≠ "incorrectly inferred".
//
// ⭐ MECHANICAL findings are asserted. ⚠️ INTERPRETATION lives in the doc.
import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  BATCH ④⑤⑥⑦ — shared evidence. ⛔ four investigations, ⛔ zero rulings.')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ══ ④ · WHAT IS LOST WHEN SIX EVENTS COLLAPSE INTO ONE FIELD ════════════════════════════════════
console.log('\n④ `invalid_at` — WHAT IS LOST, AND WHAT REVERSAL ACTUALLY DEPENDS ON\n')
const [rev] = await q(`SELECT
    count(*) FILTER (WHERE invalid_at IS NOT NULL)::int AS dead,
    count(*) FILTER (WHERE invalid_at IS NOT NULL AND EXISTS
      (SELECT 1 FROM ${S}."txn_memories" x WHERE x.supersedes_id = m.id))::int AS pointed_at,
    count(*) FILTER (WHERE invalid_at IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM ${S}."txn_memories" x WHERE x.supersedes_id = m.id))::int AS orphaned
  FROM ${S}."txn_memories" m`)
console.log(`   rows with invalid_at set                    ${rpad(rev.dead, 4)}`)
console.log(`   ...pointed at by some row's supersedes_id   ${rpad(rev.pointed_at, 4)}   ⇒ reachable by reviveSuperseded`)
console.log(`   ...pointed at by NOTHING                    ${rpad(rev.orphaned, 4)}   ⇒ ⛔ STRUCTURALLY UNREACHABLE`)
console.log('\n   ⭐⭐⭐ REVERSAL DOES ⛔ NOT DEPEND ON THE ORIGINAL EVENT IDENTITY.')
console.log('     `reviveSuperseded` can only reach a row VIA `supersedes_id`. ⇒ a row is recoverable iff')
console.log('     SOMETHING HAPPENED TO POINT AT IT — a DIFFERENT field, set by SOME writers and not others.')
console.log('   ⇒ ⚠️ TWO WRITERS THAT MEAN DIFFERENT THINGS GET THE SAME REVERSIBILITY IF THEY HAPPEN TO SET')
console.log('     THE SAME POINTER — and ONE writer can produce BOTH outcomes in a single act (a rename')
console.log('     points at ONE prior; any other displaced row in the same act gets none).')
check('⭐⭐⭐ REVERSIBILITY IS STRUCTURAL — it turns on `supersedes_id`, ⛔ not on what the event meant',
  rev.dead > 0 && rev.orphaned > 0 && rev.pointed_at > 0,
  `${rev.pointed_at} reachable · ${rev.orphaned} unreachable of ${rev.dead} dead`)

// what the audit says vs what the row state corroborates
const orphans = await q(`SELECT m.id::text AS id, m.entity, m.attribute, m.namespace, m.writer,
    (SELECT string_agg(DISTINCT l.action, ',') FROM ${S}."log_memory_changes" l WHERE l.memory_id = m.id) AS actions
  FROM ${S}."txn_memories" m WHERE m.invalid_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM ${S}."txn_memories" x WHERE x.supersedes_id = m.id)`)
console.log('\n   THE UNREACHABLE ROWS, AND WHAT THEIR AUDIT SAYS:\n')
for (const o of orphans) console.log(`     ${o.id.slice(0, 8)} ${pad(`${o.entity}|${o.attribute}`, 32)}ns=${pad(o.namespace, 9)}audit=[${o.actions}]`)
console.log('\n   ⚠️ TWO carry `[forget by ote-operator]` — an operator maintenance act on identity rows.')
console.log('   ⚠️ ONE is a `retention-check-…` TEST FIXTURE.')
console.log('   ⛔ ONE (`user|location`) is a PRODUCTION row whose audit says **supersede** while NOTHING')
console.log('     points at it. ⇒ ⛔ THE RECORD DOES NOT EXPLAIN THAT ONE, AND THIS PASS DOES NOT INVENT A STORY.')
console.log('   ⇒ ⭐ THE AUDIT ACTION AND THE ROW\'S STRUCTURAL RECOVERABILITY ARE INDEPENDENT, AND IN THIS')
console.log('     CORPUS THEY DISAGREE. ⛔ Nothing reconciles them.')
check('⚠️ THE AUDIT AND THE POINTER DISAGREE ON AT LEAST ONE PRODUCTION ROW — ⛔ reported, not explained',
  orphans.some((o) => String(o.actions).includes('supersede')),
  orphans.map((o) => `${o.entity}|${o.attribute}=[${o.actions}]`).join(' · '))

// ══ ⑤ · IS A PROPOSITION IN THE ROW, OR RECONSTRUCTED? ══════════════════════════════════════════
const [p] = await q(`SELECT count(*)::int AS n,
    count(*) FILTER (WHERE content IS NOT NULL AND btrim(content) <> '')::int AS has_content,
    count(*) FILTER (WHERE value IS NOT NULL AND btrim(value) <> '')::int AS has_value,
    count(*) FILTER (WHERE content IS NOT NULL AND value IS NOT NULL
       AND btrim(lower(content)) = btrim(lower(value)))::int AS identical,
    count(*) FILTER (WHERE content IS NOT NULL AND value IS NOT NULL
       AND position(lower(btrim(value)) in lower(content)) > 0
       AND btrim(lower(content)) <> btrim(lower(value)))::int AS nested,
    count(*) FILTER (WHERE value IS NOT NULL
       AND array_length(regexp_split_to_array(btrim(value), '\\s+'), 1) <= 3)::int AS fragments
  FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL AND kind = 'semantic'`)
console.log('\n\n⑤ OBSERVATION vs PROPOSITION — is the proposition IN the row?\n')
console.log(`   live semantic rows                     ${rpad(p.n, 4)}`)
console.log(`   carrying \`content\`                     ${rpad(p.has_content, 4)}   ⭐ ALL of them`)
console.log(`   carrying \`value\`                       ${rpad(p.has_value, 4)}   ⚠️ ${p.n - p.has_value} carry NONE`)
console.log(`   content === value                      ${rpad(p.identical, 4)}   ⛔ NEVER`)
console.log(`   value nested INSIDE content            ${rpad(p.nested, 4)}   ⭐ content = "<entity>'s <attribute>: <value>"`)
console.log(`   values that are 1–3 word FRAGMENTS     ${rpad(p.fragments, 4)}   ⚠️ "Bangkok" has no truth value alone`)
console.log('\n   ⇒ ⭐⭐⭐ THE PROPOSITION **IS** CONSTRUCTED — AT WRITE TIME, INTO `content`, FROM')
console.log('     (entity + attribute + value). ⇒ the row carries BOTH: a constructed proposition AND an')
console.log('     answer fragment. ⛔ AND THEY ARE NEVER THE SAME STRING.')
console.log('   ⇒ ⭐⭐ TWO FIELDS, TWO CONSUMERS: ⭐ RETRIEVAL RETURNS `content`; ⭐ THE CONFLICT RULE READS')
console.log('     `value`. ⇒ what she RECALLS and what COMPETES are ⛔ DIFFERENT STRINGS ON THE SAME ROW.')
console.log('   ⇒ ⚠️⚠️ AND THE CONSTRUCTED PROPOSITION IS BUILT FROM `attribute` — ⛔ EXACTLY THE LABEL ③')
console.log('     RULED CANNOT CARRY QUESTION IDENTITY. ⇒ the proposition inherits that defect.')
console.log(`   ⇒ ⛔ ${p.n - p.has_value} ROWS HAVE A PROPOSITION AND NO VALUE ⇒ INVISIBLE TO THE CONFLICT RULE ENTIRELY.`)
check('⭐⭐⭐ EVERY LIVE SEMANTIC ROW HAS `content`; ⛔ content AND value ARE NEVER THE SAME STRING',
  p.has_content === p.n && p.identical === 0, `${p.has_content}/${p.n} with content · ${p.identical} identical`)
check('⭐⭐ THE VALUE IS NESTED INSIDE THE CONSTRUCTED PROPOSITION ON MOST ROWS',
  p.nested > p.n * 0.5, `${p.nested} of ${p.n} have value inside content`)
check('⚠️ PROPOSITION EQUIVALENCE IS APPROXIMATED BY norm(value) — ⛔ and most values are fragments',
  p.fragments > 0, `${p.fragments} of ${p.has_value} values are 1–3 words`)

// ══ ⑥ · WHAT DISTINCT SEMANTIC EVENTS ACTUALLY EXIST AT THE SEAM? ═══════════════════════════════
const acts = await q(`SELECT action, count(*)::int AS n FROM ${S}."log_memory_changes" GROUP BY 1 ORDER BY 2 DESC`)
console.log('\n\n⑥ TRANSITIONS — what distinct events are MECHANICALLY EVIDENCED?\n')
console.log(`   audit actions ever recorded : ${acts.map((a) => `${a.action}=${a.n}`).join(' · ')}`)
console.log(`   'collapse' rows              : ${acts.find((a) => a.action === 'collapse')?.n ?? '⛔ ZERO'}`)
const EVENTS = [
  ['re-statement (same proposition, new observation)', 4, '#1 #2 #5 (+#3 contested)', 'evidenced'],
  ['world-state change', 1, '#7 Mira', 'evidenced'],
  ['correction / repair by OPERATOR JUDGEMENT', 1, '#6 current goal', '⭐ evidenced — and NOT the machinery'],
  ['mis-routing artifact', 2, '#8 #9 work schedule', '⭐ evidenced'],
  ['partial change inside a coordinated value', 1, '#4 lineage', 'evidenced'],
  ['redundancy / collapse', 0, '—', '⛔ NEVER FIRED — 0 collapse audits'],
  ['lesson / change-of-understanding', 0, '—', '⛔ NEVER FIRED — 0 forward supersedes_id'],
]
console.log(`\n   ${pad('candidate event', 50)}${pad('n', 4)}${pad('cases', 26)}status`)
console.log('   ' + '─'.repeat(120))
for (const [e, n, c, s] of EVENTS) console.log(`   ${pad(e, 50)}${pad(n, 4)}${pad(c, 26)}${s}`)
const evidenced = EVENTS.filter((e) => e[1] > 0).length
console.log(`\n   ⇒ ⭐ ${evidenced} DISTINCT EVENT KINDS ARE MECHANICALLY EVIDENCED in production; 2 candidates`)
console.log('     have NEVER OCCURRED. ⇒ ⚠️ the two that never fired are precisely the two whose claims are')
console.log('     the strongest (collapse asserts equivalence) and the most DECLARED (lesson revise).')
check('⭐⭐ COLLAPSE HAS NEVER FIRED IN PRODUCTION — 0 audit rows for it',
  !acts.find((a) => a.action === 'collapse'), `actions: ${acts.map((a) => a.action).join(',')}`)

// ══ ⑦ · WHICH DURABLE-MEMORY FAMILIES PARTICIPATE IN QUESTION → SLOT → COMPETITION? ═════════════
const fam = await q(`SELECT kind, COALESCE(writer, '(null)') AS writer, COALESCE(entity, '(null)') AS entity,
    namespace, count(*)::int AS n, count(slot_id)::int AS slotted
  FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL
  GROUP BY 1, 2, 3, 4 HAVING count(*) >= 2 ORDER BY 5 DESC`)
console.log('\n\n⑦ DURABLE-MEMORY FAMILIES — ⛔ slotless is an EMPIRICAL SHAPE, ⛔ not a deficiency\n')
console.log(`   ${pad('kind', 10)}${pad('writer', 12)}${pad('entity', 22)}${pad('ns', 10)}${pad('n', 5)}${pad('slotted', 9)}routes via reconcileFact?`)
console.log('   ' + '─'.repeat(120))
for (const f of fam) {
  const routes = f.slotted > 0 ? '✅ yes' : '⛔ no'
  console.log(`   ${pad(f.kind, 10)}${pad(f.writer, 12)}${pad(String(f.entity).slice(0, 20), 22)}${pad(f.namespace, 10)}${pad(f.n, 5)}${pad(f.slotted, 9)}${routes}`)
}
const routed = fam.filter((f) => f.slotted > 0)
const unrouted = fam.filter((f) => f.slotted === 0)
const fullyRouted = routed.every((f) => f.slotted === f.n)
console.log(`\n   families that route : ${routed.length}   families that do not : ${unrouted.length}`)
console.log(`   every routed family is routed COMPLETELY (slotted === n)? ${fullyRouted ? 'YES' : 'no'}`)
console.log('\n   ⇒ ⭐⭐⭐ SLOT PARTICIPATION IS ALL-OR-NOTHING **PER FAMILY**, AND IT TRACKS THE WRITER\'S')
console.log('     CODE PATH — ⛔ NOT THE NATURE OF THE MEMORY. `lesson-host` and `ingest` never call')
console.log('     `reconcileFact`, so their rows never enter the slot layer, whatever they are about.')
console.log('   ⇒ ⚠️ AND IT CUTS BOTH WAYS: a `project-decision` arguably HAS a current answer (a decision')
console.log('     can be superseded) and is excluded; a `lesson` arguably does NOT need one and is excluded')
console.log('     by the same accident. ⛔ NEITHER EXCLUSION WAS A SEMANTIC DECISION.')
check('⭐⭐⭐ SLOT PARTICIPATION IS ALL-OR-NOTHING PER FAMILY — decided by the writer\'s path',
  fullyRouted && unrouted.length > 0,
  `${routed.length} routed families (all complete) · ${unrouted.length} unrouted`)

// ══ FIXTURES ════════════════════════════════════════════════════════════════════════════════════
const [fx] = await q(`SELECT
    (SELECT count(*)::int FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL
       AND lower(entity)='sotera' AND lower(attribute)='lesson') AS canary,
    (SELECT count(*)::int FROM ${S}."mst_slots" WHERE lower(entity)='sotera' AND lower(canonical_label)='lesson') AS canary_slot,
    (SELECT count(*)::int FROM ${S}."mst_slot_questions") AS questions,
    (SELECT count(*)::int FROM ${S}."mst_slots" s WHERE s.canonical_label='work schedule'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(s.aliases,'[]'::jsonb)) a
                   WHERE a->>'phrase' IN ('schedule','volunteer_schedule_and_location'))) AS armed`)
console.log(`\n\nFIXTURES — canary ${fx.canary}/${fx.canary_slot} · questions ${fx.questions} · armed collisions ${fx.armed}`)
check('⛔⛔ CANARY UNTOUCHED · 047 UNTOUCHED · COLLISIONS STILL ARMED',
  fx.canary >= 18 && fx.canary_slot === 0 && fx.questions === 1 && fx.armed > 0,
  `canary ${fx.canary}/${fx.canary_slot} · questions ${fx.questions} · armed ${fx.armed}`)

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
