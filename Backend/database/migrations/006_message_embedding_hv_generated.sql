-- 006 — make txn_message_embeddings.embedding_hv a GENERATED column, so the dense arm can actually match.
--
-- ⚠️ FIXES A DEFECT INTRODUCED BY 005 (mine, the same day). 005 created `embedding_hv halfvec(2048)`
-- as a PLAIN column and built an HNSW index over it — but nothing in the Backend ever writes that column.
-- `embedPendingMessages` inserts `embedding` (jsonb) only. So:
--
--     202 rows · embedding (jsonb) NOT NULL: 202 · embedding_hv NOT NULL: 0
--
-- and `conversation-search.js`'s dense arm filters `WHERE me.embedding_hv IS NOT NULL`, which no row has
-- ever satisfied. The index has always covered an always-NULL column. Measured end-to-end:
--
--     query "connection pool หลุดตอน deploy"  →  mode=lexical+empty-dense  count=0
--
-- The impact is exactly asymmetric and that is why it went unnoticed: the LEXICAL arm handles Latin
-- script fine (a real cross-conversation recall was verified working), while Thai cannot be tokenised by
-- `to_tsvector('english', …)` at all — a whole Thai clause becomes ONE token, because Thai does not put
-- spaces between words. So for Thai BOTH arms are down simultaneously and Conversation Search is, in
-- practice, English-only.
--
-- ⭐ WHY GENERATED AND NOT A TRIGGER OR AN APPLICATION WRITE: because that is what OLS already does, and
-- the expression below is copied verbatim from `ote_llm_services.txn_message_embeddings.embedding_hv`
-- (`generated = ALWAYS`) rather than re-derived. A second, hand-written derivation would be a second
-- place to be wrong. It also means no backfill job exists to forget to run: a generated column
-- populates itself for every existing row and every future insert.
--
-- SAFETY, verified before writing this file:
--   · all 202 rows are `jsonb_typeof = 'array'` with `jsonb_array_length = 2048` → the CASE will actually
--     populate rather than silently yielding NULL for everything, which is the failure mode that would
--     have made this migration look applied and change nothing;
--   · `embedding_hv` currently holds 0 non-null values, so DROP COLUMN destroys no data;
--   · `embedding` (the jsonb source) is NOT touched — no re-embedding, no model calls;
--   · pgvector lives in `public`, so `halfvec` needs `public` on the search_path.
--
-- ⛔ SCOPE. This touches ONE column in ONE table. It does not go near `user_id`, does not rename
-- anything, does not run or reconcile migrations 001–003 (quarantined — see
-- ANALYSIS_SOTERA_SCHEMA_TRUTH.md), and does not touch `txn_memories`.
--
-- Apply with `public` on the search_path so `halfvec` resolves:
--   PGOPTIONS='-c search_path=persona_sotera,public' psql … -f 006_message_embedding_hv_generated.sql

SET search_path = persona_sotera, public;

BEGIN;

-- The index must go first: it depends on the column.
DROP INDEX IF EXISTS persona_sotera.txn_message_embeddings_hv_hnsw;

-- Safe: 0 non-null values (asserted below rather than trusted).
DO $$
DECLARE non_null_count BIGINT;
BEGIN
    SELECT count(*) INTO non_null_count
      FROM persona_sotera.txn_message_embeddings
     WHERE embedding_hv IS NOT NULL;
    IF non_null_count > 0 THEN
        RAISE EXCEPTION 'REFUSING TO RUN: embedding_hv holds % non-null rows, so dropping it would destroy data. This migration assumes the column was never populated.', non_null_count;
    END IF;
END $$;

ALTER TABLE persona_sotera.txn_message_embeddings DROP COLUMN IF EXISTS embedding_hv;

-- Expression copied verbatim from ote_llm_services.txn_message_embeddings.embedding_hv.
ALTER TABLE persona_sotera.txn_message_embeddings
    ADD COLUMN embedding_hv halfvec(2048)
    GENERATED ALWAYS AS (
        CASE
            WHEN jsonb_typeof(embedding) = 'array' AND jsonb_array_length(embedding) = 2048
            THEN ((embedding)::text)::halfvec(2048)
            ELSE NULL::halfvec
        END
    ) STORED;

CREATE INDEX IF NOT EXISTS txn_message_embeddings_hv_hnsw
    ON persona_sotera.txn_message_embeddings USING hnsw (embedding_hv halfvec_cosine_ops);

-- ⭐ PROVE THE STATE, do not infer it from the absence of an error. A migration that "succeeds" while
-- leaving every generated value NULL is precisely the shape of the bug being fixed here.
DO $$
DECLARE total BIGINT; populated BIGINT;
BEGIN
    SELECT count(*), count(embedding_hv) INTO total, populated
      FROM persona_sotera.txn_message_embeddings;
    IF total > 0 AND populated <> total THEN
        RAISE EXCEPTION 'embedding_hv populated % of % rows — the generation expression is not matching the stored data', populated, total;
    END IF;
    RAISE NOTICE '006: embedding_hv generated for %/% rows', populated, total;
END $$;

COMMIT;
