-- =====================================================================================
-- Sotera — migration 002: the owner corrections.
--
-- ⛔ NOT APPLIED. Reviewed and ready; deliberately held. Read §0 before running it.
--
-- Context: 001_core.sql was written first, as a hand-built schema with the memory findings baked in.
-- Then Ote chose to clone OteLLMServices wholesale for a head start, and OLS's 35 Sequelize models
-- expect OLS's shape — sync died creating an index over columns 001 did not have. Cloning for a head
-- start means the CODE is the mass and the corrections are the DELTA, so OLS's schema landed and 001
-- became the SPEC. This file is that spec, expressed as a diff against what is actually there.
-- =====================================================================================

-- ─────────────────────────────────────────────────────────────────────────────────────
-- §0 — WHY THIS IS NOT A BLANKET `SET NOT NULL`, AND WHY RUNNING IT BLIND WOULD BE WORSE
--       THAN LEAVING IT ALONE
--
-- 13 tables in persona_sotera carry a nullable user_id / owner_user_id. It is tempting to read that
-- as 13 instances of the defect that cost OteLLMServices five sites. It is not.
--
-- ⚠️ `txn_memories.user_id IS NULL` HAS A DESIGNED MEANING. From the cloned code:
--
--     memory-v2-service.js:187
--     user_id: kind === 'identity' ? null : U,   // identity is persona-global (D1 hybrid)
--
-- NULL + kind='identity' IS THE PERSONA'S OWN IDENTITY STORE. Recall unions it explicitly:
--
--     "((user_id IS NOT DISTINCT FROM :u AND kind IN ('episodic','semantic','card'))
--       OR (user_id IS NULL AND kind = 'identity'))"
--
-- So a blanket NOT NULL would DELETE HER IDENTITY STORE while claiming to fix a bug. The lesson from
-- OLS was never "NULL is bad" — it was "a rule living in a DATA SHAPE disappears when the shape
-- moves". Here NULL is carrying a real, intended distinction. The fix is to make that distinction
-- EXPLICIT (a marker that says identity) rather than to forbid the value that currently encodes it.
--
-- ⚠️ AND THERE IS AN OPEN CONFLICT, NOT A CONSTRAINT PROBLEM: identity rows are written from the TURN
-- path. Ote's decision (2026-08-10) is fixed core + learned texture, with writers limited to HIM
-- explicitly and the nightly pass — NEVER mid-turn. The cloned code violates that today. That is a
-- design fix in the memory service, and it is coupled to his L3 + layer-prompt redesign, so it is his
-- call and not something a migration should pre-empt.
-- ─────────────────────────────────────────────────────────────────────────────────────

SET search_path = persona_sotera, public;

-- ── §1 — SAFE NOW: owners that have no designed NULL meaning ────────────────────────
-- Verified 2026-08-10: zero NULL rows present in each, so these tighten without a backfill.
-- ⚠️ Apply AFTER the strip pass and re-verify with real turns. A constraint added before the code
-- that writes it is settled turns a silent bug into a live 500 in front of whoever is using her.

-- A conversation always belongs to someone.
-- ALTER TABLE txn_conversations ALTER COLUMN user_id SET NOT NULL;

-- The exact shape of the OLS defect: a NULL owner meant "root", root gained a users row, and
-- owner-bound keys silently became root-scoped.
-- ALTER TABLE mst_api_keys ALTER COLUMN owner_user_id SET NOT NULL;

-- A provider belongs to whoever brought the key.
-- ALTER TABLE mst_providers ALTER COLUMN owner_user_id SET NOT NULL;


-- ── §2 — NEEDS A DECISION FIRST (do not uncomment without one) ───────────────────────
--
-- txn_memories.user_id      NULL = persona-global identity (see §0). Tightening requires replacing
--                           the marker with something explicit first — e.g. a `scope` column
--                           ('user' | 'persona') — and migrating existing identity rows onto it.
--                           Coupled to Ote's identity design; his call.
--
-- mst_slots.user_id         Slots are scoped per (persona, user); a persona-wide slot may be
--                           legitimate for the same reason as above.
--
-- log_usage.user_id         Attribution. In OLS, NULL meant root; here root HAS an id, so NULL
--                           should never be written — but historical/system rows may want a home.
--                           Decide whether unattributed usage is possible at all before forbidding it.
--
-- txn_feedback.user_id      Only meaningful if feedback survives the strip (multi-user product
-- txn_feedback.taken_by     surface — she is single-user, so this may simply be dropped instead).


-- ── §3 — STILL TO PORT FROM 001 (the parts that were never about NULL) ──────────────
-- These carried the memory findings and have no equivalent in OLS's schema. They are additive and
-- safe, but they belong with the memory-service work rather than with an owner migration:
--
--   • provenance as a real enum (quoted | elicited | synthesized | observed) + a CHECK that a
--     `quoted` memory must carry its source_message_id.        [R1]
--   • txn_agreements as its own table — shared context, not a fact with null entity/attribute. [R2]
--   • an absolute time anchor on time-bearing rows.            [R3]
--   • state + partial indexes so forgotten rows are outside the retrieval path, not merely flagged. [R6]
--   • one live memory per slot, enforced by a unique partial index.  [R7]
--
-- Full derivation and the measured failures behind each:
--   Reference/docs/ANALYSIS_MEMORY_FINDINGS_FOR_SOTERA.md
--   Backend/database/migrations/001_core.sql  (kept as the spec, NOT as applied DDL)
