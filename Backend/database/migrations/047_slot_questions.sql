-- ⭐⭐⭐ 047 · KIND IS THE QUESTION A SLOT ASKS. (M2-10 + M2-11, locked)
--
-- ── ⭐⭐⭐ THE REFRAMING, AND IT CAME FROM A MEASURED FAILURE ────────────────────────────────────
-- Ote: *"Kind is the QUESTION a slot asks, ⛔ not the datatype of its value."*
--
-- ⚠️⚠️ THAT WORDING IS NOT A PREFERENCE — two mechanical alternatives were tried and BOTH failed for the
-- SAME reason. A surface test over all 70 live addressed values produced **3 clear false positives**
-- (⚠️ including `project-decision/todo-rail-deferred` = `deferred`, the best-formed value in the store)
-- and **5+ clear false negatives** (⚠️ `creation_date` holds a 215-character paragraph where the answer
-- is a DATE). ⇒ ⛔ `string|enum|number` AND a text classifier both fail because **each presupposes the
-- question is already known.**
--
-- ⇒ ⭐ so the question is DECLARED by something that actually knows it, ⛔ never inferred from values,
-- ⛔ never guessed by a classifier, and ⛔ never backfilled.
--
-- ── ⭐⭐ THE TWO-LAYER MODEL (locked) ────────────────────────────────────────────────────────────
--
--     mst_slot_questions   a SUBJECT-FREE definition   -- "what does a valid answer to this look like?"
--     mst_slots.question_id  a ROOM-SCOPED instance    -- "this room's slot asks that question"
--
-- ⭐ Ote's reason, verbatim: *"I still want Sotera to eventually be genuinely Sotera... but ⛔ I don't
-- want to achieve that by weakening room disclosure rules. **A subject-free definition is a much cleaner
-- global object.**"* ⇒ the DEFINITION can be persona-global without any room learning anything about
-- another room, because it contains no subject, no value and no room.
--
-- ── ⛔ MINTING ≠ DECLARING, AND A DECLARATION IS IMMUTABLE ──────────────────────────────────────
-- A slot comes into existence when something addresses it (minting). Saying what a valid answer looks
-- like is a SEPARATE act by something that knows the question (declaring). ⭐ A declaration is
-- immutable: a change is **a new definition plus a repointing**, ⛔ never an edit — because editing one
-- would silently re-interpret every memory already written under it.
-- ⛔ Existing memories are NEVER re-validated, and ⛔ warrants are untouched: a warrant establishes
-- evidence provenance, ⛔ not answer validity.
--
-- ── ⛔ UNKNOWN ⇒ DEFER, PERMANENTLY ─────────────────────────────────────────────────────────────
-- `question_id` is NULLABLE and stays NULL for every slot nobody has declared. ⓘ Measured 2026-09-03:
-- 55 of 125 live memories carry a `slot_id` at all ⇒ most writes will DEFER. ⭐ That cost is the ruling
-- working; the alternative is guessing, and guessing is what produced the `Cogito` defect.
--
-- ── ⛔ WHAT THIS MIGRATION DOES NOT DO ──────────────────────────────────────────────────────────
-- ⛔ No backfill. ⛔ No inference. ⛔ No classifier. ⛔ No existing row is re-validated or rewritten.
-- ⛔ It declares NOTHING: the table lands EMPTY, because declaring a question is an act by something
--    that knows it, and a migration knows nothing.
-- ⛔ It does not let M2 write commitments (M2-12a).

SET search_path = persona_sotera, public;

BEGIN;

CREATE TABLE IF NOT EXISTS mst_slot_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- ⭐⭐ THE STABLE NAME OF A QUESTION. ⛔ Subject-free by construction: no entity, no room, no value.
  -- "what is this person called" is a question; "what is Ote called" is a slot instance of it.
  question_key  text NOT NULL UNIQUE,

  -- ⭐ What a valid ANSWER looks like, as prose for a human reader. ⛔ NOT machine-read: the machine
  -- reads `checks` below. Keeping the human sentence and the machine list apart is deliberate — a
  -- sentence that is also a predicate is how a classifier sneaks back in.
  asks          text NOT NULL,

  -- ⭐⭐⭐ AN EXPLICIT STRUCTURED LIST OF STABLE CHECK IDENTIFIERS (M2-11). ⛔ Not prose, ⛔ not a
  -- serialized predicate, ⛔ not a regex smuggled in as data. Every identifier must resolve to a real
  -- executable check in `memory-question-checks.js`, and an UNKNOWN identifier FAILS CLOSED ⇒ DEFER.
  -- ⛔ The vocabulary is extended ONLY by the memory-layer implementation: naming a check does not
  -- create one. ⓘ Validated AT DECLARATION TIME by `validateDefinition()` — hardening ②.
  checks        text[] NOT NULL DEFAULT '{}',

  -- ⭐ WHO declared it, and when. A declaration is an act with an author.
  declared_by   text NOT NULL,
  declared_at   timestamptz NOT NULL DEFAULT now(),

  -- ⭐ Supersession, ⛔ never an edit: a changed question is a NEW definition that points back.
  supersedes_id uuid REFERENCES mst_slot_questions(id),

  -- ⛔ A question with no name and no description is not a declaration.
  CONSTRAINT mst_slot_questions_named_ck CHECK (length(btrim(question_key)) > 0 AND length(btrim(asks)) > 0)
);

COMMENT ON TABLE mst_slot_questions IS
 'A SUBJECT-FREE question definition: what a valid answer to a slot looks like. Kind is the question a slot asks, not the datatype of its value -- both a type vocabulary and a text classifier were measured and both failed, because each presupposes the question is already known. Definitions are DECLARED by something that knows the question, never inferred from values and never backfilled. A definition is immutable: a change is a new definition plus a repointing, because editing one would silently re-interpret every memory already written under it. It contains no subject, no room and no value, which is what makes it safe as a persona-global object while slot instances stay room-scoped.';

COMMENT ON COLUMN mst_slot_questions.checks IS
 'Stable identifiers of deterministic checks, validated at declaration time against the registry in memory-question-checks.js. An unknown identifier fails closed to DEFER and is never silently skipped. Naming a check does not create one -- the vocabulary grows only in the memory-layer implementation.';

-- ── ⭐ THE ROOM-SCOPED INSTANCE POINTS AT THE SUBJECT-FREE DEFINITION ───────────────────────────
-- ⛔ NULLABLE AND UNBACKFILLED. A slot nobody has declared a question for keeps NULL, and every write
-- against it DEFERS -- permanently, until someone declares it. That is the ruling, not a gap.
ALTER TABLE mst_slots ADD COLUMN IF NOT EXISTS question_id uuid REFERENCES mst_slot_questions(id);

COMMENT ON COLUMN mst_slots.question_id IS
 'Which subject-free question this room-scoped slot asks. NULL means undeclared, and an undeclared slot DEFERS every write rather than guessing -- minting a slot (addressing it) is not the same act as declaring what a valid answer to it looks like.';

CREATE INDEX IF NOT EXISTS mst_slots_question_idx ON mst_slots (question_id) WHERE question_id IS NOT NULL;

COMMIT;

-- ── ⛔ PROOF, NOT HOPE ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    accepted  text := '';
    n_rows    int;
    n_pointed int;
    q1        uuid;
BEGIN
    -- ⛔⛔ IT DECLARED NOTHING. A migration does not know what question any slot asks, and a table that
    -- arrived with declarations in it would be exactly the backfill this ruling forbids.
    SELECT count(*) INTO n_rows FROM mst_slot_questions;
    IF n_rows <> 0 THEN
        RAISE EXCEPTION '047: the question table must land EMPTY -- found % row(s). Declaring is an act, not a migration', n_rows;
    END IF;

    -- ⛔ AND NOTHING WAS BACKFILLED: every existing slot stays undeclared, and therefore DEFERS.
    SELECT count(*) INTO n_pointed FROM mst_slots WHERE question_id IS NOT NULL;
    IF n_pointed <> 0 THEN
        RAISE EXCEPTION '047: % slot(s) were pointed at a question -- ⛔ no backfill, no inference', n_pointed;
    END IF;

    -- ① a question with no name is refused
    BEGIN
        INSERT INTO mst_slot_questions (question_key, asks, declared_by) VALUES ('  ', 'something', 'test');
        accepted := accepted || ' [unnamed-question]';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- ② a question that does not say what it asks is refused
    BEGIN
        INSERT INTO mst_slot_questions (question_key, asks, declared_by) VALUES ('zz_k', '   ', 'test');
        accepted := accepted || ' [question-that-asks-nothing]';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- ③ an anonymous declaration is refused -- a declaration is an act with an author
    BEGIN
        INSERT INTO mst_slot_questions (question_key, asks) VALUES ('zz_k2', 'what is this called');
        accepted := accepted || ' [declaration-with-no-author]';
    EXCEPTION WHEN not_null_violation THEN NULL;
    END;

    -- ④ ⭐ two definitions may NOT share a key -- a question has one name
    BEGIN
        INSERT INTO mst_slot_questions (question_key, asks, declared_by)
        VALUES ('zz_dup', 'what is this called', 'test') RETURNING id INTO q1;
        BEGIN
            INSERT INTO mst_slot_questions (question_key, asks, declared_by)
            VALUES ('zz_dup', 'something else entirely', 'test');
            accepted := accepted || ' [duplicate-question-key]';
        EXCEPTION WHEN unique_violation THEN NULL;
        END;
        -- ⑤ ⭐ and a REPOINTING is legitimate: a new definition that supersedes the old one
        INSERT INTO mst_slot_questions (question_key, asks, declared_by, supersedes_id)
        VALUES ('zz_dup_v2', 'what is this called, more precisely', 'test', q1);
    EXCEPTION WHEN others THEN
        accepted := accepted || ' [REFUSED-A-LEGITIMATE-DECLARATION-OR-REPOINT]';
    END;

    RAISE EXCEPTION 'ROLLBACK_MARKER:%', accepted;
EXCEPTION WHEN raise_exception THEN
    IF position('ROLLBACK_MARKER:' in SQLERRM) = 0 THEN RAISE; END IF;
    accepted := trim(replace(SQLERRM, 'ROLLBACK_MARKER:', ''));
    IF accepted <> '' THEN
        RAISE EXCEPTION '047: a guarantee this migration claims is not enforced --%', accepted;
    END IF;
    RAISE NOTICE '047: subject-free question definitions created, EMPTY and unbackfilled; mst_slots.question_id added, all NULL. 4 violations refused, a repoint accepted. Every slot DEFERS until declared.';
END $$;

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────────────────────────
--   DROP INDEX IF EXISTS persona_sotera.mst_slots_question_idx;
--   ALTER TABLE persona_sotera.mst_slots DROP COLUMN IF EXISTS question_id;
--   DROP TABLE IF EXISTS persona_sotera.mst_slot_questions;
-- ⭐ Safe while empty and unpointed, which is exactly how it lands.
