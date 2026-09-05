export default (sequelize, DataTypes, schemas) => {
    // ⭐⭐⭐ PROVENANCE REFERENCES (migration 049) — 0..n typed pointers to what a memory RESTS ON.
    //
    // `FINAL_SEMANTIC_REMEDIATION_ARCHITECTURE_V1.md` §7 · `SPEC_SOTERA_PROVENANCE_AXES_IMPLEMENTATION.md` §5.
    //
    // A reference points at a TURN (the only kind that can establish speaker and date), a MEMORY (support only), a
    // DOCUMENT (support + a document date), or a RECORD (support only). Speaker and date are ⛔ NOT columns: they are
    // resolved from the referenced turn at read time — "pointers, never a second copy" (memory-lineage.js).
    //
    // ⭐ ZERO rows for a memory = provenance NOT ESTABLISHED — the honest default of every pass-driven writer, and a
    // state that must be sayable while the row has an act and a reach (I3, I7).
    // ⭐ A FAILED citation is a row with `established: false` and `verification.how = 'failed'` — it stays (I10); the
    // memory item it belonged to was still written.
    // ⭐ `credential` (quoted · elicited · synthesized · observed) is a property OF the reference — a credential with no
    // reference has no referent (F10).
    return sequelize.define(
        "txn_memory_evidence",
        {
            id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
            rolling_id: { type: DataTypes.BIGINT, autoIncrement: true, allowNull: false, unique: true },
            memory_id: { type: DataTypes.UUID, allowNull: false },
            // ⭐ REFERENCE_KIND — deliberately not "basis" (memory-writer-contracts.js explains the two other BASIS vocabularies)
            ref_kind: { type: DataTypes.ENUM("turn", "memory", "document", "record"), allowNull: false },
            target: { type: DataTypes.TEXT, allowNull: false },
            span: { type: DataTypes.TEXT, allowNull: true },
            credential: { type: DataTypes.ENUM("quoted", "elicited", "synthesized", "observed"), allowNull: true },
            established: { type: DataTypes.BOOLEAN, allowNull: false },
            verification: { type: DataTypes.JSONB, allowNull: false },
            act_kind: { type: DataTypes.ENUM("turn", "revisit", "dreaming", "job", "operator", "ingest", "record", "request"), allowNull: true },
            act_id: { type: DataTypes.TEXT, allowNull: true },
        },
        {
            tableName: "txn_memory_evidence",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            schema: schemas.project,
            indexes: [
                { fields: ["memory_id"] },
                { fields: ["ref_kind", "target"] },
            ],
        },
    );
};
