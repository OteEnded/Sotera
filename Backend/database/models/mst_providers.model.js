export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "mst_providers",
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
            // Provider id as used in model refs ("<name>/<model>"). Unique PER OWNER
            // (composite index below): a global row (owner NULL) OVERRIDES the config.json
            // default of the same name; a user's BYOK row overrides the global one for
            // that user only. Live DB uses UNIQUE NULLS NOT DISTINCT (PG15+) so global
            // names can't duplicate either.
            name: {
                type: DataTypes.STRING(40),
                allowNull: false,
            },
            // Adapter kind: ollama | openai-compatible | anthropic (must exist in adapters map;
            // keep choices.provider_kind in sync when a new adapter lands).
            kind: {
                type: DataTypes.STRING(32),
                allowNull: false,
                validate: {
                    isIn: [choices.provider_kind],
                },
            },
            // host (ollama) or baseURL (remote standards) — the registry maps it per kind.
            endpoint: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            // API key encrypted at rest (AES-256-GCM, app/auth/key-vault.js). NULL = no key.
            api_key_encrypted: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            enabled: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            // BYOK groundwork: NULL = platform-global provider (root-managed). A future
            // bring-your-own-key feature scopes rows to their owner instead.
            owner_user_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
        },
        {
            tableName: "mst_providers",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.provider || {},
            indexes: [
                { unique: true, fields: ["name", "owner_user_id"], name: "mst_providers_name_owner_unique" },
            ],
        },
    );
};
