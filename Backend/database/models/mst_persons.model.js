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
export default (sequelize) =>
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
        },
        {
            tableName: "mst_persons",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
        },
    );
