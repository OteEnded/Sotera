// PREFILL — OLLAMA IN ISOLATION. Does ollama reuse its KV cache across SEPARATE requests?
//
//   node test/pipeline/prefill-ollama-isolation.mjs
//
// Takes Sotera out of the picture entirely and asks the runner directly, with HER real 47-tool payload
// so the prompt shape matches production. Four arms:
//
//   A1/A2  the identical request twice          — is there cross-request reuse at all?
//   B1     the prefix EXTENDED                  — the shape a real NEXT TURN has
//   C1     one token changed near the FRONT     — the cost of a single volatile byte
//
// ⇒ If A2/B1 are fast, reuse works and any production miss is OUR prompt changing.
// ⇒ If they are slow, the blocker is ollama-level and no prompt change would help.
//
// ⛔ DOES NOT RECONFIGURE OR RESTART OLLAMA. `num_ctx` is pinned to whatever the loaded runner already
// has, so the slot is never reallocated. If the model is not resident it is loaded at 129024 — the
// trained max that Sotera's NO-LIMIT setting resolves to — so the runner she finds afterwards is the
// one she would have loaded herself. ⓘ Ollama is Ote's to run; this only sends ordinary requests.
//
// ⓘ 2026-09-15 result: A1 6,689 ms → A2 67 ms (100x) · B1 121 ms · C1 6,490 ms.
//    Reference/docs/INVESTIGATION_SOTERA_PREFILL_PREFIX_CACHE.md
import { readFileSync } from 'node:fs'
import { assembleToolDefs } from '../../Backend/app/chat/tool-defs.js'

const config = JSON.parse(readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))
const OLLAMA = config.providers?.ollama?.host || 'http://127.0.0.1:11434'
const MODEL = String(config.chat?.defaultModel || 'ollama/qwen3.6:35b').replace(/^ollama\//, '')
const SOTERA_NUM_CTX = 129024

const ps = async () => (await (await fetch(`${OLLAMA}/api/ps`)).json()).models || []
let loaded = (await ps()).find((m) => (m.model || m.name) === MODEL)
if (!loaded) {
  console.log(`${MODEL} not resident — loading at num_ctx=${SOTERA_NUM_CTX} (what Sotera uses)…`)
  await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt: '', options: { num_ctx: SOTERA_NUM_CTX }, keep_alive: '10m' }),
  })
  loaded = (await ps()).find((m) => (m.model || m.name) === MODEL)
  if (!loaded) { console.error('✖ load failed'); process.exit(1) }
}
const NUM_CTX = loaded.context_length
console.log(`runner ${MODEL}  num_ctx=${NUM_CTX}  vram=${(loaded.size_vram / 1e9).toFixed(1)}GB`)

const tools = assembleToolDefs({ toolsOn: true, interactiveTurn: true, useMemory: true, adviceDestinations: ['Hermes'] }).defs
console.log(`tools ${tools.length} (~${Math.ceil(JSON.stringify(tools).length / 4)} tok)\n`)

const SYSTEM = 'You are a helpful assistant.\n' + Array.from({ length: 220 },
  (_, i) => `Standing note ${i}: keep answers short, accurate, and grounded in what was actually said.`).join('\n')
const filler = (n) => Array.from({ length: n },
  (_, i) => `Background item ${i}: a sentence of ordinary prose that exists only to occupy prompt space.`).join(' ')

async function ask(messages, label) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, messages, tools, stream: false,
      options: { num_ctx: NUM_CTX, num_predict: 1, temperature: 0 }, keep_alive: '10m',
    }),
  })
  const j = await r.json()
  if (j.error) { console.error(`  ${label}: ✖ ${j.error}`); return null }
  const ptok = j.prompt_eval_count ?? 0
  const pms = j.prompt_eval_duration != null ? Math.round(j.prompt_eval_duration / 1e6) : null
  console.log(`  ${label.padEnd(36)} ${String(ptok).padStart(6)} tok  ${String(pms).padStart(6)} ms  ${(pms / ptok).toFixed(4)} ms/tok`)
  return { ptok, pms, rate: pms / ptok }
}

const base = [
  { role: 'system', content: SYSTEM },
  { role: 'user', content: `Here is some context to remember.\n${filler(90)}\n\nIn one word, say OK.` },
]
console.log('A · identical request twice')
const a1 = await ask(base, 'A1 cold')
const a2 = await ask(base, 'A2 IDENTICAL request')

console.log('\nB · prefix extended (what a real next turn looks like)')
const b1 = await ask([...base, { role: 'assistant', content: 'OK.' }, { role: 'user', content: 'In one word, say OK again.' }], 'B1 prefix EXTENDED')

console.log('\nC · one token changed near the FRONT')
const c1 = await ask([{ role: 'system', content: SYSTEM.replace('Standing note 0:', 'Standing note X:') }, base[1]], 'C1 front byte changed')

console.log(`\n${'='.repeat(72)}`)
if (a1 && a2 && b1 && c1) {
  console.log(`reuse on identical:  ${(a1.rate / a2.rate).toFixed(0)}x faster`)
  console.log(`reuse on EXTENDED:   ${(a1.rate / b1.rate).toFixed(0)}x faster   ← the number that matters`)
  console.log(`cost of one front byte: ${c1.pms} ms (vs ${b1.pms} ms when the front is unchanged)`)
  console.log(b1.rate < a1.rate / 10
    ? '⇒ ollama reuses fine. Any production miss is OUR prompt changing near the front.'
    : '⇒ ollama is NOT reusing here. The blocker is runner-level, not the prompt.')
}
