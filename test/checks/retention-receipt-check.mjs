// ⭐⭐⭐ THE RETENTION RECEIPT — `keep()` reports what HAPPENED, ⛔ not what was QUEUED.
//
//   node test/checks/retention-receipt-check.mjs        ⚠️ ~30 s: PART C blocks the write lane on purpose
//
// ── ⚠️⚠️ THE MEASURED DEFECT THIS CLOSES, 2026-09-03 ────────────────────────────────────────────────
// The first governed slot was bound, and the model-tool path wrote to it without a claim kind. The M2
// gate REFUSED correctly — no row, previous belief live, no mutation — ⛔ and `keep()` returned
// `{ok:true, queued:true}` because it discarded the `settled` receipt the host had handed it. Three
// consumers were told the retention happened: the model, `effected()` — which recorded `outcome:'keep'`
// DURABLY — and every retention-rate figure built on that column.
//
// ⇒ three states, and ⛔ never two:
//     persisted   the write happened, and a ROW ID proves it            ok: true
//     refused     the write was rejected, with a reason and a code      ok: false
//     accepted    ⚠️ WE STOPPED WAITING AND DO NOT KNOW                 ok: false, and ⛔ NEVER an act
//
// ── ⭐⭐ WHY PART C BLOCKS A REAL LANE INSTEAD OF STUBBING A TIMEOUT ────────────────────────────────
// `accepted` is the state whose whole meaning is *"the instrument stopped looking"*, so a stubbed one
// would prove nothing about the system. ⭐ It is produced HERE the way production produces it — by
// occupying the shared serial write lane, which is exactly the 2026-08-26 incident where a write took
// **60 seconds** because 59 CPU-placed aux calls had starved the embedder.
//
// ⭐⭐⭐ AND PART C's LAST ASSERTION IS THE ONE THAT MATTERS MOST: after the block clears, THE ROW LANDS.
// That is what makes `accepted` mean UNKNOWN rather than FAILED — ⛔ two states this project must never
// let merge, in either direction.
//
// ⛔ Writes only to agent_dev, only to `zz_` addresses, plus ONE deliberately-refused probe at the real
// canary slot — which by construction writes nothing.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildRetention, RETENTION_STATE, KINDS } from '../../Backend/app/components/retention-host.js'
import { effected } from '../../Backend/app/components/retention-followthrough.js'
import { buildMemoryToolService } from '../../Backend/app/components/memory-pipeline-host.js'

const { check, done } = makeChecker('retention-receipt')
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
const pg = devPg(); await pg.connect()
const S = `"${devSchema()}"`
const q = async (sql, p = []) => (await pg.query(sql, p)).rows

const t = Date.now()
const ATTR_OK = `zz_rcpt_ok_${t}`
const ATTR_SLOW = `zz_rcpt_slow_${t}`
const ATTR_RETAIN = `zz_rcpt_retain_${t}`
/** ⭐ The REAL governed slot. Ote approved it 2026-09-03; a write here is refused BY DESIGN. */
const CANARY_ATTR = 'build tag for this cycle'
const PROBE = `zz_rcpt_should_never_land_${t}`

const [me] = await q(`SELECT id::text AS id, username FROM ${S}."mst_users" WHERE username = 'agent_dev'`)
if (!me) { console.error('✖ agent_dev not found — ⛔ this check must never run as root'); process.exit(1) }
const [convo] = await q(
  `SELECT id::text AS id FROM ${S}."txn_conversations" WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [me.id])
const R = buildRetention(fastify, {
  userId: me.id, self: { username: me.username }, conversationId: convo?.id ?? null,
})

const liveCanary = async () => q(
  `SELECT m.id::text AS id, m.value FROM ${S}."txn_memories" m
     JOIN ${S}."mst_slots" s ON s.id = m.slot_id
    WHERE s.canonical_label = $1 AND s.user_id = $2::uuid
      AND m.invalid_at IS NULL AND m.expired_at IS NULL`, [CANARY_ATTR, me.id])

try {
  // ══ PART A · ⭐⭐⭐ PERSISTED — THE POSITIVE CONTROL, AND IT RUNS FIRST ═══════════════════════════
  // ⛔ No refusal proof is interpretable until ALLOW has been shown reachable on the same path.
  const a = await R.keep({ what: 'CANARY-receipt-probe-A', kind: KINDS.fact, mine: false, attribute: ATTR_OK })
  check('A1 · ⭐⭐⭐ a good write reports PERSISTED — ⛔ not `queued`',
    a?.state === RETENTION_STATE.persisted, `state=${a?.state} ok=${a?.ok}`)
  check('A2 · …and it carries a real row id', typeof a?.memoryId === 'string' && a.memoryId.length === 36,
    `memoryId=${a?.memoryId}`)
  // ⭐⭐ THE PERSISTENCE BOUNDARY. A receipt naming an id that no row has is the failure this project
  // paid for twice; the id is looked up, ⛔ never trusted.
  const [row] = a?.memoryId ? await q(`SELECT id::text AS id, value FROM ${S}."txn_memories" WHERE id = $1::uuid`, [a.memoryId]) : []
  check('A3 · ⭐⭐⭐ …and THE ROW EXISTS — the receipt survived the persistence boundary, ⛔ not merely the code path',
    row?.value === 'CANARY-receipt-probe-A', `row=${row ? JSON.stringify(row.value) : 'NOT FOUND'}`)
  check('A4 · ⭐ `effected()` counts it — asserted against the REAL function, ⛔ not a restatement of its rule',
    effected(a) === true)

  // ══ PART B · ⭐⭐ REFUSED — on the REAL governed canary slot ══════════════════════════════════════
  const before = await liveCanary()
  check('B0 · precondition: the canary slot has exactly one live row', before.length === 1,
    `live=${before.length} ${JSON.stringify(before.map((r) => r.value))}`)
  const b = await R.keep({ what: PROBE, kind: KINDS.fact, mine: false, attribute: CANARY_ATTR })
  check('B1 · ⭐⭐⭐ a governed refusal reports REFUSED — ⛔ the defect that made this change necessary',
    b?.state === RETENTION_STATE.refused, `state=${b?.state} ok=${b?.ok}`)
  check('B2 · ⭐⭐ …carrying the store\'s CODE, so a refusal is distinguishable from an outage',
    b?.code === 'REPLACEMENT_REFUSED', `code=${b?.code}`)
  check('B3 · ⭐ …and a reason that names the slot\'s question',
    typeof b?.why === 'string' && b.why.includes('build-tag'), `why=${String(b?.why).slice(0, 90)}`)
  check('B4 · ⭐⭐⭐ `effected()` does NOT count it — a refused act is not an act',
    effected(b) === false)
  const after = await liveCanary()
  check('B5 · ⭐⭐ and the refusal left the world as it found it — same single live row, same value',
    after.length === 1 && after[0].id === before[0]?.id && after[0].value === before[0]?.value,
    `live=${JSON.stringify(after.map((r) => r.value))}`)
  const [leaked] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_memories" WHERE value = $1`, [PROBE])
  check('B6 · ⛔ …and NO replacement row was written anywhere', leaked.n === 0, `rows with the probe value=${leaked.n}`)

  // ══ PART C · ⭐⭐⭐ ACCEPTED — produced by a REAL blocked lane, ⛔ not a stub ══════════════════════
  // ⭐ The lane is module-level in @ote/memory and keyed by (persona, userId), so a service built the SAME
  // way shares it. ⇒ this occupies the very queue `keep` is about to wait on.
  const blocker = buildMemoryToolService(fastify, { userId: me.id, author: 'account', scope: 'room' })
  const BLOCK_MS = 25_000
  const held = blocker.enqueue('zz_rcpt_block', () => new Promise((r) => { setTimeout(r, BLOCK_MS) }))
  const startedAt = Date.now()
  // ⭐ BOTH DOORS AT ONCE — `keep` and `retain` share one bound, so they are raced together rather than
  // serially: two 20 s waits in sequence would outlast the block and prove nothing about the second.
  const [c, d] = await Promise.all([
    R.keep({ what: 'CANARY-receipt-probe-C', kind: KINDS.fact, mine: false, attribute: ATTR_SLOW }),
    R.retain({ content: 'CANARY-receipt-probe-D', kind: KINDS.fact, mine: true, about: 'sotera', attribute: ATTR_RETAIN }),
  ])
  const waited = Date.now() - startedAt
  check('C1 · ⭐⭐⭐ a write that does not report in time is ACCEPTED — ⛔ never `persisted`',
    c?.state === RETENTION_STATE.accepted, `state=${c?.state} ok=${c?.ok} waited=${waited}ms`)
  check('C2 · ⭐⭐⭐ …and `accepted` carries ok:false — ⛔ Ote: "It is not success"',
    c?.ok === false, `ok=${c?.ok}`)
  check('C3 · ⭐⭐ …and NO row id, because none is known', (c?.memoryId ?? null) === null, `memoryId=${c?.memoryId ?? 'null'}`)
  check('C4 · ⭐⭐⭐ `effected()` does NOT count it — a timeout can never become a retention act',
    effected(c) === false)
  check('C5 · ⭐ the wait was BOUNDED — it returned near the bound, ⛔ not when the lane cleared',
    waited >= 19_000 && waited < BLOCK_MS, `waited=${waited}ms bound=20000ms block=${BLOCK_MS}ms`)
  // ⭐⭐⭐ THE COMPOSITION ASSERTION — `retain` must pass the third state THROUGH.
  // ⚠️ `accepted` now carries ok:false, so `retain`'s own `if (out.ok === false) → refused` would have
  // folded it into the second state. That collapse is the whole defect, one function over.
  check('C6 · ⭐⭐⭐ `retain` reports ACCEPTED too — ⛔ the third state is NOT folded into `refused`',
    d?.state === RETENTION_STATE.accepted, `state=${d?.state} why=${String(d?.why ?? '').slice(0, 60)}`)
  check('C7 · ⛔ …and it carries no memory id either', (d?.memoryId ?? null) === null, `memoryId=${d?.memoryId ?? 'null'}`)

  // ⭐⭐⭐ AND NOW THE ASSERTION THAT GIVES `accepted` ITS MEANING.
  await held.catch(() => {})
  await new Promise((r) => { setTimeout(r, 2_000) })
  const [landed] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_memories" WHERE attribute = $1`, [ATTR_SLOW])
  check('C8 · ⭐⭐⭐ once the lane cleared THE ROW LANDED — so `accepted` means **UNKNOWN**, ⛔ NOT `failed`. '
    + 'Reporting it as a refusal would be the same collapse in the other direction',
  landed.n === 1, `rows for the accepted write=${landed.n}`)
} catch (e) {
  check('the receipt check ran to completion', false, e?.message ?? String(e))
} finally {
  try {
    for (const a of [ATTR_OK, ATTR_SLOW, ATTR_RETAIN]) {
      await pg.query(`DELETE FROM ${S}."txn_memories" WHERE attribute = $1`, [a])
      await pg.query(`DELETE FROM ${S}."mst_slots" WHERE canonical_label = $1`, [a])
    }
    await pg.query(`DELETE FROM ${S}."txn_memories" WHERE value = $1`, [PROBE])
    await pg.query(`DELETE FROM ${S}."log_retention_decisions" WHERE content LIKE 'CANARY-receipt-probe-%'`)
  } catch (e) { check('teardown ran', false, e?.message) }
  const [res] = await q(
    `SELECT (SELECT count(*)::int FROM ${S}."txn_memories" WHERE attribute LIKE 'zz_rcpt_%') AS m,
            (SELECT count(*)::int FROM ${S}."mst_slots" WHERE canonical_label LIKE 'zz_rcpt_%') AS s,
            (SELECT count(*)::int FROM ${S}."log_retention_decisions" WHERE content LIKE 'CANARY-receipt-probe-%') AS d,
            (SELECT count(*)::int FROM ${S}."txn_memories" m
               JOIN ${S}."mst_slots" sl ON sl.id = m.slot_id
              WHERE sl.canonical_label = 'build tag for this cycle'
                AND m.invalid_at IS NULL AND m.expired_at IS NULL) AS canary_live`)
  check('⭐ teardown ASSERTED, not trusted — ⛔ and the canary slot still holds exactly ONE live row',
    res.m === 0 && res.s === 0 && res.d === 0 && res.canary_live === 1,
    `memories=${res.m} slots=${res.s} decisions=${res.d} canary_live=${res.canary_live}`)
  await pg.end()
  await db.txn_memories.sequelize.close()
  done()
}
