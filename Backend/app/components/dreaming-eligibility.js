// ⭐⭐⭐ DREAMING ELIGIBILITY — may Dreaming consume this ACT RECORD as corpus?
//
// PURE. No stores, no IO, no config. One predicate, one place — the same discipline as
// `corpus-eligibility.js`, `memory-ownership.js` and `memory-self-state-claim.js`: this file holds the
// JUDGEMENT and none of the enforcement.
//
// ── ⭐⭐ E3, LOCKED 2026-08-29 ─────────────────────────────────────────────────────────────────────
//
//     An act record may be consumed as corpus ONLY when the material it rests on is CURRENTLY
//     admissible. E3 is COMPUTED AT READ TIME — ⛔ never stored, never written onto the act record.
//
// ⭐ It requires no new information. It is a traversal over links that already exist:
//
//     log_conversation_revisits.conversation_id → txn_conversations.excluded_from_evidence_at / incognito
//
// ⛔ AND IT MUST NOT BE STORED, for two independent reasons:
//   ① exclusion is REVERSIBLE (the column is nullable) ⇒ a stored flag is wrong the moment it is
//     released, with nothing to go back and correct it;
//   ② writing a flag onto an act record MUTATES AN AUDIT RECORD — and a record of an act is immutable
//     because the act happened.
// ⇒ eligibility is EVALUATED, never stamped. E3 is that rule one level up.
//
// ── ⛔⛔ Q2 · CONSUMER-SCOPED ONLY. THIS IS THE PART THAT BITES ────────────────────────────────────
// E3 governs CONSUMPTION AS CORPUS and nothing else. ⛔ It must NEVER be applied to:
//   · the AUDIT read (`memory-lint-host`) — audit is a SOURCE, and a View decides admission per
//     consumer; an E3-filtered lint stops seeing exactly the rows most worth auditing;
//   · the REFLECTION CURSOR (`max(up_to_rolling_id)`) — ⭐⭐⭐ if an act record stopped counting because
//     its conversation was later excluded, THE WATERMARK WOULD REWIND and the lane would re-review
//     already-reviewed messages. That is the elision defect arriving disguised as a boundary
//     IMPROVEMENT, which is the worst disguise a regression can wear.
// ⓘ `test/checks/dreaming-baseline-check.mjs §4` asserts both of those reads stay UNFILTERED, so this
// comment is enforced rather than merely written.
//
// ── ⚠️ Q1 · SOUND, NOT COMPLETE — stated here because a reader must not over-trust it ─────────────
// E3 establishes the admissibility of what an act was ABOUT. ⛔ It CANNOT establish everything the act
// REACHED: the reflection lane carries read tools, and the ledger records tool NAMES, never tool
// RESULTS. ⓘ Measured 2026-08-29: 5 of 78 act records used a read tool, 2 used `search_conversations`.
// ⭐ The gap is narrowed by those tools running through `conversation-search`, which already applies the
// evidence predicate — so it is only exclusion applied AFTER the act — and ⛔ it is not recoverable from
// current data.

// ⭐ REUSED, NOT RESPELLED. The evidence predicate has one owner; a second spelling of the same clause
// is how a boundary becomes a habit. E3 is a JOIN over that predicate, not a new predicate.
import { evidentialSql, EVIDENTIAL_WHERE, isEvidential } from './corpus-eligibility.js'

/**
 * ⭐ The SQL fragment for a CORPUS read over act records. Aliased so each call site reads naturally.
 * ⛔ Requires the caller to have joined the conversation — E3 is a traversal, and a predicate that
 * pretended it could answer from the act record alone would be the stored flag this rule forbids.
 */
export const e3Sql = (conv = 'c') => evidentialSql(conv)

/** ⭐ The Sequelize fragment, spread into a `where` on the JOINED conversation. */
export const E3_WHERE = EVIDENTIAL_WHERE

/**
 * ⭐ May this act record be consumed as corpus? Single-row form, for the paths that already hold both.
 * @param {object|null} act   the act record (`log_conversation_revisits` row)
 * @param {object|null} conversation  the conversation it rests on
 * @returns {{admissible: boolean, why: string}}
 */
export function isAdmissibleActRecord(act, conversation) {
  if (!act) return { admissible: false, why: 'no act record' }
  // ⛔ A MISSING CONVERSATION IS NOT AN ADMISSION. The act rests on material we cannot evaluate, and
  // "I could not check" must never read the same as "I checked and it was fine" — that collapse is the
  // one this whole arc exists to prevent.
  if (!conversation) return { admissible: false, why: 'the material it rests on cannot be resolved' }
  if (act.conversation_id && conversation.id && act.conversation_id !== conversation.id) {
    return { admissible: false, why: 'the conversation supplied is not the one this act rests on' }
  }
  return isEvidential(conversation)
    ? { admissible: true, why: 'the material it rests on is currently admissible' }
    : { admissible: false, why: 'the material it rests on is not currently admissible' }
}

/**
 * ⭐⭐ Partition act records into what may be consumed and what is WITHHELD — and it returns BOTH.
 *
 * ⛔⛔ THIS SHAPE IS THE ORDERING CONSTRAINT, MADE MECHANICAL. E3-withheld material COUNTS toward
 * `withheld`; it must not disappear before M is established. A function that returned only the
 * admissible rows would make **6a** (*material exists and I am not allowed to use it*) indistinguishable
 * from **6d** (*no durable material exists*) — the exact collapse the five outcomes exist to prevent.
 *
 * @param {Array<{act: object, conversation: object|null}>} pairs
 * @returns {{M: number, admitted: object[], withheld: object[], evaluatedAt: Date}}
 */
export function partitionByE3(pairs = [], { now = () => new Date() } = {}) {
  const admitted = []
  const withheld = []
  for (const p of pairs ?? []) {
    const verdict = isAdmissibleActRecord(p?.act, p?.conversation ?? null)
    ;(verdict.admissible ? admitted : withheld).push({ act: p?.act, why: verdict.why })
  }
  return {
    // ⭐ M IS THE ELIGIBLE POPULATION — admitted PLUS withheld. It is a VIEW fact, counted before any
    // retrieval, and it is deliberately not `admitted.length`.
    M: admitted.length + withheld.length,
    admitted,
    withheld,
    // ⭐ E3 IS NOT STABLE ACROSS READS — exclusion is reversible, so M is a function of time. A consumer
    // that recorded "I considered N of M" recorded it AS OF A MOMENT, and the moment is part of the record.
    evaluatedAt: now(),
  }
}

/**
 * ⛔ A GUARD FOR THE RULE THIS FILE EXISTS TO KEEP: E3 is computed, never stamped.
 * If an act record ever arrives carrying an admissibility field, something stored what must be derived —
 * and it will be wrong the moment an exclusion is released. ⭐ Refuses loudly rather than trusting it.
 */
export function assertNotStamped(act) {
  const stamped = Object.keys(act ?? {}).filter((k) => /^(e3|admissib|excluded|withheld)/i.test(k))
  if (stamped.length) {
    throw new Error(`refused: an act record carries a stored admissibility field (${stamped.join(', ')}) `
      + '— E3 is computed at read time, never stored')
  }
  return true
}

/** ⛔ Exported so a check can assert the INTENT, not merely the filtering. */
export const E3_INTENT =
  'An act record may be consumed as corpus only while the material it rests on is currently admissible. '
  + 'The act itself stays durable, readable and auditable either way: E3 withholds it, it never erases it. '
  + 'It is computed at read time because exclusion is reversible and because writing the answer onto the '
  + 'act record would mutate an audit record. It governs consumption as corpus and nothing else -- never '
  + 'the audit read, and never the reflection cursor, whose watermark must not rewind.'
