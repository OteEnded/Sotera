// ⭐⭐⭐ THE TWO ADMISSION CONTROLS — required for "done" (Ote, 2026-09-17).
//
//   node test/checks/admission-controls-check.mjs
//
// ── ⛔⛔ WHY BOTH, AND WHY CONTROL B IS THE ONE THAT MATTERS ────────────────────────────────────────
//
//     Ote: *"The ADMIT control is especially important because today's corpus would otherwise make it
//      possible to 'prove' the implementation with nothing but universal DEFER."*
//
// ⭐ Today NOT ONE row in the corpus carries a `question_id_at_admission`, so EVERY pair resolves to DEFER.
// ⇒ a suite that only asserts *"nothing was invalidated"* would pass **on a gate that refused everything**,
// and equally on a gate that was never wired at all. That is RP-D0's lesson, one layer up:
//
//     *"A 100% DEFER suite is not evidence that the gate works. The positive control must first prove that
//      ALLOW is reachable."*
//
// ⇒ ⭐⭐⭐ CONTROL B **CONSTRUCTS** BOTH SIDES — declares a question, binds a slot, writes a first row that
// EARNS A PIN, and ASSERTS THAT PIN EXISTS before it even tries the second write. ⛔ It never looks for an
// established pair in the corpus, because there is none to find.
//
// ── ⛔ SAFETY ───────────────────────────────────────────────────────────────────────────────────────
// Writes only as `agent_dev` — ⛔ NEVER root. Every artefact is `zz_`-prefixed and removed, and the
// teardown is ASSERTED rather than trusted. ⛔ The canary is not armed, touched or read into.
import { makeChecker, devSchema, devPg } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryV2 } from '../../Backend/app/components/memory-v2-host.js'
import {
  declareQuestion, proposeBind, confirmBind,
} from '../../Backend/app/components/memory-declaration-host.js'
import { admitPair, ADMISSION } from '../../Backend/app/components/memory-admission-gate.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'
import { WRITER as W, ACT_KIND as AK } from '../../Backend/app/components/memory-writer-contracts.js'

const { check, done } = makeChecker()
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
const schema = devSchema()
const seq = db.txn_memories.sequelize
const Q = (s, r = {}) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })
const X = (s, r = {}) => seq.query(s, { replacements: r })
const query = async (sql, p = []) => ({ rows: await seq.query(sql, { bind: p, type: 'SELECT' }) })
const pg = devPg(); await pg.connect()

const t = Date.now()
const MADE = []
const SLOTS = []
const QKEY = `zz_admq${t}`
let userId = null
let slotId = null

try {
  const [u] = await Q(`SELECT id::text FROM "${schema}"."mst_users" WHERE username = 'agent_dev'`)
  if (!u) throw new Error('agent_dev not found — this check must never run as root')
  userId = u.id

  // ══ 0 · ⭐⭐ THE PURE GATE FIRST — all four outcomes, ⛔ before any IO can hide a wiring error ══════
  const pure = [
    ['NOT-IN-SCOPE — nothing would be displaced', { exclusivityBearing: false }, ADMISSION.notInScope],
    ['DEFER — neither side established', { exclusivityBearing: true }, ADMISSION.defer],
    ['DEFER — only the incoming declares', { exclusivityBearing: true, incomingQuestionKey: 'a' }, ADMISSION.defer],
    ['DEFER — only the incumbent is pinned', { exclusivityBearing: true, incumbentQuestionKey: 'a' }, ADMISSION.defer],
    ['⭐ ABSTAIN — both established and DIFFERENT', { exclusivityBearing: true, incomingQuestionKey: 'a', incumbentQuestionKey: 'b' }, ADMISSION.abstain],
    ['⭐ ADMIT — both established and EQUAL', { exclusivityBearing: true, incomingQuestionKey: 'a', incumbentQuestionKey: 'a' }, ADMISSION.admit],
  ]
  for (const [label, args, want] of pure) {
    const got = admitPair(args).outcome
    check(`0 · PURE GATE · ${label}`, got === want, `got ${got}, want ${want}`)
  }
  check('0z · ⭐⭐ ABSTAIN IS UNREACHABLE WITHOUT BOTH SIDES — a missing side can NEVER produce the '
    + 'positive finding, only the absence', [
    admitPair({ exclusivityBearing: true, incomingQuestionKey: 'a' }).outcome,
    admitPair({ exclusivityBearing: true, incumbentQuestionKey: 'a' }).outcome,
    admitPair({ exclusivityBearing: true }).outcome,
  ].every((o) => o === ADMISSION.defer), 'all three are DEFER')

  // ══ 1 · ⭐⭐⭐ CONTROL A — AN UNDECLARED VOLUNTEERED FACT COEXISTS, AND COMPETES WITH NOTHING ═══════
  //
  // ⭐ THE SHAPE OF THE ORIGINAL DEFECT, deliberately: two writes to the SAME attribute with DIFFERENT
  // values. Before admission this was an UPDATE — the first row invalidated, the second superseding it.
  const mem = buildMemoryV2(fastify, {
    userId, writer: W.operator, act: { kind: AK.operator, id: `zz_admission_control_${t}` },
  })
  // ⭐ SINGLE-TOKEN, MUTUALLY DISSIMILAR NAMES. The first draft used `zz_adm_attr_…` / `zz_adm_label_…`,
  // which share the tokens `zz`+`adm` and therefore GROUPED WITH EACH OTHER at containment ≥ 0.7 —
  // every zz row became a candidate for every other. ⛔ Harmless to the assertions, ⚠️ but it made the
  // ledger counts meaningless. ⭐ A control's own fixtures must not collide in the mechanism under test.
  const ATTR = `zz_admalpha${t}`
  const r1 = await mem.reconcileFact({ entity: 'user', attribute: ATTR, value: 'first value', source: 'zz_adm' })
  const r2 = await mem.reconcileFact({ entity: 'user', attribute: ATTR, value: 'second and DIFFERENT value', source: 'zz_adm' })
  MADE.push(r1.id, r2.id)

  const rows = await Q(
    `SELECT id::text, value, (invalid_at IS NOT NULL) AS dead, supersedes_id::text AS sup,
            question_id_at_admission::text AS pin
       FROM "${schema}"."txn_memories" WHERE id IN (:a, :b) ORDER BY created_at`,
    { a: r1.id, b: r2.id })

  check('1 · ⭐ BOTH ROWS EXIST — ⛔ A — ACCEPT: an undeclared question never prevents memory FORMATION',
    rows.length === 2, `${rows.length} rows · actions ${r1.action}/${r2.action}`)
  check('1a · ⭐⭐⭐ NEITHER IS INVALIDATED — ⛔ the undeclared pair did NOT compete',
    rows.every((r) => !r.dead), rows.map((r) => `${String(r.value).slice(0, 18)}=${r.dead ? 'DEAD' : 'live'}`).join(' · '))
  check('1b · ⭐⭐ AND NEITHER SUPERSEDES THE OTHER — ⛔ no exclusivity was acquired',
    rows.every((r) => !r.sup), rows.map((r) => r.sup ?? '-').join(' · '))
  check('1c · ⭐⭐ THE SECOND WRITE WAS AN `add`, ⛔ NOT an `update` — this is the behaviour change, at the '
    + 'exact shape that used to displace', r2.action === 'add', `action=${r2.action}`)
  check('1d · ⭐ AND NEITHER EARNED A PIN — undeclared stays undeclared, FORWARD. ⛔ No backfill, and no '
    + 'row quietly becomes an established incumbent', rows.every((r) => !r.pin), rows.map((r) => r.pin ?? '-').join(' · '))

  const led = await Q(
    `SELECT outcome, incoming_question_key AS ink, incumbent_question_key AS curk, why
       FROM "${schema}"."log_memory_admissions" WHERE incumbent_id = :i OR incoming_id = :i`, { i: r1.id })
  check('1e · ⭐⭐ A DEFER LEDGER ROW NAMES THE PAIR AND THE REMEDY — ⛔ a refusal a reader cannot act on '
    + 'is noise', led.length >= 1 && led.every((l) => l.outcome === 'DEFER'),
  led.map((l) => `${l.outcome}: ${String(l.why).slice(0, 62)}`).join(' | ') || 'NO LEDGER ROW')
  check('1f · ⭐ …and its NULLs are stored as NULL — ⛔ "not established" is never dressed up as a question',
    led.length >= 1 && led.every((l) => l.ink === null && l.curk === null),
    led.map((l) => `${l.ink ?? 'NULL'}/${l.curk ?? 'NULL'}`).join(' · '))

  // ══ 2 · ⭐⭐⭐ CONTROL B — A GENUINELY TWO-SIDED PAIR STILL ADMITS ═════════════════════════════════
  //
  // ⛔ NOTHING BELOW IS FOUND; EVERY PIECE IS CONSTRUCTED. The corpus contains no established pair, so a
  // check that searched for one would be vacuous by construction.
  //
  // ⚠️ AND THE SLOT IS MINTED BY `reconcileFact` ITSELF, ⛔ not inserted by hand. A hand-inserted slot holds
  // no live row, and `buildSlotView` only offers the resolver slots that DO — so the resolver would never
  // see it and the row would land somewhere else entirely. ⭐ Caught by this control failing honestly.
  const ATTR_B = `zz_admbravo${t}`
  const memB = buildMemoryV2(fastify, {
    userId, writer: W.operator, act: { kind: AK.operator, id: `zz_admission_controlB_${t}` },
    occasion: `zz_adm_consume_${t}`,
  })
  // ⭐ b0 MINTS the slot, with the entity and label the resolver will actually match later.
  const b0 = await memB.reconcileFact({ entity: 'user', attribute: ATTR_B, value: 'grey', source: 'zz_adm' })
  MADE.push(b0.id)
  const [b0row] = await Q(`SELECT slot_id::text AS slot FROM "${schema}"."txn_memories" WHERE id = :i`, { i: b0.id })
  slotId = b0row?.slot ?? null
  if (slotId) SLOTS.push(slotId)
  check('2 · the control MINTED a real slot through the production path', !!slotId, `slot=${slotId ?? 'NULL'}`)

  const d = await declareQuestion({
    query, schema, questionKey: QKEY, asks: 'what is the zz status?', checks: ['nonempty'],
    declaredBy: 'admission-control', occasion: `zz_adm_declare_${t}`,
  })
  const p = await proposeBind({
    query, schema, slotId, questionId: d.question.id, declaredIntent: 'first-bind',
    actor: 'admission-control', occasion: `zz_adm_propose_${t}`, reason: 'control B',
  })
  await confirmBind({ query, schema, proposalId: p.proposal.id, actor: 'admission-control', occasion: `zz_adm_confirm_${t}`, reason: 'control B' })

  // ⭐ THE FIRST SIDE — written into the now-governed slot WITH a declared claim, so it EARNS the pin.
  const storeB = createSequelizeMemoryStore({
    db, persona: null, userId, config, log: null,
    writer: W.operator, act: { kind: AK.operator, id: `zz_admission_controlB_${t}` },
    occasion: `zz_adm_consume_${t}`,
  })
  const b1 = await storeB.create({
    kind: 'semantic', namespace: 'default', content: `user's ${ATTR_B}: green`,
    entity: 'user', attribute: ATTR_B, value: 'green', importance: 5, source: 'zz_adm',
    slot_id: slotId, claimKind: QKEY,
  })
  MADE.push(b1.id)
  const [pin1] = await Q(`SELECT question_id_at_admission::text AS pin FROM "${schema}"."txn_memories" WHERE id = :i`, { i: b1.id })
  check('2a · ⭐⭐⭐ THE FIRST SIDE IS PROVED BEFORE THE SECOND IS TRIED — the row EARNED a pin, so an '
    + 'ESTABLISHED INCUMBENT NOW EXISTS. ⛔ Without this, an ADMIT below would prove nothing',
  !!pin1?.pin, `pin=${pin1?.pin ?? 'NULL'}`)

  // ⭐ THE SECOND SIDE — same declared question, DIFFERENT value ⇒ a genuine competition.
  const b2 = await memB.reconcileFact({ entity: 'user', attribute: ATTR_B, value: 'amber', source: 'zz_adm', claimKind: QKEY })
  MADE.push(b2.id)
  const bRows = await Q(
    `SELECT id::text, (invalid_at IS NOT NULL) AS dead, supersedes_id::text AS sup,
            question_id_at_admission::text AS pin
       FROM "${schema}"."txn_memories" WHERE id IN (:a, :b, :c)`, { a: b0.id, b: b1.id, c: b2.id })
  const zero = bRows.find((r) => r.id === b0.id)
  const first = bRows.find((r) => r.id === b1.id)
  const second = bRows.find((r) => r.id === b2.id)

  check('2b · ⭐⭐⭐ ADMIT — A TWO-SIDED, SAME-QUESTION PAIR STILL COMPETES. The established incumbent IS '
    + 'invalidated', !!first?.dead, `first dead=${first?.dead} · action=${b2.action}`)
  check('2c · ⭐⭐ …and the successor SUPERSEDES it, so the exclusivity act happened in full',
    second?.sup === b1.id, `sup=${second?.sup ?? '-'} want=${b1.id}`)
  check('2d · ⭐ …and the successor EARNED ITS OWN PIN — ⭐⭐ THE WARRANT PROPAGATES FORWARD, which is why '
    + 'no backfill is needed', !!second?.pin, `pin=${second?.pin ?? 'NULL'}`)
  check('2e · ⭐⭐⭐ AND PER-PAIR ADMISSION IS PROVED IN THE SAME WRITE — `b0`, grouped into the SAME slot '
    + 'but carrying NO pin, was DEFERRED and is STILL LIVE while the established one was displaced. '
    + '⛔ One bucket, TWO different verdicts', !zero?.dead && !!first?.dead,
  `b0 dead=${zero?.dead} · b1 dead=${first?.dead}`)

  const ledB = await Q(
    `SELECT outcome, incoming_question_key AS ink, incumbent_question_key AS curk
       FROM "${schema}"."log_memory_admissions" WHERE incumbent_id IN (:a, :b)`, { a: b0.id, b: b1.id })
  check('2f · ⭐⭐ AN ADMIT LEDGER ROW RECORDS BOTH SIDES — ⛔ and the schema check would have REFUSED it '
    + 'if either were NULL', ledB.some((l) => l.outcome === 'ADMIT' && l.ink === QKEY && l.curk === QKEY),
  ledB.map((l) => `${l.outcome} ${l.ink ?? 'NULL'}/${l.curk ?? 'NULL'}`).join(' | ') || 'NO LEDGER ROW')
  check('2g · ⭐ …and the SAME write also recorded a DEFER for the unpinned candidate — both verdicts are '
    + 'accounted for', ledB.some((l) => l.outcome === 'DEFER'),
  ledB.map((l) => l.outcome).join(' · ') || 'none')

  // ══ 3 · ⭐⭐⭐ THE SHELTER / WORK-SCHEDULE PATH — BLOCKED IN BOTH STATES ═══════════════════════════
  //
  // The original: the shelter sentence reached the `work schedule` slot through a LEARNED ALIAS at
  // lexical 1.000 and displaced the incumbent. ⭐ Grouping still matches — the alias is untouched.
  const shelterAttr = `zz_admshelter${t}`
  const memC = buildMemoryV2(fastify, {
    userId, writer: W.operator, act: { kind: AK.operator, id: `zz_admission_shelter_${t}` },
  })
  const c1 = await memC.reconcileFact({ entity: 'user', attribute: shelterAttr, value: 'up past 2am', source: 'zz_adm' })
  // ⭐ THE SAME ATTRIBUTE — the strongest possible grouping signal, an EXACT label match at 1.000.
  const c2 = await memC.reconcileFact({ entity: 'user', attribute: shelterAttr, value: 'volunteers at the shelter on Saturdays', source: 'zz_adm' })
  MADE.push(c1.id, c2.id)
  const cRows = await Q(
    `SELECT id::text, (invalid_at IS NOT NULL) AS dead FROM "${schema}"."txn_memories" WHERE id IN (:a, :b)`,
    { a: c1.id, b: c2.id })
  check('3 · ⭐⭐⭐ AN EXACT-LABEL GROUPING MATCH NO LONGER REACHES A DISPLACEMENT — both rows live, '
    + '⛔ the incumbent untouched. THE SHELTER PATH IS BLOCKED AT ITS STRONGEST SIGNAL',
  cRows.length === 2 && cRows.every((r) => !r.dead), cRows.map((r) => (r.dead ? 'DEAD' : 'live')).join(' · '))
  check('3a · ⭐⭐ …and the second write was an `add`. ⛔ Lexical/alias/cosine can no longer produce an '
    + '`update` on an undeclared pair, at any score', c2.action === 'add', `action=${c2.action}`)
  check('3b · ⭐⭐⭐ AND THE OTHER STATE IS BLOCKED TOO — two DIFFERENT declared questions ABSTAIN, which '
    + 'is the fully-declared form of the same defect', admitPair({
    exclusivityBearing: true, incomingQuestionKey: 'volunteer-schedule', incumbentQuestionKey: 'work-schedule',
  }).outcome === ADMISSION.abstain, 'ABSTAIN')
} finally {
  // ══ ⭐ TEARDOWN — and it is ASSERTED, ⛔ never trusted ═══════════════════════════════════════════
  // ⚠️ `IN (:i)`, ⛔ NOT `ANY(:i::uuid[])` — Sequelize `replacements` expands an array into a COMMA LIST,
  // which is a comma list inside `ANY(...)` and a syntax error. Caught by this check's own teardown.
  //
  // ⚠️⚠️ AND THE ORDER IS FK-BOUND, ⛔ not stylistic: 048 gave `log_slot_bindings` a REAL foreign key to
  // `mst_slots` (051 deliberately diverged and has none). ⇒ bindings must go BEFORE slots, and the sweep
  // must find slots BY LABEL rather than only the ids this run happens to have collected — a slot minted
  // by `reconcileFact` on a failed path would otherwise strand a binding and fail the teardown.
  const ids = [...new Set(MADE.filter(Boolean))]
  // ⭐ BY ACT, ⛔ not by row id: a verdict names REAL corpus rows as incumbents whenever grouping reached
  // them, so deleting only the rows this run created would strand its own ledger entries. The act id is
  // the one handle that survives the rows.
  await X(`DELETE FROM "${schema}"."log_memory_admissions" WHERE act_id LIKE 'zz_admission_%'`)
  if (ids.length) await X(`DELETE FROM "${schema}"."txn_memories" WHERE id IN (:i)`, { i: ids })
  await X(`DELETE FROM "${schema}"."txn_memories" WHERE attribute LIKE 'zz_adm%' OR source = 'zz_adm'`)
  await X(`DELETE FROM "${schema}"."log_slot_bindings" WHERE slot_id IN
             (SELECT id FROM "${schema}"."mst_slots" WHERE canonical_label LIKE 'zz_adm%')`)
  await X(`DELETE FROM "${schema}"."log_slot_aliases" WHERE slot_id IN
             (SELECT id FROM "${schema}"."mst_slots" WHERE canonical_label LIKE 'zz_adm%')`)
  await X(`DELETE FROM "${schema}"."mst_slots" WHERE canonical_label LIKE 'zz_adm%'`)
  await X(`DELETE FROM "${schema}"."mst_slot_questions" WHERE question_key LIKE 'zz_adm%'`)

  const [left] = await Q(
    `SELECT (SELECT count(*)::int FROM "${schema}"."txn_memories" WHERE attribute LIKE 'zz_adm%' OR source = 'zz_adm') AS m,
            (SELECT count(*)::int FROM "${schema}"."mst_slots" WHERE canonical_label LIKE 'zz_adm%') AS s,
            (SELECT count(*)::int FROM "${schema}"."mst_slot_questions" WHERE question_key LIKE 'zz_adm%') AS q,
            (SELECT count(*)::int FROM "${schema}"."log_memory_admissions" WHERE act_id LIKE 'zz_admission_%') AS led`)
  check('⭐ TEARDOWN ASSERTED — no `zz_adm` residue in memories, slots or questions',
    left.m === 0 && left.s === 0 && left.q === 0, `memories=${left.m} slots=${left.s} questions=${left.q}`)
  // ⚠️ ITS OWN ROWS ONLY, by act. ⛔ NOT "the ledger is empty": every check that writes memory now leaves
  // admission rows behind, and by design they OUTLIVE the memories they judged (051's rule — history must
  // outlive its subject). Asserting a global emptiness here would be claiming a property this check does
  // not own, and would go red on someone else's tidy-up schedule.
  check('⭐⭐ AND THIS CHECK’S OWN LEDGER ROWS ARE GONE — ⛔ it adjudicated nothing it did not remove',
    left.led === 0, `${left.led} rows with act_id zz_admission_% remain`)
  await pg.end(); await seq.close()
  done()
}
