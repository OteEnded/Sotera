-- ⭐⭐⭐ 053 · THE COMPETITION ADMISSION LEDGER — the receipt for an act that had none.
--
-- A-D4 established that nothing authorized the transition from GROUPING to COMPETITION, and A-D5 that the
-- system had a warrant form for the exclusivity ACT but none for the exclusivity SET. 053 gives the new
-- admission act the one thing every other governed seam in this store already has: a ledger that can
-- record a REFUSAL.
--
--     log_slot_bindings   propose/confirm, occasion-separated   (048)
--     log_slot_aliases    4 of 4 rows are REFUSALS              (051)
--     log_memory_refusals 36 rows                               (029/035)
--     log_memory_admissions  ← THIS. ⭐ And like 051, its refusals are the point.
--
-- ── ⭐ A — ACCEPT (Ote, 2026-09-17) ──────────────────────────────────────────────────────────────────
--     *"An undeclared question does not prevent memory formation; it prevents mutually exclusive
--      competition."*
-- ⇒ a DEFER row here means the memory WAS written and simply did not compete. ⛔ It is not a failure, and
-- a reader must not treat it as one.
--
-- ── ⭐⭐ WHY `NOT-IN-SCOPE` IS NOT A VALUE HERE ───────────────────────────────────────────────────────
-- The gate did not apply, so there is no verdict to account for. Recording one would make "the gate had no
-- business here" indistinguishable from "the gate ran and declined" — the exact collapse 051 and the
-- replacement gate both refuse. ⛔ Absent stays absent.
--
-- ── ⚠️ NO FOREIGN KEYS TO `txn_memories`, FOR 051'S REASON, MEASURED THERE ───────────────────────────
-- An FK would PIN MEMORIES ALIVE and make an append-only history something other code must delete from.
-- ⭐ THE LEDGER IS HISTORY, AND HISTORY MUST OUTLIVE ITS SUBJECT: a dangling id here is the correct record
-- of an admission decision about a row that no longer exists. Which is why the question KEYS are
-- SNAPSHOTTED as text rather than referenced — the row must read without joining anything.
--
-- Apply:  node test/maintenance/apply-migration.mjs 053_competition_admission_ledger.sql

SET search_path = persona_sotera, public;

BEGIN;

CREATE TABLE IF NOT EXISTS log_memory_admissions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rolling_id               bigserial UNIQUE NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),

  -- ══ THE PAIR ═══════════════════════════════════════════════════════════════════════════════════════
  -- ⭐ PER-PAIR, because A-D4 established exclusivity is a claim about a PAIR. Three rows under one label
  -- carrying three different questions produce THREE rows here, ⛔ not one.
  -- ⚠️ `incoming_id` is NULLABLE and that is load-bearing: the verdict is decided BEFORE the row exists,
  -- and a NOOP/DUPLICATE resolution writes no new row at all. NULL means *"no new row was created by the
  -- act this verdict belongs to"* — ⛔ it never means "unknown".
  incoming_id              uuid,
  incumbent_id             uuid NOT NULL,

  -- ══ THE TWO SIDES, SNAPSHOTTED ═════════════════════════════════════════════════════════════════════
  -- ⭐⭐ BOTH NULLABLE, AND NULL IS THE MOST INFORMATIVE VALUE IN THIS TABLE: it is what DEFER is made of.
  -- ⛔ A NULL here means NOT ESTABLISHED. It never means "the slot's question" — D-2 forbids that reading,
  -- and 048 already paid for a NULL that meant two things.
  incoming_question_key    text,
  incumbent_question_key   text,

  -- ══ THE VERDICT ════════════════════════════════════════════════════════════════════════════════════
  -- ⭐⭐⭐ ABSTAIN ≠ DEFER, AND THE CHECK CONSTRAINT IS WHERE THAT LOCK BECOMES UNFORGEABLE:
  --   ABSTAIN is a POSITIVE FINDING — it REQUIRES both sides. A row claiming ABSTAIN with a NULL side is
  --           a claim the evidence cannot support, so the database refuses to store it.
  --   DEFER   is an ABSENCE — it REQUIRES at least one side missing. A DEFER with both sides present would
  --           be a gate that had an answer and declined to give it.
  --   ADMIT   requires both sides present AND EQUAL.
  -- ⇒ the distinction this whole arc protected is enforced by the schema, ⛔ not by the caller's care.
  outcome                  text NOT NULL CHECK (outcome IN ('ADMIT', 'ABSTAIN', 'DEFER')),
  CONSTRAINT log_memory_admissions_outcome_evidence_ck CHECK (
    (outcome = 'ADMIT'   AND incoming_question_key IS NOT NULL AND incumbent_question_key IS NOT NULL
                         AND incoming_question_key = incumbent_question_key)
 OR (outcome = 'ABSTAIN' AND incoming_question_key IS NOT NULL AND incumbent_question_key IS NOT NULL
                         AND incoming_question_key <> incumbent_question_key)
 OR (outcome = 'DEFER'   AND (incoming_question_key IS NULL OR incumbent_question_key IS NULL))
  ),

  -- ⭐ THE REMEDY RIDES WITH THE VERDICT. A refusal a reader cannot act on is noise, and one that names the
  -- wrong remedy is worse — 051's and the replacement gate's rule, applied here.
  why                      text NOT NULL,

  -- ⭐ WHICH WARRANT FORM DECIDED IT. `standing` is reserved for the Identity Resolver's route, which is
  -- deliberately NOT plumbed through this gate today (D-3: keep it narrow) — the value exists so that a
  -- future decision has somewhere to land, ⛔ not because anything writes it.
  route                    text NOT NULL DEFAULT 'q-route' CHECK (route IN ('q-route', 'standing')),

  -- ══ WHO, ON WHAT OCCASION ══════════════════════════════════════════════════════════════════════════
  -- ⑧: attribution is not authorization — ⛔ the writer does not make this legitimate. It is here so the
  -- act is ANSWERABLE, which ⑧-A requires of a warrant: someone must be askable about it.
  writer                   text,
  act_kind                 text,
  act_id                   text,
  occasion                 text,
  persona                  text,
  user_id                  uuid,

  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- ⭐ The two questions this table exists to answer cheaply: "what happened to THIS row?" and "how often did
-- the gate decline, and why?"
CREATE INDEX IF NOT EXISTS log_memory_admissions_incumbent_idx ON log_memory_admissions (incumbent_id);
CREATE INDEX IF NOT EXISTS log_memory_admissions_incoming_idx  ON log_memory_admissions (incoming_id)
  WHERE incoming_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS log_memory_admissions_outcome_idx   ON log_memory_admissions (outcome, created_at DESC);

COMMENT ON TABLE log_memory_admissions IS
 'THE RECEIPT FOR COMPETITION ADMISSION (A-D4/A-D5). One row per EVALUATED PAIR. ADMIT = both sides declared the same question and may compete for one current answer. ABSTAIN = both sides declared DIFFERENT questions, so they were never candidates for one another -- a POSITIVE finding with NO remedy. DEFER = at least one side is not established, so they do not compete YET -- an ABSENCE whose remedy is to DECLARE the question. NOT-IN-SCOPE is deliberately NOT a value: the gate did not apply, so there is no verdict to account for. Under A-ACCEPT a DEFER means the memory WAS written and simply did not compete; it is not a failure.';

COMMENT ON COLUMN log_memory_admissions.incumbent_question_key IS
 'The question the INCUMBENT was admitted under, read from ITS OWN question_id_at_admission. NULL means NOT ESTABLISHED -- it NEVER means "the slot''s current question", which D-2 forbids and which 048''s pin exists to prevent being read that way.';

-- ── ⭐ PROVE IT. Same discipline as 007/009/010/013/014/031/043/046/047/048/051. ─────────────────────
DO $$
DECLARE
    n_rows  int;
    n_cols  int;
    ok_ck   boolean;
BEGIN
    SELECT count(*) INTO n_rows FROM log_memory_admissions;
    IF n_rows <> 0 THEN
        RAISE EXCEPTION '053: log_memory_admissions must land EMPTY — found % rows. No admission has been adjudicated yet, so any row here was invented.', n_rows;
    END IF;

    SELECT count(*) INTO n_cols FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'log_memory_admissions';
    IF n_cols < 16 THEN
        RAISE EXCEPTION '053: expected at least 16 columns on log_memory_admissions, found %', n_cols;
    END IF;

    -- ⭐⭐ THE LOCK IS ONLY REAL IF THE DATABASE REFUSES THE FORGERY. Prove the constraint REJECTS an
    -- ABSTAIN with a missing side — the exact shape of "claiming a positive finding without the evidence".
    BEGIN
        INSERT INTO log_memory_admissions (incumbent_id, incoming_question_key, incumbent_question_key, outcome, why)
        VALUES (gen_random_uuid(), 'zz_probe', NULL, 'ABSTAIN', 'zz probe — must be refused');
        RAISE EXCEPTION '053: ⛔ THE OUTCOME CHECK IS VACUOUS — an ABSTAIN with a NULL side was ACCEPTED';
    EXCEPTION WHEN check_violation THEN
        ok_ck := true;
    END;

    -- ⭐ And prove it ACCEPTS a legitimate DEFER, so the constraint is not simply rejecting everything.
    INSERT INTO log_memory_admissions (incumbent_id, incoming_question_key, incumbent_question_key, outcome, why)
    VALUES (gen_random_uuid(), 'zz_probe', NULL, 'DEFER', 'zz probe — must be accepted, then removed');
    DELETE FROM log_memory_admissions WHERE why = 'zz probe — must be accepted, then removed';

    SELECT count(*) INTO n_rows FROM log_memory_admissions;
    IF n_rows <> 0 THEN
        RAISE EXCEPTION '053: the probe row was not removed — % rows remain', n_rows;
    END IF;

    RAISE NOTICE '053: log_memory_admissions created and EMPTY. The outcome check REFUSED an ABSTAIN with a missing side and ACCEPTED a DEFER with one. ABSTAIN != DEFER is now enforced by the schema. No admission has been adjudicated.';
END $$;

COMMIT;
