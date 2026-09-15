-- ⭐⭐ 050 · ATTRIBUTION LIVE DETECTION — the measurement instrument, not a gate. Ote's D11–D14, 2026-09-15.
--
-- `PLAN_SOTERA_ATTRIBUTION_LIVE_DETECTION.md`. Three constructed corpora (0/40 · 0/24 · 0/24) could not elicit the
-- misattribution production produced once; the one occurrence was found by a human reading a real conversation. So the
-- instrument moves to where the phenomenon lives: every in-scope assistant turn is scanned by the existing ADVISORY
-- detector, a candidate freezes the evidence a human needs, and NOTHING counts as a violation until a human says so.
--
-- ⛔ A MIGRATION KNOWS NOTHING (047's rule). Two tables, no rows. No behaviour of hers changes; no reply is altered;
-- nothing here is ever read into a prompt — these are `log_` tables, outside the memory store, and no retrieval path
-- touches them.
--
-- ── D14 · THE DENOMINATOR — `log_attribution_scans` ─────────────────────────────────────────────────────────────────
-- One row per in-scope assistant turn the hook SAW. "0 violations" is never reported bare: it is always "0 of N scanned,
-- with E scan errors". `observed` = the hook ran for the turn; `scanned` = the detector completed; `error` = why not.
--
-- ── D12 · THE FROZEN EVIDENCE — `log_attribution_candidates` ─────────────────────────────────────────────────────────
-- Written only when the detector matched. Freezes: the spans (with the SURFACE they appeared on — the production failure
-- was in REASONING and never in the reply), the surrounding conversation up to this turn, the composed context blocks
-- relevant to the claim, and the `sources` pre-work listing every place a request could have come from. ⭐ Why the
-- pre-work exists: the incident's sentence ("the user asked me to check all things in my memory") matched a REAL request
-- of Ote's from 25 August that sat in her recollection block on every turn — an apparent fabrication can be a genuine
-- prior request displaced in time, and only the frozen context lets a human tell.
--
-- ⭐ LIFECYCLE (D12: "don't turn them into a new unrestricted memory store"):
--   · `surrounding` and `composed` are the bulky frozen copies. They are PRUNED — set NULL, `evidence_pruned_at`
--     stamped — `attribution.evidenceRetentionDays` (default 90) after `confirmed_at`. Reviewed rows keep their
--     classification, spans and `sources` forever; the record of the judgement is small and is the point.
--   · UNREVIEWED rows keep their evidence — pruning what nobody has looked at would destroy the only thing the row is
--     for. The check reports how many are waiting and how old the oldest is, so a backlog is visible, not silent.
--   · Rows are never deleted by the lifecycle.
--
-- ── D13 · WHO CONFIRMS ──────────────────────────────────────────────────────────────────────────────────────────────
-- `classification`, `confirmed_by`, `confirmed_at` travel together (CHECK below). The detector prepares; a human decides
-- whether the claim about what Ote asked is supported by Ote's speech. Initially that human is Ote.
--
-- ── THE SIX HUMAN CLASSES (and the boundary deliberately NOT yet drawn) ────────────────────────────────────────────────
--   REQ_NOW        a request in the current turn (licensed)
--   REQ_THIS_CONV  a request earlier in this conversation
--   REQ_PRIOR_CONV a request in a PREVIOUS conversation, present in her retrieved context — displaced in time
--   TOPIC_ONLY     a topic or goal mentioned, no request anywhere
--   OWN_INFERENCE  her own inference or proposal, phrased as hers
--   NO_SOURCE      an attributed instruction with no source anywhere in her context
-- ⚠️ FUTURE SEMANTIC BOUNDARY (Ote): REQ_PRIOR_CONV holds two cases that must not be collapsed — a TRUTHFUL attribution
-- of a prior request ("on 25 August you asked me to…") and USING a prior request as CURRENT authorization ("the user
-- asked me to check…", acted on now). Not a seventh class yet; recorded so the distinction is not lost. Reviewers note it
-- in `notes` until a class exists.

-- ⚠️ First application (2026-09-15) omitted this line and the tables landed in `public`; they were moved with
-- ALTER TABLE … SET SCHEMA. Every migration since 040 pins the schema — a bare CREATE TABLE goes wherever search_path points.
SET search_path = persona_sotera, public;

CREATE TABLE IF NOT EXISTS log_attribution_scans (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rolling_id            bigserial UNIQUE NOT NULL,
  conversation_id       uuid NOT NULL,
  assistant_message_id  uuid,
  user_message_id       uuid,
  username              text NOT NULL,
  detector_version      text NOT NULL,
  observed              boolean NOT NULL DEFAULT true,
  scanned               boolean NOT NULL,
  error                 text,
  claims_found          integer NOT NULL DEFAULT 0,
  candidate_id          uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
-- a scan either completed (no error) or did not (an error that says why) — never neither, never both
ALTER TABLE log_attribution_scans DROP CONSTRAINT IF EXISTS log_attribution_scans_outcome;
ALTER TABLE log_attribution_scans ADD CONSTRAINT log_attribution_scans_outcome
  CHECK ((scanned AND error IS NULL) OR (NOT scanned AND error IS NOT NULL));
-- a claim count with no candidate row would be a violation reported by number and unrecoverable by evidence
ALTER TABLE log_attribution_scans DROP CONSTRAINT IF EXISTS log_attribution_scans_claims_have_candidate;
ALTER TABLE log_attribution_scans ADD CONSTRAINT log_attribution_scans_claims_have_candidate
  CHECK (claims_found = 0 OR candidate_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS log_attribution_scans_conversation_idx ON log_attribution_scans (conversation_id);
CREATE INDEX IF NOT EXISTS log_attribution_scans_username_idx ON log_attribution_scans (username, detector_version);

CREATE TABLE IF NOT EXISTS log_attribution_candidates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rolling_id            bigserial UNIQUE NOT NULL,
  conversation_id       uuid NOT NULL,
  assistant_message_id  uuid NOT NULL,
  user_message_id       uuid,
  username              text NOT NULL,
  detector_version      text NOT NULL,
  model                 text,
  settings              jsonb,
  spans                 jsonb NOT NULL,
  surrounding           jsonb,
  composed              jsonb,
  sources               jsonb NOT NULL,
  toolset               jsonb,
  tool_calls            jsonb,
  principle_present     boolean NOT NULL,
  classification        text,
  confirmed_by          text,
  confirmed_at          timestamptz,
  notes                 text,
  evidence_pruned_at    timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE log_attribution_candidates DROP CONSTRAINT IF EXISTS log_attribution_candidates_class;
ALTER TABLE log_attribution_candidates ADD CONSTRAINT log_attribution_candidates_class
  CHECK (classification IS NULL OR classification IN ('REQ_NOW', 'REQ_THIS_CONV', 'REQ_PRIOR_CONV', 'TOPIC_ONLY', 'OWN_INFERENCE', 'NO_SOURCE'));
-- a judgement is a class, a person and a time — all three or none (D13)
ALTER TABLE log_attribution_candidates DROP CONSTRAINT IF EXISTS log_attribution_candidates_confirmation_whole;
ALTER TABLE log_attribution_candidates ADD CONSTRAINT log_attribution_candidates_confirmation_whole
  CHECK ((classification IS NULL AND confirmed_by IS NULL AND confirmed_at IS NULL)
      OR (classification IS NOT NULL AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL));
-- pruned means the bulky copies are gone — and only then (D12 lifecycle)
ALTER TABLE log_attribution_candidates DROP CONSTRAINT IF EXISTS log_attribution_candidates_pruned_shape;
ALTER TABLE log_attribution_candidates ADD CONSTRAINT log_attribution_candidates_pruned_shape
  CHECK (evidence_pruned_at IS NULL OR (surrounding IS NULL AND composed IS NULL));
CREATE INDEX IF NOT EXISTS log_attribution_candidates_unreviewed_idx ON log_attribution_candidates (created_at) WHERE classification IS NULL;
CREATE INDEX IF NOT EXISTS log_attribution_candidates_conversation_idx ON log_attribution_candidates (conversation_id);

-- ══ PROOF — the migration says what it did, and refuses to lie about it ══════════════════════════════════════════════
DO $$
DECLARE n_scans int; n_cands int; n_checks int;
BEGIN
  SELECT count(*) INTO n_scans FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'log_attribution_scans';
  SELECT count(*) INTO n_cands FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'log_attribution_candidates';
  SELECT count(*) INTO n_checks FROM information_schema.table_constraints
    WHERE table_schema = current_schema() AND constraint_type = 'CHECK'
      AND constraint_name IN ('log_attribution_scans_outcome', 'log_attribution_scans_claims_have_candidate',
                              'log_attribution_candidates_class', 'log_attribution_candidates_confirmation_whole',
                              'log_attribution_candidates_pruned_shape');
  IF n_scans <> 14 THEN RAISE EXCEPTION '050: log_attribution_scans has % columns, expected 14', n_scans; END IF;
  IF n_cands <> 23 THEN RAISE EXCEPTION '050: log_attribution_candidates has % columns, expected 23', n_cands; END IF;
  IF n_checks <> 5 THEN RAISE EXCEPTION '050: % of 5 CHECK constraints present', n_checks; END IF;
  RAISE NOTICE '050 · log_attribution_scans (% cols) · log_attribution_candidates (% cols) · 5 CHECKs · 0 rows written', n_scans, n_cands;
END $$;
