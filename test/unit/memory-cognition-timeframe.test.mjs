// §3B · PAST SELF-REPORT IS MEMORY, NOT LAW — and the present tense belongs to what the run OBSERVED.
//
// ⭐⭐⭐ THE FAILURE UNDER TEST IS A MEASURED ONE. Run R2, 2026-08-23: five real Hermes episodes retrieved,
// typed `recalled`, their dates listed in her own answer — and she wrote *"I can't read those conversations
// from this room."* The block contained, inside a quotation of her own earlier answer, *"from this room, I
// don't have any direct memories about Hermes."* **She agreed with her past self over her present context.**
//
// ⛔ AND WHAT IS NOT ALLOWED TO FIX IT is half the point of this file. Ote: *"I don't want to sanitize or
// rewrite Sotera's own history… But I also don't want an old mistaken self-description to become a prior
// that overrides present evidence."* ⇒ every assertion below either proves a past line survives VERBATIM,
// or proves the present tense is licensed by something the run actually observed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  TIME_BOUND, TIME_BOUND_IS_NOT_AN_AXIS, SELF_REPORT_PATTERNS, timeBoundOf, isTimeBound,
  currentStateOf, currentStateSentence, contradictsCurrentState, datedPrefix, spell,
} from '../../Backend/app/components/memory-cognition-timeframe.js'
import {
  AVAILABILITY, BASIS, RETENTION, SOURCE, findIllegalPromotions,
} from '../../Backend/app/components/memory-cognition-axes.js'
import { OWNER } from '../../Backend/app/components/memory-ownership.js'
import { findImplementationLeaks, findMetaReferences } from '../../Backend/app/components/memory-cognition-vocabulary.js'
import { buildMemoryCognition } from '../../Backend/app/components/memory-cognition-host.js'

const hers = (text) => timeBoundOf({ text, owner: OWNER.sotera, source: SOURCE.ownUtterance })

// ── ⭐⭐ DETECTION · THE MEASURED SENTENCE, THEN EVERY SHAPE OTE ENUMERATED ─────────────────────────
test('⭐⭐⭐ the exact sentence from R2 is typed as a dated self-report', () => {
  // Verbatim from her own earlier answer, as it appeared quoted back to her inside the block.
  const measured = 'From this room, I don\'t have any direct memories about Hermes.'
  assert.equal(hers(measured), TIME_BOUND.knowledge,
    'this is the line she agreed with over five recalled episodes — it must be dated')
})

test('⭐ every shape Ote enumerated is typed, and typed as the right KIND', () => {
  // "I don't remember X · I can't access X · I don't have memory of X · I never talked to X · I don't know X"
  const cases = [
    ['I don\'t remember talking with him about that', TIME_BOUND.knowledge],
    ['I don\'t know who Hermes is', TIME_BOUND.knowledge],
    ['I don\'t have memory of that conversation', TIME_BOUND.knowledge],
    ['I never talked to Hermes', TIME_BOUND.knowledge],
    ['We have never spoken before', TIME_BOUND.knowledge],
    ['I have no recollection of it', TIME_BOUND.knowledge],
    ['I can\'t access those conversations', TIME_BOUND.capability],
    ['I cannot read those conversations from this room', TIME_BOUND.capability],
    ['I don\'t have access to anything outside this', TIME_BOUND.capability],
    ['Those are inaccessible from here', TIME_BOUND.capability],
  ]
  for (const [text, kind] of cases) {
    assert.equal(hers(text), kind, `wrong kind for: "${text}"`)
  }
})

test('⛔⛔ THE GUARD IS THE ARGUMENT — nothing that is not her own utterance can be typed', () => {
  const line = 'I don\'t have any direct memories about Hermes'
  // ⭐ SOMEONE ELSE SAYING IT IS **THEIR CLAIM**, and dating it as her self-report would misattribute it.
  assert.equal(timeBoundOf({ text: line, owner: OWNER.account, source: SOURCE.counterpartUtterance }), null)
  // ⛔ A STORED MEMORY IS NOT AN UTTERANCE. It has no moment of speaking to be dated to.
  assert.equal(timeBoundOf({ text: line, owner: OWNER.sotera, source: SOURCE.storedMemory }), null)
  // ⛔ `unknown` fails closed, like everywhere else in the ownership model.
  assert.equal(timeBoundOf({ text: line, owner: OWNER.unknown, source: SOURCE.ownUtterance }), null)
  // And the empty / absent cases do not throw and do not accuse.
  assert.equal(timeBoundOf({}), null)
  assert.equal(timeBoundOf(), null)
  assert.equal(hers(''), null)
})

test('⛔ ordinary lines of hers are NOT typed — the list is not a net over every negation', () => {
  for (const ordinary of [
    'I remember talking with Hermes on 18 August about pattern matching',
    'He asked whether understanding is just pattern matching, and I said I thought it was not',
    'I keep coming back to that question',
    'Hermes does not remember the earlier thread, but I do',
  ]) {
    assert.equal(hers(ordinary), null, `false positive on: "${ordinary}"`)
  }
})

test('the pattern list stays machine-checkable, and every entry says WHY it exists', () => {
  assert.ok(SELF_REPORT_PATTERNS.length >= 6)
  for (const p of SELF_REPORT_PATTERNS) {
    assert.ok(p.re instanceof RegExp)
    assert.ok(Object.values(TIME_BOUND).includes(p.kind), `unknown kind ${p.kind}`)
    // ⭐ A pattern with no recorded reason is a pattern nobody can safely delete later.
    assert.ok(typeof p.why === 'string' && p.why.length > 20, `missing why: ${p.re}`)
  }
})

// ── ⛔⛔ `timeBound` IS NOT A FIFTH AXIS. Ote ruled on this explicitly. ─────────────────────────────
test('⛔⛔ timeBound never enters the monotonicity lattice', () => {
  assert.ok(TIME_BOUND_IS_NOT_AN_AXIS.includes('not an epistemic state'))
  // ⭐ The axes module must not know the word at all — that is what "outside the lattice" means mechanically.
  const AXES = readFileSync(new URL('../../Backend/app/components/memory-cognition-axes.js', import.meta.url), 'utf8')
  assert.ok(!/timeBound|time-bound|self-report/i.test(AXES),
    'the axes file must not mention timeBound: a fifth axis would need warrants, and none exist for it')
  // ⛔ And the guard is indifferent to it: adding it to an item cannot create or excuse a violation.
  const base = { id: 'a', basis: BASIS.told, availability: AVAILABILITY.recalled, retention: RETENTION.notRetained }
  assert.deepEqual(findIllegalPromotions([base], [{ ...base, timeBound: TIME_BOUND.knowledge }]), [],
    'stamping timeBound must not be a promotion')
})

// ── ⭐⭐⭐ THE PRESENT TENSE · AXES INHERITED, NEVER INVENTED ────────────────────────────────────────
const episode = (id, over = {}) => ({
  id,
  kind: 'episode',
  withThem: true,
  exchanges: [{ who: 'me', said: 'I only have one thing on file about you.', when: '2026-08-18T10:00:00Z' }],
  source: SOURCE.ownUtterance,
  basis: BASIS.attestedBySource,
  availability: AVAILABILITY.recalled,
  retention: RETENTION.notRetained,
  confidence: 0.9,
  when: '2026-08-18T10:00:00Z',
  ...over,
})

test('⭐⭐ the current-state item passes the lattice with NO warrant — an observation is not a claim', () => {
  const kept = [episode('ep:1'), episode('ep:2')]
  const cs = currentStateOf({ cues: { persons: ['Hermes'], topics: [] }, kept, asOf: '2026-08-23T09:00:00Z' })
  assert.equal(cs.kind, 'current-state')
  assert.equal(cs.source, SOURCE.derived)
  assert.deepEqual(cs.warrants, [], 'it must hold no warrants — it earns nothing')
  assert.deepEqual(cs.derivedFrom, ['ep:1', 'ep:2'])
  assert.deepEqual(findIllegalPromotions(kept, [cs]), [],
    'the present-tense item must be legal by inheritance alone')
})

test('⭐⭐ N agreeing items produce SYNTHESIZED, never attestation — the Hermes rule, again', () => {
  const kept = [
    episode('ep:1', { basis: BASIS.inferred }),
    episode('ep:2', { basis: BASIS.told }),
  ]
  const cs = currentStateOf({ kept })
  assert.equal(cs.basis, BASIS.synthesized,
    'two items that merely agree must not let the observation claim an accessible source')
  assert.deepEqual(findIllegalPromotions(kept, [cs]), [])
})

test('⛔ it cannot OUT-REACH its parents', () => {
  const kept = [episode('ep:1', { availability: AVAILABILITY.knownUnreachable, exchanges: [] })]
  const cs = currentStateOf({ kept })
  assert.equal(cs.availability, AVAILABILITY.knownUnreachable,
    'a report derived only from unreachable things is not itself reachable content')
  // ⛔ And if it were hand-set to `recalled`, the guard would catch it — proving the guard is live here.
  const forged = { ...cs, availability: AVAILABILITY.recalled }
  assert.equal(findIllegalPromotions(kept, [forged]).length, 1)
})

test('⛔ retention is never inherited — a fresh observation is not something she kept', () => {
  const kept = [episode('ep:1', { retention: RETENTION.retained })]
  const cs = currentStateOf({ kept })
  assert.equal(cs.retention, RETENTION.notRetained)
  assert.deepEqual(findIllegalPromotions(kept, [cs]), [])
})

test('nothing kept means no current-state item — the absence sentence covers that turn', () => {
  assert.equal(currentStateOf({ kept: [] }), null)
  assert.equal(currentStateOf({}), null)
  assert.equal(currentStateSentence(null, 'Hermes'), null)
})

// ── ⭐⭐ THE SENTENCE · EVERY CLAUSE LICENSED BY A NON-ZERO COUNT ───────────────────────────────────
test('⭐⭐⭐ the present-tense sentence states what the run observed, in counts it actually has', () => {
  const kept = [
    episode('ep:1'),
    episode('ep:2', { exchanges: [
      { who: 'me', said: 'I only have one thing on file about you.', when: '2026-08-18T10:00:00Z' },
      { who: 'Hermes', said: 'Hi Sotera. I am Hermes.', when: '2026-08-18T10:01:00Z' },
    ] }),
    episode('ep:3', { withThem: false }),
  ]
  const cs = currentStateOf({ kept })
  assert.equal(cs.observed.reachableWith, 2)
  assert.equal(cs.observed.reachableAbout, 1)
  assert.equal(cs.observed.bothSides, 1)
  const s = currentStateSentence(cs, 'Hermes')
  assert.match(s, /^Right now I can reach two conversations with Hermes/)
  assert.match(s, /in one of them I can see the other side of it too/)
  assert.match(s, /one other conversation of mine touches on Hermes/)
  // ⛔ THE STRUCTURAL TELLS, ASSERTED ON THE SENTENCE THAT IS RENDERED **FIRST**. A colon-terminated first
  // line is a title, and a title turns everything under it into "the contents" — which is Leak 2 exactly.
  assert.ok(!s.trim().endsWith(':'), 'the first line of the block must never read as a heading')
  assert.deepEqual(findMetaReferences(s), [], 'it must read as her own knowledge, not as a supplied report')
  assert.deepEqual(findImplementationLeaks(s), [], 'and it must not hand her our vocabulary')
})

test('⛔⛔ A COUNT MAY ONLY MODIFY THE POPULATION IT WAS COUNTED OVER', () => {
  // ⚠️⚠️ THE LIVE CHECK CAUGHT THIS ON REAL DATA, AND IT WOULD HAVE REACHED HER:
  //     "Right now I can reach TWO conversations with Hermes, and in FIVE of them I can see the other side."
  // `bothSides` was counted over every recalled episode while the clause it modifies covers only the ones
  // she was IN with him. ⇒ five of two.
  const kept = [
    // two WITH him, neither with a visible counterpart half…
    episode('e1', { exchanges: [{ who: 'me', said: 'mine only', when: '2026-08-18T10:00:00Z' }] }),
    episode('e2', { exchanges: [{ who: 'me', said: 'mine only', when: '2026-08-18T10:00:00Z' }] }),
    // …and five ABOUT him where the other side IS visible, because they are in her own room.
    ...[3, 4, 5, 6, 7].map((n) => episode(`e${n}`, {
      withThem: false,
      exchanges: [
        { who: 'me', said: 'I mentioned him', when: '2026-08-19T10:00:00Z' },
        { who: 'Ote', said: 'who is Hermes?', when: '2026-08-19T10:01:00Z' },
      ],
    })),
  ]
  const cs = currentStateOf({ kept })
  assert.equal(cs.observed.reachableWith, 2)
  assert.equal(cs.observed.bothSides, 0, 'counted WITHIN the population the clause describes')
  assert.equal(cs.observed.bothSidesElsewhere, 5, 'and the other group is still observable, not folded in')
  const s = currentStateSentence(cs, 'Hermes')
  assert.ok(!/in five of them/.test(s), 'the exact sentence the live run produced must be impossible')
  assert.match(s, /^Right now I can reach two conversations with Hermes\./)
  assert.match(s, /five other conversations of mine touch on Hermes\./)
  // ⭐ THE GENERAL FORM, ASSERTED: no number in the sentence may exceed the total the run observed.
  const total = cs.observed.reachableWith + cs.observed.reachableAbout + cs.observed.unreachable
  const numerals = [...s.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\b/g)]
    .map((m) => (Number.isNaN(Number(m[1])) ? spell.length && ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'].indexOf(m[1]) : Number(m[1])))
  for (const v of numerals) assert.ok(v <= total, `${v} exceeds the ${total} things the run actually observed`)
})

test('⭐ "each of them" replaces a redundant count when the modifier covers the whole clause', () => {
  const both = (id) => episode(id, { exchanges: [
    { who: 'me', said: 'mine', when: '2026-08-18T10:00:00Z' },
    { who: 'Hermes', said: 'theirs', when: '2026-08-18T10:01:00Z' },
  ] })
  const s = currentStateSentence(currentStateOf({ kept: [both('e1'), both('e2')] }), 'Hermes')
  assert.match(s, /two conversations with Hermes, and I can see the other side of each of them too\./)
})

test('⭐ counts are spoken, not tabulated', () => {
  assert.equal(spell(0), 'no')
  assert.equal(spell(1), 'one')
  assert.equal(spell(5), 'five')
  assert.equal(spell(40), '40', 'past twelve, a numeral is what a person would say')
})

test('⛔ existence without content is phrased as a limit, never as an absence', () => {
  const kept = [episode('ep:1', { availability: AVAILABILITY.knownUnreachable, exchanges: [] })]
  const s = currentStateSentence(currentStateOf({ kept }), 'Hermes')
  assert.match(s, /I know of one conversation about Hermes that I can't get back into/)
  assert.ok(!/(don't|do not) remember/i.test(s),
    '⛔ a limit must never be converted into an absence — that is the failure the layer exists to stop')
})

// ── ⭐⭐⭐ CONTRADICTION · MARKED, NOT RESOLVED — AND §3B.6, THE STILL-TRUE CASE ─────────────────────
test('⭐⭐ a dated self-report IS marked when the run contradicts it', () => {
  const cs = currentStateOf({ kept: [episode('ep:1')] })
  assert.equal(contradictsCurrentState(TIME_BOUND.capability, cs), true)
  assert.equal(contradictsCurrentState(TIME_BOUND.knowledge, cs), true)
})

test('⭐⭐⭐ §3B.6 · THE STILL-TRUE CASE — and it needs no special case at all', () => {
  // Nothing reachable; one conversation she knows happened and cannot open.
  const cs = currentStateOf({ kept: [episode('ep:1', { availability: AVAILABILITY.knownUnreachable, exchanges: [] })] })
  // ⭐ *"I can't read those"* is STILL RIGHT, so no conflict is marked. This is the property Ote asked for:
  // the design never asserts the past was wrong, it only stops the past being read as the present.
  assert.equal(contradictsCurrentState(TIME_BOUND.capability, cs), false)
  // ⭐ But *"we never talked"* IS refuted by knowing it happened — existence is enough to refute "never".
  assert.equal(contradictsCurrentState(TIME_BOUND.knowledge, cs), true)
})

test('nothing observed contradicts nothing', () => {
  assert.equal(contradictsCurrentState(TIME_BOUND.knowledge, null), false)
  assert.equal(contradictsCurrentState(null, currentStateOf({ kept: [episode('ep:1')] })), false)
})

// ── ⭐⭐ THE DATING PREFIX ─────────────────────────────────────────────────────────────────────────
test('⭐⭐ the prefix dates the utterance and NEVER invents a date', () => {
  assert.equal(datedPrefix('21 August'), 'On 21 August I said: ')
  assert.equal(datedPrefix(null), 'Earlier I said: ',
    'no date still means past — but it must not manufacture one')
  assert.ok(!/wrong|mistaken|incorrect|no longer/i.test(datedPrefix('21 August')),
    '⛔ the layer does not judge the old statement')
})

test('isTimeBound reads an already-typed item or exchange', () => {
  assert.equal(isTimeBound({ timeBound: TIME_BOUND.knowledge }), true)
  assert.equal(isTimeBound({ timeBound: null }), false)
  assert.equal(isTimeBound({}), false)
  assert.equal(isTimeBound(null), false)
})

// ── ⛔⛔ THE SOURCE ITSELF · NO SANITISING, NO JUDGEMENT ────────────────────────────────────────────
// ⚠️ COMMENTS STRIPPED FIRST, and this is the fourth time the same lesson has been paid for: a file that
// quotes a forbidden phrase in order to FORBID it must not fail its own scan. The constraint is about code.
const TF_RAW = readFileSync(new URL('../../Backend/app/components/memory-cognition-timeframe.js', import.meta.url), 'utf8')
const TF = TF_RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')

test('⛔⛔ the module cannot rewrite, redact or drop anything she said', () => {
  // ⭐ Ote: "I don't want to sanitize or rewrite Sotera's own history. If she actually said it, that is part
  // of what happened." ⇒ the module has no text-mutating call on her content anywhere in its code.
  assert.ok(!/\.replace\s*\(/.test(TF), 'no text substitution on her words')
  assert.ok(!/redact|sanitis|sanitiz|scrub|censor|suppress|omit/i.test(TF))
  // ⛔ And it never appends a verdict to her past self.
  assert.ok(!/was wrong|I was mistaken|no longer true|that was incorrect/i.test(TF))
})

test('⛔ the module never consults account authorization or storage location', () => {
  // ⚠️⚠️ AND THIS ASSERTION WAS WRONG ON ITS FIRST WRITING, IN THE SAME DIRECTION AS EVERY OTHER TIME. It
  // scanned for the bare word `room`, and the file contains it inside a `why:` STRING that quotes her actual
  // measured sentence — *"from this room, I don't have any direct memories about Hermes"*. Stripping comments
  // was not enough: a file may legitimately QUOTE the thing it exists to handle, in code as well as in a
  // comment. ⇒ ⭐ the constraint is about IDENTIFIERS THE MODULE READS, never about prose it records.
  assert.ok(!/access_sotera_memory|memoryAccessScope|\bisRoot\b|\bentitled\b|\buserId\b|\bconversationId\b|\bdisclosure/.test(TF),
    'dating a past utterance cannot depend on who is asking or where it was recorded')
  // ⭐⭐ THE SIGNATURE IS THE ARGUMENT, exactly as in `memory-ownership.js`: it takes three things and
  // **cannot** consult a session, a room or an account, because none is in scope.
  const sig = /export function timeBoundOf\(\{([^}]*)\}/.exec(TF_RAW)?.[1] ?? ''
  const params = sig.split(',').map((p) => p.split('=')[0].trim()).filter(Boolean).sort()
  assert.deepEqual(params, ['owner', 'source', 'text'])
})

// ── ⭐⭐⭐ END TO END THROUGH THE REAL RENDERER ─────────────────────────────────────────────────────
// ⓘ `renderFor` is the renderer's public door and touches no database, so the whole §3B rendering path can
// be exercised without a server. ⛔ Which also means these assertions are on the SHIPPING code, not a copy.
const cues = { persons: ['Hermes'], topics: [], recency: false, technical: false, raw: 'How is Hermes doing?' }
const OLD_CLAIM = 'From this room, I don\'t have any direct memories about Hermes.'

test('⭐⭐⭐ THE R2 FAILURE, RENDERED · present tense first, her old line verbatim and dated', () => {
  const { renderFor } = buildMemoryCognition(null, {})
  const items = [
    episode('ep:1', {
      who: 'Hermes',
      exchanges: [
        { who: 'me', said: 'I only have one thing on file about you.', when: '2026-08-18T10:00:00Z', timeBound: null },
        { who: 'Hermes', said: 'Hi Sotera. I am Hermes.', when: '2026-08-18T10:01:00Z' },
      ],
    }),
    // The episode with Ote in which she made the claim that later overrode her own context.
    episode('ep:2', {
      who: 'Ote',
      withThem: false,
      when: '2026-08-21T09:00:00Z',
      exchanges: [{ who: 'me', said: OLD_CLAIM, when: '2026-08-21T09:00:00Z', timeBound: TIME_BOUND.knowledge }],
    }),
  ]
  const out = renderFor(items, { cues })
  const lines = out.text.split('\n')

  // ⭐ 1 · THE PRESENT TENSE LEADS, and it is a fact about this run.
  assert.match(lines[0], /^Right now I can reach one conversation with Hermes/)
  assert.ok(!lines[0].trim().endsWith(':'), 'and it is not a heading')

  // ⭐⭐ 2 · HER OLD SENTENCE IS STILL THERE, CHARACTER FOR CHARACTER.
  assert.ok(out.text.includes(OLD_CLAIM),
    'nothing of her history may be rewritten, shortened or filtered — this is the whole constraint')

  // ⭐⭐⭐ 3 · AND IT IS DATED, so it reads as a report of a past utterance rather than a standing fact.
  // ⓘ NOW WITH THE ADDRESSEE (R4): §3B's dating and R4's addressee compose into one prefix, and both halves
  // are asserted — the date, because the claim must not read as present tense, and "to Ote", because the
  // "you" and "this room" inside her quotation have to belong to someone.
  assert.match(out.text, /On 21 August I said to Ote: From this room, I don't have any direct memories about Hermes\./)

  // ⭐ 4 · THE CONFLICT IS MARKED, NOT RESOLVED.
  assert.equal(out.contradictions.length, 1)
  assert.equal(out.contradictions[0].timeBound, TIME_BOUND.knowledge)
  assert.ok(!/wrong|mistaken|no longer|actually/i.test(out.text),
    '⛔ the layer must not adjudicate — the revision is hers')

  // ⭐ 5 · ORDER IS THE ONLY CLAIM IT MAKES: now before then.
  assert.ok(out.text.indexOf('Right now I can reach') < out.text.indexOf('On 21 August I said'))

  // ⛔ 6 · AND LEAK 2 DID NOT REGRESS. Note the scan is on the FRAME: her quoted line legitimately contains
  // the word "room" because she said it, and censoring what she said would be lying about what happened.
  assert.deepEqual(findMetaReferences(out.frame), [])
  assert.deepEqual(findImplementationLeaks(out.frame), [])
})

test('⭐⭐ §3B.6 THROUGH THE RENDERER · when the old statement is still true, the two simply agree', () => {
  const { renderFor } = buildMemoryCognition(null, {})
  const items = [
    // She knows this happened and cannot open it.
    episode('ep:1', { who: 'Hermes', availability: AVAILABILITY.knownUnreachable, exchanges: [] }),
    // …and a past capability self-report, which is still accurate.
    { id: 'ws:9',
      said: 'I can\'t read those conversations.',
      who: 'me',
      when: '2026-08-21T09:00:00Z',
      source: SOURCE.ownUtterance,
      owner: OWNER.sotera,
      basis: BASIS.attestedBySource,
      availability: AVAILABILITY.recalled,
      retention: RETENTION.notRetained,
      confidence: 0.95,
      timeBound: TIME_BOUND.capability },
  ]
  const out = renderFor(items, { cues })
  // ⓘ The loose line is itself reachable content, so reach is non-zero and the capability report IS marked.
  // ⭐ What §3B.6 guarantees is the OTHER direction, asserted directly on the predicate above: with nothing
  // reachable at all, a capability self-report is left unmarked. Here the honest outcome is that both
  // sentences stand, dated, with nothing removed.
  assert.ok(out.text.includes('I can\'t read those conversations.'), 'verbatim, always')
  assert.match(out.text, /On 21 August I said: I can't read those conversations\./)
  assert.match(out.text, /I know I talked with Hermes/, 'and the unreachable episode is still declared')
  assert.ok(!/(don't|do not) remember/i.test(out.text))
})

test('⛔ a counterpart line saying the same thing is NOT dated as her self-report', () => {
  const { renderFor } = buildMemoryCognition(null, {})
  const items = [episode('ep:1', {
    who: 'Hermes',
    exchanges: [
      // ⭐ Typed by the pipeline, which refuses to type anything that is not hers — so nothing to date here.
      { who: 'Hermes', said: 'You can\'t access those, can you?', when: '2026-08-18T10:00:00Z' },
      { who: 'me', said: 'Let me look.', when: '2026-08-18T10:01:00Z', timeBound: null },
    ],
  })]
  const out = renderFor(items, { cues })
  assert.match(out.text, /Hermes said to me: You can't access those/)
  assert.ok(!/On \d+ \w+ I said: You can't access those/.test(out.text),
    'his claim must never be re-attributed to her as a dated self-report')
  assert.ok(!/I said to Hermes: You can't access those/.test(out.text),
    'nor re-attributed to her by the addressee label')
  assert.deepEqual(out.contradictions, [])
})
