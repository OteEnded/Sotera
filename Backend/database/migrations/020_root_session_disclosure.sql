-- 020 — A SECOND AUTHORITY: `root_session`. And this migration weakens a boundary on purpose.
--
-- ⚠️⚠️⚠️ READ THIS BEFORE ASSUMING IT IS A BUG. Migration 014 created `disclosure_authz` with EXACTLY ONE
-- value, and the reason was written into its own comment:
--
--     "The enum deliberately has no value for prose: authorization never travels through prose, and a
--      schema that cannot record a prose authorization cannot be talked into accepting one."
--
-- `disclosure-log-check` asserted the consequence — *"every row was authorized by a held-turn card, no
-- other authority has ever written one"* — and this morning (2026-08-21) `RFC §15A` recorded
-- **ROOT SESSION ≠ UNIVERSAL DISCLOSURE AUTHORITY** as a first-class invariant at Ote's explicit request:
-- *"Root gives the operator the ability to authorize a disclosure through the proper mechanism. It does
-- not itself cause another room's content to become visible."*
--
-- ── ⛔ THIS MIGRATION IS OTE OVERRULING THAT, AND HE DID IT WITH THE COST IN FRONT OF HIM ────────────
-- The Hermes run completed successfully at 03:33 — she asked, he authorized, she read, and it took
-- **THREE separate cards for one investigation** because the grant is single-use. His response:
--
--     *"have to allow her everytime is not natual, make her be ale to access automaticly"*
--
-- I put three options to him and named what C costs — that it deletes the invariant he ratified hours
-- earlier and empties the consent trail. He chose **A + C** knowing that. ⇒ It is his call and it is
-- recorded here rather than softened, so that whoever reads this next knows it was a DECISION and not a
-- drift. ⛔ Do not "restore" the old invariant without asking him.
--
-- ── ⭐ WHAT IS KEPT, BECAUSE HE ASKED FOR AUTOMATIC, NOT UNTRACEABLE ─────────────────────────────────
-- "Automatic" removes the CLICK. It does not have to remove the RECORD, and nothing he said asks for
-- that. So an automatic disclosure still writes a `log_disclosure_events` row — same room pair, same
-- scope, same item count — with `authorized_via = 'root_session'` instead of `'held_turn_card'`.
--   ⇒ the trail stays complete and answerable: *which reads were consented to, and which were automatic?*
--   ⇒ the two authorities remain DISTINGUISHABLE forever, so this decision is reversible and auditable
--     rather than a hole with no edges.
-- ⛔ AND THERE IS STILL NO VALUE FOR PROSE. `root_session` is a property of the AUTHENTICATED SESSION,
-- checked server-side by `isRootConnectedUser` — never a sentence anyone typed, never her own claim, and
-- never inferred from the shape of an id. A model saying *"he said yes"* still authorizes nothing.
--
-- ── ⚠️ AND `held_turn_card` IS NOT REPLACED ─────────────────────────────────────────────────────────
-- A non-root session still has NO path at all, and the card remains the only way anyone but root can
-- authorize anything. This adds an authority; it removes none.
--
-- ⚠️ `ALTER TYPE … ADD VALUE` cannot be USED in the transaction that adds it (Postgres), so this file
-- runs the ALTER outside a transaction block and asserts existence only. A row written with the new value
-- is proven by `disclosure-log-check` afterwards, not here.
--
-- Apply:  node test/maintenance/apply-migration.mjs 020_root_session_disclosure.sql

SET search_path = persona_sotera, public;

-- ⓘ IF NOT EXISTS so re-running is safe; the value is additive and existing rows are untouched.
ALTER TYPE disclosure_authz ADD VALUE IF NOT EXISTS 'root_session';

COMMENT ON COLUMN log_disclosure_events.authorized_via IS
 'HOW the disclosure was authorized. ''held_turn_card'' = a human answered the fixed permission card and the server re-read the stored answer (the only path available to a non-root session). ''root_session'' = it was granted automatically because the asking session is root, added by migration 020 on Ote''s explicit instruction after a completed Hermes run needed three separate cards for one investigation. ⛔ There is still NO value for prose: both authorities are facts the server establishes itself — a stored structured answer, or an authenticated root session — and neither can be produced by anything a model or a person says in a message. ⚠️ The two are deliberately distinguishable so "which reads were consented to and which were automatic" stays answerable.';

DO $$
DECLARE
    n_vals   INTEGER;
    has_root BOOLEAN;
    has_card BOOLEAN;
    has_prose BOOLEAN;
BEGIN
    SELECT count(*),
           bool_or(e.enumlabel = 'root_session'),
           bool_or(e.enumlabel = 'held_turn_card'),
           bool_or(e.enumlabel IN ('prose', 'stated', 'claimed', 'assumed', 'model'))
      INTO n_vals, has_root, has_card, has_prose
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'disclosure_authz';

    IF NOT has_root THEN
        RAISE EXCEPTION 'root_session was not added to disclosure_authz';
    END IF;
    -- ⭐ THE OLD AUTHORITY SURVIVES. This is an addition, not a replacement: a non-root session still has
    -- only the card, and removing it would leave everyone else with no path at all.
    IF NOT has_card THEN
        RAISE EXCEPTION 'held_turn_card is gone — 020 adds an authority, it does not replace one';
    END IF;
    -- ⛔⛔ AND STILL NOTHING FOR PROSE. The whole point of 014's one-value enum survives this migration:
    -- both legal values are facts the SERVER establishes, never something someone said.
    IF has_prose THEN
        RAISE EXCEPTION 'a prose-shaped authority value exists — authorization must never travel through prose';
    END IF;
    IF n_vals <> 2 THEN
        RAISE EXCEPTION 'disclosure_authz has % values — expected exactly held_turn_card and root_session', n_vals;
    END IF;

    RAISE NOTICE '020: disclosure_authz now has % values (held_turn_card, root_session) — an automatic root disclosure is still RECORDED, still per-room-pair, still bounded, and still has no prose path. ⚠ ROOT SESSION = DISCLOSURE AUTHORITY is now TRUE by Ote''s decision of 2026-08-21; RFC §15A is superseded and says so', n_vals;
END $$;
