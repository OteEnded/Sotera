// PREFILL PART DRIFT — which part of the LEADING system message changes between turns?
//
//   node test/pipeline/prefill-part-drift.mjs [--turns N]
//
// Sends the IDENTICAL question N times into one fresh agent_dev conversation and samples
// `contextUsage.parts` after each turn. A part whose token count moves is a proven cache-buster:
// everything after it in the rendered prompt is re-prefilled, including the ~12.5k of tool definitions.
//
// ⚠️⚠️ EQUAL TOKEN COUNTS DO NOT PROVE IDENTICAL BYTES. A part can change content at the same length.
// ⇒ a part that MOVES is PROVEN volatile; a part that holds is only NOT-YET-EXCLUDED. This instrument
// can convict, ⛔ it cannot acquit. Stated here because the distinction decided the 2026-09-15 reading.
//
// ⓘ 2026-09-15 result: `cognition` 539 → 648 → 757 on the identical question; every other part held.
//    Reference/docs/INVESTIGATION_SOTERA_PREFILL_PREFIX_CACHE.md
import { readFileSync } from 'node:fs'
import { TEST_USER, makeClient, devPg, devSchema } from '../harness.mjs'

const TURNS = Number(process.argv[process.argv.indexOf('--turns') + 1]) || 3
const Q = 'In one short paragraph, what is a tide?'

const config = JSON.parse(readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))
const call = makeClient()
const pg = devPg(); await pg.connect()
const S = devSchema()

if ((await call('u', 'POST', '/v1/auth/login', TEST_USER)).status !== 200) {
  console.error('✖ agent_dev login failed'); process.exit(1)
}
const convo = await call('u', 'POST', '/v1/chat/conversations', {
  title: 'prefill part drift',
  model: config.chat?.defaultModel,
  settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true } },
})
const cid = convo.json?.conversation?.id
if (!cid) { console.error('✖ no conversation:', convo.status); process.exit(1) }
console.log(`conversation ${cid}  ·  ${TURNS} turns  ·  identical question\n`)

const snapshots = []
for (let i = 1; i <= TURNS; i++) {
  const posted = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: Q, stream: false })
  if (posted.status >= 300) { console.error(`✖ turn ${i} REFUSED (${posted.status})`); process.exit(1) }
  const got = await call('u', 'GET', `/v1/chat/conversations/${cid}`)
  const cu = got.json?.contextUsage
  // ⚠️ Silence from a reader that normally prints is a FAILURE SIGNAL, not "nothing to show".
  if (!cu) { console.error(`✖ no contextUsage on turn ${i} — the endpoint shape changed`); process.exit(1) }
  snapshots.push(Object.fromEntries((cu.parts || []).map((p) => [p.key, p.tokens])))
  const { rows } = await pg.query(
    `select metrics from ${S}.txn_messages where conversation_id=$1 and role='assistant' order by created_at`, [cid])
  const m = rows[rows.length - 1]?.metrics || {}
  console.log(`turn ${i}: promptTokens ${m.promptTokens}  prefill ${m.promptEvalMs} ms  `
    + `(${(m.promptEvalMs / m.promptTokens).toFixed(4)} ms/tok)`)
}

const keys = [...new Set(snapshots.flatMap((s) => Object.keys(s)))].sort()
const head = snapshots.map((_, i) => `t${i + 1}`.padStart(7)).join('')
console.log(`\n${'part'.padEnd(24)}${head}   verdict`)
console.log('-'.repeat(30 + head.length))
const movers = []
for (const k of keys) {
  const vals = snapshots.map((s) => s[k] ?? 0)
  const moved = new Set(vals).size > 1
  if (moved) movers.push(k)
  console.log(`${k.padEnd(24)}${vals.map((v) => String(v).padStart(7)).join('')}   ${moved ? '<<< MOVES' : 'stable'}`)
}
console.log('-'.repeat(30 + head.length))
console.log(movers.length
  ? `⇒ PROVEN VOLATILE: ${movers.join(', ')} — everything after it in the prompt is re-prefilled.`
  : '⇒ no part moved by token count. ⛔ That is NOT proof of byte-stability — see the header.')
console.log(`\nconversation left in place: ${cid}`)
await pg.end()
