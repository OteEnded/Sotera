// ⭐⭐⭐ M1 · THE RED-PROOF REGISTER — every M1 guard, attacked deliberately.
//
//   node test/checks/dreaming-m1-check.mjs
//
// ⭐⭐ WRITTEN BEFORE THE IMPLEMENTATION, ON PURPOSE. Ote, 2026-09-02: *"Red-proofs first. Then build."*
// ⇒ on its first run most of these are RED, and that is the point: a guard that has never refused
// anything is a guard nobody has tested, and a check written after the code tends to assert what the
// code already does.
//
// ── ⛔ WHAT THIS TOUCHES ──────────────────────────────────────────────────────────────────────────
//   ✅ creates ONE schema (named below), creates the pass ledger in it, and DROPS it in the same run
//   ✅ reads the live corpus — `log_conversation_revisits` ⋈ `txn_conversations`
//   ⛔ writes NOTHING to `persona_sotera`. ⭐ The real pass it runs is pointed at the TEST ledger, so
//      this check can never add a row to the production pass series the O-iii.a measurement reads.
//   ⛔ no memory · no reflection · no conversation · no message · no embedding · no setting
//   ⛔ `56425175` is neither released, re-excluded, nor reclassified — Ote: *"do not make the fixture
//      disappear to make a test green."*
//
// ── ⚠️ AND IT MUST LOAD EVEN WHEN THE CODE DOES NOT EXIST YET ────────────────────────────────────
// A red-proof file that dies on an unresolvable import prints nothing, and **silence from something
// that normally prints reads as "nothing to report"** — a mistake that cost 45 minutes yesterday.
// ⇒ anything that may not exist yet is loaded by DYNAMIC import inside a try, and its absence is
// reported as its own named FAIL rather than as an empty log.

import { readFileSync, existsSync } from 'node:fs'
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { passLedgerDdl, buildPassLedger, RUN_STATE, TRIGGER_SOURCES } from '../../Backend/app/components/dreaming-pass-host.js'
import { OUTCOME, COMPLETENESS, concludeFrom } from '../../Backend/app/components/dreaming-outcome.js'
import { runOnePass } from '../../Backend/app/components/dreaming-host.js'

const { check, done } = makeChecker('dreaming-m1')
const pg = devPg(); await pg.connect()
const query = async (sql, params) => pg.query(sql, params)
const one = async (sql, params) => (await query(sql, params)).rows[0] ?? null

const TEST_SCHEMA = 'dreaming_m1_redproof_test'
const PROD = devSchema()
const S = `"${PROD}"`
const T = `"${TEST_SCHEMA}"."log_dreaming_passes"`

const COMPONENTS = new URL('../../Backend/app/components/', import.meta.url)
const src = (name) => {
  const u = new URL(name, COMPONENTS)
  return existsSync(u) ? readFileSync(u, 'utf8') : null
}

/**
 * ⭐⭐ CODE WITH THE COMMENTARY REMOVED — because a boundary scan must read what a module DOES, not what
 * it says about itself.
 *
 * ⚠️⚠️ THIS FILE HIT THE SAME DEFECT TWICE IN ONE RUN. First `dreaming-eligibility` *mentioned*
 * `conversation-search` in a sentence and the scan called it a violation; then `dreaming-gate` — whose
 * entire purpose is to never touch `getSetting`, `mst_settings` or `fastify.db` — went red because it
 * NAMES all three while explaining why it avoids them. ⇒ ⭐ the better a module documents its boundary,
 * the more a naive text scan accuses it. That is a scanner defect, ⛔ never a code defect.
 *
 * ⓘ Deliberately crude: it also blanks the tail of any string containing `//`. That is harmless here —
 * every assertion built on it is an ABSENCE check, and blanking can only make an absence easier to
 * satisfy, so it is checked against a positive control (the gate's own comparison must survive).
 */
const codeOnly = (text) => String(text ?? '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[^\n]*?\/\/.*$/gm, (line) => line.slice(0, line.indexOf('//')))

/**
 * ⭐⭐ CODE WITH THE COMMENTARY **AND THE STRING LITERALS** REMOVED — for asking whether a module can
 * REACH something, which is a question about identifiers and never about text.
 *
 * ⚠️ THE THIRD INSTANCE IN ONE RUN, and the sharpest: `dreaming-gate` exports
 * `DREAMING_IS_OFF_UNTIL_TWO_DELIBERATE_ACTS`, a prose constant that says *"it cannot read
 * mst_settings"* — a STRING, not a comment, so `codeOnly` kept it and the scan indicted the module for
 * documenting its own boundary. ⓘ Every component in this codebase exports such a constant deliberately,
 * *"so a check can assert the INTENT, not merely the branching"* — which makes this a systematic trap,
 * not a one-off.
 *
 * ⛔ NOT USED FOR THE WRITE-TARGET SCAN: that one reads SQL, which lives inside template literals, so
 * blanking strings would make it vacuous. ⭐ Two questions, two scanners — the same lesson as prose vs
 * imports, one level down.
 */
const identifiersOnly = (text) => codeOnly(text)
  .replace(/`(?:[^`\\]|\\.)*`/g, '``')
  .replace(/'(?:[^'\\]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\]|\\.)*"/g, '""')

/** ⛔ A refusal must be a NAMED refusal, never a throw and never a silent success. */
const refusedShape = (r) => Boolean(r) && r.refused === true && typeof r.why === 'string' && r.why.length > 0

/** ⭐ Did this throw? Used where a THROW is the correct behaviour — a missing required argument. */
const throwsSync = async (fn) => { try { await fn(); return false } catch { return true } }

/**
 * ⭐ Did the DATABASE refuse this statement? Wrapped in a transaction that is ALWAYS rolled back, so a
 * red-proof can never leave behind the row it was proving impossible.
 */
const refuses = async (sql) => {
  await query('BEGIN')
  let refused = false
  try { await query(sql) } catch { refused = true }
  await query('ROLLBACK')
  return refused
}

let created = false
try {
  // ══ 0 · SETUP AND THE GUARDS THAT KEEP THIS OFF PRODUCTION ═════════════════════════════════════
  check('0 · ⛔ the test schema is NOT the production schema', TEST_SCHEMA !== PROD, `${TEST_SCHEMA} ≠ ${PROD}`)
  await query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`)
  await query(`CREATE SCHEMA "${TEST_SCHEMA}"`)
  created = true
  await query(passLedgerDdl(TEST_SCHEMA))

  // ⭐ Captured, never hard-coded. The production ledger belongs to migration 034 and to the cron lane;
  // this run must leave it exactly as it found it. ⛔ Asserting a NUMBER here would go red the first
  // time a real pass ran — the dateless-absence mistake, one layer up.
  const prodPasses = async () => (await one(`SELECT count(*)::int AS n FROM ${S}.log_dreaming_passes`))?.n
  const prodPassesBefore = await prodPasses()
  check('0 · ⓘ production pass ledger, as this run found it', Number.isInteger(prodPassesBefore),
    `${prodPassesBefore} pass(es) — compared again at the end`)

  const ledger = buildPassLedger({ query, schema: TEST_SCHEMA })
  const rowsIn = async () => (await one(`SELECT count(*)::int AS n FROM ${T}`))?.n
  const wholeRow = async (id) => (await one(`SELECT to_jsonb(t) AS r FROM ${T} t WHERE id = $1::uuid`, [id]))?.r

  // ══ A · THE LEDGER GUARDS — R1…R8 ══════════════════════════════════════════════════════════════

  // ── R1 · ⭐⭐ A SECOND CLAIM WHILE ONE IS IN FLIGHT MUST BE REFUSED ─────────────────────────────
  // ⛔ Two overlapping passes would each count M independently and both write, so the ledger would hold
  // two records of what was really one look. ⭐ And the refusal must leave NO ROW: "refused" that still
  // inserts is the same defect wearing an apology.
  const first = await ledger.claim({ triggerSource: 'check' })
  const beforeSecond = await rowsIn()
  let second = null
  try { second = await ledger.claim({ triggerSource: 'check' }) } catch (e) { second = { threw: e.message } }
  const afterSecond = await rowsIn()
  check('R1 · ⭐⭐ a second claim while one is IN FLIGHT is refused', refusedShape(second),
    `got ${JSON.stringify(second)}`)
  check('R1 · ⛔ and the refusal inserted NOTHING', afterSecond === beforeSecond,
    `${beforeSecond} → ${afterSecond}`)

  // ── R3 · ⛔ A TERMINATED PASS IS NEVER REWRITTEN, COMPARED FIELD BY FIELD ───────────────────────
  // ⚠️ `conclude()` returning `{refused:true}` is not enough on its own: "0 rows updated" and "the row
  // is unchanged" are different claims, and only the second is the guarantee. ⇒ compare the whole row.
  await ledger.conclude({ id: first.id, outcome: OUTCOME.nothingDurable, why: 'r3 setup', M: 0, N: 0, withheld: 0 })
  const r3Before = await wholeRow(first.id)
  const r3Again = await ledger.conclude({ id: first.id, outcome: OUTCOME.instrument, why: 'r3 attack', M: 5, N: 1, withheld: 0 })
  const r3After = await wholeRow(first.id)
  check('R3 · ⛔ concluding a terminated pass is refused', refusedShape(r3Again), JSON.stringify(r3Again))
  check('R3 · ⭐ and the row is BYTE-IDENTICAL — ⛔ not merely "0 rows"',
    JSON.stringify(r3Before) === JSON.stringify(r3After))

  // ── R4 · the same for `fail()` ─────────────────────────────────────────────────────────────────
  const r4Again = await ledger.fail({ id: first.id, failure: 'r4 attack' })
  const r4After = await wholeRow(first.id)
  check('R4 · ⛔ failing a terminated pass is refused, and the row is unchanged',
    refusedShape(r4Again) && JSON.stringify(r4After) === JSON.stringify(r3Before), JSON.stringify(r4Again))

  // ── R2 · ⭐ A STALE IN-FLIGHT CLAIM IS PREEMPTED, AND A PREEMPTED PASS CONCLUDED NOTHING ────────
  // ⚠️ A killed process cannot run its own `catch`, so an in-flight row can outlive its runner forever —
  // and a lane that goes silent for exactly the runs that fail is the trap the reflection ledger paid
  // for. ⭐ `preempted` already exists in RUN_STATE and has never been used; this is what it is for.
  // ⛔ AND THE BOUND IS CRASH RECOVERY, NEVER AN ADMISSION WINDOW (Ote's ruling). Correctness cannot
  // depend on it: preempting too early can only LOSE a pass, never corrupt one.
  const stale = await one(
    `INSERT INTO ${T} (created_at, started_at, trigger_source)
     VALUES (now() - interval '90 minutes', now() - interval '90 minutes', 'check')
     RETURNING id::text AS id`)
  let afterStale = null
  try { afterStale = await ledger.claim({ triggerSource: 'check' }) } catch (e) { afterStale = { threw: e.message } }
  const staleRow = await wholeRow(stale.id)
  check('R2 · ⭐ a claim behind a STALE in-flight pass succeeds', Boolean(afterStale?.id),
    `got ${JSON.stringify(afterStale)}`)
  check('R2 · ⭐⭐ the stale row is marked preempted and terminated',
    staleRow?.run_state === RUN_STATE.preempted && staleRow?.completed_at !== null,
    `run_state=${staleRow?.run_state} completed_at=${staleRow?.completed_at ?? 'null'}`)
  check('R2 · ⛔⛔ and its `outcome` stays NULL — a preempted pass concluded NOTHING',
    staleRow?.outcome === null, `outcome=${staleRow?.outcome ?? 'null'}`)
  if (afterStale?.id) {
    await ledger.conclude({ id: afterStale.id, outcome: OUTCOME.nothingDurable, why: 'r2 teardown', M: 0, N: 0, withheld: 0 })
  }

  // ── R5…R8 · THE WRITE-TIME GATES. ⭐ At the WRITE, not in the caller — put the rule in a caller and
  // the next caller is written without it.
  //
  // ⚠️⚠️ EACH ATTACK TERMINATES THE ROW IT CLAIMED, AND THAT LINE IS NOT HOUSEKEEPING. Without it every
  // refused `conclude()` leaves an in-flight row behind, and the in-flight guard from R1 then correctly
  // refuses every later pass in this file. ⓘ It did exactly that on the first green-ward run — the
  // guard catching the TEST's untidiness, which is a small proof that the guard is real.
  const attack = async (args) => {
    const id = (await ledger.claim({ triggerSource: 'check' })).id
    let threw = false
    try { await ledger.conclude({ id, ...args }) } catch { threw = true }
    await ledger.fail({ id, failure: 'red-proof attack, terminated' }).catch(() => {})
    return threw
  }
  check('R5 · ⛔ 6d with withheld > 0 is refused — that is 6a',
    await attack({ outcome: OUTCOME.nothingDurable, M: 3, N: 3, withheld: 1 }))
  check('R6 · ⛔⛔ 6b at `bounded` is refused — an incomplete look may not assert an ABSENCE',
    await attack({ outcome: OUTCOME.insufficient, M: 5, N: 2, withheld: 0 }))
  check('R6 · ⛔ and 6d at `bounded` is refused for the same reason',
    await attack({ outcome: OUTCOME.nothingDurable, M: 5, N: 2, withheld: 0 }))
  check('R7 · ⛔ withheld > M is refused — withheld is counted WITHIN the eligible population',
    await attack({ outcome: OUTCOME.notAdmissible, M: 2, N: 2, withheld: 3 }))
  check('R8 · ⛔ rejected_ids carrying CONTENT is refused — identities only, never quotes',
    await attack({
      outcome: OUTCOME.notAdmissible, M: 2, N: 2, withheld: 1,
      rejectedIds: ['this is a sentence she said, not an identity'],
    }))
  check('R8 · ⛔ and no attack left a row in flight — an abandoned claim would block the lane',
    (await one(`SELECT count(*)::int AS n FROM ${T} WHERE completed_at IS NULL`))?.n === 0)

  // ── R23 · ⭐⭐⭐ EVERY PASS SAYS WHAT TRIGGERED IT ──────────────────────────────────────────────
  // ⚠️⚠️ THIS GROUP EXISTS BECAUSE OF WHAT THIS FILE DID TO ITSELF. Its first run's source-regex
  // misfired, two real passes went into the production series, and NOTHING IN THE LEDGER COULD TELL
  // THEM APART from Dreaming's own. ⭐ The lesson is not "be more careful with regexes" — it is that
  // **the boundary is "write it, LABELLED", never "hope it never writes"**, which is exactly the
  // harness-identity principle Ote ratified for the reflection lane.
  check('R23 · ⭐ `claim()` with NO triggerSource THROWS — ⛔ no silent default',
    await throwsSync(() => ledger.claim({})))
  check('R23 · ⛔ and an INVENTED trigger throws too — a closed vocabulary',
    await throwsSync(() => ledger.claim({ triggerSource: 'zz_invented' })))
  check('R23 · ⛔ an explicit null is refused as well',
    await throwsSync(() => ledger.claim({ triggerSource: null })))
  check('R23 · ⭐ the vocabulary is the one 042 already uses — ⛔ not a second spelling',
    TRIGGER_SOURCES.join(' ') === 'cron manual check legacy', TRIGGER_SOURCES.join(' '))
  const unlabelled = await one(
    `SELECT count(*)::int AS n FROM ${S}.log_dreaming_passes WHERE trigger_source IS NULL`)
  check('R23 · ⭐⭐ NOT ONE production pass row is unlabelled', unlabelled?.n === 0, `${unlabelled?.n} row(s)`)
  // ⭐ And the two rows this check's own earlier defect wrote are labelled as what they were.
  const byTrigger = await query(
    `SELECT trigger_source, count(*)::int AS n FROM ${S}.log_dreaming_passes GROUP BY 1 ORDER BY 1`)
  check('R23 · ⓘ the production pass series, by trigger', byTrigger.rows.length > 0,
    byTrigger.rows.map((r) => `${r.trigger_source}=${r.n}`).join(' '))
  // ⛔⛔ THE DATABASE HALF, NOT JUST THE APPLICATION GUARD. This is where 042 is weaker than it reads:
  // its CHECK admits a NULL because a CHECK passes when its expression is NULL. ⭐ Attempted here, on
  // THIS table, rather than assumed from the DDL text.
  check('R23 · ⛔⛔ the DATABASE refuses a pass row with no trigger_source — 042\'s hole, not repeated',
    await refuses(`INSERT INTO ${T} (created_at) VALUES (now())`))
  check('R23 · ⛔ and refuses an explicit NULL by the same route',
    await refuses(`INSERT INTO ${T} (created_at, trigger_source) VALUES (now(), NULL)`))
  check('R23 · ⛔ and refuses an invented value',
    await refuses(`INSERT INTO ${T} (created_at, trigger_source) VALUES (now(), 'zz_invented')`))

  // ── R18 · ⛔ NO ADMISSIBILITY COLUMN, AND 045 IS EXACTLY WHEN THAT COULD BREAK ──────────────────
  const stamped = await one(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'log_dreaming_passes'
        AND (column_name ~* '^(e3|admissib|excluded)' OR column_name ~* 'admissible')`, [PROD])
  check('R18 · ⛔ production\'s ledger carries NO admissibility column — E3 is computed, never stamped',
    stamped?.n === 0, `${stamped?.n} such column(s)`)
  const axes = await one(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'log_dreaming_passes'
        AND column_name IN ('run_state','outcome')`, [PROD])
  check('R18 · ⭐ execution and conclusion are still TWO columns', axes?.n === 2, `found ${axes?.n}`)
  const timing = await one(
    `SELECT data_type FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'log_dreaming_passes' AND column_name = 'view_read_us'`, [PROD])
  const hasTiming = timing?.data_type === 'integer'
  check('R18 · ⭐ `view_read_us` exists (migration 045) — O-iii.a measured, not argued',
    hasTiming, `type=${timing?.data_type ?? 'ABSENT'}`)
  // ⭐ And it must be NULL-SAFE. 044's lesson: a CHECK PASSES when its expression is NULL, so the
  // nullness has to be tested explicitly inside the constraint rather than implied by the comparison.
  //
  // ⛔⛔ INSIDE A TRANSACTION THAT IS ALWAYS ROLLED BACK. Two reasons, and the second is the one that
  // matters: if the constraint is MISSING, the insert SUCCEEDS — and this red-proof would then be the
  // thing that put a junk row in the production pass ledger. A red-proof must never be able to cause
  // the damage it is testing for.
  // ⚠️ AND IT IS SKIPPED WHEN THE COLUMN IS ABSENT, because an insert that fails with *"column does not
  // exist"* would report REFUSED and go green for entirely the wrong reason — a false pass dressed as a
  // guarantee.
  if (hasTiming) {
    let negRefused = false
    await query('BEGIN')
    try {
      await query(`INSERT INTO ${S}.log_dreaming_passes (created_at, trigger_source, view_read_us) VALUES (now(), 'check', -1)`)
    } catch { negRefused = true }
    await query('ROLLBACK')
    check('R18 · ⛔ a NEGATIVE view_read_us is refused by the database', negRefused)
  } else {
    check('R18 · ⛔ a NEGATIVE view_read_us is refused by the database', false,
      'not exercised — the column does not exist yet')
  }
  check('R18 · ⛔⛔ and production\'s ledger is untouched by this check',
    (await prodPasses()) === prodPassesBefore, `${prodPassesBefore} → ${await prodPasses()}`)
  // ⭐ The test-schema DDL and the migration must not drift — one definition, two consumers.
  check('R18 · ⭐ `passLedgerDdl()` declares view_read_us too — ⛔ the test schema must not drift from 045',
    /view_read_us/.test(passLedgerDdl('x')))

  // ══ B · COMPLETENESS AND ONE SPELLING OF THE ORDERING — R9…R12 ═════════════════════════════════
  // ⭐⭐ THE REAL PASS RUNS HERE, AND ITS LEDGER IS THE TEST SCHEMA. The corpus it reads is LIVE, which
  // is the point; the row it writes is not, which is what keeps this check out of the production series.
  //
  // ⛔⛔ AND IT IS NOT RUN AT ALL UNTIL THE HOST CAN ACCEPT AN INJECTED LEDGER. On the first (red) run
  // `runOnePass` still builds its own ledger from `schema`, so calling it here would write REAL pass
  // rows into production — the red-proof causing the exact contamination it exists to forbid.
  // ⭐ So the capability is asserted from SOURCE first, and when it is absent the whole group reports
  // red as *not exercised*. ⚠️ A skipped assertion must read as FAILED, never as passed: nothing is
  // more dangerous in a boundary suite than a guard that goes quiet.
  const hostSrc = src('dreaming-host.js') ?? ''
  check('R11 · ⭐ the host source was found — ⛔ a scan that lost its anchor proves nothing',
    hostSrc.length > 0)
  // ⛔⛔ ASKED OF THE MODULE, NOT OF ITS TEXT — and this is the correction that matters most in this
  // file. The first version was `/ledger\s*=\s*buildPassLedger\(/`, which matched the host's OWN
  // INTERNAL LINE, returned true, and let the passes below run against the PRODUCTION ledger. ⇒ two
  // real pass rows entered the series that this very red-proof existed to keep them out of.
  // ⭐ A capability is now DECLARED by the module that has it: a source regex cannot tell a parameter
  // from a local, and that difference was the entire guarantee.
  let deps = null
  try { deps = (await import('../../Backend/app/components/dreaming-host.js')).RUN_ONE_PASS_DEPS } catch { deps = null }
  check('B0 · ⭐⭐⭐ the host DECLARES what may be injected — ⛔ never inferred from its text',
    Array.isArray(deps), `RUN_ONE_PASS_DEPS=${JSON.stringify(deps)}`)
  const canInjectLedger = Array.isArray(deps) && deps.includes('ledger')
  const canBound = Array.isArray(deps) && deps.includes('limit')
  check('B0 · ⭐⭐ the host accepts an INJECTED ledger — the read/write seam, and what keeps this check off production',
    canInjectLedger)
  check('B0 · ⭐ the host accepts a `limit`, so an incomplete look is reachable honestly', canBound)

  const beforeAll = await snapshot()
  let bounded = null
  let full = null
  if (canInjectLedger) {
    bounded = await runOnePass({ query, schema: PROD, ledger, dryRun: true, limit: 3 })
    full = await runOnePass({ query, schema: PROD, ledger, dryRun: true })
  } else {
    check('B0 · ⛔ the passes were NOT RUN — refusing to write to the production ledger to satisfy a test',
      false, 'R9/R10/R12/R13/R14 report red below as not exercised')
  }
  check('R9 · ⭐⭐ a bounded read concludes 6e — an instrument that cannot say what it examined concludes NOTHING else',
    bounded?.outcome === OUTCOME.instrument, `outcome=${bounded?.outcome} why=${bounded?.why}`)
  check('R9 · ⭐ N is BELOW M and both are recorded', Number.isInteger(bounded?.N) && bounded.N < bounded.M,
    `N=${bounded?.N} M=${bounded?.M}`)
  check('R9 · ⭐ completeness is `bounded`', bounded?.written?.completeness === COMPLETENESS.bounded,
    `completeness=${bounded?.written?.completeness}`)
  // ⚠️ `bounded?.outcome !== '6a'` alone would go GREEN when the pass never ran at all — a false pass of
  // exactly the kind this file has already produced once. The pass must have HAPPENED for its outcome
  // to mean anything.
  check('R9 · ⛔⛔ and it did NOT conclude 6a — completeness OUTRANKS withheld',
    Boolean(bounded?.outcome) && bounded.outcome !== OUTCOME.notAdmissible,
    bounded?.outcome ? `outcome=${bounded.outcome}` : 'not exercised — no pass ran')

  check('R10 · ⭐ an unbounded read is `exhaustive`', full?.written?.completeness === COMPLETENESS.exhaustive,
    `N=${full?.N} M=${full?.M} completeness=${full?.written?.completeness}`)
  check('R10 · ⭐⭐ M = admitted + withheld — the ordering constraint, mechanical',
    full?.M === full?.admitted + full?.withheld, `${full?.M} = ${full?.admitted} + ${full?.withheld}`)
  check('R10 · ⭐ the live corpus still yields 6a with withheld ≥ 1 (56425175 · #656) — ⛔ the fixture was not made to disappear',
    full?.outcome === OUTCOME.notAdmissible && full?.withheld >= 1,
    `outcome=${full?.outcome} withheld=${full?.withheld}`)
  check('R10 · ⭐ and the pass TIMED its own view read', Number.isInteger(full?.viewReadUs) && full.viewReadUs >= 0,
    `view_read_us=${full?.viewReadUs}`)

  // ── R11 · ⛔ N IS MEASURED, NEVER ASSUMED.
  check('R11 · ⭐ the `const N =` anchor is present', hostSrc.includes('const N ='), 'anchor: `const N =`')
  check('R11 · ⭐⭐ N comes from `fetched.length` — ⛔ never set equal to M by construction',
    /const N = fetched\.length/.test(hostSrc))

  // ── R12 · ⭐⭐⭐ ONE SPELLING OF THE ORDERING. `concludeFrom()` owns it; M1's ONLY licensed deviation
  // is the no-reasoner 6b → 6e narrowing.
  check('R12 · ⭐ the host CALLS concludeFrom — ⛔ it does not re-spell the ordering',
    /concludeFrom\(/.test(hostSrc))
  for (const dup of ['withheld > 0', 'M === 0']) {
    check(`R12 · ⛔ the host holds no second spelling of \`${dup}\``, !hostSrc.includes(dup))
  }
  for (const [label, r] of [['bounded', bounded], ['full', full]]) {
    const ordered = concludeFrom({ M: r?.M, N: r?.N, withheld: r?.withheld })
    const expected = ordered.outcome === OUTCOME.insufficient ? OUTCOME.instrument : ordered.outcome
    check(`R12 · ⭐⭐ the ${label} pass agrees with concludeFrom (6b → 6e substitution aside)`,
      r?.outcome === expected, `concludeFrom=${ordered.outcome} expected=${expected} got=${r?.outcome}`)
  }

  // ══ C · THE BOUNDARY — R13…R19 ═════════════════════════════════════════════════════════════════
  // ⚠️ EQUALITY PROVES NOTHING IF NOTHING RAN. Every one of these is reported red unless two real
  // passes actually happened — "unchanged" across an operation that never occurred is not evidence.
  const exercised = Boolean(bounded && full)
  const afterAll = await snapshot()
  for (const k of Object.keys(beforeAll)) {
    check(`R13 · ⛔ ${k} is UNCHANGED across two real passes`,
      exercised && String(beforeAll[k]) === String(afterAll[k]),
      exercised ? `${beforeAll[k]} → ${afterAll[k]}` : 'not exercised — no pass ran')
  }

  // ── R14 · ⭐⭐ P1'S OWN WINDOW, RUN BEFORE AND AFTER. ⛔ Not a proxy — the actual predicate, because
  // the question is whether P1's POPULATION moved, and only P1's predicate answers that.
  check('R14 · ⭐⭐⭐ P1\'s Gen-2 window count is unchanged — ⛔ M1 cannot enter the retention experiment',
    exercised && String(beforeAll.p1Window) === String(afterAll.p1Window),
    exercised ? `${beforeAll.p1Window} → ${afterAll.p1Window}` : 'not exercised — no pass ran')

  // ── R15 + R16 · ⭐⭐⭐ THE TRANSITIVE IMPORT CLOSURE OF THE M1 PATH ────────────────────────────
  // ⛔ A KEYWORD SCAN IS NOT ENOUGH — it sees the file in front of it and misses an import three levels
  // down. ⚠️ And an allowlist silently drops what it was not told, so the closure is asserted NON-EMPTY
  // and asserted to CONTAIN its core before anything is concluded from it being a subset.
  const closure = (() => {
    const seen = new Set()
    const walk = (name) => {
      if (seen.has(name)) return
      const text = src(name)
      seen.add(name)
      if (text == null) return
      for (const m of text.matchAll(/from\s+'(\.\/[^']+)'/g)) walk(m[1].replace('./', ''))
    }
    walk('dreaming-host.js')
    return seen
  })()
  const ALLOWED = new Set([
    'dreaming-host.js', 'dreaming-eligibility.js', 'dreaming-outcome.js', 'dreaming-pass-host.js',
    'corpus-eligibility.js', 'dreaming-gate.js',
  ])
  const CORE = ['dreaming-host.js', 'dreaming-eligibility.js', 'dreaming-outcome.js', 'dreaming-pass-host.js']
  check('R15 · ⭐ the closure resolved and is non-vacuous', closure.size >= CORE.length, `${closure.size} module(s)`)
  for (const c of CORE) check(`R15 · ⭐ the closure contains ${c}`, closure.has(c))
  const strays = [...closure].filter((c) => !ALLOWED.has(c))
  check('R15 · ⭐⭐⭐ NOTHING outside the M1 allowlist is reachable from the M1 path',
    strays.length === 0, strays.length ? `stray: ${strays.join(', ')}` : [...closure].join(' '))

  // ⛔⛔ HAZARD ① — the contamination route no table count would catch. `recall()` bumps
  // access_count/last_access, which RE-RANKS what the Composer injects on her next ordinary turn ⇒
  // changes what she says ⇒ changes what a later reflection reflects ON.
  // ⚠️ A COMMENT IS NOT AN IMPORT, and this check's own first run proved it: `dreaming-eligibility`
  // MENTIONS `conversation-search` in a sentence explaining why E3 is sound-but-not-complete, and a
  // flat text scan called that a boundary violation. ⇒ ⭐ two questions, asked separately, because they
  // ARE two: what does the path IMPORT (reachability), and what does it CALL (behaviour).
  const closureText = [...closure].map((c) => src(c) ?? '').join('\n')
  check('R15 · ⭐ the closure text was actually read', closureText.length > 2000, `${closureText.length} chars`)

  const imported = [...closureText.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
  check('R15 · ⭐ imports were found at all — ⛔ else the next assertions are vacuous',
    imported.length > 0, imported.join(' '))
  for (const f of ['memory-v2-host', 'own-memory-host', 'memory-store-sequelize-host', 'retention-host',
    'reflection-lifecycle', 'conversation-search', 'memory-consolidate', 'memory-dream',
    'memory-card-resolver', 'context-composer', 'memory-conflict']) {
    check(`R15 · ⛔⛔ the M1 path never IMPORTS \`${f}\``, !imported.some((i) => i.includes(f)))
  }
  // ⛔⛔ HAZARD ① — the contamination route no table count would catch. `recall()` bumps
  // access_count/last_access, which RE-RANKS what the Composer injects on her next ordinary turn ⇒
  // changes what she says ⇒ changes what a later reflection reflects ON.
  // ⭐ Comments stripped for the same reason the gate's scan strips them: these modules DOCUMENT the
  // boundary they keep, and a module that explains what it must not call would otherwise indict itself.
  const closureCode = identifiersOnly(closureText)
  check('R15 · ⭐⭐ the stripper kept the closure\'s real code — ⛔ else every absence below is vacuous',
    closureCode.includes('const N = fetched.length') && closureCode.includes('partitionByE3('))
  for (const f of ['.recall(', '.touch(', 'buildMemoryV2(', 'reinforce(']) {
    check(`R15 · ⛔⛔ the M1 path never CALLS \`${f}\``, !closureCode.includes(f))
  }

  // R16 · ⛔ ONE WRITE TARGET. Every INSERT/UPDATE/DELETE in the closure must name the pass ledger.
  const writes = [...closureText.matchAll(/\b(INSERT INTO|UPDATE|DELETE FROM)\s+([^\s(]+)/gi)]
    .map((m) => `${m[1]} ${m[2]}`)
  const badWrites = writes.filter((w) => !/log_dreaming_passes|\$\{T\}|\$\{t\}/.test(w))
  check('R16 · ⭐ write statements were found at all — ⛔ else this assertion is vacuous', writes.length > 0,
    `${writes.length} statement(s)`)
  check('R16 · ⭐⭐⭐ every write in the M1 path targets log_dreaming_passes and nothing else',
    badWrites.length === 0, badWrites.join(' | ') || writes.join(' | '))

  // R17 · E3 IS COMPUTED, NEVER STAMPED — the guard refuses a stamped act record loudly.
  const { assertNotStamped } = await import('../../Backend/app/components/dreaming-eligibility.js')
  let stampedThrew = false
  try { assertNotStamped({ id: 'x', e3_admissible: true }) } catch { stampedThrew = true }
  check('R17 · ⛔ an act record carrying a stored admissibility field is REFUSED', stampedThrew)

  // R19 · ⛔ O-8 · TWO CONSUMERS, KEPT APART BY CONSTRUCTION — scanned BOTH ways, each way anchored.
  const consolidate = src('memory-consolidate-host.js')
  check('R19 · ⭐ the Consolidation source was found — ⛔ else the mutual scan is vacuous', consolidate != null)
  check('R19 · ⛔ Consolidation never reaches Dreaming', !(consolidate ?? '').includes('dreaming-'))

  // ══ D · THE GATE — R20…R22 ═════════════════════════════════════════════════════════════════════
  let gate = null
  try { gate = (await import('../../Backend/app/components/dreaming-gate.js')).dreamingCronEnabled } catch { gate = null }
  check('R20 · ⭐ `dreaming-gate.js` exports dreamingCronEnabled', typeof gate === 'function')
  if (typeof gate === 'function') {
    // ⭐⭐ THE STRING-`"true"` TRAP EXPLICITLY. A config read from a file, an env var or a settings row
    // can carry `"true"`, `1` or `"1"`, and `==`-style truthiness would activate Dreaming on any of them.
    for (const v of [undefined, null, false, 0, 1, '', 'true', 'yes', 'on', {}, []]) {
      check(`R20 · ⛔ \`${JSON.stringify(v) ?? 'undefined'}\` does NOT enable Dreaming`,
        gate({ memory: { dreamingEnabled: v } }) === false)
    }
    check('R20 · ⛔ an absent memory block does not enable Dreaming', gate({}) === false)
    check('R20 · ⛔ and neither does an absent config', gate(undefined) === false)
    check('R20 · ⭐ ONLY boolean true enables it', gate({ memory: { dreamingEnabled: true } }) === true)
  }

  // ── R21 · ⭐⭐ THE SETTING IS ABSENT TODAY, so the job is never REGISTERED — ⛔ not registered and
  // returning early. ⓘ This asserts the gate's INPUT (config.json) and the cron source's SHAPE; it is
  // ⛔ not an introspection of the running process, and it does not claim to be.
  const cfgRaw = readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8')
  const cfg = JSON.parse(cfgRaw)
  check('R21 · ⭐⭐⭐ `memory.dreamingEnabled` is ABSENT from config.json — Dreaming is inert',
    cfg?.memory?.dreamingEnabled === undefined, `value=${JSON.stringify(cfg?.memory?.dreamingEnabled)}`)
  const cronSrc = readFileSync(new URL('../../Backend/app/plugins/cron.js', import.meta.url), 'utf8')
  check('R21 · ⭐ the cron plugin registers exactly ONE dreaming job',
    (cronSrc.match(/createJob\(\s*'dreaming'/g) ?? []).length === 1)
  check('R21 · ⭐⭐ and its registration sits behind the gate predicate',
    /if\s*\(\s*dreamingCronEnabled\(\s*fastify\.config\s*\)\s*\)/.test(cronSrc))
  check('R21 · ⛔ the dreaming job is NOT on the boot pass', !/retentionPass[\s\S]{0,400}dreaming/.test(cronSrc))

  // ── R22 · ⛔⛔ THE GATE MUST NOT BE FLIPPABLE FROM THE ADMIN SURFACE ────────────────────────────
  // `mst_settings` OVERRIDES `config.json` for effective settings elsewhere in this app. A gate that
  // read the effective setting could therefore be switched on from the UI, with no restart and no
  // review. ⇒ it reads `fastify.config` only, so activation costs a file edit AND a restart.
  const gateSrc = src('dreaming-gate.js') ?? ''
  const gateCode = identifiersOnly(gateSrc)
  check('R22 · ⭐ the gate source was found — ⛔ else this assertion is vacuous', gateSrc.length > 0)
  // ⭐⭐⭐ THE STRUCTURAL GUARANTEE, AND IT IS STRONGER THAN ANY ABSENCE LIST: the gate IMPORTS NOTHING.
  // A module with no imports cannot reach a database, a settings table, or anything else — and unlike a
  // list of forbidden names, this one does not have to be kept up to date with what to forbid.
  // ⚠️ An allowlist drops what it was not told; a zero-import assertion has nothing to be told.
  check('R22 · ⭐⭐⭐ the gate imports NOTHING — it cannot reach a settings table by any route',
    [...gateSrc.matchAll(/^\s*import\s/gm)].length === 0)
  // ⭐ THE POSITIVE CONTROL. The stripper blanks text, so every absence below could be satisfied by a
  // stripper that blanked too much. ⛔ Without this, the assertions after it could pass against an
  // empty string.
  check('R22 · ⭐⭐ the stripper kept the gate\'s actual comparison — ⛔ else every absence below is vacuous',
    gateCode.includes('config?.memory?.dreamingEnabled === true'))
  for (const f of ['getSetting', 'mst_settings', 'fastify.db', 'sequelize', 'query(']) {
    check(`R22 · ⛔ the gate never reaches \`${f}\``, !gateCode.includes(f))
  }
  const settingRow = await one(
    `SELECT count(*)::int AS n FROM ${S}.mst_settings WHERE key ILIKE '%dreaming%'`)
  check('R22 · ⓘ no `dreaming` settings row exists either', settingRow?.n === 0, `${settingRow?.n} row(s)`)

  // ══ E · ⛔ AND THE EXCLUSION FIXTURE IS EXACTLY AS IT WAS ═══════════════════════════════════════
  // Ote: *"Keep 56425175 and the dense-arm exclusion defect untouched and separately classified. Do not
  // make the fixture disappear to make a test green."*
  const fixture = await one(
    `SELECT excluded_from_evidence_at::text AS at, incognito FROM ${S}.txn_conversations
      WHERE id = '56425175-df60-403d-9e5f-76e2729df225'::uuid`)
  check('E · ⛔⛔ 56425175 is still excluded, at its original timestamp',
    fixture?.at === '2026-08-26 20:47:34.121+07' || String(fixture?.at ?? '').startsWith('2026-08-26'),
    `excluded_from_evidence_at=${fixture?.at}`)
  const denseLeak = await one(
    `SELECT count(*)::int AS n FROM ${S}.txn_message_embeddings me
       JOIN ${S}.txn_conversations c ON c.id = me.conversation_id
      WHERE c.incognito OR c.excluded_from_evidence_at IS NOT NULL`)
  check('E · ⚠️ the dense-arm exclusion defect is still OBSERVABLE — ⛔ separately classified, ⛔ not fixed here',
    denseLeak?.n === 8, `${denseLeak?.n} non-evidential embedding row(s) — expected 8`)
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  if (created) {
    try {
      await query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`)
      const left = await one(`SELECT 1 AS x FROM information_schema.schemata WHERE schema_name = $1`, [TEST_SCHEMA])
      check('⭐ the test schema was dropped', !left)
    } catch (e) {
      check('⛔⛔ COULD NOT DROP THE TEST SCHEMA — drop it by hand', false, e.message)
    }
  }
  await pg.end()
  done()
}

/**
 * ⭐⭐ EVERYTHING M1 MUST LEAVE ALONE, IN ONE PLACE — including P1's own window predicate.
 * ⛔ Counts AND high-water marks: a count alone survives a delete-and-insert, and `max(rolling_id)`
 * survives nothing. Both, so a write cannot hide in either.
 */
async function snapshot() {
  const q1 = async (sql) => (await one(sql)) ?? {}
  const acts = await q1(`SELECT count(*)::int AS n, max(rolling_id) AS hi, max(completed_at) AS last
                           FROM ${S}.log_conversation_revisits`)
  const mem = await q1(`SELECT count(*)::int AS n, max(created_at) AS last FROM ${S}.txn_memories`)
  const rel = await q1(`SELECT count(*)::int AS n FROM ${S}.txn_relational_records`)
  const ret = await q1(`SELECT count(*)::int AS n FROM ${S}.log_retention_decisions`)
  const conv = await q1(`SELECT count(*)::int AS n,
                                count(*) FILTER (WHERE excluded_from_evidence_at IS NOT NULL)::int AS excl
                           FROM ${S}.txn_conversations`)
  const msg = await q1(`SELECT count(*)::int AS n FROM ${S}.txn_messages`)
  const emb = await q1(`SELECT count(*)::int AS n FROM ${S}.txn_message_embeddings`)
  const passes = await q1(`SELECT count(*)::int AS n FROM ${S}.log_dreaming_passes`)
  // ⭐ P1'S ACTUAL PREDICATE, not a proxy for it.
  const p1 = await q1(`SELECT count(*)::int AS n FROM ${S}.log_conversation_revisits
                        WHERE tool_generation = 2 AND dispatch_generation = 2
                          AND trigger_source = 'cron' AND outcome = 'completed'`)
  return {
    'log_conversation_revisits (count)': acts.n,
    'log_conversation_revisits (max rolling_id)': acts.hi,
    'log_conversation_revisits (last completed)': acts.last,
    'txn_memories (count)': mem.n,
    'txn_memories (last created)': mem.last,
    'txn_relational_records (count)': rel.n,
    'log_retention_decisions (count)': ret.n,
    'txn_conversations (count)': conv.n,
    'txn_conversations (excluded)': conv.excl,
    'txn_messages (count)': msg.n,
    'txn_message_embeddings (count)': emb.n,
    'log_dreaming_passes PRODUCTION (count)': passes.n,
    p1Window: p1.n,
  }
}
