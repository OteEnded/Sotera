// ⭐⭐⭐ CORPUS ELIGIBILITY — may this conversation be reasoned from?
//
// PURE. One predicate, one place — the same discipline as `memory-ownership.js` and
// `memory-self-state-claim.js`. ⛔ Every retrieval path spells the clause the same way or the clause is
// not a boundary; it is a habit.
//
// ── ⚠️⚠️ THE GAP THIS CLOSES, AFTER THREE INCIDENTS ───────────────────────────────────────────────
// Retrieval eligibility was ONE flag — `incognito = false` — set at create and never patched. So the
// corpus had two states and no in-between:
//
//     incognito   "this never happened for any purpose"   ⛔ unsettable after the fact
//     deleted     "this never happened at all"            ⛔ destroys the evidence
//     ⭐ NEW      "this happened, and it is not evidence"  ← migration 033
//
// ⭐ The third incident is the one that proves removal is not always available: the contaminating
// conversation was REAL — `settings.probe = false`, an ordinary auto-title — so deleting it was never on
// the table, and a false statement reached her in a brand-new conversation because **history outlived the
// code that caused it**.
//
// ── ⛔ WHAT EXCLUSION IS NOT ─────────────────────────────────────────────────────────────────────
// ⛔ Not deletion. The conversation stays, its messages stay, the UI still shows it, and its own record
//    of what a run did survives — which is the point: the alternative was destroying the evidence.
// ⛔ Not `incognito`. That is a privacy promise fixed at create; a promise you can revoke later is not a
//    promise, which is exactly why it cannot double as the experiment's tool.
// ⛔ Not `archived_at` and not `settings.probe`. Those gate WRITING — the revisit lanes, noticing and
//    reflection. Neither ever removed a conversation from retrieval.

/** ⭐ The SQL fragment, for the raw-SQL retrieval arms. Aliased so each call site reads naturally. */
export const evidentialSql = (alias = 'c') =>
  `${alias}.incognito = false AND ${alias}.excluded_from_evidence_at IS NULL`

/** ⭐ The Sequelize fragment, for the ORM reads. Spread into a `where`. */
export const EVIDENTIAL_WHERE = Object.freeze({ incognito: false, excluded_from_evidence_at: null })

/**
 * ⭐ May a single fetched conversation row be reasoned from? For the single-row paths (disclosure).
 * ⚠️ Tolerates both snake_case rows and camelCase objects, because it is called on both.
 */
export function isEvidential(conv) {
  if (!conv) return false
  const excluded = conv.excluded_from_evidence_at ?? conv.excludedFromEvidenceAt ?? null
  return conv.incognito !== true && excluded == null
}

/**
 * ⭐⭐ Exported so a check can assert the INTENT, not merely the filtering.
 * ⛔ A filter nobody can see is how "I covered everything" gets said about a filtered set — this project
 * has paid for that three times — so every reader that narrows by this must be able to say it did.
 */
export const IT_HAPPENED_AND_IT_IS_NOT_EVIDENCE =
  'An excluded conversation still happened: it is durable, readable and auditable, and it is not material '
  + 'she may reason from. The state exists because a measurement that leaves its own conversations in the '
  + 'corpus is measuring a corpus it changed, and because deletion is not always available -- the '
  + 'contaminating conversation is sometimes a real one.'

/**
 * ⭐ A reason is REQUIRED to exclude. Refuses rather than accepting a blank one.
 * ⛔ An exclusion nobody can justify later is indistinguishable from curating the data to make a number
 * come out, which is the thing this capability must never become.
 */
export function validateExclusion({ reason } = {}) {
  const r = String(reason ?? '').trim()
  if (r.length < 8) return { ok: false, why: 'an exclusion must carry a reason a person can evaluate later' }
  return { ok: true, reason: r.slice(0, 500) }
}
