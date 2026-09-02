// ⭐⭐ RUN ONE DREAMING PASS ON DEMAND — M1, the instrument.
//
//   node test/pipeline/dreaming-pass.mjs              one exhaustive pass
//   node test/pipeline/dreaming-pass.mjs --limit 3    a deliberately BOUNDED look -> 6e
//   node test/pipeline/dreaming-pass.mjs --json       machine-readable
//   node test/pipeline/dreaming-pass.mjs --series     print the pass series and STOP (runs nothing)
//
// ── ⛔ THE BOUNDARY ──────────────────────────────────────────────────────────────────────────────
//   ✅ read-only against the live act corpus
//   ✅ the ONLY thing written is its own pass record, labelled `trigger_source = 'manual'`
//   ⛔ Dreaming is NOT enabled · ⛔ no commitment · ⛔ no memory, reflection or exclusion is modified
//   ⛔ no model call, no embedder call, no index, no GUC
//
// ⚠️ A SCRIPT, ⛔ NOT AN ADMIN ROUTE — the deliberate reduction recorded in the plan. A route would put a
// new endpoint inside the running app and need a restart; a script needs neither. Less authority for the
// same result.
//
// ⭐ SUPERSEDES `dreaming-m1-step2.mjs`, which ran the one-off step-2 dry run and asserted the invariants
// of that specific moment. ⛔ That file is kept: it is the record of what step 2 proved, and its
// assertions are pinned to the corpus as it stood on 2026-09-01.

import { devPg, devSchema } from '../harness.mjs'
import { runOnePass } from '../../Backend/app/components/dreaming-host.js'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const value = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : null
}
const asJson = flag('--json')
const limitArg = value('--limit')
const limit = limitArg === null ? null : Number(limitArg)
if (limitArg !== null && !(Number.isInteger(limit) && limit > 0)) {
  console.error(`⛔ --limit must be a positive integer (got ${limitArg})`)
  process.exit(1)
}

const pg = devPg(); await pg.connect()
const schema = devSchema()
const S = `"${schema}"`
const query = async (sql, params) => pg.query(sql, params)

/** ⭐ The series is what O-iii.a reads, so it is printed in the shape that question is asked in. */
async function series() {
  const { rows } = await query(
    `SELECT rolling_id, created_at, trigger_source, run_state, outcome, completeness,
            m_count, n_count, withheld_count, view_read_us
       FROM ${S}.log_dreaming_passes ORDER BY rolling_id`)
  return rows
}

try {
  if (flag('--series')) {
    const rows = await series()
    if (asJson) { console.log(JSON.stringify(rows, null, 2)) } else {
      console.log('\n  #   when                 trigger  state      outcome  complete    M    N  wh  view_read')
      console.log('  ──  ───────────────────  ───────  ─────────  ───────  ─────────  ───  ───  ──  ─────────')
      for (const r of rows) {
        console.log(`  ${String(r.rolling_id).padStart(2)}  ${new Date(r.created_at).toISOString().slice(0, 19)}`
          + `  ${String(r.trigger_source ?? '-').padEnd(7)}  ${String(r.run_state ?? '(flight)').padEnd(9)}`
          + `  ${String(r.outcome ?? '-').padEnd(7)}  ${String(r.completeness ?? '-').padEnd(9)}`
          + `  ${String(r.m_count ?? '-').padStart(3)}  ${String(r.n_count ?? '-').padStart(3)}`
          + `  ${String(r.withheld_count ?? '-').padStart(2)}  ${r.view_read_us === null ? '        -' : `${String(r.view_read_us).padStart(6)}us`}`)
      }
      // ⭐ THE TWO QUANTITIES O-iii.a ACTUALLY NEEDS, derived from the series rather than asserted.
      const timed = rows.filter((r) => Number.isInteger(r.view_read_us))
      if (timed.length >= 2) {
        const us = timed.map((r) => r.view_read_us).sort((a, b) => a - b)
        console.log(`\n  view read over ${timed.length} timed pass(es): `
          + `min ${us[0]}us · median ${us[Math.floor(us.length / 2)]}us · max ${us[us.length - 1]}us`)
      }
      const withM = rows.filter((r) => Number.isInteger(r.m_count))
      if (withM.length >= 2) {
        const a = withM[0]; const b = withM[withM.length - 1]
        const days = (new Date(b.created_at) - new Date(a.created_at)) / 86_400_000
        console.log(`  corpus growth: M ${a.m_count} → ${b.m_count} over ${days.toFixed(2)} day(s)`
          + (days > 0 ? ` = ${((b.m_count - a.m_count) / days).toFixed(1)}/day` : ''))
      }
      console.log('\n  ⛔ these are EVIDENCE for O-iii.a, not a threshold — nothing reads them to decide anything\n')
    }
    process.exitCode = 0
  } else {
    const r = await runOnePass({ query, schema, dryRun: true, limit, triggerSource: 'manual' })

    if (r?.refused) {
      // ⛔ NOT AN ERROR AND NOT A SUCCESS. A pass already in flight is a correct refusal.
      console.log(`\n  ⏸ refused — ${r.why}\n`)
      process.exitCode = 0
    } else if (asJson) {
      console.log(JSON.stringify(r, null, 2))
    } else {
      console.log('\n── THE PASS ────────────────────────────────────────────')
      console.log(`  pass             #${r.rollingId}  (${r.passId})`)
      console.log(`  trigger          ${r.triggerSource}`)
      console.log(`  M (eligible)     ${r.M}`)
      console.log(`  N (reached)      ${r.N}${r.limit === null ? '' : `   (limit ${r.limit})`}`)
      console.log(`  admitted         ${r.admitted}`)
      console.log(`  withheld         ${r.withheld}`)
      console.log(`  outcome          ${r.outcome}`)
      console.log(`  why              ${r.why}`)
      console.log(`  completeness     ${r.written?.completeness}`)
      // ⭐ The narrowing is REPORTED, never inferred from the outcome — concludeFrom owns the ordering
      // and this line says when M1's no-reasoner ceiling changed the answer.
      console.log(`  concludeFrom     ${r.orderedOutcome}${r.narrowedFrom6b ? '  → narrowed to 6e (no reasoner)' : ''}`)
      console.log(`  view read        ${r.viewReadUs}us`)
      console.log(`  boundary         ${JSON.stringify(r.boundary)}`)
      console.log(`  evaluated at     ${r.evaluatedAt?.toISOString?.()}`)
      console.log(`  withheld acts    ${r.withheldActs.map((w) => `#${w.rolling_id}`).join(' ') || '(none)'}`)
      if (r.preempted?.length) console.log(`  ⚠️ preempted     ${r.preempted.map((p) => `#${p}`).join(' ')}`)
      console.log('')
    }
  }
} catch (e) {
  console.error(`\n⛔ ${e?.stack ?? e}\n`)
  process.exitCode = 1
} finally {
  await pg.end()
}
