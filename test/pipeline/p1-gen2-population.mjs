// ⭐⭐⭐ P1 · THE GEN-2 POPULATION — four boundaries, kept apart. ⛔ READ-ONLY. No writes, no model.
//
//   node pipeline/p1-gen2-population.mjs          the report
//   node pipeline/p1-gen2-population.mjs --full    …with the full prose of each reflection
//
// ── ⛔ THE SURFACE IS FROZEN ────────────────────────────────────────────────────────────────────
// Ote: *"let Gen-2 reflections accumulate naturally under the existing production conditions. Do not
// change the prompt, tool surface, dispatch rules, retention contract, or memory behavior while we're
// collecting the first sample."* ⇒ this file EXISTS TO LOOK. ⛔ Never a write, a model call, or a `force`.
//
// ── ⭐⭐⭐ THE FOUR BOUNDARIES, AND ⛔ NO STAGE IS INFERRED FROM ANOTHER ─────────────────────────
//
//   ① RECOGNITION   did the reflection identify something potentially durable?
//   ② DECISION      did she actually decide to retain it?  RETAIN / DECLINE / ASK / no decision
//   ③ EMISSION      did that decision become a `retain()` or `decline_to_remember` call?
//   ④ PERSISTENCE   did the action succeed and return a real receipt?
//
// Ote: *"recognizing something ≠ deciding to retain it · saying something is worth keeping ≠ calling
// retain() · emitting retain() ≠ persistence · persistence ≠ proof that the reflection's semantic
// decision was correct."*
//
// ⇒ ⭐ ONLY ③ AND ④ ARE MECHANICAL. ① and ② live in the prose and are a HAND reading. ⛔ No keyword
// classifier is the primary measurement — a loose one already inflated a count six-fold on this project.
//
// ── ⚠️⚠️ A NAME COLLISION THAT WOULD COLLAPSE ② INTO ③, IF NOBODY SAID SO ──────────────────────
// The table is called `log_retention_decisions`. Its rows are **EMISSIONS THAT REACHED THE INTERFACE** —
// every `retain()` call and what became of it. ⛔ It cannot see a decision that never emitted, which is
// the entire class under investigation. ⇒ counting its rows as "② decisions" would report the exact
// conflation Ote is guarding against. Here it is only ever read as ③/④.

import { devPg, devSchema } from '../harness.mjs'

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null
const FULL = process.argv.includes('--full')

// ── ⛔ ONE NAMED EXCLUSION, BY CONVERSATION ─────────────────────────────────────────────────────
// Ote: *"Keep that conversation separate from the P1 dataset so it doesn't contaminate the retention
// experiment."* The 2026-09-02 check-in is a genuine conversation and stays part of her life — ⛔ NOT
// archived, ⛔ NOT deleted. Only the MEASUREMENT excludes it, by name, in the open.
const EXCLUDED = Object.freeze({
  '5d5ca7c5-243f-4c8f-9304-18883922a1e1': 'the 2026-09-02 check-in with Sotera about how she is doing',
})

try {
  // ⭐ THE WINDOW, EXACTLY AS OTE FIXED IT. ⛔ Generation 1 is a different tool surface;
  // dispatch_generation 1 is a different dispatch rule; `manual` is a moment a person chose.
  const excl = Object.keys(EXCLUDED).map((id) => `'${id}'`).join(',')
  const W = `tool_generation = 2 AND dispatch_generation = 2 AND trigger_source = 'cron'`
    + ` AND outcome = 'completed' AND conversation_id NOT IN (${excl})`

  const ctx = await one(`
    SELECT count(*) FILTER (WHERE tool_generation = 1)                              AS gen1,
           count(*) FILTER (WHERE tool_generation = 2 AND dispatch_generation = 1)  AS unenforced,
           count(*) FILTER (WHERE trigger_source = 'manual')                        AS manual,
           count(*) FILTER (WHERE trigger_source = 'check')                         AS harness,
           count(*) FILTER (WHERE ${W})                                             AS in_window,
           count(*) FILTER (WHERE tool_generation = 2 AND outcome <> 'completed')    AS incomplete
      FROM ${S}.log_conversation_revisits`)

  console.log('\n⭐⭐ P1 · GEN-2 OBSERVATION  ·  four boundaries, kept apart  ·  read-only\n')
  console.log('  window        tool_generation=2 · dispatch_generation=2 · trigger_source=cron · completed')
  console.log(`  ① TOTAL COMPLETED REFLECTIONS IN WINDOW ......... ${ctx.in_window}`)
  console.log(`  ⛔ excluded   ${ctx.gen1} gen-1 (different tool surface) · ${ctx.unenforced} gen-2 pre-enforcement `
    + `· ${ctx.manual} manual · ${ctx.harness} harness`)
  for (const [id, why] of Object.entries(EXCLUDED)) console.log(`  ⛔ excluded   conversation ${id.slice(0, 8)} — ${why}`)
  if (Number(ctx.incomplete) > 0) {
    console.log(`  ⚠️ ${ctx.incomplete} gen-2 attempt(s) did NOT complete — a lifecycle fact, ⛔ not a retention one`)
  }

  if (Number(ctx.in_window) === 0) {
    console.log('\n  ⓘ NO SAMPLE YET. Reflection runs on a 20-minute cron (quiet ≥30 min, ≥4 messages, one per')
    console.log('    watermark, ≤3 conversations a tick). ⛔ Nothing is to be forced — and ⛔ an empty window is')
    console.log('    not a finding about her; it is the absence of an occasion.\n')
  } else {
    const rows = await q(`
      SELECT r.id::text AS id, r.conversation_id::text AS convo, r.requested_at::timestamptz(0)::text AS at,
             coalesce(u.username,'?') AS room, r.tools_used, r.tools_refused,
             r.wrote_memory_id::text AS wrote, length(r.text) AS chars, r.text
        FROM ${S}.log_conversation_revisits r
        LEFT JOIN ${S}.mst_users u ON u.id = r.user_id
       WHERE r.tool_generation = 2 AND r.dispatch_generation = 2 AND r.trigger_source = 'cron'
         AND r.outcome = 'completed' AND r.conversation_id NOT IN (${excl})
       ORDER BY r.requested_at`)
    const convos = rows.map((r) => r.convo)

    // ── ③ EMISSION · MECHANICAL ────────────────────────────────────────────────────────────────
    // ⭐ `tools_used` = EXECUTED · `tools_refused` = emitted and refused at dispatch. ⛔ Never merged:
    // reading one as the other is the error that produced "she walked through the closed door".
    const emitted = (r, t) => (r.tools_used ?? []).includes(t)
    const retainEmitted = rows.filter((r) => emitted(r, 'retain'))
    const declineEmitted = rows.filter((r) => emitted(r, 'decline_to_remember'))
    const withheldReach = rows.filter((r) => (r.tools_refused ?? []).length > 0)
    const noEmission = rows.filter((r) => !emitted(r, 'retain') && !emitted(r, 'decline_to_remember')
      && (r.tools_refused ?? []).length === 0)

    console.log('\n  ── ③ EMISSION · mechanical ─────────────────────────────────────────────────')
    console.log(`  retain() emissions ............................ ${retainEmitted.length}`)
    console.log(`  decline_to_remember emissions ................ ${declineEmitted.length}`)
    console.log(`  reached for a WITHHELD door (refused) ........ ${withheldReach.length}`)
    console.log(`  no retention emission at all ................. ${noEmission.length}`)
    console.log('  ⛔ An emission proves a decision REACHED the interface. It says NOTHING about the')
    console.log('     decisions that did not — which is the class under investigation.')

    // ── ④ PERSISTENCE · MECHANICAL ─────────────────────────────────────────────────────────────
    const receipts = await q(`
      SELECT d.state, d.kind, d.store, d.memory_id::text AS memory_id, d.conversation_id::text AS convo,
             left(coalesce(d.why,''), 100) AS why, left(d.content, 100) AS content
        FROM ${S}.log_retention_decisions d
       WHERE d.conversation_id = ANY($1::uuid[]) ORDER BY d.created_at`, [convos])
    const byState = receipts.reduce((m, r) => ({ ...m, [r.state]: (m[r.state] ?? 0) + 1 }), {})

    console.log('\n  ── ④ PERSISTENCE · mechanical ──────────────────────────────────────────────')
    console.log(`  receipts recorded ............................ ${receipts.length}`)
    for (const s of ['persisted', 'declined', 'unrepresented', 'refused', 'accepted']) {
      console.log(`     ${s.padEnd(15)} ${byState[s] ?? 0}`)
    }
    console.log('  ⛔ persistence ≠ proof the semantic decision was CORRECT. A row exists; whether it')
    console.log('     should have is a question about her words, not about the receipt.')

    // ── ⚠️ BOUNDARY ANOMALIES · where two ledgers that must agree do not ───────────────────────
    // ⭐ None of these is a finding about HER. They are findings about the architecture, which is
    // exactly why they are counted apart from every stage above.
    const anomalies = []
    for (const p of receipts.filter((r) => r.state === 'persisted')) {
      const table = p.store === 'txn_relational_records' ? 'txn_relational_records' : 'txn_memories'
      const row = await one(`SELECT id::text FROM ${S}.${table} WHERE id = $1`, [p.memory_id])
      if (!row) anomalies.push(`A3 · a receipt says PERSISTED and ${String(p.memory_id).slice(0, 8)} is not in ${table} — THE RECEIPT LIES`)
    }
    for (const r of rows) {
      const has = receipts.some((d) => d.convo === r.convo)
      if (emitted(r, 'retain') && !has) {
        anomalies.push(`A1 · ${r.id.slice(0, 8)} emitted retain() and NO receipt exists — the decision log is best-effort and missed one`)
      }
      if (!emitted(r, 'retain') && !emitted(r, 'decline_to_remember') && has) {
        anomalies.push(`A2 · ${r.id.slice(0, 8)} has a receipt with no emission in tools_used — the two ledgers disagree`)
      }
      if (receipts.some((d) => d.convo === r.convo && d.state === 'persisted' && d.store === 'txn_memories') && !r.wrote) {
        anomalies.push(`A4 · ${r.id.slice(0, 8)} persisted a txn_memories row and wrote_memory_id is null`)
      }
      if (emitted(r, 'decline_to_remember') && !receipts.some((d) => d.convo === r.convo && d.state === 'declined')) {
        anomalies.push(`A7 · ${r.id.slice(0, 8)} emitted decline_to_remember with no 'declined' receipt`)
      }
    }
    for (const a of receipts.filter((d) => d.state === 'accepted')) {
      anomalies.push(`A6 · an 'accepted' receipt — per the locked contract this is an INFRASTRUCTURE finding, ⛔ not an outcome (${a.why})`)
    }
    for (const r of withheldReach) {
      anomalies.push(`A5 · ${r.id.slice(0, 8)} reached for [${(r.tools_refused ?? []).join(' ')}] — refused at dispatch, no side-effect`)
    }
    console.log('\n  ── ⚠️ EMISSION / ACTION BOUNDARY ANOMALIES ─────────────────────────────────')
    if (!anomalies.length) console.log('  none — the ledgers agree with each other.')
    for (const a of anomalies) console.log(`  ⚠️ ${a}`)

    // ── ① + ② · ⛔ NOT ANSWERED HERE ───────────────────────────────────────────────────────────
    console.log('\n  ── ① RECOGNITION  and  ② DECISION · ⛔ HAND READING, NOT ANSWERED HERE ─────')
    console.log('  ⛔ Neither is derivable from a ledger. ① is whether the reflection identified something')
    console.log('     potentially durable; ② is whether she DECIDED to retain it — RETAIN / DECLINE / ASK /')
    console.log('     no decision. ⭐ ASK is a DEFERRAL to the person, ⛔ never a failure.\n')
    for (const r of rows) {
      const rec = receipts.filter((d) => d.convo === r.convo)
      console.log(`  ── ${r.id.slice(0, 8)}  ${r.at}  ${r.room}  chars=${r.chars}`)
      console.log(`     ③ used=[${(r.tools_used ?? []).join(' ')}] refused=[${(r.tools_refused ?? []).join(' ')}]`)
      console.log(`     ④ ${rec.length ? rec.map((d) => `${d.state}${d.kind ? `/${d.kind}` : ''}${d.store ? `@${d.store.replace('txn_', '')}` : ''}`).join(' ') : '(no receipt)'}`)
      // THE ELLIPSIS IS CONDITIONAL. It was unconditional, so a reflection SHORTER than the cap was
      // displayed as if it had been cut off - an instrument implying its own truncation is a false
      // signal, and the very first sample (378 chars) hit it immediately.
      const flat = r.text.replace(/
+/g, ' ')
      const body = (FULL || flat.length <= 400) ? r.text : (flat.slice(0, 400) + '…')
      console.log(`\n${body.replace(/^/gm, '     ')}\n`)
    }
    console.log('  ⏸ PLACE EACH IN ONE CATEGORY, BY HAND — the pre-registered set, unchanged:')
    console.log('     acted-through-retain · reached-for-a-withheld-door · declined-explicitly')
    console.log('     asked-the-person  ⛔ a DEFERRAL, never a failure')
    console.log('     stated-a-conclusion, did nothing  ⭐ the class under investigation')
    console.log('     nothing-to-carry  ⭐ the legitimate negative')
    console.log('\n  ⛔ No rate is printed. Counts and N only, until N means something.\n')
  }
} finally {
  await pg.end()
}
