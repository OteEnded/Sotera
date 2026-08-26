// ⭐⭐⭐ THE REFLECTION LIFECYCLE, MEASURED END TO END — and whether the cursor actually advances.
//
//   node pipeline/reflection-lifecycle-measure.mjs            (everything since the registry fix)
//   node pipeline/reflection-lifecycle-measure.mjs --all      (the whole history, for context)
//
// Ote, 2026-08-26, after the gate stopped being permanently fail-closed: *"Let the watcher catch the
// first actual reflection row. Then measure the full lifecycle: selected conversation, from → to message
// range, completion/failure, outcome, cursor advancement, and whether it affects the interactive
// queue/latency. One successful run proves the worker works. I want at least the next cursored run to
// prove that it naturally continues from where the previous reflection stopped."*
//
// ── ⛔ WHAT THIS READS AND WHAT IT REFUSES TO READ ────────────────────────────────────────────────
// ⛔ It never prints `text` — that is her reflection, about other people's rooms, and the standing rule
// is *say THAT it exists, never WHAT it says*. Lengths, ids, ranges, timings and outcomes only.
// ⛔ It changes nothing. No row is written, no cursor is moved, no conversation is touched.
//
// ── ⭐⭐ THE ONE CLAIM THAT NEEDS TWO RUNS ────────────────────────────────────────────────────────
// A single completed run proves the worker executes. It does **not** prove the cursor works: a lane that
// re-reads the same window forever also completes, every time, and looks healthy. ⇒ continuity is only
// visible in the SECOND run on the same conversation, and this file reports it as ⛔ UNPROVEN until it
// has two.

import { devPg, devSchema } from '../harness.mjs'

const ALL = process.argv.includes('--all')
// ⭐ The registry fix — everything after this is the behaviour under test. Before it, the gate was
// permanently fail-closed and there is nothing to measure.
const SINCE = '2026-08-26T09:31:00Z'

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows
const ms = (a, b) => (a && b ? `${((new Date(b) - new Date(a)) / 1000).toFixed(1)}s` : '—')

const rows = await q(
  `select r.id::text id, r.rolling_id, r.requested_at, r.started_at, r.completed_at,
          r.conversation_id::text cid, r.from_rolling_id, r.up_to_rolling_id, r.messages_considered,
          r.outcome, r.reason, r.failure, r.tools_used, r.blocked_by_disclosure,
          r.wrote_memory_id::text wrote, r.model, r.prompt_generation,
          length(coalesce(r.text,'')) text_len,
          u.username room, left(c.title, 0) _t
     from ${S}.log_conversation_revisits r
     left join ${S}.mst_users u on u.id = r.user_id
     left join ${S}.txn_conversations c on c.id = r.conversation_id
    ${ALL ? '' : 'where r.requested_at >= $1'}
    order by r.requested_at asc`, ALL ? [] : [SINCE])

console.log(`\n══ REFLECTION LIFECYCLE ${ALL ? '· FULL HISTORY' : `· SINCE THE REGISTRY FIX (${SINCE})`} ═══`)
console.log('   ⛔ read-only · ⛔ her reflection text is never printed\n')

if (!rows.length) {
  console.log('   ⛔ NO ATTEMPTS IN THIS WINDOW.')
  console.log('   ⚠️ That is a real state, not an error — and it is NOT proof of anything about the worker.')
  console.log('      The gate may legitimately be holding: `anyActive` (a turn is running) or the cool-down.')
  console.log('      ⇒ re-run once the log shows a tick that was not held back.')
  await pg.end(); process.exit(0)
}

for (const r of rows) {
  console.log(`   #${r.rolling_id}  ${r.requested_at.toISOString().slice(0, 19)}  room=${r.room ?? '?'}  conv=${r.cid.slice(0, 8)}`)
  console.log(`      range        : from ${r.from_rolling_id ?? '(start)'} → up_to ${r.up_to_rolling_id}   considered=${r.messages_considered ?? '—'}`)
  console.log(`      outcome      : ${r.outcome ?? '⏳ OPEN (no completion recorded)'}${r.failure ? `  ⛔ ${String(r.failure).slice(0, 90)}` : ''}`)
  console.log(`      timing       : requested→started ${ms(r.requested_at, r.started_at)}   started→completed ${ms(r.started_at, r.completed_at)}`)
  console.log(`      produced     : text ${r.text_len} chars · tools ${(r.tools_used ?? []).join(',') || 'none'} · wrote ${r.wrote ? r.wrote.slice(0, 8) : 'nothing'} · disclosure-blocked ${r.blocked_by_disclosure}`)
  console.log('')
}

// ── ⭐⭐⭐ CURSOR CONTINUITY — the claim that needs two runs on one conversation ──────────────────
console.log('══ CURSOR ADVANCEMENT ═══════════════════════════════════════════════')
const byConv = new Map()
for (const r of rows) {
  if (!byConv.has(r.cid)) byConv.set(r.cid, [])
  byConv.get(r.cid).push(r)
}
// ⚠⚠ A ROW WRITTEN BEFORE THE CURSOR WRITER EXISTED CANNOT CARRY A `from`, AND CALLING THAT A FAILURE
// IS AN INSTRUMENT DEFECT. My first version reported *"DOES NOT CONTINUE"* on every historical pair — all
// 68 of them predate `cd5841e` (2026-08-25 08:05Z), which is the commit that first wrote
// `from_rolling_id`. ⛔ The column was null because the code that sets it did not exist, not because a
// cursor failed. ⭐ Same lesson as reading the noticing population with the previous generation's field
// names: **check the reader against the code that wrote the row.**
const CURSOR_WRITER_SHIPPED = new Date('2026-08-25T08:05:15Z')
let pairs = 0; let contiguous = 0; let restarted = 0; let predates = 0
for (const [cid, list] of byConv) {
  if (list.length < 2) continue
  for (let i = 1; i < list.length; i += 1) {
    const prev = list[i - 1]; const cur = list[i]
    // ⛔ ONLY A COMPLETED PREDECESSOR SETS A CURSOR. A failed or preempted attempt must NOT be expected
    // to have moved the watermark — treating it as one would manufacture a "restart" that never happened.
    if (prev.outcome !== 'completed') continue
    if (new Date(cur.requested_at) < CURSOR_WRITER_SHIPPED) {
      predates += 1
      console.log(`   conv ${cid.slice(0, 8)}  #${prev.rolling_id} → #${cur.rolling_id}   ⓘ predates the cursor writer — ⛔ not a failure`)
      continue
    }
    pairs += 1
    const expected = Number(prev.up_to_rolling_id) + 1
    const got = cur.from_rolling_id == null ? null : Number(cur.from_rolling_id)
    const ok = got === expected
    if (ok) contiguous += 1; else restarted += 1
    console.log(`   conv ${cid.slice(0, 8)}  #${prev.rolling_id}(up_to ${prev.up_to_rolling_id}) → #${cur.rolling_id}(from ${got ?? 'null'})`)
    console.log(`      ${ok ? '✅ CONTINUES from where the previous one stopped' : `⛔ DOES NOT CONTINUE — expected from=${expected}`}`)
  }
}
if (!pairs) {
  console.log(`   ⛔ UNPROVEN — no conversation has two POST-CURSOR attempts yet${predates ? ` (${predates} pair(s) predate the writer)` : ''}.`)
  console.log('   ⭐⭐⭐ AND THE MECHANISM HAS NEVER EXECUTED ONCE. The cursor writer shipped `cd5841e` at')
  console.log('      2026-08-25 08:05Z; the idle gate shipped `5b7c321` 59 MINUTES LATER and made the lane')
  console.log('      fail-closed until 2026-08-26. ⇒ zero attempts have ever exercised it.')
  console.log('   ⚠️ One completed run proves the worker executes. It does NOT prove the cursor works:')
  console.log('      a lane that re-reads the same window forever also completes every time and looks')
  console.log('      healthy. ⇒ continuity is only visible in the SECOND run on the same conversation.')
} else {
  console.log(`\n   ⇒ ${contiguous}/${pairs} consecutive pairs continue contiguously${restarted ? `  ⛔ ${restarted} restarted` : ''}`)
}

// ── ⭐⭐ DID IT TOUCH THE INTERACTIVE PATH? ──────────────────────────────────────────────────────
// The gate exists to keep a background 35B generation away from a live turn: `anyActive` is the hard
// interlock and the cool-down is the proxy for "she is still being read". ⇒ the measurable question is
// whether any USER message landed inside a run's window.
console.log('\n══ INTERACTIVE OVERLAP ══════════════════════════════════════════════')
let overlaps = 0
for (const r of rows) {
  if (!r.started_at || !r.completed_at) continue
  const [{ n }] = await q(
    `select count(*)::int n from ${S}.txn_messages m
       join ${S}.txn_conversations c on c.id = m.conversation_id
      where m.role = 'user' and m.created_at between $1 and $2`, [r.started_at, r.completed_at])
  if (n > 0) {
    overlaps += 1
    console.log(`   ⛔ #${r.rolling_id}  ${n} user message(s) landed during its run (${ms(r.started_at, r.completed_at)})`)
  }
}
console.log(overlaps === 0
  ? '   ✅ NO user message landed inside any run window — the interlock held.'
  : `   ⛔ ${overlaps} run(s) overlapped a live turn — the interlock did NOT hold.`)
// ⚠️ AND THE HONEST LIMIT: this shows OVERLAP, not LATENCY. A background generation can slow a turn it
// does not overlap, by holding the model resident — that would need a paired before/after timing run, and
// ⛔ this file does not claim to have measured it.
console.log('   ⚠️ This measures OVERLAP, ⛔ not latency: a background generation can still slow a turn it')
console.log('      never overlaps, by occupying the model. That needs a paired timing run and is not claimed here.')

// ── PREEMPTION, IF IT EVER FIRED ────────────────────────────────────────────────────────────────
const pre = rows.filter((r) => r.outcome === 'preempted')
console.log(`\n   preempted runs: ${pre.length}${pre.length ? `  (${pre.map((r) => `#${r.rolling_id}`).join(' ')})` : '  ⓘ none — nothing needed interrupting'}`)
const open = rows.filter((r) => !r.outcome)
if (open.length) console.log(`   ⚠️ OPEN attempts with no completion recorded: ${open.map((r) => `#${r.rolling_id}`).join(' ')} — the stale sweep should close these`)

await pg.end()
