// TOOL-CALL AUDIT — the subscriber that was missing.
//
// Ote, 2026-08-20: *"when tools call, memory call — it should log, how call that tools, log by the login
// account, who can tools."*
//
// ── WHAT WAS ALREADY THERE, AND WHAT WAS NOT ───────────────────────────────────────────────────────
// The EventBus has emitted `tool.executed { name, args, ok, durationMs, isReadOnly, caller }` since the
// SDK shipped, from `runTool` and from the four host-side tools the chat route runs itself. The only
// subscriber wrote one `logger.debug` line and **discarded `caller`**. So the events were real, the
// attribution was real, and nothing kept either.
//
// This module is the destination. It changes no behaviour: it observes an event that was already being
// emitted, and a failure here must never reach the turn (see `record`).
//
// ── ⭐ ARG KEYS, NEVER ARG VALUES ──────────────────────────────────────────────────────────────────
// Tool arguments are content: `remember_fact` carries a fact about someone, `search_web` carries what
// they wanted to know. Persisting them would mint a second copy of personal content under different
// retention, in a project whose standing rule is that a field which exists will eventually be rendered.
// So we record which argument NAMES were present and how many bytes the payload was — enough to answer
// every question Ote asked, and none he did not. There is no column for a value (migration 010 asserts
// that), so this is a property of the schema and not of this file's good behaviour.
//
// ── ⭐ ROOT IS READ, NEVER INFERRED ────────────────────────────────────────────────────────────────
// `is_root` comes from the authenticated user's own flag. Deriving it from `user_id == null` is the
// most-repeated defect in this codebase (nine sites; one turned a missing owner into a privilege grant).
// A log that repeats the defect makes the audit trail agree with the bug.

const MAX_ERROR = 500
const MAX_TOOL = 200
const MAX_KEYS = 32

/** Argument NAMES only, capped and sorted so the column is comparable across calls. */
function argShape(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { keys: [], bytes: args === undefined ? 0 : safeBytes(args) }
  }
  const keys = Object.keys(args).slice(0, MAX_KEYS).sort()
  return { keys, bytes: safeBytes(args) }
}

function safeBytes(v) {
  try { return Buffer.byteLength(JSON.stringify(v) ?? '', 'utf8') } catch { return null }
}

/**
 * Persist one `tool.executed` event. Raw SQL, one INSERT, no model — the log_ family's writers are the
 * only readers of their own tables and this one has exactly one statement.
 *
 * ⚠️ FIRE AND FORGET, AND SWALLOWING IS CORRECT HERE. An audit write must not be able to fail a turn:
 * the alternative is that a full disk stops her answering. The failure is surfaced on the logger instead.
 * ⚠️ But note what is NOT swallowed: nothing upstream. This is called from the EventBus subscriber, which
 * is already outside the tool's own promise chain.
 */
export async function recordToolCall(fastify, event) {
  const db = fastify?.db
  const seq = db?.txn_memories?.sequelize
  const { schema } = db?.txn_memories?.getTableName?.() ?? {}
  if (!seq || !schema) return

  const caller = event?.caller ?? {}
  const { keys, bytes } = argShape(event?.args)

  // ⚠️ `bind`, NOT `replacements`, and the reason is a real failure rather than a preference.
  // `arg_keys` is `TEXT[]`, and Sequelize expands an ARRAY replacement into a comma-separated SQL list —
  // so `:argKeys` became `'a','b'` and every insert died with `syntax error at or near ","`. Measured on
  // the first live turn: the audit logged its own failure and the turn was untouched (which is the
  // swallow working as designed), but nothing was recorded. `bind` passes real parameters to pg, which
  // maps a JS array onto text[] natively.
  await seq.query(
    `INSERT INTO "${schema}"."log_tool_calls"
       (tool, origin, user_id, username, is_root, conversation_id, ok, is_read_only, duration_ms, arg_keys, arg_bytes, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    {
      bind: [
        String(event?.name ?? 'unknown').slice(0, MAX_TOOL),
        // NULL, not 'chat'. An emitter that did not say records unknown — guessing 'chat' would label
        // every scheduled run as a conversation.
        caller.origin ?? null,
        caller.userId ?? null,
        caller.username ?? null,
        // ⭐ Explicit. `=== true` so a missing flag is false rather than truthy-by-accident.
        caller.isRoot === true,
        caller.conversationId ?? null,
        event?.ok !== false,
        typeof event?.isReadOnly === 'boolean' ? event.isReadOnly : null,
        Number.isFinite(event?.durationMs) ? Math.round(event.durationMs) : null,
        keys,
        bytes,
        event?.error ? String(event.error).slice(0, MAX_ERROR) : null,
      ],
      type: seq.QueryTypes.INSERT,
    },
  )
}

let initialized = false
/**
 * Boot wiring (idempotent). Subscribes the audit to the runtime's existing `tool.executed` stream via
 * `attachToolAudit`, which exists so this module never has to be imported BY runtime.js — that module
 * top-level-awaits its component install, and an import cycle through it deadlocks boot.
 */
export function initToolLog(fastify, attachToolAudit) {
  if (initialized) return
  initialized = true
  attachToolAudit((event) => {
    recordToolCall(fastify, event).catch((e) => {
      fastify?.log?.warn?.(`[tool-audit] could not record ${event?.name}: ${e.message}`)
    })
  })
}
