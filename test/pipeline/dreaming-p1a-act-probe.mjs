// ⭐⭐⭐ P1a · DOES HER REFLECTION EXPERIENCE CONTAIN A RECURRING SIGNAL? — asked as a MEASUREMENT.
//
//   node test/pipeline/dreaming-p1a-act-probe.mjs                 the summary + evidence for floor-clearing slots
//   node test/pipeline/dreaming-p1a-act-probe.mjs --full          every slot, including the zeros
//   node test/pipeline/dreaming-p1a-act-probe.mjs --json          machine-readable
//   node test/pipeline/dreaming-p1a-act-probe.mjs --room ote      a different room (default agent_dev)
//
// ── ⛔ THE BOUNDARY — P1a IS A MEASUREMENT AND NOTHING ELSE ─────────────────────────────────────
//   ✅ read-only, through E3 evaluated at READ time (`e3Sql`, the owner — ⛔ never respelled here)
//   ⛔ NO model call · ⛔ no memory write · ⛔ no retention decision · ⛔ NOT EVEN A PASS LEDGER ROW
//   ⛔ no cron · ⛔ no config · ⛔ no restart · ⛔ no v0 change of any kind
//   ⛔ it proposes nothing, cites nothing, and concludes nothing about truth
//
// ── ⭐⭐ WHAT IS DIFFERENT FROM M1-F, AND IT IS EXACTLY ONE THING ───────────────────────────────
// `dreaming-candidate-host.measureCandidates` probes MESSAGE text. This probes REFLECTION ACT TEXT —
// `log_conversation_revisits.text`, her own words about her own experience. ⭐ Everything else is
// deliberately identical: the same slot source (distinct live `attribute` values), the same
// `probeTermsFor`, the same two selectors, the same O-2 floor, the same root = conversation.
// ⛔ A second spelling of any of those would make the two results incomparable, which is the whole point.
//
// ── ⛔⛔ WHAT A MATCH IS, AND WHAT IT IS NOT ────────────────────────────────────────────────────
// A match is LEXICAL CONTAINMENT of a slot's probe terms in an act's text. ⛔ It is NOT evidence that
// the reflection supports the slot, and nothing here may be read as saying so. That is precisely why
// the excerpts are printed: ⭐ the numbers locate candidates, A HUMAN DECIDES WHAT THEY MEAN.
// ⓘ Same discipline as `dreaming-candidate-selection`'s C0 clause, which refuses to promise that a
// candidate BEARS ON the claim. ⛔ That module is deliberately NOT used here.
//
// ── ⚠️ THE CORPUS IS INSTRUMENT-HETEROGENEOUS, AND THAT IS REPORTED, ⛔ NEVER NORMALISED ────────
// These acts were produced under several prompt generations. A term recurring across generations may be
// recurring in her PROMPT rather than in her EXPERIENCE. ⇒ every slot reports which generations its
// matched roots came from, and a slot confined to one generation is flagged.

import { devPg, devSchema } from '../harness.mjs'
import { probeTermsFor, MIN_INDEPENDENT_ROOTS } from '../../Backend/app/components/dreaming-evidence.js'
import { e3Sql } from '../../Backend/app/components/dreaming-eligibility.js'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d }
const ROOM = val('--room', 'agent_dev')
const asJson = has('--json')

// ⭐ The same cap M1-F uses, and like M1-F it is REPORTED as a bound rather than silently applied.
const MAX_ACTS_PER_SLOT = 200
// ⭐ The same excerpt bound the evidence consumer uses in production.
const EXCERPT_CHARS = 300

const pg = devPg(); await pg.connect()
const schema = devSchema()
const S = `"${schema}"`
const q = async (sql, params = []) => (await pg.query(sql, params)).rows

try {
  // ── ① THE M1 NUMBERS, RECOMPUTED HERE SO THE BOUNDS ARE VISIBLE IN THIS RUN'S OWN OUTPUT ──────
  // ⛔ Not copied from the P0 pass: a bound quoted from another run is not this run's bound.
  const [pop] = await q(
    `SELECT count(*)::int AS m,
            count(*) FILTER (WHERE ${e3Sql('c')})::int AS admitted
       FROM ${S}."log_conversation_revisits" r
       JOIN ${S}."txn_conversations" c ON c.id = r.conversation_id`)
  const withheld = pop.m - pop.admitted

  const [scoped] = await q(
    `SELECT count(*)::int AS acts, count(DISTINCT r.conversation_id)::int AS roots,
            count(*) FILTER (WHERE coalesce(length(r.text),0) > 0)::int AS with_text
       FROM ${S}."log_conversation_revisits" r
       JOIN ${S}."txn_conversations" c ON c.id = r.conversation_id
       JOIN ${S}."mst_users" u ON u.id = r.user_id
      WHERE ${e3Sql('c')} AND u.username = $1`, [ROOM])

  // ── ② THE SLOTS — the memory layer's own labels. ⛔ Not chosen by this file, not by a model. ────
  const slots = await q(
    `SELECT attribute,
            count(*)::int AS memory_rows,
            array_agg(DISTINCT entity) FILTER (WHERE entity IS NOT NULL) AS entities
       FROM ${S}."txn_memories"
      WHERE attribute IS NOT NULL AND attribute <> ''
        AND invalid_at IS NULL AND expired_at IS NULL AND contradicted_at IS NULL
      GROUP BY attribute ORDER BY attribute`)

  // ── ③ PROBE EACH SLOT AGAINST ACT TEXT ────────────────────────────────────────────────────────
  const results = []
  for (const s of slots) {
    const terms = probeTermsFor(s.attribute)
    if (!terms.length) {
      // ⛔ NOT A ZERO — the question was never asked of this slot. M1-F's rule, kept.
      results.push({ attribute: s.attribute, entities: s.entities ?? [], memoryRows: s.memory_rows, terms: [], probed: false })
      continue
    }
    const run = async (mode) => {
      const joiner = mode === 'all' ? ' AND ' : ' OR '
      const clause = terms.map((_, i) => `r.text ILIKE $${i + 2}`).join(joiner)
      // eslint-disable-next-line no-await-in-loop
      const rows = await q(
        `SELECT r.id::text AS act_id, r.rolling_id, r.conversation_id::text AS root,
                r.created_at, r.prompt_generation, r.trigger_source, r.outcome,
                (r.wrote_memory_id IS NOT NULL) AS wrote_memory,
                c.title, left(r.text, ${EXCERPT_CHARS}) AS excerpt, length(r.text) AS text_chars
           FROM ${S}."log_conversation_revisits" r
           JOIN ${S}."txn_conversations" c ON c.id = r.conversation_id
           JOIN ${S}."mst_users" u ON u.id = r.user_id
          WHERE ${e3Sql('c')} AND u.username = $1 AND coalesce(r.text,'') <> '' AND (${clause})
          ORDER BY r.rolling_id
          LIMIT ${MAX_ACTS_PER_SLOT + 1}`,
        [ROOM, ...terms.map((t) => `%${t}%`)])
      const truncated = rows.length > MAX_ACTS_PER_SLOT
      const kept = truncated ? rows.slice(0, MAX_ACTS_PER_SLOT) : rows
      const byRoot = new Map()
      for (const r of kept) { if (!byRoot.has(r.root)) byRoot.set(r.root, []); byRoot.get(r.root).push(r) }
      const gens = [...new Set(kept.map((r) => r.prompt_generation))].sort((a, b) => a - b)
      return {
        acts: kept.length,
        roots: byRoot.size,
        // ⭐ A TRUNCATED READ MAKES THE ROOT COUNT A LOWER BOUND, and says so — M1-F's rule.
        rootsAreLowerBound: truncated,
        truncated,
        clearsFloor: byRoot.size >= MIN_INDEPENDENT_ROOTS,
        generations: gens,
        singleGeneration: gens.length === 1,
        buckets: [...byRoot.entries()].map(([root, acts]) => ({ root, acts })),
      }
    }
    // eslint-disable-next-line no-await-in-loop
    const all = await run('all')
    // eslint-disable-next-line no-await-in-loop
    const any = await run('any')
    results.push({ attribute: s.attribute, entities: s.entities ?? [], memoryRows: s.memory_rows, terms, probed: true, all, any })
  }

  const probed = results.filter((r) => r.probed)
  const strict = probed.filter((r) => r.all.clearsFloor).sort((a, b) => b.all.roots - a.all.roots)
  const loose = probed.filter((r) => r.any.clearsFloor)

  if (asJson) {
    console.log(JSON.stringify({ room: ROOM, population: { M: pop.m, withheld, admitted: pop.admitted }, scoped, results }, null, 2))
  } else {
    console.log('\n══ P1a · SLOT PROBE OVER REFLECTION ACT TEXT ═══════════════════════════')
    console.log('\n  THE BOUNDS — every one of them, in order:')
    console.log(`    M  (eligible act records)      ${pop.m}`)
    console.log(`      withheld by E3               ${withheld}`)
    console.log(`      admitted                     ${pop.admitted}`)
    console.log(`    N_room  (room = ${ROOM})`.padEnd(36) + `${scoped.acts} acts / ${scoped.roots} roots  (${scoped.with_text} with text)`)
    console.log(`    completeness                   BOUNDED  ⛔ never exhaustive — room + probe both narrow`)
    console.log(`    per-slot read cap              ${MAX_ACTS_PER_SLOT} acts   excerpt bound ${EXCERPT_CHARS} chars`)
    console.log(`    O-2 floor                      ${MIN_INDEPENDENT_ROOTS} independent conversation roots`)

    console.log('\n  SLOTS:')
    console.log(`    live slots with a label        ${results.length}`)
    console.log(`    probed                         ${probed.length}`)
    console.log(`    ⛔ unprobeable (no term)       ${results.length - probed.length}   — counted separately, NEVER as zeros`)
    console.log(`    clearing O-2, all-terms        ${strict.length}`)
    console.log(`    clearing O-2, any-term         ${loose.length}`)
    console.log(`    ⚠️ truncated (root count is a lower bound)  ${probed.filter((r) => r.all.truncated || r.any.truncated).length}`)

    if (!strict.length) {
      console.log('\n  ⭐ NO SLOT CLEARS THE O-2 FLOOR OVER ACT TEXT (strict).')
      console.log('     ⛔ That is a FINDING, not a failure: the reflection corpus does not currently')
      console.log('        support an M2 claim under the strict selector.')
      const looseTop = loose.sort((a, b) => b.any.roots - a.any.roots).slice(0, 12)
      if (looseTop.length) {
        console.log('\n  ⚠️ The LOOSE selector does clear it for some slots. ⛔ Reported, not recommended —')
        console.log('     any-term over a multi-word label is mostly a measure of the selector:')
        for (const r of looseTop) {
          console.log(`       ${String(r.any.roots).padStart(3)} roots  ${String(r.any.acts).padStart(3)} acts  `
            + `gen[${r.any.generations.join(',')}]  ${r.attribute}   terms(${r.terms.join(' ')})`)
        }
      }
    } else {
      console.log('\n  ── SLOTS CLEARING O-2 (all-terms, strict) ──────────────────────────')
      for (const r of strict) {
        console.log(`\n  ▸ ${r.attribute}`)
        console.log(`      entities        ${(r.entities ?? []).join(' · ') || '(none)'}`)
        console.log(`      probe terms     ${r.terms.join(' ')}`)
        console.log(`      memory rows     ${r.memoryRows}`)
        console.log(`      acts / roots    ${r.all.acts} / ${r.all.roots}${r.all.rootsAreLowerBound ? '  ⚠️ LOWER BOUND (read cap hit)' : ''}`)
        console.log(`      generations     [${r.all.generations.join(', ')}]`
          + (r.all.singleGeneration ? '  ⚠️ ONE GENERATION — may be prompt repetition, not experience' : ''))
        console.log('      ── matched reflection excerpts, by root ──')
        for (const b of r.all.buckets) {
          const head = b.acts[0]
          console.log(`        [${b.root.slice(0, 8)}] "${head.title ?? 'untitled'}"  `
            + `#${head.rolling_id} gen${head.prompt_generation} ${String(head.created_at).slice(0, 10)}`
            + `${b.acts.length > 1 ? `  (+${b.acts.length - 1} more act(s) in THIS SAME ROOT ⇒ still ONE root)` : ''}`)
          for (const a of b.acts) {
            console.log(`            ${a.excerpt.replace(/\s+/g, ' ').slice(0, 260)}${a.text_chars > 260 ? '…' : ''}`)
          }
        }
      }
    }
    console.log('\n  ⛔ A MATCH IS LEXICAL CONTAINMENT. It is NOT evidence that the reflection supports the')
    console.log('     slot. Nothing was written, nothing proposed, nothing cited, no model was called.\n')
  }
} catch (e) {
  console.error(`\n⛔ ${e?.stack ?? e}\n`)
  process.exitCode = 1
} finally {
  await pg.end()
}
