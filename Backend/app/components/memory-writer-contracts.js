// ⭐⭐⭐ WRITER CONTRACTS — the four axes, and the ONE rule that keeps them apart. PURE. No db, no host.
//
// `SPEC_SOTERA_PROVENANCE_AXES_IMPLEMENTATION.md` §1–§3, §7, §12 · `FINAL_SEMANTIC_REMEDIATION_ARCHITECTURE_V1.md`.
//
// ── ⭐ THE RULE ──────────────────────────────────────────────────────────────────────────────────────
// No axis is ever derived from another. OCCASION (which act) · REACHABILITY (what material) · PROVENANCE (what
// evidence) · TEMPORAL (which date, grounded in which axis). The only bridge is a WRITER-DECLARED COINCIDENCE,
// recorded HERE, true by the writer's MECHANISM: the extractor cannot read anything but the turn it was handed, so
// for it the occasion turn IS the evidence turn. ⛔ No other writer may claim that — measured 2026-09-05: chat-tool
// values appear verbatim in their occasion turn in 4 of 37 rows; `memory-lineage.js` documents the Rome row that
// was anchored sixteen days after the metaphor was coined.
//
// ── ⭐ WHY A REGISTRY AND NOT A PREFIX ──────────────────────────────────────────────────────────────────
// `source` already encodes a mechanism by prefix (`conversation:` · `doc:` · `episode:`), and `model-tool` is used by
// BOTH chat tools and reflection's `retain` — the prefix cannot tell a turn-driven write from a pass-driven one.
// The writer is therefore an EXPLICIT key on the row, set by the host that knows which occasion it is serving,
// ⛔ never inferred from the label.

/** The kinds of ACT a memory operation can be. The act's identity lives in the ledger that already records it. */
export const ACT_KIND = Object.freeze({
  turn: 'turn',           // a conversational turn — the user message that occasioned the operation (txn_messages)
  revisit: 'revisit',     // a reflection pass — log_conversation_revisits.id, claimed BEFORE the tools run
  dreaming: 'dreaming',   // a Dreaming pass — log_dreaming_passes.id
  job: 'job',             // a scheduled job run — log_trigger_job_runs.id (the distiller would use this)
  operator: 'operator',   // a named ruling, e.g. `reconcile:rome-2026-09-02` — the label IS the act
  ingest: 'ingest',       // a document ingest at a commit — `doc:<path>@<sha>` — the label IS the act
  record: 'record',       // a lesson / decline record — its own id
  // ⭐⭐ CLARIFIED BY OTE, 2026-09-16, when `person` joined `admin` on this kind. It used to read "an operator act
  // through the ADMIN SURFACE", which was too narrow the moment a second writer used it.
  //
  //   *"I want `request:<request.id>` to mean the HTTP request as the occasion identity, with the WRITER carrying the
  //    actor distinction. Do not introduce act=person; actor identity belongs on writer, while request identifies the
  //    occasion/mechanism."*
  //
  //   admin  + request:<id>   root/operator acting through the admin surface
  //   person + request:<id>   the account holder acting on their own memory
  //
  // ⇒ the two axes answer two questions and neither answers the other's: WHO acted is the writer, WHAT OCCASION it was
  // is the act. ⛔ Never encode the actor here — that would make the same occasion kind mean two things.
  request: 'request',     // an HTTP request as the occasion — its identity IS the act; the WRITER says who acted
})

/** What material the act worked from. */
export const REACH_KIND = Object.freeze({
  turn: 'turn',           // one message (turn-driven writers)
  range: 'range',         // a reviewed range of one conversation (pass-driven writers) — ⛔ never a point
  document: 'document',   // a file at a commit
  none: 'none',           // the writer's material is not a conversation (records, rulings)
})

/**
 * ⭐ REFERENCE_KIND — what a PROVENANCE REFERENCE points at. ⛔ Deliberately NOT called "basis": `memory-lineage.js`'s
 * BASIS (`turn` / `in-context` = presence) and `memory-cognition-axes.js`'s BASIS (grounds of belief) are two other
 * concepts under one name; this vocabulary names the reference's KIND and nothing about belief.
 */
export const REFERENCE_KIND = Object.freeze({
  turn: 'turn',           // a message — the only kind that can establish SPEAKER and DATE
  memory: 'memory',       // another memory — support only
  document: 'document',   // a file at a commit — support, and a document date
  record: 'record',       // a Sotera record (lesson, decline, practice) — support only
})

/** ⭐⭐ F9 · the ONE-WAY ceiling: what belief basis a reference kind may at most support. A memory reference never lifts a
 *  belief above `inferred` — presence is not attestation. (Values are the cognition axis's words, read-only here.) */
export const BELIEF_CEILING = Object.freeze({
  [REFERENCE_KIND.turn]: 'attested-by-source',
  [REFERENCE_KIND.document]: 'attested-by-source',
  [REFERENCE_KIND.memory]: 'inferred',
  [REFERENCE_KIND.record]: 'inferred',
})

export const COINCIDENCE = Object.freeze({
  /** the occasion turn IS the evidence turn — true by mechanism for writers that read exactly one turn */
  occasionTurnIsEvidence: 'occasion-turn-is-evidence',
})

/** How a provenance reference came to be established — or failed. */
export const VERIFICATION = Object.freeze({
  declaredCoincidence: 'declared-coincidence', // the writer's contract (extractor / identity)
  spanVerified: 'span-verified',               // the value/span was found verbatim in the referenced turn
  operatorAttested: 'operator-attested',       // an operator selected the turn (reconcile)
  writerCited: 'writer-cited',                 // the writer named the reference and it resolved
  failed: 'failed',                            // the writer named a reference that did NOT resolve or verify — kept, I10
})

export const WRITER = Object.freeze({
  extractor: 'extractor', identity: 'identity', chatTool: 'chat-tool', followthrough: 'followthrough',
  reflection: 'reflection', notes: 'notes', dreaming: 'dreaming', distiller: 'distiller', operator: 'operator', ingest: 'ingest',
  lesson: 'lesson', decline: 'decline', admin: 'admin', person: 'person', job: 'job', unknown: 'unknown',
})

const contract = (writer, o) => Object.freeze({
  writer, actKind: null, pass: false, reach: null, coincidence: null, verify: null, attests: false, enabled: true, ...o,
})

/** The contracts, as data. `pass: true` ⇒ the store REFUSES a write without an act (I1, I9). */
export const CONTRACTS = Object.freeze({
  [WRITER.extractor]: contract(WRITER.extractor, { actKind: ACT_KIND.turn, reach: REACH_KIND.turn, coincidence: COINCIDENCE.occasionTurnIsEvidence }),
  [WRITER.identity]: contract(WRITER.identity, { actKind: ACT_KIND.turn, reach: REACH_KIND.turn, coincidence: COINCIDENCE.occasionTurnIsEvidence }),
  [WRITER.chatTool]: contract(WRITER.chatTool, { actKind: ACT_KIND.turn, reach: REACH_KIND.turn, verify: 'span-in-occasion-turn' }),
  [WRITER.followthrough]: contract(WRITER.followthrough, { actKind: ACT_KIND.turn, reach: REACH_KIND.turn, verify: 'span-in-occasion-turn' }),
  [WRITER.reflection]: contract(WRITER.reflection, { actKind: ACT_KIND.revisit, pass: true, reach: REACH_KIND.range }),
  // ⭐⭐ D8(b), ruled by Ote 2026-09-16 — the L3 PERSONA-NOTES writer, which had no contract at all.
  //
  // ⚠️⚠️ WHY ITS REACH IS `none` AND NOT THE PASS'S RANGE, WHICH IS THE WHOLE POINT OF GIVING IT ITS OWN CONTRACT.
  // Ote: *"A persona note is a self-authored generalization about practice; the revisit occasion explains WHEN it was
  // formed, but it does not establish that the reviewed conversation is EVIDENCE for the generalized note."* Reusing
  // `reflection`'s `range` would have been the smaller edit and would have made every note claim a stretch of material as
  // its support — `coverage-exceeds-reviewed` pointed the other way. ⇒ the occasion is declared; the reachability claim is
  // declared to be NOTHING. ⭐ That is §0's rule working: no axis is derived from another.
  //
  // ⓘ AND IT IS ALSO NOT DERIVED FROM CONVERSATION AT ALL: `reflectScope` distils from her own FACTS AND CARDS, never
  // from raw turns, so there is no message, no range and no document a note could honestly point at.
  // ⛔ A CONTRACT IS NOT AN ENABLEMENT. `memory.reflectMode` stays OFF; this says what the writer IS when it runs.
  [WRITER.notes]: contract(WRITER.notes, { actKind: ACT_KIND.revisit, pass: true, reach: REACH_KIND.none }),
  [WRITER.dreaming]: contract(WRITER.dreaming, { actKind: ACT_KIND.dreaming, pass: true, reach: REACH_KIND.none }),
  // ⭐ D9(a), ruled 2026-09-16: the act is now MINTED and the writer is wired (`memory-distill-host.js`). The FEATURE gate
  // `memory.episodeDistillEnabled` is a separate thing and stays OFF — wiring a writer is not enabling a feature.
  // ⚠️ `enabled` is read by NOTHING in this codebase (checked 2026-09-16) — it is a declaration with no reader, the shape
  // `declared-axis-needs-a-mandatory-seam` warns about. It is left as-is and reported rather than quietly flipped, because
  // changing a field nobody reads would look like a behaviour change and be none.
  [WRITER.distiller]: contract(WRITER.distiller, { actKind: ACT_KIND.job, pass: true, reach: REACH_KIND.range, enabled: false }),
  [WRITER.operator]: contract(WRITER.operator, { actKind: ACT_KIND.operator, attests: true }),
  [WRITER.ingest]: contract(WRITER.ingest, { actKind: ACT_KIND.ingest, reach: REACH_KIND.none }),
  [WRITER.lesson]: contract(WRITER.lesson, { actKind: ACT_KIND.record, reach: REACH_KIND.none }),
  [WRITER.decline]: contract(WRITER.decline, { actKind: ACT_KIND.record, reach: REACH_KIND.none }),
  // ⭐ ADMIN · root or an operator acting THROUGH THE ADMIN SURFACE, on somebody's memory.
  [WRITER.admin]: contract(WRITER.admin, { actKind: ACT_KIND.request, reach: REACH_KIND.none }),
  // ⭐⭐ PERSON · THE ACCOUNT HOLDER ACTING ON THEIR OWN MEMORY (Ote, 2026-09-16, ruling option (b)).
  //
  // ⛔ NOT `admin`, AND THE DISTINCTION IS DELIBERATE: *"admin = root/operator acting through admin surface; person =
  // account holder acting on their own memory. Do not use writer: admin for the chat deletion."* Collapsing the two
  // would lose, at the cheapest possible point, the difference between someone editing THEIR OWN beliefs and someone
  // editing SOMEBODY ELSE'S — which is exactly the question the writer axis exists to answer.
  // ⓘ Same act kind as admin (`request:<request.id>`) because the OCCASION is the same mechanism — an HTTP request.
  // The actor distinction rides on the writer, never on the act. See ACT_KIND.request above.
  [WRITER.person]: contract(WRITER.person, { actKind: ACT_KIND.request, reach: REACH_KIND.none }),
  [WRITER.job]: contract(WRITER.job, { actKind: ACT_KIND.job }),
  [WRITER.unknown]: contract(WRITER.unknown, {}),
})

/** ⛔ An unknown writer is `unknown` — no coincidence, no verification, act optional. Never a throw, never a guess. */
export function contractFor(writer) {
  return CONTRACTS[writer] ?? CONTRACTS[WRITER.unknown]
}

const ACT_KINDS = new Set(Object.values(ACT_KIND))
const REACH_KINDS = new Set(Object.values(REACH_KIND))

/** Validate an act. `null` stays null; anything malformed THROWS — an act is never guessed into shape. */
export function normalizeAct(act) {
  if (act == null) return null
  if (typeof act !== 'object') throw new TypeError('act must be { kind, id }')
  if (!ACT_KINDS.has(act.kind)) throw new TypeError(`act.kind must be one of ${[...ACT_KINDS].join(', ')} (got ${JSON.stringify(act.kind)})`)
  const id = act.id == null ? '' : String(act.id).trim()
  if (!id) throw new TypeError('act.id is required')
  return Object.freeze({ kind: act.kind, id })
}

/**
 * ⭐ THE OCCASION KEY — what M2 compares, what traces are keyed by. Turn and operator keys are BYTE-IDENTICAL to
 * today's occasions (a message uuid · a label); pass keys are namespaced so a pass can never collide with a turn.
 */
export function actKey(act) {
  const a = act && act.kind ? act : null
  if (!a) return null
  if (a.kind === ACT_KIND.turn || a.kind === ACT_KIND.operator) return String(a.id)
  return `${a.kind}:${a.id}`
}

/** The act key of a stored row (`act_kind` / `act_id`), or null when no act was recorded. */
export function actKeyOf(row) {
  if (!row || row.act_kind == null || row.act_id == null) return null
  return actKey({ kind: row.act_kind, id: row.act_id })
}

/** Validate a reach. `null` stays null; a malformed shape THROWS. */
export function normalizeReach(reach) {
  if (reach == null) return null
  if (typeof reach !== 'object' || !REACH_KINDS.has(reach.kind)) throw new TypeError(`reach.kind must be one of ${[...REACH_KINDS].join(', ')}`)
  switch (reach.kind) {
    case REACH_KIND.turn: {
      if (!reach.messageId) throw new TypeError('reach.messageId is required for a turn reach')
      return Object.freeze({ kind: reach.kind, messageId: String(reach.messageId), conversationId: reach.conversationId ? String(reach.conversationId) : null })
    }
    case REACH_KIND.range: {
      const from = Number(reach.from); const to = Number(reach.to)
      if (!reach.conversationId) throw new TypeError('reach.conversationId is required for a range reach')
      if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) throw new TypeError('reach.from/to must be integers with from ≤ to')
      return Object.freeze({ kind: reach.kind, conversationId: String(reach.conversationId), from, to })
    }
    case REACH_KIND.document: {
      if (!reach.document) throw new TypeError('reach.document is required for a document reach')
      return Object.freeze({ kind: reach.kind, document: String(reach.document) })
    }
    default: return Object.freeze({ kind: REACH_KIND.none })
  }
}

/**
 * ⭐ M2's consuming occasion: the ACT key first; then the RATIFIED legacy order exactly as the store has always had it —
 * the row-level turn pointer, then the construction-time operator label (*"the store's fallback for a write that has no
 * row-level turn — never a way to override one"*). Nothing ⇒ null ⇒ M2 refuses (`no-occasion`).
 */
export function consumingOccasionFor({ act = null, occasionLabel = null, legacyMessageId = null } = {}) {
  return actKey(act) ?? (legacyMessageId != null ? String(legacyMessageId) : null) ?? (occasionLabel != null ? String(occasionLabel) : null)
}
