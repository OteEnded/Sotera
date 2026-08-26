// ⭐⭐⭐ QUARANTINE, NOT CORRECTION — stop a wrong name governing identity resolution, change nothing else.
//
//   node pipeline/identity-quarantine.mjs             (DRY RUN)
//   node pipeline/identity-quarantine.mjs --apply
//   node pipeline/identity-quarantine.mjs --release    (undo — clears the marks)
//
// Ote, 2026-08-26: *"First, quarantine the bad 'Cogito' preferred-name row from influencing identity
// resolution… ⛔ Do not silently correct my identity rows yet… I want the mechanism fixed before we
// reconcile those rows."*
//
// ── ⭐⭐ THE MECHANISM ALREADY EXISTS AND IS THE RIGHT ONE ─────────────────────────────────────────
// Migration 030's `contradicted_at` means **superseded-in-meaning, still standing** — the row stays
// durable, readable and auditable, and stops participating in normal retrieval as current truth. And
// `getIdentity` / `setIdentity` both read `store.findOwnLive(...)`, which B2 taught to exclude
// contradicted rows. ⇒ marking one row quarantines it from identity resolution **without touching its
// content, its value, its author, its provenance or its dates.**
//
// ⛔ WHAT THIS IS NOT: not a correction, not an invalidation, not a supersession. `invalid_at` stays
// null — *"this was replaced"* and *"somebody says this is wrong"* are different states and 030 exists
// to keep them apart. ⭐ Fully reversible: `--release` clears the marks and the rows govern again.
//
// ── ⭐ THE EVIDENCE IS THE ROW'S OWN SOURCE MESSAGE, WHICH IS THE HONEST POINTER ───────────────────
// `contradicted_by_message_id` names *the message that repudiates the belief*. Here that is the very
// message the name was taken from: reading it shows the name belongs to the person being **quoted**, not
// to the account holder who typed it. ⇒ the contradiction points at the same text the capture did, and a
// human following it sees the mistake immediately.

import { devPg, devSchema } from '../harness.mjs'

const APPLY = process.argv.includes('--apply')
const RELEASE = process.argv.includes('--release')

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows

// ⛔ AN EXPLICIT ID LIST, NOT A PREDICATE. A predicate would eventually match something nobody examined,
// and these are his account's rows. Both are class A from `identity-forensics.mjs`: the stored name sits
// inside a DOUBLE-QUOTED relayed utterance in a message the account holder typed.
const TARGETS = [
  { id: '49111883', why: 'the name is inside a quoted relay — "Hi, Sotera. I\'m Cogito. I\'m your uncle."' },
  // ⚠⚠ MY REASON FOR INCLUDING THIS ROW WAS WRONG, AND THE RUN SAID SO.
  // I argued that quarantining only Cogito would PROMOTE `"Being Your"`, because `getIdentity` reads
  // newest-first. ⛔ It would not have: `b8a4660b` already carries `expired_at = 2026-08-14` from tier
  // decay, and `findOwnLive`'s LIVE predicate filters `expired_at` as well as `invalid_at` — so it had
  // not been governing anything for twelve days. **Only Cogito was actually live.**
  // ⭐ It stays on the list because it IS the same failure class and is worth having marked as such — the
  // mark is honest and reversible — ⛔ but the row is recorded here as inert-already, not as a promotion
  // I prevented. Checking the predicate before writing the justification would have caught it.
  // (It is Ote quoting SOTERA'S OWN WORDS back to her: *"But if I'm being your daughter…"*.)
  { id: 'b8a4660b', why: 'the same class: a fragment of Ote quoting Sotera back to herself' },
]

const rows = await q(
  `select m.id::text id, m.value, m.contradicted_at, m.invalid_at, m.source_message_id::text smid,
          u.username room, left(msg.content, 120) src
     from ${S}.txn_memories m
     left join ${S}.mst_users u on u.id = m.user_id
     left join ${S}.txn_messages msg on msg.id = m.source_message_id
    where m.attribute = 'preferred_name' and left(m.id::text, 8) = any($1::text[])`,
  [TARGETS.map((t) => t.id)])

if (rows.length !== TARGETS.length) {
  console.error(`✖ expected ${TARGETS.length} rows, found ${rows.length} — refusing to act on a set I cannot account for`)
  process.exit(1)
}

console.log(`\n══ ${RELEASE ? 'RELEASE' : 'QUARANTINE'} · identity rows in root's room ═══════════════`)
for (const r of rows) {
  const t = TARGETS.find((x) => r.id.startsWith(x.id))
  console.log(`\n   ${r.id.slice(0, 8)}  room=${r.room}  preferred_name = ${JSON.stringify(r.value)}`)
  console.log(`      why        : ${t.why}`)
  console.log(`      source msg : ${r.smid ? r.smid.slice(0, 8) : '⛔ none'}  "${String(r.src ?? '').replace(/\s+/g, ' ').slice(0, 90)}"`)
  console.log(`      now        : contradicted_at=${r.contradicted_at ?? 'null'}  invalid_at=${r.invalid_at ?? 'null'}`)
}

if (!APPLY && !RELEASE) {
  console.log('\n   DRY RUN — pass --apply to quarantine, or --release to undo. Nothing changed.')
  await pg.end(); process.exit(0)
}

for (const r of rows) {
  if (RELEASE) {
    await pg.query(`update ${S}.txn_memories set contradicted_at = null, contradicted_by_message_id = null where id = $1`, [r.id])
  } else {
    // ⛔ ONLY these two columns. Everything that says what the row MEANT is left exactly as written.
    await pg.query(
      `update ${S}.txn_memories set contradicted_at = now(), contradicted_by_message_id = $2 where id = $1`,
      [r.id, r.smid])
  }
}

const after = await q(
  `select left(m.id::text,8) id, m.value, m.contradicted_at, m.invalid_at, m.expired_at, m.content
     from ${S}.txn_memories m where left(m.id::text,8) = any($1::text[])`, [TARGETS.map((t) => t.id)])
console.log(`\n   ${RELEASE ? 'released' : 'quarantined'}:`)
for (const r of after) {
  console.log(`      ${r.id}  contradicted_at=${r.contradicted_at ? 'SET' : 'null'}  `
    + `invalid_at=${r.invalid_at ?? 'null'}  expired_at=${r.expired_at ?? 'null'}  value=${JSON.stringify(r.value)}`)
}

// ⭐ PROVE THE EFFECT, don't assume it. What does identity resolution see now?
const live = await q(
  `select left(m.id::text,8) id, m.value from ${S}.txn_memories m
     join ${S}.mst_users u on u.id = m.user_id
    where u.username = 'ote' and m.attribute = 'preferred_name'
      and m.invalid_at is null and m.expired_at is null and m.contradicted_at is null`)
console.log(`\n   ⭐ what identity resolution now sees in root's room: ${live.length ? live.map((r) => `${r.id}=${JSON.stringify(r.value)}`).join(' ') : 'NOTHING — she falls back to the account name'}`)
console.log(`   ⛔ nothing was corrected. Reverse with:  node pipeline/identity-quarantine.mjs --release`)
await pg.end()
