// PROTECT REAL INTENTIONS FROM TESTS.
//
// ⚠️ Written BEFORE the first intention test ran, not after it broke something — because the same table
// class has already cost us twice in one day (see lib/relational-fixtures.mjs for the full account).
// The invariant is not "delete what I created". It is **"leave the table exactly as I found it"**, which
// means restoring CONTENT: this store is mutated in place by update_intention and close_intention, so a
// test that only removes its own inserts would leave a real intention carrying a test's progress note —
// and she would then tell someone she was working on it.
//
// ⚠️ AND THE SUBJECT MATTERS AS MUCH AS THE CLEANUP. Tests here run against **agent_dev**'s person, the
// designated test identity. Never Kavi (the observation account, deliberately accumulating), never Ote,
// never Hermes.

const COLS = [
  'id::text',
  'person_id::text AS person_id',
  'intent', 'why', 'progress', 'outcome',
  'state::text AS state',
  'next_review_at',
  'closed_at',
  'writer_version',
].join(', ')

/** Snapshot every intention before a test runs. */
export async function snapshotIntentions(Q) {
  const rows = await Q(`SELECT ${COLS} FROM persona_sotera.txn_intentions`)
  return { rows: new Map(rows.map((r) => [r.id, r])) }
}

/**
 * Restore the table to the snapshot: delete rows the test added, and undo any mutation of rows that
 * were already there. Returns what it had to undo so a test can ASSERT it disturbed nothing.
 */
export async function restoreIntentions(Q, X, snap) {
  const now = await Q(`SELECT ${COLS} FROM persona_sotera.txn_intentions`)
  const added = now.filter((r) => !snap.rows.has(r.id)).map((r) => r.id)
  // ⚠️ Delete BEFORE restoring state, not after: the partial unique index allows only one open row per
  // person, so re-opening a snapshotted row while a test's open row still exists would fail the restore
  // and leave the real data changed — a cleanup that cannot run is worse than no cleanup.
  if (added.length) await X('DELETE FROM persona_sotera.txn_intentions WHERE id IN (:ids)', { ids: added })

  const same = (a, b) => (a === null || a === undefined ? null : String(a)) === (b === null || b === undefined ? null : String(b))
  const mutated = []
  for (const r of now) {
    const was = snap.rows.get(r.id)
    if (!was) continue
    const changed = ['intent', 'why', 'progress', 'outcome', 'state', 'next_review_at', 'closed_at']
      .some((k) => !same(r[k], was[k]))
    if (!changed) continue
    mutated.push(r.id)
    await X(
      `UPDATE persona_sotera.txn_intentions
          SET intent = :intent, why = :why, progress = :progress, outcome = :outcome,
              state = :state::persona_sotera.intention_state,
              next_review_at = :nra, closed_at = :closed
        WHERE id = :id`,
      {
        id: was.id,
        intent: was.intent,
        why: was.why ?? null,
        progress: was.progress ?? null,
        outcome: was.outcome ?? null,
        state: was.state,
        nra: was.next_review_at ?? null,
        closed: was.closed_at ?? null,
      },
    )
  }
  return { deleted: added.length, restored: mutated.length }
}
