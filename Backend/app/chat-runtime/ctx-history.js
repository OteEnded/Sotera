// CALIBRATION HISTORY — an append-only record of every context-optimum measurement.
//
// Ote: "did we have calibration log? so we can have these to audit" — we did not, and the gap cost an
// hour tonight. `providers.ollamaCtxOptimized` holds ONE entry per model and overwrites it on every run,
// so measuring destroys the previous measurement. When qwen3.6:35b came back 35% lower than its July
// figure there was nothing to diff against: the July value survived only because it happened to be
// dumped to a terminal before the overwrite, and it exists in a chat log rather than in the system.
//
// That is a bad property for a number that (a) drifts boot-to-boot and across Ollama versions, (b)
// silently caps EVERY request through the auto-ctx lever, and (c) had just moved 35% for reasons nobody
// could reconstruct.
//
// WHAT IT RECORDS AND WHY — the fields that matter are the PROVENANCE, not the number. Tonight proved
// this repeatedly: the same model measured 73,728 or 98,304 or 122,880 depending purely on the KV cache
// type, and "73,728" on its own is unfalsifiable without knowing which. A history of bare values would
// have been almost as useless as no history.
//
// ⚠️ Ollama does NOT expose its own OLLAMA_KV_CACHE_TYPE / OLLAMA_FLASH_ATTENTION over the API — they are
// process env read at `ollama serve` startup. So they are recorded as null with an explicit
// `configNotExposed: true`, NOT omitted. An absent field reads as "same as before"; an explicit null
// reads as "we could not know", which is the honest claim and the one that stops a future reader
// comparing two entries that were never comparable.

const MAX_ENTRIES = 300 // bounded like every other stored list here; ~20 models × 15 runs of real history

/**
 * Append one measurement to the history, newest LAST, bounded.
 * Pure — the caller owns reading/writing the setting.
 *
 * @param {Array}  history  existing entries (may be undefined on first run)
 * @param {object} entry    { key, model, ctx, trained, vramGB, loads, fitsFull, note, error, measuredAt, ...provenance }
 * @returns {Array} the new history
 */
export function appendCalibration(history, entry) {
  const list = Array.isArray(history) ? history : []
  if (!entry || typeof entry.key !== 'string' || !entry.key) return list
  const next = [...list, { ...entry }]
  // Drop from the FRONT: the oldest measurements are the ones whose provenance is least likely to still
  // be reconstructable, and the recent trend is what a drift question actually needs.
  return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next
}

/**
 * The previous successful measurement for a model, so a run can report what CHANGED rather than only
 * what it is. A number in isolation is what made tonight's 35% drop invisible until it was too late.
 */
export function previousFor(history, key, { before = null } = {}) {
  const list = Array.isArray(history) ? history : []
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i]
    if (e?.key !== key || e?.error || !Number.isInteger(e?.ctx)) continue
    if (before && e.measuredAt >= before) continue
    return e
  }
  return null
}

/**
 * Compare a fresh result against the previous one for the same model.
 * Returns null when there is nothing to compare — a FIRST measurement is not a 0% change, and reporting
 * it as one would be inventing a baseline.
 */
export function deltaAgainstPrevious(history, entry) {
  if (!entry || !Number.isInteger(entry.ctx)) return null
  const prev = previousFor(history, entry.key, { before: entry.measuredAt })
  if (!prev) return null
  const pctRaw = ((entry.ctx - prev.ctx) / prev.ctx) * 100
  return {
    previousCtx: prev.ctx,
    previousAt: prev.measuredAt,
    deltaCtx: entry.ctx - prev.ctx,
    deltaPct: Math.round(pctRaw * 10) / 10,
    // Flag a move worth a human look. 5% covers ordinary run-to-run noise; anything past it is the class
    // of change that went unexplained tonight.
    significant: Math.abs(pctRaw) >= 5,
    // What was DIFFERENT about the conditions. Without this a delta is just two numbers disagreeing —
    // the whole point is being able to say "and the KV cache type changed between them".
    changed: changedFields(prev, entry),
  }
}

const PROVENANCE_FIELDS = ['ollamaVersion', 'gpuDriver', 'gpuCount', 'kvCacheType', 'flashAttention', 'host']
function changedFields(prev, next) {
  const out = {}
  for (const f of PROVENANCE_FIELDS) {
    const a = prev?.[f] ?? null
    const b = next?.[f] ?? null
    if (a !== b) out[f] = { from: a, to: b }
  }
  return Object.keys(out).length ? out : null
}

/** Newest-first view for one model (or all), for the console. */
export function historyFor(history, key = null, limit = 50) {
  const list = Array.isArray(history) ? history : []
  return list
    .filter((e) => !key || e?.key === key)
    .slice(-limit)
    .reverse()
}

export const CTX_HISTORY_MAX = MAX_ENTRIES
