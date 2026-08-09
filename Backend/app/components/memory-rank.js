// Persona Memory v2 — the pure ranking core (RFC_PERSONA_MEMORY §3, §4.3).
// No DB, no I/O — just the maths, so it's unit-testable and identical whether the vector store is
// JSONB brute-force (today) or pgvector (later). The service supplies rows + a query embedding;
// this ranks them.
//
// Composite retrieval score (Generative Agents, the most-validated primitive):
//     score = w_rel·relevance + w_imp·(importance/10) + w_rec·recency
// with usage reinforcement folded in via `recency` decaying from last_access (so a recalled memory
// — which bumps last_access — stays warm). ACT-R base-level activation is provided too, for the
// decay/consolidation job to reason about frequency+recency without an LLM.

/** Cosine similarity of two equal-length numeric arrays. Returns 0 on null/empty/mismatch/zero-norm. */
export function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Exponential recency in [0,1]: `decayPerHour ^ hoursSince`. Gen-Agents uses 0.995/hr. */
export function recencyScore(lastMs, nowMs, decayPerHour = 0.995) {
  const hours = Math.max(0, (nowMs - lastMs) / 3_600_000)
  return decayPerHour ** hours
}

/**
 * ACT-R base-level activation (optimized-learning approximation):
 *   B = ln( n / (1 − d) ) − d·ln(age_seconds)
 * n = number of encounters (creation counts as the first → accessCount + 1), d = decay (~0.5).
 * Higher = more available. Used by the decay job, not the hot-path composite.
 */
export function baseLevelActivation(accessCount, ageSeconds, d = 0.5) {
  const n = Math.max(1, (accessCount || 0) + 1)
  const age = Math.max(1, ageSeconds || 1)
  return Math.log(n / (1 - d)) - d * Math.log(age)
}

// Stanford Generative Agents reference weighting (relevance dominates, importance a strong prior,
// recency a tiebreak). Tunable per call.
export const DEFAULT_WEIGHTS = Object.freeze({ relevance: 3, importance: 2, recency: 0.5 })

/**
 * Composite score for one memory. `relevance` is the precomputed cosine to the query (0 if no
 * query/embedding). `importance` is 1..10 (defaults to a neutral 5 when unscored). Recency decays
 * from last_access, else created_at, else now.
 * @returns {number}
 */
export function compositeScore(m, { now = 0, weights = DEFAULT_WEIGHTS } = {}) {
  const relevance = Number.isFinite(m.relevance) ? m.relevance : 0
  const importance01 = Math.max(0, Math.min(10, m.importance ?? 5)) / 10
  const lastMs = m.lastAccessMs ?? m.createdMs ?? now
  const recency = recencyScore(lastMs, now)
  return weights.relevance * relevance + weights.importance * importance01 + weights.recency * recency
}

const ms = (v) => (v == null ? null : v instanceof Date ? v.getTime() : new Date(v).getTime())

/**
 * Rank a set of memory rows against a query embedding. Pure: computes cosine relevance per row,
 * folds importance + recency, sorts desc, returns the top `limit` with the score + relevance
 * attached. `pinned` rows get a relevance floor so a strong prior can't be buried. Rows whose
 * relevance is below `minRelevance` (and unpinned) are dropped (the GWT bottleneck / logistic gate).
 *
 * @param {number[]|null} queryEmbedding  null → relevance 0 for all (pure importance/recency ranking)
 * @param {Array<{embedding?:number[], importance?:number, pinned?:boolean, last_access?:any, created_at?:any}>} rows
 * @param {{now:number, limit?:number, weights?:object, minRelevance?:number, pinnedFloor?:number, relevances?:Map<string,number>}} opts
 *   `relevances` (optional): a precomputed id→cosine map (e.g. from pgvector's `<=>`). When given,
 *   it is used instead of computing cosine here — the ranking maths are identical, just the vector
 *   similarity was done in the DB. A row absent from the map gets relevance 0.
 * @returns {Array<row & {score:number, relevance:number}>}
 */
export function rankMemories(queryEmbedding, rows, opts = {}) {
  const { now = 0, limit = 10, weights = DEFAULT_WEIGHTS, minRelevance = 0, pinnedFloor = 0.15, relevances = null } = opts
  const hasQuery = !!queryEmbedding || !!relevances // a similarity query is active either way
  const scored = (rows || []).map((r) => {
    let relevance = relevances
      ? (relevances.get(r.id) ?? 0)
      : (queryEmbedding && Array.isArray(r.embedding) ? cosine(queryEmbedding, r.embedding) : 0)
    if (r.pinned && relevance < pinnedFloor) relevance = pinnedFloor
    const score = compositeScore(
      { relevance, importance: r.importance, lastAccessMs: ms(r.last_access), createdMs: ms(r.created_at) },
      { now, weights },
    )
    return { ...r, relevance, score }
  })
  const kept = scored.filter((r) => r.pinned || !hasQuery || r.relevance >= minRelevance)
  kept.sort((a, b) => b.score - a.score)
  return kept.slice(0, limit)
}

// ── VALUE-LEVEL DUPLICATE SUPPRESSION (recall-side) ──────────────────────────────────────────────
// MEASURED 2026-08-06 on the live store, after an outside reviewer reported the same fact stored
// several ways. The real shape is narrower than reported, and worth stating exactly because it
// tells you what NOT to build:
//
//   user "hermes_agent" holds two live typed facts —
//     slot "formatting preference"  value "bullet points"                  importance 5
//     slot "communication style"    value "prefers bullet points in responses"  importance 7
//
//   slot-label cosine  0.6947   ← what the slot resolver compares
//   value cosine       0.8536   ← where the duplication actually is
//   memory.resolver.slotSemThreshold = 0.85
//
// So the resolver did NOT malfunction: by its own design it compares SLOT LABELS, and 0.69 is not
// close to the threshold — nor should it be, because "formatting preference" and "communication
// style" are genuinely different properties. The duplication only exists at the VALUE level, and
// NOTHING in the pipeline ever compares values across two different slots. That is the gap.
//
// ⚠️ WHICH IS WHY THE FIX IS NOT A LOWER slotSemThreshold. To merge these two slots you would have
// to drop the gate to ~0.69, and at that level genuinely unrelated properties collapse into each
// other — trading a duplicated line for a corrupted one, in the subsystem this platform is built on.
//
// ⚠️ AND WHY IT IS RECALL-SIDE, NOT WRITE-SIDE. Suppressing at recall spends no context and destroys
// nothing: both rows stay stored, auditable, and correctable. A write-time merge is irreversible,
// and would have to be right the FIRST time about two phrasings a human might still distinguish.
//
// ⚠️ NEGATION IS THE FAILURE MODE THIS GUARDS. "bullet points" is a token-subset of "no bullet
// points", so a naive containment rule would silently drop one of a CONTRADICTING pair and keep
// whichever ranked higher — a memory that confidently states the opposite of what the user said.
// Opposite polarity is therefore never a duplicate: that is a conflict, and conflicts belong to
// memory-conflict.js, which can supersede with an audit trail. Suppression is for agreement only.

const NEGATORS = new Set(['not', 'no', 'never', 'dont', 'doesnt', 'didnt', 'cant', 'cannot', 'wont',
  'without', 'avoid', 'avoids', 'dislike', 'dislikes', 'hate', 'hates', 'stop', 'stops', 'except'])

// Deliberately tiny: only words that carry no distinguishing meaning between two statements of the
// same preference. Nothing polarity-bearing is ever in here — see NEGATORS.
const FILLER = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'with', 'and', 'or', 'is',
  'are', 'be', 'as', 'at', 'by', 'it', 'its', 'this', 'that', 'their', 'they', 'them', 'when',
  'user', 'users', 'prefers', 'prefer', 'preferred', 'likes', 'like', 'wants', 'want', 'response',
  'responses', 'reply', 'replies', 'answer', 'answers', 'style', 'format', 'formatting', 'always'])

// ⚠️ APOSTROPHES ARE DELETED, NOT REPLACED BY A SPACE — a unit test caught this and it was the most
// dangerous bug in this file. Splitting on the apostrophe turns "doesn't" into "doesn" + "t", and
// NEITHER is in NEGATORS, so `isNegated("doesn't want long replies")` returned FALSE. That value
// would then have been polarity-matched against "wants long replies" and one of them silently
// dropped at recall. Contractions are how people actually state preferences, so this is not an edge
// case. Delete the apostrophe first, then split on everything else.
const words = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/['’ʼ`]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

/** Content tokens of a value: lowercased, punctuation-stripped, filler removed. Order-insensitive. */
export function valueTokens(text) {
  return new Set(words(text).filter((w) => !FILLER.has(w)))
}

/** True when a statement is negated. Runs BEFORE filler removal so nothing can erase a "not". */
export function isNegated(text) {
  return words(text).some((w) => NEGATORS.has(w))
}

/**
 * Do two values state the same thing? Same polarity, and the SAME SET of content words.
 *
 * ⚠️ EQUALITY, NOT SUBSET — a unit test caught this, and the distinction is the whole safety margin.
 * The measured pair does not need subset: "prefers", "in" and "responses" are filler, so
 * "bullet points" and "prefers bullet points in responses" both reduce to exactly {bullet, points}.
 * Subset containment would additionally swallow "bullet points UNDER THREE WORDS" into
 * "bullet points" — and that extra word is precisely the user's distinction, silently deleted at
 * recall. Any surviving content word the other value lacks means these are two different facts.
 * An empty token set never matches: a value that is entirely filler tells us nothing to compare.
 */
export function sameValueMeaning(a, b) {
  if (isNegated(a) !== isNegated(b)) return false // a conflict, not a duplicate
  const ta = valueTokens(a)
  const tb = valueTokens(b)
  if (!ta.size || !tb.size || ta.size !== tb.size) return false
  for (const w of ta) if (!tb.has(w)) return false
  return true
}

/**
 * Drop rows whose value restates one already kept, keeping the FIRST occurrence — so callers must
 * pass rows already in the order they want to preserve (i.e. best-ranked first). Same-entity only:
 * "bullet points" about the user and about a project are not the same fact.
 * Returns both halves so the caller can log/audit what recall chose not to spend context on.
 * @returns {{kept:Array, dropped:Array<{row:object, duplicateOf:string}>}}
 */
export function dedupeByValue(rows, { textOf = (r) => r.value ?? r.content } = {}) {
  const kept = []
  const dropped = []
  for (const r of rows || []) {
    const hit = kept.find(
      (k) => (k.entity ?? null) === (r.entity ?? null) && sameValueMeaning(textOf(k), textOf(r)),
    )
    if (hit) dropped.push({ row: r, duplicateOf: hit.id })
    else kept.push(r)
  }
  return { kept, dropped }
}

/**
 * Reciprocal Rank Fusion (Cormack et al. 2009) of N ranked id-lists into one ranking.
 *   fused(id) = Σ_lists 1 / (k + rank)   (rank 1-based; a list that omits the id contributes 0)
 * ORDER-ONLY fusion — scale-free, so a dense (cosine composite) arm and a lexical (ts_rank) arm
 * combine WITHOUT normalizing their incomparable score scales. k dampens how much the very top
 * ranks dominate (standard 60). An id in more lists / higher ranks scores higher. Pure.
 * @param {Array<Array<string>>} lists  ranked id arrays, best-first
 * @param {{k?:number}} opts
 * @returns {Array<{id:string, score:number}>} fused, best-first
 */
export function rrfFuse(lists, { k = 60 } = {}) {
  const acc = new Map()
  for (const list of lists || []) {
    if (!Array.isArray(list)) continue
    for (let i = 0; i < list.length; i++) {
      const id = list[i]
      if (id == null) continue
      acc.set(id, (acc.get(id) || 0) + 1 / (k + i + 1))
    }
  }
  return [...acc.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score)
}

/**
 * Nightly decay/consolidation plan (RFC_PERSONA_MEMORY §4.5; research: archive-then-delete tiers).
 * PURE — given live rows + now + thresholds, returns which memory ids to soft-ARCHIVE (remove from
 * recall) and which to DEMOTE to the cold tier. Conservative + safe:
 *   - NEVER touches pinned / already-invalid / already-expired rows.
 *   - archive only clear noise: never-recalled (access_count 0) AND older than `archiveAgeMs` AND
 *     low/no importance (≤3). These are captured-but-never-used turns — the bloat from
 *     capture-everything. Soft (row kept, expired_at set) so it's auditable/reversible.
 *   - demote to cold: idle (no access) longer than `coldAgeMs` and not already cold. Tiering only —
 *     keeps the working set sharp without removing anything.
 * @returns {{archive:string[], demote:string[]}}
 */
export function memoryDecayPlan(rows, { now = 0, archiveAgeMs = 30 * 864e5, coldAgeMs = 14 * 864e5, importanceMax = 3 } = {}) {
  const archive = []
  const demote = []
  for (const r of rows || []) {
    if (r.pinned || r.invalid_at || r.expired_at) continue
    const created = ms(r.created_at) ?? now
    const last = ms(r.last_access) ?? created
    const ageMs = now - created
    const idleMs = now - last
    if ((r.access_count || 0) === 0 && ageMs > archiveAgeMs && (r.importance == null || r.importance <= importanceMax)) {
      archive.push(r.id)
      continue
    }
    if (idleMs > coldAgeMs && r.tier !== 'cold') demote.push(r.id)
  }
  return { archive, demote }
}
