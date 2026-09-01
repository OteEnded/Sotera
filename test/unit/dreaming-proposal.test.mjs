// ⭐⭐ THE PROPOSITION GRAMMAR AND THE DREAMING RESOLVER — M2.a + M2.b.
//
//   node --test test/unit/dreaming-proposal.test.mjs
//
// The assertions are about MEANING: that a phrase cannot enter a slot, that a global proposition cannot
// count contexts, that no causal or negative form exists, and that the resolver has no write path.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FORMS, T0_FIELDS, PUBLISHABLE_ENTITY_TYPES, QUANTIFIER,
  validateProposal, mayPublish, renderProposal, A_GRAMMAR_NOT_AN_INSTRUCTION,
} from '../../Backend/app/components/dreaming-proposal.js'
import {
  createDreamingResolver, planFor, slotAddressFor, valueOf, CONFLICT, DREAMING_TYPE,
  DREAMING_PROPOSES_THE_LAYER_DECIDES,
} from '../../Backend/app/components/dreaming-resolver.js'

const FREQ = {
  form: 'frequency',
  quantifier: QUANTIFIER.existential,
  slots: { act: 'completed-without-product', n: 72, of: 77 },
}
const EXTENT = {
  form: 'extent',
  quantifier: QUANTIFIER.existential,
  slots: { act: 'reflection', distinct_contexts: 8, max: 28, median: 7 },
}

// ══ THE GRAMMAR IS CLOSED ═════════════════════════════════════════════════════════════════════════

test('a valid proposal validates and renders deterministically', () => {
  assert.equal(validateProposal(FREQ).ok, true)
  assert.equal(renderProposal(FREQ), 'In 72 of 77 of my own acts, completed-without-product occurred.')
})

test('⛔ an unknown form is refused — the grammar is closed', () => {
  const v = validateProposal({ form: 'because', quantifier: 'existential', slots: {} })
  assert.equal(v.ok, false)
  assert.match(v.why, /unknown form/)
})

test('⛔⛔ THERE IS NO CAUSAL FORM AND NO CAUSAL SLOT', () => {
  const names = Object.keys(FORMS).join(' ')
  assert.ok(!/because|cause|why|reason|explain/i.test(names), 'no causal form')
  const allSlots = Object.values(FORMS).flatMap((f) => Object.keys(f.slots)).join(' ')
  assert.ok(!/because|cause|reason/i.test(allSlots), 'no causal slot')
})

test('⛔⛔ THERE IS NO NEGATIVE OR UNIVERSAL QUANTIFIER — #653 makes "no row" ≠ "did not happen"', () => {
  assert.deepEqual(Object.keys(QUANTIFIER), ['existential'])
  for (const q of ['universal', 'negative', 'always', 'never']) {
    const v = validateProposal({ ...FREQ, quantifier: q })
    assert.equal(v.ok, false)
    assert.match(v.why, /asserts an absence/)
  }
})

test('⭐⭐ a PHRASE cannot enter a label slot — vocabulary closure, mechanised', () => {
  const bad = { ...FREQ, slots: { ...FREQ.slots, act: 'she rarely finds anything worth keeping' } }
  const v = validateProposal(bad)
  assert.equal(v.ok, false)
  assert.match(v.why, /where prose hides/)
})

test('⛔ a form\'s slots are ALL-OR-NONE — reporting max without median is refused', () => {
  const partial = { form: 'extent', quantifier: 'existential', slots: { act: 'reflection', distinct_contexts: 8, max: 28 } }
  const v = validateProposal(partial)
  assert.equal(v.ok, false)
  assert.match(v.why, /all-or-none/)
})

test('⛔ an undeclared slot is refused', () => {
  const v = validateProposal({ ...FREQ, slots: { ...FREQ.slots, because: 'tools' } })
  assert.equal(v.ok, false)
  assert.match(v.why, /undeclared/)
})

test('⛔ counts must be non-negative integers', () => {
  assert.equal(validateProposal({ ...FREQ, slots: { ...FREQ.slots, n: 'many' } }).ok, false)
  assert.equal(validateProposal({ ...FREQ, slots: { ...FREQ.slots, n: -1 } }).ok, false)
})

test('⭐ co_occurrence renders ALL its cells — a conditional is a correlation wearing a rule', () => {
  const co = {
    form: 'co_occurrence',
    quantifier: 'existential',
    slots: { a: 'tool-used', b: 'product-written', both: 5, a_only: 0, b_only: 0 },
  }
  const r = renderProposal(co)
  assert.match(r, /5 had both/); assert.match(r, /only tool-used/); assert.match(r, /only product-written/)
})

// ══ THE PUBLICATION ALLOWLIST — A STATIC TYPE CHECK ═══════════════════════════════════════════════

test('⭐ T0 excludes every free-text column, by absence', () => {
  for (const forbidden of ['text', 'reason', 'failure', 'content', 'value', 'summary']) {
    assert.ok(!T0_FIELDS.includes(forbidden), `${forbidden} must not be a T0 field`)
  }
})

test('⭐⭐⭐ a GLOBAL proposition may not count CONTEXTS — counting is disclosing', () => {
  assert.equal(mayPublish(EXTENT, { destination: 'room' }).ok, true)
  const g = mayPublish(EXTENT, { destination: 'persona_global' })
  assert.equal(g.ok, false)
  assert.match(g.why, /may not count context/)
  assert.match(g.why, /counting is disclosing/)
})

test('⭐⭐⭐ …and RECURRENCE is refused globally for the same reason — roots are contexts', () => {
  const rec = {
    form: 'recurrence', quantifier: 'existential',
    slots: { act: 'completed-without-product', independent_roots: 4, of: 77 },
  }
  assert.equal(mayPublish(rec, { destination: 'room' }).ok, true)
  const g = mayPublish(rec, { destination: 'persona_global' })
  assert.equal(g.ok, false, "Dreaming's defining output cannot be global under the smallest-safe rule")
  assert.equal(g.forbidden[0].slot, 'independent_roots')
})

test('⭐ a proposition counting only her ACTS may be global', () => {
  assert.equal(mayPublish(FREQ, { destination: 'persona_global' }).ok, true)
})

test('⛔ the publishable set FAILS CLOSED — only `act`', () => {
  assert.deepEqual([...PUBLISHABLE_ENTITY_TYPES], ['act'])
})

// ══ THE RESOLVER — M2.a's SAFETY BOUNDARY ═════════════════════════════════════════════════════════

test('⛔⛔ commit() ALWAYS returns IGNORE and writes nothing', async () => {
  const r = createDreamingResolver()
  for (const p of [FREQ, EXTENT, { form: 'nonsense' }]) {
    const out = await r.commit(p)
    assert.equal(out.action, CONFLICT.IGNORE)
    assert.equal(out.dryRun, true)
  }
})

test('⭐ 6c reuses the memory layer\'s reserved IGNORE — ⛔ no parallel vocabulary', () => {
  assert.equal(CONFLICT.IGNORE, 'ignore')
})

test('⛔ the resolver module imports no store — there is no write path to disable', async () => {
  const src = await (await import('node:fs/promises')).readFile(
    new URL('../../Backend/app/components/dreaming-resolver.js', import.meta.url), 'utf8')
  const code = src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')
  assert.ok(!/store\.|txn_memories|INSERT|UPDATE |commitCard/.test(code), 'no store access in the resolver')
})

test('Dreaming has its own type — ⛔ not `card`', () => {
  assert.equal(DREAMING_TYPE, 'dreaming')
  assert.notEqual(DREAMING_TYPE, 'card')
})

// ══ planFor — RECALL → RESOLVE → PLAN, WITH ITS REASONING ═════════════════════════════════════════

test('⭐ NEW when the slot is empty, and it says why', () => {
  const r = planFor({ proposal: FREQ, matches: [] })
  assert.equal(r.ok, true); assert.equal(r.plan.action, CONFLICT.NEW); assert.equal(r.wire, 'add')
  assert.match(r.why, /nothing to compare against/)
  assert.equal(r.recalled.count, 0)
})

test('⭐ NOOP when the slot already says exactly this', () => {
  // ⚠️ `value`, NOT `content`: `reconcilePlan` compares `existing.value`, and a fixture that set the
  // wrong field would have made this test pass for the wrong reason. Caught by the DUPLICATE case.
  const existing = { id: 'm1', value: valueOf(FREQ), created_at: '2026-09-01' }
  const r = planFor({ proposal: FREQ, matches: [existing] })
  assert.equal(r.plan.action, CONFLICT.NOOP)
  assert.equal(r.plan.reinforce, true)
  assert.equal(r.plan.write, false, 'a NOOP must not write')
  assert.match(r.why, /already says exactly this/)
})

test('⭐⭐ UPDATE when the slot holds a DIFFERENT value — and it supersedes rather than edits', () => {
  const older = { id: 'm1', value: 'In 5 of 77 of my own acts, completed-without-product occurred.', created_at: '2026-08-01' }
  const r = planFor({ proposal: FREQ, matches: [older] })
  assert.equal(r.plan.action, CONFLICT.UPDATE)
  assert.equal(r.plan.supersedes, 'm1')
  assert.equal(r.plan.write, true)
  assert.match(r.why, /supersedes it and history is kept/)
})

test('⭐ DUPLICATE collapses extras in the same slot', () => {
  const v = valueOf(FREQ)
  const r = planFor({ proposal: FREQ, matches: [{ id: 'a', value: v }, { id: 'b', value: v }] })
  assert.equal(r.plan.action, CONFLICT.DUPLICATE)
  assert.deepEqual(r.plan.collapse, ['b'])
})

test('⛔ a publication refusal is its OWN stage — never mistaken for "already known"', () => {
  const r = planFor({ proposal: EXTENT, matches: [], destination: 'persona_global' })
  assert.equal(r.ok, false)
  assert.equal(r.stage, 'publication')
  assert.equal(r.plan, null)
})

test('⛔ a grammar refusal is its own stage too', () => {
  const r = planFor({ proposal: { form: 'because' }, matches: [] })
  assert.equal(r.stage, 'grammar')
})

test('the slot address is marked as a dry-run convention, not a decision', async () => {
  const a = slotAddressFor(FREQ)
  assert.equal(a.entity, 'sotera')
  assert.match(a.attribute, /^dreaming:frequency:/)
  const src = await (await import('node:fs/promises')).readFile(
    new URL('../../Backend/app/components/dreaming-resolver.js', import.meta.url), 'utf8')
  assert.match(src, /DRY-RUN CONVENTION/, 'the convention must say it is not a semantic decision')
})

test('both modules state their intent in words a person can evaluate', () => {
  assert.ok(A_GRAMMAR_NOT_AN_INSTRUCTION.length > 200)
  assert.match(A_GRAMMAR_NOT_AN_INSTRUCTION, /never writes a sentence/)
  assert.match(DREAMING_PROPOSES_THE_LAYER_DECIDES, /Dreaming did not withdraw anything/)
})
