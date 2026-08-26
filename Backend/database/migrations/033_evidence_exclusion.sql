-- ⭐⭐⭐ 033 · "THIS HAPPENED, AND IT IS NOT EVIDENCE." The corpus state that did not exist.
--
-- ── ⚠️⚠️ THE GAP, NAMED AFTER THREE SEPARATE INCIDENTS ────────────────────────────────────────────
-- Retrieval eligibility is governed by exactly ONE flag: `incognito = false`. And `incognito` is set at
-- CREATE and never patched. ⇒ the corpus has exactly two states:
--
--     incognito   "this never happened for any purpose"   ⛔ unsettable after the fact
--     deleted     "this never happened at all"            ⛔ destroys the evidence
--
-- ⛔ **AND NOTHING IN BETWEEN** — which is precisely what a measurement needs. Everything else that looks
-- like an exclusion governs WRITING, not reading: `archived_at` gates the revisit lanes, `settings.probe`
-- gates noticing and reflection. ⛔ Neither removes a conversation from retrieval.
--
-- The three incidents, each of which moved the lesson somewhere new:
--   · 2026-08-23 `rate-harness` — 73 harness conversations vs 38 organic in one room. A cognition check
--     went to 0 of 20; deleting exactly those 73 restored it to 10 of 20 with no other change. ⭐ The
--     harness artefacts OUTRANKED her real conversations.
--   · 2026-08-25 B4 — the control arm scored 4/5 where the first run scored 0/5, because her first
--     retrieval was **the first run's own conversation**. ⇒ run 2 used run 1 as a trail to the target.
--   · 2026-08-26 the wrong refusal — ⭐⭐ the one proving removal is not always available. The
--     contaminating conversation was REAL (`settings.probe = false`, an ordinary title), so deleting it
--     was never on the table, and a false statement reached her in a brand-new conversation because
--     **history outlived the code that caused it**.
--
-- ── ⭐⭐ IT IS THE WEEK'S LAW AGAIN: TWO QUESTIONS SHARING ONE FIELD ──────────────────────────────
--     `incognito`                  "should this be recorded at all?"      — a PRIVACY promise, at create
--     `excluded_from_evidence_at`  "may this be RETRIEVED as evidence?"   — ⭐ this migration, settable later
-- ⛔ They must not merge. `incognito` is unsettable ON PURPOSE — a promise you can revoke later is not a
-- promise — and that is exactly why it cannot also be the experiment's tool.
--
-- ── ⭐ A TIMESTAMP, NOT A BOOLEAN, FOR THE SAME REASON AS `contradicted_at` ───────────────────────
-- It records that somebody DID this and when. NULL means nobody has excluded it, which is true of every
-- conversation today and must stay distinguishable from "considered and kept".
--
-- ── ⛔⛔ WHAT THIS MIGRATION DOES NOT DO ─────────────────────────────────────────────────────────
-- ⛔ It excludes NOTHING. Not one conversation is marked — not the probe runs, not `56425175`, not the
--    three `probe:false` conversations in root's room. The capability lands; every use of it is a
--    separate, deliberate act.
-- ⛔ It does not delete anything, ever. That is the whole point: the in-between state exists so that
--    removal stops being the only option.

SET search_path = persona_sotera, public;

ALTER TABLE txn_conversations ADD COLUMN IF NOT EXISTS excluded_from_evidence_at TIMESTAMPTZ;
ALTER TABLE txn_conversations ADD COLUMN IF NOT EXISTS exclusion_reason          TEXT;

COMMENT ON COLUMN txn_conversations.excluded_from_evidence_at IS
 'When this conversation stopped counting as EVIDENCE: it still happened, it is still readable in the UI, its messages are untouched, and it is no longer retrievable as material she can reason from. NULL means nobody has excluded it -- which is not the same as "considered and kept". Distinct from incognito ("never recorded at all", set at create and deliberately unsettable, because a privacy promise you can revoke later is not a promise) and from deletion ("this never happened"). The state exists because a measurement that leaves its own conversations in the corpus is measuring a corpus it changed, and three separate incidents proved deletion is not always available.';
COMMENT ON COLUMN txn_conversations.exclusion_reason IS
 'Why it was excluded, in words. Required in practice by the writer: an exclusion nobody can justify later is indistinguishable from data being quietly curated to make a number come out.';

-- ⭐ Reading BY exclusion is a real question — *"what have we taken out of the corpus, and why?"* — and it
-- is a small slice, so a partial index answers it without carrying every conversation.
CREATE INDEX IF NOT EXISTS txn_conversations_excluded_idx
  ON txn_conversations (excluded_from_evidence_at)
  WHERE excluded_from_evidence_at IS NOT NULL;

-- ⭐⭐ AND THE HOT PATH IS THE **INCLUDED** ONE. Every retrieval read becomes
-- `incognito = false AND excluded_from_evidence_at IS NULL`, so the partial index that matters covers the
-- rows that survive both, not the handful that do not.
CREATE INDEX IF NOT EXISTS txn_conversations_evidential_idx
  ON txn_conversations (user_id, updated_at DESC)
  WHERE incognito = false AND excluded_from_evidence_at IS NULL;

-- ── ⛔ PROOF, NOT HOPE ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    n_cols    int;
    n_excl    int;
    n_default int;
BEGIN
    SELECT count(*) INTO n_cols FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'txn_conversations'
       AND column_name IN ('excluded_from_evidence_at', 'exclusion_reason');
    IF n_cols <> 2 THEN RAISE EXCEPTION '033: expected both columns, found %', n_cols; END IF;

    -- ⛔ NO DEFAULT. A default here would make a claim about every conversation ever held.
    SELECT count(*) INTO n_default FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'txn_conversations'
       AND column_name = 'excluded_from_evidence_at' AND column_default IS NOT NULL;
    IF n_default > 0 THEN RAISE EXCEPTION '033: excluded_from_evidence_at has a default -- absence must stay honest'; END IF;

    -- ⛔⛔ AND THIS MIGRATION EXCLUDED NOTHING. Every use of the capability is a separate deliberate act,
    -- and a migration that quietly cleaned the corpus would be the exact behaviour it exists to replace.
    SELECT count(*) INTO n_excl FROM txn_conversations WHERE excluded_from_evidence_at IS NOT NULL;
    IF n_excl > 0 THEN
        RAISE EXCEPTION '033: % conversation(s) are already excluded -- this migration must add the '
                        'capability and exclude NOTHING', n_excl;
    END IF;

    -- ⭐ `incognito` MUST STILL EXIST AND STILL BE THE PRIVACY FLAG. If a later change ever folds the two
    -- together, this is where it fails.
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'persona_sotera' AND table_name = 'txn_conversations'
                      AND column_name = 'incognito') THEN
        RAISE EXCEPTION '033: incognito is gone -- the two axes must stay separate';
    END IF;
END $$;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────────────────────────
--   DROP INDEX IF EXISTS txn_conversations_evidential_idx;
--   DROP INDEX IF EXISTS txn_conversations_excluded_idx;
--   ALTER TABLE txn_conversations DROP COLUMN IF EXISTS exclusion_reason;
--   ALTER TABLE txn_conversations DROP COLUMN IF EXISTS excluded_from_evidence_at;
