// Todo — the host half of the state-driven Feature (FEATURE_TODO_RFC), assembled per the
// canon layering law: Feature → Host Service → Store → DB.
//   • Capability    @ote/todo    — ships the Feature (pure orchestration + protocol, portable)
//                   and its private write_todos/get_todos Tools (the model's hands)
//   • Host Service  ./service.js — reconcile + write/read/clear ops + events + push
//   • Store         ./store.js   — raw TodoSessions/TodoTasks persistence
// This index is just WIRING + the public entry: it registers the late-bound host services the
// model's tools bind to and re-exports the operations the chat routes call.

import { registerHostService } from '../components/runtime.js'
import { createTodoService } from './service.js'

// public operations (the chat routes import these from here)
export { getTodo, clearTodo, writeTodo, userMayTodo } from './service.js'

let initialized = false

export function initTodo() {
  if (initialized) return
  initialized = true
  // the model's hands (write_todos / get_todos), bound per request to the caller + convo
  registerHostService('todo', ({ fastify: f, user, extras }) =>
    createTodoService({ fastify: f, user, conversationId: extras?.conversationId ?? null }))
  // what feature.todo's snapshot() reads (diagnostics only — the per-conversation
  // plan is served by the read route to each renderer)
  registerHostService('todoStore', () => ({
    activeCount: () => null, // cheap; a live count query isn't worth it for a diagnostic
  }))
}
