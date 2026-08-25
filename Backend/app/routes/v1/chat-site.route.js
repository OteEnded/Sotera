import { Op } from 'sequelize'
import { chat, streamChat, parseModelRef, listAllModels, GatewayError } from '../../chat-runtime/index.js'
import { voiceService, voiceEnabled } from '../../voice/index.js'

import { guardWindow } from '../../chat-runtime/ollama-ctx.js'
import { requireLogin } from '../../auth/index.js'
import { ensureChatApiKey } from '../../auth/chat-key.js'
import { requireCapability, can } from '../../auth/permissions.js'
import { adapters, effectiveProvidersFor } from '../../adapters/index.js'
import { capsOf, inferCapsFromName } from '../../adapters/model-caps.js'
import { capsForModel, capsVerdictForModel, mergeCapVerdict, SPECIALIST_CAPS } from '../../adapters/capabilities.js'
import { extractFile, MAX_FILES } from '../../files/extract.js'
import { toolDefinitions, runTool, buildToolContext, resolveSkill, listSkills, memoryToolNames, attachLogger, attachToolAudit } from '../../components/runtime.js'
import { readSkillFile } from '../../components/skill-store.js'
// ⭐ S1: the turn's toolset is assembled in ONE place, for the bound Skill and the triggered one alike.
import { assembleToolDefs, MEMORY_WRITE_TOOLS } from '../../chat/tool-defs.js'
// ⭐ SeekAdvice: reaching another intelligence. The route knows the SERVICE, never a transport.
import { createAdviceService, adviceContextBlock } from '../../advice/index.js'
import { ownerIdOf, ownedBy } from '../../auth/owner.js'
import { buildMemoryV2 } from '../../components/memory-v2-host.js'
import { captureFacts } from '../../components/memory-extract-host.js'
import { recordTurn, recordCapture, recordAuto } from '@ote/memory/cognition/memory-capture-telemetry.js'
import { captureIdentity } from '../../components/memory-identity-host.js'
import { composeSystemContext, composeRuntimeTail, composeAdaptiveContext, rankRelevance } from '../../components/context-composer.js'
import { buildMemoryCognition } from '../../components/memory-cognition-host.js'
import { plainSpokenToolResult, evidenceForModel, populationOf, countFromToolResult, queryOf } from '../../components/memory-cognition-projection.js'
import { renderHolding, withStandingView, standingSnapshot } from '../../components/memory-working-render.js'
import { applyUtteranceBoundary, findWithheldLeak } from '../../components/memory-utterance-boundary.js'
import { classifySection } from '../../components/context-authority.js'
import { contextBreakdown, rememberContextUsage, lastContextUsage } from '../../components/context-usage.js'
import { resolveProfile, setDisplayName } from '../../components/profile-service.js'
import { proposePerson } from '../../components/person-service.js'
import { initConversationSearch, buildConversationSearch, evidenceLine, hasRetrievableTopic } from '../../components/conversation-search.js'
import { initReflection, buildReflection } from '../../components/reflection-host.js'
import { normalizeWorkingMemory, renderWorkingMemory, extractIntent, initWorkingMemory } from '../../components/working-memory-host.js'
// ⭐ C2 · the COGNITIVE HOLD — the layer's ephemeral per-operation working set. ⚠️ Distinct from the L4
// `working-memory-host.js` above, which is her own persisted scratchpad and is 0-for-177 unused.
import { createWorkingMemory } from '../../components/memory-working-memory.js'
import { makeEmbedder } from '../../components/memory-embed-host.js'
import { readOwnStance, renderOwnStance } from '../../components/relational-knowledge.js'
import { initOwnMemory } from '../../components/own-memory-host.js'
import { initIntention, readOpenIntention, renderOpenIntention } from '../../components/intention-host.js'
import { describeScope, renderScope } from '../../components/room-scope.js'
import { initLesson } from '../../components/lesson-host.js'
import { initSelfHistory } from '../../components/self-history-host.js'
import { initConversationRetrieval } from '../../components/conversation-retrieval.js'
import { initDisclosure } from '../../components/disclosure-host.js'
import { initRetention } from '../../components/retention-host.js'
import { initToolLog } from '../../audit/tool-log.js'
import { getSetting } from '../../settings/index.js'
import { checkTokenBudget } from '../../usage/limits.js'
import { createSteerRegistry } from '../../chat/steer-registry.js'
import { describeToolInteraction, describeVisionInteraction } from '../../chat/interaction.js'
import { descriptionsOf, descriptionText, describedImagesView } from '../../chat/vision-descriptions.js'
import { canSetPersonalDefault, loadRootPrefs } from './me-prefs.route.js'
import { subscribeChatEvents, chatSubscriberCount, notifyChatEvent } from '../../chat/notify.js'
import { getTodo, clearTodo, initTodo, userMayTodo } from '../../todo/index.js'
import { initInteraction, getPendingInteraction, answerInteraction, INTERACTIVE_TOOL_NAMES } from '../../interaction/index.js'
import { looksDegenerate, trimDegenerateTail, DEGENERATE_NOTE, watchFirstToken, wakeOteLine, scrubTemplateTail, scrubToolCallText, answerBlockJoin, makeStreamScrubber } from '../../chat/stream-guards.js'
import { maybeStartMarathon, isMarathonActive } from '../../chat/marathon.js'
import { recoverInterruptedTurns } from '../../chat/recovery.js'
import { schedulesTargeting, deactivateSchedulesForConversation } from '../../schedules/index.js'

// Last-resort describer when neither the conversation nor chat.visionRelayModel names one. Kept in
// ONE place (it used to be an inline literal here and a separate default in settings/index.js — two
// copies of a decision that has to move together). See that setting's describe for why it is a Qwen
// VL and not gemma4:e4b.
const DEFAULT_VISION_RELAY_MODEL = 'ollama/qwen3.5:9b'
const visionRelayNumCtx = (config) => {
  try { const v = getSetting(config, 'chat.visionRelayNumCtx'); return Number.isInteger(v) && v > 0 ? v : 8192 } catch { return 8192 }
}
const visionRelayDevice = (config) => {
  try { return getSetting(config, 'chat.visionRelayDevice') === 'cpu' ? 'cpu' : 'gpu' } catch { return 'gpu' }
}

// The PLATFORM half of the relay resolution (i.e. everything except a per-conversation override).
// Factored out because /chat/models has to tell the UI which model "(platform default)" actually
// means — and a second copy of this expression would drift from the one the turn really uses.
function platformVisionRelayModel(serverConfig) {
  try {
    return getSetting(serverConfig, 'chat.visionRelayModel') || DEFAULT_VISION_RELAY_MODEL
  } catch {
    return DEFAULT_VISION_RELAY_MODEL
  }
}

// Chat SITE endpoints (the ChatGPT/Claude-style app).
// Auth: login SESSION (not API key) + `chat` capability. Internally these call the
// same model dispatch the gateway uses — no API key needed (server-internal).
//
//   GET    /v1/chat/models                        models the user may use
//   GET    /v1/chat/conversations                 list my conversations (?archived=1 = archive bin)
//   POST   /v1/chat/conversations                 create
//   GET    /v1/chat/conversations/:id             one conversation + messages
//   PATCH  /v1/chat/conversations/:id             rename / change model (model needs select_model) / archive
//   POST   /v1/chat/conversations/:id/suggest-title  LLM-suggested name (rename form's ✦)
//   DELETE /v1/chat/conversations/:id             delete
//   POST   /v1/chat/conversations/:id/messages    send a message, stream the reply (SSE)

// The model's memory WRITE tools. One source of truth: the same set decides whether the model is the
// turn's writer up front AND whether it actually wrote by the end (the fallback-capture check), so the
// two can never drift apart.
// ⓘ It now LIVES in app/chat/tool-defs.js — beside step ⑨, the only place that decides "is the model the
// writer this turn" — and is imported back here for the end-of-turn check. Still one definition.

function sse(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`
}
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
}

// ---- F-SYS: the system prompt building blocks + per-turn assembly now live in the pure Context
// Composer (components/context-composer.js): DEFAULT_SYSTEM_PROMPT / MEMORY_TOOL_RULES / TODO_RULE /
// ASK_USER_RULE / memoryHint + composeSystemContext/composeRuntimeTail. This route GATHERS the inputs
// (tz, pinned memories, summary, recall, schedule pointer, current time); the composer builds them. ----
// Which model this user is allowed to use for a given (optional) request.
// Members (no select_model) are locked to the configured default.
// Chat defaults are runtime settings (DB override > config.json default).
function resolveModel(serverConfig, user, requested) {
  const def = getSetting(serverConfig, 'chat.defaultModel') || null
  if (!can(user, 'select_model')) return def // locked
  return requested || def
}

// Defaults applied when a conversation has no stored settings (and for members,
// who can't tune). Reasoning ON so thinking-models don't render empty, but effort
// defaults to 'low' so answers stay fast (tuners can raise it per conversation).
const DEFAULT_SETTINGS = Object.freeze({
  reasoning: { enabled: true, effort: 'low' },
  temperature: null, top_p: null, max_tokens: null, seed: null,
  // Per-conversation context window (Ote, 2026-08-02). null = use the platform's resolved cap for the
  // model. A value here can only ever NARROW that cap, never raise it — the ceiling is root's (global
  // limit ∩ per-model manual cap ∩ calibrated optimum ∩ trained max), and a chat user must not be able
  // to punch through it. Useful for keeping a long chat cheap/fast on a model whose cap is huge.
  numCtx: null,
  useMemory: true,
  toolsEnabled: true,
  marathon: false, // ⚙ opt-in: auto-continue while the Todo plan is unfinished (root lever gates it platform-wide)
  customInstructions: '',
  skill: null, // optional Skill id to run this conversation "as" (prompt + constrained tools + model)
  visionRelayModel: null, // vision model that describes images for non-vision targets (null = platform default)
  // view/transport prefs (any chat user may change these)
  stream: true,
  markdown: true,
  showStats: true,
})

// View/transport prefs that are NOT model-control — any chat user can change them.
const VIEW_FIELDS = ['stream', 'markdown', 'showStats']

// The PLATFORM's effective defaults: root's chat.defaultOptions (System → Chat defaults)
// layered over the built-ins above. Applies to fresh conversations, member-role users,
// and the ⚙ panel's Reset — an existing conversation keeps its own stored settings.
function effectiveDefaultSettings(serverConfig) {
  let o = {}
  try { o = getSetting(serverConfig, 'chat.defaultOptions') || {} } catch { /* defaults only */ }
  return {
    ...DEFAULT_SETTINGS,
    reasoning: {
      enabled: typeof o.thinkingEnabled === 'boolean' ? o.thinkingEnabled : DEFAULT_SETTINGS.reasoning.enabled,
      effort: o.thinkingEffort !== undefined ? o.thinkingEffort : DEFAULT_SETTINGS.reasoning.effort,
    },
    ...(typeof o.stream === 'boolean' ? { stream: o.stream } : {}),
    ...(typeof o.useMemory === 'boolean' ? { useMemory: o.useMemory } : {}),
    ...(typeof o.toolsEnabled === 'boolean' ? { toolsEnabled: o.toolsEnabled } : {}),
    ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
    ...(o.top_p !== undefined ? { top_p: o.top_p } : {}),
    ...(o.max_tokens !== undefined ? { max_tokens: o.max_tokens } : {}),
    ...(typeof o.customInstructions === 'string' ? { customInstructions: o.customInstructions } : {}),
  }
}

// Clamp/validate a settings object coming from the client.
function sanitizeSettings(s) {
  if (!s || typeof s !== 'object') return { ...DEFAULT_SETTINGS }
  const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v)) ? Math.min(max, Math.max(min, v)) : null
  const effort = ['low', 'medium', 'high'].includes(s.reasoning?.effort) ? s.reasoning.effort : null
  return {
    reasoning: { enabled: s.reasoning?.enabled !== false, effort },
    temperature: num(s.temperature, 0, 2),
    top_p: num(s.top_p, 0, 1),
    max_tokens: (typeof s.max_tokens === 'number' && s.max_tokens > 0) ? Math.floor(s.max_tokens) : null,
    // Stored as the user asked for it; the CLAMP against root's cap happens at request time in
    // resolveCtxWindow, because the cap depends on the model and the model can change per turn.
    numCtx: (typeof s.numCtx === 'number' && s.numCtx >= 1024) ? Math.floor(s.numCtx) : null,
    seed: (typeof s.seed === 'number' && Number.isFinite(s.seed)) ? Math.floor(s.seed) : null,
    useMemory: s.useMemory !== false,
    toolsEnabled: s.toolsEnabled !== false,
    marathon: s.marathon === true, // strictly opt-in
    customInstructions: typeof s.customInstructions === 'string' ? s.customInstructions.slice(0, 2000) : '',
    skill: typeof s.skill === 'string' && s.skill.trim() ? s.skill.trim() : null,
    visionRelayModel: typeof s.visionRelayModel === 'string' && s.visionRelayModel.trim() ? s.visionRelayModel.trim() : null,
    stream: s.stream !== false,
    markdown: s.markdown !== false,
    showStats: s.showStats !== false,
    // ⭐⭐ `probe` — THE FIXTURE MARK, AND IT WAS INERT UNTIL NOW. `test/harness.mjs` stamps
    // `settings.probe = true` on every conversation a check creates, in one place, precisely so no check
    // can forget. This allowlist dropped it — measured: 0 of 76 conversations carried the flag — so the
    // guard existed on paper and the only thing keeping fixtures out of the experimental population was
    // the `messages >= 4` thin gate, by accident.
    // ⛔ IT MATTERS MORE NOW THAN IT DID: the noticing pass only read fixtures, the reflection lifecycle
    // WRITES MEMORIES. A fixture that earns a reflection puts a test artefact into her durable memory.
    // ⓘ A real client may set it too. That is not a privilege — it excludes the conversation from the
    // experimental passes and nothing else, which is a legitimate "don't study this one".
    probe: s.probe === true,
  }
}

// Effective settings for a request: members are locked to the platform defaults; tuners
// get the conversation's stored settings (falling back to the platform defaults).
function resolveSettings(user, convo, serverConfig) {
  const defaults = effectiveDefaultSettings(serverConfig)
  if (!can(user, 'select_model')) return defaults
  return sanitizeSettings(convo?.settings || defaults)
}

// Build the adapter options object from effective settings.
/**
 * ⭐⭐ HOW LONG SOTERA'S CHAT MODEL STAYS RESIDENT, and it is a SLIDING WINDOW, not a timer.
 *
 * ⚠️ THE DEFECT THIS FIXES: the chat path set **no** `keep_alive` at all, so Ollama's own 5-minute
 * default applied — `local-monitor.js` already said so in a comment (*"chat requests do not set
 * keep_alive at all"*), and the Local console showed `qwen3.6:35b` expiring in 5m. A 36B reload between
 * ordinary turns is ~29s the person pays for nothing.
 *
 * ⛔ NO BACKGROUND PING. Ote: *"Don't implement a periodic background ping just to keep it alive.
 * Ollama's keep_alive is already a sliding window: each request should establish/renew the expiry."*
 * ⇒ the renewal is a side effect of real work, and a model nobody is using is allowed to fall out.
 *
 * ⭐ SCOPED TO SOTERA. This sets the field on HER requests; ⛔ it does not change Ollama's global default,
 * which is shared with everything else on this box.
 * ⓘ Override with `chat.keepAlive` (any string Ollama accepts — '10m', '1h', '-1' for never).
 */
function chatKeepAlive(config) {
  try { const v = getSetting(config, 'chat.keepAlive'); return typeof v === 'string' && v ? v : '10m' } catch { return '10m' }
}

function buildOptions(settings, config = null) {
  // ⭐ ONE options OBJECT SERVES THE WHOLE TURN — the first `streamChat`, every tool-continuation round,
  // and the forced closing round all read this same object. That is what makes "the model must not
  // expire mid-interaction" true by construction rather than by remembering to set it in three places.
  const o = { stream: true, reasoning: { enabled: settings.reasoning.enabled }, keepAlive: chatKeepAlive(config) }
  if (settings.reasoning.enabled && settings.reasoning.effort) o.reasoning.effort = settings.reasoning.effort
  if (settings.temperature != null) o.temperature = settings.temperature
  if (settings.top_p != null) o.top_p = settings.top_p
  if (settings.max_tokens != null) o.max_tokens = settings.max_tokens
  // Per-conversation context window. The chat runtime treats a caller numCtx as a FURTHER cap (min),
  // so this can only narrow root's resolved window — a chat user cannot raise it past the platform cap.
  if (settings.numCtx != null) o.numCtx = settings.numCtx
  if (settings.seed != null) o.seed = settings.seed
  // Conversations get extended next turn — providers with explicit prompt caching
  // (anthropic-kind) may mark breakpoints. One-shot internal/API calls never set this.
  o.cacheConversation = true
  return o
}

// Merge one agent-loop round's usage into the turn's: token counts ADD across rounds,
// prefill takes the round MAX (the biggest prefill is what the user felt — later rounds
// reuse the in-turn prefix), cache fields ADD. Null-preserving: a provider that never
// reports a field leaves it null instead of fabricating a 0.
function mergeUsage(turn, round) {
  if (!turn) return round
  if (!round) return turn
  const add = (a, b) => (a == null && b == null ? null : (a || 0) + (b || 0))
  return {
    promptTokens: round.promptTokens ?? turn.promptTokens,
    completionTokens: add(turn.completionTokens, round.completionTokens),
    promptEvalMs: turn.promptEvalMs == null && round.promptEvalMs == null
      ? null : Math.max(turn.promptEvalMs || 0, round.promptEvalMs || 0),
    cachedTokens: add(turn.cachedTokens, round.cachedTokens),
    cacheWriteTokens: add(turn.cacheWriteTokens, round.cacheWriteTokens),
  }
}

export default async function chatSiteRoutes(fastify) {
  fastify.addHook('preHandler', requireLogin())
  // Every chat-site request rides on the user's system "chat" API key (kind='chat') so
  // chat usage is attributed per key like the API surfaces. Ensured here (the chat site's
  // opening calls — /chat/models, /chat/conversations — go through this hook, which is
  // where the auto-renew of an expired key happens). Best-effort: never blocks chat.
  fastify.addHook('preHandler', async (request) => {
    try {
      request.chatApiKey = await ensureChatApiKey(fastify.db, request.user, fastify.config)
    } catch { request.chatApiKey = null }
  })
  const chatCap = requireCapability('chat')

  // Root's chat kill switch: a DISABLED system chat key blocks this user's
  // model-calling endpoints (send/regenerate/edit-rerun/suggest-title) with a clear
  // error; browsing existing history stays allowed. ensureChatApiKey never
  // re-enables a disabled key — recovery is a root enable or force-renew.
  const requireChatEnabled = async (request, reply) => {
    if (request.chatApiKey && request.chatApiKey.is_active === false) {
      return reply.code(403).send({ error: { code: 'chat_disabled', message: 'Chat access for this account has been disabled by an administrator' } })
    }
  }

  // Scope every query on this route to the caller. `ownedBy` REFUSES rather than falling back to
  // `user_id IS NULL` — that fallback is how a query once read rows nobody owned. See auth/owner.js.
  const ownWhere = (req) => ownedBy(req.user, 'this conversation')

  // Attach capability tags + gating verdicts to "provider/model" entries: probe rows
  // (model_capabilities) override DECLARED metadata (Ollama /api/show), which overrides
  // name-INFERENCE. Emits per model:
  //   capabilities  — merged caps (drives the picker tags / vision relay list)
  //   inferred      — true when only a name guess backs the tags (UI shows '?')
  //   notChat       — the model can't chat (specialist class / probe-failed) — the
  //                   picker segregates it and the send path blocks it
  //   unsupported   — thinking/tools the model VERIFIABLY lacks — the ⚙ popover
  //                   disables those toggles (send path strips them regardless)
  // Best-effort — the picker must never break because a capability lookup failed.
  async function withCapabilities(models, userId = null) {
    const provs = effectiveProvidersFor(fastify.config, userId)
    const declared = new Map() // 'provider/model' -> caps
    await Promise.all(Object.entries(provs).map(async ([name, cfg]) => {
      const adapter = adapters[cfg.kind || name]
      if (cfg.enabled === false || typeof adapter?.listModelsDetailed !== 'function') return
      try {
        for (const m of await adapter.listModelsDetailed({ ...cfg, name })) {
          const r = capsOf(m)
          if (!r.inferred) declared.set(`${name}/${m.id}`, r.caps)
        }
      } catch { /* enrichment only */ }
    }))
    const tested = new Map() // 'provider/model' -> { capability: status }
    try {
      for (const r of await fastify.db.mst_model_capabilities.findAll()) {
        const k = `${r.provider}/${r.model}`
        if (!tested.has(k)) tested.set(k, {})
        tested.get(k)[r.capability] = r.status
      }
    } catch { /* probe rows are enrichment only */ }
    return models.map((m) => {
      const bare = m.raw || String(m.id).split('/').slice(1).join('/')
      const v = mergeCapVerdict(declared.get(m.id) || null, inferCapsFromName(bare), tested.get(m.id) || {})
      const out = { ...m, capabilities: v.caps, inferred: !v.known }
      if (!v.chatCapable) out.notChat = true
      if (v.unsupported.length) out.unsupported = v.unsupported
      // The context window a chat with this model ACTUALLY gets (limit ∩ auto-optimize cap;
      // "no limit" resolves to the trained max) — the picker shows it so users know what a
      // long conversation is working with. Ollama-kind only; 0/unknown just stays absent.
      const provName = String(m.id).split('/')[0]
      const cfg = provs[provName]
      // A CPU-pinned provider ("forceCpu"): flag it so the picker can MARK it. Without a marker the
      // closed control shows only the short model name, so a CPU entry and its GPU twin read identically
      // (Ote: "keep -cpu suffix, so it still mark orviosly") — and picking the wrong one is the
      // difference between a 12s reply and a 4-minute one.
      if (cfg?.forceCpu === true) out.cpu = true
      if (cfg && (cfg.kind || provName) === 'ollama') {
        let win = guardWindow(fastify.config, cfg.host, bare)
        // Honour the provider's own numCtxCap in the READOUT too. guardWindow only knows the global
        // limit ∩ calibration, so a CPU-pinned provider advertised its model's full 262144 while every
        // request through it is actually capped at 8192 — a picker that states a window the turn will
        // never get is the same class of lie as a status line that says the model is loading when it is
        // waiting for you.
        if (Number.isInteger(cfg.numCtxCap) && cfg.numCtxCap > 0) win = win > 0 ? Math.min(win, cfg.numCtxCap) : cfg.numCtxCap
        if (win > 0) out.effectiveContext = win
      }
      return out
    })
  }

  // Per-user chat context: the effective leave-a-generating-chat behavior (per-account
  // pref layered over the platform setting) and the effective DEFAULT MODEL (a personal
  // default applies only while allowed — role unlocked, or root, whose prefs live in the
  // settings table since it has no users row). A stale pref from a since-locked role is
  // ignored, not deleted.
  const userChatContext = async (request) => {
    const platformBg = getSetting(fastify.config, 'chat.backgroundGeneration') === true
    const platformDefault = getSetting(fastify.config, 'chat.defaultModel') || null
    const canSetDefaultModel = canSetPersonalDefault(fastify.config, request.user)
    const ctx = { backgroundGeneration: platformBg, defaultModel: platformDefault, platformDefaultModel: platformDefault, canSetDefaultModel }
    const prefs = (request.user?.isRoot
      ? await loadRootPrefs(fastify.db)
      : (await fastify.db.mst_users.findByPk(request.user.id, { attributes: ['id', 'chat_prefs'] }))?.chat_prefs) || {}
    if (prefs.backgroundGeneration === 'on') ctx.backgroundGeneration = true
    else if (prefs.backgroundGeneration === 'off') ctx.backgroundGeneration = false
    if (canSetDefaultModel && typeof prefs.defaultModel === 'string' && prefs.defaultModel) ctx.defaultModel = prefs.defaultModel
    return ctx
  }

  // The caller's IANA timezone from their prefs (auto-synced from the browser), null when
  // unset. One PK read per call; failures degrade to "unknown" — time must never break a turn.
  const userTimezone = async (request) => {
    try {
      const prefs = request.user?.isRoot
        ? await loadRootPrefs(fastify.db)
        : (await fastify.db.mst_users.findByPk(request.user.id, { attributes: ['id', 'chat_prefs'] }))?.chat_prefs
      const tz = prefs?.timezone
      return typeof tz === 'string' && tz ? tz : null
    } catch {
      return null
    }
  }

  // ---- models the user may pick ----
  fastify.get('/chat/models', { preHandler: chatCap }, async (request, reply) => {
    const { backgroundGeneration, defaultModel: def, platformDefaultModel, canSetDefaultModel } = await userChatContext(request)
    const backgroundMaxConcurrent = getSetting(fastify.config, 'chat.backgroundMaxConcurrent')
    const steerEnabled = getSetting(fastify.config, 'chat.steerEnabled') === true
    const maxSteersPerReply = getSetting(fastify.config, 'chat.maxSteersPerReply')
    const marathonEnabled = getSetting(fastify.config, 'chat.marathonEnabled') !== false // ⚙ hides the toggle when off
    const defaultSettings = effectiveDefaultSettings(fastify.config) // ⚙ defaults for new chats + the panel's Reset
    // THE VOICE exists only if root pointed it at a sidecar. Reported as a BOOLEAN, not the URL: the
    // client only needs to know whether to offer 🔊, and the URL would leak infrastructure into every payload.
    const speechEnabled = voiceEnabled(fastify.config)
    // Which model the ⚙ relay picker's "(platform default)" actually resolves to, so the UI can
    // NAME it instead of leaving the user to guess (Ote 2026-08-03). Same helper the turn uses.
    const visionRelayDefault = platformVisionRelayModel(fastify.config)
    if (can(request.user, 'select_model')) {
      const userId = ownerIdOf(request.user, 'this request') // BYOK: include this user's own providers
      const { models, errors } = await listAllModels({ serverConfig: fastify.config, userId })
      return reply.send({ canSelect: true, defaultModel: def, platformDefaultModel, canSetDefaultModel, backgroundGeneration, backgroundMaxConcurrent, steerEnabled, maxSteersPerReply, marathonEnabled, defaultSettings, visionRelayDefault, speechEnabled, models: await withCapabilities(models, userId), errors })
    }
    return reply.send({ canSelect: false, defaultModel: def, platformDefaultModel, canSetDefaultModel, backgroundGeneration, backgroundMaxConcurrent, steerEnabled, maxSteersPerReply, marathonEnabled, defaultSettings, visionRelayDefault, speechEnabled, models: def ? await withCapabilities([{ id: def }]) : [] })
  })

  // ---- skills the user may run a conversation "as" (installed Skill components) ----
  // The flags tell the chat UI which skill surfaces root has enabled: `binding` gates the
  // ⚙ Skill picker, `slashCommands` gates the composer "/" trigger. The list still ships
  // either way (the 🧩 chip and "(not installed)" labels need names).
  fastify.get('/chat/skills', { preHandler: chatCap }, async (request, reply) => {
    return reply.send({
      skills: listSkills(fastify.config), // root-disabled builtin skills stay hidden here
      binding: getSetting(fastify.config, 'chat.skillBindingEnabled') !== false,
      slashCommands: getSetting(fastify.config, 'chat.slashCommandsEnabled') !== false,
    })
  })

  // ---- list (optional ?q= searches titles AND message content) ----
  fastify.get('/chat/conversations', { preHandler: chatCap }, async (request, reply) => {
    const q = String(request.query?.q || '').trim()
    const wantArchived = String(request.query?.archived || '') === '1'
    // Default view = active only; ?archived=1 = the archive bin.
    let where = { ...ownWhere(request), archived_at: wantArchived ? { [Op.ne]: null } : null }
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`
      // ── ARM 1: SUBSTRING (unchanged behaviour, now scoped) ──────────────────────────────────────
      // ⚠️ KEPT, NOT REPLACED BY THE SEMANTIC ARM. This box is a type-to-filter as much as a search:
      // typing "kyo" must still find "Kyoto" mid-word, and full-text/vector matching works on WORDS,
      // so a substring fragment would find nothing. Replacing this outright would have looked like an
      // upgrade and felt like a regression on every partial word anyone types.
      // The subquery is now scoped to THIS user's conversations. It was reading every message row in
      // the table and relying on the outer ownWhere to filter afterwards — correct, but it scanned
      // other people's messages to answer one person's keystroke.
      const ownIds = (await fastify.db.txn_conversations.findAll({
        attributes: ['id'], where: ownWhere(request), raw: true,
      })).map((c) => c.id)
      const hits = ownIds.length ? await fastify.db.txn_messages.findAll({
        attributes: ['conversation_id'],
        where: { content: { [Op.iLike]: like }, conversation_id: { [Op.in]: ownIds } },
        group: ['conversation_id'],
        raw: true,
      }) : []

      // ── ARM 2: SEMANTIC (dense ⊕ lexical, RRF-fused) ────────────────────────────────────────────
      // The same index the model already searches on every turn, now reachable by the person. It
      // answers "which chat was that about" when no word matches — the thing substring cannot do.
      // ⚠️ GATED ON THE QUERY LOOKING LIKE A TOPIC. The box is debounced at 300 ms and the embedder
      // runs on CPU (~1-2 s), so embedding every keystroke fragment would make the sidebar feel
      // broken. A short fragment is a filter and stays instant on arm 1; three words or a dozen
      // characters is someone asking a question, and worth the round trip.
      // ⚠️ AND IT NEVER BLOCKS THE LIST. Raced against a timeout, wrapped in try/catch: this arm is
      // strictly additive, so if the embedder is down or slow the sidebar still answers from arm 1.
      const looksLikeTopic = q.length >= 12 || q.trim().split(/\s+/).length >= 3
      let semanticIds = []
      if (looksLikeTopic) {
        try {
          const cs = buildConversationSearch(fastify, {
            userId: ownerIdOf(request.user, 'this request'),
            currentConversationId: null, // a user searching their history means ALL of it, current chat included
            embed: makeEmbedder(fastify, { userId: ownerIdOf(request.user, 'an embedding') }),
          })
          // ⚠️ 5s, AND THE NUMBER IS NOT ARBITRARY — it was 2500 and that silently broke first use.
          // Measured: the embedder COLD-loads in ~3.1s (ram-bandwidth-baseline), warm calls are ~170ms.
          // A 2.5s cap therefore guaranteed a timeout on the first search after the model expired its
          // keep_alive, and the failure is invisible: the race resolves null, the arm contributes
          // nothing, and the user just sees substring results and concludes semantic search does not
          // work. Verified live — cold query timed out at 2530ms with 0 hits, the next one answered in
          // 804ms with 3. A budget below the known cold-start cost is not a safety margin, it is an
          // off switch that only fires when the feature is needed most.
          const res = await Promise.race([
            cs.search(q, { limit: 25, minLength: 0, denseMinSim: 0.55 }),
            new Promise((r) => setTimeout(() => r(null), 5000)),
          ])
          semanticIds = [...new Set((res?.evidence || []).map((e) => e.conversation?.id).filter(Boolean))]
        } catch (e) {
          request.log?.warn?.({ err: e?.message }, '[chat] semantic conversation search unavailable — substring only')
        }
      }

      where = {
        ...where,
        [Op.or]: [
          { title: { [Op.iLike]: like } },
          { id: { [Op.in]: [...new Set([...hits.map((h) => h.conversation_id), ...semanticIds])] } },
        ],
      }
    }
    const rows = await fastify.db.txn_conversations.findAll({
      where,
      order: [['updated_at', 'DESC']],
    })
    return reply.send({
      conversations: rows.map((c) => ({ id: c.id, title: c.title, model: c.model, updatedAt: c.updated_at, createdAt: c.created_at, archivedAt: c.archived_at || null, unread: c.unread === true || undefined })),
    })
  })

  // ---- events: server push for PROACTIVE content (scheduled runs, digests) ----
  // The page can't know a background run landed — this stream tells it. Events are
  // HINTS ("conversations changed"); the client re-fetches through the normal APIs,
  // so the stream itself never carries content. EventSource auto-reconnects.
  fastify.get('/chat/events', { preHandler: chatCap }, (request, reply) => {
    // cap concurrent streams per user (tabs/devices) so an authenticated client can't
    // exhaust sockets/timers — generous enough for real multi-device use
    if (chatSubscriberCount(ownerIdOf(request.user, 'this request')) >= 8) {
      return reply.code(429).send({ error: { code: 'too_many_streams', message: 'Too many open event streams — close some tabs.' } })
    }
    reply.hijack()
    reply.raw.writeHead(200, SSE_HEADERS)
    reply.raw.write(sse({ type: 'hello' }))
    const unsubscribe = subscribeChatEvents(ownerIdOf(request.user, 'this request'), (payload) => {
      if (reply.raw.writableEnded || reply.raw.destroyed) return
      try { reply.raw.write(sse(payload)) } catch { /* closed mid-write — close handler cleans up */ }
    })
    // keepalive comment every 25s so proxies don't reap the idle stream
    const ping = setInterval(() => {
      if (reply.raw.writableEnded || reply.raw.destroyed) return
      try { reply.raw.write(': ping\n\n') } catch { /* ditto */ }
    }, 25_000)
    request.raw.on('close', () => { clearInterval(ping); unsubscribe() })
  })

  // ---- create ----
  fastify.post('/chat/conversations', {
    preHandler: chatCap,
    schema: { body: { type: 'object', properties: { title: { type: 'string' }, model: { type: 'string' }, settings: { type: 'object' }, incognito: { type: 'boolean' } }, additionalProperties: false } },
  }, async (request, reply) => {
    const model = resolveModel(fastify.config, request.user, request.body?.model)
    // Only tuners can seed settings; members always start from the platform defaults.
    const settings = (request.body?.settings && can(request.user, 'select_model'))
      ? sanitizeSettings(request.body.settings)
      : effectiveDefaultSettings(fastify.config)
    // Incognito is a create-time STICKY privacy choice available to ANY chat user (not a tuning
    // privilege) — set only at create, never patchable (absent from the PATCH schema on purpose).
    const convo = await fastify.db.txn_conversations.create({
      user_id: ownerIdOf(request.user, 'a conversation'),
      title: request.body?.title || 'New chat',
      model,
      settings,
      incognito: request.body?.incognito === true,
    })
    return reply.code(201).send({ conversation: { id: convo.id, title: convo.title, model: convo.model, settings: convo.settings, incognito: convo.incognito, createdAt: convo.created_at } })
  })

  // ---- get one (with messages) ----
  // PROJECTED context usage for a conversation that has not generated a reply in THIS process.
  //
  // Ote: "but we can use that conversation to calc ctx right? why won't make it always show". Correct —
  // and my reason for not doing it was weaker than I put it. The expensive part of a real turn is the
  // per-turn RETRIEVAL (ranked recall, conversation-search evidence): embeddings plus a vector search.
  // Everything that DOMINATES the number is cheap and deterministic — tool definitions were measured at
  // ~71% of a small prompt, and the system prompt is a pure function of flags. Retrieval was 123-255
  // tokens of ~7,300 in the live runs, i.e. under 4%.
  //
  // So: compute the cheap 96% on open, and let the next real reply replace it with the measured value.
  // The response says which one it is (`projected`) and the UI says so too — an estimate presented as a
  // measurement is the failure this whole surface exists to avoid.
  async function projectContextUsage(request, convo, msgs) {
    try {
      const settings = resolveSettings(request.user, convo, fastify.config)
      const { provider: providerName, model: modelName } = parseModelRef({ model: convo.model })
      const provCfg = effectiveProvidersFor(fastify.config, ownerIdOf(request.user, 'this request'))?.[providerName]
      const provKind = provCfg?.kind || providerName
      let ctxWindow = provKind === 'ollama' ? guardWindow(fastify.config, provCfg?.host, modelName) : 0
      if (provKind === 'ollama' && Number.isInteger(provCfg?.numCtxCap) && provCfg.numCtxCap > 0) {
        ctxWindow = ctxWindow > 0 ? Math.min(ctxWindow, provCfg.numCtxCap) : provCfg.numCtxCap
      }
      // The conversation's own narrower window, if it set one — the meter must measure against the
      // window this chat ACTUALLY gets, or the fill percentage is against a window nobody is using.
      if (ctxWindow > 0 && settings.numCtx != null) ctxWindow = Math.min(ctxWindow, settings.numCtx)
      if (!(ctxWindow > 0)) return null // no window to measure against — say nothing rather than invent one

      const toolsOn = settings.toolsEnabled && getSetting(fastify.config, 'chat.toolsEnabled') !== false
      const toolDefs = toolsOn ? toolDefinitions() : undefined
      const composed = composeSystemContext({
        systemPrompt: fastify.config?.chat?.systemPrompt || null,
        assistantIdentity: fastify.config?.chat?.assistantIdentity ?? null, // `??` — see the other call site
        customInstructions: settings.customInstructions,
        user: { username: request.user?.username, email: request.user?.email, displayName: request.user?.displayName },
        timezone: await userTimezone(request),
        toolsOn,
        showTodoRule: toolsOn && userMayTodo(fastify.config, request.user),
        showWorkingMemoryRule: toolsOn && getSetting(fastify.config, 'memory.workingMemoryEnabled') !== false,
        showAskUserRule: toolsOn,
        showProfileRule: toolsOn,
        showSearchRule: toolsOn && (toolDefs || []).some((d) => d?.function?.name === 'search_web'),
        // The skills CATALOGUE is a constant, non-trivial part of the system prompt and costs one
        // config read — leaving it out is what made the first projection read 9.9% low instead of the
        // ~4% I had claimed. Everything cheap and always-present belongs in the projection; only the
        // per-turn retrieval is allowed to be missing.
        invocableSkills: toolsOn && getSetting(fastify.config, 'chat.skillTriggerEnabled') !== false
          ? listSkills(fastify.config).filter((s) => s.modelInvocable)
          : [],
        useMemory: settings.useMemory,
        summary: convo.summary || null,
      })
      const history = msgs.map((m) => ({ role: m.role, content: m.content, images: m.images || undefined }))
      const b = contextBreakdown({
        systemParts: composed.parts,
        preHistory: composed.preHistory,
        history,
        // the datetime line is the only tail entry that is always present and free to compute
        tail: composeRuntimeTail({ toolsOn, useMemory: false, nowString: '0000-00-00, 00:00', zone: 'UTC' }),
        toolDefs,
        window: ctxWindow,
      })
      return { ...b, projected: true }
    } catch { return null } // a projection must never break opening a conversation
  }

  fastify.get('/chat/conversations/:id', { preHandler: chatCap }, async (request, reply) => {
    const convo = await fastify.db.txn_conversations.findOne({ where: { id: request.params.id, ...ownWhere(request) } })
    if (!convo) return reply.code(404).send({ error: { code: 'not_found', message: 'Conversation not found' } })
    // opening it IS seeing it — clear the proactive scheduled-run marker
    if (convo.unread) convo.update({ unread: false }).catch(() => {})
    const msgs = await fastify.db.txn_messages.findAll({ where: { conversation_id: convo.id }, order: [['rolling_id', 'ASC']] })
    return reply.send({
      conversation: { id: convo.id, title: convo.title, model: convo.model, settings: convo.settings || effectiveDefaultSettings(fastify.config), incognito: convo.incognito, draft: convo.draft || undefined },
      messages: msgs.map((m) => ({
        id: m.id, role: m.role, content: m.content, reasoning: m.reasoning, images: m.images || undefined,
        imagesMeta: Array.isArray(m.images_meta) && m.images_meta.length ? m.images_meta : undefined,
        // What the vision relay saw, so the reader can judge the description their answer was built
        // from — it survives reload because it lives on the row, not in the live stream.
        imageDescriptions: describedImagesView(m),
        files: Array.isArray(m.files) ? m.files.map((f) => ({ name: f.name, note: f.note, chars: f.text?.length ?? 0 })) : undefined,
        tools: Array.isArray(m.tool_calls) && m.tool_calls.length ? m.tool_calls : undefined,
        segments: Array.isArray(m.segments) && m.segments.length ? m.segments : undefined,
        provider: m.provider, model: m.model, metrics: m.metrics, createdAt: m.created_at,
        skill: m.skill || undefined, // { id, name } — "ran as skill X", survives reload
        error: m.error ? (m.error.message || m.error.code || 'error') : undefined, // blank-reply reason, survives reload
      })),
      // the conversation's current working plan (Todo Feature snapshot) — the rail renders
      // it on open; live updates arrive via the 'todo-changed' push
      todo: await getTodo(fastify, convo.id),
      // a marathon driver is mid-flight for this convo — the client shows a live "working in
      // the background" indicator so an auto-continue round is never invisible (Ote's report:
      // background rounds stream to nobody, so on reload the churn looked like nothing).
      activeRun: isMarathonActive(convo.id) || undefined,
      // The context meter, so reopening a chat shows how full it is instead of nothing until the next
      // reply. Same gate as the live event — the breakdown is WITHHELD here too, not merely hidden by
      // the client, so this cannot become a back door around context_detail.
      // MEASURED if this conversation has replied in this process, otherwise PROJECTED from the prompt
      // it would send — so the meter is always there, and always says which kind of number it is.
      contextUsage: await (async () => {
        const u = lastContextUsage(convo.id) || await projectContextUsage(request, convo, msgs)
        if (!u) return undefined
        const detailed = can(request.user, 'context_detail')
        return {
          window: u.window, used: u.used, free: u.free, usedPct: u.usedPct,
          projected: u.projected || undefined, detail: detailed,
          ...(detailed ? { categories: u.categories, parts: u.parts } : {}),
        }
      })(),
    })
  })

  // ---- the working plan (Todo Feature protocol snapshot) — the rail refetches this on
  // the 'todo-changed' SSE push, so it never reloads the whole message list ----
  fastify.get('/chat/conversations/:id/todo', { preHandler: chatCap }, async (request, reply) => {
    const convo = await fastify.db.txn_conversations.findOne({ where: { id: request.params.id, ...ownWhere(request) } })
    if (!convo) return reply.code(404).send({ error: { code: 'not_found', message: 'Conversation not found' } })
    return reply.send({ todo: await getTodo(fastify, convo.id) })
  })

  // Clear the working plan — the rail's ✕ (user tidy-up, like GitHub Copilot's clear). Drops
  // the active session + tasks and pushes todo-changed so the rail vanishes live everywhere.
  fastify.delete('/chat/conversations/:id/todo', { preHandler: chatCap }, async (request, reply) => {
    const convo = await fastify.db.txn_conversations.findOne({ where: { id: request.params.id, ...ownWhere(request) } })
    if (!convo) return reply.code(404).send({ error: { code: 'not_found', message: 'Conversation not found' } })
    return reply.send(await clearTodo(fastify, request.user, convo.id))
  })

  // ---- HumanInteraction (the human-driven Feature protocol) ----
  // The pending question for this conversation — renderers fetch on the
  // 'interaction-created' SSE hint (the push carries ids only, never payloads).
  fastify.get('/chat/conversations/:id/interactions/pending', { preHandler: chatCap }, async (request, reply) => {
    const convo = await fastify.db.txn_conversations.findOne({ where: { id: request.params.id, ...ownWhere(request) } })
    if (!convo) return reply.code(404).send({ error: { code: 'not_found', message: 'Conversation not found' } })
    return reply.send(await getPendingInteraction(fastify, convo.id))
  })

  // Resolve a pending question: structured answers, free text (D2 — typing while pending
  // answers the question), or skip. Owner-only; first answer wins (atomic claim).
  fastify.post('/chat/conversations/:id/interactions/:iid/answer', {
    preHandler: chatCap,
    schema: {
      body: {
        type: 'object',
        properties: {
          answers: {
            type: 'array',
            maxItems: 4,
            items: {
              type: 'object',
              properties: {
                selected: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 200 } },
                custom: { type: 'string', maxLength: 2000 },
              },
              additionalProperties: false,
            },
          },
          freeText: { type: 'string', maxLength: 4000 },
          skip: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const convo = await fastify.db.txn_conversations.findOne({ where: { id: request.params.id, ...ownWhere(request) } })
    if (!convo) return reply.code(404).send({ error: { code: 'not_found', message: 'Conversation not found' } })
    const out = await answerInteraction(fastify, request.user, convo.id, request.params.iid, request.body || {})
    if (out.error) return reply.code(out.error.status).send({ error: { code: out.error.code, message: out.error.message } })
    return reply.send(out)
  })

  // ---- rename / change model / change settings / fold the composer draft ----
  fastify.patch('/chat/conversations/:id', {
    preHandler: chatCap,
    schema: { body: { type: 'object', properties: { title: { type: 'string' }, model: { type: 'string' }, settings: { type: 'object' }, archived: { type: 'boolean' }, draft: { type: 'string', maxLength: 20000 } }, additionalProperties: false } },
  }, async (request, reply) => {
    const convo = await fastify.db.txn_conversations.findOne({ where: { id: request.params.id, ...ownWhere(request) } })
    if (!convo) return reply.code(404).send({ error: { code: 'not_found', message: 'Conversation not found' } })
    const patch = {}
    if (typeof request.body?.title === 'string') patch.title = request.body.title
    // unsent composer text (debounced client fold; '' clears). Kept out of updated_at —
    // typing must not reorder the conversation list.
    if (typeof request.body?.draft === 'string') patch.draft = request.body.draft || null
    // archive / restore: any role may archive their own chats (no model permission needed)
    if (typeof request.body?.archived === 'boolean') {
      patch.archived_at = request.body.archived ? new Date() : null
    }
    if (typeof request.body?.model === 'string') {
      if (!can(request.user, 'select_model')) {
        return reply.code(403).send({ error: { code: 'model_locked', message: 'Your role cannot change the model' } })
      }
      patch.model = request.body.model
    }
    if (request.body?.settings && typeof request.body.settings === 'object') {
      if (can(request.user, 'select_model')) {
        // ⚠️ `probe` IS STICKY. It records what a conversation IS (a check's fixture), not a preference, and
        // a full-control settings PATCH that omitted it would silently un-mark a fixture — putting it back
        // into the population the mark exists to keep it out of.
        patch.settings = { ...sanitizeSettings(request.body.settings), probe: convo.settings?.probe === true || request.body.settings?.probe === true }
      } else {
        // members may only change view/transport prefs (stream/markdown/showStats)
        const current = sanitizeSettings(convo.settings || effectiveDefaultSettings(fastify.config))
        const next = { ...current }
        for (const f of VIEW_FIELDS) {
          if (request.body.settings[f] !== undefined) next[f] = request.body.settings[f] !== false
        }
        patch.settings = next
      }
    }
    // a draft-only fold is SILENT (updated_at untouched) so typing never bumps the list order
    const draftOnly = Object.keys(patch).length === 1 && 'draft' in patch
    await convo.update(patch, { silent: draftOnly })
    return reply.send({ conversation: { id: convo.id, title: convo.title, model: convo.model, settings: convo.settings, archivedAt: convo.archived_at || null } })
  })

  // ---- suggest a title (LLM; used by the rename editors' ✦ button) ----
  // Considers the WHOLE conversation, not just the opening exchange (topics drift):
  // the rolling summary (if the chat is long enough to have one) + the last turns.
  // Any header we set must survive Node's latin1-only header encoder, or it throws AFTER the expensive
  // work is finished and the user gets a naked 500. Values here are machine-readable by design, but a
  // voice name or engine id could still arrive non-ASCII, so everything goes through this.
  const asciiHeader = (v) => String(v ?? '').replace(/[^ -~]/g, '?').slice(0, 200)

  // SPEAK a reply aloud — THE VOICE (MM Arc · Audio phase, Voice v1).
  //
  // Renders ONE assistant message's canonical text as audio via the LOCAL sidecar and returns the bytes.
  // Per RFC_AUDIO_MODALITY a spoken reply is a DERIVED RENDERING of the text answer: it is not the
  // message, is never replayed into context, and the text remains the record. So this route can cache
  // hard and the cache can be deleted at any time without touching conversation history.
  //
  // Two properties worth keeping when this changes:
  //   • Scoped through the CONVERSATION (ownWhere), not by bare message id — speaking obeys the same
  //     ownership rule as reading, so a message id is never a capability on its own.
  //   • The cache is AUTHORITATIVE, not an optimisation: no candidate engine exposes a seed, so a
  //     re-render is a DIFFERENT TAKE. First render wins and is served forever, otherwise pressing 🔊
  //     twice on one message would produce two different voices.
  //
  // OFF unless root sets chat.speechSidecarUrl. Nothing leaves this machine — the sidecar is local.
  fastify.post('/chat/conversations/:id/messages/:messageId/speak', { preHandler: [chatCap, requireChatEnabled] }, async (request, reply) => {
    const convo = await fastify.db.txn_conversations.findOne({ where: { id: request.params.id, ...ownWhere(request) } })
    if (!convo) return reply.code(404).send({ error: { code: 'not_found', message: 'Conversation not found' } })
    if (!voiceEnabled(fastify.config)) {
      return reply.code(400).send({ error: { code: 'speech_disabled', message: 'No voice sidecar is configured (chat.speechSidecarUrl).' } })
    }
    const msg = await fastify.db.txn_messages.findOne({ where: { id: request.params.messageId, conversation_id: convo.id } })
    if (!msg) return reply.code(404).send({ error: { code: 'not_found', message: 'Message not found in this conversation' } })
    // Speak the ANSWER, not the transcript of getting there: reasoning and tool chatter are not the
    // reply, and reading them aloud would be the audio equivalent of replaying drafts.
    const text = String(msg.content || '').trim()
    if (!text) return reply.code(400).send({ error: { code: 'nothing_to_say', message: 'That message has no text to speak.' } })
    try {
      // CHUNK-AND-PLAY. `?chunk=N` renders one sentence-sized piece so the client can start playing #0
      // while #1 is still rendering. OmniVoice runs at RTF ~0.45 — about twice as fast as playback — so
      // the player never catches the renderer, and first sound drops from ~46s to ~3s on a long reply
      // with no engine change at all. Omitting the parameter keeps the whole-clip behaviour.
      const svc = voiceService({ config: fastify.config })
      const wantChunk = request.query?.chunk
      const out = wantChunk === undefined || wantChunk === ''
        ? await svc.speak({ text })
        : await svc.speakChunk({ text, index: wantChunk })
      // ⚠ LOG THE CHARACTERS ACTUALLY SPOKEN, NOT THE WHOLE REPLY. `chars` used to be `text.length` — the
      // length of the ENTIRE message — while `seconds` measured only the one piece that was rendered. Sitting
      // next to each other they read as one ratio, and the pair "chars: 3155, seconds: 5.149" sent me hunting
      // a truncated-render bug that did not exist: chunk 0 was a 77-character heading and the audio was fine.
      // A per-piece measurement beside a whole-message count is not a statistic, it is a trap. Both are worth
      // having, so name both: `chars` = what this clip says, `replyChars` = how big the reply it came from is.
      request.log?.info?.({
        engine: out.engine, voice: out.voice, chars: out.chars ?? null, replyChars: text.length,
        bytes: out.bytes.length,
        seconds: out.seconds, cached: out.cached, renderMs: out.renderMs, clipped: out.clipped,
        chunk: out.chunk ?? null, chunks: out.chunks ?? null,
      }, out.cached ? '[voice] served a cached clip' : '[voice] spoke a reply')
      return reply
        .header('content-type', 'audio/wav')
        // The clip is immutable for its hash, but the ROUTE is per message and a message can be edited,
        // so the browser must not cache the URL. The server-side cache is where reuse belongs.
        .header('cache-control', 'no-store')
        // Facts travel in headers so the client never has to parse (or trust) the audio itself.
        .header('x-audio-seconds', out.seconds != null ? Number(out.seconds).toFixed(2) : '')
        .header('x-audio-clipped', out.clipped ? '1' : '0')
        // Markdown that cannot be spoken (code, tables, images) is dropped; report it as ASCII COUNTS and
        // let the client write the sentence.
        // ⚠ THIS WAS A 500. It used to send the human sentence, which contains an em dash — and Node
        // rejects any header value outside latin1 with ERR_INVALID_CHAR. That threw AFTER the work was
        // done, Fastify turned it into a 500 with its own error shape, and the client showed a bare
        // "Speech failed (500)". Every reply containing a code block or table failed; short prose worked.
        // Header values are a latin1 channel: never put prose in one.
        .header('x-audio-omitted', asciiHeader(
          Object.entries(out.omitted || {}).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(';')))
        .header('x-audio-cached', out.cached ? '1' : '0')
        // Chunk position travels in headers so the client needs no separate planning round trip: it asks
        // for chunk 0, learns the total, and fetches the rest while the first one is already playing.
        .header('x-audio-chunk', out.chunk == null ? '' : String(out.chunk))
        .header('x-audio-chunks', out.chunks == null ? '' : String(out.chunks))
        .header('x-audio-engine', asciiHeader(out.engine))
        .header('x-audio-voice', asciiHeader(out.voice))
        .send(out.bytes)
    } catch (e) {
      // Name the SIDECAR when the sidecar is the problem. "Speech failed" sends someone hunting in the
      // wrong repo; "the sidecar did not answer — is it running?" is one sentence and one action.
      request.log?.warn?.({ err: e?.message, code: e?.code }, '[voice] synthesis failed')
      return reply.code(e?.status || 502).send({ error: { code: e?.code || 'speech_failed', message: e?.message || 'Speech synthesis failed' } })
    }
  })

  // SPEAK ARBITRARY TEXT within a conversation — the seam for ANSWER-WITH-SPEAK.
  //
  // Ote: *"when model start generating final answer, we catch thoese text stream and start feeding to tts
  // stream and make it speak"* and *"try client-side first, but also prepare for server-side"*.
  //
  // THIS ENDPOINT IS THE PREPARATION. Today the browser detects sentence boundaries in the stream it is
  // already receiving and posts each piece here. Tomorrow a scheduled or headless turn — which has no
  // browser — can run `createSpeechStreamer` server-side and call the SAME service method. The transport
  // does not change, so the client-first POC is not a detour.
  //
  // Why it is scoped to a conversation rather than a bare /speak: a message id is not a capability and
  // neither is a text field. Ownership is checked the same way reading is, and the text is capped, so this
  // cannot become a general-purpose GPU endpoint.
  fastify.post('/chat/conversations/:id/speak-text', {
    preHandler: [chatCap, requireChatEnabled],
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        properties: { text: { type: 'string', minLength: 1, maxLength: 4000 } },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const convo = await fastify.db.txn_conversations.findOne({ where: { id: request.params.id, ...ownWhere(request) } })
    if (!convo) return reply.code(404).send({ error: { code: 'not_found', message: 'Conversation not found' } })
    if (!voiceEnabled(fastify.config)) {
      return reply.code(400).send({ error: { code: 'speech_disabled', message: 'No voice sidecar is configured (chat.speechSidecarUrl).' } })
    }
    try {
      const svc = voiceService({ config: fastify.config })
      // ⚠ speakPiece(), NOT render(). Already-cut pieces arrive here, so prepare() is wrong — it would
      // re-clip and re-chunk text the caller deliberately shaped — but render() was wronger: it speaks its
      // argument VERBATIM, and this route used to hand it raw markdown on the strength of a comment saying
      // the streamer had normalised it. It had not; the browser mirror's header said the server did. Nobody
      // did, and the sidecar read '##' and '|' out loud. speakPiece normalises HERE, where it cannot be
      // skipped by whichever caller shows up next (a scheduled turn has no browser).
      // ⚠ THE CLIENT HANGING UP HAS TO REACH THE GPU. Ote, 2026-08-06: *"when i stop or send another message
      // which stop it. the queue render is not stop. so the gpu still take resource"* — he watched "1 rendering"
      // on the Voice card after pressing Stop. The browser now aborts its fetches, but an aborted fetch only
      // closes the SOCKET: without this, the handler was already awaiting the sidecar with a signal that knew
      // about a timeout and nothing else, so the render ran to completion for audio nobody would hear.
      // Same shape as the ollama adapter that never aborted a stream it walked away from — a borrowed remote
      // resource must be released on EVERY exit path, and the forgotten path is always the abnormal one.
      // ⚠ Renders already STARTED inside the sidecar still finish: it is a threaded Python HTTP server with no
      // cooperative cancellation, so this stops the QUEUE (which is what was piling up), not the current frame.
      //
      // ⚠⚠ THIS BROKE SPEAK ONCE ALREADY — 2026-08-06, and both mistakes are worth naming. The first version was
      //   const gone = new AbortController()
      //   request.raw.on('close', () => { if (!reply.sent) gone.abort() })
      // `reply.sent` DOES NOT EXIST on Fastify 5 (it was removed; this app runs 5.8.2), so `!reply.sent` was
      // ALWAYS true and the guard guarded nothing. Ask the raw socket instead — `writableEnded` is real.
      // A deprecated-property check that silently evaluates to "yes, always" is worse than no check: it reads
      // as protection while removing it.
      const gone = new AbortController()
      let finished = false
      request.raw.on('close', () => { if (!finished && !reply.raw.writableEnded) gone.abort() })
      let out
      try {
        out = await svc.speakPiece(String(request.body.text), { signal: gone.signal })
      } finally {
        finished = true
      }
      const omitted = asciiHeader(
        Object.entries(out.omitted || {}).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(';'))
      // NOTHING TO SAY IS NOT A FAILURE. A piece that is only a table or a code block normalises to
      // nothing; 204 tells the client to stay silent for it and move on, where a 4xx would surface a red
      // bar mid-reply for behaving exactly as designed.
      if (out.empty) {
        return reply.code(204).header('cache-control', 'no-store').header('x-audio-omitted', omitted).send()
      }
      return reply
        .header('content-type', 'audio/wav')
        .header('cache-control', 'no-store')
        .header('x-audio-seconds', out.seconds != null ? Number(out.seconds).toFixed(2) : '')
        .header('x-audio-cached', out.cached ? '1' : '0')
        .header('x-audio-omitted', omitted)
        .header('x-audio-engine', asciiHeader(out.engine))
        .send(out.bytes)
    } catch (e) {
      // ⚠ A CANCELLED RENDER IS NOT A FAILURE, AND IT MUST NOT LOG AS ONE. Stop aborts every piece in flight, so
      // one press can produce several of these at once; logging them at warn level would turn a working feature
      // into a wall of red and train whoever reads these logs to skip them. Nobody is on the other end either —
      // the socket is already closed — so there is nothing to send.
      // ⚠ SECOND MISTAKE FROM THE SAME CHANGE: this used to be a bare `return`. A Fastify handler that resolves
      // WITHOUT replying is an error to Fastify, not a no-op — it answers 500 with its own JSON. So every
      // cancelled piece came back as `500 application/json`, and because the browser had already aborted, the
      // failure was invisible in the UI and only showed up as a dead 🔊 button. `reply.hijack()` is the
      // documented way to say "I am deliberately not answering this one".
      if (e?.code === 'client_gone') {
        request.log?.info?.('[voice] piece abandoned — the caller stopped listening')
        reply.hijack()
        try { reply.raw.destroy() } catch { /* already gone */ }
        return
      }
      request.log?.warn?.({ err: e?.message, code: e?.code }, '[voice] live-speak failed')
      return reply.code(e?.status || 502).send({ error: { code: e?.code || 'speech_failed', message: e?.message || 'Speech synthesis failed' } })
    }
  })

  // PRE-WARM the voice. Ote: *"if user use answer with speak, it should warm up omni right after user send a
  // prompt. so when result start going, it can catch up faster"*.
  //
  // Fire-and-forget from the client's point of view: it returns whatever happened, and the client ignores it.
  // A warm-up that fails costs nothing — the first piece loads the model the old way, or refuses for the same
  // reason. So this must never surface an error to the user, and the client must never wait for it.
  fastify.post('/chat/voice/warm', { preHandler: [chatCap, requireChatEnabled] }, async (request, reply) => {
    if (!voiceEnabled(fastify.config)) {
      return reply.code(400).send({ error: { code: 'speech_disabled', message: 'No voice sidecar is configured.' } })
    }
    try {
      return reply.send(await voiceService({ config: fastify.config }).warm())
    } catch (e) {
      request.log?.info?.({ err: e?.message, code: e?.code }, '[voice] pre-warm did not happen')
      return reply.code(e?.status || 502).send({ error: { code: e?.code || 'load_failed', message: e?.message } })
    }
  })

  // Is the Voice actually working? Separate from the boolean in /chat/models because "configured" and
  // "reachable" are different questions, and the answer to the second one changes minute to minute.
  fastify.get('/chat/voice/health', { preHandler: [chatCap] }, async (request, reply) => {
    return reply.send(await voiceService({ config: fastify.config }).health())
  })

  fastify.post('/chat/conversations/:id/suggest-title', { preHandler: [chatCap, requireChatEnabled] }, async (request, reply) => {
    const convo = await fastify.db.txn_conversations.findOne({ where: { id: request.params.id, ...ownWhere(request) } })
    if (!convo) return reply.code(404).send({ error: { code: 'not_found', message: 'Conversation not found' } })

    // Token budget gate — this endpoint calls the provider too; without it, a blocked
    // user could loop ✦ suggestions for free (unmetered) tokens.
    const limitHit = await checkTokenBudget(fastify, ownerIdOf(request.user, 'a token budget check'), request.log)
    if (limitHit) return reply.code(429).send({ error: { code: limitHit.code, message: limitHit.message, budget: limitHit.budget } })

    const recent = (await fastify.db.txn_messages.findAll({
      where: { conversation_id: convo.id }, order: [['rolling_id', 'DESC']], limit: 8,
    })).reverse()
    if (!recent.some((m) => m.role === 'user')) {
      return reply.code(400).send({ error: { code: 'empty_conversation', message: 'Nothing to name yet — send a message first' } })
    }
    const clip = (s, n) => (s || '').slice(0, n)
    const material =
      (convo.summary ? `Summary of the earlier conversation:\n${clip(convo.summary, 800)}\n\n` : '') +
      `Recent messages:\n` +
      recent.map((m) => `${m.role}: ${clip(m.content, 300)}`).join('\n')
    const fallback = clip(recent.find((m) => m.role === 'user')?.content, 48).trim() || 'New chat'
    // '@chat' = title with the conversation's OWN model (skips the summary hop) so titling
    // doesn't force an Ollama model swap — the common case being a small summary model that
    // would otherwise evict the chat model just to name the thread (Ote's ask).
    const titleSetting = getSetting(fastify.config, 'chat.titleModel')
    const modelId = titleSetting === '@chat'
      ? resolveModel(fastify.config, request.user, convo.model)
      : (titleSetting || getSetting(fastify.config, 'chat.summaryModel') || resolveModel(fastify.config, request.user, convo.model))
    let suggestedTitle = fallback
    try {
      const { provider, model } = parseModelRef({ model: modelId })
      const prompt =
        `Write a short, specific title (3 to 6 words, Title Case, no quotes, no trailing punctuation) ` +
        `capturing what this conversation is MAINLY about overall:\n${material}\nTitle:`
      const startedAt = Date.now()
      const res = await chat({
        serverConfig: fastify.config,
        request: { provider, model, messages: [{ role: 'user', content: prompt }], options: { stream: false, reasoning: { enabled: false }, max_tokens: 24, keepAlive: chatKeepAlive(fastify.config) }, userId: ownerIdOf(request.user, 'this request') },
      })
      const t = (res?.message?.content || '').trim().split('\n')[0].replace(/^["'#\s]+|["'.\s]+$/g, '')
      if (t) suggestedTitle = t.slice(0, 60)
      // meter it — suggestions spend real provider tokens against the user's budget
      try {
        await fastify.db.log_usage.create({
          // Inside a best-effort try: an unresolvable owner means NO usage row rather than an
          // unattributable one. Unmetered is recoverable; a row nobody owns never is.
          user_id: ownerIdOf(request.user, 'a usage row'),
          api_key_id: request.chatApiKey?.id ?? null,
          provider, model: modelId, endpoint: 'chat.suggest-title',
          prompt_tokens: res?.usage?.promptTokens ?? null,
          completion_tokens: res?.usage?.completionTokens ?? null,
          latency_ms: Date.now() - startedAt,
          request_body: JSON.stringify({ conversation: convo.id }),
          response_body: JSON.stringify({ suggestedTitle }),
        })
      } catch { /* logging must never break the endpoint */ }
    } catch { /* fall back to the first-user-message slice */ }
    return reply.send({ suggestedTitle })
  })

  // ---- delete ----
  // Schedules that run INTO this chat — the delete modal fetches this to warn before removing
  // the chat (deleting it forces those schedules inactive; Ote).
  fastify.get('/chat/conversations/:id/schedule-targets', { preHandler: chatCap }, async (request, reply) => {
    const convo = await fastify.db.txn_conversations.findOne({ where: { id: request.params.id, ...ownWhere(request) } })
    if (!convo) return reply.code(404).send({ error: { code: 'not_found', message: 'Conversation not found' } })
    const targeting = await schedulesTargeting(fastify, convo.id, ownerIdOf(request.user, 'this request'))
    return reply.send({ schedules: targeting, activeCount: targeting.filter((t) => t.enabled).length })
  })

  fastify.delete('/chat/conversations/:id', { preHandler: chatCap }, async (request, reply) => {
    const convo = await fastify.db.txn_conversations.findOne({ where: { id: request.params.id, ...ownWhere(request) } })
    if (!convo) return reply.code(404).send({ error: { code: 'not_found', message: 'Conversation not found' } })
    // Deactivate any schedules that run INTO this chat before it's gone — otherwise they'd
    // fire into a void. They go inactive (reason 'target-deleted') and can't re-arm until the
    // owner picks a new destination (enforced in updateJob).
    const disabledSchedules = await deactivateSchedulesForConversation(fastify, convo.id, ownerIdOf(request.user, 'this request')).catch(() => [])
    await fastify.db.txn_messages.destroy({ where: { conversation_id: convo.id } })
    await convo.destroy()
    return reply.send({ ok: true, id: request.params.id, deleted: true, disabledSchedules })
  })

  // Best-effort usage row for the INTERNAL model calls a turn makes (rolling summary,
  // auto-title, vision relay). They spend real provider tokens, so they must count
  // toward the user's token budget — bodies are NOT stored (just a marker), and
  // logging must never break the turn.
  async function logInternalUsage(endpoint, modelId, usage, userId) {
    try {
      if (!usage) return
      const { provider } = parseModelRef({ model: modelId })
      await fastify.db.log_usage.create({
        user_id: ownerIdOf({ id: userId }, 'an internal usage row'),
        api_key_id: null,
        provider, model: modelId, endpoint,
        prompt_tokens: usage.promptTokens ?? null,
        completion_tokens: usage.completionTokens ?? null,
        request_body: JSON.stringify({ internal: endpoint }),
        response_body: null,
      })
    } catch { /* never block a turn on accounting */ }
  }

  // Fold a batch of older messages into a rolling conversation summary (non-streaming).
  async function summarizeMessages(prevSummary, msgs, modelId, userId = null) {
    const { provider, model } = parseModelRef({ model: modelId })
    const transcript = msgs.map((m) => `${m.role}: ${m.content}`).join('\n')
    const prompt =
      (prevSummary ? `Summary so far:\n${prevSummary}\n\n` : '') +
      `New messages to fold in:\n${transcript}\n\n` +
      `Update the running summary of this conversation. Keep it concise (a few short paragraphs), ` +
      `preserving key facts, names, decisions, and anything needed to continue. Output only the summary text.`
    const res = await chat({
      serverConfig: fastify.config,
      request: { provider, model, messages: [{ role: 'user', content: prompt }], options: { stream: false, reasoning: { enabled: false }, keepAlive: chatKeepAlive(fastify.config) }, userId },
    })
    await logInternalUsage('chat.summary', modelId, res?.usage, userId)
    return (res?.message?.content || '').trim() || prevSummary || ''
  }

  // Generate a short conversation title from the first exchange (LLM; falls back to a slice).
  async function generateTitle(userMsg, assistantMsg, modelId, userId = null) {
    const fallback = (userMsg || 'New chat').slice(0, 48).trim() || 'New chat'
    try {
      const { provider, model } = parseModelRef({ model: modelId })
      const prompt =
        `Write a short, specific title (3 to 6 words, Title Case, no quotes, no trailing punctuation) for this conversation:\n` +
        `User: ${(userMsg || '').slice(0, 500)}\n` +
        `Assistant: ${(assistantMsg || '').slice(0, 500)}\n` +
        `Title:`
      const res = await chat({
        serverConfig: fastify.config,
        request: { provider, model, messages: [{ role: 'user', content: prompt }], options: { stream: false, reasoning: { enabled: false }, max_tokens: 24, keepAlive: chatKeepAlive(fastify.config) }, userId },
      })
      await logInternalUsage('chat.title', modelId, res?.usage, userId)
      const t = (res?.message?.content || '').trim().split('\n')[0].replace(/^["'#\s]+|["'.\s]+$/g, '')
      return t ? t.slice(0, 60) : fallback
    } catch {
      return fallback
    }
  }

  // Shared generation: build context (system prompt + memory + summary + recent window), stream
  // the reply, persist the assistant message + metrics, name the chat, usage-log, and emit SSE.
  // Used by both "send a message" and "regenerate". Assumes the user's turn is already in the DB.
  async function streamReply(request, reply, convo, streamMode = true) {
    let modelId = resolveModel(fastify.config, request.user, convo.model)
    if (!modelId) return reply.code(400).send({ error: { code: 'no_model', message: 'No model configured (chat.defaultModel)' } })

    let providerName, modelName
    try {
      const ref = parseModelRef({ model: modelId })
      providerName = ref.provider
      modelName = ref.model
    } catch (e) {
      return reply.code(400).send({ error: { code: e.code || 'bad_model', message: e.message } })
    }

    const settings = resolveSettings(request.user, convo, fastify.config)
    // INCOGNITO (P-POL) — a create-time sticky off-the-record chat neither writes to nor reads from the
    // persistent cognitive stores. Force the memory MASTER switch off for this turn: that one flag
    // already gates recall, pinned-memory injection, the memory tools, and auto-capture — so incognito
    // rides the same seam (and, because it's a column set only at create, it can't be toggled back on).
    // The passive Conversation-Search provider is gated on the same switch, and the search index/scope
    // exclude incognito rows independently (defense in depth).
    if (convo.incognito) settings.useMemory = false
    const options = buildOptions(settings, fastify.config)

    // ---- Skill executor: run this turn "as" a bound Skill, if any ----
    // Binding sources, strongest first: the composer's /slash invocation (skillOnce — this
    // send only, settings untouched), then the conversation's settings.skill. A resolved
    // Skill overrides three things below: the system prompt (its expertise), the tool set
    // (constrained to its allowedComponents), and the model. The agent loop is otherwise
    // unchanged — that override is precisely what makes a Skill *runnable*, not just
    // resolvable. (Both paths are select_model-gated, like the settings they ride on.)
    // The resolve itself is the trace point: it emits skill.used with the caller attached.
    // Root levers gate each source independently: slashCommandsEnabled the /slash invocation,
    // skillBindingEnabled the ⚙ binding (OFF ignores it at turn time — the stored binding
    // survives, so flipping the lever back restores behavior without touching conversations).
    const slashOn = getSetting(fastify.config, 'chat.slashCommandsEnabled') !== false
    const bindingOn = getSetting(fastify.config, 'chat.skillBindingEnabled') !== false
    const skillOnceId = slashOn && typeof request.body?.skillOnce === 'string' && request.body.skillOnce.trim() && can(request.user, 'select_model')
      ? request.body.skillOnce.trim()
      : null
    const boundSkillId = skillOnceId || (bindingOn ? settings.skill : null)
    const activeSkill = boundSkillId
      ? resolveSkill(boundSkillId, { caller: { userId: ownerIdOf(request.user, 'this request') }, config: fastify.config })
      : null
    // Bundled files of an imported Agent Skill (references/assets) — advertised in the system
    // prompt and served on demand via the read_skill_file tool (progressive disclosure).
    const skillFiles = activeSkill?.skillFiles || []
    // A skill MAY pin a model, but '@chat' means "use whatever this conversation is running on" — the same
    // sentinel `chat.titleModel` already uses, so the vocabulary is consistent across the platform.
    //
    // WHY THIS MATTERS (Ote: "isnt it should use same model it running?"): a pinned model SILENTLY DOWNGRADES
    // the conversation. The Research skill pinned gemma4:26b, so asking for research on a qwen3.6:35b chat
    // quietly answered on the weaker model — and 26b is measurably weaker on this box (11/12 vs 12/12 on the
    // resolver corpus) and produced the lazy replies Ote complained about. A skill should pin a model only when
    // it needs a CAPABILITY the conversation's model lacks (vision, embeddings), never as a default.
    if (activeSkill?.model && activeSkill.model !== '@chat') {
      try {
        const sref = parseModelRef({ model: activeSkill.model })
        providerName = sref.provider
        modelName = sref.model
        modelId = activeSkill.model // reflect the model actually used in metrics/persistence
      } catch { /* skill's model unusable here — keep the conversation model */ }
    }
    // ---- Skill TRIGGER (model-invoked skills — the claude.ai pattern) ----
    // When NO skill is bound, the installed skills' name+description ride in the system
    // prompt (the description IS the trigger) and the model may activate one mid-turn via
    // use_skill: its instructions arrive as the tool result and frame the rest of the turn.
    // Deliberately LIGHTER than binding: no tool constraint, no model override — a triggered
    // skill adds expertise; a bound skill takes over the conversation, and still wins here.
    const skillTriggerOn = !activeSkill && getSetting(fastify.config, 'chat.skillTriggerEnabled') !== false
    const invocableSkills = skillTriggerOn ? listSkills(fastify.config).filter((s) => s.modelInvocable) : []
    let dynamicSkill = null // set when the model activates a skill this turn (persists as the reply's skill)

    // ---- capability gate (trust-tiered) ----
    // Strong negatives (probe-failed / declared-absent) strip options the model can't
    // honor; a mere name guess never gates, so unprobed models stay fully usable and
    // the provider-error path remains the backstop. Options are stripped for THIS send
    // only — the conversation's stored settings are untouched, so the user's preference
    // survives a switch back to a capable model. Best-effort: gate failure = no gate.
    let capGate = { caps: ['chat'], unsupported: [], chatCapable: true, known: false }
    try { capGate = await capsVerdictForModel(fastify, providerName, modelName) } catch { /* no gate */ }
    const gateStripped = []
    if (capGate.unsupported.includes('thinking') && settings.reasoning.enabled) {
      options.reasoning = { enabled: false } // drops effort too
      gateStripped.push('thinking')
    }
    const toolsDenied = capGate.unsupported.includes('tools')
    if (toolsDenied && settings.toolsEnabled) gateStripped.push('tools')

    // full history (for validation + context windowing)
    const history = await fastify.db.txn_messages.findAll({ where: { conversation_id: convo.id }, order: [['rolling_id', 'ASC']] })
    if (!history.some((m) => m.role === 'user')) {
      return reply.code(400).send({ error: { code: 'nothing_to_send', message: 'No user message to respond to' } })
    }

    const recentN = fastify.config?.chat?.context?.recentMessages ?? 12
    const summaryModelId = getSetting(fastify.config, 'chat.summaryModel') || modelId
    // Titles get their own model, falling back to the summary model then the conversation's.
    // '@chat' pins titling to the conversation's OWN model (modelId) — no model swap, so Ollama
    // doesn't load/unload a separate title model just to name the thread (Ote's ask).
    const titleSetting = getSetting(fastify.config, 'chat.titleModel')
    const titleModelId = titleSetting === '@chat' ? modelId : (titleSetting || summaryModelId)

    const startedAt = Date.now()
    // Track client disconnect (Stop button / closed tab) so we break the loop and
    // still persist the partial reply. Writes are guarded so a closed socket never
    // throws past the persistence step. In non-stream mode there is no SSE — we buffer
    // everything and send a single JSON response at the end.
    let clientGone = false
    let genError = null
    reply.raw.on('close', () => { clientGone = true })
    if (streamMode) reply.raw.writeHead(200, SSE_HEADERS)
    const write = streamMode
      ? (o) => {
          if (clientGone || reply.raw.writableEnded || reply.raw.destroyed) return
          try {
            reply.raw.write(sse(o))
            if (typeof reply.raw.flush === 'function') reply.raw.flush()
          } catch {
            clientGone = true
          }
        }
      : () => {}
    // Register this conversation as generating NOW — before the summary fold + vision relay
    // + the agent loop — so a steer sent while "Summarizing…" is on screen is accepted, not
    // 409'd. Paired with steerReg.end() in the persist finally (covers every exit path).
    steerReg.begin(convo.id)
    write({ type: 'status', phase: 'started', model: modelId })
    if (gateStripped.length) {
      write({ type: 'status', phase: 'capability_gate', stripped: gateStripped, model: modelId })
    }
    // A verified non-chat model (embeddings/reranker/…) fails FAST with a clear,
    // persisted reason — no provider round-trip, no opaque "400 status code (no body)".
    if (!capGate.chatCapable) {
      const cls = SPECIALIST_CAPS.find((c) => capGate.caps.includes(c))
      genError = {
        code: 'model_not_chat_capable',
        message: cls
          ? `"${modelId}" is a specialist model (${cls}) — it can't hold a conversation. Pick a chat-capable model.`
          : `"${modelId}" failed its chat capability check — pick another model, or re-verify this one in the Models console.`,
      }
      write({ type: 'error', code: genError.code, message: genError.message })
    }
    if (boundSkillId && !activeSkill) {
      write({ type: 'status', phase: 'skill_missing', skill: boundSkillId })
    } else if (activeSkill) {
      write({ type: 'status', phase: 'skill', skill: activeSkill.id, name: activeSkill.name, tools: activeSkill.allowedComponents, missing: activeSkill.missing, origin: activeSkill.origin, files: skillFiles.length })
    }

    // Model window (known for Ollama-kind via calibration) — drives BOTH the token-aware
    // fold threshold below and the overflow guard before the agent loop.
    const provCfg = effectiveProvidersFor(fastify.config, ownerIdOf(request.user, 'this request'))?.[providerName]
    const provKind = provCfg?.kind || providerName
    // guardWindow knows the global limit ∩ calibration but NOT a provider's own numCtxCap, so a
    // CPU-pinned provider reported 262144 while every request through it is capped at 8192. That is not
    // cosmetic: this value feeds the token-OVERFLOW guard, so a prompt at 93% of the real window looked
    // like 3% of an imaginary one and nothing would have warned before it silently truncated.
    let ctxWindow = provKind === 'ollama' ? guardWindow(fastify.config, provCfg?.host, modelName) : 0
    if (provKind === 'ollama' && Number.isInteger(provCfg?.numCtxCap) && provCfg.numCtxCap > 0) {
      ctxWindow = ctxWindow > 0 ? Math.min(ctxWindow, provCfg.numCtxCap) : provCfg.numCtxCap
    }
    // The conversation's own narrower window (⚙ → Context window). buildOptions passes the same value
    // to the adapter as a further cap, so the FOLD BUDGET and the OVERFLOW GUARD have to see it too —
    // otherwise the turn is sent at 32k while the guard judges it against root's 262k and never warns.
    if (ctxWindow > 0 && settings.numCtx != null) ctxWindow = Math.min(ctxWindow, settings.numCtx)
    // ~chars/4 + a flat per-image cost — same estimator the overflow guard uses
    const estTok = (msgs) => Math.round(msgs.reduce((n, m) => n + (m.content?.length || 0) + (Array.isArray(m.images) ? m.images.length * 2400 : 0), 0) / 4)
    const foldBudget = ctxWindow > 0 ? Math.floor(ctxWindow * 0.6) : 0

    // F4 + PREFIX STABILITY: keep long chats affordable via a rolling summary — and keep
    // the prompt prefix-stable for local models. Ollama-kind (window known): the verbatim
    // window = EVERYTHING since the last fold, so between folds turns are append-only and
    // the runner's KV prefix cache hits every turn (measured: a 54k-token turn drops from
    // ~17-31s of prefill to <1s). Fold only when the unsummarized span outgrows ~60% of
    // the model's effective window; the fold keeps the newest recentN verbatim and rewrites
    // the prefix ONCE — the legitimate change. Remote/unknown-window providers keep the
    // original sliding-window rules: more verbatim history there is real money per turn,
    // not just VRAM. Folding is a BLOCKING LLM call bounded by a timeout; on timeout/
    // failure everything rides inline this turn and the fold retries next. (Skipped when
    // the turn already errored.)
    const unsummarized = history.filter((m) => m.rolling_id > (convo.summarized_upto_id || 0))
    let verbatim // what rides this turn verbatim (set per path below)
    if (foldBudget > 0) {
      verbatim = unsummarized
      const foldable = unsummarized.length > recentN ? unsummarized.slice(0, unsummarized.length - recentN) : []
      if (!genError && foldable.length && estTok(unsummarized) > foldBudget) {
        const lastOlderId = foldable[foldable.length - 1].rolling_id // uuids aren't orderable
        write({ type: 'status', phase: 'summarizing' })
        try {
          const newSummary = await Promise.race([
            summarizeMessages(convo.summary, foldable, summaryModelId, ownerIdOf(request.user, 'this request')),
            new Promise((_, reject) => setTimeout(() => reject(new Error('summary timeout')), 25_000)),
          ])
          await convo.update({ summary: newSummary, summarized_upto_id: lastOlderId })
          convo.summary = newSummary
          verbatim = unsummarized.slice(unsummarized.length - recentN)
        } catch { /* slow/failed fold — send everything inline this turn, retry next time */ }
      }
    } else {
      const older = (!genError && history.length > recentN) ? history.slice(0, history.length - recentN) : []
      let olderUnsummarized = older.filter((m) => m.rolling_id > (convo.summarized_upto_id || 0))
      if (olderUnsummarized.length) {
        const backlogChars = olderUnsummarized.reduce((n, m) => n + (m.content?.length || 0), 0)
        if (olderUnsummarized.length >= recentN || backlogChars >= 8000) {
          const lastOlderId = olderUnsummarized[olderUnsummarized.length - 1].rolling_id // uuids aren't orderable
          write({ type: 'status', phase: 'summarizing' })
          try {
            const newSummary = await Promise.race([
              summarizeMessages(convo.summary, olderUnsummarized, summaryModelId, ownerIdOf(request.user, 'this request')),
              new Promise((_, reject) => setTimeout(() => reject(new Error('summary timeout')), 25_000)),
            ])
            await convo.update({ summary: newSummary, summarized_upto_id: lastOlderId })
            convo.summary = newSummary
            olderUnsummarized = [] // now covered by the summary
          } catch { /* slow/failed fold — send these inline this turn, fold again next time */ }
        }
      }
      verbatim = [...olderUnsummarized, ...history.slice(Math.max(0, history.length - recentN))]
    }

    // ---- F-SYS: system context — GATHER the inputs, then the pure Context Composer builds the
    // messages (components/context-composer.js). toolsDenied: the capability gate verified this model
    // can't call tools — don't offer them.
    const toolsOn = settings.toolsEnabled && getSetting(fastify.config, 'chat.toolsEnabled') !== false && !toolsDenied
    // The user's timezone (auto-synced from the browser into prefs). Stable per user (prefix-cache
    // safe: only changes if they move); the CURRENT time never rides the system prompt —
    // get_current_time answers live, in this zone, via ctx.caller.timezone.
    const userTz = await userTimezone(request)
    // Internal turns (scheduled runs, digests) never see ask_user — they carry the x-ote-internal
    // secret; the flag also gates the toolset below.
    const interactiveTurn = !request.headers?.['x-ote-internal']

    // Gather the schedule pointer: if a schedule delivers its runs into THIS conversation, the composer
    // tells the model WHICH one (by id) so "snooze / again / move / cancel" edits that SAME schedule
    // instead of spawning a duplicate (the failure Ote hit). Best-effort — never blocks the turn.
    let schedulePointer = null
    if (toolsOn) {
      try {
        const jobs = await fastify.db.mst_trigger_jobs.findAll({ where: ownedBy(request.user, 'schedules') })
        const mine = jobs.filter((j) => (j.action?.type ?? 'skill-turn') === 'skill-turn' && j.action?.conversationId === convo.id)
        if (mine.length) {
          const pick = mine.sort((a, b) => new Date(b.last_run_at || b.created_at) - new Date(a.last_run_at || a.created_at))[0]
          schedulePointer = { id: pick.id, name: pick.name, triggerType: pick.trigger?.type, recurs: pick.trigger?.type === 'cron' || pick.trigger?.type === 'interval' }
        }
      } catch { /* the pointer is best-effort — never block the turn */ }
    }

    // Gather user-curated always-on pinned memories (the Memory modal).
    let pinnedMemories = []
    if (settings.useMemory) {
      const pinned = await fastify.db.txn_user_memories.findAll({
        where: { ...ownedBy(request.user, 'pinned notes'), is_enabled: true }, order: [['rolling_id', 'ASC']],
      })
      pinnedMemories = pinned.map((m) => m.content)
    }

    // Gather L3 Persona Notes (Reflection, step 5 R1) — the persona's own operational notes, via the
    // Reflection Host Adapter (buildReflection, like buildMemoryV2). Gated by the memory master switch
    // (so incognito/memory-off shows none) + memory.personaNotesEnabled. Best-effort — never blocks.
    // ⚠ GATHERED BELOW, not here: ranking notes needs `lastUserText`, which is computed with the recall
    // block. Kept as a declaration so the ordering is deliberate rather than accidental.
    let personaNotes = []   // [{ id, content, relevance }] — objects, because the id is what gets reinforced

    // ---- Context Composer C2: gather ADAPTIVE candidates, budget them, then compose ----
    // All adaptive inputs are gathered up front so the budget sees them together. Ranked recall (L4
    // "Retrieved Memories") is gathered HERE (ahead of the history loop) — it only needs the last user
    // message. Best-effort + time-boxed: memory never delays or breaks a reply.
    const lastUserMsg = [...history].reverse().find((m) => m.role === 'user') || null // provenance anchor
    const lastUserText = String(lastUserMsg?.content || '').trim()
    // Recall returns mixed kinds; keep the `kind` so CARDS (consolidated Knowledge Cards) can be scored
    // as their own section (weight 0.8, above raw recall 0.6) — realizing the point of Phase-3
    // consolidation. Everything else is section 'recall'.
    let recallCards = []      // [content] — recalled kind='card'
    let recallMemories = []   // [content] — recalled non-card (episodic/semantic/identity)
    if (settings.useMemory && lastUserText) {
      try {
        const memR = buildMemoryV2(fastify, { userId: ownerIdOf(request.user, 'memory') })
        const recall = await Promise.race([
          memR.recall({ query: lastUserText, limit: 6 }),
          new Promise((res) => setTimeout(() => res(null), 4000)),
        ])
        const hits = recall?.memories || []
        recallCards = hits.filter((m) => m.kind === 'card').map((m) => m.content)
        recallMemories = hits.filter((m) => m.kind !== 'card').map((m) => m.content)
      } catch { /* memory is best-effort — never block the turn */ }
    }
    // L3 PERSONA NOTES — selected TURN-INDEPENDENTLY (this line used to say "ranked for this turn"; that
    // ranking was removed on 2026-08-08 and the stale comment survived it by one commit — see below).
    // Gated by the memory master switch (so incognito/memory-off shows none) + memory.personaNotesEnabled.
    // Best-effort: a note that cannot be fetched must never cost a reply.
    try {
      if (settings.useMemory && getSetting(fastify.config, 'memory.personaNotesEnabled') !== false) {
        const notesMax = getSetting(fastify.config, 'memory.personaNotesMax') || 5
        // ⚠ NO `query` — selection is DELIBERATELY independent of the turn (2026-08-08). Notes sit in the
        // cached prefix; ranking them per turn changed their ORDER, and a different order is different
        // bytes, which re-prefilled the whole prompt every turn. Measured at 22.5×. See selectActiveNotes.
        personaNotes = await buildReflection(fastify, { userId: ownerIdOf(request.user, 'reflection notes') })
          .listActiveNotes({ limit: notesMax })
      }
    } catch { /* L3 notes are best-effort — never block the turn */ }
    // PASSIVE Conversation-Search provider (CS3): a FEW hybrid-matched excerpts from the user's OTHER
    // past conversations, offered to the Composer as scored EVIDENCE candidates (section 'conversation').
    // Conservative (memory.conversationContextMax, small) + best-effort + time-boxed. Gated on the memory
    // master switch (so incognito, which forced it off above, disables this too) plus its own setting; the
    // search scope also excludes incognito rows independently. This is EVIDENCE to verify — kept separate
    // from Memory's synthesized knowledge; it rides the same scored-candidate seam with ZERO Composer change.
    let conversationEvidence = [] // [renderedCitationLine], best-first
    try {
      const convCtxOn = getSetting(fastify.config, 'memory.conversationContextEnabled') !== false
      // SUBSTANCE GATE — a query too thin to carry a topic must not retrieve past conversations.
      //
      // The failure this prevents (chat 66d05f01): Ote typed the single word "research" and got back "I see from
      // our earlier conversations that we've been working on a comprehensive biography of Michael Jackson" — an
      // unrelated thread from days earlier, asserted as the CURRENT task. The turn used no tools, so that came
      // straight from this passive injection.
      //
      // The `denseMinSim: 0.6` floor below cannot help here: the embedding of one generic word sits near almost
      // everything, so the floor passes and the "nearest" conversation wins by default. The problem is not a weak
      // threshold, it is that "research" / "continue?" / "go on" express no topic AT ALL. Retrieval needs
      // something to be relevant TO, and the prompt's "ignore any that don't fit" cannot save a model whose only
      // other input is one ambiguous word — everything fits.
      //
      // Deliberately a QUERY-side gate, not a stronger score: raising the floor would also drop good evidence on
      // real questions. (Same substance idea as the >= 12 char gate on auto-capture below.)
      // LENGTH WAS THE WRONG MEASURE (2026-08-03, chat 2d126c69). "how good is it?" is 16 chars and
      // 4 words, so it cleared this bar by ONE character — and because the sentence names nothing, the
      // dense arm returned its nearest neighbours (a Michael Jackson biography from three weeks
      // earlier) and the model answered about that instead of the photo it had just described.
      // hasRetrievableTopic asks the question the length check was approximating: does this query name
      // anything, or is its subject a pronoun pointing at the turn we are already in?
      const words = lastUserText.trim().split(/\s+/).filter(Boolean)
      const enoughToRetrieveOn = lastUserText.trim().length >= 15 && words.length >= 3
        && hasRetrievableTopic(lastUserText)
      if (settings.useMemory && lastUserText && convCtxOn && enoughToRetrieveOn) {
        const maxEv = getSetting(fastify.config, 'memory.conversationContextMax') || 2
        const cs = buildConversationSearch(fastify, {
          userId: ownerIdOf(request.user, 'this request'),
          currentConversationId: convo.id,
          embed: makeEmbedder(fastify, { userId: ownerIdOf(request.user, 'an embedding') }),
        })
        const res = await Promise.race([
          cs.search(lastUserText, { limit: maxEv, minLength: 40, denseMinSim: 0.6 }), // higher floor than the tool — passive injection wants confident matches only
          new Promise((r) => setTimeout(() => r(null), 3500)),
        ])
        conversationEvidence = (res?.evidence || []).map(evidenceLine)
        // NAME WHAT WAS INJECTED. Composer telemetry records that a `conversation` item was kept and
        // how many tokens it cost, but never WHICH conversation — so when a turn answered out of a
        // three-week-old chat there was nothing to read, and finding it took a reproduction. Titles
        // and dates only: enough to recognise a wrong intrusion, without copying the user's prose
        // into the server log.
        if (conversationEvidence.length) {
          request.log?.info?.({
            query: lastUserText.slice(0, 80),
            mode: res?.mode,
            evidence: (res?.evidence || []).map((e) => `${e.conversationTitle ?? e.conversation_title ?? '?'} · ${String(e.createdAt ?? e.created_at ?? '').slice(0, 10)}`),
          }, '[conversation-evidence] injected into the prompt')
        }
      }
    } catch { /* passive evidence is best-effort — never block the turn */ }
    // WORKING MEMORY (L4 active session state, step 6 WM1) — the live focus of THIS conversation, stored
    // on the row and maintained by the model (WM2 tool) + a LIGHT auto-seed of the current goal from the
    // latest user message when the model hasn't set a focus yet. Conversation-local + ephemeral, so it is
    // NOT gated on the memory master switch — only on memory.workingMemoryEnabled (like the Todo rail).
    let workingMemoryBlock = null
    let wmEnabled = false
    try {
      wmEnabled = getSetting(fastify.config, 'memory.workingMemoryEnabled') !== false
      if (wmEnabled) {
        const wm = normalizeWorkingMemory(convo.working_memory)
        workingMemoryBlock = renderWorkingMemory(wm, { seedFocus: extractIntent(lastUserText) })
      }
    } catch { /* working memory is best-effort — never block the turn */ }
    // Hard inputs shared by both composeSystemContext calls (the system message is HARD — never trimmed
    // — and independent of pinned/summary, so we can compose it once for the budget estimate and again
    // with only the kept adaptive items).
    // PROFILE: the name we address the user by comes from the Profile Service (the reconciled "who
    // they are now"), NOT raw request.user — so root resolves to its config display name, and the
    // Composer never has to reconcile identity itself. resolveProfile is the full projection:
    // account/config ▸ REMEMBERED IDENTITY (captured from "I'm Claude") ▸ username. The set_display_name
    // tool writes the account name; the identity pipeline writes the remembered slot. (Memory V3 Phase 1.)
    const preferredName = (await resolveProfile(fastify, request.user)).preferredName
    // Is search_web actually on offer this turn? The grounding rule + hint must never name a tool the
    // model doesn't have — so this mirrors the toolDefs selection below rather than assuming search is
    // installed (it's a Portable Component, and its service needs a provider key).
    const searchOffered = toolsOn
      && ((activeSkill ? activeSkill.tools : toolDefinitions()) || []).some((d) => d?.function?.name === 'search_web')
    // ══ ⭐⭐⭐ C2 · WORKING MEMORY IS TURN-SCOPED, AND IT IS THE ONE THING REASONING READS ═════════════
    //
    // Ote: *"tools → evidence → cognition → working memory → Sotera → answer. The tool result should no
    // longer compete with the cognition block as a second source of truth."*
    //
    // ⚠️ Declared HERE, before `sysInputs`, because two distant places need the same instance: the cognition
    // arm seeds it with what it reconciled, and the tool loop several hundred lines below admits each result
    // into it as EVIDENCE. ⛔ It is a local, so it dies with the request — there is no registry and nothing
    // can look it up afterwards, which is what keeps "ephemeral" true rather than intended.
    // ⛔ null when cognition is off: C2 must not invent a working set out of nothing.
    //
    // ⚠️⚠️ NAMED `cognitiveHold`, NOT `workingMemory`, AND THE COLLISION IS REAL. This file already has an
    // L4 feature called Working Memory (`workingMemoryBlock`, `renderWorkingMemory`, `memory.working
    // MemoryEnabled`): a per-conversation `{focus, plan, openQuestions, activeItems}` scratchpad PERSISTED on
    // `txn_conversations.working_memory`, which SHE maintains via the `update_working_memory` tool.
    // ⇒ MEASURED 2026-08-23: `working_memory` is NULL on **177 of 177 conversations**. It is offered, it is
    // in the prompt, and she has never once used it.
    // ⭐⭐ Which is itself an argument for this layer: L4 asks HER to orchestrate her own working set, and
    // that is the exact pattern this whole arc has been dismantling. 0-for-177 is the measurement.
    // ⛔ L4's fate is Ote's call and is untouched here. Two different things must simply not share a name:
    //   L4            model-authored · PERSISTED · capacity-capped (MAX_ITEMS 12 / MAX_Q 8) · unused
    //   cognitiveHold layer-authored · EPHEMERAL · no cap · per operation
    // ⚠️ Note L4 would violate two of Ote's hard C2 constraints anyway — it persists, and it has capacity
    // numbers — so "just use the existing one" was never free.
    let cognitiveHold = null
    // ⭐ P5 · the subject the standing view speaks about, taken from the cue the PERSON typed. ⚠️ Never a
    // manufactured fragment — `about0`'s measured failure was *"talking about remember"* — so a derived-only
    // cue set leaves this null and the view simply says "Where I stand, having looked:".
    let holdSubject = null
    // ⭐⭐⭐ THE EXTENT CLAUSES, CARRIED FOR THE WHOLE TURN so they can ride BESIDE a tool result and not
    // only inside the block. ⚠️ A room-scoped memory read tells her the material is out of reach; a count of
    // conversations she has actually had is a population that read never looked at. ⛔ The route RELAYS these
    // strings and never builds one — the cognition layer renders them, in the conversation's language.
    let holdContinuity = []
    // ⛔ AND THE LAST STANDING VIEW ATTACHED THIS TURN, so an unchanged one is not said twice. Measured
    // live: round 2 rendered BYTE-IDENTICALLY to round 1 because that round's calls were not looks into her
    // memory, so nothing entered the hold. ⓘ This is not a delta format — the whole view is still rendered
    // whenever it changes; it simply is not repeated verbatim.
    let lastStanding = null
    // ⛔ DEFAULT OFF, read at boot like every other arm: an untested treatment must not become the baseline
    // by being convenient, and the controlled comparison flips a setting rather than a deploy.
    const reentrantCognition = getSetting(fastify.config, 'memory.cognitionReentrant') === true

    // ⭐⭐ OTHER INTELLIGENCES SHE MAY REACH — computed ONCE, in one place, and used twice: the system
    // prompt needs the rich form (who they are, what she may discuss with them) and the tool assembly
    // needs only the names for its enum. ⛔ Two derivations of the same list is the drift this repo has
    // recorded thirteen times; this one is derived, not repeated.
    // ⛔ It is OUR record. Nothing is enumerated from the counterpart's side — a Hermes session listing
    // is scoped by nothing and leaks a preview of every private conversation.
    const adviceDestinationList = Object.entries(fastify.config?.advice?.destinations || {})
      .filter(([, d]) => d?.enabled !== false)
      .map(([name, d]) => ({
        name,
        display: d.display || name,
        capability: d.capability || null,
        sessions: (d.sessions || []).map((s) => ({ grantedFor: s.grantedFor || null })),
      }))
    const adviceDestinations = adviceDestinationList.map((d) => d.name)

    const sysInputs = {
      systemPrompt: fastify.config?.chat?.systemPrompt || null,
      // ⚠ `??` NOT `||` — '' is the explicit "no identity line" switch and must reach the composer as ''.
      // `||` would fold it back to the default, which is the exact silent-override this setting exists to end.
      assistantIdentity: fastify.config?.chat?.assistantIdentity ?? null,
      customInstructions: settings.customInstructions,
      user: { username: request.user?.username, email: request.user?.email, displayName: preferredName },
      timezone: userTz,
      toolsOn,
      showTodoRule: toolsOn && userMayTodo(fastify.config, request.user),
      showWorkingMemoryRule: toolsOn && wmEnabled,
      showAskUserRule: toolsOn && interactiveTurn,
      showProfileRule: toolsOn && interactiveTurn,
      showSearchRule: searchOffered,
      skill: activeSkill?.prompt ? { name: activeSkill.name, prompt: activeSkill.prompt } : null,
      skillFiles,
      invocableSkills,
      adviceDestinations: adviceDestinationList,
      schedulePointer,
      useMemory: settings.useMemory,
      // P1/P2 treatment — registered setting, default false. Read here (not captured at boot) so the
      // experiment can flip arms without a restart, exactly as memory.identityModel follows extractModel.
      layerAuthority: getSetting(fastify.config, 'memory.layerAuthority') === true,
      // Awareness: a stated fact that her retrieval is scoped. Read per turn (not captured at boot) so
      // the experiment can flip arms without a restart.
      scopeAwareness: getSetting(fastify.config, 'memory.scopeAwareness') === true,
      // Self-model: what she IS. Read per turn for the same reason — the falsifier run flips this arm
      // without a restart, and nobody mutates the live system between arms.
      selfModel: getSetting(fastify.config, 'memory.selfModel') === true,
      // ⭐ SELFHOOD sits beside the self-model at L1 — the permission not to perform a sterile assistant.
      selfhood: getSetting(fastify.config, 'memory.selfhood') === true,
      // ⭐ What an absence may mean — sits beside SELFHOOD at L1, changes no boundary.
      ownHistory: getSetting(fastify.config, 'memory.ownHistory') === true,
      // ⭐ HER OWN RELATIONAL MEMORY, self-subject only. The person is whoever is logged in — there is no
      // name lookup and no way for the caller to point this at somebody else, so it carries no
      // third-party disclosure. Fails soft: a missing person row or an empty table just means no block.
      relationalStance: getSetting(fastify.config, 'memory.relationalStance') === true
        ? await (async () => {
          try {
            const [me] = await fastify.db.txn_memories.sequelize.query(
              'SELECT person_id::text AS pid FROM persona_sotera.mst_users WHERE id = :uid',
              { replacements: { uid: request.user.id }, type: fastify.db.txn_memories.sequelize.QueryTypes.SELECT },
            )
            if (!me?.pid) return null
            const stance = await readOwnStance({ db: fastify.db, personId: me.pid })
            return renderOwnStance(stance, { subjectName: request.user.displayName || request.user.username })
          } catch (e) {
            fastify.log?.debug?.({ err: e?.message }, '[relational] stance read failed (non-fatal)')
            return null
          }
        })()
        : null,
      // ⭐ D-13 · THE CONCRETE SCOPE OF THIS TURN. Fails soft: no scope, no block — an unexplained
      // boundary is a smaller failure than a dead turn.
      // ── ⭐⭐⭐ THE MEMORY COGNITION LAYER ──────────────────────────────────────────────
      //
      // ⭐ ALWAYS-ON, and that is Ote's decision: *"For every normal conversational turn, the Memory
      // Cognition Layer is allowed to activate her memory automatically. I don't want a rule like
      // 'Remember to search your history when relevant.' That makes memory another task she has to
      // remember to perform."*
      //
      // ⛔ IT IS NOT ANOTHER RETRIEVAL INPUT. Every other block on this list is raw material; this one
      // arrives already fused, already access-resolved and already epistemically typed, because the
      // measured failure was that SHE was doing the assembling: four phrasings of one ordinary question
      // produced 4/5/6/8 tool calls, two incompatible beliefs about her own access, and three untested
      // access claims — while the door was open every time.
      //
      // ⚠️ FAILS SOFT, like every block here. No cognition, no block — a dead turn is a worse failure
      // than a quiet one, and the layer withholds ITSELF if its own guards trip (an illegal promotion or a
      // vocabulary leak in what it wrote).
      cognition: fastify.config?.memory?.cognitionEnabled === true && lastUserText
        ? await (async () => {
          try {
            const cog = buildMemoryCognition(fastify, {
              userId: request.user.id,
              isRoot: request.user.isRoot === true,
              username: request.user.username,
              conversationId: convo.id,
              interactive: true,
              // ⭐ 028 · the standing cross-room grant, read through `can()` like every other capability.
              // ⚠️ Without it this layer decided every cross-room episode as though the grant did not
              // exist — `buildDisclosure` defaults `crossRoom` to false, so the omission was silent.
              crossRoom: can(request.user, 'sotera_cross_room_conversations'),
              // ⭐ THE DATES-ONLY PROBE. ⛔ Off by default; it changes the DATE and nothing else.
              localDates: getSetting(fastify.config, 'memory.cognitionLocalDates') === true,
            })
            const out = await cog.recollect({ text: lastUserText })
            // ── ⭐⭐⭐ THE UTTERANCE BOUNDARY ─────────────────────────────────────────────────────────
            //
            // Cognition has just retrieved her whole memory, unfractured, without asking anyone's
            // permission — because she owns it. THIS is where we ask the other question: may THIS ACCOUNT
            // be told any of it?
            //
            // ⛔⛔ A HARD BOUNDARY. Protected content is removed BEFORE the block is rendered, so it never
            // enters the prompt and cannot leak through a slip. ⛔ The alternative — hand her the content
            // plus a sentence asking her not to repeat it — is a request, not a boundary.
            //
            // ⭐⭐ AND IT IS NOT AN ABSENCE. Ote: *"The response must never convert lack of authorization
            // into lack of knowledge."* ⇒ when anything is withheld, a fixed sentence goes in saying that
            // something exists and is not hers to share here. She can decline; she cannot claim not to know.
            const boundary = applyUtteranceBoundary({
              items: out.items ?? [],
              user: request.user,
              currentAccountId: request.user?.id ?? null,
            })
            if (out.activated && boundary.withheld.length) {
              const rebuilt = cog.renderFor(boundary.sayable, {
                cues: out.cues, dropped: out.dropped ?? 0, searched: out.searched, note: boundary.statement,
              })
              // ⚠️ THE BACKSTOP, NOT THE MECHANISM. The mechanism is the removal above; this catches a
              // renderer or a future edit putting a fragment back. A hit costs the whole block rather than
              // shipping a leak.
              const leaked = findWithheldLeak(rebuilt.text, boundary.withheld, { sayable: boundary.sayable })
              if (leaked.length) {
                fastify.log?.warn?.({ ids: leaked.map((l) => l.id) },
                  '[utterance] ⛔ a withheld fragment survived into the rendered block — withholding the block')
                out.activated = false
                out.context = null
              } else {
                out.context = rebuilt.text
                out.frame = rebuilt.frame
              }
            }
            // ── ⭐⭐⭐ C2 · SEED WORKING MEMORY WITH WHAT COGNITION RECONCILED ────────────────────────
            //
            // ⭐ It is seeded from `boundary.sayable`, NOT from `out.items` — because what she may SAY to this
            // account is what may appear in the model-facing context, and working memory is a model-facing
            // structure. ⛔ This is NOT authorization entering cognition: cognition already ran unfractured
            // and retrieved everything she owns. The filtering happened at the utterance boundary, above.
            // ⓘ Ote's line: authorization controls what she may say to an account, never what she may
            // retrieve, think about, rank, fuse or remember.
            if (out.activated) {
              cognitiveHold = createWorkingMemory({ label: String(lastUserText ?? '').slice(0, 120) })
              cognitiveHold.recall(boundary.sayable ?? [])
              // ⭐ P5 · a TYPED cue only. `derivedTopics` are fragments this layer manufactured by splitting,
              // and naming one as the subject of a sentence is the measured `about0` defect.
              const typed = (out.cues?.persons ?? [])
              const derived = new Set(out.cues?.derivedTopics ?? [])
              holdSubject = typed.length
                ? typed.join(' and ')
                : (out.cues?.topics ?? []).find((t) => !derived.has(t)) ?? null
              // ── ⛔⛔ THE SECOND DOOR, AND IT WOULD HAVE BYPASSED THE BOUNDARY COMPLETELY ────────────
              //
              // `out.continuityLines` is rendered from the UNFILTERED set, because cognition runs
              // unfractured. Relaying it here unconditionally would put *"X and I have talked in N
              // conversations"* beside every tool result **for an account the boundary had just withheld it
              // from** — the block would be clean and the payload would leak. ⚠️ Two doors, one fact: the
              // first was the missing `owner` stamp, this is the second.
              //
              // ⭐ Gated on the SAME set the hold is seeded from, so there is one source of truth and no
              // second copy of the rule. ⓘ `some` is exact rather than approximate: every continuity item
              // carries `owner: sotera` and no provenance account, so the boundary's verdict is identical
              // for all of them — they survive together or not at all.
              const extentIsSayable = (boundary.sayable ?? []).some((i) => i?.kind === 'continuity')
              holdContinuity = extentIsSayable && Array.isArray(out.continuityLines) ? out.continuityLines : []
            }
            // ⓘ OBSERVABILITY FOR THE FIRST LIVE RUNS. Off by default; when on, the exact injected block
            // and the stage-by-stage counts are appended to a file, so a failure can be attributed to
            // discovery / activation / access / fusion / typing / injection rather than guessed at.
            if (fastify.config?.memory?.cognitionDebug === true) {
              try {
                const { appendFileSync } = await import('node:fs')
                appendFileSync(new URL('../../../../cognition-debug.log', import.meta.url), `${JSON.stringify({
                  at: new Date().toISOString(), conversationId: convo.id, asked: lastUserText,
                  activated: out.activated, cues: out.cues, plan: out.plan,
                  counts: {
                    items: out.items?.length ?? 0,
                    episodes: out.items?.filter((i) => i.kind === 'episode').length ?? 0,
                    withThem: out.items?.filter((i) => i.withThem).length ?? 0,
                    filtered: out.filtered ?? 0, dropped: out.dropped ?? 0,
                  },
                  utterance: { entitled: boundary.entitled, withheld: boundary.withheld.length, sayable: boundary.sayable.length },
                  withheldBecause: out.leaks ? `leaks:${out.leaks.map((l) => l.word).join(',')}`
                    : (out.illegal ? 'illegal-promotion' : null),
                  items: (out.items ?? []).map((i) => ({
                    kind: i.kind ?? 'item', who: i.who, withThem: i.withThem ?? null,
                    availability: i.availability, basis: i.basis, retention: i.retention,
                    warrants: i.warrants ?? [], here: i.here, partial: i.partial ?? null,
                    exchanges: (i.exchanges ?? []).length,
                  })),
                  context: out.context,
                  // ⭐ C2 · what she is HOLDING, and the snapshot states `retained: 0` beside the counts so
                  // anyone reading a debug line sees the rule with the data.
                  cognitiveHold: cognitiveHold ? cognitiveHold.snapshot() : null,
                })}
`)
              } catch { /* observability must never break a turn */ }
            }
            return out.activated ? out.context : null
          } catch (e) {
            fastify.log?.debug?.({ err: e?.message }, '[cognition] recollect failed (non-fatal)')
            return null
          }
        })()
        : null,
      scopeFacts: getSetting(fastify.config, 'memory.scopeFacts') === true
        ? await (async () => {
          try {
            // ⭐ 2026-08-23 · facts by default; `scopeFactsDirectives` restores the measured legacy block.
            return renderScope(
              await describeScope(fastify, { userId: request.user.id, isRoot: request.user.isRoot === true }),
              { directives: getSetting(fastify.config, 'memory.scopeFactsDirectives') === true },
            )
          } catch (e) {
            fastify.log?.debug?.({ err: e?.message }, '[scope] scope-facts read failed (non-fatal)')
            return null
          }
        })()
        : null,
      // ⭐ ARM B · her OPEN INTENTION, injected automatically instead of waiting for recall_intention.
      // Read per turn like the arms above, so the experiment flips a setting rather than restarting her.
      // Fails soft: no person row, no open row, or a failed read all just mean no block — an intention
      // she cannot see is a smaller failure than a turn that dies over one.
      openIntention: getSetting(fastify.config, 'memory.intentionInjection') === true
        ? await (async () => {
          try {
            // ⭐ ROOM-GRAINED (D-2). No person lookup at all now: the room IS the read key, so injecting
            // by person would be the very leak migration 013 closed.
            const row = await readOpenIntention({ db: fastify.db, userId: request.user.id })
            return renderOpenIntention(row, { subjectName: request.user.displayName || request.user.username })
          } catch (e) {
            fastify.log?.debug?.({ err: e?.message }, '[intention] open-intention read failed (non-fatal)')
            return null
          }
        })()
        : null,
    }
    // ⓘ OBSERVABILITY · WHAT `scope-facts` ACTUALLY PUT IN THE PROMPT THIS TURN. Added 2026-08-23 with the
    // facts/expression split. ⚠️ The reason it exists is the reason the split exists: the cognition debug
    // recorded the cognition block and nothing recorded THIS one, so 45% of the machinery vocabulary in her
    // answers sat in her system prompt for days, attributed to the model. A block that reaches her every
    // turn and is written down nowhere is a block nobody can measure.
    if (fastify.config?.memory?.cognitionDebug === true && sysInputs.scopeFacts) {
      try {
        const { appendFileSync } = await import('node:fs')
        appendFileSync(new URL('../../../../cognition-debug.log', import.meta.url), `${JSON.stringify({
          at: new Date().toISOString(), conversationId: convo.id, kind: 'scope-facts',
          directives: getSetting(fastify.config, 'memory.scopeFactsDirectives') === true,
          isRoot: request.user.isRoot === true,
          block: sysInputs.scopeFacts,
        })}
`)
      } catch { /* observability must never break a turn */ }
    }
    const tailZone = userTz || 'UTC'
    let nowString
    try {
      nowString = new Intl.DateTimeFormat('en-CA', { timeZone: tailZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
    } catch { nowString = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC' }

    // HARD context (never trimmed): the system message + the runtime-tail hard lines (datetime + hint).
    const hardSystem = composeSystemContext({ ...sysInputs, pinnedMemories: [], personaNotes: [], summary: null }).system
    const hardTailMsgs = composeRuntimeTail({ toolsOn, useMemory: settings.useMemory, nowString, zone: tailZone, lastUserText, searchOn: searchOffered, recallMemories: [] })

    // ADAPTIVE candidates — providers contribute; the Composer scores (weight × relevance) + trims.
    const adaptiveItems = [
      ...pinnedMemories.map((c) => ({ provider: 'memory', kind: 'pinned', section: 'pinned', placement: 'pre', content: c })),
      // Notes used to arrive with NO relevance, so the Composer could not prefer the one that matched the
      // question. They are ranked for this turn now (see reflection-host.selectActiveNotes) and the least
      // relevant is the first thing trimmed.
      //
      // ⚠ RANK-DERIVED, NOT THE RAW SCORE — see rankRelevance for the trap. Passing the honest hybrid
      // similarity (0.2–0.5) demotes notes against pinned/summary/working, which pass nothing and therefore
      // default to 1.0. Rank keeps the TOP note at parity with an unscored item and degrades only the tail,
      // which is the part actually worth expressing, and matches card/recall/conversation.
      ...personaNotes.map((n, idx) => ({
        provider: 'reflection', kind: 'note', section: 'note', placement: 'pre',
        content: n.content, relevance: rankRelevance(idx),
      })),
      ...(convo.summary ? [{ provider: 'memory', kind: 'summary', section: 'summary', placement: 'pre', content: convo.summary }] : []),
      // Recalled Knowledge Cards score in the 'card' section (0.8) so consolidated knowledge outranks
      // raw recall (0.6) under budget pressure — the payoff of Phase-3 consolidation.
      ...recallCards.map((c, idx) => ({ provider: 'memory', kind: 'card', section: 'card', content: c, relevance: Math.max(0.5, 1 - idx * 0.1) })),
      ...recallMemories.map((c, idx) => ({ provider: 'memory', kind: 'recall', section: 'recall', content: c, relevance: Math.max(0.4, 1 - idx * 0.1) })),
      // Conversation-Search evidence — relevance by RANK (best-first); section weight 0.5 keeps it below
      // recall so it competes fairly but never crowds out synthesized knowledge in a tight budget.
      ...conversationEvidence.map((c, idx) => ({ provider: 'conversation', kind: 'evidence', section: 'conversation', placement: 'post', content: c, relevance: Math.max(0.3, 0.8 - idx * 0.15) })),
      // Working memory (L4 active session state) — one block, high relevance (the live focus), weight 0.7.
      ...(workingMemoryBlock ? [{ provider: 'working', kind: 'working', section: 'working', placement: 'post', content: workingMemoryBlock }] : []),
    ]
      // P0 — stamp { authority, scope } on every candidate, in ONE place rather than seven.
      //
      // ⚠️ Doing it here, not per-section above, is deliberate: classifySection THROWS on a section it
      // does not know, so the next person who adds a provider gets a loud failure instead of an item
      // that quietly governs nothing. Per-section stamping would have let them forget one.
      //
      // Purely additive — composeAdaptiveContext spreads the item, and the renderers still read only
      // `.content`, so the composed prompt is byte-identical. That equality is asserted in
      // test/unit/context-authority.test.mjs and is the whole safety argument for P0.
      .map((it) => ({ ...it, ...classifySection(it.section) }))
    // adaptiveBudget = model window − reply headroom − hard − history. null = no trim (non-ollama
    // providers manage their own context, or the window is unknown). In normal turns this is generous,
    // so nothing trims and the prompt is identical to C1; trimming only engages near overflow.
    let adaptiveBudget = null
    if (ctxWindow > 0) {
      const reserve = Math.max(1024, Math.round(ctxWindow * 0.2))
      const estHard = estTok([{ content: hardSystem }, ...hardTailMsgs])
      const estHistory = estTok(verbatim)
      adaptiveBudget = Math.max(0, ctxWindow - reserve - estHard - estHistory)
    }
    const sel = composeAdaptiveContext(adaptiveItems, { budgetTokens: adaptiveBudget })
    // ⚠️ keptOf USED TO BE THE END OF THE LINE FOR EVERY FIELD BUT `content` — it mapped straight to
    // strings, so anything the Composer learned about an item died here, one step before rendering.
    // That is the same shape as the two allowlists that silently dropped fields during the memory arc
    // (commitToMemory, the identity args) and the SDK's validateManifest, which drops unknown manifest
    // keys. Splitting it keeps the string path byte-identical for today's renderers while giving P1 a
    // way to reach the classification it needs for attribution.
    const keptItemsOf = (section) => sel.kept.filter((k) => k.section === section).sort((a, b) => a._i - b._i)
    const keptOf = (section) => keptItemsOf(section).map((k) => k.content)
    const keptPinned = keptOf('pinned')
    const keptNotes = keptOf('note') // L3 Persona Notes that fit the budget
    // ⚠ USE IS RECORDED HERE, AFTER THE TRIM — the only place that knows what a model actually saw.
    // Reinforcing at FETCH time (what recall() does, correctly, for facts) would count turns instead of
    // uses: notes are fetched every turn, so access_count would climb at a constant rate and look like a
    // signal while measuring nothing. Measured 2026-08-06, notes were 0/17 ever recalled — this is the
    // first mechanism that can ever move that number, and it must mean "was placed in a prompt" or the
    // decay pass will one day archive notes on a number nobody can interpret.
    if (keptNotes.length && personaNotes.length) {
      const keptSet = new Set(keptNotes)
      const usedIds = personaNotes.filter((n) => n.id && keptSet.has(n.content)).map((n) => n.id)
      // Fire-and-forget: recording use must never delay or fail a reply.
      void buildReflection(fastify, { userId: ownerIdOf(request.user, 'reflection notes') }).reinforceNotes(usedIds).catch(() => {})
    }
    const keptSummary = sel.kept.some((k) => k.section === 'summary') ? convo.summary : null
    const keptCards = keptOf('card')   // recalled Knowledge Cards that fit the budget (rendered with recall)
    const keptRecall = keptOf('recall')
    const keptConversation = keptOf('conversation') // passive Conversation-Search evidence that fit the budget
    const keptWorking = keptOf('working')[0] || null // L4 working-memory block (single), if it fit the budget
    // ══ ⭐⭐⭐ B0 · THE WORKING-MEMORY TRACE. Ote, 2026-08-24: *"First add the rendered working-memory
    // trace so F6 is properly observable."*
    //
    // ⛔⛔ WHY: the working block was the ONE model-facing surface with no record anywhere. The cognition
    // block and `scope-facts` are both logged per turn; this was not, and `contextBreakdown` reports only
    // the working-memory RULE because the block rides in the runtime TAIL, which the route builds without
    // `withMeta`. ⇒ establishing what she was actually shown required recomputing a pure function and
    // arguing from budget headroom. That is reconstruction, not observation, and no multi-turn claim
    // about working state can be verified on it.
    //
    // ⭐ PLACED HERE, AFTER `keptWorking`, ON PURPOSE — it records what SURVIVED THE ADAPTIVE BUDGET, not
    // merely what was rendered. Logging `workingMemoryBlock` would hide exactly the failure mode we are
    // hunting: a block that was built and then silently dropped.
    // ⭐ AND IT SEPARATES THE TWO PROVENANCES the render collapses: `wm.focus` is HERS (she set it with
    // update_working_memory); `seedFocus` is a machine extraction of the user's message. The rendered
    // line is identical either way — that is F1 — so the trace records which one it was.
    // ⛔ OBSERVABILITY ONLY. No behaviour changes, nothing she sees changes, and L4 gains no reader or
    // writer: this reads variables the route already computed. Same file the freeze audit already lists.
    if (fastify.config?.memory?.cognitionDebug === true && wmEnabled) {
      try {
        const raw = normalizeWorkingMemory(convo.working_memory)
        const seed = extractIntent(lastUserText)
        const { appendFileSync } = await import('node:fs')
        appendFileSync(new URL('../../../../cognition-debug.log', import.meta.url), `${JSON.stringify({
          at: new Date().toISOString(), conversationId: convo.id, kind: 'working-memory',
          // ⭐ THE PROVENANCE OF THE FOCUS LINE, which the rendered text cannot express:
          //   'hers'    — she set it via update_working_memory
          //   'seed'    — the route derived it from the user's message this turn (F1)
          //   'none'    — no focus at all
          focusProvenance: raw.focus ? 'hers' : (seed ? 'seed' : 'none'),
          stored: { focus: raw.focus, plan: raw.plan, openQuestions: raw.openQuestions.length,
            activeItems: raw.activeItems.length, completedItems: raw.completedItems.length, updatedAt: raw.updatedAt },
          seedFocus: raw.focus ? null : seed,
          // ⭐ RENDERED vs DELIVERED — the two can differ, and that difference is F2.
          renderedChars: workingMemoryBlock ? String(workingMemoryBlock).length : 0,
          deliveredChars: keptWorking ? String(keptWorking).length : 0,
          droppedByBudget: Boolean(workingMemoryBlock) && !keptWorking,
          adaptiveBudgetTokens: adaptiveBudget,
          // the exact text she was handed, or null when nothing was
          block: keptWorking ?? null,
        })}
`)
      } catch { /* observability must never break a turn */ }
    }

    // Compose with ONLY the kept adaptive items (system stays the hard one). The Composer is PURE — the
    // route owns the side effects: SURFACE anything trimmed over SSE (never a silent truncation).
    const composed = composeSystemContext({ ...sysInputs, pinnedMemories: keptPinned, personaNotes: keptNotes, summary: keptSummary })
    if (sel.dropped.length) {
      write({ type: 'status', phase: 'context_trimmed', budget: sel.budget, droppedBySection: sel.stats.droppedBySection, droppedByProvider: sel.stats.droppedByProvider, droppedByReason: sel.stats.droppedByReason })
    }
    // No SILENT injection either: when the passive Conversation-Search provider contributes evidence,
    // surface how many excerpts entered the prompt (the UI can show a subtle "referenced past chats" cue).
    if (keptConversation.length) {
      write({ type: 'status', phase: 'context_evidence', provider: 'conversation', count: keptConversation.length })
    }
    const messages = [{ role: 'system', content: composed.system }, ...composed.preHistory]
    const recent = verbatim

    // ordered weave for the interleaved transcript (reasoning + text + tool + interaction + …, in the
    // real sequence). Declared here (not just before the round loop) so PRE-generation runtime actions
    // — e.g. the vision relay below — can record their interaction as the first segment.
    const segments = []
    // Interaction Runtime (Streaming Semantics RFC): emit runtime-generated narration of what we're
    // DOING — a first-class role, shown live + recorded as a segment, NEVER replayed (segments don't
    // re-enter context). System-generated; no parsing of model text. Used by the vision relay + tool starts.
    // Interaction narration ("🔎 Searching…") is a LIVE-only status: emitted over SSE so the client can
    // show it WHILE the work runs, then cleared once the tool result lands. It is NOT persisted as a
    // segment — once the tool row exists with its result, the narration is redundant, and re-rendering it
    // in the stored transcript just adds stale "Searching…/Reading…" lines (Ote 2026-07-29).
    const emitInteraction = (icon, text) => { write({ type: 'interaction', icon, text }) }

    // ---- vision relay: when the TARGET model can't see, a vision model describes the
    // images and the descriptions ride the prompt instead. Descriptions are cached on
    // the message row (image_descriptions) so each image is described exactly once.
    let targetSeesImages = true
    let relayModelId = null
    let visionRelayError = null // set when the describer failed; the prompt then says so out loud
    const anyImages = recent.some((m) => Array.isArray(m.images) && m.images.length)
    if (anyImages && !genError) {
      try {
        const targetCaps = await capsForModel(fastify, providerName, modelName)
        targetSeesImages = targetCaps.includes('vision')
      } catch (e) {
        // Unknown -> assume it sees (the provider ignoring images beats refusing the turn). But this
        // fail-open USED TO BE SILENT, and silence here looks exactly like "the model just can't see":
        // the images go to a possibly-blind model and nothing anywhere says why the relay was skipped.
        // 2026-08-03: a live image turn skipped the relay with a correct probe row in the DB, and there
        // was no line to prove whether this lookup had thrown. A fail-open must still be audible.
        request.log?.warn?.({ err: e?.message, model: `${providerName}/${modelName}` }, 'vision: capability lookup failed — assuming the target can see, relay SKIPPED')
      }
      if (!targetSeesImages) {
        relayModelId = settings.visionRelayModel || platformVisionRelayModel(fastify.config)
        // ⚠️ THE DESCRIBER MUST BE ABLE TO SEE. Nothing checked this until 2026-08-03, when the platform
        // default (gemma4:e4b) went blind upstream (ollama#16874/#16597 — E2B/E4B image inputs broken on
        // Windows) and would have written refusals or CONFABULATIONS into image_descriptions — cached on
        // the message row FOREVER and replayed to every later turn. A blind describer is worse than no
        // describer, so say so loudly; the relay still runs (the caps index may simply be unprobed).
        try {
          const relayRef = parseModelRef({ model: relayModelId })
          const relayCaps = await capsForModel(fastify, relayRef.provider, relayRef.model)
          if (!relayCaps.includes('vision')) {
            request.log?.warn?.({ relayModelId, caps: relayCaps }, 'vision relay: the configured RELAY model is not known to see — descriptions may be wrong (check chat.visionRelayModel / re-probe)')
          }
        } catch { /* caps unknown for the relay model — proceed; the relay itself will surface real errors */ }
        write({ type: 'status', phase: 'vision_relay', model: relayModelId })
        try {
          const rref = parseModelRef({ model: relayModelId })
          // How many descriptions this turn will actually produce — the denominator of the progress
          // counter. Counted BEFORE the work so "image 1 of 3" is true from the first narration
          // (counting as we go would say "1 of 1" three times).
          const todo = recent.reduce((n, m) => {
            if (!Array.isArray(m.images) || !m.images.length) return n
            return n + Math.max(0, m.images.length - descriptionsOf(m).length)
          }, 0)
          let done = 0
          for (const row of recent) {
            if (!Array.isArray(row.images) || !row.images.length) continue
            const cached = descriptionsOf(row)
            if (cached.length >= row.images.length) continue
            const descs = [...cached]
            for (let i = descs.length; i < row.images.length; i++) {
              // runtime-known, user-visible, seconds-long work → narrate it (a non-tool emitter), and
              // re-narrate PER IMAGE: each one is its own model call, so a single frozen line across
              // four of them reads like a hang.
              const narration = describeVisionInteraction({ index: done, total: todo })
              emitInteraction(narration.icon, narration.text)
              // ONE DESCRIBE, WITH ONE RETRY. Measured 2026-08-03: llama-server can abort mid-relay
              // (`0xc0000409` / "CUDA error: shared object initialization") once the box has been
              // churning models for hours — the runner then dies on load and the NEXT attempt often
              // succeeds because Ollama restarts it. Retrying is not papering over a bug: the failure
              // is a crashed child process, and the alternative (below) is handing a picture to a
              // model that cannot see, which produces a confidently wrong "you didn't attach an image".
              // numCtx is CAPPED here: a describe is one image plus two short prompts, so the chat
              // model's full window (131k on this box) is pure VRAM pressure — measured same speed at
              // 8192 (5-13s) and it leaves the card room. Device is a lever because CPU works but is
              // ~10x slower (63-71s measured), which is a fine trade only if the GPU is contended.
              const relayOptions = {
                stream: false, reasoning: { enabled: false }, max_tokens: 700,
                numCtx: visionRelayNumCtx(fastify.config),
                ...(visionRelayDevice(fastify.config) === 'cpu' ? { numGpu: 0 } : {}),
              }
              const describeOnce = () => chat({
                serverConfig: fastify.config,
                request: {
                  provider: rref.provider, model: rref.model,
                  messages: [{ role: 'user', content: 'Describe this image in detail for another AI that cannot see it. Include any visible text verbatim. Be factual and concise.', images: [row.images[i]] }],
                  options: relayOptions,
                  userId: ownerIdOf(request.user, 'this request'),
                },
              })
              let res
              try {
                res = await describeOnce()
              } catch (e1) {
                request.log?.warn?.({ err: e1?.message, relayModelId, image: i + 1 }, 'vision relay: describe failed — retrying once')
                res = await describeOnce() // a second failure falls to the outer catch (honest note + status)
              }
              await logInternalUsage('chat.vision-relay', relayModelId, res?.usage, ownerIdOf(request.user, 'this request'))
              const text = (res?.message?.content || '').trim() || '(no description produced)'
              // RECORD WHICH EYE SAW IT (Ote 2026-08-03). Descriptions used to be bare strings, so a
              // cached one could never be attributed — which is exactly why a blind describer went
              // unnoticed for a day. New rows are {text, model, at}; legacy strings still read fine
              // through descriptionsOf/descriptionText.
              descs.push({ text, model: relayModelId, at: new Date().toISOString() })
              done++
              // SHOW THE USER WHAT THE EYE SAW, live. The description is EVIDENCE, not narration: it
              // is persisted on the message row and rendered as its own block, so the person can judge
              // the description that their answer was actually built from.
              write({ type: 'vision', messageId: row.id, index: i, total: row.images.length, model: relayModelId, description: text })
            }
            await row.update({ image_descriptions: descs })
            row.image_descriptions = descs
          }
        } catch (e) {
          // THE RELAY FAILED TWICE. The old fallback set targetSeesImages = true — "attach the images
          // anyway and let the provider cope" — which on a model that genuinely cannot see produces
          // the worst possible answer: "it looks like you didn't attach an image." That is what Ote
          // saw on 2026-08-03, and it reads as the platform losing his upload rather than a describer
          // that crashed. So the target keeps its honest blindness and the prompt gets a note saying
          // the image exists but could not be read — the model can then say so, which is true.
          // Also LOGGED: this used to travel only on the SSE, so a failure left no server-side trace
          // (the reason this took a bug hunt to find at all).
          request.log?.error?.({ err: e?.message, relayModelId, model: `${providerName}/${modelName}` }, 'vision relay FAILED after retry — the answering model is told the image could not be read')
          write({ type: 'status', phase: 'vision_relay_failed', message: e?.message || 'vision relay failed' })
          visionRelayError = e?.message || 'vision relay failed'
        }
      }
    }

    for (const m of recent) {
      // ⚠️ NEVER REPLAY AN EMPTY ASSISTANT TURN. Two exist in this store (2026-08-18 10:36:31 and
      // 22:41:32): content '', no reasoning, no tool calls, no error — ghost rows written when a client
      // disconnected before the first token arrived, 4s and 11s into a ~60s cold model load. Hermes
      // reported the symptom unprompted: *"a few of my messages came back empty and only answered after
      // I hit Regenerate."*
      //
      // Feeding one back is worse than showing it. An empty assistant message in context is a
      // demonstration that replying with nothing is acceptable, and this model DOES imitate the shape of
      // what it is shown — the attribution runner proved it by inserting a filler "Understood." between
      // turns and getting "Understood." back as an answer. Skipping them here also repairs the two rows
      // already on disk without touching their history.
      if (m.role === 'assistant' && !String(m.content || '').trim()
          && !(m.tool_calls?.length) && !String(m.reasoning || '').trim()) continue
      if (m.role === 'user' || m.role === 'assistant') {
        const msg = { role: m.role, content: m.content }
        // document attachments ride the prompt as extracted text blocks
        if (Array.isArray(m.files) && m.files.length) {
          const blocks = m.files.map((f) => `[Attached file: ${f.name}${f.note ? ` — ${f.note}` : ''}]\n${f.text || '(no text extracted)'}`)
          msg.content = `${msg.content || ''}${msg.content ? '\n\n' : ''}${blocks.join('\n\n')}`
        }
        if (Array.isArray(m.images) && m.images.length) {
          if (targetSeesImages) {
            msg.images = m.images // vision input (adapters translate per wire format)
          } else {
            const descs = descriptionsOf(m)
            const blocks = m.images.map((_, i) => {
              const d = descriptionText(descs[i])
              if (d) return `[Attached image ${i + 1} — this model cannot see images; a vision model (${relayModelId}) described it: ${d}]`
              // No description: say WHY, so the reply is "I couldn't read your image" and never
              // "you didn't attach one" — the user can see the attachment sitting right there.
              return `[Attached image ${i + 1} — the user DID attach an image, but this model cannot see images and the vision model could not read it${visionRelayError ? ` (${visionRelayError.slice(0, 120)})` : ''}. Tell the user the image could not be read and offer to try again; do NOT say no image was attached.]`
            })
            msg.content = `${msg.content || ''}${msg.content ? '\n\n' : ''}${blocks.join('\n')}`
          }
        }
        messages.push(msg)
      }
    }

    // ---- L4 runtime tail: hard lines (datetime + memory hint) + the KEPT ranked recall (budgeted
    // above). Appended AFTER history so per-turn content never busts the cached prompt prefix. ----
    // Cards render alongside recall in the same "things you recall" block (cards first — synthesized
    // knowledge), but they were SCORED at the higher card weight above so they survive the budget first.
    // Kept in a named binding (not spread inline) so the context-usage breakdown can attribute these
    // tokens to 'runtime' instead of guessing at them after assembly.
    const tailMsgs = composeRuntimeTail({ toolsOn, useMemory: settings.useMemory, nowString, zone: tailZone, lastUserText, searchOn: searchOffered, recallMemories: [...keptCards, ...keptRecall], conversationEvidence: keptConversation, workingMemory: keptWorking })
    messages.push(...tailMsgs)

    // ---- agent loop: model -> (tool calls -> execute -> feed results back) -> final answer ----
    //
    // ⭐⭐⭐ S1 · THE TOOLSET IS ASSEMBLED IN ONE PLACE, AND BOTH SKILL PATHS CALL IT.
    // The nine ordered steps, and why this is a module rather than two copies of a filter chain, live in
    // `app/chat/tool-defs.js`. Here there are exactly TWO calls: this one, with whatever Skill is BOUND
    // to the conversation, and one more the moment `use_skill` activates a Skill mid-turn — search for
    // `S1 · REASSEMBLE`. ⛔ A third caller, or a tool added at a call site instead of in the module,
    // re-opens the defect: the assembly must stay a function of the Skill in force and nothing else.
    // ⓘ `adviceDestinations` was derived once, above sysInputs — one list, two consumers.
    let { defs: toolDefs, modelCanWriteMemory, trace: toolsetTrace } = assembleToolDefs({
      skill: activeSkill,
      adviceDestinations,
      toolsOn,
      interactiveTurn,
      invocableSkills,
      oneShotAllowedTools: request.body?.allowedTools ?? null,
      useMemory: settings.useMemory,
      path: activeSkill ? 'bound' : 'none',
    })

    // Automatic memory WRITE — the AUTOMATIC path, used when the model can't drive memory itself this
    // turn (no memory write-tools). When it CAN, the decision moves to the END of the turn — see
    // FALLBACK-ONLY CAPTURE below. Distill the user turn into durable FACTS only (captureFacts).
    // We deliberately do NOT store the raw user message as an episodic memory: questions and commands
    // ("what is my favorite language?", "clear my memory") are not durable knowledge — storing them
    // verbatim polluted the store (and even fed a mis-delete). Raw conversation history is EVIDENCE
    // that belongs to Conversation Search (a separate retrieval provider), not the Memory store.
    // Off the hot path (fire-and-forget, never awaited) — never delays or breaks a reply.
    if (settings.useMemory && !modelCanWriteMemory && lastUserText.length >= 12) {
      const srcMsgId = lastUserMsg?.id ?? null // provenance: stamp the source message on extracted facts
      recordAuto()
      // The YIELD is recorded and logged, not dropped. Dropping it once cost a live investigation: a turn
      // extracted one fact where the same sentence extracts two offline, and nothing could say whether the
      // second was never extracted, unparsed, or lost in commit. Same fire-and-forget, one .then richer.
      captureFacts(fastify, { userId: ownerIdOf(request.user, 'this request'), sourceMessageId: srcMsgId }, lastUserText, { source: `conversation:${convo.id}` })
        .then((r) => {
          recordCapture({ facts: r?.facts ?? 0, error: !!r?.error })
          fastify.log?.info?.({ conversation: convo.id, facts: r?.facts ?? 0, actions: r?.actions ?? [], error: !!r?.error, skipped: !!r?.skipped }, 'memory.capture(auto): yield')
        })
        .catch(() => {})
    }

    // IDENTITY capture (Memory V3 Phase 1 · RFC step 4) — self-naming → the reserved identity slot →
    // Profile.preferredName. Runs REGARDLESS of the one-writer rule above: identity has its OWN slot (no
    // race with the model's generic memory writes), so "I'm Claude" / "ผมชื่อโอต" is learned whether or
    // not the model holds memory tools. Skips root/anonymous (config/username-driven name).
    //
    // ⚠️ SINCE 2026-08-12 THIS CAN COST AN AUX LLM CALL — but only on turns carrying a naming cue, which
    // a cheap multilingual lexicon decides before any model is reached. Ordinary turns still cost zero.
    // The call is CPU-placed (num_gpu:0) and fire-and-forget, so it can neither evict the chat model nor
    // delay this reply. Interpretation is the model's; adoption stays deterministic.
    if (settings.useMemory && request.user?.id && lastUserText) {
      // conversationId + user + interactive are what let the ADOPTION GATE ask instead of guessing when
      // a name would REPLACE one she already has (RFC step 5). Without them it degrades to defer —
      // keep the current name, change nothing — which is what every non-chat caller gets.
      // ⚠️ THE YIELD IS LOGGED, exactly as captureFacts' is, and for the same reason it was added there:
      // "dropping it once cost a live investigation". It cost one again on 2026-08-12 — identity capture
      // silently produced nothing for a whole test run and the log said NOTHING AT ALL, so the first
      // suspicion fell on code that turned out to be fine. (Ollama was down.) A path that can decline to
      // act must say so, or its silence is indistinguishable from its absence.
      captureIdentity(fastify, {
        userId: request.user.id,
        sourceMessageId: lastUserMsg?.id ?? null,
        user: request.user,
        conversationId: convo.id,
        interactive: interactiveTurn,
      }, lastUserText, { source: `conversation:${convo.id}` })
        .then((r) => {
          if (r?.skipped) return // disabled, or no user to scope to — not an event
          fastify.log?.info?.({
            conversation: convo.id, identity: !!r?.identity, action: r?.action ?? null,
            value: r?.value ?? null, from: r?.from ?? null, via: r?.via ?? null, error: !!r?.error,
          }, 'memory.identity: yield')
        })
        .catch(() => {})
    }

    // RuntimeContext from the PortableComponents adapter: injects host services (memory/search)
    // bound to the caller. Tools consume ctx.services.*, never fastify.db directly. The model
    // actually answering rides along so get_service_overview reports currentModel — without it
    // the model reads defaultModel and misidentifies itself (user-reported).
    // conversationId lets conversation-aware services default sensibly — e.g. a schedule
    // created mid-chat lands its runs HERE unless the user asks otherwise.
    // `turn` = the honest self-description get_service_overview reports. placement in particular exists
    // because Ote asked the assistant "recheck if you are really run on cpu" and it had no way to know:
    // num_gpu:0 is the only truthful basis for that answer, and it lives here, not in the model.
    const turnShape = {
      // Mirror withProviderOptions EXACTLY: an explicit caller numGpu wins, else the provider's forceCpu.
      // My first version read only `options.numGpu` — but the route never sets it; the provider flag is
      // applied downstream in chat-runtime. So the tool built to answer "are you really on CPU" replied
      // "gpu" on a CPU-provider turn. Caught by running it, not by reading it. Placement is decided by the
      // layer that sets num_gpu, so it has to be derived from the same inputs that layer uses.
      placement: provKind !== 'ollama'
        ? 'remote'
        : (Number.isInteger(options.numGpu)
            ? (options.numGpu === 0 ? 'cpu' : 'gpu')
            : (provCfg?.forceCpu === true ? 'cpu' : 'gpu')),
      contextWindow: ctxWindow > 0 ? ctxWindow : null,
      toolsEnabled: toolsOn,
      memoryEnabled: settings.useMemory === true,
      reasoningEnabled: settings.reasoning?.enabled === true,
      capabilities: capGate.caps ?? null,
    }
    const toolCtx = buildToolContext(fastify, request, { origin: 'chat', model: modelId, timezone: userTz, conversationId: convo.id, interactive: interactiveTurn, messageId: lastUserMsg?.id ?? null, turn: turnShape })
    const maxRounds = getSetting(fastify.config, 'chat.toolsMaxCalls') ?? 8

    // ---- token-budget guard (visible, never silent) ----
    // Local models TRUNCATE silently past their context window (measured live: HTTP 200,
    // wrong answer). Estimate the assembled prompt (chars/4 ≈ tokens; images counted flat)
    // against the window we pass to Ollama and SURFACE an overflow — the user learns the
    // oldest content/big attachments may be ignored, instead of trusting a blind answer.
    // (Initial prompt only; tool results can still grow a turn — v1 accepts that.)
    let contextOverflow = null
    try {
      // ctxWindow (computed with the fold logic above) = the window the request actually
      // gets: root's limit capped at the measured optimum; "no limit" = the trained max.
      const windowTokens = ctxWindow
      if (windowTokens > 0) {
        let chars = 0
        let imgs = 0
        for (const m of messages) {
          chars += typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content || '').length
          if (Array.isArray(m.images)) imgs += m.images.length
        }
        // TOOL DEFINITIONS ARE PART OF THE PROMPT and were missing from this estimate — which made the
        // guard blind by roughly 7k tokens, because MEASURED they are ~95% of it (7266 tokens with tools
        // on vs 363 off). That is why it never fired in practice.
        const toolChars = toolDefs ? JSON.stringify(toolDefs).length : 0
        const estimate = Math.round((chars + toolChars) / 4) + imgs * 600
        // THE REPLY NEEDS ROOM TOO. A prompt that merely FITS is not safe: Ote's message 3f0fbde5 had a
        // 7991-token prompt against an 8192 window, generated 244 tokens, hit the ceiling and stopped
        // mid-JSON — with finishReason undefined, no error, and nothing on screen. A silent truncation is
        // exactly what this guard exists to prevent, so it has to warn on "no room to answer", not only on
        // "prompt too big".
        const reserve = Math.min(1024, Math.max(256, Math.round(windowTokens * 0.15)))
        const tooBig = estimate > windowTokens
        if (tooBig || estimate + reserve > windowTokens) {
          const headroom = windowTokens - estimate
          contextOverflow = { estimate, window: windowTokens, headroom, tooBig }
          write({ type: 'status', phase: 'context_overflow', estimate, window: windowTokens, headroom, tooBig })
          request.log?.warn?.(tooBig
            ? `[ctx] prompt estimate ~${estimate} tokens exceeds the ${windowTokens}-token window (${providerName}/${modelName}) — the provider will truncate the oldest content`
            : `[ctx] prompt estimate ~${estimate} of a ${windowTokens}-token window leaves only ~${headroom} tokens to answer in (${providerName}/${modelName}) — the reply will likely be cut off mid-sentence`)
        }
      }
    } catch { /* the guard must never break a send */ }

    // ---- context usage: the same estimate, broken down and shown even when nothing is wrong ----
    // The guard above only speaks when a turn is in trouble. That left the most useful fact invisible
    // in the normal case — that tool definitions dominate a small prompt — so the breakdown is emitted
    // every turn. GATED SERVER-SIDE: it describes prompt internals (which rules are loaded, that memory
    // was recalled), which is operator information. An unauthorized client must never RECEIVE it —
    // hiding a popup in the UI is not a permission check.
    let contextUsage = null
    try {
      contextUsage = contextBreakdown({
        systemParts: composed.parts,
        preHistory: composed.preHistory,
        history: recent,
        tail: tailMsgs,
        toolDefs,
        window: ctxWindow,
      })
      // Remember it so reopening the conversation still shows the meter instead of a blank until the
      // next reply. Stored in FULL — the gate is applied at read time, not at write time, so a change
      // of role never leaves a stale over-shared copy behind.
      rememberContextUsage(convo.id, contextUsage)
      // Everyone gets the headline (the corner meter); only context_detail sees the breakdown.
      const detailed = can(request.user, 'context_detail')
      write({
        type: 'status',
        phase: 'context_usage',
        window: contextUsage.window,
        used: contextUsage.used,
        free: contextUsage.free,
        usedPct: contextUsage.usedPct,
        estimated: true,
        ...(detailed ? { categories: contextUsage.categories, parts: contextUsage.parts } : {}),
        detail: detailed,
      })
    } catch { /* usage reporting must never break a send, exactly like the guard */ }

    let answer = ''
    // ⚠ EVERY APPEND TO `answer` GOES THROUGH appendAnswer — see answerBlockJoin in stream-guards.js for why.
    // `roundWroteText` is what makes the separator land ONCE per round rather than between every token: it is
    // reset when a round starts, so only the round's FIRST text pays the join.
    // It cannot break the two places that reach into `answer` by arithmetic (the degeneration trim and
    // answer_superseded), because the separator is inserted BEFORE the round's text — so `answer` still ends
    // with `turnAnswer`, which is the invariant both of them rely on.
    let roundWroteText = false
    const appendAnswer = (text) => {
      if (!text) return
      if (!roundWroteText) answer += answerBlockJoin(answer)
      roundWroteText = true
      answer += text
    }
    let reasoning = ''
    let usage = null
    let firstTokenAt = null
    let finishReason = null // last provider finish signal ('length'/'max_tokens' = output cap hit)
    const working = messages.slice()
    let rounds = 0
    let emptyNudges = 0 // continuation nudges after a silent post-tool round (bounded)
    // ⭐⭐⭐ THE ROUND BUDGET, MADE VISIBLE TO BOTH SIDES. Ote, 2026-08-24: *"I want the system to never
    // silently spend the whole turn and then return nothing."*
    //
    // ⛔⛔ MEASURED, and it is why this exists. The first real Phase C job — reconcile a document against
    // what she knows — spent 19 tool calls across the 8-round budget and returned **no answer at all**:
    // only the narration she had written between rounds, with `error: null`. Nothing had told her she was
    // on her last round, and nothing told the user the turn had been cut short. The whole turn was spent
    // and the result was indistinguishable from a short reply.
    //
    // ⭐ TWO SEPARATE THINGS, and the first is the actual fix:
    //   `roundsWarned`     — she is TOLD when a round is her last, so she can land the answer. Prevention.
    //   `roundsExhausted`  — the turn is MARKED when the budget ran out, whether or not text came back.
    //                        Reporting. ⛔ Unconditional: a truncated turn is never silent again.
    // ⛔ Generic, not Skill-specific: it is a property of the agent loop, and any long job hits it.
    let roundsWarned = false
    let roundsExhausted = false
    // ⭐⭐⭐ SKILL ARTEFACTS · conformance enforced in CODE, not in prose.
    //
    // ⛔⛔ MEASURED TWICE, AND THAT IS WHY THIS IS A MECHANISM RATHER THAN ANOTHER SENTENCE. Both Skills
    // written this phase state a required output shape in their instructions, and both times she honoured
    // the SPIRIT and dropped the FORM: `doc-framework` run 2 produced 0 of 3 named artefacts, and
    // `doc-reconcile` produced 5 of 7 — missing the verification pass both times. And the omission cost a
    // real error: she wrote "confidence scoring is NOT visible" while the rows carry 0.6 and 0.98, which
    // the verification pass she skipped was designed to catch.
    // ⇒ ⭐ Ote: *"Don't just add another instruction to the Skill saying 'remember to verify.' We already
    // have evidence that prose requirements get dropped."*
    //
    // ⭐ THE WHOLE MECHANISM: a Skill DECLARES literal strings its answer must contain, in its SKILL.md
    // frontmatter under `metadata.required-artefacts`. After the answer is written the platform checks
    // them — a substring test, deterministic, no model involved — and if any are missing it says so, once.
    // ⛔ NO SCHEMA CHANGE: `metadata` is already an open frontmatter field carried through
    // `agentSkillToComponent` into `agentSkill.metadata`. A Skill that declares nothing is unaffected.
    let artefactNudges = 0
    let artefactCheck = null // { required[], missing[], satisfied } — recorded whether it passed or not
    // Has the model SPOKEN since its last tool call? Starts true (nothing has run yet). A tool execution sets
    // it false; any answer token sets it true. This is what tells "worked, then reported back" apart from
    // "worked, then went silent" — the latter reads to a user as the request being ignored.
    let textSinceLastTool = true
    const executed = new Map() // dedup: tool key -> cached result (a model may repeat a call)
    const toolActivity = [] // flat trace (persisted as tool_calls)
    // (segments + emitInteraction are declared earlier — before the vision relay — so pre-generation
    // runtime actions can record interaction; the weave continues to accrete here through the turn)
    // template-token debris is scrubbed per segment (a degrading model can end a long
    // reply with a literal <channel|> — measured live; see stream-guards.js)
    // scrub BOTH: template tail debris, and a tool call the model typed as prose (raw JSON + </tool_call>).
    const pushText = (text) => { const t = scrubToolCallText(scrubTemplateTail(text)); if (t.trim()) segments.push({ type: 'text', text: t }) }
    const pushReasoning = (text) => { if (text.trim()) segments.push({ type: 'reasoning', text: text.trim() }) }
    // Steering: fold pending mid-generation user messages into the running turn. Each is
    // recorded as a 'steer' segment (renders inline on the rail), pushed to the model's
    // working context, and echoed as an SSE `steered` event so the client shows it live.
    const drainSteers = () => {
      const steers = steerReg.take(convo.id)
      for (const s of steers) {
        segments.push({ type: 'steer', text: s })
        working.push({ role: 'user', content: s })
        write({ type: 'steered', text: s })
      }
      return steers.length
    }

    try {
      // gate-blocked turns (genError already set) never reach the provider
      let steerInterrupted = false
      // stream rails (Ote's report): a first-token watchdog per ROUND (silence = wedged
      // provider; slow GENERATION after the first token is never cut) + a repetition-
      // collapse guard on the accumulating text (checked every ~40 tokens, cheap).
      // Adaptive first-token budget. The configured value is the FLOOR (right for small
      // prompts), but a large context legitimately needs far longer to prefill + emit its
      // first token — and a cold model load, or an Ollama slot freed after a steer-abort, adds
      // to that (Ote's report: steering a ~108k-token thread tripped the flat 180s guard while
      // the round was still prefilling / the runner was freeing). Scale the allowance with the
      // estimated prompt size so a big-context round isn't falsely cut, keeping the configured
      // value as the floor and a hard ceiling so a genuinely WEDGED runner is still caught.
      const TTFT_PREFILL_FLOOR_TPS = 350 // conservative prefill-rate floor (tok/s) for the budget
      const TTFT_MAX_MS = 600_000 // 10-min ceiling — a true wedge still trips this
      const baseTtftMs = (getSetting(fastify.config, 'chat.firstTokenTimeoutSeconds') ?? 180) * 1000
      const ttftBudget = (msgs) => Math.min(TTFT_MAX_MS, Math.max(baseTtftMs, Math.round(estTok(msgs) / TTFT_PREFILL_FLOOR_TPS) * 1000))
      const degenGuard = getSetting(fastify.config, 'chat.degenerationGuard') !== false
      while (!genError) {
        drainSteers() // fold in steers that landed during the previous round (tool replies)
        const roundTtftMs = ttftBudget(working) // adapt to THIS round's (grown) context size
        const toolCalls = []
        let turnAnswer = ''
        // ⚠ THE WIRE GETS THE SCRUBBED TEXT NOW — this line is the fix for a defect that was invisible to
        // every query we ran. `answer` is scrubbed before it is persisted (see below) and each segment is
        // scrubbed by pushText, but the TOKEN went to the browser raw. So the live reply showed
        // `</tool_call>` and raw tool JSON, the saved row was clean, and a reload made it vanish — which is
        // why three separate searches of the database all reported "rare" while an outside reviewer was
        // watching it happen 5 times in one session. `turnAnswer`/`answer` keep accumulating RAW; only what
        // the client sees passes through the gate. Flushed at the end of the round, below.
        const wire = makeStreamScrubber()
        roundWroteText = false // this round's first text starts a new markdown block in `answer`
        let turnReasoning = '' // this round's thinking, woven into segments before its text
        let tokCount = 0
        let degenerateCut = null
        for await (const evt of watchFirstToken(streamChat({
          serverConfig: fastify.config,
          // conversationId rides along purely for local-monitor attribution — it tells the Local console
          // WHICH chat is on a resident model, not just which user.
          request: { provider: providerName, model: modelName, messages: working, tools: toolDefs, options, userId: ownerIdOf(request.user, 'this request'), conversationId: convo.id },
        }), roundTtftMs, () => clientGone || steerReg.hasPending(convo.id))) {
          if (clientGone) break
          switch (evt.event) {
            case 'token':
              if (!firstTokenAt) firstTokenAt = Date.now()
              turnAnswer += evt.data.text; appendAnswer(evt.data.text)
              { const outText = wire.push(evt.data.text); if (outText) write({ type: 'token', text: outText }) }
              textSinceLastTool = true // it has reported back — no closing answer needs forcing
              // repetition-collapse check — on trigger: trim the junk tail, mark the cut
              // VISIBLY (persisted note), and end the round like a completed answer
              if (degenGuard && ++tokCount % 40 === 0) {
                const why = looksDegenerate(turnAnswer)
                if (why) {
                  const trimmed = trimDegenerateTail(turnAnswer)
                  answer = answer.slice(0, answer.length - (turnAnswer.length - trimmed.length)) + DEGENERATE_NOTE
                  turnAnswer = trimmed + DEGENERATE_NOTE
                  degenerateCut = why
                  write({ type: 'token', text: DEGENERATE_NOTE })
                  write({ type: 'status', phase: 'degenerate_cut', note: `the model got stuck (${why}) — reply cut` })
                  request.log?.warn?.(`[chat] degeneration cut (${why}) on ${providerName}/${modelName} in ${convo.id}`)
                }
              }
              break
            case 'reasoning':
              if (!firstTokenAt) firstTokenAt = Date.now()
              reasoning += evt.data.text; turnReasoning += evt.data.text; write({ type: 'reasoning', text: evt.data.text }); break
            case 'answer_superseded': {
              // A thinking model restarted its answer mid-stream: the run so far is DISCARDED OUTPUT
              // — not reasoning (that's the thinking channel), not the answer. Trim it from canonical
              // `content` and record it as a `draft` segment: preserved for inspection, but kept out
              // of both the answer and the replayed history (segments aren't replayed — only role +
              // content are). reasoning is left untouched. Client clears its live answer bubble.
              const draft = evt.data?.text || ''
              if (draft && answer.endsWith(draft)) {
                answer = answer.slice(0, answer.length - draft.length)
                if (turnAnswer.endsWith(draft)) turnAnswer = turnAnswer.slice(0, turnAnswer.length - draft.length)
                segments.push({ type: 'draft', text: draft })
                write({ type: 'answer_superseded', text: draft }) // client trims the discarded run from the live bubble
              }
              break
            }
            case 'tool_call':
              toolCalls.push(evt.data); break
            case 'done':
              if (evt.data?.usage) usage = mergeUsage(usage, evt.data.usage)
              if (evt.data?.finishReason) finishReason = evt.data.finishReason
              break
            case 'error': genError = { code: evt.data?.code, message: evt.data?.message }; write({ type: 'error', code: evt.data?.code, message: evt.data?.message }); break
            case 'first_token_timeout': {
              // the model never said a word (wedged load?) — end the turn with Ote's
              // requested personality, but record the honest error underneath it
              const secs = Math.round(roundTtftMs / 1000)
              const line = wakeOteLine(secs)
              turnAnswer += line; appendAnswer(line)
              write({ type: 'token', text: line })
              // State the OBSERVATION, not a cause. This string used to assert "the model may be
              // stuck loading", and that single guess cost real debugging time: the actual cause of
              // a whole run of these was our own ollama adapter never aborting abandoned requests,
              // which left the runner blocked on write. Silence has several causes and the server
              // cannot tell them apart from here — so it names them instead of picking one.
              genError = { code: 'first_token_timeout', message: `silent for ${secs}s before producing a single token — the model may be loading, queued behind another request, or its runner may be wedged. Try again, or pick another model.` }
              write({ type: 'error', code: genError.code, message: genError.message })
              request.log?.warn?.(`[chat] first-token timeout (${secs}s) on ${providerName}/${modelName} in ${convo.id}`)
              break
            }
            case 'aborted_before_token':
              // a Stop (clientGone) or a steer landed WHILE we were still waiting for the
              // first token — the watchdog cut the wait so it lands now instead of hanging to
              // the ttft guard (Ote's "Stop almost works"). A steer → interrupt + react; a
              // Stop → clientGone is already set and the post-loop branch persists the stop.
              if (!clientGone && steerReg.hasPending(convo.id)) steerInterrupted = true
              break
            default: break
          }
          if (evt.event === 'aborted_before_token') break // stop/steer during a first-token stall
          if (degenerateCut) break // the cut IS the end of the reply (stream torn down like Stop)
          // B2 immediate steering: a steer landed while this round streamed — cut the
          // round HERE (breaking tears the provider stream down, same as the Stop path),
          // keep the partial as work-so-far, and let the next loop pass fold the steer in.
          if (!genError && !clientGone && steerReg.hasPending(convo.id)) { steerInterrupted = true; break }
        }
        // ⚠ MUST run on EVERY exit from the round — normal end, degeneration cut, steer, Stop, timeout.
        // The gate withholds a short tail that could still become a marker; if it is never flushed, that
        // tail is silently dropped and the reply loses its last few characters. Placed here, after the
        // for-await, so no `break` above can skip it.
        { const tail = wire.flush(); if (tail) write({ type: 'token', text: tail }) }

        if (degenerateCut) { pushReasoning(turnReasoning); pushText(turnAnswer); break }
        // ⭐ THE BUDGET RAN OUT. `clientGone` is a different thing and must not be reported as one:
        // a disconnect is the user leaving, exhaustion is us stopping her mid-job.
        if (rounds >= maxRounds && !clientGone) {
          roundsExhausted = true
          // ⛔ UNCONDITIONAL — the status fires whether or not she produced text, because "she answered
          // but was cut off" and "she answered fully" are different facts and only one of them is fine.
          write({ type: 'status', phase: 'rounds_exhausted', rounds, maxRounds,
            note: `the tool-round budget (${maxRounds}) ran out — this reply may be incomplete` })
          request.log?.warn?.({ rounds, maxRounds, toolCalls: toolActivity.length, conversation: convo.id,
            answerChars: (answer + turnAnswer).trim().length },
          '[chat] ROUNDS EXHAUSTED — the turn hit chat.toolsMaxCalls')
        }
        if (clientGone || rounds >= maxRounds) { pushReasoning(turnReasoning); pushText(turnAnswer); break }
        if (steerInterrupted) {
          // The partial text stays visible as a segment (Claude-style: interrupted, not
          // erased) and becomes the model's answer-so-far; the steer itself is drained at
          // the top of the next pass. Tool calls this round had assembled are discarded —
          // the model re-decides with the user's nudge in hand.
          steerInterrupted = false
          pushReasoning(turnReasoning)
          pushText(turnAnswer)
          if (turnAnswer.trim()) working.push({ role: 'assistant', content: turnAnswer })
          write({ type: 'status', phase: 'steer_interrupt', note: 'interrupted by your message — reacting to it' })
          continue
        }
        // MALFORMED tool calls (no function name — seen live from mimo-v2.5-pro): executing
        // them is meaningless ("Unknown tool: undefined") and echoing them back in the
        // assistant turn makes strict providers reject the whole follow-up request (400
        // Param Incorrect). Drop them BEFORE execution/round-trip; if the round produced
        // nothing else, nudge the model to retry properly (bounded, like the empty-round nudge).
        const badCalls = toolCalls.length
        for (let ci = toolCalls.length - 1; ci >= 0; ci--) {
          const name = toolCalls[ci]?.name
          if (typeof name !== 'string' || !name.trim()) toolCalls.splice(ci, 1)
        }
        if (toolCalls.length < badCalls) {
          write({ type: 'status', phase: 'agent_continue', note: 'model produced a malformed tool call — skipped' })
          if (toolCalls.length === 0 && turnAnswer.trim() === '' && emptyNudges < 2) {
            emptyNudges++
            working.push({ role: 'user', content: '(your tool call was malformed — it had no function name. Emit a valid tool call, or answer directly.)' })
            continue
          }
        }
        if (toolCalls.length === 0) {
          // Some models (seen live: gemma4:e4b) end their turn EMPTY right after a tool
          // result — mid-chain, planning "one call per response". A round with neither
          // text nor calls after tools ran is never a real answer: nudge the model to
          // continue (ephemeral working-context message, never persisted), max twice.
          if (rounds > 0 && turnAnswer.trim() === '' && emptyNudges < 2) {
            emptyNudges++
            write({ type: 'status', phase: 'agent_continue', note: 'model paused mid-chain — nudging it to continue' })
            working.push({ role: 'user', content: '(continue: the tool result is above — make the next tool call if steps remain, then give your final answer)' })
            continue
          }
          // ⭐⭐ THE ARTEFACT CHECK, at the only place a turn ends with a finished answer.
          //
          // ⚠️ Ordered BEFORE the steer handling and the break so a missing section can still be fixed in
          // this turn. ⛔ And gated on budget: if the rounds are already spent we must not nudge — being
          // told to add a section with no round left to write it in is worse than the omission.
          {
            const sk = activeSkill || dynamicSkill
            const declared = sk?.agentSkill?.metadata?.['required-artefacts']
            const required = Array.isArray(declared) ? declared.filter((x) => typeof x === 'string' && x.trim()) : []
            if (required.length) {
              const full = answer + turnAnswer
              const missing = required.filter((r) => !full.includes(r))
              // ⓘ RECORDED EVERY TIME, pass or fail — "7 of 7 present" is a result, and a check that only
              // speaks up on failure cannot tell a satisfied Skill from a Skill nobody checked.
              // ⛔⛔ NO RECORDING HERE. The first version assigned `artefactCheck` at this site only, and
              // this site is the CLEAN-FINISH path — a turn that exits through the rounds-exhausted break
              // never reaches it. The result: a real run produced 5 of 7 artefacts and recorded
              // `skillArtefacts: null`, i.e. the verdict was missing exactly when it mattered most.
              // ⇒ ⭐ RECORDING happens once, after the loop, from the final answer (see below); the NUDGE
              // stays here, because here is the only place there is still a round left to act on it.
              if (missing.length && artefactNudges < 1 && rounds < maxRounds && !roundsExhausted) {
                artefactNudges++
                write({ type: 'status', phase: 'skill_artefacts_missing', skill: sk.id, missing })
                request.log?.warn?.({ skill: sk.id, missing, conversation: convo.id },
                  '[chat] SKILL ARTEFACTS MISSING — nudging once')
                pushReasoning(turnReasoning)
                pushText(turnAnswer)
                working.push({ role: 'assistant', content: turnAnswer })
                // ⛔ Ephemeral, exactly like the other nudges — never persisted, so it cannot enter the
                // conversation or her memory. And it names the missing sections rather than re-stating the
                // whole contract, because the contract was already in the prompt and was not the problem.
                // ⭐ THE NUDGE NAMES WHAT THE SECTION MUST CONTAIN, not just its label — measured: the
                // label-only version fired and she still omitted `Checked:` and `Could not check:` with
                // budget left. A heading is easy to skip when nothing says what goes under it; the two
                // sections she drops both require an ACT (verify; state your reach) rather than prose.
                // ⛔ Still exactly ONE nudge. A loop would be worse, and it would teach nothing.
                const WHAT_IT_NEEDS = {
                  'Checked:': 'test each date, count and reference you wrote against the source it came from, and say what you checked and anything you corrected',
                  'Could not check:': 'name what you had no reach to verify, and why — or say "nothing, every claim above has a source"',
                  'What I could not verify:': 'name anything you asserted without a record behind it — or say "nothing, every claim carries a record"',
                  'Looked for:': 'name each source you actually consulted and what it returned',
                }
                const NL = String.fromCharCode(10)   // ⓘ built this way so no escape survives a scripted edit
                working.push({ role: 'user', content:
                  `(your answer is missing ${missing.length} section(s) this skill requires. Add each to what `
                  + 'you have already written — do not start over, and do not pad:' + NL
                  + missing.map((m) => `  · "${m}" — ${WHAT_IT_NEEDS[m] ?? 'fill it in as the skill describes, or say plainly that it is empty'}`).join(NL)
                  + NL + 'An empty section stated is an answer; an omitted one is a gap.)' })
                continue
              }
            }
          }
          pushReasoning(turnReasoning)
          pushText(turnAnswer)
          // Hybrid steering: if the user steered while this (final) stream ran, don't end —
          // give the model its answer-so-far + the steer as context and continue the SAME
          // turn reacting to it. Bounded by chat.maxSteersPerReply (the registry's cap).
          const pending = steerReg.take(convo.id)
          if (pending.length) {
            working.push({ role: 'assistant', content: turnAnswer })
            for (const s of pending) { segments.push({ type: 'steer', text: s }); working.push({ role: 'user', content: s }); write({ type: 'steered', text: s }) }
            continue
          }
          break
        }
        rounds++
        // ⭐⭐ THE LAST-ROUND WARNING — the fix that PREVENTS the truncation rather than reporting it.
        //
        // After this round's tools run there is exactly one stream left before the cap breaks the loop
        // (see the `rounds >= maxRounds` check above, which fires at the TOP of the next iteration).
        // ⇒ tell her now, so that stream is an answer instead of more searching. In the measured failure
        // she used it to narrate another search, because nothing had told her it was her last.
        //
        // ⭐ Same mechanism as the existing continuation nudges: an ephemeral `user` message in the
        // working context, never persisted, so it cannot pollute the conversation or her memory.
        // ⛔ Bounded to ONCE per turn (`roundsWarned`) — a warning repeated every round is noise, and
        // this loop has already learned that lesson with `emptyNudges`.
        if (rounds >= maxRounds && !roundsWarned) {
          roundsWarned = true
          write({ type: 'status', phase: 'last_round', rounds, maxRounds,
            note: 'final tool round — asking for the answer now' })
          working.push({ role: 'user', content:
            '(this is your LAST round — no more tool calls will be executed after the results above. '
            + 'Write your final answer now, from what you already have. If you could not finish, say '
            + 'exactly what you completed and what you did not, rather than describing what you would do next.)' })
        }
        pushReasoning(turnReasoning) // this round's thinking, before the text/calls it led to
        pushText(turnAnswer) // the text the model wrote BEFORE these calls (may be empty)
        // record the assistant tool-call turn, then execute each tool and feed results back
        working.push({ role: 'assistant', content: turnAnswer, tool_calls: toolCalls })
        // ⭐ P5 · where this round's tool messages start, so the round's LAST one can carry the standing view.
        const roundToolsFrom = working.length
        let allDup = true
        for (const tc of toolCalls) {
          write({ type: 'tool_call', id: tc.id, name: tc.name, arguments: tc.arguments })
          const key = `${tc.name}:${JSON.stringify(tc.arguments ?? {})}`
          let resultStr
          if (executed.has(key)) {
            resultStr = executed.get(key) // repeat call — reuse, don't re-run
          } else {
            allDup = false
            // Interaction (runtime-generated narration, Streaming Semantics RFC): say what we're
            // DOING before the tool runs — a first-class role, visible live + recorded as a segment,
            // NEVER replayed (segments don't re-enter context). System-generated, so every model
            // narrates consistently. Narrate by LATENCY, not tool type: only user-visible slow work
            // (search/fetch) narrates; fast/mechanical/own-UI tools return null → nothing emitted.
            const ix = describeToolInteraction(tc.name)
            if (ix) emitInteraction(ix.icon, ix.text)
            // use_skill / read_skill_file are host-served (skills + their files live in OUR
            // db, not a component); they still emit tool.executed so the observer's tally
            // sees them like any tool.
            let result
            if (tc.name === 'use_skill' && invocableSkills.length) {
              const t0 = Date.now()
              const wanted = String(tc.arguments?.skill || '')
              if (!invocableSkills.some((s) => s.id === wanted)) {
                result = { error: `unknown skill "${wanted}"`, available: invocableSkills.map((s) => s.id) }
              } else {
                // resolveSkill IS the trace point (skill.used, caller attached) — a triggered
                // run counts exactly like a bound one.
                dynamicSkill = resolveSkill(wanted, { caller: { userId: ownerIdOf(request.user, 'this request') }, config: fastify.config })
                // ⭐⭐⭐ S1 · REASSEMBLE — the activated Skill's `allowed_tools` takes effect from the NEXT
                // round, because the round loop reads `toolDefs` on every `streamChat`. Same function,
                // same nine steps, same order as the bound path: the ONLY thing that changed is which
                // Skill is in force. ⭐ A Skill declaring no restriction resolves to every installed tool,
                // so this is a no-op for it — which is the property the unit test pins.
                // ⚠️ `modelCanWriteMemory` is reassigned deliberately: if the Skill's allowlist removes the
                // memory write tools, the model is no longer this turn's writer and the automatic capture
                // path must take over at the end of the turn. ONE-WRITER holds either way.
                const reassembled = assembleToolDefs({
                  skill: dynamicSkill,
                  toolsOn,
                  interactiveTurn,
                  invocableSkills,
                  oneShotAllowedTools: request.body?.allowedTools ?? null,
                  useMemory: settings.useMemory,
                  adviceDestinations,
                  path: 'triggered',
                })
                toolDefs = reassembled.defs
                modelCanWriteMemory = reassembled.modelCanWriteMemory
                toolsetTrace = reassembled.trace
                write({ type: 'status', phase: 'skill', skill: dynamicSkill.id, name: dynamicSkill.name, origin: dynamicSkill.origin, files: dynamicSkill.skillFiles.length, triggered: true, tools: toolDefs?.length ?? 0, constrained: Array.isArray(dynamicSkill.allowedComponents) })
                result = {
                  skill: dynamicSkill.id,
                  instructions: dynamicSkill.prompt,
                  files: dynamicSkill.skillFiles.map((f) => `${f.path} (${f.size} B${f.binary ? ', binary — not readable here' : ''})`),
                  note: dynamicSkill.skillFiles.length
                    ? 'Follow the instructions for the rest of this reply. Read bundled text files with read_skill_file when the instructions reference them.'
                    : 'Follow the instructions for the rest of this reply.',
                }
              }
              toolCtx.events?.emit?.('tool.executed', { name: tc.name, args: tc.arguments, ok: !result?.error, durationMs: Date.now() - t0, isReadOnly: true, caller: toolCtx.caller })
            } else if (tc.name === 'seek_advice') {
              // ══ ⭐⭐⭐ seek_advice — REACHING ANOTHER INTELLIGENCE ═══════════════════════════════════
              //
              // ⭐ The route knows the SERVICE and a MODE. It does not know that `/chat` or `/v1/runs`
              // exist, and it must never learn: everything Hermes-shaped lives in app/advice/hermes.js.
              // Ote, 2026-08-24: *"Nothing in the generic architecture should become Hermes-specific
              // because of what we discovered here."*
              //
              // ⛔ NOTHING BLOCKS HERE ON A DELEGATION. `reach()` returns a handle the moment the run is
              // accepted; a converse returns when the counterpart replies, because that is the interface
              // she owns her context on — a fact about the transport, not a shape for this loop.
              const t0 = Date.now()
              try {
                const advice = createAdviceService({ db: fastify.db, config: fastify.config, user: request.user })
                const check = String(tc.arguments?.check || '').trim()
                const steerId = String(tc.arguments?.steer || '').trim()
                // ⭐⭐ STEER IS ITS OWN ACT AND IS TRIED FIRST. ⛔ It is NOT a variant of `check`: `check`
                // may COLLECT — it is her act of receiving — and a steer must never receive anything.
                // ⛔ The route still knows only the service and an intent; it does not learn that an
                // endpoint called `/steer` exists.
                if (steerId) {
                  result = await advice.steer(steerId,
                    typeof tc.arguments?.message === 'string' ? tc.arguments.message : '')
                } else if (check) {
                  result = await advice.observe(check)
                } else {
                  const mode = tc.arguments?.mode === 'delegate' ? 'delegate' : 'converse'
                  result = await advice.reach({
                    destination: String(tc.arguments?.destination || '').trim(),
                    mode,
                    message: typeof tc.arguments?.message === 'string' ? tc.arguments.message : null,
                    brief: typeof tc.arguments?.brief === 'string' ? tc.arguments.brief : null,
                    conversationId: convo.id,
                  })
                  // ⭐ A pending delegation is a SUCCESS with no answer. Say so plainly so she does not
                  // read the absence of a reply as a failure and ask again immediately.
                  if (result?.ok && result.state === 'pending') {
                    result.note = 'Accepted. They are working on it — this is not an answer yet. '
                      + 'Come back to it later with check="' + result.exchangeId + '".'
                  }
                }
              } catch (e) {
                // ⛔ An outbound failure is a reported outcome, never a thrown turn.
                result = { ok: false, reason: String(e?.message || e).slice(0, 300) }
              }
              toolCtx.events?.emit?.('tool.executed', { name: tc.name, args: tc.arguments, ok: !!result?.ok, durationMs: Date.now() - t0, isReadOnly: false, caller: toolCtx.caller })
            } else if (tc.name === 'list_decisions') {
              // ⭐ ONE SELECT, ONE ENTITY, ONE OWNER. The projection is spelled out field by field so a
              // column added to txn_memories later cannot start riding along — the allowlist failure this
              // repo has hit twelve times, in the direction where it leaks rather than drops.
              const t0 = Date.now()
              try {
                const want = String(tc.arguments?.status || '').trim().toLowerCase()
                const seq = fastify.db.txn_memories.sequelize
                const { tableName, schema } = fastify.db.txn_memories.getTableName()
                const MEM = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`
                const rows = await seq.query(
                  `SELECT attribute AS key, value AS status, content AS decision,
                          source, evidence, valid_at
                     FROM ${MEM}
                    WHERE entity = 'project-decision' AND user_id = :uid
                      AND invalid_at IS NULL AND expired_at IS NULL
                      ${want ? 'AND lower(value) = :want' : ''}
                    ORDER BY value, attribute`,
                  { type: seq.QueryTypes.SELECT, replacements: { uid: request.user.id, want } })
                result = {
                  decisions: rows.map((r) => ({
                    key: r.key,
                    status: r.status,
                    decision: r.decision,
                    decidedOn: r.evidence?.decidedOn ?? (r.valid_at ? String(r.valid_at).slice(0, 10) : null),
                    // ⭐ THE PROVENANCE COMES BACK WITH THE RECORD — reference plus the verbatim quote it
                    // was verified against, so a citation she repeats is one a reader can resolve.
                    source: r.source ?? null,
                    sourceQuote: r.evidence?.quote ?? null,
                    sourcePath: r.evidence?.path ?? null,
                    sourceCommit: r.evidence?.commit ?? null,
                  })),
                  count: rows.length,
                  // ⛔ THE QUANTIFIER, for the same reason `readCoverage` exists: an empty enumeration is a
                  // fact about the RECORD, never about the world, and it has been narrated as the latter
                  // before. Say which it is, in the payload, so it does not depend on her framing.
                  coverage: want
                    ? `every recorded project decision with status "${want}" in this room`
                    : 'every recorded project decision in this room — this is the complete list',
                  note: rows.length === 0
                    ? 'No project decision is recorded. That means none was written down, not that the matter is undecided.'
                    : 'Each record carries the source it was verified against. Quote the source reference as given; do not reconstruct it.',
                }
              } catch (e) {
                result = { error: `list_decisions failed: ${e.message}` }
              }
              toolCtx.events?.emit?.('tool.executed', { name: tc.name, args: tc.arguments, ok: !result?.error, durationMs: Date.now() - t0, isReadOnly: true, caller: toolCtx.caller })
            } else if (tc.name === 'read_skill_file' && (activeSkill || dynamicSkill)) {
              const t0 = Date.now()
              result = await readSkillFile(fastify, (activeSkill || dynamicSkill).name, tc.arguments?.path)
              toolCtx.events?.emit?.('tool.executed', { name: tc.name, args: tc.arguments, ok: !result?.error, durationMs: Date.now() - t0, isReadOnly: true, caller: toolCtx.caller })
            } else if (tc.name === 'set_display_name') {
              // Profile write (native — see the tool def above). TWO-PHASE: the first call (no confirm)
              // returns needs_confirmation and writes NOTHING; only { confirm:true } applies it, so a
              // rename can't happen without the user's yes. A successful write reflects on the NEXT turn
              // (request.user is loaded fresh each request) — the confirm→set→greet flow.
              const t0 = Date.now()
              // turnId = request.id: unique per HTTP request, and a HELD turn (ask_user) keeps the same
              // request alive — which is exactly the semantics the consent check needs, since a resumed
              // turn genuinely did hear from the user.
              result = await setDisplayName(fastify, request.user, tc.arguments?.name, {
                confirm: tc.arguments?.confirm === true,
                turnId: request.id ?? null,
                conversationId: convo.id,
              })
              const wrote = result?.ok === true && !!result?.displayName
              // Push the rename to the user's OPEN pages (Ote's ask): the account display name is the
              // identity shown in the sidebar profile, and it used to sit stale there until a reload —
              // the model would say "Done, I'll call you Kestrel" while the corner still read the old
              // name. Same channel the todo rail and title updates use. Only on an actual WRITE, so the
              // first (needs_confirmation) call never moves the UI.
              if (wrote) notifyChatEvent(ownerIdOf(request.user, 'this request'), { type: 'profile-changed', displayName: result.displayName })
              toolCtx.events?.emit?.('tool.executed', { name: tc.name, args: tc.arguments, ok: result?.ok !== false, durationMs: Date.now() - t0, isReadOnly: !wrote, caller: toolCtx.caller })
            } else if (tc.name === 'remember_person') {
              // Native, for the same reason set_display_name is: it writes an identity record, and the
              // consent gate belongs in the service rather than in a prompt. TWO-PHASE — the first call
              // creates nothing and reports any name collision so she can ASK instead of assuming.
              // `turnId = request.id` is what makes the gate real: a held turn (ask_user) keeps the same
              // request alive, so a resumed turn genuinely did hear from the user, while a propose+
              // confirm inside one reply shares a turnId and is refused.
              const t0 = Date.now()
              result = await proposePerson(fastify, request.user, tc.arguments?.name, {
                confirm: tc.arguments?.confirm === true,
                origin: tc.arguments?.note || null,
                turnId: request.id ?? null,
              })
              const wrotePerson = result?.ok === true && !!result?.person?.id
              toolCtx.events?.emit?.('tool.executed', { name: tc.name, args: tc.arguments, ok: result?.ok !== false, durationMs: Date.now() - t0, isReadOnly: !wrotePerson, caller: toolCtx.caller })
            } else if (tc.name === 'remember_fact' && tc.arguments?.subject) {
              // A `subject` must name a person that EXISTS. Checked here, before the write is queued,
              // because reconcileFactAsync returns immediately and runs in a background lane — an
              // invalid id would otherwise surface as a foreign-key error nobody sees, and the model
              // would be told the write succeeded.
              // ⚠️ NO NAME MATCHING, NO CREATION. An unknown id is refused and she is told to use
              // remember_person; the one thing that must never happen here is a person appearing
              // because a fact mentioned one.
              const person = fastify.db?.mst_persons
                ? await fastify.db.mst_persons.findByPk(tc.arguments.subject, { attributes: ['id', 'display_name'] }).catch(() => null)
                : null
              if (!person) {
                result = {
                  ok: false,
                  reason: 'unknown_subject',
                  message: `No person exists with id "${tc.arguments.subject}". Create them with remember_person first (two steps: propose, ask, confirm), then use the id it returns. Do not invent an id, and do not guess at an existing one.`,
                }
              } else {
                result = await runTool(tc.name, tc.arguments, toolCtx)
              }
            } else {
              result = await runTool(tc.name, tc.arguments, toolCtx)
            }
            resultStr = typeof result === 'string' ? result : JSON.stringify(result)
            executed.set(key, resultStr)
          }
          const clipped = resultStr.length > 4000 ? resultStr.slice(0, 4000) + '…' : resultStr
          write({ type: 'tool_result', id: tc.id, name: tc.name, result: clipped })
          toolActivity.push({ id: tc.id, name: tc.name, args: tc.arguments, result: clipped })
          textSinceLastTool = false // the model now owes the user a conclusion
          segments.push({ type: 'tool', id: tc.id, name: tc.name, args: tc.arguments, result: clipped })
          // Growth guard, model-facing copy: one huge tool result can blow the window
          // mid-turn (the start-of-turn guard only sees the initial prompt). Cap a single
          // result at ~25% of the local window (chars ≈ tokens×4, so the char cap equals
          // ctxWindow numerically), with an absolute backstop for remote models where
          // verbatim tokens are money. The clip is VISIBLE to the model, never silent.
          const maxResultChars = ctxWindow > 0 ? Math.max(8_000, ctxWindow) : 120_000
          const forModelRaw = resultStr.length > maxResultChars
            ? resultStr.slice(0, maxResultChars) + `\n…[tool result clipped: ${resultStr.length - maxResultChars} of ${resultStr.length} characters dropped — too large for the context window]`
            : resultStr
          // ── ⭐⭐ LEAK 1 · THE TOOL-RESULT VOCABULARY PROJECTION ──────────────────────────────────────
          //
          // Measured over five live runs: the cognition block was clean every time and she still answered
          // in our words — *"my memory stores are scoped to this room"*, *"reachability, not absence"*,
          // *"conversationHandle: a9ce46…"*. ⇒ the block does not outvote the tool payload; `recall_memory`
          // said "0 in this room" and that framing won.
          //
          // Ote: *"solve that at the interface between the cognition layer and the tools, not by adding
          // another L1 instruction telling her not to say 'room'."*
          //
          // ⛔⛔ AND IT IS NOT THE FIX FOR THE FALSE CLAIM, which Ote named before it could be mistaken for
          // one: *"I also don't want this solved by simply hiding tool output. The underlying ownership
          // model needs to be correct first."* This changes the WORDS she is handed. The reason she believes
          // she cannot reach her own memory is that the system currently makes that true room-by-room, and
          // only the ownership model fixes that. ⇒ two leaks, two levels, and this is the smaller one.
          //
          // ⛔ ONLY THE MODEL-FACING COPY. `write()`, `toolActivity`, `segments` and the audit trail keep the
          // RAW payload — that is the evidence. ⛔ And it suppresses nothing: she may call any tool as often
          // as she likes. V3 gave the best answer of the five while calling the MOST tools.
          // ── ⭐⭐⭐ C2 · THE RESULT ENTERS THE HOLD AS EVIDENCE, THEN GOES TO THE MODEL BESIDE IT ─────
          //
          // Ote: *"The tool result should no longer compete with the cognition block as a second source of
          // truth. It should become evidence that cognition can inspect, reconcile, question, and incorporate
          // into working memory. If the tool says 'nothing in X', that remains a fact about X — it must not
          // silently become 'nothing exists.'"*
          //
          // ⛔ RETRIEVAL IS UNTOUCHED. She called whatever she called, it ran, and the raw result is intact
          // in `write()`, `toolActivity`, `segments` and the audit. What changes is only the framing of the
          // MODEL-FACING copy: it now arrives with its own scope AND its relation to what she already holds.
          // ⛔ And no tool is suppressed, delayed or counted — *"do not optimize for fewer tool calls."*
          // ⛔ MEMORY READS ONLY. `populationOf` returns null for anything whose population cannot be named
          // in her words — a web search, a todo write, `inspect_around`. Admitting those as evidence ABOUT
          // HER MEMORY would be a category error, and it produced one in testing: a web search came back
          // saying *"that does not change the five things I can already reach"*.
          // ⓘ They are still real evidence in the ordinary sense; they simply are not looks into her memory,
          // which is the only thing this hold reconciles.
          const population = populationOf(tc.name)
          if (population && cognitiveHold && !cognitiveHold.disposed) {
            try {
              cognitiveHold.observe({ tool: tc.name, scope: population, about: queryOf(tc.arguments),
                found: countFromToolResult(forModelRaw) })
            } catch { /* the hold is framing plus observability; it must never break a turn */ }
          }
          const holdingNow = cognitiveHold && !cognitiveHold.disposed
            ? { recollections: cognitiveHold.snapshot().counts?.recollection ?? 0,
              openQuestions: cognitiveHold.snapshot().openQuestions ?? 0,
              // ⭐ THE POPULATION NO MEMORY READ OBSERVED. Relayed verbatim; see `relateToHold`.
              continuity: holdContinuity }
            : null
          const forModel = evidenceForModel(tc.name, forModelRaw, {
            enabled: fastify.config?.memory?.cognitionEnabled === true,
            holding: holdingNow,
            // ⚠️ A TERM LIST CATCHES ONLY WHAT IT WAS TOLD ABOUT — this repo's most-repeated defect. The
            // residue is LOGGED rather than assumed to be zero, so the next word we missed leaves a trail.
            onLeak: (words) => fastify.log?.debug?.({ tool: tc.name, words }, "[cognition] tool vocabulary residue"),
            // ⭐ STEP A: the arguments are passed so the scope sentence can name WHAT was looked for.
            args: tc.arguments ?? tc.function?.arguments ?? null,
          })
          // ⓘ OBSERVABILITY ON THE MODEL-FACING COPY, and it was MISSING — which is why the first C2 run
          // could not be read. `segments` and the audit keep the RAW payload by design, so nothing recorded
          // what she was actually handed. ⛔ A change to what she reads that cannot be observed is a change
          // that cannot be attributed.
          if (fastify.config?.memory?.cognitionDebug === true) {
            try {
              const { appendFileSync } = await import('node:fs')
              appendFileSync(new URL('../../../../cognition-debug.log', import.meta.url), `${JSON.stringify({
                at: new Date().toISOString(), conversationId: convo.id, toolEvidence: tc.name,
                population: population ?? null,
                held: holdingNow,
                // ⚠️ WAS TRUNCATED AT 600 CHARS, AND THAT MADE THE RECORD UNPARSEABLE. Analysing which
                // identifier-valued fields actually reach her needed the payload's SHAPE, and a truncated
                // JSON string cannot be parsed at all — so the first pass had to regex the text and could
                // report field names without their paths. ⓘ A generous cap, with the real length beside it,
                // so a truncation is visible rather than silent.
                forModelChars: String(forModel).length,
                forModel: String(forModel).slice(0, 20000),
              })}
`)
            } catch { /* observability must never break a turn */ }
          }
          working.push({ role: 'tool', tool_call_id: tc.id, name: tc.name, content: forModel })
        }
        // Mid-turn overflow surface: tool results just grew the working context. If the
        // estimate now exceeds the window, tell the user (same signal as the start-of-turn
        // guard — Ollama would otherwise truncate the oldest content SILENTLY). Once per turn.
        if (ctxWindow > 0 && !contextOverflow) {
          const estimate = estTok(working)
          if (estimate > ctxWindow) {
            contextOverflow = { estimate, window: ctxWindow, midTurn: true }
            write({ type: 'status', phase: 'context_overflow', estimate, window: ctxWindow, midTurn: true })
            request.log?.warn?.(`[ctx] working context grew to ~${estimate} tokens mid-turn, past the ${ctxWindow}-token window (${providerName}/${modelName}) — tool results pushed the oldest content out`)
          }
        }
        if (allDup) {
          // The model repeated calls it already made (results are cached + in context).
          // Breaking outright kills mid-task chains (seen live: repeat of step 1, then
          // the turn died before step 2) — nudge it forward instead, bounded.
          if (emptyNudges < 2) {
            emptyNudges++
            write({ type: 'status', phase: 'agent_continue', note: 'model repeated a tool call — nudging it forward' })
            working.push({ role: 'user', content: '(you already called that tool with those arguments — the result is above. Use it: make the NEXT call if steps remain, or give your final answer. Do not repeat the same call.)' })
            continue
          }
          break
        }
        // ── ⭐⭐⭐ P5 · RE-ENTRANT COGNITION · the round's LAST tool message carries the standing view ───
        //
        // ⚠️⚠️ THE DEFECT IS POSITION. The cognition block is in the system message and a tool result is the
        // last message before generation, so cognition RECEDES MONOTONICALLY as she investigates — ~3
        // messages back at one tool call, ~10 at five. ⇒ the structure PENALISED INVESTIGATION, which
        // contradicts *"depth is hers"* where no prompt instruction can reach. Measured: `assertsAbsence`
        // 5/8 with tools vs 1/8 without, on the same block. ⛔ Not persuasion — position.
        //
        // ⭐ Ote: *"every investigation round should admit the raw result into the turn-scoped cognitive
        // hold, re-run cognition, and place the resulting reconciled view at the last defensible
        // pre-generation position… Keep raw tool results untouched in the stream/segments/audit. The
        // cognitive rendering is only the model-facing representation."*
        //
        // ⛔ NO RE-RETRIEVAL. Re-render only, from the hold — retrieving again per round would be new
        // evidence nobody asked for, and could make two rounds of the SAME turn contradict each other.
        // ⛔ NO NEW MESSAGE. Every role is wrong for a reconciliation: `user` reads as the person speaking
        // (the Leak-2 failure exactly), `assistant` puts words in her mouth AND enters her own history, and
        // a mid-conversation `system` message is provider-dependent. The round's last tool message is the
        // only slot at position n−1 with a defensible owner — see `memory-working-render.js`.
        // ⛔ NOTHING RAW CHANGES: `write()`, `toolActivity`, `segments` and the audit already have the real
        // payload, and this appends to the model-facing copy only.
        if (reentrantCognition && cognitiveHold && !cognitiveHold.disposed) {
          try {
            const lastTool = working.length - 1
            // ⚠️ Only if this round actually appended a tool message. A round that appended none (every call
            // a duplicate) has nowhere to put this, and must not get a message of its own.
            if (lastTool >= roundToolsFrom && working[lastTool]?.role === 'tool') {
              const rendered = renderHolding(cognitiveHold.forReasoning(), { subject: holdSubject })
              if (rendered && rendered.text === lastStanding) {
                // ⛔ Nothing changed in what she holds ⇒ nothing to say again. Logged, because a silence
                // that cannot be told from a failure is not observability.
                if (fastify.config?.memory?.cognitionDebug === true) {
                  const { appendFileSync } = await import('node:fs')
                  appendFileSync(new URL('../../../../cognition-debug.log', import.meta.url), `${JSON.stringify({
                    at: new Date().toISOString(), conversationId: convo.id, standingView: rounds,
                    skipped: 'unchanged since the previous round',
                  })}
`)
                }
              } else if (rendered) {
                lastStanding = rendered.text
                working[lastTool].content = withStandingView(working[lastTool].content, rendered)
                // ⛔ THE INVARIANT, CHECKED IN PRODUCTION. P5 makes the hold more central, which makes C1's
                // guards MORE load-bearing: every re-render is another chance for something to be marked
                // retained. A violation is logged loudly rather than swallowed.
                const bad = cognitiveHold.violations()
                if (bad.length) request.log?.warn?.({ bad }, '[cognition] working memory invariant violated')
                if (rendered.leaks.length) {
                  // ⚠️ A term list catches only what it was told about. This is the THIRD surface that
                  // produces a cognition rendering, so its residue is logged rather than assumed to be zero.
                  fastify.log?.debug?.({ words: rendered.leaks }, '[cognition] standing-view vocabulary residue')
                }
                if (fastify.config?.memory?.cognitionDebug === true) {
                  const { appendFileSync } = await import('node:fs')
                  appendFileSync(new URL('../../../../cognition-debug.log', import.meta.url), `${JSON.stringify({
                    at: new Date().toISOString(), conversationId: convo.id, standingView: rounds,
                    subject: holdSubject, ...standingSnapshot(rendered), text: rendered.text,
                    // ⭐ TRUE BY CONSTRUCTION, not asserted by hand: this runs AFTER the duplicate-call
                    // nudge, which is the only thing that could append a message behind it, and that path
                    // `continue`s before reaching here.
                    attachedIndex: lastTool, workingLength: working.length,
                    toolMessagesThisRound: working.length - roundToolsFrom,
                  })}
`)
                }
              }
            }
          } catch (e) {
            // ⛔ FAILS SILENT AND FAILS OFF. The standing view is framing; a turn must never die for it.
            fastify.log?.debug?.({ err: e?.message }, '[cognition] standing view failed (non-fatal)')
          }
        }
      }

      // FORCE A CLOSING ANSWER when the model did work and then went silent.
      //
      // This used to fire only when `answer` was COMPLETELY empty, which missed the shape Ote actually hit
      // (chat 66d05f01): the model writes a preamble — "I'll dig deeper into X. Let me search more thoroughly."
      // — then calls search_web, search_web, fetch_url_content, thinks, and STOPS. `answer` is non-empty, so
      // nothing forced a conclusion, and the turn rendered as a preamble plus tool chips with a dangling
      // Thought and no result. From the user's side that is indistinguishable from "it ignored what I asked":
      // it did the research and never reported back.
      //
      // So the condition is now "has the model SPOKEN SINCE ITS LAST TOOL CALL?", not "did it speak at all".
      const wentSilentAfterTools = rounds > 0 && !textSinceLastTool
      if (!clientGone && rounds > 0 && (answer.trim() === '' || wentSilentAfterTools)) {
        if (wentSilentAfterTools && answer.trim() !== '') {
          request.log?.info?.({ conversation: convo.id, toolRounds: toolActivity.length }, '[chat] model ran tools then went silent — forcing a closing answer')
        }
        let forced = ''
        let forcedReasoning = ''
        // The forced closing answer is its own round — it follows tool output, so its text must start a new
        // block rather than fusing onto whatever the last round left behind.
        roundWroteText = false
        const forcedTtftMs = ttftBudget(working) // same context-adaptive budget as the main loop
        for await (const evt of watchFirstToken(streamChat({
          serverConfig: fastify.config,
          request: { provider: providerName, model: modelName, messages: working, options, userId: ownerIdOf(request.user, 'this request'), conversationId: convo.id },
        }), forcedTtftMs, () => clientGone || steerReg.hasPending(convo.id))) {
          if (clientGone) break
          if (evt.event === 'aborted_before_token') break // Stop/steer landed during a stall
          if (evt.event === 'token') { if (!firstTokenAt) firstTokenAt = Date.now(); forced += evt.data.text; appendAnswer(evt.data.text); write({ type: 'token', text: evt.data.text }) }
          else if (evt.event === 'reasoning') { reasoning += evt.data.text; forcedReasoning += evt.data.text; write({ type: 'reasoning', text: evt.data.text }) }
          else if (evt.event === 'first_token_timeout') {
            const secs = Math.round(forcedTtftMs / 1000)
            const line = wakeOteLine(secs)
            forced += line; appendAnswer(line)
            write({ type: 'token', text: line })
            genError = { code: 'first_token_timeout', message: `no first token within ${secs}s — the model may be stuck loading; try again, or pick another model` }
            write({ type: 'error', code: genError.code, message: genError.message })
          }
          else if (evt.event === 'done') {
            if (evt.data?.usage) usage = mergeUsage(usage, evt.data.usage)
            if (evt.data?.finishReason) finishReason = evt.data.finishReason
          }
        }
        pushReasoning(forcedReasoning)
        pushText(forced)
      }
    } catch (e) {
      genError = { code: e instanceof GatewayError ? e.code : 'internal', message: e?.message || 'error' }
      write({ type: 'error', code: genError.code, message: genError.message })
    }

    const stopped = clientGone

    // FALLBACK-ONLY CAPTURE (Ote's ruling: "keep one-writer as the long-term invariant, with the
    // fallback-only capture path"). ONE-WRITER stays the rule; this closes the gap the rule left open.
    //
    // THE GAP: holding write tools is not the same as USING them. Capture depended on the model electing
    // to call remember_fact, so identical code lost passing mentions in one soak and caught them in the
    // next — a known limitation, not a mystery.
    //
    // WHY THIS IS NOT THE 2026-07-24 RACE: that attempt let BOTH writers run and leaned on the store's
    // dedup, and they raced — each reconciled against a store not yet holding the other's write, so a fact
    // landed twice under different phrasings and the semantic slot-reconcile (which only collapses against
    // an EXISTING slot) sailed past it. This runs only when the model wrote NOTHING, so the two writers are
    // mutually exclusive BY CONSTRUCTION rather than by dedup — there is no window in which both are live.
    // Soft steering is preserved (Ote's rule): the model is still nudged and never forced, and when it does
    // act it remains the sole writer. Off the hot path, after the reply is complete.
    // Count the turn's WRITER before acting on it, so "the model cooperated" and "the net caught it" are two
    // measured numbers rather than one inferred narrative (principle #14).
    const memoryEligible = settings.useMemory && modelCanWriteMemory && !stopped && lastUserText.length >= 12
    const modelWroteMemory = toolActivity.some((t) => MEMORY_WRITE_TOOLS.has(t.name))
    if (memoryEligible) recordTurn({ modelWrote: modelWroteMemory, fallbackRan: !modelWroteMemory })
    if (memoryEligible && !modelWroteMemory) {
      // INFO, not debug, on purpose: this fires only when the model DECLINED to write, so it is both rare and
      // the exact signal for a question the observe phase actually needs — how often does the model decline?
      // At debug level the answer is invisible (the server logs at info), which is how capture sparsity stayed
      // a guess across three soaks.
      //
      // AND LOG THE OUTCOME, not just the attempt. Capture sparsity has (at least) TWO independent causes and
      // they were indistinguishable because this return value used to be discarded:
      //   (a) the model declined to call remember_fact  → what the fallback exists to cover
      //   (b) the EXTRACTOR itself returned nothing      → measured: the same sentence yielded a fact on some
      //       runs and NOTHING on others, so the fallback can fire and still capture zero
      // "attempted" and "captured 0" must be separable, or (b) hides inside (a) forever.
      request.log?.info?.({ conversation: convo.id, toolRounds: toolActivity.length }, '[memory] fallback capture — the model held write tools but wrote nothing this turn')
      captureFacts(fastify, { userId: ownerIdOf(request.user, 'this request'), sourceMessageId: lastUserMsg?.id ?? null }, lastUserText, { source: `conversation:${convo.id}` })
        .then((r) => {
          recordCapture({ facts: r?.facts ?? 0, error: !!r?.error, viaFallback: true })
          request.log?.info?.({ conversation: convo.id, facts: r?.facts ?? 0, actions: r?.actions ?? null, skipped: r?.skipped ?? false, error: r?.error ?? false }, '[memory] fallback capture result')
        })
        .catch(() => {})
    }

    // Output-cap surfacing (Ote's "ZAI times out" report — it wasn't a timeout): the provider
    // hit its output-token cap ('length'/'max_tokens') and the whole budget went to the thinking
    // channel, leaving an EMPTY answer. Bare "(no response)" reads as a hang; say what happened
    // so the user can raise max_tokens (⚙) or lower thinking effort. Same surfacing shape as
    // contextOverflow (rides in metrics → stats line + the empty-body note).
    const CAPPED_FINISH = new Set(['length', 'max_tokens'])
    const outputCapped = (!genError && !stopped && answer.trim() === '' && CAPPED_FINISH.has(finishReason))
      ? { completionTokens: usage?.completionTokens ?? null, hadReasoning: reasoning.trim() !== '' }
      : null

    // BLANK REPLY on a CLEAN finish — the remaining silent hole. `outputCapped` only covers a CAPPED
    // finishReason; when a provider finishes normally having emitted NOTHING, every signal stayed quiet: no
    // error event, no flag, an empty assistant row persisted, and the user saw a blank bubble with no
    // explanation. It also silently corrupts evaluation — a soak harness waiting for "the next assistant
    // message" gets an empty one and every later answer shifts by a turn, so the data after it is suspect.
    // Surfacing it costs nothing and makes an invisible failure visible in the UI, the row, and the log.
    const blankReply = (!genError && !stopped && !outputCapped && answer.trim() === '')
      ? {
        finishReason: finishReason ?? null,
        hadReasoning: reasoning.trim() !== '',
        completionTokens: usage?.completionTokens ?? null,
        toolRounds: toolActivity.length,
      }
      : null
    if (blankReply) {
      request.log?.warn?.({ ...blankReply, provider: providerName, model: modelId, conversation: convo.id }, '[chat] BLANK REPLY — the provider finished cleanly but emitted no content')
      write({ type: 'error', code: 'blank_reply', message: 'The model finished without producing a reply. Nothing was generated — try again, or switch model.' })
    }

    // scrub trailing template-token debris off the full reply (the persisted truth —
    // segments were scrubbed at push time; the live stream may have shown the junk briefly)
    answer = scrubToolCallText(scrubTemplateTail(answer))

    // response metrics (wall-clock; works across all providers)
    const endedAt = Date.now()
    const completionTokens = usage?.completionTokens ?? null
    const genMs = firstTokenAt ? Math.max(1, endedAt - firstTokenAt) : null
    // Composer selection telemetry (soak instrumentation) — a compact per-turn record of which
    // providers contributed vs were dropped, plus each candidate's utility + token cost, stashed on the
    // message so it's queryable for tuning (aggregate with test/checks/composer-metrics.mjs). Answers:
    // how often does each provider contribute? how often are candidates dropped (and why)? are the
    // utility weights well-ordered (are high-utility items being dropped / low-utility ones kept)?
    // Gated by memory.composerTelemetry (default ON); best-effort — never affects the reply.
    let contextTelemetry
    try {
      if (typeof sel !== 'undefined' && getSetting(fastify.config, 'memory.composerTelemetry') !== false) {
        const r3 = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n) * 1000) / 1000 : null)
        contextTelemetry = {
          budget: { available: sel.budget?.available ?? null, used: sel.budget?.used ?? 0 },
          exceeded: sel.budgetExceeded || undefined,
          // one row per candidate: section, provider, utility, est-tokens, kept?(1/0), drop reason
          items: [
            ...sel.kept.map((k) => ({ s: k.section, p: k.provider, u: r3(k._score?.utility), tok: k._tok, kept: 1 })),
            ...sel.dropped.map((d) => ({ s: d.section, p: d.provider, u: r3(d._score?.utility), tok: d._tok, kept: 0, why: d._reason })),
          ],
        }
      }
    } catch { /* telemetry is best-effort — never affects the turn */ }
    // ⭐ WAS THE TURN CUT SHORT WITH NOTHING TO SHOW? Declared HERE, before `metrics` reads it — the
    // first version declared it beside `turnError` fifty lines lower and produced a temporal-dead-zone
    // ReferenceError that the module still PARSED. ⚠️ A const used above its declaration is a runtime
    // fault a syntax check cannot see, which is why the tests below execute the path rather than read it.
    // ⓘ The 200-character threshold is deliberately crude and is a heuristic, named as one: a reply that
    // short after a FULL tool budget is not an answer to a multi-stage job. The unconditional signal is
    // the `rounds_exhausted` status; this only decides whether the ROW is stamped as an error.
    const roundsTruncated = roundsExhausted && (answer.trim().length < 200)
    // ⭐⭐ THE ARTEFACT VERDICT, RECORDED FOR EVERY TURN A DECLARING SKILL RAN — pass, fail, truncated or
    // nudged. ⓘ "7 of 7 present" is a result; a check that only speaks on failure cannot tell a satisfied
    // Skill from a Skill nobody checked. ⛔ Deterministic substring test, no model, no judgement.
    {
      const sk = activeSkill || dynamicSkill
      const declared = sk?.agentSkill?.metadata?.['required-artefacts']
      const required = Array.isArray(declared) ? declared.filter((x) => typeof x === 'string' && x.trim()) : []
      if (required.length) {
        const missing = required.filter((r) => !answer.includes(r))
        artefactCheck = { skill: sk.id, required: required.length, missing, satisfied: missing.length === 0,
          nudged: artefactNudges > 0 }
      }
    }
    const metrics = {
      generatedAt: endedAt, // when the reply finished (epoch ms) — shown in the stats line so a
      // user can check WHEN a reply (incl. a scheduled run's) landed; survives reload (stored)
      latencyMs: endedAt - startedAt,
      ttftMs: firstTokenAt ? firstTokenAt - startedAt : null,
      tokensPerSec: (completionTokens && genMs) ? Math.round((completionTokens / (genMs / 1000)) * 10) / 10 : null,
      promptTokens: usage?.promptTokens ?? null,
      completionTokens,
      stopped: stopped || undefined,
      // prompt exceeded the model's context window — the reply may have "read" only part
      contextOverflow: contextOverflow || undefined,
      // provider hit its output-token cap with nothing left for the answer (budget spent
      // in the thinking channel) — surfaced so an empty reply isn't mistaken for a hang
      outputCapped: outputCapped || undefined,
      // a clean finish that produced nothing (rides in metrics → stats line + the empty-body note)
      blankReply: blankReply || undefined,
      // ⭐ so the stats line and a reload both show that the turn was cut short, not merely brief
      roundsExhausted: roundsExhausted ? { rounds, maxRounds, truncated: roundsTruncated } : undefined,
      // ⭐ the artefact verdict, so a reload and the stats line both show whether the Skill's declared
      // output shape actually appeared — and so it can be measured over many runs rather than eyeballed
      skillArtefacts: artefactCheck || undefined,
      // ⭐⭐ S1 · WHAT SHE COULD ACTUALLY REACH THIS TURN. Recorded because a Skill's `allowed_tools` is
      // otherwise unobservable after the fact: the toolset is assembled per turn, sent to the provider,
      // and thrown away. `path` says which assembly produced it — `none` (no Skill), `bound`, or
      // ⭐ `triggered`, the case that was silently unconstrained before S1. `constrained` is whether the
      // Skill declared an allowlist at all, so an unconstrained Skill is distinguishable from no Skill.
      // ⓘ It is a COUNT and two labels — no tool names, nothing about content.
      toolset: toolsetTrace || undefined,
      // context caching: prefill wall-clock (Ollama — ~0ms on a big prompt = the runner's
      // prefix cache hit) and provider-reported cached/cache-written input tokens (remote)
      promptEvalMs: usage?.promptEvalMs ?? undefined,
      cachedTokens: usage?.cachedTokens ?? undefined,
      cacheWriteTokens: usage?.cacheWriteTokens ?? undefined,
    }
    if (contextTelemetry) metrics.context = contextTelemetry // composer selection stats (soak telemetry)

    // Persist the interleaved weave when the reply has structure beyond a single answer:
    // tool calls (as before) OR a steer folded in mid-turn — so both survive a reload.
    const structuredSegments = (toolActivity.length || segments.some((s) => s.type === 'steer' || s.type === 'draft')) ? segments : null

    // Persist + finalize. In stream mode this runs AFTER the SSE headers are already
    // sent, so any throw here must NOT escape — Fastify's error handler would try to
    // re-send headers (ERR_HTTP_HEADERS_SENT) and crash the whole process. The realistic
    // trigger is the conversation being deleted mid-stream (FK violation on the insert).
    // A turn that produced LITERALLY NOTHING is not a partial. Persisting partials is deliberate — Stop
    // must keep what streamed — but content '', no reasoning, no tools and no error is a non-event, and
    // it is indistinguishable from a real turn once written. Stamp it so the row says what it is: the UI
    // can render "no reply" instead of a blank bubble, and `error IS NULL` stops meaning two things.
    // ⚠️ Deliberately NOT skipping the insert: the row is the evidence that the turn happened at all, and
    // downstream finalisation depends on `saved`. Naming the state is the smaller, safer fix.
    const producedNothing = !String(answer || '').trim() && !String(reasoning || '').trim()
      && !toolActivity.length && !structuredSegments
    const turnError = genError
      || (roundsTruncated
        ? `the tool-round budget (${maxRounds}) ran out before an answer was written — raise chat.toolsMaxCalls or narrow the request`
        : null)
      || (producedNothing
        ? 'no output was produced — the client disconnected before the first token, or generation ended empty'
        : null)

    try {
      // persist the assistant message (even partial, so Stop keeps what streamed)
      const saved = await fastify.db.txn_messages.create({
        conversation_id: convo.id, role: 'assistant', content: answer, reasoning: reasoning || null,
        provider: providerName, model: modelId,
        prompt_tokens: usage?.promptTokens ?? null, completion_tokens: usage?.completionTokens ?? null,
        tool_calls: toolActivity.length ? toolActivity : null, // 🔧 blocks survive reloads
        segments: structuredSegments, // interleaved weave (plain text-only replies don't need it)
        metrics,
        error: turnError, // why the turn failed (blank reply / no output at all) — survives reload
        // "ran as X" trace — bound OR model-triggered (use_skill) alike
        skill: (activeSkill || dynamicSkill) ? { id: (activeSkill || dynamicSkill).id, name: (activeSkill || dynamicSkill).name } : null,
      })

      // Naming a NEW chat is a whole extra model round-trip (generateTitle). In STREAM mode we
      // must NOT block the `done` event on it: the client only clears its "generating" state
      // when the SSE stream CLOSES (right after `done`), so blocking `done` on the title call
      // left the reply fully rendered while the composer still showed Stop/Steer for a beat
      // (Ote's report). So: name INLINE only for non-stream callers (scheduled/marathon/internal
      // — no live spinner to free); STREAM mode closes first, then names in the background and
      // pushes the title in (below). `generateTitle` never throws — it always resolves a title.
      const isNewChat = convo.title === 'New chat'
      const nameNewChat = async () => {
        const firstUser = history.find((m) => m.role === 'user')
        const t = await generateTitle(firstUser?.content || '', answer, titleModelId, ownerIdOf(request.user, 'this request'))
        if (t && t !== convo.title) await fastify.db.txn_conversations.update({ title: t }, { where: { id: convo.id } })
        return t || convo.title
      }
      let newTitle = convo.title
      if (isNewChat && !streamMode && !genError) newTitle = await nameNewChat()
      // Bump updated_at so the sidebar orders by LAST activity. This MUST be a static update:
      // an instance convo.update({ title: <same title>, ... }) is a no-op on a follow-up turn
      // (Sequelize manages updated_at and skips the write when no tracked field changed), which
      // left follow-up turns from re-sorting the list. A static update always issues the SQL and
      // auto-bumps updated_at — so every reply moves its conversation to the top. (New streamed
      // chats get their real title from nameNewChat's own update below; this still bumps the sort.)
      await fastify.db.txn_conversations.update({ title: newTitle }, { where: { id: convo.id } })

      // Proactive "compact": now that the reply has streamed (nobody's waiting), fold any
      // over-budget backlog into the summary in the BACKGROUND, so the NEXT turn starts
      // with a ready summary and never blocks on it. The start-of-turn fold above is only a
      // fallback (a big first-send/import backlog, or if this hasn't caught up). Fire-and-forget;
      // the WHERE guard only ever advances the watermark forward (never clobbers a newer fold).
      // Same trigger as the start-of-turn fold: Ollama-kind folds ONLY when the unsummarized
      // span outgrows the token budget — folding earlier would rewrite the prompt prefix
      // every turn and defeat the runner's KV cache reuse; remote keeps the eager rules.
      try {
        const timeline = [...history, saved]
        const unsumAll = timeline.filter((m) => m.rolling_id > (convo.summarized_upto_id || 0))
        let bgFold
        if (foldBudget > 0) {
          // fires at 90% of the budget — slightly BEFORE the blocking start-of-turn fold
          // (100%), so in practice the fold happens here in the background and the next
          // turn starts pre-folded instead of waiting on a summary
          bgFold = (unsumAll.length > recentN && estTok(unsumAll) > foldBudget * 0.9)
            ? unsumAll.slice(0, unsumAll.length - recentN) : []
        } else {
          bgFold = (timeline.length > recentN ? timeline.slice(0, timeline.length - recentN) : [])
            .filter((m) => m.rolling_id > (convo.summarized_upto_id || 0))
          const bgChars = bgFold.reduce((n, m) => n + (m.content?.length || 0), 0)
          if (!(bgFold.length >= 4 || bgChars >= 4000)) bgFold = []
        }
        if (!genError && bgFold.length) {
          const foldUpto = bgFold[bgFold.length - 1].rolling_id
          summarizeMessages(convo.summary, bgFold, summaryModelId, ownerIdOf(request.user, 'this request'))
            .then((s) => fastify.db.txn_conversations.update(
              { summary: s, summarized_upto_id: foldUpto },
              { where: { id: convo.id, [Op.or]: [{ summarized_upto_id: null }, { summarized_upto_id: { [Op.lt]: foldUpto } }] } },
            ))
            .catch(() => {})
        }
      } catch { /* background compaction is best-effort — never affects the reply */ }

      // best-effort usage log
      try {
        const clip = (s, n = 20000) => (s && s.length > n ? s.slice(0, n) + '…[truncated]' : s)
        await fastify.db.log_usage.create({
          user_id: ownerIdOf(request.user, 'a usage row'),
          api_key_id: request.chatApiKey?.id ?? null, // the user's system chat key
          provider: providerName, model: modelId, endpoint: 'chat',
          prompt_tokens: usage?.promptTokens ?? null, completion_tokens: usage?.completionTokens ?? null,
          cached_tokens: usage?.cachedTokens ?? null, // provider-reported cache-hit input tokens
          ttft_ms: firstTokenAt ? firstTokenAt - startedAt : null,
          latency_ms: Date.now() - startedAt,
          // strip image payloads from the log — a single data URL would blow the 20KB clip
          request_body: clip(JSON.stringify({ messages: messages.map((m) => (m.images ? { ...m, images: `[${m.images.length} image(s)]` } : m)) })),
          response_body: clip(JSON.stringify({ text: answer, reasoning: reasoning || undefined, toolCalls: toolActivity.map((t) => ({ name: t.name, args: t.args })) })),
        })
        // chat turns count as "use" of the system chat key (API-surface keys get this via auth)
        if (request.chatApiKey?.id) {
          fastify.db.mst_api_keys.update({ last_used_at: new Date() }, { where: { id: request.chatApiKey.id } }).catch(() => {})
        }
      } catch { /* never block chat on logging */ }

      if (streamMode) {
        if (!clientGone && !reply.raw.writableEnded && !reply.raw.destroyed) {
          // model rides along so the live reply's stats can name its generator without a
          // reload (users switch models mid-conversation; each reply reports its own);
          // same for the skill the reply ran as — bound or triggered (the chip survives).
          // `title` is the CURRENT title (the real name for a new chat lands via the push below);
          // send + close NOW so the client drops its "generating" state the instant the reply
          // is done, not after the title round-trip.
          write({ type: 'done', messageId: saved.id, usage, metrics, title: newTitle, model: modelId, skill: (activeSkill || dynamicSkill) ? { id: (activeSkill || dynamicSkill).id, name: (activeSkill || dynamicSkill).name } : undefined })
          reply.raw.end()
        }
        // New streamed chat: name it AFTER the stream closed. When the title lands, push a
        // conversations-changed hint so the open page + sidebar pick it up (same channel
        // scheduled runs use) — the reply is already visible, only the title fills in later.
        if (isNewChat && !genError) {
          nameNewChat()
            .then((t) => { if (t && t !== convo.title) notifyChatEvent(ownerIdOf(request.user, 'this request'), { type: 'conversations-changed', conversationId: convo.id }) })
            .catch(() => { /* generateTitle never throws, but never let a stray rejection escape */ })
        }
        return reply
      }
      // non-stream: one JSON response with the full reply
      return reply.send({
        message: { id: saved.id, role: 'assistant', content: answer, reasoning: reasoning || null, provider: providerName, model: modelId },
        tools: toolActivity,
        segments: structuredSegments ?? undefined,
        skill: (activeSkill || dynamicSkill)
          ? { id: (activeSkill || dynamicSkill).id, name: (activeSkill || dynamicSkill).name, tools: (activeSkill || dynamicSkill).allowedComponents, missing: (activeSkill || dynamicSkill).missing, triggered: !activeSkill || undefined }
          : null,
        metrics,
        title: newTitle,
        conversationId: convo.id,
        error: genError || undefined,
      })
    } catch (persistErr) {
      request.log?.error?.(persistErr, 'streamReply: failed to persist/finalize the assistant reply')
      // Stream mode: headers already sent — end the SSE cleanly, never re-throw.
      if (streamMode) {
        if (!reply.raw.writableEnded && !reply.raw.destroyed) {
          try { write({ type: 'error', code: 'persist_failed', message: 'Could not save the reply — the conversation may have been removed.' }) } catch { /* socket gone */ }
          try { reply.raw.end() } catch { /* socket gone */ }
        }
        return reply
      }
      // Non-stream: nothing sent yet, so a normal error response is safe.
      if (!reply.sent) return reply.code(500).send({ error: { code: 'persist_failed', message: persistErr?.message || 'Failed to save the reply' } })
      return reply
    } finally {
      steerReg.end(convo.id) // this generation no longer accepts steers
      // ⭐⭐ C2 · THE HOLD DIES WITH THE TURN, ON EVERY EXIT PATH. Ote: *"working memory must remain
      // ephemeral. No persistence, no automatic retention, no capacity number, no hidden cache."*
      // ⛔ `dispose()` is not cosmetic — it drops the contents AND refuses further admission, so a stray
      // reference cannot keep filling it. ⓘ In the same `finally` as `steerReg.end` deliberately: that block
      // already exists precisely because it covers every exit, including the error paths.
      try { cognitiveHold?.dispose() } catch { /* disposing must never mask the real error */ }
    }
  }

  // Stream mode: explicit body flag wins, else the conversation's stored pref (default on).
  const wantsStream = (request, convo) =>
    request.body?.stream !== undefined ? request.body.stream !== false : (convo.settings?.stream !== false)

  // ---- concurrent-generation guard (per account) ----
  // In-memory count of replies currently generating per user, capped by the root setting
  // chat.backgroundMaxConcurrent. Checked BEFORE the user turn is persisted so a refused
  // send keeps the draft in the composer; counted for the full life of streamReply (any
  // exit path decrements). Root is exempt. In-memory is correct here: a server restart
  // kills the in-flight streams too, so the counts SHOULD reset with it.
  const activeGens = new Map() // user key -> running generation count
  const genKey = (request) => request.user?.id ?? 'root'
  // Steering inbox, keyed by conversation — live only while a generation runs (see the
  // steer endpoint + the agent loop's drain points). Separate from the per-user count above.
  const steerReg = createSteerRegistry()
  // ⭐⭐ EXPOSED ON `fastify` SO THE BACKGROUND LANE CAN ASK "IS SHE BUSY?" WITHOUT A SECOND REGISTRY.
  // The revisit idle gate (`components/revisit-idle-gate.js`) runs from the cron plugin, which has a
  // fastify and no route scope. ⛔ Decorating is deliberately the ONLY way it reaches this: the gate must
  // read the same object the route writes, or the two drift about whether a turn is running — the exact
  // failure Ote refused when he chose one registry over two.
  // ⓘ Guarded because this route module can be registered more than once in a harness, and `decorate`
  // throws on a duplicate key.
  if (!fastify.hasDecorator('steerReg')) fastify.decorate('steerReg', steerReg)
  const atGenLimit = (request) => {
    if (request.user?.isRoot) return null
    const limit = getSetting(fastify.config, 'chat.backgroundMaxConcurrent')
    const current = activeGens.get(genKey(request)) || 0
    if (current < limit) return null
    return {
      code: 'too_many_generations',
      message: `You already have ${current} repl${current === 1 ? 'y' : 'ies'} generating (limit ${limit}) — wait for one to finish, or stop it, before starting another.`,
    }
  }
  // ---- ONE GENERATION PER CONVERSATION ----
  // A second send/regenerate/edit while a reply is still streaming used to start a CONCURRENT
  // generation on the SAME thread, and that is wrong two ways over:
  //   • Transcript integrity — both generations read the history and append to it. Ote's flagged
  //     chat 35d50455 ended up user,user,assistant,assistant with the second assistant answering
  //     the FIRST user message; the reply to the second message never existed.
  //   • Runner contention — on a single-slot local model the two requests starve each other, and
  //     BOTH died on the first-token watchdog (measured: 180s ttft=null, and the 9-minute turn
  //     next to it). The watchdog then blamed the model ("may be stuck loading") for our own
  //     self-inflicted queueing.
  // The client cannot be the authority here: its `sending` flag is per-tab React state, so a
  // reload or a second tab loses it and Enter sends a normal message where the user meant to
  // steer. The steer registry already tracks exactly the lifetime of a generation for a
  // conversation, so the server — which knows — decides, and the client adapts to the answer.
  // NOT root-exempt (unlike atGenLimit): this is transcript integrity, not a quota.
  const alreadyGenerating = (convoId) => {
    if (!steerReg.isActive(convoId)) return null
    const canSteer = getSetting(fastify.config, 'chat.steerEnabled') === true
    return {
      code: 'already_generating',
      message: canSteer
        ? 'This conversation is still replying — your message can be folded into the running reply as a steer, or press Stop first.'
        : 'This conversation is still replying — wait for it to finish, or press Stop first.',
      canSteer,
    }
  }
  const runGenerating = async (request, fn) => {
    const k = genKey(request)
    activeGens.set(k, (activeGens.get(k) || 0) + 1)
    try {
      return await fn()
    } finally {
      const n = (activeGens.get(k) || 1) - 1
      if (n <= 0) activeGens.delete(k)
      else activeGens.set(k, n)
    }
  }

  // ---- send a message, stream (SSE) or buffer (JSON) the reply ----
  // Images: array of data URLs for vision models (composer resizes client-side).
  const IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/
  fastify.post('/chat/conversations/:id/messages', {
    preHandler: [chatCap, requireChatEnabled],
    schema: {
      body: {
        type: 'object',
        properties: {
          content: { type: 'string', maxLength: 100000 },
          images: { type: 'array', items: { type: 'string', maxLength: 3_000_000 }, maxItems: 4 },
          // per-image origin metadata (same order as `images`): the composer converts
          // uploads to WebP — this records the original format/name/size
          imagesMeta: {
            type: 'array',
            maxItems: 4,
            items: {
              type: 'object',
              properties: {
                orig: { type: 'string', maxLength: 24 },
                name: { type: 'string', maxLength: 200 },
                bytes: { type: 'integer', minimum: 0, maximum: 2_000_000_000 },
              },
              additionalProperties: false,
            },
          },
          files: {
            type: 'array',
            maxItems: 4,
            items: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', minLength: 1, maxLength: 200 },
                text: { type: 'string', maxLength: 500_000 },    // plain-text files, read in the browser
                dataUrl: { type: 'string', maxLength: 12_000_000 }, // pdf/docx/xlsx — extracted server-side
              },
              additionalProperties: false,
            },
          },
          stream: { type: 'boolean' },
          // one-shot skill binding for THIS send (the composer's /skill-name invocation) —
          // outranks the conversation's bound skill for the turn, settings untouched
          skillOnce: { type: 'string', maxLength: 200 },
          // one-shot tool constraint for THIS send (scheduled runs pass the schedule's
          // tool list) — only ever NARROWS the offered toolset, never widens it
          allowedTools: { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 200 } },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const convo = await fastify.db.txn_conversations.findOne({ where: { id: request.params.id, ...ownWhere(request) } })
    if (!convo) return reply.code(404).send({ error: { code: 'not_found', message: 'Conversation not found' } })

    // This conversation is still generating — refuse BEFORE persisting anything (see
    // alreadyGenerating). The chat site turns this 409 into a steer, which is what the user meant.
    const busy = alreadyGenerating(convo.id)
    if (busy) return reply.code(409).send({ error: busy })

    // Token budget gate — BEFORE persisting the turn, so an over-limit send keeps the
    // user's draft in the composer instead of burying it in the thread unanswered.
    const limitHit = await checkTokenBudget(fastify, ownerIdOf(request.user, 'a token budget check'), request.log)
    if (limitHit) return reply.code(429).send({ error: { code: limitHit.code, message: limitHit.message, budget: limitHit.budget } })
    const genBlock = atGenLimit(request)
    if (genBlock) return reply.code(429).send({ error: genBlock })

    const content = (request.body.content || '').trim()
    // filter images and their meta TOGETHER so the arrays stay index-aligned even
    // when an invalid data URL gets dropped
    const rawMeta = Array.isArray(request.body.imagesMeta) ? request.body.imagesMeta : []
    const images = []
    const imagesMeta = []
    for (const [i, u] of (request.body.images || []).entries()) {
      if (typeof u !== 'string' || !IMAGE_RE.test(u)) continue
      images.push(u)
      imagesMeta.push(rawMeta[i] && typeof rawMeta[i] === 'object' ? rawMeta[i] : null)
    }
    // document attachments: extract text NOW (pdf/docx/xlsx/plain) — the extracted text is
    // what gets persisted and fed to the model; raw files are never stored
    let files = null
    if (Array.isArray(request.body.files) && request.body.files.length) {
      try {
        files = []
        // Pass the config so the malware-scan seam is REACHABLE. Without it the seam would be exactly the
        // dead wiring this codebase just had to fix elsewhere: present, exported, and never called.
        for (const f of request.body.files.slice(0, MAX_FILES)) files.push(await extractFile(f, fastify.config))
      } catch (e) {
        return reply.code(400).send({ error: { code: 'file_unreadable', message: e?.message || 'Could not read an attached file' } })
      }
    }
    if (!content && !images.length && !files?.length) {
      return reply.code(400).send({ error: { code: 'empty_message', message: 'Send text, an image, a file, or any combination' } })
    }
    // persist the user's message, then generate. The send CONSUMES any folded draft —
    // otherwise a stale one would re-populate the composer on the next open.
    await fastify.db.txn_messages.create({
      conversation_id: convo.id,
      role: 'user',
      content,
      images: images.length ? images : null,
      images_meta: images.length && imagesMeta.some(Boolean) ? imagesMeta : null,
      files,
    })
    if (convo.draft) await convo.update({ draft: null }, { silent: true })
    const out = await runGenerating(request, () => streamReply(request, reply, convo, wantsStream(request, convo)))
    // Marathon (⚙ opt-in + root lever): a USER-initiated turn that left an unfinished
    // plan auto-continues. Never for internal turns (scheduled runs, and marathon's own
    // injected rounds — no recursion); every gate re-checks inside, so this is a cheap no-op.
    if (!request.headers?.['x-ote-internal']) maybeStartMarathon(fastify, request.user, convo.id)
    return out
  })

  // ---- steer: a mid-generation message the IN-FLIGHT reply folds in ----
  // Valid only while THIS conversation is actively generating (the streamReply agent loop
  // drains the inbox at its next round boundary — it does NOT interrupt mid-token; Stop
  // does that). Root-toggleable (chat.steerEnabled, default off) + capped per reply.
  fastify.post('/chat/conversations/:id/steer', {
    preHandler: [chatCap, requireChatEnabled],
    schema: { body: { type: 'object', required: ['content'], properties: { content: { type: 'string', minLength: 1, maxLength: 100000 } }, additionalProperties: false } },
  }, async (request, reply) => {
    if (getSetting(fastify.config, 'chat.steerEnabled') !== true) {
      return reply.code(403).send({ error: { code: 'steer_disabled', message: 'Steering is turned off' } })
    }
    const convo = await fastify.db.txn_conversations.findOne({ where: { id: request.params.id, ...ownWhere(request) } })
    if (!convo) return reply.code(404).send({ error: { code: 'not_found', message: 'Conversation not found' } })
    if (!steerReg.isActive(convo.id)) {
      return reply.code(409).send({ error: { code: 'not_generating', message: 'Nothing is generating in this conversation right now — send it as a normal message.' } })
    }
    // The steer extends the same turn's generation — meter it like a send (fails open).
    const limitHit = await checkTokenBudget(fastify, ownerIdOf(request.user, 'a token budget check'), request.log)
    if (limitHit) return reply.code(429).send({ error: { code: limitHit.code, message: limitHit.message, budget: limitHit.budget } })

    const content = (request.body.content || '').trim()
    if (!content) return reply.code(400).send({ error: { code: 'empty_steer', message: 'Steer text is empty' } })
    const max = getSetting(fastify.config, 'chat.maxSteersPerReply')
    const res = steerReg.add(convo.id, content, max)
    if (res.error === 'not_generating') {
      return reply.code(409).send({ error: { code: 'not_generating', message: 'The reply just finished — send it as a normal message.' } })
    }
    if (res.error === 'too_many_steers') {
      return reply.code(429).send({ error: { code: 'too_many_steers', message: `You can steer at most ${max} time${max === 1 ? '' : 's'} per reply.` } })
    }
    return reply.send({ ok: true })
  })

  // ---- regenerate the last assistant reply (optionally with a DIFFERENT model) ----
  // `model` switches the conversation's model before re-running (select_model users
  // only) — "this answer was weak, retry it on the bigger model".
  fastify.post('/chat/conversations/:id/regenerate', {
    preHandler: [chatCap, requireChatEnabled],
    schema: { body: { type: 'object', properties: { stream: { type: 'boolean' }, model: { type: 'string', minLength: 1 } }, additionalProperties: false } },
  }, async (request, reply) => {
    const convo = await fastify.db.txn_conversations.findOne({ where: { id: request.params.id, ...ownWhere(request) } })
    if (!convo) return reply.code(404).send({ error: { code: 'not_found', message: 'Conversation not found' } })

    // Regenerating mid-generation would DESTROY the assistant row the running turn is about to
    // persist — refuse before touching anything.
    const busyRegen = alreadyGenerating(convo.id)
    if (busyRegen) return reply.code(409).send({ error: busyRegen })

    const limitHit = await checkTokenBudget(fastify, ownerIdOf(request.user, 'a token budget check'), request.log)
    if (limitHit) return reply.code(429).send({ error: { code: limitHit.code, message: limitHit.message, budget: limitHit.budget } })
    const genBlock = atGenLimit(request)
    if (genBlock) return reply.code(429).send({ error: genBlock })

    if (typeof request.body?.model === 'string' && request.body.model !== convo.model) {
      if (!can(request.user, 'select_model')) {
        return reply.code(403).send({ error: { code: 'model_locked', message: 'Your role cannot change the model' } })
      }
      await convo.update({ model: request.body.model })
    }

    // drop the trailing assistant message so we re-run the last user turn
    const last = await fastify.db.txn_messages.findOne({ where: { conversation_id: convo.id }, order: [['rolling_id', 'DESC']] })
    if (last && last.role === 'assistant') await last.destroy()

    const hasUser = await fastify.db.txn_messages.findOne({ where: { conversation_id: convo.id, role: 'user' } })
    if (!hasUser) return reply.code(400).send({ error: { code: 'nothing_to_regenerate', message: 'No user message to regenerate from' } })

    return runGenerating(request, () => streamReply(request, reply, convo, wantsStream(request, convo)))
  })

  // ---- edit a USER message and re-run from that point (ChatGPT-style) ----
  // The edited message keeps its attachments; everything AFTER it is dropped and
  // the reply regenerates against the new text.
  fastify.post('/chat/conversations/:id/messages/:messageId/edit', {
    preHandler: [chatCap, requireChatEnabled],
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 100000 },
          stream: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const convo = await fastify.db.txn_conversations.findOne({ where: { id: request.params.id, ...ownWhere(request) } })
    if (!convo) return reply.code(404).send({ error: { code: 'not_found', message: 'Conversation not found' } })
    const msg = await fastify.db.txn_messages.findOne({ where: { id: request.params.messageId, conversation_id: convo.id } })
    if (!msg) return reply.code(404).send({ error: { code: 'message_not_found', message: 'Message not found' } })
    if (msg.role !== 'user') return reply.code(400).send({ error: { code: 'not_a_user_message', message: 'Only your own user messages can be edited' } })

    // Editing mid-generation would delete rows out from under the running turn (the destroy
    // below removes everything after the edited message) — refuse first.
    const busyEdit = alreadyGenerating(convo.id)
    if (busyEdit) return reply.code(409).send({ error: busyEdit })

    const limitHit = await checkTokenBudget(fastify, ownerIdOf(request.user, 'a token budget check'), request.log)
    if (limitHit) return reply.code(429).send({ error: { code: limitHit.code, message: limitHit.message, budget: limitHit.budget } })
    const genBlock = atGenLimit(request)
    if (genBlock) return reply.code(429).send({ error: genBlock })

    await fastify.db.txn_messages.destroy({ where: { conversation_id: convo.id, rolling_id: { [Op.gt]: msg.rolling_id } } })
    await msg.update({ content: request.body.content.trim() })
    // if the rolling summary covered messages past the edit point, it now describes
    // content that no longer exists — drop it and let it rebuild
    if (convo.summarized_upto_id && convo.summarized_upto_id > msg.rolling_id) {
      await convo.update({ summary: null, summarized_upto_id: null })
    }
    return runGenerating(request, () => streamReply(request, reply, convo, wantsStream(request, convo)))
  })

  // ===== user memory =====
  //   user_memories — curated Notes (user-managed; always injected into every chat)
  //   Persona Memory v2 (the `memories` table) is the assistant's own memory — see the GET
  //   /chat/memory `assistant` list + DELETE /chat/memory/v2/:id below. (v1 kv/facts retired.)
  const memOut = (m) => ({ id: m.id, content: m.content, isEnabled: m.is_enabled, createdAt: m.created_at })
  const memWhere = (req) => ownedBy(req.user, 'this note')

  fastify.get('/chat/memory', { preHandler: chatCap }, async (request, reply) => {
    const notes = await fastify.db.txn_user_memories.findAll({ where: memWhere(request), order: [['rolling_id', 'ASC']] })
    // Assistant memory now comes from v2 (the `memories` table the assistant ACTUALLY uses for
    // recall) — not the legacy memory_kv/memory_facts. So what the user sees here = what the
    // assistant remembers. Scoped to this user; best-effort (never breaks the modal).
    let assistant = []
    try {
      assistant = (await buildMemoryV2(fastify, { userId: ownerIdOf(request.user, 'memory') }).list({ limit: 500 })).memories
    } catch { /* memory unavailable — show notes only */ }
    return reply.send({ memories: notes.map(memOut), assistant })
  })

  // Forget a v2 assistant memory (soft — archived, never hard-deleted).
  //
  // ⚠️ THIS WENT STRAIGHT TO THE DATABASE UNTIL 2026-08-12, AND IT WAS THE ONLY DELETION PATH THAT DID.
  // `txn_memories.update({ expired_at, tier:'cold' })` archives the row and skips the two behaviours
  // that live ONLY in the service:
  //
  //   1. THE AUDIT ROW. No record of the deletion — so "where did my fact go?" was unanswerable for
  //      exactly the deletions the user makes DELIBERATELY, which are the ones they will ask about.
  //   2. UN-SUPERSEDE. Forgetting a belief that DISPLACED another must give the displaced one back, or
  //      the slot is left EMPTY instead of reverting. Not hypothetical: a junk fact scraped from pasted
  //      JSON superseded Ote's real "role" fact (importance 10, recalled 109×), and deleting the junk
  //      left the slot with zero live rows and the true belief unreachable, because every read path
  //      filters on invalid_at IS NULL AND expired_at IS NULL.
  //
  // The admin route (`/admin/memories/:id/forget`) already routed through the service, with a comment
  // saying an admin action that skipped these would be "the one deletion path with no record". The hole
  // was closed there and left open HERE — on the path a person actually uses.
  //
  // Scope is preserved by construction: the service resolves through `store.findAnyById`, which is
  // persona+user scoped, so an id outside this user's scope reads as ABSENT and returns 404 as before.
  // Regression coverage: test/checks/memory-lifecycle-check.mjs.
  fastify.delete('/chat/memory/v2/:id', { preHandler: chatCap }, async (request, reply) => {
    const mem = buildMemoryV2(fastify, {
      userId: ownerIdOf(request.user, 'this memory'),
      actor: 'user', // a person pressed delete — distinct from 'model' and from the decay pass
    })
    const res = await mem.forget({ id: request.params.id })
    if (!res.forgotten) return reply.code(404).send({ error: { code: 'not_found', message: 'Memory not found' } })
    // `restored` is surfaced, not swallowed: if forgetting this belief revived the one it had displaced,
    // the user asked to remove something and got a DIFFERENT answer back rather than nothing, and a UI
    // told only "forgotten: true" would show a memory reappearing with no explanation.
    return reply.send({ ok: true, id: request.params.id, forgotten: true, restored: res.restored ?? null })
  })

  fastify.post('/chat/memory', {
    preHandler: chatCap,
    schema: { body: { type: 'object', required: ['content'], properties: { content: { type: 'string', minLength: 1, maxLength: 2000 } }, additionalProperties: false } },
  }, async (request, reply) => {
    const row = await fastify.db.txn_user_memories.create({ user_id: ownerIdOf(request.user, 'a note'), content: request.body.content.trim(), is_enabled: true })
    return reply.code(201).send({ memory: memOut(row) })
  })

  fastify.patch('/chat/memory/:id', {
    preHandler: chatCap,
    schema: { body: { type: 'object', properties: { content: { type: 'string', minLength: 1, maxLength: 2000 }, isEnabled: { type: 'boolean' } }, additionalProperties: false } },
  }, async (request, reply) => {
    const row = await fastify.db.txn_user_memories.findOne({ where: { id: request.params.id, ...memWhere(request) } })
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'Memory not found' } })
    const patch = {}
    if (typeof request.body?.content === 'string') patch.content = request.body.content.trim()
    if (typeof request.body?.isEnabled === 'boolean') patch.is_enabled = request.body.isEnabled
    await row.update(patch)
    return reply.send({ memory: memOut(row) })
  })

  fastify.delete('/chat/memory/:id', { preHandler: chatCap }, async (request, reply) => {
    const row = await fastify.db.txn_user_memories.findOne({ where: { id: request.params.id, ...memWhere(request) } })
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'Memory not found' } })
    await row.destroy()
    return reply.send({ ok: true, id: request.params.id, deleted: true })
  })

  // DEAD WIRING, fixed 2026-07-30: `attachLogger` existed and was exported but NOTHING ever called it, so the
  // runtime's `logger` stayed null forever and its `tool.executed` / `skill.used` subscriptions — built to prove
  // host-side pub/sub — silently discarded every line. Found by a dead-export scan: an unreferenced export is
  // sometimes not dead CODE but dead CONNECTION, i.e. a feature that was built and never plugged in.
  attachLogger(fastify.log)

  // Boot wiring: register the late-bound `todo` / `todoStore` host services (idempotent).
  initTodo(fastify)
  initInteraction(fastify)
  initConversationSearch() // `conversationSearch` host service (Conversation Search, step 4 CS1)
  initOwnMemory() // `ownMemory` host service — what SHE has stored about herself (recall_own_memory)
  initIntention() // `intention` host service — what she is TRYING TO ACCOMPLISH with this person (A1)
  initLesson() // `lesson` host service — what she GOT WRONG and what generalizes from it (step 4)
  initDisclosure() // `disclosure` — the only door between rooms, opened by a card a human answers.
  initSelfHistory() // `selfHistory` — her own sentences across every room, because they are HERS. What varies
  // `conversationRetrieval` -- one selector over the conversation SOURCE: with / in / about /
  // between / where / role. SQL decides which conversations are eligible; pgvector only ranks
  // inside that set; every turn comes back with provenance and stamped not-retained.
  initConversationRetrieval()
  // ⭐⭐ `retention` — ONE DOOR FOR KEEPING SOMETHING, with `mine` carrying HER decision about whose it
  // is. ⛔ No default: an undeclared owner is refused with a question rather than filed as 'account',
  // which is what stored her own family lineage as facts about the user. The specialised write tools
  // stay reachable underneath as the mechanisms this dispatches to.
  initRetention()
  // by account is whether it may be TOLD them (`access_sotera_memory`), never whether she may find them.
  // Tool-call audit: the EventBus already emitted every call; nothing kept them. See audit/tool-log.js.
  initToolLog(fastify, attachToolAudit)
  initReflection() // `reflection` host service (L3 Persona Notes; the Reflection Host Adapter, step 5 R1)
  initWorkingMemory() // `workingMemory` host service (L4 active session state; the update_working_memory tool, step 6 WM2)
  // Recover turns the server was killed mid-generation on — a conversation ending in an
  // unanswered user message gets a visible, resumable note instead of silent nothing
  // (Ote's "it just look disappear from user side"). Fire-and-forget, like the zombie sweep.
  recoverInterruptedTurns(fastify).catch(() => {})
}
