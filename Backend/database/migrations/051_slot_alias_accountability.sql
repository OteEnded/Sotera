-- ⭐⭐⭐ 051 · THE ALIAS IS A GOVERNED SEMANTIC OPERATION — `log_slot_aliases`.
--
-- Ratified by Ote 2026-09-16 as decision A3 + A-D3(β) + A-D7, after
-- `INVESTIGATION_SOTERA_A_SLOT_IDENTITY_B_EVIDENCE_SELECTION.md` traced how a generic phrase came to own a
-- specific slot. ⛔ This migration lands the LEDGER ONLY. A migration knows nothing (047's rule): it declares
-- no alias, teaches no equivalence, and repairs nothing.
--
-- ══ ⚠️⚠️ THIS SUPERSEDES A SPECIFIC JUDGEMENT IN 048 §③, AND SAYS SO RATHER THAN REPLACING IT SILENTLY ══
--
-- 048 §③ reasoned, in full:
--
--     "`mst_slots` mutates three ways and the guarantee differs: BIND changes WHAT MAY BE ADMITTED ⇒ it must
--      be audited and cannot be silent; `recordAlias` changes only RESOLUTION and is already self-audited
--      inline (`{phrase, by, confidence, at}`); `touch` is a usage counter. ⇒ audit the BINDING, leave the rest."
--
-- ⭐ That judgement is now OVERTURNED, on evidence 048 did not have. Ote's ruling: **changing RESOLUTION *is*
-- changing semantic identity.** An alias does not merely help a lookup — it asserts
--
--     "any future observation phrased P is the SAME CONCEPT as slot S — permanently"
--
-- which is a STRONGER claim than any single memory row makes: a row says *this is true now*; an alias says
-- *this class of future statements belongs here*. Measured consequence, in this store: the phrase `schedule`
-- was taught onto the slot `work schedule` at containment 1.0000, and 37 minutes later that alias — not the
-- slot's own label, which scored only 0.5 and would have REFUSED — admitted `volunteer_schedule_and_location`.
-- ⇒ the inline `{phrase, by, confidence, at}` record 048 called "self-audited" names no actor, no occasion and
-- no cause, so neither of those two events could be attributed or reversed.
--
-- ⛔ WHAT IS **NOT** OVERTURNED: 048's *method* — audit where the guarantee differs — is upheld, and this is an
-- application of it, not a repudiation. ⛔ And the ruling is deliberately NARROW: `touch` moves with the alias
-- write (A-D7) **specifically because `last_write` participates in slot resolution ordering**, ⛔ NOT because
-- all bookkeeping is now semantic. Ote: *"Do not generalize this into reopening the entire 048 bookkeeping model."*
--
-- ══ ⭐⭐ WHY `touch` IS PART OF AN ALIAS RULING AT ALL ═══════════════════════════════════════════════════
-- `slotStore.list()` orders `last_write DESC NULLS LAST`; the resolver's comparison is a STRICT `>`. ⇒ the most
-- recently touched slot is FIRST in the candidate list and therefore **wins every tie**. Demonstrated: a write
-- the D1 Phase 3 gate REFUSED had already taught an alias and already refreshed `last_write` — i.e. a belief
-- that was never written had already moved a concept to the front of every future resolution.
-- ⇒ the governed order is: **resolve the memory operation → touch → teach.** A refused write does none of it.
--
-- ══ ⭐ WHY A SECOND RECORD, WHEN `mst_slots.aliases` ALREADY EXISTS (A-D3 = β) ═══════════════════════════
-- `mst_slots.aliases` stays exactly what it is: the RUNTIME LOOKUP INDEX the resolver reads. This table is the
-- HISTORY, and the reason is rollback accountability in Ote's words: *"Which aliases did this particular trial
-- create?"* — a question a mutable index cannot answer, because an alias that was removed leaves no trace in it.
-- ⇒ index and ledger, ⛔ not one doing both jobs.
--
-- ⓘ This is the FOURTH change log in the memory subsystem, and that is justified only because the SUBJECT
-- differs each time — a memory (`log_memory_changes`), a warrant (`log_memory_warrants`), a binding
-- (`log_slot_bindings`), and now an EQUIVALENCE.
--
-- ══ ⛔ AND AN ALIAS IS NOT A FIFTH AXIS ═════════════════════════════════════════════════════════════════
-- Ote: *"Do not add another cognition/provenance axis for this. An alias is semantic state with accountability;
-- it is not a fifth axis."* ⇒ it carries a WRITER, an OCCASION and a CAUSE. ⛔ No reach, no evidence refs, no
-- coincidence, no temporal basis. The four axes (049) are untouched by this migration.
--
-- ══ ⛔ NO BACKFILL (A-D6) ═══════════════════════════════════════════════════════════════════════════════
-- The 8 aliases already in `mst_slots.aliases` get NO rows here. Ote: *"Do not infer historical justification
-- that was never recorded … Treat them as audited unknown."* ⇒ an empty ledger beside a populated index is the
-- HONEST state, and it is the same ruling as the 8 unlinked reflection rows (D2/D4). ⛔ Do not "complete" it.

SET search_path = persona_sotera, public;

CREATE TABLE IF NOT EXISTS log_slot_aliases (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rolling_id            bigserial UNIQUE NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),

  -- ⚠️⚠️ NO FOREIGN KEY, AND THIS DIVERGES FROM `log_slot_bindings` DELIBERATELY.
  -- The first version wrote `REFERENCES mst_slots(id)` by analogy with 048, and a check's teardown caught it
  -- within the hour: the FK PINNED SLOTS ALIVE — *"update or delete on table mst_slots violates foreign key
  -- constraint log_slot_aliases_slot_id_fkey"*. Two ways to read that, and only one is right:
  --   ⛔ "make every teardown delete ledger rows first" — the ledger would then be coupled to every caller that
  --      has ever created a slot, and an APPEND-ONLY history that other code must delete from is not append-only.
  --   ⛔ "ON DELETE CASCADE" — WORSE. It would delete the audit of what a slot taught AT THE MOMENT someone
  --      removes the slot, which is precisely when that audit matters most.
  -- ⭐ THE LEDGER IS HISTORY, AND HISTORY MUST OUTLIVE ITS SUBJECT. A dangling `slot_id` here is not corruption;
  -- it is the correct record of an equivalence that was taught to a concept which no longer exists. That is also
  -- why `canonical_label` is snapshotted below — the row was already designed to read without the slot.
  -- ⓘ 048's FK is right for ITS subject: a binding points at live question ids and is meaningless without them.
  slot_id               uuid NOT NULL,
  -- ⭐ SNAPSHOTS, so the ledger stays readable without joining a MUTABLE row — or a DELETED one. `canonical_label`
  -- can change; what this operation was about cannot. Same reasoning as 048's before/after_question_KEY.
  canonical_label       text NOT NULL,
  phrase                text NOT NULL,

  -- ⭐ `promote` = an equivalence was TAUGHT. `refuse` = one was PROPOSED and DENIED.
  -- ⛔ Refusals are recorded, ⛔ not dropped: "how often did the cheap arm want to teach?" is the measurement
  -- that makes the teach-ban reviewable WITHOUT turning a classifier on. A silent refusal would leave the ban
  -- unfalsifiable — the same reason the extractor's `onSkip` counts a gated turn instead of going quiet.
  action                text NOT NULL CHECK (action IN ('promote', 'refuse')),

  -- ══ WHO, ON WHAT OCCASION, CAUSED BY WHAT ═════════════════════════════════════════════════════════════
  -- ⭐⭐ THE WRITER IS THE **RESOLVER**, ⛔ never the writer of the triggering row. The extractor said
  -- `schedule = Saturdays`; it never said `schedule ≡ work schedule`. Different claims ⇒ different actors.
  writer                text NOT NULL,
  -- ⚠️ NOT NULL WITH NO DEFAULT, for 048 §① 's reason: nullable → a forgetful writer writes NULL and the rule
  -- passes; NOT NULL + DEFAULT → the same, wearing a value. ⇒ omission must be IMPOSSIBLE, not defaulted.
  -- ⛔ There is no occasion-less resolver alias: the resolver always runs inside a write that has one.
  act_kind              text NOT NULL,
  act_id                text NOT NULL,
  -- ⭐ THE CAUSE, and the REVERSIBILITY HANDLE — the memory row whose successful resolution taught this.
  -- ⚠️ NULLABLE ONLY FOR `refuse`: a refusal can precede any row at all. A `promote` without one is rejected
  -- by the CHECK below rather than by a convention someone can forget.
  memory_id             uuid,

  -- ⭐ An alias may only ever record SAME. A `broader`/`narrower`/`sibling` verdict that taught an alias would
  -- BE the bug this whole decision exists to prevent, so the column refuses it rather than trusting a caller.
  relation              text NOT NULL CHECK (relation = 'same'),
  -- ⭐ DERIVED vs DECLARED, exactly as `log_slot_bindings` keeps `derived_act` beside `declared_intent`:
  -- the resolver DERIVES a verdict; recording it permanently is a SECOND assertion. `declared = false` marks
  -- an equivalence nobody explicitly stood behind — visible in the record, not merely refused at the seam.
  declared              boolean NOT NULL DEFAULT false,

  -- which arm produced the score, and what it was. ⓘ Descriptive; ⛔ nothing reads these to make a decision.
  by                    text,
  confidence            double precision,
  -- ⭐ Required. An unreasoned interpretation of somebody else's phrasing is anonymous in effect even with an
  -- actor recorded — 048's wording, and it applies identically here.
  reason                text NOT NULL,

  -- scope, mirroring mst_slots so the ledger can be read per persona/user without a join
  persona               varchar(64),
  user_id               uuid,

  -- ⭐⭐ A PROMOTION MUST NAME ITS CAUSE. A refusal need not — it may have no row at all.
  CONSTRAINT log_slot_aliases_promote_needs_cause
    CHECK (action <> 'promote' OR memory_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS log_slot_aliases_slot_idx ON log_slot_aliases (slot_id, rolling_id);
CREATE INDEX IF NOT EXISTS log_slot_aliases_act_idx ON log_slot_aliases (act_kind, act_id);
-- ⭐ THE ROLLBACK QUERY THIS TABLE EXISTS FOR: "which equivalences did this trial teach?"
CREATE INDEX IF NOT EXISTS log_slot_aliases_promoted_idx ON log_slot_aliases (created_at) WHERE action = 'promote';

COMMENT ON TABLE log_slot_aliases IS
  'Append-only ledger of resolver EQUIVALENCE operations (A3/A-D3β, 2026-09-16). mst_slots.aliases remains the '
  'runtime lookup index; this is the history that answers "which aliases did this trial create?". Supersedes the '
  'specific 048 §③ judgement that recordAlias "changes only RESOLUTION" and needed no audit. Refusals are '
  'recorded as well as promotions. No backfill: the 8 pre-existing aliases are an audited unknown (A-D6).';
