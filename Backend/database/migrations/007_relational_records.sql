-- 007 — Sotera's relational knowledge: the third scope.
--
-- ⛔ NOT WIRED. Creating this table changes no behaviour: nothing reads it, nothing writes it, and the
-- Composer does not know it exists. Ote, 2026-08-19: *"turn the design into concrete schema/contracts
-- and tests, but don't wire it into normal production retrieval yet."*
--
-- ── WHAT THIS IS ───────────────────────────────────────────────────────────────────────────────────
-- The store has exactly two scopes today: `user_id = :u` (one account) and `user_id IS NULL` (EVERY
-- account — broadcast). Relational knowledge fits neither: it is not the asker's belief, and it must not
-- be readable by every stranger. This is the third: **owned by Sotera, about a person, disclosed by
-- posture.**
--
-- ⭐ THE PRIVACY GUARANTEES ARE IN THE SCHEMA, NOT IN PROSE:
--
--   1. THERE IS NO CONTENT COLUMN. Not "a content column we agree not to fill" — none exists. A record
--      cannot carry a quote, a paraphrase, or a sentence, because there is nowhere to put one.
--   2. THERE IS NO SOURCE-ID COLUMN. No message id, no memory id, no conversation id. Provenance is the
--      WINDOW it was derived over, not the rows. A field that exists will eventually be rendered.
--   3. `label` IS AN ENUM, not text. An unknown label is a TYPE ERROR at the database, not a validation
--      step someone can forget to call. The closed vocabulary is enforced by Postgres.
--   4. ⭐ `subject_person_id ... ON DELETE SET NULL` — DE-IDENTIFICATION IS THE SCHEMA'S BEHAVIOUR.
--      Deleting a person does NOT cascade-delete Sotera's learning; it detaches it. What made a record
--      *theirs* was the link, so the link is what goes: *"I bring evidence rather than summaries"*
--      survives as HER practice and stops being about them. He can be forgotten; she is not lobotomised.
--   5. The UNIQUE key makes writes CONVERGENT — re-deriving the same label for the same subject updates
--      in place. Idempotence is the store's guarantee, not the caller's.
--
-- ⚠️ TIER C ONLY. `relational_tier` has one value on purpose. Tier B (theme — what we worked on) is
-- designed in RFC_RELATIONAL_KNOWLEDGE_LIFECYCLE but says something about the OTHER person's activity,
-- and open question Q4 is unanswered. Adding it later is one ALTER TYPE, deliberately.
--
-- ⚠️ THE LABEL LIST MIRRORS `Backend/app/components/relational-taxonomy.js`. Two lists of the same thing
-- drift; a test asserts they are identical, in both directions.
--
-- Apply:  PGOPTIONS='-c search_path=persona_sotera,public' psql … -f 007_relational_records.sql

SET search_path = persona_sotera, public;

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE t.typname = 'relational_tier' AND n.nspname = 'persona_sotera') THEN
        CREATE TYPE relational_tier AS ENUM ('stance');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE t.typname = 'relational_label' AND n.nspname = 'persona_sotera') THEN
        CREATE TYPE relational_label AS ENUM (
            'i-bring-evidence-not-summaries',
            'i-verify-before-asserting',
            'i-flag-uncertainty-explicitly',
            'i-keep-answers-short',
            'i-give-full-detail',
            'i-lead-with-the-conclusion',
            'i-show-my-working',
            'i-ask-before-assuming',
            'i-avoid-hedging',
            'i-check-back-on-corrections'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS txn_relational_records (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ⭐ NULLABLE, and SET NULL on delete. This is de-identification, enforced by the database.
    subject_person_id  UUID             REFERENCES mst_persons(id) ON DELETE SET NULL,

    tier               relational_tier  NOT NULL,
    label              relational_label NOT NULL,   -- ⭐ enum, not text

    -- Support, not content: how many distinct conversations backed this, over what window.
    conversation_count INT              NOT NULL CHECK (conversation_count >= 1),
    window_start       DATE             NOT NULL,
    window_end         DATE             NOT NULL,
    CHECK (window_end >= window_start),

    -- Provenance = HOW it was derived, never WHAT FROM.
    derived_at         TIMESTAMPTZ      NOT NULL DEFAULT now(),
    deriver_version    TEXT             NOT NULL,
    taxonomy_version   TEXT             NOT NULL,

    created_at         TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ      NOT NULL DEFAULT now()
);

COMMENT ON TABLE txn_relational_records IS
 'Sotera''s own relational knowledge (tier C: her learned practice with a person). Owned by the persona, not by any account. NO content column and NO source ids EXIST, by design. subject_person_id is ON DELETE SET NULL so a person''s deletion de-identifies her learning rather than destroying it.';

-- Convergence: one live record per (subject, tier, label). Re-derivation updates in place.
-- ⚠️ Partial index: de-identified rows (subject NULL) are historical and may coexist freely.
CREATE UNIQUE INDEX IF NOT EXISTS txn_relational_records_subject_label_uniq
    ON txn_relational_records (subject_person_id, tier, label)
    WHERE subject_person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS txn_relational_records_subject_idx
    ON txn_relational_records (subject_person_id);

-- ⭐ PROVE THE SHAPE, do not infer it. A migration that "succeeds" while leaving a content column in
-- place would defeat the entire point of the table.
DO $$
DECLARE bad TEXT;
BEGIN
    SELECT string_agg(column_name, ', ') INTO bad
      FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'txn_relational_records'
       AND (column_name ILIKE '%content%' OR column_name ILIKE '%text%' OR column_name ILIKE '%excerpt%'
            OR column_name ILIKE '%message_id%' OR column_name ILIKE '%memory_id%' OR column_name ILIKE '%conversation_id%'
            OR column_name ILIKE '%source%');
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'txn_relational_records has forbidden column(s): % — this table must not be able to hold content or source references', bad;
    END IF;
    RAISE NOTICE '007: txn_relational_records created — no content column, no source ids, label is an enum';
END $$;

COMMIT;
