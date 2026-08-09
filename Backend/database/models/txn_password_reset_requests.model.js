export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "txn_password_reset_requests",
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
            // What the requester typed on the login page (their email — step 1 of the flow).
            identifier: {
                type: DataTypes.STRING(255),
                allowNull: false,
            },
            // Username the requester CLAIMS (step 2, optional but recommended) — admins
            // compare it against the matched account's username as a verification signal.
            claimed_username: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },
            // Matched account (loose ref; NULL = no account matched — admins still see
            // the attempt). Username/email snapshotted so the row stays readable.
            user_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            username_snapshot: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },
            email_snapshot: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            // pending -> an admin resets the password manually (Users page) and contacts
            // the requester via the account email, then marks it handled.
            status: {
                type: DataTypes.STRING(16),
                allowNull: false,
                defaultValue: "pending",
                validate: {
                    isIn: [choices.password_reset_status],
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
            tableName: "txn_password_reset_requests",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.passwordResetRequest || {},
        },
    );
};
