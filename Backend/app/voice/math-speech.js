// LATEX → WORDS. Maths phase 2: the formula gets SPOKEN instead of pointed at.
//
// Phase 1 could only say where a formula was ("Here, a formula in the message.") because there was nothing
// honest to read aloud — `$$E = mc^2$$` read literally is dollar signs and carets. ⚠ I twice told Ote a real
// engine was too heavy and a vocabulary would have to be hand-listed; I had not looked. `speech-rule-engine`
// is the standalone math-speech engine from ChromeVox — pure JS, no Python, no CUDA — and it handles the
// nested fractions and integrals I called intractable.
//
// ── THE PIPELINE, AND THE ONE STEP THAT IS EASY TO GET WRONG ──────────────────────────────────────────
//   LaTeX → katex.renderToString(tex, {output:'mathml'}) → EXTRACT <math>…</math> → SRE.toSpeech()
//
// ⚠⚠ EXTRACT THE <math> ELEMENT ALONE. KaTeX returns it wrapped in `<span class="katex">…</span>`, and SRE
// handed that wrapper does not fail — it falls back to scraping text out of the markup, which is SILENTLY
// WRONG and much worse than an error. Measured 2026-08-06 on `\frac{a}{b}+\sqrt{x}`:
//     wrapper   "ab plus x backslash frac open brace a close brace open brace b close brace plus …"
//     <math>    "a over b plus the square root of x"
// The wrapper version reads the LaTeX SOURCE out loud, backslashes and braces included, after first
// mispronouncing the formula. Every other case measured the same way (the quadratic formula came back as
// "x equals minus b plus or minus b 2 minus 4 ac 2 ax equals backslash frac open brace …").
//
// ── WHY CLEARSPEAK AND NOT MATHSPEAK ──────────────────────────────────────────────────────────────────
// Both ship with SRE. Ote listened to them side by side (test/experiments/results/math-speech-compare.html)
// and settled it by ear: *"'ClearSpeak is dramatically more natural', agreed"*. It is NOT a setting — a
// toggle here would be a second place for the decision to live, and he has already made it.
// The difference is not subtle: on Bayes' theorem MathSpeak takes ~21s of speech, ClearSpeak ~7s.
//
// ── SYNCHRONOUS, WHICH IS WHAT KEEPS speakable.js SIMPLE ──────────────────────────────────────────────
// setupEngine() is async and costs 48ms ONCE (measured). toSpeech() afterwards is synchronous, 2-13ms per
// formula. So the engine is warmed at module load and `speakMath` is a plain sync function — `toSpeakable`
// stays pure and sync, and every one of its callers stays unchanged.
//
// ⚠ EVERY FAILURE RETURNS null, AND null MEANS "USE THE SIGNPOST". Never a throw, never a partial reading:
// a formula read wrongly is worse than a formula pointed at, because the listener cannot tell it was wrong.

import katex from 'katex'
import * as SREns from 'speech-rule-engine'

// ⚠ CJS/ESM INTEROP, AND IT FAILS QUIETLY. speech-rule-engine is CommonJS: `import * as` yields a namespace
// whose real members sit under `.default`, so `SREns.setupEngine` is undefined — not an import error, a
// TypeError at call time, which this module catches and turns into "engine not ready" ⇒ every formula
// silently falls back to the signpost. That is phase 1 behaviour wearing phase 2's clothes, and only the
// warm-up assertion in the test catches it. `require()` returns the members directly, which is why the
// probe worked and the first cut of this file did not.
const SRE = SREns.default ?? SREns

// A formula longer than this is a wall of speech nobody can follow — a 40-term expansion read aloud is not
// comprehension, it is noise. Those keep the signpost, which is the honest answer for something you have to
// look at anyway.
const MAX_TEX = 400

let ready = false
let failed = null

// Pre-warm at import. Fire-and-forget on purpose: if it never resolves, `ready` stays false and every
// formula falls back to the signpost — exactly the phase-1 behaviour, which is a working system.
const warm = (async () => {
  try {
    await SRE.setupEngine({ locale: 'en', domain: 'clearspeak', style: 'default', modality: 'speech' })
    if (SRE.engineReady) await SRE.engineReady()
    ready = true
  } catch (e) {
    failed = e?.message || String(e)
  }
})()

/** Resolves once the engine is warm (or has given up). For boot and for tests — never needed on the hot path. */
export async function mathSpeechReady() {
  await warm
  return { ready, failed }
}

/** Is the engine usable right now? Exported so a caller can explain a fallback rather than guess at one. */
export const mathSpeechAvailable = () => ready

/**
 * Speak one LaTeX formula, or null if it cannot be spoken honestly.
 * @param {string} tex the formula WITHOUT its delimiters ($$, \[ \], $)
 * @param {{display?: boolean}} opts display maths gets displayMode (affects \int limits, \sum bounds)
 * @returns {string|null} words, or null to fall back to the signpost
 */
// LATEX SPACING MACROS ARE INVISIBLE TO THE EYE AND MUST BE INAUDIBLE TOO.
//
// `\,` `\;` `\!` `\quad` and friends are pure typesetting — they position glyphs and mean nothing. KaTeX
// turns them into <mspace>, and 5.0.0-rc.4 READS THAT ALOUD: `\int_0^\infty e^{-x^2}\,dx` came back as
// "…end exponent EMPTY d x…" (4.1.4 ignores it, so this is an RC regression). A thin space before `dx` is
// how essentially every integral is written, so this is not an edge case.
//
// ⚠ THE LOOKBEHIND IS LOAD-BEARING. `\\` is a ROW BREAK in a matrix, not an escape — without `(?<!\\)` the
// pattern would eat the second backslash of `\\,` and turn a row break into a stray `\`, corrupting the
// formula instead of tidying it.
const stripSpacing = (tex) => tex
  .replace(/(?<!\\)\\[,;:!]/g, '')
  .replace(/\\(?:thinspace|medspace|thickspace|enspace|negthinspace|qquad|quad)\b/g, ' ')
  .replace(/\\hspace\s*\{[^}]*\}/g, ' ')

// `mathvariant="normal"` IS THE DEFAULT, SO SAYING IT ALOUD IS SAYING NOTHING.
//
// KaTeX stamps it on upright symbols, and SRE 4.1.4 verbalises it: `\int_0^\infty` came back as
// "the integral from 0 to NORMAL infinity", and `\Gamma(n)` as "NORMAL Gamma of n". It is the one wart
// 4.1.4 has that rc.4 does not, and it is ours to remove rather than a reason to stay on a prerelease.
//
// ⚠ ONLY THE `normal` VALUE. Every other variant carries real meaning a listener needs, and stripping the
// attribute wholesale would silently flatten notation — verified after the change:
//     \mathbb{R} → "the real numbers"   \mathbf{v} → "bold v"   \mathcal{L} → "script L"
const dropDefaultVariant = (mathml) => mathml.replace(/\s+mathvariant="normal"/g, '')

export function speakMath(tex, { display = true } = {}) {
  const src = stripSpacing(String(tex ?? '')).trim()
  if (!ready || !src || src.length > MAX_TEX) return null
  try {
    // throwOnError:false is what makes a malformed formula a FALLBACK rather than a 500 on the speech path.
    // KaTeX then renders an error node instead of MathML, which carries no <math> — so the extract below
    // returns null and the caller signposts. Verified: `\frac{` produces no <math> at all.
    const html = katex.renderToString(src, { output: 'mathml', throwOnError: false, displayMode: display })
    const math = (html.match(/<math[\s\S]*?<\/math>/) || [null])[0]
    if (!math) return null
    const words = String(SRE.toSpeech(dropDefaultVariant(math)) ?? '').trim()
    // An empty or punctuation-only reading is a failure wearing a success's clothes.
    if (!words || !/[\p{L}\p{N}]/u.test(words)) return null
    return words
  } catch {
    return null
  }
}
