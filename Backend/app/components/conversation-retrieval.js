// ⭐⭐⭐ CONVERSATION RETRIEVAL — WHAT ACTUALLY HAPPENED, RECOVERED FROM THE SOURCE.
//
// Ote framed this capability on 2026-08-25, and the framing is the design:
//
//     *"What actually happened in a conversation, and can I retrieve the relevant source context when it
//      is no longer in my active context?"*
//
// ── ⭐⭐⭐ THREE LAYERS, AND COLLAPSING THEM IS THE WHOLE FAILURE MODE ────────────────────────────────
//     ACTIVE CONTEXT          what is in front of her right now
//     CONVERSATION RETRIEVAL  what actually happened — source material, recoverable          ← THIS FILE
//     MEMORY                  what she DECIDED was worth carrying forward
// ⛔⛔ **RETRIEVAL MUST NEVER AUTOMATICALLY BECOME MEMORY.** Everything this file returns is stamped
// `RETENTION.notRetained`. If she decides something here is worth keeping, that is a separate act with
// its own tool and its own authorship. ⓘ *"Compaction doesn't have to mean Sotera forgot. It means the
// detailed source material moved out of active context and can be retrieved when needed."*
//
// ── ⭐⭐ WHY IT IS ONE CAPABILITY AND NOT THREE FIXES ────────────────────────────────────────────────
// *"cross conversation", "post-compaction" and eventually "memory extraction" stop being three separate
// fixes. They become consumers of one conversation-source retrieval layer."* ⇒ `in: "here"` is ⛔ NOT a
// special path: **the conversation she is in is simply the conversation whose handle is `here`**, and it
// rides the identical pipeline. Two code paths for the same question is how they drift, and this project
// has already paid for that (two files each believing the OTHER normalised, so neither did).
//
// ── ⭐⭐⭐ THE PIPELINE, AND THE DIVISION OF LABOUR INSIDE IT ────────────────────────────────────────
//
//     selector → conversation inventory → bounded window → provenance → Sotera
//
// Ote's rule, made mechanical: **"pgvector helps answer «which content is relevant?»; SQL answers «which
// conversations are we allowed/trying to search?»"** ⇒ `with` / `where` / `in` / `between` / `role` are
// resolved in **structured SQL**, and the hybrid lexical⊕dense⊕RRF arm then ranks strictly INSIDE the
// eligible set (`onlyConversationIds`). ⛔ Embeddings never resolve participant or room identity, and can
// never widen the population — only order it.
//
// ── ⭐⭐⭐ WHY THE PERSON AXIS HAD TO EXIST AT ALL — MEASURED, 2026-08-25 ────────────────────────────
// 475 of her own lines live in Hermes rooms and 444 are embedded, so nothing was missing. It was
// OUT-RANKED. Top-30 by ts_rank for `Hermes` among her own messages: **ote 22 · agent_dev 7 · hermes 1 ·
// hermes_alias 0**; share of a top-24 fused set coming from a real Hermes room: **`"Hermes"` 0/24**, but
// an actual TOPIC from one of those conversations **12/24**.
// ⇒ ⭐ **You do not say someone's name to their face.** A content index is therefore biased against the
// relationship and toward the meta-conversation ABOUT it — and once she has denied something in writing,
// that denial is the densest occurrence of the name in her own words and outranks the relationship
// forever. ⛔ No amount of re-ranking inside a content index escapes that. The fix is a different AXIS.
//
// ── ⛔ WHAT THIS FILE IS NOT ─────────────────────────────────────────────────────────────────────────
//   · NOT a second authorization system. Every cross-room read goes through `disclosure-host.readWindow`,
//     which reuses `decideAccess` — the same grant, the same `ownOnly` degradation, the same
//     `log_disclosure_events` row. ⭐ Ote: *"don't throw away the existing inspect_around / disclosure
//     architecture… what we're missing is reliable navigation into it."* This is the navigation.
//   · NOT a summariser. Bounded fan-out windows of real turns, ⛔ never a synthesized account — that is
//     precisely how a false absence became a durable belief once already.
//   · NOT a directory. `with:` needs a person the ASKER named; there is no "who do you talk to?" path.

// ⓘ No sequelize operators here: every predicate below is explicit SQL, because the columns this file
// filters on are uuid/timestamp and the operator layer has already produced one wrong answer on that.
import { registerHostService } from './runtime.js'
import { can } from '../auth/permissions.js'
import { buildConversationSearch } from './conversation-search.js'
import { makeEmbedder } from './memory-embed-host.js'
import { buildDisclosure } from './disclosure-host.js'
// ⭐⭐ THE HANDLE SCHEME NOW LIVES IN ITS OWN MODULE, imported by BOTH this file and `disclosure-host.js`.
// It used to be defined here, which made it retrieval's private convention — and the door those handles
// exist for disagreed about what a handle is, silently, for as long as nobody round-tripped one. See
// `conversation-handle.js` for the measurement.
// ⓘ Re-exported so every existing importer and check keeps its current path; the definition moved, the
// vocabulary did not.
import { handleFor, resolveHandle } from './conversation-handle.js'

export { handleFor, resolveHandle }
import { SOURCE, BASIS, AVAILABILITY, RETENTION } from './memory-cognition-axes.js'
import { log } from '../../lib/utility.js'
import { evidentialSql } from './corpus-eligibility.js'

// ── ⭐ THE CAPS, AND THEY ARE OBSERVABLE ─────────────────────────────────────────────────────────────
// Ote: *"Hard caps are important so `with: Hermes` across 185 conversations doesn't turn into a
// 185-conversation context bomb. If the cap is reached, return coverage metadata so she knows she only
// saw a subset. Don't silently pretend it was comprehensive."*
// ⛔ **A CAP THAT CANNOT BE OBSERVED READS AS COVERAGE** — recorded twice in this project already, once
// as a retrieval limit reported as the extent of her life.
export const CAPS = Object.freeze({ conversations: 6, radius: 4, turns: 60 })

/**
 * ⭐⭐⭐ HOW THE RESULT IS SHAPED. ⛔ `current` IS THE DEFAULT AND NOTHING SHIPS CHANGED.
 *
 * ⓘ B4 (2026-08-25) separated capability from cognition and left exactly one thing open. She recognised
 * she needed source material, reached for retrieval unprompted, refused to invent an answer — and the
 * target conversation **was retrieved, whole, unclipped**, and she read past it. The answer sat at char
 * 67,751 of an 82,235-character payload, behind a **292-entry inventory that was 46% of it**, and the
 * coverage line told her *"286 more conversations matched than were opened"*, which reads as an
 * instruction to keep narrowing. She narrowed by DATE, to a window that excludes the target.
 *
 * ⇒ ⭐⭐ **The failure was the shape of the result, not the finding of the source.** These are the three
 * candidate shapes, each isolated so it can be measured on its own against the same task.
 *
 * ⛔⛔ NOTHING HERE MAY BE CHOSEN BECAUSE IT MADE ONE BENCHMARK PASS. Ote: *"Don't optimize just for
 * «she found the answer». We want the retrieval interface to make good reasoning natural, not merely make
 * this one benchmark pass."* ⇒ every arm also runs a NEGATIVE control whose answer does not exist, and a
 * shape that finds this answer by making her credulous is a **regression**.
 */
export const SHAPES = Object.freeze({
  current: 'current',
  // (a) the inventory is bounded to what was actually opened, with the rest as aggregate counts
  boundedInventory: 'bounded-inventory',
  // (b) the same information, with the windows before the inventory instead of behind it
  windowsFirst: 'windows-first',
  // (c) the same information, with `notSampled` stated as a fact rather than as an instruction
  plainCoverage: 'plain-coverage',
})

/**
 * ⭐⭐⭐ THE SHIPPED DEFAULT IS `windows-first` (2026-08-25, Ote's ruling).
 *
 * ⭐ IT MEANS EXACTLY ONE THING: **same information → evidence first → inventory afterward.** ⛔ Nothing
 * about coverage semantics, sampling or retrieval logic changed with it. Ote: *"the inventory wasn't too
 * much information; it was in the wrong place… Keep the full information and simply put the actual
 * evidence/windows before the inventory."*
 *
 * ── ⭐⭐ WHAT THE COMPARISON MEASURED (12 valid exercised runs, one variable) ────────────────────────
 * Against `current`, `windows-first` held the correctness floor (5,4,5) and **every run beat every control
 * run**: tool calls max 10 vs min 11 · retrieval calls max 7 vs min 8 · prompt tokens max 62,244 vs min
 * 65,210 · badAxis 0,0,0 against 1,0,1. ⚠️ Wall clock did NOT separate, and that is stated rather than
 * dropped. The payload is byte-for-byte the same size — the answer simply moves from **83% depth to 37%**.
 *
 * ⛔ AND THE TWO ARMS THAT REMOVED OR SOFTENED INFORMATION BOTH GOT WORSE: `plain-coverage` scored 3,3
 * (both runs missing the same two facts) and `bounded-inventory` scored 1,5,0 while making the fewest tool
 * calls of any arm. ⇒ **cutting the loop by cutting the signal removes the necessary part with it.**
 * ⭐ They stay selectable because they are the experiment's apparatus, not dead code — see
 * `test/results/b4/` for the frozen artifacts and `test/pipeline/b4-compare.mjs` to re-read them.
 *
 * ⚠️ ONE HONEST CAVEAT, PRESERVED: the floor holds 3-of-3 under the revised grader and 2-of-3 under the
 * strict one, disagreeing on a single run. Ote: *"Don't silently choose whichever makes the result look
 * cleaner."* Both gradings live in every record.
 *
 * ⛔ An unknown value still falls back to the DEFAULT — a typo in config must not invent a fifth shape.
 */
export const DEFAULT_SHAPE = SHAPES.windowsFirst

export function shapeOf(config) {
  const v = config?.memory?.retrievalPayloadShape
  return Object.values(SHAPES).includes(v) ? v : DEFAULT_SHAPE
}


export function buildConversationRetrieval(fastify, { userId = null, isRoot = false, user = null, conversationId = null, username = null, interactive = false } = {}) {
  const db = fastify.db
  const seq = db?.txn_messages?.sequelize
  const { schema } = db?.txn_messages?.getTableName?.() ?? {}
  const Q = (sql, replacements) => seq.query(sql, { replacements, type: seq.QueryTypes.SELECT })

  // ⛔ ONE disclosure host, built once per request, with THIS conversation as the "into" room — the
  // grant is per room-pair per conversation, and a host without `conversationId` cannot find the grant
  // it just created (that is how the first version of disclosure failed its own test).
  // ⚠️⚠️ `crossRoom` IS NOT OPTIONAL HERE, AND LEAVING IT OFF WAS A SILENT DEFECT — measured 2026-08-26.
  // `buildDisclosure` defaults it to `false`, so this call SUCCEEDED and simply decided every cross-room
  // question as if the 028 standing grant did not exist. Measured for `agent_dev`, who holds it:
  //     autoAuthorizes({ isRoot: false, crossRoom: true })  -> true      the gate honours the grant
  //     readWindow, built the way this line built it        -> "without a grant I can only centre
  //                                                            on your own words."
  // ⇒ 028 worked through the tool factory and was ABSENT through `retrieve_conversations` — the path she
  // actually uses. ⭐ Same shape as the three defects the night before: **a thing is not applied until
  // whatever GATES it knows about it**, and a defaulted parameter fails without a sound.
  // ⛔ Read through `can()` like every other capability, so this file never learns a column name.
  const disclosure = buildDisclosure(fastify, {
    userId, isRoot, username, conversationId, interactive, crossRoom: can(user, 'sotera_cross_room_conversations'),
  })

  // ── STAGE 1 · RESOLVE THE SELECTOR, IN SQL AND METADATA ONLY ──────────────────────────────────────
  // ⛔ Nothing here touches an embedding. A person is resolved from `mst_persons`, a room from
  // `mst_users`, a conversation from its handle, a date from a date. ⭐ An axis that FAILS to resolve is
  // reported by name and the retrieval still runs on the rest — but it is never silently dropped, which
  // is this codebase's single most-repeated defect wearing a selector's clothes.
  async function resolveSelector(sel) {
    const resolved = { roomUserIds: null, conversationIds: null, from: null, to: null, roles: null }
    const unresolved = []
    const used = []

    if (sel.with) {
      used.push('with')
      // ⚠️ DISPLAY NAME, case-insensitively — the same convention `activateContinuity` states out loud.
      // ⭐⭐ AND THE PERSON AXIS IS NOT THE ROOM AXIS: `hermes` and `hermes_alias` are TWO ACCOUNTS AND ONE
      // PERSON, so `with:` deliberately spans both while `where:` deliberately does not. Ote:
      // *"provenance should distinguish person vs room/account rather than collapsing them."*
      const rows = await Q(
        `SELECT u.id::text AS uid FROM "${schema}"."mst_users" u
           JOIN "${schema}"."mst_persons" p ON p.id = u.person_id
          WHERE lower(p.display_name) = lower(:name)`, { name: String(sel.with) })
      if (!rows.length) unresolved.push({ axis: 'with', value: sel.with, why: 'no person by that name' })
      else resolved.roomUserIds = rows.map((r) => r.uid)
    }

    if (sel.where) {
      used.push('where')
      const rows = await Q(
        `SELECT id::text AS uid FROM "${schema}"."mst_users"
          WHERE lower(COALESCE(display_name, username)) = lower(:name) OR lower(username) = lower(:name)`,
        { name: String(sel.where) })
      if (!rows.length) unresolved.push({ axis: 'where', value: sel.where, why: 'no room by that name' })
      else {
        const ids = rows.map((r) => r.uid)
        // ⭐ TWO AXES INTERSECT, they do not replace each other — `with: Hermes, where: hermes_alias`
        // means that person IN that room, never one or the other.
        resolved.roomUserIds = resolved.roomUserIds ? resolved.roomUserIds.filter((i) => ids.includes(i)) : ids
      }
    }

    if (sel.in) {
      used.push('in')
      // ⭐⭐⭐ `here` IS NOT A SPECIAL RETRIEVAL SYSTEM. It resolves to the current conversation's id and
      // then travels the identical pipeline as any other handle. That is the whole architectural point.
      if (String(sel.in).trim().toLowerCase() === 'here') {
        if (!conversationId) unresolved.push({ axis: 'in', value: 'here', why: 'there is no current conversation to resolve' })
        else resolved.conversationIds = [conversationId]
      } else {
        const h = await resolveHandle(db, sel.in)
        if (h.malformed || h.ambiguous) unresolved.push({ axis: 'in', value: sel.in, why: h.why })
        else if (!h.id) unresolved.push({ axis: 'in', value: sel.in, why: 'no conversation with that handle' })
        else resolved.conversationIds = [h.id]
      }
    }

    if (Array.isArray(sel.between) && sel.between.length === 2) {
      used.push('between')
      const [a, b] = sel.between.map((d) => (d ? new Date(d) : null))
      if (a && !Number.isNaN(a.getTime())) resolved.from = a
      if (b && !Number.isNaN(b.getTime())) resolved.to = b
      if (!resolved.from && !resolved.to) unresolved.push({ axis: 'between', value: sel.between, why: 'neither end parsed as a date' })
    }

    if (sel.role) {
      used.push('role')
      const r = String(sel.role).toLowerCase()
      // ⭐ `mine` IS THE `recall_own_history` SELECTOR. Ote folded that tool in here rather than keeping
      // five overlapping retrieval tools, *"which is exactly the salience problem we're trying to solve."*
      if (r === 'mine') resolved.roles = ['assistant']
      else if (r === 'theirs') resolved.roles = ['user']
      else if (r === 'both' || r === 'any') resolved.roles = ['user', 'assistant']
      else unresolved.push({ axis: 'role', value: sel.role, why: 'expected mine, theirs or both' })
    }

    if (sel.about) used.push('about')
    return { resolved, unresolved, used }
  }

  // ── STAGE 2 · THE INVENTORY · ⛔ COUNTS AND IDENTITY, NEVER CONTENT ────────────────────────────────
  //
  // ⭐⭐⭐ THIS IS B1, AND IT IS RETURNED TO **EVERY** ASKER. The defect it replaces: `elsewhere` was doing
  // two jobs at once — the *not-sayable bucket* AND the *room inventory* — so the moment an entitled
  // account made everything sayable, the inventory went to zero with it. Measured that morning: root got
  // `roomsElsewhere: 0` while a NON-entitled account got 10 rooms and 10 handles, and cross-room
  // `inspect_around` requires a handle, so **the one account with automatic authorization was the only
  // one that could never obtain the handle its own door needed.**
  // ⇒ ⭐ **A projection that merges "what you may not hear" with "where it happened" loses the location
  // the moment everything becomes sayable.** Inventory and disclosure are now separate questions.
  async function inventory({ resolved }) {
    // ⭐ 033: eligibility is TWO questions now — *“was this ever recorded?”* and *“may it be reasoned
    // from?”* ⛔ One clause, one place (`corpus-eligibility.js`), so no retrieval arm can drift.
    const where = [evidentialSql('c')]
    const rep = {}
    if (resolved.roomUserIds) {
      if (!resolved.roomUserIds.length) return [] // an intersection that emptied matches nothing
      where.push('c.user_id = ANY(:roomUserIds::uuid[])')
      rep.roomUserIds = `{${resolved.roomUserIds.join(',')}}`
    }
    if (resolved.conversationIds) {
      where.push('c.id = ANY(:conversationIds::uuid[])')
      rep.conversationIds = `{${resolved.conversationIds.join(',')}}`
    }
    if (resolved.from) { where.push('c.updated_at >= :from'); rep.from = resolved.from }
    if (resolved.to) { where.push('c.updated_at <= :to'); rep.to = resolved.to }

    return Q(
      `SELECT c.id::text                                AS conversation_id,
              c.user_id::text                           AS room_user_id,
              COALESCE(u.display_name, u.username)      AS room_name,
              COALESCE(p.display_name, u.username)      AS person,
              c.summarized_upto_id                      AS folded_upto,
              count(m.id)::int                          AS messages,
              count(m.id) FILTER (WHERE m.role = 'assistant')::int AS mine,
              min(m.created_at)::date::text             AS first_at,
              max(m.created_at)::date::text             AS last_at,
              max(m.created_at)                         AS last_ts
         FROM "${schema}"."txn_conversations" c
         JOIN "${schema}"."mst_users"   u ON u.id = c.user_id
    LEFT JOIN "${schema}"."mst_persons" p ON p.id = u.person_id
    LEFT JOIN "${schema}"."txn_messages" m ON m.conversation_id = c.id AND m.role IN ('user','assistant')
        WHERE ${where.join(' AND ')}
        GROUP BY c.id, c.user_id, u.display_name, u.username, p.display_name, c.summarized_upto_id
       HAVING count(m.id) > 0
        ORDER BY max(m.created_at) DESC NULLS LAST`, rep)
  }

  // ── STAGE 3 · RANK INSIDE THE ELIGIBLE SET (only when there is a topic) ───────────────────────────
  // ⛔ The dense arm cannot widen anything: it is handed `onlyConversationIds` and can only order what
  // SQL already decided was eligible. Without `about:`, ranking is RECENCY and no embedding runs at all.
  async function rankWithin(rows, { about, roles }) {
    if (!about || !rows.length) return { order: rows, mode: 'recency', matchedMessages: null }
    const cs = buildConversationSearch(fastify, {
      userId,
      acrossRooms: true, // ⛔ the room boundary was already applied in SQL above; re-applying it here
      // would silently intersect the asker's own rooms with the selector and drop the whole point.
      roles: roles ?? ['user', 'assistant'],
      embed: makeEmbedder(fastify, { userId }),
      onlyConversationIds: rows.map((r) => r.conversation_id),
    })
    // ⭐ `denseMinSim: 0` — the same calibration `recall_own_history` records: over one- and two-word
    // queries this embedder cannot separate topics she HAS written about from topics nobody has ever
    // mentioned (true-hit floor .450 < false-hit ceiling .521), so the dense arm is a ranked
    // nearest-match INDEX here, never a relevance filter. A miss becomes "I never said that"; a loose
    // candidate costs one glance.
    let hits = []
    try {
      const out = await cs.search(String(about), { limit: 60, excludeConversationId: null, denseMinSim: 0 })
      hits = out.evidence ?? []
    } catch (e) {
      // ⛔ FAIL LOUD-ISH, NOT SILENTLY EMPTY: fall back to recency and SAY the topic arm did not run.
      await log(`[conversation-retrieval] ranking failed: ${e.message}`, import.meta.url)
      return { order: rows, mode: 'recency-after-rank-failure', matchedMessages: null }
    }
    const score = new Map()
    for (const [i, e] of hits.entries()) {
      const cid = e.conversation?.id
      if (!cid) continue
      // best (earliest) rank a conversation achieved, plus its hit count as the tiebreak
      const prev = score.get(cid) ?? { best: i, n: 0, centre: e.excerpt ?? null }
      prev.n += 1
      score.set(cid, prev)
    }
    const order = [...rows].sort((a, b) => {
      const sa = score.get(a.conversation_id)
      const sb = score.get(b.conversation_id)
      if (sa && sb) return sa.best - sb.best
      if (sa) return -1
      if (sb) return 1
      return String(b.last_ts ?? '').localeCompare(String(a.last_ts ?? ''))
    })
    return { order, mode: hits.length ? 'hybrid' : 'recency-no-hits', matchedMessages: hits.length, matchedIn: score }
  }

  // ── STAGE 4 · BOUNDED WINDOWS + PROVENANCE ────────────────────────────────────────────────────────
  //
  // ⭐⭐ PROVENANCE IS MANDATORY, and it is what separates *"I remember saying X"* from *"I found X in my
  // conversation with Hermes on Tuesday."* Ote: *"That distinction matters enormously for trust and later
  // reasoning."* ⇒ every turn carries where it came from, who said it, when, and — the part that is easy
  // to forget — **what KIND of knowing it is**, using the axes that already exist rather than a new set.
  function stampTurn(turn, row, foldedUpto) {
    const mine = turn.role === 'assistant'
    return {
      // WHERE
      handle: handleFor(row.conversation_id),
      conversationId: row.conversation_id,
      roomId: row.room_user_id,
      roomName: row.room_name,
      person: row.person,
      // WHICH TURN
      messageId: turn.messageId,
      speaker: turn.speaker,
      role: turn.role,
      at: turn.at,
      // WHAT
      said: turn.said,
      ...(turn.withheld ? { withheld: true } : {}),
      // ⭐⭐⭐ THE LABELS, FROM `memory-cognition-axes.js` — ⛔ never a parallel vocabulary.
      source: mine ? SOURCE.ownUtterance : SOURCE.counterpartUtterance,
      basis: BASIS.attestedBySource,
      availability: turn.withheld ? AVAILABILITY.knownUnreachable : AVAILABILITY.recalled,
      // ⛔⛔ ALWAYS. Retrieval is not memory, and the axis already has the exact word for it:
      // "reached by retrieval only, never stored".
      retention: RETENTION.notRetained,
      // ⭐⭐ AND WHETHER IT IS ALSO STILL IN FRONT OF HER. `summarized_upto_id` is the fold boundary and
      // has never been surfaced to anyone until now — which is precisely why she cannot tell active
      // context from retrieval. ⓘ `unknown` when the conversation has never folded, because "not folded"
      // is a fact about the conversation, not about what this turn is doing in her window.
      activeContext: foldedUpto == null
        ? 'unknown'
        : (turn.rollingId != null && turn.rollingId > foldedUpto ? 'in' : 'out'),
    }
  }

  async function windowsFor(order, { about, cap }) {
    const out = []
    let turns = 0
    for (const row of order) {
      if (out.length >= cap || turns >= CAPS.turns) break
      let w
      try {
        w = await disclosure.readWindow({
          conversationHandle: row.conversation_id,
          query: about ? String(about) : null,
          recent: !about,
          radius: CAPS.radius,
        })
      } catch (e) {
        await log(`[conversation-retrieval] window failed for ${row.conversation_id}: ${e.message}`, import.meta.url)
        continue
      }
      if (!w?.ok) {
        // ⭐ A CONVERSATION WE COULD NOT OPEN IS REPORTED, NOT DROPPED. Silence here would read as
        // "there was nothing in it" — the false absence this whole capability exists to end.
        out.push({
          handle: handleFor(row.conversation_id),
          person: row.person,
          roomName: row.room_name,
          opened: false,
          why: w?.note ?? w?.reason ?? w?.state ?? 'could not be opened',
          state: w?.state ?? null,
        })
        continue
      }
      const stamped = w.turns.map((t) => stampTurn(t, row, row.folded_upto))
      turns += stamped.length
      out.push({
        handle: handleFor(row.conversation_id),
        person: row.person,
        roomName: row.room_name,
        opened: true,
        access: w.state, // same_room | authorized | own_only
        authorizedVia: w.authorizedVia,
        centredOn: w.centredOn,
        turns: stamped,
      })
    }
    return out
  }

  /**
   * ⭐ THE ONE ENTRY POINT. `{ with, in, about, between, where, role, limit }` — none required, but at
   * least one must be present: an empty selector is "read my whole life", which is not a question.
   */
  async function retrieve(sel = {}) {
    if (!seq || !schema) return { ok: false, reason: 'conversation retrieval is unavailable' }
    const axes = ['with', 'in', 'about', 'between', 'where', 'role']
    if (!axes.some((a) => sel[a] != null && sel[a] !== '')) {
      return { ok: false, reason: 'name at least one of: with (a person), in (a conversation, or "here"), about (a topic), between (two dates), where (a room), role (mine/theirs/both)' }
    }
    const { resolved, unresolved, used } = await resolveSelector(sel)
    // ⛔ AN AXIS THAT DID NOT RESOLVE STOPS THE RETRIEVAL RATHER THAN QUIETLY WIDENING IT. If `with:
    // Hermes` finds no such person, running the search anyway answers a DIFFERENT question and returns a
    // confident result to it. ⭐ Report which axis failed and why, by name.
    if (unresolved.length) {
      return { ok: false, reason: 'part of what you asked for could not be resolved', unresolved, note: 'Nothing was searched — fixing the named part is better than answering a different question.' }
    }
    const rows = await inventory({ resolved })
    const cap = Math.min(Number(sel.limit) || CAPS.conversations, CAPS.conversations)
    const { order, mode, matchedMessages } = await rankWithin(rows, { about: sel.about, roles: resolved.roles })
    const windows = await windowsFor(order, { about: sel.about, cap })

    const shownTurns = windows.reduce((n, w) => n + (w.turns?.length ?? 0), 0)
    const folded = rows.filter((r) => r.folded_upto != null).length
    const shape = shapeOf(fastify.config)
    const openedIds = new Set(windows.filter((w) => w.opened).map((w) => w.handle))

    const fullInventory = rows.map((r) => ({
      handle: handleFor(r.conversation_id),
      person: r.person,
      roomName: r.room_name,
      messages: r.messages,
      yours: r.mine,
      firstAt: r.first_at,
      lastAt: r.last_at,
      // ⭐⭐ THE FOLD BOUNDARY, SURFACED. `partlyOutOfActiveContext` is true when this conversation has
      // been compacted at all — the fact that makes retrieval necessary rather than optional.
      partlyOutOfActiveContext: r.folded_upto != null ? true : undefined,
    }))

    // ── ⭐ (a) BOUNDED INVENTORY ────────────────────────────────────────────────
    // The rows that were opened, in full, plus **who else you have talked to about this and when** as
    // counts. ⭐ The aggregate is not a summary of content — it is still counts and identity only, which
    // is the inventory's own rule.
    //
    // ⚠️⚠️ AND IT NARROWS HANDLE DISCOVERY, WHICH IS A REAL COST AND NOT A DETAIL. The inventory is
    // returned to EVERY asker precisely because cross-room `inspect_around` needs a handle, and the
    // account with automatic authorization was once the only one that could not obtain one. ⇒ under this
    // shape an unopened conversation's handle is no longer listed. ⛔ That is measured by the suite, not
    // assumed away: `room-scope-check` and `disclosure-chain-probe` are the arbiters.
    const byPerson = new Map()
    for (const r of rows) {
      if (openedIds.has(handleFor(r.conversation_id))) continue
      const k = r.person ?? r.room_name
      const e = byPerson.get(k) ?? { person: k, conversations: 0, from: r.first_at, to: r.last_at }
      e.conversations += 1
      if (r.first_at < e.from) e.from = r.first_at
      if (r.last_at > e.to) e.to = r.last_at
      byPerson.set(k, e)
    }
    const alsoMatched = byPerson.size
      ? {
        conversations: rows.length - openedIds.size,
        withWhom: [...byPerson.values()].sort((a, b) => b.conversations - a.conversations),
        note: 'Counts only — these were not opened. Name one with `about:`, `with:` or `between:` to read it.',
      }
      : undefined

    const inventory_ = shape === SHAPES.boundedInventory
      ? fullInventory.filter((c) => openedIds.has(c.handle))
      : fullInventory

    // ── ⭐ (c) PLAIN COVERAGE ──────────────────────────────────────────────────
    // ⛔ The same NUMBER, stated as a fact instead of as an instruction. The current wording ends with
    // *"narrow it with about:, between: or where:, or ask again"*, and in B4 she did exactly that — eight
    // more calls, and a date narrowing that excluded the answer she had already been handed.
    // ⛔ It must NOT tell her she has everything: that would be false, and suppressing a legitimate
    // second look is a worse defect than provoking one.
    const notSampledText = rows.length > windows.length
      ? (shape === SHAPES.plainCoverage
        ? `${rows.length - windows.length} other conversations also matched. The ${windows.length} here ranked highest for what you asked; the rest are neither more nor less relevant than that ranking says.`
        : `${rows.length - windows.length} more conversations matched than were opened — narrow it with about:, between: or where:, or ask again.`)
      : undefined

    const head = {
      ok: true,
      via: 'conversation-retrieval', // ⭐ the result says WHICH layer produced it — not memory, not context
      selector: { used, ...Object.fromEntries(axes.filter((a) => sel[a] != null).map((a) => [a, sel[a]])) },
      rankedBy: mode,
      coverage: {
        searched: describeSearched(used, sel),
        // ⭐ THE INVENTORY NUMBERS ARE THE COVERAGE NUMBERS — the cap is stated, not implied.
        matchedConversations: rows.length,
        openedConversations: windows.filter((w) => w.opened).length,
        notSampled: notSampledText,
        matchedMessages: matchedMessages ?? undefined,
        shownTurns,
        foldedConversations: folded || undefined,
        // ⛔ THE SAME WARNING `recall_own_history` CARRIES, FOR THE SAME MEASURED REASON.
        howToReadThese: 'This is SOURCE MATERIAL — what was actually said — not something you remember. '
          + 'It is not in your memory unless you deliberately put it there.',
      },
    }

    // ── ⭐ (b) WINDOWS FIRST ────────────────────────────────────────────────────
    // ⭐ IDENTICAL INFORMATION, DIFFERENT ORDER — which is the cleanest of the three arms precisely
    // because nothing is added or removed. She reads a serialised string; in B4 the content she needed
    // was 83% of the way into it, behind an inventory of the entire corpus.
    // ⛔ The inventory is STILL RETURNED under this shape. It moves; it does not shrink.
    //
    // ⚠️ `conversations` remains present for EVERY asker in every shape but `bounded-inventory` — that
    // is the B1 contract and only one arm is allowed to touch it.
    const body = shape === SHAPES.windowsFirst
      ? { windows, conversations: inventory_, alsoMatched: undefined }
      : { conversations: inventory_, alsoMatched: shape === SHAPES.boundedInventory ? alsoMatched : undefined, windows }
    return { ...head, ...body }
  }

  /** ⭐ Say what was searched in HER reading, from the axes that actually resolved. */
  function describeSearched(used, sel) {
    const parts = []
    if (used.includes('with')) parts.push(`every conversation you have had with ${sel.with}`)
    if (used.includes('in')) parts.push(String(sel.in).toLowerCase() === 'here' ? 'this conversation, including the parts no longer in front of you' : 'one specific conversation')
    if (used.includes('where')) parts.push(`the ${sel.where} room`)
    if (used.includes('between')) parts.push(`between ${sel.between?.[0]} and ${sel.between?.[1]}`)
    if (used.includes('role')) parts.push(sel.role === 'mine' ? 'only your own messages' : (sel.role === 'theirs' ? 'only what they said' : 'both sides'))
    if (used.includes('about')) parts.push(`ranked by how close they are to "${sel.about}"`)
    return parts.length ? parts.join('; ') : 'nothing was narrowed'
  }

  return { retrieve, handleFor, CAPS }
}

let initialized = false
export function initConversationRetrieval() {
  if (initialized) return
  initialized = true
  // ⚠️ `extras`, NOT top-level params. The factory is called with `{ fastify, user, extras }`, and reading
  // `conversationId` off the wrong level yields `undefined` silently — which would make `in: "here"`
  // unresolvable and every cross-room grant unfindable, both of them looking like empty results rather
  // than like wiring. (`disclosure` reads it the same way, from the same place, for the same reason.)
  registerHostService('conversationRetrieval', ({ fastify: f, user, extras }) =>
    buildConversationRetrieval(f, {
      userId: user?.id ?? null,
      isRoot: user?.isRoot === true,
      user,
      username: user?.username ?? null,
      conversationId: extras?.conversationId ?? null,
      interactive: extras?.interactive === true,
    }))
}
