// MEMORY-MUTATION audit writer — the record of how a belief stopped being believed.
//
// Companion to app/audit/config-log.js, deliberately NOT the same table: config rows are install-wide and
// admin-readable, memory rows are one person's own remembered facts written at turn volume. See
// database/models/log_memory_changes.model.js for the incident that forced this to exist.
//
// Three rules:
//
//  1. NEVER LET LOGGING BREAK A MEMORY WRITE. Memory capture is already best-effort and off the hot path;
//     an audit insert failing must degrade to a server-log warning, never propagate. But it must not vanish
//     silently either — "no audit rows" has to mean "nothing happened", not "the logger is broken".
//
//  2. SNAPSHOT ENOUGH TO READ WITHOUT THE ROW. After a hard delete, `memory_id` resolves to nothing. The
//     `before` snapshot is the only surviving copy, so it carries the content and the belief's state —
//     not a pointer to them.
//
//  3. RECORD THE REASON, NOT JUST THE EVENT. "A fact was superseded" is what we already could have derived
//     from `supersedes_id`. "cosine 0.84 → slot 'role'" is what actually explains the loss and points at
//     the threshold responsible. A row without a reason is barely worth writing.

/** The fields worth keeping when the row itself may not survive. Small on purpose — this is evidence,
 *  not a backup: vectors and tsvectors are rebuildable and would dwarf the log. */
export function snapshot(row) {
    if (!row) return null
    return {
        content: row.content ?? null,
        kind: row.kind ?? null,
        entity: row.entity ?? null,
        attribute: row.attribute ?? null,
        value: row.value ?? null,
        importance: row.importance ?? null,
        confidence: row.confidence ?? null,
        tier: row.tier ?? null,
        pinned: row.pinned ?? null,
        access_count: row.access_count ?? null,
        invalid_at: row.invalid_at ?? null,
        expired_at: row.expired_at ?? null,
        supersedes_id: row.supersedes_id ?? null,
        source: row.source ?? null,
        source_message_id: row.source_message_id ?? null,
        created_at: row.created_at ?? null,
    }
}

/**
 * Who caused this mutation. The distinction that matters on read is MODEL vs PERSON vs BACKGROUND JOB:
 * "the nightly pass archived it" and "you asked me to forget it" are very different answers to
 * "where did my fact go?", and only the actor label separates them.
 */
export function memoryActorLabel(actor) {
    if (typeof actor === 'string' && actor) return actor.slice(0, 120) // pre-resolved: 'system:decay', 'model'
    if (!actor) return 'system'
    if (actor.isRoot) return 'root'
    if (actor.username) return `user:${actor.username}`
    return 'system'
}

/**
 * Record one memory mutation. Returns the created row, or null if it could not be written.
 *
 * @param {object} db models bag (needs db.log_memory_changes)
 * @param {object} p
 * @param {string} p.memoryId  the belief that changed
 * @param {string} p.action    'supersede' | 'collapse' | 'forget' | 'archive' | 'revive' | 'delete'
 * @param {string} [p.relatedId] the other row in the transition (superseder / trigger / survivor)
 * @param {string} [p.userId]   scope (null = root)
 * @param {string} [p.persona]
 * @param {string} [p.slotId]
 * @param {string|object} [p.actor] label, or a user object to resolve
 * @param {string} [p.reason]   WHY — carry the resolver's own account of itself where there is one
 * @param {object} [p.before]   snapshot() of the row before
 * @param {object} [p.after]    snapshot() of the row after
 * @param {string} [p.source]   'conversation:<id>'
 * @param {object} [p.log]      fastify logger, for reporting a failed insert
 */
export async function logMemoryChange(db, {
    memoryId, action, relatedId = null, userId = null, persona = null, slotId = null,
    actor = null, reason = null, before = null, after = null, source = null, log = null,
} = {}) {
    if (!db?.log_memory_changes || !memoryId || !action) return null
    try {
        return await db.log_memory_changes.create({
            memory_id: memoryId,
            related_id: relatedId,
            user_id: userId ?? null,
            persona: persona ?? null,
            slot_id: slotId ?? null,
            action: String(action).slice(0, 32),
            actor: memoryActorLabel(actor),
            reason: reason == null ? null : String(reason).slice(0, 500),
            before,
            after,
            source: source == null ? null : String(source).slice(0, 200),
        })
    } catch (e) {
        log?.warn?.(e, `[memory-audit] failed to record ${action} on ${memoryId}`)
        return null
    }
}

/** Batch helper for the multi-row transitions (collapse, decay archive) — one row per affected belief,
 *  so a later "what happened to THIS memory?" query finds it by memory_id rather than scanning arrays. */
export async function logMemoryChanges(db, entries = [], shared = {}) {
    const out = []
    for (const e of entries) out.push(await logMemoryChange(db, { ...shared, ...e }))
    return out.filter(Boolean)
}
