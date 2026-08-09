// THE NIGHTLY HEALTH SUITE — the one thing that watches OLS once it is feature-frozen.
//
// Ote froze OLS on 2026-08-08 to start the Persona arc. FROZEN MEANS FEATURE FREEZE, NEVER SHUTDOWN: it
// keeps serving, and under shape (a) Sotera calls it as one of several API providers. So the risk is not a
// decommissioned box — it is a LIVE DEPENDENCY NOBODY IS LOOKING AT, where a silent break shows up as
// Sotera behaving oddly and the cause sits in a system unopened for weeks. This job exists for that.
//
// TIER: the DEFAULT test-all tier only — 843 unit tests + the server-only checks, and NO Ollama. Two
// reasons, both deliberate:
//   · it is GPU-FREE, so it never competes with Sotera for the cards (that is why 03:00 vs her 01:00 is
//     comfort rather than necessity)
//   · it contains apikey-owner-standing-check — the check that caught root's API keys being dead for two
//     days. Not hypothetical coverage; the one failure this job has already proven it would catch.
// `--full` is deliberately NOT scheduled: it buys model-routing coverage we have never had a silent bug
// in, at the price of the exact GPU contention the timing is designed to avoid.
//
// ⚠ WHY THE SNAPSHOT/RESTORE WRAPPER IS THE REAL WORK, NOT THE CRON LINE.
// The default tier is NOT read-only. api-sweep creates and deletes users and PATCHes settings; cache-check
// flips embeddings.cacheEnabled off and back; settings-source / retention / token-limits do the same with
// their own keys. Every one cleans up in a `finally` — which holds for a normal failure and does NOT hold
// for a process that dies mid-run (power, GPU fault, OOM). That would leave a GLOBAL SETTING FLIPPED on a
// system nobody is watching: precisely the failure this job exists to prevent, caused by this job.
// So the whole suite runs inside a settings snapshot, and the restore is unconditional.
//
// ⚠ AND THE SETTINGS ARE GLOBAL, so a run overlapping the 04:00 maintenance pass could have maintenance
// read reflectMode / consolidateEnabled mid-flip. That is what the 03:00/04:00 gap is for — it is not
// aesthetic spacing.
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { log } from '../../lib/utility.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TEST_DIR = path.resolve(HERE, '../../../test')
const RUN_TIMEOUT_MS = 20 * 60 * 1000

/**
 * Snapshot every settings row. Returns a restore() that puts the table back EXACTLY as it was —
 * re-creating rows a check deleted and deleting rows a check added, not merely re-writing the ones it
 * happens to remember. A partial restore is how you end up believing you are back to normal.
 */
export async function snapshotSettings(db) {
  if (!db?.mst_settings) return { rows: [], restore: async () => ({ skipped: 'no-db' }) }
  const rows = (await db.mst_settings.findAll()).map((r) => ({ key: r.key, value: r.value }))
  const before = new Map(rows.map((r) => [r.key, JSON.stringify(r.value)]))
  return {
    rows,
    async restore() {
      const now = await db.mst_settings.findAll()
      const seen = new Set()
      let changed = 0, removed = 0
      for (const r of now) {
        seen.add(r.key)
        if (!before.has(r.key)) { await db.mst_settings.destroy({ where: { key: r.key } }); removed++; continue }
        if (JSON.stringify(r.value) !== before.get(r.key)) {
          await db.mst_settings.update({ value: JSON.parse(before.get(r.key)) }, { where: { key: r.key } })
          changed++
        }
      }
      for (const r of rows) {
        if (!seen.has(r.key)) { await db.mst_settings.create({ key: r.key, value: r.value }); changed++ }
      }
      return { changed, removed }
    },
  }
}

/** Run the default test-all tier as a child process. Never throws; a crash is a RESULT, not an exception. */
export function runSuite({ cwd = TEST_DIR, timeoutMs = RUN_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let out = ''
    const child = spawn(process.execPath, ['pipeline/test-all.mjs'], { cwd, windowsHide: true })
    const timer = setTimeout(() => { try { child.kill() } catch { /* already gone */ } }, timeoutMs)
    timer.unref?.()
    child.stdout?.on('data', (d) => { out += d })
    child.stderr?.on('data', (d) => { out += d })
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, code: null, out: `${out}\nspawn error: ${e.message}` }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, code, out }) })
  })
}

/** The last few meaningful lines — enough to act on, short enough to read on a phone. */
export function summarise(out, max = 12) {
  const lines = String(out || '').split(/\r?\n/).filter((l) => l.trim())
  const bad = lines.filter((l) => /FAIL|✖|failed|not ok/i.test(l))
  return (bad.length ? bad : lines).slice(-max).join('\n')
}

/**
 * One health run: snapshot → suite → restore → report.
 *
 * ⚠ ALWAYS LOGS; ALERTS ONLY ON RED. A nightly "all green" message trains the reader to ignore the channel,
 * which is the same disease as a check that goes red every run. Green is a log line; red is an interruption.
 *
 * @param {*} fastify
 * @param {{notify?: (subject: string, body: string) => Promise<void>}} opts
 *        `run` is injectable so the RED path can be PROVEN on demand instead of waiting for a real
 *        failure. An alert that has never fired once is indistinguishable from a broken one, and the only
 *        honest way to fire it deliberately is to be able to hand this a failing run.
 *        `notify` is the RED-ONLY delivery seam. Left injectable rather than hard-wired because WHERE an
 *        alert should land is Ote's call (a conversation? the digest?), and guessing a target that is never
 *        read would recreate the exact problem this job solves.
 */
export async function runHealthSuite(fastify, { notify = null, run = runSuite } = {}) {
  const started = Date.now()
  const snap = await snapshotSettings(fastify?.db)
  let result
  try {
    result = await run()
  } finally {
    // Unconditional: this is the whole point of the wrapper.
    try {
      const r = await snap.restore()
      if (r?.changed || r?.removed) {
        await log(`[health-suite] settings restored after the run: ${JSON.stringify(r)}`, import.meta.url)
      }
    } catch (e) {
      // A failed restore is MORE serious than a failed suite — say so loudly and alert regardless of colour.
      await log(`[health-suite] ⚠ SETTINGS RESTORE FAILED: ${e.message}`, import.meta.url)
      if (notify) await notify('OLS health: SETTINGS RESTORE FAILED', String(e.message)).catch(() => {})
    }
  }
  const secs = Math.round((Date.now() - started) / 1000)
  const line = `[health-suite] ${result.ok ? 'GREEN' : `RED (exit ${result.code})`} in ${secs}s`
  await log(line, import.meta.url)
  if (!result.ok) {
    const body = summarise(result.out)
    await log(`[health-suite] failure detail:\n${body}`, import.meta.url)
    if (notify) await notify(`OLS nightly health check FAILED (exit ${result.code})`, body).catch(() => {})
  }
  return { ok: result.ok, code: result.code, seconds: secs, summary: result.ok ? null : summarise(result.out) }
}
