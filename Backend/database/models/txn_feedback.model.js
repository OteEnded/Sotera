export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "txn_feedback",
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
            // who submitted (loose ref — NULL = root/anon; survives user deletion)
            user_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            // bug | idea | question | praise | other (choices.feedback_category)
            category: {
                type: DataTypes.STRING(24),
                allowNull: false,
                defaultValue: "other",
                validate: { isIn: [choices.feedback_category] },
            },
            message: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
            // where the user was when they sent it (route/hash + model) — triage context
            context: {
                type: DataTypes.STRING(300),
                allowNull: true,
            },
            // Optional screenshot(s) attached to the report: array of data URLs, converted
            // to WebP client-side (DB space). Null when none. Root/admin view them in triage.
            images: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // submitted | pending | resolved | cancelled | rejected (choices.feedback_status):
            // submitted = in the queue; pending = an admin/root TOOK the case; resolved =
            // closed (maybe rewarded); cancelled = withdrawn by the submitter (hidden from
            // their own list, still visible to admins); rejected = declined by the team.
            status: {
                type: DataTypes.STRING(12),
                allowNull: false,
                defaultValue: "submitted",
                validate: { isIn: [choices.feedback_status] },
            },
            // who took the case (status=pending) — shows the submitter it's being worked on
            taken_by: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            taken_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            // who resolved it / when (kept from the old handled flow — same semantics)
            handled_by: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            handled_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            // The team's reply to the submitter (one reply, replaceable — not a thread):
            // text + optional result screenshots (data URLs, WebP client-side, ≤3 like
            // submissions). The submitter sees these in Options → Feedback.
            reply: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            reply_images: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            replied_by: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            replied_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
        },
        {
            tableName: "txn_feedback",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            indexes: [{ fields: ["status"] }],
            hooks: hooks?.feedback || {},
        },
    );
};
