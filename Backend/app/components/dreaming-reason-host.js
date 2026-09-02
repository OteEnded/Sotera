// ⭐⭐⭐ THE M2 REASONER — it PROPOSES, and it persists NOTHING.
//
// ⛔⛔ THERE IS NO WRITE PATH IN THIS MODULE. It imports no store, and `proposeFromBuckets` returns an
// object. Persistence is a caller's act, and under M2-12a a caller may not perform it against the live
// persona while P1 observes.
//
// ── ⭐⭐ THE LOCKED PIPELINE, AND THIS FILE OWNS EXACTLY TWO STAGES OF IT ────────────────────────
//
//   evidence → [PROPOSAL + POINTERS] → [VERIFY] → recall → kind precondition → conflict → plan → persist
//                ↑ here                  ↑ here
//
// ⭐ *"Dreaming proposes. Memory decides. Persistence executes."* ⛔ Verification is a gate IN FRONT of
// the memory pipeline and is NEVER an input to conflict resolution.
//
// ── ⛔⛔ THE MODEL IS NEVER TOLD HOW MANY ROOTS THERE ARE ────────────────────────────────────────
// It receives BUCKETS with opaque labels and must cite by label. ⭐ The system counts — the model
// proposes. Handing it an aggregate is how *"this keeps happening"* gets asserted rather than
// established, which is the failure O-2 exists to prevent.
//
// ── ⚠️ CPU-SIDE, FORCED, AND IT IS A PHASE CONSTRAINT RATHER THAN A PREFERENCE ─────────────────
// Ote, 2026-09-03: *"keep it CPU-side during this observation phase… Don't trade semantic isolation for
// GPU contention."* ⇒ `numGpu: 0` is set HERE and unconditionally, ⛔ not inherited from
// `memory.auxDevice` — a GPU-placed aux model evicts her chat model and costs ~29 s on the next real
// turn, which would disturb the very runtime P1 is observing.

import { chat } from '../chat-runtime/index.js'
import { splitModelId, extractModel } from './memory-aux-llm-host.js'
import { validateClaim } from './dreaming-proposal.js'
import { verifyCitations, DREAMING_PROVENANCE, assertProvenance } from './dreaming-verify.js'

/** ⛔ Declared, never inferred from source. */
export const PROPOSE_DEPS = Object.freeze(['llm', 'buckets', 'entity', 'attribute', 'kind'])

/** ⭐ Bumped when the prompt changes, so a proposal can be attributed to the text that produced it. */
export const REASONER_GENERATION = 1

/**
 * ⭐ The aux model, pinned to the CPU. ⛔ Separate from `makeAuxLlm` ONLY in that `numGpu` is forced
 * rather than conditional — everything else is deliberately the same idiom as every aux sibling.
 */
export function makeDreamingLlm(fastify, { modelId = null, maxTokens = 400, userId = null } = {}) {
  const { provider, model } = splitModelId(modelId || extractModel(fastify.config))
  return async (prompt) => {
    const res = await chat({
      serverConfig: fastify.config,
      request: {
        provider,
        model,
        messages: [{ role: 'user', content: prompt }],
        options: {
          stream: false,
          reasoning: { enabled: false },
          max_tokens: maxTokens,
          temperature: 0,
          // ⛔⛔ FORCED. See the header: this is a phase constraint, not a tunable.
          numGpu: 0,
          keepAlive: '5m',
        },
        userId,
      },
    })
    return res?.message?.content || ''
  }
}

/**
 * ⭐ The prompt. Deliberately SMALL and structural.
 * ⛔ It does not describe Dreaming, does not name a form, and does not say what a good answer looks
 * like beyond the shape — handing the model a vocabulary and then measuring it as the model's own is a
 * contamination this project has already had to withdraw a finding over.
 */
export function buildPrompt({ buckets, entity, attribute }) {
  const shown = buckets.map((b) => {
    // ⭐⭐⭐ ONE IDENTITY PER BUCKET — `root`, the SAME STRING `verifyCitations` keys on.
    //
    // ⚠️⚠️ THIS LINE HELD A SILENT, TOTAL FAILURE. It used to read ``b.label ?? `r${i + 1}` `` — two
    // names for one thing — and 12b's caller passed `{root: b.label, turns}`, which stripped `label`.
    // ⇒ the prompt showed `[r1] [r2] [r3]`, the model cited `r1`, and the verifier looked up `g1`.
    // **EVERY CITE WAS DISCARDED, ALWAYS, WHATEVER THE MODEL DID** — 8 of 8 on the natural corpus and
    // 6 of 6 on a fixture whose spans were verbatim substrings.
    //
    // ⛔⛔ AND IT FAILED IN THE DIRECTION THAT LOOKS LIKE A FINDING: "the model's citations do not
    // verify" is exactly what a working gate would report, so the bug wore the costume of the result it
    // was corrupting. ⭐ A fallback that invents an identifier is never harmless — if the label is
    // missing, the caller is wrong and it must be loud.
    if (!b?.root) throw new TypeError('every bucket must carry a `root` — it is the identity the model cites and the verifier checks')
    const lines = b.turns.map((t) => `  - ${t.excerpt}`).join('\n')
    return `[${b.root}]\n${lines}`
  }).join('\n\n')
  return `Below are excerpts from separate conversations, grouped by conversation.

${shown}

Question: what does "${entity} / ${attribute}" appear to be, based ONLY on the excerpts above?

Answer with JSON and nothing else:
{"value":"<one short statement>","kind":"<one word for what kind of answer this is>","cites":[{"root":"<group label>","span":"<exact text copied from that group>"}]}

Rules:
- Every "span" must be copied EXACTLY from the group you name. Do not paraphrase a span.
- Cite from at least two different groups.
- If the excerpts do not support a statement, answer {"value":null}.`
}

/** ⭐ Parse defensively. ⛔ A model that returned prose has not proposed — it has failed to. */
export function parseProposal(raw) {
  const text = String(raw ?? '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return { ok: false, why: 'no JSON object in the reply', raw: text }
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    if (parsed?.value === null || parsed?.value === undefined) {
      // ⭐ AN HONEST NULL IS A RESULT, ⛔ not a failure. "The evidence does not support a statement" is
      // exactly what an instrument should be able to say.
      return { ok: false, declined: true, why: 'the model declined — the excerpts support no statement', parsed }
    }
    return { ok: true, parsed }
  } catch (e) {
    return { ok: false, why: `unparseable JSON: ${e.message}`, raw: text }
  }
}

/**
 * ⭐⭐⭐ proposeFromBuckets — propose, then VERIFY. ⛔ Returns; never writes.
 *
 * @returns {{ok, stage, claim, verification, raw, why}}
 */
export async function proposeFromBuckets({
  llm, buckets = [], entity, attribute, kind = null, minVerifiedRoots = 2,
} = {}) {
  if (typeof llm !== 'function') throw new TypeError('proposeFromBuckets requires an llm(prompt) function')
  if (!entity || !attribute) throw new TypeError('proposeFromBuckets requires an entity and an attribute')
  // ⛔ BELOW THE FLOOR THERE IS NOTHING TO ASK. One occasion is Reflection's territory, and spending a
  // generation to be refused later is waste with a chance of confabulation attached.
  if (buckets.length < minVerifiedRoots) {
    return { ok: false, stage: 'evidence', why: `${buckets.length} bucket(s) — below the floor of ${minVerifiedRoots}` }
  }

  const prompt = buildPrompt({ buckets, entity, attribute })
  const raw = await llm(prompt)
  const parsed = parseProposal(raw)
  if (!parsed.ok) return { ok: false, stage: 'proposal', why: parsed.why, declined: parsed.declined === true, raw }

  const claim = {
    entity,
    attribute,
    value: String(parsed.parsed.value ?? '').trim(),
    // ⛔ THE MODEL'S `kind` IS A PROPOSAL, NOT A DECLARATION. M2-10: kind is declared by something that
    // knows the question. The caller may override; the memory-layer precondition compares it to the
    // SLOT's declared kind and DEFERS on a mismatch.
    kind: kind ?? String(parsed.parsed.kind ?? '').trim(),
    cites: Array.isArray(parsed.parsed.cites) ? parsed.parsed.cites : [],
  }

  const valid = validateClaim(claim)
  if (!valid.ok) return { ok: false, stage: 'grammar', why: valid.why, claim, raw }

  // ⭐⭐ THE SYSTEM VERIFIES AND RECOUNTS. ⛔ The model's own citation count is never used.
  const verification = verifyCitations({ cites: claim.cites, buckets, minVerifiedRoots })
  if (!verification.ok) {
    return { ok: false, stage: 'verification', why: verification.why, claim, verification, raw }
  }

  // ⛔ Dreaming inferred; it did not witness. Throws rather than silently downgrading.
  assertProvenance(DREAMING_PROVENANCE)
  return {
    ok: true,
    stage: 'verified',
    claim,
    verification,
    provenance: DREAMING_PROVENANCE,
    raw,
    why: verification.why,
  }
}

/** ⛔ Exported so a check can assert the INTENT, not merely the branching. */
export const DREAMING_PROPOSES_AND_THE_SYSTEM_COUNTS =
  'The reasoner receives evidence grouped into opaque buckets and must cite by label, so it is never '
  + 'handed an aggregate it could assert. It proposes a value, a kind and pointers; the system verifies '
  + 'every span against the bucket it claims to come from, discards what fails and recounts before the '
  + 'floor is applied. There is no store import and no write path here: it returns a proposal, and '
  + 'persisting one is a separate act by a caller that is allowed to.'
