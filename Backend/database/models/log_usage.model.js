export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "log_usage",
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
            user_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            api_key_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            provider: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            model: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            endpoint: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            prompt_tokens: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            completion_tokens: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            // provider-reported cache-hit input tokens (prompt caching) — a subset of
            // prompt_tokens billed at a discount upstream; null = provider reported none
            cached_tokens: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            // captured request context + final response (JSON strings, truncated ~20KB each)
            request_body: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            response_body: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            // time-to-first-token (streaming turns; null for non-stream/unknown)
            ttft_ms: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            latency_ms: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
        },
        {
            tableName: "log_usage",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.usageLog || {},
        },
    );
};
