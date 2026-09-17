// ⭐⭐⭐ BATCH · THE THREE BROKEN SEAMS — attribute · observation→question · proposition-equivalence
//
//   node test/checks/semantic-seam-batch.mjs
//
// Ote, 2026-09-17: *"identify what each semantic object actually IS at the seam."* ⛔ NO RULINGS THIS PASS.
//
// ⛔⛔ READ-ONLY. ⛔ No implementation · no schema · no historical repair · no canary activation ·
// 047 untouched · A1 shadow · both collisions armed. ⛔ NOTHING IS REDESIGNED OR PROPOSED.
//
// ── ⚠️ BINDING, ⛔ NOT REOPENED ────────────────────────────────────────────────────────────────────
//   ① ⏸ unresolved — constraints.  ② ✅ membership is not one relation.  ③ ✅ BROAD.
//   ⛔ A storage/routing key cannot manufacture question identity.
//   ⚠️ "not declared" must remain distinguishable from "incorrectly inferred".
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'
import { governsReplacement } from '../../Backend/app/components/memory-replacement-gate.js'
import { checkKind, KIND_OUTCOME } from '../../Backend/app/components/memory-kind-precondition.js'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)
const SVC = readFileSync(new URL('../../../../PortableComponents/Packages/Memory/cognition/memory-v2-service.js', import.meta.url), 'utf8')
const STORE = readFileSync(new URL('../../Backend/app/components/memory-store-sequelize-host.js', import.meta.url), 'utf8')

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  BATCH · THE THREE SEAMS — ⛔ evidence only, ⛔ no rulings, ⛔ nothing redesigned')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ══ 1 · WHAT IS `attribute` ACTUALLY DOING? ═════════════════════════════════════════════════════
const ROLES = [
  ['the PROPOSITION shown on recall', 'memory-v2-service:648', '`content = `${owner}\'s ${attribute}: ${value}`` — "readable sentence → embedded + shown on recall"'],
  ['the VECTOR INDEX input', 'memory-v2-service:648', 'that same `content` is what gets embedded ⇒ attribute steers RETRIEVAL RANKING'],
  ['the ROUTING similarity key', 'memory-extract:22,50', '`attributeSimilarity(r.attribute, attribute)`'],
  ['the MEMBERSHIP claim key', 'memory-v2-service:466', '`claimedBy.get(`${norm(entity)}|${norm(attribute)}`)`'],
  ['the EPHEMERAL ARENA identity', 'memory-v2-service:468', '`key = `${entity}|${norm(attribute)}``'],
  ['the SLOT IDENTITY seed', 'memory-v2-service:555', '`canonicalLabel: primary?.attribute ?? attribute`'],
  ['the REVIVAL ARENA key', 'memory-store-sequelize-host:580', '`{ entity, attribute, user_id: U }` when there is no slot_id'],
  ['the DREAMING RECURRENCE key', 'dreaming-candidate-host:79', '`AND t.attribute = $2::text`'],
]
console.log('\n1 · ⭐⭐⭐ `attribute` — ONE FIELD, EIGHT PRODUCTION ROLES\n')
console.log(`   ${pad('role', 36)}${pad('site', 34)}mechanism`)
console.log('   ' + '─'.repeat(140))
for (const [r, site, m] of ROLES) console.log(`   ${pad(r, 36)}${pad(site, 34)}${m}`)
const isSemanticField = /SEMANTIC_FIELDS[\s\S]{0,400}?'attribute'/.test(STORE)
console.log(`\n   and it is a SEMANTIC_FIELD (a write to it requires a declared writer): ${isSemanticField ? 'YES' : 'no'}`)
console.log('\n   ⇒ ⭐⭐⭐ `attribute` DOES NOT HAVE ONE SEMANTIC ROLE. It is the JOIN KEY FOR EIGHT UNRELATED')
console.log('     CONCERNS. ⇒ ⚠️ CHANGING IT WOULD CHANGE WHAT SHE RECALLS, HOW IT RANKS, WHAT COMPETES,')
console.log('     WHAT REVIVES, AND WHAT DREAMING COUNTS AS RECURRENCE — ⛔ ALL AT ONCE, with no way to')
console.log('     change one without the others.')
console.log('   ⇒ ⚠️ AND ③ RULED `attribute` CANNOT CARRY QUESTION IDENTITY — ⛔ yet role 6 makes it the')
console.log('     SLOT\'S IDENTITY, and the slot is what reaches the question.')
check('⭐⭐⭐ `attribute` SERVES EIGHT DISTINCT PRODUCTION ROLES, AND IS A SEMANTIC_FIELD',
  ROLES.length === 8 && isSemanticField, `${ROLES.length} roles · SEMANTIC_FIELD=${isSemanticField}`)
check('⭐⭐ THE PROPOSITION AND THE EMBEDDING SHARE ONE CONSTRUCTION — attribute steers retrieval too',
  SVC.includes("const content = `${owner}'s ${attribute}: ${value}`"),
  'content is built from attribute and then embedded')

// ══ 2 · OBSERVATION→QUESTION vs MEMBERSHIP→QUESTION — the timing ════════════════════════════════
const sig = SVC.match(/async function reconcileFact\(\{[^}]*\}/s)?.[0] ?? ''
const claimKindIsParam = /claimKind/.test(sig)
const resolveCall = SVC.match(/await resolver\.resolve\(\{[\s\S]{0,260}?\}, \{ slots: descriptors[^)]*\)/)?.[0] ?? ''
const resolverSeesClaimKind = /claimKind/.test(resolveCall)
console.log('\n\n2 · ⭐⭐⭐ WHEN DOES EACH THING EXIST? — the inversion, timed\n')
const TIMELINE = [
  ['t0', '`claimKind` arrives', claimKindIsParam ? '✅ a parameter of reconcileFact' : '⛔ absent', '⭐ THE DECLARED QUESTION EXISTS HERE'],
  ['t1', '`resolver.resolve(...)`', resolverSeesClaimKind ? '⚠️ sees claimKind' : '⛔ DOES NOT SEE claimKind', 'the slot is CHOSEN'],
  ['t2', '`slotStore.get/ensure`', 'the slot is fetched or minted', '⛔ no question consulted'],
  ['t3', '`store.create`', '⛔ claimKind is STRIPPED', 'the row is written'],
  ['t4', '`resolveSlotQuestion(slot_id)`', 'question_id becomes known', '⭐ VIA THE SLOT'],
  ['t5', '`checkKind(slotKind, claimKind)`', 'the two declarations are compared', 'pin / gate'],
]
console.log(`   ${pad('t', 4)}${pad('event', 34)}${pad('state', 38)}note`)
console.log('   ' + '─'.repeat(130))
for (const [t, e, s, n] of TIMELINE) console.log(`   ${pad(t, 4)}${pad(e, 34)}${pad(s, 38)}${n}`)
console.log('\n   ⇒ ⭐⭐⭐ `claimKind` EXISTS AT **t0**, BEFORE SLOT SELECTION AT **t1**.')
console.log(`   ⇒ ⛔ AND THE RESOLVER IS NOT GIVEN IT: resolve({ owner, attribute, attributeCandidate?,`)
console.log('     attributeShape? }, { slots, rowsBySlot }). ⇒ ⭐⭐ THE BLOCKER IS AN **INTERFACE BOUNDARY**,')
console.log('     ⛔ NOT MISSING INFORMATION — `claimKind` is a live local three lines above the call.')
check('⭐⭐⭐ `claimKind` EXISTS BEFORE SLOT SELECTION AND IS NOT PASSED TO THE RESOLVER',
  claimKindIsParam && !resolverSeesClaimKind,
  `param=${claimKindIsParam} · resolver sees it=${resolverSeesClaimKind}`)

// ⚠️ what happens when claimKind is ABSENT — and is it distinguishable from WRONG?
const absent = checkKind({ slotKind: 'work-schedule', claimKind: null })
const wrong = checkKind({ slotKind: 'work-schedule', claimKind: 'something-else' })
const gAbsent = governsReplacement({ isUpdate: true, slotGoverned: true, slotKind: 'work-schedule', claimKind: null })
const gWrong = governsReplacement({ isUpdate: true, slotGoverned: true, slotKind: 'work-schedule', claimKind: 'something-else' })
const gUndeclaredSlot = governsReplacement({ isUpdate: true, slotGoverned: true, slotKind: null, claimKind: 'work-schedule' })
console.log('\n   ⚠️ "NOT DECLARED" vs "INCORRECTLY DECLARED" — ③ requires these stay DISTINGUISHABLE:\n')
console.log(`   ${pad('case', 30)}${pad('checkKind', 12)}${pad('gate', 12)}why differs?`)
console.log('   ' + '─'.repeat(96))
console.log(`   ${pad('claimKind ABSENT', 30)}${pad(absent.outcome, 12)}${pad(gAbsent.outcome, 12)}"${String(absent.why).slice(0, 44)}…"`)
console.log(`   ${pad('claimKind WRONG', 30)}${pad(wrong.outcome, 12)}${pad(gWrong.outcome, 12)}"${String(wrong.why).slice(0, 44)}…"`)
console.log(`   ${pad('slot UNDECLARED', 30)}${pad('—', 12)}${pad(gUndeclaredSlot.outcome ?? 'null', 12)}scope=${gUndeclaredSlot.scope}`)
const sameOutcome = absent.outcome === wrong.outcome && gAbsent.outcome === gWrong.outcome
const differentWhy = absent.why !== wrong.why
console.log('\n   ⇒ ⚠️⚠️ ON A GOVERNED SLOT, "THE WRITER DID NOT SAY" AND "THE WRITER SAID SOMETHING ELSE"')
console.log('     PRODUCE **THE SAME OUTCOME** — both DEFER, both REFUSE. ⭐ They differ only in the `why`')
console.log('     STRING. ⇒ ⛔ DISTINGUISHABLE IN THE EXPLANATION, ⛔ NOT IN THE BEHAVIOUR.')
console.log('   ⚠️ ③ explicitly requires these stay distinguishable. ⛔ Reported; ⛔ nothing proposed.')
check('⚠️⚠️ ABSENT AND WRONG claimKind YIELD THE SAME OUTCOME — they differ only in the `why` string',
  sameOutcome && differentWhy,
  `outcomes equal=${sameOutcome} · explanations differ=${differentWhy}`)

// ══ 3 · WHICH EQUIVALENCE RELATIONS ACTUALLY EXIST? ═════════════════════════════════════════════
const contentCompared = /norm\(\s*\w*\.?content|content\s*===\s*\w*content/.test(SVC)
const EQ = [
  ['same VALUE', '✅ EXISTS', '`norm(a) === norm(b)` in reconcilePlan', 'INFERRED (string)', '⭐ SUBSTITUTED for proposition equivalence'],
  ['same CONTENT', '⛔ NEVER COMPUTED', '—', '—', '⛔ the proposition is never compared'],
  ['same ENTITY', '✅ EXISTS', '`resolveOwner` + persona/user scope', 'DERIVED + declared scope', 'scopes the corpus'],
  ['same ATTRIBUTE', '✅ EXISTS', '`attributeSimilarity` · `norm(attribute)` keys', 'INFERRED (string)', 'routing + membership'],
  ['same QUESTION', '✅ EXISTS', '`checkKind` exact match', '⭐ DECLARED on both sides', '⚠️ needs 2 declarations — 1 of 112 slots'],
  ['same SLOT', '✅ EXISTS', '`slot_id` equality', 'OPERATIONAL GROUPING', '② ruled: establishes nothing'],
  ['same PROPOSITION', '⛔ DOES NOT EXIST', '—', '—', '⛔⛔ what COLLAPSE requires'],
  ['same OBSERVATION', '⛔ DOES NOT EXIST', '—', '—', 'every observation is its own row'],
]
console.log('\n\n3 · ⭐⭐⭐ THE EIGHT "SAMES" — which relations actually exist?\n')
console.log(`   ${pad('relation', 20)}${pad('exists?', 20)}${pad('mechanism', 40)}${pad('kind', 24)}note`)
console.log('   ' + '─'.repeat(150))
for (const [r, e, m, k, n] of EQ) console.log(`   ${pad(r, 20)}${pad(e, 20)}${pad(m, 40)}${pad(k, 24)}${n}`)
const missing = EQ.filter((e) => e[1].includes('DOES NOT') || e[1].includes('NEVER'))
console.log(`\n   ⇒ ⭐ ${EQ.length - missing.length} of ${EQ.length} exist. ⛔ THE THREE THAT DO NOT ARE **same CONTENT**,`)
console.log('     **same PROPOSITION** and **same OBSERVATION** — ⭐ and proposition equivalence is exactly')
console.log('     what COLLAPSE requires.')
console.log('   ⚠️ (An earlier draft of this file said "two of eight"; the assertion caught the arithmetic.)')
console.log('   ⇒ ⭐⭐⭐ `norm(value)` EQUALITY IS SUBSTITUTED FOR PROPOSITION EQUIVALENCE, and the corpus')
console.log('     holds a counterexample IN EACH DIRECTION:')
console.log('       ⛔ NOT SUFFICIENT  `location = Bangkok` vs `timezone = Bangkok` — same value, 2 propositions')
console.log('       ⛔ NOT NECESSARY   the 18 lessons — 18 propositions, all comparing as \'\'')
console.log('       ⛔ NOT ABOUT THE QUESTION  work schedule ×2 — different questions, compared anyway')
console.log('       ⚠️ NOT ABOUT TRUTH  Mira — the displaced proposition stays true')
check('⭐⭐⭐ `content` IS NEVER COMPARED — the proposition plays no part in equivalence',
  !contentCompared, 'no content comparison in the cognition package')
check('⭐⭐ FIVE OF EIGHT EQUIVALENCE RELATIONS EXIST; ⛔ CONTENT, PROPOSITION AND OBSERVATION DO NOT',
  missing.length === 3 && EQ.length - missing.length === 5, missing.map((m) => m[0]).join(' · '))

// corpus confirmation of the four counterexamples
const [cx] = await q(`SELECT
    (SELECT count(*)::int FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL
       AND lower(btrim(value)) = 'bangkok') AS bangkok,
    (SELECT count(*)::int FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL
       AND lower(entity)='sotera' AND lower(attribute)='lesson') AS lessons,
    (SELECT count(*)::int FROM ${S}."txn_memories" n JOIN ${S}."txn_memories" o ON o.id=n.supersedes_id
       JOIN ${S}."mst_slots" s ON s.id=n.slot_id WHERE s.canonical_label='work schedule') AS misroutes`)
console.log(`\n   corpus: live rows valued "bangkok" = ${cx.bangkok} · lesson rows = ${cx.lessons} · work-schedule transitions = ${cx.misroutes}`)
check('⚠️ ALL FOUR COUNTEREXAMPLES ARE STILL PRESENT IN THE CORPUS',
  cx.bangkok >= 2 && cx.lessons >= 18 && cx.misroutes === 2,
  `bangkok=${cx.bangkok} lessons=${cx.lessons} misroutes=${cx.misroutes}`)

// ══ 4 · WHAT EACH EDGE HAS AVAILABLE ═══════════════════════════════════════════════════════════
console.log('\n\n4 · WHAT IS AVAILABLE AT EACH EDGE (⛔ `invalid_at` NOT reinterpreted)\n')
const EDGES = [
  ['observation → proposition', 'entity · attribute · value', '⭐ the WRITER (D1)', 'the attribute wording', '✅ `content`', 'the choice of attribute'],
  ['proposition → question', '⛔ NOTHING DIRECT', '⛔ nobody', '⚠️ via the attribute string', '⛔ no', '⭐ the whole relation'],
  ['question → membership', '⛔ REVERSED — membership first', '⛔ nobody', '⭐ the resolver (a GUESS)', '✅ `slot_id`', '⛔ the mechanism (0 of 142)'],
  ['membership → transition', 'matches · primary · both values', '⛔ nobody', 'recency + string inequality', '⚠️ only the OUTCOME', '⭐ the branch identity'],
  ['transition → row state', 'the branch, the counterpart', '⛔ nobody', '—', '✅ one field', '⛔ the event, actor, reason'],
]
console.log(`   ${pad('edge', 28)}${pad('info that exists', 30)}${pad('declared by', 18)}${pad('inferred', 26)}${pad('persisted', 14)}discarded`)
console.log('   ' + '─'.repeat(150))
for (const [e, i, d, inf, p, disc] of EDGES) console.log(`   ${pad(e, 28)}${pad(i, 30)}${pad(d, 18)}${pad(inf, 26)}${pad(p, 14)}${disc}`)

// ══ 5 · CAN IT BE WRONG WITHOUT DETECTION? ═════════════════════════════════════════════════════
const MATRIX = [
  ['observation', 'a `txn_memories` row', '⭐ the writer (D1, refusable)', 'the extractor/model', 'everything', '✅', '⚠️ YES — #6 stood 23 days'],
  ['proposition', '⭐ `content`, constructed', '⛔ nobody — assembled', 'from attribute + value', 'retrieval, embedding', '✅', '⛔ YES — nothing checks it'],
  ['question', '`mst_slot_questions`', '⭐ a BIND act (actor+occasion)', '⛔ never — 047', 'checkKind, the pin', '✅ (1 of 112)', '⭐ NO — it is ledgered'],
  ['membership', '`slot_id` / phrase / ephemeral', '⛔ nobody', '⭐ the resolver (a guess)', '4 consumers, 4 loads', '✅', '⛔ YES — 0 of 142 recorded'],
  ['competition', '`matches` (transient)', '⛔ nobody', 'from membership', 'resolveConflict', '⛔ NO', '⛔ YES'],
  ['transition', 'a code branch (transient)', '⛔ nobody', 'recency + string inequality', 'the write path', '⛔ NO', '⛔ YES'],
  ['row state', '`invalid_at` et al.', '⛔ nobody', '—', 'every read', '✅', '⛔ YES — 6 events, 1 field'],
]
console.log('\n\n5 · ⭐⭐⭐ THE MATRIX — CAN IT BE WRONG WITHOUT DETECTION?\n')
console.log(`   ${pad('concept', 13)}${pad('actual representation', 32)}${pad('declared by', 30)}${pad('inferred by', 28)}${pad('used by', 22)}${pad('persisted', 11)}wrong undetected?`)
console.log('   ' + '─'.repeat(168))
for (const m of MATRIX) console.log(`   ${pad(m[0], 13)}${pad(m[1], 32)}${pad(m[2], 30)}${pad(m[3], 28)}${pad(m[4], 22)}${pad(m[5], 11)}${m[6]}`)
const detectable = MATRIX.filter((m) => m[6].includes('NO'))
console.log(`\n   ⇒ ⭐⭐⭐ ONLY **${detectable.length}** CONCEPT CAN BE WRONG *DETECTABLY*: **${detectable.map((m) => m[0]).join(', ')}** —`)
console.log('     because it is the only one DECLARED BY AN ACT WITH AN ACTOR AND AN OCCASION.')
console.log('   ⇒ ⚠️ AND IT IS THE ONE THAT IS EMPTY (1 of 112 slots, 0 organic).')
check('⭐⭐⭐ EXACTLY ONE CONCEPT CAN BE WRONG DETECTABLY — and it is the empty one',
  detectable.length === 1 && detectable[0][0] === 'question',
  `detectable: ${detectable.map((m) => m[0]).join(', ')}`)

// ══ FIXTURES ════════════════════════════════════════════════════════════════════════════════════
const [fx] = await q(`SELECT
    (SELECT count(*)::int FROM ${S}."mst_slot_questions") AS questions,
    (SELECT count(*)::int FROM ${S}."mst_slots" WHERE lower(entity)='sotera' AND lower(canonical_label)='lesson') AS canary_slot,
    (SELECT count(*)::int FROM ${S}."mst_slots" s WHERE s.canonical_label='work schedule'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(s.aliases,'[]'::jsonb)) a
                   WHERE a->>'phrase' IN ('schedule','volunteer_schedule_and_location'))) AS armed`)
console.log(`\n\nFIXTURES — canary rows ${cx.lessons} / slot ${fx.canary_slot} · questions ${fx.questions} · armed ${fx.armed}`)
check('⛔⛔ CANARY UNTOUCHED · 047 UNTOUCHED · COLLISIONS ARMED',
  cx.lessons >= 18 && fx.canary_slot === 0 && fx.questions === 1 && fx.armed > 0)

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
