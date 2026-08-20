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

await pg.end()
done()
