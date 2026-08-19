// APPLY ONE MIGRATION, and show what the database said about it.
//
//   node maintenance/apply-migration.mjs 009_intentions.sql
//
// ⚠️ Every migration up to 008 was applied by hand, one ad-hoc command each. That is how 005 shipped a
// column with no generation expression and nobody noticed for a day: the command exited 0, and "exit 0"
// was the only thing anyone looked at. Our migrations RAISE NOTICE what they proved and RAISE EXCEPTION
// when they did not — so the NOTICES ARE THE POINT, and a runner that swallows them throws away the
// evidence the migration went to the trouble of producing.
//
// Reads the connection from Backend/config.json through the harness. NEVER hardcode a database here —
// the harness header records what that cost on OteLLMServices (56 scripts pointing at a database that
// existed and was no longer live).
import { readFileSync } from 'node:fs'
import { devPg } from '../harness.mjs'

const file = process.argv[2]
if (!file) {
  console.error('usage: node maintenance/apply-migration.mjs <file.sql>')
  process.exit(1)
}
const path = new URL(`../../Backend/database/migrations/${file}`, import.meta.url)
let sql
try {
  sql = readFileSync(path, 'utf8')
} catch {
  console.error(`✖ no such migration: ${file}`)
  process.exit(1)
}

const client = devPg()
// The migration's own assertions speak through NOTICE. Print them.
client.on('notice', (n) => console.log(`  ▸ ${n.message}`))

try {
  await client.connect()
  console.log(`▶ applying ${file} …`)
  await client.query(sql)
  console.log(`✓ ${file} applied`)
} catch (e) {
  // A migration that fails its own proof block is WORKING AS INTENDED — say so rather than dressing it
  // up as an infrastructure error.
  console.error(`✖ ${file} FAILED: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
