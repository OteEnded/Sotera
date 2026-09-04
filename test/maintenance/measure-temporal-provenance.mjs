// ⭐⭐ MEASURE THE TIMESTAMPS — ⛔ READ-ONLY. Writes nothing.
//
//   node test/maintenance/measure-temporal-provenance.mjs
//
// Ote: *"Don't assume created_at means 'when this happened.' It may only mean 'when Sotera recorded it.'"*
// ⇒ so the question is not which columns exist, but **whether they ever disagree** — because two columns
// that always agree are one fact under two names, and two that diverge are two different facts.
import { devPg, devSchema } from '../harness.mjs'

const S = `"${devSchema()}"`
const c = devPg(); await c.connect()
const q = async (sql, p = []) => (await c.query(sql, p)).rows
const show = async (label, sql, p = []) => { console.log(`\n── ${label}`); console.table(await q(sql, p)) }

console.log('══ 1 · COVERAGE — can a date even be established? ══')
await show('every live memory, by what temporal anchor it has',
  `SELECT count(*)::int AS live,
          count(*) FILTER (WHERE source_message_id IS NOT NULL)::int AS has_source_msg,
          count(*) FILTER (WHERE valid_at IS NOT NULL)::int AS has_valid_at,
          count(*) FILTER (WHERE last_verified_at IS NOT NULL)::int AS has_last_verified,
          count(*) FILTER (WHERE source_message_id IS NULL)::int AS ⛔_no_source_msg
     FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL`)

console.log('\n══ 2 · ⭐⭐⭐ DO THEY DISAGREE? — memory.created_at vs the SOURCE TURN\'s time ══')
await show('gap between when the memory was RECORDED and when the turn was SPOKEN',
  `SELECT CASE
            WHEN abs(extract(epoch FROM (m.created_at - msg.created_at))) < 300 THEN 'a · same moment (<5 min)'
            WHEN m.created_at > msg.created_at + interval '1 day' THEN 'c · ⚠️ recorded a DAY OR MORE later'
            WHEN m.created_at > msg.created_at THEN 'b · recorded later, same day'
            ELSE 'd · ⛔ recorded BEFORE the turn (impossible — investigate)'
          END AS relationship,
          count(*)::int AS rows,
          max(abs(extract(epoch FROM (m.created_at - msg.created_at))/86400))::numeric(10,1) AS max_gap_days
     FROM ${S}."txn_memories" m JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
    WHERE m.invalid_at IS NULL AND m.expired_at IS NULL
    GROUP BY 1 ORDER BY 1`)
await show('⭐ the widest divergences, named',
  `SELECT left(m.id::text,8) AS mem, coalesce(m.attribute,'(prose)') AS attr,
          left(coalesce(m.value, m.content),40) AS val,
          m.created_at::date AS recorded, msg.created_at::date AS turn_spoken,
          (extract(epoch FROM (m.created_at - msg.created_at))/86400)::numeric(10,1) AS gap_days,
          coalesce(left(m.source,26),'-') AS src
     FROM ${S}."txn_memories" m JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
    WHERE m.invalid_at IS NULL AND m.expired_at IS NULL
    ORDER BY abs(extract(epoch FROM (m.created_at - msg.created_at))) DESC LIMIT 6`)

console.log('\n══ 3 · valid_at — is it a SECOND fact or a copy of created_at? ══')
await show('valid_at vs created_at',
  `SELECT CASE
            WHEN valid_at IS NULL THEN 'null'
            WHEN abs(extract(epoch FROM (valid_at - created_at))) < 2 THEN 'identical to created_at (<2s)'
            ELSE 'DIFFERENT from created_at'
          END AS relationship, count(*)::int AS live_rows
     FROM ${S}."txn_memories" WHERE invalid_at IS NULL AND expired_at IS NULL GROUP BY 1 ORDER BY 2 DESC`)

console.log('\n══ 4 · THE CONVERSATION LAYER — can sourceMessageId give a better answer? ══')
await show('rows whose source turn resolves to a conversation',
  `SELECT count(*)::int AS live_with_src,
          count(cv.id)::int AS turn_resolves_to_a_conversation,
          count(*) FILTER (WHERE msg.id IS NULL)::int AS ⛔_dangling_source_msg_id
     FROM ${S}."txn_memories" m
     LEFT JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
     LEFT JOIN ${S}."txn_conversations" cv ON cv.id = msg.conversation_id
    WHERE m.invalid_at IS NULL AND m.expired_at IS NULL AND m.source_message_id IS NOT NULL`)

console.log('\n══ 5 · WHAT recall_own_memory ACTUALLY RETURNS AS `decidedOn` ══')
await show('own-memory rows: created_at::date is the whole of it',
  `SELECT count(*)::int AS rows, min(created_at::date) AS earliest, max(created_at::date) AS latest,
          count(*) FILTER (WHERE source_message_id IS NOT NULL)::int AS with_a_source_turn
     FROM ${S}."txn_memories"
    WHERE author = 'persona' AND invalid_at IS NULL AND expired_at IS NULL`)

console.log('\n══ 6 · ⚠️ THE INSTRUMENTS CASE — the rows she narrated as "today" ══')
await show('what a date would have said about them',
  `SELECT coalesce(m.attribute,'(prose)') AS attr, left(coalesce(m.value,m.content),42) AS val,
          m.created_at::date AS recorded, msg.created_at::date AS turn_spoken,
          coalesce(left(m.source,24),'-') AS src
     FROM ${S}."txn_memories" m LEFT JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
    WHERE m.invalid_at IS NULL AND m.expired_at IS NULL
      AND m.attribute IN ('instruments played','primary instrument lately','current goal','work style','health impact')
    ORDER BY m.created_at`)
await c.end()
