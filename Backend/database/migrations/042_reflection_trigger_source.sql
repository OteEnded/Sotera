-- ⭐⭐⭐ 042 · WHO ASKED FOR THIS REFLECTION — so a manual run can never be mistaken for a natural one.
--
-- Ote, 2026-09-02: *"add a manual/dev Reflection trigger that runs the exact same Gen-2 Reflection path
-- immediately. The trigger should bypass only the scheduler eligibility/timing, not any Reflection
-- behavior or safety boundary… Please mark the run with a clear trigger_source=manual so manual runs can
-- be separated from normal cron-generated reflections. Do not mix them into the primary P1 population
-- automatically."*
--
-- ── ⭐ THE FOURTH THING A ROW HAS TO SAY ────────────────────────────────────────────────────────
--   prompt_generation    what she was ASKED
--   tool_generation      what she was OFFERED
--   dispatch_generation  whether the offer was ENFORCED
--   trigger_source       WHO ASKED, and therefore whether this observation is natural   ← this one
--
-- ⛔ IT IS NOT A GENERATION. The generations describe the instrument; this describes the OCCASION. A
-- manual run uses the identical instrument — same prompt, same two tools, same enforced dispatch, same
-- retention path — and is still a different kind of observation, because a person chose the moment.
--
-- ── ⚠️ THE BACKFILL SAYS WHAT IS TRUE, ⛔ NOT WHAT IS LIKELY ─────────────────────────────────────
-- Every existing row predates this column. They were almost certainly all cron runs — but "almost
-- certainly" is not a provenance, and 041 already refused to retro-label rows for the same reason.
-- ⇒ they are marked `legacy`: *recorded before the marker existed*, which is verifiable.
-- ⭐ The P1 window is `tool_generation = 2`, and every legacy row is generation 1, so nothing is lost.

SET search_path = persona_sotera, public;

BEGIN;

ALTER TABLE log_conversation_revisits
    ADD COLUMN IF NOT EXISTS trigger_source text;

UPDATE log_conversation_revisits SET trigger_source = 'legacy' WHERE trigger_source IS NULL;

-- ⭐ A CLOSED VOCABULARY, ENFORCED BY THE DATABASE. An unrecognised source must fail the insert rather
-- than quietly join the population: this column's whole job is to keep two kinds of observation apart,
-- and a value nobody defined would defeat it silently.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'log_conversation_revisits_trigger_ck') THEN
        ALTER TABLE log_conversation_revisits
            ADD CONSTRAINT log_conversation_revisits_trigger_ck
            CHECK (trigger_source IN ('cron', 'manual', 'check', 'legacy'));
    END IF;
END $$;

COMMIT;

-- ── VERIFICATION ────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    unmarked bigint;
BEGIN
    -- ⛔ NOT A FROZEN COUNT — 038 asserted 79 when the corpus was 81, and the dreaming check asserted an
    -- absence a migration had already filled. ⭐ The invariant is what survives: nothing is unmarked, and
    -- nothing claims to be manual before a manual run existed.
    SELECT count(*) INTO unmarked FROM log_conversation_revisits WHERE trigger_source IS NULL;
    IF unmarked > 0 THEN
        RAISE EXCEPTION '042: % reflection row(s) carry no trigger_source', unmarked;
    END IF;
    IF EXISTS (SELECT 1 FROM log_conversation_revisits WHERE trigger_source <> 'legacy') THEN
        RAISE EXCEPTION '042: a reflection already claims a trigger source before the marker existed';
    END IF;
    RAISE NOTICE '042: % reflection(s) marked legacy; the P1 window stays tool_generation=2 AND dispatch_generation=2 AND trigger_source=cron',
        (SELECT count(*) FROM log_conversation_revisits WHERE trigger_source = 'legacy');
END $$;
