-- ⭐⭐⭐ 034 · THE DREAMING PASS LEDGER — an EXECUTION ledger for a LOOK.
--
-- ── ⭐⭐ WHY IT EXISTS (O-4) ──────────────────────────────────────────────────────────────────────
-- The five Dreaming outcomes split on whether they have a SUBJECT:
--     6a (the withheld set) · 6b · 6c (a formulated claim)   → they have one
--     6d (nothing durable)  · 6e (cannot establish what was examined) → ⛔ they have NONE
-- ⇒ 6d and 6e cannot be recorded as a CLAIM. They can be recorded as an EVENT, because
--
--     ⭐⭐⭐ A PASS HAS AN IDENTITY EVEN WHEN ITS CONCLUSION HAS NO SUBJECT.
--
-- Reflection's own ledger already manages exactly this — it records "a pass ran and concluded nothing"
-- 72 times, keyed on (conversation, range). ⇒ what Dreaming lacked was an EXECUTION LEDGER, ⛔ not an
-- outcome store, and ⛔ not a place to put commitments.
--
-- ── ⛔⛔ THE DEFECT IT MUST NOT INHERIT ───────────────────────────────────────────────────────────
-- `log_conversation_revisits.outcome` answers *"did the run finish?"* — `completed` 77 / `failed` 1 —
-- and 72 of the 77 `completed` acts wrote nothing. ⇒ 93.5% of every act ever recorded collapses into one
-- undifferentiated value, and a reader cannot tell "there was nothing" from "it was not worth it" from
-- "I was not allowed to look".
-- ⇒ ⭐ HERE, EXECUTION AND CONCLUSION ARE SEPARATE COLUMNS. `run_state` says whether the run finished;
-- `outcome` says what it concluded; ⛔ neither is ever inferred from the other.
--
-- ── ⭐⭐ THE ORDERING CONSTRAINT, IN THE SCHEMA ───────────────────────────────────────────────────
-- `withheld_count` sits beside `m_count` because **M = admitted + withheld**. A ledger that recorded only
-- what it admitted would make **6a** (*material exists and I am not allowed to use it*) indistinguishable
-- from **6d** (*no durable material exists*) — the exact collapse the five outcomes exist to prevent, and
-- the one this project has now paid for three times under other names.
--
-- ── ⛔ WHAT THIS TABLE IS NOT ────────────────────────────────────────────────────────────────────
-- ⛔ Not a memory. Nothing here is returned by a memory read, injected into recall, or counted toward
--    what she remembers — the `sotera.declined` lesson (#111) applies to every row in it.
-- ⛔ Not an admissibility store. There is deliberately NO E3 column: **E3 is computed at read time**,
--    because exclusion is reversible and because stamping the answer onto an act record would mutate an
--    audit record.
-- ⛔ Not a commitment. A pass records that a LOOK happened; a commitment is a different act with a
--    different home, and M1 cannot make one.
--
-- ── ⛔⛔ WHAT THIS MIGRATION DOES NOT DO ─────────────────────────────────────────────────────────
-- ⛔ It does not enable Dreaming. `memory.dreamingEnabled` does not exist and is not created.
-- ⛔ It does not wire a cron entry, a route, or any code path. Nothing in the running app reads or
--    writes this table.
-- ⛔ It does not exclude, delete, reconcile or repair anything.

SET search_path = persona_sotera, public;

CREATE TABLE IF NOT EXISTS log_dreaming_passes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rolling_id               bigserial,
  created_at               timestamptz NOT NULL DEFAULT now(),
  started_at               timestamptz,
  completed_at             timestamptz,
  -- ⭐ EXECUTION. NULL means IN FLIGHT.
  run_state                text CHECK (run_state IN ('ran','failed','preempted')),
  failure                  text,
  -- ⭐ CONCLUSION. Exactly one of 6a-6e, and NULL while in flight or when the run failed:
  -- ⛔ a failed run did not conclude anything, and must never read as though it had.
  outcome                  text CHECK (outcome IN ('6a','6b','6c','6d','6e')),
  outcome_why              text,
  -- ⭐⭐ THE COMPLETENESS CONTRACT: exhaustive iff N >= M, else bounded(N of M), N unavailable => unknown.
  m_count                  integer,
  n_count                  integer,
  withheld_count           integer,
  completeness             text CHECK (completeness IN ('exhaustive','bounded','unknown')),
  -- ⭐ E3 IS NOT STABLE ACROSS READS — exclusion is reversible, so M is a function of time and the
  -- moment it was evaluated is part of the record.
  eligibility_evaluated_at timestamptz,
  -- ⭐ The boundary as it stood, so a later reader can still tell a 6a from a 6d after a release.
  boundary                 jsonb,
  -- ⛔ IDENTITIES ONLY, NEVER CONTENT. A rejected item is NAMED, never quoted.
  rejected_ids             text[]
);

COMMENT ON TABLE log_dreaming_passes IS
 'One row per Dreaming PASS. An execution ledger, not an outcome store and not a commitment: a pass has an identity even when its conclusion has no subject, which is the only reason 6d and 6e can be recorded at all. run_state says whether the run finished; outcome says what it concluded; they are separate columns because the reflection ledger conflated them and 93.5% of its acts collapsed into one value. No admissibility flag lives here -- E3 is computed at read time, because exclusion is reversible and stamping it would mutate an audit record. Nothing in this table is a memory, is returned by a memory read, or counts toward anything she remembers.';

COMMENT ON COLUMN log_dreaming_passes.withheld_count IS
 'How many of M the boundary refused. Recorded BESIDE m_count because M = admitted + withheld: a ledger that stored only what it admitted would make 6a ("material exists and I am not allowed to use it") indistinguishable from 6d ("no durable material exists"), which is the collapse the five outcomes exist to prevent.';

COMMENT ON COLUMN log_dreaming_passes.run_state IS
 'Did the RUN finish -- ran / failed / preempted. NULL means in flight. Deliberately NOT the conclusion: outcome answers what the act CONCLUDED, and a failed run concluded nothing.';

-- ⭐ Reading a pass by when it happened is the only access pattern M1 has, and passes are few.
CREATE INDEX IF NOT EXISTS log_dreaming_passes_created_idx ON log_dreaming_passes (created_at DESC);

-- ── ⛔ PROOF, NOT HOPE ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    n_rows      int;
    n_stamped   int;
    n_axes      int;
BEGIN
    -- ⛔⛔ IT RAN NOTHING. A migration that quietly recorded a pass would be inventing evidence.
    SELECT count(*) INTO n_rows FROM log_dreaming_passes;
    IF n_rows <> 0 THEN
        RAISE EXCEPTION '034: the pass ledger must land EMPTY -- found % row(s)', n_rows;
    END IF;

    -- ⛔ NO ADMISSIBILITY COLUMN. E3 is computed at read time; a stored flag would be wrong the moment an
    -- exclusion is released, with nothing to go back and correct it.
    SELECT count(*) INTO n_stamped FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'log_dreaming_passes'
       AND (column_name ~* '^(e3|admissib|excluded)' OR column_name ~* 'admissible');
    IF n_stamped > 0 THEN
        RAISE EXCEPTION '034: the ledger carries % admissibility column(s) -- E3 is computed, never stamped', n_stamped;
    END IF;

    -- ⭐⭐ EXECUTION AND CONCLUSION MUST BE TWO COLUMNS. If a later change ever folds them together, this
    -- is where it fails -- the same guard 033 put on incognito vs excluded_from_evidence_at.
    SELECT count(*) INTO n_axes FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'log_dreaming_passes'
       AND column_name IN ('run_state', 'outcome');
    IF n_axes <> 2 THEN
        RAISE EXCEPTION '034: run_state and outcome must both exist and stay separate -- found %', n_axes;
    END IF;

    -- ⛔ AND DREAMING IS NOT ENABLED BY THIS. The capability lands; every use of it is a separate,
    -- deliberate act -- the same discipline 033 held to.
    RAISE NOTICE '034: pass ledger created, empty, with execution and conclusion on separate axes. Dreaming is NOT enabled.';
END $$;

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────────────────────────
--   DROP INDEX IF EXISTS persona_sotera.log_dreaming_passes_created_idx;
--   DROP TABLE IF EXISTS persona_sotera.log_dreaming_passes;
-- ⭐ Rollback is DELETION, never repair: M1 writes no commitments, so there is nothing to un-write.
-- ⚠️ But a pass row is a record of an act that HAPPENED. If M1 is abandoned, the honest move is to keep
-- the table and stop writing to it -- ⛔ not to delete the evidence that a look occurred.
