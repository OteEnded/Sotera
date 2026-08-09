// Persona Memory V3 — the GRAY-ZONE RESOLVER (RFC §15). A CHAIN LINK, not a replacement.
//
// Ote's framing: the resolver is becoming a pipeline of its own — alias lookup → cosine → gray-zone LLM →
// ontology — where each stage RESOLVES, DEFERS, or PASSES to the next. So this does not replace the cosine
// resolver; it WRAPS it:
//
//     base.resolve()  →  resolved?  →  return it (cheap path: alias / label / cosine)
//                     →  missed?   →  is the best cosine inside the GRAY BAND?
//                                       no  → return the miss (a genuinely new concept)
//                                       yes → ask the aux LLM "same slot?" ONE time
//
// WHY a band at all: cosine ranges OVERLAP. On the real embedder a genuinely SAME slot scored 0.744 while
// genuinely DIFFERENT slots scored 0.856, so no threshold separates them — but the AMBIGUOUS region is
// narrow, and that is where an expensive judgement is affordable. Outside the band cosine is trusted.
// Caught in the wild: "favorite drink" (oat milk flat white) vs "coffee order" (oat milk cortado) stayed two
// live contradictory rows. Uniqueness per ATTRIBUTE is not uniqueness per CONCEPT — this stage is the fix.
//
// ROLLOUT (Ote, binding):
//   • mode 'off'    — never call the LLM (default).
//   • mode 'shadow' — adjudicate, LOG + COUNT the verdict, and return the BASE result UNCHANGED. Nothing
//                     about behaviour changes; we learn how often it would fire, how often it would agree,
//                     what it would cost, and how many aliases it would have taught us.
//   • mode 'on'     — the verdict becomes authoritative AND is PROMOTED to a learned alias (see below).
//
// ALIAS PROMOTION — GRAYZONE IS A TEACHER, NOT A PERMANENT DEPENDENCY (Ote's reframing, 2026-07-30).
// Its purpose is not to adjudicate every hard case forever; it is to meet an ambiguity ONCE, teach the
// deterministic resolver, and make itself unnecessary for that concept:
//     ambiguity → adjudicate → learned alias → every future write is a free lexical hit
// So in 'on' mode a SAME verdict emits `evidence.learn` — a PROPOSAL, never a write (this stage is
// classification-only and must not know persistence exists). Persistence honours the attribution and counts
// `cache_promotions`. SHADOW mode promotes NOTHING: its resolution is unchanged, so there is no slot to
// learn onto. (Correction for the record: an earlier comment here claimed no promotion happened in ANY mode
// — that was wrong. In 'on' mode the incoming phrasing was already being recorded, just unattributed and
// uncounted, because the store records the phrasing of whatever slot it lands on.)
//
// Deps at construction (timeless interface); it satisfies the same `Resolver` contract as everything else.

import { recordGrayZone } from './memory-resolver-telemetry.js'

export const GRAY_ZONE_MODE = { off: 'off', shadow: 'shadow', on: 'on' }

/**
 * buildGrayZonePrompt — a deliberately narrow question. It gets ONLY the two phrasings, never the values:
 * we are asking about CONCEPT IDENTITY, not about which value is true (that is the ConflictResolver's job).
 * PURE + exported so the prompt is unit-testable and reviewable.
 */
export function buildGrayZonePrompt(incoming, candidate) {
  // PROMPT v2. v1 was measured on a ground-truthed corpus and showed a systematic bias toward DIFFERENT:
  // it split obvious paraphrases ("bedtime" vs "typical bedtime", "main editor" vs "preferred text editor").
  // Diagnosis: v1 asked whether the phrases were the same, which invites "the wording differs → different".
  // v2 asks the operational question instead — would ONE answer serve BOTH? — and shows worked examples of
  // paraphrase (SAME) next to sibling properties (DIFFERENT), which is the distinction that actually matters.
  return 'You are matching two labels for a property of a person, to decide if they are the same field in a profile.\n\n' +
    `A: "${incoming}"\nB: "${candidate}"\n\n` +
    'Ask: if the person gave ONE answer, would it fill BOTH labels? Wording differences do not matter — ' +
    'paraphrases, synonyms and added or dropped words all count as SAME.\n\n' +
    // Examples are deliberately NOT drawn from the evaluation corpus — the test pairs stay held out, so a
    // score measures judgement rather than recall of the prompt.
    'SAME examples:\n' +
    '  "job" / "current occupation" — one answer fills both\n' +
    '  "shirt size" / "usual shirt size" — the same field, one is just wordier\n' +
    '  "phone" / "mobile number" — same field, different phrasing\n' +
    'DIFFERENT examples:\n' +
    '  "height" / "weight" — two separate answers\n' +
    '  "employer" / "job title" — related, but distinct fields\n' +
    '  "first language" / "second language" — sibling properties, separate answers\n\n' +
    'Reply with exactly one word: SAME or DIFFERENT.'
}

/** PURE: read a SAME/DIFFERENT verdict out of a model reply. Unparseable → null (treated as no verdict). */
export function parseGrayZoneVerdict(raw) {
  const t = String(raw ?? '').toUpperCase()
  const same = /\bSAME\b/.test(t)
  const diff = /\bDIFFERENT\b/.test(t)
  if (same === diff) return null // both or neither → no usable verdict
  return same
}

/**
 * createGrayZoneResolver — wraps a base resolver with one aux-LLM adjudication inside the band.
 *
 * @param {object} deps
 * @param {{resolve:Function, indexVectorFor?:Function}} deps.base   the cheap resolver (cosine v1)
 * @param {(prompt:string)=>Promise<string>} [deps.llm]              aux model; absent → behaves as 'off'
 * @param {string} [deps.mode]      GRAY_ZONE_MODE — default 'off'
 * @param {number} [deps.min]       band floor (default 0.70)
 * @param {number} [deps.max]       band ceiling (default 0.85) — above it cosine already resolved
 * @param {number} [deps.tie]       near-tie epsilon: two candidates this close also count as ambiguous
 * @param {object|null} [deps.log]
 * @param {object|null} [deps.events]  event bus for telemetry emits
 * @param {()=>number} [deps.now]   injectable clock (latency measurement in tests)
 */
export function createGrayZoneResolver({ base, llm = null, mode = GRAY_ZONE_MODE.off, min = 0.70, max = 0.85, tie = 0.02, log = null, events = null, now = () => Date.now() } = {}) {
  if (!base?.resolve) throw new Error('createGrayZoneResolver requires a base resolver')
  const active = mode !== GRAY_ZONE_MODE.off && typeof llm === 'function'

  async function resolve(observation, context = {}) {
    const result = await base.resolve(observation, context)
    // the cheap arms decided → nothing to adjudicate
    if (!active || result.slotId) return result

    const cos = result.evidence?.bestCosine ?? 0
    const nearest = result.evidence?.nearest ?? null
    if (!nearest || cos < min || cos > max) return result // outside the band: trust the miss

    const candidate = (context.slots || []).find((s) => s.slotId === nearest)
    if (!candidate) return result

    // time the WHOLE adjudication and the aux-inference portion separately, so "why is it slow?" is
    // answerable from data instead of assumed (Ote: break it down before optimising).
    const t0 = now()
    const prompt = buildGrayZonePrompt(observation.attribute, candidate.canonicalLabel)
    const tLlm = now()
    let verdict = null
    let errored = false
    try {
      verdict = parseGrayZoneVerdict(await llm(prompt))
    } catch (e) {
      errored = true
      log?.warn?.({ err: e?.message }, 'memory.resolver: gray-zone adjudication failed (falling back to cosine)')
    }
    const llmMs = now() - tLlm
    const latencyMs = now() - t0
    recordGrayZone({ mode, cosine: cos, same: verdict === true, baseResolved: false, latencyMs, llmMs, error: errored, events })

    if (errored || verdict == null) return result

    const evidence = { ...result.evidence, grayZone: { mode, cosine: cos, candidate: candidate.canonicalLabel, verdict: verdict ? 'same' : 'different', latencyMs } }

    if (mode === GRAY_ZONE_MODE.shadow) {
      // OBSERVE ONLY. The returned slotId is untouched, so behaviour is identical to cosine-alone — the
      // verdict exists purely as evidence + counters until Ote flips it on.
      log?.info?.(
        { incoming: observation.attribute, candidate: candidate.canonicalLabel, cosine: cos, verdict: verdict ? 'SAME' : 'DIFFERENT' },
        verdict ? 'memory.resolver[shadow]: gray zone WOULD HAVE bridged these concepts' : 'memory.resolver[shadow]: gray zone agrees they are different',
      )
      return { ...result, evidence }
    }

    // mode 'on' — the verdict is authoritative.
    if (!verdict) return { ...result, evidence }
    return {
      slotId: candidate.slotId,
      confidence: Math.max(cos, min),
      evidence: {
        ...evidence,
        via: 'gray-zone',
        // ALIAS PROMOTION as a PROPOSAL, never a write (the resolver stays classification-only and must not
        // know persistence exists — RFC §6). Persistence acts on this, attributing it correctly and counting
        // it. This is the mechanism that makes GrayZone a TEACHER rather than a permanent hot-path
        // dependency (Ote): one adjudication becomes a learned term, and every future write of that phrasing
        // is a free lexical hit — System 2 teaching System 1, so the expensive path runs less over time.
        learn: { slotId: candidate.slotId, phrase: observation.attribute, by: 'gray-zone', confidence: Math.max(cos, min) },
      },
    }
  }

  // pass the private-index port through untouched — the chain must not break §8a
  return { resolve, indexVectorFor: base.indexVectorFor ? (o) => base.indexVectorFor(o) : undefined, mode, band: { min, max, tie } }
}
