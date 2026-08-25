-- 023 · THE EXCHANGE LIFECYCLE · observation log + the one ending only Sotera may declare
--
-- ⭐⭐⭐ WHY THIS EXISTS, AND IT IS ONE TABLE OF EVIDENCE. The same exchange, never touched, over ninety
-- minutes reported:
--
--     during the run     their interface said `running`, then `waiting_for_approval`
--     process died       `connection refused`
--     process restarted  `404 run_not_found`
--     her exchange said  `pending` · `pending` · `pending`
--
-- ⇒ THE COUNTERPART'S WORLD CHANGED THREE TIMES AND THE EXCHANGE NEVER MOVED ONCE. It could not even
-- RECORD what varied. ⛔ A flat status cannot be repaired by adding values, because what it is missing is
-- not a value — it is WHEN WE LAST HEARD, AND FROM WHAT.
--
-- ⚠️ And a stored status BECOMES A LIE BY AGEING: `pending` written at dispatch is still `pending` after
-- the counterpart has completed, been swept, and had its process replaced. That is Architecture Principle
-- 16 one layer out — a statement about the state of our knowledge is not a claim about the world.
--
-- ── ⭐⭐ THE FOUR WORLDS THAT `pending` WAS COLLAPSING (all four observed in one session) ─────────────
--   working                    genuinely busy                        → wait
--   finished but uncollected   terminal, never collected             → COLLECT   (only Sotera can)
--   waiting for input          blocked on someone not listening      → ANSWER
--   counterpart gone           the process no longer exists          → ⛔ nothing. unrecoverable
-- ⇒ not four reasons for one state — FOUR DIFFERENT SYSTEMS, and three of the four are not "wait".
--
-- ── ⛔ WHAT THIS MIGRATION DELIBERATELY DOES **NOT** ADD ────────────────────────────────────────────
-- ⛔ NO `dead`, `stale`, `lost` or `expired` state, and NO timeout column. Silence is the one thing all
-- four failure worlds have in common, so ⛔ NOTHING here may infer death from it. ⓘ A 68-minute run sat
-- apparently idle for six-minute stretches while working perfectly.
-- ⛔ NO world/status column at all. The world is DERIVED at read time (`app/advice/lifecycle.js`) from
-- observations + the clock, because any stored derivation is stale the moment it is written.

BEGIN;

-- ══ ⭐ THE OBSERVATION LOG · what we asked, what we heard, and WHEN ═══════════════════════════════════
--
-- ⭐⭐ RATIFIED BY OTE AS OPTION (c): a SEPARATE table, so `peek` stays LITERALLY read-only. The
-- alternative — letting peek write observation fields onto the exchange — would have redefined a word he
-- had already ruled on. ⓘ It costs a join. That is the honest price of the word meaning what it says.
--
-- ⛔⛔ THIS TABLE MAY NEVER HOLD CONTENT. Every column is a state name, an outcome, a timestamp or a
-- number. There is deliberately NO column a counterpart's words could be written into — because an
-- observation that carried content would be a collection wearing another name, and the whole point of the
-- peek/collect split is that LOOKING IS NOT RECEIVING.
CREATE TABLE IF NOT EXISTS persona_sotera.log_advice_observations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rolling_id      bigserial NOT NULL,
    exchange_id     uuid NOT NULL REFERENCES persona_sotera.txn_advice_exchanges(id) ON DELETE CASCADE,

    observed_at     timestamptz NOT NULL DEFAULT now(),

    -- ⭐ WHAT THE ATTEMPT ITSELF DID. ⛔ `not_found` and `unreachable` are DIFFERENT and must never be
    -- merged: "up but has forgotten this work" is PERMANENT, "not there at all" may be TRANSIENT. A model
    -- that calls both "unreachable" will get one of them wrong.
    contact_result  text NOT NULL
                    CHECK (contact_result IN ('heard','not_found','unreachable','refused','error')),

    -- ⭐ WHAT THEY SAID, in OUR vocabulary — mapped by the binding, never their raw string.
    -- ⓘ NULL whenever contact_result <> 'heard': we did not hear anything, and inventing a state here is
    -- exactly the false-absence this whole subsystem exists to prevent.
    heard_state     text NULL
                    CHECK (heard_state IS NULL OR heard_state IN
                           ('pending','running','awaiting_input','cancelling',
                            'completed','failed','cancelled','refused')),

    -- ⓘ The counterpart's own last-event label, kept verbatim for forensics. ⛔ Never parsed for meaning:
    -- it is THEIR vocabulary, and this arc's rule is that we do not consume a counterpart's internals.
    heard_last_event text NULL,

    -- ⭐ HOW we asked. `probe` = the binding's own recovery observation; `event` = an SSE lifecycle event
    -- arriving on a subscription we opened at dispatch.
    asked_how       text NOT NULL DEFAULT 'probe'
                    CHECK (asked_how IN ('probe','event')),

    latency_ms      integer NULL,
    note            text NULL,

    -- ⛔⛔ THE GUARD THAT KEEPS AN OBSERVATION AN OBSERVATION. A state may only be recorded when we
    -- actually heard one. ⇒ it is structurally impossible to log "they are completed" from a timeout.
    CONSTRAINT log_advice_observations_heard_state_honesty
        CHECK ((contact_result = 'heard' AND heard_state IS NOT NULL)
            OR (contact_result <> 'heard' AND heard_state IS NULL))
);

CREATE INDEX IF NOT EXISTS log_advice_observations_exchange_idx
    ON persona_sotera.log_advice_observations (exchange_id, observed_at DESC);

-- ══ ⭐⭐⭐ `abandoned` · THE ONLY ENDING WITH NO COUNTERPART SIGNAL BEHIND IT ═════════════════════════
--
-- ⭐ RATIFIED: **Sotera owns it, explicitly.** ⛔ NOT a timeout, ⛔ NOT inferred from silence, ⛔ NOT a
-- policy that fires on its own. Every other terminal state is something the destination TOLD us; this one
-- is a judgement about someone else's liveness, and whoever owns it owns that judgement.
--
-- ⚠️ It is therefore the one state where the EVIDENCE matters as much as the value — hence `reason`,
-- which must say what was observed, not merely that it was decided.
ALTER TABLE persona_sotera.txn_advice_exchanges
    DROP CONSTRAINT IF EXISTS txn_advice_exchanges_state_check;

ALTER TABLE persona_sotera.txn_advice_exchanges
    ADD CONSTRAINT txn_advice_exchanges_state_check
    CHECK (state IN ('pending','running','awaiting_input','cancelling',
                     'completed','failed','cancelled','refused','abandoned'));

ALTER TABLE persona_sotera.txn_advice_exchanges
    ADD COLUMN IF NOT EXISTS abandoned_at     timestamptz NULL,
    ADD COLUMN IF NOT EXISTS abandoned_reason text NULL;

-- ⛔ ABANDONMENT IS AN ACT, AND AN ACT LEAVES A REASON. A row that claims the state without saying what
-- was observed is a decision nobody can audit.
ALTER TABLE persona_sotera.txn_advice_exchanges
    DROP CONSTRAINT IF EXISTS txn_advice_exchanges_abandon_evidence;
ALTER TABLE persona_sotera.txn_advice_exchanges
    ADD CONSTRAINT txn_advice_exchanges_abandon_evidence
    CHECK (state <> 'abandoned' OR (abandoned_at IS NOT NULL AND abandoned_reason IS NOT NULL));

-- ══ PROOF · the migration proves its own guards by attempting to break them ═══════════════════════════
DO $$
DECLARE
    ex uuid;
    ok boolean;
BEGIN
    INSERT INTO persona_sotera.txn_advice_exchanges
        (destination, mode, authority, opened_by, state, brief)
    VALUES ('__migration_probe__', 'delegate', 'ote-account',
            (SELECT id FROM persona_sotera.mst_users ORDER BY rolling_id LIMIT 1),
            'pending', 'probe')
    RETURNING id INTO ex;

    -- ① an observation may not claim a state it did not hear
    ok := false;
    BEGIN
        INSERT INTO persona_sotera.log_advice_observations
            (exchange_id, contact_result, heard_state)
        VALUES (ex, 'unreachable', 'completed');
    EXCEPTION WHEN check_violation THEN ok := true;
    END;
    IF NOT ok THEN RAISE EXCEPTION '023: an observation CLAIMED a state it never heard'; END IF;

    -- ② …and 'heard' without a state is equally refused
    ok := false;
    BEGIN
        INSERT INTO persona_sotera.log_advice_observations (exchange_id, contact_result)
        VALUES (ex, 'heard');
    EXCEPTION WHEN check_violation THEN ok := true;
    END;
    IF NOT ok THEN RAISE EXCEPTION '023: "heard" was accepted with no state'; END IF;

    -- ③ a real observation is accepted
    INSERT INTO persona_sotera.log_advice_observations
        (exchange_id, contact_result, heard_state, heard_last_event, asked_how)
    VALUES (ex, 'heard', 'running', 'tool.started', 'event');

    -- ④ ⭐ abandonment without evidence is refused
    ok := false;
    BEGIN
        UPDATE persona_sotera.txn_advice_exchanges SET state = 'abandoned' WHERE id = ex;
    EXCEPTION WHEN check_violation THEN ok := true;
    END;
    IF NOT ok THEN RAISE EXCEPTION '023: abandoned was accepted with no reason and no timestamp'; END IF;

    -- ⑤ …with evidence, it is accepted
    UPDATE persona_sotera.txn_advice_exchanges
       SET state = 'abandoned', abandoned_at = now(),
           abandoned_reason = 'probe: unreachable since 10:20, then not_found'
     WHERE id = ex;

    DELETE FROM persona_sotera.txn_advice_exchanges WHERE id = ex;

    RAISE NOTICE '023: log_advice_observations + abandoned. PROVEN: an observation cannot claim a state it did not hear · "heard" cannot be stateless · abandonment without evidence is REFUSED. ⛔ No world column, no timeout column, no dead state — silence is never a conclusion.';
END $$;

COMMIT;
