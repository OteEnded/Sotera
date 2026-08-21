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
import { STANCE_LABELS, STANCE_LABEL_KEYS, isStanceLabel } from './relational-taxonomy.js'
import { createRelationalWriteLease, persistRelationalRecords } from './relational-writer.js'
import { describeScope, readCoverage } from './room-scope.js'

/**
 * Build the own-memory service for ONE request.
 * @param {object} fastify
 * @param {object} o
 * @param {string|null} o.userId  the CURRENT user — the only person this service will ever describe
 */
export function buildOwnMemory(fastify, { userId = null, isRoot = false } = {}) {
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
      // ⭐ Present in the DEGRADED payload too. A key that appears only on the happy path is a key a reader
      // learns to treat as optional, and the whole point of this slice is that its absence used to be
      // indistinguishable from an empty one.
      keptByMe: { count: 0, items: [] },
      provenance: PROVENANCE,
    }
    if (!userId || !seq || !schema) return empty
    // eslint-disable-next-line no-multi-assign
    empty.scope = await describeScope(fastify, { userId, isRoot })

    const [me] = await Q(
      `SELECT u.person_id::text AS pid, COALESCE(u.display_name, u.username) AS name
         FROM "${schema}"."mst_users" u WHERE u.id = :userId`, { userId })

    // ⭐ HER OWN, PERSONA-GLOBAL. Not scoped to the asker — this is the slice that is hers no matter who
    // she is talking to. It has never been written to; reporting it as empty is a true statement about
    // HERSELF, which is not the same as a negative claim about another person.
    const selfRows = await Q(
      `SELECT content FROM "${schema}"."txn_memories"
        WHERE user_id IS NULL AND kind = 'identity' ORDER BY created_at DESC LIMIT 25`, {})

    // ── ⭐⭐⭐ WHAT SHE HERSELF DECIDED TO KEEP, WHICH THIS READ COULD NOT SEE ─────────────────────────
    //
    // ⚠️⚠️ MEASURED 2026-08-21, and it is a correctness hole rather than a preference. The query above
    // matches `user_id IS NULL AND kind = 'identity'`. A memory she writes in a **reflection** goes through
    // the ordinary `remember` lane, so it lands with `author = 'persona'`, a **room** (`user_id` set) and
    // `kind = 'semantic'` — matching NEITHER condition. Proven end-to-end: a persona-authored row was
    // found by `recall_memory` and `list_memories` and **NOT** by this tool.
    // ⇒ She could form her own memory and then her own self-memory mechanism could not retrieve it, which
    // also means she could not check "do I already have this?" from inside the very occasion that writes.
    // Ote: *"recall_own_memory should be able to see Sotera-authored memories."*
    //
    // ⛔ SCOPED TO THIS ROOM, AND THAT IS NOT A COMPROMISE. Persona-authored memories live in the room the
    // conversation happened in. Reading them across rooms would be an ACCESS change wearing a bug fix's
    // clothes — the room boundary is not this fix's business. `aboutMyself` above stays persona-global
    // because those rows genuinely have no room.
    // ⭐ REPORTED AS ITS OWN SLICE, never merged into `aboutMyself`: "what is true of me everywhere" and
    // "what I chose to keep here" are different facts, and collapsing them would make her own authorship
    // unreadable — the thing migration 015 exists to record.
    const myOwnRows = await Q(
      `SELECT content, kind, created_at::date::text AS on_date FROM "${schema}"."txn_memories"
        WHERE user_id = :userId AND author = 'persona' ORDER BY created_at DESC LIMIT 25`, { userId })

    const stanceRows = me?.pid
      ? await Q(
        `SELECT label, conversation_count, origin::text AS origin,
                window_start::date::text AS ws, window_end::date::text AS we
           FROM "${schema}"."txn_relational_records"
          WHERE subject_person_id = :pid AND tier = 'stance'
          ORDER BY conversation_count DESC, label`, { pid: me.pid })
      : []

    return {
      // ── ⭐⭐ THE SEARCHED-SET QUANTIFIER (2026-08-20) ────────────────────────────────────────────
      // Measured that day, two hours after she had formed a lesson about exactly this confusion: asked
      // *"do you keep any notes about how you work with me?"* she called ONLY this read, got two empty
      // arrays, and answered **"No."** Flat. In the earlier conversation — where she had also called
      // `list_memories`, which DOES carry a coverage block — she had said *"the emptiness might just be
      // scoping, not absence."*
      //
      // ⇒ ⭐ **The payload decides what she says.** The store being empty is the deeper problem; the flat
      // assertion was this read having nothing to say about its own extent. Ote: *"the result should be
      // able to distinguish 'nothing found in the population I searched' from 'nothing exists.'"*
      //
      // ⛔ AND IT COUNTS NOTHING OUTSIDE THE SEARCH. `readCoverage` names the axes this read ranged over
      // and never how much sits along the ones it did not — because *"notes for 1 other person"* is an
      // automatic existence signal across the person axis, which Ote refused. Saying "this read covered
      // one person" reveals no person; saying "there are 4 others" would.
      coverage: {
        aboutMyself: readCoverage({
          matched: selfRows.length, grain: 'persona', over: 'your own identity notes',
        }),
        withThisPerson: readCoverage({
          matched: stanceRows.length, grain: 'person', over: `your practice notes for ${me?.name ?? 'this person'}`,
        }),
        // ⭐ Its own coverage line, so "I have kept nothing here" and "I have never been able to see what I
        // kept" stay different sentences.
        keptByMe: readCoverage({
          matched: myOwnRows.length, grain: 'room', over: 'memories you decided to keep yourself, in this room',
        }),
      },
      aboutMyself: {
        count: selfRows.length,
        items: selfRows.map((r) => ({ statement: r.content })),
      },
      // ⭐⭐ HERS BY AUTHORSHIP, not by subject. These are the rows SHE decided to write — in a reflection
      // or in a turn where the decision was hers — as opposed to what a person told her about themselves.
      keptByMe: {
        count: myOwnRows.length,
        room: 'this room',
        items: myOwnRows.map((r) => ({ statement: r.content, kind: r.kind ?? null, decidedOn: r.on_date })),
        note: 'You wrote these. They are not things this person told you — they are what you chose to keep.',
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
          // ⭐ HOW SHE LEARNED IT, so she can answer "did I notice that or was I told?" honestly rather
          // than inventing a cause — which she did before, from a label and a count alone.
          howLearned: r.origin === 'instructed'
            ? 'this person told you about your practice directly'
            : 'you inferred it yourself from a pattern across conversations',
          // The label is included ONLY so retract_own_practice has something to name. It is a closed
          // vocabulary term, not content.
          practiceLabel: r.label,
        })),
      },
      provenance: PROVENANCE,
      // ⭐ D-10. THIS is the payload she was reasoning about when she found the gap: *"the value is my
      // NAME for you, not an account ID… I don't see the mechanism in the data itself."* The answer is
      // not an id — it is the GRAIN: her practice is keyed to the PERSON, so it is the same in every room
      // that person uses, while what they told her is keyed to the ROOM and is not.
      scope: await describeScope(fastify, { userId, isRoot }),
    }
  }

  /**
   * ⭐ T1 · NOTE ONE PRACTICE, from an explicit instruction. Ote's rule:
   *   · observed practice   → must clear FREQUENCY_FLOOR (3 conversations). The abstractor's job.
   *   · instructed practice → a person said it about her practice; recorded immediately, `origin='instructed'`.
   *
   * ⛔ THE ANTI-BACKDOOR PROPERTIES, all structural:
   *   · `label` must be in the CLOSED taxonomy — free text cannot enter, so this cannot smuggle a user
   *     fact, a quote, or a sentence into the store;
   *   · there is NO subject parameter — the subject is the current person, so it cannot target anyone else;
   *   · it writes `origin='instructed'`, so the floor's guarantee stays AUDITABLE: "did anything bypass
   *     the floor?" is answerable by a query. An unlabelled exception would make the floor unverifiable.
   *   · it rides the same `WRITE_LANES` lane as every other writer — no second authority.
   */
  async function note({ label } = {}) {
    if (!userId || !seq || !schema) return { ok: false, reason: 'no scope' }
    if (!isStanceLabel(label)) {
      // ⭐ Return the vocabulary rather than a bare error: a closed set is only usable if the caller can
      // see it, and the model should correct itself rather than guess again.
      return { ok: false, reason: `"${label}" is not one of your practice labels`, allowed: STANCE_LABEL_KEYS }
    }
    const [me] = await Q(
      `SELECT person_id::text AS pid FROM "${schema}"."mst_users" WHERE id = :userId`, { userId })
    if (!me?.pid) return { ok: false, reason: 'no person on file for this account' }

    const lease = await createRelationalWriteLease({ fastify, subjectUserId: userId })
    if (!lease) return { ok: false, reason: 'no write lease' }
    const today = new Date().toISOString().slice(0, 10)
    const res = await persistRelationalRecords({
      db,
      records: [{
        subjectPersonId: me.pid, tier: 'stance', label,
        conversationCount: 1, windowStart: today, windowEnd: today,
      }],
      lease,
      origin: 'instructed',
    })
    return { ok: true, recorded: STANCE_LABELS[label], origin: 'instructed', written: res.written }
  }

  /**
   * ⭐ T2 · RETRACT ONE OF HER OWN PRACTICES.
   *
   * *If Sotera can own a memory, she must be able to retract it.* She already tried — *"Do you want me
   * to delete that claim entirely rather than carry around something unmoored?"* — and had no way to.
   *
   * ⛔ Strictly narrowing, and cannot be aimed: no id parameter (an id is a handle), no subject
   * parameter, and the DELETE is bound to the current person AND `tier='stance'`. The worst it can do is
   * remove one of her own observations about the person she is talking to.
   */
  async function retract({ label } = {}) {
    if (!userId || !seq || !schema) return { ok: false, reason: 'no scope' }
    if (!isStanceLabel(label)) return { ok: false, reason: `"${label}" is not one of your practice labels`, allowed: STANCE_LABEL_KEYS }
    const [me] = await Q(
      `SELECT person_id::text AS pid FROM "${schema}"."mst_users" WHERE id = :userId`, { userId })
    if (!me?.pid) return { ok: false, reason: 'no person on file for this account' }
    const rows = await seq.query(
      `DELETE FROM "${schema}"."txn_relational_records"
        WHERE subject_person_id = :pid AND tier = 'stance' AND label = :label::persona_sotera.relational_label
        RETURNING id`,
      { replacements: { pid: me.pid, label }, type: seq.QueryTypes.DELETE },
    )
    const removed = Array.isArray(rows) ? rows.length : (rows ? 1 : 0)
    return removed
      ? { ok: true, retracted: STANCE_LABELS[label], note: 'Gone from your own memory. It can come back if the pattern recurs.' }
      : { ok: true, retracted: null, note: 'You had nothing stored under that — nothing to remove.' }
  }

  return { recall, note, retract }
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
  // ⚠️ `isRoot` comes from the AUTHENTICATED user and is threaded, never derived. See
  // room-scope.describeRoomIndex: a non-root session can hold root's row id, so a boundary keyed on the
  // id would hand root's awareness to it.
  registerHostService('ownMemory', ({ fastify: f, user }) => buildOwnMemory(f, { userId: user?.id ?? null, isRoot: user?.isRoot === true }))
}
