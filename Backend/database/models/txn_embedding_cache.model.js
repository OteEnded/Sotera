export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "txn_embedding_cache",
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
            // sha256 of "<effective endpoint>|<model>|<input text>" — embeddings are
            // deterministic, so an exact match can be answered without a provider call.
            // The endpoint is part of the key: the same model NAME behind a different
            // BYOK endpoint may produce different vectors.
            hash: {
                type: DataTypes.STRING(64),
                allowNull: false,
                unique: true,
            },
            provider: {
                type: DataTypes.STRING(120),
                allowNull: false,
            },
            model: {
                type: DataTypes.STRING(255),
                allowNull: false,
            },
            // the vector itself (float array) — JSONB; ~8–30KB per row depending on dims
            vector: {
                type: DataTypes.JSONB,
                allowNull: false,
            },
            // touched on every cache hit; rows idle past the retention window are pruned
            // by the daily usage-retention pass
            last_used_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
        },
        {
            tableName: "txn_embedding_cache",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            indexes: [{ fields: ["last_used_at"] }],
        },
    );
};
