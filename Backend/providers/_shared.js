// Helpers used by all provider adapters (ollama, openai-compatible, …) to
// normalize reasoning content emitted in varied shapes by different models.
// Centralized so a fix here applies to every adapter.

export function stripReasoningFields(message) {
  if (!message || typeof message !== 'object') return message
  const { reasoning_content, thinking, reasoning, ...rest } = message
  return rest
}

export function extractReasoningText(message) {
  const candidates = [message?.reasoning_content, message?.thinking, message?.reasoning]
  for (const candidate of candidates) {
    if (!candidate) continue
    if (typeof candidate === 'string') return candidate.trim()
    if (Array.isArray(candidate)) {
      const text = candidate
        .map((entry) => (typeof entry === 'string' ? entry : entry?.text || entry?.content || ''))
        .filter(Boolean)
        .join('\n')
        .trim()
      if (text) return text
    }
    if (typeof candidate === 'object') {
      const t = candidate.content || candidate.text || ''
      if (typeof t === 'string' && t.trim()) return t.trim()
    }
  }
  return ''
}

// Streaming variant: returns the raw reasoning DELTA for one chunk WITHOUT trimming,
// so whitespace between fragments is preserved (trimming each delta would merge words).
// Use this in stream()/per-chunk handling; use extractReasoningText() for whole messages.
export function extractReasoningDelta(message) {
  const candidates = [message?.reasoning_content, message?.thinking, message?.reasoning]
  for (const candidate of candidates) {
    if (candidate == null) continue
    if (typeof candidate === 'string') {
      if (candidate.length > 0) return candidate
      continue
    }
    if (Array.isArray(candidate)) {
      const text = candidate
        .map((entry) => (typeof entry === 'string' ? entry : entry?.text || entry?.content || ''))
        .join('')
      if (text) return text
    }
    if (typeof candidate === 'object') {
      const t = candidate.content || candidate.text || ''
      if (typeof t === 'string' && t.length) return t
    }
  }
  return ''
}

// Thinking-model draft reclassifier (pure + testable).
//
// Separates PROVIDER OUTPUT from the canonical conversational message. qwen3.x and kindred thinking
// models interleave think→answer→think→answer within one response: they draft an answer, reconsider,
// and draft again. Ollama streams each `content` and `thinking` as separate deltas, so naive
// concatenation stacks every abandoned draft into one garbled reply.
//
// This tracks the current answer RUN. When content resumes after intervening thinking, the run so far
// is DISCARDED OUTPUT — not reasoning (that's the thinking channel), and not the answer. It is NOT
// folded into `reasoning` (which stays strictly the model's thinking); instead an `answer_superseded`
// event carries the draft text so downstream can record it OUTSIDE canonical content (e.g. a `draft`
// segment). That keeps abandoned output out of both the answer AND the replayed history, while
// preserving it for inspection. Only the FINAL run becomes `content`.
//
// Detection assumption (empirically true for the models in use — qwen keeps drafting inside the
// thinking channel and only emits multiple CONTENT runs when it genuinely restarts): a post-thinking
// content run REPLACES the prior run. A future refinement can score restart-confidence (prior run
// incomplete · topic restart · repeated intro/greeting) if a continuation-style model appears; until
// then a misclassified run is still preserved in segments, so it is never data-loss.
//
// Usage: feed each message delta to push(msg) and yield the events it returns, in order; call
// result() at the end for the final { content, reasoning }. Stateful but self-contained, so a test
// can drive it with a synthetic delta sequence and assert both the event stream and the final split.
export function createDraftReclassifier({ reasoningEnabled = false } = {}) {
  let reasoningBuf = '' // strictly the thinking channel — never drafts
  let runBuf = '' // current answer run (may be superseded by a later run, or be the final answer)
  let sawReasoningSinceRun = false // thinking arrived after this run's first content delta
  return {
    push(msg) {
      const events = []
      if (!msg) return events
      if (msg.content) {
        if (runBuf && sawReasoningSinceRun) {
          // prior run is discarded output — surface it for downstream to record outside content;
          // do NOT put it in reasoning (it isn't thinking)
          events.push({ type: 'answer_superseded', text: runBuf })
          runBuf = ''
        }
        runBuf += msg.content
        sawReasoningSinceRun = false
        events.push({ type: 'text', text: msg.content })
      }
      if (reasoningEnabled) {
        const reasoningDelta = extractReasoningDelta(msg)
        if (reasoningDelta) {
          reasoningBuf += reasoningDelta
          if (runBuf) sawReasoningSinceRun = true // thinking resumed AFTER answer text began
          events.push({ type: 'reasoning', text: reasoningDelta })
        }
      }
      return events
    },
    result() {
      return { content: runBuf, reasoning: reasoningBuf } // content = final run; reasoning = thinking only
    },
  }
}

export function normalizeMessage(message, { reasoningEnabled }) {
  const cleaned = stripReasoningFields(message)
  if (!reasoningEnabled) return cleaned
  const reasoning = extractReasoningText(message)
  if (!reasoning) return cleaned
  return { ...cleaned, reasoning_content: reasoning }
}
