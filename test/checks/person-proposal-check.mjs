// PERSON PROPOSAL — creating a human who has no account, explicitly and never by inference.
//
//   node checks/person-proposal-check.mjs
//
// ⚠️ EVERY ASSERTION HERE READS THE DATABASE. Not the return value, not an HTTP status — the row.
// Three times this session a check of mine passed on what I expected rather than what happened: an
// absence test satisfied by a 401, an `additionalProperties` assertion the framework silently strips
// instead of rejecting, and a `--answer` path that printed ANSWERED while the interaction stayed
// pending. So: propose, then COUNT THE ROWS. Confirm, then COUNT THE ROWS.
//
// What is being protected: naming a human who is not present to object. The gate is the same one the
// rename uses, for the same measured reason (2026-07-31) — a confirm produced in the same turn as its
// proposal is the model agreeing with itself, and there was no human in between.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { proposePerson, findPersons, _resetPendingPersons } from '../../Backend/app/components/person-service.js'

const { check, done } = makeChecker()
const db = devPg(); await db.connect()
const S = devSchema()
const q = async (sql, p = []) => (await db.query(sql, p)).rows
const countPersons = async (name) => Number((await q(`select count(*)::int n from ${S}.mst_persons where display_name=$1`, [name]))[0].n)

// ⚠️⚠️ THIS USED TO BE A HAND-WRITTEN ORM STUB, AND THE STUB IS WHY THE BUG HID FOR MONTHS.
// The old comment here argued that leaving Sequelize out "removes a layer of pretend rather than a layer
// of coverage". It was the opposite: `mst_persons.model.js` never set `schema: schemas.project`, so the
// real ORM was reading an empty `public.mst_persons` while this check hand-rolled raw SQL against the
// real table — and passed the whole time. The stub was the pretend.
//
// ⇒ Real `initDB()` now, exactly like the newer checks. Sequelize IS reachable from here (it resolves
// through Backend/), so the only thing the stub bought was immunity from the defect it was hiding.
const models = await initDB(); setDB(models)
const fastify = { db: models, config: loadConfig(), log: null }

// ⭐ A REAL ACCOUNT, not `{ id: null }`. The scoped collision report keys on the asker, and a null-id
// actor legitimately sees nobody — which is the root-identity invariant working, not a test fixture.
const [driver] = await q(`select id::text from ${S}.mst_users where username='agent_dev'`)
const user = { id: driver.id, username: 'agent_dev' }

const NAME = 'zz_test_Priya'
_resetPendingPersons()

try {
  await db.query(`delete from ${S}.mst_persons where display_name like 'zz_test_%'`)

  // ── PHASE 1 · a proposal must create NOTHING ────────────────────────────────────────────────────
  const p1 = await proposePerson(fastify, user, NAME, { turnId: 'turn-1' })
  check('phase 1 returns needs_confirmation', p1.ok === false && p1.needs_confirmation === true, JSON.stringify(p1).slice(0, 90))
  check('⭐ phase 1 wrote NOTHING — verified in the table, not inferred from the return value',
    (await countPersons(NAME)) === 0, `${await countPersons(NAME)} rows`)

  // ── THE GATE · same-turn confirm is the model agreeing with itself ──────────────────────────────
  const sameTurn = await proposePerson(fastify, user, NAME, { confirm: true, turnId: 'turn-1' })
  check('⛔ confirm in the SAME turn as the proposal is REFUSED', sameTurn.ok === false && sameTurn.reason === 'same_turn_confirm', sameTurn.reason)
  check('⭐ ...and still nothing was written', (await countPersons(NAME)) === 0, `${await countPersons(NAME)} rows`)

  // ── PHASE 2 · a later turn is a real answer ─────────────────────────────────────────────────────
  const p2 = await proposePerson(fastify, user, NAME, { confirm: true, turnId: 'turn-2', note: 'zz_test_ colleague' })
  check('phase 2 reports success', p2.ok === true && Boolean(p2.person?.id), JSON.stringify(p2).slice(0, 90))
  check('⭐ phase 2 wrote EXACTLY ONE row', (await countPersons(NAME)) === 1, `${await countPersons(NAME)} rows`)

  const row = (await q(`select id, kind, display_name, origin from ${S}.mst_persons where display_name=$1`, [NAME]))[0]
  check('the person is human, named, and carries an origin', row.kind === 'human' && row.display_name === NAME && Boolean(row.origin), row.origin)
  check('⭐ the person holds NO account — that is the whole point',
    (await q(`select 1 from ${S}.mst_users where person_id=$1`, [row.id])).length === 0)

  // ── NEVER MERGE · a second person of the same name is REPORTED, not reused ──────────────────────
  _resetPendingPersons()
  const dup = await proposePerson(fastify, user, NAME, { turnId: 'turn-3' })
  check('a name collision is REPORTED back so she can ask', dup.needs_confirmation === true && dup.existing?.length === 1,
    `existing=${dup.existing?.length}`)
  check('...and the message tells her to ask rather than assume', /same person or a different one/i.test(dup.message || ''),
    (dup.message || '').slice(0, 70))
  const dup2 = await proposePerson(fastify, user, NAME, { confirm: true, turnId: 'turn-4' })
  check('⭐ confirming a same-name person creates a SECOND record — it never merges into the first',
    dup2.ok === true && (await countPersons(NAME)) === 2 && dup2.person.id !== row.id, `${await countPersons(NAME)} rows`)

  // ── a memory can now be ABOUT them, with the account holder as the owner ────────────────────────
  const owner = (await q(`select id from ${S}.mst_users where username='agent_dev'`))[0]
  const mem = (await q(
    `insert into ${S}.txn_memories (id, persona, user_id, kind, entity, content, subject_person_id, created_at, updated_at)
     values (gen_random_uuid(),'sotera',$1,'semantic','zz_test_priya','zz_test_ Priya is sharper about root causes.',$2, now(), now())
     returning id, user_id, subject_person_id`, [owner.id, row.id]))[0]
  check('⭐ a memory in the account holder\'s store can be ABOUT a person with no account',
    mem.user_id === owner.id && mem.subject_person_id === row.id)
  await db.query(`delete from ${S}.txn_memories where id=$1`, [mem.id])

  // ── refusals ───────────────────────────────────────────────────────────────────────────────────
  check('an empty name is refused', (await proposePerson(fastify, user, '   ', {})).reason === 'invalid_name')
  check('a confirm with no proposal at all is refused',
    (await proposePerson(fastify, user, 'zz_test_NeverProposed', { confirm: true, turnId: 't' })).reason === 'no_proposal')
  check('findPersons is read-only', (await findPersons(fastify, NAME)).length === 2 && (await countPersons(NAME)) === 2)

  // ── ⭐ THE SCOPED COLLISION REPORT · a stranger's person is NOT an existence oracle ──────────────
  // Added 2026-08-20, and it is the assertion that makes fixing the schema binding safe. Restoring the
  // real table restored the collision report; unscoped, that report would confirm ANY person's existence
  // to ANY account, through a WRITE path, as a side effect. Awareness of other people is a deliberate
  // capability (L3, undecided) and must not arrive like that.
  const [hermesAcct] = await q(`select id::text from ${S}.mst_users where username='hermes'`)
  _resetPendingPersons()
  const strangerView = await proposePerson(fastify, user, 'Hermes', { turnId: 'turn-scope-1' })
  check('⭐⭐ agent_dev proposing "Hermes" sees NO existing person — no cross-person existence oracle',
    Array.isArray(strangerView.existing) && strangerView.existing.length === 0,
    `existing=${strangerView.existing?.length}`)
  check('⭐ ...and the message does not hint that anyone of that name is on file',
    !/already/i.test(strangerView.message || ''), (strangerView.message || '').slice(0, 60))
  _resetPendingPersons()
  const ownerView = await proposePerson(fastify, { id: hermesAcct.id, username: 'hermes' }, 'Hermes', { turnId: 'turn-scope-2' })
  check('⭐⭐ ...while HERMES proposing "Hermes" DOES see his own person — duplicate prevention still works',
    ownerView.existing?.length === 1, `existing=${ownerView.existing?.length}`)

  // ── ⭐ AND SHE CAN SEE THE PEOPLE SHE HERSELF RECORDED (migration 012) ──────────────────────────
  // Without created_by_user_id the scoped report could not see her own work, so she would record a
  // person and then create a duplicate of them on the very next turn.
  const [mine] = await q(`select created_by_user_id::text c from ${S}.mst_persons where display_name=$1 limit 1`, [NAME])
  check('⭐ a person she recorded carries the recording account', mine.c === driver.id, `${mine.c}`)
} catch (e) {
  check(`unexpected error: ${e.message}`, false)
  console.error(e)
} finally {
  await db.query(`delete from ${S}.mst_persons where display_name like 'zz_test_%'`).catch(() => {})
  const left = Number((await q(`select count(*)::int n from ${S}.mst_persons where display_name like 'zz_test_%'`).catch(() => [{ n: -1 }]))[0].n)
  check('cleanup · no zz_test_ persons left behind', left === 0, `${left}`)
  await db.end()
  done()
}
