// ⭐⭐ REPLAY B4's SELECTORS THROUGH THE REAL HOST. ⛔ Mechanism only — no model, no generation.
//
// ⚠️ THIS FILE EXISTS BECAUSE MY FIRST DIAGNOSIS WAS WRONG. I predicted the `about:` ranking had buried
// the target below the cut. Measured, it does the opposite: `24227cbb` ranks **#2–#4 of 41–44
// conversations** on every query she actually used, and would be opened at `limit: 6`. ⇒ the ranking is
// not the defect, so the defect is between the ranking and what came back — and guessing again is not a
// diagnosis. This replays the exact selectors from the B4 trace through `buildConversationRetrieval`
// itself and prints WHICH conversations it opened.

import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildConversationRetrieval } from '../../Backend/app/components/conversation-retrieval.js'

const TARGET = '24227cbb-e019-475a-8642-91d5c37cf7ee'
const pg = devPg(); await pg.connect()
const S = devSchema()
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config: loadConfig(), log: null }
// ⚠️ There is no `is_root` COLUMN — root identity is not a value's shape in this schema, which is the
// project's most-repeated bug in the other direction. agent_dev is not root, stated rather than inferred.
const { rows: [me] } = await pg.query(
  `select id::text id, username, display_name, memory_access_scope, person_id
     from ${S}.mst_users where username='agent_dev'`)

// ⭐ Verbatim from the B4 tool trace, in the order she issued them.
const SELECTORS = [
  { about: 'transparency-layer' },
  { about: 'transparency-layer component', between: ['2026-08-24', '2026-08-25'] },
  { about: 'transparency-layer component' },                       // ⭐ same query, NO date window
  { about: 'transparency layer', between: ['2026-08-18', '2026-08-25'] },
]

const R = buildConversationRetrieval(fastify, {
  userId: me.id, isRoot: false, user: me, username: me.username,
  conversationId: null, interactive: true,
})

console.log(`\n${'═'.repeat(100)}`)
console.log(`  B4 SELECTOR REPLAY · did the host OPEN ${TARGET.slice(0, 8)} ("Navigating The Uncertainty Of Knowing")?`)
console.log(`${'═'.repeat(100)}`)

for (const sel of SELECTORS) {
  const out = await R.retrieve({ ...sel, limit: 6 })
  const opened = (out.windows ?? []).filter((w) => w.opened)
  const inv = out.conversations ?? []
  // ⚠️⚠️ MATCH ON THE TURNS, NOT ON THE WINDOW. The first version of this checked
  // `w.conversationId` — a field that exists on a TURN and never on a WINDOW — so it printed a
  // confident "✖ NO" while `24227cbb6a` was sitting in the opened list one line above it. ⭐ The same
  // shape as `assert-the-state-not-the-answer`: the reader and the assertion shared a wrong lens, and
  // the output looked like a finding.
  const win = opened.find((w) => (w.turns ?? []).some((t) => t.conversationId === TARGET))
  const turns = win ? (win.turns ?? []).filter((t) => t.conversationId === TARGET) : []
  const text = turns.map((t) => String(t.text ?? t.content ?? t.excerpt ?? '')).join('\n')
  console.log(`\n  ── ${JSON.stringify(sel)}`)
  console.log(`     rankedBy=${out.rankedBy}  matched=${out.coverage?.matchedConversations}  opened=${out.coverage?.openedConversations}  shownTurns=${out.coverage?.shownTurns}`)
  console.log(`     inventory order  : ${inv.slice(0, 6).map((c) => `${c.handle}·${c.lastAt}`).join('  ')}`)
  console.log(`     opened           : ${opened.map((w) => w.handle).join('  ') || '(none)'}`)
  console.log(`     ⇒ TARGET OPENED  : ${win ? `✔ YES — ${turns.length} turns, centred on "${win.centredOn}"` : '✖ NO'}`)
  if (win) {
    // ⭐ THE QUESTION THAT ACTUALLY MATTERS: opening the right conversation is not the same as being
    // handed the answer. The conclusion lives in the LAST message of the eight; a window centred on the
    // keyword match sits four turns earlier.
    const facts = {
      'collapsed to THREE': /so it'?s three, not four|three, not four/i.test(text),
      '"source attribution"': /source attribution/i.test(text),
      '"active context"': /active context/i.test(text),
      '"confidence calibration"': /confidence calibration/i.test(text),
      'the AGGREGATION step': /aggregation/i.test(text),
    }
    console.log(`     window covered   : ${turns.map((t) => String(t.at ?? '').slice(11, 16)).join(' ')}  (${text.length} chars)`)
    for (const [k, v] of Object.entries(facts)) console.log(`       ${v ? '✔' : '✖'} ${k}`)
  }
}
await pg.end()
process.exit(0)
