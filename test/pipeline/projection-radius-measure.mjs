// ⭐⭐⭐ B-D1 · THE RADIUS — measured as a COGNITIVE CONTRACT, ⛔ not a context budget.
//
//   node test/pipeline/projection-radius-measure.mjs
//
// Ote's framing, 2026-09-16, and it decides what this instrument measures:
//
//   ⭐ "What must Sotera be able to MOVE THROUGH and SEE in order to reason about a conversation correctly?"
//   ⛔ rather than "How much conversation can we fit into the context window?"
//   — the latter is an implementation constraint; the former is the cognitive contract.
//
// ⇒ the primary numbers here are about REACH, not size: can she get from a statement to the CORRECTION that
// revises it · can she see both sides · how much of a real conversation does one window actually cover. The
// token cost is reported beside them because it is a real constraint — ⛔ but it is not the question.
//
// ⛔ READ-ONLY. It writes nothing and calls no model. It measures the SHIPPED window function against the
// real corpus at several radii.
import { devPg, devSchema } from '../harness.mjs'

const pg = devPg(); await pg.connect()
const S = `"${devSchema()}"`
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const RADII = [2, 4, 6, 8, 12]
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)

// Conversations substantial enough for the question to mean anything.
const convs = await q(`SELECT conversation_id::text AS cid, count(*) AS n
                       FROM ${S}."txn_messages" GROUP BY 1 HAVING count(*) >= 8 ORDER BY count(*) DESC LIMIT 120`)

console.log('\n══════════════════════════════════════════════════════════════════════════════════')
console.log('  B-D1 · THE RADIUS AS A COGNITIVE CONTRACT — ⛔ read-only, no model, no writes')
console.log('══════════════════════════════════════════════════════════════════════════════════')
console.log(`\n  corpus: ${convs.length} conversations of ≥8 messages\n`)

// ── ① REACH — can she get from any turn to a LATER REVISION of it? ─────────────────────────────────
// ⭐ THE CASE THAT DEFINES THE CONTRACT. The shelter failure was exactly this: the statement was visible and
// the correction that revised it was not. A radius that cannot span statement→correction is a radius that
// lets her answer confidently from superseded evidence.
const CORRECTION = /\b(actually|i mixed that up|sorry,? i meant|not \w+,? it'?s|correction|my mistake|no wait|scratch that|i was wrong)\b/i
let withCorrection = 0
const reach = Object.fromEntries(RADII.map((r) => [r, { near: 0, first: 0, of: 0 }]))
const dNear = []
const dFirst = []
for (const c of convs) {
  const ms = await q(`SELECT rolling_id, role, content FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid ORDER BY rolling_id`, [c.cid])
  const corr = ms.findIndex((m) => m.role === 'user' && CORRECTION.test(m.content))
  if (corr < 0) continue
  withCorrection++
  const priorUser = ms.map((m, i) => ({ m, i })).filter((x) => x.i < corr && x.m.role === 'user')
  if (!priorUser.length) continue
  const nearest = priorUser[priorUser.length - 1].i   // the turn immediately before it
  const first = priorUser[0].i                        // the conversation's opening statement
  dNear.push(corr - nearest)
  dFirst.push(corr - first)
  for (const r of RADII) {
    reach[r].of++
    // ⭐ CENTRED ON THE STATEMENT, which is the question that matters: standing at a claim, can she SEE the
    // turn that revises it? ⛔ Centring on the last turn instead measures conversation LENGTH, not reach —
    // the first version of this instrument did exactly that and produced a meaningless 0%→58% step.
    if (Math.abs(corr - nearest) <= r) reach[r].near++
    if (Math.abs(corr - first) <= r) reach[r].first++
  }
}
const med = (xs) => xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0
const p90 = (xs) => xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length * 0.9)] : 0
console.log('① ⭐⭐⭐ REACH · standing at a STATEMENT, can the window SEE the correction that revises it?')
console.log('')
console.log(`   conversations containing a correction: ${withCorrection} of ${convs.length}`)
console.log(`   turns from the NEAREST preceding user turn to the correction: median ${med(dNear)} · p90 ${p90(dNear)} · max ${Math.max(...dNear, 0)}`)
console.log(`   turns from the conversation's FIRST user turn to the correction: median ${med(dFirst)} · p90 ${p90(dFirst)} · max ${Math.max(...dFirst, 0)}`)
console.log('')
console.log('   ⓘ TWO BOUNDS, because which statement a correction revises cannot be known mechanically.')
console.log('     NEAREST is the lower bound on the reach required; FIRST is the upper bound.')
console.log('')
console.log(`   ${pad('radius', 9)}${pad('reaches NEAREST', 18)}${'reaches FIRST'}`)
for (const r of RADII) {
  const { near, first, of } = reach[r]
  const pn = of ? 100 * near / of : 0
  const pf = of ? 100 * first / of : 0
  console.log(`   ${pad('±' + r, 9)}${pad(rpad(near, 3) + '/' + of + '  ' + rpad(pn.toFixed(0) + '%', 5), 18)}${rpad(first, 3)}/${of}  ${rpad(pf.toFixed(0) + '%', 5)}`)
}

// ── ② COVERAGE — how much of a real conversation does one window actually show? ────────────────────
console.log('\n② COVERAGE · share of the conversation one centred window renders\n')
const cov = Object.fromEntries(RADII.map((r) => [r, []]))
let chars = Object.fromEntries(RADII.map((r) => [r, 0]))
for (const c of convs) {
  const n = Number(c.n)
  for (const r of RADII) cov[r].push(Math.min(n, r * 2 + 1) / n)
}
// characters actually rendered (clipped at 260 as the projection does)
for (const c of convs.slice(0, 40)) {
  const ms = await q(`SELECT content FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid ORDER BY rolling_id`, [c.cid])
  const centre = ms.length - 1
  for (const r of RADII) {
    for (const m of ms.slice(Math.max(0, centre - r), centre + r + 1)) chars[r] += Math.min(260, String(m.content).length)
  }
}
console.log(`   ${pad('radius', 9)}${pad('positions', 11)}${pad('mean coverage', 15)}${'mean chars/episode'}`)
for (const r of RADII) {
  const mean = cov[r].reduce((a, b) => a + b, 0) / cov[r].length
  console.log(`   ${pad('±' + r, 9)}${pad(r * 2 + 1, 11)}${pad((100 * mean).toFixed(0) + '%', 15)}${Math.round(chars[r] / 40).toLocaleString()}`)
}
console.log('\n   ⓘ chars are per EPISODE and the layer renders up to 5 — multiply by 5 for the block, and note')
console.log('     the adaptive budget measured ~99,000 tokens available on a real turn.')

// ── ③ THE SHIPPED DEFECT THIS REPLACED, quantified ────────────────────────────────────────────────
console.log('\n③ ⛔ WHAT THE PREVIOUS WINDOW ACTUALLY RETURNED (rolling_id arithmetic, radius 4)\n')
let short = 0, tot = 0, sum = 0
for (const c of convs) {
  const ms = (await q(`SELECT rolling_id FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid ORDER BY rolling_id`, [c.cid])).map((m) => m.rolling_id)
  if (ms.length < 9) continue
  const mid = ms[Math.floor(ms.length / 2)]
  const byRolling = ms.filter((r) => r >= mid - 4 && r <= mid + 4).length
  const i = ms.indexOf(mid)
  const byPos = ms.slice(Math.max(0, i - 4), i + 5).length
  tot++; sum += byRolling; if (byRolling < byPos) short++
}
console.log(`   ${short} of ${tot} conversations (${(100 * short / tot).toFixed(0)}%) returned FEWER messages than the radius promises`)
console.log(`   mean returned: ${(sum / tot).toFixed(2)} of 9`)
console.log('   ⚠️ `rolling_id` is ONE GLOBAL SEQUENCE, so a conversation interleaved with another has interior')
console.log('      gaps and the arithmetic window silently collapses. ⇒ B1 counts POSITIONS, not ids.')

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN.\n')
