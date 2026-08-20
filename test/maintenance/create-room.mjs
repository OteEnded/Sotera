// CREATE A ROOM for a person who already exists.
//
//   node maintenance/create-room.mjs --list
//   node maintenance/create-room.mjs --room Ote_Finance --same-person-as ote --label Finance
//
// ⭐ A ROOM IS A SCOPE, NOT A CREDENTIAL. Ote ratified the rooms model on 2026-08-20 (D-8): one person
// may hold many rooms, and *the room is the disclosure boundary*. Under the hood a room is an ordinary
// `mst_users` row sharing a `person_id` — which is exactly what makes it safe: the scope of a room is
// the same `user_id` predicate everyone else already uses, never a bypass.
//
// ⚠️ WHICH IS WHY THIS SCRIPT WRITES A PASSWORD NOBODY CAN USE, ON PURPOSE.
// `mst_users.password_hash` is NOT NULL, so a row must carry something. It carries a NON-BCRYPT
// sentinel — `bcrypt.compare` against a non-bcrypt string is always false, so no password on earth
// authenticates this row. Two reasons that is the right default and not a shortcut:
//
//   1. Creating a room must add ZERO authentication surface. A room is data; who may enter it is a
//      separate decision, and it is the owner's, not this script's. Minting a credential here would
//      mean the tool that creates the scope also hands out the key to it.
//   2. It keeps the room honest about what exists today. There is no room-switch yet — entering a room
//      means either a password its owner sets from the console, or the D-5 disclosure act, which is
//      not built. Pretending otherwise by inventing a login would misrepresent the state.
//
// To make a room enterable: set a password on it from the console (Users → the room → password). That
// is the normal, audited path, and it is a human decision by construction.
//
// ⚠️ AND IT REFUSES TO CREATE A ROOM FOR A PERSON WHO DOES NOT EXIST. Identity resolution is a human
// act here — see link-account-to-person.mjs, which carries the full reasoning. This script only ever
// ADOPTS a person another account already points at; it never creates one, so it can never invent a
// person as a side effect of creating a room.

import { randomUUID } from 'node:crypto'
import { devPg, devSchema } from '../harness.mjs'

// Deliberately NOT the same string root's row uses. Root's sentinel says "root authenticates from
// config"; this one says "nobody has set a login for this room yet" — different facts, and a reader
// who greps for either should not land on the other.
const NO_LOGIN = 'x-room-has-no-login-set-a-password-to-enter'

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : process.argv[i + 1] }
const has = (n) => process.argv.includes(`--${n}`)

const db = devPg(); await db.connect()
const S = devSchema()
const q = async (sql, p = []) => (await db.query(sql, p)).rows

try {
  if (has('list') || process.argv.length <= 2) {
    console.log('\nROOMS BY PERSON')
    for (const r of await q(
      `select coalesce(p.display_name,'(no person)') pname, p.id::text pid,
              u.username, coalesce(u.display_name,'—') label,
              (u.password_hash like '$2%') can_login, u.is_active, u.deleted_at,
              (select count(*) from ${S}.txn_memories m where m.user_id=u.id)::int items
         from ${S}.mst_users u left join ${S}.mst_persons p on p.id=u.person_id
        order by pname, u.created_at`)) {
      const state = [r.can_login ? 'login' : 'no-login', r.is_active ? 'active' : 'INACTIVE', r.deleted_at ? 'DELETED' : null]
        .filter(Boolean).join('/')
      console.log(`  ${r.pname.padEnd(12)} ${r.username.padEnd(16)} ${r.label.padEnd(12)} items=${String(r.items).padEnd(4)} ${state}`)
    }
    console.log('')
    process.exit(0)
  }

  const room = arg('room')
  if (!room) throw new Error('--room <username> is required')
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/.test(room)) throw new Error(`--room "${room}" is not a valid account name`)

  const sameAs = arg('same-person-as')
  if (!sameAs) throw new Error('--same-person-as <existing username> is required — this script never creates a person')

  const owner = (await q(`select id, username, person_id from ${S}.mst_users where username=$1`, [sameAs]))[0]
  if (!owner) throw new Error(`no such account: ${sameAs}`)
  if (!owner.person_id) throw new Error(`${sameAs} has no person — link it first (maintenance/link-account-to-person.mjs)`)

  const person = (await q(`select id, kind, display_name from ${S}.mst_persons where id=$1`, [owner.person_id]))[0]
  // ⚠️ Same refusal as link-account-to-person: a persona row is Sotera herself. She is a subject,
  // never an account holder, so she can never be given a room.
  if (person.kind === 'persona') throw new Error('refusing: a persona person cannot hold a room')

  // Soft-deleted names stay reserved platform-wide, so check WITHOUT the paranoid filter.
  const taken = (await q(`select username, deleted_at from ${S}.mst_users where lower(username)=lower($1)`, [room]))[0]
  if (taken) throw new Error(`'${taken.username}' already exists${taken.deleted_at ? ' (soft-deleted — the name is still reserved)' : ''}`)

  const id = randomUUID()
  await q(
    `insert into ${S}.mst_users (id, username, display_name, password_hash, is_active, person_id, created_at, updated_at)
     values ($1,$2,$3,$4,true,$5,now(),now())`,
    [id, room, arg('label') || null, NO_LOGIN, person.id])

  const rooms = await q(
    `select u.username, (u.password_hash like '$2%') can_login
       from ${S}.mst_users u where u.person_id=$1 and u.deleted_at is null order by u.created_at`, [person.id])
  console.log(`\n✓ room '${room}' created for ${person.display_name} (${person.id.slice(0, 8)})`)
  console.log(`  rooms of this person: ${rooms.map((r) => `${r.username}${r.can_login ? '' : ' (no login)'}`).join(', ')}`)
  console.log('')
  console.log('  ⚠️  NO PASSWORD CAN AUTHENTICATE THIS ROOM. It exists as a scope and appears in the room')
  console.log('      index; to enter it directly, set a password on it from the console. Its memories and')
  console.log('      conversations are scoped by user_id exactly like every other room — no bypass.')
  console.log('')
} catch (e) {
  console.error(`✖ ${e.message}`)
  process.exitCode = 1
} finally {
  await db.end()
}
