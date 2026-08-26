// ⭐ ARCHIVE THE CONVERSATIONS *I* LEFT IN HIS ROOM. ⛔ Never his own.
//
//   node pipeline/archive-my-residue.mjs            (DRY RUN — lists, changes nothing)
//   node pipeline/archive-my-residue.mjs --apply
//
// Ote, 2026-08-26, looking at his own sidebar: *"are these from your test? can you archive conversation
// that your if you use my account?"*
//
// ── ⛔⛔ THE RULE I BROKE ──────────────────────────────────────────────────────────────────────────
// `ote` is his account. Every probe in this directory refuses root except `ask-sotera-as-root.mjs`,
// which exists BECAUSE it snapshots his room and removes exactly what it created. `lineage-reconcile.mjs`
// takes `--as`, I passed `ote` to reach the three family-lineage rows that live in his room — and it has
// no residue control at all. Six conversations stayed there for a day, and he found them, not me.
//
// ── ⭐⭐ WHY ARCHIVE AND NOT DELETE ───────────────────────────────────────────────────────────────
// ⛔ Deleting would destroy the evidence of what a Phase-2 run actually did, in a week where the standing
// instruction is *"don't directly repair historical evidence just because it makes the system look
// cleaner."* Archiving is reversible, is the product's own gesture for "out of my way", and is exactly
// what he asked for. ⇒ the rows stay, his sidebar clears.
//
// ── ⭐⭐⭐ THE CRITERION IS `settings.probe`, AND ITS THREE VALUES ARE NOT TWO ─────────────────────
// The harness stamps `settings.probe = true` on every conversation it opens (`markProbeConversation`),
// which is structural proof of authorship — far better than matching a title I chose. But the flag has
// THREE states and reading it as a boolean is exactly the mistake this project keeps paying for:
//
//   `true`   ⭐ the harness opened it. Provably a probe. ⇒ ELIGIBLE.
//   `null`   the key was never set ⇒ the web UI opened it. ⛔ HIS. (The frontend never writes this key.)
//   `false`  ⚠️⚠️ **ALSO MY SCRIPTS** — `ask-sotera.mjs` and eight siblings set it explicitly, opting out
//            *"because a conversation is a conversation whatever my reason for having it."*
//
// ⛔⛔ AND `false` MUST NOT BE ARCHIVED, WHICH IS THE WHOLE REASON THIS COMMENT EXISTS. `7198c1b0`
// carries `probe: false` — a script of mine opened it — and it now holds 64 messages, is the room Ote was
// personally typing in at 3am, and is the conversation the handle investigation was about. ⇒ ⭐ **the
// marker records who OPENED a conversation, never whose it now is.** A conversation he has since talked
// in is his, whatever started it. Archiving on `probe !== true` would have hidden the chat he was in.
//
// ⇒ this script archives ONLY `probe = true`, and REPORTS `probe = false` with metadata for him to
// decide. ⛔ It never reads a message body to make that call: whose a conversation is, is his to say.

import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'

const APPLY = process.argv.includes('--apply')

const config = loadConfig()
const rootUser = config?.auth?.root?.username
const rootPass = config?.auth?.root?.password
if (!rootUser || !rootPass) { console.error('✖ auth.root.username/password are not set in Backend/config.json'); process.exit(1) }

const pg = devPg(); await pg.connect()
const S = devSchema()
const rows = (await pg.query(
  `select c.id, c.title, c.created_at, c.settings->>'probe' probe,
          (select count(*) from ${S}.txn_messages m where m.conversation_id = c.id)::int msgs,
          (select max(m.created_at) from ${S}.txn_messages m where m.conversation_id = c.id) last_msg
     from ${S}.txn_conversations c
     join ${S}.mst_users u on u.id = c.user_id
    where u.username = $1 and c.archived_at is null
    order by c.created_at desc`, [rootUser])).rows
await pg.end()

const at = (d) => (d ? d.toISOString().slice(0, 16).replace('T', ' ') : '—')
const line = (r) => `      ${at(r.created_at)} → ${at(r.last_msg)}  ${String(r.id).slice(0, 8)}  ${String(r.msgs).padStart(3)} msgs  ${r.title}`

const mine = rows.filter((r) => r.probe === 'true')
const opened = rows.filter((r) => r.probe === 'false')  // a script opened it; he may have continued it
const his = rows.filter((r) => r.probe == null)

console.log(`\n══ ACTIVE CONVERSATIONS IN ${rootUser}'S ROOM: ${rows.length} ═══════════════════`)
console.log(`\n   ⛔ HIS — opened in the web UI, no probe key (${his.length}). Not touched:`)
for (const r of his) console.log(line(r))
console.log(`\n   ⚠️  A SCRIPT OF MINE OPENED THESE, BUT HE MAY HAVE CONTINUED THEM (${opened.length}).`)
console.log('       ⛔ NOT ARCHIVED — the span and the message count are shown so HE can say. Whose a')
console.log('       conversation is, is not a thing this script gets to infer from a flag it set itself:')
for (const r of opened) console.log(line(r))
console.log(`\n   ⭐ MINE — harness-marked \`probe: true\` (${mine.length}):`)
for (const r of mine) console.log(line(r))

if (!mine.length) { console.log('\n   nothing harness-marked is active in his room.'); process.exit(0) }
if (!APPLY) { console.log(`\n   DRY RUN — pass --apply to archive these ${mine.length}. Nothing was changed.`); process.exit(0) }

// ⚠️ THROUGH THE PRODUCT'S OWN ENDPOINT, NOT AN UPDATE STATEMENT. `PATCH /v1/chat/conversations/:id`
// is what the archive button calls; going around it would skip whatever it does besides set a column,
// and would make this script the only writer that does archiving its own way.
const call = makeClient()
const login = await call('r', 'POST', '/v1/auth/login', { username: rootUser, password: rootPass })
if (login.status !== 200) { console.error(`✖ root login failed (${login.status})`); process.exit(1) }
if (login.json?.user?.isRoot !== true) { console.error('✖ logged in but isRoot is not true'); process.exit(1) }

let ok = 0
for (const r of mine) {
  const res = await call('r', 'PATCH', `/v1/chat/conversations/${r.id}`, { archived: true })
  const good = res.status >= 200 && res.status < 300
  if (good) ok++
  console.log(`   ${good ? '✓' : '✖'} ${String(r.id).slice(0, 8)}  ${r.title}  (${res.status})`)
}
console.log(`\n   archived ${ok}/${mine.length}.${ok === mine.length ? '' : '  ⚠️ some failed — check above.'}`)
process.exit(ok === mine.length ? 0 : 1)
