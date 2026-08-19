// Run the subject-side relational writer over ONE subject's own conversations, and print what it would
// record. ⛔ Persists NOTHING — `persistRelationalRecords` throws by design until the one-writer
// architecture exists.
//
//   node pipeline/relational-writer-run.mjs [username]   (default: kavi)
//
// ⚠️ Defaults to `kavi`, an observation account whose conversations this project generated — NOT to a
// real third party such as `hermes`. The architecture is identical either way; the choice avoids running
// an abstraction pass over a real person's private conversations to demonstrate a prototype.

import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { abstractStance, persistRelationalRecords, DERIVER_VERSION } from '../../Backend/app/components/relational-writer.js'
import { STANCE_LABELS, FREQUENCY_FLOOR, TAXONOMY_VERSION } from '../../Backend/app/components/relational-taxonomy.js'

const username = process.argv[2] || 'kavi'
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const seq = db.txn_memories.sequelize
const Q = (s, r) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })

const [u] = await Q('SELECT id::text, username FROM persona_sotera.mst_users WHERE username = :username', { username })
if (!u) { console.error(`no such user: ${username}`); process.exit(2) }

console.log(`\nsubject: ${u.username}   deriver=${DERIVER_VERSION}  taxonomy=${TAXONOMY_VERSION}  floor=${FREQUENCY_FLOOR}\n`)
const t0 = Date.now()
const out = await abstractStance({ db, subjectUserId: u.id })
console.log(`scanned ${out.scanned} conversation(s) · ${out.contributed} contributed · ${out.skipped} skipped · ${((Date.now() - t0) / 1000).toFixed(1)}s\n`)

if (!out.records.length) {
  console.log('  (no label reached the frequency floor — nothing would be recorded)')
} else {
  for (const r of out.records) {
    console.log(`  ${r.label}`)
    console.log(`     "${STANCE_LABELS[r.label]}"  · supported by ${r.conversationCount} conversations · ${r.windowStart} → ${r.windowEnd}`)
  }
}

// ⭐ Prove the record shape carries nothing else.
console.log(`\nrecord fields: ${out.records.length ? Object.keys(out.records[0]).join(', ') : '(none)'}`)

// ⭐ Prove persistence is blocked rather than merely unused.
try {
  await persistRelationalRecords({ db, records: out.records, lease: null })
  console.log('\n⚠️ PERSIST DID NOT THROW — the one-writer guard is broken')
} catch (e) {
  console.log(`\n⛔ persist blocked, as designed: ${e.message.split(' — ')[0]}`)
}
process.exit(0)
