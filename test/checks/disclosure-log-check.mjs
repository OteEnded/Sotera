// THE DISCLOSURE EVENT LOG — and the fact that NOTHING TOUCHES IT YET.
//
//   node checks/disclosure-log-check.mjs
//
// Stage 2 of the D-4/D-5 build. Ote's instruction was unusually specific about what this stage must NOT
// do: *"Stage 2 must remain completely inert: no writer, no reader, no authority change, metadata only,
// absolutely no content column, migration assertions proving the absence of content storage."*
//
// ⭐ SO INERTNESS IS THE THING UNDER TEST, and it is asserted rather than promised. "Nothing writes it"
// is a claim about the whole codebase, and a claim about the whole codebase is exactly the kind that
// stops being true without anyone noticing — the `mirror-needs-a-mechanism` failure, where a unit-tested
// module turned out to be imported by nothing, ran the same shape in reverse.
//
// The migration's own DO block already asserts the schema. This re-asserts it independently, because a
// migration proves the state at the moment it ran and a check proves the state now — and 005 shipped a
// column with no generation expression precisely because "exit 0" was the only thing anyone looked at.
//
// ⚠️ SOURCE SCANS RUN OVER COMMENT-STRIPPED CODE. A previous check "passed" three source assertions by
// matching my own explanatory comments, which is a test grading its own prose.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker()
const ok = (c, l, d = '') => check(l, c, d)
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows

const TABLE = 'log_disclosure_events'
const BACKEND = new URL('../../Backend/', import.meta.url).pathname.replace(/^\//, '')

try {
  // ── T · the table exists, in her schema, with the agreed metadata ────────────────────────────────
  const cols = new Map((await q(
    `SELECT column_name, data_type, is_nullable, udt_name FROM information_schema.columns
      WHERE table_schema=$1 AND table_name=$2`, [S, TABLE])).map((c) => [c.column_name, c]))
  ok(cols.size > 0, `T · ${TABLE} exists in ${S}`, `${cols.size} column(s)`)
  for (const name of ['disclosed_at', 'from_room_user_id', 'into_room_user_id', 'into_conversation_id',
    'authorized_by_user_id', 'authorized_by_username', 'authorized_via', 'interaction_id',
    'subject_person_id', 'scope_kind', 'scope_limit', 'item_count', 'lifetime', 'expires_at', 'revoked_at']) {
    ok(cols.has(name), `T · records \`${name}\``)
  }
  ok(cols.get('from_room_user_id')?.is_nullable === 'NO' && cols.get('into_room_user_id')?.is_nullable === 'NO',
    'T · ⭐ both sides of the boundary are mandatory — a disclosure with an unknown direction is not a record of anything')
  ok(cols.get('authorized_via')?.is_nullable === 'NO',
    'T · ⭐⭐ HOW it was authorized is mandatory — an unauthorized row cannot be written by omission')

  // ── A · ABSENCE. The columns that must not exist, re-asserted outside the migration ─────────────
  // ⛔ Item ids count as content: given an id and any future reader, the material is one join away.
  const forbidden = ['content', 'text', 'body', 'payload', 'value', 'fact', 'facts', 'intent', 'summary',
    'topic', 'title', 'note', 'items', 'item_ids', 'memory_id', 'memory_ids', 'message_id', 'message_ids',
    'scope', 'excerpt', 'snippet', 'transcript', 'from_room_name', 'into_room_name', 'room_name']
  const present = forbidden.filter((f) => cols.has(f))
  ok(present.length === 0, 'A · ⭐⭐ no column can hold what was disclosed, or which rows crossed', present.join(', ') || 'none present')
  const looksLikeContent = [...cols.keys()].filter((c) => /content|payload|excerpt|snippet|transcript/i.test(c))
  ok(looksLikeContent.length === 0, 'A · ⭐ …and none by a name we did not think of either', looksLikeContent.join(', ') || 'none')
  // ⭐ The asymmetry, stated as a test: an authorizer's login name is attribution and is kept; a ROOM
  // name is a topic its owner chose, which the RFC already ruled is content (`Ote_Divorce_Lawyer`).
  ok(cols.has('authorized_by_username') && !cols.has('from_room_name') && !cols.has('into_room_name'),
    'A · ⭐⭐ attribution snapshot YES, room-name snapshot NO — a login name is attribution, a room label is a topic')

  // ── F · loose refs only. The evidence must outlive everything it points at ──────────────────────
  const [{ n: fks }] = await q(
    `SELECT count(*)::int n FROM information_schema.table_constraints
      WHERE table_schema=$1 AND table_name=$2 AND constraint_type='FOREIGN KEY'`, [S, TABLE])
  ok(fks === 0, 'F · ⭐ zero foreign keys — deleting a room or a user degrades the record, never deletes the evidence', `${fks}`)

  // ── E · the two enums that are INVARIANTS, not vocabularies ─────────────────────────────────────
  const enumVals = async (t) => (await q(
    `SELECT e.enumlabel l FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname=$1 ORDER BY e.enumsortorder`,
    [t])).map((r) => r.l)
  const authz = await enumVals('disclosure_authz')
  ok(authz.length === 1 && authz[0] === 'held_turn_card',
    'E · ⭐⭐ disclosure_authz can say ONLY held_turn_card — the schema cannot record a prose authorization',
    authz.join(', '))
  const life = await enumVals('disclosure_lifetime')
  ok(life.length === 2 && !life.includes('standing'),
    'E · ⭐ disclosure_lifetime has turn and conversation and NO standing — a standing grant is room-merging with extra steps',
    life.join(', '))
  const scope = await enumVals('disclosure_scope')
  ok(scope.length === 5, 'E · ⭐ the scope is a CLOSED vocabulary, not a sentence', scope.join(', '))

  // ── C · the sanity constraints ──────────────────────────────────────────────────────────────────
  const cons = (await q(
    `SELECT conname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 AND t.relname=$2 AND c.contype='c'`,
    [S, TABLE])).map((r) => r.conname)
  ok(cons.includes('log_disclosure_events_crosses_rooms'),
    'C · ⭐ a "disclosure" into the room it came from is refused by the schema — no boundary, no event', cons.join(', '))

  // ── I · INERTNESS. The claim that makes this stage safe to apply ahead of the code ──────────────
  const [{ n: rows }] = await q(`SELECT count(*)::int n FROM ${S}.${TABLE}`)
  // ⭐ NOT "empty" any more — rows are the POINT now. What must still hold is that every row was
  // authorized by a card and by nothing else, which is the invariant the enum exists to enforce.
  // ⛔ A row with any other authority, or with no interaction behind it, means prose got in.
  const { rows: authzRows } = await pg.query(`select authorized_via, count(*)::int n,
      count(*) filter (where interaction_id is null)::int no_proof from ${S}.log_disclosure_events
      group by authorized_via`)
  ok(authzRows.every((r) => r.authorized_via === 'held_turn_card'),
    'I · ⭐⭐ every row was authorized by a held-turn card — no other authority has ever written one',
    authzRows.map((r) => `${r.authorized_via}:${r.n}`).join(' ') || 'no rows yet')
  ok(authzRows.every((r) => r.no_proof === 0),
    'I · ⭐ and every row names the interaction that proved it',
    authzRows.map((r) => `${r.authorized_via} missing=${r.no_proof}`).join(' ') || 'no rows yet')

  // Walk Backend/ (excluding migrations, which are where the name is supposed to appear) and look for any
  // reference at all — a query, a model, a constant. Comments are stripped first.
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1').replace(/--[^\n]*/g, '')
  const hits = []
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) {
        if (e === 'node_modules' || e === 'migrations' || e === '.git') continue
        walk(p); continue
      }
      if (!/\.(js|mjs|cjs|json|sql)$/.test(e)) continue
      const body = strip(readFileSync(p, 'utf8'))
      if (body.includes(TABLE) || /disclosure_(authz|scope|lifetime)/.test(body)) hits.push(relative(BACKEND, p))
    }
  }
  walk(BACKEND)
  // ── ⭐⭐ THE INERTNESS INVARIANT WAS RETIRED ON PURPOSE, AND REPLACED BY A NARROWER ONE ────────────
  // Stage 2 required this table to be untouched: *"no writer, no reader, no authority change."* Ote
  // authorized the writer on 2026-08-20 — *"Go ahead with inspect_around and the authorization/card path
  // in the same pass… the next layer should actually be usable rather than shipping as an intentionally
  // inert capability."* ⇒ asserting inertness now would assert a decision he reversed.
  //
  // ⛔ What replaces it is STRONGER than "nothing touches it": **exactly one file may, and it is the one
  // that verifies a stored card.** A second writer anywhere is how authorization starts arriving from
  // somewhere that never checked a human answered.
  // ⚠️ Separator-agnostic on purpose: `relative()` yields backslashes on Windows, and a literal
  // 'app\components\...' is not even the string it looks like — \c and \d are not escapes, so JS silently
  // eats the backslashes and the comparison can never match.
  const norm = (p) => p.replace(/\\/g, '/')
  const ALLOWED = ['app/components/disclosure-host.js']
  const stray = hits.filter((h) => !ALLOWED.includes(norm(h)))
  ok(stray.length === 0,
    'I · ⭐⭐ ONLY disclosure-host.js touches the table — one writer, and it is the one that verifies the card',
    stray.join(', ') || `${hits.length} allowed reference(s)`)
  ok(hits.length > 0,
    'I · ⭐ …and it IS wired now — the capability is usable, not decoratively inert',
    hits.join(', '))

  // A Sequelize model would be enough on its own to make it non-inert: `sync()` would touch it and any
  // route could read it without naming the table.
  const models = readdirSync(join(BACKEND, 'database', 'models'))
  ok(!models.some((m) => /disclosure/i.test(m)),
    'I · ⭐ …and no model file defines it, so sync() cannot reach it either',
    models.filter((m) => /disclosure/i.test(m)).join(', ') || 'none')
} finally {
  await pg.end()
}

done()
