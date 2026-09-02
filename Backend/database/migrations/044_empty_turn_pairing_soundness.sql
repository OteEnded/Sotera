-- ⚠️⚠️ 044 · 043's PAIRED CHECK WAS UNSOUND — NULL propagation let a half-set pair through.
--
-- 043 wrote:
--
--     CHECK ((empty_turn IS NULL AND empty_turn_cause IS NULL)
--         OR (empty_turn = 'empty_assistant_turn'
--             AND empty_turn_cause IN ('client_disconnect','generation_empty','provider_request_failed')))
--
-- ⭐⭐⭐ IT READS CORRECTLY AND IT IS WRONG, because **a CHECK constraint PASSES when its expression
-- evaluates to NULL** — SQL's three-valued logic, not two.
--
--   `empty_turn = 'empty_assistant_turn'` with `empty_turn_cause = NULL`
--     arm 1  ->  empty_turn IS NULL           = false            => false
--     arm 2  ->  true AND (NULL IN (...))     = true AND NULL    => NULL
--     result ->  false OR NULL                                   => NULL  ==> ACCEPTED
--
-- ⇒ a row could be CLASSIFIED WITH NO CAUSE — which is precisely the old ambiguity wearing the new name,
-- the one thing 043 exists to prevent. The mirror case (a cause with no classification) slipped through
-- the same way.
--
-- ⭐ CAUGHT BY THE RED-PROOF, NOT BY READING. `empty-turn-cause-check` asserts A3/A4 — "a classification
-- with no cause is refused" and "a cause with no classification is refused" — and both went red on the
-- first run. ⛔ Without those two assertions the constraint would have looked like a guarantee for months.
--
-- ── ⭐ THE FIX: NEVER LET AN ARM EVALUATE TO NULL ────────────────────────────────────────────────
-- Test nullness EXPLICITLY on both columns before comparing either. Then every arm is true or false and
-- `OR` cannot return NULL.
--
-- ⚠️ SAME FAMILY, FOUND AND *NOT* FIXED HERE (out of this fix's bounds, recorded so it is not lost):
-- 042's `CHECK (trigger_source IN ('cron','manual','check','legacy'))` accepts a NULL `trigger_source` for
-- exactly this reason. The application guard covers it — `reflectOnConversation` throws when the source is
-- missing — so nothing is currently at risk, but the DATABASE half is weaker than it reads.

SET search_path = persona_sotera, public;

BEGIN;

ALTER TABLE txn_messages DROP CONSTRAINT IF EXISTS txn_messages_empty_turn_ck;

ALTER TABLE txn_messages
    ADD CONSTRAINT txn_messages_empty_turn_ck
    CHECK (
        -- an ordinary turn: both absent
        (empty_turn IS NULL AND empty_turn_cause IS NULL)
        -- a classified turn: both PRESENT, and both from the vocabulary.
        -- ⭐ The two IS NOT NULL tests are what make this sound: they cannot be NULL, so the AND-chain
        -- short-circuits to false instead of to NULL when either column is missing.
     OR (empty_turn IS NOT NULL AND empty_turn_cause IS NOT NULL
         AND empty_turn = 'empty_assistant_turn'
         AND empty_turn_cause IN ('client_disconnect', 'generation_empty', 'provider_request_failed'))
    );

COMMIT;

-- ── VERIFICATION · THE CONSTRAINT IS EXERCISED, ⛔ NOT MERELY DECLARED ──────────────────────────
-- ⭐ A constraint that has never refused anything is a constraint nobody has tested. These four attempts
-- run inside a savepoint and are rolled back; the DO block fails loudly if any of them is ACCEPTED.
DO $$
DECLARE
    u uuid;
    c uuid;
    accepted text := '';
BEGIN
    SELECT id INTO u FROM mst_users WHERE username = 'agent_dev';
    IF u IS NULL THEN RAISE EXCEPTION '044: agent_dev not found -- refusing to verify against another account'; END IF;

    INSERT INTO txn_conversations (id, user_id, title, incognito, settings, created_at, updated_at)
    VALUES (gen_random_uuid(), u, 'zz_044_verify', false, '{}'::jsonb, now(), now())
    RETURNING id INTO c;

    -- ① classification with no cause
    BEGIN
        INSERT INTO txn_messages (id, conversation_id, role, content, empty_turn, created_at, updated_at)
        VALUES (gen_random_uuid(), c, 'assistant', '', 'empty_assistant_turn', now(), now());
        accepted := accepted || ' [classification-without-cause]';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- ② cause with no classification
    BEGIN
        INSERT INTO txn_messages (id, conversation_id, role, content, empty_turn_cause, created_at, updated_at)
        VALUES (gen_random_uuid(), c, 'assistant', '', 'generation_empty', now(), now());
        accepted := accepted || ' [cause-without-classification]';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- ③ an unrecognised cause
    BEGIN
        INSERT INTO txn_messages (id, conversation_id, role, content, empty_turn, empty_turn_cause, created_at, updated_at)
        VALUES (gen_random_uuid(), c, 'assistant', '', 'empty_assistant_turn', 'zz_invented', now(), now());
        accepted := accepted || ' [unknown-cause]';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- ④ and a VALID pair must still be accepted -- a guard that refuses everything is also broken
    BEGIN
        INSERT INTO txn_messages (id, conversation_id, role, content, empty_turn, empty_turn_cause, created_at, updated_at)
        VALUES (gen_random_uuid(), c, 'assistant', '', 'empty_assistant_turn', 'client_disconnect', now(), now());
    EXCEPTION WHEN check_violation THEN
        accepted := accepted || ' [REFUSED-A-VALID-PAIR]';
    END;

    DELETE FROM txn_messages WHERE conversation_id = c;
    DELETE FROM txn_conversations WHERE id = c;

    IF accepted <> '' THEN
        RAISE EXCEPTION '044: the constraint is still unsound --%', accepted;
    END IF;
    RAISE NOTICE '044: pairing is sound -- 3 malformed shapes refused, a valid pair accepted, fixtures removed';
END $$;
