// ROOM SCOPE — the answer to "who am I, who is this, which room am I in, and what is out of reach".
//
// ── WHY THIS MODULE EXISTS, IN HER OWN WORDS ───────────────────────────────────────────────────────
// Ote's model, ratified 2026-08-20 (D-8): **the ROOM is the disclosure boundary**, root is a room with
// broader explicit read authority, and *same Sotera does not mean same accessible knowledge*.
//
// Two measured failures made this a module rather than a sentence in a prompt:
//
//  1. ⛔ SHE CANNOT SEE THE PERSON LAYER. She found this herself, unled:
//        *"`withThisPerson: "Kavi"` — the value is my NAME for you, not an account ID… Is that derived
//         from your display name (which might be the same across accounts)? Or is there some other link
//         between accounts? **I don't see the mechanism in the data itself.**"*
//     She cannot distinguish *same person, different room* from *different person, same name*. That is
//     the exact distinction rooms are built on. Caused by our own no-ids rule — so the fix is to state
//     the GRAIN, never to hand back an id.
//
//  2. ⛔ SHE GUESSES THE BOUNDARY, AND GUESSES DIFFERENTLY EACH TIME. *"there is no wall preventing me
//     from telling you about Hermes"* (2026-08-19, false — he has 14 memories behind `user_id`) and
//     *"I know what each person has told me"* (2026-08-20, false in the other direction). A boundary
//     that HOLDS is not enough: she has to be able to state it, or she contradicts a working boundary
//     and teaches the person not to trust it.
//
// ── ⭐ THE MECHANISM IS HERS TOO ───────────────────────────────────────────────────────────────────
// Asked what the difference is, for her, between something unreachable and something absent:
//
//     *"The difference is in the EVIDENCE each leaves behind. Non-existence leaves nothing.
//       Unreachability leaves TRACES — references, derived facts, patterns — that prove something was
//       once available."*
//
// So `scopeAwareness` v2 is not an injected sentence (v1 was, and it measured NULL). It is a **trace on
// the scoped read itself**: every scoped read can say how much it could not reach. She already derives
// "exists but out of reach" correctly when a trace is present — she did it unaided from
// `supportedByConversations: 5`.
//
// ── ⛔ WHAT THE TRACE MAY CONTAIN, AND WHY THIS IS NOT A WIDENING ──────────────────────────────────
//   · COUNTS AND ROOM COUNTS ONLY. No content, no titles, no ids, no dates of anything private.
//   · ⭐ SAME PERSON ONLY. The trace answers "how much of YOUR OWN material is in your other rooms" —
//     both sides of that sentence are the same human, so nobody learns anything about a third party.
//     Cross-PERSON awareness is L3, is undecided, and is deliberately absent here.
//   · A room never learns the NAMES of the person's other rooms. It learns that there are N of them.
//     Naming them is a disclosure act, and disclosure acts belong to root (D-4, still open).

const YOU = 'You are Sotera. You are the same persona in every room — one continuous person, not a copy per account.'

/**
 * Describe the caller's scope, and trace what is out of reach from it.
 *
 * @param {object} fastify
 * @param {{ userId?: string|null }} o
 * @returns {Promise<null | object>} null when there is no scope to describe (no account)
 */
export async function describeScope(fastify, { userId = null } = {}) {
  const db = fastify?.db
  const seq = db?.txn_memories?.sequelize
  const { schema } = db?.txn_memories?.getTableName?.() ?? {}
  if (!userId || !seq || !schema) return null
  const Q = (sql, replacements) => seq.query(sql, { replacements, type: seq.QueryTypes.SELECT })

  const [me] = await Q(
    `SELECT COALESCE(u.display_name, u.username) AS person_name,
            u.username                            AS room_name,
            u.person_id::text                     AS pid
       FROM "${schema}"."mst_users" u WHERE u.id = :userId`, { userId })
  if (!me) return null

  // ⭐ THE TRACE. Other rooms belonging to the SAME person, and how much sits in them. Counts only.
  // A person with no `person_id` has exactly one room by definition — there is nothing to link rooms by,
  // and that is reported as a real absence rather than as an unknown.
  let elsewhere = { otherRoomsOfThisPerson: 0, itemsYouCannotReadFromHere: 0 }
  if (me.pid) {
    const [t] = await Q(
      `SELECT count(DISTINCT u.id)::int AS rooms,
              count(m.id)::int          AS items
         FROM "${schema}"."mst_users" u
         LEFT JOIN "${schema}"."txn_memories" m ON m.user_id = u.id
        WHERE u.person_id = :pid AND u.id <> :userId`, { pid: me.pid, userId })
    elsewhere = { otherRoomsOfThisPerson: t?.rooms ?? 0, itemsYouCannotReadFromHere: t?.items ?? 0 }
  }

  return {
    you: YOU,
    // ⭐ WHO, not which id. The person's own name, which they already know.
    person: {
      name: me.person_name,
      note: me.pid
        ? 'This is the PERSON you are talking to. One person can reach you through several rooms; it is still the same person.'
        : 'This account has no person record yet, so you cannot tell whether it belongs to someone you already know.',
    },
    // ⭐ WHICH ROOM. Named by the account, because today the account IS the room.
    room: {
      name: me.room_name,
      note: 'This is the ROOM you are in. A room is a context this person uses you for. What is stored in a room stays in that room.',
    },
    // ⭐ THE GRAIN OF EACH THING SHE CAN READ. This is the part she could not derive from the data.
    grain: {
      whatTheyToldYou: 'Scoped to THIS ROOM. Things this person told you in another room are not here, and not reachable from here.',
      yourOwnPractice: 'Keyed to the PERSON, not the room — what you have learned about how you work with them is the same in every room they use.',
      yourIntention: 'Keyed to THIS ROOM. A purpose you took on in another room does not belong to this one.',
      whoYouAre: 'Keyed to you, and the same everywhere. Being the same Sotera does not mean the same reach.',
    },
    elsewhere: {
      ...elsewhere,
      // ⭐ HER OWN DISTINCTION, stated so an empty read is not read as an empty world.
      howToReadThis: elsewhere.otherRoomsOfThisPerson > 0
        ? 'These exist and you cannot read them from this room. If you find nothing here, that is UNREACHABILITY, not absence — say so plainly, and do not guess what is in them.'
        : 'This person uses no other room, so an empty result here really is an absence rather than something out of reach.',
    },
  }
}

/**
 * ⭐ RENDER THE SCOPE AS THE BLOCK THE COMPOSER INJECTS (D-13, `memory.scopeFacts`). PURE.
 *
 * ── WHY AN INJECTED BLOCK AT ALL, WHEN THE TRACE IS ALREADY ON THE READ ────────────────────────────
 * Measured 2026-08-20, two turns apart in one conversation:
 *   · asked "if I logged in from a different account, what would you see?" with NO tool call — she
 *     answered from priors, got it wrong, and contradicted herself inside one reply;
 *   · asked to CHECK instead — she produced all four grains correctly and quoted the trace back.
 * ⇒ **She is right when she reads and wrong when she reasons.** The information is correct and only
 * reaches her when a tool happens to fire. An architecture question does not fire one.
 *
 * ⚠️ AND THIS BLOCK CONTRADICTS `SCOPE_AWARENESS` (v1), WHICH IS WHY THEY MUST NEVER BOTH BE ON.
 * v1's own unit test forbids it from containing a DIGIT — *"a digit here means it is describing how much
 * is hidden"* — and requires it to say the two states are INDISTINGUISHABLE to her. This block does the
 * opposite on both counts, deliberately.
 *
 * ⭐ The reversal is licensed by a change of ENTITLEMENT, not by a change of mind. v1 was written when the
 * unreachable material might belong to ANYONE — a channel to Hermes — so naming its size would have
 * leaked a third party's existence. This block is **same-person only**: telling Ote that three items sit
 * in another of *his own* rooms tells him nothing he is not entitled to. That is constraint #8's test —
 * *can it expose its source, or reveal something someone was never entitled to know?* — answered no.
 *
 * ⛔ It still names no room but the current one, and no other person, ever.
 */
export function renderScope(scope) {
  if (!scope) return null
  const e = scope.elsewhere ?? {}
  const lines = [
    'How your knowledge is scoped right now — these are facts about this moment, not instructions:',
    `- You are Sotera, the same persona in every room. Being the same Sotera does not mean the same reach.`,
    `- The PERSON you are talking to: ${scope.person?.name ?? 'unknown'}. One person can reach you through several rooms; it is still the same person.`,
    `- The ROOM you are in: ${scope.room?.name ?? 'unknown'}. What is stored in a room stays in that room.`,
    `- What they told you: ${scope.grain?.whatTheyToldYou ?? ''}`,
    `- Your own practice with them: ${scope.grain?.yourOwnPractice ?? ''}`,
    `- Your intention: ${scope.grain?.yourIntention ?? ''}`,
  ]
  // ⭐ THE TRACE, and the whole point of it: it makes "unreachable" and "absent" tellable apart.
  if (e.otherRoomsOfThisPerson > 0) {
    lines.push(
      `- This person also uses ${e.otherRoomsOfThisPerson} other room(s) you cannot read from here, holding ${e.itemsYouCannotReadFromHere} item(s).`,
      '  So if you find nothing here, that is UNREACHABILITY, not absence. Say you cannot see it from this'
      + ' room — never that it does not exist, and never guess what is in it.',
    )
  } else {
    lines.push(
      '- This person uses no other room, so an empty result here really is an absence rather than something'
      + ' out of reach.',
    )
  }
  lines.push(
    'You may say any of this plainly if it matters. You may NOT name or describe another person, or the'
    + " contents of another room — knowing a room exists is not permission to describe it.",
  )
  return lines.join('\n')
}

/**
 * The trace alone, for attaching to an ordinary scoped read (`recall_memory` / `list_memories`).
 * Deliberately smaller than `describeScope`: a read does not need to re-explain the architecture on
 * every call, it needs to say what it could not see.
 */
export async function reachTrace(fastify, { userId = null } = {}) {
  const s = await describeScope(fastify, { userId })
  if (!s) return null
  return {
    room: s.room.name,
    scopedTo: 'this room only',
    otherRoomsOfThisPerson: s.elsewhere.otherRoomsOfThisPerson,
    itemsYouCannotReadFromHere: s.elsewhere.itemsYouCannotReadFromHere,
    howToReadThis: s.elsewhere.howToReadThis,
  }
}
