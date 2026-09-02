// ⭐⭐⭐ A FAILED COMMIT MUST NEVER BE REPRESENTED AS A SUCCESSFUL OBSERVATION — proved LIVE.
//
//   node test/checks/write-lane-composition-check.mjs
//
// ── WHY THIS CHECK EXISTS AND THE UNIT SUITE WAS NOT ENOUGH ─────────────────────────────────────
// The serial write lane and the observation pipeline are each correct alone. The defect lived in the
// JOIN, and only in ONE of the two orders they compose in:
//
//   enqueue(ingest(…))   the model-tool path  → ingest RESOLVES {ok:false, code} → the failure survived
//   ingest(enqueue(…))   the automatic path   → the lane RESOLVED with null, the pipeline read
//                                               `null?.ok !== false` as TRUE → ⛔ ok: true on a REFUSED write
//
// So the store refused, `log_memory_refusals` recorded it, nothing was persisted — and the caller was
// told it had succeeded. Ote's requirement, verbatim: prove the whole path reports *refusal at store →
// preserved through serialized lane → NOT ok=true → correct refusal classification → no memory row →
// other observations still continue.*
//
// ⛔ EVERYTHING BELOW RUNS AS agent_dev and every fixture it writes is removed at the end. ⛔ No model
// call: the refusal is produced by the store's OWN gate, not by an injected fake.

import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker('write-lane-composition')
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

// ⭐ A REAL REFUSAL, FROM A FIELD THAT ACTUALLY REACHES THE STORE. `semanticTarget` cannot be used here:
// `commitToMemory` is an explicit allowlist and does not forward it, so a refusal driven by it would
// prove the harness rather than the path. The self-state gate reads `content`, which reconcileFact
// GENERATES from the slot — so an ordinary {entity, attribute, value} observation trips a real gate.
const REFUSING_VALUE = 'nothing stored about zz_hermes'
const ATTR = 'zz_lane_probe'

let fastify = null
try {
  const agent = await one(`select id from ${S}.mst_users where username = 'agent_dev'`)
  check('agent_dev exists — ⛔ this check never runs as root', Boolean(agent?.id))

  // ⚠️ THE REAL CONFIG, NOT A STUB. A bare `{ db, log }` fastify makes the EMBEDDER fail with
  // `provider_not_configured` long before the store's gate is reached — so the check would still have
  // gone green on `ok:false` while proving something else entirely. ⭐ A refusal test that can pass on
  // the wrong failure is not a refusal test; the gate has to be the thing that fires.
  const { loadConfig } = await import('../../Backend/lib/utility.js')
  const { initDB } = await import('../../Backend/database/index.js')
  const config = loadConfig()
  const db = await initDB()
  const logged = []
  const log = {
    warn: (o, m) => logged.push({ level: 'warn', o, m }),
    error: (o, m) => logged.push({ level: 'error', o, m }),
    info: () => {}, debug: () => {}, child: () => log,
  }
  fastify = { db, log, config }

  const { buildMemoryPipeline } = await import('../../Backend/app/components/memory-pipeline-host.js')
  // ⭐ THE EXACT WIRING OF THE AUTOMATIC WRITER (memory-extract-host.js): serializeCommits TRUE, which
  // is the composition order that used to lose the failure.
  const { pipeline } = buildMemoryPipeline(fastify, {
    userId: agent.id, persona: 'sotera', serializeCommits: true,
  })

  const countRows = async () => Number((await one(
    `select count(*)::int n from ${S}.txn_memories where user_id = $1 and attribute = $2`, [agent.id, ATTR])).n)

  const refusalsBefore = Number((await one(`select count(*)::int n from ${S}.log_memory_refusals`)).n)
  const before = await countRows()

  // ── 1 · THE REFUSAL SURVIVES THE LANE ──────────────────────────────────────────────────────────
  const r = await pipeline.ingest({ type: 'fact', entity: 'user', attribute: ATTR, value: REFUSING_VALUE })

  check('1 · ⭐⭐⭐ NOT ok:true — a refused write is reported as a FAILURE', r.ok === false, `ok=${r.ok}`)
  check('1 · the failure is attributed to the COMMIT stage', r.stage === 'commit', `stage=${r.stage}`)
  check('1 · ⭐⭐ the refusal CLASSIFICATION survived the lane (M2-16, live on the automatic path)',
    r.code === 'SELF_STATE_CLAIM', `code=${r.code}`)
  check('1 · and the reason is a sentence, not a code', typeof r.error === 'string' && r.error.length > 10, r.error ?? '')

  // ── 2 · NOTHING WAS PERSISTED ──────────────────────────────────────────────────────────────────
  check('2 · ⛔ NO memory row was written', (await countRows()) === before, `${before} → ${await countRows()}`)

  // ── 3 · THE REFUSAL WAS STILL RECORDED AND STILL LOGGED ────────────────────────────────────────
  // ⭐ The disclosure mechanism and the log line are what the fix must NOT have traded away.
  const refusalsAfter = Number((await one(`select count(*)::int n from ${S}.log_memory_refusals`)).n)
  check('3 · the store still logged the refusal it made',
    logged.some((l) => /refused/i.test(String(l.m ?? ''))), `${logged.length} line(s)`)
  check('3 · ⓘ log_memory_refusals is unchanged by THIS gate (only 032 records there)',
    refusalsAfter === refusalsBefore, `${refusalsBefore} → ${refusalsAfter}`)

  // ── 4 · OTHER OBSERVATIONS STILL CONTINUE — candidate isolation, live ──────────────────────────
  const interpreter = () => [
    { type: 'fact', entity: 'user', attribute: ATTR, value: 'zz_lane_first' },
    { type: 'fact', entity: 'user', attribute: ATTR, value: REFUSING_VALUE },   // ⛔ refused
    { type: 'fact', entity: 'user', attribute: ATTR, value: 'zz_lane_third' },
  ]
  const { observations, results } = await pipeline.observe('zz', [interpreter])
  check('4 · all three observations were attempted', observations === 3, `${observations}`)
  check('4 · ⭐⭐ CANDIDATE ISOLATION: the refused one failed ALONE',
    JSON.stringify(results.map((x) => x.ok)) === '[true,false,true]',
    JSON.stringify(results.map((x) => x.ok)))
  check('4 · and only the refused one carries a code',
    results[1].code === 'SELF_STATE_CLAIM' && results[0].code === undefined,
    `[${results.map((x) => x.code ?? '-').join(', ')}]`)

  // ⭐ THE POSITIVE HALF: the writes that were NOT refused actually landed. A test that only proves
  // failures are reported would pass on a lane that had stopped writing altogether.
  //
  // ⚠️ AND THE COUNT IS TWO WRITTEN, ONE LIVE — not a discrepancy, the reconcile. Both admissible
  // observations target the SAME slot (entity `user`, attribute `zz_lane_probe`), so the second
  // supersedes the first in place. Asserting "2 rows live" would have been asserting a bug.
  const all = await q(`select value, invalid_at from ${S}.txn_memories where user_id=$1 and attribute=$2`, [agent.id, ATTR])
  const live = all.filter((x) => x.invalid_at === null)
  check('4 · ⭐ BOTH admissible observations were really PERSISTED', all.length === 2,
    all.map((x) => `${x.value}${x.invalid_at ? ' (superseded)' : ''}`).join(' | '))
  check('4 · ⭐ and reconcile-in-place still applies — the later one supersedes, one row stays live',
    live.length === 1 && live[0].value === 'zz_lane_third', `${live.length} live`)
  check('4 · ⛔ and the refused value is nowhere in the store, live or superseded',
    !all.some((x) => String(x.value ?? '').includes('zz_hermes')), `${all.length} row(s) total`)
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  // ⛔ Remove every fixture. agent_dev's room is a test surface, not a growing residue.
  try { await pg.query(`delete from ${S}.txn_memories where attribute = $1`, [ATTR]) } catch { /* nothing written */ }
  try { await fastify?.db?.sequelize?.close?.() } catch { /* already closed */ }
  await pg.end()
}

done()
