// ⭐⭐⭐ THE MODALITY PRODUCER — *how was this statement meant to be taken?*
//
// PURE. `llm` is injected; there is no store, no config, no host, and ⛔ **nothing here is wired into
// the live extraction pipeline.** Ote, 2026-08-26: *"I want the producer built as an extraction-only
// experiment/harness first, not immediately wired into live persistence."*
//
// ── ⭐⭐ THE ARCHITECTURAL PROPERTY THIS FILE EXISTS TO HOLD ───────────────────────────────────────
// Ote: *"modality must describe what the statement is DOING/means, independently of provenance
// describing where the words came from. In particular, `quoted` must be allowed to coexist with
// `figurative`, `aspirational`, etc. Don't collapse those axes back together."*
//
// ⇒ this module NEVER sees a provenance value, never returns one, and never takes one as input. The two
// classifiers run over the same text and are compared side by side in the harness, so their independence
// is a MEASURED result rather than a promise in a comment. `7d383ce3` is the case: `quoted` is TRUE of
// it — he really did say those words, and `classifyCapture` verifies the span — and it is still not a
// literal proposition.
//
// ── ⭐ THE MECHANISM, AND WHY IT IS THE SAME ONE THIS CODEBASE ALREADY TRUSTS ─────────────────────
// `classifyCapture` and `interpretIdentityLlm` both work by making the producer **point at the text**,
// then checking the pointer deterministically. That is what makes their output auditable without a
// second model call and without a lexicon. Modality gets the same treatment:
//
//   1. the model names a class AND quotes the CUE — the words that carry the signal
//   2. the cue is checked against the source text, deterministically, here
//   3. ⛔ a class that cannot point is DEMOTED to `null` — *"nobody recorded how this was meant"* —
//      never to a guess, and never to `asserted`
//
// ⚠️ AND THE CUE IS REQUIRED ONLY FOR THE NON-ASSERTED CLASSES, which is not an inconsistency. Assertion
// is the UNMARKED case: *"I work out of Bangkok"* carries no marker at all, so demanding a cue for it
// would make the honest default unprovable. Claiming a statement is figurative, aspirational,
// hypothetical or reported is claiming something MARKED — and a marked claim can point at its mark.
//
// ── ⛔ PROMPT CONTAMINATION IS A FIRST-CLASS FAILURE ON THIS PROJECT ──────────────────────────────
// ⚠️⚠️ NOT ONE EXAMPLE BELOW COMES FROM THE TEST MATRIX. No Rome, no "build X in one day", no "you are
// my X", no proverb about cities. Handing the model the vocabulary of the case and then measuring it as
// the model's own reading is a finding that gets **withdrawn, not salvaged** — it happened once already
// on this project. The examples are deliberately drawn from unrelated domains.

import { MODALITY, MODALITY_VALUES, normalizeModality, slotViolation } from './memory-modality.js'

const flat = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

/** ⭐ Assertion is unmarked; everything else must point at its mark. */
const NEEDS_CUE = new Set([MODALITY.aspirational, MODALITY.figurative, MODALITY.reported, MODALITY.hypothetical])

export function buildModalityPrompt({ text, proposition }) {
  return 'A fact was extracted from something a person said. Decide how the person MEANT the statement '
    + 'that the fact came from.\n\n'
    + `WHAT THEY SAID:\n${String(text ?? '').slice(0, 2000)}\n\n`
    + `WHAT WAS EXTRACTED FROM IT:\n${String(proposition ?? '').slice(0, 400)}\n\n`
    + 'Choose ONE of:\n'
    + '  asserted     — they put it forward as simply true.\n'
    + '  aspirational — they said they WANT it or are trying for it. It is not the case yet.\n'
    + '  figurative   — the words are not to be taken at face value. A comparison, an image, an '
    + 'exaggeration, a nickname.\n'
    + '  reported     — they are repeating someone else\'s words or a saying. The claim is not theirs.\n'
    + '  hypothetical — they are supposing or imagining it, not claiming it.\n\n'
    + 'Also list any OTHER classes that genuinely apply as well, in `also`. Usually none. Only list one '
    + 'if the statement really is doing two things at once.\n\n'
    + 'And quote the CUE: the exact words from what they said that make it that class. Copy them '
    + 'character for character from the text above. If it is `asserted` there is usually no cue — leave '
    + 'it empty, that is a normal answer.\n\n'
    + 'Return ONLY JSON:\n'
    + '{"modality":"","also":[],"cue":"","why":""}\n\n'
    + 'Examples:\n'
    + '  "my laptop is the 14 inch one" / laptop size: 14 inch\n'
    + '      -> {"modality":"asserted","also":[],"cue":"","why":"stated as fact"}\n'
    + '  "one day I\'d love to learn the cello properly" / plays cello\n'
    + '      -> {"modality":"aspirational","also":[],"cue":"I\'d love to","why":"a wish, not a state"}\n'
    + '  "my inbox is a warzone this week" / inbox is a warzone\n'
    + '      -> {"modality":"figurative","also":[],"cue":"is a warzone","why":"an image, not literal"}\n'
    + '  "my doctor keeps saying I sleep too little" / sleeps too little\n'
    + '      -> {"modality":"reported","also":[],"cue":"my doctor keeps saying","why":"the doctor\'s claim"}\n'
    + '  "say I moved to Berlin next year, would you still reach me?" / moved to Berlin\n'
    + '      -> {"modality":"hypothetical","also":[],"cue":"say I","why":"supposed, not claimed"}\n'
}

/** Pull the first JSON object out of a reply and normalise it. PURE. Never throws. */
export function parseModalityReply(raw) {
  const m = String(raw ?? '').match(/\{[\s\S]*\}/)
  if (!m) return null
  let o = null
  try { o = JSON.parse(m[0]) } catch { return null }
  if (!o || typeof o !== 'object') return null
  const also = Array.isArray(o.also) ? o.also.map((x) => normalizeModality(x)).filter(Boolean) : []
  return {
    proposed: normalizeModality(o.modality),
    // ⚠️ EXPERIMENT-ONLY AUDIT CHANNEL, AND IT IS NOT A SECOND COLUMN. Ote ruled the vocabulary FLAT and
    // said not to build act-vs-term yet. `also` exists to answer one measurable question — *is one value
    // ever insufficient?* — because the alternative is deciding that from my own intuition. ⛔ Nothing
    // downstream reads it and no schema holds it.
    also: [...new Set(also)],
    cue: String(o.cue ?? '').trim().slice(0, 300),
    why: String(o.why ?? '').trim().slice(0, 300),
  }
}

/**
 * ⭐⭐ verifyModality — the deterministic half. PURE.
 *
 * ⛔ IT ONLY EVER DEMOTES. A model cannot talk its way UP into a marked class; it can only fail to point
 * at the mark and fall back to "unrecorded". That asymmetry is the same one `classifyCapture` uses, and
 * it is what makes the classification auditable rather than merely plausible.
 *
 * ⚠️ AND `null` IS THE DEMOTION TARGET, NOT `asserted`. Reading an unverifiable claim as "they meant it
 * literally" would silently rebuild the exact failure the axis exists for. `null` means nobody recorded
 * it, which keeps the slot OPEN — so the demotion is honest about being permissive rather than pretending
 * to be a protection.
 */
export function verifyModality(parsed, { text, proposition } = {}) {
  if (!parsed?.proposed) {
    return { modality: null, verified: false, reason: 'no class was proposed' }
  }
  const cls = parsed.proposed
  if (!NEEDS_CUE.has(cls)) return { modality: cls, verified: true, reason: 'asserted is the unmarked case — no cue required' }
  const hay = flat(text)
  const cue = flat(parsed.cue)
  if (!cue) return { modality: null, verified: false, reason: `claimed ${cls} but quoted no cue` }
  if (!hay.includes(cue)) return { modality: null, verified: false, reason: `the cue is not in what was said: "${parsed.cue.slice(0, 60)}"` }
  void proposition
  return { modality: cls, verified: true, reason: `the cue "${parsed.cue.slice(0, 60)}" is the person's own words` }
}

/**
 * interpretModality — one statement + the fact taken from it → a modality, or null. Never throws.
 *
 * @returns {{modality, proposed, also, cue, why, verified, reason, demoted, slotAllowed, slotReason}}
 */
export async function interpretModality({ llm, text, proposition, onSkip = null } = {}) {
  const empty = (reason) => ({
    modality: null, proposed: null, also: [], cue: '', why: '', verified: false, reason,
    demoted: false, slotAllowed: true, slotReason: null,
  })
  if (!text || !String(text).trim()) return empty('no source text')
  let raw = ''
  try { raw = await llm(buildModalityPrompt({ text, proposition })) } catch (e) {
    onSkip?.({ reason: 'llm-failed', detail: e?.message })
    // ⛔ A FAILED CALL AND A CONFIDENT `asserted` MUST NOT LOOK ALIKE. "We could not ask" is recorded as
    // unrecorded, which is what it is — this project has already paid for a silence that read as a result.
    return empty('the interpreter could not be reached')
  }
  const parsed = parseModalityReply(raw)
  if (!parsed) { onSkip?.({ reason: 'unparseable', detail: String(raw).slice(0, 120) }); return empty('the reply was not JSON') }
  const v = verifyModality(parsed, { text, proposition })
  // ⭐ The slot verdict is DERIVED from the same predicate the store enforces — ⛔ never re-implemented
  // here. A harness that computed its own answer would be measuring itself.
  const probe = { modality: v.modality, entity: 'user', attribute: 'x', value: String(proposition ?? 'x') }
  const slotReason = slotViolation(probe)
  return {
    modality: v.modality,
    proposed: parsed.proposed,
    also: parsed.also,
    cue: parsed.cue,
    why: parsed.why,
    verified: v.verified,
    reason: v.reason,
    demoted: !!parsed.proposed && parsed.proposed !== v.modality,
    slotAllowed: !slotReason,
    slotReason,
  }
}

export { MODALITY, MODALITY_VALUES }
