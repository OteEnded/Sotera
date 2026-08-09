// Persona Memory V3 — the SLOT STORE service (RFC_MEMORY_SLOT_RESOLVER §3/§6, adoption step B2). Phase 6.
//
// mst_slots are the long-lived identity of a conceptual property; facts point at one via `slot_id`. Two jobs:
//
//   1. ENSURE  — get-or-create the slot for (canonical owner, namespace, label) in this scope. The unique
//                index makes it race-safe, which matters because the writers that created duplicate facts
//                in the first place (model tool + auto-extractor) can still run concurrently.
//   2. LEARN   — record an ALIAS when a phrasing resolves to a slot whose canonical label differs. This is
//                the persistent half of "System 2 → learned alias → future writes become System 1": a
//                verdict paid for once (expensively, by cosine today and by an LLM in Phase 7) survives
//                restarts. An in-memory cache would teach the runtime; this teaches the PERSONA.
//
// DEGRADES SILENTLY: if the table/column isn't provisioned (see test/maintenance/add-slots-store.mjs) or a
// lightweight caller wires only the Memories model, the store disables itself and the memory service keeps
// working exactly as before. Slot bookkeeping must never be able to fail a write.
//
// NO VECTORS here (§8a) — an embedding is a resolver's private index, not a property of the concept.

const norm = (v) => (v == null ? '' : String(v)).trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ')
const MAX_ALIASES = 24 // a slot with more phrasings than this is a signal to review, not to keep growing

/**
 * @param {object} deps
 * @param {object} deps.db        models bag; needs `mst_slots` (absent → disabled)
 * @param {string|null} [deps.persona]
 * @param {string|null} [deps.userId]
 * @param {object|null} [deps.log]
 * @param {()=>number} [deps.now]
 */
export function createSlotStore({ db, persona = null, userId = null, log = null, now = () => Date.now() } = {}) {
  const mst_slots = db?.mst_slots ?? null
  let disabled = !mst_slots
  if (disabled) log?.debug?.('[memory.slots] slot store disabled (no mst_slots model wired) — facts write without slot_id')

  const scope = (entity, namespace) => ({ persona, user_id: userId, entity, namespace })

  /** Get-or-create the slot for this (owner, namespace, label). Returns the row, or null if unavailable. */
  async function ensure({ entity, namespace = 'default', canonicalLabel, evidence = null } = {}) {
    if (disabled || !entity || !canonicalLabel) return null
    const where = { ...scope(entity, namespace), canonical_label: String(canonicalLabel) }
    try {
      const [row] = await mst_slots.findOrCreate({ where, defaults: { ...where, evidence, write_count: 0 } })
      return row
    } catch (e) {
      // a concurrent creator won the unique index → just read theirs
      try {
        const row = await mst_slots.findOne({ where })
        if (row) return row
      } catch { /* fall through to disable */ }
      disabled = true
      log?.warn?.({ err: e?.message }, '[memory.slots] slot store disabled (table missing or unusable) — facts write without slot_id')
      return null
    }
  }

  /** The slot a fact already belongs to (by id), or null. */
  async function get(slotId) {
    if (disabled || !slotId) return null
    try { return await mst_slots.findOne({ where: { id: slotId } }) } catch { return null }
  }

  /**
   * Record a learned alias — a phrasing that resolved to this slot but is not its canonical label. Skips
   * the canonical label and phrasings already known, so it converges instead of accumulating noise.
   * `by` names the resolver that learned it ('lexical' | 'cosine' | 'llm' | 'ontology').
   */
  async function recordAlias(slot, phrase, { by = null, confidence = null } = {}) {
    if (disabled || !slot || !phrase) return false
    const n = norm(phrase)
    if (!n || n === norm(slot.canonical_label)) return false
    const current = Array.isArray(slot.aliases) ? slot.aliases : []
    if (current.some((a) => norm(a?.phrase) === n)) return false
    if (current.length >= MAX_ALIASES) {
      log?.debug?.({ slot: slot.id, label: slot.canonical_label }, '[memory.slots] alias cap reached — not learning more phrasings for this slot')
      return false
    }
    try {
      await slot.update({ aliases: [...current, { phrase: String(phrase), by, confidence, at: new Date(now()).toISOString() }] })
      log?.debug?.({ slot: slot.id, label: slot.canonical_label, phrase, by }, '[memory.slots] learned alias')
      return true
    } catch { return false }
  }

  /** Cheap usage signal (telemetry + future pruning). Best-effort. */
  async function touch(slot) {
    if (disabled || !slot) return
    try { await slot.update({ write_count: (slot.write_count || 0) + 1, last_write: new Date(now()) }) } catch { /* best-effort */ }
  }

  /** Enumerate this scope's slots (inspection / future ontology work). */
  async function list({ limit = 200 } = {}) {
    if (disabled) return []
    try {
      return await mst_slots.findAll({ where: { persona, user_id: userId }, order: [['last_write', 'DESC NULLS LAST']], limit, raw: true })
    } catch { return [] }
  }

  return { ensure, get, recordAlias, touch, list, get isDisabled() { return disabled } }
}
