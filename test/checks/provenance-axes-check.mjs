// ⭐⭐⭐ THE FOUR AXES, LIVE — occasion · reachability · provenance · temporal, and every forbidden inference.
//
//   node test/checks/provenance-axes-check.mjs
//
// Phase 3 red-proof for `SPEC_SOTERA_PROVENANCE_AXES_IMPLEMENTATION.md`. Written before the code. Every fixture is
// `zz_` in agent_dev and removed at the end; ⛔ nothing touches Ote's rows. Where a control must be able to fail, it
// is constructed so that the OLD behaviour fails it (a reflection row acquiring `said`; a chat-tool row acquiring a
// reference without verification; two passes sharing a key).
import { randomUUID } from 'node:crypto'
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryV2 } from '../../Backend/app/components/memory-v2-host.js'
import { ACT_KIND, REACH_KIND, WRITER, actKey } from '../../Backend/app/components/memory-writer-contracts.js'
import { provenanceFor, decidedFor } from '../../Backend/app/components/memory-evidence.js'
import { noteRetrieved, traceFor, clearTrace } from '../../Backend/app/components/memory-retrieval-trace.js'
import { lintMemory } from '../../Backend/app/components/memory-lint-host.js'

const { check, done } = makeChecker('provenance-axes')
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const TZ = 'Asia/Bangkok'
const [agent] = await q(`SELECT id::text AS id FROM ${S}."mst_users" WHERE username = 'agent_dev'`)
const AGENT = agent.id
const MADE = { memories: [], conversations: [], messages: [], revisits: [] }
const M = (r) => { if (r?.id) MADE.memories.push(r.id); return r }

// ── fixture: one zz_ conversation, four turns on TWO days (backdated), a distinctive value in the day-1 user turn ──
async function fixture() {
  const cid = randomUUID(); MADE.conversations.push(cid)
  await q(`INSERT INTO ${S}."txn_conversations" (id, user_id, title, settings, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, 'zz_axes_fixture', '{"probe":true}'::jsonb, now() - interval '3 days', now() - interval '2 days')`, [cid, AGENT])
  const mk = async (role, content, daysAgo) => {
    const id = randomUUID(); MADE.messages.push(id)
    await q(`INSERT INTO ${S}."txn_messages" (id, conversation_id, role, content, created_at, updated_at)
             VALUES ($1::uuid, $2::uuid, $3, $4, now() - ($5 || ' days')::interval, now() - ($5 || ' days')::interval)`, [id, cid, role, content, String(daysAgo)])
    const [r] = await q(`SELECT rolling_id, (created_at AT TIME ZONE '${TZ}')::date::text AS day FROM ${S}."txn_messages" WHERE id = $1::uuid`, [id])
    return { id, rolling_id: r.rolling_id, day: r.day, role, content }
  }
  const u1 = await mk('user', 'zz_axes: I play the zx9-kalimba most evenings, and I drink genmaicha.', 3)
  const a1 = await mk('assistant', 'zz_axes: That sounds lovely — the kalimba has such a soft voice.', 3)
  const u2 = await mk('user', 'zz_axes: also my favourite tea is definitely genmaicha, the roasted kind.', 2)
  const a2 = await mk('assistant', 'zz_axes: Noted. Genmaicha it is.', 2)
  return { cid, u1, a1, u2, a2 }
}
async function revisitRow(cid, { from, to, startedDaysAgo = 2 }) {
  const [r] = await q(`INSERT INTO ${S}."log_conversation_revisits"
      (conversation_id, user_id, up_to_rolling_id, from_rolling_id, messages_considered, text, tools_used, blocked_by_disclosure,
       prompt_generation, code_mtime, model, reason, tool_generation, dispatch_generation, trigger_source, requested_at, started_at, created_at, completed_at, outcome)
    VALUES ($1::uuid, $2::uuid, $3, $4, 4, 'zz_axes', ARRAY[]::text[], false, 3, 0, 'zz', 'zz_axes', 3, 2, 'check',
            now() - ($5 || ' days')::interval, now() - ($5 || ' days')::interval, now() - ($5 || ' days')::interval, now() - ($5 || ' days')::interval + interval '1 minute', 'completed') RETURNING id::text AS id`, [cid, AGENT, to, from, String(startedDaysAgo)])
  MADE.revisits.push(r.id)
  return r.id
}
const mem = (opts) => buildMemoryV2(fastify, { userId: AGENT, ...opts })
const rowOf = async (id) => (await q(`SELECT * FROM ${S}."txn_memories" WHERE id = $1::uuid`, [id]))[0]
const refsOf = async (id) => q(`SELECT * FROM ${S}."txn_memory_evidence" WHERE memory_id = $1::uuid ORDER BY rolling_id`, [id])

try {
  // ══ PRECONDITION · the axes exist (⛔ a check that ran on the old schema would be vacuous) ═══════════
  const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='txn_memories'`, [devSchema()])).map((r) => r.column_name)
  const tables = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema=$1`, [devSchema()])).map((r) => r.table_name)
  check('P0 · the axes exist on the schema: act_kind/act_id/writer/reach_* on txn_memories and txn_memory_evidence', ['act_kind', 'act_id', 'writer', 'reach_kind', 'reach_conversation_id', 'reach_from_rolling_id', 'reach_to_rolling_id'].every((c) => cols.includes(c)) && tables.includes('txn_memory_evidence'))
  if (!tables.includes('txn_memory_evidence')) throw new Error('schema not migrated — nothing below can be judged')

  const F = await fixture()
  const turnAct = (m) => ({ kind: ACT_KIND.turn, id: m.id })
  const turnReach = (m) => ({ kind: REACH_KIND.turn, messageId: m.id, conversationId: F.cid })

  // ══ O · OCCASION ════════════════════════════════════════════════════════════════════════════════════
  const ext = mem({ writer: WRITER.extractor, act: turnAct(F.u1), reach: turnReach(F.u1), sourceMessageId: F.u1.id })
  const e1 = M(await ext.remember({ content: 'zz_axes: user plays the zx9-kalimba', kind: 'semantic' }))
  const e1row = await rowOf(e1.id)
  check('O-1 · a write carries act_kind/act_id and writer', e1row.act_kind === 'turn' && e1row.act_id === F.u1.id && e1row.writer === 'extractor', JSON.stringify([e1row.act_kind, e1row.writer]))
  check('O-3 · a turn act key is the message id — byte-identical to today\'s occasion', actKey({ kind: e1row.act_kind, id: e1row.act_id }) === F.u1.id)

  const passA = await revisitRow(F.cid, { from: F.u1.rolling_id, to: F.a1.rolling_id, startedDaysAgo: 2 })
  const passB = await revisitRow(F.cid, { from: F.u2.rolling_id, to: F.a2.rolling_id, startedDaysAgo: 1 })
  const rangeA = { kind: REACH_KIND.range, conversationId: F.cid, from: F.u1.rolling_id, to: F.a1.rolling_id }
  const rangeB = { kind: REACH_KIND.range, conversationId: F.cid, from: F.u2.rolling_id, to: F.a2.rolling_id }
  // both passes anchor to the SAME newest message (the old top.id behaviour) — the keys must still differ
  const refA = mem({ writer: WRITER.reflection, author: 'persona', act: { kind: ACT_KIND.revisit, id: passA }, reach: rangeA, sourceMessageId: F.a2.id })
  const refB = mem({ writer: WRITER.reflection, author: 'persona', act: { kind: ACT_KIND.revisit, id: passB }, reach: rangeB, sourceMessageId: F.a2.id })
  const rA = M(await refA.remember({ content: 'zz_axes: the user clarified they play the kalimba in the evenings', kind: 'semantic' }))
  const rB = M(await refB.remember({ content: 'zz_axes: the user seems to like roasted tea', kind: 'semantic' }))
  const rowA = await rowOf(rA.id); const rowB = await rowOf(rB.id)
  check('O-2 · ⭐⭐⭐ two passes anchored to the SAME message carry DIFFERENT act keys — pass identity is not conversation state (the 6539 fix)',
    rowA.source_message_id === rowB.source_message_id && rowA.act_id !== rowB.act_id && actKey({ kind: rowA.act_kind, id: rowA.act_id }) !== actKey({ kind: rowB.act_kind, id: rowB.act_id }), `${rowA.act_id?.slice(0, 8)} vs ${rowB.act_id?.slice(0, 8)}`)
  check('O-3b · a revisit act key is namespaced, never a bare message uuid', actKey({ kind: rowA.act_kind, id: rowA.act_id }) === `revisit:${passA}`)

  let noAct = null
  try { M(await mem({ writer: WRITER.reflection, author: 'persona', reach: rangeA, sourceMessageId: F.a2.id }).remember({ content: 'zz_axes: should be refused', kind: 'semantic' })) } catch (e) { noAct = e }
  check('O-4 · ⭐ a PASS writer without an act is REFUSED (fail closed), code NO_ACT', noAct?.code === 'NO_ACT', noAct?.message)
  let dist = null
  try { M(await mem({ writer: WRITER.distiller, reach: rangeA }).remember({ content: 'zz_axes: distiller without act', kind: 'episodic' })) } catch (e) { dist = e }
  check('O-8 · the disabled distiller writer is refused without an act — enabling it by flag alone fails loudly', dist?.code === 'NO_ACT')

  // O-7 · traces under two act keys sharing a message do not share
  clearTrace()
  noteRetrieved(actKey({ kind: 'revisit', id: passA }), [{ id: e1.id, kind: 'semantic', content: 'x' }], { via: 'recall_memory' })
  check('O-7 · retrieval traces under two distinct pass keys (same anchor message) do not share items', traceFor(actKey({ kind: 'revisit', id: passA })).length === 1 && traceFor(actKey({ kind: 'revisit', id: passB })).length === 0 && traceFor(F.a2.id).length === 0)
  clearTrace()

  // ══ R · REACHABILITY ════════════════════════════════════════════════════════════════════════════════
  check('R-1 · turn reach stores message + conversation', e1row.reach_kind === 'turn' && e1row.reach_message_id === F.u1.id && e1row.reach_conversation_id === F.cid)
  check('R-2 · range reach stores conversation + from ≤ to', rowA.reach_kind === 'range' && rowA.reach_conversation_id === F.cid && rowA.reach_from_rolling_id === F.u1.rolling_id && rowA.reach_to_rolling_id === F.a1.rolling_id)
  const doc = mem({ writer: WRITER.ingest, act: { kind: ACT_KIND.ingest, id: 'doc:zz_axes/spec.md@deadbeef' }, reach: { kind: REACH_KIND.none } })
  const d1 = M(await doc.remember({ content: 'zz_axes: from a document', kind: 'semantic', source: 'doc:zz_axes/spec.md@deadbeef',
    evidenceRefs: [{ kind: 'document', target: 'zz_axes/spec.md@deadbeef', span: 'from a document' }] }))
  const d1row = await rowOf(d1.id); const d1refs = await refsOf(d1.id)
  check('R-4 · ⭐ `none` reach coexists with an act AND with established provenance (a document reference) — three axes, independent', d1row.reach_kind === 'none' && d1row.act_kind === 'ingest' && d1refs.length === 1 && d1refs[0].established === true && d1refs[0].ref_kind === 'document')

  const gs = (svc, id, ctx = 1) => svc.getSource({ id, context: ctx })
  const srcE = await gs(ext, e1.id)
  check('R-5 · readable (same room): material state readable, reviewed:true for the turn itself', srcE.evidenceState === 'source-readable' && srcE.material?.kind === 'turn' && srcE.material?.reviewed === true, JSON.stringify(srcE.material))
  const srcA = await gs(refA, rA.id)
  check('R-9 · ⭐⭐ reachable-but-unreviewed: pass A\'s legacy pointer (a2) lies OUTSIDE its range ⇒ reviewed:false; the range is reported as the material', srcA.material?.kind === 'range' && srcA.material?.reviewed === false && srcA.material?.from === F.u1.rolling_id && srcA.material?.to === F.a1.rolling_id, JSON.stringify(srcA.material))
  const srcB = await gs(refB, rB.id)
  check('R-9b · pass B\'s pointer (a2) lies INSIDE its range ⇒ reviewed:true', srcB.material?.reviewed === true)
  const srcD = await gs(doc, d1.id)
  check('R-8 · never-recorded: a document row has no conversation material, and says so', srcD.evidenceState === 'source-never-recorded' && srcD.material?.kind === 'none')
  // destroyed: a turn-reach row whose message is deleted
  const gone = randomUUID(); MADE.messages.push(gone)
  await q(`INSERT INTO ${S}."txn_messages" (id, conversation_id, role, content, created_at, updated_at) VALUES ($1::uuid, $2::uuid, 'user', 'zz_axes: gone soon', now(), now())`, [gone, F.cid])
  const g1 = M(await mem({ writer: WRITER.chatTool, act: { kind: 'turn', id: gone }, reach: { kind: 'turn', messageId: gone, conversationId: F.cid }, sourceMessageId: gone }).remember({ content: 'zz_axes: about a destroyed turn', kind: 'semantic' }))
  await q(`DELETE FROM ${S}."txn_messages" WHERE id = $1::uuid`, [gone])
  check('R-7 · destroyed: the material message is gone ⇒ source-destroyed, distinct from never-recorded', (await gs(ext, g1.id)).evidenceState === 'source-destroyed')
  // unreadable: another room reading — build a service for a different user id (a scope that cannot read agent_dev's room)
  const other = buildMemoryV2(fastify, { userId: randomUUID(), writer: WRITER.chatTool })
  const srcU = await other.getSource({ id: e1.id })
  check('R-6 · unreadable/out of scope: another room\'s service cannot read the row at all (found:false), which is the stricter of the two honest answers', srcU.found === false || srcU.evidenceState === 'source-unreadable')

  // ══ P · PROVENANCE ══════════════════════════════════════════════════════════════════════════════════
  const provA = (await provenanceFor(db, [rA.id], { tz: TZ })).get(rA.id)
  check('P-1 · ⭐⭐⭐ ZERO references is representable while act and reach are present — the reflection row is NOT established', provA.established === false && provA.references.length === 0 && rowA.act_kind === 'revisit' && rowA.reach_kind === 'range')
  const provE = (await provenanceFor(db, [e1.id], { tz: TZ })).get(e1.id)
  check('P-2 · ⭐ the extractor\'s declared coincidence yields ONE established turn reference — speaker account-holder, date = the turn\'s day', provE.established && provE.references.length === 1 && provE.references[0].kind === 'turn' && provE.references[0].speaker === 'account-holder' && provE.references[0].date === F.u1.day && provE.references[0].verification?.how === 'declared-coincidence', JSON.stringify(provE.references[0]))
  const op = mem({ writer: WRITER.operator, act: { kind: 'operator', id: 'zz_axes-ruling-1' }, reach: turnReach(F.u1), sourceMessageId: F.u1.id })
  const o1 = M(await op.remember({ content: 'zz_axes: reconciled across two turns', kind: 'semantic',
    evidenceRefs: [{ kind: 'turn', target: F.u1.id }, { kind: 'turn', target: F.u2.id }, { kind: 'memory', target: e1.id }] }))
  const provO = (await provenanceFor(db, [o1.id], { tz: TZ })).get(o1.id)
  check('P-3 · multiple references are recorded and returned', provO.references.length === 3 && provO.established)
  const memRef = provO.references.find((r) => r.kind === 'memory')
  check('P-5 · a MEMORY reference establishes support only — no speaker, no date', memRef && memRef.established && memRef.speaker == null && memRef.date == null)
  const oa = M(await op.remember({ content: 'zz_axes: her own words cited', kind: 'semantic', evidenceRefs: [{ kind: 'turn', target: F.a1.id }] }))
  const provOA = (await provenanceFor(db, [oa.id], { tz: TZ })).get(oa.id)
  check('P-4 · a turn reference to an ASSISTANT turn ⇒ speaker persona, never account-holder', provOA.references[0]?.speaker === 'persona')

  // P-6 · chat-tool verification P / N / X / F
  const chatU2 = mem({ writer: WRITER.chatTool, act: turnAct(F.u2), reach: turnReach(F.u2), sourceMessageId: F.u2.id })
  // ⓘ attributes share NO token: a shared prefix made the slot resolver fold three facts into ONE slot (P was superseded by N)
  const cP = M(await chatU2.reconcileFact({ entity: 'user', attribute: 'preferred roasted tea', value: 'genmaicha' }))
  const cN = M(await chatU2.reconcileFact({ entity: 'user', attribute: 'twilight temperament', value: 'contemplative and unhurried' }))
  const cX = M(await chatU2.reconcileFact({ entity: 'user', attribute: 'lamellophone model', value: 'zx9-kalimba' })) // present in u1, NOT in u2
  const [pP, pN, pX] = [cP, cN, cX].map((r) => r.id)
  const provP = (await provenanceFor(db, [pP, pN, pX], { tz: TZ }))
  check('P-6/P · verbatim in the occasion turn ⇒ an established turn reference, credential quoted, span-verified', provP.get(pP).established && provP.get(pP).references[0].credential === 'quoted' && provP.get(pP).references[0].verification?.how === 'span-verified')
  check('P-6/N · ⭐ synthesised, not in the turn ⇒ NO reference (F8: no chat coincidence)', provP.get(pN).established === false && provP.get(pN).references.length === 0)
  check('P-6/X · ⭐⭐ present only in an EARLIER turn ⇒ NO reference — no search beyond the occasion turn', provP.get(pX).established === false && provP.get(pX).references.length === 0)
  const orphanMsg = randomUUID()
  let fThrew = null; let cF = null
  try { cF = M(await mem({ writer: WRITER.chatTool, act: { kind: 'turn', id: orphanMsg }, reach: { kind: 'turn', messageId: orphanMsg, conversationId: F.cid }, sourceMessageId: orphanMsg }).remember({ content: 'zz_axes: no content to verify against', kind: 'semantic' })) } catch (e) { fThrew = e }
  check('P-6/F · missing occasion content ⇒ no reference and no throw (fail closed on the reference, not the item)', !fThrew && cF?.id && (await provenanceFor(db, [cF.id], { tz: TZ })).get(cF.id).established === false, fThrew?.message)

  const srcAfull = await refA.getSource({ id: rA.id })
  check('P-7 · ⭐⭐ getSource on an unreferenced row: provenanceEstablished:false, evidence:[], speaker "not established" — and the material is labelled material, ⛔ not "the source"', srcAfull.provenanceEstablished === false && Array.isArray(srcAfull.evidence) && srcAfull.evidence.length === 0 && srcAfull.speaker === 'not established' && srcAfull.material?.kind === 'range')
  const bad = M(await op.remember({ content: 'zz_axes: a false citation', kind: 'semantic', evidenceRefs: [{ kind: 'turn', target: F.u1.id, span: 'these words are not in that turn at all' }] }))
  const badRefs = await refsOf(bad.id)
  check('P-8 · ⭐⭐⭐ a citation whose span is NOT in the cited turn is recorded as FAILED — and the item is STILL WRITTEN (I10)', bad?.id && badRefs.length === 1 && badRefs[0].established === false && badRefs[0].verification?.how === 'failed', JSON.stringify(badRefs[0]?.verification))
  const outside = M(await refA.remember({ content: 'zz_axes: cites outside its range', kind: 'semantic', evidenceRefs: [{ kind: 'turn', target: F.u2.id }] }))
  const outRefs = await refsOf(outside.id)
  check('P-9 · a pass writer\'s turn citation OUTSIDE its reviewed range is recorded as failed — a fabrication by construction (R3)', outRefs.length === 1 && outRefs[0].established === false && /range/i.test(outRefs[0].verification?.reason ?? ''))

  // ══ T · TEMPORAL ════════════════════════════════════════════════════════════════════════════════════
  const listed = await mem({ writer: WRITER.chatTool }).list({ limit: 500 })
  const whenOf = (id) => listed.memories.find((m) => m.id === id)?.when
  check('T-1 · extractor row: when.said = the turn\'s day (declared coincidence)', whenOf(e1.id)?.basis === 'said' && whenOf(e1.id)?.date === F.u1.day, JSON.stringify(whenOf(e1.id)))
  check('T-2 · ⭐⭐⭐ reflection row: NO said — basis recorded — although it has an act and a reach (the old behaviour manufactured said here)', whenOf(rA.id)?.basis === 'recorded', JSON.stringify(whenOf(rA.id)))
  check('T-3 · chat-tool: said only through verification — P has said = u2\'s day, N has recorded', whenOf(pP)?.basis === 'said' && whenOf(pP)?.date === F.u2.day && whenOf(pN)?.basis === 'recorded', JSON.stringify({ P: whenOf(pP), N: whenOf(pN), u2: F.u2.day, listed: listed.memories.length, Prow: (({ kind, author, scope, namespace, invalid_at, expired_at, contradicted_at, supersedes_id, user_id }) => ({ kind, author, scope, namespace, invalid_at, expired_at, contradicted_at, supersedes_id, mine: user_id === AGENT }))(await rowOf(pP) ?? {}) }))
  check('T-4 · ⭐ two account-holder references on DIFFERENT days ⇒ said WITHHELD (recorded), both days visible on the references', whenOf(o1.id)?.basis === 'recorded' && new Set(provO.references.filter((r) => r.kind === 'turn').map((r) => r.date)).size === 2)
  const today = (await q(`SELECT (now() AT TIME ZONE '${TZ}')::date::text AS d`))[0].d
  check('T-5 · recorded = the row\'s created_at day regardless of act', whenOf(rA.id)?.date === today)
  const dec = await decidedFor(db, rowA, { tz: TZ })
  const [passRow] = await q(`SELECT (started_at AT TIME ZONE '${TZ}')::date::text AS d FROM ${S}."log_conversation_revisits" WHERE id = $1::uuid`, [passA])
  check('T-6 · decided = the pass\'s started_at day (2 days ago), ⛔ not the row\'s day', dec === passRow.d && dec !== today, `${dec} vs row ${today}`)

  // ══ S · SPEAKER ═════════════════════════════════════════════════════════════════════════════════════
  check('S-1 · no speaker from author: persona-authored row WITH an account-holder ref reports account-holder; account row with no ref reports not established',
    (await op.getSource({ id: o1.id })).speaker === 'account-holder' && (await chatU2.getSource({ id: pN })).speaker === 'not established', JSON.stringify({ o1: (await op.getSource({ id: o1.id })).speaker, pN: (await chatU2.getSource({ id: pN })).speaker }))
  const lint = await lintMemory(db, { userId: AGENT })
  // the report groups findings by OWNER: owners[].findings[] each carrying .rule and .id
  const firedIn = (rep, id) => (rep.owners ?? []).flatMap((o) => o.findings ?? []).filter((f) => f.rule === id).map((f) => f.id)
  const fired = (id) => firedIn(lint, id)
  check('S-2 · ⭐ "the user clarified…" with no account-holder turn ref ⇒ lint unreferenced-speaker-claim (suspect), and getSource.speaker = not established', fired('unreferenced-speaker-claim').includes(rA.id) && srcAfull.speaker === 'not established')
  check('S-3 · the store never refused the unreferenced speaker claim — no write-time pressure (I10)', !!rA.id)

  // ══ I · LINT RULES fire on constructed fixtures, silent on conformant rows ═══════════════════════════
  const bogus = M(await mem({ writer: WRITER.reflection, author: 'persona', act: { kind: 'revisit', id: passA }, reach: turnReach(F.a2), sourceMessageId: F.a2.id }).remember({ content: 'zz_axes: pass writer with a point reach', kind: 'semantic' }))
  const over = M(await mem({ writer: WRITER.reflection, author: 'persona', act: { kind: 'revisit', id: passA }, reach: { kind: 'range', conversationId: F.cid, from: F.u1.rolling_id, to: F.a2.rolling_id }, sourceMessageId: F.a2.id }).remember({ content: 'zz_axes: claims more than the pass showed', kind: 'semantic' }))
  const lint2 = await lintMemory(db, { userId: AGENT })
  const fired2 = (id) => firedIn(lint2, id)
  check('I-2 · pass-writer-point-reach fires on a pass row with a turn reach, not on the range rows', fired2('pass-writer-point-reach').includes(bogus.id) && !fired2('pass-writer-point-reach').includes(rA.id))
  check('R-10 / I-3 · coverage-exceeds-reviewed fires when reach_to > the ledger\'s up_to for that act', fired2('coverage-exceeds-reviewed').includes(over.id) && !fired2('coverage-exceeds-reviewed').includes(rA.id))
  await q(`UPDATE ${S}."txn_memories" SET provenance = 'quoted' WHERE id = $1::uuid`, [rA.id])
  const lint3 = await lintMemory(db, { userId: AGENT })
  check('I-5 · credential-without-reference fires on a `quoted` row with no established turn reference', firedIn(lint3, 'credential-without-reference').includes(rA.id))
  check('I-1 · pass-writer-without-act cannot fire on live writes (the store refuses) — the rule exists for history and reports 0 here', lint3.rules?.some((r) => r.id === 'pass-writer-without-act') && !firedIn(lint3, 'pass-writer-without-act').some((id) => MADE.memories.includes(id)))

  // ══ F · FORBIDDEN INFERENCES, one explicit assertion each ═══════════════════════════════════════════
  check('F-1 · no reference materialises from the pointer for a non-coincidence writer (N case has none)', provP.get(pN).references.length === 0)
  check('F-2 · a readable material message does not become a reference (reflection row: material readable, evidence empty)', srcAfull.evidenceState === 'source-readable' && srcAfull.evidence.length === 0)
  check('F-3 · a conversation-state key is not an act (O-2)', rowA.act_id !== rowB.act_id)
  check('F-4 · speaker is not read from the anchor\'s role: the reflection row anchored to HER turn is not-established, ⛔ not persona', srcAfull.speaker === 'not established')
  check('F-5 · said is not the pointer\'s date (T-2)', whenOf(rA.id)?.basis === 'recorded')
  check('F-8 · no chat-tool coincidence (P-6/N, P-6/X)', provP.get(pN).references.length === 0 && provP.get(pX).references.length === 0)
  const [confRow] = await q(`SELECT confidence FROM ${S}."txn_memories" WHERE id = $1::uuid`, [rA.id])
  check('F-10 · a credential set on an unreferenced row raised no confidence (the ceiling rides the reference)', confRow.confidence == null || confRow.confidence <= 0.6)
  // F-6 / F-7 / F-9 are asserted in the unit test (F-9) and in the migration script\'s own dry-run (F-6, F-7) — see incident-replay-check
} finally {
  // ── cleanup, in FK order ──
  if (MADE.memories.length) await q(`DELETE FROM ${S}."txn_memories" WHERE id = ANY($1::uuid[])`, [MADE.memories])
  await q(`DELETE FROM ${S}."txn_memories" WHERE user_id = $1::uuid AND content LIKE 'zz_axes%'`, [AGENT])
  if (MADE.revisits.length) await q(`DELETE FROM ${S}."log_conversation_revisits" WHERE id = ANY($1::uuid[])`, [MADE.revisits])
  if (MADE.messages.length) await q(`DELETE FROM ${S}."txn_messages" WHERE id = ANY($1::uuid[])`, [MADE.messages])
  if (MADE.conversations.length) await q(`DELETE FROM ${S}."txn_conversations" WHERE id = ANY($1::uuid[])`, [MADE.conversations])
  await q(`DELETE FROM ${S}."log_memory_changes" WHERE reason LIKE 'zz_axes%'`).catch(() => {})
  await pg.end()
}
done()
