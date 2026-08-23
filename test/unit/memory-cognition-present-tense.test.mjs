// ⭐⭐⭐ W1 · THE PRESENT IS NOT A RECOLLECTION — the boundary, asserted explicitly.
//
// ⛔⛔ WHAT THIS FILE EXISTS TO STOP, AND IT WAS MEASURED, NOT IMAGINED. On 2026-08-24, in **481 of 482**
// recorded turns, the cognition block quoted the question she was being asked RIGHT NOW back to her as
// `They said, <date>: …` — the identical sentence pattern and date format used for an episode from five
// days ago. A real block, verbatim:
//
//     I remember talking with Hermes on 20 August.
//     I remember — 21 August — talking about Hermes.
//     They said, 23 August: How's Hermes doing? Have you talked with her lately?
//     That is what I can reach on this right now: everything I currently have available.
//
// ⇒ the last line of her memory was the first line of the conversation.
//
// ⭐ EVERY TEST BELOW WAS RUN AGAINST THE PRE-W1 SOURCE FIRST and the boundary tests FAILED there — see
// the guard note on each. A regression test that passes before the fix guards nothing.
//
// ⛔ AND THE FOUR THINGS THIS MUST NOT CHANGE, each asserted here rather than assumed:
//   ① retained memory keeps recollection grammar;
//   ② episodes keep dated recollection grammar, byte-identical;
//   ③ evidence is never rendered as recollection;
//   ④ instructions are never rendered as recollection;
//   ⑤ nothing about ownership, authorization or access moves.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { datedPrefix, isTimeBound, TIME_BOUND } from '../../Backend/app/components/memory-cognition-timeframe.js'
import { AVAILABILITY, BASIS, RETENTION, SOURCE } from '../../Backend/app/components/memory-cognition-axes.js'
import { OWNER, ownerOf } from '../../Backend/app/components/memory-ownership.js'
import { evidenceForModel } from '../../Backend/app/components/memory-cognition-projection.js'

const HOST = readFileSync(new URL('../../Backend/app/components/memory-cognition-host.js', import.meta.url), 'utf8')

// ══ ① THE PREFIX HELPER · the past-tense guarantee survives without a date ═════════════════════════
//
// ⚠️ ⛔ GUARD: `datedPrefix` took two arguments before W1, so a third-argument call could not have
// produced anything — this assertion is unsatisfiable against the pre-W1 source.
test('W1 · datedPrefix names WHERE when a date would lie about WHEN', () => {
  assert.equal(datedPrefix(null, '', 'in this conversation'), 'Earlier in this conversation I said: ')
  // ⭐ THE POINT OF §3B IS PAST TENSE, AND IT MUST SURVIVE. "Earlier … I said" is past; a present-tense
  // reading is what re-asserts a stale *"I can't reach that"* after access has changed.
  assert.match(datedPrefix(null, '', 'in this conversation'), /^Earlier\b/,
    '⛔ §3B requires the past tense — dropping the date must not drop the pastness')
  assert.ok(!/\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December)\b/
    .test(datedPrefix(null, '', 'in this conversation')), '⛔ never invent a date for the present')
  // ⛔ AND THE ADDRESSEE STILL COMPOSES — R4 must not be lost to W1.
  assert.equal(datedPrefix(null, ' to Ote', 'in this conversation'), 'Earlier in this conversation I said to Ote: ')
})

test('W1 · the two-argument contract is byte-identical — episodes must not move', () => {
  // ⭐ These three are the pre-W1 assertions, copied unchanged from memory-cognition-timeframe.test.mjs.
  // If W1 changed them, every episode line in every block changed with them.
  assert.equal(datedPrefix('21 August'), 'On 21 August I said: ')
  assert.equal(datedPrefix(null), 'Earlier I said: ')
  assert.equal(datedPrefix('21 August', ' to Hermes'), 'On 21 August I said to Hermes: ')
})

// ══ ② THE FLAG IS EXPLICIT, NOT INFERRED ══════════════════════════════════════════════════════════
//
// ⚠️ ⛔ GUARD: `present:` did not exist in the host before W1; both assertions fail against it.
// ⭐ WHY THIS IS A TEST AND NOT A STYLE PREFERENCE: the render could have sniffed the `ws:` id prefix or
// switched on `source`, and either would silently adopt the next population somebody adds to that
// branch. This project has now hit that defect ELEVEN times. A population is present only if it says so.
test('W1 · working-set items are STAMPED present, and the render switches on the stamp', () => {
  assert.match(HOST, /present: true,/, 'the working set must declare itself present')
  assert.match(HOST, /if \(i\.present\) \{/, 'the render must switch on the declaration')
  assert.ok(!/startsWith\('ws:'\)|\/\^ws:\//.test(HOST),
    '⛔ the render must not infer the present from an id prefix')
})

test('W1 · isLatest is computed BEFORE the cue filter', () => {
  // ⚠️ THE ORDERING IS LOAD-BEARING. The newest message is the current turn whether or not it survives
  // the cue filter; taking the maximum after filtering would promote an older line to "You just asked".
  const decl = HOST.indexOf('const newestRollingId')
  const filter = HOST.indexOf('.filter((m) => {')
  assert.ok(decl > 0 && filter > 0 && decl < filter,
    '⛔ newestRollingId must be taken from the unfiltered rows')
  assert.match(HOST, /attributes: \['id', 'role', 'content', 'created_at', 'rolling_id'\]/,
    'rolling_id must be SELECTED, not merely ordered by')
})

// ══ ③ THE RENDERED GRAMMAR · present vs retained vs episode ═══════════════════════════════════════
//
// ⭐ The render is a closure inside `buildMemoryCognition` and needs a live db to reach. These assert on
// the SOURCE, which is what the 481/482 measurement was traced to — and each one names the string it is
// protecting so a future edit that reverts the behaviour fails here rather than in production.
test('W1 · present material gets present grammar and NO date', () => {
  const present = HOST.slice(HOST.indexOf('if (i.present) {'), HOST.indexOf('// ⚠️⚠️ EVERYTHING BELOW IS THE PRE-W1 GRAMMAR'))
  assert.ok(present.length > 200, 'the present branch must exist')
  assert.match(present, /'Earlier in this conversation I said: '/)
  assert.match(present, /'Earlier in this conversation you said: '/)
  assert.match(present, /'You just asked: '/)
  assert.match(present, /'You just said: '/)
  // ⛔ THE DEFECT ITSELF: recollection grammar, and the `${when}` date, must not appear in this branch.
  assert.ok(!/I remember saying/.test(present),
    '⛔⛔ this is the 481/482 defect — present material must never say "I remember saying"')
  assert.ok(!/They said/.test(present),
    '⛔⛔ nor "They said", which is how the live question was rendered')
  assert.ok(!/\$\{when/.test(present),
    '⛔ no date on present material — "On 23 August" is the wrong past for thirty seconds ago')
})

test('W1 · "asked" is used only for an actual question', () => {
  assert.match(HOST, /\/\\\?\\s\*\$\/\.test/,
    '⛔ "You just asked" must be gated on the text ending in a question mark')
})

test('W1 · RETAINED memory keeps recollection grammar — unchanged', () => {
  // ⭐ ①. The storedMemory branch is what "actual retained memory should continue to use recollection
  // grammar" means concretely. It must still `continue` before the present branch is ever reached.
  const stored = HOST.slice(HOST.indexOf('if (i.source === SOURCE.storedMemory) {'), HOST.indexOf('if (i.present) {'))
  assert.match(stored, /I decided to keep this/, 'retained → "I decided to keep this"')
  assert.match(stored, /I worked this out/, 'inferred → "I worked this out"')
  assert.match(stored, /Several things point this way/, 'synthesized')
  assert.match(stored, /I have this on file/, 'told')
  // ⛔ AND IT MUST RETURN BEFORE THE PRESENT BRANCH IS REACHED. Ordering is the whole guarantee: if
  // `if (i.present)` came first, a stored memory that ever gained the flag would lose its recollection
  // grammar. Asserted as positions in the file, which is the only thing that can actually go wrong.
  assert.ok(HOST.indexOf('if (i.source === SOURCE.storedMemory) {') < HOST.indexOf('if (i.present) {'),
    '⛔ the stored branch must be tested BEFORE the present branch')
  assert.ok(/continue/.test(stored), '⛔ and it must `continue` rather than fall through')
})

test('W1 · EPISODES keep dated recollection grammar — unchanged', () => {
  // ⭐ ②. Episodes are her memory of another conversation and are exactly what recollection grammar is
  // for. W1 must not have touched them.
  const eps = HOST.slice(HOST.indexOf('// ── EPISODES ·'), HOST.indexOf('// ── STORED THINGS AND LOOSE LINES'))
  assert.match(eps, /I remember talking with \$\{ep\.who\}\$\{on\}\./)
  assert.match(eps, /I remember\$\{on \? ` — \$\{when\} —` : ''\} talking about/)
  assert.match(eps, /I know I talked with \$\{ep\.who\}\$\{on\}, and I can't get back to what was said\./)
  assert.match(eps, /dateAndMark\(x, ep\.id, to\)/, '⛔ episodes still pass NO `within` — they keep their date')
  assert.ok(!/in this conversation/.test(eps), '⛔ an episode is not this conversation')
})

// ══ ④ EVIDENCE AND INSTRUCTIONS ARE NOT RECOLLECTION ══════════════════════════════════════════════
test('W1 · ③ tool EVIDENCE is not rendered as recollection', () => {
  // ⭐ Evidence goes through `evidenceForModel`, a different module entirely — W1 never touches it. This
  // asserts the boundary rather than assuming it: a tool result must not come back wearing "I remember".
  const out = String(evidenceForModel('recall_own_history',
    JSON.stringify({ conversations: [{ conversationRef: 'abc12345', counterpart: 'Hermes', when: '2026-08-20', matches: 2 }] }),
    { enabled: true }))
  assert.ok(!/I remember saying|I decided to keep this|Earlier in this conversation/.test(out),
    '⛔ evidence must not borrow recollection or present-tense grammar')
  assert.ok(out.length > 0, 'and it must still say something')
})

test('W1 · ④ INSTRUCTIONS are not rendered as recollection', () => {
  // ⭐ Instructions live in the composer's own parts and never pass through the cognition render at all.
  // The assertion is that W1's four new strings exist ONLY in the cognition host — if one of them ever
  // appears in the composer, an instruction has started speaking in her recollection voice.
  const composer = readFileSync(new URL('../../Backend/app/components/context-composer.js', import.meta.url), 'utf8')
  for (const s of ['Earlier in this conversation I said', 'You just asked: ', 'I remember saying', 'I decided to keep this']) {
    assert.ok(!composer.includes(s), `⛔ instruction text must not use the phrase "${s}"`)
  }
})

// ══ ⑤ OWNERSHIP, AUTHORIZATION AND ACCESS DID NOT MOVE ════════════════════════════════════════════
test('W1 · ⑤ the ownership rule is untouched — a render change may not decide whose a thing is', () => {
  assert.equal(ownerOf({ kind: 'message', role: 'assistant' }), OWNER.sotera)
  assert.equal(ownerOf({ kind: 'message', role: 'user' }), OWNER.account)
  // ⭐ And the working set's axes are the same four values W1 found already correct. The defect was the
  // prose, never the data, so if any of these changed, W1 went further than it was allowed to.
  // ⚠️ SLICED TO THE END OF THE FUNCTION, not to `present: true` — the axes are stamped AFTER the flag,
  // and the first version of this test cut away the region it was trying to read.
  const wsStart = HOST.indexOf('async function activateWorkingSet')
  const ws = HOST.slice(wsStart, HOST.indexOf('confidence: 0.95', wsStart) + 40)
  assert.match(ws, /basis: BASIS\.attestedBySource/)
  assert.match(ws, /availability: AVAILABILITY\.recalled/)
  assert.match(ws, /retention: RETENTION\.notRetained/)
  assert.match(ws, /source = m\.role === 'assistant' \? SOURCE\.ownUtterance : SOURCE\.counterpartUtterance/)
  assert.match(ws, /provenanceAccountId: userId/)
  // sanity: the axis constants themselves are what the assertions above name
  assert.equal(BASIS.attestedBySource, 'attested-by-source')
  assert.equal(AVAILABILITY.recalled, 'recalled')
  assert.equal(RETENTION.notRetained, 'not-retained')
})

test('W1 · ⑤ no authorization or entitlement logic was added to the render', () => {
  const present = HOST.slice(HOST.indexOf('if (i.present) {'), HOST.indexOf('// ⚠️⚠️ EVERYTHING BELOW IS THE PRE-W1 GRAMMAR'))
  for (const forbidden of ['entitled', 'memory_access_scope', 'sayable', 'withheld', 'disclos', 'can(']) {
    assert.ok(!present.includes(forbidden),
      `⛔ the render decides GRAMMAR. "${forbidden}" belongs to the utterance boundary and must not appear here`)
  }
})

// ══ ⑥ D1 AND D2 ARE INTACT ════════════════════════════════════════════════════════════════════════
//
// ⛔ Their own guards live in memory-cognition-episode-centre.test.mjs and were each proved to fail
// against the pre-fix source. This is a second, cheap witness that W1 did not disturb them, because W1
// edits the same file.
test('W1 · D1 and D2 survive in the same file W1 edited', () => {
  assert.ok(!/prev\.lastAt = at; prev\.centre = mid/.test(HOST),
    '⛔ D1: the episode window centre must not follow the clock again')
  assert.match(HOST, /episodeTopHit = true/, '⛔ D2 must still ship ON')
  assert.match(HOST, /episodeTopHitWeight = 2/, '⛔ D2 weight is the measured saturation point')
  assert.match(HOST, /episodeCentreCueMatch = false/, '⛔ D4 stays off')
  assert.match(HOST, /const centreId = episodeCentreCueMatch \? \(ep\.cueCentre \?\? ep\.centre\) : ep\.centre/,
    '⛔ the D4 guard must keep its `?? ep.centre` fallback')
})

// ══ ⑦ THE UNCLASSIFIED-POPULATION TRAIL ═══════════════════════════════════════════════════════════
test('W1 · an unclassified utterance leaves a trail rather than changing behaviour', () => {
  // ⭐ The old grammar is KEPT as the fall-through on purpose: the safe failure for a population nobody
  // has classified is today's behaviour, not a silent promotion to present tense. But it must be visible.
  const after = HOST.slice(HOST.indexOf('// ⚠️⚠️ EVERYTHING BELOW IS THE PRE-W1 GRAMMAR'))
  assert.match(after, /onUnclassifiedUtterance\?\.\(/, 'a new population must leave a trail')
  assert.match(after, /I remember saying\$\{when/, 'and the old grammar stays as the safe fall-through')
  assert.match(HOST, /onUnclassifiedUtterance = \(info\)/, 'with a default that logs')
})

// ══ ⑧ THE TIME-BOUND PATH · §3B is not weakened ═══════════════════════════════════════════════════
test('W1 · a time-bound present self-report stays past tense AND records contradictions', () => {
  assert.equal(isTimeBound({ timeBound: TIME_BOUND.capability }), true)
  const present = HOST.slice(HOST.indexOf('if (i.present) {'), HOST.indexOf('// ⚠️⚠️ EVERYTHING BELOW IS THE PRE-W1 GRAMMAR'))
  // ⭐ It still goes through dateAndMark, which is what pushes onto `contradictions`. Bypassing it to
  // avoid the date would have silently dropped contradiction detection for the current conversation.
  assert.match(present, /dateAndMark\(i, i\.id, '', 'in this conversation'\)/,
    '⛔ §3B must keep its contradiction record — only the date is dropped')
})
