// ⭐⭐⭐ WHAT DREAMING PROPOSES — an ORDINARY SLOT CLAIM. (M2-7, locked 2026-09-01; built 2026-09-03)
//
// PURE. No stores, no IO, no config, no model.
//
// ── ⚠️⚠️ THE FIVE BESPOKE FORMS ARE GONE, AND THAT IS A DELIBERATE ACT ──────────────────────────
// This module used to hold a CLOSED GRAMMAR: five forms (`recurrence` and friends), typed slots, and a
// deterministic renderer, so that *"the model never produces a sentence."* ⭐ It was a good design for
// the wrong frame, and Ote retired it:
//
//     *"Ordinary memory claim + separate warrant/provenance. ⛔ **No Dreaming-specific memory
//      vocabulary.**"* · *"Warrant: separate provenance object. ⛔ Don't put evidence/provenance into
//      the memory's **value**."*
//
// ⭐⭐ WHY THE GRAMMAR WAS WRONG, MEASURED (M2.d): `recurrence` rendered *"…of my own acts"* while the
// evidence was **the other party's turns.** The forms assumed the PERSONA frame (subject = Sotera), but
// **the room frame's natural subject is THE ROOM'S OWNER** — which is what every `user/*` memory already
// is, and a claim about the room's owner IN their own room discloses nothing.
// ⇒ once the subject is right, Dreaming needs no vocabulary of its own: it proposes what any writer
// proposes, and `recurrence` becomes the WARRANT rather than the claim.
//
// ── ⚠️⚠️ AND THE GUARANTEE THIS COSTS, STATED PLAINLY ───────────────────────────────────────────
// The closed grammar guaranteed **no prose leaves the model**. An ordinary claim's `value` IS
// model-produced prose, so ⛔ that guarantee is GONE and this file does not pretend otherwise.
// ⭐ What replaces it is not a promise but a mechanism: **M2-8 span verification** — every cited span is
// checked against the bucket it claims to come from, unverifiable roots are DISCARDED, and the roots are
// RECOUNTED before the floor is applied. ⓘ Prose is admitted because it is CHECKED, ⛔ not because it is
// trusted. See `dreaming-verify.js`.
// ⓘ And the old worry was already moot: `value` has been model-produced prose since long before
// Dreaming — measured, `synthesized` n=38, median 74 chars, with two live rows truncated mid-word at 400.

/**
 * ⭐ The structural fields a proposal may be BUILT from.
 * ⚠️ It no longer governs the VALUE — under M2-7 the value comes from bounded evidence, not from these.
 * ⓘ Kept because it still says which act-record columns may be read at all; ⛔ free-text columns
 * (`text`, `reason`, `failure`) remain absent on purpose.
 */
export const T0_FIELDS = Object.freeze([
  'rolling_id', 'conversation_id', 'user_id', 'created_at', 'completed_at',
  'outcome', 'messages_considered', 'from_rolling_id', 'up_to_rolling_id',
  'wrote_memory_id_present', 'tool_names', 'model',
])

/**
 * ⭐ A slot address is `entity/attribute` — a POINTER INTO THE EXISTING STORE.
 *
 * ⚠️⚠️ THIS WAS WRONG ON ITS FIRST RUN, AND THE 12b RUN CAUGHT IT. It began as
 * `/^[a-z0-9][a-z0-9_.-]{0,63}$/i` with the rationale *"a phrase is where prose hides"* — a rule
 * carried over from the RETIRED closed grammar, where a slot label was part of an enumerated
 * vocabulary. ⓘ Measured against the live store: **34 of 104 live attributes (33%) were refused**,
 * including `communication preference`, `account identity` and `Thai name spelling`. ⇒ Dreaming could
 * not have addressed a third of the slots that already exist.
 *
 * ⭐⭐ THE REAL INVARIANT IS NOT SHAPE, IT IS ORIGIN: an address must not be a vocabulary Dreaming
 * INVENTED (M2-7). Whether it contains a space is the store's business, and the store says spaces are
 * ordinary. ⛔ Asking "is this a real slot?" is the memory layer's slot resolution, ⛔ not grammar's —
 * a pure validator cannot answer it and should not pretend to.
 */
const ADDRESS_RE = /^[^\s][^\n\r]{0,127}$/

/**
 * ⭐⭐⭐ validateClaim — the shape of an ORDINARY claim, plus its citations.
 *
 * `{ entity, attribute, value, kind, cites: [{root, span}] }`
 *
 * ⛔ There is no `form`, no `quantifier` and no Dreaming-specific field. That is the whole point of
 * M2-7: what comes out of Dreaming must be indistinguishable IN SHAPE from what any other writer
 * proposes, so the memory layer's ordinary pipeline can handle it without knowing who sent it.
 */
export function validateClaim(claim = {}) {
  const { entity, attribute, value, kind, cites } = claim ?? {}
  if (typeof entity !== 'string' || !ADDRESS_RE.test(entity)) {
    return { ok: false, why: 'a claim must name a valid `entity` — the subject the slot is about' }
  }
  if (typeof attribute !== 'string' || !ADDRESS_RE.test(attribute)) {
    return { ok: false, why: 'a claim must name a valid `attribute` — the question the slot asks' }
  }
  // ⛔⛔ AND IT MAY NOT BE A DREAMING-SPECIFIC ADDRESS. This is M2-7 made mechanical: minting
  // `dreaming:<form>` would re-create the vocabulary the ruling removed, one layer down.
  if (/^dreaming[:/]/i.test(attribute) || /^dreaming[:/]/i.test(entity)) {
    return { ok: false, why: 'a `dreaming:`-prefixed address is a Dreaming-specific vocabulary — M2-7 removed it' }
  }
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, why: 'a claim must carry a value' }
  }
  // ⛔ KIND IS DECLARED BY THE CLAIM, and the memory layer's precondition compares it to the SLOT's kind.
  // ⛔ It is never inferred here — M2-10 forbids inferring a kind from a value.
  if (typeof kind !== 'string' || !kind.trim()) {
    return { ok: false, why: 'a claim must declare its `kind` — what question it answers. ⛔ Never inferred' }
  }
  if (!Array.isArray(cites) || !cites.length) {
    return { ok: false, why: 'a claim must carry citations — an unwarranted claim is not Dreaming\'s to make' }
  }
  for (const c of cites) {
    if (!c?.root || typeof c.span !== 'string' || !c.span.trim()) {
      return { ok: false, why: 'every cite must name a root and quote a span from it' }
    }
  }
  // ⛔ THE VALUE MAY NOT CARRY ITS OWN WARRANT. Ote: *"Don't put evidence/provenance into the memory's
  // value."* A value that argues for itself is a claim and a receipt fused into one field, and the two
  // have different lifetimes — the receipt is about a moment, the claim is not.
  if (/\b(\d+\s+(independent\s+)?(roots?|conversations?|episodes?)|verified across)\b/i.test(value)) {
    return { ok: false, why: 'the value states its own evidence — the warrant is a SEPARATE object (M2-7)' }
  }
  return { ok: true, why: 'an ordinary slot claim with citations', entity, attribute, kind }
}

/**
 * ⭐⭐ THE PUBLICATION CHECK, and it FAILS CLOSED.
 *
 * ⭐ A room-scoped claim about the room's owner, in their own room, discloses nothing — which is what
 * every `user/*` memory already is.
 * ⛔⛔ `persona_global` is REFUSED. O-13's no-claims-about-another-party was a persona-global constraint,
 * and the disclosure ruling for a PROSE claim reaching every room does not exist. ⚠️ The closed grammar
 * could be checked statically (counts of typed entities); a prose value cannot. ⇒ the smallest-safe
 * reading holds until Ote rules, and this refusal is where that ruling would land.
 */
export function mayPublish(claim = {}, { destination = 'room' } = {}) {
  const v = validateClaim(claim)
  if (!v.ok) return { ok: false, why: v.why }
  if (destination === 'persona_global') {
    return {
      ok: false,
      why: 'a prose claim may not be published persona_global — the closed grammar could be checked '
        + 'statically and a prose value cannot, and the disclosure ruling for this does not exist',
    }
  }
  return { ok: true, why: 'room scope — a claim about the room\'s owner, in their own room' }
}

/** ⭐ The value a claim asserts. ⛔ No rendering: under M2-7 the value IS the value. */
export const valueOfClaim = (claim) => (validateClaim(claim).ok ? String(claim.value).trim() : null)

/** ⛔ Exported so a check can assert the INTENT, not merely the branching. */
export const AN_ORDINARY_CLAIM_PLUS_A_WARRANT =
  'Dreaming proposes an ordinary slot claim plus a separate warrant, and nothing else. '
  + 'It proposes what any other writer proposes: an entity, an attribute, a value and a declared '
  + 'kind, with citations attached separately. It has no form, no quantifier and no vocabulary of its '
  + 'own, so the memory layer can handle its proposal without knowing who sent it. The closed grammar '
  + 'that guaranteed no prose leaves the model is gone, and what replaces it is verification rather than '
  + 'a promise: every cited span is checked against the bucket it claims to come from and unverifiable '
  + 'roots are discarded before the floor is applied. The value may not argue for itself, because a claim '
  + 'and its receipt have different lifetimes.'
