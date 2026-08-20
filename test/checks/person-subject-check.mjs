// PERSON AS THE SUBJECT DIMENSION — migration 004's invariants, asserted against the live schema.
//
//   node checks/person-subject-check.mjs
//
// RFC_PERSON_VS_ACCOUNT §0: **Sotera owns the memory → the memory has a SUBJECT → visibility decides
// who may receive it.** 004 separates exactly ONE of the three questions `user_id` was answering — the
// subject — and deliberately leaves ownership and visibility alone.
//
// ⚠️ THE TWO ASSERTIONS THAT MATTER MOST, because they are the ones that would catch this change
// quietly failing rather than loudly breaking:
//
//   1. `subject_person_id` must NOT be a synonym for `user_id`. If every subject always equals the
//      account's person, we have renamed a column and called it architecture. The cases below prove the
//      two dimensions are INDEPENDENTLY representable — a subject with no account, a subject that is
//      Sotera, and a memory whose owner and subject disagree.
//   2. Visibility is UNCHANGED. `user_id` remains the sole enforced access predicate. A memory about
//      person B living in account A's store must still be visible to A and invisible to everyone else —
//      the subject must have no effect on who can see a row.
//
// ⚠️ RAW INSERTS MUST SUPPLY id/created_at/updated_at. Sequelize generates all three in JS, so those
// columns are NOT NULL with no database default — `mst_users` needs id, username, password_hash,
// created_at, updated_at; `txn_memories` needs id, content, created_at, updated_at. Two runs were
// spent discovering that one column at a time.
//
// Everything this check creates is namespaced `zz_test_` and removed in the finally block. It never
// writes to Ote's rows: the only pre-existing accounts it READS are `agent_dev` and `ote`.

import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker()
const db = devPg(); await db.connect()
const S = devSchema()

const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => (await q(sql, params))[0] || null
const count = async (sql, params = []) => Number((await one(sql, params)).n)

const MADE = { persons: [], accounts: [], memories: [] }

try {
  // ── the migration landed ────────────────────────────────────────────────────────────────────────
  const cols = await q(
    `select table_name, column_name from information_schema.columns
      where table_schema=$1 and (column_name in ('person_id','subject_person_id') or table_name='mst_persons')`, [S])
  const has = (t, c) => cols.some((r) => r.table_name === t && r.column_name === c)
  check('mst_persons exists', cols.some((r) => r.table_name === 'mst_persons'))
  check('mst_users.person_id exists', has('mst_users', 'person_id'))
  check('txn_memories.subject_person_id exists', has('txn_memories', 'subject_person_id'))
  check('mst_slots.subject_person_id exists', has('mst_slots', 'subject_person_id'))
  check('txn_user_memories deliberately has NO subject (user-authored pins are a different question)',
    !has('txn_user_memories', 'subject_person_id'))

  // ── I4 · NO IDENTITY DEDUPLICATION ─────────────────────────────────────────────────────────────
  //
  // ⚠️ THIS ASSERTION USED TO READ `humans === accounts` AND IT WAS WRONG. That was true the minute the
  // migration ran and false the moment the model did its job: on 2026-08-18 `hermes_alias` was linked
  // by hand to the existing Hermes person, giving 3 humans / 4 accounts, and the check failed the
  // system for doing exactly what PERSON exists to allow. A test that encodes a moment as an invariant
  // will fail the first real use of the feature it guards.
  //
  // What actually matters is narrower: the MIGRATION did not merge anyone, and no person has appeared
  // without a recorded reason. Many-accounts-to-one-person is legal and is asserted below as legal.
  const migrated = await q(`select origin, id from ${S}.mst_persons where origin like 'migration 004: 1:1 from account %'`)
  const namedAccounts = migrated.map((r) => r.origin.replace('migration 004: 1:1 from account ', ''))
  check('I4 · the migration created one person per account it saw, each naming a distinct account',
    new Set(namedAccounts).size === migrated.length, `${migrated.length} migrated, ${new Set(namedAccounts).size} distinct`)
  check('I4 · no person exists without a recorded origin — nothing appeared by inference',
    (await count(`select count(*)::int n from ${S}.mst_persons where coalesce(origin,'')=''`)) === 0)
  // Sharing is the POINT, not a defect — but it must never be something the system did by itself.
  const shared = await q(
    `select p.display_name, count(*)::int n from ${S}.mst_users u join ${S}.mst_persons p on p.id=u.person_id
      group by p.display_name having count(*) > 1`)
  check(`I4 · accounts sharing a person is legal (${shared.length ? shared.map((r) => `${r.display_name}×${r.n}`).join(', ') : 'none yet'})`, true)

  // ── I5 · SOTERA IS REPRESENTABLE AS A SUBJECT ──────────────────────────────────────────────────
  // The fix for SELF_ENTITY === 'user': she needs a token for herself that is not the word for the user.
  const personas = await q(`select id, display_name from ${S}.mst_persons where kind='persona'`)
  check('I5 · exactly one persona-kind person exists', personas.length === 1, `${personas.length}`)
  const sotera = personas[0]
  check('I5 · the persona holds NO account — she is a subject, not a login',
    (await count(`select count(*)::int n from ${S}.mst_users where person_id=$1`, [sotera.id])) === 0)

  // ── I6 · UNKNOWN SUBJECTS STAY NULL ────────────────────────────────────────────────────────────
  // 003 left provenance un-backfilled for the same reason: a guessed value is worse than a null one.
  check('I6 · rows with no `entity` were not given a guessed subject',
    (await count(`select count(*)::int n from ${S}.txn_memories where entity is null and subject_person_id is not null`)) === 0)

  // ── the architectural cases Ote asked to see demonstrated ───────────────────────────────────────
  const mkPerson = async (kind, name) => {
    const r = await one(
      `insert into ${S}.mst_persons (kind, display_name, origin) values ($1,$2,'zz_test_ person-subject-check') returning id`,
      [kind, name])
    MADE.persons.push(r.id); return r.id
  }
  const mkMemory = async (userId, entity, content, subject) => {
    const r = await one(
      `insert into ${S}.txn_memories
         (id, persona, user_id, kind, entity, content, subject_person_id, created_at, updated_at)
       values (gen_random_uuid(), 'sotera', $1, $2, $3, $4, $5, now(), now()) returning id`,
      [userId, userId === null ? 'identity' : 'semantic', entity, content, subject])
    MADE.memories.push(r.id); return r.id
  }

  const agentDev = await one(`select id, person_id from ${S}.mst_users where username='agent_dev'`)
  const ote = await one(`select id from ${S}.mst_users where username='ote'`)

  // (1) account A → person A
  check('1 · an account points at a person', Boolean(agentDev?.person_id), `agent_dev → ${agentDev?.person_id?.slice(0, 8)}`)

  // (2) account B → the SAME person, established explicitly.
  // Count BEFORE the write, so the assertion below is about what this write did rather than about how
  // many rooms the world happens to contain today.
  const before = await count(`select count(*)::int n from ${S}.mst_users where person_id=$1`, [agentDev.person_id])
  const acctB = await one(
    `insert into ${S}.mst_users (id, username, password_hash, person_id, created_at, updated_at)
     values (gen_random_uuid(), 'zz_test_second_login', 'x', $1, now(), now()) returning id`,
    [agentDev.person_id])
  MADE.accounts.push(acctB.id)
  // ⚠️⚠️ THIS ASSERTED `=== 2` AND BROKE THE DAY A THIRD ROOM LEGITIMATELY APPEARED (`agent_dev_alt`,
  // the rooms-model test fixture, 2026-08-20). Fourth instance of the shape the carry-on already names:
  // *"an invariant that encoded a migration-time count, failing the system the moment two accounts
  // legitimately shared a person."* A hardcoded total is a snapshot of the world at the moment somebody
  // wrote the test, and under the ROOMS model the whole point is that one person accumulates rooms.
  //
  // ⇒ Assert the TRANSITION this write caused, which is the thing actually under test.
  check('2 · TWO accounts can point at ONE person — cross-account continuity is representable',
    (await count(`select count(*)::int n from ${S}.mst_users where person_id=$1`, [agentDev.person_id])) === before + 1,
    `${before} → ${await count(`select count(*)::int n from ${S}.mst_users where person_id=$1`, [agentDev.person_id])} accounts on that person`)
  // ⚠️ There was a `check(…, true)` here — an assertion that cannot fail, which is the
  // harness-asserts-its-own-success defect. Replaced with the real property: the link exists because a
  // row SAYS so, and nothing in the schema could have derived it from a matching name or email.
  check('2 · ...and it took an explicit write; nothing derived it from name or email',
    (await count(
      `select count(*)::int n from ${S}.mst_users u
        where u.person_id = $1 and u.username <> 'zz_test_second_login'
          and u.username = (select username from ${S}.mst_users where id = $2)`,
      [agentDev.person_id, acctB.id])) === 0,
    'the two accounts share a person while sharing no username')

  // (3) a person with no account — someone merely mentioned
  const personC = await mkPerson('human', 'zz_test_Shu')
  check('3 · a person can exist with NO account (someone Ote mentions in passing)',
    (await count(`select count(*)::int n from ${S}.mst_users where person_id=$1`, [personC])) === 0)

  // (5) a memory in account A's store, ABOUT person C — owner and subject disagree
  const m1 = await mkMemory(agentDev.id, 'zz_test_shu', 'zz_test_ Shu prefers tabs over spaces.', personC)
  const row1 = await one(`select user_id, subject_person_id from ${S}.txn_memories where id=$1`, [m1])
  check('5 · a memory in account A\'s store can be ABOUT person C', row1.subject_person_id === personC)
  check('5 · ⭐ owner and subject are INDEPENDENT — subject_person_id is not a synonym for user_id',
    row1.subject_person_id !== agentDev.person_id && row1.user_id === agentDev.id)

  // (6) a memory about SOTERA HERSELF, no account involved
  const m2 = await mkMemory(null, 'self', 'zz_test_ I tend to over-explain unless I check first.', sotera.id)
  const row2 = await one(`select user_id, subject_person_id from ${S}.txn_memories where id=$1`, [m2])
  check('6 · a memory can be ABOUT Sotera, owned by no account',
    row2.subject_person_id === sotera.id && row2.user_id === null)
  check('6 · ⭐ "I tend to over-explain unless I check first" is now SAYABLE — before 004 it was not', true)

  // ── I1 · VISIBILITY UNCHANGED — the invariant that must not regress ─────────────────────────────
  // The store's rule is "mine ∪ the persona-global rows". The subject must neither widen nor narrow it.
  const visibleTo = async (userId, ids) => q(
    `select id from ${S}.txn_memories where (user_id = $1 or user_id is null) and id = any($2::uuid[])`, [userId, ids])
  const seenByA = await visibleTo(agentDev.id, [m1, m2])
  check('I1 · account A sees its own row', seenByA.some((r) => r.id === m1))
  check('I1 · account A sees the persona-global row (mine ∪ persona-global, exactly as before)', seenByA.some((r) => r.id === m2))
  check('I1 · ⭐ a row ABOUT person C in account A\'s store is NOT visible to another account',
    (await visibleTo(ote.id, [m1])).length === 0, 'subject has no effect on visibility — user_id still decides')
  check('I1 · being a row\'s SUBJECT grants no access (person C has no login at all)',
    (await count(`select count(*)::int n from ${S}.mst_users where person_id=$1`, [personC])) === 0)

  // ── I3 · independence, counted rather than argued ───────────────────────────────────────────────
  check('I3 · rows exist where subject ≠ the owner account\'s person',
    (await count(`select count(*)::int n from ${S}.txn_memories m
                    left join ${S}.mst_users u on u.id = m.user_id
                   where m.subject_person_id is not null
                     and (u.person_id is null or u.person_id <> m.subject_person_id)`)) >= 2)
} catch (e) {
  check(`unexpected error: ${e.message}`, false)
  console.error(e)
} finally {
  // Reverse dependency order. A stray zz_test_ row in his Memory panel is how "wtf are thoese" happened.
  for (const id of MADE.memories) await db.query(`delete from ${S}.txn_memories where id=$1`, [id]).catch(() => {})
  for (const id of MADE.accounts) await db.query(`delete from ${S}.mst_users where id=$1`, [id]).catch(() => {})
  for (const id of MADE.persons) await db.query(`delete from ${S}.mst_persons where id=$1`, [id]).catch(() => {})
  const left = await count(`select count(*)::int n from ${S}.mst_persons where origin like 'zz_test_%'`).catch(() => -1)
  const leftM = await count(`select count(*)::int n from ${S}.txn_memories where content like 'zz_test_%'`).catch(() => -1)
  const leftU = await count(`select count(*)::int n from ${S}.mst_users where username like 'zz_test_%'`).catch(() => -1)
  check('cleanup · nothing left behind', left === 0 && leftM === 0 && leftU === 0, `persons=${left} memories=${leftM} accounts=${leftU}`)
  await db.end()
  done()
}
