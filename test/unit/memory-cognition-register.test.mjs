// LEAK 2 · DOES HER MEMORY READ AS HERS, OR AS A DOCUMENT SOMEONE HANDED HER?
//
// ⭐⭐⭐ EVERY META-REFERENCE TESTED BELOW IS SOMETHING SHE ACTUALLY SAID across five live runs on
// 2026-08-21: *"I do know from the context above"*, *"the system context tells me"*, *"the content is
// already provided in my current context"*, and the worst one — *"the summaries you pasted above"*, which
// attributes her own memory to **Ote having pasted it**.
//
// ⭐ These are a DIFFERENT class from the implementation words. Those are our machinery leaking (room,
// scope, inspect_around). These are the payload's SHAPE leaking: it had a title, bullets, transcript labels
// and a parenthesised audit footer, so she narrated it as the document it looked like.
//
// ⛔ AND THE OVERCORRECTION IS TESTED TOO. Ote: *"Don't overcorrect by forcing fake first-person memories
// either. Natural does not mean pretending certainty. If something is an inference, she should still
// experience/express it as an inference."* ⇒ the second half of this file asserts that every phrase is
// DERIVED FROM AN AXIS, so the distinctions survive the register change.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  findMetaReferences, readsAsRecollection, META_REFERENCE_WORDS, findImplementationLeaks,
} from '../../Backend/app/components/memory-cognition-vocabulary.js'

// ── ⭐⭐ WHAT SHE SAID, CAUGHT ──────────────────────────────────────────────────────────────────────
test('⭐⭐ the exact meta-references she used are caught', () => {
  for (const said of [
    'I do know from the context above that I have talked with Hermes',
    'the system context tells me there is data about him',
    'Not beyond what is already on file — the summaries you pasted above cover it',
    'the content is already provided in my current context, so I do not need to keep digging',
  ]) {
    assert.ok(findMetaReferences(said).length > 0, `not caught: "${said.slice(0, 44)}…"`)
  }
})

// ── ⛔ THE TWO STRUCTURAL TELLS, WHICH ARE NOT WORDS AT ALL ────────────────────────────────────────
test('⛔ a TITLE makes the rest of the block its contents — caught structurally', () => {
  const withTitle = 'What I have about Hermes:\nI remember talking with him on 18 August.'
  assert.ok(findMetaReferences(withTitle).some((h) => h.kind === 'title'),
    'a colon-terminated first line is a heading, and a heading makes everything under it "the contents"')
})

test('⛔ a parenthesised last line reads as an audit footer appended by a system', () => {
  const withFooter = 'I remember talking with him.\n(Searched: everything I currently have available.)'
  assert.ok(findMetaReferences(withFooter).some((h) => h.kind === 'audit-footer'))
})

test('⭐⭐⭐ the recollection register passes — no title, no bullets, no footer', () => {
  const block = [
    'I remember talking with Hermes on 18 August.',
    '  Hermes said: Hi Sotera, I am Hermes.',
    '  I said: I only have one thing on file about you.',
    'I know I talked with Kavi around 19 August, and I cannot get back to what was said.',
    'That is what I can reach on this right now: everything I currently have available.',
  ].join('\n')
  assert.equal(readsAsRecollection(block), true,
    `should read as recollection: ${JSON.stringify(findMetaReferences(block))}`)
  assert.deepEqual(findImplementationLeaks(block), [],
    'and the register change must not have reintroduced machinery words')
})

test('⛔ the absence sentence is an act of looking, not a claim about the world', () => {
  const none = 'I went looking for what I have about Hermes and came up with nothing.'
  assert.equal(readsAsRecollection(none), true)
  assert.deepEqual(findImplementationLeaks(none), [])
  // ⛔ NOT "I have nothing about Hermes" — that is a claim about what exists rather than about what she did,
  // and the searched-set principle exists precisely because she once made the stronger claim wrongly.
  assert.match(none, /went looking/i)
})

test('the meta list stays machine-checkable', () => {
  assert.ok(META_REFERENCE_WORDS.length > 15)
  assert.equal(new Set(META_REFERENCE_WORDS).size, META_REFERENCE_WORDS.length, 'no duplicates')
  for (const w of META_REFERENCE_WORDS) assert.equal(w, w.toLowerCase())
})

test('⛔ the scan is for what WE write — it never policies her speech', () => {
  // She is allowed to talk about context windows when the question is about context windows.
  assert.deepEqual(findMetaReferences(''), [])
  assert.deepEqual(findMetaReferences(null), [])
})

// ── ⭐⭐⭐ THE OVERCORRECTION GUARD: EVERY PHRASE IS DERIVED FROM AN AXIS ───────────────────────────
//
// ⛔ THIS IS THE ONE THAT KEEPS LEAK 2 HONEST. The register change is only safe if the wording is SELECTED
// BY the epistemic state rather than chosen for how it sounds. If a future edit picks a phrase for style,
// the axis stops being load-bearing and "natural" quietly becomes "confident".
const HOST = readFileSync(new URL('../../Backend/app/components/memory-cognition-host.js', import.meta.url), 'utf8')
const RENDER_RAW = HOST.slice(HOST.indexOf('function render({ cues, kept, dropped, searched })'),
  HOST.indexOf('RE-RENDER A FILTERED SET'))
// ⚠️⚠️ CODE ONLY, AND THIS IS THE THIRD TIME THE SAME MISTAKE HAS BEEN CAUGHT. The negative assertions
// below failed on COMMENTS: the renderer contains the line `⛔ Never "I don't remember"` — a comment that
// quotes the forbidden phrase precisely in order to forbid it — and another describing the container header
// it replaced. ⛔ A scan that punishes a file for naming what it refuses is backwards, and it also destroys
// the most useful comments in the file.
// ⇒ every source scan in this project strips comments first. The constraint is about code.
const RENDER = RENDER_RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')

test('⭐⭐⭐ "I remember" is licensed by AVAILABILITY and nothing else', () => {
  assert.ok(RENDER.includes('AVAILABILITY.recalled'),
    'the renderer must branch on availability before claiming recollection')
  // The unreachable branch must exist and must NOT say "I don't remember".
  assert.ok(/can't get back to what was said/.test(RENDER),
    'an unreachable episode must be phrased as unreachable')
  assert.ok(!/(don't|do not) remember/i.test(RENDER),
    '⛔ the renderer must never write "I do not remember" — that converts a limit into an absence')
})

test('⭐⭐ "I decided to keep this" is licensed by RETENTION, and `given` may not borrow it', () => {
  assert.ok(RENDER.includes('RETENTION.retained'), 'retention must select the phrase')
  const idx = RENDER.indexOf('I decided to keep this')
  assert.ok(idx > 0)
  // The retained branch must come from a retention test, not from a source test.
  const before = RENDER.slice(Math.max(0, idx - 300), idx)
  assert.ok(/RETENTION\.retained/.test(before),
    'the "decided to keep" phrasing must sit inside the retention check')
})

test('⭐⭐ inference is still phrased as inference — BASIS selects it', () => {
  assert.ok(RENDER.includes('BASIS.inferred'), 'basis must select the inference phrasing')
  assert.ok(/worked this out rather than being told it/.test(RENDER),
    'an inferred memory must announce itself as worked out')
  assert.ok(RENDER.includes('BASIS.synthesized'), 'and convergence must be distinguishable from attestation')
  assert.ok(/nothing says it outright/.test(RENDER),
    '⭐ synthesized must be phrased as convergence without a source — this is the Hermes failure, in words')
})

test('⛔ a partly-visible episode still says so — the gap is never closed up', () => {
  assert.ok(/only reach my own side/.test(RENDER))
  assert.ok(/said something here that I can't see/.test(RENDER),
    'a withheld line inside an episode is shown as a gap with a name on it')
})

test('⛔⛔ and the renderer writes no title and no parenthesised footer', () => {
  // The two structural tells, asserted at the source rather than only on one sample output.
  assert.ok(!/What I have about/.test(RENDER), 'the container header is gone')
  assert.ok(!/\(Searched:/.test(RENDER), 'the audit footer is gone')
  // ⭐ …but the coverage FACT survives, because the information was never the problem.
  assert.ok(/That is what I can reach on this right now/.test(RENDER),
    'the searched-set fact must survive as an ordinary sentence')
})

// ── ⛔ AND THE DEFERRED HAZARD IS STILL DEFERRED ───────────────────────────────────────────────────
test('⚠️ Leak 2 did not sneak in a paraphrase mitigation', () => {
  // Ote: "keep the deferred mayCarryCounterpartContent() hazard explicitly deferred. Don't sneak a
  // mitigation into Leak 2 just because we're touching the rendering path."
  assert.ok(!/mayCarryCounterpartContent/.test(RENDER),
    'the renderer must not start acting on the paraphrase hazard — that is a separate, undesigned problem')
})

test('⛔ and the renderer still never consults account authorization', () => {
  const code = RENDER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')
  assert.ok(!/access_sotera_memory|memoryAccessScope/.test(code),
    'her retrieval and its rendering must not fracture by who is talking to her')
})
