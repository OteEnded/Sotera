-- ⭐⭐⭐ 052 · B-D4 · THE PROJECTION VERSION ON AN ATTRIBUTION SCAN.
--
-- Ratified by Ote 2026-09-16: *"new scans must identify which projection/version produced the episode. That keeps
-- before/after measurements comparable."*
--
-- ══ ⚠️ WHY A SCAN NEEDS THIS AT ALL — the coupling, stated plainly ═══════════════════════════════════════
-- `attribution-live-detection.js` classifies by PARSING THE COGNITION LAYER'S RENDERED BLOCK: lines of the form
-- `X said to me: …` are its REQ_PRIOR_CONV source set. ⇒ **the episode projection IS the detector's input.**
-- B1/B2 changed that input on 2026-09-16: the counterpart half went from `ORDER BY rolling_id ASC LIMIT 2` (the
-- two OLDEST user turns, which could essentially never contain a correction) to one contiguous positional window
-- over both speakers, with elision and withholding declared.
--
-- ⇒ a claim that could ONLY have been `NO_SOURCE` before may legitimately be `REQ_PRIOR_CONV` now, because the
-- source is finally visible. ⛔ That is the instrument becoming MORE CORRECT — but it is still a change of input
-- while the instrument itself is FROZEN, and a denominator that silently spans both regimes is not a denominator.
--
-- ══ ⛔ NULL ON THE EXISTING ROWS, AND THAT IS THE HONEST RECORD ══════════════════════════════════════════
-- Ote: *"do not modify the existing 22 scans."* They keep NULL. ⓘ We happen to know by their timestamps that all
-- 22 predate B (the last is 2026-09-16 06:05 UTC; B shipped that afternoon), but the ROW does not claim it, and
-- writing a version into them would be backfilling an assertion the instrument never made — the same ruling as
-- A-D6 on the 8 pre-existing aliases: an audited unknown stays unknown.
-- ⇒ NULL means "taken before this column existed". The DATE is the discriminator, ⛔ not an invented value.
--
-- ══ ⛔ WHAT THIS DOES NOT DO ═════════════════════════════════════════════════════════════════════════════
-- ⛔ The detector is NOT modified · ⛔ `ATTRIBUTION_PRINCIPLE` is NOT modified · ⛔ no scan row is updated ·
-- ⛔ no candidate is reclassified · ⛔ the 4 unreviewed candidates are untouched and still Ote's to confirm.
-- This migration adds a column and nothing else.

SET search_path = persona_sotera, public;

-- ⭐ NULLABLE WITH NO DEFAULT, deliberately. A DEFAULT would silently stamp the existing rows with a version they
-- were never taken under — the exact backfill the ruling refuses. New writes supply it explicitly; old rows keep
-- their honest absence.
ALTER TABLE log_attribution_scans      ADD COLUMN IF NOT EXISTS projection_version text;
ALTER TABLE log_attribution_candidates ADD COLUMN IF NOT EXISTS projection_version text;

COMMENT ON COLUMN log_attribution_scans.projection_version IS
  'Which conversation-evidence PROJECTION produced the episode block this scan read (B-D4, 2026-09-16). The '
  'detector parses that block for "X said to me:" lines as its REQ_PRIOR_CONV source set, so the projection is '
  'its input and a change of projection changes what is classifiable. NULL = taken before this column existed '
  '(all 22 pre-B scans); the date is the discriminator, never an invented value.';
COMMENT ON COLUMN log_attribution_candidates.projection_version IS
  'As log_attribution_scans.projection_version — the projection that produced the evidence frozen on this row.';

-- ⛔ NO INDEX. Migration 050 owns this table''s indexes and a model-declared or ad-hoc duplicate has already cost
-- this project three re-created indexes under second names (2026-09-15). Add one when a query needs it.

DO $$
DECLARE n_scans int; n_cand int; n_stamped int;
BEGIN
  SELECT count(*) INTO n_scans FROM log_attribution_scans;
  SELECT count(*) INTO n_cand  FROM log_attribution_candidates;
  SELECT count(*) INTO n_stamped FROM log_attribution_scans WHERE projection_version IS NOT NULL;
  IF n_stamped <> 0 THEN
    RAISE EXCEPTION '052 refused: % existing scan rows already carry a projection_version — this migration must not backfill', n_stamped;
  END IF;
  RAISE NOTICE '052 OK · % scans and % candidates keep projection_version NULL (pre-B, audited unknown) · new writes stamp it explicitly', n_scans, n_cand;
END $$;
