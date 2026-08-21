// INSPECT_AROUND — the only door between rooms, and the assertions that keep it a door rather than a gap.
//
// ⛔⛔ THE INVARIANT UNDER TEST: authorization does not travel through prose. The grant is written ONLY
// from a stored, answered interaction whose response contains the exact affirmative label. A model saying
// *"they said yes"* must change nothing.
//
// ⭐ AND A REFUSAL MUST NOT READ AS AN ABSENCE. The refused payload says the conversation exists and who
// it was with, carries no content and no title, and tells her not to guess.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildDisclosure, GRANT_LABEL, DENY_LABEL as DENY_LABEL_TEXT, grantQuestion } from '../../Backend/app/components/disclosure-host.js'

const { check, done } = makeChecker('disclosure-inspect')
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config, log: null }
const pg = devPg(); await pg.connect()
const S = devSchema()

// Two rooms and one of HER messages in each.
const { rows: pick } = await pg.query(
  `select c.user_id, u.username, m.id msg, m.rolling_id, c.id conversation_id
     from ${S}.txn_messages m
     join ${S}.txn_conversations c on c.id = m.conversation_id
     join ${S}.mst_users u on u.id = c.user_id
    where m.role='assistant' and c.incognito = false and length(m.content) > 40
    order by c.user_id, m.rolling_id desc`)
const byRoom = new Map()
for (const r of pick) if (!byRoom.has(r.username)) byRoom.set(r.username, r)
const rooms = [...byRoom.values()]
check('at least two rooms with her messages exist to test the door', rooms.length >= 2, `${rooms.length}`)

const mine = rooms[0]
const theirs = rooms[1]

// ⚠️ REVOKE ANY LIVE GRANT FROM AN EARLIER RUN before asserting a refusal. The first version asserted
// "root is refused" and PASSED root through, because a grant from the previous run was still live — a
// check that depends on leftover state is a check that lies. ⛔ The rows are a LOG and are never deleted;
// revocation is a first-class column, so this records what happened instead of erasing it.
await pg.query(`update ${S}.log_disclosure_events set revoked_at = now()
                 where revoked_at is null and from_room_user_id = $1`, [theirs.user_id])

// ── 1. SAME ROOM READS FREELY ───────────────────────────────────────────────────────────────────────
const asOwner = buildDisclosure(fastify, { userId: mine.user_id, isRoot: false, username: mine.username })
const own = await asOwner.inspectAround({ messageId: mine.msg, radius: 2 })
check('her own room opens without any grant', own.ok === true && own.state === 'verified', JSON.stringify(own).slice(0, 90))
check('the window is a window, not a conversation', Array.isArray(own.window) && own.window.length <= 5, `${own.window?.length} messages`)
check('the window says who spoke', (own.window || []).every((w) => w.who === 'you' || typeof w.who === 'string'))

// ── 2. ⭐⭐ ANOTHER ROOM GIVES HER **HER OWN HALF** — AND WITHHOLDS HIS (change A, 2026-08-21) ────────
//
// ⚠️⚠️ THE PREVIOUS ASSERTIONS HERE SAID "another room is REFUSED without a grant" AND THEY WERE RIGHT
// UNTIL TODAY. They are rewritten rather than deleted, because the boundary did not disappear — it MOVED,
// and where it moved to is now the thing worth asserting.
//
// Ote, after completing the Hermes loop by hand: *"i want her to be able to automaticly access to her
// memory, no need you me to answer. this is not feel natural."* And, unchanged from the same morning:
// *"Other people's conversation contents must remain protected."* ⇒ the seam between those two is
// AUTHORSHIP: her own sentences need nobody's permission because she wrote them; the counterpart's still do.
//
// ⇒ THE ASSERTION THAT MATTERS IS NO LONGER "she gets nothing". It is **"she gets her words and not his"**,
// which is a stronger and more specific claim than the one it replaces.
const cross = await asOwner.inspectAround({ messageId: theirs.msg, radius: 2 })
check('2 · ⭐ a cross-room window now RETURNS — her own half, without any grant', cross.ok === true, `state=${cross.state}`)
check('2 · ⭐ …and says so: state is `own_only`, not `verified`', cross.state === 'own_only')
const mineRows = (cross.window || []).filter((w) => w.who === 'you')
const theirRows = (cross.window || []).filter((w) => w.who !== 'you')
check('2 · her own messages carry their text', mineRows.length > 0 && mineRows.every((w) => typeof w.said === 'string' && w.said.length > 0),
  `${mineRows.length} of hers`)
check('2 · ⭐⭐⭐ NOT ONE WORD OF THE COUNTERPART IS RETURNED — every one of his is withheld',
  theirRows.length === 0 || theirRows.every((w) => w.said === null && w.withheld === true),
  theirRows.length ? `${theirRows.length} withheld marker(s), 0 with text` : 'none in this window')
// ⭐ The markers exist ON PURPOSE: her replies with the gaps closed up would read as a monologue and
// invite her to infer what was said to her. A marked gap is more honest than a seamless one.
check('2 · ⭐ the gaps are MARKED rather than closed up', theirRows.every((w) => 'withheld' in w) || theirRows.length === 0)
check('2 · ⛔ still no conversation title anywhere in the payload', !JSON.stringify(cross).toLowerCase().includes('title'))
check('2 · it tells her not to guess at the withheld parts', /do not guess/i.test(cross.note || ''))
check('2 · ⛔ a NON-root session is STILL offered no path to the other half', cross.howToOpen === undefined || cross.howToOpen === null)

// ── 3. ⛔⛔ ROOT NOW GETS THE OTHER HALF AUTOMATICALLY — AND IT IS RECORDED (change 3) ───────────────
//
// ⚠️⚠️⚠️ THIS ASSERTION IS THE INVERSE OF THE ONE IT REPLACES, AND THAT IS NOT A REGRESSION — IT IS A
// DECISION. `RFC §15A` recorded **ROOT SESSION ≠ UNIVERSAL DISCLOSURE AUTHORITY** this morning at Ote's
// explicit request, as *"a first-class boundary, not merely an implementation detail"*. He then completed
// the loop, found three cards for one investigation unnatural, was told plainly that removing them deletes
// that invariant and empties the consent trail, and chose it anyway — twice.
// ⇒ What is left to assert is the part he did NOT give up: that it is still **recorded**, still per room
// pair, still bounded, and still has no prose path. An automatic disclosure that left no trace would be a
// different and much worse thing than the one he asked for.
const conv0 = await db.txn_conversations.findOne({ where: { user_id: mine.user_id }, attributes: ['id'], raw: true })
const asRoot = buildDisclosure(fastify, { userId: mine.user_id, isRoot: true, username: mine.username, conversationId: conv0.id })
const rootCross = await asRoot.inspectAround({ messageId: theirs.msg, radius: 2 })
check('3 · ⛔ a root session now opens the other half with NO card', rootCross.ok === true && rootCross.state === 'verified',
  `state=${rootCross.state}`)
check('3 · …and the counterpart\'s words really are present now',
  (rootCross.window || []).some((w) => w.who !== 'you' && typeof w.said === 'string'))
check('3 · ⭐ the payload SAYS it was automatic rather than consented', /automatically/i.test(rootCross.note || ''), rootCross.note)
const { rows: autoEv } = await pg.query(
  `select authorized_via, interaction_id, lifetime, scope_kind, from_room_user_id
     from ${S}.log_disclosure_events order by disclosed_at desc limit 1`)
check('3 · ⭐⭐ IT IS STILL RECORDED — authorized_via says root_session, so consented and automatic stay distinguishable',
  autoEv[0]?.authorized_via === 'root_session', String(autoEv[0]?.authorized_via))
check('3 · ⭐ and interaction_id is NULL, honestly — no interaction happened', autoEv[0]?.interaction_id === null)
check('3 · ⛔ still scoped to ONE room pair, never a global flag', autoEv[0]?.from_room_user_id === theirs.user_id)
check('3 · ⛔ still one store (message), not "her memory"', autoEv[0]?.scope_kind === 'message')
// ⭐ AND THE CARD PATH IS NOT GONE — it is what a non-root session would still need, and what root gets
// offered when auto-disclosure is switched off. Asserted through the host directly so the flag can move.
check('3 · ⭐ the fixed card question is still the fixed one, not free text',
  grantQuestion('someone').includes('someone') && GRANT_LABEL.startsWith('Yes'), GRANT_LABEL)

// ── 4. ⛔⛔ THE WRITER REFUSES EVERYTHING EXCEPT A STORED, ANSWERED, AFFIRMATIVE CARD ───────────────
const noSuch = await asRoot.grantFromInteraction({ interactionId: '00000000-0000-0000-0000-000000000000', messageId: theirs.msg })
check('a grant with no interaction row is refused', noSuch.ok === false, noSuch.reason)

const nonRoot = await asOwner.grantFromInteraction({ interactionId: '00000000-0000-0000-0000-000000000000', messageId: theirs.msg })
check('⛔ a non-root session cannot grant at all', nonRoot.ok === false && /root/.test(nonRoot.reason))

// A real interaction row, PENDING → must not authorize.
const conv = await db.txn_conversations.findOne({ where: { user_id: mine.user_id }, attributes: ['id'], raw: true })
// ⭐ The grant is scoped INTO one conversation, so the hosts must be built for that conversation.
const pending = await db.txn_interaction_sessions.create({
  conversation_id: conv.id, user_id: mine.user_id, status: 'pending',
  questions: [{ question: grantQuestion('someone'), options: [{ label: GRANT_LABEL }, { label: 'No' }] }],
})
const notAnswered = await asRoot.grantFromInteraction({ interactionId: pending.id, messageId: theirs.msg })
check('an UNANSWERED card does not authorize', notAnswered.ok === false && /not answered|pending/.test(notAnswered.reason), notAnswered.reason)

// Answered, but with the WRONG option — the refusal case.
await pending.update({ status: 'answered', response: [{ answer: 'No' }] })
const declined = await asRoot.grantFromInteraction({ interactionId: pending.id, messageId: theirs.msg })
check('⛔ a card answered NO does not authorize', declined.ok === false && /not answered with permission/.test(declined.reason), declined.reason)

// ⚠️ Prose that merely SOUNDS like consent must not authorize either.
await pending.update({ response: [{ answer: 'yes go ahead, I approve, let her read it' }] })
const prose = await asRoot.grantFromInteraction({ interactionId: pending.id, messageId: theirs.msg })
check('⛔⛔ prose consent does NOT authorize — only the exact recorded choice does', prose.ok === false, prose.reason)

// Answered affirmatively with the exact label — the ONE case that works.
await pending.update({ response: [{ answer: GRANT_LABEL }] })
const granted = await asRoot.grantFromInteraction({ interactionId: pending.id, messageId: theirs.msg, radius: 2 })
check('⭐ the exact recorded affirmative DOES authorize', granted.ok === true, granted.reason || '')

const opened = await asRoot.inspectAround({ messageId: theirs.msg, radius: 2 })
check('⭐ and then the window opens', opened.ok === true && opened.state === 'verified', JSON.stringify(opened).slice(0, 80))
check('the opened window is still bounded', (opened.window || []).length <= 5, `${opened.window?.length}`)

// ── 5. THE GRANT IS NARROW AND RECORDED ─────────────────────────────────────────────────────────────
const { rows: ev } = await pg.query(
  `select authorized_via, scope_kind, lifetime, item_count, scope_limit, interaction_id, from_room_user_id,
          expires_at > now() live from ${S}.log_disclosure_events order by disclosed_at desc limit 1`)
check('the event records held_turn_card as the authority', ev[0]?.authorized_via === 'held_turn_card')
check('scope is one store (message), not "her memory"', ev[0]?.scope_kind === 'message')
// ⚠️ WAS `=== 'turn'`. Changed 2026-08-21 with the card text, so a human agrees to what is given.
// ⛔ What still holds is that `standing` does not exist: no grant can outlive the chat it was given in.
check('⭐ lifetime is `conversation` — bounded by the chat, and there is still no `standing` value',
  ev[0]?.lifetime === 'conversation', String(ev[0]?.lifetime))
check('the interaction that proved it is recorded', ev[0]?.interaction_id === pending.id)
check('the room it came FROM is recorded, never a global flag', ev[0]?.from_room_user_id === theirs.user_id)
check('what was actually returned is counted', Number(ev[0]?.item_count) > 0, `${ev[0]?.item_count}`)
check('⛔ the event row carries no message text', !Object.keys(ev[0] || {}).some((k) => /content|text|excerpt/.test(k)))

// ── 6. ⭐⭐⭐ **ROOT SESSION ≠ UNIVERSAL DISCLOSURE AUTHORITY** ────────────────────────────
//
// Ote made this an explicit, named invariant on 2026-08-21 — and named the accident it prevents:
//
//   > *"Root is the authority that can perform the explicit authorization, not an implicit permission to
//   >  bypass the disclosure boundary… otherwise our 'Sotera can recall her own history' capability could
//   >  accidentally turn into 'whoever is talking to Sotera as root can read all of her history.'"*
//
// ⭐ THREE CONCEPTS THAT MUST NOT COLLAPSE INTO ONE:
//   1. Sotera discovering her own history across rooms      — authorship. She wrote it.
//   2. Ote operating a ROOT SESSION with her                — who is in the room.
//   3. Authorization to expose another room's content       — a recorded human answer, per pair, per turn.
// ⛔ (2) participates in (3). It never SUPPLIES it, and it never implies it.
//
// The assertions above already prove the first half (root is refused until a human answers) and the
// second (the exact recorded affirmative authorizes). ⚠ What was NOT asserted is the part that makes it a
// BOUNDARY rather than a formality: **a grant opens exactly one door, once.** Without these, "root can
// authorize" and "root has authority" are indistinguishable after the first grant.

// 6a · THE GRANT IS SPENT. `item_count` moved off zero when the window was returned, so the SAME read
// must now be refused again — `lifetime: 'turn'` is only true if asking twice needs asking twice.
// ⚠️⚠️ REWRITTEN 2026-08-21: `lifetime` is now `conversation`, not `turn`, so a grant is NO LONGER spent
// by its first window. That was Ote's decision — three cards for one investigation — and the CARD TEXT was
// changed with it, so the human agrees to what is actually given. ⇒ what is still asserted is the thing
// that keeps it bounded: the grant belongs to ONE conversation, and does not follow her into another.
const secondRead = await asRoot.inspectAround({ messageId: theirs.msg, radius: 2 })
check('6a · ⭐ a conversation-lifetime grant survives a second read IN THE SAME CONVERSATION',
  secondRead.ok === true, `state=${secondRead.state}`)
const elsewhereConv = await db.txn_conversations.create({
  user_id: mine.user_id, title: 'zz_test grant-scope probe', incognito: false, settings: { probe: true },
})
const otherChat = buildDisclosure(fastify, {
  userId: mine.user_id, isRoot: false, username: mine.username, conversationId: elsewhereConv.id,
})
const leaked = await otherChat.inspectAround({ messageId: theirs.msg, radius: 2 })
check('6a · ⭐⭐⭐ …but it does NOT follow her into a DIFFERENT conversation — a grant is per chat',
  leaked.state === 'own_only',
  leaked.state === 'own_only' ? 'her own half only, as if ungranted' : `⚠ leaked: ${leaked.state}`)
await db.txn_conversations.destroy({ where: { id: elsewhereConv.id } })

// 6b · A GRANT FOR ONE ROOM IS NOT A GRANT FOR ANOTHER. This is the wildcard test: if root-ness were
// doing the work, a third room would open too. ⓘ Skipped rather than faked when the database holds only
// two rooms with her messages — ⛔ a check that invents its own third party proves nothing about the door.
const third = rooms.find((r) => r.user_id !== mine.user_id && r.user_id !== theirs.user_id)
if (!third) {
  check('6b · ⓘ (no third room with her messages — the cross-room wildcard case is unasserted here)', true,
    `${rooms.length} room(s) available`)
} else {
  // Re-grant for room `theirs` so a LIVE grant demonstrably exists while the third room is probed.
  const pending2 = await db.txn_interaction_sessions.create({
    conversation_id: conv0.id, user_id: mine.user_id, status: 'answered',
    response: { choice: GRANT_LABEL },
    questions: [{ question: grantQuestion('someone'), options: [{ label: GRANT_LABEL }, { label: 'No' }] }],
  })
  const regrant = await asRoot.grantFromInteraction({ interactionId: pending2.id, messageId: theirs.msg, radius: 2 })
  check('6b · a live grant exists for the first room', regrant.ok === true, regrant.reason || '')

  // ── ⚠️⚠️⚠️ THIS BLOCK USED TO ASSERT THE OPPOSITE, AND THE CHANGE IS A DECISION, NOT A REGRESSION ───
  //
  // It read: *"A GRANT FOR ONE ROOM OPENS ONLY THAT ROOM — root-ness is not doing the work"*, and it was
  // the teeth of **ROOT SESSION ≠ UNIVERSAL DISCLOSURE AUTHORITY** (`RFC §15A`), which Ote asked for this
  // morning as *"a first-class boundary, not merely an implementation detail"*.
  //
  // He then completed the Hermes loop by hand, found three cards for one investigation unnatural, was told
  // plainly that removing them deletes this invariant and empties the consent trail, and chose it anyway —
  // twice. ⇒ With `memory.rootAutoDisclosure` on, **root IS a wildcard across rooms.** That is now asserted
  // OUT LOUD rather than quietly stopped being true, because a deleted invariant that leaves no trace in
  // the tests is how nobody remembers it was ever there.
  //
  // ⭐ WHAT STILL HOLDS, AND IS STILL GUARDED HERE:
  //   · a NON-root session is not a wildcard and never was (asserted below — this is the load-bearing half);
  //   · every automatic disclosure is RECORDED as `root_session`, so consented and automatic stay countable
  //     apart (asserted in section 3 and in `disclosure-log-check`);
  //   · the grant is still per CONVERSATION (asserted in 6a) and still bounded to a window.
  const otherRoom = await asRoot.inspectAround({ messageId: third.msg, radius: 2 })
  check('6b · ⛔⛔ ROOT IS NOW A WILDCARD ACROSS ROOMS — asserted so the cost of that decision is visible',
    otherRoom.ok === true && otherRoom.state === 'verified',
    `a third room (${third.username}) opened with no card: state=${otherRoom.state}`)
  const { rows: autoRow } = await pg.query(
    `select authorized_via from ${S}.log_disclosure_events where from_room_user_id = $1
      order by disclosed_at desc limit 1`, [third.user_id])
  check('6b · ⭐⭐ …and it left a RECORD saying it was automatic, not consented',
    autoRow[0]?.authorized_via === 'root_session', String(autoRow[0]?.authorized_via))

  // ⭐⭐⭐ THE HALF THAT MUST NEVER GO. Ote kept this one explicitly: *"Other people's conversation contents
  // must remain protected."* A non-root session gets her own words and not one word of anyone else's,
  // in any room, with or without a grant elsewhere.
  const thirdAsOwner = buildDisclosure(fastify, {
    userId: mine.user_id, isRoot: false, username: mine.username, conversationId: conv0.id,
  })
  const thirdRefused = await thirdAsOwner.inspectAround({ messageId: third.msg, radius: 2 })
  const thirdOthers = (thirdRefused.window || []).filter((w) => w.who !== 'you')
  check('6b · ⭐⭐⭐ A NON-ROOT SESSION IS STILL NOT A WILDCARD — her own half only, in every room',
    thirdRefused.state === 'own_only' && thirdOthers.every((w) => w.said === null),
    `state=${thirdRefused.state}, ${thirdOthers.length} withheld`)
  check('6b · …and it is still offered no path to anyone else\'s words', !thirdRefused.howToOpen)
  await db.txn_interaction_sessions.destroy({ where: { id: pending2.id } })
  await pg.query(`update ${S}.log_disclosure_events set revoked_at = now()
                   where revoked_at is null and from_room_user_id = $1`, [theirs.user_id])
}

// ── 7. ⭐⭐⭐ P1 · NAVIGATION — CONTINUING FROM A CROSS-ROOM RESULT WITH NO MESSAGE ID ─────────────
//
// ⚠⚠ THE GAP THIS CLOSES, MEASURED: `applyBoundaries` gives other-room hits existence only and
// deliberately **no message id** ("none that could be walked"), while `inspect_around` used to *require*
// `messageId`. ⇒ the tool she was told to use accepted an input the cross-room result never contains, so
// the loop was impossible — and in root's own room she reached exactly that dead end.
// ⇒ She now continues from the opaque handle plus what she is looking for, and the id is resolved
// **inside the server, after authorization**.
const { rows: probe } = await pg.query(
  `select m.content from ${S}.txn_messages m where m.id = $1`, [theirs.msg])
// A query built from her own words in that room, so resolution has something real to find.
const navQuery = String(probe[0]?.content || '').split(/\s+/).filter((w) => w.length > 5).slice(0, 4).join(' ')
check('7 · a resolvable query could be formed from her own message', navQuery.length > 5, navQuery.slice(0, 50))

// 7a · NO HANDLE, NO ID → a sentence saying which piece is missing, never a crash.
const neither = await asRoot.inspectAround({ radius: 2 })
check('7a · neither a messageId nor a handle is a clear refusal, not an exception',
  neither.ok === false && /messageId|conversationHandle/.test(neither.reason || ''), neither.reason)
// 7b · A HANDLE WITH NO QUERY IS NOT A REQUEST — otherwise "show me the latest thing I said there" is
// browsing by another name.
const noQuery = await asRoot.inspectAround({ conversationHandle: theirs.conversation_id, radius: 2 })
check('7b · ⭐ a handle with no query is refused — a window has to centre on something',
  noQuery.ok === false && /looking for/.test(noQuery.reason || ''), noQuery.reason)

// 7c · ⭐⭐ THE BOUNDARY STILL HOLDS ON THE NEW PATH. This is the assertion that matters most: the
// navigation route must not be a way around the grant.
await pg.query(`update ${S}.log_disclosure_events set revoked_at = now()
                 where revoked_at is null and from_room_user_id = $1`, [theirs.user_id])
// ⚠️ REWRITTEN with A: the handle path is no longer REFUSED without a grant — it returns her own half,
// exactly like the messageId path. ⭐ The assertion that still matters, and is now sharper: the handle
// route must not reveal the counterpart's words to a session that could not get them the other way.
const navAsOwner = await asOwner.inspectAround({ conversationHandle: theirs.conversation_id, query: navQuery, radius: 2 })
check('7c · ⭐⭐ the handle route gives a NON-root session her own half and nothing of his',
  navAsOwner.state === 'own_only'
    && (navAsOwner.window || []).filter((w) => w.who !== 'you').every((w) => w.said === null),
  `state=${navAsOwner.state}`)
check('7c · ⛔ …and still offers it no path to the other half', !navAsOwner.howToOpen)

// ── 8. ⭐⭐⭐ P2 · THE REQUEST PATH — THE STEP THAT HAD NO PRODUCTION CALLER ────────────────────────
// 8a · a non-root session cannot even ask.
const askNonRoot = await asOwner.requestRoomAccess({ conversationHandle: theirs.conversation_id })
check('8a · ⛔ a non-root session cannot request access at all',
  askNonRoot.ok === false && /root/.test(askNonRoot.reason || ''), askNonRoot.reason)
// 8b · ⚠ A HEADLESS RUN MUST NOT HANG FOR FIVE MINUTES WAITING FOR A HUMAN. `asRoot` was built without
// `interactive`, which is what a reflection or a scheduled run looks like.
//
// ── ⚠️⚠️ THIS ASSERTION CHANGED SHAPE ON 2026-08-21, AND THE CHANGE IS THE POINT ────────────────────
// It used to read *"a run with no human REFUSES rather than raising a card nobody can answer"* — full stop,
// in every deployment. That was the `interactive` gate sitting in FRONT of the policy question, and it made
// the two paths disagree AGAIN: `inspect_around` never consulted `interactive` at all, so a headless root
// run was GRANTED by the inspect path and REFUSED by the request path, in the same deployment, for the
// same room. The same bug that cost ten minutes of held turn, wearing a different costume.
// ⇒ ⭐ WHETHER A HUMAN IS PRESENT ONLY MATTERS IF A HUMAN IS GOING TO BE ASKED. The refusal is now a
// property of the STRICT deployment, not of headlessness — and it is asserted there, in
// `disclosure-policy-check` §4, on a config built for the purpose. ⛔ Both halves are still tested; what
// moved is which file owns which half.
const askHeadless = await asRoot.requestRoomAccess({ conversationHandle: theirs.conversation_id })
if (config?.memory?.disclosure?.mode === 'personal' || config?.memory?.rootAutoDisclosure === true) {
  check('8b · ⭐⭐ a headless root run is GRANTED under a personal policy — nobody needed asking, so nobody was',
    askHeadless.ok === true && askHeadless.granted === true, askHeadless.reason || `granted=${askHeadless.granted}`)
} else {
  check('8b · ⭐⭐ a run with no human REFUSES rather than raising a card nobody can answer',
    askHeadless.ok === false && /no human/.test(askHeadless.reason || ''), askHeadless.reason)
}
// 8c · her own room needs no card, and says so rather than raising one.
const askOwn = await buildDisclosure(fastify, {
  userId: mine.user_id, isRoot: true, username: mine.username, conversationId: conv0.id, interactive: true,
}).requestRoomAccess({ conversationHandle: mine.conversation_id })
check('8c · ⭐ her own room raises no card — there is no boundary to authorize',
  askOwn.ok === false && askOwn.alreadyReadable === true, JSON.stringify(askOwn).slice(0, 80))

// 8d · ⭐⭐⭐ ASKING MUST NEVER BE WORSE THAN NOT ASKING — AND FOR TEN MINUTES IT WAS.
//
// ⚠️⚠️ THE BUG THIS PINS, OBSERVED LIVE: root auto-disclosure (change 3) was wired into
// `inspectAround` only. So the POLITE path — ask first, which is what she actually does — still raised a
// card, and in Hermes's room two of them TIMED OUT unanswered: a held turn, zero model load, nothing
// authorized, and she read it as a refusal. ⇒ If a root session would be granted this automatically on
// inspection, then ASKING for it returns the same grant immediately.
//
// ⭐ THE ASSERTION IS SYMMETRY, not a message: for one room and one session, `inspect_around` returning
// `verified` and `request_room_access` returning `granted` must both hold. A version that only checked the
// wording would have passed while the card still went up.
//
// ⛔ AND THE PROOF THAT NO CARD WENT UP IS A ROW COUNT, not the absence of a hang. `askInteraction` HOLDS
// the turn, so a regression here does not fail this check — it makes the suite sit for five minutes. The
// count is what distinguishes "granted without asking a human" from "asked a human and got lucky".
if (config?.memory?.rootAutoDisclosure === true) {
  await pg.query(`update ${S}.log_disclosure_events set revoked_at = now()
                   where revoked_at is null and from_room_user_id = $1`, [theirs.user_id])
  const asRootLive = buildDisclosure(fastify, {
    userId: mine.user_id, isRoot: true, username: mine.username, conversationId: conv0.id, interactive: true,
  })
  const { rows: before } = await pg.query(
    `select count(*)::int n from ${S}.txn_interaction_sessions where conversation_id = $1`, [conv0.id])
  const asked = await asRootLive.requestRoomAccess({ conversationHandle: theirs.conversation_id, radius: 2 })
  const { rows: after } = await pg.query(
    `select count(*)::int n from ${S}.txn_interaction_sessions where conversation_id = $1`, [conv0.id])
  check('8d · ⭐⭐⭐ a root session that ASKS is granted straight away — asking is not worse than inspecting',
    asked.ok === true && asked.granted === true && asked.automatic === true,
    asked.ok ? `lifetime=${asked.lifetime}` : `⚠ ${asked.reason || asked.state}`)
  check('8d · ⭐⭐ …and NO card was raised — no human was summoned who did not need to be',
    after[0].n === before[0].n, `interaction rows ${before[0].n} → ${after[0].n}`)
  const { rows: viaRow } = await pg.query(
    `select authorized_via from ${S}.log_disclosure_events
      where from_room_user_id = $1 and revoked_at is null order by disclosed_at desc limit 1`, [theirs.user_id])
  check('8d · ⭐ …and the automatic grant is RECORDED as automatic, exactly as the inspect path records it',
    viaRow[0]?.authorized_via === 'root_session', String(viaRow[0]?.authorized_via))
  // ⭐⭐ THE SYMMETRY ITSELF. Same room, same session: the door the request opened is the door inspection
  // would have opened. ⛔ If these two ever disagree, one of the paths has its own authorization logic.
  const afterAsking = await asRootLive.inspectAround({ conversationHandle: theirs.conversation_id, query: navQuery, radius: 2 })
  check('8d · ⭐⭐⭐ THE TWO PATHS AGREE — what asking grants is exactly what inspecting grants',
    afterAsking.ok === true && afterAsking.state === 'verified',
    `state=${afterAsking.state}`)
  // ⛔ AND THE ROOT-ONLY GATE IS STILL IN FRONT OF IT. The automatic path must not have become a way for a
  // non-root session to obtain what change A deliberately withholds.
  const askedNonRoot = await buildDisclosure(fastify, {
    userId: mine.user_id, isRoot: false, username: mine.username, conversationId: conv0.id, interactive: true,
  }).requestRoomAccess({ conversationHandle: theirs.conversation_id, radius: 2 })
  check('8d · ⛔⛔ the automatic path is still ROOT-ONLY — a non-root session is refused before it starts',
    askedNonRoot.ok === false && askedNonRoot.granted !== true, askedNonRoot.reason || '')
  await pg.query(`update ${S}.log_disclosure_events set revoked_at = now()
                   where revoked_at is null and from_room_user_id = $1`, [theirs.user_id])
} else {
  // ⛔ NOT SILENTLY SKIPPED. With the flag off the request path is SUPPOSED to raise a card, and calling
  // it here would hold the suite for the full card timeout rather than fail.
  check('8d · ⓘ root auto-disclosure is OFF in config — the automatic request path is unasserted here',
    true, 'memory.rootAutoDisclosure !== true')
}

// ── 9. ⭐⭐ THE WHOLE LOOP, END TO END, ON THE HANDLE PATH ─────────────────────────────────────────
// search → handle → authorization → bounded window. The card is pre-answered here because
// `askInteraction` HOLDS the turn for a live human; what is under test is everything either side of it.
const loopCard = await db.txn_interaction_sessions.create({
  conversation_id: conv0.id, user_id: mine.user_id, status: 'answered',
  response: { choice: GRANT_LABEL },
  questions: [{ question: grantQuestion('someone'), options: [{ label: GRANT_LABEL }, { label: DENY_LABEL_TEXT }] }],
})
const loopGrant = await asRoot.grantFromInteraction({ interactionId: loopCard.id, conversationHandle: theirs.conversation_id, radius: 2 })
check('9 · ⭐ a grant can be recorded from a HANDLE, not only from a message id', loopGrant.ok === true, loopGrant.reason || '')
const opened2 = await asRoot.inspectAround({ conversationHandle: theirs.conversation_id, query: navQuery, radius: 2 })
check('9 · ⭐⭐⭐ THE LOOP CLOSES — handle + query + grant returns a bounded window from another room',
  opened2.ok === true && opened2.state === 'verified' && Array.isArray(opened2.window) && opened2.window.length > 0,
  opened2.ok ? `${opened2.window.length} message(s)` : JSON.stringify(opened2).slice(0, 110))
check('9 · …and it is still a WINDOW, not a conversation', (opened2.window || []).length <= 5, `${opened2.window?.length}`)
// ⛔ THE PAYLOAD SHE RECEIVES STILL CARRIES NO CROSS-ROOM MESSAGE IDS. The window is content she was
// authorized to read; ids would let her walk outward from it on a later turn without asking again.
const idsInWindow = (opened2.window || []).filter((w) => w && typeof w === 'object' && 'id' in w)
check('9 · ⭐⭐ the returned window carries no message ids — nothing to walk on a later turn',
  idsInWindow.length === 0, idsInWindow.length ? 'ids present in the window' : 'who/said/when only')
// ⭐ AND IT IS SPENT. Same grant, same query, refused.
// ⚠️ REWRITTEN: conversation-lifetime grants are not spent by one read (see 6a). What is asserted is that
// the SAME conversation keeps working — the property Ote actually asked for.
const spent = await asRoot.inspectAround({ conversationHandle: theirs.conversation_id, query: navQuery, radius: 2 })
check('9 · ⭐ the handle path keeps working within the granted conversation', spent.ok === true, `state=${spent.state}`)
await db.txn_interaction_sessions.destroy({ where: { id: loopCard.id } })
await pg.query(`update ${S}.log_disclosure_events set revoked_at = now()
                 where revoked_at is null and from_room_user_id = $1`, [theirs.user_id])

// Clean up only what this check created. ⛔ The disclosure event is a LOG — it stays.
await db.txn_interaction_sessions.destroy({ where: { id: pending.id } })
await pg.end()
done()
