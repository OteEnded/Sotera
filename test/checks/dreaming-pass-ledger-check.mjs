// ⭐⭐ THE DREAMING PASS LEDGER — M1 · step 1, against a TEST SCHEMA.
//
//   node test/checks/dreaming-pass-ledger-check.mjs
//
// ── ⛔ WHAT THIS TOUCHES ──────────────────────────────────────────────────────────────────────────
// It creates a schema named below, creates ONE table in it, exercises the writer, and DROPS THE SCHEMA
// in the same run. ⛔ It never touches `persona_sotera`, never creates a production table, and never
// runs a migration. ⚠️ If the drop fails it says so LOUDLY — a test schema left behind on a shared box
// is somebody else's confusion tomorrow.
//
// ⭐ The DDL comes from `passLedgerDdl()`, the one definition the host exports, so a test schema and a
// future migration cannot drift apart.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import {
  passLedgerDdl, buildPassLedger, RUN_STATE, A_PASS_IS_NOT_A_COMMITMENT,
} from '../../Backend/app/components/dreaming-pass-host.js'
import { OUTCOME, COMPLETENESS } from '../../Backend/app/components/dreaming-outcome.js'

const { check, done } = makeChecker('dreaming-pass-ledger')
const ok = (c, l, d = '') => check(l, c, d)
const pg = devPg(); await pg.connect()
const query = async (sql, params) => pg.query(sql, params)

const TEST_SCHEMA = 'dreaming_m1_passledger_test'
const PROD = devSchema()

let created = false
try {
  // ── 0 · SETUP, AND THE GUARD THAT KEEPS IT OFF PRODUCTION ──────────────────────────────────────
  ok(TEST_SCHEMA !== PROD, '0 · ⛔ the test schema is NOT the production schema', `${TEST_SCHEMA} ≠ ${PROD}`)
  await query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`)
  await query(`CREATE SCHEMA "${TEST_SCHEMA}"`)
  created = true
  await query(passLedgerDdl(TEST_SCHEMA))

  // ── ⛔ AND PRODUCTION IS UNTOUCHED — asserted, not assumed ───────────────────────────────────────
  //
  // ⚠️⚠️ THIS ASSERTION USED TO READ *"no pass ledger exists in the production schema"* and printed the
  // literal word `absent` whichever way it went. **Migration 034 then created that ledger**, and there is
  // a real pass in it — so the check went red on 2026-09-01 and STAYED red, while its own failure line
  // still said "absent". ⇒ ⭐ it was asserting the ANSWER (there is no such table) instead of the STATE
  // (this check must not be what puts one there), and reporting a constant instead of what it found.
  //
  // ⭐ THE INVARIANT IS THE SAME ONE, EXPRESSED AGAINST TODAY: production's ledger belongs to a MIGRATION,
  // and this run must leave it exactly as it found it. Captured here, compared at the end — ⛔ never a
  // frozen number written into the source.
  const prodLedger = async () => {
    const { rows: t } = await query(
      `SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename = 'log_dreaming_passes'`, [PROD])
    if (!t.length) return { exists: false, rows: null }
    const { rows: n } = await query(`SELECT count(*)::int AS n FROM "${PROD}".log_dreaming_passes`)
    return { exists: true, rows: n[0].n }
  }
  const prodBefore = await prodLedger()
  ok(prodBefore.exists === false || typeof prodBefore.rows === 'number',
    '0 · ⓘ production\'s pass ledger, as this run found it',
    prodBefore.exists ? `${PROD}: present, ${prodBefore.rows} pass(es) — migration 034` : `${PROD}: absent`)

  const ledger = buildPassLedger({ query, schema: TEST_SCHEMA })
  // ⚠️ CONTRACT CHANGE, 2026-09-02 (migration 045): `claim()` now REQUIRES a trigger source, and throws
  // without one. ⛔ No default — a pass whose trigger is unrecorded cannot be stratified afterwards, and
  // this table learned that the hard way when a red-proof's own misfire put two check-passes into the
  // production series with nothing to distinguish them from Dreaming's. ⭐ Every claim here is a CHECK.
  const CLAIM = { triggerSource: 'check' }

  // ── 1 · EXECUTION AND CONCLUSION ARE SEPARATE COLUMNS ──────────────────────────────────────────
  const { rows: cols } = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'log_dreaming_passes'`,
    [TEST_SCHEMA])
  const names = cols.map((c) => c.column_name)
  ok(names.includes('run_state') && names.includes('outcome'),
    '1 · ⭐⭐ EXECUTION (`run_state`) and CONCLUSION (`outcome`) are separate columns — the defect the '
    + 'reflection ledger has, not inherited', 'both present')
  ok(names.includes('m_count') && names.includes('n_count') && names.includes('withheld_count'),
    '1 · ⭐ M, N and withheld are all recorded — withheld beside M, ⛔ never dropped')
  ok(names.includes('eligibility_evaluated_at'),
    '1 · ⭐ the eligibility-evaluation time is recorded — E3 is not stable across reads')
  ok(!names.some((n) => /admissib|e3_|excluded/i.test(n)),
    '1 · ⛔⛔ NO admissibility column — E3 is computed at read time, ⛔ never stamped', names.join(' '))

  // ── 2 · CLAIM → CONCLUDE ────────────────────────────────────────────────────────────────────────
  const p1 = await ledger.claim(CLAIM)
  ok(!!p1?.id, '2 · a pass can be claimed', p1?.id?.slice(0, 8))
  const inFlight = await ledger.read(p1.id)
  ok(inFlight.completed_at === null && inFlight.run_state === null && inFlight.outcome === null,
    '2 · ⭐ in flight means: no completion, no run state, no outcome', 'all three null')

  const c1 = await ledger.conclude({
    id: p1.id, outcome: OUTCOME.notAdmissible, why: '1 of 2 withheld by the boundary',
    M: 2, N: 2, withheld: 1, evaluatedAt: new Date(), boundary: { excludedConversations: 1 },
    rejectedIds: ['56425175-0000-0000-0000-000000000000'],
  })
  ok(c1?.outcome === '6a', '2 · ⭐ a pass concludes 6a with its counts', `${c1?.outcome} ${c1?.completeness}`)
  const done1 = await ledger.read(p1.id)
  ok(done1.run_state === RUN_STATE.ran && done1.outcome === '6a',
    '2 · ⭐⭐ …and both axes are set INDEPENDENTLY — ran, and 6a', `${done1.run_state} / ${done1.outcome}`)
  ok(done1.m_count === 2 && done1.withheld_count === 1 && done1.n_count === 2,
    '2 · ⭐⭐⭐ withheld SURVIVES into the record — 6a stays distinguishable from 6d forever after',
    `M=${done1.m_count} N=${done1.n_count} withheld=${done1.withheld_count}`)
  ok(Array.isArray(done1.rejected_ids) && done1.rejected_ids.length === 1,
    '2 · ⭐ what it rejected is recorded BY IDENTITY', `${done1.rejected_ids?.length} id(s)`)

  // ── 3 · ⭐⭐⭐ A TERMINATED PASS IS NEVER REWRITTEN ─────────────────────────────────────────────
  const again = await ledger.conclude({ id: p1.id, outcome: OUTCOME.nothingDurable, M: 0, N: 0, withheld: 0 })
  ok(again?.refused === true,
    '3 · ⭐⭐⭐ a CONCLUDED pass cannot be concluded again — `completed_at IS NULL` refuses it',
    again?.why ?? 'not refused')
  const unchanged = await ledger.read(p1.id)
  ok(unchanged.outcome === '6a', '3 · …and the original conclusion is intact', unchanged.outcome)

  // ⛔ THE HOLE THE REFLECTION LEDGER HAS, TESTED FROM THE OTHER SIDE: a FAILED pass sets no outcome, so
  // a guard on `outcome IS NULL` would still let a late completion overwrite it. `completed_at` does not.
  const p2 = await ledger.claim(CLAIM)
  await ledger.fail({ id: p2.id, failure: 'model unavailable' })
  const failed = await ledger.read(p2.id)
  ok(failed.run_state === RUN_STATE.failed && failed.outcome === null,
    '3 · ⭐ a FAILED pass has a run state and ⛔ NO outcome — it did not conclude anything',
    `${failed.run_state} / outcome=${failed.outcome}`)
  const lateCompletion = await ledger.conclude({ id: p2.id, outcome: OUTCOME.insufficient, M: 3, N: 3, withheld: 0 })
  ok(lateCompletion?.refused === true,
    '3 · ⭐⭐⭐ …and a LATE COMPLETION cannot overwrite it — the guard `outcome IS NULL` would have let it through',
    lateCompletion?.why ?? '⛔ NOT REFUSED')

  const p3 = await ledger.claim(CLAIM)
  await ledger.fail({ id: p3.id, preempted: true })
  ok((await ledger.read(p3.id)).run_state === RUN_STATE.preempted,
    '3 · preempted is its own run state — ⛔ not a worse failure')

  // ── 4 · THE COMPLETENESS CONTRACT, ENFORCED AT THE WRITE ───────────────────────────────────────
  const p4 = await ledger.claim(CLAIM)
  let refusedB = null
  try { await ledger.conclude({ id: p4.id, outcome: OUTCOME.insufficient, M: 10, N: 4, withheld: 0 }) }
  catch (e) { refusedB = e.message }
  ok(/asserts an absence/.test(refusedB ?? ''),
    '4 · ⛔⛔ 6b is REFUSED at bounded completeness — an incomplete look cannot establish an absence', refusedB)

  let refusedD = null
  try { await ledger.conclude({ id: p4.id, outcome: OUTCOME.nothingDurable, M: 10, N: null, withheld: 0 }) }
  catch (e) { refusedD = e.message }
  ok(/asserts an absence/.test(refusedD ?? ''),
    '4 · ⛔ …and so is 6d when N was never reported', refusedD)

  // ⭐ 6e is exactly what an incomplete look MAY conclude.
  const c4 = await ledger.conclude({ id: p4.id, outcome: OUTCOME.instrument, why: 'bounded(4 of 10)', M: 10, N: 4 })
  ok(c4?.outcome === '6e' && c4?.completeness === COMPLETENESS.bounded,
    '4 · ⭐ 6e is what an incomplete look concludes, and the completeness is stored with it',
    `${c4?.outcome} ${c4?.completeness}`)

  // ── 5 · THE ORDERING CONSTRAINT, ENFORCED RATHER THAN DOCUMENTED ───────────────────────────────
  const p5 = await ledger.claim(CLAIM)
  let refusedOver = null
  try { await ledger.conclude({ id: p5.id, outcome: OUTCOME.notAdmissible, M: 2, N: 2, withheld: 5 }) }
  catch (e) { refusedOver = e.message }
  ok(/withheld is counted WITHIN/.test(refusedOver ?? ''),
    '5 · ⛔ withheld may not exceed M — it is counted WITHIN the eligible population, not beside it', refusedOver)

  let refused6d = null
  try { await ledger.conclude({ id: p5.id, outcome: OUTCOME.nothingDurable, M: 3, N: 3, withheld: 1 }) }
  catch (e) { refused6d = e.message }
  ok(/that is 6a/.test(refused6d ?? ''),
    '5 · ⭐⭐⭐ 6d with something WITHHELD is refused — "nothing exists" and "I was not allowed to look" '
    + 'can never be written as the same conclusion', refused6d)

  // ── 6 · ⛔ IDENTITIES ONLY, NEVER CONTENT ──────────────────────────────────────────────────────
  let refusedContent = null
  try {
    await ledger.conclude({
      id: p5.id, outcome: OUTCOME.notAdmissible, M: 1, N: 1, withheld: 1,
      rejectedIds: ['the user said he prefers English rather than Thai'],
    })
  } catch (e) { refusedContent = e.message }
  ok(/identities, never content/.test(refusedContent ?? ''),
    '6 · ⛔⛔ a rejected item is NAMED, never QUOTED — clause 7, enforced rather than trusted', refusedContent)

  // ── 7 · AN UNKNOWN OUTCOME IS REFUSED, AND THERE IS NO WITHDRAW VERB ───────────────────────────
  let refusedVerb = null
  try { await ledger.conclude({ id: p5.id, outcome: 'withdrawn', M: 1, N: 1 }) }
  catch (e) { refusedVerb = e.message }
  ok(/is not one of/.test(refusedVerb ?? ''),
    '7 · ⛔ O-1: there is no withdraw verb, and the ledger refuses one', refusedVerb)

  // ── 8 · THE STATED INTENT ──────────────────────────────────────────────────────────────────────
  ok(/not a memory/.test(A_PASS_IS_NOT_A_COMMITMENT) && /never rewritten/.test(A_PASS_IS_NOT_A_COMMITMENT),
    '8 · ⭐ the ledger states in words that a pass is not a commitment and is never rewritten')

  // ── ⛔⛔ 9 · AND PRODUCTION IS EXACTLY AS IT WAS ────────────────────────────────────────────────
  // ⭐ The real guarantee, compared rather than assumed: everything above ran against the test schema, so
  // production's ledger must not have gained a table, a row, or a pass. ⛔ Not a number in the source —
  // the baseline this run captured before it started.
  const prodAfter = await prodLedger()
  ok(prodAfter.exists === prodBefore.exists && prodAfter.rows === prodBefore.rows,
    '9 · ⛔⛔ PRODUCTION\'S LEDGER IS UNCHANGED BY THIS RUN — same table state, same pass count',
    `${prodBefore.exists ? prodBefore.rows : 'absent'} → ${prodAfter.exists ? prodAfter.rows : 'absent'}`)
} finally {
  // ── ⛔ CLEANUP, AND IT IS LOUD IF IT FAILS ──────────────────────────────────────────────────────
  if (created) {
    try {
      await query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`)
      const { rows } = await query(`SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`, [TEST_SCHEMA])
      ok(rows.length === 0, '⛔ the test schema was dropped — nothing is left behind on a shared box',
        rows.length ? '⚠️ STILL PRESENT' : 'gone')
    } catch (e) {
      ok(false, '⛔⛔ COULD NOT DROP THE TEST SCHEMA — drop it by hand', e.message)
    }
  }
  await pg.end()
  done()
}
