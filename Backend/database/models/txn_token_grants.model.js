export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "txn_token_grants",
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
            // grantee (loose ref — grants are wiped with the user on hard delete)
            user_id: {
                type: DataTypes.UUID,
                allowNull: false,
            },
            // extra tokens per DAY while the grant is active (stacks with other grants)
            tokens_per_day: {
                type: DataTypes.BIGINT,
                allowNull: false,
                validate: { min: 1 },
            },
            // feedback reward tier (1 minor / 2 / 3 big) — null for manual grants
            tier: {
                type: DataTypes.INTEGER,
                allowNull: true,
                validate: { min: 1, max: 3 },
            },
            source: {
                type: DataTypes.STRING,
                allowNull: false,
                validate: { isIn: [choices.token_grant_source] },
            },
            // the resolved feedback this grant rewards (one grant per feedback, max)
            feedback_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            note: {
                type: DataTypes.STRING(300),
                allowNull: true,
            },
            // admin who granted it; null = root (root has no DB row)
            granted_by: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            starts_at: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            // one calendar month after starts_at (same day next month, clamped)
            expires_at: {
                type: DataTypes.DATE,
                allowNull: false,
            },
        },
        {
            tableName: "txn_token_grants",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.tokenGrant || {},
            indexes: [
                // one reward per feedback, enforced at the DB so concurrent resolves
                // can't double-grant (sync only creates this on FRESH tables — existing
                // deploys run test/maintenance/add-tokengrant-feedback-unique.mjs)
                {
                    name: "txn_token_grants_one_reward_per_feedback",
                    unique: true,
                    fields: ["feedback_id"],
                    where: { feedback_id: { [sequelize.Sequelize.Op.ne]: null } },
                },
            ],
        },
    );
};
