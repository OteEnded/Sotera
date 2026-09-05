// ⭐⭐ THE REFLECTION ANCHOR — reachability vs provenance, evidence identity, the beyond-review rows, and the
// temporal consequence. ⛔ READ-ONLY. Writes nothing. Decides nothing.
//
//   node test/maintenance/measure-reflection-anchor.mjs
//
// Ote, 2026-09-05 — four questions, measured before any semantics are derived:
//   A  are reachability and proposition provenance genuinely two concepts here?
//   B  what identifiers does reflection have when it retains an item?
//   C  the three rows anchored BEYOND the reviewed range — what guarantee did the anchor promise?
//   D  has anchor-day ≠ proposition-day actually produced a wrong `said` date in the corpus?
import { devPg, devSchema } from '../harness.mjs'

const S = `"${devSchema()}"`
const c = devPg(); await c.connect()
const q = async (s, p = []) => (await c.query(s, p)).rows
const line = (t) => console.log(`\n${'═'.repeat(110)}\n${t}\n${'═'.repeat(110)}`)
const TZ = 'Asia/Bangkok'
const GETSOURCE_DEFAULT_CONTEXT = 2 // recall_memory_source: "Surrounding messages to include each side of the source (default 2)"

// ══ THE 13 REFLECTION-ANCHORED ROWS, with their pass ═════════════════════════════════════════════════
const rows = await q(`
  SELECT m.id::text AS id, left(m.id::text,8) AS short, coalesce(m.source,'(null)') AS writer, m.content,
         msg.conversation_id, msg.rolling_id AS anchor_rid, (msg.created_at AT TIME ZONE '${TZ}')::date::text AS anchor_day,
         to_char(m.created_at AT TIME ZONE '${TZ}','MM-DD HH24:MI') AS written,
         rv.from_rolling_id AS from_rid, rv.up_to_rolling_id AS up_to_rid, rv.messages_considered AS considered, rv.wrote_memory_id::text AS ledger_memory
    FROM ${S}."txn_memories" m JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
    LEFT JOIN LATERAL (SELECT * FROM ${S}."log_conversation_revisits" r WHERE r.conversation_id = msg.conversation_id
                        AND r.created_at BETWEEN m.created_at - interval '15 minutes' AND m.created_at + interval '2 minutes'
                       ORDER BY abs(extract(epoch FROM (coalesce(r.completed_at, r.created_at) - m.created_at))) LIMIT 1) rv ON true
   WHERE msg.role = 'assistant' ORDER BY m.created_at`)

// keyword extraction: distinctive words from the memory's own text, used to LOCATE the proposition turn(s)
const STOP = new Set('the user their they them this that with from about have has had which while when where what been being were was into over under after before because through during their there these those also just very more most some such than then only into onto upon like will would could should might must shall does doing done make makes made take takes taken give gives given time times day days work works working thing things something someone people person often always never sometimes recently currently'.split(' '))
const keywords = (t) => [...new Set(String(t).toLowerCase().replace(/[^\p{L}\p{N}' -]/gu, ' ').split(/\s+/)
  .filter((w) => w.length >= 6 && !STOP.has(w) && !/^\d+$/.test(w)))].slice(0, 12)

line('A/D · for each reflection row: WHERE is its proposition in the conversation, relative to the anchor?')
const results = []
for (const r of rows) {
  const kws = keywords(r.content)
  // every turn in the conversation that carries ≥2 of the memory's distinctive words (or ≥1 for short texts)
  const hits = await q(`
    SELECT rolling_id, role, (created_at AT TIME ZONE '${TZ}')::date::text AS day,
           (SELECT count(*) FROM unnest($2::text[]) k WHERE content ILIKE '%' || k || '%')::int AS kw_hits
      FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid
     ORDER BY rolling_id`, [r.conversation_id, kws])
  const need = kws.length >= 4 ? 2 : 1
  const user = hits.filter((h) => h.role === 'user' && h.kw_hits >= need)
  const best = user.length ? user.reduce((a, b) => (b.kw_hits > a.kw_hits ? b : a)) : null
  const earliest = user[0] ?? null
  const inReviewed = (rid) => (r.up_to_rid == null ? null : (r.from_rid == null || rid >= r.from_rid) && rid <= r.up_to_rid)
  const rec = {
    id: r.short, writer: r.writer, written: r.written,
    anchor_rid: r.anchor_rid, anchor_day: r.anchor_day,
    reviewed: r.up_to_rid == null ? 'no pass row' : `${r.from_rid ?? '…'}..${r.up_to_rid} (${r.considered})`,
    anchor_in_reviewed: inReviewed(r.anchor_rid),
    prop_rid: best?.rolling_id ?? null, prop_day: best?.day ?? null, prop_kw_hits: best?.kw_hits ?? 0,
    earliest_user_hit_rid: earliest?.rolling_id ?? null, user_turns_matching: user.length,
    prop_in_reviewed: best ? inReviewed(best.rolling_id) : null,
    distance_turns: best ? r.anchor_rid - best.rolling_id : null,
    within_getSource_ctx: best ? Math.abs(r.anchor_rid - best.rolling_id) <= GETSOURCE_DEFAULT_CONTEXT : null,
    day_diverges: best ? best.day !== r.anchor_day : null,
    kws: kws.slice(0, 6).join(','),
  }
  results.push(rec)
}
console.table(results.map(({ kws, ...x }) => x))
console.log('keywords used per row (so the location can be audited):')
for (const x of results) console.log(`  ${x.id}  [${x.kws}]`)

line('D · does any reflection row EXPLICITLY refer to a day/time other than the anchor? (regex on content)')
console.table(await q(`
  SELECT left(m.id::text,8) AS id,
         substring(m.content from '(?i)(yesterday|last (?:night|week|month)|earlier (?:today|this week)|the other day|(?:on )?(?:january|february|march|april|may|june|july|august|september|october|november|december) \\d{1,2}|\\d{4}-\\d{2}-\\d{2}|\\d+ (?:days|weeks) ago|dating back to [a-z]+ \\d+|since [a-z]+ \\d+)') AS temporal_phrase,
         left(m.content, 110) AS content
    FROM ${S}."txn_memories" m JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
   WHERE msg.role = 'assistant'
     AND m.content ~* '(yesterday|last (night|week|month)|earlier (today|this week)|the other day|(january|february|march|april|may|june|july|august|september|october|november|december) \\d{1,2}|\\d{4}-\\d{2}-\\d{2}|\\d+ (days|weeks) ago|dating back to|since [a-z]+ \\d+)'`))

line('C · the pass that wrote c5567db5 / c35fbb5a / 9d71b989, its neighbours on the same conversation, and the ledger')
const [cv] = await q(`SELECT msg.conversation_id FROM ${S}."txn_memories" m JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id WHERE m.id::text LIKE 'c5567db5%'`)
console.table(await q(`
  SELECT to_char(r.created_at AT TIME ZONE '${TZ}','MM-DD HH24:MI') AS at, r.from_rolling_id AS from_rid, r.up_to_rolling_id AS up_to_rid,
         r.messages_considered AS considered, r.outcome, left(r.wrote_memory_id::text,8) AS wrote,
         (SELECT max(rolling_id) FROM ${S}."txn_messages" x WHERE x.conversation_id = r.conversation_id AND x.created_at <= coalesce(r.completed_at, r.created_at)) AS newest_at_completion,
         (SELECT count(*) FROM ${S}."txn_memories" mm JOIN ${S}."txn_messages" ms ON ms.id = mm.source_message_id
           WHERE ms.conversation_id = r.conversation_id AND mm.created_at BETWEEN r.created_at - interval '1 minute' AND coalesce(r.completed_at, r.created_at) + interval '2 minutes')::int AS memories_written_in_window
    FROM ${S}."log_conversation_revisits" r WHERE r.conversation_id = $1::uuid ORDER BY r.created_at`, [cv.conversation_id]))
console.log('message 6539 (the anchor) and 6450 (last reviewed): who spoke, when:')
console.table(await q(`SELECT rolling_id, role, to_char(created_at AT TIME ZONE '${TZ}','MM-DD HH24:MI:SS') AS at, length(content) AS chars
  FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid AND rolling_id IN (6450, 6451, 6539) ORDER BY rolling_id`, [cv.conversation_id]))
console.log('the three rows\' content (to judge whether the propositions sit INSIDE the reviewed range):')
for (const r of await q(`SELECT left(id::text,8) AS id, content FROM ${S}."txn_memories" WHERE id::text LIKE 'c5567db5%' OR id::text LIKE 'c35fbb5a%' OR id::text LIKE '9d71b989%'`)) console.log(`  ${r.id}  ${JSON.stringify(r.content.replace(/\s+/g, ' ').slice(0, 240))}`)

line('A/C/D · EXACT-PHRASE LOCATION of each proposition (hand-chosen phrases, so the keyword pass above can be audited)')
// ⓘ Phrases are the row's OWN words or its verbatim quote of the user. A row with no distinctive phrase is listed as such.
const PHRASES = [
  ['c5567db5', 'as your dad'], ['c35fbb5a', 'shibayan'], ['9d71b989', 'while i building you'], ['294f8f26', 'north star'],
  ['67ed5588', 'thank'], ['0966ab33', 'yapping'], ['7fb034c5', 'hermes'], ['03851bb8', 'koneko'], ['2447b3d3', 'durable'],
  // ⚠️ phrases are the USER's words where a user turn exists: he wrote ระนาด (not "ranaad"), "wilds" (the game), "wake up"
  ['cdd724a7', 'ระนาด'], ['302c731c', 'wilds'], ['470dff58', 'wake up'], ['069da304', null],
]
for (const [short, phrase] of PHRASES) {
  const r = rows.find((x) => x.short === short)
  if (!r) { console.log(`  ${short}  (row not found)`); continue }
  if (!phrase) { console.log(`  ${short}  anchor ${r.anchor_rid} (${r.anchor_day})  — no distinctive phrase; conversation is single-day`); continue }
  const hits = await q(`SELECT rolling_id, role, (created_at AT TIME ZONE '${TZ}')::date::text AS day
    FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid AND content ILIKE '%' || $2 || '%' ORDER BY rolling_id`, [r.conversation_id, phrase])
  const firstUser = hits.find((h) => h.role === 'user') ?? hits[0] ?? null
  const inRange = firstUser ? ((r.from_rid == null || firstUser.rolling_id >= r.from_rid) && (r.up_to_rid == null || firstUser.rolling_id <= r.up_to_rid)) : null
  console.log(`  ${short}  anchor ${r.anchor_rid} (${r.anchor_day})  "${phrase}" → first hit rid ${firstUser?.rolling_id ?? '—'} ${firstUser?.role ?? ''} ${firstUser?.day ?? ''}`
    + `  distance=${firstUser ? r.anchor_rid - firstUser.rolling_id : '—'}  in-reviewed=${inRange}  sameDay=${firstUser ? firstUser.day === r.anchor_day : '—'}  (${hits.length} hits)`)
}

line('B · what the model could have named: does ANY retained item\'s content contain a message id or rolling id?')
console.table(await q(`
  SELECT count(*)::int AS reflection_rows,
         count(*) FILTER (WHERE m.content ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}')::int AS content_has_uuid,
         count(*) FILTER (WHERE m.content ~ '\\m[0-9]{4,5}\\M' AND m.content !~ '\\m(19|20)[0-9]{2}\\M')::int AS content_has_4_5_digit_number_not_a_year
    FROM ${S}."txn_memories" m JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id WHERE msg.role = 'assistant'`))

await c.end()
console.log('\n⛔ READ-ONLY. Nothing was written.')
process.exit(0)
