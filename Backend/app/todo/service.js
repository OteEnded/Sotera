// Todo HOST SERVICE — business operations for the Todo Feature (canon layering:
// Feature → Host Service → Store → DB). Owns reconciliation + the write/read/clear operations
// + the EventBus emission + the frontend push; delegates ALL persistence to the Store below it.
// The portable feature.todo Feature (in @ote/todo) is pure orchestration; the model's hands
// are its sibling write_todos/get_todos Tools; THIS is the operations layer both funnel through.

import { runtime } from '../components/runtime.js'
import { notifyChatEvent } from '../chat/notify.js'
import { getSetting } from '../settings/index.js'
import { createTodoStore } from './store.js'

// Reconciliation — kept LOCAL to the host (the backend imports NO component package; it loads
// them by path via the resolver). @ote/todo ships its own copy for portability; this
// is OteLLMServices's. Claude-Code-native: the model rewrites the whole list; we normalize.
const TASK_STATUSES = ['pending', 'running', 'completed', 'skipped', 'failed', 'cancelled']
const MAX_TASKS = 40
const normStatus = (s) => {
  const v = String(s || '').trim().toLowerCase()
  if (v === 'in_progress' || v === 'in-progress' || v === 'active') return 'running'
  if (v === 'done') return 'completed'
  return TASK_STATUSES.includes(v) ? v : 'pending'
}
/**
 * Coerce whatever the model put in `todos` into an array. MEASURED, three real shapes from one model:
 *   1. a proper array                                    → use it
 *   2. the array STRINGIFIED                              → `"[{…},{…}]"`
 *   3. the WHOLE ARGS OBJECT stringified into this field  → `"[{…}], \"title\": \"my plan\"}"`
 * (3) is what qwen3.6:35b actually sent, which is why the plan silently vanished: `Array.isArray` was false, the
 * list came out empty, and an empty list is indistinguishable from the user's explicit "clear".
 * Tolerating this costs nothing and the alternative is a feature that works only for models that serialise
 * arguments the way we hoped. Returns null when nothing array-like can be recovered.
 */
export function coerceTodoList(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string' || !raw.trim()) return null
  const tryParse = (s) => { try { return JSON.parse(s) } catch { return null } }
  let v = tryParse(raw)
  if (!v) {
    const m = raw.match(/\[[\s\S]*\]/) // pull the array out of a malformed wrapper
    v = m ? tryParse(m[0]) : null
  }
  if (Array.isArray(v)) return v
  if (v && Array.isArray(v.todos)) return v.todos
  return null
}

function reconcile(incoming) {
  const list = Array.isArray(incoming) ? incoming : (coerceTodoList(incoming) ?? [])
  let sawRunning = false
  const tasks = []
  for (const raw of list) {
    if (tasks.length >= MAX_TASKS) break
    // `task` and `name` are accepted aliases for `title`. Measured live: gemma4:26b sent
    // {"task": "...", "status": "running"} for every entry, so EVERY task was dropped, the list came out
    // empty, and the plan was silently cancelled. The schema still declares `title` as canonical — being
    // liberal on the way IN costs nothing and models plainly reach for these words.
    const title = String(raw?.title ?? raw?.content ?? raw?.task ?? raw?.name ?? '').trim().slice(0, 200)
    if (!title) continue
    let status = normStatus(raw?.status)
    if (status === 'running') { if (sawRunning) status = 'pending'; else sawRunning = true }
    tasks.push({ title, description: raw?.description != null ? String(raw.description).slice(0, 2000) : null, status, ordinal: tasks.length })
  }
  const done = tasks.length > 0 && tasks.every((t) => ['completed', 'skipped', 'cancelled'].includes(t.status))
  return { tasks, done }
}
const currentTask = (tasks) => (tasks || []).find((t) => t.status === 'running') || null

// WHO may use Todo — root always; users whose tier is in chat.todoRoles (default: everyone
// who can chat — planning is behavior, not a privilege, unlike scheduling).
export function userMayTodo(config, user) {
  if (user?.isRoot === true) return true
  const allowed = getSetting(config, 'chat.todoRoles')
  if (!Array.isArray(allowed)) return true // default: any chat user
  return Array.isArray(user?.roles) && user.roles.some((r) => allowed.includes(r))
}

// Serialize an active-plan (plain Store shape) into the protocol snapshot every renderer consumes.
function view(active) {
  if (!active) return null
  const t = (active.tasks || []).map((x) => ({ id: x.id, title: x.title, description: x.description ?? null, status: x.status, ordinal: x.ordinal }))
  return {
    id: active.id,
    title: active.title ?? null,
    status: active.status,
    tasks: t,
    currentTitle: currentTask(t)?.title ?? null,
    total: t.length,
    completed: t.filter((x) => x.status === 'completed').length,
    updatedAt: active.updatedAt,
  }
}

// Read the current plan for a conversation (the read route + the model's get_todos).
export async function getTodo(fastify, conversationId) {
  return view(await createTodoStore(fastify.db).loadActive(conversationId))
}

// Apply the model's rewritten list: reconcile → replace rows (via Store) → emit protocol
// events → bridge to the owner's open pages. Returns the fresh snapshot. THE one write path.
export async function writeTodo(fastify, user, conversationId, body) {
  const store = createTodoStore(fastify.db)
  const { tasks: normalized, done } = reconcile(body?.todos)
  const title = body?.title != null ? String(body.title).trim().slice(0, 120) || null : undefined
  const events = runtime.events

  const active = await store.loadActive(conversationId)
  const created = !active
  const nextStatus = normalized.length === 0 ? 'cancelled' : (done ? 'completed' : 'active')
  const prevCompleted = active ? active.tasks.filter((t) => t.status === 'completed').length : 0

  let sessionId
  if (!active) {
    if (normalized.length === 0) return { todo: null } // nothing to create
    sessionId = (await store.createSession(conversationId, user?.id ?? null, title ?? null)).id
  } else {
    sessionId = active.id
    await store.updateSession(sessionId, { status: nextStatus, ...(title !== undefined ? { title } : {}) })
  }
  await store.replaceTasks(sessionId, normalized)

  const snap = await getTodo(fastify, conversationId)
  // protocol events on the runtime bus (renderers + Observer) — best-effort
  try {
    if (created) events?.emit?.('todo.created', { conversationId, sessionId, total: snap?.total ?? 0 })
    else events?.emit?.('todo.updated', { conversationId, sessionId, total: snap?.total ?? 0 })
    if ((snap?.completed ?? 0) > prevCompleted) events?.emit?.('todo.task.completed', { conversationId, completed: snap.completed, total: snap.total })
    if (nextStatus === 'completed') events?.emit?.('todo.completed', { conversationId, sessionId })
    if (nextStatus === 'cancelled') events?.emit?.('todo.cleared', { conversationId, sessionId })
  } catch { /* the bus is diagnostics — never fail the write on it */ }

  // push to the owner's OPEN pages so the rail updates live (same channel as schedules)
  notifyChatEvent(user?.id ?? null, { type: 'todo-changed', conversationId })
  return { todo: snap }
}

// Clear the plan (the user's "clear/delete" button): remove the active session + its tasks
// and push todo-changed so every open page drops the rail live. Non-destructive to the WORK —
// the model rebuilds the plan on its next write_todos, so this is a tidy-up, not a lock.
export async function clearTodo(fastify, user, conversationId) {
  const store = createTodoStore(fastify.db)
  const active = await store.loadActive(conversationId)
  if (!active) return { ok: true, cleared: false } // nothing to clear
  await store.deleteSession(active.id)
  try { runtime.events?.emit?.('todo.cleared', { conversationId, sessionId: active.id }) } catch { /* bus is diagnostics */ }
  notifyChatEvent(user?.id ?? null, { type: 'todo-changed', conversationId })
  return { ok: true, cleared: true }
}

// Per-request service the model's tools bind to (create/read the CALLER's plan for the
// conversation they're in). Late-bound because app/todo can't be imported by the TLA
// components adapter — same registerHostService pattern as `schedules`.
export function createTodoService({ fastify, user, conversationId }) {
  return {
    async write(spec = {}) {
      if (!conversationId) return { error: 'todo needs a conversation — open or start a chat first' }
      if (!userMayTodo(fastify.config, user)) return { error: 'planning is not enabled for your role here' }
      // "YOU SENT NOTHING" AND "NOTHING YOU SENT WAS USABLE" ARE DIFFERENT ANSWERS, and conflating them cost a
      // whole plan silently: gemma4:26b sent four tasks keyed `task`, every one was dropped, the empty list was
      // read as the user's explicit "clear", and the tool replied ok:true — so the model believed it had a plan,
      // the rail never appeared, and nothing in the transcript said why. A tool that reports success for zero
      // parsed items out of N supplied leaves the model no way to correct itself.
      // Count what was supplied AFTER coercion. My first version of this guard counted `Array.isArray(todos)`,
      // which is exactly the check that was already failing — so the guard stayed silent on the very shape it
      // was written to catch. A guard that shares an assumption with the bug is not a guard.
      const supplied = (coerceTodoList(spec?.todos) ?? []).length
      const out = await writeTodo(fastify, user, conversationId, spec)
      const todo = out.todo
      if (!todo && supplied > 0) {
        return {
          error: `none of the ${supplied} entries had a usable title — each todo needs a non-empty "title" (aliases: content, task, name). Nothing was saved; send the list again with titles.`,
          supplied,
          saved: 0,
        }
      }
      if (!todo) return { ok: true, cleared: true, message: 'plan cleared' }
      return {
        ok: true,
        plan: todo.tasks.map((t) => ({ title: t.title, status: t.status })),
        current: todo.currentTitle,
        progress: `${todo.completed}/${todo.total}`,
      }
    },
    async get() {
      if (!conversationId) return { todo: null }
      return { todo: await getTodo(fastify, conversationId) }
    },
  }
}
