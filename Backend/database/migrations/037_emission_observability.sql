-- ⭐⭐⭐ 037 · `silence` WAS THREE STATES WEARING ONE NAME.
--
-- Ote, 2026-09-02, after the Stage B repeat: *"The P2 repeat establishes that a correct decision can exist
-- without a corresponding action. That means we should not treat tools_called=[] as 'no decision'."*
--
-- ── ⚠️⚠️ THE TWO MEASURED DEFECTS THIS CLOSES ───────────────────────────────────────────────────
--
-- ① `outcomeOf()` READ TOOL NAMES, NEVER RESULTS. A `keep` that was REFUSED still recorded
--    `outcome = 'keep'`. ⓘ Stage A §6 is the proof: the keep was refused for an undeclared owner, the
--    decline succeeded, and the row said **`both`** — which there meant *"two doors were named"*, ⛔ not
--    *"two acts completed"*. ⇒ the instrument conflated ATTEMPTED with EFFECTED.
--
-- ② A DECISION EMITTED AS PROSE RECORDED AS `silence`. Measured live: handed her own phrase, she reasoned
--    to a correct decline and then **wrote the tool call as text** —
--        decline_to_remember / about: … / kind: not_worth_keeping
--    ⛔ no dispatch, no row, and the occasion said `silence`. ⭐ The same input on the next run produced a
--    proper structured call, so the DECISION was stable and only the EMISSION varied.
--
-- ⇒ ⭐⭐⭐ THE LAYER THIS MAKES VISIBLE:  DECISION → **EMISSION** → ACTION.
--    ⛔ Before 037 the store could only see the first and the last, and reported their disagreement as
--    silence.
--
-- ⛔ THIS CHANGES NO DISPATCH BEHAVIOUR. Prose is OBSERVED and ⛔ NEVER executed — Ote: *"Observe only;
-- never dispatch prose as a tool call"* and *"I want observability first, not a clever recovery
-- mechanism."* Nothing here recovers anything.

SET search_path = persona_sotera, public;

BEGIN;

-- ⭐ WHAT WAS ACTUALLY EFFECTED, beside what was attempted. `tools_called` stays as-is and keeps meaning
-- ATTEMPTED, so a keep that succeeded next to a decline that was refused is now fully readable:
--   tools_called = {keep,decline_to_remember} · tools_effected = {keep} · outcome = keep
ALTER TABLE log_retention_occasions ADD COLUMN IF NOT EXISTS tools_effected text[];

COMMENT ON COLUMN log_retention_occasions.tools_effected IS
    'Which of the attempted calls actually SUCCEEDED. tools_called is what she reached for; this is what '
    'happened. Before 037 outcome was derived from names alone, so a refused keep recorded as a keep.';

-- ⭐⭐ DID SHE NAME A DOOR IN PROSE WITHOUT WALKING THROUGH IT? Stored rather than derived at read time,
-- so the classification cannot drift between queries. ⓘ The raw `said` is KEPT beside it for audit — this
-- is an index into the evidence, ⛔ never a replacement for it.
ALTER TABLE log_retention_occasions ADD COLUMN IF NOT EXISTS said_names_tool boolean;

COMMENT ON COLUMN log_retention_occasions.said_names_tool IS
    'True when no tool was called AND her text names one of the doors that were offered -- a decision '
    'expressed in prose. Deterministic, computed from said + tools_offered. Observation only: prose is '
    'never dispatched.';

-- ── ⭐⭐⭐ THE VOCABULARY, NOW ONE NAME PER STATE ────────────────────────────────────────────────
--   keep / decline / both  ⇒ EFFECTED, not merely attempted
--   refused                ⇒ ⭐ she called something and NOTHING succeeded   (was: reported as keep/decline)
--   prose                  ⇒ ⭐⭐ she decided and named a door in text        (was: reported as silence)
--   silence                ⇒ ⭐ she called nothing and named nothing         (now it means only this)
--   error / not-run        ⇒ the moment failed, or never happened
ALTER TABLE log_retention_occasions DROP CONSTRAINT IF EXISTS log_retention_occasions_outcome_ck;
ALTER TABLE log_retention_occasions ADD CONSTRAINT log_retention_occasions_outcome_ck
    CHECK (outcome IN ('keep', 'decline', 'both', 'refused', 'prose', 'silence', 'error', 'not-run'));

COMMENT ON COLUMN log_retention_occasions.outcome IS
    'What was EFFECTED. keep|decline|both = that act succeeded. refused = calls were made and none '
    'succeeded. prose = no call, but her text named an offered door -- a decision that did not become an '
    'action. silence = no call and no door named. error|not-run = the moment failed or never happened. '
    'Before 037 this was derived from tool NAMES, so refused and prose were both invisible.';

COMMIT;

-- ⭐ PROOF GUARDS.
DO $$
BEGIN
    FOR i IN 1..1 LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'persona_sotera' AND table_name = 'log_retention_occasions'
                          AND column_name = 'tools_effected') THEN
            RAISE EXCEPTION '037: tools_effected was not created';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'persona_sotera' AND table_name = 'log_retention_occasions'
                          AND column_name = 'said_names_tool') THEN
            RAISE EXCEPTION '037: said_names_tool was not created';
        END IF;
    END LOOP;

    -- ⭐⭐ THE TWO NEW STATES MUST BE EXPRESSIBLE — they are the entire point of 037.
    BEGIN
        INSERT INTO log_retention_occasions (why, outcome) VALUES ('zz_probe_037', 'prose');
        INSERT INTO log_retention_occasions (why, outcome) VALUES ('zz_probe_037', 'refused');
        DELETE FROM log_retention_occasions WHERE why = 'zz_probe_037';
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION '037: the new outcome states could not be recorded -- %', SQLERRM;
    END;

    -- ⛔ AND THE OLD ONES MUST SURVIVE. Widening a vocabulary must not quietly drop a member.
    BEGIN
        INSERT INTO log_retention_occasions (why, outcome) VALUES ('zz_probe_037', 'silence');
        INSERT INTO log_retention_occasions (why, outcome) VALUES ('zz_probe_037', 'both');
        DELETE FROM log_retention_occasions WHERE why = 'zz_probe_037';
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION '037: an existing outcome state was lost -- %', SQLERRM;
    END;

    -- ⛔ THE REFLECTION CORPUS IS UNTOUCHED, as in 036.
    IF (SELECT count(*) FROM log_conversation_revisits WHERE prompt_generation = 3) <> 77 THEN
        RAISE EXCEPTION '037: the generation-3 reflection corpus changed -- it must stay at 77 rows';
    END IF;
END $$;
