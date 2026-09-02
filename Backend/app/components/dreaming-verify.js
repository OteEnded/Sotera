// ⭐⭐⭐ SPAN VERIFICATION — M2-8. The SYSTEM checks the citations; the model does not get to count.
//
// PURE. No stores, no IO, no config, no model. Buckets and a proposal are handed in.
//
// ── ⭐⭐ THE RULING (Ote, 2026-09-01) ────────────────────────────────────────────────────────────
// `{value, cites: [{root, span}]}` · **verify every span against THAT root's bucket** · **discard
// unverifiable roots** · **RECOUNT** · **require ≥2 verified independent roots** · ⛔ Dreaming may not
// claim `observed`.
//
// ── ⭐⭐⭐ AND THE QUALIFICATION THAT IS THE WHOLE POINT ────────────────────────────────────────
//
//     *"The evidence warrant proves **these roots actually contain the evidence I claim to have used**.
//      It does **not** prove the resulting value is **true or meaningful**… Dreaming does not get to
//      decide that its paraphrase is true merely because its citations verify."*
//
// ⇒ ⛔ what comes out of this file is an EXISTENCE-AND-INDEPENDENCE RECEIPT — *did she really read
// this?* — and ⛔ NEVER a truth score, a confidence, or a strength. ⭐ Which is why nothing here returns
// a number that could be read as one: `verifiedRoots` is a COUNT OF ROOTS, and the module refuses to
// emit any score-shaped field at all.
//
// ── ⛔⛔ VERIFICATION IS A GATE IN FRONT OF THE PIPELINE, NEVER AN INPUT TO IT ───────────────────
// The locked order: **evidence → proposal + pointers → VERIFY → recall → kind precondition → conflict →
// plan → persistence.** ⇒ this runs before `recall`, and its result must never reach `resolveConflict`:
// a conflict stage that could see a verification count would be one tuning change away from treating
// "well cited" as "more likely true".

/** ⭐ The O-2 floor, ⛔ after the recount rather than before it. */
export const MIN_VERIFIED_ROOTS = 2

/**
 * ⭐ Normalise for comparison — ⛔ deliberately crude and ⛔ NOT a fuzzy matcher.
 * A span either appears in the evidence she was shown or it does not. Whitespace and case are noise;
 * anything more forgiving than this would start verifying paraphrases, which is the failure mode.
 */
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * ⭐⭐⭐ verifyCitations — check every span against ITS OWN root, discard what fails, and RECOUNT.
 *
 * @param {object} o
 * @param {Array<{root: string, span: string}>} o.cites   the model's pointers
 * @param {Array<{root: string, turns: Array<{excerpt: string}>}>} o.buckets  the evidence it was shown
 * @returns {{ok, verifiedRoots, verified, discarded, why}}
 */
export function verifyCitations({ cites = [], buckets = [], minVerifiedRoots = MIN_VERIFIED_ROOTS } = {}) {
  // ⭐ THE BUCKETS ARE THE ONLY SOURCE OF TRUTH HERE. A cite naming a root that was never in evidence is
  // not merely unverifiable — it is a pointer at something the model was never shown.
  const byRoot = new Map()
  for (const b of buckets ?? []) {
    if (b?.root) byRoot.set(b.root, (b.turns ?? []).map((t) => norm(t?.excerpt)))
  }

  const verified = []
  const discarded = []
  for (const c of cites ?? []) {
    const root = c?.root ?? null
    const span = norm(c?.span)
    if (!root || !span) { discarded.push({ root, why: 'a cite must name a root and a span' }); continue }
    const excerpts = byRoot.get(root)
    if (!excerpts) { discarded.push({ root, why: 'cites a root that was not in the evidence' }); continue }
    // ⛔⛔ PER-ROOT, AND THAT IS THE LOAD-BEARING WORD. A span is checked against the bucket it CLAIMS
    // to come from — never against the union of all buckets. A global check would let a sentence from
    // root B verify a citation attributed to root A, which would manufacture exactly the independence
    // O-2 exists to protect: one occasion, cited twice, counted as two.
    if (excerpts.some((e) => e.includes(span))) verified.push({ root, span: c.span })
    else discarded.push({ root, why: 'the span does not appear in that root\'s evidence' })
  }

  // ⭐⭐ THE RECOUNT. ⛔ The model's own count is never used, and one verified span per root counts once
  // however many times that root is cited — otherwise a single occasion cited five times would look
  // like five pieces of support.
  const roots = new Set(verified.map((v) => v.root))
  const verifiedRoots = roots.size

  if (verifiedRoots < minVerifiedRoots) {
    return {
      ok: false,
      verifiedRoots,
      verified,
      discarded,
      // ⭐ Says WHICH stage refused and why, because "not enough" invites someone to lower the number.
      why: `${verifiedRoots} verified independent root(s) after discarding ${discarded.length} unverifiable `
        + `cite(s) — below the floor of ${minVerifiedRoots}. ⛔ The recount decides, never the proposal`,
    }
  }
  return {
    ok: true,
    verifiedRoots,
    verified,
    discarded,
    why: `${verifiedRoots} independent root(s) carry a verified span`
      + (discarded.length ? `; ${discarded.length} cite(s) discarded` : ''),
  }
}

/**
 * ⛔⛔ THE PROVENANCE FLOOR. Dreaming did not OBSERVE anything — it inferred across episodes it read.
 * ⭐ Claiming `observed` would let a synthesis inherit the confidence ceiling of a direct observation,
 * which is the conflation the whole warrant design exists to prevent.
 */
export const DREAMING_PROVENANCE = 'synthesized'

export function assertProvenance(p) {
  if (p === 'observed') {
    throw new Error('refused: Dreaming may not claim provenance `observed` — it inferred across episodes, '
      + 'it did not witness an event')
  }
  return true
}

/** ⛔ Exported so a check can assert the INTENT, not merely the counting. */
export const A_WARRANT_IS_A_RECEIPT_NOT_A_SCORE =
  'Verification establishes that the roots cited actually contain the evidence claimed, and nothing more. '
  + 'Each span is checked against the bucket it claims to come from rather than against all of them, '
  + 'because a global check would let one occasion verify two citations and manufacture the independence '
  + 'root-counting exists to protect. Unverifiable cites are discarded and the roots are counted again, so '
  + 'the floor is applied to what survived rather than to what was proposed. It proves she really read '
  + 'this; it does not prove she is right, and nothing here returns a number that could be read as '
  + 'confidence.'
