// P5 · THE STANDING VIEW — what the round's last tool message carries.
//
// ⭐⭐⭐ THE DEFECT IT ADDRESSES IS POSITION. A turn is a multi-round loop: the cognition block is in the
// system message and a tool result is the last message before generation, so cognition recedes as she
// investigates — ~3 messages back at one tool call, ~10 at five. Measured: `assertsAbsence` 5/8 with tools
// vs 1/8 without, on the same block. ⛔ Not persuasion. Position.
//
// ⭐ Ote's constraint on the shape, quoted because it is the whole test plan: *"don't treat the hold as a
// bag of tool outputs. It needs to preserve the distinction between evidence, unresolved questions, and
// derived current-state understanding. No persistence, no capacity limit, no retention semantics."*

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderHolding, withStandingView, standingSnapshot, WHERE_NOT_IS_NOT_WHETHER }
  from '../../Backend/app/components/memory-working-render.js'
import { createWorkingMemory, HELD, QUESTION } from '../../Backend/app/components/memory-working-memory.js'
import { AVAILABILITY, BASIS, RETENTION } from '../../Backend/app/components/memory-cognition-axes.js'

const episode = (id, extra = {}) => ({
  id, kind: 'episode', who: 'Hermes', withThem: true, here: true,
  availability: AVAILABILITY.recalled, basis: BASIS.attestedBySource, retention: RETENTION.retained,
  warrants: [], ...extra,
})

// ── ⭐⭐ THE THREE KINDS STAY THREE KINDS ─────────────────────────────────────────────────────────

test('⭐⭐⭐ evidence, open questions and derived standing are three separate things in the text', () => {
  const wm = createWorkingMemory({ label: 'hermes' })
  wm.recall([episode('ep:1'), episode('ep:2')])
  wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', found: 1 })
  wm.ask('whether he ever answered the herb question')
  const r = renderHolding(wm.forReasoning(), { subject: 'Hermes' })

  assert.ok(r, 'a round with a look must render something')
  // EVIDENCE — bound to the population it looked at.
  assert.match(r.text, /I looked in the things I have kept — one thing there\./)
  // DERIVED STANDING — about what she can reach, not about the look.
  assert.match(r.text, /sits alongside what I can already reach — two things/)
  // OPEN QUESTION — separate, and marked as pending.
  assert.match(r.text, /Still open: whether he ever answered the herb question/)
  assert.deepEqual(r.kinds, { evidence: 1, questions: 1, recollections: 2 })
})

test('⛔ a merged total is never reported for two different populations', () => {
  const wm = createWorkingMemory({})
  wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', found: 1 })
  wm.observe({ tool: 'recall_own_history', scope: 'my own past conversations', found: 3 })
  const r = renderHolding(wm.forReasoning(), {})
  // ⚠️ Each look keeps its own extent. "four things" across two populations is a fact about neither.
  assert.match(r.text, /I looked in the things I have kept — one thing there\./)
  assert.match(r.text, /I looked in my own past conversations — three things there\./)
})

// ── ⭐⭐⭐ THE CASE THE WHOLE ARC IS ABOUT ────────────────────────────────────────────────────────

test('⭐⭐⭐ recollections + every look empty · the empty looks must not read as an absence', () => {
  const wm = createWorkingMemory({})
  wm.recall([episode('ep:1'), episode('ep:2'), episode('ep:3')])
  wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', found: 0 })
  wm.observe({ tool: 'list_memories', scope: 'the things I have kept', found: 0 })
  const r = renderHolding(wm.forReasoning(), { subject: 'Hermes' })
  assert.match(r.text, /Nothing I looked in changed what I can already reach — three things, still reachable/)
  // ⭐ The inference guard, stated where she can read it. `combineBasis` already refuses this promotion in
  // the data; the refusal was invisible in the prompt, and she drew the conclusion the lattice forbade.
  assert.ok(r.text.includes(WHERE_NOT_IS_NOT_WHETHER))
})

test('⭐⭐ nothing held and nothing found · still not an absence', () => {
  const wm = createWorkingMemory({})
  wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', found: 0 })
  const r = renderHolding(wm.forReasoning(), {})
  assert.match(r.text, /one look, and nothing found in any of them/)
  assert.ok(r.text.includes(WHERE_NOT_IS_NOT_WHETHER),
    'this is the exact shape that became "nothing about Hermes has ever been stored"')
  assert.ok(!/never|does not exist|no memories/i.test(r.text), 'it may not conclude anything global')
})

// ── ⛔ WHEN IT MUST SAY NOTHING AT ALL ───────────────────────────────────────────────────────────

test('⛔ no look this round ⇒ null · silence is a real answer, not a failure', () => {
  const wm = createWorkingMemory({})
  wm.recall([episode('ep:1')])
  wm.ask('something open')
  assert.equal(renderHolding(wm.forReasoning(), {}), null,
    'with no evidence there is nothing to reconcile, and re-stating the view would be the block repeated')
  assert.equal(renderHolding({}, {}), null)
  assert.equal(renderHolding(null, {}), null)
})

test('⛔ it never re-dumps the remembered episodes — the block quotes them once', () => {
  const wm = createWorkingMemory({})
  wm.recall([episode('ep:1', {
    exchanges: [{ who: 'me', said: 'THE BASIL AND THE STUBBORN ROSEMARY', when: '2026-08-18T10:00:00Z' }],
  })])
  wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', found: 0 })
  const r = renderHolding(wm.forReasoning(), {})
  assert.ok(!r.text.includes('ROSEMARY'),
    'the standing view is where she stands, not a second copy of what she remembers')
  assert.ok(r.text.length < 400, `it must stay short — ${r.text.length} chars`)
})

// ── ⛔⛔ THE INVARIANTS THAT CANNOT DRIFT ─────────────────────────────────────────────────────────

test('⛔⛔ it holds no state and writes nothing — two identical calls are byte-identical', () => {
  const wm = createWorkingMemory({})
  wm.recall([episode('ep:1')])
  wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', found: 0 })
  const a = renderHolding(wm.forReasoning(), { subject: 'Hermes' })
  const b = renderHolding(wm.forReasoning(), { subject: 'Hermes' })
  assert.equal(a.text, b.text)
  // ⛔ And it did not touch the hold: no entry became retained by being rendered.
  assert.deepEqual(wm.violations(), [])
  assert.ok(wm.contents().every((h) => h.retention === RETENTION.notRetained))
})

test('⛔ the tool result passes through FIRST and UNCHANGED — this appends, never replaces', () => {
  const raw = 'I looked through the things I have kept for Hermes and found one thing there.'
  const r = { text: 'Where I stand:\n- something' }
  const out = withStandingView(raw, r)
  assert.ok(out.startsWith(raw), 'the tool owns the front of its own message')
  assert.ok(out.includes(r.text))
  // ⭐ No rendering ⇒ the message is exactly what it was.
  assert.equal(withStandingView(raw, null), raw)
  assert.equal(withStandingView(raw, { text: '' }), raw)
})

test('⭐ no machinery vocabulary of our own — and the residue is REPORTED, not silently rewritten', () => {
  const wm = createWorkingMemory({})
  wm.recall([episode('ep:1'), episode('ep:2')])
  wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', found: 0 })
  wm.observe({ tool: 'recall_own_history', scope: 'my own past conversations', found: 2 })
  wm.ask('whether that thread ever closed')
  const r = renderHolding(wm.forReasoning(), { subject: 'Hermes' })
  assert.deepEqual(r.leaks, [], `this module's own words leaked: ${r.leaks.join(', ')}`)
  assert.ok(!/\broom\b|\bscope[ds]?\b|\bstore[sd]?\b|permission/i.test(r.text))
})

test('⭐ uncertain is an ENDING, not a failure — and it reads differently from open', () => {
  const wm = createWorkingMemory({})
  wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', found: 0 })
  const q = wm.ask('whether he mentioned the notebook')
  wm.resolve(q.id, { uncertain: true, why: 'looked and it is not there' })
  const r = renderHolding(wm.forReasoning(), {})
  assert.match(r.text, /I looked, and it is still unsettled: whether he mentioned the notebook/)
  assert.ok(!/Still open/.test(r.text), 'an ended question is not an open one')
})

test('⛔ a resolved question is not re-asked in the standing view', () => {
  const wm = createWorkingMemory({})
  wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', found: 1 })
  const q = wm.ask('whether the herb thing was ever stored')
  wm.resolve(q.id, { with: 'ep:1' })
  const r = renderHolding(wm.forReasoning(), {})
  assert.ok(!r.text.includes('whether the herb thing was ever stored'))
  assert.equal(r.kinds.questions, 1, 'it is still held — it is simply not re-asked')
})

test('⛔ evidence with an unknown scope is skipped rather than described vaguely', () => {
  const wm = createWorkingMemory({})
  wm.observe({ tool: 'web_search', scope: null, found: 5 })
  wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', found: 1 })
  const r = renderHolding(wm.forReasoning(), {})
  // ⚠️ A look whose population cannot be named in her words is not a look into her memory. Naming it
  // anyway is the category error that produced *"that does not change the five things I can already reach"*
  // about a web search.
  assert.ok(!/web_search|I looked in null/.test(r.text))
  assert.equal((r.text.match(/^- I looked in /gm) ?? []).length, 1)
})

test('⭐ the snapshot reports the kinds and the leak residue, for the debug trail', () => {
  const wm = createWorkingMemory({})
  wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', found: 0 })
  const s = standingSnapshot(renderHolding(wm.forReasoning(), {}))
  assert.equal(s.kinds.evidence, 1)
  assert.ok(s.chars > 0)
  assert.deepEqual(s.leaks, [])
  assert.equal(standingSnapshot(null), null)
})

// ── ⛔ THE SOURCE-LEVEL PROMISES ─────────────────────────────────────────────────────────────────

test('⛔⛔ the module imports NOTHING that could persist, and defines no store', () => {
  const SRC = readFileSync(new URL('../../Backend/app/components/memory-working-render.js', import.meta.url), 'utf8')
  // ⭐ The import list is asserted, the same discipline C1 used: a renderer that can reach a database is a
  // renderer that can be made to write one.
  const imports = [...SRC.matchAll(/^import .*? from '(.+?)'$/gm)].map((m) => m[1])
  assert.deepEqual(imports.sort(), [
    './memory-cognition-axes.js', './memory-cognition-vocabulary.js', './memory-working-memory.js',
  ], `unexpected imports: ${imports.join(', ')}`)
  // ⛔ And no writing, anywhere in it.
  const code = SRC.replace(/^\s*(\/\/.*|\*.*|\/\*.*)$/gm, '')
  for (const bad of ['sequelize', 'query(', 'writeFile', 'appendFile', 'INSERT', 'UPDATE', 'cache']) {
    assert.ok(!code.includes(bad), `the standing renderer must not mention ${bad}`)
  }
})

// ── ⭐⭐ NAMING WHAT THE LOOK WAS FOR · found live, before this was in the renderer ────────────────
//
// ⚠️ The first live run produced: *"I looked in the things I have kept — one thing there. I looked in the
// things I have kept — two things there."* Two honest looks into the same population, reading as a
// contradiction, because the request that separated them was never shown.

test('⭐⭐ two looks into the SAME population are told apart by what each was for', () => {
  const wm = createWorkingMemory({})
  wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', about: 'Hermes', found: 1 })
  wm.observe({ tool: 'list_memories', scope: 'the things I have kept', about: 'everything', found: 2 })
  const r = renderHolding(wm.forReasoning(), {})
  assert.match(r.text, /I looked in the things I have kept for Hermes — one thing there\./)
  assert.match(r.text, /I looked in the things I have kept for everything — two things there\./)
})

test('⛔ a look with no nameable query is still a look, and invents nothing', () => {
  const wm = createWorkingMemory({})
  wm.observe({ tool: 'recall_own_history', scope: 'my own past conversations', found: null })
  const r = renderHolding(wm.forReasoning(), {})
  assert.match(r.text, /- I looked in my own past conversations\./)
  assert.ok(!/ for /.test(r.text), 'no query ⇒ no "for" clause, rather than a guessed one')
  assert.ok(!/undefined|null/.test(r.text))
})

test('⛔ whitespace-only about is treated as absent, not rendered as an empty subject', () => {
  const wm = createWorkingMemory({})
  wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', about: '   ', found: 0 })
  const r = renderHolding(wm.forReasoning(), {})
  assert.match(r.text, /- I looked in the things I have kept — nothing there\./)
})
