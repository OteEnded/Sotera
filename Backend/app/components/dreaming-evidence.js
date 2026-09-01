// ⭐⭐⭐ THE PER-ROOT EVIDENCE CONSUMER — the one piece the input-tier analysis found missing.
//
// PURE. No stores, no IO, no config, no model. Rows are handed in; this file groups and bounds them.
//
// ── ⭐⭐ THE CONTRACT (Ote, 2026-09-01) ──────────────────────────────────────────────────────────
//   · **bounded** evidence — an excerpt, ⛔ never a full message, ⛔ never surrounding context
//   · **structurally selected** — the candidate turns are found by a structural match FIRST
//   · **grouped by conversation root** — ⛔ never a flat list
//   · **one room** — ⛔ no cross-room material at this stage
//   · ⭐⭐⭐ **THE SYSTEM ESTABLISHES INDEPENDENCE; THE MODEL DOES NOT.**
//
// ⓘ *"The 300-character value is not sacred. Treat 'bounded, structurally selected evidence' as the
// contract; 300 chars is the current implementation shape we can test."* ⇒ `excerptChars` is a parameter,
// and the DEFAULT is the shape `conversation-search.toEvidence` already uses in production.
//
// ── ⛔⛔ WHY BUCKETS AND NOT A LIST ─────────────────────────────────────────────────────────────
// Ote's stated failure mode, verbatim: *"many messages → one big context → model says 'this keeps
// happening' if the system can no longer demonstrate that the evidence came from independent episodes."*
//
// ⇒ ⭐ this module returns **BUCKETS**, and `roots` is **`buckets.length`, computed HERE.** The model is
// never handed the aggregate, so **it cannot assert one.** *The model proposes; the system counts.*
//
// ⛔ AND IT REFUSES BELOW THE MINIMUM. Fewer than two independent roots is not a weak pattern — under O-2
// it is **not a pattern at all**, and it is **Reflection's territory (P1), never Dreaming's**.

/** ⓘ The shape `conversation-search.toEvidence` already produces for the Composer. ⛔ Not sacred. */
export const DEFAULT_EXCERPT_CHARS = 300

/** ⭐ The minimum O-2 requires. ⛔ Not a tunable threshold — it is the boundary between one event and a
 *  pattern, and lowering it would let a single occasion manufacture recurrence. */
export const MIN_INDEPENDENT_ROOTS = 2

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'or', 'in', 'on', 'for', 'is', 'my', 'own', 'user'])

/**
 * ⭐⭐ Probe terms for a slot — derived from the slot's OWN LABEL, deterministically.
 *
 * ⭐ This is recall-before-remember applied at the DISCOVERY stage: Dreaming asks *"do the things I
 * already hold a slot for recur across independent episodes?"* ⇒ the probe comes from the **memory
 * layer**, ⛔ not from whoever wrote this file, and the candidate space is **finite**.
 *
 * ⚠️ Crude on purpose: token matching, ⛔ no embedding, ⛔ no model. A structural selector must be
 * inspectable, and *"why was this turn selected?"* must have a one-word answer.
 */
export function probeTermsFor(attribute) {
  return String(attribute ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !STOP.has(t))
}

/** ⭐ Bound one message to an excerpt. ⛔ The only prose that leaves this module. */
export const boundExcerpt = (content, chars = DEFAULT_EXCERPT_CHARS) =>
  String(content ?? '').slice(0, Math.max(0, chars))

/**
 * ⭐⭐⭐ admitEvidence — group structurally-selected turns by ROOT and decide whether they constitute
 * evidence at all.
 *
 * @param {object} o
 * @param {Array<{message_id, conversation_id, created_at, content, room}>} o.rows  already
 *        structurally selected AND already admissibility-filtered by the caller's SQL
 * @param {string|null} o.room      the single room these came from — ⛔ a mixed set is refused
 * @returns {{ok, why, roots, buckets, totalTurns}}
 */
export function admitEvidence({ rows = [], room = null, excerptChars = DEFAULT_EXCERPT_CHARS,
  minRoots = MIN_INDEPENDENT_ROOTS } = {}) {
  // ⛔ ONE ROOM. A mixed set is refused rather than filtered — silently dropping the foreign rows would
  // make the root count depend on a filter the caller cannot see.
  const rooms = [...new Set(rows.map((r) => r.room).filter(Boolean))]
  if (rooms.length > 1) {
    return { ok: false, why: `evidence spans ${rooms.length} rooms — this stage is room-scoped and refuses a mixed set`, roots: 0, buckets: [] }
  }
  if (room && rooms.length === 1 && rooms[0] !== room) {
    return { ok: false, why: 'evidence is not from the requested room', roots: 0, buckets: [] }
  }

  const byRoot = new Map()
  for (const r of rows) {
    const root = r.conversation_id
    if (!root) continue // ⛔ a turn whose root cannot be established is DROPPED — it cannot support independence
    if (!byRoot.has(root)) byRoot.set(root, { root, turns: [] })
    byRoot.get(root).turns.push({
      messageId: r.message_id,
      at: r.created_at,
      // ⭐ THE ONLY PROSE. Bounded here, once, so no caller can widen it downstream.
      excerpt: boundExcerpt(r.content, excerptChars),
    })
  }
  const buckets = [...byRoot.values()]
  // ⭐⭐⭐ ROOTS IS COMPUTED HERE. The model receives `buckets` and never a total.
  const roots = buckets.length
  if (roots < minRoots) {
    return {
      ok: false,
      // ⭐ Says WHOSE territory this is, because "not enough" invites someone to lower the number.
      why: `${roots} independent root(s) — below the O-2 minimum of ${minRoots}. One occasion is Reflection's territory, not Dreaming's`,
      roots,
      buckets,
      totalTurns: rows.length,
    }
  }
  return { ok: true, why: `${roots} independent conversation roots`, roots, buckets, totalTurns: rows.length }
}

/** ⛔ Exported so a check can assert the INTENT, not merely the grouping. */
export const THE_SYSTEM_COUNTS_THE_ROOTS =
  'Evidence reaches the model grouped by conversation root and never as a flat list, and the number of '
  + 'independent roots is computed by this module rather than asserted by the model. The model says what it '
  + 'sees within each bucket; the system says how many buckets there were. Below two independent roots '
  + 'nothing is admitted at all, because one occasion is not a pattern -- it is Reflection\'s territory.'
