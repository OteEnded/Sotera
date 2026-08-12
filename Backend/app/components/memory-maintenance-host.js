// Persona Memory v2 — background maintenance (RFC_PERSONA_MEMORY §4.5). Runs on the daily cron
// pass (see plugins/cron.js), NOT on the hot path. Applies the pure decay plan: soft-archive clear
// noise (never-recalled, old, low-importance, unpinned turns) and demote idle memories to cold.
// Safe by design — pinned / important / recently-used memories are never touched, and "archive" is
// soft (expired_at set, row kept) so it's auditable and reversible.
//
// TUNABLE + AUDITED (2026-08-03). Two gaps closed together, because they were the same gap:
//   - The thresholds were defaults baked into memoryDecayPlan's signature, and cron called
//     decayMemories(db) passing nothing. Load-bearing constants with no knob — the same shape as
//     SLOT_SEM_THRESHOLD — so tuning decay meant editing code.
//   - A pass that archived something wrote a COUNT to the server log and nothing else, leaving
//     "where did my fact go?" unanswerable for exactly the deletions no human performed.
// Now settings drive the plan, and every archived row gets a log_memory_changes entry naming the rule
// that took it, with a snapshot — so an automatic deletion is as traceable as a manual one, and
// recoverable through the same restore path.
//
// ⚠️ Worth knowing before tuning: at the default `decayImportanceMax` of 3, EXTRACTED FACTS ARE
// EFFECTIVELY IMMUNE — the extractor assigns importance 6-8, so the archive rule can only reach
// episodic prose and unscored rows. That is deliberate (facts should not rot silently), but it means
// raising this number is a far bigger change than it looks: at 6 it starts eating real facts.

import { memoryDecayPlan } from '@ote/memory/cognition/memory-rank.js'
import { logMemoryChange, snapshot } from '../audit/memory-log.js'
import { getSetting } from '../settings/index.js'

const DAY = 864e5

/** Read the decay knobs, falling back to the historical constants when there is no config to read
 *  (unit tests construct this with a bare db and no fastify). */
export function decaySettings(config) {
  const read = (key, fallback, ok) => {
    try {
      const v = getSetting(config, key)
      return ok(v) ? v : fallback
    } catch { return fallback }
  }
  const num = (key, fallback) => read(key, fallback, Number.isFinite)
  return {
    enabled: read('memory.decayEnabled', true, (v) => typeof v === 'boolean'),
    archiveAgeMs: num('memory.decayArchiveDays', 30) * DAY,
    coldAgeMs: num('memory.decayColdDays', 14) * DAY,
    importanceMax: num('memory.decayImportanceMax', 3),
  }
}

export async function decayMemories(db, { now = () => Date.now(), archiveAgeMs, coldAgeMs, importanceMax, config = null, log = null } = {}) {
  if (!db?.txn_memories) return { skipped: true }
  const { txn_memories } = db
  const s = decaySettings(config)
  if (!s.enabled) return { skipped: true, reason: 'memory.decayEnabled is off' }
  // Explicit arguments win over settings — tests pin thresholds directly, and a future manual trigger
  // can preview a different cutoff without changing the platform's.
  const plan = {
    archiveAgeMs: archiveAgeMs ?? s.archiveAgeMs,
    coldAgeMs: coldAgeMs ?? s.coldAgeMs,
    importanceMax: importanceMax ?? s.importanceMax,
  }
  const rows = await txn_memories.findAll({ where: { expired_at: null, invalid_at: null }, raw: true })
  const t = now()
  const { archive, demote } = memoryDecayPlan(rows, { now: t, ...plan })
  if (archive.length) await txn_memories.update({ expired_at: new Date(t), tier: 'cold' }, { where: { id: archive } })
  if (demote.length) await txn_memories.update({ tier: 'cold' }, { where: { id: demote } })
  // AUDIT every archived belief individually. A count in the server log tells you the pass ran; only a
  // per-row entry tells you WHICH belief went, and makes it findable again. Demotions are deliberately
  // NOT logged — tiering changes ranking, removes nothing, and logging it would bury the deletions.
  if (archive.length) {
    const ageDays = Math.round(plan.archiveAgeMs / DAY)
    for (const r of rows.filter((x) => archive.includes(x.id))) {
      await logMemoryChange(db, {
        memoryId: r.id,
        action: 'archive',
        userId: r.user_id ?? null,
        persona: r.persona ?? null,
        slotId: r.slot_id ?? null,
        actor: 'system:decay',
        reason: `nightly decay: never recalled, older than ${ageDays}d, importance ${r.importance ?? 'unscored'} ≤ ${plan.importanceMax}`,
        before: snapshot(r),
        source: r.source ?? null,
        log,
      })
    }
  }
  return { scanned: rows.length, archived: archive.length, demoted: demote.length, thresholds: plan }
}
