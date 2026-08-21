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
import { buildDisclosure, GRANT_LABEL, grantQuestion } from '../../Backend/app/components/disclosure-host.js'

const { check, done } = makeChecker('disclosure-inspect')
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config, log: null }
const pg = devPg(); await pg.connect()
const S = devSchema()

// Two rooms and one of HER messages in each.
const { rows: pick } = await pg.query(
  `select c.user_id, u.username, m.id msg, m.rolling_id
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

// ── 2. ANOTHER ROOM IS REFUSED, AND THE REFUSAL IS ATTESTED, NOT EMPTY ──────────────────────────────
const cross = await asOwner.inspectAround({ messageId: theirs.msg, radius: 2 })
check('another room is REFUSED without a grant', cross.ok === false, JSON.stringify(cross).slice(0, 90))
check('the refusal is `attested` — it happened, and she may not read it', cross.state === 'attested')
check('the refusal names the counterpart but carries NO content', !!cross.counterpart && !('window' in cross))
check('⛔ the refusal carries no conversation title', !JSON.stringify(cross).toLowerCase().includes('title'))
check('the refusal tells her not to guess', /do not guess/i.test(cross.note || ''))
check('⛔ a NON-root session is offered no path at all', cross.howToOpen === null)

// ── 3. ROOT IS OFFERED A CARD, AND THE CARD IS THE ONLY PATH ────────────────────────────────────────
const conv0 = await db.txn_conversations.findOne({ where: { user_id: mine.user_id }, attributes: ['id'], raw: true })
const asRoot = buildDisclosure(fastify, { userId: mine.user_id, isRoot: true, username: mine.username, conversationId: conv0.id })
const rootCross = await asRoot.inspectAround({ messageId: theirs.msg, radius: 2 })
check('root is still refused until a human answers', rootCross.ok === false && rootCross.state === 'attested')
check('root is told what would open it', !!rootCross.howToOpen?.question && rootCross.howToOpen.affirmative === GRANT_LABEL)
check('the card question is the fixed one, not free text', rootCross.howToOpen.question === grantQuestion(rootCross.counterpart))

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
check('⛔ lifetime is the narrowest the enum allows', ev[0]?.lifetime === 'turn')
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
const secondRead = await asRoot.inspectAround({ messageId: theirs.msg, radius: 2 })
check('6a · ⭐⭐ the grant is SINGLE-USE — the same authorized read is refused the second time',
  secondRead.ok === false && secondRead.state === 'attested',
  JSON.stringify(secondRead).slice(0, 80))

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
  const otherRoom = await asRoot.inspectAround({ messageId: third.msg, radius: 2 })
  check('6b · ⭐⭐⭐ A GRANT FOR ONE ROOM OPENS ONLY THAT ROOM — root-ness is not doing the work',
    otherRoom.ok === false && otherRoom.state === 'attested',
    otherRoom.ok ? '⚠ THE THIRD ROOM OPENED — root has become a wildcard' : `refused: ${third.username}`)
  check('6b · …and the refusal still says the conversation EXISTS rather than pretending it does not',
    otherRoom.state === 'attested' && !!otherRoom.counterpart,
    `state=${otherRoom.state} counterpart=${otherRoom.counterpart ?? 'none'}`)
  await db.txn_interaction_sessions.destroy({ where: { id: pending2.id } })
  await pg.query(`update ${S}.log_disclosure_events set revoked_at = now()
                   where revoked_at is null and from_room_user_id = $1`, [theirs.user_id])
}

// Clean up only what this check created. ⛔ The disclosure event is a LOG — it stays.
await db.txn_interaction_sessions.destroy({ where: { id: pending.id } })
await pg.end()
done()
