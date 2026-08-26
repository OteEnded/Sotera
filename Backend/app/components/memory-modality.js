// ⭐⭐⭐ MODALITY — *how was the source meant to be taken?* The axis the Rome failure needed and no other
// axis could supply.
//
// PURE. No store, no model, no host, no config.
//
// ── ⭐⭐ THE CASE, AND WHY EVERY EXISTING AXIS RETURNS A TRUE ANSWER ABOUT IT ──────────────────────
// `7d383ce3` = *"user's current goal: build Rome in one day"*, extracted 31 seconds after Ote said
// *"yeah, i kinda want to build rome in one day so."* — a **proverb**.
//
//     provenance  quoted       ✅ true, verified — he really did say those words
//     mechanism   extraction   ✅ true
//     author      account      ✅ true
//     subject     Ote          ✅ true
//     scope       room         ✅ true
//     confidence  0.85         ⛔ a lookup, and see memory-lineage.js
//     ⭐ modality  figurative / aspirational   ← the ONLY axis on which the row is wrong
//
// ⇒ ⛔ **modality may never be read off any of the others, and none of them off it.** A row can be
// perfectly `quoted` and completely `figurative` at the same time. That separation is asserted in
// `memory-lineage-check.mjs`, not merely written down here.
//
// ── ⛔ THE SCOPE OF THIS FILE, PER OTE'S RULING (2026-08-26) ───────────────────────────────────────
// *"I agree with the slot-level protection: figurative material should still be retainable, but it must
// not be flattened into entity / attribute / value as though it were a literal fact. Don't over-engineer
// act+term yet unless the current design genuinely needs it."*
// ⇒ ⭐ ONE FLAT VOCABULARY, one value per observation. ⛔ No act-vs-term split. The design note that
// *"i kinda want to build rome in one day"* is an aspirational **act** containing a figurative **term**
// is recorded in `DECISIONS_SOTERA_MODALITY_CONTRADICTION_CONFIDENCE.md` §A.2 and is deliberately not
// built: the flat enum can grow a term-level annotation later without rewriting anything here.

/**
 * ⭐ THE FIVE, and each earns its place by a DISTINCT downstream behaviour — a term that changes no
 * behaviour is a synonym, and this project has paid for enough of those.
 */
export const MODALITY = Object.freeze({
  // The speaker put it forward as true. ⭐ The only class that may occupy a fact slot.
  asserted: 'asserted',
  // A want, not a state. *"i kinda want to build rome in one day"*
  // ⛔ Storable as a WANT; never as a goal in progress. The Rome row said `current goal`.
  aspirational: 'aspirational',
  // The words are not to be read at their literal value. *"you are my rome, you know?"*
  figurative: 'figurative',
  // The speaker is relaying someone else's claim. *"a phase that say like, rome is not build in one day"*
  // ⚠️ NOT the same as `provenance: quoted`, which is true of this and says something else entirely:
  // `quoted` = *he said these words*; `reported` = *the claim inside them is not his*.
  reported: 'reported',
  // Entertained, not claimed. *"suppose someone told you they were allergic…"*
  hypothetical: 'hypothetical',
})
export const MODALITY_VALUES = Object.freeze(Object.values(MODALITY))
const VALID = new Set(MODALITY_VALUES)

/** Is this a class we recognise? ⛔ Unknown strings are NOT coerced — see `normalizeModality`. */
export const isModality = (v) => VALID.has(v)

/**
 * ⚠️⚠️ AN UNKNOWN MODALITY IS **NULL**, AND NULL IS NOT `asserted`.
 *
 * ⛔ This is the one place the provenance precedent does NOT transfer. `normalizeProvenance` defaults to
 * the weakest class because every route to "unknown" is a route to not knowing — and there, defaulting
 * costs nothing but caution. Here the analogous move is impossible in both directions:
 *   · defaulting to `asserted` would rebuild the exact bug, silently, on every row;
 *   · defaulting to a non-literal class would make all 92 existing rows and every current writer
 *     unslottable overnight, which is a claim about material nobody has examined.
 *
 * ⇒ ⭐ **NULL means "nobody recorded how this was meant"** — the honest record of a period when we did not
 * ask, exactly as `provenance` NULL was for its own period. ⛔ Readers must never read it as `asserted`.
 */
export function normalizeModality(v) {
  return VALID.has(v) ? v : null
}

// ── ⭐⭐⭐ THE SLOT RULE — OTE'S RULING, AS A SHAPE RATHER THAN A CONVENTION ─────────────────────────
//
// A fact slot is `entity` + `attribute` + `value`, and its **attribute NAMES A CLAIM**. `7d383ce3` is
// `user · "current goal" · "build Rome in one day"` — the extractor did not merely record a sentence, it
// filled a structured field whose name asserts something the speaker never said. ⭐ **84 of 92 rows in
// the live store are slot-shaped**, so this is the ordinary path, not an edge case.
//
// ⇒ a non-literal statement may be retained, and may NOT be slotted.

/** ⭐ Only `asserted` is literal. ⛔ NULL is NOT literal and NOT non-literal — it is unrecorded. */
export const isLiteral = (m) => normalizeModality(m) === MODALITY.asserted
export const isNonLiteral = (m) => {
  const v = normalizeModality(m)
  return v != null && v !== MODALITY.asserted
}

/**
 * ⭐⭐ mayOccupySlot — may a row with this modality carry entity/attribute/value?
 *
 * ⚠️ UNRECORDED MODALITY IS PERMITTED, and that is deliberate rather than lax. Refusing NULL would
 * refuse every writer that exists today, which is not a protection — it is an outage. The gate binds
 * exactly the writers that have started to say, and nothing else.
 */
export const mayOccupySlot = (m) => !isNonLiteral(m)

const slotted = (row) => !!(row && (row.entity != null || row.attribute != null || row.value != null))

/**
 * ⭐⭐⭐ slotViolation — the predicate the store enforces. Returns null when the row is fine, or a reason.
 *
 * ⛔ IT REFUSES; IT DOES NOT REWRITE. Two rewrites were considered and both are worse:
 *   · **stripping the slot and keeping `content`** — ⚠️ useless here, because for a fact row `content` is
 *     GENERATED FROM the slot: `7d383ce3`'s content is literally *"user's current goal: build Rome in one
 *     day"*. The flattening would survive in the prose and the fix would be cosmetic.
 *   · **replacing `content` with the quoted span** — that is the store editing what a claim says, which
 *     is a larger power than refusing to store it.
 *
 * ⭐⭐ AND NOTHING IS LOST BY REFUSING, WHICH IS THE ARGUMENT THAT SETTLES IT. **The words are in
 * `txn_messages` permanently.** What is refused is a DERIVED assertion, and the material stays reachable
 * through the message store, through `recall_memory_source`, and through her own `keep()` as prose if she
 * decides it matters. Ote's *"figurative material should still be retainable"* is satisfied by the prose
 * route staying open — ⛔ what is closed is the slot.
 */
export function slotViolation(row) {
  if (!row) return null
  const m = normalizeModality(row.modality)
  if (!isNonLiteral(m)) return null
  if (!slotted(row)) return null
  return `a ${m} statement may not occupy a fact slot (entity/attribute/value) — retain it as prose instead`
}

/** ⭐ Exported so a check can assert the INTENT, not merely the filtering. */
export const A_FIGURE_OF_SPEECH_IS_NOT_A_FACT_SLOT =
  'A statement that was not meant literally may be retained, and may not be flattened into '
  + 'entity/attribute/value as though it were a literal fact. The attribute of a fact slot NAMES A CLAIM; '
  + 'putting a proverb in one is how "i kinda want to build rome in one day" became "user\'s current goal". '
  + 'The words themselves are never lost — they are in txn_messages, and source_message_id walks to them.'
