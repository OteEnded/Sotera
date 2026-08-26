// ⭐⭐ THE COMMIT GUARD — does it actually refuse, and does it refuse for the RIGHT reason?
//
//   node test/checks/host-commit-check.mjs
//
// ── ⛔ WHY THIS CHECK EXISTS AT ALL ──────────────────────────────────────────────────────────────
// The reflection idle gate spent **28 hours** silently holding a live lane back, and the test that
// should have caught it passed the whole time — it asserted the LITERAL LINE `fastify.decorate(...)`,
// which really was present, on a child scope no sibling could read. ⭐ It asserted the LINE, not the
// PROPERTY.
//
// ⇒ so this asserts the PROPERTY: given a reading, what does the guard DECIDE? Every refusal branch is
// exercised, including the two that a healthy box cannot produce on demand. ⛔ A guard whose refusal
// paths have never executed is a guard nobody has tested.
//
// ⛔ READ-ONLY. It starts no generation, loads no model and touches no database.

import { makeChecker } from '../harness.mjs'
import { readFileSync } from 'node:fs'
import { preflightCommit, readCommit, describeCommit, startCommitProbe, GB } from '../lib/host-commit.mjs'

const { check, done } = makeChecker('host-commit')
const ok = (c, l, d = '') => check(l, c, d)

// A reading is a plain object, so the branches can be driven exactly.
const reading = (usedGB, limitGB) => ({
  committed: usedGB * GB,
  limit: limitGB * GB,
  pct: (100 * usedGB) / limitGB,
  headroomGB: limitGB - usedGB,
})

// ── 1 · THE HAPPY PATH IS NOT THE POINT, BUT IT MUST STILL WORK ──────────────────────────────────
const clear = preflightCommit({ requiredHeadroomGB: 10, reading: reading(30, 70) })
ok(clear.ok === true, '1 · a box with 40 GB headroom and a 10 GB requirement PASSES')
ok(clear.reason === 'clear', '1 · and it says so', `reason=${clear.reason}`)

// ── 2 · ⛔ COMMIT PRESSURE — the branch that maps to the 18:21 outage ────────────────────────────
// The real reading that night: 79.5 of 79.7 GB. ⭐ Note it still had 0.2 GB of headroom, so a guard
// written ONLY as "headroom > required" with a small requirement would have let the run start.
// ⇒ the percentage ceiling is a SEPARATE question from the absolute headroom, and both must refuse.
const outage = reading(79.5, 79.7)
const pressed = preflightCommit({ requiredHeadroomGB: 0.1, maxPct: 85, reading: outage })
ok(pressed.ok === false, '2 · ⛔ 100%-committed box REFUSES even when the absolute requirement is tiny')
ok(pressed.reason === 'commit-pressure', '2 · and names PRESSURE, not headroom', `reason=${pressed.reason}`)
ok(/%/.test(pressed.detail) && /85/.test(pressed.detail),
  '2 · ⭐ the refusal quotes the measured number AND the ceiling it broke', pressed.detail)

// ── 3 · ⛔ INSUFFICIENT HEADROOM — a comfortable percentage can still be too little room ──────────
// 60% of a 70 GB limit leaves 28 GB — fine as a ratio, ⛔ not enough to load a 35B that commits ~29 GB.
const roomy = preflightCommit({ requiredHeadroomGB: 30, maxPct: 85, reading: reading(42, 70) })
ok(roomy.ok === false, '3 · ⛔ 60% committed REFUSES when the run needs more GB than remain')
ok(roomy.reason === 'insufficient-headroom', '3 · and names HEADROOM, not pressure', `reason=${roomy.reason}`)

// ── 4 · ⛔⛔ UNREADABLE IS A REFUSAL, NOT A PASS ─────────────────────────────────────────────────
// ⭐ This is the whole meaning of "fails closed". The idle gate got this RIGHT and still misled us,
// because it reported the wrong CAUSE — so the reason code here must be its own value.
const blind = preflightCommit({ requiredHeadroomGB: 10, reading: null })
ok(blind.ok === false, '4 · ⛔⛔ an UNREADABLE environment REFUSES — never "assume healthy"')
ok(blind.reason === 'commit-unreadable', '4 · and it is its OWN reason code', `reason=${blind.reason}`)

// ── 5 · ⛔ AND NOT KNOWING WHAT YOU NEED IS ALSO A REFUSAL ───────────────────────────────────────
// ⚠️ Labelled with String(), ⛔ not JSON.stringify(): the latter renders NaN as `null`, so two
// genuinely different cases printed as the same line. A label that cannot tell its own cases apart is
// the same defect this project keeps finding — one name answering two questions.
for (const bad of [undefined, null, NaN, 0, -5, 'lots']) {
  const r = preflightCommit({ requiredHeadroomGB: bad, reading: reading(10, 70) })
  ok(r.ok === false && r.reason === 'requirement-unknown',
    `5 · ⛔ requirement ${String(bad)} REFUSES as requirement-unknown`, `reason=${r.reason}`)
}

// ── 5b · ⛔⛔ PROJECTED PRESSURE — the hole the first version shipped with ───────────────────────
// ⭐ THESE ARE THE REAL NUMBERS FROM THE FIRST `--dry` ON THIS BOX: 39.3 of 71.7 GB committed (54.7%),
// 32.5 GB headroom, a 30.3 GB requirement — and the model it was clearing to load is 22.3 GB, which
// lands at 85.8%, ABOVE the 85% ceiling the same guard refuses to start at.
// ⛔ A guard that permits a run into the state it forbids is not a guard. It is the project's usual
// defect wearing a new hat: ONE threshold answering TWO questions — *safe now* and *safe after*.
const projected = preflightCommit({ requiredHeadroomGB: 30.3, expectedLoadGB: 22.3, maxPct: 85, reading: reading(39.3, 71.7) })
ok(projected.ok === false, '5b · ⛔⛔ a comfortable 54.7% REFUSES when the load itself would breach the ceiling')
ok(projected.reason === 'projected-pressure', '5b · and it is its OWN reason', `reason=${projected.reason}`)
ok(Math.round(projected.projectedPct) === 86, '5b · the projection is arithmetic, not a vibe', `${projected.projectedPct?.toFixed(1)}%`)
// ⭐ And the same box PASSES when the weights are already resident — nothing new is loaded.
const warm = preflightCommit({ requiredHeadroomGB: 8, expectedLoadGB: 0, maxPct: 85, reading: reading(39.3, 71.7) })
ok(warm.ok === true, '5b · ⭐ same box, model already resident ⇒ PASSES (a slot costs no weights)')

// ── 6 · ⭐ FIVE DISTINCT REASONS — ⛔ never one label covering two failures ───────────────────────
const reasons = new Set([clear.reason, pressed.reason, roomy.reason, blind.reason, projected.reason])
ok(reasons.size === 5, '6 · ⭐ every outcome has its OWN reason code', [...reasons].join(' · '))

// ── 7 · ⚠️ THE LIMIT IS NOT A CONSTANT, AND THE GUARD MUST NOT ASSUME IT IS ─────────────────────
// ⭐ MEASURED ON THIS BOX TODAY: at 18:41 the limit read **79.7 GB**, and at 18:47 it read **71.7 GB** —
// the system-managed pagefile grew under pressure and contracted afterwards. ⇒ headroom moves for TWO
// reasons, usage falling AND the limit changing, so a cached limit would silently misreport.
const src = readFileSync(new URL('../lib/host-commit.mjs', import.meta.url), 'utf8')
ok(!/const\s+(LIMIT|COMMIT_LIMIT)\s*=\s*\d/.test(src),
  '7 · ⛔ no hard-coded commit limit — it is read every time')
ok(src.includes('cb > cl'), '7 · a reading with committed > limit is rejected as untrustworthy')

// ── 8 · THE LIVE READER, ON WHATEVER BOX THIS IS ────────────────────────────────────────────────
// ⛔ Not asserted to be healthy — that is the experiment's job, not the check's. Asserted only to be
// internally CONSISTENT, or absent.
const live = readCommit()
if (live) {
  ok(live.committed > 0 && live.limit >= live.committed, '8 · live reading is self-consistent', describeCommit(live))
  ok(Math.abs(live.headroomGB - (live.limit - live.committed) / GB) < 0.01,
    '8 · headroom equals limit − committed, ⛔ not a separately-sourced number')
} else {
  ok(process.platform !== 'win32', '8 · no live reading, and that is expected off Windows', process.platform)
}

// ── 9 · ⭐⭐ THE STREAMING PROBE ACTUALLY STREAMS ────────────────────────────────────────────────
// ⛔ THE PART MOST LIKELY TO FAIL SILENTLY. If the probe emits nothing, the experiment still produces a
// full set of latency numbers — every one of them carrying `commitPct: null`. That is a complete-looking
// result with no environment attached, which is precisely the shape this project keeps paying for:
// `harness.readSSE` would have returned zero events and a TTFT of null forever, and looked fine doing it.
// ⇒ so this asserts SAMPLES ARRIVED, ⛔ not merely that the object was constructed.
const probe = startCommitProbe({ intervalSec: 1 })
ok(probe.ok === true, '9 · the probe reports it started')
const t0 = Date.now()
await new Promise((r) => setTimeout(r, 5000))
const t1 = Date.now()
ok(probe.samples.length >= 2, '9 · ⭐ SAMPLES ACTUALLY ARRIVED over 5s', `n=${probe.samples.length}`)
if (probe.samples.length) {
  const s0 = probe.samples[0]
  ok(s0.committed > 0 && s0.limit >= s0.committed && s0.pct > 0 && s0.pct <= 100,
    '9 · a streamed sample is self-consistent', `${s0.pct.toFixed(1)}%`)
  // ⭐ The stream and the one-shot must agree — two sources that merely coexist are not one measurement.
  if (live) {
    ok(Math.abs(s0.pct - live.pct) < 10,
      '9 · ⭐ the stream agrees with the one-shot reader', `stream ${s0.pct.toFixed(1)}% vs one-shot ${live.pct.toFixed(1)}%`)
  }
  ok(probe.peakBetween(t0, t1) !== null, '9 · peakBetween finds the window it was given')
}
// ⛔ null, NOT zero, for a window with no samples — the distinction the whole design rests on.
ok(probe.peakBetween(t1 + 3_600_000, t1 + 3_601_000) === null,
  '9 · ⛔ an empty window returns null — a missing reading is not a low one')
probe.stop()

done()
