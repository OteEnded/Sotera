import { DataTypes } from "sequelize";
import logMessageModel from "./log_message.model.js";
import logRequestModel from "./log_request.model.js";
import templateItemModel from "./template_item.model.js";

export default function initModels(sequelize, schema) {
    const choices = {
        log_messages_level: ["info", "warning", "error"],
        template_item_status: ["draft", "active", "archived"],
        template_item_priority: ["low", "medium", "high"],
    };

    // Sequelize lifecycle hooks, keyed by the hook name each model looks up
    // (e.g. template_item.model.js uses `hooks?.templateItem`). Add one entry
    // per model whose rows need logic on create/update/etc.
    const hooks = {
        // Example usage on the template item table:
        templateItem: {
            // beforeSave runs before every create AND update. Here it normalizes
            // the name (trims surrounding whitespace) and keeps summary a string.
            beforeSave(instance) {
                if (typeof instance.name === "string") {
                    instance.name = instance.name.trim();
                }
                if (instance.summary == null) {
                    instance.summary = "";
                }
            },
            // Other hooks you can add: beforeValidate, beforeCreate, afterCreate,
            // beforeUpdate, afterUpdate, afterFind, beforeDestroy, ...
            // Docs: https://sequelize.org/docs/v6/other-topics/hooks/
        },
    };

    const LogMessages = logMessageModel(sequelize, DataTypes, schema, choices, hooks);
    const LogRequests = logRequestModel(sequelize, DataTypes, schema, choices, hooks);
    const TemplateItems = templateItemModel(sequelize, DataTypes, schema, choices, hooks);

    return {
        models: {
            LogMessages,
            LogRequests,
            TemplateItems,
        },
        choices,
    };
}
