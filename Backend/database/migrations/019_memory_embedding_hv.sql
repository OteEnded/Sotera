-- 019 — GIVE `txn_memories` THE VECTOR COLUMN ITS OWN CODE ALREADY QUERIES.
--
-- ⚠️⚠️ THE MEASURED LIMITATION: THE MEMORY DENSE ARM IS DEAD CODE, AND IT FAILS SILENTLY BY DESIGN.
-- `memory-store-sequelize-host.js` has been running:
--
--     SELECT id, (1 - (embedding_hv <=> :q::halfvec(2048))) AS relevance
--       FROM txn_memories WHERE … ORDER BY embedding_hv <=> :q::halfvec(2048) LIMIT :lim
--
-- **and `txn_memories.embedding_hv` does not exist.** Verified 2026-08-21: the table's only vector-ish
-- columns are `embedding jsonb`, `slot_embedding jsonb`, `embedding_model varchar`. So the query throws on
-- its first use, the host sets `denseDisabled = true`, logs *"pgvector dense arm disabled (embedding_hv
-- missing?) — JS cosine fallback"* through the fastify logger, and **every memory recall since has scored
-- vectors in JavaScript over the whole scope.**
--
-- ⓘ The fallback itself is correct and deliberate — the contract even distinguishes `null` ("cannot
-- answer") from an empty map, which is the right shape. ⛔ What is wrong is that it has been the ONLY path,
-- permanently, and nothing said so out loud. At 36 rows it is invisible; it is O(N) per recall with the
-- vectors themselves crossing the wire, so it is also the ceiling on how large her memory can grow.
--
-- ── ⭐ WHY `jsonb` CANNOT BE PATCHED AROUND ──────────────────────────────────────────────────────────
-- `jsonb` cannot be indexed by pgvector and cannot be compared with `<=>`. Similarity over it is
-- necessarily computed outside the database. No query, index or extension makes a jsonb array behave like
-- a vector — this is a storage-type fact, not a tuning problem.
--
-- ── ⭐⭐ GENERATED, NOT WRITTEN — THE SAME SHAPE MIGRATION 006 USED FOR MESSAGES ──────────────────────
-- 006 made `txn_message_embeddings.embedding_hv` a GENERATED column precisely so no writer has to
-- remember it. `txn_memories` has SEVERAL write paths (the store's `create`, `lesson-host`'s raw INSERT,
-- the decline/revise inserts, consolidation), so an application-side write here would be the
-- `allowlist-drops-what-it-was-not-told` failure waiting to happen: one forgotten path and a memory is
-- durably unsearchable. ⇒ **The database derives it, and it cannot be forgotten.**
--
-- ── ⛔⛔ AND MEMORIES STAY A SEPARATE POPULATION FROM MESSAGES ────────────────────────────────────────
-- Ote, 2026-08-21: *"keep memories as a separate population from conversation messages. Shared vector
-- infrastructure is fine; shared semantics or authorization is not."* This is the same infrastructure
-- (halfvec, cosine, the same embedding model) over a DIFFERENT table with DIFFERENT semantics and
-- DIFFERENT authorization — memories are scoped by `persona / user_id / kind / author` and by the
-- live-belief predicate; messages by room, role and conversation. ⛔ One table holding both would collapse
-- *what a hit means* into something no boundary layer can apply a rule to (RFC §16.3).
--
-- ── ⭐ WHAT STAYS EXACTLY AS IT WAS ──────────────────────────────────────────────────────────────────
-- The scope clause is untouched. `scopeClause(kind, namespace)` already produces the owner predicate and
-- the identity/broadcast branch; 019 changes only HOW THE DISTANCE IS COMPUTED, not which rows are
-- eligible. Ownership (`author`), provenance, `source_message_id` and `subject_person_id` are untouched,
-- and nothing here widens or narrows a read.
--
-- ── ⏸ NO HNSW INDEX YET, AND THAT IS THE RATIFIED POSITION ───────────────────────────────────────────
-- §10.6 / M-6: **exact `<=>` before HNSW.** At 36 live rows an exact scan is both cheaper and *correct*,
-- while an ANN index would hand back approximate neighbours at a size where approximation buys nothing.
-- ⇒ Ship the column and the operator. The index is a one-line follow-up when the live-memory count makes
-- an exact scan measurable — on the order of tens of thousands of rows, and it should be PARTIAL:
--     CREATE INDEX … USING hnsw (embedding_hv halfvec_cosine_ops)
--       WHERE invalid_at IS NULL AND expired_at IS NULL;   -- live beliefs only; the dead are never recalled
-- ⚠️ `slot_embedding jsonb` has the same problem for slot resolution and is DELIBERATELY out of scope —
-- one population at a time, and the slot resolver's N is bounded by live slots rather than by history.
--
-- ⚠️ `public` must be on the search_path or `halfvec` does not resolve (the 006 lesson).
-- Apply:  node test/maintenance/apply-migration.mjs 019_memory_embedding_hv.sql

SET search_path = persona_sotera, public;

BEGIN;

-- ── PRE-FLIGHT: the numbers must be uniform, or a vector space silently means two things ────────────
-- ⚠️ MIXING EMBEDDING MODELS IN ONE VECTOR SPACE IS SILENT NONSENSE — distances between vectors from
-- different models are meaningless, and nothing about the result looks wrong. Measured before writing
-- this: 36 of 36 embedded rows, ONE model (`ollama/qwen3-embedding:4b@2048`), all of length 2048. The
-- assertion is here anyway, because "it was true when I checked" is not a guarantee.
DO $$
DECLARE
    n_models INTEGER;
    n_baddim INTEGER;
BEGIN
    SELECT count(DISTINCT embedding_model) INTO n_models FROM txn_memories WHERE embedding IS NOT NULL;
    IF n_models > 1 THEN
        RAISE EXCEPTION '% distinct embedding models among embedded memories — one vector space cannot hold two models; re-embed before running 019', n_models;
    END IF;
    SELECT count(*) INTO n_baddim FROM txn_memories
     WHERE embedding IS NOT NULL
       AND (jsonb_typeof(embedding) <> 'array' OR jsonb_array_length(embedding) <> 2048);
    IF n_baddim <> 0 THEN
        RAISE NOTICE '⚠ % embedded row(s) are not 2048-length arrays — they will generate NULL and stay on the JS fallback', n_baddim;
    END IF;
END $$;

-- ── THE COLUMN. DERIVED BY THE DATABASE, so no write path can forget it. ───────────────────────────
-- ⓘ The CASE is what makes a malformed or wrong-length embedding degrade to NULL instead of failing the
-- INSERT — a memory must still be storable when its vector is not, exactly as 006 decided for messages.
ALTER TABLE txn_memories
    ADD COLUMN IF NOT EXISTS embedding_hv halfvec(2048)
    GENERATED ALWAYS AS (
        CASE
            WHEN jsonb_typeof(embedding) = 'array' AND jsonb_array_length(embedding) = 2048
            THEN ((embedding)::text)::halfvec(2048)
            ELSE NULL::halfvec
        END
    ) STORED;

COMMENT ON COLUMN txn_memories.embedding_hv IS
 'pgvector halfvec(2048), GENERATED from `embedding` jsonb so no write path can omit it (the migration-006 pattern). This is what the store''s dense arm has always queried; before migration 019 the column did not exist, so that arm threw once, disabled itself, and every recall ran the JS cosine fallback over the whole scope. ⛔ It is an INDEX over her memories — it decides where to look, never what she knows and never what she may read: the scope clause and the live-belief predicate are unchanged, and memories remain a separate population from conversation messages (shared infrastructure, separate semantics and authorization).';

-- ── ⭐ PROVE IT ─────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    n_rows   INTEGER;
    n_emb    INTEGER;
    n_hv     INTEGER;
    n_gen    INTEGER;
    probe    DOUBLE PRECISION;
BEGIN
    -- 1 · it really is GENERATED, not a plain column somebody must remember to fill.
    SELECT count(*) INTO n_gen FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'txn_memories'
       AND column_name = 'embedding_hv' AND is_generated = 'ALWAYS';
    IF n_gen <> 1 THEN
        RAISE EXCEPTION 'embedding_hv is not a GENERATED ALWAYS column — a writer could omit it';
    END IF;

    -- 2 · ⭐⭐ EVERY EMBEDDED MEMORY NOW HAS A VECTOR. This is the assertion that makes the dense arm live:
    -- 005 shipped a column with no generation expression and nobody noticed for a day, because "the column
    -- exists" and "the column has values" are different facts.
    SELECT count(*), count(embedding), count(embedding_hv) INTO n_rows, n_emb, n_hv FROM txn_memories;
    IF n_hv <> n_emb THEN
        RAISE EXCEPTION 'only % of % embedded memories generated a vector', n_hv, n_emb;
    END IF;

    -- 3 · ⭐ THE OPERATOR ACTUALLY WORKS ON IT — the thing the store has been unable to do. A distance to
    -- self must be 0; anything else means the cast produced something that is not the same vector.
    IF n_hv > 0 THEN
        SELECT (embedding_hv <=> embedding_hv) INTO probe FROM txn_memories
         WHERE embedding_hv IS NOT NULL LIMIT 1;
        IF probe IS NULL OR probe > 1e-6 THEN
            RAISE EXCEPTION 'cosine distance to self is % — the halfvec cast is not round-tripping', probe;
        END IF;
    END IF;

    RAISE NOTICE '019: txn_memories.embedding_hv added as GENERATED ALWAYS — %/% embedded memories now carry a vector, <=> verified on it; the store''s dense arm stops falling back to JS cosine. No index yet (exact before HNSW, §10.6); scope, ownership and provenance unchanged', n_hv, n_emb;
END $$;

COMMIT;
