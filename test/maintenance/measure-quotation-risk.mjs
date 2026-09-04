// ⭐ RISK BOUND for the multi-line-quote candidate, + the remediation facts for the two Cogito rows.
// ⛔ READ-ONLY. Changes nothing.
import { devPg, devSchema } from '../harness.mjs'

const S = `"${devSchema()}"`
const c = devPg(); await c.connect()
const q = async (sql, p = []) => (await c.query(sql, p)).rows
const MULTILINE_QUOTE = /"[^"]*\n[\s\S]*?"/

console.log('══ 1 · THE POPULATION CANDIDATE B WOULD NEWLY STRIP FROM ══\n')
const turns = await q(
  `SELECT m.id::text, m.content, u.username AS room,
          (SELECT count(*)::int FROM ${S}."txn_memories" x
            WHERE x.source_message_id = m.id AND x.invalid_at IS NULL AND x.expired_at IS NULL) AS live_mems
     FROM ${S}."txn_messages" m
     JOIN ${S}."txn_conversations" cv ON cv.id = m.conversation_id
     LEFT JOIN ${S}."mst_users" u ON u.id = cv.user_id
    WHERE m.role = 'user' AND m.content IS NOT NULL`)
const hits = turns.filter((t) => MULTILINE_QUOTE.test(t.content))
const producing = hits.filter((t) => t.live_mems > 0)
console.log(`user turns total ................ ${turns.length}`)
console.log(`with a MULTI-LINE quoted span ... ${hits.length}  (${((hits.length / turns.length) * 100).toFixed(1)}%)`)
console.log(`…of those, produced a LIVE memory ${producing.length}   ⇐ ⭐ the entire blast radius`)
console.table(producing.map((t) => ({
  turn: t.id.slice(0, 8), room: t.room, live_memories: t.live_mems,
  own_prose_after_strip: JSON.stringify(t.content.replace(/"[^"]*\n[\s\S]*?"/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 46)),
})))

console.log('\n══ 2 · THE TWO COGITO ROWS — remediation facts ══\n')
const rows = await q(
  `SELECT m.id::text AS memory_id, m.source_message_id::text AS source_message_id,
          m.value, m.attribute, m.namespace, m.kind, m.provenance::text AS provenance,
          m.confidence, m.importance, m.author::text AS author, m.scope::text AS scope,
          m.slot_id::text AS slot_id, m.supersedes_id::text AS supersedes_id,
          m.question_id_at_admission::text AS pin, m.evidence,
          m.source, m.user_id::text AS room_user_id, m.subject_person_id::text AS subject,
          m.created_at, m.invalid_at, m.expired_at, m.pinned, m.access_count
     FROM ${S}."txn_memories" m
    WHERE m.id IN ('49111883-8a5c-4442-93ae-dbf2cf7c3391','f410bbfd-edcd-4a8c-9232-1c0b40c3fa4a')
    ORDER BY m.created_at`)
for (const r of rows) { console.log(JSON.stringify(r, null, 1)); console.log('') }

console.log('══ 3 · WHICH READ PATHS WOULD STOP SEEING THEM ══\n')
// Every model-facing read filters on the SAME liveness predicate — memory-lint-host owns the one copy.
const [reach] = await q(
  `SELECT count(*)::int AS visible_now FROM ${S}."txn_memories"
    WHERE id IN ('49111883-8a5c-4442-93ae-dbf2cf7c3391','f410bbfd-edcd-4a8c-9232-1c0b40c3fa4a')
      AND invalid_at IS NULL AND expired_at IS NULL`)
console.log(`rows passing the liveness predicate today: ${reach.visible_now} of 2`)
const [audit] = await q(
  `SELECT count(*)::int AS existing_audit_rows FROM ${S}."log_memory_changes"
    WHERE memory_id IN ('49111883-8a5c-4442-93ae-dbf2cf7c3391','f410bbfd-edcd-4a8c-9232-1c0b40c3fa4a')
       OR related_id IN ('49111883-8a5c-4442-93ae-dbf2cf7c3391','f410bbfd-edcd-4a8c-9232-1c0b40c3fa4a')`)
console.log(`existing audit rows for these two: ${audit.existing_audit_rows}`)

console.log('\n══ 4 · IS THE INCIDENT RECONSTRUCTABLE AFTER INVALIDATION? ══\n')
const [src] = await q(
  `SELECT count(*)::int AS source_turns_present FROM ${S}."txn_messages"
    WHERE id IN ('ed747c97-7b91-4e43-8591-5eb598034d03','e5012b4d-9c9f-4912-bb46-8c92518d5cd8')`)
const [conv] = await q(
  `SELECT count(*)::int AS conversation_present FROM ${S}."txn_conversations"
    WHERE id = '7198c1b0-2674-46c3-9e43-ba5e505443f3'`)
console.log(`source turns still stored ....... ${src.source_turns_present} of 2`)
console.log(`origin conversation still stored  ${conv.conversation_present} of 1`)
console.log(`⇒ invalidation sets invalid_at only: the row, its value, its provenance, its evidence`)
console.log(`  and its source_message_id all remain readable, and both source turns are intact.`)
await c.end()
