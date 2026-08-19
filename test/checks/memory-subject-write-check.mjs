// MEMORY SUBJECT ON WRITE — the three-way distinction, asserted against the ROW every time.
//
//   node checks/memory-subject-write-check.mjs
//
// The rule under test (Ote, 2026-08-19):
//
//   remember_fact(subject = <id>)   → this memory is about THAT person, explicitly
//   remember_fact(entity = 'user')  → about the account holder; the HOST resolves it to their person
//   remember_fact(entity = null)    → subject UNKNOWN. Not "probably the user".
//
// ⚠️ THE THIRD LINE IS THE ONE WITH A SCAR. The first version of the host default stamped the account
// holder onto EVERY write, and `person-subject-check` I6 caught it. The real-world row of exactly that
// shape is "User's colleague Priya taught them the habit…" — a free-form memory whose subject is NOT
// the account holder. A confident default there is a guessed subject, which is the one thing this
// column must never contain.
//
// ⚠️ Every assertion reads the database. No return values, no HTTP statuses.

import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker()
const db = devPg(); await db.connect()
const S = devSchema()
const q = async (sql, p = []) => (await db.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] || null

const MADE = { persons: [], memories: [] }

// Exercises the HOST STORE (where subject defaulting lives), not the tool layer.
const { createSequelizeMemoryStore } = await import('../../Backend/app/components/memory-store-sequelize-host.js')

try {
  const owner = await one(`select id, person_id from ${S}.mst_users where username='agent_dev'`)
  check('agent_dev has a person to resolve to', Boolean(owner?.person_id))

  // A person with NO account — the whole reason `subject` exists.
  const priya = await one(
    `insert into ${S}.mst_persons (kind, display_name, origin) values ('human','zz_test_Priya','zz_test_') returning id`)
  MADE.persons.push(priya.id)
  check('a subject person exists with no account',
    (await q(`select 1 from ${S}.mst_users where person_id=$1`, [priya.id])).length === 0)

  // Minimal model bag: only what the store touches for create().
  const rows = []
  const db2 = {
    txn_memories: {
      create: async (row) => {
        const r = await one(
          `insert into ${S}.txn_memories (id, persona, user_id, kind, entity, attribute, value, content, subject_person_id, created_at, updated_at)
           values (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8, now(), now())
           returning id, user_id, entity, subject_person_id`,
          [row.persona, row.user_id, row.kind || 'semantic', row.entity ?? null, row.attribute ?? null,
            row.value ?? null, row.content, row.subject_person_id ?? null])
        MADE.memories.push(r.id); rows.push(r); return r
      },
    },
    mst_persons: { findOne: async ({ where }) => one(`select id from ${S}.mst_persons where kind=$1 limit 1`, [where.kind]) },
    mst_users: { findOne: async ({ where }) => one(`select person_id from ${S}.mst_users where id=$1`, [where.id]) },
  }
  // The store reads the physical table name at construction (for its raw lexical/dense SQL), so the
  // stub has to answer that too. Stubbing a Sequelize model always ends up here: the seam is honest
  // about what it needs, and each missing method is a real dependency being named out loud.
  db2.txn_memories.getTableName = () => ({ schema: S, tableName: 'txn_memories' })
  const store = createSequelizeMemoryStore({ db: db2, persona: 'sotera', userId: owner.id })

  // ── 1 · EXPLICIT SUBJECT wins ───────────────────────────────────────────────────────────────────
  const a = await store.create({ kind: 'semantic', entity: 'zz_priya', content: 'zz_test_ Priya is sharp about root causes.', subject_person_id: priya.id })
  const aRow = await one(`select user_id, subject_person_id from ${S}.txn_memories where id=$1`, [a.id])
  check('⭐ explicit subject → that person, and the owner is still the account holder',
    aRow.subject_person_id === priya.id && aRow.user_id === owner.id)

  // ── 2 · entity='user' resolves to the ACCOUNT'S person ───────────────────────────────────────────
  const b = await store.create({ kind: 'semantic', entity: 'user', attribute: 'zz_attr', value: 'zz_val', content: "zz_test_ user's zz_attr: zz_val" })
  const bRow = await one(`select subject_person_id from ${S}.txn_memories where id=$1`, [b.id])
  check("⭐ entity='user' → the account's person", bRow.subject_person_id === owner.person_id, `${bRow.subject_person_id}`)

  // ── 3 · no entity, no subject → NULL. NOT "probably the user". ──────────────────────────────────
  const c = await store.create({ kind: 'semantic', content: 'zz_test_ a free-form note about nobody in particular' })
  const cRow = await one(`select entity, subject_person_id from ${S}.txn_memories where id=$1`, [c.id])
  check('⭐ no entity and no subject → subject is NULL, not the current user',
    cRow.entity === null && cRow.subject_person_id === null, `entity=${cRow.entity} subject=${cRow.subject_person_id}`)

  // ── 4 · an unrelated entity label must NOT be read as the user either ───────────────────────────
  const d = await store.create({ kind: 'semantic', entity: 'the weather', content: 'zz_test_ it rained' })
  const dRow = await one(`select subject_person_id from ${S}.txn_memories where id=$1`, [d.id])
  check('a non-user entity does not resolve to the account holder', dRow.subject_person_id === null)

  // ── 5 · explicit subject BEATS the entity default — the caller knows better ─────────────────────
  const e = await store.create({ kind: 'semantic', entity: 'user', content: 'zz_test_ told to me by the user, about Priya', subject_person_id: priya.id })
  const eRow = await one(`select subject_person_id from ${S}.txn_memories where id=$1`, [e.id])
  check("⭐ an explicit subject overrides the entity='user' default — never silently overwritten",
    eRow.subject_person_id === priya.id)

  // ── 6 · persona-global identity → the PERSONA is the subject ────────────────────────────────────
  const persona = await one(`select id from ${S}.mst_persons where kind='persona' limit 1`)
  const f = await store.create({ kind: 'identity', entity: 'self', content: 'zz_test_ something she noticed about herself' })
  const fRow = await one(`select user_id, subject_person_id from ${S}.txn_memories where id=$1`, [f.id])
  check('⭐ a persona-global identity row is about the PERSONA, and owned by no account',
    fRow.user_id === null && fRow.subject_person_id === persona.id)

  // ── 7 · VISIBILITY IS UNCHANGED — subject grants nothing ────────────────────────────────────────
  const other = await one(`select id from ${S}.mst_users where username='ote'`)
  const visibleToOther = await q(
    `select id from ${S}.txn_memories where (user_id = $1 or user_id is null) and id = $2`, [other.id, a.id])
  check('⭐ a memory ABOUT Priya in agent_dev\'s store is still invisible to another account',
    visibleToOther.length === 0, 'user_id still decides, exactly as before')
  const priyaLogin = await q(`select 1 from ${S}.mst_users where person_id=$1`, [priya.id])
  check('being the SUBJECT grants no access — Priya has no login at all', priyaLogin.length === 0)

  // ── 8 · a nonexistent subject is refused at the route, not written ──────────────────────────────
  // (the route's pre-check; asserted here as the DB-level truth it protects)
  const ghost = '00000000-0000-4000-8000-0000000000ff'
  const ghostExists = (await q(`select 1 from ${S}.mst_persons where id=$1`, [ghost])).length
  check('the ghost subject genuinely does not exist', ghostExists === 0)
  let fkRejected = false
  try {
    await db.query(
      `insert into ${S}.txn_memories (id, persona, user_id, kind, content, subject_person_id, created_at, updated_at)
       values (gen_random_uuid(),'sotera',$1,'semantic','zz_test_ ghost subject',$2, now(), now())`, [owner.id, ghost])
  } catch { fkRejected = true }
  check('⭐ the database itself refuses a subject that is not a real person (FK)', fkRejected)
} catch (e) {
  check(`unexpected error: ${e.message}`, false)
  console.error(e)
} finally {
  for (const id of MADE.memories) await db.query(`delete from ${S}.txn_memories where id=$1`, [id]).catch(() => {})
  await db.query(`delete from ${S}.txn_memories where content like 'zz_test_%'`).catch(() => {})
  for (const id of MADE.persons) await db.query(`delete from ${S}.mst_persons where id=$1`, [id]).catch(() => {})
  const left = Number((await q(`select count(*)::int n from ${S}.txn_memories where content like 'zz_test_%'`).catch(() => [{ n: -1 }]))[0].n)
  check('cleanup · nothing left behind', left === 0, `${left}`)
  await db.end()
  done()
}
