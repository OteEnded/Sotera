export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "mst_users",
        {
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
                allowNull: false,
            },
            rolling_id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                allowNull: false,
                unique: true,
            },
            username: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
            },
            email: {
                type: DataTypes.STRING,
                allowNull: true,
                unique: true, // nullable-unique: Postgres treats NULLs as distinct, so many users may omit email
            },
            // Preferred/display name shown across the platform (and fed to the chat persona).
            // Nullable, NOT unique — it's a label, not an identity.
            display_name: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            password_hash: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            // Per-user chat preferences + last-used snapshot (JSONB, nullable = "use defaults").
            // Shape: { newChatModel:'default'|'last', newChatOptions:'last'|'default',
            //          lastModel:'<provider/model>'|null, lastSettings:<ChatSettings>|null }
            // Drives how a NEW chat seeds its model + ⚙ options, and lets a browser refresh
            // restore the user's last-used config. Managed via /v1/me/chat-prefs.
            chat_prefs: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // ADMIN-ONLY operational note about this account ("recheck for abuse", "asked for
            // a refund", …). Staff scratchpad, NOT profile data.
            //
            // ⚠️ THE ACCOUNT HOLDER MUST NEVER SEE THIS. Three rules keep that true:
            //   1. Only `manage_users` endpoints ever serialize it (admin.route.js).
            //   2. The session/API user objects are explicit ALLOWLISTS (auth/index.js
            //      loadSessionUser + auth.route.js sessionUserOf) — they name their fields
            //      rather than spreading the row, so a new column cannot leak into /v1/me
            //      by default. Keep it that way.
            //   3. It is never read by the persona/context layer, so it cannot reach a
            //      model's prompt — where it would be readable back out by the user.
            system_note: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
        },
        {
            tableName: "mst_users",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            // SOFT DELETE: destroy() stamps deleted_at and every default query excludes
            // the row (login, lookups, listings). Root explores/restores/hard-deletes
            // soft-deleted users on the Users page's root-only Deleted tab. NOTE: the
            // username/email stay reserved until hard-deleted (DB unique constraints).
            paranoid: true,
            deletedAt: "deleted_at",
            schema: schemas.project,
            hooks: hooks?.user || {},
        },
    );
};
