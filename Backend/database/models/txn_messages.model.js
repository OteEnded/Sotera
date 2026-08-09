export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "txn_messages",
        {
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
                allowNull: false,
            },
            // Autonumber — also the chronological ordering key (uuids aren't sortable).
            rolling_id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                allowNull: false,
                unique: true,
            },
            conversation_id: {
                type: DataTypes.UUID,
                allowNull: false,
            },
            role: {
                type: DataTypes.STRING, // choices.message_role
                allowNull: false,
                validate: {
                    isIn: [choices.message_role],
                },
            },
            content: {
                type: DataTypes.TEXT,
                allowNull: false,
                defaultValue: "",
                // NOTE: a generated `content_tsv tsvector` column (+ GIN index messages_content_tsv_gin)
                // mirrors this for CONVERSATION SEARCH (roadmap step 4) — lexical @@ over the user's own
                // past messages. Added out-of-band (Sequelize sync can't add generated cols); DB-managed,
                // read-only, SQL-only — NOT a model attribute. Conversation search is a SEPARATE evidence
                // subsystem (Backend/app/components/conversation-search.js), NOT part of memory.
            },
            reasoning: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            // Attached images (user turns, vision models): array of data URLs.
            images: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // Vision-relay cache: description per image (same order), written once.
            image_descriptions: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // Origin metadata per image (same order): [{ orig, name, bytes }] — the
            // composer converts every upload to WebP; this records what the user
            // actually attached. Null on pre-conversion-era rows.
            images_meta: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // Document attachments: [{ name, text (extracted, clipped), note }].
            files: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // Tool activity behind an assistant reply (the agent loop's trace, clipped):
            // [{ id, name, args, result }] — persisted so the 🔧 blocks survive reloads
            // (legacy kept a session toolTrace; this is the per-message equivalent).
            tool_calls: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // Ordered reply segments for interleaved rendering (legacy-style): the text
            // the model wrote each round WOVEN with the tool calls it made, in order:
            // [{type:'text',text} | {type:'tool',id,name,args,result}]. tool_calls stays
            // as the flat trace for consumers that just want the list.
            segments: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            provider: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            model: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            prompt_tokens: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            completion_tokens: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            // Response metrics: { latencyMs, ttftMs, tokensPerSec, promptTokens, completionTokens }
            metrics: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // Generation error for a failed turn: { code, message }. Persisted so the reason
            // an assistant reply is blank survives a reload (shown in the red bar + Stats).
            error: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // Skill trace: { id, name } when the reply ran "as" a Skill — the skill analog
            // of tool_calls, so "operating as X" survives reloads (like per-message model).
            skill: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
        },
        {
            tableName: "txn_messages",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.message || {},
        },
    );
};
