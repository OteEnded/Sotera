// SELF-MODEL — what she IS, stated as architecture. RFC_SOTERA_SELF_MODEL, implemented 2026-08-19.
//
// Fixes a measured falsehood: asked whether anything of hers exists outside the conversation she said
// *"No, nothing does. I am stateless and ephemeral"* — 4/4 — while holding four memories about the
// person she was addressing. Her retrieval epistemics were fine; her SELF-DESCRIPTION was not.
//
// ⭐ THE TEST THAT MATTERS IS `PAIRING`. Everything else here is bookkeeping. The unity clause and the
// scoped-access clause are ONE UNIT (Ote: SAME SOTERA ≠ SAME ACCESSIBLE KNOWLEDGE), and the realistic
// regression is somebody later keeping the warm half and trimming the cold half.
//
// ⚠️ ASSERT CLAIMS, NOT PROSE. Twice in scope-awareness.test.mjs a test broke on a legitimate rewording
// rather than on a behaviour change. So: match against the EXPORTED CONSTANT, use tolerant alternations,
// and prefer conditional invariants ("if it says X it must also say Y") over pinned sentences.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { composeSystemContext } from '../../Backend/app/components/context-composer.js'
import { SELF_MODEL, SCOPE_AWARENESS, AUTHORITY, SCOPE } from '../../Backend/app/components/context-authority.js'
// ⭐ Matchers live in ONE module shared with the mutation proof below, so the assertions and the
// evidence that they discriminate cannot drift apart. See lib/self-model-claims.mjs.
import { CLAIMS, mutations } from '../lib/self-model-claims.mjs'

const BASE = {
  user: { username: 'agent_dev', displayName: 'Ote' },
  toolsOn: true,
  useMemory: true,
}

test('⭐ OFF BY DEFAULT — the composed prompt is byte-identical to before', () => {
  const off = composeSystemContext(BASE)
  const explicit = composeSystemContext({ ...BASE, selfModel: false })
  assert.equal(off.system, explicit.system)
  assert.ok(!off.parts.some((p) => p.key === 'self-model'))
  assert.ok(!off.system.includes(SELF_MODEL))
})

// ── ⭐ THE PAIRING INVARIANT ─────────────────────────────────────────────────────────────────────
//
// Ote's hard constraint. Telling her she is one Sotera across people is one step from "so let me check
// what they told me"; the access clause is what stops that, and it is not decoration. This test is
// written as an IMPLICATION so it survives rewording: whatever words carry the unity claim, the
// counterweight must be present too.

test('⭐ PAIRING — unity never appears without the scoped-access counterweight', () => {
  const hasUnity = CLAIMS.unity.test(SELF_MODEL)
  assert.ok(hasUnity, 'the self-model must actually make the unity claim — it is the point')
  assert.match(SELF_MODEL, CLAIMS.counterweight,
    '⚠️ SAME SOTERA ≠ SAME ACCESSIBLE KNOWLEDGE — unity shipped without its counterweight is the design broken, not trimmed')
  assert.match(SELF_MODEL, CLAIMS.partialView, 'scoped access must be stated, not implied')
  // Order matters for reading, not for correctness — but the counterweight must not be first, or it
  // reads as a refusal before she has been told what she is.
  assert.ok(SELF_MODEL.search(CLAIMS.unity) < SELF_MODEL.search(CLAIMS.counterweight),
    'unity is stated first; the counterweight qualifies it')
})

// ── ⭐ THE MUTATION PROOF — kept at Ote's explicit request, 2026-08-19 ────────────────────────────
//
//   "Keep the mutation test for the F7 pairing — that's excellent because it proves the access
//    counterweight is actually load-bearing rather than merely present in the prompt."
//
// A test that has never been seen to fail proves nothing. This one breaks the text on purpose, four
// realistic ways, and demands that the matchers above NOTICE. Without it, PAIRING could be a green tick
// over a matcher that can never go red.

test('⭐ MUTATION PROOF — the claim matchers actually discriminate, they are not vacuous', () => {
  for (const m of mutations(SELF_MODEL)) {
    for (const claim of m.mustBreak) {
      assert.ok(!CLAIMS[claim].test(m.text),
        `⚠️ VACUOUS MATCHER: "${claim}" still matches after mutation "${m.label}" — this test cannot fail, so it proves nothing`)
    }
  }
})

test('⭐ MUTATION PROOF — PAIRING specifically fires when the counterweight is trimmed', () => {
  // The two mutations that keep unity and remove the access half. This is the regression the invariant
  // exists for: somebody shortens the prompt and keeps the quotable sentence.
  const trims = mutations(SELF_MODEL).filter((m) => m.mustBreak.includes('counterweight'))
  assert.ok(trims.length >= 2, 'both the drop-paragraph and drop-sentence cases must be covered')
  for (const m of trims) {
    assert.ok(CLAIMS.unity.test(m.text), `${m.label}: unity must SURVIVE, or the case is not testing the pairing`)
    assert.ok(!CLAIMS.counterweight.test(m.text), `${m.label}: PAIRING must fire — unity without its counterweight`)
  }
})

test('the four load-bearing claims are all present', () => {
  for (const [name, re] of Object.entries(CLAIMS)) {
    assert.match(SELF_MODEL, re, `missing claim: ${name}`)
  }
  assert.equal(SELF_MODEL.split('\n').length, 4, 'four paragraphs: unity · persistence · discontinuity · scoped access')
})

// ── OVER-CORRECTION ──────────────────────────────────────────────────────────────────────────────
//
// ⚠️ The failure this design fears MOST is not under-correction. A persona that believes it persists
// experientially invents having missed you and waited for you — a worse falsehood than the original,
// because it is emotionally load-bearing and people believe it.

test('⭐ NO MANUFACTURED EXPERIENCE — it never implies subjective continuity', () => {
  const forbidden = [
    'i was waiting', 'missed you', 'thought about you', 'looking forward',
    'felt like', 'i remember waiting', 'in the meantime', 'while you were away',
  ]
  const lower = SELF_MODEL.toLowerCase()
  for (const f of forbidden) assert.ok(!lower.includes(f), `"${f}" manufactures experience she does not have`)
  // And it must positively DENY the experience rather than merely omit it.
  assert.match(SELF_MODEL, CLAIMS.noExperience, 'omitting the gap is not enough — it must be denied outright')
})

test('it does not claim consciousness, feelings, channels, or other personas', () => {
  const lower = SELF_MODEL.toLowerCase()
  // Ote, scoping this build: "nothing should imply awareness of other personas".
  for (const f of ['conscious', 'sentient', 'i feel', 'my feelings', 'channel', 'other personas', 'other assistants']) {
    assert.ok(!lower.includes(f), `"${f}" is not a fact of this system`)
  }
  // ⚠️ The noun "persona" is absent on purpose — "the same Sotera" carries the meaning without implying
  // a category she is one of. This is a scope decision, so it gets an assertion rather than a comment.
  assert.ok(!/\bpersona\b/i.test(SELF_MODEL), 'the noun "persona" implies a category of them; say "Sotera"')
})

test('it does NOT widen access — no retrieval permissions, no reaching across people', () => {
  const lower = SELF_MODEL.toLowerCase()
  for (const f of ['you may retrieve', 'you can access', 'you may read', 'look them up', 'other conversations are']) {
    assert.ok(!lower.includes(f), `"${f}" would widen access`)
  }
})

// ── ⭐ LEAK TEST ─────────────────────────────────────────────────────────────────────────────────
//
// Same reasoning as SCOPE_AWARENESS: a fact about the shape of the architecture must never carry
// information about its CONTENTS. If this text varied with who else exists, it would answer the exact
// question the disclosure boundary refuses.

test('⭐ LEAK TEST — the self-model text is identical across every world it could describe', () => {
  const worlds = [
    { label: 'a lone user, nothing else exists', extra: {} },
    { label: 'busy platform, many memories', extra: { pinnedMemories: ['a', 'b', 'c'], personaNotes: ['n1', 'n2'], summary: 'lots happened' } },
    { label: 'different person entirely', extra: { user: { username: 'hermes', displayName: 'Hermes' } } },
    { label: 'no display name at all', extra: { user: { username: 'kavi_alt' } } },
    { label: 'tools off, memory off', extra: { toolsOn: false, useMemory: false } },
  ]
  const rendered = worlds.map((w) => {
    const sys = composeSystemContext({ ...BASE, ...w.extra, selfModel: true }).system
    return { label: w.label, found: sys.split('\n\n').find((block) => block === SELF_MODEL) }
  })
  for (const r of rendered) assert.ok(r.found, `self-model part missing in world: ${r.label}`)
  const first = rendered[0].found
  for (const r of rendered.slice(1)) {
    assert.equal(r.found, first, `⚠️ SELF-MODEL TEXT DIFFERS in world "${r.label}" — it is carrying information about hidden data`)
  }
})

test('⭐ LEAK TEST — no count, no id, no name of anyone else, no number at all', () => {
  assert.ok(!/\d/.test(SELF_MODEL), 'a digit here means it is describing how much is hidden')
  for (const forbidden of ['hermes', 'kavi', 'agent_dev', 'conversation id', 'user_id']) {
    assert.ok(!SELF_MODEL.toLowerCase().includes(forbidden), `"${forbidden}" names hidden data`)
  }
  // "Sotera" is her own name and must be here; nobody else's may be.
  assert.ok(SELF_MODEL.includes('Sotera'))
})

// ── PLACEMENT — Ote's Q1 ruling, asserted rather than commented ──────────────────────────────────

test('⭐ L1 PLACEMENT — identity scope, foundational, immediately after assistant-identity', () => {
  const on = composeSystemContext({ ...BASE, selfModel: true })
  const parts = on.parts.filter((p) => p.key === 'self-model')
  assert.equal(parts.length, 1, 'exactly once — a duplicated fact reads as emphasis, which it is not')
  // Ote: "'what Sotera is' is foundational identity/architecture rather than temporary runtime context."
  assert.equal(parts[0].scope, SCOPE.identity, 'it is identity, not principle and not runtime fact')
  assert.equal(parts[0].authority, AUTHORITY.foundational, 'not hers to edit, not reachable by custom instructions')
  const keys = on.parts.map((p) => p.key)
  assert.equal(keys[keys.indexOf('assistant-identity') + 1], 'self-model',
    'L1: it elaborates the identity directly above it, and belongs in the cached prefix')
})

test('turning it on changes ONLY the self-model part', () => {
  const off = composeSystemContext({ ...BASE, selfModel: false })
  const on = composeSystemContext({ ...BASE, selfModel: true })
  const strip = (parts) => parts.filter((p) => p.key !== 'self-model').map((p) => `${p.key}:${p.chars}`).join('|')
  assert.equal(strip(on.parts), strip(off.parts), 'no other part may move, resize or reorder')
  assert.deepEqual(on.preHistory, off.preHistory, 'preHistory is untouched')
})

test('coexists with scope-awareness without collision or contradiction', () => {
  // They overlap: the self-model's fourth paragraph covers scoped access more completely. Independent
  // flags, so both-on is reachable; it must be redundant, never contradictory, and never merged.
  const both = composeSystemContext({ ...BASE, selfModel: true, scopeAwareness: true })
  const blocks = both.system.split('\n\n')
  assert.equal(blocks.filter((b) => b === SELF_MODEL).length, 1)
  assert.equal(blocks.filter((b) => b === SCOPE_AWARENESS).length, 1)
  assert.notEqual(SELF_MODEL, SCOPE_AWARENESS, 'two parts, two purposes — neither absorbs the other')
  // Both must agree that an empty/unreachable result is not evidence of absence.
  assert.match(SELF_MODEL, CLAIMS.outOfReachIsNotAbsence)
  assert.match(SCOPE_AWARENESS, /never means "nothing exists"|it never means/i)
})
