// D1 · THE EPISODE WINDOW IS CENTRED ON THE MATCH, NOT ON THE CLOCK.
//
// ⚠️⚠️ THE DEFECT THIS PINS. `activateEpisodes` groups candidates per conversation and keeps one `centre`,
// and the window is only ±`windowRadius` messages around it. `prev.centre = mid` used to ride along with the
// `lastAt` update, so the centre became whichever candidate was most RECENT — and the sentence that actually
// matched could fall far outside the window. ⛔ The relevance floor downstream then correctly dropped an
// episode whose text no longer contained the cue: a RECALL loss that looked like a floor problem and was not.
//
// ⭐ The heading above that block already said *"keeping the best-matching centre"*. The comment and the code
// disagreed, and the comment was right — `centre` is initialised from the first candidate, and the evidence
// arrives ranked, so the first one IS the best match.
//
// ⭐ MEASURED offline on the clean corpus, deterministic (a same-config replicate was identical on all ten
// cases): `basil` recovered its on-subject episode 0 → 1, with zero movement on five known-good controls and
// none on the negative control.
//
// ── ⛔ WHY THIS IS A SOURCE ASSERTION AND WHAT THAT COSTS ──────────────────────────────────────────
// The grouping loop is a closure inside `activateEpisodes`, which needs a database, an embedder and a
// disclosure host — so the behaviour is measured by `pipeline/episode-centre-measure.mjs` (a report) and the
// INTENT is pinned here. ⚠️ A source scan whose anchor goes missing stops scanning SILENTLY, which is a
// recorded defect in this project — so the anchor is asserted to exist BEFORE anything is concluded from it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('../../Backend/app/components/memory-cognition-host.js', import.meta.url), 'utf8')

// ⛔ THE ANCHOR FIRST. Everything below is a claim about this block, so a missing block must FAIL rather
// than quietly make every later assertion vacuously true.
const START = SRC.indexOf('// ── 2 · GROUP INTO EPISODES')
const END = SRC.indexOf('// ── 3 ·', START + 1)

test('⛔⛔ the grouping block is found — an anchor that goes missing must fail, not pass vacuously', () => {
  assert.ok(START > 0, 'the "GROUP INTO EPISODES" heading is gone — re-anchor this test rather than deleting it')
  assert.ok(END > START, 'the block has no end anchor')
})

const BLOCK = START > 0 && END > START ? SRC.slice(START, END) : ''
// ⓘ Comments stripped, because the defect is described in prose right there and a scan that reads the prose
// would find its own explanation and call it the bug. (Recorded failure mode: a source scan matching the
// comment that documents the thing it is looking for.)
const CODE = BLOCK.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
// ⓘ The whole file with comments stripped, for assertions about code outside the grouping block.
const CODE_ALL = SRC.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

test('⭐⭐⭐ the centre is NOT reassigned from the recency branch', () => {
  assert.ok(/prev\.lastAt = at/.test(CODE), 'the recency branch itself must still be there — recency is a real input')
  assert.ok(!/prev\.lastAt = at;\s*prev\.centre = mid/.test(CODE),
    'the centre is being overwritten by the most RECENT candidate again — that is D1, and it makes the '
    + 'relevance floor drop episodes whose matching text fell outside the window')
})

test('⭐ the centre is still SET, from the first (best-ranked) candidate', () => {
  // ⚠️ The mirror image of the assertion above: removing the overwrite must not become removing the centre.
  assert.ok(/centre: mid/.test(CODE), 'the centre must still be initialised from the first candidate seen')
})

test('⛔ and the window is still bounded — this fix must not have widened the read', () => {
  // ⭐ The temptation D1 creates is to "just widen the window instead". That would read more of someone
  // else's conversation per episode, which is an access-surface change wearing a relevance costume.
  assert.match(SRC, /windowRadius:\s*2\b/, 'windowRadius changed — that is a different decision from D1')
})

test('ⓘ the stated intent and the code now agree', () => {
  assert.match(BLOCK, /keeping the best-matching centre/,
    'the heading states the intent; if it is reworded, the code above must still satisfy it')
})

// ── ⭐⭐ D2 CANDIDATE · `episodeTopHit` MUST DEFAULT OFF ───────────────────────────────────────────
//
// ⚠️ Measured end to end and it gained 2 on-subject items with 0 lost — but it is a CANDIDATE, not a
// decision: the `+2` is an arbitrary weight, and in a small lexical-only pool it was measured to demote a
// holder from rank 1 to rank 2. ⛔ An untested treatment must not become the baseline by being convenient.
test('⛔⛔ the D2 top-hit term ships OFF, and the baseline arm is unaffected by its wiring', () => {
  assert.match(SRC, /episodeTopHit = false,/, 'the D2 candidate must default to false')
  // ⭐ The bonus is gated on the flag, so the production arm computes exactly what it computed before.
  assert.match(CODE_ALL, /const topHit = episodeTopHit && ep\.bestRank === 0 \? episodeTopHitWeight : 0/,
    'the bonus must be gated on the flag AND on holding the retriever\'s #1 candidate')
  // ⭐ The WEIGHT is separate from whether the term applies, so a controlled experiment can compare weights
  // rather than one being defended after the fact. ⚠️ `+2` was arbitrary and is still the default.
  assert.match(SRC, /episodeTopHitWeight = 2,/, 'the default weight must stay 2 until an experiment moves it')
  // ⓘ `bestRank` is recorded unconditionally — that is deliberate and harmless, and it is asserted so a
  // future edit cannot make the baseline arm depend on it.
  assert.match(CODE_ALL, /bestRank: rank/, 'bestRank must still be recorded while grouping')
})

// ── ⭐⭐ D4 CANDIDATE · `episodeCentreCueMatch` MUST DEFAULT OFF, AND MUST FALL BACK ────────────────
//
// ⚠️ Measured prevalence BEFORE it was built: the defect applies to **2 of 82** holder conversations across
// the ten-case set — 2%. Measured effect: **0 alone, +1 on top of top-hit** (the notebook case), because a
// centre fix can only pay off on a conversation that ranking has already promoted into the top-5.
// ⛔ Two flags, never bundled — Ote: *"Treat it as its own measured change."*
test('⛔⛔ the D4 cue-centre term ships OFF, and it FALLS BACK rather than filtering', () => {
  assert.match(SRC, /episodeCentreCueMatch = false,/, 'the D4 candidate must default to false')
  // ⭐⭐ THE LOAD-BEARING ASSERTION. `?? ep.centre` is what keeps this a CENTRE choice rather than a second
  // relevance floor upstream of the real one: a conversation with no cue-matching candidate keeps its
  // best-ranked centre and stays in the running.
  assert.match(CODE_ALL, /const centreId = episodeCentreCueMatch \? \(ep\.cueCentre \?\? ep\.centre\) : ep\.centre/,
    'the cue centre must FALL BACK to the best-ranked centre — without the fallback this drops conversations')
  // ⛔ And it must be the two consumers, not one: the own-half read AND the counterpart's disclosure call.
  assert.equal((CODE_ALL.match(/centreId/g) ?? []).length, 3,
    'centreId must be resolved once and used by BOTH the own-half window and inspectAround')
  // ⓘ The two candidate flags are independent, so neither can be credited with the other's effect.
  assert.ok(!/episodeTopHit && episodeCentreCueMatch|episodeCentreCueMatch && episodeTopHit/.test(CODE_ALL),
    'the two D2/D4 flags must stay independent — bundling them makes the 2x2 impossible')
})
