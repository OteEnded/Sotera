-- 017 — REMOVE `finish` FROM THE REFLECTION RECORD. The one column that was mine, not ratified.
--
-- Ote, 2026-08-20: *"remove finish from the ratified reflection schema unless we later explicitly decide
-- it belongs there."*
--
-- ── WHAT IT WAS AND WHY IT IS GOING ─────────────────────────────────────────────────────────────────
-- 016 shipped fourteen ratified columns plus `finish` (the provider's finish reason), flagged in its own
-- header as **one column beyond the list he approved**. My argument for it was real — the noticing log
-- already proved the failure it prevents, *"a truncated reply stored as complete would read as her having
-- stopped there"* — and it was still an addition to a schema he had specified precisely. ⭐ He read the
-- flag and ruled. That is the flag working, not the flag being ignored.
--
-- ⚠️ AND IT NEVER CARRIED A VALUE. Measured before dropping: 3 rows, **0 with a non-null `finish`** —
-- because `chat()` returns `{message, usage, model, provider}` and drops the provider's `done_reason`, so
-- the field was inert for its entire life. ⇒ This migration loses no information, which is asserted below
-- rather than assumed.
--
-- ── ⭐ WHAT REPLACES IT, AND WHY THAT IS NOT THE SAME COLUMN WEARING A HAT ──────────────────────────
-- A clipped reflection is a **lifecycle failure**, and Ote's instruction for this phase explicitly keeps
-- those in scope: *"We can fix implementation bugs and lifecycle failures."* So the reflection host now
-- emits a WARNING LINE to the server log when a completion ends exactly at the token ceiling.
--   · it is monitoring, not a record — nothing in `log_reflections` changes, nothing in the population
--     gains a field, and no reader can join on it;
--   · it tells an operator that the instrument clipped, which is the only thing the column was for.
-- ⛔ If that starts feeling like a column, it should be argued for as one rather than grown into one.
--
-- ⓘ THE NOTICING LOG KEEPS ITS `finish`, and that is not an inconsistency: Ote ratified it explicitly
-- when he approved generation 3 (*"1600-token ceiling + finish reason"*), it lives in a JSONL rather than
-- in her schema, and the fix that finally made it carry a value stays.
--
-- Apply:  node test/maintenance/apply-migration.mjs 017_reflection_drop_finish.sql

SET search_path = persona_sotera, public;

BEGIN;

-- ── PROVE NOTHING IS LOST *BEFORE* DROPPING IT ─────────────────────────────────────────────────────
-- A drop is irreversible in one direction, so the assertion goes first. If a future run of this migration
-- finds real values in the column, it must STOP and let a human decide, rather than quietly discarding
-- data because a header said the column was always empty.
DO $$
DECLARE
    n_finish INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'persona_sotera' AND table_name = 'log_reflections'
                  AND column_name = 'finish') THEN
        EXECUTE 'SELECT count(finish) FROM log_reflections' INTO n_finish;
        IF n_finish <> 0 THEN
            RAISE EXCEPTION '% row(s) carry a non-null finish — dropping the column would discard real observations; decide deliberately', n_finish;
        END IF;
        RAISE NOTICE '017: finish is present and null on every row (% non-null) — safe to drop', n_finish;
    ELSE
        RAISE NOTICE '017: finish is already absent — nothing to drop';
    END IF;
END $$;

ALTER TABLE log_reflections DROP COLUMN IF EXISTS finish;

-- ── ⭐ PROVE IT: the column is gone, the ratified fourteen are untouched, every row survived. ───────
DO $$
DECLARE
    n_cols   INTEGER;
    n_rows   INTEGER;
    n_extra  INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'persona_sotera' AND table_name = 'log_reflections'
                  AND column_name = 'finish') THEN
        RAISE EXCEPTION 'finish is still present';
    END IF;

    -- The fourteen Ote ratified, all still here. ⛔ A drop that took a neighbour with it would be worse
    -- than the column it removed.
    SELECT count(*) INTO n_cols FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'log_reflections'
       AND column_name IN ('id','rolling_id','reflected_at','conversation_id','user_id',
                           'up_to_rolling_id','messages_considered','text','wrote_memory_id',
                           'tools_used','blocked_by_disclosure','prompt_generation','code_mtime','model');
    IF n_cols <> 14 THEN
        RAISE EXCEPTION 'log_reflections has % of the 14 ratified columns after the drop', n_cols;
    END IF;

    -- ⭐⭐ AND NO NEW COLUMN CREPT IN EITHER. `created_at` is the one structural extra 016 shipped; the
    -- point of this assertion is that "beyond the ratified list" is now a COUNTED property of the table,
    -- so the next addition has to be a decision instead of a diff nobody read.
    SELECT count(*) INTO n_extra FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'log_reflections'
       AND column_name NOT IN ('id','rolling_id','reflected_at','conversation_id','user_id',
                               'up_to_rolling_id','messages_considered','text','wrote_memory_id',
                               'tools_used','blocked_by_disclosure','prompt_generation','code_mtime',
                               'model','created_at');
    IF n_extra <> 0 THEN
        RAISE EXCEPTION '% column(s) beyond the ratified list + created_at exist on log_reflections', n_extra;
    END IF;

    SELECT count(*) INTO n_rows FROM log_reflections;
    RAISE NOTICE '017: finish dropped; the 14 ratified columns intact, no extras beyond created_at, % reflection row(s) preserved', n_rows;
END $$;

COMMIT;
