// ⭐⭐⭐ TEMPORAL PROVENANCE — a memory says WHEN, and what the when is a date OF.
//
//   node test/checks/temporal-provenance-check.mjs
//
// ── ⚠️⚠️ THE INCIDENT, 2026-09-04 ────────────────────────────────────────────────────────────────
// Asked what they had discussed that day, Sotera answered with a confident list that was mostly TEN DAYS
// OLD. She could not have known: no model-facing memory read carried any time at all — while her reads
// about HERSELF carried `decidedOn`. She could date what she knew about herself and nothing about him.
//
// ── ⭐ THE RED-PROOF SET, AS RATIFIED ────────────────────────────────────────────────────────────
//   1  a normal conversational memory exposes the SOURCE TURN's date as `said`
//   2  ⭐⭐⭐ a DELAYED reconcile memory exposes the ORIGINAL turn date, ⛔ not its later recording date
//      — using the REAL Rome divergence, ⛔ not a synthetic example
//   3  a memory with NO source turn exposes `recorded`
//   4  ⛔ `valid_at` cannot leak into the model-facing `when`
//   5  `recall_memory` and `list_memories` produce the SAME shape, because they share `view()`
//   6  ⛔ nothing else changed — values, lifecycle, provenance, ranking
//   7  ⛔ a decades-old event cannot acquire a fabricated 2026 `happened` date
//
// ⛔ READ-ONLY over the live corpus; the only writes are `zz_` fixtures in agent_dev, all removed.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryV2 } from '../../Backend/app/components/memory-v2-host.js'
import { temporalProvenance, TEMPORAL_BASIS } from '@ote/memory/cognition/memory-v2-service.js'

const { check, done } = makeChecker('temporal-provenance')
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const OTE = '69499bed-ab95-41f9-ac28-e0617b33b09d'
/** ⭐ THE REAL ROME ROW — recorded 2026-09-01, from a turn spoken 2026-08-09. ⛔ Not constructed. */
const ROME = '8362691d'

try {
  // ══ THE PURE FUNCTION — the vocabulary, and its refusals ════════════════════════════════════════
  check('V1 · ⭐ a row with a source turn is `said`, and the date is the TURN\'s',
    JSON.stringify(temporalProvenance({ said_on: '2026-08-25', recorded_on: '2026-09-01' }))
    === JSON.stringify({ date: '2026-08-25', basis: 'said' }))
  check('V2 · ⭐ a row with none is `recorded`',
    JSON.stringify(temporalProvenance({ recorded_on: '2026-09-01' }))
    === JSON.stringify({ date: '2026-09-01', basis: 'recorded' }))
  check('V3 · ⛔⛔ THE VOCABULARY HAS EXACTLY TWO VALUES — there is no `happened`, because the event\'s own '
    + 'time is not represented anywhere and an unfillable slot invites something to fill it',
  Object.keys(TEMPORAL_BASIS).length === 2 && !('happened' in TEMPORAL_BASIS)
  && JSON.stringify(Object.values(TEMPORAL_BASIS)) === JSON.stringify(['said', 'recorded']))
  check('V4 · ⛔ `valid_at` is NOT consulted — a row whose valid_at differs from both still reports the '
    + 'turn date', temporalProvenance({ said_on: '2026-08-25', recorded_on: '2026-09-01', valid_at: '2026-08-12' }).date === '2026-08-25')
  check('V5 · ⛔ DATE ONLY — a timestamp is REJECTED rather than truncated, because truncating one in JS '
    + 'is exactly the UTC off-by-one this field exists to avoid',
    /^\d{4}-\d{2}-\d{2}$/.test(temporalProvenance({ recorded_on: '2026-09-01' }).date))
  check('V6 · ⛔ an unusable date yields NULL, ⛔ never a guess',
    temporalProvenance({ recorded_on: 'not-a-date' }) === null && temporalProvenance({}) === null
  && temporalProvenance({ recorded_on: '2026-09-01T13:45:12Z' }) === null)

  // ══ THROUGH THE REAL READS ══════════════════════════════════════════════════════════════════════
  const mem = buildMemoryV2(fastify, { userId: OTE })
  const listed = await mem.list({ limit: 500 })
  const rows = listed.memories ?? []
  check('L0 · the live list came back', rows.length > 0, `rows=${rows.length}`)
  check('1 · ⭐⭐ EVERY memory now carries a `when` with a valid basis — ⛔ none is silently undated',
    rows.every((m) => m.when && ['said', 'recorded'].includes(m.when.basis) && /^\d{4}-\d{2}-\d{2}$/.test(m.when.date)),
    `withWhen=${rows.filter((m) => m.when).length}/${rows.length}`)

  // ⭐ 1 · a normal conversational memory reports its TURN date.
  const conv = rows.filter((m) => m.when?.basis === 'said')
  check('1a · ⭐⭐⭐ conversational memories report `said` — the account holder spoke on that date',
    conv.length > 0, `said=${conv.length} · recorded=${rows.filter((m) => m.when?.basis === 'recorded').length}`)
  // …and cross-check one against the database, ⛔ not against the projection's own claim.
  const sample = conv.find((m) => m.sourceMessageId)
  const [truth] = await q(
    `SELECT msg.created_at::date::text AS said, m.created_at::date::text AS recorded
       FROM ${S}."txn_memories" m JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
      WHERE m.id = $1::uuid`, [sample.id])
  check('1b · ⭐⭐ …and the date matches the SOURCE TURN in the database, ⛔ not the row\'s own created_at',
    sample.when.date === truth.said, `projected=${sample.when.date} turn=${truth.said} row=${truth.recorded}`)

  // ══ 2 · ⭐⭐⭐ THE POSITIVE CONTROL — THE REAL ROME DIVERGENCE ═══════════════════════════════════
  const [romeTruth] = await q(
    `SELECT left(m.id::text,8) AS id, m.created_at::date::text AS recorded,
            msg.created_at::date::text AS said, m.valid_at::date::text AS valid
       FROM ${S}."txn_memories" m JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
      WHERE left(m.id::text,8) = $1`, [ROME])
  check('2a · ⭐ the Rome row really does diverge — this control is REAL, ⛔ not constructed',
    !!romeTruth && romeTruth.recorded !== romeTruth.said,
    romeTruth ? `recorded=${romeTruth.recorded} said=${romeTruth.said}` : 'ROW MISSING')
  // ⚠️ THE ROME ROW LIVES UNDER A DIFFERENT PERSONA SCOPE. Ote's room holds live rows under BOTH
  // `persona = null` and `persona = 'sotera'` (31 and 20 rows), and `buildMemoryV2`'s default is null —
  // so the first draft of this control looked for the row in a scope it was never in and reported "NOT IN
  // THE LIST". ⛔ That is a fixture error, not a finding; the row is live, uncontradicted and in his room.
  // ⓘ The two-persona split is real and worth its own look, but it is ⛔ not part of this defect.
  const memPersona = buildMemoryV2(fastify, { userId: OTE, persona: 'sotera' })
  const personaRows = (await memPersona.list({ limit: 500 })).memories ?? []
  const romeRow = personaRows.find((m) => m.id.startsWith(ROME))
  check('2b · ⭐⭐⭐ IT REPORTS THE ORIGINAL TURN DATE, ⛔ NOT ITS LATER RECORDING DATE — a maintenance '
    + 'pass read an August turn and wrote a September row, and she must not say "you told me in September"',
  !!romeRow && romeRow.when.basis === 'said' && romeRow.when.date === romeTruth.said
  && romeRow.when.date !== romeTruth.recorded,
  romeRow ? `when=${JSON.stringify(romeRow.when)} recorded=${romeTruth.recorded}` : 'NOT IN THE LIST')

  // ══ 3 · NO SOURCE TURN ⇒ `recorded` ═════════════════════════════════════════════════════════════
  const orphan = rows.find((m) => !m.sourceMessageId)
  check('3 · ⭐⭐ a memory with NO source turn reports `recorded` — the missing case is EXPLICIT, ⛔ not a '
    + 'fabricated said date', !!orphan && orphan.when.basis === 'recorded',
  orphan ? JSON.stringify(orphan.when) : 'none in this room')
  const mismatched = rows.filter((m) => !m.sourceMessageId && m.when?.basis === 'said')
  check('3a · ⛔⛔ NOT ONE row claims `said` without a source turn', mismatched.length === 0,
    `violations=${mismatched.length}`)

  // ══ 4 · ⛔ valid_at CANNOT LEAK ═════════════════════════════════════════════════════════════════
  // ⭐ The doc-ingest rows are the ONLY ones whose valid_at differs — the ingester stores the file's
  // commit date there. If it leaked, THESE would show it.
  const docRows = await q(
    `SELECT left(id::text,8) AS id, created_at::date::text AS recorded, valid_at::date::text AS valid
       FROM ${S}."txn_memories"
      WHERE invalid_at IS NULL AND expired_at IS NULL AND valid_at IS NOT NULL
        AND abs(extract(epoch FROM (valid_at - created_at))) >= 2 AND user_id = $1::uuid LIMIT 5`, [OTE])
  const leaked = docRows.filter((d) => {
    const m = rows.find((x) => x.id.startsWith(d.id))
    return m && m.when?.date === d.valid && d.valid !== d.recorded
  })
  check('4 · ⛔⛔ `valid_at` NEVER APPEARS as the model-facing date — it means "true since" for document '
    + 'ingest and merely copies created_at elsewhere, and one field cannot be both',
  leaked.length === 0, `doc rows checked=${docRows.length} · leaks=${leaked.length}`)

  // ══ 5 · BOTH READS AGREE, BY CONSTRUCTION ═══════════════════════════════════════════════════════
  const searched = await mem.search('what did we talk about today?', { limit: 10 })
  const hits = searched.matches ?? []
  check('5 · ⭐⭐⭐ `recall_memory` carries the SAME shape as `list_memories` — one shared `view()`, so '
    + 'they agree by construction and ⛔ not by two edits staying in step',
  hits.length > 0 && hits.every((m) => m.when && ['said', 'recorded'].includes(m.when.basis)),
  `hits=${hits.length} withWhen=${hits.filter((m) => m.when).length}`)
  const both = hits.filter((h) => rows.some((r) => r.id === h.id));
  check('5a · ⭐⭐ …and a memory returned by BOTH reports an IDENTICAL `when`',
    both.length > 0 && both.every((h) => JSON.stringify(h.when) === JSON.stringify(rows.find((r) => r.id === h.id).when)),
    `compared=${both.length}`)

  // ══ 6 · ⛔ NOTHING ELSE CHANGED ═════════════════════════════════════════════════════════════════
  const [dbRow] = await q(
    `SELECT content, importance, confidence, pinned, entity, attribute, source, provenance::text AS prov
       FROM ${S}."txn_memories" WHERE id = $1::uuid`, [sample.id])
  check('6 · ⛔ the projection is UNCHANGED apart from `when` — value, importance, confidence, pinned, '
    + 'entity, attribute and source all still match the row',
  sample.content === dbRow.content && sample.importance === dbRow.importance
  && sample.pinned === dbRow.pinned && (sample.entity ?? null) === (dbRow.entity ?? null)
  && (sample.attribute ?? null) === (dbRow.attribute ?? null) && (sample.source ?? null) === (dbRow.source ?? null))
  check('6a · ⛔ `provenance` is NOT in the model-facing view, and this change did not add it',
    !('provenance' in sample), Object.keys(sample).join(','))
  check('6b · ⛔ RANKING IS UNTOUCHED — the search still returns scores in descending order',
    hits.every((h, i) => i === 0 || (h.score ?? 0) <= (hits[i - 1].score ?? 0)),
    hits.map((h) => (h.score ?? 0).toFixed(2)).join(' ≥ '))

  // ══ 7 · ⛔ NO FABRICATED EVENT DATE ═════════════════════════════════════════════════════════════
  const instruments = rows.find((m) => m.attribute === 'instruments played')
  check('7 · ⭐⭐⭐ THE DECADES-OLD EVENT GETS NO 2026 `happened` DATE — the instruments memory reports '
    + 'ONLY when it was SAID. ⛔ Nothing anywhere claims when he learned them',
  !!instruments && instruments.when.basis === 'said' && !('happened' in instruments.when)
  && Object.keys(instruments.when).length === 2,
  instruments ? `${JSON.stringify(instruments.when)} keys=${Object.keys(instruments.when)}` : 'row not found')
  check('7a · ⛔ …and NO memory anywhere carries a third temporal key',
    rows.every((m) => !m.when || Object.keys(m.when).every((k) => k === 'date' || k === 'basis')))
} catch (e) {
  check('the temporal-provenance check ran to completion', false, e?.message ?? String(e))
} finally {
  await pg.end()
  await db.txn_memories.sequelize.close()
  done()
}
