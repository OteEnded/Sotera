-- ⭐⭐⭐ 049 · THE FOUR AXES — occasion · reachability · provenance · (temporal is derived) — as independent columns.
--
-- `FINAL_SEMANTIC_REMEDIATION_ARCHITECTURE_V1.md` · `SPEC_SOTERA_PROVENANCE_AXES_IMPLEMENTATION.md` (representation A).
--
-- ⛔ A MIGRATION KNOWS NOTHING (047's rule). This lands MECHANISM only: no row is classified here, no act is
-- reconstructed, no `said` is withdrawn or granted. Every existing row keeps NULL on the new columns, which reads as
-- "not recorded" — the honest state until the AUDITED historical pass (`migrate-provenance-axes.mjs`) establishes what
-- can be established and leaves the rest unknown (M1–M7).
--
-- ── ⭐ WHY THESE SHAPES ─────────────────────────────────────────────────────────────────────────────────
--   OCCASION      (act_kind, act_id) — a POLYMORPHIC reference into the ledger that ALREADY identifies the act
--                 (a turn · a revisit · a dreaming pass · a job run · a label). ⛔ No FK: acts live in different tables
--                 (048 made the same choice for `declared_in_occasion`). Equality only.
--   REACHABILITY  explicit target columns, one CHECK per kind. States (readable · unreadable · destroyed ·
--                 never-recorded · unreviewed) are COMPUTED at read — they depend on the reader's scope and on what
--                 still exists, so storing them would be a copy that drifts.
--   PROVENANCE    a CHILD TABLE, 0..n rows. Speaker and date are NOT columns: they are resolved from the referenced
--                 turn at read time (`memory-lineage.js`: "pointers, never a second copy").
--   WRITER        the contract key, EXPLICIT — ⛔ never derived from `source`'s prefix, which cannot tell reflection's
--                 `retain` (source = model-tool) from a chat `remember_fact` (source = model-tool).
--
-- ── ⛔ WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────────────────────────────
--   `source_message_id` is untouched, unrenamed, still indexed. It keeps its de-facto meaning per writer and is read
--   only by legacy surfaces. Its readers move to the axes; the column does not change.

SET search_path = persona_sotera, public;

-- ══ 1 · OCCASION + WRITER + REACHABILITY on txn_memories ═══════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'enum_txn_memories_act_kind' AND n.nspname = current_schema()) THEN
    CREATE TYPE enum_txn_memories_act_kind AS ENUM ('turn', 'revisit', 'dreaming', 'job', 'operator', 'ingest', 'record', 'request');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'enum_txn_memories_reach_kind' AND n.nspname = current_schema()) THEN
    CREATE TYPE enum_txn_memories_reach_kind AS ENUM ('turn', 'range', 'document', 'none');
  END IF;
END $$;

ALTER TABLE txn_memories
  ADD COLUMN IF NOT EXISTS writer text,
  ADD COLUMN IF NOT EXISTS act_kind enum_txn_memories_act_kind,
  ADD COLUMN IF NOT EXISTS act_id text,
  ADD COLUMN IF NOT EXISTS reach_kind enum_txn_memories_reach_kind,
  ADD COLUMN IF NOT EXISTS reach_conversation_id uuid,
  ADD COLUMN IF NOT EXISTS reach_message_id uuid,
  ADD COLUMN IF NOT EXISTS reach_from_rolling_id integer,
  ADD COLUMN IF NOT EXISTS reach_to_rolling_id integer,
  ADD COLUMN IF NOT EXISTS reach_document text;

-- an act is (kind, id) or nothing — never half of one
ALTER TABLE txn_memories DROP CONSTRAINT IF EXISTS txn_memories_act_whole;
ALTER TABLE txn_memories ADD CONSTRAINT txn_memories_act_whole CHECK ((act_kind IS NULL) = (act_id IS NULL));

-- a reach's coordinates match its kind; NULL kind = not recorded, and then no coordinate may pretend otherwise
ALTER TABLE txn_memories DROP CONSTRAINT IF EXISTS txn_memories_reach_shape;
ALTER TABLE txn_memories ADD CONSTRAINT txn_memories_reach_shape CHECK (
  (reach_kind IS NULL AND reach_message_id IS NULL AND reach_from_rolling_id IS NULL AND reach_to_rolling_id IS NULL AND reach_document IS NULL)
  OR (reach_kind = 'turn' AND reach_message_id IS NOT NULL AND reach_from_rolling_id IS NULL AND reach_to_rolling_id IS NULL AND reach_document IS NULL)
  OR (reach_kind = 'range' AND reach_conversation_id IS NOT NULL AND reach_from_rolling_id IS NOT NULL AND reach_to_rolling_id IS NOT NULL
      AND reach_from_rolling_id <= reach_to_rolling_id AND reach_message_id IS NULL AND reach_document IS NULL)
  OR (reach_kind = 'document' AND reach_document IS NOT NULL AND reach_message_id IS NULL AND reach_conversation_id IS NULL
      AND reach_from_rolling_id IS NULL AND reach_to_rolling_id IS NULL)
  OR (reach_kind = 'none' AND reach_message_id IS NULL AND reach_conversation_id IS NULL AND reach_from_rolling_id IS NULL
      AND reach_to_rolling_id IS NULL AND reach_document IS NULL)
);

CREATE INDEX IF NOT EXISTS txn_memories_act_idx ON txn_memories (act_kind, act_id);
CREATE INDEX IF NOT EXISTS txn_memories_reach_conversation_idx ON txn_memories (reach_conversation_id);
CREATE INDEX IF NOT EXISTS txn_memories_writer_idx ON txn_memories (writer);

-- ══ 2 · PROVENANCE — txn_memory_evidence ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'enum_txn_memory_evidence_ref_kind' AND n.nspname = current_schema()) THEN
    CREATE TYPE enum_txn_memory_evidence_ref_kind AS ENUM ('turn', 'memory', 'document', 'record');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'enum_txn_memory_evidence_credential' AND n.nspname = current_schema()) THEN
    CREATE TYPE enum_txn_memory_evidence_credential AS ENUM ('quoted', 'elicited', 'synthesized', 'observed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS txn_memory_evidence (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rolling_id    bigserial NOT NULL,
  memory_id     uuid NOT NULL REFERENCES txn_memories(id) ON DELETE CASCADE,
  ref_kind      enum_txn_memory_evidence_ref_kind NOT NULL,       -- ⭐ REFERENCE_KIND — deliberately not "basis"
  target        text NOT NULL,                                     -- message uuid · memory uuid · path@commit · record id
  span          text,                                              -- the verbatim span, when one was cited/verified
  credential    enum_txn_memory_evidence_credential,               -- ⛔ meaningful only ON a reference (F10)
  established   boolean NOT NULL,
  verification  jsonb NOT NULL,                                    -- { how, reason? } — a FAILED citation stays (I10)
  act_kind      enum_txn_memories_act_kind,                        -- the act that recorded the reference
  act_id        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT txn_memory_evidence_act_whole CHECK ((act_kind IS NULL) = (act_id IS NULL))
);
CREATE INDEX IF NOT EXISTS txn_memory_evidence_memory_idx ON txn_memory_evidence (memory_id);
CREATE INDEX IF NOT EXISTS txn_memory_evidence_target_idx ON txn_memory_evidence (ref_kind, target);

-- ══ 3 · THE ACT ON REFUSALS, AUDIT ROWS, RETENTION DECISIONS ═══════════════════════════════════════════
ALTER TABLE log_memory_refusals
  ADD COLUMN IF NOT EXISTS act_kind enum_txn_memories_act_kind,
  ADD COLUMN IF NOT EXISTS act_id text;
ALTER TABLE log_memory_changes
  ADD COLUMN IF NOT EXISTS act_kind enum_txn_memories_act_kind,
  ADD COLUMN IF NOT EXISTS act_id text;
ALTER TABLE log_retention_decisions
  ADD COLUMN IF NOT EXISTS act_kind enum_txn_memories_act_kind,
  ADD COLUMN IF NOT EXISTS act_id text;
