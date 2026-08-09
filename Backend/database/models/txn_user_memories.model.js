export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "txn_user_memories",
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
                allowNull: true, // null = root (config user, no DB row)
            },
            // A single fact/instruction the user wants remembered across chats.
            content: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
            is_enabled: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
        },
        {
            tableName: "txn_user_memories",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.userMemory || {},
        },
    );
};
