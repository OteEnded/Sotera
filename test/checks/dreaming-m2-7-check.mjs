// ⭐⭐⭐ M2-7 · THE BESPOKE GRAMMAR IS RETIRED — its own red-proof, because the change deserves one.
//
//   node test/checks/dreaming-m2-7-check.mjs
//
// ⚠️⚠️ WHY THIS FILE EXISTS SEPARATELY. Ote, 2026-09-03: *"Don't silently remove the bespoke forms or
// `dreaming:<form>` addresses as part of some unrelated cleanup. That's a deliberate implementation
// change against an already-locked semantic ruling and **should have its own red-proof**."*
//
// ⇒ ⭐ removing code is the easiest kind of change to do invisibly, and the easiest to get wrong: a
// deletion leaves no artifact behind to inspect. This file is that artifact. It asserts BOTH halves —
// that the old vocabulary is gone, AND that what replaced it actually works.
//
// ── ⭐⭐ WHAT M2-7 RULED ────────────────────────────────────────────────────────────────────────
//   *"Ordinary memory claim + separate warrant/provenance. ⛔ No Dreaming-specific memory vocabulary."*
//   *"Warrant: separate provenance object. ⛔ Don't put evidence/provenance into the memory's value."*
//
// ── ⛔ WHAT THIS TOUCHES ────────────────────────────────────────────────────────────────────────
//   ✅ pure, in-process. ⛔ No database, no model, no reasoner, no corpus. It writes nothing anywhere.

import { readFileSync, existsSync } from 'node:fs'
import { makeChecker } from '../harness.mjs'
import {
  validateClaim, mayPublish, valueOfClaim, T0_FIELDS, AN_ORDINARY_CLAIM_PLUS_A_WARRANT,
} from '../../Backend/app/components/dreaming-proposal.js'
import { slotAddressFor, valueOf } from '../../Backend/app/components/dreaming-resolver.js'

const { check, done } = makeChecker('dreaming-m2-7')
const COMPONENTS = new URL('../../Backend/app/components/', import.meta.url)
const src = (n) => (existsSync(new URL(n, COMPONENTS)) ? readFileSync(new URL(n, COMPONENTS), 'utf8') : null)
const codeOnly = (t) => String(t ?? '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[^\n]*?\/\/.*$/gm, (l) => l.slice(0, l.indexOf('//')))

/** ⭐ A well-formed ordinary claim, used as the positive control throughout. */
const CLAIM = Object.freeze({
  entity: 'user',
  attribute: 'review-style',
  value: 'asks for the numbers before the opinion',
  kind: 'habit',
  cites: [{ root: 'r1', span: 'numbers first' }, { root: 'r2', span: 'before the opinion' }],
})

try {
  const proposalSrc = src('dreaming-proposal.js')
  const resolverSrc = src('dreaming-resolver.js')
  check('0 · ⭐ both modules were found — ⛔ else every assertion below is vacuous',
    Boolean(proposalSrc) && Boolean(resolverSrc))
  const proposalCode = codeOnly(proposalSrc ?? '')
  const resolverCode = codeOnly(resolverSrc ?? '')

  // ══ A · ⛔ THE OLD VOCABULARY IS GONE ═══════════════════════════════════════════════════════════
  check('A1 · ⛔⛔ the five bespoke FORMS are no longer exported',
    !/export const FORMS\s*=/.test(proposalCode))
  for (const gone of ['renderProposal', 'validateProposal', 'QUANTIFIER', 'writerTest']) {
    check(`A2 · ⛔ the closed-grammar export \`${gone}\` is gone`,
      !new RegExp(`export (const|function) ${gone}\\b`).test(proposalCode))
  }
  // ⚠️⚠️ THE REGRESSION THE 12b RUN BOUGHT. The address rule began as an identifier pattern and refused
  // 34 of 104 live attributes (33%) — a rule carried over from the retired closed grammar, where a slot
  // label was an enumerated token. ⭐ A slot address is a POINTER INTO THE EXISTING STORE, and the store
  // says spaces are ordinary. Pinned here so nobody re-tightens it on aesthetics.
  for (const real of ['communication preference', 'account identity', 'Thai name spelling', 'review-style']) {
    check(`A0 · ⭐⭐ a REAL live slot address validates: \`${real}\``,
      validateClaim({ ...CLAIM, attribute: real }).ok === true)
  }
  check('A0 · ⛔ …but a newline or a leading space is still refused — an address is one line',
    validateClaim({ ...CLAIM, attribute: ' leading' }).ok === false
    && validateClaim({ ...CLAIM, attribute: 'two\nlines' }).ok === false)

  check('A3 · ⛔⛔ `slotAddressFor` no longer MINTS a `dreaming:` address',
    !/dreaming[:\\/]/.test(codeOnly(resolverCode.slice(
      resolverCode.indexOf('export function slotAddressFor'),
      resolverCode.indexOf('export const valueOf')))))
  // ⭐ AND THE OLD CONVENTION CANNOT RETURN THROUGH A CALLER — asserted behaviourally, not by reading.
  const minted = slotAddressFor(CLAIM)
  check('A3 · ⭐⭐ the address is the claim\'s OWN — an ordinary slot, indistinguishable from any writer\'s',
    minted.entity === 'user' && minted.attribute === 'review-style', JSON.stringify(minted))

  // ══ B · ⭐⭐⭐ AND THE VOCABULARY CANNOT COME BACK THROUGH THE DOOR ═══════════════════════════
  // ⛔ A deletion is not a guarantee. This is: a `dreaming:`-prefixed address is REFUSED by validation,
  // so no caller can reintroduce the convention the ruling removed.
  for (const addr of ['dreaming:recurrence', 'dreaming/recurrence', 'DREAMING:contrast']) {
    check(`B1 · ⛔⛔ a \`${addr}\` attribute is REFUSED — the vocabulary cannot return`,
      validateClaim({ ...CLAIM, attribute: addr }).ok === false)
  }
  check('B1 · ⛔ …and it is refused on the ENTITY side too',
    validateClaim({ ...CLAIM, entity: 'dreaming:sotera' }).ok === false)

  // ══ C · ⭐ WHAT REPLACED IT ACTUALLY WORKS — ⛔ removal without a replacement is not a refactor ══
  const ok = validateClaim(CLAIM)
  check('C1 · ⭐⭐ a well-formed ORDINARY claim validates', ok.ok === true, ok.why)
  check('C1 · ⭐ …and its value is the value — ⛔ nothing is rendered from a template',
    valueOfClaim(CLAIM) === CLAIM.value && valueOf(CLAIM) === CLAIM.value)
  for (const [field, bad] of [
    ['entity', { ...CLAIM, entity: '' }],
    ['attribute', { ...CLAIM, attribute: '' }],
    ['value', { ...CLAIM, value: '   ' }],
    ['kind', { ...CLAIM, kind: null }],
    ['cites', { ...CLAIM, cites: [] }],
  ]) {
    check(`C2 · ⛔ a claim with no usable \`${field}\` is refused`, validateClaim(bad).ok === false)
  }
  check('C2 · ⛔⛔ an UNWARRANTED claim is refused — citations are not optional for Dreaming',
    validateClaim({ ...CLAIM, cites: undefined }).ok === false)
  check('C2 · ⛔ a cite with no span is refused',
    validateClaim({ ...CLAIM, cites: [{ root: 'r1' }] }).ok === false)

  // ══ D · ⭐⭐⭐ THE WARRANT STAYS OUT OF THE VALUE ══════════════════════════════════════════════
  // Ote: *"⛔ Don't put evidence/provenance into the memory's value."* ⭐ A claim and its receipt have
  // different lifetimes — the receipt is about a moment, the claim is not — so a value that argues for
  // itself would carry a fact that goes stale inside one that does not.
  for (const v of [
    'asks for numbers first, verified across 3 independent roots',
    'she does this — 4 conversations show it',
    'a habit, verified across two episodes',
  ]) {
    check('D1 · ⛔⛔ a value that states its own evidence is REFUSED — the warrant is a SEPARATE object',
      validateClaim({ ...CLAIM, value: v }).ok === false, v)
  }
  check('D1 · ⭐ …while an ordinary value that merely mentions a number is fine — ⛔ not a keyword ban',
    validateClaim({ ...CLAIM, value: 'prefers 3-space indentation' }).ok === true)

  // ══ E · ⛔ PUBLICATION FAILS CLOSED ═══════════════════════════════════════════════════════════
  check('E1 · ⭐ a room-scoped claim may be published — the room\'s owner, in their own room',
    mayPublish(CLAIM, { destination: 'room' }).ok === true)
  check('E1 · ⛔⛔ `persona_global` is REFUSED — a prose value cannot be checked statically the way the '
    + 'closed grammar could, and that disclosure ruling does not exist',
    mayPublish(CLAIM, { destination: 'persona_global' }).ok === false,
    mayPublish(CLAIM, { destination: 'persona_global' }).why)

  // ══ F · ⚠️ THE GUARANTEE THIS COST, ASSERTED AS A COST ══════════════════════════════════════
  // ⭐ The closed grammar guaranteed *no prose leaves the model*. That guarantee is GONE, and the file
  // says so rather than implying the replacement is strictly better. ⛔ A refactor that quietly drops a
  // guarantee while claiming an upgrade is the failure this assertion exists to prevent.
  check('F1 · ⚠️ the module STATES the guarantee it gave up, rather than implying an upgrade',
    /guarantee (is|this costs)|no prose leaves/i.test(proposalSrc ?? ''))
  check('F2 · ⭐⭐ and it names the MECHANISM that replaces it — verification, ⛔ not a promise',
    /dreaming-verify|span verification|M2-8/i.test(proposalSrc ?? ''))
  check('F3 · ⭐ the exported intent says an ordinary claim plus a separate warrant',
    /ordinary/i.test(AN_ORDINARY_CLAIM_PLUS_A_WARRANT) && /warrant/i.test(AN_ORDINARY_CLAIM_PLUS_A_WARRANT))
  // ⭐ T0_FIELDS survives, and ⛔ still excludes every free-text column.
  for (const banned of ['text', 'reason', 'failure', 'content', 'value']) {
    check(`F4 · ⛔ the structural allowlist still excludes \`${banned}\``, !T0_FIELDS.includes(banned))
  }
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  done()
}
