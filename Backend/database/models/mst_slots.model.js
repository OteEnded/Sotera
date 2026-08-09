// Persona Memory V3 — the SLOT store (RFC_MEMORY_SLOT_RESOLVER §3/§6, adoption step B2).
//
// A Slot is the LONG-LIVED IDENTITY of a conceptual property: "the account holder's preferred programming
// language" is ONE slot no matter how many ways it gets phrased. Facts reference it by `slot_id`, so a
// belief's continuity stops depending on string matching.
//
// WHY this table exists rather than a cache (Ote 2026-07-30): the gray-zone resolver's payoff is
// "System 2 → learned alias → future writes become System 1". That only works if aliases SURVIVE
// RESTARTS — an in-memory cache teaches the runtime, a Slot store teaches the PERSONA. Those are
// different things, and only the second is what we're building.
//
// SCOPE mirrors the fact rows: per (persona, user_id, entity, canonical_label). "user's favorite word" and
// "rex's favorite word" are genuinely different slots, so the canonical OWNER is part of slot identity.
//
// DOMAIN ONLY — deliberately NO vectors here (§8a). An embedding is a RESOLVER's private index (like a
// B-tree), not a property of the concept: the ontology resolver will need zero vectors and must not
// inherit a column it doesn't believe in. The cosine resolver keeps using its own index (today the
// memories.slot_embedding column) through its private adapter.
//
// `aliases` is learned METADATA ON the slot — the phrasings we have seen resolve to it — not the thing
// reconciled against. It is what a gray-zone verdict gets cached INTO, so an expensive decision is made
// once and is cheap forever after.
export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "mst_slots",
        {
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },
            // --- scope (mirrors memories: null persona = default, null user_id = root/config user) ---
            persona: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            user_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            entity: {
                // the CANONICAL owner (Owner Resolution's output — 'user' for the account holder)
                type: DataTypes.STRING,
                allowNull: false,
            },
            namespace: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: "default",
            },
            // --- identity ---
            canonical_label: {
                // the slot's preferred human phrasing ("favorite programming language")
                type: DataTypes.STRING,
                allowNull: false,
            },
            aliases: {
                // learned phrasings that resolve to this slot: [{ phrase, by, confidence, at }]
                // APPEND-only in practice; the resolver that learned it records `by` (cosine|llm|lexical).
                type: DataTypes.JSONB,
                allowNull: true,
            },
            evidence: {
                // free-form provenance for how this slot came to exist / how aliases were learned
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // --- usage (cheap signal for pruning + telemetry; NOT retrieval ranking) ---
            write_count: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            last_write: {
                type: DataTypes.DATE,
                allowNull: true,
            },
        },
        {
            tableName: "mst_slots",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.slots || {},
            indexes: [
                // the get-or-create lookup — one slot per (scope, owner, namespace, label)
                { unique: true, fields: ["persona", "user_id", "entity", "namespace", "canonical_label"], name: "mst_slots_scope_label_unique" },
                { fields: ["persona", "user_id"] }, // enumerate a persona/user's slots
            ],
        },
    );
};
