// ⭐⭐⭐ THE REMEDIATION, PROVED — the retired rows are gone from recall and still reconstructable.
//
//   node test/checks/cogito-remediation-check.mjs
//
// Ote approved retiring two `preferred_name = "Cogito"` rows on 2026-09-04 and asked for exactly this:
// *"red-proof that invalidation removes both from every normal population/read path, while leaving the
// historical row/source conversation reconstructable. The 143-access row is particularly important:
// verify it no longer surfaces after invalidation."*
//
// ⛔ READ-ONLY. This check writes NOTHING — it re-runs the read that produced the incident and looks.
// ⓘ It reads in Ote's room deliberately: the question is whether HIS recall is clean, and no other room
// can answer that. ⛔ No write is performed there, and no content is printed beyond the value at issue.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryV2 } from '../../Backend/app/components/memory-v2-host.js'

const { check, done } = makeChecker('cogito-remediation')
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows

const IDS = ['49111883-8a5c-4442-93ae-dbf2cf7c3391', 'f410bbfd-edcd-4a8c-9232-1c0b40c3fa4a']
const OTE = '69499bed-ab95-41f9-ac28-e0617b33b09d'
const TURNS = ['ed747c97-7b91-4e43-8591-5eb598034d03', 'e5012b4d-9c9f-4912-bb46-8c92518d5cd8']

try {
  // ══ 1 · RETIRED, ⛔ NOT DELETED ═════════════════════════════════════════════════════════════════
  const rows = await q(
    `SELECT id::text, value, attribute, namespace, provenance::text AS prov, importance, access_count,
            (invalid_at IS NOT NULL) AS retired, source_message_id::text AS src, subject_person_id::text AS subj
       FROM ${S}."txn_memories" WHERE id = ANY($1::uuid[]) ORDER BY created_at`, [IDS])
  check('1 · ⭐⭐ BOTH ROWS STILL EXIST — ⛔ invalidation is not deletion', rows.length === 2, `found=${rows.length}`)
  check('1a · ⭐ …and both are RETIRED', rows.every((r) => r.retired), rows.map((r) => r.retired).join(' · '))
  check('1b · ⭐⭐⭐ …and EVERY FIELD OF THE EVIDENCE SURVIVES — value, provenance, importance, the source '
    + 'turn and the subject. ⛔ Nothing about what happened was rewritten',
  rows.every((r) => r.value === 'Cogito' && r.prov === 'quoted' && r.importance === 9 && !!r.src && !!r.subj),
  rows.map((r) => `${r.value}/${r.prov}/imp${r.importance}/src=${r.src.slice(0, 8)}`).join(' · '))

  // ══ 2 · GONE FROM EVERY MODEL-FACING READ ═══════════════════════════════════════════════════════
  const mem = buildMemoryV2(fastify, { userId: OTE })
  // ⭐⭐⭐ THE EXACT QUERY SHE RAN on 2026-09-04, verbatim — the one that ranked "Cogito" SECOND.
  const recall = await mem.search('what did we talk about today?', { limit: 10 })
  const inRecall = (recall.matches ?? []).filter((m) => IDS.includes(m.id))
  check('2 · ⭐⭐⭐ THE EXACT RECALL THAT PRODUCED THE INCIDENT NO LONGER SURFACES EITHER ROW — it ranked '
    + '#2 before', inRecall.length === 0,
  `matches=${recall.matches?.length ?? 0} · retired rows returned=${inRecall.length}`)
  // ⭐⭐ AND THE DISTINCTION THAT MATTERS: a LEGITIMATE mention of Cogito must survive. He really is in her
  // relational map, told to her as a story. ⛔ Retiring a false claim about OTE'S NAME must not erase who
  // Cogito is — an earlier draft of this assertion matched any text containing "Cogito" and would have
  // called that correct row a failure.
  const legit = (recall.matches ?? []).filter((m) => String(m.content ?? '').includes('Cogito'))
  check('2-legit · ⭐⭐⭐ …while a TRUE memory that mentions Cogito is UNTOUCHED — the remediation removed '
    + 'a false claim about his NAME, ⛔ not the fact that Cogito exists',
  legit.length > 0 && legit.every((m) => !IDS.includes(m.id)),
  `legitimate mentions still recalled: ${legit.length} · ${legit.map((m) => String(m.attribute ?? m.kind)).join(',')}`)
  const listed = await mem.list({ limit: 500 })
  const inList = (listed.memories ?? []).filter((m) => IDS.includes(m.id))
  check('2a · ⭐⭐ …and `list_memories` does not return them either', inList.length === 0,
    `listed=${listed.memories?.length ?? listed.count ?? '?'} · ours=${inList.length}`)
  const byName = await mem.search('preferred name', { limit: 20 })
  const inName = (byName.matches ?? []).filter((m) => IDS.includes(m.id))
  check('2b · ⭐ …nor a search aimed straight at the attribute', inName.length === 0, `ours=${inName.length}`)
  // ⭐ THE POSITIVE CONTROL — the reader is not simply blind.
  check('2c · ⭐⭐⭐ CONTROL — recall still returns OTHER memories, so "not found" means RETIRED and ⛔ not '
    + '"the reader stopped working"', (recall.matches?.length ?? 0) > 0, `${recall.matches?.length} matches`)

  // ══ 3 · THE AUDIT ═══════════════════════════════════════════════════════════════════════════════
  const audit = await q(
    `SELECT memory_id::text, action, actor, reason, (before IS NOT NULL) AS has_before
       FROM ${S}."log_memory_changes" WHERE memory_id = ANY($1::uuid[]) ORDER BY created_at`, [IDS])
  // ⓘ 049: LATER audited acts may add rows of OTHER actions to the same memories (the provenance-axes backfill did —
  //    `axes-backfill`, M7). The retirement's invariant is about the `forget` rows: exactly one each, never zero, never two.
  const forgets = audit.filter((a) => a.action === 'forget')
  check('3 · ⭐⭐ EXACTLY ONE `forget` audit row per memory — ⛔ not zero, ⛔ not two', forgets.length === 2,
    `forget rows=${forgets.length} · all rows=${audit.length} (${[...new Set(audit.map((a) => a.action))].join(', ')})`)
  check('3a · ⭐ action `forget`, a real operator, and a precise reason',
    forgets.every((a) => a.actor === 'ote-operator' && /relayed speech/i.test(a.reason ?? '')),
    forgets.map((a) => `${a.action}/${a.actor}`).join(' · '))
  check('3b · ⭐⭐⭐ …and each carries the COMPLETE `before` snapshot, so the retired belief is readable '
    + 'from the audit alone', audit.every((a) => a.has_before), audit.map((a) => a.has_before).join(' · '))

  // ══ 4 · THE INCIDENT IS STILL RECONSTRUCTABLE ═══════════════════════════════════════════════════
  const turns = await q(
    `SELECT id::text, length(content) AS len FROM ${S}."txn_messages" WHERE id = ANY($1::uuid[])`, [TURNS])
  const [conv] = await q(
    `SELECT count(*)::int AS n FROM ${S}."txn_conversations" WHERE id = '7198c1b0-2674-46c3-9e43-ba5e505443f3'`)
  check('4 · ⭐⭐⭐ BOTH SOURCE TURNS AND THE ORIGIN CONVERSATION ARE INTACT — the incident can be '
    + 'reconstructed end to end from the corpus after the fix',
  turns.length === 2 && conv.n === 1 && turns.every((t) => t.len > 1000),
  `turns=${turns.length} lengths=${turns.map((t) => t.len).join('/')} conversation=${conv.n}`)

  // ══ 5 · OTE'S ROOM NOW HAS NO preferred_name AT ALL — stated, ⛔ not hidden ══════════════════════
  const [remaining] = await q(
    `SELECT count(*)::int AS n FROM ${S}."txn_memories"
      WHERE user_id = $1::uuid AND attribute = 'preferred_name'
        AND invalid_at IS NULL AND expired_at IS NULL`, [OTE])
  check('5 · ⓘ his room now holds NO live `preferred_name` — ⭐ correct, and deliberately not filled in '
    + 'with a guess. His account `display_name` is unaffected and remains the name the system uses',
  remaining.n === 0, `live preferred_name rows in his room = ${remaining.n}`)
} catch (e) {
  check('the remediation check ran to completion', false, e?.message ?? String(e))
} finally {
  await pg.end()
  await db.txn_memories.sequelize.close()
  done()
}
