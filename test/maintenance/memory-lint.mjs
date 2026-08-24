// ⭐ MEMORY LINT · on-demand runner. ⛔ READ-ONLY — it reports and never repairs.
//
//   node maintenance/memory-lint.mjs                      every owner, counts + ids, no content
//   node maintenance/memory-lint.mjs --as agent_dev        one owner only
//   node maintenance/memory-lint.mjs --as agent_dev --content   ⚠️ include excerpts (see below)
//   node maintenance/memory-lint.mjs --json out.json
//
// ⚠️⚠️ `--content` PRINTS WHAT SOMEONE BELIEVES. It exists for debugging ONE owner deliberately, and it
// refuses to run unscoped for exactly that reason: an integrity report that dumps every account's
// beliefs is a disclosure surface wearing a maintenance hat. The cron pass never sets it.

import { readFileSync, writeFileSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB } from '../../Backend/lib/utility.js'
import { lintMemory, lintSummaryLine, LINT_RULES } from '../../Backend/app/components/memory-lint-host.js'

const argv = process.argv.slice(2)
const opt = (n, d = null) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : d)
const AS = opt('as')
const CONTENT = argv.includes('--content')
if (CONTENT && !AS) {
  console.error('✖ --content requires --as <username>. Refusing to dump every owner\'s beliefs.')
  process.exit(1)
}

const db = await initDB(); setDB(db)
let userId = null
if (AS) {
  const pg = devPg(); await pg.connect()
  const S = devSchema()
  const { rows } = await pg.query(`select id::text id from ${S}.mst_users where username = $1`, [AS])
  await pg.end()
  if (!rows.length) { console.error(`✖ no such user: ${AS}`); process.exit(1) }
  userId = rows[0].id
}

const report = await lintMemory(db, { userId, includeContent: CONTENT })
if (!report.ok) { console.error(`✖ ${lintSummaryLine(report)}`); process.exit(1) }

const W = 96
console.log(`\n${'═'.repeat(W)}`)
console.log(`  MEMORY LINT — read-only integrity check${AS ? ` · scoped to ${AS}` : ' · all owners'}`)
console.log(`${'═'.repeat(W)}`)
// ⭐ EVERY RULE IS LISTED WHETHER OR NOT IT FIRED. "0 of 8" is a result; a silent pass is not.
console.log(`\n  ${'rule'.padEnd(34)} ${'severity'.padEnd(9)} count`)
for (const r of LINT_RULES) {
  // ⛔ THREE-VALUED ON PURPOSE: a count, or NOT RUN. The first version of the host reported 0 for two
  // rules whose tables it had failed to find, and "0" read as clean. Never print them the same way.
  const n = report.totals[r.id]
  const cell = n === null || n === undefined ? `⛔ DID NOT RUN — ${report.notRun?.[r.id] ?? 'unknown'}`
    : n === 0 ? '✓ 0' : `${r.severity === 'defect' ? '⛔ ' : '⚠️ '}${n}`
  console.log(`  ${r.id.padEnd(34)} ${r.severity.padEnd(9)} ${cell}`)
}
console.log(`\n  ⇒ ${lintSummaryLine(report)}`)

for (const o of report.owners) {
  console.log(`\n── ${o.username ?? o.ownerId ?? '(unattributed)'} ──`)
  for (const [rule, n] of Object.entries(o.counts)) console.log(`   ${rule}: ${n}`)
  for (const f of o.findings.slice(0, 20)) {
    console.log(`     ${f.rule.padEnd(32)} ${String(f.id).slice(0, 8)}${f.points_at ? ` → ${String(f.points_at).slice(0, 8)}` : ''}`
      + `${f.n ? ` (n=${f.n})` : ''}${f.entity ? ` ${f.entity}` : ''}${f.excerpt ? `  “${String(f.excerpt).replace(/\s+/g, ' ')}”` : ''}`)
  }
  if (o.findings.length > 20) console.log(`     … ${o.findings.length - 20} more (use --json for all)`)
}
if (report.truncated.length) {
  console.log(`\n  ⚠️⚠️ TRUNCATED — a silently shortened integrity report is worse than none:`)
  for (const t of report.truncated) console.log(`     ${t.rule}: showed ${t.shown} of ${t.total}`)
}
console.log(`\n  ⛔ This tool REPORTS. It does not repair — that is a separate decision with a different blast radius.\n`)

const out = opt('json')
if (out) { writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`); console.log(`  → ${out}\n`) }
process.exit(0)
