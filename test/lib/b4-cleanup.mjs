// ⭐⭐⭐ REMOVE A B4 RUN'S OWN CONVERSATION, BECAUSE THE EXPERIMENT CONTAMINATES ITSELF.
//
// ── ⚠️⚠️ MEASURED, AND IT INVALIDATED AN ARM ────────────────────────────────────────────────────────
// The `current` arm re-ran the baseline configuration unchanged and scored **4/5 where the baseline
// scored 0/5**. It was not variance. Her first retrieval was:
//
//     {"used": ["in"], "in": "c83988ac-…"}        ← the BASELINE run's own conversation
//
// and she said so outright: *"I see the conversation from today (c83988ac) where you asked this same
// question and I was beginning to look but haven't completed the answer yet. Let me retrieve that full
// conversation to pick up where we left off."* ⇒ **run 2 used run 1 as a lead.**
//
// ⭐ This is `rate-harness`'s lesson exactly — *"73 harness conversations against 38 organic ones… her
// real conversations with Hermes were outranked by two dozen conversations ABOUT him that the harness had
// written that morning"* — and it arrives one layer up: not outranking the source, but **becoming a trail
// to it**. Either way the second run is not measuring the same corpus as the first.
//
// ⛔ A DIFFERENT ROOM DOES NOT FIX IT. `recall_own_history` searches every room she has been in, because
// a conversation is hers by having been in it. Isolation has to be removal.
//
// ── ⛔ WHY NOT THE `titlePrefix` GATE IN `corpus.mjs` ────────────────────────────────────────────────
// That gate wants a harness title as the second independent witness. These runs are titled "New chat" ON
// PURPOSE — the usual "PROBE as agent_dev" title tells the subject it is being measured — and "New chat"
// is a REAL title in her corpus, so it witnesses nothing. ⇒ the second witness here is the **first user
// message being byte-identical to the task prompt**, which nothing but a B4 run can be.

import { DEPENDENTS, deleteConversations, sweepOrphanEmbeddings } from './corpus.mjs'
import { TASKS } from './b4-case.mjs'

/**
 * ⛔ REFUSES THE WHOLE BATCH rather than skipping a row that fails a gate — `corpus.mjs`'s rule, kept.
 * @returns {{ok:boolean, violations:string[], removed?:object, sweptEmbeddings?:number}}
 */
export async function removeB4Run(q, S, cid, taskKey) {
  const task = TASKS[taskKey]
  if (!task) return { ok: false, violations: [`unknown task "${taskKey}"`] }

  const rows = await q(
    `select c.id::text id, c.title, c.user_id::text uid, u.username
       from ${S}.txn_conversations c join ${S}.mst_users u on u.id = c.user_id
      where c.id = $1`, [cid])
  if (!rows.length) return { ok: false, violations: [`${cid} does not exist`] }

  const violations = []
  const r = rows[0]
  // ⚠️ Root is his account, and the id and the name are checked SEPARATELY: a non-root session can be
  // authenticated onto root's row, so neither one implies the other.
  if (r.username === 'ote') violations.push(`${cid} belongs to "ote"`)
  if (!/^agent_dev/.test(r.username ?? '')) violations.push(`${cid} owner "${r.username}" is not a test account`)

  // ⭐ THE SECOND, INDEPENDENT WITNESS. A caller could pass an id it did not create; a conversation whose
  // FIRST user message is this exact prompt cannot plausibly be one of hers that happened anyway.
  const first = await q(
    `select content from ${S}.txn_messages
      where conversation_id = $1 and role = 'user' order by created_at limit 1`, [cid])
  if (!first.length) violations.push(`${cid} has no user message to identify it by`)
  else if (String(first[0].content).trim() !== task.prompt.trim()) {
    violations.push(`${cid} first message is not the "${taskKey}" prompt — refusing`)
  }

  // ⛔ And the schema is asked what references a conversation, rather than trusting a list: "an explicit
  // field list silently drops what it was not told about" has nine live instances in this project.
  const named = new Set(DEPENDENTS.map(([t]) => t))
  const refs = await q(
    `select tc.table_name t from information_schema.table_constraints tc
       join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
      where tc.table_schema = $1 and tc.constraint_type = 'FOREIGN KEY' and ccu.table_name = 'txn_conversations'`, [S])
  for (const x of refs) if (!named.has(x.t)) violations.push(`table "${x.t}" references conversations and DEPENDENTS does not name it`)

  if (violations.length) return { ok: false, violations }

  const removed = await deleteConversations(q, S, [cid])
  // ⚠️ The delete RACES THE SERVER — embeddings, noticing and reflection keep working after the answer, so
  // rows arrive for a conversation that is already gone. An orphaned embedding still carries the vector
  // and stays a retrieval candidate: the contamination arriving through the back door.
  const swept = await sweepOrphanEmbeddings(q, S)
  return { ok: true, violations: [], removed, sweptEmbeddings: swept?.length ?? swept ?? 0 }
}
