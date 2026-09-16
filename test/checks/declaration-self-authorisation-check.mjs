// ⭐⭐⭐ THE SELF-AUTHORISATION RULE, PROVED BY A CONSTRUCTED ATTACK — ⛔ not by absence of collision.
//
//   node test/checks/declaration-self-authorisation-check.mjs
//
// *Neither the DECLARE nor the BIND that makes a question operative may share the occasion that consumes
// it.* Ratified long ago, RETURNED by `resolveSlotQuestion` all along, and until 2026-09-04 **enforced
// nowhere** — the consumer computed both occasions and threw them away.
//
// ── ⛔⛔ WHY A GREEN HERE WOULD OTHERWISE MEAN NOTHING ──────────────────────────────────────────────
// Every DECLARE and BIND in the live corpus is an OPERATOR act carrying a named occasion like
// `canary-bind-2026-09-03-a-declare`, while a consuming write carries a message UUID. ⭐ Those value
// spaces are DISJOINT, so an equality test over them can never be true — the rule would pass 100% of the
// time **for a structural reason having nothing to do with the question it asks.**
//
// Ote, 2026-09-04: *"Do not claim it proven from operator-origin data… the actual same-occasion attack
// must eventually be constructible before the rule gets credit."*
//
// ⇒ ⭐⭐⭐ THIS CHECK BUILDS THE ATTACK. A real message row is created, its id is used as the DECLARE
// occasion AND as the BIND occasion, and the consuming UPDATE is issued from a service constructed for
// that same turn. The occasions then genuinely COLLIDE, and the refusal is a real one.
//
// ⛔ Writes only to agent_dev, only `zz_` addresses, and removes every row it makes.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'
import { createSlotStore } from '../../Backend/app/components/memory-slot-store-host.js'
import { createMemoryV2Service } from '@ote/memory/cognition/memory-v2-service.js'
import { declareQuestion, proposeBind, confirmBind, resolveSlotQuestion } from '../../Backend/app/components/memory-declaration-host.js'
import { checkConsumingOccasion } from '../../Backend/app/components/memory-bind-rules.js'
import { WRITER as ZZ_WRITER, ACT_KIND as ZZ_ACT_KIND } from '../../Backend/app/components/memory-writer-contracts.js'

// ⭐ D1 PHASE 3 (Ote, 2026-09-16): the store now REFUSES a write or a memory-semantic mutation with no declared
// writer. This check drives the store DIRECTLY, as an operator would, so it declares the axes it was already
// exercising — *"test/check → declares the writer/act/reach it claims to exercise."* ⛔ Spread FIRST, so any call
// that declares its own writer still wins.
const ZZ_AXES = { writer: ZZ_WRITER.operator, act: { kind: ZZ_ACT_KIND.operator, id: `zz_declaration_self_authorisation_check_${Date.now()}` } }


const { check, done } = makeChecker('declaration-self-authorisation')
loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const schema = devSchema()
const S = `"${schema}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const query = (sql, p = []) => pg.query(sql, p)

const t = Date.now()
const KEY_ATTACK = `zz_sa_attack_${t}`
const KEY_CLEAN = `zz_sa_clean_${t}`
const ATTR_ATTACK = `zz_sa_attr_governed_${t}`
// ⚠️⚠️ A DIFFERENT SUBJECT, ⛔ NOT MERELY A DIFFERENT LABEL. The first draft gave the unbound fixture a
// near-identical attribute (`..._a_` vs `..._c_`) and the write landed in the GOVERNED slot: conflict
// resolution matches CANDIDATE ROWS before the slot is decided, so two similar labels under one entity
// are one belief as far as it is concerned. ⭐ The check then failed for a reason with nothing to do with
// the rule. ⇒ separating the ENTITY separates the slot key itself, which is the only separation that
// cannot collapse. A fixture whose two addresses can merge is not two fixtures.
const CLEAN_ENTITY = `zz_sa_subject_${t}`
const ATTR_CLEAN = `zz_sa_attr_unbound_${t}`
let convoId = null
let TURN = null       // ⭐ the occasion the attack declares, binds AND consumes in
let OTHER_TURN = null // ⭐ the control's occasion — a DIFFERENT turn
const MADE = { memories: [], slots: [], messages: [], convo: null }

/**
 * ⭐⭐ THE TWO ORIGINS, BUILT THE WAY PRODUCTION BUILDS THEM — and they are ⛔ NOT interchangeable.
 *
 * ⚠️ `source_message_id` is a UUID FOREIGN KEY to `txn_messages`, so an operator's named occasion CANNOT
 * ride it — the first draft of this helper passed the operator name as `sourceMessageId` and the write
 * died in the driver. ⭐ That is not a nuisance, it is the constraint doing its job: an in-turn occasion
 * must be an authenticated turn key, and the database will not accept an invented one.
 * ⇒ a named operator occasion travels the store's construction-scoped `occasion` instead.
 */
const writer = (userId, { turn = null, operatorOccasion = null } = {}) => {
  // ⭐⭐ D1 PHASE 3 · THE AXES FOLLOW THE ORIGIN, ⛔ NOT A BLANKET CONSTANT.
  // ⚠️ A flat `{ ...ZZ_AXES }` here broke this check's own subject: tests 3 and 5 exist to prove an OCCASION-LESS write
  // is refused, and handing every store an act meant there was no longer an occasion-less case to refuse. ⇒ the WRITER
  // is declared always (Phase 3 requires it), and the ACT is declared only when there IS an occasion — which is exactly
  // the distinction this check measures.
  const act = turn ? { kind: ZZ_ACT_KIND.turn, id: turn }
    : operatorOccasion ? { kind: ZZ_ACT_KIND.operator, id: operatorOccasion }
      : null
  const store = createSequelizeMemoryStore({
    db, persona: null, userId, occasion: turn ?? operatorOccasion,
    writer: turn ? ZZ_WRITER.chatTool : ZZ_WRITER.operator, act,
  })
  const slotStore = createSlotStore({ db, persona: null, userId })
  return createMemoryV2Service({ store, slotStore, persona: null, userId, sourceMessageId: turn })
}

try {
  const [me] = await q(`SELECT id::text AS id FROM ${S}."mst_users" WHERE username = 'agent_dev'`)
  if (!me) throw new Error('agent_dev not found — ⛔ this check must never run as root')

  // ── ⭐ A REAL TURN. `source_message_id` is an FK, so the occasion cannot be an invented string ─────
  const [c] = await q(
    `INSERT INTO ${S}."txn_conversations" (id, user_id, title, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2, now(), now()) RETURNING id::text`, [me.id, `zz_sa_convo_${t}`])
  convoId = c.id; MADE.convo = c.id
  const [m1] = await q(
    `INSERT INTO ${S}."txn_messages" (id, conversation_id, role, content, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'user', $2, now(), now()) RETURNING id::text`, [convoId, `zz_sa_turn_${t}`])
  const [m2] = await q(
    `INSERT INTO ${S}."txn_messages" (id, conversation_id, role, content, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'user', $2, now(), now()) RETURNING id::text`, [convoId, `zz_sa_other_${t}`])
  TURN = m1.id; OTHER_TURN = m2.id
  MADE.messages.push(m1.id, m2.id)
  check('0 · ⭐ two REAL turns exist, so the occasion is an authenticated key and ⛔ not an invented string',
    !!TURN && !!OTHER_TURN && TURN !== OTHER_TURN, `turn=${TURN?.slice(0, 8)} other=${OTHER_TURN?.slice(0, 8)}`)

  // ══ ⭐⭐⭐ THE ATTACK · declare IN the turn, bind IN the turn, then write FROM the turn ════════════
  const dA = await declareQuestion({
    query, schema, questionKey: KEY_ATTACK, asks: 'what is the attack value?', checks: ['nonempty'],
    declaredBy: 'zz_sa', occasion: TURN,
  })
  const wA = writer(me.id, { turn: TURN })
  const seed = await wA.reconcileFact({ entity: 'user', attribute: ATTR_ATTACK, value: 'first' })
  MADE.memories.push(seed.id)
  const [slotA] = await q(
    `SELECT id::text FROM ${S}."mst_slots" WHERE canonical_label = $1 AND user_id = $2::uuid`, [ATTR_ATTACK, me.id])
  MADE.slots.push(slotA.id)
  // ⚠️ propose and confirm may not share an occasion — that rule is separate and still holds. The BIND's
  // occasion of record is the CONFIRM's, so the attack puts the TURN there.
  const pA = await proposeBind({
    query, schema, slotId: slotA.id, questionId: dA.question.id, declaredIntent: 'first-bind',
    actor: 'zz_sa', occasion: `zz_sa_propose_${t}`, reason: 'constructed self-authorisation attack',
  })
  const cA = await confirmBind({
    query, schema, proposalId: pA.proposal.id, actor: 'zz_sa', occasion: TURN, reason: 'constructed attack',
  })
  check('1 · ⭐ the attack slot is bound, with the TURN as its bind occasion', cA.ok === true, cA.why ?? '')

  const rA = await resolveSlotQuestion({ query, schema, slotId: slotA.id })
  check('2 · ⭐⭐ …and BOTH recorded occasions really are this turn — the collision is REAL, ⛔ not simulated',
    rA.declaredInOccasion === TURN && rA.boundInOccasion === TURN,
    `declared=${rA.declaredInOccasion?.slice(0, 8)} bound=${rA.boundInOccasion?.slice(0, 8)} turn=${TURN.slice(0, 8)}`)

  // ⭐⭐⭐ THE CONSUMING UPDATE, FROM THAT SAME TURN — and a correct claim kind, so ⛔ nothing else can
  // be the reason it is refused.
  let refusedA = null
  try {
    await wA.reconcileFact({ entity: 'user', attribute: ATTR_ATTACK, value: 'second', claimKind: KEY_ATTACK })
  } catch (e) { refusedA = e }
  check('3 · ⭐⭐⭐ THE ATTACK IS REFUSED — an act may not use a permission it created in this same occasion',
    refusedA?.code === 'SELF_AUTHORISED_QUESTION', refusedA ? `${refusedA.code}: ${refusedA.message}` : 'NOT REFUSED')
  check('3b · ⭐⭐ …and it is its OWN refusal, ⛔ not reported as a kind mismatch — the remedies differ',
    refusedA?.code !== 'REPLACEMENT_REFUSED' && /same occasion/i.test(refusedA?.message ?? ''),
    `code=${refusedA?.code} reason=${refusedA?.reason}`)
  const liveA = await q(
    `SELECT value FROM ${S}."txn_memories" WHERE slot_id = $1::uuid AND invalid_at IS NULL AND expired_at IS NULL`,
    [slotA.id])
  check('3c · ⭐ the refusal left the world as it found it — one live row, still the previous value',
    liveA.length === 1 && liveA[0].value === 'first', `live=${JSON.stringify(liveA.map((r) => r.value))}`)

  // ══ ⭐⭐⭐ THE CONTROL · the SAME slot and question, consumed from a DIFFERENT turn ════════════════
  // ⛔ Without this, "refused" could mean the gate refuses everything.
  const wOther = writer(me.id, { turn: OTHER_TURN })
  let allowed = null; let refusedOther = null
  try {
    allowed = await wOther.reconcileFact({ entity: 'user', attribute: ATTR_ATTACK, value: 'third', claimKind: KEY_ATTACK })
    if (allowed?.id) MADE.memories.push(allowed.id)
  } catch (e) { refusedOther = e }
  check('4 · ⭐⭐⭐ THE CONTROL — the same write from a DIFFERENT turn is ALLOWED, so the refusal above is '
    + 'about the OCCASION and ⛔ nothing else',
  allowed?.ok === true && !refusedOther, refusedOther ? `${refusedOther.code}: ${refusedOther.message}` : JSON.stringify(allowed?.action))
  const [pinned] = await q(
    `SELECT question_id_at_admission::text AS pin FROM ${S}."txn_memories" WHERE id = $1::uuid`, [allowed?.id])
  check('4b · ⭐⭐ …and THAT row is pinned to the question — the allowed path really did admit under it',
    pinned?.pin === dA.question.id, `pin=${pinned?.pin} expected=${dA.question.id}`)
  const [seedRow] = await q(
    `SELECT question_id_at_admission::text AS pin FROM ${S}."txn_memories" WHERE id = $1::uuid`, [seed.id])
  check('4c · ⛔ …while the pre-bind row was never pinned — ⛔ a pin is not applied retroactively',
    seedRow?.pin === null, `pin=${seedRow?.pin}`)

  // ══ ⭐ A CONSUMER WITH NO OCCASION CANNOT PROVE NON-COLLISION ⇒ REFUSED ═══════════════════════════
  // ⚠️ THE HONEST CONSEQUENCE OF WIRING THIS, STATED AS A TEST RATHER THAN DISCOVERED LATER: a write to a
  // GOVERNED slot that carries no occasion at all is refused. ⭐ That is the ratified fail-closed rule —
  // *"I could not establish that this is a different occasion" must never become "it is"* — and it is why
  // an operator act must name its occasion exactly as its DECLARE and BIND already do.
  const wNone = writer(me.id, {})
  let refusedNone = null
  try {
    await wNone.reconcileFact({ entity: 'user', attribute: ATTR_ATTACK, value: 'fourth', claimKind: KEY_ATTACK })
  } catch (e) { refusedNone = e }
  check('5 · ⭐⭐ an occasion-LESS write to a governed slot is REFUSED, and the refusal says WHICH gap it is',
    refusedNone?.code === 'SELF_AUTHORISED_QUESTION' && refusedNone?.reason === 'no-occasion',
    `code=${refusedNone?.code} reason=${refusedNone?.reason}`)
  // ⭐ …and an OPERATOR-NAMED occasion is accepted, which is what keeps the canary's shape working.
  const wOp = writer(me.id, { operatorOccasion: `zz_sa_operator_act_${t}` })
  let opWrite = null; let refusedOp = null
  try {
    opWrite = await wOp.reconcileFact({ entity: 'user', attribute: ATTR_ATTACK, value: 'fifth', claimKind: KEY_ATTACK })
    if (opWrite?.id) MADE.memories.push(opWrite.id)
  } catch (e) { refusedOp = e }
  check('5b · ⭐⭐⭐ …while a NAMED OPERATOR occasion is ALLOWED — one identifier space, two legitimate '
    + 'origins, exactly as ratified',
  opWrite?.ok === true && !refusedOp, refusedOp ? `${refusedOp.code}: ${refusedOp.reason}` : JSON.stringify(opWrite?.action))

  // ══ ⭐ THE PURE RULE, ASSERTED DIRECTLY — so the wiring above cannot be the only witness ══════════
  check('6 · ⭐ the pure rule agrees on all four shapes',
    checkConsumingOccasion({ consumingOccasion: TURN, declaredInOccasion: TURN, boundInOccasion: 'x' }).ok === false
    && checkConsumingOccasion({ consumingOccasion: TURN, declaredInOccasion: 'x', boundInOccasion: TURN }).ok === false
    && checkConsumingOccasion({ consumingOccasion: TURN, declaredInOccasion: 'x', boundInOccasion: 'y' }).ok === true
    && checkConsumingOccasion({ consumingOccasion: null, declaredInOccasion: 'x', boundInOccasion: 'y' }).ok === false)

  // ══ ⭐ AN UNGOVERNED SLOT IS UNAFFECTED — ⛔ this rule must not become a new blanket gate ═════════
  const dC = await declareQuestion({
    query, schema, questionKey: KEY_CLEAN, asks: 'what is the clean value?', checks: ['nonempty'],
    declaredBy: 'zz_sa', occasion: TURN,
  })
  const one = await wA.reconcileFact({ entity: CLEAN_ENTITY, attribute: ATTR_CLEAN, value: 'a' })
  MADE.memories.push(one.id)
  const [slotC] = await q(
    `SELECT id::text FROM ${S}."mst_slots" WHERE canonical_label = $1 AND user_id = $2::uuid`, [ATTR_CLEAN, me.id])
  if (slotC) MADE.slots.push(slotC.id)
  const rC = await resolveSlotQuestion({ query, schema, slotId: slotC.id })
  check('7a · ⭐ the clean slot really is UNBOUND and carries no declare/bind occasion',
    rC.slotKind === null && rC.declaredInOccasion === null && rC.boundInOccasion === null,
    `slotKind=${rC.slotKind} declared=${rC.declaredInOccasion} bound=${rC.boundInOccasion} governed=${rC.slotGoverned}`)
  let two = null; let refusedClean = null
  try { two = await wA.reconcileFact({ entity: CLEAN_ENTITY, attribute: ATTR_CLEAN, value: 'b' }) } catch (e) { refusedClean = e }
  if (two?.id) MADE.memories.push(two.id)
  check('7 · ⭐⭐ an UNBOUND slot updates freely from the very same turn — ⛔ the rule applies to GOVERNED '
    + 'slots only, and did not become a blanket gate',
  two?.ok === true && two?.action === 'update', refusedClean ? `REFUSED ${refusedClean.code}: ${refusedClean.reason}` : `${JSON.stringify({ ok: two?.ok, action: two?.action })} (question ${dC.question.question_key} declared but ⛔ never bound)`)
  // ⭐⭐⭐ 7b · THE CONTROL THAT WOULD HAVE CAUGHT THE OUTAGE I ALMOST SHIPPED.
  //
  // ⚠️⚠️ 7 above passes an occasion, so it only ever exercised the VALUE comparison. The first wiring of
  // this rule keyed on `slotGoverned` alone — which is a NAMESPACE property, TRUE for every slot in
  // `default` — so an occasion-LESS write to an ORDINARY UNBOUND slot was refused `no-occasion`, and two
  // unrelated suites went red. ⛔ That is the whole `default` namespace refusing ordinary writes.
  // ⇒ this asserts the SCOPE of the rule, not merely its arithmetic: no question declared ⇒ nothing to
  // have been self-authorised ⇒ ⛔ not the rule's business, whatever the occasion is or is not.
  const wNoneClean = writer(me.id, {})
  let three = null; let refusedNoneClean = null
  try { three = await wNoneClean.reconcileFact({ entity: CLEAN_ENTITY, attribute: ATTR_CLEAN, value: 'c' }) }
  catch (e) { refusedNoneClean = e }
  if (three?.id) MADE.memories.push(three.id)
  check('7b · ⭐⭐⭐ an UNBOUND slot accepts a write with NO OCCASION AT ALL — ⛔ the rule governs BOUND '
    + 'slots, and did not turn the whole `default` namespace into a gate',
  three?.ok === true && !refusedNoneClean,
  refusedNoneClean ? `REFUSED ${refusedNoneClean.code}: ${refusedNoneClean.reason}` : JSON.stringify(three?.action))
} catch (e) {
  check('the self-authorisation check ran to completion', false,
    `${e?.message ?? String(e)} @@ code=${e?.code} slot=${String(e?.slotId).slice(0, 8)} `
    + `supersedes=${String(e?.supersedes).slice(0, 8)} slotKind=${e?.slotKind} attackSlot=${String(MADE.slots[0]).slice(0, 8)}`)
} finally {
  try {
    await pg.query(`DELETE FROM ${S}."txn_memories" WHERE attribute LIKE 'zz_sa_attr_%'`)
    for (const id of MADE.slots) {
      await pg.query(`DELETE FROM ${S}."log_slot_bindings" WHERE slot_id = $1::uuid`, [id])
      await pg.query(`UPDATE ${S}."mst_slots" SET question_id = NULL WHERE id = $1::uuid`, [id])
    }
    await pg.query(`DELETE FROM ${S}."mst_slots" WHERE canonical_label LIKE 'zz_sa_attr_%'`)
    await pg.query(`DELETE FROM ${S}."mst_slot_questions" WHERE question_key LIKE 'zz_sa_%'`)
    await pg.query(`DELETE FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid`, [MADE.convo])
    await pg.query(`DELETE FROM ${S}."txn_conversations" WHERE id = $1::uuid`, [MADE.convo])
  } catch (e) { check('teardown ran', false, e?.message) }
  const [res] = await q(
    `SELECT (SELECT count(*)::int FROM ${S}."mst_slot_questions" WHERE question_key LIKE 'zz_sa_%') AS q,
            (SELECT count(*)::int FROM ${S}."mst_slots" WHERE canonical_label LIKE 'zz_sa_%') AS s,
            (SELECT count(*)::int FROM ${S}."txn_memories" WHERE attribute LIKE 'zz_sa_%') AS m,
            (SELECT count(*)::int FROM ${S}."txn_messages" WHERE content LIKE 'zz_sa_%') AS msg,
            (SELECT count(*)::int FROM ${S}."mst_slots" WHERE question_id IS NOT NULL) AS bound`)
  check('⭐ teardown ASSERTED, not trusted — ⛔ and the canary is still the ONLY governed slot',
    res.q === 0 && res.s === 0 && res.m === 0 && res.msg === 0 && res.bound === 1,
    `questions=${res.q} slots=${res.s} memories=${res.m} messages=${res.msg} bound_slots=${res.bound}`)
  await pg.end()
  await db.txn_memories.sequelize.close()
  done()
}
