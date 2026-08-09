// Ollama context auto-optimization — find, per model, the LARGEST num_ctx that still fits
// fully in VRAM. Zero CPU spill is the target because spill IS the performance cliff
// (measured on this hardware: qwen3.6:27b = 21 tok/s with no spill, 13 at 2.7GB spill,
// 4 at 16GB — while gemma4:26b runs its full 256k window all-VRAM at 87 tok/s).
//
// Calibration is EMPIRICAL, not analytical: architectures differ too much to model KV
// growth from metadata (sliding-window attention, GQA head counts, Ollama's parallel
// slots all change the bytes/token). Instead the model is loaded a handful of times
// (empty-prompt /api/generate = load-only, honors options.num_ctx — verified live,
// done_reason:"load") and /api/ps reports total size vs size_vram:
//   1. load at the trained max — no spill? done in ONE load (the gemma case).
//   2. spilled? size_vram at that point ≈ the usable VRAM budget (Ollama filled it).
//      A second load at the minimum gives a linear bytes/token estimate → smart guess.
//   3. verify the guess, then binary-refine between known-fit and known-spill.
// Results persist in the providers.ollamaCtxOptimized setting; the providers.ollamaAutoCtx
// lever caps every request at min(root num_ctx, measured optimum).

import { execFile } from 'node:child_process'
import { getSetting, setSetting } from '../settings/index.js'
import { trainedContextLength, peekTrainedContextLength } from '../../providers/ollama/index.js'
import { appendCalibration, deltaAgainstPrevious } from './ctx-history.js'

const DEFAULT_HOST = 'http://127.0.0.1:11434'
const Q = 4096 // candidates are multiples of this — neat values, coarse enough to converge fast
const MIN_CTX = 4096
const SPILL_TOLERANCE = 64 * 1024 * 1024 // ≤64MiB counts as "fits" (reporting jitter, not real spill)
const CEILING_FALLBACK = 262_144 // search ceiling when the trained max is unknown
const LOAD_TIMEOUT_MS = 300_000 // big models at big ctx can take minutes to (re)load
const MAX_PROBE_LOADS = 8

export function normalizeHost(host) {
  return (host || DEFAULT_HOST).replace(/\/+$/, '')
}

export function calKey(host, model) {
  return `${normalizeHost(host)}|${model}`
}

const gbOf = (bytes) => Math.round((bytes / 1073741824) * 10) / 10

// "No limit" sentinel: when root sets no num_ctx limit, requests carry this and the
// provider adapter clamps it down to each model's trained max (an unknown trained max
// drops num_ctx entirely rather than asking Ollama for a million tokens). Must stay in
// sync with the same constant in providers/ollama/index.js.
export const NO_LIMIT = 1_048_576

export function optimizedEntryFor(config, host, model) {
  const map = getSetting(config, 'providers.ollamaCtxOptimized')
  const entry = map ? map[calKey(host, model)] : null
  return entry && Number.isInteger(entry.ctx) ? entry : null
}

// The cap auto-optimize actually enforces. Two cases:
//  - the optimum is VRAM-BOUND (the model spills past it): scale by root's
//    providers.ollamaCtxOptimalPct — headroom for other GPU work — floored to 1k steps.
//  - fitsFull (the optimum IS the trained max; the MODEL is the limit, not the GPU):
//    the percent is skipped — headroom already exists, scaling down buys nothing
//    (deepseek-ocr fits its whole 8k in a third of one GPU; 90% of it is pure loss).
// Policy on top of data: changing the percent never requires re-calibration.
export function appliedOptimum(config, entry) {
  if (!entry || !Number.isInteger(entry.ctx) || entry.ctx <= 0) return null
  if (entry.fitsFull === true) return entry.ctx
  const pct = getSetting(config, 'providers.ollamaCtxOptimalPct')
  const scaled = Math.floor((entry.ctx * (Number.isInteger(pct) ? pct : 100)) / 100 / 1024) * 1024
  return Math.max(MIN_CTX, scaled)
}

// Root's MANUAL per-model cap, if set. A judgement rather than a measurement, so it takes precedence
// over the calibrated optimum — including upward (accepting spill on purpose). Still clamped to the
// trained max, which is the model's own hard limit rather than a policy choice.
export function manualCapFor(config, host, model) {
  const map = getSetting(config, 'providers.ollamaCtxManual')
  const n = map ? map[calKey(host, model)] : null
  if (!Number.isInteger(n) || n <= 0) return null
  const trained = peekTrainedContextLength(host, model) || optimizedEntryFor(config, host, model)?.trained || 0
  return trained > 0 ? Math.min(n, trained) : n
}

// The num_ctx a request should carry. providers.ollamaNumCtxLimit is a LIMIT, not the
// window: 0 = no limit — each model runs at its own maximum (the auto-optimize cap when
// calibrated + lever on, else NO_LIMIT which the adapter clamps to the trained max).
// A limit LOWER than the cap is used as-is — auto only ever downsizes.
//
// Precedence, narrowest wins EXCEPT that a manual cap replaces the measured one:
//   root's manual per-model cap  >  auto-optimize cap  >  no cap
// then the global ollamaNumCtxLimit still binds on top (it is a platform ceiling, and a per-model
// override must not be able to punch through it).
export function effectiveNumCtx(config, host, model) {
  const limit = getSetting(config, 'providers.ollamaNumCtxLimit')
  const base = Number.isInteger(limit) && limit > 0 ? limit : NO_LIMIT
  const manual = manualCapFor(config, host, model)
  if (manual) return Math.min(base, manual)
  if (getSetting(config, 'providers.ollamaAutoCtx') !== true) return base
  const cap = appliedOptimum(config, optimizedEntryFor(config, host, model))
  return cap ? Math.min(base, cap) : base
}

// The window the token-budget guard should judge against: same as effectiveNumCtx, but
// "no limit" resolves to the model's trained max — from the adapter's sync cache, or the
// persisted calibration entry when the cache is cold (fresh boot, lever off). 0 = unknown,
// which just skips the guard for that first turn.
export function guardWindow(config, host, model) {
  const w = effectiveNumCtx(config, host, model)
  if (w < NO_LIMIT) return w
  const peeked = peekTrainedContextLength(host, model)
  if (peeked) return peeked
  const entry = optimizedEntryFor(config, host, model)
  return entry && Number.isInteger(entry.trained) && entry.trained > 0 ? entry.trained : 0
}

// Load-only: an empty prompt loads the model with the given num_ctx and returns after the
// load (no generation). /api/ps then reports the runner's size / size_vram.
async function measureLoad(base, model, numCtx) {
  const r = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: '', options: { num_ctx: numCtx }, keep_alive: '5m' }),
    signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),
  })
  const g = await r.json().catch(() => ({}))
  if (!r.ok || g?.error) throw new Error(g?.error || `load failed (HTTP ${r.status})`)
  const ps = await (await fetch(`${base}/api/ps`, { signal: AbortSignal.timeout(10_000) })).json()
  const m = (ps.models || []).find((x) => (x.model || x.name) === model)
  if (!m) {
    // Cloud-hosted models (":cloud") load remotely and never appear in local /api/ps —
    // there is no local VRAM to fit, so calibration doesn't apply.
    throw new Error(/:cloud$/.test(model)
      ? 'cloud-hosted model — runs on remote hardware, nothing to calibrate'
      : 'model not reported by /api/ps after load')
  }
  return { size: m.size || 0, sizeVram: m.size_vram || 0, spill: (m.size || 0) - (m.size_vram || 0) }
}

// Evict every OTHER loaded model first so the measurement sees the real VRAM budget —
// a neighbour's weights make the optimum look smaller than it is.
//
// ⚠️ IT MUST WAIT FOR THEM TO ACTUALLY GO. `keep_alive: 0` returns 200 immediately and Ollama frees the
// VRAM asynchronously; the original version fired the unloads and returned, so in a batch run each model
// was measured while its PREDECESSOR was still resident. Measured cost of that bug: qwen3.6:35b came back
// at 73,728 against 112,640 in a clean July run — a 35% under-report — and nemotron3:33b reported
// "weights alone exceed VRAM" while a 23.6GB neighbour held the cards. This is the same defect as the
// unload route (asking is not the same as it having happened), so it gets the same fix: re-read /api/ps
// and confirm.
const EVICT_TIMEOUT_MS = 90_000
async function evictOthers(base, model) {
  const others = async () => {
    const ps = await (await fetch(`${base}/api/ps`, { signal: AbortSignal.timeout(10_000) })).json()
    return (ps.models || []).map((m) => m.model || m.name).filter((id) => id && id !== model)
  }
  try {
    let pending = await others()
    if (!pending.length) return { evicted: [], stuck: [] }
    const asked = [...pending]
    for (const id of pending) {
      await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: id, prompt: '', keep_alive: 0 }),
        signal: AbortSignal.timeout(60_000),
      }).catch(() => {})
    }
    // Poll until the cards are actually clear. A model that never leaves is a WEDGED RUNNER, and the
    // caller is told rather than silently handed a measurement taken against the wrong VRAM budget.
    const deadline = Date.now() + EVICT_TIMEOUT_MS
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 700))
      pending = await others()
      if (!pending.length) break
    }
    return { evicted: asked.filter((id) => !pending.includes(id)), stuck: pending }
  } catch {
    return { evicted: [], stuck: [], error: true } // best-effort, but never silently "succeeded"
  }
}

const quantize = (n) => Math.max(MIN_CTX, Math.floor(n / Q) * Q)

export async function calibrate({ host, model, trainedMax, onProgress = () => {} }) {
  const base = normalizeHost(host)
  const ceiling = quantize(Math.min(trainedMax || CEILING_FALLBACK, 1_048_576))
  let loads = 0
  const probe = async (ctx) => {
    loads += 1
    onProgress({ phase: `load ${loads}: testing ${ctx.toLocaleString()} ctx`, loads })
    try {
      return await measureLoad(base, model, ctx)
    } catch (e) {
      // A ":cloud" model or a missing /api/ps entry isn't context-dependent — there is
      // nothing to calibrate, so re-throw and let the job report it. But a genuine LOAD
      // FAILURE at this window (some models crash at their full trained window — e.g.
      // glm-ocr's `ggml_nbytes > INT_MAX` GGML overflow at 131k) just means THIS ctx is
      // too big: signal that so the search steps DOWN instead of aborting calibration.
      if (/cloud-hosted|not reported by/.test(e.message)) throw e
      onProgress({ phase: `load ${loads}: ${ctx.toLocaleString()} ctx won't load — trying smaller`, loads })
      return { loadFailed: true, size: 0, sizeVram: 0, spill: Infinity }
    }
  }
  // "too big" = the model spilled out of VRAM OR failed to load outright at this window.
  const tooBig = (m) => m.loadFailed === true || m.spill > SPILL_TOLERANCE

  // A neighbour that refuses to unload makes every number below wrong, so it is surfaced rather than
  // absorbed: the result carries the note and the caller can see why an optimum looks small.
  const evict = await evictOthers(base, model)
  if (evict.stuck?.length) {
    onProgress({ phase: `⚠ ${evict.stuck.join(', ')} would not unload — VRAM budget is reduced`, loads })
  }
  const contended = evict.stuck?.length ? { measuredAgainst: `contended VRAM — ${evict.stuck.join(', ')} still resident` } : {}

  const top = await probe(ceiling)
  if (!tooBig(top)) {
    return { ctx: ceiling, fitsFull: true, vramGB: gbOf(top.sizeVram), loads, ...contended }
  }
  if (ceiling <= MIN_CTX) {
    return { ctx: MIN_CTX, fitsFull: false, vramGB: gbOf(top.sizeVram), loads, note: 'spills even at the minimum window', ...contended }
  }

  const bottom = await probe(MIN_CTX)
  if (tooBig(bottom)) {
    return {
      ctx: MIN_CTX, fitsFull: false, vramGB: gbOf(bottom.sizeVram), loads,
      note: bottom.loadFailed ? 'fails to load even at the minimum window' : 'weights alone exceed VRAM',
      ...contended,
    }
  }

  // Search for the largest window that fits. When the top load SPILLED we have a size to
  // extrapolate from (rate = KV bytes per ctx token; the spilled load's size_vram is the
  // empirical VRAM budget). When the top load outright FAILED there is no size to model, so
  // fall back to a plain bisection between the known-good and known-bad windows.
  let fit = MIN_CTX
  let spillAt = ceiling
  let next
  if (!top.loadFailed && top.size > bottom.size) {
    const rate = (top.size - bottom.size) / (ceiling - MIN_CTX)
    const budget = top.sizeVram
    next = rate > 0
      ? Math.min(Math.max(quantize((budget - (bottom.size - MIN_CTX * rate)) / rate), MIN_CTX + Q), ceiling - Q)
      : quantize((fit + spillAt) / 2)
  } else {
    next = quantize((fit + spillAt) / 2)
  }

  while (loads < MAX_PROBE_LOADS) {
    const m = await probe(next)
    if (!tooBig(m)) fit = Math.max(fit, next)
    else spillAt = Math.min(spillAt, next)
    if (spillAt - fit <= 2 * Q) break
    next = quantize((fit + spillAt) / 2)
    if (next <= fit || next >= spillAt) break
  }

  // Leave the runner loaded AT the answer: hygiene after a spill probe, a free
  // double-check of the result, and the first real chat reuses the warm runner.
  onProgress({ phase: `confirming ${fit.toLocaleString()} ctx`, loads })
  const confirm = await measureLoad(base, model, fit).catch(() => null)
  if (confirm && confirm.spill > SPILL_TOLERANCE && fit - Q >= MIN_CTX) fit -= Q // paranoia: back off one step
  // A hard load-failure ceiling is a MODEL/runtime limit, not a GPU one — say so, so the
  // console tooltip explains why a model with plenty of VRAM is still capped below its max.
  const note = top.loadFailed ? "model won't load at its full trained window — capped to the largest that loads" : undefined
  return { ctx: fit, fitsFull: false, vramGB: gbOf((confirm || bottom).sizeVram), loads, ...(note ? { note } : {}), ...contended }
}

// ---- one-at-a-time background job (the console POSTs, then polls) --------------------
// `models` may be a single id or a list ("Calibrate all" — the hardware-change refresh):
// the queue runs SEQUENTIALLY (loads fight over the same VRAM), one entry per model in
// `results`, and a failed model never aborts the rest of the batch.
const job = {
  running: false, provider: null, model: null, key: null, index: 0, total: 0, results: [],
  phase: '', loads: 0, startedAt: null, finishedAt: null, error: null, result: null,
}

// PROVENANCE for the history. Gathered ONCE per calibration job, not per model — it cannot change
// mid-run, and nvidia-smi is a subprocess spawn we already ration elsewhere.
//
// ⚠️ `kvCacheType` and `flashAttention` are deliberately NULL. Ollama reads them from process env at
// `ollama serve` startup and exposes them nowhere in its API (checked: /api/version, /api/ps, /api/show
// all silent on it). They are the fields that mattered MOST tonight — the same model measured 73,728 vs
// 98,304 vs 122,880 on nothing but the KV cache type — so they are recorded as an explicit unknown with
// `configNotExposed`, never omitted. An absent field reads as "unchanged"; an explicit null reads as
// "we could not know", which is the only honest claim and the one that stops a later reader comparing
// two entries that were never comparable.
async function gatherProvenance(host) {
  const out = {
    ollamaVersion: null, gpuDriver: null, gpuCount: null,
    kvCacheType: null, flashAttention: null, configNotExposed: true, host,
  }
  try {
    const r = await fetch(`${normalizeHost(host)}/api/version`, { signal: AbortSignal.timeout(5000) })
    if (r.ok) out.ollamaVersion = (await r.json())?.version ?? null
  } catch { /* enrichment */ }
  try {
    out.gpuDriver = await new Promise((res) => execFile('nvidia-smi',
      ['--query-gpu=driver_version', '--format=csv,noheader'], { timeout: 5000, windowsHide: true },
      (e, so) => res(e || !so ? null : String(so).trim().split(/\r?\n/)[0].trim() || null)))
    if (out.gpuDriver) {
      out.gpuCount = await new Promise((res) => execFile('nvidia-smi', ['--query-gpu=index', '--format=csv,noheader'],
        { timeout: 5000, windowsHide: true },
        (e, so) => res(e || !so ? null : String(so).trim().split(/\r?\n/).filter((l) => /^\d+$/.test(l.trim())).length || null)))
    }
  } catch { /* no nvidia-smi is a normal state, not an error */ }
  return out
}

export function calibrationStatus() {
  return { ...job, results: [...job.results] }
}

// Append one measurement to the durable history and return how it compares to the last one.
// Deliberately NEVER throws: a history write must not be able to fail a calibration — the optimum is the
// product, the log is the record. But it does not fail SILENTLY either; a broken write is logged, because
// a history that quietly stops recording is worse than one that was never added.
async function recordHistory(db, config, entry, log) {
  try {
    const hist = getSetting(config, 'providers.ollamaCtxHistory') || []
    const delta = deltaAgainstPrevious(hist, entry)
    const next = appendCalibration(hist, delta ? { ...entry, delta } : entry)
    const w = await setSetting(db, 'providers.ollamaCtxHistory', next, config)
    if (w?.error) throw new Error(w.error)
    return delta
  } catch (e) {
    log?.warn?.({ err: e?.message || String(e) }, '[ctx] calibration history write FAILED — the measurement stands, the record does not')
    return null
  }
}

export function startCalibration({ provider, providerConfig, models, config, db, log }) {
  if (job.running) return { error: 'calibration_running' }
  const list = Array.isArray(models) ? models : [models]
  if (!list.length || list.some((m) => typeof m !== 'string' || !m)) return { error: 'no_models' }
  const host = providerConfig?.host
  Object.assign(job, {
    running: true, provider, model: list[0], key: calKey(host, list[0]), index: 0, total: list.length,
    results: [], phase: 'starting', loads: 0, startedAt: new Date().toISOString(), finishedAt: null, error: null, result: null,
  })
  ;(async () => {
    // Once per job — it cannot change mid-run, and nvidia-smi is a subprocess.
    const provenance = await gatherProvenance(host)
    for (let i = 0; i < list.length; i++) {
      const model = list[i]
      Object.assign(job, { model, key: calKey(host, model), index: i, phase: 'starting', loads: 0, result: null })
      try {
        const trainedMax = await trainedContextLength(host, model)
        const res = await calibrate({
          host, model, trainedMax,
          onProgress: (p) => Object.assign(job, p),
        })
        const map = { ...(getSetting(config, 'providers.ollamaCtxOptimized') || {}) }
        map[job.key] = {
          ctx: res.ctx,
          trained: trainedMax ?? null,
          vramGB: res.vramGB,
          loads: res.loads,
          measuredAt: new Date().toISOString(),
          fitsFull: res.fitsFull,
          ...(res.note ? { note: res.note } : {}),
        }
        const w = await setSetting(db, 'providers.ollamaCtxOptimized', map, config)
        if (w.error) throw new Error(w.error)
        job.result = map[job.key]
        const delta = await recordHistory(db, config, { key: job.key, model, ...map[job.key], ...provenance }, log)
        if (delta) job.result = { ...job.result, delta }
        job.results.push({ model, ...job.result })
        log?.info?.({ model: job.key, ...job.result }, '[ctx] calibration complete')
        if (delta?.significant) {
          log?.warn?.({ model: job.key, ...delta }, '[ctx] optimum moved significantly since the last measurement')
        }
      } catch (e) {
        const msg = e?.message || String(e)
        job.error = msg // single-model callers read this; batch callers read results[]
        job.results.push({ model, error: msg })
        // A FAILED calibration is history too. Without it the log would show a model's optimum simply
        // stopping, with no record that we tried and why it did not work — the same silent-gap problem
        // the history exists to close.
        await recordHistory(db, config, { key: job.key, model, error: msg, measuredAt: new Date().toISOString(), ...provenance }, log)
        log?.warn?.({ model: job.key, err: msg }, '[ctx] calibration failed')
      }
    }
    job.running = false
    job.finishedAt = new Date().toISOString()
    job.phase = 'done'
  })()
  return { ok: true }
}
