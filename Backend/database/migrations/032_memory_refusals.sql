-- ⭐⭐⭐ 032 · A REFUSAL IS A RECORD, NOT A SILENCE. `log_memory_refusals`.
--
-- Ote, 2026-08-26: *"For each refusal, I want the system to tell us why it refused and where the
-- material should eventually belong, without pretending that destination already exists if it doesn't."*
-- And earlier, on the same principle: *"every refusal must be RECORDED, not silent."*
--
-- ── ⭐⭐ WHY THIS IS A TABLE AND NOT A LOG LINE ───────────────────────────────────────────────────
-- Three times this project has paid for an absence that looked like an answer: a 4-in-5 silent fact drop,
-- an empty scoped recall narrated as *"nothing has EVER been stored"*, and a decline record counted as a
-- memory. ⇒ ⛔ **a dropped observation and an observation that was never made must never look alike.**
-- A log line is discarded on the next restart; the refusals are the SPECIFICATION for OteRM, and they
-- have to accumulate somewhere a person can read them months later.
--
-- ── ⭐⭐⭐ AND IT PRESERVES THE MATERIAL, WHICH IS THE WHOLE POINT ────────────────────────────────
-- *"Figurative language → don't discard it; retain the evidence/prose."* This table holds the proposed
-- content and its source pointer, so a refusal LOSES NOTHING: what was refused is the property-shaped
-- representation, and the words survive here as well as in `txn_messages`.
--
-- ── ⭐ `destination_exists` IS A REAL COLUMN BECAUSE IT IS A REAL DISTINCTION ─────────────────────
-- `txn_intentions` EXISTS and extraction cannot reach it. A relationship store DOES NOT EXIST at all.
-- ⛔ Those are different facts. Collapsing them into "belongs elsewhere" would be exactly the pretending
-- Ote forbade, and would make the eventual OteRM scope unreadable from this table.
--
-- ── ⛔ LOOSE REFS, NO FOREIGN KEYS ───────────────────────────────────────────────────────────────
-- Same law as `log_disclosure_events` (014) and `log_tool_calls` (010): deleting a user, a room or a
-- conversation must DEGRADE this record, never delete the evidence that a refusal happened.

SET search_path = persona_sotera, public;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE t.typname = 'memory_refusal_class' AND n.nspname = 'persona_sotera') THEN
        CREATE TYPE memory_refusal_class AS ENUM (
            'intention-as-property',
            'relationship-as-property',
            'designation-without-established-subject',
            'relayed-speech-as-self-fact',
            'figurative-as-literal-property');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS log_memory_refusals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rolling_id          SERIAL UNIQUE,

    -- WHERE it was refused. Loose ref: the room may be deleted; the refusal still happened.
    user_id             UUID,
    persona             TEXT,

    -- ⭐ WHY. All three parts, because a refusal a human cannot act on is a silence with extra steps.
    refusal_class       memory_refusal_class NOT NULL,
    why                 TEXT NOT NULL,
    belongs_to          TEXT,                       -- the semantic destination, or NULL when there is none
    destination_exists  BOOLEAN NOT NULL,           -- ⭐ never inferred from `belongs_to` being non-null
    destination_note    TEXT,

    -- ⭐⭐ THE MATERIAL, PRESERVED. A refusal is not a deletion.
    proposed_content    TEXT NOT NULL,
    proposed_entity     TEXT,
    proposed_attribute  TEXT,
    proposed_value      TEXT,
    retain_as           TEXT,                       -- what should still be kept, and how

    -- Provenance of the attempt itself.
    source              TEXT,
    source_message_id   UUID,                       -- loose: the evidence outlives the conversation
    author              TEXT,
    declared_axes       JSONB,                      -- whatever the producer actually said, verbatim

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE log_memory_refusals IS
 'Append-only record of every durable write ordinary semantic memory REFUSED because it does not own that kind of material -- intentions, relationships, designations, relayed speech, and figurative statements proposed as literal properties. Holds the proposed material so a refusal loses nothing: what is refused is the property-shaped representation, never the words. destination_exists is a real column because "the store exists and nothing routes to it" (txn_intentions) and "no such store exists" (relationships) are different facts, and blurring them would make the eventual OteRM scope unreadable from here. Loose refs only.';
COMMENT ON COLUMN log_memory_refusals.destination_exists IS
 'Whether the destination named in belongs_to ACTUALLY EXISTS today. FALSE is the honest answer for a relationship: nothing owns it yet. TRUE with a destination_note is the answer for txn_intentions: it exists and extraction has no routing path to it. Never inferred from belongs_to being non-null.';
COMMENT ON COLUMN log_memory_refusals.proposed_content IS
 'The material that was refused, kept verbatim. A refusal is not a deletion -- this column is how "retain the evidence/prose" is satisfied even when nothing downstream re-reads it yet.';

CREATE INDEX IF NOT EXISTS log_memory_refusals_class_idx ON log_memory_refusals (refusal_class, created_at DESC);
CREATE INDEX IF NOT EXISTS log_memory_refusals_user_idx  ON log_memory_refusals (user_id, created_at DESC);
-- ⭐ The OteRM scoping question in one query: *what have we refused that has nowhere to go?*
CREATE INDEX IF NOT EXISTS log_memory_refusals_homeless_idx
  ON log_memory_refusals (created_at DESC) WHERE destination_exists = false;

-- ── ⛔ PROOF, NOT HOPE ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    n_cols int;
    n_fk   int;
    n_vals int;
BEGIN
    SELECT count(*) INTO n_cols FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'log_memory_refusals';
    IF n_cols < 18 THEN RAISE EXCEPTION '032: log_memory_refusals has only % columns', n_cols; END IF;

    -- ⛔ NO FOREIGN KEYS. Deleting a room must degrade the record, never erase that a refusal happened.
    SELECT count(*) INTO n_fk FROM information_schema.table_constraints
     WHERE table_schema = 'persona_sotera' AND table_name = 'log_memory_refusals'
       AND constraint_type = 'FOREIGN KEY';
    IF n_fk > 0 THEN
        RAISE EXCEPTION '032: log_memory_refusals has % foreign key(s) -- the evidence must outlive '
                        'every row it points at', n_fk;
    END IF;

    -- ⭐ Five classes, asserted, so a sixth is a visible act rather than a quiet widening.
    SELECT count(*) INTO n_vals FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'memory_refusal_class';
    IF n_vals <> 5 THEN RAISE EXCEPTION '032: memory_refusal_class has % values, expected 5', n_vals; END IF;
END $$;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS log_memory_refusals;
--   DROP TYPE  IF EXISTS memory_refusal_class;
