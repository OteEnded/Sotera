// OpenAI wire-format helpers — turn our normalized provider output into the
// shapes the OpenAI API (and every OpenAI-compatible client) expects.
//
//   non-stream : chat.completion object
//   stream     : chat.completion.chunk objects, each on a `data: ` line,
//                terminated by `data: [DONE]`

import crypto from 'node:crypto'

function genId() {
  return 'chatcmpl-' + crypto.randomBytes(12).toString('hex')
}

function nowSec() {
  return Math.floor(Date.now() / 1000)
}

function totalTokens(p, c) {
  return p != null && c != null ? p + c : null
}

// Render ANY provider's tool call into a spec-compliant OpenAI tool_call. Providers
// hand us varied shapes — canonical `{id,name,arguments:obj}` (our normalizer), raw
// Ollama `{function:{name,arguments:OBJECT,index}}`, or already-OpenAI
// `{id,type,function:{name,arguments:STRING}}`. OpenAI clients REQUIRE
// `function.arguments` to be a JSON STRING, a top-level `type:"function"` and `id`,
// and no stray fields (Ollama leaks `function.index`). Shared by the non-stream and
// stream paths so both emit an identical shape.
function toOpenAIToolCall(call, index) {
  const fn = (call && typeof call.function === 'object' && call.function) || {}
  const name = fn.name ?? call?.name ?? ''
  const rawArgs = fn.arguments !== undefined ? fn.arguments : call?.arguments
  const argStr = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs ?? {})
  return {
    index,
    id: call?.id || 'call_' + crypto.randomBytes(9).toString('hex'),
    type: 'function',
    function: { name, arguments: argStr },
  }
}

// Non-streaming OpenAI chat.completion from { message, usage }.
export function toChatCompletion({ modelId, message, usage }) {
  const choiceMessage = { role: 'assistant', content: message?.content ?? '' }
  if (message?.reasoning_content) choiceMessage.reasoning_content = message.reasoning_content
  const hasToolCalls = Array.isArray(message?.tool_calls) && message.tool_calls.length > 0
  if (hasToolCalls) choiceMessage.tool_calls = message.tool_calls.map((c, i) => toOpenAIToolCall(c, i))

  return {
    id: genId(),
    object: 'chat.completion',
    created: nowSec(),
    model: modelId,
    choices: [
      {
        index: 0,
        message: choiceMessage,
        finish_reason: hasToolCalls ? 'tool_calls' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: usage?.promptTokens ?? null,
      completion_tokens: usage?.completionTokens ?? null,
      total_tokens: totalTokens(usage?.promptTokens, usage?.completionTokens),
    },
  }
}

// Streaming: one formatter per response (shared id + created across chunks).
export function makeStreamFormatter(modelId) {
  const base = { id: genId(), object: 'chat.completion.chunk', created: nowSec(), model: modelId }
  const choice = (delta, finish_reason = null) => ({ ...base, choices: [{ index: 0, delta, finish_reason }] })

  return {
    role: () => choice({ role: 'assistant' }),
    content: (text) => choice({ content: text }),
    reasoning: (text) => choice({ reasoning_content: text }),
    toolCall: (call, idx) => choice({ tool_calls: [toOpenAIToolCall(call, idx)] }),
    final: (finishReason, usage) => {
      const c = choice({}, finishReason || 'stop')
      if (usage) {
        c.usage = {
          prompt_tokens: usage.promptTokens ?? null,
          completion_tokens: usage.completionTokens ?? null,
          total_tokens: totalTokens(usage.promptTokens, usage.completionTokens),
        }
      }
      return c
    },
  }
}

// SSE line for an OpenAI streaming chunk (note: no `event:` field — OpenAI
// streams are plain `data: <json>` lines, terminated by `data: [DONE]`).
export function sseData(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`
}

export const SSE_DONE = 'data: [DONE]\n\n'

export const OPENAI_SSE_HEADERS = Object.freeze({
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
})
