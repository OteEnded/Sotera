// ⭐⭐⭐ REFLECTION GENERATION 4 — the citation instrument, LIVE through the real lane with a stubbed model.
//
//   node test/checks/reflection-generation-4-check.mjs
//
// `PLAN_SOTERA_REFLECTION_GENERATION_4_CITATION.md` §2 (C1–C6 · L). Written BEFORE the instrument existed. Every fixture is
// a zz_ conversation owned by agent_dev, removed at the end. ⛔ The live generation stays 3: this passes `generation: 4`
// explicitly, which only an experiment does. The model is a STUB — the instrument is judged here, not her judgement.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { initRetention } from '../../Backend/app/components/retention-host.js'
import { initLesson } from '../../Backend/app/components/lesson-host.js'
import { initOwnMemory } from '../../Backend/app/components/own-memory-host.js'
import { initToolLog } from '../../Backend/app/audit/tool-log.js'
import { attachToolAudit } from '../../Backend/app/components/runtime.js'
import { reflectOnConversation } from '../../Backend/app/components/reflection-lifecycle-host.js'
import { REFLECTION_GENERATION } from '../../Backend/app/components/reflection-lifecycle.js'
import { provenanceFor } from '../../Backend/app/components/memory-evidence.js'
import { lintMemory } from '../../Backend/app/components/memory-lint-host.js'

const { check, done } = makeChecker('reflection-generation-4')
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
initRetention(); initLesson(); initOwnMemory(); initToolLog(fastify, attachToolAudit)
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0]
const MARK = 'zz_gen4 '
const MADE = { conversations: [] }
const [agent] = await q(`SELECT id::text AS id FROM ${S}."mst_users" WHERE username = 'agent_dev'`)

// a six-line fixture: the ONLY user line with a distinctive verbatim span is line 3
const LINES = [
  ['user', `${MARK}I keep a small cactus on the sill.`],
  ['assistant', `${MARK}What kind?`],
  ['user', `${MARK}An astrophytum asterias, and I water it on Sundays only.`],
  ['assistant', `${MARK}Sundays only — noted.`],
  ['user', `${MARK}Also I drink genmaicha most evenings.`],
  ['assistant', `${MARK}Roasted, I imagine.`],
]
async function fixture(title) {
  const c = await one(`INSERT INTO ${S}."txn_conversations" (id, user_id, title, incognito, settings, created_at, updated_at)
                        VALUES (gen_random_uuid(), $1::uuid, $2, false, '{}'::jsonb, now() - interval '3 hours', now() - interval '2 hours') RETURNING id::text AS id`, [agent.id, `${MARK}${title}`])
  MADE.conversations.push(c.id)
  const ids = []
  for (const [role, content] of LINES) {
    const m = await one(`INSERT INTO ${S}."txn_messages" (id, conversation_id, role, content, created_at, updated_at)
                          VALUES (gen_random_uuid(), $1::uuid, $2, $3, now() - interval '2 hours', now() - interval '2 hours') RETURNING id::text AS id`, [c.id, role, content])
    ids.push(m.id)
  }
  return { cid: c.id, ids }
}
// a stub model: first round emits the given tool calls, second round says it is done
const LAST_TOOL_RESULTS = []
const stub = (calls, onOffer) => {
  let round = 0
  return async ({ messages, tools }) => {
    round++
    if (round === 2) LAST_TOOL_RESULTS.splice(0, LAST_TOOL_RESULTS.length, ...messages.filter((m) => m.role === 'tool').map((m) => String(m.content).slice(0, 300)))
    if (round === 1) {
      onOffer?.({ prompt: messages[0]?.content ?? '', tools: tools ?? [] })
      return { message: { content: '', tool_calls: calls.map((c) => ({ function: { name: c.name, arguments: c.args } })) }, doneReason: 'tool_calls' }
    }
    return { message: { content: 'Nothing further.' }, doneReason: 'stop' }
  }
}
const retainDef = (tools) => (tools ?? []).find((t) => t.function?.name === 'retain')?.function
const rowFor = async (cid) => one(`SELECT m.id::text AS id, m.writer, m.act_kind::text AS act_kind, m.act_id, m.reach_kind::text AS reach_kind, m.content
                                     FROM ${S}."txn_memories" m WHERE m.user_id = $1::uuid AND m.reach_conversation_id = $2::uuid ORDER BY m.created_at DESC LIMIT 1`, [agent.id, cid])
const ledgerFor = async (cid) => one(`SELECT id::text AS id, prompt_generation, outcome, wrote_memory_id::text AS wrote FROM ${S}."log_conversation_revisits" WHERE conversation_id = $1::uuid ORDER BY created_at DESC LIMIT 1`, [cid])

try {
  check('P0 · the live generation constant is still 3 — ⛔ this check never changes what production runs', REFLECTION_GENERATION === 3)

  // ══ C1 · a good citation: ordinal 3 (the account holder's line) + a verbatim quote ═══════════════════════════════
  const f1 = await fixture('C1 cite line 3')
  let offer1 = null
  const r1 = await reflectOnConversation(fastify, {
    conversationId: f1.cid, force: true, triggerSource: 'check', generation: 4,
    turn: stub([{ name: 'retain', args: { content: `${MARK}they water their cactus on Sundays only`, kind: 'note', mine: true, about: 'user', from: [3], quote: 'I water it on Sundays only' } }], (o) => { offer1 = o }),
  })
  check('C1a · the Gen-4 pass completed', r1?.ok === true, r1?.reason ?? '')
  check('C1b · ⭐ the transcript she saw is NUMBERED — `[1] user: …` through `[6]`, nothing else about a line changed',
    /(^|\n)\[1\] user: zz_gen4 I keep a small cactus/.test(offer1?.prompt ?? '') && /\n\[6\] assistant: zz_gen4 Roasted/.test(offer1?.prompt ?? '') && !/\[7\]/.test(offer1?.prompt ?? ''))
  check('C1c · ⭐ retain is offered WITH `from` and `quote`, both optional; nothing else in the offered set changed',
    !!retainDef(offer1?.tools)?.parameters?.properties?.from && !!retainDef(offer1?.tools)?.parameters?.properties?.quote
      && JSON.stringify(retainDef(offer1?.tools)?.parameters?.required) === JSON.stringify(['content', 'kind'])
      && (offer1?.tools ?? []).some((t) => t.function?.name === 'decline_to_remember'))
  check('C1d · ⛔ she is shown NO ids, NO rolling ids, NO dates — only ordinals', !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(offer1?.prompt ?? '') && !/rolling|\b20\d\d-\d\d-\d\d\b/.test(offer1?.prompt ?? ''))
  const row1 = await rowFor(f1.cid)
  const prov1 = row1 ? (await provenanceFor(db, [row1.id], { tz: 'Asia/Bangkok' })).get(row1.id) : null
  check('C1e · ⭐⭐⭐ the row is a reflection row (writer · revisit act · range reach) with ONE established, span-verified turn reference to line 3',
    row1?.writer === 'reflection' && row1?.act_kind === 'revisit' && row1?.reach_kind === 'range' && prov1?.established === true
      && prov1?.references.length === 1 && prov1.references[0].target === f1.ids[2] && prov1.references[0].verification?.how === 'span-verified',
    JSON.stringify(prov1?.references ?? row1))
  check('C1f · ⭐⭐ speaker = account-holder and said = the fixture day — the FIRST reflection row that can honestly carry a said',
    prov1?.references?.[0]?.speaker === 'account-holder' && /^\d{4}-\d{2}-\d{2}$/.test(prov1?.references?.[0]?.date ?? ''))
  const led1 = await ledgerFor(f1.cid)
  check('C6a · the ledger row carries prompt_generation 4 and links the memory it wrote', led1?.prompt_generation === 4 && led1?.wrote === row1?.id, JSON.stringify(led1))

  // ══ C2 · an ordinal outside the slice ⇒ ONE failed reference, the row still written ═════════════════════════════
  const f2 = await fixture('C2 ordinal out of range')
  const r2 = await reflectOnConversation(fastify, {
    conversationId: f2.cid, force: true, triggerSource: 'check', generation: 4,
    turn: stub([{ name: 'retain', args: { content: `${MARK}they like roasted tea`, kind: 'note', mine: true, about: 'user', from: [9] } }]),
  })
  const row2 = await rowFor(f2.cid)
  const prov2 = row2 ? (await provenanceFor(db, [row2.id], { tz: 'Asia/Bangkok' })).get(row2.id) : null
  check('C2 · ⭐⭐ from:[9] on a 6-line slice ⇒ the row is WRITTEN, provenance NOT established, ONE reference recorded as FAILED naming the ordinal',
    r2?.ok === true && !!row2 && prov2?.established === false && prov2?.references.length === 1 && prov2.references[0].established === false
      && prov2.references[0].verification?.how === 'failed' && /ordinal 9/.test(prov2.references[0].verification?.reason ?? ''),
    JSON.stringify(prov2?.references ?? r2))

  // ══ C3 · the quote is not in the cited line ⇒ failed, row written ══════════════════════════════════════════════
  const f3 = await fixture('C3 quote not in line')
  await reflectOnConversation(fastify, {
    conversationId: f3.cid, force: true, triggerSource: 'check', generation: 4,
    turn: stub([{ name: 'retain', args: { content: `${MARK}a misquote`, kind: 'note', mine: true, about: 'user', from: [1], quote: 'I water it on Sundays only' } }]),
  })
  const row3 = await rowFor(f3.cid)
  const prov3 = row3 ? (await provenanceFor(db, [row3.id], { tz: 'Asia/Bangkok' })).get(row3.id) : null
  check('C3 · a quote that is NOT in the cited line ⇒ failed reference ("span"), row written, not established',
    !!row3 && prov3?.established === false && prov3?.references.length === 1 && /span/.test(prov3.references[0].verification?.reason ?? ''), JSON.stringify(prov3?.references))

  // ══ C5 · the quote exists in an UNCITED line ⇒ still failed — ⛔ no search beyond what she cited ═════════════════
  const f5 = await fixture('C5 quote elsewhere')
  await reflectOnConversation(fastify, {
    conversationId: f5.cid, force: true, triggerSource: 'check', generation: 4,
    turn: stub([{ name: 'retain', args: { content: `${MARK}cites the wrong line`, kind: 'note', mine: true, about: 'user', from: [5], quote: 'I water it on Sundays only' } }]),
  })
  const row5 = await rowFor(f5.cid)
  const prov5 = row5 ? (await provenanceFor(db, [row5.id], { tz: 'Asia/Bangkok' })).get(row5.id) : null
  check('C5 · ⭐⭐ the quote is verbatim in line 3 but she cited line 5 ⇒ FAILED — the host never searches other lines for her',
    !!row5 && prov5?.established === false && prov5?.references.length === 1 && prov5.references[0].target === f5.ids[4], JSON.stringify(prov5?.references))

  // ══ C4 · Generation 3 on the same material ⇒ byte-identical to today: no numbers, no fields, no references ════════
  const f4 = await fixture('C4 generation 3 control')
  let offer4 = null
  const r4 = await reflectOnConversation(fastify, {
    conversationId: f4.cid, force: true, triggerSource: 'check',
    turn: stub([{ name: 'retain', args: { content: `${MARK}gen 3 note`, kind: 'note', mine: true, about: 'user' } }], (o) => { offer4 = o }),
  })
  const row4 = await rowFor(f4.cid)
  const prov4 = row4 ? (await provenanceFor(db, [row4.id], { tz: 'Asia/Bangkok' })).get(row4.id) : null
  check('C4a · ⭐⭐⭐ with no generation argument the lane runs Generation 3: transcript UNnumbered, retain WITHOUT from/quote',
    r4?.ok === true && /(^|\n)user: zz_gen4 I keep a small cactus/.test(offer4?.prompt ?? '') && !/\[1\]/.test(offer4?.prompt ?? '')
      && !retainDef(offer4?.tools)?.parameters?.properties?.from && !retainDef(offer4?.tools)?.parameters?.properties?.quote)
  check('C4b · and its row is exactly today\'s: reflection · revisit · range · ZERO references · not established',
    row4?.writer === 'reflection' && row4?.act_kind === 'revisit' && prov4?.references.length === 0 && prov4?.established === false, row4 ? '' : `no row; tool results: ${LAST_TOOL_RESULTS.join(' | ')}`)
  const led4 = await ledgerFor(f4.cid)
  check('C6b · its ledger row carries prompt_generation 3 — the two arms are separable by construction', led4?.prompt_generation === 3)

  // ══ C7 · a retain WITHOUT from under Generation 4 ⇒ same as Generation 3 (no reference, not established) ══════════
  const f7 = await fixture('C7 gen 4 without citation')
  await reflectOnConversation(fastify, {
    conversationId: f7.cid, force: true, triggerSource: 'check', generation: 4,
    turn: stub([{ name: 'retain', args: { content: `${MARK}uncited under gen 4`, kind: 'note', mine: true, about: 'user' } }]),
  })
  const row7 = await rowFor(f7.cid)
  const prov7 = row7 ? (await provenanceFor(db, [row7.id], { tz: 'Asia/Bangkok' })).get(row7.id) : null
  check('C7 · Gen 4 without `from` writes exactly a Gen-3-shaped row — the affordance is optional in fact, not only in schema',
    !!row7 && prov7?.references.length === 0 && prov7?.established === false)

  // ══ C8 · a FACT with a citation reaches the store through the observation pipeline with its reference ═════════════
  const f8 = await fixture('C8 fact cites line 5')
  await reflectOnConversation(fastify, {
    conversationId: f8.cid, force: true, triggerSource: 'check', generation: 4,
    turn: stub([{ name: 'retain', args: { content: 'genmaicha', kind: 'fact', mine: true, about: 'user', about: 'user', attribute: `${MARK}evening tea`, from: [5], quote: 'genmaicha' } }]),
  })
  const row8 = await one(`SELECT m.id::text AS id, m.writer, m.act_kind::text AS act_kind FROM ${S}."txn_memories" m WHERE m.user_id = $1::uuid AND m.attribute = $2 ORDER BY m.created_at DESC LIMIT 1`, [agent.id, `${MARK}evening tea`])
  const prov8 = row8 ? (await provenanceFor(db, [row8.id], { tz: 'Asia/Bangkok' })).get(row8.id) : null
  check('C8 · ⭐ a cited FACT (reconcileFact path) carries its established turn reference too — the pipeline did not drop it',
    row8?.writer === 'reflection' && prov8?.established === true && prov8?.references.length === 1 && prov8.references[0].target === f8.ids[4], JSON.stringify(prov8?.references ?? row8))

  // ══ L · lint: reflection references are writer-cited/span-verified — never a declared coincidence ═════════════════
  const lint = await lintMemory(db, { userId: agent.id })
  const fired = (rep, id) => (rep.owners ?? []).flatMap((o) => o.findings ?? []).filter((f) => f.rule === id).map((f) => f.id)
  const mine = [row1, row2, row3, row4, row5, row7, row8].filter(Boolean).map((r) => r.id)
  check('L · coincidence-without-contract fires on none of these rows; pass-writer-without-act fires on none (every pass carried its act)',
    !fired(lint, 'coincidence-without-contract').some((id) => mine.includes(id)) && !fired(lint, 'pass-writer-without-act').some((id) => mine.includes(id)))
} finally {
  // ── cleanup: memories written for these conversations, their references (cascade), ledger rows, messages, conversations ──
  if (MADE.conversations.length) {
    await q(`DELETE FROM ${S}."txn_memories" WHERE user_id = $1::uuid AND (reach_conversation_id = ANY($2::uuid[]) OR content LIKE 'zz_gen4%' OR attribute LIKE 'zz_gen4%')`, [agent.id, MADE.conversations])
    await q(`DELETE FROM ${S}."log_retention_decisions" WHERE conversation_id = ANY($1::uuid[])`, [MADE.conversations]).catch(() => {})
    await q(`DELETE FROM ${S}."log_conversation_revisits" WHERE conversation_id = ANY($1::uuid[])`, [MADE.conversations])
    await q(`DELETE FROM ${S}."txn_messages" WHERE conversation_id = ANY($1::uuid[])`, [MADE.conversations])
    await q(`DELETE FROM ${S}."txn_conversations" WHERE id = ANY($1::uuid[])`, [MADE.conversations])
  }
  await pg.end()
}
done()
