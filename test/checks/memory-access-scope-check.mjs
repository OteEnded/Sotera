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
  const raw = await (await import('node:fs/promises')).readFile(
    new URL(`../../Backend/app/components/${f}`, import.meta.url), 'utf8')
  // ⚠️ CODE ONLY — a cognition file quotes Ote's constraint in a comment; citing the rule it obeys must
  // not be a failure.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')
  ok(!/access_sotera_memory|memory_access_scope|memoryAccessScope/.test(src),
    `5 · ⛔⛔ ${f} never asks whether she is allowed to remember`)
}

// ── ⭐⭐⭐ 6 · THE CONSOLE CONTROL · granting is ROOT's, and it leaves a trace ──────────────────────
//
// ⚠️ Added 2026-08-24 with the Console control. `memory_access_scope` decides what an account may be TOLD
// about her own history, so granting it is a DISCLOSURE act — and disclosure acts belong to root (D-4).
// ⛔ An `admin` who could grant it could grant themselves a view of her conversations with Ote.
// ⓘ The gate is the AUTHENTICATED `isRoot` flag, never the row id: `auth.route.js` can authenticate a
// non-root session onto root's row, so an id check would hand the grant to that login.
{
  const { makeClient } = await import('../harness.mjs')
  const call = makeClient()
  const { rows: [target] } = await pg.query(
    `SELECT id::text id, memory_access_scope s FROM "${S}".mst_users WHERE username = $1`, ['agent_dev'])
  const before = target.s
  ok(Boolean(target), '6 · a test account to work on', String(target?.id).slice(0, 8))

  // ⛔ A NON-ROOT ADMIN MUST BE REFUSED — and the row must not move.
  const adm = await call('a', 'POST', '/v1/auth/login', { username: 'agent_dev', password: 'agentdev123' })
  ok(adm.status === 200 && adm.json?.user?.isRoot === false && adm.json?.user?.capabilities?.manage_users === true,
    '6 · ⭐ the actor is a NON-ROOT admin — otherwise this proves nothing',
    `isRoot=${adm.json?.user?.isRoot} manage_users=${adm.json?.user?.capabilities?.manage_users}`)
  const refused = await call('a', 'PATCH', `/v1/admin/users/${target.id}`, { memoryAccessScope: 'sotera_memory' })
  ok(refused.status === 403 && refused.json?.error?.code === 'root_only',
    '6 · ⛔⛔ a non-root admin CANNOT grant access to her memory', `${refused.status} ${refused.json?.error?.code}`)
  const { rows: [afterRefusal] } = await pg.query(`SELECT memory_access_scope s FROM "${S}".mst_users WHERE id = $1`, [target.id])
  ok(afterRefusal.s === before, '6 · ⭐ …and the refusal left the scope untouched', `${before} → ${afterRefusal.s}`)

  // ⭐ ROOT CAN, AND IT AUDITS. A boundary change with no durable trace is one nobody can reconstruct.
  const root = await call('r', 'POST', '/v1/auth/login',
    { username: config.auth.root.username, password: config.auth.root.password })
  ok(root.status === 200 && root.json?.user?.isRoot === true, '6 · root session established')
  const granted = await call('r', 'PATCH', `/v1/admin/users/${target.id}`, { memoryAccessScope: 'sotera_memory' })
  ok(granted.status === 200, '6 · ⭐ root CAN grant it', String(granted.status))
  const { rows: [afterGrant] } = await pg.query(`SELECT memory_access_scope s FROM "${S}".mst_users WHERE id = $1`, [target.id])
  ok(afterGrant.s === 'sotera_memory', '6 · …and the row moved', afterGrant.s)
  const { rows: [audit] } = await pg.query(
    `SELECT field, old_value, new_value, changed_by FROM "${S}".log_user_changes
      WHERE user_id = $1 AND field = 'memory_access_scope' ORDER BY rolling_id DESC LIMIT 1`, [target.id])
  // ⚠️⚠️ THIS ASSERTION EXISTS BECAUSE IT FAILED FIRST TIME. `user_change_field` is an ALLOWLIST on the
  // model, and the new field name was not in it — so the row was written and the audit insert threw a 500.
  // It failed LOUDLY, which is the right direction, but a disclosure change with no trace is the thing the
  // audit is for.
  ok(audit?.new_value === 'sotera_memory' && audit?.changed_by === 'root',
    '6 · ⭐⭐ …and it left an AUDIT row naming root', JSON.stringify(audit ?? null))

  // ⭐ RESTORED. A check that leaves a grant behind is a security change, and it also fails §2 above.
  const restored = await call('r', 'PATCH', `/v1/admin/users/${target.id}`, { memoryAccessScope: before })
  const { rows: [end] } = await pg.query(`SELECT memory_access_scope s FROM "${S}".mst_users WHERE id = $1`, [target.id])
  ok(restored.status === 200 && end.s === before,
    '6 · ⛔ and it is put back exactly as found', `${end.s}, was ${before}`)
}

await pg.end()
done()
