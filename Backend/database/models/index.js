import { DataTypes } from "sequelize";

// ONE NAME PER TABLE (Ote, 2026-08-01). The file, the `sequelize.define()` name, the physical
// `tableName`, and the accessor on `db` are all the same string — `mst_users` is `mst_users` is
// `mst_users`. Before this a single table answered to three unrelated names (user.model.js / "Users" /
// mst_users), which made every question about it start with a translation step.
//
// The class prefix is the schema's own taxonomy — mst_ = what exists, txn_ = what happened / is in
// flight, log_ = what was recorded — so the imports below also sort into those three groups on disk.
//
// There is NO name map anywhere in Backend, on purpose. The rename HISTORY (which old name each table
// had) lives with the tools that need it, at test/maintenance/table-renames.mjs — history is only ever
// wanted by something performing or checking a rename, never by the running app.
//
// The `define_` prefix on imports exists only because a factory and the model it produces cannot share
// an identifier in the same scope.

// --- mst_ : master / configuration / identity ---
import define_mst_users from "./mst_users.model.js";
import define_mst_persons from "./mst_persons.model.js";
import define_mst_roles from "./mst_roles.model.js";
import define_mst_user_roles from "./mst_user_roles.model.js";
import define_mst_api_keys from "./mst_api_keys.model.js";
import define_mst_api_key_scopes from "./mst_api_key_scopes.model.js";
import define_mst_providers from "./mst_providers.model.js";
import define_mst_settings from "./mst_settings.model.js";
import define_mst_model_capabilities from "./mst_model_capabilities.model.js";
import define_mst_model_blocks from "./mst_model_blocks.model.js";
import define_mst_user_limits from "./mst_user_limits.model.js";
import define_mst_skills from "./mst_skills.model.js";
import define_mst_skill_files from "./mst_skill_files.model.js";
import define_mst_slots from "./mst_slots.model.js";
import define_mst_trigger_jobs from "./mst_trigger_jobs.model.js";

// --- txn_ : operational records, owned by a user, mutable through a lifecycle ---
import define_txn_conversations from "./txn_conversations.model.js";
import define_txn_messages from "./txn_messages.model.js";
import define_txn_memories from "./txn_memories.model.js";
import define_txn_user_memories from "./txn_user_memories.model.js";
import define_txn_feedback from "./txn_feedback.model.js";
import define_txn_token_grants from "./txn_token_grants.model.js";
import define_txn_password_reset_requests from "./txn_password_reset_requests.model.js";
import define_txn_role_upgrade_requests from "./txn_role_upgrade_requests.model.js";
import define_txn_todo_sessions from "./txn_todo_sessions.model.js";
import define_txn_todo_tasks from "./txn_todo_tasks.model.js";
import define_txn_interaction_sessions from "./txn_interaction_sessions.model.js";
import define_txn_embedding_cache from "./txn_embedding_cache.model.js";

// --- log_ : append-only audit + telemetry, loose-referenced, prunable by retention ---
import define_log_messages from "./log_messages.model.js";
import define_log_requests from "./log_requests.model.js";
import define_log_usage from "./log_usage.model.js";
import define_log_key_reveals from "./log_key_reveals.model.js";
import define_log_user_changes from "./log_user_changes.model.js";
import define_log_trigger_job_runs from "./log_trigger_job_runs.model.js";
import define_log_config_changes from "./log_config_changes.model.js";
import define_log_memory_changes from "./log_memory_changes.model.js";

// NOTE: txn_message_embeddings has NO model — it is raw SQL only (app/components/conversation-search.js),
// so it cannot appear in this list even though it is a real table. table-names.test.mjs asserts that its
// one hand-written literal stays correct, because a wrong name there fails SOFT: the dense search arm
// just returns no evidence.

// Enum-ish column value sets — the single source of truth, enforced via validate.isIn in the models.
// Exported so out-of-band model construction (e.g. eval/verify harnesses that build a model factory
// directly) uses the SAME sets the app does, instead of re-hardcoding them.
// (These are CHOICE-SET names, not table names — deliberately left alone by the table rename.)
export const CHOICES = {
    log_messages_level: ["info", "warning", "error"],
    message_role: ["system", "user", "assistant"],
    api_key_kind: ["standard", "chat"],
    provider_kind: ["ollama", "openai-compatible", "anthropic"], // = adapters map keys
    model_capability: ["chat", "vision", "tools", "thinking", "embeddings", "reranker", "media-gen", "speech", "ocr", "audio", "code", "translation"],
    model_capability_status: ["confirmed", "failed"],
    model_capability_source: ["probe", "manual"],
    feedback_category: ["bug", "idea", "question", "praise", "other"],
    // submitted = queued · pending = an admin took the case · resolved = closed ·
    // cancelled = the SUBMITTER withdrew it (hidden from their list; admins still see it) ·
    // rejected = the team declined it (shown to the submitter with a thank-you)
    feedback_status: ["submitted", "pending", "resolved", "cancelled", "rejected"],
    token_grant_source: ["feedback", "manual"],
    // 'limits' rows audit token-limit changes (override set, boost granted/revoked, reward)
    // 'system_note' rows audit the admin-only account note (value previews are truncated)
    user_change_field: ["username", "email", "display_name", "roles", "account", "limits", "system_note"],
    key_reveal_outcome: ["revealed", "reauth_failed", "rate_limited", "not_recoverable", "system_key"],
    password_reset_status: ["pending", "handled"],
    role_upgrade_role: ["developer"],
    role_upgrade_status: ["pending", "handled"],
    // Persona Memory v2
    memory_kind: ["episodic", "semantic", "identity", "card", "note"],
    memory_tier: ["hot", "warm", "cold"],
    // Portable Component packages (Todo / HumanInteraction / Scheduler)
    todo_session_status: ["active", "completed", "archived", "cancelled"],
    todo_task_status: ["pending", "running", "completed", "skipped", "failed", "cancelled"],
    interaction_status: ["pending", "answered", "skipped", "timeout", "cancelled"],
    trigger_status: ["ok", "error"], // trigger_job.last_status + trigger_job_run.status
};

export default function initModels(sequelize, schema) {
    const choices = CHOICES;

    const hooks = {
        // normalization before validation — identifiers stay canonical no matter the caller
        provider: {
            beforeValidate: (p) => {
                if (typeof p.name === "string") p.name = p.name.trim().toLowerCase();
                if (typeof p.kind === "string") p.kind = p.kind.trim().toLowerCase();
            },
        },
        modelCapability: {
            beforeValidate: (r) => {
                if (typeof r.capability === "string") r.capability = r.capability.trim().toLowerCase();
                if (typeof r.status === "string") r.status = r.status.trim().toLowerCase();
                if (typeof r.source === "string") r.source = r.source.trim().toLowerCase();
            },
        },
        modelBlock: {
            beforeValidate: (r) => {
                if (typeof r.provider === "string") r.provider = r.provider.trim().toLowerCase();
                if (typeof r.model === "string") r.model = r.model.trim();
            },
        },
        feedback: {
            beforeValidate: (r) => {
                if (typeof r.category === "string") r.category = r.category.trim().toLowerCase();
                if (typeof r.status === "string") r.status = r.status.trim().toLowerCase();
            },
        },
        apiKey: {
            beforeValidate: (k) => {
                if (typeof k.name === "string") k.name = k.name.trim();
                if (typeof k.kind === "string") k.kind = k.kind.trim().toLowerCase();
            },
        },
        setting: {
            beforeValidate: (s) => {
                if (typeof s.key === "string") s.key = s.key.trim();
            },
        },
    };

    const def = (factory) => factory(sequelize, DataTypes, schema, choices, hooks);

    // ── mst_ : what exists ────────────────────────────────────────────────────────────────────────
    const mst_users = def(define_mst_users);
    // WHO a memory is about (004). Registered so the ORM stops silently dropping subject writes.
    const mst_persons = def(define_mst_persons);
    const mst_roles = def(define_mst_roles);
    const mst_user_roles = def(define_mst_user_roles);
    const mst_api_keys = def(define_mst_api_keys);
    const mst_api_key_scopes = def(define_mst_api_key_scopes);
    // Runtime-configured providers (config.json = defaults; these rows override/add).
    const mst_providers = def(define_mst_providers);
    // Runtime settings (config.json = defaults; these rows override — app/settings/index.js).
    const mst_settings = def(define_mst_settings);
    // Probed/declared per-model capabilities (vision/tools/thinking/... with test results).
    const mst_model_capabilities = def(define_mst_model_capabilities);
    // Root's model blocklist — a blocked provider/model is hidden from every model list
    // and refused by the chat runtime on ALL surfaces (chat site + OpenAI + Anthropic APIs).
    const mst_model_blocks = def(define_mst_model_blocks);
    // Per-user token-limit overrides (daily/monthly caps or the unlimited exemption).
    const mst_user_limits = def(define_mst_user_limits);
    // Agent Skills (imported .skill archives; files live in DB like chat uploads).
    const mst_skills = def(define_mst_skills);
    const mst_skill_files = def(define_mst_skill_files);
    // Memory V3: the SLOT store — long-lived identity of a conceptual property + learned aliases.
    const mst_slots = def(define_mst_slots);
    // Persisted triggers (cron/webhook definitions) -> the runtime TriggerService.
    const mst_trigger_jobs = def(define_mst_trigger_jobs);

    // ── txn_ : what happened / what is in flight ──────────────────────────────────────────────────
    const txn_conversations = def(define_txn_conversations);
    const txn_messages = def(define_txn_messages);
    const txn_memories = def(define_txn_memories);
    const txn_user_memories = def(define_txn_user_memories);
    // User-submitted feedback (via /v1/me/feedback) — admins triage in the Feedback console tab.
    const txn_feedback = def(define_txn_feedback);
    // Token-limit boosts (feedback rewards + manual grants) — +N tokens/day for one month, stacking.
    const txn_token_grants = def(define_txn_token_grants);
    // Forgot-password requests (manual flow: admin resets + contacts via email).
    const txn_password_reset_requests = def(define_txn_password_reset_requests);
    // Developer-access requests (self-service ask; admin grants the role manually).
    const txn_role_upgrade_requests = def(define_txn_role_upgrade_requests);
    // Todo (the state-driven Feature): a conversation's current working plan + its tasks.
    const txn_todo_sessions = def(define_txn_todo_sessions);
    const txn_todo_tasks = def(define_txn_todo_tasks);
    // HumanInteraction (the human-driven Feature): structured ask-the-user sessions.
    const txn_interaction_sessions = def(define_txn_interaction_sessions);
    // Platform embeddings cache (exact-match: endpoint+model+text hash -> vector).
    const txn_embedding_cache = def(define_txn_embedding_cache);

    // ── log_ : what was recorded ──────────────────────────────────────────────────────────────────
    const log_messages = def(define_log_messages);
    const log_requests = def(define_log_requests);
    const log_usage = def(define_log_usage);
    // Key-reveal audit trail (every re-copy attempt: who/when/which key/outcome).
    const log_key_reveals = def(define_log_key_reveals);
    // Identity audit trail (username / email / display_name changes).
    const log_user_changes = def(define_log_user_changes);
    const log_trigger_job_runs = def(define_log_trigger_job_runs);
    // Platform-configuration audit trail: settings / providers / model blocks / key lifecycle / security
    // actions. Exists because a global setting could be changed with no record at all (the ctx-limit case).
    const log_config_changes = def(define_log_config_changes);

    // Memory-mutation audit trail: how a belief stopped being believed (supersede / forget / archive /
    // revive / delete). Separate from log_config_changes because these rows are PERSONAL content at turn
    // volume, not install-wide configuration — see the model file for the incident that forced it.
    const log_memory_changes = def(define_log_memory_changes);

    // ── associations ──────────────────────────────────────────────────────────────────────────────
    // The `as:` aliases below are QUERY-level names used by every `include:` in the app. They are not
    // table names and were deliberately left untouched by the rename.

    // User <-> Role (many-to-many through mst_user_roles)
    mst_users.belongsToMany(mst_roles, { through: mst_user_roles, foreignKey: "user_id", otherKey: "role_id", as: "roles" });
    mst_roles.belongsToMany(mst_users, { through: mst_user_roles, foreignKey: "role_id", otherKey: "user_id", as: "users" });

    // User -> change log (identity audit trail; loose ref so logs survive user deletion)
    log_user_changes.belongsTo(mst_users, { foreignKey: "user_id", as: "user", constraints: false });

    // Config audit -> the admin who made the change (loose ref: the row must outlive the account, and a
    // logging insert must never fail or cascade because of who did it)
    log_config_changes.belongsTo(mst_users, { foreignKey: "actor_user_id", as: "actorUser", constraints: false });

    // User -> ApiKey (one-to-many, owner). API keys are first-class now (no Consumer layer).
    mst_users.hasMany(mst_api_keys, { foreignKey: "owner_user_id", as: "apiKeys" });
    mst_api_keys.belongsTo(mst_users, { foreignKey: "owner_user_id", as: "owner" });

    // Provider -> owner (loose; NULL = platform-global, future BYOK rows are user-scoped)
    mst_providers.belongsTo(mst_users, { foreignKey: "owner_user_id", as: "owner", constraints: false });

    // ApiKey -> scopes (one-to-many)
    mst_api_keys.hasMany(mst_api_key_scopes, { foreignKey: "api_key_id", as: "scopes" });
    mst_api_key_scopes.belongsTo(mst_api_keys, { foreignKey: "api_key_id", as: "apiKey" });

    // Usage log loose references (no FK constraints — keep logging resilient)
    log_usage.belongsTo(mst_users, { foreignKey: "user_id", as: "user", constraints: false });
    log_usage.belongsTo(mst_api_keys, { foreignKey: "api_key_id", as: "apiKey", constraints: false });

    // Token limits: loose refs so metering rows never block user operations
    txn_token_grants.belongsTo(mst_users, { foreignKey: "user_id", as: "user", constraints: false });
    mst_user_limits.belongsTo(mst_users, { foreignKey: "user_id", as: "user", constraints: false });

    // Conversation -> Message (one-to-many); Conversation -> owner (loose, root has no row)
    txn_conversations.hasMany(txn_messages, { foreignKey: "conversation_id", as: "messages" });
    txn_messages.belongsTo(txn_conversations, { foreignKey: "conversation_id", as: "conversation" });
    txn_conversations.belongsTo(mst_users, { foreignKey: "user_id", as: "owner", constraints: false });

    // Skill -> files (bundled files; hard FK so files never orphan)
    mst_skills.hasMany(mst_skill_files, { foreignKey: "skill_id", as: "files", onDelete: "CASCADE" });
    mst_skill_files.belongsTo(mst_skills, { foreignKey: "skill_id", as: "skill" });

    // TriggerJob -> owner (loose ref, root has no users row)
    mst_trigger_jobs.belongsTo(mst_users, { foreignKey: "user_id", as: "owner", constraints: false });

    // TriggerJob -> run history (hard FK so runs never orphan; deleting a job clears them)
    mst_trigger_jobs.hasMany(log_trigger_job_runs, { foreignKey: "job_id", as: "runs", onDelete: "CASCADE" });
    log_trigger_job_runs.belongsTo(mst_trigger_jobs, { foreignKey: "job_id", as: "job" });

    // Todo: Conversation -> session -> tasks (hard FK cascades so a deleted conversation
    // or a rewritten plan clears its rows; the conversation OWNS its todos).
    txn_conversations.hasMany(txn_todo_sessions, { foreignKey: "conversation_id", as: "todoSessions", onDelete: "CASCADE" });
    txn_todo_sessions.belongsTo(txn_conversations, { foreignKey: "conversation_id", as: "conversation" });
    txn_todo_sessions.hasMany(txn_todo_tasks, { foreignKey: "session_id", as: "tasks", onDelete: "CASCADE" });
    txn_todo_tasks.belongsTo(txn_todo_sessions, { foreignKey: "session_id", as: "session" });

    // HumanInteraction: interactions are conversation-scoped, never global (RFC) — hard FK
    // cascade so a deleted conversation clears its interaction history.
    txn_conversations.hasMany(txn_interaction_sessions, { foreignKey: "conversation_id", as: "interactions", onDelete: "CASCADE" });
    txn_interaction_sessions.belongsTo(txn_conversations, { foreignKey: "conversation_id", as: "conversation" });

    return {
        models: {
            mst_users,
            mst_persons,
            mst_roles,
            mst_user_roles,
            mst_api_keys,
            mst_api_key_scopes,
            mst_providers,
            mst_settings,
            mst_model_capabilities,
            mst_model_blocks,
            mst_user_limits,
            mst_skills,
            mst_skill_files,
            mst_slots,
            mst_trigger_jobs,
            txn_conversations,
            txn_messages,
            txn_memories,
            txn_user_memories,
            txn_feedback,
            txn_token_grants,
            txn_password_reset_requests,
            txn_role_upgrade_requests,
            txn_todo_sessions,
            txn_todo_tasks,
            txn_interaction_sessions,
            txn_embedding_cache,
            log_messages,
            log_requests,
            log_usage,
            log_key_reveals,
            log_user_changes,
            log_trigger_job_runs,
            log_config_changes,
            log_memory_changes,
        },
        choices,
    };
}
