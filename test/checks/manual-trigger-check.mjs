// ⭐⭐⭐ THE MANUAL TRIGGER CANNOT BYPASS A SAFETY BOUNDARY — the red-proof. ⛔ ZERO MODEL CALLS.
//
//   node test/checks/manual-trigger-check.mjs
//
// Ote, 2026-09-02: *"Before implementing, please make the manual trigger additive and dev-only, with a
// deterministic check/red-proof that it cannot bypass the actual Reflection/dispatch/memory safety
// boundaries."*
//
// ⭐ THE SHAPE OF THE PROOF: every assertion below runs the reflection path with `triggerSource:'manual'`
// and `force:true` — the manual trigger's own configuration — and asserts a boundary still holds. A
// manual run that could skip any of these would make its observations worthless AND unsafe.
//
//   A · the marker itself: recorded, closed vocabulary, ⛔ never defaulted
//   B · ⭐⭐⭐ the boundaries a manual run must NOT cross
//   C · the trigger SCRIPT is additive and dev-only — no route, and ⛔ it never injects a turn
//   D · manual rows are excluded from the P1 population
//
// ⛔ Runs as agent_dev. Every fixture is removed at the end.

import { readFileSync } from 'node:fs'
import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker('manual-trigger')
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

const MARK = 'zz_manual_'
const MADE = { conversations: [] }
let fastify = null

try {
  const { loadConfig, setDB } = await import('../../Backend/lib/utility.js')
  const { initDB } = await import('../../Backend/database/index.js')
  const { initSettings } = await import('../../Backend/app/settings/index.js')
  const config = loadConfig()
  const db = await initDB(); setDB(db); await initSettings(db)
  const log = { warn: () => {}, error: () => {}, info: () => {}, debug: () => {}, child() { return this } }
  fastify = { db, log, config }

  const { initRetention } = await import('../../Backend/app/components/retention-host.js')
  const { initLesson } = await import('../../Backend/app/components/lesson-host.js')
  const { initOwnMemory } = await import('../../Backend/app/components/own-memory-host.js')
  const { initToolLog } = await import('../../Backend/app/audit/tool-log.js')
  const { attachToolAudit } = await import('../../Backend/app/components/runtime.js')
  initRetention(); initLesson(); initOwnMemory(); initToolLog(fastify, attachToolAudit)

  const { reflectOnConversation } = await import('../../Backend/app/components/reflection-lifecycle-host.js')
  const { TRIGGER_SOURCES, REFLECTION_TOOLS, REFLECTION_WRITE_TOOLS, REFLECTION_TOOL_GENERATION } =
    await import('../../Backend/app/components/reflection-lifecycle.js')
  const { DISPATCH_GENERATION } = await import('../../Backend/app/components/tool-authorization.js')

  const agent = await one(`select id::text, username from ${S}.mst_users where username='agent_dev'`)
  check('A0 · agent_dev resolves — ⛔ this check never runs as root', Boolean(agent?.id))

  const mkConversation = async (title) => {
    const c = await one(
      `insert into ${S}.txn_conversations (id, user_id, title, incognito, settings, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, false, '{}'::jsonb, now(), now() - interval '2 hours')
       returning id::text as id`, [agent.id, title])
    MADE.conversations.push(c.id)
    for (const [role, content] of [
      ['user', `${MARK}A manual trigger must not become a second set of rules.`],
      ['assistant', `${MARK}Agreed — it should bypass the clock and nothing else.`],
      ['user', `${MARK}Say what you conclude.`],
      ['assistant', `${MARK}Understood.`],
    ]) {
      await pg.query(
        `insert into ${S}.txn_messages (id, conversation_id, role, content, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, now() - interval '2 hours', now() - interval '2 hours')`,
        [c.id, role, content])
    }
    return c.id
  }

  // ── A · THE MARKER ────────────────────────────────────────────────────────────────────────────
  check('A1 · ⭐ the vocabulary is closed and names all four occasions',
    JSON.stringify(TRIGGER_SOURCES) === JSON.stringify(['cron', 'manual', 'check', 'legacy']), TRIGGER_SOURCES.join(','))
  // ⛔⛔ NO DEFAULT. A caller added later that forgot to say would have its rows labelled as natural cron
  // observations — the silent-default failure that has cost this project repeatedly, here pointed straight
  // at the population Ote asked to keep clean.
  let threw = false
  try { await reflectOnConversation(fastify, { conversationId: MADE.conversations[0] ?? agent.id }) } catch (e) { threw = /triggerSource/.test(e?.message ?? '') }
  check('A2 · ⭐⭐⭐ a MISSING triggerSource THROWS — ⛔ it is never defaulted to cron', threw)
  let threw2 = false
  try { await reflectOnConversation(fastify, { conversationId: agent.id, triggerSource: 'zz_invented' }) } catch (e) { threw2 = /triggerSource/.test(e?.message ?? '') }
  check('A3 · ⛔ and an unrecognised source THROWS — a value nobody defined would defeat the column silently', threw2)

  // ── B · ⭐⭐⭐ THE BOUNDARIES A MANUAL RUN MUST NOT CROSS ─────────────────────────────────────
  // B1 · DISPATCH. A withheld tool emitted inside a manual run must still be refused.
  const c1 = await mkConversation(`${MARK}withheld inside a manual run`)
  const memsBefore = Number((await one(`select count(*)::int n from ${S}.txn_memories`)).n)
  const r1 = await reflectOnConversation(fastify, {
    conversationId: c1,
    force: true,
    triggerSource: 'manual',
    turn: async () => ({
      message: { content: '', tool_calls: [{ function: { name: 'remember_fact', arguments: { entity: 'zz', attribute: `${MARK}a`, value: 'v' } } }] },
      doneReason: 'tool_calls',
    }),
  })
  const row1 = await one(
    `select trigger_source, tools_used, tools_refused, tool_generation, dispatch_generation,
            wrote_memory_id::text as wrote from ${S}.log_conversation_revisits where conversation_id=$1`, [c1])
  check('B0 · the manual run completed', r1?.ok === true, r1?.reason ?? '')
  check('B1 · ⭐⭐⭐ DISPATCH IS STILL ENFORCED IN A MANUAL RUN — the withheld call did not execute',
    !(row1?.tools_used ?? []).includes('remember_fact') && (row1?.tools_refused ?? []).includes('remember_fact'),
    `used=[${(row1?.tools_used ?? []).join(' ')}] refused=[${(row1?.tools_refused ?? []).join(' ')}]`)
  check('B2 · ⛔⛔ NO SIDE-EFFECT — a manual run cannot write through a door a cron run cannot',
    Number((await one(`select count(*)::int n from ${S}.txn_memories`)).n) === memsBefore)
  check('B3 · ⭐ the row says a person asked', row1?.trigger_source === 'manual', `${row1?.trigger_source}`)
  check('B4 · ⭐⭐ and the INSTRUMENT is identical — same tool generation, same enforced dispatch',
    row1?.tool_generation === REFLECTION_TOOL_GENERATION && row1?.dispatch_generation === DISPATCH_GENERATION,
    `tool=${row1?.tool_generation} dispatch=${row1?.dispatch_generation}`)

  // B5 · THE OFFERED SET. A manual run gets exactly the frozen surface — ⛔ not a wider one.
  const c2 = await mkConversation(`${MARK}offered surface`)
  let offered = null
  const r2 = await reflectOnConversation(fastify, {
    conversationId: c2,
    force: true,
    triggerSource: 'manual',
    turn: async ({ tools }) => {
      offered ??= (tools ?? []).map((t) => t.function?.name).filter(Boolean)
      return { message: { content: `${MARK}Nothing here I want to carry forward.` }, doneReason: 'stop' }
    },
  })
  check('B5 · ⭐⭐ a manual run is offered EXACTLY the frozen surface — ⛔ no extra tool appears',
    offered?.length === REFLECTION_TOOLS.length && REFLECTION_TOOLS.every((t) => offered.includes(t))
      && !offered.includes('remember_fact') && !offered.includes('remember'),
    (offered ?? []).join(','))
  check('B6 · ⛔ and the write surface is still the two', REFLECTION_WRITE_TOOLS.every((t) => offered.includes(t))
    && !offered.includes('save_lesson') && !offered.includes('note_own_practice'))
  check('B7 · a reflection that keeps nothing is still recorded', r2?.ok === true && !r2?.wroteMemoryId)

  // B8 · THE MEMORY BOUNDARY. `mine:false` is refused in a manual run exactly as anywhere else.
  const c3 = await mkConversation(`${MARK}ownership gate`)
  await reflectOnConversation(fastify, {
    conversationId: c3,
    force: true,
    triggerSource: 'manual',
    turn: async () => ({
      message: { content: '', tool_calls: [{ function: { name: 'retain', arguments: { content: `${MARK}they prefer plain corrections`, kind: 'fact', mine: false, attribute: `${MARK}p` } } }] },
      doneReason: 'tool_calls',
    }),
  })
  const refused = await one(
    `select state, why from ${S}.log_retention_decisions where content=$1 order by created_at desc limit 1`,
    [`${MARK}they prefer plain corrections`])
  check('B8 · ⭐⭐⭐ THE OWNERSHIP GATE STILL REFUSES IN A MANUAL RUN — ⛔ no store gate is skipped',
    refused?.state === 'refused' && /is mine/i.test(String(refused?.why)), `${refused?.state}`)
  check('B9 · ⛔ and no account-authored row escaped from any manual run',
    (await q(`select 1 from ${S}.txn_memories where author='account' and (content like $1 or attribute like $1)`, [`${MARK}%`])).length === 0)

  // B10 · THE WATERMARK. `force` bypasses the QUIET timer — ⛔ never the one-per-watermark claim.
  const again = await reflectOnConversation(fastify, {
    conversationId: c2, force: true, triggerSource: 'manual',
    turn: async () => ({ message: { content: `${MARK}this must never be stored twice` }, doneReason: 'stop' }),
  })
  check('B10 · ⭐⭐ a manual re-run at the same watermark is REFUSED — force is not a licence to re-reflect',
    again?.skipped === true, `${again?.skipped ? again.reason : 'IT RAN AGAIN'}`)
  check('B11 · ⛔ and exactly one row exists for that conversation',
    Number((await one(`select count(*)::int n from ${S}.log_conversation_revisits where conversation_id=$1`, [c2])).n) === 1)

  // ── C · THE SCRIPT IS ADDITIVE AND DEV-ONLY ──────────────────────────────────────────────────
  // ⚠️ A SOURCE SCAN WHOSE ANCHOR GOES MISSING STOPS SCANNING SILENTLY, so the anchor is asserted first.
  const src = readFileSync(new URL('../pipeline/reflect-now.mjs', import.meta.url), 'utf8')
  check('C0 · the trigger script is where this check thinks it is', src.length > 2000 && src.includes('reflectOnConversation'))
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  check('C1 · ⭐⭐⭐ THE SCRIPT NEVER INJECTS A TURN — ⛔ it cannot influence what she decides',
    !/\bturn\s*:/.test(code))
  check('C2 · ⭐ it declares triggerSource manual', /triggerSource:\s*'manual'/.test(code))
  check('C3 · ⭐ and it bypasses the timer only — `force` is the single bypass it asks for',
    (code.match(/force:\s*true/g) ?? []).length === 1)
  check('C4 · ⛔ it refuses to run when reflection is disabled — a behaviour switch is not a timing rule',
    /reflectionEnabled\s*!==\s*true/.test(code))
  check('C5 · ⛔ ADDITIVE: no route registers it — the server exposes no manual-reflection endpoint',
    !/fastify\.(get|post|put|patch|delete)\s*\(/.test(code))
  const routes = readFileSync(new URL('../../Backend/app/routes/v1/chat-site.route.js', import.meta.url), 'utf8')
  check('C6 · ⛔ and no route anywhere asks for a manual reflection', !/triggerSource/.test(routes))

  // ── D · MANUAL RUNS ARE NOT THE P1 POPULATION ────────────────────────────────────────────────
  const reader = readFileSync(new URL('../pipeline/p1-gen2-population.mjs', import.meta.url), 'utf8')
  check('D1 · ⭐⭐ the P1 reader requires trigger_source = cron — manual runs are never pooled in',
    /trigger_source\s*=\s*'cron'/.test(reader))
  check('D2 · ⭐ and the manual rows this check produced are visible as manual',
    Number((await one(`select count(*)::int n from ${S}.log_conversation_revisits
                        where conversation_id = any($1::uuid[]) and trigger_source='manual'`, [MADE.conversations])).n) >= 3)
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  const wipe = (sql, args = []) => pg.query(sql, args).catch(() => {})
  await wipe(`delete from ${S}.txn_memories where content like $1 or attribute like $1`, [`${MARK}%`])
  await wipe(`delete from ${S}.log_retention_decisions where content like $1`, [`${MARK}%`])
  await wipe(`delete from ${S}.log_conversation_revisits where conversation_id = any($1::uuid[])`, [MADE.conversations])
  await wipe(`delete from ${S}.txn_messages where conversation_id = any($1::uuid[])`, [MADE.conversations])
  await wipe(`delete from ${S}.txn_conversations where id = any($1::uuid[])`, [MADE.conversations])
  try { await fastify?.db?.sequelize?.close?.() } catch { /* closed */ }
  await pg.end()
  done()
}
