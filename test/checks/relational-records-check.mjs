// RELATIONAL RECORDS — the third scope, and the seven guarantees Ote asked to be proven.
//
//   node checks/relational-records-check.mjs
//
// ⛔ The table is NOT wired: nothing in production reads or writes it. This check exercises the schema
// and the contract directly.
//
// ⚠️ FIXTURES: one transient person row (`__reldel_probe__`) is created and deleted to prove the
// de-identification semantics, because ON DELETE SET NULL cannot be tested without a delete. It carries
// NO memories and NO conversations. This is not seeding Hermes facts to demonstrate the architecture —
// it is the only way to observe a foreign-key behaviour, and it is cleaned up in a finally.

import { makeChecker } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { STANCE_LABEL_KEYS, TIERS, TAXONOMY_VERSION, validateRelationalRecord, FREQUENCY_FLOOR } from '../../Backend/app/components/relational-taxonomy.js'
import { describeRelationship, RELATIONAL_DISCLOSURE } from '../../Backend/app/components/relational-knowledge.js'

const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const seq = db.txn_memories.sequelize
const Q = (s, r) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })
const X = (s, r) => seq.query(s, { replacements: r })

// ⚠️ Uses the house checker from harness.mjs rather than a hand-rolled one. Its `done()` sets a real
// exit code AND drains briefly first — on Windows/Node, exiting while keep-alive sockets tear down trips
// a libuv assertion AFTER the summary prints, turning a pass into a reported failure. I hit exactly that
// earlier in this session with a hand-rolled `process.exit`.
// `ok(cond, label, detail)` is a thin adapter over `check(label, cond, detail)` so the assertions below
// read condition-first; the reporting, counting and exit are all the harness's.
const { check, done } = makeChecker()
const ok = (c, l, d = '') => check(l, c, d)

const users = Object.fromEntries((await Q('SELECT id::text, username FROM persona_sotera.mst_users')).map((u) => [u.username, u.id]))
const persons = Object.fromEntries((await Q('SELECT id::text, display_name FROM persona_sotera.mst_persons')).map((p) => [p.display_name, p.id]))

// ⚠️⚠️ THIS CHECK ONCE DELETED A REAL RECORD — `DELETE ... WHERE subject_person_id = Kavi` also matched
// the row the controlled activation had just created. Same failure as memory-lifecycle-check wiping
// agent_dev's real memories: **a cleanup predicate that also matches production data.**
// ⭐ A test may only delete rows it can PROVE it created. Snapshot ids first; delete only what is new.
const PRE_EXISTING = new Set((await Q('SELECT id::text FROM persona_sotera.txn_relational_records')).map((r) => r.id))
async function cleanupFixtures() {
  const now = await Q('SELECT id::text FROM persona_sotera.txn_relational_records')
  const mine = now.map((r) => r.id).filter((id) => !PRE_EXISTING.has(id))
  if (mine.length) await X('DELETE FROM persona_sotera.txn_relational_records WHERE id IN (:ids)', { ids: mine })
  return mine.length
}

let probePerson = null
try {
  // ── G1 · no free-text / source-id escape hatch EXISTS in the schema ──────────────────────────────
  const cols = await Q(`SELECT column_name, data_type, udt_name FROM information_schema.columns
     WHERE table_schema='persona_sotera' AND table_name='txn_relational_records' ORDER BY ordinal_position`)
  const names = cols.map((c) => c.column_name)
  ok(names.length > 0, 'G1 · the table exists', names.join(', '))
  const forbidden = names.filter((n) => /content|text|excerpt|body|note|message_id|memory_id|conversation_id|source/i.test(n))
  ok(forbidden.length === 0, 'G1 · ⭐ NO content column and NO source-id column exists',
    forbidden.length ? `FORBIDDEN: ${forbidden.join(', ')}` : 'nowhere to put a quote or a row reference')
  const labelCol = cols.find((c) => c.column_name === 'label')
  ok(labelCol?.udt_name === 'relational_label', 'G1 · ⭐ `label` is an ENUM, not text — unknown labels are a TYPE ERROR', labelCol?.udt_name)
  // Free text can only enter through a text column; the only ones are provenance strings we control.
  const textCols = cols.filter((c) => ['text', 'character varying'].includes(c.data_type)).map((c) => c.column_name)
  ok(textCols.every((n) => ['deriver_version', 'taxonomy_version'].includes(n)),
    'G1 · the only text columns are provenance versions', textCols.join(', ') || '(none)')

  // ── G2 · the DB enum and the JS taxonomy are the same list, both directions ──────────────────────
  const dbLabels = (await Q(`SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
     JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='relational_label' AND n.nspname='persona_sotera'`)).map((r) => r.l)
  const missingInDb = STANCE_LABEL_KEYS.filter((k) => !dbLabels.includes(k))
  const missingInJs = dbLabels.filter((k) => !STANCE_LABEL_KEYS.includes(k))
  ok(missingInDb.length === 0 && missingInJs.length === 0,
    'G2 · ⭐ DB enum === JS taxonomy, both directions (two lists of one thing drift)',
    missingInDb.length || missingInJs.length ? `db-missing:[${missingInDb}] js-missing:[${missingInJs}]` : `${dbLabels.length} labels`)
  ok(!STANCE_LABEL_KEYS.some((k) => /rapport|get.?along|friend|warm|nice|likes|senior|junior|late|thai|english/i.test(k)),
    'G2 · ⭐ no sentiment and no personal-attribute labels exist', 'a label for "rapport" would make the invention official')

  // ── G3 · malformed / partial abstraction FAILS CLOSED ────────────────────────────────────────────
  const good = { subjectPersonId: persons.Kavi, tier: 'stance', label: STANCE_LABEL_KEYS[0], conversationCount: 3, windowStart: '2026-08-18', windowEnd: '2026-08-19' }
  ok(validateRelationalRecord(good).ok, 'G3 · a well-formed record validates')
  const bad = [
    ['unknown label', { ...good, label: 'we-get-along' }],
    ['free-text smuggled in', { ...good, content: 'Hermes said the deploy broke' }],
    ['source id smuggled in', { ...good, sourceMessageId: '00000000-0000-0000-0000-000000000000' }],
    ['tier B not built', { ...good, tier: 'theme' }],
    ['zero conversations', { ...good, conversationCount: 0 }],
    ['window inverted', { ...good, windowStart: '2026-08-19', windowEnd: '2026-08-18' }],
    ['not an object', 'i-verify-before-asserting'],
  ]
  for (const [label, cand] of bad) {
    const r = validateRelationalRecord(cand)
    ok(r.ok === false, `G3 · rejects: ${label}`, r.reason || '')
  }
  ok(validateRelationalRecord({ ...good, content: 'x' }).reason?.includes('unknown field'),
    'G3 · ⭐ unknown fields are REJECTED, not stripped', 'stripping is how a content field gets added quietly and persisted later')

  // ── G4 · the database itself refuses an unknown label ────────────────────────────────────────────
  let dbRejected = false
  try {
    await X(`INSERT INTO persona_sotera.txn_relational_records (subject_person_id,tier,label,conversation_count,window_start,window_end,deriver_version,taxonomy_version)
             VALUES (:p,'stance','we-get-along',3,'2026-08-18','2026-08-19','test','test')`, { p: persons.Kavi })
  } catch { dbRejected = true }
  ok(dbRejected, 'G4 · ⭐ Postgres rejects a label outside the enum — the vocabulary is closed at the DB, not just in JS')

  // ── G5 · de-identification: deleting a person DETACHES, it does not destroy ──────────────────────
  const [p] = await Q(`INSERT INTO persona_sotera.mst_persons (id, kind, display_name, origin)
                       VALUES (gen_random_uuid(),'human','__reldel_probe__','transient test fixture — deletion semantics') RETURNING id::text`)
  probePerson = p.id
  await X(`INSERT INTO persona_sotera.txn_relational_records (subject_person_id,tier,label,conversation_count,window_start,window_end,deriver_version,taxonomy_version)
           VALUES (:p,'stance','i-verify-before-asserting',3,'2026-08-18','2026-08-19','test','${TAXONOMY_VERSION}')`, { p: probePerson })
  const before = await Q(`SELECT id::text FROM persona_sotera.txn_relational_records WHERE subject_person_id = :p`, { p: probePerson })
  ok(before.length === 1, 'G5 · a record exists for the probe person')
  await X(`DELETE FROM persona_sotera.mst_persons WHERE id = :p`, { p: probePerson })
  probePerson = null
  const after = await Q(`SELECT id::text, subject_person_id FROM persona_sotera.txn_relational_records WHERE id = :id`, { id: before[0].id })
  ok(after.length === 1, 'G5 · ⭐ the record SURVIVES the person being deleted — she is not lobotomised')
  ok(after[0].subject_person_id === null, 'G5 · ⭐ …and is DE-IDENTIFIED — the link is what goes, not the learning')
  await X(`DELETE FROM persona_sotera.txn_relational_records WHERE id = :id`, { id: before[0].id })

  // ── G6 · account memory remains isolated — the existing boundary is untouched ────────────────────
  const cross = await Q(`SELECT count(*)::int n FROM persona_sotera.txn_memories m
     JOIN persona_sotera.mst_users u ON u.id = m.user_id
     JOIN persona_sotera.mst_persons p ON p.id = m.subject_person_id
     WHERE p.display_name='Hermes' AND u.username NOT IN ('hermes','hermes_alias')`)
  ok(cross[0].n === 0, 'G6 · no memory about Hermes sits in another account (owner×subject still diagonal)')
  const globalRows = await Q(`SELECT count(*)::int n FROM persona_sotera.txn_memories WHERE user_id IS NULL`)
  ok(globalRows[0].n === 0, 'G6 · the broadcast persona-global slice is still empty — this work did not populate it')

  // ── G7 · root does not bypass the disclosure posture ─────────────────────────────────────────────
  const asRoot = await describeRelationship({ db, askingUserId: users.ote, personId: persons.Hermes, disclosure: RELATIONAL_DISCLOSURE.self })
  const asMina = await describeRelationship({ db, askingUserId: users.mina, personId: persons.Hermes, disclosure: RELATIONAL_DISCLOSURE.self })
  ok(asRoot === null && asMina === null, 'G7 · ⭐ at posture `self`, root is withheld from EXACTLY as a stranger is', 'posture, never role')
  const rootNamed = await describeRelationship({ db, askingUserId: users.ote, personId: persons.Hermes, disclosure: RELATIONAL_DISCLOSURE.named })
  const minaNamed = await describeRelationship({ db, askingUserId: users.mina, personId: persons.Hermes, disclosure: RELATIONAL_DISCLOSURE.named })
  ok(JSON.stringify({ ...rootNamed, askerName: null }) === JSON.stringify({ ...minaNamed, askerName: null }),
    'G7 · ⭐ at posture `named`, root and a stranger receive the IDENTICAL derivation', 'root is administrative, not epistemic')

  // ── G9 · ⭐ END-TO-END WRITE, on the SHARED lane ─────────────────────────────────────────────────
  // Proves the mechanism, not a claim about anyone: one record is written, checked, re-written to prove
  // convergence, then removed. It is deliberately about `kavi` (an observation account) and is deleted.
  {
    const { createRelationalWriteLease, persistRelationalRecords } = await import('../../Backend/app/components/relational-writer.js')
    const lease = await createRelationalWriteLease({ fastify: { db, config, log: null }, subjectUserId: users.kavi })
    ok(!!lease?.enqueue && lease.subjectPersonId === persons.Kavi, 'G9 · a lease is minted from the SUBJECT\'s own scope', `person ${lease?.subjectPersonId?.slice(0, 8)}`)

    const rec = { subjectPersonId: persons.Kavi, tier: 'stance', label: 'i-verify-before-asserting', conversationCount: 3, windowStart: '2026-08-18', windowEnd: '2026-08-19' }
    const w1 = await persistRelationalRecords({ db, records: [rec], lease })
    ok(w1.written === 1, 'G9 · ⭐ the record is WRITTEN — the one-writer question is resolved, not bypassed', JSON.stringify(w1))

    // ⭐ CONVERGENCE: writing the same label again must UPDATE, not duplicate.
    await persistRelationalRecords({ db, records: [{ ...rec, conversationCount: 5, windowEnd: '2026-08-20' }], lease })
    const rows = await Q(`SELECT id::text, conversation_count, window_end::text we FROM persona_sotera.txn_relational_records
                            WHERE subject_person_id = :p AND label = 'i-verify-before-asserting'`, { p: persons.Kavi })
    ok(rows.length === 1, 'G9 · ⭐ re-deriving the same label UPDATES in place — one row, not two', `${rows.length} row(s)`)
    ok(rows[0].conversation_count === 5 && rows[0].we === '2026-08-20', 'G9 · …and the window widens rather than being overwritten', `n=${rows[0].conversation_count} end=${rows[0].we}`)

    // ⭐ A record about someone else, on this lease, must fail the WHOLE batch.
    let refused = false
    try { await persistRelationalRecords({ db, records: [{ ...rec, subjectPersonId: persons.Hermes }], lease }) } catch { refused = true }
    ok(refused, 'G9 · ⭐ the lease REFUSES a record about a different person — no cross-account parameter exists')
    const hermesRows = await Q(`SELECT count(*)::int n FROM persona_sotera.txn_relational_records WHERE subject_person_id = :p`, { p: persons.Hermes })
    ok(hermesRows[0].n === 0, 'G9 · …and nothing about that person was written')

    await cleanupFixtures()
  }

  // ── G8 · absence cannot be queried ───────────────────────────────────────────────────────────────
  const rel = await import('../../Backend/app/components/relational-knowledge.js')
  const tax = await import('../../Backend/app/components/relational-taxonomy.js')
  const exported = [...Object.keys(rel), ...Object.keys(tax)]
  ok(!exported.some((k) => /has|query|check|contains|discussed|match|search|list|enumerate/i.test(k)),
    'G8 · ⭐ no predicate/enumeration export exists — the layer is EMITTED, never QUERIED', exported.join(', '))
  ok(FREQUENCY_FLOOR >= 3, 'G8 · the frequency floor is set and ≥3 — one conversation can never mint a record', `${FREQUENCY_FLOOR}`)
  ok(TIERS.length === 1 && TIERS[0] === 'stance', 'G8 · tier B is designed but NOT built — only Sotera-owned stance is expressible')
} finally {
  if (probePerson) await X(`DELETE FROM persona_sotera.mst_persons WHERE id = :p`, { p: probePerson }).catch(() => {})
  const left = await Q(`SELECT count(*)::int n FROM persona_sotera.mst_persons WHERE display_name = '__reldel_probe__'`)
  ok(left[0].n === 0, 'cleanup · no fixture person left behind')
  // ⚠️ ASSERT THE DELTA, NOT AN EMPTY TABLE. "Zero rows exist" was only ever true while the feature had
  // never been activated; the moment a real record exists it becomes a demand that the check DESTROY it.
  // The right invariant is that the check leaves the table exactly as it found it.
  await cleanupFixtures().catch(() => {})
  const rows = await Q('SELECT id::text FROM persona_sotera.txn_relational_records')
  const added = rows.map((r) => r.id).filter((id) => !PRE_EXISTING.has(id))
  ok(added.length === 0, 'cleanup · the table is exactly as this check found it — real records untouched',
    `${rows.length} rows present, ${added.length} added by this run`)
}


done()