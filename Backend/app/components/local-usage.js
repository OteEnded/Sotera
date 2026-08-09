// LOCAL USAGE LEDGER — "did WE ask for this model, or did something else?"
//
// Ollama's /api/ps tells you what is loaded. It cannot tell you WHO loaded it: the platform, another
// client on the box, or a leftover runner nobody owns. That distinction is the whole point of the local
// monitor, and it is only answerable from our side — so we record every request we send to an ollama-kind
// provider and join it against /api/ps at read time.
//
// It matters because the failures this session were all attribution failures at heart: a wedged runner
// holding 25GB that nobody could account for, aux models resident when the box should have been quiet, and
// a benchmark contaminated by traffic I could not see. "Loaded" was never the useful question — "loaded by
// whom, and how long ago" is.
//
// Bounded by construction: keyed by model name, and a local Ollama holds a handful. Per-process and
// deliberately NOT persisted — a restart genuinely does not know who loaded what, and pretending otherwise
// would be worse than saying so.

const seen = new Map() // bare model name -> { lastAt, count, kinds:Set, users:Map<key,{lastAt,count,seq,convos}> }
const MAX_MODELS = 200 // pathological-input backstop; a real host has ~10
// WHO is on each model. Bounded per model for the same reason the model map is: a ledger that only grows
// is a leak whatever its constant. 8 is plenty to answer "who is on this right now" on a personal box.
const MAX_USERS_PER_MODEL = 8
// WHICH CHAT each user was running on the model (Ote's ask: "so i know which is which"). A user is one
// person but may have several conversations on one model; the chip stays per-user and this is what the
// click-through shows. Bounded per user for the same reason as everything else here.
const MAX_CONVOS_PER_USER = 5
const ROOT_KEY = '__root__' // root has no users row; userId is null for it
// A MONOTONIC counter, because Date.now() has millisecond resolution and a burst of requests lands inside
// one tick — two users recorded in the same millisecond had no defined order, so "who is active" could
// name the wrong one. Recency here means "most recently RECORDED", which a sequence expresses exactly and
// a clock does not.
let seq = 0

/**
 * Record that the platform issued a request for a local model.
 * @param {string} model  bare model name as Ollama knows it ("qwen3.5:9b")
 * @param {string} kind   'chat' | 'stream' | 'embed'
 * @param {string|null} userId
 * @param {string|null} conversationId  the chat this request belongs to, when there is one (side-calls
 *                                      like title generation and embeddings legitimately have none)
 */
export function noteLocalUse(model, kind, userId = null, conversationId = null) {
  if (typeof model !== 'string' || !model) return
  let e = seen.get(model)
  if (!e) {
    if (seen.size >= MAX_MODELS) {
      // drop the least-recently-used rather than grow without bound
      let oldestKey = null
      let oldestAt = Infinity
      for (const [k, v] of seen) if (v.lastAt < oldestAt) { oldestAt = v.lastAt; oldestKey = k }
      if (oldestKey) seen.delete(oldestKey)
    }
    e = { lastAt: 0, count: 0, kinds: new Set(), users: new Map() }
    seen.set(model, e)
  }
  const now = Date.now()
  e.lastAt = now
  e.count++
  e.kinds.add(kind)
  // WHO — keyed by user id, with root's null mapped to a stable sentinel so it is countable like anyone
  // else rather than silently dropped.
  const key = userId || ROOT_KEY
  let u = e.users.get(key)
  if (u) { u.lastAt = now; u.count++; u.seq = ++seq } else {
    if (e.users.size >= MAX_USERS_PER_MODEL) {
      // Evict by the same monotonic sequence the sort uses. Using lastAt here would pick an arbitrary
      // victim among same-millisecond entries — the identical collision that made "active user" wrong.
      let oldestKey = null
      let oldestSeq = Infinity
      for (const [k, v] of e.users) if (v.seq < oldestSeq) { oldestSeq = v.seq; oldestKey = k }
      if (oldestKey) e.users.delete(oldestKey)
    }
    u = { lastAt: now, count: 1, seq: ++seq, convos: new Map() }
    e.users.set(key, u)
  }
  // WHICH chat. Not every local call has one — title generation, the memory extractor and embeddings are
  // real traffic with no conversation — so a missing id is recorded as "no conversation" by omission
  // rather than invented, and the UI says so.
  if (typeof conversationId === 'string' && conversationId) {
    const c = u.convos.get(conversationId)
    if (c) { c.lastAt = now; c.count++; c.seq = ++seq } else {
      if (u.convos.size >= MAX_CONVOS_PER_USER) {
        let oldestKey = null
        let oldestSeq = Infinity
        for (const [k, v] of u.convos) if (v.seq < oldestSeq) { oldestSeq = v.seq; oldestKey = k }
        if (oldestKey) u.convos.delete(oldestKey)
      }
      u.convos.set(conversationId, { lastAt: now, count: 1, seq: ++seq })
    }
  }
}

/** What we know about a model, or null if the platform has never asked for it this process. */
export function localUseOf(model) {
  const e = seen.get(model)
  if (!e) return null
  return {
    lastAt: new Date(e.lastAt).toISOString(),
    ageSec: Math.round((Date.now() - e.lastAt) / 1000),
    requests: e.count,
    kinds: [...e.kinds].sort(),
    // Most recent first — the monitor resolves these ids to names and the UI marks the freshest "active".
    // Sorted by the monotonic sequence, not by any timestamp: ageSec rounds a whole second into one value
    // and even raw Date.now() collides inside a millisecond, so a burst of callers had no defined order and
    // the "active" user shown could be the wrong one. Caught by the test, which is what it was for.
    users: [...e.users.entries()]
      .sort((a, b) => b[1].seq - a[1].seq)
      .map(([id, v]) => ({
        id: id === ROOT_KEY ? null : id,
        requests: v.count,
        ageSec: Math.round((Date.now() - v.lastAt) / 1000),
        // freshest conversation first, same monotonic-sequence rule as the users list
        conversations: [...v.convos.entries()]
          .sort((a, b) => b[1].seq - a[1].seq)
          .map(([cid, cv]) => ({ id: cid, requests: cv.count, ageSec: Math.round((Date.now() - cv.lastAt) / 1000) })),
      })),
  }
}

/** Everything the platform has touched (for the monitor's "ours but not currently loaded" view). */
export function allLocalUse() {
  return [...seen.entries()].map(([model, e]) => ({ model, ...localUseOf(model) }))
}

/** Test seam — the ledger is process-global, so tests need a way back to a known state. */
export function _resetLocalUse() { seen.clear() }
