-- 022 — THE EXCHANGE STORE. Sotera's record of reaching another intelligence.
--
-- ⭐⭐⭐ WHAT THIS IS A RECORD OF, AND WHAT IT IS NOT. Ote, 2026-08-24:
--
--     "Aunt Hermes is Aunt Hermes. Sotera is Sotera. The session is their relationship."
--     "Sotera doesn't consume another intelligence's internals. She communicates with another
--      intelligence through its interface."
--
-- ⇒ An exchange is OUR record of one interaction: what she asked, under whose authority, what came back,
-- and what we can honestly say about where it came from. ⛔ It is NOT a copy of the counterpart's session,
-- transcript, memory, or run. Those belong to the counterpart and stay there.
--
-- ⛔⛔ AND IT IS DELIBERATELY NOT `txn_conversations`. Ote: *"the session should be treated as Hermes's
-- session, not as one of Sotera's conversations."* Two independent reasons:
--   · `txn_conversations` is a MEASUREMENT POPULATION — the noticing pass, the episode distiller and the
--     decision corpus all read it. A new row shape there means every population query has to learn a new
--     exclusion, and this repo has recorded thirteen instances of an explicit list silently dropping what
--     it was not told about.
--   · a mirror of somebody else's transcript is a copy that goes stale without saying so.
--
-- ── ⭐ CHECK CONSTRAINTS, NOT ENUMS — and the reason is a scar, not a preference ─────────────────────
-- `memory_provenance` is an enum, and in Phase C it could not express "from a document": the value did not
-- exist, `quoted` meant something else and carried a NOT NULL source-message requirement, so the column
-- was left NULL rather than made to lie. Adding an enum value is a migration and (pre-PG12 semantics) not
-- transaction-friendly. This state machine is NEW and will move. ⇒ CHECK constraints, which a later
-- migration can widen in one statement inside a transaction.
--
-- ── ⭐⭐ THE PROVENANCE-INFLATION GUARD IS IN THE SCHEMA, NOT IN A CONVENTION ────────────────────────
-- Measured 2026-08-24: `/chat` returns `runtime: {provider, model}` — the model that ACTUALLY answered —
-- and `/v1/runs` returns neither, reporting only the virtual name `hermes-agent`. Hermes also has a
-- fallback-model chain, so the configured model is not reliably the answering one.
-- ⇒ `model_source` is REQUIRED and `model_reported` may only be non-null when it is 'reported'.
-- Substituting the configured model would be turning configuration knowledge into claimed runtime
-- provenance — the same error family this project has already caught twice as provenance inflation.
-- ⛔ The database refuses it.

BEGIN;

CREATE TABLE IF NOT EXISTS persona_sotera.txn_advice_exchanges (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rolling_id              bigserial NOT NULL,

    -- WHO she reached, and through which relationship. `destination` is our id for an intelligence
    -- (never a URL — one intelligence may have several transports). `remote_session_id` is the
    -- counterpart's own handle for the relationship; `remote_work_id` its handle for one piece of work.
    -- ⛔ Both are OPAQUE to us: we store them so a claim can be checked, never so we can reason about
    -- the counterpart's internals.
    destination             text NOT NULL,
    remote_session_id       text,
    -- ⭐⭐ NEUTRAL ON PURPOSE: the counterpart's own handle for one piece of work. ⛔ NOT `remote_run_id` —
    -- "run" is Hermes's word, and a Cogito-style human relay has no run at all. Caught by
    -- test/unit/advice-boundaries.test.mjs, which refuses a transport's vocabulary in the generic schema.
    remote_work_id          text,

    -- ⭐ MODE — Sotera's judgement, carried on the exchange so the binding can translate it and the
    -- generic layer never branches on the destination.
    --   converse = "thinking with someone"   ·   delegate = "just using them"      (her words, 2026-08-24)
    mode                    text NOT NULL CHECK (mode IN ('converse', 'delegate')),

    -- ⭐ STATE — interface-independent. ⛔ No transport has to support every state:
    --   pending → running → awaiting_input → completed | failed | cancelled
    -- `awaiting_input` is first-class because a counterpart pausing to ask US something is not a Hermes
    -- quirk — a human-relay destination is the same shape. `cancelling` exists because cancellation is
    -- cooperative and may never settle (Hermes's own note: "an unbounded window").
    -- `refused` is a real outcome: the destination exists and would not take the work (e.g. at capacity).
    state                   text NOT NULL DEFAULT 'pending'
                            CHECK (state IN ('pending','running','awaiting_input','cancelling',
                                             'completed','failed','cancelled','refused')),

    -- ⭐ THE FOUR IDENTITY CONCEPTS, kept apart on purpose (Ote: "Don't merge 'who is speaking' with
    -- 'whose account is authenticated'").
    actor                   text NOT NULL DEFAULT 'sotera',       -- WHO is speaking
    identity_basis          text NOT NULL DEFAULT 'asserted'
                            CHECK (identity_basis IN ('asserted','authenticated')),
    authority               text NOT NULL,                        -- under whose credentials
    opened_by               uuid NOT NULL,                        -- on whose behalf (the room)
    opened_in_conversation  uuid,                                 -- where she was when she asked

    -- ⭐ PROVENANCE OF THE CONTENT, distinct from identity_basis above.
    --   attested    = we hold the counterpart's verbatim reply
    --   relayed     = a human carried it (three parties, all named in the record)
    --   unavailable = we were told something and captured nothing ⇒ ⛔ she may not cite it
    provenance_class        text NOT NULL DEFAULT 'attested'
                            CHECK (provenance_class IN ('attested','relayed','unavailable')),

    -- ⭐⭐ WHAT THE INTERFACE ACTUALLY EXPOSED — see the header. The CHECK is the guard.
    model_source            text NOT NULL DEFAULT 'unavailable'
                            CHECK (model_source IN ('reported','unavailable')),
    model_reported          text,
    workspace_reported      text,   -- where the counterpart said the work happened; intent lives in config

    -- ⭐ THE BRIEF — for a delegation this is what was actually sent, verbatim, so "what did she ask?"
    -- is answerable later without reconstruction. NULL for a conversation.
    brief                   text,

    depth                   integer NOT NULL DEFAULT 0,   -- loop guard: a column, never a prompt line
    turn_count              integer NOT NULL DEFAULT 0,
    opened_at               timestamptz NOT NULL DEFAULT now(),
    closed_at               timestamptz,
    close_reason            text,
    error                   text,

    CONSTRAINT txn_advice_exchanges_model_honesty
        CHECK ((model_source = 'reported' AND model_reported IS NOT NULL)
            OR (model_source = 'unavailable' AND model_reported IS NULL)),
    CONSTRAINT txn_advice_exchanges_brief_on_delegate
        CHECK (mode <> 'delegate' OR brief IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS persona_sotera.txn_advice_turns (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exchange_id   uuid NOT NULL REFERENCES persona_sotera.txn_advice_exchanges(id) ON DELETE CASCADE,
    ordinal       integer NOT NULL,
    direction     text NOT NULL CHECK (direction IN ('out','in')),
    content       text NOT NULL,
    -- ⭐ attested = this is the counterpart's own words as we received them. An inbound turn that is a
    -- summary, a relay, or our own paraphrase is NOT attested, and the difference is the whole point.
    attested      boolean NOT NULL DEFAULT false,
    latency_ms    integer,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (exchange_id, ordinal)
);

CREATE INDEX IF NOT EXISTS txn_advice_exchanges_owner_state_idx
    ON persona_sotera.txn_advice_exchanges (opened_by, state);
CREATE INDEX IF NOT EXISTS txn_advice_exchanges_remote_work_idx
    ON persona_sotera.txn_advice_exchanges (remote_work_id) WHERE remote_work_id IS NOT NULL;

-- ══ ⛔ PROVE IT, don't assume it. The notices are the point. ═════════════════════════════════════════
DO $$
DECLARE
    n_ex bigint; n_turns bigint; ok boolean; msg text;
BEGIN
    -- ① both tables exist, and carry the txn_ prefix the naming canon requires
    IF to_regclass('persona_sotera.txn_advice_exchanges') IS NULL
       OR to_regclass('persona_sotera.txn_advice_turns') IS NULL THEN
        RAISE EXCEPTION '022: a table is missing';
    END IF;

    -- ② ⭐⭐ THE PROVENANCE GUARD ACTUALLY REFUSES. Claiming a reported model without one must fail.
    ok := false;
    BEGIN
        INSERT INTO persona_sotera.txn_advice_exchanges
            (destination, mode, authority, opened_by, model_source, model_reported, brief)
        VALUES ('probe', 'converse', 'probe', gen_random_uuid(), 'reported', NULL, NULL);
    EXCEPTION WHEN check_violation THEN ok := true;
    END;
    IF NOT ok THEN
        RAISE EXCEPTION '022: model_source=reported with a NULL model was ACCEPTED — the provenance guard does not hold';
    END IF;

    -- ③ ⭐ A DELEGATION WITHOUT A BRIEF MUST FAIL. The brief is the artefact, not an intention.
    ok := false;
    BEGIN
        INSERT INTO persona_sotera.txn_advice_exchanges
            (destination, mode, authority, opened_by, brief)
        VALUES ('probe', 'delegate', 'probe', gen_random_uuid(), NULL);
    EXCEPTION WHEN check_violation THEN ok := true;
    END;
    IF NOT ok THEN
        RAISE EXCEPTION '022: a delegation with no brief was ACCEPTED — the brief must be required';
    END IF;

    -- ④ an unmodelled state must be refused rather than stored and interpreted later
    ok := false;
    BEGIN
        INSERT INTO persona_sotera.txn_advice_exchanges
            (destination, mode, authority, opened_by, state)
        VALUES ('probe', 'converse', 'probe', gen_random_uuid(), 'nearly_done');
    EXCEPTION WHEN check_violation THEN ok := true;
    END;
    IF NOT ok THEN
        RAISE EXCEPTION '022: an unmodelled state was ACCEPTED';
    END IF;

    -- ⑤ a turn cannot exist without an exchange
    ok := false;
    BEGIN
        INSERT INTO persona_sotera.txn_advice_turns (exchange_id, ordinal, direction, content)
        VALUES (gen_random_uuid(), 1, 'in', 'orphan');
    EXCEPTION WHEN foreign_key_violation THEN ok := true;
    END;
    IF NOT ok THEN
        RAISE EXCEPTION '022: an orphan turn was ACCEPTED';
    END IF;

    -- ⑥ ⭐ the migration granted nothing and created nothing
    SELECT count(*) INTO n_ex FROM persona_sotera.txn_advice_exchanges;
    SELECT count(*) INTO n_turns FROM persona_sotera.txn_advice_turns;
    IF n_ex <> 0 OR n_turns <> 0 THEN
        RAISE EXCEPTION '022: the migration created rows (% exchanges, % turns)', n_ex, n_turns;
    END IF;

    RAISE NOTICE '022: txn_advice_exchanges + txn_advice_turns created, 0 rows. PROVEN: model_source=reported without a model is REFUSED (no provenance inflation) · delegate without a brief is REFUSED · an unmodelled state is REFUSED · an orphan turn is REFUSED. ⛔ Nothing was written to txn_conversations, which stays a measurement population.';
END $$;

COMMIT;
