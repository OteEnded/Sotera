// ⭐⭐⭐ THE OWNERSHIP BOUNDARY — what ordinary semantic memory does NOT own.
//
// PURE. No store, no model, no host, no config.
//
// Ote, 2026-08-26: *"The goal isn't to make the current system understand everything. It's to make it
// know what it does not own instead of corrupting the meaning to fit the storage it happens to have."*
//
// ── ⭐⭐ THE ONE TEST THAT GENERATES ALL FIVE REFUSALS ─────────────────────────────────────────────
//     **Does a later statement REPLACE this one, or ACCUMULATE beside it?**
//
//   properties    REPLACE     — `location: Bangkok` → `Chiang Mai`. This is what `entity/attribute/value`
//                               and reconcile-in-place are FOR, and it is the only thing they are for.
//   intentions    ACCUMULATE  — two goals coexist
//   relationships ACCUMULATE  — Ote is both father and creator
//   designations  ACCUMULATE  — a project can have a name and a nickname
//
// ⇒ ⛔ forcing accumulating knowledge through a replacing slot is not a style problem: it is why
// `02b095e5` **superseded** the family lineage instead of extending it. And `entity` is a **string**, so
// a relationship whose endpoints are strings is not a relationship — it is a sentence with punctuation.
//
// ── ⛔ WHAT A REFUSAL MUST DO, AND THE THIRD ONE IS THE UNUSUAL ONE ───────────────────────────────
//   1. say WHY, in words a human can act on
//   2. say WHERE the material should eventually belong
//   3. ⭐⭐ say whether that destination **ACTUALLY EXISTS** — Ote: *"without pretending that destination
//      already exists if it doesn't."* `txn_intentions` exists and extraction cannot reach it;
//      a relationship store does not exist at all. Those are different facts and must not be blurred.
//   4. ⭐ say what should still be RETAINED. ⛔ A refusal is not a deletion: figurative material, relayed
//      speech and relationship talk all stay reachable as prose with their evidence. What is refused is
//      the **structured, property-shaped** representation, never the material.

// ── THE DESTINATIONS, AND THEIR HONEST STATUS ─────────────────────────────────────────────────────
// ⚠️ MEASURED 2026-08-26 against the live schema, not assumed. Two of these exist; one does not.
export const DESTINATION = Object.freeze({
  intentionStore: Object.freeze({
    name: 'txn_intentions',
    exists: true,
    // ⭐⭐ THE FINDING THAT REFRAMED THE ROME INCIDENT. The table is real —
    // `person_id · intent · why · progress · state · room_user_id` — and the extractor has no route to
    // it, so `7d383ce3` was written into a property slot while a purpose-built table sat two tables away.
    note: 'exists, and extraction has NO routing path to it — so an intention is prose-with-evidence until one is built',
  }),
  relationshipStore: Object.freeze({
    name: null,
    exists: false,
    // ⚠️ `txn_relational_records` is NOT this. It holds Sotera's own practice stances about a person,
    // from a CLOSED taxonomy, with one party and no relation. Naming it here would be the pretending
    // Ote explicitly forbade.
    note: 'does not exist. OteRM territory — ⛔ do not invent an attribute name for a link in the meantime',
  }),
  identitySlot: Object.freeze({
    name: 'txn_memories · namespace=identity · attribute=preferred_name',
    exists: true,
    note: 'exists but is ONE designation type, and only when the naming subject is established',
  }),
  prose: Object.freeze({
    name: 'txn_memories · prose, no entity/attribute/value',
    exists: true,
    note: 'always available — this is how material is retained when its structured form is refused',
  }),
})

export const REFUSAL = Object.freeze({
  intention: 'intention-as-property',
  relationship: 'relationship-as-property',
  designation: 'designation-without-established-subject',
  relayedSpeech: 'relayed-speech-as-self-fact',
  figurative: 'figurative-as-literal-property',
})

/** ⭐ Exported so a check can assert the INTENT rather than only the filtering. */
export const IT_MUST_KNOW_WHAT_IT_DOES_NOT_OWN =
  'Ordinary semantic memory owns PROPERTIES: claims where a later statement replaces this one. '
  + 'Intentions, relationships and designations ACCUMULATE, so a slot whose whole mechanism is '
  + 'reconcile-in-place cannot hold them without corrupting them. The boundary refuses the STRUCTURED '
  + 'representation and never the material: what is refused is still retained as prose with its evidence.'

const slotted = (row) => !!(row && (row.entity != null || row.attribute != null || row.value != null))
const flat = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * ⭐⭐ quotedRegions — the DOUBLE-quoted spans of a message. PURE, deterministic, no model.
 *
 * ⚠️⚠️ DOUBLE QUOTES ONLY, AND THE APOSTROPHE IS DELIBERATELY EXCLUDED. My first version of this
 * detector included `'`, and it matched *"i'm Kavi — i do a lot of late-night debugging and i'd"* as a
 * quoted utterance, because English contractions put an apostrophe at both ends of almost any span.
 * ⛔ That put two rows into the relayed-speech class that are nothing of the kind — people naming
 * themselves in their own prose. A detector that treats an apostrophe as a quotation mark MANUFACTURES
 * relays, which is worse than missing them.
 *
 * ⓘ This is deliberately NOT `assertionGate`. That gate strips fences, blockquotes, structured blobs and
 * transcribed-line runs — it was built for pasted DOCUMENTS, and it is why *"quoting is not asserting"*
 * was solved for documents and never for SPEECH. A relayed utterance is a different shape.
 */
export function quotedRegions(text) {
  return [...String(text ?? '').matchAll(/["“”]([^"“”]{8,})["“”]/g)].map((m) => m[1])
}

/** Is this value present ONLY inside quoted speech in the source text? */
export function onlyInsideQuotes(value, sourceText) {
  const v = flat(value)
  if (!v || !sourceText) return false
  const text = String(sourceText)
  // ⚠⚠ CUT THE QUOTED SPANS BY **INDEX**, NOT BY CONTENT — my first version did the latter and was wrong.
  // It removed every OCCURRENCE of the quoted region's text, so in *`call me Ote. I said "call me Ote"
  // earlier`* it deleted the speaker's own words along with the quotation and concluded the name appeared
  // only inside quotes. ⛔ That is over-triggering, which is the failure mode that quietly stops ordinary
  // capture working — the exact thing the Kavi control exists to catch.
  const matches = [...text.matchAll(/["“”]([^"“”]{8,})["“”]/g)]
  if (!matches.length) return false
  if (!matches.some((m) => flat(m[1]).includes(v))) return false
  let outside = ''
  let cursor = 0
  for (const m of matches) {
    outside += text.slice(cursor, m.index)
    cursor = m.index + m[0].length
  }
  outside += text.slice(cursor)
  // ⭐ AND NOT ALSO OUTSIDE ONE. *"call me Ote. I said \"call me Ote\" earlier"* is still the speaker
  // naming themselves; the quotation is incidental.
  return !flat(outside).includes(v)
}

/**
 * ⭐⭐⭐ admissibleToSlot — may this row occupy `entity/attribute/value`? PURE.
 *
 * @param {object} row              the proposed row: entity · attribute · value · content · modality
 * @param {object} [ctx]
 * @param {string} [ctx.target]     the SEMANTIC TARGET, if a producer declared one
 * @param {string} [ctx.sourceText] the message the row was taken from, for the relayed-speech check
 * @param {boolean} [ctx.subjectEstablished] whether the naming subject is actually established
 * @returns {null | {class, why, belongsTo, destinationExists, destinationNote, retain, declared}}
 *
 * ⚠️ RETURNS null WHEN IT CANNOT SEE. Three of the five refusals need an axis no producer sets in
 * production yet. ⛔ The boundary does not GUESS one — a heuristic here would be the fourth mechanism
 * this project has built that infers a semantic from a value's shape. It refuses what it can see and
 * `declaredAxes` reports what it was told, so "not refused" and "not examined" stay distinguishable.
 */
export function admissibleToSlot(row = {}, ctx = {}) {
  const { target = null, sourceText = null, subjectEstablished = null } = ctx
  const refuse = (cls, why, dest, retain) => ({
    class: cls, why,
    belongsTo: dest.name, destinationExists: dest.exists, destinationNote: dest.note,
    retain,
    declared: { target, modality: row.modality ?? null, sourceTextSeen: !!sourceText },
  })

  // ── 4 · RELAYED SPEECH — structurally visible TODAY, no declared axis needed ────────────────────
  // ⭐ The measured case: `here he come. "Hi, Sotera. I'm Cogito. I'm your uncle."` → `preferred_name =
  // "Cogito"` on OTE's account. The account holder was quoting somebody else, and speaker ≠ author.
  if (row.value != null && sourceText && onlyInsideQuotes(row.value, sourceText)) {
    return refuse(REFUSAL.relayedSpeech,
      'the value appears only inside quoted speech — the account holder was relaying somebody else, and '
      + 'the speaker of a quotation is not the author of the message',
      DESTINATION.prose,
      { as: 'prose', keepEvidence: true, note: 'the quotation is worth keeping; ⛔ the claim inside it is not the author\'s' })
  }

  // ── 3 · DESIGNATION WITHOUT AN ESTABLISHED SUBJECT ─────────────────────────────────────────────
  // ⭐ `preferred_name` is the ONE designation the store owns, and only when we actually know WHO is
  // being named. ⛔ `subjectEstablished === false` is a stated "we checked and we do not know"; `null` is
  // "nobody asked", and the two must not collapse — so only an explicit false refuses.
  if (row.attribute === 'preferred_name' && subjectEstablished === false) {
    return refuse(REFUSAL.designation,
      'a name was captured but the naming SUBJECT is not established — who is being named is a different '
      + 'question from who typed the turn',
      DESTINATION.identitySlot,
      { as: 'prose', keepEvidence: true, note: 'retain the naming act; ⛔ do not attach the name to a guessed subject' })
  }

  if (!slotted(row)) return null // prose is always admissible — nothing below is about prose

  // ── 1 · INTENTION AS A PROPERTY ────────────────────────────────────────────────────────────────
  // ⭐⭐ THE ROME ROW, EXACTLY: `entity=user · attribute="current goal" · value="build Rome in one day"`.
  // An intention ACCUMULATES — two goals coexist — so a slot whose mechanism is reconcile-in-place is
  // the wrong container regardless of how the sentence was meant.
  if (target === 'intention') {
    return refuse(REFUSAL.intention,
      'an intention accumulates; a fact slot replaces. `user\'s current goal` is a property-shaped '
      + 'representation of something that is not a property',
      DESTINATION.intentionStore,
      { as: 'prose', keepEvidence: true, note: 'retain as prose with evidence until extraction can reach the intention store' })
  }

  // ── 2 · RELATIONSHIP AS A PROPERTY ─────────────────────────────────────────────────────────────
  // ⭐⭐ A relationship has TWO parties and `entity` is a string. Storing *Claude → uncle → Sotera* as a
  // property of "user" is the family-lineage defect in its original form.
  if (target === 'relationship') {
    return refuse(REFUSAL.relationship,
      'a relationship has two parties and accumulates; `entity` is a single string, so a link stored here '
      + 'is a sentence with punctuation rather than a relation',
      DESTINATION.relationshipStore,
      { as: 'prose', keepEvidence: true, note: '⛔ do NOT invent an attribute name for the link' })
  }

  // ── 5 · FIGURATIVE AS A LITERAL PROPERTY ───────────────────────────────────────────────────────
  // ⭐ Ote: *"don't discard it; retain the evidence/prose, but don't materialize a literal property."*
  // ⓘ Migration 031's CHECK enforces the same rule in the database for any non-literal modality; this
  // arm is the half that can EXPLAIN itself, and it names the retention explicitly.
  if (row.modality && row.modality !== 'asserted') {
    return refuse(REFUSAL.figurative,
      `the source was ${row.modality}, so the literal proposition is not what was meant — a fact slot's `
      + 'attribute NAMES A CLAIM, and this would assert one the speaker did not make',
      DESTINATION.prose,
      { as: 'prose', keepEvidence: true, note: '⭐ the material is kept; only the literal, structured form is refused' })
  }

  return null
}

/** ⭐ Which axis-dependent refusals could NOT be evaluated, so silence is never read as approval. */
export function unevaluated(ctx = {}) {
  const missing = []
  if (ctx.target == null) missing.push('target (intention · relationship · designation vs property)')
  if (ctx.sourceText == null) missing.push('sourceText (relayed-speech detection)')
  if (ctx.subjectEstablished == null) missing.push('subjectEstablished (designation)')
  return missing
}
