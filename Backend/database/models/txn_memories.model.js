// Persona Memory v2 — the unified cognitive-memory substrate (RFC_PERSONA_MEMORY §4.1).
// One table, `kind`-tiered (episodic | semantic | identity). Replaces the ad-hoc split for v2;
// memory_kv / memory_facts / user_memories stay for v1 back-compat until migration retires them.
//
// Scoping (D1 hybrid): `identity` is persona-global (user_id null); `episodic`/`semantic` are
// per-(persona, user_id). owner semantics: user_id null = root/config user; persona null = default.
//
// Embedding is JSONB (a float array) so we ship WITHOUT pgvector — brute-force cosine at persona
// scale. When pgvector is installed this column swaps to `vector(N)` + an HNSW index with no API
// change (the ranking lives in memory-rank.js / the service, not in the table).
//
// HYBRID RETRIEVAL (Phase 2c): a generated `content_tsv tsvector` column + GIN index power the
// lexical arm fused with the dense arm via RRF (memory-v2-service.lexicalSearch). Sequelize sync
// (alter:false) does NOT add columns to an existing table and can't express a GENERATED column,
// so this is applied out-of-band (idempotent) — the service degrades to vector-only if it's absent:
//   ALTER TABLE "llmservices"."txn_memories"
//     ADD COLUMN IF NOT EXISTS content_tsv tsvector
//     GENERATED ALWAYS AS (to_tsvector('english', coalesce(content,''))) STORED;
//   CREATE INDEX IF NOT EXISTS txn_memories_content_tsv_gin ON "llmservices"."txn_memories" USING GIN (content_tsv);
// NOT declared as a model attribute on purpose — a GENERATED column must never be in INSERT/UPDATE.
//
// PGVECTOR (2026-07-22): the dense arm runs pgvector cosine over a GENERATED halfvec mirror of the
// JSONB `embedding`, so the write path + all in-JS vector ops (dedup/reconcile/clustering read the
// JSONB arrays) stay untouched. Needs the `vector` extension (Ote installed it 0.8.0).
//   ► CANONICAL-vs-DERIVED principle: the JSONB `embedding` is the ONE canonical representation of a
//     memory's vector. `embedding_hv` (and any future quantized/binary/other-engine format) is a
//     DERIVED, disposable implementation detail — generated from `embedding`, optimized for one
//     retrieval engine. Never write to it, migrate off it, or treat it as source-of-truth: it can be
//     dropped + regenerated at will. Read/write vectors as JSONB; specialized formats are read-only,
//     SQL-only accelerators. (This is why it's a GENERATED column, not a second stored copy.)
// Out-of-band:
//   CREATE EXTENSION IF NOT EXISTS vector;
//   ALTER TABLE "llmservices"."txn_memories" ADD COLUMN IF NOT EXISTS embedding_hv halfvec(2048)
//     GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(embedding)='array' AND jsonb_array_length(embedding)=2048
//                               THEN embedding::text::halfvec(2048) ELSE NULL END) STORED;
//     -- GUARDED: off-dim embeddings (or a future dims change) → NULL, never a failed INSERT.
//   CREATE INDEX IF NOT EXISTS txn_memories_embedding_hv_hnsw ON "llmservices"."txn_memories" USING hnsw (embedding_hv halfvec_cosine_ops);
// Also NOT a model attribute (generated). The service falls back to in-JS cosine if it's absent.
export default (sequelize, DataTypes, schemas, choices, hooks) => {
    return sequelize.define(
        "txn_memories",
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
            // --- scoping ---
            persona: {
                type: DataTypes.STRING,
                allowNull: true, // null = default/platform persona
            },
            user_id: {
                type: DataTypes.UUID,
                allowNull: true, // the person this memory is ABOUT / shared WITH; null = root
            },
            namespace: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: "default",
            },
            // --- content ---
            kind: {
                type: DataTypes.STRING, // choices.memory_kind
                validate: { isIn: [choices.memory_kind] },
                allowNull: false,
                defaultValue: "semantic", // episodic | semantic | identity
            },
            content: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
            embedding: {
                type: DataTypes.JSONB, // float array; pgvector-ready (swap to vector(N) later)
                allowNull: true,
            },
            embedding_model: {
                type: DataTypes.STRING, // which model produced `embedding` (guards against dim mismatch)
                allowNull: true,
            },
            // --- semantic-fact key (subject/attribute); null for episodic/identity prose ---
            entity: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            attribute: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            value: {
                // atomic-fact value (Phase 2b); (entity, attribute) is the reconcile key, `value`
                // is what UPDATE supersedes. null for episodic/identity prose (content holds it).
                type: DataTypes.TEXT,
                allowNull: true,
            },
            slot_id: {
                // Memory V3 (B2): the SLOT this fact occupies — the long-lived identity of the concept, so a
                // belief's continuity no longer depends on string matching. Null for episodic/identity prose
                // and for rows written before the Slot store existed (they attach on their next reconcile).
                // Added out-of-band (sync alter:false can't add columns) — see
                // test/maintenance/add-slots-store.mjs; the service tolerates its absence.
                type: DataTypes.UUID,
                allowNull: true,
            },
            slot_embedding: {
                // SEMANTIC reconcile (Phase 2c follow-on): embedding of the SLOT phrase
                // ("<entity> <attribute>", NOT the value) so a fact matches its slot by MEANING —
                // "fav coding language" collapses onto "favorite programming language" even when the
                // lexical attribute match can't. Set on fact writes only (null for episodic/identity).
                // JSONB (pgvector-ready), like `embedding`. Added out-of-band (sync can't add columns).
                type: DataTypes.JSONB,
                allowNull: true,
            },
            // --- ranking signals ---
            importance: {
                type: DataTypes.INTEGER, // 1..10 (LLM poignancy at write); null = unscored
                allowNull: true,
            },
            confidence: {
                // How much we TRUST this memory is true (0..1) — distinct from `importance`
                // (salience). Set at capture by the write mechanism (explicit atomic fact > general
                // remember), so recall/ranking can weight trust WITHOUT the model having to re-infer
                // it from provenance each time (see persona-memory-v2 memory test). Feeds future
                // ranking; not yet wired into the composite score. null = unscored (legacy rows).
                // Added out-of-band (sync alter:false can't add columns):
                //   ALTER TABLE "llmservices"."txn_memories" ADD COLUMN IF NOT EXISTS confidence real;
                type: DataTypes.FLOAT,
                allowNull: true,
            },
            // [R1] HOW THIS BELIEF CAME TO BE BELIEVED — quoted · elicited · synthesized · observed.
            // Added by database/migrations/003_provenance.sql (sync alter:false cannot add columns, and
            // this project's models are what CREATE the schema — the .sql files are deltas run by hand).
            //
            // ⚠️ NULL means "predates provenance", and it is the honest record of a period when we did
            // not ask. It does NOT mean quoted: normalizeProvenance() reads a missing value as
            // `synthesized`, the weakest class, because every route to "unknown" is a route to not
            // knowing. The measured failure this closes: a quote and a model-synthesized interpretation
            // were tagged IDENTICALLY (`source: model-tool`), so a memory saved from a pattern was
            // impersonating a quoted fact.
            provenance: {
                type: DataTypes.ENUM('quoted', 'elicited', 'synthesized', 'observed'),
                allowNull: true,
            },
            // [R5] When this claim was last checked AGAINST ITS OWN SOURCE TEXT. Null = never, which is
            // the truth for everything written before 2026-08-12 — and is why a confidence number on its
            // own was never enough to trust. "stayed in Bangkok" carried 0.85 from a message that says
            // the opposite.
            last_verified_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            // [R5] The row that disputes this one. A contradiction that cannot name its opponent is a
            // feeling; this makes it something you can follow.
            contradicted_by: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            // WHO this belief is ABOUT (migration 004). NOT ownership and NOT visibility — `user_id`
            // still answers both of those, unchanged.
            //
            // ⚠️ THE COLUMN EXISTED IN THE DATABASE FOR HALF A DAY WITHOUT THIS DECLARATION, AND EVERY
            // WRITE SILENTLY DROPPED IT. Sequelize ignores attributes it does not know, so the store's
            // `create({ ...row })` — which spreads and is NOT an allowlist — still lost the field. It
            // was invisible: no error, no warning, just NULL. Measured on live data: all 7 memories
            // Sotera wrote during the 2026-08-18 Hermes session have subject NULL, while the 5 rows the
            // migration backfilled have subjects. A column the ORM does not declare does not exist.
            //
            // NULL is legal and means "we do not know who this is about" — the same honest-null rule as
            // provenance above. It must never be inferred from prose.
            subject_person_id: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            // ⭐⭐ WHO AUTHORED this memory (migration 015). THE OWNERSHIP AXIS — Ote, 2026-08-20:
            // *"Ownership follows authorship."* `account` = the human said it (extraction);
            // `persona` = Sotera formed the understanding herself (episode / reflection / lesson /
            // practice / self).
            //
            // ⚠️ IT IS INDEPENDENT OF THE OTHER TWO COLUMNS, and conflating them is the defect this whole
            // axis exists to end:
            //   · `subject_person_id` = who it is ABOUT — an INDEX, never ownership and never a visibility
            //     grant. A memory SHE authored ABOUT Ote has author='persona', subject=Ote.
            //   · `user_id` = the room. For an account-authored row that is also its owner; for a
            //     persona-authored row it is the CONTEXT it was formed in, not its owner.
            //
            // ⚠️⚠️ AND THE COMMENT DIRECTLY ABOVE IS WHY THIS DECLARATION EXISTS AT ALL. `subject_person_id`
            // sat in the database for half a day undeclared here, and every write silently dropped it —
            // seven memories lost their subject with no error and no warning. **A column the ORM does not
            // declare does not exist.** This one was checked before the first write rather than after.
            //
            // The DB default is 'account', so a writer that forgets gets the status-quo value; ⛔ nothing
            // can become 'persona' by omission.
            author: {
                type: DataTypes.ENUM('account', 'persona'),
                allowNull: false,
                defaultValue: 'account',
            },
            access_count: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            last_access: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            pinned: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false, // pinned memories are never auto-forgotten
            },
            // --- bi-temporal validity + belief trajectory ---
            valid_at: {
                type: DataTypes.DATE, // when true in the world
                allowNull: true,
            },
            invalid_at: {
                type: DataTypes.DATE, // superseded/expired in the world (null = still valid)
                allowNull: true,
            },
            expired_at: {
                type: DataTypes.DATE, // when the SYSTEM stopped believing it (transaction time end)
                allowNull: true,
            },
            supersedes_id: {
                type: DataTypes.UUID, // self-reference: this row revises that one
                allowNull: true,
            },
            source: {
                type: DataTypes.STRING, // coarse origin TAG: conversation:<id> / consolidation / migrated:* / tool
                allowNull: true,
            },
            source_message_id: {
                // PROVENANCE (2026-07-22): the exact message this memory was saved from — chat/session
                // is derivable via messages' FK. Enables audit/debug + a back-reference tool so the
                // model can pull the original context a memory came from. Null for consolidation cards
                // / migrated rows / turns with no user message. Added out-of-band (sync can't add cols).
                type: DataTypes.UUID,
                allowNull: true,
            },
            tier: {
                type: DataTypes.STRING, // choices.memory_tier
                allowNull: false,
                defaultValue: "warm", // hot | warm | cold (decay lifecycle)
                validate: { isIn: [choices.memory_tier] },
            },
            evidence: {
                // EVIDENCE (Phase 3, cards): what a kind='card' was consolidated FROM — the member
                // memory ids + their source_message_ids + member count, and `supersedes` (the prior
                // card version this one evolved from). Makes a card's claims traceable to their
                // grounding (Evidence→Claim→Confidence) and lets a card EVOLVE (living knowledge)
                // while keeping history. Null for non-card memories. Added out-of-band (sync can't
                // add columns). Cards are CONSOLIDATION (summarize evidence), never reinterpretation
                // (that is the Reflection Feature's job) — see RFC / persona-memory-v2.
                type: DataTypes.JSONB,
                allowNull: true,
            },
        },
        {
            tableName: "txn_memories",
            timestamps: true,
            createdAt: "created_at", // when the system knew it (transaction time start)
            updatedAt: "updated_at",
            schema: schemas.project,
            hooks: hooks?.memories || {},
            indexes: [
                { fields: ["persona", "user_id", "namespace", "kind"] }, // primary scoping lookup
                { fields: ["entity", "attribute"] }, // semantic-fact reconciliation
                { fields: ["tier", "last_access"] }, // decay/consolidation batch job
                { fields: ["supersedes_id"] }, // belief-trajectory traversal
                { fields: ["source_message_id"] }, // provenance back-reference (memory → source message)
                { fields: ["slot_id"] }, // Memory V3: all facts occupying one slot (belief continuity)
            ],
        },
    );
};
