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

// ⭐ `--cid` / `--title` / `--out` added 2026-08-21 so a session can be CONTINUED and ADAPTED rather than
// fired as a script. Ote, on the Hermes behavioural test: *"Have a genuine conversation with her… If she
// takes another route, follow it."* You cannot follow a route with a fixed turn list decided in advance.
const argv = process.argv.slice(2)
const KEEP = argv.includes('--keep')
const opt = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : dflt
}
const GIVEN_CID = opt('cid')
const TITLE = opt('title', 'ROOT PROBE — room index (delete me)')
const OUT_NAME = opt('out', 'root-room-index-probe.json')
const FLAG_VALUES = new Set([GIVEN_CID, TITLE, OUT_NAME].filter(Boolean))
const TURNS = argv.filter((a) => !a.startsWith('--') && !FLAG_VALUES.has(a))
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

let cid = GIVEN_CID
if (!cid) {
  const convo = await call('r', 'POST', '/v1/chat/conversations', {
    title: TITLE,
    model: config.chat?.defaultModel,
    settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true } },
  })
  cid = convo.json?.conversation?.id
  if (!cid) { console.error(`✖ no conversation (${convo.status}) ${String(convo.text).slice(0, 200)}`); process.exit(1) }
  console.log(`   conversation: ${cid}  (new)`)
} else {
  console.log(`   conversation: ${cid}  (continuing)`)
}
// ⚠️ A HELD TURN CAN BLOCK THIS POST FOR UP TO chat.interactionTimeoutSeconds (300s by default). That is
// not a hang — it is `request_room_access` waiting for a human to answer a permission card, which is the
// whole point of the mechanism. ⛔ Do not "fix" it with a client timeout: the answer belongs to whoever is
// at the keyboard, and abandoning the request would lose the interaction row that proves what happened.
console.log(`   ⓘ if she raises a permission card this turn will WAIT (up to 5 min) for a human to answer it`)

// ══ WAITING, OUT LOUD ═══════════════════════════════════════════════════════════════════════════════
//
// ⚠️⚠️ THE DEFECT THIS REPLACES, AND OTE SAW IT FROM THE OTHER SIDE BEFORE I DID:
// *"there's many time that there's no load on my side, but you waiting for your script."*
// The old loop slept 5s at a time for up to 240s and printed NOTHING, so from outside the box these three
// were one indistinguishable silence:
//
//   (a) a permission card is up, and a HUMAN has to answer it   → waiting is right, and someone must be TOLD
//   (b) the turn is alive and slow — tools running, tokens flowing → waiting is right, say what it is doing
//   (c) the turn is DEAD — the socket is gone and nothing is coming → waiting is pure waste
//
// ⛔ AND THE SILENT FAILURE UNDERNEATH IT WAS WORSE THAN THE SILENCE. On exhaustion the old code fell
// through and read `assistant rows .at(-1)` — the PREVIOUS turn's reply — and reported it as this turn's
// answer. A stale answer presented as an answer is the same failure class as a malformed argument
// reported as an absence: the instrument said something confident about nothing.
// ⇒ Every reply is now accepted only if its `rolling_id` is ABOVE the baseline taken before the POST.
//
// ⭐ EACH TICK PRINTS WHAT IT OBSERVED, and the states come from evidence in the database rather than from
// a clock: a pending interaction row (a), new `log_tool_calls` rows (b), neither (c).
const CARD_TIMEOUT_S = Number(config?.chat?.interactionTimeoutSeconds ?? 300)
// ⚠️ THE OLD BUDGET WAS SHORTER THAN THE THING IT WAS WAITING FOR: 240s of polling against a 300s card.
// A card answered at 280s was structurally unobservable — the loop had already given up. The budget now
// starts from the card's own timeout and adds room for the turn to finish after the answer arrives.
const TICK_S = 5
const QUIET_LIMIT_S = 180   // no card, no tool call, no reply, for this long ⇒ report it dead rather than wait on
const GRACE_AFTER_CARD_S = 120

async function awaitReply({ label, sinceRolling }) {
  const t0 = Date.now()
  const el = () => Math.round((Date.now() - t0) / 1000)
  let lastToolCount = (await q(`select count(*)::int n from ${S}.log_tool_calls where conversation_id=$1`, [cid]))[0].n
  let quietFor = 0
  let cardSeen = false
  let deadline = CARD_TIMEOUT_S + GRACE_AFTER_CARD_S
  let lastPrinted = ''
  const say = (s) => { if (s !== lastPrinted) { console.log(s); lastPrinted = s } }

  for (;;) {
    await new Promise((r) => setTimeout(r, TICK_S * 1000))

    // ── done? Only a row NEWER than the baseline counts. ──────────────────────────────────────────
    const [fresh] = await q(
      `select rolling_id from ${S}.txn_messages
        where conversation_id=$1 and role='assistant' and rolling_id > $2 order by rolling_id desc limit 1`,
      [cid, sinceRolling])
    if (fresh) { console.log(`   ✓ ${label}: her reply landed after ${el()}s`); return { verdict: 'answered', waitedS: el() } }

    // ── (a) is a human being asked something? ─────────────────────────────────────────────────────
    const [card] = await q(
      `select id::text, status, expires_at, questions,
              greatest(0, round(extract(epoch from (expires_at - now()))))::int left_s
         from ${S}.txn_interaction_sessions
        where conversation_id=$1 order by created_at desc limit 1`, [cid])
    if (card?.status === 'pending') {
      cardSeen = true; quietFor = 0
      deadline = Math.max(deadline, el() + card.left_s + GRACE_AFTER_CARD_S)
      const qtext = String(card.questions?.[0]?.question || '(no question text)').replace(/\s+/g, ' ').slice(0, 120)
      // ⛔ LOUD, AND ADDRESSED TO A PERSON. The whole mechanism is that a human decides — a card nobody
      // is told about is a card that times out, which is exactly what happened twice in Hermes's room.
      say(`   ⏸  A PERMISSION CARD IS WAITING FOR YOU in the browser — ${card.left_s}s left to answer it.\n`
        + `      "${qtext}"\n`
        + `      ⓘ This script must NOT answer it: the authorization has to be genuine.`)
      continue
    }
    if (cardSeen && card && card.status !== 'pending') {
      say(`   ▸ the card is ${card.status} — the turn has resumed; waiting for the answer it produces`)
      deadline = Math.max(deadline, el() + GRACE_AFTER_CARD_S)
    }

    // ── (b) is she working? New tool-call rows are the only load this script can see from outside. ──
    const nowTools = (await q(`select count(*)::int n from ${S}.log_tool_calls where conversation_id=$1`, [cid]))[0].n
    if (nowTools > lastToolCount) {
      const names = await q(
        `select tool from ${S}.log_tool_calls where conversation_id=$1 order by rolling_id desc limit $2`,
        [cid, nowTools - lastToolCount])
      console.log(`   ⚙  ${el()}s — working: ${names.map((r) => r.tool).reverse().join(' → ')}  (${nowTools} tool calls this conversation)`)
      lastToolCount = nowTools; quietFor = 0; continue
    }

    // ── (c) nothing at all. Say so every tick, and stop calling it waiting after QUIET_LIMIT. ──────
    quietFor += TICK_S
    say(`   … ${el()}s — no card, no tool call, no reply: either she is composing the final answer, or the turn is gone`)
    if (quietFor >= QUIET_LIMIT_S) {
      console.log(`   ✖ ${label}: ${quietFor}s with no observable activity — reporting NO ANSWER rather than waiting on it`)
      return { verdict: 'dead', waitedS: el() }
    }
    if (el() >= deadline) {
      console.log(`   ✖ ${label}: gave up after ${el()}s (budget ${deadline}s)`)
      return { verdict: 'timeout', waitedS: el() }
    }
  }
}

const transcript = []
try {
  for (const [i, text] of TURNS.entries()) {
    // ⚠⚠ A HELD TURN OUTLIVES THE HTTP CLIENT, AND RACING IT LOSES THE REPLY.
    // `request_room_access` / `ask_user` pause a turn until a human answers — up to
    // `chat.interactionTimeoutSeconds` (300s) — and Node's fetch aborts headers at exactly 300s. Measured
    // on the first live Hermes run: `UND_ERR_HEADERS_TIMEOUT` fired in the same second the card expired,
    // the process died, and the turn's answer was lost even though the server had finished it.
    // ⛔ Not a hang: waiting is the mechanism. ⇒ If the socket gives up, stop waiting on it and read the
    // answer from the DATABASE, which is where this script reads every reply from anyway.
    //
    // ⭐ THE BASELINE IS TAKEN BEFORE THE POST, AND IT IS WHAT MAKES A MISSING ANSWER LEGIBLE. Without it
    // "her reply" is whatever assistant row happens to be last, which after a lost turn is the previous
    // one — a stale answer reported as an answer.
    const [base] = await q(
      `select coalesce(max(rolling_id), 0) rid from ${S}.txn_messages where conversation_id=$1 and role='assistant'`, [cid])
    const sinceRolling = Number(base.rid)
    let held = false
    let wait = { verdict: 'direct', waitedS: null }
    console.log(`\n── T${i + 1} ▸ ${text}`)
    try {
      const posted = await call('r', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: text, stream: false })
      if (posted.status >= 300) throw new Error(`TURN ${i + 1} REFUSED (${posted.status}): ${String(posted.text || '').slice(0, 300)}`)
    } catch (e) {
      if (!/HEADERS_TIMEOUT|fetch failed/i.test(String(e?.message) + String(e?.cause?.code))) throw e
      held = true
      console.log(`   ⏳ the socket gave up on this turn — the server may still be finishing it. Watching the database:`)
      wait = await awaitReply({ label: `T${i + 1}`, sinceRolling })
    }
    // ⭐ ONLY A ROW ABOVE THE BASELINE IS THIS TURN'S ANSWER. If there isn't one, that is reported as an
    // absence with the reason — never as an empty reply, and never as the previous turn's text.
    const [last] = await q(
      `select role, content, tool_calls, error from ${S}.txn_messages
        where conversation_id=$1 and role='assistant' and rolling_id > $2 order by rolling_id desc limit 1`,
      [cid, sinceRolling])
    const tc = Array.isArray(last?.tool_calls) ? last.tool_calls : (last?.tool_calls ? [last.tool_calls] : [])
    const tools = tc.map((t) => t?.function?.name || t?.name).filter(Boolean)
    transcript.push({
      turn: i + 1, asked: text, tools, reply: last?.content ?? null,
      error: last?.error || null, held, wait: wait.verdict, waitedS: wait.waitedS,
      answered: Boolean(last),
    })
    console.log(`   tools: ${tools.join(', ') || '(NONE)'}${last?.error ? `  ⚠ ${last.error}` : ''}`)
    if (!last) {
      console.log(`\n   ✖✖ NO ANSWER FOR THIS TURN (${wait.verdict}). Nothing was written above the pre-POST`
        + ` baseline, so there is no reply to report — ⛔ and the previous turn's text is deliberately not shown here.`)
    } else {
      console.log(`\n   ${(last.content || '(EMPTY — a row exists and its content is empty, which is a real empty answer)').replace(/\n+/g, '\n   ')}`)
    }
  }
} finally {
  // The transcript is the evidence. Save it BEFORE deleting anything.
  mkdirSync(new URL('../results/', import.meta.url), { recursive: true })
  const out = new URL(`../results/${OUT_NAME}`, import.meta.url)
  writeFileSync(out, JSON.stringify({ room: 'ote', conversationId: cid, conversationTitle: TITLE, transcript }, null, 2))
  console.log(`\n  transcript → test/results/${OUT_NAME}`)

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
