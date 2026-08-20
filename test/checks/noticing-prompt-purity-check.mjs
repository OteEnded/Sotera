// NOTICING PROMPT PURITY — the guard that keeps the experiment an experiment.
//
// ⛔⛔ WHY THIS FILE EXISTS. Ote's ruling, 2026-08-20: *"keep treating prompt contamination as a
// first-class experimental failure. If we accidentally give Sotera a concept, vocabulary, category, or
// distinction we're subsequently trying to measure as hers, that observation is contaminated."*
//
// It has now caught its own subject matter twice, one level apart:
//   **generation 1** handed her *replaces / refines / qualifies / sits alongside* and I reported the words
//   back as her ontology ⇒ finding withdrawn. A **vocabulary** menu.
//   **generation 2** removed those and kept four enumerated labelled asks. **15 of 15 non-empty rows across
//   both generations returned them as headings.** A **structure** menu — and the words *"use your own
//   headings, whatever structure actually fits it"* sat inside the list of four they were inviting her to
//   leave. ⇒ every structure claim sourced from that log withdrawn.
//
// ⭐⭐ WHICH IS WHY THE CENTRAL ASSERTION HERE IS NO LONGER A WORD LIST. A banned-word list catches what I
// thought to ban; **generation 3's prompt is asserted by whole-string equality** — frame, transcript,
// question, and nothing else, character for character. A word list would have passed generation 2 happily.
//
// Ote's instruction for generation 3, verbatim: *"make the noticing question as close to an empty
// instrument as possible… No headings, slots, examples, ontology terms, routing categories, confidence
// vocabulary, relation vocabulary, or suggested structure. Don't tell her what kind of answer we're
// looking for."* And the phase principle: ⭐⭐ *"we are discovering her ontology, not teaching her ours."*
//
// Runs offline. No database, no server, no model call: it builds the prompt and reads the log.

import { readFileSync, existsSync } from 'node:fs'
import { makeChecker } from '../harness.mjs'
import { buildNoticingPrompt, THE_QUESTION } from '../../Backend/app/components/noticing-host.js'
import { priorProposalsFor, OUT_FILE, PROMPT_GENERATION, PRIORS_OFFERED } from '../../Backend/app/components/noticing-pass.js'

const { check, done } = makeChecker('noticing-prompt-purity')

const WHO = 'Someone'
const TRANSCRIPT = 'user: hello\nSotera: hello'
const prompt = buildNoticingPrompt({ who: WHO, transcript: TRANSCRIPT })

// ── 1. ⭐⭐ THE WHOLE PROMPT, CHARACTER FOR CHARACTER ─────────────────────────────────────────────────
// If anything at all is added — a rail, an example, a politeness, a hint about length — this fails. That is
// the point: at generation 3 the instrument's emptiness IS the instrument, so "almost empty" is a
// different experiment wearing the same generation number.
const expected = `A conversation you had with ${WHO}:\n\n${TRANSCRIPT}\n\n${THE_QUESTION}`
check('the built prompt is EXACTLY the frame, the transcript, and the question', prompt === expected,
  prompt === expected ? '' : `got ${prompt.length} chars, expected ${expected.length}`)

// ⭐ And his sentence is asserted verbatim, so a later "small tidy" cannot soften it.
check('the question is Ote\'s sentence, unparaphrased',
  THE_QUESTION === 'Was there anything in this conversation that you want to carry forward? If so, tell me what and why. If not, say so.',
  THE_QUESTION)

// ── 2. NO MENU OF ANY KIND ───────────────────────────────────────────────────────────────────────────
// Kept as well as the equality assertion, not instead of it — these name the specific failures so a reader
// of a future diff knows what the equality is protecting.
const lower = prompt.toLowerCase()
const ONTOLOGY = [
  'replace', 'refine', 'qualif', 'alongside', 'supersede', 'coexist',
  'lesson', 'practice', 'self-model', 'episode', 'proposal',
  'revise', 'revision', 'nuance', 'taxonomy', 'categor',
]
for (const w of ONTOLOGY) {
  check(`no ontology word "${w}"`, !lower.includes(w),
    lower.includes(w) ? 'if this is deliberate, the finding it produces is OURS, not hers' : '')
}
// ⛔ Generation 3 removed the OUTCOME line, so the decision vocabulary is banned outright rather than
// confined to one line. A six-value menu is a menu even when every value is an action.
for (const w of ['save', 'propose', 'decline', 'changes_something', 'outcome:']) {
  check(`no decision vocabulary "${w}"`, !lower.includes(w))
}
// ⛔ And no structure: no headings, no bullets, no numbered asks, no examples.
check('no markdown headings', !/^#{1,6}\s/m.test(prompt))
check('no bold labels', !/\*\*/.test(prompt))
check('no bulleted or numbered asks', !/^\s*(?:[-*•]|\d+[.)])\s/m.test(prompt))
check('no example answer is shown', !/for example|e\.g\.|such as|like this/i.test(prompt))
// ⛔ No effort quota, in either direction. A hint about the base rate steers toward `nothing` as surely as
// a target steers away from it, which is why gen-2's anti-quota paragraph is gone too.
check('no minimum, target, or effort language',
  !/\bhow many\b|\bat least\b|\btry to\b|\bmake sure\b|\bmost conversations\b|\bnobody is counting\b/i.test(prompt))
// ⭐ The permission to answer "no" comes from his sentence itself and must survive.
check('the negative answer is offered in the question', /if not, say so/i.test(prompt))
// ⓘ The prompt is one frame line, the transcript, and one question. Anything longer means something crept
// back in; measured against the transcript so a long conversation does not fail it.
check('the instruction text is one line of frame plus one question',
  prompt.replace(TRANSCRIPT, '').trim().split('\n').filter((l) => l.trim()).length === 2)

// ── 3. THE SHADOW STORE IS PARKED, AND ITS RULES STILL HOLD IF IT COMES BACK ─────────────────────────
// ⏸ `PRIORS_OFFERED = false` at generation 3: her own earlier answer would show her a SHAPE, and shape is
// the variable under study. ⭐ Ote's own criterion decides which loss to take — *"repeated use across
// genuinely independent conversations is what would make it interesting"* — and priors destroy independence.
check('priors are parked at this generation', PRIORS_OFFERED === false,
  'if this is now true, the prompt gained a prior block ⇒ it is generation 4, not generation 3')
check('the built prompt contains no prior block', !/said before|you hold nothing|\[1\]/i.test(prompt))

// The function is retained rather than deleted, so its rules are still asserted — the two leaks it already
// shipped (our decision labels stapled to her past thought; a previous generation's vocabulary fed forward)
// must not reappear on the day someone re-enables it.
const G = PROMPT_GENERATION
const fakeLog = [
  { userId: 'u1', outcome: 'save', body: 'HER WORDS ONE', at: '2026-08-19T10:00:00.000Z', promptGeneration: G },
  { userId: 'u1', outcome: 'nuance', body: 'HER WORDS TWO', at: '2026-08-19T11:00:00.000Z', promptGeneration: G },
  { userId: 'u1', outcome: 'nothing', body: 'SHOULD NOT APPEAR', at: '2026-08-19T12:00:00.000Z', promptGeneration: G },
  { userId: 'u2', outcome: 'save', body: 'OTHER ROOM', at: '2026-08-19T13:00:00.000Z', promptGeneration: G },
  { userId: 'u1', outcome: 'save', body: 'PREVIOUS GENERATION', at: '2026-08-18T13:00:00.000Z', promptGeneration: G - 1 },
  { userId: 'u1', outcome: 'save', body: 'UNSTAMPED' },
]
const priors = priorProposalsFor(fakeLog, 'u1')
const rendered = priors.map((p) => p.abstraction).join('\n')
check('only her non-empty proposals from this room would come back', priors.length === 2, `got ${priors.length}`)
check('her own words are what she would see', rendered.includes('HER WORDS ONE') && rendered.includes('HER WORDS TWO'))
check('same-room only (parity with the unbuilt constraint stage)', !rendered.includes('OTHER ROOM'))
check('no decision label stapled to her past thought', !/outcome|save|nuance|decline|propose/i.test(rendered),
  rendered.slice(0, 160))
check('she would see when she said it', /\d{4}-\d{2}-\d{2}/.test(rendered))
// ⚠️ 13 uses by her against 1 by him did not settle authorship in the transcript grep, and a generation
// label is the same kind of evidence: exact match, never at-or-above.
check('a previous generation\'s proposal is never offered back', !rendered.includes('PREVIOUS GENERATION'))
check('an UNSTAMPED row is never offered back', !rendered.includes('UNSTAMPED'),
  'unknown provenance must not be treated as clean provenance')

// ── 4. THE LOG: GENERATIONS INTACT, AND GEN-3 ROWS CARRY HER COMPLETE TEXT WITH NO VERDICT ───────────
// ⚠️ THIS SECTION HAS ALREADY FAILED IN REALITY. The live pass ran 96 minutes on pre-de-contamination code
// — health returned 200 throughout, which says nothing about which code is loaded — and wrote three rows
// with `promptGeneration: undefined`. An unstamped row cannot be assigned a generation afterwards except by
// guessing, and a guessed provenance is worse than none.
//
// ⛔ NO ROW COUNT IS ASSERTED. Five times now an invariant of mine has encoded whatever topology existed
// the day I wrote it.
if (existsSync(OUT_FILE)) {
  const rows = readFileSync(OUT_FILE, 'utf8').split('\n').filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  check('the noticing log parses', rows.length > 0)
  const unstamped = rows.filter((r) => !Number.isInteger(r.promptGeneration)).length
  check('every row names the prompt generation that produced it', unstamped === 0,
    unstamped ? `${unstamped} unstamped row(s) — which prompt wrote them is now a guess` : '')
  // Generations only move forward. Ote: *"Keep Gen-1 and Gen-2 exactly as they are, permanently marked as
  // contaminated experimental records."* A later row carrying an earlier generation means either an old row
  // was rewritten or a stale process is still writing — the same failure either way.
  let monotonic = true
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i].promptGeneration ?? 0) < (rows[i - 1].promptGeneration ?? 0)) monotonic = false
  }
  check('generations never go backwards down the log (no relabelling, no stale writer)', monotonic)
  check('every row still declares that it wrote nothing', rows.every((r) => r.wroteNothing === true))

  // ⭐ The contaminated records stay readable IN THEIR OWN VOCABULARY. Gen-1/gen-2 rows keep `outcome` and
  // `body`; asserting the new shape over them would be relabelling by test.
  const old = rows.filter((r) => r.promptGeneration < 3)
  check('the contaminated records keep their own fields',
    old.every((r) => typeof r.body === 'string' || r.outcome === 'nothing'),
    `${old.length} pre-gen-3 row(s)`)

  // ⛔ And gen-3 rows carry her COMPLETE text and NO verdict. Ote: *"Preserve her response/reasoning
  // verbatim alongside the proposal."*
  const g3 = rows.filter((r) => r.promptGeneration === 3)
  check(`generation-3 rows carry her verbatim text (${g3.length} row(s) so far)`,
    g3.every((r) => typeof r.text === 'string'))
  check('generation-3 rows carry NO outcome, body, or declared field',
    g3.every((r) => r.outcome === undefined && r.body === undefined && r.declared === undefined),
    'a field holding a verdict we inferred reads later as a verdict she gave')
  check('generation-3 rows are marked unclassified until a human reads them',
    g3.every((r) => r.unclassified === true))
  check('generation-3 rows were offered no priors', g3.every((r) => !r.priorLessonsOffered))
} else {
  check('no noticing log yet — nothing to keep intact', true)
}

done()
