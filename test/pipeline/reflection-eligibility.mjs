// ⛔ READ-ONLY. What would the reflection sweep pick right now, and what is each conversation's real
// unreviewed backlog?
//
//   node pipeline/reflection-eligibility.mjs
//
// ⚠️⚠️ `rolling_id` IS A GLOBAL SEQUENCE, NOT A PER-CONVERSATION COUNTER. My first version computed
// backlog as `max(rolling_id) − watermark` and reported **5,520 unreviewed messages** for a conversation
// that has **four**. ⛔ The number was arithmetic on two global sequence values and meant nothing.
// ⇒ backlog is COUNTED — `count(*) where rolling_id > watermark` — because that is the only form of the
// question that survives the ids being global.

import { devPg, devSchema } from '../harness.mjs'

const QUIET_MIN = 30   // memory.reflectionQuietMinutes, default
const MIN_MSGS = 4     // memory.reflectionMinMessages, default

const pg = devPg(); await pg.connect()
const S = devSchema()
const rows = (await pg.query(`
  with wm as (
    select conversation_id, max(up_to_rolling_id) up_to
      from ${S}.log_conversation_revisits where outcome = 'completed' group by 1)
  select left(c.id::text,8) cid, u.username room,
         coalesce(c.settings->>'probe','(null)') probe, c.settings->>'useMemory' use_mem,
         (select count(*)::int from ${S}.txn_messages m where m.conversation_id = c.id) msgs,
         coalesce(wm.up_to, 0)::bigint watermark,
         (select count(*)::int from ${S}.txn_messages m
           where m.conversation_id = c.id and m.rolling_id > coalesce(wm.up_to, 0)) unreviewed,
         (select max(m.created_at) from ${S}.txn_messages m where m.conversation_id = c.id) last_msg
    from ${S}.txn_conversations c
    left join ${S}.mst_users u on u.id = c.user_id
    left join wm on wm.conversation_id = c.id
   where c.incognito = false and c.excluded_from_evidence_at is null and c.archived_at is null`)).rows

const now = Date.now()
const scored = rows.map((r) => ({
  ...r,
  quietFor: r.last_msg ? Math.round((now - new Date(r.last_msg)) / 60000) : null,
  // ⛔ `reflectOnConversation` skips these itself; a list that ignored them would over-report eligibility.
  skipped: r.probe === 'true' ? 'probe' : (r.use_mem === 'false' ? 'memory-off' : null),
}))
const eligible = scored.filter((r) => !r.skipped && r.msgs >= MIN_MSGS && r.unreviewed > 0
  && r.quietFor != null && r.quietFor >= QUIET_MIN).sort((a, b) => b.unreviewed - a.unreviewed)

console.log(`\n══ ELIGIBLE FOR REFLECTION RIGHT NOW: ${eligible.length} ═══════════════════`)
console.log('   cid       room          msgs  watermark  UNREVIEWED  quiet')
for (const r of eligible.slice(0, 12)) {
  console.log(`   ${r.cid}  ${String(r.room).padEnd(12)} ${String(r.msgs).padStart(4)}  ${String(r.watermark).padStart(9)}  ${String(r.unreviewed).padStart(10)}  ${r.quietFor}m`)
}
const reflected = scored.filter((r) => r.watermark > 0)
console.log(`\n   conversations already reflected at least once: ${reflected.length}`)
// ⚠⚠ THIS LINE USED TO SAY "ELIGIBLE" ON THE STRENGTH OF `unreviewed > 0` ALONE, AND THAT WAS FALSE.
// `7198c1b0` was annotated ELIGIBLE while sitting 24 minutes into a 30-minute quiet gate — it was not in
// the eligible list two lines above, and the two halves of my own instrument disagreed on screen.
// ⛔ An annotation that states a conclusion the filter beside it contradicts is worse than no annotation.
// ⇒ it now names the SPECIFIC reason, and "waiting on the quiet gate" is a different fact from "fully
// reviewed" — one resolves on its own, the other needs somebody to speak.
for (const r of reflected) {
  const why = r.unreviewed === 0 ? 'ⓘ fully reviewed — a second run needs NEW messages'
    : r.skipped ? `ⓘ ${r.unreviewed} unreviewed, but skipped by the pass (${r.skipped})`
      : (r.quietFor ?? 0) < QUIET_MIN ? `⏳ ${r.unreviewed} unreviewed — waiting on the quiet gate (${r.quietFor}m of ${QUIET_MIN}m)`
        : `⭐ ELIGIBLE FOR A SECOND, CURSORED RUN (${r.unreviewed} unreviewed, quiet ${r.quietFor}m)`
  console.log(`   ${r.cid}  ${String(r.room).padEnd(12)} watermark=${String(r.watermark).padStart(5)} ${why}`)
}
const skipped = scored.filter((r) => r.skipped && r.msgs >= MIN_MSGS)
console.log(`\n   skipped by the pass itself: ${skipped.length}  (${[...new Set(skipped.map((r) => r.skipped))].join(', ')})`)
await pg.end()
