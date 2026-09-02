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
  // ⭐ The corpus size as it is NOW — the baseline this run must not move.
  const corpusBefore = Number((await one(`select count(*)::int n from ${S}.log_conversation_revisits where prompt_generation=3`)).n)

  const declinedRows = async () => q(
    `select id::text, author, attribute, content, evidence from ${S}.txn_memories
      where attribute='declined' and content like $1`, [`${MARK}%`])
  const memoryRows = async () => q(
    `select id::text, author, attribute, value from ${S}.txn_memories
      where attribute like $1 and attribute <> 'declined'`, [`${MARK}%`])
  const occasions = async () => q(
    `select why, from_user, outcome, tools_called, tools_effected, tools_offered, said, said_names_tool, error from ${S}.log_retention_occasions
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
  // ⚠️⚠️ THIS ASSERTION USED TO EXPECT `both`, AND IT WAS ASSERTING THE DEFECT. The keep here is REFUSED
  // for an undeclared owner; only the decline is effected. Under 037's result-based derivation the honest
  // answer is `decline`, and the attempt is still fully visible in `tools_called`.
  // ⭐ The fix made this test go red on its own, in exactly the place the defect lived.
  check('6 · ⭐ the occasion records what was EFFECTED — the refused keep is not counted as a keep',
    occ4?.outcome === 'decline', `${occ4?.outcome}`)
  check('6 · ⭐ and BOTH attempts remain visible, so the pair is not lost',
    (occ4?.tools_called ?? []).length === 2 && (occ4?.tools_effected ?? []).join(',') === 'decline_to_remember',
    `called=${(occ4?.tools_called ?? []).join('+')} effected=${(occ4?.tools_effected ?? []).join('+')}`)

  // ── 8 · ⭐⭐⭐ 037 · THE STATES THAT WERE PREVIOUSLY INVISIBLE ──────────────────────────────────
  // ⚠️ Before 037, `outcome` was derived from tool NAMES: a REFUSED keep recorded as `keep`, and a
  // decision typed as prose recorded as `silence`. Both are now their own state.
  const { saidNamesOfferedTool } = await import('../../Backend/app/components/retention-followthrough.js')

  // 8a · REFUSED — she reached for a door and nothing landed. ⛔ Previously reported as `keep`.
  const r5 = await fire(emits({ name: 'keep', args: { what: `${MARK}no owner declared`, kind: 'fact' } }), `${MARK}refused`)
  check('8a · the call was attempted', (r5?.calls ?? []).length === 1)
  check('8a · ⛔ and REFUSED by the ownership gate', r5?.calls?.[0]?.result?.refused === 'ownership_undeclared')
  const occ5 = (await occasions()).find((o) => o.why === `${MARK}refused`)
  check('8a · ⭐⭐ outcome is REFUSED, ⛔ not "keep" — attempted ≠ effected',
    occ5?.outcome === 'refused', `${occ5?.outcome}`)
  check('8a · ⭐ tools_called records the attempt and tools_effected is EMPTY',
    (occ5?.tools_called ?? []).includes('keep') && (occ5?.tools_effected ?? []).length === 0,
    `called=${(occ5?.tools_called ?? []).join(',')} effected=${(occ5?.tools_effected ?? []).join(',')}`)

  // 8b · ⭐⭐ MIXED — one door landed, one did not. The pair must stay readable.
  const r6 = await fire(emits(
    { name: 'keep', args: { what: `${MARK}still no owner`, kind: 'fact' } },                       // ⛔ refused
    { name: 'decline_to_remember', args: { about: `${MARK}but this one lands`, kind: 'not_worth_keeping' } },
  ), `${MARK}mixed`)
  check('8b · both attempted', (r6?.calls ?? []).length === 2)
  const occ6 = (await occasions()).find((o) => o.why === `${MARK}mixed`)
  check('8b · ⭐⭐ outcome is DECLINE — only what was EFFECTED counts (⛔ previously "both")',
    occ6?.outcome === 'decline', `${occ6?.outcome}`)
  check('8b · ⭐ and the pair is fully readable: attempted both, effected one',
    (occ6?.tools_called ?? []).length === 2 && (occ6?.tools_effected ?? []).join(',') === 'decline_to_remember',
    `called=${(occ6?.tools_called ?? []).length} effected=${(occ6?.tools_effected ?? []).join(',')}`)

  // 8c · ⭐⭐⭐ PROSE — the measured live failure, reproduced deterministically.
  const PROSE = [
    'Therefore there is nothing here I need to carry forward.',
    '',
    'decline_to_remember',
    'about: a procedural phrase',
    'kind: not_worth_keeping',
  ].join('\n')
  const r7 = await fire(async () => ({ content: PROSE, tool_calls: [] }), `${MARK}prose`)
  check('8c · she called nothing', (r7?.calls ?? []).length === 0)
  const occ7 = (await occasions()).find((o) => o.why === `${MARK}prose`)
  check('8c · ⭐⭐⭐ outcome is PROSE, ⛔ not silence — a decision that never became an action',
    occ7?.outcome === 'prose', `${occ7?.outcome}`)
  check('8c · ⭐ the flag is stored, and the RAW TEXT is kept beside it for audit',
    occ7?.said_names_tool === true && /decline_to_remember/.test(String(occ7?.said ?? '')))
  check('8c · ⛔⛔ AND NOTHING WAS DISPATCHED — prose is observed, never executed',
    (occ7?.tools_called ?? []).length === 0 && (occ7?.tools_effected ?? []).length === 0)

  // 8d · ⛔ and ordinary silence still reads as silence — the classifier must not swallow it
  const occ3b = (await occasions()).find((o) => o.why === `${MARK}silence`)
  check('8d · ⛔ a reply naming NO door is still `silence`', occ3b?.outcome === 'silence' && occ3b?.said_names_tool === false,
    `${occ3b?.outcome}/${occ3b?.said_names_tool}`)

  // 8e · ⭐ the classifier is PURE and narrow — only doors that were actually offered
  check('8e · ⭐ it matches an OFFERED name', saidNamesOfferedTool('I will decline_to_remember this', ['keep', 'decline_to_remember']) === true)
  check('8e · ⛔ and ignores a tool that was NOT offered — a mention is not a decision',
    saidNamesOfferedTool('I could use remember_fact here', ['keep', 'decline_to_remember']) === false)
  check('8e · ⛔ empty text is not a decision', saidNamesOfferedTool('', ['keep']) === false)

  // ── 9 · ⭐⭐ THE CHAT SCRUBBER NO LONGER DESTROYS ITS OWN EVIDENCE ──────────────────────────────
  const { detectToolCallText, scrubToolCallText } = await import('../../Backend/app/chat/stream-guards.js')
  const NL = String.fromCharCode(10)
  const TAGGED = ['Let me save that.', '<tool_call>{"name": "remember_fact", "parameters": {"entity":"user"}}</tool_call>'].join(NL)
  const d = detectToolCallText(TAGGED)
  check('9 · ⭐ the detector sees what the scrub will remove', d.found === true && d.removedChars > 0,
    `${d.shapes.join(',')} −${d.removedChars} chars`)
  check('9 · ⛔ and the scrub still removes it, unchanged', !scrubToolCallText(TAGGED).includes('tool_call'))
  check('9 · ⛔ an ordinary reply is NOT flagged — a user asking about JSON keeps their JSON',
    detectToolCallText('Here is some JSON: {"name":"x","parameters":{}}').found === false)
  // ⚠️ THE HONEST LIMIT, asserted so it cannot be quietly overstated: the detector reports only what the
  // scrubber actually removes. The plain form measured on the retention path is NOT one of those shapes.
  check('9 · ⚠️ and it does NOT claim the plain prose form — the scrubber never touched that one',
    detectToolCallText(['decline_to_remember', 'about: x', 'kind: not_worth_keeping'].join(NL)).found === false)

  // ── 7 · ⛔ THE GENERATION-3 CORPUS IS UNTOUCHED ────────────────────────────────────────────────
  // ⚠️ THIS ASSERTED A FROZEN COUNT (77) AND WENT RED WHEN SOTERA SIMPLY KEPT RUNNING. ⛔ A number taken
  // at the moment a check was written is a claim about the past that expires. ⭐ What it MEANS is "this
  // experiment did not touch the corpus" — so measure that, by comparing against the count taken at the
  // top of this run.
  check('7 · ⛔ the reflection corpus is untouched — this experiment is isolated from it',
    Number((await one(`select count(*)::int n from ${S}.log_conversation_revisits where prompt_generation=3`)).n) === corpusBefore,
    `${corpusBefore} → unchanged`)
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
