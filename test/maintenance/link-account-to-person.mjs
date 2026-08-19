// LINK AN ACCOUNT TO A PERSON — explicitly, by a human, never by inference.
//
//   node maintenance/link-account-to-person.mjs --list
//   node maintenance/link-account-to-person.mjs --account hermes_alias --person <uuid>
//   node maintenance/link-account-to-person.mjs --account hermes_alias --same-as hermes
//   node maintenance/link-account-to-person.mjs --account newguy --create "New Guy"
//
// ⚠️ WHY THIS IS A HUMAN-RUN SCRIPT AND NOT SOMETHING SOTERA CAN DO.
// Deciding that two logins are one human is identity resolution. Done from names, emails or writing
// style it is the same failure this project has already been corrected on — deriving a person-attribute
// from a name — except the blast radius is larger, because the result is one person's private beliefs
// surfacing in another person's conversation. So: no heuristics, no similarity, no "these look alike".
// A human names both sides or nothing happens.
//
// ⚠️ AND LINKING DOES NOT CREATE CONTINUITY TODAY. Recall is still scoped by `user_id`, deliberately
// (Ote: "keep the existing user_id visibility boundary intact"). Two accounts sharing a person can be
// SEEN to share one, and their memories still do not cross. That gap is the point of the exercise:
// it makes the next requirement concrete instead of hypothetical.

import { devPg, devSchema } from '../harness.mjs'

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : process.argv[i + 1] }
const has = (n) => process.argv.includes(`--${n}`)

const db = devPg(); await db.connect()
const S = devSchema()
const q = async (sql, p = []) => (await db.query(sql, p)).rows

try {
  if (has('list') || process.argv.length <= 2) {
    console.log('\nACCOUNTS')
    for (const r of await q(
      `select u.username, coalesce(p.display_name,'—') pname, coalesce(p.kind,'—') pkind, coalesce(u.person_id::text,'') pid
         from ${S}.mst_users u left join ${S}.mst_persons p on p.id=u.person_id order by u.created_at`)) {
      console.log(`  ${r.username.padEnd(20)} → ${r.pname.padEnd(12)} ${r.pkind.padEnd(8)} ${r.pid.slice(0, 8)}`)
    }
    console.log('\nPERSONS')
    for (const r of await q(
      `select p.id, p.kind, coalesce(p.display_name,'—') n, coalesce(p.origin,'') o,
              (select count(*) from ${S}.mst_users u where u.person_id=p.id) accounts,
              (select count(*) from ${S}.txn_memories m where m.subject_person_id=p.id) memories
         from ${S}.mst_persons p order by p.kind, p.created_at`)) {
      console.log(`  ${r.id.slice(0, 8)}  ${r.kind.padEnd(8)} ${r.n.padEnd(12)} accounts=${r.accounts} memories=${r.memories}  ${r.o.slice(0, 48)}`)
    }
    console.log('')
    process.exit(0)
  }

  const account = arg('account')
  if (!account) throw new Error('--account <username> is required')
  const u = (await q(`select id, username, person_id from ${S}.mst_users where username=$1`, [account]))[0]
  if (!u) throw new Error(`no such account: ${account}`)

  let personId = arg('person')

  // --same-as <username>: adopt the person another ACCOUNT already points at. Still explicit — a human
  // typed both usernames — but it saves copying a uuid, which is where transcription mistakes live.
  const sameAs = arg('same-as')
  if (sameAs) {
    const other = (await q(`select username, person_id from ${S}.mst_users where username=$1`, [sameAs]))[0]
    if (!other) throw new Error(`no such account: ${sameAs}`)
    if (!other.person_id) throw new Error(`${sameAs} has no person to share`)
    personId = other.person_id
  }

  const create = arg('create')
  if (create) {
    if (personId) throw new Error('--create cannot be combined with --person/--same-as')
    const r = (await q(
      `insert into ${S}.mst_persons (kind, display_name, origin) values ('human',$1,$2) returning id`,
      [create, `linked by hand: ${account}`]))[0]
    personId = r.id
    console.log(`created person ${personId.slice(0, 8)} "${create}"`)
  }

  if (!personId) throw new Error('one of --person <uuid> | --same-as <username> | --create "<name>" is required')
  const p = (await q(`select id, kind, display_name from ${S}.mst_persons where id=$1`, [personId]))[0]
  if (!p) throw new Error(`no such person: ${personId}`)
  // ⚠️ A persona row is Sotera herself. She is a subject, never an account holder.
  if (p.kind === 'persona') throw new Error('refusing: a persona person cannot hold an account')

  if (u.person_id === personId) { console.log(`${account} is already linked to ${p.display_name}. Nothing to do.`); process.exit(0) }
  if (u.person_id) console.log(`⚠️  ${account} was linked to a different person (${u.person_id.slice(0, 8)}); re-pointing it.`)

  await db.query(`update ${S}.mst_users set person_id=$1, updated_at=now() where id=$2`, [personId, u.id])

  const shared = await q(`select username from ${S}.mst_users where person_id=$1 order by created_at`, [personId])
  console.log(`\n✓ ${account} → ${p.display_name} (${personId.slice(0, 8)})`)
  console.log(`  accounts now representing this person: ${shared.map((r) => r.username).join(', ')}`)
  if (shared.length > 1) {
    console.log('\n  ⚠️  Their memories still do NOT cross. Recall is scoped by user_id and that has not')
    console.log('      changed. This link records WHO they are; it does not grant sight across accounts.')
  }
} catch (e) {
  console.error(`✖ ${e.message}`)
  process.exitCode = 1
} finally {
  await db.end()
}
