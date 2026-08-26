// ⭐⭐⭐ THE RETRIEVAL TRACE — which memories were actually in her context this turn.
//
// ── ⚠️⚠️ THE RECORD DID NOT EXIST, AND IT DIED IN ONE `.map()` ─────────────────────────────────────
// `chat-site.route.js` recalls memories for the turn and then, on the very next line, does
//
//     recallMemories = hits.filter((m) => m.kind !== 'card').map((m) => m.content)
//
// ⇒ the ids are discarded one statement after retrieval, and from there on **no layer knows which rows
// are in front of her.** Every consumer downstream sees prose. This is the same shape as everything else
// this week: the information exists in the turn and never reaches anything durable.
//
// ── ⭐⭐ TWO CONSUMERS, ONE RECORD ─────────────────────────────────────────────────────────────────
// Ote asked for two mechanisms on 2026-08-26 and they turn out to need the same fact:
//   1. **Evidence lineage on synthesis** — when she writes a memory that synthesises what she was
//      shown, *what she was shown* is the derivation. Without this the row can only point at the
//      occasion, which is how `676e17b9` came to cite a message from sixteen days after the metaphor.
//   2. **Correction candidates** — *"the corrected memory was in her context when the correction was
//      made."* ⛔ A memory that was never in the room cannot be what the person was correcting, so the
//      trace is a bounded, evidence-backed candidate set. ⛔ Not a similarity search: a memory system
//      that can be argued out of a belief by cosine distance is not a memory system.
//
// ── ⛔ WHAT THIS IS NOT ────────────────────────────────────────────────────────────────────────────
// ⛔ NOT DURABLE. In-process, bounded, TTL'd, and deliberately lost on restart. A persisted trace would
//    be a second copy of who-saw-what with its own retention question, and nothing here needs one.
// ⛔ NOT A DECISION. It records what was retrieved. Whether that means anything is somebody else's job.
// ⛔ NOT AN AUTHORIZATION PATH. Membership in a trace grants no read: every consumer still goes through
//    the store's own scope rules. The trace can only ever NARROW a candidate set, never widen one.

// Excerpts are held so a candidate can be shown to a human without a second query; they are never
// persisted and never leave the process. 160 chars is enough to recognise a row, far short of a copy.
const EXCERPT = 160
const MAX_TURNS = 200            // ~one busy hour; the oldest is evicted first
const TTL_MS = 15 * 60 * 1000    // a turn nobody wrote during is not evidence about a later one

/** turnKey → { at, items: Map(id → {id, kind, excerpt, via}) } */
const TRACES = new Map()

const nowMs = () => Date.now()

function sweep(now = nowMs()) {
  for (const [k, v] of TRACES) if (now - v.at > TTL_MS) TRACES.delete(k)
  while (TRACES.size > MAX_TURNS) TRACES.delete(TRACES.keys().next().value)
}

/**
 * noteRetrieved — record that these memories entered the turn's context.
 *
 * ⚠️ IDEMPOTENT AND ADDITIVE BY ID. A turn retrieves more than once (the passive recall before the
 * reply, then `recall_memory` if she calls it), and the second call must not erase the first — the
 * union is what was actually in front of her. Keyed by id so the same row arriving twice counts once.
 *
 * @param {string|null} turnKey  the turn's user-message id — the same anchor `source_message_id` uses
 * @param {Array<{id?:string, kind?:string, content?:string}>} items
 * @param {{via?: string}} [opts] which path retrieved them ('passive-recall' | 'recall_memory' | …)
 * @returns {number} how many DISTINCT ids the turn's trace now holds
 */
export function noteRetrieved(turnKey, items = [], { via = null } = {}) {
  // ⛔ NO KEY, NO TRACE — and no invented one. A synthetic key would let one turn's retrieval become
  // evidence about another turn's write, which is the precise error a time-window diff already made
  // once on this project (it blamed arm N1 for arm T2's row because the writer was asynchronous).
  if (!turnKey) return 0
  const list = Array.isArray(items) ? items : []
  if (!list.length) return TRACES.get(turnKey)?.items.size ?? 0
  sweep()
  let entry = TRACES.get(turnKey)
  if (!entry) { entry = { at: nowMs(), items: new Map() }; TRACES.set(turnKey, entry) }
  for (const m of list) {
    const id = m?.id != null ? String(m.id) : null
    if (!id || entry.items.has(id)) continue
    entry.items.set(id, {
      id,
      kind: m.kind ?? null,
      excerpt: String(m.content ?? '').replace(/\s+/g, ' ').slice(0, EXCERPT),
      via,
    })
  }
  return entry.items.size
}

/**
 * traceFor — what was in her context during this turn. `[]` when nothing was, or the turn is unknown.
 *
 * ⚠️ EMPTY IS AN ANSWER, NOT AN ERROR. "Nothing was retrieved" and "we have no record for this turn"
 * are genuinely different, so callers that need to tell them apart use `hasTrace`.
 */
export function traceFor(turnKey) {
  if (!turnKey) return []
  const e = TRACES.get(turnKey)
  if (!e) return []
  return [...e.items.values()]
}

/** Do we have any record for this turn at all? Distinguishes "nothing retrieved" from "not observed". */
export const hasTrace = (turnKey) => !!turnKey && TRACES.has(turnKey)

/** Just the ids, which is all the durable lineage is ever allowed to keep. */
export const tracedMemoryIds = (turnKey) => traceFor(turnKey).map((i) => i.id)

/** Drop one turn's trace. Used by tests; the sweep handles the live case. */
export function clearTrace(turnKey) {
  if (turnKey) TRACES.delete(turnKey); else TRACES.clear()
}

/** Introspection for checks and the admin surface. ⛔ ids and counts only — never excerpts. */
export function traceStats() {
  return { turns: TRACES.size, items: [...TRACES.values()].reduce((n, e) => n + e.items.size, 0) }
}
