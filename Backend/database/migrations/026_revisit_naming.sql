-- 026 — THE NAME CATCHES UP WITH THE THING. `log_reflections` → `log_conversation_revisits`,
-- and `reflected_at` → `requested_at`.
--
-- Ote, 2026-08-25, ratifying the authority model: *"I agree that `reflected_at` meaning «attempt started»
-- is going to become poisonous once this becomes a real revisit lifecycle. Clean that semantic debt up
-- before the passive worker depends on it. Prefer explicit names like requested_at, started_at,
-- completed_at rather than making one timestamp change meaning."*
--
-- ── ⭐⭐ WHY THE TABLE IS RENAMED TOO, AND NOT ONLY THE COLUMN ───────────────────────────────────────
-- 025 generalised this table into the record of REVISITING A CONVERSATION, of which reflection became one
-- `reason` among several. A row can now describe an attempt that never began, one that broke, or one a
-- boundary refused — none of which is a reflection. ⇒ `log_reflections` is no longer a narrow name, it is
-- a WRONG one, and this project has a recorded defect class for a name that outlives its subject.
-- ⭐ It is renamed NOW, at 68 rows and eleven readers, because the passive worker is about to become the
-- twelfth and every later reader makes the rename more expensive and less likely to happen.
--
-- ── ⛔ THE ONE THING A RENAME MUST NOT DO IS LEAVE TWO NAMES ────────────────────────────────────────
-- ⛔ NO VIEW, NO ALIAS, NO COMPATIBILITY SHIM. `schema-naming-canon` is ONE NAME PER TABLE, and a
-- compatibility view is precisely two names for one thing with the older one still working — which is how
-- a codebase ends up with half its queries on each. Every reader moves in the same commit.
-- ⚠️ Postgres keeps the OLD names for indexes, constraints and the sequence after a table rename, so they
-- are renamed explicitly below. An index called `log_reflections_pkey` on a table called
-- `log_conversation_revisits` is exactly the residue this migration exists to prevent.
--
-- ── ⭐ `requested_at`, AND WHY IT IS NOT A NEW COLUMN ───────────────────────────────────────────────
-- The value was always "when the ledger row was claimed" — the row is claimed BEFORE the model turn, so
-- nothing durable can be written without a row pointing at it. ⇒ this is a RENAME, not a new column and
-- not a re-derivation: no row's meaning changes, only the word for it. Together with 025's `started_at`
-- and `completed_at`, the three timestamps now each mean one thing and none of them drifts.
--
-- Apply:  node test/maintenance/apply-migration.mjs 026_revisit_naming.sql

SET search_path = persona_sotera, public;

BEGIN;

ALTER TABLE log_reflections RENAME TO log_conversation_revisits;
ALTER TABLE log_conversation_revisits RENAME COLUMN reflected_at TO requested_at;

-- ── EVERY DEPENDENT OBJECT FOLLOWS THE TABLE ──────────────────────────────────────────────────────
ALTER SEQUENCE log_reflections_rolling_id_seq RENAME TO log_conversation_revisits_rolling_id_seq;

ALTER INDEX log_reflections_pkey                          RENAME TO log_conversation_revisits_pkey;
ALTER INDEX log_reflections_rolling_id_key                RENAME TO log_conversation_revisits_rolling_id_key;
ALTER INDEX log_reflections_convo_idx                     RENAME TO log_conversation_revisits_convo_idx;
ALTER INDEX log_reflections_cursor_idx                    RENAME TO log_conversation_revisits_cursor_idx;
ALTER INDEX log_reflections_recent_idx                    RENAME TO log_conversation_revisits_recent_idx;
ALTER INDEX log_reflections_room_idx                      RENAME TO log_conversation_revisits_room_idx;
ALTER INDEX log_reflections_one_completed_per_stretch_idx RENAME TO log_conversation_revisits_one_completed_idx;
ALTER INDEX log_reflections_one_inflight_per_stretch_idx  RENAME TO log_conversation_revisits_one_inflight_idx;

ALTER TABLE log_conversation_revisits RENAME CONSTRAINT log_reflections_considered_sane    TO log_conversation_revisits_considered_sane;
ALTER TABLE log_conversation_revisits RENAME CONSTRAINT log_reflections_failure_explained  TO log_conversation_revisits_failure_explained;
ALTER TABLE log_conversation_revisits RENAME CONSTRAINT log_reflections_outcome_known      TO log_conversation_revisits_outcome_known;
ALTER TABLE log_conversation_revisits RENAME CONSTRAINT log_reflections_range_sane         TO log_conversation_revisits_range_sane;
ALTER TABLE log_conversation_revisits RENAME CONSTRAINT log_reflections_terminal_has_time  TO log_conversation_revisits_terminal_has_time;
ALTER TABLE log_conversation_revisits RENAME CONSTRAINT log_reflections_times_ordered      TO log_conversation_revisits_times_ordered;
ALTER TABLE log_conversation_revisits RENAME CONSTRAINT log_reflections_watermark_sane     TO log_conversation_revisits_watermark_sane;

COMMENT ON TABLE log_conversation_revisits IS
 'One row per ATTEMPT to revisit a conversation. Reflection is one `reason` among several. The row is claimed BEFORE the model turn, so nothing durable can be written without a record pointing at it, and it terminates as completed | failed | blocked — NULL outcome means still in flight. ⭐ never_attempted is the ABSENCE of a row, so "she was never asked" and "she was asked and kept nothing" need no vocabulary to tell apart. ⛔ `outcome` describes the ATTEMPT and never what she concluded: 016''s refusal to enumerate her decisions stands, and nothing / undetermined / not now live only in her own words. ⛔ Not a memory table: if she retained something, `wrote_memory_id` points at the row the ordinary write lane produced.';

COMMENT ON COLUMN log_conversation_revisits.requested_at IS
 'When the attempt was OPENED — the ledger row is claimed before the model turn, so a durable write can never exist without a record of the occasion that produced it. ⭐ Renamed from `reflected_at` by 026: the value never changed, only the word, and the old name had started to mean "when she reflected", which a failed or never-started attempt makes false.';

-- ══ ⛔ THE RENAME IS PROVED, NOT ASSUMED ══════════════════════════════════════════════════════════
DO $$
DECLARE n int;
BEGIN
    -- ⭐ THE OLD NAMES MUST BE GONE. A rename that leaves the old table reachable is two names for one
    -- thing, which is the state this migration exists to avoid rather than create.
    SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'persona_sotera' AND c.relname = 'log_reflections';
    IF n <> 0 THEN RAISE EXCEPTION '026: log_reflections still exists — the rename left two names'; END IF;

    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'log_conversation_revisits' AND column_name = 'reflected_at';
    IF n <> 0 THEN RAISE EXCEPTION '026: reflected_at still exists'; END IF;

    -- ⛔ AND NO DEPENDENT OBJECT MAY KEEP THE OLD PREFIX — postgres does not rename them for us, and an
    -- index named after a table that no longer exists is exactly the residue this is preventing.
    SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'persona_sotera' AND c.relname LIKE 'log_reflections%';
    IF n <> 0 THEN RAISE EXCEPTION '026: % dependent object(s) still carry the old prefix', n; END IF;

    SELECT count(*) INTO n FROM pg_constraint
     WHERE conrelid = 'persona_sotera.log_conversation_revisits'::regclass AND conname LIKE 'log_reflections%';
    IF n <> 0 THEN RAISE EXCEPTION '026: % constraint(s) still carry the old prefix', n; END IF;

    -- ⭐ AND THE DATA CAME THROUGH UNTOUCHED. A rename must move zero rows.
    SELECT count(*) INTO n FROM log_conversation_revisits;
    IF n = 0 THEN RAISE EXCEPTION '026: the table is empty after the rename — data did not survive'; END IF;
    RAISE NOTICE '026: renamed cleanly, % row(s) intact', n;
END $$;

COMMIT;
