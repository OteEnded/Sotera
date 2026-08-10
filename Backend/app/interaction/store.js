// Interaction STORE — raw persistence for the HumanInteraction Feature (canon layering:
// Feature → Host Service → Store → DB). Owns ONLY the InteractionSessions rows: no
// lifecycle, no timers, no events, no push. Returns PLAIN data (never ORM instances) so
// the Host Service above it stays persistence-agnostic.

import { ownerIdOf } from '../auth/owner.js'

const view = (row) => (row ? {
  id: row.id,
  conversationId: row.conversation_id,
  userId: row.user_id ?? null,
  status: row.status,
  questions: row.questions,
  response: row.response ?? null,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
} : null)

export function createInteractionStore(db) {
  return {
    async create({ conversationId, userId, questions, expiresAt }) {
      const row = await db.txn_interaction_sessions.create({
        conversation_id: conversationId,
        user_id: ownerIdOf({ id: userId }, 'an interaction session'), // see auth/owner.js
        status: 'pending',
        questions,
        expires_at: expiresAt ?? null,
      })
      return view(row)
    },

    // The pending interaction for a conversation (at most one in practice — the turn is
    // held). OLDEST first if several ever coexist (Ote's rule: focus the oldest, never
    // silently map an answer to a random question).
    async findPending(conversationId) {
      const row = await db.txn_interaction_sessions.findOne({
        where: { conversation_id: conversationId, status: 'pending' },
        order: [['created_at', 'ASC']],
      })
      return view(row)
    },

    async findById(id) {
      return view(await db.txn_interaction_sessions.findByPk(id))
    },

    // Atomically resolve a PENDING interaction (first answer wins — the multi-page race):
    // returns true if THIS call claimed it, false if someone already did.
    async claim(id, { status, response = null }) {
      const [n] = await db.txn_interaction_sessions.update(
        { status, response },
        { where: { id, status: 'pending' } },
      )
      return n > 0
    },
  }
}
