// Mirrors migrations/001_core.sql — that file is the source of truth.
export default (sequelize, DataTypes, schemas) => {
  return sequelize.define('TxnConversations', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // NOT NULL, always. There is no null-owner shape in this schema to infer identity from.
    owner_user_id: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.TEXT },
    archived_at: { type: DataTypes.DATE },
  }, {
    tableName: 'txn_conversations',
    schema: schemas.project,
    timestamps: true,
    underscored: true,
  })
}
