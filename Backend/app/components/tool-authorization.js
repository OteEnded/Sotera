// ⭐⭐⭐ THE DISPATCH BOUNDARY — only a tool that was OFFERED may execute. PURE. No db, no io.
//
// Ote, 2026-09-02: *"We have `toolDefinitions(REFLECTION_TOOLS)` filtering `remember_fact` out of the
// reflection surface, while `runTool(call.name, …)` does not enforce that same authorization boundary…
// If the model emits a tool that was not offered, it must not execute. Refuse it safely and record the
// event/attempt so it remains observable."*
//
// ── ⚠️⚠️ THE MEASUREMENT THAT PUT THIS HERE, AND WHAT IT ACTUALLY SAID ──────────────────────────────
// `remember_fact` is withheld from reflection by design. The audit shows **9 attempts across 3 days**,
// and **every one failed** — all with the same message:
//
//     entity, attribute, value are required
//     arg_keys: {attribute,name,value} · {category,name,value} · {key,type,value} · {content} · {content,kind}
//
// ⭐⭐ SHE WAS GUESSING THE ARGUMENT NAMES OF A TOOL SHE HAD NEVER BEEN SHOWN. A withheld tool's schema
// is never sent, so she knew the NAME (`remember`'s own description tells her to use `remember_fact` for
// subject-attribute-value facts) and not the shape. Five different invented shapes, nine failures, and
// the last four fall back to `{content}` / `{content,kind}` — the shape of the tool she DOES have.
//
// ⇒ ⛔ The old story — *"she walked through the closed door"* — is FALSE. She knocked, repeatedly, and
// got a validation error that could not tell her the door was not hers. ⭐ A refusal that NAMES the
// boundary and lists what she does have is strictly more useful than an error she cannot act on, which
// is the same reason an `unrepresented` receipt returns the vocabulary instead of a bare failure.
//
// ── ⛔ WHAT THIS IS NOT ─────────────────────────────────────────────────────────────────────────────
// ⛔ Not a prompt change, not a classifier, not an instruction to the model. Ote: *"This belongs at
// dispatch."* The offered set is data the caller already holds; this only makes it binding.

/** The one refusal class this boundary produces. */
export const NOT_OFFERED = 'tool_not_offered'

/**
 * ⭐ May this call execute? PURE.
 *
 * @param {object} o
 * @param {string[]} o.offered  the tool names this occasion actually offered — ⛔ REQUIRED
 * @param {string} o.name       the tool the model emitted
 * @returns {null|{ok:false, refused:string, why:string, available:string[]}}
 *          `null` when the call may proceed; a REFUSAL RESULT when it may not.
 */
export function authorizeToolCall({ offered, name } = {}) {
  // ⛔ FAIL LOUDLY ON A WIRING BUG, ⛔ never open. A caller that forgets to pass its offered set would
  // otherwise re-open the exact hole this module closes, silently — and "the allowlist that was never
  // told" is this project's most-repeated defect. ⚠️ An EMPTY array is legal and means "no tools here";
  // a missing one is a mistake.
  if (!Array.isArray(offered)) {
    throw new TypeError('authorizeToolCall: `offered` must be the array of tool names this occasion offered')
  }
  const n = typeof name === 'string' ? name.trim() : ''
  if (!n) {
    return {
      ok: false,
      refused: NOT_OFFERED,
      why: 'That call named no tool, so there was nothing to run.',
      available: [...offered],
    }
  }
  if (offered.includes(n)) return null
  return {
    ok: false,
    refused: NOT_OFFERED,
    // ⭐ IT SAYS WHAT IS AVAILABLE. The measured failure was nine calls to a tool whose schema she had
    // never seen; an error that does not name the boundary teaches her to guess again.
    why: `\`${n}\` is not one of the tools available here, so it was not run. `
      + 'Nothing was written and nothing was changed.',
    available: [...offered],
  }
}

/** ⭐ Was this result a dispatch refusal? PURE — so a reader never has to match on the message text. */
export function isNotOffered(result) {
  return Boolean(result) && typeof result === 'object' && result.refused === NOT_OFFERED
}

/**
 * ⭐⭐ THE DISPATCH GENERATION — the boundary Ote asked to be able to see.
 *
 * *"Do not mix pre-fix and post-fix behavior when interpreting the Gen-2 investigation… mark the boundary
 * clearly enough that we can distinguish Gen-2 before dispatch enforcement / Gen-2 after."*
 *
 *   1 — the offered set was ADVERTISED. An unoffered call reached `runTool` and ran.
 *   2 — the offered set is ENFORCED. An unoffered call is refused before dispatch and recorded.
 *
 * ⛔ IT IS NOT `tool_generation`, and conflating them would be the error `tool_generation` exists to
 * prevent: the offered SET did not change here, only whether it binds. Three counters, three questions —
 * `prompt_generation` (what she was asked), `tool_generation` (what she was offered),
 * `dispatch_generation` (whether the offer was enforced).
 */
export const DISPATCH_GENERATION = 2
