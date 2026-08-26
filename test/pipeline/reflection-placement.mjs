// ⭐⭐⭐ WHERE DOES A REAL REFLECTION ACTUALLY RUN? — configured placement vs OBSERVED placement.
//
//   node pipeline/reflection-placement.mjs
//
// Ote, 2026-08-26: *"The fact that it was absent from VRAM in your latest check is expected because the
// reflection worker was idle/gated; it does not prove the worker's actual placement… The contention
// experiment only means what we think it means if passive reflection is actually exercising the GPU 35B
// inference path we're intending to measure."*
//
// ⭐ He is right, and the distinction is the point of this file:
//   CONFIGURED placement — what the code and config say should happen. Already established by reading:
//     the lane passes NO residency option, and the `ollama` provider has no `forceCpu`, so the gateway
//     injects no `numGpu`. ⇒ configured = GPU.
//   OBSERVED placement — what the GPU is actually doing while a generation is in flight. ⛔ Only a live
//     run can show this, and absence while idle shows nothing at all.
//
// ── ⚠️ THIS STARTS ONE REAL 35B GENERATION ON THE GPU ────────────────────────────────────────────
// Authorised explicitly: *"do one controlled real reflection run."* ⛔ It is ONE, on a conversation
// chosen so it cannot disturb the cursor experiment.
//
// ── ⛔ WHICH CONVERSATION, AND WHY NOT THE OBVIOUS ONE ──────────────────────────────────────────
// ⛔ NOT `7198c1b0`. That is the only conversation that can prove cursor continuity naturally, and
// forcing a run on it would consume the proof artificially — the exact thing Ote ruled out. This uses an
// agent_dev conversation that has never been reflected, so the run is genuine and the artefact is one
// the natural sweep would have produced anyway.

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { reflectOnConversation } from '../../Backend/app/components/reflection-lifecycle-host.js'

const TARGET = process.argv[2] || '1be99117'
if (TARGET.startsWith('7198c1b0')) { console.error('⛔ refusing: that conversation is the natural cursor proof'); process.exit(1) }

const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config, log: { info: () => {}, warn: (o, m) => console.log('WARN', m ?? ''), error: (o, m) => console.log('ERR', m ?? ''), debug: () => {} } }
const pg = devPg(); await pg.connect()
const S = devSchema()

const [conv] = (await pg.query(
  `select c.id::text id, u.username room,
          (select count(*)::int from ${S}.txn_messages m where m.conversation_id = c.id) msgs
     from ${S}.txn_conversations c left join ${S}.mst_users u on u.id = c.user_id
    where c.id::text like $1`, [`${TARGET}%`])).rows
if (!conv) { console.error(`⛔ no conversation matching ${TARGET}`); process.exit(1) }

// ── THE OBSERVER ────────────────────────────────────────────────────────────────────────────────
// ⛔ Read-only: `nvidia-smi --query-*` and Ollama's `/api/ps` both report state and start nothing.
const smi = () => {
  try {
    const out = execFileSync('nvidia-smi', ['--query-gpu=index,utilization.gpu,memory.used', '--format=csv,noheader,nounits'], { encoding: 'utf8' })
    return out.trim().split('\n').map((l) => { const [i, u, m] = l.split(',').map((x) => Number(x.trim())); return { gpu: i, util: u, usedMiB: m } })
  } catch { return null }
}
const ps = async () => {
  try {
    const r = await fetch('http://127.0.0.1:11434/api/ps', { signal: AbortSignal.timeout(4000) })
    const d = await r.json()
    return (d.models ?? []).map((m) => ({ name: m.name, vramGB: +(m.size_vram / 1e9).toFixed(2), totalGB: +(m.size / 1e9).toFixed(2) }))
  } catch { return null }
}

const baseline = smi()
const basePs = await ps()
console.log('\n══ RUNTIME PLACEMENT OF A REAL REFLECTION ═══════════════════════════')
console.log(`   target        : ${conv.id.slice(0, 8)}  room=${conv.room}  ${conv.msgs} messages   ⛔ not 7198c1b0`)
console.log(`   CONFIGURED    : lane passes no residency option · provider has no forceCpu ⇒ GPU`)
console.log(`   BASELINE gpu  : ${baseline ? baseline.map((g) => `gpu${g.gpu} ${g.util}% ${g.usedMiB}MiB`).join('  ') : 'nvidia-smi unavailable'}`)
console.log(`   BASELINE ps   : ${basePs?.length ? basePs.map((m) => `${m.name} vram=${m.vramGB}GB`).join('  ') : '(nothing loaded)'}`)
console.log('\n   ⚠️ starting ONE real generation now…\n')

const trace = []
let ticking = true
const poll = (async () => {
  while (ticking) {
    const g = smi(); const p = await ps()
    trace.push({ t: Date.now(), gpu: g, models: p })
    const line = g ? g.map((x) => `gpu${x.gpu} ${String(x.util).padStart(3)}% ${String(x.usedMiB).padStart(5)}MiB`).join('  ') : 'n/a'
    const m35 = (p ?? []).find((x) => /35b/i.test(x.name))
    console.log(`   ${new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false })}  ${line}   ${m35 ? `⭐ ${m35.name} vram=${m35.vramGB}GB` : (p?.length ? p.map((x) => `${x.name.split(':')[0]}=${x.vramGB}GB`).join(' ') : '—')}`)
    await new Promise((r) => setTimeout(r, 2500))
  }
})()

const t0 = Date.now()
let result = null
try {
  result = await reflectOnConversation(fastify, { conversationId: conv.id, force: true })
} catch (e) {
  result = { error: e?.message }
}
ticking = false
await poll
const took = ((Date.now() - t0) / 1000).toFixed(1)

// ── VERDICT ─────────────────────────────────────────────────────────────────────────────────────
console.log(`\n══ RESULT (${took}s) ════════════════════════════════════════════════`)
console.log(`   reflectOnConversation → ${JSON.stringify(result).slice(0, 200)}`)
const peak = trace.reduce((mx, s) => Math.max(mx, (s.gpu ?? []).reduce((a, g) => a + g.usedMiB, 0)), 0)
const baseTotal = (baseline ?? []).reduce((a, g) => a + g.usedMiB, 0)
const peakUtil = trace.reduce((mx, s) => Math.max(mx, (s.gpu ?? []).reduce((a, g) => Math.max(a, g.util), 0)), 0)
const saw35 = trace.some((s) => (s.models ?? []).some((m) => /35b/i.test(m.name) && m.vramGB > 0.5))
const max35 = trace.reduce((mx, s) => Math.max(mx, ((s.models ?? []).find((m) => /35b/i.test(m.name))?.vramGB ?? 0)), 0)
console.log(`   GPU memory     : baseline ${baseTotal} MiB → peak ${peak} MiB   (Δ ${peak - baseTotal} MiB)`)
console.log(`   GPU utilisation: peak ${peakUtil}%`)
console.log(`   35B in VRAM    : ${saw35 ? `✅ YES — peak ${max35} GB` : '⛔ NO — never observed above 0.5 GB'}`)
console.log(`\n   ⇒ OBSERVED placement: ${saw35 ? '⭐ GPU — the lane exercises the path the contention experiment intends to measure' : '⛔ NOT GPU — configured and observed DISAGREE. Stop and characterize before measuring contention.'}`)

writeFileSync(new URL('../results/reflection-placement.json', import.meta.url),
  JSON.stringify({ at: new Date().toISOString(), conversation: conv.id, result, baseline, basePs, trace, peak, peakUtil, saw35, max35 }, null, 2), 'utf8')
await pg.end()
