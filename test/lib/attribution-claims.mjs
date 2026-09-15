// ⭐⭐ F2 INSTRUMENT (detector) — RE-EXPORTED from the one production definition.
//
// The detector lived here while F2's rule was undecided (a detector that quietly became a production dependency before
// the rule was decided would have been the wrong order). On 2026-09-15 Ote commissioned LIVE detection (D11–D14), so the
// definition moved to `Backend/app/components/attribution-detector.js` UNCHANGED and this file became a re-export —
// ⛔ two copies of a pattern list are the `identical-output-means-variable-not-in-loop` family: the experiments and the
// live instrument must fire on exactly the same spans, or a measured base rate says nothing about the other.
//
// Still advisory. Still returns spans, never a verdict. See the component header for what it looks for and why.
export { DETECTOR_VERSION, attributionClaims, userMadeARequest, attributionViolation } from '../../Backend/app/components/attribution-detector.js'
