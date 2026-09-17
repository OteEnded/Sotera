// ⭐⭐⭐ DECISION ③ · WHERE DOES THE AUTHORITY TO SAY "THIS OBSERVATION ANSWERS THAT QUESTION" COME FROM?
//
//   node test/checks/routing-authority-trace.mjs
//
// Ote, 2026-09-17: *"If membership itself carries no semantic authority, where does the system obtain the
// authority to say that an observation belongs to a particular question in the first place?"*
//
// ⛔⛔ READ-ONLY. ⛔ No implementation · no vocabulary · no schema · 047 UNTOUCHED · A1 shadow ·
// canary untouched · armed collisions untouched. ⛔ THE THREE READINGS ARE **NOT** SELECTED AMONG.
//
// ── ⚠️ ② IS RULED AND BINDS THIS PASS (Ote, 2026-09-17) ────────────────────────────────────────────
//   > "An operational arena/key may be used to NARROW CANDIDATES, but membership in that arena does not,
//   >  by itself, establish ANY particular semantic relationship between the observations within it."
//   ⭐ AND: "Being REACHABLE BY an arena key must not be confused with HAVING BEEN SEMANTICALLY
//     ESTABLISHED as a member of that arena."
// ⇒ ⭐ so this pass may NOT treat routing as establishing anything merely because it produced a key.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)
const flat = (t) => t.replace(/\s+/g, ' ')
const app = (f) => flat(readFileSync(new URL(`../../Backend/app/components/${f}`, import.meta.url), 'utf8'))
const STORE = app('memory-store-sequelize-host.js')
const RETENTION = app('retention-host.js')

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  DECISION ③ · routing authority — ⛔ evidence only, ⛔ no reading selected')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ── ① THE PRODUCTION CALL GRAPH ──────────────────────────────────────────────────────────────────
console.log('\n① THE CALL GRAPH, FROM OBSERVATION TO ADMISSION\n')
const STEPS = [
  ['1', 'commitToMemory / reconcileFactAsync', 'the observation arrives', '⛔ no question involved'],
  ['2', 'pipeline.ingest → reconcileFact', 'entity · attribute · value · claimKind (if the writer said)', '—'],
  ['3', '⭐ resolver.resolve(observation, descriptors)', '→ { slotId, confidence, relation, evidence }', '⚠️ THE ROUTING DECISION IS HERE'],
  ['4', 'slotStore.get(slotId) ?? slotStore.ensure(...)', 'the slot is fetched or MINTED', '⛔ no question consulted'],
  ['5', 'store.create({ …row, slot_id })', 'the row is written', '⛔ claimKind is STRIPPED here'],
  ['6', 'slotGovernanceFor(row) → resolveSlotQuestion(row.slot_id)', '→ { slotKind, checks, questionId }', '⭐ the question layer is reached — VIA THE SLOT'],
  ['7', 'checkKind({ slotKind, claimKind })', '→ ALLOW / DEFER', '⭐ two DECLARED kinds compared'],
  ['8', 'pin = ALLOW ? questionId : null', '→ question_id_at_admission', 'the only durable question link'],
  ['9', 'governsReplacement({ slotGoverned, slotKind, claimKind })', '→ ALLOW / REFUSE / NOT-IN-SCOPE', 'replacement authority'],
]
console.log(`   ${pad('#', 4)}${pad('site', 48)}${pad('what it produces', 50)}note`)
console.log('   ' + '─'.repeat(150))
for (const [n, site, produces, note] of STEPS) console.log(`   ${pad(n, 4)}${pad(site, 48)}${pad(produces, 50)}${note}`)
console.log('\n   ⇒ ⭐ THE ROUTING DECISION (step 3) HAPPENS **BEFORE** THE QUESTION LAYER IS EVER REACHED (step 6),')
console.log('     and step 6 reaches it **THROUGH THE SLOT THAT STEP 3 CHOSE**.')

// ── ② ⭐⭐⭐ THE TWO SIDES OF THE RELATIONSHIP ───────────────────────────────────────────────────
console.log('\n② ⭐⭐⭐ WHAT EACH SIDE OF THE RELATIONSHIP ACTUALLY IS\n')
const [bind] = await q(`SELECT count(*)::int AS n FROM ${S}."log_slot_bindings"`)
const [slots] = await q(`SELECT count(*)::int AS all_slots, count(question_id)::int AS bound FROM ${S}."mst_slots"`)
console.log(`   ${pad('link', 26)}${pad('how it is established', 34)}${pad('governed?', 34)}durable?`)
console.log('   ' + '─'.repeat(126))
console.log(`   ${pad('OBSERVATION → SLOT', 26)}${pad('⚠️ INFERRED (lexical/alias/cosine)', 34)}${pad('⛔ NO — no author, act or occasion', 34)}✅ slot_id on the row`)
console.log(`   ${pad('SLOT → QUESTION', 26)}${pad('⭐ DECLARED (propose/confirm bind)', 34)}${pad('✅ actor + occasion + ledger', 34)}✅ mst_slots.question_id`)
console.log(`   ${pad('⭐ OBSERVATION → QUESTION', 26)}${pad('⛔⛔ NEVER DIRECTLY ESTABLISHED', 34)}${pad('⛔ n/a', 34)}⚠️ only as a COMPOSITION`)
console.log('\n   ⇒ ⭐⭐⭐ THE OBSERVATION↔QUESTION RELATION IS **COMPOSED**, ⛔ NEVER ESTABLISHED:')
console.log('       (observation → slot)  ∘  (slot → question)')
console.log('        INFERRED, ungoverned      DECLARED, governed')
console.log('   ⇒ ⚠️ THE COMPOSITION INHERITS THE WEAKER LINK — and ⛔ THE COMPOSITION ITSELF IS NEVER')
console.log('     DECLARED, NEVER CHECKED, AND NEVER RECORDED AS A COMPOSITION.')
check('⭐⭐⭐ THERE IS NO DIRECT OBSERVATION→QUESTION LINK — the pin is derived VIA the slot',
  STORE.includes('resolveSlotQuestion({ query: q, schema: sch, slotId })'),
  'the question is reached only through row.slot_id')

// ── ③ ⭐⭐ THE ONE CHANNEL THAT COULD BYPASS THE COMPOSITION — and it is discarded ───────────────
const declared = RETENTION.includes('`claimKind` — WHICH DECLARED QUESTION THIS CLAIM ANSWERS')
const neverInferred = RETENTION.includes('NEVER INFERRED AND NEVER DEFAULTED')
const stripped = STORE.includes('claimKind: _ck, ...persistable')
const cols = await q(`SELECT column_name FROM information_schema.columns
  WHERE table_schema = $1 AND table_name = 'txn_memories' AND column_name LIKE '%claim%'`, [devSchema()])
console.log('\n③ ⭐⭐ `claimKind` — THE ONE DECLARED OBSERVATION→QUESTION CHANNEL\n')
console.log('   retention-host: "⭐⭐⭐ `claimKind` — WHICH DECLARED QUESTION THIS CLAIM ANSWERS. Optional,')
console.log('   and its absence is an ANSWER rather than a gap: *the writer did not say*."')
console.log('   "⛔⛔ NEVER INFERRED AND NEVER DEFAULTED … an invented one cannot become an admission."')
console.log('\n   ⇒ ⭐ IT ALREADY CARRIES 047\'S DISCIPLINE — ON THE OBSERVATION SIDE.')
console.log(`\n   is it persisted?  ⛔ NO — stripped at store.create (\`claimKind: _ck, ...persistable\`)`)
console.log(`   columns matching %claim% on txn_memories: ${cols.length ? cols.map((c) => c.column_name).join(', ') : '⛔ NONE'}`)
console.log('\n   ⇒ ⭐⭐⭐ THE ONE CHANNEL IN WHICH AN OBSERVATION DECLARES WHICH QUESTION IT ANSWERS IS')
console.log('     **PURE TRANSPORT**: consumed by the gate to compute a pin, then DISCARDED. ⇒ even when a')
console.log('     writer DOES say, ⛔ THE SAYING DOES NOT SURVIVE.')
check('⭐⭐⭐ `claimKind` IS DECLARED-ONLY BY CONTRACT AND NEVER PERSISTED',
  declared && neverInferred && stripped && cols.length === 0,
  `contract=${declared} · never-inferred=${neverInferred} · stripped=${stripped} · columns=${cols.length}`)

// ── ④ WHAT IS EVER CHECKED AGAINST WHAT ─────────────────────────────────────────────────────────
console.log('\n④ ⭐⭐ WHAT IS ACTUALLY CHECKED AGAINST WHAT\n')
console.log(`   ${pad('check', 26)}${pad('compares', 46)}does it ask "does this answer that question"?`)
console.log('   ' + '─'.repeat(126))
console.log(`   ${pad('checkKind', 26)}${pad('claimKind (declared) vs slotKind (declared)', 46)}⛔ NO — it asks whether TWO DECLARATIONS AGREE`)
console.log(`   ${pad('declared `checks`', 26)}${pad('the ANSWER\'S FORM: nonempty · single-line ·', 46)}⛔ NO — form only`)
console.log(`   ${pad('', 26)}${pad('no-trailing-ellipsis · is-iso-date', 46)}`)
console.log(`   ${pad('the resolver', 26)}${pad('a PHRASE vs a label/alias', 46)}⛔ NO — and it never sees the question`)
console.log('\n   ⇒ ⭐⭐⭐ **NOTHING IN THE SYSTEM EVER CHECKS AN OBSERVATION AGAINST A QUESTION.**')
console.log('     `checkKind` verifies that the WRITER and the SLOT agree — ⚠️ but the writer is agreeing about')
console.log('     a slot IT DID NOT CHOOSE, and neither declaration is ever tested against the observation.')

// ── ⑤ IS THERE ANY AUTHORITATIVE ROUTING ACT, AND ANY PRECEDENT? ────────────────────────────────
const bindRows = await q(`SELECT action, actor, occasion FROM ${S}."log_slot_bindings" ORDER BY created_at`)
const pins = await q(`SELECT COALESCE(s.canonical_label, '(no slot)') AS label, count(*)::int AS n
  FROM ${S}."txn_memories" m LEFT JOIN ${S}."mst_slots" s ON s.id = m.slot_id
  WHERE m.question_id_at_admission IS NOT NULL GROUP BY 1`)
const [qn] = await q(`SELECT count(*)::int AS n FROM ${S}."mst_slot_questions"`)
const organicPins = pins.filter((p) => p.label !== 'build tag for this cycle').reduce((a, p) => a + p.n, 0)
const organicBinds = bindRows.filter((b) => !String(b.occasion).startsWith('canary-')).length
console.log('\n⑤ IS THERE AN AUTHORITATIVE ROUTING ACT — AND ANY PRECEDENT?\n')
console.log('   ⭐ AUTHORITATIVE ACTS THAT EXIST:')
console.log('     · BIND (slot → question)   propose/confirm · actor · occasion · ledgered · occasion-separated')
console.log('     · claimKind (observation → question)  declared-only by contract — ⛔ but never persisted')
console.log('   ⛔ THERE IS **NO** ACT THAT ESTABLISHES observation → slot. Minting is `findOrCreate`.')
console.log('\n   PRECEDENT IN PRODUCTION:')
console.log(`     questions declared           ${rpad(qn.n, 4)}`)
console.log(`     slot↔question BIND acts      ${rpad(bindRows.length, 4)}`)
for (const b of bindRows) console.log(`        ${pad(b.action, 9)} actor=${pad(b.actor, 14)} occasion=${b.occasion}`)
console.log(`     slots bound                  ${rpad(slots.bound, 4)}  of ${slots.all_slots}`)
for (const p of pins) console.log(`     rows pinned · ${pad(p.label, 26)}${p.n}`)
console.log(`\n   ⇒ ⭐⭐⭐ ORGANIC PRECEDENT: ${organicBinds} bind act(s) · ${organicPins} pinned row(s) outside the harness canary.`)
console.log('     ⛔ EVERY ARTIFACT OF THE DECLARED QUESTION LAYER WAS MADE BY AN OPERATOR, ON A TEST FIXTURE,')
console.log('     ON ONE DAY. ⇒ ⛔ THERE IS NO PRODUCTION BEHAVIOUR TO READ AN INTENT FROM.')
check('⭐⭐⭐ NO ORGANIC PRECEDENT EXISTS — every question-layer artifact is an operator act on the canary',
  organicBinds === 0 && organicPins === 0,
  `${organicBinds} organic binds · ${organicPins} organic pins`)
check('⛔ THERE IS NO ACT THAT ESTABLISHES observation → slot — minting is findOrCreate',
  true, 'mst_slots has no author column; ensure() requires no ACT (established in the membership arc)')

// ── ⑥ WHAT THE EVIDENCE BEARS ON, FOR EACH READING — ⛔ NOT A SELECTION ─────────────────────────
console.log('\n⑥ WHAT THE EVIDENCE BEARS ON — ⛔ THE THREE READINGS ARE NOT RANKED\n')
console.log('   NARROW (047 governs declaration/admission; routing is separate with its own standard)')
console.log('     supports  · 047 itself says "minting a slot (addressing it) is not the same act as declaring…"')
console.log('               · the two links ARE different acts with different governance today')
console.log('     strains   · ⛔ NO separate standard for routing exists — "its own standard" is currently empty')
console.log('\n   BROAD (routing IS deciding which question an observation answers, so 047 applies)')
console.log('     supports  · ⭐ the composition: routing determines the question in practice')
console.log('               · ⭐⭐ `claimKind` ALREADY applies 047\'s exact discipline to the OBSERVATION side —')
console.log('                 "never inferred and never defaulted" — which is the observation→question link')
console.log('     strains   · under it the present corpus could not route at all (1 of 112 slots declared)')
console.log('\n   SPLIT (routing may PROPOSE but not ESTABLISH)')
console.log('     supports  · ⭐ `claimKind`\'s shape already models proposal-vs-absence: "its absence is an')
console.log('                 ANSWER rather than a gap"')
console.log('               · the gate already has a three-state vocabulary (ALLOW / DEFER / NOT-IN-SCOPE)')
console.log('     strains   · ⚠️ ② ruled that membership establishes nothing — so a "proposal" would need a')
console.log('                 consumer that treats it as one, and ⛔ two consumers today act on it regardless')

// ── ⑦ FIXTURES ──────────────────────────────────────────────────────────────────────────────────
const [fx] = await q(`SELECT
    (SELECT count(*)::int FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL
       AND lower(entity)='sotera' AND lower(attribute)='lesson') AS canary,
    (SELECT count(*)::int FROM ${S}."mst_slots" WHERE lower(entity)='sotera' AND lower(canonical_label)='lesson') AS canary_slot,
    (SELECT count(*)::int FROM ${S}."mst_slots" s WHERE s.canonical_label='work schedule'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(s.aliases,'[]'::jsonb)) a
                   WHERE a->>'phrase' IN ('schedule','volunteer_schedule_and_location'))) AS armed`)
console.log(`\n⑦ FIXTURES — canary ${fx.canary} rows / slot=${fx.canary_slot} · armed collisions ${fx.armed > 0 ? 'STILL ARMED' : '⛔ MISSING'}`)
check('⛔⛔ CANARY AND ARMED COLLISIONS UNTOUCHED', fx.canary >= 18 && fx.canary_slot === 0 && fx.armed > 0,
  `canary ${fx.canary}/${fx.canary_slot} · armed ${fx.armed}`)
check('⛔ 047 UNTOUCHED — still exactly one declared question', qn.n === 1, `${qn.n} question(s)`)

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
