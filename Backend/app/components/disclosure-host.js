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

// ⚠️ `conversationId` IS LOAD-BEARING, not context. A grant is written FROM a room INTO the conversation
// that asked, so a host without it cannot find the grant it just created — which is exactly how the
// first version failed its own test: the row existed and the lookup keyed on the wrong conversation.
export function buildDisclosure(fastify, { userId = null, isRoot = false, username = null, conversationId = null } = {}) {
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
  async function grantFromInteraction({ interactionId, messageId, radius = 3 }) {
    if (!isRoot) return { ok: false, reason: 'only a root session can authorize reading another room' }
    if (!EVENTS) return { ok: false, reason: 'no schema' }
    const at = await locate(messageId)
    if (!at.found) return { ok: false, reason: 'no such message' }
    if (at.conv.user_id === userId) return { ok: false, reason: 'that message is already in this room' }

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
  async function inspectAround({ messageId, radius = 3 }) {
    const at = await locate(messageId)
    // ⚠️ A missing message and a refused message must not be distinguishable by a caller probing ids.
    if (!at.found) return { ok: false, state: 'unreachable', note: 'That message is not reachable from here.' }
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
    const rows = await db.txn_messages.findAll({
      where: {
        conversation_id: at.conv.id,
        rolling_id: { [Op.between]: [at.msg.rolling_id - r, at.msg.rolling_id + r] },
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

  return { inspectAround, grantFromInteraction, liveGrant }
}

let initialized = false
export function initDisclosure() {
  if (initialized) return
  initialized = true
  registerHostService('disclosure', ({ fastify: f, user, extras }) =>
    buildDisclosure(f, {
      userId: user?.id ?? null, isRoot: user?.isRoot === true, username: user?.username ?? null,
      conversationId: extras?.conversationId ?? null,
    }))
}
