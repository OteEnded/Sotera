export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "log_trigger_job_runs",
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
            job_id: {
                type: DataTypes.UUID,
                allowNull: false,
            },
            started_at: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            status: {
                type: DataTypes.STRING(20), // choices.trigger_status
                allowNull: false,
                validate: { isIn: [choices.trigger_status] },
            },
            duration_ms: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            // one line of what the run produced: 'conversation <id>' / 'tool calculate ok' /
            // 'http 200' — enough for the history list without persisting payloads
            summary: {
                type: DataTypes.STRING(200),
                allowNull: true,
            },
            error: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
        },
        {
            // Run HISTORY (the job row keeps only last_*): capped per job at write time —
            // the executor prunes past RUN_HISTORY_KEEP, so this never grows unbounded.
            tableName: "log_trigger_job_runs",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            indexes: [{ fields: ["job_id"] }, { fields: ["started_at"] }],
        },
    );
};
