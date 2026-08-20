-- 010 — WHO CALLED WHICH TOOL, HOW, AND WHETHER IT WORKED.
--
-- Ote, 2026-08-20: *"when tools call, memory call — it should log, how call that tools, log by the login
-- account, who can tools. i dont know if we have this yet."*
--
-- We did not. Measured before writing a line: the EventBus already emits
-- `tool.executed { name, args, ok, durationMs, isReadOnly, caller }` from the SDK's runTool AND from the
-- four host-side tools the chat route runs itself — and the ONLY subscriber does this:
--
--     logger?.debug?.(`[tool.executed] ${e.name} (${e.durationMs}ms) ${status}`)
--
-- A debug line, to the process log, **which drops `caller` on the floor.** So "which account called
-- remember_fact" was unanswerable, and the one place a tool call was durably recorded —
-- `txn_messages.tool_calls` — only covers CHAT turns: a tool run by a schedule (`action.type:'tool'`) or
-- inside a skill left no per-tool record at all.
--
-- ⇒ The data existed and nothing persisted it. This table is the subscriber's destination.
--
-- ── ⭐ THE ONE DESIGN DECISION: ARG KEYS, NEVER ARG VALUES ─────────────────────────────────────────
-- A tool's arguments are content. `remember_fact` carries a fact about a person, `search_web` carries
-- what they wanted to know, `note_own_practice` carries a label about how she works with them. Logging
-- them raw would mint a SECOND copy of personal content, in a new table, under different retention, in a
-- schema whose whole discipline is that a field which exists will eventually be rendered.
--
-- So this table records the SHAPE of the call — which argument names were present, and how many bytes —
-- and there is no column that can hold a value. That answers every question Ote actually asked (who,
-- which tool, how it was invoked, did it work) and answers none that he did not.
--   ⚠️ If full-argument capture is ever wanted it must be a deliberate, defaulted-off setting and a
--   different table with its own retention. It is NOT a column to be added here.
--
-- ── ⭐ AND THE SECOND DECISION: ROOT IS RECORDED, NEVER INFERRED ───────────────────────────────────
-- `is_root` is an explicit boolean taken from the authenticated user. It is NOT derived from
-- `user_id IS NULL`. That inference is the most-repeated defect in this project — NINE live sites, the
-- worst of which turned a missing owner into a privilege grant in the schedule executor, and one still
-- live in `profile-service.js:191` (`if (user?.isRoot || user?.id == null)`). A log that repeated the
-- defect would make the audit trail agree with the bug.
--
-- ── LOOSE REFS, LIKE EVERY OTHER log_ TABLE ────────────────────────────────────────────────────────
-- No foreign keys. `username` is a snapshot so a deleted account degrades the record instead of
-- orphaning it (the `ownerIdOrNull` doctrine: attribution columns carry a name, ownership columns
-- refuse). Deleting a user must not delete the evidence of what that user did.
--
-- Apply:  node test/maintenance/apply-migration.mjs 010_tool_call_log.sql

SET search_path = persona_sotera, public;

BEGIN;

CREATE TABLE IF NOT EXISTS log_tool_calls (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rolling_id      BIGSERIAL UNIQUE NOT NULL,

    tool            TEXT        NOT NULL,

    -- HOW it was called. NULL = the emitter did not say, and that is recorded as unknown rather than
    -- guessed: 'chat' would be the likely guess and it is exactly the wrong one for a scheduled run.
    origin          TEXT,

    -- WHO. Loose ref (no FK) + a name snapshot, so the trail survives account deletion.
    user_id         UUID,
    username        TEXT,
    -- ⭐ explicit, never derived from a null user_id. See the header.
    is_root         BOOLEAN     NOT NULL DEFAULT false,

    -- WHERE, when there was a conversation. Loose ref for the same reason.
    conversation_id UUID,

    ok              BOOLEAN     NOT NULL,
    is_read_only    BOOLEAN,
    duration_ms     INTEGER,

    -- ⭐ SHAPE, NOT CONTENT. The argument NAMES that were present, and the total size of the payload.
    arg_keys        TEXT[],
    arg_bytes       INTEGER,

    -- Truncated by the writer. An error message is diagnostic text, not user content.
    error           TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE log_tool_calls IS
 'Append-only audit of every tool execution: which tool, which account (explicitly including whether it was root), how it was invoked, whether it succeeded, and how long it took. Records the SHAPE of the arguments (their key names and total size) and NEVER their values — a tool argument is content, and this table must not become a second copy of it. Loose refs only, so deleting a user or a conversation does not delete the evidence.';

COMMENT ON COLUMN log_tool_calls.arg_keys IS
 'The argument NAMES present on the call. Deliberately not the values: see the table comment. A parameterless tool (recall_own_memory, recall_intention) records an empty array, which is itself the useful fact.';

COMMENT ON COLUMN log_tool_calls.is_root IS
 'Whether the caller was the root account, taken from the authenticated user. NEVER inferred from user_id IS NULL — that inference is this codebase''s most-repeated defect and once turned a missing owner into a privilege grant.';

-- Read patterns: "what happened lately", "what has this account been doing", "who uses this tool".
CREATE INDEX IF NOT EXISTS log_tool_calls_created_idx ON log_tool_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS log_tool_calls_user_idx    ON log_tool_calls (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS log_tool_calls_tool_idx    ON log_tool_calls (tool, created_at DESC);
-- The failure trail on its own, because "what is breaking" should not scan the successes.
CREATE INDEX IF NOT EXISTS log_tool_calls_failed_idx  ON log_tool_calls (created_at DESC) WHERE NOT ok;

-- ── ⭐ PROVE THE SHAPE. A log that can hold an argument value defeats its own design. ──────────────
DO $$
DECLARE bad TEXT;
BEGIN
    SELECT string_agg(column_name, ', ') INTO bad
      FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'log_tool_calls'
       AND (column_name IN ('args', 'arguments', 'payload', 'value', 'values', 'result', 'response', 'input', 'output')
            OR column_name ILIKE '%content%' OR column_name ILIKE '%payload%' OR column_name ILIKE '%excerpt%');
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'log_tool_calls has forbidden column(s): % — this table records the SHAPE of a call, never its content', bad;
    END IF;
    RAISE NOTICE '010: log_tool_calls created — arg keys only, root recorded explicitly, no foreign keys';
END $$;

COMMIT;
