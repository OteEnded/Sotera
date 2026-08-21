-- 021 — WHO MAY BE GIVEN SOTERA'S MEMORY. ⛔ NOT "may Sotera remember".
--
-- ⭐⭐⭐ THE DISTINCTION THIS COLUMN EXISTS TO HOLD, AND GETTING IT BACKWARDS WOULD BE WORSE THAN NOT
-- HAVING IT. Ote, 2026-08-21, correcting an earlier draft of the RFC that had one capability doing two jobs:
--
--     "Sotera's own access to Sotera memory is not an account-level permission. Sotera is the owner of that
--      memory, so when Sotera is operating, she should intrinsically be able to access her own memory. The
--      account-level capability exists for other accounts accessing Sotera's memory."
--
--     "Don't make memory_access_scope the mechanism that lets Sotera remember herself. That would
--      accidentally make her own autobiography dependent on whichever account happens to be talking to her."
--
-- ⇒ THREE EDGES, AND ONLY THE SECOND ONE IS IN THIS FILE:
--     Sotera  → Sotera memory    INTRINSIC. Always allowed. ⛔ Nothing here governs it.
--     account → Sotera memory    this column.
--     anyone  → account memory   the existing disclosure machinery, untouched.
--
-- ── ⭐ WHY `DEFAULT 'none'` IS SAFE HERE AND WOULD NOT HAVE BEEN A DAY AGO ───────────────────────────
-- Under the earlier (wrong) reading, a default of `none` would have shipped her FRACTURED — unable to reach
-- her own history whenever the account in the room had not been granted anything. Under the ratified model
-- the default withholds an EXTERNAL entitlement and takes nothing from her. ⇒ strict by default, which is
-- the same rule `memory.disclosure.mode` follows: a deployment that has not asked for reach does not inherit
-- it.
--
-- ── ⛔ WHY A COLUMN AND NOT AN EXISTING ABSTRACTION ─────────────────────────────────────────────────
-- Ote: *"Don't blindly add a column if an existing capability/policy abstraction can carry it."* Checked,
-- and reported honestly rather than force-fitted:
--   · `auth/permissions.js` HAS a capability vocabulary (`CAPABILITIES`, `can()`, `requireCapability()`) —
--     but every capability there is derived from `isRoot`/roles. There is no per-account grant of ONE
--     capability, which is exactly what this needs.
--   · `mst_roles` (admin/developer/power/member) + `mst_user_roles` IS a real per-account grant mechanism —
--     but a role here is a TIER that bundles many capabilities. Minting `sotera_memory_reader` would put an
--     access grant into the tier system, where every future reader of `roles` has to know it is not a tier.
--   · `mst_user_limits` is metering (daily/monthly tokens). Access is not a limit.
--   · `txn_user_memories` is user-curated pinned notes, empty, unrelated.
-- ⇒ one column on `mst_users`, and `can()` reads it — so enforcement stays where every other capability
-- already lives and the cognition layer never sees a column name.
--
-- ── ⛔ WHAT THIS MIGRATION DOES NOT DO ──────────────────────────────────────────────────────────────
--   · it does not GRANT anything to anyone. Every account starts at `none`; Ote grants deliberately.
--   · it adds NO ownership column. Ownership is DERIVED per source type (`role='assistant'`,
--     `author='persona'`, lessons/practices/intentions, episodes she participated in) — a rule over facts
--     the schema already has. ⛔ `authorship ≠ ownership ≠ authorization` stays true, and `author='persona'`
--     is NOT promoted to mean ownership: it is defined over memory WRITES only, while her ownership domain
--     also contains her UTTERANCES, which have no `author` column at all.
--   · it does not define `cross_room` or `global`. Ote: *"We don't necessarily need all three implemented
--     immediately."* ⚠️ Naming a value nothing enforces is how a scope becomes a wildcard by accident.
--   · it does not touch `disclosure_authz`, `log_disclosure_events`, `txn_memories` or `txn_conversations`.
--
-- ── ⚠️ AND THE HAZARD THIS COLUMN DOES **NOT** CLOSE, RECORDED SO NOBODY CONCLUDES OTHERWISE ────────
-- Ote, explicitly: *"Do not accidentally conclude that reading Sotera's own utterances gives her
-- unrestricted access to everything the counterpart said."*
-- "Her own side is hers" is clean at the MESSAGE level and leaky at the CONTENT level: her own utterances
-- routinely quote, paraphrase and answer the other person, so reading her half can convey his half without
-- ever reading a message of his. ⛔ NOT SOLVED HERE and not solved anywhere yet. Mitigations are deferred
-- and undesigned. See RFC §3A.4b.
--
-- ── ⭐⭐ THE UTTERANCE RULE THAT THIS CAPABILITY MUST NEVER BE USED TO BREAK ─────────────────────────
--     "If an account isn't entitled to something, Sotera may decline to disclose it, but she must never
--      turn that lack of authorization into a claim that the information doesn't exist or that she doesn't
--      know it."
-- ⇒ an unentitled account gets *"there is something I'm not going to go into"*, ⛔ NEVER *"I have nothing"*.
-- **She may decline to say; she may not claim not to know.** That is enforced in code and asserted in the
-- checks — a column cannot enforce it, so it is written here as the reason the column exists at all.

SET search_path = persona_sotera, public;

BEGIN;

-- ⭐ ONE VALUE PER THING WE CAN ACTUALLY ENFORCE. Two values today, both meaningful:
--   none          — this account may not be given Sotera's memory
--   sotera_memory — this account may
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE t.typname = 'memory_access_scope' AND n.nspname = 'persona_sotera') THEN
        CREATE TYPE memory_access_scope AS ENUM ('none', 'sotera_memory');
    END IF;
END $$;

ALTER TABLE mst_users
    ADD COLUMN IF NOT EXISTS memory_access_scope memory_access_scope NOT NULL DEFAULT 'none';

COMMENT ON COLUMN mst_users.memory_access_scope IS
    'May this ACCOUNT be given Sotera''s own memory? NEVER "may Sotera reach her own memory" — that is '
    'intrinsic to her and is not governed by any account. Granted/revoked by root. Default none.';

COMMIT;

-- ── PROOF ───────────────────────────────────────────────────────────────────────────────────────────
-- ⭐ Asserts the SHAPE and the SAFE DEFAULT, and — most importantly — that nothing was granted.
DO $$
DECLARE
    n_vals      INT;
    has_none    BOOLEAN;
    has_sotera  BOOLEAN;
    has_wild    BOOLEAN;
    col_default TEXT;
    is_notnull  BOOLEAN;
    n_users     INT;
    n_granted   INT;
BEGIN
    SELECT count(*),
           bool_or(e.enumlabel = 'none'),
           bool_or(e.enumlabel = 'sotera_memory'),
           -- ⛔ A value we cannot enforce must not exist. `global`/`all`/`cross_room` would each be a
           -- wildcard the code has no meaning for, and an unenforced value reads as a promise.
           bool_or(e.enumlabel IN ('global', 'all', 'cross_room', 'everything'))
      INTO n_vals, has_none, has_sotera, has_wild
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'memory_access_scope';

    IF NOT has_none OR NOT has_sotera THEN
        RAISE EXCEPTION 'memory_access_scope is missing a required value (none / sotera_memory)';
    END IF;
    IF has_wild THEN
        RAISE EXCEPTION 'memory_access_scope contains an unenforceable wildcard value';
    END IF;
    IF n_vals <> 2 THEN
        RAISE EXCEPTION 'memory_access_scope has % values — expected exactly none and sotera_memory', n_vals;
    END IF;

    SELECT column_default, (is_nullable = 'NO')
      INTO col_default, is_notnull
      FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'mst_users'
       AND column_name = 'memory_access_scope';

    IF col_default IS NULL OR col_default NOT LIKE '%none%' THEN
        RAISE EXCEPTION 'the default is not none (got %) — strict by default is the whole point', col_default;
    END IF;
    IF NOT is_notnull THEN
        -- ⚠️ A NULL scope would be a third, undefined state that every reader would have to interpret, and
        -- readers interpret differently. That is the shape of this project's most-repeated defect.
        RAISE EXCEPTION 'memory_access_scope is nullable — a NULL access scope is an undefined state';
    END IF;

    -- ⭐⭐ AND NOTHING WAS GRANTED BY THIS MIGRATION. A migration that quietly hands out reach is a
    -- migration nobody remembers approving.
    SELECT count(*), count(*) FILTER (WHERE memory_access_scope <> 'none')
      INTO n_users, n_granted FROM mst_users;
    IF n_granted <> 0 THEN
        RAISE EXCEPTION '% of % accounts were granted access by the migration itself', n_granted, n_users;
    END IF;

    RAISE NOTICE '021: memory_access_scope (none, sotera_memory) on mst_users, NOT NULL DEFAULT none. % accounts, 0 granted. ⭐ This governs account→Sotera-memory ONLY; Sotera→her own memory is INTRINSIC and is not gated by this or anything else.', n_users;
END $$;
