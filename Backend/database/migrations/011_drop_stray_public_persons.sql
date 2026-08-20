-- 011 — remove the empty `public.mst_persons` that sequelize.sync() created by accident.
--
-- ⚠️ THIS IS THE CLEANUP HALF OF A TWO-PART FIX. The other half is
-- `database/models/mst_persons.model.js`, which never set `schema: schemas.project` and therefore
-- resolved through `search_path` to `public`. Sync then created the table there. Migration 004 had
-- filled `persona_sotera.mst_persons` with 5 real people, so the ORM has been reading an empty
-- duplicate ever since:
--
--     db.mst_persons.findAll()                    → []          (public.mst_persons)
--     select * from persona_sotera.mst_persons    → 5 rows      (the real one)
--
-- What that silently broke: `proposePerson`'s collision report — a guarantee ("existing people are
-- reported, never reused") about a table that could never contain anybody.
--
-- ⛔ ORDER MATTERS. Apply this AFTER the model fix is deployed, never before: while the model still
-- points at `public`, dropping that table would make every `db.mst_persons` call throw instead of
-- quietly returning nothing — trading a silent wrong answer for a loud outage.
--
-- ⭐ IT REFUSES TO DESTROY DATA. If anything ever landed in the stray table, this migration raises
-- instead of dropping: a row there would mean something WROTE through the broken binding, and that row
-- is evidence to look at rather than rubbish to sweep. Ote's standing rule is that a migration proves
-- its own outcome; the corollary is that it must also prove its preconditions.
--
-- Apply:  node test/maintenance/apply-migration.mjs 011_drop_stray_public_persons.sql

BEGIN;

DO $$
DECLARE stray_rows BIGINT; real_rows BIGINT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'mst_persons') THEN
        RAISE NOTICE '011: public.mst_persons does not exist — nothing to do (already clean)';
        RETURN;
    END IF;

    SELECT count(*) INTO stray_rows FROM public.mst_persons;
    SELECT count(*) INTO real_rows  FROM persona_sotera.mst_persons;

    -- ⭐ Never drop a table that holds anything. A row here is a fact about a bug, not garbage.
    IF stray_rows > 0 THEN
        RAISE EXCEPTION 'public.mst_persons holds % row(s) — refusing to drop. Something wrote through the broken binding; inspect and migrate those rows into persona_sotera.mst_persons first', stray_rows;
    END IF;

    -- And never drop it while the real table is empty: that combination would mean the schemas are the
    -- other way round from what this migration believes, and dropping would destroy the only copy.
    IF real_rows = 0 THEN
        RAISE EXCEPTION 'persona_sotera.mst_persons is EMPTY while public.mst_persons exists — refusing to drop, because that is the opposite of the situation this migration is written for';
    END IF;

    DROP TABLE public.mst_persons;
    RAISE NOTICE '011: dropped empty public.mst_persons (persona_sotera.mst_persons keeps % row(s))', real_rows;
END $$;

-- ⭐ Prove the outcome: exactly one table named mst_persons, in the project schema.
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM information_schema.tables WHERE table_name = 'mst_persons';
    IF n <> 1 THEN
        RAISE EXCEPTION 'expected exactly one table named mst_persons, found %', n;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'persona_sotera' AND table_name = 'mst_persons') THEN
        RAISE EXCEPTION 'the surviving mst_persons is not in persona_sotera';
    END IF;
    RAISE NOTICE '011: exactly one mst_persons remains, and it is persona_sotera.mst_persons';
END $$;

COMMIT;
