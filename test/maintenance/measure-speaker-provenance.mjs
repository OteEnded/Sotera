// ⭐⭐ SPEAKER PROVENANCE — what `source_message_id` means in practice, and where it contradicts the words.
//
//   node test/maintenance/measure-speaker-provenance.mjs            ⛔ READ-ONLY. Writes nothing.
//
// Ote, 2026-09-05, on 294f8f26 ("the user clarified Rome is a metaphor" → source = HER 23:30 turn):
//   1  trace how reflection chooses source_message_id when the evidence spans several turns; establish what
//      the field currently MEANS — ⛔ do not assume it must be the originating proposition turn.
//   2  census memories whose CONTENT attributes speech/action to a speaker, and whose source turn has a
//      contradictory role; size it, classify it, make it auditable.
// ⛔ Measurement only. Nothing is changed, decided or repaired.
import { devPg, devSchema } from '../harness.mjs'

const S = `"${devSchema()}"`
const c = devPg(); await c.connect()
const q = async (s, p = []) => (await c.query(s, p)).rows
const line = (t) => console.log(`\n${'═'.repeat(110)}\n${t}\n${'═'.repeat(110)}`)
const TZ = 'Asia/Bangkok'

// ══ 1 · WHAT DOES source_message_id POINT AT, BY WRITER? ═════════════════════════════════════════════
line('1 · source_message_id → the SOURCE TURN\'S ROLE, by writer (`source`), all memories incl. archived')
console.table(await q(`
  SELECT coalesce(m.source,'(null)') AS writer,
         count(*)::int AS memories,
         count(*) FILTER (WHERE m.source_message_id IS NULL)::int AS no_source,
         count(*) FILTER (WHERE msg.role = 'user')::int AS src_user,
         count(*) FILTER (WHERE msg.role = 'assistant')::int AS src_assistant,
         count(*) FILTER (WHERE m.source_message_id IS NOT NULL AND msg.id IS NULL)::int AS dangling
    FROM ${S}."txn_memories" m LEFT JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
   GROUP BY 1 ORDER BY 2 DESC`))

// ══ 2 · IS THE SOURCE TURN THE LAST TURN OF THE CONVERSATION AT WRITE TIME? ═══════════════════════════
// If reflection stamps "the message the occasion fired on", the source turn should be the newest message in
// the conversation when the memory was written — regardless of who spoke it.
line('2 · for each writer: is the source turn the NEWEST message in its conversation at the moment the memory was written?')
console.table(await q(`
  WITH x AS (
    SELECT m.id, coalesce(m.source,'(null)') AS writer, msg.role,
           msg.rolling_id AS src_rid,
           (SELECT max(rolling_id) FROM ${S}."txn_messages" l WHERE l.conversation_id = msg.conversation_id AND l.created_at <= m.created_at) AS last_rid_at_write,
           (SELECT count(*) FROM ${S}."txn_messages" l WHERE l.conversation_id = msg.conversation_id AND l.created_at <= m.created_at) AS turns_at_write
      FROM ${S}."txn_memories" m JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id)
  SELECT writer, count(*)::int AS with_source,
         count(*) FILTER (WHERE src_rid = last_rid_at_write)::int AS src_is_LAST_turn,
         count(*) FILTER (WHERE src_rid < last_rid_at_write)::int AS src_is_EARLIER_turn,
         count(*) FILTER (WHERE src_rid = last_rid_at_write AND role = 'assistant')::int AS last_and_assistant,
         count(*) FILTER (WHERE src_rid = last_rid_at_write AND role = 'user')::int AS last_and_user
    FROM x GROUP BY 1 ORDER BY 2 DESC`))

// ══ 3 · 294f8f26 ITSELF ══════════════════════════════════════════════════════════════════════════════
line('3 · 294f8f26 — the row, its source turn, and the conversation\'s turns around the write')
console.table(await q(`
  SELECT left(m.id::text,8) AS id, m.source, m.kind, left(m.content,90) AS content,
         to_char(m.created_at AT TIME ZONE '${TZ}','MM-DD HH24:MI:SS') AS written,
         msg.role AS src_role, to_char(msg.created_at AT TIME ZONE '${TZ}','MM-DD HH24:MI:SS') AS src_at, msg.rolling_id AS src_rid,
         (SELECT max(rolling_id) FROM ${S}."txn_messages" l WHERE l.conversation_id = msg.conversation_id) AS conv_last_rid
    FROM ${S}."txn_memories" m JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
   WHERE m.id::text LIKE '294f8f26%'`))
console.log('the turns that actually say "north star" / "Rome" in that conversation (the proposition turns):')
console.table(await q(`
  SELECT to_char(created_at AT TIME ZONE '${TZ}','HH24:MI:SS') AS at, role, rolling_id,
         (content ILIKE '%north star%')::int AS north_star, (content ILIKE '%rome%')::int AS rome, length(content) AS chars
    FROM ${S}."txn_messages" WHERE conversation_id = 'c5535976-2ea9-420d-9e15-3105eb517e67'::uuid
     AND (content ILIKE '%rome%' OR content ILIKE '%north star%') ORDER BY created_at`))
console.log('every memory reflection wrote from THAT conversation, and which turn each points at:')
console.table(await q(`
  SELECT left(m.id::text,8) AS id, left(coalesce(m.attribute,'(prose)'),28) AS attribute, left(m.content,60) AS content,
         to_char(m.created_at AT TIME ZONE '${TZ}','MM-DD HH24:MI:SS') AS written, msg.role AS src_role, to_char(msg.created_at AT TIME ZONE '${TZ}','HH24:MI:SS') AS src_at
    FROM ${S}."txn_memories" m JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
   WHERE msg.conversation_id = 'c5535976-2ea9-420d-9e15-3105eb517e67'::uuid ORDER BY m.created_at`))

// ══ 4 · THE CENSUS — content that ATTRIBUTES speech/action to a speaker ═══════════════════════════════
line('4 · CENSUS · memories whose content attributes speech to a speaker, joined to the source turn\'s role')
// ⚠️ A DELIBERATELY WIDE NET, then classified BY HAND below. Speech verbs only — "wants/prefers" is a state,
// not an utterance, and would not assert who SPOKE.
const SPEECH = "(said|says|saying|clarified|clarifies|told|tells|telling|mentioned|mentions|explained|explains|asked|asks|confirmed|confirms|stated|states|shared|describes|described|revealed|admitted|announced|expressed|noted|pointed out|replied|answered|wrote|บอก|พูด|เล่า|ระบุ|ถาม|อธิบาย)"
const rows = await q(`
  SELECT left(m.id::text,8) AS id, coalesce(m.source,'(null)') AS writer, m.kind,
         m.invalid_at IS NULL AND m.expired_at IS NULL AS live,
         msg.role AS src_role,
         substring(m.content from '(?i)(?:the user|user|ote|dad|he|she|they|i|sotera|hermes|cogito|claude|mr\\.? c)\\M[^.]{0,30}\\m${SPEECH}\\M') AS attribution,
         left(m.content, 110) AS content
    FROM ${S}."txn_memories" m LEFT JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
   WHERE m.content ~* '\\m(the user|user|ote|dad|he|she|they|i|sotera|hermes|cogito|claude|mr\\.? c)\\M[^.]{0,30}\\m${SPEECH}\\M'
   ORDER BY m.source, m.created_at`)
console.log(`candidates: ${rows.length}`)
console.table(await q(`
  SELECT coalesce(m.source,'(null)') AS writer, msg.role AS src_role, count(*)::int AS n
    FROM ${S}."txn_memories" m LEFT JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
   WHERE m.content ~* '\\m(the user|user|ote|dad|he|she|they|i|sotera|hermes|cogito|claude|mr\\.? c)\\M[^.]{0,30}\\m${SPEECH}\\M'
   GROUP BY 1,2 ORDER BY 1,2`))
console.log('\nevery candidate (id · writer · live · src_role · the attribution phrase · content):')
for (const r of rows) {
  console.log(`  ${r.id}  ${String(r.writer).padEnd(22)} ${r.live ? 'live' : 'arch'}  src=${String(r.src_role ?? 'NULL').padEnd(9)} «${String(r.attribution ?? '').replace(/\s+/g, ' ').slice(0, 44)}»  ${JSON.stringify(String(r.content).replace(/\s+/g, ' ').slice(0, 96))}`)
}

// ══ 5 · THE REVERSE: content attributes speech to SOTERA ("I said/told") but the source is a USER turn ═
line('5 · the reverse direction — first-person attribution ("I told/said…") whose source turn is the USER\'s')
console.table(await q(`
  SELECT left(m.id::text,8) AS id, coalesce(m.source,'(null)') AS writer, msg.role AS src_role, left(m.content,100) AS content
    FROM ${S}."txn_memories" m LEFT JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
   WHERE m.content ~* '\\m(I|Sotera)\\M[^.]{0,20}\\m(said|told|explained|promised|asked|clarified|replied|answered)\\M'
   ORDER BY m.created_at`))

// ══ 6 · THE WIDER POPULATION — memories ABOUT the user, by writer × source-turn role ══════════════════
line('6 · memories ABOUT the user, by WRITER (derived) × source-turn role — the population the contradiction sits in')
console.table(await q(`
  SELECT CASE WHEN m.source IS NULL AND msg.role = 'assistant' THEN 'reflection:remember'
              WHEN m.source = 'model-tool' AND msg.role = 'assistant' THEN 'reflection:retain'
              WHEN m.source = 'model-tool' THEN 'chat/followthrough:model-tool'
              WHEN m.source LIKE 'conversation:%' THEN 'extractor'
              WHEN m.source LIKE 'reconcile:%' THEN 'reconcile (manual)'
              WHEN m.source LIKE 'doc:%' THEN 'doc ingest'
              ELSE coalesce(m.source, '(null, no source turn)') END AS writer,
         coalesce(msg.role, 'NULL') AS src_role, count(*)::int AS about_user_rows,
         count(*) FILTER (WHERE m.content ~* '(said|says|clarified|told|mentioned|explained|asked|confirmed|stated|shared|described|revealed|admitted|expressed|noted|replied|answered|wrote)')::int AS with_speech_verb
    FROM ${S}."txn_memories" m LEFT JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
   WHERE m.content ILIKE '%the user%' OR m.content ILIKE 'user''s %' OR m.content ILIKE 'dad''s %' OR m.content ILIKE 'ote''s %' OR m.content ILIKE 'ote %' OR m.content ILIKE '%dad (ote)%'
   GROUP BY 1,2 ORDER BY 1,2`))
console.log('every about-user row whose source is an ASSISTANT turn (id · writer · content) — the reflection population, for audit:')
for (const r of await q(`
  SELECT left(m.id::text,8) AS id, coalesce(m.source,'(null)') AS writer, left(m.content, 120) AS content
    FROM ${S}."txn_memories" m JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
   WHERE msg.role = 'assistant' AND (m.content ILIKE '%the user%' OR m.content ILIKE 'user''s %' OR m.content ILIKE 'dad''s %' OR m.content ILIKE 'ote''s %' OR m.content ILIKE 'ote %')
   ORDER BY m.created_at`)) console.log(`  ${r.id}  ${String(r.writer).padEnd(12)} ${JSON.stringify(r.content.replace(/\s+/g, ' '))}`)

// ══ 7 · IS THE ANCHOR EVER BEYOND WHAT SHE REVIEWED? ═════════════════════════════════════════════════
// `top` is the conversation's newest message; `up_to_rolling_id` is the last message the pass actually
// showed her (selectReviewableRange bounds the RANGE to the budget). They can differ on a long conversation.
line('7 · reflection-anchored memories vs the range their pass REVIEWED (log_conversation_revisits.up_to_rolling_id)')
console.table(await q(`
  SELECT left(m.id::text,8) AS id, coalesce(m.source,'(null)') AS writer, msg.rolling_id AS anchor_rid,
         rv.from_rolling_id AS from_rid, rv.up_to_rolling_id AS up_to_rid, rv.messages_considered AS considered,
         CASE WHEN msg.rolling_id = rv.up_to_rolling_id THEN 'anchor = last REVIEWED message'
              WHEN msg.rolling_id < rv.up_to_rolling_id THEN 'anchor inside range'
              ELSE '⚠️ anchor BEYOND what she reviewed' END AS relation
    FROM ${S}."txn_memories" m JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
    JOIN LATERAL (SELECT * FROM ${S}."log_conversation_revisits" r WHERE r.conversation_id = msg.conversation_id
                   AND r.created_at BETWEEN m.created_at - interval '15 minutes' AND m.created_at + interval '2 minutes'
                  ORDER BY abs(extract(epoch FROM (coalesce(r.completed_at, r.created_at) - m.created_at))) LIMIT 1) rv ON true
   WHERE msg.role = 'assistant' ORDER BY m.created_at`))
console.table(await q(`
  SELECT count(*)::int AS completed_passes,
         count(*) FILTER (WHERE r.up_to_rolling_id < (SELECT max(rolling_id) FROM ${S}."txn_messages" x WHERE x.conversation_id = r.conversation_id AND x.created_at <= coalesce(r.completed_at, r.created_at)))::int AS reviewed_short_of_newest,
         count(*) FILTER (WHERE r.wrote_memory_id IS NOT NULL)::int AS passes_that_wrote
    FROM ${S}."log_conversation_revisits" r WHERE r.outcome IS NOT NULL`))

await c.end()
console.log('\n⛔ READ-ONLY. Nothing was written.')
process.exit(0)
