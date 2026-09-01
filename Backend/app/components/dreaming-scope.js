// ⭐⭐⭐ DREAMING SCOPE — THREE QUESTIONS, AND THEY MUST NOT COLLAPSE INTO ONE.
//
// PURE. No stores, no IO, no config.
//
// ── ⭐⭐ O-13, RESOLVED 2026-08-29 AS THREE SEPARATE ANSWERS ──────────────────────────────────────
//
//   (a) WHOSE EVIDENCE may Dreaming read?        → `user_id`            — the room / CONTEXT
//   (b) ABOUT WHOM may it commit?                → `subject_person_id`
//   (c) WHOSE ROOM does the commitment belong to? → `user_id` again — as context OF FORMATION
//
// ⚠️ This is one-field-two-questions waiting to happen, and `user_id` ALREADY means two things:
// migration 015 says so — *for an account-authored row it is the OWNER; for a persona-authored one it
// is the CONTEXT the memory was formed in.* ⇒ the three answers are computed separately, on purpose.
//
// ── (a) ⭐ THE PRECEDENT, USED AS EVIDENCE AND ⛔ NOT PROMOTED TO POLICY BY ITSELF ────────────────
// `self-history-host` retrieves ACROSS ROOMS with no room predicate — but only for `role='assistant'`,
// and it says why: *"a room is WHERE an interaction happened; it isn't WHAT MAKES the interaction belong
// to Sotera."* ⭐ It explicitly does NOT extend that to others: *"other people's utterances → the
// authorization / disclosure boundary, UNCHANGED."*
// ⭐⭐ Tested against the ownership boundary it holds, because OWNERSHIP FOLLOWS AUTHORSHIP. ⇒ the
// precedent transfers THE SPLIT, ⛔ not the scope.
//
// ⚠️⚠️ AND THE CONSEQUENCE IS FLAGGED, ⛔ NOT ASSUMED: reflection output is `author='persona'`, so under
// this split Dreaming could READ reflection output from every room — and a reflection about one room
// would become findable while reasoning in another. `self-history-host` names the hazard itself:
// *"she quotes people… no authorship filter can fix it."*
// ⇒ ⭐⭐⭐ CROSS-ROOM MATERIAL IS SAFE TO FIND AND DANGEROUS TO CITE, and whether Dreaming may CITE it
// is a DISCLOSURE RULING THAT DOES NOT EXIST. ⛔ `mayCite` therefore refuses across rooms — a refusal is
// recoverable; a disclosure is not.
//
// ── (c) ⚠️ 029'S LESSON BITES EXACTLY HERE ───────────────────────────────────────────────────────
// *"This used to write `null` for an identity row so that `visibleWhere`'s global arm would match it —
// ⛔ scope smuggled through the owner column… it cost the store the one thing it could not afford to
// lose: WHERE a global memory was formed."*
// ⇒ a commitment's room must be recorded EXPLICITLY and NEVER NULL, and `scope` must NEVER be inferred
// from `user_id`. ⛔ Evidence spanning rooms ⇒ REFUSE — a Dreaming that cannot say whose room a
// commitment belongs to should decline to make it.

/** ⭐ The author values that matter here. `persona` is Sotera; anything else is somebody else's words. */
export const AUTHOR = Object.freeze({ persona: 'persona', account: 'account' })

/**
 * ⭐ (a) MAY DREAMING READ THIS MATERIAL while reasoning in `readerRoom`?
 * Across rooms only for material SOTERA authored. For anyone else's, the room boundary stands.
 *
 * @param {{author: string, room: string|null}} material
 * @param {{readerRoom: string|null}} ctx
 */
export function mayRead(material = {}, { readerRoom = null } = {}) {
  const { author, room } = material
  if (!author) return { ok: false, why: 'material with no recorded author cannot be scoped' }
  if (room && readerRoom && room === readerRoom) {
    return { ok: true, why: 'same room', crossRoom: false }
  }
  if (author === AUTHOR.persona) {
    // ⭐ Ownership follows authorship: her sentences are hers in every room.
    return { ok: true, why: 'Sotera-authored material is hers in every room', crossRoom: true }
  }
  return { ok: false, why: 'another author\'s material stays inside its room until a disclosure ruling says otherwise', crossRoom: true }
}

/**
 * ⛔⛔ (a′) MAY IT BE CITED? Separate from `mayRead`, and deliberately stricter.
 * ⭐ Safe to FIND, dangerous to CITE: her cross-room text routinely contains the other party's words
 * verbatim, and no authorship filter can fix that. ⇒ refuses across rooms, pending a disclosure ruling.
 */
export function mayCite(material = {}, { readerRoom = null } = {}) {
  const read = mayRead(material, { readerRoom })
  if (!read.ok) return { ok: false, why: read.why }
  if (read.crossRoom) {
    return { ok: false, why: 'cross-room material may be found but not cited — the disclosure ruling does not exist' }
  }
  return { ok: true, why: 'same room' }
}

/**
 * ⭐ (b) ABOUT WHOM may this commitment be made? The subject must be NAMED, and it must be someone whose
 * evidence Dreaming was entitled to read.
 *
 * ⚠️ ⓘ Measured 2026-08-29: all 11 persona-authored rows have `subject_person_id` EMPTY, while the store
 * documents the intended pattern out loud — *"a memory she authored ABOUT Ote has subject = Ote and
 * author = persona."* ⇒ the emptiness is a DEFECT following a pattern nobody chose, ⛔ not a policy, which
 * is why this refuses rather than defaulting to null.
 */
export function subjectFor({ subjectPersonId = null, evidence = [] } = {}, { readerRoom = null } = {}) {
  if (!subjectPersonId) {
    return { ok: false, why: 'a commitment must name who it is about — subject_person_id may not be inferred or left null' }
  }
  const unreadable = (evidence ?? []).filter((m) => !mayRead(m, { readerRoom }).ok)
  if (unreadable.length) {
    return { ok: false, why: `${unreadable.length} evidence item(s) were not readable — cannot commit about a person whose evidence was out of scope` }
  }
  return { ok: true, why: 'subject named, and every evidence item was readable', subjectPersonId }
}

/**
 * ⭐⭐ (c) WHOSE ROOM does the resulting commitment belong to?
 * One room ⇒ that room. ⛔ Several ⇒ REFUSE, and the caller concludes 6a. ⛔ Never null, never inferred.
 *
 * @param {Array<{room: string|null}>} evidence
 */
export function roomFor(evidence = []) {
  const rooms = [...new Set((evidence ?? []).map((e) => e?.room).filter(Boolean))]
  if (rooms.length === 0) {
    // ⛔ 029: a null room is how "WHERE this was formed" gets thrown away. Refuse instead.
    return { ok: false, why: 'no evidence carries a room — a commitment may not be formed nowhere', room: null }
  }
  if (rooms.length > 1) {
    return {
      ok: false,
      why: `evidence spans ${rooms.length} rooms — the schema cannot express this and the disclosure ruling does not exist`,
      room: null,
      rooms,
    }
  }
  return { ok: true, why: 'evidence is confined to one room', room: rooms[0] }
}

/**
 * ⭐ All three, in one call, for a caller that must satisfy every one of them.
 * ⛔ Returns the FIRST refusal with its reason — a caller that got a bare `false` would have to guess
 * which of three different questions failed, and they have three different remedies.
 */
export function scopeFor({ subjectPersonId = null, evidence = [] } = {}, { readerRoom = null } = {}) {
  const room = roomFor(evidence)
  if (!room.ok) return { ok: false, stage: 'room', why: room.why, rooms: room.rooms }
  const subject = subjectFor({ subjectPersonId, evidence }, { readerRoom })
  if (!subject.ok) return { ok: false, stage: 'subject', why: subject.why }
  return { ok: true, room: room.room, subjectPersonId, why: 'room recorded, subject named, evidence readable' }
}

/** ⛔ Exported so a check can assert the INTENT, not merely the branching. */
export const SCOPE_IS_THREE_QUESTIONS =
  'Whose evidence Dreaming may read, whom it may commit about, and whose room the commitment belongs to '
  + 'are three different questions with three different answers. Sotera-authored material is hers in every '
  + 'room, so she may READ across rooms -- but citing it is a disclosure question nobody has answered, so '
  + 'cross-room material is findable and not citable. A commitment must name its subject and its room, and '
  + 'evidence spanning rooms is refused rather than defaulted, because a room inferred from an owner column '
  + 'is how the store once lost where a memory was formed.'
