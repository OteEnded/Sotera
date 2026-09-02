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
import { OUTCOME, concludeFrom } from './dreaming-outcome.js'
import { buildPassLedger } from './dreaming-pass-host.js'

/**
 * ⭐⭐ WHAT MAY BE INJECTED INTO `runOnePass`, DECLARED RATHER THAN INFERRED.
 *
 * ⚠️⚠️ THIS CONSTANT EXISTS BECAUSE A SOURCE REGEX LIED. M1's red-proof register tried to establish
 * *"the host can be handed a ledger, so this check cannot write to production"* with
 * `/ledger\s*=\s*buildPassLedger\(/` — which matched the host's own INTERNAL line, returned true, and
 * the check then wrote two real passes into the production series.
 *
 * ⇒ ⭐ a capability is now ASSERTED BY THE MODULE THAT HAS IT, not guessed from its text. A caller that
 * needs to know whether injection is supported reads this; ⛔ it does not pattern-match the source.
 */
export const RUN_ONE_PASS_DEPS = Object.freeze(['query', 'schema', 'ledger', 'limit', 'triggerSource', 'now'])

/**
 * ⭐ Adapt a Sequelize instance to the `query(sql, params) -> {rows}` shape this module injects.
 *
 * ⛔ It lives HERE, not in the cron plugin, so there is ONE spelling of it: an adapter copied into each
 * call site is how two callers end up with different parameter binding and only one of them is tested.
 * ⓘ `bind` + `$n` + `QueryTypes.SELECT` is the same idiom `reflection-lifecycle-host` uses for its own
 * `RETURNING` writes — ⛔ deliberately not a second convention.
 */
export const makeSequelizeQuery = (sequelize) => async (sql, params = []) => ({
  rows: await sequelize.query(sql, { bind: params, type: sequelize.QueryTypes.SELECT }),
})

/**
 * runOnePass — one Dreaming look over the reflection act corpus.
 *
 * @param {object} deps
 * @param {(sql: string, params?: any[]) => Promise<{rows: any[]}>} deps.query
 * @param {string} deps.schema  the schema the CORPUS is read from
 * @param {object} [deps.ledger]  ⭐ the pass ledger to write to. Defaults to one built on `schema`, so
 *        ordinary callers pass nothing — but ⭐⭐ **the corpus and the ledger are two different things
 *        with two different guarantees** (one is read-only material, the other is Dreaming's own and
 *        only write target), so the seam is real and not a testing hook. Injecting it lets a check read
 *        the LIVE corpus while writing to a throwaway ledger.
 * @param {number|null} [deps.limit]  ⭐ bound the read, so an INCOMPLETE look is reachable honestly and
 *        the completeness contract can be exercised against the real corpus instead of a fixture.
 *        ⛔ Not a performance knob: `null` means exhaustive, which is M1's normal mode.
 * @param {'cron'|'manual'|'check'|'legacy'} [deps.triggerSource]  ⛔ recorded on the pass row
 * @param {boolean} [deps.dryRun]  ⛔ true means: conclude and record the pass, and do NOTHING else.
 *                                 ⭐ In M1 there IS nothing else, so `dryRun` is currently the only mode
 *                                 — it is named now so that M2 cannot quietly acquire a second one.
 * @param {() => Date} [deps.now]
 */
export async function runOnePass({
  query, schema, ledger = null, limit = null, triggerSource = 'manual',
  dryRun = true, now = () => new Date(),
} = {}) {
  if (typeof query !== 'function') throw new Error('runOnePass requires a query(sql, params) function')
  if (!schema) throw new Error('runOnePass requires a schema')
  if (dryRun !== true) {
    // ⛔ M1 HAS NO OTHER MODE, AND SAYS SO RATHER THAN SILENTLY BEHAVING AS IF IT DID.
    throw new Error('refused: M1 runs dryRun only — it cannot commit, and a non-dry run has nothing to do')
  }
  if (limit !== null && !(Number.isInteger(limit) && limit > 0)) {
    throw new TypeError(`limit must be a positive integer or null (got ${JSON.stringify(limit)})`)
  }
  const S = `"${schema}"`
  const book = ledger ?? buildPassLedger({ query, schema, now })
  const startedAt = now()
  const pass = await book.claim({ startedAt, triggerSource })
  // ⛔⛔ A REFUSAL IS RETURNED, NEVER THROWN AND NEVER SWALLOWED. A scheduled lane that threw on a
  // concurrent tick would log an error for a correct decision; one that returned silently would read as
  // a completed pass. ⭐ Both wrong, and in opposite directions.
  if (pass?.refused) return { ok: false, refused: true, why: pass.why, triggerSource }

  try {
    // ── ② + ④ · THE ELIGIBLE POPULATION, AND WHAT THE INSTRUMENT REACHED ────────────────────────
    // ⭐ M is counted over the JOIN, independently of the rows fetched, so N can differ from it and be
    // seen to differ. ⛔ If both came from one query, N < M would be unobservable by construction.
    const { rows: mRows } = await query(
      `SELECT count(*)::int AS m
         FROM ${S}."log_conversation_revisits" r
         JOIN ${S}."txn_conversations" c ON c.id = r.conversation_id`)
    const M = mRows[0]?.m ?? 0

    // ⭐⭐ THE VIEW READ, AND IT IS TIMED. `view_read_us` accumulates the evidence O-iii.a needs —
    // ⛔ it is NOT a threshold and nothing reads it to decide anything (Ote: *"the 0.151 ms result is
    // evidence, not yet a policy number"*). Microseconds, because at this corpus size a millisecond
    // integer would store 0 for every pass and a measurement would be indistinguishable from its absence.
    const readStart = process.hrtime.bigint()
    const { rows: fetched } = await query(
      `SELECT r.id::text AS act_id, r.rolling_id, r.conversation_id::text AS conversation_id,
              c.id::text AS c_id, c.incognito, c.excluded_from_evidence_at
         FROM ${S}."log_conversation_revisits" r
         JOIN ${S}."txn_conversations" c ON c.id = r.conversation_id
        ORDER BY r.rolling_id${limit === null ? '' : ` LIMIT ${limit}`}`)
    const viewReadUs = Number((process.hrtime.bigint() - readStart) / 1000n)
    // ⭐ N IS MEASURED — the count of what actually came back.
    // ⛔⛔ NEVER `limit ?? M`, and never M itself. A bounded read that reported N = M would make the
    // completeness contract vacuous by construction, and `bounded(N of M)` would become unobservable.
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
    // ⭐⭐⭐ `concludeFrom()` OWNS THE ORDERING, AND THIS FILE DOES NOT RE-SPELL IT.
    //
    // ⚠️ It used to. The four arms were written out again here — completeness, then withheld, then the
    // null case — which is **a second spelling of the same clause**, the exact habit
    // `dreaming-eligibility` warns about one module away (*"a second spelling of the same clause is how
    // a boundary becomes a habit"*). Two copies of an ordering rule drift, and the drift is silent
    // because both look correct in isolation.
    //
    // ⭐ M1'S ONE LICENSED DEVIATION, AND IT IS A NARROWING, NEVER A WIDENING:
    //
    //     concludeFrom says 6b  ⇒  M1 says 6e
    //
    // 6b asserts *"nothing in the admissible material supports a standing commitment"* — which requires
    // having TRIED to form one. ⛔ M1 formulates no claim, so that absence is not its to assert. Calling
    // it 6e (*cannot establish what was examined*) is the honest ceiling for an instrument with no
    // reasoner. ⛔ And it may never reach 6c either, which is a judgement and not derivable from counts.
    const withheld = part.withheld.length
    const ordered = concludeFrom({ M, N, withheld })
    const narrowed = ordered.outcome === OUTCOME.insufficient
    const outcome = narrowed ? OUTCOME.instrument : ordered.outcome
    const why = narrowed
      ? `${M} admitted, nothing withheld — and this pass formulates no claim, so no absence may be `
        + 'concluded (concludeFrom said 6b; an instrument with no reasoner narrows that to 6e)'
      : ordered.why

    const written = await book.conclude({
      id: pass.id, outcome, why, M, N, withheld,
      evaluatedAt: part.evaluatedAt, boundary, viewReadUs,
      rejectedIds: part.withheld.map((w) => w.act.id),
    })
    return {
      ok: true, dryRun, passId: pass.id, rollingId: pass.rolling_id, triggerSource,
      M, N, withheld, admitted: part.admitted.length, outcome, why, boundary,
      // ⭐ REPORTED SO A CALLER CAN SEE THE NARROWING HAPPENED, rather than inferring it from the outcome.
      orderedOutcome: ordered.outcome, narrowedFrom6b: narrowed,
      limit, viewReadUs, evaluatedAt: part.evaluatedAt, written,
      preempted: pass.preempted ?? [],
      withheldActs: part.withheld.map((w) => ({ id: w.act.id, rolling_id: w.act.rolling_id })),
    }
  } catch (e) {
    // ⛔ A PASS THAT THROWS MUST STILL TERMINATE ITS OWN ROW. An in-flight row left open forever is how a
    // lane goes silent for exactly the runs that fail — the trap the reflection ledger already paid for.
    await book.fail({ id: pass.id, failure: e.message }).catch(() => {})
    throw e
  }
}
