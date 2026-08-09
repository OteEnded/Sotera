export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "mst_skills",
        {
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
                allowNull: false,
            },
            // Agent Skills identity (agentskills.io): the kebab-case name from SKILL.md
            // frontmatter (or the archive folder). Registry id becomes `skill.<slug>`.
            slug: {
                type: DataTypes.STRING(64),
                allowNull: false,
                unique: true,
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
            // SKILL.md markdown body — the skill's instructions (system-prompt material).
            prompt: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
            license: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            compatibility: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            // Free-form `metadata:` frontmatter nest (spec-allowed, author-defined).
            metadata: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // Raw allowed-tools entries as declared (e.g. ["WebSearch", "Bash(git *)"]).
            // NULL/absent = the skill declared none = unconstrained (all tools).
            allowed_tools: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // Non-core frontmatter keys (Claude Code extensions like model/effort) — kept
            // verbatim so exports stay faithful and future features can consume them.
            extensions: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // Portability notes collected at import (spec violations, unmapped tools, ...).
            warnings: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            enabled: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            // Who imported it (loose ref — skills survive user deletion).
            created_by: {
                type: DataTypes.UUID,
                allowNull: true,
            },
        },
        {
            tableName: "mst_skills",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.skill || {},
        },
    );
};
