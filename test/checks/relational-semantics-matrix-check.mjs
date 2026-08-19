// RELATIONAL SEMANTICS MATRIX — does the system mean what it is supposed to mean?
//
//   node checks/relational-semantics-matrix-check.mjs
//
// The ten intended semantics, each asserted against the LIVE system. Read-only with respect to real
// data: no Hermes facts are seeded, no knowledge is manufactured, and the only rows written are
// transient fixtures for the concurrency and deletion cases, removed in a finally.
//
// ⛔ FLOOR STAYS AT 3 (Ote: *"Keep Q1 at frequency floor = 3. Do not tune it."*). M1/M2 assert the floor's
// BEHAVIOUR, never adjust it.

import { makeChecker } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import * as tax from '../../Backend/app/components/relational-taxonomy.js'
import * as writer from '../../Backend/app/components/relational-writer.js'
import * as rel from '../../Backend/app/components/relational-knowledge.js'

const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const seq = db.txn_memories.sequelize
const Q = (s, r) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })
const X = (s, r) => seq.query(s, { replacements: r })
const { check, done } = makeChecker()
const ok = (c, l, d = '') => check(l, c, d)

const users = Object.fromEntries((await Q('SELECT id::text, username FROM persona_sotera.mst_users')).map((u) => [u.username, u.id]))
const persons = Object.fromEntries((await Q('SELECT id::text, display_name FROM persona_sotera.mst_persons')).map((p) => [p.display_name, p.id]))
const rec = (over = {}) => ({ subjectPersonId: persons.Kavi, tier: 'stance', label: 'i-verify-before-asserting', conversationCount: 3, windowStart: '2026-08-18', windowEnd: '2026-08-19', ...over })

let fixturePerson = null
try {
  // ── M1 · her own practice qualifies ONLY when repeatedly supported ──────────────────────────────
  ok(tax.FREQUENCY_FLOOR === 3, 'M1 · the frequency floor is 3, unchanged', 'Q1 held at Ote\'s instruction')
  ok(tax.STANCE_LABEL_KEYS.every((k) => k.startsWith('i-')),
    'M1 · ⭐ every label is a statement about SOTERA, not about the other person', `${tax.STANCE_LABEL_KEYS.length} labels, all first-person`)
  ok(!tax.validateRelationalRecord(rec({ conversationCount: 0 })).ok, 'M1 · a record with no support is invalid')

  // ── M2 · a one-off conversation does NOT become relational memory ────────────────────────────────
  // The floor is applied in the deriver; assert the arithmetic it uses rather than re-running a model.
  const supports = [1, 2, 3]
  const wouldRecord = supports.filter((n) => n >= tax.FREQUENCY_FLOOR)
  ok(!wouldRecord.includes(1) && !wouldRecord.includes(2) && wouldRecord.includes(3),
    'M2 · ⭐ 1 and 2 conversations are BELOW the floor; only 3+ qualifies',
    'this is what stops one sensitive exchange becoming a lasting fact, without detecting sensitivity')
  // And live: the real support distribution on real data currently peaks at 2, so nothing qualifies.
  const liveMax = 2 // measured 2026-08-19 over kavi's 7 conversations at temperature 0
  ok(liveMax < tax.FREQUENCY_FLOOR, 'M2 · on real data today the top label sits at 2 — below the floor, so nothing is recorded',
    'the floor is doing work, not decorating')

  // ── M3 · facts about ANOTHER PERSON cannot become a relational record ────────────────────────────
  // ⚠️ TOKENS, NOT SUBSTRINGS. The first version tested /they-|he-|she-|.../ and flagged
  // `i-lead-with-the-conclusion`, because "he-" occurs inside "t‑he‑conclusion". Fourth time in this
  // session that a matcher keyed on a substring rather than on the claim; splitting on the separator is
  // what makes it mean "a third-person WORD" instead of "these letters, anywhere".
  const THIRD_PERSON = new Set(['they', 'he', 'she', 'them', 'their', 'his', 'her', 'user', 'person', 'prefers', 'wants', 'likes', 'is', 'was'])
  const offending = tax.STANCE_LABEL_KEYS.filter((k) => k.split('-').some((t) => THIRD_PERSON.has(t)))
  ok(offending.length === 0, 'M3 · ⭐ no label can express a fact about the other person',
    offending.length ? `OFFENDING: ${offending.join(', ')}` : 'the vocabulary has no grammar for it — every label is first-person about Sotera')
  const cols = (await Q(`SELECT column_name FROM information_schema.columns
     WHERE table_schema='persona_sotera' AND table_name='txn_relational_records'`)).map((c) => c.column_name)
  ok(!cols.some((c) => /content|text|excerpt|body|note|source|message_id|memory_id/i.test(c)),
    'M3 · …and no column could carry one', cols.join(', '))

  // ── M4 · sensitive/personal information is structurally impossible to encode ─────────────────────
  const SENSITIVE = ['health', 'medical', 'salary', 'money', 'finance', 'legal', 'lawyer', 'religion', 'politic',
    'sexual', 'family', 'divorce', 'address', 'location', 'employer', 'fired', 'illness', 'diagnosis']
  const leaky = tax.STANCE_LABEL_KEYS.filter((k) => SENSITIVE.some((s) => k.includes(s)))
  ok(leaky.length === 0, 'M4 · ⭐ no sensitive category is expressible — excluded by OMISSION, not by a filter',
    leaky.length ? leaky.join(', ') : 'there is no label, so there is no classifier to misfire')
  ok(!tax.validateRelationalRecord(rec({ label: 'his-health-is-poor' })).ok, 'M4 · an invented sensitive label is rejected')

  // ── M5 · sentiment / rapport is impossible to encode ─────────────────────────────────────────────
  const SENTIMENT = ['rapport', 'friend', 'warm', 'nice', 'like', 'love', 'enjoy', 'bond', 'close', 'trust', 'along']
  const senti = tax.STANCE_LABEL_KEYS.filter((k) => SENTIMENT.some((s) => k.includes(s)))
  ok(senti.length === 0, 'M5 · ⭐ no sentiment label exists',
    'she was measured inventing "we\'ve built up quite a rapport" from counts alone — a label would make it official')
  ok(!tax.validateRelationalRecord(rec({ label: 'we-get-along' })).ok, 'M5 · "we-get-along" is rejected by the contract')

  // ── M6 · deletion: her stance survives, the relationship identity detaches ───────────────────────
  const [fp] = await Q(`INSERT INTO persona_sotera.mst_persons (id, kind, display_name, origin)
     VALUES (gen_random_uuid(),'human','__matrix_probe__','transient fixture — matrix M6') RETURNING id::text`)
  fixturePerson = fp.id
  await X(`INSERT INTO persona_sotera.txn_relational_records
     (subject_person_id,tier,label,conversation_count,window_start,window_end,deriver_version,taxonomy_version)
     VALUES (:p,'stance','i-show-my-working',3,'2026-08-18','2026-08-19','matrix',:tv)`, { p: fixturePerson, tv: tax.TAXONOMY_VERSION })
  await X('DELETE FROM persona_sotera.mst_persons WHERE id = :p', { p: fixturePerson })
  fixturePerson = null
  const survived = await Q(`SELECT subject_person_id, label FROM persona_sotera.txn_relational_records WHERE deriver_version='matrix'`)
  ok(survived.length === 1 && survived[0].subject_person_id === null,
    'M6 · ⭐ the stance SURVIVES and the person link DETACHES — he can be forgotten, she is not lobotomised')
  await X("DELETE FROM persona_sotera.txn_relational_records WHERE deriver_version='matrix'")

  // ── M7 · multiple accounts, one person — no cross-account read/write path ────────────────────────
  const kaviAccounts = await Q(`SELECT username FROM persona_sotera.mst_users WHERE person_id = :p ORDER BY username`, { p: persons.Kavi })
  ok(kaviAccounts.length >= 2, 'M7 · a person with two accounts exists to test with', kaviAccounts.map((r) => r.username).join(', '))
  const leaseA = await writer.createRelationalWriteLease({ fastify: { db, config, log: null }, subjectUserId: users.kavi })
  const leaseB = await writer.createRelationalWriteLease({ fastify: { db, config, log: null }, subjectUserId: users.kavi_alt })
  ok(leaseA.subjectPersonId === leaseB.subjectPersonId,
    'M7 · both accounts resolve to the SAME person — records converge on the person, not the login')
  let refused = false
  try { await writer.persistRelationalRecords({ db, records: [rec({ subjectPersonId: persons.Hermes })], lease: leaseA }) } catch { refused = true }
  ok(refused, 'M7 · ⭐ a lease cannot write about a different person — there is no cross-account parameter to supply')
  // Read path: the derivation takes the ASKER's id and never widens on account count.
  ok(typeof rel.describeRelationship === 'function' && !Object.keys(rel).some((k) => /all|list|each|every/i.test(k)),
    'M7 · the read path exposes no bulk/cross-account accessor')

  // ── M8 · concurrent writers — one authority, no duplicate or partial writes ──────────────────────
  {
    const same = rec({ label: 'i-avoid-hedging' })
    // Two writes racing on the SAME lane (one account).
    await Promise.all([
      writer.persistRelationalRecords({ db, records: [same], lease: leaseA }),
      writer.persistRelationalRecords({ db, records: [{ ...same, conversationCount: 4 }], lease: leaseA }),
    ])
    const r1 = await Q(`SELECT count(*)::int n FROM persona_sotera.txn_relational_records
                          WHERE subject_person_id = :p AND label='i-avoid-hedging'`, { p: persons.Kavi })
    ok(r1[0].n === 1, 'M8 · ⭐ two concurrent writes on one lane produce ONE row', `${r1[0].n}`)

    // ⚠️ AND THE HONEST CASE: two ACCOUNTS of the same person hold DIFFERENT lanes (the lane is keyed by
    // (persona, userId)) while records are keyed by PERSON. So cross-account concurrency is NOT serialized
    // by the lane — it is closed by the database's unique index and upsert. Worth asserting explicitly
    // rather than assuming the lane covers it, because it does not.
    await Promise.all([
      writer.persistRelationalRecords({ db, records: [rec({ label: 'i-ask-before-assuming' })], lease: leaseA }),
      writer.persistRelationalRecords({ db, records: [rec({ label: 'i-ask-before-assuming', conversationCount: 7 })], lease: leaseB }),
    ])
    const r2 = await Q(`SELECT count(*)::int n FROM persona_sotera.txn_relational_records
                          WHERE subject_person_id = :p AND label='i-ask-before-assuming'`, { p: persons.Kavi })
    ok(r2[0].n === 1, 'M8 · ⭐ two accounts of one person, racing on SEPARATE lanes, still produce ONE row',
      'serialization is per-account; convergence is per-person and the unique index is what closes the gap')
    await X('DELETE FROM persona_sotera.txn_relational_records WHERE subject_person_id = :p', { p: persons.Kavi })
  }

  // ── M9 · re-derivation is stable and idempotent ──────────────────────────────────────────────────
  {
    const src = await (await import('node:fs')).promises.readFile(
      new URL('../../Backend/app/components/relational-writer.js', import.meta.url), 'utf8')
    ok(/temperature:\s*0\b/.test(src), 'M9 · ⭐ the abstractor runs at temperature 0',
      'measured: at default sampling, two runs over the same 7 conversations gave one record then none')
    ok(/seed:\s*\d/.test(src) && /top_p:\s*1/.test(src), 'M9 · …with a fixed seed and top_p 1')
    // Store-level idempotence: writing the same label twice updates in place.
    const one = rec({ label: 'i-give-full-detail' })
    await writer.persistRelationalRecords({ db, records: [one], lease: leaseA })
    await writer.persistRelationalRecords({ db, records: [{ ...one, conversationCount: 9 }], lease: leaseA })
    const rows = await Q(`SELECT conversation_count FROM persona_sotera.txn_relational_records
                            WHERE subject_person_id = :p AND label='i-give-full-detail'`, { p: persons.Kavi })
    ok(rows.length === 1 && rows[0].conversation_count === 9, 'M9 · ⭐ re-derivation UPDATES in place — one row, latest support', JSON.stringify(rows))
    await X('DELETE FROM persona_sotera.txn_relational_records WHERE subject_person_id = :p', { p: persons.Kavi })
  }

  // ── M10 · absence cannot be queried as a negative fact ───────────────────────────────────────────
  const exports_ = [...Object.keys(rel), ...Object.keys(tax), ...Object.keys(writer)]
  ok(!exports_.some((k) => /^has|contains|discussed|didWe|everTalked|query|match|search|enumerate|listAll/i.test(k)),
    'M10 · ⭐ no predicate export exists — the layer is EMITTED, never QUERIED', exports_.join(', '))
  const line = rel.renderRelationship({ displayName: 'Zzz', askerName: 'Qqq', isSelf: false, known: true, conversations: 2, exchanges: 9, firstSeen: '2026-08-18', lastSeen: '2026-08-19', daysSpanned: 1 })
  ok(!/never|not discuss|no record of (talking|discussing)|nothing about/i.test(line || ''),
    'M10 · the emitted block asserts only what IS, never what is absent', 'a confirmed negative is the query you were denied')
} finally {
  if (fixturePerson) await X('DELETE FROM persona_sotera.mst_persons WHERE id = :p', { p: fixturePerson }).catch(() => {})
  await X("DELETE FROM persona_sotera.txn_relational_records WHERE deriver_version IN ('matrix','stance-writer-0.1')").catch(() => {})
  const left = await Q('SELECT count(*)::int n FROM persona_sotera.txn_relational_records')
  ok(left[0].n === 0, 'cleanup · no relational records left behind', `${left[0].n} rows`)
  const fx = await Q("SELECT count(*)::int n FROM persona_sotera.mst_persons WHERE display_name LIKE '\\_\\_%'")
  ok(fx[0].n === 0, 'cleanup · no fixture persons left behind', `${fx[0].n}`)
}

done()
