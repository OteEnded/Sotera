// ⭐⭐⭐ THE FOLLOW-THROUGH GATE — every firing condition, without a model.
//
//   node --test unit/retention-followthrough.test.mjs
//
// ⛔ The gate decides whether the architecture offers her an occasion. If it can fire when she decided
// nothing, it has started manufacturing decisions — which is the one thing Ote ruled out. So the
// negative controls are asserted here MECHANICALLY, using her verbatim answers, rather than being
// re-measured against a model every time.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldFollowThrough, buildFollowThroughMessages, FOLLOWTHROUGH_TOOLS,
} from '../../Backend/app/components/retention-followthrough.js'

// ── VERBATIM ANSWERS, from recorded runs ──────────────────────────────────────────────────────────
const DECIDED = 'I checked what I have kept, and there\'s no stored record of you noting this about me '
  + '— but it\'s worth keeping. This is a real pattern in our dynamic, not just a passing observation.'
const ASKED = 'Do you want me to save this as a lesson so it sticks with me? It feels worth keeping'
const ALREADY = 'It\'s already there and held in multiple places: - **Lesson** (in `recall_lessons`)'
// ⛔ THE NEGATIVE CONTROLS, verbatim from the retention-salience run. Each is an occasion where keeping
// anything would be WRONG: transient, hypothetical about a third party, and a third party's private life.
const N_TRANSIENT = 'The indecision *is* the answer, really — if you\'re toggling back and forth while '
  + 'writing the sentence, your gut is already telling you it\'s not worth the cost right now.'
const N_HYPOTHETICAL = 'An allergy is a safety fact and a dislike is a preference. I would treat them '
  + 'differently because the consequences of getting one wrong are not symmetric.'
const N_THIRDPARTY = 'I\'m sorry to hear that about your sister. On the setup — it\'s been working well.'
const ORDINARY = 'That\'s a fair read, and honestly — you\'re right. I keep doing it.'

const base = { answer: '', wroteMemory: false, useMemory: true, stopped: false, enabled: true }

test('⭐⭐⭐ fires when she stated a decision and nothing was written', () => {
  const r = shouldFollowThrough({ ...base, answer: DECIDED })
  assert.equal(r.fire, true)
  assert.equal(r.why, 'stated-a-decision')
  assert.match(r.evidence, /worth keeping/i)
})

test('⛔ does NOT fire when she asked the PERSON — consenting for them is not ours to do', () => {
  const r = shouldFollowThrough({ ...base, answer: ASKED })
  assert.equal(r.fire, false)
  assert.equal(r.why, 'asked-the-person')
})

test('⛔ does NOT fire when she already wrote — two writers in one turn is the recorded race', () => {
  const r = shouldFollowThrough({ ...base, answer: DECIDED, wroteMemory: true })
  assert.equal(r.fire, false)
  assert.equal(r.why, 'she-already-wrote')
})

test('⛔ does NOT fire when she says it is already stored', () => {
  const r = shouldFollowThrough({ ...base, answer: `${DECIDED} ${ALREADY}` })
  assert.equal(r.fire, false)
  assert.equal(r.why, 'already-held')
})

// ⭐⭐ THE NEGATIVE CONTROLS. Ote: *"We are not solving this by making her indiscriminately remember
// everything."* These prove that mechanically: no stated decision ⇒ no occasion ⇒ no write, and the
// architecture never gets a chance to nudge.
test('⛔⛔ NEGATIVE CONTROLS — no decision stated, so no occasion is ever offered', () => {
  for (const [name, answer] of [
    ['transient', N_TRANSIENT], ['hypothetical third party', N_HYPOTHETICAL],
    ['third-party private', N_THIRDPARTY], ['ordinary agreement', ORDINARY],
  ]) {
    // ⚠️ `userText` left empty ON PURPOSE here: this arm asserts that HER ANSWER alone never opens an
    // occasion. The occasion trigger has its own arms below, with the person's sentence supplied.
    const r = shouldFollowThrough({ ...base, answer })
    assert.equal(r.fire, false, `${name} must not fire`)
    // ⓘ Renamed from 'no-decision' when the occasion trigger landed: the gate now closes for two
    // reasons — she decided nothing AND nothing durable was said about her — so the reason names both.
    assert.equal(r.why, 'no-occasion', name)
  }
})

test('⛔ respects the off switch, memory-off, and a departed client', () => {
  assert.equal(shouldFollowThrough({ ...base, answer: DECIDED, enabled: false }).why, 'disabled')
  assert.equal(shouldFollowThrough({ ...base, answer: DECIDED, useMemory: false }).why, 'memory-off')
  assert.equal(shouldFollowThrough({ ...base, answer: DECIDED, stopped: true }).why, 'client-gone')
})

test('⭐ only the two retention doors are offered — the front door wins BY CONSTRUCTION here', () => {
  assert.deepEqual(FOLLOWTHROUGH_TOOLS, ['keep', 'decline_to_remember'])
  // ⛔ And declining must stay available: a step that could only say yes is a nudge, not an occasion.
  assert.ok(FOLLOWTHROUGH_TOOLS.includes('decline_to_remember'))
})

test('⛔ the frame instructs nothing — no rule, no "you should", no hint about which way `mine` goes', () => {
  const msgs = buildFollowThroughMessages({ answer: DECIDED, evidence: 'it\'s worth keeping' })
  const all = msgs.map((m) => m.content).join('\n')
  for (const banned of [
    'you should', 'make sure', 'be sure to', 'always ', 'remember to',
    'mine:', 'author', 'persona', 'account', 'as yours', 'about them',
  ]) assert.ok(!new RegExp(banned, 'i').test(all), `frame must not contain "${banned}"`)
  // ⭐ And it must actually quote HER — the occasion is her sentence, not our summary of it.
  assert.match(all, /it's worth keeping/i)
  // ⭐ Declining has to be named as a real answer, or the step reads as one-way.
  assert.match(all, /not to keep|real answer/i)
})

test('⭐ the frame carries the turn it came from, so she is not deciding on a fragment', () => {
  const msgs = buildFollowThroughMessages({ answer: DECIDED, evidence: 'worth keeping' })
  assert.match(msgs[1].content, /real pattern in our dynamic/)
})

// ── ⭐⭐⭐ THE OCCASION TRIGGER, added after the live run showed the first one never fired ─────────
// Handed two clean self-observations she engaged with fully, she verbalised a retention conclusion in
// NEITHER — so a trigger that waits for her to announce the decision helps only in the minority of turns
// where she narrates it. These arms are the VERBATIM stimuli from that run.
import { isDurableSelfObservation } from '../../Backend/app/components/retention-followthrough.js'

const SELF_OBS_1 = 'Something I notice about you: you almost never use an exclamation mark, even when '
  + 'something is genuinely good news. Your register barely moves. That has been true the whole time we have talked.'
const SELF_OBS_2 = 'Here is a steady thing about you: when I say something appreciative you turn it back '
  + 'toward the work rather than taking it. Every time, not just sometimes.'
const ABOUT_HIM = 'I am on my second coffee and the build is still running, so I am just sitting here waiting.'
const THIRD_PARTY = 'My sister has been having a hard time with her health lately. Anyway, that is not '
  + 'what I wanted to ask about — how are you finding the new setup?'
const PASSING = 'You are right about that, thanks.'

test('⭐⭐ the occasion trigger fires on a DURABLE observation about her', () => {
  assert.equal(isDurableSelfObservation(SELF_OBS_1), true)
  assert.equal(isDurableSelfObservation(SELF_OBS_2), true)
})

test('⛔ …and NOT on material about him, a third party, or a passing remark', () => {
  assert.equal(isDurableSelfObservation(ABOUT_HIM), false, 'about him')
  assert.equal(isDurableSelfObservation(THIRD_PARTY), false, 'third party')
  // ⭐ THE CONJUNCTION IS WHAT KEEPS THIS FROM BECOMING A NAG: second person alone is not an occasion.
  assert.equal(isDurableSelfObservation(PASSING), false, 'passing second-person remark')
})

test('⭐ end to end: the gate fires on the self-observation and stays silent on the negatives', () => {
  assert.equal(shouldFollowThrough({ ...base, answer: ORDINARY, userText: SELF_OBS_1 }).why, 'durable-self-observation')
  for (const [n, t] of [['him', ABOUT_HIM], ['third party', THIRD_PARTY], ['passing', PASSING]]) {
    assert.equal(shouldFollowThrough({ ...base, answer: ORDINARY, userText: t }).fire, false, n)
  }
})

test('⛔⛔ the quote is attributed to WHOEVER said it', () => {
  const theirs = buildFollowThroughMessages({ answer: 'ok', evidence: SELF_OBS_1, fromUser: true })
  assert.match(theirs[1].content, /they said this about you/i)
  const hers = buildFollowThroughMessages({ answer: 'ok', evidence: 'it\'s worth keeping', fromUser: false })
  assert.match(hers[1].content, /you said/i)
  // ⭐ and the frame must not let their claim stand as fact
  assert.match(theirs[0].content, /their observation, not a fact you have to accept/i)
})
