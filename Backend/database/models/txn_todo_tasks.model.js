export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "txn_todo_tasks",
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
            // Parent session. Hard FK (ON DELETE CASCADE in the migration) — a rewritten or
            // deleted plan takes its tasks with it.
            session_id: {
                type: DataTypes.UUID,
                allowNull: false,
            },
            title: {
                type: DataTypes.STRING(200),
                allowNull: false,
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            // pending · running (Claude's "in_progress"; exactly ONE per session, enforced
            // in the service) · completed · skipped · failed · cancelled.
            status: {
                type: DataTypes.STRING(16), // choices.todo_task_status
                allowNull: false,
                defaultValue: "pending",
                validate: { isIn: [choices.todo_task_status] },
            },
            // explicit order within the session (the model owns ordering by the list it writes)
            ordinal: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            metadata: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // reserved for a future dependency graph (unused in v1 — the field exists so the
            // model can grow to nested/dependent tasks without a migration).
            depends_on: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
        },
        {
            tableName: "txn_todo_tasks",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            indexes: [{ fields: ["session_id"] }],
        },
    );
};
