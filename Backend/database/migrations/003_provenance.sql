-- =====================================================================================
-- Sotera — migration 003: PROVENANCE on the live memory table.  [R1] + [R5]
--
-- ✅ APPLIED 2026-08-12 (Ote's call: "delta now"). Additive and reversible; see §3 to undo.
--
-- Context, continuing 002's: 001_core.sql is the SPEC — a hand-built schema with the memory findings
-- baked in — and it is not what runs. OLS's 35 Sequelize models landed their own shape, so the live
-- `txn_memories` is OLS's, and 001 became a document. 002 expressed part of the spec as a diff against
-- what is actually there. This is the next such diff, and it carries exactly two of the nine
-- requirements — the two RFC_MEMORY_AS_COMPONENT step 6 is about.
--
--   [R1]  Provenance is a first-class column with real classes — quoted · elicited · synthesized ·
--         observed. A synthesized memory must never be indistinguishable from a quoted one.
--   [R5]  Confidence must survive contradiction — reconcile against the source text, or the number
--         is decoration.
--
-- THE MEASURED FAILURES (ANALYSIS_MEMORY_FINDINGS_FOR_SOTERA §2.1, §3a):
--   · The store tagged a DIRECT QUOTE and a MODEL-SYNTHESIZED INTERPRETATION identically
--     (`source: model-tool`). Of four semantic memories only one traced to a real user statement.
--   · "user's location status: stayed in Bangkok" was stored at confidence 0.85 — from a message
--     saying he was dragged UP for a week and just stayed. He had moved to Chiang Mai. The extractor
--     recorded the city he LEFT as the city he stayed in, and gave it 0.85.
--
-- =====================================================================================
-- §0 — WHAT THIS DELIBERATELY DOES NOT DO, AND WHY
--
-- ⚠️ NOT `NOT NULL`. 002's §0 is the reason and it applies unchanged: a blanket constraint run over
-- rows nobody has classified turns "we do not know how this was learned" into a migration failure, or
-- worse into a default that LIES. Every existing row predates provenance, and there is no way to
-- recover from the outside whether a 2026-08 row was quoted or inferred — the information was never
-- captured. So the column is nullable, NULL means exactly "predates provenance", and the CODE reads a
-- missing value as `synthesized` (normalizeProvenance) — the weakest class, never the strongest.
-- Tightening to NOT NULL is a later migration, after new writes have populated it and any surviving
-- legacy rows have been aged out or classified by hand.
--
-- ⚠️ NO BACKFILL. Guessing a class for old rows is the very defect this exists to stop: an inference
-- wearing a quotation's authority. NULL is the honest record of a period when we did not ask.
--
-- ⚠️ NOT the `state`/`visibility`/`agreements`/`event_at` half of 001. Those are separate requirements
-- ([R2], [R3], [R6]) with their own consequences for every read path; bundling them into a migration
-- about provenance would make both harder to review and impossible to revert independently.
-- =====================================================================================

-- ─────────────────────────────────────────────────────────────────────────────────────
-- §1 — THE TYPE
--
-- Same four classes and the same spelling as 001_core.sql, so the eventual reconciliation is a rename
-- of nothing. Guarded, because this file must be safe to run twice — a migration you are afraid to
-- re-run is a migration nobody runs.
-- ─────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'memory_provenance' AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE memory_provenance AS ENUM ('quoted', 'elicited', 'synthesized', 'observed');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- §2 — THE COLUMNS
--
-- `provenance`        [R1] how this belief came to be believed. NULL = predates this migration.
-- `last_verified_at`  [R5] when the claim was last checked AGAINST ITS OWN SOURCE. Null means never —
--                     which is the truth for everything written before today, and is why a confidence
--                     number alone was never enough to trust.
-- `contradicted_by`   [R5] the row that disputes this one. A contradiction that cannot name its
--                     opponent is a feeling; this makes it a fact you can follow.
-- ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE txn_memories ADD COLUMN IF NOT EXISTS provenance       memory_provenance;
ALTER TABLE txn_memories ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
ALTER TABLE txn_memories ADD COLUMN IF NOT EXISTS contradicted_by  UUID REFERENCES txn_memories(id) ON DELETE SET NULL;

-- [R1] A QUOTE THAT CANNOT PRODUCE THE MESSAGE IT CAME FROM IS NOT A QUOTE. 001_core.sql states this
-- as a CHECK and it survives the translation intact — the live table already has source_message_id, so
-- this constraint costs nothing and closes the exact hole that let a pattern impersonate a quotation.
--
-- ⚠️ NOT VALID, deliberately: it binds every future write immediately while leaving the pre-provenance
-- rows alone (they are all NULL provenance, so they pass anyway — but declaring intent explicitly beats
-- relying on that). VALIDATE it in the same migration that sets NOT NULL, once the table is clean.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'txn_memories_quoted_needs_source') THEN
    ALTER TABLE txn_memories
      ADD CONSTRAINT txn_memories_quoted_needs_source
      CHECK (provenance IS DISTINCT FROM 'quoted' OR source_message_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

-- Reading BY provenance is a real question — "what does she actually know from my own words?" — and it
-- is the query a memory viewer wants. Partial, because the archived rows are never the answer.
CREATE INDEX IF NOT EXISTS txn_memories_provenance_idx
  ON txn_memories (provenance)
  WHERE invalid_at IS NULL AND expired_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- §3 — TO REVERT
--
-- Additive only, so undoing is mechanical and loses nothing but the classifications themselves:
--
--   DROP INDEX IF EXISTS txn_memories_provenance_idx;
--   ALTER TABLE txn_memories DROP CONSTRAINT IF EXISTS txn_memories_quoted_needs_source;
--   ALTER TABLE txn_memories DROP COLUMN IF EXISTS contradicted_by;
--   ALTER TABLE txn_memories DROP COLUMN IF EXISTS last_verified_at;
--   ALTER TABLE txn_memories DROP COLUMN IF EXISTS provenance;
--   DROP TYPE IF EXISTS memory_provenance;
--
-- ⚠️ The model must be reverted with it (database/models/txn_memories.model.js). A model attribute
-- with no column behind it fails at the next SELECT, not at boot — which is the slowest possible way
-- to find out.
-- ─────────────────────────────────────────────────────────────────────────────────────
