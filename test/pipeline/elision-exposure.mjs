// ⭐⭐⭐ THE CURSOR/ELISION BOUNDARY — how much material has the watermark swept past unseen?
//
//   node pipeline/elision-exposure.mjs
//
// Ote, 2026-08-26: *"up_to cannot simultaneously mean 'sweep reached here' and 'model reviewed through
// here' when 120 messages were elided. Characterize the cursor/elision boundary first… Don't patch yet."*
//
// ── ⛔ READ-ONLY. No row written, no schema touched, no content printed ─────────────────────────────
// Message text is read (it is needed to measure transcript LENGTH) and ⛔ never displayed. Only counts,
// character totals and ids appear in the output.
//
// ── ⭐⭐ THE METHOD, AND WHY IT CAN BE TRUSTED ─────────────────────────────────────────────────────
// It does NOT reimplement the shaping rule. It imports the SAME `unreviewedSlice` and
// `shapeReflectionTranscript` the lane runs, replays each historical revisit against the messages that
// existed at its watermark, and then CHECKS ITSELF: the recomputed `considered` must equal the
// `messages_considered` actually stored on the row.
// ⭐ That self-check is the whole basis for believing the elision numbers. A reconstruction that cannot
// reproduce the recorded value is measuring something else, and says so rather than reporting.

import { devPg, devSchema } from '../harness.mjs'
import { unreviewedSlice, shapeReflectionTranscript } from '../../Backend/app/components/reflection-lifecycle.js'

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows

const rows = await q(`
  select r.rolling_id, r.conversation_id, left(r.conversation_id::text, 8) cid,
         r.from_rolling_id, r.up_to_rolling_id, r.messages_considered, r.outcome, r.requested_at,
         coalesce(u.username, '?') room
    from ${S}.log_conversation_revisits r
    left join ${S}.mst_users u on u.id = r.user_id
   where r.outcome = 'completed'
   order by r.requested_at`)

console.log(`\n══ CURSOR / ELISION BOUNDARY ═══════════════════════════════════════`)
console.log(`   completed revisits examined : ${rows.length}`)

const report = []
let faithful = 0
let unfaithful = 0

for (const r of rows) {
  const msgs = await q(
    `select rolling_id, role, content from ${S}.txn_messages
      where conversation_id = $1 and rolling_id <= $2 order by rolling_id`,
    [r.conversation_id, r.up_to_rolling_id])
  // `already` is the PRIOR completed cursor. The row stores `from` = first NEW message = already + 1.
  const already = r.from_rolling_id == null ? 0 : Number(r.from_rolling_id) - 1
  const { slice, contextCount, newCount } = unreviewedSlice(msgs, { already })
  const shaped = shapeReflectionTranscript(slice)

  // ⭐ THE SELF-CHECK. If this disagrees, the replay is not the run and nothing below it is evidence.
  const matches = shaped.considered === Number(r.messages_considered)
  if (matches) faithful += 1; else unfaithful += 1

  const chars = slice.map((m) => `${m.role}: ${String(m.content || '').replace(/\s+/g, ' ').slice(0, 1500)}`).join('\n').length
  report.push({
    ...r,
    sliceLen: slice.length,
    contextCount,
    newCount,
    considered: shaped.considered,
    elided: shaped.elided,
    skipped: shaped.elided ? slice.length - shaped.considered : 0,
    chars,
    matches,
  })
}

console.log(`   replay reproduces the stored count : ${faithful}/${rows.length}`)
if (unfaithful) {
  console.log(`   ⛔⛔ ${unfaithful} row(s) DID NOT reproduce — the replay is not faithful for those, and`)
  console.log(`      their elision numbers below are ⛔ NOT evidence. Listed so they are not silently dropped:`)
  for (const x of report.filter((x2) => !x2.matches).slice(0, 10)) {
    console.log(`         #${x.rolling_id} ${x.cid}  stored=${x.messages_considered} replay=${x.considered} slice=${x.sliceLen}`)
  }
}

const trusted = report.filter((x) => x.matches)
const elided = trusted.filter((x) => x.elided)

console.log(`\n   ── ELISION ────────────────────────────────────────────────────`)
console.log(`   revisits that elided material : ${elided.length} of ${trusted.length} trusted`)
console.log(`   messages swept past UNSEEN    : ${elided.reduce((a, x) => a + x.skipped, 0)}`)
console.log(`   ⛔ every one of those is now BELOW a watermark and will never be offered again.`)

if (elided.length) {
  console.log(`\n   worst cases (skipped = in-range but never shown to her):`)
  console.log(`      #row   cid       room          slice  considered  SKIPPED  transcript chars`)
  for (const x of [...elided].sort((a, b) => b.skipped - a.skipped).slice(0, 10)) {
    console.log(`      #${String(x.rolling_id).padEnd(5)} ${x.cid}  ${String(x.room).padEnd(12)} ${String(x.sliceLen).padStart(5)}  ${String(x.considered).padStart(10)}  ${String(x.skipped).padStart(7)}  ${String(x.chars).padStart(7)}`)
  }
}

// ── ⭐ THE THRESHOLD, OBSERVED RATHER THAN ASSUMED ───────────────────────────────────────────────
// The rule is `> 24000 chars ⇒ head 20 + tail 20`. ⇒ the interesting population is what sits NEAR it:
// a conversation just under is intact, one just over loses its middle, and nothing announces which.
const near = trusted.filter((x) => x.chars > 12000 && x.chars <= 24000)
console.log(`\n   ── THE CLIFF ──────────────────────────────────────────────────`)
console.log(`   intact but within 2x of the limit : ${near.length}  (12k–24k chars — one busy day from eliding)`)
console.log(`   largest intact transcript         : ${trusted.filter((x) => !x.elided).reduce((m, x) => Math.max(m, x.chars), 0)} chars`)
console.log(`   smallest elided transcript        : ${elided.length ? elided.reduce((m, x) => Math.min(m, x.chars), Infinity) : '—'} chars`)

// ── ⭐⭐ DOES THE BACKLOG DRAIN? the loop-forever question, measured ─────────────────────────────
// Ote: *"without causing the backlog to loop forever."* ⇒ the question is a RATE comparison: how fast do
// messages arrive in a room, versus how much a single reflection can absorb.
const [rate] = await q(`
  select count(*)::int msgs,
         extract(epoch from (max(created_at) - min(created_at)))/3600 hours
    from ${S}.txn_messages where created_at > now() - interval '24 hours'`)
const perHour = rate.hours > 0 ? rate.msgs / rate.hours : 0
console.log(`\n   ── DRAIN RATE ─────────────────────────────────────────────────`)
console.log(`   messages in the last 24h      : ${rate.msgs} over ${Number(rate.hours).toFixed(1)}h  ⇒ ${perHour.toFixed(1)}/hour across ALL rooms`)
console.log(`   a reflection absorbs          : up to 24,000 chars, else 40 messages (head 20 + tail 20)`)
console.log(`   the sweep runs                : every 20 min ⇒ 3 opportunities/hour, one conversation each`)
console.log(`   ⇒ ⭐ capacity is NOT the binding constraint at this volume; the 30-minute quiet gate is.`)
console.log(`      ⛔ A busy room can stay ineligible for hours while its backlog grows past the cliff —`)
console.log(`      which is exactly what 7198c1b0 did today, and why it elided.`)

await pg.end()
