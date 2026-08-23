// WORKING MEMORY · and the thing these tests exist to prove is one sentence:
//
//   ⭐⭐⭐ **THINKING ABOUT SOMETHING AND REMEMBERING SOMETHING ARE TWO DIFFERENT ACTS.**
//
// Ote, giving the go-ahead for Step C: *"none of the investigation automatically becomes retained memory
// merely because it passed through Working Memory. That, to me, is the actual proof we're building Working
// Memory, rather than quietly building another memory store. I'd like the tests to make that distinction
// explicit."*
//
// ⇒ So this file is organised around the loop he specified, and then around every way the layer could
// quietly become a store.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createWorkingMemory, reconcile, HELD, QUESTION, PASSING_THROUGH_IS_NOT_KEEPING,
} from '../../Backend/app/components/memory-working-memory.js'
import {
  AVAILABILITY, BASIS, RETENTION, SOURCE, findIllegalPromotions,
} from '../../Backend/app/components/memory-cognition-axes.js'

const episode = (id, over = {}) => ({
  id, kind: 'episode', withThem: true, who: 'Hermes',
  source: SOURCE.ownUtterance, basis: BASIS.attestedBySource,
  availability: AVAILABILITY.recalled, retention: RETENTION.notRetained, confidence: 0.9,
  ...over,
})

// ══ ⭐⭐⭐ THE LOOP OTE SPECIFIED, END TO END ═══════════════════════════════════════════════════════
test('⭐⭐⭐ investigate → hold an open question → use a tool → update the set → answer', () => {
  const wm = createWorkingMemory({ label: 'How is Hermes doing?' })

  // 1 · cognition activated two episodes.
  wm.recall([episode('ep:1'), episode('ep:2')])
  assert.equal(wm.forReasoning().recollections.length, 2)

  // 2 · ⭐ SHE HOLDS AN UNRESOLVED QUESTION. This is the first representation of a PENDING cognitive state
  // this system has ever had — before it, "still working on this" existed only as a tool-call sequence.
  const q = wm.ask('Did he say anything after the 20 August exchange?', { about: 'Hermes' })
  assert.equal(q.state, QUESTION.open)
  assert.equal(wm.open().length, 1)

  // 3 · she investigates. ⭐ The tool result ENTERS as evidence carrying ITS OWN SCOPE — it does not become
  // a peer of the recollections and it cannot speak for the global state.
  wm.observe({ tool: 'recall_own_history', scope: 'my own past conversations', found: 1, said: 'a later exchange on 21 August' })
  assert.equal(wm.forReasoning().evidence.length, 1)

  // 4 · the working set is UPDATED — the question resolves because the investigation changed what she holds.
  wm.resolve(q.id, { with: 'a later exchange on 21 August' })
  assert.equal(wm.open().length, 0, 'no question is still open')
  assert.equal(wm.contents().find((h) => h.id === q.id).state, QUESTION.resolved)

  // 5 · ⭐⭐⭐ AND NOTHING IS RETAINED. Five steps of real cognitive work, zero retention.
  assert.deepEqual(wm.violations(), [])
  assert.equal(wm.contents().filter((h) => h.retention === RETENTION.retained).length, 0)
  assert.equal(wm.snapshot().retained, 0)
})

test('⭐⭐ …and "remains uncertain" is an ENDING, not a failure', () => {
  // Ote's loop is "resolves OR REMAINS UNCERTAIN → answers". An investigation that does not settle is a
  // legitimate outcome, and it must be expressible without being called an error.
  const wm = createWorkingMemory()
  const q = wm.ask('Is Hermes the same person as Ote?')
  wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', found: 0 })
  const done = wm.resolve(q.id, { uncertain: true, why: 'nothing I can reach settles it' })
  assert.equal(done.state, QUESTION.uncertain)
  assert.equal(wm.open().length, 0, 'uncertain is closed, not open')
  assert.deepEqual(wm.violations(), [])
})

// ══ ⛔⛔ EVERY WAY IT COULD QUIETLY BECOME A STORE ═════════════════════════════════════════════════
test('⛔⛔ ADMISSION FORCES not-retained — whatever it was where it came from', () => {
  // ⭐ THE LOAD-BEARING LINE OF THE MODULE. A durable memory she deliberately kept is still `retained`
  // WHERE IT LIVES; its presence here is not a retention, and the copy held here says so.
  const wm = createWorkingMemory()
  const kept = { id: 'mem:1', said: 'x', source: SOURCE.storedMemory, basis: BASIS.told,
    availability: AVAILABILITY.recalled, retention: RETENTION.retained, confidence: 0.8 }
  const [entry] = wm.recall([kept])
  assert.equal(entry.retention, RETENTION.notRetained, 'working memory never holds a retention')
  // ⭐ …but the fact is not DESTROYED either — "she deliberately kept this" is real and renderable.
  assert.equal(entry.retentionElsewhere, RETENTION.retained)
  // ⛔ AND THE CALLER'S OBJECT IS UNTOUCHED. Mutating it would let a durable memory be silently downgraded
  // by being thought about — the same conflation pointing the other way.
  assert.equal(kept.retention, RETENTION.retained, 'the original must not be mutated')
})

test('⛔⛔ there is NO WAY to retain from here — the API has no such door', () => {
  const wm = createWorkingMemory()
  for (const forbidden of ['persist', 'save', 'flush', 'store', 'write', 'remember', 'retain',
    'commit', 'retentionCandidates', 'importance', 'score', 'rank']) {
    assert.equal(typeof wm[forbidden], 'undefined', `wm.${forbidden}() must not exist`)
  }
})

test('⛔⛔ …and the MODULE cannot reach a store, a model or a request', () => {
  const SRC = readFileSync(new URL('../../Backend/app/components/memory-working-memory.js', import.meta.url), 'utf8')
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')
  // ⭐ The import list is the proof: axes only. A layer that cannot see a database cannot persist to one.
  const imports = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1])
  assert.deepEqual(imports, ['./memory-cognition-axes.js'],
    `working memory must import ONLY the axes, got: ${JSON.stringify(imports)}`)
  assert.ok(!/sequelize|fastify|db\.|txn_|mst_|log_|fetch|ollama|writeFile|appendFile/i.test(code),
    'no store, no model, no filesystem')
  // ⛔ And no module-level accumulation: a registry keyed by conversation IS a cache that becomes memory.
  assert.ok(!/const (cache|registry|store|sessions|byConversation)\s*=\s*new (Map|Set|WeakMap)/.test(code),
    'no module-level registry — nothing may be looked up later')
  // ⛔ NOR any authorization concern. Ote: access_sotera_memory is an utterance boundary, never a cognition
  // or retrieval one, and working memory sits inside cognition.
  assert.ok(!/access_sotera_memory|memoryAccessScope|isRoot|entitled|disclosure/.test(code))
  // ⛔ NOR tool-call counting. "Do not optimize for fewer tool calls" — twice.
  assert.ok(!/callCount|tooMany|budget|throttle|maxTools/i.test(code))
})

test('⛔ it DISPOSES, and disposal is real rather than advisory', () => {
  const wm = createWorkingMemory()
  wm.recall([episode('ep:1')])
  assert.equal(wm.contents().length, 1)
  wm.dispose()
  assert.equal(wm.disposed, true)
  assert.deepEqual(wm.contents(), [], 'contents are dropped, not merely marked')
  // ⛔ And a caller holding a reference cannot keep filling it — which is what stops it becoming a cache.
  assert.throws(() => wm.recall([episode('ep:2')]), /disposed/)
})

test('⛔ contents() and forReasoning() hand out COPIES — the set cannot be mutated from outside', () => {
  const wm = createWorkingMemory()
  wm.recall([episode('ep:1')])
  const got = wm.contents()
  got[0].retention = RETENTION.retained
  got.push({ id: 'smuggled' })
  assert.equal(wm.contents().length, 1, 'no smuggling')
  assert.equal(wm.contents()[0].retention, RETENTION.notRetained, 'no back-door retention')
  assert.deepEqual(wm.violations(), [])
})

test('⛔ two working memories share nothing — no identity, no contents', () => {
  const a = createWorkingMemory({ label: 'a' })
  const b = createWorkingMemory({ label: 'b' })
  a.recall([episode('ep:1')])
  assert.notEqual(a.id, b.id)
  assert.equal(b.contents().length, 0, 'one operation cannot see another\'s working set')
})

// ══ ⭐⭐ EVIDENCE IS EVIDENCE — RFC §3D MADE MECHANICAL ════════════════════════════════════════════
test('⭐⭐⭐ an EMPTY tool result enters carrying its own SCOPE, so it cannot mean "nothing anywhere"', () => {
  const wm = createWorkingMemory()
  wm.recall([episode('ep:1'), episode('ep:2')])
  const ev = wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', found: 0 })
  assert.equal(ev.found, 0)
  assert.equal(ev.scope, 'the things I have kept', 'the population it looked at travels WITH the emptiness')
  // ⭐⭐ AND THE STATE SHE IS HOLDING STILL CONTAINS THE TWO EPISODES. This is the whole point: an empty
  // local result no longer displaces the reconciled set, because there is only ONE set and both are in it.
  const r = wm.forReasoning()
  assert.equal(r.recollections.length, 2)
  assert.equal(r.evidence.length, 1)
})

test('⛔⛔ a tool result is `told`, NEVER attested — so empty results cannot combine into an attested absence', () => {
  const wm = createWorkingMemory()
  const a = wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', found: 0 })
  const b = wm.observe({ tool: 'list_memories', scope: 'the things I have kept', found: 0 })
  assert.equal(a.basis, BASIS.told)
  assert.equal(b.basis, BASIS.told)
  // ⭐ The Hermes rule, arriving here on its own: agreement is synthesis, never attestation.
  assert.equal(reconcile([a, b]).basis, BASIS.synthesized)
})

test('⭐ an empty result is still REACHED — emptiness is a fact she holds, not a failure to reach', () => {
  const wm = createWorkingMemory()
  const ev = wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', found: 0 })
  assert.equal(ev.availability, AVAILABILITY.recalled,
    'she has the result in hand; what it contains is a separate question')
})

// ══ ⭐ RECONCILIATION USES THE SAME LATTICE AS EVERYTHING ELSE ═════════════════════════════════════
test('⭐ reconcile() inherits basis and availability, and retention is ALWAYS not-retained', () => {
  const wm = createWorkingMemory()
  const [e1] = wm.recall([episode('ep:1')])
  const [e2] = wm.recall([episode('ep:2')])
  const r = reconcile([e1, e2])
  assert.equal(r.basis, BASIS.attestedBySource, 'both parents attested ⇒ attestation is INHERITED')
  assert.equal(r.availability, AVAILABILITY.recalled)
  assert.equal(r.retention, RETENTION.notRetained, 'reconciling is thinking, and thinking is not keeping')
})

test('⛔ an OPEN QUESTION asserts nothing, so it may not move a basis', () => {
  const wm = createWorkingMemory()
  const [e] = wm.recall([episode('ep:1', { basis: BASIS.attestedBySource })])
  const q = wm.ask('but did he reply?')
  assert.equal(reconcile([e, q]).basis, BASIS.attestedBySource,
    'a question is excluded — it must neither weaken nor strengthen what is claimed')
  assert.equal(reconcile([q]), null, 'a question alone reconciles to nothing, because nothing is claimed')
})

test('⛔ the lattice guard runs from INSIDE, in production, not only in tests', () => {
  const wm = createWorkingMemory()
  const [parent] = wm.recall([episode('ep:1', { basis: BASIS.inferred })])
  // A derived entry that claims attestation its parent cannot support.
  wm.recall([{ id: 'derived:1', derivedFrom: [parent.id], basis: BASIS.attestedBySource,
    availability: AVAILABILITY.recalled, retention: RETENTION.notRetained, confidence: 0.5 }])
  const v = wm.violations()
  assert.ok(v.some((x) => /illegal promotion/.test(x.why)), `expected a promotion violation, got ${JSON.stringify(v)}`)
})

// ══ ⓘ OBSERVABILITY, WITHOUT BECOMING STORAGE ════════════════════════════════════════════════════
test('ⓘ the snapshot is for the debug trail and carries the RULE beside the data', () => {
  const wm = createWorkingMemory({ label: 'How is Hermes doing?', asOf: '2026-08-23T12:00:00Z' })
  wm.recall([episode('ep:1')])
  wm.ask('did he reply?')
  const s = wm.snapshot()
  assert.equal(s.counts[HELD.recollection], 1)
  assert.equal(s.openQuestions, 1)
  assert.equal(s.retained, 0)
  assert.ok(s.note.includes('Retention is a separate act'))
  // ⛔ AND IT IS NOT A SERIALISATION FOR STORAGE: no content, no ids anything could be re-read by.
  const json = JSON.stringify(s)
  assert.ok(!/said|content|derivedFrom/.test(json), 'a snapshot must not carry the material itself')
})

test('⭐ the rule is exported as a constant, so a check can assert the INTENT not just the code', () => {
  assert.ok(PASSING_THROUGH_IS_NOT_KEEPING.includes('Nothing in it is retained by virtue of being here'))
  assert.ok(PASSING_THROUGH_IS_NOT_KEEPING.includes('no way to perform it'))
})

test('odd input is tolerated without inventing a fact', () => {
  const wm = createWorkingMemory()
  // ⭐ A malformed evidence entry must not throw a turn away — but it also must not claim a count it does
  // not have. `found: null` is the honest value, and it is NOT zero: "I do not know how many" and "none"
  // are different, and conflating them would manufacture an absence.
  const ev = wm.observe(undefined)
  assert.equal(ev.found, null, 'unknown count stays null — never coerced to 0')
  assert.equal(wm.observe({ tool: 'x', found: 'three' }).found, null, 'a non-numeric count is unknown')
  assert.equal(wm.resolve('q:nope', {}), null, 'resolving a question that does not exist is not an error')
  assert.deepEqual(wm.recall(null), [], 'and nothing at all is nothing, not a throw')
  assert.deepEqual(wm.violations(), [])
})

// ══ ⛔⛔ AND THE SIZE QUESTION, WHICH IS THE ONE THE RESEARCH REFERENCE WARNS ABOUT ════════════════
test('⛔⛔ no capacity limit is asserted about HER — the structure transfers, the number does not', () => {
  // ⚠️ The reference doc is explicit: Miller's 7±2 and the 15–20 s window are properties of neural hardware,
  // and *"borrowing the number would be cargo-culting; the structure/control distinction is what transfers."*
  const SRC = readFileSync(new URL('../../Backend/app/components/memory-working-memory.js', import.meta.url), 'utf8')
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')
  assert.ok(!/\b(maxItems|capacity|limit|slice\(0,\s*\d)/i.test(code), 'no cap masquerading as her capacity')
  // ⭐ And it genuinely holds however much it is given — a bound would have to be a deliberate later decision.
  const wm = createWorkingMemory()
  wm.recall(Array.from({ length: 200 }, (_, i) => episode(`ep:${i}`)))
  assert.equal(wm.contents().length, 200)
  assert.deepEqual(wm.violations(), [])
})
