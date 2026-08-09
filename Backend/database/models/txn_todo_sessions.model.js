export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "txn_todo_sessions",
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
            // The conversation this working-plan belongs to. Hard FK (ON DELETE CASCADE in
            // the migration) — deleting the conversation clears its todo. One ACTIVE session
            // per conversation is enforced in the service, not the schema (so archived
            // sessions can coexist later without a model change — Ote's framing).
            conversation_id: {
                type: DataTypes.UUID,
                allowNull: false,
            },
            // Owner (root = null, the platform convention) — for scoping + auditing.
            user_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            title: {
                type: DataTypes.STRING(120),
                allowNull: true,
            },
            // 'active' — the model's current working plan (at most one per conversation) ·
            // 'completed' — every task done · 'archived' / 'cancelled' — closed out.
            status: {
                type: DataTypes.STRING(16), // choices.todo_session_status
                allowNull: false,
                defaultValue: "active",
                validate: { isIn: [choices.todo_session_status] },
            },
        },
        {
            tableName: "txn_todo_sessions",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            indexes: [{ fields: ["conversation_id"] }, { fields: ["user_id"] }],
        },
    );
};
