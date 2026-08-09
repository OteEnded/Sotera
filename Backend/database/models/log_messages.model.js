export default (sequelize, DataTypes, schemas, choices, hooks) => {
  return sequelize.define('log_messages', {
    uuid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
        comment: "Primary key of the table"
    },
    rolling_id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      allowNull: false,
      unique: true,
        comment: "Auto-incrementing unique identifier for each log message"
    },
    server_start_on: {
      type: DataTypes.DATE,
      allowNull: false,
        comment: "Timestamp when the server started"
    },
    report_on: {
      type: DataTypes.DATE,
      allowNull: false,
        comment: "Timestamp when the log message was generated"
    },
    report_by: {
      type: DataTypes.STRING,
      allowNull: false,
        comment: "Identifier of the source that generated the log message (module path)"
    },
    level: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "info",
      validate: {
        isIn: [choices.log_messages_level]
      },
      comment: "Log level (info, warning, error)"
    },
    messages: {
      type: DataTypes.TEXT,
      allowNull: false,
        comment: "The log message content"
    }
  }, {
    tableName: "log_messages",
    // Ote: I changed this to true because I want timestamps for all tables, including log_messages. This will help with debugging and tracking when log messages are created and updated.
    timestamps: true,
    // Map to snake_case columns to match every other model here (the DB is snake_case); needs the
    // created_at/updated_at columns (out-of-band ALTER — sync is alter:false so it won't add them).
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    schema: schemas.project,
    hooks: hooks?.logMessage || {}
  })
}