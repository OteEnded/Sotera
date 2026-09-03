// ⭐⭐⭐ M2-6 · CANDIDATE SELECTION — it produces CANDIDATES, ⛔ NOT EVIDENCE.
//
// PURE. No stores, no IO, no config, no model. Rows are handed in.
//
// ── ⭐⭐⭐ C0 · WHAT THIS PROMISES, AND WHAT IT REFUSES TO PROMISE ───────────────────────────────
//
//     The selector guarantees a hard containment boundary, an explicit provenance class on every
//     candidate, and an inspectable key. ⛔ It does NOT guarantee that a candidate BEARS ON the claim,
//     and nothing downstream may assume it does.
//
// ⚠️⚠️ The pipeline's unstated premise was *"the selector returned it ⇒ it bears on the claim."* ⛔ No
// exact key can repair that, and the measurements say so rather than an opinion: the slot label admits
// roots containing none of the belief (`dry dock` **5 roots → 0** carrying the value) and MISSES roots
// that carry it (`genre focus` **0 → 2**); value- and source-matching each fall **below the O-2 floor**
// (93% of slots reach exactly one root through the source chain).
// ⇒ ⭐ the honest move is to rename the promise, ⛔ not to fake the guarantee. Same shape as
// *"the corpus may RANK; a current view decides ADMISSION; audit provides AUTHORITY"* and M2-6's own
// *"root independence certifies the COUNT, ⛔ not the RELEVANCE."*
//
// ── ⛔ WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────────────────────────
// ⛔ No embedding · ⛔ no similarity · ⛔ no threshold · ⛔ no classifier · ⛔ no hidden semantic filter.
// ⭐ *"Why was this turn selected?"* must keep a one-word answer, so every predicate here is exact and
// every candidate records WHICH probe admitted it.

/** ⭐ C2's vocabulary. ⛔ Frozen, and there is no third value — see `REFUSAL.unclassifiable`. */
export const CANDIDATE_PROVENANCE = Object.freeze({ primary: 'primary', secondary: 'secondary' })

/** ⭐ Why a row was refused. ⛔ Every refusal is NAMED — a dropped row with no reason is a silent filter. */
export const REFUSAL = Object.freeze({
  outOfContext: 'out-of-formation-context',
  unclassifiable: 'speaker-is-neither-the-subject-nor-sotera',
  noRoot: 'no-conversation-root',
  noProbeMatch: 'matched-no-probe',
})

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'or', 'in', 'on', 'for', 'is', 'my', 'own', 'user'])

/** ⭐ Tokenise exactly as the label probe always has. ⛔ Unchanged, deliberately — C3 ADDS a probe. */
const termsOf = (text) => String(text ?? '')
  .toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !STOP.has(t))

/**
 * ⭐⭐ C3 · THE KEY IS `label ∪ value` — TWO PROBES, ⛔ NOT ONE MERGED BAG.
 *
 * A row is a candidate if it satisfies **either probe conjunctively**. ⭐ Two probes rather than a merged
 * token bag because a merged bag would admit a row matching one label word and one value word and
 * nothing coherent — and *"which probe admitted this?"* would stop having an answer.
 *
 * ⚠️ **UNION, ⛔ NOT REPLACEMENT.** Measured, each finds what the other cannot:
 *   `genre focus` label **0** roots / value **2**  ·  `dry dock` label **5** / value **0**
 * ⇒ dropping either loses roots, and ⛔ a missed root is unrecoverable — the claim cannot be made at all.
 */
export function probesFor({ attribute, value } = {}) {
  const label = termsOf(attribute)
  const val = termsOf(value)
  const probes = []
  if (label.length) probes.push({ id: 'label', terms: label })
  if (val.length) probes.push({ id: 'value', terms: val })
  return probes
}

/** ⭐ Which probe admits this text? Returns the probe id, or null. ⛔ Conjunctive within a probe. */
export function probeMatching(text, probes) {
  const t = String(text ?? '').toLowerCase()
  for (const p of probes) if (p.terms.every((term) => t.includes(term))) return p.id
  return null
}

/**
 * ⭐⭐⭐ C2 · THE PROVENANCE CLASS OF ONE TURN — and the case that must NOT be guessed.
 *
 *   **primary**   the SUBJECT's own words
 *   **secondary** SOTERA's observation about the subject
 *
 * ⛔⛔ AND A THIRD CASE EXISTS THE MOMENT SUBJECT ≠ ROOM OWNER: a turn by the room's account holder who
 * is NOT the subject is a THIRD PARTY speaking about the subject. It is neither of the two classes.
 * ⭐ It is **REFUSED as unclassifiable**, ⛔ never defaulted — because an unclassified candidate would
 * become `primary` downstream, and representing somebody else's words as the subject's own is exactly
 * what Ote's ruling ① forbids:
 *
 *     *"Secondary evidence may contribute to the recurrence count, but it must NEVER be represented as
 *      if the subject directly said or observed it."*
 *
 * ⇒ ⭐⭐ the refusal is the SIGNAL that a semantic ruling is owed, ⛔ not a gap to paper over. Ote:
 * *"When we get a genuine cross-subject case, we can make the permanent semantic ruling from an actual
 * case rather than inventing it now."*
 *
 * @param {{role: string}} turn
 * @param {{subjectPersonId: string|null, roomOwnerPersonId: string|null}} ctx
 */
export function provenanceOf(turn, { subjectPersonId = null, roomOwnerPersonId = null } = {}) {
  // ⭐ SOTERA'S OWN TURN IS SECONDARY WHOEVER THE SUBJECT IS. Her observation is hers; the room's owner
  // does not change who spoke. ⛔ And it is ADMITTED — ruling ①: *"Don't exclude Sotera's own
  // observations simply because she is the speaker. That would make her unable to learn patterns she
  // herself notices."*
  if (turn?.role === 'assistant') {
    return { ok: true, provenance: CANDIDATE_PROVENANCE.secondary, speaker: 'sotera' }
  }
  if (turn?.role !== 'user') {
    return { ok: false, refusal: REFUSAL.unclassifiable, why: `role ${turn?.role ?? 'unknown'} is neither the subject nor Sotera` }
  }
  // ⛔⛔ THE DIVERGENT CASE. `subjectPersonId` and `roomOwnerPersonId` are SEPARATE AXES and neither is
  // derived from the other; when they differ, the account holder speaking is a third party.
  if (subjectPersonId && roomOwnerPersonId && subjectPersonId !== roomOwnerPersonId) {
    return {
      ok: false,
      refusal: REFUSAL.unclassifiable,
      why: 'the room\'s account holder is not the subject — a third party speaking about the subject is '
        + 'neither primary nor secondary, and classing it either way would misrepresent who said it',
    }
  }
  return { ok: true, provenance: CANDIDATE_PROVENANCE.primary, speaker: 'subject' }
}

/**
 * ⭐⭐⭐ selectCandidates — C1 + C2 + C3 in one pass.
 *
 * @param {object} o
 * @param {Array<{message_id, conversation_id, content, role, room}>} o.rows
 * @param {string} o.formationContext  ⭐ the CONTAINMENT boundary, resolved from the SLOT by the caller.
 *        ⛔⛔ This is NOT a statement about ownership, and NOT a claim that the subject is this room's
 *        owner. Ote: *"'formation context' is not 'the room this memory is for.' It is simply the
 *        structural context from which the candidate is allowed to be drawn. Sotera's memory remains
 *        Sotera-owned, independently of that context."*
 * @param {string|null} o.subjectPersonId     ⭐ a SEPARATE axis
 * @param {string|null} o.roomOwnerPersonId   ⭐ a SEPARATE axis — ⛔ neither is derived from the other
 * @returns {{ok, candidates, refused, roots, why}}  ⭐ named `candidates`, ⛔ never `evidence`
 */
export function selectCandidates({
  rows = [], slot = {}, formationContext = null, subjectPersonId = null, roomOwnerPersonId = null,
} = {}) {
  if (!formationContext) {
    // ⛔ FAIL CLOSED. An unbounded candidate set is how the caller-discipline defect happened: 12b added
    // `c.user_id = $1` by hand and nothing would have noticed if it had not.
    return { ok: false, candidates: [], refused: [], roots: 0, why: 'no formation context — refusing to select from an unbounded set' }
  }
  const probes = probesFor(slot)
  if (!probes.length) {
    return { ok: false, candidates: [], refused: [], roots: 0, why: 'the slot yields no usable probe from either its label or its value' }
  }

  const candidates = []
  const refused = []
  for (const r of rows) {
    // ── C1 · THE CONTAINMENT BOUNDARY, first and structural ──────────────────────────────────────
    if (r.room !== formationContext) { refused.push({ messageId: r.message_id, refusal: REFUSAL.outOfContext }); continue }
    if (!r.conversation_id) { refused.push({ messageId: r.message_id, refusal: REFUSAL.noRoot }); continue }
    // ── C3 · an exact probe, and WHICH one is recorded ───────────────────────────────────────────
    const via = probeMatching(r.content, probes)
    if (!via) { refused.push({ messageId: r.message_id, refusal: REFUSAL.noProbeMatch }); continue }
    // ── C2 · every candidate classified, or refused ⛔ never defaulted ───────────────────────────
    const prov = provenanceOf(r, { subjectPersonId, roomOwnerPersonId })
    if (!prov.ok) { refused.push({ messageId: r.message_id, refusal: prov.refusal, why: prov.why }); continue }
    candidates.push({
      messageId: r.message_id,
      root: r.conversation_id,
      // ⛔ The speaker travels WITH the candidate and into the warrant, so a secondary cite can never be
      // rendered as the subject's own words by a downstream reader that simply did not know.
      provenance: prov.provenance,
      speaker: prov.speaker,
      admittedBy: via,
      excerpt: String(r.content ?? '').slice(0, 300),
    })
  }

  const roots = new Set(candidates.map((c) => c.root)).size
  return {
    ok: candidates.length > 0,
    candidates,
    refused,
    roots,
    // ⭐ BOTH CLASSES COUNT (ruling ①). Reported separately so a reader can SEE the mix, ⛔ never so that
    // one can be discounted.
    primary: candidates.filter((c) => c.provenance === CANDIDATE_PROVENANCE.primary).length,
    secondary: candidates.filter((c) => c.provenance === CANDIDATE_PROVENANCE.secondary).length,
    why: `${candidates.length} candidate(s) across ${roots} root(s); ${refused.length} refused`,
  }
}

/** ⛔ Exported so a check can assert the INTENT, not merely the branching. */
export const CANDIDATES_ARE_NOT_EVIDENCE =
  'This produces candidates and says so. It guarantees that nothing outside the slot\'s formation context '
  + 'is drawn, that every candidate carries an explicit provenance class, and that the key that admitted '
  + 'it is recorded. It does not guarantee that a candidate bears on the claim, because the measurements '
  + 'show no exact key can: the label admits roots containing none of the belief and misses roots that '
  + 'carry it. Formation context is a containment boundary and not a statement about ownership or about '
  + 'who the subject is; subject identity and formation context are separate axes and neither is derived '
  + 'from the other. Sotera\'s own observations are admitted and counted as secondary rather than thrown '
  + 'away, and a third party speaking in a room that is not the subject\'s own is refused rather than '
  + 'classed, because that case needs a ruling nobody has made.'
