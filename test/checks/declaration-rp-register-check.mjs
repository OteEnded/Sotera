// ⭐⭐⭐ THE DECLARATION RED-PROOF REGISTER — RP-D1 · D2 · D3 · D5 · D8 · D9 · D10 · NQ1-3 · N8.
//
//   node test/checks/declaration-rp-register-check.mjs
//
// ⛔ RUN `declaration-rp-d0-check.mjs` FIRST. Until ALLOW is demonstrated reachable, every refusal proof
// below is vacuous — that is the ordering Ote made mandatory, and it is not a formality.
//
// ── ⭐⭐⭐ THE PROOF DISCIPLINE, AS RATIFIED 2026-09-03 ──────────────────────────────────────────────
//
//     An assertion that NOTHING CHANGED is exactly the assertion that passes when the instrument is
//     broken. ⇒ every such proof needs a positive control FIRST.
//
//     ⭐⭐ AND THE CONTROL MUST DEMONSTRATE THAT THE INTENDED STATE SURVIVES THE ACTUAL PERSISTENCE
//     BOUNDARY — ⛔ not merely that the application computed it.
//
// ⚠️ That second sentence is not theory. RP-T1 resolved the question correctly and `checkKind` returned
// ALLOW, and Sequelize still dropped the column in silence because the model did not declare it — the
// same failure that cost seven memories once before. The application was right; the persistence boundary
// ate it; and the two assertions expecting NULL were PASSING.
//
// ⛔ Writes only to agent_dev, and removes every row it makes.
import { makeChecker, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'
import {
  declareQuestion, proposeBind, confirmBind, resolveSlotQuestion,
} from '../../Backend/app/components/memory-declaration-host.js'
import { checkKind, KIND_OUTCOME } from '../../Backend/app/components/memory-kind-precondition.js'
import { evaluate, OUTCOME } from '../../Backend/app/components/memory-question-checks.js'

const { check, done } = makeChecker()
loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const schema = devSchema()
const seq = db.txn_memories.sequelize
const query = async (sql, params = []) => ({ rows: await seq.query(sql, { bind: params, type: 'SELECT' }) })
const Q = (s, r = {}) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })
const X = (s, r = {}) => seq.query(s, { replacements: r })

const t = Date.now()
const KEY_A = `zz_rpreg_a_${t}`
const KEY_B = `zz_rpreg_b_${t}`
const NS_UNDECLARED = `zz_ns_${t}`
const MADE = []
const SLOTS = []
let userId = null

const mkSlot = async (namespace, label) => {
  const [r] = await Q(
    `INSERT INTO "${schema}"."mst_slots" (id, persona, user_id, entity, namespace, canonical_label, write_count, created_at, updated_at)
     VALUES (gen_random_uuid(), NULL, :u, 'user', :ns, :l, 0, now(), now()) RETURNING id::text`,
    { u: userId, ns: namespace, l: label })
  SLOTS.push(r.id); return r.id
}
const bind = async (slotId, questionId, intent, expected, tag) => {
  const p = await proposeBind({
    query, schema, slotId, questionId, declaredIntent: intent, expectedQuestionId: expected,
    actor: 'rp-reg', occasion: `zz_occ_p_${tag}_${t}`, reason: 'register proof',
  })
  if (!p.ok) return p
  return confirmBind({
    query, schema, proposalId: p.proposal.id,
    actor: 'rp-reg', occasion: `zz_occ_c_${tag}_${t}`, reason: 'register proof',
  })
}
const snapshotRow = async (id) => {
  const [r] = await Q(`SELECT row_to_json(m) AS j FROM "${schema}"."txn_memories" m WHERE m.id = :i`, { i: id })
  return JSON.stringify(r?.j ?? null)
}

// ⭐⭐ THE BASELINE, ⛔ NOT ZERO. Ote bound the first real slot on 2026-09-03 and there is no UNBIND, so
// `log_slot_bindings` is legitimately non-empty forever. A teardown asserting the TABLE IS EMPTY asserts
// an absence with no date. ⇒ residue is a DELTA against the state this run found.
const [{ b: BASE_BINDINGS }] = await Q(`SELECT count(*)::int AS b FROM "${schema}"."log_slot_bindings"`)

try {
  const [u] = await Q(`SELECT id::text FROM "${schema}"."mst_users" WHERE username = 'agent_dev'`)
  if (!u) throw new Error('agent_dev not found — this check must never run as root')
  userId = u.id
  const store = createSequelizeMemoryStore({ db, persona: null, userId })
  const write = async (slotId, claimKind, extra = {}) => {
    const r = await store.create({
      kind: 'semantic', namespace: 'default', content: `zz_rpreg ${claimKind ?? 'none'}`,
      entity: 'user', attribute: `zz_rpreg_attr_${t}`, value: 'v',
      importance: 5, source: 'zz_rpreg', slot_id: slotId, ...(claimKind ? { claimKind } : {}), ...extra,
    })
    MADE.push(r.id); return r.id
  }

  const dA = await declareQuestion({
    query, schema, questionKey: KEY_A, asks: 'question A', checks: ['nonempty'],
    declaredBy: 'rp-reg', occasion: `zz_occ_dA_${t}`,
  })
  const qA = dA.question.id

  // ══ RP-D1 · DECLARE + BIND DO NOT TOUCH EXISTING ROWS ═══════════════════════════════════════════
  const slot1 = await mkSlot('default', `zz_rpreg_s1_${t}`)
  const pre = await write(slot1, null)                     // written BEFORE any question exists
  const before = await snapshotRow(pre)
  await bind(slot1, qA, 'first-bind', null, 'd1')
  const after = await snapshotRow(pre)
  check('RP-D1 · declare + bind leave an EXISTING row byte-identical', before === after,
    before === after ? '' : 'the row changed')
  // ⭐ CONTROL — the comparison can actually see a change.
  await X(`UPDATE "${schema}"."txn_memories" SET importance = 6 WHERE id = :i`, { i: pre })
  const afterReal = await snapshotRow(pre)
  check('RP-D1b · ⭐ CONTROL — a real update DOES change the snapshot, so D1 is not vacuous',
    afterReal !== after)

  // ══ RP-D2 · ALLOW IS NOT WRITE AUTHORIZATION ════════════════════════════════════════════════════
  const r1 = await resolveSlotQuestion({ query, schema, slotId: slot1 })
  check('RP-D2a · ⭐ CONTROL — a conforming write IS admitted under the question',
    (await snapshotRow(await write(slot1, KEY_A))).includes(qA), `q=${qA}`)
  let refused = null
  try {
    // ⛔ A figurative statement may not occupy a fact slot — a DIFFERENT gate, unaffected by ALLOW.
    await write(slot1, KEY_A, { modality: 'figurative' })
  } catch (e) { refused = e }
  // ⚠️ ASSERT THE STATE, ⛔ NOT WHICH DOOR CLOSED. This first read `refused.code === 'MODALITY_SLOT'` and
  // went red on `OWNERSHIP_BOUNDARY` — the write WAS refused, by `admissibleToSlot`'s
  // figurative-as-literal-property rule, which runs BEFORE `slotViolation`. The proof's claim is that a
  // non-kind gate still refuses; naming which one made the test assert an implementation ORDER it has no
  // business fixing. The detail still reports the actual code, so a change of door stays visible.
  check('RP-D2 · ⭐⭐ with the kind gate ALLOWing, ANOTHER gate still refuses the write',
    refused !== null && ['MODALITY_SLOT', 'OWNERSHIP_BOUNDARY'].includes(refused.code),
    refused ? `refused by ${refused.code} (${refused.reason ?? ''})` : 'NOT refused')

  // ══ RP-D5 · AN UNRUNNABLE CHECK DEFERS, ⛔ NEVER ALLOWS ══════════════════════════════════════════
  // ⭐ A check that was registered at declaration and is gone at evaluation resolves to the SAME path an
  // unknown id takes — `resolveCheck` returns null either way — so this exercises the deregistration
  // outcome without pretending the frozen registry can be mutated.
  const gone = evaluate({ checks: ['nonempty', 'zz_deregistered'], value: 'a fine answer' })
  check('RP-D5 · an UNRUNNABLE declared check DEFERs', gone.outcome === OUTCOME.defer, gone.why)
  check('RP-D5b · …and it is reported as UNKNOWN rather than passed',
    Array.isArray(gone.unknown) && gone.unknown.includes('zz_deregistered'))
  const runnable = evaluate({ checks: ['nonempty'], value: 'a fine answer' })
  check('RP-D5c · ⭐ CONTROL — an all-registered set ALLOWs, so D5 is not vacuous',
    runnable.outcome === OUTCOME.allow, runnable.why)

  // ══ RP-D8 · NO ACT MOVES A WARRANT ══════════════════════════════════════════════════════════════
  const warrantOf = async () => JSON.stringify(await Q(
    `SELECT id::text, memory_id::text, selected, verified, discarded, verified_roots, value_at_warrant
       FROM "${schema}"."log_memory_warrants" ORDER BY created_at`))
  const w0 = await warrantOf()
  await X(`INSERT INTO "${schema}"."log_memory_warrants"
             (memory_id, value_at_warrant, selected, verified, discarded, verified_roots)
           VALUES (:m, 'zz_rpreg warrant', 2, 2, 0, ARRAY['r1','r2'])`, { m: pre })
  const w1 = await warrantOf()
  check('RP-W0 · ⭐⭐ CONTROL FIRST — the warrant snapshot CHANGES when a warrant is issued. ⛔ Without '
    + 'this every "no warrant moved" assertion passes on an empty table', w1 !== w0)
  const dB = await declareQuestion({
    query, schema, questionKey: KEY_B, asks: 'question B', checks: ['nonempty'],
    declaredBy: 'rp-reg', occasion: `zz_occ_dB_${t}`,
  })
  const qB = dB.question.id
  await bind(slot1, qB, 'rebind', qA, 'd8')
  const w2 = await warrantOf()
  check('RP-D8 · ⭐ a DECLARE and a REBIND move NO warrant count and no verified-root set', w2 === w1)

  // ══ RP-D9 · SUPERSESSION IS LINEAGE, ⛔ NEVER A REDIRECT ═════════════════════════════════════════
  const [supersede] = await Q(
    `INSERT INTO "${schema}"."mst_slot_questions" (question_key, asks, checks, declared_by, declared_in_occasion, supersedes_id)
     VALUES (:k, 'A, more precisely', ARRAY['nonempty']::text[], 'rp-reg', :o, :sup) RETURNING id::text`,
    { k: `zz_rpreg_a_v2_${t}`, o: `zz_occ_sup_${t}`, sup: qA })
  const slot9 = await mkSlot('default', `zz_rpreg_s9_${t}`)
  await bind(slot9, qA, 'first-bind', null, 'd9')
  const r9 = await resolveSlotQuestion({ query, schema, slotId: slot9 })
  check('RP-D9 · ⭐⭐ a slot bound to a SUPERSEDED definition still resolves to THAT definition — '
    + 'RESOLVE does not follow supersedes_id, so supersession alone changes nothing operative',
    r9?.questionId === qA && r9?.slotKind === KEY_A, `resolved=${r9?.slotKind}`)
  const allowOld = checkKind({ slotKind: r9?.slotKind ?? null, claimKind: KEY_A })
  check('RP-D9b · …and a claim answering the OLD question is still ALLOWed there',
    allowOld.outcome === KIND_OUTCOME.allow)
  check('RP-D9c · ⭐ CONTROL — the superseding definition exists and is a DIFFERENT row, so D9 is not '
    + 'passing because nothing was superseded', supersede.id !== qA)

  // ══ RP-D10 · ONE BIND BINDS ONE SLOT ════════════════════════════════════════════════════════════
  const sibling = await mkSlot('default', `zz_rpreg_s1_${t}`.replace('_s1_', '_sib_'))
  const sibBefore = await resolveSlotQuestion({ query, schema, slotId: sibling })
  await bind(slot9, qB, 'rebind', qA, 'd10')
  const sibAfter = await resolveSlotQuestion({ query, schema, slotId: sibling })
  check('RP-D10 · ⭐ binding one slot leaves a SIBLING slot untouched',
    sibBefore?.questionId === null && sibAfter?.questionId === null)
  const r9b = await resolveSlotQuestion({ query, schema, slotId: slot9 })
  check('RP-D10b · ⭐ CONTROL — the bind DID take effect on its own slot', r9b?.questionId === qB)

  // ══ RP-NQ1/2/3 · NAMESPACE ≠ QUESTION ═══════════════════════════════════════════════════════════
  const slotNs = await mkSlot(NS_UNDECLARED, `zz_rpreg_ns_${t}`)
  await bind(slotNs, qA, 'first-bind', null, 'nq')
  const rNs = await resolveSlotQuestion({ query, schema, slotId: slotNs })
  check('RP-NQ1 · ⭐⭐ the SAME question_id in a DIFFERENT namespace resolves to the SAME definition — '
    + 'RESOLVE is namespace-blind', rNs?.questionId === qA && rNs?.slotKind === KEY_A,
  `ns=${rNs?.namespace} key=${rNs?.slotKind}`)
  check('RP-NQ1b · ⭐ CONTROL — a different question_id resolves differently, so NQ1 is not returning a '
    + 'constant', r9b?.questionId === qB && r9b?.questionId !== rNs?.questionId)
  check('RP-NQ2 · a namespace difference leaves the question definition UNCHANGED',
    rNs?.slotKind === r9?.slotKind && rNs?.namespace !== r9?.namespace,
    `${rNs?.namespace} vs ${r9?.namespace}`)
  const [nsAfterRebind] = await Q(
    `SELECT namespace FROM "${schema}"."mst_slots" WHERE id = :i`, { i: slot9 })
  check('RP-NQ3 · a question change (the rebind above) left the slot\'s namespace byte-identical',
    nsAfterRebind?.namespace === 'default')

  // ══ RP-N8 · AN UNDECLARED NAMESPACE IS NOT GOVERNED ═════════════════════════════════════════════
  check('RP-N8a · an UNDECLARED namespace leaves slot_governed UNKNOWN',
    rNs?.namespaceDeclared === false && rNs?.slotGoverned === null,
    `declared=${rNs?.namespaceDeclared} governed=${rNs?.slotGoverned}`)
  const nsWrite = await write(slotNs, KEY_A)
  const [nsRow] = await Q(
    `SELECT question_id_at_admission::text AS pin FROM "${schema}"."txn_memories" WHERE id = :i`, { i: nsWrite })
  check('RP-N8 · ⭐⭐ a slot in an UNDECLARED namespace admits with NO pin — undeclared does not mean '
    + 'safe, it means not governed yet', nsRow?.pin === null, `pin=${nsRow?.pin}`)
  const govWrite = await write(slot9, KEY_B)
  const [govRow] = await Q(
    `SELECT question_id_at_admission::text AS pin FROM "${schema}"."txn_memories" WHERE id = :i`, { i: govWrite })
  check('RP-N8b · ⭐ CONTROL — the SAME write in the DECLARED, slot-governed `default` namespace IS '
    + 'pinned, so N8 is not passing because pinning is broken', govRow?.pin === qB, `pin=${govRow?.pin}`)

  // ══ RP-D3 · NO ORIGIN OF THIS WORK TOUCHES REACHABILITY ═════════════════════════════════════════
  const visibleFor = async (uid) => {
    const s = createSequelizeMemoryStore({ db, persona: null, userId: uid })
    return JSON.stringify((await s.findVisible({})).map((r) => r.id).sort())
  }
  const accounts = await Q(`SELECT id::text FROM "${schema}"."mst_users" WHERE username IN ('agent_dev','ote','hermes')`)
  const seen0 = {}
  for (const a of accounts) seen0[a.id] = await visibleFor(a.id)
  const slot3 = await mkSlot('default', `zz_rpreg_s3_${t}`)
  await bind(slot3, qA, 'first-bind', null, 'd3')
  let identical = true
  for (const a of accounts) if ((await visibleFor(a.id)) !== seen0[a.id]) identical = false
  check('RP-D3 · ⭐⭐ BEHAVIOURAL — what every account can recall is IDENTICAL before and after a '
    + 'declare+bind. ⛔ Asserted by exercising the read, never by reading the source', identical)
  const probe = await write(slot3, null)
  let changed = false
  for (const a of accounts) if ((await visibleFor(a.id)) !== seen0[a.id]) changed = true
  check('RP-D3b · ⭐ CONTROL — a real new memory DOES change what an account recalls, so D3 is not '
    + 'passing because the reader is blind', changed, `probe=${probe}`)
} catch (e) {
  check('the register ran to completion', false, e?.message ?? String(e))
} finally {
  try {
    await X(`DELETE FROM "${schema}"."log_memory_warrants" WHERE value_at_warrant LIKE 'zz_rpreg%'`)
    for (const id of MADE) await X(`DELETE FROM "${schema}"."txn_memories" WHERE id = :i`, { i: id })
    for (const id of SLOTS) {
      await X(`DELETE FROM "${schema}"."log_slot_bindings" WHERE slot_id = :i`, { i: id })
      await X(`UPDATE "${schema}"."mst_slots" SET question_id = NULL WHERE id = :i`, { i: id })
      await X(`DELETE FROM "${schema}"."mst_slots" WHERE id = :i`, { i: id })
    }
    await X(`DELETE FROM "${schema}"."mst_slot_questions" WHERE question_key LIKE 'zz_rpreg_%'`)
  } catch (e) { check('teardown ran', false, e?.message) }

  const [res] = await Q(
    `SELECT (SELECT count(*)::int FROM "${schema}"."mst_slot_questions" WHERE question_key LIKE 'zz_%') AS q,
            (SELECT count(*)::int FROM "${schema}"."mst_slots" WHERE canonical_label LIKE 'zz_rpreg_%') AS s,
            (SELECT count(*)::int FROM "${schema}"."txn_memories" WHERE source = 'zz_rpreg') AS m,
            (SELECT count(*)::int FROM "${schema}"."log_slot_bindings") AS b,
            (SELECT count(*)::int FROM "${schema}"."log_memory_warrants") AS w`)
  check('⭐ teardown ASSERTED, not trusted — and against the BASELINE, ⛔ not against zero',
    res.q === 0 && res.s === 0 && res.m === 0 && res.b === BASE_BINDINGS && res.w === 0,
    `questions=${res.q} slots=${res.s} memories=${res.m} bindings=${res.b} (baseline ${BASE_BINDINGS}) warrants=${res.w}`)
  await seq.close()
  done()
}
