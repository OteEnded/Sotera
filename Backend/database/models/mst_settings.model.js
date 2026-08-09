export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "mst_settings",
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
            // Namespaced setting key, e.g. "console.keyRevealSeconds", "usage.retentionDays".
            // A row OVERRIDES the config.json default of the same meaning (config = platform
            // defaults; DB = values changed at runtime from the console). Known keys live in
            // app/settings/index.js SETTING_DEFS — unknown keys are rejected there.
            key: {
                type: DataTypes.STRING(120),
                allowNull: false,
                unique: true,
            },
            // JSONB so numbers/strings/booleans/objects all round-trip without casting.
            value: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
        },
        {
            tableName: "mst_settings",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.setting || {},
        },
    );
};
