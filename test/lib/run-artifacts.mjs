// IMMUTABLE RUN ARTIFACTS — one unique path per experiment run, and prior runs cannot be overwritten.
//
// ⚠️ WHY THIS EXISTS, measured 2026-08-19. `self-model-falsifiers.mjs` opened a FIXED path and truncated
// it with `writeFileSync(OUT, '')`. So starting the n=105 replication **destroyed the n=21 run's replies
// at the moment it launched** — and the only reason that data still exists is that it happened to have
// been committed an hour earlier. The evidence for a pre-registered experiment survived by luck.
//
// ⭐ The rule this encodes: **a run's output is written once and never reopened.** Not "usually unique" —
// a collision must be an ERROR, because the failure it prevents is silent and total.
//
// Scope note (Ote, 2026-08-19): *"fix only the experiment artifact handling… Do not change the
// experimental conditions or production behavior."* Nothing here touches probes, prompts, models,
// detectors or arms. It decides a filename and refuses to clobber.

import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

/** UTC, filename-safe, sorts chronologically: 2026-08-19T18-40-05Z */
export function runStamp(date = new Date()) {
  return date.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')
}

/** Filename-safe fragment of a parameter value (`qwen3.6:35b` → `qwen3.6-35b`). */
const safe = (v) => String(v).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')

/**
 * Build the artifact path for ONE run. Self-describing on purpose: the parameters that define the run
 * are IN the name, so a directory listing answers "which run was this?" without opening anything.
 *
 * ⚠️ PURE — takes `now` and `exists` as injectable seams so the collision behaviour is unit-testable
 * without touching the disk. A guarantee that is only asserted in a comment is not a guarantee.
 *
 * @param {object} o
 * @param {string} o.dir      results directory
 * @param {string} o.stem     experiment name, e.g. 'self-model-falsifiers'
 * @param {object} [o.params] run parameters folded into the name, e.g. { r: 15, model: 'qwen3.6:35b' }
 * @param {Date}   [o.now]
 * @param {(p:string)=>boolean} [o.exists]
 * @returns {string} absolute path that does NOT yet exist
 * @throws if the path already exists — never silently picks another name
 */
export function allocateRunPath({ dir, stem, params = {}, now = new Date(), exists = existsSync } = {}) {
  if (!dir || !stem) throw new Error('allocateRunPath: dir and stem are required')
  const parts = Object.entries(params).map(([k, v]) => `${safe(k)}${safe(v)}`)
  const name = [stem, runStamp(now), ...parts].join('_') + '.jsonl'
  const path = join(dir, name)
  // ⭐ THROW, do not disambiguate. Auto-suffixing would hide the bug this module exists to prevent:
  // two runs believing they are the same run is exactly the confusion that cost us run 1.
  if (exists(path)) throw new Error(`allocateRunPath: refusing to overwrite an existing run artifact: ${path}`)
  return path
}

/**
 * Open a run artifact for append-only writing. Creates the file with the `wx` flag so the filesystem
 * itself rejects a collision — belt and braces with the check above, and the half that survives a race.
 * @returns {{path: string, write: (row: object) => void}}
 */
export function openRunArtifact({ dir, stem, params = {}, now = new Date() } = {}) {
  mkdirSync(dir, { recursive: true })
  const path = allocateRunPath({ dir, stem, params, now })
  writeFileSync(path, '', { flag: 'wx' }) // wx = fail if it exists
  // MANIFEST: append-only index so tooling finds runs without guessing names or globbing.
  // ⚠️ Appended when the run STARTS, so a crashed run still leaves a trace. A manifest that only
  // records successes cannot answer "did that run happen?", which is the question you ask after a crash.
  try {
    appendFileSync(join(dir, 'runs.jsonl'),
      `${JSON.stringify({ stem, params, started: now.toISOString(), artifact: path.split(/[\\/]/).pop() })}\n`)
  } catch { /* the manifest is a convenience; never fail a run over it */ }
  return { path, write: (row) => appendFileSync(path, `${JSON.stringify(row)}\n`) }
}
