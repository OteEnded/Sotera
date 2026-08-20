// Chat Site ↔ ComponentsSDK adapter.
//
// The Chat Site is the first (proto) Persona Runtime. Its persona is now DATA: `persona.json`
// lists component projects BY SOURCE, and a ComponentResolver loads them (no import-by-name).
// The host still PROVIDES the concrete services (memory, search) per request, so the components
// themselves stay portable. Moving components to git/npm later changes only persona.json.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  createRuntime, installComponents, createRuntimeContext, KINDS,
  ResolverRegistry, LocalResolver, UrlResolver,
} from '@ote/components-sdk'
import { buildMemoryToolService } from './memory-pipeline-host.js'
import { searchServiceFromConfig } from './search-service.js'
import { createServiceInfoService } from './service-info.js'
import { getSetting } from '../settings/index.js'

// The persona config is data. Sources in it are relative to the persona file, so resolve them
// against its directory (baseDir).
const PERSONA_PATH = fileURLToPath(new URL('./persona.json', import.meta.url))
const PERSONA_CONFIG = JSON.parse(readFileSync(PERSONA_PATH, 'utf8'))
const PERSONA_BASE_DIR = path.dirname(PERSONA_PATH)

// ComponentStore: where url:-sourced component projects install (workspace-level, shared
// with future PersonaTemplate hosts; git-ignored — the lockfile + integrity pins make any
// checkout reproduce it). Local persona sources never touch it.
export const COMPONENT_STORE_DIR = path.resolve(PERSONA_BASE_DIR, '../../../..', 'ComponentStore')

const runtime = createRuntime()

// Resolver chain: local paths first (the monorepo), then integrity-pinned remote zips.
const resolverRegistry = new ResolverRegistry([
  new LocalResolver({ baseDir: PERSONA_BASE_DIR }),
  new UrlResolver({ storeDir: COMPONENT_STORE_DIR }),
])
export { resolverRegistry }

// Subscribe to the spine (proves host-side pub/sub; future Features/Tasks subscribe here too).
let logger = null
// ⭐ The audit sink. It is a LATE-BOUND FUNCTION rather than an import because this module top-level
// awaits its component install — importing the audit (which needs the db) would risk a cycle through
// boot. `app/audit/tool-log.js` attaches itself here at boot instead.
// ⚠️ Until 2026-08-20 this subscriber wrote a debug line and DISCARDED `e.caller`, so "which account
// called remember_fact" was unanswerable even though the event carried the answer the whole time.
let toolAudit = null
export function attachToolAudit(sink) { toolAudit = typeof sink === 'function' ? sink : null }

runtime.events.on('tool.executed', (e) => {
  const status = e.ok ? 'ok' : `error: ${e.error}`
  logger?.debug?.(`[tool.executed] ${e.name} (${e.durationMs}ms) ${status}`)
  // An audit failure must never reach the turn that produced the event.
  try { toolAudit?.(e) } catch { /* the sink logs its own failures */ }
})
// Skill runs trace the same way tool runs do (both narrate on the EventBus spine).
runtime.events.on('skill.used', (e) => {
  logger?.debug?.(`[skill.used] ${e.id} (${e.origin}, ${e.tools} tools) by user ${e.caller?.userId ?? 'system'}`)
})

// Install the persona's components at module load (top-level await — boot awaits this). The
// host provides `memory`, `search`, and `serviceInfo`, so dependency resolution is told about
// them. persona.json = DESIRED state; persona.lock.json (written by the SDK on every install)
// = RESOLVED state: every project's exact version, declared sdk range, the SDK it resolved
// against, trust tier, and the integrity pin for remote artifacts.
// Lock pipeline mode: 'update' (dev default — boot re-resolves and syncs the lock, logging
// what changed) vs 'frozen' (deploys — config.json `components.lockMode: "frozen"` makes a
// boot whose resolution differs from the committed lock FAIL instead of silently drifting).
// Read straight from config.json: this runs at module load, before the fastify config plugin.
let rawComponentsConfig = {}
try {
  const raw = JSON.parse(readFileSync(path.resolve(PERSONA_BASE_DIR, '../../config.json'), 'utf8'))
  if (raw?.components && typeof raw.components === 'object') rawComponentsConfig = raw.components
} catch { /* no config yet (fresh checkout) — dev defaults */ }
const lockMode = rawComponentsConfig.lockMode === 'frozen' ? 'frozen' : 'update'

// Late-bound host services: modules this adapter must NOT import (it top-level awaits,
// so an import cycle through it deadlocks) register their per-request service factories
// at boot instead — e.g. app/schedules registers `schedules` for the create_schedule tool.
const hostServiceFactories = new Map()
export function registerHostService(name, factory) {
  hostServiceFactories.set(name, factory)
}

const install = await installComponents(runtime, PERSONA_CONFIG, {
  // 'schedules' / 'todo' / 'todoStore' are late-bound (registered at boot by
  // initSchedules / initTodo) but PROMISED here so dependency resolution accepts the
  // components that require them. 'conversationSearch'/'workingMemory' have real tool consumers;
  // 'reflection' is registered + promised FORWARD-LOOKING (the route reaches Reflection via
  // buildReflection() directly today — no component requires it yet; a future Reflection Feature will).
  // `ownMemory` (2026-08-19): what SHE has stored about herself. Late-bound per request like
  // conversationSearch — see own-memory-host.js for why it exists and why it takes no arguments.
  // `intention` (2026-08-19): what she is TRYING TO ACCOMPLISH with the current person — persistent
  // across turns and across gaps. Late-bound per request like ownMemory; see intention-host.js for the
  // boundaries, and note that its cross-person read (`intentionsDue`) is a module export and
  // deliberately NOT on the service, so no tool can reach it.
  hostProvides: ['memory.v2', 'search', 'serviceInfo', 'schedules', 'todo', 'todoStore', 'interaction', 'interactionStore', 'conversationSearch', 'reflection', 'workingMemory', 'ownMemory', 'intention', 'lesson', 'selfHistory', 'disclosure'],
  resolver: resolverRegistry,
  baseDir: PERSONA_BASE_DIR,
  lockPath: path.join(PERSONA_BASE_DIR, 'persona.lock.json'),
  lockMode,
})
// Start the runtime so Features come alive (initialize + onEvent subscribe on the EventBus).
// Lifecycle ctx = the host's half of the Feature contracts. (The DailyDigest Feature's
// digestSource + dailyDigest config were removed 2026-07-20 when the digest moved to a root
// Schedule — see Backend/database/seeds/seed-digest-schedule.mjs; the Feature itself still
// ships in PortableComponents, it's just no longer installed in this persona.)
const started = await runtime.start(createRuntimeContext({
  services: { ...runtime.defaultServices },
  events: runtime.events,
  caller: { userId: null, capabilities: ['system'] },
  config: {},
}))

/** Call once at boot to route component logs through Fastify's logger. */
export function attachLogger(fastifyLogger) {
  logger = fastifyLogger
}

/**
 * Build a per-request RuntimeContext: inject host service implementations bound to the caller.
 * Host services OVERRIDE the components' defaults (e.g. Sequelize memory over memory-v1's
 * in-memory default).
 * @param {import('fastify').FastifyInstance} fastify
 * @param {import('fastify').FastifyRequest} request
 * @param {{ model?: string|null, timezone?: string|null }} [extras]  turn-specific facts only
 *   the route knows (the provider/model actually answering; the caller's IANA timezone from
 *   prefs — time-aware tools like get_current_time answer in it, never in server time)
 */
export function buildToolContext(fastify, request, extras = {}) {
  if (!logger && fastify?.log) logger = fastify.log // lazy-attach host logger on first use
  const userId = request.user?.id ?? null
  const services = {
    ...runtime.defaultServices, // component-provided defaults
    'memory.v2': buildMemoryToolService(fastify, { userId, sourceMessageId: extras.messageId ?? null, self: { username: request.user?.username, displayName: request.user?.displayName } }), // v2 via the OBSERVATION PIPELINE (Phase 5.5: the model's remember_fact is typed+routed like any other observer, so identity converges on the IdentityResolver); provenance-bound to this turn's source message; `self` lets the store canonicalize the fact owner
    search: searchServiceFromConfig(fastify.config),
  }
  // Late-bound host services (see registerHostService above) — built per request, bound
  // to the caller. A failing factory degrades to "service absent", never breaks the turn.
  for (const [name, make] of hostServiceFactories) {
    try {
      services[name] = make({ fastify, user: request.user, extras })
    } catch { /* service unavailable this request */ }
  }
  // serviceInfo backs @ote/tool-service-overview: a diagnostic view of the assembled persona +
  // provider + DB counts. Built here (needs the caller + a live DB handle + the runtime).
  services.serviceInfo = createServiceInfoService({
    config: fastify.config,
    runtime,
    personaName: PERSONA_CONFIG.name,
    serviceNames: Object.keys(services).concat('serviceInfo'),
    currentModel: extras.model ?? null,
    turn: extras.turn ?? {}, // placement / window / tools / memory / reasoning / caps for THIS turn
  })
  const ctx = createRuntimeContext({
    services,
    events: runtime.events,
    logger,
    // ⭐ THE CALLER IS THE AUDIT RECORD. Every field below rides through the EventBus on
    // `tool.executed { caller }` and lands in `log_tool_calls`.
    //   · `origin` is set by the CALL SITE ('chat' / 'schedule') and defaults to null — an emitter that
    //     did not say records unknown, because the plausible guess ('chat') is exactly wrong for a
    //     scheduled run.
    //   · `isRoot` is READ from the authenticated user, never derived from a null id. That inference is
    //     this codebase's most-repeated defect (nine sites, one of which turned a missing owner into a
    //     privilege grant) and an audit trail must not reproduce it.
    //   · `username` is an attribution snapshot, so a deleted account degrades the record rather than
    //     orphaning it — the same split `ownerIdOrNull` makes between attribution and ownership.
    caller: {
      userId,
      username: request.user?.username ?? null,
      isRoot: request.user?.isRoot === true,
      capabilities: request.user?.capabilities ?? [],
      timezone: extras.timezone ?? null,
      origin: extras.origin ?? null,
      conversationId: extras.conversationId ?? null,
    },
    config: fastify.config,
  })
  // ⚠️⚠️ RE-ATTACHED AFTER CONSTRUCTION, AND THIS IS NOT A STYLE CHOICE.
  // `createRuntimeContext` rebuilds `caller` from a THREE-FIELD ALLOWLIST — `userId`, `capabilities`,
  // `timezone` — so `username`, `isRoot`, `origin` and `conversationId` were **silently dropped** and the
  // first audit rows landed with three null columns. Measured, not guessed: attribution appeared,
  // origin/conversation/username did not.
  //
  // This is the FIFTH instance of the family `context-authority.js` warns about in its own header —
  // *"three times in this arc an explicit field list has silently dropped a field added later"* — now
  // inside the SDK. Mutating the returned object is safe (it is a plain object, not frozen) and the
  // EventBus carries the SAME object reference, so both the SDK's `runTool` emit and the route's four
  // hand-emitted host tools see these fields.
  //
  // ⛔ The better fix is in the SDK, and it is deliberately NOT made here: `OteAIComponentSDK` is a
  // shared `file:` dependency and OteLLMServices resolves the same directory, so widening its caller
  // contract is a cross-project change and Ote's call.
  Object.assign(ctx.caller, {
    username: request.user?.username ?? null,
    isRoot: request.user?.isRoot === true,
    origin: extras.origin ?? null,
    conversationId: extras.conversationId ?? null,
  })
  return ctx
}

/** OpenAI-style tool defs (drop-in replacement for the old tools registry export). */
export function toolDefinitions(names) {
  return runtime.toolDefinitions(names)
}

/**
 * Tool names provided by the memory capability — every tool that consumes the `memory.v2` host
 * service (recall_memory / list_memories / remember / remember_fact / pin_memory / forget_memory).
 * Derived from the registry (manifest.requires), so it stays correct if the memory package's tools
 * change. The chat route uses this to make `useMemory` the master switch: when memory is OFF, these
 * tools are stripped from the model's toolset (not just the automatic recall/capture).
 */
export function memoryToolNames() {
  return new Set(
    runtime.registry.getByKind(KINDS.TOOL)
      .filter((c) => (c.manifest.requires || []).includes('memory.v2'))
      .map((c) => c.manifest.name),
  )
}

/** Execute a tool with a RuntimeContext (drop-in replacement; emits tool.executed). */
export function runTool(name, args, ctx) {
  return runtime.runTool(name, args, ctx)
}

/** Builtin (persona component) skill ids root has disabled — DB skills use their enabled column. */
export function disabledBuiltinSkillIds(config) {
  const v = getSetting(config, 'chat.disabledBuiltinSkills')
  return new Set(Array.isArray(v) ? v : [])
}

/**
 * Installed skills (id + display fields) — for a skill picker / listing.
 * Pass the server config to hide root-disabled BUILTIN skills (the chat surfaces do);
 * without it the list is unfiltered (the admin console shows disabled ones with a flag).
 */
export function listSkills(config = null) {
  const disabled = config ? disabledBuiltinSkillIds(config) : null
  return runtime.registry.getByKind(KINDS.SKILL).flatMap((s) => {
    if (disabled && s.origin !== 'agent-skill' && disabled.has(s.manifest.id)) return []
    // Claude Code's frontmatter extension: disable-model-invocation keeps a skill out of
    // the trigger catalog (user-bindable only). Boolean or "true", per its parser.
    const dmi = s.agentSkill?.extensions?.['disable-model-invocation']
    return [{
      id: s.manifest.id,
      name: s.manifest.name,
      description: s.manifest.description,
      origin: s.origin ?? 'component', // 'agent-skill' = imported .skill archive (DB-backed)
      files: s.skillFiles?.length || 0,
      modelInvocable: !(dmi === true || dmi === 'true'),
    }]
  })
}

/**
 * Resolve a Skill into a ready-to-run package: its prompt, model, workflow, the OpenAI-style
 * tool defs for its allowed components (only those installed), and any `missing` deps.
 * Returns null if there is no such skill (caller falls back to a normal turn).
 * Resolving traces as a use (`skill.used` on the EventBus, tallied by the observer like
 * tool.executed) — pass { trace: false } for introspection, { caller } to attribute a run.
 */
export function resolveSkill(id, opts) {
  if (!id || !runtime.registry.has(id)) return null
  const c = runtime.registry.get(id)
  if (!c || c.manifest.kind !== KINDS.SKILL) return null
  // opts.config = enforce root's builtin-disable list (a disabled builtin resolves like a
  // missing skill, so bindings fall back to plain turns instead of erroring).
  const { config, ...rest } = opts || {}
  if (config && c.origin !== 'agent-skill' && disabledBuiltinSkillIds(config).has(id)) return null
  return runtime.resolveSkill(id, rest)
}

export { runtime, install, started, PERSONA_CONFIG }
