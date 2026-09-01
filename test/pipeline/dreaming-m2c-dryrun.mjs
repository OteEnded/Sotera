// ⭐⭐⭐ M2.c — THE PLAN-ONLY DRY RUN, against the real corpus.
//
//   node test/pipeline/dreaming-m2c-dryrun.mjs
//
// ── ⛔⛔ THE SAFETY BOUNDARY ─────────────────────────────────────────────────────────────────────
// **THIS WRITES NOTHING AT ALL.** ⛔ No commitment · ⛔ no memory · ⛔ no lifecycle change · and ⛔ not
// even a pass-ledger row: M1's ledger constrains `outcome` to 6a–6e, and a plan-only run's honest
// conclusion is **6f**, which would need a schema change nobody has authorized. ⇒ ⭐ the run reports to
// stdout and a results file, and touches the database **read-only**.
//
// ── ⚠️ NO MODEL IS USED, AND THAT IS DELIBERATE ────────────────────────────────────────────────
// The proposals below are derived DETERMINISTICALLY from T0 aggregates. ⭐ The question M2.c exists to
// answer is *"does the existing memory architecture make the decisions we want?"* — ⛔ not *"is the model
// good at selecting forms?"*. A model would add variance to the half that is not under test, and the
// slot-filling it would do is exactly what these aggregates already do, without the variance.
// ⓘ Stated rather than quietly skipped: **M2.c does not exercise form selection.**

import { devPg, devSchema } from '../harness.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { QUANTIFIER, renderProposal } from '../../Backend/app/components/dreaming-proposal.js'
import { planFor, slotAddressFor, valueOf } from '../../Backend/app/components/dreaming-resolver.js'

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows

// ══ 1 · T0 AGGREGATES — act ledger only, ⛔ no free-text column is read ═══════════════════════════
const [agg] = await q(`
  SELECT count(*)::int                                                          AS acts,
         count(*) FILTER (WHERE outcome = 'completed')::int                     AS completed,
         count(*) FILTER (WHERE outcome = 'completed' AND wrote_memory_id IS NULL)::int AS no_product,
         count(*) FILTER (WHERE outcome = 'completed' AND wrote_memory_id IS NOT NULL)::int AS product,
         count(DISTINCT conversation_id)::int                                   AS root_contexts,
         count(*) FILTER (WHERE coalesce(array_length(tools_used,1),0) > 0)::int AS tool_used
    FROM ${S}.log_conversation_revisits`)

const [perCtx] = await q(`
  WITH c AS (SELECT conversation_id, count(*)::int n FROM ${S}.log_conversation_revisits GROUP BY 1)
  SELECT max(n)::int AS max_n, percentile_disc(0.5) WITHIN GROUP (ORDER BY n)::int AS median_n FROM c`)

const [gap] = await q(`
  WITH t AS (SELECT created_at, lag(created_at) OVER (ORDER BY created_at) prev
               FROM ${S}.log_conversation_revisits)
  SELECT extract(day FROM (created_at - prev))::int AS days FROM t WHERE prev IS NOT NULL
   ORDER BY created_at DESC LIMIT 1`)

const [co] = await q(`
  SELECT count(*) FILTER (WHERE t AND p)::int AS both,
         count(*) FILTER (WHERE t AND NOT p)::int AS a_only,
         count(*) FILTER (WHERE NOT t AND p)::int AS b_only
    FROM (SELECT coalesce(array_length(tools_used,1),0) > 0 AS t, wrote_memory_id IS NOT NULL AS p
            FROM ${S}.log_conversation_revisits WHERE outcome = 'completed') x`)

// ══ 2 · THE PROPOSALS — ⭐ derived, not generated ═════════════════════════════════════════════════
const E = QUANTIFIER.existential
const PROPOSALS = [
  { form: 'frequency', quantifier: E, slots: { act: 'completed-without-product', n: agg.no_product, of: agg.completed } },
  { form: 'extent', quantifier: E, slots: { act: 'reflection', distinct_contexts: agg.root_contexts, max: perCtx.max_n, median: perCtx.median_n } },
  { form: 'recurrence', quantifier: E, slots: { act: 'completed-without-product', independent_roots: agg.root_contexts, of: agg.completed } },
  { form: 'co_occurrence', quantifier: E, slots: { a: 'tool-used', b: 'product-written', both: co.both, a_only: co.a_only, b_only: co.b_only } },
  { form: 'interval', quantifier: E, slots: { act: 'reflection', gap_days: gap?.days ?? 0 } },
]

// ══ 3 · RECALL → RESOLVE → PLAN, for each, at BOTH destinations ══════════════════════════════════
const results = []
for (const proposal of PROPOSALS) {
  const addr = slotAddressFor(proposal)
  // ⭐ THE RECALL. Live, non-contradicted rows at this slot address, newest-first — the same shape the
  // conflict stage expects.
  const matches = await q(
    `SELECT id::text, entity, attribute, value, content, created_at
       FROM ${S}.txn_memories
      WHERE entity = $1 AND attribute = $2 AND invalid_at IS NULL AND expired_at IS NULL AND contradicted_at IS NULL
      ORDER BY created_at DESC`, [addr.entity, addr.attribute])

  // ⚠️⚠️ AND THE NEIGHBOURHOOD, because a wall of NEW would tell Ote nothing. If every plan is NEW only
  // because the slot ADDRESS is novel, that is a fact about the dry-run convention, ⛔ not about the
  // architecture. So: what else does she already hold about herself?
  const nearby = await q(
    `SELECT id::text, entity, attribute, left(coalesce(value, content), 90) AS gist, scope, author
       FROM ${S}.txn_memories
      WHERE entity = $1 AND invalid_at IS NULL AND expired_at IS NULL
      ORDER BY created_at DESC LIMIT 5`, [addr.entity])

  for (const destination of ['room', 'persona_global']) {
    results.push({ proposal, addr, destination, matches, nearby, outcome: planFor({ proposal, matches, destination }) })
  }
}

// ══ 4 · REPORT — ⭐ enough context to judge whether each plan makes SEMANTIC sense ════════════════
console.log('══ M2.c · PLAN-ONLY DRY RUN ═══════════════════════════════════════════════════')
console.log(`   corpus: ${agg.acts} acts · ${agg.completed} completed · ${agg.no_product} without product`)
console.log(`           ${agg.root_contexts} root contexts · ${agg.tool_used} used a tool`)
console.log('   ⛔ NOTHING IS WRITTEN BY THIS RUN — not a commitment, not a memory, not a pass row.\n')

for (const r of results) {
  const { proposal, addr, destination, matches, nearby, outcome } = r
  console.log(`── ${proposal.form}  →  ${destination} ─────────────────────────────────────────`)
  console.log(`   OBSERVATION   ${JSON.stringify(proposal.slots)}`)
  console.log(`   quantifier    ${proposal.quantifier}`)
  console.log(`   RENDERED      ${renderProposal(proposal) ?? '(does not render)'}`)
  console.log(`   SLOT          ${addr.entity} / ${addr.attribute}   ⚠️ dry-run convention, not a ruling`)
  console.log(`   RECALLED      ${matches.length} live row(s) at this slot`)
  if (outcome.ok) {
    console.log(`   PLAN          ${outcome.plan.action.toUpperCase()}  (wire: ${outcome.wire})`)
    console.log(`   WHY           ${outcome.why}`)
    console.log(`   write=${outcome.plan.write} reinforce=${outcome.plan.reinforce} supersedes=${outcome.plan.supersedes ?? '-'} collapse=[${outcome.plan.collapse.join(',')}]`)
    if (outcome.recalled.primary) {
      console.log(`   compared      against ${outcome.recalled.primary.comparedField}="${outcome.recalled.primary.comparedValue}"`)
    }
    console.log(`   publication   ${outcome.publication}`)
  } else {
    console.log(`   ⛔ REFUSED at the ${outcome.stage.toUpperCase()} stage`)
    console.log(`   WHY           ${outcome.why}`)
  }
  if (destination === 'room') {
    console.log(`   nearby        ${nearby.length ? nearby.map((n) => `${n.id.slice(0, 8)}[${n.attribute ?? 'prose'}] ${n.gist ?? ''}`.trim()).join('\n                 ') : '(nothing else about this entity)'}`)
  }
  console.log('')
}

// ══ 5 · SUMMARY ══════════════════════════════════════════════════════════════════════════════════
const byStage = {}
for (const r of results) {
  const key = r.outcome.ok ? `${r.destination}:${r.outcome.plan.action}` : `${r.destination}:refused-${r.outcome.stage}`
  byStage[key] = (byStage[key] ?? 0) + 1
}
console.log('══ SUMMARY ════════════════════════════════════════════════════════════════════')
for (const [k, v] of Object.entries(byStage).sort()) console.log(`   ${k.padEnd(34)} ${v}`)

try {
  mkdirSync(new URL('../results/', import.meta.url), { recursive: true })
  const out = new URL('../results/dreaming-m2c-dryrun.json', import.meta.url)
  writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), corpus: agg, results }, null, 2))
  console.log(`\n   full detail → test/results/dreaming-m2c-dryrun.json`)
} catch (e) { console.log(`\n   ⚠️ could not write the results file: ${e.message}`) }

await pg.end()
