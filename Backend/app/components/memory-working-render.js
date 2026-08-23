// ⭐⭐⭐ P5 · RENDER WHAT SHE IS HOLDING, ONCE PER ROUND, AT THE LAST DEFENSIBLE PRE-GENERATION POSITION.
//
// ── ⚠️⚠️ THE DEFECT THIS EXISTS FOR IS **POSITION**, NOT PERSUASION ────────────────────────────────
// A turn is a multi-round loop (`rounds++` to `maxRounds`). The cognition block sits in the SYSTEM message
// and a tool result is the LAST message before generation, so **cognition recedes monotonically as she
// investigates** — about three messages back at one tool call, ten at five. ⇒ ⛔ the structure PENALISED
// INVESTIGATION, which contradicts *"depth is hers"* at a level no prompt instruction can reach.
//
// ⭐ Measured: `assertsAbsence` was 5/8 with tools and 1/8 without, on the same block. ⛔ Not because the
// tool payload is more persuasive — because it is **later**.
//
// ⭐ Ote: *"every investigation round should admit the raw result into the turn-scoped cognitive hold,
// re-run cognition, and place the resulting reconciled view at the last defensible pre-generation
// position… Keep raw tool results untouched in the stream/segments/audit. The cognitive rendering is only
// the model-facing representation."*
//
// ── ⛔⛔ WHAT THIS IS **NOT**, AND EACH ONE IS A RULE HE SET ────────────────────────────────────────
//   · ⛔ NOT a re-dump of the cognition block. Ote: *"don't treat the hold as a bag of tool outputs. It
//     needs to preserve the distinction between evidence, unresolved questions, and derived current-state
//     understanding."* ⇒ the episodes stay in the system block, quoted once. What is rendered here is
//     **where she stands**, which is a different object from **what she remembers**.
//   · ⛔ NOT re-RETRIEVAL. Re-render only, from the hold. Retrieving again per round would be new evidence
//     nobody asked for, and could make two rounds of the SAME turn contradict each other.
//   · ⛔ NOT suppression, delay, dedup or a nudge toward fewer tool calls.
//   · ⛔ NOT a change to any raw payload. `write()`, `toolActivity`, `segments` and the audit are untouched.
//   · ⛔ NOT retention. Every entry it reads is already forced to `not-retained` by the hold; this module
//     writes nothing anywhere and holds no state between calls.
//
// ── ⭐ THE THREE KINDS STAY THREE KINDS ───────────────────────────────────────────────────────────
//   EVIDENCE          what a look established, bound to the population it looked at
//   OPEN QUESTIONS    a pending cognitive state — asserts nothing, so it may not move any basis
//   CURRENT STANDING  derived: what the looks did and did not change about what she can reach
// ⛔ Collapsing any two of them is the failure this module is shaped to prevent: an empty look becoming an
// absence is exactly *"nothing in X"* being read as *"nothing"*, which is the defect the whole layer exists
// for.

import { HELD, QUESTION, reconcile } from './memory-working-memory.js'
import { AVAILABILITY, BASIS } from './memory-cognition-axes.js'
import { findImplementationLeaks } from './memory-cognition-vocabulary.js'

/** ⓘ Spoken counts, matching the cognition renderer and the tool projection. One vocabulary, three surfaces. */
const WORDS = ['nothing', 'one thing', 'two things', 'three things', 'four things', 'five things',
  'six things', 'seven things', 'eight things', 'nine things', 'ten things', 'eleven things', 'twelve things']
const spoken = (n) => (n >= 0 && n < WORDS.length ? WORDS[n] : `${n} things`)
const looks = (n) => (n === 1 ? 'one look' : `${n} looks`)

/**
 * ⭐⭐⭐ THE SENTENCE THAT MUST NEVER BE LOST — the inference guard, in her voice.
 *
 * ⚠️ `combineBasis` already refuses to let N empty tool results become an attested absence. That refusal is
 * true in the data and was invisible in the prompt, so she drew the conclusion the lattice had forbidden.
 * ⇒ this states the refusal where she can read it, without telling her what to say about it.
 */
export const WHERE_NOT_IS_NOT_WHETHER =
  'That places where it is not. It does not settle whether it is.'

/**
 * Render what she is holding, as a short standing view. PURE — no I/O, no state, no clock unless given one.
 *
 * @param {{recollections?:object[], evidence?:object[], observations?:object[], questions?:object[]}} holding
 *   exactly the shape of `cognitiveHold.forReasoning()`.
 * @param {{subject?:string|null}} o
 * @returns {{text:string, kinds:{evidence:number,questions:number,recollections:number}, leaks:string[]}|null}
 *   null when there is nothing worth saying — ⛔ which is a real answer and not a failure: a round in which
 *   she looked at nothing that touches her memory must add nothing to the request.
 */
export function renderHolding(holding, { subject = null } = {}) {
  const ev = (holding?.evidence ?? []).filter(Boolean)
  const rec = (holding?.recollections ?? []).filter(Boolean)
  const qs = (holding?.questions ?? []).filter(Boolean)
  // ⛔ EVIDENCE IS THE TRIGGER. With no look this round there is nothing to reconcile, and re-stating the
  // standing view for its own sake would be the block repeated — the thing this module must not become.
  if (!ev.length) return null

  const lines = []
  const on = subject ? ` on ${subject}` : ''
  lines.push(`Where I stand${on}, having looked:`)

  // ── 1 · THE LOOKS · each bound to the population it covered, never merged into a single total ──────
  // ⚠️ A merged total is the same error as a count without an extent: "four things" across four different
  // populations is not a fact about any of them.
  for (const e of ev) {
    const where = e.scope ?? null
    const n = Number.isFinite(e.found) ? e.found : null
    if (!where) continue
    // ⭐ NAME WHAT THE LOOK WAS FOR when it is known. Measured live without it: *"I looked in the things I
    // have kept — one thing there. I looked in the things I have kept — two things there."* — two honest
    // looks reading as a contradiction, because the request that separated them was not shown.
    const forWhat = typeof e.about === 'string' && e.about.trim() ? ` for ${e.about.trim()}` : ''
    lines.push(n === null
      ? `- I looked in ${where}${forWhat}.`
      : `- I looked in ${where}${forWhat} — ${spoken(n)} there.`)
  }

  // ── 2 · CURRENT STANDING · derived, and it says what the looking did to what she can reach ────────
  const total = ev.reduce((s, e) => s + (Number.isFinite(e.found) ? e.found : 0), 0)
  const allEmpty = ev.every((e) => Number.isFinite(e.found) && e.found === 0)
  const reach = rec.length
  if (reach && allEmpty) {
    // ⭐ THE CASE THE WHOLE ARC IS ABOUT. She holds recollections; every look came back empty; and without
    // this line the empty looks are the most recent thing she read.
    lines.push(`Nothing I looked in changed what I can already reach — ${spoken(reach)}, still reachable.`)
    lines.push(WHERE_NOT_IS_NOT_WHETHER)
  } else if (reach && total) {
    lines.push(`That sits alongside what I can already reach — ${spoken(reach)} — rather than replacing it.`)
  } else if (reach) {
    lines.push(`What I can already reach is unchanged: ${spoken(reach)}.`)
  } else if (allEmpty) {
    // ⛔ NO RECOLLECTIONS AND NOTHING FOUND — and this is the sentence that must not become an absence.
    lines.push(`${looks(ev.length)}, and nothing found in any of them.`)
    lines.push(WHERE_NOT_IS_NOT_WHETHER)
  } else {
    lines.push(`${spoken(total)} found across ${looks(ev.length)}, and nothing I already held to weigh it against.`)
  }

  // ── 3 · OPEN QUESTIONS · a pending state, kept separate and asserting nothing ──────────────────────
  // ⭐ `uncertain` is an ENDING, not a failure — Ote's loop is *"resolves or remains uncertain → answers"*.
  const open = qs.filter((q) => q.state === QUESTION.open)
  const unsure = qs.filter((q) => q.state === QUESTION.uncertain)
  for (const q of open) if (q.said) lines.push(`- Still open: ${q.said}`)
  for (const q of unsure) if (q.said) lines.push(`- I looked, and it is still unsettled: ${q.said}`)

  const text = lines.join('\n')
  // ⚠️ THE GUARD RUNS ON A NEW SURFACE. This is the third place a cognition rendering is produced, and a
  // term list catches only what it was told about — so the residue is RETURNED for logging rather than
  // assumed to be zero. ⛔ Never silently rewritten: this module's words are ours, so a leak here is a bug
  // in this file rather than something to paper over at the boundary.
  return {
    text,
    kinds: { evidence: ev.length, questions: qs.length, recollections: rec.length },
    leaks: findImplementationLeaks(text).map((l) => l.word),
  }
}

/**
 * ⭐⭐ WHAT THE ROUND'S LAST TOOL MESSAGE CARRIES — the tool's own result, then the standing view, labelled
 * as what it is.
 *
 * ── ⚠️⚠️ WHY THE LAST TOOL MESSAGE AND NOT A MESSAGE OF ITS OWN ────────────────────────────────────
 * A reconciliation message would need a role and every option is wrong: `user` reads as the person speaking
 * — she would attribute her own memory to them, which is precisely the Leak-2 failure (*"the summaries you
 * pasted above"*); `assistant` puts words in her mouth AND enters her own history as something she said; a
 * mid-conversation `system` message is provider-dependent and re-asserts standing authority for a
 * per-round fact.
 * ⇒ ⭐ the round's last tool message is the only slot at position n−1 with a defensible owner, and it is
 * honest as long as it is labelled: not that tool's result, but **the state after this round's looking**.
 *
 * ⛔ The tool's own result is passed through FIRST and UNCHANGED. This appends; it never replaces.
 */
export function withStandingView(toolContent, rendered) {
  if (!rendered?.text) return toolContent
  return `${toolContent}\n\n---\n${rendered.text}`
}

/**
 * ⓘ For the debug trail. ⛔ Reports the invariant with the data, the same way `snapshot()` does — a rendering
 * of working memory that cannot be read back is a change to what she receives that cannot be attributed.
 */
export function standingSnapshot(rendered) {
  if (!rendered) return null
  return { kinds: rendered.kinds, chars: rendered.text.length, leaks: rendered.leaks }
}

/** ⓘ Re-exported so a caller need not import from two modules to read one hold. */
export { HELD, QUESTION, reconcile, AVAILABILITY, BASIS }
