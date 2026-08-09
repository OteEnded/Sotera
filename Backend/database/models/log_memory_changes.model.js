export default (sequelize, DataTypes, schemas, choices, hooks) => {
    // MEMORY-MUTATION audit trail — how a belief came to stop being believed.
    //
    // WHY THIS EXISTS (Ote, 2026-08-03): root's "user's role: root of Ote's LLM Services platform"
    // (importance 10, recalled 109 times) was silently displaced on 2026-07-31 by a junk fact scraped from
    // a pasted JSON, then went unreachable entirely when the junk was deleted two days later. NOTHING
    // recorded either event. It was only ever reconstructed by walking `supersedes_id` by hand, row by row.
    // Ote had already named this class of problem for platform settings — *"recheck for thing that should
    // have log, and make it log, so we can audit if need (like the ctx cal case)"* — and memory is the
    // same failure in a subsystem where the loss is worse, because a persona's beliefs are its continuity.
    //
    // ⚠️ WHY NOT log_config_changes: that table is PLATFORM configuration — low volume, admin-readable
    // across the whole install, and about changes that affect other people. Memory rows are PERSONAL
    // CONTENT belonging to one user and mutate on ordinary turns. Merging the two would both drown the
    // config log and expose one user's remembered facts on an install-wide admin surface. Same idea,
    // deliberately separate table, scoped by `user_id`.
    //
    // WHAT IS LOGGED, and what is not: only transitions that REMOVE or REPLACE a belief
    // (supersede · collapse · forget · archive · revive · delete). A plain ADD is not logged, because the
    // memory row IS its own record — it carries created_at, source and source_message_id, and reading it
    // back is the audit. What vanished in the incident was never a row; it was the TRANSITION between
    // rows. Logging every capture would multiply volume by turn count to record what is already on disk.
    return sequelize.define(
        "log_memory_changes",
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
            // Loose reference on purpose (no FK): the whole point is to survive the row it describes,
            // including a hard delete. A cascade here would erase the evidence with the evidence.
            memory_id: {
                type: DataTypes.UUID,
                allowNull: false,
            },
            // The OTHER row in a two-row transition: the superseder for a 'supersede', the row whose
            // deletion caused a 'revive', the survivor for a 'collapse'. Null for one-row events.
            related_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            // Scope, denormalized so an audit read never has to join a row that may no longer exist.
            // user_id null = root/config user, matching txn_memories' own convention.
            user_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            persona: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            slot_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            // supersede | collapse | forget | archive | revive | delete
            action: {
                type: DataTypes.STRING(32),
                allowNull: false,
            },
            // WHO did it, resolved at write time: 'model' | 'user' | 'root' | 'admin:<username>' |
            // 'system:decay' | 'system:consolidate' | 'system:reflect'. Stored, not joined, so the log
            // still reads correctly after an account is renamed or removed.
            actor: {
                type: DataTypes.STRING(120),
                allowNull: false,
                defaultValue: "system",
            },
            // WHY, in a form a human can act on — the missing half of the incident. For a supersede this
            // carries the resolver's own account of itself ("cosine 0.84 → slot 'role'"), which is what
            // turns "a fact disappeared" into "this threshold merged two concepts that are not the same".
            reason: {
                type: DataTypes.STRING(500),
                allowNull: true,
            },
            // Snapshots of the affected belief, before and after. Enough to READ what was lost without
            // resolving `memory_id` — because after a hard delete there is nothing left to resolve.
            // Memory content is the user's own words about themselves; it is never redacted here (unlike
            // config), but this table is user-scoped and must stay off any install-wide admin surface.
            before: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            after: {
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // Where the triggering turn happened, when there was one: 'conversation:<id>'.
            source: {
                type: DataTypes.STRING(200),
                allowNull: true,
            },
        },
        {
            tableName: "log_memory_changes",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            indexes: [
                { fields: ["memory_id"] },            // "everything that ever happened to this belief"
                { fields: ["user_id", "created_at"] }, // one user's memory history, newest first
                { fields: ["slot_id"] },              // the full trajectory of one concept
                { fields: ["created_at"] },           // time-ordered read + retention pruning
            ],
        },
    );
};
