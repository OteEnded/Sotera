export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "mst_user_roles",
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
                allowNull: false,
            },
            role_id: {
                type: DataTypes.UUID,
                allowNull: false,
            },
        },
        {
            tableName: "mst_user_roles",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.userRole || {},
            indexes: [{ unique: true, fields: ["user_id", "role_id"] }],
        },
    );
};
