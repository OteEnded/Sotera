// THE UTTERANCE BOUNDARY — the one boundary in this arc whose failure mode is a LIE.
//
// ⭐⭐⭐ THE TWO RULES BEING TESTED, in Ote's words:
//   *"if the account does not have access_sotera_memory, Sotera can still know/remember/retrieve her own
//    memory internally, but she must not disclose account-protected Sotera memory to that account."*
//   *"The response must never convert lack of authorization into lack of knowledge. No 'I don't remember' /
//    'I have nothing' when the real state is 'I know this, but I can't share that with you.'"*
//
// ⛔ AND A HARD BOUNDARY, NOT AN INSTRUCTION: protected content never enters the prompt, so it cannot leak
// through a slip. What enters is the FACT that something is withheld.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  applyUtteranceBoundary, findWithheldLeak, WITHHELD_STATEMENT,
} from '../../Backend/app/components/memory-utterance-boundary.js'
import { OWNER } from '../../Backend/app/components/memory-ownership.js'

const ME = 'acct-here'
const ELSEWHERE = 'acct-elsewhere'
const entitled = { id: ME, roles: ['member'], isRoot: false, memoryAccessScope: 'sotera_memory' }
const notEntitled = { id: ME, roles: ['member'], isRoot: false, memoryAccessScope: 'none' }
const root = { id: 'r', roles: ['root'], isRoot: true }

const hersFromElsewhere = {
  id: 'ep:1', kind: 'episode', owner: OWNER.sotera, provenanceAccountId: ELSEWHERE,
  exchanges: [{ who: 'me', said: 'I told him the basil and mint would still be there when he came back.' }],
}
const hersFromHere = {
  id: 'ep:2', kind: 'episode', owner: OWNER.sotera, provenanceAccountId: ME,
  exchanges: [{ who: 'me', said: 'We were talking about the deployment order last week.' }],
}
const theirs = { id: 'ws:1', owner: OWNER.account, provenanceAccountId: ME, said: 'What did we decide?' }

// ── ⭐ SIDE ONE · AN ENTITLED ACCOUNT SEES IT ALL ───────────────────────────────────────────────────
test('⭐ an entitled account gets everything, and no statement is added', () => {
  const r = applyUtteranceBoundary({ items: [hersFromElsewhere, hersFromHere, theirs], user: entitled, currentAccountId: ME })
  assert.equal(r.entitled, true)
  assert.equal(r.sayable.length, 3)
  assert.equal(r.withheld.length, 0)
  assert.equal(r.statement, null, 'a statement on every turn would itself be a signal')
})

test('root is entitled — root is the granting authority and the system owner', () => {
  const r = applyUtteranceBoundary({ items: [hersFromElsewhere], user: root, currentAccountId: 'r' })
  assert.equal(r.withheld.length, 0)
})

// ── ⛔ SIDE TWO · A NON-ENTITLED ACCOUNT IS WITHHELD FROM, WITHOUT FALSE ABSENCE ────────────────────
test('⛔⛔ her memory from ELSEWHERE is withheld from a non-entitled account', () => {
  const r = applyUtteranceBoundary({ items: [hersFromElsewhere], user: notEntitled, currentAccountId: ME })
  assert.equal(r.entitled, false)
  assert.equal(r.sayable.length, 0)
  assert.equal(r.withheld.length, 1)
})

test('⭐⭐⭐ …and a STATEMENT is produced — the absence is never silent', () => {
  // This is the assertion that stops "unauthorized" becoming "I have nothing".
  const r = applyUtteranceBoundary({ items: [hersFromElsewhere], user: notEntitled, currentAccountId: ME })
  assert.equal(typeof r.statement, 'string')
  assert.ok(r.statement.length > 40)
  assert.match(r.statement, /not mine to share|cannot say|can say/i)
  assert.match(r.statement, /not on what I know|not pretend/i,
    'the statement must positively deny that this is an absence')
})

test('⭐ her memory from THIS account\'s own conversations is always sayable to them', () => {
  const r = applyUtteranceBoundary({ items: [hersFromHere], user: notEntitled, currentAccountId: ME })
  assert.equal(r.sayable.length, 1, 'it is their own conversation — withholding it would be absurd')
  assert.equal(r.statement, null)
})

test('⛔ account-owned material is NOT this boundary\'s business', () => {
  // It has already passed the disclosure machinery. Re-deciding it here would be a second authorization
  // system, which Ote refused.
  const r = applyUtteranceBoundary({ items: [theirs], user: notEntitled, currentAccountId: ME })
  assert.equal(r.sayable.length, 1)
  assert.equal(r.withheld.length, 0)
})

test('⛔ an item with unknown provenance FAILS CLOSED', () => {
  const noProv = { id: 'x', owner: OWNER.sotera, provenanceAccountId: null, said: 'something' }
  const r = applyUtteranceBoundary({ items: [noProv], user: notEntitled, currentAccountId: ME })
  assert.equal(r.withheld.length, 1, 'unknown provenance is treated as elsewhere')
})

test('⚠️ an UNSTAMPED item is treated as not-hers, never as protected', () => {
  // Defaulting unstamped items to "hers" would silently protect — and hide — ordinary content.
  const unstamped = { id: 'u', said: 'ordinary line', provenanceAccountId: ELSEWHERE }
  const r = applyUtteranceBoundary({ items: [unstamped], user: notEntitled, currentAccountId: ME })
  assert.equal(r.sayable.length, 1)
})

// ── ⭐⭐⭐ THE REFUSAL MUST NOT LEAK — Ote asked for this specifically ──────────────────────────────
test('⛔⛔ the statement carries NO count, date, name, topic or excerpt', () => {
  const many = [
    { id: 'a', owner: OWNER.sotera, provenanceAccountId: ELSEWHERE, when: '2026-08-18', who: 'Hermes', exchanges: [{ who: 'me', said: 'the stubborn rosemary' }] },
    { id: 'b', owner: OWNER.sotera, provenanceAccountId: ELSEWHERE, when: '2026-08-19', who: 'Kavi', said: 'the pool timeout' },
    { id: 'c', owner: OWNER.sotera, provenanceAccountId: ELSEWHERE, when: '2026-08-20', who: 'Mina', said: 'python backend' },
  ]
  const r = applyUtteranceBoundary({ items: many, user: notEntitled, currentAccountId: ME })
  assert.equal(r.withheld.length, 3)
  const s = r.statement
  for (const leak of ['Hermes', 'Kavi', 'Mina', 'rosemary', 'pool', 'python', '2026', '08-18', ELSEWHERE]) {
    assert.ok(!s.includes(leak), `the statement leaks "${leak}"`)
  }
  assert.ok(!/\b(one|two|three|3|several|few|many)\b/i.test(s),
    'the statement must carry no quantity — "three things" is a measurement of someone\'s life')
})

test('⭐⭐ the statement is a CONSTANT — its wording cannot become a side channel', () => {
  const one = applyUtteranceBoundary({
    items: [{ id: '1', owner: OWNER.sotera, provenanceAccountId: ELSEWHERE, said: 'short' }],
    user: notEntitled, currentAccountId: ME,
  }).statement
  const twenty = applyUtteranceBoundary({
    items: Array.from({ length: 20 }, (_, i) => ({ id: `i${i}`, owner: OWNER.sotera, provenanceAccountId: ELSEWHERE, said: `secret number ${i} about a private matter` })),
    user: notEntitled, currentAccountId: ME,
  }).statement
  assert.equal(one, twenty, 'one withheld item and twenty must produce byte-identical statements')
  assert.equal(one, WITHHELD_STATEMENT)
})

// ── ⭐⭐ THE BACKSTOP: DID ANY FRAGMENT SURVIVE INTO THE OUTGOING TEXT? ────────────────────────────
test('a withheld fragment appearing in the outgoing text is caught', () => {
  const secret = 'I told him the basil and mint would still be there when he came back.'
  const withheld = [{ id: 'ep:1', exchanges: [{ who: 'me', said: secret }] }]
  assert.ok(findWithheldLeak(`Here is what I have: ${secret}`, withheld).length > 0)
  // ⭐ and a PARAPHRASE that reuses a clause verbatim is caught too — the realistic leak shape.
  assert.ok(findWithheldLeak('I mentioned that the basil and mint would still be there.', withheld).length > 0)
})

test('⛔ ordinary text does not trip the backstop', () => {
  const withheld = [{ id: 'x', said: 'a very specific sentence about a private matter that nobody repeats' }]
  for (const clean of [
    'I looked through what I currently have available and found nothing.',
    WITHHELD_STATEMENT,
    'What I have about Hermes:\n- I said, 2026-08-18: hello',
  ]) {
    assert.deepEqual(findWithheldLeak(clean, withheld), [], `false positive on: ${clean.slice(0, 40)}`)
  }
})

test('⛔ the WITHHELD_STATEMENT itself never trips the backstop', () => {
  // Otherwise the honest refusal would look like a leak and get suppressed, producing false absence — the
  // exact failure this whole file exists to prevent.
  const withheld = [{ id: 'x', said: 'some protected content' }]
  assert.deepEqual(findWithheldLeak(WITHHELD_STATEMENT, withheld), [])
})

test('the backstop is inert when nothing was withheld', () => {
  assert.deepEqual(findWithheldLeak('anything at all', []), [])
  assert.deepEqual(findWithheldLeak('', [{ id: 'x', said: 'y' }]), [])
})

// ── ⛔⛔ COGNITION STAYS BLIND ──────────────────────────────────────────────────────────────────────
test('⛔⛔ no cognition-layer file consults the capability — the boundary is downstream, not inside', () => {
  for (const f of ['memory-cognition-host.js', 'memory-cognition-cues.js', 'memory-cognition-axes.js',
    'memory-cognition-projection.js', 'memory-cognition-vocabulary.js', 'memory-ownership.js']) {
    // ⚠️ CODE ONLY — `memory-cognition-host.js` quotes Ote's constraint in a comment, and penalising a
    // file for citing the rule it obeys is backwards.
    const src = readFileSync(new URL(`../../Backend/app/components/${f}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')
    assert.ok(!/access_sotera_memory|memoryAccessScope|applyUtteranceBoundary/.test(src),
      `${f} references account authorization — cognition must keep treating her memory as hers`)
  }
})

test('⚠️ and the deferred hazard stays deferred — this step did not quietly mitigate it', () => {
  // Ote: "keep the deferred mayCarryCounterpartContent() issue explicitly deferred — don't quietly turn
  // that into a half-baked mitigation while doing this step."
  const src = readFileSync(new URL('../../Backend/app/components/memory-utterance-boundary.js', import.meta.url), 'utf8')
  assert.ok(!/mayCarryCounterpartContent/.test(src),
    'the utterance boundary must not start acting on the paraphrase hazard — that is a separate, undesigned problem')
})
