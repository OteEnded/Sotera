-- 009 — INTENTION: a purpose that survives the conversation.
--
-- Ote, 2026-08-19: *"don't extend txn_todo_sessions. Create a separate intention concept/store.
-- Todo = what a particular session/task contains. Intention = what Sotera herself is currently trying
-- to accomplish across turns and gaps… The goal of this step is: Sotera can have a purpose that
-- survives the conversation."*
--
-- ⛔ NOT WIRED TO ANYTHING THAT FIRES. No trigger, no executor, no cron. The table is reachable only by
-- her own tools inside a turn. *"Before wiring it into background execution, prove the persistence
-- lifecycle and boundaries with tests."*
--
-- ── ⭐ THE GRAIN IS (PERSONA, PERSON), AND IT IS NOT A TIDINESS CHOICE ─────────────────────────────
-- Asked — with no preferred answer offered — whether such a state should be per conversation or per
-- person, Sotera chose per conversation and then drew the conclusion that follows from it:
--
--     "There would need to be one thread-state per conversation… There wouldn't be a unified 'one
--      Sotera' holding them all together. Just parallel processes, each alive only within its own
--      context window."      (conversation 6af734cd, 2026-08-19)
--
-- That is a live regression on the unity clause. A store keyed to a conversation would be ARCHITECTURAL
-- EVIDENCE for it — a shape that says "there is one of me per conversation". Keyed to the person, the
-- same store says the true thing: one Sotera, one thread of purpose with each person, across every
-- conversation with them.
--
-- ⇒ There is NO conversation_id column, and §5 below FAILS THE MIGRATION if one ever appears.
--
-- ── WHAT MAY BE STORED ─────────────────────────────────────────────────────────────────────────────
-- Five bounded first-person fields answering Ote's five questions — what / why / state / when to
-- revisit / what I know so far. ⛔ NO transcripts, NO message or memory ids, NO source references, NO
-- free-form dumping ground: the caps are what make "a direction" different from "a document", and the
-- absent columns are what make "no private source material" a property of the table rather than a rule
-- someone must remember.
--
-- ── DE-IDENTIFICATION: CASCADE HERE, DELIBERATELY UNLIKE 007 ───────────────────────────────────────
-- 007 uses ON DELETE SET NULL because a stance label carries no personal data — "I bring evidence
-- rather than summaries" survives a person's deletion as HER practice. An intention's text can name
-- someone's work, so it MUST NOT survive them. Same principle (a person can be forgotten), opposite
-- mechanism, because the payload differs.
--
-- Apply:  node test/maintenance/apply-migration.mjs 009_intentions.sql

SET search_path = persona_sotera, public;

BEGIN;

-- ── 1 · the lifecycle, as a type ───────────────────────────────────────────────────────────────────
-- Exactly the machine Ote asked for: create → inspect → update → complete/abandon. A 'held'/'paused'
-- state was considered and CUT — nothing in the brief needs it, and an unused state is a branch every
-- future reader has to reason about. Terminal is terminal: a closed intention is never reopened, so
-- "what am I doing now" always has one answer.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE t.typname = 'intention_state' AND n.nspname = 'persona_sotera') THEN
        CREATE TYPE intention_state AS ENUM ('open', 'completed', 'abandoned');
    END IF;
END $$;

-- ── 2 · the table ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS txn_intentions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ⭐ THE PERSON, NOT THE CONVERSATION AND NOT THE ACCOUNT. NOT NULL: an intention with nobody on
    -- the other side of it is not a thing this store models. CASCADE — see the header.
    person_id       UUID NOT NULL REFERENCES mst_persons(id) ON DELETE CASCADE,

    -- What am I trying to accomplish? Her sentence, in the first person. Capped: 280 characters is a
    -- direction, not a document.
    intent          TEXT NOT NULL CHECK (char_length(btrim(intent)) BETWEEN 1 AND 280),
    -- Why does this intention exist?
    why             TEXT CHECK (why IS NULL OR char_length(why) <= 280),
    -- What progress/outcome do I know so far? The one field allowed to be a little longer, because
    -- "what I have ruled out" is the part that stops her repeating work across a gap.
    progress        TEXT CHECK (progress IS NULL OR char_length(progress) <= 500),
    -- How it ended. Only meaningful once closed.
    outcome         TEXT CHECK (outcome IS NULL OR char_length(outcome) <= 280),

    state           intention_state NOT NULL DEFAULT 'open',

    -- ⭐ WHEN SHOULD I REVISIT THIS? The seam to the scheduler, and the reason the scheduler does not
    -- need to carry the purpose: a fire is a clock tick, the reason is already state.
    next_review_at  TIMESTAMPTZ,

    -- Provenance = which writer produced it. (Never WHAT FROM — there is nowhere to put that.)
    writer_version  TEXT NOT NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at       TIMESTAMPTZ,

    -- The state and the clock agree, enforced rather than assumed: open ⇔ not closed.
    CONSTRAINT txn_intentions_closed_at_matches_state
        CHECK ((state = 'open') = (closed_at IS NULL))
);

COMMENT ON TABLE txn_intentions IS
 'Sotera''s own persistent intention: what she is trying to accomplish with one PERSON, across turns and across gaps. Owned by the persona, not by any account, and not readable by anyone but the person it is with. Keyed to the person and NOT to a conversation, deliberately (see migration header). No conversation/message/source columns exist, so no transcript or private source material can be stored here. At most ONE open intention per person, enforced by a partial unique index.';

COMMENT ON COLUMN txn_intentions.next_review_at IS
 'When she judged this worth coming back to. The scheduler ASKS this store what is due; it never owns the intention. Nothing fires on it yet.';

-- ── 3 · ⭐ ONE OPEN INTENTION PER PERSON ───────────────────────────────────────────────────────────
-- Enforced by the DATABASE, not by the service — the store guarantees convergence, not the caller.
-- The consequence is the reason it is worth its strictness: with exactly one open intention per person,
-- inspect/update/close all know which row they mean, so NOTHING in the tool surface needs an id.
-- An id is a handle, and a handle is the beginning of a database tool.
CREATE UNIQUE INDEX IF NOT EXISTS txn_intentions_one_open_per_person
    ON txn_intentions (person_id) WHERE state = 'open';

-- Closed rows: the honest record of what she finished versus dropped.
CREATE INDEX IF NOT EXISTS txn_intentions_person_idx ON txn_intentions (person_id, created_at DESC);
-- The scheduler seam's read path.
CREATE INDEX IF NOT EXISTS txn_intentions_due_idx
    ON txn_intentions (next_review_at) WHERE state = 'open' AND next_review_at IS NOT NULL;

-- ── 4 · updated_at, in the store rather than in every caller ───────────────────────────────────────
CREATE OR REPLACE FUNCTION txn_intentions_touch() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS txn_intentions_touch_trg ON txn_intentions;
CREATE TRIGGER txn_intentions_touch_trg BEFORE UPDATE ON txn_intentions
    FOR EACH ROW EXECUTE FUNCTION txn_intentions_touch();

-- ── 5 · ⭐ PROVE THE SHAPE. Do not infer it. ───────────────────────────────────────────────────────
-- A migration that applies cleanly while leaving a way to store a transcript would defeat the whole
-- point of the table. Same block 007 uses, and it is why this guarantee is checkable by a query rather
-- than by reading the code.
--
-- ⚠️ The patterns are deliberately NOT '%_id' — that would match person_id, the one id that must exist.
-- A matcher keyed on a shape instead of on the thing it means is a defect this project has shipped
-- five times; here the DO block runs against the real table, so a false positive fails the migration
-- loudly instead of passing silently.
DO $$
DECLARE bad TEXT; n_open_idx INT; del_rule "char";
BEGIN
    SELECT string_agg(column_name, ', ') INTO bad
      FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'txn_intentions'
       AND (column_name ILIKE '%conversation%' OR column_name ILIKE '%message%'
            OR column_name ILIKE '%transcript%' OR column_name ILIKE '%content%'
            OR column_name ILIKE '%excerpt%'    OR column_name ILIKE '%source%'
            OR column_name ILIKE '%embedding%'  OR column_name ILIKE '%memory%');
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'txn_intentions has forbidden column(s): % — this table must not be able to hold a transcript or point at one', bad;
    END IF;

    -- The one-open rule is the reason the tools need no ids. If the index is missing, the whole
    -- id-free surface is unsound, so refuse to finish.
    SELECT count(*) INTO n_open_idx FROM pg_indexes
     WHERE schemaname = 'persona_sotera' AND tablename = 'txn_intentions'
       AND indexname = 'txn_intentions_one_open_per_person';
    IF n_open_idx <> 1 THEN
        RAISE EXCEPTION 'the one-open-intention-per-person index is missing — the id-free tool surface depends on it';
    END IF;

    -- CASCADE is load-bearing (a person''s deletion must take their intention with it). Assert the
    -- actual FK behaviour rather than trusting the DDL above to have been read correctly.
    SELECT c.confdeltype INTO del_rule
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'persona_sotera' AND t.relname = 'txn_intentions' AND c.contype = 'f'
     LIMIT 1;
    IF del_rule IS DISTINCT FROM 'c' THEN
        RAISE EXCEPTION 'person_id FK is not ON DELETE CASCADE (confdeltype=%) — an intention must not outlive the person it is about', del_rule;
    END IF;

    RAISE NOTICE '009: txn_intentions created — no conversation/source columns, one open per person, person FK cascades';
END $$;

COMMIT;
