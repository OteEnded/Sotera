// Turn recovery — the honest-silence fix (Ote's report, chat dc125a86: a marathon round
// was mid-generation when the server stopped; the reply never persisted, so from the user's
// side it just VANISHED — a lone ▶️ prompt, no reply, no signal, GPU churning with no
// on-screen explanation).
//
// A completed turn ALWAYS ends with an assistant reply (even an empty/errored one is
// persisted). So a conversation whose NEWEST message is a `user` message = a turn the server
// was killed mid-generation (nothing is ever in-flight at boot — a fresh process). This sweep
// (run once at boot, like sweepZombieInteractions) turns that dangling silence into a visible,
// honest, resumable assistant note.

import { getTodo } from '../todo/index.js'

/** The first still-open task's title (the running one, else the first pending), for the note. */
function nextOpenTask(todo) {
  if (!todo || !Array.isArray(todo.tasks)) return null
  const running = todo.tasks.find((t) => t.status === 'running')
  if (running) return running.title
  const pending = todo.tasks.find((t) => t.status === 'pending')
  return pending ? pending.title : null
}

/**
 * Recover turns interrupted by a server stop: for every conversation whose last message is a
 * user message (an unanswered turn), append a short assistant note so the thread is honest
 * about what happened and the user can resume. Marathon/plan context is woven in when present.
 * Idempotent + safe: runs at boot only, touches ONLY conversations left mid-turn.
 */
export async function recoverInterruptedTurns(fastify) {
  const db = fastify.db
  let recovered = 0
  try {
    const convos = await db.txn_conversations.findAll({ attributes: ['id', 'user_id', 'settings'] })
    for (const convo of convos) {
      const last = await db.txn_messages.findOne({
        where: { conversation_id: convo.id },
        order: [['rolling_id', 'DESC']],
        attributes: ['id', 'role'],
      })
      if (!last || last.role !== 'user') continue // clean (ends in an assistant reply) or empty

      // Build an honest, resumable note. Plan state (if any) makes it concrete + actionable.
      const marathon = convo.settings?.marathon === true
      let planLine = ''
      try {
        const todo = await getTodo(fastify, convo.id)
        if (todo && todo.status === 'active' && todo.total > 0) {
          const next = nextOpenTask(todo)
          planLine = ` Your plan is at **${todo.completed}/${todo.total}**${next ? ` (next: ${next})` : ''}.`
        }
      } catch { /* plan lookup is best-effort — the note still lands */ }

      const content = marathon
        ? `⚠️ *The server restarted while I was still working, so my last reply didn't save.*${planLine} Say **continue** and I'll pick the plan back up.`
        : `⚠️ *The server restarted before I finished this reply, so it didn't save.*${planLine} Ask again — or **regenerate** — and I'll redo it.`

      await db.txn_messages.create({
        conversation_id: convo.id,
        role: 'assistant',
        content,
        // a soft, typed marker (not a user-caused error): lets the UI style it as "interrupted"
        // and survives reload; the message infra already surfaces this + offers Regenerate.
        error: { code: 'interrupted', message: 'The server restarted before this reply finished.' },
        metrics: { interrupted: true },
      })
      // proactive content the user didn't ask for — light the sidebar marker so it's noticed
      await db.txn_conversations.update({ unread: true }, { where: { id: convo.id } }).catch(() => {})
      recovered += 1
    }
    if (recovered) fastify.log?.info?.(`[recovery] recovered ${recovered} interrupted turn${recovered === 1 ? '' : 's'} from a previous run`)
  } catch (e) {
    fastify.log?.warn?.(`[recovery] interrupted-turn sweep failed: ${e.message}`)
  }
}
