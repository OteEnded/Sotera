// Mirrors migrations/001_core.sql — THAT FILE IS THE SOURCE OF TRUTH.
// Sequelize sync runs with alter:false, so it creates missing tables and never reshapes existing ones.
// That is deliberate: the constraints that matter (NOT NULL owner, the CHECKs, the partial indexes)
// exist only in the SQL, and sync must not be able to quietly drop them.
export default (sequelize, DataTypes, schemas) => {
  return sequelize.define('MstUsers', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    username: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    display_name: { type: DataTypes.STRING(128) },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'mst_users',
    schema: schemas.project,
    timestamps: true,
    underscored: true,
  })
}
