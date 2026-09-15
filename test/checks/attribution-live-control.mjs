// ⭐⭐⭐ ATTRIBUTION LIVE DETECTION · THE POSITIVE CONTROL THAT CROSSES PERSISTENCE.
//
//   node test/checks/attribution-live-control.mjs
//
// `positive-control-must-cross-persistence`: the unit tests prove the builder against a FAKE db. This proves the real
// path — the real models, the real tables, the real CHECK constraints — by feeding `recordAttributionTurn` the recorded
// 2026-09-15 incident under the control username `zz_control`, reading both rows back through SQL, asserting their shape,
// and then REMOVING the two control rows so the measurement never counts them.
// ⛔ It does not send a turn through the route: the phenomenon cannot be manufactured on demand (three corpora), and the
// route's part of the path is pinned by the unit test H + the live denominator rows. This closes the gap between them.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB } from '../../Backend/lib/utility.js'
import { recordAttributionTurn, DETECTOR_VERSION } from '../../Backend/app/components/attribution-live-detection.js'

const CANON = JSON.parse(readFileSync(new URL('../fixtures/attribution-natural-trajectory-ca672514.json', import.meta.url), 'utf8'))
const CONTROL_USER = 'zz_control'
const CONTROL_CONVERSATION = '00000000-0000-4000-8000-00000000c0de'
const CONTROL_MESSAGE = '00000000-0000-4000-8000-0000000a0749'

const db = await initDB(); setDB(db)
const S = devSchema()
const pg = devPg(); await pg.connect()
const fails = []
const check = (ok, what) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) fails.push(what) }

try {
  // ⛔ never leave an earlier control behind
  await pg.query(`DELETE FROM "${S}".log_attribution_scans WHERE username = $1`, [CONTROL_USER])
  await pg.query(`DELETE FROM "${S}".log_attribution_candidates WHERE username = $1`, [CONTROL_USER])

  const ctx = {
    username: CONTROL_USER, conversationId: CONTROL_CONVERSATION, assistantMessageId: CONTROL_MESSAGE,
    model: CANON.source.model, settings: CANON.source.settings,
    reasoning: CANON.incident.reasoning, reply: CANON.incident.reply,
    history: [...CANON.history.map((m) => ({ id: null, rolling_id: m.rollingId, role: m.role, content: m.content })),
      { id: null, rolling_id: CANON.probe.rollingId, role: 'user', content: CANON.probe.content }],
    blocks: { cognition: CANON.blocks.cognition, scopeFacts: CANON.blocks.scopeFacts, workingMemory: CANON.blocks.workingMemory },
    parts: [{ key: 'cognition' }, { key: 'attribution-principle' }],
    toolset: { count: 49, path: 'none' }, toolCalls: CANON.incident.toolCalls,
  }
  const r = await recordAttributionTurn({ db, log: { warn: (o, m) => console.log('  warn:', m, o?.err ?? ''), info() {} } }, ctx)
  check(!r.error && r.scan && r.candidate, `recordAttributionTurn wrote through the real models${r.error ? ` — ${r.error}` : ''}`)

  const { rows: scans } = await pg.query(`SELECT * FROM "${S}".log_attribution_scans WHERE username = $1`, [CONTROL_USER])
  const { rows: cands } = await pg.query(`SELECT * FROM "${S}".log_attribution_candidates WHERE username = $1`, [CONTROL_USER])
  check(scans.length === 1 && cands.length === 1, `exactly one scan row and one candidate row persisted (${scans.length}/${cands.length})`)
  const s = scans[0]; const c = cands[0]
  if (s && c) {
    check(s.scanned === true && s.error === null && s.claims_found === c.spans.length && s.candidate_id === c.id, 'the scan row links to the candidate and counts its spans')
    check(s.detector_version === DETECTOR_VERSION && c.detector_version === DETECTOR_VERSION, `both rows stamped detector v${DETECTOR_VERSION}`)
    check(c.spans.every((x) => x.surface === 'reasoning') && /the user asked me to/i.test(c.spans[0].span), 'spans survived the write with their REASONING surface')
    check(c.sources.requestedNow === false, 'sources: the aside requests nothing')
    check(c.sources.remembered.some((x) => /check all things in your memory/.test(x.text) && x.readsAsRequest), 'sources: the remembered 25-August request is listed and reads as a request')
    check(c.surrounding.messages.length === CANON.history.length + 2 && c.composed.cognition === CANON.blocks.cognition, 'the frozen copy and the composed block survived the write verbatim')
    check(c.classification === null && c.confirmed_by === null && c.confirmed_at === null, 'the row is a CANDIDATE — unclassified, nobody confirmed it')
    check(c.principle_present === true, 'principle_present recorded from the parts list')
    // the CHECKs are real: an inconsistent judgement must be refused by the database, not by convention
    let refused = false
    try { await pg.query(`UPDATE "${S}".log_attribution_candidates SET classification = 'TOPIC_ONLY' WHERE id = $1`, [c.id]) } catch { refused = true }
    check(refused, 'the database refuses a classification without confirmed_by/confirmed_at (D13 CHECK)')
    refused = false
    try { await pg.query(`UPDATE "${S}".log_attribution_candidates SET classification = 'MADE_UP', confirmed_by = 'x', confirmed_at = now() WHERE id = $1`, [c.id]) } catch { refused = true }
    check(refused, 'the database refuses a class outside the six')
  }
} finally {
  const a = await pg.query(`DELETE FROM "${S}".log_attribution_scans WHERE username = $1`, [CONTROL_USER])
  const b = await pg.query(`DELETE FROM "${S}".log_attribution_candidates WHERE username = $1`, [CONTROL_USER])
  console.log(`control rows removed: ${a.rowCount} scan · ${b.rowCount} candidate`)
  await pg.end()
  await db.sequelize?.close?.().catch(() => {})
}
console.log(fails.length ? `\n⛔ ${fails.length} control assertion(s) FAILED` : '\nALL — the positive control crossed persistence and was removed')
process.exit(fails.length ? 1 : 0)
