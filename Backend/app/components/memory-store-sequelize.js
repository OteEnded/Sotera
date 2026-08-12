// SequelizeMemoryStore — THE HOST'S HALF of the memory seam (RFC_MEMORY_AS_COMPONENT step 1b).
//
// Implements the MemoryStore port over Sequelize + Postgres. ⚠️ THIS FILE STAYS IN THE HOST when the
// cognition leaves for `@ote/persona-memory` in step 2. It is the only place that knows this database
// exists — models, `Op`, raw SQL, pgvector, tsvector — and the component above it must never learn.
//
// ── THE ONE RULE THAT GENERATES EVERYTHING HERE ─────────────────────────────────────────────────
// **SCOPE IS THE STORE'S BUSINESS.** The component says what it wants ("the live facts I can see",
// "the nearest neighbours to this vector"); this file decides what "I" means. That is what lets the
// same component serve Pareto/OteLLMServices, which hosts many personas and scopes by a `persona`
// column, and Sotera, which is one persona per schema — Ote's requirement: *"it really the 'Portable
// component' that can work with many persona."*
//
// ⇒ The component NEVER passes `persona` or `user_id`. If you find yourself adding either to a method
//   signature here, the seam has sprung a leak.
//
// ── TWO SCOPES, BECAUSE THEY ARE TWO QUESTIONS ──────────────────────────────────────────────────
//   VISIBLE — this user's rows ∪ the persona-global identity rows. What recall may surface.
//   OWN     — only this user's rows. What reconcile, episode clustering and card matching may act on.
// Reconciling against a belief the user does not own would let one user's write displace a
// persona-wide fact, so the union is deliberately absent from `findOwnLive`.
//
// ── DEGRADATION IS A CONTRACT HERE, NOT A CONVENIENCE ───────────────────────────────────────────
// Ote, 2026-08-11: *"preserve the existing degradation behavior as an explicit tested contract."*
//   lexicalSearch   → `[]`   when the host has no tsvector column   (recall continues, dense-only)
//   denseRelevances → `null` when the host has no pgvector column   (recall falls back to JS cosine)
//   getSource       → the memory with NO `context` when conversations are unavailable — that is
//                     SUCCESS, not failure. A host may legitimately have memory and no chat history.
// ⚠️ `null` vs `[]` in the dense arm is load-bearing: null means "I cannot answer, fall back"; empty
// means "I answered, nothing matched". Collapse them and recall goes silently empty.
// Each capability latch flips ONCE and warns ONCE — a missing index must not log per query.
import { Op } from 'sequelize'

const LIVE = { invalid_at: null, expired_at: null }
const OWNED_KINDS = ['episodic', 'semantic', 'card'] // identity is persona-global, never "owned"

/**
 * @param {object}  deps
 * @param {object}  deps.db        Sequelize models bag — needs `txn_memories`; `txn_messages` /
 *                                 `txn_conversations` are OPTIONAL (see getSource).
 * @param {string|null} [deps.persona]  the persona scope, or null for a single-persona host
 * @param {string|null} [deps.userId]   whose memory this store is bound to
 * @param {object|null} [deps.log]
 * @param {()=>number}  [deps.now]
 */
export function createSequelizeMemoryStore({ db, persona = null, userId = null, log = null, now = () => Date.now() } = {}) {
  const txn_memories = db?.txn_memories
  if (!txn_memories) throw new TypeError('createSequelizeMemoryStore: db.txn_memories is required')
  const P = persona ?? null
  const U = userId ?? null

  // Capability latches. Set once, warned once — see the degradation contract above.
  let lexicalDisabled = false
  let denseDisabled = false

  /** VISIBLE: mine ∪ persona-global identity. `kind` narrows; identity is always user_id null. */
  const visibleWhere = (kind, namespace) => {
    const base = { ...LIVE, persona: P, ...(namespace ? { namespace } : {}) }
    if (kind) return { ...base, kind, user_id: kind === 'identity' ? null : U }
    return {
      ...base,
      [Op.and]: [{ [Op.or]: [{ user_id: U, kind: OWNED_KINDS }, { user_id: null, kind: 'identity' }] }],
    }
  }

  /** In scope to READ this row? Mine, or persona-global. Mirrors visibleWhere for single-row fetches. */
  const inScope = (row) => !!row && (row.user_id === U || row.user_id === null)

  return {
    // ── READS ────────────────────────────────────────────────────────────────────────────────
    async findVisible({ kind = null, namespace = null } = {}) {
      return txn_memories.findAll({ where: visibleWhere(kind, namespace), order: [['created_at', 'DESC']], raw: true })
    },

    async findOwnLive({ kind = null, namespace = null } = {}) {
      return txn_memories.findAll({
        where: { ...LIVE, persona: P, user_id: U, ...(kind ? { kind } : {}), ...(namespace ? { namespace } : {}) },
        order: [['created_at', 'DESC']], // newest-first: reconcile's matches[0] must be the most recent
        raw: true,
      })
    },

    async findById(id) {
      if (!id) return null
      const row = await txn_memories.findOne({ where: { id, persona: P, ...LIVE }, raw: true })
      return inScope(row) ? row : null // out of scope reads as ABSENT, never as a hit
    },

    async findAnyById(id) {
      if (!id) return null
      const row = await txn_memories.findOne({ where: { id, persona: P }, raw: true })
      return inScope(row) ? row : null
    },

    async findByIds(ids = []) {
      if (!ids?.length) return []
      return txn_memories.findAll({ where: { id: ids }, raw: true })
    },

    async findLiveInSlot({ slotId = null, entity = null, attribute = null } = {}) {
      // Prefer the slot's real identity; fall back to (entity, attribute) for rows written before the
      // Slot store existed. Rows, not a count: reviveSuperseded asks "is it empty?", restore must name
      // the holder. Callers pass an already-invalid row's keys, so no id-exclusion is needed.
      const key = slotId ? { slot_id: slotId } : { entity, attribute, user_id: U }
      return txn_memories.findAll({ where: { ...key, ...LIVE, persona: P }, raw: true })
    },

    async listArchived({ kind = null, namespace = null } = {}) {
      // The ONLY read that returns the dead. A SEPARATE query on purpose, never a flag on the live
      // reads — a boolean that can switch off the live filter is one bad default away from leaking a
      // forgotten belief into a live prompt.
      return txn_memories.findAll({
        where: {
          persona: P,
          [Op.or]: [{ invalid_at: { [Op.ne]: null } }, { expired_at: { [Op.ne]: null } }],
          ...(kind ? { kind } : {}),
          ...(namespace ? { namespace } : {}),
          [Op.and]: [{ [Op.or]: [{ user_id: U }, { user_id: null, kind: 'identity' }] }],
        },
        order: [['created_at', 'DESC']],
        raw: true,
      })
    },

    // ── SEARCH — raw SQL lives here and nowhere above ────────────────────────────────────────
    // Shared scope for both arms, mirroring visibleWhere. Mutates `repl` with bound values and returns
    // the clause list. IS NOT DISTINCT FROM = null-safe equality (persona/user are legitimately null).
    ...(() => {
      const { tableName, schema } = txn_memories.getTableName()
      const memTable = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`
      const scopeClause = (kind, namespace, repl) => {
        const where = ['persona IS NOT DISTINCT FROM :persona', 'invalid_at IS NULL', 'expired_at IS NULL']
        repl.persona = P
        if (namespace) { where.push('namespace = :ns'); repl.ns = namespace }
        if (kind) {
          where.push('kind = :kind AND user_id IS NOT DISTINCT FROM :su')
          repl.kind = kind; repl.su = kind === 'identity' ? null : U
        } else {
          where.push("((user_id IS NOT DISTINCT FROM :u AND kind IN ('episodic','semantic','card')) OR (user_id IS NULL AND kind = 'identity'))")
          repl.u = U
        }
        return where
      }
      return {
        async lexicalSearch({ query, kind = null, namespace = null, limit = 32 } = {}) {
          if (lexicalDisabled || !query || !String(query).trim()) return []
          const repl = { q: String(query), lim: Math.max(1, Math.min(limit, 200)) }
          const where = scopeClause(kind, namespace, repl)
          where.push("content_tsv @@ websearch_to_tsquery('english', :q)")
          const sql = `SELECT id FROM ${memTable} WHERE ${where.join(' AND ')} `
            + 'ORDER BY ts_rank(content_tsv, websearch_to_tsquery(\'english\', :q)) DESC LIMIT :lim'
          try {
            return (await txn_memories.sequelize.query(sql, { replacements: repl, type: 'SELECT' })).map((r) => r.id)
          } catch (e) {
            lexicalDisabled = true // latch: warn once, then stay quiet
            log?.warn?.({ err: e?.message }, '[memory.store] lexical arm disabled (tsvector column missing?) — vector-only recall')
            return [] // CONTRACT: [] = "no text index here", recall continues on the dense arm
          }
        },

        async denseRelevances({ qVec, kind = null, namespace = null, limit = 200 } = {}) {
          if (denseDisabled || !Array.isArray(qVec) || !qVec.length) return null
          const repl = { q: `[${qVec.join(',')}]`, lim: Math.max(1, Math.min(limit, 1000)) }
          const where = scopeClause(kind, namespace, repl)
          where.push('embedding_hv IS NOT NULL')
          const sql = `SELECT id, (1 - (embedding_hv <=> :q::halfvec(2048))) AS relevance FROM ${memTable} `
            + `WHERE ${where.join(' AND ')} ORDER BY embedding_hv <=> :q::halfvec(2048) LIMIT :lim`
          try {
            const rows = await txn_memories.sequelize.query(sql, { replacements: repl, type: 'SELECT' })
            return new Map(rows.map((r) => [r.id, Number(r.relevance) || 0]))
          } catch (e) {
            denseDisabled = true
            log?.warn?.({ err: e?.message }, '[memory.store] pgvector dense arm disabled (embedding_hv missing?) — JS cosine fallback')
            return null // ⚠️ CONTRACT: null ≠ empty Map. null = "cannot answer, fall back to JS cosine".
          }
        },
      }
    })(),

    async getSource({ id, context = 2 } = {}) {
      // PROVENANCE back-reference: the message a memory was saved from, plus neighbours.
      // ⚠️ The only method that reads outside the memory tables — kept here deliberately (Ote,
      // 2026-08-11) because it has one caller and already degrades, and extracting a SourceReader for
      // a host with memory but no conversations would be an abstraction for a hypothetical.
      if (!id) throw new Error('id is required')
      const m = await txn_memories.findOne({ where: { id, persona: P }, raw: true })
      if (!inScope(m)) return { found: false }
      const res = { found: true, memory: m, source: m.source ?? null, sourceMessageId: m.source_message_id ?? null }
      // CONTRACT: no source message, or a host without conversations → return the memory, no context.
      // This is SUCCESS. Callers render what they got; nothing here may throw for a missing capability.
      if (!m.source_message_id || !db.txn_messages) return res
      const msg = await db.txn_messages.findOne({ where: { id: m.source_message_id }, raw: true })
      if (!msg) { res.note = 'source message no longer exists (deleted)'; return res }
      res.conversationId = msg.conversation_id
      if (db.txn_conversations) {
        const conv = await db.txn_conversations.findOne({ where: { id: msg.conversation_id }, raw: true })
        res.conversationTitle = conv?.title ?? null
      }
      const all = await db.txn_messages.findAll({ where: { conversation_id: msg.conversation_id }, order: [['rolling_id', 'ASC']], raw: true })
      const idx = all.findIndex((n) => n.id === msg.id)
      const c = Math.max(0, Math.min(10, context))
      res.context = all.slice(Math.max(0, idx - c), idx + c + 1).map((n) => ({
        role: n.role, content: String(n.content || '').slice(0, 600), at: n.created_at, isSource: n.id === msg.id,
      }))
      return res
    },

    // ── WRITES ───────────────────────────────────────────────────────────────────────────────
    async create(row = {}) {
      // THE STORE STAMPS SCOPE — the component must not pass persona/user_id, and the
      // identity-is-persona-global rule is enforced here rather than trusted to every caller.
      const created = await txn_memories.create({
        ...row,
        persona: P,
        user_id: row.kind === 'identity' ? null : U,
      })
      return created.get ? created.get({ plain: true }) : created
    },

    async update(ids, patch = {}) {
      // BY ID ONLY, never by predicate — a predicate is the component composing a query again.
      const list = Array.isArray(ids) ? ids.filter(Boolean) : (ids ? [ids] : [])
      if (!list.length) return 0
      const [n] = await txn_memories.update(patch, { where: { id: list } })
      return n
    },

    async touch(ids) {
      // Recency bookkeeping, deliberately separate from `update`: this is telemetry, not a belief
      // change, and a failure here must never fail the read that triggered it.
      const list = Array.isArray(ids) ? ids.filter(Boolean) : (ids ? [ids] : [])
      if (!list.length) return
      try {
        await txn_memories.increment('access_count', { by: 1, where: { id: list } })
        await txn_memories.update({ last_access: new Date(now()) }, { where: { id: list } })
      } catch (e) {
        log?.debug?.({ err: e?.message }, '[memory.store] touch failed (non-fatal)')
      }
    },
  }
}
