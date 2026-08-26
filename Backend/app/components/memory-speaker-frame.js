// ⭐⭐⭐ THE SPEAKER FRAME — four questions one value is currently answering.
//
// PURE. No store, no model, no host.
//
// Ote, 2026-08-26: *"Don't try to solve all four inside captureIdentity by another heuristic. Make the
// missing speaker/subject information explicit in the architecture and show me what evidence is
// available to establish each one."*
//
// ⇒ ⛔ THIS FILE DECIDES NOTHING. It does not classify, infer, or repair. It declares the four roles,
// states which of them the system can actually establish today and from what, and returns `unknown` —
// loudly and by name — for the two it cannot. A module that guessed here would be the fifth mechanism
// this project has built that infers a semantic from a value's shape, and the fourth to be wrong.
//
// ── ⚠️⚠️ THE MEASURED FAILURE ────────────────────────────────────────────────────────────────────
// `here he come. "Hi, Sotera. I'm Cogito. I'm your uncle."` — typed by Ote, quoting Cogito — became
// `preferred_name = "Cogito"` on **Ote's** account. `captureIdentity` runs on the turn's text and writes
// to the ROOM OWNER, so all four roles below resolved to one value and three of them were wrong.

/** The four roles. ⭐ Naming them apart is the entire contribution of this file. */
export const ROLE = Object.freeze({
  // The ACCOUNT the turn was typed from. Recorded, reliably.
  messageAuthor: 'messageAuthor',
  // Whose room the conversation lives in. Recorded, reliably. ⓘ Usually equals messageAuthor, which is
  // precisely why the two were never told apart — a coincidence that held until it did not.
  roomOwner: 'roomOwner',
  // ⭐⭐ WHO IS TALKING INSIDE THE MESSAGE. Nothing records this.
  speakerIdentity: 'speakerIdentity',
  // ⭐⭐ WHO A NAME IS BEING ATTACHED TO. Nothing records this; it is ASSUMED to be the room owner.
  namingSubject: 'namingSubject',
})

/**
 * ⭐⭐⭐ WHAT EVIDENCE EXISTS FOR EACH ROLE, TODAY. This is the answer to Ote's question, and it is
 * deliberately a data structure rather than prose so a check can assert it and it cannot rot quietly.
 *
 * `establishable` is the honest status:
 *   `recorded`  — a column holds it; reading it is not an inference
 *   `derivable` — no column, but a deterministic walk gets there
 *   ⛔ `absent`  — nothing in the schema carries it, and no amount of care changes that today
 */
export const EVIDENCE = Object.freeze({
  [ROLE.messageAuthor]: Object.freeze({
    establishable: 'derivable',
    from: 'txn_messages.conversation_id → txn_conversations.user_id (+ role = user)',
    certainty: 'exact',
    note: 'the ACCOUNT, which is not the same claim as the person behind it — hermes and hermes_alias are two accounts, one person',
  }),
  [ROLE.roomOwner]: Object.freeze({
    establishable: 'recorded',
    from: 'txn_conversations.user_id',
    certainty: 'exact',
    note: 'the room is a scope, never a credential and never an identity',
  }),
  [ROLE.speakerIdentity]: Object.freeze({
    establishable: 'absent',
    from: null,
    certainty: null,
    // ⭐ CANDIDATE EVIDENCE, NAMED BUT NOT IMPLEMENTED. Listing them is the point: it shows the gap is
    // fillable and that nothing has filled it, ⛔ rather than inviting a heuristic today.
    candidates: Object.freeze([
      'a DOUBLE-QUOTED region containing a first-person naming act (the Cogito shape) — deterministic, no model',
      'an explicit frame the human typed: "this is Ote in Claude\'s account" — measured live, and currently ignored',
      'a signature line ("— Uncle Cogito")',
      'an interface/channel identity, if a relay ever declared one',
    ]),
    note: '⛔ ABSENT. A message can carry someone who owns no account, no room and no session.',
  }),
  [ROLE.namingSubject]: Object.freeze({
    establishable: 'absent',
    from: null,
    certainty: null,
    candidates: Object.freeze([
      'the speaker, when the naming act is first-person AND the speaker is established',
      'an explicit third-party designation ("Claude will be your uncle") — ⚠️ which is a RELATIONSHIP act, not a self-naming one',
    ]),
    note: '⛔ ABSENT, and today it is ASSUMED to be the room owner. That assumption is the defect.',
  }),
})

/**
 * frameFor — what can be established about one turn, and what cannot. PURE.
 *
 * ⛔ RETURNS `unknown` RATHER THAN A BEST GUESS. `speakerIdentity` and `namingSubject` come back
 * `unknown` **always**, today, by construction — not because this turn was hard, but because the schema
 * does not carry them. ⭐ A caller that needs them must treat `unknown` as a reason to REFUSE, never as
 * permission to fall back to the room owner, which is exactly how `"Cogito"` was written onto Ote.
 *
 * @param {{roomOwnerId?:string|null, messageAuthorId?:string|null, role?:string|null}} turn
 */
export function frameFor(turn = {}) {
  const known = (v) => (v == null ? { value: null, status: 'unknown' } : { value: v, status: 'established' })
  return {
    [ROLE.roomOwner]: known(turn.roomOwnerId ?? null),
    [ROLE.messageAuthor]: turn.role === 'user' ? known(turn.messageAuthorId ?? turn.roomOwnerId ?? null) : { value: null, status: 'unknown' },
    // ⛔ NOT DERIVED FROM THE OTHERS. That derivation is the bug.
    [ROLE.speakerIdentity]: { value: null, status: 'unknown', because: 'nothing in the schema records who is talking inside a message' },
    [ROLE.namingSubject]: { value: null, status: 'unknown', because: 'nothing records who a name is being attached to; it has been assumed to be the room owner' },
  }
}

/**
 * ⭐⭐ mayAttachName — the gate `captureIdentity` would consult if it consulted anything.
 *
 * ⛔ It is NOT wired into capture, deliberately: wiring it would silently stop identity capture working
 * everywhere, since `namingSubject` is `unknown` on every turn today. That is a behaviour change Ote has
 * not approved and would be a far bigger act than it looks.
 * ⭐ What it IS for: making the boundary's `subjectEstablished` input answerable by something other than
 * my opinion, and giving the eventual fix a place to land that is already tested.
 */
export function mayAttachName(frame = {}) {
  const subject = frame[ROLE.namingSubject]
  if (subject?.status === 'established') return { ok: true, subject: subject.value }
  return {
    ok: false,
    reason: subject?.because ?? 'the naming subject is not established',
    // ⛔ AND IT NAMES WHAT IT WOULD NEED, so the refusal is a specification rather than a complaint.
    needs: EVIDENCE[ROLE.namingSubject].candidates,
  }
}

/** ⭐ The four, and how many are actually establishable today. For a check, and for a human reading it. */
export const FRAME_COVERAGE = Object.freeze({
  total: 4,
  establishable: Object.values(ROLE).filter((r) => EVIDENCE[r].establishable !== 'absent').length,
  absent: Object.values(ROLE).filter((r) => EVIDENCE[r].establishable === 'absent'),
})
