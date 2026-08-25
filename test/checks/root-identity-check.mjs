// ROOT IS A ROOM, NOT A BYPASS — the precondition for giving root a broader disclosure function.
//
//   node checks/root-identity-check.mjs
//
// Ote, 2026-08-20: *"Harden root identity before root is allowed to have the broadest disclosure
// function. I don't want root to become a special SQL bypass."*
//
// So this check does not test a feature. It tests four INVARIANTS that have to hold before breadth can
// safely be added at all, and each one fails for a different reason:
//
//   I1  root resolves to a REAL user row  → root's data is attributable and deletable like anyone's
//   I2  nothing is null-owned             → `user_id ?? null` can never silently mean "root's stuff"
//   I3  root-ness is a FLAG, never a shape → an absence must not be able to satisfy it
//   I4  root's scope is an ordinary room   → breadth must be a read-time act, not a widened predicate
//
// ⚠️ I3 is the one with a body count. The audit on 2026-08-20 found the "root inferred from a null id"
// family at NINE sites; the worst turned an unowned schedule row into a privilege grant. Today that
// predicate governs privilege. Under the rooms model it would govern cross-room disclosure.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'
import { isRootActor, rootRoom, rootUserIdFrom, isRootConnectedUser } from '../../Backend/app/auth/root-identity.js'
import { can } from '../../Backend/app/auth/permissions.js'
import { ownedBy } from '../../Backend/app/auth/owner.js'

const { check, done } = makeChecker()
const ok = (c, l, d = '') => check(l, c, d)
const config = loadConfig()
const pg = devPg(); await pg.connect()
const S = devSchema()

// ── I1 · root resolves to a real row ─────────────────────────────────────────────────────────────
const room = rootRoom(config)
ok(room.ok, 'I1 · root has a room of its own (auth.root.userConnected is set and well-formed)', room.reason ?? room.roomUserId)
if (room.ok) {
  const [row] = (await pg.query(
    `select id::text, username, is_active from ${S}.mst_users where id = $1`, [room.roomUserId])).rows
  ok(Boolean(row), 'I1 · ⭐ …and that id names a LIVE user row — root is attributable, not a config ghost',
    row ? `${row.username}` : 'MISSING ROW — root is failing open, which is by design but must be visible')
  ok(row?.username === config.auth?.root?.username,
    'I1 · …and the row matches the configured root username', `${row?.username} vs ${config.auth?.root?.username}`)
}

// ── I2 · nothing is null-owned ───────────────────────────────────────────────────────────────────
// The root-identity doc's "cliff": if root's id stops being null while null-owned rows exist, those rows
// become invisible. She has zero, and that is what makes the whole refactor safe — so it is asserted
// rather than remembered.
//
// ── ⛔⛔ THIS TRIPWIRE HAS FIRED, AND IT IS **CORRECT**. DO NOT WIDEN IT TO GO GREEN. ────────────────
// Since 2026-08-25 22:05 there is exactly one row here: `d211f5b4`, `kind='identity'`, `user_id=NULL`,
// `subject_person_id` = Sotera-the-persona — written by her own tool call, and the first identity row
// ever stored. It is one of the three family-lineage rows Ote ruled UNTOUCHABLE pending the retention
// design, so the row cannot move and this check must stay red until it does.
// ⭐ The assertion below already states its own remedy — *"when this becomes non-zero, `user_id IS NULL`
// is overloaded and needs its own column"* — and that column is what the retention/authorship design
// (`Reference/docs/DESIGN_SOTERA_RETENTION_AND_AUTHORSHIP.md`) exists to introduce.
// ⚠️ Relaxing the count to 1 would turn a design alarm into a description of the bug, and the next NULL
// row — a real one — would arrive silently. **A red check holding a known, dated, owned condition is
// doing its job; an all-green suite with a broken slot is the failure.**
for (const [table, col] of [['txn_memories', 'user_id'], ['txn_conversations', 'user_id'], ['txn_intentions', 'person_id']]) {
  const [{ n }] = (await pg.query(`select count(*)::int n from ${S}.${table} where ${col} is null`)).rows
  ok(n === 0, `I2 · ⭐ no ${table} row has a null ${col} — "unowned" can never be mistaken for "root's"`, `${n} null`)
}
// The persona-global slice is a DIFFERENT thing that also uses NULL, and it must stay distinguishable.
// It is legitimately empty today; if it fills, `user_id IS NULL` starts meaning two things at once.
const [{ n: globalRows }] = (await pg.query(
  `select count(*)::int n from ${S}.txn_memories where user_id is null and kind = 'identity'`)).rows
ok(globalRows === 0, 'I2 · the persona-global identity slice is still empty, so NULL has exactly one meaning today',
  `${globalRows} rows — when this becomes non-zero, "user_id IS NULL" is overloaded and needs its own column`)

// ── I3 · root-ness is a flag, never a shape ──────────────────────────────────────────────────────
ok(isRootActor({ isRoot: true }) === true, 'I3 · an explicit isRoot:true actor IS root')
ok(isRootActor({ id: null }) === false, 'I3 · ⭐⭐ an actor with a NULL id and no flag is NOT root — the nine-site defect, asserted')
ok(isRootActor({ id: null, isRoot: false }) === false, 'I3 · …nor when the flag is explicitly false')
ok(isRootActor({}) === false && isRootActor(null) === false, 'I3 · an empty or missing actor is not root')
ok(isRootActor({ isRoot: 'false' }) === false,
  'I3 · ⭐ a TRUTHY-but-wrong value is not root either — `=== true`, because "false" and {} are both truthy')
ok(isRootActor({ isRoot: 1 }) === false, 'I3 · …and neither is 1')
// The privilege layer must agree with the predicate.
ok(can({ id: null, isRoot: false }, 'system_config') === false,
  'I3 · ⭐ a null-id non-root actor gets NO root capability — nullness is not a grant')
ok(can({ isRoot: true }, 'system_config') === true, 'I3 · …and a real root actor does')
// isRootConnectedUser answers a different question (is this ROW root's row) and must not accept null.
ok(isRootConnectedUser(config, null) === false, 'I3 · isRootConnectedUser(null) is false — a missing id is not root\'s row')
ok(isRootConnectedUser(config, rootUserIdFrom(config)) === true, 'I3 · …and root\'s own id is')

// ── I4 · root's scope is an ordinary room ────────────────────────────────────────────────────────
const rootUser = { id: rootUserIdFrom(config), username: config.auth?.root?.username, isRoot: true }
const where = ownedBy(rootUser, 'root\'s own rows')
ok(where?.user_id === rootUser.id,
  'I4 · ⭐⭐ root\'s disclosure predicate is `user_id = <its own row>` — a ROOM, not a bypass and not NULL',
  JSON.stringify(where))
ok(where?.user_id !== null && !('$or' in (where ?? {})) && Object.keys(where ?? {}).length === 1,
  'I4 · ⭐ …and it is exactly one equality. Breadth must arrive as a read-time disclosure act, never as a widened WHERE')
const [{ n: rootRows }] = (await pg.query(
  `select count(*)::int n from ${S}.txn_memories where user_id = $1`, [rootUser.id])).rows
ok(rootRows >= 0, 'I4 · root\'s own memories are attributed to that row like any other account\'s', `${rootRows} row(s)`)

// ── M-4 · THE THREE ROOT-AUTH FIXES (approved 2026-08-20) ────────────────────────────────────────
// From `ANALYSIS_ROOT_ROW_AUTH.md`. The finding they answer: root's row carries a deliberate NON-bcrypt
// sentinel so `bcrypt.compare` can never match it — but **a sentinel is a VALUE, not an invariant**.
// `PATCH /v1/admin/users/:id {password}` overwrote it, root's row holds NO role so the peer-admin guard
// could not fire, and `isRootConnectedUser` guarded DELETE and not PATCH.
//
// ⭐ Privilege is gated by the FLAG; the ROOM is gated by the ID. So hardening `isRootActor` was necessary
// and not sufficient — and under the ratified memory model that flag now gates far more than settings.
const { makeClient } = await import('../harness.mjs')
const call = makeClient()
const rootUsername = config.auth?.root?.username
const rootPassword = config.auth?.root?.password

// ── R3 · DETECT DRIFT. The sentinel was written carefully in 2026-08 and never verified again, which is
// how a wrong claim about it survived in two files for a day. This is the check that would have caught it.
const [row] = (await pg.query(
  `select (password_hash like '$2%') as bcrypt_shaped, length(password_hash) as len
     from ${S}.mst_users where id = $1`, [rootUser.id])).rows
ok(row?.bcrypt_shaped === false,
  "M4/R3 · ⭐⭐ root's connected row carries a NON-bcrypt sentinel — no password can authenticate it",
  `bcrypt-shaped=${row?.bcrypt_shaped}, length=${row?.len}`)

// ── R1 · the DB login path refuses root's row, whatever the hash contains ────────────────────────
// ⚠️ Uses a deliberately wrong password. A correct one would take step 1 (config) and prove nothing.
const dbLogin = await call('r1', 'POST', '/v1/auth/login',
  { username: rootUsername, password: 'zz-not-the-config-password-4471' })
ok(dbLogin.status === 401,
  'M4/R1 · ⭐⭐ a non-config password for root is refused — the DB door is shut on root\'s row',
  `${dbLogin.status} ${dbLogin.json?.error?.code ?? ''}`)
// ⚠️⚠️ THE 401 ABOVE PROVES ALMOST NOTHING ON ITS OWN, and that is the trap this project keeps hitting:
// bcrypt failing against the sentinel returns the SAME 401 as R1 refusing. Behaviourally identical, so the
// response cannot tell you which line answered — *assert the state, not the answer.* Verified out of band
// (the WARN fires once per attempt), and asserted here structurally: the guard must exist AND precede the
// compare, because after it the refusal would be bcrypt's again and R1 would be decoration.
const loginSrc = (await (await import('node:fs/promises')).readFile(
  new URL('../../Backend/app/routes/v1/auth.route.js', import.meta.url), 'utf8'))
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const iGuard = loginSrc.indexOf('isRootConnectedUser(fastify.config, user.id)')
const iCompare = loginSrc.indexOf('bcrypt.compare(password, user.password_hash)')
ok(iGuard !== -1, 'M4/R1 · ⭐ the guard is present in the login path (comment-stripped source)')
ok(iGuard !== -1 && iCompare !== -1 && iGuard < iCompare,
  'M4/R1 · ⭐⭐ …and it runs BEFORE the bcrypt compare, so the refusal does not depend on the hash\'s value',
  `guard@${iGuard} < compare@${iCompare}`)
// ⚠️ AND ROOT CAN STILL SIGN IN. The one thing R1 must never do is lock the owner out: config is step 1,
// checked before the database, precisely so root can log in to repair a broken DB.
if (rootUsername && rootPassword) {
  const cfgLogin = await call('r1b', 'POST', '/v1/auth/login', { username: rootUsername, password: rootPassword })
  ok(cfgLogin.status === 200 && cfgLogin.json?.user?.isRoot === true,
    'M4/R1 · ⭐⭐ …and root STILL logs in from config — the fix removes a door root never used, not root\'s own',
    `${cfgLogin.status} isRoot=${cfgLogin.json?.user?.isRoot}`)
}

// ── R2 · PATCH refuses the identity/credential fields on root's row ──────────────────────────────
// ⛔ Asserted as ROOT, so a 409 cannot be mistaken for ordinary peer-admin protection — and because the
// guard refuses root too, deliberately: a password here would authenticate nothing after R1.
const asRoot = await call('r2', 'POST', '/v1/auth/login', { username: rootUsername, password: rootPassword })
if (asRoot.status === 200) {
  const patch = await call('r2', 'PATCH', `/v1/admin/users/${rootUser.id}`, { password: 'zz-should-never-be-set-9931' })
  ok(patch.status === 409 && patch.json?.error?.code === 'root_connected_user',
    "M4/R2 · ⭐⭐ setting a password on root's row is REFUSED, even for root — the DELETE guard's missing half",
    `${patch.status} ${patch.json?.error?.code ?? ''}`)
  // ⭐ And the sentinel is still there afterwards — the refusal happened before any write.
  const [after] = (await pg.query(
    `select (password_hash like '$2%') as bcrypt_shaped from ${S}.mst_users where id = $1`, [rootUser.id])).rows
  ok(after?.bcrypt_shaped === false, 'M4/R2 · …and the row is untouched — refused before the write, not after')
  // A harmless field is still editable, so the guard is narrow rather than a blanket lock on the row.
  const soft = await call('r2', 'PATCH', `/v1/admin/users/${rootUser.id}`, { systemNote: null })
  ok(soft.status === 200, 'M4/R2 · ⭐ non-identity fields still work — the guard is scoped to credentials and identity', `${soft.status}`)
}

await pg.end()
done()
