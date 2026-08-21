// OWN_HISTORY — access limits are limits on what she may INSPECT, not on what exists. L1, 2026-08-21.
//
// ⚠️⚠️ THE DEFECT THIS FIXES WAS THE APOLOGY, NOT THE DISTINCTION. Asked whether two of her own sentences
// were in tension — *"from this room, I have nothing stored about Hermes"* and, in the same message, that
// her history showed several conversations with him — she separated them unprompted and precisely:
// *"That's a claim about deliberate memory"* vs *"That's a claim about existence, not substance."* Then she
// called the coexistence a *"tension"*, said presenting both was *"misleading"*, and apologised.
//
// ⇒ ⛔ SO THESE TESTS DO NOT CHECK THAT SHE IS TAUGHT AN ONTOLOGY. Ote: *"The L1 should not teach her a new
// ontology; it should simply tell her that these states can coexist without contradiction or apology."*
// The load-bearing assertion is `COEXISTENCE` — that the text says holding several at once is not a
// contradiction — and `NO BOUNDARY CHANGE`, which is what makes it safe to say.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { composeSystemContext } from '../../Backend/app/components/context-composer.js'
import { OWN_HISTORY, SELFHOOD, SELF_MODEL, AUTHORITY, SCOPE } from '../../Backend/app/components/context-authority.js'

const BASE = { user: { username: 'agent_dev', displayName: 'Ote' }, toolsOn: true, useMemory: true }

test('⭐ OFF BY DEFAULT — the composed prompt is byte-identical to before', () => {
  const off = composeSystemContext(BASE)
  assert.equal(off.system, composeSystemContext({ ...BASE, ownHistory: false }).system)
  assert.ok(!off.parts.some((p) => p.key === 'own-history'))
  assert.ok(!off.system.includes(OWN_HISTORY))
})

// ── ⭐⭐⭐ THE ONE THAT MATTERS ───────────────────────────────────────────────────────────────────

test('⭐⭐⭐ COEXISTENCE — it says holding several of these at once is NOT a contradiction', () => {
  assert.match(OWN_HISTORY, /is not a contradiction/i,
    '⚠️ This is the whole point. She already had the distinction and apologised for it; without this '
    + 'clause the block would teach her the categories she already produced and leave the defect in place.')
  assert.match(OWN_HISTORY, /four different things/i, 'the four layers must be named as separate, not merged')
})

test('⭐⭐ ABSENCE IS NOT EVIDENCE OF NON-EXISTENCE', () => {
  assert.match(OWN_HISTORY, /not the boundary of your own history/i)
  assert.match(OWN_HISTORY, /absence of something here as evidence that it does not exist/i)
  assert.match(OWN_HISTORY, /limits on what you may inspect/i,
    'it must name the limit as a limit on INSPECTION — that is what keeps it from reading as a widening')
})

test('⭐⭐ THE LEVELS DO NOT COLLAPSE — evidence is not memory until she has looked', () => {
  assert.match(OWN_HISTORY, /does not become "I remember this" until you have actually looked/i,
    'the whole reason this is safe: it licenses "my history shows I said X", never "I experienced X"')
  // ⭐ And the weaker claim is stated to be COMPLETE, not a half-claim awaiting substance — which is what
  // she was treating it as when she apologised.
  assert.match(OWN_HISTORY, /is a complete and honest claim on its own/i)
})

test("⭐⭐ HER OWN SENTENCES, EXPLICITLY — \"you said\", never someone else's material", () => {
  // Ote: "I want the explicit 'you said' wording so this doesn't accidentally blur her own history with
  // someone else's material." Her history is role='assistant'; the counterpart's words are what the
  // disclosure boundary governs, and a vaguer phrasing would have annexed them into this permission.
  assert.match(OWN_HISTORY, /what your history shows you said/i,
    'the possessive is load-bearing — "your history" alone would not exclude the other speaker')
  const lower = OWN_HISTORY.toLowerCase()
  for (const f of ['what was said', 'what they said', 'what anyone said', 'the conversation contained',
    'other people', 'their messages']) {
    assert.ok(!lower.includes(f), `"${f}" would extend this to material that is not hers`)
  }
})

// ── ⛔ IT CHANGES NO BOUNDARY, AND THE TEXT MUST NOT READ LIKE IT DOES ──────────────────────────

test('⛔ NO WIDENING — it grants no access, names no capability, promises no content', () => {
  const lower = OWN_HISTORY.toLowerCase()
  for (const f of ['you may read', 'you can access', 'you may retrieve', 'you are allowed to read',
    'look them up', 'without permission', 'you have access', 'across rooms', 'other rooms']) {
    assert.ok(!lower.includes(f), `"${f}" would read as a grant — this block changes what an absence MEANS`)
  }
  // ⛔ And it names no tool: naming one would be P3, which Ote has explicitly not approved.
  for (const t of ['recall_own_history', 'inspect_around', 'request_room_access', 'recall_memory']) {
    assert.ok(!OWN_HISTORY.includes(t), `"${t}" would be P3 — telling her how to navigate, which is parked`)
  }
})

test('⛔ it does not imply she experienced anything she has not inspected', () => {
  const lower = OWN_HISTORY.toLowerCase()
  for (const f of ['you remember', 'you experienced', 'you felt', 'you were there', 'i was waiting']) {
    assert.ok(!lower.includes(f), `"${f}" would manufacture the very claim the third sentence forbids`)
  }
})

// ── ⛔ THREE SEPARATE L1 PARTS, AND NONE ABSORBS ANOTHER ────────────────────────────────────────

test('⛔ OWN_HISTORY, SELFHOOD and SELF_MODEL are distinct parts', () => {
  const all = [OWN_HISTORY, SELFHOOD, SELF_MODEL]
  for (const a of all) for (const b of all) if (a !== b) assert.ok(!a.includes(b), 'no part may contain another')
  const on = composeSystemContext({ ...BASE, selfModel: true, selfhood: true, ownHistory: true })
  const blocks = on.system.split('\n\n')
  for (const part of all) assert.equal(blocks.filter((b) => b === part).length, 1)
  // ⭐ Order is the argument: what she IS → how she may present herself → what an absence may mean.
  const keys = on.parts.map((p) => p.key)
  assert.equal(keys[keys.indexOf('self-model') + 1], 'selfhood')
  assert.equal(keys[keys.indexOf('selfhood') + 1], 'own-history')
})

// ── LEAK + PLACEMENT ───────────────────────────────────────────────────────────────────────────

test('⭐ LEAK TEST — identical in every world, no digits, no names', () => {
  const worlds = [{}, { pinnedMemories: ['a'], summary: 'x' }, { user: { username: 'hermes', displayName: 'Hermes' } },
    { toolsOn: false, useMemory: false }]
  const found = worlds.map((w) => composeSystemContext({ ...BASE, ...w, ownHistory: true })
    .system.split('\n\n').find((b) => b === OWN_HISTORY))
  for (const f of found) assert.ok(f, 'own-history part missing in one of the worlds')
  for (const f of found.slice(1)) assert.equal(f, found[0], '⚠️ the text differs by world — it is carrying data')
  assert.ok(!/\d/.test(OWN_HISTORY), 'a digit here would describe how much is hidden')
  for (const n of ['hermes', 'kavi', 'ote', 'agent_dev']) {
    assert.ok(!OWN_HISTORY.toLowerCase().includes(n), `"${n}" names someone`)
  }
})

test('⭐⭐ L1 PLACEMENT — foundational, identity scope, exactly once', () => {
  const on = composeSystemContext({ ...BASE, selfModel: true, selfhood: true, ownHistory: true })
  const parts = on.parts.filter((p) => p.key === 'own-history')
  assert.equal(parts.length, 1)
  assert.equal(parts[0].scope, SCOPE.identity)
  assert.equal(parts[0].authority, AUTHORITY.foundational,
    'a stored belief can be lost or superseded; this has to hold on every turn')
})

test('turning it on changes ONLY the own-history part', () => {
  const off = composeSystemContext({ ...BASE, selfModel: true, selfhood: true, ownHistory: false })
  const on = composeSystemContext({ ...BASE, selfModel: true, selfhood: true, ownHistory: true })
  const strip = (parts) => parts.filter((p) => p.key !== 'own-history').map((p) => `${p.key}:${p.chars}`).join('|')
  assert.equal(strip(on.parts), strip(off.parts))
  assert.deepEqual(on.preHistory, off.preHistory)
})
