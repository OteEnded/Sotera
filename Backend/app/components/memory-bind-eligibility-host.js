// ⭐⭐⭐ BIND ELIGIBILITY — which slots may be governed, computed from the corpus. ⛔ READ-ONLY.
//
// Ote, 2026-09-04: *"Eligibility should be observed continuously rather than remembered."*
//
// ── ⭐⭐ THE RATIFIED CONTAINMENT RULE, IN ONE PLACE ────────────────────────────────────────────────
//     A slot may be bound only if EVERY writer that has ever superseded a row in it can declare a claim
//     kind AND name an occasion.
// ⛔ *"that subsystem probably won't touch it"* is not evidence. The slot's own write history is, and it
// is queryable — which is why this is a function and not a checklist.
//
// ⚠️ IT LIVES HERE, NOT IN THE MAINTENANCE SCRIPT, BECAUSE THERE MUST BE ONE DEFINITION. The cron pass and
// the human-facing audit both call this; two copies of a rule are two rules, and the one nobody reruns is
// the one that goes stale.
//
// ── ⭐ WHY IT RIDES THE SAME PASS AS THE MEMORY LINT ───────────────────────────────────────────────
// Ote, 2026-08-24, on that lint: *"We shouldn't have to discover memory-integrity violations accidentally
// while investigating something else."* ⇒ the same applies to a slot that QUIETLY BECOMES eligible: it
// should announce itself, ⛔ not wait for somebody to think of looking.

/**
 * ⭐⭐ WHICH WRITERS CAN DECLARE A CLAIM KIND AND NAME AN OCCASION — as of 2026-09-04.
 *
 * ⛔ A source is DISQUALIFYING unless it is known-capable. Failing closed is the point: a writer nobody
 * has classified is a writer nobody has checked.
 *
 *   model-tool   ⭐ `keep` / `remember_fact` — gained `claimKind` 2026-09-04, proved through `runTool`
 *   null         ⭐ an operator act — names its own kind and its own occasion
 *   conversation:*  ⛔ THE AUTO-EXTRACTOR. It infers facts from prose and has no basis for naming a
 *                   declared question. ⚠️ Ote ruled it must NOT be modified to fit M2: its inability is
 *                   a real architectural boundary, and on `timezone` its supersede genuinely IMPROVED
 *                   the slot — governing that away would be a behavioural narrowing, not a safety gate.
 *   reconcile:*  ⛔ a migration writer; Rome is a fence
 *   doc:*        ⛔ document ingest — ⓘ it has never superseded anything, but it is not capable either
 */
export const CAPABLE_SOURCE = (source) => source === null || source === 'model-tool'

/**
 * ⭐ SLOTS ALREADY ADJUDICATED — recorded so a settled question is not re-asked every night.
 *
 * ⚠️ THIS IS NOT AN ALLOWLIST AND GRANTS NOTHING. It only suppresses the *notification* for a slot whose
 * eligibility Ote has already ruled on. ⛔ A slot here is still not bound; binding remains a deliberate,
 * separately approved act.
 * ⭐ Each entry carries the DATE and the REASON, because an absence asserted with no date is exactly the
 * defect this project keeps paying for.
 */
export const ADJUDICATED = Object.freeze({
  soteras_family_lineage_and_key_relationships:
    '2026-09-04 · Ote: not while its address is implicated in the existing family-lineage defect',
  core_commitments:
    "2026-09-04 · Ote: don't use Hermes's real data to manufacture an experiment",
})

/**
 * ⭐⭐⭐ COMPUTE ELIGIBILITY FOR EVERY SLOT THAT HAS EVER BEEN SUPERSEDED.
 *
 * ⛔ Slots that have NEVER been superseded are not listed at all: only an UPDATE is governed, so binding
 * one would be governance with nothing to govern. ⓘ 76 of 82 slots were in that state on 2026-09-04.
 *
 * @param {object} db  the models bag (needs `db.txn_memories.sequelize` + a schema)
 * @returns {Promise<{ok:boolean, bound:number, eligible:object[], excluded:object[], adjudicated:object[], error?:string}>}
 */
export async function bindEligibility(db) {
  try {
    const seq = db?.txn_memories?.sequelize
    const { schema } = db?.txn_memories?.getTableName?.() ?? {}
    if (!seq || !schema) return { ok: false, bound: 0, eligible: [], excluded: [], adjudicated: [], error: 'no store' }
    const S = `"${schema}"`
    const rows = await seq.query(
      `SELECT s.id::text AS id, s.canonical_label AS label, s.entity, s.namespace,
              (s.question_id IS NOT NULL) AS bound,
              count(*) FILTER (WHERE m.supersedes_id IS NOT NULL)::int AS supersedes,
              array_remove(array_agg(DISTINCT CASE WHEN m.supersedes_id IS NOT NULL
                  THEN coalesce(m.source, '(operator)') END), NULL) AS writers
         FROM ${S}."mst_slots" s
         JOIN ${S}."txn_memories" m ON m.slot_id = s.id
        GROUP BY s.id, s.canonical_label, s.entity, s.namespace
       HAVING count(*) FILTER (WHERE m.supersedes_id IS NOT NULL) > 0`,
      { type: seq.QueryTypes.SELECT, logging: false })

    const eligible = []; const excluded = []; const adjudicated = []
    let bound = 0
    for (const r of rows) {
      if (r.bound) { bound += 1; continue }
      // ⭐ `(operator)` is the label the SQL gives a NULL source; map it back before testing capability.
      const blockers = (r.writers ?? []).filter((w) => !CAPABLE_SOURCE(w === '(operator)' ? null : w))
      const entry = { id: r.id, label: r.label, entity: r.entity, namespace: r.namespace, supersedes: r.supersedes, writers: r.writers ?? [] }
      if (blockers.length) { excluded.push({ ...entry, blockers }); continue }
      if (Object.hasOwn(ADJUDICATED, r.label)) { adjudicated.push({ ...entry, ruling: ADJUDICATED[r.label] }); continue }
      eligible.push(entry)
    }
    return { ok: true, bound, eligible, excluded, adjudicated }
  } catch (e) {
    return { ok: false, bound: 0, eligible: [], excluded: [], adjudicated: [], error: e?.message || 'failed' }
  }
}

/**
 * ⭐ ONE LINE FOR A LOG. ⛔ Labels and counts only — ⛔ never a value, never a room, never content.
 * ⓘ A slot LABEL is an address, not a belief; the same thing `memory-lint` already reports.
 */
export function eligibilitySummaryLine(r) {
  if (!r?.ok) return `could not compute: ${r?.error ?? 'unknown'}`
  const names = r.eligible.map((e) => `${e.entity}/${e.label}`).join(', ')
  return `bound=${r.bound} NEWLY-ELIGIBLE=${r.eligible.length}${names ? ` [${names}]` : ''} `
    + `· excluded=${r.excluded.length} · already-ruled-on=${r.adjudicated.length}`
}

/** ⛔ Exported so a check can assert the INTENT, not merely the branching. */
export const ELIGIBILITY_IS_OBSERVED_NOT_REMEMBERED =
  'A slot becomes bind-eligible when its writers change, which happens without anyone deciding it should. '
  + 'So eligibility is computed from the corpus on every maintenance pass rather than recorded once: a '
  + 'slot that becomes eligible announces itself. Eligibility grants nothing — it says only that the '
  + 'containment rule would not refuse a bind, and binding remains a deliberate, separately approved act. '
  + 'Slots already ruled on are listed apart so a settled question is not re-asked nightly, and each '
  + 'carries the date and the reason it was settled.'
