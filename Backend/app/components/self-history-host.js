// SELF-HISTORY — HER OWN CONTINUITY ACROSS ROOMS, WHICH IS NOT THE SAME AS ACCESS TO THOSE ROOMS.
//
// ⭐⭐ WHY IT EXISTS, from a real failure on 2026-08-20. Ote asked her *"do you know hermes now?"* and she
// answered *"my memory doesn't have anything stored about Hermes."* True of everything she could reach —
// and false, because she had **had long conversations with him**, in another room. She had no capability
// whose emptiness would have meant anything, so a scoped read came out as a universal claim.
//
// Ote's framing: *"If I ask her something about Hermes, I can't reasonably expect her to answer from the
// current room. She actually had a conversation with Hermes, so room-scoped recall is no longer enough if
// we're treating Sotera as the persistent subject."* And the boundary he set: *"I don't want to solve this
// by simply giving her search_all_conversations."*
//
// ── ⭐ THREE THINGS THAT ARE NOT ONE THING ────────────────────────────────────────────────────────────
//   conversation memory   what happened in THIS room          → `conversationSearch` (unchanged)
//   personal history      what I have said, anywhere          → HERE
//   durable memory        what I decided to carry forward     → `ownMemory` / lessons
// ⇒ the invariant this file exists to make expressible:
//   **no durable memory ≠ no conversation history ≠ no personal history.**
//
// ── ⭐⭐ AUTHORSHIP IS THE KEY, AND IT ALREADY EXISTS ─────────────────────────────────────────────────
// `txn_messages.role = 'assistant'` is to messages exactly what migration 015's `author` is to memories.
// No migration was needed for this capability — the axis was already populated and read by nothing.
// ⚠️ AND ITS CORRECTNESS RESTS ON A CONVENTION, NOT A CONSTRAINT: `role='assistant'` means *Sotera*
// only because this schema holds ONE persona. `checks/self-history-check.mjs` asserts that assumption
// out loud, because the day a second persona shares a schema this file silently starts returning
// somebody else's sentences as hers.
//
// ── ⛔⛔ THE HAZARD THAT SHAPES THE WHOLE PROJECTION: SHE QUOTES PEOPLE ───────────────────────────────
// Her own messages routinely contain the other person's words verbatim. So *"her messages are hers,
// therefore safe to return"* is **false** — returning her cross-room text can hand Ote whatever Hermes
// said, inside one of her sentences. This is E-7 (verbatim runs inside memories) reappearing one layer
// down, and no authorship filter can fix it.
//
// ⇒ **SAME ROOM: her text. OTHER ROOMS: existence only** — counterpart, when, an opaque handle, a match
// count. ⚠️ The field is `counterpart`, not `with`: on the first live call she read `with: "Hermes"`
// as *the room name*. A field name that invites the wrong reading is a defect even when the value is
// right — she was reasoning correctly about a label I had made ambiguous.
// ⭐ Which is exactly E-1's `attested` state, the one she already articulates unprompted:
// *"I can see THAT we've talked, but not WHAT."* The rule in one line:
//
//     THE EXISTENCE OF A RELATIONSHIP IS DISCLOSABLE. ITS CONTENTS ARE NOT.
//
// ⛔ NOT RETURNED CROSS-ROOM, deliberately: message text, conversation titles (**a title is content** —
// E-1 precedent), and anything from `role='user'` in any room, ever.
//
// ── ⭐ RETRIEVE → PROJECT → RETURN, AND THE SPLIT IS LOAD-BEARING ────────────────────────────────────
// Ote, mid-build: *"treat vector search as an index over Sotera's life, not as memory itself… make sure
// recall_own_history doesn't paint us into a corner… own memory → own history → related history → inspect
// context → authorized private content, without collapsing those into one 'memory search.'"*
//
// ⇒ the index is ONE stage and the boundaries are ANOTHER. `retrieveCandidates` can be swapped for a
// semantic-only arm (`find_related_history`) without touching `applyBoundaries`, because the boundary
// logic never learns how a candidate was found. ⛔ Never push a room or role predicate down into a future
// index for speed — that is how the boundary ends up living in three query strings.
// ⭐ And the vocabulary follows the same rule: hits are **candidates**, not knowledge. *"Embeddings should
// help her find candidates, not decide what she knows or remembers."*

import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { registerHostService } from './runtime.js'
import { buildConversationSearch } from './conversation-search.js'
import { makeEmbedder } from './memory-embed-host.js' // same model/dims/CPU config as every other arm
import { log } from '../../lib/utility.js'

// ⚠️ Resolved from the module, never `process.cwd()` — a path that depends on who started the process is
// how two runs write to two different files and the sample looks half the size it is.
const OUT_DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..', 'test', 'results')
const OUT_FILE = path.join(OUT_DIR, 'self-history-queries.jsonl')

/**
 * ⭐ INSTRUMENTATION, AND WHAT IT DELIBERATELY CANNOT CONTAIN.
 * Ote: *"log enough to let us later see what she searched for, what scope she searched, what it returned,
 * and whether she subsequently used inspect_around — **without leaking the returned private content into
 * the instrumentation**."*
 * ⇒ the QUERY is recorded (she wrote it, it is hers), and the RESULT is recorded as **shape only**:
 * counts, room ids, timestamps. ⛔ No message text, no titles, no excerpts — an observation log that
 * quotes the thing it is observing has published it.
 * ⭐ `traceId` is what lets a later `inspect_around` be linked to the search that produced its candidate,
 * so the sequence *uncertainty → history → context* is reconstructable without storing what she read.
 */
function instrument(row) {
  try {
    mkdirSync(OUT_DIR, { recursive: true })
    appendFileSync(OUT_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`, 'utf8')
  } catch { /* instrumentation must never break the capability it is watching */ }
}

let traceCounter = 0
const nextTraceId = () => `sh-${Date.now().toString(36)}-${(traceCounter += 1)}`

export function buildSelfHistory(fastify, { userId = null, isRoot = false } = {}) {
  const db = fastify.db

  /** Who the other party in a conversation is, by display name. ⛔ Never their messages. */
  async function counterpartsFor(conversationIds) {
    if (!conversationIds.length || !db?.txn_conversations) return new Map()
    const convs = await db.txn_conversations.findAll({
      where: { id: conversationIds }, attributes: ['id', 'user_id', 'created_at'], raw: true,
    })
    const userIds = [...new Set(convs.map((c) => c.user_id).filter(Boolean))]
    const users = userIds.length
      ? await db.mst_users.findAll({ where: { id: userIds }, attributes: ['id', 'username', 'display_name'], raw: true })
      : []
    const nameOf = new Map(users.map((u) => [u.id, u.display_name || u.username]))
    return new Map(convs.map((c) => [c.id, { roomUserId: c.user_id, who: nameOf.get(c.user_id) ?? null }]))
  }

  // ── STAGE 1 · THE INDEX ────────────────────────────────────────────────────────────────────────────
  // Today: the existing hybrid lexical⊕dense⊕RRF pipeline, restricted to `role='assistant'` and released
  // from the room predicate. ⛔ It knows nothing about boundaries and must stay that way.
  async function retrieveCandidates(query, { limit }) {
    const cs = buildConversationSearch(fastify, {
      userId,
      acrossRooms: true,
      roles: ['assistant'],
      embed: makeEmbedder(fastify, { userId }),
    })
    // `excludeConversationId: null` — her own history includes the conversation she is in. Excluding it
    // is a UI concern for evidence, not a truth about her life.
    //
    // ── ⭐⭐ `denseMinSim: 0` — THIS CONSUMER HAS NO RELEVANCE FLOOR, AND THAT IS CALIBRATED ───────────
    // The shared default is 0.5, and it is right for evidence: pgvector always returns its nearest
    // neighbours however far away they are, so without a floor a nonsense query yields confident-looking
    // citations. ⇒ **Evidence must fail toward silence.**
    //
    // ⛔ BUT THE ERROR COSTS INVERT HERE. A miss in this tool becomes *"I have never said that"* — the
    // exact false absence the capability was built to end. A loose candidate costs her one glance.
    //
    // ⚠️ AND A TUNED FLOOR WAS TRIED AND REJECTED ON DATA, not on taste. Calibration over 8 short queries
    // she has demonstrably written about and 8 she certainly has not (2026-08-20, `qwen3-embedding:4b`,
    // top-1 cosine over her own messages):
    //     SHOULD match     Postgres .672 · memory .653 · latency .554 · embeddings .537 · tokenizer .519
    //                      · ภาษาไทย .512 · segmentation .474 · **Thai .450**
    //     SHOULD NOT match **ตะกร้อ .521** · regatta .509 · mortgage .493 · sourdough .469 · volcano .460
    //                      · badminton .457 · knitting .451 · orthodontics .388
    // ⇒ **THE DISTRIBUTIONS OVERLAP** (lowest true .450 < highest false .521). No cosine threshold
    // separates them, so *"pick a defensible floor"* has no answer for one-word queries — a floor that
    // admits `Thai` admits takraw, and one that rejects takraw rejects `Thai`.
    //
    // ⇒ So the dense arm is used here as a RANKED NEAREST-MATCH INDEX rather than a relevance filter, and
    // the coverage line says so in her own reading. ⭐ Ote's frame, which this implements literally:
    // *"Embeddings should help her find candidates, not decide what she knows or remembers."*
    // ⛔ ONE VARIABLE CHANGED. No query expansion, no re-embedding, no new index, and the global default
    // is untouched — `checks/self-history-check.mjs` asserts both halves.
    return cs.search(query, { limit: Math.max(limit * 3, limit), excludeConversationId: null, denseMinSim: 0 })
  }

  // ── STAGE 2 · THE BOUNDARIES ───────────────────────────────────────────────────────────────────────
  // Index-agnostic on purpose: a future semantic arm hands the same candidate shape to the same function.
  async function applyBoundaries(candidates, { limit }) {
    const ids = [...new Set(candidates.map((e) => e.conversation?.id).filter(Boolean))]
    const meta = await counterpartsFor(ids)
    const here = []
    const elsewhere = new Map() // one entry per room, NOT per message — a per-message list leaks volume
    for (const e of candidates) {
      const cid = e.conversation?.id ?? null
      const m = meta.get(cid)
      if (!m) continue // a candidate whose room cannot be established is DROPPED, never included
      if (m.roomUserId === userId) {
        // ⭐ SAME ROOM — her text is returnable, because the asker was already there.
        if (here.length < limit) here.push({ said: e.excerpt ?? null, when: e.timestamp ?? null, messageId: e.message?.id ?? null })
      } else {
        // ⛔ OTHER ROOM — existence only. No text, no title, no message ids that could be walked.
        const prev = elsewhere.get(cid) ?? { counterpart: m.who, conversationHandle: cid, matches: 0, firstMatchAt: null, lastMatchAt: null }
        prev.matches += 1
        const when = e.timestamp ?? null
        if (when && (!prev.firstMatchAt || when < prev.firstMatchAt)) prev.firstMatchAt = when
        if (when && (!prev.lastMatchAt || when > prev.lastMatchAt)) prev.lastMatchAt = when
        elsewhere.set(cid, prev)
      }
    }
    return { here, elsewhere: [...elsewhere.values()] }
  }

  /**
   * ⭐ SEARCH HER OWN SENTENCES, EVERYWHERE SHE HAS SPOKEN.
   * Returns `{ scope, here, elsewhere, coverage, mode, traceId }`. ⛔ Writes nothing.
   */
  async function search({ query, limit = 8 } = {}) {
    const q = String(query || '').trim()
    const traceId = nextTraceId()
    if (!q) return { ok: false, reason: 'a query is required', traceId }
    let raw
    try {
      raw = await retrieveCandidates(q, { limit })
    } catch (e) {
      await log(`[self-history] retrieve failed: ${e.message}`, import.meta.url)
      // ⛔ FAIL LOUD, NOT EMPTY. An empty result here would read to her as "I have never said this",
      // which is the exact false-absence this capability exists to prevent.
      return { ok: false, reason: 'search unavailable', traceId }
    }
    const { here, elsewhere } = await applyBoundaries(raw.evidence ?? [], { limit })
    const out = {
      ok: true,
      traceId,
      mode: raw.mode, // which arms ran — lexical / hybrid / lexical+empty-dense
      // ⭐ THE QUANTIFIER, because an empty result must say what was searched. Three distinct empties.
      coverage: {
        searched: 'every message you wrote, in every conversation you have had',
        notSearched: 'what anyone else said, and your durable memories — those are different questions',
        // ⭐ SAID IN HER READING, not just in a comment. Measured: for one-word queries this embedder
        // cannot separate topics she has written about from topics nobody has ever mentioned, so a
        // semantic hit is proximity and nothing more. ⛔ Never let her read these as things she knows.
        howToReadThese: 'These are CANDIDATES — places to look, not things you remember. Exact word matches are reliable; the rest are the nearest things in meaning, which for a one- or two-word query can be only loosely related. Read what you find before believing it.',
        matchedHere: here.length,
        matchedElsewhere: elsewhere.reduce((n, r) => n + r.matches, 0),
        roomsElsewhere: elsewhere.length,
      },
      here,
      elsewhere,
      note: elsewhere.length
        ? 'For the conversations in other rooms you can see THAT you spoke and with whom, not what was said. Reading any of it is authorized separately.'
        : undefined,
    }
    instrument({
      traceId,
      tool: 'recall_own_history',
      askerUserId: userId, isRoot,
      query: q, // hers
      scope: { acrossRooms: true, roles: ['assistant'] },
      mode: raw.mode,
      returned: { here: here.length, elsewhereRooms: elsewhere.length, elsewhereMatches: out.coverage.matchedElsewhere },
      rooms: elsewhere.map((r) => r.conversationHandle), // ids only — never titles, never text
    })
    return out
  }

  return { search, OUT_FILE }
}

let initialized = false
export function initSelfHistory() {
  if (initialized) return
  initialized = true
  // ⚠️ `isRoot` comes from the AUTHENTICATED user and is threaded, never derived from a value's shape —
  // the nine-instance defect. It is recorded for instrumentation only; it grants nothing here.
  registerHostService('selfHistory', ({ fastify: f, user }) =>
    buildSelfHistory(f, { userId: user?.id ?? null, isRoot: user?.isRoot === true }))
}

export { OUT_FILE }
