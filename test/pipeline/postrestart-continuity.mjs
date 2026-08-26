// ⭐⭐⭐ POST-RESTART EVIDENCE for the range-bounded cursor (option B) + coverage guard (option C).
//
//   node pipeline/postrestart-continuity.mjs [sinceRevisitRollingId]
//
// Ote, 2026-08-26: *"I want the first post-restart evidence to show: from = previous reviewed watermark
// + 1 · up_to = actual reviewedTo · messages_considered = exactly what was supplied · elided = false ·
// coverage guard passed… with no gaps and no overlap."*
//
// ⛔ READ-ONLY. It observes rows the passive lane produced on its own. It starts no reflection, forces
// nothing, and writes nothing. ⛔ No content is printed — counts, ids and timestamps only.
//
// ── ⚠️ HOW `elided = false` IS PROVEN, GIVEN THE COLUMN DOES NOT EXIST ─────────────────────────────
// `log_conversation_revisits` has no `elided` column and ⛔ we are not adding one. So it is proven by
// RECONSTRUCTION: replay the row's own range through the same `selectReviewableRange` +
// `shapeReflectionTranscript` the lane ran, and require
//     shaped.elided === false  AND  shaped.considered === row.messages_considered
// ⭐ A replay that cannot reproduce the stored count is measuring different code and says so.
//
// ── ⭐ HOW "COVERAGE GUARD PASSED" IS PROVEN ──────────────────────────────────────────────────────
// The guard returns BEFORE the claim INSERT. ⇒ a row that exists with outcome='completed' is itself the
// evidence that the guard did not refuse. There is no separate flag to read, and inventing one would be
// a schema change.

import { devPg, devSchema } from '../harness.mjs'
import { selectReviewableRange, shapeReflectionTranscript } from '../../Backend/app/components/reflection-lifecycle.js'

const SINCE = Number(process.argv[2] ?? 660)

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows
const L = (d) => (d ? new Date(d).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false }) : '—')

const rows = await q(`
  select r.rolling_id, r.conversation_id, left(r.conversation_id::text, 8) cid, coalesce(u.username,'?') room,
         r.from_rolling_id, r.up_to_rolling_id, r.messages_considered, r.outcome, r.reason,
         r.requested_at, r.completed_at, r.code_mtime, r.model
    from ${S}.log_conversation_revisits r
    left join ${S}.mst_users u on u.id = r.user_id
   where r.rolling_id > $1
   order by r.rolling_id`, [SINCE])

console.log(`\n══ POST-RESTART REFLECTION EVIDENCE  (revisit rolling_id > ${SINCE}) ═══════════`)
if (!rows.length) {
  console.log('   ⏳ no new revisit rows yet — the passive lane has not run since the restart.')
  console.log('   ⛔ Nothing was forced. Cron sweeps at :00, :20, :40.')
  await pg.end()
  process.exit(0)
}

let allPass = true
const perConv = new Map()

for (const r of rows) {
  console.log(`\n   ── #${r.rolling_id} · ${r.cid} · ${r.room} ─────────────────────────────`)
  console.log(`      requested ${L(r.requested_at)}   outcome=${r.outcome ?? 'OPEN'}${r.reason ? ` reason=${r.reason}` : ''}`)
  console.log(`      code_mtime ${r.code_mtime ?? '—'}`)
  if (r.outcome !== 'completed') { console.log('      ⓘ not a completed run — skipped for continuity'); continue }

  // ── the row as stored ──
  const from = r.from_rolling_id == null ? null : Number(r.from_rolling_id)
  const upTo = Number(r.up_to_rolling_id)
  const considered = Number(r.messages_considered)

  // ── the previous completed watermark for this conversation ──
  const [prev] = await q(
    `select max(up_to_rolling_id)::bigint w from ${S}.log_conversation_revisits
      where conversation_id = $1 and outcome = 'completed' and rolling_id < $2`,
    [r.conversation_id, r.rolling_id])
  const prevWatermark = prev?.w == null ? 0 : Number(prev.w)

  // ── replay the row's own range through the shipping code ──
  const msgs = await q(
    `select rolling_id, role, content from ${S}.txn_messages
      where conversation_id = $1 and rolling_id <= $2 order by rolling_id`,
    [r.conversation_id, upTo])
  const sel = selectReviewableRange(msgs, { already: prevWatermark })
  const shaped = shapeReflectionTranscript(sel.slice)

  const chk = (label, pass, detail = '') => {
    console.log(`      ${pass ? '✅' : '⛔'} ${label}${detail ? `  — ${detail}` : ''}`)
    if (!pass) allPass = false
  }

  chk('from = previous reviewed watermark + 1',
    prevWatermark === 0 ? from === null : from === prevWatermark + 1,
    prevWatermark === 0 ? `first ever run ⇒ from=${from} (null is correct)` : `prev=${prevWatermark} from=${from}`)

  chk('up_to = the last message actually supplied (reviewedTo)',
    sel.reviewedTo === upTo, `replay reviewedTo=${sel.reviewedTo} row up_to=${upTo}`)

  chk('messages_considered = exactly what was supplied',
    considered === shaped.considered && considered === sel.slice.length,
    `row=${considered} replay-shaped=${shaped.considered} replay-slice=${sel.slice.length}`)

  chk('elided = false', shaped.elided === false, `transcript ${shaped.transcript.length} chars`)

  chk('coverage guard passed', r.outcome === 'completed',
    'the guard returns before the claim ⇒ a completed row could not exist if it had refused')

  // ⭐ the invariant itself, checked message by message
  const supplied = new Set(sel.slice.map((m) => Number(m.rolling_id)))
  const shouldCover = msgs.filter((m) => Number(m.rolling_id) > prevWatermark && Number(m.rolling_id) <= upTo)
  const missing = shouldCover.filter((m) => !supplied.has(Number(m.rolling_id)))
  chk('INVARIANT · every message <= up_to and > prev watermark was supplied, in full',
    missing.length === 0, `${shouldCover.length} in range, ${missing.length} missing`)

  console.log(`      ⓘ ${sel.contextCount} context + ${sel.newCount} new`)

  // ── ⭐⭐⭐ IS THIS THE OVERSIZED CASE? ──────────────────────────────────────────────────────────
  // ⛔ NOT "up_to < head as it stands now" — the head moves, so a message that arrived AFTER the run
  // would masquerade as material the run declined to review. ⭐ The honest test is what existed WHEN THE
  // RUN STARTED: a message created before `requested_at` and sitting above `up_to` is one this run chose
  // to leave behind, which is precisely the behaviour option B was built for and the old code could not
  // produce.
  const [left] = await q(
    `select count(*)::int c, min(rolling_id)::bigint next_id from ${S}.txn_messages
      where conversation_id = $1 and rolling_id > $2 and created_at < $3`,
    [r.conversation_id, upTo, r.requested_at])
  const leftBehind = Number(left?.c ?? 0)
  if (leftBehind > 0) {
    console.log(`      ⭐⭐⭐ OVERSIZED CASE: up_to=${upTo} < head-at-run-time — ${leftBehind} message(s) `
      + `existed already and were deliberately NOT reviewed.`)
    console.log(`         ⇒ the next run on this conversation must start at ${upTo + 1} (first unseen: ${left.next_id}).`)
  } else {
    console.log('      ⓘ backlog fully drained — ⛔ this run does NOT exercise the oversized case '
      + '(up_to and the head coincide because everything fitted).')
  }

  const list = perConv.get(r.cid) ?? []
  list.push({ row: r.rolling_id, from, upTo, at: r.requested_at })
  perConv.set(r.cid, list)
}

// ── ⭐⭐ CONSECUTIVE CONTINUITY: run1 A→X, run2 X+1→Y, run3 Y+1→Z ────────────────────────────────
console.log(`\n   ── CONTINUITY (no gaps, no overlap) ──────────────────────────────`)
let anyChain = false
for (const [cid, list] of perConv) {
  if (list.length < 2) {
    console.log(`   ${cid}: only ${list.length} completed run since the restart — ⓘ continuity needs at least 2`)
    continue
  }
  anyChain = true
  console.log(`   ${cid}:`)
  for (let i = 0; i < list.length; i += 1) {
    const cur = list[i]
    console.log(`      run ${i + 1}  #${cur.row}  ${cur.from ?? '(start)'} → ${cur.upTo}`)
    if (i === 0) continue
    const prev = list[i - 1]
    const contiguous = cur.from === prev.upTo + 1
    console.log(`         ${contiguous ? '✅' : '⛔'} starts at previous up_to + 1 `
      + `(${prev.upTo} + 1 = ${prev.upTo + 1}, got ${cur.from})`
      + `${contiguous ? '' : cur.from > prev.upTo + 1 ? '  ⛔ GAP' : '  ⛔ OVERLAP'}`)
    if (!contiguous) allPass = false
  }
}
if (!anyChain) console.log('   ⓘ no conversation has produced 2+ post-restart runs yet.')

console.log(`\n   ⇒ ${allPass ? '✅ ALL CHECKS PASSED' : '⛔ AT LEAST ONE CHECK FAILED'}`)
await pg.end()
