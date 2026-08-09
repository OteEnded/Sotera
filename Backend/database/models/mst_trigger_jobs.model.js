export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "mst_trigger_jobs",
        {
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
                allowNull: false,
            },
            rolling_id: {
                type: DataTypes.BIGINT,
                autoIncrement: true,
                unique: true,
                allowNull: false,
            },
            // Owner. null = the config root user (same convention as conversations). Fires
            // bill the OWNER's token limits and background-concurrency caps.
            user_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            name: {
                type: DataTypes.STRING(80),
                allowNull: false,
            },
            // TriggerSpec (SDK shape): { type:'interval', every } | { type:'cron', expr, tz } |
            // { type:'at', at }. Cron wall-clock means the trigger's own IANA tz; UTC internally.
            trigger: {
                type: DataTypes.JSONB,
                allowNull: false,
            },
            // Polymorphic action ENVELOPE ({ type, ... }) — v1 ships only 'skill-turn'
            // { type, skillId, prompt, model, conversationId|null }; new types are additive
            // executor registrations, never schema migrations.
            action: {
                type: DataTypes.JSONB,
                allowNull: false,
            },
            enabled: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            // a slot missed while the server was down fires ONCE on the next tick when true;
            // otherwise it rolls forward to the next future slot (per-schedule, Ote's default)
            catch_up: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            last_run_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            last_status: {
                type: DataTypes.STRING(20), // choices.trigger_status ('ok' | 'error'; null until first run)
                allowNull: true,
                validate: { isIn: [choices.trigger_status] },
            },
            last_error: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            // slow-job trends + diagnostics (Ote's RFC addition)
            last_duration_ms: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            // auto-disable rail: 3 consecutive failures switch the job off (no 3am crash loops);
            // re-enabling resets the counter
            consecutive_failures: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            // WHY the job is disabled (null while enabled) — 'manual' | 'consecutive-failures'
            // | 'boot-error' today; quota / permission / dependency-missing reserved for later
            // (Ote's RFC addition: you'll want to know why something stopped).
            disabled_reason: {
                type: DataTypes.STRING(40),
                allowNull: true,
            },
            // informational mirror of the runtime trigger's next fire (UTC) for lists/UIs
            next_run_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
        },
        {
            // "trigger_jobs", not "scheduled_jobs" (Ote's rename): future webhook /
            // calendar / filesystem trigger types aren't "scheduled" — they're triggered.
            tableName: "mst_trigger_jobs",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            indexes: [{ fields: ["user_id"] }, { fields: ["next_run_at"] }],
        },
    );
};
