export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "mst_model_blocks",
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
            provider: {
                type: DataTypes.STRING(40),
                allowNull: false,
            },
            model: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            // optional operator note ("why is this blocked")
            reason: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            // who blocked it (loose ref — NULL = root, survives user deletion)
            blocked_by: {
                type: DataTypes.UUID,
                allowNull: true,
            },
        },
        {
            tableName: "mst_model_blocks",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            indexes: [{ unique: true, fields: ["provider", "model"] }],
            hooks: hooks?.modelBlock || {},
        },
    );
};
