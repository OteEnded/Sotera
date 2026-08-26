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
import { startCommitProbe, preflightCommit, describeCommit, GB } from '../lib/host-commit.mjs'

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
// ── ⭐⭐⭐ PREFLIGHT · HOST COMMIT, AND IT FAILS CLOSED ──────────────────────────────────────────
// Ote, 2026-08-26: *"Do not run the contention A/B while commit is near 100%… The guard should fail
// closed and clearly report why it refused to start."*
//
// ⛔ THIS EXISTS BECAUSE THE BOX ALREADY FELL OVER ONCE TODAY. At 18:21:07 +07 Windows diagnosed low
// virtual memory; **Postgres was killed** and Ote's editor died. This experiment deliberately runs a
// background generation DURING an interactive turn — the very shape that caused it — so it must satisfy
// itself about headroom BEFORE it adds any load, and refuse out loud when it cannot.
//
// ⭐⭐ THE REQUIREMENT IS DERIVED FROM WHAT IS ACTUALLY RESIDENT, ⛔ NOT A MAGIC NUMBER.
//   model already resident → the run adds a SLOT, not weights ⇒ a modest reserve is enough.
//   model NOT resident     → the run will LOAD it ⇒ reserve its full size on top.
// ⛔ And if Ollama cannot be read at all, the requirement is UNKNOWN and the guard refuses — an
// unmeasurable environment is never certified as healthy.
const RESERVE_GB = 8          // slack for the interactive turn, its KV cache, and the rest of the box
const ABORT_PCT = 95          // ⛔ mid-run: stop rather than push the box over a second time

const residentModels = async () => {
  try {
    const r = await fetch(`${HOST}/api/ps`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) return null
    const d = await r.json()
    return Array.isArray(d?.models) ? d.models : null
  } catch { return null }
}

// ⚠️ `/api/ps` lists only what is LOADED, so it cannot tell us the size of a model that is absent —
// that comes from `/api/tags`. ⛔ The first version of this reached for `hit.size` in the branch where
// `hit` is undefined by construction: dead code that silently fell through to a hard-coded 30 GB.
const catalogueSizeGB = async (name) => {
  try {
    const r = await fetch(`${HOST}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) return null
    const d = await r.json()
    const m = (d?.models ?? []).find((x) => String(x.name) === name)
    const bytes = Number(m?.size ?? 0)
    return bytes > 0 ? bytes / GB : null
  } catch { return null }
}

const resident = await residentModels()
const hit = resident?.find((m) => String(m.name) === REFLECT_MODEL)
let requiredHeadroomGB
let expectedLoadGB = 0
if (resident === null) {
  requiredHeadroomGB = undefined                    // ⛔ unknown ⇒ the guard refuses
} else if (hit) {
  requiredHeadroomGB = RESERVE_GB                   // weights are already paid for
} else {
  const sizeGB = await catalogueSizeGB(REFLECT_MODEL)
  // ⛔ If the catalogue cannot size it either, we do NOT guess a comfortable number — unknown refuses.
  requiredHeadroomGB = sizeGB === null ? undefined : RESERVE_GB + sizeGB
  expectedLoadGB = sizeGB ?? 0
}

const pre = preflightCommit({ requiredHeadroomGB, expectedLoadGB })
console.log('   ── preflight · host commit ─────────────────────────────────')
console.log(`      ollama /api/ps : ${resident === null ? '⛔ UNREADABLE' : `${resident.length} model(s) resident`}`)
if (resident?.length) {
  for (const m of resident) {
    const vram = Number(m.size_vram ?? 0); const total = Number(m.size ?? 0)
    console.log(`         ${String(m.name).padEnd(22)} ${(total / 1e9).toFixed(2)}GB  ${vram > 0 ? `gpu ${(vram / 1e9).toFixed(2)}GB` : '⚠️ CPU-placed'}`)
  }
}
console.log(`      reflect model  : ${hit ? '⭐ already resident — this run adds a SLOT, not weights' : '⚠️ NOT resident — this run would LOAD it'}`)
console.log(`      commit         : ${describeCommit(pre.reading)}`)
console.log(`      requirement    : ${Number.isFinite(requiredHeadroomGB) ? `${requiredHeadroomGB.toFixed(1)} GB` : '⛔ could not be established'}`)
console.log(`      this run adds  : ${expectedLoadGB > 0 ? `~${expectedLoadGB.toFixed(1)} GB (model load) ⇒ projected ${pre.projectedPct ? `${pre.projectedPct.toFixed(1)}%` : '?'}` : 'no model load — weights already resident'}`)
console.log(`      ⇒ ${pre.ok ? '✅ PREFLIGHT PASSES' : `⛔ REFUSED — ${pre.reason}`}`)
console.log(`         ${pre.detail}`)

if (DRY) {
  console.log(`\n   --dry: design and preflight printed, ⛔ nothing run.`)
  console.log(`   ⇒ ${pre.ok ? '⭐ the heavy run would be allowed to start right now.' : '⛔ the heavy run would REFUSE to start right now.'}`)
  process.exit(pre.ok ? 0 : 3)
}
if (!pre.ok) {
  console.error(`\n⛔⛔ REFUSING TO RUN THE CONTENTION A/B — ${pre.reason}`)
  console.error(`   ${pre.detail}`)
  console.error('   ⛔ Nothing was started: no login, no conversation, no background generation.')
  console.error('   ⭐ This is the guard working. Re-check with `--dry` once the box has headroom.')
  process.exit(2)
}

// ⭐ The probe runs for the whole experiment, on its own process, so every sample carries the commit it
// was measured under. ⛔ A latency number without its environment is not reproducible.
const probe = startCommitProbe({ intervalSec: 2 })
if (!probe.ok) {
  console.error('⛔ REFUSING: the commit probe could not start, so samples would carry no environment.')
  process.exit(2)
}
const stopProbe = () => probe.stop()
process.on('exit', stopProbe)

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
  const t1 = Date.now()
  // ⭐ The commit peak is taken from the SEPARATE probe process over this sample's window — ⛔ never
  // sampled inline, which would put a PowerShell launch inside the latency being measured.
  // ⛔ `null` when the window caught no tick: a missing reading is not a low one.
  const peak = probe.peakBetween(t0, t1)
  return { label, ok: true, ttft, total: t1 - t0, tokens, commitPct: peak ? peak.pct : null, commitGB: peak ? peak.committed / GB : null }
}

// ⛔ MID-RUN ABORT. The preflight only proves the box was safe at the START; this experiment then
// deliberately adds load. ⭐ If commit crosses the abort line the run STOPS and reports what it has —
// a partial result honestly labelled beats a complete one bought with a second outage.
let aborted = null
const commitTripped = () => {
  const now = probe.latest()
  if (now && now.pct >= ABORT_PCT) { aborted = now; return true }
  return false
}

const samples = []
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
const cv = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; const sd = Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); return m ? sd / m : 0 }

// ── ⭐ PHASE 1 · THE NOISE FLOOR (IDLE vs IDLE) ────────────────────────────────────────────────
console.log('   ── noise floor: IDLE vs IDLE ───────────────────────────────')
for (let i = 0; i < N && !aborted; i += 1) {
  for (const tag of ['floorA', 'floorB']) {
    const s = await sample(tag)
    samples.push(s)
    const env = s.commitPct == null ? 'commit ?' : `commit ${s.commitPct.toFixed(0)}%`
    console.log(`      ${tag}  ${s.ok ? `${(s.total / 1000).toFixed(1)}s` : `✖ ${s.err}`}   ${env}`)
    if (commitTripped()) break
  }
}

// ── ⭐ PHASE 2 · IDLE vs CONTENDED, ALTERNATING ────────────────────────────────────────────────
console.log('\n   ── IDLE vs CONTENDED (alternating) ─────────────────────────')
for (let i = 0; i < N && !aborted; i += 1) {
  const idle = await sample('idle')
  samples.push(idle)
  console.log(`      idle       ${idle.ok ? `${(idle.total / 1000).toFixed(1)}s` : `✖ ${idle.err}`}   ${idle.commitPct == null ? 'commit ?' : `commit ${idle.commitPct.toFixed(0)}%`}`)
  if (commitTripped()) break

  const load = startLoad()
  await new Promise((r) => setTimeout(r, 1500)) // let the background generation actually start
  const cont = await sample('contended')
  samples.push(cont)
  console.log(`      contended  ${cont.ok ? `${(cont.total / 1000).toFixed(1)}s` : `✖ ${cont.err}`}   ${cont.commitPct == null ? 'commit ?' : `commit ${cont.commitPct.toFixed(0)}%`}`)
  // ⭐ The background load is released BEFORE the abort check, so a trip never leaves a generation
  // running against a box that is already in trouble.
  load.ctl.abort()
  await load.p
  if (commitTripped()) break
}
if (aborted) {
  console.log(`\n   ⛔⛔ ABORTED MID-RUN — commit reached ${aborted.pct.toFixed(1)}% (≥ ${ABORT_PCT}% abort line).`)
  console.log('   ⭐ Background load released. The samples below are PARTIAL and are labelled as such.')
}

// ── REPORT ────────────────────────────────────────────────────────────────────────────────────
// ⭐ Pick TTFT or TOTAL; a null TTFT is DROPPED rather than counted as zero — a missing measurement
// must never enter an average as a fast one.
const arm = (tag, pick = (s) => s.total) => samples.filter((s) => s.label === tag && s.ok)
  .map(pick).filter((v) => typeof v === 'number' && Number.isFinite(v))
const line = (tag) => {
  const a = arm(tag)
  return a.length ? `${tag.padEnd(10)} n=${a.length}  median=${(med(a) / 1000).toFixed(1)}s  CV=${(cv(a) * 100).toFixed(0)}%` : `${tag.padEnd(10)} no samples`
}
console.log('\n══ RESULT ══════════════════════════════════════════════════════════')
for (const t of ['floorA', 'floorB', 'idle', 'contended']) console.log('   ' + line(t))
// ── ⭐⭐⭐ THE NOISE FLOOR, DONE PROPERLY ──────────────────────────────────────────
// ⚠⚠ MY FIRST VERSION COMPARED THE A/B DELTA AGAINST |median(floorA) − median(floorB)|, AND THAT IS A
// BAD FLOOR. With N=6 the difference of two medians drawn from the SAME distribution is itself noisy —
// it can land near zero by luck and then declare almost any delta significant, or land high and hide a
// real one. ⛔ It measures one draw of the noise, not the noise.
// ⇒ the floor is the SPREAD of the pooled floor samples (IQR), which is what "how much does this number
// move when nothing changes" actually means. A delta smaller than the floor's own IQR is not a result.
const q1 = (a) => { const s2 = [...a].sort((x, y) => x - y); return s2[Math.floor(s2.length * 0.25)] }
const q3 = (a) => { const s2 = [...a].sort((x, y) => x - y); return s2[Math.floor(s2.length * 0.75)] }
const report = (name, pick) => {
  const floor = [...arm('floorA', pick), ...arm('floorB', pick)]
  const idleV = arm('idle', pick); const contV = arm('contended', pick)
  if (!floor.length || !idleV.length || !contV.length) { console.log(`   ${name}: not enough samples`); return }
  const iqr = q3(floor) - q1(floor)
  const delta = med(contV) - med(idleV)
  console.log(`
   ${name}`)
  console.log(`      floor (pooled idle/idle)  n=${floor.length}  median=${(med(floor) / 1000).toFixed(2)}s  IQR=${(iqr / 1000).toFixed(2)}s  CV=${(cv(floor) * 100).toFixed(0)}%`)
  console.log(`      idle                      n=${idleV.length}  median=${(med(idleV) / 1000).toFixed(2)}s  CV=${(cv(idleV) * 100).toFixed(0)}%`)
  console.log(`      contended                 n=${contV.length}  median=${(med(contV) / 1000).toFixed(2)}s  CV=${(cv(contV) * 100).toFixed(0)}%`)
  console.log(`      ⭐ delta (contended − idle) = ${(delta / 1000).toFixed(2)}s   vs floor IQR ${(iqr / 1000).toFixed(2)}s`)
  console.log(`      ⇒ ${Math.abs(delta) > iqr
    ? '⛔ THE DELTA EXCEEDS THE NOISE FLOOR — passive work IS affecting this measure'
    : '⚠️ WITHIN THE NOISE FLOOR — this run establishes NO effect on this measure, in either direction'}`)
}
// ⭐ BOTH MEASURES, BECAUSE THEY ARE DIFFERENT EFFECTS ON A PERSON: slower to START speaking is felt
// immediately; slower to FINISH is felt as a long wait. ⛔ Neither substitutes for the other.
report('TIME TO FIRST TOKEN', (s2) => s2.ttft)
report('TOTAL', (s2) => s2.total)
const failed = samples.filter((s2) => !s2.ok)
if (failed.length) console.log(`
   ⚠️ ${failed.length} sample(s) FAILED and are excluded: ${[...new Set(failed.map((f) => f.err))].join(' · ')}`)
const noTtft = samples.filter((s2) => s2.ok && s2.ttft == null)
if (noTtft.length) console.log(`   ⚠⚠ ${noTtft.length} sample(s) produced NO token event — a TTFT of null is a MISSING measurement, ⛔ not a fast one`)
console.log('   ⛔ Reported as median + CV + N. ⛔ Never max−min: a range only grows with N.')

// ── ⭐⭐ THE ENVIRONMENT THE RESULT WAS BOUGHT IN ────────────────────────────────────────────────
// Ote: *"if the experiment runs later, we need to know that the baseline was healthy enough to make the
// result meaningful."* ⇒ the run reports its own commit envelope, and a run whose commit CLIMBED across
// the experiment is not comparable with one that held steady, even if the latencies match.
const commitOf = (tag) => samples.filter((s2) => s2.label === tag && typeof s2.commitPct === 'number').map((s2) => s2.commitPct)
console.log('\n   HOST COMMIT DURING THE RUN')
for (const t of ['floorA', 'floorB', 'idle', 'contended']) {
  const a = commitOf(t)
  console.log(`      ${t.padEnd(10)} ${a.length ? `n=${a.length}  median=${med(a).toFixed(1)}%  max=${Math.max(...a).toFixed(1)}%` : '⛔ no reading'}`)
}
const allPct = probe.samples.map((s2) => s2.pct)
if (allPct.length) {
  const drift = allPct[allPct.length - 1] - allPct[0]
  console.log(`      whole run  start=${allPct[0].toFixed(1)}%  end=${allPct[allPct.length - 1].toFixed(1)}%  peak=${Math.max(...allPct).toFixed(1)}%`)
  console.log(`      ⇒ ${Math.abs(drift) < 5
    ? '⭐ commit held steady — the arms were measured under comparable conditions'
    : `⚠️ commit DRIFTED ${drift > 0 ? '+' : ''}${drift.toFixed(1)} points across the run — ⛔ the arms were NOT measured under the same environment`}`)
}
const noEnv = samples.filter((s2) => s2.ok && s2.commitPct == null)
if (noEnv.length) console.log(`      ⚠️ ${noEnv.length} sample(s) carry NO commit reading — ⛔ a missing environment, not a quiet one`)
if (aborted) console.log(`   ⛔⛔ THIS RUN IS PARTIAL: aborted at ${aborted.pct.toFixed(1)}% commit. ⛔ Do not report it as a completed A/B.`)

const file = new URL('../results/reflection-contention.json', import.meta.url)
writeFileSync(file, JSON.stringify({
  at: new Date().toISOString(),
  reflectModel: REFLECT_MODEL, chatModel: CHAT_MODEL, numCtx: NUM_CTX, maxTok: MAX_TOK,
  // ⭐ THE ENVIRONMENT TRAVELS WITH THE RESULT. A latency file that does not say what the box was doing
  // cannot be compared with another one later, and this box moved between 73% and 100% commit inside
  // twenty minutes today.
  environment: {
    preflight: { ok: pre.ok, reason: pre.reason, detail: pre.detail, reading: pre.reading, requiredHeadroomGB },
    residentAtStart: resident,
    abortPct: ABORT_PCT,
    aborted,
    commitTrace: probe.samples,
  },
  samples,
}, null, 2), 'utf8')
console.log(`\n  wrote ${file.pathname.replace(/^\//, '')}`)
await pg.query(`delete from ${S}.txn_conversations where id = $1`, [cid]).catch(() => {})
await pg.end()
stopProbe()   // ⛔ explicit, not left to the exit hook — see the unref note in lib/host-commit.mjs
