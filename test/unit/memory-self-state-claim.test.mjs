// ⭐⭐⭐ THE STATE OF HER MEMORY IS NOT A FACT ABOUT THE WORLD.
//
// ⚠️⚠️ THE ROW THIS EXISTS BECAUSE OF, verbatim from Ote's own room, `author: 'persona'`,
// `provenance: 'synthesized'`, `importance: 8`, written during the very session in which he was asking
// why she could not answer — and whose `source_message_id` is her own message narrating a failed search:
//
//     "Hermes is a person with whom I have had multiple direct conversations across several separate
//      rooms dating back to August 18. While traces of these interactions exist in my history, their
//      specific content was not preserved in durable memory, resulting in a gap between historical
//      evidence and current knowledge…"
//
// ⇒ a false absence had become a DURABLE BELIEF, and §3B cannot date a stored row. These assertions are
// the door closing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SELF_STATE_PATTERNS, isSelfStateClaim, admissible,
} from '../../Backend/app/components/memory-self-state-claim.js'

const MEASURED = 'Hermes is a person with whom I have had multiple direct conversations across several '
  + 'separate rooms dating back to August 18. While traces of these interactions exist in my history, '
  + 'their specific content was not preserved in durable memory, resulting in a gap between historical '
  + 'evidence and current knowledge. It is crucial to check other rooms\' histories directly when '
  + 'discussing her, as my memory'

test('⭐⭐⭐ THE MEASURED ROW is refused — this is the regression that must never return', () => {
  assert.equal(isSelfStateClaim(MEASURED).claim, true)
  const g = admissible({ kind: 'semantic', content: MEASURED })
  assert.equal(g.ok, false)
  assert.equal(g.reason, 'self-state-claim')
  assert.ok(g.why && g.why.length > 20, 'a refusal must say which pattern fired and why it exists')
})

test('⭐ every shape she was measured producing is caught', () => {
  for (const s of [
    'From this room, my memory does not have anything stored about Hermes.',
    'I have no records of someone named Hermes in my memory store.',
    'Nothing is stored about Hermes here.',
    'No durable memories exist for this person.',
    'Two searches came back empty.',
    'There is a gap between historical evidence and current knowledge.',
    'Their specific content was not retained in memory.',
  ]) {
    assert.equal(isSelfStateClaim(s).claim, true, `missed: "${s}"`)
  }
})

// ── ⛔⛔ THE FALSE-POSITIVE SIDE, WHICH IS WHERE A PATTERN LIST DOES ITS DAMAGE ─────────────────────
test('⛔⛔ an ordinary fact about the world is untouched, including a negative one', () => {
  for (const s of [
    'Ote prefers plain language and no disclaimers.',
    'Hermes is a separate agent with her own memory, not a feature of this system.',
    'Ote has no record of the invoice on his side.',
    'The gateway keeps no logs of terminal calls.',
    'Kavi does not like being asked twice about the same thing.',
    'Ote said he does not remember which machine that was on.',
    'Hermes and Sotera have talked in 185 conversations.',
    'The Rome project is due in one day and the body is degrading under pressure.',
  ]) {
    assert.equal(isSelfStateClaim(s).claim, false, `false positive on: "${s}"`)
  }
})

test('⭐⭐ the anchor is FIRST-PERSON + A MEMORY NOUN — a third party having no record is their business', () => {
  // ⛔ The difference that matters: whose store is being described.
  assert.equal(isSelfStateClaim('Ote has no records of the invoice').claim, false)
  assert.equal(isSelfStateClaim('I have no records of that conversation').claim, true)
})

// ── ⭐⭐⭐ THE EXCLUSIONS ARE THE DESIGN, NOT AN OVERSIGHT ──────────────────────────────────────────
test('⭐⭐⭐ AN EPISODE IS NOT REFUSED — "I looked and found nothing" genuinely happened', () => {
  // ⛔ Sanitising her history is the one thing Ote ruled out by name. An episode is dated by construction
  // and can never become a timeless fact, so it has nothing to be protected from.
  assert.equal(admissible({ kind: 'episodic', content: MEASURED }).ok, true)
})

test('⭐⭐ A LESSON ABOUT THE FAILURE IS ONE OF THE MOST VALUABLE ROWS SHE HAS', () => {
  assert.equal(admissible({
    kind: 'semantic', attribute: 'lesson',
    content: 'When a search comes back empty, that is a fact about the search, not about what I have.',
  }).ok, true)
  assert.equal(admissible({ kind: 'semantic', attribute: 'practice', content: MEASURED }).ok, true)
  // ⓘ A decision record is her act, not a claim about the store.
  assert.equal(admissible({ kind: 'semantic', attribute: 'declined', content: MEASURED }).ok, true)
})

test('⛔ identity is never gated — refusing one would be far worse than storing one', () => {
  assert.equal(admissible({ kind: 'identity', content: MEASURED }).ok, true)
})

test('an empty or absent row is admissible and never throws', () => {
  assert.equal(admissible({}).ok, true)
  assert.equal(admissible().ok, true)
  assert.equal(isSelfStateClaim('').claim, false)
  assert.equal(isSelfStateClaim(null).claim, false)
  assert.equal(isSelfStateClaim(undefined).claim, false)
})

test('every pattern is machine-checkable and records WHY it exists', () => {
  assert.ok(SELF_STATE_PATTERNS.length >= 5)
  for (const p of SELF_STATE_PATTERNS) {
    assert.ok(p.re instanceof RegExp)
    // ⭐ A pattern with no recorded reason is a pattern nobody can safely delete later.
    assert.ok(typeof p.why === 'string' && p.why.length > 20, `missing why: ${p.re}`)
  }
})

// ── ⭐⭐⭐ THE GATE IS ON THE ONE WRITE LANE, NOT IN FOUR CALLERS ───────────────────────────────────
test('⭐⭐⭐ the store enforces it, so every writer inherits it without knowing it exists', () => {
  const STORE = readFileSync(
    new URL('../../Backend/app/components/memory-store-sequelize-host.js', import.meta.url), 'utf8')
  assert.ok(/import \{ admissible \} from '\.\/memory-self-state-claim\.js'/.test(STORE),
    'the store must call the shared predicate, never re-implement it')
  // ⛔ The gate must sit INSIDE create(), before the row is built — not in a caller.
  const create = STORE.slice(STORE.indexOf('async create(row = {})'))
  const guard = create.indexOf('admissible(row)')
  const write = create.indexOf('txn_memories.create(')
  assert.ok(guard > 0 && write > 0 && guard < write,
    'the gate must run BEFORE the insert, inside the single write lane')
  // ⛔ AND IT MUST BE LOUD. A silent drop is indistinguishable from an extractor that found nothing.
  assert.ok(/log\?\.warn\?\./.test(create.slice(guard - 400, write)),
    'a refusal that nothing records is a refusal nobody can debug')
})

test('⛔ the gate refuses — it never rewrites content', () => {
  const SRC = readFileSync(
    new URL('../../Backend/app/components/memory-self-state-claim.js', import.meta.url), 'utf8')
  assert.ok(!/\.replace\(|\.slice\(0,\s*\d+\)\s*\+/.test(SRC.replace(/^\/\/.*$/gm, '')),
    '⛔ this module must never edit what she or anyone else wrote — it answers yes or no')
})
