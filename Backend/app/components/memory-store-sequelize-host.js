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

const LIVE = { invalid_at: null, expired_at: null }
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

  /** VISIBLE: mine ∪ persona-global identity. `kind` narrows; identity is always user_id null. */
  const visibleWhere = (kind, namespace) => {
    const base = { ...LIVE, persona: P, ...(namespace ? { namespace } : {}) }
    if (kind) return { ...base, kind, user_id: kind === 'identity' ? null : U }
    return {
      ...base,
      [Op.and]: [{ [Op.or]: [{ user_id: U, kind: OWNED_KIND_OR_UNCLASSIFIED }, { user_id: null, kind: 'identity' }] }],
    }
  }

  /** In scope to READ this row? Mine, or persona-global. Mirrors visibleWhere for single-row fetches. */
  const inScope = (row) => !!row && (row.user_id === U || row.user_id === null)

  return {
    // ── READS ────────────────────────────────────────────────────────────────────────────────
    async findVisible({ kind = null, namespace = null } = {}) {
      return txn_memories.findAll({ where: visibleWhere(kind, namespace), order: [['created_at', 'DESC']], raw: true })
    },

    async findOwnLive({ kind = null, namespace = null } = {}) {
      return txn_memories.findAll({
        where: { ...LIVE, persona: P, user_id: U, ...(kind ? { kind } : {}), ...(namespace ? { namespace } : {}) },
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
          [Op.and]: [{ [Op.or]: [{ user_id: U }, { user_id: null, kind: 'identity' }] }],
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
        const where = ['persona IS NOT DISTINCT FROM :persona', 'invalid_at IS NULL', 'expired_at IS NULL']
        repl.persona = P
        if (namespace) { where.push('namespace = :ns'); repl.ns = namespace }
        if (kind) {
          where.push('kind = :kind AND user_id IS NOT DISTINCT FROM :su')
          repl.kind = kind; repl.su = kind === 'identity' ? null : U
        } else {
          // ⭐ `OR kind IS NULL` — the same no-kind-is-still-mine rule as visibleWhere; see
          // OWNED_KIND_OR_UNCLASSIFIED at the top of this file. An allowlist silently excludes NULL, and a
          // memory she wrote without a tier would have been searchable by nothing.
          where.push("((user_id IS NOT DISTINCT FROM :u AND (kind IN ('episodic','semantic','card') OR kind IS NULL)) OR (user_id IS NULL AND kind = 'identity'))")
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
     * `evidenceState`: `verified` · `attested` · `destroyed` · `unattested`. The one that did not exist
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
      if (!m.source_message_id || !db.txn_messages) { res.evidenceState = 'unattested'; return res }

      const msg = await db.txn_messages.findOne({
        where: { id: m.source_message_id }, attributes: ['id', 'conversation_id', 'rolling_id', 'created_at'], raw: true,
      })
      // DESTROYED — the reference resolves to nothing. The memory survives; the loss is reported.
      if (!msg) {
        res.evidenceState = 'destroyed'
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
        res.evidenceState = 'attested'
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
      res.evidenceState = 'verified'
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
        persona: P,
        // ⚠️ `user_id` MEANS TWO DIFFERENT THINGS DEPENDING ON THE AUTHOR, and migration 015's comment on
        // the column says so: for an account-authored row it is the owner; for a persona-authored one it is
        // the CONTEXT the memory was formed in. Same value, different job — which is why 015 needed no
        // data migration and why provenance came for free on all 35 existing rows.
        user_id: isPersonaGlobal ? null : U,
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
