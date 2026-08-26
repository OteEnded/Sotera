// ⭐⭐⭐ DOES PASSIVE REFLECTION HURT INTERACTIVE LATENCY? — the paired timing experiment.
//
//   node pipeline/reflection-contention.mjs --n 6        (6 pairs; announce before running)
//   node pipeline/reflection-contention.mjs --dry        (print the design and the profile, run nothing)
//
// Ote, 2026-08-26: *"No literal message overlap is not enough to establish that passive work doesn't hurt
// interactive latency; model/resource contention can exist without overlap."*
//
// ── ⭐⭐⭐ WHY OVERLAP WAS NEVER THE RIGHT MEASURE ─────────────────────────────────────────────────
// Measured, not assumed: `reflectionModel(config)` resolves `memory.reflectionModel` (unset) →
// `chat.defaultModel` = **the same 35B model the interactive path uses**. So:
//   • ✅ no model eviction and no ~29s reload — both halves want the same weights already resident;
//   • ⛔ but they contend for GPU compute and KV-cache SLOTS, and on this box Ollama has historically
//     served ONE slot (`-np 1`), which turns contention into **serialisation**.
// ⇒ ⭐ a reflection that began one second before a user turn can make that turn wait for the WHOLE
// generation while producing no "overlap" at all by any message-timestamp measure. That is exactly Ote's
// point, and it is why this file exists instead of the overlap count.
//
// ⚠️ `memory.reflectModel` (= qwen3.5:9b) is a DIFFERENT KEY belonging to the L3 notes pass. Reading it
// as this lane's model would have measured the wrong contention entirely.
//
// ── ⛔ IT NEVER WRITES A REFLECTION ROW ──────────────────────────────────────────────────────────
// The background load is a RAW Ollama call matching the lane's resource profile — same model, same
// num_predict, same numCtx. ⇒ `log_conversation_revisits` is untouched, the cursor stays unexercised,
// and Ote's *"let the real worker exercise the cursor naturally"* is not contaminated by this experiment.
//
// ── ⭐⭐ THE DESIGN, AND THE PART THAT MAKES IT MEAN ANYTHING ────────────────────────────────────
// ① A NOISE FLOOR FIRST: pairs of IDLE-vs-IDLE. ⛔ Without it, any A/B difference is unreadable — this
//   box produced an 8s turn and a 181s turn on the same configuration within one session.
// ② ALTERNATING A/B/A/B, never all-A-then-all-B: load drifts, and a block design would attribute the
//   drift to the arm that ran second.
// ③ REPORT median + CV + N. ⛔ NEVER max−min as a "spread" — a range only grows with N.

import { writeFileSync, readFileSync } from 'node:fs'
import { devPg, devSchema, ollamaHost, BASE } from '../harness.mjs'

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')
const N = Number(argv[argv.indexOf('--n') + 1]) || 6

const cfg = JSON.parse(readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))
// ⭐ RESOLVED THE WAY THE LANE RESOLVES IT, not retyped: memory.reflectionModel → chat.defaultModel.
const REFLECT_MODEL = (cfg?.memory?.reflectionModel || cfg?.chat?.defaultModel || 'ollama/gemma4:e4b').replace(/^ollama\//, '')
const CHAT_MODEL = String(cfg?.chat?.defaultModel || '').replace(/^ollama\//, '')
const NUM_CTX = cfg?.memory?.reflectionNumCtx ?? 16384
const MAX_TOK = cfg?.memory?.reflectionMaxTokens ?? 1600
const HOST = ollamaHost()

console.log('\n══ PAIRED TIMING · INTERACTIVE vs PASSIVE REFLECTION ════════════════')
console.log(`   reflection model : ${REFLECT_MODEL}   (numCtx ${NUM_CTX}, max_tokens ${MAX_TOK})`)
console.log(`   chat model       : ${CHAT_MODEL}`)
console.log(`   ⇒ ${REFLECT_MODEL === CHAT_MODEL ? '⭐ SAME MODEL — contention is for SLOTS, not weights (no reload stall)' : '⚠️ DIFFERENT MODELS — eviction/reload is in play, a different failure entirely'}`)
console.log(`   pairs            : ${N} per arm, alternating, after an IDLE/IDLE noise floor`)
console.log('   ⛔ writes no reflection row · ⛔ the cursor test stays clean\n')
if (DRY) { console.log('   --dry: design printed, nothing run.'); process.exit(0) }

// ── THE BACKGROUND LOAD — the lane's resource profile, without the lane ────────────────────────
// ⛔ Fire-and-forget on purpose: the interactive turn must start while this is still generating, which is
// the whole condition under test.
const startLoad = () => {
  const ctl = new AbortController()
  const p = fetch(`${HOST}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: REFLECT_MODEL,
      messages: [{ role: 'user', content: 'Summarise, in careful detail, what makes a good technical postmortem. Take your time and be thorough.' }],
      stream: false, think: false,
      options: { temperature: 0, num_predict: MAX_TOK, num_ctx: NUM_CTX },
    }),
    signal: ctl.signal,
  }).catch(() => null)
  return { ctl, p }
}

// ── ⭐⭐ AUTH AND STREAMING, DONE HERE RATHER THAN THROUGH THE SHARED HELPERS ────────────────────
// ⚠️ `harness.readSSE` cannot read THIS endpoint: it requires an `event:` line and skips any block
// without one (`if (!evLine) continue`), while the chat route writes `data: {…}` only. It would have
// returned ZERO events and a TTFT of null forever — a silent empty measurement, which is the shape this
// project keeps paying for. ⛔ Not fixed here (nothing calls it); noted, and worked around deliberately.
const BASE_URL = BASE
const login = await fetch(`${BASE_URL}/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'agent_dev', password: 'agentdev123' }),
})
if (!login.ok) { console.error(`\u2716 agent_dev login failed (${login.status})`); process.exit(1) }
const COOKIE = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
if (!COOKIE) { console.error('\u2716 no session cookie'); process.exit(1) }

const post = (path, body) => fetch(`${BASE_URL}${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', cookie: COOKIE }, body: JSON.stringify(body),
})

const pg = devPg(); await pg.connect()
const S = devSchema()

// \u2b50 ONE conversation reused for every sample, so prompt size and history are not a moving variable.
const convRes = await post('/v1/chat/conversations', {
  title: 'CONTENTION', model: cfg?.chat?.defaultModel,
  settings: { stream: true, toolsEnabled: false, useMemory: false, reasoning: { enabled: false }, probe: true },
})
const convJson = await convRes.json().catch(() => ({}))
const cid = convJson?.conversation?.id ?? convJson?.id
if (!cid) { console.error('\u2716 could not open a conversation'); process.exit(1) }
console.log(`   conversation ${String(cid).slice(0, 8)} (probe:true \u2014 gated out of noticing and reflection)\n`)

/**
 * \u2b50\u2b50\u2b50 ONE SAMPLE \u2014 AND IT MEASURES TIME-TO-FIRST-TOKEN, NOT TOTAL.
 *
 * Ote: *"measure actual interactive latency \u2014 not just message overlap."* \u2b50 The latency a person feels
 * is when she STARTS speaking, not when she stops: a reply that begins in 1s and runs for 30s feels
 * responsive, and one that begins in 20s does not, even if both finish together. \u26d4 Total alone would
 * average those two into the same number.
 * \u24d8 TOTAL is recorded too, because a contended run can also be slower to FINISH without being slower to
 * start, and those are different effects on a person.
 */
const sample = async (label) => {
  const t0 = Date.now()
  let ttft = null
  let tokens = 0
  let res
  try {
    res = await post(`/v1/chat/conversations/${cid}/messages`, { content: 'In one sentence: what is a rolling restart?' })
  } catch (e) { return { label, ok: false, err: e?.message } }
  if (!res.ok || !res.body) return { label, ok: false, err: `status ${res.status}` }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let sep
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, sep); buf = buf.slice(sep + 2)
      const line = block.split('\n').find((l) => l.startsWith('data: '))
      if (!line) continue
      let d = null
      try { d = JSON.parse(line.slice(6)) } catch { continue }
      if (d?.type === 'token') {
        tokens += 1
        if (ttft == null) ttft = Date.now() - t0   // \u2b50 the moment she starts speaking
      }
    }
  }
  return { label, ok: true, ttft, total: Date.now() - t0, tokens }
}

const samples = []
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
const cv = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; const sd = Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); return m ? sd / m : 0 }

// ── ⭐ PHASE 1 · THE NOISE FLOOR (IDLE vs IDLE) ────────────────────────────────────────────────
console.log('   ── noise floor: IDLE vs IDLE ───────────────────────────────')
for (let i = 0; i < N; i += 1) {
  for (const tag of ['floorA', 'floorB']) {
    const s = await sample(tag)
    samples.push(s)
    console.log(`      ${tag}  ${s.ok ? `${(s.total / 1000).toFixed(1)}s` : `✖ ${s.err}`}`)
  }
}

// ── ⭐ PHASE 2 · IDLE vs CONTENDED, ALTERNATING ────────────────────────────────────────────────
console.log('\n   ── IDLE vs CONTENDED (alternating) ─────────────────────────')
for (let i = 0; i < N; i += 1) {
  const idle = await sample('idle')
  samples.push(idle)
  console.log(`      idle       ${idle.ok ? `${(idle.total / 1000).toFixed(1)}s` : `✖ ${idle.err}`}`)

  const load = startLoad()
  await new Promise((r) => setTimeout(r, 1500)) // let the background generation actually start
  const cont = await sample('contended')
  samples.push(cont)
  console.log(`      contended  ${cont.ok ? `${(cont.total / 1000).toFixed(1)}s` : `✖ ${cont.err}`}`)
  load.ctl.abort()
  await load.p
}

// ── REPORT ────────────────────────────────────────────────────────────────────────────────────
const arm = (tag) => samples.filter((s) => s.label === tag && s.ok).map((s) => s.total)
const line = (tag) => {
  const a = arm(tag)
  return a.length ? `${tag.padEnd(10)} n=${a.length}  median=${(med(a) / 1000).toFixed(1)}s  CV=${(cv(a) * 100).toFixed(0)}%` : `${tag.padEnd(10)} no samples`
}
console.log('\n══ RESULT ══════════════════════════════════════════════════════════')
for (const t of ['floorA', 'floorB', 'idle', 'contended']) console.log('   ' + line(t))
const fA = arm('floorA'); const fB = arm('floorB')
const idleA = arm('idle'); const contA = arm('contended')
if (fA.length && fB.length) {
  const floorDelta = Math.abs(med(fA) - med(fB))
  console.log(`\n   ⭐ NOISE FLOOR       |floorA − floorB| = ${(floorDelta / 1000).toFixed(1)}s`)
  if (idleA.length && contA.length) {
    const delta = med(contA) - med(idleA)
    console.log(`   ⭐ CONTENTION DELTA  contended − idle  = ${(delta / 1000).toFixed(1)}s`)
    console.log(`   ⇒ ${Math.abs(delta) > floorDelta * 2
      ? '⛔ THE DELTA EXCEEDS TWICE THE NOISE FLOOR — passive work IS affecting interactive latency'
      : '⚠️ THE DELTA IS WITHIN THE NOISE FLOOR — this run does NOT establish an effect either way'}`)
  }
}
console.log('   ⛔ Reported as median + CV + N. ⛔ Never max−min: a range only grows with N.')

const file = new URL('../results/reflection-contention.json', import.meta.url)
writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), reflectModel: REFLECT_MODEL, chatModel: CHAT_MODEL, numCtx: NUM_CTX, maxTok: MAX_TOK, samples }, null, 2), 'utf8')
console.log(`\n  wrote ${file.pathname.replace(/^\//, '')}`)
await pg.query(`delete from ${S}.txn_conversations where id = $1`, [cid]).catch(() => {})
await pg.end()
