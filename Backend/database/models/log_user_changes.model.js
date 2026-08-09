export default (sequelize, DataTypes, schemas, choices, hooks) => {
    // Audit log for user-identity changes (username / email / display_name). Drives the
    // 48h self-change cooldown on username (latest 'username' row = last change) and the
    // admin-only change-history view. Users never see this log; admin/root can.
    return sequelize.define(
        "log_user_changes",
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
            user_id: {
                type: DataTypes.UUID,
                allowNull: false,
            },
            // which identity field changed: 'username' | 'email' | 'display_name'
            field: {
                type: DataTypes.STRING, // choices.user_change_field
                allowNull: false,
                validate: {
                    isIn: [choices.user_change_field],
                },
            },
            old_value: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            new_value: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            // who made the change: the acting user's id (null = root, who has no DB row)
            changed_by_user_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            // human label for the actor: 'self' | 'admin:<username>' | 'root'
            changed_by: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: "self",
            },
        },
        {
            tableName: "log_user_changes",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.userChangeLog || {},
        },
    );
};
