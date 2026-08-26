// SequelizeMemoryStore — THE HOST'S HALF of the memory seam (RFC_MEMORY_AS_COMPONENT step 1b).
//
// Implements the MemoryStore port over Sequelize + Postgres. ⚠️ THIS FILE STAYS IN THE HOST when the
// cognition leaves for `@ote/persona-memory` in step 2. It is the only place that knows this database
// exists — models, `Op`, raw SQL, pgvector, tsvector — and the component above it must never learn.
//
// ── THE ONE RULE THAT GENERATES EVERYTHING HERE ─────────────────────────────────────────────────
// **SCOPE IS THE STORE'S BUSINESS.** The component says what it wants ("the live facts I can see",
// "the nearest neighbours to this vector"); this file decides what "I" means. That is what lets the
// same component serve Pareto/OteLLMServices, which hosts many personas and scopes by a `persona`
// column, and Sotera, which is one persona per schema — Ote's requirement: *"it really the 'Portable
// component' that can work with many persona."*
//
// ⇒ The component NEVER passes `persona` or `user_id`. If you find yourself adding either to a method
//   signature here, the seam has sprung a leak.
//
// ── TWO SCOPES, BECAUSE THEY ARE TWO QUESTIONS ──────────────────────────────────────────────────
//   VISIBLE — this user's rows ∪ the persona-global identity rows. What recall may surface.
//   OWN     — only this user's rows. What reconcile, episode clustering and card matching may act on.
// Reconciling against a belief the user does not own would let one user's write displace a
// persona-wide fact, so the union is deliberately absent from `findOwnLive`.
//
// ── DEGRADATION IS A CONTRACT HERE, NOT A CONVENIENCE ───────────────────────────────────────────
// Ote, 2026-08-11: *"preserve the existing degradation behavior as an explicit tested contract."*
//   lexicalSearch   → `[]`   when the host has no tsvector column   (recall continues, dense-only)
//   denseRelevances → `null` when the host has no pgvector column   (recall falls back to JS cosine)
//   getSource       → the memory with NO `context` when conversations are unavailable — that is
//                     SUCCESS, not failure. A host may legitimately have memory and no chat history.
// ⚠️ `null` vs `[]` in the dense arm is load-bearing: null means "I cannot answer, fall back"; empty
// means "I answered, nothing matched". Collapse them and recall goes silently empty.
// Each capability latch flips ONCE and warns ONCE — a missing index must not log per query.
import { Op } from 'sequelize'
// ⭐⭐⭐ THE ONE INVARIANT THE STORE CAN GUARANTEE ABOUT ITSELF: no durable row may assert what the store
// contains. ⛔ The predicate lives in its own file — one predicate, one place, the same discipline as
// `memory-ownership.js` — so this file holds the ENFORCEMENT and none of the judgement.
import { admissible } from './memory-self-state-claim.js'
// ⭐⭐ LINEAGE IS STAMPED HERE FOR THE SAME REASON THE SELF-STATE GATE IS: this is the ONE point every
// writer passes through. The alternative — attaching it upstream in the observation pipeline — was
// measured and rejected: `makeObservation`, `commitToMemory` and the episodic resolver are each an
// EXPLICIT FIELD LIST, three doors any new field has to survive, and the episodic one is dropping
// `provenance` today. ⛔ A field that has to pass three allowlists to reach the database will one day
// not, and the failure will be silent because the row still writes.
import { BASIS, MECHANISM, mechanismOf, derivedFrom, withDerivedFrom, derivedFromOf } from './memory-lineage.js'
// ⭐⭐ AND THE SECOND PREDICATE THAT LIVES IN ITS OWN FILE — one predicate, one place, same discipline as
// `memory-self-state-claim.js` and `memory-ownership.js`. This file holds the ENFORCEMENT and none of the
// judgement about what a modality means.
import { slotViolation } from './memory-modality.js'
import { tracedMemoryIds } from './memory-retrieval-trace.js'

const LIVE = { invalid_at: null, expired_at: null }

// ── ⭐⭐⭐ B2 · A CONTRADICTED MEMORY DOES NOT PARTICIPATE IN NORMAL RETRIEVAL ──────────────────────
//
// Ote's ruling, 2026-08-26: *"If a memory has been contradicted, it should stay in the system and remain
// available behind an explicit historical/why gate, but it should not participate in normal retrieval as
// a current truth. **I don't want us relying on Sotera correctly interpreting a prose marker.**"*
//
// ⛔ SO IT IS A **WHERE CLAUSE, NOT A POST-FILTER**, and the difference is not stylistic. `recall({limit:
// 6})` asks for six. Filtering afterwards hands back four and silently shrinks what she was given;
// filtering in the query returns six LIVE ones. A post-filter also cannot bind the SQL search arms.
//
// ⚠️ AND IT IS SEPARATE FROM `LIVE`, DELIBERATELY. `invalid_at`/`expired_at` mean **replaced**;
// `contradicted_at` means **disputed and still standing**. Folding it into LIVE would have made
// `listArchived` — *"the ONLY read that returns the dead"* — start returning contradicted rows as though
// they were superseded, collapsing the exact two states migration 030 exists to keep apart.
//
// ⭐ Where it does NOT apply, and why each is deliberate:
//   · `findById` / `findAnyById` — naming an id IS the explicit gate. She can still inspect one.
//   · `listArchived` — a different question about a different state.
//   · `listContradicted` — the gate itself.
const NOT_CONTRADICTED = { contradicted_at: null }
const OWNED_KINDS = ['episodic', 'semantic', 'card'] // identity is persona-global, never "owned"

// ── ⭐⭐ AND A ROW WITH **NO** KIND IS OWNED TOO — THE TRAP MIGRATION 016 WOULD OTHERWISE HAVE LAID ──
// 016 made `kind` nullable so Sotera's own retention need not be classified into our tier vocabulary to
// be storable. But every read in this file narrows by a kind ALLOWLIST — `OWNED_KINDS` here, a literal
// `kind IN ('episodic','semantic','card')` in the search scope below — and an allowlist excludes NULL by
// construction. ⇒ A kind-less memory would have been **written and then unreachable**: visible to no
// recall, no search, no listing. Write-only memory is worse than a refused write, because it looks like
// it worked.
//
// ⭐ THIS IS NOT A DEFAULT AND IT IS NOT A WIDENING OF ANY BOUNDARY. Ote's rule is *"readers must treat
// NULL as 'no kind was supplied', never silently invent a default"* — treating it as no-kind means **not
// excluding it**, which is exactly what this does. The scope stays `user_id = U`: same room, same person,
// no cross-room reach. ⛔ The persona-global/identity branch is untouched, so nothing became broadcast.
const OWNED_KIND_OR_UNCLASSIFIED = { [Op.or]: [{ [Op.in]: OWNED_KINDS }, { [Op.is]: null }] }

/**
 * @param {object}  deps
 * @param {object}  deps.db        Sequelize models bag — needs `txn_memories`; `txn_messages` /
 *                                 `txn_conversations` are OPTIONAL (see getSource).
 * @param {string|null} [deps.persona]  the persona scope, or null for a single-persona host
 * @param {string|null} [deps.userId]   whose memory this store is bound to
 * @param {object|null} [deps.log]
 * @param {()=>number}  [deps.now]
 */
export function createSequelizeMemoryStore({ db, persona = null, userId = null, author = 'account', log = null, now = () => Date.now() } = {}) {
  const txn_memories = db?.txn_memories
  if (!txn_memories) throw new TypeError('createSequelizeMemoryStore: db.txn_memories is required')
  const P = persona ?? null
  const U = userId ?? null

  // ── ⭐⭐ OWNERSHIP FOLLOWS AUTHORSHIP (migration 015) ───────────────────────────────────────────
  // Ote, 2026-08-20: *"Sotera is the owner of her own memories when she authored/formed the
  // understanding, regardless of which room the conversation happened in."*
  //
  // ⭐ THE AUTHOR IS A PROPERTY OF THE WRITER, DECLARED ONCE AT CONSTRUCTION — not a per-row field a
  // caller has to remember. A store built for extraction writes `account`; a store built for the
  // distiller / Reflection / the lesson writer declares `persona`. That is the only shape that satisfies
  // *"the author must arrive with the write, not be assigned by whoever remembers to"*: six times in this
  // project an explicit field list has silently dropped a new field, and the last one was mine.
  //
  // ⚠️ AND THE DEFAULT IS THE STATUS QUO. Forgetting to declare gets `account`; ⛔ nothing can become
  // `persona` by omission. An unknown value is a programming error and fails loudly rather than being
  // coerced — a silently-corrected author is exactly the class of bug this column exists to end.
  if (author !== 'account' && author !== 'persona') {
    throw new TypeError(`createSequelizeMemoryStore: author must be 'account' or 'persona', got ${JSON.stringify(author)}`)
  }
  const AUTHOR = author

  // Capability latches. Set once, warned once — see the degradation contract above.
  let lexicalDisabled = false
  let denseDisabled = false

  // ── SUBJECT RESOLUTION (migration 004) ──────────────────────────────────────────────────────────
  // WHO a belief is about, defaulted host-side so the portable cognition never learns that persons
  // exist. Same seam as scope: the component passes content, the host stamps identity.
  //
  // The default is ONLY the definitionally-true case, exactly as the migration's backfill was:
  //   · a persona-global row (kind 'identity', user_id null) is about the PERSONA
  //   · any other row is about the person who holds this store's account
  // Anything else — a memory about a third party, about a project — must be passed explicitly by a
  // caller that actually knows. ⚠️ It is never inferred from content, and a missing person stays NULL
  // rather than becoming a guess. `hermes_alias` has no person today and its rows will carry NULL,
  // which is the honest answer.
  //
  // Cached because it is two ids that cannot change within one store's lifetime, and a lookup per
  // write would put a query on the capture path for a value that is constant.
  let subjectCache = null
  const resolveSubjects = async () => {
    if (subjectCache) return subjectCache
    subjectCache = { user: null, persona: null }
    try {
      if (db.mst_persons) {
        const p = await db.mst_persons.findOne({ where: { kind: 'persona' }, attributes: ['id'] })
        subjectCache.persona = p?.id ?? null
      }
      if (U && db.mst_users) {
        const u = await db.mst_users.findOne({ where: { id: U }, attributes: ['person_id'] })
        subjectCache.user = u?.person_id ?? null
      }
    } catch (e) {
      // Subject is additive and nothing reads it yet — a failure here must never fail a memory write.
      log?.warn?.(e, '[memory-store] could not resolve subject persons; writing NULL subject')
    }
    return subjectCache
  }

  /**
   * VISIBLE: this room ∪ persona-global.
   *
   * ⭐⭐⭐ SCOPE IS READ FROM THE `scope` COLUMN, ⛔ NEVER INFERRED FROM A MISSING `user_id` (029).
   * ⚠️ It used to say `user_id: null` for the global arm, which made "nobody owns this" and "everybody can
   * read this" the same query. `auth/root-identity.js` named that collision on 2026-08-06 — *"`user_id IS
   * NULL` means TWO different things"* — and it stayed latent only while zero identity rows existed. The
   * first one was written 2026-08-25 and four assertions went red the same day.
   * ⭐ `user_id` now means one thing everywhere: the room the memory was FORMED IN, and it is NOT NULL.
   * ⛔ ABOUT ≠ OWNER ≠ SCOPE: `kind` no longer implies reachability either — an `identity` row is global
   * because its SCOPE says so, not because of the kind it happens to be.
   */
  const visibleWhere = (kind, namespace) => {
    const base = { ...LIVE, ...NOT_CONTRADICTED, persona: P, ...(namespace ? { namespace } : {}) }
    const reachable = { [Op.or]: [{ user_id: U }, { scope: 'persona_global' }] }
    if (kind) return { ...base, kind, [Op.and]: [reachable] }
    return {
      ...base,
      [Op.and]: [{ [Op.or]: [{ user_id: U, kind: OWNED_KIND_OR_UNCLASSIFIED }, { scope: 'persona_global' }] }],
    }
  }

  /** In scope to READ this row? This room, or persona-global. Mirrors visibleWhere for single-row fetches. */
  const inScope = (row) => !!row && (row.user_id === U || row.scope === 'persona_global')

  /**
   * ⭐⭐ lineageFor — attach `evidence.derivedFrom` to a row being written, or leave it exactly as it came.
   *
   * ── ⛔ THREE REFUSALS, EACH ONE LOAD-BEARING ─────────────────────────────────────────────────────
   * 1. ⛔ A WRITER'S OWN `evidence` IS NEVER CLOBBERED. Four unrelated payloads already live in that
   *    column — card membership, slot-mint metadata, document-ingest fields, decline reasons — with no
   *    discriminator between them. The merge is additive, under one key, or it is a data-loss bug.
   * 2. ⛔ EXTRACTION IS SKIPPED. An extracted fact derives from the TURN, which `source_message_id`
   *    already records; stamping the turn's retrieved memories on it would claim a derivation that did
   *    not happen, and stamping the turn itself would restate the occasion under a second name.
   * 3. ⛔ NO TRACE, NO LINEAGE. An unobserved turn yields nothing, not an empty envelope — "it rests on
   *    nothing" and "nobody recorded what it rests on" must never look alike.
   */
  const lineageFor = (row) => {
    // The turn key IS the occasion id: the same anchor the trace is recorded under, so the derivation is
    // found THROUGH the occasion while staying a separate answer from it.
    const turnKey = row?.source_message_id ?? null
    if (!turnKey || derivedFromOf(row?.evidence)) return row?.evidence ?? null
    const mech = mechanismOf(row?.source)
    // ⭐ Synthesis lanes only. `document`, `consolidation` and `episode` describe their own derivation
    // already and know it better than a presence record does.
    if (mech !== MECHANISM.modelTool && mech !== MECHANISM.unrecorded) return row?.evidence ?? null
    const memoryIds = tracedMemoryIds(turnKey)
    if (!memoryIds.length) return row?.evidence ?? null
    return withDerivedFrom(row.evidence, derivedFrom({ basis: BASIS.inContext, memoryIds, via: 'turn-retrieval' }))
  }

  return {
    // ── READS ────────────────────────────────────────────────────────────────────────────────
    async findVisible({ kind = null, namespace = null } = {}) {
      return txn_memories.findAll({ where: visibleWhere(kind, namespace), order: [['created_at', 'DESC']], raw: true })
    },

    async findOwnLive({ kind = null, namespace = null } = {}) {
      // ⭐ CONTRADICTED ROWS ARE EXCLUDED HERE TOO, and this one matters more than recall. `findOwnLive`
      // feeds RECONCILE, episode clustering and card matching — so leaving them in would let a repudiated
      // belief supersede, absorb or shape a NEW one. ⛔ A memory she has been told is wrong must not get
      // to influence what replaces it.
      return txn_memories.findAll({
        where: { ...LIVE, ...NOT_CONTRADICTED, persona: P, user_id: U, ...(kind ? { kind } : {}), ...(namespace ? { namespace } : {}) },
        order: [['created_at', 'DESC']], // newest-first: reconcile's matches[0] must be the most recent
        raw: true,
      })
    },

    async findById(id) {
      if (!id) return null
      const row = await txn_memories.findOne({ where: { id, persona: P, ...LIVE }, raw: true })
      return inScope(row) ? row : null // out of scope reads as ABSENT, never as a hit
    },

    async findAnyById(id) {
      if (!id) return null
      const row = await txn_memories.findOne({ where: { id, persona: P }, raw: true })
      return inScope(row) ? row : null
    },

    async findByIds(ids = []) {
      if (!ids?.length) return []
      return txn_memories.findAll({ where: { id: ids }, raw: true })
    },

    async findLiveInSlot({ slotId = null, entity = null, attribute = null } = {}) {
      // Prefer the slot's real identity; fall back to (entity, attribute) for rows written before the
      // Slot store existed. Rows, not a count: reviveSuperseded asks "is it empty?", restore must name
      // the holder. Callers pass an already-invalid row's keys, so no id-exclusion is needed.
      const key = slotId ? { slot_id: slotId } : { entity, attribute, user_id: U }
      return txn_memories.findAll({ where: { ...key, ...LIVE, persona: P }, raw: true })
    },

    /**
     * ⭐⭐⭐ THE EXPLICIT HISTORICAL GATE · B2's other half.
     *
     * Ote: *"it should stay in the system and remain available behind an explicit historical/why gate."*
     * ⇒ this is that gate. A SEPARATE query, never a flag on a live read — same rule as `listArchived`,
     * and for the same reason: a boolean that can switch off the exclusion is one bad default away from
     * putting a repudiated belief back into a live prompt.
     *
     * ⭐ WHAT IT IS FOR: *"what have I been told I was wrong about?"* and *"why did I believe that?"* —
     * questions about her own history, which stay answerable precisely because ⛔ nothing was deleted.
     * `7d383ce3` will still say what it always said; what changes is that it stops being current truth.
     *
     * ⚠️ It returns rows that are otherwise LIVE. A contradicted row that was ALSO superseded is archived,
     * and belongs to `listArchived` — two states, two reads, no overlap.
     */
    async listContradicted({ kind = null, namespace = null, limit = 50 } = {}) {
      return txn_memories.findAll({
        where: {
          ...LIVE, persona: P,
          contradicted_at: { [Op.ne]: null },
          ...(kind ? { kind } : {}),
          ...(namespace ? { namespace } : {}),
          [Op.and]: [{ [Op.or]: [{ user_id: U }, { scope: 'persona_global' }] }],
        },
        order: [['contradicted_at', 'DESC']], // most recently corrected first — the freshest lesson
        limit: Math.max(1, Math.min(limit, 200)),
        raw: true,
      })
    },

    /**
     * ⭐⭐ HOW MANY WERE WITHHELD — so the exclusion is never SILENT.
     *
     * ⛔ A filter nobody can see is how *"I covered everything"* gets said about a filtered set, and this
     * project has paid for that twice. `withheldDecisions` already reports the decline split; this is the
     * same discipline for corrections. ⭐ It is a COUNT, not the content: the number tells her something
     * exists to ask about without putting the repudiated claim back in front of her — which is exactly
     * what Ote meant by *"I don't want us relying on Sotera correctly interpreting a prose marker."*
     */
    async countContradicted({ kind = null, namespace = null } = {}) {
      return txn_memories.count({
        where: {
          ...LIVE, persona: P,
          contradicted_at: { [Op.ne]: null },
          ...(kind ? { kind } : {}),
          ...(namespace ? { namespace } : {}),
          [Op.and]: [{ [Op.or]: [{ user_id: U }, { scope: 'persona_global' }] }],
        },
      })
    },

    async listArchived({ kind = null, namespace = null } = {}) {
      // The ONLY read that returns the dead. A SEPARATE query on purpose, never a flag on the live
      // reads — a boolean that can switch off the live filter is one bad default away from leaking a
      // forgotten belief into a live prompt.
      return txn_memories.findAll({
        where: {
          persona: P,
          [Op.or]: [{ invalid_at: { [Op.ne]: null } }, { expired_at: { [Op.ne]: null } }],
          ...(kind ? { kind } : {}),
          ...(namespace ? { namespace } : {}),
          // 029: reachability is the scope column, never a missing owner.
          [Op.and]: [{ [Op.or]: [{ user_id: U }, { scope: 'persona_global' }] }],
        },
        order: [['created_at', 'DESC']],
        raw: true,
      })
    },

    // ── SEARCH — raw SQL lives here and nowhere above ────────────────────────────────────────
    // Shared scope for both arms, mirroring visibleWhere. Mutates `repl` with bound values and returns
    // the clause list. IS NOT DISTINCT FROM = null-safe equality (persona/user are legitimately null).
    ...(() => {
      const { tableName, schema } = txn_memories.getTableName()
      const memTable = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`
      const scopeClause = (kind, namespace, repl) => {
        // ⭐ `contradicted_at IS NULL` — B2, in the SQL arms as well as the ORM one. Both search arms feed
        // recall, so a clause present in only one of them would make her answer depend on which index
        // happened to be installed.
        const where = ['persona IS NOT DISTINCT FROM :persona', 'invalid_at IS NULL', 'expired_at IS NULL',
          'contradicted_at IS NULL']
        repl.persona = P
        if (namespace) { where.push('namespace = :ns'); repl.ns = namespace }
        if (kind) {
          // ⚠️⚠️ THIS LINE READ `user_id IS NOT DISTINCT FROM :su` WITH `:su = kind === 'identity' ? null : U`
          // UNTIL 2026-08-26, AND MIGRATION 029 SILENTLY BROKE IT. 029 made `user_id` NOT NULL, so the
          // identity branch asked for a row that can no longer exist: a kind-filtered search for `identity`
          // returned **0** where the correct clause returns **1**. Measured, not reasoned.
          //
          // ⭐⭐⭐ AND THE CHECK BUILT TO CATCH EXACTLY THIS MISSED IT, FOR A REUSABLE REASON.
          // `memory-scope-check` §4 is a source scan for the literals `user_id IS NULL` / `user_id: null`.
          // Here the NULL arrived through a **bound parameter** — the SQL text says only `:su` — so the
          // scan passed over the defect while reporting that no reader infers scope from a missing owner.
          // ⇒ **a source scan cannot see a value that arrives through a parameter.** §4 now also asserts
          // that no replacement in this file is conditionally set to null.
          //
          // ⭐ The fix is CONVERGENCE, not widening: `visibleWhere(kind)` — the ORM path 029 did update —
          // has always applied the same reachability for a kind-filtered read. This arm had diverged.
          where.push('kind = :kind')
          repl.kind = kind
          where.push("(user_id IS NOT DISTINCT FROM :u OR scope = 'persona_global')")
          repl.u = U
        } else {
          // ⭐ `OR kind IS NULL` — the same no-kind-is-still-mine rule as visibleWhere; see
          // OWNED_KIND_OR_UNCLASSIFIED at the top of this file. An allowlist silently excludes NULL, and a
          // memory she wrote without a tier would have been searchable by nothing.
          // ⭐ 029: the global arm is `scope`, not `user_id IS NULL`. ⛔ `IS NOT DISTINCT FROM` is kept
          // on the room arm only because it is still the null-safe comparison for :u itself.
          where.push("((user_id IS NOT DISTINCT FROM :u AND (kind IN ('episodic','semantic','card') OR kind IS NULL)) OR scope = 'persona_global')")
          repl.u = U
        }
        return where
      }
      return {
        async lexicalSearch({ query, kind = null, namespace = null, limit = 32 } = {}) {
          if (lexicalDisabled || !query || !String(query).trim()) return []
          const repl = { q: String(query), lim: Math.max(1, Math.min(limit, 200)) }
          const where = scopeClause(kind, namespace, repl)
          where.push("content_tsv @@ websearch_to_tsquery('english', :q)")
          const sql = `SELECT id FROM ${memTable} WHERE ${where.join(' AND ')} `
            + 'ORDER BY ts_rank(content_tsv, websearch_to_tsquery(\'english\', :q)) DESC LIMIT :lim'
          try {
            return (await txn_memories.sequelize.query(sql, { replacements: repl, type: 'SELECT' })).map((r) => r.id)
          } catch (e) {
            lexicalDisabled = true // latch: warn once, then stay quiet
            log?.warn?.({ err: e?.message }, '[memory.store] lexical arm disabled (tsvector column missing?) — vector-only recall')
            return [] // CONTRACT: [] = "no text index here", recall continues on the dense arm
          }
        },

        async denseRelevances({ qVec, kind = null, namespace = null, limit = 200 } = {}) {
          if (denseDisabled || !Array.isArray(qVec) || !qVec.length) return null
          const repl = { q: `[${qVec.join(',')}]`, lim: Math.max(1, Math.min(limit, 1000)) }
          const where = scopeClause(kind, namespace, repl)
          where.push('embedding_hv IS NOT NULL')
          const sql = `SELECT id, (1 - (embedding_hv <=> :q::halfvec(2048))) AS relevance FROM ${memTable} `
            + `WHERE ${where.join(' AND ')} ORDER BY embedding_hv <=> :q::halfvec(2048) LIMIT :lim`
          try {
            const rows = await txn_memories.sequelize.query(sql, { replacements: repl, type: 'SELECT' })
            return new Map(rows.map((r) => [r.id, Number(r.relevance) || 0]))
          } catch (e) {
            denseDisabled = true
            log?.warn?.({ err: e?.message }, '[memory.store] pgvector dense arm disabled (embedding_hv missing?) — JS cosine fallback')
            return null // ⚠️ CONTRACT: null ≠ empty Map. null = "cannot answer, fall back to JS cosine".
          }
        },
      }
    })(),

    /**
     * ⭐⭐ E-1 — PROVENANCE BACK-REFERENCE, WITH THE EVIDENCE AUTHORIZED SEPARATELY FROM THE MEMORY.
     *
     * Ote, 2026-08-20, ratifying the memory model: **"Memory ownership ≠ evidence ownership ≠ evidence
     * access."** · *"A memory can be Sotera's while the original conversation/message remains someone
     * else's material."*
     *
     * ── ⚠️⚠️ WHY THIS CHANGED, AND WHY IT HAD TO CHANGE FIRST ──────────────────────────────────────
     * Audited 2026-08-20 (`AUDIT_SOTERA_MEMORY_EVIDENCE_CHAIN.md`): this method scope-checked the MEMORY
     * and then fetched the message, the conversation title, and every message in that conversation **by
     * id, unfiltered.** That was sound only because of an invariant nobody had written down —
     *
     *     a memory's source message belongs to the same room as the memory
     *
     * — which held while `user_id` owned every memory. **The ratified reframe removes it**: memory
     * ownership follows AUTHORSHIP, so a Sotera-owned memory is in scope from every room while its source
     * message stays wherever it was said. Unchanged, this method would have returned another person's
     * actual words, plus two messages either side, through a tool marked `isReadOnly: true`.
     *
     * ⇒ **The memory being hers does not make its evidence hers.** So there are now TWO authorizations:
     *   1. the MEMORY  — `inScope()`, as before;
     *   2. the EVIDENCE — the source conversation must belong to THIS store's scope.
     *
     * ── ⭐ AND IT RETURNS FOUR STATES, NEVER TWO ───────────────────────────────────────────────────
     * ── ⭐ RENAMED 2026-08-21, AND THE NEW NAMES SAY WHAT THEY MEAN ─────────────────────────────────
     * These were `verified` · `attested` · `destroyed` · `unattested`. The word `attested` here meant *"the
     * reference exists and the content is NOT readable from here"* — which is the **opposite** of the sense
     * the Memory Cognition Layer needs for `attested-by-source` (*"an accessible source directly supports
     * this"*). One name, two contradictory meanings, is a defect this repo has already paid for.
     * Ote's ruling: *"keep attested-by-source for the cognition layer… Don't bend the cognition vocabulary
     * around an old storage enum."* ⓘ Safe to rename because this value is **computed at read time and
     * never persisted** — no column, no enum type, no stored rows to migrate.
     *
     * `evidenceState`: `source-readable` · `source-unreadable` · `source-destroyed` ·
     * `source-never-recorded`. The one that did not exist
     * before is **`attested`** — *"I learned this on the 18th, and I cannot show you what was said from
     * here."* ⛔ *"Cannot inspect"* must never collapse into *"there was no evidence"*, which is this
     * project's oldest failure arriving in the evidence layer.
     *
     * ⚠️ THE REFUSED PAYLOAD CARRIES NO CONTENT AND NO TITLE. A conversation title is content — the RFC
     * already ruled that a *room* name can be (`Ote_Divorce_Lawyer`), and a title like "Kavi Prefers Plain
     * Truths Over Reassurance" is a fact about a person. So when evidence is refused the caller gets the
     * DATE and whether it was this room or another, and no names at all.
     *
     * ⚠️ AND IT FETCHES THE WINDOW, NOT THE CONVERSATION. It used to `findAll` every message and slice in
     * JS — measured at **70 messages loaded to return 5**. The blast radius of an authorization mistake
     * should be the window, and the window should not be in process memory before the check.
     */
    async getSource({ id, context = 2 } = {}) {
      if (!id) throw new Error('id is required')
      const m = await txn_memories.findOne({ where: { id, persona: P }, raw: true })
      // (1) THE MEMORY. Unchanged.
      if (!inScope(m)) return { found: false }
      // ⚠️⚠️ PROJECTED, NOT THE RAW ROW — measured at **119,000 bytes per memory**, of which ~45,700 is
      // the `embedding` jsonb (and migration 019 has just added `embedding_hv` beside it, which would make
      // it worse). This object goes back to the MODEL as a tool result, so the raw row was spending a
      // large slice of her context window on float arrays she cannot use and did not ask for.
      // ⛔ Nothing downstream wanted them: the vectors are what the STORE searches with, never what a
      // reader reads. ⓘ The projection keeps every field a caller or a check actually reads.
      const { embedding, embedding_hv: _hv, slot_embedding: _slotVec, ...memoryView } = m
      const res = { found: true, memory: memoryView, source: m.source ?? null, sourceMessageId: m.source_message_id ?? null }

      // ⛔ UNATTESTED — no reference was ever recorded. Distinct from `destroyed`, and the distinction is
      // only preservable because a deleted source leaves the pointer DANGLING rather than nulled. See the
      // audit: an FK with ON DELETE SET NULL here would collapse the two.
      if (!m.source_message_id || !db.txn_messages) { res.evidenceState = 'source-never-recorded'; return res }

      const msg = await db.txn_messages.findOne({
        where: { id: m.source_message_id }, attributes: ['id', 'conversation_id', 'rolling_id', 'created_at'], raw: true,
      })
      // DESTROYED — the reference resolves to nothing. The memory survives; the loss is reported.
      if (!msg) {
        res.evidenceState = 'source-destroyed'
        res.note = 'source message no longer exists (deleted)'
        return res
      }

      // (2) ⭐ THE EVIDENCE — a SECOND, INDEPENDENT authorization. Owner of the source conversation, not
      // owner of the memory. Attributes are narrowed to the two columns the decision needs, so no title
      // and no content is loaded before the check that decides whether it may be seen.
      const conv = db.txn_conversations
        ? await db.txn_conversations.findOne({ where: { id: msg.conversation_id }, attributes: ['id', 'user_id', 'title'], raw: true })
        : null
      const sameScope = !!conv && conv.user_id === U
      // ⚠️ FAIL CLOSED. No conversation table, or a conversation whose owner cannot be established, means
      // NOT AUTHORIZED — the opposite of the fail-open rule that governs capability degradation
      // elsewhere in this file, and deliberately so: this decision is about disclosure, not capability.
      if (!sameScope) {
        res.evidenceState = 'source-unreadable'
        // Safe provenance only: WHEN, and whether it was here. ⛔ No title, no room name, no person name,
        // and no content.
        res.learnedOn = msg.created_at
        res.learnedHere = false
        // ── ⭐⭐⭐ P4 · THE HANDLE, AND ONLY THE HANDLE (2026-08-21) ────────────────────────────────
        //
        // ⚠️⚠️ THE GAP THIS CLOSES, AND IT IS THE THIRD TIME THIS EXACT SHAPE HAS APPEARED. This refusal
        // was correct, honest, and a DEAD END: it said the evidence exists and cannot be read, and gave
        // her nothing that could be authorized. So `recall_memory_source` could establish that a memory
        // came from somewhere unreadable and could go no further — the same G1 (no target) + G2 (no
        // request path) that stopped self-history before P1/P2. **A correct boundary, a correct refusal,
        // and no door.**
        //
        // Ote's direction, 2026-08-21: *"memory → source conversation handle → request_room_access →
        // inspect_around. Reuse the same navigation and authorization mechanism we already built for
        // self-history. Do not create a second memory-specific authorization system. The memory provenance
        // should tell her where the memory came from, but it must not automatically authorize access to
        // that source conversation."*
        //
        // ⭐ SO THIS IS ONE FIELD, NOT A SYSTEM. The handle is the same opaque conversation id the
        // self-history projection already hands out, so `request_room_access` and `inspect_around` serve
        // this direction with **no new code and no second grant type**.
        //
        // ⛔⛔ AND IT AUTHORIZES NOTHING. Holding a handle is the ability to ASK — the grant is still a
        // stored human answer to a fixed card, still root-only, still single-use, still scoped
        // from-room → into-conversation, and `inspectAround` still refuses without it. What changed is
        // that asking is now possible; what she may READ did not change at all.
        //
        // ⓘ AND IT WAS ALREADY LEAKING, INCONSISTENTLY — which is why "no conversation id" left this
        // comment rather than staying true. `res.memory` is the raw row, and `memory.source` literally
        // reads `conversation:<uuid>` for 11 of 36 memories (the extraction path writes it that way).
        // ⇒ P4 makes the handle DELIBERATE and uniform instead of an accident of which writer produced
        // the memory. That is a smaller change than it first looks, and a more honest one.
        res.sourceConversationHandle = msg.conversation_id
        res.note = 'the original conversation is not readable from here — the memory stands, its evidence '
          + 'cannot be inspected from this context. This is a boundary, not an absence: do not guess what it '
          + 'said. The handle identifies where it happened; reading it has to be authorized separately.'
        return res
      }

      // (3) AUTHORIZED. Now — and only now — content may be read, and only the window around the source.
      res.evidenceState = 'source-readable'
      res.learnedOn = msg.created_at
      res.learnedHere = true
      res.conversationId = msg.conversation_id
      res.conversationTitle = conv?.title ?? null
      const c = Math.max(0, Math.min(10, context))
      const window = await db.txn_messages.findAll({
        where: {
          conversation_id: msg.conversation_id,
          rolling_id: { [Op.between]: [msg.rolling_id - c, msg.rolling_id + c] },
        },
        order: [['rolling_id', 'ASC']],
        raw: true,
      })
      res.context = window.map((n) => ({
        role: n.role, content: String(n.content || '').slice(0, 600), at: n.created_at, isSource: n.id === msg.id,
      }))
      return res
    },

    // ── WRITES ───────────────────────────────────────────────────────────────────────────────
    async create(row = {}) {
      // ── ⭐⭐⭐ THE SELF-STATE GATE · EVERY LANE PASSES THROUGH HERE, WHICH IS WHY IT IS HERE ─────────
      //
      // ⚠️⚠️ MEASURED 2026-08-25. The distiller read one of her own messages narrating a search that found
      // nothing and wrote it as a durable semantic fact — *"their specific content was not preserved in
      // durable memory"* — `importance: 8`, in Ote's own room, about the one person he was asking about.
      // It then became the highest-authority item in her context on that subject and she reported it back.
      // ⭐ **A FALSE ABSENCE HAD BECOME A DURABLE BELIEF**, and §3B cannot date a stored row, so the one
      // mechanism built to stop her agreeing with her past self was structurally blind to it.
      //
      // ⭐⭐ THE GATE IS AT THE STORE BECAUSE THE GUARANTEE IS THE STORE'S. The extractor, the distiller,
      // the reflection lane and her own `remember_fact` are four writers; putting the rule in any one of
      // them leaves three doors open, and the fourth is written next month. ⓘ Same principle as
      // `setIdentity` converging in the store: *the datastore guarantees convergence, not the caller.*
      //
      // ⛔ IT REFUSES, IT DOES NOT REWRITE, and it never touches what she SAID — her messages are untouched
      // and still retrieve. What it refuses is one of them becoming a standing fact.
      // ⛔ AND IT IS LOUD. A silent drop here is indistinguishable from an extractor that found nothing,
      // which is exactly the ambiguity that hid a 4-in-5 fact drop once already.
      const gate = admissible(row)
      if (!gate.ok) {
        log?.warn?.({ reason: gate.reason, why: gate.why, kind: row?.kind, author: AUTHOR,
          content: String(row?.content ?? '').slice(0, 160) },
        '[memory] refused a durable row that asserts the state of her own memory')
        // ⭐ THROWN, NOT RETURNED NULL. Every caller of `create` treats the result as a row; handing back
        // null would surface as a confusing shape error three frames away, and a write that was refused
        // for a stated reason is not the same event as a write that failed.
        const err = new Error(`refused: a durable memory may not assert what her own memory contains (${gate.why})`)
        err.code = 'SELF_STATE_CLAIM'
        err.reason = gate.reason
        throw err
      }
      // ── ⭐⭐⭐ THE MODALITY SLOT GATE · 031 · SAME PLACE, SAME REASON AS THE GATE ABOVE ────────────
      //
      // Ote, 2026-08-26: *"figurative material should still be retainable, but it must not be flattened
      // into entity / attribute / value as though it were a literal fact."*
      //
      // ⛔ IT REFUSES RATHER THAN REWRITING, and the reason is measurable rather than stylistic: for a
      // fact row `content` is GENERATED FROM the slot — `7d383ce3`'s content is literally *"user's
      // current goal: build Rome in one day"* — so stripping entity/attribute/value would leave the
      // flattening intact in the prose and the fix would be cosmetic. The alternative, rewriting
      // `content` to the quoted span, is the store editing what a claim says, which is a larger power
      // than declining to store it.
      //
      // ⭐⭐ AND NOTHING IS LOST BY REFUSING, WHICH IS WHAT SETTLES IT. **His words are in `txn_messages`
      // permanently.** What is refused is a DERIVED assertion. The material stays reachable through the
      // message store, through `recall_memory_source`, and through her own `keep()` as prose if she
      // decides it matters — so *"still be retainable"* is satisfied by the prose route staying open.
      // ⛔ What is closed is the slot.
      //
      // ⓘ The DATABASE enforces this too (`txn_memories_modality_slot_ck`). This half is the loud one
      // that explains itself; that half survives a writer nobody has written yet.
      const slotWhy = slotViolation(row)
      if (slotWhy) {
        log?.warn?.({ modality: row?.modality, entity: row?.entity, attribute: row?.attribute, author: AUTHOR,
          content: String(row?.content ?? '').slice(0, 160) },
        '[memory] refused a non-literal statement written into a fact slot')
        const e2 = new Error(`refused: ${slotWhy}`)
        e2.code = 'MODALITY_SLOT'
        e2.reason = 'non-literal-in-slot'
        throw e2
      }
      // THE STORE STAMPS SCOPE — the component must not pass persona/user_id, and the
      // identity-is-persona-global rule is enforced here rather than trusted to every caller.
      // PRESERVE an explicit subject, otherwise DEFAULT it (see resolveSubjects above). `??` not `||`
      // so a caller can never be silently overridden, and so a deliberate null stays null.
      const subjects = await resolveSubjects()
      const isPersonaGlobal = row.kind === 'identity'
      // ⚠️ DEFAULT ONLY WHERE THE SUBJECT IS ACTUALLY KNOWN, which is narrower than it first looks.
      // The first version defaulted EVERY non-identity row to the account holder, and the
      // person-subject check caught it: a free-form `remember` carries `entity = null`, and the
      // real-world example of exactly that shape is
      //     "User's colleague Priya taught them the habit… she's sharper about root causes"
      // — a memory whose subject is NOT the account holder. Stamping Kavi on it would have been a
      // guessed subject, which is the one thing this column must never contain.
      //
      // So the rule matches migration 004's backfill exactly: `entity = 'user'` means the producer
      // already said this is about the account holder; anything else means we do not know, and NULL is
      // the honest record of not knowing. A third-party subject arrives explicitly or not at all.
      const subjectDefault = isPersonaGlobal ? subjects.persona
        : (row.entity === 'user' ? subjects.user : null)
      const created = await txn_memories.create({
        ...row,
        // ⭐⭐⭐ THE DERIVATION AXIS — what this row rests on, kept apart from the OCCASION it was written on.
        //
        // ⚠️⚠️ THE MEASURED FAILURE: `676e17b9` says *"we will build 'Rome' together as our shared project
        // and life's mission"* and its `source_message_id` points at a message from **sixteen days after**
        // the metaphor was coined. That id is a perfectly correct answer to *when was this written* and a
        // completely wrong answer to *what is this based on* — she was synthesising from memories already
        // in her context, not from that turn. ⇒ asking one column both questions is how a row comes to
        // cite a message that does not contain it.
        //
        // ⛔ AND IT RECORDS PRESENCE, NEVER USAGE. `in-context` means *these were in front of her when she
        // wrote this* — a fact — and deliberately not *she derived this from them*, which nothing here can
        // know. Manufacturing a derivation would be a small version of the failure this whole arc exists
        // to fix: an inference quietly acquiring an observation's authority.
        evidence: lineageFor(row),
        persona: P,
        // ⚠️ `user_id` MEANS TWO DIFFERENT THINGS DEPENDING ON THE AUTHOR, and migration 015's comment on
        // the column says so: for an account-authored row it is the owner; for a persona-authored one it is
        // the CONTEXT the memory was formed in. Same value, different job — which is why 015 needed no
        // data migration and why provenance came for free on all 35 existing rows.
        //
        // ⭐⭐⭐ 029: IT IS ALWAYS THE ROOM, AND NEVER NULL. This used to write `null` for an identity row
        // so that `visibleWhere`'s global arm would match it — ⛔ scope smuggled through the owner column.
        // That is the overload `auth/root-identity.js` named on 2026-08-06, and it cost the store the one
        // thing it could not afford to lose: WHERE a global memory was formed. `d211f5b4` had to have its
        // room recovered from its `source_message_id` chain because this line threw it away.
        // ⇒ the room is recorded, and reachability is declared separately, below.
        user_id: U,
        // ⭐ SCOPE IS DECLARED, NOT INFERRED. ⛔ `kind === 'identity'` remains the RULE for what is global
        // — that part was always right and is enforced here rather than trusted to every caller — but it
        // is now written into a column that means reachability and nothing else.
        scope: isPersonaGlobal ? 'persona_global' : 'room',
        // ⭐ OWNERSHIP FOLLOWS AUTHORSHIP. Declared by the writer at construction (see the header), never
        // inferred from `kind`, from the room, or from who happened to be logged in.
        author: AUTHOR,
        // ⛔ AND THE SUBJECT DEFAULT IS UNCHANGED, DELIBERATELY. It would be very easy to make a
        // persona-authored row default to `subjects.persona` — and that would be `ABOUT = OWNER`, the exact
        // error Ote corrected twice: *"a Sotera-owned lesson can absolutely be about Ote while still being
        // Sotera's memory."* A memory she authored ABOUT Ote has subject = Ote and author = persona.
        subject_person_id: row.subject_person_id ?? subjectDefault,
      })
      return created.get ? created.get({ plain: true }) : created
    },

    async update(ids, patch = {}) {
      // BY ID ONLY, never by predicate — a predicate is the component composing a query again.
      const list = Array.isArray(ids) ? ids.filter(Boolean) : (ids ? [ids] : [])
      if (!list.length) return 0
      const [n] = await txn_memories.update(patch, { where: { id: list } })
      return n
    },

    /**
     * ⭐⭐⭐ markContradicted — record that a memory was repudiated. Migration 030's write path.
     *
     * ⚠️⚠️ THE ABSENCE THIS CLOSES: `contradicted_by` has existed since migration 003 and has been
     * written **zero times in 92 rows**. `7d383ce3` was repudiated in conversation twenty minutes after
     * it was written and is still live seventeen days later. ⇒ the pipeline captured assertions and
     * silently dropped retractions — not by deciding against recording one, but because no path existed.
     *
     * ── ⭐ WHAT IT DOES AND DOES NOT DO ──────────────────────────────────────────────────────────
     * ⛔ It does NOT delete, rewrite, invalidate or re-word anything. The row keeps its content, its
     *    author, its confidence and its dates. It gains a pointer to the evidence and a timestamp.
     * ⛔ It does NOT set `invalid_at`. "Somebody said this is wrong" and "this was replaced" are two
     *    different states, and collapsing them would lose the ability to answer *why did I believe that?*
     * ⛔ It does NOT change what recall returns. That is an open decision as of 030 and is not this
     *    function's to make; nothing filters on `contradicted_at` yet.
     *
     * ⚠️ SCOPED LIKE EVERY OTHER WRITE. A row outside this store's scope reads as absent and cannot be
     * marked — a correction spoken in one room must not reach into another's beliefs.
     *
     * @param {object} o
     * @param {string} o.id             the memory being contradicted
     * @param {string} [o.byMessageId]  ⭐ the MESSAGE that repudiated it — the evidence
     * @param {string} [o.byMemoryId]   a later MEMORY that disputes it (rarer; see the model comment)
     * @returns {Promise<{ok:boolean, reason?:string, id?:string}>}
     */
    async markContradicted({ id, byMessageId = null, byMemoryId = null } = {}) {
      if (!id) return { ok: false, reason: 'no memory id' }
      // ⛔ A CONTRADICTION THAT CANNOT NAME ITS OPPONENT IS A FEELING. Migration 003 said so about
      // `contradicted_by`; it is just as true here. Refuse rather than mark a row on nothing.
      if (!byMessageId && !byMemoryId) return { ok: false, reason: 'a contradiction must name its evidence' }
      const row = await txn_memories.findOne({ where: { id }, raw: true })
      if (!inScope(row)) return { ok: false, reason: 'not found in this scope' }
      // ⭐ FIRST WINS, and re-marking is a no-op rather than an error. The earliest recorded
      // contradiction is the one that carries the correction; a later pass re-observing the same
      // repudiation must not overwrite when it happened.
      if (row.contradicted_at) return { ok: true, id, alreadyMarked: true, at: row.contradicted_at }
      const patch = { contradicted_at: new Date(now()) }
      if (byMessageId) patch.contradicted_by_message_id = byMessageId
      if (byMemoryId) patch.contradicted_by = byMemoryId
      const [n] = await txn_memories.update(patch, { where: { id } })
      return n ? { ok: true, id, at: patch.contradicted_at } : { ok: false, reason: 'update affected no row' }
    },

    async touch(ids) {
      // Recency bookkeeping, deliberately separate from `update`: this is telemetry, not a belief
      // change, and a failure here must never fail the read that triggered it.
      const list = Array.isArray(ids) ? ids.filter(Boolean) : (ids ? [ids] : [])
      if (!list.length) return
      try {
        await txn_memories.increment('access_count', { by: 1, where: { id: list } })
        await txn_memories.update({ last_access: new Date(now()) }, { where: { id: list } })
      } catch (e) {
        log?.debug?.({ err: e?.message }, '[memory.store] touch failed (non-fatal)')
      }
    },
  }
}
