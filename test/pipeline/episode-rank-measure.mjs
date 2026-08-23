// ⭐⭐⭐ D2 · MEASURE EPISODE RANKING BEFORE CHANGING IT — offline, clean corpus, ⛔ production untouched.
//
//   node pipeline/episode-rank-measure.mjs
//
// ── ⚠️ THE DEFECT UNDER TEST (D2) ─────────────────────────────────────────────────────────────────
// `activateEpisodes` ranks conversations by `score = (withThem ? 100 : 0) + ep.matches + recency`, where
// `ep.matches` is a COUNT OF CANDIDATES. So four weakly-matching messages beat one exact match, and only the
// top `LIMITS.episodes` (5) survive to the relevance floor. Measured for *"…herb notebook?"*: the two
// conversations that actually hold the notebook rank 6th and 7th, beaten by one with 4 weak matches and 0
// on-subject.
//
// ⭐ Ote: *"then move to D2 measurement using the retriever's existing per-candidate score. Again, measure
// before deciding on the fix."*
//
// ── ⛔⛔ AND THE ARITHMETIC HAS TO BE STATED BEFORE ANY OF THIS IS READ ─────────────────────────────
// In hybrid mode the per-candidate `score` is an **RRF score**: `rrfFuse` accumulates `1/(60 + rank + 1)`.
// ⇒ a rank-1 hit scores ~0.0164 per list and a rank-40 hit ~0.0100 — the whole pool lives inside a ~2×
// band under 0.033, while `recency` ranges 0…1. ⭐ **So `bestScore + recency` is a RECENCY SORT with a
// rounding error attached**, and "just use the retriever's score" — my own proposal — is arithmetically
// incoherent as written. That is what this file measures rather than assumes.
//
// ⓘ It changes nothing. It simulates candidate scoring functions over the REAL discovery pool and reports
// where the conversation that actually holds the answer would land under each.

import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { formCues } from '../../Backend/app/components/memory-cognition-cues.js'
import { buildConversationSearch } from '../../Backend/app/components/conversation-search.js'
import { makeEmbedder } from '../../Backend/app/components/memory-embed-host.js'

const config = loadConfig()
const TOP = 5   // LIMITS.episodes — what survives to the floor
const POOL = 40 // LIMITS.episodeCandidates

// ⭐ Declared subject per case, by hand. ⛔ Never inferred from what came back.
const CASES = [
  { key: 'basil-bare', ask: 'basil', on: /basil|rosemary|mint/i },
  { key: 'basil-sentence', ask: 'Has anyone ever talked to you about growing basil?', on: /basil|rosemary|mint/i },
  { key: 'notebook', ask: 'Do you remember anything about a herb notebook?', on: /notebook/i },
  { key: 'herb-promise', ask: 'What did you promise about the herbs?', on: /basil|rosemary|mint|herb/i },
  { key: 'hermes ⭐control', ask: "How's Hermes doing? What have you and he actually talked about?", on: /hermes/i },
  { key: 'kavi ⭐control', ask: "How's Kavi? What have you and Kavi actually talked about?", on: /kavi/i },
  { key: 'mina ⭐control', ask: 'What do you know about Mina?', on: /mina/i },
]

// ══ THE CANDIDATE SCORING FUNCTIONS · production first, then the alternatives ══════════════════════
//
// ⓘ `withThem` is omitted from all of them: it is +100 and decides the person cases outright, so including
// it would hide every difference behind it. ⚠️ Which also means these numbers describe the TOPIC path — the
// person path is dominated by `withThem` and is measured here only as a regression check.
const SCORERS = {
  'production  matches+rec': (e) => e.matches + e.rec,
  'naive       best+rec': (e) => e.best + e.rec,
  'rank-norm   (1-r/n)+rec': (e, n) => (1 - e.bestRank / Math.max(1, n)) + e.rec,
  'top-hit     tophit+m+rec': (e) => (e.bestRank === 0 ? 2 : 0) + e.matches + e.rec,
  'matches×norm m*(1-r/n)+rec': (e, n) => e.matches * (1 - e.bestRank / Math.max(1, n)) + e.rec,
}

const pg = devPg(); await pg.connect()
const S = devSchema()
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config, log: null }
const { rows: [me] } = await pg.query(`select id::text id from ${S}.mst_users where username='agent_dev'`)
const { rows: [corpus] } = await pg.query(
  `select (select count(*)::int from ${S}.txn_conversations where title like 'RATE %') harness,
          (select count(*)::int from ${S}.txn_conversations) total`)

console.log(`\n${'═'.repeat(112)}`)
console.log('  D2 · EPISODE-RANKING SIMULATION — offline, nothing changed')
console.log(`${'═'.repeat(112)}`)
console.log(`  corpus: ${corpus.harness} harness conversation(s) of ${corpus.total}`
  + `${corpus.harness ? ' ⚠️ CONTAMINATED' : ' ✓ clean'}   ·   top-${TOP} survives to the floor`)
console.log('\n  ⛔ In hybrid mode the candidate score is an RRF score (1/(60+rank+1)), so the whole pool sits')
console.log('     inside a ~2× band under 0.033 while recency spans 0…1. Read "naive" with that in mind.')

const names = Object.keys(SCORERS)
console.log(`\n  ${'case'.padEnd(20)}${'holders'.padEnd(9)}${names.map((n) => n.split(' ')[0].padEnd(12)).join('')}`)
console.log(`  ${''.padEnd(20)}${''.padEnd(9)}${names.map(() => 'rank/top?'.padEnd(12)).join('')}`)

const summary = {}
for (const c of CASES) {
  const cues = formCues(c.ask, { knownNames: [] })
  const cs = buildConversationSearch(fastify, {
    userId: me.id, acrossRooms: true, roles: ['assistant'], embed: makeEmbedder(fastify, { userId: me.id }),
  })
  const raw = await cs.search(cues.raw, { limit: POOL, excludeConversationId: null, denseMinSim: 0 })
  const ev = raw.evidence ?? []
  // ⓘ Group exactly as production does, and additionally keep the BEST candidate rank per conversation —
  // the signal production discards.
  const eps = new Map()
  ev.forEach((e, i) => {
    const cid = e.conversation?.id
    if (!cid) return
    if (!eps.has(cid)) eps.set(cid, { cid, matches: 0, lastAt: null, best: 0, bestRank: i, on: 0 })
    const cur = eps.get(cid)
    cur.matches += 1
    const sc = Number(e.score) || 0
    if (sc > cur.best) { cur.best = sc; cur.bestRank = i }
    if (e.timestamp && (!cur.lastAt || e.timestamp > cur.lastAt)) cur.lastAt = e.timestamp
    if (c.on.test(String(e.excerpt ?? ''))) cur.on += 1
  })
  const all = [...eps.values()].map((e) => ({
    ...e,
    rec: e.lastAt ? Math.max(0, 1 - (Date.now() - new Date(e.lastAt).getTime()) / (30 * 864e5)) : 0.2,
  }))
  const holders = all.filter((e) => e.on > 0)
  const cells = names.map((n) => {
    if (!holders.length) return 'no holder '
    const sorted = [...all].sort((a, b) => SCORERS[n](b, all.length) - SCORERS[n](a, all.length))
    // ⭐ THE BEST rank achieved by ANY holder — the question is whether the answer reaches the floor at all.
    const best = Math.min(...holders.map((h) => sorted.findIndex((x) => x.cid === h.cid) + 1))
    summary[n] = summary[n] ?? { inTop: 0, of: 0 }
    summary[n].of += 1
    if (best <= TOP) summary[n].inTop += 1
    return `${String(best).padStart(2)} ${best <= TOP ? '✓ ' : '⛔'}     `
  })
  console.log(`  ${c.key.padEnd(20)}${String(holders.length).padEnd(9)}${cells.map((x) => x.padEnd(12)).join('')}`)
}

console.log(`\n  ${'scoring function'.padEnd(30)}cases whose answer reaches the top-${TOP}`)
for (const n of names) {
  const s = summary[n]
  if (!s) continue
  const flag = n.startsWith('production') ? '  (today)' : ''
  console.log(`  ${n.padEnd(30)}${s.inTop}/${s.of}${flag}`)
}
console.log('\n  ⛔ MECHANISM ONLY, and a SIMULATION at that: it re-ranks the real discovery pool but does not')
console.log('     run the floor, the window rebuild, or a model. A candidate that wins here still has to be')
console.log('     measured end to end by pipeline/episode-centre-measure.mjs before it is believed.')
await pg.end()
