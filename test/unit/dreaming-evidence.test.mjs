// ⭐⭐ THE PER-ROOT EVIDENCE CONSUMER — M2.d.
//
//   node --test test/unit/dreaming-evidence.test.mjs
//
// The assertions are about the property Ote named: the SYSTEM establishes independence, the model does
// not — so the module must never hand out a flat list, and must refuse below the O-2 minimum.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  probeTermsFor, boundExcerpt, admitEvidence,
  DEFAULT_EXCERPT_CHARS, MIN_INDEPENDENT_ROOTS, THE_SYSTEM_COUNTS_THE_ROOTS,
} from '../../Backend/app/components/dreaming-evidence.js'

const row = (conv, content, room = 'r1') =>
  ({ message_id: `m-${conv}-${content.length}`, conversation_id: conv, created_at: '2026-09-01', content, room })

test('⭐ probes come from the slot label, deterministically — ⛔ no model, no embedding', () => {
  assert.deepEqual(probeTermsFor('interaction_preference'), ['interaction', 'preference'])
  assert.deepEqual(probeTermsFor('primary instrument lately'), ['primary', 'instrument', 'lately'])
  // stopwords and short tokens drop out, so a probe cannot be "the"
  assert.deepEqual(probeTermsFor('the user of a'), [])
})

test('⭐ an excerpt is BOUNDED, and the bound is a parameter — 300 is the shape, not the contract', () => {
  const long = 'x'.repeat(1000)
  assert.equal(boundExcerpt(long).length, DEFAULT_EXCERPT_CHARS)
  assert.equal(boundExcerpt(long, 40).length, 40)
  assert.equal(boundExcerpt(null), '')
})

test('⭐⭐⭐ evidence is returned GROUPED BY ROOT — ⛔ never a flat list', () => {
  const r = admitEvidence({ rows: [row('cA', 'one'), row('cA', 'two'), row('cB', 'three')], room: 'r1' })
  assert.equal(r.ok, true)
  assert.equal(r.roots, 2)
  assert.equal(r.buckets.length, 2)
  assert.ok(Array.isArray(r.buckets[0].turns), 'each bucket carries its own turns')
  assert.ok(!('turns' in r), 'there is no flat turn list on the result')
})

test('⭐⭐⭐ the ROOT COUNT is computed here — the model is never handed a total', () => {
  const r = admitEvidence({ rows: [row('cA', 'a'), row('cB', 'b'), row('cC', 'c')], room: 'r1' })
  assert.equal(r.roots, r.buckets.length, 'roots is buckets.length, computed by the system')
})

test('⛔⛔ below two independent roots NOTHING is admitted — and it says whose territory that is', () => {
  const r = admitEvidence({ rows: [row('cA', 'a'), row('cA', 'b'), row('cA', 'c')], room: 'r1' })
  assert.equal(r.ok, false)
  assert.equal(r.roots, 1)
  assert.match(r.why, /Reflection's territory/)
})

test('⛔ a turn with no resolvable root is DROPPED — it cannot support independence', () => {
  const orphan = { ...row('cA', 'a'), conversation_id: null }
  const r = admitEvidence({ rows: [orphan, row('cB', 'b'), row('cC', 'c')], room: 'r1' })
  assert.equal(r.roots, 2, 'the orphan contributes no root')
})

test('⛔ a MIXED-ROOM set is REFUSED, ⛔ not filtered', () => {
  const r = admitEvidence({ rows: [row('cA', 'a', 'r1'), row('cB', 'b', 'r2')] })
  assert.equal(r.ok, false)
  assert.match(r.why, /spans 2 rooms/)
  assert.match(r.why, /refuses a mixed set/)
})

test('⛔ evidence from the wrong room is refused', () => {
  const r = admitEvidence({ rows: [row('cA', 'a', 'r2'), row('cB', 'b', 'r2')], room: 'r1' })
  assert.equal(r.ok, false)
  assert.match(r.why, /not from the requested room/)
})

test('⭐ the minimum is O-2\'s, ⛔ not a tunable', () => {
  assert.equal(MIN_INDEPENDENT_ROOTS, 2)
})

test('the module states its intent in words a person can evaluate', () => {
  assert.match(THE_SYSTEM_COUNTS_THE_ROOTS, /grouped by conversation root and never as a flat list/)
  assert.match(THE_SYSTEM_COUNTS_THE_ROOTS, /Reflection's territory/)
})

// ── ⚠️⚠️ THE GAP THE M2.d DRY RUN MEASURED, PINNED AS A KNOWN LIMIT ──────────────────────────────
// ⓘ Measured 2026-09-01: 4 conversations in this corpus contain a BYTE-IDENTICAL user message, and 44
// distinct texts appear in more than one conversation (max 9). ⇒ conversation-grain roots can be
// INFLATED by a repeated prompt, and this module CANNOT see that.
test('⛔ KNOWN LIMIT: identical content in separate roots still counts as independent', () => {
  const same = 'Take a look at what you have stored.'
  const r = admitEvidence({ rows: [row('cA', same), row('cB', same), row('cC', same)], room: 'r1' })
  assert.equal(r.roots, 3,
    '⚠️ three roots from one repeated prompt — structurally independent, semantically one event. '
    + 'Pinned so that closing it is a deliberate, visible change.')
})
