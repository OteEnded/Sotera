-- ⭐⭐⭐ 054 · DREAMING RUN OBSERVABILITY — make the record that already exists JOINABLE and MEASURABLE.
--
-- Ote, 2026-09-18: *"Use the existing logging architecture. Do not create a new Dreaming logging
-- subsystem and do not create run_events at this stage."* ⇒ ⛔ NO NEW TABLE. Every lifecycle stage of a
-- Dreaming pass already has a home; what was missing was the correlation id and the runtime numbers.
--
--     log_conversation_revisits   THE DREAM RUN  (canonical record — unchanged in role)
--       ├── log_tool_calls         she reached for a tool   ⛔ had NO revisit column at all
--       ├── log_retention_decisions  she decided to keep / not keep  ⓘ column existed, never written
--       └── txn_memories           what came of it   (already pointed at by wrote_memory_id)
--
-- ── ⭐⭐ WHAT THE DATA ALREADY KNEW, MEASURED BEFORE WRITING THIS ───────────────────────────────────
-- `log_retention_decisions.revisit_id` has been NULL on 62/62 rows — but `act_kind`/`act_id` (049) have
-- been populated on 62/62, and ⭐ **all 62 `act_id` values resolve to a real `log_conversation_revisits`
-- row**. So the correlation was never absent; it was recorded under the GENERIC act columns and nothing
-- taught a reader that `act_kind='revisit'` ⇒ `act_id` IS a revisit id. ⇒ 054 populates the TYPED column
-- going forward; ⛔ it does NOT rewrite the 62 historical rows (no historical row repair), because the
-- act columns already answer the question for them and the reader now knows how to ask.
--
-- ── ⭐⭐⭐ WHY `termination_observed` AND NOT `stop_reason` ───────────────────────────────────────────
-- Ote: *"provider-native done_reason is currently discarded by chat() … don't label the derived value as
-- provider fact."* `chat()` returns `{message, usage, model, provider}` and drops the provider's
-- `done_reason`, so `length`/`stop` in this codebase is COMPUTED by us (`completionTokens >= maxTokens`).
-- A column called `stop_reason` would be read as the provider's own word for what happened, and within a
-- month nobody would remember it was arithmetic.
-- ⇒ TWO columns, so the value can never lie about where it came from:
--     termination_observed  WHAT we classify the ending as
--     termination_source    WHO says so — 'derived' (our arithmetic) · 'provider' (native done_reason,
--                           only if chat() is ever taught to pass it through) · 'loop' (OUR round cap,
--                           which is not a model event at all)
-- ⛔ `termination_source = 'provider'` is UNREACHABLE TODAY ON PURPOSE. It is the value that becomes
-- writable the day someone threads `done_reason` through `chat()` — and until then its absence is the
-- honest record that we never had the provider's word for it.
-- ⓘ 017 dropped the old `finish` column on Ote's instruction. This is not that column returning: `finish`
-- was a single unqualified string. The open question *"does stop_reason become a column again?"* is
-- answered YES, ⭐ but only as a PAIR that states its own authority.
--
-- ── ⚠️ ROUNDS, BECAUSE THE FOUR NUMBERS ARE UNINTERPRETABLE WITHOUT IT ──────────────────────────────
-- A reflection pass is up to `reflectionMaxRounds` (4) model calls. `prompt_tokens`/`completion_tokens`
-- below are the FINAL round — the one that produced the text and the one `termination_observed` is
-- derived from, so the three agree with each other. ⭐ `completion_tokens_total` is the pass's whole
-- output, which is the cost question and a DIFFERENT number. ⛔ Recording only one of them would answer
-- "did she hit the ceiling" and "how much did she write" with the same field, and they diverge the
-- moment she uses a tool.
--
-- ── ⛔ WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────────────────────────
-- ⛔ No `run_events` table. Ote: *"The existing tables already represent the lifecycle stages… Only
--    revisit this if real Dreaming runs demonstrate that timestamp ordering is insufficient."*
-- ⛔ No tool-result payloads and no argument VALUES. `log_tool_calls` keeps arg KEYS and byte counts;
--    that boundary is its own and 054 does not touch it.
-- ⛔ No column that holds content. Every field added here is a SCALAR — which is also what keeps the
--    lifetime ruling below affordable.
--
-- ── ⭐⭐⭐ THE LIFETIME RULING (Ote: *"an explicit decision, not an accidental property"*) ────────────
-- MEASURED 2026-09-18: 207 rows over 30 days · 568 kB total · avg text 1,187 chars · max 10,923.
-- ⇒ ~7 runs/day today; ~26 MB/year even at the full 72-tick cadence with every tick producing a run.
--
--   ⭐ THE ROW IS PERMANENT, AND THAT IS THE DECISION — not the absence of one.
--     A pruned run record makes *"she never dreamed about this conversation"* and *"we deleted it"*
--     IDENTICAL, which is the exact collapse this store refuses at every other ledger (051's refusals,
--     053's DEFER rows, 038's receipts). ⛔ History must outlive its subject.
--   ⭐ THE TEXT IS PART OF THE ROW, NOT AN ATTACHMENT. It is her own words about her own experience and
--     it is 1.2 kB. `pruneEvidence` (attribution D12) prunes BULK while keeping the row — that precedent
--     applies to frozen conversation copies, ⛔ not to a persona's reflection.
--   ⚠️ THE ONE THING THAT REOPENS THIS: a future column that carries a PAYLOAD (a transcript, a tool
--     result, an embedding). Growth here is linear in scalars by construction; if that stops being true,
--     the ruling is void and must be re-taken, ⛔ not quietly stretched.
--   ⓘ Enforced beyond prose: `REVISIT_RECORD_LIFETIME` in `reflection-lifecycle.js` declares it, and
--     `dreaming-observability-check.mjs` fails if any source file learns to DELETE from this table.
--
-- Apply:  node test/maintenance/apply-migration.mjs 054_dreaming_run_observability.sql

SET search_path = persona_sotera, public;

BEGIN;

-- ══ A · CORRELATION ════════════════════════════════════════════════════════════════════════════════
-- ⛔ NO FOREIGN KEY, for 051/053's reason, measured there: an FK would pin the parent row alive and make
-- an append-only history something other code must delete from. A dangling id is the correct record of a
-- tool call made inside a run that no longer exists.
ALTER TABLE log_tool_calls
  ADD COLUMN IF NOT EXISTS revisit_id uuid;

COMMENT ON COLUMN log_tool_calls.revisit_id IS
  'The Dream Run this call was made inside (log_conversation_revisits.id), declared by the reflection '
  'call site via ctx.caller.revisitId. NULL for ordinary chat turns. No FK on purpose: history outlives '
  'its subject.';

-- Partial, because the overwhelming majority of tool calls are ordinary turns and will never carry one.
CREATE INDEX IF NOT EXISTS log_tool_calls_revisit_idx
  ON log_tool_calls (revisit_id, created_at)
  WHERE revisit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS log_retention_decisions_revisit_idx
  ON log_retention_decisions (revisit_id, created_at)
  WHERE revisit_id IS NOT NULL;

-- ⭐ The act columns have carried this since 049 and will keep carrying it — the typed column is the
-- JOINABLE one, the act pair is the GENERIC one, and they must agree. This index is what makes the
-- historical rows (act-only) as cheap to read as the new ones.
CREATE INDEX IF NOT EXISTS log_retention_decisions_act_idx
  ON log_retention_decisions (act_kind, act_id)
  WHERE act_id IS NOT NULL;

COMMENT ON COLUMN log_retention_decisions.revisit_id IS
  'The Dream Run this decision was taken inside. Populated from the declared act since 054; rows before '
  '2026-09-18 carry the same value in act_kind/act_id instead and are not rewritten.';

-- ══ B · RUNTIME MEASUREMENTS ═══════════════════════════════════════════════════════════════════════
-- Every value below is already in hand at the reflection call site. ⛔ None of them is inferred, and
-- none of them changes what she is shown or what she thinks.
ALTER TABLE log_conversation_revisits
  ADD COLUMN IF NOT EXISTS num_ctx                 integer,
  ADD COLUMN IF NOT EXISTS max_tokens              integer,
  ADD COLUMN IF NOT EXISTS prompt_tokens           integer,
  ADD COLUMN IF NOT EXISTS completion_tokens       integer,
  ADD COLUMN IF NOT EXISTS completion_tokens_total integer,
  ADD COLUMN IF NOT EXISTS rounds                  integer,
  ADD COLUMN IF NOT EXISTS termination_observed    text,
  ADD COLUMN IF NOT EXISTS termination_source      text;

COMMENT ON COLUMN log_conversation_revisits.num_ctx IS
  'memory.reflectionNumCtx as REQUESTED for this pass. The runtime window asked for, not one measured '
  'from the provider.';
COMMENT ON COLUMN log_conversation_revisits.max_tokens IS
  'memory.reflectionMaxTokens as requested — the output ceiling termination_observed is compared against.';
COMMENT ON COLUMN log_conversation_revisits.prompt_tokens IS
  'FINAL round only: the largest prompt this pass actually sent. Compare against num_ctx.';
COMMENT ON COLUMN log_conversation_revisits.completion_tokens IS
  'FINAL round only — the round that produced the text and that termination_observed is derived from.';
COMMENT ON COLUMN log_conversation_revisits.completion_tokens_total IS
  'Summed over every round of the pass. This is the cost/output question; completion_tokens is the '
  'ceiling question. They diverge as soon as she calls a tool.';
COMMENT ON COLUMN log_conversation_revisits.rounds IS
  'Model calls made in this pass (1 = she answered without reaching for a tool).';
COMMENT ON COLUMN log_conversation_revisits.termination_observed IS
  'HOW THE PASS ENDED, AS WE CLASSIFY IT. Read termination_source before trusting the word: length/stop '
  'are OUR arithmetic today, not the provider''s done_reason.';
COMMENT ON COLUMN log_conversation_revisits.termination_source IS
  'WHO SAYS SO. derived = computed by us from completion_tokens >= max_tokens. provider = the adapter''s '
  'native done_reason (UNREACHABLE until chat() is taught to pass it through). loop = our own '
  'reflectionMaxRounds cap, which is not a model event at all.';

-- ⭐ The pair is constrained TOGETHER, because either alone is meaningless: a classification with no
-- authority, or an authority with nothing to qualify.
--
-- ⚠️⚠️ WRITTEN TWICE, AND THE FIRST VERSION WAS UNSOUND — CAUGHT BY ITS OWN NEGATIVE PROOF, ⛔ not by
-- reading it. The obvious form is
--     (observed IS NULL AND source IS NULL) OR (observed IN (...) AND source IN (...))
-- and against `observed='length', source=NULL` it evaluates to **NULL**, not FALSE: `NULL IN (...)` is
-- NULL, `TRUE AND NULL` is NULL, `FALSE OR NULL` is NULL. ⭐⭐ **A CHECK CONSTRAINT ACCEPTS NULL.** So the
-- guard against an unqualified termination — the entire reason the pair exists — silently allowed
-- exactly the row it was written to refuse.
-- ⇒ `(a IS NULL) = (b IS NULL)` compares two booleans that are never NULL, and each membership test is
-- guarded by its own IS NULL. ⓘ `dreaming-observability-check.mjs` C3 is the proof that found this; it
-- fails against the old predicate and passes against this one.
ALTER TABLE log_conversation_revisits
  DROP CONSTRAINT IF EXISTS revisit_termination_pair;
ALTER TABLE log_conversation_revisits
  ADD CONSTRAINT revisit_termination_pair CHECK (
    (termination_observed IS NULL) = (termination_source IS NULL)
    AND (termination_observed IS NULL OR termination_observed IN ('length', 'stop', 'tool-round-cap'))
    AND (termination_source   IS NULL OR termination_source   IN ('derived', 'provider', 'loop'))
  );

-- ⚠️ A non-negative guard only. ⛔ NOT `completion_tokens <= max_tokens`: a provider that overshoots its
-- own cap is a FACT WORTH KEEPING, and a CHECK that refused it would make the instrument hide exactly
-- the anomaly it exists to catch.
ALTER TABLE log_conversation_revisits
  DROP CONSTRAINT IF EXISTS revisit_token_counts_sane;
ALTER TABLE log_conversation_revisits
  ADD CONSTRAINT revisit_token_counts_sane CHECK (
    coalesce(num_ctx, 0) >= 0 AND coalesce(max_tokens, 0) >= 0
    AND coalesce(prompt_tokens, 0) >= 0 AND coalesce(completion_tokens, 0) >= 0
    AND coalesce(completion_tokens_total, 0) >= 0 AND coalesce(rounds, 0) >= 0
  );

COMMIT;

-- ── VERIFY ─────────────────────────────────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='persona_sotera' AND table_name='log_conversation_revisits'
--    AND column_name IN ('num_ctx','max_tokens','prompt_tokens','completion_tokens',
--                        'completion_tokens_total','rounds','termination_observed','termination_source');
-- SELECT count(*) FROM information_schema.columns
--  WHERE table_schema='persona_sotera' AND table_name='log_tool_calls' AND column_name='revisit_id';
