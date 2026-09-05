// ⭐ SNAPSHOT THE RANKING BEFORE R-C TOUCHES THE MEMORY LAYER — ⛔ READ-ONLY, writes only a results file.
//
//   node test/maintenance/snapshot-search-probes.mjs            → writes test/results/search-probes-snapshot.json
//
// R-C adds a temporal PARTITION to the enumeration and nothing to the ranked read. The denominator check
// (D5) proves that by comparing `search()` for the seven ② probes against this file, taken BEFORE the
// change. ⛔ A "ranking unchanged" assertion with no pre-change reference is the assertion that passes when
// the instrument is broken.
//
// ⚠️ Uses `search()`, never `recall()` — recall reinforces what it returns and would move the very thing
// being snapshotted.
import { writeFileSync } from 'node:fs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryV2 } from '../../Backend/app/components/memory-v2-host.js'

export const PROBES = Object.freeze([
  'what did we talk about today?',
  'what did I tell you yesterday?',
  'what did we discuss on August 26?',
  'what did you learn from me this week?',
  'what do you remember about instruments?',
  'what did we talk about?',
  'what did we talk about in 1847?',
])
export const OTE = '69499bed-ab95-41f9-ac28-e0617b33b09d'
export const SNAPSHOT = new URL('../results/search-probes-snapshot.json', import.meta.url)

export async function probeSearch(mem) {
  const out = {}
  for (const p of PROBES) {
    const r = await mem.search(p, { limit: 8 })
    // ids in RANK ORDER, plus the relevance to 6 places — enough to catch a reordering or a rescoring
    out[p] = r.matches.map((m) => ({ id: m.id, relevance: Number(m.relevance).toFixed(6), score: Number(m.score).toFixed(6) }))
  }
  return out
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const config = loadConfig()
  const db = await initDB(); setDB(db); await initSettings(db)
  db.txn_memories.sequelize.options.logging = false
  const mem = buildMemoryV2({ db, config, log: null }, { userId: OTE })
  const snap = { takenAt: new Date().toISOString(), userId: OTE, probes: await probeSearch(mem) }
  writeFileSync(SNAPSHOT, JSON.stringify(snap, null, 2), 'utf8')
  console.log(`wrote ${SNAPSHOT.pathname} · ${PROBES.length} probes · ${Object.values(snap.probes).reduce((n, a) => n + a.length, 0)} ranked ids`)
  process.exit(0)
}
