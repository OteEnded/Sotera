export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "mst_skill_files",
        {
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
                allowNull: false,
            },
            skill_id: {
                type: DataTypes.UUID,
                allowNull: false,
            },
            // Path relative to the skill root, POSIX separators (references/x.md, assets/logo.svg).
            // SKILL.md itself is stored as a row too, so exports repack the ORIGINAL bytes.
            path: {
                type: DataTypes.STRING(512),
                allowNull: false,
            },
            is_binary: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            // Decompressed size in bytes (of the original file, not the stored encoding).
            size: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            // File content, DB-only like chat uploads (never written to disk, never executed):
            // UTF-8 text as-is; binary files base64-encoded (is_binary=true).
            content: {
                type: DataTypes.TEXT,
                allowNull: false,
                defaultValue: "",
            },
        },
        {
            tableName: "mst_skill_files",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            indexes: [{ unique: true, fields: ["skill_id", "path"] }],
        },
    );
};
