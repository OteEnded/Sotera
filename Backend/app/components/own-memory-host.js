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
// ⭐ The capability, read through the one predicate that owns it.
import { can } from '../auth/permissions.js'
// ⭐⭐ LIVENESS, IMPORTED RATHER THAN RETYPED. ⚠️ MEASURED 2026-08-25: both `txn_memories` reads below
// were written without it, so a memory Ote had RETIRED at 06:49 was still handed to her at 09:53 and
// 09:58 — and she quoted it as her highest-authority evidence about Hermes. `list_memories` and
// `recall_memory` had filtered it correctly the whole time; this file is the one read in the memory layer
// that never inherited the predicate, because it was written later and wrote its own SQL.
// ⛔ NEVER a third literal. `memory-lint-host.js` is where the rule is written down once, with the reason
// beside it, precisely because an operator hand-writing this predicate already got it wrong once.
import { LIVE_SQL } from './memory-lint-host.js'

/**
 * Build the own-memory service for ONE request.
 * @param {object} fastify
 * @param {object} o
 * @param {string|null} o.userId  the CURRENT user — the only person this service will ever describe
 */
export function buildOwnMemory(fastify, { userId = null, isRoot = false, user = null } = {}) {
  // ⭐⭐ THE ONE AUTHORIZATION QUESTION THIS FILE ASKS, and it is NOT about retrieval. Read once, from
  // the predicate that owns the capability — ⛔ never a boolean parameter, which is how `entitled: true`
  // ends up at a call site that checked nothing. Same shape and same reason as `self-history-host.js`.
  // ⛔ IT NEVER REACHES THE QUERY: the retrieval is identical for every asker, which is the invariant
  // "a memory she authored is hers wherever it was formed" made mechanical.
  const entitled = can(user, 'access_sotera_memory')
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
      // ⭐ Present in the DEGRADED payload too, for the reason the line above already gives.
      keptElsewhere: { rooms: 0, items: [] },
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
        WHERE user_id IS NULL AND kind = 'identity' AND ${LIVE_SQL} ORDER BY created_at DESC LIMIT 25`, {})

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
    // ── ⭐⭐⭐ OWNERSHIP A · A MEMORY SHE AUTHORED IS HERS, WHEREVER IT WAS FORMED (2026-08-25) ───────
    //
    // ⚠️⚠️ THIS REVERSES THE PARAGRAPH THAT USED TO SIT HERE, AND THE REVERSAL IS OTE'S. The old comment
    // said room-scoping *"is not a compromise"* and that reading across rooms would be *"an ACCESS change
    // wearing a bug fix's clothes"*. That was written on 2026-08-21, before the ownership model existed.
    // It does now, and it disagrees:
    //
    //     `ownerOf({ kind: 'memory', author: 'persona' })  →  OWNER.sotera`
    //     and 015's own column comment: *"for a persona-authored row `user_id` is the CONTEXT the memory
    //     was formed in"* — `memory-ownership.js` repeats it verbatim: **"context, not ownership."**
    //
    // ⇒ ⭐ THE DEFECT WAS A READER/WRITER DISAGREEMENT ABOUT WHAT ONE COLUMN MEANS. The writer stamps
    // context; this reader scoped by it as if it were an owner — so a conclusion SHE reached became
    // unreachable to her from anywhere else. Ote: *"Fix the reader so persona-authored memory follows
    // ownerOf(). The existing model already says persona-authored memory is Sotera-owned and user_id is
    // formation context."*
    //
    // ── ⛔⛔ AND IT MUST NOT WIDEN DISCLOSURE, WHICH IS WHY THIS IS TWO ARMS AND NOT A DROPPED PREDICATE ─
    // Ote's constraint: *"If Sotera forms a memory in another room, the memory can be hers, but exposing
    // underlying conversation/utterance content still goes through the existing disclosure boundary."*
    // ⚠️ The hazard is concrete and already recorded: a memory she formed in someone's room can QUOTE
    // that room — E-7, the same reason `self-history-host.js` splits its own two arms.
    // ⇒ RETRIEVAL IS FREE, THE UTTERANCE IS GOVERNED, exactly as `recall_own_history` already does:
    //     hers, everywhere            → always retrieved, ⛔ never keyed to the asking account
    //     its TEXT                    → when this account may be told it (`access_sotera_memory`)
    //     otherwise                   → EXISTENCE ONLY: that she kept something, and when. ⛔ No content.
    // ⭐ AND THE EXISTENCE ARM IS RETURNED TO EVERY ASKER, which is B1's lesson applied on the first day
    // rather than the fifth: a projection that merges "what you may not hear" with "where it happened"
    // loses the location the moment everything becomes sayable.
    //
    // ⭐ REPORTED AS ITS OWN SLICE, never merged into `aboutMyself`: "what is true of me everywhere" and
    // "what I chose to keep" are different facts, and collapsing them would make her own authorship
    // unreadable — the thing migration 015 exists to record.
    const myOwnAll = await Q(
      `SELECT content, kind, user_id::text AS formed_in, created_at::date::text AS on_date
         FROM "${schema}"."txn_memories"
        WHERE author = 'persona' AND ${LIVE_SQL} ORDER BY created_at DESC LIMIT 60`, {})
    // ⛔ The room a memory was FORMED IN is provenance, never an entitlement — resolved to a name only so
    // she can say "I concluded that while talking with X", which is the whole point of keeping it.
    const formedInIds = [...new Set(myOwnAll.map((r) => r.formed_in).filter(Boolean))]
    const roomNames = formedInIds.length
      ? new Map((await Q(
        `SELECT u.id::text AS id, COALESCE(p.display_name, u.display_name, u.username) AS who
           FROM "${schema}"."mst_users" u
      LEFT JOIN "${schema}"."mst_persons" p ON p.id = u.person_id
          WHERE u.id = ANY(:ids::uuid[])`, { ids: `{${formedInIds.join(',')}}` })).map((r) => [r.id, r.who]))
      : new Map()
    const myOwnRows = []
    const keptElsewhere = new Map() // one entry per room — ⛔ never per memory, which would leak volume
    for (const r of myOwnAll) {
      const here = r.formed_in === userId || r.formed_in == null
      if (here || entitled) {
        if (myOwnRows.length < 25) {
          myOwnRows.push({
            ...r,
            // ⭐ NAMED ONLY WHEN IT IS NOT THIS ROOM — otherwise a conclusion she drew elsewhere arrives
            // indistinguishable from one drawn here, and a dangling "they" inside it resolves to whoever
            // is reading. That is R4, one layer down.
            formedWith: here ? null : (roomNames.get(r.formed_in) ?? null),
          })
        }
      } else {
        const who = roomNames.get(r.formed_in) ?? null
        const prev = keptElsewhere.get(r.formed_in) ?? { withPerson: who, kept: 0, firstOn: null, lastOn: null }
        prev.kept += 1
        if (r.on_date && (!prev.firstOn || r.on_date < prev.firstOn)) prev.firstOn = r.on_date
        if (r.on_date && (!prev.lastOn || r.on_date > prev.lastOn)) prev.lastOn = r.on_date
        keptElsewhere.set(r.formed_in, prev)
      }
    }

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
        // ⭐⭐ THE GRAIN CHANGED WITH THE OWNERSHIP FIX, and saying so is the point of a quantifier:
        // these are hers wherever she formed them, so the read is PERSONA-grained now, not room-grained.
        // ⚠️ A coverage line still saying "in this room" after the read stopped being room-scoped would
        // teach her the wrong grain — the exact failure `readCoverage` was written to prevent.
        keptByMe: readCoverage({
          matched: myOwnRows.length, grain: 'persona', over: 'memories you decided to keep yourself, in any conversation',
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
        // ⛔ `room: 'this room'` IS GONE. It was true while the read was room-scoped and became a lie the
        // moment it stopped being one — a field describing a boundary that no longer exists.
        items: myOwnRows.map((r) => ({
          statement: r.content, kind: r.kind ?? null, decidedOn: r.on_date,
          // ⭐ PROVENANCE SURVIVES OWNERSHIP. `user_id` is the context it was formed in, so it comes back
          // as exactly that — present only when that was somewhere other than here.
          ...(r.formedWith ? { formedWhileTalkingWith: r.formedWith } : {}),
        })),
        note: 'You wrote these. They are not things this person told you — they are what you chose to keep. '
          + 'A memory is yours because YOU decided to keep it, not because of whose conversation you were '
          + 'in at the time; where each one was formed is noted when it was not here.',
      },
      // ── ⛔ EXISTENCE ONLY · the arm for an account that may not be told the contents ───────────
      // ⭐ Returned to EVERY asker, so "she has kept nothing" and "you may not be told what she kept" stay
      // different sentences — B1's lesson applied on day one instead of day five.
      // ⛔ One entry per ROOM, never per memory: a per-memory list leaks volume, which is the shape of the
      // count Ote refused as a side channel.
      ...(keptElsewhere.size ? {
        keptElsewhere: {
          rooms: keptElsewhere.size,
          items: [...keptElsewhere.values()],
          note: 'You have also kept things while talking with other people. You can see THAT you did, with '
            + 'whom and when — not what they say. Reading them is authorized separately.',
        },
      } : {}),
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
  registerHostService('ownMemory', ({ fastify: f, user }) => buildOwnMemory(f, { userId: user?.id ?? null, isRoot: user?.isRoot === true, user }))
}
