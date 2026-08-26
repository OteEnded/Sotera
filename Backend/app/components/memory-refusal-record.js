// ⭐⭐ THE REFUSAL RECORDER — the host half of the ownership boundary (migration 032).
//
// The predicate lives in `memory-ownership-boundary.js` and knows nothing about a database. This file
// knows about the database and makes no judgements. One predicate, one place — the same split as
// `memory-self-state-claim.js` / the store, and `memory-ownership.js` / its callers.
//
// ── ⛔ WHY IT WRITES WITH RAW SQL AND NOT THROUGH A MODEL ─────────────────────────────────────────
// It is called from inside `store.create()`, on the path that is about to REFUSE a write. Going back
// through Sequelize's model layer for `txn_memories`' sibling table would put a second write on the same
// stack as a failing one; a plain INSERT on a table with no foreign keys cannot cascade into anything.
//
// ── ⭐ AND IT NEVER THROWS ───────────────────────────────────────────────────────────────────────
// A refusal that fails to record is still a refusal. ⛔ But it must not become a SUCCESS: the caller
// throws either way, and a recording failure is logged loudly rather than swallowed, because "we refused
// and could not say so" is exactly the silence this table exists to end.

/**
 * recordRefusal — persist one refused write. Never throws.
 *
 * @param {object} db          Sequelize models bag (needs `sequelize`)
 * @param {object} o
 * @param {object} o.refusal   the verdict from `admissibleToSlot`
 * @param {object} o.row       the proposed row
 * @param {string|null} o.userId
 * @param {string|null} o.persona
 * @param {string} o.author
 * @param {object|null} o.log
 * @returns {Promise<boolean>} whether it was recorded
 */
export async function recordRefusal(db, { refusal, row = {}, userId = null, persona = null, author = null, log = null } = {}) {
  if (!db?.sequelize || !refusal) return false
  const schema = db.txn_memories?.getTableName?.()?.schema ?? null
  const table = schema ? `"${schema}"."log_memory_refusals"` : '"log_memory_refusals"'
  try {
    await db.sequelize.query(
      `INSERT INTO ${table}
         (user_id, persona, refusal_class, why, belongs_to, destination_exists, destination_note,
          proposed_content, proposed_entity, proposed_attribute, proposed_value, retain_as,
          source, source_message_id, author, declared_axes)
       VALUES (:userId, :persona, :cls, :why, :belongsTo, :destExists, :destNote,
               :content, :entity, :attribute, :value, :retain,
               :source, :smid, :author, CAST(:axes AS jsonb))`,
      {
        replacements: {
          userId: userId ?? null,
          persona: persona ?? null,
          cls: refusal.class,
          why: refusal.why,
          belongsTo: refusal.belongsTo ?? null,
          // ⭐ PASSED THROUGH, NEVER DERIVED FROM `belongsTo` BEING NON-NULL. A relationship has a
          // destination NAME of null and `exists: false`; an intention has a real name and `exists: true`
          // with a note saying nothing routes to it. Inferring one from the other would collapse the two
          // facts this column was added to keep apart.
          destExists: refusal.destinationExists === true,
          destNote: refusal.destinationNote ?? null,
          // ⭐⭐ THE MATERIAL. A refusal is not a deletion.
          content: String(row.content ?? row.value ?? ''),
          entity: row.entity ?? null,
          attribute: row.attribute ?? null,
          value: row.value ?? null,
          retain: refusal.retain ? `${refusal.retain.as}${refusal.retain.note ? ` — ${refusal.retain.note}` : ''}` : null,
          source: row.source ?? null,
          smid: row.source_message_id ?? null,
          author: author ?? null,
          axes: JSON.stringify(refusal.declared ?? {}),
        },
      })
    return true
  } catch (e) {
    // ⛔ LOUD. "We refused and could not say so" is the silence this table exists to end, so it must not
    // be the quiet path. The caller still throws — a failed recording never turns a refusal into a write.
    log?.error?.({ err: e?.message, class: refusal.class },
      '[memory] REFUSED a write and FAILED TO RECORD the refusal — the material is still in txn_messages, but this refusal is not in the log')
    return false
  }
}

/**
 * ⭐ describeRefusal — the sentence a human (or she) reads. PURE.
 *
 * ⚠️ It says the destination's real status out loud. *"belongs in txn_intentions"* on its own reads as
 * *"it went there"*; *"belongs in txn_intentions, which exists and nothing routes to it yet"* is the
 * truth, and it is the sentence that makes the backlog legible.
 */
export function describeRefusal(refusal) {
  if (!refusal) return null
  const where = refusal.belongsTo
    ? `it belongs in ${refusal.belongsTo}${refusal.destinationExists ? '' : ' — which does not exist yet'}`
    : 'nothing owns this kind of material yet'
  const note = refusal.destinationNote ? ` (${refusal.destinationNote})` : ''
  const keep = refusal.retain ? ` Retained as ${refusal.retain.as}.` : ''
  return `refused: ${refusal.why}. ⇒ ${where}${note}.${keep}`
}
