// ⭐⭐⭐ Ⓒ — MEMORY PRESERVES BOTH, ON THE REAL CORPUS (Ote's ruling, 2026-09-18).
//
//   node test/checks/recall-preserves-both-check.mjs
//
// ── THE INVARIANT ──────────────────────────────────────────────────────────────────────────────────
//
//     eligible A + eligible B  →  no established "A carries B's information"  →  B REMAINS ELIGIBLE
//
// ⭐ The package test (`value-suppression-off.test.mjs`) pins this on constructed rows with a fake store.
// ⭐⭐ THIS one pins it on THE ACTUAL LIVE PAIR that was being suppressed in production:
//
//     user | timezone | "Bangkok"   imp 1   ⛔ was SUPPRESSED
//     user | location | "Bangkok"   imp 7   ✅ was kept
//
// ⛔⛔ ZERO DB WRITES, AND THE MECHANISM IS DELIBERATE: `search()` does not reinforce, and `query: null`
// skips `embed()` entirely — so no usage row, no embedding-cache row, no `access_count` bump. Every stage
// it does run (findVisible → rankMemories → slice) is a pure read.
// ⚠️ It therefore exercises the NO-QUERY branch. The query branch is pinned by the package test.
import { makeChecker, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryV2 } from '../../Backend/app/components/memory-v2-host.js'
import { sameValueMeaning } from '@ote/memory/cognition/memory-rank.js'
import { noteRetrieved, traceFor, clearTrace } from '../../Backend/app/components/memory-retrieval-trace.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'
import { projectAdmissionFacts } from '../../Backend/app/components/memory-admission-read.js'

const { check, done } = makeChecker()
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const seq = db.txn_memories.sequelize
const schema = devSchema()
const Q = (s, r = {}) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })

try {
  // ── the real pair, read straight from the corpus ─────────────────────────────────────────────────
  const pair = await Q(`SELECT id::text, user_id::text, attribute, value, importance
    FROM "${schema}"."txn_memories"
    WHERE entity = 'user' AND attribute IN ('timezone','location') AND value = 'Bangkok'
      AND invalid_at IS NULL AND expired_at IS NULL AND contradicted_at IS NULL AND persona IS NULL`)
  const tz = pair.find((r) => r.attribute === 'timezone')
  const loc = pair.find((r) => r.attribute === 'location')

  check('0 · PRECONDITION — both real rows are live, visible and share the value "Bangkok". ⛔ Without '
    + 'this the check proves nothing', !!tz && !!loc && tz.user_id === loc.user_id,
  `timezone=${tz ? tz.id : 'MISSING'} location=${loc ? loc.id : 'MISSING'}`)
  check('0a · ⭐⭐ AND THE HEURISTIC REALLY WOULD FIRE ON THEM — ⛔ a non-vacuous test needs a live collision',
    !!tz && !!loc && sameValueMeaning(tz.value, loc.value) === true,
    `sameValueMeaning("${tz?.value}","${loc?.value}") = ${tz && loc ? sameValueMeaning(tz.value, loc.value) : 'n/a'}`)

  if (tz && loc) {
    const mem = buildMemoryV2({ db, config, log: null }, { userId: tz.user_id })
    const out = await mem.search(null, { limit: 500 }) // ⛔ no query ⇒ no embed ⇒ no write
    const ids = new Set(out.matches.map((m) => m.id))

    check('1 · ⭐⭐⭐ BOTH OBSERVATIONS SURVIVE A REAL RECALL — ⛔ neither is withheld, because nothing '
      + 'establishes that one carries the other’s information',
    ids.has(tz.id) && ids.has(loc.id),
    `timezone ${ids.has(tz.id) ? 'PRESENT' : '⛔ MISSING'} · location ${ids.has(loc.id) ? 'PRESENT' : '⛔ MISSING'}`)

    // ── ⭐ THE LIMIT IS UNCHANGED — the ruling costs no context ────────────────────────────────────
    const caps = []
    for (const limit of [1, 3, 6]) {
      const r = await mem.search(null, { limit })
      caps.push(`${r.matches.length}/${limit}`)
      check(`2 · ⭐⭐ the cap holds at limit=${limit} — removing suppression changes WHICH row fills a slot, `
        + '⛔ never HOW MANY are returned', r.matches.length <= limit, `returned ${r.matches.length}`)
    }

    // ── ⭐ THE TRACE REFLECTS WHAT WAS ACTUALLY RETURNED ───────────────────────────────────────────
    const key = `zz_trace_probe_${Date.now()}` // ⓘ in-process only — this module is never durable
    noteRetrieved(key, out.matches, { via: 'recall-preserves-both-check' })
    const traced = traceFor(key).map((i) => i.id)
    check('3 · ⭐⭐ `noteRetrieved` REFLECTS THE ACTUAL RETURNED SET — ⭐ and it now includes the row that '
      + 'was previously hidden, so "what could this synthesis have rested on?" is answerable about it',
    traced.length === out.matches.length && traced.includes(tz.id),
    `traced ${traced.length} of ${out.matches.length}; timezone traced = ${traced.includes(tz.id)}`)
    clearTrace(key)

    // ── ⭐ ADMISSION IS UNTOUCHED AND STILL SCOPED TO THE RETURNED IDS ────────────────────
    // ⚠️⛔ DELIBERATELY NOT `mem.recall()` — recall() REINFORCES (access_count / last_access / tier), which
    // would mutate Ote's real rows from a test. ⭐ The projection is assembled from the same two pieces the
    // host wires together, over the ids `search(null)` actually returned. ⇒ same contract, ZERO WRITES.
    const returnedIds = out.matches.map((m) => m.id)
    const store = createSequelizeMemoryStore({ db, persona: null, userId: tz.user_id })
    const adm = projectAdmissionFacts(await store.admissionFactsFor(returnedIds), returnedIds)
    check('4 · ⭐⭐ THE ADMISSION PROJECTION IS UNTOUCHED — still present, still pairwise, ⛔ and this '
      + 'ruling changed nothing about it', !!adm && Array.isArray(adm.recorded)
      && typeof adm.evaluatedPairs === 'number' && typeof adm.byOutcome === 'object',
    `keys=${Object.keys(adm ?? {}).join(',')}`)
    check('4a · ⭐⭐ …and it reports ONLY pairs whose BOTH sides are in the returned set',
      (adm?.recorded ?? []).every((f) => returnedIds.includes(f.incomingId)
        && returnedIds.includes(f.incumbentId)),
      `${adm?.evaluatedPairs ?? 0} pair(s) over ${returnedIds.length} returned rows`)
    check('4b · ⛔ …and the projection still asserts nothing about compatibility or currency',
      !/compatib|conflict|contradict|current|merge/i.test(JSON.stringify(adm ?? {})),
      Object.keys(adm ?? {}).join(','))

    console.log(`\nⓘ caps observed: ${caps.join(' · ')} · returned ${out.matches.length} rows at limit 500`)
  }
} finally {
  await seq.close()
  done()
}
