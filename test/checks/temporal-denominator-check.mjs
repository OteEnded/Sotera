// ⭐⭐⭐ THE DENOMINATOR — a dated memory read returns three populations, never two (② R-C, 2026-09-05).
//
//   node test/checks/temporal-denominator-check.mjs
//
// ── THE INVARIANT ────────────────────────────────────────────────────────────────────────────────────
//   matched + unmatched + undated === returned, mutually exclusive, exhaustive — over the RETURNED rows.
//   `undated` = the requested basis CANNOT BE ESTABLISHED — ⛔ not "did not match".
//   ⛔ `recorded` is never reinterpreted as `said`.
//   ⛔ the RANKED read did not learn to see dates: search() is byte-identical to the pre-change snapshot.
//   ⛔ recall_memory's schema is exactly { query, limit }.
//
// ── THE ORACLE IS THE DATABASE, NOT THE PROJECTION ───────────────────────────────────────────────────
// Every label is re-derived per row from `source_message_id` and the source turn's own date, in SQL. A
// check that compared the projection's `when` to the projection's `window` would be comparing a thing
// to itself. (memory: could-not-establish-is-not-established — the missing coverage mechanism.)
//
// ⛔ READ-ONLY over Ote's live rows; nothing is written.
import { readFileSync } from 'node:fs'
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryV2 } from '../../Backend/app/components/memory-v2-host.js'
import { components } from '@ote/memory'
import { PROBES, OTE, SNAPSHOT, probeSearch } from '../maintenance/snapshot-search-probes.mjs'

const { check, done } = makeChecker('temporal-denominator')
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const TZ = 'Asia/Bangkok'
const sum = (w) => w.matched + w.unmatched + w.undated

try {
  const mem = buildMemoryV2(fastify, { userId: OTE })
  const plain = await mem.list({})
  check('D0 · the live enumeration returns rows (⛔ 0 would make everything below vacuous)', plain.memories.length > 0, `rows=${plain.memories.length}`)

  // ── the oracle: each returned id → its source turn's date (or NULL when there is none) ──────────────
  const ids = plain.memories.map((m) => m.id)
  // 049 · THE ORACLE IS PROVENANCE: said_on = the ONE day of established account-holder turn references; no_source now
  // means "no such reference" — exactly what the undated population must be. The occasion pointer is not consulted.
  const oracle = new Map((await q(`
    SELECT m.id::text AS id,
           (SELECT CASE WHEN count(DISTINCT (msg.created_at AT TIME ZONE '${TZ}')::date) = 1
                        THEN min((msg.created_at AT TIME ZONE '${TZ}')::date)::text ELSE NULL END
              FROM ${S}."txn_memory_evidence" e JOIN ${S}."txn_messages" msg ON msg.id::text = e.target AND msg.role = 'user'
             WHERE e.memory_id = m.id AND e.ref_kind = 'turn' AND e.established) AS said_on,
           NOT EXISTS (SELECT 1 FROM ${S}."txn_memory_evidence" e JOIN ${S}."txn_messages" msg ON msg.id::text = e.target AND msg.role = 'user'
                        WHERE e.memory_id = m.id AND e.ref_kind = 'turn' AND e.established) AS no_source
      FROM ${S}."txn_memories" m WHERE m.id = ANY($1::uuid[])`, [ids])).map((r) => [r.id, r]))
  check('D0b · the oracle covers every returned row', ids.every((id) => oracle.has(id)))
  const undatedTruth = ids.filter((id) => oracle.get(id).no_source).length
  check('D0c · ⭐ some returned rows have NO established account-holder turn reference — the undated population is REAL on this corpus, not hypothetical', undatedTruth > 0, `no_source=${undatedTruth} of ${ids.length}`)

  // ══ D1 · exhaustive and exclusive, for several windows ═══════════════════════════════════════════════
  const windows = [{ on: '2026-09-04' }, { on: '2026-09-01' }, { on: '1847-01-01' }, { between: ['2026-08-01', '2026-09-30'] }, { on: '2026-09-04', basis: 'recorded' }]
  for (const w of windows) {
    const out = await mem.list({ window: w })
    const ok = out.window && sum(out.window) === out.window.returned && out.window.returned === out.memories.length
      && out.memories.every((m) => ['matched', 'unmatched', 'undated'].includes(m.window))
      && ['matched', 'unmatched', 'undated'].every((l) => out.memories.filter((m) => m.window === l).length === out.window[l])
    check(`D1 · ${JSON.stringify(w)} → matched+unmatched+undated === returned === rows, and the per-item labels agree with the counts`, ok, JSON.stringify(out.window))
  }

  // ══ D2 · positive controls against the ORACLE ════════════════════════════════════════════════════════
  const on0904 = await mem.list({ window: { on: '2026-09-04' } })
  const truth0904 = ids.filter((id) => oracle.get(id).said_on === '2026-09-04').length
  check('D2a · ⭐ said = 2026-09-04 → matched equals the oracle count over the returned ids', on0904.window.matched === truth0904 && truth0904 > 0, `matched=${on0904.window.matched} oracle=${truth0904}`)
  const on0901 = await mem.list({ window: { on: '2026-09-01' } })
  const truth0901 = ids.filter((id) => oracle.get(id).said_on === '2026-09-01').length
  check('D2b · ⭐⭐⭐ THE INCIDENT SHAPE IS REPORTABLE: a day with turns and no memories (2026-09-01) → returned > 0, matched = 0, undated VISIBLE', on0901.window.returned > 0 && on0901.window.matched === truth0901 && truth0901 === 0 && on0901.window.undated === undatedTruth, JSON.stringify(on0901.window))
  const on1847 = await mem.list({ window: { on: '1847-01-01' } })
  check('D2c · an impossible date → matched = 0 (⛔ recall_memory returned eight for this)', on1847.window.matched === 0 && on1847.window.returned === ids.length, JSON.stringify(on1847.window))

  // ══ D3 · ⭐⭐⭐ PER ROW: undated ⇔ no established account-holder turn reference on one day; never unmatched ═════════════════════════════════════
  let perRowOk = true
  const bad = []
  for (const m of on0904.memories) {
    const o = oracle.get(m.id)
    const expect = (o.no_source || o.said_on == null) ? 'undated' : (o.said_on === '2026-09-04' ? 'matched' : 'unmatched')
    if (m.window !== expect) { perRowOk = false; bad.push([m.id.slice(0, 8), m.window, expect]) }
  }
  check('D3a · ⭐⭐⭐ EVERY row\'s label is re-derived from the database and agrees — undated ⇔ no established account-holder turn reference on one day, ⛔ never unmatched', perRowOk, bad.length ? JSON.stringify(bad.slice(0, 5)) : `rows=${on0904.memories.length}`)
  check('D3b · the undated count equals the number of returned rows with no established single-day account-holder turn reference, exactly', on0904.window.undated === undatedTruth, `undated=${on0904.window.undated} truth=${undatedTruth}`)
  check('D3c · ⛔ no undated row has its `when.basis` = said (the label and ① agree: nothing established a said date)', on0904.memories.filter((m) => m.window === 'undated').every((m) => m.when?.basis !== 'said'))

  // ══ D4 · `when` is untouched by the window ═══════════════════════════════════════════════════════════
  const whenPlain = new Map(plain.memories.map((m) => [m.id, JSON.stringify(m.when)]))
  check('D4 · `when` on every item is byte-identical with and without a window; ids and ORDER are identical too', on0904.memories.every((m) => whenPlain.get(m.id) === JSON.stringify(m.when)) && JSON.stringify(on0904.memories.map((m) => m.id)) === JSON.stringify(ids))
  check('D4b · without a window the result has NO `window` key and NO per-item label — byte-identical to before', !('window' in plain) && plain.memories.every((m) => !('window' in m)))

  // ══ D5 · ⛔ THE RANKED READ DID NOT LEARN TO SEE DATES ══════════════════════════════════════════════════
  const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
  check('D5 · a PRE-CHANGE snapshot of the seven probes exists (taken before R-C touched the memory layer)', snap?.probes && Object.keys(snap.probes).length === PROBES.length, snap?.takenAt)
  const now = await probeSearch(mem)
  const drift = PROBES.filter((p) => JSON.stringify(now[p].map((x) => x.id)) !== JSON.stringify(snap.probes[p].map((x) => x.id)))
  check('D5a · ⭐⭐⭐ search() returns the SAME ids in the SAME order as before, for all seven probes — ranking untouched', drift.length === 0, drift.length ? `drifted: ${drift.join(' | ')}` : 'identical')
  // ⚠️ `score` MOVES WITH THE CLOCK BY DESIGN — its recency term is 0.995^hours since last_access — so the first
  // version of this check, which compared scores, went red on all 56 ids by ≤ 4e-4 while relevance was identical
  // to 6 places. RELEVANCE is the term a date-aware read would change; it is pinned hard. Score drift is reported.
  const relDrift = PROBES.filter((p) => JSON.stringify(now[p].map((x) => x.relevance)) !== JSON.stringify(snap.probes[p].map((x) => x.relevance)))
  let maxScoreDelta = 0
  for (const p of PROBES) for (let i = 0; i < now[p].length; i++) maxScoreDelta = Math.max(maxScoreDelta, Math.abs(Number(now[p][i].score) - Number(snap.probes[p][i].score)))
  check('D5b · …and the same RELEVANCE to 6 places on every ranked id — the similarity did not change', relDrift.length === 0, relDrift.length ? `relevance drifted: ${relDrift.join(' | ')}` : `identical · score drift (recency decay, expected) max |Δ| ${maxScoreDelta.toExponential(2)}`)
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
  check('D5c · P1 "…today?" vs C1 "…?" is STILL the identical set — "today" is still a topic word', same(now[PROBES[0]].map((x) => x.id), now[PROBES[5]].map((x) => x.id)))

  // ══ D6 · the tool boundary ═══════════════════════════════════════════════════════════════════════════
  const tool = (n) => components.find((c) => c?.manifest?.name === n)
  check('D6 · ⛔ recall_memory.parameters.properties is EXACTLY [query, limit]', JSON.stringify(Object.keys(tool('recall_memory').parameters.properties)) === '["query","limit"]')
  const lm = tool('list_memories').parameters
  check('D6b · list_memories gained on / between / basis, basis is a closed enum of the two bases', ['on', 'between', 'basis'].every((k) => k in lm.properties) && JSON.stringify(lm.properties.basis.enum) === '["said","recorded"]' && lm.additionalProperties === false)
  check('D6c · ⛔ no other memory tool gained a temporal parameter', components.filter((c) => c?.parameters && c.manifest?.name !== 'list_memories').every((c) => !Object.keys(c.parameters.properties ?? {}).some((k) => /^(on|between|basis|date|since|until)$/.test(k))))
  // through the HANDLER — the model-facing result carries the counts AND the words
  const ctx = { services: { 'memory.v2': mem }, getService: (n) => (n === 'memory.v2' ? mem : null), requireService: (n) => (n === 'memory.v2' ? mem : null) }
  let viaTool = null
  try { viaTool = await tool('list_memories').execute({ on: '2026-09-04' }, ctx) } catch (e) { viaTool = { error: e.message } }
  check('D6d · ⭐ through the tool: the result carries `window` counts and a `note` that says undated is not a non-match', !!viaTool?.window && typeof viaTool.note === 'string' && /UNDATED IS NOT A NON-MATCH/.test(viaTool.note) && sum(viaTool.window) === viaTool.window.returned, viaTool?.error ?? viaTool?.note?.slice(0, 120))
  let plainViaTool = null
  try { plainViaTool = await tool('list_memories').execute({}, ctx) } catch (e) { plainViaTool = { error: e.message } }
  check('D6e · through the tool with no date: no `window`, no `note` — the old shape exactly', plainViaTool && !('window' in plainViaTool) && !('note' in plainViaTool) && Array.isArray(plainViaTool.memories), plainViaTool?.error)

  // ══ D7 · the basis is explicit ══════════════════════════════════════════════════════════════════════
  const rec0904 = await mem.list({ window: { on: '2026-09-04', basis: 'recorded' } })
  check('D7a · under basis RECORDED, no row is undated — every row has a recording day (① recorded_on)', rec0904.window.undated === 0, JSON.stringify(rec0904.window))
  const noSrc = on0904.memories.filter((m) => m.window === 'undated').map((m) => m.id)
  const recLabels = new Map(rec0904.memories.map((m) => [m.id, m.window]))
  check('D7b · ⭐⭐ the rows undated under SAID are DATED under RECORDED — same rows, different question, different answer', noSrc.length > 0 && noSrc.every((id) => ['matched', 'unmatched'].includes(recLabels.get(id))))
  const recTruth = new Map((await q(`SELECT id::text AS id, (created_at AT TIME ZONE '${TZ}')::date::text AS d FROM ${S}."txn_memories" WHERE id = ANY($1::uuid[])`, [ids])).map((r) => [r.id, r.d]))
  check('D7c · under RECORDED every label agrees with the row\'s own created_at in the deployment zone (oracle)', rec0904.memories.every((m) => m.window === (recTruth.get(m.id) === '2026-09-04' ? 'matched' : 'unmatched')))
  let threw = null
  try { await mem.list({ window: { on: 'today' } }) } catch (e) { threw = e.message }
  check('D7d · a malformed window THROWS (⛔ never degrades to "no window")', /YYYY-MM-DD/.test(threw ?? ''), threw)
  threw = null
  try { await mem.list({ window: { on: '2026-09-04', basis: 'happened' } }) } catch (e) { threw = e.message }
  check('D7e · ⛔ basis "happened" is refused — there is no such clock', /basis must be one of: said, recorded/.test(threw ?? ''), threw)
} finally {
  await pg.end()
}
done()
