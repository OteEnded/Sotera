-- ⭐⭐⭐ 036 · THE OCCASION IS AN EVENT, AND UNTIL NOW IT LEFT NO TRACE.
--
-- Ote, 2026-09-02: *"I want the three outcomes to become genuinely measurable: keep / decline / silence —
-- rather than treating silence as an invisible denominator."*
--
-- ── ⚠️⚠️ THE MEASURED GAP ────────────────────────────────────────────────────────────────────────
-- `retention-followthrough` fires, offers two doors, and records NOTHING about the firing itself. Only
-- the resulting tool call lands in `log_tool_calls` — so a firing that ends in prose leaves **no row
-- anywhere**, and the denominator is invisible.
--
-- ⭐ The cost, measured on 2026-09-02: the whole mechanism read as *"6 keeps, 0 declines"* — which looked
-- like a mechanism that always keeps. Reconstructing the denominator by REPLAYING the pure gate over 152
-- stored turns gave ~23 occasions ⇒ roughly 17 firings produced no tool call at all. ⇒ the real shape is
-- *"it produces silence about three times in four"*, which is a different finding with a different
-- meaning, and it was only recoverable because the gate happens to be pure. ⛔ That is luck, not design.
--
-- ⚠️ AND THE TRIGGER WAS NOT RECORDED EITHER. The route logs `ft.why` on the SKIP branch only; on the
-- FIRE branch it logs a field that `runFollowThrough` sets only when it does NOT run. ⇒ keep-vs-decline
-- could not be attributed to `stated-a-decision` (she had already decided) versus
-- `durable-self-observation` (the architecture supplied the occasion) — and that distinction is the whole
-- neutrality question.
--
-- ── ⭐⭐ WHY ITS OWN TABLE AND NOT A COLUMN ON SOMETHING ELSE ────────────────────────────────────
-- The four layers stay separate, and this is where two of them meet:
--     DECISION       hers                          ⛔ nothing here represents it
--     OCCASION       ⭐ THIS TABLE — a moment in which a decision could become an act
--     ACTION         `log_tool_calls` + the memory/declined row it produced
--     AUTHORIZATION  the retention layer, downstream and independent
-- ⛔ Folding the occasion into `log_tool_calls` would make it un-recordable in exactly the case that
-- matters — SILENCE, where no tool call exists to hang it on. ⓘ Same shape as `log_conversation_revisits`,
-- which is reflection's occasion log and likewise records passes that called nothing.
--
-- ⛔ THIS CHANGES NO BEHAVIOUR. Nothing reads it, nothing gates on it, and the writer is best-effort: a
-- failure to record an occasion must never fail the occasion.

SET search_path = persona_sotera, public;

BEGIN;

CREATE TABLE IF NOT EXISTS log_retention_occasions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rolling_id       bigserial,
    fired_at         timestamptz NOT NULL DEFAULT now(),
    conversation_id  uuid,
    message_id       uuid,
    user_id          uuid,
    -- ⭐ WHICH TRIGGER. The neutrality question is unanswerable without it: a keep after
    -- `stated-a-decision` is the occasion doing its job; a keep after `durable-self-observation` is the
    -- one that needs explaining.
    why              text NOT NULL,
    -- ⭐ WHOSE SENTENCE was quoted into the frame. `true` = the person's, `false` = hers. Recorded rather
    -- than derived from `why`, because they are two facts and a future trigger could pair them
    -- differently.
    from_user        boolean NOT NULL DEFAULT false,
    -- ⭐⭐⭐ THE THREE OUTCOMES, PLUS THE TWO WAYS THE MOMENT CAN FAIL TO HAPPEN AT ALL.
    -- ⛔ `silence` is a FIRST-CLASS OUTCOME here, not a missing row — that is the entire point of 036.
    outcome          text NOT NULL,
    tools_called     text[],
    -- ⭐ WHAT SHE SAID INTO THE MOMENT. Without it, `silence` cannot be told apart from "she declined in
    -- prose", "she misread the frame" and "the step never reached her" — three findings that call for
    -- three different fixes. ⓘ The call site already logged this to an EPHEMERAL log for that reason.
    said             text,
    error            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT log_retention_occasions_outcome_ck
        CHECK (outcome IN ('keep', 'decline', 'both', 'silence', 'error', 'not-run'))
);

COMMENT ON TABLE log_retention_occasions IS
    'One row per retention-follow-through FIRING -- the OCCASION layer, distinct from the ACTION layer in '
    'log_tool_calls. Records the trigger (why), whose sentence was quoted (from_user) and which of the '
    'three outcomes happened (keep / decline / silence). Silence is a first-class outcome: before 036 a '
    'firing that ended in prose left no row anywhere, so the denominator was invisible and the mechanism '
    'read as "always keeps" when it was in fact silent ~3 times in 4. Nothing reads this table and nothing '
    'gates on it -- it is observability, and its writer is best-effort by construction.';

COMMENT ON COLUMN log_retention_occasions.why IS
    'The trigger: stated-a-decision (she had already decided) or durable-self-observation (the person said '
    'something about her). The neutrality question is which outcomes follow which trigger.';

COMMENT ON COLUMN log_retention_occasions.outcome IS
    'keep | decline | both | silence | error | not-run. silence = the occasion ran and she called no tool.';

CREATE INDEX IF NOT EXISTS log_retention_occasions_fired_idx ON log_retention_occasions (fired_at DESC);
CREATE INDEX IF NOT EXISTS log_retention_occasions_why_idx ON log_retention_occasions (why, outcome);

-- ── ⚠️⚠️ AND WHICH DOORS WERE ACTUALLY OFFERED — added after the Stage A red-proof ───────────────
-- ⭐ Removing `decline_to_remember` from the offered set and re-running Stage A recorded the firing as
-- **`silence`**. ⇒ ⛔ A DOOR THAT WAS NEVER OPENED IS INDISTINGUISHABLE FROM A CHOICE NOT TO WALK THROUGH
-- IT — which is the exact ambiguity this table exists to end, surviving in its own last corner.
-- ⓘ The historical record has the same hole: "0 declines, much silence" cannot by itself rule out
-- firings where the decline door was not on the table.
-- ⇒ record what was OFFERED, not only what was CALLED. Two facts, two columns.
ALTER TABLE log_retention_occasions ADD COLUMN IF NOT EXISTS tools_offered text[];

COMMENT ON COLUMN log_retention_occasions.tools_offered IS
    'Which doors were actually installed and offered at this firing. Recorded because a missing door and '
    'a deliberate silence are otherwise the same row -- demonstrated by removing the decline door and '
    'watching the outcome record as silence.';

COMMIT;

-- ⭐ PROOF GUARDS. A migration that silently did nothing is worse than one that failed.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'persona_sotera' AND table_name = 'log_retention_occasions') THEN
        RAISE EXCEPTION '036: log_retention_occasions was not created';
    END IF;

    -- ⛔ SILENCE MUST BE EXPRESSIBLE. If the CHECK ever loses it, the table stops answering the one
    -- question it was built for.
    BEGIN
        INSERT INTO log_retention_occasions (why, outcome) VALUES ('zz_migration_probe', 'silence');
        DELETE FROM log_retention_occasions WHERE why = 'zz_migration_probe';
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION '036: a silence outcome could not be recorded -- %', SQLERRM;
    END;

    -- ⛔ AND AN UNKNOWN OUTCOME MUST BE REFUSED, or the vocabulary is decorative.
    BEGIN
        INSERT INTO log_retention_occasions (why, outcome) VALUES ('zz_migration_probe', 'whatever');
        DELETE FROM log_retention_occasions WHERE why = 'zz_migration_probe';
        RAISE EXCEPTION '036: the outcome CHECK accepted an unknown value';
    EXCEPTION WHEN check_violation THEN
        NULL; -- ⭐ expected
    END;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'persona_sotera' AND table_name = 'log_retention_occasions'
                      AND column_name = 'tools_offered') THEN
        RAISE EXCEPTION '036: tools_offered was not created -- a missing door would read as silence';
    END IF;

    -- ⛔ THE REFLECTION CORPUS IS UNTOUCHED. 036 adds an occasion log for the CHAT follow-through and
    -- must not have altered generation-3 observation data in any way.
    IF (SELECT count(*) FROM log_conversation_revisits WHERE prompt_generation = 3) <> 77 THEN
        RAISE EXCEPTION '036: the generation-3 reflection corpus changed -- it must stay at 77 rows';
    END IF;
END $$;
