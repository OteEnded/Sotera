export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "mst_model_capabilities",
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
            // vision | tools | thinking | chat | ... (choices.model_capability)
            capability: {
                type: DataTypes.STRING(24),
                allowNull: false,
                validate: {
                    isIn: [choices.model_capability],
                },
            },
            // confirmed = probe passed, failed = probe ran and did not pass
            status: {
                type: DataTypes.STRING(12),
                allowNull: false,
                validate: {
                    isIn: [choices.model_capability_status],
                },
            },
            // probe = automated test, manual = operator-set
            source: {
                type: DataTypes.STRING(12),
                allowNull: false,
                defaultValue: "probe",
                validate: {
                    isIn: [choices.model_capability_source],
                },
            },
            // reply snippet / error message from the probe (for the console)
            detail: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            tested_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
        },
        {
            tableName: "mst_model_capabilities",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            indexes: [{ unique: true, fields: ["provider", "model", "capability"] }],
            hooks: hooks?.modelCapability || {},
        },
    );
};
