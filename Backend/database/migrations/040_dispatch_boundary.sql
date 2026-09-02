-- ⭐⭐⭐ 040 · THE DISPATCH BOUNDARY BECOMES REAL, AND THE BOUNDARY ITSELF BECOMES VISIBLE.
--
-- Ote, 2026-09-02: *"Fix the dispatch boundary. The invariant should be: offered tool set → dispatch →
-- only an offered tool may execute. If the model emits a tool that was not offered, it must not execute.
-- Refuse it safely and record the event/attempt so it remains observable."*
--
-- ── ⚠️⚠️ WHAT THE MEASUREMENT ACTUALLY SAID, AFTER I READ IT PROPERLY ────────────────────────────
-- `remember_fact` is withheld from reflection. `log_tool_calls` holds **9 attempts across 3 days**, and
-- **every single one failed** — all with `entity, attribute, value are required`, under five different
-- invented argument shapes: {attribute,name,value} · {category,name,value} · {key,type,value} ·
-- {content} · {content,kind}.
--
-- ⇒ ⛔ She did NOT walk through the closed door. **She was guessing the argument names of a tool she had
-- never been shown**, because a withheld tool's schema is never sent — while `remember`'s own description
-- tells her to use `remember_fact` for subject-attribute-value facts. The system named a door, refused to
-- describe it, let her knock nine times, and answered each knock with a validation error.
-- ⭐ A refusal that says *"that is not one of the tools available here, and here is what is"* is strictly
-- better than an error she cannot act on.
--
-- ── ⭐⭐ WHY TWO COLUMNS AND NOT ONE, AND WHY NOT A THIRD ────────────────────────────────────────
-- Ote: *"preserve the distinction between: tool was offered · model emitted/called it · dispatch
-- authorized it · action actually succeeded… rather than collapsing them into one tools_used signal."*
--
--   offered      REFLECTION_TOOLS, stamped per row by `tool_generation` (a constant, and constants belong
--                in the boot line and the generation counter — ⛔ not copied into every row)
--   emitted      `tools_used` ∪ `tools_refused` — and `log_tool_calls` carries the per-call detail
--                including `arg_keys`, which is how the guessing above was visible at all
--   authorized   the two arrays are DISJOINT by construction: refused never reaches `tools_used`
--   succeeded    `wrote_memory_id` · `log_retention_decisions.state` · `log_tool_calls.ok`
--
-- ⛔ `tools_used` KEEPS ITS MEANING — *executed*. 81 historical rows mean it that way, and widening it to
-- "emitted" would rewrite the population the P1 investigation compares against.

SET search_path = persona_sotera, public;

BEGIN;

-- ⭐ EMITTED AND REFUSED. Null on every row written before enforcement existed — ⛔ deliberately NOT
-- defaulted to '{}', because "no refusal happened" and "refusal was not a concept yet" are different
-- facts and this table has already paid once for a column that could not tell absence from zero.
ALTER TABLE log_conversation_revisits
    ADD COLUMN IF NOT EXISTS tools_refused text[];

-- ── ⭐⭐⭐ THE THIRD GENERATION COUNTER ─────────────────────────────────────────────────────────────
-- Ote: *"treat the dispatch change as a new observable surface boundary. Do not mix pre-fix and post-fix
-- behavior… mark the boundary clearly enough that we can distinguish Gen-2 before dispatch enforcement /
-- Gen-2 after."*
--
--   prompt_generation    what she was ASKED
--   tool_generation      what she was OFFERED
--   dispatch_generation  whether the offer was ENFORCED   ← this one
--
-- ⛔ IT IS NOT A BUMP OF `tool_generation`. The offered SET did not change; only whether it binds. Bumping
-- the tool generation would assert a surface change that did not happen — the exact conflation that
-- counter exists to prevent.
ALTER TABLE log_conversation_revisits
    ADD COLUMN IF NOT EXISTS dispatch_generation integer;

-- Everything that already exists ran with the offered set ADVERTISED and not enforced. Backfilled rather
-- than left null so "generation 1" is a recorded fact about those runs, not an inference from a gap.
UPDATE log_conversation_revisits SET dispatch_generation = 1 WHERE dispatch_generation IS NULL;

COMMIT;

-- ── VERIFICATION ────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    unmarked bigint;
    gen1     bigint;
    boundary bigint;
BEGIN
    -- ⛔ NOT A FROZEN COUNT. 038's guard asserted 79 rows and the corpus had grown to 81 while the work
    -- was being done; `dreaming-pass-ledger` asserted an ABSENCE that a migration had filled. ⭐ What
    -- stays true is the invariant: the backfill is complete, and nothing claims enforcement before it existed.
    SELECT count(*) INTO unmarked FROM log_conversation_revisits WHERE dispatch_generation IS NULL;
    IF unmarked > 0 THEN
        RAISE EXCEPTION '040: % reflection row(s) carry no dispatch_generation -- the backfill was incomplete', unmarked;
    END IF;

    IF EXISTS (SELECT 1 FROM log_conversation_revisits WHERE dispatch_generation <> 1) THEN
        RAISE EXCEPTION '040: a reflection already claims dispatch enforcement before the boundary was created';
    END IF;

    IF EXISTS (SELECT 1 FROM log_conversation_revisits WHERE tools_refused IS NOT NULL) THEN
        RAISE EXCEPTION '040: a reflection already records a refused tool before enforcement existed';
    END IF;

    SELECT count(*) INTO gen1 FROM log_conversation_revisits WHERE dispatch_generation = 1;
    SELECT coalesce(max(rolling_id), 0) INTO boundary FROM log_conversation_revisits;

    -- ⭐ The boundary is RECORDED rather than asserted: everything up to this rolling_id ran with the
    -- offer merely advertised, whatever the count happens to be by the time anyone reads this.
    RAISE NOTICE '040: % reflections marked dispatch_generation 1; boundary at rolling_id %', gen1, boundary;
END $$;
