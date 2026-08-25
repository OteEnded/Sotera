// ⭐⭐⭐ THE REVISIT LIFECYCLE · store evidence, derive the world, let only an ACT end it.
//
// Ote's requirement, and §1 is nothing but this sentence made mechanical: *"a failed revisit must leave a
// record. «Never tried» and «tried but failed» must never collapse into the same database state."*
//
// ⚠️ These are the SECOND use of a shape, not a second copy of it — `app/advice/lifecycle.js` was rebuilt
// around it after one exchange's counterpart changed world three times while a flat `pending` never moved.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import {
  deriveRevisitState, stalledAttempts, attemptState, REVISIT, OUTCOME, revisitSummaryLine, admitToQueue,
} from '../../Backend/app/components/revisit-lifecycle.js'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const MIGRATION = read('../../Backend/database/migrations/025_revisit_lifecycle.sql')
const RENAME = read('../../Backend/database/migrations/026_revisit_naming.sql')
const HOST = read('../../Backend/app/components/reflection-lifecycle-host.js')
// ⛔ Comments stripped, string literals KEPT — the SQL this file asserts about lives in literals. The
// polarity follows where the truth lives; stripping literals here would make every scan vacuous.
const hostCode = HOST.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '')

const row = (o) => ({ requested_at: '2026-08-25T01:00:00Z', up_to_rolling_id: 100, ...o })

// ══ 1 · ⭐⭐⭐ THE HEADLINE · NEVER TRIED ≠ TRIED AND FAILED ═════════════════════════════════════════
test('⭐⭐⭐ never_attempted and failed are different states, not one silence', () => {
  const never = deriveRevisitState({ attempts: [], topRollingId: 100 })
  const broke = deriveRevisitState({ attempts: [row({ outcome: 'failed', failure: 'boom' })], topRollingId: 100 })
  assert.equal(never.state, REVISIT.neverAttempted)
  assert.equal(broke.state, REVISIT.failed)
  assert.notEqual(never.state, broke.state)
  // ⭐ AND THE DIFFERENCE NEEDS NO VOCABULARY AT THE STORAGE LAYER: it is row-exists-vs-no-row, the
  // property migration 016 was built on and this generalisation had to preserve.
  assert.equal(never.attempts, 0)
  assert.equal(broke.attempts, 1)
})

test('⭐⭐ every state Ote named is reachable and distinct', () => {
  const seen = new Set([
    deriveRevisitState({ attempts: [], topRollingId: 1 }).state,
    attemptState(row({ outcome: null, started_at: null })),
    attemptState(row({ outcome: null, started_at: '2026-08-25T01:01:00Z' })),
    attemptState(row({ outcome: 'completed' })),
    attemptState(row({ outcome: 'failed', failure: 'x' })),
    attemptState(row({ outcome: 'blocked' })),
  ])
  assert.deepEqual([...seen].sort(), ['blocked', 'completed', 'failed', 'never_attempted', 'requested', 'started'])
})

// ══ 2 · ⭐⭐⭐ THE CURSOR ADVANCES ON COMPLETION, NEVER ON ATTEMPT ══════════════════════════════════
test('⭐⭐⭐ a failed attempt does not move the cursor — the trap that would have stalled the lane', () => {
  // ⚠️⚠️ THE PERMANENT SILENT FAILURE THIS PREVENTS: `lastWatermark()` read `max(up_to_rolling_id)` over
  // ALL rows. The moment failures started being recorded, one failed attempt at 145 would set the cursor
  // to 145 and the conversation would never be revisited again. ⇒ the fix that makes failure VISIBLE
  // would have stalled the whole lane, one conversation at a time, invisibly.
  const d = deriveRevisitState({
    attempts: [
      row({ outcome: 'completed', up_to_rolling_id: 120, requested_at: '2026-08-25T01:00:00Z' }),
      row({ outcome: 'failed', failure: 'gateway died', up_to_rolling_id: 145, requested_at: '2026-08-25T02:00:00Z' }),
    ],
    topRollingId: 145,
  })
  assert.equal(d.cursor, 120, 'the cursor is the last COMPLETED watermark')
  assert.equal(d.reviewFrom, 121, 'and the next review resumes just past it')
  assert.equal(d.hasUnreviewed, true)
  assert.equal(d.needsRevisit, true, '⛔ a failure must not remove the conversation from the queue')
})

test('⭐ the host reads the cursor the same way the derivation does', () => {
  // ⛔ TWO COPIES OF THIS RULE IS HOW THEY STOP AGREEING — and here disagreement is invisible: the pass
  // simply goes quiet for the conversations it has failed on.
  const wm = hostCode.slice(hostCode.indexOf('async function lastWatermark'))
  assert.match(wm.slice(0, 400), /outcome = 'completed'/,
    'lastWatermark must count only completed revisits')
})

test('⭐ never reviewed at all ⇒ the range starts at the beginning, not at 1', () => {
  const d = deriveRevisitState({ attempts: [], topRollingId: 40 })
  assert.equal(d.cursor, null)
  assert.equal(d.reviewFrom, null, 'null means "from its beginning" — ⛔ not a fabricated lower bound')
  assert.equal(d.hasUnreviewed, true)
})

test('⭐ consecutive failures are counted backwards, so a recovered conversation is not "failing"', () => {
  const d = deriveRevisitState({
    attempts: [
      row({ outcome: 'failed', failure: 'a', requested_at: '2026-08-25T01:00:00Z' }),
      row({ outcome: 'failed', failure: 'b', requested_at: '2026-08-25T02:00:00Z' }),
      row({ outcome: 'completed', up_to_rolling_id: 100, requested_at: '2026-08-25T03:00:00Z' }),
    ],
    topRollingId: 100,
  })
  assert.equal(d.consecutiveFailures, 0, 'it recovered — an all-time count would call it broken forever')
  assert.equal(d.state, REVISIT.completed)
})

// ══ 3 · ⛔⛔ SILENCE IS NEVER A CONCLUSION ═════════════════════════════════════════════════════════
test('⛔⛔ an open attempt stays open — at a minute and at a year alike', () => {
  // ⭐ The same assertion the advice lifecycle carries, for the same reason: deriving "it must have died
  // by now" invents an event nobody observed, which is exactly how `pending` came to mean four worlds.
  const open = row({ outcome: null, started_at: '2026-08-25T01:00:00Z' })
  for (const _ of ['1 min', '1 hour', '1 day', '1 year']) {
    assert.equal(attemptState(open), REVISIT.started)
  }
  // ⛔ and the derivation refuses to queue a new one while it is open — agreeing with 025's in-flight
  // unique index rather than discovering it by failing an insert.
  const d = deriveRevisitState({ attempts: [open], topRollingId: 500 })
  assert.equal(d.hasUnreviewed, true)
  assert.equal(d.needsRevisit, false, 'unreviewed material, but an attempt is already open')
  assert.ok(d.inFlight, 'and the open attempt is surfaced rather than hidden')
})

test('⭐⭐ ending a stalled attempt is an ACT, and this only SELECTS candidates', () => {
  const now = Date.parse('2026-08-25T10:00:00Z')
  const fresh = row({ outcome: null, requested_at: '2026-08-25T09:59:00Z' })
  // ⭐ BOTH IN-FLIGHT SHAPES ARE SWEEPABLE, and they are genuinely different failures: `requested` means
  // a slot was opened and the turn never began; `started` means the turn began and we never heard again.
  const staleRequested = row({ outcome: null, requested_at: '2026-08-25T06:00:00Z' })
  const staleStarted = row({ outcome: null, requested_at: '2026-08-25T05:00:00Z', started_at: '2026-08-25T05:00:01Z' })
  const done = row({ outcome: 'completed', requested_at: '2026-08-25T01:00:00Z' })
  const picked = stalledAttempts([fresh, staleRequested, staleStarted, done], { now, staleAfterMs: 36e5 })
  assert.equal(picked.length, 2)
  assert.ok(picked.includes(staleRequested) && picked.includes(staleStarted))
  assert.ok(!picked.includes(fresh) && !picked.includes(done))
  // ⛔ THE DERIVATION IS UNCHANGED BY AGE — only a written act may end an attempt.
  assert.equal(attemptState(staleRequested), REVISIT.requested)
  assert.equal(attemptState(staleStarted), REVISIT.started)
  // ⛔ and with no clock it selects nothing rather than guessing one
  assert.equal(stalledAttempts([staleRequested], { staleAfterMs: 36e5 }).length, 0)
})

// ══ 4 · ⭐⭐ THE FAILURE IS ACTUALLY WRITTEN, NOT ONLY LOGGED ══════════════════════════════════════
test('⭐⭐⭐ the scan loop RECORDS a failure instead of only tallying it', () => {
  // ⚠️ THE HOLE THIS CLOSES: a throw was caught, written to a log FILE and counted as `skipped.error`.
  // No row. So a conversation that fails every time was indistinguishable from one never attempted.
  const i = hostCode.indexOf('tally.skipped.error')
  assert.ok(i > 0, 'the catch must still exist')
  const around = hostCode.slice(Math.max(0, i - 1200), i)
  assert.match(around, /recordFailure\(/, '⛔ the catch must write a row, not just a log line')
  // ⚠️ ASSERTS THE INVARIANT, NOT THE LITERAL — and the first version pinned the literal `'failed'` in the
  // SQL, so it went red the moment preemption parameterised that column (027). The behaviour was correct
  // and unchanged; the test was describing one spelling of it. ⭐ What must hold is that a claimed row is
  // CLOSED with a terminal outcome and a completion time, however that value is supplied.
  const closeClaim = hostCode.slice(hostCode.indexOf('if (claimId)'))
  assert.match(closeClaim.slice(0, 400), /SET outcome = \$?\w+, failure = \$?\w+, completed_at = now\(\)/,
    'a claimed row that broke is CLOSED — outcome and completion time, never left in flight')
  assert.match(closeClaim.slice(0, 400), /WHERE id = \$1::uuid AND outcome IS NULL/,
    '…and only while it is still open, so a terminal row is never rewritten')
  assert.match(hostCode, /const terminal = preempted \? 'preempted' : 'failed'/,
    'and the terminal value is chosen once, from one place')
})

test('⛔ recording a failure can never take the pass down', () => {
  const fn = hostCode.slice(hostCode.indexOf('async function recordFailure'))
  const body = fn.slice(0, fn.indexOf('\n}\n'))
  assert.match(body, /try \{/)
  assert.match(body, /catch/, 'a failure while recording a failure degrades to a log line')
})

// ══ 5 · ⛔ THE MIGRATION PROVES ITS OWN GUARDS ════════════════════════════════════════════════════
test('⛔ migration 025 breaks each rule and requires the break to fail', () => {
  for (const guard of [
    'a FAILED revisit with no `failure` was accepted',
    'a terminated attempt with no completed_at was accepted',
    'an outcome describing HER DECISION was accepted',
    'a retry after failure could not be recorded',
    'a second COMPLETED revisit was accepted for one stretch',
    'two concurrent claims were accepted for one stretch',
    'a revisit range running backwards was accepted',
  ]) assert.ok(MIGRATION.includes(guard), `025 must prove: ${guard}`)
})

test('⭐⭐ the index SPLIT is what makes a retry recordable at all', () => {
  // ⛔ One unique index on (conversation_id, up_to_rolling_id) would refuse the retry, so the first
  // failure would permanently occupy the watermark and "tried but failed" would become "can never be
  // tried again" — the requirement defeated by its own storage.
  // ⚠️⚠️ THESE ASSERT AGAINST MIGRATION 025's HISTORICAL TEXT, SO THEY USE ITS VOCABULARY, NOT TODAY'S.
  // 026 renamed the table to `log_conversation_revisits`, and a blanket rename swept these three lines with
  // it — which broke them, correctly. 016 already wrote the rule down: **a migration is a record of what
  // happened, not a description of now.** ⇒ ⛔ a test about a past migration must speak that migration's
  // names; rewriting them would make the test assert about a file that never existed.
  assert.match(MIGRATION, /DROP INDEX IF EXISTS log_reflections_one_per_stretch_idx/)
  assert.match(MIGRATION, /log_reflections_one_inflight_per_stretch_idx[\s\S]{0,120}WHERE outcome IS NULL/)
  assert.match(MIGRATION, /log_reflections_one_completed_per_stretch_idx[\s\S]{0,120}WHERE outcome = 'completed'/)
  // ⭐ …and 026 is what carried those indexes to the current names, asserted against ITS text.
  assert.match(RENAME, /log_reflections_one_inflight_per_stretch_idx\s+RENAME TO log_conversation_revisits_one_inflight_idx/)
  assert.match(RENAME, /log_reflections_one_completed_per_stretch_idx RENAME TO log_conversation_revisits_one_completed_idx/)
  // ⭐ and the claim names the partial index it means, or postgres cannot infer which one
  assert.match(hostCode, /ON CONFLICT \(conversation_id, up_to_rolling_id\) WHERE outcome IS NULL DO NOTHING/)
})

test('⛔⛔ `outcome` is about the ATTEMPT — 016\'s refusal to enumerate HER decisions still stands', () => {
  // 016, ratified: *"I agree with no outcome enum."* Its reason was that a closed vocabulary steers what
  // we can SEE her having said. That refusal is about her DECISION; this column is about the machinery.
  // ⚠️⚠️ ASSERTED AGAINST THE CHECK CONSTRAINT, NOT AGAINST THE FILE — and the first version had it
  // exactly backwards. It scanned for the ABSENCE of `'nothing_to_remember'`, which failed, because the
  // migration's proof block DELIBERATELY tries to insert that value in order to demonstrate it is
  // refused. ⇒ ⭐ **a guard that proves a value is forbidden must name the value**, so "the word is
  // absent" and "the value is rejected" are opposite readings of the same evidence.
  const allowed = MIGRATION.match(/outcome IN \(([^)]*)\)/)
  assert.ok(allowed, 'the allowed set must be a CHECK constraint, not a convention')
  const values = allowed[1].split(',').map((s) => s.trim().replace(/'/g, '')).sort()
  assert.deepEqual(values, ['blocked', 'completed', 'failed'])
  for (const herDecision of ['nothing_to_remember', 'memory_candidates_found', 'not_now', 'undetermined']) {
    assert.ok(!values.includes(herDecision),
      `⛔ "${herDecision}" describes what she concluded and must never be a legal outcome`)
  }
  // ⭐ …and the proof block DOES exercise one of them, which is how we know the constraint bites.
  assert.match(MIGRATION, /'nothing_to_remember'[\s\S]{0,400}an outcome describing HER DECISION was accepted/)
})

test('⛔ no status column was added to the conversation — a stored status becomes a lie by ageing', () => {
  assert.ok(!/ALTER TABLE txn_conversations/i.test(MIGRATION))
  assert.ok(!/last_revisit_at/i.test(MIGRATION.replace(/--[^\n]*/g, '')),
    '⛔ Ote: use the revisit record as the authoritative event and DERIVE the rest')
})

// ══ 6 · ⭐ THE SUMMARY LINE IS OPERATOR-FACING, NOT HERS ══════════════════════════════════════════
test('⭐ the summary names the world without inventing one', () => {
  const line = revisitSummaryLine(deriveRevisitState({
    attempts: [row({ outcome: 'failed', failure: 'x' })], topRollingId: 200,
  }))
  assert.match(line, /state=failed/)
  assert.match(line, /consecutive failure/)
  assert.equal(revisitSummaryLine(null), 'no derivation')
})

// ══ 7 · ⭐⭐ THE RENAME LEFT NO SECOND NAME (026) ══════════════════════════════════════════════════
test('⭐⭐ no LIVE code still says `log_reflections` or `reflected_at`', () => {
  // ⛔ `schema-naming-canon` is ONE NAME PER TABLE. A rename that leaves the old name working anywhere is
  // two names for one thing, and a codebase ends up with half its queries on each.
  // ⭐ MIGRATIONS ARE EXEMPT AND THAT IS NOT A LOOPHOLE: 016/017/025 are records of what happened, and
  // rewriting them would make them describe a past that did not occur. Only LIVE code is scanned.
  const roots = ['../../Backend/app', '../../test']
  // ⭐ ONE NAMED EXEMPTION, AND IT IS THIS FILE. The historical assertions above must quote migration
  // 025's and 026's own text, so the old name appears here inside regex literals — which comment-stripping
  // correctly does not remove. ⛔ Exempting by FILE rather than by pattern, so the exemption cannot
  // quietly cover a real reference somewhere else.
  const EXEMPT = ['../../test/unit/revisit-lifecycle.test.mjs']
  const offenders = []
  const exemptHit = []
  const walk = (dir) => {
    for (const e of readdirSync(new URL(`${dir}/`, import.meta.url), { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const child = `${dir}/${e.name}`
      if (e.isDirectory()) { walk(child); continue }
      if (!/\.(js|mjs)$/.test(e.name)) continue
      const src = readFileSync(new URL(child, import.meta.url), 'utf8')
      // ⛔ Strip comments: this very file explains the rename in prose, and so do several others.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      // ⓘ …but a migration NAME inside a string is legitimate (a test reads 025 by filename), so the
      // exemption is by what the reference IS, not by which file it sits in.
      const stripped = code.replace(/0(16|17|25)_[a-z_]+\.sql/g, '')
      if (!/log_reflections|\breflected_at\b/.test(stripped)) continue
      if (EXEMPT.includes(child)) { exemptHit.push(child); continue }
      offenders.push(child)
    }
  }
  roots.forEach(walk)
  assert.deepEqual(offenders, [], `still on the old name: ${offenders.join(', ')}`)
  // ⛔ AND THE EXEMPTION MUST STILL BE EARNING ITS PLACE. A stale exemption is a note whose subject
  // is gone — that assertion caught a speculative exemption of mine earlier today, on its first run.
  assert.deepEqual(exemptHit, EXEMPT, 'an exemption no longer describes a real reference')
})

test('⛔ …while the migrations KEEP their history', () => {
  // ⭐ The counter-assertion, so the scan above can never be "satisfied" by rewriting the past.
  assert.match(MIGRATION, /log_reflections/, '025 must still describe the table by the name it had')
  assert.match(RENAME, /ALTER TABLE log_reflections RENAME TO log_conversation_revisits/)
  assert.match(RENAME, /RENAME COLUMN reflected_at TO requested_at/)
  // ⛔ and 026 proves its own rename rather than asserting it
  for (const guard of [
    'log_reflections still exists — the rename left two names',
    'dependent object(s) still carry the old prefix',
    'the table is empty after the rename — data did not survive',
  ]) assert.ok(RENAME.includes(guard), `026 must prove: ${guard}`)
})

// ══ 8 · ⭐⭐⭐ THE PASSIVE WORKER · a revisit reviews what it has NOT reviewed ═════════════════════
//
// Ote: *"I have already reviewed through message 120. Review 121–145."*
// ⚠️⚠️ Until this existed the cursor was RECORDED AND NOT USED — `from_rolling_id` went into the ledger
// while the turn still received every message in the conversation. The incremental model was true of the
// audit trail and false of the actual work. ⭐ A cursor nothing reads is a comment.
test('⭐⭐⭐ the revisit resumes at the cursor, not at the beginning', async () => {
  const { unreviewedSlice } = await import('../../Backend/app/components/reflection-lifecycle.js')
  const msgs = Array.from({ length: 45 }, (_, i) => ({ rolling_id: 101 + i, role: 'user', content: 'm' }))
  const s = unreviewedSlice(msgs, { already: 120 })
  assert.equal(s.from, 121, 'the first NEW message is 121')
  assert.equal(s.newCount, 25)
  assert.ok(s.slice.length < msgs.length, '⛔ she is not handed the whole conversation again')
  assert.equal(s.slice[s.slice.length - 1].rolling_id, 145, 'and the range runs to the top')
})

test('⭐ a few turns of context precede the range, bounded', async () => {
  const { unreviewedSlice } = await import('../../Backend/app/components/reflection-lifecycle.js')
  const msgs = Array.from({ length: 45 }, (_, i) => ({ rolling_id: 101 + i, role: 'user', content: 'm' }))
  const s = unreviewedSlice(msgs, { already: 120, contextBefore: 6 })
  assert.equal(s.contextCount, 6)
  assert.equal(s.slice[0].rolling_id, 115, 'context starts six before the first new message')
  // ⛔ NOT THE WHOLE PRIOR CONVERSATION — that would make the slice decorative.
  assert.equal(unreviewedSlice(msgs, { already: 120, contextBefore: 0 }).slice[0].rolling_id, 121)
})

test('⭐ never reviewed ⇒ the whole conversation, with no special case', async () => {
  const { unreviewedSlice } = await import('../../Backend/app/components/reflection-lifecycle.js')
  const msgs = Array.from({ length: 10 }, (_, i) => ({ rolling_id: i + 1, role: 'user', content: 'm' }))
  const s = unreviewedSlice(msgs, { already: 0 })
  assert.equal(s.slice.length, 10)
  assert.equal(s.from, null, 'no lower bound is invented for a conversation that has none')
})

test('⛔ nothing new ⇒ EMPTY, never "everything just in case"', async () => {
  const { unreviewedSlice } = await import('../../Backend/app/components/reflection-lifecycle.js')
  const msgs = Array.from({ length: 10 }, (_, i) => ({ rolling_id: i + 1, role: 'user', content: 'm' }))
  const s = unreviewedSlice(msgs, { already: 999 })
  assert.equal(s.slice.length, 0)
  assert.equal(s.newCount, 0)
  // ⭐ The eligibility gate refuses this upstream; returning everything here would silently undo the bound.
})

test('⭐⭐ the host builds the transcript from the SLICE, not from every message', () => {
  assert.match(hostCode, /unreviewedSlice\(msgs, \{ already \}\)/)
  assert.match(hostCode, /shapeReflectionTranscript\(slice\)/,
    '⛔ shapeReflectionTranscript(msgs) would re-read the whole conversation every tick')
})

test('⭐⭐⭐ she can reach the SOURCE from inside a revisit', async () => {
  // Ote's arrow: revisit lifecycle → retrieve_conversations → Sotera examines source material → decides.
  const { REFLECTION_TOOLS, REFLECTION_WRITE_TOOLS } = await import('../../Backend/app/components/reflection-lifecycle.js')
  assert.ok(REFLECTION_TOOLS.includes('retrieve_conversations'))
  // ⛔ AND IT IS A READ. Retrieval is source material; it must never be on the write side.
  assert.ok(!REFLECTION_WRITE_TOOLS.includes('retrieve_conversations'),
    'retrieval is not retention — what it returns comes back not-retained')
  // ⛔ the destructive tools are still withheld from a background turn
  for (const w of ['forget_memory', 'restore_memory', 'pin_memory', 'remember_fact']) {
    assert.ok(!REFLECTION_TOOLS.includes(w), `${w} must stay out of a passive revisit`)
  }
})

// ══ 9 · ⭐⭐ THE STALE SWEEP · an ACT that closes what a dead process left open ════════════════════
test('⭐⭐ the sweep is wired, and it is an act rather than a derivation', () => {
  // ⚠️⚠️ THE HOLE THIS CLOSES IS ONE 025 CREATED. Its in-flight partial unique index allows one open
  // attempt per stretch — which is what stops two ticks both spending a 35B generation. But a process
  // that dies mid-turn leaves that row `outcome IS NULL` forever, permanently occupying its watermark.
  // ⭐ Measured on this lane: a probe left exactly two such rows behind earlier the same day.
  assert.match(hostCode, /async function sweepStalled/)
  assert.match(hostCode, /stalledAttempts\(open, \{ now: Date\.now\(\), staleAfterMs \}\)/,
    'the pure selector chooses; the host performs the act')
  assert.match(hostCode, /const swept = await sweepStalled/, 'and the tick calls it')
  // ⛔ CLOSED AS FAILED WITH A DIAGNOSIS — never `completed` (nothing was reviewed, so the cursor must not
  // move) and never `preempted` (nobody yielded to anyone).
  assert.match(hostCode, /swept after \$\{Math\.round\(staleAfterMs \/ 60_000\)\} minutes open/)
  assert.ok(!/sweepStalled[\s\S]{0,900}preempted: true/.test(hostCode),
    '⛔ a sweep is not a preemption')
})

test('⭐ the allowance comes from the work’s own cadence, not a flat constant', () => {
  // ⭐ Borrowed from Hermes's `sweep_stale_inflight`: `max(2 × cadence, floor)` — *"so a slow-but-healthy
  // long-interval job is never clipped by the sweep."* A constant would either kill slow-but-fine
  // revisits or let dead ones sit.
  assert.match(hostCode, /Math\.max\(2 \* quietMinutes \* 60_000, floorMs\)/)
})

test('⛔⛔ derivation is STILL blind to age — the sweep did not smuggle a clock into it', () => {
  // ⭐ The two must not converge: `attemptState` inventing an ending from silence is exactly the defect
  // `pending` had. A sweep is something that HAPPENED, at a known time, and is written down.
  const open = row({ outcome: null, started_at: '2020-01-01T00:00:00Z', requested_at: '2020-01-01T00:00:00Z' })
  assert.equal(attemptState(open), REVISIT.started, 'six years open is still open until an act says otherwise')
  const pure = readFileSync(new URL('../../Backend/app/components/revisit-lifecycle.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  assert.ok(!/Date\.now\(\)/.test(pure), '⛔ the pure module has no clock of its own')
})

// ══ 6 · ⭐⭐⭐ THE TWO-LANE BUDGET · "correct as the backlog grows" ══════════════════════════════════
//
// ⓘ Ote, applying the pilot: *"Keep the bounded/oldest-first behavior anyway; don't special-case the fact
// that there are currently only 3 eligible never-completed conversations. We want the worker semantics to
// remain correct as the backlog grows."* ⇒ every test below is written at a backlog size where the bug
// would be VISIBLE, because at a backlog of three both designs behave identically.

const admit = (o) => admitToQueue({ maxConvos: 3, backlogBudget: 2, ...o })

test('⭐⭐⭐ a backlog of 300 cannot starve the live lane', () => {
  // The failure mode: one shared counter + backlog-first ordering ⇒ the tick's whole budget goes to
  // history every tick, forever, and the lane that only had to keep up never runs again.
  let backlogDone = 0
  for (let i = 0; i < 300; i++) {
    if (admit({ fromBacklog: true, backlogDone, liveDone: 0 }) === 'run') backlogDone++
  }
  assert.equal(backlogDone, 2, 'the backlog spends its own budget and nothing more')
  assert.equal(admit({ fromBacklog: false, backlogDone, liveDone: 0 }), 'run',
    '⛔ the live lane is still open after the backlog has spent out')
})

test('⭐⭐ and a busy day cannot starve the backlog', () => {
  // The original starvation, in the other direction — the one that cost this file eight hours.
  assert.equal(admit({ fromBacklog: true, liveDone: 99, backlogDone: 0 }), 'run')
})

test('⛔ skip and stop are different answers, and the direction is not arbitrary', () => {
  // The queue is backlog-then-live. An over-budget BACKLOG row must let the scan walk past it, because
  // the live lane is physically behind it; an over-budget LIVE row means everything after it is live too.
  assert.equal(admit({ fromBacklog: true, backlogDone: 2 }), 'skip', 'the live lane is still behind this')
  assert.equal(admit({ fromBacklog: false, liveDone: 3 }), 'stop', 'nothing behind this can run')
})

test('⭐ a budget of zero disables its lane and only its lane', () => {
  assert.equal(admitToQueue({ fromBacklog: true, backlogBudget: 0, maxConvos: 3 }), 'skip')
  assert.equal(admitToQueue({ fromBacklog: false, backlogBudget: 0, maxConvos: 3, liveDone: 0 }), 'run')
})

test('⚠️ the host counts slots where the WORK happened, not where it was offered', () => {
  // A backlog row the eligibility gate skipped spent no generation. If it spent a slot anyway, a run of
  // thin old conversations would eat the budget every tick and the real backlog behind them would never
  // be reached — the same "cap bounds the search, not the work" shape, one layer down.
  assert.match(hostCode, /if \(r\.skipped\)[\s\S]{0,200}if \(fromBacklog\) \{ backlogDone\+\+/,
    '⛔ the counter must be incremented after the skip check, never before it')
})

test('⭐⭐ the backlog SEARCH is unbounded — no LIMIT above the filter', () => {
  // This file's own lesson: `ORDER BY updated_at ASC LIMIT 2` returns the same two rows every tick, so two
  // permanently-skipped conversations would hide the entire backlog behind them forever.
  const q = hostCode.match(/log_conversation_revisits" r[\s\S]{0,400}?ORDER BY c\.updated_at ASC[^`]*/)
  assert.ok(q, 'the backlog query is still here (⛔ this assertion is not allowed to go vacuous)')
  assert.ok(!/LIMIT/i.test(q[0]), '⛔ a LIMIT above the filter rebuilds the starvation bug')
})

test('⛔ archived conversations are ineligible in BOTH lanes', () => {
  // Ote: *"Exclude archived conversations for now."* Two lanes ⇒ two independent places to forget it.
  assert.match(hostCode, /where: \{ incognito: false, archived_at: null,/, 'the ordinary lane')
  assert.match(hostCode, /c\.archived_at IS NULL/, 'the backlog lane')
})
