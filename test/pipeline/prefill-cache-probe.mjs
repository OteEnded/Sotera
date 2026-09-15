// PREFILL CACHE PROBE — does the prompt prefix survive BETWEEN turns?
//
//   node test/pipeline/prefill-cache-probe.mjs [--identical] [--turns N]
//
// Sends N turns back-to-back into ONE fresh agent_dev conversation (no gap, so KV eviction has no
// opportunity) and reports prefill cost per turn. Production settings: tools on, memory on, reasoning on.
//
//   --identical   send the SAME question every turn. ⭐ Use this: it kills the question-dependence
//                 confound, because the cognition layer's output is a function of what was asked.
//
// ⚠️⚠️ `promptEvalMs` is `Math.max` ACROSS ROUNDS (chat-site.route.js:277) — the WORST round of the turn.
// So a LOW value proves even the FIRST round was warm. The low direction is the unambiguous one; a high
// value could in principle be one bad round, which is why the identical arm matters.
//
// READ: turn 1 is the cold baseline. If turns 2+ drop to ~0.00x ms/tok the prefix SURVIVED between turns.
// If they stay at the turn-1 rate, something in the prompt changed — run `prefill-part-drift.mjs` next.
//
// ⓘ Background and the 2026-09-15 result: Reference/docs/INVESTIGATION_SOTERA_PREFILL_PREFIX_CACHE.md
import { readFileSync } from 'node:fs'
import { TEST_USER, makeClient, devPg, devSchema } from '../harness.mjs'

const IDENTICAL = process.argv.includes('--identical')
const TURNS = Number(process.argv[process.argv.indexOf('--turns') + 1]) || 4

const config = JSON.parse(readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))
const call = makeClient()
const pg = devPg(); await pg.connect()
const S = devSchema()

if ((await call('u', 'POST', '/v1/auth/login', TEST_USER)).status !== 200) {
  console.error('✖ agent_dev login failed'); process.exit(1)
}

const convo = await call('u', 'POST', '/v1/chat/conversations', {
  title: `prefill cache probe${IDENTICAL ? ' (identical)' : ''}`,
  model: config.chat?.defaultModel,
  settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true } },
})
const cid = convo.json?.conversation?.id
if (!cid) { console.error('✖ no conversation:', convo.status, String(convo.text).slice(0, 200)); process.exit(1) }

const VARIED = [
  'In one short paragraph, what is a tide?',
  'In one short paragraph, what is a glacier?',
  'In one short paragraph, what is a monsoon?',
  'In one short paragraph, what is an aquifer?',
  'In one short paragraph, what is an isthmus?',
]
const question = (i) => (IDENTICAL ? VARIED[0] : VARIED[i % VARIED.length])

console.log(`conversation ${cid}  ·  ${TURNS} turns  ·  ${IDENTICAL ? 'IDENTICAL question' : 'varied questions'}`)
console.log('='.repeat(92))

const rates = []
for (let i = 0; i < TURNS; i++) {
  const t0 = Date.now()
  const posted = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`,
    { content: question(i), stream: false })
  // ⚠️ A refused turn is not a slow turn. Fail loudly rather than averaging a refusal into the result.
  if (posted.status >= 300) {
    console.error(`✖ turn ${i + 1} REFUSED (${posted.status}): ${String(posted.text || '').slice(0, 200)}`)
    process.exit(1)
  }
  const wall = Date.now() - t0
  const { rows } = await pg.query(
    `select metrics from ${S}.txn_messages where conversation_id=$1 and role='assistant' order by created_at`, [cid])
  const m = rows[rows.length - 1]?.metrics || {}
  const ptok = Number(m.promptTokens) || 0
  const pms = m.promptEvalMs == null ? null : Number(m.promptEvalMs)
  const rate = ptok && pms != null ? pms / ptok : null
  if (rate != null) rates.push(rate)
  console.log(`turn ${String(i + 1).padStart(2)}  promptTokens ${String(ptok).padStart(6)}  `
    + `prefill ${String(pms ?? 'null').padStart(6)} ms  ${rate == null ? '' : `${rate.toFixed(4)} ms/tok`}  `
    + `ttft ${String(m.ttftMs ?? '?').padStart(6)} ms  wall ${wall} ms`)
}

console.log('='.repeat(92))
if (rates.length > 1) {
  const first = rates[0]
  const rest = rates.slice(1)
  const best = Math.min(...rest)
  console.log(`turn 1 ${first.toFixed(4)} ms/tok · best later turn ${best.toFixed(4)} ms/tok · `
    + `speedup ${(first / best).toFixed(1)}x`)
  console.log(best < first / 10
    ? '⇒ the prefix SURVIVED between turns (cache is landing).'
    : '⇒ the prefix did NOT survive. Something in the prompt changed — run prefill-part-drift.mjs.')
}
console.log(`\nconversation left in place: ${cid}`)
await pg.end()
