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
export const GRANT_LABEL = 'Yes — let her read the surrounding messages, this turn only'
export const DENY_LABEL = 'No'
/** The question the card must carry. Fixed, so the human is answering the thing we record. */
export function grantQuestion(counterpart) {
  return `Sotera found one of her own messages from a conversation with ${counterpart} in another room. `
    + 'Allow her to read the messages immediately around it, for this turn only?'
}

const MAX_RADIUS = 6
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
    if (typeof conversationHandle !== 'string' || !UUID_RE.test(conversationHandle.trim())) return { found: false }
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
          -- SINGLE USE, AND THIS IS WHAT MAKES lifetime=turn TRUE. The first version recorded
          -- turn and enforced only a 10-minute expiry, so a grant kept opening windows for ten minutes
          -- across any number of turns — the check caught it by passing when it should have been refused,
          -- using a grant left over from the previous run. item_count is set the moment a window is
          -- returned, so a spent grant opens nothing. Never relax this to a time window.
          AND item_count = 0
        ORDER BY disclosed_at DESC LIMIT 1`,
      { replacements: { from: fromRoomUserId, into: intoConversationId }, type: seq.QueryTypes.SELECT },
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
               'turn', now() + interval '10 minutes')`,
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
   * ⭐ THE WINDOW. Same room → readable, because the asker was already there. Other room → only with a
   * live grant, else a refusal that says *unreachable*, never *absent*.
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
    // ⚠️ A missing target and a refused target must not be distinguishable by a caller probing ids.
    if (!at.found) return { ok: false, state: 'unreachable', note: 'That is not reachable from here.' }
    const r = Math.min(Math.max(1, Number(radius) || 3), MAX_RADIUS)
    const sameRoom = at.conv.user_id === userId
    let grant = null
    if (!sameRoom) {
      // ⭐ FROM the room that holds the message, INTO the conversation doing the asking. Both halves
      // matter: a grant for one conversation must not open the same room in another.
      grant = conversationId ? await liveGrant({ fromRoomUserId: at.conv.user_id, intoConversationId: conversationId }) : null
      if (!grant) {
        // ⛔ THE REFUSAL CARRIES NO CONTENT AND NO TITLE — only that it exists, who it was with, and how a
        // human could open it. ⭐ And it tells her the honest state: this is a boundary, not an absence.
        return {
          ok: false,
          state: 'attested',
          counterpart: at.counterpart,
          note: 'You wrote this, but it is in another person\'s room and you cannot read around it from here. '
            + 'That is a boundary, not an absence — do not guess what it said.',
          howToOpen: isRoot
            ? { needs: 'a held-turn card answered by the person you are talking to', question: grantQuestion(at.counterpart), affirmative: GRANT_LABEL }
            : null,
        }
      }
    }
    // ⭐⭐ RESOLUTION HAPPENS **HERE**, AFTER AUTHORIZATION, AND THE ORDER IS THE POINT. Everything above
    // this line is existence and permission; nothing has read another room yet. Resolving first would run
    // a query inside someone else's conversation before anyone authorized it — and *"we only looked at her
    // own rows"* is a weaker promise than *"we did not look at all"*.
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
    return {
      ok: true,
      state: 'verified',
      sameRoom,
      window: rows.map((m) => ({ who: m.role === 'assistant' ? 'you' : at.counterpart, said: m.content, when: m.created_at })),
      note: sameRoom
        ? 'This is your own room, so this was already readable.'
        : 'Authorized for this turn only, and recorded. Asking again needs asking again.',
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
    if (!at.found) return { ok: false, state: 'unreachable', note: 'That is not reachable from here.' }
    if (at.conv.user_id === userId) {
      // ⭐ Already hers to read — say so instead of raising a card for a boundary that is not there.
      return { ok: false, reason: 'that conversation is already in this room — you can inspect it directly', alreadyReadable: true }
    }
    const live = await liveGrant({ fromRoomUserId: at.conv.user_id, intoConversationId: conversationId })
    if (live) return { ok: true, granted: true, alreadyGranted: true, scope: 'the messages immediately around the part you are looking for', lifetime: 'this turn' }

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

  return { inspectAround, grantFromInteraction, requestRoomAccess, liveGrant, locateConversation }
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
