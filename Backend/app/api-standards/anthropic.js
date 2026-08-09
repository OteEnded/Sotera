// Anthropic Messages API standard — translation layer.
//
// Serves the Anthropic wire format (the one Claude Code / the Anthropic SDK speaks) on top of
// the gateway's internal canonical format. Three jobs:
//   1. request  : Anthropic {model, system, messages[blocks], tools, ...} -> internal request
//   2. response : internal {message, usage} -> Anthropic message object
//   3. stream   : internal events (token/reasoning/tool_call/done/error) -> Anthropic SSE
//                 (message_start / content_block_* / message_delta / message_stop)
//
// The internal canonical shapes (proven against both adapters):
//   assistant tool turn : { role:'assistant', content, tool_calls:[{ id, name, arguments }] }
//   tool result         : { role:'tool', tool_call_id, name, content }
//   tools               : [{ type:'function', function:{ name, description, parameters } }]

import crypto from 'node:crypto'

export function genMessageId() {
  return 'msg_' + crypto.randomBytes(12).toString('hex')
}

// Anthropic error envelope: { type:'error', error:{ type, message } }
export function anthropicError(type, message) {
  return { type: 'error', error: { type, message } }
}

// Rough token estimate (chars/4) — used for count_tokens and message_start input usage.
// Good enough for context-window bookkeeping; not billing-grade.
export function estimateTokens(value) {
  const s = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  return Math.max(1, Math.ceil(s.length / 4))
}

// ---------------------------------------------------------------------------
// Model resolution — Claude Code sends Anthropic model ids (claude-*). Map them onto the
// platform's "<provider>/<model>" ids via config `api.anthropic`:
//   { "defaultModel": "ollama/gemma4:26b", "modelMap": { "claude-3-5-haiku*": "ollama/gemma4:e4b" } }
// A requested id that already looks like "<provider>/<model>" for a configured provider passes
// through untouched (lets `claude --model ollama/gemma4:26b` work directly).
// ---------------------------------------------------------------------------
export function resolveAnthropicModel(serverConfig, requested) {
  const cfg = serverConfig?.api?.anthropic || {}
  const providers = serverConfig?._effectiveProviders || serverConfig?.providers || {}
  const req = typeof requested === 'string' ? requested.trim() : ''

  const slash = req.indexOf('/')
  if (slash > 0 && providers[req.slice(0, slash)]) return { modelId: req, mapped: false }

  const map = cfg.modelMap || {}
  if (map[req]) return { modelId: map[req], mapped: true }
  for (const [pattern, target] of Object.entries(map)) {
    if (pattern.endsWith('*') && req.startsWith(pattern.slice(0, -1))) return { modelId: target, mapped: true }
  }

  const fallback = cfg.defaultModel || serverConfig?.chat?.defaultModel || null
  return { modelId: fallback, mapped: true }
}

// ---------------------------------------------------------------------------
// Request translation
// ---------------------------------------------------------------------------

function blockText(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
}

function toolResultContent(block) {
  const c = block?.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    const text = blockText(c)
    return text || JSON.stringify(c)
  }
  return c == null ? '' : JSON.stringify(c)
}

/**
 * Anthropic request body -> internal { messages, tools, options }.
 * Tolerates everything the Anthropic SDK sends; unsupported block types (images, documents,
 * thinking replays with signatures) degrade gracefully instead of erroring.
 */
export function toInternalRequest(body) {
  const messages = []

  // system: string OR array of text blocks
  if (typeof body.system === 'string' && body.system.trim()) {
    messages.push({ role: 'system', content: body.system })
  } else if (Array.isArray(body.system)) {
    const sys = blockText(body.system)
    if (sys) messages.push({ role: 'system', content: sys })
  }

  for (const msg of body.messages || []) {
    const role = msg?.role
    if (role !== 'user' && role !== 'assistant') continue

    if (typeof msg.content === 'string') {
      messages.push({ role, content: msg.content })
      continue
    }
    if (!Array.isArray(msg.content)) continue

    // Split a block array into ordered internal messages. tool_result blocks become role:'tool'
    // messages; text accumulates into one user/assistant message; tool_use (assistant) becomes
    // tool_calls on the assistant message.
    const texts = []
    const toolCalls = []
    const toolResults = []
    const images = []
    for (const block of msg.content) {
      switch (block?.type) {
        case 'text':
          if (typeof block.text === 'string') texts.push(block.text)
          break
        case 'tool_use':
          toolCalls.push({ id: block.id, name: block.name, arguments: block.input ?? {} })
          break
        case 'tool_result':
          toolResults.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content: toolResultContent(block) || (block.is_error ? '(tool errored)' : '(no output)'),
          })
          break
        case 'image':
          // base64 sources become canonical data-URL images (the adapters' wire shape);
          // url sources would require server-side fetching — degrade those instead.
          if (block.source?.type === 'base64' && block.source.data) {
            images.push(`data:${block.source.media_type || 'image/png'};base64,${block.source.data}`)
          } else {
            texts.push('[image omitted — only base64 image sources are supported by this gateway]')
          }
          break
        case 'document':
          texts.push(`[${block.type} omitted — not supported by this gateway]`)
          break
        case 'thinking':
        case 'redacted_thinking':
          break // replayed thinking from a previous turn — local models don't need it
        default:
          break
      }
    }

    // tool results come first (they answer the PREVIOUS assistant turn), then the text turn
    messages.push(...toolResults)
    if (role === 'assistant' && toolCalls.length) {
      messages.push({ role: 'assistant', content: texts.join('\n'), tool_calls: toolCalls })
    } else if (texts.length || images.length) {
      const m = { role, content: texts.join('\n') }
      if (images.length) m.images = images
      messages.push(m)
    }
  }

  const tools = Array.isArray(body.tools)
    ? body.tools
        .filter((t) => t && t.name)
        .map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description || '', parameters: t.input_schema || { type: 'object' } },
        }))
    : undefined

  const options = { stream: Boolean(body.stream) }
  if (body.max_tokens != null) options.max_tokens = body.max_tokens
  if (body.temperature != null) options.temperature = body.temperature
  if (body.top_p != null) options.top_p = body.top_p
  // Reasoning defaults ON for this surface: thinking models (gemma4 etc.) emit thinking deltas
  // that the adapters DROP when reasoning is disabled — the reply would silently vanish into the
  // think-budget. Enabled, they surface as Anthropic thinking blocks (native protocol semantics).
  options.reasoning = { enabled: body.thinking?.type !== 'disabled' }

  return { messages, tools, options }
}

// ---------------------------------------------------------------------------
// Response translation (non-stream)
// ---------------------------------------------------------------------------

// Providers return tool calls in either OpenAI form ({function:{name,arguments}}) or the
// normalized form ({name,arguments}); arguments may be a JSON string or an object.
function normalizeToolCall(call, i) {
  const fn = call?.function || {}
  let args = fn.arguments !== undefined ? fn.arguments : call?.arguments
  if (typeof args === 'string') { try { args = JSON.parse(args) } catch { args = { _raw: args } } }
  return {
    id: call?.id || `toolu_${crypto.randomBytes(8).toString('hex')}${i}`,
    name: fn.name || call?.name || 'unknown_tool',
    input: args ?? {},
  }
}

/** internal { message, usage } -> Anthropic message object */
export function toAnthropicMessage({ requestedModel, message, usage }) {
  const content = []
  if (message?.content) content.push({ type: 'text', text: message.content })
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : []
  for (let i = 0; i < toolCalls.length; i++) {
    const t = normalizeToolCall(toolCalls[i], i)
    content.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input })
  }
  if (content.length === 0) content.push({ type: 'text', text: '' })

  return {
    id: genMessageId(),
    type: 'message',
    role: 'assistant',
    model: requestedModel,
    content,
    stop_reason: toolCalls.length ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: usage?.promptTokens ?? 0,
      output_tokens: usage?.completionTokens ?? 0,
    },
  }
}

// ---------------------------------------------------------------------------
// Streaming translation
// ---------------------------------------------------------------------------

export const ANTHROPIC_SSE_HEADERS = Object.freeze({
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
})

/**
 * Stateful writer that turns the gateway's internal stream events into an Anthropic SSE
 * event sequence. Content blocks are opened lazily and indexed in arrival order
 * (thinking -> text -> tool_use is typical). Every write is `event: X\ndata: {json}\n\n`.
 */
export class AnthropicStreamWriter {
  constructor(raw, { requestedModel, inputTokens = 0 }) {
    this.raw = raw
    this.model = requestedModel
    this.inputTokens = inputTokens
    this.nextIndex = 0
    this.openType = null // 'thinking' | 'text' | null (tool_use blocks open+close atomically)
    this.openIndex = -1
    this.sawToolUse = false
    this.outputTokens = 0
  }

  _write(event, data) {
    if (this.raw.writableEnded || this.raw.destroyed) return
    this.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    if (typeof this.raw.flush === 'function') this.raw.flush()
  }

  start() {
    this._write('message_start', {
      type: 'message_start',
      message: {
        id: genMessageId(),
        type: 'message',
        role: 'assistant',
        model: this.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: this.inputTokens, output_tokens: 0 },
      },
    })
    this._write('ping', { type: 'ping' })
  }

  _closeOpenBlock() {
    if (this.openType) {
      this._write('content_block_stop', { type: 'content_block_stop', index: this.openIndex })
      this.openType = null
    }
  }

  _ensureBlock(type) {
    if (this.openType === type) return
    this._closeOpenBlock()
    this.openIndex = this.nextIndex++
    this.openType = type
    const content_block = type === 'thinking' ? { type: 'thinking', thinking: '', signature: '' } : { type: 'text', text: '' }
    this._write('content_block_start', { type: 'content_block_start', index: this.openIndex, content_block })
  }

  text(text) {
    if (!text) return
    this._ensureBlock('text')
    this.outputTokens += estimateTokens(text)
    this._write('content_block_delta', { type: 'content_block_delta', index: this.openIndex, delta: { type: 'text_delta', text } })
  }

  thinking(text) {
    if (!text) return
    this._ensureBlock('thinking')
    this.outputTokens += estimateTokens(text)
    this._write('content_block_delta', { type: 'content_block_delta', index: this.openIndex, delta: { type: 'thinking_delta', thinking: text } })
  }

  // Internal tool_call events arrive as one complete call -> emit an atomic tool_use block.
  toolUse(call, i = 0) {
    this._closeOpenBlock()
    const t = normalizeToolCall(call, i)
    const index = this.nextIndex++
    this.sawToolUse = true
    this.outputTokens += estimateTokens(t.input)
    this._write('content_block_start', {
      type: 'content_block_start',
      index,
      content_block: { type: 'tool_use', id: t.id, name: t.name, input: {} },
    })
    this._write('content_block_delta', {
      type: 'content_block_delta',
      index,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(t.input ?? {}) },
    })
    this._write('content_block_stop', { type: 'content_block_stop', index })
  }

  error(code, message) {
    this._write('error', anthropicError('api_error', `${code || 'error'}: ${message || 'stream error'}`))
  }

  finish(usage) {
    this._closeOpenBlock()
    const outputTokens = usage?.completionTokens ?? this.outputTokens
    this._write('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: this.sawToolUse ? 'tool_use' : 'end_turn', stop_sequence: null },
      usage: { output_tokens: outputTokens },
    })
    this._write('message_stop', { type: 'message_stop' })
    if (!this.raw.writableEnded && !this.raw.destroyed) this.raw.end()
  }
}
