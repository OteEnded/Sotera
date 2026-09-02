-- ⭐⭐⭐ 046 · THE WARRANT — an EVIDENTIAL RECEIPT, and ⛔ NEVER a truth score. (M2-9, locked 2026-09-01)
--
-- ── ⭐⭐ WHAT A WARRANT ESTABLISHES ──────────────────────────────────────────────────────────────
-- Ote, ruling M2-8 and carried verbatim into M2-9:
--
--     "The evidence warrant proves **these roots actually contain the evidence I claim to have used**.
--      It does **not** prove the resulting value is **true or meaningful**... Dreaming does not get to
--      decide that its paraphrase is true merely because its citations verify."
--
-- ⇒ ⭐ it answers *did she really read this?* and ⛔ NEVER *is she right?*
--
-- ── ⛔⛔ WHICH IS WHY THERE IS NO CONFIDENCE COLUMN, AND WHY THAT IS STRUCTURAL ──────────────────
-- The conflation vector is A NUMBER. "7 independent roots" reads as a strength the moment it sits beside
-- a claim, and one tuning change later it is being compared against a threshold. ⇒ ⭐ a truth score is
-- made UNREPRESENTABLE here rather than merely unused: there is no `confidence`, no `score`, no
-- `strength`, no `certainty`, and the proof block below refuses to let one appear later.
--
-- ⚠️ The separation already ships elsewhere and is held BY DISUSE rather than by design:
-- `classifyCapture` returns `verified` and `confidence` as separate fields, and nothing in the codebase
-- reads `.verified` at all. ⭐ This table makes the separation structural for the one writer that would
-- most tempt someone to collapse it.
--
-- ── ⭐ WARRANTS ACCUMULATE — THEY ARE EVENTS, ⛔ NOT STATE ───────────────────────────────────────
-- Hence `log_` and hence ⛔ **no unique constraint on `memory_id`**. A second pass that re-warrants the
-- same claim ADDS a row; it does not overwrite the first. ⭐ The earlier warrant remains true about the
-- moment it was made, which is exactly what a record of an act is for.
--
-- ── ⭐⭐ `value_at_warrant` — SO A STALE WARRANT IS DETECTABLE ──────────────────────────────────
-- A warrant is about a SPECIFIC value. If the memory is later superseded, the warrant does not become
-- false — it becomes ⚠️ **about something that is no longer there**, and a reader must be able to tell.
-- ⛔ Without this column a warrant would silently appear to vouch for whatever the row says today, which
-- is the "synthesized memory outliving its evidence" defect with a new name.
--
-- ── ⛔ WHAT THIS MIGRATION DOES NOT DO ──────────────────────────────────────────────────────────
-- ⛔ It does not enable Dreaming, and it does not let M2 write commitments. Ote, 2026-09-03 (M2-12a):
--    *"Do not let M2 persist commitments into the live persona while P1 is observing."*
-- ⛔ It creates no memory, alters no memory, and touches no existing table.
-- ⛔ It does not make verification available to conflict resolution — ⭐ the locked pipeline is
--    **evidence → proposal + pointers → VERIFY → recall → kind precondition → conflict → plan →
--    persistence**, and verification is a gate IN FRONT of that pipeline, ⛔ never an input to it.

SET search_path = persona_sotera, public;

BEGIN;

CREATE TABLE IF NOT EXISTS log_memory_warrants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rolling_id        bigserial,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- ⭐ The claim this warrant is about. ⛔ NOT a foreign key on purpose: a warrant is a record of an act
  -- that happened, and it must survive its memory being hard-deleted rather than cascading away with it.
  memory_id         uuid NOT NULL,

  -- ⭐⭐ THE VALUE AS IT STOOD. A later supersession makes the mismatch VISIBLE instead of silent.
  value_at_warrant  text NOT NULL,

  -- ⭐ Which Dreaming pass produced it. Nullable, because a future non-Dreaming warrant is allowed and
  -- because persona-global can exist later WITHOUT changing the memory shape (M2-9's stated reason).
  pass_id           uuid,

  -- ⭐⭐ SELECTED / VERIFIED / DISCARDED — all three, because two of them are the interesting ones.
  -- ⛔ Recording only `verified` would hide that anything was ever discarded, and a proposal whose cites
  -- mostly failed verification is a different object from one whose cites all held.
  selected          integer NOT NULL CHECK (selected  >= 0),
  verified          integer NOT NULL CHECK (verified  >= 0),
  discarded         integer NOT NULL CHECK (discarded >= 0),

  -- ⛔ IDENTITIES ONLY, NEVER CONTENT. The roots that carried a verified span, named, never quoted.
  verified_roots    text[] NOT NULL DEFAULT '{}',

  -- ⛔⛔ THE RECOUNT CANNOT EXCEED THE PROPOSAL. `verified` is counted by the SYSTEM after discarding,
  -- so it is bounded above by what was offered. A row violating this would mean the count came from
  -- somewhere other than the verification, which is the one thing the recount exists to prevent.
  CONSTRAINT log_memory_warrants_recount_ck CHECK (verified <= selected),
  -- ⭐ And the arithmetic must close: everything selected was either verified or discarded.
  CONSTRAINT log_memory_warrants_arith_ck   CHECK (verified + discarded = selected)
);

COMMENT ON TABLE log_memory_warrants IS
 'One row per warrant: a receipt that the roots cited actually contain the evidence claimed. It answers "did she really read this?" and never "is she right?". There is deliberately NO confidence, score or strength column -- a truth score is made unrepresentable rather than merely unused, because a bare count reads as a strength the moment it sits beside a claim. Warrants ACCUMULATE (they are events, not state), so there is no unique constraint on memory_id. value_at_warrant is stored so a warrant left behind by a later supersession is DETECTABLE rather than silently vouching for whatever the row says today. Verification happens in front of the memory pipeline and is never an input to conflict resolution.';

COMMENT ON COLUMN log_memory_warrants.value_at_warrant IS
 'The memory value as it stood when the warrant was made. A warrant is about a SPECIFIC value; if the memory is later superseded the warrant does not become false, it becomes about something that is no longer there -- and a reader must be able to tell the difference.';

COMMENT ON COLUMN log_memory_warrants.discarded IS
 'How many proposed cites failed verification and were thrown away before the recount. Recorded because a proposal whose cites mostly failed is a different object from one whose cites all held, and storing only the survivors would hide that entirely.';

CREATE INDEX IF NOT EXISTS log_memory_warrants_memory_idx ON log_memory_warrants (memory_id, created_at DESC);

COMMIT;

-- ── ⛔ PROOF, NOT HOPE — every guarantee is ATTEMPTED and rolled back ────────────────────────────
DO $$
DECLARE
    accepted text := '';
    n_score  int;
    m        uuid := gen_random_uuid();
BEGIN
    -- ① a warrant with no claim is refused
    BEGIN
        INSERT INTO log_memory_warrants (value_at_warrant, selected, verified, discarded)
        VALUES ('x', 1, 1, 0);
        accepted := accepted || ' [warrant-with-no-memory_id]';
    EXCEPTION WHEN not_null_violation THEN NULL;
    END;

    -- ② a warrant that does not say WHICH VALUE it vouches for is refused
    BEGIN
        INSERT INTO log_memory_warrants (memory_id, selected, verified, discarded)
        VALUES (m, 1, 1, 0);
        accepted := accepted || ' [warrant-with-no-value_at_warrant]';
    EXCEPTION WHEN not_null_violation THEN NULL;
    END;

    -- ③ ⛔⛔ verified > selected is refused — the recount cannot exceed the proposal
    BEGIN
        INSERT INTO log_memory_warrants (memory_id, value_at_warrant, selected, verified, discarded)
        VALUES (m, 'x', 2, 3, 0);
        accepted := accepted || ' [verified-exceeds-selected]';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- ④ ⛔ and the arithmetic must close — a cite that vanished from both tallies is a lost fact
    BEGIN
        INSERT INTO log_memory_warrants (memory_id, value_at_warrant, selected, verified, discarded)
        VALUES (m, 'x', 5, 2, 1);
        accepted := accepted || ' [arithmetic-does-not-close]';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- ⑤ ⭐⭐ WARRANTS ACCUMULATE — two for one memory must BOTH be accepted (events, not state)
    BEGIN
        INSERT INTO log_memory_warrants (memory_id, value_at_warrant, selected, verified, discarded)
        VALUES (m, 'first value', 3, 2, 1), (m, 'second value', 2, 2, 0);
    EXCEPTION WHEN others THEN
        accepted := accepted || ' [REFUSED-A-SECOND-WARRANT-FOR-ONE-MEMORY]';
    END;

    RAISE EXCEPTION 'ROLLBACK_MARKER:%', accepted;
EXCEPTION WHEN raise_exception THEN
    IF position('ROLLBACK_MARKER:' in SQLERRM) = 0 THEN RAISE; END IF;
    accepted := trim(replace(SQLERRM, 'ROLLBACK_MARKER:', ''));
    IF accepted <> '' THEN
        RAISE EXCEPTION '046: a guarantee this migration claims is not enforced --%', accepted;
    END IF;

    -- ⛔⛔ AND THE ONE THAT MATTERS MOST: NO SCORE-SHAPED COLUMN MAY EXIST. If a later change adds one,
    -- this is where it fails -- the warrant would have become a confidence signal, which is the exact
    -- conflation M2-9 was locked to prevent.
    SELECT count(*) INTO n_score FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'log_memory_warrants'
       AND column_name ~* 'confidence|score|strength|certainty|probability|weight';
    IF n_score > 0 THEN
        RAISE EXCEPTION '046: the warrant gained % score-shaped column(s) -- it is an evidential receipt, never a truth score', n_score;
    END IF;

    RAISE NOTICE '046: warrant ledger created. 4 violations refused, accumulation accepted, no score column exists. M2 may NOT write commitments (M2-12a).';
END $$;

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────────────────────────
--   DROP INDEX IF EXISTS persona_sotera.log_memory_warrants_memory_idx;
--   DROP TABLE IF EXISTS persona_sotera.log_memory_warrants;
-- ⭐ Safe while empty. ⚠️ Once warrants exist they are records of verification acts that happened, and
-- the honest move is to stop writing them rather than to delete the evidence.
