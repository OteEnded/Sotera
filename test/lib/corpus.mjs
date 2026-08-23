// ⭐⭐⭐ THE CLEANUP CONTRACT FOR BEHAVIOURAL HARNESSES — remove what a measurement created, by exact id set.
//
// ── ⚠️⚠️ WHY THIS IS A SHARED MODULE AND NOT A HELPER INSIDE ONE SCRIPT ────────────────────────────
// `rate-harness.mjs` opens a fresh conversation per run — independence is what makes a rate mean anything —
// and for its whole life it never removed them. By 2026-08-23 the room it measures held **73 harness
// conversations against 38 organic ones**, all asking about the same person, and a MECHANISM CHECK FAILED:
//
//   memory-cognition-check §2b — "at least one retrieved episode is one she was IN with him" → 0 of 20
//
// Her real conversations *with* Hermes were outranked by two dozen conversations *about* him that the
// harness had written that morning. Deleting exactly those 73 restored it to **10 of 20**, with no change
// to retrieval, ranking, relevance, cognition or prompting.
//
// ⇒ ⭐ **A behavioural harness needs a cleanup contract from day one**, and it belongs next to the delete
// itself rather than in whichever script remembered to call it.
//
// ── ⛔ WHAT THIS MODULE REFUSES TO DO ──────────────────────────────────────────────────────────────
//   · it never selects rows by title, timestamp or count — only by an id set the caller can name
//   · it refuses the whole batch rather than skipping a row that fails a safety gate
//   · it asks the SCHEMA which tables reference a conversation instead of trusting this list, because
//     "an explicit list silently drops what it was not told about" has nine live instances in this project
//   · one transaction: a half-cleaned corpus is worse than a contaminated one, because it is a fixture
//     nobody could describe

// ⚠️ The third element is the column to RETURN for an audit record, and it is NOT `id` everywhere —
// `txn_message_embeddings` is keyed by `message_id` and has no `id` column at all, which is exactly how the
// first run of the cleanup failed. ⭐ It failed SAFE, because of the transaction below.
// ⚠️ `txn_message_embeddings` is the row that matters for the defect: it is the RETRIEVAL INDEX, so leaving
// it behind would delete the conversations and keep precisely the rows that outranked her real ones.
export const DEPENDENTS = [
  ['txn_message_embeddings', 'conversation_id', 'message_id'],
  ['txn_messages', 'conversation_id', 'id'],
  ['log_tool_calls', 'conversation_id', 'id'],
  ['log_reflections', 'conversation_id', 'id'],
  ['txn_interaction_sessions', 'conversation_id', 'id'],
  ['txn_todo_sessions', 'conversation_id', 'id'],
  ['log_disclosure_events', 'into_conversation_id', 'id'],
]

/**
 * ⛔ THE SAFETY GATES. Returns a list of violations; empty means the batch may proceed.
 *
 * ⚠️⚠️ ROOT IS HIS ACCOUNT, and the id and the name are checked SEPARATELY on purpose: `auth.route.js` can
 * authenticate a non-root session onto root's row, so neither one implies the other. The same mistake in
 * the other direction — a room named for him that is not his row — is just as possible.
 *
 * @param {Array<{id:string,title:string,username:string,uid:string}>} rows
 * @param {{rootUserId?:string|null, rootName?:string, titlePrefix?:RegExp, ownerPrefix?:RegExp}} o
 */
export function safetyViolations(rows, {
  rootUserId = null, rootName = 'ote', titlePrefix = /^RATE /, ownerPrefix = /^agent_dev/,
} = {}) {
  const bad = []
  for (const r of rows) {
    if (rootUserId && r.uid === rootUserId) bad.push(`${r.id} belongs to ROOT's row`)
    if (r.username === rootName) bad.push(`${r.id} belongs to "${rootName}"`)
    if (!ownerPrefix.test(r.username ?? '')) bad.push(`${r.id} owner "${r.username}" is not a test account`)
    // ⛔ The title is the SECOND, INDEPENDENT witness that a row is a harness artefact. A caller could pass
    // an id it did not create; a row that is both named by a caller AND titled by the harness cannot
    // plausibly be somebody's real conversation.
    if (!titlePrefix.test(r.title ?? '')) bad.push(`${r.id} title ${JSON.stringify(r.title)} is not a harness title`)
  }
  return bad
}

/** ⛔ Refuse if the schema references conversations from a table `DEPENDENTS` does not name. */
export async function undeclaredReferences(q, S) {
  const declared = new Set(DEPENDENTS.map(([t, c]) => `${t}.${c}`))
  const found = await q(
    `select table_name t, column_name c from information_schema.columns
      where table_schema = $1 and column_name in ('conversation_id','into_conversation_id')`, [S])
  return found.filter((r) => !declared.has(`${r.t}.${r.c}`)).map((r) => `${r.t}.${r.c}`)
}

/**
 * Delete the given conversations and everything that references them, children first, in ONE transaction.
 * ⛔ Performs no safety checks of its own — call `safetyViolations` and `undeclaredReferences` first.
 * @returns {Promise<Record<string,string[]>>} removed row ids per table
 */
export async function deleteConversations(q, S, ids) {
  if (!ids?.length) return {}
  const removed = {}
  try {
    await q('begin')
    for (const [t, c, key] of DEPENDENTS) {
      const r = await q(`delete from ${S}.${t} where ${c} = any($1) returning ${key}::text id`, [ids])
      if (r.length) removed[t] = r.map((x) => x.id)
    }
    const gone = await q(`delete from ${S}.txn_conversations where id = any($1) returning id::text id`, [ids])
    removed.txn_conversations = gone.map((x) => x.id)
    await q('commit')
  } catch (e) {
    await q('rollback').catch(() => {})
    throw e
  }
  return removed
}

/**
 * ⭐⭐ SWEEP EMBEDDINGS THAT NO LONGER BELONG TO ANYTHING — because the delete RACES THE SERVER.
 *
 * ⚠️⚠️ MEASURED, the first time the harness cleaned up after itself: it removed 8 conversations and
 * **0 embeddings**, and a moment later there were **6 orphaned embedding rows**. The server keeps working
 * after it answers — embeddings, noticing, reflection — so rows arrive for a conversation that is already
 * gone. ⛔ And an orphaned embedding is not harmless bookkeeping: it carries `conversation_id`, `role`,
 * `room_user_id` and the VECTOR, so it stays a retrieval candidate. That is the exact contamination the
 * cleanup exists to remove, arriving through the back door.
 *
 * ⛔ DELIBERATELY CONSERVATIVE: a row is swept only when BOTH its conversation and its message are gone.
 * An embedding whose message still exists is somebody's live index entry, not garbage.
 * ⓘ Idempotent and safe to run at any time, which is what makes it a reliable answer to a race: whatever
 * lands after this run is swept by the next one.
 */
export async function sweepOrphanEmbeddings(q, S) {
  const r = await q(
    `delete from ${S}.txn_message_embeddings e
      where not exists (select 1 from ${S}.txn_conversations c where c.id = e.conversation_id)
        and not exists (select 1 from ${S}.txn_messages m where m.id = e.message_id)
      returning e.message_id::text id`)
  return r.map((x) => x.id)
}

/**
 * ⭐⭐ VERIFY BY ID SET, IN BOTH DIRECTIONS — never by a count.
 *
 * ⚠️ The lesson is `ask-sotera-as-root.mjs`'s: its first run reported *"residue left in his room, messages
 * 96→98"* and it was a FALSE ALARM, because Ote was chatting in his own room while the probe ran. **A count
 * cannot tell whose rows moved it.** An id set answers the two questions that actually matter, separately:
 * did anything else get destroyed, and did anything targeted survive.
 */
export function verifyRemoval(beforeIds, afterIds, targetIds) {
  const after = afterIds instanceof Set ? afterIds : new Set(afterIds)
  const before = beforeIds instanceof Set ? beforeIds : new Set(beforeIds)
  const targeted = new Set(targetIds)
  const disappeared = [...before].filter((id) => !after.has(id))
  return {
    disappeared: disappeared.length,
    unintended: disappeared.filter((id) => !targeted.has(id)),
    survived: [...targeted].filter((id) => after.has(id)),
  }
}
