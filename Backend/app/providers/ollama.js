// Native Ollama client. Sotera talks to the local runtime DIRECTLY — she is not a client of
// OteLLMServices. That is Ote's shape (a): the persona owns local resources natively, and OLS is
// demoted to one API provider among several.
//
// ⚠️ THIS IS THE CLIENT, NOT THE MANAGER. Calling /api/chat is the easy half. The half that makes
// shape (a) real — GPU arbitration via /api/ps, deciding what may be resident, and surviving a dead
// llama-server mid-stream — is a separate component and is NOT built yet. Do not mistake this file
// for local-resource ownership.
//
// ⛔ OLLAMA IS OTE'S AND ALWAYS-ON. Never start, stop or restart it from here. If it is down, say so.

const DEFAULT_HOST = 'http://127.0.0.1:11434'

export function createOllamaProvider({ host = DEFAULT_HOST, log = null } = {}) {
  const base = host.replace(/\/+$/, '')

  return {
    kind: 'ollama',
    host: base,

    async listModels() {
      const res = await fetch(`${base}/api/tags`)
      if (!res.ok) throw new Error(`ollama /api/tags -> ${res.status}`)
      const json = await res.json()
      return (json.models || []).map((m) => ({ id: m.name, size: m.size, family: m.details?.family }))
    },

    /** Models resident right now. The manager will need this; exposed early so it is not bolted on later. */
    async running() {
      const res = await fetch(`${base}/api/ps`)
      if (!res.ok) throw new Error(`ollama /api/ps -> ${res.status}`)
      return (await res.json()).models || []
    },

    /**
     * Stream a chat turn. Yields {type:'delta'|'done', ...}.
     *
     * Ollama streams newline-delimited JSON, and a chunk boundary can land MID-OBJECT — so the tail
     * is carried between reads instead of being parsed optimistically. OLS learned the streaming
     * version of this the hard way: markers arrive split across chunks, and code that assumes whole
     * units per read is wrong in a way that only shows up under real load.
     */
    async *chat({ model, messages, signal, options = {} }) {
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: true, options }),
        signal,
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`ollama /api/chat -> ${res.status} ${detail.slice(0, 300)}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let carry = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        carry += decoder.decode(value, { stream: true })

        let nl
        while ((nl = carry.indexOf('\n')) !== -1) {
          const line = carry.slice(0, nl).trim()
          carry = carry.slice(nl + 1)
          if (!line) continue

          let obj
          try { obj = JSON.parse(line) } catch { continue } // partial/garbage line — skip, never guess
          if (obj.error) throw new Error(`ollama: ${obj.error}`)

          // ⚠️ REASONING ARRIVES IN ITS OWN FIELD, AND READING ONLY `content` SILENTLY DISCARDS IT.
          // Caught 2026-08-10 on the first real turn: 25 content deltas against eval_count=250. The
          // missing ~90% were `message.thinking` — gemma4:e4b is a thinking model. The metrics not
          // adding up is the only reason this surfaced; nothing else would have shown a gap.
          // Reasoning is NOT the reply (it has its own column, and speaking it aloud would be
          // replaying drafts) — so it is carried separately, never concatenated into the answer.
          const thinking = obj.message?.thinking || ''
          if (thinking) yield { type: 'reasoning', content: thinking }

          const piece = obj.message?.content || ''
          if (piece) yield { type: 'delta', content: piece }

          if (obj.done) {
            yield {
              type: 'done',
              model: obj.model,
              metrics: {
                promptTokens: obj.prompt_eval_count ?? null,
                completionTokens: obj.eval_count ?? null,
                // ns -> ms. promptEvalMs is the honest cache signal; keep it from the start.
                promptEvalMs: obj.prompt_eval_duration != null ? Math.round(obj.prompt_eval_duration / 1e6) : null,
                totalMs: obj.total_duration != null ? Math.round(obj.total_duration / 1e6) : null,
                tokensPerSec: obj.eval_count && obj.eval_duration
                  ? Number((obj.eval_count / (obj.eval_duration / 1e9)).toFixed(1))
                  : null,
              },
            }
          }
        }
      }
      if (carry.trim()) log?.warn?.(`ollama stream ended with an unterminated line (${carry.length} chars)`)
    },
  }
}
