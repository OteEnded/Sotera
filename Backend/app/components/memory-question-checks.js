// ⭐⭐⭐ THE DECLARED-CHECK REGISTRY — M2-11, and it FAILS CLOSED.
//
// PURE. No stores, no IO, no config, no model.
//
// ── ⭐⭐ WHAT A QUESTION DEFINITION MAY SAY ABOUT A VALID ANSWER (M2-11, LOCKED 2026-09-02) ──────
// A question definition carries **an explicit structured list of stable check IDENTIFIERS** —
// ⛔ not prose, ⛔ not a serialized predicate, ⛔ not a regex smuggled in as data. Every identifier must
// resolve to a REAL executable check here, and ⭐ the vocabulary is extended ONLY by the memory-layer
// implementation: a definition cannot invent a check by naming one.
//
// ── ⛔⛔ THE INVARIANT, AND IT IS THE WHOLE FILE ─────────────────────────────────────────────────
//
//     UNKNOWN · MISSING · STALE · UNRUNNABLE  ⇒  DEFER
//     ⛔ NONE OF THEM MAY EVER SILENTLY BECOME `ALLOW`.
//
// ⭐ A check that could not run is not a check that passed. That collapse is the one this registry
// exists to make impossible — the same shape as *"I could not check"* reading as *"I checked and it was
// fine"*, which this arc has now paid for at three different layers.
//
// ── ⭐ REFUSE BEATS DEFER (locked) ──────────────────────────────────────────────────────────────
// Ote: *"if any declared check produces a real violation, REFUSE wins over an unrelated unknown/unrunnable
// check. We keep the actual finding rather than throwing it away as DEFER."*
// ⇒ a real finding is EVIDENCE and outranks an unrelated ignorance. ⛔ The reverse ordering would discard
// the one thing the evaluation actually learned.
//
// ── ⚠️ AND `ran` IS INDEPENDENT OF THE RESULT (hardening ③) ─────────────────────────────────────
// *Did every declared check execute?* and *did any of them find a violation?* are two questions. A check
// that ran and passed and a check that ran and FAILED are both `ran`. ⛔ Conflating them would make an
// evaluation that found a real problem indistinguishable from one that could not look.

/** ⭐ The outcome vocabulary. ⛔ Frozen, and ⛔ there is no fourth value. */
export const OUTCOME = Object.freeze({ allow: 'ALLOW', refuse: 'REFUSE', defer: 'DEFER' })

/**
 * ⭐⭐⭐ THE REGISTRY — a NULL-PROTOTYPE object, and that is hardening ① rather than a style choice.
 *
 * ⛔⛔ A registry on a plain `{}` inherits `toString`, `constructor`, `hasOwnProperty`, `valueOf`… so
 * `registry['toString']` returns a FUNCTION, and a definition naming `toString` as its check would
 * resolve to a real callable and be treated as a registered check. ⇒ an attacker — or a typo — could
 * name a prototype member and get something that is not a check at all.
 * ⭐ `Object.create(null)` removes the entire prototype chain, so there is nothing to inherit.
 * ⓘ `Object.hasOwn` is used as well at the lookup, so the guarantee does not rest on one mechanism.
 */
const CHECKS = Object.create(null)

/** ⭐ Register one check. ⛔ Not exported — the vocabulary grows only in this file. */
function register(id, describe, run) {
  CHECKS[id] = Object.freeze({ id, describe, run })
}

// ── THE VOCABULARY. ⭐ Each is DETERMINISTIC and mechanically checkable. ⛔ No classifier, no heuristic,
// no model — Ote: *"closing that gap requires a real deterministic check → tests → registered identifier."*
register('nonempty', 'the answer is not blank',
  (value) => ({ ok: String(value ?? '').trim().length > 0, why: 'the answer is blank' }))

register('single-line', 'the answer is one line — a paragraph is a sentence ABOUT the answer',
  (value) => ({ ok: !/\n/.test(String(value ?? '')), why: 'the answer spans multiple lines' }))

register('no-trailing-ellipsis', 'the answer is not visibly truncated',
  (value) => ({ ok: !/(\.\.\.|…)\s*$/.test(String(value ?? '')), why: 'the answer ends mid-thought' }))

register('is-iso-date', 'the answer is a calendar date, not prose about one',
  (value) => ({ ok: /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '').trim()), why: 'not an ISO date' }))

/**
 * ⭐ Resolve one identifier. Returns the check or `null`.
 * ⛔ `null` means UNKNOWN, and every caller must treat unknown as DEFER — ⛔ never as "no constraint".
 */
export function resolveCheck(id) {
  if (typeof id !== 'string' || !id) return null
  // ⭐ BOTH guards. `Object.hasOwn` would already be enough on a null-prototype object, and the
  // null prototype would already be enough without `hasOwn` — ⛔ neither is removed, because this is
  // the lookup where a prototype member would become a callable pretending to be a check.
  return Object.hasOwn(CHECKS, id) ? CHECKS[id] : null
}

/** ⓘ Every registered identifier, for a declaration-time validator and for a reader. */
export const registeredCheckIds = () => Object.keys(CHECKS).sort()

/**
 * ⭐⭐ HARDENING ② — VALIDATE AT DECLARATION TIME.
 *
 * ⛔ A definition naming a check that does not exist must be refused when it is DECLARED, ⛔ not
 * discovered at evaluation time on some future row. A definition that cannot be evaluated is not a
 * stricter definition; it is an unusable one, and every value under it would DEFER forever.
 */
export function validateDefinition(definition) {
  const checks = definition?.checks
  if (!Array.isArray(checks)) {
    return { ok: false, why: 'checks must be an ARRAY of stable identifiers — ⛔ not prose, not a predicate', unknown: [] }
  }
  const badType = checks.filter((c) => typeof c !== 'string' || !c)
  if (badType.length) {
    return { ok: false, why: `${badType.length} check identifier(s) are not non-empty strings`, unknown: [] }
  }
  const unknown = checks.filter((c) => resolveCheck(c) === null)
  if (unknown.length) {
    return { ok: false, why: `unregistered check identifier(s): ${unknown.join(', ')}`, unknown }
  }
  return { ok: true, why: `${checks.length} check(s), all registered`, unknown: [] }
}

/**
 * ⭐⭐⭐ EVALUATE a value against a definition's declared checks.
 *
 * @returns {{outcome, ran, declared, evaluated, violations, unknown, unrunnable, why}}
 *
 * ⭐ `declared` vs `evaluated` is kept because it is an INSTRUMENT fact — how much of the definition
 * could actually be applied — and ⛔ never a conclusion about the value. Exactly the `N < M` distinction
 * one layer down: an incomplete look may not assert that the value is fine.
 */
export function evaluate({ checks, value } = {}) {
  const declared = Array.isArray(checks) ? checks.length : 0
  const violations = []
  const unknown = []
  const unrunnable = []
  let evaluated = 0

  if (!Array.isArray(checks)) {
    // ⛔ FAIL CLOSED. A malformed definition is ignorance, not permission.
    return {
      outcome: OUTCOME.defer, ran: false, declared: 0, evaluated: 0,
      violations, unknown, unrunnable,
      why: 'the declared checks are not an array — a definition that cannot be read cannot ALLOW',
    }
  }

  for (const id of checks) {
    const check = resolveCheck(id)
    if (!check) { unknown.push(id); continue }
    let verdict
    try {
      verdict = check.run(value)
    } catch (e) {
      // ⛔⛔ A CHECK THAT THREW DID NOT PASS. Swallowing this into ALLOW is the exact collapse this
      // registry exists to prevent, and it is the one a `try/catch` most easily creates by accident.
      unrunnable.push({ id, error: e?.message ?? String(e) })
      continue
    }
    evaluated += 1
    if (!verdict?.ok) violations.push({ id, why: verdict?.why ?? check.describe })
  }

  // ⭐ HARDENING ③ — `ran` answers *did every declared check execute?* and NOTHING about the result.
  const ran = declared > 0 && evaluated === declared

  // ⭐⭐ REFUSE BEATS DEFER. A real finding outranks an unrelated ignorance — ⛔ we keep what was
  // actually learned rather than discarding it because something else could not be checked.
  if (violations.length) {
    return {
      outcome: OUTCOME.refuse, ran, declared, evaluated, violations, unknown, unrunnable,
      why: `${violations.length} declared check(s) found a real violation`,
    }
  }
  if (unknown.length || unrunnable.length) {
    return {
      outcome: OUTCOME.defer, ran, declared, evaluated, violations, unknown, unrunnable,
      why: `${unknown.length} unknown and ${unrunnable.length} unrunnable check(s) — ⛔ neither may become ALLOW`,
    }
  }
  if (declared === 0) {
    // ⛔ AN EMPTY DEFINITION IS NOT A PERMISSIVE ONE. "Nothing was declared" is missing information,
    // and missing information defers.
    return {
      outcome: OUTCOME.defer, ran: false, declared, evaluated, violations, unknown, unrunnable,
      why: 'no checks were declared — an absent constraint is unknown, ⛔ not a satisfied one',
    }
  }
  return {
    outcome: OUTCOME.allow, ran, declared, evaluated, violations, unknown, unrunnable,
    why: `all ${declared} declared check(s) ran and found nothing`,
  }
}

/** ⛔ Exported so a check can assert the INTENT, not merely the branching. */
export const UNKNOWN_NEVER_BECOMES_ALLOW =
  'A question definition names checks by stable identifier and the vocabulary grows only in this file, so '
  + 'a definition cannot invent a check by naming one. Unknown, missing, stale and unrunnable checks all '
  + 'produce DEFER and can never silently become ALLOW, because a check that could not run is not a check '
  + 'that passed. A real violation produces REFUSE and outranks an unrelated unknown, so the finding is '
  + 'kept rather than discarded. Whether every declared check executed is recorded separately from what '
  + 'they found, because an evaluation that discovered a problem and one that could not look are different '
  + 'facts about different things.'
