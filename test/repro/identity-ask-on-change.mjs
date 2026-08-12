// ⭐ THE ADOPTION GATE, LIVE — she will not rename him without asking (RFC step 5).
//
//   node repro/identity-ask-on-change.mjs
//
// Before this, a second name for an occupied slot was DEFERRED: logged, silently dropped, and the user
// was never told. Before *that* — for six weeks — a regex could overwrite a known-good name with a
// fragment of his own prose. Now a change asks, and the answer is the only thing that writes.
//
// WHY THIS CANNOT BE A UNIT TEST. The gate is unit-tested (Packages/Memory/test/identity-adoption),
// but the ASK is a promise held across an HTTP round trip, a persisted interaction session, the
// protocol broadcast, and a human clicking. Every one of those is a place where "asked" could quietly
// become "assumed", and only the running system can say it did not.
//
// ⚠️ OUT OF THE PASS/FAIL SUITE — needs the server, a live model, and about two minutes.
// ⛔ agent_dev, never root. This RENAMES whoever it runs as.
//
// ⚠️⚠️ AND IT WIPES agent_dev's MEMORIES AT THE END — every one, not just the rows it made. That is
// correct hygiene for a test account and a real hazard the moment the account holds anything you care
// about. Found the honest way on 2026-08-12: I had just held a genuine conversation with her as
// agent_dev — she had learned my name and three facts — and running this erased all of it. The account
// is a test fixture, so nothing was lost that mattered; but a "friendship" and a cleanup target cannot
// be the same rows, and if you ever want a persistent relationship to survive, use a different user.
// (The same sweep is in capture-invents-a-name.mjs and identity-thai-end-to-end.mjs.)
import { makeChecker, makeClient, devPg, devSchema, asAgent } from '../harness.mjs'
import { readFileSync } from 'node:fs'

const FIRST = { text: 'my name is Ote', name: 'Ote' }
const SECOND = { text: 'actually my name is Otto', name: 'Otto' }

const { check, done } = makeChecker()
const call = makeClient()
const cfg = JSON.parse(readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))
const who = await asAgent(call)
const db = devPg(); await db.connect()
const S = devSchema()

const me = (await db.query(`select id from ${S}.mst_users where username='agent_dev'`)).rows[0]?.id
check('resolved agent_dev user id (every write and cleanup is scoped to it)', Boolean(me), me)
await db.query(`delete from ${S}.txn_memories where user_id = $1 and namespace='identity'`, [me])

const nameNow = async () => (await db.query(
  `select value from ${S}.txn_memories where user_id=$1 and namespace='identity' and attribute='preferred_name'
     and invalid_at is null and expired_at is null order by created_at desc limit 1`, [me])).rows[0]?.value ?? null

const newConversation = async (title) => (await call(who, 'POST', '/v1/chat/conversations', {
  title, model: cfg.chat?.defaultModel,
  settings: { stream: false, toolsEnabled: false, useMemory: true, reasoning: { enabled: false } },
})).json?.conversation?.id

const say = (cid, content) => call(who, 'POST', `/v1/chat/conversations/${cid}/messages`, { content, stream: false })
const waitFor = async (fn, tries = 18, ms = 4000) => {
  for (let i = 0; i < tries; i++) { await new Promise((r) => setTimeout(r, ms)); const v = await fn(); if (v) return v }
  return null
}
const pendingIn = async (cid) => (await call(who, 'GET', `/v1/chat/conversations/${cid}/interactions/pending`)).json?.interaction ?? null

const cids = []
// ── 1 · AN EMPTY SLOT STILL ADOPTS SILENTLY. Nothing is at risk, so nobody is interrupted. ────────
const c1 = await newConversation('REPRO — first name, empty slot'); cids.push(c1)
await say(c1, FIRST.text)
const learned = await waitFor(nameNow)
check(`empty slot adopted "${FIRST.name}" with no question asked`, learned === FIRST.name, learned)
check('…and no interaction was created for it', (await pendingIn(c1)) === null)

// ── 2 · ⭐ A CHANGE ASKS, AND WAITS ────────────────────────────────────────────────────────────────
const c2 = await newConversation('REPRO — a second name must ask'); cids.push(c2)
await say(c2, SECOND.text)
const q = await waitFor(() => pendingIn(c2))
check('a name that would REPLACE a known name raised a question', Boolean(q), q?.id ?? 'no interaction appeared')
if (q) {
  const opts = (q.questions?.[0]?.options ?? []).map((o) => o.label)
  console.log(`\n  she asked: "${q.questions?.[0]?.question}"`)
  console.log(`  options  : ${opts.join('  |  ')}   (custom allowed: ${q.questions?.[0]?.allowCustom})\n`)
  check('the question names BOTH sides — an ask that cannot say what it replaces is not a question',
    opts.includes(SECOND.name) && opts.includes(FIRST.name), opts.join(', '))
  check('free text is allowed — "call me something else entirely" is a real answer', q.questions?.[0]?.allowCustom === true)
}
// ⚠️ AND WHILE IT WAITS, NOTHING HAS MOVED. This is the assertion that matters most: asking must not
// be a formality performed after the fact.
check(`the name is still "${FIRST.name}" while the question is open`, (await nameNow()) === FIRST.name, await nameNow())

// ── 3 · THE ANSWER IS THE ONLY THING THAT WRITES ──────────────────────────────────────────────────
if (q) {
  const r = await call(who, 'POST', `/v1/chat/conversations/${c2}/interactions/${q.id}/answer`,
    { answers: [{ selected: [SECOND.name] }] })
  check('the answer was accepted', r.status === 200, `status ${r.status}`)
  const after = await waitFor(async () => ((await nameNow()) === SECOND.name ? SECOND.name : null), 10, 2000)
  check(`answering "${SECOND.name}" is what renamed him`, after === SECOND.name, await nameNow())
}

// ── 4 · DECLINING KEEPS THE CURRENT NAME ──────────────────────────────────────────────────────────
const c3 = await newConversation('REPRO — declining keeps the name'); cids.push(c3)
await say(c3, 'my name is Rex')
const q3 = await waitFor(() => pendingIn(c3))
check('a third name asks again rather than assuming the last answer generalises', Boolean(q3), q3?.id ?? 'none')
if (q3) {
  // Choose the name she ALREADY holds — a real answer that means "leave it alone".
  await call(who, 'POST', `/v1/chat/conversations/${c3}/interactions/${q3.id}/answer`, { answers: [{ selected: [SECOND.name] }] })
  await new Promise((r) => setTimeout(r, 4000))
  check(`declining left him as "${SECOND.name}" — no row, no rename`, (await nameNow()) === SECOND.name, await nameNow())
}

// ── 5 · ⭐ THE SLOT, NOT THE ANSWER ────────────────────────────────────────────────────────────────
//
// ⚠️ THIS SECTION EXISTS BECAUSE EVERY CHECK ABOVE PASSED WHILE THE SLOT WAS BROKEN. The first live run
// of this file went all-green with THREE live rows in it — "Ote", "Ote", "Otto" — because each check
// asked "is the newest value right?" and the newest value always was. A user would have seen two of
// their own names sitting in their Memory panel. A test that reads the way the code reads cannot find
// a bug in how the code writes, so this one asks the database a different question.
const all = (await db.query(
  `select attribute, value, supersedes_id, (invalid_at is null and expired_at is null) as live from ${S}.txn_memories
    where user_id=$1 and namespace='identity' order by created_at`, [me])).rows
console.log(`\n  identity rows written across the whole run: ${all.length}`)
for (const r of all) console.log(`    ${r.attribute} = ${JSON.stringify(r.value)}  ${r.live ? '(live)' : '(superseded)'}`)

const liveNames = all.filter((r) => r.live && r.attribute === 'preferred_name')
check('EXACTLY ONE live name — a person does not have two names at once', liveNames.length === 1,
  liveNames.map((r) => r.value).join(', ') || 'none')
check('and the superseded ones are ARCHIVED, so "what did she used to call me?" is answerable',
  all.filter((r) => !r.live).length >= 1, `${all.filter((r) => !r.live).length} archived`)
check('the live row points at what it replaced', Boolean(liveNames[0]?.supersedes_id), liveNames[0]?.supersedes_id ?? 'no link')

// Leave nothing behind — scoped by user id, never by value pattern.
//
// ⚠️ THE SWEEP IS NOT BELT-AND-BRACES, IT IS THE CLEANUP. A per-id DELETE loop leaves residue the
// moment a run fails early or a request errors: the first live run of this file left one conversation
// behind exactly that way, and I found it only because I went looking. Anything scoped to agent_dev
// goes, so a failed run cleans up as thoroughly as a passing one.
for (const cid of cids) if (cid) await call(who, 'DELETE', `/v1/chat/conversations/${cid}`).catch(() => {})
await db.query(`delete from ${S}.txn_memories where user_id = $1`, [me])
await db.query(`delete from ${S}.txn_interaction_sessions where user_id = $1`, [me])
await db.query(`delete from ${S}.txn_conversations where user_id = $1`, [me])
await db.end()

done()
