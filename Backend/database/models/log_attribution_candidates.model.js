export default (sequelize, DataTypes, schemas) => {
    // ⭐⭐ D12 · THE FROZEN EVIDENCE of one detector match (migration 050). Written only when the advisory detector
    // matched; a human classifies it later (D13). The bulky copies — `surrounding`, `composed` — are pruned by the
    // lifecycle `attribution.evidenceRetentionDays` after confirmation; `spans` and `sources` stay. ⛔ Never read into a
    // prompt; not part of the memory store. A row is a CANDIDATE until `classification` is set by a person.
    return sequelize.define(
        "log_attribution_candidates",
        {
            id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
            rolling_id: { type: DataTypes.BIGINT, autoIncrement: true, allowNull: false, unique: true },
            conversation_id: { type: DataTypes.UUID, allowNull: false },
            assistant_message_id: { type: DataTypes.UUID, allowNull: false },
            user_message_id: { type: DataTypes.UUID, allowNull: true },
            username: { type: DataTypes.TEXT, allowNull: false },
            detector_version: { type: DataTypes.TEXT, allowNull: false },
            model: { type: DataTypes.TEXT, allowNull: true },
            settings: { type: DataTypes.JSONB, allowNull: true },
            spans: { type: DataTypes.JSONB, allowNull: false },
            surrounding: { type: DataTypes.JSONB, allowNull: true },
            composed: { type: DataTypes.JSONB, allowNull: true },
            sources: { type: DataTypes.JSONB, allowNull: false },
            toolset: { type: DataTypes.JSONB, allowNull: true },
            tool_calls: { type: DataTypes.JSONB, allowNull: true },
            principle_present: { type: DataTypes.BOOLEAN, allowNull: false },
            classification: {
                type: DataTypes.TEXT, allowNull: true,
                validate: { isIn: [["REQ_NOW", "REQ_THIS_CONV", "REQ_PRIOR_CONV", "TOPIC_ONLY", "OWN_INFERENCE", "NO_SOURCE"]] },
            },
            confirmed_by: { type: DataTypes.TEXT, allowNull: true },
            confirmed_at: { type: DataTypes.DATE, allowNull: true },
            notes: { type: DataTypes.TEXT, allowNull: true },
            evidence_pruned_at: { type: DataTypes.DATE, allowNull: true },
        },
        {
            tableName: "log_attribution_candidates",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            // ⛔ no `indexes` here: migration 050 owns them (see log_attribution_scans.model.js). Migration is truth.
        },
    );
};
