// ⭐⭐ HOW CLOSE IS ANY ROOM TO THE CASE B WAS BUILT FOR?
//
//   node pipeline/backlog-watch.mjs
//
// Ote, 2026-08-26: *"The remaining proof is specifically the case we designed B for: a naturally
// accumulated backlog that exceeds the reflection transcript budget, producing up_to < conversation
// head… Do not manufacture traffic or backlog to create this case. Let it arise naturally."*
//
// ⛔ READ-ONLY, AND DELIBERATELY PASSIVE. It sends no message, opens no conversation, forces no
// reflection and writes nothing. It exists to answer *when should we expect this naturally*, so that
// waiting is an informed decision rather than an open-ended one. ⛔ No message content is printed.
//
// ── ⭐ WHAT MAKES A CONVERSATION A CANDIDATE ────────────────────────────────────────────────────
// The oversized case needs the UNREVIEWED slice (context + everything above the watermark) to exceed
// `maxChars`. ⇒ measured with the SAME `selectReviewableRange` the lane runs, so this cannot drift from
// the real rule — the mistake that made an earlier instrument report 5,520 unreviewed messages for a
// four-message conversation.

// ── ⚠️ THE GATE IS IMPORTED, ⛔ NEVER REIMPLEMENTED ──────────────────────────────────────────────
// The first version of this file filtered on incognito / probe / useMemory / archived by hand and left
// out `reflectionMinMessages`. It then reported 15 "candidates" — ⛔ every one of them a 2-message
// conversation the lane will never touch. ⭐ An instrument whose filter differs from the mechanism's
// filter describes a system that does not exist; it is the same defect that once made a backlog reader
// claim 5,520 unreviewed messages for a four-message conversation.
import { devPg, devSchema } from '../harness.mjs'
import { selectReviewableRange, transcriptLine, isReadyToReflect } from '../../Backend/app/components/reflection-lifecycle.js'

const MAX_CHARS = 24000
const QUIET_MIN = 30

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows
const L = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false }) : '—')

const [{ n: now }] = await q('select now() n')

const convs = await q(`
  with wm as (
    select conversation_id, max(up_to_rolling_id) up_to
      from ${S}.log_conversation_revisits where outcome = 'completed' group by 1)
  select c.id, left(c.id::text,8) cid, coalesce(u.username,'?') room,
         coalesce(wm.up_to, 0)::bigint watermark,
         (select max(m.created_at) from ${S}.txn_messages m where m.conversation_id = c.id) last_msg,
         (select max(m.rolling_id) from ${S}.txn_messages m where m.conversation_id = c.id)::bigint head
    from ${S}.txn_conversations c
    left join ${S}.mst_users u on u.id = c.user_id
    left join wm on wm.conversation_id = c.id
   where c.incognito = false and c.excluded_from_evidence_at is null and c.archived_at is null
     and coalesce(c.settings->>'probe','') <> 'true'
     and coalesce(c.settings->>'useMemory','') <> 'false'`)

const rows = []
const skipped = new Map()
for (const c of convs) {
  if (c.head == null || Number(c.head) <= Number(c.watermark)) continue   // nothing unreviewed
  const msgs = await q(
    `select rolling_id, role, content from ${S}.txn_messages
      where conversation_id = $1 order by rolling_id`, [c.id])

  // ⭐ THE LANE'S OWN VERDICT, not my approximation of it. `ready:false` for a reason other than the
  // quiet gate means this conversation can never become the oversized case, however much text it holds.
  const gate = isReadyToReflect({
    messages: msgs.length,
    topRollingId: Number(c.head),
    lastReflectedUpTo: Number(c.watermark),
    lastMessageAt: c.last_msg,
    now: +now,
    quietMinutes: QUIET_MIN,
    minMessages: 4,
  })
  // ⭐ 'not-quiet' is the ONLY refusal that resolves on its own with time. Every other reason means
  // this conversation is structurally out of the running, so it can never become the oversized case.
  if (!gate.ready && gate.reason !== 'not-quiet') {
    skipped.set(gate.reason, (skipped.get(gate.reason) ?? 0) + 1)
    continue
  }

  const sel = selectReviewableRange(msgs, { already: Number(c.watermark), maxChars: MAX_CHARS })
  if (!sel.slice.length) continue
  // the FULL unreviewed cost, not the bounded one — that is what decides whether the case triggers
  const firstNew = msgs.findIndex((m) => Number(m.rolling_id) > Number(c.watermark))
  const start = Math.max(0, firstNew - 6)
  const fullChars = msgs.slice(start).map((m) => transcriptLine(m)).join('\n').length
  const quiet = c.last_msg ? (now - c.last_msg) / 60000 : null
  rows.push({
    ...c,
    fullChars,
    pct: (100 * fullChars) / MAX_CHARS,
    wouldTruncate: sel.truncated,
    wouldReviewTo: sel.reviewedTo,
    remaining: sel.remaining,
    quiet,
  })
}

rows.sort((a, b) => b.fullChars - a.fullChars)

console.log(`\n══ BACKLOG WATCH · how close is anything to the oversized case? ═══════`)
console.log(`   now ${L(now)} +07   ·   budget ${MAX_CHARS.toLocaleString()} chars   ·   quiet gate ${QUIET_MIN}m`)
// ⭐ The exclusions are printed BEFORE the empty check. "Nothing to watch" and "nothing to watch, and
// here is what was ruled out and why" are different reports, and the first one on its own invites the
// question this instrument already answered.
const skipLine = () => {
  if (!skipped.size) return
  console.log(`\n   ⓘ excluded by the lane's own gate: `
    + [...skipped].map(([r, n]) => `${r}=${n}`).join(' · ')
    + '  ⇒ these can never produce the case, whatever they accumulate')
}

if (!rows.length) {
  console.log('\n   ⏳ no conversation currently holds unreviewed material that the lane would act on.')
  skipLine()
  console.log('\n   ⛔ Nothing will be done to hurry this — Ote: "Do not manufacture traffic or backlog')
  console.log('      to create this case. Let it arise naturally."')
  await pg.end(); process.exit(0)
}

console.log(`\n   cid       room          unreviewed  of budget  head   would review to  left behind  quiet`)
for (const r of rows.slice(0, 15)) {
  const bar = r.wouldTruncate ? '⭐ TRUNCATES' : `${r.pct.toFixed(0)}%`
  console.log(`   ${r.cid}  ${String(r.room).padEnd(12)} ${String(r.fullChars).padStart(10)}  ${String(bar).padStart(11)}  `
    + `${String(r.head).padStart(5)}  ${String(r.wouldReviewTo ?? '—').padStart(15)}  ${String(r.remaining).padStart(11)}  `
    + `${r.quiet == null ? '—' : `${r.quiet.toFixed(0)}m`}`)
}

skipLine()

const ready = rows.filter((r) => r.wouldTruncate)
console.log(`\n   ── VERDICT ────────────────────────────────────────────────────`)
if (ready.length) {
  console.log(`   ⭐⭐ ${ready.length} conversation(s) WOULD PRODUCE up_to < head on their next reflection:`)
  for (const r of ready) {
    console.log(`      ${r.cid} (${r.room}): head=${r.head}, would review to ${r.wouldReviewTo}, `
      + `${r.remaining} message(s) left for the next run`)
    console.log(`         ${r.quiet != null && r.quiet >= QUIET_MIN
      ? '⭐ quiet gate is OPEN — the next cron tick (:00/:20/:40) should run it'
      : `⏳ waiting on the quiet gate (${r.quiet == null ? '?' : r.quiet.toFixed(0)}m of ${QUIET_MIN}m)`}`)
  }
} else {
  const top = rows[0]
  console.log(`   ⏳ none yet. Closest: ${top.cid} (${top.room}) at ${top.fullChars.toLocaleString()} chars `
    + `= ${top.pct.toFixed(0)}% of budget.`)
  console.log(`   ⛔ Nothing will be done to hurry this — Ote: "Do not manufacture traffic or backlog to`)
  console.log(`      create this case. Let it arise naturally."`)
}
await pg.end()
