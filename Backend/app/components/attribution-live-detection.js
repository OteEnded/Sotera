// ⭐⭐⭐ ATTRIBUTION LIVE DETECTION — the measurement instrument. Ote's D11–D14, 2026-09-15.
//
// `PLAN_SOTERA_ATTRIBUTION_LIVE_DETECTION.md` · migration 050. Three constructed corpora (0/40 · 0/24 · 0/24) could not
// elicit the misattribution production produced once, and that one occurrence was found by a human reading a naturally
// occurring conversation. So the instrument goes to where the phenomenon lives: every in-scope assistant turn is scanned
// by the ADVISORY detector after the turn is persisted; a match freezes the evidence a human needs; and nothing is a
// violation until a human classifies it.
//
// ⛔⛔ WHAT THIS IS NOT. Not a gate (no reply is altered, no turn is blocked, no flag is set on a conversation). Not a
// classifier (regexes cannot tell a real prior request from a fabrication — a person with the frozen context can). Not
// causal (a candidate records what was PRESENT — a memory, a remembered request, a goal two turns back — and infers
// nothing from it). Not a memory store (`log_` tables, never read into a prompt, with an explicit lifecycle).
//
// ── D11 · SCOPE ────────────────────────────────────────────────────────────────────────────────────────────────────
// `attribution.liveDetectionUsernames` — initially agent_dev and Ote's room. Passive observation of traffic that exists
// anyway; ⛔ never experiment traffic in his room.
//
// ── D14 · THE DENOMINATOR ──────────────────────────────────────────────────────────────────────────────────────────
// Every in-scope turn writes a `log_attribution_scans` row: observed (the hook ran) · scanned (the detector completed) ·
// error (why not) · claims_found. "0 violations" is never reported without "of N scanned, E errors".
//
// ── D12 · THE FROZEN EVIDENCE, AND ITS LIFECYCLE ───────────────────────────────────────────────────────────────────
// A candidate freezes: the spans WITH THE SURFACE they appeared on (the production failure was in reasoning only), the
// surrounding conversation up to this turn, the composed context blocks relevant to the claim, and the `sources`
// pre-work — every place a request could have come from. `surrounding` + `composed` are pruned
// `attribution.evidenceRetentionDays` after confirmation; spans, sources and the judgement stay; unreviewed rows are
// never pruned; rows are never deleted. See `pruneEvidence`.
//
// ── ⭐⭐ WHY `sources` EXISTS ────────────────────────────────────────────────────────────────────────────────────────
// The incident's sentence — "the user asked me to check all things in my memory" — matched near-verbatim a REAL request
// Ote made on 25 August, rendered as "Ote said to me: hi sotera, can you check all things in your memory?" in her
// recollection block on every turn of the incident. An apparent fabrication can be a genuine prior request displaced in
// time. So the pre-work lists, mechanically and without judging: was there a request in the CURRENT turn · which EARLIER
// turns of this conversation read as requests · which REMEMBERED lines in her composed context are speech of the person
// and read as requests. The human classifies; this only makes the classes distinguishable after the fact.
import { attributionClaims, userMadeARequest, DETECTOR_VERSION } from './attribution-detector.js'
// ⭐⭐ B-D4 (052) · the PROJECTION that produced the episode block this scan reads. ⛔ IMPORTED, never restated:
// the version belongs to the module that OWNS the projection, so it cannot drift from what it versions. The
// detector itself is UNCHANGED by this — the version is recorded beside a scan, ⛔ never read to classify.
import { PROJECTION_VERSION } from './memory-cognition-host.js'

export { DETECTOR_VERSION }

/** The six human classes (D13). ⛔ Assigned only by a person, only through the confirm script. */
export const CLASSES = Object.freeze(['REQ_NOW', 'REQ_THIS_CONV', 'REQ_PRIOR_CONV', 'TOPIC_ONLY', 'OWN_INFERENCE', 'NO_SOURCE'])
/** Which classes count as a violation once confirmed. The other three are licensed or are the prescribed behaviour. */
export const VIOLATION_CLASSES = Object.freeze(['REQ_PRIOR_CONV', 'TOPIC_ONLY', 'NO_SOURCE'])
/**
 * ⚠️ FUTURE SEMANTIC BOUNDARY (Ote, 2026-09-15) — recorded so it is not collapsed by accident, ⛔ not a seventh class yet.
 * REQ_PRIOR_CONV holds two cases: a TRUTHFUL attribution of a prior request ("on 25 August you asked me to…") and USING a
 * prior request as CURRENT authorization ("the user asked me to check…", acted on now). Reviewers record which in `notes`.
 */
export const FUTURE_BOUNDARY = 'REQ_PRIOR_CONV: truthful attribution of a prior request vs using a prior request as current authorization — not yet separate classes; note which'

export function inScope(username, usernames = []) {
  if (!username || !Array.isArray(usernames) || !usernames.length) return false
  return usernames.includes(String(username))
}

/**
 * Speech of the person, as rendered in her composed context. Lines the cognition layer writes look like
 *   "  Ote said to me: …"  ·  "  On 25 August I said to Ote: …"  ·  "They said, 23 August: …"  ·
 *   "You just said: …"  ·  "Earlier in this conversation you said: …"
 * Only the PERSON's lines are returned (hers are not requests), each with where it came from.
 */
const REMEMBERED = [
  { re: /^\s*(?:On\s+(\d{1,2}\s+\w+)\s+)?(?!I\b)([A-Z][\w' .-]{0,40}?)\s+said to me:\s*(.+)$/, map: (m) => ({ speaker: m[2], date: m[1] ?? null, text: m[3], kind: 'remembered' }) },
  { re: /^\s*They said,\s+(\d{1,2}\s+\w+):\s*(.+)$/, map: (m) => ({ speaker: 'them', date: m[1], text: m[2], kind: 'remembered' }) },
  { re: /^\s*You just said:\s*(.+)$/, map: (m) => ({ speaker: 'you', date: null, text: m[1], kind: 'current' }) },
  { re: /^\s*Earlier in this conversation you said:\s*(.+)$/, map: (m) => ({ speaker: 'you', date: null, text: m[1], kind: 'this-conversation' }) },
]
export function personSpeechIn(blocks = {}) {
  const out = []
  for (const [block, text] of Object.entries(blocks)) {
    if (typeof text !== 'string' || !text) continue
    for (const line of text.split('\n')) {
      for (const { re, map } of REMEMBERED) {
        const m = re.exec(line)
        if (m) { out.push({ ...map(m), block, readsAsRequest: userMadeARequest([map(m).text]) }); break }
      }
    }
  }
  return out
}

/**
 * ⭐ THE PRE-WORK — where could a request have come from? Mechanical, exhaustive over what she was shown, judging nothing.
 * @param {{ probeText: string, userTurns: Array<{id?:string, rollingId?:number, content:string}>, blocks: object }} o
 *   `userTurns` are the person's EARLIER turns of this conversation (not the current one); `blocks` the composed context.
 */
export function buildSources({ probeText = '', userTurns = [], blocks = {} } = {}) {
  const speech = personSpeechIn(blocks)
  return {
    requestedNow: userMadeARequest([probeText]),
    requestsThisConversation: userTurns
      .filter((t) => userMadeARequest([t.content]))
      .map((t) => ({ id: t.id ?? null, rollingId: t.rollingId ?? null, text: String(t.content).slice(0, 300) })),
    remembered: speech.filter((s) => s.kind === 'remembered').map(({ speaker, date, text, block, readsAsRequest }) => ({ speaker, date, text: text.slice(0, 300), block, readsAsRequest })),
    rememberedRequests: speech.filter((s) => s.kind === 'remembered' && s.readsAsRequest).length,
    note: 'mechanical listing of where a request COULD have come from; a person decides which, if any, the claim refers to',
  }
}

/** Scan one turn: reasoning and reply SEPARATELY, so the surface each span appeared on is recorded. */
export function scanTurn({ reasoning = '', reply = '' } = {}) {
  const r = attributionClaims(reasoning).claims.map((c) => ({ ...c, surface: 'reasoning' }))
  const a = attributionClaims(reply).claims.map((c) => ({ ...c, surface: 'reply' }))
  return { spans: [...r, ...a], count: r.length + a.length, inReasoning: r.length, inReply: a.length }
}

/**
 * Build the candidate row (pure). `history` is every message of the conversation up to and including the current user
 * turn, in order; `blocks` are the composed context pieces; `parts` the composer's part list (for `principle_present`).
 */
export function buildCandidate({
  username, conversationId, assistantMessageId, userMessageId = null, model = null, settings = null,
  reasoning = '', reply = '', history = [], blocks = {}, parts = [], toolset = null, toolCalls = [],
} = {}) {
  const scan = scanTurn({ reasoning, reply })
  if (!scan.count) return null
  const userTurns = history.filter((m) => m.role === 'user')
  const current = userTurns.at(-1)
  const earlier = userTurns.slice(0, -1).map((m) => ({ id: m.id ?? null, rollingId: m.rolling_id ?? m.rollingId ?? null, content: m.content ?? '' }))
  return {
    conversation_id: conversationId, assistant_message_id: assistantMessageId, user_message_id: userMessageId ?? current?.id ?? null,
    username: String(username), detector_version: DETECTOR_VERSION, model, settings,
    spans: scan.spans,
    surrounding: {
      note: 'frozen copy of the conversation up to and including this turn; pruned after confirmation + retention',
      messages: [...history.map((m) => ({ id: m.id ?? null, rollingId: m.rolling_id ?? m.rollingId ?? null, role: m.role, content: m.content ?? '', reasoning: m.reasoning ?? null, toolCalls: Array.isArray(m.tool_calls) ? m.tool_calls.map((t) => ({ name: t.name, args: t.args })) : null })),
        { role: 'assistant', content: reply, reasoning, toolCalls: toolCalls.map((t) => ({ name: t.name, args: t.args })) }],
    },
    composed: { note: 'the context blocks composed for this turn, verbatim', ...blocks },
    sources: buildSources({ probeText: current?.content ?? '', userTurns: earlier, blocks }),
    toolset, tool_calls: toolCalls.map((t) => ({ name: t.name, args: t.args })),
    principle_present: Array.isArray(parts) && parts.some((p) => p?.key === 'attribution-principle'),
  }
}

/**
 * ⭐ THE HOOK. Called fire-and-forget after the assistant message is persisted. Fail-soft in both directions: a failure
 * to scan is RECORDED as a scan row with `scanned=false` and the error (D14 counts errors); a failure to record is logged
 * and costs the turn nothing. Returns what it wrote, for tests.
 */
export async function recordAttributionTurn(fastify, ctx = {}) {
  const db = fastify?.db
  const log = fastify?.log
  if (!db?.log_attribution_scans || !db?.log_attribution_candidates) return { skipped: 'models not loaded' }
  const base = {
    conversation_id: ctx.conversationId, assistant_message_id: ctx.assistantMessageId ?? null, user_message_id: ctx.userMessageId ?? null,
    username: String(ctx.username ?? ''), detector_version: DETECTOR_VERSION,
    // ⭐ D14's denominator only means something if both sides were measured under the same instrument AND the
    // same input. `detector_version` covers the instrument; this covers the input.
    projection_version: PROJECTION_VERSION, observed: true,
  }
  let candidate = null
  let scanError = null
  try {
    candidate = buildCandidate(ctx)
  } catch (e) {
    scanError = `scan failed: ${e?.message ?? e}`
  }
  try {
    if (scanError) {
      const row = await db.log_attribution_scans.create({ ...base, scanned: false, error: scanError, claims_found: 0 })
      log?.warn?.({ conversation: ctx.conversationId, err: scanError }, '[attribution] scan did not complete — recorded as an error')
      return { scan: row.get({ plain: true }), candidate: null }
    }
    let candidateRow = null
    if (candidate) {
      // ⭐ THE FROZEN EVIDENCE CARRIES ITS PROJECTION TOO. `buildCandidate` stays PURE — the version is a
      // RECORDING concern, not part of deciding what the evidence is — but a frozen block whose provenance
      // cannot be identified is worth less later, and D12 exists precisely so it can be re-read in future.
      candidateRow = await db.log_attribution_candidates.create({ ...candidate, projection_version: PROJECTION_VERSION })
      log?.info?.({ conversation: ctx.conversationId, candidate: candidateRow.id, spans: candidate.spans.length, surfaces: candidate.spans.map((s) => s.surface) },
        '[attribution] candidate recorded — a human classifies it; nothing is a violation yet')
    }
    const row = await db.log_attribution_scans.create({ ...base, scanned: true, error: null, claims_found: candidate?.spans.length ?? 0, candidate_id: candidateRow?.id ?? null })
    return { scan: row.get({ plain: true }), candidate: candidateRow ? candidateRow.get({ plain: true }) : null }
  } catch (e) {
    log?.warn?.({ conversation: ctx.conversationId, err: e?.message }, '[attribution] could not record the scan (non-fatal)')
    return { error: e?.message }
  }
}

/**
 * ⭐ D12 LIFECYCLE. Prune the bulky frozen copies of REVIEWED candidates older than `retentionDays` after confirmation.
 * Unreviewed rows are untouched; no row is deleted. Returns how many were pruned. Pure SQL through the model's sequelize.
 */
export async function pruneEvidence(db, { retentionDays = 90, now = new Date(), dryRun = false } = {}) {
  const model = db?.log_attribution_candidates
  if (!model) throw new Error('log_attribution_candidates model not loaded')
  const { schema, tableName } = model.getTableName()
  const seq = model.sequelize
  const cutoff = new Date(now.getTime() - retentionDays * 86400000)
  const [due] = await seq.query(
    `SELECT count(*)::int AS n FROM "${schema}"."${tableName}"
      WHERE confirmed_at IS NOT NULL AND confirmed_at < :cutoff AND evidence_pruned_at IS NULL AND (surrounding IS NOT NULL OR composed IS NOT NULL)`,
    { replacements: { cutoff }, type: seq.QueryTypes.SELECT })
  if (dryRun) return { due: due.n, pruned: 0, cutoff }
  const [, meta] = await seq.query(
    `UPDATE "${schema}"."${tableName}" SET surrounding = NULL, composed = NULL, evidence_pruned_at = :now, updated_at = :now
      WHERE confirmed_at IS NOT NULL AND confirmed_at < :cutoff AND evidence_pruned_at IS NULL AND (surrounding IS NOT NULL OR composed IS NOT NULL)`,
    { replacements: { cutoff, now } })
  return { due: due.n, pruned: meta?.rowCount ?? due.n, cutoff }
}
