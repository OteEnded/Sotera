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
