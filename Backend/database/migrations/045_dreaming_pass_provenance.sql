-- ⭐⭐⭐ 045 · TWO COLUMNS ON THE PASS LEDGER: what the look COST, and what TRIGGERED it.
--
-- ── ① `view_read_us` — SO O-iii.a IS MEASURED RATHER THAN ARGUED ─────────────────────────────────
--
-- ⚠️⚠️ UNIT CORRECTED WITHIN THIS BUILD, BEFORE ANY ROW CARRIED A VALUE. The first application of this
-- migration used `view_read_ms`, and an INTEGER MILLISECOND column cannot resolve the thing it exists to
-- measure: the read is 0.151 ms today, so every pass would have stored **0** until M grew past ~300 —
-- roughly 35 days at the measured 6.3 acts/day, which is precisely the observation window. A column that
-- reads as "not measured" for the whole period of interest is worse than no column.
-- ⇒ MICROSECONDS. ⭐ An integer is honest at this scale, and no float or rounding rule is needed.
-- ⓘ The `DROP COLUMN IF EXISTS` below makes this migration re-runnable from either state; nothing is
-- lost, because nothing ever wrote to the millisecond column.
-- Ote's ruling, 2026-09-02: *"For view_read_ms, continue measuring before using it to establish any
-- performance threshold. The 0.151 ms result is evidence, not yet a policy number."*
-- ⇒ this column exists to accumulate that evidence, one pass at a time. ⛔ It is NOT a threshold, and
-- nothing reads it to make a decision.
--
-- ⭐ It times the EXHAUSTIVE VIEW READ — the row fetch through `log_conversation_revisits ⋈
-- txn_conversations` — because that is the read whose cost the eventual view-vs-materialization
-- threshold is about. ⛔ Not the whole pass, not the count query, not the insert.
--
-- ⚠️ NULL-SAFE ON PURPOSE. 044's lesson, one migration old: **a CHECK constraint PASSES when its
-- expression evaluates to NULL.** `CHECK (view_read_us >= 0)` would therefore accept a NULL silently —
-- which is fine here only because NULL is legitimate (a pass that failed before timing anything). The
-- nullness is written EXPLICITLY anyway, so the constraint says what it means instead of relying on
-- three-valued logic to be read correctly by the next person.
--
-- ── ② `trigger_source` — ⭐⭐⭐ AND THIS COLUMN EXISTS BECAUSE ITS ABSENCE COST SOMETHING TODAY ────
-- While writing M1's red-proof register, a source-regex meant to prove a check could not write to this
-- ledger matched the host's own internal line and returned TRUE. The check then ran two REAL passes
-- against the live corpus and wrote **rolling_id 2 and 3** into the production series.
--
-- ⭐ Those two rows are ACCURATE — M=87, N=87, withheld=1, 6a, exhaustive; they are correct records of
-- looks that genuinely happened. ⛔ So they are NOT deleted: a record of an act that happened is not
-- retracted, and this arc's own rule is that rollback is deletion of a capability, never of evidence.
-- ⇒ ⭐⭐ THE DEFECT WAS NEVER THE ROWS. It was that **the ledger could not say what triggered a pass**,
-- so a check's pass and a cron's pass were indistinguishable after the fact.
--
-- ⓘ This is 042's lesson arriving on a second table: `log_conversation_revisits` needed exactly this
-- column for exactly this reason. And it is the harness-identity principle Ote ratified on 2026-09-02 —
-- *"explicit durable harness identity must be the safety boundary, never message count"* — reaching a
-- new ledger: ⭐ **the boundary is "write it, LABELLED", not "hope it never writes".**
--
-- ⛔⛔ AND IT IS `NOT NULL` HERE, which is where 042 was weaker than it read: 042's
-- `CHECK (trigger_source IN (...))` accepts a NULL for the three-valued-logic reason above, and is
-- covered only by an application guard. That parked defect is NOT touched by this migration — ⛔ a
-- different table, a separate hardening item, and Ote parked it deliberately. This table simply does
-- not repeat it.
--
-- ── ⚠️ THE BACKFILL IS AN INFERENCE, AND IT IS LABELLED AS ONE ───────────────────────────────────
-- The three existing rows predate the column, so their labels are asserted from KNOWN PROVENANCE, not
-- read from the data:
--   rolling_id 1 (2026-09-01 09:03Z) → 'manual'  — the M1 step-2 dry run, `test/pipeline/dreaming-m1-step2.mjs`
--   rolling_id 2, 3 (2026-09-02 15:53Z) → 'check' — the two passes described above
-- ⛔ `legacy` is deliberately NOT used for them: `legacy` means *"written before the column existed and
-- its trigger is unknown"*, and here the trigger IS known. Recording a known fact as unknown to make the
-- migration look tidier would be the opposite of what this column is for.
--
-- ── ⛔ WHAT THIS MIGRATION DOES NOT DO ───────────────────────────────────────────────────────────
-- ⛔ It does not enable Dreaming. `memory.dreamingEnabled` is still absent and is not created.
-- ⛔ It does not delete, rewrite or re-scope any pass row. ⛔ It does not touch `log_conversation_revisits`.
-- ⛔ It does not touch `56425175`, any embedding, any memory, or the dense-arm exclusion defect.
-- ⛔ It does not re-assert 034's "the ledger lands EMPTY" proof: there are three legitimate rows now, and
--    asserting that absence would go red against correct data — the dateless-absence mistake.

SET search_path = persona_sotera, public;

BEGIN;

-- ── ① THE COST OF A LOOK ─────────────────────────────────────────────────────────────────────────
-- ⚠️ The superseded millisecond column, removed. See the unit-correction note in the header.
ALTER TABLE log_dreaming_passes DROP COLUMN IF EXISTS view_read_ms;
ALTER TABLE log_dreaming_passes ADD COLUMN IF NOT EXISTS view_read_us integer;

ALTER TABLE log_dreaming_passes DROP CONSTRAINT IF EXISTS log_dreaming_passes_view_read_us_ck;
ALTER TABLE log_dreaming_passes
    ADD CONSTRAINT log_dreaming_passes_view_read_us_ck
    -- ⭐ Nullness FIRST and EXPLICIT, so no arm of this expression can evaluate to NULL.
    CHECK (view_read_us IS NULL OR view_read_us >= 0);

COMMENT ON COLUMN log_dreaming_passes.view_read_us IS
 'MICROSECONDS spent on the exhaustive VIEW READ of the act corpus (log_conversation_revisits joined to txn_conversations) -- the read whose cost the O-iii.a view-vs-materialization question is about. Microseconds, not milliseconds: the read measured 0.151 ms on 2026-09-02, so an integer millisecond column would have stored 0 for every pass until the corpus roughly quadrupled. Evidence accumulated per pass; NOT a threshold, and nothing reads it to decide anything. NULL when a pass failed before timing anything.';

-- ── ② WHAT TRIGGERED THE LOOK ────────────────────────────────────────────────────────────────────
ALTER TABLE log_dreaming_passes ADD COLUMN IF NOT EXISTS trigger_source text;

-- The backfill runs BEFORE the NOT NULL, because the constraint is the point and a defaulted column
-- would let a future writer omit the fact entirely.
UPDATE log_dreaming_passes SET trigger_source = 'manual'
 WHERE trigger_source IS NULL AND rolling_id = 1;
UPDATE log_dreaming_passes SET trigger_source = 'check'
 WHERE trigger_source IS NULL AND rolling_id IN (2, 3);
-- ⚠️ Any OTHER pre-existing row genuinely has an unknown trigger, and `legacy` is the honest word for it.
UPDATE log_dreaming_passes SET trigger_source = 'legacy' WHERE trigger_source IS NULL;

ALTER TABLE log_dreaming_passes DROP CONSTRAINT IF EXISTS log_dreaming_passes_trigger_source_ck;
ALTER TABLE log_dreaming_passes
    ADD CONSTRAINT log_dreaming_passes_trigger_source_ck
    CHECK (trigger_source IN ('cron', 'manual', 'check', 'legacy'));

-- ⛔⛔ NOT NULL — the half 042 could not enforce on its own table. A CHECK alone would admit a NULL.
ALTER TABLE log_dreaming_passes ALTER COLUMN trigger_source SET NOT NULL;

COMMENT ON COLUMN log_dreaming_passes.trigger_source IS
 'What triggered this pass: cron (the scheduled lane) / manual (a deliberate on-demand run) / check (a test harness) / legacy (written before this column existed, trigger unknown). NOT NULL and closed-vocabulary, because a ledger that cannot say what triggered a row cannot be stratified afterwards -- 042 needed this column on log_conversation_revisits for the same reason, and this table needed it within a day of existing. Rows 1-3 were backfilled from known provenance, not read from the data.';

-- ⭐ The O-iii.a series is read by trigger_source, so it gets an index rather than a filtered scan later.
CREATE INDEX IF NOT EXISTS log_dreaming_passes_trigger_idx
    ON log_dreaming_passes (trigger_source, created_at DESC);

COMMIT;

-- ── ⛔ PROOF, NOT HOPE — every guarantee this migration claims is ATTEMPTED ──────────────────────
-- ⭐ A constraint that has never refused anything is a constraint nobody has tested. Each attempt below
-- runs inside a subtransaction and is rolled back; the block RAISEs if any of them is ACCEPTED.
DO $$
DECLARE
    accepted   text := '';
    n_axes     int;
    n_stamped  int;
    n_null     int;
    n_labelled int;
BEGIN
    -- ① a negative cost is refused
    BEGIN
        INSERT INTO log_dreaming_passes (created_at, trigger_source, view_read_us)
        VALUES (now(), 'check', -1);
        accepted := accepted || ' [negative-view_read_us]';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- ② a NULL cost is ACCEPTED — legitimate for a pass that failed before timing anything
    BEGIN
        INSERT INTO log_dreaming_passes (created_at, trigger_source, view_read_us)
        VALUES (now(), 'check', NULL);
    EXCEPTION WHEN others THEN
        accepted := accepted || ' [REFUSED-A-LEGITIMATE-NULL-COST]';
    END;

    -- ③ ⛔ a MISSING trigger_source is refused — the half 042 could not enforce
    BEGIN
        INSERT INTO log_dreaming_passes (created_at) VALUES (now());
        accepted := accepted || ' [pass-with-no-trigger_source]';
    EXCEPTION WHEN not_null_violation THEN NULL;
    END;

    -- ④ ⛔ an explicit NULL trigger_source is refused too. ⭐ Attempted SEPARATELY from ③: omitting a
    -- column and writing NULL into it reach the constraint by different routes, and 044 was accepted by
    -- exactly the route nobody attempted.
    BEGIN
        INSERT INTO log_dreaming_passes (created_at, trigger_source) VALUES (now(), NULL);
        accepted := accepted || ' [explicit-null-trigger_source]';
    EXCEPTION WHEN not_null_violation THEN NULL;
    END;

    -- ⑤ ⛔ an invented trigger is refused — a closed vocabulary, enforced below the code
    BEGIN
        INSERT INTO log_dreaming_passes (created_at, trigger_source) VALUES (now(), 'zz_invented');
        accepted := accepted || ' [unknown-trigger_source]';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- ⑥ and every legitimate value is accepted — a guard that refuses everything is also broken
    BEGIN
        INSERT INTO log_dreaming_passes (created_at, trigger_source, view_read_us)
        VALUES (now(), 'cron', 0), (now(), 'manual', 1), (now(), 'check', 2), (now(), 'legacy', 3);
    EXCEPTION WHEN others THEN
        accepted := accepted || ' [REFUSED-A-VALID-TRIGGER]';
    END;

    -- ⛔ EVERY ATTEMPT ABOVE IS DISCARDED. This DO block must leave the ledger exactly as COMMIT left it.
    RAISE EXCEPTION 'ROLLBACK_MARKER:%', accepted;
EXCEPTION WHEN raise_exception THEN
    IF position('ROLLBACK_MARKER:' in SQLERRM) = 0 THEN RAISE; END IF;
    accepted := trim(replace(SQLERRM, 'ROLLBACK_MARKER:', ''));
    IF accepted <> '' THEN
        RAISE EXCEPTION '045: a guarantee this migration claims is not enforced --%', accepted;
    END IF;

    -- ── AND THE STANDING GUARDS 034 SET, RE-ASSERTED — adding a column is exactly when they break ──
    SELECT count(*) INTO n_stamped FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'log_dreaming_passes'
       AND (column_name ~* '^(e3|admissib|excluded)' OR column_name ~* 'admissible');
    IF n_stamped > 0 THEN
        RAISE EXCEPTION '045: the ledger gained % admissibility column(s) -- E3 is computed, never stamped', n_stamped;
    END IF;

    SELECT count(*) INTO n_axes FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'log_dreaming_passes'
       AND column_name IN ('run_state', 'outcome');
    IF n_axes <> 2 THEN
        RAISE EXCEPTION '045: run_state and outcome must both exist and stay separate -- found %', n_axes;
    END IF;

    SELECT count(*) INTO n_null FROM log_dreaming_passes WHERE trigger_source IS NULL;
    IF n_null > 0 THEN
        RAISE EXCEPTION '045: % pass row(s) still carry no trigger_source', n_null;
    END IF;

    SELECT count(*) INTO n_labelled FROM log_dreaming_passes WHERE trigger_source = 'legacy';
    RAISE NOTICE '045: view_read_us + trigger_source live. 6 attempted violations, all refused and rolled back. % row(s) labelled legacy (trigger genuinely unknown). Dreaming is NOT enabled.', n_labelled;
END $$;

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────────────────────────
--   ALTER TABLE persona_sotera.log_dreaming_passes DROP CONSTRAINT IF EXISTS log_dreaming_passes_trigger_source_ck;
--   ALTER TABLE persona_sotera.log_dreaming_passes DROP CONSTRAINT IF EXISTS log_dreaming_passes_view_read_us_ck;
--   DROP INDEX IF EXISTS persona_sotera.log_dreaming_passes_trigger_idx;
--   ALTER TABLE persona_sotera.log_dreaming_passes DROP COLUMN IF EXISTS trigger_source;
--   ALTER TABLE persona_sotera.log_dreaming_passes DROP COLUMN IF EXISTS view_read_us;
-- ⚠️ Dropping `trigger_source` would make a check's pass indistinguishable from Dreaming's again, which
-- is the state that produced this migration. ⛔ Prefer stopping the writer to dropping the column.
