-- 013 — D-2: AN INTENTION BELONGS TO A ROOM, not to a person across all their rooms.
--
-- Ote, 2026-08-20, approving it: *"D-2 — re-grain intentions to the room. The leak is real, and I agree
-- free-text state must follow the room boundary."*
--
-- ── THE LEAK, MEASURED ─────────────────────────────────────────────────────────────────────────────
-- `kavi` and `kavi_alt` are two accounts of one person — two rooms, one human — so his model was
-- testable before he built a single new account. Measured 2026-08-20 through the real service objects:
--
--     account memory (free text)      kavi 4 rows | kavi_alt 3 rows   → does NOT cross  ✅
--     stance records (closed vocab)   same 3      | same 3            → crosses         ✅ and should
--     INTENTION (free text)           same row    | same row          → CROSSES         ⛔ the leak
--
-- An intention formed in `Ote_Finance` ("work out why his tax export double-counts") would appear in
-- `Ote_Streamer`, because both rooms share one `person_id`.
--
-- ── ⭐ THE RULE THIS IMPLEMENTS ────────────────────────────────────────────────────────────────────
--     A layer whose privacy comes from a CLOSED VOCABULARY may be PERSON-grained.
--     A layer whose privacy comes from SCOPE must be ROOM-grained.
--
-- Stance is a fixed label from a ten-item enum and cannot carry a secret, so person-graining it is safe
-- and desirable. An intention is 280-500 characters of her own prose about someone's work, so its grain
-- has to BE the disclosure boundary.
--
-- ⚠️ AND THIS IS NOT A RETREAT TO CONVERSATION SCOPING. Keying state to a conversation made her describe
-- herself as *"just parallel processes, each alive only within its own context window"*. The
-- fragmentation risk was about EPHEMERALITY, not multiplicity: a room is a durable part of someone's
-- life, so "one purpose per room" is as ordinary as having a job and a hobby. `person_id` STAYS — it is
-- what makes the record about somebody, and what makes de-identification work.
--
-- ── THE BACKFILL, AND ITS PROVENANCE ───────────────────────────────────────────────────────────────
-- ⚠️ The table has no account column to backfill FROM, so there is nothing to derive. One open row
-- exists. Its provenance is known and recorded rather than guessed: it was created in a conversation
-- driven as `kavi` on 2026-08-19 (AI_ProgressTracking, entry 2026-08-19 20:40 — "she set one on the first
-- natural cue"). So it is backfilled to that account EXPLICITLY, and the migration refuses to continue if
-- any row is left without a room. Guessing a room for a free-text row is the one thing this migration
-- must not do.
--
-- Apply:  node test/maintenance/apply-migration.mjs 013_intention_room_grain.sql

SET search_path = persona_sotera, public;

BEGIN;

-- ── 1 · the room ───────────────────────────────────────────────────────────────────────────────────
-- FK with CASCADE, unlike the loose refs in the log_ tables: an intention IS that room's state, so if
-- the room goes, its purpose goes with it. (`person_id` keeps its own CASCADE for the person.)
ALTER TABLE txn_intentions
    ADD COLUMN IF NOT EXISTS room_user_id UUID REFERENCES mst_users(id) ON DELETE CASCADE;

-- ── 2 · backfill the known row, then refuse to proceed on anything unattributed ────────────────────
UPDATE txn_intentions
   SET room_user_id = (SELECT id FROM mst_users WHERE username = 'kavi')
 WHERE room_user_id IS NULL
   AND person_id = (SELECT person_id FROM mst_users WHERE username = 'kavi');

DO $$
DECLARE orphans BIGINT;
BEGIN
    SELECT count(*) INTO orphans FROM txn_intentions WHERE room_user_id IS NULL;
    IF orphans > 0 THEN
        RAISE EXCEPTION '% intention(s) have no room and no derivable provenance — refusing to guess one. Inspect them and set room_user_id by hand', orphans;
    END IF;
END $$;

ALTER TABLE txn_intentions ALTER COLUMN room_user_id SET NOT NULL;

COMMENT ON COLUMN txn_intentions.room_user_id IS
 'The ROOM (account) this intention belongs to. THE disclosure boundary for this table: an intention taken on in one room is not visible in another, even when both rooms belong to the same person. person_id records who it is WITH, and is not a read key.';

-- ── 3 · ⭐ ONE OPEN INTENTION PER ROOM (was: per person) ───────────────────────────────────────────
-- The uniqueness moves with the grain. It still yields exactly one open row per read scope, which is
-- what keeps every tool free of ids: inspect/update/close know which row they mean without being told.
DROP INDEX IF EXISTS txn_intentions_one_open_per_person;
CREATE UNIQUE INDEX IF NOT EXISTS txn_intentions_one_open_per_room
    ON txn_intentions (room_user_id) WHERE state = 'open';

CREATE INDEX IF NOT EXISTS txn_intentions_room_idx ON txn_intentions (room_user_id, created_at DESC);

-- ── 4 · prove the shape and the outcome ───────────────────────────────────────────────────────────
DO $$
DECLARE n_open_idx INT; n_old_idx INT; rows_total BIGINT;
BEGIN
    SELECT count(*) INTO n_old_idx FROM pg_indexes
     WHERE schemaname = 'persona_sotera' AND indexname = 'txn_intentions_one_open_per_person';
    IF n_old_idx <> 0 THEN
        RAISE EXCEPTION 'the person-grained unique index still exists — two uniqueness rules would fight';
    END IF;

    SELECT count(*) INTO n_open_idx FROM pg_indexes
     WHERE schemaname = 'persona_sotera' AND indexname = 'txn_intentions_one_open_per_room';
    IF n_open_idx <> 1 THEN
        RAISE EXCEPTION 'the one-open-per-room index is missing — the id-free tool surface depends on it';
    END IF;

    -- The forbidden-column guarantee from 009 still holds: a room column is a scope key, not content.
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'persona_sotera' AND table_name = 'txn_intentions'
                  AND (column_name ILIKE '%conversation%' OR column_name ILIKE '%message%'
                       OR column_name ILIKE '%transcript%' OR column_name ILIKE '%content%')) THEN
        RAISE EXCEPTION 'txn_intentions gained a column that could hold a transcript';
    END IF;

    SELECT count(*) INTO rows_total FROM txn_intentions;
    RAISE NOTICE '013: intentions are room-grained — % row(s), all with a room, one open per room', rows_total;
END $$;

COMMIT;
