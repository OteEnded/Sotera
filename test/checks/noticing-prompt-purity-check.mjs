// NOTICING PROMPT PURITY — the guard that keeps the experiment an experiment.
//
// ⛔⛔ WHY THIS FILE EXISTS. Ote's ruling, 2026-08-20: *"keep treating prompt contamination as a
// first-class experimental failure. If we accidentally give Sotera a concept, vocabulary, category, or
// distinction we're subsequently trying to measure as hers, that observation is contaminated."* And on the
// one that already happened: *"Withdraw the multiple-relations finding completely rather than trying to
// salvage it."*
//
// I reported that her natural output *"needs multiple relations"* because one proposal came back saying
// **refines · qualifies · sits alongside · replaces**. My own prompt had said, verbatim: *"say whether it
// replaces it, refines it, qualifies it, or sits alongside it."* ⇒ I handed her four words and then counted
// them as her ontology. Removing them from the prompt fixed that instance. **Nothing stopped it coming
// back**, and the population is worthless the moment it does — which is what this check is for.
//
// ⚠️ AND IT IS NOT A STYLE RULE. A banned word re-entering the prompt does not degrade the sample, it
// **invalidates every row written after it**, because the mechanism producing the finding becomes my text
// instead of her thinking. That is why this is an assertion and not a comment.
//
// ── THE TWO CLASSES, WHICH ARE NOT THE SAME THING ─────────────────────────────────────────────────────
// ONTOLOGY words say what KIND a thing is (lesson / practice / episode / self-model) or how two things
// RELATE (replaces / refines / qualifies / sits alongside / supersedes / coexists). Those are the answer
// set the experiment exists to discover, so they are banned ANYWHERE in the prompt.
//
// DECISION words say what to DO (save / propose / decline). The pass needs exactly one parseable signal —
// a classifier guessing a decision out of prose would be *us* deciding — so they are allowed on the
// OUTCOME line and NOWHERE ELSE. ⭐ `nothing` is deliberately exempt from the position rule: the prompt
// must be free to say, in the body, that answering nothing is a complete answer. That sentence is the
// anti-quota, and a guard that forbade it would push the prompt toward "find something to remember."
//
// ⚠️ `revise` and `nuance` are ONTOLOGY here, not decisions, and that reclassification is the point. They
// shipped in generation 1 on the declared-outcome line — relation words wearing a decision's clothes —
// while I was telling Ote the prompt only leaked decision vocabulary.
//
// Runs offline. No database, no server, no model call: it builds the prompt and reads the log.

import { readFileSync, existsSync } from 'node:fs'
import { makeChecker } from '../harness.mjs'
import { buildNoticingPrompt } from '../../Backend/app/components/noticing-host.js'
import { priorProposalsFor, OUT_FILE } from '../../Backend/app/components/noticing-pass.js'

const { check, done } = makeChecker('noticing-prompt-purity')

// Substrings, case-insensitive, deliberately stemmed — `qualif` catches qualify/qualifies/qualified, and a
// guard that only caught the exact inflection I happened to ship last time would not have caught last time.
const ONTOLOGY = [
  'replace', 'refine', 'qualif', 'alongside', 'supersede', 'coexist', 'sits with',
  'lesson', 'practice', 'self-model', 'self model', 'episode', 'proposal',
  'revise', 'revision', 'nuance', 'taxonomy', 'categor',
]
// Allowed once, on the OUTCOME line only. `nothing` is exempt by design — see the header.
const DECISION = ['save', 'propose', 'decline', 'changes_something']

const prompt = buildNoticingPrompt({
  who: 'Someone',
  transcript: 'user: hello\nSotera: hello',
  priorLessons: [{ abstraction: '2026-08-19 — something she said before' }],
})
const lower = prompt.toLowerCase()

// ── 1. NO ONTOLOGY VOCABULARY ANYWHERE ───────────────────────────────────────────────────────────────
for (const w of ONTOLOGY) {
  check(`prompt does not contain the ontology word "${w}"`, !lower.includes(w),
    lower.includes(w) ? 'if this is deliberate, the finding it produces is OURS, not hers' : '')
}

// ── 2. DECISION VOCABULARY IS CONFINED TO THE OUTCOME LINE ───────────────────────────────────────────
// ⚠️ Checked by POSITION, not by count. A second mention of `save` in the body reads as an instruction
// about what she is here to produce, even when the OUTCOME line itself is untouched.
const outcomeLine = prompt.split('\n').find((l) => l.trim().startsWith('Begin your answer with one line: OUTCOME:'))
check('the OUTCOME line is present (the pass needs one parseable signal)', !!outcomeLine)
const body = (outcomeLine ? prompt.replace(outcomeLine, '') : prompt).toLowerCase()
for (const w of DECISION) {
  check(`decision word "${w}" appears only on the OUTCOME line`, !body.includes(w),
    body.includes(w) ? 'in the prompt body this is an instruction, not a signal' : '')
}

// ⭐ The anti-quota sentence must survive. This is the one assertion here that requires something to be
// PRESENT: the prompt has to keep telling her that nothing is a complete answer, or the pass quietly
// becomes "Sotera, find something to remember" — Ote's constraint, verbatim.
check('the prompt still says that answering nothing is a complete answer', /nothing/i.test(prompt))
check('the prompt asks for no minimum and no effort quota',
  !/\bhow many\b|\bat least\b|\btry to find\b|\bmake sure you\b/i.test(prompt))

// ── 3. THE SHADOW STORE SHOWS HER HER OWN WORDS AND A DATE — NOTHING ELSE ────────────────────────────
// Her prior proposals come back to her from the log so that *"this changes what I said before"* is
// reachable at all. The first version prefixed each one with `outcome=save` / `outcome=nuance` — our
// machine vocabulary stapled to her own past thought. Ote: *"I want her own history visible, but I don't
// want to teach her that 'memory proposal' is the category she is supposed to produce."*
const fakeLog = [
  { userId: 'u1', outcome: 'save', body: 'HER WORDS ONE', at: '2026-08-19T10:00:00.000Z' },
  { userId: 'u1', outcome: 'nuance', body: 'HER WORDS TWO', at: '2026-08-19T11:00:00.000Z' },
  { userId: 'u1', outcome: 'nothing', body: 'SHOULD NOT APPEAR', at: '2026-08-19T12:00:00.000Z' },
  { userId: 'u2', outcome: 'save', body: 'OTHER ROOM', at: '2026-08-19T13:00:00.000Z' },
]
const priors = priorProposalsFor(fakeLog, 'u1')
const rendered = priors.map((p) => p.abstraction).join('\n')
check('only her non-empty proposals from this room come back', priors.length === 2, `got ${priors.length}`)
check('her own words are what she sees', rendered.includes('HER WORDS ONE') && rendered.includes('HER WORDS TWO'))
check('the shadow store stays same-room (parity with the unbuilt constraint stage)', !rendered.includes('OTHER ROOM'))
check('no decision label is stapled to her past thought', !/outcome|save|nuance|decline|propose/i.test(rendered),
  rendered.slice(0, 160))
check('she sees when she said it', /\d{4}-\d{2}-\d{2}/.test(rendered))

// And the prompt carrying them must not name the container either — naming the container names the
// category, which is how "produce entries of this type" gets taught without a single ontology word.
const withPriors = buildNoticingPrompt({ who: 'X', transcript: 't', priorLessons: priors }).toLowerCase()
check('the prior block does not name what kind of thing her past output was',
  !/your memories|your proposals|your lessons|your notes/.test(withPriors))

// ── 4. THE LOG'S GENERATION BOUNDARY IS INTACT ───────────────────────────────────────────────────────
// ⚠️ THIS ONE HAS ALREADY FAILED IN REALITY. The live pass ran for 96 minutes on code from before the
// de-contamination edits — health returned 200 the whole time, which says nothing about which code is
// loaded — and wrote three rows with `promptGeneration: undefined`. An unstamped row cannot be assigned to
// a generation afterwards except by guessing, and a guessed provenance is worse than none.
//
// ⛔ NO ROW COUNT IS ASSERTED HERE. Five times now an invariant of mine has encoded the topology that
// happened to exist when I wrote it; a floor on the population would fail the day the log is rotated and
// would tell us nothing either way.
if (existsSync(OUT_FILE)) {
  const rows = readFileSync(OUT_FILE, 'utf8').split('\n').filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  check('the noticing log parses', rows.length > 0)
  const unstamped = rows.filter((r) => !Number.isInteger(r.promptGeneration)).length
  check('every row names the prompt generation that produced it', unstamped === 0,
    unstamped ? `${unstamped} unstamped row(s) — which prompt wrote them is now a guess` : '')
  // Generations only move forward. Ote: *"keep the old records marked as coming from the previous prompt
  // generation rather than relabelling them."* A later row carrying an EARLIER generation means either an
  // old row was rewritten or a stale process is still writing — both are the same failure.
  let monotonic = true
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i].promptGeneration ?? 0) < (rows[i - 1].promptGeneration ?? 0)) monotonic = false
  }
  check('generations never go backwards down the log (no relabelling, no stale writer)', monotonic)
  check('every row still declares that it wrote nothing', rows.every((r) => r.wroteNothing === true))
  check('every non-empty row keeps her unparsed words',
    rows.every((r) => typeof r.body === 'string' || r.outcome === 'nothing'))
} else {
  check('no noticing log yet — nothing to keep intact', true)
}

done()
