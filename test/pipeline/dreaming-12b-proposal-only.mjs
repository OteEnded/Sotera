// ⭐⭐⭐ M2-12b · PROPOSAL-ONLY AGAINST THE LIVE CORPUS. ⛔ NOTHING IS PERSISTED.
//
//   node test/pipeline/dreaming-12b-proposal-only.mjs [--slots 3]
//
// ── ⛔ THE BOUNDARY OTE SET, 2026-09-03 ─────────────────────────────────────────────────────────
//   *"M2 may run against the live corpus in proposal-only mode, provided it has no persistence side
//    effect. The proposal must remain genuinely non-durable: no memory row, no relational write, no
//    retention decision, no Composer-visible state."*
//
// ⇒ this run reads the live corpus, calls the aux model **CPU-side**, proposes, verifies — and then
// PROVES the database is unchanged, field by field. ⭐ The proof is the deliverable as much as the
// proposals are: *"I want the result to show both what M2 would propose AND that the database/context
// state is unchanged afterward."*
//
// ⛔⛔ AND 12a STILL HOLDS: no commitment reaches the live persona. There is no write path in the
// reasoner to disable — it returns an object.

import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { rebuildProviderRegistry } from '../../Backend/app/adapters/registry.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { measureCandidates } from '../../Backend/app/components/dreaming-candidate-host.js'
import { admitEvidence } from '../../Backend/app/components/dreaming-evidence.js'
import { evidentialSql } from '../../Backend/app/components/corpus-eligibility.js'
import { makeDreamingLlm, proposeFromBuckets } from '../../Backend/app/components/dreaming-reason-host.js'

const argv = process.argv.slice(2)
const nSlots = (() => { const i = argv.indexOf('--slots'); return i >= 0 ? Number(argv[i + 1]) : 3 })()

const config = loadConfig()
const db = await initDB()
setDB(db)
await rebuildProviderRegistry({ db, config })
await initSettings(db)
const fastify = { db, config }

const pg = devPg(); await pg.connect()
const S = `"${devSchema()}"`
const query = async (sql, p) => pg.query(sql, p)

/**
 * ⭐⭐ EVERYTHING A PERSISTENCE SIDE EFFECT COULD TOUCH — counts AND high-water marks.
 * ⛔ A count alone survives a delete-and-insert; `max(...)` survives nothing. Both, so a write cannot
 * hide in either. ⭐ And `access_count` is in here because `recall()` bumps it: that is the P1
 * contamination route no row count would catch.
 */
async function snapshot() {
  const { rows } = await query(`SELECT
      (SELECT count(*)::int FROM ${S}.txn_memories)                                   AS memories,
      (SELECT max(created_at) FROM ${S}.txn_memories)                                 AS mem_last,
      (SELECT max(updated_at) FROM ${S}.txn_memories)                                 AS mem_touched,
      (SELECT sum(access_count)::int FROM ${S}.txn_memories)                          AS access_total,
      (SELECT max(last_access) FROM ${S}.txn_memories)                                AS access_last,
      (SELECT count(*)::int FROM ${S}.txn_relational_records)                         AS relational,
      (SELECT count(*)::int FROM ${S}.log_retention_decisions)                        AS retention,
      (SELECT count(*)::int FROM ${S}.log_memory_warrants)                            AS warrants,
      (SELECT count(*)::int FROM ${S}.txn_messages)                                   AS messages,
      (SELECT count(*)::int FROM ${S}.txn_conversations)                              AS convos,
      (SELECT count(*)::int FROM ${S}.txn_message_embeddings)                         AS embeddings,
      (SELECT count(*)::int FROM ${S}.mst_slots)                                      AS slots,
      (SELECT count(*)::int FROM ${S}.mst_slot_questions)                             AS questions,
      (SELECT count(*)::int FROM ${S}.log_dreaming_passes)                            AS passes,
      (SELECT count(*)::int FROM ${S}.log_conversation_revisits)                      AS acts,
      (SELECT count(*)::int FROM ${S}.log_conversation_revisits
        WHERE tool_generation = 2 AND dispatch_generation = 2
          AND trigger_source = 'cron' AND outcome = 'completed')                       AS p1_window`)
  return rows[0]
}

try {
  console.log('\n══ M2-12b · PROPOSAL-ONLY, LIVE CORPUS ═══════════════════════════════════════')
  console.log('   ⛔ no memory row · no retention decision · no relational write · no warrant')
  console.log('   ⛔ no Composer-visible state · ⛔ nothing enters P1\n')

  const before = await snapshot()

  // ── ① CANDIDATES, from M1-F's own machinery ────────────────────────────────────────────────────
  const measured = await measureCandidates({ query, schema: devSchema() })
  const hits = measured.slots
    .filter((s) => s.probed && s.all.clearsFloor)
    // ⭐ Prefer slots whose roots rest on at least one USER turn: roots made only of her own sentences
    // are one voice echoing, which is what O-2's root counting exists to catch.
    .sort((a, b) => (b.all.rooms[0]?.userTurns ?? 0) - (a.all.rooms[0]?.userTurns ?? 0))
    .slice(0, nSlots)
  console.log(`   candidates: ${hits.length} slot(s) of ${measured.summary.clearsFloorAll} clearing the floor\n`)

  const llm = makeDreamingLlm(fastify)
  const results = []

  for (const slot of hits) {
    const room = slot.all.rooms[0]
    // ── ② BOUNDED EVIDENCE, through the ADMISSION path (⛔ never the dense arm) ───────────────────
    // eslint-disable-next-line no-await-in-loop
    const { rows } = await query(
      `SELECT m.id::text AS message_id, m.conversation_id::text AS conversation_id, m.created_at,
              m.content, c.user_id::text AS room
         FROM ${S}.txn_messages m
         JOIN ${S}.txn_conversations c ON c.id = m.conversation_id
        WHERE ${evidentialSql('c')} AND c.user_id = $1::uuid
          AND m.role IN ('user','assistant')
          AND (${slot.terms.map((_, i) => `m.content ILIKE $${i + 2}`).join(' AND ')})
        ORDER BY m.created_at LIMIT 60`,
      [room.room, ...slot.terms.map((t) => `%${t}%`)])
    const admitted = admitEvidence({ rows, room: room.room })
    if (!admitted.ok) { results.push({ slot: slot.attribute, stage: 'evidence', why: admitted.why }); continue }

    // ⭐ Opaque root ids. The model cites by root and is never told how many there are.
    // ⚠️ ONE NAME. This used to add a separate `label`, and the mapping below then stripped it — the
    // prompt and the verifier disagreed on every identifier and discarded 8 of 8 cites regardless of
    // what the model produced.
    const buckets = admitted.buckets.map((b, i) => ({ ...b, root: `g${i + 1}` }))

    // ── ③ + ④ PROPOSE, THEN VERIFY ──────────────────────────────────────────────────────────────
    // eslint-disable-next-line no-await-in-loop
    const r = await proposeFromBuckets({
      llm, buckets: buckets.map((b) => ({ root: b.root, turns: b.turns })),
      entity: 'user', attribute: slot.attribute,
    })
    results.push({ slot: slot.attribute, roots: buckets.length, ...r })
  }

  // ── ⑤ WHAT IT WOULD PROPOSE ────────────────────────────────────────────────────────────────────
  console.log('══ WHAT M2 WOULD PROPOSE ════════════════════════════════════════════════════\n')
  for (const r of results) {
    console.log(`  ▸ ${r.slot}   (${r.roots ?? '-'} independent root(s))`)
    console.log(`    stage    ${r.stage}${r.ok ? '  ✅' : `  ⏸ ${r.declined ? 'declined' : 'refused'}`}`)
    if (r.claim?.value) console.log(`    value    ${JSON.stringify(r.claim.value)}`)
    if (r.claim?.kind) console.log(`    kind     ${r.claim.kind}   ⓘ a PROPOSAL — the slot's declared kind decides`)
    if (r.verification) {
      console.log(`    verified ${r.verification.verifiedRoots} root(s), `
        + `${r.verification.discarded.length} cite(s) discarded`)
    }
    console.log(`    why      ${r.why}\n`)
  }
  const verified = results.filter((r) => r.ok).length
  console.log(`  ⇒ ${verified} of ${results.length} reached a VERIFIED claim`)
  console.log('  ⛔ and not one of them was persisted — see the proof below\n')

  // ── ⑥ ⭐⭐⭐ THE PROOF THAT NOTHING CHANGED ────────────────────────────────────────────────────
  const after = await snapshot()
  console.log('══ STATE PROOF ══════════════════════════════════════════════════════════════\n')
  let moved = 0
  for (const k of Object.keys(before)) {
    const same = String(before[k]) === String(after[k])
    if (!same) moved++
    console.log(`  ${same ? 'ok  ' : 'MOVED'} ${k.padEnd(14)} ${String(before[k])}${same ? '' : ` → ${String(after[k])}`}`)
  }
  console.log(moved === 0
    ? '\n  ✅ EVERY tracked value is unchanged — including `access_count`, the P1 route no row count catches\n'
    : `\n  ⛔⛔ ${moved} VALUE(S) MOVED — a persistence side effect occurred and must be explained\n`)
  process.exitCode = moved === 0 ? 0 : 1
} catch (e) {
  console.error(`\n⛔ ${e?.stack ?? e}\n`)
  process.exitCode = 1
} finally {
  await pg.end()
  await db.sequelize?.close?.().catch(() => {})
}
