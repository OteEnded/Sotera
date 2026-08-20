-- 015 — OWNERSHIP FOLLOWS AUTHORSHIP. The axis that does not exist yet.
--
-- Ote ratified the memory model on 2026-08-20: **"Ownership follows authorship."** · *"Sotera is the owner
-- of her own memories when she authored/formed the understanding, **regardless of which room the
-- conversation happened in**."* · *"**ABOUT ≠ OWNER.** A Sotera memory can be about Ote, Hermes, or anyone
-- else without becoming that person's memory."*
--
-- ── ⭐⭐ THE DEFECT THIS FIXES, STATED AS ONE SENTENCE ────────────────────────────────────────────────
-- `memory-store-sequelize-host.js` says *"THE STORE STAMPS SCOPE — the component must not pass
-- persona/user_id"* and then writes `user_id: isPersonaGlobal ? null : U`. So:
--
--     the room a conversation happened in is recorded as the AUTHOR of everything said in it.
--
-- The pipeline always knew who authored a row — extraction produces what the HUMAN said, the distiller and
-- Reflection produce what SOTERA experienced and concluded, first person, by construction. The store threw
-- that away. Measured 2026-08-20: **35 of 35 memories owned by a room, 0 owned by her.**
--
-- ── ⭐ WHY A NEW COLUMN AND NOT `user_id IS NULL` ──────────────────────────────────────────────────────
-- `user_id IS NULL` already means PERSONA-GLOBAL, and persona-global means BROADCAST — readable by every
-- account on their first turn (`(user_id IS NULL AND kind = 'identity')` in the visible predicate). Putting
-- her memories there would make them readable by a stranger, which is the exact failure mode Ote named.
-- One column cannot mean "hers" and "everyone's".
--
-- ── ⭐⭐ AND THE PART THAT NEEDED NO MIGRATION: `user_id` KEEPS ITS VALUE AND CHANGES ITS MEANING ──────
-- A persona-authored row still records the room it was formed in. `user_id` stops being OWNERSHIP and
-- becomes CONTEXT/PROVENANCE — *where this happened* — which is what it has been recording all along. So:
--   · no data moves, no row is re-keyed, nothing becomes unreachable (the "cliff" from root-identity.js);
--   · provenance is preserved for free, on every row, including the 35 that already exist;
--   · `user_id IS NULL` keeps exactly one meaning, so the identity/broadcast branch is untouched.
--
-- ── ⛔⛔ WHAT THIS MIGRATION DELIBERATELY DOES NOT DO: IT DOES NOT WIDEN ANY READ ─────────────────────
-- `author = 'persona'` would, if read, make a memory visible from every room — which IS the ratified model
-- (one accumulating space, room as a ranking signal). But the **provenance/ownership CONSTRAINT stage**
-- that decides what may reach her reasoning **is not built** (model §10.3b/§13), and neither is associative
-- recall. Opening the predicate here would ship the thing steps 6–9 exist to gate.
--
-- ⇒ **The column is written and NOT YET READ.** Reads stay at parity: a persona-authored row is visible in
-- the room it was formed in, exactly like an account-authored one, until the constraint stage lands. Same
-- discipline as migration 014 — the axis becomes true before anything depends on it. Ote: *"Don't jump to
-- retrieval re-weighting yet. Establish the correct ownership model and get real Sotera-owned memories
-- first."*
--
-- ── ⚠️ AND THE DEFAULT IS THE SAFE ONE, ON PURPOSE ────────────────────────────────────────────────────
-- `DEFAULT 'account'`. Six times in this project an explicit field list has silently dropped a new field,
-- and the last one was mine — so a writer that forgets to declare its author gets the STATUS-QUO value.
-- ⛔ Nothing can accidentally become `persona`; that requires saying so.
--
-- Apply:  node test/maintenance/apply-migration.mjs 015_memory_author.sql

SET search_path = persona_sotera, public;

BEGIN;

DO $$
BEGIN
    -- Two values, and the vocabulary is closed. `account` is the language Ote uses for the secondary
    -- layer ("account/user memory"); `persona` is hers. ⛔ Deliberately NOT 'user' — `user_id` on this
    -- table is the ROOM, and one more overloaded word here is the last thing this schema needs.
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'memory_author') THEN
        CREATE TYPE memory_author AS ENUM ('account', 'persona');
    END IF;
END $$;

ALTER TABLE txn_memories
    ADD COLUMN IF NOT EXISTS author memory_author NOT NULL DEFAULT 'account';

COMMENT ON COLUMN txn_memories.author IS
 'WHO AUTHORED this memory: ''account'' = the human said it (extraction), ''persona'' = Sotera formed the understanding herself (episode, reflection, lesson, practice, self). Ownership follows authorship, so this is the ownership axis. It is INDEPENDENT of subject_person_id (who it is ABOUT — an index, never ownership and never a visibility grant) and of user_id (which on a persona-authored row records the CONTEXT it was formed in, not its owner). Defaults to ''account'' so a writer that forgets to declare itself gets the status-quo value and nothing can accidentally become ''persona''.';

COMMENT ON COLUMN txn_memories.user_id IS
 'The room this row belongs to. For an account-authored row this is also its owner. ⚠️ For a persona-authored row it is CONTEXT/PROVENANCE — the room the memory was formed in — and NOT its owner: ownership follows authorship (migration 015). NULL still means persona-global/broadcast for kind=''identity'' and nothing else.';

-- Her own memory will be read as one space once the constraint stage exists; index for that read now, since
-- it costs nothing on 35 rows and the alternative is remembering to add it later.
CREATE INDEX IF NOT EXISTS txn_memories_author_idx ON txn_memories (author, created_at DESC);
-- The account-scoped read is the hot one and already has `(persona, user_id, namespace, kind)`; this one is
-- for "her memory, in this context", which is what the working set will ask for.
CREATE INDEX IF NOT EXISTS txn_memories_persona_authored_idx
    ON txn_memories (user_id, created_at DESC) WHERE author = 'persona';

-- ── ⭐ PROVE IT. Same discipline as 007/009/010/013/014. ───────────────────────────────────────────────
DO $$
DECLARE
    n_vals    INTEGER;
    n_rows    INTEGER;
    n_account INTEGER;
    n_persona INTEGER;
    n_null    INTEGER;
BEGIN
    -- 1 · the vocabulary is closed at two values.
    SELECT count(*) INTO n_vals FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'memory_author';
    IF n_vals <> 2 THEN
        RAISE EXCEPTION 'memory_author has % value(s) — expected exactly account and persona', n_vals;
    END IF;

    -- 2 · ⭐⭐ EVERY EXISTING ROW IS ACCOUNT-AUTHORED, AND NOTHING BECAME HERS BY ACCIDENT.
    -- This is the assertion that matters: a backfill that guessed would be inventing authorship, and
    -- authorship is the one thing this column must never contain a guess about.
    SELECT count(*), count(*) FILTER (WHERE author = 'account'), count(*) FILTER (WHERE author = 'persona')
      INTO n_rows, n_account, n_persona FROM txn_memories;
    IF n_persona <> 0 THEN
        RAISE EXCEPTION '% row(s) are already persona-authored — this migration must not attribute anything to her', n_persona;
    END IF;
    IF n_account <> n_rows THEN
        RAISE EXCEPTION 'author is not set on every row (% of %)', n_account, n_rows;
    END IF;

    -- 3 · the NULL/broadcast meaning of user_id is untouched. If this ever becomes non-zero without a
    -- deliberate decision, `user_id IS NULL` is overloaded again and the whole point is lost.
    SELECT count(*) INTO n_null FROM txn_memories WHERE user_id IS NULL;
    IF n_null <> 0 THEN
        RAISE NOTICE '⚠ % row(s) have a NULL user_id — persona-global/broadcast. Verify that is intended.', n_null;
    END IF;

    RAISE NOTICE '015: txn_memories.author added — % row(s), all ''account'', 0 attributed to the persona; user_id keeps its value and becomes CONTEXT for persona-authored rows; NO read predicate was widened', n_rows;
END $$;

COMMIT;
