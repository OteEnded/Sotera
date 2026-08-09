-- ⛔ SUPERSEDED AS DDL — KEPT AS THE SPEC. Do not run this file.
--
-- Written before Ote chose to clone OteLLMServices for a head start. OLS's 35 models expect OLS's
-- shape, so its schema landed instead and this became the SPECIFICATION for the corrections rather
-- than the foundation. The diff that actually applies is 002_owner_corrections.sql.
-- Everything below still states WHAT must be true and WHY, with the measured failure behind each.
--
-- =====================================================================================
-- Sotera — core schema, v0.  Target: database `ote_ai_toolbox`, schema `persona_sotera`.
-- Idempotent: safe to re-run.
--
-- WHY THIS IS SQL AND NOT SEQUELIZE `sync`
-- Sync creates tables from models. It cannot express the three things this schema depends on:
-- NOT NULL on an owner, CHECK constraints that make an impossible state impossible, and PARTIAL
-- indexes that only cover live rows. Those are exactly the guarantees that were missing in
-- OteLLMServices, and "the model says so" is a convention while "the database says so" is a rule.
-- The Sequelize models mirror this file; THIS FILE IS THE SOURCE OF TRUTH.
--
-- WHAT THIS SCHEMA IS ANSWERING
-- Nine requirements from `Reference/docs/ANALYSIS_MEMORY_FINDINGS_FOR_SOTERA.md`, derived from three
-- independent reads of OLS's memory layer (Hermes's UI friend-test, an exported transcript, Cogito).
-- Each is marked [R1]..[R9] at the place it is enforced. Requirements that CANNOT live in a schema
-- (relevance floor, queued≠saved) are named in §9 so nobody assumes the database is covering them.
--
-- NAMING CANON (inherited deliberately): mst_ = what EXISTS · txn_ = what HAPPENED · log_ = what was
-- OBSERVED. One name per table, forever.
--
-- ⚠️ NO `persona` COLUMN, ON PURPOSE. OLS carries one because it hosts many personas. Ote's decision
-- is ONE PERSONA = ONE REPO, and this schema belongs to Sotera alone. A second persona gets its own
-- schema, not a discriminator column here. This removes a whole class of cross-persona leak.
-- =====================================================================================

CREATE SCHEMA IF NOT EXISTS persona_sotera;
SET search_path = persona_sotera, public;

-- pgvector lives in `public` so every project schema shares it (app role cannot CREATE EXTENSION).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE NOTICE 'pgvector not installed — embedding columns are skipped. Install as superuser: CREATE EXTENSION vector;';
  END IF;
END $$;


-- ── WHO ──────────────────────────────────────────────────────────────────────────────
-- Single-user in practice, shaped for multi from row one. Ote's answer, and it is the single most
-- valuable line in this file: OLS inferred "root" from `owner_user_id IS NULL`, root gained a users
-- row on 2026-08-06, and the same defect was then found in FIVE places — keys silently dead,
-- ?owner=root returning zero, root metered at 888K tokens/day, and two tests reading a stranger's key.
CREATE TABLE IF NOT EXISTS mst_users (
    id            UUID PRIMARY KEY,
    username      VARCHAR(64)  NOT NULL UNIQUE,
    display_name  VARCHAR(128),
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE mst_users IS
  'People. [R9] EVERY owned row elsewhere references this NOT NULL — there is no null-owner shape to infer identity from.';


-- ── CONVERSATION ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS txn_conversations (
    id             UUID PRIMARY KEY,
    owner_user_id  UUID        NOT NULL REFERENCES mst_users(id) ON DELETE CASCADE,  -- [R9]
    title          TEXT,
    archived_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS txn_conversations_owner_idx ON txn_conversations (owner_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS txn_messages (
    id               UUID PRIMARY KEY,
    conversation_id  UUID        NOT NULL REFERENCES txn_conversations(id) ON DELETE CASCADE,
    owner_user_id    UUID        NOT NULL REFERENCES mst_users(id) ON DELETE CASCADE,  -- [R9]
    role             VARCHAR(16) NOT NULL CHECK (role IN ('user','assistant','system','tool')),
    content          TEXT        NOT NULL DEFAULT '',
    reasoning        TEXT,
    model            VARCHAR(128),
    metrics          JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS txn_messages_conversation_idx ON txn_messages (conversation_id, created_at);


-- ── SLOTS — the identity of a conceptual property ────────────────────────────────────
-- [R7] THE FIX FOR CROSS-COLUMN DEDUP, AND IT IS STRUCTURAL RATHER THAN A CLEANUP JOB.
-- Measured in OLS: `communication style: bullet points` and `formatting preference: bullet points`
-- are ONE fact that never merged, because a same-key merge only fires when the attribute strings
-- match. Attributes are free text, so they never will. A slot is the durable identity of the
-- property itself; both phrasings resolve to the same slot and therefore collide by construction.
CREATE TABLE IF NOT EXISTS mst_slots (
    id           UUID PRIMARY KEY,
    label        VARCHAR(128) NOT NULL,           -- canonical name, e.g. 'communication style'
    aliases      TEXT[]       NOT NULL DEFAULT '{}', -- learned phrasings that mean the same slot
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT mst_slots_label_unique UNIQUE (label)
);
COMMENT ON COLUMN mst_slots.aliases IS
  'Phrasings observed to mean this slot. Dedup is slot-identity, never string equality on the attribute.';


-- ── MEMORY ───────────────────────────────────────────────────────────────────────────
-- [R1] PROVENANCE IS A REAL COLUMN WITH REAL CLASSES, and the difference is enforced, not documented.
--   quoted      — the user said it, in these words. MUST carry source_message_id.
--   elicited    — the assistant proposed it and the user assented ("yes"). Looks like a quote and is
--                 not one; this is the dangerous class and the reason the enum exists.
--   synthesized — inferred from a pattern across turns. No single message is its source.
--   observed    — derived from behaviour/system events, not from anything anyone said.
-- Measured in OLS: of 4 semantic memories, only `preferred_name` traced to a real user statement;
-- the rest were `source: model-tool` and therefore indistinguishable from quotes.
-- Postgres has no CREATE TYPE IF NOT EXISTS, so guard them or the "idempotent" claim above is a lie.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'memory_provenance' AND n.nspname = 'persona_sotera') THEN
    CREATE TYPE memory_provenance AS ENUM ('quoted','elicited','synthesized','observed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'memory_state' AND n.nspname = 'persona_sotera') THEN
    CREATE TYPE memory_state AS ENUM ('active','superseded','forgotten');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'memory_visibility' AND n.nspname = 'persona_sotera') THEN
    CREATE TYPE memory_visibility AS ENUM ('normal','private_held');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS txn_memories (
    id                 UUID PRIMARY KEY,
    owner_user_id      UUID              NOT NULL REFERENCES mst_users(id) ON DELETE CASCADE,  -- [R9]

    slot_id            UUID              REFERENCES mst_slots(id) ON DELETE SET NULL,          -- [R7]
    subject            VARCHAR(128)      NOT NULL DEFAULT 'user',
    value              TEXT              NOT NULL,

    provenance         memory_provenance NOT NULL,                                             -- [R1]
    source_message_id  UUID              REFERENCES txn_messages(id) ON DELETE SET NULL,       -- [R1]

    -- [R3] ABSOLUTE TIME ANCHOR. `captured_at` is when we learned it. `event_at` is when the thing
    -- it describes happens/happened, resolved to a real instant at capture. Measured failure: OLS
    -- stored "Mochi turning 4 in September" with no year; on 2026-08-10 it rendered as "was turning 4
    -- back in September 2026" — past tense for a month that had not happened.
    captured_at        TIMESTAMPTZ       NOT NULL DEFAULT now(),
    event_at           TIMESTAMPTZ,
    is_time_bearing    BOOLEAN           NOT NULL DEFAULT false,

    -- [R5] Confidence must be answerable, not decorative. Measured failure: OLS stored "stayed in
    -- Bangkok" at 0.85 when its own source message says he was dragged UP and stayed (Chiang Mai).
    -- last_verified_at is what makes a re-check visible; contradicted_by names the row that disputes it.
    confidence         REAL              NOT NULL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
    importance         SMALLINT          NOT NULL DEFAULT 5 CHECK (importance BETWEEN 0 AND 10),
    last_verified_at   TIMESTAMPTZ,
    contradicted_by    UUID              REFERENCES txn_memories(id) ON DELETE SET NULL,

    -- [R6] forget must be unreachable, not merely flagged.
    state              memory_state      NOT NULL DEFAULT 'active',
    state_changed_at   TIMESTAMPTZ,
    state_reason       TEXT,

    -- Hermes told OLS his p5.js sketches were "not for an audience, it's just... mine" — and the value
    -- was that they were held anyway. A persona that remembers is not an audience. This marks the class.
    visibility         memory_visibility NOT NULL DEFAULT 'normal',

    created_at         TIMESTAMPTZ       NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ       NOT NULL DEFAULT now(),

    -- [R1] A quote that cannot produce the message it came from is not a quote.
    CONSTRAINT txn_memories_quoted_needs_source
        CHECK (provenance <> 'quoted' OR source_message_id IS NOT NULL),

    -- [R3] If it is time-bearing it carries a resolved instant. No "September" without a year.
    CONSTRAINT txn_memories_time_bearing_needs_anchor
        CHECK (is_time_bearing = false OR event_at IS NOT NULL),

    -- A non-active row must say when and why it stopped being true.
    CONSTRAINT txn_memories_state_has_reason
        CHECK (state = 'active' OR (state_changed_at IS NOT NULL AND state_reason IS NOT NULL))
);

-- [R6] Retrieval indexes cover ACTIVE ROWS ONLY. A forgotten row is not merely filtered by a WHERE
-- clause somebody has to remember to write — it is not in the index the read path uses. Measured
-- failure: OLS's `forget_memory` archived, and `list_memories` still counted the archived copy.
CREATE INDEX IF NOT EXISTS txn_memories_live_idx
    ON txn_memories (owner_user_id, importance DESC, captured_at DESC)
    WHERE state = 'active';

-- [R7] One live memory per (owner, slot, subject). The dedup bug cannot recur: a second phrasing of
-- the same property resolves to the same slot and violates this.
CREATE UNIQUE INDEX IF NOT EXISTS txn_memories_one_live_per_slot
    ON txn_memories (owner_user_id, slot_id, subject)
    WHERE state = 'active' AND slot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS txn_memories_provenance_idx ON txn_memories (provenance) WHERE state = 'active';


-- ── AGREEMENTS — shared context, as its own class ────────────────────────────────────
-- [R2] THE FINDING THAT JUSTIFIES THIS TABLE: in OLS, the most valuable memory in the store —
-- "The Unhurried Room" — is a row with entity=NULL and attribute=NULL, surviving on free text plus an
-- embedding, while `coffee preference` slots in perfectly. The schema was shaped for the memories that
-- matter least. And the weighting was inverted: the WRONG Bangkok fact carried 0.85, the best memory
-- in the store carried 0.7.
--
-- An agreement is not a fact with holes. It has no subject/attribute/value because it is not about a
-- property of a person — it is the standing shape of how two parties talk. Giving it its own table is
-- the difference between accommodating it and meaning it.
CREATE TABLE IF NOT EXISTS txn_agreements (
    id                 UUID PRIMARY KEY,
    owner_user_id      UUID              NOT NULL REFERENCES mst_users(id) ON DELETE CASCADE,  -- [R9]
    label              VARCHAR(128)      NOT NULL,   -- what it is called: 'The Unhurried Room'
    body               TEXT              NOT NULL,   -- what it means, in the words it was formed in
    provenance         memory_provenance NOT NULL,                                             -- [R1]
    source_message_id  UUID              REFERENCES txn_messages(id) ON DELETE SET NULL,
    established_at     TIMESTAMPTZ       NOT NULL DEFAULT now(),
    last_invoked_at    TIMESTAMPTZ,                  -- when it last actually shaped a turn
    state              memory_state      NOT NULL DEFAULT 'active',
    state_changed_at   TIMESTAMPTZ,
    state_reason       TEXT,
    created_at         TIMESTAMPTZ       NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ       NOT NULL DEFAULT now(),
    CONSTRAINT txn_agreements_quoted_needs_source
        CHECK (provenance <> 'quoted' OR source_message_id IS NOT NULL),
    CONSTRAINT txn_agreements_state_has_reason
        CHECK (state = 'active' OR (state_changed_at IS NOT NULL AND state_reason IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS txn_agreements_live_label
    ON txn_agreements (owner_user_id, lower(label)) WHERE state = 'active';

COMMENT ON TABLE txn_agreements IS
  '[R2] Shared context: standing agreements, recurring metaphors, mutual understandings. NOT facts. '
  'These are what Ote means by "I do not want AI to just remember facts" — they change how every '
  'future turn feels, and in OLS they only survived by accident as entity-NULL rows.';


-- ── §9 — WHAT THIS FILE DOES NOT ENFORCE (so nobody assumes it does) ─────────────────
-- [R4] RELEVANCE FLOOR — recall must be able to answer "nothing". Measured failure: a query for
--      "brother name family" returned 10 rows at relevance 0.42–0.59 and called them matches; the
--      honest answer came from the model reading the list, not from retrieval. A floor is a property
--      of the QUERY, so it lives in the recall service and must be tested there.
-- [R8] QUEUED ≠ SAVED — OLS's remember_fact returned {"ok":true,"queued":true} and the assistant said
--      "It's saved." A write ack is not a write confirmation. The persona may only claim persistence
--      after a confirmed commit; this is a property of the write API.
-- [R3] partially — the DB enforces "time-bearing rows carry an instant", but DECIDING that a sentence
--      is time-bearing is a capture-time judgement in code.
-- [R5] partially — the DB stores confidence, last_verified_at and contradicted_by; RECONCILING a
--      memory against its own source text is a service.
