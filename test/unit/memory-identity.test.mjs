// Identity INTERPRETATION — the module that decides what becomes Ote's name.
//
//   node --test test/unit/
//
// ⚠️ THIS FILE EXISTS BECAUSE ITS ABSENCE COST FOUR JUNK NAMES. OteLLMServices has a unit suite for this
// exact module and Sotera was cloned WITHOUT it — so the same code shipped here with no test at all, and
// the first night of real conversation filed three fragments of Ote's own prose as his name. Carrying the
// code and leaving the test is how a module arrives already broken.
//
// The suite below is OLS's, plus the live failures. Read the "LIVE FAILURE" block in
// PortableComponents/Packages/Memory/cognition/memory-identity.js for why each guard exists.
//
// ⚠️ THIS MODULE IS NOW THE FLOOR, NOT THE MECHANISM (RFC step 4, 2026-08-12). `interpretIdentityLlm`
// reads the turn first and speaks nine languages; these patterns catch English when the model is off,
// unavailable, or unsure. RFC step 5 deletes this file — and this suite with it — but ONLY after
// repro/identity-multilingual.mjs proves the model in Thai against a live model.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretIdentity, identityPlan, IDENTITY_ATTR, IDENTITY_NAMESPACE } from '@ote/memory/cognition/memory-identity.js'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE FOUR THAT ACTUALLY HAPPENED — 2026-08-10, Ote's first conversations with Sotera.
// Every one of these was stored as `preferred_name`, importance 9, and shown to him as a fact
// about himself. He never stated a name in any of them.
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('LIVE: "hi, this is your starting point…" is not a name (stored twice as "Your Starting" @0.8)', () => {
  assert.equal(interpretIdentity('hi, this is your starting point of being something. how are you right now'), null)
})

test('LIVE: "im i phasing it right?" is not a name (stored as "I Phasing" @0.9)', () => {
  // a TYPO for "phrasing", inside a QUESTION ABOUT WORDING — and it outranked his real profile name
  assert.equal(interpretIdentity('im i phasing it right? i just fimilar in thai, it goes like โรมไม่ได้สร้างเสร็จในวันเดียว'), null)
})

test('LIVE: quoting HER OWN sentence back is not a self-introduction (stored as "Being Your" @0.9)', () => {
  const real = '"But if I\'m being your daughter looking out for her dad..." no need to "if" you be you, you dicide what you would think.'
  assert.equal(interpretIdentity(real), null)
  // both guards must hold this independently — the quote span AND the pronoun in the capture
  assert.equal(interpretIdentity("I'm being your daughter"), null, 'pronoun guard alone')
  assert.equal(interpretIdentity('"I\'m Claude"'), null, 'quote-span guard alone, on a value that would otherwise pass')
})

test('LIVE-ADJACENT: his own words, one letter away from another false name', () => {
  // "i kinda want to build rome in one day" — had he typed it the other way round it would have
  // become his name, because neither token is in any deny-list. Capital evidence is what stops it.
  assert.equal(interpretIdentity('im building rome'), null)
  assert.equal(interpretIdentity('im writing docs today'), null)
  assert.equal(interpretIdentity('i am testing sotera'), null)
})

test('the guards are three, and each stands alone', () => {
  assert.equal(interpretIdentity("I'm your friend"), null, 'pronoun anywhere in the capture')
  assert.equal(interpretIdentity("I'm starting over"), null, 'no capital evidence on a fuzzy pattern')
  assert.equal(interpretIdentity('he said "my name is Rex"'), null, 'inside quote marks')
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// STILL WORKS — the whole point is precision, not deafness.
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('discovery: "Hi, I\'m Claude." → assert / preferred_name = Claude', () => {
  const o = interpretIdentity("Hi, I'm Claude.")
  assert.ok(o, 'should recognise the self-introduction')
  assert.equal(o.type, 'identity')
  assert.equal(o.attribute, IDENTITY_ATTR.preferredName)
  assert.equal(o.value, 'Claude')
  assert.equal(o.intent, 'assert')
  assert.ok(o.confidence >= 0.9)
})

test('EXPLICIT intent needs no capital: "call me ote" is honoured as typed', () => {
  // Ote types in lowercase constantly. The explicit forms say what they mean, so they must not
  // demand a capital — that requirement belongs only to the fuzzy family.
  assert.equal(interpretIdentity('call me ote')?.value, 'Ote')
  assert.equal(interpretIdentity('my name is john')?.value, 'John')
  assert.equal(interpretIdentity('i go by ote')?.value, 'Ote')
  assert.equal(interpretIdentity('address me as ote')?.value, 'Ote')
})

test('CASELESS SCRIPTS ARE NOT PENALISED — Thai has no capitals', () => {
  // The capital-evidence rule must never mean "Latin names only". Ote writes Thai.
  assert.equal(interpretIdentity("i'm สมชาย")?.value, 'สมชาย')
  assert.equal(interpretIdentity('my name is สมชาย')?.value, 'สมชาย')
  assert.equal(interpretIdentity("i'm 王伟")?.value, '王伟')
})

test('discovery: "my name\'s Jack" contraction', () => {
  assert.equal(interpretIdentity("my name's Jack")?.value, 'Jack')
})

test('preference: "call me Ote" → prefer-address', () => {
  const o = interpretIdentity('call me Ote')
  assert.ok(o)
  assert.equal(o.value, 'Ote')
  assert.equal(o.intent, 'prefer-address')
  assert.equal(o.confidence, 0.99)
})

test('preference variants: please/you-can/go-by/address-me-as', () => {
  assert.equal(interpretIdentity('please call me Rex')?.value, 'Rex')
  assert.equal(interpretIdentity('you can call me Sam')?.value, 'Sam')
  assert.equal(interpretIdentity('I go by Alex')?.value, 'Alex')
  assert.equal(interpretIdentity('I go by Alex')?.intent, 'prefer-address')
  assert.equal(interpretIdentity('address me as Morgan')?.value, 'Morgan')
})

test('two-token name: "my name is John Smith"', () => {
  assert.equal(interpretIdentity('my name is John Smith')?.value, 'John Smith')
})

test('greeting form: "hi this is Ote" (message start only)', () => {
  assert.equal(interpretIdentity('hi this is Ote')?.value, 'Ote')
  assert.equal(interpretIdentity('hi this is Ote')?.confidence, 0.8)
  assert.equal(interpretIdentity('I think this is great'), null)
})

test('trailing clause is trimmed: "I\'m John and I love Go"', () => {
  assert.equal(interpretIdentity("I'm John and I love Go")?.value, 'John')
})

test('NEGATIVE: feelings/states are not names', () => {
  assert.equal(interpretIdentity("I'm tired"), null)
  assert.equal(interpretIdentity("I'm not sure"), null)
  assert.equal(interpretIdentity('I am going home'), null)
  assert.equal(interpretIdentity("I'm back"), null)
  assert.equal(interpretIdentity("I'm good, thanks"), null)
})

test('NEGATIVE: "call me back later" does not capture "back"', () => {
  assert.equal(interpretIdentity('call me back later'), null)
})

test('NEGATIVE: no identity content, questions, empty', () => {
  assert.equal(interpretIdentity('what is the weather today?'), null)
  assert.equal(interpretIdentity("what's your name?"), null)
  assert.equal(interpretIdentity(''), null)
  assert.equal(interpretIdentity(null), null)
  assert.equal(interpretIdentity(undefined), null)
})

test('the reserved namespace constant is stable', () => {
  assert.equal(IDENTITY_NAMESPACE, 'identity')
  assert.equal(IDENTITY_ATTR.preferredName, 'preferred_name')
})

// --- Identity Resolver adoption decision (RFC §7: discovery-silent / change-defer) ---

test('identityPlan: empty slot → adopt (discovery, silent)', () => {
  const p = identityPlan(null, { value: 'Claude' })
  assert.equal(p.action, 'adopt')
  assert.equal(p.value, 'Claude')
})

test('identityPlan: same value → noop (case/space-insensitive)', () => {
  assert.equal(identityPlan('Claude', { value: 'claude' }).action, 'noop')
  assert.equal(identityPlan('John Smith', { value: '  john   smith ' }).action, 'noop')
})

test('identityPlan: different value → defer (never silently overwrite an address)', () => {
  const p = identityPlan('Claude', { value: 'Rex' })
  assert.equal(p.action, 'defer')
  assert.equal(p.from, 'Claude')
  assert.equal(p.value, 'Rex')
})

test('LIVE-FOUND: natural phrasings do not swallow a trailing connective', () => {
  assert.equal(interpretIdentity("hey, morning. I'm Wren by the way — I don't think we've met")?.value, 'Wren', 'the real sentence a person typed')
  assert.equal(interpretIdentity("I'm Wren by the way")?.value, 'Wren')
  assert.equal(interpretIdentity("I'm Dana though")?.value, 'Dana')
  assert.equal(interpretIdentity('my name is Sam anyway')?.value, 'Sam')
  assert.equal(interpretIdentity('call me Ash again')?.value, 'Ash')
})

test('LIVE-FOUND: a name never spans a sentence boundary', () => {
  assert.equal(interpretIdentity("hey — I'm Tomas. finally getting around to using this properly.")?.value, 'Tomas')
  assert.equal(interpretIdentity("I'm Jo! ok what next")?.value, 'Jo')
  assert.equal(interpretIdentity('my name is Sam, anyway moving on')?.value, 'Sam')
  assert.equal(interpretIdentity("I'm Ana — nice to meet you")?.value, 'Ana')
  assert.equal(interpretIdentity('my name is John Smith')?.value, 'John Smith')
  assert.equal(interpretIdentity("I'm Anne-Marie O'Brien")?.value, "Anne-Marie O'Brien")
})
