// Persona Memory v2 — the cognitive-memory host service (RFC_PERSONA_MEMORY §4). Phase 1 substrate:
// remember (ADD) → ranked recall (composite score) → usage reinforcement, plus pin/forget and a
// working-memory activation. Scoped per (persona, user) with persona-global identity (D1 hybrid).
//
// Deps are injected (db + an embed fn) so the ranking/scoping logic is testable without the gateway.
// Phase 2 layers Mem0 reconcile (ADD/UPDATE/DELETE/NOOP), LLM importance, hybrid RRF, bi-temporal
// supersede, and decay tiers on top of this same shape. Reconcile is NOT here yet — remember() adds.

import { Op } from 'sequelize'
import { rankMemories, cosine, rrfFuse, dedupeByValue, sameValueMeaning } from './memory-rank.js'
import { norm } from './memory-extract.js'
import { clusterMemories, consolidationPlan, buildCardPrompt, parseCard } from './memory-consolidate.js'
import { IDENTITY_NAMESPACE, identityAttributeOf } from './memory-identity.js'
import { resolveConflict, WIRE_ACTION } from './memory-conflict.js'
import { createCosineSlotResolver, rowsBySlotIndex } from './memory-slot-resolver.js'
import { createSlotStore } from './memory-slot-store.js'
import { recordResolution, bump as bumpResolverCounter } from './memory-resolver-telemetry.js'
import { SELF_ENTITY, SELF_OWNER_ALIASES } from './memory-observation.js'
import { logMemoryChange, snapshot } from '../audit/memory-log.js'

// ONE WRITE LANE PER (persona, user) — module-level on purpose. A per-instance queue cannot serialize two
// writers that were built from separate `buildMemoryV2` calls in the same turn, which is exactly how the
// model's tool service and the automatic capture path are constructed. Entries delete themselves once their
// chain drains (see enqueueWrite), so this does not grow with the user table.
const WRITE_LANES = new Map()

const clampImportance = (v) => (v == null ? null : Math.max(1, Math.min(10, Math.round(v))))
const clampConfidence = (v) => (v == null ? null : Math.max(0, Math.min(1, Number(v))))
// Capture-time trust defaults by write mechanism (simple v1 — refine later). An explicit atomic
// fact is a more deliberate assertion than a free-form remember; consolidation summarizes evidence.
const CONFIDENCE_DEFAULT = { remember: 0.7, fact: 0.85, consolidation: 0.8 }
// near-identical restatements (cosine ≥ this) are treated as the SAME memory — reinforce, don't re-add
const DEDUP_THRESHOLD = 0.95

// ⚠️ NOTES NEED A LOWER GATE THAN EVERYTHING ELSE, AND 0.95 IS NOT WRONG — IT IS THE WRONG QUESTION FOR THEM.
// 0.95 asks "is this the same TEXT?", which is right for episodic prose: a lived experience restated almost
// verbatim is the same experience, and anything looser would merge two genuinely different days.
//
// L3 persona notes are not restatements, they are PARAPHRASE BY DESIGN. Reflection asks the model for "at
// most 5 SHORT operational notes" from overlapping signals, run after run — so two passes describing one
// habit in different words is the NORMAL case, not an edge case. Measured on the live store 2026-08-06:
//
//   0.8573  "Keep discussions focused on the Go language runtime and Garbage Collection when appropriate."
//        vs "If the conversation drifts away from GC or Go runtime topics, gently steer it back to those areas."
//   0.8422  "When discussing mechanics, frame examples within the context of vanilla Skyblock gameplay."
//        vs "Ensure any mechanical discussions are framed within vanilla Skyblock gameplay."
//   ── measured gap of 0.118 ──
//   0.7239  "Approach interactions with genuine curiosity…" vs "Maintain a warm and unhurried tone…"
//                                                            ^ GENUINELY DIFFERENT NOTES. Must not merge.
//
// Both duplicate pairs sailed under 0.95 and both were live, injected on every turn. The proof they never
// even grazed the gate: dedup increments `access_count` on the row it reinforces, and every one of the 17
// live notes read access_count = 0. The gate had never once matched a note.
//
// 0.80 sits INSIDE the measured gap with 0.076 of margin on the side that matters (rejecting a real note).
// It is derived from the spread, not picked — the discipline the voice lab learned the hard way, where a
// threshold that is not the measured spread is a coin toss.
//
// ⚠️ SCOPED TO `note` ON PURPOSE. Lowering the global gate to 0.80 would start merging distinct episodic
// memories, and this platform's whole claim is that the store remembers correctly. A duplicated line costs
// context; a wrongly-merged memory costs the truth.
const DEDUP_THRESHOLD_BY_KIND = { note: 0.80 }
/** Dedup gate for a kind — the store-wide 0.95 unless that kind is known to arrive as paraphrase. */
export const dedupThresholdFor = (kind) => DEDUP_THRESHOLD_BY_KIND[kind] ?? DEDUP_THRESHOLD
// (the slot-matching thresholds moved to the SlotResolver — they are its knobs, not the store's)

// The fact OWNER is RUNTIME-owned, not model-supplied. The store is already scoped to the
// authenticated user, so any fact "about me" must resolve to ONE canonical owner regardless of how it
// gets labelled — "user", "me", the account's username, its display name… Without this, the same slot
// ("favorite word") splits across labels (the model saying "agent_dev" vs the extractor saying "user")
// and an UPDATE duplicates instead of superseding — the root of the contradictory-dup problem.
// (Ote 2026-07-29: the runtime owns owner metadata; the model only supplies attribute/value.)
// The generic self vocabulary itself is shared with Interpretation (memory-observation.js owns the ONE
// definition); the store additionally folds in the account's username/display name, which only it knows.

// what the caller sees (ranking internals + raw vector stay private)
const view = (r) => ({
  id: r.id, kind: r.kind, content: r.content, importance: r.importance, confidence: r.confidence ?? null, pinned: r.pinned,
  entity: r.entity ?? null, attribute: r.attribute ?? null,
  score: r.score, relevance: r.relevance, source: r.source ?? null, sourceMessageId: r.source_message_id ?? null,
})

/**
 * @param {object}   deps
 * @param {object}   deps.db        Sequelize models bag (needs `txn_memories`)
 * @param {(t:string)=>Promise<{vector:number[]|null, model:string|null}>} [deps.embed]
 * @param {string|null} [deps.persona]
 * @param {string|null} [deps.userId]
 * @param {()=>number}  [deps.now]  injectable clock (tests)
 * @param {{resolve:Function, indexVectorFor:Function}} [deps.slotResolver] the RESOLUTION stage — defaults
 *        to the cosine v1. Injectable so v2 (gray-zone LLM) / v3 (ontology) swap in without touching the
 *        store: that replaceability is the whole point of the seam (RFC §6/§8).
 */
export function createMemoryV2Service({ db, embed = null, persona = null, userId = null, sourceMessageId = null, log = null, self = null, slotResolver = null, actor = null, now = () => Date.now() } = {}) {
  const { txn_memories } = db
  // RESOLUTION stage: classification-only, deps at construction, private embedding index.
  // `loadIndex` is the §8a PRIVATE-INDEX PORT — the resolver asks for "a vector per candidate slot" and
  // this adapter answers from wherever the index physically lives (today: the slot_embedding column on
  // the rows occupying each slot, best/newest wins). Slot descriptors stay vector-free, and an
  // OntologyResolver can be constructed with no port at all.
  // Default = the cosine v1 with the standard private-index adapter (which reads only from resolve()'s
  // context, so there is no hidden state). The HOST may inject a CHAIN instead (cosine → gray-zone →
  // ontology); the store cannot tell the difference, which is the whole point of the seam.
  const resolver = slotResolver ?? createCosineSlotResolver({ embed, loadIndex: rowsBySlotIndex })
  // SLOT STORE (Phase 6): long-lived slot identity + learned aliases. Degrades to a no-op when the
  // table/column isn't provisioned, so slot bookkeeping can never fail a write.
  const slotStore = createSlotStore({ db, persona, userId, log, now })
  const P = persona ?? null
  const U = userId ?? null
  const SRC_MSG = sourceMessageId ?? null // provenance: the message this turn's writes came from
  // Every label that means "the authenticated user" → collapse to SELF_ENTITY. The host injects the
  // account's own username / display name (`self`) so the model naming itself (e.g. "agent_dev")
  // reconciles with the extractor's "user". A genuinely distinct subject (a person, a project) keeps
  // its own normalized name. resolveOwner is the ONE place owner identity is decided.
  const selfAliases = new Set(SELF_OWNER_ALIASES)
  if (self?.username) selfAliases.add(norm(self.username))
  if (self?.displayName) selfAliases.add(norm(self.displayName))
  const resolveOwner = (e) => {
    const n = norm(e)
    return (n === '' || selfAliases.has(n)) ? SELF_ENTITY : n
  }
  // "live" = currently believed: not world-invalidated, not system-expired
  const live = () => ({ invalid_at: null, expired_at: null })
  // AUDIT (2026-08-03): every transition that REMOVES or REPLACES a belief is recorded, because
  // `supersedes_id` alone could not answer "where did my role fact go?" — see app/audit/memory-log.js
  // for the incident. Plain ADDs are not logged: the row is its own record.
  // Fire-and-forget by construction — the writer already swallows its own errors, and the `.catch()`
  // guarantees a logging problem can never reject the memory write that triggered it.
  const AUDIT_ACTOR = actor ?? 'system'
  const audit = (entry) => {
    try { logMemoryChange(db, { userId: U, persona: P, actor: AUDIT_ACTOR, log, ...entry })?.catch?.(() => {}) }
    catch { /* audit is never load-bearing */ }
  }
  let lexicalDisabled = false // set if the tsvector column is absent → degrade to vector-only, warn once
  let denseDisabled = false // set if pgvector/embedding_hv is absent → fall back to JS cosine, warn once

  // Background write queue. Model-driven captures return immediately (the model's turn never blocks
  // on the embed — ~1-2s on CPU — or the reconcile/persist); the real work runs here, off the turn's
  // critical path. SERIAL (one write at a time) on purpose: no CPU-embed contention, and same-slot
  // reconciles can't race. Best-effort — a failed background write is logged, not surfaced; the store is
  // idempotent (the next mention re-captures), so a dropped write self-heals.
  //
  // ⚠️ THE LANE IS SHARED PER SCOPE, NOT PER INSTANCE — and it had to become so before the one-writer
  // invariant could be enforced structurally. `buildMemoryV2` constructs a NEW service on every call, so
  // while this queue was a plain closure variable each CALL SITE got its own lane: the model's tool service
  // and the automatic capture path are built separately within a single turn, so "serial" was only ever true
  // *inside one instance*. A reproduction (writer-race proof) wrote two live rows to an IDENTICAL slot key
  // with both paths enqueued, because they were enqueued onto different chains. Keying the lane by
  // (persona, user) makes every writer in a scope share one chain, which is what "one writer" requires.
  const laneKey = `${persona ?? '-'}|${userId ?? '-'}`
  function enqueueWrite(label, fn) {
    const tail = WRITE_LANES.get(laneKey) ?? Promise.resolve()
    const run = tail.then(fn).catch((err) => {
      try { log?.error?.({ err, label }, 'memory: async write failed (best-effort, will re-capture on next mention)') } catch { /* no logger bound */ }
      return null
    })
    const next = run.then(() => {}, () => {}) // keep the chain alive + un-rejected regardless of outcome
    WRITE_LANES.set(laneKey, next)
    // Don't leak a lane per user forever: once this write is the LAST one in its chain, drop the entry.
    next.then(() => { if (WRITE_LANES.get(laneKey) === next) WRITE_LANES.delete(laneKey) })
    return run
  }

  async function remember(opts = {}) {
    const { content, kind = 'semantic', importance = null, confidence = CONFIDENCE_DEFAULT.remember, entity = null, attribute = null, source = null, pinned = false, namespace = 'default', sourceMessageId = SRC_MSG } = opts
    if (!content || !String(content).trim()) throw new Error('content is required')
    const { vector, model } = embed ? await embed(String(content)) : { vector: null, model: null }
    // Dedup: a near-identical memory already in this scope → reinforce it instead of re-adding
    // (curbs the bloat from capture-everything; repetition is itself a reinforcement signal).
    if (vector && opts.dedup !== false) {
      const scope = await candidates({ kind, namespace })
      let best = null
      let bestCos = 0
      for (const e of scope) {
        if (!Array.isArray(e.embedding)) continue
        const c = cosine(vector, e.embedding)
        if (c > bestCos) { bestCos = c; best = e }
      }
      if (best && bestCos >= dedupThresholdFor(kind)) {
        await txn_memories.increment('access_count', { by: 1, where: { id: best.id } })
        await txn_memories.update({ last_access: new Date(now()) }, { where: { id: best.id } })
        return { ok: true, deduped: true, id: best.id, similarity: Number(bestCos.toFixed(4)) }
      }
    }
    const row = await txn_memories.create({
      persona: P,
      user_id: kind === 'identity' ? null : U, // identity is persona-global (D1 hybrid)
      namespace,
      kind,
      content: String(content),
      embedding: vector,
      embedding_model: model,
      entity: entity == null ? null : resolveOwner(entity), attribute,
      importance: clampImportance(importance),
      confidence: clampConfidence(confidence),
      pinned: !!pinned,
      valid_at: new Date(now()),
      source,
      source_message_id: sourceMessageId,
    })
    return { ok: true, id: row.id, kind, pinned: row.pinned }
  }

  // Reconcile one atomic fact (update-not-append). Find the live fact(s) occupying the SAME slot in
  // scope → ADD new / NOOP+reinforce (same value) / UPDATE (value changed → new row supersedes the
  // old, old.invalid_at set so it's no longer "true now" but kept for history). Semantic kind.
  // Phase 2c: slot lookup is FUZZY (slotMatches) — the LLM phrases one slot many ways ("favorite
  // language" / "favorite programming language"); an exact-key lookup let those pile up as dups.
  // CONVERGENT: if MULTIPLE live rows already occupy the slot (e.g. a race or an earlier double-
  // writer left dups), collapse them ALL to a single live row on this write — the slot self-heals.
  // ── the SLOT VIEW (Phase 7a) ─────────────────────────────────────────────────────────────────────
  // Turn the store's records into the CONCEPTS a resolver reasons about, and keep the concept→rows map
  // private here. Two sources:
  //   • real slots (the Slot store) — carry their learned aliases, which is the whole point
  //   • EPHEMERAL descriptors, synthesized per (owner, attribute) group from live rows that have no
  //     slot_id yet (written before Phase 6, or by a writer that never reconciled). They let unmigrated
  //     history still be matched; if one wins, the caller mints a real slot for it and backfills.
  // Descriptors are DOMAIN ONLY — no rows, no vectors (§8a).
  const EPHEMERAL = 'ephemeral:'
  const isRealSlotId = (id) => !!id && !String(id).startsWith(EPHEMERAL)
  function buildSlotView(canonRows, orderedRows, slotRows) {
    const rowsBySlot = new Map()
    const orderOf = new Map(orderedRows.map((r, i) => [r.id, i])) // preserve newest-first
    const push = (key, row) => {
      const list = rowsBySlot.get(key) ?? []
      list.push(row)
      rowsBySlot.set(key, list)
    }
    const canonById = new Map(canonRows.map((r) => [r.id, r]))
    // A real slot's own phrasings (label + learned aliases) — used to ATTACH un-migrated rows to the slot
    // they obviously belong to. Without this, a concept splits into "the real slot" plus "an ephemeral
    // group" whenever some of its rows predate the Slot store, and a stray duplicate stops collapsing.
    // This is identity, not resolution: the phrasing is the same, so no resolver judgement is needed.
    const claimedBy = new Map()
    for (const s of slotRows || []) {
      claimedBy.set(`${norm(s.entity)}|${norm(s.canonical_label)}`, s.id)
      for (const a of s.aliases || []) if (a?.phrase) claimedBy.set(`${norm(s.entity)}|${norm(a.phrase)}`, s.id)
    }
    const ephemeral = new Map() // "owner|attribute" → descriptor
    for (const row of orderedRows) {
      const canon = canonById.get(row.id)
      if (!canon) continue
      if (row.slot_id) { push(row.slot_id, row); continue }
      const claim = claimedBy.get(`${norm(canon.entity)}|${norm(canon.attribute)}`)
      if (claim) { push(claim, row); continue }
      const key = `${canon.entity}|${norm(canon.attribute)}`
      if (!ephemeral.has(key)) {
        ephemeral.set(key, { slotId: `${EPHEMERAL}${key}`, canonicalLabel: canon.attribute, aliases: [], entity: canon.entity, namespace: row.namespace ?? 'default', ephemeral: true })
      }
      push(ephemeral.get(key).slotId, row)
    }
    for (const list of rowsBySlot.values()) list.sort((a, b) => (orderOf.get(a.id) ?? 0) - (orderOf.get(b.id) ?? 0))
    // real slots: only those that actually hold live rows here, plus their aliases
    const real = (slotRows || [])
      .filter((s) => rowsBySlot.has(s.id))
      .map((s) => ({ slotId: s.id, canonicalLabel: s.canonical_label, aliases: (s.aliases || []).map((a) => a?.phrase).filter(Boolean), entity: s.entity, namespace: s.namespace }))
    return { descriptors: [...real, ...ephemeral.values()], rowsBySlot }
  }

  async function reconcileFact({ entity, attribute, value, importance = null, confidence = CONFIDENCE_DEFAULT.fact, source = null, namespace = 'default' } = {}) {
    if (!attribute || value == null || !String(value).trim()) throw new Error('attribute and value are required')
    const owner = resolveOwner(entity) // RUNTIME owns the owner — the model's label is advisory only
    // Invariant guard (Phase 5.5): identity is routed by SEMANTICS, not origin — an identity attribute
    // about the account holder belongs to the IdentityResolver, so it should have been typed as an
    // identity observation upstream and never reach the generic slot path. Warn (don't throw) so a
    // bypassing caller is visible in logs without breaking a write.
    if (owner === SELF_ENTITY && identityAttributeOf(attribute)) {
      log?.warn?.({ attribute }, 'memory: an IDENTITY attribute reached the generic slot path — a writer is bypassing the observation pipeline')
    }
    const liveFacts = (await txn_memories.findAll({
      where: { persona: P, user_id: U, kind: 'semantic', invalid_at: null, expired_at: null },
      order: [['created_at', 'DESC']], raw: true, // newest-first → matches[0] is the most recent
    })).filter((r) => r.entity && r.attribute && r.namespace !== IDENTITY_NAMESPACE) // slot candidates only; identity is owned by the Identity Resolver, not the generic slot reconcile
    // Canonicalize each live row's owner the SAME way, so legacy rows written under a different label
    // (e.g. "agent_dev") still match this write's canonical owner and collapse instead of duplicating.
    const canonLive = liveFacts.map((r) => ({ ...r, entity: resolveOwner(r.entity) }))

    // RESOLUTION (Phase 7a) — the resolver reasons about CONCEPTS, not RECORDS: it receives SLOT
    // DESCRIPTORS (label + learned aliases) and returns ONE slotId. Mapping that concept back to the rows
    // occupying it is the STORE's job, right here. This is what makes an alias pay off — a learned
    // phrasing is a cheap lexical hit forever after, no embedding and no LLM.
    const { descriptors, rowsBySlot } = buildSlotView(canonLive, liveFacts, await slotStore.list())
    // `rowsBySlot` travels in the CONTEXT (not on a shared field) so the private-index adapter is handed
    // exactly this call's rows — the resolver still never sees a vector, and nothing depends on call order.
    const resolution = await resolver.resolve({ owner, attribute }, { slots: descriptors, rowsBySlot })
    recordResolution(resolution) // memory.resolver.* counters — how strategies compare over time (§15.3)
    const matches = (resolution.slotId ? rowsBySlot.get(resolution.slotId) : null) ?? [] // newest-first
    const primary = matches[0] || null
    // The resolver's private index vector (cached — no second embed) so Persistence can keep the
    // `slot_embedding` column that physically backs that index today. See RFC §8a.
    const slotVec = await resolver.indexVectorFor({ owner, attribute })

    // SLOT STORE (Phase 6) — give this belief a long-lived identity. An existing slot keeps its
    // established canonical phrasing and LEARNS the incoming one as an alias (persistent, so an
    // expensive verdict is paid for once); a brand-new slot is minted from this attribute.
    // FOLLOW the slot the resolution landed on (or the primary belief's own slot_id) — that is what makes
    // a slot long-lived. Only mint/look-up by label when there is no slot yet (a pre-Phase-6 row, or a
    // genuinely new concept). Without this a reworded write re-mints a slot under the NEW phrasing and
    // splits the concept — the exact failure the Slot store exists to prevent.
    const resolvedSlotId = isRealSlotId(resolution.slotId) ? resolution.slotId : (primary?.slot_id ?? null)
    let slot = resolvedSlotId ? await slotStore.get(resolvedSlotId) : null
    if (!slot) {
      slot = await slotStore.ensure({
        entity: owner,
        namespace,
        canonicalLabel: primary?.attribute ?? attribute,
        evidence: primary ? null : { mintedBy: 'reconcileFact', firstAttribute: String(attribute) },
      })
    }
    if (slot) {
      // LEARN the incoming phrasing onto the slot. When a resolver PROPOSES a learning (`evidence.learn` —
      // today the gray zone, later the ontology) we honour its attribution and COUNT the promotion, because
      // that is the mechanism turning an expensive adjudication into a permanent cheap lexical hit. Otherwise
      // the phrasing is still recorded, attributed to whichever cheap arm matched.
      // PROMOTION REUSE: this write matched an alias — was it one a gray-zone verdict taught us? If so the
      // adjudication we paid for has just saved another one. That ratio is how we know teaching pays.
      const matched = resolution.evidence?.matchedAlias
      if (matched && (slot.aliases || []).some((a) => a?.phrase === matched && a?.by === 'gray-zone')) {
        bumpResolverCounter('promoted_alias_reuse')
      }
      const learn = resolution.evidence?.learn
      const promoted = !!learn && learn.slotId === slot.id
      const recorded = await slotStore.recordAlias(slot, promoted ? learn.phrase : attribute, {
        by: promoted ? learn.by : (resolution.evidence?.lexical ? 'lexical' : (resolution.evidence?.semantic ? 'cosine' : null)),
        confidence: (promoted ? learn.confidence : resolution.confidence) ?? null,
      })
      if (promoted && recorded) {
        bumpResolverCounter('cache_promotions')
        log?.info?.({ slot: slot.id, label: slot.canonical_label, phrase: learn.phrase, by: learn.by }, 'memory.resolver: PROMOTED an adjudicated verdict to a learned alias — future writes of this phrasing are free')
      }
      await slotStore.touch(slot)
      // attach this slot's existing history (rows written before the slot store, or by another writer)
      const orphans = matches.filter((r) => !r.slot_id).map((r) => r.id)
      if (orphans.length) await txn_memories.update({ slot_id: slot.id }, { where: { id: orphans } })
    }

    // CONFLICT RESOLUTION (Phase 4) — decide how this claim relates to what we believe. The decision is
    // a semantic PLAN made elsewhere (pure, testable); everything below is PERSISTENCE just executing it.
    const plan = resolveConflict({ matches, value })
    const wire = WIRE_ACTION[plan.action] ?? plan.action // stable reported action ('add'/'noop'/'collapse'/'update')

    // The RESOLVER'S OWN ACCOUNT OF ITSELF, for the audit trail. "A fact was superseded" is derivable from
    // supersedes_id and explains nothing; "cosine 0.84 matched 'role/association' onto slot 'role'" names
    // the arm and the number that made the decision, which is what turns a lost belief into a fixable
    // threshold. Built here so both the collapse and the supersede branches below can carry it.
    const via = resolution.evidence?.learn ? 'gray-zone'
      : resolution.evidence?.semantic ? 'cosine'
        : resolution.evidence?.lexical ? 'lexical'
          : resolution.evidence?.matchedAlias ? 'alias' : 'new'
    const auditReason = [
      `${via}${Number.isFinite(resolution.confidence) ? ` ${resolution.confidence.toFixed(3)}` : ''}`,
      `"${String(attribute).slice(0, 60)}" → slot "${String(slot?.canonical_label ?? attribute).slice(0, 60)}"`,
    ].join(' · ')

    if (!plan.write) {
      // NOOP / DUPLICATE: reinforce the current belief, collapse any duplicate live rows, and BACKFILL
      // its slot_embedding if it predates semantic reconcile (so future variants can match it).
      await txn_memories.increment('access_count', { by: 1, where: { id: plan.target } })
      const patch = { last_access: new Date(now()) }
      if (slotVec && !Array.isArray(primary.slot_embedding)) patch.slot_embedding = slotVec
      await txn_memories.update(patch, { where: { id: plan.target } })
      if (plan.collapse.length) {
        await txn_memories.update({ invalid_at: new Date(now()) }, { where: { id: plan.collapse } })
        for (const dup of matches.filter((r) => plan.collapse.includes(r.id))) {
          audit({ memoryId: dup.id, action: 'collapse', relatedId: plan.target, slotId: slot?.id ?? dup.slot_id ?? null,
            reason: `duplicate of the live belief · ${auditReason}`, before: snapshot(dup), source })
        }
      }
      return { ok: true, action: wire, id: plan.target, collapsed: plan.collapse.length }
    }

    const content = `${owner}'s ${attribute}: ${value}` // readable sentence → embedded + shown on recall
    const { vector, model } = embed ? await embed(content) : { vector: null, model: null }
    const created = await txn_memories.create({
      persona: P, user_id: U, namespace, kind: 'semantic', content,
      entity: owner, attribute: String(attribute), value: String(value),
      embedding: vector, embedding_model: model, slot_embedding: slotVec,
      importance: clampImportance(importance),
      confidence: clampConfidence(confidence),
      valid_at: new Date(now()), source, source_message_id: SRC_MSG,
      supersedes_id: plan.supersedes, slot_id: slot?.id ?? null,
    })
    // UPDATE → invalidate the superseded row AND every duplicate live row in the slot, so exactly one
    // live row (the new one) remains. NEW (no prior slot) → nothing to invalidate.
    const stale = [...(plan.supersedes ? [plan.supersedes] : []), ...plan.collapse]
    if (stale.length) await txn_memories.update({ invalid_at: new Date(now()) }, { where: { id: stale } })
    // AUDIT the displacement. THIS is the row that was missing on 2026-07-31: a junk fact took the `role`
    // slot at cosine 0.84 and the only trace was a supersedes_id pointer with no actor, no reason and no
    // snapshot of what it replaced.
    for (const old of matches.filter((r) => stale.includes(r.id))) {
      audit({
        memoryId: old.id,
        action: old.id === plan.supersedes ? 'supersede' : 'collapse',
        relatedId: created.id,
        slotId: slot?.id ?? old.slot_id ?? null,
        reason: auditReason,
        before: snapshot(old),
        after: { replacedBy: created.id, value: String(value).slice(0, 200) },
        source,
      })
    }
    return { ok: true, action: wire, id: created.id, supersedes: plan.supersedes, collapsed: plan.collapse.length }
  }

  // IDENTITY slot access (Memory V3 Phase 1, RFC §7). The USER's identity (preferred_name/pronouns/
  // title) lives as per-user semantic rows in the reserved IDENTITY_NAMESPACE, entity = SELF. This is
  // the dedicated Identity Resolver's persistence — SEPARATE from the generic slot reconcile
  // (reconcileFact excludes this namespace), so identity is never clobbered by a fuzzy attribute match
  // (e.g. an extracted "name" fact). NOTE: distinct from kind:'identity' (that is persona-GLOBAL
  // persona identity, a different axis); user identity is per-(persona,user) like semantic facts.
  async function getIdentity({ attribute } = {}) {
    if (!attribute) throw new Error('attribute is required')
    const row = await txn_memories.findOne({
      where: { persona: P, user_id: U, kind: 'semantic', namespace: IDENTITY_NAMESPACE, entity: SELF_ENTITY, attribute: String(attribute), invalid_at: null, expired_at: null },
      order: [['created_at', 'DESC']], raw: true,
    })
    return row ? { value: row.value ?? null, confidence: row.confidence ?? null, id: row.id, source: row.source ?? null } : null
  }

  // Write an identity slot value. Phase 1 only ADDS (into an empty slot) or reinforces — a CHANGE is
  // gated by the Identity Resolver policy (identityPlan → 'defer') in the host, so setIdentity is never
  // called to overwrite a differing value without confirmation. importance is high (identity = defining).
  async function setIdentity({ attribute, value, confidence = null, source = null, sourceMessageId = SRC_MSG } = {}) {
    if (!attribute || value == null || !String(value).trim()) throw new Error('attribute and value are required')
    const content = `${SELF_ENTITY}'s ${attribute}: ${value}`
    const { vector, model } = embed ? await embed(content) : { vector: null, model: null }
    const row = await txn_memories.create({
      persona: P, user_id: U, namespace: IDENTITY_NAMESPACE, kind: 'semantic', content,
      entity: SELF_ENTITY, attribute: String(attribute), value: String(value),
      embedding: vector, embedding_model: model,
      importance: 9, confidence: clampConfidence(confidence),
      valid_at: new Date(now()), source, source_message_id: sourceMessageId,
    })
    return { ok: true, id: row.id, value: String(value) }
  }

  // Candidate set for retrieval: this user's episodic/semantic/card UNION the persona's global
  // identity. `card` = a Phase-3 consolidated per-topic summary (per-user, like semantic).
  async function candidates({ kind = null, namespace = null } = {}) {
    const base = live()
    if (namespace) base.namespace = namespace
    if (kind) {
      return txn_memories.findAll({
        where: { ...base, persona: P, kind, user_id: kind === 'identity' ? null : U },
        raw: true,
      })
    }
    const [userRows, identityRows] = await Promise.all([
      txn_memories.findAll({ where: { ...base, persona: P, user_id: U, kind: ['episodic', 'semantic', 'card'] }, raw: true }),
      txn_memories.findAll({ where: { ...base, persona: P, user_id: null, kind: 'identity' }, raw: true }),
    ])
    return [...userRows, ...identityRows]
  }

  // Shared scope WHERE for the raw-SQL arms (lexical + dense), mirroring candidates(): this persona,
  // this user's episodic/semantic/card UNION the persona-global identity, live rows only. Mutates
  // `repl` with the bound values and returns the clause list. (IS NOT DISTINCT FROM = null-safe.)
  const { tableName: MEM_TABLE, schema: MEM_SCHEMA } = txn_memories.getTableName()
  const memTable = MEM_SCHEMA ? `"${MEM_SCHEMA}"."${MEM_TABLE}"` : `"${MEM_TABLE}"`
  function scopeClause(kind, namespace, repl) {
    const where = ['persona IS NOT DISTINCT FROM :persona', 'invalid_at IS NULL', 'expired_at IS NULL']
    repl.persona = P
    if (namespace) { where.push('namespace = :ns'); repl.ns = namespace }
    if (kind) {
      where.push('kind = :kind AND user_id IS NOT DISTINCT FROM :su')
      repl.kind = kind; repl.su = kind === 'identity' ? null : U
    } else {
      where.push("((user_id IS NOT DISTINCT FROM :u AND kind IN ('episodic','semantic','card')) OR (user_id IS NULL AND kind = 'identity'))")
      repl.u = U
    }
    return where
  }

  // Lexical (full-text) arm — Postgres tsvector over `content`, scoped like candidates(). Returns
  // matched ids ranked by ts_rank (best-first). Needs the generated `content_tsv` column + GIN index
  // (see memories.model.js); if absent, degrade to vector-only and warn once.
  async function lexicalSearch({ query, kind = null, namespace = null, limit = 32 } = {}) {
    if (lexicalDisabled || !query || !String(query).trim()) return []
    const repl = { q: String(query), lim: Math.max(1, Math.min(limit, 200)) }
    const where = scopeClause(kind, namespace, repl)
    where.push("content_tsv @@ websearch_to_tsquery('english', :q)")
    const sql = `SELECT id FROM ${memTable} WHERE ${where.join(' AND ')} ` +
      `ORDER BY ts_rank(content_tsv, websearch_to_tsquery('english', :q)) DESC LIMIT :lim`
    try {
      return (await txn_memories.sequelize.query(sql, { replacements: repl, type: 'SELECT' })).map((r) => r.id)
    } catch (e) {
      lexicalDisabled = true
      log?.warn?.({ err: e?.message }, '[memory.v2] lexical arm disabled (tsvector column missing?) — vector-only recall')
      return []
    }
  }

  // Dense arm — pgvector cosine over the generated `embedding_hv halfvec` column (HNSW at scale).
  // Returns a Map id→cosine-relevance (1 − distance) for the top-`limit` in scope; feeds the SAME
  // composite ranking as before (rankMemories `relevances`). Needs embedding_hv + pgvector; if
  // absent, returns null so retrieve() falls back to in-JS cosine over the candidate embeddings.
  async function denseRelevances({ qVec, kind = null, namespace = null, limit = 200 } = {}) {
    if (denseDisabled || !Array.isArray(qVec) || !qVec.length) return null
    const repl = { q: `[${qVec.join(',')}]`, lim: Math.max(1, Math.min(limit, 1000)) }
    const where = scopeClause(kind, namespace, repl)
    where.push('embedding_hv IS NOT NULL')
    const sql = `SELECT id, (1 - (embedding_hv <=> :q::halfvec(2048))) AS relevance FROM ${memTable} ` +
      `WHERE ${where.join(' AND ')} ORDER BY embedding_hv <=> :q::halfvec(2048) LIMIT :lim`
    try {
      const rows = await txn_memories.sequelize.query(sql, { replacements: repl, type: 'SELECT' })
      return new Map(rows.map((r) => [r.id, Number(r.relevance) || 0]))
    } catch (e) {
      denseDisabled = true
      log?.warn?.({ err: e?.message }, '[memory.v2] pgvector dense arm disabled (embedding_hv missing?) — JS cosine fallback')
      return null
    }
  }

  async function retrieve({ query = null, kind = null, namespace = null, limit = 8, minRelevance = 0.15, weights } = {}) {
    const rows = await candidates({ kind, namespace })
    const q = query && embed ? (await embed(String(query))).vector : null
    // No semantic query → pure importance/recency ranking (unchanged), then value-level suppression.
    // ⚠️ RANK THE WHOLE SET, SUPPRESS, THEN SLICE. Slicing first would spend a recall slot on the
    // duplicate and then delete it, returning fewer facts than asked for — the caller would pay for
    // the duplication twice: once in context, once in a fact that never made it.
    if (!q) {
      const ranked = rankMemories(null, rows, { now: now(), limit: rows.length, minRelevance: 0, weights })
      const { kept, dropped } = dedupeByValue(ranked)
      if (dropped.length) log?.debug?.({ dropped: dropped.length }, '[memory.v2] recall suppressed restated values')
      return kept.slice(0, limit)
    }

    // Hybrid: dense (pgvector cosine ⊕ composite) arm + lexical (tsvector) arm, fused by RRF. The
    // dense similarity is now computed by pgvector's <=> (falls back to in-JS cosine if unavailable);
    // the composite (importance × recency) + pinned floor still run here, identically.
    const pool = Math.max(limit * 4, 20)
    const relevances = await denseRelevances({ qVec: q, kind, namespace, limit: Math.max(pool * 4, 200) })
    const scored = relevances
      ? rankMemories(null, rows, { now: now(), limit: rows.length, minRelevance: 0, weights, relevances })
      : rankMemories(q, rows, { now: now(), limit: rows.length, minRelevance: 0, weights }) // JS fallback
    const byId = new Map(scored.map((r) => [r.id, r]))
    const denseOrder = scored.map((r) => r.id).slice(0, pool)
    const lexIds = await lexicalSearch({ query, kind, namespace, limit: pool })
    const lexSet = new Set(lexIds)
    const fused = rrfFuse([denseOrder, lexIds])
    const out = []
    for (const { id } of fused) {
      const r = byId.get(id)
      if (!r) continue
      // keep pinned priors, any lexical hit (its own relevance signal), or dense hits above the gate
      if (!(r.pinned || lexSet.has(id) || r.relevance >= minRelevance)) continue
      // ⚠️ SUPPRESS INSIDE THE LOOP, NOT AFTER IT. A restated value skips its slot and the loop keeps
      // going, so recall returns `limit` DISTINCT facts. Deduping after the break would hand back a
      // short list instead — the duplicate would still have cost a slot, just silently.
      const dup = out.find(
        (k) => (k.entity ?? null) === (r.entity ?? null)
          && sameValueMeaning(k.value ?? k.content, r.value ?? r.content),
      )
      if (dup) continue
      out.push(r)
      if (out.length >= limit) break
    }
    return out
  }

  async function reinforce(ids) {
    if (!ids?.length) return
    await txn_memories.increment('access_count', { by: 1, where: { id: ids } })
    await txn_memories.update({ last_access: new Date(now()), tier: 'hot' }, { where: { id: ids } })
  }

  // list = ENUMERATE memories in scope (NOT relevance-ranked or gated, unlike recall). Recency
  // order, paginated. Use for "show me everything you remember" and as the basis for clearing —
  // recall() only returns the top relevant few, so it must never be used to enumerate/clear.
  async function list({ kind = null, namespace = null, limit = 200, offset = 0 } = {}) {
    const rows = await candidates({ kind, namespace })
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const cap = Math.min(Math.max(limit, 1), 1000)
    return { count: rows.length, memories: rows.slice(offset, offset + cap).map(view) }
  }

  /**
   * Enumerate ARCHIVED beliefs — superseded (`invalid_at`) or forgotten/decayed (`expired_at`).
   *
   * A SEPARATE query on purpose, never a flag threaded through candidates(): candidates() feeds recall,
   * and a boolean that can disable the live filter is one bad default away from leaking dead beliefs into
   * a live prompt. Two functions cannot make that mistake. Nothing here reinforces or re-ranks — this is
   * an inspection path, not a retrieval one.
   *
   * `why` is derived rather than stored so the caller never has to know the two-column encoding:
   * 'superseded' (something replaced it) vs 'forgotten' (someone or the decay pass archived it).
   */
  async function listArchived({ kind = null, namespace = null, limit = 100, offset = 0 } = {}) {
    const where = {
      persona: P,
      [Op.or]: [{ invalid_at: { [Op.ne]: null } }, { expired_at: { [Op.ne]: null } }],
      ...(kind ? { kind } : {}),
      ...(namespace ? { namespace } : {}),
    }
    // identity rows are persona-global (user_id null); everything else is this user's
    where[Op.and] = [{ [Op.or]: [{ user_id: U }, { user_id: null, kind: 'identity' }] }]
    const rows = await txn_memories.findAll({ where, order: [['created_at', 'DESC']], raw: true })
    const cap = Math.min(Math.max(limit, 1), 500)
    return {
      count: rows.length,
      memories: rows.slice(offset, offset + cap).map((r) => ({
        ...view(r),
        why: r.expired_at ? 'forgotten' : 'superseded',
        archivedAt: r.expired_at ?? r.invalid_at,
        supersedesId: r.supersedes_id ?? null, // what THIS row replaced; the reverse link is in the audit trail
        slotId: r.slot_id ?? null,
      })),
    }
  }

  // getSource = PROVENANCE back-reference: given a memory id (in this scope), return the message it
  // was saved from + surrounding conversation context, so the assistant (or an auditor) can see WHY a
  // memory exists / recover the original context. Scope-guarded: only memories in this persona + the
  // caller's user (or persona-global identity). Needs db.txn_messages (host wiring); degrades gracefully.
  async function getSource({ id, context = 2 } = {}) {
    if (!id) throw new Error('id is required')
    const m = await txn_memories.findOne({ where: { id, persona: P }, raw: true })
    if (!m || !(m.user_id === U || m.user_id === null)) return { ok: true, found: false } // not in scope
    const res = { ok: true, found: true, memory: view(m), source: m.source ?? null, sourceMessageId: m.source_message_id ?? null }
    if (!m.source_message_id || !db.txn_messages) return res // consolidation/migrated/generic — no source message
    const msg = await db.txn_messages.findOne({ where: { id: m.source_message_id }, raw: true })
    if (!msg) { res.note = 'source message no longer exists (deleted)'; return res }
    res.conversationId = msg.conversation_id
    if (db.txn_conversations) {
      const conv = await db.txn_conversations.findOne({ where: { id: msg.conversation_id }, raw: true })
      res.conversationTitle = conv?.title ?? null
    }
    // the source message + a few neighbours each side (persona-scale conversations — fetch + slice)
    const all = await db.txn_messages.findAll({ where: { conversation_id: msg.conversation_id }, order: [['rolling_id', 'ASC']], raw: true })
    const idx = all.findIndex((n) => n.id === msg.id)
    const c = Math.max(0, Math.min(10, context))
    res.context = all.slice(Math.max(0, idx - c), idx + c + 1).map((n) => ({
      role: n.role, content: String(n.content || '').slice(0, 600), at: n.created_at, isSource: n.id === msg.id,
    }))
    return res
  }

  /**
   * Revive the belief a just-forgotten row had displaced, so a slot reverts instead of emptying.
   * See forget() for the full rationale. Returns the revived row's view, or null when nothing was
   * eligible — which is the common, correct case (most forgotten rows superseded nothing).
   *
   * The "no other live row" guard is what makes this safe to run unconditionally: if anything already
   * occupies the slot, the predecessor stays invalid and the slot keeps exactly one live belief. That
   * invariant is the whole contract, so it is asserted in the unit tests rather than assumed here.
   */
  async function reviveSuperseded(target) {
    if (!target?.supersedes_id) return null
    const prior = await txn_memories.findOne({
      where: { id: target.supersedes_id, persona: P, expired_at: null },
      raw: true,
    })
    // Not found, or deliberately deleted (expired_at set) → leave it alone. Deleting a belief is an
    // explicit act; reviving it as a side effect of deleting its successor would override the user.
    if (!prior) return null
    if (prior.user_id !== target.user_id) return null // scope guard (identity rows are user_id null)
    if (!prior.invalid_at) return null // already live — nothing to revive
    // Does anything else already hold this slot? Prefer slot_id (the real identity); fall back to the
    // (entity, attribute) key for rows written before the Slot store existed.
    const where = prior.slot_id
      ? { slot_id: prior.slot_id }
      : { entity: prior.entity, attribute: prior.attribute, user_id: prior.user_id }
    // `prior` is invalid at this point (checked above), so a live-row count can never include it —
    // no id-exclusion needed, and no extra sequelize operator import to get it wrong.
    const others = await txn_memories.count({ where: { ...where, persona: P, invalid_at: null, expired_at: null } })
    if (others > 0) return null
    await txn_memories.update({ invalid_at: null, tier: 'warm' }, { where: { id: prior.id } })
    audit({
      memoryId: prior.id, action: 'revive', relatedId: target.id, slotId: prior.slot_id ?? null,
      reason: `un-superseded: the belief that displaced it (${target.id}) was forgotten`,
      before: snapshot(prior), after: { invalid_at: null, tier: 'warm' }, source: prior.source ?? null,
    })
    log?.info?.(
      { revived: prior.id, after: target.id, slot: prior.slot_id, attribute: prior.attribute },
      'memory: un-superseded — forgetting a fact restored the belief it had displaced',
    )
    return view({ ...prior, invalid_at: null, tier: 'warm' })
  }

  // recall = activate the working set (reinforces the memories it surfaces — ACT-R base-level)
  async function recall(opts = {}) {
    const hits = await retrieve(opts)
    await reinforce(hits.map((h) => h.id))
    return { count: hits.length, memories: hits.map(view) }
  }

  // Mean of member embedding vectors → a cluster centroid (cosine is scale-invariant, so no need to
  // renormalize). Used to match a new topic-cluster against existing live cards for EVOLUTION.
  function centroid(vecs) {
    const arrs = vecs.filter((v) => Array.isArray(v) && v.length)
    if (!arrs.length) return null
    const n = arrs[0].length
    const out = new Array(n).fill(0)
    for (const v of arrs) for (let i = 0; i < n; i++) out[i] += v[i]
    for (let i = 0; i < n; i++) out[i] /= arrs.length
    return out
  }
  // cosine centroid-vs-card floor to treat a new cluster as the SAME topic as an existing card →
  // evolve it. Above inter-topic (~0.40) and below the tighter intra-topic clustering (~0.6); a
  // card summarises its topic so a same-topic member-centroid lands here. Heuristic; tune if needed.
  const CARD_MERGE_THRESHOLD = 0.5

  // ── DREAMING / consolidation primitives (RFC §14) ────────────────────────────────────────────────
  // The Phase-3 DCPM System-2 pass, now SPLIT along the pipeline's grain: the OBSERVER (cluster + have an
  // LLM induce a card) lives in memory-dream.js and only PERCEIVES; these are the store-side primitives it
  // proposes into. Facts (semantic) are deliberately NOT consolidated — they stay atomic (reconcile owns
  // them). LIVING CARDS: a cluster whose topic matches an existing live card EVOLVES it — the new card
  // supersedes the old (history kept via the supersedes chain) and `evidence` records the members, their
  // source_message_ids and the superseded card id. This is CONSOLIDATION (summarise evidence), never
  // reinterpretation (that is Reflection's job — see the grounding clause in buildCardPrompt).

  /** This scope's live episodic clusters, biggest-topic-first, capped. The observer's raw material. */
  async function episodeClusters({ minSize = 4, threshold = 0.55, maxCards = 5 } = {}) {
    const episodes = await txn_memories.findAll({
      where: { persona: P, user_id: U, kind: 'episodic', invalid_at: null, expired_at: null }, raw: true,
    })
    return consolidationPlan(clusterMemories(episodes, { threshold }), { minSize }).slice(0, maxCards)
  }

  /**
   * findPriorCard — RESOLUTION for cards: which existing live card is this cluster ABOUT? Matched by the
   * members' centroid against each card's embedding. ONE definition, used both by the observer (to give the
   * LLM the existing summary as context for merging) and by commitCard (which is AUTHORITATIVE).
   */
  async function findPriorCard(memberIds = []) {
    if (!memberIds.length) return null
    const members = await txn_memories.findAll({ where: { id: memberIds }, raw: true })
    const c = centroid(members.map((m) => m.embedding))
    if (!c) return null
    const liveCards = await txn_memories.findAll({
      where: { persona: P, user_id: U, kind: 'card', invalid_at: null, expired_at: null }, raw: true,
    })
    let prior = null
    let best = CARD_MERGE_THRESHOLD
    for (const lc of liveCards) {
      if (!Array.isArray(lc.embedding)) continue
      const cs = cosine(c, lc.embedding)
      if (cs >= best) { best = cs; prior = lc }
    }
    return prior
  }

  /**
   * commitCard — PERSISTENCE for a card observation: resolve the prior card, write the new one, retire the
   * prior version, and soft-archive the evidence members (expired_at + cold) so the card now represents
   * them in recall. The Dreaming observer never writes; it proposes and this executes.
   */
  async function commitCard({ topic, summary, memberIds = [], namespace = null } = {}) {
    if (!topic || !summary) throw new Error('topic and summary are required')
    const prior = await findPriorCard(memberIds)
    const members = memberIds.length ? await txn_memories.findAll({ where: { id: memberIds }, raw: true }) : []
    const content = `[${topic}] ${summary}`
    const { vector, model } = embed ? await embed(content) : { vector: null, model: null }
    const evidence = {
      members: memberIds,
      sourceMessages: members.map((m) => m.source_message_id).filter(Boolean),
      count: memberIds.length,
      supersedes: prior?.id ?? null,
    }
    const row = await txn_memories.create({
      persona: P, user_id: U, namespace: namespace || members[0]?.namespace || prior?.namespace || 'default', kind: 'card',
      content, embedding: vector, embedding_model: model,
      entity: topic, attribute: 'summary',
      importance: 6, confidence: CONFIDENCE_DEFAULT.consolidation, valid_at: new Date(now()), source: 'consolidation', tier: 'warm',
      supersedes_id: prior?.id ?? null, evidence,
    })
    if (prior) await txn_memories.update({ invalid_at: new Date(now()) }, { where: { id: prior.id } })
    if (memberIds.length) await txn_memories.update({ expired_at: new Date(now()), tier: 'cold' }, { where: { id: memberIds } })
    return { ok: true, id: row.id, topic, summary, archived: memberIds.length, evolved: !!prior, evidence }
  }

  return {
    remember,
    reconcileFact, // Phase 2b: distill a turn into an atomic fact, update-not-append
    getIdentity, // Memory V3 Phase 1: read the user's identity slot (preferred_name/…)
    setIdentity, // Memory V3 Phase 1: write the user's identity slot (dedicated, not via reconcile)
    // Fire-and-forget variants for the model's own memory tools: validate cheaply + synchronously
    // (so a bad tool call still returns a retryable error to the model), then run the slow
    // embed+reconcile+persist on the background queue and return at once. The turn moves on.
    rememberAsync(opts = {}) {
      if (!opts.content || !String(opts.content).trim()) throw new Error('content is required')
      enqueueWrite('remember', () => remember(opts))
      return { ok: true, queued: true }
    },
    reconcileFactAsync(opts = {}) {
      const { entity, attribute, value } = opts
      if (!entity || !attribute || value == null || !String(value).trim()) throw new Error('entity, attribute, value are required')
      enqueueWrite('reconcileFact', () => reconcileFact(opts))
      return { ok: true, queued: true }
    },
    // Share the SERIAL background write queue with pipeline-routed writes (Phase 5.5), so a tool write
    // that now travels the pipeline keeps the same guarantees: off the turn's critical path, one write at
    // a time (no CPU-embed contention, no same-slot race within a turn).
    enqueue: enqueueWrite,
    _drainWrites: () => WRITE_LANES.get(laneKey) ?? Promise.resolve(), // tests: await this scope's queued writes
    recall,
    // DREAMING primitives (RFC §14): the observer clusters + induces; these resolve + persist.
    episodeClusters,
    findPriorCard,
    commitCard,
    getSource, // provenance: the source message + context a memory was saved from
    list, // enumerate (unranked) — "show everything" so the model can clear one-by-one
    listArchived, // enumerate what is NO LONGER believed (superseded / forgotten) — inspection only
    getWorkingMemory: recall, // alias: the activated set fed into the prompt
    // ⚠ PUBLIC SO USE CAN BE RECORDED WHERE IT ACTUALLY HAPPENS. `recall()` reinforces everything it
    // RETURNS, which is the right rule when returning IS using. It is the wrong rule for L3 notes: they are
    // fetched every turn and then TRIMMED to the context budget, so reinforcing at fetch time would count
    // turns rather than uses — an `access_count` that rises at a constant rate looks like a signal and is
    // not one. The route reinforces the notes that survived the budget, i.e. the ones a model actually saw.
    reinforce,
    // read-only ranked search (does NOT reinforce — for inspection/tools)
    async search(query, opts = {}) {
      const hits = await retrieve({ ...opts, query })
      return { count: hits.length, matches: hits.map(view) }
    },
    async pin({ id, pinned = true } = {}) {
      if (!id) throw new Error('id is required')
      const [n] = await txn_memories.update({ pinned: !!pinned }, { where: { id, persona: P } })
      return { ok: true, updated: n > 0, pinned: !!pinned }
    },
    // soft-forget: mark system-expired + demote to cold; never hard-delete (belief history preserved).
    //
    // UN-SUPERSEDE (2026-08-03): forgetting a fact that DISPLACED another one must give the displaced one
    // back, or deleting a wrong belief silently empties the slot instead of reverting it. This is not
    // hypothetical — a junk fact scraped from a pasted JSON ("role/association: On Behalf Of (for PR)")
    // superseded Ote's real "role: root of Ote's LLM Services platform" (importance 10, recalled 109×);
    // deleting the junk left the slot with ZERO live rows and the true belief unreachable, because every
    // read path filters on `invalid_at IS NULL AND expired_at IS NULL`. History was preserved and useless.
    //
    // The store owns convergence, not the caller (Ote's idempotent-persistence principle): the model
    // should not have to know that deleting X requires resurrecting Y. Conditions, all required:
    //   - the forgotten row actually superseded something (`supersedes_id`)
    //   - that predecessor was only INVALIDATED, never itself deleted (expired_at IS NULL) — a row the
    //     user deliberately deleted must never come back through the side door
    //   - it is in this scope
    //   - the slot has no OTHER live row, so we can never create a second live belief in one slot
    // Exactly ONE link is followed: in a chain A←B←C, forgetting C revives B (not A). Forgetting B later
    // revives A, one deliberate step at a time. `plan.collapse` duplicates are deliberately NOT revived —
    // they were removed for being redundant, not for being wrong.
    async forget({ id } = {}) {
      if (!id) throw new Error('id is required')
      const target = await txn_memories.findOne({ where: { id, persona: P }, raw: true })
      if (!target) return { ok: true, forgotten: false, restored: null }
      const [n] = await txn_memories.update({ expired_at: new Date(now()), tier: 'cold' }, { where: { id, persona: P } })
      if (!n) return { ok: true, forgotten: false, restored: null }
      audit({ memoryId: id, action: 'forget', slotId: target.slot_id ?? null, before: snapshot(target),
        reason: 'soft-forget (archived, recoverable)', source: target.source ?? null })
      let restored = null
      try { restored = await reviveSuperseded(target) } catch (e) {
        // A failed revive must never turn a successful forget into an error — the forget already
        // committed, and the predecessor stays recoverable from the admin inspector either way.
        log?.warn?.({ err: e?.message, id }, 'memory: forget succeeded but un-supersede failed')
      }
      return { ok: true, forgotten: true, restored }
    },
    // RESTORE — the inverse of forget, and the capability whose absence Ote named: "a memory system that
    // can only lose isn't trustworthy". Until now an archived row could be viewed in the admin inspector
    // and then only left alone or hard-deleted; nothing anywhere could bring one back.
    //
    // It clears `expired_at` (the archive) ALWAYS, and `invalid_at` (the supersede) only when the slot is
    // free — same one-live-belief-per-slot invariant as reviveSuperseded. The two outcomes are reported
    // honestly rather than collapsed into "ok": restoring a fact whose slot someone else now holds leaves
    // it un-archived but still not believed, and a caller told only "restored: true" would go on to
    // report a recovery that did not happen.
    async restore({ id } = {}) {
      if (!id) throw new Error('id is required')
      const row = await txn_memories.findOne({ where: { id, persona: P }, raw: true })
      if (!row) return { ok: true, restored: false, reason: 'not found' }
      if (row.user_id !== U && row.user_id !== null) return { ok: true, restored: false, reason: 'not in scope' }
      if (!row.invalid_at && !row.expired_at) return { ok: true, restored: false, nowLive: true, reason: 'already live' }
      // ⚠️ THE SLOT IS CHECKED UNCONDITIONALLY, not only when the row was superseded. The first version
      // guarded only the `invalid_at` case and the live integrity check caught it immediately: a row that
      // was FORGOTTEN WHILE LIVE has invalid_at null, so un-archiving it made it live beside whatever had
      // since taken the slot — two contradictory beliefs, the exact invariant this is supposed to defend.
      const where = row.slot_id
        ? { slot_id: row.slot_id }
        : { entity: row.entity, attribute: row.attribute, user_id: row.user_id }
      const holder = await txn_memories.findOne({
        where: { ...where, persona: P, invalid_at: null, expired_at: null }, raw: true,
      })
      const blockedBy = holder && holder.id !== row.id ? holder.id : null
      // Un-archive always. When something else holds the slot the row comes back as SUPERSEDED rather
      // than live — which is the truthful state, and keeps it eligible for the ordinary un-supersede
      // path later if the holder is itself removed.
      const patch = blockedBy
        ? { expired_at: null, invalid_at: row.invalid_at ?? new Date(now()), tier: 'cold' }
        : { expired_at: null, invalid_at: null, tier: 'warm' }
      await txn_memories.update(patch, { where: { id } })
      const nowLive = !blockedBy
      audit({
        memoryId: id, action: 'revive', slotId: row.slot_id ?? null, relatedId: blockedBy,
        reason: blockedBy
          ? `restored from archive, but slot still held by ${blockedBy} — un-archived, not believed`
          : 'restored from archive',
        before: snapshot(row), after: { ...patch }, source: row.source ?? null,
      })
      return { ok: true, restored: true, nowLive, blockedBy, memory: view({ ...row, ...patch }) }
    },
    _retrieve: retrieve, // exposed for tests
    _denseRelevances: denseRelevances, // exposed for tests (verify the pgvector arm is active)
  }
}
