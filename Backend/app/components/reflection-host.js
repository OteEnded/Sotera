// Reflection — the L3 "Persona Notes" layer (roadmap step 5; RFC_COGNITIVE_CONTEXT_LAYER L3:
// "what have I recently learned that helps me work better?"). Persona-owned OPERATIONAL sticky notes
// (current focus, preferred explanation style, stable observations) — distinct from Memory's knowledge
// and from Cards' consolidated summaries. Ote's law: Cards own CONSOLIDATION (grounded synthesis, no
// reinterpretation); Reflection owns REINTERPRETATION (operational insight → L3). Never merge.
//
// PORTABILITY (Ote's framing): the shape is Reflection Feature → Reflection HOST ADAPTER → LLMServices.
// THIS file is the Host Adapter — the LLMServices implementation of the `reflection` service contract.
// When PersonaTemplate (Milestone B) is ready, only THIS adapter moves; the portable Feature and the
// method contract ({ listActiveNotes, addNote, removeNote }) stay put. So nothing here assumes anything
// PersonaTemplate-specific — it just persists L3 notes as kind='note' memories (bi-temporal history,
// provenance, embeddings, and scoping for free; `note` is isolated from normal recall by the memory
// service's scope, so notes never double-inject as retrieved memories).

import { registerHostService } from './runtime.js'
import { buildMemoryV2 } from './memory-v2-host.js' // READS only (list/forget); writes go via the pipeline
import { buildMemoryPipeline } from './memory-pipeline-host.js'
import { chat } from '../chat-runtime/index.js'
import { getSetting } from '../settings/index.js'
import { buildReflectionPrompt, parseNotes, classifyNotesReply, selectSignals } from './reflection.js'

/**
 * WHICH L3 NOTES THIS TURN GETS, AND IN WHAT ORDER — **DETERMINISTICALLY, AND THAT IS THE WHOLE POINT.**
 *
 * ⚠️ 2026-08-08: THE PER-TURN RANKING WAS REMOVED. IT COST 22.5× ON EVERY TURN AND BOUGHT NOTHING.
 *
 * L3 notes are injected into `preHistory` — the CACHED PREFIX, before the conversation history. From
 * 2026-08-06 they were also re-ranked against each turn's question, so the same five notes arrived in a
 * different ORDER, and a different order is different BYTES. For an ollama-kind provider the prompt is
 * append-only: change one byte early and every token after it is re-evaluated.
 *
 *   MEASURED, twice, on a ~9,000-token prompt:  memory ON 2,141 ms  ·  memory OFF 97 ms  →  22.5×
 *   Ruled out first: eviction (the chat model held 6,605 MiB throughout) and recall (it lives in the TAIL).
 *
 * ⚠️ AND THE RANKING WAS NOT DOING ITS JOB ANYWAY. It existed so the note most relevant to the question
 * would win. Measured across 13 consecutive turns: the **three most GENERIC notes won 13/13 slots and the
 * nine specific ones won 0**. Generic text sits near every query; specific text spikes rarely. So the
 * feature being given up here is one that demonstrably did not work, at a price that was very real.
 *
 * ⇒ Selection and order are now **independent of the turn's question**: importance first, newest within
 * ties. Same notes, same order, every turn → the prefix is byte-stable → the cache is reused.
 *
 * ⚠️ THIS IS AN INTERIM FIX AND IT IS NOT THE ARCHITECTURALLY RIGHT ONE. Per-turn content belongs in the
 * runtime TAIL, not the prefix (see `composeRuntimeTail`). But *where L3 lives* is a persona-layer decision
 * Ote is designing, so this recovers the number without spending that decision. Ote, 2026-08-08: a fast
 * call for OLS today, with his own design to follow.
 *
 * ⚠️ WHAT THIS DOES NOT FIX: the WORDING. Every live note is still imperative and generic — that half is
 * persona-layer and stays open.
 *
 * ⚠️ `list()` NOT `search()`/`recall()` — notes are held out of general recall on purpose (see the header of
 * this file) so they never double-inject as retrieved memories, and neither read reinforces. Use is recorded
 * by the route AFTER the budget trim: notes are fetched every turn, so reinforcing at fetch time would count
 * turns rather than uses and produce an access_count that climbs at a constant rate while measuring nothing.
 *
 * @param {object} opts.query IGNORED, kept so callers do not break. Passing it must never reintroduce
 *        per-turn variance — that is the defect above.
 */
export async function selectActiveNotes(mem, { limit = 6 } = {}) {
  const { memories } = await mem.list({ kind: 'note', limit: Math.max(limit, 50) })
  return memories
    .slice() // list() is newest-first; a STABLE importance sort therefore keeps the freshest within ties
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .slice(0, limit)
}

/**
 * Record that these notes were actually PLACED IN A PROMPT — not merely fetched. Called by the route after
 * the Composer's budget trim, which is the only place that knows what a model really saw.
 * Never throws: recording use must not be able to fail a reply that already succeeded.
 */
export async function reinforceNotes(mem, ids = []) {
  const list = (ids || []).filter(Boolean)
  if (!list.length) return { reinforced: 0 }
  try { await mem.reinforce(list) } catch { return { reinforced: 0 } }
  return { reinforced: list.length }
}

/**
 * Build a Reflection host adapter bound to (persona, user). Backed by the memory store (kind='note').
 * @param {*} fastify
 * @param {{userId?:string|null, persona?:string|null}} scope
 */
export function buildReflection(fastify, { userId = null, persona } = {}) {
  // Reflection is JUST ANOTHER OBSERVER (RFC §4/§14): it reads knowledge and emits Observations, it never
  // writes the store itself. So notes go through the OBSERVATION PIPELINE (prose → EpisodicResolver, whose
  // dedup-by-similarity gives the same convergent behaviour addNote always relied on).
  const { mem, pipeline } = persona === undefined
    ? buildMemoryPipeline(fastify, { userId })
    : buildMemoryPipeline(fastify, { userId, persona })
  return {
    /** Active L3 notes for this persona+user, most-important-first (list() already returns newest-first,
     *  so a stable importance sort keeps freshest within a tie). Capped small — L3 is a few sticky notes. */
    async listActiveNotes(opts = {}) { return selectActiveNotes(mem, opts) },

    /** Record that these notes were actually PLACED IN A PROMPT (not merely fetched). See the route. */
    async reinforceNotes(ids = []) { return reinforceNotes(mem, ids) },
    /** PROPOSE one L3 note as an Observation. A near-identical note reinforces rather than duplicating —
     *  the store is convergent, so Reflection needn't pre-check. `kind:'note'` rides through as the
     *  persistence hint, so notes still land in their own tier. */
    async addNote({ content, importance = 5, source = null, sourceMessageId = null } = {}) {
      const r = await pipeline.ingest({ type: 'episodic', content, kind: 'note', importance, source: source ?? 'reflection', sourceMessageId })
      return r?.result ?? { ok: false, dropped: !!r?.dropped }
    },
    /** Remove a note the persona no longer keeps (soft-forget via the memory store; forget takes {id}). */
    async removeNote(id) { return mem.forget({ id }) },
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The TRIGGER side (R2). Reflection is a portable COMPONENT (reflection.js); the trigger is a
// swappable host concern. TODAY the trigger is the nightly cron (reflectAll, gated by
// memory.reflectMode — off/shadow/on, OFF by default). When PersonaTemplate's Feature runtime
// arrives it will call the SAME reflectScope on conversation-close / idle / manual / schedule — we
// replace the trigger, not Reflection. reflectScope writes L3 through the host adapter above.

const DEFAULT_REFLECT_MODEL = 'ollama/gemma4:e4b'
/** 'off' | 'shadow' (propose + log, no write) | 'on' (write). */
export function reflectMode(config) {
  try { const v = getSetting(config, 'memory.reflectMode'); return ['off', 'shadow', 'on'].includes(v) ? v : 'off' } catch { return 'off' }
}
function reflectModel(config) {
  try { return getSetting(config, 'memory.reflectModel') || getSetting(config, 'memory.consolidateModel') || DEFAULT_REFLECT_MODEL } catch { return DEFAULT_REFLECT_MODEL }
}
function reflectMaxNotes(config) {
  try { const v = getSetting(config, 'memory.reflectMaxNotes'); return Number.isInteger(v) && v > 0 ? v : 20 } catch { return 20 }
}
function reflectMinSignals(config) {
  try { const v = getSetting(config, 'memory.reflectMinSignals'); return Number.isInteger(v) && v >= 0 ? v : 4 } catch { return 4 }
}
function auxNumCtx(config) {
  try { const v = getSetting(config, 'memory.auxNumCtx'); return Number.isInteger(v) && v > 0 ? v : 8192 } catch { return 8192 }
}
function splitModelId(full) {
  const i = full.indexOf('/')
  return i === -1 ? { provider: 'ollama', model: full } : { provider: full.slice(0, i), model: full.slice(i + 1) }
}
/**
 * TEMPERATURE 0 — and the measurement here overturned my own earlier conclusion, which is why it is written
 * down. I had recorded that "temperature 0 is not a universal good" because reflection produced notes on 2 of 5
 * runs at default temperature and 0 of 5 at temperature 0, and read the zero as a collapse. Looking at the
 * actual replies: the model returns a literal `[]` — the CORRECT answer for the trivia it was given — and at
 * default temperature it INVENTED a note roughly 1 run in 5. So temperature 0 did not suppress output; it
 * suppressed CONFABULATION, and made the right answer reliable.
 *
 * That matters more here than almost anywhere: a reflection note is durable persona guidance. A note invented
 * from "favourite number: 7" would go on steering how the assistant treats the user, indefinitely. Same
 * permanence argument as a promoted alias.
 *
 * numGpu 0 for the same reason as every other aux call: on this box a GPU-placed aux model evicts the chat
 * model and the user's next turn pays the reload.
 */
function makeReflectLlm(fastify, { userId = null } = {}) {
  const { provider, model } = splitModelId(reflectModel(fastify.config))
  return async (prompt) => {
    const res = await chat({
      serverConfig: fastify.config,
      request: { provider, model, messages: [{ role: 'user', content: prompt }], options: { stream: false, reasoning: { enabled: false }, max_tokens: 400, numCtx: auxNumCtx(fastify.config), temperature: 0, numGpu: 0 }, userId },
    })
    return res?.message?.content || ''
  }
}

/**
 * Reflect over ONE (persona, user) scope: read grounded signals (semantic facts + cards), distil a few
 * new operational notes via the pure component, and write them to L3 (dedup + cap enforced). Signals =
 * memories + cards ONLY (Ote's choice) — never raw conversation text. Never throws into its caller.
 * @returns {{skipped?:boolean, reason?:string, added:number, notes?:string[], trimmed?:number}}
 */
export async function reflectScope(fastify, { persona = null, userId = null, dryRun = false, llm = null } = {}) {
  const mem = buildMemoryV2(fastify, { userId, persona })
  const refl = buildReflection(fastify, { userId, persona })
  const cap = reflectMaxNotes(fastify.config)
  const [facts, cards, existing] = await Promise.all([
    mem.list({ kind: 'semantic', limit: 200 }),
    mem.list({ kind: 'card', limit: 50 }),
    refl.listActiveNotes({ limit: cap }),
  ])
  const signalN = (facts.memories?.length || 0) + (cards.memories?.length || 0)
  if (signalN < reflectMinSignals(fastify.config)) return { skipped: true, reason: 'too-few-signals', added: 0 }
  const existingNotes = existing.map((n) => n.content)
  const prompt = buildReflectionPrompt({
    memories: selectSignals(facts.memories || [], { max: 30 }),
    cards: selectSignals(cards.memories || [], { max: 20 }),
    existingNotes,
    maxNotes: 5,
  })
  let raw = ''
  try { raw = await (llm || makeReflectLlm(fastify, { userId }))(prompt) } catch { return { skipped: true, reason: 'llm-error', added: 0 } }
  // A SILENT ZERO IS NOT EVIDENCE OF ABSENCE (architecture principle #14) — and my FIRST attempt at this got it
  // wrong in the same way, one level up. It reported `no-notes-parsed`, which lumped a PARSE FAILURE together
  // with the model returning a literal `[]`. Measured on the real path: gemma4:e4b returns exactly `[]` on
  // every run, because the facts it was given ("fear: moths", "favorite number: 7") are trivia and the prompt
  // explicitly says not to restate a fact that does not change HOW to respond. So the zero was reflection being
  // RIGHT, and my label made healthy behaviour look like a defect. `classifyNotesReply` separates all four.
  const proposed = parseNotes(raw, { maxNotes: 5 }) // what the model produced, before dedup
  const notes = parseNotes(raw, { maxNotes: 5, existingNotes }) // what survives as NEW
  const yieldReason = notes.length ? null : classifyNotesReply(raw, { maxNotes: 5, existingNotes })
  if (!notes.length) {
    try { fastify?.log?.info?.({ persona, userId, signals: signalN, rawChars: raw.length, proposed: proposed.length, reason: yieldReason }, '[reflection] produced no NEW notes') } catch { /* no logger bound */ }
  }
  if (dryRun) return { added: notes.length, notes, proposed: proposed.length, reason: yieldReason ?? undefined, dryRun: true }
  // ⚠ A NOTE HAS NO SOURCE MESSAGE, AND SAYING SO IS THE PROVENANCE.
  //
  // Every other memory kind carries a `source_message_id`; notes are the ONLY kind with none, and until now
  // they also carried a bare `source: 'reflection'` that said nothing about where they came from. Measured
  // 2026-08-06 on hermes_agent's store: 3 notes, all `source: reflection`, all `source_message_id` NULL.
  //
  // The fix is NOT to invent a message pointer. Reflection distils from FACTS AND CARDS, never from raw
  // conversation text (Ote's choice, see this function's header) — so there is no single message a note came
  // from, and manufacturing one would be the exact failure hermes_agent caught in the semantic rows: a
  // derived belief impersonating a quoted one. Her own line is the test: *"a memory without a source message
  // is either correct by accident or wrong by default"* — a note is neither, PROVIDED it says it is derived.
  //
  // So the derivation is recorded instead: how many signals it was induced from. That is checkable, it can
  // never be mistaken for something the user said, and it gives a reader the one thing they need to judge a
  // note — whether it rests on a broad pattern or on almost nothing.
  const derivedFrom = `reflection:derived(facts=${facts.memories?.length || 0},cards=${cards.memories?.length || 0})`
  for (const content of notes) {
    try { await refl.addNote({ content, importance: 6, source: derivedFrom }) } catch { /* best-effort per note */ }
  }
  // enforce the per-scope cap: keep the top `cap` (most-important, then freshest), soft-forget the rest.
  let trimmed = 0
  const all = await refl.listActiveNotes({ limit: 1000 })
  if (all.length > cap) {
    for (const n of all.slice(cap)) { try { await refl.removeNote(n.id); trimmed++ } catch { /* best-effort */ } }
  }
  return { added: notes.length, notes, proposed: proposed.length, reason: yieldReason ?? undefined, trimmed }
}

/**
 * Enumerate every (persona, user) scope with enough grounded signals and reflect each. Bounded by
 * `maxScopes`. Gated by memory.reflectMode ('off' → skip unless force). Pass dryRun for shadow runs
 * (proposes without writing). A failing scope is logged + skipped, never aborts the batch. This is the
 * CRON trigger's entry point (the cron is just ONE trigger — the Feature runtime will call it too).
 * @returns {{skipped?:boolean, reason?:string, scopes:number, added:number, trimmed:number, details?:Array}}
 */
export async function reflectAll(fastify, { maxScopes = 25, dryRun = false, force = false } = {}) {
  if (!force && reflectMode(fastify.config) === 'off') return { skipped: true, reason: 'disabled', scopes: 0, added: 0, trimmed: 0 }
  const { txn_memories } = fastify.db || {}
  if (!txn_memories) return { skipped: true, reason: 'no-db', scopes: 0, added: 0, trimmed: 0 }
  const min = reflectMinSignals(fastify.config)
  const { tableName, schema } = txn_memories.getTableName()
  const table = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`
  const rows = await txn_memories.sequelize.query(
    `SELECT persona, user_id FROM ${table} WHERE kind IN ('semantic','card') AND invalid_at IS NULL AND expired_at IS NULL ` +
    `GROUP BY persona, user_id HAVING count(*) >= :min`,
    { replacements: { min }, type: 'SELECT' },
  )
  const truncated = Math.max(0, rows.length - maxScopes)
  const scopes = rows.slice(0, maxScopes)
  let added = 0
  let trimmed = 0
  const details = []
  for (const s of scopes) {
    try {
      const r = await reflectScope(fastify, { persona: s.persona ?? null, userId: s.user_id ?? null, dryRun })
      added += r.added || 0
      trimmed += r.trimmed || 0
      if (r.added) details.push({ persona: s.persona ?? null, userId: s.user_id ?? null, added: r.added, notes: r.notes })
    } catch (e) {
      fastify.log?.warn?.({ err: e?.message, persona: s.persona, userId: s.user_id }, '[reflection] scope failed')
    }
  }
  return { scopes: scopes.length, added, trimmed, dryRun, ...(truncated ? { truncated } : {}), details }
}

let initialized = false
/**
 * Register the `reflection` host service (idempotent). The seam a portable Reflection Feature consumes
 * via ctx.services.reflection (R2). Mirrors initTodo / initConversationSearch. Read-path callers (the
 * chat route's Composer gather) may also call buildReflection() directly, like buildMemoryV2.
 */
export function initReflection() {
  if (initialized) return
  initialized = true
  registerHostService('reflection', ({ fastify: f, user }) =>
    buildReflection(f, { userId: user?.id ?? null }))
}
