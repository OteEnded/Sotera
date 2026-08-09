// PLATFORM-CONFIGURATION audit writer.
//
// One entry point, `logConfigChange`, for every write that changes how the platform behaves for someone
// other than the caller: settings, providers, model blocks, API-key lifecycle, security resets.
//
// Two rules, both learned the hard way:
//
//  1. ⚠️ REDACT SECRETS BEFORE THE ROW IS BUILT. Providers carry API keys and settings can carry
//     credentials. An audit row is long-lived, admin-readable and lands in every backup, so a log that
//     faithfully records a BYOK key is worse than no log at all. We record THAT a secret changed and
//     never what it changed to.
//
//  2. NEVER LET LOGGING BREAK THE OPERATION. A failed audit insert must not fail the settings write that
//     triggered it — but it must not vanish either, or "no audit rows" reads as "nothing happened".
//     Failures are swallowed at the caller's boundary and reported to the server log instead.

/** Field names whose VALUE must never be written to the audit log, matched case-insensitively as a
 *  substring so `apiKey`, `api_key`, `openaiApiKey` and `keyEncryptionSecret` are all covered. */
const SECRET_HINTS = [
    'apikey', 'api_key', 'secret', 'password', 'passwd', 'token', 'credential',
    'privatekey', 'private_key', 'authorization', 'cookie', 'salt', 'hash',
]

const REDACTED = '[redacted]'
const MAX_DEPTH = 6
const MAX_STRING = 2000

const looksSecret = (key) => {
    const k = String(key || '').toLowerCase()
    return SECRET_HINTS.some((h) => k.includes(h))
}

/**
 * Deep-copy a value with secret-named fields replaced by "[redacted]".
 * Exported for its own tests — this is the function whose failure mode is a leaked credential.
 */
export function redact(value, depth = 0) {
    if (value == null) return value ?? null
    if (depth > MAX_DEPTH) return '[too deep]'
    if (Array.isArray(value)) return value.slice(0, 200).map((v) => redact(v, depth + 1))
    if (typeof value === 'object') {
        const out = {}
        for (const [k, v] of Object.entries(value)) {
            // A secret-named key is redacted whatever it holds — including when it holds an object,
            // because `{ apiKey: { value: '...' } }` would otherwise walk straight past the check.
            out[k] = looksSecret(k) ? REDACTED : redact(v, depth + 1)
        }
        return out
    }
    if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value
    if (typeof value === 'number' || typeof value === 'boolean') return value
    return String(value).slice(0, MAX_STRING) // Date, BigInt, anything exotic
}

/** 'root' | 'admin:<username>' | 'system' — resolved at write time so the label survives a rename. */
export function actorLabel(actor) {
    if (!actor) return 'system'
    if (actor.isRoot) return 'root'
    return `admin:${actor.username ?? 'unknown'}`
}

/**
 * Record one configuration change. Returns the created row, or null if it could not be written.
 *
 * @param {object} db models bag (needs db.log_config_changes)
 * @param {object} p
 * @param {string} p.area    'setting' | 'provider' | 'model_block' | 'api_key' | 'security' | 'retention' | 'skill'
 * @param {string} p.action  'set' | 'clear' | 'create' | 'update' | 'delete' | 'revoke' | 'renew' | 'restore' | 'reset' | 'run'
 * @param {string} [p.target] the setting key / provider name / model id / key id
 * @param {*} [p.before] previous state (null on create)
 * @param {*} [p.after]  new state (null on delete)
 * @param {object} [p.actor] request.user of whoever made the change
 * @param {string} [p.note]
 * @param {object} [p.log] fastify logger, for reporting a failed insert
 */
export async function logConfigChange(db, { area, action, target = null, before = null, after = null, actor = null, note = null, log = null } = {}) {
    if (!db?.log_config_changes) return null
    try {
        return await db.log_config_changes.create({
            area: String(area).slice(0, 32),
            action: String(action).slice(0, 32),
            target: target == null ? null : String(target).slice(0, 200),
            before: redact(before),
            after: redact(after),
            actor_user_id: actor?.id ?? null, // null = root (no users row)
            actor: actorLabel(actor),
            note: note == null ? null : String(note).slice(0, 500),
        })
    } catch (e) {
        // Reported, not swallowed silently: an audit trail that quietly stops recording is indistinguishable
        // from a platform where nothing is being changed.
        log?.warn?.(e, `[audit] failed to record ${area}/${action}${target ? ` on ${target}` : ''}`)
        return null
    }
}

/** Convenience for the common settings case: one row per KEY, so a multi-key PATCH is auditable per key. */
export async function logSettingChanges(db, { changes, actor, log, note } = {}) {
    const rows = []
    for (const { key, before, after, cleared } of changes || []) {
        rows.push(await logConfigChange(db, {
            area: 'setting',
            action: cleared ? 'clear' : 'set',
            target: key,
            before,
            after: cleared ? null : after,
            actor,
            note,
            log,
        }))
    }
    return rows.filter(Boolean)
}
