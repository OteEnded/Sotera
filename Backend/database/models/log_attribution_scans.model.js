export default (sequelize, DataTypes, schemas) => {
    // ⭐ D14 · THE DENOMINATOR of the attribution live-detection instrument (migration 050). One row per in-scope
    // assistant turn the hook SAW, whether or not the detector matched anything — so "0 violations" always has its
    // "of N scanned, E errors" beside it. ⛔ Never read into a prompt; not part of the memory store.
    return sequelize.define(
        "log_attribution_scans",
        {
            id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
            rolling_id: { type: DataTypes.BIGINT, autoIncrement: true, allowNull: false, unique: true },
            conversation_id: { type: DataTypes.UUID, allowNull: false },
            assistant_message_id: { type: DataTypes.UUID, allowNull: true },
            user_message_id: { type: DataTypes.UUID, allowNull: true },
            username: { type: DataTypes.TEXT, allowNull: false },
            detector_version: { type: DataTypes.TEXT, allowNull: false },
            observed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            scanned: { type: DataTypes.BOOLEAN, allowNull: false },
            error: { type: DataTypes.TEXT, allowNull: true },
            claims_found: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
            candidate_id: { type: DataTypes.UUID, allowNull: true },
        },
        {
            tableName: "log_attribution_scans",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            // ⛔ no `indexes` here: migration 050 owns them. A model-declared index is re-created by sync at boot under a
            // second name (observed 2026-09-15 — three duplicates, dropped). Migration is truth.
        },
    );
};
