-- 027 — PREEMPTION IS AN OUTCOME, NOT A FAILURE.
--
-- Ote, 2026-08-25: *"User interaction has absolute priority over passive revisit… interrupt/preempt the
-- revisit; record that the attempt was not completed because of user interaction… **Do not mark the
-- revisit as failed — user preemption is an intentional control-flow outcome, not a failure.**"*
--
-- ── ⭐⭐ WHY IT NEEDS ITS OWN VALUE RATHER THAN REUSING `failed` ─────────────────────────────────────
-- `failed` means the machinery broke and carries a REQUIRED `failure` diagnosis, because 023/025's rule is
-- that a failure nobody can diagnose is barely better than none. A preemption has nothing to diagnose: it
-- worked exactly as designed, and something with higher priority arrived. Folding it into `failed` would
--   · make a healthy, correctly-yielding lane look like a broken one, and
--   · corrupt `consecutiveFailures`, which exists to spot a conversation that genuinely cannot be revisited.
-- ⇒ a fourth terminal value, and the derivation treats it as a clean stop.
--
-- ⭐ AND IT IS STILL ABOUT THE ATTEMPT, so 016's ratified refusal is untouched: `preempted` says what
-- happened to the RUN, never what she concluded. ⛔ The column still may not grow a value describing her
-- decision.
--
-- ── ⭐⭐⭐ THE WATERMARK DOES NOT MOVE, AND THAT IS THE WHOLE POINT ─────────────────────────────────
-- Ote: *"don't advance up_to_rolling_id unless the revisit actually completed… if the last completed
-- watermark is 100 and a revisit gets interrupted while working on 101+, the next revisit should resume
-- from 101 rather than silently treating that material as reviewed."*
-- ⇒ NO CHANGE WAS NEEDED FOR THAT, and that is worth recording rather than assuming: the cursor read is
-- already `WHERE outcome = 'completed'` (025), and the completed-per-stretch unique index is already
-- partial on the same predicate. A preempted row is TERMINAL (so it frees the in-flight slot and the
-- conversation becomes eligible again) and NOT completed (so it moves nothing). The rule "the watermark
-- means actually reviewed, not merely attempted" carries preemption for free.
--
-- Apply:  node test/maintenance/apply-migration.mjs 027_revisit_preempted.sql

SET search_path = persona_sotera, public;

BEGIN;

ALTER TABLE log_conversation_revisits DROP CONSTRAINT log_conversation_revisits_outcome_known;
ALTER TABLE log_conversation_revisits
    ADD CONSTRAINT log_conversation_revisits_outcome_known
        CHECK (outcome IS NULL OR outcome IN ('completed', 'failed', 'blocked', 'preempted'));

COMMENT ON COLUMN log_conversation_revisits.outcome IS
 'How the ATTEMPT ended: completed | failed | blocked | preempted. NULL means still in flight. ⭐ `preempted` = a user interaction arrived and passive work yielded to it — an intentional control-flow outcome, NOT a failure, and it carries no `failure` diagnosis because there is nothing wrong to diagnose. ⛔ None of these is ever a statement about what she concluded: 016''s refusal to enumerate her decisions stands, and `completed` means she was asked and answered, never that she found nothing.';

-- ══ ⛔ PROVED, NOT ASSUMED ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE cid uuid := gen_random_uuid(); ok boolean; n int;
BEGIN
    -- 1 · preemption is accepted, and needs NO failure text
    INSERT INTO log_conversation_revisits (conversation_id, up_to_rolling_id, text, prompt_generation, outcome, completed_at)
    VALUES (cid, 101, '', 3, 'preempted', now());

    -- 2 · …and it is NOT completed, so it moves no cursor
    SELECT coalesce(max(up_to_rolling_id), 0) INTO n
      FROM log_conversation_revisits WHERE conversation_id = cid AND outcome = 'completed';
    IF n <> 0 THEN RAISE EXCEPTION '027: a preempted attempt advanced the cursor — interrupted material would read as reviewed'; END IF;

    -- 3 · …and the same watermark can be attempted again, so the lane resumes at 101 rather than skipping it
    INSERT INTO log_conversation_revisits (conversation_id, up_to_rolling_id, text, prompt_generation)
    VALUES (cid, 101, '', 3);
    SELECT count(*) INTO n FROM log_conversation_revisits WHERE conversation_id = cid AND up_to_rolling_id = 101;
    IF n <> 2 THEN RAISE EXCEPTION '027: a preempted watermark could not be retried'; END IF;
    UPDATE log_conversation_revisits SET outcome = 'completed', completed_at = now()
     WHERE conversation_id = cid AND outcome IS NULL;

    -- 4 · an unknown outcome is still refused — widening the enum did not open it
    ok := false;
    BEGIN
        INSERT INTO log_conversation_revisits (conversation_id, up_to_rolling_id, text, prompt_generation, outcome, completed_at)
        VALUES (cid, 9, '', 3, 'interrupted_by_user', now());
    EXCEPTION WHEN check_violation THEN ok := true; END;
    IF NOT ok THEN RAISE EXCEPTION '027: an unknown outcome was accepted'; END IF;

    -- 5 · ⛔ and a FAILURE still has to explain itself — preemption is the exception, not a loosening
    ok := false;
    BEGIN
        INSERT INTO log_conversation_revisits (conversation_id, up_to_rolling_id, text, prompt_generation, outcome, completed_at)
        VALUES (cid, 10, '', 3, 'failed', now());
    EXCEPTION WHEN check_violation THEN ok := true; END;
    IF NOT ok THEN RAISE EXCEPTION '027: a FAILED revisit with no diagnosis was accepted'; END IF;

    DELETE FROM log_conversation_revisits WHERE conversation_id = cid;
    RAISE NOTICE '027: preemption proved terminal, cursor-neutral and retryable';
END $$;

COMMIT;
