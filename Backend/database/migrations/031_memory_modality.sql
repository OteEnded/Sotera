-- ⭐⭐⭐ 031 · MODALITY — *how was the source meant to be taken?* ⛔ The axis nothing else could supply.
--
-- Ote's ruling, 2026-08-26: *"I agree with the slot-level protection: figurative material should still be
-- retainable, but it must not be flattened into entity / attribute / value as though it were a literal
-- fact. Don't over-engineer act+term yet unless the current design genuinely needs it."*
--
-- ── ⭐⭐ WHY A SIXTH AXIS, WHEN FIVE ALREADY DESCRIBE EVERY ROW ────────────────────────────────────
-- `7d383ce3` = *"user's current goal: build Rome in one day"*, written 31 seconds after Ote said
-- *"yeah, i kinda want to build rome in one day so."* — a PROVERB. Every axis the store already has
-- returns a TRUE answer about that row:
--     provenance quoted (verified) · mechanism extraction · author account · subject Ote · scope room
-- ⇒ ⭐ the row is wrong on exactly ONE axis, and that axis did not exist. A vocabulary derivable from any
-- of the others would be a synonym, not an axis.
--
-- ── ⚠️⚠️ NULL IS THE HONEST RECORD, AND IT IS **NOT** `asserted` ──────────────────────────────────
-- No backfill, no default. Every existing row predates modality and there is no way to recover how a
-- statement was meant from a row that did not record it — inferring it from the text now would be exactly
-- the flattening this migration exists to stop, performed a second time and called a repair.
-- ⛔ A default of `asserted` would rebuild the bug silently on 92 rows. A default of anything else would
-- make a claim about material nobody has examined. ⇒ nullable, no default, and the CODE reads NULL as
-- "nobody said" (`normalizeModality` returns null, never a class).
--
-- ── ⭐⭐⭐ THE ONE RULE, AND IT IS A SHAPE RATHER THAN A CONVENTION ────────────────────────────────
-- A fact slot is `entity` + `attribute` + `value`, and **its attribute NAMES A CLAIM**. The extractor did
-- not merely record a sentence; it filled a field called `current goal`. **84 of 92 rows are slot-shaped**,
-- so that is the ordinary path. ⇒ a non-literal statement may be RETAINED and may NOT be SLOTTED:
--
--     CHECK (modality IS NULL OR modality = 'asserted'
--            OR (entity IS NULL AND attribute IS NULL AND value IS NULL))
--
-- ⛔ ENFORCED IN THE DATABASE, NOT ONLY IN THE STORE. The store gate is the loud, explaining half — it
-- refuses with a reason a human can read. This is the half that survives a writer nobody has written yet,
-- a maintenance script, and a hand-typed UPDATE at 3am. The same reasoning as `provenance <> 'quoted' OR
-- source_message_id IS NOT NULL` in 003.
--
-- ⛔⛔ WHAT THIS MIGRATION DOES NOT DO: it does not set a modality on any row, does not touch the Rome
-- rows, does not change retrieval, and does not alter confidence. 031 makes the axis EXPRESSIBLE.

SET search_path = persona_sotera, public;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE t.typname = 'memory_modality' AND n.nspname = 'persona_sotera') THEN
        CREATE TYPE memory_modality AS ENUM ('asserted','aspirational','figurative','reported','hypothetical');
    END IF;
END $$;

ALTER TABLE txn_memories ADD COLUMN IF NOT EXISTS modality memory_modality;

COMMENT ON COLUMN txn_memories.modality IS
 'How the SOURCE STATEMENT was meant to be taken: asserted | aspirational | figurative | reported | hypothetical. NULL means nobody recorded it -- the honest record of a period when we did not ask -- and readers must NEVER read NULL as "asserted". Independent of every other axis: a row can be provenance=quoted (he really said these words) and modality=figurative (he did not mean them literally) at the same time, which is exactly what 7d383ce3 is. Only an asserted (or unrecorded) statement may occupy a fact slot; see the txn_memories_modality_slot_ck constraint.';

-- ⭐ Reading BY modality is a real question — *"what has she stored that was never meant literally?"* —
-- and it is a small slice, so a partial index answers it without carrying the unrecorded rows.
CREATE INDEX IF NOT EXISTS txn_memories_modality_idx
  ON txn_memories (modality)
  WHERE modality IS NOT NULL;

-- ── ⭐⭐⭐ THE SLOT CONSTRAINT ─────────────────────────────────────────────────────────────────────
-- ⚠️ VALIDATED, NOT `NOT VALID`, and that is safe to assert rather than hope: every existing row has
-- `modality IS NULL`, so all 92 satisfy the first disjunct by construction. The DO block below PROVES
-- that before this runs, so a future store with real modality values cannot slip past it.
DO $$
DECLARE n_set int;
BEGIN
    SELECT count(*) INTO n_set FROM txn_memories WHERE modality IS NOT NULL;
    IF n_set > 0 THEN
        RAISE EXCEPTION '031: % row(s) already carry a modality -- this migration adds the axis and sets '
                        'NOTHING; a pre-existing value means something wrote one before the gate existed', n_set;
    END IF;
END $$;

ALTER TABLE txn_memories DROP CONSTRAINT IF EXISTS txn_memories_modality_slot_ck;
ALTER TABLE txn_memories ADD CONSTRAINT txn_memories_modality_slot_ck
    CHECK (modality IS NULL
           OR modality = 'asserted'
           OR (entity IS NULL AND attribute IS NULL AND value IS NULL));

-- ── ⛔ PROOF, NOT HOPE ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    n_col   int;
    n_ck    int;
    n_vals  int;
    n_set   int;
BEGIN
    SELECT count(*) INTO n_col FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'txn_memories' AND column_name = 'modality';
    IF n_col <> 1 THEN RAISE EXCEPTION '031: the modality column was not created'; END IF;

    SELECT count(*) INTO n_ck FROM pg_constraint
     WHERE conname = 'txn_memories_modality_slot_ck' AND convalidated;
    IF n_ck <> 1 THEN
        RAISE EXCEPTION '031: the slot constraint is missing or was not validated -- an unvalidated CHECK '
                        'binds nothing that is already wrong, and this one must bind everything';
    END IF;

    -- ⭐ The vocabulary is FIVE, and it is asserted so a later ALTER TYPE ... ADD VALUE is a visible act
    -- rather than a quiet widening of what may be stored.
    SELECT count(*) INTO n_vals FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'memory_modality';
    IF n_vals <> 5 THEN RAISE EXCEPTION '031: memory_modality has % values, expected 5', n_vals; END IF;

    -- ⛔⛔ AND THIS MIGRATION CLASSIFIED NOTHING. Ote reserved the reconciliation; inferring a modality
    -- from stored prose would be the original flattening, run a second time and called a repair.
    SELECT count(*) INTO n_set FROM txn_memories WHERE modality IS NOT NULL;
    IF n_set > 0 THEN RAISE EXCEPTION '031: % row(s) were classified -- this migration must classify none', n_set; END IF;
END $$;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────────────────────────
--   ALTER TABLE txn_memories DROP CONSTRAINT IF EXISTS txn_memories_modality_slot_ck;
--   DROP INDEX IF EXISTS txn_memories_modality_idx;
--   ALTER TABLE txn_memories DROP COLUMN IF EXISTS modality;
--   DROP TYPE IF EXISTS memory_modality;
