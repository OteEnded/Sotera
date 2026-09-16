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

// ⭐ A3 · the alias's actor is the RESOLVER, named from the one registry rather than spelled as a string here —
// a literal would be a second place for the writer vocabulary to drift.
import { WRITER } from './memory-writer-contracts.js'

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
export function createSlotStore({ db, persona = null, userId = null, log = null, act = null, now = () => Date.now() } = {}) {
  const mst_slots = db?.mst_slots ?? null
  let disabled = !mst_slots
  // ⭐⭐⭐ A3 · THE OCCASION OF THIS HOST'S RESOLVER OPERATIONS. Declared once at construction beside persona/userId,
  // exactly as the memory store takes its writer/act — ⛔ never manufactured per call. Absent ⇒ `recordAlias`
  // refuses to teach (see below), because an equivalence nobody can be asked about must not become permanent.
  const ACT = act && act.kind && act.id ? { kind: String(act.kind), id: String(act.id) } : null
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
   * ⭐ THE LEDGER WRITE (051). Append-only, best-effort, and DELIBERATELY SEPARATE from the index update:
   * `mst_slots.aliases` is what the resolver READS; this is the history that answers *"which equivalences did
   * this trial teach?"* — a question a mutable index cannot answer, because a removed alias leaves no trace.
   * ⛔ Never allowed to fail a write: the same rule that governs the rest of this file.
   */
  // ⚠️ THE SCHEMA IS TAKEN FROM THE MODEL, ⛔ never hardcoded and ⛔ never left to the connection's `search_path`.
  // A raw `INSERT INTO log_slot_aliases` failed with *relation does not exist*: Sequelize qualifies its MODELS with
  // the schema, but a raw query inherits only the session `search_path`, which does not include it. That is the same
  // family as migration 050 landing its tables in `public` for want of a `SET search_path` — the query side of it.
  const SCHEMA = db?.mst_slots?.options?.schema ?? null
  const LEDGER = SCHEMA ? `"${SCHEMA}"."log_slot_aliases"` : '"log_slot_aliases"'

  async function ledger({ slot, phrase, action, memoryId, by, confidence, declared, reason }) {
    if (!db?.sequelize) return
    try {
      await db.sequelize.query(
        `INSERT INTO ${LEDGER}
           (slot_id, canonical_label, phrase, action, writer, act_kind, act_id, memory_id, relation, declared, by, confidence, reason, persona, user_id)
         VALUES (:slotId, :label, :phrase, :action, :writer, :actKind, :actId, :memoryId, 'same', :declared, :by, :confidence, :reason, :persona, :userId)`,
        {
          replacements: {
            slotId: slot.id, label: String(slot.canonical_label ?? ''), phrase: String(phrase), action,
            writer: WRITER.resolver, actKind: ACT?.kind ?? null, actId: ACT?.id ?? null,
            memoryId: memoryId ?? null, declared: declared === true,
            by: by ?? null, confidence: Number.isFinite(confidence) ? confidence : null,
            reason, persona, userId,
          },
        },
      )
    } catch (e) {
      // ⚠️ LOGGED, ⛔ never swallowed silently. A ledger that fails quietly is the "0 rows for the wrong reason"
      // shape this project has already paid for — the whole point of the table is that it can be trusted empty.
      log?.warn?.({ err: e?.message, slot: slot?.id, phrase, action }, '[memory.slots] alias ledger write FAILED — the operation happened and is now unrecorded')
    }
  }

  /**
   * Record a learned alias — a phrasing that resolved to this slot but is not its canonical label. Skips
   * the canonical label and phrasings already known, so it converges instead of accumulating noise.
   * `by` names the resolver that learned it ('lexical' | 'cosine' | 'llm' | 'ontology').
   *
   * ══ ⭐⭐⭐ A3 (Ote, 2026-09-16) — TEACHING IS GOVERNED. BINDING IS NOT. ═══════════════════════════════════
   *
   *     "Only an adjudicated `same` verdict may teach/promote an alias.
   *      A cheap-arm hit may BIND, but it may not TEACH."
   *
   * The cheap arm may USE an equivalence that already exists; it may not CREATE a permanent one from a lexical
   * or cosine hit. The measured reason: `"schedule"` was taught onto `work schedule` at containment 1.0000, and
   * 37 minutes later that alias — not the label, which scored 0.5 and would have refused — admitted
   * `volunteer_schedule_and_location`. ⇒ cheap hit → bind → teach → cheap hit → … is a self-reinforcing cascade,
   * and this is where it is severed.
   *
   * ⭐ A REFUSAL IS RECORDED, ⛔ NOT DROPPED. "How often did the cheap arm want to teach?" is the measurement that
   * makes this ban reviewable without turning a classifier on. A silent refusal would leave it unfalsifiable.
   *
   * @param {object}  slot
   * @param {string}  phrase
   * @param {object}  opts
   * @param {boolean} opts.adjudicated  ⭐ did a classifier actually RULE `same`? Anything else may not teach.
   * @param {string}  opts.memoryId     the row whose successful resolution caused this — the reversibility handle
   * @param {boolean} opts.declared     ⛔ false for a derived verdict (see 051's derived-vs-declared note)
   */
  async function recordAlias(slot, phrase, { by = null, confidence = null, adjudicated = false, memoryId = null, declared = false } = {}) {
    if (disabled || !slot || !phrase) return false
    const n = norm(phrase)
    if (!n || n === norm(slot.canonical_label)) return false
    const current = Array.isArray(slot.aliases) ? slot.aliases : []
    if (current.some((a) => norm(a?.phrase) === n)) return false

    // ── ⭐⭐ THE TEACH GATE, and the order of the two refusals matters ──────────────────────────────────────
    // ⛔ NOT ADJUDICATED first: it is the semantic rule. An unadjudicated phrase is not a candidate equivalence at
    // all, so it is refused before the occasion is even considered.
    if (adjudicated !== true) {
      await ledger({ slot, phrase, action: 'refuse', memoryId, by, confidence, declared: false,
        reason: `refused: ${by ?? 'cheap-arm'} resolution is not an adjudicated verdict — a cheap-arm hit may bind but may not teach (A3)` })
      log?.debug?.({ slot: slot.id, label: slot.canonical_label, phrase, by }, '[memory.slots] alias NOT learned — binding is not adjudication (A3)')
      return false
    }
    // ⛔ NO OCCASION ⇒ NO TEACHING. `WRITER.resolver` is `pass: false`: there is no occasion-less resolver alias.
    if (!ACT) {
      await ledger({ slot, phrase, action: 'refuse', memoryId, by, confidence, declared: false,
        reason: 'refused: no occasion declared for the resolver — an equivalence nobody can be asked about must not become permanent (A3)' })
      log?.warn?.({ slot: slot.id, phrase }, '[memory.slots] alias REFUSED — adjudicated, but no occasion was declared')
      return false
    }
    if (current.length >= MAX_ALIASES) {
      log?.debug?.({ slot: slot.id, label: slot.canonical_label }, '[memory.slots] alias cap reached — not learning more phrasings for this slot')
      await ledger({ slot, phrase, action: 'refuse', memoryId, by, confidence, declared,
        reason: `refused: this slot already holds ${MAX_ALIASES} phrasings — a slot with more than that is a signal to review` })
      return false
    }
    try {
      // ⭐ THE INDEX gains the accountability fields too, so a reader of `mst_slots` alone is not left with the
      // 048-era record that names no actor and no cause. The LEDGER is still the history; this is the index.
      await slot.update({
        aliases: [...current, {
          phrase: String(phrase), by, confidence, at: new Date(now()).toISOString(),
          writer: WRITER.resolver, act: ACT, memoryId: memoryId ?? null, relation: 'same', declared: declared === true,
        }],
      })
      await ledger({ slot, phrase, action: 'promote', memoryId, by, confidence, declared,
        reason: `promoted: an adjudicated 'same' verdict (${by ?? 'unknown arm'}) — this phrasing now resolves here for free` })
      log?.info?.({ slot: slot.id, label: slot.canonical_label, phrase, by, act: ACT }, '[memory.slots] learned alias — an adjudicated verdict became permanent')
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
