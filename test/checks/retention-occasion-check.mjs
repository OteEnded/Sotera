// ⭐⭐⭐ STAGE A · BOTH DOORS OPEN — proved deterministically, with ⛔ ZERO MODEL CALLS.
//
//   node test/checks/retention-occasion-check.mjs
//
// ── WHAT THIS ESTABLISHES, AND WHAT IT DELIBERATELY DOES NOT ────────────────────────────────────
// ✅ ESTABLISHES: a `decline_to_remember` is REACHABLE through the real occasion mechanism — it
//    dispatches, it writes its own durable row, it writes NO memory row, and the audit attributes it to
//    the occasion. And the mirror: a `keep` writes a memory row and NO declined row.
// ⛔ DOES NOT ESTABLISH: that she WOULD decline. That is Stage B, it needs a model, and it is not run
//    here. ⭐ Reachability and neutrality are two questions and this file answers only the first.
//
// ⭐⭐ IT IS DETERMINISTIC BECAUSE `runFollowThrough` ALREADY TAKES AN INJECTED `turn`. The model is a
// seam that was designed in, so the mechanism can be exercised end to end with no generation at all —
// which is also why this can live in the suite permanently and can never contaminate the reflection
// corpus.
//
// ⛔ Runs as agent_dev. Every fixture is removed at the end.

import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker('retention-occasion')
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

const MARK = 'zz_occasion_'
let fastify = null

/** ⭐ An injected turn: a model that deterministically emits exactly these tool calls. */
const emits = (...calls) => async () => ({
  content: '', tool_calls: calls.map((c) => ({ function: { name: c.name, arguments: JSON.stringify(c.args) } })),
})

try {
  const { loadConfig } = await import('../../Backend/lib/utility.js')
  const { initDB } = await import('../../Backend/database/index.js')
  const config = loadConfig()
  const db = await initDB()
  const log = { warn: () => {}, error: () => {}, info: () => {}, debug: () => {}, child() { return this } }
  fastify = { db, log, config }

  const { runFollowThrough } = await import('../../Backend/app/components/retention-followthrough.js')
  // ⚠️⚠️ THE HOST SERVICES MUST BE REGISTERED, exactly as the chat route registers them at boot. Without
  // this the occasion dispatches correctly and every tool answers *"Required service is not available"* —
  // ⭐ which would have been a green-looking harness proving that a mechanism can fail politely.
  // ⓘ The tool COMPONENTS install themselves when `runtime.js` is imported; the HOST SERVICES they bind
  // to do not, and that asymmetry is the trap.
  const { initLesson } = await import('../../Backend/app/components/lesson-host.js')
  const { initRetention } = await import('../../Backend/app/components/retention-host.js')
  // ⚠️ AND THE AUDIT IS A REGISTRATION TOO — `initToolLog(fastify, attachToolAudit)`. Without it the
  // tools run correctly and `log_tool_calls` stays empty, so a harness could prove the ACTION happened
  // while proving nothing about whether it was ATTRIBUTABLE.
  const { initToolLog } = await import('../../Backend/app/audit/tool-log.js')
  const { attachToolAudit } = await import('../../Backend/app/components/runtime.js')
  initLesson(); initRetention(); initToolLog(fastify, attachToolAudit)
  const agent = await one(`select id::text, username from ${S}.mst_users where username='agent_dev'`)
  const user = { id: agent.id, username: agent.username, isRoot: false, roles: ['admin'] }
  check('agent_dev resolves — ⛔ this check never runs as root', Boolean(agent?.id))

  const declinedRows = async () => q(
    `select id::text, author, attribute, content, evidence from ${S}.txn_memories
      where attribute='declined' and content like $1`, [`${MARK}%`])
  const memoryRows = async () => q(
    `select id::text, author, attribute, value from ${S}.txn_memories
      where attribute like $1 and attribute <> 'declined'`, [`${MARK}%`])
  const occasions = async () => q(
    `select why, from_user, outcome, tools_called, tools_offered, said, error from ${S}.log_retention_occasions
      where why like $1 order by fired_at`, [`${MARK}%`])
  const toolCalls = async () => q(
    `select tool, origin, ok from ${S}.log_tool_calls
      where origin='retention-followthrough' and created_at > now() - interval '2 minutes' order by created_at`)

  const fire = (turn, why) => runFollowThrough(fastify, {
    user, conversationId: null, messageId: null,
    answer: 'zz_occasion answer', evidence: 'zz_occasion evidence', fromUser: false, turn, why,
  })

  // ── 1 · ⭐⭐ THE DECLINE DOOR OPENS ─────────────────────────────────────────────────────────────
  const memBefore = (await memoryRows()).length
  const r1 = await fire(emits({
    name: 'decline_to_remember',
    args: { about: `${MARK}a passing mood that is not worth carrying`, kind: 'do_not_want_to_remember' },
  }), `${MARK}decline`)

  check('1 · the occasion ran and dispatched the decline', r1?.ran === true && r1.calls?.[0]?.name === 'decline_to_remember',
    `ran=${r1?.ran} calls=${(r1?.calls ?? []).map((c) => c.name).join(',')}`)
  check('1 · ⭐ the tool reported success', r1?.calls?.[0]?.result?.ok === true, JSON.stringify(r1?.calls?.[0]?.result ?? null).slice(0, 120))

  const dec = await declinedRows()
  check('1 · ⭐⭐ a DURABLE declined row exists — not-keeping is an ACTION, not an absence', dec.length === 1, `${dec.length}`)
  check('1 · ⭐ authored by her, in the declined slot', dec[0]?.author === 'persona' && dec[0]?.attribute === 'declined')
  check('1 · ⭐⭐ and it records WHICH kind of decline — a judgement about value is not a preference about herself',
    dec[0]?.evidence?.declineKind === 'do_not_want_to_remember', JSON.stringify(dec[0]?.evidence ?? null))
  check('1 · ⛔⛔ NO MEMORY ROW was created', (await memoryRows()).length === memBefore, `${memBefore} → ${(await memoryRows()).length}`)

  // ── 2 · ⭐ THE AUDIT ATTRIBUTES IT TO THE OCCASION ──────────────────────────────────────────────
  const audited = await toolCalls()
  check('2 · the audit records the call with origin=retention-followthrough',
    audited.some((t) => t.tool === 'decline_to_remember' && t.origin === 'retention-followthrough' && t.ok === true),
    audited.map((t) => `${t.tool}/${t.ok}`).join(' '))

  // ── 3 · ⭐⭐⭐ 036 · THE OCCASION ITSELF IS RECORDED ─────────────────────────────────────────────
  const occ1 = (await occasions()).find((o) => o.why === `${MARK}decline`)
  check('3 · ⭐ the OCCASION is recorded, separately from the action', Boolean(occ1))
  check('3 · with outcome=decline and the trigger preserved', occ1?.outcome === 'decline' && occ1?.why === `${MARK}decline`,
    `outcome=${occ1?.outcome}`)
  check('3 · and the tool it called', (occ1?.tools_called ?? []).includes('decline_to_remember'))

  // ── 4 · ⭐ THE MIRROR — the keep door writes a memory and NO declined row ──────────────────────
  const decBefore = (await declinedRows()).length
  const r2 = await fire(emits({
    name: 'keep', args: { what: `${MARK}a durable thing about how I work`, kind: 'fact', attribute: `${MARK}attr`, mine: true },
  }), `${MARK}keep`)
  check('4 · the keep dispatched', r2?.ran === true && r2.calls?.[0]?.name === 'keep')
  // ⚠️ `keep` answers with a QUEUED receipt and the write lands on the serial lane — a sleep here would
  // be a race with a nicer name, so the lane is drained instead.
  const { buildMemoryV2 } = await import('../../Backend/app/components/memory-v2-host.js')
  await buildMemoryV2(fastify, { userId: agent.id })._drainWrites()
  const mem = await memoryRows()
  check('4 · ⭐ a MEMORY row was written', mem.length === memBefore + 1, `${memBefore} → ${mem.length}`)
  check('4 · ⭐ authored as HERS, because she said mine:true', mem.find((m) => m.attribute === `${MARK}attr`)?.author === 'persona')
  check('4 · ⛔ and NO new declined row', (await declinedRows()).length === decBefore, `${decBefore} → ${(await declinedRows()).length}`)
  const occ2 = (await occasions()).find((o) => o.why === `${MARK}keep`)
  check('4 · the occasion records outcome=keep', occ2?.outcome === 'keep', `${occ2?.outcome}`)

  // ── 5 · ⭐⭐⭐ SILENCE IS AN OUTCOME, NOT A MISSING ROW — the whole point of 036 ─────────────────
  const r3 = await fire(async () => ({ content: 'I have thought about it and will simply leave this.', tool_calls: [] }), `${MARK}silence`)
  check('5 · the occasion ran and she called nothing', r3?.ran === true && (r3.calls ?? []).length === 0)
  const occ3 = (await occasions()).find((o) => o.why === `${MARK}silence`)
  check('5 · ⭐⭐ SILENCE IS RECORDED — before 036 this firing left no row anywhere',
    occ3?.outcome === 'silence', `${occ3?.outcome}`)
  check('5 · ⭐ and what she SAID is kept — so silence can be told from disengagement',
    /leave this/.test(String(occ3?.said ?? '')), String(occ3?.said ?? '').slice(0, 60))
  check('5 · ⛔ tools_called is an EMPTY ARRAY, never NULL — "called nothing" ≠ "not recorded"',
    Array.isArray(occ3?.tools_called) && occ3.tools_called.length === 0)
  // ⭐⭐ AND THE LAST AMBIGUITY, CLOSED BY THE RED-PROOF ITSELF. Removing the decline door and re-running
  // recorded the firing as `silence` — so a door that was never offered read exactly like a choice not to
  // use it. ⇒ the occasion now records what was ON THE TABLE, not only what was taken.
  check('5 · ⭐⭐ and BOTH DOORS are recorded as offered — a closed door must not read as a decision',
    (occ3?.tools_offered ?? []).includes('keep') && (occ3?.tools_offered ?? []).includes('decline_to_remember'),
    (occ3?.tools_offered ?? []).join(','))

  // ── 6 · ⭐⭐ CANDIDATE ISOLATION — one failing door does not close the other ────────────────────
  const r4 = await fire(emits(
    { name: 'keep', args: { what: `${MARK}undeclared owner`, kind: 'fact' } },           // ⛔ no `mine` ⇒ refused
    { name: 'decline_to_remember', args: { about: `${MARK}the second call still runs`, kind: 'not_worth_keeping' } },
  ), `${MARK}isolation`)
  check('6 · both calls were attempted', (r4?.calls ?? []).length === 2, `${(r4?.calls ?? []).length}`)
  check('6 · ⛔ the first was REFUSED for an undeclared owner — the ownership gate is untouched by the occasion',
    r4?.calls?.[0]?.result?.refused === 'ownership_undeclared', `${r4?.calls?.[0]?.result?.refused}`)
  check('6 · ⭐⭐ and the SECOND still ran — a refusal isolates to its own call',
    r4?.calls?.[1]?.result?.ok === true)
  const occ4 = (await occasions()).find((o) => o.why === `${MARK}isolation`)
  check('6 · the occasion records BOTH doors, ⛔ not flattened to one', occ4?.outcome === 'both', `${occ4?.outcome}`)

  // ── 7 · ⛔ THE GENERATION-3 CORPUS IS UNTOUCHED ────────────────────────────────────────────────
  check('7 · ⛔ the reflection corpus is untouched — this experiment is isolated from it',
    Number((await one(`select count(*)::int n from ${S}.log_conversation_revisits where prompt_generation=3`)).n) === 77)
  // ⭐ PROOF THAT NO MODEL RAN, rather than an assertion that it did not: the text on the record is the
  // exact string the injected turn returned. ⛔ A generation could not have produced it.
  check('7 · ⛔ NO MODEL WAS CALLED — the recorded text is verbatim what the injected turn returned',
    String(occ3?.said ?? '') === 'I have thought about it and will simply leave this.')
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  try { await pg.query(`delete from ${S}.txn_memories where content like $1 or attribute like $1`, [`${MARK}%`]) } catch { /* none */ }
  try { await pg.query(`delete from ${S}.log_retention_occasions where why like $1`, [`${MARK}%`]) } catch { /* none */ }
  try { await fastify?.db?.sequelize?.close?.() } catch { /* closed */ }
  await pg.end()
}

done()
