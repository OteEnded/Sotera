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
  kind: r.kind ?? 'message',
  outcome: r.outcome ?? null,
} : null)

/**
 * ⛔⛔ AN OBSERVATION CARRIES NO CONTENT, AND THE SHAPE IS THE GUARANTEE. Every field below is a state
 * name, an outcome, a timestamp or a number — there is deliberately no field a counterpart's words could
 * be placed in. ⭐ A privacy/authority property enforced by the TYPE cannot be eroded by a later edit.
 */
const obsView = (r) => (r ? {
  id: r.id,
  exchangeId: r.exchange_id,
  observedAt: r.observed_at,
  contactResult: r.contact_result,
  // ⓘ NULL unless contactResult === 'heard' — the schema refuses any other combination, so a state here
  // is always something we actually heard rather than something we assumed.
  heardState: r.heard_state ?? null,
  heardLastEvent: r.heard_last_event ?? null,
  askedHow: r.asked_how,
  latencyMs: r.latency_ms ?? null,
  note: r.note ?? null,
} : null)

export function createAdviceStore(db) {
  const seq = db.txn_memories.sequelize                     // any model gives us the connection
  const { schema } = db.txn_memories.getTableName()
  const EX = `"${schema}"."txn_advice_exchanges"`
  const TU = `"${schema}"."txn_advice_turns"`
  // ⭐ The observation log is its OWN table so `peek` can stay literally read-only — option (c).
  const OB = `"${schema}"."log_advice_observations"`
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
    async addTurn(exchangeId, { direction, content, attested = false, latencyMs = null,
      kind = 'message', outcome = null }) {
      const row = await one(
        `INSERT INTO ${TU} (exchange_id, ordinal, direction, content, attested, latency_ms, kind, outcome)
         VALUES (:exchangeId,
                 (SELECT COALESCE(MAX(ordinal), 0) + 1 FROM ${TU} WHERE exchange_id = :exchangeId),
                 :direction, :content, :attested, :latencyMs, :kind, :outcome)
         RETURNING id, ordinal, direction, content, attested, latency_ms, kind, outcome, created_at`,
        { exchangeId, direction, content, attested, latencyMs, kind, outcome },
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

    // ══ ⭐⭐⭐ THE OBSERVATION LOG · what we asked, what we heard, and WHEN ═════════════════
    //
    // ⭐ RATIFIED AS OPTION (c): a SEPARATE table, so `peek` stays LITERALLY read-only. ⓘ It costs a join.
    // That is the honest price of the word meaning what it says.
    // ⛔⛔ NOTHING HERE MAY CARRY CONTENT. Every field is a state name, an outcome, a timestamp or a
    // number — an observation that carried a counterpart's words would be a COLLECTION wearing another
    // name, and the whole point of the split is that **looking is not receiving**.
    async recordObservation(exchangeId, {
      contactResult, heardState = null, heardLastEvent = null, askedHow = 'probe',
      latencyMs = null, note = null,
    }) {
      const row = await one(
        `INSERT INTO ${OB} (exchange_id, contact_result, heard_state, heard_last_event, asked_how, latency_ms, note)
         VALUES (:exchangeId, :contactResult, :heardState, :heardLastEvent, :askedHow, :latencyMs, :note)
         RETURNING id, exchange_id, observed_at, contact_result, heard_state, heard_last_event, asked_how, latency_ms, note`,
        { exchangeId, contactResult, heardState, heardLastEvent, askedHow, latencyMs, note },
      )
      return obsView(row)
    },

    /**
     * ⭐ THE LATEST OBSERVATION — the single fact the world is derived from.
     * ⭐⭐ `heardStateEver` IS THE DISAMBIGUATING FACT, AND IT IS **OURS, NOT THEIRS**. A bare 404 is
     * meaningless: swept-after-TTL, restarted-and-forgot, and wrong-id-never-dispatched all return the
     * identical response. It only becomes information beside whether we EVER heard a state for this work
     * — which distinguishes *"a result we lost"* from *"there was never anything there"*.
     */
    async latestObservation(exchangeId) {
      const row = await one(
        `SELECT id, exchange_id, observed_at, contact_result, heard_state, heard_last_event, asked_how, latency_ms, note
           FROM ${OB} WHERE exchange_id = :exchangeId ORDER BY observed_at DESC, rolling_id DESC LIMIT 1`,
        { exchangeId },
      )
      if (!row) return null
      const ever = await one(
        `SELECT 1 AS x FROM ${OB} WHERE exchange_id = :exchangeId AND heard_state IS NOT NULL LIMIT 1`,
        { exchangeId },
      )
      return { ...obsView(row), heardStateEver: Boolean(ever) }
    },

    async observations(exchangeId, limit = 50) {
      const [rows] = await seq.query(
        `SELECT id, exchange_id, observed_at, contact_result, heard_state, heard_last_event, asked_how, latency_ms, note
           FROM ${OB} WHERE exchange_id = :exchangeId ORDER BY observed_at DESC, rolling_id DESC LIMIT :limit`,
        { replacements: { exchangeId, limit } },
      )
      return (rows || []).map(obsView)
    },

    /**
     * ⭐⭐⭐ ABANDON — THE ONE ENDING WITH NO COUNTERPART SIGNAL BEHIND IT, and it is **Sotera's**.
     * ⛔ NOT a timeout, ⛔ not inferred from silence, ⛔ not a policy that fires on its own. Every other
     * terminal state is something the destination TOLD us; this one is a judgement about someone else's
     * liveness. ⚠️ Hence the required `reason`: it must say what was OBSERVED, not merely that it was
     * decided — and the schema refuses the row without it.
     */
    async abandon(id, reason) {
      const row = await one(
        `UPDATE ${EX} SET state = 'abandoned', abandoned_at = now(), abandoned_reason = :reason,
                          closed_at = now(), close_reason = 'abandoned'
          WHERE id = :id RETURNING ${EXCHANGE_FIELDS}`,
        { id, reason },
      )
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
