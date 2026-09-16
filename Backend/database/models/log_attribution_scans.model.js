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
            // ⭐⭐ B-D4 (052) · WHICH PROJECTION produced the episode block this row read. The detector parses that
            // block for `X said to me:` lines as its source set, so the projection is its INPUT — and B1/B2 changed
            // that input while the detector itself stayed frozen. ⛔ NULL on every pre-B row: an absent version is the
            // honest record, ⛔ never a backfilled one.
            // ⚠️ DECLARED HERE AS WELL AS IN THE MIGRATION. An ADD COLUMN has a SECOND HALF — a column the model does
            // not declare never surfaces through Sequelize, and this project has lost a column to exactly that.
            projection_version: { type: DataTypes.TEXT, allowNull: true },
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
