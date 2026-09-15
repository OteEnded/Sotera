// PREFILL CONTEXT BREAKDOWN — where the prompt tokens actually go, for one conversation.
//
//   node test/pipeline/prefill-context-breakdown.mjs <conversationId>
//
// Reads the live `contextUsage` the route already computes (GET /v1/chat/conversations/:id) and prints
// it by bucket, then by individual system part. Read-only.
//
// ⭐ At ~0.35 ms/token of prefill on qwen3.6:35b, every column here converts directly to TTFT:
// 1,000 tokens removed is ~350 ms off every cold turn. The linear model was checked against the
// measurement (18,044 tok x 0.35 = 6,315 ms predicted vs 5,934 ms observed).
//
// ⓘ 2026-09-15: tool definitions were 12,754 of 18,044 tokens — 71% of the prompt.
//    Reference/docs/INVESTIGATION_SOTERA_PREFILL_PREFIX_CACHE.md
import { TEST_USER, makeClient } from '../harness.mjs'

const CID = process.argv[2]
if (!CID) { console.error('usage: node test/pipeline/prefill-context-breakdown.mjs <conversationId>'); process.exit(1) }

const call = makeClient()
if ((await call('u', 'POST', '/v1/auth/login', TEST_USER)).status !== 200) {
  console.error('✖ agent_dev login failed'); process.exit(1)
}

const r = await call('u', 'GET', `/v1/chat/conversations/${CID}`)
const cu = r.json?.contextUsage
if (!cu) {
  console.error(`✖ no contextUsage (HTTP ${r.status}). Keys: ${Object.keys(r.json || {}).join(', ') || '(none)'}`)
  process.exit(1)
}

const MS_PER_TOK = 0.35 // measured on qwen3.6:35b, 2026-09-15
console.log(`window ${cu.window}  used ${cu.used} (${cu.usedPct}%)  free ${cu.free}`
  + `${cu.projected === true ? '  ⚠ PROJECTED (no turn has run yet)' : ''}`)
console.log('-'.repeat(74))
for (const c of cu.categories || []) {
  const bar = '#'.repeat(Math.max(0, Math.round((c.tokens / cu.used) * 34)))
  console.log(`${String(c.label).padEnd(20)} ${String(c.tokens).padStart(7)} tok  ${String(c.pct ?? '').padStart(5)}%  `
    + `~${String(Math.round(c.tokens * MS_PER_TOK)).padStart(5)} ms  ${bar}`)
}
if (Array.isArray(cu.parts) && cu.parts.length) {
  console.log('-'.repeat(74) + '\nsystem parts (largest first):')
  for (const p of [...cu.parts].sort((a, b) => b.tokens - a.tokens)) {
    if (p.tokens > 0) console.log(`  ${String(p.key).padEnd(26)} ${String(p.tokens).padStart(6)} tok`)
  }
}
console.log('-'.repeat(74))
console.log(`total ~${Math.round(cu.used * MS_PER_TOK)} ms of prefill if nothing is cached.`)
