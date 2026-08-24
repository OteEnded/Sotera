// Advice STORE — raw persistence for the SeekAdvice Feature (canon layering:
// Feature → Host Service → Store → DB). Owns ONLY the two advice tables: no transport, no lifecycle
// decisions, no provenance judgements. Returns PLAIN data so the Host Service above stays
// persistence-agnostic.
//
// ⭐ RAW SQL, not sequelize models — the `list_decisions` precedent. Two reasons: the tables are created
// by migration 022 (not by sync, which is off), and every projection below is spelled out FIELD BY FIELD
// so a column added later cannot start riding along into a caller that never asked for it. That is the
// failure family this repo has recorded thirteen times, and it leaks as readily as it drops.
//
// ⛔ NOTHING HERE TOUCHES `txn_conversations`. An exchange is not one of Sotera's conversations; the
// counterpart's session is not ours to mirror. See migration 022's header.

const EXCHANGE_FIELDS = `
  id, destination, remote_session_id, remote_work_id, mode, state,
  actor, identity_basis, authority, opened_by, opened_in_conversation,
  provenance_class, model_source, model_reported, workspace_reported,
  brief, depth, turn_count, opened_at, closed_at, close_reason, error`

const view = (r) => (r ? {
  id: r.id,
  destination: r.destination,
  remoteSessionId: r.remote_session_id ?? null,
  remoteWorkId: r.remote_work_id ?? null,
  mode: r.mode,
  state: r.state,
  actor: r.actor,
  identityBasis: r.identity_basis,
  authority: r.authority,
  openedBy: r.opened_by,
  openedInConversation: r.opened_in_conversation ?? null,
  provenanceClass: r.provenance_class,
  // ⭐ Kept as TWO fields on purpose. `modelSource: 'unavailable'` is a recorded fact about what the
  // interface exposed — never a missing value a reader may fill in from configuration.
  modelSource: r.model_source,
  modelReported: r.model_reported ?? null,
  workspaceReported: r.workspace_reported ?? null,
  brief: r.brief ?? null,
  depth: r.depth,
  turnCount: r.turn_count,
  openedAt: r.opened_at,
  closedAt: r.closed_at ?? null,
  closeReason: r.close_reason ?? null,
  error: r.error ?? null,
} : null)

const turnView = (r) => (r ? {
  id: r.id,
  ordinal: r.ordinal,
  direction: r.direction,
  content: r.content,
  attested: r.attested,
  latencyMs: r.latency_ms ?? null,
  createdAt: r.created_at,
} : null)

export function createAdviceStore(db) {
  const seq = db.txn_memories.sequelize                     // any model gives us the connection
  const { schema } = db.txn_memories.getTableName()
  const EX = `"${schema}"."txn_advice_exchanges"`
  const TU = `"${schema}"."txn_advice_turns"`
  const one = async (sql, replacements) => {
    const [rows] = await seq.query(sql, { replacements })
    return Array.isArray(rows) ? rows[0] : rows
  }

  return {
    /** Open an exchange. ⭐ Created BEFORE any answer exists — that is what makes `pending` real. */
    async open({
      destination, mode, authority, openedBy, openedInConversation = null,
      remoteSessionId = null, brief = null, depth = 0,
      provenanceClass = 'attested',
    }) {
      const row = await one(
        `INSERT INTO ${EX} (destination, mode, authority, opened_by, opened_in_conversation,
                            remote_session_id, brief, depth, provenance_class)
         VALUES (:destination, :mode, :authority, :openedBy, :openedInConversation,
                 :remoteSessionId, :brief, :depth, :provenanceClass)
         RETURNING ${EXCHANGE_FIELDS}`,
        { destination, mode, authority, openedBy, openedInConversation, remoteSessionId, brief, depth, provenanceClass },
      )
      return view(row)
    },

    /** Append a turn. The ordinal is derived here so two callers cannot disagree about it. */
    async addTurn(exchangeId, { direction, content, attested = false, latencyMs = null }) {
      const row = await one(
        `INSERT INTO ${TU} (exchange_id, ordinal, direction, content, attested, latency_ms)
         VALUES (:exchangeId,
                 (SELECT COALESCE(MAX(ordinal), 0) + 1 FROM ${TU} WHERE exchange_id = :exchangeId),
                 :direction, :content, :attested, :latencyMs)
         RETURNING id, ordinal, direction, content, attested, latency_ms, created_at`,
        { exchangeId, direction, content, attested, latencyMs },
      )
      await seq.query(`UPDATE ${EX} SET turn_count = turn_count + 1 WHERE id = :id`, { replacements: { id: exchangeId } })
      return turnView(row)
    },

    /**
     * Patch an exchange. ⭐ The allowed keys are listed explicitly: a caller cannot set `state` to
     * something the CHECK would reject without the database saying so, and cannot set a field this
     * store did not intend to expose.
     */
    async patch(id, patch) {
      const MAP = {
        state: 'state', remoteWorkId: 'remote_work_id', modelSource: 'model_source',
        modelReported: 'model_reported', workspaceReported: 'workspace_reported',
        provenanceClass: 'provenance_class', closeReason: 'close_reason', error: 'error',
      }
      const sets = []
      const repl = { id }
      for (const [k, col] of Object.entries(MAP)) {
        if (k in patch) { sets.push(`${col} = :${k}`); repl[k] = patch[k] }
      }
      if ('closedAt' in patch) { sets.push('closed_at = :closedAt'); repl.closedAt = patch.closedAt }
      if (!sets.length) return this.findById(id)
      const row = await one(`UPDATE ${EX} SET ${sets.join(', ')} WHERE id = :id RETURNING ${EXCHANGE_FIELDS}`, repl)
      return view(row)
    },

    /** ⭐ OWNER-SCOPED. The same boundary every memory read uses; an exchange belongs to one room. */
    async findById(id, openedBy = null) {
      const row = await one(
        `SELECT ${EXCHANGE_FIELDS} FROM ${EX} WHERE id = :id ${openedBy ? 'AND opened_by = :openedBy' : ''}`,
        { id, openedBy },
      )
      return view(row)
    },

    async turns(exchangeId) {
      const [rows] = await seq.query(
        `SELECT id, ordinal, direction, content, attested, latency_ms, created_at
           FROM ${TU} WHERE exchange_id = :exchangeId ORDER BY ordinal`,
        { replacements: { exchangeId } },
      )
      return (rows || []).map(turnView)
    },

    /** Her exchanges that have not finished — what "let me check back on that" reads. */
    async listUnfinished(openedBy, limit = 10) {
      const [rows] = await seq.query(
        `SELECT ${EXCHANGE_FIELDS} FROM ${EX}
          WHERE opened_by = :openedBy AND state IN ('pending','running','awaiting_input','cancelling')
          ORDER BY opened_at DESC LIMIT :limit`,
        { replacements: { openedBy, limit } },
      )
      return (rows || []).map(view)
    },
  }
}
