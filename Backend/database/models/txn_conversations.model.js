export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "txn_conversations",
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
                allowNull: true, // null = root (config user, no DB row)
            },
            title: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: "New chat",
            },
            // The "<provider>/<model>" id this conversation chats with.
            model: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            // Per-conversation generation settings (thinking toggle/effort + sampling).
            settings: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // Rolling summary of messages older than the recent window (F4: long-chat handling).
            summary: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            // The message ROLLING_ID up to which `summary` covers (uuids aren't orderable,
            // so the summary watermark tracks the integer rolling_id, not the uuid pk).
            summarized_upto_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            // Archive flag: NULL = active (shown by default), a timestamp = archived
            // (hidden from the main list; user can restore or delete it). Soft state —
            // messages are kept until an actual delete.
            archived_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            // Unsent composer text — folded from the client after a typing pause so a
            // draft survives logout/login and follows the user across devices. Cleared
            // when the message is actually sent. (localStorage stays the fast layer.)
            draft: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            // PROACTIVE content nobody has seen yet: set by the schedules executor when a
            // trigger-fired turn lands here; cleared when the owner opens the conversation.
            // The user's own typed turns never set it — they're seen by definition.
            unread: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            // WORKING MEMORY (L4 active session state, step 6) — the assistant's live per-conversation
            // working set: { focus, items[], updatedAt }. What it is actively holding in mind for THIS
            // chat (current goal, active entities, open threads) — distinct from durable recall and from
            // the rolling `summary` (compressed past). Model-maintained via a tool + a light per-turn
            // auto-seed; ephemeral (conversation-local, cleared when the chat goes cold — never crosses
            // conversations, never enters the durable memory stores). null = no working set yet.
            working_memory: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // INCOGNITO (off-the-record) — create-time STICKY privacy flag (never toggled after create;
            // absent from the settings PATCH schema on purpose). When true this conversation neither
            // WRITES to nor READS from the persistent cognitive stores: no memory capture, no recall,
            // no pinned-memory injection, and its messages are excluded from the Conversation Search
            // index + never returned as evidence to other chats. A clean room: nothing learned from it
            // persists, and it carries no cognitive baggage in.
            incognito: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
        },
        {
            tableName: "txn_conversations",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.conversation || {},
        },
    );
};
