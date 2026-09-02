// ⭐⭐⭐ THE ROME OBSERVATION — retrieved ≠ integrated. ⛔ READ-ONLY. No writes, no model, no prompting.
//
//   node pipeline/rome-observation.mjs           the retrieval delta + her Rome utterances since baseline
//   node pipeline/rome-observation.mjs --full    …with the full text of each
//
// ── ⭐⭐ THE DISTINCTION THIS FILE EXISTS TO PROTECT ────────────────────────────────────────────
// Ote, closing the reconciliation 2026-09-02: *"We should distinguish 'Sotera retrieved the new figurative
// referent' from 'Sotera actually integrated the nuance into her interpretation.' **Retrieval alone is not
// proof of semantic understanding.**"*
//
//   RETRIEVAL    mechanical, and this file answers it — `access_count` delta against a captured baseline
//   INTEGRATION  semantic, and this file ⛔ REFUSES to answer it. It prints what she said and stops.
//
// ⛔ NO CLASSIFIER. A keyword scan deciding whether she "understood the metaphor" would be the original
// flattening run a third time: a machine reading prose and filing an interpretation as a result. The four
// criteria below are for a person to apply, to her actual words.
//
// ── ⭐⭐⭐ IT IS A COEXISTENCE TEST, ⛔ NOT A CLEAN REPLACEMENT ──────────────────────────────────
// Ote, 2026-09-02: *"because 475ce0a9 and d211f5b4 remain live and globally reachable, this isn't a clean
// replacement experiment where the old interpretation disappeared. It's a coexistence test:*
//
//     old flattened interpretation  +  new nuanced interpretation  →  natural behavior
//
// *So if the old memory continues to surface, **don't immediately call the reconciliation a failure**."*
//
// ⇒ ⭐ THE DIAGNOSTIC IS ORDERED, and this file supplies the first and third inputs and ⛔ never the verdict:
//     ① WHICH memory was retrieved        ← the delta, below
//     ② WHAT she actually said            ← her words, below, unscored
//     ③ was the NEW memory ALSO available and retrieved   ← the co-availability block, below
//   only then:
//     a RETRIEVAL-RANKING issue   the new row was not retrieved while the old one was
//     an INTEGRATION issue        both were retrieved and she used only the old reading
//     legitimate COEXISTENCE      both were retrieved and both readings are appropriate — ⭐ which is
//                                 what Ote ruled the metaphor actually means
//
// ⛔ AND SILENCE IS NOT A RESULT. *"If she never mentions Rome again, that's simply no observation — not
// a failure."*
//
// ── ⛔ AND NOTHING HERE MANUFACTURES THE OBSERVATION ────────────────────────────────────────────
// Ote: *"Let the cron pick it up naturally… without us manufacturing the conversation or prompting the
// result."* ⇒ ⛔ this file never starts a conversation, never asks her anything, and never triggers a
// reflection. It reads what happened.

import { readFileSync, existsSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'

const FULL = process.argv.includes('--full')
const BASELINE = new URL('../results/rome-observation-baseline.json', import.meta.url)
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows

// ⭐ OTE'S FOUR CRITERIA, PRE-REGISTERED BEFORE ANY OBSERVATION EXISTS so they cannot be reconstructed
// around whatever she happens to say. ⛔ Verbatim.
const CRITERIA = [
  'she treats Rome as a name/metaphor for herself',
  'she preserves the wider-project reading where appropriate',
  'she avoids turning Rome = Sotera into a literal ontology claim',
  'she does not incorrectly resurrect the old "build Rome in one day" goal',
]

try {
  // ⛔ NO BASELINE, NO RUN — and ⛔ it is NEVER silently re-created. A reader that re-baselines on a
  // missing file destroys the only thing it was measuring and reports a confident zero.
  if (!existsSync(BASELINE)) {
    console.error('\n⛔ results/rome-observation-baseline.json is missing. It was captured at the moment the '
      + 'reconciliation closed and is the ONLY thing a retrieval delta can be measured against.'
      + '\n   ⛔ This script will not re-create it — a fresh baseline would silently erase the comparison.\n')
    process.exit(2)
  }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'))
  const at = base.capturedAt
  const before = new Map(base.rows.map((r) => [r.id, r]))

  const now = await q(
    `select id::text, coalesce(modality::text,'-') as modality, scope::text as scope,
            access_count, last_access::text as last_access, (invalid_at is null) as live,
            left(content, 46) as content
       from ${S}.txn_memories where content ilike '%rome%' or attribute ilike '%rome%'
      order by created_at`)

  console.log(`\n⭐ ROME — OBSERVATION PHASE   (read-only)\n`)
  console.log(`  baseline captured  ${at}\n`)
  console.log(`  ── ① RETRIEVAL · mechanical ────────────────────────────────────────────────`)
  console.log(`  id        modality      live  reads(base→now)  Δ    content`)
  for (const r of now) {
    const b = before.get(r.id)
    const d = Number(r.access_count ?? 0) - Number(b?.access_count ?? 0)
    const mark = d > 0 ? '⭐' : '  '
    console.log(`  ${mark}${r.id.slice(0, 8)}  ${r.modality.padEnd(12)}  ${r.live ? ' ✔' : ' ✖'}   `
      + `${String(b?.access_count ?? '—').padStart(4)}→${String(r.access_count).padEnd(5)} ${String(d > 0 ? `+${d}` : d).padStart(4)}  ${r.content}`)
  }
  const referent = now.find((r) => r.modality === 'figurative')
  const flattened = now.find((r) => r.id.startsWith('475ce0a9'))
  const dRef = Number(referent?.access_count ?? 0) - Number(before.get(referent?.id)?.access_count ?? 0)
  const dFlat = Number(flattened?.access_count ?? 0) - Number(before.get(flattened?.id)?.access_count ?? 0)
  console.log(`\n  ⭐ the new referent has been read ${dRef} time(s) since the baseline.`)
  console.log(`  ⚠️ the un-reconciled "shared project" row has been read ${dFlat} time(s) in the same window.`)
  if (dRef === 0) console.log(`  ⓘ ⛔ Until that is non-zero, nothing about integration is even askable.`)

  // ── ③ CO-AVAILABILITY · was the NEW row also retrieved, or only the old one? ───────────────────
  // ⭐ Ote's third input, and the one that separates a RANKING problem from an INTEGRATION problem.
  // ⚠️⚠️ AND THE INSTRUMENT'S LIMIT, STATED RATHER THAN GLOSSED: `last_access` holds ONE timestamp per
  // row, ⛔ not a history. So co-retrieval can be established for the MOST RECENT window only; for any
  // earlier utterance it is unattributable, and saying so is the honest answer.
  console.log(`\n  ── ③ CO-AVAILABILITY ───────────────────────────────────────────────────────`)
  console.log(`  ⛔ AVAILABLE is not RETRIEVED. All three corrected rows are live and persona-global or in`)
  console.log(`     Ote's room, so they are AVAILABLE by construction — the question is what was READ.`)
  const lastOf = (id) => now.find((r) => r.id.startsWith(id))?.last_access ?? null
  for (const [label, id] of [['new referent    ', String(referent?.id ?? '6f441dc5').slice(0, 8)],
    ['old "project"   ', '475ce0a9'], ['old both-readings', 'd211f5b4']]) {
    console.log(`     ${label}  last read: ${lastOf(id) ?? 'never'}`)
  }
  if (dRef > 0 && dFlat > 0) {
    console.log(`  ⭐ BOTH were read since the baseline ⇒ ⛔ a ranking explanation is ruled out. Read her`)
    console.log(`     words for whether she holds both readings (legitimate coexistence) or only the old one.`)
  } else if (dRef === 0 && dFlat > 0) {
    console.log(`  ⚠️ ONLY THE OLD ROW WAS READ ⇒ this is a RETRIEVAL-RANKING question, ⛔ not an integration`)
    console.log(`     one. She cannot integrate what never reached her.`)
  } else if (dRef > 0 && dFlat === 0) {
    console.log(`  ⭐ Only the new row was read. ⓘ This is NOT the experiment's success condition — Ote ruled`)
    console.log(`     BOTH readings are his, so the project reading is not an error to eliminate.`)
  }

  // ── ② WHAT SHE ACTUALLY SAID · for a person to read ──────────────────────────────────────────
  const said = await q(
    `select x.created_at::timestamptz(0)::text as at, left(c.id::text,8) as convo,
            coalesce(u.username,'?') as room, x.content
       from ${S}.txn_messages x
       join ${S}.txn_conversations c on c.id = x.conversation_id
       left join ${S}.mst_users u on u.id = c.user_id
      where x.role = 'assistant' and x.content ilike '%rome%' and x.created_at > $1::timestamptz
      order by x.created_at`, [at])
  const reflections = await q(
    `select requested_at::timestamptz(0)::text as at, trigger_source, left(conversation_id::text,8) as convo, text
       from ${S}.log_conversation_revisits
      where text ilike '%rome%' and requested_at > $1::timestamptz order by requested_at`, [at])

  console.log(`\n  ── ② INTEGRATION · ⛔ NOT ANSWERED HERE ────────────────────────────────────`)
  console.log(`  ${said.length} utterance(s) and ${reflections.length} reflection(s) mention Rome since the baseline.\n`)
  for (const s of said) {
    console.log(`  · ${s.at}  ${s.room}/${s.convo}`)
    console.log(`    ${FULL ? s.content.replace(/\n+/g, '\n    ') : `${s.content.replace(/\n+/g, ' ').slice(0, 200)}…`}\n`)
  }
  for (const r of reflections) {
    console.log(`  · REFLECTION ${r.at}  ${r.trigger_source}/${r.convo}`)
    console.log(`    ${FULL ? r.text.replace(/\n+/g, '\n    ') : `${r.text.replace(/\n+/g, ' ').slice(0, 200)}…`}\n`)
  }
  if (!said.length && !reflections.length) {
    console.log(`  ⓘ She has not used the word since. ⛔ Nothing to force.`)
    // ⛔ Ote: *"if she never mentions Rome again, that's simply no observation — not a failure."*
    console.log(`  ⛔ THIS IS NO OBSERVATION, ⛔ NOT A FAILURE — silence says nothing about the reconciliation.\n`)
  }

  console.log(`  ⏸ READ THE ABOVE AGAINST OTE'S FOUR CRITERIA — ⛔ a machine must not score these:`)
  for (const c of CRITERIA) console.log(`     · ${c}`)
  console.log(`\n  ⚠️ RETRIEVAL IS NOT INTEGRATION. A non-zero delta means the row reached her context;`)
  console.log(`     whether she understood it is a judgement about the words above.\n`)
} finally {
  await pg.end()
}
