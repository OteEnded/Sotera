// ⭐⭐ M1 · STEP 2 — ONE dryRun pass against the REAL corpus.
//
//   node test/pipeline/dreaming-m1-step2.mjs
//
// ── ⛔ THE BOUNDARY, EXACTLY AS OTE SET IT ────────────────────────────────────────────────────────
//   ✅ read-only against existing data
//   ✅ the ONLY thing written is its own pass record
//   ⛔ Dreaming is NOT enabled · ⛔ no commitment · ⛔ no memory or exclusion is modified
//   ⛔ no index or GUC is touched · ⛔ nothing discovered during the run is fixed
//
// ⚠️ RUN AS A SCRIPT, ⛔ NOT AS AN ADMIN ROUTE — a deliberate reduction from the plan. A route would put
// a new endpoint inside the running app and need a restart; a script needs neither. ⭐ Less authority for
// the same result.
//
// ── ⭐ THE EXPECTED SEMANTIC RESULT ──────────────────────────────────────────────────────────────
// `56425175` is excluded, and `#656` rests on it. ⇒ the pass must conclude **6a**, with `withheld > 0`
// counted INSIDE M — demonstrating that E3-withheld material contributes to M and ⛔ cannot collapse
// into 6d.

import { devPg, devSchema } from '../harness.mjs'
import { runOnePass } from '../../Backend/app/components/dreaming-host.js'

const pg = devPg(); await pg.connect()
const schema = devSchema()
const query = async (sql, params) => pg.query(sql, params)

const before = await query(`SELECT count(*)::int AS n FROM "${schema}"."log_dreaming_passes"`)
const memBefore = await query(`SELECT count(*)::int AS n, max(created_at) AS latest FROM "${schema}"."txn_memories"`)
const exclBefore = await query(
  `SELECT count(*)::int AS n FROM "${schema}"."txn_conversations" WHERE excluded_from_evidence_at IS NOT NULL`)

console.log('── BEFORE ──────────────────────────────────────────────')
console.log(`  pass rows        ${before.rows[0].n}`)
console.log(`  memories         ${memBefore.rows[0].n}  (latest ${memBefore.rows[0].latest?.toISOString?.() ?? '-'})`)
console.log(`  excluded convos  ${exclBefore.rows[0].n}`)

const r = await runOnePass({ query, schema, dryRun: true })

console.log('\n── THE PASS ────────────────────────────────────────────')
console.log(`  pass             ${r.passId}  (rolling_id ${r.rollingId})`)
console.log(`  M (eligible)     ${r.M}`)
console.log(`  N (reached)      ${r.N}`)
console.log(`  admitted         ${r.admitted}`)
console.log(`  withheld         ${r.withheld}`)
console.log(`  outcome          ${r.outcome}`)
console.log(`  why              ${r.why}`)
console.log(`  completeness     ${r.written?.completeness}`)
console.log(`  boundary         ${JSON.stringify(r.boundary)}`)
console.log(`  evaluated at     ${r.evaluatedAt?.toISOString?.()}`)
console.log(`  withheld acts    ${r.withheldActs.map((w) => `#${w.rolling_id}`).join(' ') || '(none)'}`)

// ── ⛔ THE INVARIANTS THIS RUN EXISTS TO DEMONSTRATE ─────────────────────────────────────────────
const checks = [
  ['outcome is 6a', r.outcome === '6a'],
  ['withheld > 0', r.withheld > 0],
  ['M = admitted + withheld — withheld is counted INSIDE M', r.M === r.admitted + r.withheld],
  ['⛔ it did NOT conclude 6d', r.outcome !== '6d'],
  ['the withheld act is #656', r.withheldActs.some((w) => Number(w.rolling_id) === 656)],
  ['N was measured, not assumed', Number.isInteger(r.N)],
]

// ── ⛔ AND THE BOUNDARY, VERIFIED AFTER THE FACT ─────────────────────────────────────────────────
const after = await query(`SELECT count(*)::int AS n FROM "${schema}"."log_dreaming_passes"`)
const memAfter = await query(`SELECT count(*)::int AS n, max(created_at) AS latest FROM "${schema}"."txn_memories"`)
const exclAfter = await query(
  `SELECT count(*)::int AS n FROM "${schema}"."txn_conversations" WHERE excluded_from_evidence_at IS NOT NULL`)

checks.push(
  ['exactly ONE pass row was written', after.rows[0].n === before.rows[0].n + 1],
  ['⛔ NO memory was created', memAfter.rows[0].n === memBefore.rows[0].n],
  ['⛔ NO memory timestamp moved', String(memAfter.rows[0].latest) === String(memBefore.rows[0].latest)],
  ['⛔ NO exclusion changed', exclAfter.rows[0].n === exclBefore.rows[0].n],
)

console.log('\n── INVARIANTS ──────────────────────────────────────────')
let fails = 0
for (const [label, pass] of checks) {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label}`)
  if (!pass) fails++
}
console.log(fails === 0 ? '\nALL INVARIANTS HELD' : `\n${fails} INVARIANT(S) FAILED`)

await pg.end()
process.exitCode = fails === 0 ? 0 : 1
