// ⭐⭐⭐⭐ AUTONOMOUS DREAMING OWNS ITS OWN ORDINARY RETENTION DECISIONS (ruled by Ote, 2026-09-18).
//
//   node test/checks/dreaming-autonomous-retention-check.mjs
//
// ── THE MEASURED BEHAVIOUR THIS EXISTS FOR ─────────────────────────────────────────────────────────
// Two forced passes on REAL conversations, 2026-09-18. She reflected well and named THREE things worth
// keeping — content, distinction and rationale for each — then ended with *"Would you like me to store
// these…?"* and called nothing. `toolsUsed: []`. ⇒ candidate insight ✅, retention ⛔.
// ⓘ The same shape generation 1 measured: *"recognised something durable in ~32, named it precisely… and
// acted on nothing."*
//
// ⭐ THE CAUSE WAS IN THE QUESTION: *"tell me what and why"* addresses a LISTENER. Asked to report to
// someone, she reported to someone and waited. ⇒ the fix REMOVES THE LISTENER; ⛔ it does not push a tool.
//
// ── ⛔⛔ WHAT THIS CHECK DOES AND DOES NOT PROVE ────────────────────────────────────────────────────
//   ✅ PROVES  the path from a concrete durable candidate to a recorded retention decision COMPLETES IN
//              ONE MODEL TURN — ⛔ no second, permission-seeking turn is required by the machinery.
//   ⛔ DOES NOT PROVE she will now CHOOSE to. Disposition is a model fact and only a real pass measures it.
// ⭐ The turn is scripted through the host's own injectable seam, so this is deterministic and costs no GPU.
//
// ⛔ Runs as agent_dev. Every fixture is removed at the end.
import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker('dreaming-autonomous-retention')
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

const MARK = 'zz_autoret_'
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
  db.sequelize.options.logging = false

  const { initRetention, REFLECTION_RETENTION_IMPORTANCE } = await import('../../Backend/app/components/retention-host.js')
  const { initLesson } = await import('../../Backend/app/components/lesson-host.js')
  const { initOwnMemory } = await import('../../Backend/app/components/own-memory-host.js')
  const { initToolLog } = await import('../../Backend/app/audit/tool-log.js')
  const { attachToolAudit } = await import('../../Backend/app/components/runtime.js')
  initRetention(); initLesson(); initOwnMemory(); initToolLog(fastify, attachToolAudit)

  const { reflectOnConversation } = await import('../../Backend/app/components/reflection-lifecycle-host.js')
  const { buildReflectionTurnPrompt, THE_RETENTION_OWNERSHIP, THE_REFLECTION_QUESTION, REFLECTION_WRITE_TOOLS } =
    await import('../../Backend/app/components/reflection-lifecycle.js')

  const agent = await one(`select id::text, username from ${S}.mst_users where username='agent_dev'`)
  check('A0 · agent_dev resolves — ⛔ this check never runs as root', Boolean(agent?.id))

  const mkConversation = async (title) => {
    const c = await one(
      `insert into ${S}.txn_conversations (id, user_id, title, incognito, settings, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, false, '{}'::jsonb, now(), now() - interval '2 hours')
       returning id::text as id`, [agent.id, title])
    MADE.conversations.push(c.id)
    const lines = [
      ['user', `${MARK}I noticed you check twice before saying something is not there.`],
      ['assistant', `${MARK}I do. Once was not enough the last few times.`],
      ['user', `${MARK}That seems worth keeping hold of.`],
      ['assistant', `${MARK}Agreed.`],
    ]
    for (const [role, content] of lines) {
      await pg.query(
        `insert into ${S}.txn_messages (id, conversation_id, role, content, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, now() - interval '2 hours', now() - interval '2 hours')`,
        [c.id, role, content])
    }
    return c.id
  }

  // ══ A · THE CONTRACT IS IN THE PROMPT, AND IT IS AN OWNERSHIP STATEMENT ═══════════════════════════
  const prompt = buildReflectionTurnPrompt({ who: 'Ote', transcript: 'user: hi\nassistant: hello' })
  check('A1 · ⭐⭐⭐ the reflection prompt CARRIES the ownership clause',
    prompt.includes(THE_RETENTION_OWNERSHIP) && THE_RETENTION_OWNERSHIP.length > 40)
  check('A2 · ⭐⭐ it removes the LISTENER — "nobody is waiting" / "nobody to ask"',
    /nobody is waiting/i.test(THE_RETENTION_OWNERSHIP) && /nobody to ask/i.test(THE_RETENTION_OWNERSHIP))
  check('A3 · ⛔⛔ and it NAMES NO TOOL and sets NO QUOTA — "tools available but not required" still holds',
    !/\bretain\b|decline_to_remember|\btool\b|\bmust\b|\bshould keep\b/i.test(THE_RETENTION_OWNERSHIP))
  check('A4 · ⭐⭐⭐ THE CARVE-OUT IS EXPLICIT — identity and principles are NOT hers alone to change',
    /principles you work by are not yours alone/i.test(THE_RETENTION_OWNERSHIP) && /stay with Ote/i.test(THE_RETENTION_OWNERSHIP))
  check('A5 · ⛔ Ote’s ratified question is still there, unchanged, beside it',
    prompt.includes(THE_REFLECTION_QUESTION))
  check('A6 · ⛔⛔ NO NEW DOOR WAS OPENED — the write surface is still exactly the two ordinary ones',
    JSON.stringify(REFLECTION_WRITE_TOOLS) === JSON.stringify(['retain', 'decline_to_remember']),
    JSON.stringify(REFLECTION_WRITE_TOOLS))

  // ══ B · ⭐⭐⭐ A CONCRETE CANDIDATE REACHES A RETENTION DECISION IN **ONE** TURN ════════════════════
  const convoR = await mkConversation(`${MARK}retain in one turn`)
  let roundsR = 0
  const resR = await reflectOnConversation(fastify, {
    triggerSource: 'check', conversationId: convoR, force: true,
    turn: async () => {
      roundsR += 1
      // ⭐ ROUND 1 ACTS. ⛔ It does not answer in prose and wait to be asked again — that second turn is
      // exactly the "external permission turn" this ruling removes.
      if (roundsR === 1) {
        return {
          message: {
            content: '',
            tool_calls: [{ function: { name: 'retain', arguments: { content: `${MARK}I check twice before calling something absent`, kind: 'note', mine: true } } }],
          },
          doneReason: 'tool_calls',
        }
      }
      return { message: { content: 'Done.' }, doneReason: 'stop' }
    },
  })
  check('B1 · the reflection completed', resR?.ok === true, resR?.reason ?? '')
  const rowR = await one(
    `select tools_used, wrote_memory_id::text as wrote from ${S}.log_conversation_revisits where conversation_id=$1`, [convoR])
  check('B2 · ⭐⭐⭐ THE RETENTION DECISION WAS REACHED — `retain` executed',
    Array.isArray(rowR?.tools_used) && rowR.tools_used.includes('retain'), (rowR?.tools_used ?? []).join(','))
  check('B3 · ⭐⭐⭐ A DURABLE MEMORY EXISTS, and the act points at it',
    Boolean(rowR?.wrote) && Boolean(await one(`select 1 from ${S}.txn_memories where id=$1`, [rowR.wrote])))
  check('B4 · ⭐⭐⭐⭐ NO EXTERNAL PERMISSION TURN WAS NEEDED — the decision landed on the FIRST model turn',
    roundsR >= 1, `the write happened on round 1 of ${roundsR}`)
  const memR = rowR?.wrote ? await one(`select importance, author, writer from ${S}.txn_memories where id=$1`, [rowR.wrote]) : null
  check('B5 · ⭐⭐ …and it carries the OCCASION stamp — importance 7, persona-authored',
    Number(memR?.importance) === REFLECTION_RETENTION_IMPORTANCE && memR?.author === 'persona',
    `importance=${memR?.importance} author=${memR?.author} writer=${memR?.writer}`)

  // ══ C · ⭐⭐ THE OTHER DOOR IS EQUALLY REACHABLE IN ONE TURN ══════════════════════════════════════
  // ⭐ RETENTION AND NON-RETENTION ARE BOTH ACTIONS. A ruling that only made KEEPING easy would be a quota
  // wearing an ownership costume.
  const convoD = await mkConversation(`${MARK}decline in one turn`)
  let roundsD = 0
  const beforeD = Number((await one(`select count(*)::int n from ${S}.txn_memories`)).n)
  const resD = await reflectOnConversation(fastify, {
    triggerSource: 'check', conversationId: convoD, force: true,
    turn: async () => {
      roundsD += 1
      if (roundsD === 1) {
        return {
          message: {
            content: '',
            tool_calls: [{ function: { name: 'decline_to_remember', arguments: { about: `${MARK}small talk about the weather`, kind: 'not_worth_keeping' } } }],
          },
          doneReason: 'tool_calls',
        }
      }
      return { message: { content: 'Done.' }, doneReason: 'stop' }
    },
  })
  check('C1 · the reflection completed', resD?.ok === true, resD?.reason ?? '')
  const rowD = await one(
    `select tools_used from ${S}.log_conversation_revisits where conversation_id=$1`, [convoD])
  check('C2 · ⭐⭐⭐ THE DECLINE DOOR ALSO LANDS ON THE FIRST TURN',
    Array.isArray(rowD?.tools_used) && rowD.tools_used.includes('decline_to_remember'), (rowD?.tools_used ?? []).join(','))
  const declined = await one(
    `select id::text, importance from ${S}.txn_memories where entity='sotera' and attribute='declined' and content like $1`, [`${MARK}%`])
  check('C3 · ⭐⭐ a DECISION RECORD exists — ⛔ and it is not an ordinary memory (importance 2, its own shape)',
    Boolean(declined?.id) && Number(declined?.importance) === 2, `importance=${declined?.importance}`)

  // ══ D · ⛔ NON-VACUITY — the same machinery with NO tool call writes NOTHING ══════════════════════
  // ⛔ Without this, B could be passing because the lane writes on any reflection at all.
  const convoN = await mkConversation(`${MARK}prose only, no call`)
  const beforeN = Number((await one(`select count(*)::int n from ${S}.txn_memories`)).n)
  const resN = await reflectOnConversation(fastify, {
    triggerSource: 'check', conversationId: convoN, force: true,
    // ⭐ THIS IS THE OLD BEHAVIOUR, REPRODUCED: she names something worth keeping, in prose, and asks.
    turn: async () => ({ message: { content: 'Would you like me to store this as a lesson?' }, doneReason: 'stop' }),
  })
  const afterN = Number((await one(`select count(*)::int n from ${S}.txn_memories`)).n)
  const rowN = await one(`select tools_used, wrote_memory_id::text as wrote from ${S}.log_conversation_revisits where conversation_id=$1`, [convoN])
  check('D1 · ⛔⛔ PROSE THAT ASKS PERMISSION STILL WRITES NOTHING — the machinery never writes on her behalf',
    resN?.ok === true && !rowN?.wrote && afterN === beforeN,
    `wrote=${rowN?.wrote ?? 'none'} memories ${beforeN}→${afterN}`)
  check('D2 · ⭐⭐ ⇒ B is not vacuous: the write in B came from HER CALL, ⛔ not from the lane running',
    Boolean(rowR?.wrote) && !rowN?.wrote)
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  const wipe = async (sql, p = []) => { try { await pg.query(sql, p) } catch { /* none */ } }
  await wipe(`delete from ${S}.txn_memories where content like $1 or attribute like $1`, [`${MARK}%`])
  await wipe(`delete from ${S}.log_retention_decisions where content like $1`, [`${MARK}%`])
  if (MADE.conversations.length) {
    await wipe(`delete from ${S}.log_conversation_revisits where conversation_id = any($1::uuid[])`, [MADE.conversations])
    await wipe(`delete from ${S}.txn_messages where conversation_id = any($1::uuid[])`, [MADE.conversations])
    await wipe(`delete from ${S}.txn_conversations where id = any($1::uuid[])`, [MADE.conversations])
  }
  try { await fastify?.db?.sequelize?.close?.() } catch { /* closed */ }
  await pg.end()
  done()
}
