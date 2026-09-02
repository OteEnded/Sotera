-- ⭐⭐⭐ 039 · `persisted` MEANS DURABLE SOTERA-OWNED STATE — SO THE RECEIPT MUST SAY WHERE IT LIVES.
--
-- Ote, 2026-09-02, ruling on the one question left open by 038: *"For retain() receipt semantics, use
-- `persisted` to mean that the retention decision successfully became durable Sotera-owned state,
-- regardless of which underlying storage represents it. So a successful note_own_practice should return
-- `persisted`, even though it doesn't have a txn_memories ID. Don't weaken this to `accepted`, and don't
-- add another state just for the storage-table distinction."*
--
-- ── ⚠️ THE DEFECT IT CLOSES ─────────────────────────────────────────────────────────────────────
-- A practice note lands in `txn_relational_records`, not `txn_memories`. `retain` found no memory id and
-- fell through to `accepted` — whose locked meaning is *"we stopped waiting and do not know"*. So a write
-- that had ALREADY COMPLETED, and whose row was reachable from her memory tool and her context, was
-- reported to her as an unknown. ⛔ `accepted` must never be a euphemism for success.
--
-- ── ⛔ AND WHY A COLUMN RATHER THAN A STATE ──────────────────────────────────────────────────────
-- The state vocabulary is closed and Ote closed it. What actually changed is not the OUTCOME — it is that
-- `memory_id` now holds an id from one of two tables, and a uuid does not say which. ⚠️ This project's
-- most-repeated defect is a reader inferring a thing's meaning from the shape of a value; a later join
-- from `memory_id` to `txn_memories` would find nothing and report it as "no such memory" rather than as
-- "a different store". ⇒ ⭐ the store is RECORDED, never inferred — the same rule the four axes follow.
--
-- ── ⭐ THE REACHABILITY PRECONDITION, MEASURED BEFORE THIS RAN ───────────────────────────────────
-- Ote: *"Storage existing is not enough — I want to know that Sotera can actually retrieve/use the
-- practice later as part of her durable memory/state."* `practice-reachability-check.mjs` proves the whole
-- path, not the INSERT: the row exists the moment `retain()` returns · `recall_own_memory` returns it as
-- the taxonomy sentence · the Composer renders it into her context per turn (`memory.relationalStance` is
-- true in the live settings) · a second ACCOUNT of the same PERSON reaches it · a different person does
-- not. ⇒ it is durable Sotera-owned state by Ote's definition, and `persisted` is the honest receipt.

SET search_path = persona_sotera, public;

BEGIN;

-- ⭐ WHICH STORE THE ID BELONGS TO. Null for every state except `persisted`, exactly as `memory_id` is.
ALTER TABLE log_retention_decisions
    ADD COLUMN IF NOT EXISTS store text;

-- Everything already recorded as persisted came through the memory pipeline; there is no other store it
-- could have used before this migration. Backfilled rather than assumed so the constraint below can be
-- symmetric with the receipt check it sits beside.
UPDATE log_retention_decisions SET store = 'txn_memories'
 WHERE state = 'persisted' AND store IS NULL;

DO $$
BEGIN
    -- ⭐⭐ THE SAME SHAPE AS 038's RECEIPT CHECK, AND FOR THE SAME REASON: a receipt that says WHERE only
    -- sometimes is a receipt a reader learns to treat as optional.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'log_retention_decisions_store_ck') THEN
        ALTER TABLE log_retention_decisions
            ADD CONSTRAINT log_retention_decisions_store_ck
            CHECK ((state =  'persisted' AND store IS NOT NULL)
                OR (state <> 'persisted' AND store IS NULL));
    END IF;
END $$;

COMMIT;

-- ── VERIFICATION ────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    orphans bigint;
BEGIN
    -- ⛔ NOT A FROZEN COUNT. 038's guard asserted 79 rows and the corpus had grown to 81 while the work
    -- was being done — correctly catching me out. ⭐ What stays true is the INVARIANT, not the tally.
    SELECT count(*) INTO orphans FROM log_retention_decisions
     WHERE (state = 'persisted') <> (store IS NOT NULL);
    IF orphans > 0 THEN
        RAISE EXCEPTION '039: % decision row(s) disagree about whether they name a store', orphans;
    END IF;
    RAISE NOTICE '039: store column live; % persisted row(s) carry one',
        (SELECT count(*) FROM log_retention_decisions WHERE state = 'persisted');
END $$;
