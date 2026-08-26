// ⭐⭐ HOST COMMIT — THE AXIS THE CONTENTION EXPERIMENT WAS MISSING.
//
// 2026-08-26 18:21:07 +07 this box hit a Windows **low virtual memory** condition and it killed
// **Postgres** and Ote's editor. The consumers named in the event were `llama-server.exe` (29.8 GB),
// a second `llama-server.exe` (8.5 GB) and `claude.exe` (2.4 GB), against a 71.7 GB commit limit.
//
// ⭐⭐ THE LESSON, AND WHY THIS FILE EXISTS: I had scoped contention entirely as *"does a background
// 35B steal the GPU from an interactive turn?"* ⛔ That is the narrow half. A model resident on the
// **GPU** still commits host address space for its mapping, and any model Ollama places on the **CPU**
// spends real host memory. ⇒ a lane can schedule politely on the GPU and still take the box down.
// The experiment must therefore measure **host commit** beside latency, and must REFUSE TO START when
// there is not enough headroom to run safely.
//
// ⚠️ WINDOWS ONLY, DELIBERATELY. `Committed Bytes` / `Commit Limit` are Windows counters and there is
// no portable equivalent. ⭐ On any other platform this returns null and the preflight REFUSES — ⛔ it
// never reports "healthy" for an environment it cannot actually measure.

import { execFileSync, spawn } from 'node:child_process'

const PS = 'powershell.exe'
const PS_ARGS = ['-NoProfile', '-NonInteractive', '-Command']
export const GB = 1024 ** 3

// ⭐ ONE COUNTER SOURCE FOR BOTH the preflight and the live probe. An earlier read of this box took the
// preflight from `Get-Counter` and a sample from `Win32_OperatingSystem`; they agreed to within 0.1 GB
// that time, but two sources that merely happen to agree are not one measurement.
const BS = String.fromCharCode(92)
const COUNTERS = `'${BS}Memory${BS}Committed Bytes','${BS}Memory${BS}Commit Limit'`

const finite = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0

/** Parse "committed,limit" — ⛔ returns null on anything it cannot fully trust. */
const parsePair = (line) => {
  const [cb, cl] = String(line).trim().split(',').map((x) => Number(x))
  if (!finite(cb) || !finite(cl) || cb > cl) return null
  return { committed: cb, limit: cl, pct: (100 * cb) / cl, headroomGB: (cl - cb) / GB }
}

/** One synchronous reading. Returns null if it cannot be taken — ⛔ never a guess. */
export const readCommit = () => {
  if (process.platform !== 'win32') return null
  try {
    const cmd = `$c = Get-Counter ${COUNTERS} -ErrorAction Stop; `
      + `$cb = ($c.CounterSamples | Where-Object Path -like '*committed bytes*').CookedValue; `
      + `$cl = ($c.CounterSamples | Where-Object Path -like '*commit limit*').CookedValue; `
      + `Write-Output ('{0},{1}' -f [int64]$cb, [int64]$cl)`
    return parsePair(execFileSync(PS, [...PS_ARGS, cmd], { encoding: 'utf8', timeout: 25000, windowsHide: true }))
  } catch {
    return null
  }
}

/**
 * A streaming probe on its OWN process.
 *
 * ⭐ `-Continuous` streams from ONE PowerShell rather than spawning one per sample: a latency
 * experiment must not pay a process launch every two seconds inside the window it is timing.
 * ⛔ Never sample commit inline in the request path, for the same reason.
 */
export const startCommitProbe = ({ intervalSec = 2 } = {}) => {
  const samples = []
  const dead = { samples, ok: false, stop: () => {}, peakBetween: () => null, latest: () => null }
  if (process.platform !== 'win32') return dead
  let child = null
  try {
    const cmd = `Get-Counter ${COUNTERS} -Continuous -SampleInterval ${intervalSec}`
      + ` | ForEach-Object { $s = $_.CounterSamples; `
      + `$cb = ($s | Where-Object Path -like '*committed bytes*').CookedValue; `
      + `$cl = ($s | Where-Object Path -like '*commit limit*').CookedValue; `
      + `Write-Output ('{0},{1}' -f [int64]$cb, [int64]$cl) }`
    child = spawn(PS, [...PS_ARGS, cmd], { windowsHide: true })
  } catch {
    return dead
  }
  let buf = ''
  child.stdout.on('data', (d) => {
    buf += d.toString()
    let i
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i)
      buf = buf.slice(i + 1)
      const p = parsePair(line)
      if (p) samples.push({ t: Date.now(), ...p })
    }
  })
  child.on('error', () => {})
  // ⚠️ UNREF, OR THE HARNESS NEVER EXITS. A piped child keeps the event loop alive, and the obvious
  // cleanup — `process.on('exit', stop)` — cannot save it: `exit` only fires once the loop has drained,
  // and the loop cannot drain while this child holds it. ⛔ A cleanup that depends on the thing it is
  // cleaning up already being finished is not a cleanup.
  try { child.unref(); child.stdout.unref(); child.stderr.unref() } catch { /* nothing to unref */ }
  return {
    samples,
    ok: true,
    stop: () => { try { child.kill() } catch { /* already gone */ } },
    // ⛔ null, not 0, when the window caught no sample — a missing reading is not a low one.
    peakBetween: (t0, t1) => {
      const w = samples.filter((s) => s.t >= t0 && s.t <= t1)
      if (!w.length) return null
      return w.reduce((mx, s) => (s.pct > mx.pct ? s : mx), w[0])
    },
    latest: () => (samples.length ? samples[samples.length - 1] : null),
  }
}

/**
 * ⭐⭐⭐ THE GUARD, AND IT FAILS CLOSED.
 *
 * Ote: *"The guard should fail closed and clearly report why it refused to start."*
 *
 * ⛔ THREE WAYS TO REFUSE, AND *UNREADABLE* IS ONE OF THEM. The reflection idle gate spent 28 hours
 * refusing under a reason code that named the wrong cause, so every refusal here carries its own
 * distinct `reason` and the numbers behind it — ⛔ never one label covering two different failures.
 *
 * `requiredHeadroomGB` is derived by the CALLER from what is actually resident, ⛔ not a magic number.
 *
 * ⭐ `reading` is injectable ONLY so the check can exercise every branch deterministically. Two of the
 * four refusals — `commit-pressure` and `commit-unreadable` — cannot be produced on demand on a healthy
 * box, and a guard whose refusal paths are never executed is a guard nobody has tested. ⛔ Callers in
 * anger must omit it and let the real counter be read.
 *
 * ⚠️⚠️ `expectedLoadGB` CLOSES A HOLE THE FIRST VERSION HAD, AND IT IS THIS PROJECT'S USUAL SHAPE:
 * `maxPct` was answering *"is the box safe NOW?"* while the run's whole purpose is to make the box
 * busier. The first `--dry` on a real box passed at 54.7% with 32.5 GB headroom against a 30.3 GB
 * requirement — and loading the 22.3 GB model it was clearing would have landed at **85.8%**, above the
 * same 85% ceiling. ⛔ A guard that permits a run into the state it refuses to start in is not a guard.
 * ⇒ the ceiling is now applied to the PROJECTED commit as well as the measured one.
 */
export const preflightCommit = ({ requiredHeadroomGB, maxPct = 85, expectedLoadGB = 0, reading: injected }) => {
  if (!finite(requiredHeadroomGB)) {
    return {
      ok: false,
      reason: 'requirement-unknown',
      reading: null,
      detail: 'the caller could not establish how much headroom this run needs, so there is nothing to check against',
    }
  }
  const reading = injected === undefined ? readCommit() : injected
  if (!reading) {
    return {
      ok: false,
      reason: 'commit-unreadable',
      reading: null,
      detail: process.platform !== 'win32'
        ? 'not Windows — this guard can only measure commit on Windows, and it will not certify what it cannot measure'
        : 'Get-Counter returned nothing usable; an unmeasurable environment is REFUSED, never assumed healthy',
    }
  }
  if (reading.pct > maxPct) {
    return {
      ok: false,
      reason: 'commit-pressure',
      reading,
      detail: `commit is at ${reading.pct.toFixed(1)}% of the limit, above the ${maxPct}% ceiling for starting a load test`,
    }
  }
  if (reading.headroomGB < requiredHeadroomGB) {
    return {
      ok: false,
      reason: 'insufficient-headroom',
      reading,
      detail: `headroom is ${reading.headroomGB.toFixed(1)} GB but this run needs ${requiredHeadroomGB.toFixed(1)} GB`,
    }
  }
  // ⭐ THE PROJECTED STATE — the question the first version never asked.
  const projectedPct = (100 * (reading.committed + Math.max(0, expectedLoadGB) * GB)) / reading.limit
  if (projectedPct > maxPct) {
    return {
      ok: false,
      reason: 'projected-pressure',
      reading,
      projectedPct,
      detail: `commit is a comfortable ${reading.pct.toFixed(1)}% now, but this run adds about `
        + `${expectedLoadGB.toFixed(1)} GB and would reach ${projectedPct.toFixed(1)}%, above the ${maxPct}% ceiling`,
    }
  }
  return {
    ok: true,
    reason: 'clear',
    reading,
    projectedPct,
    detail: `headroom ${reading.headroomGB.toFixed(1)} GB (needs ${requiredHeadroomGB.toFixed(1)}) at ${reading.pct.toFixed(1)}% of limit`
      + (expectedLoadGB > 0 ? `, projected ${projectedPct.toFixed(1)}% once loaded` : ''),
  }
}

/** Human-readable one-liner for a reading. */
export const describeCommit = (r) => (r
  ? `${(r.committed / GB).toFixed(1)} of ${(r.limit / GB).toFixed(1)} GB (${r.pct.toFixed(1)}%, headroom ${r.headroomGB.toFixed(1)} GB)`
  : 'unreadable')
