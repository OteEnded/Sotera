// MEMORY LIFECYCLE — the invariants that live ONLY in the service, asserted through the USER-FACING route.
//
//   node checks/memory-lifecycle-check.mjs
//
// ⚠️ THIS EXISTS BECAUSE THE UI DELETE BYPASSED THE SERVICE FOR MONTHS AND NOTHING NOTICED.
// `DELETE /chat/memory/v2/:id` archived the row with a direct `txn_memories.update(...)`, skipping:
//   1. the AUDIT row  — so a deliberate user deletion left no record at all
//   2. UN-SUPERSEDE   — so forgetting a belief that displaced another left the slot EMPTY instead of
//                       reverting to the belief it had displaced
// The admin route had already been fixed for exactly this reason. The user-facing path had not.
//
// 🔑 THE POINT OF THIS CHECK IS THE *PATH*, NOT THE FUNCTION. `mem.forget()` was always correct; what
// broke was that a route reached around it. A unit test on the service would have stayed green through
// the entire bug. So this drives the real HTTP endpoint and then asks the DATABASE what happened.
//
// ⚡ DELIBERATELY MODEL-FREE. Rows are seeded with SQL, so this is deterministic, needs no GPU, and
// takes about a second — which is what lets it run on every `npm test` instead of "when we remember".
// A lifecycle invariant guarded by a check too slow to run is guarded by nothing.
//
// ⛔ agent_dev only. Root is Ote's account.
import { makeChecker, makeClient, devPg, devSchema, asAgent } from '../harness.mjs'
import { randomUUID } from 'node:crypto'

const { check, done } = makeChecker()
const call = makeClient()
const who = await asAgent(call)
const db = devPg(); await db.connect()
const S = devSchema()

const me = (await db.query(`select id from ${S}.mst_users where username='agent_dev'`)).rows[0]?.id
check('agent_dev resolved', Boolean(me), me)

// ⛔ OBSERVATION ACCOUNTS MUST NEVER BE CLEANED. This wipe is correct for a TEST account — the suite is
// testing deletion, so it needs a clean slate — but on 2026-08-19 the observation account and the test
// account were the same one (`agent_dev`). Sotera stored something real, `npm test` ran, and an hour
// later she correctly reported an empty store. I nearly filed her honesty as a `list_memories` bug.
//
// A longitudinal relationship cannot accumulate in a table something truncates on every run. So the
// guard is here, next to the destruction, rather than as a convention someone has to remember:
// this refuses to run against any account that is not the designated test account.
const PROTECTED_FROM_CLEANUP = new Set(['kavi', 'kavi_alt', 'ote', 'hermes', 'hermes_alias'])

// ⭐⭐ AND IT IS NO LONGER AN ACCOUNT-WIDE WIPE — IT DELETES ONLY THE SLOT THIS CHECK SEEDS.
//
// ⚠⚠ THE ORIGINAL WIPED EVERY MEMORY `agent_dev` OWNED, and that stopped being safe the moment the
// REFLECTION LIFECYCLE went live (migration 016): reflections run on agent_dev's conversations and can
// write real, persona-authored memories through her own tools. An account-wide `delete` on every
// `npm test` would silently destroy them — which is the incident this file's own header describes
// (*"Sotera stored something real, `npm test` ran, and an hour later she correctly reported an empty
// store. I nearly filed her honesty as a `list_memories` bug."*) waiting to happen a second time, now
// with her own reflections as the casualty.
//
// ⭐ The check never needed the account empty. It needs ITS OWN SLOT empty, which is a narrower fact and
// the only one its assertions are about. The `PROTECTED_FROM_CLEANUP` guard stays — it is still the thing
// that stops this being pointed at an observation account by accident.
const TEST_ATTRIBUTE = 'test lifecycle attribute'
const cleanup = async () => {
  const owner = (await db.query(`select username from ${S}.mst_users where id = $1`, [me])).rows[0]?.username
  if (PROTECTED_FROM_CLEANUP.has(owner)) {
    throw new Error(`refusing to wipe memories for "${owner}" — it is an observation account, not a test account. `
      + 'This check destroys everything it is pointed at; point it at agent_dev.')
  }
  await db.query(
    `delete from ${S}.log_memory_changes where user_id = $1 and memory_id in (
       select id from ${S}.txn_memories where user_id = $1 and attribute = $2)`, [me, TEST_ATTRIBUTE])
  await db.query(`delete from ${S}.txn_memories where user_id = $1 and attribute = $2`, [me, TEST_ATTRIBUTE])
}
await cleanup()

// ── seed a SUPERSEDE CHAIN: `older` was displaced by `newer` ─────────────────────────────────────
// This is the shape the un-supersede rule exists for. `older` is invalid (displaced) but NOT expired
// (never deliberately deleted), so forgetting `newer` must bring it back.
const olderId = randomUUID()
const newerId = randomUUID()
const slotId = null // pre-Slot-store shape on purpose: the (entity, attribute) fallback must work too
const seed = async (id, value, extra) => db.query(
  `insert into ${S}.txn_memories
     (id, persona, user_id, namespace, kind, content, entity, attribute, value, importance, confidence,
      valid_at, tier, slot_id, created_at, updated_at ${extra.cols || ''})
   values ($1, null, $2, 'default', 'semantic', $3, 'user', 'test lifecycle attribute', $4, 7, 0.9,
      now(), 'warm', $5, now(), now() ${extra.vals || ''})`,
  [id, me, `user's test lifecycle attribute: ${value}`, value, slotId],
)
await seed(olderId, 'THE DISPLACED BELIEF', { cols: ', invalid_at', vals: ", now() - interval '1 hour'" })
await seed(newerId, 'THE DISPLACING BELIEF', { cols: ', supersedes_id', vals: `, '${olderId}'` })

// ⭐⭐ THE FLAKE, DIAGNOSED — AND THE ASSERTION'S OWN WORDING WAS THE CLUE.
//
// Both assertions below say *"exactly one live belief IN THE SLOT"*. This reader said *in the ACCOUNT*.
// So every live memory `agent_dev` owned counted toward a claim about one (entity, attribute) pair, and
// **any concurrent writer for that account broke it.**
//
// ⚠⚠ WHICH IS EXACTLY WHAT HAPPENS INSIDE A FULL SUITE RUN AND NOT WHEN RUN BY HAND. Memory writes are
// FIRE-AND-FORGET on a background serial queue (`enqueueWrite`): a check that drives the live server as
// agent_dev returns as soon as the HTTP call does, and its queued write lands milliseconds LATER — by
// which time `pipeline/test-all.mjs` has already started the next check, whose `cleanup()` has already
// run. Run the two checks by hand and the human-scale gap between commands lets the write land first;
// run them back to back and it lands inside this check's window. ⇒ That is precisely the observed
// signature: **FAIL in a full run, PASS standalone, PASS when run immediately after its alphabetical
// predecessor by hand.**
// ⓘ And it became MORE likely, not less: the reflection lifecycle can now write a memory for agent_dev
// at any moment a 20-minute tick fires.
//
// ⇒ Scoped to the slot it seeded. ⛔ This does not weaken the invariant — it asserts the one the comments
// always described, and it is now immune to a writer this check does not control.
const live = async () => (await db.query(
  `select id from ${S}.txn_memories
    where user_id=$1 and attribute=$2 and invalid_at is null and expired_at is null`,
  [me, TEST_ATTRIBUTE])).rows.map((r) => r.id)
check('seeded a supersede chain: exactly one live belief in the slot', (await live()).join() === newerId)

// ── ⭐⭐ THE REGRESSION GUARD FOR THE FLAKE ITSELF — a decoy writer this check does not control ──────
//
// A fix nobody can watch fail is a fix nobody can trust. This seeds ONE live memory for the same account
// OUTSIDE the slot — exactly what a queued background capture from the previous check, or a reflection
// tick, drops in — and asserts the slot reader is unmoved. ⛔ Against the old account-wide reader this
// assertion FAILS (it would count two live rows for a claim about one slot), which is the whole point:
// the flake is now something the suite notices deliberately instead of something it suffers at random.
const decoyId = randomUUID()
await db.query(
  `insert into ${S}.txn_memories
     (id, persona, user_id, namespace, kind, content, entity, attribute, value, importance,
      valid_at, tier, created_at, updated_at)
   values ($1, null, $2, 'default', 'semantic', 'a concurrent writer landed here', 'user',
      'zz decoy concurrent write', 'decoy', 5, now(), 'warm', now(), now())`, [decoyId, me])
const withDecoy = await live()
check('⭐⭐ a concurrent write OUTSIDE the slot cannot move the slot count — the flake, guarded',
  withDecoy.length === 1 && withDecoy[0] === newerId,
  withDecoy.length === 1 ? 'still exactly the seeded belief' : `${withDecoy.length} live — the reader is account-wide again`)
const accountWide = (await db.query(
  `select count(*)::int n from ${S}.txn_memories where user_id=$1 and invalid_at is null and expired_at is null`,
  [me])).rows[0].n
check('ⓘ …and the account-wide count really does differ, so the guard is not vacuous',
  accountWide > withDecoy.length, `account=${accountWide} slot=${withDecoy.length}`)
await db.query(`delete from ${S}.txn_memories where id=$1`, [decoyId])

// ── the actual test: delete through the USER-FACING route ────────────────────────────────────────
const res = await call(who, 'DELETE', `/v1/chat/memory/v2/${newerId}`)
check('UI delete returns 200', res.status === 200, `status ${res.status}`)
check('...and reports what it forgot', res.json?.forgotten === true, JSON.stringify(res.json).slice(0, 120))

// 1 — THE AUDIT ROW. The invariant that was missing entirely.
// ⚠ Scoped to THIS check's two memories for the same reason as `live()` — an audit row written by a
// concurrent reflection or a queued capture is a real row, and it must not be able to satisfy (or
// confuse) an assertion about the deletion this check performed.
const log = (await db.query(
  `select action, actor, before, memory_id from ${S}.log_memory_changes
    where user_id=$1 and memory_id in ($2, $3) order by rolling_id asc`, [me, olderId, newerId])).rows
const forgetEntry = log.find((l) => l.action === 'forget')
check('the deletion wrote an AUDIT row (it wrote none before this fix)', Boolean(forgetEntry),
  log.length ? log.map((l) => l.action).join(',') : 'NO ROWS')
check('...attributed to a person, not the system', forgetEntry?.actor === 'user', forgetEntry?.actor)
check('...carrying a real `before` projection, not an empty object',
  Object.keys(forgetEntry?.before || {}).length >= 8 && forgetEntry?.before?.value === 'THE DISPLACING BELIEF',
  `${Object.keys(forgetEntry?.before || {}).length} keys, value=${JSON.stringify(forgetEntry?.before?.value)}`)

// 2 — UN-SUPERSEDE. The slot must REVERT, not empty.
const nowLive = await live()
check('the displaced belief was REVIVED — the slot reverted instead of emptying',
  nowLive.length === 1 && nowLive[0] === olderId,
  nowLive.length === 0 ? 'slot is EMPTY — un-supersede was skipped' : `live=${nowLive.join(',')}`)
check('...and the route SURFACES the restore rather than swallowing it',
  res.json?.restored?.id === olderId || res.json?.restored != null,
  JSON.stringify(res.json?.restored)?.slice(0, 90) ?? 'null')
check('exactly one live belief in the slot, always', nowLive.length === 1, `${nowLive.length} live`)

// ── scope is still enforced: another user's id must read as ABSENT, not act ──────────────────────
const strangerId = randomUUID()
await db.query(
  `insert into ${S}.txn_memories (id, persona, user_id, namespace, kind, content, valid_at, created_at, updated_at)
   values ($1, null, $2, 'default', 'semantic', 'not yours', now(), now(), now())`,
  [strangerId, (await db.query(`select id from ${S}.mst_users where username <> 'agent_dev' limit 1`)).rows[0].id],
)
const forbidden = await call(who, 'DELETE', `/v1/chat/memory/v2/${strangerId}`)
check('deleting ANOTHER user\'s memory is 404, not 200', forbidden.status === 404, `status ${forbidden.status}`)
const stranger = (await db.query(`select expired_at from ${S}.txn_memories where id=$1`, [strangerId])).rows[0]
check('...and it is untouched', stranger?.expired_at === null, String(stranger?.expired_at))
await db.query(`delete from ${S}.txn_memories where id=$1`, [strangerId])

await cleanup()
await db.end()
done()
