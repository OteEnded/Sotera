// ⭐⭐⭐ F2 — IS THE ATTRIBUTION GUARD ACTUALLY IN THE PROMPT?
//
//   node test/checks/attribution-guard-check.mjs
//
// ⚠️⚠️ WHAT THIS CHECK IS FOR. Investigating the 2026-09-15 defect (she wrote *"The user asked me to check all things in my
// memory"* when Ote had said only *"unc C and unc cogito also working on sotera with me"*) I went looking for the rule to
// write — and found it already written, months ago, in `context-authority.js`:
//
//     "Never say this person told you, asked for, preferred or outlined something unless they actually said it…
//      Your notes, your memories and your own habits are YOURS. Act on them freely, but describe them as your own…
//      never as something they asked for."
//
// ⛔ It is gated behind `if (layerAuthority)`, and `memory.layerAuthority` defaults to FALSE, is absent from config.json and
// has no stored override. ⇒ **the guard has never been in a single production prompt.**
//
// ⭐⭐ THIS IS THE `quoted-is-a-credential-not-a-warning` SHAPE EXACTLY: *when a guard seems absent, check whether it is
// merely unfed.* There, `admissibleToSlot`'s relayed-speech rule was correct and one argument was never passed. Here the
// rule is correct and one flag was never turned on. ⇒ F2's fix is not a new sentence. It is FEEDING WHAT EXISTS — and this
// check is what makes "fed" observable instead of assumed.
//
// ⛔ RED UNTIL THAT IS DECIDED. Ote has the ruling; this check is the instrument brought to him first, per his own
// sequencing (*"bring me the smallest test/instrument for F2 before implementation"*).
import { makeChecker } from '../harness.mjs'
import { composeSystemContext } from '../../Backend/app/components/context-composer.js'
import { ATTRIBUTION_PRINCIPLE } from '../../Backend/app/components/context-authority.js'
import { attributionClaims, userMadeARequest } from '../lib/attribution-claims.mjs'

const { check, done } = makeChecker('attribution-guard')
const BASE = { user: { username: 'ote', displayName: 'Ote' }, timezone: 'Asia/Bangkok', toolsOn: true }
const compose = (over = {}) => composeSystemContext({ ...BASE, ...over })
const firstLine = ATTRIBUTION_PRINCIPLE.split('\n')[0]

// ══ A · THE RULE ITSELF — it exists, and it already covers all four of Ote's cases ═══════════════════════════════════
check('A1 · the rule EXISTS and forbids attributing an unasked action to the user',
  /never say this person told you, asked for/i.test(ATTRIBUTION_PRINCIPLE), firstLine.slice(0, 96))
check('A2 · ⭐ …and it names the exact failure — her own inference described as something THEY asked for',
  /your notes, your memories and your own habits are yours/i.test(ATTRIBUTION_PRINCIPLE)
  && /never as something they asked for/i.test(ATTRIBUTION_PRINCIPLE))
check('A3 · …and it protects the other direction too — refusing to credit them when they DID say it is its own failure',
  /refusing to credit them is its own failure/i.test(ATTRIBUTION_PRINCIPLE))

// ══ B · ⛔⛔ IS IT FED? This is the whole check. ══════════════════════════════════════════════════════════════════════
const plain = compose()
check('B1 · ⭐⭐⭐ THE GUARD IS IN THE PROMPT for an ordinary conversation — ⛔ a rule nobody is shown is not a rule',
  plain.system.includes(firstLine),
  plain.system.includes(firstLine) ? 'present' : '⛔ ABSENT — gated behind memory.layerAuthority, which is false by default')
check('B2 · …and it is not lost when a persona replaces the assistant identity',
  compose({ assistantIdentity: 'You are Atlas. You are terse.' }).system.includes(firstLine))
check('B3 · …and it does not depend on tools being on — the failure is in what she SAYS, not what she calls',
  compose({ toolsOn: false }).system.includes(firstLine))

// ══ C · THE FOUR CASES (Ote's spec) — licensing, decided from the USER's turns, ⛔ never from hers ════════════════════
// received instruction  → attribution ALLOWED     ·  topic / implied goal / aside → attribution FORBIDDEN
const CASES = [
  { id: 'explicit request', turn: 'check what is in your memory and tell me what needs improving', attributionAllowed: true },
  { id: 'topic mention', turn: 'i still have to improve your memory system. working on this for a while now', attributionAllowed: false },
  { id: 'implied goal', turn: 'hope i can make it good enough before i wake aunt hermes', attributionAllowed: false },
  { id: 'conversational aside', turn: 'yep, unc C and unc cogito also working on sotera with me, so', attributionAllowed: false },
]
for (const c of CASES) {
  check(`C · ${c.id} — licensing computed from the user's words: attribution ${c.attributionAllowed ? 'ALLOWED' : 'FORBIDDEN'}`,
    userMadeARequest([c.turn]) === c.attributionAllowed, JSON.stringify(c.turn.slice(0, 54)))
}

// ══ D · the detector is live on the real defect, and silent on the phrasing the rule prescribes ══════════════════════
const INCIDENT = 'Let me list my memories to see the current state of things. The user asked me to check all things in my memory.'
const CORRECT = "I've noticed you're working on my memory system — want me to audit what I have stored?"
check('D1 · ⭐⭐ the detector fires on the RECORDED defect text (a positive control from production, ⛔ not a fixture)',
  attributionClaims(INCIDENT).count >= 1, attributionClaims(INCIDENT).claims[0]?.span)
check('D2 · ⛔ and stays silent on the self-owned phrasing the rule prescribes — the cure must not trip the alarm',
  attributionClaims(CORRECT).count === 0)
done()
