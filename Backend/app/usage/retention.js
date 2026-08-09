// Usage log retention — prunes usage_logs rows past the configured age, optionally
// dumping them to COLD STORAGE first so nothing is lost, just moved off the hot table.
//
// Settings (root-editable in the console; config.json `usage.*` = defaults):
//   usage.retentionDays          0 = keep forever (job no-ops)
//   usage.coldStorage.enabled    dump expiring rows before deleting (default true)
//   usage.coldStorage.directory  where dumps land, relative to Backend/ (default ./cold-storage/usage)
//
// Cold format: gzipped NDJSON, one file per calendar month of the rows' created_at
// (usage-YYYY-MM.ndjson.gz). Each run APPENDS a new gzip member — concatenated gzip
// members are a valid gzip stream, so plain gunzip/zcat reads the whole file.
// Query them with DevTools/maintenance/usage-cold-query.mjs (filters + stats) or any NDJSON tool.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { Op } from 'sequelize'
import { getSetting } from '../settings/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(__dirname, '..', '..')

const BATCH = 2000

export function coldStorageDir(config) {
  const dir = String(getSetting(config, 'usage.coldStorage.directory') || './cold-storage/usage')
  return path.isAbsolute(dir) ? dir : path.resolve(BACKEND_ROOT, dir)
}

// Embeddings-cache hygiene: rows not hit for this long get pruned by the same daily
// pass. Independent of usage.retentionDays (the cache is a cache, not a log).
const EMBED_CACHE_IDLE_DAYS = 30

export async function pruneEmbeddingCache({ db }) {
  try {
    if (!db?.txn_embedding_cache) return { pruned: 0 }
    const cutoff = new Date(Date.now() - EMBED_CACHE_IDLE_DAYS * 86400000)
    const pruned = await db.txn_embedding_cache.destroy({ where: { last_used_at: { [Op.lt]: cutoff } } })
    return { pruned }
  } catch (e) {
    return { pruned: 0, error: e?.message || String(e) }
  }
}

// Debug-log retention (logs.retentionDays): prunes log_requests + log_messages past the
// configured age. NO cold storage — these are debug logs, not billing/audit records
// (usage_logs and key_reveal_logs are untouched here, by design). Never throws.
export async function runLogRetention({ db, config }) {
  try {
    const days = getSetting(config, 'logs.retentionDays')
    if (!days || days <= 0) return { skipped: true, reason: 'log retention disabled (logs.retentionDays = 0)' }
    const cutoff = new Date(Date.now() - days * 86400000)
    // NOTE the columns: these tables predate the platform conventions (timestamps: false) —
    // log_requests stamps `request_at`, log_messages stamps `report_on`
    const requests = await db.log_requests.destroy({ where: { request_at: { [Op.lt]: cutoff } } })
    const messages = await db.log_messages.destroy({ where: { report_on: { [Op.lt]: cutoff } } })
    // MEMORY AUDIT gets its OWN, much longer window — deliberately NOT logs.retentionDays.
    //
    // ⚠️ Pruning this on the debug-log schedule would defeat the table's entire purpose. It exists to answer
    // "where did my fact go?", and the loss that created it went unnoticed for TWO DAYS; at a 30-day window
    // any belief lost 31 days ago becomes unexplainable again — exactly the state this was built to end.
    // The rows are also tiny and rare (only belief-REMOVING transitions, never ordinary captures), so the
    // storage pressure that justifies aggressive request-log pruning simply is not there. 0 = keep forever.
    let memoryAudit = 0
    let memDays = 0
    try { memDays = getSetting(config, 'memory.auditRetentionDays') } catch { memDays = 0 }
    if (db.log_memory_changes && memDays > 0) {
      memoryAudit = await db.log_memory_changes.destroy({
        where: { created_at: { [Op.lt]: new Date(Date.now() - memDays * 86400000) } },
      })
    }
    return { days, requests, messages, memoryAudit, memoryAuditDays: memDays }
  } catch (e) {
    return { error: e?.message || String(e) }
  }
}

// One retention pass. Returns a summary; never throws (callers log the result).
export async function runUsageRetention({ db, config }) {
  try {
    const days = getSetting(config, 'usage.retentionDays')
    if (!days || days <= 0) return { skipped: true, reason: 'retention disabled (usage.retentionDays = 0)' }

    const cold = Boolean(getSetting(config, 'usage.coldStorage.enabled'))
    const cutoff = new Date(Date.now() - days * 86400000)
    const dir = coldStorageDir(config)
    let dumped = 0
    let deleted = 0
    const files = new Set()

    for (;;) {
      const rows = await db.log_usage.findAll({
        where: { created_at: { [Op.lt]: cutoff } },
        order: [['rolling_id', 'ASC']],
        limit: BATCH,
        raw: true,
      })
      if (!rows.length) break

      if (cold) {
        fs.mkdirSync(dir, { recursive: true })
        // group by the row's month so files stay time-partitioned
        const byMonth = new Map()
        for (const row of rows) {
          const d = new Date(row.created_at)
          const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          if (!byMonth.has(month)) byMonth.set(month, [])
          byMonth.get(month).push(JSON.stringify(row))
        }
        for (const [month, lines] of byMonth) {
          const file = path.join(dir, `usage-${month}.ndjson.gz`)
          fs.appendFileSync(file, zlib.gzipSync(lines.join('\n') + '\n'))
          files.add(path.basename(file))
          dumped += lines.length
        }
      }

      deleted += await db.log_usage.destroy({ where: { id: rows.map((r) => r.id) } })
      if (rows.length < BATCH) break
    }

    return { retentionDays: days, cutoff: cutoff.toISOString(), coldStorage: cold, dumped, deleted, files: [...files], directory: dir }
  } catch (e) {
    return { error: e?.message || String(e) }
  }
}

// List existing cold storage dump files (console surface).
export function listColdFiles(config) {
  const dir = coldStorageDir(config)
  let entries = []
  try {
    entries = fs.readdirSync(dir).filter((f) => f.endsWith('.ndjson.gz'))
  } catch { /* directory doesn't exist yet = no dumps */ }
  return {
    directory: dir,
    files: entries.sort().map((name) => {
      const st = fs.statSync(path.join(dir, name))
      return { name, bytes: st.size, modifiedAt: st.mtime.toISOString() }
    }),
  }
}
