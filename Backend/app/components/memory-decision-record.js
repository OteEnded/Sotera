// A DECISION IS NOT A MEMORY. Pure — no stores, no IO, no config.
//
// ⭐⭐⭐ THE MEASURED DEFECT, 2026-08-23. Reflection #111: she read the conversation, reasoned it through, and
// declined —
//     *"However, this doesn't seem worth storing as a durable memory… I'll decline to retain this.
//      Done. Nothing from that exchange needs to be carried forward into memory."*
// …and a `txn_memories` row was written. The WRITER is honest about it (`entity='sotera'`,
// `attribute='declined'`, `author='persona'`, with the reason in `evidence` and the conversation in
// `source`) — ⛔ but two CONSUMERS ignored the distinction:
//   · `reflections-read.mjs` counted it under **"retained something: 1"** (the true score was 0 of 47);
//   · `list_memories` returned it LIVE, so she read it back to Ote as one of four things she has stored.
//
// ⭐⭐ Ote's ruling: *"YES, keep it durable, but it is NOT a memory… 'I decided not to remember X' is an
// event in Sotera's cognitive history, not a memory of X. I don't want to delete the row simply because it
// isn't a retained memory — that would sacrifice exactly the auditability I want. **Please fix the
// consumers/semantics, rather than changing the underlying representation just to make the count look
// right.**"*
//
// ⇒ SO THIS FILE IS ONE PREDICATE IN ONE PLACE. ⛔ No migration, no new column, no deletion, and no change
// to how a decline is written — the representation was already right.
//
// ── ⭐ WHAT A DECLINE RECORD IS AND IS NOT ──────────────────────────────────────────────────────────
//   IS      an event in her cognitive history · durable · auditable · attributable to her (`author=persona`)
//           · timestamped · provenanced (`source`) · reasoned (`evidence.declineKind`)
//   IS NOT  a memory of the thing declined · returnable by a memory read · injectable into recall
//           · countable toward "what Sotera remembers"
//
// ⚠️ AND THE ASYMMETRY IS THE POINT: it must stay reachable for audit and reflection while being unreachable
// as a memory. A filter that removed the row would have satisfied the count and destroyed the audit — which
// is the mistake Ote named in advance.

/** ⭐ The two fields the writer sets, and the only ones this predicate may read. */
export const DECLINE_ENTITY = 'sotera'
export const DECLINE_ATTRIBUTE = 'declined'

/** ⛔ Exported so a check can assert the INTENT, not merely the filtering. */
export const A_DECISION_IS_NOT_A_MEMORY =
  'A decline record says "I decided not to remember X". It is an event in Sotera\'s cognitive history and '
  + 'it stays durable and auditable. It is not a memory of X: no memory read returns it, no recall injects '
  + 'it, and it counts toward nothing about what she remembers.';

/**
 * ⭐⭐ IS THIS ROW A RECORDED DECISION NOT TO RETAIN?
 *
 * ⛔ Reads exactly two fields, and both are set explicitly by the decline writer. ⚠️ It deliberately does NOT
 * infer from `author`, `importance`, `kind` or the content text: a heuristic here would eventually
 * misclassify a real memory as a decision, which is a far worse failure than the one being fixed.
 * ⓘ Tolerant of both snake_case rows and camelCase objects, because it is called on both.
 */
export function isDeclineRecord(row) {
  if (!row || typeof row !== 'object') return false
  const entity = row.entity ?? row.Entity ?? null
  const attribute = row.attribute ?? row.Attribute ?? null
  return entity === DECLINE_ENTITY && attribute === DECLINE_ATTRIBUTE
}

/** ⭐ The complement, named so call sites read as intent rather than as negation. */
export const isRetainedMemory = (row) => Boolean(row) && !isDeclineRecord(row)

/**
 * ⭐⭐⭐ SPLIT A MEMORY READ INTO WHAT SHE REMEMBERS AND WHAT SHE DECIDED NOT TO.
 *
 * ⛔ AND IT REPORTS THE SPLIT RATHER THAN PERFORMING IT SILENTLY. A filter nobody can see is how "I covered
 * everything" gets said about a filtered set — this project has paid for that twice. The caller gets both
 * halves and a count, so a debug line can say *"3 memories, 1 decision withheld"* instead of "3".
 *
 * @returns {{ memories: object[], decisions: object[], declined: number }}
 */
export function partitionMemoryRead(rows = []) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : []
  const decisions = list.filter(isDeclineRecord)
  return { memories: list.filter(isRetainedMemory), decisions, declined: decisions.length }
}

/**
 * ⓘ What a decline record says, for an AUDIT surface — never for her conversational context.
 * ⛔ Returns null for anything that is not a decline, so a caller cannot use it to describe a memory.
 */
export function describeDecision(row) {
  if (!isDeclineRecord(row)) return null
  let reason = null
  try {
    const e = typeof row.evidence === 'string' ? JSON.parse(row.evidence) : row.evidence
    reason = e?.meaning ?? e?.declineKind ?? null
  } catch { /* an unparseable evidence blob is a missing reason, not a failed audit */ }
  return {
    decision: 'declined',
    about: row.content ?? null,
    by: row.author ?? null,
    at: row.created_at ?? row.createdAt ?? null,
    from: row.source ?? null,
    reason,
  }
}
