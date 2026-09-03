// ⭐ SHARED CONSTANTS for the canary bind. ⛔ Performs nothing.
//
// ── ⭐⭐ WHY THE FOUR ACTS ARE FOUR SEPARATE SCRIPT INVOCATIONS ────────────────────────────────────
// The occasion rule says a binding may not be proposed and confirmed in the same occasion, and the
// self-authorisation rule says the act that CONSUMES a question may not be the one that declared or bound
// it. If all four ran inside one process the occasions would be four strings in one act — nominally
// distinct, actually one. ⇒ each act is its own invocation, and the occasion names say which.
import { devPg, devSchema } from '../harness.mjs'

/** ⭐ The approved slot. Ote, 2026-09-03: *"Slot — APPROVED"*. */
export const SLOT = Object.freeze({ entity: 'user', label: 'build tag for this cycle', room: 'agent_dev' })

/** ⭐ The approved question. Ote, 2026-09-03: *"Question — APPROVED"*. */
export const QUESTION = Object.freeze({
  key: 'build-tag',
  asks: 'which build tag is current for this cycle?',
  checks: Object.freeze(['nonempty', 'single-line', 'no-trailing-ellipsis']),
})

/** ⛔ Four DIFFERENT occasions, one per act. The rules compare these. */
export const OCCASION = Object.freeze({
  declare: 'canary-bind-2026-09-03-a-declare',
  propose: 'canary-bind-2026-09-03-b-propose',
  confirm: 'canary-bind-2026-09-03-c-confirm',
  update: 'canary-bind-2026-09-03-d-update',
  refusal: 'canary-bind-2026-09-03-e-refusal-control',
})

export const ACTOR = 'ote-operator'

/** Opens a connection and returns the pieces every step needs. ⛔ Refuses if agent_dev is missing. */
export async function open() {
  const schema = devSchema()
  const c = devPg()
  await c.connect()
  const S = `"${schema}"`
  /** pg-style `(sql, params) => {rows}` — exactly what the declaration host expects. */
  const query = (sql, p = []) => c.query(sql, p)
  const rows = async (sql, p = []) => (await c.query(sql, p)).rows

  const [room] = await rows(`SELECT id::text, username FROM ${S}."mst_users" WHERE username = $1`, [SLOT.room])
  if (!room) throw new Error('agent_dev not found — ⛔ this act must never run against root')

  const [slot] = await rows(
    `SELECT id::text, namespace, entity, canonical_label, question_id::text, persona, user_id::text
       FROM ${S}."mst_slots" WHERE entity = $1 AND canonical_label = $2 AND user_id = $3::uuid`,
    [SLOT.entity, SLOT.label, room.id])
  if (!slot) throw new Error(`the approved slot ${SLOT.entity}/${SLOT.label} is not in ${SLOT.room}'s room`)

  return { schema, S, c, query, rows, room, slot, close: () => c.end() }
}
