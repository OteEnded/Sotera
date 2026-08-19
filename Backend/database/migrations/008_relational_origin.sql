-- 008 — distinguish an OBSERVED practice from an INSTRUCTED one.
--
-- ⭐ REQUIRED BY T1 (`note_own_practice`), and it is the anti-backdoor mechanism, not bookkeeping.
--
-- Ote, 2026-08-19: *"A deliberate correction from a person should be allowed to become a self-practice
-- memory without waiting for the frequency floor… I do NOT want this to become a backdoor around the
-- memory architecture."*
--
-- Those two sentences only coexist if the two paths are **distinguishable after the fact**:
--
--   · `observed`   — inferred by the subject-side abstractor. Requires FREQUENCY_FLOOR (3) conversations.
--   · `instructed` — a person explicitly told her about her own practice. Recorded immediately, count 1.
--
-- Without this column an instructed row is indistinguishable from an observed one, the floor's guarantee
-- becomes unverifiable, and "did anything bypass the floor?" is unanswerable. **The floor is only
-- meaningful if the exception is labelled.**
--
-- ⛔ SCOPE. One column on one table. No content, no ids, no free text — `origin` is an enum of two
-- values. Nothing else is touched: not `user_id`, not `txn_memories`, not migrations 001–003 (still
-- quarantined), not the label enum.
--
-- ⚠️ ON CONFLICT INTERACTION: `instructed` is STICKY. If a label was once explicitly stated by a person,
-- a later observed re-derivation must not quietly downgrade it to inference — a human saying it is
-- stronger evidence, not weaker. The writer's upsert implements `instructed OR instructed`.
--
-- Apply: PGOPTIONS='-c search_path=persona_sotera,public' psql … -f 008_relational_origin.sql

SET search_path = persona_sotera, public;

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE t.typname = 'relational_origin' AND n.nspname = 'persona_sotera') THEN
        CREATE TYPE relational_origin AS ENUM ('observed', 'instructed');
    END IF;
END $$;

-- DEFAULT 'observed': every row that already exists came from the abstractor, so backfilling them as
-- observed is the truthful value rather than a convenient one.
ALTER TABLE txn_relational_records
    ADD COLUMN IF NOT EXISTS origin relational_origin NOT NULL DEFAULT 'observed';

COMMENT ON COLUMN txn_relational_records.origin IS
 'How this practice was learned. observed = inferred by the subject-side abstractor, and required FREQUENCY_FLOOR conversations. instructed = a person explicitly stated it about her practice, recorded immediately. The column exists so the floor''s guarantee stays auditable: without it, a bypass is invisible. instructed is sticky across re-derivation.';

-- ⭐ Prove the state rather than trusting a clean exit.
DO $$
DECLARE n BIGINT; bad BIGINT;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE origin IS NULL) INTO n, bad FROM txn_relational_records;
    IF bad > 0 THEN RAISE EXCEPTION 'origin is NULL on % row(s)', bad; END IF;
    RAISE NOTICE '008: origin added — % existing row(s) backfilled as observed', n;
END $$;

COMMIT;
