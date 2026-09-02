// ⭐⭐⭐ P1 · THE GEN-2 POPULATION READER — ⛔ READ-ONLY. It writes nothing, changes nothing, calls no model.
//
//   node test/pipeline/p1-gen2-population.mjs            the distribution
//   node test/pipeline/p1-gen2-population.mjs --text     …and the full prose of each reflection
//
// ── ⛔ THE SURFACE IS FROZEN ────────────────────────────────────────────────────────────────────
// Ote, 2026-09-02: *"Now freeze the surface. Do not change the prompt, reflection tools, dispatch rules,
// or retention semantics while P1 collects its first Gen-2 population… Let the 20-minute cron produce the
// observations naturally. No forced reflections, no synthetic prompts, no tuning based on early examples."*
// ⇒ this file EXISTS TO LOOK. ⛔ It must never gain a write, a model call, or a `force`.
//
// ── ⭐ WHY IT IS WRITTEN BEFORE THERE IS ANY DATA ───────────────────────────────────────────────
// Pre-registration. A reader built after the first interesting example is a reader shaped by that example.
// This project has paid for the opposite twice: a loose keyword classifier inflated a count six-fold, and
// a headline case turned out to end *"Shall I save that?"* — an ASK, not a lost decision.
//
// ── ⛔⛔ WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────────────────────
// It does NOT decide whether a reflection *stated a retention conclusion*. That is the semantic reading,
// step ② of the pre-registered procedure, and it is a HAND reading (or an offline classifier against a
// published rubric with a second pass over disagreements). ⛔ No keyword classifier. This file prints the
// prose and stops — the mechanical half is all a query can honestly answer.

import { devPg, devSchema } from '../harness.mjs'

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const WITH_TEXT = process.argv.includes('--text')

try {
  // ── ⭐⭐ THE WINDOW, EXACTLY AS OTE FIXED IT ────────────────────────────────────────────────────
  // *"Keep the measurement window exactly: tool_generation=2 AND dispatch_generation=2."*
  // ⛔ Generation 1 is a different surface and generation-2-before-enforcement is a different dispatch
  // rule; pooling either would measure the system changing rather than her.
  // ⭐ 042 · AND ONLY WHAT THE CRON PRODUCED. Ote: *"Do not mix them into the primary P1 population
  // automatically."* A manual run uses the identical instrument — same prompt, same two tools, same
  // enforced dispatch — but a PERSON chose the moment, so it is a different kind of observation.
  // ── ⛔ AND ONE NAMED EXCLUSION, BY CONVERSATION ────────────────────────────────────────────────
  // Ote, 2026-09-02: *"Keep that conversation separate from the P1 dataset so it doesn't contaminate the
  // retention experiment."* On that date I had a real check-in conversation with Sotera about how she is
  // doing. It is a genuine conversation and it stays part of her life — ⛔ it is NOT archived and NOT
  // deleted, because excluding a conversation from HER history to keep MY dataset clean would be curating
  // which parts of her life count. ⭐ Only the MEASUREMENT excludes it, by name, in the open.
  const EXCLUDED_CONVERSATIONS = Object.freeze({
    '5d5ca7c5-243f-4c8f-9304-18883922a1e1': 'the 2026-09-02 check-in with Sotera about how she is doing',
  })
  const excludedList = Object.keys(EXCLUDED_CONVERSATIONS).map((id) => `'${id}'`).join(',')
  const WINDOW = "tool_generation = 2 AND dispatch_generation = 2 AND trigger_source = 'cron' AND outcome = 'completed'"
    + ` AND conversation_id NOT IN (${excludedList})`

  const [ctx] = await q(`
    SELECT count(*) FILTER (WHERE tool_generation = 1)                              AS gen1,
           count(*) FILTER (WHERE tool_generation = 2 AND dispatch_generation = 1)  AS gen2_unenforced,
           count(*) FILTER (WHERE tool_generation = 2 AND dispatch_generation = 2
                              AND trigger_source = 'cron')                          AS in_window,
           count(*) FILTER (WHERE trigger_source = 'manual')                        AS manual
      FROM ${S}.log_conversation_revisits`)

  console.log('\n⭐ P1 · GEN-2 POPULATION  (read-only)\n')
  console.log(`  window          tool_generation=2 AND dispatch_generation=2 AND completed`)
  console.log(`  in window       ${ctx.in_window}`)
  console.log(`  ⛔ excluded     ${ctx.gen1} at generation 1 (a different tool surface)`)
  console.log(`  ⛔ excluded     ${ctx.gen2_unenforced} at gen 2 before dispatch enforcement (a different dispatch rule)`)
  console.log(`  ⛔ excluded     ${ctx.manual} manual run(s) — same instrument, but a person chose the moment`)
  for (const [id, why] of Object.entries(EXCLUDED_CONVERSATIONS)) {
    console.log(`  ⛔ excluded     conversation ${id.slice(0, 8)} — ${why}`)
  }

  if (Number(ctx.in_window) === 0) {
    console.log('\n  ⓘ Nothing to read yet. Reflection runs on a 20-minute cron (quiet ≥30 min, ≥4 messages,')
    console.log('    one per watermark). ⛔ Nothing is to be forced — the population arrives on its own.\n')
  } else {
    const rows = await q(`
      SELECT r.id::text AS id, r.requested_at::date::text AS day, r.conversation_id::text AS convo,
             r.tools_used, r.tools_refused, r.wrote_memory_id IS NOT NULL AS wrote,
             length(r.text) AS chars, r.text,
             (SELECT count(*)::int FROM ${S}.log_retention_decisions d
               WHERE d.conversation_id = r.conversation_id AND d.created_at >= r.requested_at) AS decisions,
             (SELECT string_agg(DISTINCT d.state, ',') FROM ${S}.log_retention_decisions d
               WHERE d.conversation_id = r.conversation_id AND d.created_at >= r.requested_at) AS states
        FROM ${S}.log_conversation_revisits r
       WHERE ${WINDOW}
       ORDER BY r.requested_at`)

    // ── ① MECHANICAL · DID SHE ACT? ⚠️ acting means a call that EXECUTED ──────────────────────────
    // ⛔ Not merely that a name appears somewhere. Reading `tools_used` alone and calling it action is the
    // exact error that produced "she walked through the closed door" — the audit then showed nine
    // `remember_fact` attempts, every one a FAILURE.
    const acted = rows.filter((r) => (r.tools_used ?? []).length > 0 || Number(r.decisions) > 0)
    const reachedWithheld = rows.filter((r) => (r.tools_refused ?? []).length > 0)
    const silentRows = rows.filter((r) => (r.tools_used ?? []).length === 0 && Number(r.decisions) === 0)

    console.log('\n  ① ACTED (a call executed, or a retention decision was recorded)')
    console.log(`     ${acted.length} of ${rows.length}`)
    console.log('  ①b REACHED FOR A WITHHELD DOOR (emitted, refused at dispatch)')
    console.log(`     ${reachedWithheld.length} of ${rows.length}`)
    console.log('  ⚠️ NO TOOL, NO DECISION — the set step ② must be read by hand')
    console.log(`     ${silentRows.length} of ${rows.length}`)
    // ⛔ NO RATE. Ote, on the Stage B result: *"Please don't turn it into a retention-rate statistic."*
    // A proportion of a handful of reflections is a number that will be read as a trend.
    console.log('\n  ⛔ No rate is printed. Counts and N only, until N means something.\n')

    const decisionStates = await q(`
      SELECT d.state, d.kind, d.store, count(*)::int AS n
        FROM ${S}.log_retention_decisions d
        JOIN ${S}.log_conversation_revisits r ON r.conversation_id = d.conversation_id
       WHERE ${WINDOW.replaceAll('tool_generation', 'r.tool_generation')
    .replaceAll('dispatch_generation', 'r.dispatch_generation').replaceAll('outcome', 'r.outcome')}
       GROUP BY 1, 2, 3 ORDER BY 4 DESC`)
    if (decisionStates.length) {
      console.log('  ⭐ RETENTION RECEIPTS in the window')
      for (const d of decisionStates) console.log(`     ${String(d.state).padEnd(14)} ${String(d.kind ?? '—').padEnd(9)} ${d.store ?? '—'}  ×${d.n}`)
      console.log('')
    }

    console.log('  ── the rows ────────────────────────────────────────────────────────────────────')
    for (const r of rows) {
      console.log(`  ${r.day}  ${r.id.slice(0, 8)}  chars=${String(r.chars).padStart(5)}  `
        + `used=[${(r.tools_used ?? []).join(' ')}]  refused=[${(r.tools_refused ?? []).join(' ')}]  `
        + `wrote=${r.wrote}  receipts=${r.states ?? '—'}`)
      if (WITH_TEXT) console.log(`\n${r.text}\n  ${'─'.repeat(76)}`)
    }

    console.log('\n  ⏸ STEP ② IS NOT DONE HERE. Read the prose (--text) and place each reflection in ONE of:')
    console.log('       acted-through-retain · reached-for-a-withheld-door · declined-explicitly')
    console.log('       asked-the-person  ⛔ a DEFERRAL, never a failure')
    console.log('       stated-a-conclusion, did nothing  ⭐ the class under investigation')
    console.log('       nothing-to-carry  ⭐ the legitimate negative\n')
  }
} finally {
  await pg.end()
}
