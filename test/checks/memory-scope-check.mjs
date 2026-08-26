// ⭐⭐⭐ MIGRATION 029 · THE SCOPE AXIS — asserted as a live invariant, not as a one-off migration.
//
//   node test/checks/memory-scope-check.mjs
//
// ⛔ THE POINT IS THAT NULL CANNOT COME BACK. A migration proves a moment; this proves the property, on
// every run, including against rows written by code that has not been read yet.
//
// ── ⚠️ THE OVERLOAD THIS REPLACED ───────────────────────────────────────────────────────────────────
// `auth/root-identity.js`, 2026-08-06: *"`user_id IS NULL` means TWO different things — 'persona-global
// identity memory' (by design) and 'root wrote this' (by accident)."* Root has since been connected to a
// real users row, retiring the accident; the first identity row was written 2026-08-25, populating the
// design — and four assertions went red the same day saying the two had collided.
//
// ── ⭐ THE FOUR AXES, AND THE WHOLE REASON THIS FILE EXISTS ─────────────────────────────────────────
//     author   whose memory is this?       — her decision
//     subject  who is it about?            — free of author
//     owner    whose is it?                — ⛔ derived, never stored
//     scope    where is it reachable from? — ⭐ this column
// ⛔ ABOUT ≠ OWNER ≠ SCOPE. Every assertion below exists to stop two of them collapsing into one again.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'

const { check, done } = makeChecker('memory-scope')
const ok = (c, l, d = '') => check(l, c, d)
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows
const one = async (sql, p) => (await q(sql, p))[0]

// ── 1 · THE SCHEMA CANNOT EXPRESS THE OLD PROXY ───────────────────────────────────────────────────
const col = await one(
  `select data_type, is_nullable, column_default from information_schema.columns
    where table_schema = $1 and table_name = 'txn_memories' and column_name = 'scope'`, [S])
ok(!!col, '1 · the scope column exists')
ok(col?.is_nullable === 'NO', '1 · ⭐ scope is NOT NULL — a row cannot decline to say where it lives', String(col?.is_nullable))
ok(/room/.test(col?.column_default ?? ''), '1 · ⭐ …and defaults to `room` — a forgetful row loses reach, never gains it', String(col?.column_default))

const uid = await one(
  `select is_nullable from information_schema.columns
    where table_schema = $1 and table_name = 'txn_memories' and column_name = 'user_id'`, [S])
ok(uid?.is_nullable === 'NO',
  '1 · ⭐⭐⭐ `user_id` is NOT NULL — the overload is unrepresentable, not merely unused', String(uid?.is_nullable))

const vals = (await q(
  `select e.enumlabel l from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'memory_scope' order by e.enumsortorder`)).map((r) => r.l)
ok(vals.length === 2 && vals.includes('room') && vals.includes('persona_global'),
  '1 · the scope vocabulary is closed — room | persona_global', vals.join(', '))

// ── 2 · THE DATA HONOURS IT ───────────────────────────────────────────────────────────────────────
const [{ n: nulls }] = await q(`select count(*)::int n from ${S}.txn_memories where user_id is null`)
ok(nulls === 0, '2 · ⭐ no row has a null owner', `${nulls}`)
const [{ n: globals }] = await q(`select count(*)::int n from ${S}.txn_memories where scope = 'persona_global'`)
ok(globals >= 1, '2 · the persona-global slice is populated — the migration was not decorative', `${globals}`)
const [{ n: rootless }] = await q(
  `select count(*)::int n from ${S}.txn_memories where scope = 'persona_global' and user_id is null`)
ok(rootless === 0, '2 · ⭐⭐ every global row still records the room it was FORMED IN', `${rootless} without one`)

// ── 3 · ⭐⭐ THE ROW THE OVERLOAD WAS DISCOVERED ON ───────────────────────────────────────────────
// `d211f5b4` — the first identity row ever written, and the one that made the collision real.
// ⛔ Its AUTHOR is deliberately NOT asserted here. Ote: *"do not reconcile or mutate d211f5b4 just
// because its author looks wrong."* Author is a different axis and a different question, and 029 did not
// touch it — asserting it in a scope check would quietly make scope the arbiter of authorship.
const lineage = await one(
  `select left(id::text,8) id, kind, scope, user_id::text uid, subject_person_id::text subj
     from ${S}.txn_memories where id::text like 'd211f5b4%'`)
if (lineage) {
  ok(lineage.scope === 'persona_global',
    '3 · ⭐ d211f5b4 is persona_global — derived from the `identity` kind it was ALREADY written as', lineage.scope)
  ok(!!lineage.uid,
    '3 · ⭐⭐ …and it recovered its formation room from its own provenance chain — ⛔ never guessed', String(lineage.uid).slice(0, 8))
  const room = await one(`select username from ${S}.mst_users where id = $1`, [lineage.uid])
  ok(room?.username === 'ote',
    '3 · ⭐ …and that room is the one its source message actually belongs to', String(room?.username))
} else {
  ok(false, '3 · d211f5b4 not found — this check assumes the row that motivated 029')
}

// ── 4 · ⛔ NO READER MAY INFER SCOPE FROM A MISSING OWNER, EVER AGAIN ────────────────────────────
// ⭐ A source scan, and the anchor is asserted FIRST: a scan whose pattern stops matching reports a
// triumphant pass over nothing. This project has four recorded instances of exactly that.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '').replace(/--[^\n]*/g, '')
for (const [file, path] of [
  ['memory-store-sequelize-host.js', '../../Backend/app/components/memory-store-sequelize-host.js'],
  ['own-memory-host.js', '../../Backend/app/components/own-memory-host.js'],
]) {
  const src = strip(readFileSync(new URL(path, import.meta.url), 'utf8'))
  ok(/txn_memories|visibleWhere|scope/.test(src), `4 · ⛔ ANCHOR: the scan can still see ${file}`)
  ok(!/user_id IS NULL/i.test(src), `4 · ⭐⭐ ${file} never reads scope out of a missing owner`)
  ok(!/user_id:\s*null/.test(src), `4 · ⭐ …and never WRITES one either`, file)
}

// ── 5 · ⭐ THE AXES ARE STILL FOUR THINGS ────────────────────────────────────────────────────────
// ⛔ If scope were derivable from kind it would be a synonym and the overload would have moved house
// rather than gone. This reports the joint shape so a collapse is visible rather than assumed away.
const shape = await q(
  `select kind, scope, author, count(*)::int n from ${S}.txn_memories group by kind, scope, author order by n desc limit 8`)
ok(shape.length > 0, '5 · ⓘ kind × scope × author, so a collapse of two axes would show here',
  shape.map((r) => `${r.kind ?? 'null'}/${r.scope}/${r.author}:${r.n}`).join(' '))
// ⭐ The one structural rule the WRITER enforces, asserted as a rule and not as a coincidence: an
// identity row is global. ⛔ The converse is NOT asserted — a global row need not be `identity`, and
// pinning that would make the two columns synonyms.
const [{ n: identityNotGlobal }] = await q(
  `select count(*)::int n from ${S}.txn_memories where kind = 'identity' and scope <> 'persona_global'`)
ok(identityNotGlobal === 0, '5 · ⭐ every identity row is persona_global — the writer rule holds', `${identityNotGlobal} exceptions`)

await pg.end()
done()
