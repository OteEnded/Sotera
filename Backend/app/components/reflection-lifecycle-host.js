// THE REFLECTION LIFECYCLE — the HOST half: the clock, the transcript, the turn, the tools, the row.
//
// ⭐⭐ WHAT WAS ACTUALLY BROKEN, MEASURED BEFORE ANY OF THIS WAS WRITTEN (2026-08-20). There is **no
// conversation-end trigger anywhere in `Backend/app`** — one grep hit, and it is prose inside a system
// prompt. Reflection (the L3 notes one), the episode distiller and consolidation all ride the 04:10 daily
// pass, and `episodeDistillEnabled` / `consolidateEnabled` are BOTH FALSE. The noticing pass is time-
// sampled and writes a JSONL that nothing turns into a memory. ⇒ Ote's description was exactly right:
// her memory really was *"whatever happens to be captured during a turn."*
//
// This file is the occasion that was missing. The pure half (`reflection-lifecycle.js`) holds the
// question, the trigger predicate and the readers; everything with IO in it lives here.
//
// ── ⛔ ONE WRITE LANE, AND IT IS NOT THIS FILE ───────────────────────────────────────────────────────
// Ote: *"Use the existing single memory write lane. Don't introduce a second memory writer."* ⇒ NOTHING
// here writes `txn_memories`. If she retains something it is because **she called a tool**, and the tool
// wrote it exactly as it would in an ordinary turn. This file writes ONE table: `log_conversation_revisits`, which
// records that the occasion happened and what came of it.
//
// ── ⭐ AUTHORSHIP FOLLOWS THE OCCASION ──────────────────────────────────────────────────────────────
// The tool context is built with `memoryAuthor: 'persona'` (migration 015's axis, reachable for the first
// time — see `buildMemoryV2`). Same tool, same content, same room: called mid-conversation it is the human
// speaking and the row is `account`-authored; called in a reflection it is her own decision and the row is
// hers. ⛔ Declared by this call site, never inferred downstream.
//
// ── ⚠️ WHAT THIS PASS DOES NOT GATE, STATED SO IT IS NOT DISCOVERED LATER ───────────────────────────
// The noticing pass runs a CONSTITUTIVE TRIPWIRE and flags claims like *"the void where I wait"* for human
// review — it can afford to, because it writes nothing. This pass writes, and it has **no such gate**. That
// is not an oversight: her tools already write durably in ordinary turns with no tripwire between them and
// the store, so a filter here would be inconsistent AND would be a content filter on her own memory
// formation, which is a decision for Ote and not for this file. ⇒ Reported, not silently added.

import { Op } from 'sequelize'
import { statSync } from 'node:fs'
import { chat } from '../chat-runtime/index.js'
import { getSetting } from '../settings/index.js'
import { log } from '../../lib/utility.js'
import { buildToolContext, runTool, toolDefinitions } from './runtime.js'
import { isRootConnectedUser } from '../auth/root-identity.js'
import {
  REFLECTION_GENERATION, REFLECTION_TOOLS, buildReflectionTurnPrompt, isReadyToReflect,
  shapeReflectionTranscript, readWrittenMemoryId, isDisclosureRefusal, unreviewedSlice,
} from './reflection-lifecycle.js'
// ⭐ THE EXECUTION GATE. ⛔ Imported, never reimplemented: the pure verdict lives in one file so a
// check can drive "she has been idle six minutes" without waiting six minutes.
import { checkIdleGate, gateSummaryLine } from './revisit-idle-gate.js'
// ⭐ The sweep's SELECTOR. ⛔ It decides nothing — see `sweepStalled` below for why the act and the
// selection are deliberately different things.
// ⭐ `admitToQueue` is the two-lane budget rule. ⛔ It lives beside the lifecycle, not here, so the
// property Ote asked for — *"correct as the backlog grows"* — is testable without a database.
import { stalledAttempts, admitToQueue } from './revisit-lifecycle.js'
// ⭐ The SAME drain the 5-minute job and the daily catch-up call. ⛔ Not a second indexing path — Ote:
// *"Keep the existing drainPendingEmbeddings mechanism. Do not build a second indexing pipeline."*
import { drainPendingEmbeddings } from './conversation-search.js'
import { EVIDENTIAL_WHERE, evidentialSql } from './corpus-eligibility.js'

// ⭐ READ ONCE AT MODULE LOAD, NEVER PER ROW. Same rule and the same reason as the noticing pass: this
// must report the code that is LOADED, not the file on disk. The manual version of this check failed three
// times in one day — twice the pass ran on stale code (once for 96 minutes) while `/health` returned 200
// throughout, because health says a process is answering, not which modules it is holding.
// ⭐⭐ BOTH HALVES, BECAUSE THE TOOLSET LIVES IN THE OTHER ONE. Ote's provenance requirement is
// *"which generation, code, model, tools, and available context produced an observation"* — and the
// **tools she was OFFERED** are `REFLECTION_TOOLS`, a constant in the PURE file. Stamping only this file's
// mtime meant the offered set could change with the recorded provenance unmoved: a row would say which
// code wrote it and not which code chose its tools. ⇒ `host=…|pure=…`, so one row pins both.
// ⓘ `tools_used` is what she CALLED; this is how to recover what was AVAILABLE to call. The two are
// different questions and `tools_used: []` cannot answer the second one.
// ⚠ The format changed on 2026-08-21 — the first six rows carry a bare ISO timestamp (this file only).
// That is visible rather than hidden, which is the point of stamping it at all.
// Ticks since this process started — for the heartbeat below. ⛔ Not persisted: it exists to prove the
// job is alive in THIS process, and a restart legitimately resets it.
let ticks = 0

const CODE_MTIME = (() => {
  const at = (u) => { try { return statSync(new URL(u, import.meta.url)).mtime.toISOString() } catch { return '?' } }
  const host = at(import.meta.url)
  const pure = at('./reflection-lifecycle.js')
  return host === '?' && pure === '?' ? null : `host=${host}|pure=${pure}`
})()

// ── ⚠️ THE KNOBS ARE READ FROM `config.json`, NOT FROM `getSetting` ─────────────────────────────────
// `getSetting` THROWS on an unregistered key, so a `try/catch → fallback` wrapper around it would silently
// swallow every value Ote actually wrote in `config.json` and use my default instead — a setting that
// exists, reads correctly to a human, and does nothing. (`memory.noticingEnabled` is read the same direct
// way for the same reason.) ⓘ `chat.defaultModel` IS registered, so that one goes through getSetting.
const cfg = (config, key, fallback) => {
  const v = config?.memory?.[key]
  return v === undefined || v === null ? fallback : v
}
const intCfg = (config, key, fallback) => {
  const v = cfg(config, key, fallback)
  return Number.isInteger(v) && v > 0 ? v : fallback
}
const registered = (config, key, fallback) => {
  try { const v = getSetting(config, key); return v === undefined || v === null ? fallback : v } catch { return fallback }
}
function splitModelId(full) {
  const i = full.indexOf('/')
  return i === -1 ? { provider: 'ollama', model: full } : { provider: full.slice(0, i), model: full.slice(i + 1) }
}

/**
 * ⭐ HER OWN CHAT MODEL BY DEFAULT, AND THAT IS THE ARGUMENT, NOT A SHORTCUT.
 *
 * Every other background pass uses a small aux model at `numGpu: 0`, because a GPU-placed aux model evicts
 * the chat model and the person's next turn pays ~29 s for the reload. Reflection inverts both halves:
 *   · *"Sotera decides whether anything matters"* — a 4B extraction model deciding what she keeps is not
 *     her deciding, and what it writes would be stamped as her authorship;
 *   · the chat model is ALREADY RESIDENT, so using it evicts nothing. Forcing `numGpu: 0` on a 35B model
 *     would instead load a second CPU copy — minutes per turn and tens of GB of RAM.
 * ⇒ No residency options at all: it inherits the placement chat already has.
 */
function reflectionModel(config) {
  return cfg(config, 'reflectionModel', null) || registered(config, 'chat.defaultModel', null) || 'ollama/gemma4:e4b'
}

/**
 * The highest watermark already reviewed in this conversation. 0 when she never has.
 *
 * ⭐⭐⭐ `WHERE outcome = 'completed'` IS LOAD-BEARING AND WAS ADDED WITH MIGRATION 025. Without it this
 * read is `max()` over ALL rows — so the first FAILED attempt at watermark X would set the cursor to X
 * and the conversation would never be revisited again. ⇒ the change that makes failure visible would
 * have silently stalled the whole lane, permanently, one conversation at a time.
 * ⭐ THE CURSOR MEANS "HOW FAR I HAVE ACTUALLY REVIEWED", never "how far I have tried".
 */
async function lastWatermark(seq, schema, conversationId) {
  const [row] = await seq.query(
    `SELECT max(up_to_rolling_id)::bigint AS up_to FROM "${schema}"."log_conversation_revisits"
      WHERE conversation_id = :c AND outcome = 'completed'`,
    { replacements: { c: conversationId }, type: seq.QueryTypes.SELECT })
  return Number(row?.up_to ?? 0) || 0
}

/**
 * ⭐⭐ RECORD AN ATTEMPT THAT FAILED, INCLUDING ONE THAT FAILED BEFORE IT WAS EVER CLAIMED.
 *
 * ⚠️⚠️ THIS IS THE HEADLINE REQUIREMENT, AND THE OLD CODE HAD EXACTLY THE HOLE OTE NAMED. A throw inside
 * `reflectOnConversation` was caught by the scan loop, written to a LOG FILE and tallied as
 * `skipped.error` — no row. ⇒ *"never tried"* and *"tried and broke"* were byte-identical in the
 * database, which is the one collapse he asked us to make impossible.
 * ⭐ And it matters most exactly where it is hardest to see: a conversation that fails every time looks,
 * from the ledger, like a conversation nobody has ever gotten around to.
 *
 * ⛔ It never throws. A failure while recording a failure must not take the pass down — it degrades to a
 * log line, which is what we had for everything before this.
 */
async function recordFailure(seq, schema, { conversationId, userId, upTo, from, reason, failure, claimId, preempted = false }) {
  try {
    // ⭐⭐ PREEMPTION IS A TERMINAL OUTCOME, NOT A FAILURE (migration 027). It carries NO `failure`
    // diagnosis because nothing went wrong -- the lane yielded exactly as designed. ⛔ Folding it into
    // `failed` would make a healthy lane look broken and would corrupt `consecutiveFailures`.
    // ⛔ AND IT LEAVES THE CURSOR ALONE: the row is not `completed`, so `lastWatermark()` -- which reads
    // `WHERE outcome = 'completed'` -- does not see it, and the same stretch is retried from where it was.
    const terminal = preempted ? 'preempted' : 'failed'
    const why = preempted ? null : String(failure || 'unknown').slice(0, 2000)
    if (claimId) {
      await seq.query(
        `UPDATE "${schema}"."log_conversation_revisits"
            SET outcome = $3, failure = $2, completed_at = now()
          WHERE id = $1::uuid AND outcome IS NULL`,
        { bind: [claimId, why, terminal], type: seq.QueryTypes.UPDATE })
      return
    }
    // ── ⭐⭐⭐ CLOSE THE OPEN ATTEMPT FIRST; INSERT ONLY IF THERE ISN'T ONE ───────────────────────────
    //
    // ⚠️⚠️ WITHOUT THIS ORDER, RECORDING FAILURES CREATES A WORSE BUG THAN IT CLOSES. The ledger row is
    // claimed BEFORE the model call, so a turn that throws leaves it `outcome IS NULL`. A blind INSERT
    // here would then produce TWO rows for one attempt — and the claimed one would stay in flight
    // forever, where 025's in-flight unique index keeps its watermark permanently occupied.
    // ⇒ **the lane would go silent for exactly the conversations that fail**, which is the failure mode
    // this whole migration exists to make visible. ⭐ The attempt that opened a row closes that row.
    // ⓘ `UPDATE … RETURNING` is what makes "was there one?" answerable without a separate SELECT and a
    // race between the two.
    const closed = await seq.query(
      `UPDATE "${schema}"."log_conversation_revisits"
          SET outcome = $4, failure = $3, completed_at = now()
        WHERE conversation_id = $1 AND up_to_rolling_id = $2 AND outcome IS NULL
        RETURNING id`,
      { bind: [conversationId, Math.max(1, Number(upTo) || 1), why, terminal], type: seq.QueryTypes.SELECT })
    if (closed?.length) return
    await seq.query(
      `INSERT INTO "${schema}"."log_conversation_revisits"
         (conversation_id, user_id, up_to_rolling_id, from_rolling_id, text, prompt_generation,
          reason, outcome, failure, completed_at)
       VALUES ($1, $2, $3, $4, '', $5, $6, $8, $7, now())`,
      {
        bind: [conversationId, userId ?? null, Math.max(1, Number(upTo) || 1), from ?? null,
          REFLECTION_GENERATION, reason ?? 'reflection', why, terminal],
        type: seq.QueryTypes.INSERT,
      })
  } catch (e) {
    await log(`[revisit] could not record a failure for ${conversationId}: ${e.message}`, import.meta.url)
  }
}

/**
 * ⭐⭐⭐ CLOSE ATTEMPTS THAT WERE OPENED AND NEVER FINISHED. An ACT, not a derivation.
 *
 * ⚠️⚠️ THIS CLOSES A HOLE MIGRATION 025 CREATED. Its in-flight partial unique index allows exactly one
 * open attempt per stretch — which is what keeps two concurrent ticks from both spending a 35B
 * generation. But if the process dies mid-turn that row stays `outcome IS NULL` forever, and it
 * permanently occupies its own watermark: the conversation goes quiet in the ledger and nothing can say
 * why. ⭐ Measured on this very lane earlier today — a probe left two such rows behind.
 *
 * ⛔ AND IT IS NOT A DERIVATION, WHICH IS THE WHOLE POINT. `attemptState()` still returns `started` at one
 * minute and at one year alike, because deriving death from silence invents an event nobody observed —
 * the defect `pending` had. Here something DID happen: a sweep ran, at a known time, and wrote down that
 * it ran. **Deriving death from silence and recording a sweep that happened are different things**, and
 * only the second leaves an operator anything to audit.
 *
 * ⭐ THE ALLOWANCE IS DERIVED FROM THE WORK'S OWN CADENCE, borrowed from Hermes's `sweep_stale_inflight`:
 * `max(2 × tick, floor)`, *"so a slow-but-healthy long-interval job is never clipped by the sweep."* A
 * flat constant would either kill slow-but-fine revisits or let dead ones sit.
 * ⛔ It closes them as `failed` with a diagnosis naming the sweep — never `completed` (nothing was
 * reviewed, so the cursor must not move) and never `preempted` (nobody yielded to anyone).
 */
async function sweepStalled(fastify, { quietMinutes }) {
  const db = fastify.db
  const seq = db.txn_messages.sequelize
  const { schema } = db.txn_messages.getTableName()
  const floorMs = intCfg(fastify.config, 'revisitStaleMinutes', 60) * 60_000
  const staleAfterMs = Math.max(2 * quietMinutes * 60_000, floorMs)
  let open = []
  try {
    open = await seq.query(
      `SELECT id::text AS id, conversation_id::text AS cid, requested_at, outcome
         FROM "${schema}"."log_conversation_revisits" WHERE outcome IS NULL`,
      { type: seq.QueryTypes.SELECT })
  } catch (e) {
    await log(`[revisit] stale sweep could not read: ${e.message}`, import.meta.url)
    return 0
  }
  const stale = stalledAttempts(open, { now: Date.now(), staleAfterMs })
  for (const row of stale) {
    await recordFailure(seq, schema, {
      claimId: row.id,
      failure: `no completion recorded; swept after ${Math.round(staleAfterMs / 60_000)} minutes open`,
    })
  }
  // ⛔ Logged only when it actually swept — a quiet lane stays quiet, and the heartbeat below is what
  // distinguishes a quiet pass from a dead one.
  if (stale.length) {
    await log(`[revisit] swept ${stale.length} stalled attempt(s) after ${Math.round(staleAfterMs / 60_000)}m open`, import.meta.url)
  }
  return stale.length
}

/**
 * ⭐⭐ ONE REFLECTION OPPORTUNITY, END TO END.
 *
 * @param {{conversationId:string, force?:boolean}} o `force` skips the quiet+changed gate (checks and a
 *        deliberate manual run); it does NOT skip incognito, probe fixtures or the memory master switch,
 *        because those are not timing conditions.
 */
export async function reflectOnConversation(fastify, { conversationId, force = false, turn = null } = {}) {
  const db = fastify.db
  if (!db?.txn_conversations) return { skipped: true, reason: 'no-db' }
  const seq = db.txn_memories.sequelize
  const { schema } = db.txn_memories.getTableName()
  if (!schema) return { skipped: true, reason: 'no-schema' }

  const conv = await db.txn_conversations.findByPk(conversationId, { raw: true })
  if (!conv) return { skipped: true, reason: 'no-such-conversation' }
  // ⛔ INCOGNITO IS OFF THE RECORD FOR EVERY PURPOSE, including this one.
  if (conv.incognito) return { skipped: true, reason: 'incognito' }
  // ⛔⛔ A CHECK'S FIXTURE IS NOT AN EXPERIENCE, and this one now WRITES. `settings.probe` is stamped in
  // exactly one place (`test/harness.mjs`) so no check can forget, and it survives a settings PATCH.
  // ⓘ It was inert until today — the route's settings allowlist dropped the key, so 0 of 76 conversations
  // carried it and only the thin gate was keeping fixtures out. Fixed in `sanitizeSettings`.
  if (conv.settings?.probe === true) return { skipped: true, reason: 'probe' }
  // ⛔ THE MEMORY MASTER SWITCH GOVERNS THIS TOO. `useMemory: false` means this room does not want memory
  // formed from it; reflecting there and writing anyway would make the switch a suggestion.
  if (conv.settings?.useMemory === false) return { skipped: true, reason: 'memory-off' }

  const msgs = await db.txn_messages.findAll({
    where: { conversation_id: conversationId },
    attributes: ['id', 'role', 'content', 'rolling_id', 'created_at'],
    order: [['rolling_id', 'ASC']], raw: true,
  })
  const top = msgs.length ? msgs[msgs.length - 1] : null
  const already = await lastWatermark(seq, schema, conversationId)
  const gate = isReadyToReflect({
    messages: msgs.length,
    topRollingId: top?.rolling_id ?? 0,
    lastReflectedUpTo: already,
    lastMessageAt: top?.created_at ?? null,
    now: Date.now(),
    quietMinutes: intCfg(fastify.config, 'reflectionQuietMinutes', 30),
    minMessages: intCfg(fastify.config, 'reflectionMinMessages', 4),
  })
  if (!gate.ready && !force) return { skipped: true, reason: gate.reason, ...(gate.quietFor != null ? { quietFor: gate.quietFor } : {}) }
  if (!top) return { skipped: true, reason: 'empty' }

  const owner = conv.user_id
    ? await db.mst_users.findByPk(conv.user_id, { attributes: ['id', 'username', 'display_name'], raw: true })
    : null
  const who = owner?.display_name || owner?.username || 'them'
  // ⭐ The transcript and the COUNT come out of one function, so `messages_considered` can never claim she
  // read something the prompt elided. See shapeReflectionTranscript.
  // ⭐⭐⭐ SHE REVIEWS WHAT SHE HAS NOT REVIEWED. `already` is the COMPLETED cursor, so this is the
  // incremental model Ote described, applied to the work rather than only to the ledger.
  // ⛔ The prompt itself is untouched — `buildReflectionTurnPrompt` is still who + transcript + the
  // ratified question, byte for byte. What changed is WHICH messages the transcript is built from,
  // which is an input, not a frame. A check asserts the prompt shape separately.
  const { slice, contextCount, newCount } = unreviewedSlice(msgs, { already })
  const { transcript, considered, elided } = shapeReflectionTranscript(slice)
  const prompt = buildReflectionTurnPrompt({ who, transcript })

  // ── ⭐⭐⭐ CLAIM THE LEDGER ROW **BEFORE** ANYTHING CAN BE WRITTEN ─────────────────────────────────
  //
  // ⚠️⚠️ THE DEFECT THIS FIXES WAS OBSERVED, NOT REASONED ABOUT. The INSERT used to happen at the END,
  // after the tool loop. So when `ON CONFLICT (conversation_id, up_to_rolling_id) DO NOTHING` refused the
  // row — a concurrent tick, or a re-run at the same watermark — the tool had ALREADY WRITTEN a durable
  // memory. Measured 2026-08-21: an `author='persona'` row existed in the store with **no reflection row
  // pointing at it**, which is the exact inverse of the guarantee this table was built to give.
  // Ote: *"A durable write must not be able to disappear from the reflection ledger."*
  //
  // ⇒ The row is claimed FIRST and filled in afterwards. The UNIQUE index still does the arbitration —
  // *"the datastore guarantees convergence, not the caller"* — but now the loser learns it **before** it
  // spends a 35B model call and before it can write anything. ⭐ That is strictly better than the old
  // ordering on cost too: an already-reflected conversation no longer burns a generation to find out.
  //
  // ⚠️ KNOWN CONSEQUENCE, STATED RATHER THAN DISCOVERED: if the process dies mid-loop the row survives
  // with empty text, and the UNIQUE index will not let that watermark be retried. That is the right trade —
  // an occasion recorded as incomplete is honest, and a durable memory with no ledger row is not — and an
  // empty `text` with `tools_used = {}` is identifiable as exactly that.
  const [claim] = await seq.query(
    `INSERT INTO "${schema}"."log_conversation_revisits"
       (conversation_id, user_id, up_to_rolling_id, from_rolling_id, messages_considered, text,
        tools_used, blocked_by_disclosure, prompt_generation, code_mtime, model, reason)
     SELECT $1, $2, $3, $8, $4, '', ARRAY[]::text[], false, $5, $6, $7, 'reflection'
     -- ⭐⭐⭐ TWO GUARDS, BECAUSE SPLITTING THE INDEX SPLIT THE PROTECTION IT USED TO GIVE.
     -- 016 had ONE unique index, so a re-run was refused AT THE CLAIM -- before a 35B generation and
     -- before any tool could write. Splitting it into in-flight and completed (025) left ON CONFLICT
     -- guarding only CONCURRENCY: a claim against a watermark that was already COMPLETED sailed through,
     -- and the collision surfaced at the completion UPDATE -- after the turn was spent and after she may
     -- already have written a memory. ⚠️ Measured: the check's forced re-run hit exactly that.
     -- ⇒ the NOT EXISTS restores 016's guarantee (the loser learns first) and ON CONFLICT keeps the
     -- concurrency arbitration. ⛔ Neither alone is sufficient, and it is not belt-and-braces: they
     -- refuse two different things.
     WHERE NOT EXISTS (
       SELECT 1 FROM "${schema}"."log_conversation_revisits"
        WHERE conversation_id = $1 AND up_to_rolling_id = $3 AND outcome = 'completed')
     ON CONFLICT (conversation_id, up_to_rolling_id) WHERE outcome IS NULL DO NOTHING
     RETURNING id::text AS id, rolling_id`,
    {
      // ⭐ `from_rolling_id` MAKES THE REVIEW INCREMENTAL — Ote: "I have already reviewed through 120.
      // Review 121-145." `already` is the completed cursor, so the range starts just past it; 0 means
      // she has never reviewed this conversation and the range starts at its beginning (null).
      bind: [conversationId, conv.user_id ?? null, top.rolling_id, considered,
        REFLECTION_GENERATION, CODE_MTIME, reflectionModel(fastify.config),
        // ⛔ CLAMPED, AND THE CONSTRAINT CAUGHT THIS BEFORE A HUMAN DID. `already + 1` can exceed the
        // top when the quiet+changed gate is bypassed (`force: true`, which every fixture uses) or when a
        // completed cursor already sits at the newest message. ⇒ 025's `range_sane` CHECK rejected the
        // insert, which is the guard working on its own author. ⭐ An empty range is written as NULL —
        // "no lower bound recorded" — rather than as a backwards one that would read as coverage.
        already > 0 && already + 1 <= top.rolling_id ? already + 1 : null],
      type: seq.QueryTypes.SELECT,
    })
  if (!claim) return { skipped: true, reason: 'already-reflected', upTo: top.rolling_id }


  // ── THE TOOL CONTEXT ────────────────────────────────────────────────────────────────────────────
  // ⚠️ `isRoot` comes from `isRootConnectedUser`, never from the shape of the owner id. That inference is
  // this codebase's most-repeated defect (nine sites; one turned a missing owner into a privilege grant).
  const ctx = buildToolContext(fastify, {
    user: {
      id: conv.user_id ?? null,
      username: owner?.username ?? null,
      displayName: owner?.display_name ?? null,
      isRoot: isRootConnectedUser(fastify.config, conv.user_id),
      capabilities: [],
    },
    // ⭐⭐ THE SOURCE ANCHOR, AND IT WAS MISSING — MEASURED 2026-08-21, NOT SUSPECTED.
    // A reflection-written memory came out with `source_message_id: NULL` and `source: NULL`, while all 38
    // account-authored memories in the store carry a source. ⇒ anything she retained in a reflection was
    // UNWALKABLE: `recall_memory_source` had nothing to resolve, so she could never get back to the
    // conversation that produced her own conclusion — the exact capability Ote asked for of ordinary
    // memories (*"so sotera can go back and check what happen from source when she need more context"*).
    // ⛔ NO NEW COLUMN AND NO NEW PLUMBING: `buildToolContext` already threads `extras.messageId` into
    // `buildMemoryToolService({ sourceMessageId })`. The reflection host simply never passed it.
    // ⭐ `top.id` is the LAST message considered — the end of the stretch she was reflecting on, which is
    // the anchor that makes the whole conversation reachable from the memory.
  }, { origin: 'reflection', conversationId, messageId: top.id, memoryAuthor: 'persona' })

  // ⭐⭐ CAPTURING THE MEMORY ID WITHOUT BECOMING A SECOND WRITER.
  // `remember` is fire-and-forget by design — `rememberAsync` validates, enqueues, and returns
  // `{ok:true, queued:true}` with NO id, so the row may not exist yet when this function ends. Ote asked
  // that *"the reflection record should point to the resulting memory rather than duplicating its
  // contents"*, and a pointer that is null whenever she used the general-purpose tool would report "no
  // memory" about a memory.
  // ⇒ The queued write is wrapped so the id comes back from the SAME call the tool made: the sync
  // `remember` runs on the SAME serial lane via the service's own `enqueue`, so this adds an observer and
  // not an authority. ⛔ The alternative — querying for "the newest persona-authored row in this room" —
  // would guess, and could point at a row a concurrent chat turn wrote.
  const written = []
  const mv2 = ctx.services?.['memory.v2']
  if (mv2 && typeof mv2.rememberAsync === 'function' && typeof mv2.remember === 'function' && typeof mv2.enqueue === 'function') {
    ctx.services['memory.v2'] = {
      ...mv2,
      rememberAsync(opts = {}) {
        // Validation stays synchronous and identical, so a bad tool call still returns a retryable error.
        if (!opts.content || !String(opts.content).trim()) throw new Error('content is required')
        mv2.enqueue('reflection.remember', async () => {
          const r = await mv2.remember(opts)
          if (r?.id) written.push(String(r.id))
          return r
        })
        return { ok: true, queued: true }
      },
    }
  }

  const modelId = reflectionModel(fastify.config)
  const { provider, model } = splitModelId(modelId)
  const tools = toolDefinitions(REFLECTION_TOOLS)
  const maxRounds = intCfg(fastify.config, 'reflectionMaxRounds', 4)
  const maxTokens = intCfg(fastify.config, 'reflectionMaxTokens', 1600)
  const numCtx = intCfg(fastify.config, 'reflectionNumCtx', 16384)

  const messages = [{ role: 'user', content: prompt }]
  const toolsUsed = []
  let blocked = false
  let text = ''
  // ⛔ NOT A RECORD FIELD ANY MORE — migration 017 dropped the `finish` column on Ote's instruction
  // (*"remove finish from the ratified reflection schema"*). This variable survives as an OPERATOR signal
  // only: a clipped reflection is a lifecycle failure, and those stay in scope, but it reaches a log line
  // and never `log_conversation_revisits`. ⛔ If it starts wanting to be a column again, that is an argument to make,
  // not a field to grow.
  let clipped = null
  let rounds = 0

  // ── THE LOOP. Bounded, and every round is her turn — nothing here nudges her to use a tool. ────────
  // ⛔ NO "you may use your tools" MESSAGE. Ote: *"tools available but not required."* The definitions are
  // in the request and the model decides; a sentence telling her to look would be steering, and *"nothing"*
  // has to stay a complete answer. ⓘ If she never reaches for a tool, that is the same finding
  // `save_lesson` already produced — having the tool did not change the disposition — and it is DATA.
  // ⭐ THE ONE INJECTABLE SEAM, and it is the same one `reflectScope` already uses for the L3 pass: the
  // TURN. A check can script what she says and which tools she calls, so *"a reflection that produces no
  // memory still writes a row"* and *"a saving reflection points at the memory"* are provable offline and
  // deterministically, instead of hoping a 35B model happens to call a tool this run.
  // ⛔ It injects the MODEL CALL only. The gate, the tool execution, the capture, the write lane and the row
  // are the real ones — a test that stubbed those would be asserting its own stub.
  const turnFn = turn || (async ({ messages: ms, tools: ts }) => {
    const res = await chat({
      serverConfig: fastify.config,
      request: {
        provider, model, messages: ms, tools: ts,
        // `reasoning.enabled:false` — think:false is a requirement on this stack, and interleaved
        // think/answer produced stacked garbled drafts (the soak finding). No temperature, no numGpu,
        // no keepAlive: her ordinary sampling and her ordinary placement.
        options: { stream: false, reasoning: { enabled: false }, max_tokens: maxTokens, numCtx },
        userId: conv.user_id ?? null,
        conversationId,
      },
    })
    // ⚠️ THE CLIP SIGNAL, DERIVED — and it has to be derived because `chat()` returns
    // `{message, usage, model, provider}` and **drops the provider's `done_reason` entirely**, so
    // `res.done_reason` was always undefined (measured: null on all three of the first live rows, which is
    // how the inertness was found at all). Hitting the completion cap exactly is the signal.
    const used = res?.usage?.completionTokens ?? null
    return {
      message: res?.message ?? {},
      doneReason: res?.message?.done_reason
        ?? (used == null ? null : (used >= maxTokens ? 'length' : 'stop')),
    }
  })

  // ── ⭐⭐⭐ PREEMPTION · USER INTERACTION HAS ABSOLUTE PRIORITY ────────────────────────────────────
  //
  // Ote: *"Sotera's passive cognition is always interruptible; user interaction is not delayed by it…
  // Do not mark the revisit as failed — user preemption is an intentional control-flow outcome."*
  //
  // ⭐ EPOCH CAPTURED AT THE CLAIM, COMPARED AT EVERY ROUND BOUNDARY. An epoch rather than a flag because
  // a flag would be cleared by the user's turn ENDING — so a turn that began and finished inside one long
  // revisit round would go unnoticed. A monotonic counter cannot be un-rung.
  //
  // ⚠️⚠️ AND THE HONEST LIMIT, BECAUSE THE OBVIOUS CLAIM WOULD BE FALSE: `chat()` accepts **no abort
  // signal**, so a provider call already in flight CANNOT be cancelled. Preemption is therefore sharp at
  // round boundaries and no sharper — worst case a user waits out ONE round instead of all `maxRounds`.
  // ⓘ Why that matters at all: ollama serialises generations on one model, so a running revisit round
  // genuinely delays a person's first token. Bounding it to one round is the win; "instant" would need an
  // AbortSignal threaded through `chat()` into the adapter's fetch, which is a provider-layer change and
  // deliberately not made here.
  const startEpoch = fastify?.steerReg?.interactiveEpoch?.() ?? null
  const preemptedNow = () => {
    const reg = fastify?.steerReg
    if (!reg || startEpoch == null) return false
    // ⛔ EITHER SIGNAL COUNTS: a turn running right now, or any turn that came and went since we claimed.
    return reg.interactiveEpoch() !== startEpoch || reg.anyActive() === true
  }
  const yieldToUser = async () => {
    await recordFailure(seq, schema, { claimId: claim.id, preempted: true })
    await log(`[revisit] ${conversationId} yielded to a user interaction at watermark ${top.rolling_id} `
      + '— not completed, cursor unmoved, will resume', import.meta.url)
    return { skipped: true, reason: 'preempted', upTo: top.rolling_id }
  }

  while (rounds <= maxRounds) {
    // ⛔ CHECKED BEFORE SPENDING THE ROUND. The cheapest possible yield is the one that never starts.
    if (preemptedNow()) return yieldToUser()
    let res
    try {
      res = await turnFn({ messages, tools })
    } catch (e) {
      // ⭐⭐⭐ CLOSE THE CLAIM WE OPENED. ⚠️⚠️ MEASURED, NOT REASONED: a probe forced this path with an
      // unresolvable model and left **two rows `outcome IS NULL` forever**, each permanently occupying
      // its watermark under 025's in-flight unique index. ⇒ the conversations that fail would be exactly
      // the ones that go silent — the failure mode the migration exists to expose, reproduced by the fix.
      // ⛔ AND IT IS A `skipped` RETURN, NOT A THROW, which is why the scan loop's catch never saw it. I
      // had predicted this bug and put the guard in the wrong place; only running it found the real one.
      await log(`[reflection] ${conversationId} llm error: ${e.message}`, import.meta.url)
      await recordFailure(seq, schema, { claimId: claim.id, failure: `llm-error: ${e.message}` })
      return { skipped: true, reason: 'llm-error', error: e.message }
    }
    // ⭐ AND AGAIN THE MOMENT THE ROUND RETURNS. A user turn that arrived WHILE the provider was
    // generating is exactly the case worth catching: the next round would compound the delay, and this is
    // the first instant we can act on it. ⛔ The reply already produced is dropped -- an unfinished
    // revisit retains nothing, which is why the cursor may not move.
    if (preemptedNow()) return yieldToUser()
    const msg = res?.message ?? {}
    const calls = (Array.isArray(msg.tool_calls) ? msg.tool_calls : [])
      .map((c) => {
        const fn = c.function || {}
        let args = fn.arguments !== undefined ? fn.arguments : c.arguments
        if (typeof args === 'string') { try { args = JSON.parse(args) } catch { /* keep the raw string */ } }
        return { name: fn.name || c.name, arguments: args ?? {} }
      })
      .filter((c) => typeof c.name === 'string' && c.name.trim())
    const said = String(msg.content || '')
    clipped = res?.doneReason ?? clipped
    if (said.trim()) text = text ? `${text}\n\n${said}` : said
    if (!calls.length) break
    if (rounds === maxRounds) {
      // ⚠️ SAY SO IN THE LOG RATHER THAN LOOKING LIKE SHE STOPPED. A round cap hit silently reads as her
      // having finished, which is the same corruption a clipped answer would be. ⓘ It is no longer written
      // to the row (017) — an operator sees it, the population does not carry it.
      clipped = 'tool-round-cap'
      break
    }
    rounds++
    messages.push({ role: 'assistant', content: said, tool_calls: calls })
    for (const call of calls) {
      let result
      try { result = await runTool(call.name, call.arguments, ctx) } catch (e) { result = { error: e?.message || 'tool failed' } }
      if (!toolsUsed.includes(call.name)) toolsUsed.push(call.name)
      const id = readWrittenMemoryId(call.name, result)
      if (id && !written.includes(id)) written.push(id)
      if (isDisclosureRefusal(call.name, result)) blocked = true
      messages.push({ role: 'tool', name: call.name, content: JSON.stringify(result ?? null).slice(0, 8000) })
    }
  }

  // ⭐ Drain the shared serial write lane so a queued `remember` has finished and reported its id BEFORE
  // the reflection row claims there was no memory. ⛔ Never fail the record over a failed drain.
  try { await mv2?._drainWrites?.() } catch { /* the row still records the occasion */ }

  // ⚠ A CLIPPED REFLECTION IS A LIFECYCLE FAILURE, SO AN OPERATOR HEARS ABOUT IT. Ote keeps those in
  // scope for this phase (*"We can fix implementation bugs and lifecycle failures"*) — but the row stays
  // clean: if her answer was cut off at the ceiling, that is a fault in the instrument, not a fact about
  // what she decided. ⛔ Logged only when it actually happened; a per-run line would bury the signal.
  if (clipped === 'length' || clipped === 'tool-round-cap') {
    await log(`[reflection] ⚠ ${conversationId} was CUT OFF (${clipped}) — her answer is incomplete, `
      + 'so do not read it as a finished decision', import.meta.url)
  }

  // ── THE ROW. Written whether or not anything else was. ────────────────────────────────────────────
  // ⭐⭐ Ote, explicitly: *"a reflection that produces no memory must still create a log_conversation_revisits row."*
  // Row-exists-vs-no-row is what separates "she reflected and kept nothing" from "she was never asked",
  // and those are opposite facts that used to look identical.
  // ⭐ FILLING IN THE ROW THIS RUN ALREADY CLAIMED. The claim above is what makes a durable write
  // impossible to lose; this is where what came of it is recorded. ⛔ Keyed by the claimed id, so it cannot
  // touch another run's row even if the watermark moved underneath it.
  const [row] = await seq.query(
    // ⭐⭐ THE ATTEMPT TERMINATES HERE, AND IT SAYS SO. `blocked` is not a worse `completed`: she found
    // material and a boundary refused her, which is neither an answer nor a breakage.
    // ⛔ `completed` means she was ASKED AND ANSWERED. It never means she found something worth keeping
    // -- that stays in `wrote_memory_id` (a fact) and in her own words (everything else).
    `UPDATE "${schema}"."log_conversation_revisits"
        SET text = $2, wrote_memory_id = $3, tools_used = $4::text[], blocked_by_disclosure = $5,
            model = $6, messages_considered = $7,
            outcome = CASE WHEN $5 THEN 'blocked' ELSE 'completed' END, completed_at = now()
      WHERE id = $1::uuid
     RETURNING id::text AS id, rolling_id`,
    {
      // ⚠️ `bind`, NOT `replacements`. Sequelize expands an array in `replacements` into a comma-separated
      // list, which turns a text[] parameter into a syntax error — the `log_tool_calls` insert had to move
      // for exactly this.
      bind: [claim.id, text, written[0] ?? null, toolsUsed, blocked, modelId, considered],
      type: seq.QueryTypes.SELECT,
    })
  if (!row) {
    // ⛔ The claim disappeared under us — nothing to close, and saying so is the honest record.
    await log(`[reflection] ${conversationId} claimed row vanished before completion`, import.meta.url)
    return { skipped: true, reason: 'claimed-row-vanished', upTo: top.rolling_id }
  }

  await log(`[reflection] ${conversationId} upTo=${top.rolling_id} tools=${toolsUsed.join(',') || 'none'} `
    + `memory=${written[0] ? 'yes' : 'no'}${blocked ? ' blocked' : ''}`, import.meta.url)
  return {
    ok: true,
    reflectionId: row.id,
    conversationId,
    upTo: top.rolling_id,
    messagesConsidered: considered,
    elided,
    text,
    // ⭐ EVERY id she wrote is returned even though the column holds one — the caller (and a check) can see
    // a multi-write reflection, which the singular column cannot show.
    wroteMemoryIds: written,
    wroteMemoryId: written[0] ?? null,
    toolsUsed,
    blockedByDisclosure: blocked,
    model: modelId,
    // ⓘ RETURNED, NOT STORED. The caller and a check can see that this reflection was cut off; the row
    // cannot, by decision. ⛔ Do not re-add it to the INSERT without asking.
    clipped,
    promptGeneration: REFLECTION_GENERATION,
  }
}

/**
 * ONE TICK: every conversation that has gone quiet with something new in it. Bounded by `maxConvos`.
 * ⚠️ `enabled` defaults FALSE at the config level. This makes LLM calls on her chat model AND can write
 * durable memory — a pass that starts itself on deployment is a decision nobody made.
 */
export async function reflectAllQuiet(fastify, { maxConvos = 3, lookbackHours = 48, force = false } = {}) {
  const on = fastify.config?.memory?.reflectionEnabled === true
  if (!on && !force) return { skipped: true, reason: 'disabled' }
  const db = fastify.db
  if (!db?.txn_conversations) return { skipped: true, reason: 'no-db' }

  // ── ⭐⭐⭐ THE IDLE GATE · IS THIS A SAFE MOMENT? ⛔ NOT "IS ANYTHING ELIGIBLE?" ────────────────────
  //
  // Ote's ratified order: `anyActive() → cooldown → tick-time config → deriveRevisitState()`, and the
  // split is the point — *"deriveRevisitState() remains the sole authority for whether a conversation is
  // eligible. The idle gate only decides whether this is a safe time to execute."*
  // ⛔ THE GATE IS ABOVE THE LOOP, NOT INSIDE IT. Put it per-conversation and it becomes a second
  // eligibility rule; a background pass must not be able to say "this conversation is ineligible" when
  // what it means is "Sotera is busy right now".
  // ⭐ AND IT RETURNS A NAMED REASON, so `blocked-busy` and `nothing-eligible` stay different sentences.
  // A merged predicate could only ever have said "no", and this project has paid for that already.
  // ⚠️ `force` bypasses it, exactly as it bypasses the quiet+changed gate: a check or an operator asking
  // for a pass NOW is itself an interactive act, and the gate exists to protect interaction.
  const gate = checkIdleGate(fastify, fastify.steerReg)
  if (!force && !gate.run) {
    // ⭐ Logged only when it BLOCKED, so a quiet system stays quiet — but never silently, because "the
    // pass did nothing" and "the pass was held back" are the two states this whole design keeps apart.
    await log(`[revisit] held back — ${gateSummaryLine(gate)}`, import.meta.url)
    return { skipped: true, reason: `gate-${gate.reason}`, waitMs: gate.waitMs, activeCount: gate.activeCount }
  }

  // ⚠️ Needed by `recordFailure` in the catch below, which is the only reason it is read here.
  const { schema } = db.txn_messages.getTableName()
  const quietMinutes = intCfg(fastify.config, 'reflectionQuietMinutes', 30)

  // ── ⚠⚠ A STARVATION BUG LIVED HERE, AND IT STOPPED THE PASS DEAD FOR ~8 HOURS ───────────────
  // The old query was `order: updated_at DESC, limit: maxConvos * 6` — i.e. **the cap was applied by
  // RECENCY, BEFORE the eligibility gate.** Measured 2026-08-21: the pass could see 18 candidates, of which
  // **0 were ready** (14 already reflected at their watermark, 2 thin, 2 fixtures) while **23 eligible
  // conversations sat below the cut and could never be reached.** 17 reflections happened, then nothing for
  // seven and three quarter hours, and the log looked exactly like a quiet system.
  //
  // ⭐ THE RULE THIS BROKE: **a cap must bound the WORK, never the SEARCH FOR work.** A LIMIT above a
  // filter silently converts "do at most 3 per tick" into "do at most 3 of the newest 18, forever."
  //
  // ⇒ The window is now the whole lookback (bounded by `lookbackHours`, ~70–80 rows in practice, so the
  // scan is cheap) and the cap applies where it belongs: `tally.reflected >= maxConvos` breaks the loop.
  // ⛔ The gate is STILL `isReadyToReflect` inside `reflectOnConversation` — this query deliberately does
  // NOT reimplement it, because two copies of an eligibility rule is how they stop agreeing.
  //
  // ⭐ AND OLDEST-QUIET-FIRST, not newest. A fresh conversation will still be there in twenty minutes; a
  // conversation that has been waiting all night is the one whose occasion is overdue. Newest-first is also
  // what let the backlog starve in the first place — a busy day would permanently outrank it.
  //
  // ⚠ KNOWN AND DELIBERATE BOUND: a conversation whose last activity is older than `lookbackHours` is
  // never reflected on, even if it never has been. The backlog is bounded by the lookback, not drained
  // forever. That is a cost decision, not an oversight.
  const until = new Date(Date.now() - quietMinutes * 60000)
  const since = new Date(Date.now() - lookbackHours * 3600e3)
  const convos = await db.txn_conversations.findAll({
    // ⛔ ARCHIVED IS INELIGIBLE (2026-08-25). Ote: *"Exclude archived conversations for now. Don't
    // delete, modify, or mark them as reviewed. Just make them ineligible for the passive revisit lane."*
    // ⚠️ This was MISSING and the lane has been eligible to revisit archived conversations all along —
    // 18 of them here. Archiving is the one signal a person gives that a conversation is finished with;
    // background cognition walking into it is the opposite of respecting that.
    // ⭐ INELIGIBLE, NOT MARKED. No row is written for them, so if archived history ever becomes
    // revisitable they are simply eligible again — nothing has to be undone.
    where: { ...EVIDENTIAL_WHERE, archived_at: null, updated_at: { [Op.lte]: until, [Op.gte]: since } },
    order: [['updated_at', 'ASC']], raw: true,
  })

  // -- ⭐⭐⭐ THE HISTORICAL BACKLOG · A SECOND LANE, WITH ITS OWN BUDGET ------------------------
  //
  // Ote: *"Start with a small bounded pilot batch of old, eligible conversations… This should be a real
  // backlog, not a one-time «startup migration». Anything not selected remains eligible for a later tick."*
  // and, on the day it was applied: *"Keep the bounded/oldest-first behavior anyway; don't special-case the
  // fact that there are currently only 3 eligible never-completed conversations. We want the worker
  // semantics to remain correct as the backlog grows."*
  //
  // ⚠⚠ WHY A SECOND LANE IS NEEDED AT ALL: the ordinary lane is bounded by `lookbackHours` (48h), and this
  // file already recorded that bound as deliberate — *"a conversation whose last activity is older than
  // lookbackHours is never reflected on, EVEN IF IT NEVER HAS BEEN."* ⇒ anything older is unreachable
  // **permanently**, which is fine for a lane that only ever needed to keep up, and wrong for one that is
  // supposed to catch up.
  //
  // ⭐ IT IS A QUEUE, NOT A SWEEP. Each tick does at most `revisitBacklogPerTick` of it; whatever it does
  // not reach stays exactly as eligible next tick. ⛔ There is no "backfill complete" state and there must
  // not be one — that is what makes this a budget we can raise rather than a migration we have to finish.
  //
  // ⚠️⚠️ **NO `LIMIT` HERE, AND THAT IS THIS FILE'S OWN LESSON APPLIED.** The starvation bug recorded
  // above cost ~8 hours to *"a LIMIT above a filter"*, and an `ORDER BY updated_at ASC LIMIT 2` would
  // rebuild it exactly: the two oldest rows are returned every tick, so if those two are permanently
  // skipped by the gate (too thin, a fixture) **nothing behind them is ever offered again**. ⭐ The rule is
  // unchanged — *a cap must bound the WORK, never the SEARCH FOR work* — so the filter selects the whole
  // backlog and `backlogDone` below is what stops.
  const backlogBudget = intCfg(fastify.config, 'revisitBacklogPerTick', 2)
  let backlog = []
  if (backlogBudget > 0) {
    try {
      backlog = await db.txn_messages.sequelize.query(
        `SELECT c.id::text AS id, c.user_id::text AS user_id
           FROM "${schema}"."txn_conversations" c
          WHERE ${evidentialSql('c')}
            AND c.archived_at IS NULL
            AND c.updated_at < :since
            AND NOT EXISTS (SELECT 1 FROM "${schema}"."log_conversation_revisits" r
                             WHERE r.conversation_id = c.id AND r.outcome = 'completed')
          ORDER BY c.updated_at ASC`,
        { replacements: { since }, type: db.txn_messages.sequelize.QueryTypes.SELECT })
    } catch (e) {
      // ⛔ A backlog read that fails must not take the ordinary lane down with it.
      await log(`[revisit] backlog query failed: ${e.message}`, import.meta.url)
    }
  }

  // ⭐ SWEEP FIRST, so a stalled row from a dead process cannot keep its watermark out of this tick's
  // reach. ⛔ After the gate, never before it: a sweep is still background work.
  const swept = await sweepStalled(fastify, { quietMinutes })
  const tally = { scanned: 0, reflected: 0, wroteMemory: 0, blocked: 0, swept, backlogOffered: 0, backlogReflected: 0, skipped: {} }
  const details = []
  // ⭐ BACKLOG FIRST IN THE QUEUE, because the backlog is what starves under any recency ordering —
  // this file already lost eight hours to exactly that, and a busy day would otherwise permanently
  // outrank a conversation from August 10th.
  // ⭐⭐ **TWO BUDGETS, NOT ONE**, and this is the part that has to stay right as the backlog grows.
  // Spending `maxConvos` on whichever lane got there first looks fine at a backlog of three and
  // inverts the starvation at a backlog of three hundred: every tick would burn its whole budget on
  // history and the live lane — the one that only ever needed to keep up — would never run again.
  // ⇒ `backlogDone` bounds catching up, `liveDone` bounds keeping up, and neither can consume the other.
  const backlogIds = new Set(backlog.map((b) => b.id))
  const seen = new Set()
  const queue = [...backlog, ...convos].filter((c) => (seen.has(c.id) ? false : seen.add(c.id)))
  tally.backlogOffered = backlog.length
  let liveDone = 0
  let backlogDone = 0
  for (const c of queue) {
    const fromBacklog = backlogIds.has(c.id)
    // ⛔ The admission rule is `admitToQueue`, not two comparisons inlined here — see it for why `skip`
    // and `stop` have to be different answers, and why the two lanes may not share one counter.
    const admit = admitToQueue({ fromBacklog, liveDone, backlogDone, maxConvos, backlogBudget })
    if (admit === 'stop') break
    if (admit === 'skip') continue
    tally.scanned++
    try {
      const r = await reflectOnConversation(fastify, { conversationId: c.id })
      if (r.skipped) { tally.skipped[r.reason] = (tally.skipped[r.reason] ?? 0) + 1; continue }
      tally.reflected++
      // ⚠️ Counted where the WORK happened, not where it was offered: a backlog row the gate skipped
      // spent no generation and must not spend a slot, or a run of thin old conversations would eat
      // the budget every tick and the real backlog behind them would never be reached.
      if (fromBacklog) { backlogDone++; tally.backlogReflected++ } else { liveDone++ }
      if (r.wroteMemoryId) tally.wroteMemory++
      if (r.blockedByDisclosure) tally.blocked++
      details.push({ conversationId: c.id, reflectionId: r.reflectionId, tools: r.toolsUsed, wrote: !!r.wroteMemoryId })
    } catch (e) {
      // ⭐⭐⭐ THE FAILURE IS NOW WRITTEN DOWN, NOT ONLY LOGGED. This catch is precisely the hole Ote
      // named: a throw anywhere inside `reflectOnConversation` produced a log line and a tally counter
      // and NO ROW — so *"never tried"* and *"tried and broke"* were byte-identical in the database.
      // ⚠️ And it hides worst where it matters most: a conversation that fails every single time looks,
      // from the ledger, exactly like one nobody has gotten around to yet.
      // ⓘ `topRollingId` is read here rather than threaded out of the thrower, because the throw may
      // have happened before the transcript was ever shaped — the row must be writable even then.
      await log(`[reflection] ${c.id} failed: ${e.message}`, import.meta.url)
      let topId = 1
      try {
        const [t] = await db.txn_messages.sequelize.query(
          `SELECT max(rolling_id)::bigint AS r FROM "${schema}"."txn_messages" WHERE conversation_id = :c`,
          { replacements: { c: c.id }, type: db.txn_messages.sequelize.QueryTypes.SELECT })
        topId = Number(t?.r ?? 1) || 1
      } catch { /* a failure while recording a failure must not take the pass down */ }
      await recordFailure(db.txn_messages.sequelize, schema, {
        conversationId: c.id, userId: c.user_id ?? null, upTo: topId,
        reason: 'reflection', failure: `${e.name || 'Error'}: ${e.message}`,
      })
      tally.skipped.error = (tally.skipped.error ?? 0) + 1
    }
  }
  // ── ⭐⭐ A HEARTBEAT, BECAUSE A DEAD PASS AND A QUIET PASS LOOKED IDENTICAL ─────────────────
  // The starvation above was invisible for eight hours for one reason: the job logs only when it REFLECTS,
  // so silence meant either "nothing was eligible" or "the pass is broken" and nothing could tell them
  // apart. ⇒ every third tick (hourly at the 20-minute cadence) emits the scan tally even when it did
  // nothing, so "scanned=73 reflected=0 unchanged=70" is distinguishable from no line at all.
  // ⛔ Every tick would be noise — and a noisy job gets switched off and takes its usefulness with it.
  ticks++
  if (tally.reflected === 0 && ticks % 3 === 0) {
    await log(`[reflection] heartbeat: scanned=${tally.scanned} reflected=0 `
      + `skipped=${JSON.stringify(tally.skipped)}`, import.meta.url)
  }
  // ── ⭐⭐ POST-REVISIT: AN OPPORTUNITY TO INDEX, ⛔ NEVER A DEPENDENCY ─────────────────────
  //
  // Ote: *"revisit produces/changes conversation material → embedding drain gets an opportunity to index
  // it immediately… The revisit trigger is an opportunity, not a dependency: revisit must not wait for
  // embeddings and must remain successful if the embedder is unavailable."*
  //
  // ⛔ NOT AWAITED, AND THAT IS THE POINT. The round's outcome is already decided and written; making it
  // wait on an embedder would let an unavailable model turn a completed revisit into a slow one, and a
  // throwing one into a failed one. ⭐ The `.catch` is the contract, not defensive noise.
  //
  // ⓘ CALLED UNCONDITIONALLY because the drain is already cheap when idle: with nothing pending it is ONE
  // indexed query and the embed loop never runs, so no embedder is woken. Deciding here whether work
  // exists would be a second copy of that query, and two copies of a predicate is how they stop agreeing.
  //
  // ⚠️ THE 5-MINUTE JOB REMAINS THE PRIMARY FRESHNESS MECHANISM. This hook is an immediate opportunity,
  // ⛔ not a replacement for it — measured the day it was added, pending was 0 and the index ran 3 minutes
  // AHEAD of the newest message.
  drainPendingEmbeddings(fastify)
    .then((emb) => {
      if (!emb.skipped && emb.embedded) return log(`[message-embed] (post-revisit) ${JSON.stringify(emb)}`, import.meta.url)
      // ⓘ `in-flight` is a NORMAL outcome here, not a fault: the 5-minute tick may already be draining
      // the same shared queue, and it will pick up anything this round produced.
      return undefined
    })
    .catch((e) => log(`[message-embed] (post-revisit) error: ${e.message}`, import.meta.url).catch(() => {}))

  return { ...tally, details }
}
