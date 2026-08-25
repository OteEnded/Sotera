-- ⭐⭐⭐ 028 · A STANDING CROSS-ROOM GRANT FOR A DEV ACCOUNT. ⛔ NOT a change to the memory model.
--
-- Ote, 2026-08-25: *"Add a distinct account-level permission for Sotera cross-room conversation access…
-- This is a dev-account capability, not a change to Sotera's memory ownership/access model."*
--
-- ── ⛔⛔ WHY THIS IS NOT `memory_access_scope` ──────────────────────────────────────────────────────
-- 021's own header carries his ruling: *"Don't make memory_access_scope the mechanism that lets Sotera
-- remember herself."* That enum answers ONE question — may this account be told the TEXT of Sotera's own
-- memories — and it is deliberately two-valued. Widening it would make one lever answer two unrelated
-- questions, and the next person reading `sotera_memory` would have no way to know which one was meant.
-- ⇒ a separate column, a separate capability, a separate audit value.
--
-- ── ⭐⭐ WHAT IT GRANTS, AND WHAT IT DOES NOT ──────────────────────────────────────────────────────
--   GRANTS      the ACCESS step: she may cross the room boundary without a human answering a card first
--   ⛔ NOT      quotability. The utterance boundary is unchanged: retrieval is free, the utterance is
--               governed, and `access_sotera_memory` still decides whether TEXT may be spoken here.
--   ⛔ NOT      silence. Every cross-room read still writes a `log_disclosure_events` row — the grant
--               changes WHO authorized it (`standing_grant`), never WHETHER it is recorded.
--
-- ⚠️ AND IT MUST NOT WEAKEN THE PER-CASE PATH FOR ANYONE ELSE. Default FALSE, and the honouring rule
-- mirrors 020's hard-won lesson: an automatic grant is keyed to (from_room → into_conversation), so a
-- session WITHOUT the capability could otherwise inherit one created by a session that had it. 020 closed
-- exactly that leak for `root_session` after `disclosure-inspect-check` caught it live. Same rule here.
--
-- ⭐ REVOCABLE: set the column false. Existing grant rows keep their audit trail and expire on their own.

-- The migration runner does not set a schema, so name it here exactly as 021 does.
SET search_path = persona_sotera, public;

BEGIN;

-- ⭐ A BOOLEAN, NOT AN ENUM. There is one question here — may this account's Sotera cross rooms without a
-- card — and it has two answers. ⛔ An enum invites a third value later that means something else.
ALTER TABLE mst_users
    ADD COLUMN IF NOT EXISTS cross_room_conversations BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN mst_users.cross_room_conversations IS
    'Standing grant: Sotera, operating through THIS account, may cross the room boundary to read '
    'conversations without a human answering a request_room_access card each time. Default FALSE. '
    'Grants ACCESS only -- the utterance boundary is unchanged and every read is still recorded in '
    'log_disclosure_events with authorized_via = standing_grant. Revoke by setting FALSE. '
    'DISTINCT from memory_access_scope, which governs whether this account may be TOLD the text of '
    'Sotera''s own memories (migration 021) -- see 028 for why the two are not merged.';

COMMIT;

-- ⚠️ `ALTER TYPE … ADD VALUE` cannot be used in the transaction that adds it (Postgres), which is why 020
-- put it after its own COMMIT and why this one does the same. Same reason, same shape.
ALTER TYPE disclosure_authz ADD VALUE IF NOT EXISTS 'standing_grant';

-- ⭐ PROOF GUARDS. A migration that silently did nothing is worse than one that failed.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'persona_sotera' AND table_name = 'mst_users'
                      AND column_name = 'cross_room_conversations') THEN
        RAISE EXCEPTION '028: cross_room_conversations column was not created';
    END IF;

    -- ⛔ DEFAULT-OFF IS THE SAFETY PROPERTY, so it is asserted rather than assumed.
    IF EXISTS (SELECT 1 FROM mst_users WHERE cross_room_conversations IS TRUE) THEN
        RAISE EXCEPTION '028: no account may hold the standing grant at migration time';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                    WHERE t.typname = 'disclosure_authz' AND e.enumlabel = 'standing_grant') THEN
        RAISE EXCEPTION '028: standing_grant was not added to disclosure_authz';
    END IF;

    -- ⛔ AND THE OTHER LEVER IS UNTOUCHED. 021's enum must still have exactly its two values; if this
    -- migration ever widens it, the separation Ote asked for has been quietly undone.
    IF (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'memory_access_scope') <> 2 THEN
        RAISE EXCEPTION '028: memory_access_scope was modified -- it must stay none/sotera_memory';
    END IF;
END $$;
