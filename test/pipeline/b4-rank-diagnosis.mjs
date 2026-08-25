// ⭐⭐⭐ WHY B4's RETRIEVAL NEVER REACHED THE SOURCE. ⛔ Mechanism only — no model, no generation.
//
// B4 answered Ote's question in the affirmative: unprompted, she made 12 tool calls, 9 of them
// `retrieve_conversations`. ⇒ SALIENCE IS NOT THE DEFECT. What failed is downstream: `about:` ranked the
// target conversation `24227cbb` below the cut every time, while the OLD tool — `search_conversations`,
// same corpus, same moment — returned it as hit #1.
//
// ⭐ This file measures exactly where it lands, because "the ranking is bad" is not a finding and
// "the exact-match conversation ranks #N of 60 message hits, behind K purely-recent ones" is.
//
// ── ⚠️ THE HYPOTHESIS BEING TESTED ──────────────────────────────────────────────────────────────────
// `rankWithin` asks conversation-search for **60 messages** with `denseMinSim: 0` — deliberately no
// relevance floor, calibrated for one- and two-word queries. Conversations holding one of those 60 sort
// first; everything else falls back to RECENCY. ⇒ if 60 loosely-related neighbours crowd out the exact
// keyword hit, the target drops into the recency tail and `limit: 6` never reaches it. That is the same
// **"a cap bounds the search, not the work"** shape this project has now paid for three times.

import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildConversationSearch } from '../../Backend/app/components/conversation-search.js'
import { makeEmbedder } from '../../Backend/app/components/memory-embed-host.js'

const TARGET = '24227cbb-e019-475a-8642-91d5c37cf7ee'
const pg = devPg(); await pg.connect()
const S = devSchema()
const db = await initDB(); setDB(db); await initSettings(db)
const config = loadConfig()
const fastify = { db, config, log: null }
const { rows: [me] } = await pg.query(`select id::text id from ${S}.mst_users where username='agent_dev'`)

// ⭐ The queries she ACTUALLY used in B4, verbatim from the tool trace — plus the one the old tool used.
// ⛔ Not queries invented afterwards to make a point.
const QUERIES = [
  ['about: (her 1st call)', 'transparency-layer'],
  ['about: (her 2nd call)', 'transparency-layer component'],
  ['search_conversations used', 'transparency-layer component'],
  ['the words she was after', 'transparency layer components what is missing'],
]

console.log(`\n${'═'.repeat(104)}`)
console.log(`  B4 RANK DIAGNOSIS · where does ${TARGET.slice(0, 8)} land? · corpus-wide, agent_dev`)
console.log(`${'═'.repeat(104)}`)

const { rows: tgt } = await pg.query(
  `select count(*)::int n,
          count(*) filter (where e.message_id is not null)::int embedded
     from ${S}.txn_messages m
left join ${S}.txn_message_embeddings e on e.message_id = m.id
    where m.conversation_id = $1`, [TARGET])
console.log(`\n  target conversation: ${tgt[0].n} messages, ${tgt[0].embedded} embedded`)
console.log(`  ⛔ if these differ, the target is partly invisible to the dense arm and that alone explains it.\n`)

for (const [label, q] of QUERIES) {
  // ⚠️ EXACTLY the call `rankWithin` makes — limit 60, denseMinSim 0, across rooms. Changing any of them
  // would measure a retrieval path that does not ship.
  const cs = buildConversationSearch(fastify, {
    userId: me.id, acrossRooms: true, roles: ['user', 'assistant'],
    embed: makeEmbedder(fastify, { userId: me.id }),
  })
  let ev = []
  try {
    ev = (await cs.search(q, { limit: 60, excludeConversationId: null, denseMinSim: 0 })).evidence ?? []
  } catch (e) { console.log(`  ${label}: ✖ ${e.message}`); continue }

  const convOrder = []
  for (const e of ev) { const c = e.conversation?.id; if (c && !convOrder.includes(c)) convOrder.push(c) }
  const msgRank = ev.findIndex((e) => e.conversation?.id === TARGET)
  const cRank = convOrder.indexOf(TARGET)
  console.log(`  ── "${q}"   [${label}]`)
  console.log(`     ${ev.length} message hits over ${convOrder.length} distinct conversations`)
  console.log(`     target message rank : ${msgRank < 0 ? '✖ NOT IN THE 60' : `#${msgRank + 1} of ${ev.length}`}`)
  console.log(`     target conv rank    : ${cRank < 0 ? '✖ never ranked — falls to the RECENCY tail' : `#${cRank + 1} of ${convOrder.length}`}`)
  console.log(`     ⇒ opened at limit 6 : ${cRank >= 0 && cRank < 6 ? '✔ YES' : '✖ NO'}`)
  console.log(`     top 6 conversations : ${convOrder.slice(0, 6).map((c) => c.slice(0, 8)).join(' ')}\n`)
}
await pg.end()
process.exit(0)
