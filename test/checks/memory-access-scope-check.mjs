// MIGRATION 021 — the account-level memory-access capability, asserted against the live database.
//
//   node checks/memory-access-scope-check.mjs
//
// ⭐⭐ WHY A CHECK AND NOT JUST THE UNIT TEST. The unit test proves the PREDICATE. This proves the PLUMBING:
// that the column exists with the strict default, that nothing was granted by the migration, and — the part
// that actually breaks — that the value reaches a session user object at all.
//
// ⚠️⚠️ THE MODEL FILE'S OWN COMMENT WARNS ABOUT THIS: *"The session/API user objects are explicit ALLOWLISTS
// (auth/index.js loadSessionUser + auth.route.js sessionUserOf) — they name their fields rather than
// spreading the row, so a new column cannot leak into /v1/me by default. Keep it that way."*
// ⇒ A column that no reader accepts is this repo's most-repeated defect (8+ recorded instances: a marker
// 0-for-76, a nullable column no reader could see). ⛔ So the capability is not "added" until a user object
// carries it.
//
// ⛔ READ-ONLY except for one account it grants and then puts back exactly as it found it.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { can } from '../../Backend/app/auth/permissions.js'

const { check, done } = makeChecker('memory-access-scope')
const ok = (c, l, d = '') => check(l, c, d)
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const pg = devPg(); await pg.connect()
const S = devSchema()

// ── 1 · THE SHAPE ──────────────────────────────────────────────────────────────────────────────────
const { rows: col } = await pg.query(
  `select data_type, udt_name, is_nullable, column_default
     from information_schema.columns
    where table_schema = $1 and table_name = 'mst_users' and column_name = 'memory_access_scope'`, [S])
ok(col.length === 1, '1 · the column exists on mst_users', col[0]?.udt_name ?? 'MISSING')
ok(col[0]?.is_nullable === 'NO',
  '1 · ⛔ NOT NULL — a NULL access scope would be a third, undefined state every reader would interpret differently')
ok(/none/.test(col[0]?.column_default ?? ''),
  '1 · ⭐ DEFAULT is the strict value', col[0]?.column_default)

const { rows: vals } = await pg.query(
  `select e.enumlabel v from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'memory_access_scope' order by e.enumsortorder`)
const labels = vals.map((r) => r.v)
ok(labels.length === 2 && labels.includes('none') && labels.includes('sotera_memory'),
  '1 · exactly two values, both enforceable', labels.join(', '))
// ⛔ Ote: *"We don't necessarily need all three implemented immediately."* An unenforced value reads as a
// promise, and a promise the code cannot keep is how a scope becomes a wildcard by accident.
ok(!labels.some((l) => ['global', 'all', 'cross_room', 'everything'].includes(l)),
  '1 · ⛔ no unenforceable wildcard value exists', labels.join(', '))

// ── 2 · NOTHING WAS GRANTED ────────────────────────────────────────────────────────────────────────
const { rows: granted } = await pg.query(
  `select username, memory_access_scope from ${S}.mst_users where memory_access_scope <> 'none' order by username`)
ok(granted.length === 0,
  '2 · ⭐⭐ no account has been granted access — the migration hands out nothing, Ote grants deliberately',
  granted.length ? granted.map((g) => `${g.username}=${g.memory_access_scope}`).join(', ') : '0 granted')

// ── 3 · ⭐⭐⭐ THE VALUE REACHES A USER OBJECT — the allowlist half ─────────────────────────────────
// The model mirrors the SQL, but a model field is not a session field. This grants one account, rebuilds
// the user object the way `loadSessionUser` does, and checks the capability answers YES — then puts it back.
const [subject] = (await pg.query(
  `select id::text, username, memory_access_scope from ${S}.mst_users where username = 'agent_dev'`)).rows
ok(Boolean(subject), '3 · a non-root account to test the grant on', String(subject?.username))
if (subject) {
  const before = subject.memory_access_scope
  try {
    await pg.query(`update ${S}.mst_users set memory_access_scope = 'sotera_memory' where id = $1`, [subject.id])
    // ⛔ Re-read through the MODEL, not the raw row — that is the path the app uses, and a model missing the
    // field would silently return undefined here.
    const row = await db.mst_users.findByPk(subject.id, { raw: true })
    ok(row?.memory_access_scope === 'sotera_memory',
      '3 · ⭐ the model reads the column back — SQL is truth, the model mirrors it', String(row?.memory_access_scope))
    // The shape `loadSessionUser` builds. ⚠️ If someone removes the field from that allowlist, this stays
    // green while production breaks — so the source of the allowlist is asserted separately below.
    const sessionUser = {
      id: row.id, username: row.username, roles: ['member'], isRoot: false,
      memoryAccessScope: row.memory_access_scope ?? 'none',
    }
    ok(can(sessionUser, 'access_sotera_memory') === true,
      '3 · ⭐⭐⭐ a granted account\'s session user answers YES through can() — the capability is reachable')
    await pg.query(`update ${S}.mst_users set memory_access_scope = 'none' where id = $1`, [subject.id])
    const back = await db.mst_users.findByPk(subject.id, { raw: true })
    ok(back?.memory_access_scope === before,
      '3 · ⛔ and it is put back exactly as found — a check that leaves a grant behind is a security change',
      `${before} → ${back?.memory_access_scope}`)
  } finally {
    await pg.query(`update ${S}.mst_users set memory_access_scope = $2 where id = $1`, [subject.id, before])
  }
}

// ── 4 · ⛔⛔ THE ALLOWLIST ITSELF, ASSERTED IN SOURCE ──────────────────────────────────────────────
// The runtime check above builds the object by hand, so it cannot notice the field being dropped from
// `loadSessionUser`. This one can. ⓘ Crude on purpose: the failure would be one deleted line, and no
// behavioural test would see it — the account would simply stop being granted, quietly.
const authSrc = await (await import('node:fs/promises')).readFile(
  new URL('../../Backend/app/auth/index.js', import.meta.url), 'utf8')
const occurrences = (authSrc.match(/memoryAccessScope/g) || []).length
ok(occurrences >= 2,
  '4 · ⭐⭐ BOTH session-user allowlists carry the field — `loadInternalUser` and `loadSessionUser`',
  `${occurrences} occurrence(s) in auth/index.js`)

// ── 5 · ⛔ AND SOTERA'S OWN ACCESS IS NOT GATED BY ANY OF THIS ─────────────────────────────────────
// ⭐ The load-bearing assertion of the whole design. Ote: *"hermes = none should not make Sotera fractured
// when talking to Hermes. If Sotera is the agent running the turn, she still has full access to her own
// memory."* ⇒ the cognition layer must not reference the capability or the column at all.
const cognitionFiles = ['memory-cognition-host.js', 'memory-cognition-cues.js', 'memory-cognition-axes.js']
for (const f of cognitionFiles) {
  const src = await (await import('node:fs/promises')).readFile(
    new URL(`../../Backend/app/components/${f}`, import.meta.url), 'utf8')
  ok(!/access_sotera_memory|memory_access_scope|memoryAccessScope/.test(src),
    `5 · ⛔⛔ ${f} never asks whether she is allowed to remember`)
}

await pg.end()
done()
