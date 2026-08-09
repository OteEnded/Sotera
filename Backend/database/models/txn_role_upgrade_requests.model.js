export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "txn_role_upgrade_requests",
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
            // Requesting user (loose ref + snapshots so the row stays readable after
            // renames or account deletion).
            user_id: {
                type: DataTypes.UUID,
                allowNull: false,
            },
            username_snapshot: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },
            email_snapshot: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            // Role the user is asking for. Only "developer" today — developer access is
            // granted manually by an admin (Users page), never self-service.
            requested_role: {
                type: DataTypes.STRING(32),
                allowNull: false,
                validate: {
                    isIn: [choices.role_upgrade_role],
                },
            },
            // Optional free-text pitch from the requester ("what will you build?").
            note: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            // pending -> an admin grants (or declines) the role in the user's Edit
            // dialog and marks the request handled either way.
            status: {
                type: DataTypes.STRING(16),
                allowNull: false,
                defaultValue: "pending",
                validate: {
                    isIn: [choices.role_upgrade_status],
                },
            },
            handled_by: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },
            ip: {
                type: DataTypes.STRING(64),
                allowNull: true,
            },
        },
        {
            tableName: "txn_role_upgrade_requests",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.roleUpgradeRequest || {},
        },
    );
};
