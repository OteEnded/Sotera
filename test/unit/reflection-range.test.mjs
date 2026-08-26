// ⭐⭐⭐ THE RANGE-BOUNDED CURSOR (option B) + THE COVERAGE GUARD (option C).
//
//   node --test unit/reflection-range.test.mjs
//
// ── THE INVARIANT EVERYTHING HERE DEFENDS ───────────────────────────────────────────────────────
//   ⭐ EVERY MESSAGE WITH rolling_id <= reviewedTo WAS PRESENT, IN FULL, IN THE PROMPT.
// `up_to_rolling_id` may only ever be set to `reviewedTo`. ⛔ Never to the top of the conversation.
//
// ── ⛔ WHAT THIS REPLACES, MEASURED ──────────────────────────────────────────────────────────────
// Across 76 completed revisits: 15 elided their middles and **648 messages were swept below a watermark
// having never been shown to her**. `up_to` was answering two questions — *how far did the sweep reach*
// and *how much has she reviewed* — which agree only while nothing is dropped.
//
// ⛔ These are PURE tests. No database, no model, no server.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  selectReviewableRange, shapeReflectionTranscript, transcriptLine,
} from '../../Backend/app/components/reflection-lifecycle.js'

// ── FIXTURES ────────────────────────────────────────────────────────────────────────────────────
// ⭐ Sized in CHARS deliberately: the budget is a char budget, so a fixture counted in messages would be
// testing a different rule than the one that ships.
// ⚠️ CONTENT MUST BE UNIQUE PER MESSAGE. My first fixture used `'x'.repeat(chars)` for every message, so
// 21 messages produced 21 IDENTICAL lines and the duplicate-detection assertion "failed" against a
// perfectly correct transcript — `new Set(lines).size` was 2 because the fixture, not the code, had
// duplicates. ⭐ A test whose fixture cannot distinguish the cases it is checking proves nothing.
const msg = (rolling_id, chars = 100, role = rolling_id % 2 ? 'user' : 'assistant') => {
  const tag = `#${rolling_id} `
  return { rolling_id, role, content: tag + 'x'.repeat(Math.max(1, chars - tag.length)) }
}

const build = (n, chars = 100, startAt = 1) =>
  Array.from({ length: n }, (_, i) => msg(startAt + i, chars))

const MAX = 24000

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · AN OVERSIZED BACKLOG NEVER ADVANCES PAST UNSEEN MESSAGES
// ════════════════════════════════════════════════════════════════════════════════════════════════
test('oversized backlog: reviewedTo never passes a message that was not supplied', () => {
  // 400 messages x 1,000 chars = ~400k chars, far past the 24k budget.
  const msgs = build(400, 1000)
  const r = selectReviewableRange(msgs, { already: 0, maxChars: MAX })

  assert.ok(r.truncated, 'this backlog must not fit in one run')
  assert.ok(r.remaining > 0, 'and it must report what it left behind')

  // ⭐ THE CORE ASSERTION: reviewedTo is the last SUPPLIED message, not the last EXISTING one.
  const lastSupplied = r.slice[r.slice.length - 1]
  assert.equal(r.reviewedTo, lastSupplied.rolling_id)
  assert.notEqual(r.reviewedTo, msgs[msgs.length - 1].rolling_id, 'must NOT jump to the top')

  // ⛔ AND NOTHING ABOVE THE WATERMARK MAY HAVE BEEN OMITTED. This is the property that failed before:
  // every id <= reviewedTo must actually appear in the slice.
  const supplied = new Set(r.slice.map((m) => m.rolling_id))
  const shouldBeCovered = msgs.filter((m) => m.rolling_id <= r.reviewedTo)
  for (const m of shouldBeCovered) {
    assert.ok(supplied.has(m.rolling_id), `message ${m.rolling_id} is under the watermark but was not supplied`)
  }
  assert.equal(shouldBeCovered.length, r.slice.length)
})

test('oversized backlog: the transcript for the chosen range does NOT elide', () => {
  const msgs = build(400, 1000)
  const r = selectReviewableRange(msgs, { already: 0, maxChars: MAX })
  const shaped = shapeReflectionTranscript(r.slice, { maxChars: MAX })
  // ⭐ This is what makes option B work: bound the RANGE and the shaper's elision branch is unreachable.
  assert.equal(shaped.elided, false, 'the selected range must fit without eliding')
  assert.equal(shaped.considered, r.slice.length)
  assert.ok(shaped.transcript.length <= MAX, `transcript ${shaped.transcript.length} exceeds ${MAX}`)
})

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE NEXT RUN STARTS EXACTLY AT THE FIRST UNSEEN MESSAGE
// ════════════════════════════════════════════════════════════════════════════════════════════════
test('successive runs resume at exactly the first unseen message, and lose nothing', () => {
  const msgs = build(300, 1000)
  const seen = []
  let already = 0
  let runs = 0

  while (runs < 100) {
    const r = selectReviewableRange(msgs, { already, maxChars: MAX })
    if (!r.newCount) break
    runs += 1

    // ⭐ THE RESUME PROPERTY: the first NEW message of this run is the first id above the old watermark.
    const firstNew = r.slice.find((m) => m.rolling_id > already)
    const expected = msgs.find((m) => m.rolling_id > already)
    assert.equal(firstNew.rolling_id, expected.rolling_id, 'resumed at the wrong message')

    for (const m of r.slice.filter((x) => x.rolling_id > already)) seen.push(m.rolling_id)
    assert.ok(r.reviewedTo > already, 'the watermark must strictly advance')
    already = r.reviewedTo
  }

  // ⭐⭐ NOTHING SKIPPED, NOTHING DOUBLE-COUNTED, ACROSS THE WHOLE DRAIN.
  assert.deepEqual(seen, msgs.map((m) => m.rolling_id), 'the union of all runs must be every message, in order')
  assert.equal(already, msgs[msgs.length - 1].rolling_id, 'the drain must finish at the top')
  assert.ok(runs > 1, 'this fixture is meant to need several runs')
})

test('the cursor cannot wedge — even one message larger than the whole budget advances it', () => {
  // ⛔ THE STALL CASE. If the budget were consulted before the first message, this would loop forever.
  //
  // ⭐ NOTE WHY `lineClip` IS DISABLED HERE, because it is a finding rather than a test convenience:
  // with the shipping clip of 1,500 a single message costs ~1,511 chars, so it CANNOT exceed a 24,000
  // budget — the stall is structurally unreachable in production. My first version of this test passed a
  // 72,000-char message with the default clip, it was silently clipped to 1,500, all three messages fit,
  // and the test failed asserting newCount===1. ⇒ the clip is disabled so the guarantee is exercised on
  // its own terms rather than being masked by a second mechanism that happens to prevent the case.
  const msgs = [msg(1, MAX * 3), msg(2, 100), msg(3, 100)]
  const r = selectReviewableRange(msgs, { already: 0, maxChars: MAX, lineClip: MAX * 4 })
  assert.equal(r.newCount, 1, 'the oversized first message must still be taken')
  assert.equal(r.reviewedTo, 1)
  assert.ok(r.truncated && r.remaining === 2, 'and the rest must be reported as backlog')

  // and the next run gets past it
  const r2 = selectReviewableRange(msgs, { already: r.reviewedTo, maxChars: MAX, lineClip: MAX * 4 })
  assert.ok(r2.reviewedTo > r.reviewedTo, 'the second run must advance beyond the oversized message')
})

test('with the shipping lineClip, no single message can exceed the budget at all', () => {
  // ⭐ The complement of the test above: this is WHY the stall cannot occur in production.
  const huge = msg(1, 10_000_000)
  assert.ok(transcriptLine(huge, 1500).length < MAX,
    'a clipped line must be far below the budget, making the wedge case unreachable')
})

test('every run advances by at least one message, for any budget', () => {
  for (const maxChars of [1, 50, 500, 5000, MAX]) {
    const msgs = build(50, 2000)
    const r = selectReviewableRange(msgs, { already: 0, maxChars })
    assert.ok(r.newCount >= 1, `budget ${maxChars} produced no progress`)
    assert.ok(r.reviewedTo !== null)
  }
})

test('lineClip gives a structural floor of ~15 messages at the real budget', () => {
  // ⭐ Not a magic number: lineClip caps a line at ~1,511 chars, so 24,000 always fits at least 15.
  const msgs = build(200, 99999)          // every message far over the clip
  const r = selectReviewableRange(msgs, { already: 0, maxChars: MAX, lineClip: 1500 })
  assert.ok(r.newCount >= 15, `expected >= 15 messages per run, got ${r.newCount}`)
  assert.ok(transcriptLine(msgs[0], 1500).length <= 1500 + 12, 'a clipped line must stay near the clip')
})

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · <40 MESSAGE TRANSCRIPTS MUST NOT DUPLICATE HEAD/TAIL
// ════════════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE MEASURED DEFECT, ROW #82: slice = 36 messages, shaper claimed 40, transcript had 40 lines of
// which 36 were distinct ⇒ 4 duplicated, and `whole = 26,193 chars` became `shaped = 28,351` — a size
// cap that made its input BIGGER.
test('elision branch: head and tail never overlap below 2x edge', () => {
  for (const n of [21, 25, 30, 36, 39, 40, 41, 80]) {
    // 1,500 chars each guarantees the whole exceeds 24k for every n >= 21.
    const msgs = build(n, 1500)
    const shaped = shapeReflectionTranscript(msgs, { maxChars: MAX, edge: 20 })

    assert.ok(shaped.considered <= n, `n=${n}: considered ${shaped.considered} exceeds the input`)

    const lines = shaped.transcript.split('\n').filter((l) => l !== '…')
    assert.equal(lines.length, new Set(lines).size, `n=${n}: transcript contains duplicated lines`)
    assert.equal(lines.length, shaped.considered, `n=${n}: considered disagrees with the lines emitted`)

    // ⭐ And the cap must actually cap: shaping may never produce more than it was given.
    const whole = msgs.map((m) => transcriptLine(m)).join('\n')
    assert.ok(shaped.transcript.length <= whole.length,
      `n=${n}: shaping GREW the transcript (${whole.length} -> ${shaped.transcript.length})`)
  }
})

test('elision branch: `elided` is true only when something was really dropped', () => {
  const noDrop = shapeReflectionTranscript(build(36, 1500), { maxChars: MAX, edge: 20 })
  assert.equal(noDrop.considered, 36)
  assert.equal(noDrop.elided, false, 'nothing was dropped, so elided must be false')
  assert.ok(!noDrop.transcript.includes('…'), 'no gap marker when there is no gap')

  const realDrop = shapeReflectionTranscript(build(100, 1500), { maxChars: MAX, edge: 20 })
  assert.equal(realDrop.considered, 40)
  assert.equal(realDrop.elided, true)
  assert.ok(realDrop.transcript.includes('…'), 'a real gap must be marked')
})

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · messages_considered EXACTLY MATCHES WHAT WAS SUPPLIED TO THE MODEL
// ════════════════════════════════════════════════════════════════════════════════════════════════
test('considered equals the number of transcript lines, on every path', () => {
  const cases = [
    build(1, 100), build(5, 100), build(39, 100), build(40, 100),
    build(36, 1500), build(100, 1500), build(400, 1000),
  ]
  for (const msgs of cases) {
    const r = selectReviewableRange(msgs, { already: 0, maxChars: MAX })
    const shaped = shapeReflectionTranscript(r.slice, { maxChars: MAX })
    const lines = shaped.transcript ? shaped.transcript.split('\n').filter((l) => l !== '…') : []
    assert.equal(shaped.considered, lines.length,
      `considered ${shaped.considered} != ${lines.length} lines actually in the prompt`)
    assert.equal(r.considered, r.slice.length, 'the selector must count what it supplies')
    // ⭐ THE WHOLE POINT: on the shipping path these are the same number and nothing was elided.
    assert.equal(shaped.elided, false)
    assert.equal(shaped.considered, r.slice.length)
  }
})

test('context messages are counted and budgeted, but never move the watermark', () => {
  const msgs = build(60, 500)
  const already = 30                       // reviewed through rolling_id 30
  const r = selectReviewableRange(msgs, { already, maxChars: MAX, contextBefore: 6 })

  assert.equal(r.contextCount, 6, 'six framing messages')
  assert.ok(r.slice.slice(0, 6).every((m) => m.rolling_id <= already), 'context must sit below the watermark')
  assert.equal(r.considered, r.contextCount + r.newCount, 'considered covers context AND new')
  assert.equal(r.slice.length, r.considered)
  // ⭐ reviewedTo comes from the NEW messages only — re-showing old context is not re-reviewing it.
  assert.ok(r.reviewedTo > already)
})

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · THE EMPTY / NOTHING-NEW CASES
// ════════════════════════════════════════════════════════════════════════════════════════════════
test('nothing new yields no range and no watermark', () => {
  const msgs = build(10, 100)
  const r = selectReviewableRange(msgs, { already: 10, maxChars: MAX })
  assert.equal(r.newCount, 0)
  assert.equal(r.reviewedTo, null, 'a run with nothing new must not produce a watermark')
  assert.equal(r.slice.length, 0)
  assert.equal(selectReviewableRange([], { already: 0 }).reviewedTo, null)
})
