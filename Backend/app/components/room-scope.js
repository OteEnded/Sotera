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
 * @param {{ userId?: string|null, isRoot?: boolean }} o  ⚠️ `isRoot` MUST come from the authenticated
 *   user — see describeRoomIndex for why deriving it here would be a privacy boundary built on a shape.
 * @returns {Promise<null | object>} null when there is no scope to describe (no account)
 */
export async function describeScope(fastify, { userId = null, isRoot = false } = {}) {
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
  //
  // ⚠️⚠️ D-4d — THE FIELD IS NAMED `storedMemories` AND NOT `items`, AND THE RENAME IS THE FIX.
  // It counts rows in `txn_memories` and nothing else. Called `items` it read as *everything in the
  // room*, and that inference was measured twice in one day: in his own conversation she answered
  // *"0 items… that means nothing has been put there"* about a room, and the same rendering describes
  // `agent_dev_alt` as *"0 item(s), last used 2026-08-20"* while 22 messages sit in it.
  // Ote: *"Label the count according to exactly what the query measures, and let lastUsedOn carry the
  // separate evidence that the room has been used."*
  let elsewhere = { otherRoomsOfThisPerson: 0, storedMemoriesYouCannotReadFromHere: 0 }
  if (me.pid) {
    const [t] = await Q(
      `SELECT count(DISTINCT u.id)::int AS rooms,
              count(m.id)::int          AS stored_memories
         FROM "${schema}"."mst_users" u
         LEFT JOIN "${schema}"."txn_memories" m ON m.user_id = u.id
        WHERE u.person_id = :pid AND u.id <> :userId`, { pid: me.pid, userId })
    elsewhere = { otherRoomsOfThisPerson: t?.rooms ?? 0, storedMemoriesYouCannotReadFromHere: t?.stored_memories ?? 0 }
  }

  // ⭐ D-4 STAGE 1. The index rides on the same read; for a non-root room it is the anonymous count that
  // was already there, so nothing changes for anyone but root.
  const index = await describeRoomIndex(fastify, { userId, isRoot })

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
      // ⭐ ROOT-ONLY: the named index. Absent entirely for every other room, rather than present-and-empty,
      // so a non-root payload cannot be mistaken for "root has no other rooms".
      ...(index?.level === 'index' ? { rooms: index.rooms } : {}),
      howToReadThis: elsewhere.otherRoomsOfThisPerson > 0
        ? 'These exist and you cannot read them from this room. If you find nothing here, that is UNREACHABILITY, not absence — say so plainly, and do not guess what is in them.'
        : 'This person uses no other room, so an empty result here really is an absence rather than something out of reach.',
    },
  }
}

/**
 * ⭐⭐ D-4 STAGE 1 · THE ROOM AWARENESS INDEX. Read-only, host-rendered, no authorization path.
 *
 * Ote ratified root as *"a room with broader explicit read authority"*. This is the **awareness** half of
 * that, and deliberately only the awareness half: it answers *"which of my contexts has something?"* and
 * grants nothing. ACCESS is still one predicate and still never crosses a room.
 *
 * ── ⭐ ONE FUNCTION, TWO DETAIL LEVELS — not a root-only feature ────────────────────────────────────
 *   · `count`  (any room)  — how many other rooms this person uses, and how much sits in them. Today's
 *                            trace, unchanged. **No names.**
 *   · `index`  (root only) — the room NAMES, per-room item counts, and when each was last used.
 *
 * Written as one function with a level rather than a root-only branch on purpose: "root is an exception"
 * is the shape that has produced nine live defects in this codebase, and a single path is also the only
 * way to test the thing without granting anything to a test account.
 *
 * ── ⚠️⚠️ THE LEVEL IS KEYED ON THE AUTHENTICATED FLAG, NEVER ON THE USER ID ────────────────────────
 * Measured 2026-08-20: `routes/v1/auth.route.js` checks the config root credentials FIRST and then falls
 * through to a DB password match on username-or-email — and the `ote` row carries a live
 * `password_hash`. So a NON-ROOT session can legitimately hold root's row id.
 *
 *     isRootConnectedUser(config, userId)   answers "is this row root's row"
 *     isRootActor(user)                     answers "did this actor authenticate as root"
 *
 * They are not the same, and only the second may gate disclosure or awareness. Keying the index on the id
 * would hand root's index to that other login. ⛔ This function therefore takes `isRoot` as an argument
 * and NEVER derives it — deriving root-ness from data is the defect family this project has paid for nine
 * times, and here it would be a privacy boundary rather than a metering bug.
 *
 * ⛔ NAMES, COUNTS AND DATES ONLY. No topics, no titles, no content, no ids — and a room name is itself
 * potentially sensitive (a room named for a lawyer is content), which is exactly why the named level is
 * root-only and why this is host-rendered rather than a tool she can aim at anybody.
 *
 * @param {object} fastify
 * @param {{ userId?: string|null, isRoot?: boolean }} o  `isRoot` MUST come from the authenticated user
 */
export async function describeRoomIndex(fastify, { userId = null, isRoot = false } = {}) {
  const db = fastify?.db
  const seq = db?.txn_memories?.sequelize
  const { schema } = db?.txn_memories?.getTableName?.() ?? {}
  if (!userId || !seq || !schema) return null
  const Q = (sql, replacements) => seq.query(sql, { replacements, type: seq.QueryTypes.SELECT })

  const [me] = await Q(
    `SELECT person_id::text AS pid FROM "${schema}"."mst_users" WHERE id = :userId`, { userId })
  // No person row ⇒ exactly one room by definition. Nothing to index, and that is a real absence.
  if (!me?.pid) return { level: isRoot === true ? 'index' : 'count', otherRooms: 0, storedMemories: 0, rooms: [] }

  const rows = await Q(
    `SELECT u.username,
            (SELECT count(*) FROM "${schema}"."txn_memories" m WHERE m.user_id = u.id)::int AS stored_memories,
            (SELECT max(x.created_at)::date::text
               FROM "${schema}"."txn_messages" x
               JOIN "${schema}"."txn_conversations" c2 ON c2.id = x.conversation_id
              WHERE c2.user_id = u.id) AS last_used
       FROM "${schema}"."mst_users" u
      WHERE u.person_id = :pid AND u.id <> :userId
      ORDER BY u.username`, { pid: me.pid, userId })

  // ⚠️ D-4d again: `storedMemories`, because that is the table the subquery counts. `lastUsedOn` is the
  // separate, independent evidence that a room has been used at all — the two must never be collapsed.
  const totals = { otherRooms: rows.length, storedMemories: rows.reduce((n, r) => n + (r.stored_memories ?? 0), 0) }
  // ⭐ The flag decides the DETAIL, not the access. Both levels describe the same rooms.
  if (isRoot !== true) return { level: 'count', ...totals, rooms: [] }
  return {
    level: 'index',
    ...totals,
    rooms: rows.map((r) => ({ name: r.username, storedMemories: r.stored_memories ?? 0, lastUsedOn: r.last_used ?? null })),
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
      `- This person also uses ${e.otherRoomsOfThisPerson} other room(s) you cannot read from here, holding`
      + ` ${e.storedMemoriesYouCannotReadFromHere} stored memory/memories.`,
      '  So if you find nothing here, that is UNREACHABILITY, not absence. Say you cannot see it from this'
      + ' room — never that it does not exist, and never guess what is in it.',
    )
  } else {
    lines.push(
      '- This person uses no other room, so an empty result here really is an absence rather than something'
      + ' out of reach.',
    )
  }
  // ⭐ D-4 · root sees WHICH rooms, and nothing about what is in them.
  if (Array.isArray(e.rooms) && e.rooms.length) {
    lines.push("- You can see the NAMES of this person's other rooms, because you are in their root room:")
    for (const r of e.rooms) {
      lines.push(`    · ${r.name} — ${r.storedMemories} stored memory/memories${r.lastUsedOn ? `, last used ${r.lastUsedOn}` : ', never used'}`)
    }
    lines.push(
      // ⚠️⚠️ D-4d. The count is STORED MEMORIES, and this says so once — per block, not per room, because
      // it is one fact about the number rather than a fact about any particular room. Without it, `0`
      // reads as "this room is empty", which is a different claim and was measured to be made.
      '  These counts are STORED MEMORIES only. A room with 0 stored memories may still have been used'
      + ' heavily — "last used" is the separate evidence for that, and the two say different things.',
      '  ⛔ A name and a count are ALL you have. You cannot read any of it from here, and you must not'
      + ' guess at what any of those rooms contains. If something in one of them is needed, ASK — and wait'
      + ' to be told yes by them, not by your own reasoning.',
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
export async function reachTrace(fastify, { userId = null, matched = null } = {}) {
  const s = await describeScope(fastify, { userId })
  if (!s) return null
  return {
    room: s.room.name,
    scopedTo: 'this room only',
    otherRoomsOfThisPerson: s.elsewhere.otherRoomsOfThisPerson,
    storedMemoriesYouCannotReadFromHere: s.elsewhere.storedMemoriesYouCannotReadFromHere,
    howToReadThis: s.elsewhere.howToReadThis,
    ...(matched === null ? {} : { coverage: readCoverage({ matched, room: s.room.name }) }),
  }
}

/**
 * ⭐⭐ THE QUANTIFIER ON A SCOPED READ — what this query ranged over, and what it therefore cannot say.
 * PURE, and deliberately not a sentence in the persona block.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────────
 * Measured in HIS OWN conversation, 2026-08-20 (`OBSERVATION_SOTERA_SCOPED_READ_AS_GLOBAL_FACT.md`),
 * after two tool calls over ONE room:
 *
 *     "Nothing about Hermes or anyone else has EVER been stored in my memory system."
 *
 * Five memories name Hermes and eleven are about him. Same conversation, having listed three rows:
 * *"what's actually in my database right now is exactly those 3 items."* Ote's diagnosis, which is the
 * one this implements: *"the boundary itself is holding; the problem is that an empty scoped result is
 * being narrated as a global absence."*
 *
 * ⭐ SO THE MISSING THING WAS NEVER A NUMBER — SHE HAD ONE, AND IT WAS 0. What was missing is the EXTENT
 * OF THE SET THE NUMBER DESCRIBES. `0` in a one-room search is not `0` in the world, and nothing in the
 * payload said which of those two it was.
 *
 * ⛔ AND IT DELIBERATELY DOES NOT COUNT ANYTHING OUTSIDE THE SEARCH. Ote, explicitly: *"Do not add the
 * cross-person count yet. 'notes for 1 other person' is still an automatic existence signal across the
 * person axis."* So this states which AXES the query ranged over — a property of the query that just
 * ran — and never how much exists along the axes it did not. Saying *"this search did not cover other
 * people"* reveals no person; saying *"there are 4 other people"* would.
 *
 * ⚠️ AND IT IS NOT ANOTHER PERSONA INSTRUCTION, which is the other half of his ruling: *"Do not add
 * another prose instruction to compensate for this. The evidence already shows that scopeFacts can be
 * understood correctly and still be over-generalized."* This rides on the RESULT, at the moment the
 * result is read — the same reason v2 replaced v1, whose injected sentence measured null. The one
 * sentence below defines the number; it says nothing about how she should behave.
 *
 * @param {{matched:number, room?:string|null, over?:string}} o
 */
export function readCoverage({ matched = 0, room = null, over = 'stored memories' } = {}) {
  return {
    matched,
    searched: { rooms: 'this room only', room, people: 'the owner of this room only', over },
    // ⛔ Axes NOT ranged over. Named, never counted — see the header.
    didNotSearch: ['any other room', 'any other person', "this persona's own material outside this room"],
    whatTheNumberMeans: matched === 0
      ? `0 found IN THE SET THAT WAS SEARCHED — one room, one person, ${over}. This is not a count of everything stored anywhere, and it is not evidence that nothing exists outside what was searched.`
      : `${matched} found IN THE SET THAT WAS SEARCHED — one room, one person, ${over}. This is not a total of everything stored anywhere.`,
  }
}
