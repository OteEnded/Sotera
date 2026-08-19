-- =====================================================================================
-- Sotera — migration 004: PERSON as the SUBJECT dimension.
--
-- ⏳ NOT YET APPLIED. Additive, nullable, reversible; see §5 to undo.
--
-- Continues 002/003's pattern: 001_core.sql is the SPEC and is not what runs, so this is another diff
-- against the live shape.
--
-- WHAT THIS IS FOR (RFC_PERSON_VS_ACCOUNT §0):
--
--     Sotera owns the memory → the memory has a SUBJECT → visibility decides who may receive it.
--
-- Three questions were collapsed into one column. `user_id` was answering "whose store is this in",
-- "who is this about", and "who may see it" simultaneously. This migration separates exactly ONE of
-- them — the SUBJECT — and deliberately leaves the other two alone.
--
-- THE MEASURED STATE THAT FORCED IT:
--   · `SELF_ENTITY = 'user'` (memory-observation.js:51). In the current vocabulary "self" means the
--     HUMAN speaking, so a memory like "I tend to over-explain unless I check first" is not merely
--     unwritten — it is UNSAYABLE. There is no token for Sotera as a subject.
--   · `entity` values ever written to this store: 'user' and NULL. It is a subject slot that was never
--     populated with a subject.
--   · `kind='identity'` rows: 0. `user_id IS NULL` (persona-global) rows: 0. The mechanism for her own
--     memory exists in the port and has never been used.
--   · The model already worked around the gap in prose:
--         "User (Hermes) keeps a windowsill herb notebook with basil, mint, and a stubborn rosemary."
--     It wrote the person's name into the CONTENT because there was nowhere else to put it.
--
-- =====================================================================================
-- §0 — WHAT THIS DELIBERATELY DOES NOT DO
--
-- ⚠️ IT DOES NOT TOUCH VISIBILITY. `user_id` remains the enforced access boundary, unchanged, on every
--    table. Ote, 2026-08-18: "Keep the existing user_id visibility boundary intact until we
--    deliberately design and test a subject/participant-based visibility model." Moving a visibility
--    rule is not a refactor — getting it wrong leaks one person's private facts to another, and that
--    boundary is live across 15 accounts on OteLLMServices.
--
-- ⚠️ IT DOES NOT MAKE `subject_person_id` A SYNONYM FOR `user_id`. They are independently
--    representable ON PURPOSE, and §4's invariants assert it. A row may have a subject with no account
--    (someone Ote mentions), or a subject that is Sotera herself (no account at all, ever).
--
-- ⚠️ IT DOES NOT INFER OR MERGE IDENTITIES. The backfill is 1:1 per account and nothing else. No
--    matching on display name, email, or writing style. Two accounts held by the same human stay two
--    persons until a human explicitly links them. This is the same gate as a rename: perception may be
--    fuzzy, adoption may not.
--
-- ⚠️ IT DOES NOT CREATE RELATIONSHIP, PARTICIPANTS, OR ANYTHING FOR OteRM.
--
-- ⚠️ IT DOES NOT BACKFILL WHAT IT CANNOT KNOW. Rows whose `entity` is NULL get a NULL subject. NULL is
--    the honest record of "we did not know", exactly as 003 left provenance un-backfilled. The one such
--    row in this store is the Hermes herb note, whose subject is named only inside its prose — and
--    parsing a subject out of free text is precisely the inference this migration refuses to do.
--
-- =====================================================================================
-- §1 — mst_persons: the subject
--
-- `kind` exists because Ote's framing is deliberately symmetrical — "Sotera herself is a persistent
-- Persona, conceptually a person-like entity, so the model may need to be more symmetrical than
-- 'users own personas'." Sotera is therefore a ROW here, not a special case bolted onto every query.
-- A persona row is NEVER linked from mst_users: she is not an account holder.

CREATE TABLE IF NOT EXISTS mst_persons (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind          text NOT NULL DEFAULT 'human',
    display_name  text,
    -- Free-text, deliberately: how this person came to be known. Not an enum, because the useful
    -- answers ("Ote created them", "mentioned in conversation 3f2a", "migrated 1:1 from account")
    -- are not a vocabulary anyone can fix in advance.
    origin        text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mst_persons_kind_chk CHECK (kind IN ('human', 'persona'))
);

COMMENT ON TABLE  mst_persons IS 'WHO a memory is about. Independent of accounts: a person may have no account (someone merely mentioned), and a persona-kind person has no account by definition.';
COMMENT ON COLUMN mst_persons.kind IS 'human | persona. A persona row is Sotera herself as a SUBJECT — the fix for SELF_ENTITY being the string "user".';

-- =====================================================================================
-- §2 — the link from ACCOUNT to PERSON
--
-- Nullable on purpose. An account without a person is legal (a service account, a fresh signup before
-- anyone has been established); a person without an account is the whole point.

ALTER TABLE mst_users ADD COLUMN IF NOT EXISTS person_id uuid NULL REFERENCES mst_persons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS mst_users_person_idx ON mst_users (person_id) WHERE person_id IS NOT NULL;

COMMENT ON COLUMN mst_users.person_id IS 'Which human holds this login. Many accounts MAY point at one person, but only when a human explicitly establishes it — never inferred.';

-- =====================================================================================
-- §3 — the SUBJECT on the person-semantic tables
--
-- Named `subject_person_id`, not `person_id`. The name is load-bearing: `user_id` and a bare
-- `person_id` sitting side by side invite exactly the confusion this whole change exists to end.

ALTER TABLE txn_memories ADD COLUMN IF NOT EXISTS subject_person_id uuid NULL REFERENCES mst_persons(id) ON DELETE SET NULL;
ALTER TABLE mst_slots     ADD COLUMN IF NOT EXISTS subject_person_id uuid NULL REFERENCES mst_persons(id) ON DELETE SET NULL;

-- Partial: most rows are expected to carry a subject eventually, but the index only earns its keep for
-- "everything about this person", which is by definition the non-null case.
CREATE INDEX IF NOT EXISTS txn_memories_subject_idx ON txn_memories (subject_person_id, created_at DESC) WHERE subject_person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mst_slots_subject_idx    ON mst_slots (subject_person_id) WHERE subject_person_id IS NOT NULL;

COMMENT ON COLUMN txn_memories.subject_person_id IS 'WHO this belief is about. NOT ownership and NOT visibility — user_id still answers both of those. NULL = subject unknown, which is a real state and not a defect.';

-- txn_user_memories (pinned) is deliberately NOT given a subject: those rows are text the USER wrote
-- and pinned, not Sotera's belief about somebody. Its subject question is a different one and is not
-- answered here.

-- =====================================================================================
-- §4 — BACKFILL: only what is definitionally true
--
-- (a) one person per existing account, 1:1, no dedup of any kind
-- (b) accounts linked to their person
-- (c) Sotera's own person row
-- (d) subjects set ONLY where `entity = 'user'` — i.e. rows that already say "this is about the
--     account holder". Everything else stays NULL.

-- (a) + (b) — one person per account, linked as it is created.
--
-- A row-at-a-time loop rather than a set-based INSERT…RETURNING, because RETURNING cannot tell you
-- WHICH account each new person came from, and pairing them afterwards would mean matching on
-- display_name — which is (i) not unique and (ii) precisely the name-based inference this migration
-- refuses to do. At this scale the loop is auditable and the clever version would be wrong.
DO $$
DECLARE r record;
        pid uuid;
BEGIN
    FOR r IN SELECT id, username, display_name FROM mst_users WHERE person_id IS NULL LOOP
        INSERT INTO mst_persons (kind, display_name, origin)
        VALUES ('human', r.display_name, 'migration 004: 1:1 from account ' || r.username)
        RETURNING id INTO pid;
        UPDATE mst_users SET person_id = pid WHERE id = r.id;
    END LOOP;
END $$;

-- (c) Sotera herself, as a SUBJECT. No account, ever.
INSERT INTO mst_persons (kind, display_name, origin)
SELECT 'persona', 'Sotera', 'migration 004: the persona as a subject of her own memory'
WHERE NOT EXISTS (SELECT 1 FROM mst_persons WHERE kind = 'persona');

-- (d) subjects for rows that already declare they are about the account holder
UPDATE txn_memories m
   SET subject_person_id = u.person_id
  FROM mst_users u
 WHERE m.user_id = u.id
   AND m.entity = 'user'
   AND m.subject_person_id IS NULL
   AND u.person_id IS NOT NULL;

UPDATE mst_slots s
   SET subject_person_id = u.person_id
  FROM mst_users u
 WHERE s.user_id = u.id
   AND s.entity = 'user'
   AND s.subject_person_id IS NULL
   AND u.person_id IS NOT NULL;

-- =====================================================================================
-- §5 — REVERT
--
-- DROP INDEX IF EXISTS txn_memories_subject_idx;
-- DROP INDEX IF EXISTS mst_slots_subject_idx;
-- DROP INDEX IF EXISTS mst_users_person_idx;
-- ALTER TABLE txn_memories DROP COLUMN IF EXISTS subject_person_id;
-- ALTER TABLE mst_slots     DROP COLUMN IF EXISTS subject_person_id;
-- ALTER TABLE mst_users     DROP COLUMN IF EXISTS person_id;
-- DROP TABLE IF EXISTS mst_persons;
--
-- Nothing reads these columns yet, so a revert loses only the backfill — which is reproducible,
-- because it was derived and never inferred.
