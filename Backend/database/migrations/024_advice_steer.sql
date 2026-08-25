-- 024 · STEERING AS AN AUDITED L2 ACTION
--
-- ⭐⭐⭐ WHY A `kind` AND AN `outcome`, AND BOTH ARE LOAD-BEARING.
--
-- ① A STEER IS NOT A BRIEF. Both are outbound text on the same exchange, and without `kind` they are
-- indistinguishable — so a result could never be attributed to the instruction that actually shaped it.
-- ⛔ A steer CHANGES WHAT THE COUNTERPART WAS ASKED TO DO. An unrecorded one makes the work
-- unattributable to any instruction: provenance fiction of the same family as substituting a configured
-- model, which 022's CHECK already refuses.
--
-- ② ⭐⭐ THE OUTCOME MUST BE OURS, BECAUSE THE DESTINATION KEEPS NONE. Measured live against Hermes
-- `64a6f42c`: a refused steer returned 409 and left `status`, `last_event` **and `updated_at`
-- byte-identical** — not even a touch. ⇒ **if a refusal is to be auditable anywhere, our row is the only
-- record that will ever exist.**
--
-- ── ⛔ AND THE INVARIANT THIS TABLE MUST KEEP ───────────────────────────────────────────────────────
-- ⛔⛔ A STEER MUST NEVER CREATE L3. That she instructed the counterpart is HER action; the counterpart's
-- eventual result stays something she may subsequently COLLECT. ⇒ a steer is `direction = 'out'`, always,
-- and the CHECK below makes the opposite impossible rather than merely discouraged.

BEGIN;

ALTER TABLE persona_sotera.txn_advice_turns
    ADD COLUMN IF NOT EXISTS kind    text NULL,
    ADD COLUMN IF NOT EXISTS outcome text NULL;

-- ⓘ BACKFILL BEFORE THE CONSTRAINT. Existing rows predate the distinction: an outbound turn on a
-- delegation was the brief; everything else was ordinary message traffic.
UPDATE persona_sotera.txn_advice_turns t
   SET kind = CASE
       WHEN t.direction = 'in' THEN 'reply'
       WHEN t.ordinal = 1 AND EXISTS (
            SELECT 1 FROM persona_sotera.txn_advice_exchanges e
             WHERE e.id = t.exchange_id AND e.mode = 'delegate') THEN 'brief'
       ELSE 'message' END
 WHERE t.kind IS NULL;

ALTER TABLE persona_sotera.txn_advice_turns
    ALTER COLUMN kind SET DEFAULT 'message',
    ALTER COLUMN kind SET NOT NULL;

ALTER TABLE persona_sotera.txn_advice_turns
    DROP CONSTRAINT IF EXISTS txn_advice_turns_kind_check;
ALTER TABLE persona_sotera.txn_advice_turns
    ADD CONSTRAINT txn_advice_turns_kind_check
    CHECK (kind IN ('brief','steer','reply','message'));

-- ⭐ THE OUTCOME VOCABULARY, and ⛔ `refused_not_running` is deliberately NOT merged with `unreachable`:
-- *"alive and not accepting"* and *"not there at all"* are different worlds with different recoveries, and
-- a model that merges them will get one of them wrong.
ALTER TABLE persona_sotera.txn_advice_turns
    DROP CONSTRAINT IF EXISTS txn_advice_turns_outcome_check;
ALTER TABLE persona_sotera.txn_advice_turns
    ADD CONSTRAINT txn_advice_turns_outcome_check
    CHECK (outcome IS NULL OR outcome IN
           ('accepted','declined','refused_not_running','not_found','unreachable','error'));

-- ⛔⛔ ① A STEER IS ALWAYS OUTBOUND. This is the L3 invariant made structural.
ALTER TABLE persona_sotera.txn_advice_turns
    DROP CONSTRAINT IF EXISTS txn_advice_turns_steer_is_outbound;
ALTER TABLE persona_sotera.txn_advice_turns
    ADD CONSTRAINT txn_advice_turns_steer_is_outbound
    CHECK (kind <> 'steer' OR direction = 'out');

-- ⛔ ② A STEER ALWAYS CARRIES WHAT HAPPENED TO IT. An attempt with no recorded outcome is exactly the
-- gap the destination already leaves; repeating it here would make the audit trail decorative.
ALTER TABLE persona_sotera.txn_advice_turns
    DROP CONSTRAINT IF EXISTS txn_advice_turns_steer_has_outcome;
ALTER TABLE persona_sotera.txn_advice_turns
    ADD CONSTRAINT txn_advice_turns_steer_has_outcome
    CHECK (kind <> 'steer' OR outcome IS NOT NULL);

-- ⛔ ③ AND ONLY A STEER CARRIES ONE. An outcome on a brief or a reply would mean something nobody defined.
ALTER TABLE persona_sotera.txn_advice_turns
    DROP CONSTRAINT IF EXISTS txn_advice_turns_outcome_only_on_steer;
ALTER TABLE persona_sotera.txn_advice_turns
    ADD CONSTRAINT txn_advice_turns_outcome_only_on_steer
    CHECK (outcome IS NULL OR kind = 'steer');

-- ══ PROOF · the migration proves its own guards by attempting to break them ═══════════════════════════
DO $$
DECLARE ex uuid; ok boolean;
BEGIN
    INSERT INTO persona_sotera.txn_advice_exchanges
        (destination, mode, authority, opened_by, state, brief)
    VALUES ('__migration_probe__', 'delegate', 'ote-account',
            (SELECT id FROM persona_sotera.mst_users ORDER BY rolling_id LIMIT 1), 'pending', 'probe')
    RETURNING id INTO ex;

    -- ⛔⛔ AN INBOUND STEER IS IMPOSSIBLE — the L3 invariant, structurally
    ok := false;
    BEGIN
        INSERT INTO persona_sotera.txn_advice_turns (exchange_id, ordinal, direction, content, kind, outcome)
        VALUES (ex, 1, 'in', 'you have been steered', 'steer', 'accepted');
    EXCEPTION WHEN check_violation THEN ok := true; END;
    IF NOT ok THEN RAISE EXCEPTION '024: an INBOUND steer was accepted — a steer could create L3'; END IF;

    -- ⛔ a steer with no recorded outcome is refused
    ok := false;
    BEGIN
        INSERT INTO persona_sotera.txn_advice_turns (exchange_id, ordinal, direction, content, kind)
        VALUES (ex, 1, 'out', 'also do X', 'steer');
    EXCEPTION WHEN check_violation THEN ok := true; END;
    IF NOT ok THEN RAISE EXCEPTION '024: a steer with NO outcome was accepted'; END IF;

    -- ⛔ an outcome on something that is not a steer is refused
    ok := false;
    BEGIN
        INSERT INTO persona_sotera.txn_advice_turns (exchange_id, ordinal, direction, content, kind, outcome)
        VALUES (ex, 1, 'in', 'here is your answer', 'reply', 'accepted');
    EXCEPTION WHEN check_violation THEN ok := true; END;
    IF NOT ok THEN RAISE EXCEPTION '024: an outcome was accepted on a non-steer turn'; END IF;

    -- ⭐ a real steer, with its outcome, is accepted — including a REFUSED one, which is the whole point
    INSERT INTO persona_sotera.txn_advice_turns (exchange_id, ordinal, direction, content, kind, outcome)
    VALUES (ex, 1, 'out', 'also: check the callers', 'steer', 'accepted');
    INSERT INTO persona_sotera.txn_advice_turns (exchange_id, ordinal, direction, content, kind, outcome)
    VALUES (ex, 2, 'out', 'also: and the tests', 'steer', 'refused_not_running');

    DELETE FROM persona_sotera.txn_advice_exchanges WHERE id = ex;

    RAISE NOTICE '024: txn_advice_turns.kind + outcome. PROVEN: an INBOUND steer is impossible (a steer cannot create L3) · a steer with no outcome is REFUSED · an outcome on a non-steer is REFUSED · a REFUSED steer is recordable, because the destination keeps no trace of having said no.';
END $$;

COMMIT;
