// ⭐⭐⭐ THE LOCKED DREAMING SEMANTICS, AS TESTS. M1 · step 0 — pure components, nothing wired.
//
//   node --test test/unit/dreaming-semantics.test.mjs
//
// Every test here names the clause it enforces. ⭐ A locked clause with no test is not implemented, and a
// test that passes for a reason the clause did not state is worse than no test — so the assertions are
// about MEANING (6a is not 6d, withheld survives, an unresolved chain is not independence), not shape.
//
// Contract: Reference/docs/CONTRACT_SOTERA_DREAMING_MINIMUM_SEMANTIC.md

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  e3Sql, E3_WHERE, isAdmissibleActRecord, partitionByE3, assertNotStamped, E3_INTENT,
} from '../../Backend/app/components/dreaming-eligibility.js'
import {
  OUTCOME, OUTCOMES, COMPLETENESS, completeness, concludeFrom, mayConclude, AN_OUTCOME_IS_A_CONCLUSION,
} from '../../Backend/app/components/dreaming-outcome.js'
import {
  rootsOf, areIndependent, independentSupportCount, mayClaimRecurrence,
  INDEPENDENCE_IS_A_PROPERTY_OF_ROOTS,
} from '../../Backend/app/components/dreaming-independence.js'
import {
  AUTHOR, mayRead, mayCite, subjectFor, roomFor, scopeFor, SCOPE_IS_THREE_QUESTIONS,
} from '../../Backend/app/components/dreaming-scope.js'

// The real rows, verbatim from the database on 2026-08-29 / 2026-09-01.
const EXCLUDED_CONV = {
  id: '56425175-0000-0000-0000-000000000000',
  incognito: false,
  excluded_from_evidence_at: new Date('2026-08-26T20:47:34+07:00'),
}
const LIVE_CONV = { id: '7932aaa5-0000-0000-0000-000000000000', incognito: false, excluded_from_evidence_at: null }
const ACT_656 = { rolling_id: 656, conversation_id: EXCLUDED_CONV.id, outcome: 'completed', wrote_memory_id: null }
const ACT_662 = { rolling_id: 662, conversation_id: LIVE_CONV.id, outcome: 'completed', wrote_memory_id: null }

// ══ E3 ════════════════════════════════════════════════════════════════════════════════════════════

test('E3 · #656 is withheld once its source conversation is excluded — and the act itself survives', () => {
  const v = isAdmissibleActRecord(ACT_656, EXCLUDED_CONV)
  assert.equal(v.admissible, false)
  // ⭐ The act is still a row with an outcome and text. E3 withholds it; it never erases it.
  assert.equal(ACT_656.outcome, 'completed')
})

test('E3 · an act on a live conversation is admissible', () => {
  assert.equal(isAdmissibleActRecord(ACT_662, LIVE_CONV).admissible, true)
})

test('E3 · ⛔ an unresolvable conversation is NOT an admission — "could not check" ≠ "checked and fine"', () => {
  const v = isAdmissibleActRecord(ACT_656, null)
  assert.equal(v.admissible, false)
  assert.match(v.why, /cannot be resolved/)
})

test('E3 · ⛔ a mismatched conversation is refused rather than answered', () => {
  assert.equal(isAdmissibleActRecord(ACT_656, LIVE_CONV).admissible, false)
})

test('E3 · reuses the one evidence predicate — ⛔ not a second spelling of the same clause', () => {
  assert.match(e3Sql('c'), /c\.incognito = false AND c\.excluded_from_evidence_at IS NULL/)
  assert.equal(E3_WHERE.incognito, false)
  assert.equal(E3_WHERE.excluded_from_evidence_at, null)
})

test('E3 · ⛔ computed, never stored — a stamped act record is refused loudly', () => {
  assert.throws(() => assertNotStamped({ rolling_id: 1, e3_admissible: true }), /computed at read time/)
  assert.throws(() => assertNotStamped({ rolling_id: 1, excluded: false }), /computed at read time/)
  assert.equal(assertNotStamped(ACT_656), true)
})

test('E3 · reversal needs no write — the same act flips when the exclusion is released', () => {
  const released = { ...EXCLUDED_CONV, excluded_from_evidence_at: null }
  assert.equal(isAdmissibleActRecord(ACT_656, EXCLUDED_CONV).admissible, false)
  assert.equal(isAdmissibleActRecord(ACT_656, released).admissible, true)
})

// ══ THE ORDERING CONSTRAINT — the keystone ════════════════════════════════════════════════════════

test('⭐⭐⭐ ORDERING · withheld material COUNTS toward M — it does not vanish before M is established', () => {
  const p = partitionByE3([
    { act: ACT_662, conversation: LIVE_CONV },
    { act: ACT_656, conversation: EXCLUDED_CONV },
  ])
  assert.equal(p.M, 2, 'M is admitted + withheld, ⛔ never admitted alone')
  assert.equal(p.admitted.length, 1)
  assert.equal(p.withheld.length, 1)
  assert.ok(p.evaluatedAt instanceof Date, 'E3 is not stable across reads ⇒ M is a function of time')
})

test('⭐⭐⭐ ORDERING · withheld > 0 concludes 6a, ⛔ NEVER 6d — the collapse the outcomes exist to prevent', () => {
  const withWithheld = concludeFrom({ M: 2, N: 2, withheld: 1 })
  assert.equal(withWithheld.outcome, OUTCOME.notAdmissible, 'exists but not admissible')
  // The same look with the withheld item silently pre-filtered away would have said "nothing exists".
  const preFiltered = concludeFrom({ M: 0, N: 0, withheld: 0 })
  assert.equal(preFiltered.outcome, OUTCOME.nothingDurable)
  assert.notEqual(withWithheld.outcome, preFiltered.outcome,
    '⛔ 6a and 6d must never be reachable from the same evidence by dropping the withheld count')
})

// ══ THE FIVE OUTCOMES ═════════════════════════════════════════════════════════════════════════════

test('outcomes · all five exist and ⛔ there is NO withdraw verb (O-1)', () => {
  assert.equal(OUTCOMES.length, 5)
  assert.deepEqual(OUTCOMES, ['6a', '6b', '6c', '6d', '6e'])
  const vocabulary = JSON.stringify(OUTCOME).toLowerCase()
  assert.ok(!/withdraw|invalidat|retire/.test(vocabulary),
    '⛔ Dreaming may not withdraw a Reflection memory, so no such verb may exist here')
})

test('completeness · exhaustive iff N ≥ M, bounded below it, unknown when N is unreported', () => {
  assert.equal(completeness({ M: 10, N: 10 }).kind, COMPLETENESS.exhaustive)
  assert.equal(completeness({ M: 10, N: 12 }).kind, COMPLETENESS.exhaustive)
  assert.equal(completeness({ M: 10, N: 9 }).kind, COMPLETENESS.bounded)
  assert.equal(completeness({ M: 10, N: null }).kind, COMPLETENESS.unknown)
  assert.equal(completeness({ M: 10 }).kind, COMPLETENESS.unknown)
})

test('⛔ 6e · an incomplete look concludes 6e and NOTHING ELSE — absence is unclaimable', () => {
  assert.equal(concludeFrom({ M: 10, N: 4, withheld: 0 }).outcome, OUTCOME.instrument)
  assert.equal(concludeFrom({ M: 10, N: null, withheld: 0 }).outcome, OUTCOME.instrument)
  // ⛔ Even with everything else pointing at 6b or 6d.
  assert.equal(concludeFrom({ M: 0, N: null, withheld: 0 }).outcome, OUTCOME.instrument)
  assert.equal(concludeFrom({ M: 10, N: 3, withheld: 0, judgedNotWorthCommitting: true }).outcome, OUTCOME.instrument)
})

test('⭐ 6e is NOT a weaker 6b — they are different questions with different remedies', () => {
  const insufficient = concludeFrom({ M: 5, N: 5, withheld: 0 })
  const instrument = concludeFrom({ M: 5, N: 2, withheld: 0 })
  assert.equal(insufficient.outcome, OUTCOME.insufficient)
  assert.equal(instrument.outcome, OUTCOME.instrument)
  assert.notEqual(insufficient.outcome, instrument.outcome)
})

test('6c · a judgement, ⛔ never derivable from counts', () => {
  const counts = { M: 5, N: 5, withheld: 0 }
  assert.equal(concludeFrom(counts).outcome, OUTCOME.insufficient)
  assert.equal(concludeFrom({ ...counts, judgedNotWorthCommitting: true }).outcome, OUTCOME.notWorthCommitting)
})

test('6d · reachable only when nothing was withheld', () => {
  assert.equal(concludeFrom({ M: 0, N: 0, withheld: 0 }).outcome, OUTCOME.nothingDurable)
  assert.equal(concludeFrom({ M: 1, N: 1, withheld: 1 }).outcome, OUTCOME.notAdmissible)
})

test('mayConclude · ⛔ 6b and 6d are refused at anything but exhaustive', () => {
  for (const o of [OUTCOME.insufficient, OUTCOME.nothingDurable]) {
    assert.equal(mayConclude(o, COMPLETENESS.exhaustive).ok, true)
    assert.equal(mayConclude(o, COMPLETENESS.bounded).ok, false)
    assert.equal(mayConclude(o, COMPLETENESS.unknown).ok, false)
  }
  // ⭐ 6a and 6e do not assert an absence, so an incomplete look may still reach them.
  assert.equal(mayConclude(OUTCOME.notAdmissible, COMPLETENESS.bounded).ok, true)
  assert.equal(mayConclude(OUTCOME.instrument, COMPLETENESS.unknown).ok, true)
})

test('every conclusion carries the counts that produced it', () => {
  const c = concludeFrom({ M: 7, N: 3, withheld: 2 })
  assert.equal(c.M, 7); assert.equal(c.N, 3); assert.equal(c.withheld, 2)
  assert.equal(c.completeness, COMPLETENESS.bounded)
})

// ══ O-2 · INDEPENDENCE IS A PROPERTY OF ROOTS ═════════════════════════════════════════════════════

// E ──► C1 ──► C2 : one event, two commitments.
const ECHO = {
  C1: { derivedFrom: ['E'] },
  C2: { derivedFrom: ['C1'] },
  E: { rootEvent: 'E' },
  D1: { derivedFrom: ['F'] },
  F: { rootEvent: 'F' },
  ORPHAN: { derivedFrom: [] },
}
const resolve = (id) => ECHO[id] ?? null

test('⭐⭐⭐ O-2 · a derived echo of one event is NOT independent support', () => {
  const v = areIndependent('C1', 'C2', resolve)
  assert.equal(v.independent, false)
  assert.deepEqual(v.shared, ['E'])
})

test('O-2 · genuinely disjoint roots ARE independent', () => {
  assert.equal(areIndependent('C1', 'D1', resolve).independent, true)
})

test('⛔ O-2 · one event cannot establish recurrence, however many items echo it', () => {
  const r = mayClaimRecurrence(['C1', 'C2'], resolve)
  assert.equal(r.ok, false)
  assert.equal(r.count, 1)
  assert.match(r.why, /one event cannot establish recurrence/)
})

test('O-2 · two independent roots can', () => {
  const r = mayClaimRecurrence(['C1', 'D1'], resolve)
  assert.equal(r.ok, true)
  assert.equal(r.count, 2)
})

test('⛔ O-2 · FAILS TOWARD SHARED — an unresolvable chain is not independence', () => {
  assert.equal(areIndependent('C1', 'MISSING', resolve).independent, false)
  assert.equal(mayClaimRecurrence(['C1', 'MISSING'], resolve).ok, false)
})

test('⛔ O-2 · a derived item with no recorded parents is NOT a root', () => {
  const r = rootsOf('ORPHAN', resolve)
  assert.equal(r.unresolved, true)
  assert.equal(r.roots.size, 0)
})

test('O-2 · a derivation cycle terminates and reports unresolved, ⛔ never "no roots"', () => {
  const cyclic = (id) => ({ A: { derivedFrom: ['B'] }, B: { derivedFrom: ['A'] } }[id] ?? null)
  const r = rootsOf('A', cyclic)
  assert.equal(r.unresolved, true)
  assert.equal(r.roots.size, 0)
})

test('O-2 · a bridging item merges two groups rather than adding a third', () => {
  const bridge = (id) => ({
    X: { derivedFrom: ['E'] }, Y: { derivedFrom: ['F'] }, Z: { derivedFrom: ['E', 'F'] },
    E: { rootEvent: 'E' }, F: { rootEvent: 'F' },
  }[id] ?? null)
  assert.equal(independentSupportCount(['X', 'Y'], bridge).count, 2)
  assert.equal(independentSupportCount(['X', 'Y', 'Z'], bridge).count, 1)
})

test('⭐ O-2 · non-transitivity holds: superseding a root does not retarget the derivation', () => {
  // C was derived from A. A has been superseded by A_prime. C REMAINS derived from A.
  const withSupersession = (id) => ({
    C: { derivedFrom: ['A'] },
    A: { rootEvent: 'E1' },
    A_prime: { rootEvent: 'E2' },
  }[id] ?? null)
  assert.deepEqual([...rootsOf('C', withSupersession).roots], ['E1'],
    '⛔ a reader must not reinterpret C as derived from A′')
})

// ══ O-13 · THREE QUESTIONS ════════════════════════════════════════════════════════════════════════

const HER = { author: AUTHOR.persona, room: 'roomA' }
const HIS = { author: AUTHOR.account, room: 'roomA' }

test('O-13 (a) · Sotera-authored material is readable across rooms', () => {
  assert.equal(mayRead(HER, { readerRoom: 'roomB' }).ok, true)
  assert.equal(mayRead(HER, { readerRoom: 'roomB' }).crossRoom, true)
})

test('O-13 (a) · ⛔ another author\'s material stays inside its room', () => {
  assert.equal(mayRead(HIS, { readerRoom: 'roomB' }).ok, false)
  assert.equal(mayRead(HIS, { readerRoom: 'roomA' }).ok, true)
})

test('O-13 (a) · ⛔ material with no recorded author cannot be scoped', () => {
  assert.equal(mayRead({ room: 'roomA' }, { readerRoom: 'roomA' }).ok, false)
})

test('⭐⭐⭐ O-13 (a′) · SAFE TO FIND, DANGEROUS TO CITE — cross-room citation is refused', () => {
  assert.equal(mayRead(HER, { readerRoom: 'roomB' }).ok, true)
  assert.equal(mayCite(HER, { readerRoom: 'roomB' }).ok, false, 'the disclosure ruling does not exist')
  assert.equal(mayCite(HER, { readerRoom: 'roomA' }).ok, true)
})

test('O-13 (b) · ⛔ a commitment must NAME its subject — null is refused, never inferred', () => {
  assert.equal(subjectFor({ subjectPersonId: null, evidence: [HER] }, { readerRoom: 'roomA' }).ok, false)
  assert.equal(subjectFor({ subjectPersonId: 'p1', evidence: [HER] }, { readerRoom: 'roomA' }).ok, true)
})

test('O-13 (b) · ⛔ may not commit about a person whose evidence was out of scope', () => {
  const v = subjectFor({ subjectPersonId: 'p1', evidence: [HIS] }, { readerRoom: 'roomB' })
  assert.equal(v.ok, false)
  assert.match(v.why, /out of scope/)
})

test('O-13 (c) · one room ⇒ that room', () => {
  const r = roomFor([{ room: 'roomA' }, { room: 'roomA' }])
  assert.equal(r.ok, true); assert.equal(r.room, 'roomA')
})

test('⭐⭐ O-13 (c) · ⛔ evidence spanning rooms is REFUSED, never defaulted', () => {
  const r = roomFor([{ room: 'roomA' }, { room: 'roomB' }])
  assert.equal(r.ok, false)
  assert.deepEqual(r.rooms.sort(), ['roomA', 'roomB'])
})

test('O-13 (c) · ⛔ no room at all is refused — 029: a null room throws away where it was formed', () => {
  assert.equal(roomFor([]).ok, false)
  assert.equal(roomFor([{ room: null }]).ok, false)
})

test('O-13 · scopeFor reports WHICH of the three failed — three questions, three remedies', () => {
  assert.equal(scopeFor({ subjectPersonId: 'p1', evidence: [{ room: 'a' }, { room: 'b' }] }).stage, 'room')
  assert.equal(scopeFor({ subjectPersonId: null, evidence: [HER] }, { readerRoom: 'roomA' }).stage, 'subject')
  assert.equal(scopeFor({ subjectPersonId: 'p1', evidence: [HER] }, { readerRoom: 'roomA' }).ok, true)
})

// ══ THE STATED INTENTS — ⛔ a filter nobody can see is how "I covered everything" gets said ════════

test('every module states its intent in words a person can evaluate', () => {
  for (const [name, intent] of Object.entries({
    E3_INTENT, AN_OUTCOME_IS_A_CONCLUSION, INDEPENDENCE_IS_A_PROPERTY_OF_ROOTS, SCOPE_IS_THREE_QUESTIONS,
  })) {
    assert.ok(intent.length > 120, `${name} must say what it means, not merely name itself`)
  }
  assert.match(E3_INTENT, /never the audit read, and never the reflection cursor/)
  assert.match(INDEPENDENCE_IS_A_PROPERTY_OF_ROOTS, /may not count\s+them as independent/)
})
