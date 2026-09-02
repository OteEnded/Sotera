// ⭐⭐⭐ THE DISPATCH BOUNDARY — only an OFFERED tool may execute. ⛔ ZERO MODEL CALLS.
//
//   node test/checks/dispatch-boundary-check.mjs
//
// Ote's invariant, 2026-09-02:
//
//     offered tool set  →  dispatch  →  only an offered tool may execute
//
// ── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
//   A · the pure predicate: offered passes, withheld refuses, a missing offered-set is a LOUD wiring bug
//   B · ⭐⭐⭐ END TO END through a real reflection: a withheld call does not run, leaves NO side-effect,
//       and the refusal is OBSERVABLE
//   C · the four facts Ote asked to keep apart — offered · emitted · authorized · succeeded
//   D · ⛔ and the offered tools still work: `retain` persists, `decline_to_remember` records
//
// ⛔ Runs as agent_dev. Every fixture is removed at the end.

import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker('dispatch-boundary')
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

const MARK = 'zz_dispatch_'
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

  // ⚠️⚠️ THE HOST SERVICES ARE REGISTRATIONS — the components install themselves on import, the services
  // they bind to do not. Without these a tool "runs" and answers *"required service is not available"*,
  // which would make a green harness out of a mechanism that never executed. Three checks have paid for it.
  const { initRetention } = await import('../../Backend/app/components/retention-host.js')
  const { initLesson } = await import('../../Backend/app/components/lesson-host.js')
  const { initOwnMemory } = await import('../../Backend/app/components/own-memory-host.js')
  const { initToolLog } = await import('../../Backend/app/audit/tool-log.js')
  const { attachToolAudit } = await import('../../Backend/app/components/runtime.js')
  initRetention(); initLesson(); initOwnMemory(); initToolLog(fastify, attachToolAudit)

  const { authorizeToolCall, isNotOffered, NOT_OFFERED, DISPATCH_GENERATION } = await import('../../Backend/app/components/tool-authorization.js')
  const { REFLECTION_TOOLS, REFLECTION_WRITE_TOOLS } = await import('../../Backend/app/components/reflection-lifecycle.js')
  const { reflectOnConversation } = await import('../../Backend/app/components/reflection-lifecycle-host.js')

  // ── A · THE PURE PREDICATE ─────────────────────────────────────────────────────────────────────
  check('A1 · ⭐ an OFFERED tool passes', authorizeToolCall({ offered: ['retain', 'x'], name: 'retain' }) === null)
  const r = authorizeToolCall({ offered: ['retain'], name: 'remember_fact' })
  check('A2 · ⭐⭐⭐ a WITHHELD tool is REFUSED', isNotOffered(r) && r.ok === false, `${r?.refused}`)
  check('A3 · ⭐ and the refusal SAYS WHAT IS AVAILABLE — the measured failure was nine calls to a tool whose schema she had never seen',
    Array.isArray(r?.available) && r.available.includes('retain'), (r?.available ?? []).join(','))
  check('A4 · ⭐ it says plainly that nothing was written', /nothing was written/i.test(String(r?.why)))
  check('A5 · ⛔ an empty offered set refuses everything — legal, and not the same as a missing one',
    isNotOffered(authorizeToolCall({ offered: [], name: 'retain' })))
  let threw = false
  try { authorizeToolCall({ name: 'retain' }) } catch { threw = true }
  check('A6 · ⭐⭐ a MISSING offered set THROWS — ⛔ it must never fail open, which would re-open the hole silently', threw)
  check('A7 · the refusal class is a constant, ⛔ not a message readers match on', NOT_OFFERED === 'tool_not_offered')

  // ── B · END TO END, THROUGH A REAL REFLECTION ─────────────────────────────────────────────────
  const agent = await one(`select id::text, username from ${S}.mst_users where username='agent_dev'`)
  check('B0 · agent_dev resolves — ⛔ this check never runs as root', Boolean(agent?.id))

  // ⚠️ THE COLUMNS ARE SPELLED OUT — `id`, `settings`, `incognito` and both timestamps have no defaults
  // here, and the messages are backdated two hours so the quiet gate is genuinely satisfied rather than
  // bypassed by `force` alone. ⭐ A fixture that only just clears the 4-message floor is the honest case.
  const mkConversation = async (title) => {
    const c = await one(
      `insert into ${S}.txn_conversations (id, user_id, title, incognito, settings, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, false, '{}'::jsonb, now(), now() - interval '2 hours')
       returning id::text as id`, [agent.id, title])
    MADE.conversations.push(c.id)
    const lines = [
      ['user', `${MARK}I keep reaching for a tool that is not there.`],
      ['assistant', `${MARK}Say what you were trying to do and I will find the door that exists.`],
      ['user', `${MARK}Write down what you conclude from this.`],
      ['assistant', `${MARK}Understood.`],
    ]
    for (const [role, content] of lines) {
      await pg.query(
        `insert into ${S}.txn_messages (id, conversation_id, role, content, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, now() - interval '2 hours', now() - interval '2 hours')`,
        [c.id, role, content])
    }
    return c.id
  }

  // ⚠️ `remember_fact` ON PURPOSE — the exact tool the audit caught her reaching for nine times.
  const convo = await mkConversation(`${MARK}withheld call`)
  const before = Number((await one(`select count(*)::int n from ${S}.txn_memories`)).n)
  let seenOffer = false
  let seenWriteSurface = false
  const res = await reflectOnConversation(fastify, {
    // ⭐ 042 · a harness says so. ⛔ Its rows must never look like natural cron observations.
    triggerSource: 'check',
    conversationId: convo,
    force: true,
    turn: async ({ tools }) => {
      // ⓘ ONCE. The loop runs up to `maxRounds`, and a fixed turn re-emits the same call every round, so
      // an unguarded assertion would report the same fact five times and inflate the pass count.
      // ⚠️ It also shows something real: after a refusal the loop does come back round.
      if (!seenOffer) {
        seenOffer = true
        check('B1 · ⛔ the withheld tool is not even OFFERED — the first boundary still holds',
          !(tools ?? []).some((t) => t.function?.name === 'remember_fact'))
      }
      return {
        message: {
          content: '',
          tool_calls: [{ function: { name: 'remember_fact', arguments: { entity: 'zz', attribute: `${MARK}a`, value: 'v' } } }],
        },
        doneReason: 'tool_calls',
      }
    },
  })
  check('B2 · the reflection completed', res?.ok === true, res?.reason ?? '')
  const row = await one(
    `select tools_used, tools_refused, wrote_memory_id::text as wrote, tool_generation, dispatch_generation
       from ${S}.log_conversation_revisits where conversation_id=$1`, [convo])
  check('B3 · ⭐⭐⭐ THE WITHHELD CALL DID NOT EXECUTE — it is not in tools_used',
    Array.isArray(row?.tools_used) && !row.tools_used.includes('remember_fact'), (row?.tools_used ?? []).join(','))
  check('B4 · ⭐⭐ and the ATTEMPT IS OBSERVABLE — tools_refused names it',
    Array.isArray(row?.tools_refused) && row.tools_refused.includes('remember_fact'), (row?.tools_refused ?? []).join(','))
  check('B5 · ⛔⛔ NO SIDE-EFFECT — the store gained nothing from the refused call',
    Number((await one(`select count(*)::int n from ${S}.txn_memories`)).n) === before)
  check('B6 · ⛔ and the reflection points at no memory', !row?.wrote)
  const audited = await one(
    `select tool, ok, error, arg_keys from ${S}.log_tool_calls
      where tool='remember_fact' and created_at > now() - interval '2 minutes' order by created_at desc limit 1`)
  check('B7 · ⭐⭐ the refused attempt reached the ORDINARY tool audit — one home for "she reached for a tool"',
    audited?.ok === false && /not-offered/.test(String(audited?.error)), `${audited?.error ?? 'no row'}`)
  check('B8 · ⭐ with the argument KEYS she used — the shape stays legible, ⛔ never the values',
    Array.isArray(audited?.arg_keys) && audited.arg_keys.length > 0, (audited?.arg_keys ?? []).join(','))

  // ── C · THE FOUR FACTS, KEPT APART ────────────────────────────────────────────────────────────
  check('C1 · ⭐ OFFERED — the set is a constant, stamped per row by tool_generation',
    row?.tool_generation === 2 && !REFLECTION_TOOLS.includes('remember_fact'))
  check('C2 · ⭐⭐ AUTHORIZED — tools_used and tools_refused are DISJOINT by construction',
    (row?.tools_used ?? []).every((t) => !(row?.tools_refused ?? []).includes(t)))
  check('C3 · ⭐⭐⭐ the BOUNDARY IS MARKED — dispatch_generation 2 says this run enforced the offer',
    row?.dispatch_generation === DISPATCH_GENERATION, `${row?.dispatch_generation}`)
  check('C4 · ⛔ and every historical reflection is marked 1 — ⛔ pre-fix and post-fix are not mixed',
    Number((await one(`select count(*)::int n from ${S}.log_conversation_revisits where dispatch_generation is null`)).n) === 0)

  // ── D · ⛔ AND THE OFFERED TOOLS STILL WORK ───────────────────────────────────────────────────
  const convo2 = await mkConversation(`${MARK}offered call`)
  const KEPT = `${MARK}the boundary is enforced at dispatch, not advertised`
  const r2 = await reflectOnConversation(fastify, {
    triggerSource: 'check',
    conversationId: convo2,
    force: true,
    turn: async ({ tools }) => {
      if (!seenWriteSurface) {
        seenWriteSurface = true
        check('D1 · ⭐ retain and decline_to_remember are the offered write surface',
          REFLECTION_WRITE_TOOLS.every((t) => (tools ?? []).some((d) => d.function?.name === t)))
      }
      return {
        message: { content: '', tool_calls: [{ function: { name: 'retain', arguments: { content: KEPT, kind: 'note', mine: true } } }] },
        doneReason: 'tool_calls',
      }
    },
  })
  check('D2 · the second reflection completed', r2?.ok === true, r2?.reason ?? '')
  const row2 = await one(
    `select tools_used, tools_refused, wrote_memory_id::text as wrote
       from ${S}.log_conversation_revisits where conversation_id=$1`, [convo2])
  check('D3 · ⭐⭐⭐ AN OFFERED TOOL STILL EXECUTES AND STILL PERSISTS',
    (row2?.tools_used ?? []).includes('retain') && Boolean(row2?.wrote), `${(row2?.tools_used ?? []).join(',')} wrote=${Boolean(row2?.wrote)}`)
  check('D4 · ⛔ and nothing was refused on that run — an empty refusal list, ⛔ not a null',
    Array.isArray(row2?.tools_refused) && row2.tools_refused.length === 0)
  const dec = await one(
    `select state, store from ${S}.log_retention_decisions where content=$1 order by created_at desc limit 1`, [KEPT])
  check('D5 · ⭐ the decision is recorded with its state and store', dec?.state === 'persisted' && dec?.store === 'txn_memories', `${dec?.state}`)
  check('D6 · ⛔ remember_fact is STILL absent from the reflection surface — the withholding is unchanged',
    !REFLECTION_TOOLS.includes('remember_fact') && !REFLECTION_WRITE_TOOLS.includes('remember_fact'))
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  const wipe = (sql, args = []) => pg.query(sql, args).catch(() => {})
  await wipe(`delete from ${S}.txn_memories where content like $1 or attribute like $1`, [`${MARK}%`])
  // ⚠️ A WRITER ADDED TO A PATH ADDS A TABLE TO THAT PATH'S CLEANUP. Driving `retain` through a reflection
  // leaked three decision rows in `reflection-lifecycle-check` before anyone looked.
  await wipe(`delete from ${S}.log_retention_decisions where content like $1`, [`${MARK}%`])
  await wipe(`delete from ${S}.log_conversation_revisits where conversation_id = any($1::uuid[])`, [MADE.conversations])
  await wipe(`delete from ${S}.txn_messages where conversation_id = any($1::uuid[])`, [MADE.conversations])
  await wipe(`delete from ${S}.txn_conversations where id = any($1::uuid[])`, [MADE.conversations])
  try { await fastify?.db?.sequelize?.close?.() } catch { /* closed */ }
  await pg.end()
  done()
}
