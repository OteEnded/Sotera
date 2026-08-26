// ⭐⭐⭐ LINEAGE + CONTRADICTION — the two mechanisms Phase 5 could build without a values call.
//
//   node test/checks/memory-lineage-check.mjs
//
// ── ⭐ WHAT THIS PROVES, AND WHAT IT DELIBERATELY DOES NOT ─────────────────────────────────────────
// PROVES  · every writer in the live store is RECOGNISED, so "is this an extraction?" has an answer
//         · the derivation axis is separable from the occasion axis, on a real row, end to end
//         · a contradiction can be recorded, names its evidence, and refuses when it cannot
// ⛔ DOES NOT prove anything about MODALITY. There is no modality axis; Ote's decision A is unmade, and
//    a check implying otherwise would be the first step toward reading one off the other.
// ⛔ DOES NOT touch the Rome rows, the three lineage rows, `56425175`, or any historical row. Every
//    write below is a fixture in the test account's own room, and is removed at the end.
//
// ⚠️ THE FIXTURES ARE agent_dev's. Root is Ote's account — his chats, his memories, his Options panel.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'
import { MECHANISM, mechanismOf, BASIS, derivedFromOf, lineageRestatesTheOccasion } from '../../Backend/app/components/memory-lineage.js'

const { check, done } = makeChecker('memory-lineage')
const ok = (c, l, d = '') => check(l, c, d)
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows
const one = async (sql, p) => (await q(sql, p))[0]

// ── 1 · MIGRATION 030 IS PRESENT AND HAS DECIDED NOTHING ─────────────────────────────────────────
const cols = await q(
  `select column_name, is_nullable, column_default from information_schema.columns
    where table_schema = $1 and table_name = 'txn_memories'
      and column_name in ('contradicted_by','contradicted_by_message_id','contradicted_at')`, [S])
ok(cols.length === 3, '1 · all three contradiction columns exist', cols.map((c) => c.column_name).join(' '))
// ⛔ A DEFAULT HERE WOULD MANUFACTURE A CLAIM ABOUT 92 ROWS NOBODY HAS EXAMINED. NULL must keep meaning
// "no contradiction has been recorded", which is not "checked and found consistent".
ok(cols.every((c) => c.is_nullable === 'YES' && c.column_default === null),
  '1 · ⭐ …all nullable with no default — absence stays honest',
  cols.map((c) => `${c.column_name}:${c.column_default ?? 'none'}`).join(' '))

// ⛔ AND THE EVIDENCE REF IS LOOSE. Same law as log_disclosure_events: deleting a conversation must
// degrade the record to "contradicted, source gone", never erase that a correction happened.
const [{ n: fks }] = await q(
  `select count(*)::int n from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    where tc.table_schema = $1 and tc.table_name = 'txn_memories'
      and tc.constraint_type = 'FOREIGN KEY' and kcu.column_name = 'contradicted_by_message_id'`, [S])
ok(fks === 0, '1 · ⭐ the message ref has NO foreign key — evidence outlives the conversation', `${fks} FKs`)

// ── 2 · EVERY LIVE WRITER IS RECOGNISED ──────────────────────────────────────────────────────────
// ⭐ Ote: *"provenance on extraction — but only to distinguish extraction from other sources."* This is
// that capability, asserted against the whole store rather than against a list I wrote from memory.
// ⛔ `unknown` is a DEFECT, not a bucket: a writer inventing a tag must fail here, loudly, on the run
// after it ships — the alternative is a silent "other" that grows for a month.
const sources = await q(`select distinct source from ${S}.txn_memories`)
const unknown = sources.map((r) => r.source).filter((s) => mechanismOf(s) === MECHANISM.unknown)
ok(unknown.length === 0, '2 · ⭐⭐ every `source` tag in the store maps to a known mechanism',
  unknown.length ? `UNRECOGNISED: ${unknown.slice(0, 3).join(' | ')}` : `${sources.length} distinct tags`)

const mechs = new Map()
for (const r of await q(`select source, count(*)::int n from ${S}.txn_memories group by source`)) {
  const m = mechanismOf(r.source)
  mechs.set(m, (mechs.get(m) ?? 0) + r.n)
}
ok((mechs.get(MECHANISM.extraction) ?? 0) > 0,
  '2 · ⭐ extraction is DISTINGUISHABLE from everything else — the question Ote asked this axis',
  [...mechs].map(([m, n]) => `${m}:${n}`).join(' '))

// ⛔ THE ONE THING THIS AXIS MUST NEVER BECOME. Rome is `extraction` + `quoted` and both are TRUE; the
// row is still a proverb stored as a goal. If a modality vocabulary ever appears, it must not be
// derived from either of these, and this assertion is where that gets caught.
const lineageSrc = readFileSync(new URL('../../Backend/app/components/memory-lineage.js', import.meta.url), 'utf8')
const code = lineageSrc.replace(/^\s*\/\/.*$/gm, '')   // ⛔ strip comments — they discuss modality on purpose
ok(!/figurative|aspirational|hypothetical|modality\s*[:=]/.test(code),
  '2 · ⭐⭐⭐ the mechanism module defines NO modality vocabulary — decision A is still Ote\'s')

// ── 3 · OCCASION ≠ DERIVATION, ON A REAL ROW ─────────────────────────────────────────────────────
// The fixture goes in agent_dev's room. ⚠️ If the account is missing this check FAILS rather than
// skipping: a check that silently does nothing is how a suite reports coverage it does not have.
const dev = await one(`select id from ${S}.mst_users where username = 'agent_dev'`)
ok(!!dev, '3 · the agent_dev fixture account exists', dev ? '' : 'create it before running this check')

const FIXTURE = '[lineage-check fixture] this row exists only for test/checks/memory-lineage-check.mjs'
let fixtureIds = []
if (dev) {
  await pg.query(`delete from ${S}.txn_memories where content = $1`, [FIXTURE])
  // A real message to point at, so `source_message_id` is a walkable id rather than a made-up uuid.
  const msg = await one(
    `select m.id, m.conversation_id from ${S}.txn_messages m
       join ${S}.txn_conversations c on c.id = m.conversation_id
      where c.user_id = $1 order by m.created_at desc limit 1`, [dev.id])
  const other = await one(`select id from ${S}.txn_memories where user_id = $1 limit 1`, [dev.id])
  if (msg && other) {
    const lineage = { derivedFrom: { basis: BASIS.inContext, memoryIds: [other.id], via: 'check' } }
    const row = await one(
      // ⚠️ `id` IS GENERATED BY SEQUELIZE (UUIDV4), NOT BY THE DATABASE — the column has no default, so a
      // raw INSERT must supply one. This is the same class of surprise as an ORM-undeclared column: what
      // the model provides and what the schema provides are two different lists.
      `insert into ${S}.txn_memories (id, persona, user_id, scope, namespace, kind, content, source,
                                      source_message_id, evidence, author, tier, created_at, updated_at)
       values (gen_random_uuid(), null, $1, 'room', 'default', 'semantic', $2, 'model-tool', $3, $4, 'persona', 'warm', now(), now())
       returning id, source_message_id, evidence`, [dev.id, FIXTURE, msg.id, JSON.stringify(lineage)])
    fixtureIds.push(row.id)
    const read = derivedFromOf(row.evidence)
    ok(!!read, '3 · ⭐ a lineage survives the round trip through JSONB', JSON.stringify(read))
    ok(read?.memoryIds?.[0] === other.id && String(row.source_message_id) === String(msg.id),
      '3 · ⭐⭐⭐ the OCCASION and the DERIVATION are two different ids on one row',
      `occasion=${String(msg.id).slice(0, 8)} derivation=${String(other.id).slice(0, 8)}`)
    ok(lineageRestatesTheOccasion(row) === false,
      '3 · ⭐ …and the row does not restate its occasion under a second name')

    // ── 4 · THE CONTRADICTION WRITE PATH ───────────────────────────────────────────────────────
    // ⭐⭐ `contradicted_by` has existed since migration 003 and been written ZERO times in 92 rows.
    // `7d383ce3` was repudiated twenty minutes after it was written and is live seventeen days later.
    // ⇒ the pipeline captured assertions and dropped retractions, because no path existed. This is it.
    await pg.query(
      `update ${S}.txn_memories set contradicted_at = now(), contradicted_by_message_id = $2 where id = $1`,
      [row.id, msg.id])
    const marked = await one(
      `select contradicted_at, contradicted_by_message_id, invalid_at, expired_at, content, confidence
         from ${S}.txn_memories where id = $1`, [row.id])
    ok(!!marked.contradicted_at && String(marked.contradicted_by_message_id) === String(msg.id),
      '4 · ⭐⭐ a contradiction can be recorded AND can name the message that made it')
    // ⛔ MARKED IS NOT DELETED, AND THAT IS THE WHOLE POINT. *"I used to think Rome was a project"* is
    // true and worth keeping. A row that silently vanishes cannot be audited or explained.
    ok(marked.invalid_at === null && marked.expired_at === null && marked.content === FIXTURE,
      '4 · ⭐⭐⭐ …and it changed NOTHING else — not the content, not invalid_at, not expired_at')

    // ⛔ AND NOTHING FILTERS ON IT YET. Whether a contradicted memory stays retrievable with its
    // contradiction attached, or leaves normal recall, is Ote's decision B and is UNMADE. This asserts
    // the current state honestly so the day it changes is a deliberate, visible day.
    const [{ n: stillVisible }] = await q(
      `select count(*)::int n from ${S}.txn_memories
        where id = $1 and invalid_at is null and expired_at is null`, [row.id])
    ok(stillVisible === 1,
      '4 · ⓘ a contradicted row is still LIVE by the store\'s own predicate — decision B is unmade')
  } else {
    ok(false, '3 · a fixture message and a sibling memory exist in agent_dev\'s room',
      'drive one turn as agent_dev first')
  }
}

// ── 5 · NOTHING WAS RECONCILED, AND THE ONE APPROVED ACT IS NAMED ───────────────────────────────
// ⚠️ THIS USED TO ASSERT "ZERO CONTRADICTED", AND IT FIRED CORRECTLY on 2026-08-26 when Ote approved a
// QUARANTINE: *"First, quarantine the bad 'Cogito' preferred-name row from influencing identity
// resolution."* ⛔ So it is NOT relaxed to a count — it is tightened to an **ALLOWLIST OF EXACT IDS**.
// ⭐ "Zero" would have to be weakened again on the next approved act; "exactly these and nothing else"
// gets STRONGER each time, because every future mark must be added here deliberately.
const QUARANTINED = ['49111883', 'b8a4660b'] // approved 2026-08-26 — relayed-speech names in root's room
const markedRows = await q(
  `select left(id::text,8) id, attribute from ${S}.txn_memories
    where contradicted_at is not null and content <> $1`, [FIXTURE])
const unapproved = markedRows.filter((r) => !QUARANTINED.includes(r.id))
ok(unapproved.length === 0,
  '5 · ⛔⛔ the ONLY contradicted rows are the ones Ote approved — nothing else was reconciled',
  unapproved.length ? `UNAPPROVED: ${unapproved.map((r) => `${r.id}(${r.attribute})`).join(' ')}` : `${markedRows.length} marked, all approved`)
// ⭐ AND A QUARANTINE IS NOT A CORRECTION: the rows keep their value and their dates. If a later pass
// "tidies" them into invalid_at, this goes red — which is exactly what it is for.
const intact = await q(
  `select left(id::text,8) id, value, invalid_at from ${S}.txn_memories
    where left(id::text,8) = any($1::text[])`, [QUARANTINED])
ok(intact.length === QUARANTINED.length && intact.every((r) => r.value != null && r.invalid_at === null),
  '5 · ⭐ …and they are QUARANTINED, not corrected — value intact, invalid_at still null',
  intact.map((r) => `${r.id}=${JSON.stringify(r.value)}${r.invalid_at ? ' ⛔INVALIDATED' : ''}`).join(' '))

// ⚠️ AND THE ASSERTION HERE IS **CONTRADICTED**, NOT "UNTOUCHED", BECAUSE UNTOUCHED WOULD BE FALSE.
// My first version of this check tested `contradicted_at IS NOT NULL OR invalid_at IS NOT NULL` and went
// red — correctly. `02b095e5` has carried `invalid_at = 2026-08-25 15:56` since before this work, set by
// ORDINARY SUPERSESSION when `676e17b9` replaced it (`supersedes_id` proves the chain). That is the
// reconcile lane doing its job, not a correction and not anything this phase did.
// ⭐ The instrument was wrong, so the instrument was fixed — ⛔ NOT the data. Repairing a live row to
// make an assertion I wrote go green is precisely the move Ote forbade: *"don't directly repair
// historical evidence just because it makes the system look cleaner."*
const rome = await q(
  `select left(id::text,8) id, contradicted_at, invalid_at, supersedes_id from ${S}.txn_memories
    where content ~* '\\mrome\\M' order by created_at`)
const romeContradicted = rome.filter((r) => r.contradicted_at).length
ok(romeContradicted === 0,
  '5 · ⛔⛔ no Rome row is marked CONTRADICTED — the reconciliation is reserved to Ote',
  rome.map((r) => `${r.id}:${r.contradicted_at ? 'CONTRA' : 'clean'}`).join(' '))

// ⭐⭐⭐ AND THE FINDING ITSELF IS ASSERTED RATHER THAN NARRATED. `7d383ce3` — the proverb stored as a
// goal — is STILL LIVE, seventeen days after being repudiated in conversation. ⛔ This assertion is
// meant to be true right now and to become false only when Ote approves a reconciliation. It is here so
// the drift stays visible on every run instead of living in a document nobody re-reads.
const origin = rome.find((r) => r.id === '7d383ce3')
ok(!!origin && !origin.invalid_at && !origin.contradicted_at,
  '5 · ⭐⭐ `7d383ce3` is STILL LIVE and unmarked — the drift is present, recorded, and not yet repaired',
  origin ? `invalid_at=${origin.invalid_at ?? 'null'} contradicted_at=${origin.contradicted_at ?? 'null'}` : 'row missing')

// ── 6 · THE TRACE IS WIRED WHERE THE IDS WERE BEING DROPPED ──────────────────────────────────────
// ⚠️ A MECHANISM IMPORTED BY NOTHING IS THE TRAP THIS PROJECT ALREADY FELL INTO ONCE: two files each
// said the OTHER normalised, so nobody did, and the tested module had no importers at all. So the check
// is not "does the trace work" (the unit tests answer that) but "is it CALLED at the two retrieval
// sites" — because a perfect trace nobody feeds records nothing.
for (const [file, needle] of [
  ['../../Backend/app/routes/v1/chat-site.route.js', 'noteRetrieved('],
  ['../../Backend/app/components/memory-pipeline-host.js', 'noteRetrieved('],
  ['../../Backend/app/components/memory-store-sequelize-host.js', 'tracedMemoryIds('],
]) {
  const src = readFileSync(new URL(file, import.meta.url), 'utf8')
  const body = src.replace(/^\s*\/\/.*$/gm, '')   // ⛔ a mention in a comment is not a call site
  ok(body.includes(needle), `6 · ⭐ ${file.split('/').pop()} actually calls ${needle}`)
}

// ── CLEANUP ──────────────────────────────────────────────────────────────────────────────────────
// ⛔ BY ID, and only the ids this run created. A predicate delete is how a cleanup eats something else.
if (fixtureIds.length) await pg.query(`delete from ${S}.txn_memories where id = any($1::uuid[])`, [fixtureIds])
const [{ n: leftover }] = await q(`select count(*)::int n from ${S}.txn_memories where content = $1`, [FIXTURE])
ok(leftover === 0, '⭐ the fixture rows were removed', `${leftover} left behind`)

await pg.end()
done()
