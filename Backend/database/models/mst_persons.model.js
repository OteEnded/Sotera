import { DataTypes } from "sequelize";

// WHO a memory is about (migration 004).
//
// ACCOUNT ≠ PERSON. An account is how someone reaches the system — authentication, quota, whose rows
// these are. A person is the human (or persona) themselves. They coincide today only because every
// account so far has had exactly one occupant, and that is an accident of use, not a guarantee:
//
//   · `hermes_alias` was created 2026-08-18 23:00 by someone who already had an account. Two logins,
//     one person, and the store now holds two disconnected `preferred_name: Hermes` rows.
//   · `agent_dev`'s display name is "Claude" — one person's name sitting on a shared login, so anyone
//     opening it is greeted as someone else.
//
// A person may exist with NO account at all. That is the point rather than an edge case: when Ote
// mentions a colleague, that colleague is a person Sotera can hold beliefs about and will never meet.
//
// ⚠️ NEVER MERGE PERSONS BY INFERENCE. Two accounts become one person only when a human explicitly
// establishes it — never from matching names, emails, or writing style. This project has already been
// burned by deriving a person-attribute from a name; identity resolution is the same failure with more
// at stake, because the result is one person's private beliefs surfacing in another's conversation.
// ⚠️⚠️ THIS MODEL WAS BOUND TO THE WRONG SCHEMA FROM THE DAY IT SHIPPED (found 2026-08-20).
// It took only `(sequelize)` and never set `schema: schemas.project`, so it resolved through
// `search_path` to `public` — and `sequelize.sync()` obligingly CREATED an empty `public.mst_persons`,
// the only stray table in that schema. Migration 004 filled `persona_sotera.mst_persons` with 5 real
// people, and the ORM has been reading the empty one ever since:
//
//     db.mst_persons.findAll()                          → []
//     select * from persona_sotera.mst_persons          → 5 rows
//
// What that silently broke: `proposePerson`'s collision report. Its own comment promises *"EXISTING
// PEOPLE ARE REPORTED, NEVER REUSED"*, and it was querying a table that can never contain anybody —
// so `remember_person("Hermes")` returned `existing: []` with Hermes plainly on file. A guarantee about
// an empty table. `person-proposal-check` passed the whole time because it asserts the two-phase
// propose→ask→confirm GATE, not the collision report: a test that reads the way the code reads cannot
// find a bug in what the code reads.
//
// ⇒ The fix is one argument and one option. The lesson is the reason every other model in this
// directory takes `schemas` — an unqualified `define()` does not fail, it silently picks `public`.
export default (sequelize, DataTypes, schemas) =>
    sequelize.define(
        "mst_persons",
        {
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },
            // 'human' | 'persona'. The persona row is SOTERA HERSELF as a subject — the fix for
            // SELF_ENTITY being the literal string 'user', which made "I tend to over-explain" a
            // sentence the store could not hold. A persona row holds no account, by definition.
            kind: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: "human",
            },
            display_name: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            // How this person came to be known. Deliberately free text rather than an enum: the useful
            // answers ("migrated 1:1 from account ote", "mentioned in conversation 3f2a", "Ote linked
            // it") are not a vocabulary anyone can fix in advance.
            origin: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            // WHICH ACCOUNT recorded this person (migration 012). Loose ref, no association — a person
            // outlives the account that wrote them down, and it is the disclosure key for a person
            // record: "people I know about" has to include "people I myself recorded", or the scoped
            // collision report cannot see her own work and she creates duplicates.
            //
            // ⚠️ AND THE REASON THIS ENTRY EXISTS AT ALL IS A DEFECT I SHIPPED MINUTES EARLIER: the
            // column was added to the migration and to the `create()` call, but NOT here — so Sequelize
            // silently dropped the attribute and every new person landed with a null. Sixth instance in
            // one day of "an explicit field list quietly drops a field added later", and the first one
            // where the list was mine. `create()` does not warn; the row just comes back wrong.
            created_by_user_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
        },
        {
            tableName: "mst_persons",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            // ⭐ THE FIX. Without this the model reads `public.mst_persons` — see the header.
            schema: schemas.project,
        },
    );
