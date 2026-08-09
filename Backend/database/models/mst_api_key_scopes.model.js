export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "mst_api_key_scopes",
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
            api_key_id: {
                type: DataTypes.UUID,
                allowNull: false,
            },
            scope: {
                type: DataTypes.STRING,
                allowNull: false,
            },
        },
        {
            tableName: "mst_api_key_scopes",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.apiKeyScope || {},
            indexes: [{ unique: true, fields: ["api_key_id", "scope"] }],
        },
    );
};
