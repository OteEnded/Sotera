// ⭐⭐ TAKE A RUN'S OWN CONVERSATIONS OUT OF THE CORPUS — without deleting them (033).
//
// ── ⚠️ WHY THIS EXISTS, AND WHY IT IS NOT `corpus.mjs` ───────────────────────────────────────────
// `test/lib/corpus.mjs` DELETES, and it demands two independent witnesses before it will — the test
// account owning the row AND a harness title — because the title gate is what stopped a cleanup eating
// somebody's real conversation. ⛔ That contract is untouched and must stay: this file is the option that
// makes deleting needed LESS OFTEN, ⛔ never a looser way to delete.
//
// ⭐ A measurement that leaves its own conversations in the corpus is measuring a corpus it changed —
// three times now, once badly enough that harness artefacts OUTRANKED her real conversations 73-to-38.
// Until 033 the only fix was deletion, which destroys the record of what the run actually did.
//
//     exclusion   the conversation stays, its messages stay, the UI still shows it,
//                 and it is no longer material she can reason from.
//
// ── ⛔ WHAT IT REFUSES ───────────────────────────────────────────────────────────────────────────
// ⛔ A conversation in a room the caller does not own. ⛔ A blank or throwaway reason — an exclusion
// nobody can justify later is indistinguishable from curating the data to make a number come out.
// ⛔ And it never touches `incognito`: that is a privacy promise fixed at create, and this is not it.

import { validateExclusion } from '../../Backend/app/components/corpus-eligibility.js'

/**
 * excludeRun — mark conversations non-evidential. Returns what it did, per id.
 *
 * @param {import('pg').Client} pg   an open client
 * @param {string} schema
 * @param {object} o
 * @param {string[]} o.conversationIds
 * @param {string}   o.reason         why — REQUIRED, and stored
 * @param {string}   [o.ownerUsername='agent_dev']  ⛔ the room must belong to this account
 * @param {boolean}  [o.apply=false]  false = report what WOULD be excluded
 */
export async function excludeRun(pg, schema, { conversationIds = [], reason, ownerUsername = 'agent_dev', apply = false } = {}) {
  const v = validateExclusion({ reason })
  if (!v.ok) return { ok: false, why: v.why, excluded: [] }
  const ids = [...new Set(conversationIds.filter(Boolean).map(String))]
  if (!ids.length) return { ok: true, excluded: [], skipped: [], note: 'nothing to exclude' }

  // ⭐ THE OWNERSHIP WITNESS, KEPT. Weaker than `corpus.mjs`'s two witnesses because this is reversible
  // and non-destructive — but ⛔ not absent, because "my run's conversations" must still mean something.
  const { rows } = await pg.query(
    `select c.id::text id, c.title, c.excluded_from_evidence_at, u.username
       from ${schema}.txn_conversations c
       join ${schema}.mst_users u on u.id = c.user_id
      where c.id::text = any($1::text[])`, [ids])
  const mine = rows.filter((r) => r.username === ownerUsername)
  const notMine = rows.filter((r) => r.username !== ownerUsername)
  const already = mine.filter((r) => r.excluded_from_evidence_at)
  const todo = mine.filter((r) => !r.excluded_from_evidence_at)

  if (apply && todo.length) {
    await pg.query(
      `update ${schema}.txn_conversations
          set excluded_from_evidence_at = now(), exclusion_reason = $2
        where id::text = any($1::text[])`, [todo.map((r) => r.id), v.reason])
  }
  return {
    ok: true,
    applied: apply,
    excluded: todo.map((r) => ({ id: r.id, title: r.title })),
    alreadyExcluded: already.map((r) => r.id),
    // ⛔ REPORTED, NOT SILENTLY SKIPPED. A cleanup that quietly passes over rows it could not account for
    // is how "I covered everything" gets said about a filtered set.
    refusedNotMine: notMine.map((r) => ({ id: r.id, owner: r.username })),
    reason: v.reason,
  }
}

/** ⭐ Undo. Exclusion is reversible by construction — that is most of why it is safe. */
export async function releaseRun(pg, schema, { conversationIds = [] } = {}) {
  const ids = [...new Set(conversationIds.filter(Boolean).map(String))]
  if (!ids.length) return { released: 0 }
  const { rowCount } = await pg.query(
    `update ${schema}.txn_conversations
        set excluded_from_evidence_at = null, exclusion_reason = null
      where id::text = any($1::text[])`, [ids])
  return { released: rowCount }
}
