// Persona Memory V3 — identity capture host (RFC_MEMORY_SLOT_RESOLVER §5/§7 · RFC_MEMORY_AS_COMPONENT §3).
//
// Phase 3 made this an ENTRY POINT. Identity travels the SAME Observation pipeline as everything else —
// the only difference is that the Resolver Router hands an `identity`-typed observation to the Identity
// Resolver instead of the semantic slot path:
//
//   text → INTERPRETATION → Normalization → Router → IdentityResolver → slot
//
// That is the payoff of the pipeline: no parallel write path, no special-case plumbing. The adoption
// policy (adopt / noop / defer) lives in the Identity Resolver; only the recognition lives here.
//
// ── STEPS 4-5 (2026-08-12): INTERPRETATION IS A MODEL, AND THE PATTERNS ARE GONE ───────────────────
//
// MEASURED 2026-08-10 across nine languages, the regex captured in ONE — English. Thai, Japanese,
// Chinese, Korean, Spanish, French and German all returned nothing, and Ote writes Thai. Step 4
// inverted the order (model first, patterns as a floor); step 5 removed the floor once the gate
// proved in Thai: `repro/identity-multilingual.mjs`, regex 1/10 → model 10/10, nothing invented.
//
// ⚠️ SO THE DEGRADATION CHANGED, DELIBERATELY: with no model reachable, identity capture now does
// NOTHING — it does not fall back to guessing from English sentence shapes. That is the trade the RFC
// argued for and the measurement earned: a missed name costs one turn ("call me X" always works next
// time), while a wrong name is injected into every future turn and shown to the user as a fact about
// themselves. Two interpreters with different rules, where the weaker one only speaks when the stronger
// is silent, means the fuzzy guess runs exactly when you would least want it to.
//
// Fire-and-forget, off the hot path — never blocks or breaks a reply. Identity owns its own slot
// (reconcileFact excludes IDENTITY_NAMESPACE), so it runs independently of the generic one-writer rule:
// no race with the model's memory writes. The runtime owns identity — deterministic truth in services.

import { IDENTITY_ATTR } from '@ote/memory/cognition/memory-identity.js'
import { interpretIdentityLlm } from '@ote/memory/cognition/memory-identity-llm.js'
import { buildMemoryPipeline } from './memory-pipeline-host.js'
import { OBSERVATION_TYPE } from '@ote/memory/cognition/memory-observation.js'
import { makeAuxLlm, extractModel } from './memory-aux-llm-host.js'
import { askInteraction, hasLiveWaiter } from '../interaction/service.js'
import { getSetting } from '../settings/index.js'

export function identityEnabled(config) {
  try { return getSetting(config, 'memory.identityEnabled') !== false } catch { return true }
}
export function identityLlmEnabled(config) {
  try { return getSetting(config, 'memory.identityLlm') !== false } catch { return true }
}

/**
 * Which model interprets the naming act. Empty setting = FOLLOW memory.extractModel, resolved HERE at
 * read time rather than as a config-default chain — a chain reads config.json and cannot see a DB
 * override, which is how the episode distiller once ran gemma while extraction ran qwen.
 */
export function identityModel(config) {
  try { return getSetting(config, 'memory.identityModel') || extractModel(config) } catch { return extractModel(config) }
}

/**
 * identityInterpreter — recognition as an INTERPRETATION-stage interpreter: raw turn → a typed identity
 * Observation (or nothing). It only PERCEIVES; the pipeline resolves and persists.
 *
 * ONE interpreter now (step 5). Disabled, unreachable, or unsure all produce the same thing: NOTHING.
 * Silence is a legitimate answer here — it is what "I did not learn a name this turn" looks like, and
 * it is strictly better than the alternative that shipped for six weeks.
 */
export function identityInterpreter(fastify, { source = null, userId = null, requireCue = true, llm: injected } = {}) {
  // The SWITCH is authoritative and the injection only replaces HOW the model is reached — so passing an
  // `llm` cannot turn identity interpretation back on behind memory.identityLlm=false. (`injected` is a
  // seam, not a back door: ESM exports are read-only live bindings, so a test cannot substitute `chat()`
  // by mocking the module, and a seam that only exists in tests would not be the code path that ships.)
  const useLlm = fastify && identityLlmEnabled(fastify.config)
  const llm = !useLlm
    ? null
    : (injected !== undefined
      ? injected
      // 200 tokens: the reply is one small JSON object. Extraction's 400 buys nothing here and a smaller
      // budget is a smaller stall if this ever lands on a busy aux model.
      : makeAuxLlm(fastify, { modelId: identityModel(fastify.config), maxTokens: 200, userId }))

  return async (text) => {
    if (!llm) return null // memory.identityLlm is off — nothing interprets, and nothing guesses
    const o = await interpretIdentityLlm({
      llm,
      text,
      requireCue,
      // A turn NOT interpreted is logged with WHY. "no cue" (never asked), "no act" (asked, the model
      // said no) and "llm-failed" (asked, nothing came back) are three different facts about the same
      // silence, and only the third is a problem — which is invisible if they all log as nothing.
      onSkip: ({ reason, detail }) => fastify.log?.debug?.({ reason, detail }, 'memory.identity: turn not interpreted'),
    })
    if (!o) return null
    // ── ⭐⭐⭐ THE ACT'S CERTAINTY IS NOT THE BELIEF'S CONFIDENCE (decision C, 2026-08-26) ────────────
    //
    // ⚠️⚠️ MEASURED ACROSS ALL 92 ROWS. Set `preferred_name` aside and confidence takes FOUR values in
    // the whole store, every one a per-writer constant. The `preferred_name` rows hold **every varying
    // value there is** — 0.98, 0.99, 0.95, 0.9 — and every one of them came through this line.
    //
    // ⛔ AND IT ANSWERS A DIFFERENT QUESTION THAN THE COLUMN CLAIMS. The interpreter reports how sure it
    // is that **a naming act occurred**; `confidence` means how much the stored belief may be trusted.
    // The two come apart exactly where it matters: two rows are live at **0.99** and **0.95** whose
    // captured value is a whole sentence, not a name. The interpreter was right that something
    // naming-shaped happened and the value is still wrong — ⭐ which is *"did he say these words?"* vs
    // *"did he mean them as a fact?"* in a second subsystem.
    //
    // ⇒ Ote: *"fix what confidence actually means going forward rather than pretending the existing
    // numbers have more semantic resolution than they do."* ⭐ So the number is CARRIED, as a property of
    // the ACT, where a reader can see what it is — and it no longer becomes the belief's confidence.
    // ⛔ Existing rows are NOT migrated: they honestly record what this line used to do.
    //
    // ⚠️ Checked before changing it: nothing thresholds on `obs.confidence`. The identity resolver reads
    // it in exactly two places — it passes it to `setIdentity` and it logs it — so adoption is decided
    // by the ACT and the ask policy, never by this number. New rows land `confidence: null`, which is
    // "unscored", and is a truer statement than 0.99 was.
    const { confidence: actCertainty, ...obs } = o
    return {
      ...obs,
      type: OBSERVATION_TYPE.identity,
      source,
      context: { matched: o.matched, via: o.via, actCertainty: actCertainty ?? null },
    }
  }
}

// ── THE ASK (RFC step 5) ─────────────────────────────────────────────────────────────────────────
//
// The component asks a DOMAIN question — *"they have said Y, I hold X, which is it?"* — and this is
// where that becomes a real question in front of a real person. Ote chose the mechanism:
// HumanInteraction's held turn, *"(a), with (c) as the floor underneath it either way"*.
//
// ⚠️ THIS IS THE FIRST RUNTIME-INITIATED INTERACTION. Every ask until now came from the MODEL calling
// `ask_user` inside its own turn, and HumanInteraction says outright that it "does NOT decide WHEN to
// ask (the model does)". That still holds — nothing here decides to ask; the deterministic gate does,
// and only in the one case where staying silent would mean overwriting a name she was given. The
// mechanics work unchanged because `askInteraction` was never model-specific: it persists a session,
// emits the protocol, and holds a PROMISE. The model's held turn is one caller of that; the identity
// capture task — already fire-and-forget, already off the hot path — is another.
//
// The consequence to know: the question arrives AFTER her reply has streamed, not inside it. That is
// honest about what happened (she noticed while filing the turn away), and the protocol already has the
// vocabulary for it — `interaction.waiting` exists precisely so a question cannot be missed.
const ASK_TIMEOUT_NOTE = 'no answer = keep the current name'

function identityQuestion({ attribute, from, to }) {
  // Only the name slot is produced today; the other two are worded so a future producer is not a bug.
  const what = attribute === IDENTITY_ATTR.pronouns ? 'pronouns'
    : attribute === IDENTITY_ATTR.title ? 'title'
      : 'name'
  return {
    questions: [{
      question: `You've just given your ${what} as "${to}", but I have you as "${from}". Which should I use?`,
      header: `Your ${what}`,
      // `to` first: it is what they just said, so it is the likelier answer and the shorter reach.
      options: [
        { label: to, description: 'What you just said — I will use this from now on.' },
        { label: from, description: 'Keep what I have — leave it unchanged.' },
      ],
      allowCustom: true, // "actually, call me something else entirely" is a real answer, not an error
    }],
  }
}

/**
 * makeIdentityAsk — the `ask` port for the Identity Resolver, or NULL when there is nobody to ask.
 *
 * Returning null is not a failure path, it is the honest one: the resolver's documented degradation
 * with no ask port is DEFER — keep the name she has, change nothing. Every guard below therefore
 * chooses "do not ask" over "ask badly", and none of them can turn into "assume".
 */
export function makeIdentityAsk(fastify, { user = null, conversationId = null, interactive = true } = {}) {
  // No conversation = nowhere to render a question. No human = nobody to read it (the same headless
  // gate ask_user uses: an internal side-call must never hang waiting on someone who is not there).
  if (!conversationId || !interactive || !user?.id) return null

  // ── ⭐⭐⭐ AND THE SWITCH, BECAUSE THE ASK IS FIRING ON BAD INPUT ─────────────────────────────────
  //
  // Ote, 2026-08-26: *"every time other entity use my room to talk to sotera, the ask question to change
  // display name always pop up, make it so it not please."*
  //
  // ⚠️⚠️ THE ASK IS NOT THE DEFECT; IT IS THE SYMPTOM, AND THE MEASUREMENT SAYS SO. The interpreter reads
  // the naming act out of **whoever typed the turn** and writes it as the **ROOM ACCOUNT HOLDER's** name.
  // So when someone else speaks through his room, their self-introduction arrives as a proposal to rename
  // HIM — and the replacement gate does exactly what it was built to do: it asks. Every time.
  // ⭐ Measured in the live store the same day: root's room holds `preferred_name = "Cogito"` (from a
  // relayed *"I'm Cogito. I'm your uncle."*), agent_dev's holds `"i just be here temporary"`, and
  // hermes' holds an entire Thai sentence. ⇒ person ≠ account ≠ room, collapsed into one slot.
  //
  // ⛔ SO THIS SWITCH SILENCES A PROMPT; IT DOES NOT FIX ANYTHING. The speaker/account confusion is an
  // OteRM boundary problem and is recorded as one. Naming the switch `identityAsk` rather than something
  // reassuring keeps that honest.
  //
  // ⭐ OFF LANDS ON A PATH THAT ALREADY EXISTS AND IS ALREADY TESTED: returning null is the resolver's
  // documented degradation — *no ask port → DEFER: keep the name she has, change nothing.* ⛔ It is not a
  // new branch, and it can never become "assume": adoption into an EMPTY slot is untouched.
  try { if (getSetting(fastify.config, 'memory.identityAsk') === false) return null } catch { /* unregistered = ask */ }

  return async ({ attribute, from, to }) => {
    // ONE QUESTION AT A TIME PER CONVERSATION. `findPending` returns a single row, so a second card
    // would make the first unreachable — and being asked two things at once about a turn you already
    // got an answer to is worse than not being asked at all. The model's ask always wins: it is
    // holding a live turn, this is not.
    if (hasLiveWaiter(conversationId)) {
      fastify.log?.info?.({ conversationId, from, to }, 'memory.identity: a question is already open — not stacking a second')
      return { adopt: false }
    }
    const out = await askInteraction(fastify, user, conversationId, identityQuestion({ attribute, from, to }))
    if (out?.error || out?.status !== 'answered') {
      fastify.log?.info?.({ status: out?.status, err: out?.error, from, to }, `memory.identity: ${ASK_TIMEOUT_NOTE}`)
    }
    return interpretAskAnswer(out, from)
  }
}

/**
 * interpretAskAnswer — a human's answer → the resolver's `{ adopt, value }`. PURE, and exported
 * because this is the step where a misread would RENAME HIM: it turns a click into a write.
 *
 * Reads the SELECTION, never the prose. `askInteraction().result` is a sentence written for a MODEL to
 * read; recovering a value from it would be inventing a protocol out of English.
 *
 * Everything that is not an unambiguous "use this instead" resolves to `{ adopt: false }` — skipped,
 * timed out, errored, empty, or choosing the name already held. Not answering is not permission
 * (HumanInteraction's own rule, and identity is exactly the permission-shaped case it was written for).
 */
export function interpretAskAnswer(out, from) {
  if (!out || out.error || out.status !== 'answered') return { adopt: false }
  const a = out.response?.answers?.[0]
  const picked = String(out.response?.freeText ?? a?.custom ?? a?.selected?.[0] ?? '').trim()
  if (!picked) return { adopt: false }
  // Choosing the value already held is a real answer and it means "leave it alone" — reporting that as
  // an adoption would write a row that changes nothing and log a change that never happened.
  if (picked.toLowerCase() === String(from ?? '').trim().toLowerCase()) return { adopt: false }
  return { adopt: true, value: picked }
}

/**
 * captureIdentity — interpret one user turn and let the pipeline adopt/defer identity. Fire-and-forget:
 * returns a small summary but is safe to ignore; swallows all errors. Skips when identity capture is
 * disabled or there is no user to scope to (root/anonymous — their name is config/username-driven).
 *
 * @param {{requireCue?:boolean}} [opts.requireCue]  false = interpret even with no naming cue in the
 *   turn. For the ASK's held turn (step 5): when SHE asked "what should I call you?", the answer is an
 *   answer — "โอต" alone carries no cue and would otherwise never be read.
 * @param {object} [scope.user]  the authenticated user, needed to ASK (a question has an owner)
 * @param {string} [scope.conversationId]  where a question would be shown; absent ⇒ no ask, just defer
 * @param {boolean} [scope.interactive]  false for internal side-calls — nobody is watching, never hold
 * @returns {Promise<{skipped?:true, identity?:boolean, action?:string, value?:string, from?:string, to?:string, error?:true}>}
 */
export async function captureIdentity(fastify, { userId = null, persona, sourceMessageId = null, user = null, conversationId = null, interactive = true } = {}, text, { source = null, requireCue = true } = {}) {
  if (!identityEnabled(fastify.config) || !userId || !text || !String(text).trim()) return { skipped: true }
  try {
    const ask = makeIdentityAsk(fastify, { user: user ?? (userId ? { id: userId } : null), conversationId, interactive })
    const { pipeline } = buildMemoryPipeline(fastify, { userId, persona, sourceMessageId, ask })
    const { results } = await pipeline.observe(text, [identityInterpreter(fastify, { source, userId, requireCue })])
    const r = results[0]
    if (!r) return { identity: false } // nothing name-like in this turn
    if (!r.ok) return { error: true }
    const { ok: _ok, ...outcome } = r.result || {} // the resolver's verdict: action + value/from/to
    return { identity: true, ...outcome, via: r.observation?.context?.via ?? null }
  } catch (e) {
    try { fastify.log?.warn?.({ err: e?.message }, 'memory.identity: capture failed (best-effort)') } catch { /* no logger */ }
    return { error: true }
  }
}
