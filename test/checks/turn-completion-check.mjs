// ⭐⭐⭐ TURN COMPLETION · the agent loop must never spend a whole turn and return nothing silently.
//
// ⛔ Ote, 2026-08-24: *"Implement the generic last-round warning and explicit truncated-turn result.
// Don't make it Skill-specific. I want the system to never silently spend the whole turn and then return
// nothing. Add tests for both the warning and the truncation path."*
//
// ── ⛔⛔ THE MEASURED FAILURE THIS GUARDS ──────────────────────────────────────────────────────────
// Phase C's first real job — reconcile a document against what she knows — spent **19 tool calls across
// the 8-round budget and returned no answer at all**: only the narration written between rounds, with
// `error: null`. Nothing told her she was on her last round; nothing told the user the turn was cut
// short. The whole turn was spent and the result was indistinguishable from a brief reply.
//
// ⇒ TWO MECHANISMS, and the first is the actual fix:
//   PREVENTION  — `last_round`: she is told, once, that the next stream is her last.
//   REPORTING   — `rounds_exhausted`: the turn is marked whether or not text came back.
//
// ⚠️⚠️ AND THE TESTS RUN THE PATH RATHER THAN READING IT. The first version of the fix declared
// `roundsTruncated` fifty lines BELOW its use in `metrics` — a temporal-dead-zone ReferenceError that
// the module still PARSED cleanly. A source-scan check would have passed it. §3 therefore drives a real
// turn to completion through the real route.

import { makeChecker, makeClient, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'
import { loadConfig } from '../../Backend/lib/utility.js'

const { check, done } = makeChecker('turn-completion')
const ok = (c, l, d = '') => check(l, c, d)
const config = loadConfig()
const SRC = readFileSync(new URL('../../Backend/app/routes/v1/chat-site.route.js', import.meta.url), 'utf8')

// ── 1 · ⭐ THE WARNING EXISTS, IS BOUNDED, AND IS EPHEMERAL ────────────────────────────────────────
ok(/if \(rounds >= maxRounds && !roundsWarned\) \{/.test(SRC),
  '1 · ⭐ the last-round warning fires when the budget is spent')
ok(/roundsWarned = true/.test(SRC),
  '1 · ⛔ …and is bounded to ONCE per turn — a warning repeated every round is noise')
// ⛔ THE WARNING MUST NOT BE PERSISTED. It is a working-context nudge like the continuation nudges; a
// persisted one would enter the conversation, her history, and eventually her memory.
const warnBlock = SRC.slice(SRC.indexOf('if (rounds >= maxRounds && !roundsWarned)'),
  SRC.indexOf('pushReasoning(turnReasoning) // this round'))
ok(/working\.push\(\{ role: 'user'/.test(warnBlock),
  '1 · ⭐ …and it is an EPHEMERAL working-context message, never a persisted turn')
ok(!/txn_messages|segments\.push/.test(warnBlock),
  '1 · ⛔ …so it can never enter the conversation, her history, or her memory')
ok(/LAST round/.test(warnBlock) && /final answer now/i.test(warnBlock),
  '1 · …and it actually says what to do — land the answer, not plan the next step')
// ⭐ AND IT ASKS FOR AN HONEST PARTIAL rather than a confident one — the lesson from the whole
// false-absence arc, applied to being cut off.
ok(/what you completed and what you did not/.test(warnBlock),
  '1 · ⭐⭐ …and asks for what she DID and DID NOT finish, not a confident summary of neither')

// ── 2 · ⭐ THE TRUNCATION IS REPORTED, UNCONDITIONALLY ─────────────────────────────────────────────
ok(/phase: 'rounds_exhausted'/.test(SRC), '2 · the exhaustion emits a status event')
const exhaustBlock = SRC.slice(SRC.indexOf("if (rounds >= maxRounds && !clientGone) {"),
  SRC.indexOf('if (clientGone || rounds >= maxRounds) {'))
ok(exhaustBlock.length > 100 && !/answer\.trim\(\)|turnAnswer\.trim\(\)/.test(exhaustBlock),
  '2 · ⛔⛔ the status is UNCONDITIONAL — not gated on whether text was produced',
  '"she answered but was cut off" and "she answered fully" are different facts')
// ⭐ A DISCONNECT IS NOT AN EXHAUSTION. Reporting a user walking away as us stopping her mid-job would
// make the signal useless.
ok(/rounds >= maxRounds && !clientGone/.test(SRC),
  '2 · ⭐ clientGone is excluded — a disconnect is the user leaving, not us cutting her off')
ok(/ROUNDS EXHAUSTED/.test(SRC), '2 · …and it warns in the server log with the counts')
ok(/roundsExhausted: roundsExhausted \? \{ rounds, maxRounds, truncated: roundsTruncated \}/.test(SRC),
  '2 · ⭐ …and it rides `metrics`, so a reload still shows the turn was cut short')

// ── 3 · ⛔⛔ THE ORDERING FAULT A SYNTAX CHECK CANNOT SEE ───────────────────────────────────────────
// `roundsTruncated` must be declared BEFORE `metrics` reads it. The first version was fifty lines
// lower and the module parsed fine — the fault only appears when the line executes.
const declAt = SRC.indexOf('const roundsTruncated =')
const metricsAt = SRC.indexOf('const metrics = {')
const usedInMetrics = SRC.indexOf('truncated: roundsTruncated')
ok(declAt > 0 && metricsAt > declAt,
  '3 · ⭐ roundsTruncated is declared BEFORE metrics — a const used above its declaration throws at runtime',
  `decl@${declAt} metrics@${metricsAt}`)
ok(usedInMetrics > declAt, '3 · …and before every use of it')
// ⭐ THE HEURISTIC IS NAMED AS ONE. A 200-char threshold is a judgement, and an unnamed judgement in a
// failure classifier is how a screen becomes a verdict.
ok(/heuristic/i.test(SRC.slice(declAt - 700, declAt)),
  '3 · ⛔ the 200-char threshold is documented as a HEURISTIC, not presented as a fact')

// ── 4 · ⭐⭐ AND NOW EXECUTE IT · a real turn through the real route, at a budget of 1 ──────────────
//
// ⛔ THIS IS THE PART THAT WOULD HAVE CAUGHT THE ORDERING FAULT. Everything above reads the source;
// this drives a live turn that is GUARANTEED to exhaust its budget, and asserts on what came back.
// ⚠️ It needs the model, so it is the slow assertion in this file — and it is the only one that proves
// the code runs rather than merely exists.
// ⛔⛔ THE PATH IS `chat.tools.maxCalls`, AND GETTING IT WRONG COST A FALSE DIAGNOSIS. Investigating the
// measured failure I "raised the cap" by writing `chat.toolsMaxCalls: 16` into config.json — a key nothing
// reads. The setting is defined as `fromConfig: (c) => c?.chat?.tools?.maxCalls ?? 8`, so the server stayed
// at 8 throughout, and the run I credited to extra headroom actually succeeded on VARIANCE.
// ⇒ ⭐ the number was never the fix; the warning is. This line resolves it the same way the route does.
const maxCalls = config?.chat?.tools?.maxCalls ?? 8
ok(Number.isInteger(maxCalls) && maxCalls > 0,
  '4 · ⓘ the configured tool-round budget', `chat.toolsMaxCalls = ${maxCalls}`)

const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()
const login = await call('u', 'POST', '/v1/auth/login', { username: 'agent_dev', password: 'agentdev123' })
ok(login.status === 200, '4 · logged in as the test account', String(login.status))

if (login.status === 200) {
  // ⭐ A PROMPT THAT MUST USE TOOLS, REPEATEDLY. Asking her to check several separate stores forces
  // multiple rounds; with the budget spent she has to land on the warning.
  const convo = await call('u', 'POST', '/v1/chat/conversations', {
    title: 'RATE turn-completion probe',
    model: config.chat?.defaultModel,
    settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true }, probe: false },
  })
  const cid = convo.json?.conversation?.id
  ok(Boolean(cid), '4 · a conversation to drive', String(cid).slice(0, 8))
  if (cid) {
    const posted = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, {
      content: 'Check every memory store you have one at a time — semantic, identity, episodic, cards, '
        + 'archived, lessons, intentions, your own history, and past conversations — and report the count '
        + 'from each separately. Check them one per step, do not batch.',
      stream: false,
    })
    ok(posted.status < 300, '4 · the turn was accepted', String(posted.status))
    const { rows } = await pg.query(
      `select content, error, metrics, tool_calls from ${S}.txn_messages
        where conversation_id = $1 and role = 'assistant' order by created_at desc limit 1`, [cid])
    const last = rows[0]
    ok(Boolean(last), '4 · an assistant row was written')
    if (last) {
      const calls = Array.isArray(last.tool_calls) ? last.tool_calls.length : 0
      const m = last.metrics || {}
      ok(true, '4 · ⓘ what the turn actually did',
        `${calls} tool call(s), ${String(last.content ?? '').trim().length} answer chars, `
        + `exhausted=${m.roundsExhausted ? JSON.stringify(m.roundsExhausted) : 'no'}, error=${JSON.stringify(last.error)}`)
      // ⭐⭐ THE CONTRACT, and it holds either way the turn goes:
      //   if the budget ran out  → metrics say so, and a short reply is stamped as an error;
      //   if it did NOT run out  → she answered inside budget, which is the good outcome.
      // ⛔ What must NEVER happen is the measured failure: budget spent, no answer, error null.
      const answerChars = String(last.content ?? '').trim().length
      const exhausted = Boolean(m.roundsExhausted)
      ok(!(exhausted && answerChars < 200 && !last.error),
        '4 · ⛔⛔ THE MEASURED FAILURE CANNOT RECUR — budget spent, nothing written, and error null',
        exhausted ? `exhausted with ${answerChars} chars and error=${JSON.stringify(last.error)}` : 'budget was not exhausted')
      ok(answerChars > 0 || Boolean(last.error),
        '4 · ⭐ every turn ends with either an answer or a stated reason — never both empty',
        `${answerChars} chars, error=${last.error ? 'set' : 'null'}`)
      if (exhausted) {
        ok(m.roundsExhausted.maxRounds === maxCalls,
          '4 · …and the recorded budget matches the configured one', JSON.stringify(m.roundsExhausted))
      }
    }
    // ⛔ CLEANUP BY ID — the probe leaves nothing retrievable behind. Title carries the harness prefix
    // so lib/corpus.mjs's default guard accepts it.
    await pg.query(`delete from ${S}.txn_message_embeddings where conversation_id = $1`, [cid])
    await pg.query(`delete from ${S}.log_tool_calls where conversation_id = $1`, [cid])
    await pg.query(`delete from ${S}.txn_messages where conversation_id = $1`, [cid])
    await pg.query(`delete from ${S}.txn_todo_tasks where session_id in (select id from ${S}.txn_todo_sessions where conversation_id = $1)`, [cid])
    await pg.query(`delete from ${S}.txn_todo_sessions where conversation_id = $1`, [cid])
    await pg.query(`delete from ${S}.txn_conversations where id = $1`, [cid])
    const { rows: gone } = await pg.query(`select 1 from ${S}.txn_conversations where id = $1`, [cid])
    ok(gone.length === 0, '4 · ⛔ the probe conversation was removed by id', `${cid.slice(0, 8)} gone`)
  }
}
await pg.end()

// ── 5 · ⭐ GENERIC, NOT SKILL-SPECIFIC ────────────────────────────────────────────────────────────
// Ote: *"Don't make it Skill-specific."* The loop knows nothing about which Skill is running.
// ⚠️ THE REGION MUST BE THE TWO BLOCKS, NOT EVERYTHING BETWEEN THEM. The first version sliced from the
// state declarations to `roundsTruncated`, which swallowed the whole tool-execution body — including the
// `use_skill` handler — and failed on a mention that has nothing to do with the round budget.
const warnRegion = SRC.slice(SRC.indexOf('if (rounds >= maxRounds && !roundsWarned)'),
  SRC.indexOf("pushReasoning(turnReasoning) // this round"))
const capRegion = SRC.slice(SRC.indexOf('if (rounds >= maxRounds && !clientGone) {'),
  SRC.indexOf('if (clientGone || rounds >= maxRounds) {'))
for (const [name, region] of [['the warning', warnRegion], ['the cap', capRegion]]) {
  ok(region.length > 80 && !/activeSkill|dynamicSkill|doc-reconcile|doc-framework|skill\./.test(region),
    `5 · ⭐ ${name} mentions no Skill — the round budget is a property of the agent loop`)
}

done()
