-- =====================================================================================
-- Sotera — migration 005: make Conversation Search exist.
--
-- ⏳ NOT YET APPLIED when written. Additive; see §4 to undo.
--
-- ⭐ FOUND BY USE, NOT BY INSPECTION (2026-08-18). Asked about someone called Hermes, Sotera reached
-- for her own tool and reported back:
--
--     "search_conversations — actually errored out with a database error
--      (column m.content_tsv does not exist), which is a platform-side issue"
--
-- She surfaced it herself, honestly, mid-conversation. No amount of auditing the MEMORY tables would
-- have found it, because the defect is in the MESSAGE tables — I had been looking at the wrong half of
-- the schema for two days.
--
-- WHAT WAS MISSING: both arms of it, not one.
--     lexical  · txn_messages.content_tsv (generated) + its GIN index   → absent
--     dense    · txn_message_embeddings (table + HNSW index)            → absent
-- OteLLMServices has both. Sotera was cloned before they landed, so `search_conversations` has NEVER
-- worked in this persona — it has thrown on every call for the life of the deployment.
--
-- =====================================================================================
-- §0 — WHY 'english' AND NOT SOMETHING BETTER
--
-- ⚠️ The regconfig is NOT a free choice: `conversation-search.js` hardcodes
--     plainto_tsquery('english', :q)
-- in both the WHERE and the ts_rank. A column built with a different configuration would still
-- "work" — it would simply match badly, and silently, which is the worst of the available failures.
-- So this mirrors OLS exactly.
--
-- ⚠️ KNOWN LIMITATION, INHERITED DELIBERATELY: the English parser does not segment Thai, which has no
-- word spaces, so a Thai message tends to land as one enormous token and becomes effectively
-- unsearchable. Ote writes Thai. This migration does NOT fix that — fixing it means changing the query
-- side too, and doing both at once would confuse "search was broken" with "search is bad at Thai".
-- Restoring the feature first makes the second problem measurable instead of hypothetical.
--
-- =====================================================================================
-- §1 — LEXICAL ARM

ALTER TABLE txn_messages
    ADD COLUMN IF NOT EXISTS content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english'::regconfig, COALESCE(content, ''::text))) STORED;

CREATE INDEX IF NOT EXISTS txn_messages_content_tsv_gin ON txn_messages USING gin (content_tsv);

COMMENT ON COLUMN txn_messages.content_tsv IS 'Generated lexical index for Conversation Search (CS1). Must stay in the same regconfig as plainto_tsquery() in conversation-search.js — a mismatch fails silently by matching badly.';

-- =====================================================================================
-- §2 — DENSE ARM
--
-- Mirrors OLS: pk on message_id, jsonb kept for portability, halfvec for the actual index.
-- ⚠️ `embedding_hv halfvec(2048)` and the HNSW index need pgvector. The component's own degradation
-- contract says an absent vector index means denseRelevances returns NULL — "cannot answer", not
-- "nothing matched" — so if the extension is missing this half simply stays unbuilt and the lexical
-- arm still works. That is a legal degraded state, not a failed migration.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        EXECUTE $ddl$
            CREATE TABLE IF NOT EXISTS txn_message_embeddings (
                message_id      uuid PRIMARY KEY,
                embedding       jsonb,
                embedding_model text,
                embedding_hv    halfvec(2048),
                created_at      timestamptz DEFAULT now()
            )
        $ddl$;
        EXECUTE 'CREATE INDEX IF NOT EXISTS txn_message_embeddings_hv_hnsw ON txn_message_embeddings USING hnsw (embedding_hv halfvec_cosine_ops)';
    ELSE
        -- No pgvector: build the table without the typed column so the lexical arm is unaffected and
        -- the dense arm degrades exactly as its contract says it should.
        EXECUTE $ddl$
            CREATE TABLE IF NOT EXISTS txn_message_embeddings (
                message_id      uuid PRIMARY KEY,
                embedding       jsonb,
                embedding_model text,
                created_at      timestamptz DEFAULT now()
            )
        $ddl$;
        RAISE NOTICE 'pgvector absent — dense arm table created WITHOUT embedding_hv/HNSW; lexical search still works';
    END IF;
END $$;

-- =====================================================================================
-- §3 — WHAT THIS DOES NOT DO
--
-- ⚠️ It does not BACKFILL embeddings. `content_tsv` is GENERATED, so every existing message becomes
-- searchable the moment the column exists — the lexical arm is retroactive for free. The dense arm is
-- not: embeddings are written by the runtime as messages arrive, so past conversations stay
-- dense-invisible until something re-embeds them. That is a deliberate non-goal here; generating
-- embeddings for the whole history is a job, not a migration.
--
-- =====================================================================================
-- §4 — REVERT
--
-- DROP INDEX IF EXISTS txn_message_embeddings_hv_hnsw;
-- DROP TABLE IF EXISTS txn_message_embeddings;
-- DROP INDEX IF EXISTS txn_messages_content_tsv_gin;
-- ALTER TABLE txn_messages DROP COLUMN IF EXISTS content_tsv;
