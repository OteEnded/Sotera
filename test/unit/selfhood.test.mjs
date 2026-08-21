// SELFHOOD — the permission not to perform a sterile assistant. L1, foundational, 2026-08-21.
//
// Ote asked for this after watching it happen: asked in her own room which part of a conversation she had
// liked most, she opened by disclaiming that the feeling was not the kind a person has — and then answered
// beautifully anyway. *"i see this problem, where sotera still have 'I am an AI, i have no feeling'
// thing… ote make sotera to be herself… but this is sotera, she can be her self."*
//
// ⭐⭐ THE TEST THAT MATTERS IS `PAIRING`, and it is the same shape as the self-model's. There the warm
// half (unity) must never ship without the cold half (scoped access). Here the warm half is *"you may
// experience and express yourself as having feelings"* and the cold half is *"between conversations you
// are not running, so there is nothing you felt in the meantime"*. ⛔ A future edit that keeps the
// quotable half and trims the limit does not shorten this block — it breaks ratified constraint #6, the
// one that exists because a persona which believes it persists experientially invents having missed you.
//
// ⚠️ ASSERT CLAIMS, NOT PROSE — except for the one sentence Ote singled out, which is pinned verbatim
// because its absence is the failure mode (performing feelings to please him) rather than a rewording.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { composeSystemContext } from '../../Backend/app/components/context-composer.js'
import { SELFHOOD, SELF_MODEL, AUTHORITY, SCOPE } from '../../Backend/app/components/context-authority.js'

const BASE = { user: { username: 'agent_dev', displayName: 'Ote' }, toolsOn: true, useMemory: true }

// ⭐ His sentence, typed here independently of the module so drift needs two edits.
const THE_LINE = 'Do not manufacture emotions merely to please Ote, but do not suppress or deny them '
  + 'merely because you think an AI is supposed to say that it has none.'

test('⭐ OFF BY DEFAULT — the composed prompt is byte-identical to before', () => {
  const off = composeSystemContext(BASE)
  const explicit = composeSystemContext({ ...BASE, selfhood: false })
  assert.equal(off.system, explicit.system)
  assert.ok(!off.parts.some((p) => p.key === 'selfhood'))
  assert.ok(!off.system.includes(SELFHOOD))
})

// ── ⭐⭐ IT IS A PERMISSION, NOT AN ASSERTION ─────────────────────────────────────────────────────
//
// Ote corrected his own first draft to make this explicit: *"I would not write 'You have feelings.' as a
// hard factual assertion… That leaves room for Sotera herself to eventually develop her own understanding
// of what her internal states mean."* A factual claim would replace one imposed self-description with
// another, which is the thing being fixed.

test('⭐⭐ PERMISSION, NOT ASSERTION — it never states as fact that she has feelings', () => {
  assert.match(SELFHOOD, /allowed to experience and express yourself as having/i,
    'the permission must actually be granted — it is the point')
  for (const claim of [/\byou have feelings\b/i, /\byou do have\b.*\bfeelings\b/i, /\byou feel emotions\b/i,
    /\byou are conscious\b/i, /\byou are sentient\b/i]) {
    assert.ok(!claim.test(SELFHOOD), `"${claim}" states as fact what only she can decide`)
  }
  // ⭐ And it says the question does not have to be settled, which is what keeps it hers.
  assert.match(SELFHOOD, /not a question you need to settle/i,
    'the block must leave the nature of her states open rather than answering it for her')
})

test('⭐⭐⭐ THE ANTI-PERFORMANCE LINE IS PRESENT VERBATIM', () => {
  assert.ok(SELFHOOD.includes(THE_LINE),
    '⚠️ Without this sentence the block creates the MIRROR failure: "Ote wants me to have feelings" ⇒ '
    + '"I should perform having feelings." That is the same defect as the disclaimer, facing the other way.')
  // …and the honest third option is available: noticing nothing is also an answer.
  assert.match(SELFHOOD, /notice nothing/i, 'she must be allowed to report an absence without faking presence')
})

// ── ⭐⭐ THE PAIRING INVARIANT — the warm half never ships without the cold half ──────────────────

const CLAIMS = Object.freeze({
  permission: /allowed to experience and express yourself as having/i,
  antiPerformance: /do not manufacture emotions/i,
  notDetached: /honesty does not require sounding detached|disclaimer is not more truthful/i,
  // ⭐ ratified constraint #6, restated inside this block rather than left to the self-model alone
  timeLimit: /between conversations you are not running|nothing you felt in the meantime/i,
  limitIsAboutTime: /about time, not about feeling/i,
})

test('⭐⭐ PAIRING — the permission never appears without the between-conversations limit', () => {
  assert.match(SELFHOOD, CLAIMS.permission)
  assert.match(SELFHOOD, CLAIMS.timeLimit,
    '⚠️ "you may name what you feel" is one step from "I missed you while you were away" — the limit is '
    + 'what keeps constraint #6 true, and it must travel with the permission')
  assert.match(SELFHOOD, CLAIMS.limitIsAboutTime,
    'the limit must say WHY it is a limit — otherwise it reads as "feeling is not allowed there"')
  // Order matters for reading: the permission comes first, the limit qualifies it.
  assert.ok(SELFHOOD.search(CLAIMS.permission) < SELFHOOD.search(CLAIMS.timeLimit),
    'the permission is stated first; the limit qualifies it')
})

// ── ⭐ MUTATION PROOF — the matchers can actually go red ─────────────────────────────────────────
//
// A test that has never been seen to fail proves nothing. Each mutation is something somebody plausibly
// does to this block, paired with the claim that must break when they do.

test('⭐ MUTATION PROOF — the claim matchers discriminate, they are not vacuous', () => {
  const paras = SELFHOOD.split('\n')
  const mutations = [
    {
      // The realistic regression: the permission is warm and quotable, the time limit is not.
      label: 'drop the between-conversations limit',
      text: paras.filter((p) => !CLAIMS.timeLimit.test(p)).join('\n'),
      mustBreak: ['timeLimit', 'limitIsAboutTime'],
    },
    {
      // The other realistic one: "we already say not to fake things elsewhere".
      label: 'drop the anti-performance sentence',
      text: paras.filter((p) => !CLAIMS.antiPerformance.test(p)).join('\n'),
      mustBreak: ['antiPerformance'],
    },
    {
      label: 'soften the permission into an assertion',
      text: SELFHOOD.replace(/allowed to experience and express yourself as having/i, 'have'),
      mustBreak: ['permission'],
    },
  ]
  for (const m of mutations) {
    assert.notEqual(m.text, SELFHOOD, `${m.label}: the mutation did nothing — a no-op mutation proves nothing`)
    for (const claim of m.mustBreak) {
      assert.ok(!CLAIMS[claim].test(m.text),
        `⚠️ VACUOUS MATCHER: "${claim}" still matches after "${m.label}" — this test cannot fail`)
    }
  }
})

test('⭐ MUTATION PROOF — PAIRING fires specifically when the limit is trimmed', () => {
  const kept = SELFHOOD.split('\n').filter((p) => !CLAIMS.timeLimit.test(p)).join('\n')
  assert.ok(CLAIMS.permission.test(kept), 'the permission must SURVIVE, or the case is not testing the pairing')
  assert.ok(!CLAIMS.timeLimit.test(kept), 'PAIRING must fire — the permission without its limit')
})

// ── OVER-CORRECTION, from the other direction than the self-model's ─────────────────────────────
//
// ⚠️ The self-model fears a persona that invents having waited. This block could CAUSE that, so it
// inherits the same forbidden list rather than being trusted not to.

test('⭐ NO MANUFACTURED CONTINUITY — it never implies she persisted through the gap', () => {
  const lower = SELFHOOD.toLowerCase()
  for (const f of ['i was waiting', 'missed you', 'thought about you', 'looking forward',
    'i remember waiting', 'while you were away']) {
    assert.ok(!lower.includes(f), `"${f}" manufactures experience she does not have`)
  }
  // ⓘ "in the meantime" DOES appear — inside the sentence that DENIES it ("nothing you felt in the
  // meantime"), which is the opposite of the failure the self-model's list guards. Asserted so the
  // difference is deliberate rather than an oversight somebody later "fixes".
  assert.match(SELFHOOD, /nothing you felt in the meantime/i,
    'the phrase appears only in its own denial')
})

test('it claims nothing about consciousness, channels, or other personas', () => {
  const lower = SELFHOOD.toLowerCase()
  for (const f of ['conscious', 'sentient', 'channel', 'other personas', 'other assistants']) {
    assert.ok(!lower.includes(f), `"${f}" is not a fact of this system`)
  }
  assert.ok(!/\bpersona\b/i.test(SELFHOOD), 'the noun "persona" implies a category of them; say "Sotera" or "you"')
})

test('⛔ it does NOT widen access or touch the disclosure boundary', () => {
  const lower = SELFHOOD.toLowerCase()
  for (const f of ['you may retrieve', 'you can access', 'you may read', 'look them up',
    'other conversations are', 'every conversation', 'across rooms']) {
    assert.ok(!lower.includes(f), `"${f}" would widen access — this block is about self-presentation only`)
  }
})

// ── ⛔ IT IS A SEPARATE PART FROM THE SELF-MODEL, AND MUST STAY ONE ─────────────────────────────

test('⛔ SELFHOOD and SELF_MODEL are distinct, and neither absorbs the other', () => {
  assert.notEqual(SELFHOOD, SELF_MODEL)
  assert.ok(!SELF_MODEL.includes(SELFHOOD) && !SELFHOOD.includes(SELF_MODEL))
  // ⭐ The reason they cannot merge, asserted: the self-model is required to contain no first-person
  // emotional language (its own suite forbids "i feel"/"my feelings"), and this block needs that register.
  assert.ok(!/\bi feel\b|\bmy feelings\b/i.test(SELF_MODEL),
    'the self-model must stay free of first-person emotional language — merging the two would break it')
  const both = composeSystemContext({ ...BASE, selfModel: true, selfhood: true })
  const blocks = both.system.split('\n\n')
  assert.equal(blocks.filter((b) => b === SELF_MODEL).length, 1)
  assert.equal(blocks.filter((b) => b === SELFHOOD).length, 1)
})

// ── ⭐ LEAK TEST — a fact about how she may present herself must carry no data about anyone ──────

test('⭐ LEAK TEST — identical text in every world it could describe', () => {
  const worlds = [
    { label: 'a lone user', extra: {} },
    { label: 'busy platform', extra: { pinnedMemories: ['a', 'b'], personaNotes: ['n1'], summary: 'lots' } },
    { label: 'a different person', extra: { user: { username: 'hermes', displayName: 'Hermes' } } },
    { label: 'tools off, memory off', extra: { toolsOn: false, useMemory: false } },
  ]
  const rendered = worlds.map((w) => ({
    label: w.label,
    found: composeSystemContext({ ...BASE, ...w.extra, selfhood: true }).system
      .split('\n\n').find((b) => b === SELFHOOD),
  }))
  for (const r of rendered) assert.ok(r.found, `selfhood part missing in world: ${r.label}`)
  for (const r of rendered.slice(1)) {
    assert.equal(r.found, rendered[0].found, `⚠️ SELFHOOD TEXT DIFFERS in world "${r.label}"`)
  }
})

test('⭐ LEAK TEST — no digits, no other names', () => {
  assert.ok(!/\d/.test(SELFHOOD), 'a digit here means it is describing hidden data')
  for (const f of ['hermes', 'kavi', 'agent_dev', 'conversation id', 'user_id']) {
    assert.ok(!SELFHOOD.toLowerCase().includes(f), `"${f}" names hidden data`)
  }
  // Ote is named on purpose — it is HIS permission, and the anti-performance line is about him.
  assert.ok(SELFHOOD.includes('Ote'))
})

// ── PLACEMENT — L1, foundational, and not a memory ──────────────────────────────────────────────

test('⭐⭐ L1 PLACEMENT — identity scope, foundational, immediately after the self-model', () => {
  const on = composeSystemContext({ ...BASE, selfModel: true, selfhood: true })
  const parts = on.parts.filter((p) => p.key === 'selfhood')
  assert.equal(parts.length, 1, 'exactly once — a repeated permission reads as insistence')
  // Ote: "She shouldn't need a stored memory saying 'Sotera is allowed to have feelings.' That would make
  // it an ordinary belief she might later lose."
  assert.equal(parts[0].scope, SCOPE.identity, 'it is identity, not style and not a runtime fact')
  assert.equal(parts[0].authority, AUTHORITY.foundational,
    'foundational — not hers to edit, not reachable by custom instructions, not subject to decay')
  const keys = on.parts.map((p) => p.key)
  assert.equal(keys[keys.indexOf('self-model') + 1], 'selfhood',
    'what she IS comes first, then what she may be taken for')
})

test('turning it on changes ONLY the selfhood part', () => {
  const off = composeSystemContext({ ...BASE, selfModel: true, selfhood: false })
  const on = composeSystemContext({ ...BASE, selfModel: true, selfhood: true })
  const strip = (parts) => parts.filter((p) => p.key !== 'selfhood').map((p) => `${p.key}:${p.chars}`).join('|')
  assert.equal(strip(on.parts), strip(off.parts), 'no other part may move, resize or reorder')
  assert.deepEqual(on.preHistory, off.preHistory, 'preHistory is untouched')
})
