// LESSON — what she got wrong, what refuted it, and the distinction that generalizes.
//
// Ote, 2026-08-20, ratifying the layer: *"LESSON should represent actual development, especially revision:
// prior belief → what refuted it → revised belief, with the relevant evidence references."* And on the
// test that matters: *"It shouldn't just be 'did she remember the sentence?' It should be 'did she retain
// the abstraction that generalizes beyond the original incident?'"*
//
// ── ⭐⭐ WHY THIS EXISTS: THE MEASUREMENT, NOT THE THEORY ──────────────────────────────────────────────
// 2026-08-20, `OBSERVATION_SOTERA_FIRST_LESSON_01`: unled, she diagnosed her own error, produced a
// generalizable principle, judged it worth keeping, distinguished it from the ephemeral episode, and asked
// permission. Then `..._SECOND_LESSON_02`, two hours later in the same room: **she made the same class of
// mistake again**, because there was nowhere for it to go.
//
//   She can be corrected. She cannot yet learn.
//
// ── ⭐ WHAT IS DELIBERATELY NOT DECIDED HERE ─────────────────────────────────────────────────────────
// Ote: *"don't freeze the one-row-vs-two-row decision yet. Let this experiment produce another real
// example."* So this stores a lesson as ONE persona-authored row in `txn_memories`, with the structured
// parts in the existing `evidence` jsonb — the column E-3 already designated as the multi-source
// mechanism, and which has **0 rows**, so nothing is migrated and nothing is displaced.
//
// ⇒ ⛔ NO MIGRATION, NO NEW TABLE, NO NEW COLUMN. If observation says the parts want separate rows,
// splitting one row into several is mechanical; merging rows that have drifted apart is not. **One row is
// the reversible direction**, which is the only reason to pick it before the evidence is in.
//
// ── ⭐ THE FOUR PARTS ARE KEPT VISIBLY SEPARATE, ON PURPOSE ──────────────────────────────────────────
// Ote: *"keep the distinction between what happened → what she learned → how she knows it → what she
// should do differently visible in the dry-run output. I want to see whether those naturally collapse
// into one coherent learning or whether they actually need separate records."*
// So `propose()` returns them as four named fields and never as one blob. The dry-run IS the evidence for
// the schema question.
//
// ── OWNERSHIP, PROVENANCE, EVIDENCE ─────────────────────────────────────────────────────────────────
//   · OWNER    — `author: 'persona'` (migration 015). She authored the abstraction, so it is hers.
//   · CONTEXT  — `user_id` = the room it was formed in. Not ownership. Provenance.
//   · ABOUT    — `subject_person_id` stays whatever the caller passes, or NULL. ⛔ It is NOT defaulted to
//                the persona: a lesson about how she reads her own instruments may still be *about* Ote,
//                and `ABOUT ≠ OWNER` is the axis this whole day was spent separating.
//   · EVIDENCE — message ids and conversation ids as REFERENCES. ⛔ Never the text (E-7). Following a
//                reference goes through `getSource`, which authorizes the evidence separately (E-1).

import { createRelationalWriteLease } from './relational-writer.js'

/** Hard caps. A lesson is an abstraction; anything longer is a transcript wearing a hat. */
const CAP = { happened: 400, learned: 300, distinction: 300, doDifferently: 300 }
const MAX_REFS = 12
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const clip = (v, n) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/**
 * @param {object} fastify
 * @param {{userId?:string|null, conversationId?:string|null, isRoot?:boolean}} ctx
 */
export function buildLesson(fastify, { userId = null, conversationId = null } = {}) {
  const db = fastify?.db
  const seq = db?.txn_memories?.sequelize
  const { schema } = db?.txn_memories?.getTableName?.() ?? {}
  const persona = fastify?.config?.persona?.name ?? null

  /**
   * ⭐⭐ PROPOSE — the dry run. It writes NOTHING and it is the only entry point she can reach without a
   * human answering. Ote: *"Dry-run first. Show exactly what she would write, including the proposed
   * abstraction and provenance/evidence references, before allowing persistence."*
   *
   * ⚠️ `distinction` IS THE FIELD THE FIRST OBSERVATION ADDED, and it is the one under test. Her own
   * lesson was not *"I made a mistake about Ote's memory"* — it was *"don't infer a global absence from an
   * empty scoped read"*, and the part that made it reusable was naming the two things she had conflated.
   * **A lesson without a distinction is a diary entry.** So it is required, and the refusal says why.
   */
  async function propose({ happened, learned, distinction, doDifferently, evidence = [], subjectPersonId = null } = {}) {
    if (!userId || !seq || !schema) return { ok: false, reason: 'no scope' }
    const parts = {
      happened: clip(happened, CAP.happened),
      learned: clip(learned, CAP.learned),
      distinction: clip(distinction, CAP.distinction),
      doDifferently: clip(doDifferently, CAP.doDifferently),
    }
    if (!parts.learned) {
      return { ok: false, reason: 'a lesson needs `learned` — the thing you now believe that you did not before' }
    }
    if (!parts.distinction) {
      return {
        ok: false,
        reason: 'a lesson needs `distinction` — the two things you had been conflating. Without it this is a note about one incident rather than something you could use in a different situation.',
      }
    }
    // ── EVIDENCE AS REFERENCES ONLY ───────────────────────────────────────────────────────────────
    // ⛔ E-7: never copy the conversation into the memory. Measured 2026-08-20: 2 of 35 existing memories
    // already carry an 8+ word verbatim run from their source, and no authorization layer can fix that
    // because the text is already inside the row. So this accepts IDS and drops anything else.
    const refs = (Array.isArray(evidence) ? evidence : []).slice(0, MAX_REFS)
      .map((e) => ({
        kind: e?.kind === 'conversation' ? 'conversation' : 'message',
        // ⚠️ SHAPE-CHECK THE ID. A malformed one used to reach the resolve query and throw
        // `invalid input syntax for type uuid` — found on the third dry-run case, and the model WILL send
        // one. An unusable reference must degrade to "not resolved", never take the proposal down with it.
        id: typeof e?.id === 'string' && UUID_RE.test(e.id.trim()) ? e.id.trim().toLowerCase() : null,
      }))
      .filter((e) => e.id)
    // Verify the references RESOLVE, and say so — a lesson citing a message that does not exist is worse
    // than one citing nothing, because it looks checkable and is not.
    let resolved = 0
    if (refs.length && db.txn_messages) {
      const ids = refs.filter((r) => r.kind === 'message').map((r) => r.id)
      if (ids.length) {
        // ⚠️ `IN (:ids)`, NOT `ANY(:ids::uuid[])`. Sequelize's `replacements` expands an array into a
        // COMMA-SEPARATED LIST, so the ANY form produced `ANY('a','b','c'::uuid[])` and died with a
        // syntax error — the same class as the `log_tool_calls` `text[]` insert that had to move to
        // `bind`. `replacements` cannot bind an array AS an array; `IN` is the form it is built for.
        // Fail soft: a resolve that cannot answer reports 0 resolved rather than failing the proposal.
        // The count is a helpful fact about the references, not a precondition for having them.
        try {
          const [{ n }] = await seq.query(
            `SELECT count(*)::int AS n FROM "${schema}"."txn_messages" WHERE id IN (:ids)`,
            { replacements: { ids }, type: seq.QueryTypes.SELECT })
          resolved = n
        } catch { resolved = 0 }
      }
    }
    return {
      ok: true,
      dryRun: true,
      // ⭐ THE FOUR PARTS, NAMED AND SEPARATE. This is the artefact the schema question gets decided from.
      wouldWrite: {
        whatHappened: parts.happened || null,
        whatILearned: parts.learned,
        theDistinction: parts.distinction,
        whatIDoDifferently: parts.doDifferently || null,
      },
      // ⭐ The abstraction is what goes in `content` — the thing that generalizes, not the incident.
      abstraction: parts.distinction,
      ownership: {
        author: 'persona',
        why: 'you formed this understanding, so it is yours — not the room\'s and not the person\'s',
        contextRoom: userId,
        aboutPerson: subjectPersonId,
        note: 'the room is where this happened, not who owns it; `about` is an index and never ownership',
      },
      evidence: {
        references: refs,
        resolvedNow: resolved,
        containsSourceText: false,
        note: 'references only. Following one goes through recall_memory_source, which authorizes the evidence separately from the memory — a memory being yours does not make its evidence yours.',
      },
      nothingWasWritten: true,
    }
  }

  /**
   * COMMIT — persists a proposal. ⛔ Rides the existing `WRITE_LANES` lane, so this is not a second
   * writer; the one-writer rule is satisfied rather than bypassed.
   *
   * ⚠️ It takes the SAME arguments as `propose` and re-derives everything. It does NOT accept a
   * pre-built row from the caller: a commit that trusts a payload it did not build is a hole the size of
   * whatever the model chose to send.
   */
  async function commit(args = {}) {
    const dry = await propose(args)
    if (!dry.ok) return dry
    // ⭐ THE SAME LANE every other writer in this scope uses — `buildMemoryV2(...).enqueue`, reached
    // through the existing lease helper. Not a new queue and not a new authority: the one-writer rule is
    // satisfied rather than bypassed, which is the collision the Hermes survey said must be settled FIRST.
    const lease = await createRelationalWriteLease({ fastify, subjectUserId: userId })
    if (!lease) return { ok: false, reason: 'no write lease (this account has no person row)' }
    return lease.enqueue('lesson.commit', async () => {
      const [row] = await seq.query(
        `INSERT INTO "${schema}"."txn_memories"
           (id, persona, user_id, author, namespace, kind, content, entity, attribute, importance,
            source, subject_person_id, evidence, created_at, updated_at)
         VALUES (gen_random_uuid(), :persona, :userId, 'persona', 'default', 'semantic', :content,
                 'sotera', 'lesson', 7, :source, :subject, :evidence::jsonb, now(), now())
         RETURNING id::text`,
        {
          replacements: {
            persona,
            userId,
            content: dry.abstraction,
            source: conversationId ? `lesson:${conversationId}` : 'lesson',
            subject: args.subjectPersonId ?? null,
            evidence: JSON.stringify({ ...dry.wouldWrite, references: dry.evidence.references }),
          },
          type: seq.QueryTypes.SELECT,
        })
      return { ok: true, id: row.id, stored: dry.abstraction, author: 'persona' }
    })
  }

  /** RECALL her lessons in this context. Reads the structured parts back out of `evidence`. */
  async function recall({ limit = 10 } = {}) {
    if (!userId || !seq || !schema) return { count: 0, items: [] }
    const rows = await seq.query(
      `SELECT id::text, content, evidence, created_at
         FROM "${schema}"."txn_memories"
        WHERE persona IS NOT DISTINCT FROM :persona AND author = 'persona' AND attribute = 'lesson'
          AND invalid_at IS NULL AND expired_at IS NULL
        ORDER BY created_at DESC LIMIT :limit`,
      { replacements: { persona, limit }, type: seq.QueryTypes.SELECT })
    return {
      count: rows.length,
      items: rows.map((r) => ({
        abstraction: r.content,
        parts: {
          whatHappened: r.evidence?.whatHappened ?? null,
          whatILearned: r.evidence?.whatILearned ?? null,
          theDistinction: r.evidence?.theDistinction ?? null,
          whatIDoDifferently: r.evidence?.whatIDoDifferently ?? null,
        },
        evidenceReferences: r.evidence?.references ?? [],
        learnedOn: r.created_at,
      })),
    }
  }

  return { propose, commit, recall }
}
