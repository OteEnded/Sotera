// ⭐⭐⭐ REFLECTION GENERATION 4 — THE PRE-REGISTERED A/B. `PLAN_SOTERA_REFLECTION_GENERATION_4_CITATION.md` §3.
//
//   node test/pipeline/reflection-gen4-ab.mjs --dry            print the design and the pairs, run nothing
//   node test/pipeline/reflection-gen4-ab.mjs                  run (resume-safe: pairs already run are skipped)
//   node test/pipeline/reflection-gen4-ab.mjs --pairs 20       N per arm (default 20)
//   node test/pipeline/reflection-gen4-ab.mjs --reharvest      re-read the DB for every recorded clone; run nothing
//
// ── DESIGN ────────────────────────────────────────────────────────────────────────────────────────────
// A/B by GENERATION on FROZEN material: each source conversation (agent_dev, ⛔ never his account) is CLONED twice; clone A
// is reflected under Generation 3, clone B under Generation 4, through the REAL lane with the REAL model. Two clones because
// one conversation can be reviewed once per watermark; identical material is what makes the pair a pair.
// Clones carry `updated_at` four days back so the LIVE cron (48 h lookback) never claims them; `force: true` bypasses the
// quiet timer and nothing else (the same bypass `reflect-now.mjs` makes). trigger_source = 'manual' — ⛔ not the P1 population.
// Run order alternates (3-then-4, 4-then-3) so model warmth does not favour one arm.
//
// ── WHAT IS RECORDED, PER PASS ─────────────────────────────────────────────────────────────────────────
// the ledger row · every tool call (name, ok, arg_keys — `from`/`quote` present or not) · every memory row written
// (kind, content, attribute) with its references (established, how, reason, speaker, date) · retention decisions · timing.
// Written incrementally to test/results/reflection-gen4-ab.json. ⛔ Nothing here judges; the report script does, against the
// pre-registered falsifiers, and Ote hears the blind pairs first.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')
const N = Number(argv[argv.indexOf('--pairs') + 1] || 20) || 20
const OUT = new URL('../results/reflection-gen4-ab.json', import.meta.url)
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
const { REFLECTION_GENERATION } = await import('../../Backend/app/components/reflection-lifecycle.js')
if (REFLECTION_GENERATION !== 3) { console.error('⛔ the live generation is not 3 — the experiment presumes Gen 3 is what production runs'); process.exit(2) }
if (config?.memory?.reflectionEnabled !== true) { console.error('⛔ memory.reflectionEnabled is not true'); process.exit(2) }

const agent = await one(`SELECT id::text AS id FROM ${S}."mst_users" WHERE username = 'agent_dev'`)
const results = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { design: null, startedAt: new Date().toISOString(), pairs: [] }
const save = () => writeFileSync(OUT, JSON.stringify(results, null, 2))

// ── SOURCES · the N largest agent_dev conversations (≥ 6 messages), excluding earlier clones ──
const sources = await q(`
  SELECT cv.id::text AS id, cv.title, count(m.id)::int AS n, sum(length(m.content))::int AS chars
    FROM ${S}."txn_conversations" cv JOIN ${S}."txn_messages" m ON m.conversation_id = cv.id
   WHERE cv.user_id = $1::uuid AND coalesce(cv.title, '') NOT LIKE 'zz_gen4ab%'
   GROUP BY cv.id HAVING count(m.id) >= 6 ORDER BY count(m.id) DESC, sum(length(m.content)) DESC LIMIT $2`, [agent.id, N])
results.design = {
  arms: { A: 'generation 3 (live, unchanged)', B: 'generation 4 (numbered lines · retain from/quote · host-resolved citations)' },
  pairsRequested: N, sourcesFound: sources.length, model: config?.memory?.reflectionModel ?? '(chat.defaultModel)',
  triggerSource: 'manual', cloneUpdatedAt: 'now() - 4 days (outside the cron lookback)', orderAlternates: true,
}
say(`══ GEN-4 A/B · ${sources.length} pairs (asked ${N}) · ${DRY ? 'DRY — nothing run' : 'RUNNING'} ══`)
for (const s of sources) say(`  ${s.id.slice(0, 8)}  msgs=${String(s.n).padStart(3)}  chars=${String(s.chars).padStart(6)}  ${String(s.title ?? '').slice(0, 40)}`)
if (DRY) { save(); await pg.end(); process.exit(0) }

async function clone(src, arm, pairIndex) {
  const c = await one(`INSERT INTO ${S}."txn_conversations" (id, user_id, title, incognito, settings, created_at, updated_at)
                        VALUES (gen_random_uuid(), $1::uuid, $2, false, $3::jsonb, now() - interval '4 days', now() - interval '4 days') RETURNING id::text AS id`,
  [agent.id, `zz_gen4ab ${arm} ${src.id.slice(0, 8)}`, JSON.stringify({ experiment: 'gen4-ab', arm, pair: pairIndex, source: src.id })])
  await q(`INSERT INTO ${S}."txn_messages" (id, conversation_id, role, content, created_at, updated_at)
           SELECT gen_random_uuid(), $2::uuid, role, content, created_at, created_at FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid ORDER BY rolling_id`, [src.id, c.id])
  return c.id
}
async function waitForQuiet() {
  for (;;) {
    const busy = await one(`SELECT role, extract(epoch FROM (now() - created_at))::int AS ago FROM ${S}."txn_messages" WHERE conversation_id NOT IN (SELECT id FROM ${S}."txn_conversations" WHERE title LIKE 'zz_gen4ab%') ORDER BY created_at DESC LIMIT 1`)
    if (!(busy && busy.role === 'user' && busy.ago < 180)) return
    say(`  ⏸ a user message landed ${busy.ago}s ago with no answer — interaction has priority; waiting 60 s`)
    await new Promise((r) => setTimeout(r, 60_000))
  }
}
async function harvest(cid) {
  const ledger = await one(`SELECT id::text AS id, prompt_generation, outcome, failure, tools_used, tools_refused, messages_considered, length(text)::int AS text_chars,
                                   extract(epoch FROM (completed_at - started_at))::int AS seconds, wrote_memory_id::text AS wrote
                              FROM ${S}."log_conversation_revisits" WHERE conversation_id = $1::uuid ORDER BY created_at DESC LIMIT 1`, [cid])
  const calls = await q(`SELECT tool, ok, arg_keys, error, created_at FROM ${S}."log_tool_calls" WHERE conversation_id = $1::uuid ORDER BY created_at`, [cid])
  const rows = await q(`SELECT m.id::text AS id, m.kind, m.content, m.entity, m.attribute, m.value, m.author::text AS author, m.writer, m.act_kind::text AS act_kind, m.reach_kind::text AS reach_kind,
                               (SELECT json_agg(json_build_object('kind', e.ref_kind, 'target', e.target, 'span', e.span, 'established', e.established, 'how', e.verification->>'how', 'reason', e.verification->>'reason',
                                                                   'role', x.role, 'day', (x.created_at AT TIME ZONE 'Asia/Bangkok')::date::text) ORDER BY e.rolling_id)
                                  FROM ${S}."txn_memory_evidence" e LEFT JOIN ${S}."txn_messages" x ON x.id::text = e.target WHERE e.memory_id = m.id) AS refs
                          FROM ${S}."txn_memories" m
                         WHERE m.user_id = $2::uuid AND (m.reach_conversation_id = $1::uuid
                            -- lessons/practices carry a record act and no conversation reach: reach them through the decision that persisted them
                            OR m.id IN (SELECT d.memory_id FROM ${S}."log_retention_decisions" d WHERE d.conversation_id = $1::uuid AND d.memory_id IS NOT NULL))
                         ORDER BY m.created_at`, [cid, agent.id])
  const decisions = await q(`SELECT kind, mine, state, why, length(content)::int AS chars FROM ${S}."log_retention_decisions" WHERE conversation_id = $1::uuid ORDER BY created_at`, [cid])
  return { ledger, calls, rows, decisions }
}

if (argv.includes('--reharvest')) {
  for (const p of results.pairs) for (const k of ['A', 'B']) if (p[k]?.conversationId) p[k].harvest = await harvest(p[k].conversationId)
  save(); say(`re-harvested ${results.pairs.length} pairs — nothing run`); await pg.end(); process.exit(0)
}
for (let i = 0; i < sources.length; i++) {
  const src = sources[i]
  if (results.pairs.some((p) => p.source === src.id && p.A?.harvest && p.B?.harvest)) { say(`  pair ${i + 1} · ${src.id.slice(0, 8)} already run — skipped`); continue }
  const order = i % 2 === 0 ? ['A', 'B'] : ['B', 'A']
  const pair = { index: i + 1, source: src.id, sourceTitle: src.title, messages: src.n, chars: src.chars, order }
  for (const arm of order) {
    const generation = arm === 'A' ? 3 : 4
    await waitForQuiet()
    const cid = await clone(src, arm, i + 1)
    const t0 = Date.now()
    let res
    try { res = await reflectOnConversation(fastify, { conversationId: cid, force: true, triggerSource: 'manual', generation }) }
    catch (e) { res = { ok: false, error: e?.message } }
    const ms = Date.now() - t0
    const harvestOut = await harvest(cid)
    pair[arm] = { generation, conversationId: cid, result: { ok: res?.ok ?? false, skipped: res?.skipped ?? false, reason: res?.reason ?? res?.error ?? null, toolsUsed: res?.toolsUsed ?? [], clipped: res?.clipped ?? null, promptGeneration: res?.promptGeneration ?? null }, ms, harvest: harvestOut }
    say(`  pair ${i + 1}/${sources.length} · ${src.id.slice(0, 8)} · arm ${arm} (gen ${generation}) · ${Math.round(ms / 1000)}s · ok=${res?.ok} · calls=${harvestOut.calls.length} · rows=${harvestOut.rows.length}`)
    results.pairs = results.pairs.filter((p) => p.source !== src.id).concat([pair])
    save()
  }
}
results.finishedAt = new Date().toISOString()
save()
say(`\n✓ ${results.pairs.length} pairs recorded → ${OUT.pathname}`)
await pg.end()
process.exit(0)
