// ⭐⭐ M1-F · *WOULD DREAMING HAVE ANYTHING TO SAY?* — asked as a measurement.
//
//   node test/pipeline/dreaming-candidates.mjs           the summary
//   node test/pipeline/dreaming-candidates.mjs --full    every slot
//   node test/pipeline/dreaming-candidates.mjs --json     machine-readable
//   node test/pipeline/dreaming-candidates.mjs --save     also write test/results/…json
//
// ── ⛔ THE BOUNDARY ──────────────────────────────────────────────────────────────────────────────
//   ✅ read-only, through the evidence predicate evaluated at READ time
//   ⛔ persists NOTHING — no memory, no commitment, no proposal, ⛔ not even a pass row
//   ⛔ no model call · ⛔ no embedder call · ⛔ no proposition form (M2-7 is unresolved)
//   ⛔ no sentence anybody said leaves the module — `dreaming-m1f-check` walks the tree and proves it
//
// ── ⭐ WHAT IT IS FOR ────────────────────────────────────────────────────────────────────────────
// The contract's §13.1 has carried an ESTIMATE through the whole arc — *"5 substantive repeats;
// recurrence is not establishable"* — and every design decision downstream has leaned on it. This
// turns the estimate into a number, without letting Dreaming act.
//
// ⚠️ TWO SELECTORS ARE REPORTED, ALWAYS. `all-terms` is the strict reading of a multi-word slot label,
// `any-term` the loose one. ⛔ Quoting one number would hide how much of the answer is the selector
// rather than the corpus.

import { writeFileSync, mkdirSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'
import { measureCandidates } from '../../Backend/app/components/dreaming-candidate-host.js'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const pg = devPg(); await pg.connect()
const query = async (sql, params) => pg.query(sql, params)

try {
  const r = await measureCandidates({ query, schema: devSchema() })

  if (has('--json')) {
    console.log(JSON.stringify(r, null, 2))
  } else {
    const s = r.summary
    console.log('\n── M1-F · CANDIDATE COUNTING ───────────────────────────')
    console.log(`  slots (live, with a label)   ${s.slotsTotal}`)
    console.log(`  probed                       ${s.slotsProbed}`)
    console.log(`  ⛔ unprobeable (no term)     ${s.slotsUnprobeable}   — counted separately, NEVER as zeros`)
    console.log(`  ⚠️ truncated reads           ${s.truncatedSlots} slot(s) hit the ${r.maxTurnsPerSlot}-turn cap`)
    console.log(`\n  clearing the O-2 floor of ${r.minRoots} independent roots:`)
    console.log(`    all-terms (strict)         ${s.clearsFloorAll} of ${s.slotsProbed}`)
    console.log(`    any-term  (loose)          ${s.clearsFloorAny} of ${s.slotsProbed}`)

    // ⭐ THE ROLE SPLIT IS THE PART THAT MATTERS FOR O-2. Roots resting only on HER OWN sentences are
    // one voice echoing, not a recurrence — reported, ⛔ never filtered, because self-consumption (§9.4)
    // is still an open question and a filter would answer it silently.
    const probed = r.slots.filter((x) => x.probed)
    const strictHits = probed.filter((x) => x.all.clearsFloor)
    const userBorne = strictHits.filter((x) => (x.all.rooms[0]?.userTurns ?? 0) > 0)
    console.log(`\n  of the ${strictHits.length} strict hits, ${userBorne.length} rest on at least one USER turn`)
    console.log(`  ⛔ the rest rest only on her own sentences — one voice echoing is not a recurrence`)

    if (has('--full')) {
      console.log('\n  slot                                      terms  all→roots  any→roots  rooms')
      console.log('  ────────────────────────────────────────  ─────  ─────────  ─────────  ─────')
      for (const x of r.slots) {
        const label = x.attribute.length > 40 ? `${x.attribute.slice(0, 37)}...` : x.attribute
        if (!x.probed) { console.log(`  ${label.padEnd(40)}      —  (no usable probe term)`); continue }
        console.log(`  ${label.padEnd(40)}  ${String(x.terms.length).padStart(5)}`
          + `  ${String(x.all.maxRoots).padStart(9)}  ${String(x.any.maxRoots).padStart(9)}`
          + `  ${String(x.any.rooms.length).padStart(5)}`)
      }
    }
    console.log('\n  ⛔ counts only. Nothing was written, nothing was proposed, nothing was cited.\n')
  }

  if (has('--save')) {
    const dir = new URL('../results/', import.meta.url)
    mkdirSync(dir, { recursive: true })
    const path = new URL(`dreaming-candidates-${new Date().toISOString().slice(0, 10)}.json`, dir)
    writeFileSync(path, JSON.stringify({ measuredAt: new Date().toISOString(), ...r }, null, 2))
    console.log(`  saved → ${path.pathname.split('/').slice(-2).join('/')}\n`)
  }
} catch (e) {
  console.error(`\n⛔ ${e?.stack ?? e}\n`)
  process.exitCode = 1
} finally {
  await pg.end()
}
