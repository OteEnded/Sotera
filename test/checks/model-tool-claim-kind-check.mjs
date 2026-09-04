// ⭐⭐⭐ THE MODEL-TOOL CLAIM KIND — the real writer, both doors, both sides of the gate.
//
//   node test/checks/model-tool-claim-kind-check.mjs
//
// ── ⭐⭐ WHY THIS DRIVES `runTool` AND NOT THE HOST FUNCTIONS ───────────────────────────────────────
// The question Ote asked is whether **the actual model-tool writer** can exercise both sides. So every
// write below goes through the registered tool exactly as a model's call does — tool schema → handler →
// host → pipeline → store → gate. ⓘ `own-memory-tool-check` records what skipping this costs: a probe
// once reported a field as `undefined` through `runTool` and nearly had it filed as a dropped field,
// when the real cause was an uninitialised host.
//
// ── ⚠️ THE BOUNDARIES `claimKind` HAS TO CROSS, AND TWO OF THEM USED TO EAT IT ────────────────────
//   tool schema (additionalProperties:false)   ⛔ would reject the argument outright
//   the tool handler's explicit field list
//   retention.keep()                            ⛔ was a closed list
//   mem.reconcileFactAsync({entity,attribute,value})   ⛔ was THREE fields
//   pipeline.ingest → makeObservation()         ⛔⛔ was NOT in `common` — a silent drop
//   normalizeObservation()                      ⭐ spreads
//   commitToMemory()                            ⛔⛔ explicit arg list — the canary PROVED this one ate it
//   reconcileFact → store.create → the gate     ⭐ transport, stripped after use
//
// ⭐ A PIN is the end-to-end witness: `question_id_at_admission` is written ONLY when the kind gate
// ALLOWed, so a pinned row proves the value crossed every boundary above. ⛔ Not a source scan.
//
// ⛔ Writes only to agent_dev, only `zz_` addresses, and binds only a `zz_` fixture slot which is
// removed. ⛔ The real canary is never written and must still be the only governed slot at the end.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildToolContext, runTool } from '../../Backend/app/components/runtime.js'
import { initRetention } from '../../Backend/app/components/retention-host.js'
import { RETENTION_STATE } from '../../Backend/app/components/memory-write-receipt.js'
import { commitToMemory } from '../../Backend/app/components/memory-pipeline-host.js'
import { makeObservation } from '@ote/memory/cognition/memory-observation.js'
import { declareQuestion, proposeBind, confirmBind } from '../../Backend/app/components/memory-declaration-host.js'

const { check, done } = makeChecker('model-tool-claim-kind')
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
const pg = devPg(); await pg.connect()
const schema = devSchema()
const S = `"${schema}"`
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const query = (sql, p = []) => pg.query(sql, p)

const t = Date.now()
const KEY = `zz_mtck_question_${t}`          // the declared question the fixture slot is bound to
const OTHER_KEY = `zz_mtck_other_${t}`       // a real, declared, DIFFERENT question
const ATTR = `zz_mtck_governed_${t}`         // the fixture slot's label
// ⚠️⚠️ EACH FIXTURE GETS ITS OWN SUBJECT, ⛔ NOT MERELY ITS OWN LABEL. Conflict resolution matches
// candidate rows BEFORE the slot is decided, so several similar labels under one entity collapse into one
// belief — the "ungoverned" and `remember_fact` fixtures below landed in the GOVERNED slot and were
// refused for a reason with nothing to do with the rule under test. ⭐ Separating the ENTITY separates the
// slot key itself, which is the only separation that cannot collapse. (Recorded once already in
// `declaration-self-authorisation-check`, and repeated here anyway — hence the size of this warning.)
const FREE_SUBJECT = `zz_mtck_free_subject_${t}`
const RF_SUBJECT = `zz_mtck_rf_subject_${t}`
const FREE_ATTR = `zz_mtck_ungoverned_${t}`  // an unbound slot, under its OWN subject
const RF_ATTR = `zz_mtck_rf_${t}`            // remember_fact's own governed fixture
const RF_KEY = `zz_mtck_rf_question_${t}`
let convoId = null; let TURN = null; let slotId = null; let rfSlotId = null

initRetention()

const live = async (label) => q(
  `SELECT m.id::text AS id, m.value, m.question_id_at_admission::text AS pin, m.supersedes_id::text AS sup
     FROM ${S}."txn_memories" m JOIN ${S}."mst_slots" s ON s.id = m.slot_id
    WHERE s.canonical_label = $1 AND m.invalid_at IS NULL AND m.expired_at IS NULL`, [label])
const rowsFor = async (label) => q(
  `SELECT m.id::text AS id, m.value, (m.invalid_at IS NULL) AS live
     FROM ${S}."txn_memories" m JOIN ${S}."mst_slots" s ON s.id = m.slot_id
    WHERE s.canonical_label = $1 ORDER BY m.created_at`, [label])

try {
  const [me] = await q(
    `SELECT id::text AS id, username FROM ${S}."mst_users" WHERE username = 'agent_dev'`)
  if (!me) throw new Error('agent_dev not found — ⛔ this check must never run as root')

  // ── ⭐ A REAL TURN, so the write carries an authenticated consuming occasion, as production does ──
  const [c] = await q(
    `INSERT INTO ${S}."txn_conversations" (id, user_id, title, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2, now(), now()) RETURNING id::text`, [me.id, `zz_mtck_convo_${t}`])
  convoId = c.id
  const [m] = await q(
    `INSERT INTO ${S}."txn_messages" (id, conversation_id, role, content, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'user', $2, now(), now()) RETURNING id::text`, [convoId, `zz_mtck_turn_${t}`])
  TURN = m.id

  /** ⭐ EXACTLY the context a chat turn builds — ⛔ the check must not model it differently. */
  const ctx = buildToolContext(fastify, {
    user: { id: me.id, username: me.username, displayName: 'agent_dev', isRoot: false, capabilities: [] },
  }, { origin: 'zz_mtck', messageId: TURN, conversationId: convoId })

  // ══ 0 · ⭐ THE TOOL REALLY ACCEPTS THE ARGUMENT — ⛔ else everything below is untestable ══════════
  const seed = await runTool('keep', { what: 'seed-value', kind: 'fact', mine: false, attribute: ATTR }, ctx)
  check('0 · ⭐ the `keep` tool runs and persists through the REAL runtime',
    seed?.state === RETENTION_STATE.persisted, JSON.stringify({ state: seed?.state, ok: seed?.ok }))
  const [slot] = await q(
    `SELECT id::text FROM ${S}."mst_slots" WHERE canonical_label = $1 AND user_id = $2::uuid`, [ATTR, me.id])
  slotId = slot?.id ?? null
  check('0b · …and it minted the fixture slot', !!slotId, `slot=${slotId}`)

  // ── govern the fixture slot: DECLARE + BIND, in occasions that are ⛔ NOT the consuming turn ─────
  const d = await declareQuestion({
    query, schema, questionKey: KEY, asks: 'what is the governed value?', checks: ['nonempty'],
    declaredBy: 'zz_mtck', occasion: `zz_mtck_declare_${t}`,
  })
  await declareQuestion({
    query, schema, questionKey: OTHER_KEY, asks: 'what is some other value?', checks: ['nonempty'],
    declaredBy: 'zz_mtck', occasion: `zz_mtck_declare_other_${t}`,
  })
  const p = await proposeBind({
    query, schema, slotId, questionId: d.question.id, declaredIntent: 'first-bind',
    actor: 'zz_mtck', occasion: `zz_mtck_propose_${t}`, reason: 'model-tool claim kind proof',
  })
  const cf = await confirmBind({
    query, schema, proposalId: p.proposal.id, actor: 'zz_mtck',
    occasion: `zz_mtck_confirm_${t}`, reason: 'model-tool claim kind proof',
  })
  check('0c · the fixture slot is GOVERNED', cf.ok === true, cf.why ?? '')

  // ══ A · ⭐⭐⭐ THE POSITIVE CONTROL FIRST — ALLOW → SUPERSEDE, THROUGH THE MODEL'S OWN TOOL ═══════
  const before = await live(ATTR)
  const allowed = await runTool('keep',
    { what: 'governed-value-2', kind: 'fact', mine: false, attribute: ATTR, claimKind: KEY }, ctx)
  check('A1 · ⭐⭐⭐ a governed UPDATE with the RIGHT kind is ALLOWED — through the real model-tool writer',
    allowed?.state === RETENTION_STATE.persisted && allowed.ok === true,
    JSON.stringify({ state: allowed?.state, why: allowed?.why, code: allowed?.code }))
  const [newRow] = await q(
    `SELECT question_id_at_admission::text AS pin, supersedes_id::text AS sup, value
       FROM ${S}."txn_memories" WHERE id = $1::uuid`, [allowed?.memoryId])
  check('A2 · ⭐⭐⭐ THE BOUNDARY PROOF — the row is PINNED to the declared question, so `claimKind` '
    + 'survived the tool schema, the handler, keep(), reconcileFactAsync, makeObservation, normalize, '
    + 'commitToMemory, reconcileFact AND the INSERT',
  newRow?.pin === d.question.id, `pin=${newRow?.pin} expected=${d.question.id}`)
  check('A3 · ⭐⭐ …and it really was a SUPERSEDE — the pointer names the row it replaced',
    newRow?.sup === before[0]?.id, `supersedes=${newRow?.sup} prior=${before[0]?.id}`)
  const afterAllow = await rowsFor(ATTR)
  check('A4 · ⭐ …the prior belief is RETIRED, not deleted, and exactly one row is live',
    afterAllow.length === 2 && afterAllow.filter((r) => r.live).length === 1
    && afterAllow.find((r) => !r.live)?.value === 'seed-value',
    `rows=${afterAllow.length} live=${JSON.stringify(afterAllow.filter((r) => r.live).map((r) => r.value))}`)

  // ══ B · ⭐⭐ THE REFUSALS — missing and mismatched, and the world is left alone ════════════════════
  const liveBeforeRefusals = await live(ATTR)
  const missing = await runTool('keep',
    { what: 'zz_mtck_should_never_land_missing', kind: 'fact', mine: false, attribute: ATTR }, ctx)
  check('B1 · ⭐⭐⭐ a governed UPDATE with NO kind is REFUSED — absent is not permission',
    missing?.state === RETENTION_STATE.refused && missing.ok === false,
    JSON.stringify({ state: missing?.state, code: missing?.code }))
  const mismatched = await runTool('keep',
    { what: 'zz_mtck_should_never_land_wrong', kind: 'fact', mine: false, attribute: ATTR, claimKind: OTHER_KEY }, ctx)
  check('B2 · ⭐⭐⭐ …and one answering a DIFFERENT declared question is REFUSED too',
    mismatched?.state === RETENTION_STATE.refused && mismatched.ok === false,
    JSON.stringify({ state: mismatched?.state, code: mismatched?.code }))
  check('B2b · ⭐ …and the mismatch is a REAL question, ⛔ not an invented string — so this proves the '
    + 'gate compares identities rather than merely rejecting the unknown',
  (await q(`SELECT count(*)::int AS n FROM ${S}."mst_slot_questions" WHERE question_key = $1`, [OTHER_KEY]))[0].n === 1)

  const liveAfterRefusals = await live(ATTR)
  check('B3 · ⭐⭐⭐ BOTH refusals left the PREVIOUS BELIEF LIVE — same row, same value',
    liveAfterRefusals.length === 1 && liveAfterRefusals[0].id === liveBeforeRefusals[0]?.id
    && liveAfterRefusals[0].value === liveBeforeRefusals[0]?.value,
    `live=${JSON.stringify(liveAfterRefusals.map((r) => r.value))}`)
  const [leaked] = await q(
    `SELECT count(*)::int AS n FROM ${S}."txn_memories" WHERE value LIKE 'zz_mtck_should_never_land%'`)
  check('B4 · ⛔ …and NOT ONE replacement row was written', leaked.n === 0, `rows=${leaked.n}`)

  // ══ C · ⭐⭐⭐ NO INFERENCE, NO DEFAULT, ABSENT STAYS ABSENT ══════════════════════════════════════
  //
  // ⭐ C1 IS THE ANTI-INFERENCE CONTROL AND IT IS THE SHARPEST ONE HERE: the fixture's ATTRIBUTE is fed
  // as a claim kind's obvious source — a system that derived the kind from the attribute, or from the
  // slot's own binding, would ALLOW this write. It must be REFUSED, because the writer said nothing.
  const inferred = await runTool('keep',
    { what: 'zz_mtck_should_never_land_inferred', kind: 'fact', mine: false, attribute: ATTR }, ctx)
  check('C1 · ⭐⭐⭐ NO INFERENCE — the slot is bound and the writer stayed silent, so the write is '
    + 'REFUSED. ⛔ Nothing derives a kind from the attribute or from the slot\'s own binding',
  inferred?.state === RETENTION_STATE.refused, JSON.stringify({ state: inferred?.state }))
  // ⭐ C2/C3 — the two boundaries that used to drop it, asserted DIRECTLY so a future edit is caught here
  // rather than three layers away.
  const obsNone = makeObservation({ type: 'fact', owner: 'zz_mtck_subject', attribute: 'a', value: 'v' })
  const obsWith = makeObservation({ type: 'fact', owner: 'zz_mtck_subject', attribute: 'a', value: 'v', claimKind: KEY })
  check('C2 · ⭐⭐ `makeObservation` CARRIES a kind and leaves an absent one NULL — ⛔ no default',
    obsWith.claimKind === KEY && obsNone.claimKind === null,
    `with=${obsWith.claimKind} without=${obsNone.claimKind}`)
  const seen = []
  const spy = { reconcileFact: (args) => { seen.push(args); return { ok: true } } }
  await commitToMemory(spy, { owner: 'u', attribute: 'a', value: 'v', claimKind: KEY })
  await commitToMemory(spy, { owner: 'u', attribute: 'a', value: 'v', claimKind: null })
  check('C3 · ⭐⭐⭐ `commitToMemory` carries a kind AND OMITS THE KEY ENTIRELY when there is none — '
    + '⛔ absent stays absent, and `claimKind: null` is never handed on as if it were an answer',
  seen[0]?.claimKind === KEY && Object.hasOwn(seen[1], 'claimKind') === false,
  `with=${seen[0]?.claimKind} without-key-present=${Object.hasOwn(seen[1] ?? {}, 'claimKind')}`)

  // ══ D · ⭐⭐ UNGOVERNED WRITERS ARE UNCHANGED ═════════════════════════════════════════════════════
  const free1 = await runTool('keep', { what: 'free-a', kind: 'fact', mine: false, about: FREE_SUBJECT, attribute: FREE_ATTR }, ctx)
  const free2 = await runTool('keep', { what: 'free-b', kind: 'fact', mine: false, about: FREE_SUBJECT, attribute: FREE_ATTR }, ctx)
  check('D1 · ⭐⭐ an UNBOUND slot still updates with NO kind at all — ⛔ nothing became a blanket gate',
    free1?.state === RETENTION_STATE.persisted && free2?.state === RETENTION_STATE.persisted,
    `${free1?.state} / ${free2?.state}`)
  const free3 = await runTool('keep',
    { what: 'free-c', kind: 'fact', mine: false, about: FREE_SUBJECT, attribute: FREE_ATTR, claimKind: OTHER_KEY }, ctx)
  check('D2 · ⭐ …and supplying a kind to an UNBOUND slot changes nothing — it is NOT IN SCOPE, ⛔ not '
    + 'a mismatch', free3?.state === RETENTION_STATE.persisted, `${free3?.state}`)
  const [freePin] = await q(
    `SELECT question_id_at_admission::text AS pin FROM ${S}."txn_memories" WHERE id = $1::uuid`, [free3?.memoryId])
  check('D3 · ⛔ …and it earns NO pin, because there is no question to be admitted under',
    freePin?.pin === null, `pin=${freePin?.pin}`)

  // ══ E · ⭐⭐ THE OTHER DOOR — `remember_fact`, both sides ═════════════════════════════════════════
  const rfSeed = await runTool('remember_fact', { entity: RF_SUBJECT, attribute: RF_ATTR, value: 'rf-seed' }, ctx)
  check('E0 · the `remember_fact` tool persists through the real runtime',
    rfSeed?.state === RETENTION_STATE.persisted, JSON.stringify(rfSeed))
  const [rfSlot] = await q(
    `SELECT id::text FROM ${S}."mst_slots" WHERE canonical_label = $1 AND user_id = $2::uuid`, [RF_ATTR, me.id])
  rfSlotId = rfSlot?.id ?? null
  const dRf = await declareQuestion({
    query, schema, questionKey: RF_KEY, asks: 'what is the rf value?', checks: ['nonempty'],
    declaredBy: 'zz_mtck', occasion: `zz_mtck_declare_rf_${t}`,
  })
  const pRf = await proposeBind({
    query, schema, slotId: rfSlotId, questionId: dRf.question.id, declaredIntent: 'first-bind',
    actor: 'zz_mtck', occasion: `zz_mtck_propose_rf_${t}`, reason: 'rf proof',
  })
  await confirmBind({
    query, schema, proposalId: pRf.proposal.id, actor: 'zz_mtck',
    occasion: `zz_mtck_confirm_rf_${t}`, reason: 'rf proof',
  })
  const rfAllowed = await runTool('remember_fact',
    { entity: RF_SUBJECT, attribute: RF_ATTR, value: 'rf-second', claimKind: RF_KEY }, ctx)
  check('E1 · ⭐⭐⭐ `remember_fact` ALSO carries a kind end to end — ALLOWED and PINNED',
    rfAllowed?.state === RETENTION_STATE.persisted, JSON.stringify(rfAllowed))
  const [rfPin] = await q(
    `SELECT question_id_at_admission::text AS pin FROM ${S}."txn_memories" WHERE id = $1::uuid`, [rfAllowed?.id])
  check('E1b · ⭐⭐ …the pin proves it, on this door too', rfPin?.pin === dRf.question.id,
    `pin=${rfPin?.pin} expected=${dRf.question.id}`)
  const rfRefused = await runTool('remember_fact',
    { entity: RF_SUBJECT, attribute: RF_ATTR, value: 'zz_mtck_should_never_land_rf' }, ctx)
  check('E2 · ⭐⭐ …and a governed UPDATE with no kind is REFUSED on this door too',
    rfRefused?.state === RETENTION_STATE.refused && rfRefused.ok === false, JSON.stringify(rfRefused))
  check('E3 · ⭐ …and the model-facing refusal still exposes NO `claimKind` — ⛔ the two-audience rule '
    + 'holds even now that the capability exists',
  !/claimKind/i.test(JSON.stringify(rfRefused)), JSON.stringify(rfRefused))
  const rfLive = await live(RF_ATTR)
  check('E4 · ⭐ …and the previous belief is still live', rfLive.length === 1 && rfLive[0].value === 'rf-second',
    JSON.stringify(rfLive.map((r) => r.value)))
} catch (e) {
  check('the model-tool claim-kind check ran to completion', false, `${e?.message} @@ ${e?.code ?? ''}`)
} finally {
  try {
    for (const id of [slotId, rfSlotId].filter(Boolean)) {
      await pg.query(`DELETE FROM ${S}."log_slot_bindings" WHERE slot_id = $1::uuid`, [id])
      await pg.query(`UPDATE ${S}."mst_slots" SET question_id = NULL WHERE id = $1::uuid`, [id])
    }
    await pg.query(`DELETE FROM ${S}."txn_memories" WHERE attribute LIKE 'zz_mtck_%'`)
    await pg.query(`DELETE FROM ${S}."mst_slots" WHERE canonical_label LIKE 'zz_mtck_%'`)
    await pg.query(`DELETE FROM ${S}."mst_slot_questions" WHERE question_key LIKE 'zz_mtck_%'`)
    if (convoId) {
      await pg.query(`DELETE FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid`, [convoId])
      await pg.query(`DELETE FROM ${S}."txn_conversations" WHERE id = $1::uuid`, [convoId])
    }
  } catch (e) { check('teardown ran', false, e?.message) }
  const [res] = await q(
    `SELECT (SELECT count(*)::int FROM ${S}."mst_slot_questions" WHERE question_key LIKE 'zz_mtck_%') AS q,
            (SELECT count(*)::int FROM ${S}."mst_slots" WHERE canonical_label LIKE 'zz_mtck_%') AS s,
            (SELECT count(*)::int FROM ${S}."txn_memories" WHERE attribute LIKE 'zz_mtck_%') AS m,
            (SELECT count(*)::int FROM ${S}."mst_slots" WHERE question_id IS NOT NULL) AS bound`)
  check('⭐ teardown ASSERTED, not trusted — ⛔ and the CANARY is still the ONLY governed slot',
    res.q === 0 && res.s === 0 && res.m === 0 && res.bound === 1,
    `questions=${res.q} slots=${res.s} memories=${res.m} bound_slots=${res.bound}`)
  await pg.end()
  await db.txn_memories.sequelize.close()
  done()
}
