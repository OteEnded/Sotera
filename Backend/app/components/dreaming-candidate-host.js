// ⭐⭐⭐ M1-F · CANDIDATE COUNTING — *would Dreaming have anything to say?*, asked as a MEASUREMENT.
//
// ⛔⛔ IT PERSISTS NOTHING. Not a memory, not a commitment, not a proposal, not even a pass row. It runs
// SELECTs and returns counts. ⭐ There is no write path in this module to disable — the same structural
// guarantee `dreaming-resolver` has, and for the same reason.
//
// ⛔ NO MODEL. ⛔ No proposition forms — `M2-7` is unresolved and this must not prejudge it. ⛔ No
// citation: nothing that leaves here contains a sentence anybody said.
//
// ── ⭐⭐ WHAT IT MEASURES, AND WHY IT IS WORTH MEASURING ─────────────────────────────────────────
// The contract's §13.1 says Dreaming's defining output has no corpus — *"5 substantive repeats; 73% of
// user evidence is agent_dev; **recurrence is not establishable**"* — and that estimate has been
// carried, unmeasured, through every document in the arc. ⇒ this turns it into a number.
//
// ⭐ The question is asked the way Dreaming would ask it: **do the things she already holds a slot for
// recur across INDEPENDENT conversation roots?** The probe therefore comes from the MEMORY LAYER
// (`probeTermsFor` over each live slot label), ⛔ never from whoever wrote this file, so the candidate
// space is finite and inspectable.
//
// ── ⛔⛔ AND IT USES THE ADMISSION PATH, NEVER THE DENSE ARM ─────────────────────────────────────
// This is the first Dreaming code that reads message CONTENT, which makes it the first place that could
// re-create the defect measured on 2026-09-02: `conversation-search`'s dense arm filters through
// denormalised columns that carry `role`, `conversation_id` and `room_user_id` but ⛔ NOT
// `excluded_from_evidence_at`, so an embedding created while a conversation was admissible stays
// retrievable after it is excluded.
// ⇒ ⭐ every read here goes through `evidentialSql`, evaluated at READ time, which is Ote's ruling
// stated as code: *"index/corpus may rank → current view decides admission → audit provides citation."*
// ⓘ `dreaming-m1f-check` asserts the excluded conversation contributes ZERO candidates.
//
// ── ⚠️ TWO SELECTORS, BOTH REPORTED — because one number would hide its own sensitivity ─────────
// A slot label like `d2-episode-tophit-weight` yields three probe terms. Requiring ALL of them is the
// strict reading; requiring ANY is the loose one. ⭐ Both are measured and both are reported, so a
// reader can see how much of the answer is the corpus and how much is the selector. ⛔ Reporting only
// one would be a threshold disguised as a finding.

import { probeTermsFor, admitEvidence, MIN_INDEPENDENT_ROOTS } from './dreaming-evidence.js'
import { evidentialSql } from './corpus-eligibility.js'

/** ⛔ Declared, never inferred from source — the lesson `RUN_ONE_PASS_DEPS` was created by. */
export const MEASURE_CANDIDATES_DEPS = Object.freeze(['query', 'schema', 'minRoots', 'maxTurnsPerSlot'])

/**
 * ⭐⭐⭐ C1 · RESOLVE A SLOT'S FORMATION CONTEXT **FROM THE SLOT ITSELF**.
 *
 *     slot → source_message_id → txn_messages.conversation_id → txn_conversations.user_id
 *
 * ⭐ The point is NOT that this discovers something new — ⓘ measured, the chain agrees with the row's own
 * `user_id` in **60 of 60** live `entity='user'` rows. The point is that the boundary stops being
 * **caller discipline**: 12b bounded its own query by hand with `c.user_id = $1`, and nothing in the
 * system would have noticed if it had not. ⇒ a boundary held by convention is the dense-arm defect's
 * shape, and this makes it structural.
 *
 * ⛔⛔ AND IT IS NOT A SEMANTIC CLAIM. Ote, 2026-09-03: *"'formation context' is not 'the room this
 * memory is for.' It is simply the structural context from which the candidate is allowed to be drawn.
 * Sotera's memory remains Sotera-owned, independently of that context."*
 * ⇒ this function returns the CONTEXT and, separately, the room owner's person — ⭐ two fields, ⛔ and it
 * never returns one in place of the other.
 *
 * ⚠️ It returns `null` rather than guessing when the chain cannot be walked. A slot with no recorded
 * source has no formation context, and `selectCandidates` fails closed on that.
 */
export async function resolveFormationContext({ query, schema, memoryId = null, attribute = null } = {}) {
  if (typeof query !== 'function') throw new Error('resolveFormationContext requires a query(sql, params) function')
  if (!schema) throw new Error('resolveFormationContext requires a schema')
  if (!memoryId && !attribute) throw new TypeError('resolveFormationContext needs a memoryId or an attribute')
  const S = `"${schema}"`
  const { rows } = await query(
    `SELECT c.user_id::text AS formation_context,
            u.person_id::text AS room_owner_person_id,
            t.subject_person_id::text AS subject_person_id,
            t.attribute, t.value
       FROM ${S}."txn_memories" t
       -- ⭐ 049 · REACHABILITY: the row's own reach conversation first; the legacy pointer's conversation only as the
       -- reachability meaning it always had (⛔ never as evidence). LEFT JOINs so an unreachable row is REPORTED, not dropped.
       LEFT JOIN ${S}."txn_messages" m ON m.id = t.source_message_id
       LEFT JOIN ${S}."txn_conversations" c ON c.id = coalesce(t.reach_conversation_id, m.conversation_id)
       LEFT JOIN ${S}."mst_users" u ON u.id = c.user_id
      WHERE ($1::uuid IS NULL OR t.id = $1::uuid)
        AND ($2::text IS NULL OR t.attribute = $2::text)
        AND t.invalid_at IS NULL AND t.expired_at IS NULL
      ORDER BY t.created_at DESC LIMIT 1`,
    [memoryId, attribute])
  const r = rows[0]
  // ⭐ 049 · a row that exists but cannot be walked to a room is UNRESOLVED — `null` here means exactly that, never "none"
  if (!r?.formation_context) return null
  return {
    formationContext: r.formation_context,
    // ⭐⭐ SEPARATE AXES, RETURNED SEPARATELY. ⛔ `subjectPersonId` is NOT defaulted to the room owner
    // when it is absent — that substitution is exactly what ruling ② forbids, and it would be invisible.
    roomOwnerPersonId: r.room_owner_person_id ?? null,
    subjectPersonId: r.subject_person_id ?? null,
    slot: { attribute: r.attribute, value: r.value },
  }
}

/**
 * ⭐ One slot's candidate turns, room-grouped and counted. ⛔ Returns COUNTS ONLY.
 *
 * @param {'all'|'any'} mode  conjunctive or disjunctive over the probe terms
 */
async function countForSlot({ query, schema, attribute, terms, mode, minRoots, maxTurnsPerSlot }) {
  const S = `"${schema}"`
  // ⭐ ONE PLACEHOLDER PER TERM, bound — ⛔ never interpolated. A slot label is data written by the
  // memory layer, and data must never reach SQL as syntax.
  const joiner = mode === 'all' ? ' AND ' : ' OR '
  const where = terms.map((_, i) => `m.content ILIKE $${i + 1}`).join(joiner)
  const { rows } = await query(
    `SELECT m.id::text AS message_id, m.conversation_id::text AS conversation_id, m.created_at,
            m.content, m.role, c.user_id::text AS room
       FROM ${S}."txn_messages" m
       JOIN ${S}."txn_conversations" c ON c.id = m.conversation_id
      WHERE ${evidentialSql('c')}
        AND m.role IN ('user','assistant')
        AND (${where})
      ORDER BY m.created_at
      LIMIT ${maxTurnsPerSlot}`,
    terms.map((t) => `%${t}%`))

  // ⛔ ONE ROOM AT A TIME — `admitEvidence` refuses a mixed set rather than filtering it, because a root
  // count that depended on an invisible filter would not be a root count.
  const byRoom = new Map()
  for (const r of rows) {
    if (!r.room) continue
    if (!byRoom.has(r.room)) byRoom.set(r.room, [])
    byRoom.get(r.room).push(r)
  }

  const rooms = []
  for (const [room, roomRows] of byRoom) {
    // ⭐ THE BUILT MACHINERY DOES THE COUNTING. `roots` is computed by `admitEvidence`, not here — the
    // model never sees an aggregate and neither does this file re-derive one.
    const admitted = admitEvidence({ rows: roomRows, room, minRoots })
    rooms.push({
      room,
      // ⛔⛔ COUNTS ONLY. `admitted.buckets` carries bounded EXCERPTS, and not one of them leaves this
      // function. ⓘ The check scans the returned object recursively for any content-shaped field.
      roots: admitted.roots,
      turns: roomRows.length,
      clearsFloor: admitted.ok === true,
      // ⭐ THE ROLE SPLIT, because O-2's hazard lives here: roots resting only on HER OWN sentences are
      // one event echoing, not a recurrence. Reported, ⛔ not filtered — filtering would decide a
      // question (§9.4, self-consumption) that is still open.
      userTurns: roomRows.filter((r) => r.role === 'user').length,
      assistantTurns: roomRows.filter((r) => r.role === 'assistant').length,
    })
  }
  rooms.sort((a, b) => b.roots - a.roots)
  const truncated = rows.length >= maxTurnsPerSlot
  return {
    mode,
    totalTurns: rows.length,
    // ⚠️ TRUNCATION IS REPORTED. A capped read that did not say so would understate roots silently —
    // the same shape as N < M going unreported, one tier down.
    truncated,
    maxRoots: rooms[0]?.roots ?? 0,
    // ⭐⭐⭐ AND WHEN TRUNCATED, THE COUNT IS A LOWER BOUND — SAID IN THE DATA, not left to a footnote.
    // Ote's ruling, 2026-09-02: *"The 17 truncated slots are important. Their root counts are lower
    // bounds, not trustworthy recurrence counts. Don't compensate with an inferred factor or threshold."*
    // ⛔ SO NOTHING HERE SCALES, EXTRAPOLATES, OR ESTIMATES THE UNREAD REMAINDER. A correction factor
    // would turn a measurement into a model, and the honest move for an incomplete look is to say it was
    // incomplete — which is 6e's whole logic, arriving one tier down.
    rootsAreLowerBound: truncated,
    clearsFloor: rooms.some((r) => r.clearsFloor),
    rooms,
  }
}

/**
 * ⭐⭐⭐ measureCandidates — every live slot label, both selectors, counts only.
 *
 * @returns {{minRoots, slots: object[], summary: object}}
 */
export async function measureCandidates({
  query, schema, minRoots = MIN_INDEPENDENT_ROOTS, maxTurnsPerSlot = 200,
} = {}) {
  if (typeof query !== 'function') throw new Error('measureCandidates requires a query(sql, params) function')
  if (!schema) throw new Error('measureCandidates requires a schema')
  const S = `"${schema}"`

  // ⭐ LIVE SLOTS ONLY. A superseded or expired slot is not something she currently holds, and asking
  // whether a belief she no longer holds recurs would measure the wrong question.
  const { rows: slots } = await query(
    `SELECT attribute, count(*)::int AS rows
       FROM ${S}."txn_memories"
      WHERE attribute IS NOT NULL AND attribute <> ''
        AND invalid_at IS NULL AND expired_at IS NULL AND contradicted_at IS NULL
      GROUP BY attribute ORDER BY attribute`)

  const out = []
  for (const s of slots) {
    const terms = probeTermsFor(s.attribute)
    if (!terms.length) {
      // ⛔ NOT A ZERO. A slot whose label yields no usable probe term was never asked the question, and
      // recording that as "no recurrence found" would be an absence claim the instrument did not earn —
      // 6e's logic at the slot level.
      out.push({ attribute: s.attribute, memoryRows: s.rows, terms: [], probed: false })
      continue
    }
    // eslint-disable-next-line no-await-in-loop
    const all = await countForSlot({ query, schema, attribute: s.attribute, terms, mode: 'all', minRoots, maxTurnsPerSlot })
    // eslint-disable-next-line no-await-in-loop
    const any = await countForSlot({ query, schema, attribute: s.attribute, terms, mode: 'any', minRoots, maxTurnsPerSlot })
    out.push({ attribute: s.attribute, memoryRows: s.rows, terms, probed: true, all, any })
  }

  const probed = out.filter((s) => s.probed)
  return {
    minRoots,
    maxTurnsPerSlot,
    slots: out,
    summary: {
      slotsTotal: out.length,
      slotsProbed: probed.length,
      // ⭐ Counted separately and NEVER folded into the zeros — see the `probed: false` note above.
      slotsUnprobeable: out.length - probed.length,
      clearsFloorAll: probed.filter((s) => s.all.clearsFloor).length,
      clearsFloorAny: probed.filter((s) => s.any.clearsFloor).length,
      truncatedSlots: probed.filter((s) => s.all.truncated || s.any.truncated).length,
      // ⭐⭐ THE FLOOR-CLEARING COUNTS ARE THEMSELVES LOWER BOUNDS where a slot was truncated, and the
      // summary says which. ⛔ It does NOT quote a corrected figure: a reader who wants one number must
      // be told the number is a floor, not handed an estimate that hides its own incompleteness.
      clearsFloorAllTruncated: probed.filter((s) => s.all.clearsFloor && s.all.rootsAreLowerBound).length,
      clearsFloorAnyTruncated: probed.filter((s) => s.any.clearsFloor && s.any.rootsAreLowerBound).length,
    },
  }
}

/** ⛔ Exported so a check can assert the INTENT, not merely the counting. */
export const M1F_COUNTS_AND_KEEPS_NOTHING =
  'This asks whether the things Sotera already holds a slot for recur across independent conversation '
  + 'roots, and answers with numbers. It persists nothing -- no memory, no commitment, no proposal, not '
  + 'even a pass row -- makes no model call, invents no proposition form, and lets no sentence anybody '
  + 'said leave the module. Every read goes through the evidence predicate evaluated at read time, never '
  + 'through a materialized index, so material excluded from evidence cannot become a candidate. Two '
  + 'selectors are reported rather than one, because a single number would hide how much of the answer '
  + 'is the corpus and how much is the selector.'
