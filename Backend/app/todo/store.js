// Todo STORE — raw persistence for the Todo Feature (canon layering: Feature → Host Service
// → Store → DB). Owns ONLY the TodoSessions/TodoTasks rows: no reconcile, no events, no push.
// Returns PLAIN data (never ORM instances) so the Host Service above it stays persistence-agnostic.

const TASK_ATTRS = ['id', 'title', 'description', 'status', 'ordinal']

export function createTodoStore(db) {
  return {
    // The active session (+ ordered tasks) for a conversation, as plain data, or null.
    async loadActive(conversationId) {
      const session = await db.txn_todo_sessions.findOne({
        where: { conversation_id: conversationId, status: 'active' },
        order: [['created_at', 'DESC']],
      })
      if (!session) return null
      const tasks = await db.txn_todo_tasks.findAll({
        where: { session_id: session.id },
        order: [['ordinal', 'ASC'], ['rolling_id', 'ASC']],
        attributes: TASK_ATTRS,
      })
      return {
        id: session.id,
        title: session.title ?? null,
        status: session.status,
        updatedAt: session.updated_at,
        tasks: tasks.map((t) => ({ id: t.id, title: t.title, description: t.description ?? null, status: t.status, ordinal: t.ordinal })),
      }
    },

    async createSession(conversationId, userId, title) {
      const s = await db.txn_todo_sessions.create({ conversation_id: conversationId, user_id: userId ?? null, title: title ?? null, status: 'active' })
      return { id: s.id }
    },

    async updateSession(sessionId, patch) {
      await db.txn_todo_sessions.update(patch, { where: { id: sessionId } })
    },

    // replace-list semantics: clear then insert in order (the plan IS the list the model sent).
    async replaceTasks(sessionId, tasks) {
      await db.txn_todo_tasks.destroy({ where: { session_id: sessionId } })
      if (tasks.length) {
        await db.txn_todo_tasks.bulkCreate(tasks.map((t) => ({
          session_id: sessionId, title: t.title, description: t.description, status: t.status, ordinal: t.ordinal,
        })))
      }
    },

    async deleteSession(sessionId) {
      await db.txn_todo_tasks.destroy({ where: { session_id: sessionId } })
      await db.txn_todo_sessions.destroy({ where: { id: sessionId } })
    },
  }
}
