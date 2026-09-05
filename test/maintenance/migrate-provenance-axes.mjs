// ⭐⭐⭐ PHASE 5 · THE AUDITED HISTORICAL PASS — classify every existing memory row on the four axes from RECORDED facts only.
//
//   node test/maintenance/migrate-provenance-axes.mjs            dry run: counts per population, nothing written
//   node test/maintenance/migrate-provenance-axes.mjs --apply    writes, one audit row per changed memory (M7)
//
// `FINAL_SEMANTIC_REMEDIATION_ARCHITECTURE_V1.md` §14 · `PHASE1_SOTERA_PROVENANCE_DECISIONS.md` §8.
//
// ── THE PRINCIPLES, ENFORCED BY CONSTRUCTION ─────────────────────────────────────────────────────────
//   M1  DETERMINISTIC facts may be established: a writer's mechanism (only reflection anchors to HER turns), a ledger link
//       (`wrote_memory_id`), a document reference already in `evidence`, the extractor's declared coincidence.
//   M2  WITHDRAWAL is not repair: `said` on reflection/chat rows disappears by losing its input — nothing is written in its place.
//   M3  UNKNOWN stays unknown: no act ⇒ NULL; no reach ⇒ NULL; no evidence ⇒ no rows.
//   M4  the beyond-range rows keep their pointer; their act's range labels them `reachable but unreviewed` at read.
//   M5  the 6539 rows are re-keyed ONLY where the ledger records the link (`wrote_memory_id`).
//   M6  ⛔ NO time-window act reconstruction · ⛔ NO phrase search · ⛔ NO speaker from anchor role · ⛔ NO credential-as-evidence.
//       There is no code path here that joins on a timestamp window or searches text for a proposition — by construction.
//   M7  every changed row gets an audit row carrying THIS operator act.
//
// ── THE ONE VERIFICATION THAT IS NOT INFERENCE ───────────────────────────────────────────────────────
//   Chat-tool rows are checked for their VALUE appearing verbatim in the occasion turn — the same test that earns `quoted`
//   at write time (Phase 1 §2). It is a deterministic fact about recorded text; it never looks at any other turn.
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { logMemoryChange } from '../../Backend/app/audit/memory-log.js'
import { createReferences, spanAppears } from '../../Backend/app/components/memory-evidence.js'
import { VERIFICATION } from '../../Backend/app/components/memory-writer-contracts.js'
import { devPg, devSchema } from '../harness.mjs'

const APPLY = process.argv.includes('--apply')
const ACT = Object.freeze({ kind: 'operator', id: 'provenance-axes-backfill-2026-09-05' })
const ACTOR = 'ote-operator'
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const say = (s) => console.log(s)
const tally = {}
const bump = (k, n = 1) => { tally[k] = (tally[k] ?? 0) + n }

say(`══ PHASE 5 · provenance axes backfill · ${APPLY ? '⚠️  APPLY' : 'dry run'} · act ${ACT.id} ══`)

// every row, with the pointer's turn (role, conversation, rolling) and its recorded pass link
const rows = await q(`
  SELECT m.id::text AS id, m.source, m.author::text AS author, m.namespace, m.kind, m.value, m.content, m.provenance::text AS provenance,
         m.evidence, m.writer, m.act_kind::text AS act_kind, m.reach_kind::text AS reach_kind,
         m.source_message_id::text AS smid, msg.role AS src_role, msg.conversation_id::text AS src_conv, msg.rolling_id AS src_rid, msg.content AS src_text,
         (SELECT r.id::text FROM ${S}."log_conversation_revisits" r WHERE r.wrote_memory_id = m.id LIMIT 1) AS revisit_id
    FROM ${S}."txn_memories" m
    LEFT JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
   ORDER BY m.created_at`)
say(`rows: ${rows.length} · already classified (writer set): ${rows.filter((r) => r.writer).length}`)

// idempotent on BOTH outcomes: a classified row carries a writer; an UNKNOWN row carries no writer but already carries this
// act's audit row — re-running must not audit it twice
const audited = new Set((await q(`SELECT memory_id::text AS id FROM ${S}."log_memory_changes" WHERE action = 'axes-backfill' AND act_id = $1`, [ACT.id])).map((x) => x.id))
const plans = []
for (const r of rows) {
  if (r.writer) { bump('skipped-already-classified'); continue }
  if (audited.has(r.id)) { bump('skipped-already-audited-unknown'); continue }
  const src = r.source ?? ''
  const plan = { id: r.id, writer: null, act: null, reach: null, refs: [], population: null, reason: '' }
  const turnReach = () => ({ kind: 'turn', messageId: r.smid, conversationId: r.src_conv })

  if (src.startsWith('conversation:') && r.smid && r.src_role === 'user') {
    // ── A · extractor / identity capture — declared coincidence by mechanism (they read exactly this turn) ──
    plan.population = r.namespace === 'identity' ? 'identity' : 'extractor'
    plan.writer = plan.population
    plan.act = { kind: 'turn', id: r.smid }
    plan.reach = turnReach()
    plan.refs = [{ kind: 'turn', target: r.smid, credential: r.provenance ?? null, how: VERIFICATION.declaredCoincidence }]
    plan.reason = 'M1: extractor/identity mechanism — the turn read is the occasion and, by declared coincidence, the evidence'
  } else if (src.startsWith('reconcile:') && r.smid && r.src_role === 'user') {
    // ── D · operator reconciliation — the label is the act; the hand-selected turn is attested evidence ──
    plan.population = 'reconcile'; plan.writer = 'operator'
    plan.act = { kind: 'operator', id: src }
    plan.reach = turnReach()
    plan.refs = [{ kind: 'turn', target: r.smid, credential: r.provenance ?? null, how: VERIFICATION.operatorAttested }]
    plan.reason = 'M1: operator reconciliation — occasion is the ruling label; provenance is the operator-selected turn'
  } else if (src.startsWith('doc:')) {
    // ── E · document ingest — the label is the act; evidence already carries path/commit/quote ──
    plan.population = 'ingest'; plan.writer = 'ingest'
    plan.act = { kind: 'ingest', id: src }
    plan.reach = { kind: 'none' }
    const ev = r.evidence ?? {}
    if (ev.path && ev.commit) plan.refs = [{ kind: 'document', target: `${ev.path}@${ev.commit}`, span: ev.quote ?? null, how: VERIFICATION.writerCited }]
    plan.reason = 'M1: document ingest — act and document reference are recorded in source/evidence'
  } else if (src.startsWith('lesson:') || src.startsWith('decline:')) {
    // ── F · records — their own id is the act; no conversation material; no evidence turn ──
    plan.population = src.startsWith('lesson:') ? 'lesson' : 'decline'; plan.writer = plan.population
    plan.act = { kind: 'record', id: src.slice(src.indexOf(':') + 1) }
    plan.reach = { kind: 'none' }
    plan.reason = 'M1: record writer — the record id is the act; material is not a conversation'
  } else if (r.smid && r.src_role === 'assistant') {
    // ── C · reflection — ONLY reflection anchors to HER turns (13/13 measured; chat anchors lastUserMsg; follow-through the user turn)
    plan.population = 'reflection'; plan.writer = 'reflection'
    if (r.revisit_id) {
      const [rv] = await q(`SELECT from_rolling_id, up_to_rolling_id, messages_considered, conversation_id::text AS cid FROM ${S}."log_conversation_revisits" WHERE id = $1::uuid`, [r.revisit_id])
      plan.act = { kind: 'revisit', id: r.revisit_id }
      if (rv.from_rolling_id != null) {
        plan.reach = { kind: 'range', conversationId: rv.cid, from: rv.from_rolling_id, to: rv.up_to_rolling_id }
        plan.reason = 'M1/M5: reflection — act and range from the ledger row that RECORDS this memory (wrote_memory_id)'
      } else {
        // the lifecycle writes NULL when she had never reviewed the conversation: "the range starts at its beginning".
        // ⭐ CROSS-CHECKED, not assumed: the pass RECORDED how many messages it considered — equal to the messages ≤ up_to
        // ⇒ the whole conversation was in front of her and the range starts at its first message. Unequal ⇒ NOT recorded.
        const [c] = await q(`SELECT min(rolling_id) AS lo, count(*)::int AS n FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid AND rolling_id <= $2`, [rv.cid, rv.up_to_rolling_id])
        if (rv.messages_considered != null && c.n === rv.messages_considered) {
          plan.reach = { kind: 'range', conversationId: rv.cid, from: c.lo, to: rv.up_to_rolling_id }
          plan.reason = `M1/M5: reflection — act from the ledger (wrote_memory_id); from_rolling_id NULL = conversation start, confirmed by messages_considered (${c.n}) = messages ≤ up_to`
        } else {
          plan.reach = null; plan.reachConversationOnly = rv.cid
          plan.reason = `M3: reflection — act from the ledger; from_rolling_id NULL and messages_considered (${rv.messages_considered}) ≠ messages ≤ up_to (${c.n}) ⇒ range NOT recorded`
          bump('reflection-linked-range-unknown')
        }
      }
      bump('reflection-linked-by-ledger')
    } else {
      // M3 · no recorded link ⇒ act NOT recorded; range unknown; the conversation is known from the pointer (a join, not a guess)
      plan.act = null
      plan.reach = null
      plan.reachConversationOnly = r.src_conv
      plan.reason = 'M3/M6: reflection by mechanism; no recorded pass link ⇒ act and range NOT recorded (⛔ no time-window reconstruction)'
      bump('reflection-unlinked')
    }
    plan.refs = [] // ⛔ M6/F7: no reference is ever created for a reflection row here
  } else if (src === 'model-tool' && r.smid && r.src_role === 'user') {
    // ── B · chat tools (remember · remember_fact · keep) — the turn is the occasion; evidence ONLY by verbatim verification
    //      against that turn. ⓘ the AUTHOR (account | persona) does not change the writer: her keep() is a chat tool too ──
    plan.population = 'chat-tool'; plan.writer = 'chat-tool'
    plan.act = { kind: 'turn', id: r.smid }
    plan.reach = turnReach()
    const span = r.value != null && String(r.value).trim().length >= 4 ? String(r.value) : (String(r.content ?? '').trim().length >= 8 ? String(r.content) : null)
    if (span && spanAppears(r.src_text, span)) {
      plan.refs = [{ kind: 'turn', target: r.smid, span, credential: 'quoted', how: VERIFICATION.spanVerified }]
      plan.reason = 'M1: chat tool — occasion is the turn; the value appears VERBATIM in it (verified, not inferred)'
      bump('chat-tool-verified')
    } else {
      plan.reason = 'M2: chat tool — occasion is the turn; the value is not verbatim in it ⇒ provenance not established, said withdrawn'
      bump('chat-tool-not-established')
    }
  } else if (r.smid && r.src_role === 'user') {
    // ── persona-authored or otherwise unlabelled rows anchored to a user turn: the pointer is the occasion (the store's own
    //    definition); the WRITER cannot be told from recorded facts ⇒ not recorded; no evidence
    plan.population = 'turn-anchored-unknown-writer'; plan.writer = null
    plan.act = { kind: 'turn', id: r.smid }
    plan.reach = turnReach()
    plan.reason = 'M1/M3: the pointer is the turn-driven occasion (store definition); writer not recorded'
  } else {
    // ── G · no pointer and no recognised label — genuinely unknown on all three axes ──
    plan.population = 'unknown'; plan.writer = null
    plan.reason = 'M3: no pointer, no recognised writer label — unknown stays unknown'
  }
  plans.push(plan)
  bump(`population:${plan.population}`)
}

say('\n── plan by population ──')
console.table(Object.fromEntries(Object.entries(tally).sort()))

if (!APPLY) { say('\ndry run — nothing written. Re-run with --apply to write (audited).'); await pg.end(); process.exit(0) }

let changed = 0; let refsWritten = 0
for (const p of plans) {
  const before = (await q(`SELECT writer, act_kind::text AS act_kind, act_id, reach_kind::text AS reach_kind, reach_conversation_id::text AS reach_conversation_id FROM ${S}."txn_memories" WHERE id = $1::uuid`, [p.id]))[0]
  const patch = {
    writer: p.writer,
    act_kind: p.act?.kind ?? null, act_id: p.act?.id ?? null,
    reach_kind: p.reach?.kind ?? null,
    reach_conversation_id: p.reach?.conversationId ?? p.reachConversationOnly ?? null,
    reach_message_id: p.reach?.kind === 'turn' ? p.reach.messageId : null,
    reach_from_rolling_id: p.reach?.kind === 'range' ? p.reach.from : null,
    reach_to_rolling_id: p.reach?.kind === 'range' ? p.reach.to : null,
    reach_document: null,
  }
  // reach kind NULL may carry only the conversation (the CHECK allows it) — set through raw SQL to keep the enum casts explicit
  await q(`UPDATE ${S}."txn_memories" SET writer = $2, act_kind = $3::${devSchema()}.enum_txn_memories_act_kind, act_id = $4,
              reach_kind = $5::${devSchema()}.enum_txn_memories_reach_kind, reach_conversation_id = $6::uuid, reach_message_id = $7::uuid,
              reach_from_rolling_id = $8, reach_to_rolling_id = $9, reach_document = NULL
            WHERE id = $1::uuid`,
  [p.id, patch.writer, patch.act_kind, patch.act_id, patch.reach_kind, patch.reach_conversation_id, patch.reach_message_id, patch.reach_from_rolling_id, patch.reach_to_rolling_id])
  if (p.refs.length) {
    const written = await createReferences(db, { memoryId: p.id, refs: p.refs, act: ACT, reach: p.reach, attests: p.writer === 'operator' })
    refsWritten += written.length
  }
  await logMemoryChange(db, {
    memoryId: p.id, action: 'axes-backfill', actor: ACTOR, act: ACT,
    reason: `${p.population}: ${p.reason}`.slice(0, 500),
    before, after: { ...patch, references: p.refs.length }, source: 'migrate-provenance-axes',
  })
  changed++
}
say(`\n✓ applied: ${changed} rows classified · ${refsWritten} evidence references written · ${changed} audit rows (action axes-backfill, act ${ACT.id})`)
await pg.end()
process.exit(0)
