// LOCAL MONITOR — what is actually resident on this box right now, and whose it is.
//
// Ote's ask: "root console, i want local monitor. report current model running on local. flag which one run
// from the platform. can manage and else."
//
// Three things it answers that nothing else could:
//   1. WHAT is loaded (Ollama's /api/ps) with its real footprint and where it sits (VRAM vs system RAM).
//   2. WHOSE it is — joined against the local-usage ledger. Ollama cannot tell you this; only we know what
//      we asked for. A resident model with no platform record is somebody ELSE's, or a leftover.
//   3. BOTH METERS. Every residency mistake this session came from watching one and not the other: aux
//      models pinned to CPU look free on /api/ps (0 VRAM) while holding 18.5GB of RAM. VRAM alone lies.
//
// It is also the view that would have made the wedged-runner incident obvious in one glance instead of an
// hour: a model past its own expiry, holding 25GB, that the platform had not called in minutes.

import os from 'node:os'
import { execFile } from 'node:child_process'
import { getSetting } from '../settings/index.js'
import { effectiveProviders } from '../adapters/index.js'
import { localUseOf, allLocalUse } from './local-usage.js'

const bare = (id) => (typeof id === 'string' ? id.replace(/^[^/]+\//, '') : null)

// ONE unit for the whole page: binary GiB (labelled "GB", as nvidia-smi and Task Manager both do).
// This page exists to answer "does this model fit on that card", and it previously answered it in two
// different units — model sizes and system RAM in decimal GB, GPU tiles in GiB from nvidia-smi's MiB. A
// 19.23 "GB" model against a 15.9 "GB" card was not the comparison it looked like.
const GIB = 1073741824
const MIB_PER_GIB = 1024

// CPU UTILISATION from os.cpus() tick deltas — deliberately NOT a subprocess. Windows' typeperf/WMI paths
// each cost a process spawn, and this page polls; the cached nvidia-smi is already the only spawn we tolerate.
// A delta needs two samples, so the FIRST call honestly returns null instead of inventing a number from
// cumulative-since-boot ticks, which would read as a flat average that never moves.
let cpuPrev = null
function cpuUtilPct() {
  const now = os.cpus().reduce((acc, c) => {
    acc.idle += c.times.idle
    acc.total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq
    return acc
  }, { idle: 0, total: 0 })
  const prev = cpuPrev
  cpuPrev = now
  if (!prev) return null
  const dTotal = now.total - prev.total
  const dIdle = now.idle - prev.idle
  if (dTotal <= 0) return null
  return Math.max(0, Math.min(100, Math.round((1 - dIdle / dTotal) * 100)))
}

// nvidia-smi is optional: no NVIDIA, no driver, or a locked-down box all just mean "no VRAM detail".
// Never let it fail the page — the RAM half is the half that has actually bitten us.
//
// CACHED, because this is a SUBPROCESS SPAWN and the page polls. Measured 60ms per call; at the original
// 5s interval that was a process every 5 seconds for as long as the tab stayed open — a monitor taxing the
// box it exists to watch, on a machine whose whole problem is resources. VRAM totals move on a model-load
// timescale, so a 10s cache loses nothing real.
let gpuCache = { at: 0, value: null }
const GPU_TTL_MS = 10_000
function readGpus() {
  if (Date.now() - gpuCache.at < GPU_TTL_MS) return Promise.resolve(gpuCache.value)
  return new Promise((resolve) => {
    execFile('nvidia-smi', ['--query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu,power.draw,power.limit,temperature.gpu', '--format=csv,noheader,nounits'],
      { timeout: 3000, windowsHide: true }, (err, stdout) => {
        if (err || !stdout) { gpuCache = { at: Date.now(), value: null }; return resolve(null) }
        // nvidia-smi prints "[N/A]" for fields a card does not report — Number() makes that NaN, and a NaN
        // rendered as 0% or 0W would be a confident lie. null instead, so the UI can show "—".
        const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
        const gpus = String(stdout).trim().split(/\r?\n/).filter(Boolean).map((line) => {
          const [name, total, used, free, util, draw, limit, temp] = line.split(',').map((x) => x.trim())
          return {
            name,
            totalGB: +(Number(total) / MIB_PER_GIB).toFixed(1),
            usedGB: +(Number(used) / MIB_PER_GIB).toFixed(1),
            freeGB: +(Number(free) / MIB_PER_GIB).toFixed(1),
            utilPct: num(util),
            powerW: num(draw) == null ? null : Math.round(num(draw)),
            powerLimitW: num(limit) == null ? null : Math.round(num(limit)),
            tempC: num(temp),
          }
        })
        gpuCache = { at: Date.now(), value: gpus.length ? gpus : null }
        resolve(gpuCache.value)
      })
  })
}

// Which configured ROLE does a bare model name serve? Derived from settings rather than tracked, so it
// stays correct when root changes a lever without anything needing to re-register.
function rolesFor(config, name) {
  const roles = []
  const eq = (setting) => bare(getSetting(config, setting)) === name
  if (eq('chat.defaultModel')) roles.push('chat default')
  if (eq('memory.resolverModel')) roles.push('slot resolver')
  if (eq('memory.extractModel')) roles.push('memory extractor')
  if (eq('memory.embeddingModel')) roles.push('embeddings')
  if (eq('chat.visionRelayModel')) roles.push('vision relay')
  if (eq('chat.summaryModel')) roles.push('summaries')
  if (eq('chat.scheduleAssistModel')) roles.push('schedule assist')
  return roles
}

// PURE classification of one /api/ps row. Exported so the rules that matter — GPU vs CPU placement, the
// stale/wedged signature, and the attribution flag — are testable without a live Ollama. They were written
// from real incidents, so they deserve tests that pin them rather than a screenshot that happened to look
// right on the day.
export function describeModel(m, use, config, now = Date.now()) {
  const expiresAt = m.expires_at ? new Date(m.expires_at) : null
  const expiresInSec = expiresAt && !Number.isNaN(expiresAt.getTime()) ? Math.round((expiresAt.getTime() - now) / 1000) : null
  // A GPU-placed model reports its VRAM; a CPU-placed one reports 0. The 1e8 floor ignores the few MB of
  // host-side scratch a GPU model still shows, which would otherwise read as "partly on CPU".
  const onGpu = (m.size_vram ?? 0) > 1e8
  const sizeGB = +((m.size ?? 0) / GIB).toFixed(2)

  // ---- AGE OUT stale users (Ote: "make it that inactive conversation hide from this over time, so it
  // not keep polute the list") ----
  // The window is the model's OWN keep_alive, so the list is self-consistent: it only ever shows people
  // who used the model inside the period it stays resident for. Derived rather than read from config,
  // because chat requests do not set keep_alive at all (Ollama's own default applies) while the aux
  // models each carry their own — one config number would be wrong for most rows.
  // Ollama pushes expires_at forward on every request, so for the caller whose request was the most
  // recent, keep_alive ≈ remaining life + how long ago they called. If someone ELSE has touched the
  // model since, this over-estimates, which errs toward showing an entry rather than hiding a live one.
  const keepAliveSec = expiresInSec != null && use?.ageSec != null
    ? Math.max(60, expiresInSec + use.ageSec)
    : 300 // Ollama's default 5m — used when the model reports no expiry (e.g. keep_alive:-1)
  let platform = use
  if (use?.users?.length) {
    const fresh = use.users.filter((u) => u.ageSec <= keepAliveSec)
    platform = {
      ...use,
      users: fresh,
      // Say what was hidden rather than silently shrinking the list — a count that quietly drops is the
      // same class of defect as a guard that only fires one way.
      agedOut: use.users.length - fresh.length,
      keepAliveSec,
    }
  }
  return {
    name: m.name,
    sizeGB,
    vramGB: +((m.size_vram ?? 0) / GIB).toFixed(2),
    ramGB: onGpu ? 0 : sizeGB, // CPU-placed models are pure system RAM — the meter that kept getting missed
    placement: onGpu ? 'gpu' : 'cpu',
    contextLength: m.context_length ?? null,
    parameterSize: m.details?.parameter_size ?? null,
    quantization: m.details?.quantization_level ?? null,
    expiresAt: m.expires_at ?? null,
    expiresInSec,
    // ⚠️ PAST ITS OWN EXPIRY AND STILL LOADED is the wedged-runner signature — surfaced, not buried.
    // 30s of grace so ordinary clock skew and a slow poll never cry wolf.
    stale: expiresInSec != null && expiresInSec < -30,
    roles: rolesFor(config, m.name),
    platform,        // null = the platform has no record of asking for it THIS PROCESS
    // ⚠️ "no record" IS NOT "somebody else's". The ledger is per-process, so every restart blanks it and
    // every resident model looks foreign until it is called again — Ote hit this twice and reasonably
    // objected: "there's no program i run other than this". The honest word is UNATTRIBUTED, and the
    // caller gets `ledgerAgeSec` alongside it so a young ledger reads as "we may simply have missed it"
    // rather than an accusation. Claiming a conclusion we cannot support is exactly the failure mode this
    // page was built to expose in other people's tooling.
    unattributed: !use,
  }
}

/**
 * A snapshot of local (Ollama) residency + attribution + both memory meters.
 * @param {object} config fastify.config
 */
export async function localSnapshot(config, db = null) {
  const provs = effectiveProviders(config)
  // every ollama-kind provider entry, so a CPU-pinned twin ("ollama-cpu") is reported as a host we serve
  const hosts = Object.entries(provs)
    .filter(([name, cfg]) => (cfg?.kind || name) === 'ollama' && cfg?.enabled !== false)
    .map(([name, cfg]) => ({ provider: name, host: cfg.host || 'http://127.0.0.1:11434', forceCpu: cfg.forceCpu === true }))
  const host = hosts[0]?.host || 'http://127.0.0.1:11434'

  let reachable = false
  let version = null
  let running = []
  let psError = null
  try {
    const [v, ps] = await Promise.all([
      fetch(`${host}/api/version`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()).catch(() => null),
      fetch(`${host}/api/ps`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()),
    ])
    version = v?.version ?? null
    running = ps?.models || []
    reachable = true
  } catch (e) {
    psError = e?.message || String(e)
  }

  const now = Date.now()
  const models = running.map((m) => describeModel(m, localUseOf(m.name), config, now))
    .sort((a, b) => b.sizeGB - a.sizeGB)

  // WHO is on each model. The ledger holds user IDs; a raw UUID tells a human nothing, so resolve them to
  // names in ONE query for every id across every row rather than per row. Root has no users row — its id
  // is null and it is labelled directly. A lookup failure degrades to the id, never breaks the page.
  const ids = [...new Set(models.flatMap((m) => (m.platform?.users || []).map((u) => u.id).filter(Boolean)))]
  const nameById = new Map()
  if (db?.mst_users && ids.length) {
    try {
      for (const u of await db.mst_users.findAll({ where: { id: ids }, attributes: ['id', 'username', 'display_name'] })) {
        nameById.set(u.id, u.display_name || u.username)
      }
    } catch { /* names are enrichment — the monitor still works without them */ }
  }

  // WHICH CHAT each user was running. One query for every conversation id across every row, same as
  // names. `updated_at` is the honest "last activity" signal — the row is touched on each new message.
  const convoIds = [...new Set(models.flatMap((m) => (m.platform?.users || []).flatMap((u) => (u.conversations || []).map((c) => c.id))))]
  const convoById = new Map()
  if (db?.txn_conversations && convoIds.length) {
    try {
      // The timestamp must be selected as an EXPLICIT [column, alias] pair. conversation.model.js sets
      // `updatedAt: 'updated_at'` in the model options, but that does not make 'updatedAt' usable as an
      // attribute name here — asking for it produced `column "updatedAt" does not exist`, and because the
      // catch below used to be silent, every LIVE conversation rendered as "deleted chat". A confident
      // wrong answer, from a swallowed error, in the exact place this page exists to prevent them.
      for (const c of await db.txn_conversations.findAll({ where: { id: convoIds }, attributes: ['id', 'title', ['updated_at', 'updatedAt']] })) {
        convoById.set(c.id, { title: c.title || null, updatedAt: c.get('updatedAt') ?? null })
      }
    } catch (e) {
      // Enrichment only — but SAY SO. A silent catch here made every live conversation render as
      // "deleted chat", which is a confident wrong answer rather than a missing one.
      console.warn(`[local-monitor] conversation lookup failed: ${e?.message || e}`)
    }
  }

  for (const m of models) {
    if (!m.platform?.users) continue
    m.platform.users = m.platform.users.map((u) => ({
      ...u,
      // ⚠️ A raw id fragment is NOT a name. The old fallback printed `id.slice(0,8)`, which rendered a
      // deleted account as an 8-hex string that looked like an identifier the reader ought to recognise
      // — Ote read a column of them as conversation ids. If the lookup finds nothing the account is gone
      // (the ledger is per-process and outlives a DELETE), so say that.
      name: u.id == null ? 'root' : (nameById.get(u.id) || null),
      deleted: u.id != null && !nameById.has(u.id),
      conversations: (u.conversations || []).map((c) => {
        const row = convoById.get(c.id)
        return {
          ...c,
          title: row?.title || null,
          gone: !row,          // deleted chat — same honesty rule as a deleted user
          lastMessageAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
        }
      }),
    }))
  }

  // models we HAVE used that are not currently resident — context for "why is this slow again"
  const loadedNames = new Set(models.map((m) => m.name))
  const recentlyUsed = allLocalUse()
    .filter((u) => !loadedNames.has(u.model))
    .sort((a, b) => a.ageSec - b.ageSec)
    .slice(0, 10)

  // BINARY GiB everywhere on this page. nvidia-smi reports MiB and Task Manager shows GiB, so a decimal
  // divisor here made the RAM tile read 34.0 against GPU tiles reading 15.9 — different units, side by
  // side, on the page whose entire job is "does this model fit on that card".
  const totalRam = os.totalmem() / GIB
  const freeRam = os.freemem() / GIB
  const gpus = await readGpus()
  return {
    host,
    hosts,
    reachable,
    error: psError,
    version,
    models,
    recentlyUsed,
    totals: {
      loaded: models.length,
      onGpuGB: +models.reduce((n, m) => n + m.vramGB, 0).toFixed(2),
      onCpuGB: +models.reduce((n, m) => n + m.ramGB, 0).toFixed(2),
      unattributed: models.filter((m) => m.unattributed).length,
      stale: models.filter((m) => m.stale).length,
    },
    // VRAM ATTRIBUTION — the same question this page answers for RAM, applied to the other meter.
    // nvidia-smi reports what the DRIVER sees; summing our models' size_vram says what Ollama accounts
    // for. The difference is everything else on the card (another runtime, a game, a desktop compositor).
    // Only computed when both numbers are real, and floored at 0 — the two come from different sources and
    // a small negative would be rounding, not a discovery.
    vram: gpus ? (() => {
      const usedGB = +gpus.reduce((n, g) => n + g.usedGB, 0).toFixed(2)
      const ollamaGB = +models.reduce((n, m) => n + m.vramGB, 0).toFixed(2)
      return { usedGB, ollamaGB, otherGB: Math.max(0, +(usedGB - ollamaGB).toFixed(2)) }
    })() : null,
    memory: {
      // ⚠️ CORRECTION. This used to claim os.totalmem() was PHYSICAL INSTALLED (34.0) while Windows'
      // "visible" figure was 31.7, and labelled them as two different measures. They are the SAME
      // measure: 34,049,331,200 bytes is 31.71 GiB, and PowerShell's TotalVisibleMemorySize returns
      // exactly 31.71 GiB. The gap was decimal-vs-binary and nothing else — a confident explanation for
      // a discrepancy that did not exist. (The 0.29 GiB the visible figure omits is hardware reservation,
      // and neither number was ever showing that.)
      // ⚠️ THE NUMBERS ABOVE ARE THE WORKED EXAMPLE, NOT THIS BOX. Installed was 32 GiB when that was
      // written; it is 64 GiB since 2026-08-05 and this reads 63.7. The arithmetic is what the note is for.
      ramTotalGB: +totalRam.toFixed(1),
      ramUsedGB: +(totalRam - freeRam).toFixed(1),
      ramFreeGB: +freeRam.toFixed(1),
      ramUsedPct: Math.round(((totalRam - freeRam) / totalRam) * 100),
    },
    cpu: {
      cores: os.cpus().length,
      utilPct: cpuUtilPct(), // null on the very first poll — shown as "—", never a fake 0%
      // CPU PACKAGE WATTAGE is not exposed by Windows/WMI without vendor tooling (Intel Power Gadget,
      // LibreHardwareMonitor). Reported as null WITH the reason rather than guessed: a fabricated watt
      // figure is worse than an honest blank on a page whose entire job is telling you the truth.
      powerW: null,
      powerNote: 'CPU package power needs vendor tooling on Windows — not available here',
    },
    gpus,
    // How long OUR ledger has existed. Without it "external" is unreadable: right after a restart the
    // ledger is empty, so everything resident looks foreign when it may simply predate us. The flag is
    // only as old as the process, and the reader has to be able to see that.
    ledgerAgeSec: Math.round(process.uptime()),
    // The server states the polling cadence rather than the client picking one: residency moves on a
    // keep_alive timescale (minutes), and the GPU read behind this is a cached subprocess.
    pollSeconds: 10,
    at: new Date().toISOString(),
  }
}

function ollamaHost(config) {
  const provs = effectiveProviders(config)
  const entry = Object.entries(provs).find(([n, cfg]) => (cfg?.kind || n) === 'ollama')
  return entry?.[1]?.host || 'http://127.0.0.1:11434'
}

/** Ask Ollama to unload a model (keep_alive: 0). Non-destructive: it reloads on the next request. */
export async function unloadLocalModel(config, name) {
  const host = ollamaHost(config)
  const r = await fetch(`${host}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: name, keep_alive: 0 }),
    signal: AbortSignal.timeout(15000),
  })
  const body = await r.json().catch(() => ({}))
  // Ollama answers 200 with done_reason:'unload' even when the runner then ignores it — measured during
  // the wedged-runner incident. So report what we ASKED, and let the caller re-read /api/ps to see whether
  // it actually went. Saying "unloaded" here would be the same kind of lie this page exists to expose.
  return { requested: true, ok: r.ok, doneReason: body?.done_reason ?? null }
}

/**
 * Release EVERY resident model in one action (Ote 2026-08-04).
 *
 * Reads /api/ps for the truth rather than trusting a snapshot the client passed in — the caller's
 * table can be up to a poll interval stale, and releasing a model that a colleague loaded ten
 * seconds ago should still be reported honestly.
 *
 * ⚠️ THEN IT CONFIRMS. `keep_alive: 0` answers 200 immediately and Ollama frees the runner a beat
 * later, and a WEDGED runner answers the same 200 and never leaves (measured 2026-07-31). Both the
 * single-model route and the calibrator learned this the hard way, so this re-reads /api/ps and
 * reports per-model `released` vs `stuck`. "Asked" is not "happened".
 */
const RELEASE_ALL_TIMEOUT_MS = 30_000
export async function releaseAllLocalModels(config) {
  const host = ollamaHost(config)
  const resident = async () => {
    const r = await fetch(`${host}/api/ps`, { signal: AbortSignal.timeout(10_000) })
    const j = await r.json()
    return (j.models || []).map((m) => m.model || m.name).filter(Boolean)
  }

  const asked = await resident()
  if (!asked.length) return { asked: [], released: [], stuck: [] }

  for (const id of asked) {
    await fetch(`${host}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: id, keep_alive: 0 }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {}) // one refusing model must not abort the rest
  }

  // Poll until the cards clear, or the deadline says something is wedged.
  let pending = asked
  const deadline = Date.now() + RELEASE_ALL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 700))
    pending = await resident().catch(() => pending)
    if (!pending.length) break
  }
  return { asked, released: asked.filter((id) => !pending.includes(id)), stuck: pending }
}
