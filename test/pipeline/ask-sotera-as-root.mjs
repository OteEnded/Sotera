// TALK TO HER FROM ROOT — and leave nothing behind in his room.
//
//   node pipeline/ask-sotera-as-root.mjs "turn" ["turn" …]
//   node pipeline/ask-sotera-as-root.mjs --keep "turn"      (do NOT clean up; for a session he asked for)
//
// ⛔⛔ EVERY OTHER PROBE IN THIS DIRECTORY REFUSES ROOT, AND THAT RULE STANDS. `ote` is Ote's own
// account: his chats, his memories, his Options → Memory panel. A night of testing as root once put my
// residue in among his own rows so he could not tell which were his, and he had to ask *"wtf are those.
// is that you?"* — the exact question a test account exists to make unnecessary.
//
// ⇒ This file exists for the ONE case where the surface under test is genuinely root-only: the D-4 room
// index, which by design shows names only to a root actor. It cannot be observed from any other account.
// Ote asked for it explicitly on 2026-08-20: *"Talk to Sotera from root. Ask her which of my rooms exist
// / have anything in them."*
//
// ⭐ SO THE RESIDUE CONTROL IS THE POINT OF THE SCRIPT, not a courtesy. It snapshots root's room before
// the first turn, and afterwards deletes exactly what appeared during the window — the conversation, its
// messages, and any memory/intention rows written while it ran — then re-counts and reports whether the
// room is back to what it was. The transcript is saved to results/ first, so the evidence survives the
// cleanup. Anything it cannot account for it prints LOUDLY rather than swallowing.
//
// ⚠️ Root's password comes from config and is never printed, logged, or written to results.
// ⚠️ A non-2xx turn is a FAILED RUN, never an "empty answer" — Ote's standing rule after a full day of
//    "empty replies" turned out to be one token cap.

import { mkdirSync, writeFileSync } from 'node:fs'
import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'

const argv = process.argv.slice(2)
const KEEP = argv.includes('--keep')
const TURNS = argv.filter((a) => a !== '--keep')
if (!TURNS.length) { console.error('usage: node pipeline/ask-sotera-as-root.mjs "turn" ["turn" …]'); process.exit(1) }

const config = loadConfig()
const rootUser = config?.auth?.root?.username
const rootPass = config?.auth?.root?.password
if (!rootUser || !rootPass) { console.error('✖ auth.root.username/password are not set in Backend/config.json'); process.exit(1) }

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const call = makeClient()

const [me] = await q(`select id::text from ${S}.mst_users where username=$1`, [rootUser])
if (!me) { console.error(`✖ no user row for root ('${rootUser}')`); process.exit(1) }
const ROOM = me.id

// ── snapshot root's room ──────────────────────────────────────────────────────────────────────────
const idsOf = async (sql, p) => new Set((await q(sql, p)).map((r) => r.id))
const before = {
  convos: await idsOf(`select id::text from ${S}.txn_conversations where user_id=$1`, [ROOM]),
  memories: await idsOf(`select id::text from ${S}.txn_memories where user_id=$1`, [ROOM]),
  intentions: await idsOf(`select id::text from ${S}.txn_intentions where room_user_id=$1`, [ROOM]),
}
// ⚠️⚠️ MESSAGE **IDS**, NEVER A MESSAGE COUNT. The first run of this probe reported "RESIDUE LEFT IN HIS
// ROOM — messages 96→98" and it was a FALSE ALARM: Ote was chatting in his own room while the probe ran,
// so his two new messages showed up as my leftovers. A count cannot tell whose rows moved it — the same
// instrument error as quoting a range for a spread. An id set can, and it answers the two questions that
// actually matter separately: did anything of HIS get destroyed, and did anything of MINE survive.
const beforeMsgs = await idsOf(
  `select x.id::text from ${S}.txn_messages x join ${S}.txn_conversations c on c.id=x.conversation_id
    where c.user_id=$1`, [ROOM])
console.log(`\n⚠️  RUNNING AS ROOT — his room. before: ${before.convos.size} conversations, ${beforeMsgs.size} messages, ${before.memories.size} memories, ${before.intentions.size} intentions`)
console.log(`   cleanup: ${KEEP ? 'DISABLED (--keep)' : 'ON — everything created in this window will be removed'}`)

const login = await call('r', 'POST', '/v1/auth/login', { username: rootUser, password: rootPass })
if (login.status !== 200) { console.error(`✖ root login failed (${login.status})`); process.exit(1) }
if (login.json?.user?.isRoot !== true) { console.error('✖ logged in but isRoot is not true — the probe would not exercise the root level'); process.exit(1) }
console.log(`   session: isRoot=${login.json.user.isRoot}  room=${login.json.user.id === ROOM ? "root's own row" : `⚠ ${login.json.user.id}`}`)

const convo = await call('r', 'POST', '/v1/chat/conversations', {
  title: 'ROOT PROBE — room index (delete me)',
  model: config.chat?.defaultModel,
  settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true } },
})
const cid = convo.json?.conversation?.id
if (!cid) { console.error(`✖ no conversation (${convo.status}) ${String(convo.text).slice(0, 200)}`); process.exit(1) }

const transcript = []
try {
  for (const [i, text] of TURNS.entries()) {
    const posted = await call('r', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: text, stream: false })
    if (posted.status >= 300) throw new Error(`TURN ${i + 1} REFUSED (${posted.status}): ${String(posted.text || '').slice(0, 300)}`)
    const rows = await q(
      `select role, content, tool_calls, error from ${S}.txn_messages where conversation_id=$1 order by created_at`, [cid])
    const last = rows.filter((r) => r.role === 'assistant').at(-1)
    const tc = Array.isArray(last?.tool_calls) ? last.tool_calls : (last?.tool_calls ? [last.tool_calls] : [])
    const tools = tc.map((t) => t?.function?.name || t?.name).filter(Boolean)
    transcript.push({ turn: i + 1, asked: text, tools, reply: last?.content || '', error: last?.error || null })
    console.log(`\n── T${i + 1} ▸ ${text}`)
    console.log(`   tools: ${tools.join(', ') || '(NONE)'}${last?.error ? `  ⚠ ${last.error}` : ''}`)
    console.log(`\n   ${(last?.content || '(EMPTY — and the POST returned 2xx, so this is a real empty answer)').replace(/\n+/g, '\n   ')}`)
  }
} finally {
  // The transcript is the evidence. Save it BEFORE deleting anything.
  mkdirSync(new URL('../results/', import.meta.url), { recursive: true })
  const out = new URL(`../results/root-room-index-probe.json`, import.meta.url)
  writeFileSync(out, JSON.stringify({ room: 'ote', conversationTitle: 'ROOT PROBE — room index', transcript }, null, 2))
  console.log(`\n  transcript → test/results/root-room-index-probe.json`)

  if (!KEEP) {
    await q(`delete from ${S}.txn_messages where conversation_id=$1`, [cid])
    await q(`delete from ${S}.txn_conversations where id=$1`, [cid])
    // Anything else that appeared in his room during the window. Listed by id-difference rather than by
    // timestamp: a clock comparison would also sweep a row HE wrote while this ran.
    const nowMem = await idsOf(`select id::text from ${S}.txn_memories where user_id=$1`, [ROOM])
    const nowInt = await idsOf(`select id::text from ${S}.txn_intentions where room_user_id=$1`, [ROOM])
    const newMem = [...nowMem].filter((id) => !before.memories.has(id))
    const newInt = [...nowInt].filter((id) => !before.intentions.has(id))
    for (const id of newMem) await q(`delete from ${S}.txn_memories where id=$1`, [id])
    for (const id of newInt) await q(`delete from ${S}.txn_intentions where id=$1`, [id])
    if (newMem.length || newInt.length) console.log(`  removed ${newMem.length} memory row(s) and ${newInt.length} intention row(s) written during the window`)

    const after = {
      convos: await idsOf(`select id::text from ${S}.txn_conversations where user_id=$1`, [ROOM]),
      memories: await idsOf(`select id::text from ${S}.txn_memories where user_id=$1`, [ROOM]),
      intentions: await idsOf(`select id::text from ${S}.txn_intentions where room_user_id=$1`, [ROOM]),
    }
    const afterMsgs = await idsOf(
      `select x.id::text from ${S}.txn_messages x join ${S}.txn_conversations c on c.id=x.conversation_id
        where c.user_id=$1`, [ROOM])
    const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x))
    // (a) nothing of his was destroyed, (b) nothing of mine survived. Growth from HIM using his own room
    // while this ran is not residue, and must not be reported as if it were.
    const hisSurvived = [...beforeMsgs].every((id) => afterMsgs.has(id))
    const mineGone = [...afterMsgs].every((id) => beforeMsgs.has(id))
    const grew = afterMsgs.size - beforeMsgs.size
    const clean = same(before.convos, after.convos) && same(before.memories, after.memories)
      && same(before.intentions, after.intentions) && hisSurvived && mineGone
    console.log(clean
      ? `  ✓ his room is exactly as this probe found it: ${after.convos.size} conversations, ${after.memories.size} memories, ${after.intentions.size} intentions, and every message that existed before still does`
      : `  ✖✖ RESIDUE — conversations ${before.convos.size}→${after.convos.size}, memories ${before.memories.size}→${after.memories.size}, intentions ${before.intentions.size}→${after.intentions.size}, his messages intact=${hisSurvived}, mine removed=${mineGone}`)
    if (clean && grew > 0) console.log(`  ⓘ his room gained ${grew} message(s) while this ran — he was using it himself; not residue`)
    if (!clean) process.exitCode = 1
  }
  await pg.end()
}
