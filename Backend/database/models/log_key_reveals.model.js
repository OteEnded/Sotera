export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "log_key_reveals",
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
            // Loose ref (no FK constraint): audit rows must survive key deletion —
            // key_name/key_prefix are snapshots for exactly that case.
            api_key_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            key_name: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },
            key_prefix: {
                type: DataTypes.STRING(40),
                allowNull: true,
            },
            // Who attempted the reveal. NULL user id = the config root account;
            // username is snapshotted so renames/deletions don't blur the trail.
            actor_user_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            actor_username: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            // revealed | reauth_failed | rate_limited | not_recoverable | system_key
            outcome: {
                type: DataTypes.STRING(24),
                allowNull: false,
                validate: {
                    isIn: [choices.key_reveal_outcome],
                },
            },
            ip: {
                type: DataTypes.STRING(64),
                allowNull: true,
            },
        },
        {
            tableName: "log_key_reveals",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.keyRevealLog || {},
        },
    );
};
