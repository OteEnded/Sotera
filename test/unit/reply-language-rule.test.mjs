// ⭐ F1 — the reply language has a rule, and the identity line is no longer a standing Thai cue. (Ote, 2026-09-15.)
//
// ⛔ THIS TESTS THE COMPOSED PROMPT, NOT THE SOURCE. A grep for the constant would pass while the part was never added —
// `source-scan-anchor-can-go-vacuous`. Every assertion below reads what `composeSystemContext` actually produced.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { composeSystemContext, DEFAULT_ASSISTANT_IDENTITY, REPLY_LANGUAGE_RULE } from '../../Backend/app/components/context-composer.js'

const THAI = /[฀-๿]/
const compose = (over = {}) => composeSystemContext({ user: { username: 'agent_dev' }, timezone: 'Asia/Bangkok', toolsOn: false, ...over })
// ⓘ `parts` is METADATA ({key, chars, authority, scope}); the assembled prompt is `system`. Read each from where it lives.
const textOf = (out) => String(out.system ?? '')
const partOf = (out, key) => (out.parts ?? []).find((p) => p.key === key)

test('L1 · the reply-language rule is IN the composed prompt, and says where a language signal may NOT come from', () => {
  const out = compose()
  const whole = textOf(out)
  assert.ok(whole.includes(REPLY_LANGUAGE_RULE), 'the rule text reached the prompt')
  assert.match(REPLY_LANGUAGE_RULE, /language of the user's current message/i)
  // the load-bearing half: context is content, not a language signal
  assert.match(REPLY_LANGUAGE_RULE, /memories.*not a language-selection signal/is)
})

test('L2 · ⭐⭐ a CUSTOM assistant identity cannot take the language rule with it — it is its own part', () => {
  const custom = compose({ assistantIdentity: 'You are Atlas. You are terse.' })
  const whole = textOf(custom)
  assert.ok(whole.includes(REPLY_LANGUAGE_RULE), 'the rule survives a replaced identity')
  assert.ok(!whole.includes('You are Sotera.'), 'the custom identity really did replace the default (⛔ a vacuous control otherwise)')
  // and with the identity switched OFF entirely ('' is the documented off switch)
  assert.ok(textOf(compose({ assistantIdentity: '' })).includes(REPLY_LANGUAGE_RULE), 'the rule survives an EMPTY identity too')
})

test('L3 · the rule is classified as a grounding PRINCIPLE at foundational authority, ⛔ not a style preference', () => {
  const p = partOf(compose(), 'reply-language')
  assert.ok(p, 'the part exists under its own key')
  assert.equal(p.authority, 'foundational')
  assert.equal(p.scope, 'principle')
})

test('L4 · ⭐⭐⭐ the Thai guidance is CONDITIONAL — the standing cue on every prompt for every user is gone', () => {
  assert.ok(THAI.test(DEFAULT_ASSISTANT_IDENTITY), 'the Thai guidance still EXISTS (⛔ this fix is not deletion)')
  // the defect: an unconditional "in Thai that means …" arriving in every prompt
  assert.doesNotMatch(DEFAULT_ASSISTANT_IDENTITY, /she\/her;\s*in Thai that means/i,
    '⛔ the unconditional form is back — this is the exact sentence that made every prompt carry a Thai instruction')
  assert.match(DEFAULT_ASSISTANT_IDENTITY, /when you are replying in Thai/i, 'it is now conditional on actually replying in Thai')
  // the rest of the identity is untouched
  assert.match(DEFAULT_ASSISTANT_IDENTITY, /You are Sotera\. You are female/)
  assert.match(DEFAULT_ASSISTANT_IDENTITY, /keep their voice/, 'the drafted-words clause survives')
})

test('L5 · ⛔ the rule itself carries no Thai — a rule about language must not be a language cue', () => {
  assert.ok(!THAI.test(REPLY_LANGUAGE_RULE), 'the reply-language rule is script-neutral')
})
