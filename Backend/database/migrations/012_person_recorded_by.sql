-- 012 — WHO RECORDED THIS PERSON. One additive, nullable column.
--
-- ⚠️ THIS IS A CONSEQUENCE OF FIXING 004's MODEL BINDING, not new feature work.
--
-- `proposePerson`'s collision report was querying an empty `public.mst_persons` for months (see
-- migration 011). Pointing it at the real table restored the report — and would have shipped a
-- cross-person existence oracle, so the report is now scoped to *people the asker can already be said to
-- know*: their own person, plus anyone who is the subject of a memory in their own scope.
--
-- That scoping has a hole, found by `person-proposal-check` refusing to pass:
--
--     she records "Priya" for Kavi  →  Priya is nobody's memory subject yet
--     next turn she proposes "Priya" again  →  no collision reported  →  A DUPLICATE ROW
--
-- The missing fact is simply **which account recorded this person**. Without it, "people I know about"
-- cannot include "people I myself wrote down", which is the most obvious member of that set.
--
-- ⭐ AND IT IS THE COLUMN THE ROOMS MODEL NEEDS ANYWAY. Under `RFC_SOTERA_ROOMS_AND_DISCLOSURE`, a person
-- mentioned in `Ote_Finance` is known *in that room*. "Who recorded them" is precisely the disclosure key
-- for a person record, exactly as `user_id` is for a memory. This column makes that expressible instead
-- of derivable-by-string-matching on `origin` (which is free text, and matching it would be the
-- keyed-on-words defect again).
--
-- ⛔ SCOPE. One nullable column, one index, no backfill, no FK, no behaviour change to anything that does
-- not read it. NULL means "recorded before this column existed, or by the platform" — the five rows from
-- migration 004 came from a 1:1 account migration and belong to nobody in particular.
--
-- ── LOOSE REF, DELIBERATELY ────────────────────────────────────────────────────────────────────────
-- No foreign key. A person must outlive the account that recorded them: Ote mentioning a colleague
-- creates a person who has nothing to do with the account's lifetime, and deleting the account must not
-- delete the human. Same reasoning as every `log_` table.
--
-- Apply:  node test/maintenance/apply-migration.mjs 012_person_recorded_by.sql

SET search_path = persona_sotera, public;

BEGIN;

ALTER TABLE mst_persons
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID;

COMMENT ON COLUMN mst_persons.created_by_user_id IS
 'Which ACCOUNT recorded this person, or NULL when the platform did (e.g. the 1:1 migration in 004). Loose ref on purpose — a person outlives the account that wrote them down. This is the disclosure key for a person record: "people I know about" includes the people I recorded, which is what makes the scoped collision report in proposePerson correct without turning it into a cross-account existence oracle.';

CREATE INDEX IF NOT EXISTS mst_persons_created_by_idx ON mst_persons (created_by_user_id);

-- ⭐ Prove the shape, and prove the NON-change: no existing row was touched.
DO $$
DECLARE total BIGINT; attributed BIGINT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'persona_sotera' AND table_name = 'mst_persons'
                      AND column_name = 'created_by_user_id') THEN
        RAISE EXCEPTION '012: created_by_user_id was not added';
    END IF;
    -- No FK, by design (see header). Assert that, so a well-meaning future migration cannot add one
    -- without noticing this decision.
    IF EXISTS (SELECT 1 FROM pg_constraint c
                JOIN pg_class t ON t.oid = c.conrelid
                JOIN pg_namespace n ON n.oid = t.relnamespace
               WHERE n.nspname = 'persona_sotera' AND t.relname = 'mst_persons'
                 AND c.contype = 'f' AND pg_get_constraintdef(c.oid) ILIKE '%created_by_user_id%') THEN
        RAISE EXCEPTION '012: created_by_user_id must NOT have a foreign key — a person outlives the account that recorded them';
    END IF;
    SELECT count(*), count(created_by_user_id) INTO total, attributed FROM mst_persons;
    RAISE NOTICE '012: created_by_user_id added — % existing person row(s), % attributed (expected 0: no backfill)', total, attributed;
END $$;

COMMIT;
