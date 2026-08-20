-- 014 — THE DISCLOSURE EVENT LOG. Metadata only, and DELIBERATELY INERT.
--
-- Stage 2 of the D-4/D-5 build (Ote, 2026-08-20): *"Stage 2 must remain completely inert: no writer, no
-- reader, no authority change, metadata only, absolutely no content column, migration assertions proving
-- the absence of content storage."*
--
-- ⚠️ NOTHING WRITES THIS TABLE AND NOTHING READS IT. That is the whole point of applying it now, on its
-- own: the shape of the record gets settled and reviewed BEFORE any code can start depending on it. A
-- schema argued about after there is a writer is a schema that loses the argument. `test/checks/
-- disclosure-log-check.mjs` asserts the inertness — if a reference to this table appears anywhere in
-- Backend/ outside migrations, that check goes red on purpose.
--
-- Modelled on 010 (`log_tool_calls`), whose rule carries over unchanged: RECORD THE SHAPE, NEVER THE
-- PAYLOAD. A disclosure log holding the disclosed material would be a THIRD copy of it, in neither room,
-- under different retention — which is the accretion failure the room model exists to prevent.
--
-- ── ⭐ FOUR DECISIONS THIS TABLE MAKES, STATED HERE BECAUSE THEY ARE ARCHITECTURE, NOT SCHEMA TASTE ──
--
-- ⭐ 1 · `scope` IS A CLOSED VOCABULARY, NOT FREE TEXT.
-- The RFC sketched `scope` as a description of the granted predicate — *"semantic facts, subject=Ote,
-- limit 20"*. A capped TEXT column would have carried that fine, and it would also have carried a
-- disclosed fact. This project's own rule, from the tier-C stance records: **a leak requires expressive
-- capacity; remove the capacity.** So the scope is `scope_kind` (an enum over the five stores that can
-- be disclosed) + `scope_limit` (an integer). There is no column in which a sentence can be written.
--   ⇒ Adding a sixth disclosable store requires a migration, which requires a decision. That is the
--     feature, not the friction.
--
-- ⭐⭐ 2 · `authorized_via` HAS EXACTLY ONE LEGAL VALUE, AND `'prose'` IS NOT IT.
-- The invariant is *authorization never travels through prose*. `interaction_id` was supposed to make
-- that checkable — but `txn_interaction_sessions` is CASCADE-deleted with its conversation, so the proof
-- evaporates while this row (loose refs, by design) survives. A dangling uuid proves nothing.
--   ⇒ The MECHANISM is recorded in an enum whose only value is 'held_turn_card'. The schema therefore
--     **cannot represent a disclosure that was authorized by a sentence.** Same shape as the
--     one-open-intention index and the id-free tool surface: the boundary is the absence of the option.
--
-- ⭐ 3 · NO ROOM-NAME SNAPSHOTS, even though there IS an authorizer-name snapshot.
-- 010 snapshots `username` so attribution survives account deletion, and that stays. But the RFC already
-- ruled that a ROOM NAME is content: *"A room named `Ote_Divorce_Lawyer` is content."* A room label is a
-- topic its owner chose; a login name is attribution. So rooms are recorded by id only.
--   ⚠️ The cost is real and accepted: delete a room and this log can no longer say what it was called.
--     "No content in any audit" is worth more than a recoverable label.
--
-- ⭐ 4 · `lifetime` HAS NO `'standing'` VALUE.
-- D-5a's recommendation was conversation-scoped grants and never standing-by-default, because *a standing
-- grant is room-merging with extra steps*. Leaving the value out of the enum means a standing grant
-- cannot be recorded, so it cannot be quietly shipped — it needs a migration, and a migration is a
-- conversation with Ote.
--
-- ── LOOSE REFS, LIKE EVERY OTHER log_ TABLE ────────────────────────────────────────────────────────
-- No foreign keys at all, asserted below. Deleting a room, a conversation, an interaction or a user must
-- degrade the record, never delete the evidence of what crossed a boundary.
--
-- Apply:  node test/maintenance/apply-migration.mjs 014_disclosure_events.sql

SET search_path = persona_sotera, public;

BEGIN;

DO $$
BEGIN
    -- The five stores that could ever be disclosed. A closed vocabulary — see decision 1.
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'disclosure_scope') THEN
        CREATE TYPE disclosure_scope AS ENUM ('semantic_fact', 'identity_fact', 'stance', 'intention', 'message');
    END IF;
    -- ⛔ NO 'standing'. See decision 4.
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'disclosure_lifetime') THEN
        CREATE TYPE disclosure_lifetime AS ENUM ('turn', 'conversation');
    END IF;
    -- ⛔ NO 'prose'. See decision 2. One value today, and that is deliberate.
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'disclosure_authz') THEN
        CREATE TYPE disclosure_authz AS ENUM ('held_turn_card');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS log_disclosure_events (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rolling_id              BIGSERIAL UNIQUE NOT NULL,

    disclosed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- WHICH BOUNDARY WAS CROSSED, and in which direction. Ids only — no name snapshots (decision 3).
    from_room_user_id       UUID        NOT NULL,
    into_room_user_id       UUID        NOT NULL,
    -- WHERE it landed. Loose ref: the evidence outlives the conversation.
    into_conversation_id    UUID,

    -- WHO authorized it. Loose ref + a name snapshot, so the trail survives account deletion.
    authorized_by_user_id   UUID,
    authorized_by_username  TEXT,
    -- ⭐⭐ HOW they authorized it. The enum has no value for prose (decision 2).
    authorized_via          disclosure_authz NOT NULL,
    -- The held-turn row, for forensics WHILE IT EXISTS. It is CASCADE-deleted with its conversation, so
    -- this is a best-effort pointer and never the proof — `authorized_via` is the proof.
    interaction_id          UUID,

    -- WHOSE MATERIAL crossed. The room is the container; the subject is the entitlement (RFC §3a).
    subject_person_id       UUID,

    -- ⭐ THE PREDICATE THAT WAS GRANTED, as a closed vocabulary plus a number (decision 1).
    scope_kind              disclosure_scope NOT NULL,
    scope_limit             INTEGER,

    -- HOW MUCH crossed. A count is not content.
    item_count              INTEGER     NOT NULL DEFAULT 0,

    -- HOW LONG the grant lasted, and when it lapsed. No standing grants (decision 4).
    lifetime                disclosure_lifetime NOT NULL,
    expires_at              TIMESTAMPTZ,
    -- Forward-only by nature: revocation stops future turns and cannot unsay what was said (D-5e).
    revoked_at              TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT log_disclosure_events_count_sane CHECK (item_count >= 0),
    CONSTRAINT log_disclosure_events_limit_sane CHECK (scope_limit IS NULL OR scope_limit > 0),
    -- A disclosure into the room it came from is not a disclosure; it would mean the predicate was
    -- widened for no boundary crossing at all.
    CONSTRAINT log_disclosure_events_crosses_rooms CHECK (from_room_user_id <> into_room_user_id)
);

COMMENT ON TABLE log_disclosure_events IS
 'Append-only audit of every act of disclosure across the room boundary: which rooms, which direction, who authorized it and through which held-turn card, whose material it was, what predicate was granted, how many items crossed, how long the grant lasted. Holds NO disclosed content and NO item ids — a disclosure log carrying the material would be a third copy of it, in neither room. Loose refs only, so deleting a room, conversation or user degrades the record instead of destroying the evidence. INERT as of migration 014: nothing writes it and nothing reads it.';

COMMENT ON COLUMN log_disclosure_events.authorized_via IS
 'HOW the disclosure was authorized. The enum deliberately has no value for prose: authorization never travels through prose, and a schema that cannot record a prose authorization cannot be talked into accepting one.';

COMMENT ON COLUMN log_disclosure_events.scope_kind IS
 'WHICH store was disclosed, from a closed vocabulary. Deliberately not a free-text description of the predicate: a sentence-shaped column is a column that can hold a disclosed fact.';

COMMENT ON COLUMN log_disclosure_events.subject_person_id IS
 'WHOSE material crossed. Disclosure filters by room AND by subject — a room may hold other people''s material, and root reading across his own rooms is not root reading a viewer''s messages.';

COMMENT ON COLUMN log_disclosure_events.lifetime IS
 'How long the grant lasted. The enum has no ''standing'' value on purpose: a standing grant is room-merging with extra steps, so shipping one would require a migration and therefore a decision.';

-- Read patterns, for when there IS a reader: "what crossed lately", "what has left this room",
-- "what did this person authorize", "what is still live".
CREATE INDEX IF NOT EXISTS log_disclosure_events_at_idx      ON log_disclosure_events (disclosed_at DESC);
CREATE INDEX IF NOT EXISTS log_disclosure_events_from_idx    ON log_disclosure_events (from_room_user_id, disclosed_at DESC);
CREATE INDEX IF NOT EXISTS log_disclosure_events_into_idx    ON log_disclosure_events (into_room_user_id, disclosed_at DESC);
CREATE INDEX IF NOT EXISTS log_disclosure_events_subject_idx ON log_disclosure_events (subject_person_id, disclosed_at DESC);
CREATE INDEX IF NOT EXISTS log_disclosure_events_live_idx    ON log_disclosure_events (disclosed_at DESC) WHERE revoked_at IS NULL;

-- ── ⭐ PROVE THE SHAPE. Same discipline as 007, 009, 010 and 013. ──────────────────────────────────
DO $$
DECLARE
    bad     TEXT;
    n_fk    INTEGER;
    n_authz INTEGER;
    n_life  INTEGER;
BEGIN
    -- 1 · NO COLUMN THAT COULD HOLD WHAT WAS DISCLOSED, and none that could hold WHICH ROWS crossed.
    -- Item ids are as good as the items: given an id and any future reader, the content is one join away.
    SELECT string_agg(column_name, ', ') INTO bad
      FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'log_disclosure_events'
       AND (column_name IN ('content', 'text', 'body', 'payload', 'value', 'values', 'fact', 'facts',
                            'intent', 'summary', 'topic', 'title', 'note', 'items', 'item_ids',
                            'memory_id', 'memory_ids', 'message_id', 'message_ids', 'scope',
                            'from_room_name', 'into_room_name', 'room_name')
            OR column_name ILIKE '%content%' OR column_name ILIKE '%payload%'
            OR column_name ILIKE '%excerpt%' OR column_name ILIKE '%snippet%'
            OR column_name ILIKE '%transcript%');
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'log_disclosure_events has forbidden column(s): % — this log records that a boundary was crossed, never what crossed it', bad;
    END IF;

    -- 2 · NO FOREIGN KEYS. The evidence must outlive every row it points at.
    SELECT count(*) INTO n_fk FROM information_schema.table_constraints
     WHERE table_schema = 'persona_sotera' AND table_name = 'log_disclosure_events'
       AND constraint_type = 'FOREIGN KEY';
    IF n_fk <> 0 THEN
        RAISE EXCEPTION 'log_disclosure_events has % foreign key(s) — deleting a room or a user must degrade the record, not delete the evidence', n_fk;
    END IF;

    -- 3 · THE TWO ENUMS THAT ARE INVARIANTS RATHER THAN VOCABULARIES.
    SELECT count(*) INTO n_authz FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'disclosure_authz';
    IF n_authz <> 1 THEN
        RAISE EXCEPTION 'disclosure_authz has % value(s) — it must have exactly one, and it must not be able to say "prose"', n_authz;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'disclosure_authz' AND e.enumlabel <> 'held_turn_card') THEN
        RAISE EXCEPTION 'disclosure_authz gained a value other than held_turn_card — authorization must never travel through prose';
    END IF;

    SELECT count(*) INTO n_life FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'disclosure_lifetime';
    IF n_life <> 2 THEN
        RAISE EXCEPTION 'disclosure_lifetime has % value(s) — expected exactly turn and conversation', n_life;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'disclosure_lifetime' AND e.enumlabel = 'standing') THEN
        RAISE EXCEPTION 'disclosure_lifetime gained a standing value — a standing grant is room-merging with extra steps';
    END IF;

    RAISE NOTICE '014: log_disclosure_events created — INERT (no writer, no reader), metadata only, no content column, no foreign keys, and no way to record a prose authorization or a standing grant';
END $$;

COMMIT;
