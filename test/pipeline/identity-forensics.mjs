// ⭐⭐⭐ IDENTITY FORENSICS — who was actually speaking, and who got renamed.
//
//   node pipeline/identity-forensics.mjs
//
// ⛔ READ-ONLY. No row is edited, quarantined, deleted or reconciled by this file. Ote, 2026-08-26:
// *"Do not silently correct my identity rows yet… I want the mechanism fixed before we reconcile those
// rows, same principle as the lineage and Rome work."*
//
// ── ⭐ THE SIX QUESTIONS HE ASKED, PER ROW ────────────────────────────────────────────────────────
//   1. the row / id
//   2. its source message
//   3. who actually AUTHORED / SPOKE that message
//   4. what `captureIdentity` currently thinks the naming subject is
//   5. what the correct subject should be
//   6. whether "Being Your" and the Hermes Thai sentence share the underlying failure
//
// ── ⭐⭐ THE FOUR THINGS THAT ARE BEING COLLAPSED ─────────────────────────────────────────────────
//     message author    the ACCOUNT the row was typed from        (`txn_messages` → conversation owner)
//     room owner        whose room the conversation lives in       (`txn_conversations.user_id`)
//     speaker identity  WHO IS TALKING inside the message          ⛔ nothing records this
//     naming subject    who the name is being attached to          ⛔ assumed to be the room owner
// ⇒ today all four resolve to one value, and the store has a column for exactly one of them.

import { writeFileSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'
import { assertionGate } from '@ote/memory/cognition/memory-extract.js'

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows
const out = { at: new Date().toISOString(), rows: [] }

const rows = await q(
  `select m.id::text id, m.value, m.attribute, m.confidence, m.provenance, m.created_at,
          m.invalid_at, m.namespace, m.scope, m.author, m.source_message_id::text smid,
          u.username room, u.id::text room_id,
          msg.role msg_role, msg.content msg_text,
          cu.username conv_owner, left(c.id::text,8) conv
     from ${S}.txn_memories m
     left join ${S}.mst_users u on u.id = m.user_id
     left join ${S}.txn_messages msg on msg.id = m.source_message_id
     left join ${S}.txn_conversations c on c.id = msg.conversation_id
     left join ${S}.mst_users cu on cu.id = c.user_id
    where m.attribute = 'preferred_name' and m.invalid_at is null
    order by m.created_at desc`)

console.log('\n══ EVERY LIVE `preferred_name` ROW, AND WHO ACTUALLY SPOKE ══════════')
console.log('   ⛔ READ-ONLY — nothing here is modified.\n')

for (const r of rows) {
  const text = String(r.msg_text ?? '')
  const gate = assertionGate(text)
  // ⭐ Does the message CONTAIN a quoted utterance? The assertion gate strips fences, blockquotes and
  // transcribed-line runs — it was built for pasted DOCUMENTS. A relayed UTTERANCE in ordinary quotation
  // marks is a different shape entirely, and this is what asks whether that shape is present.
  // ⚠⚠ DOUBLE QUOTES ONLY — AND MY FIRST VERSION INCLUDED THE APOSTROPHE, WHICH WAS WRONG.
  // It matched *"i'm Kavi — i do a lot of late-night debugging and i'd"* as a quoted utterance, because
  // English contractions put an apostrophe on both ends of almost any span. ⛔ That put two rows into the
  // RELAYED-SPEECH class that are nothing of the kind — people naming themselves in their own prose —
  // and I would have handed Ote a classification built on it. The apostrophe is not a quotation mark in
  // running English, and a detector that treats it as one manufactures relays.
  const quoted = [...text.matchAll(/["“”]([^"“”]{12,})["“”]/g)].map((m) => m[1])
  const valueInQuote = quoted.some((qq) => qq.toLowerCase().includes(String(r.value ?? '').toLowerCase()))
  const valueOutsideQuote = String(gate.text ?? '').toLowerCase().includes(String(r.value ?? '').toLowerCase())

  const row = {
    id: r.id.slice(0, 8), value: r.value, room: r.room, conv: r.conv,
    msgRole: r.msg_role, convOwner: r.conv_owner, provenance: r.provenance,
    gateExtracted: gate.extract, gateReason: gate.reason ?? null,
    quotedRegions: quoted.length, valueInQuote, valueOutsideQuote,
    source: text.replace(/\s+/g, ' ').slice(0, 160),
  }
  out.rows.push(row)

  console.log(`   ⭐ ${row.id}  preferred_name = ${JSON.stringify(r.value)}`)
  console.log(`      room (naming subject today) : ${r.room}`)
  console.log(`      source message              : ${r.smid ? r.smid.slice(0, 8) : '⛔ none'}  role=${r.msg_role ?? '?'}  conversation owner=${r.conv_owner ?? '?'}`)
  console.log(`      text                        : "${row.source}"`)
  console.log(`      assertion gate              : ${gate.extract ? 'PASSED (extraction allowed)' : `BLOCKED (${gate.reason})`}`)
  console.log(`      quoted utterance regions    : ${quoted.length}${quoted.length ? `  → ${JSON.stringify(quoted[0].slice(0, 70))}` : ''}`)
  console.log(`      the stored NAME appears     : ${valueInQuote ? '⛔ INSIDE a quoted utterance' : valueOutsideQuote ? '✅ in the speaker\'s own prose' : '⚠️ nowhere in the source text'}`)
  console.log('')
}

// ── ⭐⭐ THE CLASSIFICATION ───────────────────────────────────────────────────────────────────────
// Three distinct failures hide in these rows and they need different fixes. Naming them apart is the
// whole point — *"whether 'Being Your' and the Hermes Thai sentence have the same underlying failure"*.
console.log('══ THE FAILURES ARE NOT ALL THE SAME ════════════════════════════════')
const relayed = out.rows.filter((r) => r.valueInQuote)
const notInText = out.rows.filter((r) => !r.valueInQuote && !r.valueOutsideQuote)
const longValue = out.rows.filter((r) => String(r.value ?? '').length > 30)
const ok = out.rows.filter((r) => r.valueOutsideQuote && String(r.value ?? '').length <= 30)

const show = (label, list, why) => {
  console.log(`\n   ${label} — ${list.length}`)
  console.log(`      ${why}`)
  for (const r of list) console.log(`      · ${r.id} ${r.room.padEnd(13)} ${JSON.stringify(String(r.value).slice(0, 48))}`)
}
show('⛔ A · RELAYED SPEECH — the name was inside a quoted utterance', relayed,
  'The account holder was QUOTING somebody else. Speaker ≠ author. The assertion gate strips pasted '
  + 'DOCUMENTS; an utterance in ordinary quotation marks is a shape it was never taught.')
show('⛔ B · NOT A NAME AT ALL — a whole sentence in a name slot', longValue.filter((r) => !relayed.includes(r)),
  'The interpreter was sure a naming ACT occurred and captured the wrong span. A different defect: '
  + 'nothing to do with who was speaking.')
show('⚠️ C · THE NAME IS NOWHERE IN THE SOURCE TEXT', notInText.filter((r) => !longValue.includes(r)),
  'The value cannot be traced to the words it claims to come from.')
show('✅ D · CORRECT — the speaker named themselves, in their own prose', ok.filter((r) => !relayed.includes(r) && !longValue.includes(r)),
  'These are what the mechanism is for, and they work.')

out.classes = {
  relayedSpeech: relayed.map((r) => r.id),
  notAName: longValue.filter((r) => !relayed.includes(r)).map((r) => r.id),
  untraceable: notInText.filter((r) => !longValue.includes(r)).map((r) => r.id),
  correct: ok.filter((r) => !relayed.includes(r) && !longValue.includes(r)).map((r) => r.id),
}

const file = new URL('../results/identity-forensics.json', import.meta.url)
writeFileSync(file, JSON.stringify(out, null, 2), 'utf8')
console.log(`\n  wrote ${file.pathname.replace(/^\//, '')}`)
await pg.end()
