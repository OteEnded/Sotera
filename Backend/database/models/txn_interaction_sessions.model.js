export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "txn_interaction_sessions",
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
            // The conversation this interaction belongs to. Hard FK (CASCADE) — interactions
            // are conversation-scoped, never global (RFC), and die with their conversation.
            conversation_id: {
                type: DataTypes.UUID,
                allowNull: false,
            },
            // Owner (root = null, the platform convention) — only the owner may answer.
            user_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            // 'pending' — the turn is held waiting · 'answered' · 'skipped' (user declined) ·
            // 'timeout' (nobody answered in time) · 'cancelled' (turn died under it).
            status: {
                type: DataTypes.STRING(16), // choices.interaction_status
                allowNull: false,
                defaultValue: "pending",
                validate: { isIn: [choices.interaction_status] },
            },
            // The normalized question array ([{question, header, options, multiSelect,
            // allowCustom}]) — the protocol payload every renderer draws from.
            questions: {
                type: DataTypes.JSONB,
                allowNull: false,
            },
            // The human's response ({answers:[{selected, custom}]} | {freeText}) — null
            // until resolved. Kept for the transcript/audit; the model gets the TEXT form.
            response: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // When the pending hold gives up (chat.interactionTimeoutSeconds from creation) —
            // informational for renderers (countdown); the in-process timer is authoritative.
            expires_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
        },
        {
            tableName: "txn_interaction_sessions",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            indexes: [{ fields: ["conversation_id"] }, { fields: ["user_id"] }, { fields: ["status"] }],
        },
    );
};
