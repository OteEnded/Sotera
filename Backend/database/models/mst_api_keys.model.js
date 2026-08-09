export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "mst_api_keys",
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
            // Who created/owns this key (a console user); null = root (config superuser).
            owner_user_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            // SHA-256 hash of the raw key — what auth lookups use.
            key_hash: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
            },
            // Raw key encrypted at rest (AES-256-GCM, app/auth/key-vault.js) so the owner can
            // re-copy it after a credential re-check. NULL = not recoverable (system chat keys
            // on purpose; keys minted before this feature).
            key_encrypted: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            // Short, non-secret prefix for display/identification (e.g. "sk_sotera_").
            key_prefix: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            // 'standard' = user-minted key. 'chat' = system key auto-managed by the chat
            // site (1 active per user, auto-renews); read-only in the console.
            kind: {
                type: DataTypes.STRING(16),
                allowNull: false,
                defaultValue: "standard",
                validate: {
                    isIn: [choices.api_key_kind],
                },
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: "",
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: false,
                defaultValue: "",
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            expires_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            last_used_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
        },
        {
            tableName: "mst_api_keys",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            // SOFT DELETE: deleted keys stop authenticating (the hash lookup excludes
            // them) but stay recoverable; root explores/restores/hard-deletes on the
            // API Keys page's root-only Deleted tab.
            paranoid: true,
            deletedAt: "deleted_at",
            schema: schemas.project,
            hooks: hooks?.apiKey || {},
        },
    );
};
