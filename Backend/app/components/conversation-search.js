// Conversation Search (roadmap step 4, CS1) — an INDEPENDENT evidence-retrieval subsystem over the
// user's own past messages. NOT memory: Memory answers "what do I know?" (synthesized knowledge);
// Conversation Search answers "WHERE did we discuss this?" (historical evidence, verbatim + citable).
// Never merge the two. CS1 is lexical-only (Postgres tsvector @@ over messages.content_tsv); the dense
// arm (a separate `message_embeddings` table + pgvector, RRF-fused) is CS2. Results are EVIDENCE
// objects, run through an Evidence Filter (role / min-length / dedup) BEFORE any consumer — filtering
// is not retrieval's job. Consumed two ways, both LIVE: the `search_conversations` tool (on demand), and
// the PASSIVE Composer provider (CS3) — gated by `memory.conversationContextEnabled` (default ON), it
// offers a few hybrid-matched excerpts to the Composer each turn as scored evidence candidates.

import { registerHostService } from './runtime.js'
import { makeEmbedder } from './memory-embed-host.js' // shared embedding utility (same model/dims/CPU config)
import { rrfFuse } from '@ote/memory/cognition/memory-rank.js'       // shared rank-fusion (lexical ⊕ dense)
import { getSetting } from '../settings/index.js'

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

// ── DOES THIS QUERY HAVE A TOPIC OF ITS OWN? (the passive-injection gate) ─────────────────────────
//
// THE INCIDENT (Ote, 2026-08-03, chat 2d126c69). He sent a photo of a SilverStone PSU, got a good
// answer, then asked "how good is it?" — and the reply assessed **a Michael Jackson biography plan**
// from three weeks earlier. Nothing was wrong with memory (recall returned his name, role, language;
// zero rows mention Jackson). The passive Composer provider had searched his past MESSAGES for the
// literal string "how good is it?", and since that sentence names nothing, the dense arm returned its
// nearest neighbours — long, chatty assistant prose, which on this account is the MJ biography work.
// Two of those excerpts went into the prompt and a small model followed them instead of the picture
// it had just described.
//
// The route already had a gate, and its comment had the right idea — "'research' / 'continue?' /
// 'go on' express no topic AT ALL. Retrieval needs something to be relevant TO" — but it measured
// LENGTH (>=15 chars, >=3 words). "how good is it?" is 16 chars and 4 words: it passed by one
// character. Length was only ever a proxy for the real property.
//
// The real property is ANAPHORA. "it", "this", "that one" point at something in the LOCAL
// conversation — that is what those words are for. A query whose subject is a pronoun is, by
// construction, about context the model already has in front of it, so searching *other*
// conversations for it is a category error, not a tuning problem. That makes this a query-side gate
// (the route's original instinct), not a higher score threshold: raising the floor would also drop
// good evidence for real questions.
//
// Deliberately CONSERVATIVE — it only refuses when the query is essentially all function words:
// one content word alongside a pronoun still searches ("is it better than gpt-oss" → gpt-oss is a
// topic). Skipping retrieval costs a little recall; injecting the wrong three-week-old conversation
// costs a wrong answer, which is the failure Ote actually hit.
const CLOSED_CLASS = new Set([
  // pronouns + deictics (the anaphora set is a subset — listed again below for the reference test)
  'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'we', 'us', 'our', 'he', 'him', 'his', 'she', 'her',
  'hers', 'it', 'its', 'they', 'them', 'their', 'this', 'that', 'these', 'those', 'one', 'ones',
  // determiners / quantifiers
  'a', 'an', 'the', 'any', 'some', 'all', 'both', 'each', 'every', 'no', 'other', 'another', 'much', 'many',
  // auxiliaries + copulas + modals
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'do', 'does', 'did', 'have', 'has', 'had',
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  // wh-words + common question framing
  'what', 'whats', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
  // prepositions / conjunctions / particles
  'about', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'with', 'by', 'as', 'than', 'then', 'so',
  'and', 'or', 'but', 'if', 'not', 'up', 'out', 'too', 'also', 'just', 'now', 'here', 'there',
  // contraction debris + politeness
  's', 't', 'm', 're', 've', 'll', 'd', 'please', 'thanks', 'ok', 'okay', 'yeah', 'yes',
])
const ANAPHORA = new Set(['it', 'its', 'this', 'that', 'these', 'those', 'they', 'them', 'their', 'he', 'him', 'his', 'she', 'her', 'one', 'ones'])

/**
 * True when a query names something retrieval could be relevant TO. Used to gate the PASSIVE
 * injection only — the `search_conversations` TOOL is never gated, because a model that explicitly
 * searches has decided the search is worth doing.
 * @param {string} text the user's message
 */
export function hasRetrievableTopic(text) {
  const raw = String(text || '')
  // UNICODE-AWARE ON PURPOSE. The first version matched /[a-z0-9]+/ and therefore saw NO tokens at all
  // in "what is バルファルクの物真似" — a query that names something very specific — and would have
  // silently switched retrieval off for every message not written in Latin script. Caught by running
  // the gate over Ote's real history rather than over sentences I invented; he writes Thai and
  // Japanese, so an ASCII tokenizer is not a simplification, it is a whole-language outage.
  const rawTokens = raw.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []
  if (!rawTokens.length) return false
  const tokens = rawTokens.map((t) => t.toLowerCase())
  const content = tokens.filter((t) => !CLOSED_CLASS.has(t))
  if (!content.length) return false // "what's this?", "how about that?" — pure function words
  // NAMES SURVIVE THE PRONOUN RULE. "what in TF2 about this?" carries exactly one content word, but
  // that word is an entity — an acronym, a version, a product, a non-Latin term — and entities are the
  // one thing a search over past conversations is actually good at finding. A digit, a non-ASCII
  // character, or an internal capital (TF2, PSU, SilverStone — not a sentence-initial "What") is
  // enough evidence of a name to let the query through.
  // Only CONTENT tokens can be names, and SHOUTING is not naming: in "HOW GOOD IS IT???" every word
  // has internal capitals, which would otherwise read as an acronym and defeat the rule entirely.
  const shouting = !/[a-z]/.test(raw)
  const namesSomething = rawTokens.some((t) => !CLOSED_CLASS.has(t.toLowerCase())
    && (/\d/.test(t) || /[^\x00-\x7F]/.test(t) || (!shouting && /[A-Z]/.test(t.slice(1)))))
  // A pronoun subject with no content word and no name is a follow-up about the LOCAL turn.
  if (content.length <= 1 && !namesSomething && tokens.some((t) => ANAPHORA.has(t))) return false
  return true
}
// CS2 dense scope: only user/assistant messages worth embedding (skip tool-echoes, system, trivial).
const MIN_EMBED_CHARS = 50

/** Map a raw message row → an Evidence object (provider/conversation/message/timestamp/citation). */
export function toEvidence(row, { excerptChars = 300 } = {}) {
  const raw = row.created_at
  const when = raw == null ? null : (raw instanceof Date ? raw : new Date(raw)) // new Date(null) → epoch, so guard null explicitly
  const date = when && !Number.isNaN(when.getTime()) ? when.toISOString().slice(0, 10) : null
  const excerpt = String(row.content || '').slice(0, excerptChars)
  const title = row.conversation_title || 'a conversation'
  return {
    provider: 'conversation',
    conversation: { id: row.conversation_id, title: row.conversation_title || null },
    message: { id: row.message_id, role: row.role },
    timestamp: date,
    speaker: row.role === 'user' ? 'user' : 'assistant',
    excerpt,
    score: typeof row.score === 'number' ? row.score : Number(row.score) || 0,
    citation: `"${title}" · ${row.role} · ${date || 'unknown date'}`,
  }
}

/**
 * Evidence Filter — refine retrieved evidence BEFORE any consumer (the seam Ote called for; policy
 * like accepted-only / role-narrowing / dedup lives HERE, never inside retrieval). Pure.
 * @param {Array} items evidence objects (already scored, highest-first)
 * @param {{minLength?:number, roles?:string[]|null, dedup?:boolean, limit?:number}} opts
 */
export function filterEvidence(items = [], { minLength = 20, roles = ['user', 'assistant'], dedup = true, limit = 8 } = {}) {
  const seen = new Set()
  const out = []
  for (const e of items) {
    if (roles && !roles.includes(e?.message?.role)) continue
    if ((e?.excerpt || '').length < minLength) continue
    if (dedup) { const k = norm(e.excerpt); if (seen.has(k)) continue; seen.add(k) }
    out.push(e)
    if (out.length >= limit) break
  }
  return out
}

/**
 * Build a Conversation Search service bound to one user. Host-service pattern (like memory.v2): the
 * route injects it as `conversationSearch`; the portable `search_conversations` tool consumes it.
 * @param {*} fastify  needs fastify.db.txn_messages (Sequelize) for the raw tsvector query
 * @param {{userId?:string|null}} scope
 */
// ── ⭐⭐ TWO SCOPES, ONE QUERY — AND THE DEFAULT IS UNCHANGED ─────────────────────────────────────────
// `acrossRooms` + `roles` exist so `recall_own_history` can reuse this exact lexical⊕dense⊕RRF pipeline
// instead of growing a second copy that drifts from it. ⛔ Both default to TODAY'S behaviour: one room,
// both roles. `checks/self-history-check.mjs` asserts the default is still room-scoped, because this is
// the single line that separates "search this room" from "search everything" and a silent flip here would
// be the largest disclosure defect in the project.
//
// ⚠️ `roles` is INTERPOLATED into SQL, so it is whitelisted rather than escaped — a role list that can
// carry arbitrary text into a WHERE clause is an injection, and `replacements` cannot parameterise an
// IN-list (the `ANY(:ids::uuid[])` lesson: replacements expand an array into a comma list).
// ⭐⭐ `onlyConversationId` — PIN THE SEARCH TO ONE CONVERSATION. Added for self-history NAVIGATION
// (P1): once a disclosure grant has been verified for one room, the host resolves WHICH of her messages
// in that conversation the query refers to — server-side, so a cross-room message id never has to be
// handed to her to be handed back. ⛔ It NARROWS; it can never widen the room predicate, and it is a
// builder-level SCOPE rather than a per-call tweak because that is what it is.
export function buildConversationSearch(fastify, { userId = null, currentConversationId = null, embed = null, acrossRooms = false, roles = ['user', 'assistant'], onlyConversationId = null, onlyConversationIds = null } = {}) {
  const { txn_messages } = fastify.db
  const seq = txn_messages.sequelize
  const { tableName: MT, schema } = txn_messages.getTableName()
  const MSG = schema ? `"${schema}"."${MT}"` : `"${MT}"`
  // conversations table name (for the JOIN + user scoping + title)
  const { tableName: CT, schema: cs } = fastify.db.txn_conversations.getTableName()
  const CONV = cs ? `"${cs}"."${CT}"` : `"${CT}"`

  // txn_message_embeddings has NO Sequelize model (raw SQL only), so unlike MSG/CONV above it cannot
  // come from getTableName(). These two literals are the ONLY place the name is written in Backend;
  // table-names.test.mjs pins them, because getting it wrong fails soft (no evidence, no error).
  // ⚠ NO DEFAULT SCHEMA. This used to read `schema || 'llmservices'`, and on 2026-08-09 the project schema
  // was renamed to `ote_llm_services` while the database moved to `ote_ai_toolbox` — so that fallback
  // stopped naming anything that exists. It would not have thrown: an undefined `schema` would have
  // silently queried a schema with no such table, and conversation evidence "fails soft (no evidence, no
  // error)" by design, so the only symptom would be recall quietly getting worse. Fail loudly instead.
  if (!schema) throw new Error('conversation-search: no project schema configured — refusing to guess one')
  const ME = `"${schema}"."txn_message_embeddings"`
  // shared scope + projection for both arms (role user/assistant, this user, not the current convo,
  // NEVER incognito — off-the-record chats are excluded from evidence, matching the index exclusion).
  // ⛔ WHITELIST, NOT ESCAPE. Anything not in this set throws rather than reaching the WHERE clause.
  const ALLOWED_ROLES = ['user', 'assistant']
  const asked = Array.isArray(roles) ? roles : [roles]
  if (!asked.length || asked.some((r) => !ALLOWED_ROLES.includes(r))) {
    throw new Error(`conversation-search: roles must be a subset of ${ALLOWED_ROLES.join('/')} — got ${JSON.stringify(roles)}`)
  }
  const ROLE_IN = `m.role IN (${asked.map((r) => `'${r}'`).join(',')})`
  // ── ⭐⭐ `onlyConversationIds` — PIN THE SEARCH TO A SET · 2026-08-25 ─────────────────────────────
  // The plural of `onlyConversationId`, added for CONVERSATION RETRIEVAL: SQL first establishes which
  // conversations are eligible (person, room, time, role), and the ranker then only ever ranks INSIDE
  // that set. ⭐ Ote's rule made mechanical: *"pgvector helps answer «which content is relevant?»; SQL
  // answers «which conversations are we allowed/trying to search?»"* — so the dense arm can never widen
  // the population, only order it.
  // ⛔ VALIDATED, NOT ESCAPED — the same discipline as ROLE_IN above, and for a harder reason: sequelize
  // `replacements` expand an array into a comma list, which breaks `ANY(:ids::uuid[])`. A UUID that fails
  // the pattern THROWS rather than reaching the WHERE clause.
  // ⛔ AND IT ONLY EVER NARROWS. An empty array is not "no filter" — it is a set with nothing in it, and
  // must return nothing; `null` means "not restricted". Conflating those would turn a resolved-but-empty
  // selector into a search of everything, which is the widest possible failure direction.
  const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  let idSet = null
  if (onlyConversationIds != null) {
    const ids = Array.isArray(onlyConversationIds) ? onlyConversationIds : [onlyConversationIds]
    for (const id of ids) {
      if (!ID_RE.test(String(id))) throw new Error(`conversation-search: onlyConversationIds must all be uuids — got ${JSON.stringify(id)}`)
    }
    idSet = ids.length ? ids.map((i) => `'${i}'`).join(',') : null
    if (!ids.length) idSet = 'NULL' // an empty set matches nothing, ⛔ never everything
  }
  const IDS_IN = (col) => (idSet ? `AND ${col} IN (${idSet})` : '')
  // ⭐ THE ROOM PREDICATE, AND IT IS THE WHOLE BOUNDARY. Room-scoped by default; `acrossRooms` drops it
  // for persona-level self-history, where the ROLE filter is what makes the result hers.
  const ROOM = acrossRooms ? 'TRUE' : 'c.user_id IS NOT DISTINCT FROM :userId'
  const SCOPE = `${ROOM}
          AND c.incognito = false
          AND ${ROLE_IN}
          AND (:excludeConversationId::uuid IS NULL OR m.conversation_id <> :excludeConversationId::uuid)
          AND (:onlyConversationId::uuid IS NULL OR m.conversation_id = :onlyConversationId::uuid)
          ${IDS_IN('m.conversation_id')}`
  const COLS = `m.id AS message_id, m.conversation_id, m.role, m.content, m.created_at, c.title AS conversation_title`

  // ⭐⭐ THE SAME SCOPE, EXPRESSED AGAINST THE EMBEDDING TABLE (migration 018) — so the vector index can
  // apply it, instead of a join above the index applying it afterwards.
  //   · `me.role` / `me.conversation_id` / `me.room_user_id` are denormalised copies, asserted equal to
  //     their sources by 018's proof block and re-asserted by `message-embedding-scope-check`.
  //   · ⛔ `c.incognito` is ABSENT ON PURPOSE: off the record means NOT INDEXED. The writer has always
  //     refused to embed those, `incognito` is set at create and never patched, and 018 deletes any that
  //     slipped in. **Absence is a stronger guarantee than a filter**, because a filter can be forgotten
  //     by the next query and an absent row cannot be found by any of them.
  const V_ROOM = acrossRooms ? 'TRUE' : 'me.room_user_id IS NOT DISTINCT FROM :userId'
  const V_ROLE_IN = `me.role IN (${asked.map((r) => `'${r}'`).join(',')})`
  const VECTOR_SCOPE = `${V_ROOM}
          AND ${V_ROLE_IN}
          AND (:excludeConversationId::uuid IS NULL OR me.conversation_id <> :excludeConversationId::uuid)
          AND (:onlyConversationId::uuid IS NULL OR me.conversation_id = :onlyConversationId::uuid)
          ${IDS_IN('me.conversation_id')}`

  async function lexical(q, pool, excludeConversationId) {
    return seq.query(
      `SELECT ${COLS}, ts_rank(m.content_tsv, plainto_tsquery('english', :q)) AS score
         FROM ${MSG} m JOIN ${CONV} c ON c.id = m.conversation_id
        WHERE ${SCOPE} AND m.content_tsv @@ plainto_tsquery('english', :q)
        ORDER BY score DESC, m.created_at DESC LIMIT :pool`,
      { replacements: { q, userId, excludeConversationId, onlyConversationId, pool }, type: seq.QueryTypes.SELECT },
    )
  }
  // ── ⭐⭐ THE DENSE ARM FILTERS **IN THE VECTOR'S OWN TABLE** (migration 018) ────────────────────────
  // It used to reach its predicates through `JOIN txn_messages JOIN txn_conversations`, which meant the
  // HNSW scan could only ever be POST-filtered: the index returned ~ef_search global neighbours and the
  // join discarded the ones out of scope. Recall therefore degraded with the SELECTIVITY of the filter,
  // and P1's `onlyConversationId` is the most selective filter in the system — so at scale it would have
  // returned nothing and read as `not_located`: **a false absence manufactured by an index.**
  //
  // ⇒ `role`, `conversation_id` and `room_user_id` now live beside the vector, so the predicate is
  // applied AT the index scan. The messages/conversations join remains only to PROJECT the row (content,
  // title) — it no longer decides what is in scope.
  //
  // ⏸ `hnsw.iterative_scan` (pgvector 0.8, and it IS available here) is deliberately NOT enabled, and the
  // reason is worth recording because the obvious line is a trap: `SET LOCAL` outside a transaction block
  // is a **silent no-op** — Postgres warns and carries on — and plain `SET` would leak the setting into
  // every later statement on a pooled connection. Enabling it properly means wrapping each search in an
  // explicit transaction.
  // ⭐ AND THE TWO WINS THAT MATTER DO NOT NEED IT: the PARTIAL index (`WHERE role = 'assistant'`) contains
  // only her own sentences, so that scan is pre-filtered by construction; and a pinned conversation is a
  // btree lookup plus an exact sort, which never touches the graph. Iterative scan would additionally help
  // the ROOM-scoped case at scale — ⏸ left until that is measured, rather than shipped as a line that
  // reads like it is doing something.
  //
  // ⛔⛔ AND NONE OF THIS IS AN AUTHORIZATION CHANGE. These columns are a retrieval SCOPE; what she may
  // read is decided later, by the projection and the grant, neither of which can see this table. Ote:
  // *"A vector score must never become an authorization signal. Don't let the optimization for 018
  // accidentally collapse those layers."*
  async function dense(vector, pool, excludeConversationId) {
    const qvec = `[${vector.join(',')}]`
    return seq.query(
      `SELECT ${COLS}, (1 - (me.embedding_hv <=> :qvec::halfvec(2048))) AS score
         FROM ${ME} me
         JOIN ${MSG} m ON m.id = me.message_id
         JOIN ${CONV} c ON c.id = m.conversation_id
        WHERE ${VECTOR_SCOPE} AND me.embedding_hv IS NOT NULL
        ORDER BY me.embedding_hv <=> :qvec::halfvec(2048) LIMIT :pool`,
      { replacements: { qvec, userId, excludeConversationId, onlyConversationId, pool }, type: seq.QueryTypes.SELECT },
    )
  }

  /**
   * Search THIS user's past messages for evidence. HYBRID (lexical ⊕ dense via RRF) when an embedder is
   * available (CS2), else LEXICAL only (CS1). Retrieval stays broad; the Evidence Filter refines. `mode`
   * in the result says which arms ran. Returns { count, evidence, mode }.
   */
  async function search(query, { limit = 8, excludeConversationId = currentConversationId, minLength = 20, poolMultiplier = 4, denseMinSim = 0.5 } = {}) {
    const q = String(query || '').trim()
    if (!q) return { count: 0, evidence: [], mode: 'none' }
    const pool = Math.max(limit * poolMultiplier, limit)
    const lex = await lexical(q, pool, excludeConversationId)
    let rows = lex
    let mode = 'lexical'
    if (embed) {
      let vec = null
      try { vec = (await embed(q))?.vector || null } catch { /* dense best-effort → lexical only */ }
      if (vec) {
        // pgvector <=> always returns the NEAREST rows, however far — so apply a cosine FLOOR, else a
        // nonsense query returns its (irrelevant) nearest neighbours as false-positive evidence.
        const den = (await dense(vec, pool, excludeConversationId)).filter((r) => Number(r.score) >= denseMinSim)
        // RRF-fuse the two ranked id lists, then materialize rows in fused order (score = RRF score)
        const byId = new Map()
        for (const r of [...lex, ...den]) if (!byId.has(r.message_id)) byId.set(r.message_id, r)
        rows = rrfFuse([lex.map((r) => r.message_id), den.map((r) => r.message_id)])
          .slice(0, pool)
          .map((f) => ({ ...byId.get(f.id), score: f.score }))
          .filter((r) => r.message_id)
        mode = den.length ? 'hybrid' : 'lexical+empty-dense'
      }
    }
    const evidence = filterEvidence(rows.map((r) => toEvidence(r)), { minLength, limit })
    return { count: evidence.length, evidence, mode }
  }

  return { search }
}

/**
 * Backfill / incremental embed pass — embed user/assistant messages ≥ MIN_EMBED_CHARS that lack a
 * message_embeddings row (skips tool-echoes, system, and trivial messages by construction). Off the
 * hot path: run as a one-time backfill or a periodic maintenance pass. Bounded by `limit` (resumable —
 * re-run until it embeds 0). Returns { embedded, remaining }.
 */
export async function embedPendingMessages(fastify, { userId = null, limit = 200, minChars = MIN_EMBED_CHARS } = {}) {
  const { txn_messages } = fastify.db
  const seq = txn_messages.sequelize
  const { tableName: MT, schema } = txn_messages.getTableName()
  const MSG = schema ? `"${schema}"."${MT}"` : `"${MT}"`
  // txn_message_embeddings has NO Sequelize model (raw SQL only), so unlike MSG/CONV above it cannot
  // come from getTableName(). These two literals are the ONLY place the name is written in Backend;
  // table-names.test.mjs pins them, because getting it wrong fails soft (no evidence, no error).
  // ⚠ NO DEFAULT SCHEMA. This used to read `schema || 'llmservices'`, and on 2026-08-09 the project schema
  // was renamed to `ote_llm_services` while the database moved to `ote_ai_toolbox` — so that fallback
  // stopped naming anything that exists. It would not have thrown: an undefined `schema` would have
  // silently queried a schema with no such table, and conversation evidence "fails soft (no evidence, no
  // error)" by design, so the only symptom would be recall quietly getting worse. Fail loudly instead.
  if (!schema) throw new Error('conversation-search: no project schema configured — refusing to guess one')
  const ME = `"${schema}"."txn_message_embeddings"`
  const CONV = (() => { const { tableName, schema: s } = fastify.db.txn_conversations.getTableName(); return s ? `"${s}"."${tableName}"` : `"${tableName}"` })()
  // MESSAGES, not memories — so this uses its own window. memory.embeddingNumCtx (2048) is sized for
  // memory content (longest on record: 312 chars) and silently truncated 21 of 645 embed-eligible
  // messages here, the longest at ~21,850 tokens. A truncated embedding still looks perfectly valid, so
  // nothing surfaced it; the dense arm was just quietly matching on the head of long messages.
  let msgNumCtx = 8192
  try { msgNumCtx = getSetting(fastify.config, 'memory.messageEmbeddingNumCtx') } catch { msgNumCtx = 8192 }
  const embed = makeEmbedder(fastify, { userId, numCtx: msgNumCtx })
  // candidates: worth-embedding messages with no embedding yet (optionally scoped to one user)
  const rows = await seq.query(
    `SELECT m.id, m.content FROM ${MSG} m
       JOIN ${CONV} c ON c.id = m.conversation_id
       LEFT JOIN ${ME} me ON me.message_id = m.id
      WHERE me.message_id IS NULL
        AND c.incognito = false
        AND m.role IN ('user','assistant')
        AND length(m.content) >= :minChars
        AND (:userId::uuid IS NULL OR c.user_id = :userId::uuid)
      ORDER BY m.created_at DESC LIMIT :limit`,
    { replacements: { minChars, userId, limit }, type: seq.QueryTypes.SELECT },
  )
  let embedded = 0
  for (const r of rows) {
    try {
      const { vector, model } = await embed(r.content)
      if (!vector) continue
      // ⭐⭐ THE SCOPE COLUMNS ARE WRITTEN HERE, FROM THE SOURCE ROWS, IN THE SAME STATEMENT (migration
      // 018). ⛔ A denormalised column that only the backfill ever populated is the
      // `allowlist-drops-what-it-was-not-told` failure with a new name — and `conversation_id`/`role` are
      // NOT NULL precisely so a forgetful writer fails loudly instead of quietly writing unscoped vectors.
      // ⓘ Read back from txn_messages/txn_conversations rather than trusted from the candidate row, so the
      // copy can never disagree with its source.
      await seq.query(
        `INSERT INTO ${ME} (message_id, embedding, embedding_model, conversation_id, role, room_user_id)
         SELECT m.id, :emb::jsonb, :model, m.conversation_id, m.role, c.user_id
           FROM ${MSG} m JOIN ${CONV} c ON c.id = m.conversation_id
          WHERE m.id = :id
         ON CONFLICT (message_id) DO UPDATE SET
           embedding = EXCLUDED.embedding, embedding_model = EXCLUDED.embedding_model,
           conversation_id = EXCLUDED.conversation_id, role = EXCLUDED.role,
           room_user_id = EXCLUDED.room_user_id`,
        { replacements: { id: r.id, emb: JSON.stringify(vector), model } },
      )
      embedded++
    } catch { /* skip a bad row; the next pass retries it */ }
  }
  return { embedded, scanned: rows.length }
}

/** Gate for the daily incremental message-embedding pass (memory.embedMessagesEnabled, default true). */
export function embedMessagesEnabled(config) {
  try { return getSetting(config, 'memory.embedMessagesEnabled') !== false } catch { return true }
}

/**
 * Daily maintenance drain (CS2b) — keep message_embeddings caught up so Conversation Search's dense arm
 * stays fresh without a manual backfill. Loops embedPendingMessages in bounded batches until the delta
 * is exhausted (scanned < batchLimit ⇒ no more candidates) or the batch cap is hit (a nightly-pass
 * safety valve — a large backlog drains over successive nights, never in one unbounded run). Gated by
 * memory.embedMessagesEnabled (force=true bypasses, for the manual/admin path). `embedBatch` is an
 * injectable seam (defaults to embedPendingMessages) so the drain/cap logic is unit-testable. Never throws.
 * @returns {{skipped?:boolean, reason?:string, embedded:number, scanned:number, batches:number, drained:boolean}}
 */
export async function drainPendingEmbeddings(fastify, { batchLimit = 200, maxBatches = 10, force = false, userId = null, embedBatch = embedPendingMessages } = {}) {
  if (!force && !embedMessagesEnabled(fastify.config)) return { skipped: true, reason: 'disabled', embedded: 0, scanned: 0, batches: 0, drained: false }
  if (!fastify.db?.txn_messages) return { skipped: true, reason: 'no-db', embedded: 0, scanned: 0, batches: 0, drained: false }
  let embedded = 0
  let scanned = 0
  let batches = 0
  let drained = false
  for (; batches < maxBatches; batches++) {
    const r = await embedBatch(fastify, { userId, limit: batchLimit })
    embedded += r.embedded
    scanned += r.scanned
    if (r.scanned < batchLimit) { drained = true; batches++; break } // fewer candidates than a full batch ⇒ nothing left
  }
  return { embedded, scanned, batches, drained }
}

/** Render one Evidence object → the single line the passive Composer provider injects (citation +
 *  excerpt). Kept HERE (with the evidence shape) so the route doesn't hand-format citations. Pure. */
export function evidenceLine(e) {
  return `[${e?.citation ?? 'a conversation'}] "${e?.excerpt ?? ''}"`
}

let initialized = false
/**
 * Register the `conversationSearch` host service (idempotent). Called once at boot. Bound per request
 * to the caller + current conversation (so search excludes the chat you're already in). Mirrors the
 * initTodo / initSchedules / initInteraction pattern.
 */
export function initConversationSearch() {
  if (initialized) return
  initialized = true
  registerHostService('conversationSearch', ({ fastify: f, user, extras }) =>
    buildConversationSearch(f, {
      userId: user?.id ?? null,
      currentConversationId: extras?.conversationId ?? null,
      embed: makeEmbedder(f, { userId: user?.id ?? null }), // hybrid (lexical ⊕ dense) when embeddings exist
    }))
}
