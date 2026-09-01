// ⭐⭐⭐ THE DREAMING PASS LEDGER — an EXECUTION ledger for a look, which is not an outcome store.
//
// M1 · step 1. ⛔ NOT WIRED. Nothing imports this yet; it creates no table by itself, and the DDL below
// is a pure string that only a test runs. ⛔ No production schema, no migration, no activation.
//
// ── ⭐⭐ WHY A PASS LEDGER AT ALL (O-4) ────────────────────────────────────────────────────────────
// The five outcomes split on whether they have a SUBJECT:
//   6a (the withheld set) · 6b · 6c (a formulated claim)  → have one
//   6d · 6e                                               → ⛔ have NONE
// ⇒ 6d and 6e cannot be recorded as a CLAIM. But they can be recorded as an EVENT, because
//
//     ⭐⭐⭐ A PASS HAS AN IDENTITY EVEN WHEN ITS CONCLUSION HAS NO SUBJECT.
//
// Reflection's own ledger manages exactly this — it records "a pass ran and concluded nothing" 72 times,
// keyed on (conversation, range). ⇒ what Dreaming lacked was an EXECUTION LEDGER, ⛔ not an outcome store.
//
// ── ⛔⛔ AND THE DEFECT IT MUST NOT INHERIT ────────────────────────────────────────────────────────
// `log_conversation_revisits.outcome` answers "did the run finish?" — `completed` 77 / `failed` 1 — and
// ⓘ **72 of the 77 `completed` wrote nothing**, so 93.5% of every act ever recorded collapses into one
// undifferentiated value. ⇒ ⭐ **EXECUTION AND CONCLUSION GET SEPARATE COLUMNS HERE.** `run_state` says
// whether the pass finished; `outcome` says what it concluded; ⛔ neither is ever inferred from the other.
//
// ── ⭐⭐⭐ THE GUARD, AND WHY IT IS STRONGER THAN THE PLAN SAID ───────────────────────────────────
// The plan wrote `AND outcome IS NULL` on every update. ⚠️ That is not sufficient, and the O-5b analysis
// is why: a pass that FAILS never sets an outcome, so `outcome IS NULL` would still let a late completion
// overwrite a terminal failure — the exact hole measured in the reflection ledger, rebuilt on day one.
// ⇒ ⭐ **the guard is `AND completed_at IS NULL`**, which is the honest "not yet terminal" predicate and
// strictly covers the other. ⓘ Stated as a deliberate strengthening, ⛔ not a silent deviation.

import {
  OUTCOMES, COMPLETENESS, completeness as computeCompleteness, mayConclude,
} from './dreaming-outcome.js'

/** ⭐ The run's EXECUTION states. ⛔ Disjoint from the outcome vocabulary, on purpose. */
export const RUN_STATE = Object.freeze({ ran: 'ran', failed: 'failed', preempted: 'preempted' })
export const RUN_STATES = Object.freeze(Object.values(RUN_STATE))

/**
 * ⭐ ONE definition of the table, so a test schema and a future migration cannot drift apart.
 * ⛔ This function CREATES NOTHING. It returns SQL; only a caller that executes it creates anything.
 */
export function passLedgerDdl(schema) {
  const t = `"${schema}"."log_dreaming_passes"`
  return `
CREATE TABLE IF NOT EXISTS ${t} (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rolling_id               bigint GENERATED ALWAYS AS IDENTITY,
  created_at               timestamptz NOT NULL DEFAULT now(),
  started_at               timestamptz,
  completed_at             timestamptz,
  -- ⭐ EXECUTION. NULL means in flight. Never conflated with the conclusion below.
  run_state                text CHECK (run_state IN ('ran','failed','preempted')),
  failure                  text,
  -- ⭐ CONCLUSION. Exactly one of 6a-6e, and NULL while in flight or if the run failed.
  outcome                  text CHECK (outcome IN ('6a','6b','6c','6d','6e')),
  outcome_why              text,
  -- ⭐⭐ THE COMPLETENESS CONTRACT. withheld is stored BESIDE M, because M = admitted + withheld and a
  -- ledger that dropped it would make 6a indistinguishable from 6d after the fact.
  m_count                  integer,
  n_count                  integer,
  withheld_count           integer,
  completeness             text CHECK (completeness IN ('exhaustive','bounded','unknown')),
  -- ⭐ E3 IS NOT STABLE ACROSS READS, so the moment it was evaluated is part of the record.
  eligibility_evaluated_at timestamptz,
  -- ⭐ The boundary as it stood, so a later reader can still tell a 6a from a 6d after a release.
  boundary                 jsonb,
  -- ⛔ IDENTITIES ONLY, NEVER CONTENT.
  rejected_ids             text[]
);
COMMENT ON TABLE ${t} IS
 'One row per Dreaming PASS. An execution ledger, not an outcome store and not a commitment: a pass has an identity even when its conclusion has no subject, which is how 6d and 6e get recorded at all. run_state says whether the run finished; outcome says what it concluded; they are separate columns because the reflection ledger conflated them and 93.5% of its acts collapsed into one value. No admissibility flag lives here -- E3 is computed at read time. Nothing in this table is a memory, is returned by a memory read, or counts toward anything she remembers.';
`
}

/** ⛔ Identities only. A rejected item is named, never quoted — clause 7, enforced rather than trusted. */
function assertIdentities(ids) {
  for (const id of ids ?? []) {
    const s = String(id ?? '')
    if (!s || s.length > 64 || /\s/.test(s)) {
      throw new Error(`refused: rejected_ids takes identities, never content (got ${s.length} chars`
        + `${/\s/.test(s) ? ' with whitespace' : ''})`)
    }
  }
  return true
}

/**
 * buildPassLedger — the writer. `query` is INJECTED, so this runs identically against a test schema, a
 * migration-created table, or a harness. ⛔ It never opens a connection and never picks a schema.
 *
 * @param {object} deps
 * @param {(sql: string, params?: any[]) => Promise<{rows: any[]}>} deps.query
 * @param {string} deps.schema
 * @param {() => Date} [deps.now]
 */
export function buildPassLedger({ query, schema, now = () => new Date() } = {}) {
  if (typeof query !== 'function') throw new Error('buildPassLedger requires a query(sql, params) function')
  if (!schema) throw new Error('buildPassLedger requires a schema')
  const T = `"${schema}"."log_dreaming_passes"`

  /** ⭐ Open a pass. In flight: run_state NULL, outcome NULL, completed_at NULL. */
  async function claim({ startedAt = null } = {}) {
    const { rows } = await query(
      `INSERT INTO ${T} (created_at, started_at) VALUES ($1, $2)
       RETURNING id::text AS id, rolling_id`,
      [now(), startedAt ?? now()])
    return rows[0]
  }

  /**
   * ⭐⭐ Conclude a pass. Refuses an outcome the completeness contract does not permit — ⛔ the gate is
   * HERE, at the write, not in the caller, for the same reason the store's three gates are in `create()`:
   * put the rule in a caller and the next caller is written without it.
   */
  async function conclude({
    id, outcome, why = '', M, N = null, withheld = 0,
    evaluatedAt = null, boundary = null, rejectedIds = [],
  } = {}) {
    if (!id) throw new Error('conclude requires the claimed pass id')
    if (!OUTCOMES.includes(outcome)) throw new Error(`refused: ${outcome} is not one of ${OUTCOMES.join(' ')}`)
    assertIdentities(rejectedIds)
    const comp = computeCompleteness({ M, N })
    // ⛔⛔ 6b AND 6d ASSERT AN ABSENCE, AND AN INCOMPLETE LOOK CANNOT ESTABLISH ONE.
    const permitted = mayConclude(outcome, comp.kind)
    if (!permitted.ok) throw new Error(`refused: ${permitted.why}`)
    // ⛔ AND THE ORDERING CONSTRAINT, ENFORCED RATHER THAN DOCUMENTED: withheld must be counted within M.
    if (Number.isInteger(M) && withheld > M) {
      throw new Error(`refused: withheld ${withheld} exceeds M ${M} — withheld is counted WITHIN the eligible population`)
    }
    if (outcome === '6d' && withheld > 0) {
      throw new Error('refused: 6d says nothing exists, and something was withheld — that is 6a')
    }
    const { rows } = await query(
      // ⭐⭐⭐ `completed_at IS NULL` — the honest "not yet terminal" guard. A concluded OR failed pass is
      // never rewritten; the reflection ledger's completion write matches on id alone and can.
      `UPDATE ${T}
          SET run_state = 'ran', outcome = $2, outcome_why = $3,
              m_count = $4, n_count = $5, withheld_count = $6, completeness = $7,
              eligibility_evaluated_at = $8, boundary = $9::jsonb, rejected_ids = $10::text[],
              completed_at = $11
        WHERE id = $1::uuid AND completed_at IS NULL
        RETURNING id::text AS id, outcome, completeness`,
      [id, outcome, String(why).slice(0, 2000), M ?? null, N, withheld, comp.kind,
        evaluatedAt, boundary ? JSON.stringify(boundary) : null, rejectedIds ?? [], now()])
    // ⛔ NO ROW MEANS THE PASS HAD ALREADY TERMINATED. That is not a success, and it is not a crash —
    // it is a refusal with a name, so a caller cannot read "0 rows" as "written".
    return rows[0] ?? { refused: true, why: 'the pass had already terminated — a concluded act is never rewritten' }
  }

  /** ⭐ Terminate without concluding. ⛔ `outcome` stays NULL: a failed run did not conclude anything. */
  async function fail({ id, failure = 'unknown', preempted = false } = {}) {
    if (!id) throw new Error('fail requires the claimed pass id')
    const { rows } = await query(
      `UPDATE ${T} SET run_state = $2, failure = $3, completed_at = $4
        WHERE id = $1::uuid AND completed_at IS NULL
        RETURNING id::text AS id, run_state`,
      [id, preempted ? RUN_STATE.preempted : RUN_STATE.failed, String(failure).slice(0, 2000), now()])
    return rows[0] ?? { refused: true, why: 'the pass had already terminated' }
  }

  async function read(id) {
    const { rows } = await query(`SELECT * FROM ${T} WHERE id = $1::uuid`, [id])
    return rows[0] ?? null
  }

  return { claim, conclude, fail, read, table: T }
}

/** ⛔ Exported so a check can assert the INTENT, not merely the columns. */
export const A_PASS_IS_NOT_A_COMMITMENT =
  'One row per Dreaming pass. It records that a look happened, over how much, reaching how far, at what '
  + 'moment, and what it concluded. It is an execution ledger: a pass has an identity even when its '
  + 'conclusion has no subject, which is the only reason 6d and 6e can be recorded at all. It is not a '
  + 'memory, it is never returned by a memory read, and it counts toward nothing she remembers. Execution '
  + 'and conclusion are separate columns because the ledger that came before conflated them, and a '
  + 'terminated pass is never rewritten.'

export { COMPLETENESS }
