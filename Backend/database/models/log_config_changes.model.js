export default (sequelize, DataTypes, schemas, choices, hooks) => {
    // PLATFORM-CONFIGURATION audit trail — who changed what, from what to what, when.
    //
    // WHY THIS EXISTS (Ote, 2026-08-01): every model on the platform suddenly reported an 8k context
    // window mid-conversation. The cause was a single global setting (providers.ollamaNumCtxLimit) being
    // set to 8192 and later restored, and there was NO RECORD of either write — the only reason it was
    // ever explained is that Ote happened to be watching at the time. Ote: *"recheck for thing that
    // should have log, and make it log, so we can audit if need (like the ctx cal case)."*
    //
    // log_user_changes could not cover this: it is keyed on `user_id` ("whose identity changed"), so it
    // structurally cannot express "root changed a platform-wide setting that affects everyone".
    //
    // ⚠️ NEVER STORE SECRET VALUES HERE. Providers carry API keys, settings can carry credentials, and an
    // audit row is long-lived, admin-readable and backed up. The writer redacts known-secret fields to
    // the string "[redacted]" BEFORE the row is built (app/audit/config-log.js) — the point of the log is
    // to record THAT a secret changed, never what it changed to.
    return sequelize.define(
        "log_config_changes",
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
            // WHAT KIND of configuration moved. Deliberately coarse — the point is to be able to ask
            // "show me every settings change last week" without knowing the schema.
            area: {
                type: DataTypes.STRING(32),
                allowNull: false,
            },
            action: {
                type: DataTypes.STRING(32),
                allowNull: false,
            },
            // The specific thing: a setting key, a provider name, a "provider/model" id, a key id.
            target: {
                type: DataTypes.STRING(200),
                allowNull: true,
            },
            // Previous / new state, already redacted. JSONB rather than text so a diff stays queryable.
            // NULL `before` on a 'create' and NULL `after` on a 'delete' are meaningful, not missing.
            before: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            after: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // Loose reference on purpose (no FK): the audit row must outlive the actor's account, and a
            // logging insert must never fail or cascade because of who did it. NULL = root (has no row).
            actor_user_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            // Human label, resolved at write time: 'root' | 'admin:<username>' | 'system'. Stored rather
            // than joined so the log still reads correctly after the account is renamed or deleted.
            actor: {
                type: DataTypes.STRING(120),
                allowNull: false,
                defaultValue: "system",
            },
            // Free-text context — e.g. which check pinned a setting, or why a key was revoked.
            note: {
                type: DataTypes.STRING(500),
                allowNull: true,
            },
        },
        {
            tableName: "log_config_changes",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            indexes: [
                { fields: ["area", "target"] },   // "everything that touched providers.ollamaNumCtxLimit"
                { fields: ["created_at"] },       // the time-ordered audit read + retention pruning
                { fields: ["actor_user_id"] },    // "everything this admin changed"
            ],
        },
    );
};
