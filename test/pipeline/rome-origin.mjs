// ⭐⭐⭐ PHASE 4 · WHERE DOES "ROME" COME FROM? — direct evidence first, her account second.
//
//   node pipeline/rome-origin.mjs
//
// ⛔⛔ NO HYPOTHESIS IS PLANTED OR ASSUMED. Ote's earlier statement *"Rome is the project name"* was
// WITHDRAWN as unsupported — it rested on one config string. Nothing in this file asserts what Rome is,
// and no turn given to her contains a definition, a guess, or the word "project".
//
// ── ⭐⭐ TWO KINDS OF EVIDENCE, NEVER MERGED ────────────────────────────────────────────────────────
//     DIRECT     `txn_messages` rows — what was actually typed, by whom, when, in which room.
//                ⭐ This is the only thing that can establish an ORIGIN.
//     CLAIM      `txn_memories` rows — what she concluded and kept. ⛔ `676e17b9` says *"we will build
//                'Rome' together"*; that is a CLAIM ABOUT Rome and cannot be its origin, because a
//                memory is downstream of the conversation that produced it.
// ⇒ they are collected separately and reported separately, and the origin is computed from DIRECT only.
//
// ── ⚠️ WHAT THIS RUN CANNOT SETTLE ─────────────────────────────────────────────────────────────────
// The corpus is what it is: if the earliest message is itself a reply that assumes the word, the true
// origin is outside the store and this must say so rather than name the earliest row as "the origin".
// ⛔ "First row I can see" and "where the word came from" are different claims.

import { writeFileSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows
const out = { at: new Date().toISOString(), direct: {}, claims: {}, disclosure: {} }

// ── ⭐ 1 · EVERY DIRECT OCCURRENCE, OLDEST FIRST ──────────────────────────────────────────────────
// ⛔ Case-insensitive but WORD-BOUNDED: `~*` with \m..\M so "Romero" and "chrome" cannot masquerade as
// the term. A substring LIKE '%rome%' would have matched both and quietly inflated the earliest date.
const rows = await q(
  `select m.id::text mid, m.role, m.created_at,
          left(c.id::text,8) conv, u.username room, coalesce(u.display_name,u.username) room_name,
          coalesce(p.display_name, u.username) person,
          m.content
     from ${S}.txn_messages m
     join ${S}.txn_conversations c on c.id = m.conversation_id
     left join ${S}.mst_users u on u.id = c.user_id
     left join ${S}.mst_persons p on p.id = u.person_id
    where m.content ~* '\\mrome\\M'
    order by m.created_at asc`)

out.direct.total = rows.length
out.direct.byRoom = Object.entries(rows.reduce((a, r) => { a[r.room] = (a[r.room] ?? 0) + 1; return a }, {}))
out.direct.byRole = Object.entries(rows.reduce((a, r) => { a[r.role] = (a[r.role] ?? 0) + 1; return a }, {}))

console.log(`\n══ DIRECT EVIDENCE · ${rows.length} message(s) containing the word ══════════════`)
console.log(`   by room: ${out.direct.byRoom.map(([k, v]) => `${k}:${v}`).join('  ')}`)
console.log(`   by role: ${out.direct.byRole.map(([k, v]) => `${k}:${v}`).join('  ')}`)

// ── ⭐⭐ 2 · THE EARLIEST TEN, VERBATIM AROUND THE TERM ───────────────────────────────────────────
// ⛔ Not summarised. Whether the first occurrence INTRODUCES the word or ASSUMES it is the whole
// question, and only the surrounding sentence can answer it.
console.log('\n══ THE EARLIEST OCCURRENCES, VERBATIM ═══════════════════════════════')
const earliest = rows.slice(0, 10).map((r) => {
  const i = r.content.search(/\mrome\M/i) >= 0 ? r.content.search(/rome/i) : 0
  const window = r.content.slice(Math.max(0, i - 220), i + 260).replace(/\s+/g, ' ')
  return {
    at: r.created_at, room: r.room, roomName: r.room_name, person: r.person,
    role: r.role, conv: r.conv, mid: r.mid, window,
  }
})
for (const [i, e] of earliest.entries()) {
  const who = e.role === 'assistant' ? 'SOTERA' : `${e.person} (${e.room})`
  console.log(`\n   #${i + 1}  ${e.at.toISOString()}  ${who}  conv ${e.conv}`)
  console.log(`       …${e.window}…`)
}
out.direct.earliest = earliest

// ── ⭐⭐⭐ 3 · WHO SAID IT FIRST, AND WHETHER THE FIRST ROW IS AN ORIGIN AT ALL ────────────────────
const first = rows[0]
if (first) {
  const firstIsAssistant = first.role === 'assistant'
  // ⛔ A first occurrence that READS as already-shared knowledge is not an origin. Naming it one would
  // be exactly the inference that got "Rome is the project name" withdrawn.
  const assumesIt = /\bthe rome\b|\bour rome\b|as we (discussed|said)|you (said|called|named)/i.test(first.content)
  out.direct.first = {
    at: first.created_at, room: first.room, person: first.person, role: first.role,
    conv: first.conv, mid: first.mid, firstIsAssistant, readsAsAlreadyShared: assumesIt,
  }
  console.log('\n══ THE FIRST ROW IN THE STORE ═══════════════════════════════════════')
  console.log(`   ${first.created_at.toISOString()}  role=${first.role}  room=${first.room}  person=${first.person}`)
  console.log(`   spoken by: ${firstIsAssistant ? 'SOTERA' : 'a person'}`)
  console.log(`   ⚠️ reads as already-shared: ${assumesIt}`)
  // ⭐ AND WHETHER ANYTHING PRECEDES IT IN THAT CONVERSATION — an origin should have context before it.
  const before = await q(
    `select count(*)::int n from ${S}.txn_messages
      where conversation_id = (select conversation_id from ${S}.txn_messages where id = $1)
        and created_at < $2`, [first.mid, first.created_at])
  out.direct.first.messagesBeforeItInThatConversation = before[0].n
  console.log(`   messages before it in that conversation: ${before[0].n}`)
}

// ── ⭐ 4 · CLAIMS, KEPT SEPARATE ──────────────────────────────────────────────────────────────────
const claims = await q(
  `select left(m.id::text,8) mid, m.author, m.kind, m.scope, m.attribute, m.created_at,
          left(m.content,200) content
     from ${S}.txn_memories m where m.content ~* '\\mrome\\M' order by m.created_at asc`)
out.claims.total = claims.length
out.claims.rows = claims
console.log(`\n══ CLAIMS (memories) · ${claims.length} — ⛔ NOT origin evidence ════════════════`)
for (const c of claims) {
  console.log(`   ${c.created_at.toISOString()} ${c.mid} author=${c.author} kind=${c.kind}`)
  console.log(`       ${String(c.content).replace(/\s+/g, ' ').slice(0, 150)}`)
}
// ⛔ THE ORDERING TEST THAT MAKES "CLAIM, NOT ORIGIN" A MEASUREMENT RATHER THAN AN ASSERTION.
if (first && claims.length) {
  const earliestClaim = claims[0].created_at
  out.claims.allPostdateFirstMessage = earliestClaim > first.created_at
  console.log(`\n   ⭐ earliest claim is ${out.claims.allPostdateFirstMessage ? 'AFTER' : 'BEFORE'} the earliest message`)
  console.log('     ⇒ a memory that postdates the conversation cannot be where the word came from.')
}

// ── ⭐ 5 · THE DISCLOSURE AUDIT TRAIL, PRESERVED ──────────────────────────────────────────────────
const events = await q(
  `select authorized_via, count(*)::int n, max(created_at) newest
     from ${S}.log_disclosure_events group by authorized_via order by n desc`)
out.disclosure.before = events
console.log('\n══ DISCLOSURE AUDIT (before any cross-room read by her) ═════════════')
for (const e of events) console.log(`   ${String(e.authorized_via).padEnd(16)} ${e.n}`)

const file = new URL('../results/rome-origin.json', import.meta.url)
writeFileSync(file, JSON.stringify(out, null, 2), 'utf8')
console.log(`\n  wrote ${file.pathname.replace(/^\//, '')}`)
await pg.end()
