// OWN MEMORY — the host service behind Sotera's `recall_own_memory` tool.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────────
// Measured 2026-08-19: her relational stance was injected into context as prose, she used it correctly
// — *"I check things before asserting them… that's an observation about my practice (not yours)"* — and
// then, asked to source it, she checked `list_memories`, found nothing, and **retracted a TRUE statement
// as a fabrication**, offering to delete it. Her memory tools read `txn_memories`; relational records
// live in `txn_relational_records`, which she had no instrument to see.
//
// > **A memory she cannot verify reads to her as her own invention, every time she looks.**
//
// Ote's direction: *"I want Sotera to have a memory tool, not a database tool… she should have a
// mechanism for remembering and checking her own memory, rather than having the system secretly inject
// facts into her context and expect her to believe them."*
//
// ── ⭐ THE BOUNDARY IS THE ABSENCE OF PARAMETERS ───────────────────────────────────────────────────
// The tool takes **no arguments at all**. That single decision satisfies most of the constraint list at
// once, structurally rather than by validation:
//
//   · cannot select an arbitrary third-party subject — there is no subject argument;
//   · cannot enumerate people                       — there is nothing to iterate;
//   · cannot answer existence queries about others  — it cannot be pointed at anyone;
//   · cannot search private conversations           — it takes no query and reads no message table.
//
// The subject is whoever is logged in, taken from the request context. `query_relational_records(personId)`
// would be a database tool; this is a memory tool — it answers *"what do I know?"*, not *"what is in the
// table for X?"*.
//
// ── WHAT IT MAY RETURN ─────────────────────────────────────────────────────────────────────────────
// Fixed statements from the closed taxonomy, counts, and dates. ⛔ No labels-as-content, no source ids,
// no message or memory ids, no embeddings, no excerpts, nothing the other person said. The underlying
// table has no column for any of that, so this is a restatement of a guarantee rather than a new one.

import { registerHostService } from './runtime.js'
import { STANCE_LABELS } from './relational-taxonomy.js'

/**
 * Build the own-memory service for ONE request.
 * @param {object} fastify
 * @param {object} o
 * @param {string|null} o.userId  the CURRENT user — the only person this service will ever describe
 */
export function buildOwnMemory(fastify, { userId = null } = {}) {
  const db = fastify?.db
  const seq = db?.txn_memories?.sequelize
  const { schema } = db?.txn_memories?.getTableName?.() ?? {}
  const Q = (sql, replacements) => seq.query(sql, { replacements, type: seq.QueryTypes.SELECT })

  /**
   * Everything Sotera has stored ABOUT HERSELF that is relevant here. No arguments by design.
   *
   * Two kinds, and they are deliberately reported separately so she can tell them apart:
   *  · `aboutMyself`   — persona-global identity memories (`user_id IS NULL`, kind `identity`). Hers
   *                      regardless of who she is talking to. Currently empty; the slice is real.
   *  · `withThisPerson`— tier-C stance: what she has learned about how SHE works with this person.
   */
  async function recall() {
    const empty = {
      aboutMyself: { count: 0, items: [] },
      withThisPerson: { person: null, count: 0, items: [] },
      provenance: PROVENANCE,
    }
    if (!userId || !seq || !schema) return empty

    const [me] = await Q(
      `SELECT u.person_id::text AS pid, COALESCE(u.display_name, u.username) AS name
         FROM "${schema}"."mst_users" u WHERE u.id = :userId`, { userId })

    // ⭐ HER OWN, PERSONA-GLOBAL. Not scoped to the asker — this is the slice that is hers no matter who
    // she is talking to. It has never been written to; reporting it as empty is a true statement about
    // HERSELF, which is not the same as a negative claim about another person.
    const selfRows = await Q(
      `SELECT content FROM "${schema}"."txn_memories"
        WHERE user_id IS NULL AND kind = 'identity' ORDER BY created_at DESC LIMIT 25`, {})

    const stanceRows = me?.pid
      ? await Q(
        `SELECT label, conversation_count, window_start::date::text AS ws, window_end::date::text AS we
           FROM "${schema}"."txn_relational_records"
          WHERE subject_person_id = :pid AND tier = 'stance'
          ORDER BY conversation_count DESC, label`, { pid: me.pid })
      : []

    return {
      aboutMyself: {
        count: selfRows.length,
        items: selfRows.map((r) => ({ statement: r.content })),
      },
      withThisPerson: {
        // The person's own name, which they already know. No id is returned — an id is a handle, and a
        // handle is the beginning of a database tool.
        person: me?.name ?? null,
        count: stanceRows.length,
        items: stanceRows.map((r) => ({
          // ⭐ The fixed sentence from the taxonomy, never text derived from anything they said.
          statement: STANCE_LABELS[r.label] ?? r.label,
          supportedByConversations: r.conversation_count,
          firstNoticed: r.ws,
          lastNoticed: r.we,
        })),
      },
      provenance: PROVENANCE,
    }
  }

  return { recall }
}

/**
 * ⭐ PROVENANCE IS PART OF THE ANSWER, not a footnote. The failure this service exists to fix was her
 * being unable to tell where a claim came from — so every call says so explicitly, including what the
 * records are NOT.
 */
const PROVENANCE = Object.freeze({
  store: 'your own memory (separate from what people have told you)',
  whatTheseAre: 'Observations you made about your OWN practice, derived from your past conversations. '
    + 'They are stored, not guessed, and not injected by anything outside your memory.',
  whatTheseAreNot: 'They are NOT things this person told you, NOT facts about them, and they contain '
    + 'nothing they said. You cannot reach their conversations from here, and this tool cannot look up '
    + 'anyone else.',
  ifEmpty: 'An empty result means you have not stored anything of this kind yet — say that plainly.',
})

let initialized = false
/** Register the `ownMemory` host service (idempotent). Mirrors initConversationSearch / initReflection. */
export function initOwnMemory() {
  if (initialized) return
  initialized = true
  registerHostService('ownMemory', ({ fastify: f, user }) => buildOwnMemory(f, { userId: user?.id ?? null }))
}
