// PROTECT REAL RELATIONAL RECORDS FROM TESTS.
//
// ⚠️ TWO FAILURES, ONE DAY, SAME TABLE — and the second was caused by the fix for the first.
//
//  1. Cleanups deleted by `subject_person_id = Kavi` and by `deriver_version = 'stance-writer-0.1'`
//     (the REAL deriver), so running the suite WIPED Sotera's first genuine relational memory minutes
//     after the controlled activation created it. Same shape as memory-lifecycle-check wiping
//     agent_dev's real memories: a cleanup predicate that also matches production data.
//
//  2. The fix — snapshot row ids, delete only NEW ids — stopped the deletion and MISSED THE MUTATION.
//     The write tests upsert on `(subject, tier, label)`, so a test writing the same label for the same
//     person UPDATES the real row instead of inserting one. No new id appears, cleanup finds nothing to
//     do, and the real record silently carries the test's `conversation_count` and window. It did:
//     Sotera then reported a window ending 2026-08-20 to a user, from a test fixture.
//
// ⭐ THE LESSON: "delete what I created" is not enough for an UPSERT table. The invariant has to be
// **"leave the table exactly as I found it"** — which means restoring CONTENT, not just removing rows.

const COLS = 'id::text, subject_person_id::text AS sp, tier::text, label::text, conversation_count, window_start::date::text AS ws, window_end::date::text AS we'

/**
 * Snapshot every relational record before a test runs.
 * @returns {Promise<{rows: Map<string, object>}>}
 */
export async function snapshotRelational(Q) {
  const rows = await Q(`SELECT ${COLS} FROM persona_sotera.txn_relational_records`)
  return { rows: new Map(rows.map((r) => [r.id, r])) }
}

/**
 * Restore the table to the snapshot: delete rows the test added, and undo any mutation of rows that
 * already existed. Returns what it had to undo, so a test can ASSERT it changed nothing unexpectedly.
 */
export async function restoreRelational(Q, X, snap) {
  const now = await Q(`SELECT ${COLS} FROM persona_sotera.txn_relational_records`)
  const added = now.filter((r) => !snap.rows.has(r.id)).map((r) => r.id)
  if (added.length) await X('DELETE FROM persona_sotera.txn_relational_records WHERE id IN (:ids)', { ids: added })

  const mutated = []
  for (const r of now) {
    const was = snap.rows.get(r.id)
    if (!was) continue
    if (r.conversation_count !== was.conversation_count || r.ws !== was.ws || r.we !== was.we) {
      mutated.push(r.id)
      await X(
        `UPDATE persona_sotera.txn_relational_records
            SET conversation_count = :n, window_start = :ws, window_end = :we, updated_at = now()
          WHERE id = :id`,
        { id: was.id, n: was.conversation_count, ws: was.ws, we: was.we },
      )
    }
  }
  return { deleted: added.length, restored: mutated.length }
}
