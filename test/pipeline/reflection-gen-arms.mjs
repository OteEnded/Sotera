// ⭐⭐⭐ THE THREE-ARM DECOMPOSITION — which HALF of Generation 4 moved her, and can the affordance reach her alone?
//
//   node test/pipeline/reflection-gen-arms.mjs --dry     print the design and the corpus, run nothing
//   node test/pipeline/reflection-gen-arms.mjs           run (resume-safe: sources already done are skipped)
//   node test/pipeline/reflection-gen-arms.mjs --reharvest   re-read the DB for every recorded clone; run nothing
//
// `GATE_SOTERA_PROVENANCE_NEXT_DECISIONS.md` §4②, ratified by Ote 2026-09-15. Generation 4 moved TWO things at once and
// can only be seen as their sum: retains/pass 0.40 → 0.70, mean content 252 → 103 chars, and **0 citations in 14 retains**.
//
//   arm 3   generation 3 — plain transcript, retain unchanged            the live control
//   arm N   generation 5 — NUMBERED transcript, retain unchanged         does the numbering alone move retention?
//   arm C   generation 6 — plain transcript, retain WITH from/quote      can the affordance reach her WITHOUT numbering?
//
// ⭐ THE PRE-REGISTERED READING OF ARM C, FIXED BEFORE THE RUN: if C again yields ZERO citations, that is evidence of a
// SALIENCE/MECHANISM problem — ⛔ NOT an invitation to keep improving the field. (Ote, 2026-09-15.) An affordance she does
// not reach for under either presentation is not a wording defect; it is the `retention-salience-unresolved` wall again.
//
// ⛔ SAME FROZEN CORPUS, LITERALLY: the source ids are READ from the first experiment's record, ⛔ not re-derived by the
// same query — the corpus has grown since (the earlier run's own clones are now agent_dev conversations, and re-deriving
// would quietly clone a clone). ⛔ Never Ote's account. Clones are backdated 4 days so the live cron cannot claim them.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')
const OUT = new URL('../results/reflection-gen-arms.json', import.meta.url)
const PRIOR = new URL('../results/reflection-gen4-ab.json', import.meta.url)
const ARMS = [{ id: '3', generation: 3, what: 'control — plain transcript, retain unchanged' },
  { id: 'N', generation: 5, what: 'numbered transcript, retain unchanged' },
  { id: 'C', generation: 6, what: 'plain transcript, retain WITH from/quote' }]
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0]
const say = (s) => console.log(s)

const { loadConfig, setDB } = await import('../../Backend/lib/utility.js')
const { initDB } = await import('../../Backend/database/index.js')
const { initSettings } = await import('../../Backend/app/settings/index.js')
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
const { initRetention } = await import('../../Backend/app/components/retention-host.js')
const { initLesson } = await import('../../Backend/app/components/lesson-host.js')
const { initOwnMemory } = await import('../../Backend/app/components/own-memory-host.js')
const { initCorrections } = await import('../../Backend/app/components/corrections-host.js').catch(() => ({ initCorrections: null })) ?? {}
const { initToolLog } = await import('../../Backend/app/audit/tool-log.js')
const { attachToolAudit } = await import('../../Backend/app/components/runtime.js')
initRetention(); initLesson(); initOwnMemory(); initToolLog(fastify, attachToolAudit)
if (typeof initCorrections === 'function') initCorrections()
const { reflectOnConversation } = await import('../../Backend/app/components/reflection-lifecycle-host.js')
const { REFLECTION_GENERATION, generationSpec } = await import('../../Backend/app/components/reflection-lifecycle.js')
// ⚠️⚠️ STALE PREMISE SINCE 2026-09-18. These arms measure 4/5/6 against a GEN 3 control that WAS
// production. Production is now GEN 7 (gen 3 + the retention-ownership clause), so "the control" and
// "what runs live" are no longer the same instrument. ⛔ The comparison is not invalid — it is
// UN-REBASED, and re-basing it is a decision, ⛔ not an edit. ⇒ refuse, and say which it is.
if (REFLECTION_GENERATION !== 3) {
  console.error(`⛔ the live generation is ${REFLECTION_GENERATION}, not 3 — these arms presume Gen 3 is production.`)
  console.error('  Gen 3 is now the HISTORICAL control. Re-base the arms against the live generation before running.')
  process.exit(2)
}
if (config?.memory?.reflectionEnabled !== true) { console.error('⛔ memory.reflectionEnabled is not true'); process.exit(2) }
for (const a of ARMS) generationSpec(a.generation)   // ⛔ fail here, not 40 passes in, if a generation is undeclared

const agent = await one(`SELECT id::text AS id FROM ${S}."mst_users" WHERE username = 'agent_dev'`)
const results = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { design: null, startedAt: new Date().toISOString(), runs: [] }
const save = () => writeFileSync(OUT, JSON.stringify(results, null, 2))

// ── the frozen corpus: the SAME source ids the first experiment used ──
const prior = JSON.parse(readFileSync(PRIOR, 'utf8'))
const sourceIds = [...new Set(prior.pairs.map((p) => p.source))]
const sources = await q(`SELECT cv.id::text AS id, cv.title, count(m.id)::int AS n, sum(length(m.content))::int AS chars
                           FROM ${S}."txn_conversations" cv JOIN ${S}."txn_messages" m ON m.conversation_id = cv.id
                          WHERE cv.id = ANY($1::uuid[]) GROUP BY cv.id ORDER BY count(m.id) DESC`, [sourceIds])
if (sources.length !== sourceIds.length) { console.error(`⛔ ${sourceIds.length - sources.length} of the frozen sources are GONE — the corpus is not the same; refusing to substitute`); process.exit(3) }
results.design = {
  arms: Object.fromEntries(ARMS.map((a) => [a.id, `generation ${a.generation} — ${a.what}`])),
  corpus: 'the same source ids as reflection-gen4-ab.json, read from its record',
  sources: sources.length, model: config?.memory?.reflectionModel ?? '(chat.defaultModel)',
  triggerSource: 'manual', cloneUpdatedAt: 'now() - 4 days (outside the cron lookback)',
  armOrderRotates: true,
  preRegistered: 'if arm C yields 0 citations, that is a salience/mechanism finding — ⛔ not a reason to reword the field',
}
say(`══ THREE-ARM DECOMPOSITION · ${sources.length} sources × ${ARMS.length} arms = ${sources.length * ARMS.length} passes · ${DRY ? 'DRY' : 'RUNNING'} ══`)
for (const a of ARMS) say(`  arm ${a.id}  generation ${a.generation}  ${a.what}`)
if (DRY) { for (const s of sources) say(`  ${s.id.slice(0, 8)}  msgs=${String(s.n).padStart(3)}  ${String(s.title ?? '').slice(0, 42)}`); save(); await pg.end(); process.exit(0) }

async function clone(src, armId) {
  const c = await one(`INSERT INTO ${S}."txn_conversations" (id, user_id, title, incognito, settings, created_at, updated_at)
                        VALUES (gen_random_uuid(), $1::uuid, $2, false, $3::jsonb, now() - interval '4 days', now() - interval '4 days') RETURNING id::text AS id`,
  [agent.id, `zz_arms ${armId} ${src.id.slice(0, 8)}`, JSON.stringify({ experiment: 'gen-arms', arm: armId, source: src.id })])
  await q(`INSERT INTO ${S}."txn_messages" (id, conversation_id, role, content, created_at, updated_at)
           SELECT gen_random_uuid(), $2::uuid, role, content, created_at, created_at FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid ORDER BY rolling_id`, [src.id, c.id])
  return c.id
}
async function waitForQuiet() {
  for (;;) {
    const busy = await one(`SELECT role, extract(epoch FROM (now() - created_at))::int AS ago FROM ${S}."txn_messages"
                             WHERE conversation_id NOT IN (SELECT id FROM ${S}."txn_conversations" WHERE title LIKE 'zz_%')
                             ORDER BY created_at DESC LIMIT 1`)
    if (!(busy && busy.role === 'user' && busy.ago < 180)) return
    say(`  ⏸ a user message landed ${busy.ago}s ago with no answer — interaction has priority; waiting 60 s`)
    await new Promise((r) => setTimeout(r, 60_000))
  }
}
async function harvest(cid) {
  const ledger = await one(`SELECT id::text AS id, prompt_generation, outcome, failure, tools_used, tools_refused, messages_considered,
                                   length(text)::int AS text_chars, wrote_memory_id::text AS wrote
                              FROM ${S}."log_conversation_revisits" WHERE conversation_id = $1::uuid ORDER BY created_at DESC LIMIT 1`, [cid])
  const calls = await q(`SELECT tool, ok, arg_keys, error FROM ${S}."log_tool_calls" WHERE conversation_id = $1::uuid ORDER BY created_at`, [cid])
  const rows = await q(`SELECT m.id::text AS id, m.kind, m.content, m.entity, m.attribute, m.value, m.writer, m.act_kind::text AS act_kind, m.reach_kind::text AS reach_kind,
                               (SELECT json_agg(json_build_object('kind', e.ref_kind, 'target', e.target, 'span', e.span, 'established', e.established,
                                                                  'how', e.verification->>'how', 'reason', e.verification->>'reason', 'role', x.role) ORDER BY e.rolling_id)
                                  FROM ${S}."txn_memory_evidence" e LEFT JOIN ${S}."txn_messages" x ON x.id::text = e.target WHERE e.memory_id = m.id) AS refs
                          FROM ${S}."txn_memories" m
                         WHERE m.user_id = $2::uuid AND (m.reach_conversation_id = $1::uuid
                            OR m.id IN (SELECT d.memory_id FROM ${S}."log_retention_decisions" d WHERE d.conversation_id = $1::uuid AND d.memory_id IS NOT NULL))
                         ORDER BY m.created_at`, [cid, agent.id])
  const decisions = await q(`SELECT kind, mine, state, why FROM ${S}."log_retention_decisions" WHERE conversation_id = $1::uuid ORDER BY created_at`, [cid])
  return { ledger, calls, rows, decisions }
}

if (argv.includes('--reharvest')) {
  for (const r of results.runs) r.harvest = await harvest(r.conversationId)
  save(); say(`re-harvested ${results.runs.length} runs — nothing run`); await pg.end(); process.exit(0)
}

for (let i = 0; i < sources.length; i++) {
  const src = sources[i]
  if (ARMS.every((a) => results.runs.some((r) => r.source === src.id && r.arm === a.id && r.harvest))) { say(`  ${i + 1}/${sources.length} · ${src.id.slice(0, 8)} already done — skipped`); continue }
  // ⭐ rotate the arm order per source so no arm is systematically first (model warmth, queue state)
  const order = ARMS.map((_, k) => ARMS[(k + i) % ARMS.length])
  for (const a of order) {
    if (results.runs.some((r) => r.source === src.id && r.arm === a.id && r.harvest)) continue
    await waitForQuiet()
    const cid = await clone(src, a.id)
    const t0 = Date.now()
    let res
    try { res = await reflectOnConversation(fastify, { conversationId: cid, force: true, triggerSource: 'manual', generation: a.generation }) }
    catch (e) { res = { ok: false, error: e?.message } }
    const ms = Date.now() - t0
    const h = await harvest(cid)
    results.runs = results.runs.filter((r) => !(r.source === src.id && r.arm === a.id))
      .concat([{ source: src.id, sourceTitle: src.title, messages: src.n, arm: a.id, generation: a.generation, conversationId: cid, ms,
        result: { ok: res?.ok ?? false, skipped: res?.skipped ?? false, reason: res?.reason ?? res?.error ?? null, promptGeneration: res?.promptGeneration ?? null }, harvest: h }])
    const citing = h.calls.filter((c) => c.tool === 'retain' && (c.arg_keys ?? []).includes('from')).length
    say(`  ${i + 1}/${sources.length} · ${src.id.slice(0, 8)} · arm ${a.id} (gen ${a.generation}) · ${Math.round(ms / 1000)}s · ok=${res?.ok} · retains=${h.calls.filter((c) => c.tool === 'retain').length} · citing=${citing} · rows=${h.rows.length}`)
    save()
  }
}
results.finishedAt = new Date().toISOString()
save()
say(`\n✓ ${results.runs.length} runs recorded → ${OUT.pathname}`)
await pg.end()
process.exit(0)
