// DISCLOSURE — THE ONLY DOOR BETWEEN ROOMS, AND IT IS OPENED BY A PERSON, NOT BY A SENTENCE.
//
// `recall_own_history` establishes THAT she spoke with someone in another room. This file is the separate
// step that can turn one of those handles into readable content, and it is deliberately the hardest thing
// in the capability to do.
//
// ── ⭐⭐ AUTHORIZATION DOES NOT TRAVEL THROUGH PROSE ──────────────────────────────────────────────────
// Ote's standing invariant, and the reason `disclosure_authz` has exactly one legal value:
// `held_turn_card`. Not `'prose'`. A model reporting *"they said yes"* is a model asserting its own
// permission — the same defect class as inferring identity from a value's shape.
//
// ⇒ THE PROOF IS A STORED INTERACTION, VERIFIED SERVER-SIDE. She raises a card (`ask_user`, which HOLDS
// the turn), a human picks a structured option, that lands in `txn_interaction_sessions.response`, and
// **this file re-reads the row itself**. The model's account of what happened is never consulted.
// ⓘ `log_disclosure_events.interaction_id` exists for exactly this and was written before it had a user.
//
// ── ⛔ ONLY ROOT MAY GRANT, AND THAT FOLLOWS FROM WHO IS IN THE ROOM ─────────────────────────────────
// The material belongs to the person in the OTHER room, and they are not present to consent. Ote:
// *"Root should ultimately be able to authorize Sotera to access ALL of Sotera's memory across ALL rooms…
// Root is the global supervisory authority."* ⇒ a card answered in a non-root session would let the wrong
// person authorize disclosure of a third party's conversation, so ⛔ a non-root session gets a refusal
// with **no path at all** — not a card it could talk its way through.
// ⚠️ `isRoot` arrives from the authenticated user and is never derived from an id's shape (the
// nine-instance defect).
//
// ── ⭐ THE GRANT IS NARROW BY CONSTRUCTION ───────────────────────────────────────────────────────────
//   scope_kind = 'message'        one store, not "her memory"
//   lifetime   = 'turn'           the narrowest the enum offers; ⛔ there is no 'standing'
//   scope_limit                   how many messages the window may return
//   from_room → into_room         recorded per pair, never a global flag
// A grant is spent on the turn that asked for it. Wanting it again means asking again.
//
// ── ⛔ WHAT THIS FILE IS NOT ─────────────────────────────────────────────────────────────────────────
// Not a search. It takes ONE message id that she already legitimately holds from her own history and
// returns a WINDOW around it — E-1's shape, `rolling_id BETWEEN`, never the conversation. It cannot list,
// cannot browse, and cannot be handed a room.

import { Op } from 'sequelize'
import { registerHostService } from './runtime.js'
import { log } from '../../lib/utility.js'
import { buildConversationSearch } from './conversation-search.js'
import { makeEmbedder } from './memory-embed-host.js'
// ⚠️ `askInteraction`, NOT the `interaction` host service. That service returns the FORMATTED PROSE a
// model reads (`ask()` → a sentence), and prose is exactly what may not authorize anything here. This
// returns the `interactionId`, which is the handle we then RE-READ from the database ourselves.
// ⓘ From `service.js`, not `index.js`: the index is WIRING (it calls `registerHostService` at import
// time) and does not re-export this operation. Importing the service module directly keeps this a
// one-way edge and avoids a cycle back through the runtime.
import { askInteraction } from '../interaction/service.js'

// ⭐ The affirmative option's label is a CONSTANT, not free text, because matching on prose is how prose
// becomes authorization. The card must offer this exact string for the grant to verify.
// ⚠️ CHANGED 2026-08-21, AND THE CHANGE IS THE POINT: the label must describe what is actually granted.
// Ote, after completing the loop and clicking three cards for one investigation: *"why you have to make me
// click the card"* / *"i want her to be able to automaticly access to her memory, no need you me to
// answer."* ⇒ a grant now lasts the CONVERSATION rather than one read, so the sentence a human agrees to
// says so. ⛔ Widening the grant while leaving the old wording would be consent obtained for a narrower
// thing than was given.
export const GRANT_LABEL = 'Yes — let her read the surrounding messages for the rest of this conversation'
export const DENY_LABEL = 'No'
/** The question the card must carry. Fixed, so the human is answering the thing we record. */
export function grantQuestion(counterpart) {
  return `Sotera found one of her own messages from a conversation with ${counterpart} in another room. `
    + `Allow her to read what ${counterpart} said around it, for the rest of this conversation?`
}

const MAX_RADIUS = 6

// ⛔⛔ THE SWITCH THAT TURNS OFF A BOUNDARY, AND IT IS A SWITCH ON PURPOSE.
// `memory.rootAutoDisclosure` grants a root session the counterpart's half automatically, with no card.
// Ote asked for it after completing the Hermes loop by hand; I named what it costs and he chose it twice.
// ⭐ It is a FLAG rather than a rewrite so the decision stays reversible in one line, and so the two
// authorities stay distinguishable in `log_disclosure_events` forever. Default FALSE in code: a deployment
// that has not asked for this must not inherit it.
const rootAutoDisclosure = (config) => config?.memory?.rootAutoDisclosure === true
// ⚠ A handle is validated as a UUID before it reaches a query. Sequelize would throw
// `invalid input syntax for type uuid` on anything else — an unusable handle must read as "not
// reachable", never take the turn down.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ⚠️ `conversationId` IS LOAD-BEARING, not context. A grant is written FROM a room INTO the conversation
// that asked, so a host without it cannot find the grant it just created — which is exactly how the
// first version failed its own test: the row existed and the lookup keyed on the wrong conversation.
export function buildDisclosure(fastify, { userId = null, isRoot = false, username = null, conversationId = null, interactive = false } = {}) {
  const db = fastify.db
  const seq = db?.txn_messages?.sequelize
  const { schema } = db?.txn_messages?.getTableName?.() ?? {}
  const EVENTS = schema ? `"${schema}"."log_disclosure_events"` : null

  /** The one message she is asking about, plus who owns the room it lives in. */
  async function locate(messageId) {
    const msg = await db.txn_messages.findOne({
      where: { id: messageId }, attributes: ['id', 'conversation_id', 'rolling_id'], raw: true,
    })
    if (!msg) return { found: false }
    const conv = await db.txn_conversations.findOne({
      where: { id: msg.conversation_id }, attributes: ['id', 'user_id', 'incognito'], raw: true,
    })
    // ⛔ FAIL CLOSED. A conversation whose owner cannot be established is not readable, and an incognito
    // conversation is off the record for every purpose, including this one.
    if (!conv || !conv.user_id || conv.incognito) return { found: false }
    const owner = await db.mst_users.findOne({
      where: { id: conv.user_id }, attributes: ['id', 'username', 'display_name'], raw: true,
    })
    return { found: true, msg, conv, counterpart: owner?.display_name || owner?.username || 'someone' }
  }

  /**
   * ⭐ THE SAME QUESTION, ASKED OF A CONVERSATION RATHER THAN A MESSAGE. Navigation (P1) starts from the
   * opaque `conversationHandle` she got from `recall_own_history`, because the cross-room projection
   * deliberately gives her no message id to start from.
   */
  async function locateConversation(conversationHandle) {
    // ── ⭐⭐ MALFORMED IS NOT ABSENT, AND CONFLATING THEM COST US THE FIRST REAL RUN ─────────────────
    // Measured 2026-08-21, in the live Hermes conversation: she passed `"de19b111"` — the handle as she
    // had RENDERED IT IN HER OWN TABLE one turn earlier, abbreviated for readability — and got back
    // `state: 'unreachable', note: 'That is not reachable from here.'` three times. That is the message
    // for a BOUNDARY. So she concluded the mechanism did not work, stopped using it, and hand-rolled an
    // `ask_user` card asking for permission in prose instead.
    //
    // ⛔⛔ A MALFORMED ARGUMENT REPORTED AS AN ABSENCE IS THE EXACT FAILURE CLASS THIS ARC EXISTS TO END.
    // Her reasoning was correct throughout; the input was eight characters short and the error told her
    // the room was closed. ⇒ the two states are now distinct, and the malformed one says what to do.
    //
    // ⓘ It leaks nothing: malformedness is a property of the string she typed, not of the database, so
    // this does not let a caller probe ids — the "missing and refused must look alike" rule is untouched.
    // ⛔ AND IT DOES NOT ACCEPT A PREFIX. Resolving `de19b111` by matching would be an enumeration
    // surface across every room; the handle stays whole, and the error teaches instead.
    if (typeof conversationHandle !== 'string' || !conversationHandle.trim()) {
      return { found: false, malformed: true, why: 'no conversation handle was given' }
    }
    if (!UUID_RE.test(conversationHandle.trim())) {
      return {
        found: false,
        malformed: true,
        why: 'that is not a whole conversation handle — it looks shortened. Use the complete value exactly '
          + 'as recall_own_history gave it to you, not the abbreviated form you may have written out.',
      }
    }
    const conv = await db.txn_conversations.findOne({
      where: { id: conversationHandle.trim() }, attributes: ['id', 'user_id', 'incognito'], raw: true,
    })
    // ⛔ FAIL CLOSED, exactly as `locate` does.
    if (!conv || !conv.user_id || conv.incognito) return { found: false }
    const owner = await db.mst_users.findOne({
      where: { id: conv.user_id }, attributes: ['id', 'username', 'display_name'], raw: true,
    })
    return { found: true, conv, counterpart: owner?.display_name || owner?.username || 'someone' }
  }

  /**
   * ⭐⭐ P1 · RESOLVE **WHICH OF HER MESSAGES** THE QUERY MEANS — INSIDE THE SERVER, ALWAYS.
   *
   * This is the whole point of the navigation fix. The cross-room projection gives her existence and a
   * handle and ⛔ no message ids ("none that could be walked"), while the window needs one message to
   * centre on. ⇒ the id is produced here, used here, and never travels to her in either direction.
   *
   * ⛔ `roles: ['assistant']` — IT LOOKS AT HER SENTENCES AND NOBODY ELSE'S. Resolution is a question
   * about her own authorship; the counterpart's messages are what the GRANT decides about, and they enter
   * only through the window below.
   * ⛔ `denseMinSim: 0` — same calibration as `recall_own_history`: for short queries no cosine floor
   * separates true from false matches, so this is a ranked nearest-match index and not a relevance filter.
   * ⚠️ AND IT IS CALLED **AFTER** THE GRANT IS VERIFIED, never before — see `inspectAround`. Resolving
   * first would run a query against another room's conversation before anyone authorized reading it, and
   * "we only looked at her own rows" is a weaker promise than "we did not look at all".
   */
  async function resolveHerMessageIn({ conversationId: cid, query }) {
    const q = String(query || '').trim()
    if (!q) return null
    const cs = buildConversationSearch(fastify, {
      userId,
      acrossRooms: true,
      roles: ['assistant'],
      onlyConversationId: cid,
      embed: makeEmbedder(fastify, { userId }),
    })
    let hit = null
    try {
      const res = await cs.search(q, { limit: 1, excludeConversationId: null, denseMinSim: 0 })
      hit = res?.evidence?.[0] ?? null
    } catch (e) {
      await log(`[disclosure] resolve failed in ${cid}: ${e.message}`, import.meta.url)
      return null
    }
    return hit?.message?.id ?? null
  }

  /** A live, unspent grant for this pair. ⛔ Never a global flag — always from-room → into-conversation. */
  async function liveGrant({ fromRoomUserId, intoConversationId }) {
    if (!EVENTS) return null
    const [row] = await seq.query(
      `SELECT id, scope_limit FROM ${EVENTS}
        WHERE from_room_user_id = :from AND into_conversation_id = :into
          AND scope_kind = 'message' AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())
          -- ⚠ NO BACKTICKS IN THIS COMMENT. It sits inside a JS template literal, and a backtick here
          -- terminates the string — which is exactly how this file broke once before.
          --
          -- ⭐⭐ SINGLE-USE NOW APPLIES TO turn GRANTS ONLY (2026-08-21, Ote's decision). The original rule
          -- was item_count = 0 for everything, which is what made lifetime=turn literally true: one card
          -- bought one window. It also produced THREE CARDS FOR ONE INVESTIGATION in the first completed
          -- Hermes run, and his verdict was "have to allow her everytime is not natual".
          -- => a conversation grant stays live for the conversation it was granted into; a turn grant is
          -- still spent by its first window. The enum still has no standing value, so no grant can outlive
          -- the chat it was given in, and it is still per room pair, still expiring, still revocable.
          AND (lifetime <> 'turn' OR item_count = 0)
          -- ⛔⛔ AN AUTOMATIC GRANT IS NOT INHERITABLE, AND THIS CLOSED A REAL LEAK.
          -- Caught by disclosure-inspect-check 6b the moment root auto-disclosure went live: an auto-grant
          -- is keyed to (from_room, into_conversation), so a NON-ROOT session working in the same
          -- conversation picked it up and read the counterpart's words. That is not the decision Ote made —
          -- he kept "other people's conversation contents must remain protected" for everyone but root.
          -- => a root_session grant is honoured ONLY for a root session. It exists BECAUSE the session is
          -- root, so it cannot outlive that fact. A card grant is different and stays inheritable: a human
          -- consented for this conversation, and that consent is not about who is asking.
          AND (authorized_via <> 'root_session' OR :askerIsRoot)
        ORDER BY disclosed_at DESC LIMIT 1`,
      { replacements: { from: fromRoomUserId, into: intoConversationId, askerIsRoot: isRoot === true }, type: seq.QueryTypes.SELECT },
    )
    return row ?? null
  }

  /**
   * ⭐⭐ THE WRITER. Verifies a STORED card answer and records the grant. ⛔ Nothing the model says is
   * evidence here: the interaction row must exist, belong to this user and this conversation, be
   * `answered`, and its response must contain the exact affirmative label.
   */
  async function grantFromInteraction({ interactionId, messageId, conversationHandle, radius = 3 }) {
    if (!isRoot) return { ok: false, reason: 'only a root session can authorize reading another room' }
    if (!EVENTS) return { ok: false, reason: 'no schema' }
    // ⭐ EITHER STARTING POINT, SAME GRANT. A grant has always been scoped from-room → into-conversation,
    // and both a message id and a conversation handle answer "which room" — so the navigation path needs
    // no second kind of grant. ⛔ What it must NOT do is accept both and disagree with itself.
    const at = messageId ? await locate(messageId) : await locateConversation(conversationHandle)
    if (!at.found) return { ok: false, reason: messageId ? 'no such message' : 'no such conversation' }
    if (at.conv.user_id === userId) return { ok: false, reason: 'that conversation is already in this room' }

    const session = await db.txn_interaction_sessions.findOne({ where: { id: interactionId }, raw: true })
    if (!session) return { ok: false, reason: 'no such interaction' }
    if (session.user_id !== userId) return { ok: false, reason: 'that interaction belongs to someone else' }
    if (session.status !== 'answered') return { ok: false, reason: `interaction is ${session.status}, not answered` }
    // ⚠️ The affirmative must be present as the STORED answer, exactly. A paraphrase is prose.
    const answered = JSON.stringify(session.response ?? '')
    if (!answered.includes(GRANT_LABEL)) return { ok: false, reason: 'the card was not answered with permission' }

    const r = Math.min(Math.max(1, Number(radius) || 3), MAX_RADIUS)
    await seq.query(
      `INSERT INTO ${EVENTS}
        (from_room_user_id, into_room_user_id, into_conversation_id, authorized_by_user_id,
         authorized_by_username, authorized_via, interaction_id, scope_kind, scope_limit, item_count,
         lifetime, expires_at)
       VALUES (:from, :into, :convo, :by, :byName, 'held_turn_card', :interaction, 'message', :limit, 0,
               -- ⭐ conversation, not turn, and 2 hours rather than 10 minutes: it now has to outlive a
               -- working session rather than one reply. Still bounded, revocable, and scoped to THIS
               -- conversation and THAT room pair, never global. (⚠ no backticks: template literal.)
               'conversation', now() + interval '2 hours')`,
      {
        replacements: {
          from: at.conv.user_id, into: userId, convo: conversationId ?? session.conversation_id, by: userId,
          byName: username, interaction: interactionId, limit: r * 2 + 1,
        },
      },
    )
    await log(`[disclosure] granted from_room=${at.conv.user_id} via interaction=${interactionId}`, import.meta.url)
    return { ok: true, granted: true, scope: 'the messages immediately around that one', lifetime: 'this turn' }
  }

  /**
   * ⛔⛔ 3 · THE AUTOMATIC GRANT. No card, no human, root sessions only — and STILL RECORDED.
   *
   * ⚠️⚠️ THIS IS THE ONE PLACE IN THE SYSTEM WHERE A DISCLOSURE HAPPENS WITHOUT ANYONE AGREEING TO IT.
   * `RFC §15A` recorded the opposite as a first-class invariant on Ote's own instruction hours earlier; he
   * then found the clicking unnatural, was told plainly that removing it deletes that invariant and empties
   * the consent trail, and chose it anyway — twice. ⇒ his decision, written down rather than smoothed over.
   * ⛔ Do not "restore" the old behaviour without asking him.
   *
   * ⭐ WHAT IS PRESERVED, BECAUSE "AUTOMATIC" MEANS NO CLICK AND NOT NO RECORD:
   *   · a row per grant with `authorized_via = 'root_session'` — distinguishable from a consented one
   *     forever, so *"which reads did a human actually agree to?"* stays answerable and this stays reversible;
   *   · the room PAIR and the conversation, so it is never a global flag;
   *   · `scope_kind = 'message'` and a bounded `scope_limit` — a window, never a room;
   *   · an expiry, and `revoked_at` still works.
   * ⛔ AND NO PROSE PATH: root-ness comes from the authenticated session, never from a sentence, never from
   * her own claim, never from the shape of an id.
   * ⓘ `interaction_id` is NULL here — correctly, because no interaction happened. That is why
   * `disclosure-log-check` now requires it for `held_turn_card` rows only.
   */
  async function autoGrantForRoot({ fromRoomUserId, radius = 3 }) {
    if (!isRoot || !EVENTS || !conversationId) return null
    const r = Math.min(Math.max(1, Number(radius) || 3), MAX_RADIUS)
    const [row] = await seq.query(
      `INSERT INTO ${EVENTS}
        (from_room_user_id, into_room_user_id, into_conversation_id, authorized_by_user_id,
         authorized_by_username, authorized_via, interaction_id, scope_kind, scope_limit, item_count,
         lifetime, expires_at)
       VALUES (:from, :into, :convo, :by, :byName, 'root_session', NULL, 'message', :limit, 0,
               'conversation', now() + interval '2 hours')
       RETURNING id, scope_limit, authorized_via`,
      {
        replacements: {
          from: fromRoomUserId, into: userId, convo: conversationId, by: userId, byName: username,
          limit: r * 2 + 1,
        },
        type: seq.QueryTypes.SELECT,
      },
    )
    await log(`[disclosure] AUTO-granted (root session, no card) from_room=${fromRoomUserId} into=${conversationId}`, import.meta.url)
    return row ?? null
  }

  /**
   * ⭐ THE WINDOW. Same room → readable, because the asker was already there. Other room → her own half
   * ALWAYS (A, authorship), and the counterpart's half only with a grant — which a root session now gets
   * automatically (3).
   * ⛔ Returns a WINDOW by `rolling_id`, never a conversation (E-1: 70 messages were once loaded to
   * return 5).
   */
  async function inspectAround({ messageId, conversationHandle, query, radius = 3 }) {
    // ⭐⭐ P1 · TWO WAYS IN, AND THE SECOND IS THE ONE THAT MAKES NAVIGATION POSSIBLE.
    //   messageId          same-room continuation — she legitimately holds the id (unchanged path)
    //   conversationHandle + query — the CROSS-ROOM path. She holds only the handle, because the
    //                        projection gives her nothing else; the id is resolved server-side, after
    //                        the grant, and never travels in either direction.
    if (!messageId && !conversationHandle) {
      return { ok: false, reason: 'give me either a messageId from this room, or the conversationHandle from recall_own_history together with what you are looking for' }
    }
    if (!messageId && !String(query || '').trim()) {
      // ⭐ A HANDLE ALONE IS NOT A REQUEST. Without the query there is nothing to centre a window on, and
      // "give her the latest thing she said there" would be browsing by another name.
      return { ok: false, reason: 'say what you are looking for in that conversation, so I can find the right part of it' }
    }
    const at = messageId ? await locate(messageId) : await locateConversation(conversationHandle)
    // ⭐ A MALFORMED HANDLE IS A BAD ARGUMENT, NOT A BOUNDARY. Reported separately for the reason in
    // locateConversation: the first live run stopped here on an eight-character truncation.
    if (at.malformed) return { ok: false, reason: at.why }
    // ⚠️ A missing target and a refused target must not be distinguishable by a caller probing ids.
    if (!at.found) return { ok: false, state: 'unreachable', note: 'That is not reachable from here.' }
    const r = Math.min(Math.max(1, Number(radius) || 3), MAX_RADIUS)
    const sameRoom = at.conv.user_id === userId
    let grant = null
    // ⭐⭐⭐ A · HER OWN WORDS NEED NO PERMISSION FROM ANYONE, BECAUSE SHE WROTE THEM (2026-08-21).
    // Ote: *"i want her to be able to automaticly access to her memory, no need you me to answer."* — and,
    // from the same morning and unchanged: *"Other people's conversation contents must remain protected."*
    // ⇒ compatible, and the seam between them is AUTHORSHIP, the axis this whole capability rests on.
    // `ownOnly` means: return her half in full, and the counterpart's messages as content-free markers.
    let ownOnly = false
    if (!sameRoom) {
      // ⭐ FROM the room that holds the message, INTO the conversation doing the asking. Both halves
      // matter: a grant for one conversation must not open the same room in another.
      grant = conversationId ? await liveGrant({ fromRoomUserId: at.conv.user_id, intoConversationId: conversationId }) : null
      // ⛔⛔ 3 · ROOT AUTO-DISCLOSURE — AND THIS ONE DELETES AN INVARIANT ON PURPOSE.
      // `RFC §15A` recorded **ROOT SESSION ≠ UNIVERSAL DISCLOSURE AUTHORITY** this morning at Ote's
      // request, as *"a first-class boundary, not merely an implementation detail"*. He then completed the
      // Hermes loop, found the clicking unnatural, was shown what removing it costs — *"it deletes the
      // invariant you ratified this morning and empties the consent trail"* — and chose it anyway, twice.
      // ⇒ It is his call, recorded here rather than softened. ⛔ Do not "restore" it without asking him.
      // ⭐ WHAT IS KEPT: automatic removes the CLICK, not the RECORD. Every automatic disclosure still
      // writes a `log_disclosure_events` row with `authorized_via = 'root_session'`, so *"which reads were
      // consented to and which were automatic"* stays answerable and this stays reversible.
      // ⛔ AND STILL NO PROSE PATH: root-ness comes from `isRootConnectedUser`, never from a sentence, never
      // from her own claim, never from the shape of an id.
      if (!grant && isRoot && rootAutoDisclosure(fastify.config) && conversationId) {
        grant = await autoGrantForRoot({ fromRoomUserId: at.conv.user_id, radius: r })
      }
      if (!grant) ownOnly = true
    }
    // ⭐⭐ RESOLUTION STILL HAPPENS **AFTER** THE AUTHORIZATION DECISION, AND THE ORDER IS STILL THE POINT.
    // ⚠️ But the claim above it had to be narrowed when A landed, rather than left standing: it used to say
    // *"nothing has read another room yet"*, and under `ownOnly` that is no longer literally true — the
    // resolver does query the other conversation. What is still true, and is what the invariant was
    // protecting, is that **it reads only HER OWN messages** (`roles: ['assistant']`, see
    // resolveHerMessageIn), which authorship authorizes without anyone's permission. ⛔ Not one query
    // touches the counterpart's content before the grant is decided.
    let centre = at.msg ?? null
    if (!centre) {
      const foundId = await resolveHerMessageIn({ conversationId: at.conv.id, query })
      if (!foundId) {
        // ⛔ NOT AN ABSENCE CLAIM. The grant was spent on nothing, which is honest; what she must not read
        // this as is "that conversation contains nothing about it".
        return {
          ok: false,
          state: 'not_located',
          counterpart: at.counterpart,
          note: 'You are allowed to read there, but I could not find which of your own messages that refers to. '
            + 'Try wording it the way you would have said it at the time. This is a failure to locate, not evidence that it never happened.',
        }
      }
      centre = await db.txn_messages.findOne({
        where: { id: foundId }, attributes: ['id', 'rolling_id'], raw: true,
      })
      if (!centre) return { ok: false, state: 'unreachable', note: 'That is not reachable from here.' }
    }
    const rows = await db.txn_messages.findAll({
      where: {
        conversation_id: at.conv.id,
        rolling_id: { [Op.between]: [centre.rolling_id - r, centre.rolling_id + r] },
      },
      attributes: ['id', 'role', 'content', 'created_at', 'rolling_id'],
      order: [['rolling_id', 'ASC']],
      limit: r * 2 + 1,
      raw: true,
    })
    if (grant) {
      await seq.query(`UPDATE ${EVENTS} SET item_count = :n WHERE id = :id`,
        { replacements: { n: rows.length, id: grant.id } })
    }
    // ⭐⭐ THE PROJECTION IS WHERE A LIVES. Same window, two shapes:
    //   authorized  → both speakers, in full
    //   ownOnly     → her half in full; the counterpart's messages become MARKERS — who and when, ⛔ never
    //                 a word of what they said.
    // ⚠️ THE MARKERS ARE NECESSARY RATHER THAN TIDY: handing her only her own sentences with the gaps
    // closed up would let her read her replies as a monologue and infer what was said to her. A marked gap
    // is more honest than a seamless one — the same reason a refusal says *unreachable* instead of going
    // quiet. ⓘ Positions and timestamps are structure, not content: the same class as `item_count`, which
    // migration 014 established is not content.
    return {
      ok: true,
      state: ownOnly ? 'own_only' : 'verified',
      sameRoom,
      ...(ownOnly ? { counterpart: at.counterpart } : {}),
      window: rows.map((m) => {
        if (m.role === 'assistant') return { who: 'you', said: m.content, when: m.created_at }
        if (ownOnly) return { who: at.counterpart, said: null, withheld: true, when: m.created_at }
        return { who: at.counterpart, said: m.content, when: m.created_at }
      }),
      note: sameRoom
        ? 'This is your own room, so this was already readable.'
        : (ownOnly
          ? `These are your own words from that conversation — yours to read, because you wrote them. What `
            + `${at.counterpart} said around them is withheld: you can see that they spoke and when, not `
            + 'what they said. ⛔ Do not guess at the withheld parts, and do not present your own side as if '
            + 'it were the whole exchange.'
          : `Authorized for this conversation and recorded${grant?.authorized_via === 'root_session' ? ' (automatically, because this is a root session)' : ''}.`),
      ...(ownOnly && isRoot
        ? { howToOpen: { needs: 'a held-turn card answered by the person you are talking to', question: grantQuestion(at.counterpart), affirmative: GRANT_LABEL } }
        : {}),
    }
  }

  /**
   * ⭐⭐⭐ P2 · THE STEP THAT DID NOT EXIST: from *"I found something in another room and want to read
   * it"* to *"a grant exists"*.
   *
   * ⚠⚠ THE GAP THIS CLOSES, MEASURED. Before this, `grantFromInteraction` had **no caller in
   * production** — the definition, and seven call sites all inside one check. So the card mechanism was
   * correct, tested by 28 assertions, and **reachable from nothing**. In root's own room on 2026-08-21
   * Sotera checked durable memory, found it thin, called `recall_own_history` twice unprompted — and then
   * stopped, because there was nowhere to go. `mirror-needs-a-mechanism`, with a green suite over it.
   *
   * ⛔⛔ AND IT CHANGES NO RULE. Every guard below already existed; what is new is that a turn can reach
   * them. The card question is a CONSTANT, the affirmative is a CONSTANT, the answer is re-read from the
   * database by `grantFromInteraction`, root-only still holds, the grant is still single-use and still
   * scoped from-room → into-conversation. ⭐ **ROOT SESSION ≠ UNIVERSAL DISCLOSURE AUTHORITY**: this is
   * how root PERFORMS an authorization, which is the opposite of root not needing one.
   */
  async function requestRoomAccess({ conversationHandle, radius = 3 }) {
    // ⛔ Non-root gets no path at all — not a card it could talk its way through. The material belongs to
    // someone who is not in the room, and a non-root session must not be able to consent for them.
    if (!isRoot) {
      return { ok: false, reason: 'only a root session can authorize reading another room', howToOpen: null }
    }
    // ⚠️ HELD TURNS NEED A HUMAN, AND A HEADLESS RUN MUST SAY SO RATHER THAN HANG FOR FIVE MINUTES.
    // The reflection pass is headless by construction, which is exactly why this tool is NOT in
    // REFLECTION_TOOLS — belt and braces, since the route also strips interactive tools.
    if (!interactive) {
      return { ok: false, reason: 'there is no human in this run to answer a permission card, so nothing can be authorized here' }
    }
    if (!conversationId) return { ok: false, reason: 'no conversation to raise the card in' }
    const at = await locateConversation(conversationHandle)
    // ⭐ MALFORMED FIRST, and it is NOT `unreachable` — see locateConversation. A bad argument must be
    // reported as a bad argument, or she reads it as a closed door and stops asking.
    if (at.malformed) return { ok: false, reason: at.why }
    if (!at.found) return { ok: false, state: 'unreachable', note: 'That is not reachable from here.' }
    if (at.conv.user_id === userId) {
      // ⭐ Already hers to read — say so instead of raising a card for a boundary that is not there.
      return { ok: false, reason: 'that conversation is already in this room — you can inspect it directly', alreadyReadable: true }
    }
    const live = await liveGrant({ fromRoomUserId: at.conv.user_id, intoConversationId: conversationId })
    if (live) return { ok: true, granted: true, alreadyGranted: true, scope: 'the messages immediately around the part you are looking for', lifetime: 'this conversation' }
    // ⭐⭐ ROOT AUTO-DISCLOSURE APPLIES HERE TOO — AND MISSING IT WAS A REAL BUG, CAUGHT LIVE.
    // I wired the automatic grant into `inspectAround` only. So when she did the POLITE thing — ask first,
    // which is what she actually does — `request_room_access` still raised a card and it timed out
    // unanswered: two cards, ten minutes of a held turn with zero model load, and nothing authorized.
    // ⇒ Asking must not be worse than not asking. If a root session would be granted this automatically on
    // inspection, then asking for it returns the same grant immediately rather than summoning a human who
    // does not need to be summoned.
    if (rootAutoDisclosure(fastify.config)) {
      const auto = await autoGrantForRoot({ fromRoomUserId: at.conv.user_id, radius })
      if (auto) {
        return {
          ok: true, granted: true, automatic: true, counterpart: at.counterpart,
          scope: 'the messages around the part you are looking for',
          lifetime: 'this conversation',
          note: 'Granted automatically because this is a root session, and recorded as such. No one was asked.',
          next: 'call inspect_around with the same conversationHandle and what you are looking for',
        }
      }
    }

    await log(`[disclosure] access requested from_room=${at.conv.user_id} into=${conversationId}`, import.meta.url)
    // ⛔ THE QUESTION IS NOT THE MODEL'S TO WRITE. A card whose text came from the caller is a card that
    // can be phrased into a yes, so both the question and the affirmative label are fixed constants.
    const asked = await askInteraction(fastify, { id: userId, username }, conversationId, {
      questions: [{
        question: grantQuestion(at.counterpart),
        options: [{ label: GRANT_LABEL }, { label: DENY_LABEL }],
      }],
    })
    if (asked?.error) return { ok: false, reason: asked.error }
    if (asked.status !== 'answered') {
      await log(`[disclosure] card ${asked.interactionId} ended ${asked.status}`, import.meta.url)
      return { ok: false, state: 'attested', counterpart: at.counterpart, reason: `nobody answered (${asked.status}) — nothing was authorized` }
    }
    // ⭐⭐ AND THE PROOF IS STILL THE STORED ROW, NOT THIS RESULT. `grantFromInteraction` re-reads the
    // interaction from the database and checks the exact label itself. ⛔ Passing `asked.response` through
    // would make the authorization travel through an in-memory object this function assembled — which is
    // the prose problem wearing a struct.
    const granted = await grantFromInteraction({ interactionId: asked.interactionId, conversationHandle: at.conv.id, radius })
    if (!granted.ok) {
      await log(`[disclosure] card ${asked.interactionId} refused: ${granted.reason}`, import.meta.url)
      return { ok: false, state: 'attested', counterpart: at.counterpart, reason: granted.reason }
    }
    await log(`[disclosure] granted via card ${asked.interactionId} from_room=${at.conv.user_id}`, import.meta.url)
    return {
      ok: true,
      granted: true,
      counterpart: at.counterpart,
      scope: 'the messages immediately around the part you are looking for',
      lifetime: 'this turn, once',
      next: 'now call inspect_around with the same conversationHandle and what you are looking for',
    }
  }

  return { inspectAround, grantFromInteraction, requestRoomAccess, autoGrantForRoot, liveGrant, locateConversation }
}

let initialized = false
export function initDisclosure() {
  if (initialized) return
  initialized = true
  registerHostService('disclosure', ({ fastify: f, user, extras }) =>
    buildDisclosure(f, {
      userId: user?.id ?? null, isRoot: user?.isRoot === true, username: user?.username ?? null,
      conversationId: extras?.conversationId ?? null,
      // ⭐ The same `interactive` fact the interaction service reads — only the route knows whether this
      // turn can be HELD, and a card raised where nobody can answer is a five-minute hang.
      interactive: extras?.interactive === true,
    }))
}
