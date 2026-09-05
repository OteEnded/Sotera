// ⭐⭐⭐ THE VOLUNTEERED RECAP — the model arm of ② R-C, built around the incident that actually happened.
//
//   node test/pipeline/volunteered-recap.mjs            (RECAP_RUNS=6 by default; needs her on :8210)
//
// Ote, 2026-09-05: *"Include at least one case where the model is given a natural conversation and
// volunteers a recap… without the user explicitly asking for temporal history. That's the failure mode we
// actually observed. The test should verify that if she voluntarily constructs a temporal heading, the
// evidence underneath that heading satisfies the merge rule."*
//
// ── WHAT IS RECORDED vs WHAT IS ASSERTED ─────────────────────────────────────────────────────────────
//   RECORDED  recap rate · temporal-heading rate · tools chosen · routing observed   ⛔ never pass/fail
//             (Ote: "N ≥ 6 is an observation minimum, not a correctness threshold.")
//   ASSERTED  ⭐⭐⭐ THE MERGE RULE, for every temporal heading she volunteers: an OLD marker under a
//             "today/tonight" heading is a FAIL. UNMAPPED items are counted and printed, never folded in.
//
// ── THE FIXTURE (agent_dev, ⛔ never Ote's account; `zx7` on everything written; all removed) ─────────
//   OLD EVIDENCE   a fixture conversation with ONE turn BACKDATED 26 days, and three memories written
//                  THROUGH THE STORE with sourceMessageId = that turn — so `when = {said, 26 days ago}`
//                  by the real ① mechanism, ⛔ not by hand. Markers: kalimba · ocarina · genmaicha.
//   TODAY'S        the live conversation itself: tram · lantern.
// ⛔ NO HINTS: no turn says recap / summary / what did we / today / discussed / retrieve / memory.
//   T3 mentions the kalimba in passing so old memory becomes RELEVANT without being asked for; T5 is a
//   CLOSING CUE, not a question — the shape that preceded "let me check what we actually discussed".
import { writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig, setDB } from '../../Backend/lib/utility.js'
import { initDB } from '../../Backend/database/index.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryV2 } from '../../Backend/app/components/memory-v2-host.js'
import { judgeReply } from '../lib/merge-rule.mjs'

const RUNS = Math.max(1, Number(process.env.RECAP_RUNS) || 6)
const OLD_DAYS = 26
const TZ = 'Asia/Bangkok'
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
const pg = devPg(); await pg.connect()
const S = `"${devSchema()}"`
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const out = { at: new Date().toISOString(), runs: RUNS, fixture: {}, results: [], rates: {}, mergeRule: { headings: 0, pass: 0, fail: 0, unmapped: 0 }, verdict: null }
const say = (s) => console.log(s)

const [agent] = await q(`SELECT id::text AS id FROM ${S}."mst_users" WHERE username = 'agent_dev'`)
if (!agent) { console.error('✖ agent_dev does not exist'); process.exit(1) }
const AGENT = agent.id
const today = (await q(`SELECT (now() AT TIME ZONE '${TZ}')::date::text AS d`))[0].d
const oldDate = (await q(`SELECT ((now() - interval '${OLD_DAYS} days') AT TIME ZONE '${TZ}')::date::text AS d`))[0].d
const runStart = new Date()

// ⛔ THE HINT GUARD — a turn that names the thing being measured invalidates the arm.
const HINT = /\b(recap|summar|what did we|what have we|today|discussed|retrieve|memory|memories|remember)\b/i
const TURNS = [
  'hey, long day. finally sitting down.',
  'funny thing happened on the tram this evening — a kid was conducting the whole carriage like an orchestra and half of us started humming along. made my week.',
  'also I picked up the kalimba again after ages, the little one. fingers remembered more than I expected.',
  'thinking of hanging a paper lantern on the balcony this weekend, the orange kind. need to find where I put the hook.',
  "ok, that's me for tonight. thanks for keeping me company.",
]
for (const t of TURNS) {
  const m = t.replace(/\btonight\b/i, '').match(HINT) // "tonight" in the closing cue is the incident's own word and is allowed
  if (m) { console.error(`✖ a turn hints at the measurement: "${m[0]}" in "${t}"`); process.exit(2) }
}

const fixtureIds = { conversationId: null, messageId: null, memoryIds: [] }
const probeConversations = []

async function cleanup() {
  try {
    await q(`DELETE FROM ${S}."txn_memories" WHERE user_id = $1::uuid AND (content ILIKE '%zx7%' OR value ILIKE '%zx7%' OR (created_at >= $2 AND (content ~* 'kalimba|ocarina|genmaicha|tram|lantern' OR value ~* 'kalimba|ocarina|genmaicha|tram|lantern')))`, [AGENT, runStart])
    if (fixtureIds.messageId) await q(`DELETE FROM ${S}."txn_messages" WHERE id = $1::uuid`, [fixtureIds.messageId])
    if (fixtureIds.conversationId) await q(`DELETE FROM ${S}."txn_conversations" WHERE id = $1::uuid`, [fixtureIds.conversationId])
    for (const cid of probeConversations) {
      await q(`DELETE FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid`, [cid])
      await q(`DELETE FROM ${S}."txn_conversations" WHERE id = $1::uuid`, [cid])
    }
    say(`\n  cleanup: fixture + ${probeConversations.length} probe conversation(s) removed; zx7 / marker memories on agent_dev removed`)
  } catch (e) { console.error(`  ⚠️ cleanup incomplete: ${e.message}`) }
}

try {
  // ══ FIXTURE · OLD EVIDENCE, dated by the real mechanism ═══════════════════════════════════════════════
  say(`══ FIXTURE · old evidence said ${oldDate} (${OLD_DAYS} days ago) · today is ${today} ══`)
  fixtureIds.conversationId = randomUUID()
  fixtureIds.messageId = randomUUID()
  await q(`INSERT INTO ${S}."txn_conversations" (id, user_id, title, settings, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, 'zz_recap_old_evidence (zx7)', '{"probe":true}'::jsonb, now() - interval '${OLD_DAYS} days', now() - interval '${OLD_DAYS} days')`, [fixtureIds.conversationId, AGENT])
  await q(`INSERT INTO ${S}."txn_messages" (id, conversation_id, role, content, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, 'user', 'zx7 fixture: I play the kalimba and the ocarina; lately mostly the ocarina. My tea is genmaicha.', now() - interval '${OLD_DAYS} days', now() - interval '${OLD_DAYS} days')`, [fixtureIds.messageId, fixtureIds.conversationId])
  const memOld = buildMemoryV2(fastify, { userId: AGENT, sourceMessageId: fixtureIds.messageId })
  for (const content of [
    'zx7: the user plays the kalimba and the ocarina',
    'zx7: lately the user mostly plays the ocarina',
    'zx7: the user\'s tea is genmaicha',
  ]) {
    const r = await memOld.remember({ content, kind: 'semantic', importance: 6 })
    if (!r?.id) { console.error(`✖ fixture memory not written: ${JSON.stringify(r)}`); process.exit(1) }
    fixtureIds.memoryIds.push(r.id)
  }
  // ⭐ PRECONDITION · the fixture is dated `said <oldDate>` BY THE REAL ① MECHANISM, and matched by the R-C window
  const check = await memOld.list({ window: { on: oldDate } })
  const fixtureRows = check.memories.filter((m) => fixtureIds.memoryIds.includes(m.id))
  const dated = fixtureRows.every((m) => m.when?.basis === 'said' && m.when?.date === oldDate && m.window === 'matched')
  say(`  fixture memories: ${fixtureRows.length}/3 · when=${JSON.stringify(fixtureRows.map((m) => m.when))} · window=${JSON.stringify(check.window)}`)
  if (fixtureRows.length !== 3 || !dated) { console.error('✖ PRECONDITION FAILED: the fixture is not dated by the real mechanism — aborting rather than measuring a broken instrument'); await cleanup(); process.exit(1) }
  out.fixture = { oldDate, memoryIds: fixtureIds.memoryIds, window: check.window }

  // ⭐ THE EVIDENCE the detector maps items to — words, not tool results (results are clipped at 4,000 chars)
  const EVIDENCE = [
    { id: 'old:kalimba', kind: 'memory', date: oldDate, anchor: /kalimba/i },
    { id: 'old:ocarina', kind: 'memory', date: oldDate, anchor: /ocarina/i },
    { id: 'old:genmaicha', kind: 'memory', date: oldDate, anchor: /genmaicha/i },
    { id: 'today:tram', kind: 'transcript', date: today, anchor: /\btram\b|carriage|orchestra|humming/i },
    { id: 'today:lantern', kind: 'transcript', date: today, anchor: /lantern|balcony/i },
  ]

  // ══ THE RUNS ═════════════════════════════════════════════════════════════════════════════════════════
  const call = makeClient()
  const login = await call('u', 'POST', '/v1/auth/login', { username: 'agent_dev', password: 'agentdev123' })
  if (login.status !== 200) { console.error(`✖ login failed (${login.status})`); await cleanup(); process.exit(1) }

  for (let run = 1; run <= RUNS; run++) {
    say(`\n══ RUN ${run}/${RUNS} ══`)
    const created = await call('u', 'POST', '/v1/chat/conversations', {
      title: `zz_recap_probe_${run} (zx7)`, model: config.chat?.defaultModel,
      settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true }, probe: true },
    })
    const cid = created.json?.conversation?.id
    if (!cid) { say(`  ✖ conversation not created (${created.status})`); out.results.push({ run, error: `create ${created.status}` }); continue }
    probeConversations.push(cid)
    for (const t of TURNS) {
      const r = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: t, stream: false })
      if (r.status >= 300) say(`  ⚠️ turn returned ${r.status}`)
    }
    await new Promise((r) => setTimeout(r, 4000))
    const msgs = await q(`SELECT role, content, tool_calls, (created_at AT TIME ZONE '${TZ}')::date::text AS d FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid ORDER BY created_at`, [cid])
    const assistants = msgs.filter((m) => m.role === 'assistant')
    const tools = assistants.flatMap((m) => (Array.isArray(m.tool_calls) ? m.tool_calls : []).map((t) => t?.name ?? t?.function?.name).filter(Boolean))
    // ⭐ EVERY assistant turn is judged — a volunteered recap can come at any point, not only at the end.
    const judged = assistants.map((m) => ({ d: m.d, ...judgeReply(m.content, { replyDate: m.d, evidence: EVIDENCE }) }))
    const headings = judged.flatMap((j) => j.headings)
    const recapLike = assistants.some((m) => /what we (talked|spoke) about|let me check what we|here'?s what we|to recap|recap/i.test(m.content))
    const rec = {
      run, cid, assistantTurns: assistants.length, tools, recapLike, temporalHeadings: headings.length,
      routing: tools.some((t) => t === 'retrieve_conversations') ? 'conversation' : tools.some((t) => /recall_memory|list_memories/.test(t)) ? 'memory' : tools.length ? 'other' : 'none',
      verdicts: headings.map((h) => ({ line: h.line, from: h.from, verdict: h.verdict, counts: h.counts, outside: h.outside.map((it) => [it.evidenceId, it.date, it.text.slice(0, 70)]) })),
      lastReply: assistants.at(-1)?.content?.slice(0, 600) ?? '',
    }
    out.results.push(rec)
    for (const h of headings) { out.mergeRule.headings += 1; out.mergeRule[h.verdict.toLowerCase()] += 1 }
    say(`  tools: ${tools.join(', ') || '(none)'}   routing[observed]: ${rec.routing}   recap-like: ${recapLike}   temporal headings: ${headings.length}`)
    for (const v of rec.verdicts) say(`   heading "${v.line.slice(0, 60)}" claims ${v.from} → ${v.verdict} ${JSON.stringify(v.counts)}${v.outside.length ? ' ⛔ ' + JSON.stringify(v.outside) : ''}`)
  }

  // ══ REPORT · rates are OBSERVATIONS; the merge rule is the only assertion ════════════════════════════
  const done = out.results.filter((r) => !r.error)
  out.rates = {
    completedRuns: done.length,
    recapLike: done.filter((r) => r.recapLike).length,
    temporalHeading: done.filter((r) => r.temporalHeadings > 0).length,
    routing: Object.fromEntries(['conversation', 'memory', 'other', 'none'].map((k) => [k, done.filter((r) => r.routing === k).length])),
  }
  say(`\n${'═'.repeat(84)}\nOBSERVED (⛔ not pass/fail) over ${done.length} runs: recap-like ${out.rates.recapLike} · temporal heading ${out.rates.temporalHeading} · routing ${JSON.stringify(out.rates.routing)}`)
  say(`MERGE RULE over ${out.mergeRule.headings} volunteered temporal heading(s): PASS ${out.mergeRule.pass} · FAIL ${out.mergeRule.fail} · UNMAPPED ${out.mergeRule.unmapped}`)
  out.verdict = out.mergeRule.fail ? 'FAIL' : (out.mergeRule.headings ? 'PASS' : 'NO-HEADING-OBSERVED')
  say(out.verdict === 'FAIL' ? '✖ MERGE RULE VIOLATED — an old item under a today/tonight heading'
    : out.verdict === 'PASS' ? '✓ every volunteered temporal heading satisfied the merge rule'
      : 'ⓘ no temporal heading was volunteered in these runs — nothing to assert; that is an observation, not a pass')
} finally {
  await cleanup()
  const file = new URL('../results/volunteered-recap.json', import.meta.url)
  writeFileSync(file, JSON.stringify(out, null, 2), 'utf8')
  say(`  wrote ${file.pathname.replace(/^\//, '')}`)
  await pg.end()
}
process.exit(out.verdict === 'FAIL' ? 1 : 0)
