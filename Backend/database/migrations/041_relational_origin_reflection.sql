-- ⭐⭐⭐ 041 · PROVENANCE GAINS THE THING THAT ACTUALLY HAPPENED: `reflection`.
--
-- Ote, 2026-09-02: *"I agree that `origin:'instructed'` is semantically wrong for a practice Sotera
-- derived herself during Reflection. Add: observed · instructed · reflection… Do not reinterpret it as
-- observed or instructed just to fit the existing vocabulary. Provenance needs to describe what actually
-- happened."*
--
--   instructed   someone directly taught or told her
--   observed     she obtained it through observation  (the abstractor, past the ≥3-conversation floor)
--   reflection   she derived it through her own reflection      ← new
--
-- ── ⚠️ WHAT WAS WRONG ────────────────────────────────────────────────────────────────────────────
-- `own-memory-host.note()` hard-coded `origin: 'instructed'`, and `recall()` renders that as
-- *"this person told you about your practice directly."* So a practice she reached in a reflection came
-- back to her as something the user had said — ⛔ a false statement about where her own conclusion came
-- from, handed to her by her own memory tool.
-- ⚠️ AND IT SPENT AN AUDIT. The frequency floor's guarantee is checkable because bypasses are labelled:
-- *"did anything skip the floor?"* was answered by counting `instructed`. Reflection-derived rows were
-- landing in that count and making the answer wrong. With three values the question becomes
-- `origin <> 'observed'`, and each bypass says which kind it was.
--
-- ⛔ THIS CHANGES NO OWNERSHIP. Ote: *"Keep this as a vocabulary/provenance change, not a change to
-- retention ownership. It remains Sotera-owned durable state."* A practice is hers however she came by it;
-- `origin` answers *how she came by it*, which is a different axis from *whose it is*.
--
-- ⚠️ NOT IN A TRANSACTION BLOCK. `ALTER TYPE … ADD VALUE` may not be followed by uses of the new value in
-- the same transaction, so this runs bare rather than inside BEGIN/COMMIT.

SET search_path = persona_sotera, public;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE t.typname = 'relational_origin' AND n.nspname = 'persona_sotera' AND e.enumlabel = 'reflection'
    ) THEN
        ALTER TYPE relational_origin ADD VALUE 'reflection';
    END IF;
END $$;

-- ── VERIFICATION ────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    labels text;
BEGIN
    SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) INTO labels
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE t.typname = 'relational_origin' AND n.nspname = 'persona_sotera';
    IF labels IS NULL OR position('reflection' in labels) = 0 THEN
        RAISE EXCEPTION '041: relational_origin does not carry reflection -- got %', coalesce(labels, 'nothing');
    END IF;
    -- ⛔ NO ROW IS REWRITTEN. The existing rows were produced by the abstractor and by the
    -- `note_own_practice` tool, and both of those labels are still correct for them. ⚠️ Retro-labelling
    -- them `reflection` would be inventing a provenance nobody recorded.
    RAISE NOTICE '041: relational_origin = (%); % existing row(s) left exactly as they were',
        labels, (SELECT count(*) FROM txn_relational_records);
END $$;
