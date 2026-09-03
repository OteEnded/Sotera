// ⭐⭐⭐ THE MODEL-FACING WRITE RESULT — what she is told, for BOTH write tools, in ALL THREE states.
//
//   node test/checks/model-facing-write-result-check.mjs      ⚠️ ~30 s: PART C blocks the write lane
//
// ── ⚠️⚠️ THE MEASURED DEFECT, 2026-09-03 ───────────────────────────────────────────────────────────
// `remember_fact` returned the host's queued object verbatim. The route serialises a tool result with
// `JSON.stringify`, and a Promise flattens to `{}` — so a KEPT fact and one the M2 gate REFUSED came back
// **BYTE-IDENTICALLY**: `{"ok":true,"queued":true,"settled":{}}`. ⭐ Assertion S1 below is that
// measurement INVERTED, and it is the assertion that would have caught this.
//
// ⛔ `remember` had the identical defect. Ote: *"one writer fixed while the other remains optimistic is
// not an acceptable final state."* ⇒ every state is proved for BOTH doors.
//
// ── ⭐⭐ THE RATIFIED CONTRACT (2026-09-04) ─────────────────────────────────────────────────────────
//     persisted  ok:true   · a real id
//     refused    ok:false  · ⛔ no id
//     accepted   ok:false  · ⛔ no id · ⚠️ the operation MAY STILL COMPLETE LATER
//
// ⛔⛔ STATE IS AUTHORITATIVE: `ok:false` means *not completed or not known*, ⛔ NOT specifically
// *refused*. A consumer that branches on `ok` alone cannot tell a refusal from a timeout, and those have
// opposite remedies.
//
// ⛔ Writes only to agent_dev, only to `zz_` addresses, plus deliberately-refused probes at the real
// canary slot — which by construction write nothing.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryToolService } from '../../Backend/app/components/memory-pipeline-host.js'
import { RETENTION_STATE, forModel, settleWrite } from '../../Backend/app/components/memory-write-receipt.js'
import { effected } from '../../Backend/app/components/retention-followthrough.js'

const { check, done } = makeChecker('model-facing-write-result')
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
const pg = devPg(); await pg.connect()
const S = `"${devSchema()}"`
const q = async (sql, p = []) => (await pg.query(sql, p)).rows

const t = Date.now()
const CANARY = 'build tag for this cycle'
const A_FACT = `zz_mfw_fact_${t}`
const PROBE_FACT = `zz_mfw_never_fact_${t}`
const PROBE_NOTE = `zz_mfw_never_note_${t}`
const A_NOTE = `zz_mfw_note_${t}`
const SLOW_FACT = `zz_mfw_slow_fact_${t}`
const SLOW_NOTE = `zz_mfw_slow_note_${t}`

const [me] = await q(`SELECT id::text AS id FROM ${S}."mst_users" WHERE username = 'agent_dev'`)
if (!me) { console.error('✖ agent_dev not found — ⛔ never run this as root'); process.exit(1) }
const mem = buildMemoryToolService(fastify, { userId: me.id, author: 'account', scope: 'room' })

/** ⭐ EXACTLY what the package handlers do — ⛔ the check must not model it differently. */
const asModel = async (queued) => (await queued.settled)?.forModel ?? null
/** ⭐ …and exactly how the route hands it to her: `JSON.stringify(result)`. */
const wire = (r) => JSON.stringify(r)

const liveCanary = async () => q(
  `SELECT m.id::text AS id, m.value FROM ${S}."txn_memories" m JOIN ${S}."mst_slots" s ON s.id = m.slot_id
    WHERE s.canonical_label = $1 AND s.user_id = $2::uuid AND m.invalid_at IS NULL AND m.expired_at IS NULL`,
  [CANARY, me.id])

try {
  // ══ PART A · ⭐⭐⭐ PERSISTED — THE POSITIVE CONTROL, AND IT RUNS FIRST ═══════════════════════════
  const aFact = await asModel(mem.reconcileFactAsync({ entity: 'user', attribute: A_FACT, value: 'probe-fact' }))
  const aNote = await asModel(mem.rememberAsync({ content: `probe-note ${A_NOTE}`, kind: 'semantic' }))
  for (const [name, r] of [['remember_fact', aFact], ['remember', aNote]]) {
    check(`A · ⭐⭐⭐ ${name} reports PERSISTED with ok:true and a real id`,
      r?.state === RETENTION_STATE.persisted && r.ok === true && typeof r.id === 'string' && r.id.length === 36,
      `${wire(r)}`)
  }
  // ⭐⭐ THE PERSISTENCE BOUNDARY — the id is LOOKED UP, ⛔ never trusted.
  // ⚠️ THE TWO DOORS STORE THEIR TEXT IN DIFFERENT COLUMNS, and the first draft of this assertion read
  // `value` for BOTH and went red on the note. ⓘ A fact is subject-attribute-VALUE; a note has no
  // attribute and its text is `content`, with `value` NULL. ⛔ The system was right and the assertion was
  // wrong — recorded because "the receipt named a row that does not exist" and "I looked in the wrong
  // column" are the same red until you check.
  const [rowF] = await q(`SELECT value, content FROM ${S}."txn_memories" WHERE id = $1::uuid`, [aFact.id])
  const [rowN] = await q(`SELECT value, content FROM ${S}."txn_memories" WHERE id = $1::uuid`, [aNote.id])
  check('A3 · ⭐⭐⭐ …and BOTH rows exist — the receipts survived the persistence boundary',
    rowF?.value === 'probe-fact' && typeof rowN?.content === 'string' && rowN.content.includes(A_NOTE),
    `fact.value=${JSON.stringify(rowF?.value)} note.content=${JSON.stringify(rowN?.content)?.slice(0, 44)}`)

  // ══ PART B · ⭐⭐ REFUSED — at the REAL governed canary slot, both doors ══════════════════════════
  const before = await liveCanary()
  check('B0 · precondition: the canary slot has exactly one live row', before.length === 1,
    `live=${JSON.stringify(before.map((r) => r.value))}`)
  const bFact = await asModel(mem.reconcileFactAsync({ entity: 'user', attribute: CANARY, value: PROBE_FACT }))
  check('B1 · ⭐⭐⭐ remember_fact reports REFUSED — ok:false and ⛔ NO id',
    bFact?.state === RETENTION_STATE.refused && bFact.ok === false && !('id' in bFact), wire(bFact))
  check('B2 · ⭐⭐⭐ …and the model-facing text does NOT expose `claimKind` — ⛔ never a remedy she cannot use',
    !/claimKind/i.test(wire(bFact)) && !/build-tag/i.test(wire(bFact)), wire(bFact))
  check('B3 · ⭐ …while it DOES say plainly that nothing was saved',
    /not saved/i.test(bFact.why ?? ''), `why=${bFact?.why}`)
  check('B4 · ⭐⭐⭐ `effected()` does NOT count it', effected(bFact) === false)

  // ⭐⭐ THE DEVELOPER HALF, on the SAME write — the real reason and code are NOT lost, only re-audienced.
  const devRaw = await mem.reconcileFactAsync({ entity: 'user', attribute: CANARY, value: `${PROBE_FACT}_dev` }).settled
  check('B5 · ⭐⭐⭐ the DEVELOPER receipt keeps the real code and the full diagnosis',
    devRaw?.code === 'REPLACEMENT_REFUSED' && /claimKind|declares no kind/i.test(devRaw?.why ?? ''),
    `code=${devRaw?.code} why=${String(devRaw?.why).slice(0, 70)}`)
  check('B6 · ⭐⭐ …and its MODEL projection of that very receipt still hides it — two audiences, one truth',
    !/claimKind|declares no kind/i.test(JSON.stringify(devRaw?.forModel)), wire(devRaw?.forModel))

  const bNote = await asModel(mem.rememberAsync({ content: PROBE_NOTE, kind: 'semantic' }))
  check('B7 · ⓘ `remember` on this corpus is not refused — it mints its own slot, so it reports PERSISTED. '
    + 'Recorded so the note door\'s refusal is not claimed unproven',
  bNote?.state === RETENTION_STATE.persisted, wire(bNote))
  // ⭐ …so the note door's REFUSED state is proved through the same seam, on a rejected receipt.
  const noteRefused = forModel({ state: RETENTION_STATE.refused, code: 'REPLACEMENT_REFUSED' })
  check('B8 · ⭐ the projection is shared, so `remember` refuses with the same model-safe text',
    noteRefused.ok === false && noteRefused.state === RETENTION_STATE.refused
    && !/claimKind/i.test(JSON.stringify(noteRefused)), wire(noteRefused))

  const after = await liveCanary()
  check('B9 · ⭐⭐ the refused writes left the world as they found it',
    after.length === 1 && after[0].id === before[0]?.id && after[0].value === before[0]?.value,
    `live=${JSON.stringify(after.map((r) => r.value))}`)
  const [leak] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_memories" WHERE value LIKE $1`, [`${PROBE_FACT}%`])
  check('B10 · ⛔ …and NO replacement row was written', leak.n === 0, `rows=${leak.n}`)

  // ══ PART C · ⭐⭐⭐ ACCEPTED — a REAL blocked lane, both doors ═════════════════════════════════════
  const blocker = buildMemoryToolService(fastify, { userId: me.id, author: 'account', scope: 'room' })
  const BLOCK_MS = 25_000
  const held = blocker.enqueue('zz_mfw_block', () => new Promise((r) => { setTimeout(r, BLOCK_MS) }))
  const startedAt = Date.now()
  const [cFact, cNote] = await Promise.all([
    asModel(mem.reconcileFactAsync({ entity: 'user', attribute: SLOW_FACT, value: 'slow-fact' })),
    asModel(mem.rememberAsync({ content: `slow-note ${SLOW_NOTE}`, kind: 'semantic' })),
  ])
  const waited = Date.now() - startedAt
  for (const [name, r] of [['remember_fact', cFact], ['remember', cNote]]) {
    check(`C · ⭐⭐⭐ ${name} reports ACCEPTED — ok:false, ⛔ no id, and ⛔ NOT "refused"`,
      r?.state === RETENTION_STATE.accepted && r.ok === false && !('id' in r), wire(r))
    check(`C · ⭐⭐ ${name}'s text says UNKNOWN and that it may still complete — ⛔ never that it failed`,
      /do not know/i.test(r?.why ?? '') && /still/i.test(r?.why ?? ''), `why=${r?.why}`)
    check(`C · ⭐⭐⭐ \`effected()\` does NOT count ${name}'s timeout`, effected(r) === false)
  }
  check('C5 · ⭐ the wait was BOUNDED — near the bound, ⛔ not when the lane cleared',
    waited >= 19_000 && waited < BLOCK_MS, `waited=${waited}ms bound=20000ms block=${BLOCK_MS}ms`)

  // ══ ⭐⭐⭐ S · THE SERIALISATION ASSERTIONS — the measurement that caught this, INVERTED ═══════════
  check('S1 · ⭐⭐⭐ a KEPT and a REFUSED write no longer serialise IDENTICALLY — the defect itself',
    wire(aFact) !== wire(bFact), `kept=${wire(aFact)}  refused=${wire(bFact)}`)
  for (const [label, r] of [['persisted', aFact], ['refused', bFact], ['accepted', cFact], ['note-persisted', aNote], ['note-accepted', cNote]]) {
    check(`S2 · ⛔ NO Promise or \`settled\` artifact survives serialisation — ${label}`,
      !/settled|queued|\{\}/.test(wire(r)), wire(r))
  }
  check('S3 · ⭐⭐ STATE IS AUTHORITATIVE — `ok:false` covers BOTH refused and accepted, so a consumer '
    + 'that reads only `ok` cannot tell them apart',
  bFact.ok === false && cFact.ok === false && bFact.state !== cFact.state,
  `refused.ok=${bFact.ok} accepted.ok=${cFact.ok} states=${bFact.state}/${cFact.state}`)

  // ⭐⭐⭐ AND THE ASSERTION THAT GIVES `accepted` ITS MEANING.
  await held.catch(() => {})
  await new Promise((r) => { setTimeout(r, 2_000) })
  const [landed] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_memories" WHERE attribute = $1`, [SLOW_FACT])
  check('C8 · ⭐⭐⭐ once the lane cleared THE ROW LANDED — so `accepted` means **UNKNOWN**, ⛔ NOT `failed`',
    landed.n === 1, `rows for the accepted write=${landed.n}`)

  // ⭐ A no-receipt host degrades to UNKNOWN, ⛔ never to optimism — the package's own fallback path.
  const none = await settleWrite(null)
  check('D1 · ⭐⭐ a writer that returns NO receipt yields ACCEPTED, ⛔ not ok:true',
    none.state === RETENTION_STATE.accepted && none.ok === false && none.id === null, wire(none.forModel))
} catch (e) {
  check('the model-facing check ran to completion', false, e?.message ?? String(e))
} finally {
  try {
    for (const a of [A_FACT, SLOW_FACT]) {
      await pg.query(`DELETE FROM ${S}."txn_memories" WHERE attribute = $1`, [a])
      await pg.query(`DELETE FROM ${S}."mst_slots" WHERE canonical_label = $1`, [a])
    }
    await pg.query(`DELETE FROM ${S}."txn_memories" WHERE value LIKE 'zz_mfw_%' OR content LIKE '%zz_mfw_%'`)
    await pg.query(`DELETE FROM ${S}."txn_memories" WHERE value LIKE '%zz_mfw_%'`)
    await pg.query(`DELETE FROM ${S}."mst_slots" WHERE canonical_label LIKE 'zz_mfw_%'`)
  } catch (e) { check('teardown ran', false, e?.message) }
  const [res] = await q(
    `SELECT (SELECT count(*)::int FROM ${S}."txn_memories"
              WHERE attribute LIKE 'zz_mfw_%' OR value LIKE '%zz_mfw_%') AS m,
            (SELECT count(*)::int FROM ${S}."mst_slots" WHERE canonical_label LIKE 'zz_mfw_%') AS s,
            (SELECT count(*)::int FROM ${S}."txn_memories" m2
               JOIN ${S}."mst_slots" sl ON sl.id = m2.slot_id
              WHERE sl.canonical_label = 'build tag for this cycle'
                AND m2.invalid_at IS NULL AND m2.expired_at IS NULL) AS canary_live`)
  check('⭐ teardown ASSERTED, not trusted — ⛔ and the canary slot still holds exactly ONE live row',
    res.m === 0 && res.s === 0 && res.canary_live === 1,
    `memories=${res.m} slots=${res.s} canary_live=${res.canary_live}`)
  await pg.end()
  await db.txn_memories.sequelize.close()
  done()
}
