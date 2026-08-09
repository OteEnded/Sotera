import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
import { copyToClipboard } from '../lib/clipboard'
import { ui } from './admin/ui'

// API reference for consumers of the platform's two wire standards. Everything is copy-paste
// ready. Base URL resolution: config `api.publicBaseUrl` (via GET /api/meta) wins when set —
// for deployments where the public API host differs from the console origin (proxy/domain) —
// otherwise the origin the user is browsing from.

function CodeBlock({ label, code }: { label?: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (await copyToClipboard(code)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }
  }
  return (
    <div className="relative group">
      {label && <div className={ui.fieldLabel}>{label}</div>}
      <pre className="bg-surface border border-line rounded-lg p-3 pr-16 text-xs leading-relaxed overflow-x-auto whitespace-pre">{code}</pre>
      <button
        type="button"
        onClick={copy}
        className="gw-btn adm-btn-sm absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Copy"
      >
        {copied ? '✓ copied' : 'Copy'}
      </button>
    </div>
  )
}

export default function ApiDocsPage() {
  const [base, setBase] = useState(window.location.origin)
  useEffect(() => {
    apiGet('/api/meta')
      .then((m) => { if (m?.apiBaseUrl) setBase(m.apiBaseUrl) })
      .catch(() => { /* keep origin fallback */ })
  }, [])

  return (
    <div className={`${ui.page} flex flex-col gap-5`}>
      <div>
        <h2 className={ui.h2}>API Docs</h2>
      <p className="adm-dim">
        The gateway serves <b>two wire standards</b>, each on its own base path. Create a key in the{' '}
        <b>API Keys</b> tab (scopes: <code className={ui.codeChip}>chat</code> — required,{' '}
        <code className={ui.codeChip}>streaming</code> — for streamed responses,{' '}
        <code className={ui.codeChip}>models.read</code> — for model listing,{' '}
        <code className={ui.codeChip}>embeddings</code> — for the embeddings endpoint).
      </p>
      </div>

      {/* ---- overview ---- */}
      <section className="gw-card">
        <div className="gw-card-title">Endpoints</div>
        <div className={ui.tableWrap}>
          <table className={ui.table} data-ui="apidocs-table">
            <colgroup>
              <col style={{ width: 190 }} />
              <col style={{ width: 280 }} />
              <col />
              <col style={{ width: 210 }} />
            </colgroup>
            <thead><tr>
              <th className={ui.th}>Standard</th><th className={ui.th}>Base path</th><th className={ui.th}>Endpoints</th><th className={ui.th}>Auth header</th>
            </tr></thead>
            <tbody>
              <tr>
                <td className={`${ui.td} ${ui.tdBorder}`}>OpenAI-compatible <span className="adm-dim">(primary)</span></td>
                <td className={`${ui.td} ${ui.tdBorder}`}><code className={ui.codeChip}>{base}/api/openai/v1</code></td>
                <td className={`${ui.td} ${ui.tdBorder}`}><code className={ui.codeChip}>POST /chat/completions</code> · <code className={ui.codeChip}>POST /embeddings</code> · <code className={ui.codeChip}>GET /models</code></td>
                <td className={`${ui.td} ${ui.tdBorder}`}><code className={ui.codeChip}>Authorization: Bearer</code></td>
              </tr>
              <tr>
                <td className={`${ui.td} ${ui.tdBorder}`}>Anthropic Messages</td>
                <td className={`${ui.td} ${ui.tdBorder}`}><code className={ui.codeChip}>{base}/api/anthropic/v1</code></td>
                <td className={`${ui.td} ${ui.tdBorder}`}><code className={ui.codeChip}>POST /messages</code> · <code className={ui.codeChip}>POST /messages/count_tokens</code> · <code className={ui.codeChip}>GET /models</code></td>
                <td className={`${ui.td} ${ui.tdBorder}`}><code className={ui.codeChip}>x-api-key</code> or Bearer</td>
              </tr>
              <tr>
                <td className={ui.td}>Legacy alias</td>
                <td className={ui.td}><code className={ui.codeChip}>{base}/v1</code></td>
                <td className={ui.td}>same as the OpenAI surface</td>
                <td className={ui.td}><code className={ui.codeChip}>Authorization: Bearer</code></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="adm-dim mt-2">
          Model ids are <code className={ui.codeChip}>&lt;provider&gt;/&lt;model&gt;</code> (e.g.{' '}
          <code className={ui.codeChip}>ollama/gemma4:26b</code>) — list them via <code className={ui.codeChip}>GET /models</code> on either surface.
          On the Anthropic surface, Anthropic model names (<code className={ui.codeChip}>claude-*</code>) are mapped to a configured
          platform model (<code className={ui.codeChip}>api.anthropic</code> in <code className={ui.codeChip}>Backend/config.json</code>);
          explicit <code className={ui.codeChip}>&lt;provider&gt;/&lt;model&gt;</code> ids pass through unchanged.
        </p>
        <p className="adm-dim">
          Multimodal: <code className={ui.codeChip}>messages[].content</code> accepts OpenAI content-parts (text +{' '}
          <code className={ui.codeChip}>image_url</code> with a base64 data URL) and Anthropic base64 image blocks — remote image URLs are
          rejected. <b>BYOK:</b> if the key's owner has personal providers (Account → My model providers), their models appear in{' '}
          <code className={ui.codeChip}>GET /models</code> and their calls route through the owner's keys automatically.
        </p>
      </section>

      {/* ---- embeddings ---- */}
      <section className="gw-card">
        <div className="gw-card-title">Embeddings</div>
        <p className="adm-dim">
          OpenAI-shaped. <code className={ui.codeChip}>input</code> is one string or an array of strings; the response carries one vector per
          input, index-aligned. Anthropic-kind providers have no embeddings endpoint (400). Note: local Ollama only serves embeddings from
          dedicated embedding models (e.g. <code className={ui.codeChip}>nomic-embed-text</code>) — generative models refuse.
        </p>
        <div className="flex flex-col gap-4">
          <CodeBlock label="curl" code={`curl ${base}/api/openai/v1/embeddings \\
  -H "Authorization: Bearer sk_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "siliconflow/Qwen/Qwen3-Embedding-0.6B",
    "input": ["first text", "second text"]
  }'`} />
          <CodeBlock label="OpenAI SDK — JavaScript" code={`const res = await client.embeddings.create({
  model: 'siliconflow/Qwen/Qwen3-Embedding-0.6B',
  input: 'the text to embed',
})
// res.data[0].embedding -> number[]`} />
        </div>
      </section>

      {/* ---- openai ---- */}
      <section className="gw-card">
        <div className="gw-card-title">OpenAI-compatible</div>
        <div className="flex flex-col gap-4">
          <CodeBlock label="curl" code={`curl ${base}/api/openai/v1/chat/completions \\
  -H "Authorization: Bearer sk_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "ollama/gemma4:26b",
    "messages": [{ "role": "user", "content": "Hello!" }],
    "stream": false
  }'`} />
          <CodeBlock label="OpenAI SDK — JavaScript" code={`import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: '${base}/api/openai/v1',
  apiKey: 'sk_YOUR_KEY',
})

const res = await client.chat.completions.create({
  model: 'ollama/gemma4:26b',
  messages: [{ role: 'user', content: 'Hello!' }],
})`} />
          <CodeBlock label="OpenAI SDK — Python" code={`from openai import OpenAI

client = OpenAI(base_url="${base}/api/openai/v1", api_key="sk_YOUR_KEY")
res = client.chat.completions.create(
    model="ollama/gemma4:26b",
    messages=[{"role": "user", "content": "Hello!"}],
)`} />
        </div>
      </section>

      {/* ---- anthropic ---- */}
      <section className="gw-card">
        <div className="gw-card-title">Anthropic Messages</div>
        <p className="adm-dim">
          Note: Anthropic SDKs append <code className={ui.codeChip}>/v1/messages</code> themselves — their{' '}
          <code className={ui.codeChip}>baseURL</code> is <code className={ui.codeChip}>{base}/api/anthropic</code> (no <code className={ui.codeChip}>/v1</code>).
          Streaming uses native Anthropic SSE events, including <code className={ui.codeChip}>thinking</code> and{' '}
          <code className={ui.codeChip}>tool_use</code> content blocks.
        </p>
        <div className="flex flex-col gap-4">
          <CodeBlock label="curl" code={`curl ${base}/api/anthropic/v1/messages \\
  -H "x-api-key: sk_YOUR_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4-5",
    "max_tokens": 1024,
    "messages": [{ "role": "user", "content": "Hello!" }]
  }'`} />
          <CodeBlock label="Anthropic SDK — JavaScript" code={`import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  baseURL: '${base}/api/anthropic',
  apiKey: 'sk_YOUR_KEY',
})

const msg = await client.messages.create({
  model: 'claude-sonnet-4-5', // mapped to the configured platform model
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }],
})`} />
          <CodeBlock label="Claude Code — use this platform as the provider" code={`# environment (shell profile, .env, or the session)
ANTHROPIC_BASE_URL=${base}/api/anthropic
ANTHROPIC_API_KEY=sk_YOUR_KEY   # needs chat + streaming scopes

claude   # Claude Code now talks to this platform`} />
        </div>
      </section>
    </div>
  )
}
