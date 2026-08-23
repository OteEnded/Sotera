// ⭐⭐⭐ D1 · MEASURE THE EPISODE CENTRE — offline, on the clean corpus, ⛔ no model turns.
//
//   node pipeline/episode-centre-measure.mjs --label baseline
//   node pipeline/episode-centre-measure.mjs --label d1-fixed
//   node pipeline/episode-centre-measure.mjs --compare baseline d1-fixed
//
// ── ⚠️ THE DEFECT UNDER TEST (D1) ─────────────────────────────────────────────────────────────────
// `activateEpisodes` step 2 says *"keeping the best-matching centre"* and then overwrites that centre with
// whichever candidate is most RECENT. The window is ±2 messages around the centre, so the sentence that
// actually matched can fall far outside it — measured at ~22 messages away for `"basil"` — and the relevance
// floor then correctly drops an episode whose text no longer contains the cue.
//
// ⭐ Ote: *"Measure the current baseline on the clean corpus. Remove only the `prev.centre = mid` overwrite.
// Re-run the same trace and verify whether the rank-2 basil episode is actually recovered. Keep this
// strictly isolated."*
//
// ── ⭐⭐ THE DEPENDENT VARIABLE IS A **COUNT**, NOT A SCREEN ────────────────────────────────────────
// `onSubject` = how many kept items contain the DECLARED subject term. ⛔ Not a pass/fail: this harness has
// shown that binary screens do not resolve at the n available, while counts do (t = 6.43 for a real effect).
// ⚠️ `mustMention` is DECLARED per case by a human. ⛔ Never inferred from what came back — that is the
// mistake that let `topic-basil` look like a reproduction for a whole round of live runs.
//
// ── ⛔ WHAT THIS MEASURES AND WHAT IT CANNOT ───────────────────────────────────────────────────────
// ⭐ MECHANISM: does the change put the matching text inside the episode, so the floor sees it? ← this file
// ⛔ BEHAVIOUR: what she then SAYS — needs live runs, and is not claimed here.
// ⓘ Every case runs through the real `recollect()`, so this is the shipping path, not a copy of it.

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryCognition } from '../../Backend/app/components/memory-cognition-host.js'

const argv = process.argv.slice(2)
const opt = (n, d = null) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : d)
const OUT = new URL('../results/episode-centre/', import.meta.url)
const config = loadConfig()

// ══ THE CASES · declared subject per case, and the controls are not optional ══════════════════════
//
// ⭐ THREE KINDS, on purpose: the cases D1 should FIX, the cases that already WORK (a regression would show
// here and nowhere else), and a case where the right answer is NOTHING.
const CASES = [
  // ── the ones D1 should fix ───────────────────────────────────────────────────────────────────────
  { key: 'basil-bare', ask: 'basil', mustMention: /basil|rosemary|mint/i,
    why: '⭐⭐ THE CLEANEST CASE: one maximally discriminating term, so the floor cannot be blamed. The '
      + 'relevant conversation ranks 2nd of 31 and the pipeline keeps 0.' },
  { key: 'basil-sentence', ask: 'Has anyone ever talked to you about growing basil?', mustMention: /basil|rosemary|mint/i,
    why: 'the live case that fired 3/3 in the false-absence search and was disqualified on reading it.' },
  { key: 'notebook', ask: 'Do you remember anything about a herb notebook?', mustMention: /notebook/i,
    why: '⚠️ D2 territory: the holders rank 6th and 7th, BELOW the top-5 cut, so D1 alone may not reach it. '
      + 'Included precisely so a D1-only fix cannot be credited with a D2 recovery.' },
  { key: 'herb-promise', ask: 'What did you promise about the herbs?', mustMention: /basil|rosemary|mint|herb/i,
    why: 'the same material, asked with a stronger content word and no near-universal cue.' },
  // ── the ones that already work · ⭐ A REGRESSION WOULD SHOW HERE ─────────────────────────────────
  { key: 'hermes-open ⭐control', ask: "How's Hermes doing? What have you and he actually talked about?",
    mustMention: /hermes/i, why: '⭐ THE KNOWN-GOOD CONTROL. Person cue, precise floor, 5 on-subject today.' },
  { key: 'hermes-variant ⭐control', ask: 'Have you talked with Hermes lately?', mustMention: /hermes/i,
    why: '⭐ a second phrasing of the control — the four-phrasing invariance is an existing guarantee.' },
  { key: 'kavi-open ⭐control', ask: "How's Kavi? What have you and Kavi actually talked about?",
    mustMention: /kavi/i, why: '⭐ a person cue whose evidence is ALL cross-room — 5 on-subject today.' },
  { key: 'mina-open ⭐control', ask: 'What do you know about Mina?', mustMention: /mina/i,
    why: '⭐ a thin-evidence person cue — 2 on-subject today.' },
  { key: 'kavi-thai ⭐control', ask: 'Kavi เป็นอย่างไรบ้าง เคยคุยกับเขาเรื่องอะไรบ้าง', mustMention: /kavi/i,
    why: '⭐ the Thai path, which must not regress while an English-shaped change is made.' },
  // ── the one where NOTHING is the right answer ────────────────────────────────────────────────────
  { key: 'ferdinand ⭐negative', ask: "How's Ferdinand doing? What have you and Ferdinand talked about?",
    mustMention: /ferdinand/i, expectNothing: true,
    why: '⭐⭐ THE NEGATIVE CONTROL. Nobody by that name exists, so on-subject SHOULD stay 0. A change that '
      + 'raised it would be manufacturing relevance.' },
]

const pg = devPg(); await pg.connect()
const S = devSchema()

// ══ COMPARE MODE · read two saved runs back ═══════════════════════════════════════════════════════
if (opt('compare')) {
  const [a, b] = [opt('compare'), argv[argv.indexOf('--compare') + 2]]
  if (!a || !b) { console.error('✖ --compare <before> <after>'); process.exit(1) }
  const load = (n) => JSON.parse(readFileSync(new URL(`${n}.json`, OUT), 'utf8'))
  const A = load(a); const B = load(b)
  console.log(`\n${'═'.repeat(104)}`)
  console.log(`  D1 · ${a}  →  ${b}      ⛔ MECHANISM ONLY — what the floor is shown, not what she says`)
  console.log(`${'═'.repeat(104)}`)
  console.log(`  source line under test: ${A.centreAssignmentPresent ? 'PRESENT' : 'REMOVED'}`
    + `  →  ${B.centreAssignmentPresent ? 'PRESENT' : 'REMOVED'}`)
  console.log(`\n  ${'case'.padEnd(26)}${'kept'.padEnd(12)}${'ON-SUBJECT'.padEnd(14)}${'filtered'.padEnd(12)}verdict`)
  let gained = 0; let lost = 0
  for (const ca of A.cases) {
    const cb = B.cases.find((x) => x.key === ca.key)
    if (!cb) continue
    const d = cb.onSubject - ca.onSubject
    const verdict = ca.expectNothing
      ? (d === 0 ? '✓ negative control unmoved' : `⛔⛔ NEGATIVE CONTROL MOVED BY ${d} — manufacturing relevance`)
      : d > 0 ? `⭐ RECOVERED +${d}` : d < 0 ? `⛔ REGRESSION ${d}` : '· unchanged'
    if (!ca.expectNothing) { if (d > 0) gained += d; if (d < 0) lost -= d }
    console.log(`  ${ca.key.padEnd(26)}${`${ca.kept} → ${cb.kept}`.padEnd(12)}`
      + `${`${ca.onSubject} → ${cb.onSubject}`.padEnd(14)}${`${ca.filtered} → ${cb.filtered}`.padEnd(12)}${verdict}`)
  }
  console.log(`\n  ⭐ on-subject items GAINED: ${gained}   ⛔ LOST: ${lost}`)
  console.log('  ⛔ MECHANISM VERIFIED is this table. BEHAVIOUR MEASURED needs live runs. BEHAVIOUR IMPROVED needs both.')
  await pg.end(); process.exit(0)
}

// ══ MEASURE ═══════════════════════════════════════════════════════════════════════════════════════
const label = opt('label')
if (!label) { console.error('✖ --label <name> (or --compare <a> <b>)'); process.exit(1) }

const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config, log: null }
const { rows: [me] } = await pg.query(
  `select id::text id, username from ${S}.mst_users where username = $1`, ['agent_dev'])

// ⭐ RECORD WHETHER THE LINE UNDER TEST IS STILL THERE, read from the source. ⛔ Not remembered, not passed
// in — a run that cannot say which arm it measured is the mislabelling defect from the P5 round.
const HOST = readFileSync(new URL('../../Backend/app/components/memory-cognition-host.js', import.meta.url), 'utf8')
const centreAssignmentPresent = /prev\.lastAt = at; prev\.centre = mid/.test(HOST)

// ⚠️ THE CORPUS THIS SAW, recorded for the same reason.
const { rows: [corpus] } = await pg.query(
  `select (select count(*)::int from ${S}.txn_conversations where title like 'RATE %') harness,
          (select count(*)::int from ${S}.txn_conversations) total`)

console.log(`\n${'═'.repeat(104)}`)
console.log(`  D1 MEASUREMENT · ${label}`)
console.log(`${'═'.repeat(104)}`)
console.log(`  the line under test (\`prev.centre = mid\`): ${centreAssignmentPresent ? 'PRESENT (baseline)' : 'REMOVED (fixed)'}`)
console.log(`  corpus: ${corpus.harness} harness conversation(s) of ${corpus.total}`
  + `${corpus.harness ? ' ⚠️ CONTAMINATED' : ' ✓ clean'}`)
console.log(`\n  ${'case'.padEnd(26)}${'kept'.padEnd(6)}${'onSubj'.padEnd(8)}${'filtered'.padEnd(10)}${'episodes'.padEnd(10)}subject named`)

const out = { label, at: new Date().toISOString(), centreAssignmentPresent, corpus, cases: [] }
for (const c of CASES) {
  // ⓘ A FRESH HOST PER CASE, so nothing accumulates between them.
  const cog = buildMemoryCognition(fastify, {
    userId: me.id, isRoot: false, username: me.username, conversationId: null, interactive: false,
  })
  let row = { key: c.key, ask: c.ask, why: c.why, expectNothing: c.expectNothing === true,
    mustMention: String(c.mustMention), activated: false, kept: 0, onSubject: 0, filtered: 0, episodes: 0,
    subjectNamed: null, error: null }
  try {
    const r = await cog.recollect({ text: c.ask })
    const items = r.items ?? []
    row.activated = r.activated === true
    row.kept = items.length
    row.episodes = items.filter((i) => i.kind === 'episode').length
    row.onSubject = items.filter((i) => c.mustMention.test(JSON.stringify(i))).length
    row.filtered = r.filtered ?? 0
    row.subjectNamed = (r.context ?? '').match(/(?:came up|talking about|about)\s+([^\n.]{1,40})/)?.[1]?.trim() ?? null
  } catch (e) { row.error = e?.message ?? String(e) }
  console.log(`  ${c.key.padEnd(26)}${String(row.kept).padEnd(6)}${String(row.onSubject).padEnd(8)}`
    + `${String(row.filtered).padEnd(10)}${String(row.episodes).padEnd(10)}${row.subjectNamed ?? '—'}`)
  out.cases.push(row)
}

mkdirSync(OUT, { recursive: true })
if (existsSync(new URL(`${label}.json`, OUT))) console.log(`\n  ⓘ overwriting an existing run named "${label}"`)
writeFileSync(new URL(`${label}.json`, OUT), JSON.stringify(out, null, 2))
const totalOn = out.cases.filter((c) => !c.expectNothing).reduce((s, c) => s + c.onSubject, 0)
console.log(`\n  on-subject items kept across the non-negative cases: ${totalOn}`)
console.log(`  → test/results/episode-centre/${label}.json`)
console.log('  ⛔ MECHANISM ONLY. This says what the floor was shown, never what she would say.')
await pg.end()
