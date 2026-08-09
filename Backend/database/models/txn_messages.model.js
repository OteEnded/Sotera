// Mirrors migrations/001_core.sql — that file is the source of truth.
export default (sequelize, DataTypes, schemas, choices) => {
  return sequelize.define('TxnMessages', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    conversation_id: { type: DataTypes.UUID, allowNull: false },
    owner_user_id: { type: DataTypes.UUID, allowNull: false },
    role: {
      type: DataTypes.STRING(16),
      allowNull: false,
      validate: { isIn: [choices.message_role] },
    },
    content: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    // Kept separate from content on purpose: reasoning is not the reply. Reading it back as the
    // answer is the audio equivalent of replaying drafts.
    reasoning: { type: DataTypes.TEXT },
    model: { type: DataTypes.STRING(128) },
    metrics: { type: DataTypes.JSONB },
  }, {
    tableName: 'txn_messages',
    schema: schemas.project,
    timestamps: true,
    underscored: true,
  })
}
