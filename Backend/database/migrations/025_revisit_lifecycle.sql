-- 025 — THE REVISIT LIFECYCLE. `log_reflections` becomes the record of REVISITING A CONVERSATION,
-- of which reflection is one reason among several.
--
-- Ote, 2026-08-25: *"Generalize log_reflections; do not create another conversation_revisits table."* And
-- the requirement that shapes every constraint below: *"a failed revisit must leave a record. «Never
-- tried» and «tried but failed» must never collapse into the same database state."*
--
-- ── ⭐⭐⭐ WHY THIS DOES **NOT** REVERSE 016's RATIFIED "NO OUTCOME ENUM" ─────────────────────────────
--
-- 016 refused an enum, and Ote ratified that refusal: *"make the reflection record capable of recording
-- the decision without forcing us to predefine the vocabulary of decisions"* · *"I agree with no outcome
-- enum."* The reason was the noticing experiment in miniature — **a column with a closed vocabulary is a
-- menu one layer lower**: it does not steer what she says, it steers what we can SEE her having said.
--
-- ⇒ THE TWO ARE ABOUT DIFFERENT SUBJECTS, and that is the whole justification:
--     016's refusal is about **HER DECISION**   — nothing / undetermined / not now / not mine to keep.
--                                                  ⛔ STILL NO COLUMN. Still only in her words.
--     025's `outcome` is about **THE ATTEMPT**  — did the machinery run to the end, break, or get refused.
--                                                  ⭐ Mechanically observable, which is exactly 016's own
--                                                  test for what earns a column.
-- ⛔ NOTHING HERE MAY EVER GROW A VALUE THAT DESCRIBES WHAT SHE CONCLUDED. `wrote_memory_id` remains a
-- FACT (a memory exists, here it is), never a verdict, and `completed` says only that she was asked and
-- answered — ⛔ never that she found nothing.
--
-- ── ⭐⭐ THE STATES, AND WHERE EACH ONE LIVES ───────────────────────────────────────────────────────
--
--     never_attempted   ⭐ NO ROW. Derived, never stored — 016's row-exists-vs-no-row property, kept.
--     requested         a row exists, `started_at IS NULL`      (the attempt was claimed)
--     started           `started_at` set, `outcome IS NULL`     (⛔ and it stays here if we never hear
--                                                                again — silence is not a conclusion)
--     completed         outcome='completed'                     (she was asked and answered)
--     failed            outcome='failed'   + `failure` REQUIRED (the machinery broke)
--     blocked           outcome='blocked'                       (a boundary refused her)
--
-- ⛔⛔ AND THERE IS NO STATUS COLUMN ON THE CONVERSATION. Store evidence, derive the world, and let only
-- an ACT terminate it — the rule the advice lifecycle (022–024) was rebuilt around after one exchange's
-- counterpart changed world three times while a flat `pending` never moved. A cached marker on
-- `txn_conversations` would be a projection, never the record. Ote: *"Use the revisit record as the
-- authoritative event, and derive last_successful_revisit / last_reviewed_message / needs_revisit from it."*
--
-- ── ⚠️⚠️ THE UNIQUE INDEX HAD TO SPLIT, OR THE HEADLINE REQUIREMENT WAS UNIMPLEMENTABLE ────────────
-- 016 put ONE unique index on `(conversation_id, up_to_rolling_id)`. With failures now recorded, that
-- index would refuse the retry: the first failed attempt would permanently occupy the watermark, so
-- *"tried but failed"* would become *"can never be tried again"*. ⇒ TWO PARTIAL indexes:
--     · one IN-FLIGHT row per stretch    (`WHERE outcome IS NULL`)  — keeps the concurrency arbitration
--       016 relied on, so two overlapping ticks still cannot both spend a 35B generation.
--     · one COMPLETED row per stretch    (`WHERE outcome = 'completed'`) — keeps "one opportunity per
--       quiet stretch" exactly as ratified.
--     · ⭐ MANY failed/blocked rows are allowed, on purpose: repeated failure at one watermark is the
--       signal that something is actually wrong, and it is invisible if the second attempt cannot be
--       written down.
--
-- ── ⭐⭐⭐ AND THE CURSOR NOW ADVANCES ON COMPLETION, NOT ON ATTEMPT ────────────────────────────────
-- `lastWatermark()` reads `max(up_to_rolling_id)`. Once a FAILED attempt writes a row, that read would
-- return the failed watermark and the conversation would **never be revisited again** — a permanent
-- silent stall produced by the very fix meant to make failure visible. ⇒ the reader is changed in the
-- same commit to count only `outcome = 'completed'`. **The cursor means «how far I have actually
-- reviewed», not «how far I have tried».**
--
-- ── ⚠️ ONE NAMING DEBT, DECLARED RATHER THAN SLIPPED IN (the same way 016 declared `finish`) ────────
-- The table is still called `log_reflections` and `reflected_at` still means *when the attempt was
-- opened*. Both names are now narrower than what they hold — reflection is one `reason`, not the only
-- one. ⛔ Renaming was NOT done here because it was not asked for and it touches ten readers mid-sequence.
-- ⇒ **His to rule on.** A name that outlives its subject is a defect this project has already recorded.
--
-- Apply:  node test/maintenance/apply-migration.mjs 025_revisit_lifecycle.sql

SET search_path = persona_sotera, public;

BEGIN;

ALTER TABLE log_reflections
    -- ⭐ WHEN THE MODEL TURN ACTUALLY BEGAN. Separate from the claim, because the gap between them is
    -- where "we opened a slot and never used it" lives, and that is a different failure from "the turn
    -- ran and broke".
    ADD COLUMN IF NOT EXISTS started_at    TIMESTAMPTZ,
    -- ⭐ WHEN IT TERMINATED, whatever the outcome. ⛔ Deliberately NOT "succeeded_at".
    ADD COLUMN IF NOT EXISTS completed_at  TIMESTAMPTZ,
    -- completed | failed | blocked. NULL = still in flight, which is a state and not a gap.
    ADD COLUMN IF NOT EXISTS outcome       TEXT,
    -- ⭐ WHY THIS REVISIT WAS ASKED FOR — 'reflection' today; the passive worker and an explicit
    -- operator trigger will add their own. It is about the OCCASION, never about what she concluded.
    ADD COLUMN IF NOT EXISTS reason        TEXT,
    -- ⭐⭐ WHAT WENT WRONG. REQUIRED whenever outcome='failed' (constraint below) — the same discipline as
    -- 023's "an abandon must carry a reason": a failure nobody can diagnose is barely better than none.
    ADD COLUMN IF NOT EXISTS failure       TEXT,
    -- ⭐ THE START OF THE RANGE REVIEWED. With `up_to_rolling_id` this makes the review INCREMENTAL and
    -- auditable: "I have already reviewed through 120; review 121–145." ⓘ NULL on every pre-existing row
    -- and deliberately NOT backfilled — those runs did not record a lower bound, and inventing one would
    -- be a claim about coverage nobody measured.
    ADD COLUMN IF NOT EXISTS from_rolling_id BIGINT;

-- ── BACKFILL · READ THE EXISTING ROWS BY THE SHAPE 016 ITSELF DESCRIBED ────────────────────────────
-- 016's header predicted the crash case exactly: *"if the process dies mid-loop the row survives with
-- empty text, and an empty `text` with `tools_used = {}` is identifiable as exactly that."* There is
-- one such row. ⇒ it is read as the failure it always was, rather than being left indistinguishable
-- from the 67 real ones.
UPDATE log_reflections
   SET outcome      = 'failed',
       failure      = 'claimed but never filled in; classified by shape at migration 025 (empty text, no tools)',
       completed_at = reflected_at
 WHERE outcome IS NULL AND coalesce(text, '') = '' AND coalesce(array_length(tools_used, 1), 0) = 0;

-- Every other pre-existing row is an attempt that ran to the end. ⛔ `started_at` is set to
-- `reflected_at` because that is the only timestamp those runs recorded — it is an approximation, and
-- the comment on the column says so rather than the value pretending otherwise.
UPDATE log_reflections
   SET outcome      = CASE WHEN blocked_by_disclosure THEN 'blocked' ELSE 'completed' END,
       started_at   = reflected_at,
       completed_at = reflected_at,
       reason       = 'reflection'
 WHERE outcome IS NULL;

ALTER TABLE log_reflections
    ADD CONSTRAINT log_reflections_outcome_known
        CHECK (outcome IS NULL OR outcome IN ('completed', 'failed', 'blocked')),
    -- ⛔ A TERMINATED ATTEMPT HAS A TERMINATION TIME. Without this, "outcome set, completed_at null"
    -- becomes a third silent state.
    ADD CONSTRAINT log_reflections_terminal_has_time
        CHECK (outcome IS NULL OR completed_at IS NOT NULL),
    -- ⭐⭐ A FAILURE MUST SAY HOW. Same rule as 023's abandon-needs-a-reason and 024's steer-needs-an-
    -- outcome: the row is the only record that will ever exist, so it has to carry the diagnosis.
    ADD CONSTRAINT log_reflections_failure_explained
        CHECK (outcome <> 'failed' OR (failure IS NOT NULL AND length(btrim(failure)) > 0)),
    -- ⛔ NO TIME TRAVEL. ⓘ `completed_at` may exist WITHOUT `started_at`: an attempt can fail or be
    -- blocked during setup, before the turn ever begins, and that is a real and important state.
    ADD CONSTRAINT log_reflections_times_ordered
        CHECK ((started_at   IS NULL OR started_at   >= reflected_at)
           AND (completed_at IS NULL OR completed_at >= reflected_at)),
    -- ⭐ THE RANGE IS A RANGE.
    ADD CONSTRAINT log_reflections_range_sane
        CHECK (from_rolling_id IS NULL OR from_rolling_id <= up_to_rolling_id);

-- ── THE INDEX SPLIT ───────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS log_reflections_one_per_stretch_idx;
CREATE UNIQUE INDEX IF NOT EXISTS log_reflections_one_inflight_per_stretch_idx
    ON log_reflections (conversation_id, up_to_rolling_id) WHERE outcome IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS log_reflections_one_completed_per_stretch_idx
    ON log_reflections (conversation_id, up_to_rolling_id) WHERE outcome = 'completed';
-- The cursor read: the highest COMPLETED watermark per conversation.
CREATE INDEX IF NOT EXISTS log_reflections_cursor_idx
    ON log_reflections (conversation_id, up_to_rolling_id DESC) WHERE outcome = 'completed';

COMMENT ON COLUMN log_reflections.reflected_at IS
 'When the attempt was OPENED (the ledger row is claimed before the model turn, so nothing durable can be written without a row pointing at it). ⚠️ The name predates the revisit lifecycle and is now narrower than the column: read it as `requested_at`.';
COMMENT ON COLUMN log_reflections.outcome IS
 'How the ATTEMPT ended: completed | failed | blocked. NULL means still in flight. ⛔ This is never a statement about what she concluded — 016''s refusal to enumerate her decisions stands, and `completed` means she was asked and answered, never that she found nothing.';
COMMENT ON COLUMN log_reflections.failure IS
 'What went wrong, required whenever outcome=''failed''. The row is the only record that will ever exist that a revisit was attempted and broke.';
COMMENT ON COLUMN log_reflections.from_rolling_id IS
 'The lower bound of the range reviewed, making revisits incremental: already reviewed through N, so review N+1..top. NULL on rows written before migration 025 — those runs recorded no lower bound and one was not invented for them.';

-- ══ ⛔⛔ THE MIGRATION PROVES ITS OWN GUARDS · it breaks each rule and requires the break to fail ════
DO $$
DECLARE cid uuid := gen_random_uuid(); ok boolean; n int;
BEGIN
    -- 1 · a failure with no explanation must be refused
    ok := false;
    BEGIN
        INSERT INTO log_reflections (conversation_id, up_to_rolling_id, text, prompt_generation, outcome, completed_at)
        VALUES (cid, 1, '', 3, 'failed', now());
    EXCEPTION WHEN check_violation THEN ok := true; END;
    IF NOT ok THEN RAISE EXCEPTION '025: a FAILED revisit with no `failure` was accepted — a failure nobody can diagnose'; END IF;

    -- 2 · an outcome with no completion time must be refused
    ok := false;
    BEGIN
        INSERT INTO log_reflections (conversation_id, up_to_rolling_id, text, prompt_generation, outcome)
        VALUES (cid, 2, '', 3, 'completed');
    EXCEPTION WHEN check_violation THEN ok := true; END;
    IF NOT ok THEN RAISE EXCEPTION '025: a terminated attempt with no completed_at was accepted'; END IF;

    -- 3 · an unknown outcome must be refused
    ok := false;
    BEGIN
        INSERT INTO log_reflections (conversation_id, up_to_rolling_id, text, prompt_generation, outcome, completed_at)
        VALUES (cid, 3, '', 3, 'nothing_to_remember', now());
    EXCEPTION WHEN check_violation THEN ok := true; END;
    IF NOT ok THEN RAISE EXCEPTION '025: an outcome describing HER DECISION was accepted — this column is about the attempt'; END IF;

    -- 4 · ⭐⭐ TWO FAILURES AT ONE WATERMARK MUST BE ALLOWED — the headline requirement.
    INSERT INTO log_reflections (conversation_id, up_to_rolling_id, text, prompt_generation, outcome, failure, completed_at)
    VALUES (cid, 9, '', 3, 'failed', 'first attempt', now()),
           (cid, 9, '', 3, 'failed', 'second attempt', now());
    SELECT count(*) INTO n FROM log_reflections WHERE conversation_id = cid AND outcome = 'failed';
    IF n <> 2 THEN RAISE EXCEPTION '025: a retry after failure could not be recorded — tried-but-failed would collapse into never-tried'; END IF;

    -- 5 · …but only ONE COMPLETED revisit per stretch
    INSERT INTO log_reflections (conversation_id, up_to_rolling_id, text, prompt_generation, outcome, completed_at)
    VALUES (cid, 9, 'first', 3, 'completed', now());
    ok := false;
    BEGIN
        INSERT INTO log_reflections (conversation_id, up_to_rolling_id, text, prompt_generation, outcome, completed_at)
        VALUES (cid, 9, 'second', 3, 'completed', now());
    EXCEPTION WHEN unique_violation THEN ok := true; END;
    IF NOT ok THEN RAISE EXCEPTION '025: a second COMPLETED revisit was accepted for one stretch'; END IF;

    -- 6 · …and only ONE IN-FLIGHT attempt per stretch, so concurrent ticks still cannot both spend a turn
    INSERT INTO log_reflections (conversation_id, up_to_rolling_id, text, prompt_generation)
    VALUES (cid, 11, '', 3);
    ok := false;
    BEGIN
        INSERT INTO log_reflections (conversation_id, up_to_rolling_id, text, prompt_generation)
        VALUES (cid, 11, '', 3);
    EXCEPTION WHEN unique_violation THEN ok := true; END;
    IF NOT ok THEN RAISE EXCEPTION '025: two concurrent claims were accepted for one stretch'; END IF;

    -- 7 · a range that runs backwards must be refused
    ok := false;
    BEGIN
        INSERT INTO log_reflections (conversation_id, up_to_rolling_id, from_rolling_id, text, prompt_generation)
        VALUES (cid, 20, 30, '', 3);
    EXCEPTION WHEN check_violation THEN ok := true; END;
    IF NOT ok THEN RAISE EXCEPTION '025: a revisit range running backwards was accepted'; END IF;

    DELETE FROM log_reflections WHERE conversation_id = cid;
    RAISE NOTICE '025: all seven guards proved';
END $$;

-- ⛔ NOTHING MAY BE LEFT UNCLASSIFIED. Every pre-existing row now reads as a state rather than a gap.
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM log_reflections WHERE outcome IS NULL;
    IF n > 0 THEN RAISE EXCEPTION '025: % row(s) still have no outcome after backfill', n; END IF;
END $$;

COMMIT;
