// ⭐⭐⭐ D1(b) — A WRITE WITH NO DECLARED WRITER IS ADMITTED, AND SAID SO LOUDLY.
//
//   node test/checks/writer-seam-check.mjs
//
// Ote's ruling, 2026-09-15: *"(b) now — admit the write, but record the missing writer identity loudly."* Staged:
//   Phase 1  make the absence visible (this check's W1–W6) — ⛔ break no caller
//   Phase 2  enumerate and wire every legitimate caller          (W7–W9)
//   Phase 3  ⏸ NOT YET — refuse the undeclared write, once the caller set is demonstrably complete
//
// ⛔⛔ THE DISTINCTION THIS CHECK EXISTS TO HOLD: a row the historical backfill RATIFIED as unknown (M3 — "unknown stays
// unknown") must stay quiet forever, while a row a LIVE caller wrote without declaring itself is a DEFECT to be fixed.
// Both have `writer IS NULL`; only the audited backfill act tells them apart. A rule that cannot separate them would
// either nag about a ratified absence for ever or hide a live leak — see `assert-the-state-not-the-answer`.
//
// Every fixture is `zz_seam` on agent_dev and removed at the end. ⛔ Nothing repairs an existing row.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryV2 } from '../../Backend/app/components/memory-v2-host.js'
import { buildRetention } from '../../Backend/app/components/retention-host.js'
import { lintMemory } from '../../Backend/app/components/memory-lint-host.js'
import { WRITER, ACT_KIND, REACH_KIND } from '../../Backend/app/components/memory-writer-contracts.js'

const { check, done } = makeChecker('writer-seam')
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0]
const MARK = 'zz_seam'
const MADE = { memories: [], conversations: [] }
const M = (r) => { if (r?.id) MADE.memories.push(r.id); return r }
const [agent] = await q(`SELECT id::text AS id FROM ${S}."mst_users" WHERE username = 'agent_dev'`)

// a logger that records what the store says, so "loudly" is an assertion rather than a hope
const said = []
const log = { warn: (o, m) => said.push({ o, m }), info: () => {}, error: (o, m) => said.push({ o, m }), debug: () => {} }
const fastify = { db, config, log }
const rowOf = async (id) => one(`SELECT writer, act_kind::text AS act_kind, act_id, reach_kind::text AS reach_kind FROM ${S}."txn_memories" WHERE id = $1::uuid`, [id])
const fired = (rep, rule) => (rep.owners ?? []).flatMap((o) => o.findings ?? []).filter((f) => f.rule === rule).map((f) => f.id)

try {
  // ══ W1 · an UNDECLARED write is ADMITTED — this is (b), ⛔ not (a) ═══════════════════════════════════════════════
  const bare = buildMemoryV2(fastify, { userId: agent.id })            // ⛔ no writer, no act, no reach — today's legal call
  const w1 = M(await bare.remember({ content: `${MARK} a row written with no declared writer`, kind: 'semantic' }))
  const r1 = w1?.id ? await rowOf(w1.id) : null
  check('W1 · ⭐ a write with NO declared writer is ADMITTED and the row exists — Phase 1 breaks no caller',
    !!w1?.id && r1?.writer === null, JSON.stringify(r1))

  // ══ W2 · …and the store SAID SO, at write time, with enough to find the caller ═══════════════════════════════════
  const warned = said.filter((s) => /writer/i.test(String(s.m)))
  check('W2 · ⭐⭐ the store logged the absence LOUDLY — a warn naming the memory and what it could not attribute',
    warned.length > 0 && warned.some((s) => s.o?.id === w1.id || s.o?.memoryId === w1.id),
    warned.length ? `${warned.length} warn(s): ${String(warned[warned.length - 1].m).slice(0, 110)}` : 'the store said NOTHING')

  // ══ W3 · the standing lint reports it as a DEFECT ═══════════════════════════════════════════════════════════════
  const lint = await lintMemory(db, { userId: agent.id })
  const rule = (lint.rules ?? []).find((r) => r.id === 'writer-not-declared')
  check('W3a · the rule EXISTS and is a defect — ⛔ zero is a result, a missing rule is not', !!rule && rule.severity === 'defect', rule ? rule.severity : 'rule absent')
  check('W3b · ⭐⭐⭐ the undeclared row is REPORTED — the leak is visible without anyone remembering to look',
    fired(lint, 'writer-not-declared').includes(w1.id))

  // ══ W4 · ⛔ a RATIFIED historical unknown stays QUIET — the rule separates the two absences ═══════════════════════
  const hist = await one(`SELECT m.id::text AS id FROM ${S}."txn_memories" m
                           WHERE m.writer IS NULL
                             AND EXISTS (SELECT 1 FROM ${S}."log_memory_changes" c WHERE c.memory_id = m.id AND c.action = 'axes-backfill')
                           LIMIT 1`)
  check('W4a · the corpus actually HAS a ratified unknown to test against — ⛔ a vacuous control proves nothing', !!hist?.id, hist?.id ? 'found' : 'none in corpus')
  const all = await lintMemory(db, {})
  check('W4b · ⭐⭐⭐ a row the BACKFILL ratified as unknown is NOT a defect — "unknown stays unknown" (M3) is not a leak',
    !!hist?.id && !fired(all, 'writer-not-declared').includes(hist.id))

  // ══ W5 · a properly declared write is silent ════════════════════════════════════════════════════════════════════
  const cid = (await one(`INSERT INTO ${S}."txn_conversations" (id, user_id, title, incognito, settings, created_at, updated_at)
                           VALUES (gen_random_uuid(), $1::uuid, $2, false, '{}'::jsonb, now(), now()) RETURNING id::text AS id`, [agent.id, `${MARK} room`])).id
  MADE.conversations.push(cid)
  const msg = (await one(`INSERT INTO ${S}."txn_messages" (id, conversation_id, role, content, created_at, updated_at)
                           VALUES (gen_random_uuid(), $1::uuid, 'user', $2, now(), now()) RETURNING id::text AS id`, [cid, `${MARK} I keep bees.`])).id
  const declared = buildMemoryV2(fastify, { userId: agent.id, writer: WRITER.chatTool, act: { kind: ACT_KIND.turn, id: msg }, reach: { kind: REACH_KIND.turn, messageId: msg, conversationId: cid } })
  const w5 = M(await declared.remember({ content: `${MARK} they keep bees`, kind: 'semantic' }))
  const lint5 = await lintMemory(db, { userId: agent.id })
  check('W5 · a DECLARED write is not reported — the rule fires on the absence, ⛔ not on writes in general',
    !fired(lint5, 'writer-not-declared').includes(w5.id))

  // ══ W6 · ⛔ NOTHING WAS REPAIRED — Ote: "preserve them exactly as written" ═══════════════════════════════════════
  const after = await rowOf(w1.id)
  check('W6 · ⭐⭐ the undeclared row is UNCHANGED after being reported — reporting is not repair (M2)',
    after?.writer === null && after?.act_kind === null && after?.reach_kind === null, JSON.stringify(after))

  // ══ PHASE 2 · the enumerated callers now declare themselves ═════════════════════════════════════════════════════
  const retention = buildRetention(fastify, { userId: agent.id, conversationId: cid, isRoot: false, user: { id: agent.id, isRoot: false } })
  const lessonOut = await retention.keep({
    what: `${MARK} keeping a distinction: reporting an absence is not repairing it`, kind: 'lesson',
    mine: true, attribute: `${MARK} reporting vs repairing`,
  })
  // ⛔ BY THE RETURNED ID, ⛔ never by a content LIKE: a lesson stores its own ABSTRACTION, not the text handed in, so
  //    matching on the input silently finds nothing and the check reports a defect that is its own.
  const lessonId = lessonOut?.result?.id ?? lessonOut?.memoryId ?? null
  const lessonRow = lessonId ? await one(`SELECT id::text AS id, writer, act_kind::text AS act_kind, act_id, reach_kind::text AS reach_kind
                                 FROM ${S}."txn_memories" WHERE id = $1::uuid`, [lessonId]) : null
  if (lessonRow?.id) MADE.memories.push(lessonRow.id)
  check('W7 · ⭐⭐⭐ a LESSON now declares itself — writer lesson · act record (its OWN record id) · reach none (it was writing raw SQL with none of them)',
    lessonRow?.writer === 'lesson' && lessonRow?.act_kind === 'record' && lessonRow?.act_id === lessonRow?.id && lessonRow?.reach_kind === 'none',
    JSON.stringify(lessonRow ?? lessonOut))
  const lintL = await lintMemory(db, { userId: agent.id })
  check('W8 · …and it is therefore NOT reported as an undeclared write',
    !!lessonRow?.id && !fired(lintL, 'writer-not-declared').includes(lessonRow.id))
  check('W9 · ⛔ and the lesson still reached its own destination — wiring the axes did not change WHAT is written',
    lessonOut?.ok !== false && /lesson/i.test(String(lessonOut?.via ?? lessonOut?.kind ?? '')), JSON.stringify(lessonOut?.via ?? lessonOut))
} finally {
  if (MADE.memories.length) {
    await q(`DELETE FROM ${S}."log_memory_changes" WHERE memory_id = ANY($1::uuid[])`, [MADE.memories]).catch(() => {})
    await q(`DELETE FROM ${S}."txn_memories" WHERE id = ANY($1::uuid[])`, [MADE.memories])
  }
  await q(`DELETE FROM ${S}."txn_memories" WHERE user_id = $1::uuid AND content LIKE '${MARK}%'`, [agent.id]).catch(() => {})
  if (MADE.conversations.length) {
    await q(`DELETE FROM ${S}."log_conversation_revisits" WHERE conversation_id = ANY($1::uuid[])`, [MADE.conversations]).catch(() => {})
    await q(`DELETE FROM ${S}."txn_messages" WHERE conversation_id = ANY($1::uuid[])`, [MADE.conversations])
    await q(`DELETE FROM ${S}."txn_conversations" WHERE id = ANY($1::uuid[])`, [MADE.conversations])
  }
  await pg.end()
}
done()
