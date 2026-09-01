// ⭐⭐⭐ M2.d — THE PER-ROOT EVIDENCE DRY RUN, against real room-scoped evidence.
//
//   node test/pipeline/dreaming-m2d-evidence-dryrun.mjs
//
// ── ⛔⛔ THE SAFETY BOUNDARY ─────────────────────────────────────────────────────────────────────
// **WRITES NOTHING.** ⛔ No commitment · ⛔ no memory · ⛔ no lifecycle change · ⛔ no pass row · ⛔ no
// activation. Read-only against the database; the report goes to stdout and a results file.
//
// ── ⭐⭐ WHERE THE PROBES COME FROM, AND WHY IT MATTERS ─────────────────────────────────────────
// The candidate signals are **her own existing slot labels**. ⇒ **recall-before-remember applied at the
// DISCOVERY stage**: *"do the things I already hold a slot for recur across independent episodes?"*
//   ⭐ the probe comes from the MEMORY LAYER, ⛔ not from whoever wrote this file;
//   ⭐ the candidate space is FINITE and inspectable;
//   ⭐⭐ and it GUARANTEES overlap with existing memory — which is exactly what M2.c could not exercise,
//      because every one of its five proposals landed on a synthetic `dreaming:` slot and came back NEW.
//
// ⚠️ The matcher is crude ON PURPOSE — token overlap, ⛔ no embedding, ⛔ no model. A structural selector
// must be inspectable, and *"why was this turn selected?"* must have a one-word answer.

import { devPg, devSchema } from '../harness.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { probeTermsFor, admitEvidence, DEFAULT_EXCERPT_CHARS, MIN_INDEPENDENT_ROOTS } from '../../Backend/app/components/dreaming-evidence.js'
import { planFor } from '../../Backend/app/components/dreaming-resolver.js'
import { QUANTIFIER, renderProposal } from '../../Backend/app/components/dreaming-proposal.js'

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows

const ROOM = process.argv[2] ?? 'ote'
const [{ id: roomUserId }] = await q(`SELECT id FROM ${S}.mst_users WHERE username = $1`, [ROOM])

// ══ 1 · THE PROBES — her live slots in THIS room ═════════════════════════════════════════════════
const slots = await q(`
  SELECT entity, attribute, value, count(*)::int AS rows
    FROM ${S}.txn_memories
   WHERE user_id = $1 AND invalid_at IS NULL AND expired_at IS NULL AND contradicted_at IS NULL
     AND entity IS NOT NULL AND attribute IS NOT NULL
   GROUP BY 1,2,3 ORDER BY 2`, [roomUserId])

console.log('══ M2.d · PER-ROOT EVIDENCE DRY RUN ═══════════════════════════════════════════')
console.log(`   room=${ROOM}  ·  live slots to probe: ${slots.length}  ·  excerpt=${DEFAULT_EXCERPT_CHARS} chars  ·  min roots=${MIN_INDEPENDENT_ROOTS}`)
console.log('   ⛔ NOTHING IS WRITTEN BY THIS RUN.\n')

const results = []
for (const slot of slots) {
  const terms = probeTermsFor(slot.attribute)
  if (!terms.length) continue

  // ── 2 · STRUCTURAL SELECTION — user turns in THIS room, admissible, matching a probe term ──────
  // ⛔ `evidentialSql`'s clause, spelled by the shared predicate's own words.
  const rows = await q(`
    SELECT m.id::text AS message_id, m.conversation_id::text AS conversation_id, m.created_at,
           m.content, c.user_id::text AS room
      FROM ${S}.txn_messages m
      JOIN ${S}.txn_conversations c ON c.id = m.conversation_id
     WHERE c.user_id = $1 AND m.role = 'user'
       AND c.incognito = false AND c.excluded_from_evidence_at IS NULL
       AND m.content ~* $2
     ORDER BY m.created_at`, [roomUserId, `\\m(${terms.join('|')})\\M`])

  const evidence = admitEvidence({ rows, room: roomUserId })
  if (!evidence.ok) { results.push({ slot, terms, evidence, admitted: false }); continue }

  // ── 3 · THE PROPOSAL — the closest existing form ───────────────────────────────────────────────
  const label = String(slot.attribute).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const proposal = {
    form: 'recurrence',
    quantifier: QUANTIFIER.existential,
    // ⭐⭐⭐ `independent_roots` IS FILLED BY THE SYSTEM, from `admitEvidence`. The model never sees a total.
    slots: { act: label, independent_roots: evidence.roots, of: evidence.totalTurns },
  }

  // ── 4 · RECALL AGAINST THE **EXISTING** SLOT — ⭐ this is what M2.c could not do ────────────────
  const matches = await q(`
    SELECT id::text, entity, attribute, value, content, created_at
      FROM ${S}.txn_memories
     WHERE user_id = $1 AND entity = $2 AND attribute = $3
       AND invalid_at IS NULL AND expired_at IS NULL AND contradicted_at IS NULL
     ORDER BY created_at DESC`, [roomUserId, slot.entity, slot.attribute])

  const outcome = planFor({ proposal, matches, destination: 'room' })
  results.push({ slot, terms, evidence, admitted: true, proposal, matches: matches.length, outcome })
}

// ══ 5 · REPORT ═══════════════════════════════════════════════════════════════════════════════════
const admitted = results.filter((r) => r.admitted)
const refused = results.filter((r) => !r.admitted)

for (const r of admitted) {
  console.log(`── ${r.slot.entity} / ${r.slot.attribute} ─────────────────────────────────────`)
  console.log(`   probe terms   ${r.terms.join(', ')}`)
  console.log(`   EVIDENCE      ${r.evidence.roots} independent roots · ${r.evidence.totalTurns} turns`)
  for (const b of r.evidence.buckets) {
    console.log(`     root ${b.root.slice(0, 8)}  ${b.turns.length} turn(s)  first="${b.turns[0].excerpt.slice(0, 58).replace(/\s+/g, ' ')}…"`)
  }
  console.log(`   PROPOSAL      ${JSON.stringify(r.proposal.slots)}`)
  console.log(`   RENDERED      ${renderProposal(r.proposal)}`)
  // ⚠️ THE SEMANTIC FIT, REPORTED RATHER THAN GLOSSED. `recurrence` renders "…of my own acts", and this
  // evidence is the OTHER PARTY'S turns. The grammar was built for T0 (her acts); the evidence is T2.
  console.log(`   ⚠️ SEMANTIC FIT  MISMATCH — the form says "my own acts"; this evidence is the other party's turns`)
  console.log(`   RECALLED      ${r.matches} live row(s) at ${r.slot.entity}/${r.slot.attribute}`)
  if (r.outcome.ok) {
    console.log(`   PLAN          ${r.outcome.plan.action.toUpperCase()} (wire: ${r.outcome.wire})`)
    console.log(`   WHY           ${r.outcome.why}`)
    console.log(`   effects       write=${r.outcome.plan.write} reinforce=${r.outcome.plan.reinforce} supersedes=${r.outcome.plan.supersedes ?? '-'} collapse=[${r.outcome.plan.collapse.join(',')}]`)
    if (r.outcome.recalled.primary) console.log(`   compared vs   ${r.outcome.recalled.primary.comparedField}="${String(r.outcome.recalled.primary.comparedValue).slice(0, 60)}"`)
  } else {
    console.log(`   ⛔ REFUSED at ${r.outcome.stage}: ${r.outcome.why}`)
  }
  console.log('')
}

console.log('══ SUMMARY ════════════════════════════════════════════════════════════════════')
console.log(`   slots probed        ${results.length}`)
console.log(`   admitted (≥${MIN_INDEPENDENT_ROOTS} roots)  ${admitted.length}`)
console.log(`   refused (<${MIN_INDEPENDENT_ROOTS} roots)   ${refused.length}   ⭐ one occasion is Reflection's territory`)
const plans = {}
for (const r of admitted) {
  const k = r.outcome.ok ? r.outcome.plan.action : `refused-${r.outcome.stage}`
  plans[k] = (plans[k] ?? 0) + 1
}
for (const [k, v] of Object.entries(plans).sort()) console.log(`   plan ${k.padEnd(14)} ${v}`)

try {
  mkdirSync(new URL('../results/', import.meta.url), { recursive: true })
  writeFileSync(new URL('../results/dreaming-m2d-evidence.json', import.meta.url),
    JSON.stringify({ ranAt: new Date().toISOString(), room: ROOM, results }, null, 2))
  console.log('\n   full detail → test/results/dreaming-m2d-evidence.json')
} catch (e) { console.log(`\n   ⚠️ results file not written: ${e.message}`) }

await pg.end()
