-- ⭐⭐⭐ 035 · WHO MAY WRITE SOTERA'S GLOBALLY REACHABLE SELF-STATE. ⛔ NOT a disclosure permission.
--
-- Ote, 2026-09-02, choosing root-only and then widening it by one step:
--     *"persona_global isn't just another storage scope. It is universally readable, so writing it changes
--      Sotera's globally reachable self-state. I don't want ordinary admin authority to be enough for that
--      in the first version."*
--     *"Root: always authorized. Explicit account permission: authorized when the account has the dedicated
--      permission to manage/write persona-global memory. No permission: REFUSE."*
--
-- ── ⚠️⚠️ THE MEASUREMENT THAT MAKES THIS A PERMISSION AT ALL ──────────────────────────────────────
-- `own-memory-host.js` reads her self-memory as `WHERE scope = 'persona_global'` with NO author filter,
-- NO user filter and NO room filter — because that is what 029 defines the scope to MEAN. ⇒ writing a
-- persona_global row is a DISCLOSURE ACT, not a storage choice, and it is the one write in this store
-- whose effect is not confined to the room it happened in.
--
-- ── ⛔⛔ WHY THIS IS NOT `memory_access_scope`, AND NOT `cross_room_conversations` ─────────────────
-- Ote: *"don't reuse the existing 'may be told about Sotera's own history' permission. That's a disclosure
-- permission and should remain separate from permission to modify Sotera's globally reachable state."*
-- ⭐ That is this codebase's own law already — 028's header says of the same pair: *"One lever answering
-- two questions is unreadable the first time they disagree."* Three questions, three columns:
--     memory_access_scope        may this account be TOLD the text of her memories        (021)
--     cross_room_conversations   may she CROSS a room boundary without a card             (028)
--     persona_global_write       may a write from this room CHANGE what is true of her    (035, here)
-- ⭐ The first two are about READING. This one is the first that governs a WRITE, which is exactly why it
-- must not be folded into either: a grant to be told something is not a grant to change it.
--
-- ── ⭐ ROOT IS THE AUTHORITY, ⛔ NOT THE MECHANISM ────────────────────────────────────────────────
-- Same shape as 021: root is always authorized, and everybody else needs an explicit standing grant.
-- ⛔ Role is NOT sufficient and must never become so — Ote refused `admin` explicitly. ⛔ And root-ness is
-- resolved from `auth.root.userConnected` in config, ⛔ never from a NULL role, a missing id, or any other
-- shape of account data: that inference is this project's most-repeated defect (nine sites, one of which
-- turned an unowned row into a privilege grant).
--
-- ⭐ REVOCABLE: set the column false. ⛔ Rows already written keep their scope — this governs the WRITE,
-- and un-writing a memory is a different act with its own audit.

-- The migration runner does not set a schema, so name it here exactly as 021 and 028 do.
SET search_path = persona_sotera, public;

BEGIN;

-- ⭐ A BOOLEAN, NOT AN ENUM — 028's reasoning, unchanged. There is one question here (may a write from
-- this room reach every room) and it has two answers. ⛔ An enum invites a third value that means
-- something else, and this is the last column in the store that should acquire a fuzzy middle.
ALTER TABLE mst_users
    ADD COLUMN IF NOT EXISTS persona_global_write BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN mst_users.persona_global_write IS
    'Standing grant: a memory written while Sotera is in THIS account''s room may declare '
    'scope = persona_global -- reachable from every room, because it is true of her wherever she is '
    '(029). Default FALSE; root is always authorized without it. Role is NOT sufficient: admin does not '
    'grant this. Revoke by setting FALSE (already-written rows keep their scope). '
    'DISTINCT from memory_access_scope (may this account be TOLD her memories, 021) and from '
    'cross_room_conversations (may she cross a room to READ, 028) -- those govern reading, this governs '
    'writing what is true of her everywhere. See 035 for why the three are not merged.';

COMMIT;

-- ── ⭐⭐ AND THE REFUSAL MUST BE RECORDABLE, NOT MERELY THROWN ────────────────────────────────────
-- 032's principle applies here unchanged: *a dropped observation and one that was never made must not
-- look alike* — this project has paid for that ambiguity three times. A persona-global write that was
-- REFUSED must not be indistinguishable from one nobody attempted.
--
-- ⚠️ These two are a DIFFERENT CLASS from the five already in the enum. Those five are semantic-shape
-- refusals (*this claim is not property-shaped*); these two are AUTHORIZATION refusals (*this room may
-- not make that claim reach every room*). They share the table because the table's question is "which
-- proposed memories were declined, and what were they" — ⛔ they do NOT share a meaning, and the names
-- say which is which rather than leaving a reader to infer it.
--
-- ⚠️ `ALTER TYPE … ADD VALUE` cannot run in the transaction that uses it (Postgres), which is why 020 and
-- 028 both put theirs after their own COMMIT. Same reason, same shape.
ALTER TYPE memory_refusal_class ADD VALUE IF NOT EXISTS 'persona-global-unauthorized-room';
ALTER TYPE memory_refusal_class ADD VALUE IF NOT EXISTS 'persona-global-requires-persona-author';

-- ⭐ PROOF GUARDS. A migration that silently did nothing is worse than one that failed.
DO $$
DECLARE
    global_rows integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'persona_sotera' AND table_name = 'mst_users'
                      AND column_name = 'persona_global_write') THEN
        RAISE EXCEPTION '035: persona_global_write column was not created';
    END IF;

    -- ⛔ DEFAULT-OFF IS THE SAFETY PROPERTY, so it is asserted rather than assumed. Nobody holds a write
    -- grant at migration time; every holder is a deliberate, later act.
    IF EXISTS (SELECT 1 FROM mst_users WHERE persona_global_write IS TRUE) THEN
        RAISE EXCEPTION '035: no account may hold the persona-global write grant at migration time';
    END IF;

    -- ⛔ AND THE TWO DISCLOSURE LEVERS ARE UNTOUCHED. If this migration ever widened either, the
    -- separation Ote asked for would have been quietly undone by the change that promised to keep it.
    IF (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'memory_access_scope') <> 2 THEN
        RAISE EXCEPTION '035: memory_access_scope was modified -- it must stay none/sotera_memory';
    END IF;

    -- ⚠️ Asserted by PRESENCE, not by comparing the column to itself. The first draft of this guard did
    -- exactly that and was vacuously true — a check that cannot fail is not a check.
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'persona_sotera' AND table_name = 'mst_users'
                      AND column_name = 'cross_room_conversations') THEN
        RAISE EXCEPTION '035: cross_room_conversations disappeared -- 028 must remain intact';
    END IF;

    -- ⭐ AND THE SCOPE VOCABULARY IS UNCHANGED. 035 adds an AUTHORITY for the destination; it does not
    -- redefine the destination, and `kind = identity` keeps meaning what 029 made it mean.
    IF (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'memory_scope') <> 2 THEN
        RAISE EXCEPTION '035: memory_scope was modified -- it must stay room/persona_global';
    END IF;

    -- ⭐ The two authorization classes must actually exist, or the gate below could throw and record
    -- NOTHING — which is the exact silence 032 was built to end.
    IF (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'memory_refusal_class'
           AND e.enumlabel IN ('persona-global-unauthorized-room',
                               'persona-global-requires-persona-author')) <> 2 THEN
        RAISE EXCEPTION '035: the persona-global refusal classes were not added';
    END IF;

    SELECT count(*) INTO global_rows FROM txn_memories WHERE scope = 'persona_global';
    RAISE NOTICE '035: % existing persona_global row(s) left untouched (legacy, see the 035 analysis)', global_rows;
END $$;
