import { DataTypes } from "sequelize";
import logMessageModel from "./log_message.model.js";
import logRequestModel from "./log_request.model.js";
import mstUsersModel from "./mst_users.model.js";
import txnConversationsModel from "./txn_conversations.model.js";
import txnMessagesModel from "./txn_messages.model.js";

// ⚠️ SCHEMA NAMING CANON (inherited from OteLLMServices, deliberately, from row one).
// Every table carries a data-class prefix, and each table has exactly ONE name:
//   mst_  what EXISTS   — definitions, configuration, identity. Changes rarely, by an explicit act.
//   txn_  what HAPPENED — the record of events and content.
//   log_  what was OBSERVED — append-only diagnostics.
// The template's demo chain (template_items + its seed, model, route and page) was removed before the
// first table was created, so nothing unprefixed ever lands in `persona_sotera`.
export default function initModels(sequelize, schema) {
    const choices = {
        log_messages_level: ["info", "warning", "error"],
        message_role: ["user", "assistant", "system", "tool"],
    };

    // Sequelize lifecycle hooks, keyed by the hook name each model looks up.
    // Add one entry per model whose rows need logic on create/update/etc.
    // Docs: https://sequelize.org/docs/v6/other-topics/hooks/
    const hooks = {};

    const LogMessages = logMessageModel(sequelize, DataTypes, schema, choices, hooks);
    const LogRequests = logRequestModel(sequelize, DataTypes, schema, choices, hooks);
    const MstUsers = mstUsersModel(sequelize, DataTypes, schema, choices, hooks);
    const TxnConversations = txnConversationsModel(sequelize, DataTypes, schema, choices, hooks);
    const TxnMessages = txnMessagesModel(sequelize, DataTypes, schema, choices, hooks);

    TxnConversations.hasMany(TxnMessages, { foreignKey: 'conversation_id', as: 'messages' });
    TxnMessages.belongsTo(TxnConversations, { foreignKey: 'conversation_id', as: 'conversation' });

    return {
        models: {
            LogMessages,
            LogRequests,
            MstUsers,
            TxnConversations,
            TxnMessages,
        },
        choices,
    };
}
