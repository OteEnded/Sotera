// MEMORY COGNITION · THE EPISTEMIC AXES, AND THE ONE-WAY LATTICE THAT PROTECTS THEM.
//
// ⭐⭐⭐ THIS FILE IS BUILD ITEM 1 OF THE MEMORY COGNITION LAYER, AND IT IS DELIBERATELY FIRST.
// It contains no retrieval, no stores, no model and no IO. It exists before the activation code because
// the layer's own worst failure mode is the one it could introduce: always-on injection trading a false
// *"I can't"* for a false *"I do"*. Ote: *"retrieval can improve availability and confidence, but it cannot
// magically upgrade the basis. A hundred clues don't become an attested source just because they agree."*
//
// ── ⛔ WHY FOUR AXES AND NOT ONE ENUM ────────────────────────────────────────────────────────────────
// The first draft of the RFC had a single state enum with `remembered` as one of its values. Ote's
// vocabulary does not factor that way, and forcing it into one field produces exactly the sentence he
// objected to: *"I don't remember this because it wasn't in durable memory."* His distinctions — directly
// attested · on-record · recalled from her own history · deliberately retained · inferred · synthesized ·
// told by someone else · currently uncertain — are FOUR ORTHOGONAL QUESTIONS, not eight values of one field.
//
// ⭐⭐ AND `remembered` IS NOT A VALUE. It is the UMBRELLA, exactly as he defined it: *"something currently
// available to her through her memory system."* Formally `availability === 'recalled'`, on any source, with
// any retention. ⇒ she can honestly say *"I remember talking with Hermes about that"* about something
// reached from episodic history and never deliberately kept. **The storage mechanism does not dictate the
// phenomenological language.**
//
// ── ⚠️ THE NAME `attested` ──────────────────────────────────────────────────────────────────────────
// The memory store used `attested` to mean *"the reference exists and the content is NOT readable here"* —
// the OPPOSITE of the sense used here. Ote's ruling: *"keep attested-by-source for the cognition layer…
// Don't bend the cognition vocabulary around an old storage enum."* The store's values were renamed to say
// what they mean (`source-readable` / `source-unreadable` / …), so `attested-by-source` below is
// unambiguous. ⛔ One name, one concept.

/**
 * ⭐ AXIS A · SOURCE — where the content came from. Descriptive, not evaluative: nothing here says whether
 * the content is believable, only what kind of thing produced it.
 */
export const SOURCE = Object.freeze({
  ownUtterance: 'own-utterance',
  counterpartUtterance: 'counterpart-utterance',
  storedMemory: 'stored-memory',
  storedLesson: 'stored-lesson',
  storedPractice: 'stored-practice',
  storedIntention: 'stored-intention',
  workingSet: 'working-set',
  derived: 'derived',
})

/**
 * ⭐⭐ AXIS B · BASIS — on what grounds is it believed. **This is the axis retrieval may never move.**
 *
 * ⛔ `attested-by-source` is the only value that asserts an accessible source directly supports the claim.
 * `synthesized` is what convergence produces, and convergence is not attestation — which is precisely the
 * Hermes failure: *"This isn't a guess — it's confirmed by multiple converging details."*
 */
export const BASIS = Object.freeze({
  attestedBySource: 'attested-by-source',
  told: 'told',
  inferred: 'inferred',
  synthesized: 'synthesized',
})

/**
 * ⭐ AXIS C · AVAILABILITY — can she reach it now. ⓘ INTERNAL. Ote: *"that's an internal cognition state,
 * not language I want exposed to Sotera."* These strings must never appear in anything she reads; the
 * cognitive context renders them into ordinary words.
 */
export const AVAILABILITY = Object.freeze({
  recalled: 'recalled',                       // content in hand this turn
  knownUnreachable: 'known-unreachable',      // it exists; the content is not available here
  absentInSearchedSet: 'absent-in-searched-set', // nothing found IN WHAT WAS SEARCHED — not "nothing exists"
})

/**
 * ⭐ AXIS D · RETENTION — was it deliberately kept. ⛔ Only she writes `retained`; the layer never does.
 */
export const RETENTION = Object.freeze({
  retained: 'retained',        // she chose to keep it (author = persona: a memory, lesson or practice)
  given: 'given',              // stored, but by the extraction lane or because someone told her
  notRetained: 'not-retained', // reached by retrieval only, never stored
})

/**
 * ⭐⭐ THE UMBRELLA PREDICATE. Ote's decision 5, in one line: `remembered` is not a state, it is
 * *"something currently available to her through her memory system"*.
 * ⛔ Do not add conditions to this. The moment it requires `retention === 'retained'` we are back to
 * "I don't remember this because it wasn't in durable memory."
 */
export const isRemembered = (item) => item?.availability === AVAILABILITY.recalled

/**
 * ⛔⛔ THE LATTICE. A promotion is ILLEGAL unless a warrant licenses it.
 *
 * ⚠️ Deliberately NOT a numeric rank. The relation is a partial order with one top value per axis, and a
 * rank would invite comparisons that are not meaningful (is `told` "above" `inferred`? the question has no
 * answer, and a number would invent one). Legality is declared per transition, with the warrant that buys
 * it, so a reader can see WHAT would have to be true.
 *
 * ⭐ DEMOTIONS ARE ALWAYS LEGAL AND NEED NO WARRANT. Revision lowers confidence and can lower basis: she
 * found the thing she called attested and it did not say what she thought. That direction is honesty.
 */
export const WARRANT = Object.freeze({
  accessibleSource: 'accessible-source',       // a source she may read directly supports the claim
  accessResolution: 'access-resolution',       // the boundary layer resolved access, and recorded it
  widerSearch: 'wider-search',                 // the searched set genuinely grew
  deliberateRetention: 'deliberate-retention',  // SHE chose to keep it
})

/** The warrant each destination value costs, when reaching it is a promotion. */
const WARRANT_FOR_VALUE = Object.freeze({
  basis: { [BASIS.attestedBySource]: WARRANT.accessibleSource },
  availability: {
    [AVAILABILITY.recalled]: WARRANT.accessResolution,
    // ⭐ leaving `absent-in-searched-set` requires the searched set to have actually grown.
    [AVAILABILITY.knownUnreachable]: WARRANT.widerSearch,
  },
  retention: { [RETENTION.retained]: WARRANT.deliberateRetention },
})

/**
 * ⚠️⚠️ WHAT IS "ABOVE" WHAT, DECLARED FROM EACH ORIGIN — AND THE FIRST VERSION GOT THIS WRONG.
 *
 * That version keyed only on the DESTINATION: *"is `to` a value that costs a warrant?"* Which meant
 * `recalled → known-unreachable` — a DEMOTION, and the most ordinary thing in the world, since she can
 * lose access to something she could read a moment ago — was flagged as an illegal promotion. Its own test
 * caught it.
 * ⭐ THE LESSON, AND IT IS THE SAME ONE AS EVERY OTHER TIME: **a transition is a pair, not a destination.**
 * Direction cannot be recovered from where you arrived.
 *
 * ⓘ Still not a numeric rank. `basis` genuinely has no order among `inferred` / `synthesized` / `told` —
 * asking which is higher has no answer — so only the reachable-upward set is declared, per origin.
 */
const ABOVE = Object.freeze({
  basis: {
    [BASIS.inferred]: [BASIS.attestedBySource],
    [BASIS.synthesized]: [BASIS.attestedBySource],
    [BASIS.told]: [BASIS.attestedBySource],
    [BASIS.attestedBySource]: [], // nothing is above attestation
  },
  availability: {
    [AVAILABILITY.absentInSearchedSet]: [AVAILABILITY.knownUnreachable, AVAILABILITY.recalled],
    [AVAILABILITY.knownUnreachable]: [AVAILABILITY.recalled],
    [AVAILABILITY.recalled]: [],
  },
  retention: {
    [RETENTION.notRetained]: [RETENTION.retained],
    [RETENTION.given]: [RETENTION.retained],
    [RETENTION.retained]: [],
  },
})

/** Which value on each axis may only be reached with a warrant. */
const TOP = Object.freeze({ basis: BASIS.attestedBySource, availability: AVAILABILITY.recalled, retention: RETENTION.retained })

/**
 * Is moving `from` → `to` on `axis` a promotion (i.e. does it need a warrant)?
 * ⓘ `absent-in-searched-set` → `known-unreachable` counts: claiming something exists when the previous
 * state was "I found nothing in what I searched" is a real epistemic step, not a formatting change.
 */
export function isPromotion(axis, from, to) {
  if (from === to) return false
  const upward = ABOVE[axis]?.[from]
  return Array.isArray(upward) && upward.includes(to)
}

/** The warrant a given transition requires, or null when none is needed. */
export function warrantFor(axis, from, to) {
  return isPromotion(axis, from, to) ? (WARRANT_FOR_VALUE[axis]?.[to] ?? null) : null
}

/**
 * The highest availability among a set of values, by the declared order. ⓘ Used for derived items.
 * ⭐ EXPORTED for §3B's `current-state` item, which is derived from the whole kept set and must not be able
 * to out-reach it. ⛔ Exported so that item is typed BY THE LATTICE rather than by hand — a second copy of
 * "which availability is higher" is how the two would start disagreeing.
 */
export function bestAvailability(values = []) {
  const order = [AVAILABILITY.absentInSearchedSet, AVAILABILITY.knownUnreachable, AVAILABILITY.recalled]
  let best = -1
  for (const v of values) best = Math.max(best, order.indexOf(v))
  return best < 0 ? AVAILABILITY.absentInSearchedSet : order[best]
}

/**
 * ⭐⭐⭐ THE CHECK THE WHOLE LAYER IS BUILT AROUND.
 *
 * Given the items that went into a cognition step and the items that came out, return every place an axis
 * value was promoted without a warrant. An empty array is the invariant holding.
 *
 * ⚠️ `outputs` items are matched to `inputs` by `id`. An output with an id no input had is a DERIVED item,
 * and derived items are checked differently — see `combineBasis`: a derived item may not claim a basis
 * stronger than what its inputs support.
 *
 * @param {Array<object>} inputs  items with { id, basis, availability, retention }
 * @param {Array<object>} outputs same shape, plus optional { warrants: string[], derivedFrom: string[] }
 * @returns {Array<{id:string, axis:string, from:string, to:string, needed:string}>}
 */
export function findIllegalPromotions(inputs = [], outputs = []) {
  const byId = new Map(inputs.filter((i) => i && i.id != null).map((i) => [String(i.id), i]))
  const violations = []
  for (const out of outputs) {
    if (!out) continue
    const warrants = new Set(Array.isArray(out.warrants) ? out.warrants : [])
    const from = byId.get(String(out.id))

    if (!from) {
      // ── DERIVED ITEM. Its basis is bounded by its inputs (see combineBasis). Availability and retention
      // still need warrants to sit at the top: a derived item cannot be born `retained`.
      const parents = (Array.isArray(out.derivedFrom) ? out.derivedFrom : []).map((id) => byId.get(String(id))).filter(Boolean)
      if (parents.length) {
        const allowed = combineBasis(parents.map((p) => p.basis))
        if (out.basis === BASIS.attestedBySource && allowed !== BASIS.attestedBySource
            && !warrants.has(WARRANT.accessibleSource)) {
          violations.push({ id: String(out.id), axis: 'basis', from: `derived from ${allowed}`, to: out.basis, needed: WARRANT.accessibleSource })
        }
      }
      // ⭐ AVAILABILITY IS INHERITED, NOT EARNED. A conclusion drawn from two things she is holding in her
      // hand right now is itself in her hand — demanding an access warrant for that was wrong, and its own
      // test caught it. What it may NOT do is out-reach its parents: a claim resting on something
      // unreachable does not become reachable by being restated.
      if (parents.length) {
        const reach = bestAvailability(parents.map((p) => p.availability))
        if (isPromotion('availability', reach, out.availability)
            && !warrants.has(warrantFor('availability', reach, out.availability))) {
          violations.push({
            id: String(out.id), axis: 'availability', from: `derived from ${reach}`, to: out.availability,
            needed: warrantFor('availability', reach, out.availability),
          })
        }
      }
      // ⛔ RETENTION IS NEVER INHERITED. A newly derived item is not retained because its parent was —
      // retention is HER act, and a fresh conclusion has not been kept until she keeps it.
      if (out.retention === TOP.retention && !warrants.has(WARRANT.deliberateRetention)) {
        violations.push({ id: String(out.id), axis: 'retention', from: '(derived)', to: out.retention, needed: WARRANT.deliberateRetention })
      }
      continue
    }

    for (const axis of ['basis', 'availability', 'retention']) {
      const a = from[axis]
      const b = out[axis]
      if (!isPromotion(axis, a, b)) continue // equal, or a demotion — always legal
      const needed = warrantFor(axis, a, b)
      if (!warrants.has(needed)) violations.push({ id: String(out.id), axis, from: a, to: b, needed })
    }
  }
  return violations
}

/**
 * ⭐⭐ WHAT COMBINING SEVERAL ITEMS IS ALLOWED TO CLAIM.
 *
 * ⛔ THE HERMES RULE, MADE MECHANICAL: N items that merely agree produce `synthesized`. Only when EVERY
 * input is itself `attested-by-source` may the combination claim attestation — because then the attestation
 * is inherited, not manufactured.
 *
 * ⓘ A single input passes through unchanged: combining one thing is not synthesis.
 */
export function combineBasis(bases = []) {
  const list = bases.filter(Boolean)
  if (!list.length) return BASIS.inferred
  if (list.length === 1) return list[0]
  if (list.every((b) => b === BASIS.attestedBySource)) return BASIS.attestedBySource
  return BASIS.synthesized
}

/**
 * ⭐ CONFIDENCE TRAVELS BESIDE THE BASIS, NEVER INSTEAD OF IT.
 * Corroboration is allowed to raise a number. It is not allowed to change what kind of claim this is.
 * ⛔ Capped below 1: a synthesized belief that reads as certainty is the failure this file exists to stop.
 */
export function corroborate(confidence, supportedBy) {
  const base = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5
  const n = Number.isInteger(supportedBy) && supportedBy > 1 ? supportedBy : 1
  // diminishing, and asymptotic to 0.95 — never 1.0 from agreement alone
  return Math.min(0.95, base + (1 - base) * (1 - 1 / n) * 0.5)
}
