import { apiUrl } from '../config'
import { apiGet, apiPost, apiPatch, apiDelete } from './api'

// ---- types ----
export type ReasoningEffort = 'low' | 'medium' | 'high' | null

export type ChatSettings = {
  reasoning: { enabled: boolean; effort: ReasoningEffort }
  temperature: number | null
  top_p: number | null
  max_tokens: number | null
  // Per-chat context window. null = use root's resolved cap for the model. Can only NARROW that cap —
  // the server clamps independently, so this is a convenience, not the enforcement.
  numCtx?: number | null
  seed: number | null
  useMemory: boolean
  toolsEnabled: boolean
  marathon?: boolean // auto-continue while the Todo plan is unfinished (root lever gates it)
  customInstructions: string
  visionRelayModel?: string | null // vision model that describes images for non-vision targets
  skill?: string | null // Skill id to run this conversation "as" (prompt + constrained tools + model)
  // view/transport prefs (any chat user may change these)
  stream: boolean
  markdown: boolean
  showStats: boolean
}

export const DEFAULT_SETTINGS: ChatSettings = {
  // effort 'low' by default so answers stay fast; users can raise it in the ⚙ popover
  reasoning: { enabled: true, effort: 'low' },
  temperature: null, top_p: null, max_tokens: null, seed: null,
  numCtx: null,
  useMemory: true,
  toolsEnabled: true,
  marathon: false,
  customInstructions: '',
  visionRelayModel: null,
  skill: null,
  stream: true,
  markdown: true,
  showStats: true,
}

// A tool call + its result, shown inline in the assistant message.
export type ToolActivity = { id?: string; name: string; args?: unknown; result?: string }

// Ordered reply weave for interleaved rendering: the text the model wrote each round
// between the tool calls it made (legacy-style). Falls back to tools+content when absent.
export type ReplySegment =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool'; id?: string; name: string; args?: unknown; result?: string }
  | { type: 'steer'; text: string } // a mid-generation user message folded into this reply
  | { type: 'draft'; text: string } // discarded output — a thinking model's abandoned answer run; kept for inspection, not shown/replayed
  | { type: 'interaction'; text: string; icon?: string } // runtime-generated narration ("🔎 Searching…"); visible, never replayed

export type ChatMetrics = {
  generatedAt?: number // when the reply finished (epoch ms) — shown in the stats line
  latencyMs: number | null
  ttftMs: number | null
  tokensPerSec: number | null
  promptTokens: number | null
  completionTokens: number | null
  stopped?: boolean
  // the prompt exceeded the model's context window — the oldest content was likely
  // truncated by the provider (local models do this SILENTLY; we surface it)
  contextOverflow?: { estimate: number; window: number; headroom?: number; tooBig?: boolean }
  // the provider hit its output-token cap and spent it all in the thinking channel, so the
  // answer came back empty — surfaced so it doesn't read as a hang (raise max tokens / lower effort)
  outputCapped?: { completionTokens: number | null; hadReasoning?: boolean }
  // context caching: prefill wall-clock (local — ~0ms on a big prompt = the runner's
  // prefix cache hit) and provider-reported cache-hit / cache-written input tokens (remote)
  promptEvalMs?: number | null
  cachedTokens?: number | null
  cacheWriteTokens?: number | null
}

export type Conversation = {
  id: string
  title: string
  model: string | null
  settings?: ChatSettings
  updatedAt?: string
  createdAt?: string
  archivedAt?: string | null
  draft?: string // server-folded unsent composer text (survives logout / other devices)
  unread?: boolean // a scheduled run landed here and nobody opened it yet (server-cleared on open)
}

// Per-image origin metadata (aligned with `images`): the composer converts every
// upload to WebP — this records what the user ACTUALLY attached (format/name/size).
export type ImageMeta = { orig?: string; name?: string; bytes?: number } | null

export type ChatMessage = {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  images?: string[] // attached images (data URLs) — vision input on user turns
  imagesMeta?: ImageMeta[] // original format/name/size per image (post-WebP-conversion record)
  // What the VISION RELAY saw, when the chat's model cannot see: one entry per described image,
  // index-aligned with `images`. Shown as its own block so the reader can judge the description the
  // answer was actually built from (a describer that is silently wrong is the failure mode — 2026-08-03).
  // `model` is null on rows written before descriptions recorded their author.
  imageDescriptions?: { text: string; model: string | null; at: string | null }[]
  files?: { name: string; note?: string; chars?: number }[] // document attachments (extracted server-side)
  reasoning?: string | null
  provider?: string | null
  model?: string | null
  metrics?: ChatMetrics | null
  createdAt?: string
  skill?: { id: string; name: string } | null // the Skill this reply ran "as" (persisted server-side)
  // client-only flags
  pending?: boolean
  error?: string | null
  tools?: ToolActivity[]
  segments?: ReplySegment[] // interleaved text/tool weave (server-persisted; also built live)
  viewMarkdown?: boolean // per-message render toggle (default: markdown on)
  viewStats?: boolean    // per-message stats toggle (default: hidden)
  viewExpanded?: number[] // indices of expanded long segments (body = -1); default: all collapsed.
                          // per-SEGMENT, not per-message — a reply can have several long segments,
                          // and expanding one must not expand the rest (Ote, chat c2c2b3b1).
}

export type ChatModel = {
  id: string
  ownedBy?: string
  capabilities?: string[]
  inferred?: boolean // capabilities are only a name guess (no declared metadata / probes)
  byok?: boolean
  notChat?: boolean // verified non-chat specialist (embeddings/reranker/…) — segregated in the picker, blocked at send
  unsupported?: string[] // thinking/tools the model VERIFIABLY lacks — the ⚙ popover disables those toggles
  effectiveContext?: number // the context window a chat actually gets (Ollama: limit ∩ auto-optimize cap)
  cpu?: boolean // from a CPU-pinned provider (forceCpu) — the picker marks these "-cpu"
}

export type ChatModelsResponse = {
  canSelect: boolean
  defaultModel: string | null // EFFECTIVE default for this user (personal, if their role is unlocked, else platform)
  platformDefaultModel?: string | null
  canSetDefaultModel?: boolean // root unlocked this user's role to set a personal default
  backgroundGeneration?: boolean // EFFECTIVE: user pref (Options → Chat) layered over the root platform setting
  backgroundMaxConcurrent?: number // root limit: replies one user may have generating at once
  steerEnabled?: boolean // root setting: allow steering a reply mid-generation
  marathonEnabled?: boolean // root setting: allow Marathon mode (⚙ hides the toggle when off)
  maxSteersPerReply?: number // root limit: steers allowed per reply
  defaultSettings?: ChatSettings // platform ⚙ defaults for NEW chats (root's chat.defaultOptions over the built-ins)
  visionRelayDefault?: string | null // what the ⚙ relay picker's "(platform default)" resolves to, so the UI can name it
  speechEnabled?: boolean // root configured chat.speechModel — the 🔊 control only exists when a Voice does
  models: ChatModel[]
  errors?: { provider: string; message: string }[]
}

// ---- context usage (the `context_usage` status phase) ----
// The headline (window/used/free/usedPct) goes to every user; `categories`/`parts` are the prompt
// BREAKDOWN and are only sent when the server says `detail: true` (capability `context_detail`).
// They are optional here because their absence is the normal case for an unprivileged user, not an error.
export type ContextCategory = { key: string; label: string; tokens: number; pct: number | null }
export type ContextPart = { key: string; tokens: number }
export type ContextUsage = {
  window: number | null
  used: number
  free: number | null
  usedPct: number | null
  detail: boolean
  // true = computed from the prompt this conversation WOULD send (shown before it has ever replied in
  // this server process); absent = measured from the prompt actually sent on the last reply. A
  // projection omits the per-turn retrieval (ranked recall, conversation-search evidence), which
  // measured under 4% of the total — so it reads slightly LOW, never high.
  projected?: boolean
  categories?: ContextCategory[]
  parts?: ContextPart[]
}

// ---- SSE event shapes (from POST .../messages) ----
export type StreamEvent =
  | { type: 'status'; phase: string; model?: string; note?: string; skill?: string; name?: string; files?: number; triggered?: boolean; estimate?: number; window?: number; headroom?: number; tooBig?: boolean; used?: number; free?: number; usedPct?: number; estimated?: boolean; detail?: boolean; categories?: ContextCategory[]; parts?: ContextPart[] }
  | { type: 'token'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; id?: string; name: string; arguments: unknown }
  | { type: 'tool_result'; id?: string; name: string; result: string }
  | { type: 'steered'; text: string } // a steer was folded into the in-flight reply
  | { type: 'answer_superseded'; text?: string } // thinking model restarted its answer — drop the discarded run from the live bubble
  | { type: 'interaction'; text: string; icon?: string } // runtime narration of what's happening ("🔎 Searching…")
  // The vision relay finished ONE image. Unlike `interaction` (live-only narration), this carries
  // EVIDENCE — the description the answer is about to be built from — and is persisted on the message
  // row, so the block it feeds survives a reload.
  | { type: 'vision'; messageId: string; index: number; total?: number; model?: string; description: string }
  | { type: 'error'; code?: string; message?: string }
  | { type: 'done'; messageId: string; usage: unknown; metrics: ChatMetrics; title: string; model?: string; skill?: { id: string; name: string } }

// ---- REST ----
export const getChatModels = (): Promise<ChatModelsResponse> => apiGet('/v1/chat/models')

// Installed Skills the user may run a conversation "as" (persona code skills + imported
// Agent Skills). origin 'agent-skill' = imported .skill archive; files = bundled file count;
// modelInvocable=false keeps a skill out of the model's use_skill trigger catalog.
export type ChatSkill = { id: string; name: string; description: string; origin: string; files: number; modelInvocable?: boolean }
// binding gates the ⚙ Skill picker, slashCommands the composer "/" trigger (root levers).
export type ChatSkillsResponse = { skills: ChatSkill[]; binding?: boolean; slashCommands?: boolean }
export const listChatSkills = (): Promise<ChatSkillsResponse> => apiGet('/v1/chat/skills')

// ---- per-user chat preferences (new-chat model/options behavior + last-used snapshot) ----
export type ChatPrefs = {
  newChatModel: 'default' | 'last'   // new chat: snap to default vs carry over last model
  newChatOptions: 'last' | 'default' // new chat: carry over last ⚙ options vs snap to default
  backgroundGeneration: 'default' | 'on' | 'off' // leaving a generating chat: follow platform / keep running / cancel
  defaultModel: string | null // personal default model (only while root has the role unlocked)
  timezone: string | null // IANA zone, auto-synced from the browser — times/tools answer in it
  theme: 'light' | 'dark' | 'system' // appearance, synced across devices ('system' follows the OS)
  sound: Record<string, number> // per-emitter output level 0-100 (see lib/soundPrefs); server owns the channel list
  autoSpeak: boolean // read replies aloud AS THEY GENERATE; OFF by default (Ote's call)
  speechRate: number // playback speed for spoken replies, 0.75-1.5, pitch preserved (see lib/soundPrefs)
  lastModel: string | null
  lastSettings: ChatSettings | null
}
// ---- schedules (Milestone ②: proactive persona — trigger-fired jobs) ----
export type ScheduleTrigger =
  | { type: 'interval'; every: string }
  | { type: 'cron'; expr: string; tz?: string }
  | { type: 'at'; at: string }
  | { type: 'webhook'; token?: string } // token is server-minted; the fire URL is in Schedule.hookPath
export type ScheduleAction =
  | { type: 'skill-turn'; skillId: string | null; prompt: string; model: string; conversationId: string | null; tools?: string[] } // null skill = plain instruction turn; tools narrows the turn's toolset
  | { type: 'tool'; toolId: string; args?: Record<string, unknown> }
  | { type: 'http'; url: string; method?: string; headers?: Record<string, string>; body?: string } // root-only
export type Schedule = {
  id: string; name: string; trigger: ScheduleTrigger; action: ScheduleAction
  hookPath: string | null // webhook jobs: POST here (path only — prefix with the site origin)
  enabled: boolean; catchUp: boolean
  // why it's off: 'manual' | 'consecutive-failures' | 'boot-error' | 'target-deleted' (null while enabled)
  disabledReason: string | null
  lastRunAt: string | null; lastStatus: 'ok' | 'error' | null; lastError: string | null
  lastDurationMs: number | null; consecutiveFailures: number
  nextRunAt: string | null; running: boolean; createdAt: string
}
export type SchedulesResponse = {
  schedules: Schedule[]; maxPerUser: number; minIntervalMinutes: number; canSchedule: boolean
  canHttp: boolean; tools: { id: string; description: string }[]
}
export const listSchedules = (): Promise<SchedulesResponse> => apiGet('/v1/chat/schedules')
export const createSchedule = (body: { name: string; trigger: ScheduleTrigger; action: Partial<ScheduleAction>; catchUp?: boolean }): Promise<{ schedule: Schedule }> =>
  apiPost('/v1/chat/schedules', body)
export const updateSchedule = (id: string, patch: Partial<{ name: string; trigger: ScheduleTrigger; action: Partial<ScheduleAction>; catchUp: boolean; enabled: boolean }>): Promise<{ schedule: Schedule }> =>
  apiPatch(`/v1/chat/schedules/${id}`, patch)
export const runScheduleNow = (id: string): Promise<{ fired: boolean }> => apiPost(`/v1/chat/schedules/${id}/run`, {})
// webhook jobs: mint a FRESH fire URL — the old one dies immediately (leaked-URL remedy)
export const rotateScheduleHook = (id: string): Promise<{ schedule: Schedule }> => apiPost(`/v1/chat/schedules/${id}/rotate-hook`, {})
export const deleteSchedule = (id: string): Promise<{ ok: boolean }> => apiDelete(`/v1/chat/schedules/${id}`)
export type ScheduleRun = {
  id: string; startedAt: string; status: 'ok' | 'error'; durationMs: number | null
  summary: string | null; error: string | null
  conversation: { id: string; title: string | null } | null // where the run landed; null title = since deleted
}
export const listScheduleRuns = (id: string): Promise<{ runs: ScheduleRun[] }> => apiGet(`/v1/chat/schedules/${id}/runs`)
// natural-language create/edit: the model fills the form and hands back a validated
// PROPOSAL — nothing is written until the user reviews it and clicks Save/Create
export type ScheduleProposal = { name: string; trigger: ScheduleTrigger; action: ScheduleAction; catchUp: boolean }
export const assistSchedule = (body: { prompt: string; scheduleId?: string; model?: string }): Promise<{ proposal: ScheduleProposal; summary: string | null }> =>
  apiPost('/v1/chat/schedules/assist', body)

export const getChatPrefs = (): Promise<{ prefs: ChatPrefs; persisted: boolean }> => apiGet('/v1/me/chat-prefs')
export const saveChatPrefs = (patch: Partial<ChatPrefs>): Promise<{ prefs: ChatPrefs; persisted: boolean }> =>
  apiPatch('/v1/me/chat-prefs', patch)

export const listConversations = (q?: string, archived = false): Promise<{ conversations: Conversation[] }> => {
  const params = new URLSearchParams()
  if (q?.trim()) params.set('q', q.trim())
  if (archived) params.set('archived', '1')
  const qs = params.toString()
  return apiGet(`/v1/chat/conversations${qs ? `?${qs}` : ''}`)
}

export const createConversation = (body: { title?: string; model?: string; settings?: ChatSettings }): Promise<{ conversation: Conversation }> =>
  apiPost('/v1/chat/conversations', body)

// Todo (the state-driven Feature): the conversation's current working plan — rendered as
// a live checklist. The frontend NEVER owns Todo logic; it renders this snapshot and
// refetches on the 'todo-changed' push.
export type TodoTask = { id: string; title: string; description: string | null; status: 'pending' | 'running' | 'completed' | 'skipped' | 'failed' | 'cancelled'; ordinal: number }
export type TodoSnapshot = { id: string; title: string | null; status: string; tasks: TodoTask[]; currentTitle: string | null; total: number; completed: number; updatedAt: string } | null
export const getConversationTodo = (id: string): Promise<{ todo: TodoSnapshot }> => apiGet(`/v1/chat/conversations/${id}/todo`)
// Clear the working plan (the rail's ✕) — removes the checklist; the model rebuilds it on its next write_todos.
export const clearConversationTodo = (id: string): Promise<{ ok: boolean; cleared: boolean }> => apiDelete(`/v1/chat/conversations/${id}/todo`)

// HumanInteraction (the human-driven Feature): the model asked a structured question and
// the turn is HELD waiting. The frontend NEVER owns interaction logic; it renders the
// pending protocol snapshot and refetches on the 'interaction-created' push.
export type InteractionOption = { label: string; description: string | null }
export type InteractionQuestion = { question: string; header: string; options: InteractionOption[]; multiSelect: boolean; allowCustom: boolean }
export type PendingInteraction = { id: string; conversationId: string; status: string; questions: InteractionQuestion[]; expiresAt: string | null; createdAt: string } | null
export const getPendingInteraction = (id: string): Promise<{ interaction: PendingInteraction }> =>
  apiGet(`/v1/chat/conversations/${id}/interactions/pending`)
// Resolve the question: structured answers, free text (typing while pending IS the answer),
// or skip. First answer wins — a 409 means another page already answered.
export const answerConversationInteraction = (
  id: string,
  iid: string,
  body: { answers?: { selected?: string[]; custom?: string }[]; freeText?: string; skip?: boolean },
): Promise<{ ok: boolean; status: string }> => apiPost(`/v1/chat/conversations/${id}/interactions/${iid}/answer`, body)

// `contextUsage` is the LAST MEASURED usage for this conversation (absent until a reply has been
// generated in this server process). It carries `categories`/`parts` only for context_detail — the
// server withholds them, so this is not a way around the gate.
export const getConversation = (id: string): Promise<{ conversation: Conversation; messages: ChatMessage[]; todo?: TodoSnapshot; activeRun?: boolean; contextUsage?: ContextUsage }> =>
  apiGet(`/v1/chat/conversations/${id}`)

// Schedules that run INTO this chat — the delete modal warns before removing it (deleting the
// chat turns those schedules inactive until they're pointed at a new destination).
export const getScheduleTargets = (id: string): Promise<{ schedules: { id: string; name: string; enabled: boolean }[]; activeCount: number }> =>
  apiGet(`/v1/chat/conversations/${id}/schedule-targets`)

export const updateConversation = (id: string, body: { title?: string; model?: string; settings?: ChatSettings; archived?: boolean; draft?: string }): Promise<{ conversation: Conversation }> =>
  apiPatch(`/v1/chat/conversations/${id}`, body)

export const deleteConversation = (id: string): Promise<{ ok: boolean }> =>
  apiDelete(`/v1/chat/conversations/${id}`)

export const suggestTitle = (id: string): Promise<{ suggestedTitle: string }> =>
  apiPost(`/v1/chat/conversations/${id}/suggest-title`, {})

// ---- generation (shared) ----
// Two modes: stream=true reads SSE live; stream=false does one buffered JSON call and
// replays it as the same event sequence, so the caller's consumer is identical either way.
async function* streamSSE(path: string, body: Record<string, unknown>, signal: AbortSignal | undefined, stream: boolean): AsyncGenerator<StreamEvent> {
  let res: Response
  try {
    res = await fetch(apiUrl(path), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: stream ? 'text/event-stream' : 'application/json' },
      body: JSON.stringify({ ...body, stream }),
      signal,
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return
    yield { type: 'error', message: (e as Error)?.message || 'request failed' }
    return
  }

  if (!res.ok || !res.body) {
    let message = `HTTP ${res.status}`
    let code: string | undefined
    try {
      const j = await res.json()
      message = j?.error?.message || message
      // Carry the CODE through, not just the prose. Callers need to react to specific refusals
      // (already_generating → fold the text in as a steer instead of losing it); a
      // message-only error forces them to match on English, which silently breaks on rewording.
      code = j?.error?.code || undefined
    } catch { /* non-json */ }
    yield { type: 'error', code, message }
    return
  }

  // Non-stream: one JSON response, replayed as events.
  if (!stream) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- replay of the reply JSON; typing it strictly fights the StreamEvent 'done' contract (server always sends id/metrics/title)
    let j: any
    try { j = await res.json() } catch { yield { type: 'error', message: 'bad response' }; return }
    for (const t of (j.tools || [])) {
      yield { type: 'tool_call', id: t.id, name: t.name, arguments: t.args }
      yield { type: 'tool_result', id: t.id, name: t.name, result: t.result }
    }
    if (j.message?.reasoning) yield { type: 'reasoning', text: j.message.reasoning }
    if (j.message?.content) yield { type: 'token', text: j.message.content }
    if (j.error) yield { type: 'error', code: j.error.code, message: j.error.message }
    yield { type: 'done', messageId: j.message?.id, usage: null, metrics: j.metrics, title: j.title, model: j.message?.model, skill: j.skill || undefined }
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const t = line.trim()
        if (!t.startsWith('data:')) continue
        const payload = t.slice(5).trim()
        if (!payload) continue
        try {
          yield JSON.parse(payload) as StreamEvent
        } catch { /* ignore malformed frame */ }
      }
    }
  } catch (e) {
    if ((e as Error)?.name !== 'AbortError') throw e
    // aborted (Stop) — silently end; server keeps the partial reply
  }
}

// A document attachment on its way to the server (text read client-side, or binary as data URL).
export type OutgoingFile = { name: string; text?: string; dataUrl?: string }

// Send a new user message (optionally with images/files); stream (SSE) or buffer (JSON) per `stream`.
export function sendMessage(conversationId: string, content: string, signal?: AbortSignal, stream = true, images?: string[], files?: OutgoingFile[], imagesMeta?: ImageMeta[], skillOnce?: string): AsyncGenerator<StreamEvent> {
  const body: Record<string, unknown> = { content }
  if (images?.length) body.images = images
  if (images?.length && imagesMeta?.length) body.imagesMeta = imagesMeta
  if (files?.length) body.files = files
  if (skillOnce) body.skillOnce = skillOnce // one-shot /skill-name binding for this send only
  return streamSSE(`/v1/chat/conversations/${conversationId}/messages`, body, signal, stream)
}

// Steer the in-flight reply: a mid-generation message the running turn folds in at its
// next step (valid only while that conversation is generating). Plain JSON, not SSE —
// the injected steer arrives back on the OPEN reply stream as a `steered` event.
export function steerConversation(conversationId: string, content: string): Promise<{ ok: true }> {
  return apiPost(`/v1/chat/conversations/${conversationId}/steer`, { content })
}

// Re-run the last user turn (drops the previous assistant reply server-side).
// `model` retries on a DIFFERENT model — the conversation switches to it (select_model users).
export function regenerate(conversationId: string, signal?: AbortSignal, stream = true, model?: string): AsyncGenerator<StreamEvent> {
  return streamSSE(`/v1/chat/conversations/${conversationId}/regenerate`, model ? { model } : {}, signal, stream)
}

// Edit a USER message and re-run from that point (everything after it is dropped server-side).
export function editMessage(conversationId: string, messageId: string, content: string, signal?: AbortSignal, stream = true): AsyncGenerator<StreamEvent> {
  return streamSSE(`/v1/chat/conversations/${conversationId}/messages/${messageId}/edit`, { content }, signal, stream)
}

// ---- memory ----
// notes = user-curated (always injected); `assistant` = the v2 memory the assistant actually uses
// for recall (Persona Memory v2 — the `memories` table). (Legacy MemoryKvItem/MemoryFactItem kept
// for the admin Users-page read-only view, which still reads v1.)
export type MemoryItem = { id: string; content: string; isEnabled: boolean; createdAt?: string }
export type MemoryKvItem = { id: string; key: string; value: unknown; namespace?: string }
export type MemoryFactItem = { id: string; subject: string; attribute: string; value: unknown; source?: string | null; confidence?: number | null }
export type MemoryV2Item = { id: string; kind: 'episodic' | 'semantic' | 'identity'; content: string; entity?: string | null; attribute?: string | null; importance?: number | null; pinned?: boolean }

export const listMemories = (): Promise<{ memories: MemoryItem[]; assistant: MemoryV2Item[] }> =>
  apiGet('/v1/chat/memory')
export const addMemory = (content: string): Promise<{ memory: MemoryItem }> => apiPost('/v1/chat/memory', { content })
export const updateMemory = (id: string, body: { content?: string; isEnabled?: boolean }): Promise<{ memory: MemoryItem }> =>
  apiPatch(`/v1/chat/memory/${id}`, body)
export const deleteMemory = (id: string): Promise<{ ok: boolean }> => apiDelete(`/v1/chat/memory/${id}`)
export const deleteMemoryV2 = (id: string): Promise<{ ok: boolean }> => apiDelete(`/v1/chat/memory/v2/${id}`)

// THE VOICE (MM Arc / Audio phase POC) — render one assistant reply as speech. Returns the audio blob
// plus the server-computed duration: the client never parses the WAV itself, because a streamed header
// lies about its length (fish-speech claims 134,217s for a 3.7s clip) and the server has already
// repaired it. Not a JSON endpoint, so it bypasses apiPost.
// 'codeBlocks=1;tables=2' -> "1 code block and 2 tables were skipped — read them on screen."
// `math` was missing here while the server has counted formulas since the day it learned to drop them, so
// a reply full of notation reported nothing at all. A parser that silently ignores a key it does not know
// is how a count goes missing without anyone noticing.
const OMIT_WORDS: Record<string, string> = { codeBlocks: 'code block', tables: 'table', images: 'image', math: 'formula' }

/** 'codeBlocks=1;tables=2' -> { codeBlocks: 1, tables: 2 }. Live speech sums these across pieces. */
export function parseOmitted(header: string | null): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of String(header || '').split(';').map((s) => s.trim()).filter(Boolean)) {
    const [k, v] = p.split('=')
    const n = Number(v)
    if (OMIT_WORDS[k] && Number.isFinite(n) && n > 0) out[k] = (out[k] || 0) + n
  }
  return out
}

/**
 * The same facts, short enough for the live-speech pill: "skipped 1 table · 2 code blocks". The full
 * sentence belongs under a message, where there is a line to put it on; a pill is centre-anchored and grows
 * both ways, so a sentence there pushes into the scroll button on a narrow window.
 */
export function omittedShort(counts: Record<string, number>): string {
  const bits: string[] = []
  for (const [k, n] of Object.entries(counts || {})) {
    const word = OMIT_WORDS[k]
    if (!word || !(n > 0)) continue
    bits.push(`${n} ${word}${n > 1 ? 's' : ''}`)
  }
  return bits.length ? `skipped ${bits.join(' · ')}` : ''
}

export function describeOmitted(header: string | null | Record<string, number>): string {
  const counts = typeof header === 'object' && header !== null ? header : parseOmitted(header)
  const bits: string[] = []
  for (const [k, n] of Object.entries(counts)) {
    const word = OMIT_WORDS[k]
    if (!word || !(n > 0)) continue
    bits.push(`${n} ${word}${n > 1 ? 's' : ''}`)
  }
  if (!bits.length) return ''
  const total = bits.length === 1 && !/s$/.test(bits[0])
  return `${bits.join(' and ')} ${total ? 'was' : 'were'} skipped — read them on screen.`
}

export type SpokenChunk = {
  blob: Blob
  seconds: number | null
  clipped: boolean
  omitted: string
  chunk: number | null   // this piece's index, when the chunked path was used
  chunks: number | null  // how many pieces the reply becomes
  cached: boolean
}

/**
 * Speak one message. Pass `chunk` to fetch a single sentence-sized piece — the caller plays piece 0 while
 * fetching piece 1, so first sound arrives in ~3s instead of ~46s on a long reply. Omit it for one clip.
 */
/**
 * Speak ONE already-cut piece of text inside a conversation — the ANSWER-WITH-SPEAK path.
 * Scoped to a conversation because a text field is not a capability; the server caps the length.
 */
// `blob: null` = the server had NOTHING TO SAY for this piece (204): it was only a table or a code block,
// which is a normal outcome of speaking a markdown reply, not a failure to report. The omission counts come
// back either way, so the indicator can explain the silence instead of leaving it a mystery.
/**
 * Ask the sidecar to load its model NOW. Fire-and-forget by design (Ote: *"it should warm up omni right after
 * user send a prompt. so when result start going, it can catch up faster"*) — the caller must not await it and
 * must not show a failure: if the warm-up does not happen, the first piece loads the model as before.
 */
export function warmSpeech(): void {
  void fetch('/v1/chat/voice/warm', { method: 'POST' }).catch(() => {})
}

export type SpokenPiece = { blob: Blob | null; seconds: number | null; omitted: Record<string, number> }
/**
 * Render ONE piece to audio.
 *
 * ⚠ `signal` IS NOT OPTIONAL IN SPIRIT — pass it. Ote, 2026-08-06: *"when i stop or send another message which
 * stop it. the queue render is not stop. so the gpu still take resource"*. Pieces are fetched AHEAD of playback,
 * so at the moment Stop is pressed there are several renders in flight. Without a signal the caller merely stops
 * READING them: the HTTP requests continue, the server forwards them, and the sidecar renders every one on the
 * GPU for audio nobody will ever hear.
 *
 * This is the same lesson the ollama adapter taught: CANCELLATION IS PART OF THE CONTRACT, NOT A COURTESY. A
 * borrowed remote resource must be released on EVERY exit path, and the exit path you forget is the abnormal one.
 */
export async function speakText(conversationId: string, text: string, signal?: AbortSignal): Promise<SpokenPiece> {
  const res = await fetch(`/v1/chat/conversations/${conversationId}/speak-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  })
  if (!res.ok) {
    let message = `Speech failed (${res.status})`
    try { const j = await res.json(); message = j?.error?.message || j?.message || message } catch { /* binary */ }
    throw new Error(message)
  }
  const omitted = parseOmitted(res.headers.get('x-audio-omitted'))
  if (res.status === 204) return { blob: null, seconds: null, omitted }
  const blob = await res.blob()
  const seconds = Number(res.headers.get('x-audio-seconds'))
  return { blob: blob.size ? blob : null, seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null, omitted }
}

export async function speakMessage(conversationId: string, messageId: string, chunk?: number): Promise<SpokenChunk> {
  const qs = chunk === undefined ? '' : `?chunk=${chunk}`
  const res = await fetch(`/v1/chat/conversations/${conversationId}/messages/${messageId}/speak${qs}`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) {
    let message = `Speech failed (${res.status})`
    try {
      const j = await res.json()
      // Our routes answer {error:{code,message}}; Fastify's OWN errors answer {statusCode,error,message}.
      // Reading only the first shape is how an unexpected 500 became a bare 'Speech failed (500)'
      // with the real reason thrown away.
      message = j?.error?.message || j?.message || message
    } catch { /* binary/empty body */ }
    throw new Error(message)
  }
  const seconds = Number(res.headers.get('x-audio-seconds'))
  return {
    blob: await res.blob(),
    seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
    clipped: res.headers.get('x-audio-clipped') === '1',
    // Code blocks / tables / images cannot be spoken and are dropped. The server reports ASCII COUNTS
    // ('codeBlocks=1;tables=1') and the SENTENCE is composed here — a header is a latin1 channel, and
    // putting prose in one (with an em dash) is what made every code-bearing reply return 500.
    omitted: describeOmitted(res.headers.get('x-audio-omitted')),
    chunk: res.headers.get('x-audio-chunk') ? Number(res.headers.get('x-audio-chunk')) : null,
    chunks: res.headers.get('x-audio-chunks') ? Number(res.headers.get('x-audio-chunks')) : null,
    cached: res.headers.get('x-audio-cached') === '1',
  }
}
