-- ⭐⭐⭐ 038 · A RETENTION DECISION IS NOT A MEMORY, AND IT MUST HAVE SOMEWHERE ELSE TO LIVE.
--
-- Ote, 2026-09-02, locking the contract: *"unrepresented is a recorded decision, never a memory row.
-- I don't want non-memory material entering the memory table and then depending on filtering to stay
-- out of recall."*
--
-- ── ⚠️⚠️ THE MEASURED GAP ────────────────────────────────────────────────────────────────────────
-- A hand audit of 78 completed reflections found ~32 in which she recognised something durable, named it
-- precisely — sometimes with kind, importance and exact wording — and took no action. About half of those
-- had NO DESTINATION at all: a fact about the person has no door reflection is told it may use
-- (`remember_fact` is withheld by design, `keep` was never offered, and `remember`'s own description
-- routes subject-attribute-value material to the withheld tool).
-- ⇒ those decisions are lost SILENTLY today. This table is where they stop being lost.
--
-- ── ⛔⛔ AND WHY NOT `txn_memories` ───────────────────────────────────────────────────────────────
-- There is precedent and it is a warning: decisions written into `txn_memories` had to be filtered back
-- OUT of every read — `withoutDecisions()` exists at three call sites for exactly that reason.
-- ⚠️ A row in the memory table is reachable BY DEFAULT and excluded only by remembering to exclude it.
-- ⭐ And this content is material she wanted to keep and the architecture refused — the one thing that
-- must not reach recall through a back door.
-- ⇒ its own table, beside `log_memory_refusals` and `log_retention_occasions`. Unreachable BY
-- CONSTRUCTION rather than by filtering.
--
-- ⛔ NOTHING READS THIS TABLE AND NOTHING GATES ON IT. Its writer is best-effort: failing to record a
-- decision must never fail the decision.

SET search_path = persona_sotera, public;

BEGIN;

CREATE TABLE IF NOT EXISTS log_retention_decisions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rolling_id       bigserial,
    created_at       timestamptz NOT NULL DEFAULT now(),

    -- ⭐ THE DECISION, VERBATIM. Recorded even when nothing could be done with it — that is the point.
    content          text NOT NULL,
    kind             text,
    mine             boolean,
    about            text,
    attribute        text,
    distinction      text,

    -- ⭐⭐⭐ THE FIVE STATES, AND THEY MEAN EXACTLY THIS:
    --   persisted     the write COMPLETED and a real row exists — the only state that is memory
    --   declined      an explicit negative decision was recorded (an ACT, not an absence)
    --   unrepresented a VALID decision with no destination — recorded as a decision, NOT as memory
    --   refused       could not be accepted (underspecified, or a store gate refused it)
    --   accepted      ⚠️ the wait was abandoned. UNKNOWN, never success.
    state            text NOT NULL,
    why              text,

    -- ⭐⭐ THE RECEIPT. Set ONLY when the write completed, and the CHECK below makes that structural.
    memory_id        uuid,

    user_id          uuid,
    conversation_id  uuid,
    revisit_id       uuid,
    source           text,

    CONSTRAINT log_retention_decisions_state_ck
        CHECK (state IN ('persisted', 'declined', 'unrepresented', 'refused', 'accepted')),

    -- ⭐⭐⭐ THE RECEIPT CONTRACT, ENFORCED BY THE DATABASE RATHER THAN BY REMEMBERING.
    -- ⚠️ `queued ≠ written` has already cost this project twice: a lane that swallowed a failure reported
    -- ok:true, and an outcome derived from tool NAMES reported a refused keep as a keep. ⇒ the third time
    -- it is a constraint: an id may exist ONLY where a row actually does.
    CONSTRAINT log_retention_decisions_receipt_ck
        CHECK ((state = 'persisted' AND memory_id IS NOT NULL)
            OR (state <> 'persisted' AND memory_id IS NULL))
);

COMMENT ON TABLE log_retention_decisions IS
    'One row per retention DECISION made by reflection through retain(), whatever became of it. Deliberately '
    'NOT txn_memories: a decision is not a memory, and decisions placed in the memory table had to be '
    'filtered back out of every read (see withoutDecisions). Nothing reads this and nothing gates on it.';

COMMENT ON COLUMN log_retention_decisions.state IS
    'persisted = a real row exists. declined = an explicit negative, itself an act. unrepresented = a valid '
    'decision with no destination, recorded as a decision and NOT as memory. refused = could not be '
    'accepted. accepted = the wait was abandoned; UNKNOWN, never success.';

COMMENT ON COLUMN log_retention_decisions.memory_id IS
    'The receipt. Set only when state = persisted, and a CHECK enforces it -- "the tool accepted the act" '
    'must never be readable as "a memory row exists".';

CREATE INDEX IF NOT EXISTS log_retention_decisions_state_idx ON log_retention_decisions (state, created_at DESC);

-- ── ⭐⭐⭐ THE INSTRUMENT MARKER — and it must land BEFORE the tool surface changes ────────────────
--
-- ⚠️⚠️ The 78 completed reflections this whole arc rests on were gathered with FIVE specialised write
-- tools (`remember` · `save_lesson` · `propose_lesson` · `note_own_practice` · `decline_to_remember`).
-- Reflection is about to be given `retain` instead. ⛔ The PROMPT TEXT does not change, so
-- `prompt_generation` correctly stays 3 — but the TOOL SURFACE is part of what was being measured, and
-- post-change reflections are NOT comparable to the 78 on retention behaviour.
-- ⇒ ⭐ a SEPARATE generation, for the same reason and with the same discipline as the prompt's: two
-- instruments, two counters, and they must never be silently pooled.
ALTER TABLE log_conversation_revisits ADD COLUMN IF NOT EXISTS tool_generation integer;

-- ⭐ Additive metadata ONLY. `text`, `tools_used` and `wrote_memory_id` are not touched by this migration.
UPDATE log_conversation_revisits SET tool_generation = 1 WHERE tool_generation IS NULL;

COMMENT ON COLUMN log_conversation_revisits.tool_generation IS
    'Which WRITE-TOOL SURFACE this reflection was offered. 1 = the five specialised tools (remember, '
    'save_lesson, propose_lesson, note_own_practice, decline_to_remember). 2 = the decision-shaped '
    'retain() plus decline_to_remember. Separate from prompt_generation because the prompt text and the '
    'tool surface are two instruments answering two questions -- bump this whenever the surface changes.';

COMMIT;

-- ⭐ PROOF GUARDS. A migration that silently did nothing is worse than one that failed.
DO $$
DECLARE
    gen1 integer;
    gen3 integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'persona_sotera' AND table_name = 'log_retention_decisions') THEN
        RAISE EXCEPTION '038: log_retention_decisions was not created';
    END IF;

    -- ⭐⭐ THE RECEIPT CHECK MUST ACTUALLY BITE. A constraint that cannot fail is decoration.
    BEGIN
        INSERT INTO log_retention_decisions (content, state, memory_id)
        VALUES ('zz_probe_038', 'unrepresented', gen_random_uuid());
        RAISE EXCEPTION '038: the receipt CHECK accepted a memory_id on a non-persisted state';
    EXCEPTION WHEN check_violation THEN
        NULL; -- ⭐ expected
    END;

    BEGIN
        INSERT INTO log_retention_decisions (content, state) VALUES ('zz_probe_038', 'persisted');
        RAISE EXCEPTION '038: the receipt CHECK accepted persisted with NO memory_id';
    EXCEPTION WHEN check_violation THEN
        NULL; -- ⭐ expected
    END;

    -- ⛔ AND ALL FIVE STATES MUST BE EXPRESSIBLE, or the vocabulary is decorative.
    BEGIN
        INSERT INTO log_retention_decisions (content, state) VALUES
            ('zz_probe_038', 'declined'), ('zz_probe_038', 'unrepresented'),
            ('zz_probe_038', 'refused'),  ('zz_probe_038', 'accepted');
        INSERT INTO log_retention_decisions (content, state, memory_id)
        VALUES ('zz_probe_038', 'persisted', gen_random_uuid());
        DELETE FROM log_retention_decisions WHERE content = 'zz_probe_038';
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION '038: a state could not be recorded -- %', SQLERRM;
    END;

    -- ⭐⭐⭐ THE CORPUS IS PROVABLY GENERATION 1.
    --
    -- ⚠️⚠️ THIS GUARD FIRST ASSERTED A MAGIC NUMBER (79) AND CAUGHT ME OUT — correctly. The corpus GREW
    -- while this work was being done: Sotera kept running, and two more reflections landed (the newest at
    -- 2026-09-02 07:00Z). ⛔ A count frozen at the moment an audit was written is a claim about the past
    -- that stops being true the next time she reflects.
    -- ⇒ ⭐ the assertions below are the ones that stay true: the backfill is COMPLETE, and NOTHING has been
    -- written under the new surface yet. Those are the two facts the surface swap actually depends on.
    IF EXISTS (SELECT 1 FROM log_conversation_revisits WHERE tool_generation IS NULL) THEN
        RAISE EXCEPTION '038: a reflection row has no tool_generation -- the backfill was incomplete';
    END IF;

    -- ⭐⭐ THE PRECONDITION FOR THE SURFACE SWAP: every reflection that exists so far was offered the OLD
    -- five tools, so none may already claim the new surface.
    IF EXISTS (SELECT 1 FROM log_conversation_revisits WHERE tool_generation <> 1) THEN
        RAISE EXCEPTION '038: a reflection already carries a non-1 tool_generation before the swap';
    END IF;

    SELECT count(*) INTO gen1 FROM log_conversation_revisits WHERE tool_generation = 1;
    SELECT count(*) INTO gen3 FROM log_conversation_revisits WHERE prompt_generation = 3;

    -- ⭐ The boundary is recorded rather than asserted: everything up to this rolling_id was gathered on
    -- the old surface, whatever the count happens to be by the time anyone reads this.
    RAISE NOTICE '038: % reflections marked tool_generation 1 (prompt-generation-3: %); boundary at rolling_id %',
        gen1, gen3, (SELECT coalesce(max(rolling_id), 0) FROM log_conversation_revisits);
END $$;
