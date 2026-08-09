import { useCallback, useEffect, useRef, useState } from 'react'
import { apiUrl } from '../config'
import ModelCombo from '../components/ModelCombo'
import Req from '../components/Req'

// OpenAI-compatible playground. Calls the gateway exactly like any OpenAI client:
//   GET  /v1/models                (Bearer API key)
//   POST /v1/chat/completions      (Bearer API key, stream)
// The chat endpoints use API-KEY auth (not the admin session), so you paste a key here
// (e.g. the seeded sotera dev key). It's stored in localStorage for convenience.

const KEY_STORAGE = 'ote-llm-services.apiKey'

type ModelOpt = { id: string; owned_by?: string }

export default function GatewayConsole() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(KEY_STORAGE) || '')
  const [keyDraft, setKeyDraft] = useState(apiKey)
  const [showKey, setShowKey] = useState(false)

  const [models, setModels] = useState<ModelOpt[]>([])
  const [modelsErr, setModelsErr] = useState('')
  const [model, setModel] = useState('')

  const [system, setSystem] = useState('')
  const [input, setInput] = useState('Say hello in five words.')
  const [stream, setStream] = useState(true)

  const [running, setRunning] = useState(false)
  const [reasoning, setReasoning] = useState('')
  const [answer, setAnswer] = useState('')
  const [meta, setMeta] = useState('')
  const [err, setErr] = useState('')
  const logRef = useRef<HTMLDivElement | null>(null)

  // embeddings panel
  const [embModel, setEmbModel] = useState('')
  const [embInput, setEmbInput] = useState('The quick brown fox jumps over the lazy dog.')
  const [embRunning, setEmbRunning] = useState(false)
  const [embResult, setEmbResult] = useState('')
  const [embErr, setEmbErr] = useState('')

  const authHeaders = useCallback(() => ({ Authorization: `Bearer ${apiKey}` }), [apiKey])

  const saveKey = () => {
    const k = keyDraft.trim()
    if (k) localStorage.setItem(KEY_STORAGE, k); else localStorage.removeItem(KEY_STORAGE)
    setApiKey(k)
  }

  const loadModels = useCallback(async () => {
    setModelsErr('')
    if (!apiKey) { setModels([]); return }
    try {
      const res = await fetch(apiUrl('/v1/models'), { headers: authHeaders() })
      if (!res.ok) throw new Error((await res.json())?.error?.message || `HTTP ${res.status}`)
      const body = await res.json()
      const list: ModelOpt[] = body.data || []
      setModels(list)
      setModel((cur) => cur || (list[0]?.id ?? ''))
      setEmbModel((cur) => cur || (list.find((m) => /embed/i.test(m.id))?.id ?? ''))
    } catch (e) {
      setModelsErr(e instanceof Error ? e.message : String(e))
    }
  }, [apiKey, authHeaders])

  useEffect(() => { if (apiKey) loadModels() }, [apiKey, loadModels])
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight }, [answer, reasoning])

  const send = useCallback(async () => {
    if (!apiKey) { setErr('Paste and save an API key first (e.g. the sotera dev key).'); return }
    if (!model) { setErr('Pick a model (Load models).'); return }
    setErr(''); setReasoning(''); setAnswer(''); setMeta(''); setRunning(true)

    const messages: { role: string; content: string }[] = []
    if (system.trim()) messages.push({ role: 'system', content: system })
    messages.push({ role: 'user', content: input })

    try {
      if (!stream) {
        const res = await fetch(apiUrl('/v1/chat/completions'), {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages }),
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`)
        const m = body.choices?.[0]?.message
        setAnswer(m?.content || '')
        if (m?.reasoning_content) setReasoning(m.reasoning_content)
        const u = body.usage
        setMeta(`${body.model} · prompt=${u?.prompt_tokens ?? '?'} completion=${u?.completion_tokens ?? '?'}`)
      } else {
        const res = await fetch(apiUrl('/v1/chat/completions'), {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({ model, messages, stream: true }),
        })
        if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error?.message || `HTTP ${res.status}`)
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        let acc = ''
        let racc = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            const t = line.trim()
            if (!t.startsWith('data:')) continue
            const payload = t.slice(5).trim()
            if (payload === '[DONE]') continue
            try {
              const chunk = JSON.parse(payload)
              if (chunk.error) { setErr(`${chunk.error.code || 'error'}: ${chunk.error.message}`); continue }
              const d = chunk.choices?.[0]?.delta
              if (d?.content) { acc += d.content; setAnswer(acc) }
              if (d?.reasoning_content) { racc += d.reasoning_content; setReasoning(racc) }
              if (chunk.usage) setMeta(`${chunk.model} · prompt=${chunk.usage.prompt_tokens ?? '?'} completion=${chunk.usage.completion_tokens ?? '?'}`)
            } catch { /* ignore parse hiccups */ }
          }
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }, [apiKey, model, system, input, stream, authHeaders])

  // one input per line -> POST /v1/embeddings (needs the `embeddings` scope on the key)
  const runEmbeddings = useCallback(async () => {
    if (!apiKey) { setEmbErr('Paste and save an API key first.'); return }
    const lines = embInput.split('\n').map((s) => s.trim()).filter(Boolean)
    if (!embModel.trim() || !lines.length) { setEmbErr('Pick an embedding model and enter at least one line of text.'); return }
    setEmbErr(''); setEmbResult(''); setEmbRunning(true)
    try {
      const res = await fetch(apiUrl('/v1/embeddings'), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: embModel.trim(), input: lines.length > 1 ? lines : lines[0] }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`)
      const vecs: number[][] = (body.data || []).map((d: { embedding: number[] }) => d.embedding)
      const dims = vecs[0]?.length ?? 0
      const preview = vecs.map((v, i) => `#${i}  [${v.slice(0, 6).map((x) => x.toFixed(4)).join(', ')}, …]`).join('\n')
      setEmbResult(`${vecs.length} vector(s) · ${dims} dimensions · prompt_tokens=${body.usage?.prompt_tokens ?? '?'}\n${preview}`)
    } catch (e) {
      setEmbErr(e instanceof Error ? e.message : String(e))
    } finally {
      setEmbRunning(false)
    }
  }, [apiKey, embModel, embInput, authHeaders])

  return (
    <div className="w-full max-w-[960px] mx-auto flex flex-col gap-4 pb-12">
      <header>
        <h2 className="m-0 mb-1 text-[22px] tracking-[-0.01em]">Playground</h2>
        <p className="m-0 text-muted text-sm [&_code]:bg-[var(--code-bg)] [&_code]:px-1.5 [&_code]:py-px [&_code]:rounded [&_code]:text-xs">
          Test the gateway exactly like an external client: <code>/v1/chat/completions</code> and{' '}
          <code>/v1/embeddings</code> with an API key (key auth, not your login session — BYOK providers
          on the key's owner apply). The same surface is served on <code>/api/openai/v1</code>; an Anthropic
          Messages surface lives on <code>/api/anthropic/v1</code> — see <b>API Docs</b> for both.
        </p>
      </header>

      <section className="gw-card">
        <div className="gw-card-title">1 · API key</div>
        <div className="flex items-center gap-2 mb-2 last:mb-0">
          <input className="gw-input gw-input-flex" type={showKey ? 'text' : 'password'}
            placeholder="sk_..." value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} spellCheck={false} autoComplete="new-password" />
          <button className="gw-btn" onClick={() => setShowKey((s) => !s)}>{showKey ? 'Hide' : 'Show'}</button>
          <button className="gw-btn gw-btn-primary" onClick={saveKey}>Save</button>
        </div>
        <div className="gw-meta">{apiKey ? `Key saved (${apiKey.length} chars).` : 'No key saved.'}</div>
      </section>

      <section className="gw-card">
        <div className="gw-card-title">2 · Model</div>
        <div className="flex items-center gap-2 mb-2 last:mb-0">
          <ModelCombo
            className="flex-1"
            items={models.map((m) => m.id)}
            value={model}
            onChange={setModel}
            disabled={!models.length}
            showFullValue
            placeholder={models.length ? 'pick a model…' : '(load models)'}
          />
          <button className="gw-btn" onClick={loadModels} disabled={!apiKey}>Load models</button>
        </div>
        {modelsErr && <div className="gw-meta gw-error">{modelsErr}</div>}
        {!modelsErr && models.length > 0 && <div className="gw-meta">{models.length} models across all providers.</div>}
      </section>

      <section className="gw-card">
        <div className="gw-card-title">3 · Message</div>
        <label className="block mb-1 text-muted text-[13px]">System (optional)</label>
        <textarea className="gw-textarea" rows={2} value={system} onChange={(e) => setSystem(e.target.value)} spellCheck={false} />
        <label className="block mb-1 text-muted text-[13px]">User<Req /></label>
        <textarea className="gw-textarea" rows={3} value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} />
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          <label className="gw-check"><input type="checkbox" checked={stream} onChange={(e) => setStream(e.target.checked)} /> Stream</label>
          <div className="flex-1" />
          <button className="gw-btn gw-btn-primary" onClick={send} disabled={running || !apiKey}>{running ? 'Running…' : 'Send'}</button>
        </div>
      </section>

      <section className="gw-card gw-output">
        <div className="gw-card-title">4 · Response</div>
        {err && <div className="gw-block gw-block-error"><div className="gw-block-title">error</div><pre className="gw-pre">{err}</pre></div>}
        {reasoning && <div className="gw-block gw-block-reasoning"><div className="gw-block-title">reasoning</div><pre className="gw-pre">{reasoning}</pre></div>}
        <div className="gw-block" ref={logRef}><div className="gw-block-title">assistant</div><pre className="gw-pre">{answer || (running ? '…' : '(no output yet)')}</pre></div>
        {meta && <div className="gw-meta">{meta}</div>}
      </section>

      <section className="gw-card" data-ui="embeddings-panel">
        <div className="gw-card-title">5 · Embeddings</div>
        <div className="gw-meta">One input per line — each becomes its own vector. Needs the <code>embeddings</code> scope on the key. Local Ollama only embeds with dedicated embedding models.</div>
        <div className="flex items-center gap-2 mb-2 last:mb-0">
          <ModelCombo
            className="flex-1"
            items={models.map((m) => m.id)}
            value={embModel}
            onChange={setEmbModel}
            showFullValue
            placeholder="embedding model (e.g. siliconflow/Qwen/Qwen3-Embedding-0.6B)"
          />
        </div>
        <textarea className="gw-textarea" rows={3} value={embInput} onChange={(e) => setEmbInput(e.target.value)} spellCheck={false} />
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          <div className="flex-1" />
          <button className="gw-btn gw-btn-primary" onClick={runEmbeddings} disabled={embRunning || !apiKey}>{embRunning ? 'Embedding…' : 'Embed'}</button>
        </div>
        {embErr && <div className="gw-block gw-block-error"><div className="gw-block-title">error</div><pre className="gw-pre">{embErr}</pre></div>}
        {embResult && <div className="gw-block"><div className="gw-block-title">vectors</div><pre className="gw-pre">{embResult}</pre></div>}
      </section>
    </div>
  )
}
