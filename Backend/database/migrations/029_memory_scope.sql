-- ⭐⭐⭐ 029 · AN EXPLICIT SCOPE AXIS FOR MEMORY. ⛔ `user_id IS NULL` stops meaning anything.
--
-- Ote, 2026-08-26: *"The actual architectural defect is that user_id = NULL is overloaded to represent
-- both persona-global and other meanings… fix the representation first; reconcile history second."*
--
-- ── ⚠️⚠️ THE OVERLOAD, NAMED IN THIS CODEBASE ON 2026-08-06 AND UNFIXED SINCE ──────────────────────
-- `auth/root-identity.js` states it exactly:
--     *"`user_id IS NULL` means TWO different things — 'persona-global identity memory' (by design) and
--      'root wrote this' (by accident). Zero identity rows exist today, so the collision is latent, but
--      it is structural and it merges two concepts the moment both populate."*
-- ⭐ Both halves have since moved: root IS now connected to a real `mst_users` row, so the accidental
-- meaning is retired — and on 2026-08-25 the FIRST identity row was written, so the by-design meaning
-- populated. The collision stopped being latent, and four assertions have been red ever since saying so.
--
-- ── ⭐⭐ THE THREE AXES STAY DISTINCT, AND THIS ADDS THE MISSING ONE ────────────────────────────────
--     author   whose memory is this?        — HER decision            `txn_memories.author`
--     subject  who or what is it about?     — free of author          `subject_person_id` / `entity`
--     owner    whose is it?                 — ⛔ derived, never stored `ownerOf()`
--     scope    WHERE IS IT REACHABLE FROM?  — ⭐ this migration       `txn_memories.scope`
-- ⛔ ABOUT ≠ OWNER ≠ SCOPE. A memory she authored, about Ote, formed in his room, that is true of her
-- everywhere is: author=persona, subject=Ote, owner=sotera (derived), scope=persona_global, user_id=his
-- room. Four different answers, and before this migration two of them shared one nullable column.
--
-- ── ⭐ WHAT `user_id` MEANS AFTERWARDS, WITH NO EXCEPTIONS ─────────────────────────────────────────
-- **The room the memory was FORMED IN.** Always present, never a proxy for anything. Migration 015 already
-- says this for persona-authored rows — *"`user_id` is the CONTEXT the memory was formed in"* — and this
-- makes it true for every row instead of most of them.
-- ⇒ reachability is `scope = 'persona_global' OR user_id = :me`, and ⛔ a missing owner can no longer be
-- read as "everyone's".
--
-- ── ⭐⭐⭐ THE ONE ROW THIS MOVES, AND WHY IT IS NOT A NEW DECISION ─────────────────────────────────
-- `d211f5b4` is the only `user_id IS NULL` row in the store. Ote: *"Determine what d211f5b4 should mean
-- under the new model from its existing provenance/structure. Don't manufacture a new semantic decision
-- just to repair metadata."*
--   · `kind = 'identity'`                     ⇒ written to be true of her wherever she is ⇒ persona_global
--   · `subject_person_id` = Sotera-the-persona ⇒ about her, already recorded
--   · `source_message_id` → conversation `7198c1b0` → room `ote` ⇒ ⭐ its formation room is KNOWN
-- ⛔ Nothing is invented: the scope comes from the kind it was already written as, and the room comes from
-- its own provenance chain. Its `author` is NOT touched — that is a separate axis and a separate question.
--
-- ⛔⛔ AND THE BACKFILL REFUSES TO GUESS. A persona-global row whose formation room cannot be resolved
-- from its own provenance FAILS the migration rather than being assigned one. Assigning a plausible room
-- is exactly the class of silent repair that produced the mess this arc has spent a week unpicking.

SET search_path = persona_sotera, public;

BEGIN;

-- ⭐ An enum rather than a boolean: "is it global" answers today's question and would have to be replaced
-- the first time a third scope exists (a shared room, a project). A named vocabulary can grow; a boolean
-- named for one of its two states cannot.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'memory_scope') THEN
        CREATE TYPE memory_scope AS ENUM ('room', 'persona_global');
    END IF;
END $$;

-- ⭐ DEFAULT 'room' — the overwhelming majority, and the safe reading. A row that forgets to declare its
-- scope becomes reachable from ONE room, never from all of them: the failure direction that loses a
-- memory rather than the one that leaks it.
ALTER TABLE txn_memories ADD COLUMN IF NOT EXISTS scope memory_scope NOT NULL DEFAULT 'room';

COMMENT ON COLUMN txn_memories.scope IS
    'WHERE this memory is reachable from. room = the account named by user_id. persona_global = every '
    'room, because it is true of the persona wherever she is. Replaces the overloaded `user_id IS NULL` '
    'proxy (see 029). ORTHOGONAL to `author` (whose memory it is, her decision) and to subject (what it '
    'is about) -- ABOUT != OWNER != SCOPE.';

COMMENT ON COLUMN txn_memories.user_id IS
    'The room the memory was FORMED IN. Always present. For a persona-authored row this is context and '
    'NOT ownership (see 015); for a persona_global row it is where it happened and NOT where it can be '
    'read. ⛔ It is never a scope proxy: NULL no longer means "everyone''s" (see 029).';

-- ── ⭐ THE BACKFILL · scope from the kind it was already written as ────────────────────────────────
UPDATE txn_memories SET scope = 'persona_global'
 WHERE kind = 'identity' AND user_id IS NULL;

-- ── ⭐⭐ AND THE FORMATION ROOM, FROM THE ROW'S OWN PROVENANCE CHAIN ───────────────────────────────
-- ⛔ Only from `source_message_id → txn_messages → txn_conversations.user_id`. No fallback, no "the room
-- with the most rows", no root. If the chain is broken the row keeps a NULL and the guard below refuses
-- the whole migration.
UPDATE txn_memories m
   SET user_id = c.user_id
  FROM txn_messages msg
  JOIN txn_conversations c ON c.id = msg.conversation_id
 WHERE m.user_id IS NULL
   AND m.source_message_id = msg.id
   AND c.user_id IS NOT NULL;

COMMIT;

-- ⭐⭐⭐ PROOF GUARDS. A migration that silently did nothing is worse than one that failed.
DO $$
DECLARE
    orphans int;
    globals int;
    global_without_room int;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'persona_sotera' AND table_name = 'txn_memories'
                      AND column_name = 'scope') THEN
        RAISE EXCEPTION '029: scope column was not created';
    END IF;

    -- ⛔⛔ THE INVARIANT THIS MIGRATION EXISTS FOR. If any row still has a NULL user_id, the overload is
    -- still live and the four tripwires are still right to be red.
    SELECT count(*) INTO orphans FROM txn_memories WHERE user_id IS NULL;
    IF orphans > 0 THEN
        RAISE EXCEPTION '029: % row(s) still have a NULL user_id -- their provenance chain could not '
                        'resolve a formation room, and this migration REFUSES to guess one', orphans;
    END IF;

    -- ⭐ The persona-global slice must not be empty: the row that made the overload real is the row this
    -- migration exists to represent properly. An empty slice here means the backfill matched nothing and
    -- the change is decorative.
    SELECT count(*) INTO globals FROM txn_memories WHERE scope = 'persona_global';
    IF globals = 0 THEN
        RAISE EXCEPTION '029: no row was classified persona_global -- the backfill matched nothing';
    END IF;

    -- ⛔ AND EVERY GLOBAL ROW KEEPS ITS FORMATION CONTEXT. "Reachable from everywhere" must never mean
    -- "came from nowhere" -- losing where a memory was formed is how provenance dies quietly.
    SELECT count(*) INTO global_without_room FROM txn_memories
     WHERE scope = 'persona_global' AND user_id IS NULL;
    IF global_without_room > 0 THEN
        RAISE EXCEPTION '029: % persona_global row(s) have no formation room', global_without_room;
    END IF;
END $$;

-- ⚠️ `SET NOT NULL` is deliberately OUTSIDE the transaction above and AFTER the guards: it must run only
-- once the backfill has been proven complete, so a failure leaves the column nullable and the data intact
-- rather than aborting mid-rewrite.
ALTER TABLE txn_memories ALTER COLUMN user_id SET NOT NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'persona_sotera' AND table_name = 'txn_memories'
                  AND column_name = 'user_id' AND is_nullable = 'YES') THEN
        RAISE EXCEPTION '029: user_id is still nullable -- NULL can still be minted as a scope proxy';
    END IF;
END $$;
