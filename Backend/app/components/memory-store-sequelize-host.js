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
import { resolveSlotQuestion } from './memory-declaration-host.js'
import { checkKind, KIND_OUTCOME } from './memory-kind-precondition.js'
import { checkConsumingOccasion } from './memory-bind-rules.js'
import { governsReplacement, REPLACEMENT } from './memory-replacement-gate.js'
// ⭐⭐⭐ THE OWNERSHIP BOUNDARY — what ordinary semantic memory does NOT own. Ote, 2026-08-26: *"make it
// know what it does not own instead of corrupting the meaning to fit the storage it happens to have."*
// ⛔ The judgement is in the predicate; this file holds only the enforcement and the recording.
import { admissibleToSlot } from './memory-ownership-boundary.js'
import { recordRefusal, describeRefusal } from './memory-refusal-record.js'
import { tracedMemoryIds } from './memory-retrieval-trace.js'
// ⭐ 049 · THE FOUR AXES — writer contracts (occasion · reachability · declared coincidence) and provenance references.
import { contractFor, normalizeAct, normalizeReach, actKey, consumingOccasionFor, COINCIDENCE, VERIFICATION, WRITER as WRITER_KIND } from './memory-writer-contracts.js'
import { createReferences, provenanceFor, saidFor, spanAppears } from './memory-evidence.js'
// ⓘ D1 Phase-3 preparation only, and only under SOTERA_WRITER_TRACE — see the undeclared-write warn below.
import { appendFileSync as fsAppend } from 'node:fs'
// ⭐ 035 · THE ONE LEGAL WAY TO ASK "IS THIS ROOM ROOT'S?" — config-defined, and that module's whole
// point is what it REFUSES to look at. ⛔ Root-ness must never be inferred from a NULL role or a missing
// id here, any more than it may be anywhere else.
import { isRootConnectedUser } from '../auth/root-identity.js'

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
export function createSequelizeMemoryStore({ db, persona = null, userId = null, author = 'account', scope = 'room', sourceText = null, occasion = null, writer = null, act = null, reach = null, config = null, log = null, now = () => Date.now() } = {}) {
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

  // ── ⭐⭐⭐ 035 · SCOPE IS DECLARED AT CONSTRUCTION, EXACTLY AS AUTHOR IS ────────────────────────
  //
  // ⭐ THE SHAPE IS NOT A CHOICE, IT IS THE ONE THIS FILE ALREADY ARGUES FOR, six lines above: *"the
  // author must arrive with the write, not be assigned by whoever remembers to"*. A per-row `scope`
  // field would have to survive `makeObservation`'s common shape, `normalizeObservation`, the resolver
  // router and `commitToMemory`'s explicit arg list — FOUR allowlists, each of which is an instance of
  // the defect this project has now recorded eleven times. ⛔ Declaring it once, on the store that means
  // it, has no allowlist to survive.
  //
  // ⚠️ AND THE DEFAULT IS THE STATUS QUO, in the safe direction 029 already chose: *"a row that forgets
  // to declare its scope becomes reachable from ONE room, never from all of them — the failure direction
  // that LOSES a memory rather than the one that LEAKS it."*
  if (scope !== 'room' && scope !== 'persona_global') {
    throw new TypeError(`createSequelizeMemoryStore: scope must be 'room' or 'persona_global', got ${JSON.stringify(scope)}`)
  }
  const DECLARED_SCOPE = scope

  // ── ⭐⭐⭐ THE OCCASION'S OWN WORDS — what a claim was read FROM (M2-14 / ④) ────────────────────
  //
  // ⚠️⚠️ THE MEASURED DEFECT: `here he come. "Hi, Sotera. I'm Cogito. I'm your uncle."` — typed by Ote,
  // QUOTING somebody else — became `preferred_name = "Cogito"` on HIS account. ⭐ The check that catches
  // it has been shipped since 032 and its comment names this exact sentence — but `admissibleToSlot`
  // *"RETURNS null WHEN IT CANNOT SEE"*, and nothing ever handed it the text. ⇒ the boundary was not
  // wrong; it was BLIND.
  //
  // ⭐ It rides construction beside `author` and `scope` for the same reason: a pipeline is built for ONE
  // OCCASION and an occasion has one text, so there is no allowlist to survive and no field for four
  // hops to drop. ⛔ A per-row value still wins where a producer sets one — this is the fallback, never
  // an override.
  //
  // ⛔ AND IT IS THE ASSERTED TEXT, NEVER THE RAW TURN. Ote: *"Thread asserted.text, not the raw turn."*
  // The assertion gate has already removed material the account holder was HANDLING rather than saying;
  // using the raw turn would let a pasted document's contents count as the author's own words, which is
  // the very confusion this is here to end.
  // ⓘ For the model-tool path this stays NULL by design (M2-15, locked): the only text reachable there
  // answers *when* a memory was written, never *what it rests on*.
  const SOURCE_TEXT = sourceText == null ? null : String(sourceText)

  // ── ⭐⭐⭐ THE CONSUMING OCCASION — one identifier space, two legitimate origins ────────────────
  //
  // Ote, ratifying 2026-09-04: *"consuming occasion = turn key = source_message_id, construction-scoped
  // and therefore not caller-manufacturable on the reconcileFact path… For an in-turn act the occasion
  // must be the authenticated turn key; the writer must not be able to manufacture another identifier."*
  //
  // ⭐ It rides CONSTRUCTION beside `author`, `scope` and `sourceText`, for the reason this file already
  // argues twice above: a pipeline is built for ONE OCCASION, so there is no allowlist to survive and no
  // hop to drop it. ⛔ And a caller that could name its own occasion per write could declare a question
  // inside the very pass that consumes it, which is the whole thing the rule exists to prevent.
  //
  // ── ⭐⭐ TWO ORIGINS, ⛔ NOT TWO TYPES ────────────────────────────────────────────────────────────
  //   IN A TURN         the turn key — `row.source_message_id`, set by the service from ITS construction
  //   AN OPERATOR ACT   a named occasion, exactly as the canary's DECLARE and BIND already carry
  //
  // ⚠️ The row's own turn key WINS where there is one: an operator-named occasion is the fallback for an
  // act that genuinely has no turn, ⛔ never an override for one that does.
  const OCCASION = occasion == null ? null : String(occasion)
  // ══ ⭐⭐⭐ 049 · THE FOUR AXES, declared ONCE at construction by the host that knows which occasion it serves ═══════
  //   WRITER   the contract key — ⛔ never derived from `source`'s prefix
  //   ACT      the identity of this memory act (a turn · a pass · a ruling) — a PASS writer may not write without one
  //   REACH    the material the act worked from — a pass writer's material is a RANGE, never a point
  // A malformed act or reach THROWS here (normalizeAct / normalizeReach): an axis is never guessed into shape.
  const WRITER = writer == null ? null : String(writer)
  const CONTRACT = contractFor(WRITER ?? WRITER_KIND.unknown)
  const ACT = normalizeAct(act)
  const REACH = normalizeReach(reach)
  const ACT_KEY = actKey(ACT)

  // ── ⭐⭐⭐ AND THE AUTHORITY IS DERIVED HERE, ⛔ NEVER ACCEPTED AS A CLAIM ──────────────────────
  //
  // Ote, 2026-09-02: *"Root: always authorized. Explicit account permission: authorized when the account
  // has the dedicated permission… No permission: REFUSE."* ⛔ *"Never downgrade an unauthorized global
  // write into room scope."*
  //
  // ⭐ Both halves are DERIVED from things this store already holds — config, and the room id `U` — so
  // there is no `authorized: true` parameter for a caller to get wrong or a test to fake. That is the
  // difference between this and `author`: authorship is a DECISION the caller is entitled to make;
  // authority is a FACT the caller is not.
  //   · root      `isRootConnectedUser(config, U)` — config-defined. ⛔ NEVER from a NULL role, a missing
  //               id, or any other shape of account data (nine recorded sites, one of which turned an
  //               unowned row into a privilege grant).
  //   · granted   `mst_users.persona_global_write === true` — the standing grant (035).
  //
  // ⚠️ FAILS CLOSED IN EVERY DIRECTION. No config, no db, no row, a thrown query, a non-boolean value —
  // all read as NOT authorized. ⛔ An authority that can be satisfied by an absence is not an authority.
  let globalAuthCache = null
  const resolveGlobalAuthority = async () => {
    if (globalAuthCache) return globalAuthCache
    if (config && U && isRootConnectedUser(config, U)) {
      globalAuthCache = { ok: true, via: 'root' }
      return globalAuthCache
    }
    let granted = false
    try {
      if (U && db.mst_users) {
        const row = await db.mst_users.findOne({ where: { id: U }, attributes: ['persona_global_write'] })
        granted = row?.persona_global_write === true
      }
    } catch (e) {
      // ⛔ A failed lookup is NOT a grant. Logged loudly, because "the permission check broke" and
      // "the account has no permission" are the same refusal but very different operational facts.
      log?.error?.({ err: e?.message, userId: U }, '[memory] could not read the persona-global write grant — refusing')
      granted = false
    }
    globalAuthCache = granted ? { ok: true, via: 'standing_grant' } : { ok: false, via: null }
    return globalAuthCache
  }

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
    // ⭐ 049 · the ACT key first — two passes used to share `top.id` and would have shared each other's in-context trace
    const turnKey = ACT_KEY ?? row?.source_message_id ?? null
    if (!turnKey || derivedFromOf(row?.evidence)) return row?.evidence ?? null
    const mech = mechanismOf(row?.source)
    // ⭐ Synthesis lanes only. `document`, `consolidation` and `episode` describe their own derivation
    // already and know it better than a presence record does.
    if (mech !== MECHANISM.modelTool && mech !== MECHANISM.unrecorded) return row?.evidence ?? null
    const memoryIds = tracedMemoryIds(turnKey)
    if (!memoryIds.length) return row?.evidence ?? null
    return withDerivedFrom(row.evidence, derivedFrom({ basis: BASIS.inContext, memoryIds, via: 'turn-retrieval' }))
  }

  /**
   * ⭐⭐ THE ADMITTING QUESTION — the third gate, beside `admissibleToSlot` and `slotViolation`.
   *
   * ⭐ This is the ONLY place an admission can be captured, because `reconcileFact` is the only path that
   * resolves a slot: a row with no `slot_id` has no slot, and a slot is what carries a question.
   * ⓘ Measured 2026-09-03: 49 of 104 slot-shaped rows have no slot at all.
   *
   * ⛔ RESOLVE makes no judgement and this makes no decision about the write — it answers one question
   * (*was this row admitted under a declared question, and which?*) and returns null when it was not.
   */
  const slotGovernanceFor = async (row) => {
    const slotId = row?.slot_id ?? null
    const claimKind = row?.claimKind ?? null
    // ⭐ NOT IN SCOPE, and cheaply: a row with no slot has no question, so there is nothing to govern and
    // nothing to pin. ⛔ This is not a DEFER — the gate does not apply.
    if (!slotId) return { resolved: null, pin: null, selfAuth: null }
    try {
      const { schema: sch } = txn_memories.getTableName()
      if (!sch) return { resolved: null, pin: null, selfAuth: null }
      const q = async (sql, params = []) => ({
        rows: await txn_memories.sequelize.query(sql, { bind: params, type: 'SELECT' }),
      })
      const resolved = await resolveSlotQuestion({ query: q, schema: sch, slotId })
      // ⭐ An UNDECLARED namespace leaves `slotGoverned` null ⇒ not governed YET ⇒ no pin, no gate.
      if (!resolved || resolved.slotGoverned !== true) return { resolved, pin: null, selfAuth: null }
      // ⛔⛔ AND `slotGoverned` IS A NAMESPACE PROPERTY, ⛔ NOT A SLOT ONE — it is TRUE for every slot in
      // `default`, bound or not. ⚠️ Wiring the self-authorisation rule on it alone made every ordinary
      // write in the whole namespace answerable to a question nobody had declared, and an occasion-less
      // ordinary `keep` started failing `SELF_AUTHORISED_QUESTION`. ⭐ That is the outage 031 named,
      // rebuilt through a new door, and two unrelated suites caught it inside one run.
      // ⇒ A SLOT WITH NO DECLARED QUESTION IS NOT GOVERNED YET, so no self-authorisation question can
      // arise about it. Same distinction the replacement gate already draws between NOT-IN-SCOPE and
      // GOVERNED — ⛔ it just was not applied here.
      if (!resolved.slotKind) return { resolved, pin: null, selfAuth: null }

      // ── ⭐⭐⭐ THE SELF-AUTHORISATION RULE, AT THE CONSUMER (wired 2026-09-04) ──────────────────
      //
      // *Neither the DECLARE nor the BIND that makes a question operative may share the occasion that
      // consumes it.* ⭐ `resolveSlotQuestion` has always RETURNED both occasions; ⛔ this function used
      // to discard them, so the ratified rule was proven in RP-D0 and enforced NOWHERE. That is the
      // discarded-evidence mechanism, in the one place it most mattered.
      //
      // ⚠️ AND THE INPUT IS NOT MANUFACTURABLE HERE. `reconcileFact` — the ONLY path that resolves a slot
      // — writes `source_message_id` from ITS construction-time constant and accepts no argument for it.
      // ⇒ what a model asks for cannot change which occasion it is judged in.
      // ⭐ 049 · the ACT key first (a pass is its own occasion, ⛔ not its newest message); beneath it the ratified legacy order
      const consumingOccasion = consumingOccasionFor({ act: ACT, legacyMessageId: row?.source_message_id ?? null, occasionLabel: OCCASION })
      const selfAuth = checkConsumingOccasion({
        consumingOccasion,
        declaredInOccasion: resolved.declaredInOccasion,
        boundInOccasion: resolved.boundInOccasion,
      })
      // ⛔⛔ NO PIN FOR A SELF-AUTHORISED ADMISSION. The pin says *"admitted under this question"*; if the
      // question was declared or bound by this very act, that admission is not one this row may cite.
      if (!selfAuth.ok) return { resolved, pin: null, selfAuth }

      const verdict = (typeof claimKind === 'string' && claimKind.trim())
        ? checkKind({ slotKind: resolved.slotKind, claimKind })
        : null
      return { resolved, selfAuth, pin: verdict?.outcome === KIND_OUTCOME.allow ? resolved.questionId : null }
    } catch (e) {
      // ⛔ A pin is a RECORD, never a permission — failing to compute one must not fail a write. And it
      // fails to NULL, which already means "no kind gate was applied", so nothing is misreported.
      // ⚠️ BUT IT MUST NOT BE SILENT. `log` is optional on this factory, so a store built without one
      // would swallow this entirely — and a swallowed failure that writes NULL is indistinguishable from
      // a gate that correctly declined. That ambiguity cost this project a 4-in-5 fact drop once already,
      // so the console is the floor when no logger was wired.
      const msg = `[memory] could not resolve the admitting question — writing NULL: ${e?.message}`
      if (log?.warn) log.warn({ err: e?.message }, msg); else console.warn(msg)
      return { resolved: null, pin: null, selfAuth: null }
    }
  }

  /**
   * ⭐⭐⭐ ATTACH THE TWO LOCAL DATES a model-facing memory may honestly carry. ⛔ Adds nothing else.
   *
   * ── ⚠️⚠️ THREE TIMES, THREE DIFFERENT FACTS ──────────────────────────────────────────────────
   *   `txn_messages.created_at`  ⭐ WHEN IT WAS SAID     — the account holder spoke on that date
   *   `txn_memories.created_at`  ⭐ WHEN IT WAS RECORDED — Sotera wrote it down then
   *   the EVENT's own time       ⛔ **NOT REPRESENTED**, and ⛔ never inferred from either
   *
   * ⚠️ THEY GENUINELY DIVERGE, MEASURED: of 72 live rows with a source turn, three were recorded more
   * than a day after it and one by **23.6 DAYS** — the Rome reconciliation read an August turn and wrote
   * a September row. ⇒ returning the row's date as *"when you told me"* would be a NEW falsehood.
   *
   * ⛔ `valid_at` IS DELIBERATELY NOT USED: it equals `created_at` on 72 rows and holds a genuine
   * "true since" on 34 (`doc:` ingest, the file's commit date). One field cannot be both.
   *
   * ── ⭐⭐⭐ AND THE TIMEZONE IS **EXPLICIT**, because "local" turned out not to be a stable idea ─────
   * ⚠️⚠️ MEASURED, and it cost two red runs to find: `::date` renders in the CONNECTION'S session
   * timezone, and the two clients disagree — `psql` reports `Asia/Bangkok`, **Sequelize reports UTC**.
   * The Rome turn is `2026-08-10 03:19+07`: the **10th** to the person who typed it, the **9th** in UTC.
   * ⇒ a bare `::date` would have told her *"you said this on the 9th"* about 3am on the 10th, HIS time —
   * ⛔ exactly the off-by-one this field exists to remove, arriving through the fix for it.
   *
   * ⇒ ⭐⭐ SO THE ZONE IS NAMED IN THE QUERY rather than inherited. A date is a fact about the person's
   * day, and inheriting it from whichever driver happens to connect is not a decision anyone made.
   *
   * ⚠️ THE ZONE USED IS THE DEPLOYMENT'S, ⛔ NOT THE INDIVIDUAL USER'S. There is no per-account timezone
   * column; this server runs in the account holder's own zone, so today the two coincide. ⓘ For a user in
   * a different zone the date could be a day out — a REAL residual, recorded rather than hidden.
   *
   * ⓘ AND THE PRECEDENT HAS THIS BUG: `recall_own_memory.decidedOn` is a bare `created_at::date` through
   * Sequelize, so it renders in UTC and is a day early for anything before 07:00 local. ⛔ Not fixed here
   * — it is a different field, ratified as unchanged, and correcting it is its own decision.
   *
   * ⓘ ONE extra query per read, so the main read's shape is untouched. ⛔ On failure it attaches nothing
   * and the projection carries no date — "we could not establish when" must be visible, ⛔ never guessed.
   */
  /**
   * ⭐ THE ZONE A DATE IS RENDERED IN — the deployment's own, read once and named in the query.
   * ⛔ NOT the database session's: `psql` and Sequelize disagree (Bangkok vs UTC), so inheriting it makes
   * the answer depend on which driver connected. ⚠️ `UTC` only if the host cannot say, which is honest
   * rather than silently wrong.
   */
  const DISPLAY_TZ = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
  })()

  const withLocalDates = async (rows) => {
    if (!Array.isArray(rows) || !rows.length) return rows
    const ids = rows.map((r) => r?.id).filter(Boolean)
    if (!ids.length) return rows
    try {
      const { schema: sch } = txn_memories.getTableName()
      const got = await txn_memories.sequelize.query(
        `SELECT m.id::text AS id, (m.created_at AT TIME ZONE :tz)::date::text AS recorded_on
           FROM "${sch}"."txn_memories" m
          WHERE m.id = ANY(ARRAY[:ids]::uuid[])`,
        { replacements: { ids, tz: DISPLAY_TZ }, type: txn_memories.sequelize.QueryTypes.SELECT, logging: false },
      )
      // ⭐⭐⭐ 049 · `said` IS GROUNDED IN PROVENANCE, ⛔ NOT IN THE OCCASION POINTER (I4, F5). The legacy pointer meant
      // three different things by writer; it is no longer an input here. `said_on` is the ONE day of the established
      // account-holder TURN references — several days ⇒ withheld; none ⇒ absent, and the projection falls to `recorded`.
      const saidBy = await saidFor(db, ids, { tz: DISPLAY_TZ })
      const by = new Map(got.map((d) => [String(d.id), d]))
      for (const r of rows) {
        const d = by.get(String(r.id))
        if (!d) continue
        r.recorded_on = d.recorded_on
        const said = saidBy.get(String(r.id))
        if (said) r.said_on = said
      }
    } catch (e) {
      const msg = `[memory] could not resolve local dates — memories will carry no date: ${e?.message}`
      if (log?.warn) log.warn({ err: e?.message }, msg); else console.warn(msg)
    }
    return rows
  }

  return {
    // ── READS ────────────────────────────────────────────────────────────────────────────────
    async findVisible({ kind = null, namespace = null } = {}) {
      // ⭐ THE ONE READ EVERY MODEL-FACING PROJECTION DRAWS FROM — `list`, `recall` and `search` all reach
      // the model through `candidates()`/`retrieve()`, and both call this. ⇒ attaching the dates HERE is
      // why `recall_memory` and `list_memories` agree BY CONSTRUCTION, ⛔ not by two edits staying in step.
      return withLocalDates(await txn_memories.findAll({
        where: visibleWhere(kind, namespace), order: [['created_at', 'DESC']], raw: true,
      }))
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
    /**
     * ⭐⭐⭐ 049 · ONE POINTER, TWO QUESTIONS — answered SEPARATELY now.
     *   MATERIAL   (reachability) what the writing act worked from: a turn, a RANGE, a document, or none — with the
     *              legacy pointer's `reviewed` flag: inside the act's range ⇒ true; outside ⇒ REACHABLE BUT UNREVIEWED.
     *   EVIDENCE   (provenance) the references the row rests on — 0..n, each resolving its own speaker and date.
     *              Zero ⇒ `provenanceEstablished:false`, `speaker:'not established'`.
     * The legacy fields (`evidenceState`, `sourceMessageId`, `context`, `learnedOn`) are kept unchanged for compat; ⛔ the
     * description no longer calls the pointer "the message it was saved from".
     */
    async getSource(args = {}) {
      const res = await this._getSourceLegacy(args)
      if (!res?.found) return res
      const m = res.memory ?? {}
      let srcRid = res.sourceRollingId ?? null
      if (srcRid == null && m.source_message_id && db?.txn_messages) {
        const t = await db.txn_messages.findOne({ where: { id: m.source_message_id }, attributes: ['rolling_id'], raw: true })
        srcRid = t?.rolling_id ?? null
      }
      const material = (() => {
        switch (m.reach_kind) {
          case 'turn': return { kind: 'turn', conversationId: m.reach_conversation_id ?? null, messageId: m.reach_message_id, reviewed: m.source_message_id ? String(m.source_message_id) === String(m.reach_message_id) : null }
          case 'range': return { kind: 'range', conversationId: m.reach_conversation_id, from: m.reach_from_rolling_id, to: m.reach_to_rolling_id, reviewed: srcRid == null ? null : (srcRid >= m.reach_from_rolling_id && srcRid <= m.reach_to_rolling_id) }
          case 'document': return { kind: 'document', document: m.reach_document }
          case 'none': return { kind: 'none' }
          default: return { kind: null, note: 'reachability not recorded for this row' }
        }
      })()
      let prov = { established: false, references: [] }
      try { prov = (await provenanceFor(db, [m.id], { tz: DISPLAY_TZ })).get(String(m.id)) ?? prov } catch { /* references unavailable ⇒ not established, said in words below */ }
      const speakers = new Set(prov.references.filter((r) => r.kind === 'turn' && r.established && r.speaker).map((r) => r.speaker))
      return {
        ...res,
        material,
        evidence: prov.references,
        provenanceEstablished: prov.established,
        speaker: speakers.size === 1 ? [...speakers][0] : (speakers.size > 1 ? 'mixed' : 'not established'),
        occasionMessageId: m.source_message_id ?? null,
        // ⓘ the caution is owed only where there is MATERIAL that could be mistaken for evidence; a row with no pointer and
        //    no reach keeps the legacy shape (evidenceState source-never-recorded, no note) — nothing is there to mislabel
        note: (prov.established || (!m.source_message_id && !m.reach_kind)) ? res.note
          : `${res.note ? res.note + ' ' : ''}No evidence reference is recorded for this memory: its provenance is NOT established. The material below is what the writing act worked from, not evidence that anyone said this.`,
      }
    },
    async _getSourceLegacy({ id, context = 2 } = {}) {
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
      // ── ⭐⭐⭐ THE OWNERSHIP BOUNDARY · 032 · THIRD GATE, SAME PLACE, SAME REASON ───────────────
      //
      // ⭐⭐ ONE TEST GENERATES ALL FIVE REFUSALS: **does a later statement REPLACE this one, or ACCUMULATE
      // beside it?** Properties replace — which is exactly what `entity/attribute/value` and
      // reconcile-in-place are for. Intentions, relationships and designations ACCUMULATE, and forcing
      // them through a replacing slot is why `02b095e5` superseded the family lineage instead of
      // extending it.
      //
      // ⛔ A REFUSAL IS NOT A DELETION. The material stays in `txn_messages`, and 032 keeps the proposed
      // content too — what is refused is the property-shaped representation, never the words.
      // ⭐ And the refusal is RECORDED: a dropped observation and one that was never made must not look
      // alike, which this project has paid for three times.
      const refusal = admissibleToSlot(row, {
        target: row.semanticTarget ?? null,
        // ⭐ the row's own value wins; the occasion's text is the FALLBACK (see SOURCE_TEXT above).
        sourceText: row.sourceText ?? SOURCE_TEXT,
        subjectEstablished: row.subjectEstablished ?? null,
      })
      if (refusal) {
        const recorded = await recordRefusal(db, { refusal, row, userId: U, persona: P, author: AUTHOR, act: ACT, log })
        log?.warn?.({ class: refusal.class, belongsTo: refusal.belongsTo, destinationExists: refusal.destinationExists,
          recorded, entity: row?.entity, attribute: row?.attribute },
        `[memory] ${describeRefusal(refusal)}`)
        const e3 = new Error(describeRefusal(refusal))
        e3.code = 'OWNERSHIP_BOUNDARY'
        e3.reason = refusal.class
        e3.refusal = refusal
        e3.recorded = recorded
        throw e3
      }
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
      // ── ⭐⭐⭐ THE PERSONA-GLOBAL GATE · 035 · FOURTH GATE, SAME PLACE, SAME REASON ──────────────
      //
      // ⚠️⚠️ WHY A WRITE NEEDS A GATE AT ALL, WHEN THE OTHER THREE GUARD MEANING: this destination is
      // UNIVERSALLY READABLE. `own-memory-host` reads her self-memory as `WHERE scope='persona_global'`
      // with no author, user or room filter — because that is what 029 defines the scope to MEAN. ⇒ a
      // persona_global write is the one write in this store whose effect is not confined to the room it
      // happened in, and Ote's word for that is *"Sotera's globally reachable self-state"*.
      //
      // ⛔ IT REFUSES, IT NEVER DOWNGRADES. Ote: *"Never downgrade an unauthorized global write into room
      // scope."* ⭐ A silent downgrade would file the memory somewhere the writer did not ask for and
      // report success — the same shape as the swallow M2-17 just removed one layer up.
      //
      // ⛔ AND THE GATE IS HERE, beside the other three, for the reason the self-state gate states: the
      // extractor, the distiller, the reflection lane and her own tools are four writers, and a rule
      // placed in any one of them leaves three doors open.
      if (DECLARED_SCOPE === 'persona_global') {
        // ⭐ AUTHOR FIRST, because it is the cheaper check and the more fundamental error. A global row
        // authored by the ACCOUNT is a contradiction, not merely a permission problem: it publishes one
        // person's claim into everyone else's room. ⓘ Both legacy rows in this destination are exactly
        // that shape — first-person self-claims carrying `author='account'` — which is why this is a
        // refusal and not a default.
        const authority = AUTHOR !== 'persona'
          ? { cls: 'persona-global-requires-persona-author',
            why: 'a memory reachable from every room must be hers — author=persona (mine:true), not the account holder\'s' }
          : (await resolveGlobalAuthority()).ok
            ? null
            : { cls: 'persona-global-unauthorized-room',
              why: 'this room may not write memory that is reachable from every room — root, or an account holding the persona-global write grant, is required' }
        if (authority) {
          const refusal = {
            class: authority.cls,
            why: authority.why,
            belongsTo: null,
            destinationExists: true, // ⭐ the destination is real and reachable; the AUTHORITY is what is missing
            destinationNote: 'scope=persona_global exists (029); this refusal is about who may write it (035)',
            retainAs: 'room', // ⛔ a SUGGESTION for the writer, ⛔ never applied here — see "refuses, never downgrades"
          }
          const recorded = await recordRefusal(db, { refusal, row, userId: U, persona: P, author: AUTHOR, act: ACT, log })
          log?.warn?.({ class: refusal.class, author: AUTHOR, recorded, entity: row?.entity, attribute: row?.attribute },
            `[memory] refused a persona-global write: ${refusal.why}`)
          const e4 = new Error(`refused: ${refusal.why}`)
          e4.code = 'PERSONA_GLOBAL_SCOPE'
          e4.reason = refusal.class
          e4.recorded = recorded
          throw e4
        }
      }

      // THE STORE STAMPS SCOPE — the component must not pass persona/user_id, and the
      // identity-is-persona-global rule is enforced here rather than trusted to every caller.
      // PRESERVE an explicit subject, otherwise DEFAULT it (see resolveSubjects above). `??` not `||`
      // so a caller can never be silently overridden, and so a deliberate null stays null.
      const subjects = await resolveSubjects()
      // ⭐⭐ 035: the destination is now DECLARED as well as inferred. ⛔ 029's rule is UNCHANGED and
      // deliberately kept first — `kind = 'identity'` still means persona-global, because that is what it
      // was written to mean and Ote asked for no silent redefinition. What is NEW is the second arm: a
      // caller may now ASK for the destination, and having asked, can be REFUSED (the gate above).
      // ⇒ before this, scope could only be acquired as a side effect of another axis, which is how the
      // two legacy rows in the destination got there.
      const isPersonaGlobal = row.kind === 'identity' || DECLARED_SCOPE === 'persona_global'
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
      // ⚠️ THE BOUNDARY'S INPUTS ARE TRANSPORT, NOT COLUMNS. `semanticTarget`, `sourceText` and
      // `subjectEstablished` are how a producer DECLARES what it knows; none of them is a field on this
      // table, and letting them through would either be silently dropped by the ORM (the
      // `subject_person_id` failure, which cost seven memories) or rejected. Stripped explicitly.
      // ⚠️⚠️ `claimKind` IS TRANSPORT TOO, AND ITS NAME IS A TRAP WORTH SPELLING OUT: `row.kind` on this
      // table is `semantic`/`identity` — a NAMESPACE-ish axis — and has nothing to do with *what question
      // a claim answers*. Two different facts, and one of them would silently answer for the other if the
      // producer's kind arrived under that name.
      const { semanticTarget: _st, sourceText: _sx, subjectEstablished: _se, claimKind: _ck, ...persistable } = row
      // ⭐⭐⭐ THE ADMISSION PIN (048 · ruling ③). The question a row was admitted under is recorded ON THE
      // ROW, in the same statement that writes it — ⛔ never looked up later, because a later lookup
      // follows the slot to whatever it points at NOW, and that misreading is the whole reason the column
      // exists. M2-10 stops a superseded question from RE-VALIDATING a row; it does not stop one from
      // being MISREAD after a repoint.
      //
      // ⛔⛔ AND THIS DOES NOT REFUSE ANY WRITE. `checkKind` is a precondition on REPLACEMENT — whether an
      // incoming claim may be treated as answering the slot's question — and M2-10 already ruled its DEFER
      // "a consumer-side restriction, not a slot-level disablement". ⓘ No writer declares a claim kind
      // today, so refusing here would refuse every existing writer, which is 031's exact rule: not a
      // protection, an outage. ⇒ the gate's ALLOW is what earns the pin; anything else leaves it NULL.
      //
      // ⭐ NULL therefore means exactly one thing — *no kind gate was applied to this row* — and never
      // "admitted under the slot's current question".
      const governance = await slotGovernanceFor(row)
      // ⭐⭐⭐ THE REPLACEMENT AUTHORITY (ratified 2026-09-03). `supersedes_id` present IS the UPDATE
      // signal at this seam — and this is the ONLY place it can sit: `reconcileFact`'s NOOP/DUPLICATE
      // branch returns BEFORE `create` is called, so a collapse can never reach this gate. *"COLLAPSE is
      // never gated"* is therefore guaranteed by PLACEMENT, ⛔ not by a conditional anyone could delete.
      //
      // ⚠️ AND A REFUSAL LEAVES THE WORLD AS IT FOUND IT. The superseded row is invalidated only AFTER
      // this create returns, so throwing here keeps the previous belief LIVE and the exactly-one-live-row
      // invariant intact. ⓘ It also forgoes that write's opportunistic collapse of pre-existing
      // duplicates — it creates none, and the alternative would be a refusal that mutates, which is the
      // partial-act failure this project refuses everywhere else.
      // ── ⭐⭐⭐ SELF-AUTHORISATION IS ITS OWN REFUSAL, ⛔ NOT A KIND MISMATCH ────────────────────
      //
      // ⭐ It is kept OUT of `governsReplacement` on purpose. That gate answers one question — *does this
      // claim answer the slot's question?* — and this answers a different one: *may this act use a
      // permission it created?* ⛔ Two questions with two remedies must not share a refusal:
      //     kind mismatch      ⇒ fix the claim, or rebind the slot
      //     self-authorisation ⇒ declare or bind in a DIFFERENT occasion than the one that consumes it
      // ⚠️ A refusal that cannot be acted on is noise, and one that names the wrong remedy is worse.
      //
      // ⛔⛔ AND IT REFUSES ONLY A REPLACEMENT. A governed slot's NEW write is not in the replacement
      // authority's scope (ratified), so a self-authorised NEW write is left to legacy — it simply never
      // earns a pin. ⭐ Widening this to every write would be the outage 031 already named.
      if (row?.supersedes_id && governance.resolved?.slotGoverned === true && governance.selfAuth?.ok === false) {
        log?.warn?.({ refusal: governance.selfAuth.refusal, why: governance.selfAuth.why, slot: row.slot_id },
          '[memory] refused a REPLACEMENT whose question was declared or bound by this same occasion')
        const e5 = new Error(`refused: ${governance.selfAuth.why}`)
        e5.code = 'SELF_AUTHORISED_QUESTION'
        e5.reason = governance.selfAuth.refusal
        e5.slotKind = governance.resolved?.slotKind ?? null
        // ⭐ WHICH slot and WHICH row it would have replaced. A refusal a reader cannot locate is noise,
        // and this is the pair a caller needs to act on it.
        e5.slotId = row.slot_id ?? null
        e5.supersedes = row.supersedes_id ?? null
        throw e5
      }
      if (row?.supersedes_id) {
        const gate = governsReplacement({
          isUpdate: true,
          slotGoverned: governance.resolved?.slotGoverned ?? null,
          slotKind: governance.resolved?.slotKind ?? null,
          claimKind: row?.claimKind ?? null,
        })
        if (gate.outcome === REPLACEMENT.refuse) {
          log?.warn?.({ scope: gate.scope, why: gate.why, slot: row.slot_id, claimKind: row?.claimKind ?? null },
            '[memory] refused a REPLACEMENT in a governed slot')
          const e4 = new Error(`refused: ${gate.why}`)
          e4.code = 'REPLACEMENT_REFUSED'
          e4.reason = 'governed-slot-kind-mismatch'
          e4.scope = gate.scope
          e4.slotKind = governance.resolved?.slotKind ?? null
          e4.claimKind = row?.claimKind ?? null
          throw e4
        }
      }
      const admittedQuestionId = governance.pin
      // ══ ⭐⭐⭐ 049 · I1 / I9 — A PASS-DRIVEN WRITER MAY NOT WRITE WITHOUT AN ACT. Fail closed, ⛔ never a silent row. ══
      if (CONTRACT.pass && !ACT) {
        const eA = new Error(`refused: the ${WRITER} writer is pass-driven and carries no act identity — a pass must be claimed before it writes`)
        eA.code = 'NO_ACT'
        eA.reason = 'pass-writer-without-act'
        throw eA
      }
      // ⛔ `evidenceRefs` is an instruction to this method, not a column
      const { evidenceRefs: _refsIgnored, ...persistableAxes } = persistable
      // a turn reach resolves its conversation from the message itself (a join on the pointer, not a guess)
      let reachConversationId = REACH?.conversationId ?? null
      if (REACH?.kind === 'turn' && !reachConversationId && db?.txn_messages) {
        const t = await db.txn_messages.findOne({ where: { id: REACH.messageId }, attributes: ['conversation_id'], raw: true })
        reachConversationId = t?.conversation_id ?? null
      }
      const created = await txn_memories.create({
        ...persistableAxes,
        question_id_at_admission: admittedQuestionId,
        // ── ⭐ 049 · the axes, stamped from construction — ⛔ never from the row's own fields ──
        writer: WRITER,
        act_kind: ACT?.kind ?? null,
        act_id: ACT?.id ?? null,
        reach_kind: REACH?.kind ?? null,
        reach_conversation_id: REACH?.kind === 'turn' || REACH?.kind === 'range' ? reachConversationId : null,
        reach_message_id: REACH?.kind === 'turn' ? REACH.messageId : null,
        reach_from_rolling_id: REACH?.kind === 'range' ? REACH.from : null,
        reach_to_rolling_id: REACH?.kind === 'range' ? REACH.to : null,
        reach_document: REACH?.kind === 'document' ? REACH.document : null,
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
      const plain = created.get ? created.get({ plain: true }) : created
      // ══ ⭐⭐⭐ D1(b) · A WRITE THAT DID NOT SAY WHO WROTE IT IS ADMITTED — AND SAYS SO. ════════════════════════════
      //
      // Ote's ruling, 2026-09-15: *"(b) now — admit the write, but record the missing writer identity loudly."*
      //
      // ⚠️⚠️ THE DEFECT THIS EXISTS TO SURFACE, MEASURED: migration 049 gave every write a declared writer, act and
      // reach — and six weeks later only 6 of the 13 declared writers had a CALLER. The gap was not the missing
      // argument; it was that the missing argument was LEGAL: `writer: null` resolved to an inert contract and produced
      // a valid row with no axes, silently, while this same method refuses a pass writer with no act LOUDLY.
      // ⇒ one axis fail-closed, the other opt-in, in one constructor. Found by an unrelated experiment's own data.
      //
      // ⭐ SO THE ABSENCE IS RECORDED RATHER THAN ASSUMED. ⛔ It does NOT refuse — Phase 1 must break no caller, and
      // the caller set is not yet known to be complete. Phase 3 turns this into a refusal once it is; until then the
      // warn plus the `writer-not-declared` lint rule are what make an unwired path enumerate itself instead of leaking.
      if (!WRITER) {
        const why = '[memory] a row was written with NO declared writer — its occasion, reachability and provenance are unattributable'
        const where = { id: plain.id, source: plain.source ?? null, kind: plain.kind ?? null, namespace: plain.namespace ?? null, author: AUTHOR }
        if (log?.warn) log.warn(where, why); else console.warn(why, where)
        // ⭐ D1 PHASE-3 PREPARATION, off unless asked for. `SOTERA_WRITER_TRACE=1` appends the CALL STACK of every
        // undeclared write to a file, so "which callers would break under a mandatory-writer rule" is MEASURED across a
        // full suite run instead of inferred by reading ninety-odd construction sites. ⛔ Inert in production: no env
        // var, no cost, no behaviour change. Writing the trace must never be able to fail a write.
        if (process.env.SOTERA_WRITER_TRACE) {
          try {
            const site = (new Error().stack || '').split('\n').slice(2, 9).join('\n')
            fsAppend(process.env.SOTERA_WRITER_TRACE_FILE || 'writer-trace.log', `── ${plain.id} · ${plain.source ?? 'no-source'}\n${site}\n`)
          } catch { /* a diagnostic must never break the thing it is diagnosing */ }
        }
      }
      // ══ ⭐⭐⭐ 049 · PROVENANCE — written by the WRITER or not at all. ⛔ No reader completes it (I3). ═════════════════
      try {
        const refs = []
        // (a) the declared coincidence — the writer's MECHANISM guarantees the occasion turn is the evidence turn
        if (CONTRACT.coincidence === COINCIDENCE.occasionTurnIsEvidence && ACT?.kind === 'turn') {
          refs.push({ kind: 'turn', target: ACT.id, credential: plain.provenance ?? null, how: VERIFICATION.declaredCoincidence })
        }
        // (b) span verification — the SAME standard that earns `quoted`: the value appears verbatim in the occasion turn.
        //     ⛔ No other turn is searched. No match ⇒ NO reference (nothing was cited, so nothing failed).
        if (CONTRACT.verify === 'span-in-occasion-turn' && ACT?.kind === 'turn' && db?.txn_messages) {
          const turn = await db.txn_messages.findOne({ where: { id: ACT.id }, attributes: ['content'], raw: true })
          const span = plain.value != null && String(plain.value).trim().length >= 4 ? String(plain.value)
            : (String(plain.content ?? '').trim().length >= 8 ? String(plain.content) : null)
          if (turn?.content && span && spanAppears(turn.content, span)) {
            refs.push({ kind: 'turn', target: ACT.id, span, credential: 'quoted', how: VERIFICATION.spanVerified })
          }
        }
        // (c) explicit references the writer named — verified; a failed one is RECORDED as failed, the row stands (I10)
        if (Array.isArray(row?.evidenceRefs)) refs.push(...row.evidenceRefs)
        if (refs.length) await createReferences(db, { memoryId: plain.id, refs, act: ACT, reach: REACH ? { ...REACH, conversationId: REACH.conversationId ?? reachConversationId } : null, attests: CONTRACT.attests })
      } catch (e) {
        const msg = `[memory] provenance references could not be recorded — the row stands with provenance NOT established: ${e?.message}`
        if (log?.warn) log.warn({ err: e?.message, id: plain?.id }, msg); else console.warn(msg)
      }
      return plain
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
