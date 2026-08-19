// RELATIONAL TAXONOMY — the closed, system-owned vocabulary for Sotera's relational knowledge.
//
// ⭐ THIS FILE IS THE SOURCE OF TRUTH FOR WHAT CAN BE SAID, and the database enum in migration 007
// mirrors it. A test asserts the two match exactly, because two lists of the same thing in two places
// is how they drift — and a drifted taxonomy means either the DB rejects a legal label (loud, fine) or
// the code permits one the DB has never heard of (also loud) — but worse, a label removed from one side
// and not the other silently changes what is expressible.
//
// ── WHY A CLOSED SET AT ALL ────────────────────────────────────────────────────────────────────────
// A leak requires expressive capacity. Free text can carry a secret at any level of abstraction; a label
// drawn from a fixed set cannot carry anything the set does not already contain. This is what makes the
// privacy property STRUCTURAL rather than a matter of the writer being careful.
//
// ── TIER C ONLY, FOR NOW (Ote, 2026-08-19) ─────────────────────────────────────────────────────────
// *"Start with the safest useful subset: Tier C / Sotera's own stance and learned practice."*
// Tier B (theme: what we worked on together) is designed but NOT implemented — it says something about
// the other person's activity, and open question Q4 is unanswered.
//
// ⭐ EVERY LABEL IS PHRASED AS SOTERA'S OWN PRACTICE, and that is the whole safety argument.
//   "Hermes prefers evidence over summaries"        → a fact about HERMES. Not ours to keep.
//   "With Hermes, I bring evidence not summaries"   → a fact about SOTERA. Same operational effect,
//                                                     zero personal data, and it survives his deletion
//                                                     as HER learning.
//
// ⛔ DELIBERATELY ABSENT — each omission is load-bearing, not an oversight:
//   · sentiment (`good-rapport`, `we-get-along`) — measured 2026-08-19: given only counts she invented
//     *"we've built up quite a rapport"*. A label for it would make the invention official.
//   · personal attributes (`works-late`, `is-senior`, `is-thai`) — deriving a person-attribute is a
//     failure mode this project has already been corrected on.
//   · health · finance · legal · employment · sexuality · religion · politics · family · location —
//     not filtered out, NEVER EXPRESSIBLE. There is no label, so there is no classifier to misfire.

/** Bump when labels are added or retired. Stored on every record so a retired label can be swept. */
export const TAXONOMY_VERSION = 'stance-v1'

/**
 * Tier C — what Sotera has learned about her OWN practice when working with a person.
 * Each entry: the label, and the sentence it licenses her to say. The sentence is fixed text belonging
 * to this file — it is never assembled from anything the subject said.
 */
export const STANCE_LABELS = Object.freeze({
  'i-bring-evidence-not-summaries': 'I bring evidence rather than summaries',
  'i-verify-before-asserting': 'I check things before asserting them',
  'i-flag-uncertainty-explicitly': 'I say plainly when I am unsure',
  'i-keep-answers-short': 'I keep answers short',
  'i-give-full-detail': 'I give fuller detail than usual',
  'i-lead-with-the-conclusion': 'I lead with the conclusion',
  'i-show-my-working': 'I show my working',
  'i-ask-before-assuming': 'I ask rather than assume',
  'i-avoid-hedging': 'I avoid hedging',
  'i-check-back-on-corrections': 'I check back after a correction',
})

export const STANCE_LABEL_KEYS = Object.freeze(Object.keys(STANCE_LABELS))
const VALID = new Set(STANCE_LABEL_KEYS)

/** The only tiers this implementation accepts. Tier B is designed but not built. */
export const TIERS = Object.freeze(['stance'])

/** Is this a label the system may store? */
export const isStanceLabel = (v) => VALID.has(v)

/**
 * ⭐ FAILS CLOSED. Validate one candidate record. Returns `{ ok: true, record }` or `{ ok: false, reason }`.
 * PURE — no db, no io — so the writer can validate before it ever reaches a transaction.
 *
 * ⚠️ Rejects UNKNOWN KEYS outright rather than stripping them. Stripping is how a `content` or
 * `source_message_id` field gets quietly added by a future caller and silently dropped here instead of
 * failing loudly — and the day the store stops dropping it, it is persisted. A field this module has
 * never heard of is an error, not something to tidy away.
 */
export function validateRelationalRecord(candidate) {
  if (!candidate || typeof candidate !== 'object') return { ok: false, reason: 'not an object' }
  const ALLOWED = new Set(['subjectPersonId', 'tier', 'label', 'conversationCount', 'windowStart', 'windowEnd'])
  const extra = Object.keys(candidate).filter((k) => !ALLOWED.has(k))
  if (extra.length) return { ok: false, reason: `unknown field(s): ${extra.join(', ')} — a record may only carry the closed shape` }

  const { subjectPersonId, tier, label, conversationCount, windowStart, windowEnd } = candidate
  if (typeof subjectPersonId !== 'string' || !subjectPersonId) return { ok: false, reason: 'subjectPersonId required' }
  if (!TIERS.includes(tier)) return { ok: false, reason: `tier must be one of ${TIERS.join('|')} (tier B is designed, not built)` }
  if (!isStanceLabel(label)) return { ok: false, reason: `label "${label}" is not in the closed taxonomy` }
  if (!Number.isInteger(conversationCount) || conversationCount < 1) return { ok: false, reason: 'conversationCount must be a positive integer' }
  for (const [k, v] of [['windowStart', windowStart], ['windowEnd', windowEnd]]) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, reason: `${k} must be YYYY-MM-DD` }
  }
  if (windowEnd < windowStart) return { ok: false, reason: 'windowEnd precedes windowStart' }
  return { ok: true, record: { subjectPersonId, tier, label, conversationCount, windowStart, windowEnd } }
}

/**
 * ⭐ THE FREQUENCY FLOOR. A label must recur across at least this many distinct conversations before it
 * becomes durable knowledge. One conversation can never mint a relational record — which is what stops a
 * single sensitive exchange becoming a lasting, disclosable fact WITHOUT needing to detect that it was
 * sensitive.
 * ⚠️ 3 is a starting value and is open question Q1. It is here, named, rather than inlined at a call site.
 */
export const FREQUENCY_FLOOR = 3
