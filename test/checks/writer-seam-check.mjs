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
// D8(b) / D9(a), ruled 2026-09-16 — the two writers that had no executable caller. Exercised through their REAL hosts.
import { buildReflection } from '../../Backend/app/components/reflection-host.js'
import { distillAll } from '../../Backend/app/components/memory-distill-host.js'
import { randomUUID } from 'node:crypto'

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
  // ══ W1 · ⭐⭐⭐ D1 PHASE 3 · AN UNDECLARED WRITE IS NOW *REFUSED* ══════════════════════════════════════════════════
  //
  // ⚠️⚠️ THIS ASSERTION WAS INVERTED ON 2026-09-16, AND THAT IS THE POINT OF THE WHOLE ARC.
  //   Phase 1 (09-15, Ote's ruling (b)): *admit* the write, record the absence loudly. W1 asserted the row EXISTED.
  //   Phase 3 (09-16, after the pre-flip audit measured ZERO production undeclared writes): the store REFUSES.
  // ⛔ The old assertion is not kept "for history" — a test that asserts admitted behaviour under a refusing store
  // would be asserting a lie. What it proved is preserved in `AI_ProgressTracking.md` and the audit.
  // ⭐ Ote: *"There must be no intentional test path where missing writer produces a durable memory row."* ⇒ this test
  // now proves the ABSENCE of a row rather than cleaning one up afterwards.
  const bare = buildMemoryV2(fastify, { userId: agent.id })            // ⛔ no writer, no act, no reach — now illegal
  let refusal = null
  try { refusal = await bare.remember({ content: `${MARK} a row written with no declared writer`, kind: 'semantic' }) } catch (e) { refusal = e }
  const leakedW1 = await one(`SELECT id::text AS id FROM ${S}."txn_memories" WHERE user_id = $1::uuid AND content LIKE '${MARK} a row written with no declared writer%'`, [agent.id])
  check('W1 · ⭐⭐⭐ a write with NO declared writer is REFUSED — and NO row exists afterwards',
    !leakedW1?.id && (refusal?.code === 'NO_WRITER' || refusal?.ok === false || /NO_WRITER|no declared writer/i.test(String(refusal?.message ?? refusal?.error ?? ''))),
    JSON.stringify({ refusal: String(refusal?.code ?? refusal?.message ?? JSON.stringify(refusal)).slice(0, 120), leaked: leakedW1?.id ?? null }))

  // ══ W2 · …and the refusal SAYS WHY, with enough to find the caller ═══════════════════════════════════════════════
  const warned = said.filter((s) => /writer/i.test(String(s.m ?? '')) || /NO_WRITER|no declared writer/i.test(String(s.o?.err ?? '')))
  check('W2 · ⭐⭐ the refusal is AUDIBLE — a silent drop and a refusal must not look alike',
    warned.length > 0 || /no declared writer/i.test(String(refusal?.message ?? '')),
    warned.length ? `${warned.length} line(s): ${String(warned[warned.length - 1].m ?? warned[warned.length - 1].o?.err).slice(0, 110)}` : `error: ${String(refusal?.message ?? '').slice(0, 110)}`)

  // ══ W3 · the standing lint reports it as a DEFECT ═══════════════════════════════════════════════════════════════
  const lint = await lintMemory(db, {})
  const rule = (lint.rules ?? []).find((r) => r.id === 'writer-not-declared')
  check('W3a · the rule EXISTS and is a defect — ⛔ zero is a result, a missing rule is not', !!rule && rule.severity === 'defect', rule ? rule.severity : 'rule absent')
  // ⭐ The rule still has work to do AFTER the flip: it is the only guard on the raw-SQL paths the store cannot see,
  // and on the frozen historical rows. ⛔ Ote kept it at `defect` severity for exactly that reason.
  check('W3b · ⭐⭐ the rule still REPORTS the frozen historical residue — the store gate does not cover raw SQL',
    fired(lint, 'writer-not-declared').length > 0, `${fired(lint, 'writer-not-declared').length} row(s) still reported`)

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

  // ══ W5b · ⭐⭐⭐ D1 PHASE 3, Ote's item 2 — A MUTATION IS AN AUTHORED ACT TOO, ⛔ not only an insert ═══════════════
  // ⚠️ It has to be attempted on a REAL row: `forget` looks the target up first and returns early when there is none,
  // so a made-up id never reaches the gate — the first version of this check passed vacuously for that reason.
  let mutRefusal = null
  try { mutRefusal = await bare.forget({ id: w5.id }) } catch (e) { mutRefusal = e }
  const stillLive = await one(`SELECT (expired_at IS NULL AND invalid_at IS NULL) AS live FROM ${S}."txn_memories" WHERE id = $1::uuid`, [w5.id])
  check('W5b · a FORGET with no declared writer is REFUSED — and the row it targeted is untouched',
    (mutRefusal?.code === 'NO_WRITER' || /NO_WRITER|no declared writer/i.test(String(mutRefusal?.message ?? ''))) && stillLive?.live === true,
    JSON.stringify({ refusal: String(mutRefusal?.code ?? mutRefusal?.message ?? JSON.stringify(mutRefusal)).slice(0, 110), stillLive: stillLive?.live }))

  // ══ W5c · ⛔ …but BOOKKEEPING is NOT gated — recall's promotion runs through the same method ══════════════════════
  // ⭐ The gate keys on the FIELDS being patched, not on the method, because `recall` ends in
  // `store.update(ids, { tier: 'hot' })`. Gate the method and reading stops working — this is what stops that regression.
  let recalled = null
  try { recalled = await bare.recall({ query: `${MARK} they keep bees`, limit: 3 }) } catch (e) { recalled = e }
  check('W5c · ⭐⭐ a RECALL from an undeclared store still works — the gate is on belief changes, ⛔ not on cache state',
    !(recalled instanceof Error), recalled instanceof Error ? String(recalled.message).slice(0, 120) : `${recalled?.memories?.length ?? recalled?.matches?.length ?? 0} hit(s)`)

  // ══ W6 · ⛔ THE HISTORICAL RESIDUE IS UNCHANGED — Ote, at every phase: "do not repair historical undeclared rows" ══
  // ⭐ Re-pointed at a REAL historical row when Phase 3 removed W1's fixture: the flip refuses new undeclared writes,
  // and it must NOT have touched the old ones. `hist` is a row the 049 backfill ratified as a permanent unknown.
  const after = hist?.id ? await rowOf(hist.id) : null
  check('W6 · ⭐⭐ a historical undeclared row is UNCHANGED by the flip — refusing new writes is not repairing old ones',
    !!after && after.writer === null && after.act_kind === null, JSON.stringify(after))

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

  // ══ D8(b) · THE PERSONA-NOTES WRITER — Ote's ruling, 2026-09-16 ═══════════════════════════════════════════════════
  //
  // *"Give persona-notes its own writer contract; act = revisit:<pass-id>; reach = none; keep reflectMode off."*
  // ⛔ `reflectMode` is NOT touched here: `reflectScope` is called directly, which is a different thing from the nightly
  // trigger the setting gates. The feature stays off; this proves the WRITER declares itself when it runs.
  const noteAct = { kind: ACT_KIND.revisit, id: randomUUID() }
  const noteOut = await buildReflection(fastify, { userId: agent.id, act: noteAct })
    .addNote({ content: `${MARK} prefer a measured answer over a fast one with this person`, importance: 6, source: `${MARK}:derived` })
  const noteId = noteOut?.id ?? noteOut?.memoryId ?? null
  const noteRow = noteId ? await one(`SELECT id::text AS id, kind, writer, act_kind::text AS act_kind, act_id,
                                             reach_kind::text AS reach_kind, reach_conversation_id::text AS reach_convo
                                        FROM ${S}."txn_memories" WHERE id = $1::uuid`, [noteId]) : null
  if (noteRow?.id) MADE.memories.push(noteRow.id)
  check('W10 · ⭐⭐⭐ a PERSONA NOTE now declares itself — writer notes · act revisit (the pass id) · kind note',
    noteRow?.writer === 'notes' && noteRow?.act_kind === 'revisit' && noteRow?.act_id === noteAct.id && noteRow?.kind === 'note',
    JSON.stringify(noteRow ?? noteOut))
  check('W11 · ⭐⭐ …and its REACH IS `none`, ⛔ not the pass\'s range — the occasion says WHEN it was formed, it does not make the reviewed material evidence FOR it',
    noteRow?.reach_kind === 'none' && noteRow?.reach_convo == null, JSON.stringify(noteRow))
  const lintN = await lintMemory(db, { userId: agent.id })
  check('W12 · …and it is therefore NOT reported as an undeclared write',
    !!noteRow?.id && !fired(lintN, 'writer-not-declared').includes(noteRow.id))

  // ⭐⭐ THE FAIL-CLOSED HALF, WHICH IS THE REASON THE CONTRACT IS `pass: true`. The read-only callers (the host service,
  // the chat route's Composer gather) construct WITHOUT an act. If one of them ever tried to write, it must REFUSE
  // loudly — ⛔ never quietly produce an unattributed row, which is the whole D1(b) defect.
  const saidBefore = said.length
  let refused = null
  try { refused = await buildReflection(fastify, { userId: agent.id }).addNote({ content: `${MARK} this note must never exist`, importance: 6 }) } catch (e) { refused = e }
  const leaked = await one(`SELECT id::text AS id FROM ${S}."txn_memories" WHERE user_id = $1::uuid AND content LIKE '${MARK} this note must never exist%'`, [agent.id])
  check('W13 · ⭐⭐⭐ a notes write with NO act is REFUSED — the read-only callers fail closed instead of leaking an unattributed row',
    !leaked?.id && (refused?.code === 'NO_ACT' || refused?.reason === 'pass-writer-without-act' || refused?.ok === false || /NO_ACT|pass must be claimed|pass-driven/i.test(String(refused?.message ?? refused?.error ?? ''))),
    JSON.stringify({ refused: String(refused?.code ?? refused?.message ?? JSON.stringify(refused)).slice(0, 160), leaked: leaked?.id ?? null }))
  // ⭐ AND THE REFUSAL IS AUDIBLE. The pipeline converts the store's throw into `{ ok: false }` for the caller, so the
  // RETURN VALUE alone would let a silent drop pass for a refusal. The warn carries the reason verbatim — assert it,
  // the way W2 asserts the undeclared-write warn, because "fails loudly" is the half Phase 3 will depend on.
  const refusalWarn = said.slice(saidBefore).filter((x) => /pass-driven|pass must be claimed|NO_ACT/i.test(String(x.o?.err ?? x.m ?? '')))
  check('W13b · ⭐⭐ …and the refusal is LOGGED with its reason — a silent drop and a refusal must not look alike',
    refusalWarn.length > 0, refusalWarn.length ? String(refusalWarn[0].o?.err ?? refusalWarn[0].m).slice(0, 140) : 'nothing was logged')

  // ⛔ AND THE LINT MUST NOW COVER THE NEW WRITER. `PASS_WRITERS` was a hand-written triple; a fourth pass writer would
  // have been SILENTLY EXEMPT from "a pass must be claimed before it writes" — a green rule over a writer nobody checks.
  // The store refuses to create such a row (W13), so the fixture is inserted as RAW SQL, on purpose, and removed below.
  const rawNote = await one(
    `INSERT INTO ${S}."txn_memories" (id, user_id, persona, namespace, kind, content, writer, source, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, NULL, 'default', 'note', '${MARK} raw undeclared-act note', 'notes', '${MARK}:raw', now(), now())
     RETURNING id::text AS id`, [agent.id])
  if (rawNote?.id) MADE.memories.push(rawNote.id)
  const lintP = await lintMemory(db, { userId: agent.id })
  check('W14 · ⭐⭐ the lint\'s pass-writer rule is DERIVED from the registry, so the new `notes` writer is covered — a hand-written list would have exempted it',
    fired(lintP, 'pass-writer-without-act').includes(rawNote?.id), JSON.stringify(rawNote))

  // ══ D9(a) · THE DISTILLER'S ACT — Ote's ruling, 2026-09-16 ════════════════════════════════════════════════════════
  //
  // *"Build the distiller act: job:<run-id>, with the existing per-conversation reviewed range as its reach. Do not
  // enable episodeDistillEnabled."* ⛔ The SETTING IS NOT TOUCHED — `force: true` is the existing "try it before you
  // enable the schedule" path, and the model is stubbed through the same injection seam `reflectScope` already had.
  // ⚠️⚠️ THE FIXTURE CONVERSATION IS DATED FORWARD, AND THAT IS A SAFETY MECHANISM, NOT A TRICK.
  // `distillAll` scans EVERY eligible conversation in the lookback window, for EVERY user. Run with the obvious
  // `lookbackDays: 1` it distilled three conversations and wrote a fixture episode into OTE'S OWN STORE — measured, on
  // 2026-09-16, which is exactly the fence `never test on his account` exists to prevent. The row was removed.
  // ⇒ the window is closed to a single row instead: `updated_at` in the future, `lookbackDays: 0` (cutoff = now), so the
  // ONLY conversation at or after the cutoff is this one. W15b then asserts the blast radius rather than trusting it.
  const convo = await one(`INSERT INTO ${S}."txn_conversations" (id, user_id, title, settings, created_at, updated_at)
                           VALUES (gen_random_uuid(), $1::uuid, '${MARK} distiller occasion', '{}'::jsonb, now(), now() + interval '1 hour') RETURNING id::text AS id`, [agent.id])
  MADE.conversations.push(convo.id)
  for (let i = 0; i < 6; i++) {
    await q(`INSERT INTO ${S}."txn_messages" (id, conversation_id, role, content, created_at, updated_at)
             VALUES (gen_random_uuid(), $1::uuid, $2, $3, now(), now())`,
    [convo.id, i % 2 ? 'assistant' : 'user', `${MARK} distiller turn ${i}`])
  }
  const span = await one(`SELECT min(rolling_id) AS lo, max(rolling_id) AS hi FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid`, [convo.id])
  // ⛔ EVERY user's rows, not just agent_dev's — the blast-radius assertion below is worthless if it can only see the
  // account the fixture belongs to. That is precisely how the first run's write into Ote's store went unnoticed.
  const before = new Set((await q(`SELECT id::text AS id FROM ${S}."txn_memories"`)).map((r) => r.id))
  const dist = await distillAll(fastify, {
    force: true, maxConvos: 50, lookbackDays: 0,
    llm: async () => `${MARK} they worked through the distiller occasion together`,
  })
  const newRows = (await q(`SELECT m.id::text AS id, m.user_id::text AS owner, u.username, m.writer, m.act_kind::text AS act_kind, m.act_id,
                                   m.reach_kind::text AS reach_kind, m.reach_conversation_id::text AS reach_convo,
                                   m.reach_from_rolling_id AS lo, m.reach_to_rolling_id AS hi, m.source
                              FROM ${S}."txn_memories" m LEFT JOIN ${S}."mst_users" u ON u.id = m.user_id`))
    .filter((r) => !before.has(r.id))
  for (const r of newRows) MADE.memories.push(r.id)   // whoever they belong to — the finally block removes them all
  const ep = newRows.find((r) => String(r.source || '').startsWith(`episode:${convo.id}`))
  check('W15b · ⛔⛔ THE BLAST RADIUS — the run wrote for agent_dev and NOBODY ELSE. ⛔ never test on his account',
    newRows.length > 0 && newRows.every((r) => r.owner === agent.id),
    JSON.stringify({ distilled: dist?.distilled, wrote: newRows.map((r) => `${r.username}:${String(r.source).slice(0, 28)}`) }))
  check('W15 · ⭐⭐⭐ the DISTILLER now declares itself — writer distiller · act job (the RUN id, minted once per run)',
    ep?.writer === 'distiller' && ep?.act_kind === 'job' && !!ep?.act_id,
    JSON.stringify({ distilled: dist?.distilled, skipped: dist?.skipped, reason: dist?.reason, ep }))
  check('W16 · ⭐⭐ …and its REACH is the range it ACTUALLY reviewed — the reviewed slice of THIS conversation, ⛔ not another\'s',
    ep?.reach_kind === 'range' && ep?.reach_convo === convo.id && Number(ep?.lo) === Number(span.lo) && Number(ep?.hi) === Number(span.hi),
    JSON.stringify({ ep, span }))
  const lintD = await lintMemory(db, { userId: agent.id })
  check('W17 · …and it is reported as neither an undeclared write nor a pass writer without an act',
    !!ep?.id && !fired(lintD, 'writer-not-declared').includes(ep.id) && !fired(lintD, 'pass-writer-without-act').includes(ep.id))
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
