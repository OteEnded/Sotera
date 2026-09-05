// ⭐⭐⭐ PROVENANCE REFERENCES — 0..n typed pointers to what a memory rests on; speaker and date RESOLVED, never copied.
//
// `SPEC_SOTERA_PROVENANCE_AXES_IMPLEMENTATION.md` §5–§6. The pure half (span verification, speaker, said derivation,
// the view) has no db; the host half writes and reads `txn_memory_evidence`.
//
// ── ⭐ WHAT A REFERENCE ESTABLISHES ──────────────────────────────────────────────────────────────────
//   turn      support · SPEAKER (the turn's role) · DATE (the turn's local day)   ← the only kind that grounds `said`
//   memory    support only — a memory about what he said is not his utterance
//   document  support · a document date (⛔ not a said date)
//   record    support only
// Zero established references ⇒ `{ established: false }` — the honest default of every pass-driven writer, and a state
// that MUST be sayable while the row has an act and a reach (I3, I7).
//
// ── ⭐ THE VERIFICATION THAT EARNS A TURN REFERENCE ──────────────────────────────────────────────────
// The same standard that earns `quoted` on the extractor path: the value (or a cited span) appears VERBATIM in the
// referenced turn's text, whitespace/case-normalised. ⛔ No search of any other turn. ⛔ A failed citation is RECORDED
// as failed and the memory item is still written (I10): fail closed on the reference, never on the item.
import { REFERENCE_KIND, VERIFICATION, actKey, normalizeAct } from './memory-writer-contracts.js'

// ── PURE ─────────────────────────────────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Normalised containment. A span under 4 characters is not evidence of anything. */
export function spanAppears(text, span) {
  const t = norm(text); const s = norm(span)
  if (!t || s.length < 4) return false
  return t.includes(s)
}

/** The speaker of a turn, from its role and nothing else. */
export function speakerOf(role) {
  if (role === 'user') return 'account-holder'
  if (role === 'assistant') return 'persona'
  return null
}

/** `said` from account-holder turn dates: exactly one distinct day ⇒ that day; several ⇒ WITHHELD (null); none ⇒ null. */
export function saidFrom(dates) {
  const days = new Set((Array.isArray(dates) ? dates : []).filter((d) => typeof d === 'string' && DATE_RE.test(d)))
  return days.size === 1 ? [...days][0] : null
}

/** The model-facing view of a memory's references. Established = at least one reference verified/declared/attested. */
export function provenanceView(refs) {
  const references = (Array.isArray(refs) ? refs : []).map((r) => ({
    kind: r.ref_kind ?? r.kind, target: r.target, span: r.span ?? null, credential: r.credential ?? null,
    established: r.established === true, verification: r.verification ?? null,
    speaker: r.speaker ?? null, date: r.date ?? null, state: r.state ?? null,
  }))
  return { established: references.some((r) => r.established), references }
}

// ── HOST ─────────────────────────────────────────────────────────────────────────────────────────────

const tableOf = (db, name) => {
  const { schema } = db.txn_memories.getTableName()
  return schema ? `"${schema}"."${name}"` : `"${name}"`
}
const Q = async (db, sql, replacements) => db.txn_memories.sequelize.query(sql, { replacements, type: db.txn_memories.sequelize.QueryTypes.SELECT, logging: false })

/**
 * Load the message a turn reference points at — id, role, content, conversation, rolling_id. ⛔ Resolution only.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
async function loadTurn(db, messageId) {
  // a target that is not even uuid-shaped cannot be a message — "does not exist", ⛔ not a query error that drops every reference
  if (!messageId || !UUID_RE.test(String(messageId)) || !db?.txn_messages) return null
  return db.txn_messages.findOne({ where: { id: messageId }, attributes: ['id', 'role', 'content', 'conversation_id', 'rolling_id', 'created_at'], raw: true })
}

/**
 * ⭐ WRITE references for one memory. Each `ref` is `{ kind, target, span?, credential?, how? }`. Turn references are
 * VERIFIED here unless `attests` (operator) or `how === declared-coincidence` (the writer's contract); a failed one
 * is written with `established: false` and `verification: { how: 'failed', reason }`.
 *
 * @param {object} db
 * @param {object} o
 * @param {string} o.memoryId
 * @param {Array}  o.refs
 * @param {{kind,id}|null} o.act       the act recording the references
 * @param {object|null} o.reach        the row's reach — a pass writer's turn citation must lie inside its range (R3)
 * @param {boolean} [o.attests]        operator attestation: turn refs skip span checks but must exist
 * @returns {Promise<Array>} the rows written (plain objects)
 */
export async function createReferences(db, { memoryId, refs = [], act = null, reach = null, attests = false } = {}) {
  if (!db?.txn_memory_evidence || !memoryId || !Array.isArray(refs) || !refs.length) return []
  const a = normalizeAct(act)
  const out = []
  for (let ref of refs) {
    const kind = ref?.kind
    if (!Object.values(REFERENCE_KIND).includes(kind)) continue
    // ⭐ a WRITER-DECLARED failure (e.g. a citation ordinal that resolved to nothing) is recorded as failed, target and all —
    //    the row's provenance shows the fabricated citation instead of hiding it (I10)
    if (ref.how === VERIFICATION.failed) {
      const row = await db.txn_memory_evidence.create({
        memory_id: memoryId, ref_kind: kind, target: ref.target == null ? '' : String(ref.target), span: ref.span ?? null,
        credential: null, established: false, verification: { how: VERIFICATION.failed, reason: String(ref.reason ?? 'the writer declared this citation failed') },
        act_kind: a?.kind ?? null, act_id: a?.id ?? null,
      })
      out.push(row.get({ plain: true }))
      continue
    }
    if (!ref?.target) continue
    let established = true
    let verification = { how: ref.how ?? VERIFICATION.writerCited }
    if (kind === REFERENCE_KIND.turn) {
      const turn = await loadTurn(db, ref.target)
      if (!turn) { established = false; verification = { how: VERIFICATION.failed, reason: 'the cited message does not exist' } }
      else if (reach?.kind === 'range' && (turn.conversation_id !== reach.conversationId || turn.rolling_id < reach.from || turn.rolling_id > reach.to)) {
        established = false; verification = { how: VERIFICATION.failed, reason: 'the cited message lies outside the reviewed range' }
      } else if (reach?.kind === 'turn' && reach.conversationId && turn.conversation_id !== reach.conversationId) {
        established = false; verification = { how: VERIFICATION.failed, reason: 'the cited message is not in this conversation' }
      } else if (ref.how === VERIFICATION.declaredCoincidence) {
        verification = { how: VERIFICATION.declaredCoincidence }
      } else if (ref.span != null) {
        // ⭐ a SPAN is a checkable claim and is checked FIRST — attestation vouches for a turn, ⛔ never for words that are not in it
        // a VERIFIED verbatim span is the definition of `quoted` — the credential rides the reference unless the writer set one
        if (spanAppears(turn.content, ref.span)) { verification = { how: VERIFICATION.spanVerified }; if (ref.credential == null) ref = { ...ref, credential: 'quoted' } }
        else { established = false; verification = { how: VERIFICATION.failed, reason: 'the cited span is not in the cited turn' } }
      } else if (attests || ref.how === VERIFICATION.operatorAttested) {
        verification = { how: VERIFICATION.operatorAttested }
      } else {
        verification = { how: VERIFICATION.writerCited }
      }
    }
    const row = await db.txn_memory_evidence.create({
      memory_id: memoryId, ref_kind: kind, target: String(ref.target), span: ref.span ?? null,
      credential: ref.credential ?? null, established, verification,
      act_kind: a?.kind ?? null, act_id: a?.id ?? null,
    })
    out.push(row.get({ plain: true }))
  }
  return out
}

/**
 * ⭐ READ references for many memories, with speaker/date/state RESOLVED from the referenced turn (⛔ never stored).
 * @returns {Promise<Map<string, {established:boolean, references:Array}>>} every requested id is present
 */
export async function provenanceFor(db, memoryIds = [], { tz = 'UTC' } = {}) {
  const out = new Map()
  const ids = [...new Set((memoryIds ?? []).filter(Boolean).map(String))]
  for (const id of ids) out.set(id, { established: false, references: [] })
  if (!ids.length || !db?.txn_memory_evidence) return out
  const rows = await Q(db, `
    SELECT e.memory_id::text AS memory_id, e.ref_kind, e.target, e.span, e.credential::text AS credential, e.established, e.verification,
           msg.role AS turn_role, (msg.created_at AT TIME ZONE :tz)::date::text AS turn_day,
           CASE WHEN e.ref_kind = 'turn' AND e.target <> '' THEN (CASE WHEN msg.id IS NULL THEN 'source-destroyed' ELSE 'source-readable' END) ELSE NULL END AS state
      FROM ${tableOf(db, 'txn_memory_evidence')} e
      LEFT JOIN ${tableOf(db, 'txn_messages')} msg ON e.ref_kind = 'turn' AND msg.id::text = e.target
     WHERE e.memory_id = ANY(ARRAY[:ids]::uuid[])
     ORDER BY e.rolling_id`, { ids, tz })
  const by = new Map()
  for (const r of rows) {
    const list = by.get(r.memory_id) ?? []
    list.push({
      ref_kind: r.ref_kind, target: r.target, span: r.span, credential: r.credential, established: r.established === true,
      verification: r.verification, state: r.state,
      // ⭐ speaker and date come from the TURN, and only for established turn references
      speaker: r.ref_kind === 'turn' && r.established ? speakerOf(r.turn_role) : null,
      date: r.ref_kind === 'turn' && r.established ? (r.turn_day ?? null) : null,
    })
    by.set(r.memory_id, list)
  }
  for (const [id, list] of by) out.set(id, provenanceView(list))
  return out
}

/** ⭐ `said` for many memories: the single day of established ACCOUNT-HOLDER turn references, else null. */
export async function saidFor(db, memoryIds = [], { tz = 'UTC' } = {}) {
  const prov = await provenanceFor(db, memoryIds, { tz })
  const out = new Map()
  for (const [id, p] of prov) out.set(id, saidFrom(p.references.filter((r) => r.kind === 'turn' && r.established && r.speaker === 'account-holder').map((r) => r.date)))
  return out
}

/**
 * ⭐ `decided` — the ACT's day, resolved from the ledger that identifies the act. Internal (FINAL §4): exposed nowhere new.
 * Turn-driven acts and rows without an act fall back to the row's own creation day (decided ≡ recorded there).
 */
export async function decidedFor(db, row, { tz = 'UTC' } = {}) {
  if (!row) return null
  const day = async (sql, r) => (await Q(db, sql, r))[0]?.d ?? null
  if (row.act_kind === 'revisit' && row.act_id) {
    return day(`SELECT (coalesce(started_at, created_at) AT TIME ZONE :tz)::date::text AS d FROM ${tableOf(db, 'log_conversation_revisits')} WHERE id = :id::uuid`, { id: row.act_id, tz })
  }
  if (row.act_kind === 'dreaming' && row.act_id) {
    return day(`SELECT (coalesce(started_at, created_at) AT TIME ZONE :tz)::date::text AS d FROM ${tableOf(db, 'log_dreaming_passes')} WHERE id = :id::uuid`, { id: row.act_id, tz })
  }
  if (row.act_kind === 'turn' && row.act_id) {
    return day(`SELECT (created_at AT TIME ZONE :tz)::date::text AS d FROM ${tableOf(db, 'txn_messages')} WHERE id = :id::uuid`, { id: row.act_id, tz })
  }
  return day(`SELECT (created_at AT TIME ZONE :tz)::date::text AS d FROM ${tableOf(db, 'txn_memories')} WHERE id = :id::uuid`, { id: row.id, tz })
}

export { actKey }
