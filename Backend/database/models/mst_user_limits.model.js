export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "mst_user_limits",
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
            // one override row per user (loose ref — wiped with the user on hard delete)
            user_id: {
                type: DataTypes.UUID,
                allowNull: false,
                unique: true,
            },
            // null = platform default (limits.defaultDailyTokens); 0 = uncapped
            daily_tokens: {
                type: DataTypes.BIGINT,
                allowNull: true,
                validate: { min: 0 },
            },
            // null = platform default (limits.defaultMonthlyTokens); 0 = uncapped
            monthly_tokens: {
                type: DataTypes.BIGINT,
                allowNull: true,
                validate: { min: 0 },
            },
            // hard exemption — this user is never metered (overrides everything)
            unlimited: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            note: {
                type: DataTypes.STRING(300),
                allowNull: true,
            },
            // admin who last touched it; null = root
            updated_by: {
                type: DataTypes.UUID,
                allowNull: true,
            },
        },
        {
            tableName: "mst_user_limits",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.userLimit || {},
        },
    );
};
