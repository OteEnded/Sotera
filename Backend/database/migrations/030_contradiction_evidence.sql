-- ⭐⭐⭐ 030 · A CONTRADICTION CAN NAME ITS EVIDENCE. ⛔ `contradicted_by` has never been written: 0 of 92.
--
-- Ote, 2026-08-26: *"The retrieval-trace-based correction candidate mechanism and the contradicted_by
-- write path, but don't actually reconcile the Rome memories yet."*
--
-- ── ⭐⭐ THE MEASURED FAILURE THIS EXISTS FOR ──────────────────────────────────────────────────────
-- `7d383ce3` — *"user's current goal: build Rome in one day"* — was repudiated in conversation on
-- 2026-08-09, twenty minutes after it was written, and again explicitly on 2026-08-25:
--     *"Rome is not a project name, but a คำเปรียบเทียบ that i use"*
-- ⛔ It is STILL LIVE seventeen days later. `invalid_at` is null, nothing is marked, and the column built
-- for exactly this — `contradicted_by`, added by migration 003 — has never been written on any row.
-- ⇒ ⭐ **the pipeline captures assertions and silently drops retractions.** Not because it decided not to
-- record one, but because no path to record one was ever built.
--
-- ── ⚠️⚠️ WHY A NEW COLUMN RATHER THAN USING THE ONE THAT EXISTS ────────────────────────────────────
-- `contradicted_by UUID REFERENCES txn_memories(id)` can only ever point at ANOTHER MEMORY. But the thing
-- that contradicted Rome is not a memory — it is a MESSAGE Ote sent. Storing a memory id there would mean
-- minting an interpretation and then letting that interpretation invalidate an observation, which inverts
-- the authority this whole arc has been defending: a stored belief must never outrank what someone said.
--
--   `contradicted_by`             ⭐ UNCHANGED — a later MEMORY that disputes this one (still unwritten)
--   `contradicted_by_message_id`  ⭐ THIS MIGRATION — the MESSAGE that repudiated it. Evidence, not verdict.
--   `contradicted_at`             ⭐ THIS MIGRATION — when the contradiction was recorded
--
-- ⛔ TWO QUESTIONS, TWO COLUMNS. That is the single law this week produced: `user_id` carried owner AND
-- scope, `author` was decided by infrastructure instead of by her, `source_message_id` was asked to be
-- both when-written and what-it-rests-on. Every one of them looked like a small nullable convenience.
--
-- ── ⛔ NO FOREIGN KEY ON THE MESSAGE REF, DELIBERATELY ─────────────────────────────────────────────
-- Same rule as `log_disclosure_events` (014): the evidence must outlive the row it points at. Deleting a
-- conversation must DEGRADE the record — "we know this was contradicted, we can no longer show you where"
-- — never delete the fact that a correction happened. A cascade here would let a routine cleanup erase
-- the only trace that she was ever told she was wrong.
--
-- ── ⛔⛔ WHAT THIS MIGRATION DOES **NOT** DECIDE ───────────────────────────────────────────────────
-- ⛔ It does not touch a single existing row. `contradicted_at` is NULL on all 92 and stays that way.
-- ⛔ It does not change retrieval. Whether a contradicted memory stays retrievable with its
--    contradiction attached, or is excluded from normal recall, is Ote's decision B and is UNMADE. This
--    migration only makes the state RECORDABLE; nothing reads it to filter yet.
-- ⛔ It does not touch the Rome rows, the three lineage rows, or anything in `56425175`.

SET search_path = persona_sotera, public;

-- ── THE COLUMNS ───────────────────────────────────────────────────────────────────────────────────
-- Both nullable with no default: NULL means "no contradiction has been recorded", which is true of every
-- row today and must stay distinguishable from "checked and found consistent". ⛔ A default here would
-- manufacture a claim about 92 rows nobody has examined.
ALTER TABLE txn_memories ADD COLUMN IF NOT EXISTS contradicted_by_message_id UUID;
ALTER TABLE txn_memories ADD COLUMN IF NOT EXISTS contradicted_at            TIMESTAMPTZ;

COMMENT ON COLUMN txn_memories.contradicted_by_message_id IS
 'The MESSAGE that repudiated this memory -- evidence a reader can go and look at, not a verdict. Loose ref on purpose (no FK): deleting a conversation degrades this record to "contradicted, source no longer available" rather than erasing the fact that a correction happened. Distinct from contradicted_by, which names a MEMORY that disputes this one; a stored interpretation must never be able to invalidate an observation.';
COMMENT ON COLUMN txn_memories.contradicted_at IS
 'When a contradiction was RECORDED against this memory. NULL means none has been -- which is not the same as "checked and found consistent", and the two must never collapse. Independent of invalid_at: contradicted means superseded-in-meaning and is still readable AS a contradicted row; invalid_at means replaced. Whether recall filters on this is an open decision as of migration 030 -- nothing reads it yet.';

-- ⭐ Reading BY contradiction is a real question — *"what have I been told I was wrong about?"* — and it
-- is a small slice of the table, so a partial index answers it without carrying the other 92 rows.
CREATE INDEX IF NOT EXISTS txn_memories_contradicted_idx
  ON txn_memories (contradicted_at)
  WHERE contradicted_at IS NOT NULL;

-- ── ⛔ PROOF, NOT HOPE ────────────────────────────────────────────────────────────────────────────
-- Every migration in this project proves its own postcondition. A migration that runs green while doing
-- nothing is how 56 scripts once connected to a database that existed but was no longer live.
DO $$
DECLARE
    n_cols   int;
    n_marked int;
    n_fk     int;
BEGIN
    SELECT count(*) INTO n_cols FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'txn_memories'
       AND column_name IN ('contradicted_by_message_id', 'contradicted_at');
    IF n_cols <> 2 THEN
        RAISE EXCEPTION '030: expected both contradiction columns, found %', n_cols;
    END IF;

    -- ⛔⛔ THE INVARIANT OTE ASKED FOR IN WORDS: *"don''t actually reconcile the Rome memories yet."*
    -- If this migration has marked ANY row, it has made a semantic decision that was reserved.
    SELECT count(*) INTO n_marked FROM txn_memories
     WHERE contradicted_at IS NOT NULL OR contradicted_by_message_id IS NOT NULL;
    IF n_marked > 0 THEN
        RAISE EXCEPTION '030: % row(s) already marked contradicted -- this migration must add the '
                        'capability and mark NOTHING; reconciliation is a separate, approved act', n_marked;
    END IF;

    -- ⛔ AND THE EVIDENCE REF MUST STAY LOOSE. A FK added later "for tidiness" would turn a conversation
    -- cleanup into the deletion of the only record that a correction ever happened.
    SELECT count(*) INTO n_fk
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
     WHERE tc.table_schema = 'persona_sotera' AND tc.table_name = 'txn_memories'
       AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'contradicted_by_message_id';
    IF n_fk > 0 THEN
        RAISE EXCEPTION '030: contradicted_by_message_id has a foreign key -- the evidence must outlive '
                        'the conversation it points at';
    END IF;
END $$;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────────────────────────
--   DROP INDEX IF EXISTS txn_memories_contradicted_idx;
--   ALTER TABLE txn_memories DROP COLUMN IF EXISTS contradicted_at;
--   ALTER TABLE txn_memories DROP COLUMN IF EXISTS contradicted_by_message_id;
