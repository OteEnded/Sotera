-- 018 — MAKE THE MESSAGE VECTOR INDEX PRE-FILTERABLE. The index has to be able to say "nearest WITHIN
-- this scope", and today it cannot.
--
-- Ote approved this on 2026-08-21: *"The message vector index eventually becoming unable to honor
-- onlyConversationId efficiently — and potentially producing a not_located false absence because the
-- relevant candidate gets filtered out after HNSW retrieval — is exactly the kind of failure we're trying
-- to eliminate."* And the constraint on the fix: *"Design it so retrieval can remain scalable while the
-- authorization/projection boundary stays completely independent of the retrieval mechanism."*
--
-- ── ⭐⭐ THE MEASURED LIMITATION ──────────────────────────────────────────────────────────────────────
-- `txn_message_embeddings` held ONLY `message_id · embedding · embedding_model · created_at ·
-- embedding_hv`. Every predicate the dense arm needs lived in another table:
--
--     m.role IN ('assistant')          txn_messages
--     m.conversation_id = …            txn_messages       ← P1's navigation pin
--     c.user_id = …  (the room)        txn_conversations
--     c.incognito = false              txn_conversations
--
-- ⇒ `ORDER BY embedding_hv <=> q LIMIT pool` over a JOIN can only be **POST-FILTERED**: HNSW returns
-- ~`ef_search` neighbours from the whole population and the join then discards the ones that fail. Recall
-- degrades with the SELECTIVITY of the filter, and there is no way to ask the index for "the nearest
-- among these".
--
-- ⚠️ MEASURED AT THE TIME OF WRITING: **769 embedded messages.** At that size HNSW returns nearly the
-- entire population, every filter survives, and nothing looks wrong. ⭐ That is exactly why this lands
-- now: **the defect is invisible at this scale and total at a larger one.**
--
-- ⚠️⚠️ AND IT SITS DIRECTLY UNDER THE CAPABILITY JUST BUILT. P1's `inspect_around` resolves *which of her
-- messages a handle refers to* with `onlyConversationId` — **the most selective filter in the system**.
-- At scale HNSW's neighbours would essentially never include one from that specific conversation, so the
-- honest payload `state: 'not_located'` ("a failure to locate, not evidence that it never happened")
-- would become the PERMANENT answer. ⇒ **a false absence manufactured by an index**, which is the exact
-- failure class this whole arc exists to end.
--
-- ── ⭐ WHAT THE NEW STRUCTURE REPRESENTS ─────────────────────────────────────────────────────────────
-- The table becomes *"a searchable vector PLUS the facts needed to decide whether it is in scope"* — a
-- denormalised INDEX in the precise sense of RFC §16: it says **where to look**, and it must be able to
-- say it *within a scope*. The three copied columns are facts that NEVER change for a message: a message
-- does not move conversation, change author, or change room.
--
-- ── ⛔⛔ AND `incognito` IS DELIBERATELY **NOT** COPIED, BECAUSE ABSENCE IS THE STRONGER GUARANTEE ─────
-- The writer already refuses to embed an off-the-record message (`AND c.incognito = false` in
-- `embedPendingMessages`), and `incognito` is set at conversation CREATE and never patched. ⇒ **off the
-- record means NOT INDEXED**, which cannot be forgotten by a query, rather than *indexed and filtered
-- out*, which can. This migration deletes any that slipped in, and a check re-asserts the invariant —
-- because dropping the `txn_conversations` join from the dense query also drops its defensive filter, and
-- an invariant that used to be enforced by a WHERE clause now needs to be enforced by an assertion.
--
-- ── ⭐⭐ HOW OWNERSHIP / PROVENANCE / AUTHORIZATION STAY INTACT ──────────────────────────────────────
-- ⛔ NOTHING HERE TOUCHES WHO MAY READ WHAT, and that is asserted rather than asserted-by-me:
--   · `applyBoundaries()` stays INDEX-AGNOSTIC — it never learns how a candidate was found
--     (`layer-separation-check`);
--   · the AUTHORIZATION DECISION (`liveGrant` / `grantFromInteraction`) reads none of these columns — it
--     reads the grant, and the same check scans that slice for signal words and comparisons;
--   · `room_user_id` here is the SAME fact the projection already resolves from `txn_conversations`.
--     Copying it lets the INDEX skip rows it would have thrown away. ⛔ It never becomes the thing that
--     decides she may read them — Ote: *"A vector score must never become an authorization signal. Don't
--     let the optimization for 018 accidentally collapse those layers."*
--   · `role` remains a CONVENTION about one persona (asserted in `self-history-check`); copying it makes
--     it neither more nor less true.
--
-- Apply:  node test/maintenance/apply-migration.mjs 018_message_embedding_scope.sql

SET search_path = persona_sotera, public;

BEGIN;

-- ── 1 · THE SCOPE COLUMNS, ADDED NULLABLE SO THE ALTER REWRITES NOTHING ─────────────────────────────
ALTER TABLE txn_message_embeddings
    ADD COLUMN IF NOT EXISTS conversation_id UUID,
    ADD COLUMN IF NOT EXISTS role            TEXT,
    ADD COLUMN IF NOT EXISTS room_user_id    UUID;

-- ── 2 · OFF THE RECORD MEANS NOT INDEXED. Remove any embedding of an incognito message. ─────────────
-- ⓘ Expected to delete zero rows today (the writer has always excluded them); it exists so the invariant
-- is TRUE rather than merely intended, now that the dense query no longer joins the conversation.
DELETE FROM txn_message_embeddings me
 USING txn_messages m
  JOIN txn_conversations c ON c.id = m.conversation_id
 WHERE m.id = me.message_id AND c.incognito = TRUE;

-- ── 3 · BACKFILL. One pass over a small table today; ⚠ at larger scale this should be batched by
-- message_id range rather than run as one statement.
UPDATE txn_message_embeddings me
   SET conversation_id = m.conversation_id,
       role            = m.role,
       room_user_id    = c.user_id
  FROM txn_messages m
  JOIN txn_conversations c ON c.id = m.conversation_id
 WHERE m.id = me.message_id
   AND (me.conversation_id IS NULL OR me.role IS NULL);

-- ⚠️ An embedding whose message no longer exists cannot be scoped, so it cannot be searched safely —
-- it would be a vector with no room. Remove the orphans rather than leaving unscopeable rows behind.
DELETE FROM txn_message_embeddings me
 WHERE NOT EXISTS (SELECT 1 FROM txn_messages m WHERE m.id = me.message_id);

-- ── 4 · ⭐ NOT NULL, SO A FORGETFUL WRITER FAILS LOUDLY ─────────────────────────────────────────────
-- This is the whole defence against the `allowlist-drops-what-it-was-not-told` failure: a column only the
-- backfill ever populated is a column that rots. ⛔ `room_user_id` stays nullable because it mirrors
-- `txn_conversations.user_id`, which is nullable — an unowned conversation is a real state, and the
-- consumers already fail closed on it.
ALTER TABLE txn_message_embeddings ALTER COLUMN conversation_id SET NOT NULL;
ALTER TABLE txn_message_embeddings ALTER COLUMN role SET NOT NULL;

COMMENT ON COLUMN txn_message_embeddings.conversation_id IS
 'Denormalised from txn_messages. Present so the vector index can be filtered IN THIS TABLE rather than by a join above it — pgvector can only pre-filter an HNSW scan against columns beside the vector. It is a SCOPE for retrieval and ⛔ never an authorization input.';
COMMENT ON COLUMN txn_message_embeddings.role IS
 'Denormalised from txn_messages. ''assistant'' is Sotera''s own authorship (a convention that holds while this schema has one persona, asserted in self-history-check), which is what makes a cross-room self-history search hers. ⛔ A scope for retrieval, never a permission.';
COMMENT ON COLUMN txn_message_embeddings.room_user_id IS
 'Denormalised from txn_conversations.user_id — the room this message lives in. Lets the INDEX skip rows another scope would have discarded. ⛔ It is NOT the disclosure boundary: what she may read is decided by the projection and the grant, which never see this table.';

-- ── 5 · INDEXES FOR THE THREE READS THAT ACTUALLY HAPPEN ────────────────────────────────────────────
-- ⭐⭐ (a) THE NAVIGATION PIN STOPS BEING A VECTOR PROBLEM AT ALL. Resolving "which of her messages in
-- THIS one conversation" is a btree lookup plus an exact distance over a few dozen rows — ⛔ HNSW is the
-- wrong tool for it at any scale, the same correction §10.6 already records about ANN at small N. This is
-- what keeps P1 working as history grows, and it gets MORE reliable, not less.
CREATE INDEX IF NOT EXISTS txn_message_embeddings_conversation_idx
    ON txn_message_embeddings (conversation_id);

-- (b) her own history across rooms — the persona-level read. A PARTIAL HNSW over just her sentences, so
-- the commonest cross-room search is pre-filtered by construction rather than by luck.
CREATE INDEX IF NOT EXISTS txn_message_embeddings_hv_hnsw_assistant
    ON txn_message_embeddings USING hnsw (embedding_hv halfvec_cosine_ops)
    WHERE role = 'assistant';

-- (c) the room-scoped evidence read keeps the existing unqualified HNSW (both roles), and gains a btree
-- so the room can narrow before the vector work when the planner prefers that.
CREATE INDEX IF NOT EXISTS txn_message_embeddings_room_role_idx
    ON txn_message_embeddings (room_user_id, role);

-- ⓘ pgvector 0.8.0 is installed, so `hnsw.iterative_scan` is available: with the predicates now IN THIS
-- TABLE, a filtered search can keep walking the graph until it has enough rows that PASS the filter
-- instead of post-filtering a fixed candidate list. That is set per-statement by the reader, not here.

-- ── ⭐ PROVE IT ─────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    n_rows      INTEGER;
    n_null      INTEGER;
    n_wrong     INTEGER;
    n_incognito INTEGER;
    n_orphan    INTEGER;
BEGIN
    SELECT count(*) INTO n_rows FROM txn_message_embeddings;

    -- 1 · every row is scoped. NOT NULL already guarantees it; this states the row count that survived.
    SELECT count(*) INTO n_null FROM txn_message_embeddings WHERE conversation_id IS NULL OR role IS NULL;
    IF n_null <> 0 THEN
        RAISE EXCEPTION '% embedding row(s) are unscoped after the backfill', n_null;
    END IF;

    -- 2 · ⭐⭐ THE COPIES AGREE WITH THE SOURCE. A denormalised column that disagrees with the table it
    -- was copied from is worse than no column: the index would silently search the wrong scope.
    SELECT count(*) INTO n_wrong
      FROM txn_message_embeddings me
      JOIN txn_messages m ON m.id = me.message_id
      JOIN txn_conversations c ON c.id = m.conversation_id
     WHERE me.conversation_id IS DISTINCT FROM m.conversation_id
        OR me.role            IS DISTINCT FROM m.role
        OR me.room_user_id    IS DISTINCT FROM c.user_id;
    IF n_wrong <> 0 THEN
        RAISE EXCEPTION '% embedding row(s) disagree with txn_messages/txn_conversations', n_wrong;
    END IF;

    -- 3 · ⛔ OFF THE RECORD IS NOT IN THE INDEX. The guarantee that replaces the dropped join filter.
    SELECT count(*) INTO n_incognito
      FROM txn_message_embeddings me
      JOIN txn_messages m ON m.id = me.message_id
      JOIN txn_conversations c ON c.id = m.conversation_id
     WHERE c.incognito = TRUE;
    IF n_incognito <> 0 THEN
        RAISE EXCEPTION '% embedding(s) belong to an incognito conversation — off the record must mean NOT INDEXED', n_incognito;
    END IF;

    -- 4 · no vector without a message to scope it.
    SELECT count(*) INTO n_orphan FROM txn_message_embeddings me
     WHERE NOT EXISTS (SELECT 1 FROM txn_messages m WHERE m.id = me.message_id);
    IF n_orphan <> 0 THEN
        RAISE EXCEPTION '% orphaned embedding(s) remain', n_orphan;
    END IF;

    RAISE NOTICE '018: % embedding row(s) scoped (conversation_id + role NOT NULL, room_user_id copied); copies agree with source; 0 incognito, 0 orphans; navigation pin is now a btree lookup instead of a post-filtered ANN scan', n_rows;
END $$;

COMMIT;
