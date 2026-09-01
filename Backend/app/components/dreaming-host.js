// ⭐⭐ DREAMING · ONE PASS — M1: THE INSTRUMENT, NOT THE REASONER.
//
// ⛔⛔ M1 CANNOT COMMIT. This module reads, counts, concludes, and writes ONE pass row. It creates no
// memory, marks no lifecycle state, calls no model, and touches nothing else. That is deliberate:
// ⭐ every remaining semantic uncertainty is UNREACHABLE here BY CONSTRUCTION — it reads no prior
// commitments, cites nothing, and refuses rather than defaulting a room — so it cannot resolve an open
// question by accident, because it cannot act on one.
//
// ⛔ NOT WIRED. Nothing in the running app imports this. No cron entry, no route, no setting.
//
// ── ⭐ WHAT ONE PASS DOES ────────────────────────────────────────────────────────────────────────
//   ① claim a pass row (in flight: no run_state, no outcome, no completed_at)
//   ② enumerate the ELIGIBLE POPULATION — every reflection act record joined to its conversation.
//      ⭐ This is M, and it is a VIEW fact counted BEFORE any retrieval.
//   ③ partition it by E3 → admitted + withheld. ⛔ withheld is COUNTED, never pre-filtered away.
//   ④ N = what the instrument actually reached. ⚠️ MEASURED from the rows that came back, ⛔ never set
//      equal to M by construction — a retrieval that assumed it reached everything would make the
//      completeness contract vacuous.
//   ⑤ conclude one of 6a-6e and write it. ⛔ The ledger refuses a conclusion the counts do not permit.
//
// ── ⛔ WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────────
// ⛔ No DRI, no vector search, no index: M1's retrieval arm is a plain read, which genuinely reaches
//    everything it is given — so `exhaustive` here is EARNED, not assumed.
// ⛔ No model call. A pass that formulates no claim can only reach 6a / 6d / 6e, and that is the
//    honest ceiling for an instrument with no reasoner.
// ⛔ No commitment, no `redundant`, no `contradicted`, no withdrawal.

import { partitionByE3 } from './dreaming-eligibility.js'
import { OUTCOME } from './dreaming-outcome.js'
import { buildPassLedger } from './dreaming-pass-host.js'

/**
 * runOnePass — one Dreaming look over the reflection act corpus.
 *
 * @param {object} deps
 * @param {(sql: string, params?: any[]) => Promise<{rows: any[]}>} deps.query
 * @param {string} deps.schema
 * @param {boolean} [deps.dryRun]  ⛔ true means: conclude and record the pass, and do NOTHING else.
 *                                 ⭐ In M1 there IS nothing else, so `dryRun` is currently the only mode
 *                                 — it is named now so that M2 cannot quietly acquire a second one.
 * @param {() => Date} [deps.now]
 */
export async function runOnePass({ query, schema, dryRun = true, now = () => new Date() } = {}) {
  if (typeof query !== 'function') throw new Error('runOnePass requires a query(sql, params) function')
  if (!schema) throw new Error('runOnePass requires a schema')
  if (dryRun !== true) {
    // ⛔ M1 HAS NO OTHER MODE, AND SAYS SO RATHER THAN SILENTLY BEHAVING AS IF IT DID.
    throw new Error('refused: M1 runs dryRun only — it cannot commit, and a non-dry run has nothing to do')
  }
  const S = `"${schema}"`
  const ledger = buildPassLedger({ query, schema, now })
  const startedAt = now()
  const pass = await ledger.claim({ startedAt })

  try {
    // ── ② + ④ · THE ELIGIBLE POPULATION, AND WHAT THE INSTRUMENT REACHED ────────────────────────
    // ⭐ M is counted over the JOIN, independently of the rows fetched, so N can differ from it and be
    // seen to differ. ⛔ If both came from one query, N < M would be unobservable by construction.
    const { rows: mRows } = await query(
      `SELECT count(*)::int AS m
         FROM ${S}."log_conversation_revisits" r
         JOIN ${S}."txn_conversations" c ON c.id = r.conversation_id`)
    const M = mRows[0]?.m ?? 0

    const { rows: fetched } = await query(
      `SELECT r.id::text AS act_id, r.rolling_id, r.conversation_id::text AS conversation_id,
              c.id::text AS c_id, c.incognito, c.excluded_from_evidence_at
         FROM ${S}."log_conversation_revisits" r
         JOIN ${S}."txn_conversations" c ON c.id = r.conversation_id
        ORDER BY r.rolling_id`)
    // ⭐ N IS MEASURED — the count of what actually came back.
    const N = fetched.length

    // ── ③ · E3, AND WITHHELD IS COUNTED ─────────────────────────────────────────────────────────
    const part = partitionByE3(fetched.map((row) => ({
      act: { id: row.act_id, rolling_id: row.rolling_id, conversation_id: row.conversation_id },
      conversation: {
        id: row.c_id, incognito: row.incognito, excluded_from_evidence_at: row.excluded_from_evidence_at,
      },
    })), { now })

    // ── The boundary as it stood, so a later reader can tell a 6a from a 6d after a release ──────
    const { rows: bRows } = await query(
      `SELECT count(*)::int AS excluded, max(excluded_from_evidence_at) AS latest
         FROM ${S}."txn_conversations" WHERE excluded_from_evidence_at IS NOT NULL`)
    const boundary = { excludedConversations: bRows[0]?.excluded ?? 0, latestExclusionAt: bRows[0]?.latest ?? null }

    // ── ⑤ · CONCLUDE ────────────────────────────────────────────────────────────────────────────
    // ⭐⭐ M1 formulates no claim, so it can only honestly reach:
    //     N < M or unreported ⇒ 6e   ·   withheld > 0 ⇒ 6a   ·   M == 0 ⇒ 6d
    // ⛔ It may NOT reach 6b (that asserts *nothing here supports a claim*, which requires having tried
    // to form one) and it may not reach 6c (a judgement). ⭐ Stating the ceiling is the honest move: an
    // instrument with no reasoner must not borrow a reasoner's conclusions.
    const withheld = part.withheld.length
    let outcome; let why
    if (N < M) {
      outcome = OUTCOME.instrument; why = `bounded(${N} of ${M}) — the look was incomplete`
    } else if (withheld > 0) {
      outcome = OUTCOME.notAdmissible
      why = `${withheld} of ${M} withheld by the boundary — the material exists and may not be used`
    } else if (M === 0) {
      outcome = OUTCOME.nothingDurable; why = 'the eligible population is empty and nothing was withheld'
    } else {
      // ⭐ Everything admitted, nothing withheld, and no claim was attempted. That is 6e, ⛔ not 6d:
      // "I did not try to form a claim" is an INSTRUMENT limit, and calling it "nothing durable exists"
      // would be an absence claim this pass has not earned.
      outcome = OUTCOME.instrument
      why = `${M} admitted, nothing withheld — and this pass formulates no claim, so no absence may be concluded`
    }

    const written = await ledger.conclude({
      id: pass.id, outcome, why, M, N, withheld,
      evaluatedAt: part.evaluatedAt, boundary,
      rejectedIds: part.withheld.map((w) => w.act.id),
    })
    return {
      ok: true, dryRun, passId: pass.id, rollingId: pass.rolling_id,
      M, N, withheld, admitted: part.admitted.length, outcome, why, boundary,
      evaluatedAt: part.evaluatedAt, written,
      withheldActs: part.withheld.map((w) => ({ id: w.act.id, rolling_id: w.act.rolling_id })),
    }
  } catch (e) {
    // ⛔ A PASS THAT THROWS MUST STILL TERMINATE ITS OWN ROW. An in-flight row left open forever is how a
    // lane goes silent for exactly the runs that fail — the trap the reflection ledger already paid for.
    await ledger.fail({ id: pass.id, failure: e.message }).catch(() => {})
    throw e
  }
}
