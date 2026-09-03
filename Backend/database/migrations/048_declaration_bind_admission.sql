-- ⭐⭐⭐ 048 · THE DECLARATION PATH — occasion · namespace declaration · the binding log · the admission pin.
--
-- Four schema pieces, ratified 2026-09-03 as `CONTRACT_SOTERA_M2_THREE_SHAPES` + rulings ② and ③.
-- ⛔ NOTHING HERE DECLARES A QUESTION OR BINDS A SLOT. A migration knows nothing (047's own rule), so it
-- lands the *mechanism* and exactly one *transcription* — the `default` namespace, whose contract is
-- already written in code and is therefore transcribed, ⛔ never inferred.
--
-- ── ① `declared_in_occasion` — AND WHY IT IS NOT NULL WITH NO DEFAULT ─────────────────────────────────
-- The self-authorisation rule is: *neither the DECLARE nor the BIND that makes a question operative may
-- share the occasion that consumes it.* That is an EQUALITY test, so the column is one opaque identifier —
-- ⛔ no FK (occasions live in different tables: a pass, a revisit, a turn, an operator act), ⛔ no type
-- discriminator, ⛔ no timestamp (`declared_at` already exists and is not what the rule needs: "same
-- occasion" is IDENTITY, not ordering).
--
-- ⚠️⚠️ NULLABILITY IS THE WHOLE SAFETY QUESTION, and a DEFAULT DOES NOT HELP:
--     nullable           → a run that omits it writes NULL    → NULL ≠ the consuming occasion → CHECK PASSES
--     NOT NULL + DEFAULT → a run that omits it writes the default →                             CHECK PASSES
-- ⇒ ⭐ omission must be IMPOSSIBLE, not defaulted. NOT NULL with NO DEFAULT makes a forgetful writer fail
-- loudly at the insert. And there is no "no occasion" case: an operator act's occasion is THE ACT itself,
-- exactly as `reconcile:rome-2026-09-02` already records — so ⛔ no sentinel value is needed or wanted.
--
-- ── ② `mst_namespace_declarations` — OWNERSHIP, ⛔ NOT MEMBERSHIP ─────────────────────────────────────
-- The adopted domain statement is *"the kind gate governs a write that asserts a value at an address in a
-- SLOT-GOVERNED NAMESPACE"* — which presupposes a declared classification that did not exist. This is it.
-- A declaration states four things: an OWNER · which writers may admit · which gates apply · the read
-- default. ⛔ A registry that merely listed which namespaces exist would answer none of them.
--
-- ⚠️ UNDECLARED IS PERMISSIVE, PER PROPERTY. `namespace` is a STRING on txn_memories and mst_slots, ⛔ not
-- an FK, so a namespace can exist in data with no declaration — as `identity` does after this migration.
-- Undeclared ⇒ reads INCLUDE and writers OPEN (flipping either would be an outage, 031's exact rule), but
-- `slot_governed` UNKNOWN ⇒ the gate DEFERS. ⇒ a declaration ADDS governance; its absence is the status quo.
--
-- ⇒ AND THEREFORE `default` MUST BE DECLARED, or the gate governs NOTHING: every slot and every slotted
-- row lives there. That declaration is a TRANSCRIPTION of a contract already written in code, ⛔ not a
-- backfill of anything anyone would have to infer — which is precisely why 047's questions cannot be
-- backfilled and this can.
--
-- ── ③ `log_slot_bindings` — THE BINDING LOG, ⛔ NOT A SLOT-CHANGE LOG ─────────────────────────────────
-- `mst_slots` mutates three ways and the guarantee differs: BIND changes WHAT MAY BE ADMITTED ⇒ it must be
-- audited and cannot be silent; `recordAlias` changes only RESOLUTION and is already self-audited inline
-- (`{phrase, by, confidence, at}`); `touch` is a usage counter. ⇒ audit the BINDING, leave the rest.
-- ⓘ This is the third change log in the memory subsystem, and that is justified only because the SUBJECT
-- differs each time — a memory (`log_memory_changes`), a warrant (`log_memory_warrants`), a binding.
--
-- ⭐ PROPOSE/CONFIRM lives here rather than in memory: `person-service` keeps an in-memory pending map with
-- a TTL because ITS proposal is ephemeral conversational state. A binding is a deliberate act that must be
-- visible, so its pending state is DURABLE. ⇒ two of person-service's three mechanisms dissolve: the TTL
-- (freshness comes from `expected_question_id`, a compare-and-set, ⛔ not a clock) and the
-- "a re-proposal must not reset the clock" rule (there is no clock). Only the LATER-OCCASION requirement
-- survives, and it is the whole point.
--
-- ⚠️ THE OCCASION RULE IS NOT A CHECK CONSTRAINT, and cannot be: comparing a confirm's occasion to its
-- proposal's needs another row, which a CHECK may not read. ⇒ enforced in code at BIND's one write seam,
-- and proved by RP-D7. Said here so nobody later mistakes the table for the guarantee.
--
-- ── ④ `question_id_at_admission` — THE HISTORICAL PIN ─────────────────────────────────────────────────
-- M2-10 stops a superseded question from RE-VALIDATING an existing row, ⛔ but not from being MISREAD: a
-- reader following memory → slot → question_id after a repoint lands on the CURRENT definition, not the one
-- the row was admitted under. ⇒ the admitting question is pinned ON THE ROW, in the same statement that
-- writes it — ⛔ never looked up later, because a later lookup is the very failure this prevents.
--
-- ⚠️ ITS NULL MEANS EXACTLY ONE THING — *no kind gate was applied to this row* — and that is true of three
-- stated situations: the row predates the gate · it is outside the gate's domain · or it came through a
-- writer that bypasses the seam. ⛔ It must NEVER be read as "admitted under the slot's current question".
-- This store has already paid once for a NULL that meant two things (029).
--
-- Apply:  node test/maintenance/apply-migration.mjs 048_declaration_bind_admission.sql

SET search_path = persona_sotera, public;

BEGIN;

-- ── ① THE DECLARE OCCASION ────────────────────────────────────────────────────────────────────────────
-- ⚠️ NOT NULL with no default is only safe on an empty table. 047 landed empty and unbackfilled by design;
-- if that is no longer true this migration must stop rather than invent an occasion for an existing row.
DO $$
DECLARE n_q int;
BEGIN
    SELECT count(*) INTO n_q FROM mst_slot_questions;
    IF n_q <> 0 THEN
        RAISE EXCEPTION '048: mst_slot_questions holds % row(s). A NOT NULL occasion cannot be added without inventing one — and inventing an occasion is exactly what the self-authorisation rule exists to prevent.', n_q;
    END IF;
END $$;

ALTER TABLE mst_slot_questions
    ADD COLUMN IF NOT EXISTS declared_in_occasion text NOT NULL;

COMMENT ON COLUMN mst_slot_questions.declared_in_occasion IS
 'THE OCCASION THIS DECLARATION WAS MADE IN -- an opaque identifier compared by EQUALITY and nothing else. The self-authorisation rule is that neither the DECLARE nor the BIND that makes a question operative may share the occasion that consumes it; admission enforces it on the consumer side. NOT NULL WITH NO DEFAULT on purpose: a nullable column or a defaulted one would both let a forgetful writer produce a value that never equals the consuming occasion, so the check would pass and the rule would be silently void. Omission must be impossible, not defaulted. Derived by the system from the invoking context and NEVER caller-supplied, or a caller could name a different occasion and bypass the rule. There is no "no occasion" case: an operator act''s occasion is the act itself.';

-- ── ② THE NAMESPACE DECLARATION ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mst_namespace_declarations (
  namespace_key     text PRIMARY KEY,

  -- ⭐ A human sentence. ⛔ NOT machine-read — 047's split, for 047's reason: a sentence that is also a
  -- predicate is how a classifier sneaks back in.
  means             text NOT NULL,

  -- ⭐⭐ THREE MEASURED OWNERSHIP SHAPES, so the declaration expresses OWNERSHIP rather than membership.
  owner_kind        text NOT NULL CHECK (owner_kind IN ('open', 'runtime-subsystem', 'registration-act')),
  owner             text,
  -- ⭐ WHICH CODE PATHS may execute an admission. ⛔ THIS IS A MECHANISM LIST, NOT AN AUTHORITY LIST: being
  -- on it adds a ROUTE, never a right. A permitted writer running without the owner's authority still has
  -- none — necessary, ⛔ not sufficient. (For owner_kind='runtime-subsystem' the two coincide, which is
  -- exactly why the distinction is invisible in the only precedent we had and is written down here.)
  permitted_writers text[],

  -- ⭐⭐ THE DOMAIN STATEMENT'S MISSING LIST.
  slot_governed     boolean NOT NULL,
  read_default      text NOT NULL CHECK (read_default IN ('include', 'exclude-unless-requested')),

  declared_by       text NOT NULL,
  declared_at       timestamptz NOT NULL DEFAULT now(),

  -- ⭐⭐ `permitted_writers` is NULL for an OPEN namespace -- ⛔ not an empty array, which would read
  -- "nobody may write", the OPPOSITE of the truth, and ⛔ not a wildcard, which would be a magic value.
  -- "Open" means the question does not apply.
  CONSTRAINT mst_namespace_declarations_ownership_ck
      CHECK ( (owner_kind = 'open') = (owner IS NULL AND permitted_writers IS NULL) ),
  CONSTRAINT mst_namespace_declarations_named_ck
      CHECK (length(btrim(namespace_key)) > 0 AND length(btrim(means)) > 0)
);

COMMENT ON TABLE mst_namespace_declarations IS
 'WHAT SEMANTIC ADDRESS SPACE IS THIS? A namespace is a space of addresses under one semantic contract, and declaring one states four things: an OWNER, which writers may admit, which gates apply, and the read default. It is NOT a prefix and NOT a filter -- containment is a consequence of those four, never the definition. There is deliberately NO foreign key from txn_memories.namespace or mst_slots.namespace: a namespace may exist in data without a declaration, and undeclared must stay permissive (reads INCLUDE, writers OPEN) because flipping either would be an outage rather than a protection. The one property that fails closed when undeclared is slot_governed: UNKNOWN means the kind gate DEFERS.';

-- ⭐ THE ONE TRANSCRIPTION. `default`'s contract is already written in code; this records it.
-- ⛔ `identity` is deliberately NOT declared here: its rows carry no slots, so it is off the M2 path, and
-- leaving it undeclared is safe under the per-property rule above.
INSERT INTO mst_namespace_declarations
       (namespace_key, means, owner_kind, owner, permitted_writers, slot_governed, read_default, declared_by)
VALUES ('default',
        'The general address space: what is known about people and the world. Open to every writer, governed by the kind gate, and included in ordinary reads.',
        'open', NULL, NULL, true, 'include', 'migration 048 (transcription of the contract already in force)')
ON CONFLICT (namespace_key) DO NOTHING;

-- ── ③ THE BINDING LOG ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS log_slot_bindings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rolling_id            bigserial NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),

  slot_id               uuid NOT NULL REFERENCES mst_slots(id),

  -- ⭐ PROPOSE has NO effect on mst_slots; only a successful CONFIRM changes question_id.
  action                text NOT NULL CHECK (action IN ('propose', 'confirm')),
  -- ⭐ DERIVED from (current, requested) by the claim/non-claim rule -- ⛔ never caller-supplied.
  derived_act           text NOT NULL CHECK (derived_act IN ('first-bind', 'rebind')),
  -- ⭐ The caller's DECLARED intent, kept beside the derived act so a mismatch is visible in the record
  -- as well as refused at the seam. It is a compare-and-set guard; it grants nothing.
  declared_intent       text NOT NULL CHECK (declared_intent IN ('first-bind', 'rebind')),

  -- ⭐ THE SESSION, ⛔ never a caller-chosen label.
  actor                 text NOT NULL,
  -- ⭐ Load-bearing: the self-authorisation rule compares this against the consuming occasion, and a
  -- CONFIRM against its PROPOSAL's.
  occasion              text NOT NULL,
  -- ⭐ Required. An unreasoned interpretation of somebody else's phrasing is anonymous in effect even
  -- with an actor recorded.
  reason                text NOT NULL,

  -- ⭐ before/after carry the KEY as well as the id, so the record stays readable after a supersession.
  -- ⚠️ `before` is NULL on a first bind -- honest, and precedented: a `forget` row carries no `after`.
  before_question_id    uuid REFERENCES mst_slot_questions(id),
  before_question_key   text,
  after_question_id     uuid REFERENCES mst_slot_questions(id),
  after_question_key    text,

  -- ⭐ The whole binding state being contradicted, on a rebind. Lost-update protection.
  expected_question_id  uuid REFERENCES mst_slot_questions(id),

  -- ⭐ A CONFIRM references the PROPOSAL it answers, and must be in a DIFFERENT occasion.
  proposal_id           uuid REFERENCES log_slot_bindings(id),

  -- ⭐ A confirm without a proposal is not a confirm; a proposal that answers one is not a proposal.
  CONSTRAINT log_slot_bindings_proposal_ck
      CHECK ( (action = 'confirm') = (proposal_id IS NOT NULL) ),
  -- ⭐ A first bind fills an explicit NON-CLAIM; there is nothing to contradict and nothing to expect.
  CONSTRAINT log_slot_bindings_firstbind_ck
      CHECK ( derived_act <> 'first-bind'
              OR (before_question_id IS NULL AND expected_question_id IS NULL) ),
  -- ⭐ A rebind CONTRADICTS a claim, so it must name the claim it contradicts.
  CONSTRAINT log_slot_bindings_rebind_ck
      CHECK ( derived_act <> 'rebind' OR expected_question_id IS NOT NULL ),
  CONSTRAINT log_slot_bindings_reason_ck CHECK (length(btrim(reason)) > 0),
  CONSTRAINT log_slot_bindings_occasion_ck CHECK (length(btrim(occasion)) > 0)
);

CREATE INDEX IF NOT EXISTS log_slot_bindings_slot_idx ON log_slot_bindings (slot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS log_slot_bindings_proposal_idx ON log_slot_bindings (proposal_id) WHERE proposal_id IS NOT NULL;

COMMENT ON TABLE log_slot_bindings IS
 'THE BINDING AUDIT -- how a slot came to ask the question it asks. BIND is the hazardous half of the declaration work: DECLARE creates vocabulary that does nothing, while BIND makes a definition OPERATIVE for real material, and a slot was minted get-or-create from a label nobody interpreted. So it is audited and cannot happen silently. Deliberately NOT a general slot-change log: recordAlias changes only resolution and is already self-audited inline, and touch is a usage counter -- a seam goes where the guarantee differs. PROPOSE/CONFIRM is durable rather than in-memory because a binding is a deliberate act that must be visible, and because the freshness guarantee comes from expected_question_id (a compare-and-set), not from a clock. ⚠️ The rule that a CONFIRM must be in a DIFFERENT occasion from its PROPOSAL is NOT expressible as a CHECK -- it needs another row -- so it is enforced in code at the one BIND write seam and proved by RP-D7.';

-- ── ④ THE ADMISSION PIN ───────────────────────────────────────────────────────────────────────────────
ALTER TABLE txn_memories
    ADD COLUMN IF NOT EXISTS question_id_at_admission uuid REFERENCES mst_slot_questions(id);

CREATE INDEX IF NOT EXISTS txn_memories_admitted_question_idx
    ON txn_memories (question_id_at_admission) WHERE question_id_at_admission IS NOT NULL;

COMMENT ON COLUMN txn_memories.question_id_at_admission IS
 'THE QUESTION THIS ROW WAS ADMITTED UNDER, pinned at admission in the same statement that writes the row -- never looked up later, because a later lookup follows the slot to whatever it points at NOW, which is exactly the misreading this column exists to prevent. M2-10 stops a superseded question from RE-VALIDATING an existing row; it does not stop one from being MISREAD after a repoint. ⚠️ NULL MEANS EXACTLY ONE THING: no kind gate was applied to this row. That is true of three stated situations -- the row predates the gate, the row is outside the gate''s domain (the identity namespace, or a tag-shaped row that asserts no value), or it came through a writer that bypasses the seam. ⛔ It must NEVER be read as "admitted under the slot''s current question".';

-- ── ⭐ PROVE IT. Same discipline as 007/009/010/013/014/031/043/046/047. ───────────────────────────────
DO $$
DECLARE
    accepted text := '';
    n_ns     int;
    n_open   int;
    n_slot   uuid;
    n_pin    int;
    n_occ    int;
BEGIN
    -- ① the occasion column exists and is NOT NULL with NO default.
    SELECT count(*) INTO n_occ FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'mst_slot_questions'
       AND column_name = 'declared_in_occasion' AND is_nullable = 'NO' AND column_default IS NULL;
    IF n_occ <> 1 THEN
        RAISE EXCEPTION '048: declared_in_occasion must exist, be NOT NULL and have NO DEFAULT — a default would let a forgetful writer void the self-authorisation rule silently';
    END IF;

    -- ② a declaration with no occasion is refused.
    BEGIN
        INSERT INTO mst_slot_questions (question_key, asks, declared_by)
        VALUES ('zz_no_occasion', 'what is this called', 'test');
        accepted := accepted || ' [declaration-with-no-occasion]';
    EXCEPTION WHEN not_null_violation THEN NULL;
    END;

    -- ③ ⭐ the ownership constraint holds in BOTH directions.
    BEGIN
        INSERT INTO mst_namespace_declarations
               (namespace_key, means, owner_kind, owner, permitted_writers, slot_governed, read_default, declared_by)
        VALUES ('zz_open_with_owner', 'x', 'open', 'somebody', ARRAY['w'], true, 'include', 'test');
        accepted := accepted || ' [open-namespace-with-an-owner]';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO mst_namespace_declarations
               (namespace_key, means, owner_kind, owner, permitted_writers, slot_governed, read_default, declared_by)
        VALUES ('zz_owned_without_owner', 'x', 'registration-act', NULL, NULL, true, 'include', 'test');
        accepted := accepted || ' [owned-namespace-with-no-owner]';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- ④ ⭐ `default` is declared, slot-governed, and OPEN with NULL writers — ⛔ not an empty array.
    SELECT count(*) INTO n_ns FROM mst_namespace_declarations WHERE namespace_key = 'default';
    IF n_ns <> 1 THEN RAISE EXCEPTION '048: the `default` namespace was not declared'; END IF;
    SELECT count(*) INTO n_open FROM mst_namespace_declarations
     WHERE namespace_key = 'default' AND slot_governed AND owner_kind = 'open'
       AND owner IS NULL AND permitted_writers IS NULL AND read_default = 'include';
    IF n_open <> 1 THEN
        RAISE EXCEPTION '048: `default` must be open with NULL owner and NULL permitted_writers — an empty array would read "nobody may write", the opposite of the truth';
    END IF;

    -- ⑤ ⛔ `identity` is deliberately NOT declared — off the M2 path, and safe undeclared.
    IF EXISTS (SELECT 1 FROM mst_namespace_declarations WHERE namespace_key <> 'default') THEN
        RAISE EXCEPTION '048: exactly one namespace may be declared here. `identity`, `project` and everything else are off the M2 path';
    END IF;

    -- ⑥ the binding log refuses the shapes that would make it meaningless.
    SELECT id INTO n_slot FROM mst_slots LIMIT 1;
    IF n_slot IS NOT NULL THEN
        BEGIN   -- a confirm with no proposal
            INSERT INTO log_slot_bindings (slot_id, action, derived_act, declared_intent, actor, occasion, reason)
            VALUES (n_slot, 'confirm', 'first-bind', 'first-bind', 'test', 'zz_occ', 'test');
            accepted := accepted || ' [confirm-with-no-proposal]';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
        BEGIN   -- a rebind that names no claim to contradict
            INSERT INTO log_slot_bindings (slot_id, action, derived_act, declared_intent, actor, occasion, reason)
            VALUES (n_slot, 'propose', 'rebind', 'rebind', 'test', 'zz_occ', 'test');
            accepted := accepted || ' [rebind-with-no-expected-current]';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
        BEGIN   -- a binding act with no occasion
            INSERT INTO log_slot_bindings (slot_id, action, derived_act, declared_intent, actor, occasion, reason)
            VALUES (n_slot, 'propose', 'first-bind', 'first-bind', 'test', '  ', 'test');
            accepted := accepted || ' [binding-with-no-occasion]';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
    END IF;

    -- ⑦ ⭐ the pin lands EMPTY. Nothing was admitted under any question by this migration.
    SELECT count(*) INTO n_pin FROM txn_memories WHERE question_id_at_admission IS NOT NULL;
    IF n_pin <> 0 THEN
        RAISE EXCEPTION '048: % row(s) already carry an admitting question — a migration must never attribute an admission it did not witness', n_pin;
    END IF;

    IF accepted <> '' THEN
        RAISE EXCEPTION '048: the schema ACCEPTED what it must refuse —%', accepted;
    END IF;

    RAISE NOTICE '048: declared_in_occasion NOT NULL/no-default; mst_namespace_declarations created with ONE transcribed row (default, slot-governed, open); log_slot_bindings created; question_id_at_admission added and EMPTY. 6 violations refused. ⛔ No question declared, no slot bound, no row admitted.';
END $$;

COMMIT;
