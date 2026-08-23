// READ THE REFLECTION POPULATION — mechanical facts only, and deliberately NOT a classifier.
//
//   node maintenance/reflections-read.mjs                 the population, shape only
//   node maintenance/reflections-read.mjs --room agent_dev
//   node maintenance/reflections-read.mjs --text 17       ONE row's verbatim text, on purpose
//
// Ote, 2026-08-20, naming what he wants to watch: reflections that retain nothing · reflections that
// retain something · whether she calls investigative tools · whether she uses `recall_own_history`
// without being told to · whether she searches her own memories first · whether she notices
// contradictions with her previous statements · whether she revisits older conversations · whether she
// naturally produces recurring distinctions · and whether the elided context actually prevents useful
// reflection. ⇒ *"Do not add categories or interpret those behaviours yet."*
//
// ── ⛔⛔ SO THIS ADDS NO CATEGORIES, AND THAT IS THE WHOLE DESIGN CONSTRAINT ──────────────────────────
// Every column it prints is something the database already knows or that arithmetic derives. There is no
// bucket, no label, no score, no "kind of reflection", and ⛔ nothing that reads her prose and decides what
// it meant. A reader that quietly classified would be the `outcome` enum coming back as a report — the
// same defect one layer further out, where it is even harder to see.
//
// ⭐ FOUR of the nine are answerable mechanically and are printed. FIVE are not, and this says so out loud
// rather than approximating them:
//   retained nothing / something   `wrote_memory_id`
//   investigative tools            `tools_used`, non-empty
//   recall_own_history unprompted  `tools_used` contains it — and nothing in the prompt mentions any tool
//   searched memories FIRST        `tools_used` preserves FIRST-CALLED ORDER, so position 1 is the answer
//   revisited older conversations  `search_conversations` / `inspect_around` / `recall_own_history` present
//   elided context                 ⭐ DERIVED, see below — no column was added for it
//   ⛔ noticed a contradiction     only in her words. A human reads it.
//   ⛔ recurring distinctions      only in her words, and only across rows. A human reads them.
//
// ── ⭐⭐ ELISION IS DERIVABLE, WHICH IS WHY NO COLUMN WAS ADDED FOR IT ───────────────────────────────
// `messages_considered` is what she actually read (the prompt builder returns the count and the text from
// one function, so they cannot drift). The number of messages that EXISTED at reflection time is
// `count(*) WHERE conversation_id = … AND rolling_id <= up_to_rolling_id` — exact, because messages are
// append-only and `up_to_rolling_id` is the watermark. ⇒ `existed - considered` is how much she was not
// shown. ⛔ Do not add a `messages_total` column: it would be a second copy of a derivable fact, and the
// last column added beyond the ratified list was removed by migration 017.
//
// ── ⚠⚠ A GAP IN `rolling_id` IS NOT A FAILED REFLECTION — READ THIS BEFORE INFERRING ANYTHING ──────
// The first live population jumped #15 → #24, and the obvious reading (*"eight reflections failed"*) is
// wrong. `rolling_id` is a BIGSERIAL, and a sequence value is consumed by things that leave no row:
//   · `reflection-lifecycle-check.mjs` inserts two rows per run through the REAL path and then deletes
//     them — four runs of the check accounted for that entire gap, exactly;
//   · `ON CONFLICT DO NOTHING` still evaluates the default, so a second tick on an already-reflected
//     quiet stretch burns a value too.
// ⇒ ⛔ Never count reflections by id range. `count(*)` is the only count, and the log line
// `[reflection] <conversation> upTo=…` is the independent record that an occasion actually ran.
//
// ── ⛔ AND IT DOES NOT PRINT HER TEXT UNLESS ASKED FOR ONE ROW ──────────────────────────────────────
// Most reflections are about conversations in OTHER PEOPLE'S rooms. The standing rule is: say THAT the
// material exists, never reproduce what it says. So the default output is shape only. `--text <rolling_id>`
// prints exactly one row, deliberately, for a human who has decided to read it.

import { devPg, devSchema } from '../harness.mjs'

const argv = process.argv.slice(2)
const arg = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? null : (argv[i + 1] ?? '')
}
const room = arg('room')
const one = arg('text')

const pg = devPg(); await pg.connect()
const S = devSchema()

try {
  if (one !== null) {
    // ── ONE ROW, VERBATIM. A deliberate act, one row at a time. ──────────────────────────────────
    const { rows } = await pg.query(
      `SELECT r.rolling_id, r.reflected_at, u.username AS room, c.title, r.text,
              r.tools_used, r.wrote_memory_id::text AS wrote, r.blocked_by_disclosure AS blocked,
              r.messages_considered, r.model
         FROM ${S}.log_reflections r
         LEFT JOIN ${S}.mst_users u ON u.id = r.user_id
         LEFT JOIN ${S}.txn_conversations c ON c.id = r.conversation_id
        WHERE r.rolling_id = $1`, [Number(one)])
    if (!rows.length) { console.log(`no reflection with rolling_id ${one}`); process.exit(0) }
    const r = rows[0]
    console.log(`\n#${r.rolling_id}  ${r.reflected_at.toISOString()}  room=${r.room}  model=${r.model}`)
    console.log(`considered=${r.messages_considered}  tools=[${r.tools_used.join(', ')}]  `
      + `wrote=${r.wrote ?? 'nothing'}  blocked=${r.blocked}`)
    console.log(`conversation: ${r.title ?? '(untitled)'}`)
    console.log('─'.repeat(100))
    console.log(r.text)
    console.log('─'.repeat(100))
    process.exit(0)
  }

  // ── THE POPULATION, SHAPE ONLY ────────────────────────────────────────────────────────────────
  // ⭐ `existed` is computed against the WATERMARK, not against the conversation as it stands now — a
  // conversation that grew afterwards must not make an honest reflection look like it skipped messages.
  const { rows } = await pg.query(
    `SELECT r.rolling_id, r.reflected_at, u.username AS room, r.tools_used,
            -- ⭐⭐ A DECISION IS NOT A RETENTION (found 2026-08-23). Testing wrote_memory_id IS NOT NULL
            -- counted reflection #111 as "retained something" when she had explicitly DECLINED — the row it
            -- wrote is a recorded decision (entity=sotera, attribute=declined), not a memory. The true score
            -- over 47 opportunities was 0 retained, not 1. ⛔ Fixed HERE, in the consumer; the row is untouched.
            -- ⚠ NO BACKTICKS IN THIS COMMENT. It sits inside a JS template literal and a backtick would
            -- terminate the string — which has now happened FOUR times in this repo, once by me right here.
            -- ⚠ And the alias is dm, not m: m is already txn_messages in the subquery below.
            (r.wrote_memory_id IS NOT NULL
              AND NOT (dm.entity = 'sotera' AND dm.attribute = 'declined')) AS retained,
            (dm.entity = 'sotera' AND dm.attribute = 'declined') AS declined_record,
            r.blocked_by_disclosure AS blocked,
            r.messages_considered AS considered,
            (SELECT count(*)::int FROM ${S}.txn_messages m
              WHERE m.conversation_id = r.conversation_id AND m.rolling_id <= r.up_to_rolling_id) AS existed,
            length(r.text) AS chars, r.prompt_generation AS gen, r.model
       FROM ${S}.log_reflections r
       LEFT JOIN ${S}.mst_users u ON u.id = r.user_id
       LEFT JOIN ${S}.txn_memories dm ON dm.id = r.wrote_memory_id
      WHERE ($1::text IS NULL OR u.username = $1)
      ORDER BY r.rolling_id`, [room])

  if (!rows.length) {
    // ⭐ NOT AN ERROR, AND WORTH SAYING PROPERLY: an empty population means no OPPORTUNITY has happened
    // yet, which is a different fact from "she kept nothing" — and separating those two is the entire
    // point of the table existing.
    console.log(`\nno reflection rows${room ? ` in ${room}'s room` : ''} yet.`)
    console.log('⇒ that means no OPPORTUNITY has occurred, which is NOT the same as "she kept nothing".')
    process.exit(0)
  }

  const INVESTIGATIVE = ['recall_own_history', 'inspect_around', 'search_conversations', 'recall_own_memory', 'recall_memory', 'recall_lessons']
  const pad = (s, n) => String(s).padEnd(n)
  console.log(`\n${rows.length} reflection(s)${room ? ` in ${room}'s room` : ''}\n`)
  console.log(`${pad('#', 5)}${pad('when', 18)}${pad('room', 14)}${pad('read', 12)}${pad('chars', 7)}${pad('kept', 6)}${pad('blk', 5)}tools (first-called order)`)
  console.log('─'.repeat(120))
  for (const r of rows) {
    const read = r.existed && r.considered < r.existed ? `${r.considered}/${r.existed} ✂` : `${r.considered}/${r.existed}`
    console.log(
      pad(`#${r.rolling_id}`, 5)
      + pad(r.reflected_at.toISOString().slice(5, 16).replace('T', ' '), 18)
      + pad(r.room ?? '(none)', 14)
      + pad(read, 12)
      + pad(r.chars, 7)
      + pad(r.retained ? 'yes' : '—', 6)
      + pad(r.blocked ? 'YES' : '—', 5)
      + (r.tools_used.length ? r.tools_used.join(' → ') : '—'),
    )
  }

  // ── THE TALLIES. Counts of mechanical facts, ⛔ never rates. ───────────────────────────────────
  // ⛔ NO PERCENTAGES AND NO HIT RATE. *A rate is a quota with a nicer name*, and the moment one exists
  // somebody optimises it — which for this instrument would mean steering her toward retaining things.
  const n = rows.length
  const withTools = rows.filter((r) => r.tools_used.length)
  const elided = rows.filter((r) => r.existed && r.considered < r.existed)
  const firstTool = new Map()
  for (const r of withTools) firstTool.set(r.tools_used[0], (firstTool.get(r.tools_used[0]) ?? 0) + 1)
  const perTool = new Map()
  for (const r of rows) for (const t of r.tools_used) perTool.set(t, (perTool.get(t) ?? 0) + 1)

  console.log(`\n${'─'.repeat(120)}`)
  console.log(`opportunities that happened     ${n}`)
  console.log(`  retained something            ${rows.filter((r) => r.retained).length}`)
  console.log(`  retained nothing              ${rows.filter((r) => !r.retained).length}   ⓘ a real outcome, not an absence`)
  // ⭐⭐ REPORTED SEPARATELY, because "she decided not to keep this" is a THIRD outcome and it is the most
  // interesting one — it is her judgement, recorded, and it is neither a retention nor a silence.
  console.log(`  …of which an explicit DECLINE  ${rows.filter((r) => r.declined_record).length}   ⭐ a decision, durable and auditable — ⛔ not a memory`)
  console.log(`  refused by a room boundary    ${rows.filter((r) => r.blocked).length}`)
  console.log(`called any tool                 ${withTools.length}`)
  console.log(`  investigative tool            ${rows.filter((r) => r.tools_used.some((t) => INVESTIGATIVE.includes(t))).length}`)
  console.log(`  recall_own_history            ${rows.filter((r) => r.tools_used.includes('recall_own_history')).length}   ⓘ nothing in the prompt mentions it`)
  console.log(`  reached into another room     ${rows.filter((r) => r.tools_used.some((t) => t === 'inspect_around' || t === 'search_conversations')).length}`)
  console.log(`first tool called               ${[...firstTool].map(([t, c]) => `${t}:${c}`).join('  ') || '—'}`)
  console.log(`every tool, total calls         ${[...perTool].map(([t, c]) => `${t}:${c}`).join('  ') || '—'}`)
  console.log(`transcript was elided           ${elided.length}${elided.length ? `   (unseen messages: ${elided.map((r) => r.existed - r.considered).join(', ')})` : ''}`)
  console.log(`\n⛔ NOT ANSWERED HERE, on purpose: whether she noticed a contradiction with something she`)
  console.log(`   said before, and whether the same distinction recurs. Both live only in her words —`)
  console.log(`   read them one at a time with --text <#>, and ⛔ do not turn the first pattern into a schema.`)
} finally {
  await pg.end()
}
