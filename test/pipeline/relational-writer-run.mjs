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
import { abstractStance, persistRelationalRecords, createRelationalWriteLease, DERIVER_VERSION } from '../../Backend/app/components/relational-writer.js'
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

// ⚠️ Support distribution — the evidence for choosing the frequency floor (open question Q1).
console.log(`\nlabel support (floor is ${FREQUENCY_FLOOR}; a label needs ≥ that many DISTINCT conversations):`)
const sup = Object.entries(out.support || {})
if (!sup.length) console.log('   (no labels at all)')
for (const [label, n] of sup) console.log(`   ${n >= FREQUENCY_FLOOR ? '✅' : '  '} ${String(n).padStart(2)}  ${label}`)

// ⭐ Prove an off-lane write is still refused, lease or no lease.
try {
  await persistRelationalRecords({ db, records: out.records, lease: null })
  console.log('\n⚠️ PERSIST WITHOUT A LANE DID NOT THROW — the one-writer guard is broken')
} catch (e) {
  console.log(`\n⛔ off-lane write refused: ${e.message.split(' — ')[0]}`)
}

if (process.argv.includes('--persist')) {
  // The lease IS the lane, obtained from the subject's own scope. There is no parameter that could
  // point it at another account.
  const lease = await createRelationalWriteLease({ fastify: { db, config, log: null }, subjectUserId: u.id })
  if (!lease) { console.log('no lease (subject has no person row)'); process.exit(1) }
  const res = await persistRelationalRecords({ db, records: out.records, lease })
  console.log(`✅ persisted on the shared lane: ${JSON.stringify(res)}`)
  const rows = await Q(`SELECT label, conversation_count, window_start::text s, window_end::text e, taxonomy_version
                          FROM persona_sotera.txn_relational_records WHERE subject_person_id = :p ORDER BY label`,
    { p: lease.subjectPersonId })
  console.log(`stored rows for this subject: ${rows.length}`)
  for (const r of rows) console.log(`   ${r.label}  n=${r.conversation_count}  ${r.s}→${r.e}  (${r.taxonomy_version})`)
}
process.exit(0)
