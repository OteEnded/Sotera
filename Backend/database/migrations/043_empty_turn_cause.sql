-- ⭐⭐⭐ 043 · AN EMPTY TURN NOW SAYS *WHY* — one classification, one cause.
--
-- Ote, 2026-09-02, ruling after the measurement: *"Keep a single high-level `empty_assistant_turn`
-- classification with a separate cause, rather than two unrelated stamps. Causes should at minimum
-- distinguish `client_disconnect` and `generation_empty`. A client disconnect is not automatically an
-- error… `generation_empty` is a real generation failure condition, even when the provider returned no
-- explicit error… Keep explicit `provider_request_failed` as its existing class when the provider actually
-- reports a named failure; don't collapse it into `generation_empty`."*
--
-- ── ⚠️⚠️ THE MEASURED DEFECT ─────────────────────────────────────────────────────────────────────
-- 32 empty assistant rows since 2026-08-18 turned out to be FIVE classes, four of them already stopped.
-- The one still occurring — 13 rows, 2026-08-19 through 2026-09-02 20:57:52 — carries this single string:
--
--     "no output was produced — the client disconnected before the first token, or generation ended empty"
--
-- ⛔ TWO MUTUALLY EXCLUSIVE CAUSES IN ONE NAME. A browser closing and a model producing nothing are
-- different events with different owners, and the row could not say which.
--
-- ⭐⭐ AND THE SEAM HAD ALREADY LEARNED THIS LESSON ONE LEVEL UP. Its own comment reads: *"content '', no
-- reasoning, no tools and no error is a non-event… Stamp it so the row says what it is… and `error IS NULL`
-- stops meaning two things."* That fix was right. ⇒ **the stamp it introduced then went on to mean two
-- things itself.** Same family, one level down.
--
-- ── ⭐ WHY TWO COLUMNS AND NOT ONE ──────────────────────────────────────────────────────────────
-- `empty_turn` is the CLASSIFICATION (what shape this row is) and `empty_turn_cause` is the CAUSE (why).
-- Ote asked for exactly that split rather than two unrelated error strings, and it is the split that makes
-- the vocabulary extensible without re-reading prose: a future shape gets a new classification, a newly
-- distinguishable reason gets a new cause. ⛔ Collapsing them would rebuild the defect in one column.
--
-- ⛔ AND THE CAUSE CANNOT LIVE IN `error`, WHICH IS THE WHOLE POINT: a `client_disconnect` carries
-- `error = NULL` by Ote's ruling, so a classification stored inside `error` would vanish for exactly the
-- case that motivated the fix.
--
-- ⛔ NO HISTORICAL ROW IS REWRITTEN. Ote: *"Don't rewrite the historical rows merely to make the old
-- classification prettier. The fix is for future observations."* ⇒ every existing row keeps its `error`
-- verbatim and gets NULL classification. The 13 stay exactly as ambiguous as they were, which is the
-- honest record of what the system could say at the time.

SET search_path = persona_sotera, public;

BEGIN;

-- ⭐ THE CLASSIFICATION. NULL on every ordinary turn — ⛔ deliberately not defaulted, because "this turn
-- was fine" and "this turn predates the classification" are different facts and a default would merge them.
ALTER TABLE txn_messages
    ADD COLUMN IF NOT EXISTS empty_turn text;

-- ⭐ THE CAUSE. A closed vocabulary, enforced below.
ALTER TABLE txn_messages
    ADD COLUMN IF NOT EXISTS empty_turn_cause text;

DO $$
BEGIN
    -- ⭐⭐ PAIRED, so "classified" is never half-true. A classification with no cause would be the old
    -- ambiguity with a new name; a cause with no classification would be unfindable.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'txn_messages_empty_turn_ck') THEN
        ALTER TABLE txn_messages
            ADD CONSTRAINT txn_messages_empty_turn_ck
            CHECK ((empty_turn IS NULL     AND empty_turn_cause IS NULL)
                OR (empty_turn = 'empty_assistant_turn'
                    AND empty_turn_cause IN ('client_disconnect', 'generation_empty', 'provider_request_failed')));
    END IF;
END $$;

-- ⭐ Small and partial: the interesting rows are a handful out of thousands, and a full index on a column
-- that is NULL almost everywhere would be paid for on every insert for nothing.
CREATE INDEX IF NOT EXISTS txn_messages_empty_turn_idx
    ON txn_messages (empty_turn_cause, created_at DESC) WHERE empty_turn IS NOT NULL;

COMMIT;

-- ── VERIFICATION ────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    classified bigint;
    legacy_empty bigint;
BEGIN
    -- ⛔ NOT A FROZEN COUNT. 038's guard asserted 79 when the corpus was 81; the dreaming check asserted an
    -- absence a migration had already filled. ⭐ Assert the INVARIANT, not the tally.
    SELECT count(*) INTO classified FROM txn_messages WHERE empty_turn IS NOT NULL;
    IF classified > 0 THEN
        RAISE EXCEPTION '043: % row(s) already classified before the writer exists -- nothing should be', classified;
    END IF;

    SELECT count(*) INTO legacy_empty FROM txn_messages
     WHERE role = 'assistant' AND coalesce(length(content), 0) = 0;

    -- ⭐ The boundary is RECORDED rather than asserted: everything up to here was written by a seam that
    -- could not tell the two causes apart, whatever the count is by the time anyone reads this.
    RAISE NOTICE '043: empty_turn + empty_turn_cause live; % pre-existing empty assistant row(s) left UNTOUCHED and unclassified',
        legacy_empty;
END $$;
